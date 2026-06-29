/**
 * selfPlayRunner.js — a THIN wrapper around the already-existing headless game
 * loop, for offline self-play stress testing.
 *
 * WHAT THIS IS (and is NOT): the full-game auto-pilot already exists. At Expert
 * difficulty `advanceUntilDecision(session)` drives BOTH (all) seats to a terminal
 * `game-over` decision (or an honest `engine-stuck` / `dispatch-error`) in a single
 * call — no UI, no network, fully offline. This module does NOT re-implement the
 * engine, the AI, or win-detection. It only:
 *   1. builds an Expert session from two (or four) already-enriched decks,
 *   2. runs it to termination,
 *   3. returns the outcome + the raw `state.log` so breakageReport.js can mine the
 *      HONEST breakage signals the engine recorded.
 *
 * The engine itself never calls Ollama or the network at runtime, so a batch of
 * thousands of self-play games runs entirely offline — exactly the local-first
 * mandate. Decks must already be enriched (the route/CLI calls enrichDeck before
 * handing decks here); a blank deck plays blank cards, which is the honest fail
 * mode, never fabricated behaviour.
 *
 * REPEAT VARIETY (seeded shuffle): a single game with no `seed` is deterministic
 * per pairing (deck-list order — useful for an exact reproduction). runSelfPlayBatch
 * passes a DISTINCT seed per game (baseSeed + a per-game counter), so gamesPer>1
 * produces genuinely different opening draws and game lines — real repeat coverage,
 * the "most data" enabler for the Sim Center / learn-to-play. A fixed baseSeed keeps
 * the whole batch reproducible run-to-run (same baseSeed ⇒ same set of games).
 */

import { createLearnSession, advanceUntilDecision } from "./learnSession.js";
import { featurizeState } from "./gameFeatures.js";
import { gameStatus } from "./gameApi.js";

/**
 * Map a terminal self-play `result` token to a per-seat VALUE LABEL for the value-
 * function training substrate: the WINNER's seat gets 1, a loser 0, a draw/turn-limit
 * 0.5 for every seat (no winner, no loser). `seatId` is the engine seat ("user" |
 * "ai" | "ai1".."ai3"); `result` is runSelfPlayGame's mapped result.
 *
 * Honest by construction: only "user-wins"/"ai-wins" produce a 1, and ONLY for the
 * seat that actually won — a real draw/turn-limit (no clock) is 0.5, and everything
 * else returns null so those rows are DROPPED rather than mislabeled. That null set
 * includes `timeout`: a time-pressure game that still hit the cap is an HONEST
 * non-result — we never fabricate a W/L (or even a 0.5) from a stall, the exact label
 * noise this work removes. Non-completions (engine-stuck/dispatch-error/setup-error)
 * are null for the same reason (you can't learn "who won" from a game that never
 * finished). Standard maps user→"user", ai→"ai"; Commander's winning seat is "user"
 * for a user-wins and — since the engine reports a pod win as the surviving seat via
 * status — currently only distinguishes the user seat vs the rest (a finer per-ai-seat
 * winner label is a follow-up noted in the recorder docs).
 */
export function outcomeLabelForSeat(seatId, result) {
  if (result === "user-wins") return seatId === "user" ? 1 : 0;
  if (result === "ai-wins") return seatId === "user" ? 0 : 1;
  if (result === "draw" || result === "turn-limit") return 0.5;
  // timeout / engine-stuck / dispatch-error / setup-error / unexpected → don't fabricate a label
  return null;
}

/**
 * Run ONE self-play game between two enriched decks (Standard 1v1) and return a
 * compact, fully-serialisable result.
 *
 * @param {object} args
 * @param {Array}  args.deckA      enriched user deck (card[])
 * @param {Array}  args.deckB      enriched opponent deck (card[]) — Standard only
 * @param {Array}  [args.opponentDecks]  enriched 3-deck pod (Commander only)
 * @param {Array}  [args.userCommanders]      user's commander card(s)
 * @param {Array}  [args.opponentCommanders]  opponent commander(s): card[] (Standard)
 *                                            or [card[],card[],card[]] (Commander)
 * @param {string} [args.mode]     "standard" | "commander" (default "standard")
 * @param {object} [args.meta]     identity passthrough (deck names/ids) for reports
 * @param {boolean} [args.recordTrajectory]  OPT-IN (default false): also capture a
 *   per-turn, per-seat feature trajectory for value-function training. OFF by default
 *   so normal runs are byte-identical. When true, the result gains a `trajectory`
 *   field (see the @returns trajectory shape).
 * @param {number} [args.seed]  OPT-IN seeded opening shuffle. Omitted (default) ⇒
 *   deck-list order (every replay of a pairing is identical). Provided ⇒ each seat's
 *   library is shuffled deterministically (same seed ⇒ same game, reproducible;
 *   different seeds ⇒ different game). runSelfPlayBatch passes a distinct seed per
 *   game so gamesPer>1 yields genuinely different games (real repeat coverage).
 * @param {boolean|object} [args.timePressure]  OPT-IN self-play "game clock" (default
 *   true here — self-play WANTS decisive endings; see below). When on, a symmetric,
 *   deterministic per-turn life drain past a soft cap forces stalling games to end W/L
 *   instead of drifting to the turn cap as a DRAW, and a hard-cap game falls back to a
 *   fair metric tiebreak (life → board power → card advantage). NOT a Magic rule — a
 *   training mechanism only. Pass false to disable (recover the old draw-at-cap behavior),
 *   or an object to override { softCapTurn, lifeLossStep }. The DRAW it removes is the
 *   useless-label outcome (0.5 for every seat) the value-function recorder can't learn from.
 * @param {object} [args.pilots]  THE EXTERNAL-DECIDE ADAPTER POINT (Learn-to-Play item #3).
 *   A `{ [seatId]: { decide, playbook?, temperament? } }` map. For the seat whose turn it
 *   is, that seat's `decide({ state, legalActions, seat, pilot }) -> action` is called at
 *   every enumerated choice; `playbook`/`temperament` are recorded as the pilot identity.
 *   Omnath's `omnath-tools/pilots/decide.mjs` (NOT in this repo) is injected HERE by the
 *   caller — this module never imports it. A seat with no pilot (or no `decide`) plays the
 *   exact default autopilot (byte-identical). Default {} ⇒ every seat is the default pilot.
 * @param {boolean} [args.recordDecisions]  OPT-IN (default false): also capture the
 *   per-DECISION trajectory (one row per enumerated choice: turn, seat, pilot, features,
 *   action) — the POLICY-training substrate, distinct from the per-turn VALUE substrate
 *   `recordTrajectory` captures. When true, the result gains a `decisionTrajectory` field.
 * @returns {{ result, status, reason, turns, ticks, log, meta, trainingWeight, error?, trajectory?, decisionTrajectory? }}
 *   result — "user-wins" | "ai-wins" | "draw" | "timeout" | "engine-stuck"
 *            | "dispatch-error" | "setup-error" (the report treats stuck/error as
 *            non-completions; `timeout` is an honest, separately-counted non-result)
 *   status — the raw session.status (active/user-wins/ai-wins/draw/timeout)
 *   reason — game-over reason ("timeout" / "turn-limit" / a win condition) OR the stuck reason
 *   turns  — final turn number reached
 *   ticks  — engine ticks consumed (advanceUntilDecision loop iterations) when known
 *   log    — the raw append-only state.log (per-turn/phase keyed breakage signals)
 *   trainingWeight — 1 for a clean decisive/draw result the recorder should learn from;
 *            0 for a `timeout` (or any non-completion) so the trainer down-weights/excludes
 *            it. A timeout is honestly a timeout, never a fabricated W/L.
 *   trajectory (only when recordTrajectory) — {
 *       mode, result,
 *       seats: [ { seat, outcome, rows: [ { turn, features } ] } ]
 *     } — one row per (seat, turn boundary); `features` is a featurizeState object,
 *     `outcome` is that seat's eventual value label (1 win / 0 loss / 0.5 draw).
 *   decisionTrajectory (only when recordDecisions) — {
 *       mode, result, winnerSeat, trainingWeight,
 *       rows: [ { turn, seat, pilot:{playbook,temperament}, features, action } ]
 *     } — one row per ENUMERATED DECISION (the policy substrate): the state features +
 *     the chosen action + which pilot chose it. `winnerSeat`/`result`/`trainingWeight`
 *     are the final game outcome (trainingWeight 0 for a timeout/non-completion). Actions
 *     serialize stably (plain JSON, no engine handle); append-only, no circular refs.
 */
export function runSelfPlayGame({
  deckA,
  deckB,
  opponentDecks = null,
  userCommanders = [],
  opponentCommanders = [],
  userCompanion = null,
  opponentCompanions = null,
  mode = "standard",
  meta = {},
  recordTrajectory = false,
  seed = null,
  timePressure = false, // default OFF here (a single game is byte-identical); runSelfPlayBatch turns it ON.
  pilots = {}, // EXTERNAL-DECIDE ADAPTER: { [seatId]: { decide, playbook?, temperament? } }; {} ⇒ all-default play.
  recordDecisions = false, // opt-in per-DECISION (policy) trajectory; default OFF ⇒ byte-identical.
} = {}) {
  // Build the Expert session. createLearnSession validates deck shape and throws
  // on bad input; we surface that as a `setup-error` result rather than letting it
  // abort an entire batch — one un-runnable pairing must not kill the run.
  let session;
  try {
    session = createLearnSession({
      userDeck: deckA,
      opponentDeck: mode === "commander" ? undefined : deckB,
      opponentDecks: mode === "commander" ? opponentDecks : null,
      userCommanders,
      opponentCommanders,
      userCompanion,
      opponentCompanions,
      difficulty: "expert",
      mode,
      seed,
    });
  } catch (error) {
    return {
      result: "setup-error",
      status: "setup-error",
      reason: error?.message || "createLearnSession threw",
      turns: 0,
      ticks: 0,
      log: [],
      meta,
      trainingWeight: 0, // a non-completion is never a learnable row
      error: error?.message || String(error),
    };
  }

  // Trajectory capture (opt-in). When recording, we snapshot features for EVERY seat
  // at each turn boundary via the engine's read-only onTurnStart observer — the engine
  // is NOT modified (the observer hook is a default-off param) and runs to termination
  // exactly as normal; we only read state. Seats come from state.turnOrder so both
  // Standard (user/ai) and Commander (user/ai1..ai3) are covered. The {seat: rows[]}
  // map is filled during the game, then labeled with each seat's outcome afterward.
  const seatRows = new Map(); // seatId → [{ turn, features }]
  const onTurnStart = recordTrajectory
    ? (state, turnNumber) => {
        const seats = state.turnOrder || Object.keys(state.players || {});
        for (const seat of seats) {
          if (!seatRows.has(seat)) seatRows.set(seat, []);
          // featurizeState is pure (reads state, mutates nothing) — safe inside the
          // read-only observer. One row per (seat, turn) = one (features → win) pair.
          seatRows.get(seat).push({ turn: turnNumber, features: featurizeState(state, seat) });
        }
      }
    : null;

  // ── Pluggable per-seat pilots + per-DECISION trajectory ──────────────────────
  //
  // THE ADAPTER POINT: `pilots[seat].decide` is the external pilot for that seat (Omnath's
  // omnath-tools/pilots/decide.mjs is injected via this `pilots` map — never imported here).
  // advanceUntilDecision takes ONE `decide`; we hand it a thin router that, given the seat
  // whose turn it is, calls THAT seat's pilot. A seat with no pilot (or no .decide) returns
  // undefined ⇒ advanceUntilDecision falls back to the default autopilot pick (byte-identical
  // for that seat). When NO seat has a pilot we pass no `decide` at all, so play is fully
  // byte-identical to the pre-refactor loop.
  const hasAnyPilot = pilots && Object.values(pilots).some((p) => typeof p?.decide === "function");
  const pilotIdentity = (seat) => {
    const p = pilots?.[seat];
    return p ? { playbook: p.playbook ?? null, temperament: p.temperament ?? null } : null;
  };
  const routedDecide = hasAnyPilot
    ? ({ state, legalActions, seat }) => {
        const p = pilots?.[seat];
        if (typeof p?.decide !== "function") return undefined; // no pilot for this seat → default pick
        return p.decide({ state, legalActions, seat, pilot: pilotIdentity(seat) });
      }
    : null;

  // Per-decision (policy) trajectory: one row per enumerated choice. The recorder gets the
  // seat, so it stamps the PER-SEAT pilot identity (advanceUntilDecision's single `pilot`
  // param can't carry per-seat identity). PURE + append-only; the action is already a stable
  // serialized descriptor by the time it reaches here (resolveDecideAction serialized it).
  const decisionRows = [];
  const recordDecision = recordDecisions
    ? (row) => {
        decisionRows.push({
          turn: row.turn,
          seat: row.seat,
          pilot: pilotIdentity(row.seat), // per-seat identity (null when that seat is the default pilot)
          features: row.features,
          action: row.action,
        });
      }
    : null;

  // Assemble the opt-in driver options. Every default-off knob (the per-turn observer, the
  // time-pressure clock, the pluggable decide, and the per-decision recorder) is passed only
  // when requested; when none are set the object is `{}` and advanceUntilDecision behaves
  // byte-identically to its bare form.
  const advanceOpts = {};
  if (recordTrajectory) advanceOpts.onTurnStart = onTurnStart;
  if (timePressure) advanceOpts.timePressure = timePressure;
  if (routedDecide) advanceOpts.decide = routedDecide;
  if (recordDecision) advanceOpts.recordDecision = recordDecision;

  // Drive to termination. advanceUntilDecision NEVER throws on engine bugs — it
  // returns a structured engine-stuck / dispatch-error decision — but we still
  // guard the call so a truly unexpected throw is reported honestly, not hidden.
  let advanced;
  try {
    advanced = advanceUntilDecision(session, advanceOpts);
  } catch (error) {
    return {
      result: "dispatch-error",
      status: session.status,
      reason: error?.message || "advanceUntilDecision threw",
      turns: session.state?.turn ?? 0,
      ticks: 0,
      log: session.state?.log || [],
      meta,
      trainingWeight: 0, // a non-completion is never a learnable row
      error: error?.message || String(error),
    };
  }

  const { session: out, decision } = advanced;
  const log = out.state?.log || [];
  const turns = out.state?.turn ?? 0;
  const ticks = decision?.ticks ?? null;

  // Map the terminal decision to a single result token. game-over → the win-detection
  // status (user-wins/ai-wins/draw, or timeout when the opt-in clock was on and the game
  // still hit the cap). Anything else is a non-completion we report HONESTLY (never
  // silently coerced to a draw): engine-stuck or dispatch-error.
  let result;
  if (decision.kind === "game-over") {
    result = out.status; // user-wins | ai-wins | draw | timeout
  } else if (decision.kind === "engine-stuck") {
    result = "engine-stuck";
  } else if (decision.kind === "dispatch-error") {
    result = "dispatch-error";
  } else {
    // A non-terminal decision (e.g. "ask") should be impossible at Expert (the
    // autopilot never stops for a user choice). If it ever happens, report it
    // verbatim rather than guessing an outcome.
    result = `unexpected:${decision.kind}`;
  }

  // trainingWeight: 1 for a clean, learnable result (a decisive W/L or a real draw); 0 for
  // a `timeout` (the clock ran out — an honest non-result, never a fabricated W/L) and for
  // any non-completion. The recorder/trainer uses this to down-weight or exclude rows it
  // can't honestly label, so a stall never pollutes the value-function data.
  const isCleanResult = result === "user-wins" || result === "ai-wins" || result === "draw";
  const trainingWeight = isCleanResult ? 1 : 0;

  const base = {
    result,
    status: out.status,
    reason: decision.reason ?? null,
    turns,
    ticks,
    log,
    meta,
    trainingWeight,
  };

  // Per-DECISION (policy) trajectory (opt-in, independent of recordTrajectory). Attach the
  // full row list + the FINAL game outcome the task specifies: { result, winnerSeat,
  // trainingWeight }. winnerSeat comes from the SAME gameStatus the play-API exposes (so it
  // can't drift); it's null on a draw/timeout/non-completion. trainingWeight is 0 for a
  // timeout/non-completion — a forced-timeout game yields rows with weight 0, never a
  // fabricated W/L. Rows are append-only with stably-serialized actions (no engine handle).
  if (recordDecisions) {
    const winnerSeat = (() => {
      try {
        return gameStatus(out.state)?.winnerSeat ?? null;
      } catch {
        return null; // a non-terminal/edge state ⇒ no winner; never a throw that aborts the run
      }
    })();
    base.decisionTrajectory = { mode, result, winnerSeat, trainingWeight, rows: decisionRows };
  }

  if (!recordTrajectory) return base;

  // Label every captured row with its seat's EVENTUAL outcome (honest value target:
  // 1 won / 0 lost / 0.5 draw). A turn-limit draw is read off `reason` so it labels 0.5
  // rather than null. A `timeout` (the opt-in clock ran out) and any non-completion
  // (engine-stuck/dispatch-error) yield a null label for every seat → those rows carry
  // outcome:null so a consumer drops the game instead of training on a fabricated W/L.
  // (trainingWeight:0 on the game is the coarse-grained version of the same signal.)
  const labelResult = result === "draw" && base.reason === "turn-limit" ? "turn-limit" : result;
  const seats = [];
  for (const [seat, rows] of seatRows.entries()) {
    seats.push({ seat, outcome: outcomeLabelForSeat(seat, labelResult), rows });
  }

  return {
    ...base,
    trajectory: { mode, result, reason: base.reason, seats },
  };
}

/**
 * Build the list of game pairings for a batch over N decks.
 *
 * PAIRING SCHEME (documented per CREED):
 *  - Commander (default for these 13 commander decks): build 4-player PODS. Decks
 *    are chunked into consecutive groups of 4 (deck[0..3], deck[4..7], ...). The
 *    first deck in each pod is the "user" seat, the other three are the opponents.
 *    A trailing remainder of <4 decks is wrapped with the earliest decks to fill a
 *    full pod, so EVERY deck plays at least once and no pod is short (Commander
 *    requires exactly 3 opponents). This keeps the batch O(decks) — a stress sweep,
 *    not an exhaustive tournament.
 *  - Standard: all distinct head-to-head pairs (i<j), O(n^2). Used when mode !==
 *    "commander".
 *
 * Returns an array of pairing descriptors referencing deck INDICES (resolved to
 * enriched decks by the caller). Pure.
 */
export function buildPairings(deckCount, mode = "commander") {
  const pairings = [];
  if (deckCount <= 0) return pairings;

  if (mode === "commander") {
    if (deckCount < 4) {
      // Fewer than a full pod: a single pod padded by wrapping around the deck list
      // (a deck may face itself's neighbours twice — acceptable for a smoke sweep,
      // and flagged so the report can note the pad).
      const idx = [];
      for (let i = 0; i < 4; i++) idx.push(i % deckCount);
      pairings.push({ mode, seats: idx, padded: true });
      return pairings;
    }
    for (let start = 0; start < deckCount; start += 4) {
      const seats = [];
      let padded = false;
      for (let k = 0; k < 4; k++) {
        let i = start + k;
        if (i >= deckCount) {
          i = (start + k) % deckCount; // wrap to fill the trailing pod
          padded = true;
        }
        seats.push(i);
      }
      pairings.push({ mode, seats, padded });
    }
    return pairings;
  }

  // Standard: every distinct ordered-once pair.
  for (let i = 0; i < deckCount; i++) {
    for (let j = i + 1; j < deckCount; j++) {
      pairings.push({ mode, seats: [i, j], padded: false });
    }
  }
  return pairings;
}

/**
 * Run a full self-play batch over a list of enriched decks.
 *
 * @param {Array<object>} deckList  each entry: {
 *     id, name, cards: card[] (enriched mainboard), commanders?: card[],
 *     companion?: card|null
 *   }
 * @param {object} [opts]
 * @param {string} [opts.mode]      "commander" | "standard" (default "commander")
 * @param {number} [opts.gamesPer]  repeat each pairing this many times (default 1).
 *     Each repeat gets a DISTINCT shuffle seed (baseSeed + a per-game counter), so
 *     gamesPer>1 yields genuinely different games — real repeat coverage, not the
 *     fake-identical repeats the old cap guarded against.
 * @param {number} [opts.baseSeed]  base for per-game seed derivation (default 1).
 *     Same baseSeed ⇒ the whole batch reproduces run-to-run; bump it for a fresh
 *     independent sweep over the same decks.
 * @param {boolean} [opts.record]  OPT-IN (default false): record a per-turn feature
 *     trajectory for every game (passes recordTrajectory through to runSelfPlayGame).
 *     OFF by default so existing batch behavior is unchanged. Each game's `.trajectory`
 *     is tagged with `deckIds`/`seatNames` so the writer can attribute every row.
 * @param {boolean|object} [opts.timePressure]  DEFAULT TRUE for batches — a self-play
 *     batch exists to generate clean win/loss training data, so the "game clock" is ON:
 *     a symmetric, deterministic per-turn life drain past a soft cap pulls stalling games
 *     to REAL lethal (a true W/L) instead of timing out as a useless 0.5-labeled draw. A
 *     game that still hits the cap is an honest `timeout` (trainingWeight:0, no W/L label),
 *     never a fabricated winner. Pass false to recover the old draw-at-cap behavior, or an
 *     object to override { softCapTurn, lifeLossStep }. NOT a Magic rule — a training device.
 * @param {object} [opts.pilots]  EXTERNAL-DECIDE ADAPTER (item #3): a per-SEAT
 *     `{ [seatId]: { decide, playbook?, temperament? } }` map (seatIds are the engine seats
 *     — "user", "ai" for Standard; "user","ai1","ai2","ai3" for Commander). Passed straight
 *     through to every game's runSelfPlayGame. Omnath's pilot module is injected HERE by the
 *     caller; the runner never imports it. Default {} ⇒ every seat plays the default autopilot
 *     (byte-identical). The same map applies to all pairings (positional seats are stable).
 * @param {boolean} [opts.recordDecisions]  OPT-IN (default false): record the per-DECISION
 *     (policy) trajectory for every game (passes through to runSelfPlayGame.recordDecisions).
 *     Each game's `.decisionTrajectory` is tagged with `deckIds`/`seatNames` for attribution.
 * @returns {{ games: object[], deckList: object[], mode, pairings }}
 *     games — one runSelfPlayGame result per game, each tagged with .meta
 *             { mode, deckNames, seatNames, userDeckName } and a trainingWeight
 */
export function runSelfPlayBatch(deckList, { mode = "commander", gamesPer = 1, baseSeed = 1, record = false, timePressure = true, pilots = {}, recordDecisions = false } = {}) {
  const decks = Array.isArray(deckList) ? deckList : [];
  const pairings = buildPairings(decks.length, mode);
  // Seeded shuffle makes repeats REAL: each game gets a distinct seed, so gamesPer>1
  // explores different shuffles of the same pairing instead of banking identical games.
  const repeats = Math.max(1, gamesPer | 0);

  // A monotonic per-game counter folded into baseSeed → every game in the batch gets a
  // unique, deterministic seed. Same baseSeed ⇒ the whole batch reproduces run-to-run.
  let gameIndex = 0;
  const base = (Number.isFinite(baseSeed) ? baseSeed : 1) >>> 0;

  const games = [];
  for (const pairing of pairings) {
    const seatDecks = pairing.seats.map((i) => decks[i]);
    const seatNames = seatDecks.map((d) => d?.name || d?.id || "Unknown deck");
    const seatIds = seatDecks.map((d) => d?.id || d?.name || "unknown");
    for (let r = 0; r < repeats; r++) {
      // Distinct per-game seed. The large odd stride keeps consecutive seeds far apart in
      // the mulberry32 stream so neighbouring games don't share near-identical opening draws.
      const seed = ((base + Math.imul(gameIndex, 2654435761)) >>> 0);
      gameIndex += 1;
      const meta = {
        mode,
        seatNames,
        deckNames: seatNames,
        userDeckName: seatNames[0],
        padded: !!pairing.padded,
        seed, // record the per-game seed so a specific game can be reproduced exactly
        repeat: r,
      };
      let game;
      if (mode === "commander") {
        const [userDeck, ...oppDecks] = seatDecks;
        game = runSelfPlayGame({
          deckA: userDeck?.cards || [],
          opponentDecks: oppDecks.map((d) => d?.cards || []),
          userCommanders: userDeck?.commanders || [],
          opponentCommanders: oppDecks.map((d) => d?.commanders || []),
          userCompanion: userDeck?.companion || null,
          opponentCompanions: oppDecks.map((d) => d?.companion || null),
          mode,
          meta,
          recordTrajectory: record,
          seed,
          timePressure,
          pilots,
          recordDecisions,
        });
      } else {
        const [a, b] = seatDecks;
        game = runSelfPlayGame({
          deckA: a?.cards || [],
          deckB: b?.cards || [],
          userCommanders: a?.commanders || [],
          opponentCommanders: b?.commanders || [],
          userCompanion: a?.companion || null,
          opponentCompanions: b?.companion || null,
          mode,
          meta,
          recordTrajectory: record,
          seed,
          timePressure,
          pilots,
          recordDecisions,
        });
      }
      // Attribute each trajectory to its decks so JSONL rows carry deck identity. The
      // seat order matches state.turnOrder (user first, then ai/ai1..), so seat→deck
      // is positional and stable.
      if (record && game.trajectory) {
        game.trajectory.deckIds = seatIds;
        game.trajectory.seatNames = seatNames;
      }
      // Same attribution for the per-decision (policy) trajectory: a positional seat→deck map
      // (rows already carry the seat id, so a consumer can join row.seat → deck via this map).
      if (recordDecisions && game.decisionTrajectory) {
        game.decisionTrajectory.deckIds = seatIds;
        game.decisionTrajectory.seatNames = seatNames;
      }
      games.push(game);
    }
  }

  return { games, deckList: decks, mode, pairings };
}

/**
 * Flatten a batch's recorded trajectories into JSONL — one line per (game, seat, turn)
 * = one (state-features → eventual-win) training pair. PURE (string in, string out):
 * the I/O lives in `writeTrajectoriesJsonl` so this is unit-testable without disk.
 *
 * Each line is a JSON object:
 *   { game, seat, deckId, turn, outcome, features }
 * Rows from non-completed games (outcome === null) are SKIPPED — never write a
 * fabricated win/loss label. Returns "" when there is nothing to write.
 *
 * @param {object} batch  the runSelfPlayBatch(..., { record:true }) return
 */
export function trajectoriesToJsonl(batch) {
  const lines = [];
  const games = batch?.games || [];
  for (let gi = 0; gi < games.length; gi++) {
    const traj = games[gi].trajectory;
    if (!traj || !Array.isArray(traj.seats)) continue;
    const deckIds = traj.deckIds || [];
    traj.seats.forEach((s, si) => {
      if (s.outcome == null) return; // unfinished game → drop (no honest label)
      for (const row of s.rows || []) {
        lines.push(JSON.stringify({
          game: gi,
          mode: traj.mode,
          result: traj.result,
          seat: s.seat,
          deckId: deckIds[si] ?? null,
          turn: row.turn,
          outcome: s.outcome,
          features: row.features,
        }));
      }
    });
  }
  return lines.length ? lines.join("\n") + "\n" : "";
}

/**
 * Write a recorded batch's trajectories as a JSONL file under the active profile's
 * self-play data namespace (`profilePath("self-play/trajectories")`). Atomic
 * (temp + rename on the same volume, mirroring atomicJson.js) so a crash mid-write
 * never leaves a torn file. Creates the directory if needed. Returns the absolute
 * path written, or null when there were no labeled rows to write (nothing recorded /
 * only unfinished games).
 *
 * Kept here (not in a route) so the offline CLI/self-play loop can persist training
 * data directly; the dynamic imports keep this module loadable in pure-logic tests
 * (the recorder + featurizer) that never touch the filesystem or paths registry.
 *
 * @param {object} batch       runSelfPlayBatch(..., { record:true }) return
 * @param {object} [opts]
 * @param {string} [opts.fileName]  override the output file name (default timestamped)
 * @param {string} [opts.dir]       override the output directory (tests inject a tmp dir;
 *                                  defaults to profilePath("self-play/trajectories"))
 */
export async function writeTrajectoriesJsonl(batch, { fileName = null, dir = null } = {}) {
  const body = trajectoriesToJsonl(batch);
  if (!body) return null;

  const fs = await import("node:fs/promises");
  const path = await import("node:path");

  let outDir = dir;
  if (!outDir) {
    const { profilePath } = await import("../server/paths.js");
    outDir = profilePath("self-play", "trajectories");
  }
  const name = fileName || `trajectories-${Date.now()}.jsonl`;
  const filePath = path.join(outDir, name);

  await fs.mkdir(outDir, { recursive: true });
  const tmp = `${filePath}.tmp.${process.pid}.${Date.now()}`;
  await fs.writeFile(tmp, body, "utf8");
  await fs.rename(tmp, filePath);
  return filePath;
}

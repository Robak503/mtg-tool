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

import { createLearnSession, advanceUntilDecision, isPlayerDead, hasWonGame } from "./learnSession.js";
import { featurizeState } from "./gameFeatures.js";
import { gameStatus } from "./gameApi.js";
import { decideMulliganForAI } from "./opponentAI.js";

/**
 * Map a terminal self-play `result` token to a per-seat VALUE LABEL for the value-
 * function training substrate: the WINNER's seat gets 1, a loser 0, a draw/turn-limit
 * 0.5 for every seat (no winner, no loser). `seatId` is the engine seat ("user" |
 * "ai" | "ai1".."ai3"); `result` is runSelfPlayGame's mapped result.
 *
 * DEPRECATED (HB-3): this labeler has no winner identity, so in a Commander pod an
 * "ai-wins" labeled EVERY non-user seat 1 — the two losing pod seats were recorded as
 * winners (50%+ label noise). The runner now labels by per-seat FATE via
 * outcomeLabelForSeatV2 below; this export is kept only for its Standard-shaped
 * contract (where "the rest" is exactly one seat and the mapping is correct) and for
 * back-compat with existing consumers/tests. New code must use outcomeLabelForSeatV2.
 */
export function outcomeLabelForSeat(seatId, result) {
  if (result === "user-wins") return seatId === "user" ? 1 : 0;
  if (result === "ai-wins") return seatId === "user" ? 0 : 1;
  if (result === "draw" || result === "turn-limit") return 0.5;
  // timeout / engine-stuck / dispatch-error / setup-error / unexpected → don't fabricate a label
  return null;
}

/**
 * Per-seat FATE labeler (HB-3) — the honest value target for pods.
 *
 * Label semantics (never fabricate — THE CREED):
 *   - draw / turn-limit           → 0.5 for every seat (no winner, no loser)
 *   - timeout / engine-stuck / dispatch-error / setup-error / unexpected → null
 *     for every seat (an honest non-result; rows are dropped, never mislabeled)
 *   - user-wins                   → user 1, every opponent 0 (all provably dead —
 *     gameStatus only returns user-wins when every opponent lost, CR 704.5)
 *   - ai-wins with a TRUE winner  → that seat 1, every other seat 0. A TRUE winner
 *     is a seat with the wonGame flag (CR 104.2a) OR the SOLE surviving opponent
 *     (everyone else provably lost).
 *   - ai-wins via the user's death with 2+ opponents still alive → user 0,
 *     already-eliminated opponents 0, SURVIVING opponents null: the pod never
 *     played out, so their W/L is undetermined — gameStatus's winnerSeat there is
 *     just liveOpponents[0] (an arbitrary turn-order-first survivor), and crowning
 *     it would fabricate a win + fabricate losses for the other survivors.
 *
 * `state` is the terminal game state (used for the wonGame flag + per-seat death /
 * elimination checks — a seat removed from state.players by CR 800.4a is eliminated).
 * Standard is unchanged by construction: with exactly one opponent the TRUE-winner
 * case always applies and reproduces outcomeLabelForSeat's mapping exactly.
 */
export function outcomeLabelForSeatV2({ seat, result, winnerSeat = null, state = null }) {
  if (result === "draw" || result === "turn-limit") return 0.5;
  if (result === "user-wins") return seat === "user" ? 1 : 0;
  if (result !== "ai-wins") return null; // timeout / stuck / error / unexpected → no label
  const players = state?.players || {};
  // A seat removed from the game (CR 800.4a) has no player record → eliminated.
  const eliminated = (id) => players[id] === undefined || isPlayerDead(state, id);
  const survivingOpponents = Object.keys(players).filter((id) => id !== "user" && !isPlayerDead(state, id));
  const isTrueWinner =
    winnerSeat != null &&
    (hasWonGame(state, winnerSeat) || (survivingOpponents.length === 1 && survivingOpponents[0] === winnerSeat));
  if (isTrueWinner) return seat === winnerSeat ? 1 : 0;
  // ai-wins via user death with 2+ survivors: losses only where PROVEN; survivors undetermined.
  if (seat === "user") return 0;
  return eliminated(seat) ? 0 : null;
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
 * @param {string} [args.startSeat]  OPT-IN: which engine seat is ON THE PLAY (the
 *   first turn, skipping its first draw per CR 103.8a). Omitted/null (default) ⇒ "user"
 *   is on the play — BYTE-IDENTICAL to the pre-slice engine (Academy / human play / the
 *   whole corpus rely on user-first). Provided ⇒ that seat is stamped as state.activePlayer,
 *   so startGame stamps it as startingPlayer and the CR 103.8a first-turn draw-skip follows
 *   it automatically (the engine keys the skip off state.startingPlayer, not a hardcoded
 *   "user"). The seat must be a real engine seat for the mode ("user"/"ai" for Standard;
 *   "user"/"ai1"/"ai2"/"ai3" for Commander); an unknown id falls through to createLearnSession's
 *   validation. Turn order is unchanged (it wraps from whichever seat starts), and win-detection
 *   is seat-identity based, so the result token still names which DECK won regardless of who
 *   was on the play. runSelfPlayBatch rotates this across a batch (balanced positions).
 * @param {boolean|object} [args.timePressure]  OPT-IN self-play "game clock" (default
 *   true here — self-play WANTS decisive endings; see below). When on, a symmetric,
 *   deterministic per-turn life drain past a soft cap forces stalling games to end W/L
 *   instead of drifting to the turn cap as a DRAW, and a hard-cap game falls back to a
 *   fair metric tiebreak (life → board power → card advantage). NOT a Magic rule — a
 *   training mechanism only. Pass false to disable (recover the old draw-at-cap behavior),
 *   or an object to override { softCapTurn, lifeLossStep }. The DRAW it removes is the
 *   useless-label outcome (0.5 for every seat) the value-function recorder can't learn from.
 * @param {object} [args.pilots]  THE EXTERNAL-DECIDE ADAPTER POINT (Learn-to-Play item #3).
 *   A `{ [seatId]: { decide, decideMulligan?, playbook?, temperament? } }` map. For the seat
 *   whose turn it is, that seat's `decide({ state, legalActions, seat, pilot }) -> action` is
 *   called at every enumerated choice; `playbook`/`temperament` are recorded as the pilot
 *   identity. A seat's optional `decideMulligan({ state, legalActions, seat, pilot }) -> action`
 *   (legalActions = [{kind:"mulligan-keep"},{kind:"mulligan-ship"}]) drives that seat's PRE-GAME
 *   London mulligan (CR 103.5); a seat with no `decideMulligan` keeps its opening 7 (the default,
 *   byte-identical). Omnath's `omnath-tools/pilots/decide.mjs` (NOT in this repo) is injected HERE
 *   by the caller — this module never imports it. A seat with no pilot (or no `decide`) plays the
 *   exact default autopilot (byte-identical). Default {} ⇒ every seat is the default pilot.
 * @param {boolean} [args.recordDecisions]  OPT-IN (default false): also capture the
 *   per-DECISION trajectory (one row per enumerated choice: turn, seat, pilot, features,
 *   action) — the POLICY-training substrate, distinct from the per-turn VALUE substrate
 *   `recordTrajectory` captures. When true, the result gains a `decisionTrajectory` field.
 * @returns {{ result, status, reason, turns, ticks, log, meta, trainingWeight, onThePlay, error?, trajectory?, decisionTrajectory? }}
 *   result — "user-wins" | "ai-wins" | "draw" | "timeout" | "engine-stuck"
 *            | "dispatch-error" | "setup-error" (the report treats stuck/error as
 *            non-completions; `timeout` is an honest, separately-counted non-result)
 *   onThePlay — the engine seat that was ON THE PLAY (went first, skipped its first draw
 *            per CR 103.8a). "user" by default; whatever `startSeat` requested otherwise.
 *            Read off the stamped state.startingPlayer (the engine's own source of truth),
 *            so analysis/training can account for position bias. null only on setup-error.
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
  startSeat = null, // which seat is ON THE PLAY; null ⇒ "user" (byte-identical). runSelfPlayBatch rotates it across a batch.
  timePressure = false, // default OFF here (a single game is byte-identical); runSelfPlayBatch turns it ON.
  pilots = {}, // EXTERNAL-DECIDE ADAPTER: { [seatId]: { decide, decideMulligan?, playbook?, temperament? } }; {} ⇒ all-default play.
  recordDecisions = false, // opt-in per-DECISION (policy) trajectory; default OFF ⇒ byte-identical.
  policy = null, // SD-5/PS-4 — opponentAI A/B knob (null | "v1" | per-subsystem map) threaded into advanceOpts; null ⇒ byte-identical.
  mulligan = null, // AI-F9 — null/false (single-game default, byte-identical): mulligan only for seats whose PILOT supplies decideMulligan; true: seats WITHOUT one default to decideMulliganForAI (runSelfPlayBatch turns this ON so 0-land/7-land keeps stop poisoning labels).
  resolveArbiter = null, // ARBITER-IN-RUNNER: a SYNC (pa,state)→verdict|null cache lookup; when set, gated cards resolve from the warm verdict cache instead of no-op'ing. null ⇒ byte-identical (hash preserved).
} = {}) {
  // Per-seat pilot identity ({playbook,temperament} | null) — used by both the in-game decide
  // router/recorder below AND the pre-game mulligan config. Defined up here so the mulligan
  // config can be assembled before createLearnSession (the mulligan runs at game start).
  const pilotIdentity = (seat) => {
    const p = pilots?.[seat];
    return p ? { playbook: p.playbook ?? null, temperament: p.temperament ?? null } : null;
  };

  // ── Pre-game London mulligan (opt-in, CR 103.5) ──────────────────────────────
  //
  // A seat opts into the mulligan by giving its pilot a `decideMulligan`. When ANY seat
  // has one — OR the `mulligan:true` opt is set (AI-F9: runSelfPlayBatch's default, so a
  // 0-land/7-land dealt hand is shipped instead of silently kept and poisoning the game's
  // W/L label) — we build a `mulligan` config for createLearnSession → startGame: a routed
  // decide that, given the seat being offered keep/ship, calls THAT seat's decideMulligan;
  // a seat without one falls back to decideMulliganForAI when `mulligan:true`, else keeps
  // its dealt 7 (byte-identical). When NO seat has a decideMulligan and the opt is off we
  // pass no `mulligan` at all, so game start is byte-identical to the pre-slice engine
  // (the dealt 7s are kept untouched). The mulligan decisions are recorded into the
  // per-DECISION trajectory (turn 0, tagged by pilot) when recordDecisions is on, so a
  // pilot's pre-game choices ride alongside its in-game ones.
  const defaultAIMulligan = mulligan === true;
  const hasAnyMulliganPilot = pilots && Object.values(pilots).some((p) => typeof p?.decideMulligan === "function");
  const mulliganRows = [];
  const mulliganConfig = (hasAnyMulliganPilot || defaultAIMulligan)
    ? {
        decide: ({ state, legalActions, seat, pilot }) => {
          const p = pilots?.[seat];
          if (typeof p?.decideMulligan === "function") return p.decideMulligan({ state, legalActions, seat, pilot });
          if (defaultAIMulligan) return decideMulliganForAI({ state, legalActions, seat }); // AI-F9 default heuristic
          return { kind: "mulligan-keep" }; // no mull pilot, opt off → keep the 7
        },
        pilots: Object.fromEntries((Object.keys(pilots || {})).map((seat) => [seat, pilotIdentity(seat)])),
        recordMulligan: recordDecisions
          ? (row) => {
              // One row per mulligan DECISION (keep/ship), shaped like an in-game decision row:
              // turn 0, the seat's pilot identity, and a small mulligan-decision action descriptor.
              // No features (there is no in-game board pre-turn-1); the recorder/consumer can treat
              // a turn-0 row as the pre-game mulligan stream.
              mulliganRows.push({
                turn: 0,
                seat: row.seat,
                pilot: pilotIdentity(row.seat),
                phase: "mulligan",
                action: { kind: `mulligan-${row.decision}`, mulligans: row.mulligans },
              });
            }
          : null,
      }
    : null;

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
      // Starting seat (CR 103.8a). When null we omit it so createLearnSession's "user" default
      // applies — BYTE-IDENTICAL game start. When set, that seat becomes state.activePlayer, so
      // startGame stamps it as startingPlayer and the first-turn draw-skip follows it.
      ...(startSeat != null ? { activePlayer: startSeat } : {}),
      mulligan: mulliganConfig, // null ⇒ no mulligan surfaced (byte-identical game start)
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
      onThePlay: null, // the game never started → no seat was on the play
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
  // pilotIdentity is defined once above (the mulligan config needs it before session build).
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
  if (policy != null) advanceOpts.policy = policy; // SD-5/PS-4 — the A/B knob for probe batches; absent ⇒ byte-identical
  if (resolveArbiter) advanceOpts.resolveArbiter = resolveArbiter; // ARBITER-IN-RUNNER — cache-backed gated-card resolve; absent ⇒ byte-identical (hash preserved)

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
      onThePlay: session.state?.startingPlayer ?? null, // the game DID start; report who led
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

  // The winning engine seat (CR 104.2a) from the SAME gameStatus the play-API exposes — computed
  // ONCE so the top-level result and the decisionTrajectory summary can't drift (Omnath FYI #1: the
  // top-level winnerSeat was absent, surfacing as "(none)", while decisionTrajectory carried it).
  // null on a draw/timeout/non-completion.
  const winnerSeat = (() => {
    try {
      return gameStatus(out.state)?.winnerSeat ?? null;
    } catch {
      return null; // a non-terminal/edge state ⇒ no winner; never a throw that aborts the run
    }
  })();

  const base = {
    result,
    status: out.status,
    reason: decision.reason ?? null,
    turns,
    ticks,
    log,
    meta,
    trainingWeight,
    // The winning engine seat (or null) — top-level so callers don't have to dig into decisionTrajectory.
    winnerSeat,
    // The seat that was ON THE PLAY (CR 103.8a). Read off the engine's stamped startingPlayer —
    // its own source of truth — so training/analysis can account for the position edge. "user"
    // on the default path; whatever startSeat requested otherwise.
    onThePlay: out.state?.startingPlayer ?? null,
  };

  // Per-DECISION (policy) trajectory (opt-in, independent of recordTrajectory). Attach the
  // full row list + the FINAL game outcome the task specifies: { result, winnerSeat,
  // trainingWeight }. winnerSeat comes from the SAME gameStatus the play-API exposes (so it
  // can't drift); it's null on a draw/timeout/non-completion. trainingWeight is 0 for a
  // timeout/non-completion — a forced-timeout game yields rows with weight 0, never a
  // fabricated W/L. Rows are append-only with stably-serialized actions (no engine handle).
  if (recordDecisions) {
    // Pre-game London mulligan decisions (turn 0, captured at game start) lead the row stream,
    // followed by the in-game enumerated decisions — one continuous per-decision policy trace.
    // winnerSeat/onThePlay reuse the top-level values (computed above) so the summary can't drift.
    base.decisionTrajectory = { mode, result, winnerSeat: base.winnerSeat, trainingWeight, onThePlay: base.onThePlay, rows: [...mulliganRows, ...decisionRows] };
  }

  if (!recordTrajectory) return base;

  // Label every captured row with its seat's EVENTUAL outcome (honest value target:
  // 1 won / 0 lost / 0.5 draw). A turn-limit draw is read off `reason` so it labels 0.5
  // rather than null. A `timeout` (the opt-in clock ran out) and any non-completion
  // (engine-stuck/dispatch-error) yield a null label for every seat → those rows carry
  // outcome:null so a consumer drops the game instead of training on a fabricated W/L.
  // (trainingWeight:0 on the game is the coarse-grained version of the same signal.)
  // HB-3: labels are per-seat FATE (outcomeLabelForSeatV2) — in a pod, only the TRUE
  // winner gets a 1; losing pod seats get 0; survivors of a user-death pod that never
  // played out get null (undetermined, dropped), never a fabricated W/L.
  const labelResult = result === "draw" && base.reason === "turn-limit" ? "turn-limit" : result;
  const seats = [];
  for (const [seat, rows] of seatRows.entries()) {
    // PILOT TAG: carry the seat's {playbook,temperament}|null identity onto the VALUE trajectory too, so the
    // panel's banked value-JSONL (trajectoriesToJsonl) is persona-attributed — matching the decision-trajectory,
    // which already stamps it per row. null for a default (no-pilot) seat. Does NOT touch the hashed
    // decisionTrajectory, so the trajectory anchor is unaffected.
    seats.push({ seat, outcome: outcomeLabelForSeatV2({ seat, result: labelResult, winnerSeat, state: out.state }), rows, pilot: pilotIdentity(seat) });
  }

  return {
    ...base,
    trajectory: { mode, result, reason: base.reason, onThePlay: base.onThePlay, seats },
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
 * The engine seat ids for a mode, in turn order — the exact seats createGameState/
 * buildStandardSeats / buildCommanderSeats produce. Standard = the two-seat toggle;
 * Commander = the four-seat pod. Used to pick which seat is on the play.
 */
export function engineSeatsForMode(mode) {
  return mode === "commander" ? ["user", "ai1", "ai2", "ai3"] : ["user", "ai"];
}

/**
 * Pick which engine seat is ON THE PLAY for game `index` of a batch — a deterministic
 * round-robin over the mode's seats (`engineSeatsForMode`). Game 0 → "user" (so the
 * first game of any batch matches the historical user-first seating), game 1 → the next
 * seat, wrapping. Round-robin is BALANCED by construction: across N games each seat leads
 * ⌊N/seatCount⌋ or ⌈N/seatCount⌉ times — the position edge is shared evenly, which is the
 * whole point (unbiased training data). Deterministic + pure: a given (mode, index) always
 * yields the same seat, so a seeded batch replays its seating exactly. `index` should be the
 * SAME monotonic per-game counter that derives each game's seed, so seed and starting-seat
 * are locked together and a single game reproduces from its recorded { seed, startSeat }.
 */
export function startSeatForGame(mode, index) {
  const seats = engineSeatsForMode(mode);
  const i = Number.isFinite(index) ? Math.abs(index | 0) : 0;
  return seats[i % seats.length];
}

/**
 * Resolve a caller-supplied base-seed spec into a concrete uint32 baseSeed (HB-4).
 *
 *   - null / "" / undefined → 1 (the historical default — DETERMINISTIC, so a bare
 *     rerun still reproduces byte-identically; the seed now rides the recorded data
 *     so duplicate banking is detectable either way)
 *   - a number / numeric string → that value >>> 0 (matches the runner's own
 *     normalization, so the echoed seed is exactly the effective one)
 *   - "auto" → a fresh independent sweep seed: the injected `nonce` (>>>0) when the
 *     caller provides one (tests inject a counter — NEVER Date-based, so test runs
 *     stay reproducible), else a crypto 32-bit value (also not Date-based).
 */
export function resolveBaseSeed(spec, { nonce = null } = {}) {
  if (spec == null || spec === "" || spec === true) return 1;
  if (spec === "auto") {
    if (nonce != null && Number.isFinite(Number(nonce))) return Number(nonce) >>> 0;
    const buf = new Uint32Array(1);
    globalThis.crypto.getRandomValues(buf);
    return buf[0] >>> 0;
  }
  const n = Number(spec);
  return Number.isFinite(n) ? n >>> 0 : 1;
}

/** The same deterministic PRNG (mulberry32) the engine's seeded shuffle uses
 *  (effects/atoms/library.js — not exported there; mirrored so the pod-shuffle
 *  permutation stream matches the engine's PRNG family). */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Deterministic Fisher–Yates permutation of [0..n) from a uint32 seed (HB-6).
 * Pure: a given (n, seed) always yields the same permutation. Used by the batch's
 * podShuffle mode to re-deal deck→pod composition each cycle.
 */
export function permutedDeckIndices(n, seed) {
  const rng = mulberry32(seed >>> 0);
  const idx = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  return idx;
}

/**
 * De-alias duplicated decks within ONE pod's seat assignment (the padded-mirror
 * shared-card-id watch item). buildPairings pads a short/trailing pod by WRAPPING
 * the deck list, so the SAME deck object can occupy two seats — and since
 * createPlayerState copies the library array but not the card objects
 * (gameState.js `library: [...library]`), both seats' libraries would then hold
 * the very same card objects with IDENTICAL card ids. Card ids are the engine's
 * cross-zone identity (targets, tutors, commander tax keys), so cross-seat id
 * collisions alias. Fix at pad time: the 2nd+ occurrence of a deck gets its
 * cards/commanders/companion cloned with a per-seat id suffix (`~s<seatIndex>`),
 * making every seat's ids disjoint. First occurrences (and every non-padded pod)
 * pass through UNTOUCHED — byte-identical. Duplicates are detected by object
 * identity (the batch reuses the same deck object per index). Pure.
 */
export function dedupeSeatDecks(seatDecks) {
  const seen = new Set();
  return (seatDecks || []).map((deck, k) => {
    if (!deck || typeof deck !== "object") return deck;
    if (!seen.has(deck)) {
      seen.add(deck);
      return deck;
    }
    const tag = (c) => (c ? { ...c, id: `${c.id}~s${k}` } : c);
    return {
      ...deck,
      cards: (deck.cards || []).map(tag),
      commanders: (deck.commanders || []).map(tag),
      companion: deck.companion ? tag(deck.companion) : (deck.companion ?? null),
    };
  });
}

/**
 * Wilson score interval for a binomial win-rate (HB-7). Returns { lo, hi } at the
 * given z (default 1.96 ≈ 95%). Pure; n=0 → the uninformative [0,1].
 */
export function wilsonInterval(wins, n, z = 1.96) {
  if (!n) return { lo: 0, hi: 1 };
  const p = wins / n;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const center = (p + z2 / (2 * n)) / denom;
  const half = (z * Math.sqrt((p * (1 - p) + z2 / (4 * n)) / n)) / denom;
  return { lo: Math.max(0, center - half), hi: Math.min(1, center + half) };
}

/**
 * Per-seat / per-deck / on-the-play win tables for a batch's games (HB-7) — the
 * measurement instrument for the "does one turn-order position over-win?" question.
 * Pure over runSelfPlayGame results; analysis-only (never feeds gameplay).
 *
 *   - bySeat:     wins/games per TURN-ORDER POSITION (engine seat id). Every seat
 *                 of a game's mode counts one game; the winnerSeat counts the win.
 *   - byDeck:     wins/games per deck NAME, joined positionally via each game's
 *                 meta.seatNames (correct under HB-5 rotation too — the meta is
 *                 the per-game assignment). NOTE: without rotateSeats, deck and
 *                 seat are fully confounded — bySeat ≡ byDeck reshuffled.
 *   - onThePlay:  wins/games for the seat that led (CR 103.8a position edge).
 * Only DECISIVE games (user-wins/ai-wins with a named winnerSeat) count wins;
 * draws/timeouts/non-completions count as games (decisiveGames tells them apart).
 * Each row carries a 95% Wilson CI on the win rate.
 */
export function summarizeSeatOutcomes(games) {
  const bySeat = {};
  const byDeck = {};
  const onThePlay = { wins: 0, games: 0 };
  let decisiveGames = 0;
  const bump = (table, key, won) => {
    const e = table[key] || (table[key] = { wins: 0, games: 0 });
    e.games += 1;
    if (won) e.wins += 1;
  };
  const list = Array.isArray(games) ? games : [];
  for (const g of list) {
    if (g?.result === "setup-error") continue; // the game never seated anyone
    const mode = g?.meta?.mode || "commander";
    const seats = engineSeatsForMode(mode);
    const names = g?.meta?.seatNames || [];
    const decisive = (g?.result === "user-wins" || g?.result === "ai-wins") && g?.winnerSeat != null;
    if (decisive) decisiveGames += 1;
    for (let k = 0; k < seats.length; k++) {
      const won = decisive && g.winnerSeat === seats[k];
      bump(bySeat, seats[k], won);
      bump(byDeck, names[k] ?? `deck${k}`, won);
    }
    if (g?.onThePlay != null) {
      onThePlay.games += 1;
      if (decisive && g.winnerSeat === g.onThePlay) onThePlay.wins += 1;
    }
  }
  const finalize = (e) => ({ ...e, winRate: e.games ? e.wins / e.games : 0, ci95: wilsonInterval(e.wins, e.games) });
  return {
    games: list.length,
    decisiveGames,
    bySeat: Object.fromEntries(Object.entries(bySeat).map(([k, e]) => [k, finalize(e)])),
    byDeck: Object.fromEntries(Object.entries(byDeck).map(([k, e]) => [k, finalize(e)])),
    onThePlay: finalize(onThePlay),
  };
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
 *     `{ [seatId]: { decide, decideMulligan?, playbook?, temperament? } }` map (seatIds are the
 *     engine seats — "user", "ai" for Standard; "user","ai1","ai2","ai3" for Commander). Passed
 *     straight through to every game's runSelfPlayGame, including each seat's optional
 *     `decideMulligan` (the pre-game London keep/ship; a seat without one falls back to the batch
 *     `mulligan` default below — decideMulliganForAI when ON, keep-the-7 when off). Omnath's
 *     pilot module is injected HERE by the caller; the runner never imports it. Default {} ⇒ every
 *     seat plays the default autopilot. The same map applies to all pairings (positional seats
 *     are stable; under rotateSeats a seat's pilot rides the SEAT, not the deck — that is the
 *     de-confounding HB-5 exists for).
 * @param {boolean} [opts.recordDecisions]  OPT-IN (default false): record the per-DECISION
 *     (policy) trajectory for every game (passes through to runSelfPlayGame.recordDecisions).
 *     Each game's `.decisionTrajectory` is tagged with `deckIds`/`seatNames` for attribution.
 * @param {boolean} [opts.alternateStart]  DEFAULT TRUE for batches — rotate which SEAT is
 *     ON THE PLAY (CR 103.8a) across the batch so the position edge isn't pinned to one seat.
 *     Without it, "user" is always on the play and, in a mirror, that seat's first-turn /
 *     untap-then-act tempo edge makes it win every game ⇒ seat-position-BIASED training data.
 *     ON, game k's starting seat is startSeatForGame(mode, k) — a deterministic round-robin
 *     over the mode's seats (balanced: each seat leads ≈1/seatCount of the games), locked to
 *     the SAME per-game counter that derives the seed (so a batch replays its seating exactly,
 *     and a single game reproduces from its recorded { seed, startSeat }). Game 0 still leads
 *     with "user", matching the historical first game. Pass false to pin every game to user-on-
 *     the-play (the pre-slice batch behavior). The chosen seat is recorded on meta.startSeat and
 *     the result's onThePlay. Turn order is unchanged; win-detection is seat-identity based, so
 *     the result still names which DECK won regardless of who led.
 * @param {boolean|string} [opts.mulligan]  DEFAULT TRUE for batches (AI-F9): every seat
 *     runs the pre-game London mulligan, using its pilot's `decideMulligan` when supplied
 *     and decideMulliganForAI otherwise — a 0-land/7-land dealt hand is shipped instead of
 *     silently kept, removing the pre-decided mana-screw noise from the W/L labels. Pass
 *     false to recover the old keep-every-7 batch behavior (byte-identical replays of
 *     pre-slice batches).
 * @param {boolean} [opts.rotateSeats]  OPT-IN (default false — byte-identical) HB-5: rotate
 *     which DECK sits at which engine seat across the batch, so pilot (seat-keyed), deck, and
 *     seat position de-confound. Game idx gets rotation floor(idx/seatCount) % seatCount of
 *     its pairing's seats (startSeat keeps riding the RAW idx — the two axes advance at
 *     different rates by design; keying both to idx%seatCount would alias so that half the
 *     decks never lead). The per-game assignment is recorded on meta.seatNames/deckNames +
 *     meta.seatRotation and rides the trajectory attribution. NOTE: any rotation at all needs
 *     gamesPer ≥ seatCount+... — concretely, a pairing with repeats < seatCount+1 (e.g. a
 *     single pod at gamesPer=3) gets rotation 0 for every game (a visible no-op:
 *     meta.seatRotation stays 0); the exact full deck×seat factorial needs gamesPer =
 *     k·seatCount² (k·16 for Commander). Size batches accordingly (HB-7's probe uses ≥16).
 * @param {boolean} [opts.podShuffle]  OPT-IN (default false — byte-identical) HB-6: re-deal
 *     the deck→pod composition each CYCLE. The batch restructures from per-pairing repeats to
 *     per-cycle passes (cycle c = one full traversal of the pairing list): each cycle derives
 *     a deterministic permutation of deck indices from mulberry32 seeded
 *     (baseSeed ^ 0x9e3779b9·(c+1)) and applies it BEFORE pod chunking, so cross-chunk
 *     matchups get sampled instead of deck i only ever meeting its 3 list-neighbours.
 *     Recorded on meta.podCycle + meta.podPermutation. Fully seed-derived (same baseSeed ⇒
 *     same compositions). OFF ⇒ the legacy pairing-major loop, byte-identical.
 * @returns {{ games: object[], deckList: object[], mode, pairings }}
 *     games — one runSelfPlayGame result per game, each tagged with .meta
 *             { mode, deckNames, seatNames, userDeckName, startSeat } and a trainingWeight,
 *             plus an `onThePlay` field naming the seat that led (CR 103.8a)
 */
export function runSelfPlayBatch(deckList, { mode = "commander", gamesPer = 1, baseSeed = 1, record = false, timePressure = true, pilots = {}, recordDecisions = false, alternateStart = true, policy = null, mulligan = true, rotateSeats = false, podShuffle = false, resolveArbiter = null } = {}) {
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

  // Run ONE game of `pairing` (repeat r). `extraMeta` carries the podShuffle cycle
  // attribution. The monotonic per-game counter (gameIndex) drives the seed, the
  // starting seat, and (when rotateSeats) the deck→seat rotation, so a single game
  // reproduces exactly from its recorded { seed, startSeat, seatNames }.
  const runOne = (pairing, r, extraMeta = null) => {
    const idx = gameIndex;
    gameIndex += 1;
    // Distinct per-game seed. The large odd stride keeps consecutive seeds far apart in
    // the mulberry32 stream so neighbouring games don't share near-identical opening draws.
    const seed = ((base + Math.imul(idx, 2654435761)) >>> 0);
    // Which seat is ON THE PLAY for this game. alternateStart (default) ⇒ a deterministic
    // round-robin over the mode's seats (balanced across the batch; game 0 leads with "user").
    // OFF ⇒ null, which runSelfPlayGame treats as "user" ⇒ BYTE-IDENTICAL to the pre-slice batch.
    const startSeat = alternateStart ? startSeatForGame(mode, idx) : null;
    // HB-5 deck↔seat rotation (opt-in). rot advances once per seatCount games — deliberately
    // SLOWER than startSeat's per-game round-robin, so (deck-at-seat × on-the-play) sweeps the
    // full factorial instead of aliasing (rot=idx%N with startSeat=seats[idx%N] would pin the
    // on-the-play deck to only half the pairing positions). rot=0 (and rotateSeats:false) keeps
    // the pairing's natural order — game 0 is always byte-identical to the unrotated batch.
    const seatCount = pairing.seats.length;
    const rot = rotateSeats ? Math.floor(idx / seatCount) % seatCount : 0;
    const seatIndices = rot === 0 ? pairing.seats : pairing.seats.map((_, k) => pairing.seats[(k + rot) % seatCount]);
    // De-alias duplicated decks in a padded/mirror pod (shared-card-id watch item): the 2nd+
    // occurrence of the SAME deck object gets id-suffixed clones so cross-seat card ids stay
    // disjoint. No-op (identity) for every non-padded pod.
    const seatDecks = dedupeSeatDecks(seatIndices.map((i) => decks[i]));
    const seatNames = seatDecks.map((d) => d?.name || d?.id || "Unknown deck");
    const seatIds = seatDecks.map((d) => d?.id || d?.name || "unknown");
    const meta = {
      mode,
      seatNames,
      deckNames: seatNames,
      userDeckName: seatNames[0],
      padded: !!pairing.padded,
      seed, // record the per-game seed so a specific game can be reproduced exactly
      startSeat, // the seat put on the play (null ⇒ default user-first); reproduces seating exactly
      repeat: r,
      // Feature-gated keys ONLY (absent on default runs ⇒ legacy meta byte-identical):
      ...(rotateSeats ? { seatRotation: rot } : {}),
      ...(extraMeta || {}),
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
        startSeat,
        timePressure,
        pilots,
        recordDecisions,
        policy, // SD-5/PS-4 — single knob, whole batch (null => byte-identical)
        mulligan: mulligan === false ? null : true, // AI-F9 — batch default ON; pass false to opt out
        resolveArbiter, // ARBITER-IN-RUNNER — forwarded to advanceOpts; null (default) ⇒ byte-identical
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
        startSeat,
        timePressure,
        pilots,
        recordDecisions,
        policy, // SD-5/PS-4 — single knob, whole batch (null => byte-identical)
        mulligan: mulligan === false ? null : true, // AI-F9 — batch default ON; pass false to opt out
        resolveArbiter, // ARBITER-IN-RUNNER — forwarded to advanceOpts; null (default) ⇒ byte-identical
      });
    }
    // Attribute each trajectory to its decks so JSONL rows carry deck identity. The
    // seat order matches state.turnOrder (user first, then ai/ai1..), so seat→deck
    // is positional and stable — and under rotateSeats these are the PER-GAME rotated
    // assignments, so attribution follows the actual seating. The per-game seed rides
    // along (HB-4) so banked rows are dedupable after the fact.
    if (record && game.trajectory) {
      game.trajectory.deckIds = seatIds;
      game.trajectory.seatNames = seatNames;
      game.trajectory.seed = seed;
    }
    // Same attribution for the per-decision (policy) trajectory: a positional seat→deck map
    // (rows already carry the seat id, so a consumer can join row.seat → deck via this map).
    if (recordDecisions && game.decisionTrajectory) {
      game.decisionTrajectory.deckIds = seatIds;
      game.decisionTrajectory.seatNames = seatNames;
      game.decisionTrajectory.seed = seed;
    }
    games.push(game);
  };

  if (podShuffle) {
    // HB-6: cycle-major traversal — each cycle re-deals deck→pod composition via a
    // seed-derived permutation applied to the pairing indices (permuting the deck list
    // then chunking ≡ mapping the identity chunks through the permutation).
    for (let c = 0; c < repeats; c++) {
      const permSeed = (base ^ Math.imul(0x9e3779b9, c + 1)) >>> 0;
      const perm = permutedDeckIndices(decks.length, permSeed);
      for (const pairing of pairings) {
        runOne(
          { ...pairing, seats: pairing.seats.map((i) => perm[i]) },
          c,
          { podCycle: c, podPermutation: perm.join(",") }
        );
      }
    }
  } else {
    // Legacy pairing-major loop — byte-identical order and behavior.
    for (const pairing of pairings) {
      for (let r = 0; r < repeats; r++) runOne(pairing, r);
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
 *   { game, mode, result, seat, deckId, seed, turn, outcome, features }
 * `seed` is the game's exact shuffle seed (HB-4: additive per omnath-trajectory-v1's
 * schema rule) — banked rows from a re-run of the same batch are byte-identifiable
 * duplicates, so double-banking is detectable after the fact. Rows from
 * non-completed games (outcome === null) are SKIPPED — never write a
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
          playbook: s.pilot?.playbook ?? null,       // PILOT TAG: persona attribution ({}/null for a default seat)
          temperament: s.pilot?.temperament ?? null,
          deckId: deckIds[si] ?? null,
          seed: traj.seed ?? null, // HB-4: the game's shuffle seed — banked duplicates are detectable
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

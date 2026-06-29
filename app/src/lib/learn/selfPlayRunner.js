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
 * SCOPE (Pass A): games are deterministic per pairing — the engine's shuffle is
 * not seeded here, so a given (deckA, deckB) pairing replays the same game every
 * run. Seeded-shuffle for repeat-variety is a v2 follow-up (see runSelfPlayBatch).
 */

import { createLearnSession, advanceUntilDecision } from "./learnSession.js";

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
 * @returns {{ result, status, reason, turns, ticks, log, meta, error? }}
 *   result — "user-wins" | "ai-wins" | "draw" | "engine-stuck" | "dispatch-error"
 *            | "setup-error" (the report treats the last three as non-completions)
 *   status — the raw session.status (active/user-wins/ai-wins/draw)
 *   reason — game-over reason ("turn-limit", a win condition) OR the stuck reason
 *   turns  — final turn number reached
 *   ticks  — engine ticks consumed (advanceUntilDecision loop iterations) when known
 *   log    — the raw append-only state.log (per-turn/phase keyed breakage signals)
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
      error: error?.message || String(error),
    };
  }

  // Drive to termination. advanceUntilDecision NEVER throws on engine bugs — it
  // returns a structured engine-stuck / dispatch-error decision — but we still
  // guard the call so a truly unexpected throw is reported honestly, not hidden.
  let advanced;
  try {
    advanced = advanceUntilDecision(session);
  } catch (error) {
    return {
      result: "dispatch-error",
      status: session.status,
      reason: error?.message || "advanceUntilDecision threw",
      turns: session.state?.turn ?? 0,
      ticks: 0,
      log: session.state?.log || [],
      meta,
      error: error?.message || String(error),
    };
  }

  const { session: out, decision } = advanced;
  const log = out.state?.log || [];
  const turns = out.state?.turn ?? 0;
  const ticks = decision?.ticks ?? null;

  // Map the terminal decision to a single result token. game-over → the win-detection
  // status (user-wins/ai-wins/draw). Anything else is a non-completion we report
  // HONESTLY (never silently coerced to a draw): engine-stuck or dispatch-error.
  let result;
  if (decision.kind === "game-over") {
    result = out.status; // user-wins | ai-wins | draw
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

  return {
    result,
    status: out.status,
    reason: decision.reason ?? null,
    turns,
    ticks,
    log,
    meta,
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
 *     NOTE (Pass A): repeats are currently identical games (no seeded shuffle yet) —
 *     gamesPer>1 is wired for a v2 seeded-shuffle follow-up and de-duplicates to 1
 *     here to avoid reporting fake repeat coverage.
 * @returns {{ games: object[], deckList: object[], mode, pairings }}
 *     games — one runSelfPlayGame result per game, each tagged with .meta
 *             { mode, deckNames, seatNames, userDeckName }
 */
export function runSelfPlayBatch(deckList, { mode = "commander", gamesPer = 1 } = {}) {
  const decks = Array.isArray(deckList) ? deckList : [];
  const pairings = buildPairings(decks.length, mode);
  // Pass A: identical-game repeats add nothing (deterministic engine). Cap at 1 so
  // the report never overcounts. v2 seeded shuffle will honour gamesPer>1.
  const repeats = gamesPer > 1 ? 1 : Math.max(1, gamesPer | 0);

  const games = [];
  for (const pairing of pairings) {
    const seatDecks = pairing.seats.map((i) => decks[i]);
    const seatNames = seatDecks.map((d) => d?.name || d?.id || "Unknown deck");
    for (let r = 0; r < repeats; r++) {
      const meta = {
        mode,
        seatNames,
        deckNames: seatNames,
        userDeckName: seatNames[0],
        padded: !!pairing.padded,
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
        });
      }
      games.push(game);
    }
  }

  return { games, deckList: decks, mode, pairings };
}

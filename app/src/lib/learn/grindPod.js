/**
 * grindPod.js — the grind's deterministic pod-forming core, extracted so the in-process
 * grind loop (grindLoop.js) and the parallel pool workers (scripts/grind-worker.mjs) run
 * the EXACT same sequence math. One source of truth: a pool with laneCount=1 must
 * reproduce the single-process game stream byte-for-byte — any duplicate copy of this
 * logic is the drift bug that guarantee exists to prevent.
 */

import { engineSeatsForMode } from "./selfPlayRunner.js";
import { mulberry32, seededShuffle } from "./seedMath.js";

// Seed/PRNG primitives live in seedMath.js (R2.6 — ONE source; the runner uses the same module).
export { gameSeedAt, mulberry32 as rng, seededShuffle as shuffle } from "./seedMath.js";

/** A random balanced pod of `size` runner decks (seeded). */
export function formPod(decks, size, seed) {
  const rand = mulberry32(seed);
  return seededShuffle(decks, rand).slice(0, size);
}

export function podToArgs(pod, mode, pilots, seed) {
  const [userDeck, ...opp] = pod;
  return {
    deckA: userDeck?.cards || [],
    opponentDecks: opp.map((d) => d?.cards || []),
    userCommanders: userDeck?.commanders || [],
    opponentCommanders: opp.map((d) => d?.commanders || []),
    userCompanion: userDeck?.companion || null,
    opponentCompanions: opp.map((d) => d?.companion || null),
    mode, seed, timePressure: true, pilots, recordDecisions: true, mulligan: true,
  };
}

/** Seat names for the mode, in pod order (pod[0] = the first seat). */
export function engineSeatsFor(mode) {
  return engineSeatsForMode(mode);
}

/**
 * THE ONE grind-store header builder (featuresV=2 drift guard — Omnath 2026-07-10): grindLoop (the
 * in-process grind) and scripts/grind-worker.mjs (the pool lanes) BOTH assemble game headers; the
 * featuresV=2 fields (startSeat/turnOrder/decisionsCount/pilotV) initially landed only in grindLoop
 * and the pool kept writing headers without them. One shared builder = the two write paths cannot
 * drift again. `game` is a runSelfPlayGame result; `pilotV` is the persona-pack era marker (read off
 * the pilotBuilder fn by both callers; null until Omnath's builder exposes it).
 */
export function buildGrindHeader({ gameSeed, pilots, decks, engineVersion, mode, pool, game, pilotV = null }) {
  return {
    seed: gameSeed, pilots, decks, engineVersion: engineVersion ?? null,
    result: game?.result ?? null, winnerSeat: game?.winnerSeat ?? null, turns: game?.turns ?? null,
    mode, pool, mulliganPolicyV: game?.mulliganPolicyV ?? null,
    seatStats: game?.seatStats ?? null, winCondition: game?.winCondition ?? null,
    startSeat: game?.onThePlay ?? null,
    turnOrder: game?.turnOrder ?? null,
    decisionsCount: game?.decisionTrajectory?.rows?.length ?? null,
    pilotV,
  };
}

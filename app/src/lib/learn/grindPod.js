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

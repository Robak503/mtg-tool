/**
 * grindPod.js — the grind's deterministic pod-forming core, extracted so the in-process
 * grind loop (grindLoop.js) and the parallel pool workers (scripts/grind-worker.mjs) run
 * the EXACT same sequence math. One source of truth: a pool with laneCount=1 must
 * reproduce the single-process game stream byte-for-byte — any duplicate copy of this
 * logic is the drift bug that guarantee exists to prevent.
 */

import { engineSeatsForMode } from "./selfPlayRunner.js";

/** Game i's seed from the run's base seed — the one sequence both grind flavors follow. */
export function gameSeedAt(baseSeed, i) {
  return (baseSeed + Math.imul(i, 2654435761)) >>> 0;
}

/** mulberry32 seeded RNG — deterministic pod selection, no Math.random (a rerun of the same baseSeed reproduces). */
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle(arr, rand) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

/** A random balanced pod of `size` runner decks (seeded). Pads by wrapping when fewer decks than the pod size. */
export function formPod(decks, size, seed) {
  const rand = rng(seed);
  let pod = shuffle(decks, rand).slice(0, size);
  while (pod.length < size && decks.length) pod = pod.concat(shuffle(decks, rand)).slice(0, size);
  return pod;
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

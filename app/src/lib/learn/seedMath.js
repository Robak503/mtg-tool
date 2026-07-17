/**
 * seedMath.js — THE deterministic seed/PRNG primitives, one leaf module (R2.6, audit 2026-07-09).
 *
 * mulberry32 + the per-game seed stride were defined twice (selfPlayRunner + grindPod) — a
 * silent drift there would fork the "same seed ⇒ same game" guarantee the pool's determinism
 * gate, the replay canary, and the whole grind lifecycle rest on. Leaf module: no imports, so
 * anything (runner, pod-former, workers, probes) can use it with zero cycle risk.
 */

/** Game i's seed from a run's base seed — one large odd stride so neighbouring games don't share near-identical shuffle streams. */
export function gameSeedAt(baseSeed, i) {
  return (baseSeed + Math.imul(i, 2654435761)) >>> 0;
}

/** mulberry32 — the engine's standard small deterministic PRNG (() => float in [0,1)). */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher-Yates over a copy with the supplied rng — deterministic for a seeded rng. */
export function seededShuffle(arr, rand) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

/**
 * nextSeed — THE in-game seed-advance step: the Numerical Recipes LCG (a=1664525, c=1013904223, mod 2^32).
 * This is the identical stride shuffleControllerLibrary / the dice-roll atom already advance `state.rngSeed`
 * by after each consumption, factored here so every consumer shares ONE definition and can't drift. Distinct
 * from gameSeedAt's per-GAME spacing stride (2654435761) — that spaces neighbouring games' base seeds apart;
 * this advances the stream WITHIN a game.
 */
export function nextSeed(seed) {
  return (Math.imul(seed >>> 0, 1664525) + 1013904223) >>> 0;
}

/**
 * nextRandomInt — THE canonical uniform-integer draw off the SERIALIZED, THREADED game seed (state.rngSeed).
 * HOUSE POLICY (owner-blessed 2026-07-16): randomness enters the engine ONLY as a seeded, serializable,
 * replay-deterministic primitive — same seed ⇒ byte-identical game — because the sim replays recorded games
 * from their seeds and grind data must stay reproducible. Every game-state consumer of a single random
 * integer draws through THIS function so the discipline can't drift.
 *
 * Returns `{ value, state }` where `value` is a uniform integer in [0, n) and `state` carries the ADVANCED
 * seed (nextSeed). The draw reads the CURRENT `state.rngSeed`, maps ONE mulberry32 output into [0, n) exactly
 * as the shuffle's Fisher-Yates does (Math.floor(rng() * n) — the same negligible-bias technique the engine
 * already trusts), then advances the stored seed by the shared LCG step. A game serialized mid-sequence
 * restores the SAME `rngSeed` word and therefore continues the identical stream (the replay guarantee).
 *
 * NO Math.random — determinism-critical (the repo bans it in state mutation). A legacy state with no
 * `rngSeed` self-seeds deterministically from 0 and stores the advanced word, so the sequence bootstraps on
 * first use and never touches Math.random. A non-positive `n` (an empty range — e.g. an empty hand) consumes
 * NO randomness: it returns value 0 with the seed UNADVANCED (the state passes through untouched), honoring
 * "the PRNG advances only when an effect actually consumes randomness."
 */
export function nextRandomInt(state, n) {
  if (!(n > 0)) return { value: 0, state };
  const seed = (state.rngSeed ?? 0) >>> 0;
  const value = Math.floor(mulberry32(seed)() * n);
  return { value, state: { ...state, rngSeed: nextSeed(seed) } };
}

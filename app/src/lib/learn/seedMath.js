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

/**
 * effects/parseMemo.js — the text-keyed memo for the effect parser (the parse cache, 2026-10-03).
 *
 * WHY: a game re-reads the same oracle text thousands of times. Listing legal actions parses every castable
 * spell's program and every activated ability's effect clause at every priority window; a self-play profile
 * on v0.163.0 put 46% of the CPU inside parseEffectClause, and the game got ~4x slower between v0.149.0 and
 * v0.163.0 only because each parse tries many more templates. The parse is a pure function of its text, so
 * one parse per distinct text is enough.
 *
 * THE CONTRACT (what makes sharing one result safe):
 *  1. PURE KEY. The caller builds the key from EVERY input the parse reads. parseEffectClause's inputs are the
 *     oracle text, the card type and the two boolean options, plus the module-level registries below.
 *  2. THE REGISTRIES ARE INPUTS TOO. A parse consults the registered clause parsers and the injected grant-body
 *     validators. Each registration calls invalidateParseMemo(), so a result parsed before a late registration
 *     can never be served after it.
 *  3. RESULTS ARE DEEP-FROZEN. Every caller now receives the SAME object, so one caller writing to it would
 *     change what every later caller reads — silently, in another game. Frozen, that write throws instead
 *     (modules are strict mode). Callers that add to a program copy it first ({ ...program, stamp }).
 *  4. BOUNDED. A corpus classification run parses ~100k distinct texts; the map is capped and evicts the oldest
 *     entry (Map iteration is insertion order), so memory stays flat and a game's working set stays hot.
 *
 * A leaf: imports nothing.
 */

const MAX_ENTRIES = 16384;
let memo = new Map();
let hits = 0;
let misses = 0;

/** Freeze a parse result and everything reachable from it. Plain objects and arrays only — a parse result is data. */
export function deepFreeze(value) {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  if (Array.isArray(value)) {
    for (const item of value) deepFreeze(item);
  } else {
    for (const key of Object.keys(value)) deepFreeze(value[key]);
  }
  return value;
}

/**
 * Return the memoized result for `key`, computing (and freezing) it on a miss. `compute` must be a pure
 * function of the inputs the key was built from. null / undefined results are cached too — "this text does
 * not parse" is as stable as a program.
 */
export function memoizedParse(key, compute) {
  if (memo.has(key)) {
    hits += 1;
    return memo.get(key);
  }
  misses += 1;
  const result = deepFreeze(compute());
  if (memo.size >= MAX_ENTRIES) memo.delete(memo.keys().next().value);
  memo.set(key, result);
  return result;
}

/** Drop every memoized parse. Called when a parser input registry changes; also the test seam. */
export function invalidateParseMemo() {
  memo = new Map();
}

/** { size, hits, misses, max } — for the benchmark and the tests. */
export function parseMemoStats() {
  return { size: memo.size, hits, misses, max: MAX_ENTRIES };
}

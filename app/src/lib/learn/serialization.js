/**
 * serialization.js — Phase-7 game-state (de)serialization.
 *
 * The payoff of the resolver-registry refactor: because game state now contains
 * only plain data (PR-1..PR-3 removed every payload.onResolve closure), a game
 * serializes with a trivial JSON pass-through and restores to byte-identical
 * behavior. There are deliberately NO custom revivers — their absence IS the
 * contract. The serialization.test.js round-trip is the guard that keeps every
 * future change honest: reintroduce a closure into state and it breaks loudly.
 *
 * Phase-3 (PR-4a) session-level persistence (checksum, schema version, atomic
 * disk write) wraps these; this module is the pure state <-> JSON boundary.
 */

/** Serialize a game state to a JSON string. */
export function serializeState(state) {
  return JSON.stringify(state);
}

/** Restore a game state from a JSON string produced by serializeState. */
export function deserializeState(json) {
  return JSON.parse(json);
}

/**
 * Deep-scan a value for any function anywhere in its object graph — the
 * closure-regression guard. JSON.stringify silently drops functions, so a
 * closure smuggled back into state would corrupt save/resume without throwing;
 * this catches it. Pure and cycle-safe. Reused by Phase-3's isSerializable.
 */
export function containsFunction(value, seen = new Set()) {
  if (typeof value === "function") return true;
  if (value && typeof value === "object") {
    if (seen.has(value)) return false;
    seen.add(value);
    for (const v of Object.values(value)) {
      if (containsFunction(v, seen)) return true;
    }
  }
  return false;
}

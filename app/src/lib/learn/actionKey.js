/**
 * Canonical action-key serialization, shared across the learn engine.
 *
 * `stableActionKey` is JSON.stringify with object keys sorted recursively (arrays keep
 * order) — a canonical key so two structurally-equal action objects compare equal
 * regardless of key order. Used by learnSession's offered-set validation and
 * decisionGate's resolveChoice (gameApi.js keeps its own mirror, stableStringify,
 * because importing from here through learnSession would be a cycle for its callers).
 *
 * undefined is not valid JSON: JSON.stringify(undefined) returns the JS value `undefined`, which
 * interpolated into the string below would emit the literal text `undefined` → JSON.parse chokes
 * ("Unexpected token 'u'"). Engine legalActions routinely carry undefined fields (e.g. targetName:
 * undefined on a non-targeted action), so mirror JSON.stringify's real behavior: array-undefined → null,
 * and OMIT undefined-valued object keys (below) — keeping the result JSON.parse-safe.
 */
export function stableActionKey(value) {
  if (value === undefined) return "null";
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableActionKey).join(",")}]`;
  const keys = Object.keys(value).filter((k) => value[k] !== undefined).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableActionKey(value[k])}`).join(",")}}`;
}

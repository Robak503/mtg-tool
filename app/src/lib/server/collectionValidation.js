/**
 * collectionValidation.js — shared validation for collection "stack" payloads.
 *
 * Both POST /api/collection and PATCH /api/collection/[id] accept a `stacks`
 * array with the same finish/condition rules. This kept drifting as two
 * near-identical copies; centralizing it means the allowed values and the
 * error messages can never diverge between the two routes.
 */

export const VALID_FINISHES = new Set(["nonfoil", "foil", "etched"]);
export const VALID_CONDITIONS = new Set([null, "NM", "LP", "MP", "HP", "DMG"]);

/**
 * Validate a `stacks` array. Returns `null` when it is a non-empty array of
 * well-formed stack objects, or a human-readable error string describing the
 * first problem found (so the caller can return it as a 400).
 */
export function validateStacks(stacks) {
  if (!Array.isArray(stacks) || stacks.length === 0) {
    return "stacks must be a non-empty array";
  }
  for (const stack of stacks) {
    if (!stack || typeof stack !== "object") {
      return "each stack must be an object";
    }
    if (!VALID_FINISHES.has(stack.finish)) {
      return "stack.finish must be one of: nonfoil, foil, etched";
    }
    if (typeof stack.quantity !== "number" || !Number.isFinite(stack.quantity) || stack.quantity < 0) {
      return "stack.quantity must be a non-negative number";
    }
    const cond = stack.condition === undefined ? null : stack.condition;
    if (!VALID_CONDITIONS.has(cond)) {
      return "stack.condition must be NM, LP, MP, HP, DMG, or null";
    }
  }
  return null;
}

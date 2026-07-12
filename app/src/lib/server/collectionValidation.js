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
    // V10 cost basis — optional; what you paid per copy in this stack.
    if (stack.paidUsd !== undefined && stack.paidUsd !== null) {
      if (typeof stack.paidUsd !== "number" || !Number.isFinite(stack.paidUsd) || stack.paidUsd < 0) {
        return "stack.paidUsd must be a non-negative number";
      }
    }
    // C5-P1.4 acquisition date — optional; WHEN this stack was acquired. A date-input string
    // ("YYYY-MM-DD") or a full ISO timestamp; stored verbatim. Additive: absent is always fine (old
    // rows + old clients unchanged, the paidUsd precedent). Only the type + a sane non-empty shape is
    // enforced — the client's <input type="date"> already constrains the format.
    if (stack.acquiredAt !== undefined && stack.acquiredAt !== null) {
      if (typeof stack.acquiredAt !== "string" || stack.acquiredAt.length > 40) {
        return "stack.acquiredAt must be a date string";
      }
    }
  }
  return null;
}

// C5-P1.4 language — a per-ROW field (the printing's language, default "en"). Optional + additive; a
// short language code/name string. Absent → the reader treats it as "en". Validated at the row level
// (POST/PATCH), not per-stack, since a printing has one language across its finishes.
export function validateLanguage(language) {
  if (language === undefined || language === null) return null;
  if (typeof language !== "string" || language.length > 24) {
    return "language must be a short string";
  }
  return null;
}

/**
 * Merge incoming stacks into an existing stacks array (by finish).
 * Same-finish stacks add quantities; the incoming condition wins when set.
 * Used by POST /api/collection (add-or-merge by scryfallId) and by the
 * PATCH printing-move when the target printing already has a row.
 */
export function mergeStacks(existing, incoming) {
  const out = existing.map(s => ({ ...s }));
  for (const newStack of incoming) {
    const idx = out.findIndex(s => s.finish === newStack.finish);
    if (idx >= 0) {
      out[idx] = {
        ...out[idx],
        quantity: (out[idx].quantity || 0) + newStack.quantity,
        // Worst observed condition wins. NM > LP > MP > HP > DMG.
        // For now keep the incoming condition if it's set, else preserve.
        condition: newStack.condition !== undefined && newStack.condition !== null
          ? newStack.condition
          : out[idx].condition,
        // C5-P1.4: the incoming acquisition date wins when set, else preserve the existing stack's.
        ...(newStack.acquiredAt != null
          ? { acquiredAt: newStack.acquiredAt }
          : (out[idx].acquiredAt != null ? { acquiredAt: out[idx].acquiredAt } : {})),
      };
    } else {
      out.push({ ...newStack });
    }
  }
  return out;
}

/**
 * Validate the Trophy Case provenance fields (V6, all optional + additive):
 *   signed       null | { artist?, date?, event?: string, inPerson?: boolean }
 *   altered      boolean
 *   artistProof  boolean
 *   showcase     boolean   (pin to the Trophy Case strip)
 * Returns null when every present field is well-formed, else the first
 * human-readable problem. Absent fields are always fine — old rows and old
 * clients keep working untouched.
 */
export function validateProvenance(body) {
  if ("signed" in body && body.signed !== null) {
    const s = body.signed;
    if (!s || typeof s !== "object" || Array.isArray(s)) {
      return "signed must be an object or null";
    }
    for (const key of ["artist", "date", "event"]) {
      if (key in s && s[key] !== null && typeof s[key] !== "string") {
        return `signed.${key} must be a string`;
      }
    }
    if ("inPerson" in s && typeof s.inPerson !== "boolean") {
      return "signed.inPerson must be a boolean";
    }
    const unknown = Object.keys(s).filter(k => !["artist", "date", "event", "inPerson"].includes(k));
    if (unknown.length) return `signed has unknown field: ${unknown[0]}`;
  }
  for (const key of ["altered", "artistProof", "showcase"]) {
    if (key in body && typeof body[key] !== "boolean") {
      return `${key} must be a boolean`;
    }
  }
  return null;
}

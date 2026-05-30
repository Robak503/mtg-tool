/**
 * collectionStacks.js — pure helpers for adjusting a collection row's stacks.
 *
 * Shared by the Vault grid quick-stepper (and anything else that nudges a
 * row's owned quantity by one). Kept pure (no I/O) so the +/- math is
 * unit-tested once and behaves identically everywhere.
 */

/** Total owned copies across every stack on a row. */
export function stackTotal(stacks) {
  return (stacks || []).reduce((sum, s) => sum + (Number(s?.quantity) || 0), 0);
}

/**
 * Return a NEW stacks array with the owned count nudged by `delta` (+1 / -1).
 *
 * - Increment adds to the first stack — or creates a default nonfoil stack
 *   when the row has none (e.g. a wishlist row being acquired).
 * - Decrement subtracts from the FIRST non-empty stack — the same stack `+`
 *   adds to (zero-qty stacks are dropped, so next[0] is always non-empty when
 *   any copies remain). This keeps +/- a round-trip: on a multi-finish row
 *   (nonfoil + foil) the grid stepper only ever moves the primary finish and
 *   never silently converts a foil copy into a nonfoil one. Finer per-finish
 *   control lives in the detail drawer's per-stack steppers.
 * - Zero-quantity stacks are dropped. An EMPTY result means "delete the row":
 *   the API rejects an empty stacks array, so callers DELETE instead of PATCH.
 *
 * The input is never mutated.
 */
export function adjustStacks(stacks, delta) {
  const next = (stacks || []).map(s => ({
    finish: s.finish,
    quantity: Number(s?.quantity) || 0,
    condition: s?.condition === undefined ? null : s.condition,
  }));

  if (delta > 0) {
    if (next.length === 0) {
      next.push({ finish: "nonfoil", quantity: 1, condition: "NM" });
    } else {
      next[0].quantity += 1;
    }
  } else if (delta < 0) {
    for (let i = 0; i < next.length; i++) {
      if (next[i].quantity > 0) {
        next[i].quantity -= 1;
        break;
      }
    }
  }

  return next.filter(s => s.quantity > 0);
}

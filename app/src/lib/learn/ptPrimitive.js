/**
 * ptPrimitive.js — printed power/toughness + counter math, extracted so
 * `gameState.js` and `layers.js` can BOTH import it WITHOUT forming an import
 * cycle (Phase-7 PR-9, eng-review F3).
 *
 * The dependency edge we must never reverse:
 *   gameState.creaturePower  ──delegates to──▶  layers.permanentPower
 *   layers.js                ──reads──────────▶  ptPrimitive (+ keywords)
 *   ptPrimitive.js           ──imports────────▶  (nothing)
 *
 * Because `layers.js` imports only this leaf primitive (never `gameState`), and
 * `gameState` delegates OUTWARD to `layers`, the edge stays one-directional — no
 * cycle. This module is the single home of the "without continuous effects, a
 * permanent's P/T is its printed value adjusted by its ±1/±1 counters" rule.
 *
 * CR grounding: +1/+1 and -1/-1 counters modify power AND toughness in layer 7c
 * (CR 613.4c — "Effects and counters that modify power and/or toughness"); the
 * net delta is identical for power and toughness, which is why one helper covers
 * both. Non-numeric printed values (e.g. "*") read as 0, matching the legacy
 * accessor.
 *
 * Pure, no state mutation, imports nothing.
 */

/** Printed power (the card's base value), 0 for non-numeric ("*") or missing. */
export function printedPower(permanent) {
  if (!permanent?.card) return 0;
  return Number(permanent.card.power) || 0;
}

/** Printed toughness (the card's base value), 0 for non-numeric ("*") or missing. */
export function printedToughness(permanent) {
  if (!permanent?.card) return 0;
  return Number(permanent.card.toughness) || 0;
}

/**
 * Net P/T delta from this permanent's +1/+1 and -1/-1 counters (CR 613.4c). The
 * same value applies to both power and toughness. Can be negative.
 */
export function counterPtDelta(permanent) {
  const plus = permanent?.counters?.["+1/+1"] || 0;
  const minus = permanent?.counters?.["-1/-1"] || 0;
  return plus - minus;
}

/** CONTAGION (POD-SIM THREE · BI-4, 2026-09-05) — PER-AXIS counter deltas: every counter whose name is a P/T pair
 *  ("+1/+1", "-1/-1", "-2/-1", "+1/+0", "+2/+2"…) contributes its power part × count to power and its toughness part ×
 *  count to toughness (CR 122.1a / 613.4c). `counterPtDelta` stays the legacy ±1/±1 net for any caller that still
 *  wants the symmetric value. */
const PT_COUNTER_RE = /^([+-]\d+)\/([+-]\d+)$/;
export function counterPowerDelta(permanent) {
  let d = 0;
  for (const [name, n] of Object.entries(permanent?.counters || {})) {
    const m = PT_COUNTER_RE.exec(name);
    if (m) d += parseInt(m[1], 10) * (Number(n) || 0);
  }
  return d;
}
export function counterToughnessDelta(permanent) {
  let d = 0;
  for (const [name, n] of Object.entries(permanent?.counters || {})) {
    const m = PT_COUNTER_RE.exec(name);
    if (m) d += parseInt(m[2], 10) * (Number(n) || 0);
  }
  return d;
}

/** Printed power + counter delta — the "no continuous effects" power value. */
export function printedPowerWithCounters(permanent) {
  return printedPower(permanent) + counterPowerDelta(permanent);
}

/** Printed toughness + counter delta — the "no continuous effects" toughness value. */
export function printedToughnessWithCounters(permanent) {
  return printedToughness(permanent) + counterToughnessDelta(permanent);
}

/** Does the permanent carry any P/T-altering (+1/+1 or -1/-1) counters? */
export function hasPtCounters(permanent) {
  return (permanent?.counters?.["+1/+1"] || 0) !== 0
    || (permanent?.counters?.["-1/-1"] || 0) !== 0;
}

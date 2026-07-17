/**
 * GROUP NO-UNTAP STATIC (BLITZ UT-1, CR 302.6 — the continuous "doesn't untap" restriction scoped to a GROUP
 * of permanents). The Winter-Orb / lock family:
 *
 *     "<filter> don't untap during their controllers' untap steps."
 *
 * A CONTINUOUS static that keeps EVERY matching permanent tapped through its controller's untap step, no matter
 * who controls the static or the permanent (CR 302.6 — a permanent's controller decides which of THEIR
 * permanents untap, but a continuous restriction can hold any of them tapped). untapAll enforces it at the SAME
 * untap-step skip the stun/self/attached machinery uses (gameState.js) — the affected permanent's controller IS
 * the active player during their own untap step, so scanning the whole battlefield for the static and matching
 * the active player's tapped permanents against the filter is the correct model.
 *
 * DISTINCT from every other "doesn't untap" family already modeled (each disjoint, this file owns NONE of them):
 *   - SELF form   "This <permanent> doesn't untap during your untap step"  → gameState.selfPreventsUntap (UP-1)
 *   - ATTACHED    "Enchanted creature doesn't untap during its controller's untap step" → gameState.attachmentPreventsUntap (PZ-1)
 *   - ONE-SHOT    "…doesn't untap during your/its controller's NEXT untap step" → doesNotUntapNext flag (Junk Winder)
 *   - STUN        a consumable counter (CR 122.1c) → gameState.untapOrConsumeStun
 *   - ADD-untap   "Untap … during each other player's untap step" (Seedborn / Murkfiend) → opposite polarity, own hooks
 *
 * FAIL-CLOSED FILTER VOCABULARY (CREED — a filter the matcher can't evaluate with certainty returns null, the
 * card parks, safe FN). Every clause is whole-clause `^…$`-anchored. Supported today (the honest single-clause
 * subset of the printed corpus):
 *   - subtype          "Islands …"                              → Choke
 *   - nonbasicLand     "Nonbasic lands …"                       → Back to Basics
 *   - creaturePowerGte "Creatures with power N or greater …"    → Meekstone, Marble Titan
 *   - creaturePowerLte "Creatures with power N or less …"       → Juntu Stakes
 *
 * PARKED (present in the corpus, not yet a supported filter — each a safe FN):
 *   - "Nonwhite creatures with power N or greater …" (Crackdown — color negation incl. colorless is a subtlety)
 *   - "Creatures of the chosen type …" (An-Zerrin Ruins — needs the choose-a-type-on-enter referent)
 *   - "Lands …" / "Permanents …" / "Creatures …" / "Nonland permanents …" / color-filtered — every printing
 *     carries a SECOND clause (a pay-to-untap upkeep, an "untap a land" upkeep, an ETB tap, cumulative upkeep),
 *     so the WHOLE card parks regardless of the filter.
 *
 * This module is a LEAF (imports nothing from gameState / coverage / layers) — the runtime resolves each
 * permanent's live characteristics (layer-aware types / power) and hands them to the pure matcher, so gameState
 * and the coverage classifier share ONE recognition source and can never drift.
 */

const normApos = (s) => String(s || "").replace(/[’]/g, "'");

// The shared restriction tail. Tolerant of the singular templating ("their controller's untap step") in case a
// printing uses it, but still whole-clause anchored (fail closed on any other wording).
const TAIL = "don't untap during their (?:controllers'|controller's) untap steps?";

// Strip regex (global) for the coverage residue check — matches ONLY the supported filter sentences so it can
// never consume an unmodeled clause.
export const GROUP_NO_UNTAP_SENTENCE_RE = new RegExp(
  `(?:nonbasic lands|islands|creatures with power \\d+ or (?:greater|less)) ${TAIL}\\.?`,
  "gi",
);

/**
 * Parse ONE already-split clause into a group-no-untap filter descriptor, or null when it is not a supported
 * group no-untap static. Whole-clause anchored (^…$) — any extra wording fails to null (safe FN).
 */
export function parseGroupNoUntapClause(clause) {
  const t = normApos(clause).trim().toLowerCase().replace(/\.+$/, "").replace(/\s+/g, " ");
  if (!t) return null;
  const tail = TAIL;
  if (new RegExp(`^islands ${tail}$`).test(t)) return { kind: "subtype", subtype: "Island" };
  if (new RegExp(`^nonbasic lands ${tail}$`).test(t)) return { kind: "nonbasicLand" };
  let m;
  if ((m = t.match(new RegExp(`^creatures with power (\\d+) or greater ${tail}$`)))) return { kind: "creaturePowerGte", n: parseInt(m[1], 10) };
  if ((m = t.match(new RegExp(`^creatures with power (\\d+) or less ${tail}$`)))) return { kind: "creaturePowerLte", n: parseInt(m[1], 10) };
  return null;
}

/**
 * All supported group-no-untap filters printed on a card (usually 0 or 1). Splits the oracle on clause
 * boundaries and collects every recognized static. Used by BOTH the runtime (untapAll scans the battlefield)
 * and the coverage classifier.
 */
export function groupNoUntapFiltersOf(card) {
  const oracle = normApos(card?.oracle ?? card?.oracle_text ?? "");
  if (!oracle || !/untap/i.test(oracle)) return [];
  const out = [];
  for (const clause of oracle.split(/[\n.;]+/)) {
    const f = parseGroupNoUntapClause(clause);
    if (f) out.push(f);
  }
  return out;
}

/**
 * Does `chars` (a permanent's LIVE, layer-aware characteristics) match the group-no-untap filter? Pure.
 *   chars = { types: string[], subtypes: string[], isCreature: bool, power: number|null }
 * `power` is read ONLY for the two creature-power filters and only after `isCreature` is confirmed, so a
 * non-creature never consults power.
 */
export function groupNoUntapMatches(filter, chars) {
  switch (filter?.kind) {
    case "subtype":
      return Array.isArray(chars?.subtypes) && chars.subtypes.includes(filter.subtype);
    case "nonbasicLand":
      return Array.isArray(chars?.types) && chars.types.includes("Land") && !chars.types.includes("Basic");
    case "creaturePowerGte":
      return !!chars?.isCreature && chars.power != null && chars.power >= filter.n;
    case "creaturePowerLte":
      return !!chars?.isCreature && chars.power != null && chars.power <= filter.n;
    default:
      return false;
  }
}

/** True if this filter needs the affected permanent's live power (so the runtime reads power only when needed). */
export function groupNoUntapFilterNeedsPower(filter) {
  return filter?.kind === "creaturePowerGte" || filter?.kind === "creaturePowerLte";
}

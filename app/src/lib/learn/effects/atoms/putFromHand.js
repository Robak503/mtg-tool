/**
 * effects/atoms/putFromHand.js — the PUT-FROM-HAND-ONTO-BATTLEFIELD clause parser (CR 701 "put onto the
 * battlefield" — a permanent card is moved hand → battlefield WITHOUT being cast: no mana paid, no stack, no
 * cast triggers; ETB triggers fire normally on entry).
 *
 * THE MECHANIC: "[you may] put a/up to N/any number of <filter> card(s) from your hand onto the battlefield
 * [tapped]". Examples: Dramatic Entrance ("you may put a green creature card …"), Last March of the Ents
 * ("…then put any number of creature cards …"), Elvish Piper / Quicksilver Amulet ("{cost}: you may put a
 * creature card …"), Tooth and Nail's mode ("put up to two creature cards …").
 *
 * REUSES THE PROVEN TUTOR SEAM (no new resolver). The land-from-hand slice already wired the tutor's
 * `sourceZone:"hand"` + `destination:"battlefield"` + `remaining` (multi-pick) + `entersTapped` path —
 * applyTutor gathers the matching HAND cards into a pendingChoice, the driver surfaces the picker (the
 * player's own hand — public to them) or auto-picks, and resolveTutorChoice moves each chosen card hand →
 * battlefield via enterCardFromZone (which fires ETB + landfall). This parser simply emits `op:"tutor"`
 * atoms with a CREATURE / PERMANENT / typed / colored hand filter (vs land-from-hand's hardcoded land filter),
 * so the whole resolution path is shared and already battle-tested — nothing new in runProgram/effectAtoms.
 *
 * OPTIONALITY: a LEADING "you may" is peeled by parseClauseToAtom's α2 wrapper (stamping `optional:true`), so
 * the runner offers a real yes/no (player) or auto-takes (AI) instead of mis-resolving it as mandatory. This
 * parser ALSO tolerates a leading "(?:you may )?" in its own anchor so a direct clause-first parse (tests, a
 * trigger detector handing the bare clause) still matches; the α2 path remains the optional-flag source.
 *
 * COUNT: "a" → 1; "up to <two..five>" → that cap; "any number of" → an effectively-unbounded cap (the tutor
 * chain self-terminates when the hand runs out of matching cards, so a large `remaining` is correct and never
 * fabricates a card — resolveTutorChoice stops chaining once `inSource` is false). A bare "two"/"three"
 * (mandatory exact count) is also modeled (Defense-of-the-Heart-shaped, though that one sources the library).
 *
 * FILTER: creature / permanent / artifact / enchantment / artifact-or-creature, plus an OPTIONAL single
 * color word ("green creature", "nonwhite creature"). LAND is deliberately NOT matched here — the land-from-
 * hand path (tutorClauseParser's `lfh`) owns it (and its land-per-turn-bypass semantics). A subtype filter, a
 * mana-value clause, a multi-color union, or any trailing rider (haste / sacrifice / "becomes" / control)
 * fails the exact `$` anchor → null → the clause stays low → Arbiter (CREED: whole-card-clean or PARK).
 *
 * CIRCULAR-IMPORT NOTE: this module must NOT import from effects/parser.js (parser imports the atoms barrel).
 * `putFromHandClauseParser` is a PURE function; the integrator wires registerClauseParser at parser.js-bottom.
 */

import { TUTOR_COLOR_WORD } from "../parseHelpers.js"; // shared color-qualified-filter allowlist (cycle-free leaf)

// Count words for "up to <N>" / a bare mandatory "<N>" (matches the tutor seam's UP_TO_N_WORD vocabulary).
const COUNT_WORD = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5 };
// "any number of" has no printed cap — the put is bounded only by the hand. A large remaining drives the
// tutor's multi-pick chain until the matching cards in hand run out (resolveTutorChoice ends the chain when a
// pick finds nothing), so this never fabricates a card. 99 dwarfs any legal hand size.
const ANY_NUMBER_CAP = 99;

// The five mono-colors a "<color> creature card" filter may name, plus their "non<color>" negations
// (Surprise Deployment's "nonwhite creature"). A union ("white or blue") / a guild word is NOT modeled.
// Shared with the library X-tutor (Green Sun's Zenith); imported from parseHelpers as the single source.
const COLOR_WORD = TUTOR_COLOR_WORD;

// The permanent-card type filters this slice models for a hand→battlefield put. Each maps a phrase to the
// structured tutor filter (`groups` = OR-of-AND type-word groups, matched against the card's front-face type
// line by cardMatchesTutorFilter). LAND is intentionally absent (owned by the land-from-hand path).
const TYPE_FILTER = {
  "creature": { groups: [["creature"]] },
  "permanent": { groups: [] }, // every card type — a "permanent card" is any permanent (CR 110.4)
  "artifact": { groups: [["artifact"]] },
  "enchantment": { groups: [["enchantment"]] },
  "artifact creature": { groups: [["artifact", "creature"]] },
  "artifact or creature": { groups: [["artifact"], ["creature"]] },
  "creature or artifact": { groups: [["creature"], ["artifact"]] },
};

/**
 * Parse a put-from-hand filter phrase (the words between "put a/up to N/any number of" and "card(s) from your
 * hand") into a structured tutor filter `{ groups, colors? }`, or null if the phrase carries anything outside
 * the modeled allowlist (→ the clause stays low → Arbiter). Accepts an OPTIONAL single leading color word
 * ("green creature") then a modeled TYPE_FILTER phrase. A "permanent" filter rejects a color prefix (a
 * "green permanent card" isn't a printed shape and color-gating a typeless permanent put is out of scope).
 */
function parsePutFilter(phrase) {
  const words = String(phrase).trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return null;
  let colors = null;
  // Peel a single leading color word (Dramatic Entrance "green", Surprise Deployment "nonwhite").
  if (COLOR_WORD.has(words[0])) {
    colors = [words[0]];
    words.shift();
    if (words.length === 0) return null; // "a green card" (no type) — not a modeled shape here
  }
  const typePhrase = words.join(" ");
  const base = TYPE_FILTER[typePhrase];
  if (!base) return null; // an unmodeled type phrase (a subtype, a union we don't list) → low → Arbiter
  if (colors && base.groups.length === 0) return null; // a colored "permanent" — out of scope, stay low
  return colors ? { ...base, colors } : { ...base };
}

/**
 * PUT-FROM-HAND clause parser (CR 701 "put onto the battlefield"). Emits an `op:"tutor"` atom with
 * `sourceZone:"hand"`, `destination:"battlefield"`, the parsed filter, optional `remaining` (count), and
 * `entersTapped`. The integrator wires registerClauseParser at parser.js-bottom (do NOT self-register —
 * circular-import hazard). Whole-clause-anchored (^…$) so a longer clause with a rider never mis-parses.
 * Returns the atom or null.
 */
export function putFromHandClauseParser(clause) {
  const t = String(clause || "").toLowerCase().replace(/[’]/g, "'").trim();
  // Single / counted / unbounded put — ONE anchored matcher. Capture groups:
  //   [1] quantity: "a"/"an"/"one".. OR "up to <word>" OR "any number of"
  //   [2] filter phrase (optional color + type), e.g. "green creature", "creature", "permanent"
  //   [3] " tapped" (optional)
  const m = t.match(
    /^(?:you may )?put (a|an|one|up to (?:one|two|three|four|five)|two|three|four|five|any number of) (.+?) cards? from your hand onto the battlefield( tapped)?\.?$/,
  );
  if (!m) return null;
  const qty = m[1];
  const filter = parsePutFilter(m[2]);
  if (!filter) return null;
  const entersTapped = !!m[3];

  // Resolve the count cap (`remaining`). "a/an/one" + a bare "two".."five" are exact counts; "up to <word>"
  // is a cap; "any number of" is hand-bounded (ANY_NUMBER_CAP). The tutor chain self-terminates at hand
  // exhaustion regardless, so an exact "two" with one matching card in hand still cleanly puts just the one.
  const upTo = qty.match(/^up to (one|two|three|four|five)$/);
  const remaining = qty === "any number of" ? ANY_NUMBER_CAP : upTo ? COUNT_WORD[upTo[1]] : (COUNT_WORD[qty] ?? 1);

  // A readable label for the picker/log (e.g. "green creature card from your hand"). The leading article is
  // dropped; the count word stays out (the picker shows N picks via `remaining`).
  const label = `${m[2]} card from your hand`;

  const atom = {
    op: "tutor",
    sourceZone: "hand",
    filter,
    filterLabel: label,
    destination: "battlefield",
    entersTapped,
    targetType: null,
  };
  if (remaining > 1) atom.remaining = remaining;
  return atom;
}

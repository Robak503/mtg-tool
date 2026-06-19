/**
 * combatEvasion.js — EVADE: the canBlock / attack-legality chokepoint that ENFORCES the
 * display-only combat-evasion keywords, so a body carrying them resolves CORRECTLY end-to-end.
 *
 * Engine-first (THE CREED): a matcher with no working resolution is itself a false positive.
 * coverage.js only counts these keyword bodies native because THIS file makes the rule real.
 * Everything is read LAYER-AWARE (permanentHasKeyword / permanentColors / permanentTypes) so a
 * GRANTED or REMOVED instance is honored, not just the printed one.
 *
 * Pairwise block-legality — canBlockAttacker(state, blockerId, attackerId, defenderId):
 *   attacker-side:
 *     Flying (CR 702.9b)     — blockable only by creatures with flying or reach
 *     "can't be blocked"     — unblockable (bare self-clause): blockable by nothing
 *     basic landwalk (702.14) — unblockable while the DEFENDING player (per-defender → 4P-correct)
 *                              controls a land of that basic type
 *     Skulk (702.118b)        — not blockable by a creature with greater power
 *     Fear (702.36b)         — blockable only by artifact and/or black creatures
 *     Intimidate (702.13b)   — blockable only by artifact and/or creatures sharing a color with it
 *     Horsemanship (702.31b) — blockable only by creatures with horsemanship
 *   blocker-side:
 *     "can't block"          — may never be declared as a blocker
 *     "can block only creatures with flying" — may block only flying attackers
 *
 * Menace (CR 509.1c / 702.111b) is a SET-level rule, enforced at resolution
 * (combatResolution.js): a menace attacker left with exactly ONE blocker is treated as unblocked.
 * Defender (702.3b) is enforced in legalChoices.actionsDeclareAttacker (can't attack).
 *
 * Only BARE printed shapes are recognized. A conditional / compound variant the chokepoint can't
 * faithfully honor ("can't be blocked by creatures with flying", "can't be blocked except by …",
 * a team grant) falls through unrecognized → the body stays body-only / the card routes to the
 * Arbiter (false-negative SAFE), never a half-enforced false positive.
 */
import { permanentHasKeyword, permanentColors, permanentTypes } from "./layers.js";
import { parseProtectionColors } from "./protection.js";
import { findPermanent, creaturePower } from "./gameState.js";

// Basic-landwalk keyword → the land subtype that switches it on.
const BASIC_WALK = [
  ["Plainswalk", "Plains"],
  ["Islandwalk", "Island"],
  ["Swampwalk", "Swamp"],
  ["Mountainwalk", "Mountain"],
  ["Forestwalk", "Forest"],
];

function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Card oracle, reminder-stripped + lowercased, with the card's OWN name normalized to
// "this creature" so a self-clause printed with the card name ("Invisible Stalker can't be
// blocked.") reads identically to the templated "This creature can't be blocked." \b-anchored so
// a short name can't match inside another word.
function selfOracle(card) {
  let t = String(card?.oracle || "").replace(/\([^)]*\)/g, " ").toLowerCase().replace(/[’']/g, "'");
  const name = String(card?.name || "").toLowerCase().replace(/[’']/g, "'");
  if (name) t = t.replace(new RegExp(`\\b${escapeRegExp(name)}\\b`, "g"), "this creature");
  return t;
}

// A clause asserted of the creature ITSELF (subject "this creature"/"it"), at a sentence
// boundary, ending exactly at the clause — so a trailing qualifier ("can't be blocked BY creatures
// with flying", "… except by Walls") and team grants ("creatures you control can't be blocked")
// never match.
const reBareUnblockable = /(?:^|[\n.;])\s*(?:this creature|it) can't be blocked\s*(?:\.|$)/;
const reCantBlock = /(?:^|[\n.;])\s*(?:this creature|it) can't block\s*(?:\.|$)/;
const reBlockOnlyFlying = /(?:^|[\n.;])\s*(?:this creature|it) can block only creatures with flying\s*(?:\.|$)/;

export function isSelfUnblockable(card) { return reBareUnblockable.test(selfOracle(card)); }
export function isSelfCantBlock(card) { return reCantBlock.test(selfOracle(card)); }
export function isCanBlockOnlyFlyers(card) { return reBlockOnlyFlying.test(selfOracle(card)); }

// ── Classifier helper (coverage.isKeywordOnly): does ONE normalized keyword-only clause read as
// an evasion form THIS file enforces? The clause arrives already lowercased, reminder-stripped, and
// name-normalized to "this creature". The keyword-WORD forms (menace/skulk/fear/intimidate/
// horsemanship) are matched by COVERED_KEYWORDS itself; this only adds the basic-landwalk words and
// the three text-clause forms, so a keyword-only body carrying them is honestly native.
const reLandwalkWord = /^(?:plains|island|swamp|mountain|forest)walk$/;
export function isEnforcedEvasionClause(clause) {
  const c = String(clause || "").trim();
  if (reLandwalkWord.test(c)) return true;
  if (/^(?:this creature |it )?can't be blocked$/.test(c)) return true;
  if (/^(?:this creature |it )?can't block$/.test(c)) return true;
  if (/^(?:this creature |it )?can block only creatures with flying$/.test(c)) return true;
  return false;
}

// ── Runtime helpers (layer-aware) ──
function isArtifactPerm(state, id) {
  return (permanentTypes(state, id)?.types || []).some((t) => String(t).toLowerCase() === "artifact");
}
function permColorSet(state, id) {
  return new Set((permanentColors(state, id) || []).map((c) => String(c).toUpperCase()));
}
function defenderControlsLandType(state, defenderId, subtype) {
  const bf = state.players?.[defenderId]?.battlefield || [];
  const re = new RegExp(`\\b${subtype}\\b`, "i");
  return bf.some((p) => re.test(String(p?.card?.type || p?.card?.type_line || "")));
}

/**
 * May `blocker` legally block `attacker`, where `defenderId` is the blocking player (the defending
 * player whose lands gate landwalk, CR 509.1b)? PAIRWISE only — menace's ≥2 rule is a SET
 * constraint handled at resolution. Permissive on a missing permanent (never wedges resolution).
 */
export function canBlockAttacker(state, blockerId, attackerId, defenderId) {
  const aLook = findPermanent(state, attackerId);
  const bLook = findPermanent(state, blockerId);
  if (!aLook?.permanent || !bLook?.permanent) return true;
  const aCard = aLook.permanent.card;
  const bCard = bLook.permanent.card;

  // Blocker-side restrictions.
  if (isSelfCantBlock(bCard)) return false;
  // "Can block only creatures with flying" is a RESTRICTION (this creature can't block non-flyers),
  // NOT a grant of reach: to actually block a FLYING attacker the blocker still needs flying/reach
  // (CR 702.9b, enforced below). So a non-flying/non-reach "can block only flyers" creature can block
  // nothing — correct, and every real such card (Cloud Elemental, …) carries flying. Do NOT "fix" this
  // to let it block a flier without flying/reach; that would permit an ILLEGAL block (a wrong play).
  if (isCanBlockOnlyFlyers(bCard) && !permanentHasKeyword(state, attackerId, "Flying")) return false;

  // Unblockable.
  if (isSelfUnblockable(aCard)) return false;

  // Basic landwalk — gated by the DEFENDING player's lands (per-defender → 4P-correct).
  for (const [walk, subtype] of BASIC_WALK) {
    if (permanentHasKeyword(state, attackerId, walk) && defenderControlsLandType(state, defenderId, subtype)) {
      return false;
    }
  }

  // Flying — blockable only by flying/reach (CR 702.9b).
  if (permanentHasKeyword(state, attackerId, "Flying")) {
    if (!(permanentHasKeyword(state, blockerId, "Flying") || permanentHasKeyword(state, blockerId, "Reach"))) {
      return false;
    }
  }

  // Horsemanship — blockable only by horsemanship (CR 702.31b).
  if (permanentHasKeyword(state, attackerId, "Horsemanship") && !permanentHasKeyword(state, blockerId, "Horsemanship")) {
    return false;
  }

  // Shadow — SYMMETRIC mutual exclusion (CR 702.28b): a creature with shadow can't be blocked by a
  // creature without shadow, AND a creature without shadow can't be blocked by one with shadow. So a
  // legal block requires both sides to MATCH on shadow (a shadow attacker needs a shadow blocker; a
  // normal attacker can't be blocked by a shadow creature). Layer-aware so a granted/removed shadow counts.
  if (permanentHasKeyword(state, attackerId, "Shadow") !== permanentHasKeyword(state, blockerId, "Shadow")) {
    return false;
  }

  // Protection from a color (CR 702.16f): an ATTACKING creature with protection from a color can't be
  // blocked by a creature of that color. Printed protection only (granted protection is PR2). Layer-aware
  // blocker colors so a granted/removed color counts.
  const attProtColors = parseProtectionColors(aCard);
  if (attProtColors.size > 0) {
    for (const c of permColorSet(state, blockerId)) {
      if (attProtColors.has(c)) return false;
    }
  }

  // Skulk — not blockable by a creature with greater power (CR 702.118b).
  if (permanentHasKeyword(state, attackerId, "Skulk")) {
    if (creaturePower(bLook.permanent, state) > creaturePower(aLook.permanent, state)) return false;
  }

  // Fear — blockable only by artifact and/or black creatures (CR 702.36b).
  if (permanentHasKeyword(state, attackerId, "Fear")) {
    if (!(isArtifactPerm(state, blockerId) || permColorSet(state, blockerId).has("B"))) return false;
  }

  // Intimidate — blockable only by artifact and/or creatures sharing a color with it (CR 702.13b).
  if (permanentHasKeyword(state, attackerId, "Intimidate")) {
    const shares = [...permColorSet(state, attackerId)].some((c) => permColorSet(state, blockerId).has(c));
    if (!(isArtifactPerm(state, blockerId) || shares)) return false;
  }

  return true;
}

/** Does the attacker have menace (the ≥2-blocker rule, enforced at resolution)? Layer-aware. */
export function attackerHasMenace(state, attackerId) {
  return permanentHasKeyword(state, attackerId, "Menace");
}

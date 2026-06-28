/**
 * groupWard.js — DIFFUSION SLIVER (CR 603 trigger, modeled as a ward-style soft-counter).
 *
 * "Whenever a Sliver creature you control becomes the target of a spell or ability an opponent controls,
 * counter that spell or ability unless its controller pays {2}." This is a GROUP, board-conditional analogue
 * of ward (KW-WARD, ward.js / #305): instead of the cost living ON the targeted permanent (a ward keyword),
 * the tax is conferred by a SEPARATE permanent (Diffusion Sliver) on every matching-subtype creature its
 * controller controls. The OUTCOME is identical to ward — the opponent pays the cost or the spell/ability is
 * countered — so we REUSE the exact soft-counter pay-or-be-countered machinery (setPendingSoftCounterChoice →
 * the binary decision → AI settle → counter), the same approximation ward already ships.
 *
 * SCOPE — only the canonical Diffusion shape is modeled (anchored whole-sentence):
 *   "Whenever a <Subtype> creature you control becomes the target of a spell or ability an opponent controls,
 *    counter that spell or ability unless its controller pays {N}."
 * where {N} is fixed generic mana (Diffusion = {2}). The cost is parsed to the SAME structured soft-counter
 * cost shape ward uses ({ kind:"mana", mana }). A colored/{X}/life/non-generic variant, a non-"you control"
 * scope, or any rider → null (the card stays body-only — a safe false-negative, never a half-modeled flip).
 *
 * Like ward, this fires for a stack object targeting EXACTLY ONE matching permanent (a 2+-target spell would
 * trigger once PER target, CR — the binary soft-counter can't express two nested taxes, so 2+ → null, a safe
 * FN). The targeted permanent must be controlled by an OPPONENT of the spell/ability's controller (the source
 * permanent's controller is that opponent), so a player targeting their own Sliver is never taxed.
 *
 * Pure: regex + board reads, no mutation.
 */

import { findPermanent } from "./gameState.js";
import { permanentTypes } from "./layers.js";
import { hasKeyword } from "./keywords.js";

// The canonical Diffusion-Sliver sentence → the subtype + the generic mana amount, or null. Reminder text
// (CR 207.2) is parenthetical and stripped; the sentence is matched lowercased + whole. ONLY fixed-generic
// "{N}" is modeled (a colored / {X} / non-mana cost → null → body-only). The captured subtype is canonicalized.
const RE_DIFFUSION = /whenever a ([a-z]+) creature you control becomes the target of a spell or ability an opponent controls, counter that spell or ability unless its controller pays \{(\d+)\}\.?/i;

/**
 * Parse a card's Diffusion-style group-ward descriptor: { subtype, generic } | null. `subtype` is the
 * Capitalized creature subtype whose creatures the controller's opponents are taxed for targeting; `generic`
 * is the {N} generic-mana tax. Null when the card carries no such (modeled) clause.
 */
export function parseGroupWard(card) {
  const oracle = String(card?.oracle ?? card?.oracle_text ?? "").replace(/\([^)]*\)/g, " ");
  const m = oracle.match(RE_DIFFUSION);
  if (!m) return null;
  return { subtype: m[1].charAt(0).toUpperCase() + m[1].slice(1), generic: parseInt(m[2], 10) };
}

// Build the soft-counter cost shape (matches ward.parseWardManaPips's output) for a fixed generic amount.
function genericCost(n) {
  return { kind: "mana", mana: { generic: n, W: 0, U: 0, B: 0, R: 0, G: 0, C: 0, hybrid: [] } };
}

// Layer-aware "is this permanent a creature of subtype `subtype`?" — effective (layer-4) subtypes OR a
// CHANGELING (CR 702.73a — a changeling is every creature type, so it counts as a Sliver). Mirrors the
// combat-evasion subtype test so granted/removed subtypes + changelings are honored consistently.
function permIsSubtypeCreature(state, permId, subtype) {
  const t = permanentTypes(state, permId);
  if (!t?.types?.includes("Creature")) return false;
  const want = String(subtype).toLowerCase();
  if ((t.subtypes || []).some((s) => String(s).toLowerCase() === want)) return true;
  const lk = findPermanent(state, permId);
  return !!lk?.permanent?.card && hasKeyword(lk.permanent.card, "changeling");
}

/**
 * If `stackObj` (a spell OR an activated/triggered ability) targets EXACTLY ONE permanent that is a
 * matching-subtype creature whose controller (a) is an OPPONENT of the object's controller and (b) controls a
 * Diffusion-style group-ward source for that subtype, return { cost, wardName } (the soft-counter the object's
 * controller must pay or be countered); otherwise null. Mirrors ward.wardTaxForStackObject so the same cast /
 * ability chokepoints raise it. CR: Diffusion triggers per target an opponent's spell/ability chooses; the
 * binary soft-counter models the single-target case (2+ → null, a safe FN).
 */
export function groupWardTaxForStackObject(state, stackObj) {
  const caster = stackObj?.controller;
  if (!caster) return null;
  // The single permanent this object targets (creature/permanent/planeswalker), if exactly one.
  const targets = (stackObj.targets || []).filter(
    (t) => t && (t.type === "creature" || t.type === "permanent" || t.type === "planeswalker"),
  );
  if (targets.length !== 1) return null; // 0 → no target; 2+ → separate triggers, safe FN (matches ward)
  const lk = findPermanent(state, targets[0].id);
  if (!lk?.permanent) return null;
  const targetController = lk.controller;
  if (targetController === caster) return null; // a player targeting their own creature is never taxed
  // Find a Diffusion-style source the TARGET'S controller controls, whose subtype the targeted creature
  // carries (the targeted permanent must itself be a matching-subtype creature — "a Sliver creature you
  // control becomes the target"). The source's controller (targetController) must be an OPPONENT of the caster
  // — already guaranteed by targetController !== caster (2-player) and re-affirmed structurally below.
  for (const perm of state.players?.[targetController]?.battlefield || []) {
    const gw = parseGroupWard(perm?.card);
    if (!gw) continue;
    if (!permIsSubtypeCreature(state, targets[0].id, gw.subtype)) continue;
    return { cost: genericCost(gw.generic), wardName: perm.card?.name || null };
  }
  return null;
}

/** Back-compat-style alias for the spell-cast path (a spell IS a stack object). Mirrors ward.wardTaxForSpell. */
export function groupWardTaxForSpell(state, spellObj) {
  return groupWardTaxForStackObject(state, spellObj);
}

/**
 * Is this card a DIFFUSION-style native group-ward card? Its WHOLE non-reminder text must be EXACTLY the one
 * modeled group-ward sentence (parseGroupWard matched) and nothing else — any rider / extra ability leaves
 * residue → body-only (CREED all-or-nothing). The runtime (groupWardTaxForStackObject at the cast/ability
 * chokepoints) enforces it, so crediting it native is honest. Pure.
 */
export function isNativeGroupWard(card) {
  const gw = parseGroupWard(card);
  if (!gw) return false;
  // Residue check: strip reminder, drop the matched sentence, and require nothing meaningful remains.
  const oracle = String(card?.oracle ?? card?.oracle_text ?? "").replace(/\([^)]*\)/g, " ");
  const residue = oracle.replace(RE_DIFFUSION, " ").replace(/[\s.;]/g, "");
  return residue === "";
}

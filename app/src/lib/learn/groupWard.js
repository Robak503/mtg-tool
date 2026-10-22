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
 * EVERY TRIGGER (2026-10-21): each targeted matching creature an opponent of the object's controller controls triggers each
 * Diffusion-style source ITS controller controls (each is "a Sliver creature you control" to that source; CR 603.2c — an ability
 * triggers repeatedly when one event contains multiple occurrences) — two targeted Slivers under one Diffusion Sliver are two
 * triggers, one Sliver under two Diffusion Slivers is two. groupWardInstancesFor returns one {N} instance per trigger, and ward.targetTaxForStackObject joins them to the wards'
 * one pay-or-be-countered question (paying some but not all counters the object all the same), so a ward on the same spell no
 * longer crowds Diffusion out, and every path that asks a ward — a spell, an activated, loyalty or triggered ability, a copy, a
 * changed target — asks this too. Before, only one targeted Sliver and the first Diffusion Sliver were read (2+ targets → nothing),
 * only at the cast and activation paths, and not at all when a ward took the question first. A player targeting their own
 * Sliver is never taxed.
 *
 * Pure: regex + board reads, no mutation.
 */

import { findPermanent } from "./gameState.js";
import { permanentTypes, permIsEveryCreatureType } from "./layers.js";

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

// Layer-aware "is this permanent a creature of subtype `subtype`?" — effective (layer-4) subtypes OR every
// creature type (CR 702.73a — a changeling counts as a Sliver; P·39 — so does an every-creature-type one, one
// read: layers.permIsEveryCreatureType). Mirrors the combat-evasion subtype test so granted/removed subtypes,
// changelings and every-creature-type effects are honored consistently.
function permIsSubtypeCreature(state, permId, subtype) {
  const t = permanentTypes(state, permId);
  if (!t?.types?.includes("Creature")) return false;
  const want = String(subtype).toLowerCase();
  if ((t.subtypes || []).some((s) => String(s).toLowerCase() === want)) return true;
  return permIsEveryCreatureType(state, permId);
}

/**
 * Every Diffusion-style trigger `stackObj` (a spell, or an activated, loyalty or triggered ability, or a copy) raises as it targets:
 * for each permanent it targets (each once) that an OPPONENT of its controller controls, each group-ward source that permanent's
 * controller controls whose subtype the permanent carries as a creature ("a Sliver creature you control becomes the target"). One
 * `{ kind: "mana" }` instance of the source's {N} per trigger — `{ costs, names }`, names the sources', each once. The combined
 * question is ward.targetTaxForStackObject's.
 */
export function groupWardInstancesFor(state, stackObj) {
  const caster = stackObj?.controller;
  const costs = [];
  const names = [];
  if (!caster) return { costs, names };
  const seen = new Set();
  for (const t of stackObj.targets || []) {
    if (!t || (t.type !== "creature" && t.type !== "permanent" && t.type !== "planeswalker") || seen.has(t.id)) continue;
    seen.add(t.id);
    const lk = findPermanent(state, t.id);
    if (!lk?.permanent || lk.controller === caster) continue; // a player targeting their own creature is never taxed
    for (const perm of state.players?.[lk.controller]?.battlefield || []) {
      const gw = parseGroupWard(perm?.card);
      if (!gw || !permIsSubtypeCreature(state, t.id, gw.subtype)) continue;
      costs.push(genericCost(gw.generic));
      const name = perm.card?.name || null;
      if (!names.includes(name)) names.push(name);
    }
  }
  return { costs, names };
}

/**
 * The Diffusion-style tax alone, as one cost: `{ cost, wardName }` — every trigger's {N} summed (each is generic mana) — or null when
 * nothing triggers. The raise sites ask ward.targetTaxForStackObject, which joins this to the wards; kept for the direct reads.
 */
export function groupWardTaxForStackObject(state, stackObj) {
  const { costs, names } = groupWardInstancesFor(state, stackObj);
  if (!costs.length) return null;
  const total = costs.reduce((n, c) => n + c.mana.generic, 0);
  const wardName = names.length <= 1 ? names[0] ?? null : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  return { cost: genericCost(total), wardName };
}

/**
 * Is this card a DIFFUSION-style native group-ward card? Its WHOLE non-reminder text must be EXACTLY the one
 * modeled group-ward sentence (parseGroupWard matched) and nothing else — any rider / extra ability leaves
 * residue → body-only (CREED all-or-nothing). The runtime (ward.targetTaxForStackObject at every place a ward is
 * raised) enforces it, so crediting it native is honest. Pure.
 */
export function isNativeGroupWard(card) {
  const gw = parseGroupWard(card);
  if (!gw) return false;
  // Residue check: strip reminder, drop the matched sentence, and require nothing meaningful remains.
  const oracle = String(card?.oracle ?? card?.oracle_text ?? "").replace(/\([^)]*\)/g, " ");
  const residue = oracle.replace(RE_DIFFUSION, " ").replace(/[\s.;]/g, "");
  return residue === "";
}

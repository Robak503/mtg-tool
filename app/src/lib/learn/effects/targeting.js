/**
 * effects/targeting.js — cast-time choice expansion for EffectPrograms (P2.5).
 *
 * `expandCastChoices(state, controller, program)` turns a program into the concrete
 * set of casts the player/AI can make: one entry per legal (mode × per-atom target)
 * combination. Each entry's `targets` are tagged with `atomIndex` (the heart of
 * multi-clause fidelity — clause 0 can target a creature, clause 1 a player), so the
 * runner binds each chosen target to its own atom.
 *
 * This generalizes the legacy single-effect "one cast action per target" expansion
 * in `legalChoices.actionsCastSpell` to multi-atom + modal programs. It reuses the
 * proven, restriction-aware `spellEffects.enumerateTargets`, so targeting stays the
 * single source of truth (no second target enumerator to drift).
 *
 * Leaf-ish: imports only `spellEffects.enumerateTargets`. No gameState, no runner.
 */

import { enumerateTargets } from "../spellEffects.js";

// Bounds the cartesian blow-up of a multi-target spell (CR-spirit: a "deal 4
// divided among any number of targets" would explode legalChoices + the UI). The
// P2.5 modeled shapes have ≤1 targeting atom, so this never bites in practice; it's
// a backstop so a future multi-target atom can't DoS the action list.
const MAX_CAST_EXPANSIONS = 64;

/** An effect-like target spec for one atom, or null when the atom is non-targeted. */
function atomTargetSpec(atom) {
  const tt = atom?.targetType;
  if (!tt || tt === "eachOpponent" || tt === "eachCreature") return null;
  // P3.1 counter: a spell-target spec carries the spellFilter for stack-spell enumeration.
  if (tt === "spell") return { kind: "counter", targetType: "spell", spellFilter: atom.spellFilter || "any" };
  // Graveyard recursion: a graveyard-card target carries the cardFilter (creature/any) so
  // enumerateTargets surfaces only the caster's matching graveyard cards.
  if (tt === "graveyardCard") return { kind: "return-gy", targetType: "graveyardCard", cardFilter: atom.cardFilter || "any" };
  // δ-1 hand disruption: a hand-card target carries the handFilter so enumerateTargets surfaces only
  // the opponents' hand cards the spell may strip (Duress = noncreature+nonland, Inquisition = nonland
  // + mv≤3, …). Modeled like graveyardCard — a card in a zone, chosen at cast.
  if (tt === "handCard") return { kind: "discard-chosen", targetType: "handCard", handFilter: atom.handFilter || {} };
  return { kind: atom.op === "destroy" ? "destroy" : "damage", targetType: tt, restrictions: atom.restrictions || [] };
}

/** Legal targets for one atom, each tagged with its `atomIndex`; null if non-targeted. */
function atomTargets(state, controllerId, atom, atomIndex) {
  const spec = atomTargetSpec(atom);
  if (!spec) return null;
  return enumerateTargets(state, controllerId, spec).map(t => ({ ...t, atomIndex }));
}

/**
 * All legal target-combinations for a list of atoms — a capped cartesian product
 * across the atoms that need a target. Returns:
 *   - `[[]]`   when no atom needs a target (one cast, empty targets)
 *   - `null`   when a targeting atom has ZERO legal targets (spell uncastable)
 *   - otherwise an array of flat, atomIndex-tagged target arrays.
 */
function expandAtoms(state, controllerId, atoms) {
  const perAtom = [];
  for (let i = 0; i < atoms.length; i++) {
    const tagged = atomTargets(state, controllerId, atoms[i], i);
    if (tagged === null) continue;            // non-targeted atom
    if (tagged.length === 0) return null;     // a required target has no legal pick
    perAtom.push(tagged);
  }
  if (perAtom.length === 0) return [[]];

  let combos = [[]];
  for (const options of perAtom) {
    const next = [];
    for (const combo of combos) {
      for (const opt of options) {
        next.push([...combo, opt]);
        if (next.length >= MAX_CAST_EXPANSIONS) break;
      }
      if (next.length >= MAX_CAST_EXPANSIONS) break;
    }
    combos = next;
  }
  return combos;
}

/**
 * Expand a HIGH program into concrete cast choices:
 *   sequence → [{ targets }]                          (one per target-combo)
 *   modal    → [{ chosenMode, targets, label }]       (one per mode × target-combo)
 * An empty array means the spell has no legal cast right now (no legal targets).
 */
export function expandCastChoices(state, controllerId, program) {
  if (!program) return [];

  if (program.structure === "modal") {
    const out = [];
    (program.modal?.modes || []).forEach((mode, chosenMode) => {
      const combos = expandAtoms(state, controllerId, mode.atoms);
      if (combos === null) return; // this mode is uncastable (a target has no legal pick)
      for (const targets of combos) out.push({ chosenMode, targets, label: mode.label });
    });
    return out;
  }

  const combos = expandAtoms(state, controllerId, program.atoms || []);
  if (combos === null) return [];
  return combos.map(targets => ({ targets }));
}

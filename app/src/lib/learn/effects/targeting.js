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
import { isNonChosenTargetType } from "../targetTypes.js";

// Bounds the cartesian blow-up of a multi-target spell (CR-spirit: a "deal 4
// divided among any number of targets" would explode legalChoices + the UI). The
// P2.5 modeled shapes have ≤1 targeting atom, so this never bites in practice; it's
// a backstop so a future multi-target atom can't DoS the action list.
const MAX_CAST_EXPANSIONS = 64;

// Sentinel option for an atom with an OPTIONAL TARGET ("up to one target …", CR 115.1b): when chosen
// it contributes NO target to the combo (the player/chooser declines). Kept distinct from a real
// target so expandAtoms can drop it back out of the flat, atomIndex-tagged target list. (This is the
// `optionalTarget` flag — a cast-time 0-or-1 TARGET; NOT the `optional` flag, which is α2's separate
// resolution-time "you may take this whole effect" yes/no handled in runProgram.)
const DECLINE = Symbol("decline-optional-target");

/** Integers [a, b] inclusive (MODAL-2: the mode-count sizes for an "up to" pick). */
function range(a, b) {
  const out = [];
  for (let i = a; i <= b; i++) out.push(i);
  return out;
}

/** All ascending-order k-combinations of indices 0..n-1 (MODAL-2 mode-combinations). */
function kCombinations(n, k) {
  if (k <= 0 || k > n) return [];
  const out = [];
  const pick = (start, combo) => {
    if (combo.length === k) { out.push(combo.slice()); return; }
    for (let i = start; i < n; i++) { combo.push(i); pick(i + 1, combo); combo.pop(); }
  };
  pick(0, []);
  return out;
}

// MULTI-COUNT TARGET (CR 601.2c "up to N target …") — every target-subset of size [minK..maxK] drawn from `tagged`
// (each subset an array of atomIndex-tagged targets). Includes the EMPTY subset when minK is 0 (choosing zero is a
// legal "up to" cast, CR 601.2c). Bounded by MAX_CAST_EXPANSIONS so a large graveyard/board can't DoS the cast list
// (a subset of the legal combos is still offered — never a dropped clause, only fewer target-choices). Returns null
// iff no subset of the required minimum size exists (n < minK → the spell is uncastable, e.g. an exact "N target").
function targetSubsets(tagged, minK, maxK) {
  const n = tagged.length;
  const lo = Math.max(0, minK);
  const hi = Math.min(maxK, n);
  if (n < lo) return null; // can't meet the required minimum
  const out = [];
  for (let k = lo; k <= hi; k++) {
    if (k === 0) { out.push([]); continue; } // choose zero — a legal "up to" cast
    for (const combo of kCombinations(n, k)) {
      out.push(combo.map((ix) => tagged[ix]));
      if (out.length >= MAX_CAST_EXPANSIONS) return out; // cap the option blow-up (backstop)
    }
  }
  return out.length ? out : null;
}

/** An effect-like target spec for one atom, or null when the atom is non-targeted. */
function atomTargetSpec(atom) {
  const tt = atom?.targetType;
  if (!tt || isNonChosenTargetType(tt)) return null;
  // P3.1 counter: a spell-target spec carries the spellFilter for stack-spell enumeration. The MV (exactMv —
  // Spell Snare / Mental Misstep; minMv/maxMv — Disdainful Stroke / Minor Misstep) and color (colorFilter —
  // Gainsay / Frazzle / Ceremonious Rejection / Neutralizing Blast) restrictions ride along too, so the cast-
  // path enumerator (spellEffects.spellMatchesCounterFilter, which reads them off this spec) offers exactly the
  // legal stack spells — never a wrong-MV/wrong-color target (CR 601.2c + CREED FP-forbidden). Only carry a
  // field when the atom set it (undefined keys are ignored by the matcher; this keeps the spec minimal).
  if (tt === "spell") return {
    kind: "counter", targetType: "spell", spellFilter: atom.spellFilter || "any",
    ...(atom.exactMv != null && { exactMv: atom.exactMv }),
    ...(atom.minMv != null && { minMv: atom.minMv }),
    ...(atom.maxMv != null && { maxMv: atom.maxMv }),
    ...(atom.colorFilter != null && { colorFilter: atom.colorFilter }),
  };
  // Graveyard recursion: a graveyard-card target carries the cardFilter (creature/any) so
  // enumerateTargets surfaces only the matching graveyard cards. anyGraveyard (Reanimate / Hymn of
  // Rebirth — "from a graveyard") widens the scope to EVERY player's graveyard; opponentGraveyard
  // (Ashen Powder — "from an opponent's graveyard") scopes it to opponents only. Absent → the caster's
  // own graveyard (the default return-from-graveyard / own-graveyard reanimate).
  if (tt === "graveyardCard") return { kind: "return-gy", targetType: "graveyardCard", cardFilter: atom.cardFilter || "any", anyGraveyard: atom.anyGraveyard, opponentGraveyard: atom.opponentGraveyard };
  // A PLAYER-target atom — δ-1b hand disruption (opponent) and EDICTS sacrifice (player/opponent).
  // Enumerated purely by targetType ("opponent" → opponents, "player" → every player); the victim's
  // hand/creature is chosen at RESOLUTION, not enumeration, so the spec carries no extra filter. The
  // `kind` is informational (enumerateTargets keys on targetType, not kind).
  if (tt === "opponent" || tt === "player") return { kind: atom.op, targetType: tt };
  return { kind: atom.op === "destroy" ? "destroy" : "damage", targetType: tt, restrictions: atom.restrictions || [] };
}

/** Legal targets for one atom, each tagged with its `atomIndex`; null if non-targeted.
 * `sourceColors` (the casting spell's colors) is threaded to enumerateTargets for KW-PROTECTION
 * targeting (CR 702.16b) — empty on the trigger-flush / ability paths (a safe FN, PR-later).
 * A `role` (FIGHT-PAIR / DAMAGE-TARGET-POWER) rides along so the runner/resolver can tell the chosen
 * fighter (the dealer) from the chosen target (the dealee) — both targets share the atomIndex. */
function atomTargets(state, controllerId, atom, atomIndex, sourceColors = []) {
  const spec = atomTargetSpec(atom);
  if (!spec) return null;
  return enumerateTargets(state, controllerId, spec, sourceColors).map(t => ({ ...t, atomIndex, ...(atom.role ? { role: atom.role } : {}) }));
}

/** The SECONDARY target option list for a TWO-CHOSEN-TARGET atom (FIGHT-PAIR / DAMAGE-TARGET-POWER) — the
 * chosen FIGHTER ("target creature you control"), distinct restrictions from the primary (enemy) target.
 * Returns null when the atom has no secondary spec (the single-target case — unchanged). Both option lists
 * carry the SAME atomIndex (one atom) but different `role`, so targetsForAtom routes both to the resolver. */
function secondaryAtomTargets(state, controllerId, atom, atomIndex, sourceColors = []) {
  if (!atom?.secondaryTargetType) return null;
  const spec = atomTargetSpec({ op: atom.op, targetType: atom.secondaryTargetType, restrictions: atom.secondaryRestrictions || [] });
  if (!spec) return null;
  return enumerateTargets(state, controllerId, spec, sourceColors).map(t => ({ ...t, atomIndex, role: atom.secondaryRole || "fighter" }));
}

/**
 * All legal target-combinations for a list of atoms — a capped cartesian product
 * across the atoms that need a target. Returns:
 *   - `[[]]`   when no atom needs a target (one cast, empty targets)
 *   - `null`   when a targeting atom has ZERO legal targets (spell uncastable)
 *   - otherwise an array of flat, atomIndex-tagged target arrays.
 */
function expandAtoms(state, controllerId, atoms, sourceColors = []) {
  const perAtom = [];
  // atomIndexes that carry a two-target pair (FIGHT-PAIR / DAMAGE-TARGET-POWER) — the fighter + target of
  // ONE such atom must be DISTINCT creatures (CR 701.12 / "another target creature"); enforced post-combine.
  const pairAtomIdx = [];
  for (let i = 0; i < atoms.length; i++) {
    const atom = atoms[i];
    const tagged = atomTargets(state, controllerId, atom, i, sourceColors);
    if (tagged === null) continue;            // non-targeted atom
    // MULTI-COUNT TARGET ("up to N target …"): this atom chooses a SUBSET of [minTargets..maxTargets] distinct legal
    // targets (all tagged atomIndex i). Push the subsets as this atom's options; the combine loop SPREADS a subset
    // (an array) into the combo. Gated on maxTargets>1 — every single-target atom takes the unchanged path below, so
    // existing casts are byte-identical (the flip-diff proves LOST=0). A multi-count atom has no secondary/pair.
    if (atom.maxTargets > 1) {
      const subsets = targetSubsets(tagged, atom.minTargets ?? 0, atom.maxTargets);
      if (subsets === null) return null;      // a required minimum can't be met → uncastable
      perAtom.push(subsets);
      continue;
    }
    if (atom.optionalTarget) {
      // "up to one target …": MAY take a target or none. Offer each legal target PLUS a decline
      // option — so the cast is legal even with zero legal targets, and real targets come BEFORE
      // the decline so the trigger chooser / UI prefer an actual target over the no-op decline.
      perAtom.push([...tagged, DECLINE]);
      // NOTE: optional PRIMARY (e.g. fight-pair "fights up to one …" — Smell Fear) falls through to the
      // SECONDARY block below so the MANDATORY fighter ("you control") is still enumerated. A declined
      // primary leaves only the fighter in the combo; applyFightPair no-ops a fighter with no enemy.
    } else {
      if (tagged.length === 0) return null;   // a required target has no legal pick
      perAtom.push(tagged);
    }
    // TWO-CHOSEN-TARGET (FIGHT-PAIR / DAMAGE-TARGET-POWER): also enumerate the SECONDARY target (the chosen
    // fighter "you control"). Both lists share atomIndex i; distinctness is enforced after the cartesian.
    const secondary = secondaryAtomTargets(state, controllerId, atom, i, sourceColors);
    if (secondary !== null) {
      if (secondary.length === 0) return null; // the fighter half has no legal pick → uncastable
      perAtom.push(secondary);
      pairAtomIdx.push(i);
    }
  }
  if (perAtom.length === 0) return [[]];

  let combos = [[]];
  for (const options of perAtom) {
    const next = [];
    for (const combo of combos) {
      for (const opt of options) {
        // opt is: DECLINE (add nothing) | a MULTI-COUNT subset (an array — spread its targets) | a single target.
        next.push(opt === DECLINE ? [...combo] : Array.isArray(opt) ? [...combo, ...opt] : [...combo, opt]);
        if (next.length >= MAX_CAST_EXPANSIONS) break;
      }
      if (next.length >= MAX_CAST_EXPANSIONS) break;
    }
    combos = next;
  }
  // DISTINCTNESS — drop any combo where a pair atom's two creatures are the same object (CR 701.12 — a
  // creature can't fight itself; "another target creature" demands two distinct). Keeps every other combo.
  if (pairAtomIdx.length) {
    combos = combos.filter(combo => pairAtomIdx.every(idx => {
      const pair = combo.filter(t => t.atomIndex === idx);
      return pair.length < 2 || new Set(pair.map(t => t.id)).size === pair.length;
    }));
    if (combos.length === 0) return null; // only self-pairings were possible → no legal cast
  }
  return combos;
}

/**
 * Expand a HIGH program into concrete cast choices:
 *   sequence → [{ targets }]                          (one per target-combo)
 *   modal    → [{ chosenMode, targets, label }]       (one per mode × target-combo)
 * An empty array means the spell has no legal cast right now (no legal targets).
 */
export function expandCastChoices(state, controllerId, program, sourceColors = []) {
  if (!program) return [];

  if (program.structure === "modal") {
    const modes = program.modal?.modes || [];
    const chooseCount = program.modal?.chooseCount || 1;
    // Single-pick "Choose one" (the P2.5 path): one cast per (mode × target-combo), chosenMode = an INT.
    if (chooseCount <= 1) {
      const out = [];
      modes.forEach((mode, chosenMode) => {
        const combos = expandAtoms(state, controllerId, mode.atoms, sourceColors);
        if (combos === null) return; // this mode is uncastable (a target has no legal pick)
        for (const targets of combos) out.push({ chosenMode, targets, label: mode.label });
      });
      return out;
    }
    // MODAL-2/N "Choose two" / "one or both" / "one or more": one cast per (mode-COMBINATION × target-combo).
    // Each combination's atoms are concatenated in ASCENDING mode order (matching programAtoms' execution
    // order), and targets are enumerated over that concatenation so their atomIndex tags are GLOBAL +
    // aligned. chosenMode = an ARRAY of mode indices. `upTo` ("one or both") and `atLeastOne` ("one or more")
    // both offer every subset size 1..chooseCount (chooseCount = the mode count for "one or more"); a plain
    // "Choose two" offers exactly `chooseCount`-sized combos.
    const sizes = (program.modal?.upTo || program.modal?.atLeastOne) ? range(1, chooseCount) : [chooseCount];
    const out = [];
    for (const size of sizes) {
      for (const combo of kCombinations(modes.length, size)) {
        const concatAtoms = combo.flatMap((k) => modes[k].atoms);
        const combos = expandAtoms(state, controllerId, concatAtoms, sourceColors);
        if (combos === null) continue; // some required target in this mode-combo has no legal pick
        const label = combo.map((k) => modes[k].label).join(" + ");
        for (const targets of combos) out.push({ chosenMode: combo, targets, label });
      }
    }
    return out;
  }

  const combos = expandAtoms(state, controllerId, program.atoms || [], sourceColors);
  if (combos === null) return [];
  return combos.map(targets => ({ targets }));
}

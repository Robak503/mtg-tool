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
import { findPermanent } from "../gameState.js";

// A permanent's mana value (CR 202.3), read off the live battlefield permanent by id. Used by the
// COLLECTIVE-X-MV restriction ("with total mana value X or less") to sum the chosen subset's MVs. Reads the
// slim-index `cmc` field (a number); 0 when the permanent is gone or lacks a cmc (a SAFE under-count — it can
// only ADMIT a subset, never wrongly reject a legal one; a stale id contributing 0 is harmless since the
// destroy resolver skips missing permanents). Pure.
function permanentManaValue(state, permanentId) {
  const lk = findPermanent(state, permanentId);
  return lk?.permanent?.card?.cmc ?? 0;
}

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

/** All ascending-order k-combinations of indices 0..n-1 (MODAL-2 mode-combinations), capped at `limit` rows.
 * The DFS stops the moment `limit` combos exist, so the result is EXACTLY the first-`limit` prefix of the full
 * ascending enumeration (byte-identical to slicing the unbounded list — pinned by test). The cap is the OOM fix:
 * without it a "up to N targets" atom over a big pool (C(32,10) ≈ 64.5M index-arrays, ~7-8GB) fully materializes
 * inside ONE legalActionsForPlayer call before the callers' post-hoc MAX_CAST_EXPANSIONS cap can bite. */
function kCombinations(n, k, limit = Infinity) {
  if (k <= 0 || k > n || limit <= 0) return [];
  const out = [];
  const pick = (start, combo) => {
    if (combo.length === k) { out.push(combo.slice()); return; }
    for (let i = start; i < n; i++) {
      combo.push(i); pick(i + 1, combo); combo.pop();
      if (out.length >= limit) return; // capacity reached — unwind the whole DFS
    }
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
    // Thread the REMAINING capacity into the enumerator so it never materializes more than the cap needs
    // (the post-push return below then fires on the last admitted row — same output, bounded memory).
    for (const combo of kCombinations(n, k, MAX_CAST_EXPANSIONS - out.length)) {
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
    // COPY-SPELL (Double Major) — "copy target creature spell YOU CONTROL". A copy is not a counter, so it
    // enumerates own-controller spells (spellController) and ignores the uncounterability gates (copyNotCounter).
    // Only the copy-creature-spell atom sets these; every counter atom leaves them undefined (byte-identical).
    ...(atom.spellController != null && { spellController: atom.spellController }),
    ...(atom.copyNotCounter && { copyNotCounter: true }),
  };
  // Graveyard recursion: a graveyard-card target carries the cardFilter (creature/any) so
  // enumerateTargets surfaces only the matching graveyard cards. anyGraveyard (Reanimate / Hymn of
  // Rebirth — "from a graveyard") widens the scope to EVERY player's graveyard; opponentGraveyard
  // (Ashen Powder — "from an opponent's graveyard") scopes it to opponents only. Absent → the caster's
  // own graveyard (the default return-from-graveyard / own-graveyard reanimate).
  if (tt === "graveyardCard") return { kind: "return-gy", targetType: "graveyardCard", cardFilter: atom.cardFilter || "any", anyGraveyard: atom.anyGraveyard, opponentGraveyard: atom.opponentGraveyard, ...(atom.milledThisTurnOnly && { milledThisTurnOnly: true }) };
  // A PLAYER-target atom — δ-1b hand disruption (opponent) and EDICTS sacrifice (player/opponent).
  // Enumerated purely by targetType ("opponent" → opponents, "player" → every player); the victim's
  // hand/creature is chosen at RESOLUTION, not enumeration, so the spec carries no extra filter. The
  // `kind` is informational (enumerateTargets keys on targetType, not kind).
  if (tt === "opponent" || tt === "player") return { kind: atom.op, targetType: tt };
  // ANOTHER-TARGET-YOU-CONTROL (CR 109.5) — a chosen own-side target that may NOT be the source permanent
  // ("another target creature you control" — Benevolent Hydra). Carry the atom's excludeSource flag into the
  // spec so enumerateTargets' creatureYouControl branch drops ctx.sourceId. Only set when present (undefined
  // keys are ignored downstream; every other targeted atom is byte-identical).
  return { kind: atom.op === "destroy" ? "destroy" : "damage", targetType: tt, restrictions: atom.restrictions || [], ...(atom.excludeSource && { excludeSource: true }) };
}

/** Legal targets for one atom, each tagged with its `atomIndex`; null if non-targeted.
 * `sourceColors` (the casting spell's colors) is threaded to enumerateTargets for KW-PROTECTION
 * targeting (CR 702.16b) — empty on the trigger-flush / ability paths (a safe FN, PR-later).
 * A `role` (FIGHT-PAIR / DAMAGE-TARGET-POWER) rides along so the runner/resolver can tell the chosen
 * fighter (the dealer) from the chosen target (the dealee) — both targets share the atomIndex. */
function atomTargets(state, controllerId, atom, atomIndex, sourceColors = [], ctx = null) {
  const spec = atomTargetSpec(atom);
  if (!spec) return null;
  return enumerateTargets(state, controllerId, spec, sourceColors, ctx).map(t => ({ ...t, atomIndex, ...(atom.role ? { role: atom.role } : {}) }));
}

/** The SECONDARY target option list for a TWO-CHOSEN-TARGET atom (FIGHT-PAIR / DAMAGE-TARGET-POWER) — the
 * chosen FIGHTER ("target creature you control"), distinct restrictions from the primary (enemy) target.
 * Returns null when the atom has no secondary spec (the single-target case — unchanged). Both option lists
 * carry the SAME atomIndex (one atom) but different `role`, so targetsForAtom routes both to the resolver. */
function secondaryAtomTargets(state, controllerId, atom, atomIndex, sourceColors = [], ctx = null) {
  if (!atom?.secondaryTargetType) return null;
  const spec = atomTargetSpec({ op: atom.op, targetType: atom.secondaryTargetType, restrictions: atom.secondaryRestrictions || [] });
  if (!spec) return null;
  return enumerateTargets(state, controllerId, spec, sourceColors, ctx).map(t => ({ ...t, atomIndex, role: atom.secondaryRole || "fighter" }));
}

/**
 * All legal target-combinations for a list of atoms — a capped cartesian product
 * across the atoms that need a target. Returns:
 *   - `[[]]`   when no atom needs a target (one cast, empty targets)
 *   - `null`   when a targeting atom has ZERO legal targets (spell uncastable)
 *   - otherwise an array of flat, atomIndex-tagged target arrays.
 */
function expandAtoms(state, controllerId, atoms, sourceColors = [], ctx = null) {
  const perAtom = [];
  // atomIndexes that carry a two-target pair (FIGHT-PAIR / DAMAGE-TARGET-POWER) — the fighter + target of
  // ONE such atom must be DISTINCT creatures (CR 701.12 / "another target creature"); enforced post-combine.
  const pairAtomIdx = [];
  for (let i = 0; i < atoms.length; i++) {
    const atom = atoms[i];
    const tagged = atomTargets(state, controllerId, atom, i, sourceColors, ctx);
    if (tagged === null) continue;            // non-targeted atom
    // MULTI-COUNT TARGET ("up to N target …"): this atom chooses a SUBSET of [minTargets..maxTargets] distinct legal
    // targets (all tagged atomIndex i). Push the subsets as this atom's options; the combine loop SPREADS a subset
    // (an array) into the combo. Gated on maxTargets>1 — every single-target atom takes the unchanged path below, so
    // existing casts are byte-identical (the flip-diff proves LOST=0). A multi-count atom has no secondary/pair.
    // (maxTargets:1 + minTargets:0 = the "up to ONE target" form — same subset path, subsets [t] or [].
    // A plain single-target atom carries NO maxTargets, so the unchanged path below still serves it.)
    if (atom.maxTargets > 1 || (atom.maxTargets === 1 && (atom.minTargets ?? 1) === 0)) {
      let subsets = targetSubsets(tagged, atom.minTargets ?? 0, atom.maxTargets);
      if (subsets === null) return null;      // a required minimum can't be met → uncastable
      // COLLECTIVE-X-MV restriction (CR 601.2c — "with total mana value X or less"): keep ONLY subsets whose
      // chosen permanents' mana values SUM to ≤ the paid {X} (ctx.xValue, threaded from the ETB self-trigger).
      // Rampaging Yao Guai: "destroy any number of target artifacts and/or enchantments with total mana value X
      // or less". This is a restriction on the CHOSEN SET, not a per-target cap — so it's enforced HERE, at
      // subset enumeration, never as a resolution-time truncation (which could over-destroy past the budget — a
      // FORBIDDEN partial-model FP, CREED). A missing/zero X (no {X} paid, or the referent unset) yields cap 0 →
      // only the empty subset survives (destroy nothing) — the CR-correct "MV ≤ 0" behavior, never a fabricated
      // over-destroy. cap is read from ctx.xValue; each target's MV from its live permanent's cmc (CR 202.3).
      if (atom.totalMvXConstraint) {
        const cap = Math.max(0, ctx?.xValue ?? 0);
        subsets = subsets.filter((sub) => sub.reduce((sum, t) => sum + permanentManaValue(state, t.id), 0) <= cap);
        if (subsets.length === 0) return null; // no legal subset (not even empty) → shouldn't happen (empty is MV 0 ≤ cap), but guard
      }
      // AUTO-PICK ORDER (every subset atom): sort LARGEST subset first so the trigger-flush chooser
      // (gameEngine.chooseTriggerTargets, which takes the FIRST all-correct-side candidate) picks the
      // MAXIMAL correct-side set instead of the (also-legal, but vacuous) empty subset that k-ascending
      // order surfaces first. This was originally gated to the one totalMvXConstraint atom (Rampaging
      // Yao Guai) — whose author documented exactly this empty-first hazard — leaving EVERY other
      // subset-trigger family (Baloth Null's graveyard returns, Gavony Silversmith's counters, Kitesail
      // Cleric's taps, …) resolving as a silent no-op at flush: classified native, fired, chose the empty
      // subset, did nothing (live-probed). Generalizing the sort makes those cards' runtime DO what the
      // classifier claims. Side-correctness is unchanged — the chooser still accepts only an
      // ALL-correct-side candidate per atomTargetIntent (enemy effects hit only enemies, own-side only
      // own), falling through smaller subsets to EMPTY only when no correct-side pick exists. Ties keep
      // targetSubsets' deterministic combination order → serialize-stable. A human still sees every subset.
      subsets = subsets.slice().sort((a, b) => b.length - a.length);
      perAtom.push(subsets);
      continue;
    }
    // X-COUNT TARGET ("Exile X target creatures", Curse of the Swine): the target count IS the chosen X
    // (ctx.xValue, bound at cast from the {X} mana cost). Pick EXACTLY x distinct legal targets (min=max=x) —
    // targetSubsets(tagged, x, x) yields precisely the size-x combinations, all tagged atomIndex i, capped by
    // MAX_CAST_EXPANSIONS. Gated on targetCountX (every non-X atom takes the unchanged paths below, so existing
    // casts are byte-identical → flip-diff LOST=0). An X larger than the legal-target pool → null → uncastable
    // at that X (CR 601.2c — you can't choose more targets than exist; the cast is offered only where n ≥ x).
    if (atom.targetCountX) {
      const x = Math.max(0, ctx?.xValue || 0);
      if (x === 0) return null;               // X=0 exiles nothing — a no-op cast, not surfaced (FN-safe)
      const subsets = targetSubsets(tagged, x, x);
      if (subsets === null) return null;      // fewer than x legal targets → uncastable at this X
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
    const secondary = secondaryAtomTargets(state, controllerId, atom, i, sourceColors, ctx);
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
 *
 * `ctx` (optional) carries the trigger's resolution context — currently only `defenderId` (CR 509.1a),
 * threaded from an ATTACKS trigger so a who:"defendingPlayer" controller restriction ("… defending player
 * controls", Kogla) enumerates ONLY the specific attacked player's permanents. Absent on spell / non-attack
 * paths (the restriction only arises off an attacks trigger, so those never see it → empty pool, drop).
 */
export function expandCastChoices(state, controllerId, program, sourceColors = [], ctx = null) {
  if (!program) return [];

  if (program.structure === "modal") {
    const modes = program.modal?.modes || [];
    const chooseCount = program.modal?.chooseCount || 1;
    // Single-pick "Choose one" (the P2.5 path): one cast per (mode × target-combo), chosenMode = an INT.
    if (chooseCount <= 1) {
      const out = [];
      modes.forEach((mode, chosenMode) => {
        const combos = expandAtoms(state, controllerId, mode.atoms, sourceColors, ctx);
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
    let sizes = (program.modal?.upTo || program.modal?.atLeastOne) ? range(1, chooseCount) : [chooseCount];
    // CONDITIONAL-BOTH (Akroma's Will — "If you control a commander as you cast this spell, you may choose
    // both instead", CR 601.2b): the size-2 combo is legal ONLY while the caster controls a commander ON THE
    // BATTLEFIELD (CR 109.4 — a command-zone commander is controlled by no one; the isCommander flag rides
    // the card onto the permanent, the Fierce-Guardianship discipline). Enumeration IS cast time, so this
    // live read is exactly the printed "as you cast" check; without a commander the card is a plain
    // "Choose one" (size-1 combos only).
    if (program.modal?.conditionalBothCommander
      && !(state.players?.[controllerId]?.battlefield || []).some((p) => p.card?.isCommander === true)) {
      sizes = sizes.filter((s) => s <= 1);
    }
    const out = [];
    for (const size of sizes) {
      // MAX_CAST_EXPANSIONS here is a pure DoS backstop on the mode-combination count: no real card's mode
      // count comes near C(n,k) > 64 (that needs 8+ modes), so every real modal cast list is byte-identical.
      for (const combo of kCombinations(modes.length, size, MAX_CAST_EXPANSIONS)) {
        const concatAtoms = combo.flatMap((k) => modes[k].atoms);
        const combos = expandAtoms(state, controllerId, concatAtoms, sourceColors, ctx);
        if (combos === null) continue; // some required target in this mode-combo has no legal pick
        const label = combo.map((k) => modes[k].label).join(" + ");
        for (const targets of combos) out.push({ chosenMode: combo, targets, label });
      }
    }
    return out;
  }

  const combos = expandAtoms(state, controllerId, program.atoms || [], sourceColors, ctx);
  if (combos === null) return [];
  return combos.map(targets => ({ targets }));
}

// Test-only handles (repo convention) — pins the bounded-enumeration prefix identity + the OOM guard.
export const _internals = { kCombinations, targetSubsets, MAX_CAST_EXPANSIONS };

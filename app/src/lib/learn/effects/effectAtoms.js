/**
 * effects/effectAtoms.js — the Atom resolver registry (Phase-2 P2.2 keystone).
 *
 * A data table keyed by `Atom.op`, each entry a pure `(state, atom, ctx) => state`
 * resolver. `ctx = { controller, targets }` (the cast-time choices frozen onto the
 * stack object). This is the mechanism that replaces the legacy closure.
 *
 * Parity by construction: the three keystone atoms delegate to the SAME per-effect
 * helpers the legacy `resolveSpellEffect` uses (`spellEffects.applyDamageEffect`
 * etc.), so an EffectProgram of these atoms is byte-for-byte equivalent to the old
 * path — there is no second implementation to drift. New atoms (pump, tokens,
 * counters, …) get their own resolvers in later PRs.
 *
 * Leaf-ish: imports only the shared effect helpers from spellEffects. Does NOT
 * import resolvers or the runner.
 */

import {
  applyDamageEffect,
  applyDestroyEffect,
  applyDrawEffect,
} from "../spellEffects.js";
import { addContinuousEffect } from "../layers.js";
import { logEvent, destroyLethalCreatures } from "../gameState.js";
import { checkDiesTriggers } from "../triggers.js";

/**
 * P2.3 pump — "+X/+X until end of turn" (Giant Growth family). Does NOT mutate
 * P/T directly: it registers a CR 613.4c (layer 7c) continuous effect into the
 * layer engine for each targeted creature, with an endOfTurn duration so it wears
 * off at the cleanup step (CR 514.2 — `expireContinuousEffects`, already wired in
 * gameEngine). Derived P/T (combat, SBAs, the AI) reads through layers, so the
 * pump shows up everywhere. The mechanism was built + tested in Phase 1; this
 * atom just emits the record.
 */
function applyPumpEffect(state, atom, ctx) {
  let next = state;
  const power = atom.ptDelta?.p || 0;
  const toughness = atom.ptDelta?.t || 0;
  for (const target of ctx.targets || []) {
    if (target.type !== "creature") continue;
    next = addContinuousEffect(next, {
      layer: 7,
      sublayer: "7c",
      op: { layerOp: "ptModify", power, toughness },
      affects: { mode: "fixed", permanentIds: [target.id] },
      duration: { kind: "endOfTurn", turn: next.turn },
      source: { kind: "resolution", permanentId: null, cardName: ctx.cardName || null },
    }).state;
  }
  // A negative pump (-X/-Y, e.g. Disfigure / Last Gasp / Dismember) can drop a
  // creature's DERIVED toughness to <= 0 — run the lethal SBA so it dies at
  // resolution (CR 704.5f), exactly as the damage atom does. A positive pump
  // (Giant Growth) finds nothing lethal, so this is a no-op for it. Without this
  // the creature would silently survive at 0 toughness until the next combat step.
  const lethal = destroyLethalCreatures(next);
  next = checkDiesTriggers(lethal.state, lethal.dead);
  return logEvent(next, { kind: "spell-effect", effect: "pump", power, toughness, targets: (ctx.targets || []).map(t => t.id) });
}

export const ATOM_RESOLVERS = Object.freeze({
  "deal-damage": (state, atom, ctx) =>
    applyDamageEffect(state, { controller: ctx.controller, amount: atom.amount, targetType: atom.targetType, targets: ctx.targets }),
  "destroy": (state, atom, ctx) =>
    applyDestroyEffect(state, { controller: ctx.controller, targets: ctx.targets }),
  "draw": (state, atom, ctx) =>
    applyDrawEffect(state, { controller: ctx.controller, amount: atom.amount }),
  "pump": (state, atom, ctx) => applyPumpEffect(state, atom, ctx),
});

/**
 * Resolve a single atom. Returns the new state, or null when there is no resolver
 * for the atom's op — the caller (runEffectProgram) treats null as "can't model
 * this" and routes to the Arbiter seam rather than fabricating an effect.
 */
export function resolveAtom(state, atom, ctx) {
  const fn = ATOM_RESOLVERS[atom?.op];
  if (!fn) return null;
  return fn(state, atom, ctx);
}

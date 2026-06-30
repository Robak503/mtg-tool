/**
 * effects/effectAtoms.js — the Atom resolver registry (Phase-2 P2.2 keystone).
 *
 * A data table keyed by `Atom.op`, each entry a pure `(state, atom, ctx) => state`
 * resolver. `ctx = { controller, targets }` (the cast-time choices frozen onto the
 * stack object). This is the mechanism that replaces the legacy closure.
 *
 * Parity by construction: the keystone atoms delegate to the SAME per-effect helpers the
 * legacy `resolveSpellEffect` uses (`spellEffects.applyDamageEffect` etc.), so an EffectProgram
 * of these atoms is byte-for-byte equivalent to the old path — there is no second implementation
 * to drift.
 *
 * STRUCTURE (WAVE 0 split): this file is now a thin BARREL. Each atom FAMILY lives in its own
 * module under ./atoms/, exporting a partial op→resolver map plus the named functions that are
 * public or called cross-module. The barrel assembles ATOM_RESOLVERS from those partial maps and
 * re-exports the public symbols. The import graph is a DAG: shared.js is a strict leaf (imports no
 * sibling atoms); {tokens,library,zones} <- removal <- stack.
 */

import { lifeResolvers } from "./atoms/life.js";
import { tokenResolvers } from "./atoms/tokens.js";
import { counterResolvers } from "./atoms/counters.js";
import { zoneResolvers } from "./atoms/zones.js";
import { removalResolvers } from "./atoms/removal.js";
import { sacLandResolvers } from "./atoms/sacLand.js";
import { libraryResolvers } from "./atoms/library.js";
import { combatResolvers } from "./atoms/combat.js";
import { handResolvers } from "./atoms/hand.js";
import { stackResolvers } from "./atoms/stack.js";
import { miscResolvers } from "./atoms/misc.js";
import { manifestResolvers } from "./atoms/manifest.js";
import { amassResolvers } from "./atoms/amass.js";
import { selfReturnResolvers } from "./atoms/selfReturn.js";
import { winGameResolvers } from "./atoms/winGame.js";
import { rollResolvers } from "./atoms/roll.js";
import { freeCastResolvers } from "./atoms/freeCast.js";

// ─── Re-export the public atom symbols (consumers import these from the barrel path) ──────────
export { applyCreateToken, applyCreateTokenCopy } from "./atoms/tokens.js";
export { enterCardFromZone } from "./atoms/zones.js";
export { sacrificeCreatureEffect, advanceSacrificeChain } from "./atoms/removal.js";
export { applyProliferate } from "./atoms/counters.js";
export { applyEarthbend } from "./atoms/combat.js";
export { counterSpellById, controllerSacSubtypeMatch } from "./atoms/stack.js";
export { tutorManaValue, cardMatchesTutorFilter, shuffleControllerLibrary } from "./atoms/library.js";
export { advanceDiscardChain } from "./atoms/hand.js";
export { applyDivideDamage } from "./atoms/misc.js";

export const ATOM_RESOLVERS = Object.freeze({
  ...stackResolvers,   // deal-damage, counter, self-attach
  ...removalResolvers, // destroy, exile, sacrifice
  ...sacLandResolvers, // sacrifice-land (SAC-LAND-RAMP) — "Sacrifice a land." controller self-sac (Roiling Regrowth / Cycle of Renewal)
  ...miscResolvers,    // draw, fog, create-emblem, divide-damage
  ...combatResolvers,  // pump, animate, earthbend, regenerate, tap, untap
  ...lifeResolvers,    // gain-life, lose-life
  ...zoneResolvers,    // bounce, tuck, return-from-graveyard, reanimate
  ...counterResolvers, // add-counter, gain-experience, rad, proliferate
  ...tokenResolvers,   // create-token, create-named-token
  ...libraryResolvers, // tutor, shuffle, scry, surveil, impulse-dig, discover, mill
  ...handResolvers,    // discard-chosen, discard
  ...manifestResolvers, // manifest-dread (MKM, CR 701.62) — top-2 → one face-down 2/2, other → graveyard
  ...amassResolvers,   // amass (CR 701.47) — grow/mint the controller's Army (Orcish Bowmasters, Lazotep Sliver)
  ...selfReturnResolvers, // self-return (Wave 4 SELF-LTB) — Rancor PiG-return + Sword-of-the-Realms equipped-dies-return
  ...winGameResolvers, // win-game (UPKEEP-WIN, CR 104.2a) — "you win the game" / "target player loses the game"
  ...rollResolvers,    // roll-d20 (DICE-ROLL, CR 726) — Ancient Dragons roll → result-scaled token/draw payoff
  ...freeCastResolvers, // free-cast (CR 601.2b) — "you may cast a spell with MV N or less from your hand without paying its mana cost" (Expertise cycle); park for the action-layer cast-free/decline decision
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

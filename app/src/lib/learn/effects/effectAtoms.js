/**
 * effects/effectAtoms.js — the Atom resolver registry (Phase-2 P2.2 keystone).
 *
 * A data table keyed by `Atom.op`, each entry a pure `(state, atom, ctx) => state`
 * resolver. `ctx = { controller, targets }` (the cast-time choices frozen onto the
 * stack object). This is the mechanism that replaces the legacy closure.
 *
 * Parity by construction: the keystone atoms delegate to the shared per-effect helpers
 * (`spellEffects.applyDamageEffect` etc.) — the single resolution truth (W5 deleted the legacy
 * resolveSpellEffect that used to share them), so there is no second implementation to drift.
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
import { distributeCountersResolvers } from "./atoms/distributeCounters.js";
import { manifestResolvers } from "./atoms/manifest.js";
import { amassResolvers } from "./atoms/amass.js";
import { monarchResolvers } from "./atoms/monarch.js";
import { selfReturnResolvers } from "./atoms/selfReturn.js";
import { winGameResolvers } from "./atoms/winGame.js";
import { rollResolvers } from "./atoms/roll.js";
import { freeCastResolvers } from "./atoms/freeCast.js";
import { iteratedEdictResolvers } from "./atoms/iteratedEdict.js";
import { controlResolvers } from "./atoms/control.js";

// ─── Re-export the public atom symbols (consumers import these from the barrel path) ──────────
export { applyCreateToken, applyCreateTokenCopy } from "./atoms/tokens.js";
export { enterCardFromZone } from "./atoms/zones.js";
export { sacrificeCreatureEffect, advanceSacrificeChain } from "./atoms/removal.js";
export { applyProliferate } from "./atoms/counters.js";
export { applyEarthbend } from "./atoms/combat.js";
export { counterSpellById, controllerSacSubtypeMatch } from "./atoms/stack.js";
export { tutorManaValue, cardMatchesTutorFilter, shuffleControllerLibrary, bottomLibraryCardsByIds } from "./atoms/library.js";
export { advanceDiscardChain } from "./atoms/hand.js";
export { applyDivideDamage } from "./atoms/misc.js";
export { advanceEdictChain, applyEdictMode, edictLegalModes, edictLoseLife, EDICT_LIFE_LOSS } from "./atoms/iteratedEdict.js";

export const ATOM_RESOLVERS = Object.freeze({
  ...stackResolvers,   // deal-damage, counter, self-attach
  ...removalResolvers, // destroy, exile, sacrifice
  ...sacLandResolvers, // sacrifice-land (SAC-LAND-RAMP) — "Sacrifice a land." controller self-sac (Roiling Regrowth / Cycle of Renewal)
  ...miscResolvers,    // draw, fog, create-emblem, divide-damage
  ...distributeCountersResolvers, // distribute-counters (The Earth Crystal) — pendingChoice, mirrors divide-damage
  ...combatResolvers,  // pump, animate, earthbend, regenerate, tap, untap
  ...lifeResolvers,    // gain-life, lose-life
  ...zoneResolvers,    // bounce, tuck, return-from-graveyard, reanimate
  ...counterResolvers, // add-counter, gain-experience, rad, proliferate
  ...tokenResolvers,   // create-token, create-named-token
  ...libraryResolvers, // tutor, shuffle, scry, surveil, impulse-dig, discover, mill
  ...handResolvers,    // discard-chosen, discard
  ...manifestResolvers, // manifest-dread (MKM, CR 701.62) — top-2 → one face-down 2/2, other → graveyard
  ...amassResolvers,
  ...monarchResolvers, // MONARCH (CR 720) — "you become the monarch" crowns the program's controller   // amass (CR 701.47) — grow/mint the controller's Army (Orcish Bowmasters, Lazotep Sliver)
  ...selfReturnResolvers, // self-return (Wave 4 SELF-LTB) — Rancor PiG-return + Sword-of-the-Realms equipped-dies-return
  ...winGameResolvers, // win-game (UPKEEP-WIN, CR 104.2a) — "you win the game" / "target player loses the game"
  ...rollResolvers,    // roll-d20 (DICE-ROLL, CR 726) — Ancient Dragons roll → result-scaled token/draw payoff
  ...freeCastResolvers, // free-cast (CR 601.2b) — "you may cast a spell with MV N or less from your hand without paying its mana cost" (Expertise cycle); park for the action-layer cast-free/decline decision
  ...iteratedEdictResolvers, // iterated-edict (Torment of Hailfire, CR 118.9) — X × per-opponent (lose 3 / sac nonland / discard) pausing edict chain
  ...controlResolvers, // gain-control (CR 720 / 702.10c) — indefinite control-change of a target creature/subtype (Sliver Overlord "Gain control of target Sliver")
});

/**
 * WI-3 (payoff-pause seam) — the atom ops whose RESOLVER can SUSPEND resolution by setting
 * `state.pendingChoice` (a resolution-time player choice) instead of finishing in one call.
 * Declared HERE, beside ATOM_RESOLVERS, so the pause list lives next to the registry it
 * describes; every entry is validated against the registry at module load, so a typo or a
 * renamed op THROWS instead of silently drifting. A NEW pausing resolver must be added here
 * (the op comments below name each setter so the audit is greppable).
 *
 * Consumer: parser.js' optional-payment matchers (matchOptionalManaPayment /
 * matchOptionalSacBySubtype) reject a payoff whose NON-LAST atom is in this set — the payoff
 * settlers (runProgram.resolveOptionalManaPaymentChoice / resolveOptionalSacChoice) chain a
 * mid-payoff pause onto the PROGRAM continuation, so any payoff atoms after the pausing one
 * would be silently dropped (a forbidden dropped-atom FP). A LAST-position pausing payoff is
 * fine — nothing follows it to drop.
 */
const PAUSING_OPS_LIST = [
  "tutor", // library.js applyTutor → setPendingTutorChoice
  "scry", // library.js applyScrySurveilAtom → setPendingScryChoice
  "surveil", // library.js applyScrySurveilAtom → setPendingScryChoice (mode "surveil")
  "reorder-top", // library.js applyReorderTopAtom → setPendingScryChoice (reorder mode — Ponder "put them back in any order")
  "impulse-dig", // library.js applyImpulseDigAtom → setPendingImpulseDigChoice
  "discard-chosen", // hand.js applyDiscardChosen → setPendingHandDiscardChoice
  "discard", // hand.js applyDiscard → advanceDiscardChain → setPendingDiscardChoice
  "sacrifice", // removal.js applySacrifice → advanceSacrificeChain → setPendingSacrificeChoice
  "sacrifice-land", // sacLand.js applySacrificeLand → setPendingSacrificeChoice
  "divide-damage", // misc.js applyDivideDamage → setPendingDivideChoice
  "distribute-counters", // distributeCounters.js applyDistributeCounters → setPendingDistributeChoice
  "counter", // stack.js applyCounter (soft counter / unlessPay) → setPendingSoftCounterChoice
  "optional-mana-payment", // stack.js applyOptionalManaPayment → setPendingOptionalManaPaymentChoice
  "optional-sac-payment", // stack.js applyOptionalSacPayment → setPendingOptionalSacBySubtypeChoice
  "optional-draw-discard", // stack.js applyOptionalDrawDiscard → setPendingOptionalDrawDiscardChoice
  "optional-discard-payment", // stack.js applyOptionalDiscardPayment → setPendingOptionalDiscardPaymentChoice (the cost-discard pause; payoff is non-pausing)
  "sac-unless-pay", // stack.js applyUpkeepSacUnlessPay → setPendingSacUnlessPayChoice (upkeep pay-or-sacrifice)
  "cumulative-upkeep", // stack.js applyCumulativeUpkeep → setPendingSacUnlessPayChoice (age counter + scaled pay-or-sacrifice — CR 702.24)
  "taxed-draw", // stack.js applyTaxedDraw → setPendingTaxedPaymentChoice (opponent pays or you draw — Rhystic Study)
  "taxed-treasure", // stack.js applyTaxedTreasure → setPendingTaxedPaymentChoice (opponent pays or you create a Treasure — Smothering Tithe)
  "iterated-edict", // iteratedEdict.js applyIteratedEdict → advanceEdictChain → setPendingEdictModeChoice (Torment of Hailfire)
];
for (const op of PAUSING_OPS_LIST) {
  if (!ATOM_RESOLVERS[op]) throw new Error(`PAUSING_ATOM_OPS drift: "${op}" is not a registered atom op`);
}
export const PAUSING_ATOM_OPS = Object.freeze(new Set(PAUSING_OPS_LIST));

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

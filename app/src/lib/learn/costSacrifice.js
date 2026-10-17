/**
 * costSacrifice.js — THE SACRIFICE PAID AS A COST (CR 701.21a), one sequence for every cost site (2026-10-16).
 *
 * Its callers: manaModel.commitManaTap (a mana ability's cost — a Treasure, a Lotus Petal, an Eldrazi Spawn, a Sliver granted Basal
 * Sliver's ability, the creature an Altar takes) and actionDispatcher (an activated ability's "Sacrifice a creature:" / self-sacrifice /
 * "Sacrifice N <subtype>" cost, a spell's additional cost, the sacrifice alternative costs, emerge). Before this module each kept its own
 * copy and they drifted: the activated-ability copy logged no replaced death, and the two drained a noncreature's leave event on opposite
 * sides of its sacrifice watchers. The EFFECT-side twin (an edict — effects/atoms/removal.sacrificeCreatureEffect) follows the same death
 * rules inside a resolving spell, where the resolution finalizer drains the leave events.
 *
 * Imports only gameState, layers and triggers — the modules manaModel already imports — so hosting the helper here adds no cycle.
 */
import { moveCardToZone, logEvent, deathLookback, deathEventKind } from "./gameState.js";
import { permanentTypes } from "./layers.js";
import { checkDiesTriggers, checkLeavesTriggers, checkSacrificeTriggers } from "./triggers.js";

/**
 * Sacrifice `perm` (a permanent `playerId` controls, read from `state`) as part of paying a cost, and fire what that event triggers:
 *   - its card types as it LEFT, read layer-aware off the board as the cost began (CR 603.10a): an animated land or a crewed Vehicle is
 *     sacrificed as the creature it became, a God below its devotion or a bestowed Aura is not a creature;
 *   - a creature leaves through gameState.deathLookback, the one death look-back every death site builds (power, counters, links, and
 *     where the card goes). Its destination is the death-specific exile only (Lava Coil's stamp, the damage-source and opponent-creature
 *     statics); a graveyard replacement (Rest in Peace, Dauthi Voidwalker, a shuffle-instead) redirects inside moveCardToZone;
 *   - a creature a replacement kept out of the graveyard was sacrificed but never died (CR 700.4): the log names where it went
 *     (gameState.deathEventKind, `via: "sacrifice"`), and its own and every watcher's dies triggers and the deaths-this-turn tally skip it;
 *   - the leave event drains FIRST (LEAVE-DRAIN, CR 603.3b), so the leave watchers stack in cost order, never at a later resolution
 *     against a changed board — checkDiesTriggers drains it on its first line for a creature, checkLeavesTriggers for anything else;
 *   - then every "whenever you sacrifice …" watcher (CR 701.21a), which reads the types it had from the look-back.
 * A permanent already gone makes moveCardToZone throw: a cost naming a permanent that left is a hard error, never a free payment.
 */
export function sacrificePermanentForCost(state, playerId, perm) {
  const lkiTypes = [...permanentTypes(state, perm.id).types];
  const death = lkiTypes.includes("Creature") ? deathLookback(state, perm, playerId) : null;
  let next = moveCardToZone(state, { playerId, fromZone: "battlefield", toZone: death?.exileTo ? "exile" : "graveyard", cardId: perm.id });
  const deathKind = death ? deathEventKind(death) : null;
  if (deathKind && deathKind !== "creature-dies") next = logEvent(next, { kind: deathKind, turn: next.turn, cardName: perm.card?.name, controller: playerId, via: "sacrifice" });
  next = death ? checkDiesTriggers(next, [death]) : checkLeavesTriggers(next);
  return checkSacrificeTriggers(next, playerId, { id: perm.id, controller: playerId, card: perm.card, lkiTypes });
}

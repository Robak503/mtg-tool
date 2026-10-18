/**
 * costSacrifice.js — THE SACRIFICE PAID AS A COST (CR 701.21a), one sequence for every cost site (2026-10-16), and for the two
 * sacrifices the engine performs itself outside any resolving effect program (2026-10-17).
 *
 * Its callers: manaModel.commitManaTap (a mana ability's cost — a Treasure, a Lotus Petal, an Eldrazi Spawn, a Sliver granted Basal
 * Sliver's ability, the creature an Altar takes) and actionDispatcher (an activated ability's "Sacrifice a creature:" / self-sacrifice /
 * "Sacrifice N <subtype>" cost, a spell's additional cost, the sacrifice alternative costs, emerge). Before this module each kept its own
 * copy and they drifted: the activated-ability copy logged no replaced death, and the two drained a noncreature's leave event on opposite
 * sides of its sacrifice watchers. The EFFECT-side twin (an edict — effects/atoms/removal.sacrificeCreatureEffect) follows the same death
 * rules inside a resolving spell, where the resolution finalizer drains the leave events.
 *
 * The engine's own sacrifices call it too: each happens where no resolution finalizer runs after it, and this is the one sequence that
 * drains its own leave event. fading.applyFadeVanishUpkeep (CR 702.32a / 702.63a — the upkeep trigger is applied inline as the step
 * begins, never stacked) and gameEngine.sweepFinishedSagas (CR 714.4 — a state-based action that doesn't use the stack). Each built its
 * own move before (2026-10-17): the Fading copy's death entry carried no replacement flags (a Blastoderm Rest in Peace exiled still
 * "died") and neither fired the sacrifice watchers; the Saga copy assumed a Saga is never a creature.
 *
 * A GROUP sacrificed by one instruction is one event (2026-10-17): sacrificePermanentsTogether, the batch every such site shares — a
 * cost that sacrifices N permanents (sacrificePermanentsForCost) and the effect-side batch (effects/atoms/removal.sacrificeCreaturesTogether
 * wraps it with its log entry). Before, the cost sites paid N victims through N single sacrifices, so a "one or more creatures die"
 * watcher triggered once per victim.
 *
 * Imports only gameState, layers and triggers — the modules manaModel already imports — so hosting the helper here adds no cycle.
 */
import { moveCardToZone, logEvent, deathLookback, deathEventKind, findPermanent, graveyardReplacementCarriersLast, groupLeaveEvents } from "./gameState.js";
import { permanentTypes, permanentIsCreature, permanentHasCardType } from "./layers.js";
import { checkDiesTriggers, checkLeavesTriggers, checkPlaneswalkerDiesTriggers, checkSacrificeTriggers } from "./triggers.js";

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
 *   - a planeswalker that is no creature dies too (CR 700.4): it goes to the planeswalker dies dispatch after its leave event, as a
 *     destroyed, combat-killed or batch-sacrificed one does (Cruel Celebrant's "creature or planeswalker you control dies"); one a
 *     replacement exiled never died, which that dispatch reads off where the card went;
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
  if (!death && lkiTypes.includes("Planeswalker")) next = checkPlaneswalkerDiesTriggers(next, [{ id: perm.id, controller: playerId, name: perm.card?.name, card: perm.card }]);
  return checkSacrificeTriggers(next, playerId, { id: perm.id, controller: playerId, card: perm.card, lkiTypes });
}

/**
 * Permanents SACRIFICED IN ONE EVENT — one instruction that sacrifices a group: "Sacrifice them" (a token copy's extra tokens, the
 * mobilized Warriors), "each player … sacrifices all creatures they control" (Living Death), an N-count edict once every player has
 * chosen (CR 101.4 — "Then all creatures chosen this way are sacrificed simultaneously"), a cost that sacrifices N permanents. One
 * event, so a watcher triggers once per occurrence in it and a "one or more" watcher once (CR 603.2c). The single sacrifice's rules,
 * but every look-back is read from the state BEFORE any of them left (CR 603.10a), all of them move, and only then do the dies
 * triggers fire — ONCE, for the whole batch — so a watcher sacrificed with the others sees each of them (the departed-watcher
 * look-back, triggers.deadLookBackSources). The carriers of a graveyard replacement move last (gameState.graveyardReplacementCarriersLast),
 * as the destroy effect's do: a replacement applies to the event as it would happen (CR 614.1), so a Dauthi Voidwalker sacrificed
 * beside an opponent's creatures still exiles them. The leave events drain once, before the dies triggers (checkDiesTriggers' first
 * line — also with no creature among them), so a "one or more … leave the battlefield" watcher sees one batch too.
 * `victims` is `[{ playerId, permId }]`; one already gone is skipped (a cost site checks its victims before calling).
 * A planeswalker in the batch (Plaguecrafter's pool, #639) dies too (CR 700.4): it goes to the planeswalker dies dispatch, as a
 * destroyed one does (spellEffects.applyDestroyEffect) — and only when it is no creature, which the creature dispatch already carries.
 * Then every sacrifice's "whenever you sacrifice …" watchers, each look-back carrying the types it had as it left.
 */
export function sacrificePermanentsTogether(state, victims) {
  const batch = victims.map(({ playerId, permId }) => ({ playerId, permId, lk: findPermanent(state, permId) })).filter((v) => v.lk);
  // Each victim's death look-back read from the state BEFORE any of them left (gameState.deathLookback — a creature by its
  // layer-aware types, an animated land included; where the card goes).
  const dead = batch.filter((v) => permanentIsCreature(state, v.permId)).map((v) => deathLookback(state, v.lk.permanent, v.playerId));
  const deathOf = new Map(dead.map((d) => [d.id, d]));
  // A planeswalker in the batch that is no creature goes to the planeswalker dies dispatch (#639); one that is also a creature
  // already rides the creature dispatch, so it never dies twice.
  const deadPw = batch.filter((v) => !deathOf.has(v.permId) && permanentHasCardType(state, v.permId, "Planeswalker"))
    .map((v) => ({ id: v.permId, controller: v.playerId, name: v.lk.permanent.card?.name, card: v.lk.permanent.card }));
  let next = state;
  for (const { playerId, permId, lk } of graveyardReplacementCarriersLast(state, batch.map((v) => ({ ...v, id: v.permId })))) {
    const death = deathOf.get(permId);
    next = moveCardToZone(next, { playerId, fromZone: "battlefield", toZone: death?.exileTo ? "exile" : "graveyard", cardId: permId });
    const deathKind = death ? deathEventKind(death) : null;
    if (deathKind && deathKind !== "creature-dies") next = logEvent(next, { kind: deathKind, turn: next.turn, cardName: lk.permanent.card?.name, controller: playerId, via: "sacrifice" });
  }
  // One event (CR 603.10a): every victim leaves together, creature or not — a leave watcher among them saw the others go.
  next = groupLeaveEvents(next, batch.map((v) => v.permId));
  next = checkDiesTriggers(next, dead);
  next = checkPlaneswalkerDiesTriggers(next, deadPw);
  // The sacrifice look-backs carry the types each had as it left (sacrificePermanentForCost's shape), for the creature scope.
  for (const { playerId, permId, lk } of batch) next = checkSacrificeTriggers(next, playerId, { id: permId, controller: playerId, card: lk.permanent.card, lkiTypes: [...permanentTypes(state, permId).types] });
  return next;
}

/**
 * A cost that sacrifices N permanents — "Sacrifice two creatures:" (Tooth and Claw), "Sacrifice N <subtype>", an additional cost of
 * N creatures (Bankrupt in Blood), "sacrifice two Mountains rather than pay this spell's mana cost" (Pulverize) — paid as ONE event
 * (sacrificePermanentsTogether): the cost is one instruction, and its victims leave together. One victim is the single cost sacrifice
 * (sacrificePermanentForCost). `perms` are permanents `playerId` controls, read from `state` and checked by the caller; the same
 * permanent twice is a malformed payment, never a cheaper one — it throws.
 */
export function sacrificePermanentsForCost(state, playerId, perms) {
  if (perms.length === 1) return sacrificePermanentForCost(state, playerId, perms[0]);
  if (new Set(perms.map((p) => p.id)).size !== perms.length) throw new Error(`a cost sacrifice names the same permanent twice: ${perms.map((p) => p.id).join(", ")}`);
  return sacrificePermanentsTogether(state, perms.map((p) => ({ playerId, permId: p.id })));
}

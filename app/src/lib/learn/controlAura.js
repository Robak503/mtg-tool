/**
 * controlAura.js — "You control enchanted creature." (CR 613.1b layer-2 control-change, CR 302.6).
 *
 * Mind Control / Control Magic / Treachery / Corrupted Conscience — 27 corpus cards print this exact line.
 * Unlike the INDEFINITE one-shot `gain-control` atom (effects/atoms/control.js), this control lasts only
 * WHILE THE AURA IS ATTACHED and must revert the moment it stops being.
 *
 * ⛔ THE FAILURE MODE IS PERMANENT CONTROL THEFT, and it is the reason this is written the way it is. If any
 * route by which the Aura leaves fails to revert, the creature never goes home — and a stolen-forever
 * creature is a LEGAL-LOOKING board, so a green suite and a completed game both stay silent. That is why the
 * revert hangs off the one verified chokepoint rather than off each removal effect.
 *
 * ⭐ BOTH ENDS ARE SINGLE POINTS, verified by measurement before this was written:
 *   ATTACH  → gameState.attachPermanent (the only function that forms an attachment link)
 *   DETACH  → gameState.detachPermanentFromAll (ONE call site: the battlefield-exit path in moveCardToZone;
 *             probed with the Aura removed to graveyard / exile / hand / library — every route cleared the
 *             host's attachments, and a host leaving drops the Aura per CR 704.5n)
 *
 * ⛔ ZERO IMPORTS, deliberately. This is called FROM gameState.js, the lowest layer; importing anything back
 * would be a cycle. Every function takes `state` and ids and does the array splice inline — the same shape
 * choicePolicy.js uses for the same reason.
 *
 * The MOVE is the shared one (controlMove.moveControl — array splice, not moveCardToZone, so the creature never LEAVES
 * the battlefield and no dies/LTB fires; identity, tapped state, counters, damage and attachments all preserved;
 * summoning-sick under its new controller per CR 302.6).
 *
 * ⭐ TIMESTAMPS (CR 613.1b, 613.7). The Aura's effect is one entry in the host's control-effect record (controlMove.js
 * header), in timestamp order with every threaten and other control Aura on it — an Aura gets a new timestamp each time
 * it becomes attached (CR 613.7e). When it stops being attached its entry ends and the host goes to the latest effect
 * still in force: a second control Aura, a threaten that has not reached cleanup, or else home. Before 2026-10-17 the
 * record was one level deep, so removing either of two control Auras sent the host all the way home, and a threaten
 * applied before or after the Aura decided cleanup wrongly (controlTimestamps.test.js).
 */

import { addControlEffect, endControlEffects } from "./controlMove.js"; // the ONE control move + the control-effect record, shared with the gain-control atom (controlMove.js imports only combatRemoval.js, a zero-import leaf, so gameState -> controlAura -> controlMove stays acyclic)

const CONTROL_LINE = /^you control enchanted creature\.$/im;

/** Does this card grant control of its host while attached? Exact printed line only (CREED — a rider or a
 *  different subject leaves it unrecognised, so the card stays on the Arbiter rather than half-modelled). */
export function isControlAura(card) {
  const t = String(card?.type || card?.type_line || "");
  if (!/\bAura\b/i.test(t)) return false;
  return CONTROL_LINE.test(String(card?.oracle || card?.oracle_text || ""));
}

/** The printed control line alone, TYPE-BLIND — for a bestow creature (an Aura only while bestowed, CR 702.103e:
 *  Hypnotic Siren) and for the AI's cast intent (a card that steals when cast as an Aura is enemy-intent whatever
 *  its type line says). Never a delivery gate on its own: the attach/revert hooks go through isControlAuraPermanent. */
export function grantsControlWhenAttached(card) {
  return CONTROL_LINE.test(String(card?.oracle || card?.oracle_text || ""));
}

/** Does this PERMANENT steal its host while attached? A printed Aura by type (isControlAura), or a bestow creature
 *  WHILE bestowed — the `bestowed` flag is stamped by enterPermanent on the bestow cast and cleared when it falls off,
 *  so the moment Hypnotic Siren becomes a creature again it stops counting (④-K, 2026-09-03). */
export function isControlAuraPermanent(perm) {
  if (!perm) return false;
  return isControlAura(perm.card) || (perm.bestowed === true && grantsControlWhenAttached(perm.card));
}

/**
 * ATTACH side — called after the link is formed. The Aura's effect begins with the latest timestamp (CR 613.7e): its
 * controller controls the host now, over every earlier control effect on it. No-op unless `auraPerm` really is a
 * control Aura.
 */
export function applyControlAuraAttach(state, auraPerm, hostId) {
  if (!auraPerm || !hostId || !isControlAuraPermanent(auraPerm)) return state;
  const to = auraPerm.controller;
  if (!to) return state;
  return addControlEffect(state, hostId, { to, aura: auraPerm.id });
}

/**
 * DETACH side — called from the battlefield-exit chokepoint as the Aura leaves, BEFORE the links are torn down (so
 * `attachedTo` is still readable), and from attachPermanent when the Aura moves to another host. The Aura's entry on
 * its host ends; the host goes to the latest control effect still in force (CR 613.7). ⛔ Only this Aura's entry: an
 * Aura that never took the host (or whose effect a later indefinite steal has outlasted) has none, and moves nothing.
 */
export function revertControlAura(state, auraPerm) {
  if (!auraPerm?.attachedTo) return state;
  return endControlAuraOn(state, auraPerm.id, auraPerm.attachedTo);
}

/** End Aura `auraId`'s control effect on `hostId` (see revertControlAura). Same state when it has none there. */
export function endControlAuraOn(state, auraId, hostId) {
  return endControlEffects(state, hostId, (e) => e.aura === auraId);
}

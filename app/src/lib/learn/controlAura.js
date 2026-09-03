/**
 * controlAura.js — "You control enchanted creature." (CR 613.1b layer-2 control-change, CR 702.10c).
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
 * The MOVE mirrors effects/atoms/control.js's applyGainControl exactly (array splice, not moveCardToZone, so
 * the creature never LEAVES the battlefield and no dies/LTB fires; identity, tapped state, counters, damage
 * and attachments all preserved; summoning-sick under its new controller per CR 702.10c). ⚠️ That mirroring
 * is a deliberate duplication of MECHANISM to avoid destabilising a proven atom — unifying the two movers is
 * a follow-up, noted in the queue.
 *
 * ⚠️ KNOWN SIMPLIFICATION, pinned in controlAura.test.js: the stash is single-level. A creature stolen by TWO
 * control Auras remembers only its ORIGINAL controller, so removing either Aura sends it all the way home
 * rather than to the other Aura's controller. Rare enough to defer, wrong enough to write down.
 */

import { moveControl, controllerOfPermanent } from "./controlMove.js"; // the ONE control move, shared with the gain-control atom (controlMove.js imports nothing, so gameState -> controlAura -> controlMove stays acyclic)

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
 * ATTACH side — called after the link is formed. Moves the host under the Aura's controller and stamps the
 * two fields the revert needs. No-op unless `auraPerm` really is a control Aura and the host is elsewhere.
 */
export function applyControlAuraAttach(state, auraPerm, hostId) {
  if (!auraPerm || !hostId || !isControlAuraPermanent(auraPerm)) return state;
  const to = auraPerm.controller;
  if (!to) return state;
  const hostController = controllerOfPermanent(state, hostId);
  if (hostController == null || hostController === to) return state;
  const hostPerm = state.players[hostController].battlefield.find((p) => p.id === hostId);
  if (!hostPerm) return state;
  // Remember the ORIGINAL controller, not the current one: if a second control Aura ever attaches, home is
  // still home. Only stamp it once — see the known-simplification note in the header.
  const original = hostPerm.controlOriginal ?? hostController;
  return moveControl(state, hostId, to, { controlOriginal: original, controlStolenBy: auraPerm.id });
}

/**
 * DETACH side — called from the battlefield-exit chokepoint as the Aura leaves, BEFORE the links are torn
 * down (so `attachedTo` is still readable). Sends the host home if and only if THIS Aura is the one that
 * took it.
 */
export function revertControlAura(state, auraPerm) {
  if (!auraPerm || !isControlAuraPermanent(auraPerm)) return state;
  const hostId = auraPerm.attachedTo;
  if (!hostId) return state;
  const hostAt = controllerOfPermanent(state, hostId);
  const host = hostAt == null ? null : state.players[hostAt].battlefield.find((p) => p.id === hostId);
  // ⛔ Only revert what THIS Aura took. Without the stolenBy check, an unrelated control Aura leaving would
  // send home a creature it never took — theft in the other direction.
  if (!host || host.controlStolenBy !== auraPerm.id || host.controlOriginal == null) return state;
  const home = host.controlOriginal;
  if (!state.players?.[home]) return state;                 // original controller left the game (CR 800.4a)
  const next = moveControl(state, hostId, home);
  if (next === state) return state;
  // Clear the stash on the way home so a later re-steal starts clean.
  const bf = next.players[home].battlefield.map((p) =>
    p.id === hostId ? { ...p, controlOriginal: undefined, controlStolenBy: undefined } : p);
  return { ...next, players: { ...next.players, [home]: { ...next.players[home], battlefield: bf } } };
}

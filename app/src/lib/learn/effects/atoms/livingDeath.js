/**
 * effects/atoms/livingDeath.js — Living Death / Living End (the play-weighted program, P·35 — EDHREC #474):
 *   "Each player exiles all creature cards from their graveyard, then sacrifices all creatures they control, then puts all cards
 *    they exiled this way onto the battlefield."
 *
 * Three steps, in order (CR 608.2c):
 *  1. each player exiles the creature cards in their graveyard (the card's front face decides — CR 712.8a), and the ids are kept
 *     per player — "the cards they exiled this way";
 *  2. each player sacrifices every creature they control (layer-aware: an animated land goes too) — ONE event
 *     (removal.sacrificeCreaturesTogether: the dies triggers fire once for the batch, so a watcher sacrificed with the others sees
 *     each of them, CR 603.10a). A sacrifice, not a destroy: indestructible creatures go;
 *  3. each player puts the cards THEY exiled this way onto the battlefield under their control (zones.enterCardFromZone, from exile;
 *     ETB triggers fire). A creature sacrificed in step 2 is never among them, even if a replacement exiled it (Rest in Peace).
 */

import { moveCardToZone, logEvent } from "../../gameState.js";
import { permanentIsCreature } from "../../layers.js";
import { sacrificeCreaturesTogether } from "./removal.js";
import { enterCardFromZone } from "./zones.js";

/** The printed effect, whole. Returns { atom } | null. */
export function matchLivingDeath(oracle) {
  const s = String(oracle || "").toLowerCase();
  if (!/^each player exiles all creature cards from their graveyard, then sacrifices all creatures they control, then puts all cards they exiled this way onto the battlefield\.?$/.test(s)) return null;
  return { atom: { op: "living-death", targetType: null } };
}

const isCreatureCardFront = (c) => /\bCreature\b/.test(String(c.type || c.type_line || "").split(" // ")[0]);

export function applyLivingDeath(state, atom, ctx) {
  const players = Object.keys(state.players);
  let next = state;
  const exiledBy = {};
  for (const pid of players) {
    exiledBy[pid] = next.players[pid].graveyard.filter(isCreatureCardFront).map((c) => c.id);
    for (const id of exiledBy[pid]) next = moveCardToZone(next, { playerId: pid, fromZone: "graveyard", toZone: "exile", cardId: id });
  }
  const victims = players.flatMap((pid) => next.players[pid].battlefield.filter((p) => permanentIsCreature(next, p.id)).map((p) => ({ playerId: pid, permId: p.id })));
  next = sacrificeCreaturesTogether(next, victims);
  for (const pid of players) {
    for (const id of exiledBy[pid]) next = enterCardFromZone(next, { playerId: pid, cardId: id, fromZone: "exile" }).state;
  }
  return logEvent(next, { kind: "spell-effect", effect: "living-death", controller: ctx.controller, returned: exiledBy });
}

export const livingDeathResolvers = {
  "living-death": applyLivingDeath,
};

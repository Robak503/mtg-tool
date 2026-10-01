/**
 * effects/atoms/castFromAmong.js — "cast any number of spells from among those cards without paying their mana costs" (the
 * play-weighted program, P·16 — Etali, Primal Storm, EDHREC #260; CR 608.2g, 118.9, 400.3).
 *
 *   "Whenever Etali attacks, exile the top card of each player's library, then you may cast any number of spells from among
 *    those cards without paying their mana costs."
 *
 * The atom exiles the top card of each player's library (each to its owner's exile) and parks a decision on the state,
 * `pendingCastFromAmong` { controller, candidates: [{ cardId, ownerId }], sourceName }. The action layer then offers the
 * controller a free cast of each candidate still in its owner's exile — another player's card included (the dispatcher's
 * cross-owner exile cast, the card's owner riding the stack object so it goes home, CR 400.3) — plus "done". Each cast takes
 * that card off the list and the decision stays open for the rest; "done", or an empty list, closes it. A spell cast this way
 * goes on the stack while the ability finishes resolving (CR 608.2g); a land is never cast, so it stays exiled. The atom
 * parks a decision, so it is the LAST atom of its program (parser.programConfidence).
 *
 * MUST NOT import effects/parser.js or the atoms barrel (parser.js → effectAtoms.js → atoms/*.js is one-way).
 */
import { logEvent, moveCardToZone, opponentsOf } from "../../gameState.js";
import { isLandCard } from "./shared.js";

/** The whole effect, exactly as Etali prints it (its "then" and comma would split it). Returns { atom } | null. */
export function matchExileTopEachCastAny(oracle) {
  const s = String(oracle || "").trim().toLowerCase().replace(/[’]/g, "'").replace(/\s+/g, " ");
  return /^exile the top card of each player's library, then you may cast any number of spells from among those cards without paying their mana costs\.?$/.test(s)
    ? { atom: { op: "exile-top-each-cast-any", targetType: null } }
    : null;
}

export function applyExileTopEachCastAny(state, atom, ctx) {
  const controller = ctx.controller;
  if (!state.players?.[controller]) return state; // the controller left the game mid-resolution — nothing to cast with
  let next = state;
  const candidates = [];
  for (const pid of [controller, ...opponentsOf(state, controller)]) {
    const top = next.players[pid]?.library?.[0];
    if (!top) continue; // an empty library exiles nothing
    next = moveCardToZone(next, { playerId: pid, fromZone: "library", toZone: "exile", cardId: top.id });
    if (!isLandCard(top)) candidates.push({ cardId: top.id, ownerId: pid });
  }
  next = logEvent(next, { kind: "spell-effect", effect: "exile-top-each-cast-any", controller, castable: candidates.length });
  if (!candidates.length) return next;
  return { ...next, pendingCastFromAmong: { controller, candidates, sourceName: ctx.cardName || null } };
}

export const castFromAmongResolvers = {
  "exile-top-each-cast-any": applyExileTopEachCastAny, // P·16 — Etali, Primal Storm
};

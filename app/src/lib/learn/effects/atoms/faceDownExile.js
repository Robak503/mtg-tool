/**
 * effects/atoms/faceDownExile.js — "Exile the top card of your library face down. Put that card into your hand at the
 * beginning of your next end step." (Necropotence's "Pay 1 life:" ability; the play-weighted program, EDHREC #519).
 *
 * ONE collapse atom (the DELAYED-BLINK precedent, templateMatchers.matchDelayedBlink). The generic delayed-trigger matcher
 * splits the text into an immediate half and "put that card into your hand", but "that card" is whatever the immediate half
 * exiled — nothing the parser can name — so the two sentences are matched as one whole-oracle shape. The atom exiles the
 * top card of its controller's library face down and schedules a CR 603.7 delayed trigger bound to THAT card:
 *   - FACE DOWN (CR 406.3): the exiled card carries `_faceDownExile: true`, and the log never names it. The engine's pilot
 *     view is perfect-information by design (gameApi.observe), so the stamp is the marker a seat-scoped view reads. A
 *     face-down exiled card has no play permission: every play-from-exile lane keys on its own stamp, which this card never
 *     carries.
 *   - THE RETURN: a `[face-down-exile-return <cardId>]` sentinel on state.delayedTriggers, fireStep "end", fireScope
 *     "yours" — "your next end step". The drain fires at the entry of the controller's own end step, so an activation in a
 *     main phase returns the card that turn and one on an opponent's turn waits for the controller's turn. The delayed
 *     trigger is controlled by the ability's controller (CR 603.7e); each activation schedules its own return.
 *   - SAME OBJECT (CR 603.7c, CR 400.7): the return acts only on that card while it is still in its controller's exile face
 *     down. gameState.moveCardToZone strips the stamp whenever a card leaves exile, so a card that left exile — even one
 *     that came back — is a new object and is not returned.
 * An empty library exiles nothing and schedules nothing: there is no card for the delayed trigger to return.
 *
 * Imports the gameState leaf, the delayedTrigger leaf and textNormalize only; never parser.js.
 */
import { logEvent, moveCardToZone } from "../../gameState.js";
import { applyScheduleDelayed } from "./delayedTrigger.js";
import { stripReminder } from "../textNormalize.js";

/** The whole effect, anchored — any other timing, a second card, or a rider leaves the clause to the normal pipeline (LOW). */
export function matchExileTopFaceDownToHand(oracle) {
  const t = stripReminder(oracle).toLowerCase().replace(/[’]/g, "'").replace(/\s+/g, " ").trim().replace(/\.\s*$/, "");
  if (/^exile the top card of your library face down\. put that card into your hand at the beginning of your next end step$/.test(t)) {
    return { atoms: [{ op: "face-down-exile-top", fireStep: "end", fireScope: "yours", targetType: null }] };
  }
  return null;
}

function applyFaceDownExileTop(state, atom, ctx) {
  const controller = ctx.controller;
  const top = state.players?.[controller]?.library?.[0];
  if (!top) return logEvent(state, { kind: "spell-effect", effect: "face-down-exile-top", controller, exiled: 0 });
  let next = moveCardToZone(state, { playerId: controller, fromZone: "library", toZone: "exile", cardId: top.id });
  const pl = next.players[controller];
  next = { ...next, players: { ...next.players, [controller]: { ...pl, exile: pl.exile.map((c) => (c.id === top.id ? { ...c, _faceDownExile: true } : c)) } } };
  next = applyScheduleDelayed(next, { delayedClause: `[face-down-exile-return ${top.id}]`, fireStep: atom.fireStep, fireScope: atom.fireScope }, ctx);
  return logEvent(next, { kind: "spell-effect", effect: "face-down-exile-top", controller, exiled: 1 });
}

/** The delayed half's sentinel — case-preserving on the card id (the blink-return sentinel's convention). */
export function faceDownExileReturnClauseParser(clause) {
  const m = String(clause || "").trim().match(/^\[face-down-exile-return (\S+)\]$/i);
  return m ? { op: "face-down-exile-return", cardId: m[1], targetType: null } : null;
}

/** "Put that card into your hand": the card from its owner's library (CR 400.3), so the controller's exile and hand. */
function applyFaceDownExileReturn(state, atom, ctx) {
  const controller = ctx.controller;
  const held = (state.players?.[controller]?.exile || []).some((c) => c.id === atom.cardId && c._faceDownExile);
  if (!held) return logEvent(state, { kind: "spell-effect", effect: "face-down-exile-return", controller, returned: 0 });
  const next = moveCardToZone(state, { playerId: controller, fromZone: "exile", toZone: "hand", cardId: atom.cardId });
  return logEvent(next, { kind: "spell-effect", effect: "face-down-exile-return", controller, returned: 1 });
}

export const faceDownExileResolvers = Object.freeze({
  "face-down-exile-top": applyFaceDownExileTop,
  "face-down-exile-return": applyFaceDownExileReturn,
});

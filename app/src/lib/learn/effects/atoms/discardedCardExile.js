/**
 * effects/atoms/discardedCardExile.js — "Whenever you discard a card, exile that card from your graveyard." (Necropotence;
 * the play-weighted program, EDHREC #519).
 *
 * The trigger is a ZONE-CHANGE trigger: the discard moves the card from hand to its owner's graveyard (CR 701.9a — a hand
 * only ever holds its owner's cards, CR 400.3, so "your graveyard" is where the discarded card went). On resolution the
 * ability looks for THAT object in the graveyard (CR 400.7e — a public zone, so the new object can be found) and does
 * nothing if it cannot: it never got there (an exile-instead replacement), it left before the ability resolved, or it left
 * and came back as a new object (CR 603.6, CR 400.7).
 *
 * THE REFERENT — detectTriggers rewrites the printed clause to DISCARDED_CARD_EXILE_SENTINEL on the `discarded` event only
 * (bracketed, so no printed text can produce it on a spell or an activated ability), and triggerRouting pins the atom to
 * that event. checkDiscardTriggers threads the discarded card's id per fire (`discardedCardId`) and, for a fire that carries
 * this sentinel, opens a WATCH: a ledger entry `state.discardExileWatches[token] = { cardId }` whose token rides the
 * trigger context (`discardWatch`); the token alone names the card, so the resolver reads the id from the ledger.
 * gameState.recordGraveyardEvents deletes every watch on a card the moment that card has any later graveyard event (leave or
 * re-enter) — the gyCastPermissions mechanism (shelf D30) — so the resolver acts only on the very object the discard put
 * there. A second discard of the same card opens a fresh token, so an older trigger cannot reach the newer object.
 *
 * Pure; imports the gameState leaf only (triggers.js imports this module, so it must never import triggers.js).
 */
import { logEvent, moveCardToZone } from "../../gameState.js";

/** The clause detectTriggers writes for the printed "exile that card from your graveyard" on a discard trigger. */
export const DISCARDED_CARD_EXILE_SENTINEL = "[discarded-card] exile that card from your graveyard";

/** The printed clause the rewrite accepts — whole-clause anchored (a "you may …" or a rider sentence keeps its raw text). */
export const DISCARDED_CARD_EXILE_PRINTED_RE = /^exile that card from your graveyard$/i;

/**
 * Open a watch on the card a discard just put into a graveyard; returns `{ state, token }`. Called by checkDiscardTriggers
 * only for a fire whose effect is the sentinel, so a game without such a watcher never gains the ledger.
 */
export function openDiscardExileWatch(state, cardId) {
  const seq = (state.discardExileWatchSeq || 0) + 1;
  const token = `dxw-${seq}`;
  return {
    token,
    state: { ...state, discardExileWatchSeq: seq, discardExileWatches: { ...(state.discardExileWatches || {}), [token]: { cardId } } },
  };
}

export function discardedCardExileClauseParser(clause) {
  const t = String(clause || "").trim().replace(/\.$/, "");
  return t.toLowerCase() === DISCARDED_CARD_EXILE_SENTINEL ? { op: "exile-discarded-card", targetType: null } : null;
}

/**
 * Exile the discarded card from the controller's graveyard — only while the watch opened at the discard still stands (the
 * same object, CR 400.7) and the card is in that graveyard. Anything else is a logged no-op, never a different card.
 */
function applyExileDiscardedCard(state, atom, ctx) {
  const cardId = state.discardExileWatches?.[ctx.discardWatch]?.cardId ?? null;
  const inGraveyard = (state.players?.[ctx.controller]?.graveyard || []).some((c) => c.id === cardId);
  if (!inGraveyard) {
    return logEvent(state, { kind: "spell-effect", effect: "exile-discarded-card", controller: ctx.controller, exiled: 0 });
  }
  // The exile records a graveyard LEAVE event, which retires this watch (and any sibling trigger's) in recordGraveyardEvents.
  const next = moveCardToZone(state, { playerId: ctx.controller, fromZone: "graveyard", toZone: "exile", cardId });
  return logEvent(next, { kind: "spell-effect", effect: "exile-discarded-card", controller: ctx.controller, exiled: 1 });
}

export const discardedCardExileResolvers = Object.freeze({
  "exile-discarded-card": applyExileDiscardedCard,
});

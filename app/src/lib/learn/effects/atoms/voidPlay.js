/**
 * effects/atoms/voidPlay.js — Dauthi Voidwalker's payoff (the play-weighted program, P·28 — EDHREC #384):
 *   "{T}, Sacrifice this creature: Choose an exiled card an opponent owns with a void counter on it. You may play it this turn
 *    without paying its mana cost."
 *
 * The void counters come from its replacement ("If a card would be put into an opponent's graveyard from anywhere, instead
 * exile it with a void counter on it." — gameState.graveyardExileFor, P·27/P·28). This atom collects the void-countered cards
 * the controller's OPPONENTS own (each sits in its owner's exile), orders them nonlands-first by mana value (the most a free
 * play is worth), and grants the chosen one a play permission for THIS turn without paying its mana cost: the same `_impulse` /
 * `_impulseFor` / `_impulseTurn` stamp the cross-player cast lane (Ragavan, legalChoices.actionsPlayImpulseFromExile) reads,
 * with `_impulseFree` so that lane offers it free. The stamps lapse at cleanup and come off when the card is cast (CR 400.7).
 * One candidate → granted directly; two or more → the controller picks through the milled-pick pause (toZone "playFree").
 * A LAND can be chosen (the printed verb is "play") but the cross-player lane casts only, so a chosen land is not offered —
 * an under-offer, the safe direction; the ordering keeps the autopilot on the nonlands.
 */

import { logEvent, opponentsOf } from "../../gameState.js";
import { setPendingMilledPickChoice } from "../../pendingChoice.js";
import { isLandCard, typeLineStr } from "./shared.js";

/** The printed effect, whole (two sentences — the second's "it" is the chosen card). Returns { atom } | null. */
export function matchVoidPlayGrant(oracle) {
  const s = String(oracle || "").toLowerCase();
  if (!/^choose an exiled card an opponent owns with a void counter on it\. you may play it this turn without paying its mana cost\.?$/.test(s)) return null;
  return { atom: { op: "void-play-grant", targetType: null } };
}

/** Stamp the free play-this-turn permission on `cardId` in `ownerId`'s exile, for `playerId`. The callers pass a card that is
 *  in that exile with its void counter (applyVoidPlayGrant collects only those; the pick's settler re-validates). */
export function grantVoidPlay(state, playerId, ownerId, cardId) {
  const exile = state.players[ownerId].exile;
  const next = { ...state, players: { ...state.players, [ownerId]: { ...state.players[ownerId], exile: exile.map((c) => (c.id === cardId ? { ...c, _impulse: true, _impulseFor: playerId, _impulseTurn: state.turn, _impulseFree: true } : c)) } } };
  return logEvent(next, { kind: "spell-effect", effect: "void-play-grant", controller: playerId, granted: exile.find((c) => c.id === cardId).name, owner: ownerId });
}

export function applyVoidPlayGrant(state, atom, ctx) {
  const me = ctx.controller;
  const candidates = [];
  for (const pid of opponentsOf(state, me)) {
    for (const c of state.players[pid].exile) {
      if (c._voidCounter) candidates.push({ id: c.id, name: c.name, type: typeLineStr(c), owner: pid, land: isLandCard(c), mv: c.cmc });
    }
  }
  candidates.sort((a, b) => Number(a.land) - Number(b.land) || b.mv - a.mv);
  if (!candidates.length) return logEvent(state, { kind: "spell-effect", effect: "void-play-grant", controller: me, granted: null });
  if (candidates.length === 1) return grantVoidPlay(state, me, candidates[0].owner, candidates[0].id);
  return setPendingMilledPickChoice(state, {
    controller: me,
    candidates: candidates.map(({ id, name, type, owner }) => ({ id, name, type, owner })),
    sourceName: ctx.cardName,
    toZone: "playFree",
  });
}

export const voidPlayResolvers = {
  "void-play-grant": applyVoidPlayGrant,
};

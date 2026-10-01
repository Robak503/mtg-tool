/**
 * effects/atoms/hideaway.js — HIDEAWAY (CR 702.75; the play-weighted program, P·10 — Mosswort Bridge, EDHREC #194).
 *
 * "Hideaway N" (CR 702.75a): "When this permanent enters, look at the top N cards of your library. Exile one of them face down
 * and put the rest on the bottom of your library in a random order." The keyword's whole ability is reminder text, so
 * detectTriggers synthesizes it from the keyword line (the renown / mobilize idiom) with a sentinel clause only this module's
 * parser reads. The look rides the impulse-dig pause with a HIDEAWAY destination (runProgram.resolveImpulseDigChoice): the
 * pick goes to exile stamped `_hideawayOf` (the source permanent) and the source is stamped `hideawayCardId` — the link CR
 * 702.75b / 607.2a make between the keyword and the card's "the exiled card" ability; a permanent that changed zones is a
 * new object with no stamp, so nothing is linked to it. Exiling one is mandatory: a pick naming no candidate exiles the first
 * looked-at card.
 *
 * "… you may play the exiled card without paying its mana cost if <condition>." — the linked ability. The parser's
 * conditional rider splits the trailing "if <condition>" off and stamps it on the atom (`condition`), so runEffectProgram
 * checks it as the ability resolves and skips the atom when it fails (CR 608.2c — the shared readers; Mosswort Bridge's is
 * the formidable one). A still-exiled NONLAND card is parked behind the discover decision with a leave-exiled decline (The
 * Key to the Vault's lane): cast it free, or leave it where it is. A LAND card is not offered — playing it would be a land
 * play the effect has to grant, which no lane models yet (a safe under-offer). The offer itself waits for a hidden card and
 * a met condition (hideawayPlayOfferable — legalChoices), so the autopilot never pays to resolve nothing.
 *
 * Pure data mutation; imports leaves only (gameState, pendingChoice, interveningIf).
 */
import { findPermanent, logEvent } from "../../gameState.js";
import { setPendingImpulseDigChoice } from "../../pendingChoice.js";
import { evaluateInterveningIf } from "../../interveningIf.js";

const isLandCard = (card) => /\bLand\b/.test(String(card?.type || card?.type_line || "").split(" // ")[0]);

/** The card a permanent's hideaway linked to, if it is still in its controller's exile; else null. */
function linkedHiddenCard(state, perm, controller) {
  const id = perm?.hideawayCardId;
  if (!id) return null;
  return (state.players?.[controller]?.exile || []).find((c) => c.id === id) || null;
}

/** HIDEAWAY N — look at the top N, the controller picks one to hide (impulse-dig pause, hideaway destination). */
function applyHideaway(state, atom, ctx) {
  const player = state.players?.[ctx.controller];
  if (!player) return state; // controller eliminated mid-resolution → clean no-op (CR 800.4a)
  const n = Math.min(Math.max(0, atom.n || 0), (player.library || []).length);
  if (n === 0 || ctx.sourceId == null) {
    return logEvent(state, { kind: "spell-effect", effect: "hideaway", controller: ctx.controller, looked: 0 });
  }
  const cards = player.library.slice(0, n).map((c) => ({ id: c.id, name: c.name }));
  return setPendingImpulseDigChoice(state, { controller: ctx.controller, candidates: cards, restTo: "bottom", restOrder: "random",
    sourceName: ctx.cardName || null, keep: 1, lookedAt: n, chosenTo: "hideawayExile", sourceId: ctx.sourceId });
}

/**
 * Can the linked "play the exiled card … [if <condition>]" ability do anything right now? A hidden NONLAND card still in exile,
 * and the atom's condition (if any) met. legalChoices offers the ability only then.
 */
export function hideawayPlayOfferable(state, perm, atom, controller) {
  const card = linkedHiddenCard(state, perm, controller);
  if (!card || isLandCard(card)) return false;
  return !atom.condition || evaluateInterveningIf(state, atom.condition, controller, { sourcePermanentId: perm.id }) === true;
}

/** "You may play the exiled card without paying its mana cost [if <condition>]." — park the free cast (discover's decision). The
 *  condition never reaches here unmet: runEffectProgram skips a `condition`-gated atom whose condition fails. */
function applyHideawayPlay(state, atom, ctx) {
  const src = ctx.sourceId != null ? findPermanent(state, ctx.sourceId)?.permanent : null;
  const card = linkedHiddenCard(state, src, ctx.controller);
  if (!card || isLandCard(card)) {
    return logEvent(state, { kind: "spell-effect", effect: "hideaway-play", controller: ctx.controller, offered: false, reason: !card ? "no-card" : "land" });
  }
  const next = { ...state, pendingDiscover: { controller: ctx.controller, cardId: card.id, mv: null, declineTo: "exile" } };
  return logEvent(next, { kind: "spell-effect", effect: "hideaway-play", controller: ctx.controller, offered: true, cardName: card.name || null });
}

/**
 * The two clause shapes:
 *   "[hideaway] hide one of the top N cards of your library" — the sentinel detectTriggers synthesizes from the keyword (no
 *    printed sentence reads like it; comma-free so the clause splitter hands it over whole).
 *   "play the exiled card without paying its mana cost" — after the "you may" peel (left un-optional: the discover decision
 *    IS the may) and after the conditional rider took the trailing "if <condition>" (stamped on the atom; a condition the
 *    spell-condition readers can't evaluate leaves the clause low there).
 */
export function hideawayClauseParser(clause) {
  const t = String(clause || "").trim().replace(/[’]/g, "'").replace(/\.$/, "");
  const kw = /^\[hideaway\] hide one of the top (\d+) cards of your library$/i.exec(t);
  if (kw) return { op: "hideaway", n: parseInt(kw[1], 10), targetType: null };
  if (/^(?:you may )?play the exiled card without paying its mana cost$/i.test(t)) return { op: "hideaway-play", targetType: null };
  return null;
}

export const hideawayResolvers = {
  hideaway: applyHideaway,
  "hideaway-play": applyHideawayPlay,
};

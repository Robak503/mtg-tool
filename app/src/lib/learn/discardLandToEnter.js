/**
 * discardLandToEnter.js — Mox Diamond's entry (play-weighted #247):
 *   "If this artifact would enter, you may discard a land card instead. If you do, put this artifact onto the battlefield.
 *    If you don't, put it into its owner's graveyard."
 *
 * THE RULE. A replacement effect (CR 614.1a — "instead") on the event of this permanent entering. It modifies how that
 * particular object enters, so it functions as the object is entering (CR 113.6h, 614.12), its choice is made before the
 * permanent enters (CR 614.12a), and the land discarded is another object changing zones as part of it (CR 614.13). Putting
 * the permanent onto the battlefield after the discard is not replaced again (CR 614.5 — a replacement effect gets one
 * opportunity to affect an event). Declined, or with no land card to discard, the permanent never enters: nothing triggers on
 * it entering and it is never a mana source (the bundled Mox Diamond ruling); the card goes to its owner's graveyard instead.
 * "You" is the player it would enter under (CR 109.5 — an object's would-be controller).
 *
 * WHERE IT IS READ — every road onto the battlefield, never one entry site:
 *   · resolvers.enterPermanent — the resolving permanent spell, and a clone entering as a copy of it (CR 707.5);
 *   · zones.enterCardFromZone — every put onto the battlefield (a search, a return from a graveyard, a mass return, a put from a
 *     hand, a blink's return);
 *   · tokens.applyCreateTokenCopy — a token created as a copy of it (declined, the token is not created: a token put into a
 *     graveyard ceases to exist, CR 704.5d).
 * Not in enterReplacements.applyEnterReplacements: that leaf decides HOW a permanent enters and always returns one; this decides
 * WHETHER it does, so each caller handles "it never enters" in its own zone terms.
 *
 * THE CHOICE — the house policy for every seat, the way every other entry replacement decides (the shockland inside an effect,
 * the chosen creature type / colour / card type, riot, Fabricate, tribute): discard only with a land card in hand AND either the
 * land drop spent (its own turn, every land play its allowance gives already made — landDropAllowance) or two or more land cards
 * held; the land discarded is a basic land first, then the first in hand order. A person's seat is NOT asked — a documented
 * limit: the engine's one entry ask (auraEntry's aura-entry-host pause) covers a host choice inside an effect, not the cast
 * entry, and every other entry replacement auto-decides too. The AI holds the cast when this policy would decline
 * (opponentAI.pickCastAction, policy key `discardEnterHold`), so it never bins the card for nothing.
 *
 * A "land card" is read on the card's front face in the hand (CR 712.8a — a double-faced card off the battlefield has only its
 * front face's characteristics): Valakut Awakening // Valakut Stoneforge is not a land card there; Dryad Arbor is.
 *
 * Leaf: gameState + triggers + staticAbilityParser, which resolvers.js, zones.js and tokens.js already import.
 */
import { logEvent, moveCardToZone } from "./gameState.js";
import { checkDiscardTriggers } from "./triggers.js";
import { landDropAllowance } from "./staticAbilityParser.js";

// The printed sentence, whole and line-anchored (curly apostrophes tolerated). The noun is the card's own self reference, the
// same word both times. A different cost ("discard a card"), a missing rider or any extra wording is not this ability.
const DISCARD_LAND_TO_ENTER_LINE_RE = /^[ \t]*if this (artifact|creature|enchantment|permanent) would enter, you may discard a land card instead\. if you do, put this \1 onto the battlefield\. if you don['’]t, put it into its owner['’]s graveyard\.[ \t]*$/im;
const DISCARD_LAND_TO_ENTER_LINE_RE_G = new RegExp(DISCARD_LAND_TO_ENTER_LINE_RE.source, "gim");

const reminderless = (card) => String(card?.oracle ?? card?.oracle_text ?? "").replace(/\([^)]*\)/g, " ");
const frontType = (card) => String(card?.type ?? card?.type_line ?? "").split(" // ")[0];
const isLandCard = (card) => /\bLand\b/.test(frontType(card));

/** Does this card print Mox Diamond's entry replacement? ONE reader for every entry site and the coverage pre-strip. Pure. */
export function entersByDiscardingLand(card) {
  return DISCARD_LAND_TO_ENTER_LINE_RE.test(reminderless(card));
}

/**
 * The metric mirror (coverage.classifyCard's pre-strips): the oracle with the printed sentence's line removed, the other lines kept
 * in order. An oracle without it comes back unchanged (the same string).
 */
export function stripModeledDiscardLandToEnter(oracle) {
  const text = String(oracle || "");
  if (!DISCARD_LAND_TO_ENTER_LINE_RE.test(text)) return text;
  return text.replace(DISCARD_LAND_TO_ENTER_LINE_RE_G, "").split("\n").filter((l) => l.trim() !== "").join("\n");
}

/**
 * THE POLICY (module header): the id of the land card `controller` would discard from their hand, or null to decline. Read on
 * the live hand, so two of these entering in one event can never pick the same card (CR 614.13b). Pure.
 */
export function pickEnterDiscardLand(state, controller) {
  const player = state?.players?.[controller];
  if (!player) return null;
  const lands = (player.hand || []).filter((c) => !c.token && isLandCard(c));
  if (lands.length === 0) return null;
  const dropSpent = state.activePlayer === controller && (player.landsPlayedThisTurn ?? 0) >= landDropAllowance(state, controller);
  if (!dropSpent && lands.length < 2) return null;
  return (lands.find((c) => /\bBasic\b/.test(frontType(c))) || lands[0]).id;
}

/**
 * Apply the replacement for `card` about to enter under `controller`: discard the land the policy picks (a real discard — the
 * card moves hand → graveyard through moveCardToZone, so its graveyard replacements apply, and the discard watchers fire, CR
 * 701.9a) and report `enters: true`; or decline and report `enters: false`, the caller putting the card in its owner's graveyard
 * in its own zone terms. Logged either way as an automatic decision. Pure.
 */
export function applyDiscardLandToEnter(state, controller, card) {
  const pick = pickEnterDiscardLand(state, controller);
  const decision = (s, discarded) => logEvent(s, { kind: "enter-discard-replacement", cardName: card?.name ?? null, controller, discarded, auto: true });
  if (!pick) return { state: decision(state, null), enters: false };
  const land = state.players[controller].hand.find((c) => c.id === pick);
  let next = moveCardToZone(state, { playerId: controller, fromZone: "hand", toZone: "graveyard", cardId: pick });
  next = checkDiscardTriggers(next, controller, [pick]);
  return { state: decision(next, land?.name ?? null), enters: true };
}

/**
 * chosenCardType.js — "As this artifact enters, choose artifact, creature, enchantment, instant, or sorcery." and the cost
 * reduction that reads that choice, "Spells you cast of the chosen type cost {1} less to cast." (Cloud Key — the play-weighted
 * program, #608).
 *
 * ⭐ A CARD-TYPE CHOICE, KEPT APART FROM THE CREATURE-TYPE CHOICE. The "choose a creature type" chooser stores a creature subtype
 * in `permanent.chosenType`, and every reader of that field (the chosen-type reducers, anthems, cast triggers, digs) matches it
 * against the SUBTYPES on a type line. A card type written into that field would be read as a creature type by all of them.
 * So this choice lives in its own field, `permanent.chosenCardType`, read only by spellHasChosenCardType below, and its value is
 * one of the five words in CHOSEN_CARD_TYPE_OPTIONS and nothing else: the recognizer accepts only the printed list, and the
 * policy (choicePolicy.autoPickCardType) only ever returns a member of the list it is handed.
 *
 * WHEN THE CHOICE IS MADE. "As [this permanent] enters" is a replacement effect (CR 614.1c), and a choice it requires is made
 * before the permanent enters (CR 614.12a) — however it enters, so every entry site spreads chosenCardTypeOnEnter onto the new
 * permanent: a resolving permanent spell (resolvers.enterPermanent, also taken by a clone entering as a copy — CR 707.5), the
 * put-onto-the-battlefield entry (zones.enterCardFromZone: reanimation, a search to the battlefield, a blink's return), The
 * Ur-Dragon's put-from-hand, and a token created as a copy (CR 707.5 — the copy's own "as enters" abilities take effect). A new
 * object makes a new choice (CR 400.7). A permanent that never entered with the ability (a face-down one turned face up) has no
 * choice, and the reduction then matches nothing.
 *
 * A LEAF: it imports only the zero-import choice policy, so the cast lane, the enter sites on both sides of the runProgram cycle
 * (resolvers → runProgram → effect atoms) and the classifier all read one recognizer.
 */
import { autoPickCardType } from "./choicePolicy.js";

/** The five card types the chooser names, in printed order (each is a card type — CR 205.2a). */
export const CHOSEN_CARD_TYPE_OPTIONS = Object.freeze(["Artifact", "Creature", "Enchantment", "Instant", "Sorcery"]);

/** The chooser, a line of its own. Exactly this list: another list ("choose a card type", "a card type other than creature or
 *  land" — Umori, Stenn) is a different choice, never made here. */
export const CARD_TYPE_CHOOSER_LINE_RE = /^as this artifact enters, choose artifact, creature, enchantment, instant, or sorcery\.$/i;

/** The reduction that reads the choice, a line of its own. */
export const CHOSEN_CARD_TYPE_REDUCER_LINE_RE = /^spells you cast of the chosen type cost \{(\d+)\} less to cast\.$/i;

const oracleLines = (card) => String(card?.oracle || card?.oracle_text || "").split("\n");
const hasChooser = (card) => oracleLines(card).some((l) => CARD_TYPE_CHOOSER_LINE_RE.test(l));

/**
 * The chosen-card-type reduction a card prints: `{ amount }` when the card carries BOTH the chooser and the reducer line, else
 * null. The reducer reads the choice, so it exists only beside the chooser: the same reducer line under a creature-type chooser
 * (Gathering Stone) or an unmodeled card-type chooser (Umori, Stenn) yields nothing. One reader for the cast lane
 * (parseStaticAbilities emits its cost-reduction descriptor from this) and the classifier.
 */
export function chosenCardTypeReducer(card) {
  if (!hasChooser(card)) return null;
  for (const line of oracleLines(card)) {
    const m = line.match(CHOSEN_CARD_TYPE_REDUCER_LINE_RE);
    if (m) return { amount: Number(m[1]) };
  }
  return null;
}

/** The card's lines that are neither the chooser nor the reducer — what the whole-card classifier must find empty. A line
 *  carrying anything more than one of them (a second sentence on the chooser's line) is matched by neither, so it stays here. */
export function chosenCardTypeResidue(card) {
  return oracleLines(card).filter((l) => !CARD_TYPE_CHOOSER_LINE_RE.test(l) && !CHOSEN_CARD_TYPE_REDUCER_LINE_RE.test(l));
}

/**
 * The choice `card` makes entering the battlefield under `controller`: `{ chosenCardType }` to spread onto the new permanent,
 * or `{}` for a card without the chooser. `state` is the board before the permanent exists (CR 614.12a). The card itself is
 * left out of the policy's count wherever it still sits — a Cloud Key searched out of the library or put from the hand is not
 * a spell still to be cast.
 */
export function chosenCardTypeOnEnter(state, card, controller) {
  if (!hasChooser(card)) return {};
  return { chosenCardType: autoPickCardType(state, controller, CHOSEN_CARD_TYPE_OPTIONS, { excludeCardId: card?.id }) };
}

/**
 * Does a spell have the chosen card type? It is judged on the face being cast: the cast lane hands over the projected face of a
 * split card, an adventurer or a modal double-faced card (CR 709.3b, 715.3a, 712.11b), and any other two-faced card is cast
 * with its front face up and has only that face's characteristics (CR 712.8c) — so only the type line before " // " is read.
 * A spell with several card types has each of them (CR 205.2b — an artifact creature spell is an artifact spell and a creature
 * spell). A spell cast bestowed becomes an Aura enchantment (CR 702.103b), and an effect that sets a card type replaces the
 * old ones (CR 205.1a): a bestowed spell is an enchantment spell and nothing else.
 */
export function spellHasChosenCardType(spellCard, chosenCardType, { bestowed = false } = {}) {
  if (bestowed) return chosenCardType === "Enchantment";
  return String(spellCard?.type || spellCard?.type_line || "").split(" // ")[0].split(/\s+/).includes(chosenCardType);
}

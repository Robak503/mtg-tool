/**
 * faceUp.js — THE FACE THAT IS UP of a multi-face card, for every reader that asks what a card or permanent IS.
 *
 * In-game cards for a multi-face card carry Scryfall's COMBINED fields (cardIndex.publicCard): the type line
 * "Front type // Back type", an oracle of face blocks ("<name> - <type> {mana}\n<text>", a "//" line between), and a
 * `keywords` array that is the union of both faces'. The engine never turns a back face up (it models no transform, flip
 * or meld), so every such object has only its front face's characteristics:
 *   · a double-faced permanent with its front face up (CR 712.8d, 712.8f); one put onto the battlefield enters front face
 *     up (CR 712.14); a copy copies the face that is up (CR 707.8);
 *   · a double-faced card in any zone but the battlefield and the stack (CR 712.8a) — a graveyard, a library, a hand;
 *   · an unflipped flip card (CR 710.2) and an adventurer card outside the stack (CR 715.4).
 * A modal face that was played or cast enters as its own single-face card (modalDfc.mdfcFaceCards) and carries no " // ".
 *
 * A SPLIT card is the exception (layout "split"): in every zone except the stack its characteristics are those of its two
 * halves combined (CR 709.4, 709.4c — each card type of either half, each ability of each half), so faceUpView leaves it
 * whole. faceUpTypeLine still reads a split card's left half: the only split permanents are Rooms, whose halves share one
 * type line (CR 709.5a), so the battlefield readers that use it see the same types either way.
 *
 * LEAF MODULE: imports only splitCard.js (which imports nothing), so keywords.js, classLevels.js, layers.js and every
 * other reader share this one read without a cycle.
 */
import { parseFaceBlock } from "./splitCard.js";

function typeLineOf(card) {
  return String(card?.type || card?.type_line || "");
}

/**
 * The type line of the face that is up: the text before " // " on a combined line, else the whole line. Shared by the
 * layer derive (layers.cardTypesOf / subtypesOf, which re-exports it) and every battlefield reader outside it that reads
 * a type line. Before this read the derive took its card types and subtypes off the WHOLE line: Westvale Abbey ("Land //
 * Legendary Creature — Demon") was a 0/0 creature the toughness state-based action put into the graveyard as it entered
 * (CR 704.5f), Treasure Map a land, and every back face's subtypes came along (Delver of Secrets an Insect).
 */
export function faceUpTypeLine(card) {
  const line = typeLineOf(card);
  const sep = line.indexOf(" // ");
  return sep === -1 ? line : line.slice(0, sep);
}

/** A combined multi-face card whose characteristics are its front face's — any but a split card (CR 709.4). */
function readsAsFrontFace(card) {
  return !!card && typeof card === "object" && card.layout !== "split" && typeLineOf(card).includes(" // ");
}

/**
 * The text of the face that is up: the first face block of a combined oracle with its "<name> - <type> {mana}" header
 * peeled (splitCard.parseFaceBlock — cardIndex's metadata, not rules text). An oracle that carries no face blocks is kept
 * as it is; a front block that doesn't parse leaves no text (the safe side — no ability is read off it).
 */
function faceUpOracleOf(card) {
  const oracle = String(card?.oracle ?? card?.oracle_text ?? "");
  const blocks = oracle.split(/\n\/\/\n/);
  return blocks.length > 1 ? (parseFaceBlock(blocks[0])?.oracle ?? "") : oracle;
}

/**
 * The type line a card has wherever the engine holds it (never a back face up): a multi-face card's front face (CR 712.8a,
 * 712.8d), a split card's two halves combined (CR 709.4c). For a type-WORD test ("is it a land, an artifact, a Demon?") on a
 * battlefield permanent, a look-back or a card in a graveyard. A subtype list is parsed off faceUpTypeLine instead (a split
 * card's combined line has two dashes).
 */
export function characteristicTypeLine(card) {
  return typeLineOf(faceUpView(card));
}

const _viewMemo = new WeakMap();

/**
 * The card as its face that is up. For a combined multi-face card (not a split card): a view whose type line and rules
 * text are the front face's and whose `keywords` array is EMPTY — Scryfall's array is both faces' keywords together and
 * cannot say which face prints which, so the keyword read (keywords.hasKeyword) falls back to its ability-position scan
 * of the front face's own text. Every other field (name, mana, power, toughness, colors, layout, flags such as
 * isCommander) is kept. Any other card is returned AS IS — the same object, so every per-card cache keyed on it still
 * hits; the view of a combined card is memoized for the same reason (detectTriggers and parseStaticAbilities cache per
 * card object).
 *
 * Measured over the bundled snapshot (2026-10-17): the combined read gave 146 front faces a back face's keyword (Westvale
 * Abbey had Ormendahl's flying, lifelink, indestructible and haste), offered back-face activated abilities on the front
 * (Chalice of Life's "{T}: Target player loses 5 life", Treasure Map's Treasure Cove draw, Halvar's Equip), detected
 * back-face triggers and applied back-face statics (Bloodline Keeper's Vampire anthem, Liliana's Other Contract's "you
 * can't lose the game"). No front-face keyword is lost: no array keyword is named in a front face's text outside an
 * ability position.
 */
export function faceUpView(card) {
  if (!readsAsFrontFace(card)) return card;
  let view = _viewMemo.get(card);
  if (!view) {
    const type = faceUpTypeLine(card);
    const text = faceUpOracleOf(card);
    view = { ...card, type, type_line: type, oracle: text, oracle_text: text, keywords: [] };
    _viewMemo.set(card, view);
  }
  return view;
}

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
 * COLOURS ride the same rule: the bundled data carries an EMPTY top-level `colors` on every transform and modal double-faced
 * card (Scryfall keeps the colours on the faces), so frontFaceColors reads the front face's and characteristicColors is the one
 * colour read of a card in any zone and of a spell (see both below).
 *
 * LEAF MODULE: imports only splitCard.js and spellColors.js (splitCard.js imports only spellColors.js, which imports nothing),
 * so keywords.js, classLevels.js, layers.js and every other reader share this one read without a cycle.
 */
import { parseFaceBlock } from "./splitCard.js";
import { colorsOfSpell } from "./spellColors.js";

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

// The two layouts whose top-level `colors` is Scryfall's placeholder (the colours live on the faces).
const PLACEHOLDER_COLOR_LAYOUTS = new Set(["transform", "modal_dfc"]);

/**
 * The FRONT face's colours of a combined double-faced card whose top-level `colors` is empty, else null (read the card's own).
 * A double-faced card has only its front face's characteristics wherever the engine holds it: a permanent with its front face up
 * (CR 712.8d), a card in any zone but the battlefield and the stack (CR 712.8a), a nonmodal double-faced spell (CR 712.8c — the
 * engine casts nothing transformed); a modal face that was cast is projected as its own card first (modalDfc.mdfcFaceCards,
 * CR 712.8f). Read as:
 *   · the front face's own `colors` when the card carries its faces (the publicCard shape) — Scryfall's per-face data;
 *   · else, for a TRANSFORM or MODAL double-faced card (the enriched game-deck shape carries no faces), the colours of the front
 *     face's mana symbols (CR 105.2, 202.2), read from the front face's own block, so its own Devoid line counts (Drowner of
 *     Truth's {G/U} front is colourless, CR 702.114a) and the back face's keywords never do.
 * Corpus check (2026-10-01, the bundled data): equal to Scryfall's front-face colours on all 394 transform and 98 modal
 * double-faced cards in both card shapes, and on every other combined card with empty top-level colours in the publicCard shape.
 *
 * ⛔ NOT THE MANA FALLBACK FOR ANY OTHER LAYOUT. An adventurer, a split or a flip card carries its real colours at the top level,
 * so an empty array there means colourless — and its `mana` is not the front face's: Lindblum, Industrial Regency (a Town land
 * with an Adventure) has the empty top-level colours of a land and the {2}{R} of its Adventure half. Those cards, and every
 * single-faced card, a face view the engine projected (a modal face, an adventurer's creature half) and a stamped token, read
 * their own `colors`. (A double-faced TOKEN card from the data, without its faces, still reads colourless — its colour comes
 * from a colour indicator, not a mana cost; the engine mints its own tokens with stamped colours instead.)
 */
export function frontFaceColors(card) {
  if (!(Array.isArray(card?.colors) && card.colors.length === 0 && typeLineOf(card).includes(" // "))) return null;
  const front = Array.isArray(card.card_faces) ? card.card_faces[0] : null;
  if (Array.isArray(front?.colors)) return front.colors.map(String);
  if (!PLACEHOLDER_COLOR_LAYOUTS.has(String(card.layout || ""))) return null;
  return colorsOfSpell({
    mana: String(front?.mana_cost ?? card.mana ?? card.mana_cost ?? "").split(" // ")[0],
    oracle: String(card.oracle || card.oracle_text || "").split(/\n\/\/\n/)[0],
  });
}

/**
 * THE colour read of a CARD off the battlefield and of a SPELL (CR 105.2): the front face of a combined double-faced card
 * (frontFaceColors — CR 712.8a, 712.8c), else the card's own (spellColors.colorsOfSpell: its `colors` array, else its mana
 * cost's pips, a hybrid pip counting each of its colours — CR 202.2d — and Devoid none, CR 702.114a). The face being cast is
 * whatever the cast lane hands over: a projected split half, Adventure or modal face carries its own colours.
 * Every reader of a spell's or a zone card's colour goes through it — the cost reducers, flash and cast-from-top permissions,
 * the uncounterable statics, the spend restrictions, the cast triggers and the per-turn record, the counter filters, the
 * targeting and enchanting protections, the pitch and imprint reads, the tutor colour gate. Before it, a transform or modal
 * double-faced card read Scryfall's empty top-level array: Delver of Secrets was a colourless spell (Mystic Forge cast it off
 * the top, Forsaken Monument gained on it) and not a blue one (Sapphire Medallion, Force of Will, Gainsay missed it).
 * A battlefield permanent's colours are the layer engine's (layers.permanentColors), seeded by frontFaceColors too.
 */
export function characteristicColors(card) {
  return frontFaceColors(card) ?? colorsOfSpell(card);
}

const _viewMemo = new WeakMap();

/**
 * The card as its face that is up. For a combined multi-face card (not a split card): a view whose type line and rules
 * text are the front face's and whose `keywords` array is EMPTY — Scryfall's array is both faces' keywords together and
 * cannot say which face prints which, so the keyword read (keywords.hasKeyword) falls back to its ability-position scan
 * of the front face's own text — and whose `colors` are the front face's (frontFaceColors: the combined card's top-level
 * array is empty for a transform or modal double-faced card). Every other field (name, mana, power, toughness, layout,
 * flags such as isCommander) is kept. Any other card is returned AS IS — the same object, so every per-card cache keyed on
 * it still hits; the view of a combined card is memoized for the same reason (detectTriggers and parseStaticAbilities cache per
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
    const front = frontFaceColors(card);
    view = { ...card, type, type_line: type, oracle: text, oracle_text: text, keywords: [], ...(front ? { colors: front } : {}) };
    _viewMemo.set(card, view);
  }
  return view;
}

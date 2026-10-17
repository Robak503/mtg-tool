/**
 * adventure.js — ADVENTURE (CR 715). An adventurer card has its NORMAL characteristics — a PERMANENT: a creature,
 * an enchantment (the Wilds of Eldraine Virtues, An Unexpected Party, Promise of Aclazotz), an artifact (The
 * Arkenstone, Horn of Valhalla) or a land (the Final Fantasy Towns) — and, in the inset
 * frame, ALTERNATIVE characteristics it may have while it's a spell: an instant/sorcery "Adventure" (CR 715.2,
 * 205.3k). As the card is played its owner chooses which (CR 715.3). Casting the Adventure puts an instant/sorcery
 * on the stack; as it resolves, instead of going to the graveyard the card is EXILED, and for as long as it
 * remains exiled its owner may play it — not as an Adventure, so as the permanent: cast at that half's own cost, or,
 * for a land, played as a land drop (CR 715.3d). Casting the permanent half (from hand or from adventure-exile) puts
 * that permanent onto the battlefield as normal; off the stack the card has only its normal characteristics (CR 715.4).
 *
 * This module is the SINGLE source of truth for the Adventure card SHAPE:
 *   - parseAdventureCard(card)   → split the combined publicCard oracle into { permanent, adventure } faces
 *   - isAdventureCard(card)      → is this an instant/sorcery-adventure card?
 *   - isLandAdventure(card)      → is its permanent half a LAND (a Town — played, never cast)?
 *   - permanentFaceCard(card)    → a card-view projected onto the PERMANENT half (type/oracle/mana/name)
 *   - adventureFaceCard(card)    → a card-view projected onto the ADVENTURE half (type/oracle/mana/name)
 * The CREED native gate (BOTH halves modeled) lives in coverage.js (classifyAdventure), where classifyCard /
 * spellIsNative are already in scope — this module stays a PURE shape module (no coverage.js import, so the
 * dependency stays acyclic). legalChoices re-derives "is this adventure card native" from classifyCard on the
 * whole card (its registered classifier returns a native tier ⇔ both halves modeled), so the cast path is
 * offered ONLY for a card the engine plays end-to-end (no silently-dropped half).
 *
 * publicCard (cardIndex.oracleText) renders a face-bearing card as:
 *     <FaceName> - <type line> <mana>\n<face oracle text>\n//\n<FaceName> - <type line> <mana>\n<face oracle>
 * so the combined `type` is "Creature — Giant // Instant — Adventure" (or "Enchantment // Sorcery — Adventure")
 * and the combined `oracle` carries both
 * faces joined by a line that is exactly "//". We split on that delimiter, then peel the "<name> - <type>
 * <mana>" header line off each half (it's metadata cardIndex injected, NOT rules text) to recover each
 * face's bare oracle text. The header is matched defensively (the face name + " - " + a type fragment); if a
 * half doesn't match the expected shape we return null and the card is treated as non-adventure (a safe
 * false-negative — it stays whatever tier it was, never a mis-credit).
 */

import { colorsOfSpell } from "./spellColors.js"; // a leaf (no imports): a face's colours off its own mana cost (CR 202.2) — importing staticAbilityParser here closed a cycle through faceUp.js

// The "(Then exile this card. You may cast the creature later from exile.)" reminder (CR 207.2a — no rules
// meaning; "… cast the enchantment later …" on an enchantment Adventure) printed on the Adventure half. Stripped
// before parsing the adventure spell's effect so the bare reminder doesn't drag the program down. Matched
// permissively (any "then exile this card …" parenthetical).
const ADVENTURE_REMINDER_RE = /\(\s*then exile this card[^)]*\)/gi;

const stripAdventureReminder = (o) =>
  String(o || "").replace(ADVENTURE_REMINDER_RE, " ").replace(/[ \t]+/g, " ").replace(/ *\n */g, "\n").trim();

/**
 * Peel the cardIndex header line "<Name> - <type line> <mana>" off the front of a face's text block, leaving
 * the bare oracle text. Returns { name, typeLine, mana, oracle } or null when the block doesn't start with a
 * recognizable header (then the caller treats the card as non-adventure — a safe FN).
 */
function parseFaceBlock(block) {
  const text = String(block || "").trim();
  if (!text) return null;
  const nl = text.indexOf("\n");
  const header = (nl === -1 ? text : text.slice(0, nl)).trim();
  const rest = nl === -1 ? "" : text.slice(nl + 1);
  // Header shape: "<Name> - <type line> {mana...}"  (cardIndex.oracleText joins with " - ").
  // Capture the name (before " - "), the type+mana tail; the trailing brace-cluster is the mana cost.
  const m = header.match(/^(.+?)\s-\s(.+)$/);
  if (!m) return null;
  const name = m[1].trim();
  let tail = m[2].trim();
  // The mana cost is the trailing run of {…} symbols (may be empty for a costless face — none in the adventure
  // corpus, but tolerated). Split it off the end so the type line is clean.
  const manaMatch = tail.match(/((?:\{[^}]+\}\s*)+)$/);
  const mana = manaMatch ? manaMatch[1].replace(/\s+/g, "") : "";
  const typeLine = (manaMatch ? tail.slice(0, manaMatch.index) : tail).trim();
  return { name, typeLine, mana, oracle: rest.trim() };
}

/**
 * Split an Adventure card's combined publicCard fields into its two faces. Returns
 *   { permanent: { name, type, oracle, mana }, adventure: { name, type, oracle, mana } }
 * or null when the card isn't an instant/sorcery-adventure card in the expected combined shape.
 *
 * Detection is grounded on the TYPE line ("… // … — Adventure"): the combined type contains "//" and the
 * Adventure-side type fragment contains "Adventure". This never false-positives on a normal card (no "//"),
 * a regular split/MDFC (no "Adventure"), or a creature-back DFC. The adventure half MUST be an instant or
 * sorcery (Adventure is a spell type, CR 205.3k).
 *
 * THE PERMANENT HALF: a CREATURE, an ENCHANTMENT, an ARTIFACT or a LAND (a Town) — isModeledPermanentHalf. The first
 * three are cast at sorcery speed (CR 301.1, 303.1) and enter through the same PERMANENT_ETB lane as any face cast (the
 * projected face rides as the permanent, the whole card as its printedCard), and the classifiers that judge a
 * creature's triggers and statics judge the others' the same way. A LAND half is PLAYED, never cast (CR 305.1): from
 * hand as the turn's land drop, and from adventure-exile under CR 715.3d's "that player may play it" — the same land
 * drop (CR 116.2a, 305.2a), offered by legalChoices.actionsPlayLand with the projected face. Every other normal half
 * returns null and stays out of this lane (a safe false-negative):
 *   - a SORCERY half (Twice Upon a Time) — not a permanent at all;
 *   - a subtype no Adventure prints (an Aura, a Saga, a Vehicle, a basic land type) — no carrier exists to drive it.
 */
export function parseAdventureCard(card) {
  if (!card) return null;
  const type = String(card.type || card.type_line || "");
  const oracle = String(card.oracle || card.oracle_text || "");
  if (!type.includes("//") || !/\bAdventure\b/i.test(type)) return null;
  // The combined oracle joins the two faces with a line that is exactly "//".
  const parts = oracle.split(/\n\/\/\n/);
  if (parts.length !== 2) return null;
  const a = parseFaceBlock(parts[0]);
  const b = parseFaceBlock(parts[1]);
  if (!a || !b) return null;
  // Identify which block is the Adventure half (its type line contains "Adventure" and is an instant/sorcery)
  // and which is the permanent half. The permanent half is the OTHER block (a Creature or an Enchantment).
  const aIsAdv = /\bAdventure\b/i.test(a.typeLine);
  const bIsAdv = /\bAdventure\b/i.test(b.typeLine);
  let advBlock, permBlock;
  if (aIsAdv && !bIsAdv) { advBlock = a; permBlock = b; }
  else if (bIsAdv && !aIsAdv) { advBlock = b; permBlock = a; }
  else return null; // ambiguous / both / neither → not a clean adventure card
  if (!/\b(Instant|Sorcery)\b/i.test(advBlock.typeLine)) return null; // CR 205.3k — Adventure is a spell type
  if (!isModeledPermanentHalf(permBlock.typeLine)) return null;       // a creature or an enchantment (see above)
  return {
    permanent: { name: permBlock.name, type: permBlock.typeLine, oracle: permBlock.oracle, mana: permBlock.mana },
    adventure: { name: advBlock.name, type: advBlock.typeLine, oracle: stripAdventureReminder(advBlock.oracle), mana: advBlock.mana },
  };
}

/**
 * The permanent half this lane models. Every CREATURE half, exactly as before (an Artifact Creature included), plus a
 * noncreature half of exactly the shapes the corpus prints (2026-10-17), each nothing else (no other card type):
 *   - an ENCHANTMENT with no subtype (the Virtues, An Unexpected Party). A subtype changes how the permanent is cast or
 *     what it does (an Aura targets, a Saga keeps lore counters, a Class levels up); no Adventure prints one.
 *   - an ARTIFACT, plain or Legendary, with no subtype (The Arkenstone, Altar of Bhaal) or the subtype Equipment (Horn of
 *     Valhalla, Glamdring — the equip ability is the engine's own, CR 702.6a) or Book (Monster Manual — an artifact type
 *     with no rules of its own, CR 205.3g). Cast at sorcery speed like any artifact (CR 301.1).
 *   - a LAND with the subtype Town (the Final Fantasy Towns, Value Town — a land type with no rules of its own, CR 205.3i).
 *     A land is never cast (CR 305.1): legalChoices plays it, from hand or from adventure-exile, as a land drop.
 * Any other subtype (a Vehicle, a basic land type with its intrinsic mana ability) stays out until a card needs it.
 */
function isModeledPermanentHalf(typeLine) {
  const line = String(typeLine || "").trim();
  if (/\bCreature\b/i.test(line)) return true;
  return /^(?:Legendary )?Enchantment$/i.test(line)
    || /^(?:Legendary )?Artifact(?: — (?:Equipment|Book))?$/i.test(line)
    || /^Land — Town$/i.test(line);
}

/** True when the card's permanent half is a LAND (a Town): that half is played as a land drop, never cast (CR 305.1). */
export function isLandAdventure(card) {
  const parsed = parseAdventureCard(card);
  return !!parsed && /\bLand\b/.test(parsed.permanent.type);
}

/** True when `card` is an instant/sorcery Adventure card in the expected combined shape. */
export function isAdventureCard(card) {
  return parseAdventureCard(card) !== null;
}

/**
 * A card-view projected onto the PERMANENT half: { id, name, type, oracle, mana } (id preserved so zone moves
 * still find it). Used when the permanent is cast (from hand, the command zone or adventure-exile) so it enters
 * as that creature or enchantment, not the combined card. Returns null for a non-adventure card.
 * Its colours are the card's own: the bundled data records an adventurer's top-level colours as its NORMAL characteristics'
 * (CR 715.4) — corpus check 2026-10-17: equal to the permanent half's mana symbols (CR 202.2) on every adventurer except the
 * playtest Keeper of the Crown, whose {L} symbol the data colours green.
 */
export function permanentFaceCard(card) {
  const parsed = parseAdventureCard(card);
  if (!parsed) return null;
  return { ...card, name: parsed.permanent.name, type: parsed.permanent.type, oracle: parsed.permanent.oracle, mana: parsed.permanent.mana };
}

/**
 * A card-view projected onto the ADVENTURE half: { id, name, type, oracle, mana, colors }. Used when the Adventure
 * spell is cast so the stack object carries the adventure spell's program/cost — and its COLOURS (2026-10-17): on the stack as
 * an Adventure the spell has only its alternative characteristics (CR 715.3b), so it is the colour of the mana symbols in the
 * Adventure's own cost (CR 202.2). The card's top-level `colors` is its NORMAL colour (CR 715.4 — the bundled data records the
 * permanent half's), so a face that inherited it cast Blow Off Steam ({R}) as the blue of Frolicking Familiar: Gainsay could
 * counter it, it could target a creature with protection from red, and "whenever a player casts a red spell" never saw it.
 * (permanentFaceCard keeps the card's colours: they ARE the normal half's.) Returns null for a non-adventure card.
 */
export function adventureFaceCard(card) {
  const parsed = parseAdventureCard(card);
  if (!parsed) return null;
  const { name, type, oracle, mana } = parsed.adventure;
  return { ...card, name, type, oracle, mana, colors: colorsOfSpell({ mana, oracle }) };
}

/** A bare card-view ({name,type,oracle,mana}) for one parsed face — used by the coverage native gate. */
export function faceViews(parsed) {
  return {
    permanent: { name: parsed.permanent.name, type: parsed.permanent.type, oracle: parsed.permanent.oracle, mana: parsed.permanent.mana },
    adventure: { name: parsed.adventure.name, type: parsed.adventure.type, oracle: parsed.adventure.oracle, mana: parsed.adventure.mana },
  };
}

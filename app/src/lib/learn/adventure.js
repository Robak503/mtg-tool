/**
 * adventure.js — ADVENTURE (CR 715). An Adventure card is a split-like card with a CREATURE half and an
 * instant/sorcery "Adventure" half. From your hand you may cast EITHER half (CR 715.3). Casting the
 * Adventure half puts an instant/sorcery on the stack; when it resolves, instead of going to the graveyard
 * the card is EXILED (CR 715.3d), and while it remains exiled you may cast the CREATURE half from exile
 * (CR 715.3e), at the creature's own mana cost. Casting the creature half (from hand or from adventure-
 * exile) puts the creature permanent onto the battlefield as normal.
 *
 * This module is the SINGLE source of truth for the Adventure card SHAPE:
 *   - parseAdventureCard(card)   → split the combined publicCard oracle into { creature, adventure } faces
 *   - isAdventureCard(card)      → is this an instant/sorcery-adventure card?
 *   - creatureFaceCard(card)     → a card-view projected onto the CREATURE half (type/oracle/mana/name)
 *   - adventureFaceCard(card)    → a card-view projected onto the ADVENTURE half (type/oracle/mana/name)
 * The CREED native gate (BOTH halves modeled) lives in coverage.js (classifyAdventure), where classifyCard /
 * spellIsNative are already in scope — this module stays a PURE shape module (no coverage.js import, so the
 * dependency stays acyclic). legalChoices re-derives "is this adventure card native" from classifyCard on the
 * whole card (its registered classifier returns a native tier ⇔ both halves modeled), so the cast path is
 * offered ONLY for a card the engine plays end-to-end (no silently-dropped half).
 *
 * publicCard (cardIndex.oracleText) renders a face-bearing card as:
 *     <FaceName> - <type line> <mana>\n<face oracle text>\n//\n<FaceName> - <type line> <mana>\n<face oracle>
 * so the combined `type` is "Creature — Giant // Instant — Adventure" and the combined `oracle` carries both
 * faces joined by a line that is exactly "//". We split on that delimiter, then peel the "<name> - <type>
 * <mana>" header line off each half (it's metadata cardIndex injected, NOT rules text) to recover each
 * face's bare oracle text. The header is matched defensively (the face name + " - " + a type fragment); if a
 * half doesn't match the expected shape we return null and the card is treated as non-adventure (a safe
 * false-negative — it stays whatever tier it was, never a mis-credit).
 */

// The "(Then exile this card. You may cast the creature later from exile.)" reminder (CR 207.2 — no rules
// meaning) printed on the Adventure half. Stripped before parsing the adventure spell's effect so the bare
// reminder doesn't drag the program down. Matched permissively (any "then exile this card …" parenthetical).
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
 *   { creature: { name, type, oracle, mana }, adventure: { name, type, oracle, mana } }
 * or null when the card isn't an instant/sorcery-adventure card in the expected combined shape.
 *
 * Detection is grounded on the TYPE line ("… // … — Adventure"): the combined type contains "//" and the
 * Adventure-side type fragment contains "Adventure". This never false-positives on a normal card (no "//"),
 * a regular split/MDFC (no "Adventure"), or a creature-back DFC. The adventure half MUST be an instant or
 * sorcery (CR 715.1) — a card whose "Adventure" half is something else (none in the real corpus) returns null.
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
  // and which is the creature half. The creature half is the OTHER block (must be a Creature).
  const aIsAdv = /\bAdventure\b/i.test(a.typeLine);
  const bIsAdv = /\bAdventure\b/i.test(b.typeLine);
  let advBlock, creBlock;
  if (aIsAdv && !bIsAdv) { advBlock = a; creBlock = b; }
  else if (bIsAdv && !aIsAdv) { advBlock = b; creBlock = a; }
  else return null; // ambiguous / both / neither → not a clean adventure card
  if (!/\b(Instant|Sorcery)\b/i.test(advBlock.typeLine)) return null; // CR 715.1 — adventure is instant/sorcery
  if (!/\bCreature\b/i.test(creBlock.typeLine)) return null;          // the other half must be the creature
  return {
    creature: { name: creBlock.name, type: creBlock.typeLine, oracle: creBlock.oracle, mana: creBlock.mana },
    adventure: { name: advBlock.name, type: advBlock.typeLine, oracle: stripAdventureReminder(advBlock.oracle), mana: advBlock.mana },
  };
}

/** True when `card` is an instant/sorcery Adventure card in the expected combined shape. */
export function isAdventureCard(card) {
  return parseAdventureCard(card) !== null;
}

/**
 * A card-view projected onto the CREATURE half: { id, name, type, oracle, mana } (id preserved so zone moves
 * still find it). Used when the creature is cast (from hand or from adventure-exile) so it enters as the
 * creature, not the combined card. Returns null for a non-adventure card.
 */
export function creatureFaceCard(card) {
  const parsed = parseAdventureCard(card);
  if (!parsed) return null;
  return { ...card, name: parsed.creature.name, type: parsed.creature.type, oracle: parsed.creature.oracle, mana: parsed.creature.mana };
}

/**
 * A card-view projected onto the ADVENTURE half: { id, name, type, oracle, mana }. Used when the Adventure
 * spell is cast so the stack object carries the adventure spell's program/cost. Returns null for a
 * non-adventure card.
 */
export function adventureFaceCard(card) {
  const parsed = parseAdventureCard(card);
  if (!parsed) return null;
  return { ...card, name: parsed.adventure.name, type: parsed.adventure.type, oracle: parsed.adventure.oracle, mana: parsed.adventure.mana };
}

/** A bare card-view ({name,type,oracle,mana}) for one parsed face — used by the coverage native gate. */
export function faceViews(parsed) {
  return {
    creature: { name: parsed.creature.name, type: parsed.creature.type, oracle: parsed.creature.oracle, mana: parsed.creature.mana },
    adventure: { name: parsed.adventure.name, type: parsed.adventure.type, oracle: parsed.adventure.oracle, mana: parsed.adventure.mana },
  };
}

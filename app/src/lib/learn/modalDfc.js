/**
 * modalDfc.js — MODAL DOUBLE-FACED CARDS (CR 712.4 / 712.8) whose BACK face is a land. The SHELF-85 runbook's vein V1.
 *
 * A modal DFC is one card with two faces; the player chooses which face to play. This module is the SINGLE source
 * of truth for the SHAPE (mirroring splitCard.js / adventure.js): it never decides tiers and never imports the
 * classifier, so coverage.js and legalChoices.js can both read it without a cycle.
 *
 *   parseModalDfc(card)  → { front, back } face blocks (name / type / oracle / mana), or null when the card is not a
 *                          modal DFC with a LAND back face (a transform DFC — Delver — has a creature back; a split
 *                          card has two spell halves; both stay with their own modules).
 *   isModalDfc(card)     → parseModalDfc(card) !== null
 *   mdfcFaceCards(card)  → [frontView, backView] — card-views projected onto ONE face each (id preserved so zone
 *                          moves still find the real card; `faceIndex` 0/1 and `mdfcOf` = the combined card name).
 *   mdfcLandFaces(card)  → the subset of those views whose type line is a Land (the faces a LAND DROP may choose).
 *
 * SCOPE (CREED — model the whole card or park it). Slice 1 (2026-09-04) is the LAND DROP: every land face is offered as
 * its own play-land action and the permanent ENTERS AS THAT FACE (name, type, oracle, mana), with the combined card
 * kept as `printedCard` so leaving the battlefield restores the real card. Casting a SPELL front face is slice 2 —
 * until it lands, a spell//land keeps today's tier (land-partial: the back plays, the front does not).
 *
 * publicCard renders a multi-face card as
 *     "<Front> - <type> <mana>\n<front oracle>\n//\n<Back> - <type> <mana>\n<back oracle>"
 * (cardIndex.oracleText), the same shape the split-card parser peels with parseFaceBlock.
 */
import { parseFaceBlock } from "./splitCard.js";

export function parseModalDfc(card) {
  if (!card) return null;
  const type = String(card.type || card.type_line || "");
  const oracle = String(card.oracle || card.oracle_text || "");
  if (!type.includes("//")) return null;
  if (/\bAdventure\b/i.test(type)) return null; // adventure.js owns these
  // ⛔ LAYOUT IS THE GATE. A TRANSFORM DFC with a land back (Ojer Axonil, Deepest Might // Temple of Power — the LCI
  // gods) prints the same "<Creature> // Land" type line as a MODAL one (Kazandu Mammoth // Kazandu Valley) but its
  // back face is NEVER played directly (CR 712.4 — it transforms). Only Scryfall's layout tells them apart, so a
  // card that does not carry `layout: "modal_dfc"` is refused outright (a safe false-negative, never an offered
  // land drop the rules forbid). publicCard exposes the layout; fixtures must set it.
  if (String(card.layout || "") !== "modal_dfc") return null;
  const parts = oracle.split(/\n\/\/\n/);
  if (parts.length !== 2) return null;
  const front = parseFaceBlock(parts[0]);
  const back = parseFaceBlock(parts[1]);
  if (!front || !back) return null;
  // The back face must be a LAND (the modal-DFC land cycles: Pathways, the ZNR/MH3 spell//lands, the Kaldheim gods'
  // artifact//land backs are NOT lands and stay out). A "Land // Land" (Pathway) and a "<Spell> // Land" both qualify.
  if (!/^Land\b/i.test(back.typeLine.trim()) && !/\bLand\b/i.test(back.typeLine) ) return null;
  if (/\bCreature\b|\bArtifact\b|\bEnchantment\b|\bPlaneswalker\b/i.test(back.typeLine)) return null; // a land-creature / artifact-land back is not this shape
  return {
    front: { name: front.name, type: front.typeLine, oracle: front.oracle, mana: front.mana },
    back: { name: back.name, type: back.typeLine, oracle: back.oracle, mana: back.mana },
  };
}

export function isModalDfc(card) {
  return parseModalDfc(card) !== null;
}

/** [frontView, backView] — each `{ ...card, name, type, oracle, mana, faceIndex, mdfcOf }` (id preserved). */
export function mdfcFaceCards(card) {
  const parsed = parseModalDfc(card);
  if (!parsed) return null;
  const mdfcOf = card.name;
  const strip = { card_faces: undefined, mana_cost: undefined, type_line: undefined, oracle_text: undefined };
  return [
    { ...card, ...strip, name: parsed.front.name, type: parsed.front.type, oracle: parsed.front.oracle, mana: parsed.front.mana, faceIndex: 0, mdfcOf },
    { ...card, ...strip, name: parsed.back.name, type: parsed.back.type, oracle: parsed.back.oracle, mana: parsed.back.mana, faceIndex: 1, mdfcOf },
  ];
}

/**
 * P·38 — a SPELL // SPELL modal DFC (neither face a land — Birgi, God of Storytelling // Harnfel, Horn of Bounty and the other
 * Kaldheim gods): a player casting it chooses which face they cast (CR 712.11b); the combined card is never one object. The
 * land-back shapes stay parseModalDfc's (above). Returns { front, back } (parseFaceBlock's blocks) | null.
 */
export function parseSpellModalDfc(card) {
  if (!card || String(card.layout || "") !== "modal_dfc") return null;
  const parts = String(card.oracle || card.oracle_text || "").split(/\n\/\/\n/);
  if (parts.length !== 2) return null;
  const front = parseFaceBlock(parts[0]);
  const back = parseFaceBlock(parts[1]);
  if (!front || !back || /\bLand\b/i.test(front.typeLine) || /\bLand\b/i.test(back.typeLine)) return null;
  return { front, back };
}

// A face's own mana value (CR 202.3): a generic number counts its value, {X} nothing, every other symbol one.
function faceManaValue(mana) {
  let mv = 0;
  for (const [, sym] of String(mana || "").matchAll(/\{([^}]+)\}/g)) mv += /^\d+$/.test(sym) ? Number(sym) : sym === "X" ? 0 : 1;
  return mv;
}

/** [frontView, backView] of a spell // spell modal DFC — each its own face under the card's id: the face's name, type, oracle,
 *  mana and mana value (CR 712.8f — a face on the stack or battlefield has only its own characteristics), and its power and
 *  toughness off the card's faces when it carries them. */
export function spellMdfcFaceCards(card) {
  const parsed = parseSpellModalDfc(card);
  if (!parsed) return null;
  const strip = { card_faces: undefined, mana_cost: undefined, type_line: undefined, oracle_text: undefined };
  return [parsed.front, parsed.back].map((f, i) => ({
    ...card, ...strip, name: f.name, type: f.typeLine, oracle: f.oracle, mana: f.mana, cmc: faceManaValue(f.mana),
    ...(card.card_faces ? { power: card.card_faces[i].power ?? null, toughness: card.card_faces[i].toughness ?? null } : {}),
    faceIndex: i, mdfcOf: card.name,
  }));
}

/** The face views a LAND DROP may choose (type line carries Land) — one for a spell//land, two for a Pathway. */
export function mdfcLandFaces(card) {
  const faces = mdfcFaceCards(card);
  if (!faces) return [];
  return faces.filter((f) => /\bLand\b/i.test(String(f.type || "")));
}

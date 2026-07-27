/**
 * splitCard.js — SPLIT CARDS (CR 709). A split card is a single card with TWO halves printed side by side,
 * each with its own name, mana cost, type line, and rules text. While it isn't on the stack it's a single
 * object with the characteristics of BOTH halves (CR 709.3); when you cast it you choose ONE half and that
 * half's characteristics are what's on the stack (CR 709.4). A resolved split-card spell — like any
 * instant/sorcery — goes to its owner's GRAVEYARD (there is no adventure-style exile dance).
 *
 * This module is the SINGLE source of truth for the split-card SHAPE, mirroring adventure.js:
 *   - parseSplitCard(card) → { left, right } face blocks, or null when the card isn't a PLAIN split card
 *   - isSplitCard(card)    → is this a plain (non-fuse, non-aftermath) split card we model?
 *   - splitFaceCards(card) → [leftFaceView, rightFaceView] (each a card-view projected onto one half)
 *
 * SCOPE (CREED — model the WHOLE card or park it):
 *   - Only PLAIN splits where BOTH halves are instant/sorcery and BOTH are cast FROM HAND (CR 709.4).
 *   - FUSE (CR 702.102 — "you may cast one or both halves") is PARKED: casting both halves at once is an
 *     option we don't offer, so a fuse card isn't fully modeled → parseSplitCard returns null (the whole
 *     card stays whatever tier it was, an Arbiter spell — a safe false-negative).
 *   - AFTERMATH (CR 702.127 — the second half is cast ONLY from the graveyard) is PARKED: its second half
 *     has a different casting zone we don't model → null.
 * The native gate (BOTH halves' spell effects modeled) lives in coverage.js (classifySplit), where
 * spellIsNative is in scope — this stays a PURE shape module (no coverage.js import → acyclic).
 *
 * publicCard renders a split card exactly like an adventure card:
 *     "<Left> - <type> <mana>\n<left oracle>\n//\n<Right> - <type> <mana>\n<right oracle>"
 * so we split on the "//" delimiter line and peel the "<name> - <type> {mana}" header off each block
 * (metadata cardIndex injected, NOT rules text), recovering each face's bare oracle. A block that doesn't
 * match the expected header shape returns null → the card is treated as non-split (a safe FN).
 */

/** Peel the cardIndex header line "<Name> - <type line> {mana}" off a face block → { name, typeLine, mana,
 *  oracle } or null. (Identical shape to adventure.parseFaceBlock; duplicated so each shape module stays a
 *  standalone leaf with no cross-import.) */
function parseFaceBlock(block) {
  const text = String(block || "").trim();
  if (!text) return null;
  const nl = text.indexOf("\n");
  const header = (nl === -1 ? text : text.slice(0, nl)).trim();
  const rest = nl === -1 ? "" : text.slice(nl + 1);
  const m = header.match(/^(.+?)\s-\s(.+)$/);
  if (!m) return null;
  const name = m[1].trim();
  const tail = m[2].trim();
  const manaMatch = tail.match(/((?:\{[^}]+\}\s*)+)$/);
  const mana = manaMatch ? manaMatch[1].replace(/\s+/g, "") : "";
  const typeLine = (manaMatch ? tail.slice(0, manaMatch.index) : tail).trim();
  return { name, typeLine, mana, oracle: rest.trim() };
}

/**
 * Split a plain split card's combined publicCard fields into its two faces. Returns
 *   { left: { name, type, oracle, mana }, right: { name, type, oracle, mana } }
 * or null when the card isn't a plain (non-fuse, non-aftermath) instant/sorcery split in the expected
 * combined shape.
 *
 * Detection: the combined type line contains "//" and is NOT an Adventure card (that has its own module).
 * Both faces must be instant/sorcery (CR 709.2 — a split card's halves are instants and/or sorceries). Fuse
 * and Aftermath are excluded (see SCOPE above) so only cards the engine casts end-to-end from hand qualify.
 */
export function parseSplitCard(card) {
  if (!card) return null;
  const type = String(card.type || card.type_line || "");
  const oracle = String(card.oracle || card.oracle_text || "");
  if (!type.includes("//")) return null;
  if (/\bAdventure\b/i.test(type)) return null; // adventure.js owns these
  // The combined oracle joins the two faces with a line that is exactly "//".
  const parts = oracle.split(/\n\/\/\n/);
  if (parts.length !== 2) return null;
  const left = parseFaceBlock(parts[0]);
  const right = parseFaceBlock(parts[1]);
  if (!left || !right) return null;
  // BOTH halves must be instant/sorcery (CR 709.2). Anything else (a split with a non-spell half — none in
  // the real corpus) is not ours.
  if (!/\b(Instant|Sorcery)\b/i.test(left.typeLine) || !/\b(Instant|Sorcery)\b/i.test(right.typeLine)) return null;
  // FUSE — UNPARKED (census slice 54). The original park read "a fuse card lets you cast BOTH halves at once
  // (an unmodeled option)", which was the right call before the optional-mode family existed and is the
  // wrong one now. Fuse (CR 702.102a) only ADDS a casting mode: both halves remain individually castable
  // from hand exactly as on any other split card, and the engine already offers each of them
  // (actionsCastSplitFromHand). Declining the fused mode therefore leaves a real, complete, legal cast —
  // the same test delve / myriad / replicate / squad / devour are credited under. Not offering it is an
  // under-offer, which is the safe direction.
  //
  // AFTERMATH — UNPARKED (census slice 55), but ONLY because the hand-cast lane now withholds the second
  // half, which is exactly the condition slice 54 set for it. An aftermath card's second half is castable
  // ONLY from the graveyard (CR 702.127a); this engine's split lane offers both halves from HAND, so simply
  // deleting the park would have produced an ILLEGAL cast rather than a mere under-offer.
  //
  // So the shape carries the fact instead of hiding it: `rightGraveyardOnly` is set, and
  // legalChoices.actionsCastSplitFromHand skips that face. The result is the FLASHBACK bargain, already the
  // house precedent — a graveyard cast the engine never offers (a safe under-offer), while the front half
  // plays from hand exactly as printed. The classifier still requires BOTH halves to be modeled before the
  // card is credited at all, so nothing is swept under the rug by never offering one of them.
  const aftermath = /\bAftermath\b/i.test(type) || /\bAftermath\b/i.test(oracle);
  return {
    left: { name: left.name, type: left.typeLine, oracle: left.oracle, mana: left.mana },
    right: { name: right.name, type: right.typeLine, oracle: right.oracle, mana: right.mana },
    ...(aftermath ? { rightGraveyardOnly: true } : {}),
  };
}

/** True when `card` is a plain split card in the expected combined shape. */
export function isSplitCard(card) {
  return parseSplitCard(card) !== null;
}

/**
 * The two half card-views for a split card: [left, right], each `{ ...card, name, type, oracle, mana }`
 * (id preserved so zone moves still find the real card). Used by legalChoices to offer each half's cast and
 * by the dispatcher (action.faceCard) to resolve the chosen half's program. Returns null for a non-split card.
 */
export function splitFaceCards(card) {
  const parsed = parseSplitCard(card);
  if (!parsed) return null;
  return [
    { ...card, name: parsed.left.name, type: parsed.left.type, oracle: parsed.left.oracle, mana: parsed.left.mana },
    // AFTERMATH: the right face carries the graveyard-only fact with it, so any consumer that projects the
    // faces (not just the hand-cast lane) can see it rather than having to re-parse the card to find out.
    { ...card, name: parsed.right.name, type: parsed.right.type, oracle: parsed.right.oracle, mana: parsed.right.mana, ...(parsed.rightGraveyardOnly ? { graveyardOnly: true } : {}) },
  ];
}

/** Bare face-views ({name,type,oracle,mana}) for the coverage native gate. */
export function splitFaceViews(parsed) {
  return {
    left: { name: parsed.left.name, type: parsed.left.type, oracle: parsed.left.oracle, mana: parsed.left.mana },
    right: { name: parsed.right.name, type: parsed.right.type, oracle: parsed.right.oracle, mana: parsed.right.mana },
  };
}

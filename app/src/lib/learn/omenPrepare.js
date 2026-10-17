/**
 * omenPrepare.js — OMEN cards (CR 720) and PREPARATION cards (CR 722): the two inset-frame shapes besides the Adventure. This
 * engine casts them only NORMALLY — as the normal half, a creature on every printed one.
 *
 *   - An omen card is cast normally or as an Omen (CR 720.3); everywhere but the stack as an Omen it has only its normal
 *     characteristics (CR 720.4). The Omen spell is shuffled into its owner's library as it resolves (CR 720.3d), a destination
 *     the cast lanes do not model, so the Omen is never offered (a safe under-offer).
 *   - A preparation card can't be cast using its inset characteristics at all (CR 722.3): they define the copy a PREPARED
 *     permanent lets its controller cast (CR 722.3c), a designation this engine does not track. In every zone the card has only
 *     its normal characteristics (CR 722.4).
 * Either way the legal cast is the normal one: the normal half at its own cost and timing, entering as that creature — the
 * adventurer's permanent-half posture (legalChoices offers it from hand and from the command zone; the dispatcher enters the
 * projected face with the whole card as its printedCard). Before 2026-10-17 the combined card was cast as ONE object at both
 * halves' summed cost (Marang River Regent // Coil and Catch for ten), at instant speed when the inset half is an Instant.
 *
 * A PURE shape module (it decides no tier and imports no classifier), reading the publicCard combined form
 *     "<Normal> - <type> <mana>\n<normal oracle>\n//\n<Inset> - <type> <mana>\n<inset oracle>"
 * with the same header peel as the split-card and modal-DFC modules (splitCard.parseFaceBlock).
 *   - an OMEN is recognised by its inset half's spell type (CR 205.3k lists Omen among the spell types of instants and sorceries);
 *   - a PREPARATION card prints nothing that names it — its inset is a bare "Sorcery" or "Instant" — so only the Scryfall layout
 *     ("prepare") tells it apart: a card without it is refused (a safe false negative), as modalDfc.js refuses a double-faced
 *     card without its layout.
 * Nothing gates on the normal half's type: casting the card normally is its own legal cast whatever that half is (CR 720.3,
 * 722.4), and the shared cast builder judges the face like any card (a land face is never cast). Every bundled one — 86 cards on
 * 2026-10-17, 16 omen and 70 preparation — has a creature there. The face keeps the card's top-level colours: the bundled data
 * records them as the normal half's for both layouts (checked on all 86 — CR 720.4, 722.4).
 */
import { parseFaceBlock } from "./splitCard.js";

/**
 * { kind: "omen" | "prepare", normal: { name, type, oracle, mana }, inset: { name, type, oracle, mana } } for an omen or a
 * preparation card in the combined two-block shape, else null.
 */
export function parseOmenPrepareCard(card) {
  if (!card) return null;
  const parts = String(card.oracle || card.oracle_text || "").split(/\n\/\/\n/);
  if (parts.length !== 2) return null;
  const normal = parseFaceBlock(parts[0]);
  const inset = parseFaceBlock(parts[1]);
  if (!normal || !inset) return null;
  const kind = /\bOmen\b/.test(inset.typeLine) ? "omen" : String(card.layout || "") === "prepare" ? "prepare" : null;
  if (!kind) return null;
  return {
    kind,
    normal: { name: normal.name, type: normal.typeLine, oracle: normal.oracle, mana: normal.mana },
    inset: { name: inset.name, type: inset.typeLine, oracle: inset.oracle, mana: inset.mana },
  };
}

/**
 * The card projected onto its NORMAL half — `{ ...card, name, type, oracle, mana }`, id preserved so zone moves still find the
 * real card — or null when the card is not an omen or preparation card this module reads.
 */
export function normalFaceCard(card) {
  const parsed = parseOmenPrepareCard(card);
  if (!parsed) return null;
  const { name, type, oracle, mana } = parsed.normal;
  return { ...card, name, type, oracle, mana };
}

/**
 * landEntryCopy.js — VESUVA (play-weighted #923, 2026-11-03): "You may have this land enter tapped as a copy of any land on the battlefield."
 *
 * An "enter as a copy" ability is a replacement effect (CR 614.1c): the copy is made as the land enters, so it enters as the copied land,
 * tapped (CR 707.2 — the copiable values only: not the copied land's tapped state, counters or Auras, and none of the non-copy effects
 * that changed it — the bundled ruling). The copied land's own "as this land enters" and "enters with" abilities apply to it, and its
 * enters triggers trigger (CR 707.5; the bundled ruling). A land that is itself copying something is copied as that copy (its copiable
 * values — layers.deriveCharacteristics' copiableValues, CR 707.3). Declined, it enters untapped as itself, a land with no abilities
 * (the bundled ruling). Only a land already on the battlefield may be chosen — never one entering at the same time (the ruling).
 *
 * The choice belongs to the player the land enters under. Played from the hand (legalChoices.actionsPlayLand), it is the land drop's
 * own choice: one play-land action per land it may copy (`copyOfPermanentId`) beside the plain play, and the dispatcher enters the
 * copy. Put onto the battlefield by an effect (zones.enterCardFromZone), the house policy decides for every seat (houseLandCopyPick —
 * the colour its player needs; the Cursed Mirror precedent for an as-enters copy on that road).
 *
 * Closed on purpose: exactly that one sentence, the whole card's text. A candidate is a permanent that is a land now AND whose copiable
 * values are a single-faced land card THE ENGINE READS WHOLE — its copiable card classifies `land` (coverage.classifyCard; the review of
 * 2026-11-03): the copy plays the copied land's text (CR 707.5), so a land the engine reads only in part (`land-partial` — Lotus Vale's and
 * Scorched Ruins' "if this land would enter" replacement, Dark Depths' ice counters, Glacial Chasm's "can't attack") is never offered.
 * A transformed double-faced permanent is not offered either — a narrower pool, never a copy that enters wrong. The classifier is
 * registered by coverage.js at load (coverage imports this module, so this one can't import it back); an unregistered read throws.
 * A leaf over gameState, layers, cloneCopy and the colour reader.
 *
 * KEPT COPIES (landCopyKept — the AI's land drop and the house pick): a choice no player would make is never made for one —
 *   · a copy of a legendary land its player already controls by that name: the legend rule would leave only one (CR 704.5j), and the
 *     house keeps the newest — the tapped copy over the untapped original;
 *   · a copy it would lose as it enters: "When this land enters, sacrifice it unless you return an untapped Island you control to its
 *     owner's hand" (Coral Atoll, Dormant Volcano, Darigaaz's Caldera) with no such land of its player's, or a Karoo's "return a land you
 *     control to its owner's hand" with no other land — it would return itself.
 * (A person's land drop still offers every candidate: the choice is theirs.)
 */
import { snapshotCopiedCard } from "./cloneCopy.js";
import { permanentHasCardType, deriveCharacteristics, permanentTypes } from "./layers.js";
import { landColourScore } from "./landColour.js";

/** The land classifier (coverage.classifyCard), registered by coverage.js at load; its answers memoized per copiable card (card objects
 *  are immutable, house convention), so listing the candidates classifies each land once however often it is listed (the recheck's
 *  R1 — the AI's land pick and every land-drop offer list them). A new registration starts a new memo. */
let landTierOf = null;
let landTierMemo = new WeakMap(); // copiable card -> tier
export function registerLandCopyClassifier(classify) {
  landTierOf = classify;
  landTierMemo = new WeakMap();
}
function landTier(card) {
  if (!landTierOf) throw new Error("landEntryCopy: the land classifier is unregistered — load coverage.js (legalChoices does)");
  let tier = landTierMemo.get(card);
  if (tier === undefined) {
    tier = landTierOf(card);
    landTierMemo.set(card, tier);
  }
  return tier;
}

const stripReminder = (t) => String(t || "").replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim();
const LAND_ENTRY_COPY_RE = /^you may have this land enter tapped as a copy of any land on the battlefield\.?$/i;
/** The one sentence (reminder text and the card's own name read as "this land", CR 201.5c), as coverage.landFullyCovered admits it. */
export const LAND_ENTRY_COPY_LINE_RE = LAND_ENTRY_COPY_RE;

/** Is the card's whole text Vesuva's copy sentence? `{ tapped: true }` (it enters tapped as the copy), or null. */
export function landEntryCopySpec(card) {
  if (!/\bLand\b/.test(String(card?.type || card?.type_line || "").split(" // ")[0])) return null;
  let text = stripReminder(card?.oracle ?? card?.oracle_text ?? "");
  if (card?.name) text = text.split(card.name).join("this land");
  return LAND_ENTRY_COPY_RE.test(text) ? { tapped: true } : null;
}

/** A permanent's copiable values (CR 707.2, 707.3): a layer-1 copy effect's source when one applies, else its card. */
function copiableCardOf(state, perm) {
  return deriveCharacteristics(state, perm.id)?.copiableValues || perm.card;
}

/**
 * The lands the entering land may copy, on the board as it enters (`state` — the card is not on the battlefield yet): every permanent on
 * any battlefield that is a land now and whose copiable values are a single-faced land card, as `{ id, name, copy }` — `copy` the card the
 * entering land would be (snapshotCopiedCard over the copiable values, carrying the entering card's id). One per distinct copied name when
 * `distinct` (the play offer: two Forests make the same copy).
 */
export function landCopyCandidates(state, enteringCard, { distinct = false } = {}) {
  const out = [];
  const seen = new Set();
  for (const pid of Object.keys(state?.players || {})) {
    for (const perm of state.players[pid]?.battlefield || []) {
      if (!permanentHasCardType(state, perm.id, "Land")) continue;
      const copiable = copiableCardOf(state, perm);
      const line = String(copiable?.type || copiable?.type_line || "");
      if (line.includes(" // ") || !/\bLand\b/.test(line)) continue;
      if (landTier(copiable) !== "land") continue;
      const name = copiable?.name || perm.card?.name || "";
      if (distinct && seen.has(name)) continue;
      seen.add(name);
      out.push({ id: perm.id, name, copy: snapshotCopiedCard({ ...perm, card: copiable }, enteringCard, []) });
    }
  }
  return out;
}

/** The card the land enters as when it copies `permanentId` (one of landCopyCandidates), or null when that permanent is no candidate now. */
export function landCopyFor(state, enteringCard, permanentId) {
  return landCopyCandidates(state, enteringCard).find((c) => c.id === permanentId)?.copy ?? null;
}

/** The text a copy plays, its own name read as "this land" (CR 201.5c). */
const copyText = (copy) => {
  let text = String(copy?.oracle ?? copy?.oracle_text ?? "");
  if (copy?.name) text = text.split(copy.name).join("this land");
  return text;
};
const RETURN_OR_SACRIFICE_RE = /\bwhen this land enters, sacrifice it unless you return (an untapped |a )?(.+?) you control to its owner['’]s hand\b/i;
const RETURN_A_LAND_RE = /\bwhen this land enters, return a land you control to its owner['’]s hand\b/i;
/** Does `perm` (one of `playerId`'s) meet a return clause's "[untapped] <what>": "land", "non-<Subtype> land", or a land subtype? Null
 *  when the words are none of those (the caller reads that as unmet). */
function meetsReturnFilter(state, perm, untapped, what) {
  if (!permanentHasCardType(state, perm.id, "Land")) return false;
  if (untapped && perm.tapped) return false;
  const subtypes = permanentTypes(state, perm.id).subtypes || [];
  const w = String(what).trim();
  if (/^land$/i.test(w)) return true;
  const non = w.match(/^non-([A-Z][a-z]+) land$/);
  if (non) return !subtypes.includes(non[1]);
  if (/^[A-Z][a-z]+$/.test(w)) return subtypes.includes(w);
  return null;
}
/**
 * Would `playerId` keep the copy `candidate` (one of landCopyCandidates) — the file note's KEPT COPIES. The board is the one the land
 * enters on (it is not on the battlefield yet), so every land read is one of the player's others.
 */
export function landCopyKept(state, playerId, candidate) {
  const copy = candidate?.copy;
  if (!copy) return false;
  const mine = state?.players?.[playerId]?.battlefield || [];
  const typeLine = String(copy.type || copy.type_line || "");
  if (/\bLegendary\b/.test(typeLine) && mine.some((p) => p.card?.name === copy.name && /\bLegendary\b/.test(String(p.card?.type || p.card?.type_line || "")))) return false;
  const text = copyText(copy);
  const ros = text.match(RETURN_OR_SACRIFICE_RE);
  if (ros && !mine.some((p) => meetsReturnFilter(state, p, !!(ros[1] && /untapped/i.test(ros[1])), ros[2]) === true)) return false;
  if (RETURN_A_LAND_RE.test(text) && !mine.some((p) => permanentHasCardType(state, p.id, "Land"))) return false;
  return true;
}

const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
/**
 * THE HOUSE PICK (the road where no player is asked — an effect puts the land onto the battlefield): the candidate whose copy makes the
 * colour its player's hand and command zone need and no source of theirs makes, then the colour asked most (landColour — the one
 * reader the land drop and the land searches share), then any copy that makes mana, then the copied name and the permanent id
 * (locale-free, serialize-stable). Only a copy its player would keep (landCopyKept). Null with no such candidate — it enters as itself.
 */
export function houseLandCopyPick(state, playerId, candidates) {
  const kept = candidates.filter((c) => landCopyKept(state, playerId, c));
  if (!kept.length) return null;
  const score = landColourScore(state, playerId);
  const ranked = kept.map((c) => ({ c, s: score(c.copy) }));
  ranked.sort((x, y) => (y.s.score - x.s.score) || (y.s.makesMana - x.s.makesMana) || cmp(x.c.name, y.c.name) || cmp(String(x.c.id), String(y.c.id)));
  return ranked[0].c;
}

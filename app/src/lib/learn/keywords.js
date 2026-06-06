/**
 * keywords.js — printed combat-keyword detection for the learn engine.
 *
 * In-session cards carry `{ name, type, mana, oracle }` (see LearnView's
 * deckToCardArray) — they do NOT carry Scryfall's `keywords` array. So we
 * detect keywords primarily from ORACLE TEXT, matching the keyword only at an
 * ability-word position (start of a line, or after ", " / "; "), so rules text
 * like "can't be blocked by creatures with flying" or "gains trample" doesn't
 * false-match. A `keywords` array, when present (tests / richer data), wins.
 *
 * v1 reads PRINTED keywords only. Keywords GRANTED by other permanents (sliver
 * lords, anthems, equipment) are a continuous-effects feature — deferred to the
 * cardEffects registry. Detection is intentionally conservative: a miss means a
 * keyword doesn't apply (safe), never a fabricated ability.
 */

// Evergreen + common combat keywords the engine models.
export const COMBAT_KEYWORDS = [
  "Flying",
  "Reach",
  "First strike",
  "Double strike",
  "Trample",
  "Deathtouch",
  "Lifelink",
  "Vigilance",
  "Menace",
  "Haste",
];

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Compile each keyword's oracle pattern once. hasKeyword runs in the combat
// hot path (per creature, per damage step, across full-game autopilots), so a
// fresh RegExp per call would be wasteful.
const PATTERN_CACHE = new Map();
function patternFor(keyword) {
  let re = PATTERN_CACHE.get(keyword);
  if (!re) {
    // Keyword at the start of the text or a line, or in a comma/semicolon-
    // separated keyword list — followed by a word boundary (so reminder text
    // in parentheses or a following keyword still matches).
    re = new RegExp(`(^|\\n|; |, )${escapeRegExp(keyword)}\\b`, "i");
    PATTERN_CACHE.set(keyword, re);
  }
  return re;
}

/**
 * Does the card have the given keyword as a printed ability? Checks an explicit
 * `keywords` array first, then an ability-word-position oracle match.
 */
export function hasKeyword(card, keyword) {
  if (!card || !keyword) return false;

  const kws = Array.isArray(card.keywords) ? card.keywords : [];
  if (kws.length && kws.some(k => String(k).toLowerCase() === keyword.toLowerCase())) return true;

  const oracle = card.oracle || card.oracle_text || "";
  if (!oracle) return false;
  return patternFor(keyword).test(oracle);
}

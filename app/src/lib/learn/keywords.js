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

// Keywords the engine will GRANT (Equipment/Aura/anthem statics AND combat-trick spells/
// abilities). RESTRICTED to those whose runtime effect is ENFORCED *and read layer-aware*
// (combat damage, blocking, attack-tapping, summoning-sickness all consult permanentHasKeyword),
// so a granted instance behaves EXACTLY like a printed one. Menace is EXCLUDED — its
// "must be blocked by two or more" rule (CR 702.110) isn't enforced anywhere, so granting it
// would be a silent no-op that over-claims coverage. SINGLE SOURCE OF TRUTH: staticAbilityParser
// (attach/anthem grants) and effects/parser (combat-trick grants) both read this — they can't
// drift into granting a keyword the engine ignores. A "gains <unmodeled kw>" clause
// (indestructible/hexproof/protection/…) therefore drops to the Arbiter, never a fake grant.
const NON_GRANTABLE = new Set(["menace"]);
export const GRANTABLE_COMBAT_KEYWORDS = new Set(
  COMBAT_KEYWORDS.map((k) => k.toLowerCase()).filter((k) => !NON_GRANTABLE.has(k)),
);

/** Canonical-cased keyword name for a lowercase word ("first strike" → "First strike"). */
export function canonicalCombatKeyword(lower) {
  return COMBAT_KEYWORDS.find((k) => k.toLowerCase() === String(lower).toLowerCase()) || lower;
}

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

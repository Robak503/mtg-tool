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
  // Non-evergreen but fully enforced via combatEvasion.canBlockAttacker / permanentHasKeyword:
  "Fear",       // blockable only by artifact and/or black (CR 702.36b)
];

// Keywords the engine will GRANT (Equipment/Aura/anthem statics AND combat-trick spells/
// abilities). RESTRICTED to those whose runtime effect is ENFORCED *and read layer-aware*
// (combat damage, blocking, attack-tapping, summoning-sickness all consult permanentHasKeyword),
// so a granted instance behaves EXACTLY like a printed one. SINGLE SOURCE OF TRUTH:
// staticAbilityParser (attach/anthem grants) and effects/parser (combat-trick grants) both read
// this — they can't drift into granting a keyword the engine ignores. A "gains <unmodeled kw>"
// clause (hexproof/protection/…) therefore drops to the Arbiter, never a fake grant.
// NOTE: menace WAS excluded here (comment said "not enforced") but combatEvasion.attackerHasMenace
// / combatResolution enforce it via permanentHasKeyword — the exclusion was stale (GATED-GY-EXT).
const NON_GRANTABLE = new Set(); // all COMBAT_KEYWORDS are now grantable
export const GRANTABLE_COMBAT_KEYWORDS = new Set(
  COMBAT_KEYWORDS.map((k) => k.toLowerCase()).filter((k) => !NON_GRANTABLE.has(k)),
);

// Keywords the STATIC grant path (anthems/lords + attached Equipment/Auras + minted tokens) may grant —
// the combat set PLUS non-combat keywords whose runtime effect is ENFORCED and read layer-aware:
//   - "indestructible": the destroy effect (CR 702.12b) + the lethal-damage SBA (CR 704.5g) both consult
//     permanentHasKeyword via gameState.isIndestructible (Darksteel Plate, Avacyn).
//   - "hexproof" / "shroud" (STATIC-HEXPROOF-SHROUD): targeting is gated by canBeTargetedBy
//     (spellEffects.js), read LAYER-AWARE over continuousEffects — a GRANTED instance is honored exactly
//     like a printed one. Targeting-exclusion is the ENTIRETY of what these keywords do (hexproof =
//     untargetable by opponents, shroud = by anyone), so granting them is COMPLETE — no partial behavior,
//     no false-positive native. This admits the anthem/equipment/token forms (Crystalline Sliver "All
//     Slivers have shroud", Lightning Greaves "has haste and shroud", Asceticism/Privileged Position
//     "have hexproof", Deeproot Waters' hexproof Merfolk token, Angelic Overseer's GATED self-grant).
// Combat TRICKS / pump-grants (effects/parser.js parseGrantedKeywords) intentionally STAY on
// GRANTABLE_COMBAT_KEYWORDS only — the one-shot until-EOT GROUP-KEYWORD-GRANT (atoms/combat.js) handles
// the team/permanents "gain hexproof/indestructible until end of turn" form via its own path; a SINGLE-
// target "gains indestructible until end of turn" instant (Withstand Death) still routes to the Arbiter
// (a deliberate, test-pinned divergence, not drift).
export const GRANTABLE_STATIC_KEYWORDS = new Set([...GRANTABLE_COMBAT_KEYWORDS, "indestructible", "hexproof", "shroud"]);

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

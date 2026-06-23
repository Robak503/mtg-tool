/**
 * combatEvasion.js — EVADE: the canBlock / attack-legality chokepoint that ENFORCES the
 * display-only combat-evasion keywords, so a body carrying them resolves CORRECTLY end-to-end.
 *
 * Engine-first (THE CREED): a matcher with no working resolution is itself a false positive.
 * coverage.js only counts these keyword bodies native because THIS file makes the rule real.
 * Everything is read LAYER-AWARE (permanentHasKeyword / permanentColors / permanentTypes) so a
 * GRANTED or REMOVED instance is honored, not just the printed one.
 *
 * Pairwise block-legality — canBlockAttacker(state, blockerId, attackerId, defenderId):
 *   attacker-side:
 *     Flying (CR 702.9b)     — blockable only by creatures with flying or reach
 *     "can't be blocked"     — unblockable (bare self-clause): blockable by nothing
 *     basic landwalk (702.14) — unblockable while the DEFENDING player (per-defender → 4P-correct)
 *                              controls a land of that basic type
 *     Skulk (702.118b)        — not blockable by a creature with greater power
 *     Fear (702.36b)         — blockable only by artifact and/or black creatures
 *     Intimidate (702.13b)   — blockable only by artifact and/or creatures sharing a color with it
 *     Horsemanship (702.31b) — blockable only by creatures with horsemanship
 *   blocker-side:
 *     "can't block"          — may never be declared as a blocker
 *     "can block only creatures with flying" — may block only flying attackers
 *
 * Menace (CR 509.1c / 702.111b) is a SET-level rule, enforced at resolution
 * (combatResolution.js): a menace attacker left with exactly ONE blocker is treated as unblocked.
 * Defender (702.3b) is enforced in legalChoices.actionsDeclareAttacker (can't attack).
 *
 * Only BARE printed shapes are recognized. A conditional / compound variant the chokepoint can't
 * faithfully honor (a team grant, a condition like "coven"/"snow", "can't be blocked except by …")
 * falls through unrecognized → the body stays body-only / the card routes to the Arbiter
 * (false-negative SAFE), never a half-enforced false positive.
 *
 * EVASION-QUALIFIER (this PR): parsed text restrictions on the attacker — "can't be blocked by":
 *   Color:   "… by white/blue/black/red/green creatures"  → blocker must lack that color
 *   Keyword: "… by creatures with flying/horsemanship"    → blocker must lack that keyword
 *   Power:   "… by creatures with power N or less/greater" → blocker power restriction
 *   Subtype: "… by <Subtype>s" / "… by creature tokens"  → blocker type restriction
 * Each restriction is SELF-ONLY ("this creature" / card-name normalized) and unconditional (no
 * "as long as", "until end of turn", "if" riders). parseAttackerRestrictions() returns an array
 * of restriction objects; canBlockAttacker() short-circuits on the first match. Compound "A or B"
 * restrictions (e.g., "can't be blocked by knights or walls") are not parsed — all-or-nothing
 * (safe false-negative). Team grants and set-level "more than one creature" are also excluded here.
 */
import { permanentHasKeyword, permanentColors, permanentTypes, permanentProtectionColors } from "./layers.js";
import { findPermanent, creaturePower } from "./gameState.js";

// ── EVASION-QUALIFIER constants ──
// Color words → WUBRG letters (for "can't be blocked by white creatures").
const BLOCKER_COLOR_WORDS = { white: "W", blue: "U", black: "B", red: "R", green: "G" };

// Keywords recognized in "can't be blocked by creatures with [keyword]". Allowlist only;
// a novel keyword that requires complex checking stays a safe false-negative.
const BLOCKER_KEYWORD_WORDS = new Set(["flying", "horsemanship"]);

// Creature-type WORDS that appear in "can't be blocked by [Subtype]s" (lowercase, singular or
// irregular plural) → the REAL MTG creature subtype to test against the blocker. NOT exhaustive —
// the parser de-pluralizes and checks these so an unlisted type stays body-only (safe FN). Listed =
// confirmed in corpus. Most map to themselves; "oxen" is the IRREGULAR plural of "Ox" (Ox Drover:
// "can't be blocked by Oxen" — the real subtype on the Ox token is "Ox", not "Oxen"), so it MUST map
// to "Ox" or the runtime branch is dead. "token" is special-cased ("creature tokens" = any token).
const BLOCKER_SUBTYPE_TO_TYPE = {
  wall: "Wall", human: "Human", dinosaur: "Dinosaur", saproling: "Saproling", ox: "Ox", oxen: "Ox",
};
const BLOCKER_SUBTYPE_TOKENS = new Set(Object.keys(BLOCKER_SUBTYPE_TO_TYPE));

// Basic-landwalk keyword → the land subtype that switches it on.
const BASIC_WALK = [
  ["Plainswalk", "Plains"],
  ["Islandwalk", "Island"],
  ["Swampwalk", "Swamp"],
  ["Mountainwalk", "Mountain"],
  ["Forestwalk", "Forest"],
];

function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Card oracle, reminder-stripped + lowercased, with the card's OWN name normalized to
// "this creature" so a self-clause printed with the card name ("Invisible Stalker can't be
// blocked.") reads identically to the templated "This creature can't be blocked." \b-anchored so
// a short name can't match inside another word.
function selfOracle(card) {
  let t = String(card?.oracle || "").replace(/\([^)]*\)/g, " ").toLowerCase().replace(/[’']/g, "'");
  const name = String(card?.name || "").toLowerCase().replace(/[’']/g, "'");
  if (name) t = t.replace(new RegExp(`\\b${escapeRegExp(name)}\\b`, "g"), "this creature");
  return t;
}

/**
 * Parse EVASION-QUALIFIER restrictions from a self-creature card (uses `selfOracle` — name
 * already normalized). Returns an array of restriction objects; empty array = no restrictions.
 * Each restriction:
 *   { kind:"color",   color:"W"|"U"|"B"|"R"|"G" }
 *   { kind:"keyword", keyword:"Flying"|"Horsemanship" }
 *   { kind:"power",   op:"le"|"ge", n:number }
 *   { kind:"subtype", subtype:"Wall"|… }
 *   { kind:"token" }  — "creature tokens"
 *
 * Safety contract: ONLY self-subject unconditional clauses — the subject must be "this creature"
 * (after name-normalization), the clause must not contain "as long as"/"if"/"until"/"except",
 * and compound "or" restrictions are rejected whole (safe FN).
 */
function parseAttackerRestrictions(card) {
  const oracle = selfOracle(card);
  const restrictions = [];
  // Match sentences/lines; "this creature can't be blocked by <qualifier>" at sentence boundary.
  // "it can't be blocked by …" is also normalized to "this creature" by selfOracle? No — selfOracle
  // replaces the CARD NAME with "this creature", not "it". Accept both.
  const RE_CLAUSE = /(?:^|[\n.;])\s*(this creature|it) can't be blocked by ([^.;\n]+?)(?:\.|$)/gi;
  let m;
  while ((m = RE_CLAUSE.exec(oracle)) !== null) {
    const raw = m[2].trim().toLowerCase().replace(/['']/g, "'");
    // Reject conditional qualifiers ("as long as …", "if …", "until …", "this turn").
    if (/\bas long as\b|\bif\b|\buntil\b|\bthis turn\b|\bexcept\b/.test(raw)) continue;

    // "creatures with [keyword]" — flying, horsemanship (no "or" in these phrases)
    const kwM = raw.match(/^creatures? with (\w+)$/);
    if (kwM && BLOCKER_KEYWORD_WORDS.has(kwM[1])) {
      restrictions.push({ kind: "keyword", keyword: kwM[1][0].toUpperCase() + kwM[1].slice(1) });
      continue;
    }

    // "creatures with power N or less/greater" — "or" here is part of the power-comparison
    // syntax, NOT a compound qualifier, so check BEFORE the generic "or" rejection below.
    const powLeM = raw.match(/^creatures? with power (\d+) or less$/);
    if (powLeM) { restrictions.push({ kind: "power", op: "le", n: parseInt(powLeM[1], 10) }); continue; }
    const powGeM = raw.match(/^creatures? with power (\d+) or greater$/);
    if (powGeM) { restrictions.push({ kind: "power", op: "ge", n: parseInt(powGeM[1], 10) }); continue; }
    // "creatures with greater power" — dynamic comparison (relative to attacker's power); skip (safe FN).

    // Reject compound "or" qualifiers ("knights or walls", "black and/or red") — can't model both.
    if (/\bor\b/.test(raw)) continue;

    // "creature tokens" (token creatures)
    if (/^creature tokens?$/.test(raw)) { restrictions.push({ kind: "token" }); continue; }

    // "[Color] creatures"
    const colM = raw.match(/^(\w+) creatures?$/);
    if (colM) {
      const code = BLOCKER_COLOR_WORDS[colM[1]];
      if (code) { restrictions.push({ kind: "color", color: code }); continue; }
      // "[Subtype] creatures" or "[Subtype]s" — de-pluralize, check known list
      const sub = colM[1];
      if (BLOCKER_SUBTYPE_TOKENS.has(sub)) {
        restrictions.push({ kind: "subtype", subtype: BLOCKER_SUBTYPE_TO_TYPE[sub] });
        continue;
      }
    }

    // Bare "[Subtype]s" (e.g., "Walls", "Dinosaurs")
    const subtypeM = raw.match(/^(\w+)s?$/) || raw.match(/^(\w+)$/);
    if (subtypeM) {
      const singular = subtypeM[1].replace(/ves$/, "f").replace(/ies$/, "y").replace(/s$/, "");
      if (BLOCKER_SUBTYPE_TOKENS.has(singular)) {
        restrictions.push({ kind: "subtype", subtype: BLOCKER_SUBTYPE_TO_TYPE[singular] });
        continue;
      }
    }
    // Anything else — skip (safe FN, the card stays body-only if the restriction can't be modeled)
  }
  return restrictions;
}

// A clause asserted of the creature ITSELF (subject "this creature"/"it"), at a sentence
// boundary, ending exactly at the clause — so a trailing qualifier and team grants ("creatures you
// control can't be blocked") never match.
const reBareUnblockable = /(?:^|[\n.;])\s*(?:this creature|it) can't be blocked\s*(?:\.|$)/;
const reCantBlock = /(?:^|[\n.;])\s*(?:this creature|it) can't block\s*(?:\.|$)/;
const reBlockOnlyFlying = /(?:^|[\n.;])\s*(?:this creature|it) can block only creatures with flying\s*(?:\.|$)/;

export function isSelfUnblockable(card) { return reBareUnblockable.test(selfOracle(card)); }
export function isSelfCantBlock(card) { return reCantBlock.test(selfOracle(card)); }
export function isCanBlockOnlyFlyers(card) { return reBlockOnlyFlying.test(selfOracle(card)); }

// ── Classifier helper (coverage.isKeywordOnly): does ONE normalized keyword-only clause read as
// an evasion form THIS file enforces? The clause arrives already lowercased, reminder-stripped, and
// name-normalized to "this creature". The keyword-WORD forms (menace/skulk/fear/intimidate/
// horsemanship) are matched by COVERED_KEYWORDS itself; this only adds the basic-landwalk words and
// the text-clause forms (including EVASION-QUALIFIER shapes), so a keyword-only body carrying them
// is honestly native.
const reLandwalkWord = /^(?:plains|island|swamp|mountain|forest)walk$/;

// EVASION-QUALIFIER: "can't be blocked by" clause shapes the engine now enforces.
// Matches: "this creature can't be blocked by [color] creatures", "… by creatures with [keyword]",
// "… by creatures with power N or less/greater", "… by [Subtype]s/creature tokens".
// Does NOT match bare "can't be blocked" (caught above), compound "or" forms, or conditional riders.
const COLOR_WORDS_RE = Object.keys(BLOCKER_COLOR_WORDS).join("|");
const reEvasionQualifier = new RegExp(
  "^(?:this creature|it) can't be blocked by " +
  "(?:" +
    // color: "white/blue/… creatures"
    `(?:${COLOR_WORDS_RE}) creatures?` +
    // keyword: "creatures with flying/horsemanship"
    `|creatures? with (?:${[...BLOCKER_KEYWORD_WORDS].join("|")})` +
    // power: "creatures with power N or less/greater"
    "|creatures? with power \\d+ or (?:less|greater)" +
    // token: "creature tokens"
    "|creature tokens?" +
    // subtype: "Walls/Dinosaurs/…" (bare plural/singular)
    `|(?:${[...BLOCKER_SUBTYPE_TOKENS].join("|")})s?` +
  ")$"
);

export function isEnforcedEvasionClause(clause) {
  const c = String(clause || "").trim();
  if (reLandwalkWord.test(c)) return true;
  if (/^(?:this creature |it )?can't be blocked$/.test(c)) return true;
  if (/^(?:this creature |it )?can't block$/.test(c)) return true;
  if (/^(?:this creature |it )?can block only creatures with flying$/.test(c)) return true;
  if (reEvasionQualifier.test(c)) return true;
  return false;
}

// ── Runtime helpers (layer-aware) ──
function isArtifactPerm(state, id) {
  return (permanentTypes(state, id)?.types || []).some((t) => String(t).toLowerCase() === "artifact");
}
function permColorSet(state, id) {
  return new Set((permanentColors(state, id) || []).map((c) => String(c).toUpperCase()));
}
function defenderControlsLandType(state, defenderId, subtype) {
  const bf = state.players?.[defenderId]?.battlefield || [];
  const re = new RegExp(`\\b${subtype}\\b`, "i");
  return bf.some((p) => re.test(String(p?.card?.type || p?.card?.type_line || "")));
}

/**
 * May `blocker` legally block `attacker`, where `defenderId` is the blocking player (the defending
 * player whose lands gate landwalk, CR 509.1b)? PAIRWISE only — menace's ≥2 rule is a SET
 * constraint handled at resolution. Permissive on a missing permanent (never wedges resolution).
 */
export function canBlockAttacker(state, blockerId, attackerId, defenderId) {
  const aLook = findPermanent(state, attackerId);
  const bLook = findPermanent(state, blockerId);
  if (!aLook?.permanent || !bLook?.permanent) return true;
  const aCard = aLook.permanent.card;
  const bCard = bLook.permanent.card;

  // Blocker-side restrictions.
  if (isSelfCantBlock(bCard)) return false;
  // CANT-BLOCK — a GRANTED "can't block this turn" (Goblin Shortcutter / Crossway Vampire's targeted
  // trigger → a layer-6 endOfTurn "cantBlock" keyword). Layer-aware via permanentHasKeyword, so it tracks
  // the temporary grant exactly like the printed restriction above and wears off at cleanup (CR 514.2).
  if (permanentHasKeyword(state, blockerId, "cantBlock")) return false;
  // "Can block only creatures with flying" is a RESTRICTION (this creature can't block non-flyers),
  // NOT a grant of reach: to actually block a FLYING attacker the blocker still needs flying/reach
  // (CR 702.9b, enforced below). So a non-flying/non-reach "can block only flyers" creature can block
  // nothing — correct, and every real such card (Cloud Elemental, …) carries flying. Do NOT "fix" this
  // to let it block a flier without flying/reach; that would permit an ILLEGAL block (a wrong play).
  if (isCanBlockOnlyFlyers(bCard) && !permanentHasKeyword(state, attackerId, "Flying")) return false;

  // Unblockable — the attacker's own "can't be blocked" OR a GRANTED unblockable (Herald of Secret
  // Streams: "each creature you control with a +1/+1 counter can't be blocked" → a layer-6 grant, read
  // layer-aware so it tracks the +1/+1 counter dynamically).
  if (isSelfUnblockable(aCard) || permanentHasKeyword(state, attackerId, "unblockable")) return false;

  // Basic landwalk — gated by the DEFENDING player's lands (per-defender → 4P-correct).
  for (const [walk, subtype] of BASIC_WALK) {
    if (permanentHasKeyword(state, attackerId, walk) && defenderControlsLandType(state, defenderId, subtype)) {
      return false;
    }
  }

  // Flying — blockable only by flying/reach (CR 702.9b).
  if (permanentHasKeyword(state, attackerId, "Flying")) {
    if (!(permanentHasKeyword(state, blockerId, "Flying") || permanentHasKeyword(state, blockerId, "Reach"))) {
      return false;
    }
  }

  // Horsemanship — blockable only by horsemanship (CR 702.31b).
  if (permanentHasKeyword(state, attackerId, "Horsemanship") && !permanentHasKeyword(state, blockerId, "Horsemanship")) {
    return false;
  }

  // Shadow — SYMMETRIC mutual exclusion (CR 702.28b): a creature with shadow can't be blocked by a
  // creature without shadow, AND a creature without shadow can't be blocked by one with shadow. So a
  // legal block requires both sides to MATCH on shadow (a shadow attacker needs a shadow blocker; a
  // normal attacker can't be blocked by a shadow creature). Layer-aware so a granted/removed shadow counts.
  if (permanentHasKeyword(state, attackerId, "Shadow") !== permanentHasKeyword(state, blockerId, "Shadow")) {
    return false;
  }

  // Protection from a color (CR 702.16f): an ATTACKING creature with protection from a color can't be
  // blocked by a creature of that color. Layer-aware on BOTH sides: the attacker's protection (printed OR
  // granted by an attached Equipment/Aura) AND the blocker's colors (a granted/removed color counts).
  const attProtColors = permanentProtectionColors(state, attackerId);
  if (attProtColors.size > 0) {
    for (const c of permColorSet(state, blockerId)) {
      if (attProtColors.has(c)) return false;
    }
  }

  // Skulk — not blockable by a creature with greater power (CR 702.118b).
  if (permanentHasKeyword(state, attackerId, "Skulk")) {
    if (creaturePower(bLook.permanent, state) > creaturePower(aLook.permanent, state)) return false;
  }

  // Fear — blockable only by artifact and/or black creatures (CR 702.36b).
  if (permanentHasKeyword(state, attackerId, "Fear")) {
    if (!(isArtifactPerm(state, blockerId) || permColorSet(state, blockerId).has("B"))) return false;
  }

  // Intimidate — blockable only by artifact and/or creatures sharing a color with it (CR 702.13b).
  if (permanentHasKeyword(state, attackerId, "Intimidate")) {
    const shares = [...permColorSet(state, attackerId)].some((c) => permColorSet(state, blockerId).has(c));
    if (!(isArtifactPerm(state, blockerId) || shares)) return false;
  }

  // EVASION-QUALIFIER — parsed "can't be blocked by [qualifier]" text restrictions (CR 509.1b;
  // these are static abilities that restrict which creatures may block, applied as blockers are
  // declared). Restrictions parsed once per attacker card; the restriction list is order-independent.
  const restrictions = parseAttackerRestrictions(aCard);
  if (restrictions.length > 0) {
    const bColors = permColorSet(state, blockerId);
    const bTypes = permanentTypes(state, blockerId);
    const bSubtypes = new Set((bTypes?.subtypes || []).map((s) => String(s).toLowerCase()));
    // A token is flagged on the CARD (`card.token`, set by every token minter — tokens.js / amass.js
    // / resolvers.js). NOT a permanent-level `isToken` field (which the engine never sets).
    const bIsToken = bLook.permanent?.card?.token === true;
    const bPow = creaturePower(bLook.permanent, state);

    for (const r of restrictions) {
      if (r.kind === "color" && bColors.has(r.color)) return false;
      if (r.kind === "keyword" && permanentHasKeyword(state, blockerId, r.keyword)) return false;
      if (r.kind === "power") {
        if (r.op === "le" && bPow <= r.n) return false;
        if (r.op === "ge" && bPow >= r.n) return false;
      }
      if (r.kind === "token" && bIsToken) return false;
      if (r.kind === "subtype" && bSubtypes.has(r.subtype.toLowerCase())) return false;
    }
  }

  return true;
}

/** Does the attacker have menace (the ≥2-blocker rule, enforced at resolution)? Layer-aware. */
export function attackerHasMenace(state, attackerId) {
  return permanentHasKeyword(state, attackerId, "Menace");
}

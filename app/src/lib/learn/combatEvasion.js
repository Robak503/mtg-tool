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
import { hasKeyword } from "./keywords.js";
import { parseGroupBlockRestriction, attachedPreventionOf } from "./staticAbilityParser.js";

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
  // LEGENDARY SHORT NAME: a comma-carrying legend self-references by its pre-comma short name ("Huang
  // Zhong can't be blocked by more than one creature" on "Huang Zhong, Shu General") — normalize that
  // form too, mirroring coverage.isKeywordOnly. THIS is the single evasion-enforcement chokepoint
  // (legalChoices' block gates read it), so recognition and enforcement flip together — a skeptic pass
  // caught the classifier crediting short-name evasion clauses this function never enforced.
  const shortName = name.split(",")[0].trim();
  if (shortName && shortName !== name) t = t.replace(new RegExp(`\\b${escapeRegExp(shortName)}\\b`, "g"), "this creature");
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

// ── GROUP-EVASION (Shifting Sliver / Serpent of Yawning Depths) ──
// "Slivers can't be blocked except by Slivers." — a static (every creature of the named subtype) that lets a
// creature of that subtype be blocked ONLY by another creature of that subtype. The modeled shape is the
// SYMMETRIC TRIBAL "only X can block X" lord pattern: the attacker-side subtype SET and the allowed-blocker
// subtype SET are IDENTICAL. Two forms flip:
//   • single-subtype, board-wide (Shifting Sliver): "Slivers can't be blocked except by Slivers."
//   • multi-subtype + "you control" scope (Serpent of Yawning Depths): "Krakens, Leviathans, Octopuses, and
//     Serpents you control can't be blocked except by Krakens, Leviathans, Octopuses, and Serpents." — the
//     restriction applies only to those-subtype attackers the STATIC'S CONTROLLER controls, and they may be
//     blocked by any creature of any of those subtypes (blocker side has no controller scope). CR 509.1b.
// An ASYMMETRIC "except by <different subtype>", an "N or more creatures", "legendary creatures", or a
// conditional variant is NOT this shape → null (safe FN, the card stays body-only).
//
// The parse (regex + de-pluralization + the symmetric-set check) is the SINGLE SOURCE OF TRUTH in
// staticAbilityParser.parseGroupBlockRestriction — the SAME function the classifier's `blockRestriction`
// static marker reads — so the metric and this runtime enforcement can never drift. groupBlockRestrictionOf
// here just adapts a battlefield permanent (`.card`) to that pure text parser.
export function groupBlockRestrictionOf(card) {
  return parseGroupBlockRestriction(String(card?.oracle || card?.oracle_text || ""), card?.name);
}

/**
 * Back-compat: the single-subtype form (Shifting Sliver). Returns the lone canonical subtype when the card
 * carries a SYMMETRIC, board-wide ("any" controller), SINGLE-subtype restriction, else null. A multi-subtype
 * or "you control"-scoped form returns null here (use groupBlockRestrictionOf) — preserving every existing
 * caller's single-subtype contract.
 */
export function blockableOnlyBySubtypeOf(card) {
  const r = groupBlockRestrictionOf(card);
  if (r && r.controllerScope === "any" && r.subtypes.length === 1) return r.subtypes[0];
  return null;
}

/**
 * Layer-aware "is this permanent of creature subtype `subtype`?" for GROUP-EVASION. True when the
 * permanent's effective (layer-4) subtypes include it OR the card has CHANGELING (CR 702.73a — a
 * changeling is EVERY creature type, so it counts as a Sliver for "blocked only by Slivers"). The
 * changeling clause prevents a CREED false negative (disallowing a legal block by a changeling, a wrong
 * play). `subtype` is the Capitalized canonical form; the compare is case-insensitive.
 */
function permIsSubtype(state, permId, subtype) {
  const want = String(subtype).toLowerCase();
  const subs = (permanentTypes(state, permId)?.subtypes || []).map((s) => String(s).toLowerCase());
  if (subs.includes(want)) return true;
  const lk = findPermanent(state, permId);
  return !!lk?.permanent?.card && hasKeyword(lk.permanent.card, "changeling");
}

// A clause asserted of the creature ITSELF (subject "this creature"/"it"), at a sentence
// boundary, ending exactly at the clause — so a trailing qualifier and team grants ("creatures you
// control can't be blocked") never match.
const reBareUnblockable = /(?:^|[\n.;])\s*(?:this creature|it) can't be blocked\s*(?:\.|$)/;
const reCantBlock = /(?:^|[\n.;])\s*(?:this creature|it) can't block\s*(?:\.|$)/;
const reBlockOnlyFlying = /(?:^|[\n.;])\s*(?:this creature|it) can block only creatures with flying\s*(?:\.|$)/;
// BLOCK-COUNT CAP (CR 509.1c — the menace-INVERSE) — "This creature can't be blocked by more than one creature."
// A SET-level restriction on how MANY creatures may block this attacker (at most one), the mirror of menace's ≥2.
// Enforced at block DECLARATION (legalChoices.legalBlockerActions): once this attacker already has one blocker,
// no further blocker is offered on it. Self-subject, unconditional, bare (END at "creature"); a conditional /
// higher-cap ("by more than two") variant is NOT this shape → no match → body-only (safe FN). Corpus: Hungering
// Hydra. Anchored at a sentence boundary so a team-grant ("creatures you control can't be blocked by more than
// one creature") never matches (the subject must be "this creature"/"it" after name-normalization).
const reBlockedByAtMostOne = /(?:^|[\n.;])\s*(?:this creature|it) can't be blocked by more than one creature\s*(?:\.|$)/;

// RAD-CONDITIONAL UNBLOCKABLE (CR 509.1b + CR 728) — "This creature can't be blocked as long as defending
// player has a rad counter." A self-subject conditional evasion static whose condition reads the DEFENDING
// player's rad-counter total LIVE (enforced in canBlockAttacker against state.players[defenderId].radCounters),
// so it switches on/off exactly as the defender's rad counters come and go. Corpus-UNIQUE to Nightkin Ambusher
// (a single-card shape, verified by a full-corpus sweep), so this is a targeted, anchored matcher — never a
// generic conditional-unblockable parser (every OTHER "as long as …" rider stays a SAFE false-negative,
// rejected by parseAttackerRestrictions' conditional guard). The clause prints "a rad counter" = the 1+ test.
const reRadConditionalUnblockable = /(?:^|[\n.;])\s*(?:this creature|it) can't be blocked as long as defending player has a rad counter\s*(?:\.|$)/;
// TYPE-CONDITIONAL UNBLOCKABLE (BLITZ AB-1 — Neurok Spy / Bouncing Beebles / Scrapdiver Serpent
// "…controls an artifact"; Bubbling Beebles "…an enchantment"; Hazy Homunculus "…an untapped land"):
// the SAME per-defender conditional-evasion shape as the rad gate, keyed on the defending player's board
// (live at block-legality time, so it switches on/off exactly like landwalk). Only the three exact
// printed conditions; any other "as long as …" rider stays a SAFE FN.
const reTypeConditionalUnblockable = /(?:^|[\n.;])\s*(?:this creature|it) can't be blocked as long as defending player controls an? (artifact|enchantment|untapped land)\s*(?:\.|$)/;

// ISLANDHOME (BLITZ SM-1 — the sea-monster attack restriction, CR 508.1a): "This creature can't attack
// unless defending player controls an Island." (+ the Swamp/Forest/etc. and "snow land" siblings). A
// self-subject, unconditional PER-DEFENDER attack-legality gate: legalChoices.actionsDeclareAttacker only
// offers attack targets whose defending player controls the named land type (the same live board read
// landwalk uses — defenderControlsLandType). The TWO-line old frame ("When you control no Islands,
// sacrifice …") is NOT this shape — its second sentence is a separate, unmodeled state trigger, so those
// cards stay body-only (a safe FN). Anchored at a sentence boundary; a qualifier tail fails the match.
const reAttackNeedsDefenderLand = /(?:^|[\n.;])\s*(?:this creature|it) can't attack unless defending player controls an? (island|swamp|mountain|forest|plains|snow land)\s*(?:\.|$)/i;
// SELF DAMAGE-PREVENTION statics (BLITZ FOG-1, CR 615 — Guard Gomazoa / Everdawn Champion "Prevent all
// combat damage that would be dealt to this creature."; Dawn Elemental / Glittering Lion "Prevent all
// damage that would be dealt to this creature."): a printed, unconditional, self-scoped prevention wall.
// "all" blocks BOTH damage paths; "combat" blocks only combat damage (a Bolt still lands on Gomazoa).
// Anchored at sentence boundaries; a conditional / cost-bearing variant ("unless", "{1}: …") never matches
// → residue → body-only (safe FN). Consulted at the combat funnel + applyDamageEffect's creature hit.
const reSelfPreventAllDmg = /(?:^|[\n.;])\s*prevent all damage that would be dealt to (?:this creature|it)\s*(?:\.|$)/i;
const reSelfPreventCombatDmg = /(?:^|[\n.;])\s*prevent all combat damage that would be dealt to (?:this creature|it)\s*(?:\.|$)/i;
/** "all" | "combat" | null — the printed self damage-prevention wall on this card. */
export function selfDamagePrevention(card) {
  const o = selfOracle(card);
  if (reSelfPreventAllDmg.test(o)) return "all";
  if (reSelfPreventCombatDmg.test(o)) return "combat";
  return null;
}

// ATTACHED DAMAGE-PREVENTION (BLITZ AP-1, CR 615 — the Gaseous Form / Defang class). The per-card
// reader (attachedPreventionOf) lives in staticAbilityParser — the aura NATIVE gate (isNativeAura,
// which the CAST paths consult directly) must see the same read, and this module already imports from
// there (cycle-free). Here: the per-PERMANENT aggregation the damage paths consult.
/** Aggregate the walls across a permanent's ATTACHMENTS: { to, by } with "all" dominating "combat". */
export function attachedDamagePrevention(state, permId) {
  const lk = findPermanent(state, permId);
  if (!lk?.permanent?.attachments?.length) return { to: null, by: null };
  let to = null, by = null;
  const stronger = (a, b) => (a === "all" || b === "all") ? "all" : (a || b);
  for (const attId of lk.permanent.attachments) {
    const att = findPermanent(state, attId);
    if (!att?.permanent?.card) continue;
    const p = attachedPreventionOf(att.permanent.card);
    if (p.to) to = stronger(to, p.to);
    if (p.by) by = stronger(by, p.by);
  }
  return { to, by };
}

/** ISLANDHOME (SM-1) — the land type the DEFENDING player must control for this creature to attack them
 * ("island" / "swamp" / … / "snow land"), or null when unrestricted. Read off the card (printed static). */
export function attackDefenderLandRequirement(card) {
  const m = selfOracle(card).match(reAttackNeedsDefenderLand);
  return m ? m[1].toLowerCase() : null;
}
/** CANT-ALONE (BLITZ SM-2, CR 508.1h/509.1a — Mogg Flunkies / Loyal Pegasus / Jackal Familiar): "This
 * creature/token can't attack or block alone." Enforced at BOTH declaration gates in legalChoices: the
 * creature is offered as an attacker/blocker only once ANOTHER attacker/blocker is already declared this
 * combat (declaration is sequential in this engine, so the gate is exact-conservative — a lone Flunkies is
 * simply never offerable). The "token" wording covers granted text on created tokens (Toby's Beast). */
const reCantAlone = /(?:^|[\n.;])\s*this (?:creature|token) can't attack or block alone\s*(?:\.|$)/i;
export function cantAttackOrBlockAlone(card) {
  return reCantAlone.test(selfOracle(card));
}
/** CANT-ATTACK-ALONE (BLITZ CB-1, CR 508.1h — Raging Kronch / Bonded Construct / Trusty Companion): the
 * ATTACK-ONLY restriction "This creature can't attack alone." It forbids a lone ATTACK only (blocking is
 * unrestricted), so it routes through the attack-declaration gate ONLY (legalChoices.actionsDeclareAttacker):
 * the creature is offered as an attacker only once ANOTHER attacker is already declared — the SAME
 * sequential-declaration mechanism SM-2 built, just wired to one gate. The regex also matches the combined
 * "can't attack or block alone" form (which likewise forbids a lone attack), so Mogg Flunkies' attack gate is
 * still enforced through this reader. The "token" wording covers granted text on created tokens. */
const reCantAttackAlone = /(?:^|[\n.;])\s*this (?:creature|token) can't attack (?:or block )?alone\s*(?:\.|$)/i;
export function cantAttackAlone(card) {
  return reCantAttackAlone.test(selfOracle(card));
}
/** CANT-BLOCK-ALONE (BLITZ CB-1, CR 509.1a — Craven Hulk): the mirror BLOCK-ONLY restriction "This creature
 * can't block alone." It forbids a lone BLOCK only (attacking is unrestricted), so it routes through the
 * block-declaration gate ONLY (legalChoices.actionsDeclareBlocker): offered as a blocker only once ANOTHER
 * blocker is already declared this combat. The regex also matches the combined "can't attack or block alone"
 * form (which likewise forbids a lone block), so Mogg Flunkies' block gate is still enforced through here. */
const reCantBlockAlone = /(?:^|[\n.;])\s*this (?:creature|token) can't (?:attack or )?block alone\s*(?:\.|$)/i;
export function cantBlockAlone(card) {
  return reCantBlockAlone.test(selfOracle(card));
}
/** ASSIGN-AS-UNBLOCKED (BLITZ TE-1, CR 508.1h — Thorn Elemental / Pride of Lions / Wolf Pack / Lone Wolf):
 * "You may have this creature assign its combat damage as though it weren't blocked." Enforced in
 * combatResolution: a blocked attacker with this line assigns its FULL power to the defending player
 * (the deterministic take of the printed MAY — always legal, and the entire point of the card); its
 * blockers still deal back normally. */
const reAssignUnblocked = /(?:^|[\n.;])\s*you may have this creature assign its combat damage as though it weren't blocked\s*(?:\.|$)/i;
export function mayAssignAsUnblocked(card) {
  return reAssignUnblocked.test(selfOracle(card));
}
/** Does `defenderId` control a land of the required type? (The exported face of the landwalk board read —
 * "snow land" matches the adjacent type-line words "Snow Land".) */
export function defenderMeetsAttackLandRequirement(state, defenderId, requirement) {
  if (!requirement) return true;
  return defenderControlsLandType(state, defenderId, requirement);
}

export function isSelfUnblockable(card) { return reBareUnblockable.test(selfOracle(card)); }
export function isSelfCantBlock(card) { return reCantBlock.test(selfOracle(card)); }
export function isCanBlockOnlyFlyers(card) { return reBlockOnlyFlying.test(selfOracle(card)); }
/** BLOCK-COUNT CAP (CR 509.1c) — this attacker "can't be blocked by more than one creature" (menace-inverse). */
export function isBlockedByAtMostOne(card) { return reBlockedByAtMostOne.test(selfOracle(card)); }
/** Nightkin Ambusher — unblockable while the DEFENDING player has ≥1 rad counter (corpus-unique). */
export function isRadConditionalUnblockable(card) { return reRadConditionalUnblockable.test(selfOracle(card)); }
/** AB-1 — the defender-board type condition ("artifact" | "enchantment" | "untapped land") or null. */
export function typeConditionalUnblockableOf(card) {
  const m = selfOracle(card).match(reTypeConditionalUnblockable);
  return m ? m[1].toLowerCase() : null;
}

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
  // BLOCK-COUNT CAP (CR 509.1c — menace-inverse) — "can't be blocked by more than one creature". Enforced in
  // legalChoices.legalBlockerActions (a 2nd blocker on this attacker is never offered), so a body whose only
  // non-keyword text is this static is honestly native.
  if (/^(?:this creature |it )?can't be blocked by more than one creature$/.test(c)) return true;
  if (reEvasionQualifier.test(c)) return true;
  // RAD-CONDITIONAL UNBLOCKABLE (Nightkin Ambusher) — credited here so a body whose only non-keyword text is
  // this conditional evasion static is honestly native; canBlockAttacker enforces the rad-counter condition.
  if (/^(?:this creature |it )?can't be blocked as long as defending player has a rad counter$/.test(c)) return true;
  // AB-1 — the defender-board type conditions (Neurok Spy / Bubbling Beebles / Hazy Homunculus): enforced
  // live in canBlockAttacker, so a body whose only non-keyword text is this static is honestly native.
  if (/^(?:this creature |it )?can't be blocked as long as defending player controls an? (?:artifact|enchantment|untapped land)$/.test(c)) return true;
  // ISLANDHOME (BLITZ SM-1) — "can't attack unless defending player controls an Island/…/snow land" is
  // enforced per-defender at attack declaration (actionsDeclareAttacker filters the target list through
  // defenderMeetsAttackLandRequirement), so a body whose only non-keyword text is this static is honestly
  // native. The two-line "When you control no Islands, sacrifice …" frame never reaches here whole.
  if (/^(?:this creature |it )?can't attack unless defending player controls an? (?:island|swamp|mountain|forest|plains|snow land)$/.test(c)) return true;
  // CANT-ALONE (BLITZ SM-2 + CB-1) — "can't attack alone" / "can't block alone" / "can't attack or block
  // alone" are enforced at the attack and/or block declaration gate(s) (legalChoices offers the creature
  // only once another attacker/blocker is declared this combat — cantAttackAlone gates the attack side,
  // cantBlockAlone the block side), so a body whose only non-keyword text is one of these statics is honestly
  // native (Raging Kronch / Bonded Construct / Craven Hulk / Mogg Flunkies / Loyal Pegasus class).
  if (/^(?:this (?:creature|token) |it )?can't (?:attack alone|block alone|attack or block alone)$/.test(c)) return true;
  // ASSIGN-AS-UNBLOCKED (BLITZ TE-1) — enforced in combatResolution (the blocked attacker assigns its
  // full power to the defending player), so a Thorn Elemental body is honestly native.
  if (/^you may have this creature assign its combat damage as though it weren't blocked$/.test(c)) return true;
  // GROUP-EVASION (Shifting Sliver): "<subtype>s can't be blocked except by <same subtype>s" — enforced
  // in canBlockAttacker. Credit only the SYMMETRIC tribal form (parseGroupBlockRestriction returns non-null).
  // The single-subtype board-wide clause arrives here WHOLE (no comma → isKeywordOnly's splitter leaves it
  // intact); a multi-subtype list (Serpent) is shredded on commas by that splitter and never reaches here —
  // it flips via the native-static `blockRestriction` marker instead, so this route stays single-subtype.
  if (parseGroupBlockRestriction(c)) return true;
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
  // DEFENDER-IDENTITY GATE (CR 509.1a) — a creature may block only an attacker "attacking THAT player"
  // (or a planeswalker/battle they control — the entry's `defender` is that permanent's controller, so
  // the same identity check covers all three). In a 4-seat pod, seat C's creatures must never block an
  // attacker aimed at seat D. Enforced ONLY when the attacker has a declared combat entry: the attack-
  // planning model (opponentAI.eligibleBlockersFor) probes hypothetical not-yet-declared attacks, where
  // there is no entry and defenderId already IS the seat being evaluated.
  const combatEntry = (state.combat?.attackers || []).find((a) => a.permanentId === attackerId);
  if (combatEntry && combatEntry.defender !== defenderId) return false;
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

  // RAD-CONDITIONAL UNBLOCKABLE (Nightkin Ambusher, CR 728) — unblockable WHILE the DEFENDING player has
  // ≥1 rad counter. Read LIVE from the defender's current rad total (per-defender → 4P-correct, mirrors the
  // basic-landwalk per-defender gate above), so it correctly turns OFF the moment the defender's rad counters
  // are gone (e.g. milled away by their radiation ability) and never blocks for the wrong opponent in a pod.
  if (isRadConditionalUnblockable(aCard) && (state.players?.[defenderId]?.radCounters || 0) > 0) return false;
  // AB-1 — the defender-board type condition (Neurok Spy class): unblockable while the DEFENDING player
  // controls a permanent of the named kind, read live per block-legality query (the landwalk discipline).
  {
    const cond = typeConditionalUnblockableOf(aCard);
    if (cond) {
      const bf = state.players?.[defenderId]?.battlefield || [];
      const met = cond === "artifact" ? bf.some((p) => /\bArtifact\b/i.test(String(p.card?.type || p.card?.type_line || "")))
        : cond === "enchantment" ? bf.some((p) => /\bEnchantment\b/i.test(String(p.card?.type || p.card?.type_line || "")))
        : bf.some((p) => /\bLand\b/i.test(String(p.card?.type || p.card?.type_line || "")) && !p.tapped);
      if (met) return false;
    }
  }

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

  // GROUP-EVASION (Shifting Sliver / Serpent of Yawning Depths) — a "<subtypes> [you control] can't be
  // blocked except by <same subtypes>" static (CR 509.1b). Scan every battlefield permanent for the static;
  // if the ATTACKER is of one of the named subtypes S, the BLOCKER must ALSO be of one of those subtypes,
  // else the block is illegal. A "you control"-scoped static (Serpent) applies ONLY when the ATTACKER is
  // controlled by the static's controller (`pid`); an "any"-scoped static (Shifting Sliver) applies to every
  // controller's attacker. Layer-aware on both sides (permIsSubtype honors granted/removed subtypes +
  // changeling). Multiple distinct statics compose (each adds its own restriction). Permissive when no such
  // static is in play (the common case).
  const attackerController = aLook.controller;
  for (const pid of Object.keys(state.players || {})) {
    for (const perm of state.players[pid]?.battlefield || []) {
      const r = groupBlockRestrictionOf(perm?.card);
      if (!r) continue;
      if (r.controllerScope === "you" && attackerController !== pid) continue; // "…you control…" — only the source's own creatures
      const attackerIsNamed = r.subtypes.some((s) => permIsSubtype(state, attackerId, s));
      if (!attackerIsNamed) continue;
      const blockerIsNamed = r.subtypes.some((s) => permIsSubtype(state, blockerId, s));
      if (!blockerIsNamed) return false;
    }
  }

  return true;
}

/** Does the attacker have menace (the ≥2-blocker rule, enforced at resolution)? Layer-aware. */
export function attackerHasMenace(state, attackerId) {
  return permanentHasKeyword(state, attackerId, "Menace");
}

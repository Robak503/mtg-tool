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
 *
 * EVASION-EXCEPT (BLITZ EV-2, CR 509.1b) — the INVERSE shape "this creature can't be blocked EXCEPT by
 * <filter>" (a blocker is legal ONLY if it MATCHES the filter). parseAttackerExceptions() parses the vetted
 * filter families — flying keyword ("creatures with flying" / "creatures with flying or reach"), color
 * ("<color> creatures"), artifact ("artifact creatures"), and (BLITZ EV-3) blocker-SUBTYPE ("Rogues" /
 * "Spirits" / "Walls" — layer-aware via permIsSubtype, changeling included) — each reusing the exact gate the
 * rest of this file already trusts. A compound "A and/or B" filter (Amrou Seekers / Elven Riders, BLITZ EV-3)
 * is admitted as an OR-of-vetted-arms ONLY when EVERY arm maps to one of those gates; one unvetted arm rejects
 * the WHOLE clause. Same SELF-ONLY, unconditional contract; a legendary/defender/flavor-text filter stays
 * rejected → the card stays body-only (safe FN).
 *
 * SET-LEVEL ≥N (BLITZ EV-3, CR 509.1b — the menace family, 702.111b's "except by two or more" generalized):
 * "this creature can't be blocked except by <N> or more creatures" is a restriction on the SIZE of the block,
 * not a pairwise blocker gate, so it is deliberately NOT a parseAttackerExceptions filter. It's read by
 * minBlockerCountOf() and enforced at the SAME two seams menace uses: the declare-blockers offer gate
 * (legalChoices — no block offered unless ≥N eligible blockers exist) and the resolution normalize
 * (combatResolution — an attacker left with fewer than N blockers is treated as unblocked).
 * attackerMinBlockers() is the single aggregation point: max of menace's 2 (layer-aware), the printed ≥N, and
 * the Sonorous Howlbonder team static ("Each creature you control with menace can't be blocked except by
 * three or more creatures" — corpus-unique, the Nightkin Ambusher targeted-matcher precedent).
 */
import { permanentHasKeyword, permanentColors, permanentTypes, permanentProtectionColors, permanentProtectionClasses, permanentIsCreature } from "./layers.js";
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
    // "artifact creatures" (④-AV, 2026-09-04 — Argothian Sprite, Fen Hauler, Audacious Infiltrator, Clockwork Steed,
    // Basalt Golem, Argothian Pixies): the blocker's EFFECTIVE type line carries Artifact (isArtifactPerm — the same
    // layer-aware reader the except-by "artifact creatures" filter and the fear/intimidate gate trust).
    if (/^artifact creatures?$/.test(raw)) { restrictions.push({ kind: "artifact" }); continue; }

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

// ── EVASION-EXCEPT filter grammar (BLITZ EV-2 + EV-3, CR 509.1b) ──
// Blocker SUBTYPES admitted in "can't be blocked except by <Subtype>s" (BLITZ EV-3). Allowlist only —
// corpus-confirmed words (Deathcult Rogue "Rogues", Departed Deckhand "Spirits", Elven Riders / Evil Eye of
// Orms-by-Gore "Walls"); an unlisted subtype stays a safe FN. The blocker-side test is permIsSubtype — the
// SAME layer-aware (layer-4 effective subtypes + changeling, CR 702.73a) reader GROUP-EVASION already trusts.
const EXCEPT_SUBTYPE_TO_TYPE = {
  wall: "Wall", walls: "Wall", rogue: "Rogue", rogues: "Rogue", spirit: "Spirit", spirits: "Spirit",
};

// Number words for the SET-LEVEL "except by <N> or more creatures" family (CR 509.1b; menace's 702.111b is
// the N=2 member). Word forms only — that's how every corpus card prints it (three: Guile/Pathrazer/…; six:
// Hexmark Destroyer). Shared by the runtime readers AND the classifier mirror so the two can never drift.
const MIN_BLOCKER_COUNT_WORDS = { two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
const MIN_BLOCKER_WORD_ALT = Object.keys(MIN_BLOCKER_COUNT_WORDS).join("|");

/**
 * Parse ONE "can't be blocked except by …" filter text into an array of vetted pairwise arm objects, or null
 * when ANY part is unvetted (fail-closed → safe FN). This is the SINGLE SOURCE OF TRUTH for the except-by
 * filter grammar: parseAttackerExceptions (runtime) and isEnforcedEvasionClause (classifier mirror) both call
 * it, so recognition and enforcement flip together (the parseGroupBlockRestriction discipline).
 *   Arms: { kind:"keyword", keyword:"Flying" }        — "creatures with flying" (reach does NOT satisfy it)
 *         { kind:"flyingOrReach" }                    — "creatures with flying or reach" (the CR 702.9b idiom)
 *         { kind:"color", color:"W"|…|"G" }           — "<color> creatures"
 *         { kind:"artifact" }                         — "artifact creatures" (the fear/intimidate type gate)
 *         { kind:"subtype", subtype:"Rogue"|… }       — "<Subtype>s" (EXCEPT_SUBTYPE_TO_TYPE allowlist)
 * A COMPOUND "A and/or B [and/or C]" (BLITZ EV-3) splits into arms — the blocker is legal iff it matches AT
 * LEAST ONE (CR 509.1b: it satisfies the exception); ONE unvetted arm rejects the WHOLE filter. The set-level
 * "<N> or more creatures" (menace family) is NOT a pairwise filter — rejected here, read by minBlockerCountOf.
 */
export function parseExceptBlockerFilters(raw) {
  const text = String(raw || "").trim();
  // Set-level "<N> or more creatures" — a block-SIZE restriction, not a pairwise gate (attackerMinBlockers).
  if (/^\S+ or more creatures$/.test(text)) return null;
  const arms = [];
  for (const armRaw of text.split(/\s+and\/or\s+/)) {
    const arm = armRaw.trim();
    if (arm === "creatures with flying or reach") { arms.push({ kind: "flyingOrReach" }); continue; }
    if (arm === "creatures with flying") { arms.push({ kind: "keyword", keyword: "Flying" }); continue; }
    if (/^artifact creatures?$/.test(arm)) { arms.push({ kind: "artifact" }); continue; }
    const colM = arm.match(/^(white|blue|black|red|green) creatures?$/);
    if (colM) { arms.push({ kind: "color", color: BLOCKER_COLOR_WORDS[colM[1]] }); continue; }
    const subM = arm.match(/^([a-z]+)$/);
    if (subM && EXCEPT_SUBTYPE_TO_TYPE[subM[1]]) { arms.push({ kind: "subtype", subtype: EXCEPT_SUBTYPE_TO_TYPE[subM[1]] }); continue; }
    return null; // one unvetted arm (legendary / defender / power / flavor text / …) → the WHOLE filter fails closed
  }
  return arms.length > 0 ? arms : null;
}

/**
 * EVASION-EXCEPT (BLITZ EV-2 + EV-3, CR 509.1b) — parse a self-creature "this creature can't be blocked
 * EXCEPT by <filter>" evasion. The INVERSE of parseAttackerRestrictions: a blocker is legal ONLY if it
 * MATCHES the filter (a non-matching blocker can't block it). Returns an array of exception objects; a
 * compound filter arrives as { kind:"or", arms:[…] } (blocker must match ≥1 arm); empty array = none.
 *
 * Safety contract (mirrors parseAttackerRestrictions): SELF-subject only (the subject is "this creature"/"it"
 * after name-normalization — the board-wide tribal "Slivers can't be blocked except by Slivers" is NOT this
 * shape and stays with GROUP-EVASION; Deluxe Dragster's "This Vehicle …" subject also fails, so it parks),
 * unconditional (no "as long as"/"if"/"until"/"this turn" rider), and the whole filter grammar lives in
 * parseExceptBlockerFilters (fail-closed). The set-level "<N> or more creatures" (Guile, menace-family ≥N —
 * NOT pairwise) is rejected there and enforced at the menace seams via attackerMinBlockers.
 */
function parseAttackerExceptions(card) {
  const oracle = selfOracle(card);
  const exceptions = [];
  const RE_CLAUSE = /(?:^|[\n.;])\s*(?:this creature|it) can't be blocked except by ([^.;\n]+?)(?:\.|$)/gi;
  let m;
  while ((m = RE_CLAUSE.exec(oracle)) !== null) {
    const raw = m[1].trim().toLowerCase().replace(/['']/g, "'");
    // Conditional riders — a live-condition variant ("as long as …"/"if …"/"until …"/"this turn") → safe FN.
    if (/\bas long as\b|\bif\b|\buntil\b|\bthis turn\b/.test(raw)) continue;
    const arms = parseExceptBlockerFilters(raw);
    if (!arms) continue; // unvetted / set-level ≥N — safe FN here (≥N is enforced at the menace seams)
    exceptions.push(arms.length === 1 ? arms[0] : { kind: "or", arms });
  }
  return exceptions;
}

// ── SET-LEVEL MINIMUM BLOCK SIZE (BLITZ EV-3, CR 509.1b — the menace family, CR 702.111b generalized) ──
// "This creature can't be blocked except by <N> or more creatures." — a restriction on how MANY creatures the
// block must contain (Guile / Pathrazer of Ulamog / Rampaging Ceratops / … at N=3; Hexmark Destroyer's N=6
// hides behind an ability-word prefix and deliberately does NOT match — a safe FN, see the test pins). Bare,
// self-subject, unconditional; sentence-anchored so a rider or team grant never matches.
const reMinBlockerCount = new RegExp(
  `(?:^|[\\n.;])\\s*(?:this creature|it) can't be blocked except by (${MIN_BLOCKER_WORD_ALT}) or more creatures\\s*(?:\\.|$)`);
/** The printed set-level minimum block size (2..10) on this card, or null when none. */
export function minBlockerCountOf(card) {
  const m = selfOracle(card).match(reMinBlockerCount);
  return m ? MIN_BLOCKER_COUNT_WORDS[m[1]] : null;
}

// SONOROUS HOWLBONDER team static — "Each creature you control with menace can't be blocked except by three
// or more creatures." Corpus-UNIQUE (a full-corpus sweep 2026-07-17 found no sibling), so this is a targeted,
// anchored matcher — the Nightkin Ambusher precedent — never a generic team-grant parser. Read off the RAW
// oracle (the subject is the team, not the card itself, so no name normalization is wanted).
const reMenaceTeamMinBlockers = new RegExp(
  `(?:^|[\\n.;])\\s*each creature you control with menace can't be blocked except by (${MIN_BLOCKER_WORD_ALT}) or more creatures\\s*(?:\\.|$)`);
/** Howlbonder-static N (the min block size it imposes on the controller's menace creatures), or null. */
export function menaceTeamMinBlockersOf(card) {
  const o = String(card?.oracle || card?.oracle_text || "").replace(/\([^)]*\)/g, " ").toLowerCase().replace(/[’']/g, "'");
  const m = o.match(reMenaceTeamMinBlockers);
  return m ? MIN_BLOCKER_COUNT_WORDS[m[1]] : null;
}

/**
 * The SET-level minimum number of blockers a legal block on `attackerId` must contain (CR 509.1b): the MAX of
 * menace's 2 (CR 702.111b, layer-aware so a granted menace counts), the printed "except by <N> or more
 * creatures", and — when the attacker has menace — any Sonorous Howlbonder static its CONTROLLER controls
 * ("each creature YOU control with menace…"). 1 = unrestricted. Enforced at the SAME two seams menace always
 * used: the legalChoices offer gate (no block offered on it unless ≥N eligible blockers exist) and the
 * combatResolution normalize (an attacker left with 1..N-1 blockers resolves as unblocked). Restrictions
 * compose by CR 509.1b — every restriction must be obeyed, hence the max.
 */
export function attackerMinBlockers(state, attackerId) {
  const hasMenace = permanentHasKeyword(state, attackerId, "Menace");
  let n = hasMenace ? 2 : 1;
  const lk = findPermanent(state, attackerId);
  const printed = lk?.permanent?.card ? minBlockerCountOf(lk.permanent.card) : null;
  if (printed && printed > n) n = printed;
  if (hasMenace && lk?.controller) {
    for (const perm of state.players?.[lk.controller]?.battlefield || []) {
      const teamN = menaceTeamMinBlockersOf(perm?.card);
      if (teamN && teamN > n) n = teamN;
    }
  }
  return n;
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
// BLOCKER-SIDE POWER CAP (④-AV, 2026-09-04 — Ironclaw Orcs / Ironclaw Buzzardiers / Brassclaw Orcs "This creature can't
// block creatures with power 2 or greater"; Goblin Mutant / Orgg "… power 3 or greater"): the blocker refuses any attacker
// whose LIVE power (layer-aware, CR 613) meets the printed N. Fixed-N only — the relative form ("greater than this
// creature's power") is reSelfPowerCantBlock's, an attacker-side reader. Same self-subject anchoring as the line above.
const reBlockerMaxPower = /(?:^|[\n.;])\s*(?:this creature|it) can't block creatures with power (\d+) or greater\s*(?:\.|$)/;
// KW-UNLEASH (CR 702.86a, census slice 50) — "You may have this creature enter with a +1/+1 counter on it.
// It can't block as long as it has a +1/+1 counter on it."
//
// The keyword was REFUSED by the optional-mode family (slice 49) precisely because that second sentence is
// not an option — it is a conditional static, and crediting the keyword while ignoring it would let a
// creature block when the printed card forbids it. So it is enforced here instead of credited for free: a
// LIVE read of the permanent's counters at block declaration, which means it binds whether the counter came
// from unleash itself or from anywhere else (an anthem, a counter effect, another card's trigger) — the very
// case that made the free credit unsafe.
const reUnleash = /(?:^|[\n.;])\s*unleash\s*(?:\.|$)/;
/** Does this card print the unleash keyword? (Reminder text is stripped by selfOracle before matching.) */
export function hasUnleash(card) { return reUnleash.test(selfOracle(card)); }
// SELF-POWER BLOCK GATE (CR 509.1b, census slice 43) — "Creatures with power less than this creature's power
// can't block it." (Wandering Wolf class, 10 cards) and its printed inverse "…with power greater than…"
// (Silumgar Assassin). A DYNAMIC comparison against the attacker's own power, re-read live at block
// declaration — the same shape skulk (CR 702.118b) already uses, which is why this is a comparison and not a
// fixed-N filter (parseExceptBlockerFilters deliberately fails closed on "power" arms).
//
// Anchored to the SELF-SUBJECT, WHOLE-BOARD form ending at "it". The corpus siblings that must NOT match:
//   • "…can't block CREATURES YOU CONTROL"       (Champion of Lambholt — a team-wide grant, not self)
//   • "power less than the NUMBER OF ISLANDS…"   (Kraken of the Straits — a different dynamic quantity)
//   • "…with power less than OR EQUAL TO…"       (a different comparison; ≤ is not <)
// All three end up body-only → Arbiter, which is the safe direction.
const reSelfPowerCantBlock = /(?:^|[\n.;])\s*creatures with power (less|greater) than this creature's power can't block it\s*(?:\.|$)/;
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

// ISLANDHOME (BLITZ SM-1 — the sea-monster attack restriction, CR 508.1c): "This creature can't attack
// unless defending player controls an Island." (+ the Swamp/Forest/etc. and "snow land" siblings). A
// self-subject, unconditional PER-DEFENDER attack-legality gate: legalChoices.actionsDeclareAttacker only
// offers attack targets whose defending player meets the requirement (the same live board read landwalk
// uses). Since BLITZ CS-1 the parse lives in parseAttackDefenderRequirementClause below (the land arm),
// generalized to the Whimwader/monarch/poisoned defender predicates. The TWO-line old frame ("When you
// control no Islands, sacrifice …") is NOT this shape — its second sentence is a separate, unmodeled
// state trigger, so those cards stay body-only (a safe FN).
// SELF DAMAGE-PREVENTION statics (BLITZ FOG-1, CR 615 — Guard Gomazoa / Everdawn Champion "Prevent all
// combat damage that would be dealt to this creature."; Dawn Elemental / Glittering Lion "Prevent all
// damage that would be dealt to this creature."): a printed, unconditional, self-scoped prevention wall.
// "all" blocks BOTH damage paths; "combat" blocks only combat damage (a Bolt still lands on Gomazoa).
// Anchored at sentence boundaries; a conditional / cost-bearing variant ("unless", "{1}: …") never matches
// → residue → body-only (safe FN). Consulted at the combat funnel + applyDamageEffect's creature hit.
//
// BLITZ PV-1 (CR 615) extends the TO reader with Fog Bank's compound "to and dealt by this creature" form
// (its TO half) and adds a companion BY reader (selfDamagePreventionBy) for the DEALER direction — the
// "…dealt by this creature" half of Fog Bank ("Prevent all combat damage that would be dealt to and dealt
// by this creature."). selfOracle already normalizes the card NAME (and legendary short name) to "this
// creature", so the printed name form (Cho-Manno "…dealt to Cho-Manno.") reads through the same anchors.
// The `\s*(?:\.|$)` tail right after the subject is load-bearing: it PARKS the activated/triggered "…this
// turn" variants (Moonlight Geist "{3}{W}: Prevent all combat damage that would be dealt to and dealt by
// this creature this turn.", Goblin Snowman's block trigger) — "this creature" is followed by " this turn",
// never a terminator — and the leading `[\n.;]` anchor rejects the ": " / ", " lead-ins those forms carry.
const reSelfPreventAllDmg = /(?:^|[\n.;])\s*prevent all damage that would be dealt to (?:and dealt by )?(?:this creature|it)\s*(?:\.|$)/i;
const reSelfPreventCombatDmg = /(?:^|[\n.;])\s*prevent all combat damage that would be dealt to (?:and dealt by )?(?:this creature|it)\s*(?:\.|$)/i;
/** "all" | "combat" | null — the printed self damage-prevention wall (the TO direction) on this card. */
export function selfDamagePrevention(card) {
  const o = selfOracle(card);
  if (reSelfPreventAllDmg.test(o)) return "all";
  if (reSelfPreventCombatDmg.test(o)) return "combat";
  return null;
}

// ─── COUNTER-SHIELD prevention (CR 615) — the Phantom cycle + Bloatfly Swarm ────────────────────────────
// A prevention wall that PAYS FOR ITSELF out of +1/+1 counters, which is what separates it from the flat
// walls above: those prevent forever and cost nothing, these shed counters every time they fire.
//
// ⛔ THE TWO PRINTED FORMS ARE NOT THE SAME EFFECT AND MUST NOT SHARE A PREDICATE:
//
//  PHANTOM  "If damage would be dealt to this creature, prevent that damage. Remove a +1/+1 counter from
//           this creature."  (Phantom Nantuko / Tiger / Centaur / Wurm / Flock / Nomad)
//           → prevention is UNCONDITIONAL. At zero counters it STILL prevents — a Phantom with no counters
//             is damage-proof and simply has nothing left to shed. Removes exactly ONE counter per event.
//
//  BLOATFLY "If damage would be dealt to this creature WHILE IT HAS A +1/+1 COUNTER ON IT, prevent that
//           damage, remove that many +1/+1 counters from it, then give each player a rad counter for each
//           +1/+1 counter removed this way."  (Bloatfly Swarm)
//           → prevention is CONDITIONAL on holding a counter. At zero counters the damage GOES THROUGH and
//             the creature dies normally. Removes THAT MANY (= the damage amount, capped by what it has),
//             then hands out rad counters (CR 728, already modeled) equal to the number actually removed.
//
// Collapsing these into one "has a counter?" gate would make Phantoms killable at zero counters (wrong, and
// a false NEGATIVE) or Bloatfly immortal at zero counters (wrong, and a forbidden false POSITIVE).
//
// ⚠️ CREDITING THE PREVENTION WITHOUT THE COUNTER REMOVAL WOULD BE THE WORST FALSE POSITIVE THIS ENGINE CAN
// PRODUCE: a creature that prevents all damage forever and never pays. The removal is enforced at the deal
// sites (combatResolution's shieldConsumed pattern, and applyDamageEffect for noncombat), and the metric
// credits these cards ONLY because that enforcement exists — read counterShieldPrevention's callers before
// trusting the tier.
const reCounterShieldPhantom =
  /(?:^|[\n.;])\s*if damage would be dealt to (?:this creature|it), prevent that damage\.\s*remove a \+1\/\+1 counter from (?:this creature|it)\s*(?:\.|$)/i;
const reCounterShieldBloatfly =
  /(?:^|[\n.;])\s*if damage would be dealt to (?:this creature|it) while it has a \+1\/\+1 counter on it, prevent that damage, remove that many \+1\/\+1 counters from it, then give each player a rad counter for each \+1\/\+1 counter removed this way\s*(?:\.|$)/i;

/**
 * "phantom" | "bloatfly" | null — the printed counter-shield wall on this card.
 * See the block above for why the two modes are kept distinct; callers MUST branch on the value, never on
 * mere truthiness, because the zero-counter behaviour is opposite between them.
 */
export function counterShieldPrevention(card) {
  const o = selfOracle(card);
  if (reCounterShieldPhantom.test(o)) return "phantom";
  if (reCounterShieldBloatfly.test(o)) return "bloatfly";
  return null;
}

// BY direction (PV-1): the DEALER's own printed wall — Fog Bank deals no combat damage. Matches both the
// compound "…dealt to and dealt by this creature" (Fog Bank's BY half) and a bare "…dealt by this creature"
// self form. "combat" binds at the combat funnel only; "all" would additionally silence noncombat damage
// dealt by the source (no real card carries the bare "all" self-by shape today — a safe structural mirror
// of attachedDamagePrevention.by). Same anchors as the TO reader → the "…this turn" activated/triggered
// by-only forms (Ignoble Soldier, Mtenda Lion) never match → parked (safe FN).
const reSelfPreventAllDmgBy = /(?:^|[\n.;])\s*prevent all damage that would be dealt (?:to and dealt )?by (?:this creature|it)\s*(?:\.|$)/i;
const reSelfPreventCombatDmgBy = /(?:^|[\n.;])\s*prevent all combat damage that would be dealt (?:to and dealt )?by (?:this creature|it)\s*(?:\.|$)/i;
/** "all" | "combat" | null — the printed self damage-prevention wall (the BY / dealer direction) on this card. */
export function selfDamagePreventionBy(card) {
  const o = selfOracle(card);
  if (reSelfPreventAllDmgBy.test(o)) return "all";
  if (reSelfPreventCombatDmgBy.test(o)) return "combat";
  return null;
}

// ─── PREVENT-AND-PUT counters (SHELF CAP9, CR 615) — the counter-shield's INVERSE ─────────────────────
// The wall above SPENDS +1/+1 counters to pay for itself; this one PAYS OUT in them. Same CR 615
// prevention, opposite direction of the counter flow, so it deliberately lives beside its sibling and
// is enforced at the same two deal sites (combatResolution's funnel and applyDamageEffect).
//
// ⛔ WHY NO SHARED PREDICATE WITH counterShieldPrevention. The zero-counter question that forces phantom
// and bloatfly apart does not exist here at all — there is nothing to spend, so the prevention is always
// unconditional and can never fail for lack of a resource. Collapsing the two families would hand the
// spend-branch a mode it must not have.
//
// ⛔ AND WHY CREDITING THIS WITHOUT THE COUNTERS IS THE MIRROR-IMAGE FALSE POSITIVE OF THE SHIELD'S:
// there, prevention-without-payment yields an immortal creature that never pays. Here, prevention-without-
// payout yields an immortal creature that never GROWS — still an over-claim, because the counters ARE the
// card's whole upside and a metric crediting the wall alone claims a card the engine only half plays.
// The payout is applied through gameState.addCounter at both sites — the counter chokepoint — so counter
// doublers (CR 616) and every counters-placed watcher see the placement.
//
// The two printed shapes are each CORPUS-UNIQUE (censused against the bundled oracle, 38,254 cards):
//
//  ATTACHED  "If equipped creature would be dealt damage, prevent that damage and put that many +1/+1
//            counters on it."  (Panther Habit — the only carrier; no Aura prints this shape, so the
//            reader is deliberately NOT widened to "enchanted creature": untested surface, not coverage.)
//            → ALL damage, any source, combat or not. N = the amount that would have been dealt.
//
//  SELF      "If a creature would deal combat damage to this creature, prevent that damage and put a
//            +1/+1 counter on this creature."  (Ironscale Hydra — the only carrier.)
//            → COMBAT damage from a CREATURE only, and exactly ONE counter regardless of the amount.
//              Both restrictions are load-bearing: crediting it as an all-damage wall would shrug off a
//              Bolt (an over-claim), and paying "that many" would over-grow it.
const reAttachedPreventPutCounters =
  /(?:^|[\n.;])\s*if equipped creature would be dealt damage, prevent that damage and put that many \+1\/\+1 counters on it\s*(?:\.|$)/i;
const reSelfPreventPutCounterCombat =
  /(?:^|[\n.;])\s*if a creature would deal combat damage to (?:this creature|it), prevent that damage and put a \+1\/\+1 counter on (?:this creature|it)\s*(?:\.|$)/i;

/**
 * "put-that-many" | null — the ATTACHED prevent-and-put wall this Equipment CARD prints (Panther Habit).
 * Read off the raw oracle (not selfOracle): the subject is "equipped creature", never the card's own name.
 */
export function attachedPreventPutCountersOf(card) {
  const o = String(card?.oracle || card?.oracle_text || "").replace(/\([^)]*\)/g, " ");
  return reAttachedPreventPutCounters.test(o) ? "put-that-many" : null;
}

/**
 * "combat-put-one" | null — the SELF prevent-and-put wall this creature CARD prints (Ironscale Hydra).
 * selfOracle normalizes the printed name to "this creature", matching every other self-wall reader here.
 */
export function selfPreventPutCounters(card) {
  return reSelfPreventPutCounterCombat.test(selfOracle(card)) ? "combat-put-one" : null;
}

/**
 * The ATTACHED prevent-and-put wall in force on a permanent, aggregated across its attachments —
 * "put-that-many" | null. Mirrors attachedDamagePrevention below (same scan, same live-attachment read),
 * so the wall appears and disappears with the Equipment for free.
 */
export function attachedPreventPutCounters(state, permId) {
  const lk = findPermanent(state, permId);
  if (!lk?.permanent?.attachments?.length) return null;
  for (const attId of lk.permanent.attachments) {
    const att = findPermanent(state, attId);
    if (!att?.permanent?.card) continue;
    if (attachedPreventPutCountersOf(att.permanent.card)) return "put-that-many";
  }
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

// ISLANDHOME (SM-1) — the land-only FACE of attackDefenderRequirementOf was REMOVED 2026-07-29. Its comment
// claimed it was "kept because tests and callers pin the land-string contract", but an audit found NO engine
// caller: legalChoices enforces the restriction through attackDefenderRequirementOf +
// defenderMeetsAttackRequirement. Only tests referenced it — so islandhome.test.js's helper assertions were
// green while never touching the shipped path, and would have stayed green if the live one broke.
// The tests now call the live pair (verified identical on island / snow land / swamp before removal).

// ── COMBAT STATICS (BLITZ CS-1) — block-count statics, block/attack requirements, attack-restriction
// conditions. LOCKSTEP LAW (the EV-3 parseExceptBlockerFilters discipline): each family has ONE shared
// clause parser / core pattern consumed by BOTH the runtime reader (sentence-anchored over selfOracle)
// AND the classifier mirror (isEnforcedEvasionClause, clause-anchored), so credit == enforcement by
// construction. Every parser is fail-closed: an unvetted predicate/variant returns null → the card
// stays body-only (safe FN), never a half-enforced FP. ──

// MULTI-BLOCK (CR 509.1a — "the defending player chooses ONE creature for it to block", modified by the
// printed static): the maximum number of ATTACKERS this creature may block this combat.
//   "This creature can block an additional creature each combat."  → 2   (Selesnya Sagittars / Two-Headed
//                                                                        Giant of Foriys / Foriysian kin)
//   "This creature can block any number of creatures."             → ∞   (Palace Guard / Wall of Glare)
// Enforced at the declare-blockers offer (legalChoices — a blocker below its cap is re-offered against
// OTHER attackers) and honored at resolution (combatResolution divides its damage per CR 510.1d). The
// activated "{cost}: … this turn" grants, the team "each creature you control …" statics (Brave the
// Sands / High Ground — [SAP] lane), Equipment grants (Echo Circlet), and conditional riders (Entourage
// of Trest's monarch gate, Kemba's Legion's per-Equipment count) all fail these anchors → safe FN.
const CORE_BLOCK_ADDITIONAL = "can block an additional creature each combat";
const CORE_BLOCK_ANY_NUMBER = "can block any number of creatures";
const selfSentenceRe = (core) => new RegExp(`(?:^|[\\n.;])\\s*(?:this creature|it) ${core}\\s*(?:\\.|$)`);
const selfClauseRe = (core) => new RegExp(`^(?:this creature |it )?${core}$`);
const reMaxBlocksAdditional = selfSentenceRe(CORE_BLOCK_ADDITIONAL);
const reMaxBlocksAny = selfSentenceRe(CORE_BLOCK_ANY_NUMBER);
const reClauseMaxBlocksAdditional = selfClauseRe(CORE_BLOCK_ADDITIONAL);
const reClauseMaxBlocksAny = selfClauseRe(CORE_BLOCK_ANY_NUMBER);
/** The max number of attackers this creature may block this combat (CR 509.1a): 1, 2, or Infinity. */
export function maxBlocksOf(card) {
  const o = selfOracle(card);
  if (reMaxBlocksAny.test(o)) return Infinity;
  if (reMaxBlocksAdditional.test(o)) return 2;
  return 1;
}

// MUST-BE-BLOCKED (CR 509.1c — a block REQUIREMENT: "effects that say a creature must block, or that it
// must block if some condition is met"): "This creature must be blocked if able." (Riveteers Decoy /
// Goblin Fire Fiend / Gaea's Protector class). Enforced at the AI block plan (opponentAI.pickBlockers
// seeds a minimum legal block on it before the value heuristic — the LU-1 lure seam, the same versioned
// house bar as MUST-ATTACK: AI seats comply, the human seat is never hard-gated). The activated
// "{cost}: … this turn" forms (Loathsome Catoblepas), the targeted spell form (Satyr Piper), and the
// filtered "…by an Eldrazi…" Equipment grant (Slayer's Cleaver) all fail the anchor → safe FN.
const CORE_MUST_BE_BLOCKED = "must be blocked if able";
const reMustBeBlocked = selfSentenceRe(CORE_MUST_BE_BLOCKED);
const reClauseMustBeBlocked = selfClauseRe(CORE_MUST_BE_BLOCKED);
export function mustBeBlockedIfAble(card) { return reMustBeBlocked.test(selfOracle(card)); }

// LURE (LU-1, generalized in CS-1 — CR 509.1c): "All creatures [with flying] able to block this creature
// do so." The optional "with flying" filter (Talruum Piper — corpus-unique among whole-card carriers)
// narrows the requirement to FLYING blockers only; the bare form is the LU-1 shape unchanged. ONE core
// pattern builds the sentence reader (opponentAI's lure seeding consumes lureFilterOf) and the clause
// mirror, so the filtered form's credit and enforcement flip together. Any other filter/scope variant
// ("…able to block target creature…", "…this turn do so") fails the anchor → safe FN.
const CORE_LURE = "all creatures( with flying)? able to block (?:this creature|it) do so";
const reLureSentence = new RegExp(`(?:^|[\\n.;])\\s*${CORE_LURE}\\s*(?:\\.|$)`);
const reClauseLure = new RegExp(`^${CORE_LURE}$`);
/** { filter: null | "Flying" } when the card carries a printed lure static, else null. */
export function lureFilterOf(card) {
  const m = selfOracle(card).match(reLureSentence);
  return m ? { filter: m[1] ? "Flying" : null } : null;
}

// CONTROLLER-BOARD PREDICATE — the shared "…you control <predicate>" grammar consumed by BOTH the
// CANT-ATTACK-UNLESS gate (CR 508.1c) and the MUST-ATTACK-UNLESS condition (CR 508.1d). Vetted,
// corpus-confirmed arms only; anything else (action costs "you return/sacrifice/pay…", hand/graveyard
// counts, "you've cast…") returns null → fail closed (safe FN).
export function parseControllerBoardPredicate(text) {
  const t = String(text || "").trim();
  if (t === "an artifact") return { kind: "artifact", other: false };                     // Desperate Castaways
  if (t === "another artifact") return { kind: "artifact", other: true };                 // Steelclad Serpent / Mouser Mark III
  if (t === "a knight or a soldier") return { kind: "subtypeAny", subtypes: ["Knight", "Soldier"], other: false }; // War Falcon
  if (t === "another ally") return { kind: "subtypeAny", subtypes: ["Ally"], other: true };                        // Reckless Cohort
  const pm = t.match(/^another creature with power (\d+) or greater$/);                   // Warden of the Chained
  if (pm) return { kind: "powerGE", n: parseInt(pm[1], 10), other: true };
  const nm = t.match(/^a creature named ([a-z][a-z' -]*[a-z])$/);                         // Marauding Maulhorn
  if (nm) return { kind: "namedCreature", name: nm[1], other: false };
  return null;
}
/**
 * Does `playerId`'s board satisfy a parsed controller-board predicate? Layer-aware on every axis:
 * types via permanentTypes (an animated artifact counts), subtypes via permIsSubtype (layer-4 +
 * changeling, CR 702.73a), power via creaturePower. `other: true` excludes the carrier itself
 * ("another artifact" on an artifact creature never self-satisfies). Read LIVE at each declare-attackers
 * enumeration, so the gate switches on/off exactly as the board changes.
 */
export function controllerMeetsBoardPredicate(state, playerId, selfPermId, pred) {
  const bf = state.players?.[playerId]?.battlefield || [];
  const notSelf = (p) => !pred.other || p.id !== selfPermId;
  if (pred.kind === "artifact") {
    return bf.some((p) => notSelf(p) && (permanentTypes(state, p.id)?.types || []).some((t) => String(t).toLowerCase() === "artifact"));
  }
  if (pred.kind === "subtypeAny") {
    return bf.some((p) => notSelf(p) && pred.subtypes.some((s) => permIsSubtype(state, p.id, s)));
  }
  if (pred.kind === "powerGE") {
    return bf.some((p) => notSelf(p) && permanentIsCreature(state, p.id) && creaturePower(p, state) >= pred.n);
  }
  if (pred.kind === "namedCreature") {
    return bf.some((p) => notSelf(p) && permanentIsCreature(state, p.id)
      && String(p.card?.name || "").toLowerCase().replace(/[’']/g, "'") === pred.name);
  }
  return false; // unreachable — the parser emits only the four kinds above; fail closed
}

// CANT-ATTACK-UNLESS-YOU (CR 508.1c — an attack RESTRICTION: "can't attack unless some condition is
// met"): "This creature can't attack unless you control <predicate>." Enforced as a hard filter at
// attack declaration (legalChoices.actionsDeclareAttacker — the creature is simply not offered as an
// attacker while the predicate fails). The "can't attack OR BLOCK unless …" combined forms (Blind-Spot
// Giant / Oketra class) gate blocking too and are NOT this shape → safe FN.
const reAttackNeedsControllerBoard = /(?:^|[\n.;])\s*(?:this creature|it) can't attack unless you control ([^.;\n]+?)\s*(?:\.|$)/;
export function attackControllerRequirementOf(card) {
  const m = selfOracle(card).match(reAttackNeedsControllerBoard);
  return m ? parseControllerBoardPredicate(m[1]) : null;
}

// MUST-ATTACK-UNLESS (CR 508.1d — an attack REQUIREMENT with a condition: "attacks if able, or …
// attacks if some condition is met"): "This creature attacks each combat if able unless you control
// <predicate>." (Reckless Cohort / Marauding Maulhorn). While the predicate FAILS the requirement is
// live (opponentAI.pickAttackPlan force-declares, the MUST-ATTACK bar); while it HOLDS the requirement
// is off and the creature is an ordinary optional attacker. Before CS-1 the runtime over-enforced these
// two (selfMustAttack matched the prefix and ignored the unless) — the predicate read fixes that in
// lockstep with the credit.
const reMustAttackUnless = /(?:^|[\n.;])\s*(?:this creature|it) attacks each (?:combat|turn) if able unless you control ([^.;\n]+?)\s*(?:\.|$)/;
export function mustAttackUnlessOf(card) {
  const m = selfOracle(card).match(reMustAttackUnless);
  return m ? parseControllerBoardPredicate(m[1]) : null;
}

// CANT-ATTACK-UNLESS-DEFENDER (CR 508.1c) — the SM-1 islandhome seam GENERALIZED: "This creature can't
// attack unless defending player <predicate>." A per-defender attack-legality gate (legalChoices'
// allowedTargetsFor pairs the creature only with defenders whose board/state meets it — 4P-correct,
// the landwalk read discipline). Vetted predicates only; the clause parser is the single source of
// truth for reader AND mirror.
//   controls an Island/Swamp/…/snow land      → { kind:"land", subtype }          (SM-1, unchanged set)
//   controls a blue/white/… permanent          → { kind:"colorPermanent", color }  (Whimwader)
//   controls a creature with flying            → { kind:"creatureWithKeyword" }    (Lurking Green Dragon)
//   controls an enchantment or an enchanted permanent → { kind:"enchantmentOrEnchanted" } (Godhunter Octopus)
//   is poisoned                                → { kind:"poisoned" }               (Chained Throatseeker)
//   is the monarch                             → { kind:"monarch" }                (Crown-Hunter Hireling)
export function parseAttackDefenderRequirementClause(clause) {
  // PORT RAZER (POD-SIM THREE · KT-1, 2026-09-05): "This creature can't attack a player it has already attacked this
  // turn." A defender requirement keyed on the ATTACKER's own per-turn memo (attackedPlayersThisTurn, stamped at
  // declare-attacker, cleared at untap) — the extra-combat deck's own restriction; fails closed without the memo.
  if (/^(?:this creature |it )?can't attack a player it has already attacked this turn$/.test(String(clause || ""))) return { kind: "notAlreadyAttacked" };
  const m = String(clause || "").match(/^(?:this creature |it )?can't attack unless defending player (.+)$/);
  if (!m) return null;
  const rest = m[1].trim();
  if (rest === "is poisoned") return { kind: "poisoned" };
  if (rest === "is the monarch") return { kind: "monarch" };
  const cm = rest.match(/^controls an? (.+)$/);
  if (!cm) return null;
  const what = cm[1];
  if (/^(?:island|swamp|mountain|forest|plains|snow land)$/.test(what)) return { kind: "land", subtype: what };
  const colM = what.match(/^(white|blue|black|red|green) permanent$/);
  if (colM) return { kind: "colorPermanent", color: BLOCKER_COLOR_WORDS[colM[1]] };
  if (what === "creature with flying") return { kind: "creatureWithKeyword", keyword: "Flying" };
  if (what === "enchantment or an enchanted permanent") return { kind: "enchantmentOrEnchanted" };
  return null; // unvetted defender predicate → fail closed (safe FN)
}
const reAttackDefenderSentence = /(?:^|[\n.;])\s*((?:this creature|it) can't attack (?:unless defending player [^.;\n]+?|a player it has already attacked this turn))\s*(?:\.|$)/;
export function attackDefenderRequirementOf(card) {
  const m = selfOracle(card).match(reAttackDefenderSentence);
  return m ? parseAttackDefenderRequirementClause(m[1]) : null;
}
/** Does `defenderId` meet a parsed defender requirement? Layer-aware; live per enumeration. */
export function defenderMeetsAttackRequirement(state, defenderId, req, attackerPerm = null) {
  if (!req) return true;
  // PORT RAZER (KT-1): the attacker's own memo decides — no memo (an unthreaded caller) → fail closed, never an over-attack.
  if (req.kind === "notAlreadyAttacked") return !!attackerPerm && !(attackerPerm.attackedPlayersThisTurn || []).includes(defenderId);
  const bf = state.players?.[defenderId]?.battlefield || [];
  if (req.kind === "land") return defenderControlsLandType(state, defenderId, req.subtype);
  if (req.kind === "colorPermanent") return bf.some((p) => permColorSet(state, p.id).has(req.color));
  if (req.kind === "creatureWithKeyword") return bf.some((p) => permanentIsCreature(state, p.id) && permanentHasKeyword(state, p.id, req.keyword));
  if (req.kind === "enchantmentOrEnchanted") {
    return bf.some((p) =>
      (permanentTypes(state, p.id)?.types || []).some((t) => String(t).toLowerCase() === "enchantment")
      || (p.attachments || []).some((aid) => {
        const a = findPermanent(state, aid);
        return !!a && /\bAura\b/i.test(String(a.permanent.card?.type || a.permanent.card?.type_line || ""));
      }));
  }
  if (req.kind === "poisoned") return (state.players?.[defenderId]?.poison || 0) > 0;
  if (req.kind === "monarch") return state.monarchId === defenderId;
  return false; // unreachable — the parser emits only the kinds above; fail closed
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
// The land-only board read (defenderMeetsAttackLandRequirement) was REMOVED alongside its parser face —
// same audit, same reason: no engine caller. defenderMeetsAttackRequirement is the live one, and
// defenderControlsLandType (still used by it) does the actual "snow land" type-line match.

export function isSelfUnblockable(card) { return reBareUnblockable.test(selfOracle(card)); }
export function isSelfCantBlock(card) { return reCantBlock.test(selfOracle(card)); }

/**
 * SELF CAN'T-ATTACK[-OR-BLOCK], optionally LAND-GATED (CR 506.4 / 509.1a). Topiary Stomper: "This creature
 * can't attack or block unless you control seven or more lands." Also the ungated pair ("This creature can't
 * attack." / "…can't attack or block.").
 *
 * ⭐ THE BLOCK HALF ALREADY EXISTED AND WAS ALREADY ENFORCED — `isSelfCantBlock` above is read by
 * canBlockAttacker. The ATTACK half had no reader at all, so a card printing it parked (a safe FN, never a
 * false positive). This is the attack mirror plus the "unless you control N lands" window both halves share.
 *
 * Returns null (no restriction) or `{ attack, block, minLands }` — `minLands` 0 means unconditional.
 * ⛔ WHOLE-CLAUSE ANCHORED and LAND-ONLY: the gate the corpus prints on this shape is a land count. Any other
 * "unless …" tail fails the anchor → null → the clause stays residue → the card parks (CREED, FN-safe).
 */
const reSelfCantAtkBlk = /(?:^|[\n.;])\s*this (?:creature|token) can't (attack or block|attack|block)(?: unless you control (one|two|three|four|five|six|seven|eight|nine|ten|\d+) or more lands)?\s*(?:\.|$)/i;
const LAND_NUMWORD = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
export function selfCantAttackBlockGate(card) {
  const m = reSelfCantAtkBlk.exec(selfOracle(card));
  if (!m) return null;
  // "can't block alone" / "can't attack alone" are a DIFFERENT restriction with their own readers above; the
  // anchor's `(?:\.|$)` tail already excludes them (the word "alone" follows), so they can never land here.
  const what = m[1].toLowerCase();
  const minLands = m[2] ? (LAND_NUMWORD[m[2].toLowerCase()] ?? parseInt(m[2], 10)) : 0;
  return { attack: what !== "block", block: what !== "attack", minLands };
}

/** True iff this permanent may NOT be declared as an attacker right now (the gate's land window is read LIVE). */
export function selfCantAttackNow(state, perm) {
  const g = selfCantAttackBlockGate(perm?.card);
  if (!g || !g.attack) return false;
  if (!g.minLands) return true;                                   // unconditional
  const bf = state?.players?.[perm.controller]?.battlefield || [];
  const lands = bf.filter((p) => (permanentTypes(state, p.id)?.types || []).some((t) => String(t).toLowerCase() === "land")).length;
  return lands < g.minLands;                                      // restricted only while BELOW the threshold
}

/** The block-side twin of selfCantAttackNow. */
export function selfCantBlockNow(state, perm) {
  const g = selfCantAttackBlockGate(perm?.card);
  if (!g || !g.block) return false;
  if (!g.minLands) return true;
  const bf = state?.players?.[perm.controller]?.battlefield || [];
  const lands = bf.filter((p) => (permanentTypes(state, p.id)?.types || []).some((t) => String(t).toLowerCase() === "land")).length;
  return lands < g.minLands;
}
export function isCanBlockOnlyFlyers(card) { return reBlockOnlyFlying.test(selfOracle(card)); }
/** ④-AV — the printed N of "this creature can't block creatures with power N or greater", or null. */
export function blockerCantBlockPowerAtLeast(card) {
  const m = selfOracle(card).match(reBlockerMaxPower);
  return m ? parseInt(m[1], 10) : null;
}
/**
 * SELF-POWER BLOCK GATE — "less" | "greater" | null: the comparison under which a creature may NOT block
 * this attacker, relative to the ATTACKER's power. Read live in canBlockAttacker (both powers layer-aware
 * via creaturePower), and mirrored by isEnforcedEvasionClause so credit and enforcement flip together.
 */
export function selfPowerBlockGateOf(card) {
  const m = selfOracle(card).match(reSelfPowerCantBlock);
  return m ? m[1] : null;
}
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
    // artifact: "artifact creatures" (④-AV — enforced by the kind:"artifact" restriction in canBlockAttacker)
    "|artifact creatures?" +
    // subtype: "Walls/Dinosaurs/…" (bare plural/singular)
    `|(?:${[...BLOCKER_SUBTYPE_TOKENS].join("|")})s?` +
  ")$"
);

// Classifier-mirror faces of the EV-3 set-level readers (same MIN_BLOCKER_WORD_ALT as the runtime regexes).
const reEnforcedMinBlockerClause = new RegExp(`^(?:${MIN_BLOCKER_WORD_ALT}) or more creatures$`);
const reEnforcedMenaceTeamClause = new RegExp(
  `^each creature you control with menace can't be blocked except by (?:${MIN_BLOCKER_WORD_ALT}) or more creatures$`);

export function isEnforcedEvasionClause(clause) {
  const c = String(clause || "").trim();
  if (reLandwalkWord.test(c)) return true;
  if (/^(?:this creature |it )?can't be blocked$/.test(c)) return true;
  if (/^(?:this creature |it )?can't block$/.test(c)) return true;
  // SELF CAN'T-ATTACK[-OR-BLOCK], optionally LAND-GATED (Topiary Stomper). Credited through the SAME reader
  // the two declaration gates use (selfCantAttackBlockGate → selfCantAttackNow / selfCantBlockNow in
  // legalChoices), so recognition and enforcement cannot drift — the discipline this whole file runs on.
  // ⛔ The bare "can't attack" was previously UNcredited and UNenforced (a safe FN); it becomes credited only
  // now that the attacker gate exists, which is the order that keeps it honest.
  if (selfCantAttackBlockGate({ oracle: c.endsWith(".") ? c : `${c}.` })) return true;
  if (/^(?:this creature |it )?can block only creatures with flying$/.test(c)) return true;
  // BLOCKER-SIDE POWER CAP (④-AV) — the classifier mirror of blockerCantBlockPowerAtLeast; canBlockAttacker enforces it
  // against the attacker's live power, so a body whose only non-keyword text is this static is honestly native.
  if (/^(?:this creature |it )?can't block creatures with power \d+ or greater$/.test(c)) return true;
  // SELF-POWER BLOCK GATE (CR 509.1b) — the classifier mirror of selfPowerBlockGateOf; canBlockAttacker
  // enforces the comparison live, so a body whose only non-keyword text is this static is honestly native.
  // Same wording, same two directions, same "it" ending — the team-wide and ≤ variants stay uncredited.
  if (/^creatures with power (?:less|greater) than this creature's power can't block it$/.test(c)) return true;
  // BLOCK-COUNT CAP (CR 509.1c — menace-inverse) — "can't be blocked by more than one creature". Enforced in
  // legalChoices.legalBlockerActions (a 2nd blocker on this attacker is never offered), so a body whose only
  // non-keyword text is this static is honestly native.
  if (/^(?:this creature |it )?can't be blocked by more than one creature$/.test(c)) return true;
  if (reEvasionQualifier.test(c)) return true;
  // EVASION-EXCEPT (BLITZ EV-2 + EV-3, CR 509.1b) — "can't be blocked except by <filter>". Two enforced
  // families, credited in exact lockstep with their runtimes:
  //   • PAIRWISE filters (flying / flying-or-reach / color / artifact / subtype allowlist, compounds via
  //     "and/or") — the filter grammar is parseExceptBlockerFilters, the SAME function parseAttackerExceptions
  //     feeds canBlockAttacker, so recognition and enforcement can never drift. An unvetted filter (legendary /
  //     defender / flavor text / power) returns null → not credited (body-only, safe FN). NOTE: isKeywordOnly's
  //     clause splitter protects "and/or" (the `\band\b(?!\/or\b)` lookahead) so a compound arrives here WHOLE.
  //   • SET-LEVEL "<N> or more creatures" (the menace family, CR 702.111b generalized) — enforced at the two
  //     menace seams via attackerMinBlockers (legalChoices offer gate + combatResolution normalize). The word
  //     alternation is the SAME MIN_BLOCKER_WORD_ALT reMinBlockerCount matches, so credit == enforcement.
  {
    const exM = c.match(/^(?:this creature |it )?can't be blocked except by (.+)$/);
    if (exM) {
      if (reEnforcedMinBlockerClause.test(exM[1])) return true;
      if (parseExceptBlockerFilters(exM[1])) return true;
    }
  }
  // SONOROUS HOWLBONDER team static — enforced in attackerMinBlockers (the controller's menace creatures get
  // the ≥N block-size rule), so a body whose only non-keyword text is this static is honestly native. The
  // regex is anchored to the exact corpus-unique sentence (same word alternation as menaceTeamMinBlockersOf).
  if (reEnforcedMenaceTeamClause.test(c)) return true;
  // RAD-CONDITIONAL UNBLOCKABLE (Nightkin Ambusher) — credited here so a body whose only non-keyword text is
  // this conditional evasion static is honestly native; canBlockAttacker enforces the rad-counter condition.
  if (/^(?:this creature |it )?can't be blocked as long as defending player has a rad counter$/.test(c)) return true;
  // AB-1 — the defender-board type conditions (Neurok Spy / Bubbling Beebles / Hazy Homunculus): enforced
  // live in canBlockAttacker, so a body whose only non-keyword text is this static is honestly native.
  if (/^(?:this creature |it )?can't be blocked as long as defending player controls an? (?:artifact|enchantment|untapped land)$/.test(c)) return true;
  // CANT-ATTACK-UNLESS-DEFENDER (BLITZ SM-1 generalized by CS-1, CR 508.1c) — "can't attack unless
  // defending player <predicate>" (islandhome lands + blue-permanent / creature-with-flying /
  // enchantment-or-enchanted / poisoned / monarch). Enforced per-defender at attack declaration
  // (actionsDeclareAttacker filters the target list through defenderMeetsAttackRequirement); the credit
  // consumes the SAME parseAttackDefenderRequirementClause the runtime reader uses, so an unvetted
  // predicate is refused by both at once. The two-line "When you control no Islands, sacrifice …" frame
  // never reaches here whole.
  if (parseAttackDefenderRequirementClause(c)) return true;
  // CANT-ATTACK-UNLESS-YOU (BLITZ CS-1, CR 508.1c) — "can't attack unless you control <predicate>"
  // (Desperate Castaways / War Falcon / Steelclad Serpent / Warden of the Chained). Enforced as a hard
  // attacker filter in actionsDeclareAttacker via the SAME parseControllerBoardPredicate grammar; an
  // unvetted predicate (action costs, hand counts, "you've cast…") is refused by reader and mirror alike.
  {
    const am = c.match(/^(?:this creature |it )?can't attack unless you control (.+)$/);
    if (am && parseControllerBoardPredicate(am[1])) return true;
  }
  // MULTI-BLOCK (BLITZ CS-1, CR 509.1a) — "can block an additional creature each combat" (max 2) /
  // "can block any number of creatures" (∞). Enforced at the declare-blockers offer (legalChoices reads
  // maxBlocksOf) + the CR 510.1d damage division in combatResolution; the clause regexes are built from
  // the SAME core strings as the runtime reader's, so credit == enforcement.
  if (reClauseMaxBlocksAdditional.test(c)) return true;
  if (reClauseMaxBlocksAny.test(c)) return true;
  // MUST-BE-BLOCKED (BLITZ CS-1, CR 509.1c) — "must be blocked if able". Enforced at the AI block plan
  // (opponentAI.pickBlockers seeds a minimum legal block before the value heuristic — the LU-1 lure
  // seam, the MUST-ATTACK house bar). Same shared core as mustBeBlockedIfAble.
  if (reClauseMustBeBlocked.test(c)) return true;
  // LURE (LU-1 + the CS-1 "with flying" filter — Talruum Piper): the clause face of lureFilterOf's
  // sentence reader (ONE core pattern), enforced at the pickBlockers lure seeding with the filter
  // narrowing the forced set to flying blockers.
  if (reClauseLure.test(c)) return true;
  // MUST-ATTACK-UNLESS (BLITZ CS-1, CR 508.1d) — "attacks each combat/turn if able unless you control
  // <predicate>" (Reckless Cohort / Marauding Maulhorn). pickAttackPlan force-declares while the
  // predicate fails and releases the requirement while it holds — the same shared predicate grammar.
  {
    const um = c.match(/^(?:this creature |it )?attacks each (?:combat|turn) if able unless you control (.+)$/);
    if (um && parseControllerBoardPredicate(um[1])) return true;
  }
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

// Does the BLOCKER satisfy one vetted EVASION-EXCEPT arm (parseExceptBlockerFilters)? Layer-aware on every
// axis: keywords via permanentHasKeyword (a granted flying counts), color via permColorSet, artifact via the
// effective type line (isArtifactPerm — the fear/intimidate gate), subtype via permIsSubtype (layer-4
// subtypes + changeling, CR 702.73a — the GROUP-EVASION reader, so a legal changeling block is never denied).
function blockerMatchesExceptArm(state, blockerId, e) {
  if (e.kind === "flyingOrReach") return permanentHasKeyword(state, blockerId, "Flying") || permanentHasKeyword(state, blockerId, "Reach");
  if (e.kind === "keyword") return permanentHasKeyword(state, blockerId, e.keyword);
  if (e.kind === "color") return permColorSet(state, blockerId).has(e.color);
  if (e.kind === "artifact") return isArtifactPerm(state, blockerId);
  if (e.kind === "subtype") return permIsSubtype(state, blockerId, e.subtype);
  return false; // unknown arm kind — unreachable (the parser only emits the five above); fail closed
}

/**
 * May `blocker` legally block `attacker`, where `defenderId` is the blocking player (the defending
 * player whose lands gate landwalk, CR 509.1b)? PAIRWISE only — menace's ≥2 rule is a SET
 * constraint handled at resolution. Permissive on a missing permanent (never wedges resolution).
 */
/**
 * ④-W (2026-09-03 night) — a GRANTED except-by evasion: "Equipped creature can't be blocked except by Walls." (Prowler's
 * Helm) / "Enchanted creature can't be blocked except by <filter>" (Invisibility, Seeker, Canopy Cover). The SAME
 * fail-closed filter grammar the self-printed form uses (parseExceptBlockerFilters); the arms for ONE card's printed
 * line, or null when the card prints no such line or an unvetted filter. Pure text — shared by the block gate
 * (through grantedAttackerExceptions) and the classifier (coverage registers it as the parser's except-by validator),
 * so recognition and enforcement flip together, the discipline this file runs on.
 */
export function attachedExceptByOf(cardOrLine) {
  const t = String(cardOrLine?.oracle || "").replace(/\([^)]*\)/g, " ").toLowerCase().replace(/[’']/g, "'");
  const m = t.match(/(?:^|[\n.;])\s*(?:equipped|enchanted) creature can't be blocked except by ([^.;\n]+?)(?:\.|$)/);
  if (!m) return null;
  const raw = m[1].trim();
  if (/\bas long as\b|\bif\b|\buntil\b|\bthis turn\b/.test(raw)) return null; // a conditional rider → safe FN
  const arms = parseExceptBlockerFilters(raw);
  return arms ? (arms.length === 1 ? arms[0] : { kind: "or", arms }) : null;
}

/** The except-by evasions GRANTED to an attacker by its attachments (Equipment / Auras), live off the board. */
export function grantedAttackerExceptions(state, attackerId) {
  const aLook = findPermanent(state, attackerId);
  const out = [];
  for (const attId of aLook?.permanent?.attachments || []) {
    const att = findPermanent(state, attId);
    if (!att?.permanent || att.permanent.attachedTo !== attackerId) continue;
    const e = attachedExceptByOf(att.permanent.card);
    if (e) out.push(e);
  }
  // SHELF-85 V14 (2026-09-04 — Gingerbrute "can't be blocked this turn except by creatures with haste"): an effect-granted
  // except-by, carried as a layer-6 `cantBeBlockedExceptBy:<Keyword>` keyword until end of turn (applyCantBeBlocked), read
  // here into the SAME `keyword` arm the printed static uses — the blocker must carry that keyword. Vetted words only.
  for (const kw of ["Haste", "Flying"]) {
    if (permanentHasKeyword(state, attackerId, `cantBeBlockedExceptBy:${kw}`)) out.push({ kind: "keyword", keyword: kw });
  }
  return out;
}

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
  // KW-UNLEASH (CR 702.86a) — "It can't block as long as it has a +1/+1 counter on it." A LIVE counter read,
  // deliberately not a flag set at entry: the restriction binds no matter where the counter came from, which
  // is exactly why the keyword could not simply be credited as an untaken option (slice 49's refusal).
  if (hasUnleash(bCard) && (bLook.permanent?.counters?.["+1/+1"] || 0) > 0) return false;
  // CANT-BLOCK — a GRANTED "can't block this turn" (Goblin Shortcutter / Crossway Vampire's targeted
  // trigger → a layer-6 endOfTurn "cantBlock" keyword). Layer-aware via permanentHasKeyword, so it tracks
  // the temporary grant exactly like the printed restriction above and wears off at cleanup (CR 514.2).
  if (permanentHasKeyword(state, blockerId, "cantBlock")) return false;
  // PAIRWISE CANT-BLOCK (④-BA — "target creature can't block THIS creature this turn"): the grant names the attacker's
  // id, so only THIS pair is refused; the blocker keeps every other block (CR 509.1b — a restriction on one attacker).
  if (permanentHasKeyword(state, blockerId, `cantBlockSource:${attackerId}`)) return false;
  // "Can block only creatures with flying" is a RESTRICTION (this creature can't block non-flyers),
  // NOT a grant of reach: to actually block a FLYING attacker the blocker still needs flying/reach
  // (CR 702.9b, enforced below). So a non-flying/non-reach "can block only flyers" creature can block
  // nothing — correct, and every real such card (Cloud Elemental, …) carries flying. Do NOT "fix" this
  // to let it block a flier without flying/reach; that would permit an ILLEGAL block (a wrong play).
  if (isCanBlockOnlyFlyers(bCard) && !permanentHasKeyword(state, attackerId, "Flying")) return false;
  // BLOCKER-SIDE POWER CAP (④-AV) — "can't block creatures with power N or greater": the ATTACKER's live power
  // (layer-aware — a pumped 1/1 swinging as a 3/3 is refused) against the blocker's printed N.
  const blockerMaxPower = blockerCantBlockPowerAtLeast(bCard);
  if (blockerMaxPower != null && creaturePower(aLook.permanent, state) >= blockerMaxPower) return false;

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
  // SHELF-85 B7 — PROTECTION FROM CREATURES (CR 702.16f): every blocker is a creature, so an attacker with the class
  // quality can't be blocked at all. Layer-aware (printed OR granted by Unquestioned Authority / the Mantles).
  if (permanentProtectionClasses(state, attackerId).has("creatures")) return false;

  // Skulk — not blockable by a creature with greater power (CR 702.118b).
  if (permanentHasKeyword(state, attackerId, "Skulk")) {
    if (creaturePower(bLook.permanent, state) > creaturePower(aLook.permanent, state)) return false;
  }

  // SELF-POWER BLOCK GATE (CR 509.1b) — "Creatures with power less/greater than this creature's power can't
  // block it." Skulk's printed cousin, and enforced right beside it because it is the same dynamic
  // comparison; both powers go through creaturePower, so counters, Auras, Equipment and any layer-7 effect
  // on EITHER side are all accounted for at the moment blockers are declared.
  {
    const powGate = selfPowerBlockGateOf(aCard);
    if (powGate) {
      const bPow = creaturePower(bLook.permanent, state);
      const aPow = creaturePower(aLook.permanent, state);
      if (powGate === "less" ? bPow < aPow : bPow > aPow) return false;
    }
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
      if (r.kind === "artifact" && isArtifactPerm(state, blockerId)) return false; // ④-AV — "can't be blocked by artifact creatures"
    }
  }

  // EVASION-EXCEPT (BLITZ EV-2 + EV-3, CR 509.1b) — parsed "can't be blocked EXCEPT by [filter]" evasion: the
  // blocker must MATCH the filter, else it may not block (the INVERSE of EVASION-QUALIFIER above). Layer-aware
  // on the blocker's keywords/colors/types/subtypes (permanentHasKeyword / permColorSet / permanentTypes via
  // permIsSubtype — changeling included, CR 702.73a, so a changeling blocking Deathcult Rogue stays LEGAL). A
  // compound { kind:"or" } filter (Amrou Seekers) is satisfied by matching ANY arm. Cumulative with every
  // other restriction (CR 509.1b — a false here short-circuits the block).
  // ④-W: the attacker's PRINTED except-by filters plus the ones its attachments GRANT (Prowler's Helm, Invisibility).
  const exceptions = [...parseAttackerExceptions(aCard), ...grantedAttackerExceptions(state, attackerId)];
  for (const e of exceptions) {
    if (e.kind === "or") {
      if (!e.arms.some((a) => blockerMatchesExceptArm(state, blockerId, a))) return false;
    } else if (!blockerMatchesExceptArm(state, blockerId, e)) return false;
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

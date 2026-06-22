/**
 * effects/parser.js — oracle text → EffectProgram (Phase-2 P2.2 keystone, P2.5
 * multi-atom generalization).
 *
 * An `EffectProgram` is the serializable, ordered representation of an
 * instant/sorcery's instructions: `{ version, source, confidence, structure,
 * atoms, modal, xSpell, unparsedTail }`. Resolution runs the atoms in order
 * (`effects/runProgram.js`) under the reserved `effect-program` resolver key.
 *
 * THE FAIL-SAFE (CLAUDE.md §1.2/§8): the parser is "incomplete but never wrong".
 *  - P2.2 rated a program `high` only for a single clean clause matching one
 *    modeled pattern.
 *  - P2.5 makes it a real MULTI-ATOM parser: it SPLITS the oracle into clauses
 *    (on ". " / ";" / top-level " and ") and re-parses EACH clause to an atom.
 *    A program is `high` ONLY when EVERY clause parses to a known, resolvable
 *    atom — the ALLOWLIST discipline (every split clause fully accounted for),
 *    not a denylist of bad markers. ANY unparseable clause → `low`, ZERO atoms →
 *    the Arbiter seam. So "Deal 2 damage to target creature. Draw a card." lights
 *    up as a 2-atom program, while "... and you gain 3 life" stays low until the
 *    gain-life atom exists (P2.7) — incremental by construction, never wrong.
 *
 * Confidence is ALL-OR-NOTHING and a pure function of the program shape
 * (`programConfidence`): high runs every atom, low runs none.
 *
 * Leaf-ish: imports only the proven legacy clause parser + the atom table. Does
 * NOT import gameState, resolvers, or the runner — so it can't introduce a cycle.
 */

import { parseSpellEffect, parseCreatureTargetRestrictions, parseGraveyardFilter } from "../spellEffects.js";
import { isNonChosenTargetType } from "../targetTypes.js";
import { ATOM_RESOLVERS } from "./effectAtoms.js";
// WAVE 1 — clause parsers for the new-module atoms. Imported here (not self-registered from the atoms
// module) because effects/atoms/*.js must NOT import parser.js: parser.js → effectAtoms.js → atoms/*.js is
// a one-way edge, and an atoms-module importing parser.js back would TDZ-crash at load (registerClauseParser
// would run before parser.js's CLAUSE_PARSERS const initializes). These modules import only gameState/
// triggers/tokens (no parser), so importing their pure clause-parser fns here is cycle-free. Registered at
// the BOTTOM of this file, after CLAUSE_PARSERS is defined.
import { manifestClauseParser } from "./atoms/manifest.js";
import { amassClauseParser } from "./atoms/amass.js";
import { winGameClauseParser } from "./atoms/winGame.js";
import { GRANTABLE_COMBAT_KEYWORDS, GRANTABLE_STATIC_KEYWORDS, canonicalCombatKeyword } from "../keywords.js";
import { staticAbilitiesCoverCard, parseStaticAbilities } from "../staticAbilityParser.js";
import { detectTriggers } from "../triggers.js";

/**
 * The atom ops the interpreter can resolve natively — DERIVED from the resolver
 * table so the HIGH-confidence gate and the resolver set can never drift apart.
 * parser → effectAtoms → spellEffects is a safe leaf edge (no cycle).
 */
export const KNOWN_ATOM_OPS = Object.freeze(Object.keys(ATOM_RESOLVERS));
const KNOWN = new Set(KNOWN_ATOM_OPS);

// ONCE-PER-TURN — the atom ops whose resolver actually enforces the "Do this only once each turn"
// frequency latch (state.onceTriggersFiredThisTurn). Only these may carry the rider and stay HIGH; any
// other effect with the rider would silently over-fire (its resolver ignores the flag) → forced LOW.
const ONCE_PER_TURN_HONORED = new Set(["discover"]);

function typeOf(card) {
  return String(card?.type || card?.type_line || "");
}
function isInstantOrSorcery(card) {
  return /Instant|Sorcery/.test(typeOf(card));
}
function oracleOf(card) {
  return String(card?.oracle || card?.oracle_text || "");
}
function manaOf(card) {
  return String(card?.mana || card?.mana_cost || "");
}
/** Does the card's mana cost carry an {X} pip (Fireball, Blaze, Stroke of Genius…)? */
function hasXCost(card) {
  return /\{X\}/i.test(manaOf(card));
}

/** Strip reminder text in parens + collapse whitespace. */
function stripReminder(text) {
  return String(text || "").replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim();
}

// MTG-001 — the "(They|It|That creature|Those creatures) can't be regenerated." rider. Anchored to these
// subject forms only, so a damage rider ("a creature dealt damage this way can't be regenerated this turn"
// — Incinerate) does NOT match. STRIP (CANT_REGEN_STRIP) and DETECT (CANT_REGEN_TEST) are derived from one
// source so they can never drift: whatever the parse text strips, the parseEffectClause wrapper must detect.
const CANT_REGEN_SUBJECTS = /\b(?:they|it|that creature|those creatures) can'?t be regenerated\b/;
const CANT_REGEN_STRIP = new RegExp(CANT_REGEN_SUBJECTS.source + "\\.?", "gi");
const CANT_REGEN_TEST = new RegExp(CANT_REGEN_SUBJECTS.source, "i");
/**
 * Remove the "can't be regenerated" rider from the PARSE TEXT so the rest of the card (Wrath of God's
 * "Destroy all creatures", Terminate's "Destroy target creature") still matches its anchored pattern. The
 * rider is NOT vacuous — regeneration shields ARE modeled (CR 701.15; applyDestroyEffect / the lethal SBA
 * consume them) — so the parseEffectClause wrapper re-detects it (CANT_REGEN_TEST) and stamps
 * `cannotRegenerate` on the resulting destroy atom(s), and applyDestroyEffect then ignores shields for that
 * destruction. Stripping here is purely to let the lead effect parse; the rider's MEANING is preserved.
 */
function stripRegenerationRider(text) {
  return String(text || "").replace(CANT_REGEN_STRIP, " ");
}

/**
 * Remove the "This spell can't be countered[ by spells or abilities]." rider — VACUOUS for the effect
 * parser: uncounterability is ENFORCED at the counter-target enumerator (spellEffects.enumerateTargets
 * excludes an on-card "can't be countered" spell from a counter's legal targets), NOT by the effect
 * program, so the spell resolves IDENTICALLY whether or not the parser sees this clause. Stripping it
 * (rather than failing the all-or-nothing gate on an otherwise-unmodeled clause) lets a modeled spell
 * carrying it — Supreme Verdict ("Destroy all creatures. … This spell can't be countered."), Rending
 * Volley — parse natively. Anchored to the "this spell can't be countered" sentence only.
 */
function stripUncounterableRider(text) {
  return String(text || "").replace(/\bthis spell can'?t be countered(?: by spells or abilities)?\b\.?/gi, " ");
}

/**
 * KWSTRIP-1 — strip a VACUOUS cast/alternate-cost keyword LINE so the spell's actual BODY can parse (the
 * #200 vacuous-rider precedent; zero new resolver). Each of these keywords is a different WAY to cast or
 * use the card — foretell / suspend (cast later from exile), splice onto Arcane (graft the text onto an
 * Arcane spell), recover (a graveyard ability), harmonize, basic landcycling (discard-to-fetch from hand)
 * — NONE of which changes the spell's resolution when it is cast NORMALLY, so the engine resolves the body
 * identically whether or not the parser sees the keyword line. Anchored to a whole LINE that STARTS with
 * the keyword + its cost, so it can never eat a body sentence (a suspend card's "Exile ~ with N time
 * counters" body stays intact → still LOW, correctly). DELIBERATELY EXCLUDES rebound / cipher / conspire /
 * learn / proliferate / amass — those DO add an effect (recast / encode / copy / Lesson / extra effect),
 * so their card must stay LOW → Arbiter (never strip a non-vacuous keyword).
 */
// `cycling\s*\{` (KW-CYCLING) strips the plain-cycling line so a cycling SPELL's body parses native —
// UNLIKE the unenforced keywords above, cycling IS enforced (the from-hand `cycle` activation in
// legalChoices/actionDispatcher actually discards-and-draws), so the spell counts native honestly. The
// `^…cycling` anchor never matches "plainscycling"/"landcycling" — typecycling stays unstripped (its
// search variant routes to the Arbiter until the tutor atom covers it).
const CAST_KEYWORD_LINE = /^[ \t]*(?:foretell\s*\{|suspend\s+\d+\s*[—–-]|splice onto arcane\s*\{|recover\s*\{|harmonize\s*\{|basic landcycling\s*\{|cycling\s*\{)[^\n]*$/gim;
function stripCastKeywordLines(text) {
  return String(text || "").replace(CAST_KEYWORD_LINE, " ");
}

/**
 * For an {X}-cost spell, rewrite the X in the AMOUNT slot of a modeled clause to a
 * sentinel "1" so the proven numeric clause parser recognizes the shape; the caller
 * stamps `amountX` and drops the sentinel. ONLY the amount slot is rewritten — a
 * power/cardinality X ("power X or less", "X target creatures", "gain X life") is
 * left intact so it stays unmodeled → low. Returns the rewritten clause, or null
 * when no amount-X shape matches (so a fixed clause in an X-spell parses numerically).
 */
function rewriteAmountX(clause) {
  const damage = /(deals?\s+)X(\s+damage\b)/i;
  const draw = /(\bdraw\s+)X(\s+cards?\b)/i;
  const pump = /(\bgets\s+)\+X\/\+X\b/i;
  if (damage.test(clause)) return clause.replace(damage, (_, a, b) => `${a}1${b}`);
  if (draw.test(clause)) return clause.replace(draw, (_, a, b) => `${a}1${b}`);
  if (pump.test(clause)) return clause.replace(pump, (_, a) => `${a}+1/+1`);
  return null;
}

/** Map a legacy effect descriptor to a single EffectProgram atom (or null). */
function legacyToAtom(effect) {
  if (!effect) return null;
  if (effect.kind === "damage") return { op: "deal-damage", amount: effect.amount, targetType: effect.targetType };
  if (effect.kind === "destroy") return { op: "destroy", targetType: effect.targetType || "creature" };
  if (effect.kind === "draw") return { op: "draw", amount: effect.amount, targetType: null };
  if (effect.kind === "pump") return { op: "pump", ptDelta: effect.ptDelta, targetType: effect.targetType || "creature", duration: effect.duration || "endOfTurn" };
  return null;
}

function makeProgram({ confidence, structure = "sequence", atoms = [], modal = null, xSpell = false, unparsedTail = null }) {
  return { version: 1, source: "parser", confidence, structure, atoms, modal, xSpell, unparsedTail: unparsedTail ?? null };
}

// α2 optional-scope invariant — an `optional` atom ("you may <effect>") scopes ONLY its own clause, so an
// optional FOLLOWED by a MANDATORY atom is ambiguous ("you may X and Y" splits to [optional X, mandatory Y],
// where declining X would wrongly force Y). Optionals are therefore allowed ONLY as a SUFFIX of the atom
// sequence (mandatory-then-optional, e.g. Growth Spiral "Draw a card. You may put a land …", is safe). The
// SINGLE source of truth, applied by BOTH high-producing sequence paths (the collapsed-template helper and
// the main multi-clause split) so they can't drift.
function optionalsFormSuffix(atoms) {
  const i = atoms.findIndex((a) => a.optional);
  return i === -1 || atoms.slice(i).every((a) => a.optional);
}

/**
 * Markers that mean a clause carries semantics we do NOT model — a rider, an
 * unmodeled restriction, a variable amount, a conditional, a different actor.
 * A clause containing one drops to low → the Arbiter seam, so the interpreter is
 * never confidently wrong about something it didn't model. (NOTE: "and" is NOT
 * here — P2.5 SPLITS on it instead of denying it; each split clause is then
 * checked on its own merits.)
 */
const UNMODELED_MARKERS = /\b(unless|instead|rather than|where|for each|equal to|divided|at random|as long as|if|then|may|choose (?:one|two|three)|another|other target|up to|each of|beginning of|next turn|non(?:black|blue|white|red|green|land|artifact|creature)|attacking|blocking|tapped|untapped|without|wither|infect|with (?:flying|reach|trample|lifelink|deathtouch|vigilance|menace|haste|first strike|double strike|hexproof|indestructible|protection|ward|shadow|power|toughness|mana value)|that (?:player|creature|deals|has|was|spell)|you don't control|an opponent controls|you control|your opponents control|its (?:owner|controller))\b/i;

/**
 * Is a SINGLE clause (already split on sentence / `;` / top-level " and ") fully
 * accounted for — no comma-joined second instruction the loose pattern parse
 * would silently drop, and no unmodeled marker? Conservative (a false "not clean"
 * is safe → Arbiter). Reminder text is stripped first.
 */
function isCleanClause(text) {
  const s = stripReminder(text);
  if (s.includes(",")) return false;
  if (UNMODELED_MARKERS.test(s)) return false;
  return true;
}

/**
 * Split an oracle into clauses on sentence boundaries (". "), semicolons, and
 * top-level " and ". Each modeled atom shape ("deals N damage to …", "destroy
 * target creature …", "draw N cards", "target creature gets +X/+Y until end of
 * turn") contains no internal " and ", so splitting on it never severs a modeled
 * clause — but it DOES separate a rider ("… and you gain 3 life") into its own
 * clause, which then either parses to a known atom or forces the whole program low.
 */
function splitClauses(oracle) {
  const clauses = [];
  // ===== TOKENS ===== T4: normalize the two-sentence "create … token[ named N]. It has \"<ability>\""
  // shape (Eldrazi Scion/Spawn, Llanowar Mentor) into the single-sentence "…token[ named N] with
  // \"<ability>\"" form so the create-token matcher binds the ability to the token (the ". It has"
  // boundary would otherwise orphan the ability into its own unparsed clause → low). Fires ONLY on a
  // QUOTED ability directly after a token-creation sentence; it's content-agnostic (the clean-mana GATE
  // lives in parseTokenManaAbility — a non-mana ability still drops the whole clause to low). The merge
  // can only PROMOTE a card that was already low (the orphan clause), never regress a HIGH one.
  const normalized = stripReminder(oracle)
    // ===== WALT-ANIMATE ===== strip the vacuous "it's/that's still a land" reminder. A land that
    // "becomes a creature" is additive BY DEFAULT (it stays a land — that's why it still taps; 0
    // non-additive land-animates in the corpus), so this clause never changes resolution. Stripping it
    // lets a separate-sentence reminder ("…until end of turn. It's still a land. Draw a card.") not orphan
    // into an unparsed clause, and folds the inline "…creature that's still a land" form to the core.
    .replace(/\s*(?:it[’']s|that[’']s|they[’']re)\s+still\s+(?:a\s+land|lands)\.?/gi, "")
    .replace(
      /(\bcreates?\b[^.]*?\btokens?\b[^.]*?)\.\s+it has (["“'])/gi,
      "$1 with $2",
    );
  for (let sentence of normalized.split(/(?:\.\s+|;\s*)/)) {
    sentence = sentence.replace(/\.\s*$/, "").trim();
    if (!sentence) continue;
    // A sentence that STARTS with "search your library" — or a "you may search your library" optional
    // tutor (RAMP-1: Farhaven Elf's "you may search … put it onto the battlefield … then shuffle") — is
    // ONE tutor instruction (P3.2 / α2): its internal " and " ("reveal it, and put it into your hand",
    // "search for X and Y") is never a top-level effect boundary, so don't sever it (the "you may"
    // wrapper would otherwise be split off from its tutor body, dropping the whole thing to low). MUST be
    // anchored to the start — a sentence that merely CONTAINS it after a leading modeled effect ("Draw a
    // card and search your library …") must still split, or the leading atom (e.g. draw) would parse HIGH
    // while the tutor portion is silently dropped (a confident WRONG partial execution — the cardinal-rule
    // failure, P3.2 review catch). The tutor anchor + the α2 "you may" peel still drop anything they can't
    // model in the whole sentence to low.
    if (/^(?:you may )?search your library\b/i.test(sentence)) { clauses.push(sentence); continue; }
    // A combat trick that pumps AND grants a keyword ("Target creature gets +2/+2 and gains
    // trample until end of turn"), or grants several keywords ("gains flying and vigilance"),
    // joins its parts with " and " — NOT a top-level effect boundary. Keep the whole sentence
    // as one clause so parseExtendedAtom binds the pump + grant to the SAME target.
    if (/^target creature (?:(?:you control|an opponent controls) )?(?:gets [+-]\d+\/[+-]\d+ and )?gains\b.*\buntil end of turn$/i.test(sentence)) { clauses.push(sentence); continue; }
    // Overrun-style TEAM pump + keyword grant ("Creatures you control get +3/+3 and gain
    // trample until end of turn"): the " and " between the P/T bump and the grant is INTERNAL
    // to one team-pump instruction, not a top-level effect boundary. Keep the whole sentence so
    // parseExtendedAtom binds the controller-scoped pump + grant together (plural subject →
    // "gain", no trailing s).
    if (/^creatures you control get [+-]\d+\/[+-]\d+ and gain\b.*\buntil end of turn$/i.test(sentence)) { clauses.push(sentence); continue; }
    // SELF pump + keyword grant ("This creature gets +1/+0 and gains trample until end of turn" / "This
    // creature gains flying and vigilance until end of turn") — the " and " is INTERNAL to the one
    // self-grant instruction (CR 113.7 "this creature" = the source), NOT a top-level effect boundary.
    // Keep the whole sentence so parseExtendedAtom binds the self pump + every granted keyword together
    // (ACT-KW-GRANT). All-or-nothing anchored, so an un-grantable keyword just fails to match → low.
    if (/^this creature (?:gets [+-]\d+\/[+-]\d+ and )?gains\b.*\buntil end of turn$/i.test(sentence)) { clauses.push(sentence); continue; }
    // ===== TOKENS ===== a keyword token minted with several keywords ("Create a 4/4 white Angel
    // creature token with flying and vigilance") joins them with " and " — INTERNAL to the one
    // create-token instruction, not a top-level effect boundary. Keep the whole sentence so
    // parseExtendedAtom binds every keyword to the same token. The token matcher is all-or-nothing
    // anchored, so keeping too much together can only fail to match (→ low → Arbiter), never a
    // confident wrong partial — e.g. "… with flying and a 1/1 Snake token" / "… with flying and you
    // gain 2 life" both fail the keyword allowlist and drop to low (safe), they don't half-resolve.
    // The same applies to a count-scaled "…creature token FOR EACH <source>" (WALT-FOREACH-TOK) — a
    // MULTI-COLOR descriptor ("black and green Insect") carries an internal " and " that must not be
    // split off, so keep the whole "create … creature token (with|for each) …" sentence together.
    if (/^create .*\bcreature tokens?\b (?:with|for each) .+$/i.test(sentence)) { clauses.push(sentence); continue; }
    // ===== TREASURE-MAKER ===== a DYNAMIC-count named artifact token ("Create X Treasure tokens, where X
    // is the number of artifacts and enchantments your opponents control" — Dockside; "Create a Treasure
    // token for each artifact that player controls" — Cavern-Hoard) carries an internal " and " (the
    // "artifacts and enchantments" union) and a ", where X is …" count tail that are INTERNAL to the one
    // create-token instruction, NOT a top-level effect boundary. Keep the whole sentence so parseExtendedAtom
    // binds the count source to the token. All-or-nothing anchored downstream (an unmodeled count source →
    // null → low → Arbiter), so keeping too much together can only fail to match, never a wrong partial.
    if (/^create (?:x|a|an|one) (?:treasure|clue|food|gold) tokens?(?:,? where x is | for each ).+$/i.test(sentence)) { clauses.push(sentence); continue; }
    // TOKEN-BARE-MULTICOLOR — "create a 1/1 green and white Citizen creature token" (no "with"/"for each"
    // suffix) and its "you may create …" optional form (upkeep token triggers like Creakwood Liege).
    // The multi-color descriptor ("green and white") carries an INTERNAL " and " that the top-level
    // splitter (line 288) would cut, orphaning "white Citizen creature token" as an unparsed fragment.
    // Keep the whole bare-create sentence so the create-token regex matches the full color+type descriptor;
    // `parseClauseToAtom` then peels the "you may" wrapper before matching. Anchored to $ so
    // "…token and draw a card" (ending "card") still splits at " and " — only the bare form is protected.
    if (/^(?:you may )?create\b.*\bcreature tokens?$/i.test(sentence)) { clauses.push(sentence); continue; }
    // ===== WALT-ANIMATE ===== "[Until end of turn,] target land becomes a N/N [subtype] creature [with
    // KW[ and KW]] [until end of turn]" — the " and " inside a multi-keyword rider ("with reach and haste")
    // is INTERNAL to the one animate instruction, not a top-level boundary. Keep the whole sentence so
    // parseExtendedAtom binds the P/T-set + every granted keyword to the same animate atom (all-or-nothing
    // anchored — an un-grantable keyword / color-set / permanent duration just fails to match → low → Arbiter).
    if (/^(?:until end of turn, )?(?:target|this) land becomes a \d+\/\d+\b.*\bcreature\b/i.test(sentence)) { clauses.push(sentence); continue; }
    // OVERRUN-X — a COUNT-SCALED team pump ("[Until end of turn,] creatures you control gain trample and
    // get +X/+X[ until end of turn], where X is the greatest power among / the number of creatures you
    // control" — Overwhelming Stampede, Craterhoof Behemoth's ETB). The " and " between the keyword grant
    // and the +X/+X bump, plus the trailing ", where X is …" count clause, are INTERNAL to one team-pump
    // instruction — keep the whole sentence so parseExtendedAtom binds grant + scaled pump + count source
    // together. All-or-nothing anchored downstream (un-grantable keyword / unmodeled count source → low).
    if (/^(?:until end of turn, )?creatures you control gain .+ get \+x\/\+x.* where x is /i.test(sentence)) { clauses.push(sentence); continue; }
    // SYMBURN-1 symmetric burn ("<source> deals N damage to each creature and each player" — Inferno,
    // Fire Tempest, Evincar's Justice): the " and " between "each creature" and "each player" is INTERNAL
    // to one mass-damage target, NOT a top-level effect boundary. Keep the whole sentence so the damage
    // atom binds the combined eachCreatureAndPlayer scope (CR — "each player" is ALL players incl. the
    // caster). Anchored BOTH ends: the tail ($) excludes a qualifier on either half ("…each player that
    // doesn't control a Mountain"); the subject-prefix guard (no top-level " and " before the "deals"
    // verb) excludes a LEADING effect joined by " and " ("You gain 5 life and <name> deals N …") that
    // would otherwise be kept whole and silently DROP the leading effect — the only allowed " and " is
    // the one inside the target. A rejected sentence falls through to the split → low → Arbiter (safe),
    // never a dropped half.
    const symBurn = sentence.match(/^(.*?)\bdeals? \d+ damage to each creature and each player$/i);
    if (symBurn && !/\band\b/i.test(symBurn[1])) { clauses.push(sentence); continue; }
    // MASS-NC — "destroy all artifacts and enchantments": the " and " joins two permanent TYPES inside
    // one mass-destroy target, not a top-level effect boundary. Keep the whole sentence so the recognizer
    // binds the combined eachArtifactOrEnchantment scope. Anchored to the exact bare form.
    if (/^destroy all artifacts and enchantments$/i.test(sentence)) { clauses.push(sentence); continue; }
    // Split on a top-level " and " OR a ", then " sequence ("Scry 2, then draw a card" — Preordain;
    // "Draw a card, then discard a card" — loot). The comma is required so an in-effect "then" (a
    // rarity) isn't severed; each split piece is still re-parsed on its own merits, so a mis-split
    // just yields an unmodeled clause → low → Arbiter, never a confident wrong partial.
    for (const c of sentence.split(/\s+\band\b\s+|,\s+then\s+/i)) {
      const t = c.trim();
      if (t) clauses.push(t);
    }
  }
  return clauses;
}

/**
 * P2.7 extended atoms — recognized by ANCHORED `^…$` matchers. Anchoring is the
 * ALLOWLIST discipline: the clause must reduce EXACTLY to the modeled shape, so a
 * match is clean by construction (any extra/unmodeled text fails the anchor → low).
 * Currently the NON-TARGETED life atoms; targeted ones (tap/bounce/exile/counters)
 * land in a later sub-step alongside the targeting wiring.
 */
const SMALL_NUM = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5 };
// Spelled cardinals up to ten — mill amounts ("Mill three cards", "Mill ten cards") are spelled out.
const NUM_WORD = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };

/**
 * P3.2 tutor filter ALLOWLIST — the type / supertype / land-subtype / curated-creature-subtype words
 * the engine can match against a card's type line by literal containment (each word appears verbatim
 * in a real type line). A filter built only from these words is modeled; ANY other word ("nonland",
 * "permanent", "with", "named", a number, an un-listed subtype) makes the filter unmodeled → the
 * tutor drops to low → Arbiter, so the engine never silently mis-matches a filter it doesn't truly
 * understand.
 *
 * WAVE-2b TUTOR — the curated CREATURE-SUBTYPE block below is admitted ONLY for to-HAND / to-TOP
 * tutors (parseTutorFilter is shared, but the LAND-guard on the to-battlefield paths — RAMP-1/MULTI/
 * SPLIT — requires every group be guaranteed-land, which no creature subtype is, so a subtype tutor
 * can never cheat a non-land into play). Each word appears verbatim as a subtype in the corpus type
 * line ("Creature — Dragon"), so `\bdragon\b` matches exactly the subtyped creatures (CR 205.3m).
 */
const TUTOR_FILTER_WORDS = new Set([
  "basic", "legendary", "snow", "land", "creature", "artifact", "enchantment",
  "instant", "sorcery", "planeswalker", "battle", "plains", "island", "swamp",
  "mountain", "forest", "equipment", "aura",
  // Curated creature subtypes (tribal tutors — to-hand/to-top only). Each is a real creature subtype
  // that (a) has at least one "search your library for a <subtype> card" tutor in the corpus and (b)
  // appears verbatim ONLY in the subtype portion of a type line (verified zero collision with any
  // non-subtyped card), so `\b<subtype>\b` containment matches exactly the subtyped creatures.
  "dragon", "merfolk", "dinosaur", "goblin", "wizard", "elf", "sliver", "vampire",
]);
// ===== RAMP-TYPED ===== the five basic LAND TYPES (CR 305.6). A tutor-filter group naming any of
// these is GUARANTEED to fetch a LAND — verified against the bundled corpus: ZERO non-land cards
// carry a basic land type on their front face — so the battlefield-destination ramp tutor (RAMP-1,
// below) can safely accept a TYPED-BASIC fetch (Nature's Lore "a Forest card", Farseek "a Plains,
// Island, Swamp, or Mountain card") alongside the literal "basic land" phrase, without a non-land
// cheat-into-play ever slipping through the land-guard.
const BASIC_LAND_SUBTYPES = new Set(["plains", "island", "swamp", "mountain", "forest"]);
/**
 * Parse a tutor's filter phrase (the words between "for a/an" and "card") into
 * `{ groups }` — an OR of AND-groups: "instant or sorcery" → [["instant"],["sorcery"]],
 * "basic land" → [["basic","land"]]. Returns null if ANY word is outside the allowlist
 * (→ the tutor is unmodeled → low). A card matches if ANY group's words ALL appear in
 * its type line (effectAtoms.cardMatchesTutorFilter).
 */
function parseTutorFilter(phrase) {
  // Split a union into AND-groups on " or " AND comma-lists (Oxford comma): "Plains, Island, Swamp,
  // or Mountain" → 4 groups (RAMP-TYPED's typed-basic union, Farseek). The ", or " separator is tried
  // BEFORE a bare ", " so the final Oxford-comma item isn't left with a stray leading "or". Backward-
  // compatible: phrases with no comma ("basic land", "instant or sorcery") split exactly as before.
  const groups = String(phrase).trim().split(/,\s*or\s+|,\s*|\s+or\s+/).map((g) => g.trim().split(/\s+/).filter(Boolean));
  if (groups.length === 0 || groups.some((g) => g.length === 0)) return null;
  for (const g of groups) for (const w of g) if (!TUTOR_FILTER_WORDS.has(w)) return null;
  return { groups };
}
// WAVE-2b TUTOR — UP-TO-N word→number for the multi-fetch ramp tutors ("up to two/three/four/five").
const UP_TO_N_WORD = { two: 2, three: 3, four: 4, five: 5 };
/**
 * WAVE-2b TUTOR — parse a tutor's optional MANA-VALUE constraint clause (the bit AFTER "card":
 * "with mana value 2 or less" → {max:2}; "with mana value 3" → {exact:3}). Returns null when there's
 * no MV clause (an undefined capture group) — a clean "no MV cap". Only "or less" / exact are modeled
 * (Spellseeker MV<=2, Trophy Mage MV=3); a "with mana value N or greater" / "X" / any other comparator
 * never matches the capturing regex, so the whole tutor stays low → Arbiter (CREED — never a mis-cap).
 */
function parseTutorMv(capture) {
  if (capture === undefined || capture === null) return null;
  const m = String(capture).match(/^(\d+)( or less)?$/);
  if (!m) return null; // an unmodeled comparator → caller drops the tutor to low
  const n = parseInt(m[1], 10);
  return m[2] ? { max: n } : { exact: n };
}

/**
 * Parse a combat-trick's granted-keyword phrase ("trample", "flying and vigilance",
 * "first strike, deathtouch, and lifelink") into canonical keyword names, or null if ANY
 * word is outside the enforced+layer-aware GRANTABLE set (menace / indestructible / hexproof
 * / "protection from red" / …). ALL-OR-NOTHING: one unmodeled keyword drops the whole grant
 * to null → the clause is unmodeled → low → Arbiter, never a fake/partial grant.
 */
function parseGrantedKeywords(phrase) {
  const words = String(phrase).split(/,|\band\b/).map((w) => w.trim()).filter(Boolean);
  if (words.length === 0) return null;
  const out = [];
  for (const w of words) {
    if (!GRANTABLE_COMBAT_KEYWORDS.has(w.toLowerCase())) return null;
    out.push(canonicalCombatKeyword(w));
  }
  return out;
}

// ===== TOKENS ===== T4 ability-carrying tokens (WALT-TOKEN-ABIL slice 1: MANA abilities).
// A token minted "with \"<ability>\"" (or the "…token. It has \"<ability>\"" shape, normalized to
// "with" in splitClauses) whose quoted ability is a CLEAN, self-contained MANA ability the mana model
// already drives end-to-end — the exact subsystem that runs Treasure/Gold (T2). The minted token
// carries the ability as its `oracle`, so manaProduction / manaAbilitySacrificesSelf / manaSources
// honor it identically to a printed permanent (no new enforcement, no fabrication).
//
// CLEAN forms (Eldrazi Scion/Spawn "Sacrifice this token: Add {C}", Elf/Monk dorks "{T}: Add {G}",
// any-color rocks "{T}: Add one mana of any color"):
//   "{T}: Add <pips | one mana of any color>"
//   "Sacrifice this <token|creature|artifact>: Add <…>"          (sac-for-mana, no tap)
//   "{T}, Sacrifice this <token|creature|artifact>: Add <…>"     (tap + sac)
// REJECTED (→ null → whole token low → Arbiter) — every form whose extra text the mana model would
// SILENTLY DROP (parseAddClause stops at the first period; a restriction/rider after it vanishes):
//   "{T}: Add {C}. This mana can't be spent to cast a nonartifact spell." (Powerstone)   — restriction
//   "{T}: Add {R}. Spend this mana only to cast a planeswalker spell." (Commodore Guff)   — restriction
//   "{T}, Sacrifice this token: Add {R} or {G}. You gain 2 life." (Kibo/Peel Out)         — life rider
// ALL-OR-NOTHING anchored, so anything past the Add clause fails the `$` → null. The two-pip concat is
// restricted to the SAME color (`\{([wubrgc])\}\{\2\}` → "{C}{C}", "{G}{G}") — parseAddClause models a
// DIFFERENT-color concat ("Add {W}{U}") as `{colors:[W,U], amount:2}`, which the mana model's "one
// chosen color × amount" contract mis-resolves as 2-of-one-color. A CHOICE ("{R} or {G}") is amount 1
// (correct). No corpus token uses a different-color concat today; this keeps one Arbiter-routed if it
// ever ships (CREED: never a mis-resolved native).
const TOKEN_MANA_ABILITY = /^(?:\{t\}(?:, sacrifice this (?:token|creature|artifact))?|sacrifice this (?:token|creature|artifact)): add (\{[wubrgc]\}(?: or \{[wubrgc]\})?|\{([wubrgc])\}\{\2\}|one mana of any color)$/i;
/** Canonical Oracle casing for a (lowercased) clean mana ability — readability only; the mana model
 *  reads it case-insensitively. Uppercases mana pips and the {T} symbol, capitalizes Sacrifice/Add. */
function canonicalizeManaAbility(lower) {
  return lower
    .replace(/\{([wubrgc])\}/gi, (_, c) => `{${c.toUpperCase()}}`)
    .replace(/^\{t\}/i, "{T}")
    .replace(/, sacrifice this/i, ", Sacrifice this")
    .replace(/^sacrifice this/i, "Sacrifice this")
    .replace(/: add /i, ": Add ");
}
/**
 * Parse a token's quoted ability (the text after "with"/"It has", including the surrounding quotes)
 * into the canonical mana-ability oracle string to stamp on the minted token, or null if it isn't a
 * CLEAN mana ability (any rider/restriction/non-mana effect). Tolerates straight or curly quotes and a
 * trailing period.
 */
function parseTokenManaAbility(quotedWithQuotes) {
  const inner = String(quotedWithQuotes).trim()
    .replace(/^["“'](.*)["”']$/s, "$1")  // strip surrounding quotes (straight or curly)
    .trim().replace(/\.\s*$/, "");        // strip a trailing period
  if (!TOKEN_MANA_ABILITY.test(inner)) return null;
  return canonicalizeManaAbility(inner);
}

// ===== TOKENS =====
// Canonical case for the non-combat keywords a token may carry (combat ones come from
// canonicalCombatKeyword). Title-cased so the minted token's keywords array matches Scryfall.
const TOKEN_KEYWORD_CANON = { indestructible: "Indestructible" };
/**
 * Parse a keyword-token's "with …" phrase ("flying", "flying and vigilance", "first strike,
 * deathtouch, and lifelink") into canonical keyword names, or null if ANY word is outside the
 * enforced+layer-aware GRANTABLE STATIC set (combat keywords + indestructible — each ENFORCED
 * read-layer-aware, so a printed-on-token instance behaves exactly like one on a real creature).
 * ALL-OR-NOTHING: one unmodeled keyword (menace — unenforced; an inline ability; a number) drops
 * the whole token to null → low → Arbiter, never a fake/partial token. A trailing period (from a
 * single-sentence clause) is tolerated.
 */
function parseTokenKeywords(phrase) {
  const words = String(phrase).replace(/\.\s*$/, "").split(/,|\band\b/).map((w) => w.trim()).filter(Boolean);
  if (words.length === 0) return null;
  const out = [];
  for (const w of words) {
    const lw = w.toLowerCase();
    if (!GRANTABLE_STATIC_KEYWORDS.has(lw)) return null;
    out.push(TOKEN_KEYWORD_CANON[lw] || canonicalCombatKeyword(w));
  }
  return out;
}

// ===== DMG-SCALE / FOR-EACH ===== a board-count SOURCE — the "X" in "equal to the number of X" (and,
// later, "for each X"). Returns a `countSpec` the resolver computes AT RESOLUTION (CR 608.2h — a
// count-derived value is locked as the spell/ability resolves), or null for an unmodeled source (→ low
// → Arbiter). Slice 1 (WALT-DMG-SCALE) admits only CONTROLLER-scoped counts: permanents YOU control by
// card TYPE (creature/land/artifact/enchantment) or basic-land SUBTYPE (the CLOSED set Mountain/Forest/
// Island/Plains/Swamp), cards in YOUR hand, and (FOR-EACH) cards in YOUR graveyard (optionally typed).
// Opponent-scoped counts ("creatures they control", "cards in that player's hand"), creature subtypes
// (Goblins/Elves), and exotic sources (snow / attacking / "in excess of" / devotion) are NOT modeled →
// null → the whole clause routes low. SINGULAR and PLURAL both map to the same count: DMG-SCALE reads
// "the number of creatureS you control"; FOR-EACH reads "for each creature you control".
const COUNT_TYPE = { creature: "creature", creatures: "creature", land: "land", lands: "land", artifact: "artifact", artifacts: "artifact", enchantment: "enchantment", enchantments: "enchantment" };
const COUNT_BASIC_SUBTYPE = { mountain: "Mountain", mountains: "Mountain", forest: "Forest", forests: "Forest", island: "Island", islands: "Island", swamp: "Swamp", swamps: "Swamp", plains: "Plains" };
const COUNT_GY_TYPE = { creature: "creature", artifact: "artifact", land: "land", instant: "instant", sorcery: "sorcery", enchantment: "enchantment", planeswalker: "planeswalker" };
// ===== COUNT SUBTYPES ===== a CURATED allowlist of permanent SUBTYPES that appear in "<X>s you control"
// count sources (tribal "for each Goblin you control" / "number of Elves you control", artifact-token
// counts "for each Treasure", etc.). Keyed on BOTH the singular and plural surface form → the canonical
// singular subtype; countForSpec.countMatches then matches `\b<Subtype>\b` against the permanent's type
// line (exactly like the basic-land subtypes Mountain/Forest). CURATED (not generic) so a non-subtype word
// can never be mis-matched (CREED): every entry is a real MTG subtype, and a qualified count ("tapped
// Goblin you control") still fails the `^…$` anchor → low. The irregular plurals (Elves/Allies/Wolves) are
// listed explicitly so the canonical form fed to countMatches is correct.
const COUNT_SUBTYPE = {
  // creature tribes
  goblin: "Goblin", goblins: "Goblin", elf: "Elf", elves: "Elf", ally: "Ally", allies: "Ally",
  wizard: "Wizard", wizards: "Wizard", cat: "Cat", cats: "Cat", vampire: "Vampire", vampires: "Vampire",
  spider: "Spider", spiders: "Spider", spirit: "Spirit", spirits: "Spirit", zombie: "Zombie", zombies: "Zombie",
  human: "Human", humans: "Human", soldier: "Soldier", soldiers: "Soldier", warrior: "Warrior", warriors: "Warrior",
  knight: "Knight", knights: "Knight", dragon: "Dragon", dragons: "Dragon", beast: "Beast", beasts: "Beast",
  merfolk: "Merfolk", wolf: "Wolf", wolves: "Wolf", bird: "Bird", birds: "Bird", snake: "Snake", snakes: "Snake",
  dog: "Dog", dogs: "Dog", elemental: "Elemental", elementals: "Elemental", rat: "Rat", rats: "Rat",
  pirate: "Pirate", pirates: "Pirate", dinosaur: "Dinosaur", dinosaurs: "Dinosaur", faerie: "Faerie", faeries: "Faerie",
  giant: "Giant", giants: "Giant", saproling: "Saproling", saprolings: "Saproling", insect: "Insect", insects: "Insect",
  boar: "Boar", boars: "Boar", sliver: "Sliver", slivers: "Sliver",
  // artifact subtypes (incl. the named tokens)
  treasure: "Treasure", treasures: "Treasure", clue: "Clue", clues: "Clue", food: "Food", foods: "Food",
  equipment: "Equipment", powerstone: "Powerstone", powerstones: "Powerstone", construct: "Construct", constructs: "Construct",
  // enchantment subtypes
  shrine: "Shrine", shrines: "Shrine", aura: "Aura", auras: "Aura",
  // land subtypes
  gate: "Gate", gates: "Gate", desert: "Desert", deserts: "Desert", locus: "Locus",
};
// `allowTarget` admits the TARGET-scoped "cards in that player's hand" (who:"target") — passed ONLY by the
// DMG-SCALE matcher, which also requires a single-player target. Every other caller (the controller-scoped
// FOR-EACH draw/gain-life/lose-life/create-token matchers) leaves it false, so "that player" — which has no
// referent in a controller effect — routes to the Arbiter instead of silently resolving to 0.
//
// ===== TREASURE-MAKER ===== `allowScopes` (passed ONLY by the create-named-token dynamic matcher) additionally
// admits OPPONENT-scoped ("…your opponents control" — Dockside, who:"opponents", summed over all opponents) and
// TARGET-CONTROLLED ("…that player controls" — Cavern-Hoard, who:"target", the damaged/target player) permanent
// counts. Left false for every legacy caller so those scopes can never widen an existing count source.
// ===== COUNT-OTHER ===== (WALT #365) a leading "other " on a "<X> you control" count EXCLUDES the source
// permanent itself (CR 113.7 — "other" = every object but this one): "draw a card for each OTHER Dinosaur
// you control" (Earthshaker Dreadmaw) counts every Dinosaur you control but itself. Strip "other ", parse
// the base source, and tag `excludeSelf` so countForSpec drops the source from the tally. Gated to a
// CONTROLLER-scoped permanent count (who undefined) — "other" on a hand/graveyard/experience/opponent
// source has no battlefield self to exclude, so it routes to the Arbiter (safe FN) instead of guessing.
// (WAVE-2b DRAW-METRIC unified onto this excludeSelf wrapper — the earlier excludeSource/allowExcludeSource
// path was redundant; "for each other <X>" is exactly this permanentsYouControl-scoped exclusion.)
function parseCountSource(phrase, opts = {}) {
  const raw = String(phrase).trim().replace(/\.\s*$/, "");
  const om = raw.match(/^other (.+)$/);
  if (!om) return baseCountSource(raw, opts);
  const base = baseCountSource(om[1], opts);
  if (!base || base.kind !== "permanentsYouControl" || base.who) return null;
  return { ...base, excludeSelf: true };
}

function baseCountSource(phrase, { allowTarget = false, allowScopes = false } = {}) {
  const p = String(phrase).trim().replace(/\.\s*$/, "");
  let m;
  const withExclude = (spec) => spec; // "other" exclusion is handled by the parseCountSource wrapper (excludeSelf)
  // ===== TREASURE-MAKER ===== OPPONENT-scoped union "artifacts and enchantments your opponents control"
  // (Dockside Extortionist's X). Curated exact phrase only; countForSpec sums it over every opponent. Checked
  // FIRST so "your opponents control" wins before the controller-scoped "you control" branches.
  if (allowScopes && /^artifacts and enchantments your opponents control$/.test(p)) {
    return withExclude({ kind: "permanentsYouControl", cardTypes: ["artifact", "enchantment"], who: "opponents" });
  }
  // ===== TREASURE-MAKER ===== OPPONENT-scoped single-type "<creatures|lands|artifacts|enchantments> your
  // opponents control" — summed over all opponents (Cavern-Hoard's cast-cost "artifacts an opponent controls"
  // is a separate cost mechanic; this covers the for-each/X token sources). Anchored to the curated card types.
  if (allowScopes && (m = p.match(/^(creatures?|lands?|artifacts?|enchantments?) your opponents control$/))) {
    return withExclude({ kind: "permanentsYouControl", cardType: COUNT_TYPE[m[1]], who: "opponents" });
  }
  // ===== TREASURE-MAKER ===== TARGET-CONTROLLED "<creatures|lands|artifacts|enchantments> that player controls"
  // — the player just dealt combat damage ("create a Treasure token for each artifact that player controls",
  // Cavern-Hoard Dragon). who:"target" → countForSpec reads the spell target or, on a combat-damage trigger,
  // ctx.damagedPlayerId. Curated card types, anchored — "an opponent" / "each player" don't match (→ low).
  if (allowScopes && (m = p.match(/^(creatures?|lands?|artifacts?|enchantments?) that player controls$/))) {
    return withExclude({ kind: "permanentsYouControl", cardType: COUNT_TYPE[m[1]], who: "target" });
  }
  if ((m = p.match(/^(creatures?|lands?|artifacts?|enchantments?) you control$/))) {
    return withExclude({ kind: "permanentsYouControl", cardType: COUNT_TYPE[m[1]] });
  }
  if ((m = p.match(/^(mountains?|forests?|islands?|swamps?|plains) you control$/))) {
    return withExclude({ kind: "permanentsYouControl", subtype: COUNT_BASIC_SUBTYPE[m[1]] });
  }
  if (/^cards? in your hand$/.test(p)) return withExclude({ kind: "cardsInHand" });
  // ===== OPPONENT-SCOPED ===== "cards in that player's hand" — the count is the SPELL'S TARGET player's
  // hand (CR: "that player" = the targeted player), as in "deals damage to target player equal to the
  // number of cards in that player's hand" (Sudden Impact, Gaze of Adamaro, Storm Seeker). who:"target"
  // tells countForSpec to count the target player, not the controller. Only the bare phrase; "a player's"
  // / "an opponent's" / "each player's" don't match (→ low).
  if (allowTarget && /^cards? in that player's hand$/.test(p)) return withExclude({ kind: "cardsInHand", who: "target" });
  // ===== FOR-EACH ===== cards in YOUR graveyard, optionally filtered by ONE card type. Controller-scoped
  // ("your graveyard"); "a graveyard" / "their graveyard" / "that player's graveyard" reject (→ low).
  if ((m = p.match(/^(?:(creature|artifact|land|instant|sorcery|enchantment|planeswalker) )?cards? in your graveyard$/))) {
    return withExclude(m[1] ? { kind: "cardsInGraveyard", cardType: COUNT_GY_TYPE[m[1]] } : { kind: "cardsInGraveyard" });
  }
  // ===== COUNT SUBTYPES ===== "<Subtype>(s) you control" — a single curated permanent subtype (Goblin /
  // Elf / Treasure / Shrine / Gate …). Checked AFTER the card-type + basic-land-subtype branches so those
  // win their words; a single word not in the allowlist → null → low. (A multi-word or qualified subtype
  // count fails the `^…$` anchor → low.)
  if ((m = p.match(/^([a-z]+) you control$/)) && COUNT_SUBTYPE[m[1]]) {
    return withExclude({ kind: "permanentsYouControl", subtype: COUNT_SUBTYPE[m[1]] });
  }
  // ===== OVERRUN-X / DRAW-METRIC ===== a MAX-reduction, not a count: the single greatest layer-resolved
  // power (Overwhelming Stampede "+X/+X where X is the greatest power among creatures you control") or
  // greatest toughness (DRAW-METRIC "draw cards equal to the greatest toughness among creatures you
  // control") among the controller's creatures. countForSpec computes it at resolution; an EMPTY board → 0
  // (a safe 0, never fabricated). A leading "other " on a board MAX is gated out by the parseCountSource
  // wrapper (excludeSelf is restricted to permanentsYouControl), so a "greatest … among other creatures"
  // phrasing routes to the Arbiter rather than silently dropping the flag — a safe FN.
  if (/^greatest power among creatures you control$/.test(p)) return withExclude({ kind: "greatestPowerYouControl" });
  if (/^greatest toughness among creatures you control$/.test(p)) return withExclude({ kind: "greatestToughnessYouControl" });
  // ===== EXPERIENCE ===== the controller's experience counter total. "experience counters you have" is the
  // bare canonical form; "the controller has" is a rare alternate phrasing on non-Toph cards.
  if (/^experience counters? (?:you have|the controller has)$/.test(p)) return withExclude({ kind: "experienceCounters" });
  return null;
}

function parseExtendedAtom(s) {
  const t = s.toLowerCase().replace(/[’]/g, "'"); // normalize curly apostrophe

  // ===== PROLIFERATE ===== (WALT, CR 701.27) a standalone keyword action — "Proliferate" / "proliferate
  // again". The resolver (effectAtoms.applyProliferate) auto-picks the never-harmful counters. "Proliferate
  // twice" (Contagion Engine) runs it twice (times:2). A "proliferate" with a rider in the same clause
  // keeps the rider via the normal clause split, so this exact-match never silently drops trailing text.
  if (/^proliferate twice$/.test(t)) return { op: "proliferate", times: 2, targetType: null };
  if (/^proliferate( again)?$/.test(t)) return { op: "proliferate", targetType: null };

  // ===== EARTHBEND ===== (WALT, Toph) "earthbend N" — a keyword action: permanently animate a land you
  // control into a 0/0 Elemental creature with haste (still a land) + N +1/+1 counters (effectAtoms.
  // applyEarthbend). Two forms:
  //   Literal-N: "earthbend 2" — atom.count carries the printed value.
  //   Count-source: "earthbend X, where X is the number of <count source>" — atom.countSource carries the
  //   spec; applyEarthbend reads it at resolution via countForSpec (EARTHBEND-PR3, Toph attack trigger).
  const ebM = t.match(/^earthbend (\d+|a|an|one|two|three|four|five)$/);
  if (ebM) return { op: "earthbend", count: SMALL_NUM[ebM[1]] ?? parseInt(ebM[1], 10), targetType: null };
  const ebXM = t.match(/^earthbend x,?\s+where x is (?:equal to )?(?:the number of )?(.+)$/);
  if (ebXM) {
    const src = parseCountSource(ebXM[1]);
    if (src) return { op: "earthbend", countSource: src, targetType: null };
  }

  // ===== GAIN-EXPERIENCE ===== (EARTHBEND-PR3, Toph landfall) "you get an experience counter" / "N counters"
  // — increments the controller's experience counter total (player.experience). Non-targeted, infallible.
  if (/^you get an experience counter$/.test(t)) return { op: "gain-experience", count: 1, targetType: null };
  const expM = t.match(/^you get (\d+|one|two|three|four|five) experience counters?$/);
  if (expM) return { op: "gain-experience", count: SMALL_NUM[expM[1]] ?? parseInt(expM[1], 10), targetType: null };

  // ===== RAD ===== (CR 728) "<who> gets N rad counter(s)" — a player-counter grant (The Wise Mothman:
  // "each player gets a rad counter"). The inherent radiation ability (gameEngine, at each player's
  // precombat main) does the mill + life-loss + counter-removal based on the count. Fixed-N only
  // ("a"/"an"/"one".."five"/digit); a "for each" / X / scaled / "you MAY get" / "that player"-referent
  // variant fails the `$` anchor → low → Arbiter (safe FN). NON-targeted forms (each player / each opponent
  // / you) carry no targetType — they resolve identically on a spell or a trigger. The TARGETED form
  // ("target player/opponent gets N") rides who:"target" + a player targetType — offensive only
  // (atomTargetIntent → "enemy", parallel to targeted lose-life: you never rad yourself by choice).
  const radEachM = t.match(/^each (player|opponent) gets (\d+|a|an|one|two|three|four|five) rad counters?$/);
  if (radEachM) return { op: "rad", amount: SMALL_NUM[radEachM[2]] ?? parseInt(radEachM[2], 10), who: radEachM[1] === "opponent" ? "eachOpponent" : "eachPlayer", targetType: null };
  const radYouM = t.match(/^you get (\d+|a|an|one|two|three|four|five) rad counters?$/);
  if (radYouM) return { op: "rad", amount: SMALL_NUM[radYouM[1]] ?? parseInt(radYouM[1], 10), who: "controller", targetType: null };
  const radTgtM = t.match(/^target (player|opponent) gets (\d+|a|an|one|two|three|four|five) rad counters?$/);
  if (radTgtM) return { op: "rad", amount: SMALL_NUM[radTgtM[2]] ?? parseInt(radTgtM[2], 10), who: "target", targetType: radTgtM[1] };

  // ===== CDMG-PLAYER-PAYOFF ===== combat-damage-to-a-player payoffs whose ACTOR/COUNT is the trigger
  // referent the combat-damage trigger carries in ctx ({damagedPlayerId, combatDamageAmount} — set by
  // triggers.checkCombatDamageTriggers, flushed into baseParams.context by gameEngine.buildTriggerStack,
  // the SAME path Wave-1's treasure "create that many tokens" used). These are NON-targeted (the damaged
  // player is the trigger's referent, not a chosen target) so they carry targetType:null and route natively
  // on the trigger flush (programNeedsChosenTarget → false) AND clean-no-op as a spell (no ctx.damagedPlayerId
  // / combatDamageAmount → 0). All anchored ^…$ — any trailing rider ("…, then discard a card" / "…if they
  // don't have any rad counters" / "…or planeswalker") leaves text past the anchor → low → Arbiter (CREED:
  // never a dropped clause). NON-combat referents resolve to 0 / a clean skip, never a fabricated count.
  //   (a) "draw that many cards" (Starwinder/Cold-Eyed Selkie "you may"-wrapped, Fear of Failed Tests /
  //       Glint-Eye Nephilim bare): the count is the triggering combat-damage amount. The leading "you may"
  //       wrapper is peeled by parseClauseToAtom's α2 (stamping optional:true); the inner bare form lands
  //       here. Keep the optional anchor too so a raw "you may draw that many cards" passed directly still
  //       stamps optional (the parser is also called clause-first in tests). Anchored — "draw that many
  //       cards, then discard a card" (April) keeps its tail and fails the $ → low.
  const cdmgDrawM = t.match(/^(you may )?draw that many cards$/);
  if (cdmgDrawM) return { op: "draw", countContext: "combatDamageAmount", optional: !!cdmgDrawM[1], targetType: null };
  //   (b) "they get N rad counters" (Glowing One) / "that player gets N rad counters" — a FIXED-N rad grant
  //       to the just-damaged player. who:"damagedPlayer" reads ctx.damagedPlayerId (absent → clean no-op).
  //       A trailing intervening-if ("…if they don't have any rad counters", Vexing Radgull) keeps its tail
  //       and fails the $ → low → Arbiter (the conditional branch stays UNMODELED — never half-resolved).
  const cdmgRadFixedM = t.match(/^(?:they|that player) gets? (\d+|a|an|one|two|three|four|five) rad counters?$/);
  if (cdmgRadFixedM) return { op: "rad", who: "damagedPlayer", amount: SMALL_NUM[cdmgRadFixedM[1]] ?? parseInt(cdmgRadFixedM[1], 10), targetType: null };
  //   (c) "they get that many rad counters" (Infesting Radroach) — the count IS the combat-damage amount.
  const cdmgRadDynM = t.match(/^(?:they|that player) gets? that many rad counters$/);
  if (cdmgRadDynM) return { op: "rad", who: "damagedPlayer", countContext: "combatDamageAmount", targetType: null };

  // ===== DIES-TRIGGER-RESOURCE-PAYOFFS ===== power-scaled dies-trigger payoffs whose COUNT is the dying
  // creature's last-known power (CR 603.6e), carried as ctx.dyingPower by checkDiesTriggers (captured at the
  // SBA/destroy/sacrifice look-back BEFORE the permanent left the battlefield). NON-targeted (the dying
  // creature is the trigger referent, not a chosen target → targetType:null → routes natively on the trigger
  // flush, programNeedsChosenTarget → false), and a clean no-op outside a dies-trigger (no ctx.dyingPower → 0,
  // never a fabricated count). All anchored ^…$ — any trailing rider leaves text past the anchor → low →
  // Arbiter (CREED: never a dropped clause). The fixed dies-payoffs already resolve; these are the DYNAMIC
  // "equal to its power" forms only. Mirrors the combatDamageAmount countContext path verbatim.
  //   (a) "each opponent gets a number of rad counters equal to its power" (Feral Ghoul). who:"eachOpponent".
  //       UNAMBIGUOUS: only a dies-trigger prints "each opponent gets … rad counters equal to its power"
  //       (corpus-verified to exactly Feral Ghoul), and "its" = the dying creature, so binding ctx.dyingPower
  //       here is always correct. (The draw/gain-life halves are NOT generic clause matchers — "draw cards
  //       equal to its power" also appears on ETB/combat-damage cards where "its power" is the LIVE source,
  //       not a dying creature; those are handled ONLY inside the dies-specific matchDiesGainDrawByPower
  //       collapsed template, never as a context-free clause, so an ETB Prime Speaker Zegana / a combat-damage
  //       Gregor is NOT mis-flipped to read an absent dyingPower → 0.)
  if (/^each opponent gets a number of rad counters equal to its power$/.test(t)) {
    return { op: "rad", who: "eachOpponent", countContext: "dyingPower", targetType: null };
  }

  // ===== DMG-SCALE ===== (WALT-DMG-SCALE) "<source> deals damage to <target> equal to the number of
  // <count source>" — the damage AMOUNT is a board count resolved at resolution (`amountCount`), not a
  // printed number (Massive Raid, Spitting Earth, Outnumber, Feedback Bolt). Reuses the existing
  // deal-damage atom + targeting verbatim; only the amount is new. TIGHT target ALLOWLIST (the bare,
  // fully-modeled forms) so a RESTRICTED target ("target attacking creature", "each player") never
  // mis-resolves to the unrestricted set; an unmodeled count source (parseCountSource → null) drops the
  // whole clause to low → Arbiter. "twice the number of" / "in excess of" don't match the anchor (a
  // deliberate deferral — never a half-scaled native).
  const mds = t.match(/^.+? deals? damage to (.+?) equal to the number of (.+)$/);
  if (mds) {
    const TT = {
      "any target": "any", "target creature": "creature", "target player": "player",
      "target player or planeswalker": "playerOrPlaneswalker",
      "target creature or planeswalker": "creatureOrPlaneswalker", "each opponent": "eachOpponent",
    };
    const targetType = TT[mds[1].trim()];
    const amountCount = parseCountSource(mds[2], { allowTarget: true });
    if (!targetType || !amountCount) return null;
    // who:"target" ("cards in that player's hand") requires a SINGLE-PLAYER target — "that player" = the
    // targeted player. Pairing it with an each-opponent / creature / any target is incoherent (no single
    // "that player") → route the whole card to the Arbiter rather than silently count 0.
    if (amountCount.who === "target" && targetType !== "player" && targetType !== "playerOrPlaneswalker") return null;
    return { op: "deal-damage", targetType, amountCount };
  }

  // ===== FOR-EACH ===== (WALT-FOR-EACH) a count-scaled NON-TARGETED controller effect: "draw a card for
  // each X", "you gain N life for each X", "each opponent/player/you lose N life for each X" (and the
  // "<effect> equal to the number of X" phrasing for draw/gain). The amount is a board count × a per-unit
  // value (`amountCount.per`), computed at resolution (reuses parseCountSource + resolveScaledAmount). An
  // unmodeled count source (parseCountSource → null) drops the whole clause to low → Arbiter. Numeric
  // per only. The effects are non-targeted (targetType:null), so they route the same on a spell or a
  // trigger; the count is always the CONTROLLER's (ctx.controller).
  // ===== DRAW-METRIC ===== (WAVE2b) "draw cards equal to the greatest power/toughness among <count source>"
  // — the draw count is the single greatest layer-resolved power (Soul's Majesty, Garruk, Caller of Beasts'
  // "greatest power") or toughness among the count source's creatures, computed at resolution via
  // parseCountSource + countForSpec (greatestPower/ToughnessYouControl, MAX-reduction). per:1 — the metric IS
  // the amount. An empty board → 0 (a safe FN, never fabricated). An unmodeled tail (parseCountSource → null)
  // drops the clause to low → Arbiter. Checked BEFORE the "for each"/"number of" draw matchers (it's a
  // distinct "greatest … among" phrasing). LANDMINE: a card whose OTHER clause is unmodeled (Rishkar's
  // Expertise free-cast, Return of the Wildspeaker modal) stays non-native overall — making this DRAW clause
  // HIGH does not flip it (the clause split keeps the unmodeled sibling, which routes the card low).
  let mfe = t.match(/^(?:you )?draw cards equal to the (greatest (?:power|toughness) among .+)$/);
  if (mfe) {
    const src = parseCountSource(mfe[1]);
    return src ? { op: "draw", amountCount: { ...src, per: 1 }, targetType: null } : null;
  }
  // ===== DRAW-METRIC ("for each [other]") ===== (WAVE2b) controller-DRAW for-each / equal-to-number matchers.
  // The parseCountSource wrapper handles a leading "other " self-exclusion uniformly (excludeSelf, gated to a
  // controller-scoped permanent count) — "draw a card for each OTHER Dinosaur you control" excludes the source
  // permanent (CR 113.7). No per-matcher opt-in is needed (the wrapper is the single source of that behavior).
  mfe = t.match(/^(?:you )?draw (a|\d+) cards? for each (.+)$/);
  if (mfe) {
    const src = parseCountSource(mfe[2]);
    return src ? { op: "draw", amountCount: { ...src, per: mfe[1] === "a" ? 1 : parseInt(mfe[1], 10) }, targetType: null } : null;
  }
  mfe = t.match(/^(?:you )?draw cards equal to the number of (.+)$/);
  if (mfe) {
    const src = parseCountSource(mfe[1]);
    return src ? { op: "draw", amountCount: { ...src, per: 1 }, targetType: null } : null;
  }
  mfe = t.match(/^(?:you )?gain (\d+) life for each (.+)$/);
  if (mfe) {
    const src = parseCountSource(mfe[2]);
    return src ? { op: "gain-life", amountCount: { ...src, per: parseInt(mfe[1], 10) }, targetType: null } : null;
  }
  mfe = t.match(/^(?:you )?gain life equal to the number of (.+)$/);
  if (mfe) {
    const src = parseCountSource(mfe[1]);
    return src ? { op: "gain-life", amountCount: { ...src, per: 1 }, targetType: null } : null;
  }
  mfe = t.match(/^each opponent loses (\d+) life for each (.+)$/);
  if (mfe) {
    const src = parseCountSource(mfe[2]);
    return src ? { op: "lose-life", who: "eachOpponent", amountCount: { ...src, per: parseInt(mfe[1], 10) }, targetType: null } : null;
  }
  mfe = t.match(/^each player loses (\d+) life for each (.+)$/);
  if (mfe) {
    const src = parseCountSource(mfe[2]);
    return src ? { op: "lose-life", who: "eachPlayer", amountCount: { ...src, per: parseInt(mfe[1], 10) }, targetType: null } : null;
  }
  mfe = t.match(/^(?:you )?lose (\d+) life for each (.+)$/);
  if (mfe) {
    const src = parseCountSource(mfe[2]);
    return src ? { op: "lose-life", who: "controller", amountCount: { ...src, per: parseInt(mfe[1], 10) }, targetType: null } : null;
  }

  // Tutor — "Search your library for a/an [<FILTER>] card[ with mana value N[ or less]], [reveal it,]
  // [and] put it into your hand[, then shuffle]." HAND destination only, single card. The filter is
  // OPTIONAL: an UNFILTERED "search for a card" (Demonic Tutor) is modeled too (the picker shows the
  // whole library / the auto-pick takes the best). A FILTERED phrase must be ALLOWLISTED
  // (parseTutorFilter); WAVE-2b adds an optional MANA-VALUE constraint ("with mana value 2 or less" —
  // Spellseeker; "with mana value 3" — Trophy Mage) parsed by parseTutorMv and carried on filter.mv —
  // candidates are MV-filtered UPSTREAM (applyTutor + autoPickTutorCandidate), never just in the picker.
  // An unmodeled filter ("nonland", "named X") / unmodeled MV comparator ("or greater"/"X") / multi-card
  // ("two", "up to N") / battlefield/top destination all fail the anchor or the parse → low → Arbiter.
  // The fetched card is chosen at resolution (player picker, or auto-pick).
  const tm = t.match(/^search your library for an? (?:([a-z][a-z ]*?) )?cards?(?: with mana value (\d+(?: or less)?))?,?(?: reveal (?:it|that card|the card),?)?(?: and)? put (?:it|that card|the card) into your hand(?:,? (?:then |and )?shuffle(?: your library)?)?\.?$/);
  if (tm) {
    const phrase = tm[1]; // undefined for an unfiltered "a card"
    const mvCapture = tm[2]; // undefined when there's no "with mana value …"
    // An MV clause was WRITTEN but its comparator isn't modeled → low (CREED: never silently drop the cap).
    const mv = parseTutorMv(mvCapture);
    if (mvCapture !== undefined && mv === null) return null;
    if (phrase === undefined) {
      // Unfiltered by TYPE, but possibly MV-capped ("a card with mana value 3" — rare, modeled the same).
      const filter = mv ? { groups: [], mv } : null;
      const label = mv ? `card with mana value ${mvCapture}` : "card";
      return { op: "tutor", filter, filterLabel: label, destination: "hand", targetType: null };
    }
    const base = parseTutorFilter(phrase);
    if (!base) return null;
    const filter = mv ? { ...base, mv } : base;
    const label = mv ? `${phrase} card with mana value ${mvCapture}` : `${phrase} card`;
    return { op: "tutor", filter, filterLabel: label, destination: "hand", targetType: null };
  }
  // WAVE-2b FETCH-TO-TOP — "Search your library for a/an [<FILTER>] card, [reveal it,] then shuffle and
  // put (it|that card|the card) on top." (Vampiric / Mystical / Worldly / Sylvan / Personal / Enlightened
  // Tutor; the tribal to-top tutors Merrow Harbinger / Forerunner of the Legion / Elvish Harbinger.) The
  // card is fetched to the TOP of the library AFTER a shuffle (CR 701.19e: shuffle first so the chosen
  // card survives, THEN place it on top — resolveTutorChoice's destination==="top" ordering). Same
  // OPTIONAL allowlisted filter + optional MV cap as the to-hand tutor. A rider in the SAME sentence
  // (Vampiric's "You lose 2 life" is a SEPARATE sentence, split off by splitClauses, so it doesn't reach
  // here) or a multi-card "any number" / "up to N" fails the single-card anchor → low → Arbiter.
  const ttm = t.match(/^search your library for an? (?:([a-z][a-z ]*?) )?cards?(?: with mana value (\d+(?: or less)?))?,?(?: reveal (?:it|that card|the card),?)?(?: (?:then|and))* shuffle(?: your library)? and put (?:it|that card|the card) on top\.?$/);
  if (ttm) {
    const phrase = ttm[1];
    const mvCapture = ttm[2];
    const mv = parseTutorMv(mvCapture);
    if (mvCapture !== undefined && mv === null) return null;
    if (phrase === undefined) {
      const filter = mv ? { groups: [], mv } : null;
      const label = mv ? `card with mana value ${mvCapture}` : "card";
      return { op: "tutor", filter, filterLabel: label, destination: "top", targetType: null };
    }
    const base = parseTutorFilter(phrase);
    if (!base) return null;
    const filter = mv ? { ...base, mv } : base;
    const label = mv ? `${phrase} card with mana value ${mvCapture}` : `${phrase} card`;
    return { op: "tutor", filter, filterLabel: label, destination: "top", targetType: null };
  }
  // RAMP-1 / RAMP-TYPED — battlefield-destination LAND tutor: "Search your library for a <LAND> card,
  // put (it|that card) onto the battlefield[ tapped], then shuffle." (Rampant Growth "a basic land card",
  // and — RAMP-TYPED — the typed-basic ramp staples: Nature's Lore / Three Visits "a Forest card", Farseek
  // "a Plains, Island, Swamp, or Mountain card", and the same clause inside Wood Elves' / Farhaven Elf's
  // ETB). Reuses the tutor atom + picker; the fetched card enters the battlefield (resolveTutorChoice →
  // enterCardFromZone, firing ETB). RESTRICTED to LAND fetches — every filter group must be GUARANTEED-land
  // (it names the literal "land", OR a basic land type, which only lands carry — verified zero non-land
  // hits in the corpus) — so a non-land cheat-into-play (Natural Order "a creature card") stays OUT of scope
  // → low → Arbiter. Anchored whole-clause: a rider (Threshold / Domain / Rebound), a multi-land "up to two"
  // (Skyshroud Claim / Explosive Vegetation — "for up to two …" has no "a/an", fails the anchor), or a split
  // "to your hand … onto the battlefield" (Cultivate) all fail → low → Arbiter. Comma-unions (Farseek) are
  // honored by parseTutorFilter's Oxford-comma split; the phrase class allows the union's commas.
  const bfm = t.match(/^search your library for an? ([a-z][a-z ,]*?) cards?,?(?: reveal (?:it|that card),?)?(?: and)? put (?:it|that card) onto the battlefield( tapped)?(?:,? (?:then |and )?shuffle(?: your library)?)?\.?$/);
  if (bfm) {
    const phrase = bfm[1];
    const filter = parseTutorFilter(phrase);
    // A group fetches ONLY lands when it names "land" OR a basic land type (plains/island/swamp/mountain/forest).
    const guaranteedLand = (g) => g.includes("land") || g.some((w) => BASIC_LAND_SUBTYPES.has(w));
    // AMBIGUOUS-BASIC union → Arbiter: "a basic Forest or Island card" (Quandrix Cultivator) means basic
    // Forest or basic ISLAND — the leading "basic" distributes — but the split yields [["basic","forest"],
    // ["island"]], whose bare "island" group would over-permissively match a NONBASIC dual (Breeding Pool).
    // Modeling that distribution is a fast-follow; for now any union where "basic" appears in some-but-not-all
    // groups drops to low → Arbiter (a clean false-negative, never an illegal-target fetch — CREED).
    const someBasic = filter && filter.groups.some((g) => g.includes("basic"));
    const allBasic = filter && filter.groups.every((g) => g.includes("basic"));
    if (filter && filter.groups.every(guaranteedLand) && !(someBasic && !allBasic)) {
      return { op: "tutor", filter, filterLabel: `${phrase} card`, destination: "battlefield", entersTapped: !!bfm[2], targetType: null };
    }
    return null; // a non-land / unmodeled-filter / ambiguous-basic battlefield tutor → low → Arbiter
  }
  // RAMP-MULTI — "Search your library for UP TO N <LAND> cards, put them onto the battlefield[ tapped],
  // then shuffle." (Explosive Vegetation / Skyshroud Claim / Ranger's Path / Migration Path / Nissa's
  // Expedition at N=2; WAVE-2b UP-TO-N adds N=3..5 — Nissa's Renewal / Seedguide Ash / Horizon Boughs
  // "up to three basic land cards"). Modeled as a tutor fetching UP TO N matching lands (`remaining:N`) —
  // the resolver chains a single-pick from the still-legal candidates per fetch (the driver loop drains it:
  // AI auto-picks all, a human gets N pickers), entering each land the same way, shuffling once at the end.
  // Same LAND-guard + ambiguous-basic guard as RAMP-1/RAMP-TYPED. A SPLIT destination (Cultivate "put one
  // onto the battlefield and the other into your hand"), a non-land fetch, or any trailing rider (Hour of
  // Promise "Then if you control three or more Deserts …" — Nissa's Renewal's "You gain 7 life" is a
  // SEPARATE sentence, split off, so it doesn't reach here) fails the exact anchor → low → Arbiter.
  const mf = t.match(/^search your library for up to (two|three|four|five) ([a-z][a-z ,]*?) cards,? put them onto the battlefield( tapped)?(?:,? (?:then |and )?shuffle(?: your library)?)?\.?$/);
  if (mf) {
    const phrase = mf[2];
    const count = UP_TO_N_WORD[mf[1]];
    const filter = parseTutorFilter(phrase);
    const guaranteedLand = (g) => g.includes("land") || g.some((w) => BASIC_LAND_SUBTYPES.has(w));
    const someBasic = filter && filter.groups.some((g) => g.includes("basic"));
    const allBasic = filter && filter.groups.every((g) => g.includes("basic"));
    if (filter && filter.groups.every(guaranteedLand) && !(someBasic && !allBasic)) {
      return { op: "tutor", filter, filterLabel: `${phrase} card`, destination: "battlefield", entersTapped: !!mf[3], remaining: count, targetType: null };
    }
    return null; // a non-land / unmodeled-filter / ambiguous-basic multi-fetch → low → Arbiter
  }
  // RAMP-SPLIT (Cultivate / Kodama's Reach) — "Search your library for up to two <LAND> cards, reveal those
  // cards, put one onto the battlefield tapped and the other into your hand, then shuffle." TWO fetches with
  // DIFFERENT destinations: an ORDERED destinations sequence (first -> battlefield tapped, second -> hand) that
  // resolveTutorChoice consumes per chained pick. A found-only-one takes the head (battlefield tapped) — exactly
  // the Cultivate/Kodama rulings (CR 701.23b: a search may find fewer; CR 701.24b: put the found cards, then
  // shuffle). Same LAND-guard + ambiguous-basic guard as RAMP-1/RAMP-MULTI. "up to two" + the literal split
  // phrasing ONLY — the bare both-to-battlefield "up to two" is RAMP-MULTI above; "up to three" or a trailing
  // rider fails this anchor → low → Arbiter.
  const spm = t.match(/^search your library for up to two ([a-z][a-z ,]*?) cards,? reveal those cards,? put one onto the battlefield( tapped)? and the other into your hand(?:,? (?:then |and )?shuffle(?: your library)?)?\.?$/);
  if (spm) {
    const phrase = spm[1];
    const filter = parseTutorFilter(phrase);
    const guaranteedLand = (g) => g.includes("land") || g.some((w) => BASIC_LAND_SUBTYPES.has(w));
    const someBasic = filter && filter.groups.some((g) => g.includes("basic"));
    const allBasic = filter && filter.groups.every((g) => g.includes("basic"));
    if (filter && filter.groups.every(guaranteedLand) && !(someBasic && !allBasic)) {
      return {
        op: "tutor", filter, filterLabel: `${phrase} card`, remaining: 2,
        destinations: [{ zone: "battlefield", tapped: !!spm[2] }, { zone: "hand" }],
        targetType: null,
      };
    }
    return null; // a non-land / unmodeled-filter / ambiguous-basic split-fetch → low → Arbiter
  }
  // LAND-FROM-HAND (Growth Spiral "Draw a card. You may put a land card from your hand onto the
  // battlefield." — the draw is a separate clause). A controller-scoped optional land drop sourced from the
  // HAND (not the library), entering UNTAPPED, no shuffle. Reuses the tutor pending-choice seam via
  // `sourceZone:"hand"` — applyTutor gathers the hand lands, the driver surfaces the same picker / auto-picks,
  // resolveTutorChoice moves hand→battlefield. LANDS ONLY (the literal "land" type — duals/utility included;
  // it bypasses the land-per-turn limit, CR — it's "put", not "play"). The "you may" is inherent (the tutor
  // allows declining → put nothing); a MANDATORY "Put a land …" maps to the same atom (declining a forced put
  // with no land in hand is a clean no-op). NOT a library search (that's the RAMP-1 path above).
  const lfh = t.match(/^(?:you may )?put a land card from your hand onto the battlefield( tapped)?\.?$/);
  if (lfh) {
    return { op: "tutor", sourceZone: "hand", filter: { groups: [["land"]] }, filterLabel: "land card from your hand", destination: "battlefield", entersTapped: !!lfh[1], targetType: null };
  }
  // DISCOVER (LCI, CR 701.x) — "Discover N": exile cards from the top until a NONLAND with mana value <= N
  // is exiled, then cast it FREE or put it into your hand (the rest to the bottom in a random order).
  // Resolved by applyDiscoverAtom + the action-layer cast-free/to-hand decision (legalChoices reuses the
  // cast machinery, so targeting / AI / the stack all behave like a normal cast). FIXED numeric N only;
  // "discover X, where X is …" (Pantlaza / Hurl into History — a count-scaled X) is a count-source
  // follow-up → stays low → Arbiter for now.
  const dsc = t.match(/^discover (\d+)$/);
  if (dsc) return { op: "discover", amount: parseInt(dsc[1], 10), targetType: null };
  // PANTLAZA — "discover X, where X is that creature's toughness": X is the TRIGGERING creature's (the
  // entering Dinosaur's) layer-resolved toughness, read at resolution from ctx.triggeringPermanentId (the
  // trigger path threads it). Only meaningful inside the Dino-ETB trigger; applyDiscoverAtom computes X.
  if (/^discover x, where x is that creature's toughness$/.test(t)) return { op: "discover", amountToughnessOfTrigger: true, targetType: null };
  // A standalone "[then] shuffle [your library]" clause (some cards put it in its own
  // sentence after the search) — shuffles the controller's library (CR 103.2).
  if (/^(?:then |and )?shuffle(?: your library)?$/.test(t)) return { op: "shuffle", targetType: null };
  let m = t.match(/^(?:you )?gain (\d+) life$/);
  if (m) return { op: "gain-life", amount: parseInt(m[1], 10), targetType: null };
  m = t.match(/^(?:you )?lose (\d+) life$/);
  if (m) return { op: "lose-life", amount: parseInt(m[1], 10), who: "controller", targetType: null };
  m = t.match(/^each opponent loses (\d+) life$/);
  if (m) return { op: "lose-life", amount: parseInt(m[1], 10), who: "eachOpponent", targetType: null };
  // DEATH-DRAIN-TARGETED — "target player/opponent loses N life" (Blood Artist, Falkenrath Noble, Vengeful
  // Bloodwitch, the aristocrats single-target drain). Like targeted DAMAGE (atomTargetIntent → "enemy"), a
  // life-LOSS aimed at a target is never self-directed — draining yourself is strictly bad — so the trigger-
  // flush chooser always picks an opponent (no self-drain hazard). who:"target" + a chosen player targetType
  // so the cast path enumerates a player target and the resolver reads it from ctx.targets (mirrors the
  // targeted-draw atom). Numeric N only; a "for each"/scaled/rider variant fails the `$` anchor → Arbiter.
  m = t.match(/^target (player|opponent) loses (\d+) life$/);
  if (m) return { op: "lose-life", amount: parseInt(m[2], 10), who: "target", targetType: m[1] };
  // ===== EACH-PLAYER ===== (EP-3) symmetric life loss — "Each player loses N life" (Crushing
  // Disappointment, Bad Deal). NON-targeted (who:eachPlayer, no targetType), so it resolves the same
  // on a spell or a trigger — no first-legal self-target hazard. A "for each …" rider (Stronghold
  // Discipline) or any trailing text fails the `$` anchor → low → Arbiter. Numeric N only.
  m = t.match(/^each player loses (\d+) life$/);
  if (m) return { op: "lose-life", amount: parseInt(m[1], 10), who: "eachPlayer", targetType: null };
  // Counter target spell (P3.1, CR 701.5a) — targets a SPELL on the stack, not a
  // permanent/player. Anchored ALLOWLIST: a tax/conditional/modal-target counter
  // ("…unless its controller pays {3}", "…or ability", "…up to two target spells",
  // "…with mana value 3 or less", "Counter target creature or planeswalker spell")
  // all fail the exact anchor → low → Arbiter, so a counter we can't faithfully model
  // is never confidently wrong. spellFilter is checked against the target's type line
  // at enumeration + resolution.
  if (/^counter target spell$/.test(t)) return { op: "counter", spellFilter: "any", targetType: "spell" };
  if (/^counter target noncreature spell$/.test(t)) return { op: "counter", spellFilter: "noncreature", targetType: "spell" };
  if (/^counter target creature spell$/.test(t)) return { op: "counter", spellFilter: "creature", targetType: "spell" };
  // SOFT-COUNTER-RIDER — Swan Song's 3-way spell-type filter "enchantment, instant, or sorcery spell". The
  // filter is checked at enumeration (spellMatchesCounterFilter) + resolution (counterFilterMatches); both
  // gained the matching case. A different list / order / 2-way subset fails the exact anchor → low → Arbiter.
  if (/^counter target enchantment, instant, or sorcery spell$/.test(t)) return { op: "counter", spellFilter: "enchantmentInstantSorcery", targetType: "spell" };
  // CNT-MV-EXACT (WAVE 2b) — "Counter target spell with mana value N" (Mental Misstep N=1, Spell Snare N=2).
  // EXACT equality on the target spell's mana value (CR 701.5a + 202.3) — NOT "or less"/"or greater". The
  // anchored "$" rejects the inequality variants (Disdainful Stroke "4 or greater", Thoughtbind "4 or less",
  // Minor Misstep "1 or less"), which must stay low → Arbiter (a different comparison would be a confidently-
  // wrong counter). `exactMv` is checked at enumeration (spellMatchesCounterFilter) + resolution
  // (counterFilterMatches); the spellFilter stays "any" (no type restriction layered on the MV test).
  {
    const mv = /^counter target spell with mana value (\d+)$/.exec(t);
    if (mv) return { op: "counter", spellFilter: "any", targetType: "spell", exactMv: parseInt(mv[1], 10) };
  }
  // CNT-ACP (WAVE 2b) — "Counter target artifact, creature, or planeswalker spell" (Strix Serenade's lead;
  // it then carries the Swan-Song-style "Its controller creates a 2/2 Bird" rider via matchCounterController-
  // Rider, so this lead parse must succeed for that card to flip native). The 3-way union reads the FRONT-FACE
  // type only (CR 712.4a — counterFilterMatches/spellMatchesCounterFilter split " // "). A different list /
  // order / 2-way subset fails the exact anchor → low → Arbiter (no existing filter is loosened).
  if (/^counter target artifact, creature, or planeswalker spell$/.test(t)) return { op: "counter", spellFilter: "artifactCreaturePlaneswalker", targetType: "spell" };
  // SOFT-CNT — a "soft" counter: "Counter target [noncreature|creature] spell unless its controller pays
  // {N}." (Force Spike / Mana Leak / Mana Tithe / Spell Pierce / Stubborn Denial / Daze / Quench / …).
  // Extends the hard-counter atom with an `unlessPay` FIXED-generic escape resolved at counter resolution:
  // the targeted spell's controller pays {N} to save it, else it's countered (the pay-decision rides the
  // pending-choice seam). ANCHORED to a FIXED {N} only — an {X} tax (Clash of Wills, Syncopate), a variable
  // tax ("plus an additional {2} for each …", Rune Snag), a non-mana cost ("exiles their graveyard", "pays
  // {1} and 1 life"), a rider ("Draw a card", "If you control a Wizard …"), a modal "•" bullet, or a
  // "creature or planeswalker" / "instant or sorcery" filter all leave residue → fail the anchor → low →
  // Arbiter (CLAUDE.md §1.2, never a confidently-wrong partial). The {N} is generic, mirroring the cast path.
  {
    const sc = /^counter target (noncreature |creature )?spell unless its controller pays \{(\d+)\}$/.exec(t);
    if (sc) return { op: "counter", spellFilter: sc[1] ? sc[1].trim() : "any", targetType: "spell", unlessPay: parseInt(sc[2], 10) };
  }
  // SOFT-CNT-X (WAVE 2b) — the {X} soft counter: "Counter target [noncreature|creature] spell unless its
  // controller pays {X}." (Clash of Wills, Syncopate's family). The {X} here is the COUNTERSPELL'S own cast
  // {X} (Clash of Wills's mana cost is {X}{U}), bound at the counter's resolution from ctx.xValue — applyCounter
  // computes the generic tax = max(0, ctx.xValue) and routes the SAME pay-or-be-countered pending-choice as
  // the fixed soft counter. The literal "{x}" in the text only appears on cards whose own cost carries X, so
  // it's its own gate; the resolver floors at 0 (CR 107.3, an X=0 demand the controller trivially "pays").
  // ANCHORED to a bare "{x}" with no rider — an "{X} and you gain X life", a "{X}, where X is …", a non-mana
  // additional cost, or a modal bullet all leave residue → fail the anchor → low → Arbiter. Storm (Flusterstorm)
  // rides on the card's keyword text, NOT this clause, so it's never half-modeled by a copy fabrication.
  {
    const scx = /^counter target (noncreature |creature )?spell unless its controller pays \{x\}$/.exec(t);
    // `countX:true` marks this as an X-spell ONLY so the cast path (parser xSpell + legalChoices X-cast branch)
    // enumerates affordable X values and threads the chosen X into ctx.xValue. The counter resolver ignores
    // countX (it reads ctx.xValue for unlessPayX); no count-of-X tokens are created. Without this the spell
    // would resolve at X=0 (a free pass the controller always "pays") — a confidently-wrong always-survives.
    if (scx) return { op: "counter", spellFilter: scx[1] ? scx[1].trim() : "any", targetType: "spell", unlessPayX: true, countX: true };
  }
  // Graveyard recursion (CR 608) — "Return target <X> card from your graveyard to your hand" (Raise Dead,
  // Regrowth, Eternal Witness's ETB, Argivian Find…). The target is a CARD in the CASTER'S OWN graveyard
  // (a PUBLIC zone), chosen at cast time like any target — so it flows through the normal cast-time target
  // enumeration, NO resolution-time picker. REG-1: the card-type filter <X> is parsed by parseGraveyardFilter
  // — a single basic type, an " or "-union, "permanent", or unfiltered "card" (any) is modeled; a subtype /
  // color / negation / intersection / "historic" → null → low. The exact "$" anchor still rejects multi-card
  // ("up to two", plural "cards"), another zone ("from a graveyard"), and any trailing rider. The "to your
  // hand" destination = return-from-graveyard; "to the battlefield" = β-3b reanimation (enters + fires ETB).
  {
    const gm = /^return target (.*?)card from your graveyard to your hand$/.exec(t);
    if (gm) {
      const cardFilter = parseGraveyardFilter(gm[1]);
      if (cardFilter) return { op: "return-from-graveyard", targetType: "graveyardCard", cardFilter };
    }
  }
  // β-3b reanimation — "Return target creature card from your graveyard to the battlefield" (Resurrection,
  // Zombify, Breath of Life). CREATURE only; "the battlefield under your control" / "tapped" / "with a
  // +1/+1 counter" / a non-creature card filter fails the exact anchor → low → Arbiter.
  if (/^return target creature card from your graveyard to the battlefield$/.test(t)) return { op: "reanimate", targetType: "graveyardCard", cardFilter: "creature" };
  // TAP-TARGET-CREATURE — "tap target creature [restriction]" (Fiend Binder, Captivating Unicorn,
  // Court Street Denizen, Kor Line-Slinger, Storm Front, Dromoka Dunecaster, …). Standard controller
  // qualifiers (an opponent controls / defending player controls / you don't control → opponent;
  // you control → own), power/toughness/mana-value numeric restrictions, and flying presence/absence.
  // Anchored to $ so "tap target creature, then return…" (Cyclopean Snare's bounce rider) and
  // "unless its controller pays…" (Vectis Dominator / Rhystic Deluge) fall through → low → Arbiter.
  // "defending player controls" maps to controller:opponent — in practice the defending player is
  // always an opponent; this is a conservative false-negative rather than an enemy mis-tap (safe).
  {
    const tapM = t.match(/^tap target creature(?:\s+(an opponent controls|defending player controls|you don't control|you control|with power (\d+) or less|with power (\d+) or (?:greater|more)|with toughness (\d+) or less|with mana value (\d+) or (?:greater|more)|without flying|with flying))?\.?$/);
    if (tapM) {
      const qual = tapM[1];
      const restrictions = [];
      if (qual === "an opponent controls" || qual === "defending player controls" || qual === "you don't control")
        restrictions.push({ kind: "controller", who: "opponent" });
      else if (qual === "you control")
        restrictions.push({ kind: "controller", who: "you" });
      else if (tapM[2]) restrictions.push({ kind: "power", op: "<=", value: parseInt(tapM[2], 10) });
      else if (tapM[3]) restrictions.push({ kind: "power", op: ">=", value: parseInt(tapM[3], 10) });
      else if (tapM[4]) restrictions.push({ kind: "toughness", op: "<=", value: parseInt(tapM[4], 10) });
      else if (tapM[5]) restrictions.push({ kind: "manaValue", op: ">=", value: parseInt(tapM[5], 10) });
      else if (qual === "without flying") restrictions.push({ kind: "hasKeyword", keyword: "flying", negate: true });
      else if (qual === "with flying") restrictions.push({ kind: "hasKeyword", keyword: "flying", negate: false });
      // qual undefined → bare "tap target creature" → no restrictions (any creature)
      return { op: "tap", targetType: "creature", restrictions };
    }
  }
  if (/^untap target creature$/.test(t)) return { op: "untap", targetType: "creature" };
  if (/^return target creature to its owner's hand$/.test(t)) return { op: "bounce", targetType: "creature" };
  if (/^exile target creature$/.test(t)) return { op: "exile", targetType: "creature" };
  // β-3 — bounce a NON-creature permanent ("Return target permanent / nonland permanent / artifact …
  // to its owner's hand" — Boomerang, Eye of Nowhere, Void Snare). The bounce resolver (applyZoneMove)
  // already handles a "permanent" target and the enumerator already offers the #192 permanent types;
  // a controller restriction composes exactly like the destroy/exile path. A rider/filter → low → Arbiter.
  const bp = t.match(/^return target (nonland permanent|permanent|artifact|enchantment|land)(?: (an opponent controls|you don't control|you control))? to its owner's hand$/);
  if (bp) {
    const TT = { "permanent": "permanent", "nonland permanent": "nonlandPermanent", "artifact": "artifact", "enchantment": "enchantment", "land": "land" };
    const restrictions = bp[2] ? [{ kind: "controller", who: /^you control$/.test(bp[2]) ? "you" : "opponent" }] : [];
    return { op: "bounce", targetType: TT[bp[1]], restrictions };
  }
  // TUCK-1 — bounce-to-library ("put target <perm> on top / the bottom of its owner's library" — Time
  // Ebb, Griptide, Excommunicate, Temporal Spring, Totally Lost, Temporal Eddy, Run Aground). A removal
  // that mirrors the bounce op with a library destination; the destination (top|bottom) rides on the
  // atom and the resolver prepends (top) or appends (bottom) via moveCardToZone's toTop flag. Same
  // target-type map + enumerator as destroy/bounce (creature / permanent / nonland permanent / the
  // already-modeled 2-way unions). A creature RESTRICTION ("with power 4 or greater" / "with flying" /
  // "attacking"), a 3-way union, a positional "Nth from the top", or any rider fails the exact anchor →
  // low → Arbiter (a clean false-negative; restriction + 3-way are a fast-follow).
  const tk = t.match(/^put target (creature or land|artifact or creature|nonland permanent|creature|permanent) on (top|the bottom) of its owner's library$/);
  if (tk) {
    const TT = { "creature": "creature", "permanent": "permanent", "nonland permanent": "nonlandPermanent", "creature or land": "creatureOrLand", "artifact or creature": "creatureOrArtifact" };
    return { op: "tuck", targetType: TT[tk[1]], where: tk[2] === "top" ? "top" : "bottom" };
  }
  // Targeted NON-CREATURE permanent removal (Disenchant / Naturalize / Stone Rain / "Destroy
  // target permanent"). CREATURE removal keeps its dedicated path (the richer creature-restriction
  // parser); this covers artifact / enchantment / land / permanent / nonland permanent / "artifact
  // or enchantment", with the SAME 3 controller restrictions the creature path models, enforced at
  // enumeration. A different filter ("artifact creature", "tapped artifact"), a non-controller
  // restriction, or a rider (a 2nd clause — Beast Within's "Its controller creates …") fails the
  // exact anchor → low → Arbiter. The new targetType is gated OUT of the trigger flush
  // (programContainsChosenPermanentRemoval) — first-legal could hit the controller's OWN permanent,
  // a forbidden mis-application; safe on the cast path where the player/AI choose the target.
  // β-2 adds the compound permanent-TYPE UNIONS ("X or Y", both already-modeled permanent types) to the
  // alternation — listed BEFORE the singles so the longer phrase wins. PW-7: planeswalkers are now
  // targetable, so "creature or planeswalker" / "planeswalker" are admitted (Hero's Downfall, Vraska's
  // Contempt, Murderous Rider…), enumerated via addPlaneswalkers.
  const rm = t.match(/^(destroy|exile) target (artifact or enchantment|creature or enchantment|creature or land|creature or artifact|creature or planeswalker|artifact or land|enchantment or land|nonland permanent|artifact|enchantment|land|permanent|planeswalker)(?: (an opponent controls|you don't control|you control))?$/);
  if (rm) {
    const TT = {
      "artifact": "artifact", "enchantment": "enchantment", "land": "land", "permanent": "permanent",
      "nonland permanent": "nonlandPermanent", "artifact or enchantment": "artifactOrEnchantment",
      "creature or enchantment": "creatureOrEnchantment", "creature or land": "creatureOrLand",
      "creature or artifact": "creatureOrArtifact", "artifact or land": "artifactOrLand",
      "enchantment or land": "enchantmentOrLand",
      "creature or planeswalker": "creatureOrPlaneswalker", "planeswalker": "planeswalker", // PW-7
    };
    const restrictions = rm[3] ? [{ kind: "controller", who: /^you control$/.test(rm[3]) ? "you" : "opponent" }] : [];
    return { op: rm[1] === "destroy" ? "destroy" : "exile", targetType: TT[rm[2]], restrictions };
  }
  // ETB-EQUIP-ATTACH — "attach it to target creature you control" (Living-Weapon-style auto-attach on an
  // Equipment's ETB trigger — Bramble Armor, Scavenged Blade, Maul of the Skyclaves). "it" is the SOURCE
  // Equipment (bound at resolution via ctx.sourceId), so the only chosen target is the host creature,
  // enumerated with the controller:you restriction. The equipped-creature static bonus is already modeled
  // (parseAttachedBonus), so the whole card lights up. The exact anchor rejects a rider ("That creature
  // gains <KW> until end of turn", a 2nd clause) → low → Arbiter (CLAUDE.md §1.2, never a partial).
  if (/^attach it to target creature you control$/.test(t)) {
    return { op: "self-attach", targetType: "creature", restrictions: [{ kind: "controller", who: "you" }] };
  }
  // Combat-trick pump + keyword grant: "target creature gets +N/+N and gains KW[, KW][ and KW]
  // until end of turn" — a layer-7c P/T bump AND layer-6 keyword grant(s), both endOfTurn. The
  // granted keywords must ALL be in the enforced+layer-aware GRANTABLE set (parseGrantedKeywords),
  // else the whole clause is unmodeled → low → Arbiter (no fake/partial grant).
  let pg = t.match(/^target creature gets ([+-]\d+)\/([+-]\d+) and gains (.+) until end of turn$/);
  if (pg) {
    const kws = parseGrantedKeywords(pg[3]);
    return kws ? { op: "pump", targetType: "creature", ptDelta: { p: parseInt(pg[1], 10), t: parseInt(pg[2], 10) }, grantKeywords: kws } : null;
  }
  // Pure keyword grant (no P/T): "target creature gains KW[ and KW] until end of turn".
  pg = t.match(/^target creature gains (.+) until end of turn$/);
  if (pg) {
    const kws = parseGrantedKeywords(pg[1]);
    return kws ? { op: "pump", targetType: "creature", ptDelta: { p: 0, t: 0 }, grantKeywords: kws } : null;
  }
  // PUMP-TGT-CTRL — "target creature you control / an opponent controls gets +N/+N [and gains KW]
  // until end of turn" / "gains KW until end of turn". Encodes the controller restriction using the
  // existing P2.4 restriction-array format ({ kind:"controller", who:"you"|"opponent" }), honored by
  // enumerateTargets so only the controller's own creatures (or opponents') are legal targets.
  // All-or-nothing anchored: an un-grantable keyword still drops the whole clause → low → Arbiter.
  let pctrl = t.match(/^target creature (you control|an opponent controls) gets ([+-]\d+)\/([+-]\d+)(?: and gains (.+))? until end of turn$/);
  if (pctrl) {
    const who = pctrl[1] === "you control" ? "you" : "opponent";
    const kws = pctrl[4] ? parseGrantedKeywords(pctrl[4]) : null;
    if (pctrl[4] && !kws) return null; // un-grantable keyword → low → Arbiter
    return { op: "pump", targetType: "creature", restrictions: [{ kind: "controller", who }], ptDelta: { p: parseInt(pctrl[2], 10), t: parseInt(pctrl[3], 10) }, ...(kws ? { grantKeywords: kws } : {}) };
  }
  pctrl = t.match(/^target creature (you control|an opponent controls) gains (.+) until end of turn$/);
  if (pctrl) {
    const who = pctrl[1] === "you control" ? "you" : "opponent";
    const kws = parseGrantedKeywords(pctrl[2]);
    return kws ? { op: "pump", targetType: "creature", restrictions: [{ kind: "controller", who }], ptDelta: { p: 0, t: 0 }, grantKeywords: kws } : null;
  }
  // ===== WALT-ANIMATE ===== "[Until end of turn,] target land becomes a N/N [subtype] creature [with
  // KW[ and KW]]" (Animate Land, Hydroform, Vivify; the "still a land" reminder already stripped above).
  // Modeled as layer-4 type-ADD (Creature + optional subtype) + layer-7b P/T-SET + layer-6 keyword grants,
  // all until end of turn (applyAnimateEffect). "becomes a creature" is additive by default — the land
  // stays a land (0 non-additive land-animates in the corpus) — so the additive layer-4 is always correct.
  // REQUIRES until-end-of-turn (prefix or suffix); a PERMANENT animate, a color-set ("becomes a black
  // creature"), a counter-scaled 0/0, or an un-grantable keyword fails the anchor → low → Arbiter. A "must
  // be blocked this turn if able" (Lure) rider lives in its OWN sentence → unparsed clause → low (a
  // half-modeled native is forbidden; the whole card routes to the Arbiter instead).
  const anm = t.match(/^(until end of turn, )?target land becomes a (\d+)\/(\d+)(?: ([a-z]+))? creature(?: with ([a-z, ]+?))?(?: in addition to its other types)?( until end of turn)?$/);
  if (anm) {
    if (!anm[1] && !anm[6]) return null;  // a PERMANENT animate (no until-end-of-turn) is not modeled → Arbiter
    const COLOR_WORDS = new Set(["white", "blue", "black", "red", "green", "colorless", "multicolored"]);
    if (anm[4] && COLOR_WORDS.has(anm[4])) return null;  // "becomes a black creature" SETS color (layer 5) — not modeled → Arbiter
    const grantKeywords = anm[5] ? parseGrantedKeywords(anm[5]) : [];
    if (anm[5] && !grantKeywords) return null;  // an un-grantable rider keyword drops the whole clause → Arbiter
    const subtypes = anm[4] ? [anm[4].charAt(0).toUpperCase() + anm[4].slice(1)] : [];
    return { op: "animate", targetType: "land", power: parseInt(anm[2], 10), toughness: parseInt(anm[3], 10), subtypes, grantKeywords, duration: "endOfTurn" };
  }
  // ===== WALT-ANIMATE PR3 ===== MAN-LAND self-animate: a land's ACTIVATED ability animates ITSELF
  // ("{1}: This land becomes a 3/3 green Ape creature with trample until end of turn" — Treetop Village,
  // Faerie Conclave, the Restless cycle, …). Self-reference ("this land" = the source, resolved via
  // ctx.sourceId → target:"self"). The middle between "N/N" and "creature" is the set color(s) (layer 5),
  // creature subtype(s) (layer 4), and an added card type like artifact (layer 4). Routes to LOW → Arbiter:
  // a non-grantable keyword (menace/infect), "with all creature types" (changeling — Mutavault), a "can't
  // be blocked"/Lure rider (its own sentence → unparsed clause — Creeping Tar Pit), or any middle token
  // that isn't a color / artifact / plain subtype word. REQUIRES until-end-of-turn (the modeled subset).
  const anmSelf = t.match(/^(until end of turn, )?this land becomes a (\d+)\/(\d+) (.*?)creature(?: with ([a-z, ]+?))?(?: in addition to its other types)?( until end of turn)?$/);
  if (anmSelf) {
    if (!anmSelf[1] && !anmSelf[6]) return null;  // a PERMANENT animate (no until-end-of-turn) → Arbiter
    const COLOR_MAP = { white: "W", blue: "U", black: "B", red: "R", green: "G" };
    const capHyphen = (w) => w.split("-").map(p => p.charAt(0).toUpperCase() + p.slice(1)).join("-");
    const colors = [], subtypes = [], cardTypes = [];
    let ok = true;
    for (const w of (anmSelf[4] || "").trim().split(/\s+/).filter(x => x && x !== "and")) {
      if (COLOR_MAP[w]) colors.push(COLOR_MAP[w]);
      else if (w === "artifact" || w === "enchantment") cardTypes.push(capHyphen(w));
      else if (/^[a-z][a-z-]*$/.test(w)) subtypes.push(capHyphen(w));  // a creature subtype (Ape / Faerie / Assembly-Worker)
      else { ok = false; break; }  // an unrecognized middle token — don't risk a mis-model → Arbiter
    }
    if (!ok) return null;
    const grantKeywords = anmSelf[5] ? parseGrantedKeywords(anmSelf[5]) : [];
    if (anmSelf[5] && !grantKeywords) return null;  // un-grantable rider (menace/infect/"all creature types") → Arbiter
    return { op: "animate", target: "self", power: parseInt(anmSelf[2], 10), toughness: parseInt(anmSelf[3], 10), colors, subtypes, cardTypes, grantKeywords, duration: "endOfTurn" };
  }
  // MASS effects (board wipes) — UNFILTERED "all creatures" only. Resolve to the SAME atoms
  // with the `eachCreature` scope (no chosen target; programNeedsChosenTarget excludes it),
  // so they hit every creature on every battlefield. A FILTERED wipe ("all creatures with
  // flying", "all creatures you don't control", "all non-Dragon creatures") fails the exact
  // anchor → low → Arbiter, since `eachCreature` would wrongly hit the unfiltered set. The
  // "they can't be regenerated" rider was already stripped from `t` (MTG-001); the parseEffectClause
  // wrapper re-stamps `cannotRegenerate` on this destroy atom so the rider is still honored.
  if (/^destroy all creatures$/.test(t)) return { op: "destroy", targetType: "eachCreature" };
  if (/^exile all creatures$/.test(t)) return { op: "exile", targetType: "eachCreature" };
  // MASS-NC — the UNFILTERED non-creature board wipes ("Destroy all artifacts / enchantments / lands /
  // artifacts and enchantments" — Shatterstorm, Tranquility, Armageddon, Creeping Corrosion, Back to
  // Nature). Same shape as the creature wipe, a typed mass scope: the resolver enumerates every permanent
  // of that type on every battlefield and routes it through the generic applyDestroyEffect (indestructible
  // honored; an artifact/enchantment CREATURE still dies + fires its dies-triggers). A FILTERED wipe ("all
  // nonbasic lands", "all artifacts you control", "all enchantments with mana value 3 or less") fails the
  // exact anchor → low → Arbiter — `eachArtifact`/etc. would wrongly hit the whole unfiltered set.
  m = t.match(/^destroy all (artifacts and enchantments|artifacts|enchantments|lands)$/);
  if (m) {
    const TT = { "artifacts": "eachArtifact", "enchantments": "eachEnchantment", "lands": "eachLand", "artifacts and enchantments": "eachArtifactOrEnchantment" };
    return { op: "destroy", targetType: TT[m[1]] };
  }
  m = t.match(/^(?:all creatures|each creature) gets? ([+-]\d+)\/([+-]\d+) until end of turn$/);
  if (m) return { op: "pump", targetType: "eachCreature", ptDelta: { p: parseInt(m[1], 10), t: parseInt(m[2], 10) } };
  // TEAM pump — "Creatures you control get +N/+N [and gain KW[, KW][ and KW]] until end of turn"
  // (Trumpet Blast, Inspired Charge, Overrun). A controller-scoped one-shot: it pumps EXACTLY the
  // creatures the caster controls AS IT RESOLVES (CR 611.2c — the set is locked when the effect
  // begins, NOT continuously re-evaluated like a static anthem). Modeled with the `scope:"youControl"`
  // marker (NOT a targetType — it's non-targeted, so it stays non-targeted across every
  // targetType-keyed path: programNeedsChosenTarget, atomTargetSpec, legalChoices). The resolver
  // (effectAtoms.applyPumpEffect) locks in the controller's creature ids and adds one fixed
  // layer-7c P/T effect (+ layer-6 keyword grant) per creature — reusing the combat-trick pump
  // loop verbatim. A FILTERED team pump ("creatures you control with flying", "other creatures you
  // control") fails the exact anchor → low → Arbiter (scope:youControl would hit the wrong set).
  let tp = t.match(/^creatures you control get ([+-]\d+)\/([+-]\d+) and gain (.+) until end of turn$/);
  if (tp) {
    const kws = parseGrantedKeywords(tp[3]);
    return kws ? { op: "pump", scope: "youControl", ptDelta: { p: parseInt(tp[1], 10), t: parseInt(tp[2], 10) }, grantKeywords: kws } : null;
  }
  tp = t.match(/^creatures you control get ([+-]\d+)\/([+-]\d+) until end of turn$/);
  if (tp) return { op: "pump", scope: "youControl", ptDelta: { p: parseInt(tp[1], 10), t: parseInt(tp[2], 10) } };
  // ===== OVERRUN-X ===== count-scaled team pump — "[Until end of turn,] creatures you control gain KW[ and
  // KW] and get +X/+X[ until end of turn], where X is <count source>." (Overwhelming Stampede — greatest
  // power; Craterhoof Behemoth's ETB clause — number of creatures). Same controller-scoped one-shot as the
  // numeric Overrun team pump (scope:"youControl", set locked at resolution, CR 611.2c), but the +X/+X delta
  // is a BOARD COUNT computed at resolution (`ptDeltaCount`, via parseCountSource + countForSpec), NOT a
  // printed number. The keyword(s) must be GRANTABLE (parseGrantedKeywords) AND the count source modeled,
  // else → low → Arbiter (never a half-scaled native). EOT prefix or suffix both fold to the endOfTurn
  // duration applyPumpEffect already applies.
  let ox = t.match(/^(?:until end of turn, )?creatures you control gain (.+?) and get \+x\/\+x(?: until end of turn)?, where x is (.+?)$/);
  if (ox) {
    const kws = parseGrantedKeywords(ox[1]);
    const countSpec = parseCountSource(ox[2].replace(/^the /, "").replace(/^number of /, ""));
    return (kws && countSpec) ? { op: "pump", scope: "youControl", ptDeltaCount: countSpec, grantKeywords: kws } : null;
  }
  // SELF-reference pump (trigger / activated vocabulary) — "this creature gets +N/+N until end of
  // turn" refers to the ability's SOURCE (CR 113.7 — "this creature" = the source permanent). NOT
  // a chosen target (target:"self", no targetType → stays non-targeted), so it routes natively on
  // the trigger-flush + activated paths, which thread the source permanent id into ctx.sourceId.
  // A spell never produces this (its text isn't "this creature"); if a self atom somehow lacks a
  // source it resolves to a no-op, never a fabricated pump.
  m = t.match(/^this creature gets ([+-]\d+)\/([+-]\d+) until end of turn$/);
  if (m) return { op: "pump", target: "self", ptDelta: { p: parseInt(m[1], 10), t: parseInt(m[2], 10) } };
  // SELF keyword grant (+ optional P/T) — "this creature [gets +N/+N and ]gains KW[ and KW] until end of
  // turn" grants the SOURCE (CR 113.7) the keyword(s), layer-6 endOfTurn. The keyword form of the self
  // pump above; reuses the combat-trick GRANTABLE allowlist (parseGrantedKeywords — the enforced,
  // layer-aware set IS the FP guard, so an un-enforced keyword → null → low → Arbiter) + the self-pump
  // resolver path (atomTargets → selfTargets → ctx.sourceId). Used by "{cost}: this creature gains …"
  // activated abilities (ACT-KW-GRANT) and "When this attacks, this creature gains …" triggers alike.
  m = t.match(/^this creature gets ([+-]\d+)\/([+-]\d+) and gains (.+) until end of turn$/);
  if (m) {
    const kws = parseGrantedKeywords(m[3]);
    return kws ? { op: "pump", target: "self", ptDelta: { p: parseInt(m[1], 10), t: parseInt(m[2], 10) }, grantKeywords: kws } : null;
  }
  m = t.match(/^this creature gains (.+) until end of turn$/);
  if (m) {
    const kws = parseGrantedKeywords(m[1]);
    return kws ? { op: "pump", target: "self", ptDelta: { p: 0, t: 0 }, grantKeywords: kws } : null;
  }
  // SELF-BOUNCE — "return this creature to its owner's hand" (the ability source, CR 113.7). Non-targeted
  // (target:"self", no targetType): atomTargets → selfTargets → ctx.sourceId. applyZoneMove handles
  // target:"self" through atomTargets/selfTargets; the controller serves as the owner proxy (zones.js
  // line 24 — consistent with the targeted-bounce form). Never a fabricated move: if ctx.sourceId is
  // absent or the permanent left the battlefield, selfTargets returns [] → the loop is a no-op.
  if (/^return this creature to its owner's hand$/.test(t)) return { op: "bounce", target: "self" };
  // SELF-SACRIFICE — "sacrifice this creature" (the ability source). Non-targeted (target:"self").
  // applySacrifice early-exits for target:"self" via sacrificeCreatureEffect(ctx.controller, ctx.sourceId).
  // No fabrication risk: absent sourceId → sacrificeCreatureEffect early-returns a no-op log event.
  if (/^sacrifice this creature$/.test(t)) return { op: "sacrifice", target: "self" };
  m = t.match(/^put (a|an|one|two|three|four|five|\d+) ([+-]1\/[+-]1) counters? on target creature$/);
  if (m) return { op: "add-counter", counterType: m[2], amount: SMALL_NUM[m[1]] ?? parseInt(m[1], 10), targetType: "creature" };
  // COUNTER-TARGET-OWN — "put a +1/+1 counter on target creature you control" (Merfolk Skydiver, Kujar
  // Seedsculptor, Yotian Dissident, Baleful Ammit's -1/-1 ETB drawback, …). The "you control" filter
  // restricts the target to the controller's own creatures: targetType:"creatureYouControl" signals both
  // enumerateTargets (only own-side creatures offered) and atomTargetIntent (always "own", overriding the
  // counterType check so Baleful Ammit's -1/-1 form also routes natively to the controller's creature).
  m = t.match(/^put (a|an|one|two|three|four|five|\d+) ([+-]1\/[+-]1) counters? on target creature you control$/);
  if (m) return { op: "add-counter", counterType: m[2], amount: SMALL_NUM[m[1]] ?? parseInt(m[1], 10), targetType: "creatureYouControl" };
  // SELF-reference +1/+1 / -1/-1 counter — "put a +1/+1 counter on this creature" (the source).
  m = t.match(/^put (a|an|one|two|three|four|five|\d+) ([+-]1\/[+-]1) counters? on this creature$/);
  if (m) return { op: "add-counter", counterType: m[2], amount: SMALL_NUM[m[1]] ?? parseInt(m[1], 10), target: "self" };
  // ===== COUNTERS ===== OPTIONAL single target — "Put N +1/+1 (or -1/-1) counter(s) on up to one
  // target creature" (The Wandering Emperor, Basri, Scale the Heights). Identical to the modeled
  // bare-target counter (above), but the target is OPTIONAL (CR 115.1b — "up to one" → choose 0 or 1):
  // the `optionalTarget` flag tells targeting.expandAtoms to ALSO offer a no-target cast, so the spell/
  // ability stays castable with an empty board and the chooser/player can decline. (DISTINCT from the
  // α2 `optional` flag, which is a resolution-time "you may take this whole effect" yes/no — here the
  // 0-or-1 TARGET is chosen at cast/flush, CR 601.2c/603.3c, then resolved mandatorily; no yes/no.) The
  // resolver loops `ctx.targets`, so a declined cast (targets [] ) is a clean no-op — never a fabricated
  // counter. Bare unfiltered "target creature" ONLY: any filter ("…you control", "…an opponent
  // controls", a creature subtype) or the multi-target "each of up to two target creatures" leaves
  // trailing text → fails `$` → low → Arbiter. Numeric N only (no X). Intent is side-resolvable (+1/+1
  // own, -1/-1 enemy via atomTargetIntent), so it routes natively on the trigger path too.
  m = t.match(/^put (a|an|one|two|three|four|five|\d+) ([+-]1\/[+-]1) counters? on up to one target creature$/);
  if (m) return { op: "add-counter", counterType: m[2], amount: SMALL_NUM[m[1]] ?? parseInt(m[1], 10), targetType: "creature", optionalTarget: true };
  // ===== REGEN (CR 701.15) ===== "Regenerate this creature/permanent" (the SOURCE — the activated
  // "{cost}: Regenerate ~" that dominates the corpus, or a one-shot) sets up a regeneration shield; "Regenerate
  // target creature" shields the chosen creature. The shield replaces the NEXT destruction this turn
  // (gameState.destroyLethalCreatures + spellEffects.applyDestroyEffect consume it, clear damage, tap). Bare
  // anchored forms ONLY — a filtered/conditional regen ("…you control", "if …", "all creatures") fails `$` →
  // low → Arbiter, never a fabricated shield. No magnitude to get wrong: a shield is a shield.
  if (/^regenerate (?:this creature|this permanent)$/.test(t)) return { op: "regenerate", target: "self" };
  if (/^regenerate target creature$/.test(t)) return { op: "regenerate", targetType: "creature" };
  // ===== COUNTERS ===== TEAM distribution — "Put N +1/+1 (or -1/-1) counter(s) on each creature you
  // control" (Titania's Boon, Basri's Solidarity, Strength of the Pack N=2). NON-targeted, modeled with
  // the SAME `scope:"youControl"` marker the Overrun-style team pump uses (NOT a targetType — it stays
  // non-targeted across programNeedsChosenTarget / atomTargetSpec / legalChoices). The resolver's
  // `atomTargets` already routes `scope:"youControl"` -> controllerCreatureTargets (the controller's
  // creatures gathered AT RESOLUTION, CR 611.2c), and applyAddCounter reuses the single-target counter
  // loop verbatim — the -1/-1 lethal SBA included. ALL-OR-NOTHING anchored: any filter ("…you control
  // with flying", "…other than this creature", "…with a +1/+1 counter on it", "…that entered this turn")
  // or a variable "X counters" leaves trailing text -> fails `$` -> low -> Arbiter (the filtered subset
  // is a DIFFERENT set scope:youControl would wrongly buff in full). Numeric N only (no X).
  m = t.match(/^put (a|an|one|two|three|four|five|\d+) ([+-]1\/[+-]1) counters? on each creature you control$/);
  if (m) return { op: "add-counter", counterType: m[2], amount: SMALL_NUM[m[1]] ?? parseInt(m[1], 10), scope: "youControl" };
  // ===== TREASURE-MAKER ===== DYNAMIC-count named artifact tokens. The COUNT resolves AT RESOLUTION (the
  // resolver reads it via countForSpec / ctx), never baked at parse — so a board mutated between cast and
  // resolution counts correctly (Dockside). All three forms share the four-token allowlist + ETB seam with
  // the fixed-count atom; an unmodeled count source → null → low → Arbiter (never a fabricated count).
  //   (a) "create X <tok> tokens, where X is [equal to] [the number of] <count source>" — Dockside Extortionist
  //       (X = artifacts+enchantments your opponents control). countFor scopes via parseCountSource(allowScopes).
  m = t.match(/^create x (treasure|clue|food|gold) tokens,? where x is (?:equal to )?(?:the number of )?(.+)$/);
  if (m) {
    const countFor = parseCountSource(m[2], { allowScopes: true });
    return countFor ? { op: "create-named-token", token: m[1], countFor, targetType: null } : null;
  }
  //   (b) "create a/an/one <tok> token for each <count source>" — one token per source-unit (Cavern-Hoard
  //       Dragon: "a Treasure token for each artifact that player controls", who:"target" = the damaged player).
  m = t.match(/^create (?:a|an|one) (treasure|clue|food|gold) tokens? for each (.+)$/);
  if (m) {
    const countFor = parseCountSource(m[2], { allowScopes: true });
    return countFor ? { op: "create-named-token", token: m[1], countFor, targetType: null } : null;
  }
  //   (c) "create that many <tok> tokens" — the count is the triggering combat-damage amount (Old Gnawbone:
  //       "Whenever a creature you control deals combat damage to a player, create that many Treasure tokens").
  //       The combat-damage trigger ctx carries combatDamageAmount; the resolver reads ctx.countContext.
  //       "that many" with no combat-damage context resolves to 0 (a clean no-op), never a fabricated count.
  m = t.match(/^create that many (treasure|clue|food|gold) tokens$/);
  if (m) return { op: "create-named-token", token: m[1], countContext: "combatDamageAmount", targetType: null };
  // ===== DIES-TRIGGER-RESOURCE-PAYOFFS ===== "create a number of [tapped] <tok> tokens equal to its power"
  // (Goldvein Hydra: "When this creature dies, create a number of tapped Treasure tokens equal to its power").
  // The count is the dying creature's last-known power (CR 603.6e), carried as ctx.dyingPower by
  // checkDiesTriggers; the resolver reads ctx.countContext. An OPTIONAL "tapped" adjective mints the tokens
  // TAPPED (Goldvein's Treasures enter tapped). NON-dies context → no ctx.dyingPower → 0 tokens (a clean
  // no-op, never a fabricated count). Anchored to $ — any trailing rider → low → Arbiter.
  m = t.match(/^create a number of (tapped )?(treasure|clue|food|gold) tokens equal to its power$/);
  if (m) {
    const atom = { op: "create-named-token", token: m[2], countContext: "dyingPower", targetType: null };
    if (m[1]) atom.tapped = true;
    return atom;
  }
  // ===== TOKENS ===== T2 named artifact tokens — "Create [a tapped] [N] <Treasure|Clue|Food|Gold> token(s)".
  // Each enters as a REAL artifact permanent carrying its printed ability, so the existing subsystems
  // drive it end-to-end: Treasure/Gold are mana sources the mana model SACRIFICES on use (one-shot
  // any-color ramp — manaModel.manaProduction flags `sacrifices`), Clue/Food activate on the stack via
  // the γ1 self-sac activated-ability path ({2}[,{T}],Sac → draw / gain 3 life). The ALLOWLIST is exactly
  // these four: Blood (its ability needs a "Discard a card" cost we don't model), Map ("explore" + a
  // sorcery-speed target), and Powerstone (restricted "can't pay for nonartifact" mana) are LEFT OUT —
  // their cost/effect/restriction is unmodeled, so a card making them stays low → Arbiter (CREED: never
  // a token whose ability the engine would silently ignore). ===== TREASURE-MAKER ===== an OPTIONAL leading
  // "tapped" adjective ("Create a tapped Treasure token", Generous Plunderer) mints the token TAPPED (not a
  // mana source until it untaps — manaSources skips perm.tapped). Numeric/spelled N only.
  m = t.match(/^create (a|an|one|two|three|four|five|\d+) (tapped )?(treasure|clue|food|gold) tokens?$/);
  if (m) {
    const atom = { op: "create-named-token", token: m[3], count: SMALL_NUM[m[1]] ?? parseInt(m[1], 10), targetType: null };
    if (m[2]) atom.tapped = true; // only stamp the flag when present, so the untapped atom shape is unchanged
    return atom;
  }
  // ===== KWACT-INVEST ===== "Investigate" is the keyword action for "create a Clue token" (CR 701.x);
  // "Investigate N times" = N Clue tokens. Alias it to the shipped create-named-token(clue) atom (the Clue
  // enters as a real artifact with its "{2}, Sacrifice: Draw a card" ability). FIRST-PERSON ONLY: the bare
  // imperative "Investigate" is the controller investigating; a 3rd-person "<subject> investigates" (each
  // player / that player) carries a leading subject, so it fails this `^investigate` anchor → low → Arbiter
  // (never a Clue minted for the wrong player). "Investigate X times" (variable count) breaks the anchor → low.
  m = t.match(/^investigate(?: (twice|(?:two|three|four|five|six|seven|eight|nine|ten) times))?$/);
  if (m) return { op: "create-named-token", token: "clue", count: m[1] === "twice" ? 2 : (m[1] ? NUM_WORD[m[1].split(" ")[0]] : 1), targetType: null };
  // create-token (P2.6): "Create N P/T <colors> <Subtypes> creature token(s)" — a vanilla typed
  // creature token. ===== TOKENS ===== T1 extends the anchor with an OPTIONAL " with <keywords>"
  // suffix (Bird/Thopter/Angel "with flying [and vigilance]"). The keyword phrase must reduce
  // ENTIRELY to the enforced+layer-aware GRANTABLE STATIC set (parseTokenKeywords) — minted into
  // the token's real keywords[] array so hasKeyword / permanentHasKeyword honor it exactly like a
  // printed creature's. ANY other rider ("…that's tapped", "…that's an artifact", menace) fails the
  // keyword allowlist or the anchor → null → low, so nothing is silently dropped.
  // ===== TOKENS ===== T4 EXTENDS the same "with" slot to accept a QUOTED inline ability ("with
  // \"<ability>\"") — slice 1 admits only a CLEAN MANA ability (parseTokenManaAbility), stamped on the
  // minted token as `tokenOracle` so the mana model drives it like Treasure/Gold. An OPTIONAL "named
  // <Name>" before the ability is tolerated (Llanowar Mentor's "…token named Llanowar Elves with …",
  // surfaced via the "It has" → "with" rewrite in splitClauses); the cosmetic name is ignored (the
  // token's mechanical identity is type + P/T + ability, and no card references token names). A bare
  // "named <Name>" with NO ability still fails the anchor (unchanged → low), so this never silently
  // flips a named token whose name might matter.
  // ===== FOR-EACH ===== (WALT-FOREACH-TOK) "create a/an/one <P/T> <descriptor> creature token for each
  // <count source>" — ONE token per source-unit; the COUNT is a board count resolved at resolution
  // (`countFor`), reusing parseCountSource + countForSpec (Avenger of Zendikar, Garruk Primal Hunter,
  // Beacon of Creation, Saproling Symbiosis, Worm Harvest). Mints the same vanilla typed token as the
  // fixed-count path (no inline ability/keyword in scope here — a "with …" rider isn't admitted, so it
  // falls through to low). Same CREED guards: a 0-toughness token (dies to the lethal SBA) and a LAND
  // creature token (intrinsic mana dropped) route to the Arbiter; an unmodeled count source → null → low.
  const mtf = t.match(/^create (?:a|an|one) (\d+)\/(\d+) ([a-z/ ]+?) creature tokens? for each (.+)$/);
  if (mtf) {
    const toughness = parseInt(mtf[2], 10);
    if (toughness < 1) return null;
    if (/\bland\b/.test(mtf[3])) return null;
    const countFor = parseCountSource(mtf[4]);
    return countFor ? { op: "create-token", power: parseInt(mtf[1], 10), toughness, descriptor: mtf[3].trim(), countFor, targetType: null } : null;
  }
  m = t.match(/^create (a|an|one|two|three|four|five|\d+) (\d+)\/(\d+) ([a-z/ ]+?) creature tokens?(?:(?: named [a-z' ]+?)? with (.+))?$/);
  if (m) {
    const power = parseInt(m[2], 10);
    const toughness = parseInt(m[3], 10);
    // A toughness-0 token dies to the lethal SBA (CR 704.5f) the instant it enters — so a STANDALONE
    // "Create N 0/0 …" sentence is always an INCOMPLETE capture of a card that grows them (a +1/+1
    // counter / anthem rider in text the slim oracle index drops, e.g. Imaginary Friends). Route to
    // the Arbiter rather than confidently make tokens that vanish. (A 0/1 Eldrazi Spawn is fine — t≥1.)
    if (toughness < 1) return null;
    // A LAND creature token (Awaken the Woods' "Forest Dryad land creature", Khalni Garden's Plant…)
    // carries an INTRINSIC mana ability from its land type ({T}: Add …) that this vanilla mint drops —
    // so the token would silently lose its tap-for-mana. Route the whole card to the Arbiter rather than
    // mint a non-producing body (CLAUDE.md §1.2). Surfaced by the TOK-3 X-count sweep (Awaken the Woods).
    if (/\bland\b/.test(m[4])) return null;
    const base = { op: "create-token", count: SMALL_NUM[m[1]] ?? parseInt(m[1], 10), power, toughness, descriptor: m[4].trim(), targetType: null };
    if (m[5] === undefined) return base;
    // T4: a QUOTED inline ability → clean-mana-ability gate (else null → low). A non-quoted phrase →
    // the keyword path (T1). The quote disambiguates the two "with" shapes.
    if (/^["“']/.test(m[5].trim())) {
      const tokenOracle = parseTokenManaAbility(m[5]);
      return tokenOracle ? { ...base, tokenOracle } : null;
    }
    const kws = parseTokenKeywords(m[5]);
    return kws ? { ...base, keywords: kws } : null;
  }
  // Scry / surveil (CR 701.22 / 701.25) — look at the top N of YOUR library and reorder: keep any
  // on top (in any order), put the rest on the bottom (scry) or into your graveyard (surveil). A
  // resolution-time INTERACTIVE choice (the player decides; AI/Expert keep all on top) — non-
  // targeted, so it routes natively as a spell, trigger, or activated ability. Numeric N only; a
  // variable "scry X" / a modal "scry 1 or 2" leaves the anchor → low → Arbiter.
  m = t.match(/^scry (\d+)$/);
  if (m) return { op: "scry", amount: parseInt(m[1], 10), targetType: null };
  m = t.match(/^surveil (\d+)$/);
  if (m) return { op: "surveil", amount: parseInt(m[1], 10), targetType: null };
  // Mill (CR 701.13) — top N of a library to its graveyard. Non-targeted only: "you mill N" (self-
  // mill, for graveyard decks) and "each opponent mills N". "TARGET player mills N" (Glimpse the
  // Unthinkable) is deferred — a targeted mill on a TRIGGER would first-legal-target the controller
  // (mill yourself), the same hazard the counter atom gates, so we keep mill non-targeted for now.
  m = t.match(/^(?:you )?mill (\d+|a|an|one|two|three|four|five|six|seven|eight|nine|ten) cards?$/);
  if (m) return { op: "mill", amount: NUM_WORD[m[1]] ?? parseInt(m[1], 10), who: "controller", targetType: null };
  m = t.match(/^each opponent mills (\d+|a|an|one|two|three|four|five|six|seven|eight|nine|ten) cards?$/);
  if (m) return { op: "mill", amount: NUM_WORD[m[1]] ?? parseInt(m[1], 10), who: "eachOpponent", targetType: null };
  // ===== EACH-PLAYER ===== (EP-3) symmetric mill — "Each player mills N cards" (Winds of Rebuke rider,
  // Mind Funeral-adjacent). NON-targeted, so safe on a trigger. A variable "mills X cards" (Dread Summons)
  // isn't matched (no numeric/spelled N) → low → Arbiter, so an X-mill is never under-modeled to a fixed N.
  m = t.match(/^each player mills (\d+|a|an|one|two|three|four|five|six|seven|eight|nine|ten) cards?$/);
  if (m) return { op: "mill", amount: NUM_WORD[m[1]] ?? parseInt(m[1], 10), who: "eachPlayer", targetType: null };
  // ===== EACH-PLAYER ===== draw — extend the ACTOR of a draw beyond the controller. The controller-only
  // form ("draw N cards") stays on the legacy path (parseSpellEffect — "draws", a different subject, is
  // intentionally not matched there). These two add: EVERY player draws ("Each player draws N cards" —
  // Vision Skeins) and a CHOSEN player draws ("Target player draws N cards" — Opportunity, Ancestral
  // Recall, Inspiration, Overflowing Insight). Anchored ALLOWLIST: a rider ("…and loses 2 life" — Painful
  // Lesson splits, its bare "loses 2 life" stays unmodeled → low), a variable count ("draws X cards" /
  // "draws cards equal to …"), or any trailing text fails the `$` anchor → low → Arbiter. Numeric N only.
  // who:"target" carries targetType:"player" so the cast path enumerates a player target; who:"eachPlayer"
  // is non-targeted (a trigger can auto-resolve it). Discard / lose-life / mill are sibling EACH-PLAYER
  // slices; sacrifice is the Edicts builder's, never here.
  m = t.match(/^each player draws (\d+|a|an|one|two|three|four|five|six|seven|eight|nine|ten) cards?$/);
  if (m) return { op: "draw", amount: NUM_WORD[m[1]] ?? parseInt(m[1], 10), who: "eachPlayer", targetType: null };
  m = t.match(/^target player draws (\d+|a|an|one|two|three|four|five|six|seven|eight|nine|ten) cards?$/);
  if (m) return { op: "draw", amount: NUM_WORD[m[1]] ?? parseInt(m[1], 10), who: "target", targetType: "player" };
  // ===== EACH-PLAYER ===== discard (EP-2) — the DISCARDING player chooses which cards (CR 701.8), so this
  // resolves through the resolution-time pending-choice CHAIN (one single-card pick per card, per
  // discarder; the driver pauses a human discarder + auto-discards an AI's cheapest). who:"target" carries
  // targetType:"player" (the cast path enumerates a player target — Mind Rot / Fugue); who:"eachPlayer" is
  // non-targeted (Delirium Skeins). Anchored ALLOWLIST — a bare numeric count ONLY. "discards N cards at
  // random" (Hymn to Tourach — no choice, RNG), "discards X cards" (Mind Twist), "discards their hand"
  // (Wit's End — a different amount shape), "discards half the cards" (Rush of Dread), or any trailing
  // rider ("…, mills a card, and loses 1 life" — Mind Drain; "…then loses 4 life" — Strongarm Tactics)
  // fails the `$` anchor → low → Arbiter. A compound where EVERY clause is independently modeled
  // ("…discards two cards. Scry 2." — Fill with Fright) still composes HIGH via the multi-clause parser.
  m = t.match(/^target player discards (\d+|a|one|two|three|four|five|six|seven|eight|nine|ten) cards?$/);
  if (m) return { op: "discard", amount: NUM_WORD[m[1]] ?? parseInt(m[1], 10), who: "target", targetType: "player" };
  m = t.match(/^each player discards (\d+|a|one|two|three|four|five|six|seven|eight|nine|ten) cards?$/);
  if (m) return { op: "discard", amount: NUM_WORD[m[1]] ?? parseInt(m[1], 10), who: "eachPlayer", targetType: null };
  // EACHOP-DISCARD — "Each opponent discards a card" (Liliana's Specter, Burglar Rat, Cackling Fiend,
  // Noxious Toad). Non-targeted mass scope (targetType:null), parallel to "each opponent mills N" / "each
  // opponent loses N life". Route natively; the resolver walks opponentsOf via the shared discard chain.
  m = t.match(/^each opponent discards (\d+|a|one|two|three|four|five|six|seven|eight|nine|ten) cards?$/);
  if (m) return { op: "discard", amount: NUM_WORD[m[1]] ?? parseInt(m[1], 10), who: "eachOpponent", targetType: null };
  // LOOT-1 — the CONTROLLER discards (the "loot" half of draw-then-discard: Faithless Looting, Careful
  // Study, Catalog). "Discard N cards" (imperative) / "You discard N cards" = the caster discards, CHOOSING
  // which (CR 701.8 → the discard chain, who:"controller"). "Draw N cards, then discard M cards" composes
  // via the multi-clause splitter. Numeric/spelled N only; "at random" (engine-chosen, not player-chosen)
  // leaves trailing text → fails `$` → low → Arbiter. ("Discard your hand" is a different shape → low.)
  m = t.match(/^(?:you )?discard (\d+|a|one|two|three|four|five|six|seven|eight|nine|ten) cards?$/);
  if (m) return { op: "discard", amount: NUM_WORD[m[1]] ?? parseInt(m[1], 10), who: "controller", targetType: null };
  // ===== EDICTS ===== (sacrifice as an EFFECT; sacrifice as a COST is γ1/γ1b in abilities.js)
  // "Target player/opponent sacrifices a creature [of their choice]" (Diabolic Edict / Cruel Edict). The
  // SACRIFICING player — the TARGET — chooses which creature (CR 701.16; the modern Oracle templating
  // spells this out as "of their choice", an OPTIONAL suffix here so the bare form still matches), so this
  // resolves through the resolution-time pending-choice seam (applySacrifice → setPendingSacrificeChoice):
  // the human picks via a panel, an AI sacs its least valuable. `targetType` "player" offers EVERY player
  // (an edict can hit yourself, legal-but-pointless; the AI only ever edicts an opponent), "opponent"
  // offers opponents only. ALL-OR-NOTHING: exactly "a creature" (count 1, unfiltered). A count ("two
  // creatures" — Dead Drop), a FILTERED victim ("with the greatest power", "you don't control"), a
  // non-creature ("a permanent"), or a conjoined "and loses N life" (Geth's Verdict — the TARGET loses
  // the life, an actor we don't model) fails the exact anchor / all-or-nothing gate → low → Arbiter.
  m = t.match(/^target (player|opponent) sacrifices a creature(?: of (?:their|his or her) choice)?$/);
  if (m) return { op: "sacrifice", targetType: m[1] === "opponent" ? "opponent" : "player", what: "creature" };
  // ED-2 — each-player / each-opponent sacrifice (each sacrificer gives up ONE creature of their choice, CR
  // 701.16). NON-targeted (no targetType — every player / every opponent), resolved through the SAME chain
  // as the target edict (applySacrifice → advanceSacrificeChain). Non-targeted ⇒ programNeedsChosenTarget
  // false ⇒ also routes on the trigger path. Bare "a creature" ONLY: a count ("two creatures" — Barter in
  // Blood), a non-creature ("a land", "an artifact", "a permanent"), a filter / union ("creature or
  // planeswalker", "with the greatest power", "nontoken"), "all", or an X leaves trailing text → fails `$`
  // → low → Arbiter (those are NOT this slice — a wrong-victim sac would be a forbidden false positive).
  // (Controller-sac "Sacrifice a creature." is intentionally NOT modeled here: it has ~0 standalone corpus
  // yield, and the α2 "you may" wrapper would then flip "You may sacrifice a creature." HIGH through an
  // untested optional+sacrifice-chain composition — deferred to keep that pin LOW. See parser.test.js.)
  m = t.match(/^each player sacrifices a creature(?: of (?:their|his or her) choice)?$/);
  if (m) return { op: "sacrifice", who: "eachPlayer", what: "creature" };
  // "each opponent" and "each other player" are the SAME sacrificer set (every player but the controller) in
  // FFA / 1v1 — Grave Pact / Butcher of Malakir's death-edict. Both → eachOpponent (the resolver's non-self
  // each-sacrifice path). CR: "another player" / "other player" = any player who isn't you.
  m = t.match(/^each (?:opponent|other player) sacrifices a creature(?: of (?:their|his or her) choice)?$/);
  if (m) return { op: "sacrifice", who: "eachOpponent", what: "creature" };
  // ===== FOG ===== (FOG-1, CR 615 prevention) — "Prevent all combat damage that would be dealt this
  // turn" (Fog, Darkness, Holy Day, Root Snare). A turn-scoped one-shot latch: the resolver stamps the
  // turn onto state and combatResolution skips ALL combat damage that turn (CR 510.4 — both the first-
  // strike and regular steps). Non-targeted, self-expiring (keyed to the turn). ALL-OR-NOTHING anchored:
  // a FILTERED prevention ("…by creatures you don't control / by attacking creatures / with power N+",
  // "…except combat damage that…") leaves trailing text → fails `$` → low → Arbiter (the latch can't
  // honor a filter); a keyword-cost rider (Flashback / Cycling / Buyback) or a "for each" tail splits
  // into its own unmodeled clause → low. Only the bare whole-turn prevention is modeled.
  if (/^prevent all combat damage that would be dealt this turn$/.test(t)) return { op: "fog", targetType: null };
  // ===== DIVIDE ===== (MT-1) — "<name> deals N damage divided as you choose among any number of target
  // <creatures and/or players | creatures | targets | players>" (Boulderfall, Mythos of Vadrok, Meteor
  // Swarm). NOT cast-time-targeted (the cartesian "any number of targets × division" would explode the
  // action list — see targeting.js): NO `targetType`, so it routes as a non-targeted spell and the DIVISION
  // (which targets get how much) is a RESOLUTION-time pending-choice (the controller assigns; the AI/Expert
  // auto-distributes — runProgram.autoPickDivideDistribution). `group` is the legal target set. The card-name
  // prefix is tolerated like the legacy loose damage parse. Numeric N only here (an {X} divide is a fast-
  // follow); a bounded "one or two targets" (Electrolyze) or a rider both leave the `$` anchor → low.
  // NOTE: `divide-damage` is intentionally NOT yet in effectAtoms.ATOM_RESOLVERS — until the resolver +
  // picker + driver + UI all land, KNOWN.has("divide-damage") is false, so this atom is DROPPED → the card
  // stays low → Arbiter (no premature native-but-unplayable false positive). Activated in the final step.
  m = t.match(/^.+ deals (\d+) damage divided as you choose among (any number of target creatures and\/or players|any number of target creatures|any number of targets|any number of target players)$/);
  if (m) {
    const GROUP = { "any number of target creatures and/or players": "anyTarget", "any number of target creatures": "creatures", "any number of targets": "anyTarget", "any number of target players": "players" };
    return { op: "divide-damage", amount: parseInt(m[1], 10), group: GROUP[m[2]] };
  }
  return null;
}

// ADDITIVE registry seam (WAVE 0): module-level list of extra clause parsers. A parser is
// `(clause, ctx) => Atom | null` (ctx = { cardType, hasX }) consulted by parseClauseToAtom AFTER
// parseExtendedAtom returns null and BEFORE the legacy parse (the inline paths keep priority). Empty
// by default — a no-op until a slice registers one — so existing clause parsing is untouched.
const CLAUSE_PARSERS = [];
export function registerClauseParser(fn) {
  if (typeof fn !== "function") throw new Error("clause parser must be a function");
  CLAUSE_PARSERS.push(fn);
}

/**
 * Parse ONE clause into an atom (+ its target restrictions), or null when the
 * clause carries anything we don't model. The creature-target ALLOWLIST
 * (`parseCreatureTargetRestrictions`) models controller/tapped/power; any other
 * qualifier leaves a residue → null. Non-creature atoms must pass `isCleanClause`.
 */
function parseClauseToAtom(cardType, clause, hasX = false) {
  const s = stripReminder(clause);
  if (!s) return null;

  // α2 — "you may <effect>": an OPTIONAL effect the controller chooses to take (or not). Peel the
  // "you may" wrapper and parse the inner clause on its own merits; if it reduces to a fully-modeled
  // atom, stamp optional:true so the resolver offers a real yes/no (player) / auto-decides (AI),
  // never resolving it as mandatory. A "you may PAY …" (a cost — kicker) or an inner effect we don't
  // model falls through to null → gated as before (the bare "may" stays in UNMODELED_MARKERS, so
  // nothing else is loosened). Only a LEADING "you may" is an optional wrapper (a mid-clause "you
  // may" is a different shape the marker still catches).
  const mayMatch = /^you may (.+)$/i.exec(s);
  if (mayMatch) {
    if (/^pay\b/i.test(mayMatch[1])) return null;
    const inner = parseClauseToAtom(cardType, mayMatch[1], hasX);
    return inner ? { ...inner, optional: true } : null;
  }

  // X-amount variant (only for an {X}-cost spell). Rewrite the X in the AMOUNT slot
  // to a sentinel so the numeric clause parse models the shape, then stamp `amountX`
  // (the resolver substitutes the chosen X via ctx.xValue) and drop the sentinel
  // amount. A standalone X surviving the rewrite ("power X or less", "X target
  // creatures") is a non-amount X we don't model → drop to low. A clause with no
  // amount-X shape falls through to the numeric path (a fixed clause in an X-spell).
  if (hasX) {
    // ===== TOKENS ===== T3 X-COUNT create-token — "Create X <P/T> <descriptor> creature token(s)
    // [with KW]" where the count is the spell's {X} (Secure the Wastes, Goblin Offensive). Rewrite the
    // count "X" to the sentinel "1", re-parse to the FULL create-token atom (so P/T / descriptor /
    // keywords are preserved verbatim), then stamp `countX` + drop the sentinel count (the resolver
    // reads ctx.xValue for the count). A "…, where X is <board count>" (Deploy to the Front) or a
    // trailing "If X is N…" rider (Martial Coup) leaves text past "tokens" → the create-token anchor
    // fails → null → low → Arbiter, so a BOARD-derived X is never mis-modeled as a cost-X count.
    if (/^create x \d+\/\d+ /i.test(s)) {
      const base = parseClauseToAtom(cardType, s.replace(/^create x /i, "create 1 "), false);
      if (!base || base.op !== "create-token") return null;
      const atom = { ...base, countX: true };
      delete atom.count;
      return atom;
    }
    const rewritten = rewriteAmountX(s);
    if (rewritten) {
      if (/\bX\b/.test(rewritten)) return null;
      const base = parseClauseToAtom(cardType, rewritten, false);
      if (!base) return null;
      // ===== DIVIDE ===== (MT-1) — an X-divide ("deals X damage divided among …", Conflagrate / Rolling
      // Thunder) rewrites to a divide-damage atom here, but the generic amountX path below would DROP its
      // `group` + lose the division (resolving to 0 / mis-targeting). X-divide is a deliberate fast-follow,
      // so reject it → low → Arbiter rather than emit a broken atom. (Numeric-N divide is modeled directly.)
      if (base.op === "divide-damage") return null;
      const atom = { op: base.op, targetType: base.targetType, amountX: true };
      if (base.restrictions) atom.restrictions = base.restrictions;
      if (base.duration) atom.duration = base.duration;
      // Carry a non-targetType binding (a self pump's target:"self") so an X-cost self atom can't
      // silently lose its binding and route a target-less/mis-targeted pump. (ptDelta is NOT
      // carried — an X atom reads its amount from ctx.xValue, not a printed delta.) No current
      // card reaches this (a spell never says "this creature"); it keeps the self-binding
      // invariant from regressing (adversarial-review hardening).
      if (base.target) atom.target = base.target;
      return atom;
    }
  }

  // ===== ETB-FIGHT (CR 701.12) ===== "[this creature|it] fights (up to one) target creature you don't
  // control" (Kogla, Apex Altisaur, Kogla and Yidaro modal). The SOURCE creature and the chosen creature
  // each deal damage equal to their power to the other, simultaneously (resolver fightCreature). The head
  // is accepted DIRECTLY here ("it" / "this creature") — triggers.js' it→this-creature rewrite is NOT
  // touched. ANCHORED to the bare "creature you don't control" form: "another target creature" (Ulvenwald
  // Tracker — needs a SECOND chosen creature, not the source), a "target creature you control" (Prey
  // Upon's own-side half), or any rider leaves residue → fails the `$` anchor → low → Arbiter, never a
  // mis-wired one-sided fight. restrictions:{controller:opponent} so atomTargets/enumeration only offers
  // an enemy creature; optionalTarget for "up to one" (0-or-1, declinable → clean no-op).
  {
    const fm = s.toLowerCase().replace(/[’]/g, "'")
      .match(/^(?:this creature|it) fights (up to one )?target creature you don't control$/);
    if (fm) return { op: "fight", targetType: "creature", restrictions: [{ kind: "controller", who: "opponent" }], optionalTarget: !!fm[1] };
  }

  // Extended atoms (anchored ALLOWLIST) before the legacy parse.
  const ext = parseExtendedAtom(s);
  if (ext && KNOWN.has(ext.op)) return ext;

  // ADDITIVE registry seam (WAVE 0): a future slice registers a clause parser instead of editing this
  // dispatch body. Each parser is `(clause, ctx) => Atom | null` (ctx = { cardType, hasX }) and runs
  // ONLY after parseExtendedAtom returns null and BEFORE the legacy parse — so the existing extended
  // and legacy paths keep priority. The first parser to return a truthy atom wins. Empty by default,
  // an exact no-op (the loop body never runs), so existing parsing is untouched.
  for (const p of CLAUSE_PARSERS) {
    const a = p(s, { cardType, hasX });
    if (a) return a;
  }

  const sub = { type: cardType, oracle: s };
  const atom = legacyToAtom(parseSpellEffect(sub));
  if (!atom || !KNOWN.has(atom.op)) return null;

  // The legacy draw regex matches "draw" anywhere — but the draw atom means the
  // CONTROLLER draws. A clause where a different subject draws ("Two target players
  // each draw a card", "that player draws") must NOT parse as a controller-draw. So
  // the draw clause must START with "draw" / "you draw" (CR 121 — "you" is the
  // controller). Otherwise the actor is unmodeled → Arbiter.
  if (atom.op === "draw" && !/^(?:you )?draw\b/i.test(s)) return null;

  if ((atom.op === "deal-damage" || atom.op === "destroy") && atom.targetType === "creature") {
    const { restrictions, clean, cleanedOracle } = parseCreatureTargetRestrictions(sub);
    if (!(clean && isCleanClause(cleanedOracle))) return null;
    return restrictions.length ? { ...atom, restrictions } : atom;
  }
  if (!isCleanClause(s)) return null;
  return atom;
}

/**
 * Modal prefix — "Choose one —" (P2.5) plus MODAL-2's "Choose two —" / "Choose one or both —". The
 * capture groups carry the count: group 1 = one|two (the MAX modes to pick), group 2 = " or both" (the
 * "fewer is allowed" / upTo form). "choose up to N" / "choose two or more" etc. don't match → stay low
 * (the executor only resolves a FIXED-or-one-or-both pick; anything else routes to the Arbiter).
 */
const MODAL_RE = /^choose (one|two)( or both)?\s*[—–-]\s*/i;

/**
 * Parse a modal prefix into `{ chooseCount, upTo, modes:[{label, atoms}] }`, or null if not modal, or
 * `{ modes: null }` if a mode is unmodeled / the count is unsatisfiable (→ low). `chooseCount` is the MAX
 * modes the caster picks (1 or 2); `upTo` means fewer is allowed down to 1 ("one or both" → 1 or 2). The
 * cast-time enumerator (targeting.expandCastChoices) expands the mode COMBINATIONS; the executor
 * (runProgram.programAtoms) concatenates every chosen mode's atoms — so a "Choose two" never drops its 2nd
 * mode (the gate + executor ship together, the MODAL-2 CREED invariant). Modes split on bullet "•" or
 * "; or " / " or ". Each mode is itself a clause sequence parsed via `parseClauseToAtom` (multi-clause ok).
 */
function parseModal(cardType, oracle, hasX = false) {
  const stripped = stripReminder(oracle);
  const m = stripped.match(MODAL_RE);
  if (!m) return null;
  const orBoth = !!m[2];
  const chooseCount = (orBoth || m[1].toLowerCase() === "two") ? 2 : 1;
  const upTo = orBoth; // "one or both" → pick 1 or 2; "choose one"/"choose two" → an exact count
  const rest = stripped.slice(m[0].length).trim();
  const rawModes = rest.includes("•")
    ? rest.split("•")
    : rest.split(/\s*;\s*or\s+|\s+\bor\b\s+/i);
  const parts = rawModes.map(p => p.replace(/^[•\s]+/, "").replace(/\.\s*$/, "").trim()).filter(Boolean);
  if (parts.length < 2) return null;

  const modes = [];
  for (const part of parts) {
    const clauses = splitClauses(part);
    const atoms = [];
    let ok = clauses.length > 0;
    for (const clause of clauses) {
      const atom = parseClauseToAtom(cardType, clause, hasX);
      if (!atom) { ok = false; break; }
      atoms.push(atom);
    }
    if (!ok) return { chooseCount, upTo, modes: null }; // an unmodeled mode → low
    modes.push({ label: part, atoms });
  }
  // Count must be satisfiable: can't pick more modes than exist, and "one or both" is specifically a
  // TWO-mode card (1 or 2 of exactly 2). An unsatisfiable count → modes:null → low (never a wrong pick).
  if (chooseCount > modes.length) return { chooseCount, upTo, modes: null };
  if (orBoth && modes.length !== 2) return { chooseCount, upTo, modes: null };
  return { chooseCount, upTo, modes };
}

// δ-1 hand disruption — the filter phrase between "you choose a/an" and "card" mapped to a modeled
// handFilter spec (the enumerator's predicate: `include` = front-face type must contain ANY, `exclude`
// = must contain NONE, `maxCmc` = the optional "mana value N or less"). ALLOWLIST: only these exact
// phrases are modeled — Duress, Thoughtseize, Distress, Inquisition, Coercion, Despise, Divest, Harsh
// Scrutiny. Any other filter ("nonblack", "with the highest mana value", a tribal type) isn't in the
// map → matchHandDisruption returns null → the whole spell routes to the Arbiter (CLAUDE.md §1.2).
const HAND_FILTER_MAP = {
  "": {},                                                      // Coercion — any card
  "nonland": { exclude: ["Land"] },                            // Thoughtseize / Distress / Inquisition
  "noncreature, nonland": { exclude: ["Creature", "Land"] },   // Duress
  "creature": { include: ["Creature"] },                       // Harsh Scrutiny
  "creature or planeswalker": { include: ["Creature", "Planeswalker"] }, // Despise
  "artifact or creature": { include: ["Artifact", "Creature"] },         // Divest
};

/**
 * Match the leading "Target <opponent|player> reveals their hand. You choose a <filter> card from it
 * [with mana value N or less]. That player discards that card." template (δ-1). Returns
 * `{ atom, rest }` — the `discard-chosen` atom plus the oracle text AFTER the template (rider
 * sentences like "You lose 2 life." / "Scry 1.") — or null when the text isn't this exact shape or
 * carries an unmodeled card filter. "You MAY choose …" (Reckoner Shakedown's optional branch) and the
 * exile/graveyard variant (Agonizing Remorse) don't match → Arbiter. `an?` matches the article whether
 * the filter starts with a vowel ("an artifact …") or not ("a nonland …").
 */
function matchHandDisruption(oracle) {
  const m = String(oracle).match(
    /^target (?:opponent|player) reveals their hand\. you choose an? ?([a-z, ]*?) ?card from it(?: with mana value (\d+) or less)?\. that player discards that card\.?/i,
  );
  if (!m) return null;
  const phrase = m[1].trim().toLowerCase();
  if (!(phrase in HAND_FILTER_MAP)) return null;               // an unmodeled filter → low → Arbiter
  const handFilter = { ...HAND_FILTER_MAP[phrase] };
  if (m[2]) handFilter.maxCmc = parseInt(m[2], 10);
  // δ-1b: the atom TARGETS the opponent (a player), bound at cast WITHOUT seeing their hand. The
  // handFilter rides along and is applied at RESOLUTION (applyDiscardChosen reveals that opponent's hand,
  // sets a pendingChoice of the matching cards). This is the faithful Duress flow — commit to the
  // opponent, THEN reveal — and in 4P it can't cross-opponent cherry-pick / leak other hands (the δ-1a
  // `handCard` cast-time model could). `who` records opponent-vs-player for completeness (both enumerate
  // opponents — a safe subset of "target player", never the caster's own hand).
  const who = /reveals their hand/i.test(m[0]) && /^target opponent/i.test(m[0]) ? "opponent" : "player";
  return { atom: { op: "discard-chosen", targetType: "opponent", handFilter, who }, rest: oracle.slice(m[0].length).trim() };
}

// ===== RIDER-REMOVAL ===== (Dex, real-deck slice 2) — targeted removal whose SECOND sentence acts on the
// TARGET's controller: "Exile/Destroy target X. Its controller {gains life equal to its power | creates a
// N/N <color> <subtype> creature token | may search their library for a basic land card, put it onto the
// battlefield[ tapped], then shuffle}." (Swords to Plowshares, Beast Within / Generous Gift, Path to Exile /
// Assassin's Trophy). The lead removal is parsed by the SHARED removal grammar (parseExtendedAtom), so it
// reuses EVERY modeled targetType + controller restriction (creature / permanent / "permanent an opponent
// controls") with no targeting changes; the rider rides on the atom as `controllerRider` and is applied at
// RESOLUTION to the captured target-controller (CR — "its controller" = the just-removed permanent's
// controller). ALL-OR-NOTHING: an unmodeled rider, or a lead the removal grammar doesn't model, → null →
// the whole card stays low → Arbiter (never a confident partial that fires the removal but drops the rider).
const RIDER_COUNT = { a: 1, two: 2, three: 3, four: 4, five: 5 };
function parseControllerRider(t) {
  // Swords to Plowshares — "gains life equal to its power" (the exiled creature's power, captured pre-removal).
  if (/^gains life equal to its power$/.test(t)) return { kind: "gainLifePower" };
  // Beast Within / Generous Gift (vanilla) + Swan Song (KEYWORD) — "creates a N/N <color> <subtype> creature
  // token[ with <KW…>]". A single color word + a single creature subtype; an optional " with <KW>" is parsed
  // by parseTokenKeywords (the enforced+layer-aware set), so an UNMODELED keyword (or a "with flying and you
  // gain 2 life" rider tail) → null → the whole card stays low → Arbiter.
  let m = t.match(/^creates a (\d+)\/(\d+) (white|blue|black|red|green) ([a-z]+) creature token(?: with (.+))?$/);
  if (m) {
    const keywords = m[5] ? parseTokenKeywords(m[5]) : [];
    if (m[5] && !keywords) return null;                       // unmodeled token keyword → low → Arbiter
    const rider = { kind: "createToken", power: parseInt(m[1], 10), toughness: parseInt(m[2], 10), color: m[3], subtype: m[4] };
    if (keywords && keywords.length) rider.keywords = keywords; // vanilla tokens keep NO keywords field (slice-2 shape)
    return rider;
  }
  // An Offer You Can't Refuse — "creates a/two/three <Treasure|Clue|Food|Gold> token(s)" (a NAMED artifact
  // token; reuses applyCreateNamedToken). The parenthetical reminder is stripped before this runs.
  m = t.match(/^creates (a|two|three|four|five) (treasure|clue|food|gold) tokens?$/);
  if (m) return { kind: "createNamedToken", token: m[2], count: RIDER_COUNT[m[1]] };
  // Path to Exile / Assassin's Trophy — "may search their library for a basic land card, put it/that card
  // onto the battlefield[ tapped], then shuffle". Reuses the RAMP-1 battlefield tutor scoped to that player;
  // the optional "may" is the tutor's find-nothing (identical to how Farhaven Elf's "you may search" models).
  m = t.match(/^may search their library for a basic land card, put (?:it|that card) onto the battlefield( tapped)?, then shuffle$/);
  if (m) return { kind: "rampBasic", entersTapped: !!m[1] };
  return null; // an unmodeled controller rider → low → Arbiter
}
function matchRemovalControllerRider(oracle) {
  const m = stripReminder(oracle).trim().match(/^((?:exile|destroy) target .+?)\.\s+its controller (.+?)\.?$/i);
  if (!m) return null;
  const lead = parseExtendedAtom(m[1].trim());
  if (!lead || (lead.op !== "exile" && lead.op !== "destroy")) return null; // lead must be a modeled removal
  const rider = parseControllerRider(m[2].trim().toLowerCase());
  if (!rider) return null;                                                   // unmodeled rider → low → Arbiter
  return { atom: { ...lead, controllerRider: rider }, rest: "" };
}
// SOFT-COUNTER-RIDER — "Counter target <filter> spell. Its controller <rider>." (An Offer You Can't Refuse
// "creates two Treasure tokens", Swan Song "creates a 2/2 blue Bird … with flying"). The lead reuses the
// counter grammar (spellFilter incl. the 3-way enchantment/instant/sorcery); the rider rides on the atom and
// is applied at resolution to the COUNTERED spell's controller (captured in applyCounter). The parenthetical
// token reminder is stripped. ALL-OR-NOTHING: an unmodeled rider, a soft-counter ("unless pays {N}", which
// the lead grammar returns WITH unlessPay — rejected here so the rider+pay interaction isn't half-modeled),
// or a non-counter lead → null → low → Arbiter.
function matchCounterControllerRider(oracle) {
  const m = stripReminder(oracle).trim().match(/^(counter target .+? spell)\.\s+its controller (.+?)\.?$/i);
  if (!m) return null;
  const lead = parseExtendedAtom(m[1].trim());
  if (!lead || lead.op !== "counter" || lead.unlessPay != null || lead.unlessPayX) return null; // hard counter only (defer soft+rider)
  const rider = parseControllerRider(m[2].trim().toLowerCase());
  if (!rider) return null;                                                    // unmodeled rider → low → Arbiter
  return { atom: { ...lead, controllerRider: rider }, rest: "" };
}
// CNT-EXILE-INSTEAD (WAVE 2b) — "Counter target <filter> spell. If that spell is countered this way, exile it
// instead of putting it into its owner's graveyard." (Deny Existence "creature", Dissipate-style). The lead
// reuses the counter grammar (so a lead filter the grammar doesn't model — Deny the Divine's "creature or
// enchantment", Faerie Trickery's "non-Faerie" — fails the lead parse → null → low → Arbiter, ALL-OR-NOTHING).
// The countered spell goes to EXILE not the graveyard (applyCounter reads atom.exileInstead). Spans two
// sentences (the "If that spell …" rider would be shattered by splitClauses), so it's matched up front as ONE
// collapsed atom. ANCHORED — a hard-counter lead only; the soft-counter path's pay-decision isn't composed here.
function matchCounterExileInstead(oracle) {
  const m = stripReminder(oracle).trim().match(/^(counter target .+? spell)\. if that spell is countered this way, exile it instead of putting it into its owner's graveyard\.?$/i);
  if (!m) return null;
  const lead = parseExtendedAtom(m[1].trim());
  if (!lead || lead.op !== "counter" || lead.unlessPay != null || lead.unlessPayX) return null; // hard counter only
  return { atom: { ...lead, exileInstead: true }, rest: "" };
}

// δ-2 impulse-dig — spelled cardinals the "top <N> cards" template uses (2-10; bigger digs are rare).
const DIG_NUM = { two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };

/**
 * Match the "Look at the top N cards of your library. Put one of them into your hand and the rest
 * <on the bottom of your library [in any/a random order] | into your graveyard>." dig template (δ-2 —
 * Anticipate, Strategic Planning, Impulse — a 3-way "one to hand / one on top / one on bottom" split
 * like Telling Time correctly fails the anchor → Arbiter). Returns `{ atom, rest }`
 * — the `impulse-dig` atom plus any oracle text AFTER the template — or null. Like hand disruption this
 * SPANS two sentences (the "Put one … and the rest …" clause's internal " and " would be shattered by
 * splitClauses), so it's matched up front as ONE atom. ALL-OR-NOTHING ALLOWLIST: EXACTLY "put one …
 * into your hand" + rest → bottom or graveyard. A multi-pick ("put two", "put any number"), a 3-way
 * split (Telling Time), "rest in random order ON TOP", or an X/Domain count all fail the anchor → low →
 * Arbiter. DIG-1 ADDS: the N=2 "and the OTHER on the bottom" phrasing (Sleight of Hand), and the FILTERED
 * reveal-dig "you may reveal a <type> card from among them and put it into your hand. Put the rest on the
 * bottom" (Commune with Nature, Seek the Wilds, Peer Through Depths).
 */
function matchImpulseDig(oracle) {
  // (1) Plain keep-one dig — "put one of them into your hand and the rest|the other on the bottom|graveyard".
  const m = String(oracle).match(
    /^look at the top (\w+) cards? of your library\. put one of (?:them|those cards|these cards) into your hand and (?:put )?(?:the rest|the other) (on the bottom of your library(?: in (?:any|a random) order)?|into your graveyard)\.?/i,
  );
  if (m) {
    const amount = DIG_NUM[m[1].toLowerCase()];
    if (!amount) return null;                                   // "the top X cards" (variable) / unspelled → Arbiter
    const restTo = /graveyard/i.test(m[2]) ? "graveyard" : "bottom";
    return { atom: { op: "impulse-dig", amount, restTo }, rest: oracle.slice(m[0].length).trim() };
  }
  // (2) FILTERED reveal-dig — "look at top N. you may reveal a <type> card from among them and put it into
  // your hand. Put the rest on the bottom." Only TYPE-MATCHING cards are keepable to hand; the rest (incl.
  // non-matching) go to the bottom — applyImpulseDig disposes the whole looked-at set minus the kept card.
  // The "you may" DECLINE is omitted as STRICTLY DOMINATED: a free card to hand vs. that card going to the
  // bottom either way, with no cost / no decking risk to decline (unlike "you may draw") — so the modeled
  // line (keep the best matching; human picks which) is always faithful-or-better. The type phrase reuses
  // the tutor filter allowlist (parseTutorFilter); a tribal ("dinosaur") / unlisted word → null → Arbiter.
  // Plural "put the revealed CARDS" (multi-keep) / "any number" / "onto the battlefield" don't match "put
  // it into your hand" → low → Arbiter (those are different effects, deferred).
  const rd = String(oracle).match(
    /^look at the top (\w+) cards? of your library\. you may reveal an? ([a-z][a-z ]*?) card from among them and put (?:it|that card) into your hand\. put the rest on the bottom of your library(?: in (?:any|a random) order)?\.?/i,
  );
  if (rd) {
    const amount = DIG_NUM[rd[1].toLowerCase()];
    const filter = parseTutorFilter(rd[2].trim());
    if (!amount || !filter) return null;                        // unspelled N / tribal-or-unlisted type → Arbiter
    return { atom: { op: "impulse-dig", amount, restTo: "bottom", filter, filterLabel: `${rd[2].trim()} card` }, rest: oracle.slice(rd[0].length).trim() };
  }
  return null;
}

/**
 * Parse a card into an EffectProgram, or null.
 *
 * Returns null ONLY when the card is NOT an instant/sorcery with oracle text
 * (a permanent enters via the ETB path; a card with no oracle has nothing to
 * parse). An instant/sorcery WITH text always returns a program: `high` when
 * EVERY clause (or, for modal, every mode) parses to a known atom, `low` (zero
 * atoms → Arbiter seam) otherwise. NEVER null for a non-permanent spell, NEVER a
 * fabricated effect.
 */
// ===== ADDITIONAL COSTS (cast-path, CR 601.2f) =====
// A spell's "As an additional cost to cast this spell, <cost>." sentence is paid AT CAST, not at
// resolution — it is NOT an effect atom. Today the clause parser can't match that sentence, so any such
// card stays LOW (safe). This slice recognizes the single cleanest, highest-yield cost-type — a
// CHOSEN-VICTIM sacrifice ("sacrifice a/an <creature|permanent|artifact|enchantment|land>") — strips the
// cost sentence, parses the REMAINING effect through the normal all-or-nothing pipeline, and attaches
// `additionalCosts` to the program. The cast path enforces it (legalChoices.actionsCastSpell enumerates one
// cast per legal victim + gates the spell uncastable when none can be sacrificed; actionDispatcher.
// applyCastSpell pays it via the γ1b `sacrificePermanentForCost` helper). The sac allowlist MIRRORS
// abilities.parseAbilityCost's `sacOther` regex — we can't import it (abilities.js imports parser.js → a
// cycle), so the discipline is duplicated, not shared: a COUNT ("two creatures"), a compound type ("a
// creature or artifact"), or "another" (a spell has no source permanent to exclude) doesn't match → the
// sentence is left in place → the card stays LOW.
const ADDITIONAL_COST_RE = /\bas an additional cost to cast this spell,\s*([^.]+)\.\s*/i;
const SAC_COST_RE = /^sacrifice (?:a|an) (creature|permanent|artifact|enchantment|land)$/i;
const PAYLIFE_COST_RE = /^pay (\d+) life$/i;                        // ADDCOST-2 — no-choice life cost
const DISCARD_COST_RE = /^discard (?:a|an|one) card$/i;             // ADDCOST-2 — N=1 only ("two cards"/"X cards"/"your hand" deferred)
const SUPPORTED_ADDITIONAL_COST_KINDS = new Set(["sacrifice", "payLife", "discard"]);

/**
 * Pull a modeled additional cost off a spell's oracle. Returns `{ costs, rest }`:
 *   - `costs`: `[cost]` when the (sole) additional cost is a modeled type AND the remaining effect does NOT
 *     reference the paid-cost object; otherwise `null`. Modeled cost shapes:
 *       `{ kind:"sacrifice", sacType }` (ADDCOST-1) · `{ kind:"payLife", amount }` · `{ kind:"discard", count:1 }`.
 *   - `rest`: the oracle with the cost sentence removed — ONLY when `costs !== null`; otherwise the oracle
 *     unchanged (so the un-strippable cost sentence keeps the card LOW).
 * CONSERVATIVE by construction: anything but a modeled cost form (a count, a compound, an "or pay {N}" alt,
 * an X-life, a multi-card discard) leaves the oracle untouched → Arbiter.
 */
function extractAdditionalCosts(oracle) {
  const m = ADDITIONAL_COST_RE.exec(oracle);
  if (!m) return { costs: null, rest: oracle };
  const phrase = m[1].trim();
  const sac = SAC_COST_RE.exec(phrase);
  const life = PAYLIFE_COST_RE.exec(phrase);
  const disc = DISCARD_COST_RE.exec(phrase);
  let cost, selfRef = null;
  if (sac) { cost = { kind: "sacrifice", sacType: sac[1].toLowerCase() }; selfRef = /\bsacrificed\b/i; }
  else if (life) { cost = { kind: "payLife", amount: parseInt(life[1], 10) }; }       // no-choice: deduct N at cast
  else if (disc) { cost = { kind: "discard", count: 1 }; selfRef = /\bdiscarded\b/i; } // N=1; "two cards"/X deferred
  else return { costs: null, rest: oracle };                   // unmodeled cost-type / count / compound → LOW
  const rest = (oracle.slice(0, m.index) + oracle.slice(m.index + m[0].length)).trim();
  // Self-reference guard: an effect that reads the paid-cost object ("…damage equal to the sacrificed
  // creature's power", "the sacrificed creature", "for each card discarded") can't be fed the cost details —
  // leave the whole card LOW. UNMODELED_MARKERS catches "equal to"/"for each"; this is belt-and-suspenders.
  if (selfRef && selfRef.test(rest)) return { costs: null, rest: oracle };
  return { costs: [cost], rest };
}

export function parseEffectProgram(card) {
  if (!isInstantOrSorcery(card) || !oracleOf(card)) return null;
  const oracle = oracleOf(card);
  const { costs, rest } = extractAdditionalCosts(oracle);
  // A spell that is BOTH an X-spell AND carries an additional cost is a compound we defer — the cast-path
  // X-value expansion and the victim expansion don't yet compose — so parse the FULL oracle and let the
  // un-stripped cost sentence keep it LOW. No clean printed card needs both today.
  if (costs && hasXCost(card)) return parseEffectClause(oracle, typeOf(card), { hasX: true });
  // {X}-cost spell (no additional cost): the parser may stamp `amountX` on a damage/draw/pump atom whose
  // amount is the chosen X, bound at cast time (CR 601.2b) and read at resolution.
  const program = parseEffectClause(costs ? rest : oracle, typeOf(card), { hasX: hasXCost(card) });
  if (costs && program) program.additionalCosts = costs;
  return program;
}

/**
 * Parse a raw effect-text clause into an EffectProgram, regardless of card type.
 *
 * This is `parseEffectProgram`'s body, factored out so a NON-spell effect clause —
 * a triggered ability's effect ("When ~ enters, <this>"), an activated ability's
 * effect ("{cost}: <this>") — runs through the SAME multi-clause / modal /
 * all-or-nothing-confidence pipeline and inherits the full P2.x atom family. The
 * confidence gate is identical: `high` iff every clause (or every mode) parses to a
 * known atom, `low` (zero atoms → Arbiter seam) otherwise. Returns null only for
 * empty text. NEVER a fabricated effect.
 *
 * `cardType` is the source's type line (used by clause parsers for type-sensitive
 * shapes); `hasX` marks an X in the relevant cost so amount-X atoms bind at choice
 * time (default false — permanent-ability effects rarely carry their own X).
 */
/**
 * ===== EMBLEM ===== (PW-5/8, CR 114) — "You get an emblem with '<ability>'." Matched UP FRONT because
 * the quoted ability spans sentences (the clause splitter would shatter it). Modeled when the ability
 * is fully covered by the engine — either a STATIC the layer engine applies (PW-5, emblemEffectsOf) or
 * TRIGGERED abilities the trigger engine fires (PW-8, triggers scan emblems). All-or-nothing per the
 * CREED: a partial / activated / complex emblem ability → null → low → Arbiter. Returns { atom, rest:"" }.
 */
function matchEmblem(oracle) {
  const m = stripReminder(oracle).trim().match(/^you get an emblem with ["“”'](.+)["“”']\.?$/i);
  if (!m) return null;
  const ability = m[1].trim();
  if (!emblemAbilityModeled(ability)) return null;
  return { atom: { op: "create-emblem", emblemOracle: ability, targetType: null }, rest: "" };
}

/**
 * Is an emblem's quoted ability text fully modeled? STATIC (anthem the layer applies, PW-5) OR
 * TRIGGERED (PW-8: every detected trigger's effect parses HIGH, NO static mixed in, and the trigger
 * sentences account for the WHOLE text — no unmodeled residue). Mirrors coverage.permanentTriggersCovered
 * but inline (parser can't import coverage — that would cycle). Conservative: a mixed static+trigger
 * emblem, a multi-sentence trigger effect the residue scan can't account for, or any LOW trigger effect
 * → false → Arbiter (a SAFE false-negative).
 */
function emblemAbilityModeled(x) {
  if (staticAbilitiesCoverCard({ type: "Emblem", oracle: x }, () => false)) return true; // PW-5 static
  if (parseStaticAbilities({ type: "Emblem", oracle: x }).length > 0) return false;       // mixed static+trigger → reject
  const trigs = detectTriggers({ type: "Emblem", oracle: x });
  if (trigs.length === 0) return false;
  const allHigh = trigs.every((d) => {
    const p = parseEffectClause(d.effectClause, "Instant");
    return p && programConfidence(p) === "high" && p.structure !== "modal" && !p.xSpell;
  });
  if (!allHigh) return false;
  // The trigger sentences (the When/Whenever/At grammar) must account for the whole text — nothing
  // unmodeled may remain (same residue check permanentTriggersCovered uses, tightened to empty).
  const residue = x.replace(/(?:^|[\n.;]\s*)(?:When|Whenever|At)\b[^.]+\./gi, " ").replace(/[\s.]+/g, "");
  return residue === "";
}

/**
 * ===== DIES-TRIGGER-RESOURCE-PAYOFFS ===== Lifeblood Hydra's "you gain life and draw cards equal to its
 * power" — a SHARED-magnitude compound: the controller gains N life AND draws N cards where N = the dying
 * creature's last-known power (CR 603.6e, ctx.dyingPower). The "equal to its power" governs BOTH halves
 * (CR templating), but the top-level " and " would shatter into ["you gain life" (NO amount), "draw cards
 * equal to its power"], silently dropping the gain-life magnitude — a forbidden partial. So match the WHOLE
 * compound up front and emit BOTH atoms directly (each countContext:"dyingPower" → the gain-life resolver
 * reads ctx.dyingPower via resolveScaledAmount, the draw resolver via its own countContext branch).
 *
 * Why match the WHOLE compound and NOT add a generic "draw cards equal to its power" clause matcher: that
 * bare clause ALSO appears on ETB cards (Prime Speaker Zegana) and combat-damage cards (Gregor) where "its
 * power" is the LIVE source's power, NOT a dying creature's — a context-free dyingPower binding would mis-
 * resolve those to 0 (a forbidden FP). The disambiguator is the FULL clause "you gain life and draw cards
 * equal to its power", which is corpus-unique to Lifeblood (a dies-trigger), so "its" is unambiguously the
 * dying creature. Anchored ^…$ — any rider leaves residue → no match → low → Arbiter. Returns { atoms }.
 */
function matchDiesGainDrawByPower(oracle) {
  const s = stripReminder(oracle).trim().toLowerCase().replace(/\.\s*$/, "");
  if (!/^you gain life and draw cards equal to its power$/.test(s)) return null;
  return { atoms: [
    { op: "gain-life", countContext: "dyingPower", targetType: null },
    { op: "draw", countContext: "dyingPower", targetType: null },
  ] };
}

function parseEffectClauseImpl(oracle, cardType = "", { hasX = false } = {}) {
  if (!oracle) return null;
  // MTG-001 — strip the "can't be regenerated" rider from the PARSE TEXT only, so the lead effect (the
  // board wipe / removal) still matches its anchored pattern instead of being forced low by the rider
  // clause. The rider's MEANING is NOT dropped: the exported parseEffectClause wrapper re-detects it on
  // the original oracle (CANT_REGEN_TEST) and stamps `cannotRegenerate` on the resulting destroy atom(s),
  // which applyDestroyEffect honors by ignoring regeneration shields (CR 701.15).
  oracle = stripRegenerationRider(oracle);
  // Drop the vacuous "This spell can't be countered" rider too — uncounterability is enforced at the
  // counter-target enumerator, not the effect program, so honoring it yields the identical resolution.
  oracle = stripUncounterableRider(oracle);
  // KWSTRIP-1 — drop a vacuous cast-keyword line (foretell / suspend / splice onto arcane / recover /
  // harmonize / basic landcycling) so the spell's BODY parses; the normal-cast resolution is identical.
  oracle = stripCastKeywordLines(oracle);
  // ONCE-PER-TURN — "Do this only once each turn." is a FREQUENCY RESTRICTION enforced at resolution via
  // the `oncePerTurn` flag on the gated atom (state.onceTriggersFiredThisTurn, cleared each untap step).
  // CREED: ONLY atoms whose resolver actually HONORS the flag (ONCE_PER_TURN_HONORED — today just
  // `discover`) may keep the program HIGH. Strip the rider, parse the core, and require a non-modal HIGH
  // program whose LAST atom is honored — else the whole thing is LOW (a draw/token/life effect with this
  // rider would over-fire every turn, since those resolvers ignore the flag → a forbidden false positive).
  if (/\bDo this only once each turn\b\.?\s*$/i.test(oracle)) {
    const core = oracle.replace(/\.?\s*Do this only once each turn\b\.?\s*$/i, "").trim();
    const inner = parseEffectClauseImpl(core, cardType, { hasX });
    if (inner && programConfidence(inner) === "high" && inner.structure !== "modal"
        && inner.atoms.length > 0 && ONCE_PER_TURN_HONORED.has(inner.atoms[inner.atoms.length - 1].op)) {
      const atoms = inner.atoms.map((a, i) => (i === inner.atoms.length - 1 ? { ...a, oncePerTurn: true } : a));
      return makeProgram({ confidence: "high", atoms, xSpell: inner.xSpell, unparsedTail: null });
    }
    return makeProgram({ confidence: "low", atoms: [], unparsedTail: oracle });
  }

  // Multi-sentence templates whose effect SPANS sentences (so the clause splitter below would shatter
  // them into unmatchable fragments) are matched up front as ONE atom, then any RIDER sentences that
  // follow run through the normal clause pipeline. ALL-OR-NOTHING: HIGH only if every rider atom is
  // modeled too; an unmodeled rider → low → Arbiter (never a partial — the lead effect would fire while
  // the rider is silently dropped, the cardinal-rule failure).
  //   - δ-1 hand disruption ("…reveals their hand. You choose a card from it. That player discards …"
  //     + Thoughtseize "You lose 2 life" / Harsh Scrutiny "Scry 1").
  //   - δ-2 impulse-dig ("Look at the top N … Put one … into your hand and the rest …").
  const collapsed = (col) => {
    const atoms = [col.atom];
    for (const clause of (col.rest ? splitClauses(col.rest) : [])) {
      const a = parseClauseToAtom(cardType, clause, hasX);
      if (!a) return makeProgram({ confidence: "low", atoms: [], unparsedTail: oracle });
      atoms.push(a);
    }
    if (atoms.every(a => KNOWN.has(a.op)) && optionalsFormSuffix(atoms)) {
      return makeProgram({ confidence: "high", atoms, xSpell: atoms.some(a => a.amountX || a.countX), unparsedTail: null });
    }
    return makeProgram({ confidence: "low", atoms: [], unparsedTail: oracle });
  };
  const hd = matchHandDisruption(oracle);
  if (hd) return collapsed(hd);
  const dig = matchImpulseDig(oracle);
  if (dig) return collapsed(dig);
  const emb = matchEmblem(oracle);
  if (emb) return collapsed(emb);
  // ===== DIES-TRIGGER-RESOURCE-PAYOFFS ===== Lifeblood Hydra "you gain life and draw cards equal to its
  // power" — a shared-magnitude gain+draw the top-level " and " split would shatter (see
  // matchDiesGainDrawByPower). Emits BOTH atoms directly; HIGH iff both are KNOWN (they are — gain-life +
  // draw), so the whole compound resolves natively or not at all (no partial).
  const dgd = matchDiesGainDrawByPower(oracle);
  if (dgd && dgd.atoms.every(a => KNOWN.has(a.op))) {
    return makeProgram({ confidence: "high", atoms: dgd.atoms, xSpell: false, unparsedTail: null });
  }
  // RIDER-REMOVAL — "Exile/Destroy target X. Its controller <rider>." parses to ONE removal atom carrying
  // a `controllerRider` (resolved to the target's controller). The two sentences span the clause splitter,
  // so it's matched up front like the other collapsed templates.
  const rcr = matchRemovalControllerRider(oracle);
  if (rcr) return collapsed(rcr);
  // SOFT-COUNTER-RIDER — "Counter target <filter> spell. Its controller <rider>." → ONE counter atom carrying
  // a `controllerRider` (resolved to the countered spell's controller).
  const ccr = matchCounterControllerRider(oracle);
  if (ccr) return collapsed(ccr);
  // CNT-EXILE-INSTEAD — "Counter target <filter> spell. If that spell is countered this way, exile it instead
  // of putting it into its owner's graveyard." → ONE counter atom carrying `exileInstead` (applyCounter exiles
  // the countered spell instead of routing it to the graveyard).
  const cei = matchCounterExileInstead(oracle);
  if (cei) return collapsed(cei);

  // Modal "Choose one —": each mode is its own sub-program. HIGH iff every mode
  // parses fully (all-or-nothing across modes).
  const modal = parseModal(cardType, oracle, hasX);
  if (modal) {
    if (modal.modes && modal.modes.every(mode => mode.atoms.every(a => KNOWN.has(a.op)) && !fightAtomMisplaced(mode.atoms))) {
      const xSpell = modal.modes.some(mode => mode.atoms.some(a => a.amountX || a.countX));
      return makeProgram({ confidence: "high", structure: "modal", atoms: [], modal, xSpell, unparsedTail: null });
    }
    return makeProgram({ confidence: "low", structure: "modal", atoms: [], modal: null, unparsedTail: oracle });
  }

  // Bulleted text that ISN'T a "Choose one —" modal (e.g. "Tiered (Choose one
  // additional cost.) • … • …", level-up, saga chapters) means MODE/TIER choices,
  // NOT a sequence. The clause splitter would otherwise treat each bullet as a
  // sequential clause and, say, deal every tier's damage at once. Route to Arbiter.
  if (stripReminder(oracle).includes("•")) {
    return makeProgram({ confidence: "low", atoms: [], unparsedTail: oracle });
  }

  // Multi-clause sequence: split, then parse EACH clause. All-or-nothing.
  const clauses = splitClauses(oracle);
  const atoms = [];
  let allParsed = clauses.length > 0;
  for (const clause of clauses) {
    const atom = parseClauseToAtom(cardType, clause, hasX);
    if (!atom) { allParsed = false; break; }
    atoms.push(atom);
  }
  // α2 forward guard: an `optional` atom ("you may <effect>") scopes ONLY its own clause. The hazard is an
  // optional FOLLOWED by a MANDATORY atom — a conjoined "you may X and Y" splits into [optional X, mandatory
  // Y], where declining X would still wrongly force Y (ambiguous scope). So optionals are allowed ONLY as a
  // SUFFIX of the sequence: a mandatory-then-optional card (LAND-FROM-HAND — Growth Spiral "Draw a card. You
  // may put a land …" → [draw, may-put]) is safe (the optional is last; nothing it could wrongly force),
  // while any optional with a LATER mandatory atom drops the whole program to LOW → Arbiter (never a partial).
  // Conservative on optional-then-mandatory even when period-separated (a safe false-negative, no card needs
  // it yet). Growth Spiral is the first printed multi-atom optional; the suffix rule keeps the and-conjoined
  // ambiguity blocked. (α2 review — tightened from "any optional in a multi-atom program drops".) Shared with
  // the collapsed-template path via `optionalsFormSuffix` so both HIGH paths enforce the same invariant.
  const optionalScopeOk = optionalsFormSuffix(atoms);
  if (allParsed && atoms.length > 0 && optionalScopeOk && atoms.every(a => KNOWN.has(a.op)) && !fightAtomMisplaced(atoms)) {
    // Drop a redundant `shuffle` atom that immediately follows a `tutor` (the tutor
    // already shuffles after its search, CR 701.19e) — some cards template the shuffle as
    // its own sentence, which would otherwise shuffle twice. P3.2 review cleanup.
    const seq = atoms.filter((a, i) => !(a.op === "shuffle" && atoms[i - 1]?.op === "tutor"));
    const xSpell = seq.some(a => a.amountX || a.countX);
    return makeProgram({ confidence: "high", atoms: seq, xSpell, unparsedTail: null });
  }

  // Any clause unmodeled → low confidence, ZERO atoms. Resolution hands the whole
  // spell to the Arbiter (never a partial execution, never a fabricated effect).
  return makeProgram({ confidence: "low", atoms: [], unparsedTail: oracle });
}

/**
 * MTG-001 — public entry point for `parseEffectClauseImpl`. The impl strips the "can't be regenerated"
 * rider from its parse text so the lead effect matches; this wrapper restores the rider's MEANING by
 * stamping `cannotRegenerate: true` on every destroy atom in the produced program whenever the original
 * oracle carried the rider. `applyDestroyEffect` honors the flag by skipping regeneration shields
 * (CR 701.15) — indestructible (a separate replacement, CR 702.12b) is unaffected.
 *
 * Stamps both the sequence path (`program.atoms`) and any modal modes (`program.modal.modes[].atoms`).
 * Attribution caveat: the rider is stripped before clauses/modes split, so in the (printed-card-nonexistent)
 * case of a modal card mixing a regen-rider destroy mode with a non-rider destroy mode, BOTH destroy modes
 * would be stamped. The flag is inert unless a targeted creature actually holds a regeneration shield, so
 * over-stamping a destroy atom that never carries the rider has no observable effect on any real card.
 */
export function parseEffectClause(oracle, cardType = "", opts = {}) {
  const program = parseEffectClauseImpl(oracle, cardType, opts);
  if (!program || !CANT_REGEN_TEST.test(String(oracle || ""))) return program;
  const stamp = (a) => (a && a.op === "destroy" ? { ...a, cannotRegenerate: true } : a);
  const next = { ...program };
  if (Array.isArray(next.atoms)) next.atoms = next.atoms.map(stamp);
  if (next.modal && Array.isArray(next.modal.modes)) {
    next.modal = {
      ...next.modal,
      modes: next.modal.modes.map((m) => ({ ...m, atoms: Array.isArray(m.atoms) ? m.atoms.map(stamp) : m.atoms })),
    };
  }
  return next;
}

/**
 * The authoritative confidence gate — a PURE function of the program shape.
 * High iff the program has at least one atom AND every atom is a known,
 * resolvable op. Low otherwise (including an empty/absent program). Widening
 * "high" must be a deliberate, reviewed change — the `parser.test.js` corpus pins
 * every "must drop to low" oracle as a merge gate.
 */
// ETB-FIGHT (CR 701.12) gate: a `fight` atom binds its fighter to ctx.sourceId (the permanent whose
// triggered/activated ability it is), so it is only correct as the SOLE atom of its (sub)program. When a
// `fight` clause appears ALONGSIDE other atoms it is the anaphoric SPELL form — "Target creature you control
// gets +X/+Y. It fights target creature you don't control." (Epic Confrontation / Savage Smash / Swift Kick)
// — where "it" is the PUMPED target, NOT the source: the fighter would be mis-bound, and a spell threads no
// sourceId so the fight silently no-ops (a half-resolve). Force such a program LOW (→ Arbiter) — the whole
// spell stays non-native (CREED; the chosen-fighter spell form is a future, separate model).
function fightAtomMisplaced(atoms) {
  return Array.isArray(atoms) && atoms.some(a => a.op === "fight") && atoms.length !== 1;
}

export function programConfidence(program) {
  if (!program) return "low";
  // An additional cost the cast path can't pay must never let a card claim HIGH (CREED — a spell that
  // resolves while silently skipping its cost is a false positive). Today the parser only ever attaches a
  // "sacrifice" cost, enforced in actionDispatcher.applyCastSpell; this gate future-proofs the invariant —
  // any unsupported cost kind forces LOW until its cast-path enforcement exists.
  if (Array.isArray(program.additionalCosts) && program.additionalCosts.some(c => !SUPPORTED_ADDITIONAL_COST_KINDS.has(c.kind))) return "low";
  if (program.structure === "modal") {
    const modes = program.modal?.modes;
    if (!Array.isArray(modes) || modes.length < 2) return "low";
    return modes.every(mode => Array.isArray(mode.atoms) && mode.atoms.length > 0 && mode.atoms.every(a => KNOWN.has(a.op)) && !fightAtomMisplaced(mode.atoms))
      ? "high" : "low";
  }
  if (!Array.isArray(program.atoms) || program.atoms.length === 0) return "low";
  // DISCOVER must be the LAST atom: its cast-free/to-hand decision resolves at the ACTION layer AFTER the
  // effect program finishes, so any atom AFTER a discover would wrongly run before the decision (a reorder).
  // No printed card needs discover-not-last today; this guards the invariant as the vocabulary widens.
  const di = program.atoms.findIndex(a => a.op === "discover");
  if (di !== -1 && di !== program.atoms.length - 1) return "low";
  if (fightAtomMisplaced(program.atoms)) return "low";
  return program.atoms.every(a => KNOWN.has(a.op)) ? "high" : "low";
}

/**
 * Does the program contain an atom that REQUIRES a chosen target (vs. self / each-*
 * atoms that resolve with no target)? The single source of truth for the
 * trigger-flush routing gate (gameEngine.triggerStackPayload) AND the coverage
 * classifier (coverage.permanentTriggersCovered) — kept here so the runtime and the
 * metric can never drift. eachOpponent/eachCreature resolve without a chosen target.
 */
export function programNeedsChosenTarget(program) {
  if (!program) return false;
  const atoms = program.structure === "modal"
    ? (program.modal?.modes || []).flatMap(m => m.atoms || [])
    : (program.atoms || []);
  return atoms.some(a => a.targetType && !isNonChosenTargetType(a.targetType));
}

/**
 * Does the program contain a `counter` atom (P3.1)? The single source of truth for the
 * one place the counter atom must NOT route natively: the trigger-flush path
 * (gameEngine.buildTriggerStack). There, targets are auto-chosen by the default
 * first-legal chooser, which has no enemy-awareness and no self-exclusion — so an ETB
 * "counter target spell" (Mystic Snake) would silently counter the CONTROLLER'S OWN
 * spell when it's the first legal target on the stack (CLAUDE.md §1.2 — a confident
 * WRONG play, worse than the Arbiter route). Counter is SAFE on the cast path (the user
 * picks the target interactively; the AI holds counters) and the activated path (user-
 * picked; the AI doesn't activate), so the gate is narrow: trigger flush + the coverage
 * metric that mirrors it. Lift it once an enemy-aware/interactive flush chooser exists.
 */
export function programContainsCounter(program) {
  if (!program) return false;
  const atoms = program.structure === "modal"
    ? (program.modal?.modes || []).flatMap(m => m.atoms || [])
    : (program.atoms || []);
  return atoms.some(a => a.op === "counter");
}

// The chosen-target NON-CREATURE permanent-removal targetTypes (Disenchant / Stone Rain class). A
// SET so the parser, the trigger gate, and the enumerator can't drift on which types are covered.
export const PERMANENT_TARGET_TYPES = new Set([
  "artifact", "enchantment", "land", "permanent", "nonlandPermanent", "artifactOrEnchantment",
  "creatureOrEnchantment", "creatureOrLand", "creatureOrArtifact", "artifactOrLand", "enchantmentOrLand", // β-2 unions
  "planeswalker", "creatureOrPlaneswalker", // PW-7 — gate triggered destroy/exile-PW out of first-legal flush
]);

/**
 * Does the program contain a CHOSEN-TARGET non-creature permanent-removal atom (destroy/exile target
 * artifact/enchantment/land/permanent/…)? Gated OUT of the trigger flush (gameEngine.buildTriggerStack)
 * for the SAME reason as `counter`: the default first-legal flush chooser has no enemy-awareness, so a
 * trigger's "destroy target artifact" would silently destroy the CONTROLLER'S OWN permanent when it
 * sorts first — a confident WRONG play (CLAUDE.md §1.2). SAFE on the cast path (the user picks; the AI
 * holds non-creature removal), so the gate is narrow: the trigger flush + the coverage metric that
 * mirrors it. Lift it once an enemy-aware/interactive flush chooser exists. (CREATURE removal keeps
 * its existing trigger behavior — different targetType, unchanged by this gate.)
 */
export function programContainsChosenPermanentRemoval(program) {
  if (!program) return false;
  const atoms = program.structure === "modal"
    ? (program.modal?.modes || []).flatMap(m => m.atoms || [])
    : (program.atoms || []);
  return atoms.some(a => (a.op === "destroy" || a.op === "exile") && PERMANENT_TARGET_TYPES.has(a.targetType));
}

/**
 * The intended target SIDE for one atom — the basis for the α1 trigger-flush allowlist + the
 * enemy/own chooser (gameEngine.chooseTriggerTargets).
 *   "enemy"     — removal / disruption / damage aimed at an opponent's permanent / spell / the
 *                 opponent (deal-damage, destroy, exile, counter, tap, a negative -X/-X pump, a
 *                 -1/-1 counter).
 *   "own"       — a buff / utility the controller aims at their own side (a positive pump, a +1/+1
 *                 counter, untap, return-a-card-from-your-graveyard).
 *   "ambiguous" — could go either way (bounce), or any unknown targeting atom → NEVER auto-routed
 *                 on a trigger (the flush gates it to the Arbiter rather than risk a wrong target).
 * Returns null for a NON-targeting atom (no targetType, or an each/mass scope; self/team pumps carry
 * no targetType so they land here too) — those never need a chosen target.
 */
export function atomTargetIntent(atom) {
  if (!atom) return null;
  const tt = atom.targetType;
  if (!tt || isNonChosenTargetType(tt)) return null;
  switch (atom.op) {
    case "deal-damage":
    case "destroy":
    case "exile":
    case "counter":
    case "fight":
      // ETB-FIGHT — the target is "target creature you DON'T control" (enemy-side). LOAD-BEARING for the
      // trigger path: every fight card is an ETB/Enrage TRIGGER, so without this the HIGH-parsing fight
      // program would have an ambiguous-intent atom → programTriggerTargetsResolvable false → the trigger
      // silently routes to the Arbiter (a forbidden no-op fabrication path) instead of firing natively.
      return "enemy";
    case "tap":
      // TAP-TARGET-CREATURE: "you control" restriction targets own creatures (e.g. Magus of the Arena);
      // all other tap forms (opponent controls, defending player, power/toughness, flying) target an
      // enemy creature. The restriction check mirrors the add-counter you-control override pattern.
      if (atom.restrictions?.some(r => r.kind === "controller" && r.who === "you")) return "own";
      return "enemy";
    case "lose-life":
      // DEATH-DRAIN-TARGETED — "target player/opponent loses N life" is enemy-side like targeted damage:
      // draining yourself is strictly bad, so the trigger-flush chooser always picks an opponent (no
      // self-drain hazard — unlike the edict's "target player", which could self-sac). Non-targeted lose-life
      // (each/controller) has no targetType and already returned null above.
      return "enemy";
    case "rad":
      // RAD (CR 728) — "target player/opponent gets N rad counters" is enemy-side: rad mills + drains its
      // holder, so you never rad yourself by choice → the flush chooser always picks an opponent (parallel to
      // targeted lose-life). Non-targeted rad (each/controller) has no targetType and already returned null.
      return "enemy";
    case "sacrifice":
      // An edict aimed at "target opponent" is unambiguously enemy-side — the α1 flush chooser
      // picks an opponent and that opponent (the sacrificer) chooses the victim. "target player"
      // is AMBIGUOUS: the first-legal flush chooser could pick the CONTROLLER, self-edicting them
      // (a confident wrong play), so it stays out of the trigger-flush allowlist → Arbiter on
      // triggers (still native on the cast path, where the player/AI picks an opponent).
      return tt === "opponent" ? "enemy" : "ambiguous";
    case "pump":
      return (atom.ptDelta && ((atom.ptDelta.p || 0) < 0 || (atom.ptDelta.t || 0) < 0)) ? "enemy" : "own";
    case "add-counter":
      // COUNTER-TARGET-OWN: "you control" restriction overrides the counterType heuristic so that
      // Baleful Ammit's "-1/-1 on target creature you control" still picks the controller's own creature
      // (not an opponent's, as bare -1/-1 would). The restriction is authoritative; counterType is a
      // fallback for the UNFILTERED "target creature" form only.
      if (atom.targetType === "creatureYouControl") return "own";
      return (typeof atom.counterType === "string" && atom.counterType.trim().startsWith("-")) ? "enemy" : "own";
    case "untap":
    case "return-from-graveyard":
    case "reanimate":
      // The target is a card in the CASTER'S OWN graveyard — always own-side, so a reanimation TRIGGER
      // ("When this enters, return target creature card from your graveyard to the battlefield") routes
      // natively (programTriggerTargetsResolvable → true; the chooser's only candidates are own-gy cards).
      return "own";
    case "self-attach":
      // ETB-EQUIP-ATTACH — the Equipment attaches to "target creature YOU CONTROL", so the trigger-flush
      // chooser stays on the controller's own side (the host is always friendly; never an enemy creature).
      return "own";
    case "animate":
      // WALT-ANIMATE — you animate your OWN land into a creature to attack/block (own-side buff). No
      // animate card is a trigger today, so this only future-proofs the trigger-flush chooser; the cast
      // path picks the target interactively.
      return "own";
    case "win-game":
      // UPKEEP-WIN — "target player loses the game" (Door to Nothingness) is unambiguously enemy-side:
      // you'd never make yourself lose. (The "you win the game" form is non-targeted → null above.) No
      // win-game card is a TRIGGER with a chosen target today (the upkeep-win family wins the CONTROLLER,
      // no target), so this future-proofs the trigger-flush chooser; the cast/activated path picks the
      // target interactively.
      return "enemy";
    case "bounce":
    case "tuck":
      // Could target own OR enemy permanents — the trigger-flush chooser can't pick a side, so a tuck
      // TRIGGER stays non-native; SAFE on the cast/activated path (player/AI picks the target).
      return "ambiguous";
    default:
      return "ambiguous";
  }
}

/**
 * Can every chosen-target atom in this program have its target placed on a provably-correct side by
 * the α1 trigger chooser? True when no targeting atom is "ambiguous" (every one is enemy- or
 * own-intent, or is non-targeting). The single source of truth for the trigger-flush ALLOWLIST:
 * gameEngine.buildTriggerStack routes a targeted trigger natively only when this holds, and
 * coverage.triggerRoutesNatively MIRRORS it so the metric can't claim a routing the engine won't do.
 */
export function programTriggerTargetsResolvable(program) {
  if (!program) return false;
  const atoms = program.structure === "modal"
    ? (program.modal?.modes || []).flatMap(m => m.atoms || [])
    : (program.atoms || []);
  return atoms.every(a => atomTargetIntent(a) !== "ambiguous");
}

/**
 * Does the program contain a MASS removal atom — destroy / exile / -X-X scoped to a whole permanent
 * class on every battlefield (`eachCreature` board wipe, or MASS-NC's `eachArtifact` / `eachEnchantment`
 * / `eachLand` / `eachArtifactOrEnchantment`)? The AI HOLDS these (opponentAI.pickCastAction): the engine
 * resolves a symmetric wipe correctly, but the AI can't yet weigh whether nuking the board helps or hurts
 * it — an indiscriminate Wrath into its own developed board, or an Armageddon into its own mana base,
 * plays terribly. The player casts wipes normally. Narrow + deferred — lift it once a board-state-aware
 * wipe heuristic exists. (Mass DAMAGE, e.g. Pyroclasm, is intentionally NOT gated here — it's a
 * pre-existing cast and small symmetric burn is often a fine aggressive play.)
 */
const MASS_WIPE_SCOPES = new Set(["eachCreature", "eachArtifact", "eachEnchantment", "eachLand", "eachArtifactOrEnchantment"]);
export function programContainsMassRemoval(program) {
  if (!program) return false;
  const atoms = program.structure === "modal"
    ? (program.modal?.modes || []).flatMap(m => m.atoms || [])
    : (program.atoms || []);
  return atoms.some(a => MASS_WIPE_SCOPES.has(a.targetType) && ["destroy", "exile", "pump"].includes(a.op));
}

/**
 * Does the program contain a controller-scoped TEAM pump (`scope:"youControl"`, an Overrun /
 * Trumpet Blast / Inspired Charge "creatures you control get +N/+N [and gain KW] until end of
 * turn")? The AI HOLDS these for now (opponentAI.pickCastAction): a team pump only earns its
 * value cast pre-combat into a profitable attack, and the AI can't yet time it — casting it
 * blindly in its main phase (or with no creatures) wastes the card. Holding is SAFE (the buff
 * is the AI's own, so a miss only costs tempo, never a wrong play); the player casts it normally.
 * Narrow + deferred — lift it once a "pump my team before a good attack" heuristic exists.
 */
export function programContainsTeamPump(program) {
  if (!program) return false;
  const atoms = program.structure === "modal"
    ? (program.modal?.modes || []).flatMap(m => m.atoms || [])
    : (program.atoms || []);
  return atoms.some(a => a.op === "pump" && a.scope === "youControl");
}

/**
 * Does the program contain a FOG atom ("prevent all combat damage this turn", FOG-1)? The AI HOLDS it
 * (opponentAI.pickCastAction): fog is a purely DEFENSIVE reaction (cast when you're being attacked),
 * and the AI can't yet time it — casting it in its own main phase would set the turn-latch and wipe out
 * ITS OWN attackers' damage (actively self-defeating, worse than not casting). Holding is SAFE (a fog
 * the AI never casts only costs it a defensive option); the player casts it normally. Narrow + deferred
 * — lift it once a "fog when under lethal attack" heuristic exists.
 */
export function programContainsFog(program) {
  if (!program) return false;
  const atoms = program.structure === "modal"
    ? (program.modal?.modes || []).flatMap(m => m.atoms || [])
    : (program.atoms || []);
  return atoms.some(a => a.op === "fog");
}

// ─── WAVE 1 clause-parser registration (see import note at the top) ────────────────────────────
// Wire the new-module clause parsers into the additive seam. Runs after CLAUSE_PARSERS + the
// register fn are defined (load-safe). Gives GLOBAL visibility: every importer of parser.js
// (runtime via gameEngine, the coverage metric via coverage.js, tests) sees these parsers, so
// "manifest dread" and "amass <Subtype> N" clauses resolve to their KNOWN atoms everywhere.
registerClauseParser(manifestClauseParser);
registerClauseParser(amassClauseParser);
// UPKEEP-WIN (Wave 3b) — "you win the game" / "target player loses the game" → the win-game atom.
registerClauseParser(winGameClauseParser);

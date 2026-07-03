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

import { parseSpellEffect, parseCreatureTargetRestrictions } from "../spellEffects.js"; // parseGraveyardFilter moved to atoms/zones.graveyardReturnClauseParser (seam batch 16)
import { isNonChosenTargetType } from "../targetTypes.js";
import { ATOM_RESOLVERS, PAUSING_ATOM_OPS } from "./effectAtoms.js"; // PAUSING_ATOM_OPS (WI-3) — ops whose resolver can set pendingChoice; gates optional-payment payoffs
// WAVE 1 — clause parsers for the new-module atoms. Imported here (not self-registered from the atoms
// module) because effects/atoms/*.js must NOT import parser.js: parser.js → effectAtoms.js → atoms/*.js is
// a one-way edge, and an atoms-module importing parser.js back would TDZ-crash at load (registerClauseParser
// would run before parser.js's CLAUSE_PARSERS const initializes). These modules import only gameState/
// triggers/tokens (no parser), so importing their pure clause-parser fns here is cycle-free. Registered at
// the BOTTOM of this file, after CLAUSE_PARSERS is defined.
import { manifestClauseParser } from "./atoms/manifest.js";
import { amassClauseParser } from "./atoms/amass.js";
import { selfReturnClauseParser, selfReturnTriggerDetector } from "./atoms/selfReturn.js";
import { winGameClauseParser } from "./atoms/winGame.js";
import { rollDieClauseParser, resultScaledPayoffClauseParser } from "./atoms/roll.js"; // DICE-ROLL (CR 726) — roll a d20 + result-scaled token/draw payoff (Ancient Dragons)
import { freeCastClauseParser } from "./atoms/freeCast.js"; // FREE-CAST (CR 601.2b) — "you may cast a spell with MV N or less from your hand without paying its mana cost" (Expertise cycle)
import { counterClausesParser } from "./atoms/counterClauses.js";
import { tokenCopyParser } from "./atoms/tokenCopy.js";
import { createNamedTokenClauseParser, createTokenClauseParser } from "./atoms/tokens.js"; // seam batch 18 (create-named-token) + 20 (create-token vanilla creature tokens)
import { sacrificeEdictClauseParser, destroyExileClauseParser } from "./atoms/removal.js"; // seam batch 21 (sacrifice edicts) + 27 (destroy⇄exile, rider-folding)
import { sacrificeLandClauseParser } from "./atoms/sacLand.js"; // SAC-LAND-RAMP — "Sacrifice a land." controller self-sac (Roiling Regrowth / Cycle of Renewal)
import { parseDestroyTokenRider } from "./atoms/destroyTokenRider.js"; // DESTROY-TOKEN-RIDER — Pongify / Rapid Hybridization (destroy creature + can't-regen + that controller makes a token)
import { exploreClauseParser, libraryKeywordClauseParser, millClauseParser, tutorClauseParser, cascadeClauseParser } from "./atoms/library.js"; // seam batch 1 (explore) + 6 (discover/shuffle/scry/surveil) + 11 (mill) + 12e (tutor) + CASCADE (CR 702.85, synthesized keyword sentinel)
import { putFromHandClauseParser } from "./atoms/putFromHand.js"; // PUT-FROM-HAND — "put a/N/any number of creature|permanent card(s) from your hand onto the battlefield" (reuses the tutor sourceZone:"hand"→battlefield seam)
import { parseTutorFilter, parseTokenKeywords, SMALL_NUM } from "./parseHelpers.js"; // seam batch 2/4/19: shared parse helpers in a leaf (matchers import cycle-free); parseTutorFilter (rd block) + parseTokenKeywords (token-keyword matcher); SMALL_NUM for MULTI-COUNT damage count words
import { proliferateClauseParser, gainExperienceClauseParser, radClauseParser, cdmgPayoffClauseParser, addCounterClauseParser, addNamedCounterSelfClauseParser, shieldCounterClauseParser } from "./atoms/counters.js"; // seam batch 3 (proliferate/gain-experience) + 13 (rad) + 25 (add-counter ±1/+1) + CHOSEN-TYPE (named counter on self artifact) + SHIELD-COUNTER (CR 122.1c protective counter)
import { earthbendClauseParser, combatKeywordClauseParser, pumpClauseParser, condPumpXClauseParser, animateClauseParser, groupGrantClauseParser, setBasePtTeamClauseParser, fightClauseParser } from "./atoms/combat.js"; // seam batch 5 (earthbend) + 7 (tap/untap/cant-block/regenerate) + 12c (pump) + COND-X TEAM PUMP (Finale of Devastation) + 14 (animate) + GROUP-KEYWORD-GRANT + SET-BASE-PT-TEAM (Biomass Mutation)
import { miscClauseParser, drawEachPlayerClauseParser, drawForEachClauseParser, selfCastHalfXClauseParser } from "./atoms/misc.js"; // seam batch 8 (fog/divide-damage) + 23 (draw each-player slice) + 26 (draw for-each/count-scaled) + SELF-CAST half-X gain/draw (Hydroid Krasis)
import { distributeCountersClauseParser } from "./atoms/distributeCounters.js"; // distribute-counters (The Earth Crystal) — mirrors divide-bounded
import { discardClauseParser } from "./atoms/hand.js"; // seam batch 23 (discard family)
import { attachClauseParser, dealDamageScaledClauseParser, counterClauseParser, massFilteredDamageClauseParser, cdmgMassToDamagedPlayerClauseParser, copySpellClauseParser, copyCreatureSpellClauseParser } from "./atoms/stack.js"; // seam batch 9 (self-attach/attach-to-self) + 15 (deal-damage scaled board-count) + 28 (counter, rider-folding) + MASS-FILTERED-DAMAGE + CDMG-MASS-TO-DAMAGED-PLAYER (Balefire) + STORM (copy-spell) + COPY-A-CREATURE-SPELL (Double Major)
import { tuckClauseParser, graveyardReturnClauseParser, bounceClauseParser } from "./atoms/zones.js"; // seam batch 10 (tuck) + 16 (return-from-graveyard ⇄ reanimate) + 24 (bounce)
import { lifeClauseParser } from "./atoms/life.js"; // seam batch 17 (gain-life ⇄ lose-life, scaled + fixed-N)
import { staticAbilitiesCoverCard, parseStaticAbilities } from "../staticAbilityParser.js";
import { detectTriggers, registerTriggerDetector } from "../triggers.js";
import { parseKickerCost } from "../kicker.js"; // KICKED-SPELL-EFFECT — a clean single-mana Kicker cost (no multikicker / and-or / {X}); kicker.js → parseHelpers.js → keywords.js is acyclic (parser already imports parseHelpers)

/**
 * The atom ops the interpreter can resolve natively — DERIVED from the resolver
 * table so the HIGH-confidence gate and the resolver set can never drift apart.
 * parser → effectAtoms → spellEffects is a safe leaf edge (no cycle).
 */
export const KNOWN_ATOM_OPS = Object.freeze(Object.keys(ATOM_RESOLVERS));
const KNOWN = new Set(KNOWN_ATOM_OPS);

// EXILE-IF-DIES rider (subsystem 3) — a damage-linked death-replacement folded onto the preceding
// deal-damage atom (never its own atom; reminder text already stripped by splitClauses).
//  • SINGLE-TARGET: "If that creature would die this turn, exile it instead." (Lava Coil / Magma Spray /
//    Puncturing Blow) — only onto a deal-damage-to-TARGET-CREATURE atom ("that creature" = the one target).
//  • MASS "dealt damage this way": "If a creature dealt damage this way would die this turn, exile it
//    instead." (Pillar of Flame / Anger of the Gods / Yamabushi's Flame) — onto ANY deal-damage atom
//    (any-target / each-creature); the resolver exiles exactly the creatures THIS spell actually damaged.
const EXILE_IF_DIES_RIDER_RE = /^if that creature would die this turn, exile it instead$/i;
const EXILE_IF_DIES_MASS_RE = /^if a creature dealt damage this way would die this turn, exile it instead$/i;

// ONCE-PER-TURN — the atom ops whose resolver actually enforces the "Do this only once each turn"
// frequency latch (state.onceTriggersFiredThisTurn). Only these may carry the rider and stay HIGH; any
// other effect with the rider would silently over-fire (its resolver ignores the flag) → forced LOW.
// `draw` + `gain-life` honor it via the SAME per-source latch (gate key `${ctx.sourceId}_<op>`) — added for
// the COUNTERS-PLACED payoffs (Terrasymbiosis "draw that many cards. Do this only once each turn.", Earth
// Kingdom General "gain that much life. Do this only once each turn."). The latch is per-SOURCE + per-OP, so
// two different once-per-turn effects on the same source (none in the corpus today) wouldn't collide.
const ONCE_PER_TURN_HONORED = new Set(["discover", "draw", "gain-life"]);

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

// MTG-001 — the "(They|It|That creature|Those creatures|A creature destroyed this way|Creatures destroyed this
// way) can't be regenerated." rider. Anchored to these subject forms only, so a DAMAGE rider ("a creature dealt
// damage this way can't be regenerated this turn" — Incinerate) does NOT match (it requires "DESTROYED this way",
// not "dealt damage this way"). The "destroyed this way" forms cover Damn / Decree of Pain / In Garruk's Wake's
// single ("Destroy target creature. A creature destroyed this way can't be regenerated.") + mass ("Destroy all
// creatures. …") riders. STRIP (CANT_REGEN_STRIP) and DETECT (CANT_REGEN_TEST) are derived from one source so
// they can never drift: whatever the parse text strips, the parseEffectClause wrapper must detect.
const CANT_REGEN_SUBJECTS = /\b(?:they|it|that creature|those creatures|a creature destroyed this way|creatures destroyed this way) can'?t be regenerated\b/;
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
 * Drop the "You have no maximum hand size for the rest of the game." rider — VACUOUS in this engine, exactly
 * like the uncounterable rider above. The cleanup-step discard-to-max-hand-size is NOT implemented
 * (gameEngine cleanup is a documented placeholder; the narrator only describes the discard), so a player
 * never discards down to a maximum regardless of this static — the resolution is IDENTICAL whether or not
 * the parser sees this clause. Stripping it (rather than failing the all-or-nothing gate) lets Ancient Silver
 * Dragon's "roll a d20. Draw cards equal to the result." parse natively. Anchored to the exact sentence only.
 * (If a future slice implements cleanup discard, this strip must be revisited — the static would then matter.)
 */
function stripNoMaxHandSizeRider(text) {
  return String(text || "").replace(/\byou have no maximum hand size for the rest of the game\b\.?/gi, " ");
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
//
// ALTCAST-STRIP (flashback insight generalized): jump-start / retrace / escape are ALL just from-graveyard
// recast options — `Jump-start` (recast from GY paying the mana cost + discarding a card), `Retrace` (recast
// from GY discarding a land), `Escape—{cost}, Exile N cards` (recast from GY paying an exile cost). NONE
// changes the spell's resolution when it is cast NORMALLY from hand, so the body resolves identically and the
// keyword line is vacuous → stripped. The recast itself stays a SAFE false-negative (the engine won't offer
// the GY cast). Any escape PAYOFF rider ("if this spell was cast for its escape cost, …") lives in the BODY,
// not on the keyword line, so it self-gates the card to the Arbiter — stripping the line cannot fabricate it.
//
// ALTCAST-STRIP-2 — the alternate-COST / alternate-TIMING family: spectacle ("cast for spectacle cost if an
// opponent lost life"), prowl ("…if you dealt combat damage with a Rogue"), surge ("…if you/a teammate cast
// another spell"), miracle ("cast for miracle cost when you draw it"). Each is purely a different way/cost/
// timing to cast; the BODY resolves identically on a normal cast, so the line is vacuous → stripped. awaken
// is the ESCAPE-CLASS: `Awaken N—{cost}` carries a bonus ("If you cast this for awaken, ALSO put N counters
// on a land and it becomes a creature") that is CONDITIONAL on the awaken cast, so for a normal cast the body
// alone is the complete resolution (not offering awaken is a SAFE FN, exactly like escape's exile cost). The
// `awaken\s+\d+\s*[—–-]` anchor (number + dash) matches "Awaken 3—{4}{U}{U}" but NOT the MDFC face header
// "Awaken the Blood Avatar - Sorcery". DELIBERATELY EXCLUDES kicker (its kicked effect lives in the body →
// the card self-gates anyway), spree (modal additional costs that ADD effects), and bestow/dash/evoke/blitz
// (those add a kept effect / change the card's mode → NOT vacuous).
// OVERLOAD (CR 702.96) — "Overload {cost}": cast for the overload cost and change every "target" in the
// spell's text to "each". The PRINTED (non-overload) mode IS the single-target text; a NORMAL cast resolves
// it exactly as written (the runtime hard-casts at the normal cost with normal targeting and never offers the
// overload mode), so the line is vacuous for the normal cast — JOINING the family. The only unmodeled part is
// the optional overload "each" rewrite, which can never mis-resolve a normal cast (THE CREED, the same
// alternative-cost trade as spectacle/prowl). Anchored to a line-leading "overload {", so a prose mention or an
// "overload" TRIGGER (never line-leading with a brace cost) is untouched. Damn ("Destroy target creature. …"),
// Cyclonic Rift, Mizzium Mortars, Vandalblast, Electrickery, etc. flip native-spell on their printed mode.
const CAST_KEYWORD_LINE = /^[ \t]*(?:foretell\s*\{|suspend\s+\d+\s*[—–-]|splice onto arcane\s*\{|recover\s*\{|harmonize\s*\{|basic landcycling\s*\{|cycling\s*\{|flashback\s*\{|jump-start\b|retrace\b|escape\s*[—–-]|spectacle\s*\{|prowl\s*\{|surge\s*\{|miracle\s*\{|overload\s*\{|awaken\s+\d+\s*[—–-])[^\n]*$/gim;
// MADNESS_LINE needs a TIGHTER anchor than the others: a madness line can be COMPOUND
// ("Madness {R}, cycling {1}{R}, kicker {2}{R}, buyback {4}{R}" — Blast from the Past), and buyback's
// kept "return to hand as it resolves" effect lives ONLY on that line. A greedy `[^\n]*$` strip would drop
// it → an FP (the card would flip native without the buyback return). So madness is stripped ONLY when its
// line is madness-ALONE: the cost, an optional reminder paren, then end-of-line. A compound keyword line
// (comma + another keyword after the cost) does NOT match and stays intact → the card keeps its non-vacuous
// rider and correctly routes to the Arbiter. Madness itself (cast-from-exile on discard) is vacuous for the
// normal cast, so a madness-alone body resolves identically.
const MADNESS_LINE = /^[ \t]*madness\s*(?:\{[^}]*\})+[ \t]*(?:\([^\n]*\))?[ \t]*$/gim;
function stripCastKeywordLines(text) {
  return String(text || "").replace(CAST_KEYWORD_LINE, " ").replace(MADNESS_LINE, " ");
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
  const draw = /(\bdraws?\s+)X(\s+cards?\b)/i; // "draws?" covers the each-player/target form ("target player draws X cards", "each player draws X cards") in addition to the controller "draw X cards"
  const pumpSym = /(\bgets\s+)\+X\/\+X\b/i;
  // ASYMMETRIC X-pump (X-PUMP-ASYM): ONE pip is +X, the other a printed value — "+X/+0" / "+X/+2"
  // (slot "p") and "+0/+X" / "+2/+X" (slot "t"). The non-X pip MUST be a digit (so these can never
  // match the symmetric +X/+X handled above). The caller carries the printed ptDelta + amountXSlot so
  // the resolver scales only the marked pip; the other reads its printed value.
  const pumpXP = /(\bgets\s+\+)X(\/[+]\d+\b)/i;
  const pumpXT = /(\bgets\s+[+]\d+\/[+])X\b/i;
  if (damage.test(clause)) return { clause: clause.replace(damage, (_, a, b) => `${a}1${b}`), xSlot: null };
  if (draw.test(clause)) return { clause: clause.replace(draw, (_, a, b) => `${a}1${b}`), xSlot: null };
  if (pumpSym.test(clause)) return { clause: clause.replace(pumpSym, (_, a) => `${a}+1/+1`), xSlot: null };
  if (pumpXP.test(clause)) return { clause: clause.replace(pumpXP, (_, a, b) => `${a}1${b}`), xSlot: "p" };
  if (pumpXT.test(clause)) return { clause: clause.replace(pumpXT, (_, a) => `${a}1`), xSlot: "t" };
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

function makeProgram({ confidence, structure = "sequence", atoms = [], modal = null, xSpell = false, unparsedTail = null, selfExile = false }) {
  // `selfExile` (Finale of Revelation "Exile <this>.") — the resolved spell exiles ITSELF instead of going to
  // the graveyard (runEffectProgram honors it at GY-1). Omitted from the object when false so the vast majority
  // of programs are byte-identical to before (no shape churn).
  return { version: 1, source: "parser", confidence, structure, atoms, modal, xSpell, unparsedTail: unparsedTail ?? null, ...(selfExile ? { selfExile: true } : {}) };
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

// DICE-ROLL CREED gate — a `diceResult` count source (kind:"diceResult" on countFor/amountCount) reads
// state.diceRoll, which is ONLY stamped by a roll-d20 atom. So an atom carrying a diceResult count is correct
// ONLY when a roll-d20 atom PRECEDES it in the same program (else the read would silently resolve to 0 — a
// dropped-payoff FP, CREED). Conversely a roll-d20 with NO following diceResult payoff is a bare die roll we
// don't model the outcome of (the result would do nothing) → also forced low. Both invariants here: every
// roll-d20 is followed by ≥1 diceResult payoff, and every diceResult payoff is preceded by a roll-d20.
function usesDiceResult(atom) {
  return atom?.countFor?.kind === "diceResult" || atom?.amountCount?.kind === "diceResult";
}
function diceRollSequenceOk(atoms) {
  let rolled = false;
  let sawRoll = false;
  let sawPayoffAfterRoll = false;
  for (const a of atoms) {
    if (a?.op === "roll-d20") {
      // A roll must be followed by its payoff; a roll already pending without a payoff yet is fine until end.
      rolled = true; sawRoll = true; continue;
    }
    if (usesDiceResult(a)) {
      if (!rolled) return false;     // a diceResult payoff with no preceding roll → drop
      sawPayoffAfterRoll = true;
      rolled = false;                // the payoff consumed the roll
    }
  }
  if (sawRoll && rolled) return false; // a trailing roll-d20 with no payoff after it → drop (unmodeled outcome)
  if (sawRoll && !sawPayoffAfterRoll) return false;
  return true;
}

// REVEAL-TOP-MV CREED gate (Yuriko) — a `revealedCardMV` count source (kind:"revealedCardMV" on
// amountCount/countFor) reads state.revealedCardMV, which is ONLY stamped by a reveal-top-to-hand atom. So an
// atom carrying a revealedCardMV count is correct ONLY when a reveal-top-to-hand atom PRECEDES it in the same
// program (else the read would silently resolve to 0 — a dropped-magnitude FP, CREED). Mirrors
// diceRollSequenceOk: every revealedCardMV payoff is preceded by a reveal-top-to-hand. (A bare reveal-top-to-
// hand with NO following revealedCardMV payoff is fine — it's just a public-info draw, harmless; only the
// COUNT read needs the gate, unlike the dice roll whose bare result would do nothing.) Today this only fires
// via the collapsed matchRevealTopDrainByMv (which emits the pair together), so the gate is belt-and-braces —
// but it keeps the inter-atom-value convention airtight if a future slice composes the count elsewhere.
function usesRevealedCardMV(atom) {
  return atom?.countFor?.kind === "revealedCardMV" || atom?.amountCount?.kind === "revealedCardMV";
}
function revealTopSequenceOk(atoms) {
  let revealed = false;
  for (const a of atoms) {
    if (a?.op === "reveal-top-to-hand") { revealed = true; continue; }
    if (usesRevealedCardMV(a) && !revealed) return false; // a revealedCardMV payoff with no preceding reveal → drop
  }
  return true;
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
    // FINALE-SHUFFLE-REMINDER — strip the vacuous "If you search your library this way, shuffle." sentence
    // (Finale of Devastation). Its "and/or graveyard" tutor (bfxg) ALWAYS searches the library, so the CR-
    // 701.19e shuffle the tutor's own resolver runs already covers this conditional exactly — stripping it
    // just prevents the sentence from orphaning into an unparsed clause (→ low). Anchored to the exact
    // wording, so it can only PROMOTE this already-low library-and/or-graveyard shape; no other card prints it.
    .replace(/\s*If you search your library this way,?\s+shuffle\.?/gi, "")
    // ===== WALT-ANIMATE ===== strip the vacuous "it's/that's still a land" reminder. A land that
    // "becomes a creature" is additive BY DEFAULT (it stays a land — that's why it still taps; 0
    // non-additive land-animates in the corpus), so this clause never changes resolution. Stripping it
    // lets a separate-sentence reminder ("…until end of turn. It's still a land. Draw a card.") not orphan
    // into an unparsed clause, and folds the inline "…creature that's still a land" form to the core.
    .replace(/\s*(?:it[’']s|that[’']s|they[’']re)\s+still\s+(?:a\s+land|lands)\.?/gi, "")
    .replace(
      /(\bcreates?\b[^.]*?\btokens?\b[^.]*?)\.\s+it has (["“'])/gi,
      "$1 with $2",
    )
    // PUMP-UNTAP — fold the separate "Untap it." sentence that follows a combat-trick pump ("Target
    // creature[ you control] gets +N/+N and gains KW until end of turn. Untap it." — Vines of the Recluse,
    // Acrobatic Leap, Octopus Form) into the pump sentence as " and untap it", so the pumpClauseParser binds
    // the untap to the SAME single target ("it" = the pumped creature) rather than orphaning it into a
    // separate, unbindable "untap it" clause. Only a +N/+N-with-keyword pump (the exact combat-trick shape).
    .replace(/(gets [+-]\d+\/[+-]\d+ and gains [^.]*?\buntil end of turn)\.\s+untap it\b\.?/gi, "$1 and untap it")
    // TAP-PERMANENT-LOCK — fold Koma's separate "Its activated abilities can't be activated this turn."
    // sentence that follows "Tap target permanent." into the tap sentence as " and its activated abilities
    // …", so combatKeywordClauseParser binds the activated-ability LOCK to the SAME single target ("Its" =
    // the tapped permanent) rather than orphaning it into a separate, unbindable clause (the same fold as
    // PUMP-UNTAP above). Anchored to the exact tap-permanent + rider pair, so it can only PROMOTE Koma's
    // already-low mode, never regress another card.
    .replace(/(tap target permanent)\.\s+its activated abilities can't be activated this turn\.?/gi, "$1 and its activated abilities can't be activated this turn")
    // TAP-NONLAND-LOCKDOWN — fold Junk Winder's separate "It doesn't untap during its controller's next untap
    // step." sentence that follows "Tap target nonland permanent an opponent controls." into the tap sentence
    // as " and it doesn't untap …", so combatKeywordClauseParser binds the one-shot no-untap lockdown to the
    // SAME single target ("It" = the tapped permanent) rather than orphaning it into a separate, unbindable
    // clause (the same fold as TAP-PERMANENT-LOCK / PUMP-UNTAP above). Anchored to the exact tap-nonland +
    // rider pair, so it can only PROMOTE this already-low shape, never regress another card.
    .replace(/(tap target nonland permanent an opponent controls)\.\s+it doesn[’']t untap during its controller[’']s next untap step\.?/gi, "$1 and it doesn't untap during its controller's next untap step")
    // DRAW-LOSE-SUBJECT — "Target player draws N cards and loses M life" (Sign in Blood, Blood Pact, Painful
    // Lesson, Harrowing Journey) shares ONE subject across the conjunction; the top-level " and " split would
    // orphan "loses M life" (no subject → unmodeled). Inject the subject into the 2nd half so both halves parse
    // with their EXISTING who:"target" atoms (draw + lose-life). A trailing rider (", and gets poison" /
    // ", loses … and gets") doesn't match the contiguous "and loses \d+ life" → stays Arbiter (FN-safe).
    .replace(/(target player draws \w+ cards?) and (loses \d+ life)/gi, "$1. Target player $2")
    // WHEEL — "Each player discards their hand, then draws N cards" (Wheel of Fortune, Reforge the Soul, Wheel
    // of Fate): the ", then" split orphans "draws N cards" of its "each player" subject. Inject it so the draw
    // half parses with the EXISTING draw who:"eachPlayer" atom (the discard-hand half is a new all-mode atom).
    .replace(/(each player discards their hand), then (draws \w+ cards?)/gi, "$1. Each player $2")
    // SELF-CAST HALF-X ROUNDING (CR 107.3) — a TRAILING "Round down/up each time." directive governs every
    // "half X" magnitude in the SAME effect (Hydroid Krasis: "you gain half X life and draw half X cards.
    // Round down each time."). The directive is its own sentence, so the sentence split would orphan it into an
    // unparsed clause (→ low) AND leave each "half X" half without its rounding rule. Fold the rounding inline
    // onto each "half X <noun>" occurrence ("half X life" → "half X life rounded down"), then strip the now-
    // redundant directive sentence — so the per-clause half-X parser sees a self-contained "gain half X life
    // rounded down" / "draw half X cards rounded down". Gated to the EXACT "(round down|round up) each time"
    // wording (the only corpus form for the BOTH-halves directive); a per-clause ", rounded up" (Contaminated
    // Drink) is untouched (it's already inline). Anchored + idempotent on its own output; a card without the
    // trailing directive is byte-identical.
    .replace(
      /^(.*?\bhalf x\b.*?)\.\s*round (down|up) each time\.?\s*$/i,
      (_, body, dir) => `${body.replace(/\bhalf x\b(\s+\w+)/gi, `half x$1 rounded ${dir.toLowerCase()}`)}.`,
    )
    // RAMP-MULTI-X TWO-SENTENCE FOLD — Traverse the Outlands prints the X-count clause and the put clause as
    // TWO sentences ("…search your library for up to X basic land cards, where X is the greatest power among
    // creatures you control. Put those cards onto the battlefield tapped, then shuffle."). The sentence split
    // would sever the "Put those cards…" instruction from its "search…where X is…" antecedent — leaving the
    // search clause without a destination AND orphaning a bare, unbindable "Put those cards…" fragment. Fold
    // the period into a comma so the whole thing stays ONE "search your library…" clause (the search anchor
    // below keeps it intact), which the mfx tutor matcher then parses as a single RAMP-MULTI-X atom. Anchored
    // to the EXACT "search…for up to X…cards, where X is…. Put those cards onto the battlefield" pair, so it
    // can only PROMOTE this already-low two-sentence shape — a one-sentence form (Boundless Realms) and any
    // other "Put those cards" usage are byte-identical / untouched.
    .replace(
      /(search your library for up to x [a-z][a-z ,]*? cards,? where x is [^.]+?)\.\s+(put those cards onto the battlefield)/gi,
      "$1, $2",
    )
    // SELF-SAC + MULTI-FETCH SEQUENCE (Defense of the Heart) — the compound upkeep-trigger effect "sacrifice
    // this <noun>, search your library for up to two creature cards, put those cards onto the battlefield, then
    // shuffle" is a comma-joined SEQUENCE, not one instruction: the leading "sacrifice this <noun>" is a
    // self-sac atom, the rest is a self-contained tutor. The top-level " and "/", then " split (below) doesn't
    // sever the comma between the self-sac and the tutor, so the whole head-chunk ("sacrifice this <noun>,
    // search…for…cards, put those cards…") would parse as one unmatched clause → low. Cut the FIRST comma
    // (after the leading imperative "sacrifice this <noun>") to a period so the sentence splitter separates the
    // self-sac clause from the tutor, and the tutor half — now STARTING "search your library" — takes the
    // keep-whole tutor path (its internal "…cards, put those cards…" comma is preserved). Anchored to a
    // CLAUSE-INITIAL imperative "sacrifice this <noun>" IMMEDIATELY followed by ", search your library" (the
    // corpus's only such compound is Defense of the Heart), so it can only PROMOTE this one already-low shape;
    // a "you/may sacrifice…" or any non-clause-initial form is untouched. Each split piece is still judged on
    // its own merits (an unmodeled half → low → Arbiter), so a mis-fold can never yield a confident wrong partial.
    .replace(
      /^(sacrifice this (?:creature|permanent|token|land|artifact|enchantment|aura|equipment|vehicle)), (search your library)/i,
      "$1. $2",
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
    // as one clause so the clause parse binds the pump + grant to the SAME target.
    if (/^target creature (?:(?:you control|an opponent controls) )?(?:gets [+-]\d+\/[+-]\d+ and )?gains\b.*\buntil end of turn(?: and untap it)?$/i.test(sentence)) { clauses.push(sentence); continue; }
    // CAUSATIVE pump + keyword grant ("have target creature get +2/+0 and gain deathtouch until end of turn" —
    // Painsmith, the inner of "you may have …"): the " and " joins the P/T bump to the grant within ONE causative
    // instruction, not a top-level boundary. Keep it whole so pumpClauseParser binds the pump + grant to the SAME
    // target (mirrors the spell-voice "gets … and gains" rule above). The bare causative pump has no " and " so
    // it never reaches this split path; this rule only protects the +keyword causative shape.
    if (/^(?:you may )?have target creature get [+-]\d+\/[+-]\d+ and gain\b.*\buntil end of turn$/i.test(sentence)) { clauses.push(sentence); continue; }
    // Overrun-style TEAM pump + keyword grant ("Creatures you control get +3/+3 and gain
    // trample until end of turn"): the " and " between the P/T bump and the grant is INTERNAL
    // to one team-pump instruction, not a top-level effect boundary. Keep the whole sentence so
    // the clause parse binds the controller-scoped pump + grant together (plural subject →
    // "gain", no trailing s).
    if (/^creatures you control get [+-]\d+\/[+-]\d+ and gain\b.*\buntil end of turn$/i.test(sentence)) { clauses.push(sentence); continue; }
    // COND-X TEAM PUMP (Finale of Devastation) — "If X is N or more, creatures you control get +X/+X and gain
    // KW until end of turn". The "If X is N or more, " prefix conditions the WHOLE team pump on the chosen X;
    // the " and gain …" is INTERNAL to that one pump instruction (same as the unconditional form above), NOT a
    // top-level boundary. Keep the whole sentence so condPumpXClauseParser binds the condition + pump + grant
    // together. All-or-nothing anchored downstream (an un-grantable keyword / non-+X/+X delta fails → low).
    if (/^if x is \d+ or more, creatures you control get \+x\/\+x(?: and gain\b.*)? until end of turn$/i.test(sentence)) { clauses.push(sentence); continue; }
    // TEAM-PUMP-SCOPE — the "other creatures" (excludes the source) and "<Subtype>s you control [other than
    // this creature]" (subtype-filtered) variants of the Overrun-style team pump + keyword grant ("Other
    // creatures you control get +2/+2 and gain trample until end of turn" — End-Raze Forerunners; "Dinosaurs
    // you control other than this creature get +1/+1 and gain flying until end of turn" — Triceraton Commander).
    // The " and gain …" is INTERNAL to the one team-pump instruction (same as the unfiltered form above), NOT a
    // top-level boundary — keep the whole sentence so the clause parse binds the scoped pump + grant together.
    if (/^(?:other creatures|[a-z]+s) you control (?:other than this creature )?get [+-]\d+\/[+-]\d+ and gain\b.*\buntil end of turn$/i.test(sentence)) { clauses.push(sentence); continue; }
    // TYPE-NEGATED TEAM PUMP + KEYWORD GRANT — the "non-<Subtype> creatures you control get +P/+T and gain KW …"
    // variant (Return of the Wildspeaker's +3/+3 mode has no keyword, so it never reaches this " and " guard;
    // this only protects the keyword-grant sibling form). The " and gain …" is INTERNAL to the one team-pump
    // instruction — keep the whole sentence so pumpClauseParser binds the negated-scope pump + grant together.
    if (/^non-[a-z]+ creatures you control get [+-]\d+\/[+-]\d+ and gain\b.*\buntil end of turn$/i.test(sentence)) { clauses.push(sentence); continue; }
    // MULTI-COUNT PUMP + KEYWORD GRANT (VERIFY PROTOTYPE) — keep "up to N target creatures each get ±P/±T and gain KW until end of turn" whole.
    if (/^up to (?:two|three|four|five) target creatures(?: you control)? each get [+-]\d+\/[+-]\d+ and gain\b.*\buntil end of turn$/i.test(sentence)) { clauses.push(sentence); continue; }
    // GROUP-KEYWORD-GRANT — "(Creatures|Permanents) you control gain <kw> and <kw> until end of turn"
    // (Heroic Intervention "hexproof and indestructible"): the " and " joins a KEYWORD LIST, INTERNAL to
    // one group-grant instruction, NOT a top-level effect boundary. Keep the whole sentence so
    // groupGrantClauseParser sees the full keyword list. All-or-nothing anchored downstream (an un-grantable
    // word → null → low → Arbiter), so keeping too much together can only fail to match, never a wrong partial.
    if (/^(?:creatures|permanents) you control gains?\b.*\buntil end of turn$/i.test(sentence)) { clauses.push(sentence); continue; }
    // SWITCH-PT — "switch <referent> power and toughness until end of turn": the " and " in "power and
    // toughness" is INTERNAL to the one swap instruction, NOT a top-level effect boundary. Keep it whole so
    // combatKeywordClauseParser binds the layer-7d swap (else it shatters into "…power" + "toughness…" → low).
    if (/^switch (?:target creature's|this creature's|the triggering creature's) power and toughness until end of turn$/i.test(sentence)) { clauses.push(sentence); continue; }
    // SELF pump + keyword grant ("This creature gets +1/+0 and gains trample until end of turn" / "This
    // creature gains flying and vigilance until end of turn") — the " and " is INTERNAL to the one
    // self-grant instruction (CR 113.7 "this creature" = the source), NOT a top-level effect boundary.
    // Keep the whole sentence so the clause parse binds the self pump + every granted keyword together
    // (ACT-KW-GRANT). All-or-nothing anchored, so an un-grantable keyword just fails to match → low.
    if (/^this creature (?:gets [+-]\d+\/[+-]\d+ and )?gains\b.*\buntil end of turn$/i.test(sentence)) { clauses.push(sentence); continue; }
    // TRIG-PRONOUN-IT — the NON-SELF triggering-permanent analogue of the self pump+grant above: the
    // detectTriggers sentinel "the triggering creature gets +P/+T and gains KW until end of turn". Same
    // INTERNAL " and " (one pump+grant instruction on the triggering creature), so keep the whole sentence
    // for the clause parse. All-or-nothing anchored; a sentinel-only phrase, never produced by a spell.
    if (/^the triggering creature (?:gets [+-]\d+\/[+-]\d+ and )?gains\b.*\buntil end of turn$/i.test(sentence)) { clauses.push(sentence); continue; }
    // ===== TOKENS ===== a keyword token minted with several keywords ("Create a 4/4 white Angel
    // creature token with flying and vigilance") joins them with " and " — INTERNAL to the one
    // create-token instruction, not a top-level effect boundary. Keep the whole sentence so
    // the clause parse binds every keyword to the same token. The token matcher is all-or-nothing
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
    // create-token instruction, NOT a top-level effect boundary. Keep the whole sentence so the clause parse
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
    // the clause parse binds the P/T-set + every granted keyword to the same animate atom (all-or-nothing
    // anchored — an un-grantable keyword / color-set / permanent duration just fails to match → low → Arbiter).
    if (/^(?:until end of turn, )?(?:target|this) land(?: you control)? becomes a \d+\/\d+\b.*\bcreature\b/i.test(sentence)) { clauses.push(sentence); continue; }
    // OVERRUN-X — a COUNT-SCALED team pump ("[Until end of turn,] creatures you control gain trample and
    // get +X/+X[ until end of turn], where X is the greatest power among / the number of creatures you
    // control" — Overwhelming Stampede, Craterhoof Behemoth's ETB). The " and " between the keyword grant
    // and the +X/+X bump, plus the trailing ", where X is …" count clause, are INTERNAL to one team-pump
    // instruction — keep the whole sentence so the clause parse binds grant + scaled pump + count source
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
    // MASS-BOUNCE-EXCEPT (Whelming Wave) — "return all creatures to their owners' hands except for Krakens,
    // Leviathans, Octopuses, and Serpents": the trailing " and " joins the LAST creature SUBTYPE in the
    // exclusion list, INTERNAL to one mass-bounce target, NOT a top-level effect boundary. Keep the whole
    // sentence so bounceClauseParser sees the full "except for <Subtype>s … and <Subtype>s" list (else the
    // split below shatters it into a bounce-all + an unbindable "Serpents" fragment). All-or-nothing anchored
    // downstream (a non-curated subtype → null → low → Arbiter), so keeping too much together can only fail to
    // match, never a confident wrong partial. Anchored to the except-for form (the plain unfiltered
    // "return all creatures to their owners' hands" — Evacuation — has no " and ", so it splits cleanly already).
    if (/^return all creatures to their owners['’] hands except for .+$/i.test(sentence)) { clauses.push(sentence); continue; }
    // SOURCE-POWER-FANOUT (Chandra's Ignition) — "target creature you control deals damage equal to its power
    // to each other creature and each opponent": the " and " between "each other creature" and "each opponent"
    // is INTERNAL to the one fan-out target, NOT a top-level effect boundary. Keep the whole sentence so
    // parseClauseToAtom binds the combined fan-out (the SOURCE-POWER-FANOUT matcher). Anchored to the exact
    // bare form (a rider/qualifier doesn't match → splits → low → Arbiter, FN-safe).
    if (/^target creature you control deals damage equal to its power to each other creature and each opponent$/i.test(sentence)) { clauses.push(sentence); continue; }
    // SET-BASE-PT-TEAM (Biomass Mutation) — "creatures you control have base power and toughness X/X until end
    // of turn": the " and " inside "base power and toughness" is INTERNAL to the one base-P/T-set instruction,
    // NOT a top-level effect boundary. Keep the whole sentence so setBasePtTeamClauseParser binds it (else it
    // shatters into "…base power" + "toughness X/X…" → low). Anchored to the exact X/X form.
    if (/^creatures you control have base power and toughness x\/x until end of turn$/i.test(sentence)) { clauses.push(sentence); continue; }
    // TAP-PERMANENT-LOCK (Koma) — the normalize fold above joined "Tap target permanent. Its activated
    // abilities can't be activated this turn." into one sentence with an internal " and "; that " and " is
    // INTERNAL to the one tap+lock instruction ("Its" = the tapped permanent), NOT a top-level effect
    // boundary. Keep the whole sentence so combatKeywordClauseParser binds the tap + activated-lock to the
    // SAME single target (else the top-level split below shatters it into "tap target permanent" + an
    // unbindable "its activated abilities …" → low). Anchored to the exact folded form.
    if (/^tap target permanent and its activated abilities can't be activated this turn$/i.test(sentence)) { clauses.push(sentence); continue; }
    // TAP-NONLAND-LOCKDOWN (Junk Winder) — the normalize fold above joined "Tap target nonland permanent an
    // opponent controls. It doesn't untap during its controller's next untap step." into one sentence with an
    // internal " and "; that " and " is INTERNAL to the one tap+lockdown instruction ("It" = the tapped
    // permanent), NOT a top-level effect boundary. Keep the whole sentence so combatKeywordClauseParser binds
    // the tap + no-untap lockdown to the SAME single target (else the top-level split below shatters it into
    // "tap target nonland permanent an opponent controls" + an unbindable "it doesn't untap …" → low).
    if (/^tap target nonland permanent an opponent controls and it doesn't untap during its controller's next untap step$/i.test(sentence)) { clauses.push(sentence); continue; }
    // TOKEN-COPY-KEYWORD (Irenicus's Vile Duplication) — "create a token that's a copy of target creature you
    // control, except the token has flying and it isn't legendary": the " and " joins the granted-keyword rider
    // to the "it isn't legendary" no-op, INTERNAL to the one copy instruction, NOT a top-level effect boundary.
    // Keep the whole sentence so tokenCopyParser sees the full "except the token has <kw…> and it isn't legendary"
    // rider (else the top-level split severs it into a plain copy + an unbindable "it isn't legendary" fragment,
    // OR drops a multi-keyword grant). All-or-nothing anchored downstream (an un-grantable keyword → null → low →
    // Arbiter), so keeping too much together can only fail to match, never a confident wrong partial.
    if (/^create a token that(?:'s| is) a copy of target creature you control, except the token has .+$/i.test(sentence)) { clauses.push(sentence); continue; }
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

// ===== parseExtendedAtom: DELETED (seam batch S2) ===== The P2.7 anchored-matcher chain is fully drained:
// every op family migrated to a registered CLAUSE_PARSERS module (see the registration tombstones at the
// bottom of this file), and the final residue — the CDMG-PLAYER-PAYOFF / COUNTERS-PLACED / DIES-RAD sentinel
// family — now lives in atoms/counters.cdmgPayoffClauseParser (lifted as ONE unit; the matchers shared no
// local state). The ext dispatch step in parseClauseToAtom and the 5 rider-dispatch parseExtendedAtom()||X
// leads (provably dead — a removal/counter lead can never match a draw/rad sentinel) went with it.
// SMALL_NUM + NUM_WORD moved to ./parseHelpers.js (seam batch 2 — a leaf the matcher modules can import
// without the parser.js TDZ cycle). Imported at the top of this file.

// Tutor helpers (TUTOR_FILTER_WORDS + BASIC_LAND_SUBTYPES + parseTutorFilter + UP_TO_N_WORD + parseTutorMv)
// moved to ./parseHelpers.js (seam batch 12d — a leaf the tutor matcher module + matchImpulseDig can import
// cycle-free). Imported at the top of this file.

// parseGrantedKeywords moved to ./parseHelpers.js (seam batch 12b — a leaf the pump matcher module can import
// cycle-free; also used by the still-inline animate matcher). Imported at the top of this file.

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
// ===== TOKEN HELPERS ===== parseTokenManaAbility (+ TOKEN_MANA_ABILITY / canonicalizeManaAbility) and
// parseTokenKeywords (+ TOKEN_KEYWORD_CANON) moved to ./parseHelpers.js (seam batch 19 — a leaf so the
// create-token clause parser in atoms/tokens.js can import them cycle-free; still used by the still-inline
// create-token + token-keyword matchers below). Imported at the top of this file.

// (parseTokenKeywords moved to ./parseHelpers.js with parseTokenManaAbility — see the seam batch 19 note above.)

// ===== DMG-SCALE / FOR-EACH count sources ===== migrated to effects/parseHelpers.parseCountSource
// (seam batch 4 — the self-contained count-source cluster + its COUNT_* maps live in the leaf now, so the
// matcher modules can import parseCountSource cycle-free). Imported at the top of this file.

// (function parseExtendedAtom — deleted in seam batch S2; see the drain note above.)

// ADDITIVE registry seam (WAVE 0): module-level list of extra clause parsers. A parser is
// `(clause, ctx) => Atom | null` (ctx = { cardType, hasX }) consulted by parseClauseToAtom BEFORE the
// legacy parse, in registration order (the first truthy atom wins). Since seam batch S2 drained
// parseExtendedAtom entirely, this registry IS the whole anchored-matcher dispatch.
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
    if (!inner) return null;
    // FREE-CAST (CR 601.2b) — its "you may cast …" optionality is realized at the ACTION layer (the
    // cast-or-decline decision offered by legalChoices after the atom parks the candidates), NOT as an
    // optional-effect yes/no pause in runEffectProgram. Stamping `optional` would double-prompt (a yes/no
    // before the cast-or-decline), so the free-cast atom is left un-optional — its "may" is the decline.
    // ONE-SHOT EXTRA-LAND (CR 505.5b) — same shape: "you may play an additional land this turn" grants the
    // OPTION to play more lands, realized at the LAND-PLAY step (the player chooses whether to use the bigger
    // budget; CR 601.3e doesn't force the extra play). It's costless upside with no resolution-time decision,
    // so the atom is left UN-optional too — otherwise Explore ("…land this turn. Draw a card.") would become
    // optional-then-mandatory and fail the optionalsFormSuffix suffix rule, dropping a clean card to Arbiter.
    return (inner.op === "free-cast" || inner.op === "play-extra-land-this-turn") ? inner : { ...inner, optional: true };
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
    // ===== TOKENS ===== T3 X/X create-token (DOUBLE-X subsystem) — the token's POWER/TOUGHNESS is the spell's
    // {X} too: "Create X X/X <descriptor> creature tokens" (count=X AND P/T=X — Gelatinous Genesis {X}{X}{G})
    // or "Create an X/X <descriptor> creature token" (count=1, P/T=X — Slime Molding {X}{G}). Rewrite the X/X
    // P/T (and a leading "create x" count) to the sentinel "1/1" so the FULL create-token atom parses
    // (descriptor / keywords verbatim), then stamp ptX:true (the resolver substitutes ctx.xValue for the
    // token's P/T) plus countX when the count itself is X. CREED GUARD: a "…, where X is <board metric>" P/T
    // (Spoils of Blood / Miming Slime / Shark Typhoon) is a BOARD-derived X, NOT the cast {X} — reject it
    // outright (`where`), so its P/T is never mis-read as the chosen X. The $-anchored create-token regex
    // would already null on the trailing ", where X is …" tail; the explicit `where` bail is belt-and-suspenders.
    if (/^create (?:x|a|an|one) x\/x /i.test(s) && !/\bwhere\b/i.test(s)) {
      const countIsX = /^create x /i.test(s);
      const sentinel = s.replace(/^create x /i, "create one ").replace(/\bx\/x\b/i, "1/1");
      const base = parseClauseToAtom(cardType, sentinel, false);
      if (!base || base.op !== "create-token") return null;
      const atom = { ...base, ptX: true };
      if (countIsX) { atom.countX = true; delete atom.count; }
      return atom;
    }
    const rw = rewriteAmountX(s);
    if (rw) {
      const rewritten = rw.clause;
      if (/\bX\b/.test(rewritten)) return null;
      const base = parseClauseToAtom(cardType, rewritten, false);
      if (!base) return null;
      // ===== DIVIDE ===== (MT-1) — an X-divide ("deals X damage divided among …", Conflagrate / Rolling
      // Thunder) rewrites to a divide-damage atom here, but the generic amountX path below would DROP its
      // `group` + lose the division (resolving to 0 / mis-targeting). X-divide is a deliberate fast-follow,
      // so reject it → low → Arbiter rather than emit a broken atom. (Numeric-N divide is modeled directly.)
      if (base.op === "divide-damage") return null;
      const atom = { op: base.op, targetType: base.targetType, amountX: true };
      // Preserve the actor binding (`who`) for an X-amount effect aimed at someone other than the controller —
      // "target player draws X cards" (who:"target") / "each player draws X cards" (who:"eachPlayer"). Without
      // this the X-draw would silently resolve for the CONTROLLER (a confidently-wrong native, CREED §FP).
      if (base.who) atom.who = base.who;
      if (base.restrictions) atom.restrictions = base.restrictions;
      if (base.duration) atom.duration = base.duration;
      // Carry a non-targetType binding (a self pump's target:"self") so an X-cost self atom can't
      // silently lose its binding and route a target-less/mis-targeted pump. (ptDelta is NOT
      // carried — an X atom reads its amount from ctx.xValue, not a printed delta.) No current
      // card reaches this (a spell never says "this creature"); it keeps the self-binding
      // invariant from regressing (adversarial-review hardening).
      if (base.target) atom.target = base.target;
      // ASYMMETRIC X-pump — carry the printed ptDelta + which pip scales with X (rw.xSlot). The resolver
      // applies ctx.xValue to the marked pip and the printed ptDelta to the other ("+X/+0" → +X power, +0
      // toughness). Symmetric +X/+X (xSlot null) keeps the original ptDelta-less shape (resolver = X both).
      if (rw.xSlot && base.op === "pump") { atom.ptDelta = base.ptDelta; atom.amountXSlot = rw.xSlot; }
      return atom;
    }
  }

  // ===== FIGHT FAMILY (ETB-FIGHT / FIGHT-ANOTHER / FIGHT-PAIR / DAMAGE-TARGET-POWER / SOURCE-POWER-FANOUT) =====
  // migrated to atoms/combat.fightClauseParser (seam batch S1) — the 4 inline dispatch blocks moved verbatim
  // next to their resolvers (fightCreature / applyFightPair / applyDamageTargetPower; the source-power-fanout
  // resolver stays in atoms/stack.js). FIRST-MATCH ORDER preserved inside the clause parser (bare → another →
  // pair a/b/c/d → fanout); registered after animateClauseParser. Order-safe: no earlier registered parser
  // matches a "fights" / "deals damage equal to its power to" clause, and parseExtendedAtom's residue only
  // matches the draw/rad sentinels — the inline(pre-ext) → CLAUSE_PARSERS(post-ext) move is program-
  // fingerprint-verified byte-identical.

  // ADDITIVE registry seam (WAVE 0): a future slice registers a clause parser instead of editing this
  // dispatch body. Each parser is `(clause, ctx) => Atom | null` (ctx = { cardType, hasX }) and runs
  // BEFORE the legacy parse. (parseExtendedAtom, which used to run first here, is fully drained — seam
  // batch S2; its final sentinels live in atoms/counters.cdmgPayoffClauseParser.) Registration order is
  // the priority order; the first parser to return a truthy atom wins.
  for (const p of CLAUSE_PARSERS) {
    const a = p(s, { cardType, hasX });
    if (a) return a;
  }

  // MULTI-COUNT DAMAGE (CR 601.2c "up to N") — "deal N damage to each of up to K target creatures" → the full N to
  // EACH chosen creature (applyDamageEffect's chosen-target loop deals the amount per target; targeting.expandAtoms
  // offers each 0..K subset). Intercepted HERE, before the legacy single-target parse — which would DROP the "each of
  // up to K" and mis-model it as ONE target. Bare "target creatures" only (a restriction/rider or the "and/or
  // planeswalkers" widening stays LOW → Arbiter, FN-safe). The "divided among" form is a DISTINCT divide-damage atom
  // and never matches this "to each of up to K target creatures" anchor.
  // Optional leading self-reference — the printed card name (e.g. "Dual Shot deals …") or "~"/"this spell" — since
  // Scryfall oracle text is self-referential; the clause splitter has isolated ONE clause, so the only text before
  // "deals" is the subject. End-anchored ($) so a trailing rider ("… Those creatures can't block") still stays LOW.
  const mcd = s.toLowerCase().match(/^(?:[a-z0-9'’,\- ]+? )?deals? (\d+) damage to each of up to (two|three|four|five) target creatures$/);
  if (mcd) return { op: "deal-damage", amount: parseInt(mcd[1], 10), targetType: "creature", maxTargets: SMALL_NUM[mcd[2]], minTargets: 0 };

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
 * Modal prefix — "Choose one —" (P2.5) plus MODAL-2's "Choose two —" / "Choose one or both —" and the
 * MODAL-N "Choose one or more —" (any non-empty subset, CR 700.2 — Black Market Connections, Outlaws'
 * Merriment). The capture groups carry the count: group 1 = one|two (the MAX modes to pick), group 2 =
 * " or both" (the upTo form), group 3 = " or more" (the atLeastOne form, attached to "one"). "choose up to
 * N" / "choose two or more" / "choose three" etc. still don't match → stay low (the executor only resolves
 * the fixed / one-or-both / one-or-more picks; anything else routes to the Arbiter).
 */
const MODAL_RE = /^choose (one|two)( or both| or more)?\s*[—–-]\s*/i;

// MODE-NAME PREFIX (CR 700.2g — many modal cards label each mode "• <Name> — <effect>": Charms/Commands,
// Pip-Boy 3000 "Sort Inventory — …", Black Market Connections "Hire a Mercenary — …"). The name is purely
// flavor; the effect is everything after the FIRST " — ". Strip a LEADING label: a Title-Case first word,
// then 0–4 more words that are either Title-Case OR a short lowercase connective (a/an/and/of/the/or/to/in/
// on), then an em/en dash with surrounding spaces, with the effect after it starting with a capital or "(".
// Anchored at the start (a mid-effect dash is never touched); the label carries NO sentence punctuation
// (`[A-Za-z'/]` only) and is ≤5 words, so ordinary effect text ("Destroy target …", "Target player …")
// never matches (no leading " — " before its first verb). Leaves a non-labeled mode untouched.
const MODE_NAME_WORD = "(?:[A-Z][A-Za-z'/]*|a|an|and|of|the|or|to|in|on)";
const MODE_NAME_PREFIX = new RegExp(`^[A-Z][A-Za-z'/]*(?: ${MODE_NAME_WORD}){0,4}\\s+[—–]\\s+(?=[A-Z(])`);
function stripModeNamePrefix(part) {
  return part.replace(MODE_NAME_PREFIX, "");
}

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
  const tail = (m[2] || "").toLowerCase();
  const orBoth = tail === " or both";
  const orMore = tail === " or more"; // "choose one or more" → MODAL-N (any non-empty subset, CR 700.2)
  const rest = stripped.slice(m[0].length).trim();
  // "one or more" modes ARE bullet-separated in every printed case; the " or "-fallback split (used only
  // for un-bulleted two-mode charms) would wrongly shred a "one or more" mode's effect text, so require
  // bullets for the MODAL-N form (a non-bulleted "one or more" → null → low, an FN-safe park).
  if (orMore && !rest.includes("•")) return null;
  const rawModes = rest.includes("•")
    ? rest.split("•")
    : rest.split(/\s*;\s*or\s+|\s+\bor\b\s+/i);
  // Strip the leading bullet/space, the optional "• <Name> — " mode-name label (CR 700.2g flavor), and a
  // trailing period from each mode before parsing its effect clauses.
  const parts = rawModes
    .map(p => stripModeNamePrefix(p.replace(/^[•\s]+/, "").trim()).replace(/\.\s*$/, "").trim())
    .filter(Boolean);
  if (parts.length < 2) return null;
  // chooseCount = the MAX modes pickable: 2 for "two"/"one or both"; ALL modes for "one or more"; else 1.
  // (Resolved after parts is known so "one or more" can size to the actual mode count.)
  const chooseCount = orMore ? parts.length : (orBoth || m[1].toLowerCase() === "two") ? 2 : 1;
  const upTo = orBoth; // "one or both" → pick 1 or 2 (of exactly 2)
  const atLeastOne = orMore; // "one or more" → pick any 1..N subset

  const modes = [];
  for (const part of parts) {
    // Parse each mode through the FULL clause machinery (parseEffectClauseImpl), not a bare
    // splitClauses/parseClauseToAtom loop — so a MULTI-SENTENCE mode whose effect spans sentences resolves
    // natively instead of shattering. The up-front matchers in parseEffectClauseImpl (impulse-dig "Look at
    // the top N … Put one … the rest …", the exile-if-dies removal rider "… deals N damage to target
    // creature. If that creature would die this turn, exile it instead.", counter-unless, reflexive, etc.)
    // are exactly the riders a Charm/Command mode carries (Maestros Charm, Supreme Will, Suplex, Agate
    // Assault, Confounding Riddle). CREED is preserved — all-or-nothing: a mode that doesn't parse HIGH (or
    // is itself a nested modal, which the per-mode executor doesn't model) drops the WHOLE card to low →
    // Arbiter (modes:null). hasX flows through so an {X}-cost modal's X-mode binds its amount.
    const inner = parseEffectClauseImpl(part, cardType, { hasX });
    const ok = inner && inner.structure !== "modal" && programConfidence(inner) === "high"
      && Array.isArray(inner.atoms) && inner.atoms.length > 0;
    if (!ok) return { chooseCount, upTo, atLeastOne, modes: null }; // an unmodeled / nested-modal mode → low
    modes.push({ label: part, atoms: inner.atoms });
  }
  // Count must be satisfiable: can't pick more modes than exist, and "one or both" is specifically a
  // TWO-mode card (1 or 2 of exactly 2). An unsatisfiable count → modes:null → low (never a wrong pick).
  if (chooseCount > modes.length) return { chooseCount, upTo, atLeastOne, modes: null };
  if (orBoth && modes.length !== 2) return { chooseCount, upTo, atLeastOne, modes: null };
  return { chooseCount, upTo, atLeastOne, modes };
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
  // CNT-DRAW-RIDER (Dream Fracture) — "draws a card" / "draws N cards" (the COUNTERED spell's controller draws,
  // applied to the captured controller via the drawCards rider). Only the unconditional, fixed-count form (no
  // "may", no "up to", no delayed "at the beginning of …") — a delayed/optional draw (Arcane Denial) leaves the
  // anchor unmatched → null → low → Arbiter. Used only on the counter-rider path (a removal never says "draws").
  m = t.match(/^draws (a|two|three|four|five) cards?$/);
  if (m) return { kind: "drawCards", count: RIDER_COUNT[m[1]] };
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
  // The bare destroy/exile lead lives in atoms/removal.destroyExileClauseParser (seam batch 27), so resolve
  // the rider-stripped lead via that clause parser directly. (The old parseExtendedAtom() || fallback was
  // provably dead — a destroy/exile lead can never match the draw/rad sentinels — and went with the S2 drain.)
  const lead = destroyExileClauseParser(m[1].trim());
  if (!lead || (lead.op !== "exile" && lead.op !== "destroy")) return null; // lead must be a modeled removal
  const rider = parseControllerRider(m[2].trim().toLowerCase());
  if (!rider) return null;                                                   // unmodeled rider → low → Arbiter
  return { atom: { ...lead, controllerRider: rider }, rest: "" };
}
// ===== DESTROY-DAMAGE-RIDER ===== — targeted DESTROY whose SECOND sentence is the SPELL ITSELF dealing damage
// to the TARGET's controller (CR — "that <noun>'s controller" = the just-destroyed permanent's controller):
// Smash to Smithereens ("Destroy target artifact. Smash to Smithereens deals 3 damage to that artifact's
// controller."), Destructive Revelry (artifact or enchantment, 2), Melt Terrain / Poison the Well (land, 2),
// Consign to the Pit (creature, 2). This is the damage-dealing twin of matchRemovalControllerRider's
// "Its controller <rider>" fold: the lead reuses the SAME shared removal grammar (parseExtendedAtom ||
// destroyExileClauseParser — so every modeled targetType rides along, but the typed-land leads "Plains or
// Island"/"Mountain" the grammar doesn't model fail the lead parse → null → Arbiter, ALL-OR-NOTHING), and the
// damage rides on the atom as `damageRider` (applied at RESOLUTION to the captured target-controller through
// the SAME applyDamageEffect every burn spell uses — so triggers/replacements/lifeloss are handled identically).
// The damage is UNCONDITIONAL by default; the ONE modeled condition is Molten Rain's "If that land was nonbasic,
// …" (`onlyIfNonbasic`) — evaluated by capturing the target land's nonbasic-ness BEFORE the destroy (the same
// type-line predicate the nonbasicLand targetType uses). Any OTHER condition (Icequake's "if that land was a
// snow land" — snow isn't tracked at resolution; Unlicensed Disintegration's "if you control an artifact" — a
// board-state gate) fails the anchor → null → low → Arbiter (whole-card CREED, never a partial that fires
// damage that shouldn't, or drops the condition).
// The damage rider = an OPTIONAL nonbasic condition (the ONLY modeled condition) + the SELF name + "deals N
// damage to that/the <noun>'s controller". The self-name is `[a-z'][a-z' ]*?` — letters/apostrophe/space only,
// NO comma — so it can't swallow ANOTHER leading conditional clause ("If that land was a snow land,",
// "If you control an artifact,"): those carry a comma the self-name can't cross, and they aren't the modeled
// nonbasic prefix → the whole rider fails the anchor → null → Arbiter (CREED — never fire damage gated on an
// unmodeled condition). Anchored ^…$ over the rider sentence.
const DAMAGE_RIDER_RE =
  /^(?:(if that land was nonbasic), )?[a-z'][a-z' ]*? deals (\d+) damage to (?:that|the) (?:artifact|creature|enchantment|permanent|land)(?:'s)? controller$/i;
function matchRemovalDamageRider(oracle) {
  // The lead destroy + the second sentence. The rider portion is captured greedily to end-of-string, then
  // validated by DAMAGE_RIDER_RE (which enforces the comma-free self-name, so an unmodeled "If …, X deals …"
  // condition can't pass even though the outer .+? captured it).
  const m = stripReminder(oracle).trim().replace(/[’]/g, "'").match(/^(destroy target .+?)\.\s+(.+? deals \d+ damage to (?:that|the) (?:artifact|creature|enchantment|permanent|land)(?:'s)? controller)\.?$/i);
  if (!m) return null;
  const lead = destroyExileClauseParser(m[1].trim());
  if (!lead || lead.op !== "destroy") return null;                           // DESTROY lead only (no exile form in the corpus)
  const dm = m[2].trim().match(DAMAGE_RIDER_RE);
  if (!dm) return null;                                                       // an unmodeled condition / shape → low → Arbiter
  const damageRider = { amount: parseInt(dm[2], 10) };
  if (dm[1]) damageRider.onlyIfNonbasic = true;                              // Molten Rain — "If that land was nonbasic,"
  return { atom: { ...lead, damageRider }, rest: "" };
}
// SOFT-COUNTER-RIDER — "Counter target <filter> spell. Its controller <rider>.[ <tail>]" (An Offer You Can't
// Refuse "creates two Treasure tokens", Swan Song "creates a 2/2 blue Bird … with flying", Dream Fracture "draws
// a card. Draw a card."). The lead reuses the counter grammar (spellFilter incl. the 3-way enchantment/instant/
// sorcery); the rider rides on the atom and is applied at resolution to the COUNTERED spell's controller
// (captured in applyCounter). The parenthetical token reminder is stripped. The rider capture stops at the FIRST
// sentence period — any FURTHER sentences (Dream Fracture's caster-side "Draw a card.") are returned as `rest` so
// collapsed() parses them as additional atoms (ALL-OR-NOTHING — an unmodeled tail drops the whole card to LOW).
// ALL-OR-NOTHING: an unmodeled rider, a soft-counter ("unless pays {N}", which the lead grammar returns WITH
// unlessPay — rejected here so the rider+pay interaction isn't half-modeled), or a non-counter lead → null → low
// → Arbiter.
function matchCounterControllerRider(oracle) {
  // Non-greedy rider capture to the first "." — a `rest` (the trailing caster-side clause[s]) is parsed by collapsed().
  // The filter words are OPTIONAL ((?:.+? )?) so the bare "Counter target spell" form (Dream Fracture) matches too.
  const m = stripReminder(oracle).trim().match(/^(counter target (?:.+? )?spell)\.\s+its controller ([^.]+?)\.(.*)$/i);
  if (!m) return null;
  const lead = counterClauseParser(m[1].trim()); // counter matchers moved to a clause parser (batch 28)
  if (!lead || lead.op !== "counter" || lead.unlessPay != null || lead.unlessPayX) return null; // hard counter only (defer soft+rider)
  const rider = parseControllerRider(m[2].trim().toLowerCase());
  if (!rider) return null;                                                    // unmodeled rider → low → Arbiter
  return { atom: { ...lead, controllerRider: rider }, rest: (m[3] || "").trim() };
}
// CNT-EXILE-INSTEAD (WAVE 2b) — "Counter target <filter> spell. If that spell is countered this way, exile it
// instead of putting it into its owner's graveyard." (Deny Existence "creature", Dissipate-style). The lead
// reuses the counter grammar (so a lead filter the grammar doesn't model — Deny the Divine's "creature or
// enchantment", Faerie Trickery's "non-Faerie" — fails the lead parse → null → low → Arbiter, ALL-OR-NOTHING).
// The countered spell goes to EXILE not the graveyard (applyCounter reads atom.exileInstead). Spans two
// sentences (the "If that spell …" rider would be shattered by splitClauses), so it's matched up front as ONE
// collapsed atom. ANCHORED — a hard-counter lead only; the soft-counter path's pay-decision isn't composed here.
function matchCounterExileInstead(oracle) {
  const m = stripReminder(oracle).trim().match(/^(counter target (?:.+? )?spell)\. if that spell is countered this way, exile it instead of putting it into its owner's graveyard\.?$/i);
  if (!m) return null;
  const lead = counterClauseParser(m[1].trim()); // counter matchers moved to a clause parser (batch 28)
  if (!lead || lead.op !== "counter" || lead.unlessPay != null || lead.unlessPayX) return null; // hard counter only
  return { atom: { ...lead, exileInstead: true }, rest: "" };
}
// CNT-ZONE-REDIRECT (CROSS-COUNTER) — "Counter target <filter> spell. If that spell is countered this way, put
// it into its owner's hand|on top of its owner's library instead of into that player's graveyard.[ <tail>]"
// (Remand → owner's hand + "Draw a card."; Memory Lapse → top of owner's library). The lead reuses the counter
// grammar; the redirect sets counterDest on the atom (applyCounter → counterSpellById routes the countered card
// to that zone instead of the graveyard). Any FURTHER sentences (Remand's "Draw a card.") are returned as `rest`
// for collapsed() to parse as additional atoms (ALL-OR-NOTHING — an unmodeled tail drops the whole card to LOW).
// Tried AFTER matchCounterExileInstead (disjoint anchors — that one says "exile it instead", this one "put it
// into its owner's hand / on top of its owner's library instead"). Hard-counter lead only (the soft-counter
// pay-decision isn't composed here). The two-sentence span would be shattered by splitClauses, so it's matched
// up front like the exile-instead form.
function matchCounterZoneRedirect(oracle) {
  const m = stripReminder(oracle).trim().match(/^(counter target (?:.+? )?spell)\. if that spell is countered this way, put it (into its owner's hand|on top of its owner's library) instead of into that player's graveyard\.(.*)$/i);
  if (!m) return null;
  const lead = counterClauseParser(m[1].trim());
  if (!lead || lead.op !== "counter" || lead.unlessPay != null || lead.unlessPayX) return null; // hard counter only
  const counterDest = /hand/i.test(m[2]) ? "hand" : "library-top";
  return { atom: { ...lead, counterDest }, rest: (m[3] || "").trim() };
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
 * Match the "Look at the top N cards of your library. You may put a land card from among them onto the
 * battlefield [tapped]. Put the rest on the bottom of your library in a random order." template — a DIFFERENT
 * effect from impulse-dig (Silverback Elder mode 2). Instead of keeping a card to HAND, it puts a LAND onto the
 * BATTLEFIELD (dig-land-to-battlefield atom → applyDigLandToBattlefieldAtom → a pick-which-land choice, the
 * chosen land enters + fires its ETB/landfall, the rest bottom in a random order). Two sentences whose effect
 * spans them (the internal " and " / "from among them" would be shattered by splitClauses), so it's matched up
 * front as ONE atom like the impulse-dig template. Returns `{ atom, rest }` or null.
 *
 * ALL-OR-NOTHING ALLOWLIST: EXACTLY "put A LAND card from among them onto the battlefield [tapped]" + rest →
 * bottom in a random order. A TYPED/FILTERED put ("a basic land", "a Forest card"), a MANDATORY put (no "you
 * may"), a MULTI put ("put any number of lands"), a keep-to-HAND ("put it into your hand" — that's the impulse-
 * dig template), an "into your graveyard" rest, or a variable/unspelled N all fail the anchor → the mode/card
 * stays low → Arbiter (FN-safe — a partial would be forbidden). Only the unfiltered "a land card" + battlefield
 * + rest-to-bottom-random shape is claimed.
 */
function matchDigLandToBattlefield(oracle) {
  const m = String(oracle).match(
    /^look at the top (\w+) cards? of your library\. you may put a land card from among them onto the battlefield( tapped)?\. put the rest on the bottom of your library in a random order\.?/i,
  );
  if (!m) return null;
  const amount = DIG_NUM[m[1].toLowerCase()];
  if (!amount) return null;                                     // "the top X cards" (variable) / unspelled → Arbiter
  return { atom: { op: "dig-land-to-battlefield", amount, entersTapped: !!m[2] }, rest: oracle.slice(m[0].length).trim() };
}

/**
 * CHOSEN-TYPE DRAW (CR 614.12) — Distant Melody "Choose a creature type. Draw a card for each permanent you
 * control of that type." Two sentences whose effect spans them (the count refers back to the chosen type), so
 * it's matched up front as ONE draw atom like the other collapsed templates. The draw count is a
 * `chosenTypePermanents` board count (shared.countForSpec): the self-play engine resolves the choice OPTIMALLY
 * — the greatest, over every creature subtype present, of the controller's permanents of that subtype
 * (changelings count for all) — so the magnitude is deterministic + never an over/under-count. Whole-string
 * anchored ("Choose a creature type. Draw a card for each permanent you control of that type." + an optional
 * trailing period); any rider/variant leaves residue (→ rest), which `collapsed` runs through the normal
 * pipeline (an unmodeled rider → LOW → Arbiter, never a partial). The "for each permanent … of that type"
 * phrasing is unique to the chosen-type chooser, so this never false-matches a static count source.
 */
function matchChooseTypeDraw(oracle) {
  const m = String(oracle).match(
    /^choose a creature type\. draw a card for each permanent you control of that type\.?\s*/i,
  );
  if (!m) return null;
  return {
    atom: { op: "draw", amountCount: { kind: "chosenTypePermanents", per: 1 }, targetType: null },
    rest: oracle.slice(m[0].length).trim(),
  };
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
// ADDCOST-1 sac victims — single types PLUS the "artifact or creature" UNION (Deadly Dispute, Deadly
// Dispute-style "sacrifice an artifact or creature"). The union is enforced as one sacType key
// ("artifactOrCreature"); legalChoices.sacTypeMatches offers a victim matching EITHER type.
const SAC_COST_RE = /^sacrifice (?:a|an) (artifact or creature|creature or artifact|creature|permanent|artifact|enchantment|land)$/i;
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
  if (sac) {
    // Canonicalize the "artifact or creature" / "creature or artifact" union to one sacType key.
    const raw = sac[1].toLowerCase();
    const sacType = (raw === "artifact or creature" || raw === "creature or artifact") ? "artifactOrCreature" : raw;
    cost = { kind: "sacrifice", sacType };
    selfRef = /\bsacrificed\b/i;
  }
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

// ===== ALT-COST (CR 601.2b / 118.9) — a PRINTED alternative casting cost ("… rather than pay this spell's
// mana cost" / "you may cast this spell without paying its mana cost"). Treated EXACTLY like the
// CAST_KEYWORD_LINE strips (flashback / jump-start / overload — see stripStormKeywordLine & friends): strip
// the alternative-casting sentence, parse the REMAINING effect through the normal all-or-nothing pipeline,
// and attach `altCost` metadata to the program. The card becomes native because its EFFECT is fully modeled
// AND it is castable at its PRINTED mana cost (Cyclonic Rift / Firebolt / Chemister's Insight are all
// native-spell today by exactly this logic). The alt-cost is an OPTIONAL alternative the engine RECORDS
// (program.altCost, forward-compatible) but does not yet OFFER — a safe false-NEGATIVE on an optional
// cost-reduction: the card never plays WRONG, it only forgoes a legal discount. Actually OFFERING the alt-cost
// at the cast path (so the AI pays life/exiles/sacs to cast it) is separate play-quality work. CONSERVATIVE:
// only a MODELED {kind,condition} strips; anything else leaves the sentence in place → the card stays LOW.
// Wave 3a models the FREE kind, condition controlCommander only (Fierce Guardianship, Deadly Rollick, Flawless
// Maneuver — the "free if you control a commander" cycle); pitch/sac/return kinds + other conditions land next.
// Anchored to a whole sentence at oracle start or after a newline; the condition capture forbids commas /
// periods / newlines so it can never span into the effect body.
const SUPPORTED_ALT_COST_KINDS = new Set(["free", "payLifeExilePitch", "exileColorCard", "sacrificeCreature", "payLife", "returnLandsToHand"]);

// Map a captured "if <cond>," phrase → a condition enum (a STRING — inert metadata today, since the alt-cost is
// recorded but not yet OFFERED; the future cast-path offer will evaluate it). An UNRECOGNIZED condition → null,
// which rejects the whole alt-cost so the card stays LOW (never credit a gate we can't name). Absent → "always".
function parseAltCostCondition(phrase) {
  if (phrase == null) return "always";
  const p = phrase.trim().toLowerCase();
  if (p === "you control a commander") return "controlCommander";
  if (p === "it's not your turn") return "notYourTurn";
  if (p === "an opponent controls a forest and you control an island") return "submergeGate"; // Submerge
  const land = p.match(/^you control an? (\w+)$/);
  if (land) {
    const sub = land[1][0].toUpperCase() + land[1].slice(1);
    if (["Swamp", "Island", "Forest", "Mountain", "Plains"].includes(sub)) return "controlLand:" + sub;
  }
  return null;                                            // unmodeled condition → reject → stays LOW
}

// The modeled printed-alt-cost sentence shapes. Each: an anchored regex (a whole sentence at oracle start or
// after a newline; the captures can never span into the effect body) + a builder → an altCost descriptor, or
// null to REJECT (leave the sentence in → the card stays LOW). Tried in order; the first that both matches AND
// builds non-null wins. Only the FREE kind waives mana entirely (a future offer reuses action.freeCast); the
// pitch/sac/return kinds pay their own printed cost. All are recorded as metadata only for now (§ extractAltCost).
const ALT_COST_MATCHERS = [
  // FREE — "[if <cond>, ]you may cast this spell without paying its mana cost." (Fierce Guardianship, Submerge).
  { re: /(?:^|\n)\s*(?:if ([^,.\n]+), )?you may cast this spell without paying its mana cost\.\s*/i,
    build: (m) => { const c = parseAltCostCondition(m[1]); return c && { kind: "free", condition: c }; } },
  // PITCH-LIFE-EXILE — "you may pay N life and exile a <color> card from your hand rather than pay this spell's mana cost." (Force of Will).
  { re: /(?:^|\n)\s*you may pay (\d+) life and exile an? (\w+) card from your hand rather than pay this spell's mana cost\.\s*/i,
    build: (m) => ({ kind: "payLifeExilePitch", amount: Number(m[1]), color: m[2].toLowerCase(), condition: "always" }) },
  // EXILE-COLOR — "[if it's not your turn, ]you may exile a <color> card from your hand rather than pay this spell's mana cost." (Force of Negation, Misdirection).
  { re: /(?:^|\n)\s*(if it's not your turn, )?you may exile an? (\w+) card from your hand rather than pay this spell's mana cost\.\s*/i,
    build: (m) => ({ kind: "exileColorCard", color: m[2].toLowerCase(), condition: m[1] ? "notYourTurn" : "always" }) },
  // SAC-CREATURE — "you may sacrifice a [nontoken ]<color> creature rather than pay this spell's mana cost." (Flare of Denial / Cultivation).
  { re: /(?:^|\n)\s*you may sacrifice a (nontoken )?(\w+) creature rather than pay this spell's mana cost\.\s*/i,
    build: (m) => ({ kind: "sacrificeCreature", nontoken: !!m[1], color: m[2].toLowerCase(), condition: "always" }) },
  // PAYLIFE — "[if <cond>, ]you may pay N life rather than pay this spell's mana cost." (Snuff Out — controlLand Swamp).
  { re: /(?:^|\n)\s*(?:if ([^,.\n]+), )?you may pay (\d+) life rather than pay this spell's mana cost\.\s*/i,
    build: (m) => { const c = parseAltCostCondition(m[1]); return c && { kind: "payLife", amount: Number(m[2]), condition: c }; } },
  // RETURN-LANDS — "you may return two <Subtype>s you control to their owner's hand rather than pay this spell's mana cost." (Gush).
  { re: /(?:^|\n)\s*you may return (two|three) (\w+)s you control to their owner's hand rather than pay this spell's mana cost\.\s*/i,
    build: (m) => ({ kind: "returnLandsToHand", count: m[1] === "two" ? 2 : 3, subtype: m[2][0].toUpperCase() + m[2].slice(1), condition: "always" }) },
];

function extractAltCost(oracle) {
  for (const { re, build } of ALT_COST_MATCHERS) {
    const m = re.exec(oracle);
    if (!m) continue;
    const altCost = build(m);
    if (!altCost) continue;                                          // matched shape but unmodeled detail (bad condition) → leave LOW
    const rest = (oracle.slice(0, m.index) + oracle.slice(m.index + m[0].length)).trim();
    if (!rest) continue;                                             // no effect body left → nothing to model
    return { altCost, rest };
  }
  return { altCost: null, rest: oracle };
}

// SELF-COST-REDUCTION sentence (CR 601.2f) — "This spell costs {N} less to cast …" reduces the spell's CAST
// cost only; it is NEVER a resolution effect (the mana value and the on-stack effect are untouched, CR 202.3).
// So for the EFFECT program it is pure residue — strip it before parsing so an otherwise-modeled spell isn't
// dragged LOW by a cast-cost line the resolver never runs (Blasphemous Act: "This spell costs {1} less to cast
// for each creature on the battlefield. Blasphemous Act deals 13 damage to each creature." → the strip leaves
// the bare modeled mass-burn). Anchored to a sentence that STARTS with "this spell costs {" and contains "less
// to cast", so it can only ever consume a real cast-cost-reduction sentence — never resolution text (which
// never opens with "This spell costs {"). The actual reduction is applied independently at the cast site by
// legalChoices.selfCostReductionForSpell (which reads the raw card oracle, not this program), so stripping it
// here cannot drop a modeled reduction. An UNmodeled reduction metric simply isn't applied at cast (the engine
// pays full price — a SAFE limitation), but the effect now resolves natively instead of routing to the Arbiter.
const SELF_COST_REDUCTION_SENTENCE_RE = /this spell costs \{[^}]+\} less to cast[^.]*\.\s*/gi;
function stripSelfCostReduction(oracle) {
  return String(oracle || "").replace(SELF_COST_REDUCTION_SENTENCE_RE, " ").trim();
}

// STORM (CR 702.40) — strip the whole "Storm (…reminder…)" KEYWORD line before parsing the spell's effect.
// Storm is a TRIGGERED ability (its own copy-spell trigger, modeled in triggers/coverage), NOT part of the
// spell's resolution effect — so the body (create-token / gain-life / …) must be parsed on its own. Without the
// strip, stripReminder leaves a bare "Storm" residue clause that drags an otherwise-HIGH spell to LOW (its
// effect would then route to the Arbiter no-op at resolution). Line-anchored on the keyword's canonical reminder
// signature (CR 702.40a) so a card merely NAMED "…Storm" without the keyword is untouched. The runtime cast path
// (actionDispatcher.applyCastSpell) and the coverage classifier (spellIsNative) BOTH parse through here, so they
// agree on the body; the storm trigger fires separately (checkCastTriggers) and copies the spell.
function stripStormKeywordLine(oracle) {
  return /\bcopy it for each spell cast before it this turn\b/i.test(String(oracle || ""))
    ? String(oracle).replace(/(?:^|\n)[^\n]*\bcopy it for each spell cast before it this turn\b[^\n]*(?=\n|$)/i, "\n")
    : oracle;
}

/**
 * ===== KICKED-SPELL-EFFECT (CR 702.33e) ===== an instant/sorcery with a clean single Kicker cost whose
 * kicked payoff is an ADDITIVE extra effect — "<base>. If this spell was kicked, <extra>." (Runic Shot
 * "Destroy target tapped creature. If this spell was kicked, scry 2.", Blink of an Eye, Dismantling Blow,
 * Phyrexian Espionage …). The base atom(s) ALWAYS run; the kicked atom(s) run ONLY when the spell was cast
 * kicked (params.kicked, threaded through actionDispatcher → runEffectProgram, which skips `kickedOnly` atoms
 * when not kicked).
 *
 * Returns `{ atoms }` (base atoms in printed order, then the kicked atoms each stamped `kickedOnly: true`),
 * or null. The whole card is modeled or it isn't (THE CREED): null when ANY of —
 *   • the kicker cost isn't a clean single mana cost (parseKickerCost rejects multikicker / "and/or" / {X} /
 *     a non-mana kicker — those scale or need cost machinery we don't fold here);
 *   • the kicked clause is REPLACEMENT ("instead" / "rather than") or back-references the base result
 *     ("that creature gets … instead", "it deals … instead") — those rewrite the base, not add to it;
 *   • the base body parses LOW or modal, OR the kicked effect parses LOW or modal;
 *   • the kicked effect needs its OWN chosen target — the cast path enumerates ONE target set shared by both
 *     the normal + kicked casts, so a kicked-only target (none in the corpus) would need conditional target
 *     enumeration we don't model → defer (FN-safe).
 * — so a deferred shape stays a single LOW program → arbiter-spell, never a fabricated native credit.
 *
 * Detection normalizes a printed self-name ("If Runic Shot was kicked, …") to "this spell" (mirroring
 * kicker.js's entersWithKickedCounters name-normalization), then peels the kicked sentence out of the body.
 * The remaining base body (kicker line + kicked sentence removed) and the kicked effect are each re-parsed
 * through the FULL clause pipeline (parseEffectClause), so both inherit the entire P2.x atom family.
 */
function matchKickedSpellEffect(card, cardType, oracle) {
  // Gate 1 — a clean single mana Kicker cost (the kicker.js source of truth: rejects multikicker, "and/or",
  // {X}, a non-mana "Kicker—Sacrifice…" cost). A non-mana / scaling kicker isn't foldable here.
  const kickerCost = parseKickerCost({ oracle, oracle_text: oracle });
  if (!kickerCost) return null;

  // Normalize a printed self-name to "this spell" so "If <CardName> was kicked, …" also matches (mirrors
  // entersWithKickedCounters). Reminder text is stripped so the regex sees a clean body.
  let t = stripReminder(oracle);
  const nm = String(card?.name || "").trim();
  if (nm) {
    const esc = nm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    t = t.replace(new RegExp(`\\b${esc}\\b`, "g"), "this spell");
  }

  // Gate 2 — exactly ONE "If this spell was kicked, <effect>." sentence, and extract it. Anchored to the
  // "this spell was kicked," lead (a generic "it was kicked" is ambiguous about the subject → not matched
  // here, FN-safe). The effect runs to the sentence end (the next ". " / ";" / end-of-text).
  const KICKED_SENTENCE_RE = /if this spell was kicked,\s*([^.;]+)(?:[.;]|$)/i;
  const km = t.match(KICKED_SENTENCE_RE);
  if (!km) return null;
  // A SECOND kicked sentence (or a "with its {…} kicker" multi-kicker selector — Illuminate) is out of scope.
  if (t.replace(KICKED_SENTENCE_RE, " ").match(/\bwas kicked\b/i)) return null;
  const kickedEffect = km[1].trim();
  if (!kickedEffect) return null;

  // SUFFIX GUARD — the kicked sentence must be a printed SUFFIX (the LAST sentence of the body), so the base
  // atoms run in printed order BEFORE the kicked tail. We model the kicked tail as `[...base, ...kicked]`; if
  // the kicked clause were printed FIRST (Fires of Victory "If this spell was kicked, draw a card. <name> deals
  // damage equal to the number of cards in your hand."), reordering it to LAST would change a base atom that
  // reads a resource the kicked atom mutates (the hand size) — a forbidden mis-resolution (CREED). Requiring a
  // suffix (mirrors optionalsFormSuffix) makes the reorder a no-op → always correct. A kicked-FIRST card is a
  // SAFE false-negative (stays arbiter-spell). Nothing but trailing whitespace/period may follow the kicked text.
  const afterKicked = t.slice(km.index + km[0].length).replace(/[\s.;]+/g, "");
  if (afterKicked) return null;

  // Gate 3 — the kicked clause must be ADDITIVE, not a replacement / back-reference rewrite of the base.
  // "instead" / "rather than" REPLACE the base effect (a conditional-replacement model we don't have); a
  // back-reference ("that creature", "those creatures", "that player", "that spell", "that permanent",
  // "that card", "that damage", "it deals", "an additional") SCALES or redirects the base result. Either way
  // the kicked clause isn't a clean SEPARATE extra effect → defer the whole card.
  if (/\b(?:instead|rather than)\b/i.test(kickedEffect)) return null;
  if (/\b(?:that creature|those creatures|that player|that spell|that permanent|that card|that damage|it deals|an additional)\b/i.test(kickedEffect)) return null;

  // The BASE body = oracle with the "Kicker {cost}" keyword+pips and the kicked sentence removed. `t` is the
  // name-normalized, reminder-stripped, whitespace-COLLAPSED text (so the kicker keyword sits inline with the
  // body on one line) — strip just the "Kicker {pips}" token (not a line) so the base effect survives, then
  // re-parse. The {pips}+ matches a clean mana kicker (parseKickerCost already vetted it above).
  const base = t
    .replace(/\bkicker\s+(?:\{[^}]+\})+\s*/i, " ")          // drop the "Kicker {cost}" keyword + pips
    .replace(KICKED_SENTENCE_RE, " ")                       // drop the kicked sentence
    .replace(/\s+/g, " ")
    .trim();
  if (!base) return null;

  const baseProgram = parseEffectClause(base, cardType, { hasX: false });
  if (!baseProgram || programConfidence(baseProgram) !== "high" || baseProgram.structure === "modal" || baseProgram.xSpell) return null;

  const kickedProgram = parseEffectClause(kickedEffect, cardType, { hasX: false });
  if (!kickedProgram || programConfidence(kickedProgram) !== "high" || kickedProgram.structure === "modal" || kickedProgram.xSpell) return null;

  // Gate 4 — the kicked atoms must be TARGETLESS (no chosen target). The cast path enumerates a single
  // target set shared by the normal + kicked casts; a kicked-only chosen target would need conditional
  // enumeration we don't model. (Also: an `optional`/`oncePerTurn` kicked atom or a kicked additional-cost
  // is out of scope — keep the kicked tail a plain additive sequence.)
  if (programNeedsChosenTarget(kickedProgram)) return null;
  if (Array.isArray(kickedProgram.additionalCosts) && kickedProgram.additionalCosts.length) return null;
  if (kickedProgram.atoms.some((a) => a.optional)) return null;

  const kickedAtoms = kickedProgram.atoms.map((a) => ({ ...a, kickedOnly: true }));
  return { atoms: [...baseProgram.atoms, ...kickedAtoms] };
}

export function parseEffectProgram(card) {
  if (!isInstantOrSorcery(card) || !oracleOf(card)) return null;
  const oracle = stripStormKeywordLine(stripSelfCostReduction(oracleOf(card)));
  // KICKED-SPELL-EFFECT (CR 702.33e) — "<base>. If this spell was kicked, <extra>." The kicked atom(s) are
  // appended stamped `kickedOnly` and run ONLY on a kicked cast (runEffectProgram skips them otherwise). The
  // kicker line + kicked sentence keep the NORMAL parse LOW, so this MUST run first. Whole-card-or-null (CREED).
  const kicked = matchKickedSpellEffect(card, typeOf(card), oracle);
  if (kicked && kicked.atoms.every((a) => KNOWN.has(a.op))) {
    return makeProgram({ confidence: "high", atoms: kicked.atoms, xSpell: false, unparsedTail: null });
  }
  const { costs, rest } = extractAdditionalCosts(oracle);
  const { altCost, rest: altRest } = extractAltCost(costs ? rest : oracle);
  // A spell that is BOTH an X-spell AND carries an additional/alt cost is a compound we defer — the cast-path
  // X-value expansion and the cost expansion don't yet compose — so parse the FULL oracle and let the
  // un-stripped cost sentence keep it LOW. No clean printed card needs both today.
  if ((costs || altCost) && hasXCost(card)) return parseEffectClause(oracle, typeOf(card), { hasX: true });
  // {X}-cost spell (no additional cost): the parser may stamp `amountX` on a damage/draw/pump atom whose
  // amount is the chosen X, bound at cast time (CR 601.2b) and read at resolution.
  const bodyOracle = altCost ? altRest : (costs ? rest : oracle);
  const program = parseEffectClause(bodyOracle, typeOf(card), { hasX: hasXCost(card) });
  if (costs && program) program.additionalCosts = costs;
  if (altCost && program) program.altCost = altCost;
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

/**
 * ===== DRAIN-X (Exsanguinate / Gray Merchant-style life swing) ===== "Each opponent loses X life. You gain
 * life equal to the life lost this way." — the SECOND sentence's amount is the SUM of life actually lost by
 * the first (CR 118.10 — "this way"), so the top-level sentence split would shatter it into ["each opponent
 * loses X life" (→ lose-life eachOpponent), "you gain life equal to the life lost this way" (an UNMODELED
 * referent)], silently dropping the linked lifegain — a forbidden partial. Collapse the whole compound up
 * front to ONE `drain-each-opponent` atom: the resolver loses X (= ctx.xValue, an {X} spell) from each
 * opponent AND gains the total it actually drained. Only the X-cost form (amountX) is matched here; a FIXED-N
 * "each opponent loses 3 life. You gain that much life." is a fast-follow (not in the breakage set). Anchored
 * ^…$ on the two-sentence shape (a trailing rider leaves residue → no match → low → Arbiter). Returns { atom }.
 * Gated to hasX by the caller so a non-X spell never reaches this (an absent X would drain 0 — a clean no-op).
 */
function matchDrainEachOpponentX(oracle) {
  const s = stripReminder(oracle).trim().toLowerCase().replace(/\s+/g, " ");
  if (!/^each opponent loses x life\. you gain life equal to the life lost this way\.?$/.test(s)) return null;
  return { atom: { op: "drain-each-opponent", amountX: true, targetType: null } };
}

/**
 * ===== ITERATED-EDICT (Torment of Hailfire, CR 118.9) ===== "Repeat the following process X times. Each
 * opponent loses 3 life unless that player sacrifices a nonland permanent of their choice or discards a
 * card." — an {X}-times-repeated, per-opponent, THREE-mode edict where EACH opponent chooses their own way
 * out (lose 3 life / sacrifice a nonland permanent / discard a card). The "repeat X times" wrapper + the
 * "loses N unless that player sacrifices…or discards" multi-mode choice are BOTH unmodeled by the clause
 * splitter (the "unless…or…" would shatter into unrelated lose-life / sacrifice / discard atoms, dropping
 * the affected-player CHOICE — a forbidden partial), so the whole card is collapsed here to ONE
 * `iterated-edict` atom whose resolver drives the X × opponents pausing choice chain (each opponent picks a
 * legal mode; a life-only opponent is forced to lose 3). Anchored ^…$ on the exact printed shape — any
 * variant (a different life amount, a filtered pool, a rider) leaves residue → no match → low → Arbiter
 * (CREED — never a mis-modeled iteration). Gated to hasX by the caller (an {X} cost); the atom is stamped
 * amountX so the cast path binds the chosen X into ctx.xValue (the repeat count). Returns { atom }.
 */
function matchIteratedEdict(oracle) {
  const s = stripReminder(oracle).trim().toLowerCase().replace(/[’]/g, "'").replace(/\s+/g, " ");
  if (!/^repeat the following process x times\. each opponent loses 3 life unless that player sacrifices a nonland permanent of their choice or discards a card\.?$/.test(s)) return null;
  return { atom: { op: "iterated-edict", amountX: true, targetType: null } };
}

/**
 * ===== REVEAL-TOP-DRAIN-BY-MV (Yuriko, the Tiger's Shadow) ===== "Reveal the top card of your library and put
 * that card into your hand. Each opponent loses life equal to that card's mana value." The SECOND sentence's
 * amount ("that card's mana value") is a value generated MID-RESOLUTION by the first sentence (the revealed
 * card's MV) — NOT a board-state count — so the top-level sentence split would shatter it into ["reveal … and
 * put … into your hand" (an UNMODELED reveal-to-hand clause; its " and " also mis-splits), "each opponent loses
 * life equal to that card's mana value" (an UNMODELED "equal to that card" referent)], silently dropping the
 * linked drain — a forbidden partial. Collapse the whole compound up front to TWO atoms whose SEQUENCE threads
 * the captured MV (the exact roll-d20 → diceResult pattern):
 *   1. reveal-top-to-hand — reveals the top card → controller's hand AND stamps its MV on state.revealedCardMV.
 *   2. lose-life who:"eachOpponent" amountCount:{kind:"revealedCardMV"} — each opponent loses THAT captured MV,
 *      read at resolution via countForSpec (state.revealedCardMV). Each OPPONENT (not the controller) loses it,
 *      so it's correct in 1v1 AND multiplayer (applyLoseLife enumerates opponentsOf).
 * Both atoms are KNOWN (reveal-top-to-hand + lose-life), so the whole compound resolves natively or not at all
 * (no partial). revealTopSequenceOk (the caller's HIGH gate) independently re-checks the reveal precedes the MV
 * read. Whole-string anchored ^…$ (curly apostrophe normalized) — any rider/variant leaves residue → no match →
 * low → Arbiter (CREED). The "reveal … put that card into your hand. each opponent loses life equal to that
 * card's mana value" phrasing is corpus-unique to Yuriko's family, so it never false-matches another effect.
 * Returns { atoms }.
 */
function matchRevealTopDrainByMv(oracle) {
  const s = stripReminder(oracle).trim().toLowerCase().replace(/[’]/g, "'").replace(/\s+/g, " ").replace(/\.$/, "");
  // "that card" / "the card" — both printed wordings for the just-revealed card (Yuriko prints "that card").
  if (!/^reveal the top card of your library and put (?:that card|the card|it) into your hand\. each opponent loses life equal to (?:that card's|the card's|its) mana value$/.test(s)) {
    return null;
  }
  return { atoms: [
    { op: "reveal-top-to-hand", targetType: null },
    { op: "lose-life", who: "eachOpponent", amountCount: { kind: "revealedCardMV", per: 1 }, targetType: null },
  ] };
}

/**
 * ===== GENESIS-WAVE (mass reveal-top-X → put-permanents-onto-battlefield → mill-the-rest) ===== the {X}-cost
 * mass permanent-drop family: "Reveal the top X cards of your library. You may put any number of <FILTER> cards
 * with mana value X or less from among them onto the battlefield. Then put all cards revealed this way that
 * weren't put onto the battlefield into your graveyard." (Genesis Wave — `permanent`; the same template also
 * covers an `artifact`/`creature`/`enchantment`-filtered variant, though Saheeli's Directive's Improvise line
 * — an unmodeled cost keyword — keeps THAT card LOW until Improvise is stripped, a SAFE false-negative).
 *
 * This spans three sentences and reads the SPELL'S X in two places (the reveal count AND the MV cap), so the
 * top-level sentence splitter would shatter it into unmatchable fragments (the second sentence's "from among
 * them" and the third's "revealed this way" are back-references with no standalone meaning). It's therefore
 * collapsed up front to ONE `genesis-wave` atom (applyGenesisWave reveals the top X, puts every eligible
 * permanent — matching the filter AND MV ≤ X — onto the battlefield, then mills the rest to the graveyard).
 *
 * GATED to hasX (an {X}-cost spell) — the caller only calls this on an {X} spell, and the atom is stamped so
 * the program derives xSpell:true (the cast path enumerates affordable X so ctx.xValue reaches the resolver's
 * reveal+cap). CREED: the X cap is the safety — a dropped cap would put ANY-MV permanent onto the battlefield
 * (a forbidden FP) — so the anchor REQUIRES the literal "with mana value x or less" AND an {X} cost, and the
 * filter is validated (permanent → permanentOnly gate; a typed word → parseTutorFilter allowlist). The exact
 * "into your graveyard" disposition is required: a "bottom of your library in a random order" variant (Majestic
 * Genesis / Knickknack Ouphe) or a "shuffle the rest" variant (Genesis Hydra) leaves residue → no match → low →
 * Arbiter. A "put A nonland permanent" (singular) / a dynamic non-cost X ("where X is …") / a spell-mastery or
 * undergrowth rider all fail the exact anchor → low → Arbiter (CREED FN-safe). Returns { atom }.
 */
/**
 * ===== FINALE-OF-REVELATION ===== ({X}{U}{U} sorcery) — "Draw X cards. If X is 10 or more, instead shuffle
 * your graveyard into your library, draw X cards, untap up to five lands, and you have no maximum hand size for
 * the rest of the game. Exile <this>." A THRESHOLD-REPLACEMENT X-spell: the net draw is X either way, but at
 * X ≥ 10 you ALSO shuffle your graveyard into your library (BEFORE the draw, so you draw from the refilled
 * library) and untap up to five of your lands. The "you have no maximum hand size" static is VACUOUS in this
 * engine (cleanup discard is unimplemented — see stripNoMaxHandSizeRider) and is stripped, and "Exile <this>"
 * is the spell exiling ITSELF on resolution (instead of going to the graveyard) — modeled via the program's
 * `selfExile` flag (runEffectProgram honors it at GY-1). The three-sentence, "instead"-replacement, self-
 * referential shape would shatter under the generic clause splitter (the "instead" + the multi-effect comma
 * list + the self-exile all unmodeled by the splitter), so it's collapsed up front to a fixed atom list:
 *
 *   [ shuffle-graveyard-into-library (condX 10),  ← runs first, only at X ≥ 10
 *     draw (amountX),                             ← always runs, X cards (from the refilled library if shuffled)
 *     untap-lands (condX 10, uptoN 5) ]           ← only at X ≥ 10
 *
 * This is FUNCTIONALLY IDENTICAL to the printed card: below 10, only the draw fires (both condX atoms no-op);
 * at/above 10, shuffle→draw→untap all fire in printed order. The shuffle + untap resolvers each carry the same
 * condX gate as applyPumpEffect (Finale of Devastation's precedent). GATED to hasX — the caller only calls this
 * on an {X} spell, and the returned program is stamped xSpell:true so the cast path enumerates affordable X into
 * ctx.xValue (both the draw magnitude AND the ≥10 threshold read it). ANCHORED to the exact whole-oracle shape
 * (after stripping the vacuous hand-size rider): any rider / different threshold / different effect list leaves
 * residue → no match → low → Arbiter (CREED FN-safe — never a partial/wrong model). Returns { atoms, selfExile }.
 */
function matchFinaleOfRevelation(oracle) {
  // NOTE: parseEffectClauseImpl already ran stripNoMaxHandSizeRider on `oracle` before this matcher, replacing
  // the VACUOUS "you have no maximum hand size for the rest of the game" rider with " " — which leaves a
  // DANGLING ", and  " conjunction at the tail of the ≥10 comma-list ("…untap up to five lands, and  \nExile…").
  // The cleanup-discard the rider governs is unimplemented (see stripNoMaxHandSizeRider), so the rider is a
  // documented no-op and its removal is faithful. Here we just normalize the dangling ", and" so the sentence
  // closes cleanly at "untap up to five lands." and the "Exile" self-exile sentence survives for the tail match.
  const s = stripReminder(oracle)
    .trim().toLowerCase().replace(/[’]/g, "'").replace(/\s+/g, " ")
    .replace(/,\s*and\s+(?=\.?\s*exile\b)/g, ". ")   // dangling ", and " left by the upstream hand-size strip → sentence break
    .replace(/\s+/g, " ").replace(/\.\s*\./g, ".").trim();
  // Whole-string anchored: base draw-X, then the ≥10 "instead" replacement (shuffle-GY-into-library, draw X,
  // untap up to five lands), then the self-exile sentence (the spell names ITSELF — matched generically as
  // "exile <name>" at the tail, so it's robust to the printed card name).
  const m = s.match(
    /^draw x cards\. if x is 10 or more, instead shuffle your graveyard into your library, draw x cards, untap up to five lands\. exile [a-z][a-z ',-]*\.?$/,
  );
  if (!m) return null;
  return {
    atoms: [
      { op: "shuffle-graveyard-into-library", condX: { min: 10 }, targetType: null }, // runs first, only at X ≥ 10
      { op: "draw", amountX: true, targetType: null },                                 // always — X cards
      { op: "untap-lands", uptoN: 5, condX: { min: 10 }, targetType: null },           // only at X ≥ 10
    ],
    selfExile: true, // "Exile <this>." — the spell exiles itself on resolution instead of going to the graveyard
  };
}

function matchGenesisWave(oracle) {
  const s = stripReminder(oracle).trim().toLowerCase().replace(/[’]/g, "'").replace(/\s+/g, " ").replace(/\.$/, "");
  // Whole-string anchored: reveal top X → "you may put any number of <filter> cards with mana value X or less
  // from among them onto the battlefield" → "then put all cards revealed this way that weren't put onto the
  // battlefield into your graveyard". The filter phrase is captured (group 1). "onto the battlefield tapped" is
  // NOT accepted here (Genesis Wave / Saheeli's Directive enter untapped; a "tapped" mass-put is a different,
  // unmodeled shape — Animist's Awakening's mandatory all-lands-tapped — so it stays low).
  const m = s.match(
    /^reveal the top x cards of your library\. you may put any number of ([a-z][a-z ]*?) cards with mana value x or less from among them onto the battlefield\. then put all cards revealed this way that weren't put onto the battlefield into your graveyard$/,
  );
  if (!m) return null;
  const phrase = m[1].trim();
  // "permanent" → NO type group (every card type matches) PLUS the permanentOnly gate (front-face must be a
  // permanent type, never an instant/sorcery) — exactly the Wargate `bfx` handling. Any other phrase must be a
  // parseTutorFilter-allowlisted type word ("artifact", "creature", "enchantment", …); the type group itself
  // then restricts to that permanent type (an instant/sorcery could never match "artifact"/"creature"/…).
  const filter = phrase === "permanent" ? { groups: [], permanentOnly: true } : parseTutorFilter(phrase);
  if (!filter) return null; // an unmodeled filter word → low → Arbiter (never a fabricated match)
  // A typed filter must still be permanent-only. parseTutorFilter allows "instant"/"sorcery" words (used by the
  // to-hand tutor family), so reject a group that names a NON-permanent card type — the mass-put must never put
  // an instant/sorcery onto the battlefield (they can't be permanents; a filter naming them is a malformed shape).
  const NONPERMANENT = new Set(["instant", "sorcery"]);
  if (Array.isArray(filter.groups) && filter.groups.some((g) => g.some((w) => NONPERMANENT.has(w)))) return null;
  return { atom: { op: "genesis-wave", filter, filterLabel: `${phrase} card with mana value X or less`, targetType: null } };
}

/**
 * ===== ANIMIST'S AWAKENING (mass reveal-top-X → put-all-LANDS-tapped → bottom-the-rest, + spell-mastery untap)
 * ===== the {X}-cost land-flood family: "Reveal the top X cards of your library. Put all land cards from among
 * them onto the battlefield tapped and the rest on the bottom of your library in a random order.\nSpell mastery
 * — If there are two or more instant and/or sorcery cards in your graveyard, untap those lands." (Animist's
 * Awakening — {X}{G}.)
 *
 * A DISTINCT shape from genesis-wave (which explicitly BANS "onto the battlefield tapped" and requires a "with
 * mana value X or less" MV cap + a "into your graveyard" disposition): here the filter is TYPE-ONLY (all lands,
 * no MV cap), the entry is TAPPED, and the rest goes to the BOTTOM in a random order — plus a spell-mastery
 * untap rider that back-references "those lands". The whole card is collapsed to ONE `animist-awakening` atom
 * because (a) the "put all … and the rest …" reads the SPELL'S X for the reveal count, and (b) the rider's
 * "untap those lands" is a standalone-meaningless back-reference to the lands this atom just put out — the clause
 * splitter would shatter both. GATED to hasX (the reveal count = X binds at cast; a non-X spell would reveal 0).
 *
 * CREED: whole-string anchored on the EXACT template. The base line requires the type-only "put all land cards
 * … onto the battlefield tapped" + "the rest on the bottom of your library in a random order"; the rider
 * requires the EXACT spell-mastery threshold "two or more instant and/or sorcery cards in your graveyard, untap
 * those lands". A different filter (nonland / a specific type), a non-tapped entry, a milled/shuffled/graveyard
 * disposition, an absent or different rider, or a NON-{X} spell all fail the anchor → no match → low → Arbiter
 * (a SAFE false-negative). Returns { atom }.
 */
function matchAnimistAwakening(oracle) {
  const s = stripReminder(oracle).trim().toLowerCase().replace(/[’]/g, "'").replace(/[—–]/g, "-").replace(/\s+/g, " ").replace(/\.$/, "");
  // Whole-string anchored: reveal top X → put ALL land cards onto the battlefield TAPPED + the rest on the bottom
  // in a random order → spell-mastery: 2+ instant and/or sorcery in graveyard untaps those lands. The exact card;
  // every deviation (filter word, tapped/untapped, disposition, rider) fails the anchor → low → Arbiter.
  const m = s.match(
    /^reveal the top x cards of your library\. put all land cards from among them onto the battlefield tapped and the rest on the bottom of your library in a random order\.?\s*spell mastery ?-? ?if there are two or more instant and\/or sorcery cards in your graveyard, untap those lands$/,
  );
  if (!m) return null;
  return { atom: { op: "animist-awakening", targetType: null } };
}

/**
 * ===== OPEN-THE-WAY (reveal-until-X-lands → lands onto the battlefield tapped, rest to the bottom) ===== the
 * {X}-cost sorcery: "X can't be greater than the number of players in the game. Reveal cards from the top of your
 * library until you reveal X land cards. Put those land cards onto the battlefield tapped and the rest on the
 * bottom of your library in a random order." (Open the Way.)
 *
 * This spans THREE sentences and reads the SPELL'S X (both the reveal-until count AND the printed player-count
 * cap), so the top-level sentence splitter would shatter it into unmatchable fragments (the "X can't be greater
 * than …" cap sentence has no atom; "reveal cards … until you reveal X land cards" is a novel dig anchor; "put
 * those land cards … and the rest …" is a back-reference to the reveal). It's therefore collapsed up front to ONE
 * `reveal-until-n-lands` atom (applyRevealUntilNLands reveals from the top until X lands appear — capped at the
 * player count — puts them all onto the battlefield TAPPED firing ETB/landfall, and bottoms every other revealed
 * card in a random order).
 *
 * GATED to hasX (an {X}-cost spell) — the caller only calls this on an {X} spell, and the atom is stamped so the
 * program derives xSpell:true (the cast path enumerates affordable X so ctx.xValue reaches the resolver). CREED:
 * the player-count cap is the printed constraint on X and is enforced at resolution (capPlayerCount → min(X,
 * players) — never a fabricated/uncapped count). The anchor REQUIRES the EXACT three-sentence shape: the leading
 * "X can't be greater than the number of players in the game." cap, the "reveal … until you reveal X land cards"
 * dig, and the EXACT "onto the battlefield tapped and the rest on the bottom of your library in a random order"
 * disposition. Any variant — a "reveal until N nonland cards", an "into your hand" disposition, an untapped put,
 * a different cap ("can't be greater than the number of Islands") — leaves residue → no match → low → Arbiter
 * (CREED whole-card, no partial). The op is KNOWN (registered in libraryResolvers), so the caller emits a HIGH
 * single-atom xSpell program. Returns { atom } or null.
 */
function matchOpenTheWay(oracle) {
  const s = stripReminder(oracle).trim().toLowerCase().replace(/[’]/g, "'").replace(/\s+/g, " ").replace(/\.$/, "");
  // Whole-string anchored: the player-count cap sentence, then "reveal cards from the top of your library until
  // you reveal X land cards", then "put those land cards onto the battlefield tapped and the rest on the bottom
  // of your library in a random order". The cap is required (it's the printed X constraint this atom enforces).
  const m = s.match(
    /^x can't be greater than the number of players in the game\. reveal cards from the top of your library until you reveal x land cards\. put those land cards onto the battlefield tapped and the rest on the bottom of your library in a random order$/,
  );
  if (!m) return null;
  return { atom: { op: "reveal-until-n-lands", capPlayerCount: true, entersTapped: true, targetType: null } };
}

/**
 * ===== EXILE-X-CONTROLLER-RIDER (Curse of the Swine) ===== the X-COUNT twin of matchRemovalControllerRider —
 * "Exile X target creatures. For each creature exiled this way, its controller creates a 2/2 green Boar creature
 * token." → ONE `exile` atom with `targetCountX:true` (the target count is X, bound at cast from the {X} mana
 * cost) + a PER-EXILED controllerRider. The lead is an X-COUNT chosen-target exile (targeting.expandAtoms picks
 * EXACTLY ctx.xValue distinct legal creatures, all tagged atomIndex 0), and the rider — parsed by the SHARED
 * parseControllerRider so the createToken token grammar (N/N <color> <subtype>[ with KW]) is reused verbatim —
 * is applied at RESOLUTION to EACH exiled creature's captured controller by applyRemovalWithRider (which already
 * loops over ctx.targets, capturing every controller before the removal, then applies the rider per-controller).
 * That loop is EXACTLY "For each creature exiled this way, its controller <rider>". GATED to hasX (the target
 * count = X is the CREED safety — the count only binds off a real {X} cost). ALL-OR-NOTHING: a non-createToken
 * rider, a fixed-count / "up to N" lead, or any residue fails the exact anchor → null → whole card low → Arbiter
 * (never the exile without the rider, never a wrong token). Anchored ^…$ on the two-sentence shape.
 */
function matchExileXControllerRider(oracle) {
  const s = stripReminder(oracle).trim().toLowerCase().replace(/[’]/g, "'").replace(/\s+/g, " ").replace(/\.$/, "");
  const m = s.match(/^exile x target creatures\. for each creature exiled this way, its controller (.+)$/);
  if (!m) return null;
  const rider = parseControllerRider(m[1].trim());
  // The corpus form (Curse of the Swine) is a createToken rider; restrict to that kind so a hypothetical
  // "for each creature exiled … its controller gains life / draws" (which reads a per-creature magnitude this
  // slice doesn't compute from the exiled creatures) never fires a partial. createToken is per-controller and
  // count-independent, so the per-exiled loop is faithful. Any other rider kind → null → low → Arbiter.
  if (!rider || rider.kind !== "createToken") return null;
  return { atom: { op: "exile", targetType: "creature", targetCountX: true, controllerRider: rider } };
}

/**
 * ===== REVEAL-TOP-CONDITIONAL (Lurking Predators) ===== "Reveal the top card of your library. If it's a
 * creature card, put it onto the battlefield. Otherwise, you may put that card on the bottom of your library."
 * This is a THREE-sentence effect whose branches (reveal → if-creature → otherwise-may) are shattered by the
 * clause splitter into individually-unmatchable fragments ("reveal the top card of your library" alone is not a
 * modeled atom; "if it's a creature card, put it onto the battlefield" is a conditional the splitter can't route;
 * "otherwise, you may put that card on the bottom of your library" is a back-reference to the reveal). So it's
 * collapsed up front to ONE `reveal-top-conditional` atom whose resolver (applyRevealTopConditional) executes the
 * WHOLE branch faithfully: creature → onto the battlefield (enterCardFromZone, firing ETB); non-creature → put on
 * the bottom (the deterministic "may" branch, exactly like EXPLORE's deterministic keep-on-top option). Anchored
 * ^…$ on the exact three-sentence shape (curly apostrophe + whitespace normalized, trailing period stripped) — any
 * rider / variant (a different fallback, a "then draw", "if it's a land card", a shuffle) leaves residue → no match
 * → low → Arbiter (CREED whole-card, no partial). The op is KNOWN (registered in libraryResolvers), so the caller
 * emits a HIGH single-atom program. Returns { atom }.
 */
function matchRevealTopConditional(oracle) {
  const s = stripReminder(oracle).trim().toLowerCase().replace(/[’]/g, "'").replace(/\s+/g, " ").replace(/\.$/, "");
  if (!/^reveal the top card of your library\. if it's a creature card, put it onto the battlefield\. otherwise, you may put that card on the bottom of your library$/.test(s)) {
    return null;
  }
  return { atom: { op: "reveal-top-conditional", targetType: null } };
}

/**
 * ===== BLOOD-MONEY (mass destroy + Treasure-per-nontoken-destroyed) ===== "Destroy all creatures. For each
 * nontoken creature destroyed this way, you create a tapped Treasure token." The second sentence's count
 * ("destroyed this way") is the set the FIRST destroyed — a back-reference the top-level sentence split would
 * shatter (the "for each … destroyed this way" half has no standalone count source), silently dropping the
 * Treasures. Collapse the whole compound up front to ONE mass-destroy-treasure-per-nontoken atom: the resolver
 * wipes the board (shared destroy) and creates one tapped Treasure per nontoken creature it actually destroyed.
 * Anchored ^…$ on the exact two-sentence shape (a "can't be regenerated" rider would be stripped upstream; any
 * other rider leaves residue → no match → low → Arbiter, CREED). Returns { atom }.
 */
function matchMassDestroyTreasurePerNontoken(oracle) {
  const s = stripReminder(oracle).trim().toLowerCase().replace(/\s+/g, " ").replace(/\.$/, "");
  if (!/^destroy all creatures\. for each nontoken creature destroyed this way, you create a tapped treasure token$/.test(s)) return null;
  return { atom: { op: "mass-destroy-treasure-per-nontoken", targetType: "eachCreature" } };
}

// ===== OPTIONAL-MANA-PAYMENT (CR 603.7c — the "pay {cost}" reflexive) ===== the single-color/generic mana
// pips of an optional-pay cost, parsed into the planPayment cost shape — or null if ANY pip isn't a known
// FIXED mana symbol (digit / single color / {C} / hybrid). {X}/{Y}/{Z} → null (Shanna's "{X}" is unmodeled:
// the chosen X + its life cap aren't in this slice). Mirrors ward.js' parseWardManaPips / legalChoices'
// parseManaCost grammar but is INLINED to keep parser.js a leaf (importing legalChoices would cycle —
// legalChoices already imports parser.js).
function parseFixedManaPips(pipStrings) {
  const cost = { generic: 0, W: 0, U: 0, B: 0, R: 0, G: 0, C: 0, hybrid: [] };
  const SINGLE = new Set(["W", "U", "B", "R", "G"]);
  for (const raw of pipStrings) {
    const pip = String(raw).trim().toUpperCase();
    if (/^\d+$/.test(pip)) { cost.generic += parseInt(pip, 10); continue; }
    if (SINGLE.has(pip)) { cost[pip] += 1; continue; }
    if (pip === "C") { cost.C += 1; continue; }
    if (pip.includes("/")) {
      const parts = pip.split("/").map((p) => p.trim()).filter((p) => p && p !== "P");
      if (parts.length && parts.every((p) => /^\d+$/.test(p) || SINGLE.has(p) || p === "C")) { cost.hybrid.push(parts); continue; }
      return null; // unrecognized hybrid option
    }
    return null; // {X} / snow {S} / any unknown symbol → unmodeled
  }
  return cost;
}

// UPKEEP-SAC-UNLESS-PAY noun allowlist — the printed permanent-type nouns for which "sacrifice this <noun>" means
// "sacrifice the source permanent" unambiguously. An unrecognized noun → no match (safe FN → Arbiter). The sac target
// is always the source (ctx.sourceId) regardless of noun; the allowlist just gates out garbage.
const SAC_UNLESS_PAY_NOUNS = new Set(["creature", "artifact", "enchantment", "land", "permanent", "token"]);

/**
 * ===== UPKEEP-SAC-UNLESS-PAY (echo-without-the-keyword, CR 603.7c) ===== "Sacrifice this <noun> unless you pay
 * {cost}." — the upkeep-tax body of a cumulative/echo-style permanent (the effectClause of "At the beginning of your
 * upkeep, …"): a mana-payment choice with INVERTED polarity vs optional-mana-payment (PAY+afford keeps the permanent;
 * DECLINE or CAN'T-afford sacrifices the source). MUST be matched WHOLE, pre-splitter: a bare "sacrifice this creature"
 * left over hits sacrificeEdictClauseParser → an UNCONDITIONAL self-sac that silently DROPS the pay-escape (a cardinal
 * FP). CREED guards: FIXED mana cost (parseFixedManaPips → null on {X}), an allowlisted permanent noun; anchored ^…$
 * (a rider leaves residue → LOW → Arbiter). Emit the { op:"sac-unless-pay", cost } pausing atom, or null.
 */
function matchUpkeepSacUnlessPay(oracle) {
  const s = stripReminder(oracle).trim().replace(/[’]/g, "'").replace(/\.$/, "");
  const m = s.match(/^sacrifice this(?:\s+([a-z]+))?\s+unless you pay\s+(\{[^}]+\}(?:\{[^}]+\})*)$/i);
  if (!m) return null;
  if (m[1] && !SAC_UNLESS_PAY_NOUNS.has(m[1].toLowerCase())) return null; // an unrecognized noun → unmodeled (safe FN)
  const pips = (m[2].match(/\{([^}]+)\}/g) || []).map((p) => p.slice(1, -1));
  if (!pips.length) return null;
  const mana = parseFixedManaPips(pips);
  if (!mana) return null; // {X} / unknown symbol → unmodeled cost
  return { atom: { op: "sac-unless-pay", cost: { kind: "mana", mana }, targetType: null } };
}

/**
 * ===== OPPONENT-PAYS-TO-DENY (taxed-draw, CR 603.7c) ===== the effect clause of a "Whenever an opponent casts a
 * spell, you may draw a card unless that player pays {N}." trigger (Rhystic Study; Mystic Remora's draw half). The
 * PAYER is the opponent who cast (bound at resolution from ctx.castingPlayerId, threaded by checkCastTriggers); the
 * BENEFICIARY is the trigger's controller (you). applyTaxedDraw suspends on the PAYER's pay-or-let-you-draw choice.
 * A FIXED mana cost only — "{X}, where X is this creature's power" (Esper Sentinel) → parseFixedManaPips null →
 * unmodeled (SAFE FN). The bare "draw a card unless …" (no "you may") maps to the same atom (the payer's choice IS
 * the "may").
 */
function matchTaxedDraw(oracle) {
  const s = stripReminder(oracle).trim().replace(/[’]/g, "'").replace(/\.$/, "");
  const m = s.match(/^(?:you may )?draw a card unless that player pays (\{[^}]+\}(?:\{[^}]+\})*)$/i);
  if (!m) return null;
  const pips = (m[1].match(/\{([^}]+)\}/g) || []).map((p) => p.slice(1, -1));
  if (!pips.length) return null;
  const mana = parseFixedManaPips(pips);
  if (!mana) return null; // {X} (Esper Sentinel) / unknown symbol → unmodeled cost
  return { atom: { op: "taxed-draw", cost: { kind: "mana", mana }, targetType: null } };
}

/**
 * ===== OPTIONAL-MANA-PAYMENT (CR 603.7c) ===== "You may pay {cost}. If you do, <effect>." — an OPTIONAL mana
 * payment whose payoff resolves ONLY if the controller pays (Lifecrafter's Bestiary "you may pay {G}. If you
 * do, draw a card."; Mind's Eye / Inheritance / Horizon-Origin-Panic Spellbomb / Urza's Miter / Symmetry
 * Matrix / Pedantic Learning). The two sentences SPAN the clause splitter (the bare "you may pay {cost}" is a
 * COST, gated to null by the α2 wrapper at parseClauseToAtom line ~794; "if you do, <effect>" is a back-
 * reference with no standalone meaning), so it's collapsed up front to ONE `optional-mana-payment` atom whose
 * resolver SUSPENDS on a real pay/decline choice (runProgram.resolveOptionalManaPaymentChoice — pay → deduct
 * the mana via the shared payManaCost + run the payoff atoms; decline → nothing). This is DISTINCT from the
 * "When you do" REFLEXIVE (matchReflexiveTrigger / triggers.js' general-reflexive append) — that connective is
 * a reflexive triggered ability the optional-primary gate deliberately blocks (diceRoll.test.js pins it LOW);
 * "If you do" is a same-resolution CONDITIONAL the payment gates, so it's modeled HERE.
 *
 * CREED (CLAUDE.md §1.2) — collapse ONLY when EVERY guard holds, else null → the clause stays unmodeled → LOW
 * → Arbiter (a SAFE false-negative):
 *  - The COST is a FIXED mana cost (parseFixedManaPips). An {X} cost (Shanna's "pay {X}. … draw X cards. X
 *    can't be greater than the life you gained") → null (the X + the cap clause are unmodeled).
 *  - The PAYOFF parses HIGH + NON-MODAL on its own, every atom KNOWN, and is SELF-CONTAINED: NO chosen-target
 *    atom (programNeedsChosenTarget false) — the draw-family payoffs are targetless, and a targeted payoff
 *    (Ant-Man's "put a +1/+1 counter on target creature") would need target wiring threaded through the pay-
 *    choice this slice doesn't build, so it stays LOW. NOT an xSpell (an {X} amount in the payoff would bind
 *    ambiguously). Modeled payoffs other than draw register automatically as their atoms become KNOWN.
 *  - Whole-string anchored ^…$ on the single "you may pay … if you do, …" shape — any rider / a second
 *    "if you do" / a chained reflexive leaves residue → no match → LOW → Arbiter. Returns { atom } or null.
 */
function matchOptionalManaPayment(oracle, cardType) {
  const s = stripReminder(oracle).trim().replace(/[’]/g, "'").replace(/\.$/, "");
  // "you may pay {pips}. if you do, <effect>" — the cost is one-or-more directly-adjacent mana pips.
  const m = s.match(/^you may pay\s+(\{[^}]+\}(?:\{[^}]+\})*)\.\s*if you do,?\s+(.+)$/i);
  if (!m) return null;
  const pips = (m[1].match(/\{([^}]+)\}/g) || []).map((p) => p.slice(1, -1));
  if (!pips.length) return null;
  const mana = parseFixedManaPips(pips);
  if (!mana) return null;                                            // {X} / unknown symbol → unmodeled cost
  const payoffText = m[2].trim();
  if (/\bif you do\b/i.test(payoffText)) return null;                // a SECOND "if you do" — not modeled
  const payoff = parseEffectClauseImpl(payoffText, cardType, { hasX: false });
  if (!payoff || programConfidence(payoff) !== "high" || payoff.structure === "modal" || payoff.xSpell) return null;
  const inner = payoff.atoms || [];
  if (inner.length === 0 || !inner.every((a) => KNOWN.has(a.op))) return null;
  // SELF-CONTAINED gate (CREED): a chosen-target payoff would need its target threaded through the pay-choice
  // (unbuilt) → keep it LOW. The draw-family payoffs are targetless (programNeedsChosenTarget false).
  if (programNeedsChosenTarget(payoff)) return null;
  // WI-3 PAYOFF-PAUSE gate (CREED): a NON-LAST payoff atom whose resolver can itself pause (set
  // pendingChoice — PAUSING_ATOM_OPS, declared beside ATOM_RESOLVERS) would DROP every payoff atom
  // after it at settle time: the settler (runProgram.resolveOptionalManaPaymentChoice) chains a mid-
  // payoff pause onto the PROGRAM continuation, not the payoff tail. "pay {1}. If you do, scry 1,
  // then draw a card" would scry but never draw — a dropped-atom FP. Reject → LOW → Arbiter (SAFE
  // FN). A LAST-position pausing payoff is fine (nothing follows to drop).
  if (inner.slice(0, -1).some((a) => PAUSING_ATOM_OPS.has(a.op))) return null;
  return { atom: { op: "optional-mana-payment", cost: { kind: "mana", mana }, effectAtoms: inner, targetType: null } };
}

// REFLEXIVE-SAC-BY-SUBTYPE — the artifact/blood TOKEN subtypes a "you may sacrifice a <X>. If you do, …" gate
// names. Tight allowlist (CR 205.3 subtypes that appear on fungible value tokens): the runtime sacrifices ONE
// matching permanent the controller already owns (sacBySubtypeRuntime word-bounds the SAME type line as
// sacScopeMatches), so the sac genuinely happens before the payoff. A creature-subtype sac ("a Goblin" — a
// non-fungible permanent with its own dies fallout + board-eval) is deliberately OUT of scope → stays LOW →
// Arbiter (a SAFE false-negative). Capitalized canonical forms; the matcher capitalizes the captured word.
const SAC_TOKEN_SUBTYPES = new Set(["Food", "Treasure", "Clue", "Blood", "Gold", "Map", "Powerstone", "Junk", "Incubator"]);

/**
 * ===== REFLEXIVE-SAC-BY-SUBTYPE (CR 603.7c) ===== "You may sacrifice a <subtype>. If you do, <effect>." — an
 * OPTIONAL sacrifice of a named-subtype permanent (a Food / Treasure / Blood …) whose payoff resolves ONLY if
 * the controller actually sacrifices one (The Goose Mother "you may sacrifice a Food. If you do, draw a card.";
 * Wedding Security "sacrifice a Blood token. If you do, put a +1/+1 counter on this creature and draw a card.").
 * Structurally identical to OPTIONAL-MANA-PAYMENT — the COST is a subtype-permanent sacrifice instead of mana —
 * so it's collapsed up front (the two sentences span the clause splitter: "you may sacrifice a Food" parses LOW
 * as a bare clause — there's no subtype-sac atom — and "if you do, <effect>" is a meaningless back-reference)
 * into ONE `optional-sac-payment` atom whose resolver SUSPENDS on a real sac/decline choice
 * (runProgram.resolveOptionalSacChoice — sac → pitch one matching permanent via sacrificeCreatureEffect [firing
 * its dies + TRIG-SACRIFICE watchers, CR 701.21] then run the payoff atoms; decline / NONE available → nothing).
 *
 * CREED (CLAUDE.md §1.2) — collapse ONLY when EVERY guard holds, else null → the clause stays unmodeled → LOW
 * → Arbiter (a SAFE false-negative). The decline / no-matching-permanent path runs NO payoff (sacrificeCreatureEffect
 * never fabricates a sacrifice), the cardinal guarantee:
 *  - The SUBTYPE is a fungible value-TOKEN subtype (SAC_TOKEN_SUBTYPES). A creature subtype / a card-type word
 *    is OUT of scope → null. Optional " token"/"tokens" suffix tolerated (Wedding Security "a Blood token").
 *  - COUNT is exactly one (a/an). "two Blood tokens" (Strefan) → null (multi-sac + its complex payoff are out).
 *  - The PAYOFF parses HIGH + NON-MODAL on its own, every atom KNOWN, NOT an xSpell, and SELF-CONTAINED (no
 *    chosen-target atom — programNeedsChosenTarget false) — the same gate OPTIONAL-MANA-PAYMENT uses (a targeted
 *    payoff would need its target threaded through the sac-choice this slice doesn't build). So draw / counter-
 *    on-this / lifegain payoffs register; "attacking creatures get +1/+1" (Provisions Merchant — team pump),
 *    "it gets +2/+2" (Bloodcrazed Socialite — unbound referent), and "Otherwise, …" (Insatiable Appetite — the
 *    else-branch survives in the payoff text → fails HIGH) all stay LOW → Arbiter.
 * Whole-string anchored ^…$ on the single "you may sacrifice a <subtype>. if you do, …" shape — any rider / a
 * second "if you do" leaves residue → no match. Returns { atom } or null.
 */
function matchOptionalSacBySubtype(oracle, cardType) {
  const s = stripReminder(oracle).trim().replace(/[’]/g, "'").replace(/\.$/, "");
  // "you may sacrifice a/an <Subtype>[ token]. if you do, <effect>" — single permanent only (a/an).
  const m = s.match(/^you may sacrifice (?:a|an) ([A-Za-z]+)(?:\s+tokens?)?\.\s*if you do,?\s+(.+)$/i);
  if (!m) return null;
  const subtype = m[1].charAt(0).toUpperCase() + m[1].slice(1).toLowerCase();
  if (!SAC_TOKEN_SUBTYPES.has(subtype)) return null;                 // not a fungible value-token subtype → unmodeled
  const payoffText = m[2].trim();
  if (/\bif you do\b/i.test(payoffText)) return null;                // a SECOND "if you do" — not modeled
  if (/\botherwise\b/i.test(payoffText)) return null;               // an else-branch (Insatiable Appetite) — out of scope
  const payoff = parseEffectClauseImpl(payoffText, cardType, { hasX: false });
  if (!payoff || programConfidence(payoff) !== "high" || payoff.structure === "modal" || payoff.xSpell) return null;
  const inner = payoff.atoms || [];
  if (inner.length === 0 || !inner.every((a) => KNOWN.has(a.op))) return null;
  // SELF-CONTAINED gate (CREED): a chosen-target payoff would need its target threaded through the sac-choice
  // (unbuilt) → keep it LOW. The draw / counter-on-this / lifegain payoffs are targetless / self-scoped.
  if (programNeedsChosenTarget(payoff)) return null;
  // WI-3 PAYOFF-PAUSE gate (CREED): a NON-LAST payoff atom whose resolver can itself pause (set
  // pendingChoice — PAUSING_ATOM_OPS, declared beside ATOM_RESOLVERS) would DROP every payoff atom
  // after it at settle time: the settler (runProgram.resolveOptionalSacChoice) chains a mid-payoff
  // pause onto the PROGRAM continuation, not the payoff tail. Reject → LOW → Arbiter (SAFE FN). A
  // LAST-position pausing payoff is fine (nothing follows to drop). Mirrors matchOptionalManaPayment.
  if (inner.slice(0, -1).some((a) => PAUSING_ATOM_OPS.has(a.op))) return null;
  return { atom: { op: "optional-sac-payment", subtype, effectAtoms: inner, targetType: null } };
}

/**
 * ===== OPTIONAL DRAW-THEN-DISCARD (reverse Looter, CR 603.7c-shaped) ===== "You may draw a card. If you do,
 * discard a card." (Riddlesmith, Murder of Crows, Skyswimmer Koi) — a net-neutral optional loot. Structurally an
 * optional-payment with NO cost: pause on the "may draw" yes/no; on YES run the [draw, discard] sequence (the
 * discard is the LAST atom, so its which-card pause chains cleanly onto the program continuation via the shared
 * payoff loop); on NO / decline, nothing changes (the cardinal CREED guarantee — hand & library untouched).
 * The mandatory "Draw a card, then discard a card" already composes (the ", then" splitter); only this OPTIONAL
 * wrapper is added. Whole-string ^…$ anchored — a rider / once-per-turn qualifier / "each opponent discards" /
 * "discard your hand" leaves residue → no match → LOW → Arbiter (SAFE FN).
 */
function matchOptionalDrawDiscard(oracle) {
  const s = stripReminder(oracle).trim().replace(/[’]/g, "'").replace(/\.$/, "");
  const m = s.match(/^you may draw (a card|\w+ cards?)\.\s*if you do,?\s+(discard (?:a|an|one|two|three|four|five|\w+) cards?)$/i);
  if (!m) return null;
  // LOAD-BEARING: compose + parse the payoff under LITERAL "Instant", NOT cardType — the draw atom's legacy gate
  // returns HIGH only for Instant/Sorcery; passing the card's own type (creature/artifact) → LOW → zero flips.
  const payoff = parseEffectClauseImpl(`draw ${m[1]}, then ${m[2].trim()}`, "Instant", { hasX: false });
  if (!payoff || programConfidence(payoff) !== "high" || payoff.structure === "modal" || payoff.xSpell) return null;
  const inner = payoff.atoms || [];
  if (inner.length !== 2 || inner[0].op !== "draw" || inner[1].op !== "discard") return null;   // exactly [draw, discard]
  if (!(inner[1].who == null || inner[1].who === "controller")) return null;                     // "each opponent discards" → out
  if (!inner.every((a) => KNOWN.has(a.op)) || programNeedsChosenTarget(payoff)) return null;
  if (inner.slice(0, -1).some((a) => PAUSING_ATOM_OPS.has(a.op))) return null;                    // only the LAST (discard) may pause
  return { atom: { op: "optional-draw-discard", effectAtoms: inner, targetType: null } };
}

/**
 * ===== OPTIONAL-DISCARD-PAYMENT (CR 603.7c) ===== "you may discard a card. If you do, <effect>." — the discard is
 * the pausing COST (a which-card choice), the payoff runs ONLY after a real discard settles. DISTINCT from draw-then-
 * discard (there the discard is the coupled effect, LAST-position; here it's the leading cost). The cost owns the one
 * pause slot, so the payoff MUST be non-pausing (else the two pauses would interleave and drop atoms — the 32-flip
 * guard). CREED guards: HIGH + non-modal + not-xSpell + every atom KNOWN + targetless; reject a chained 2nd reflexive
 * or an else-branch. Match → the single atom, else null (the clause stays LOW → Arbiter).
 */
function matchOptionalDiscardPayment(oracle) {
  const s = stripReminder(oracle).trim().replace(/[’]/g, "'").replace(/\.$/, "");
  const m = s.match(/^you may discard a card\.\s*if you do,?\s+(.+)$/i);
  if (!m) return null;
  const payoffText = m[1].trim();
  if (/\bif you do\b/i.test(payoffText) || /\botherwise\b/i.test(payoffText)) return null; // 2nd reflexive / else-branch — not modeled
  // LOAD-BEARING (mirrors matchOptionalDrawDiscard FIX A): parse the payoff under LITERAL "Instant", NOT the card's
  // own type — the draw atom's legacy gate returns HIGH only for Instant/Sorcery, and 30 of the 32 flips are creatures
  // whose payoff is "draw a card". Passing cardType (Creature/Artifact) → LOW → the draw flips vanish. The payoff
  // atoms (draw/token/pump) resolve type-agnostically, so "Instant" is behavior-identical and correct.
  const payoff = parseEffectClauseImpl(payoffText, "Instant", { hasX: false });
  if (!payoff || programConfidence(payoff) !== "high" || payoff.structure === "modal" || payoff.xSpell) return null;
  const inner = payoff.atoms || [];
  if (!inner.length || !inner.every((a) => KNOWN.has(a.op)) || programNeedsChosenTarget(payoff)) return null;
  if (inner.some((a) => PAUSING_ATOM_OPS.has(a.op))) return null; // the cost-discard owns the only pause slot — a pausing payoff would interleave
  return { atom: { op: "optional-discard-payment", effectAtoms: inner, targetType: null } };
}

/**
 * ===== REFLEXIVE TRIGGER (CR 603.7) ===== "<primary>. When you do[ this/so], <reflexive>." — a reflexive
 * triggered ability set up by the resolution of the primary effect, triggering off the event that resolution
 * causes ("when you do" = "when the immediately-preceding instruction's action happens"). Per CR 603.7 the
 * reflexive goes on the stack as its OWN triggered ability; the self-play engine models that faithfully by
 * running its atoms as the SEQUENTIAL TAIL of the primary's program — which is behavior-identical here BECAUSE
 * the fold is gated to the safe sub-case (below): the primary ALWAYS happens, so the reflexive ALWAYS fires,
 * and the reflexive's target choice is independent of any window between the two (no intervening-priority
 * effect can change it). The roll-d20 reflexive (Ancient Bronze Dragon) is folded UPSTREAM in detectTriggers
 * (its halves are LOW alone — bare roll / orphan diceResult — and only the concatenation is HIGH, a distinct
 * shape); this matcher handles the GENERAL case where BOTH halves parse HIGH on their own (Faebloom Trick:
 * "Create two 1/1 blue Faerie tokens with flying. When you do, tap target creature an opponent controls.").
 *
 * CREED (CLAUDE.md §1.2) — fold ONLY when EVERY guard holds, else null → the "When you do" sentence stays an
 * unmodeled clause → LOW → Arbiter (a SAFE false-negative):
 *  - The PRIMARY is MANDATORY (no `optional` atom). An OPTIONAL primary ("you may create a Treasure token.
 *    When you do, …" — Generous Plunderer) MUST NOT fold: a sequential tail would fire the reflexive even
 *    when the controller DECLINES the "may" — a confident WRONG play (the cardinal FP). The whole card then
 *    stays body-only/Arbiter.
 *  - Both halves are HIGH + NON-MODAL.
 *  - The REFLEXIVE is SELF-CONTAINED: it must not lead with a primary-object referent ("it"/"they"/"that …"
 *    — Back for More's "it fights …") whose binding the sequential interpreter can't supply correctly here,
 *    and it must not be an xSpell shape (an {X} cost on the reflexive would mis-bind). A reflexive that reads
 *    a context value (the dice result) is the roll case, handled upstream — never reaches this matcher.
 * Anchored to a SINGLE "when you do" (a chained second reflexive leaves residue → no match). Returns the
 * concatenated { atoms } (primary then reflexive) so the caller emits one HIGH sequence, or null.
 */
function matchReflexiveTrigger(oracle, cardType, hasX) {
  const s = stripReminder(oracle).trim();
  // Split on the FIRST " when you do[ this/so][,] " connective (case-insensitive). Require text on both sides.
  const m = s.match(/^(.+?\S)\.\s+when you do(?:\s+this|\s+so)?\s*,?\s+(.+?)\.?$/i);
  if (!m) return null;
  const primaryText = m[1].trim();
  const reflexiveText = m[2].trim();
  // The reflexive must not carry a SECOND reflexive/trigger or lead with an unbound primary-object referent.
  if (/\bwhen you do\b/i.test(reflexiveText)) return null;          // a chained 2nd reflexive — not modeled
  if (/^(?:it|they|that|those|this)\b/i.test(reflexiveText)) return null; // primary-object referent (e.g. "it fights")
  const primary = parseEffectClauseImpl(primaryText, cardType, { hasX });
  if (!primary || programConfidence(primary) !== "high" || primary.structure === "modal") return null;
  // MANDATORY-primary gate: an optional primary ("you may …") must not fold (a declined "may" would still
  // fire the reflexive). xSpell primary is allowed (X binds at cast); but reject if the PRIMARY is itself an
  // xSpell here only when the reflexive also needs X (kept simple — neither half xSpell, see below).
  if ((primary.atoms || []).some(a => a.optional)) return null;
  const reflexive = parseEffectClauseImpl(reflexiveText, cardType, { hasX: false });
  if (!reflexive || programConfidence(reflexive) !== "high" || reflexive.structure === "modal") return null;
  // Conservative: neither half may be an xSpell (an {X} amount would bind ambiguously across the fold), and
  // the reflexive must not itself carry an optional atom mid-sequence that a later atom could wrongly force
  // (optionalsFormSuffix on the COMBINED sequence enforces the α2 invariant at the call site too).
  if (primary.xSpell || reflexive.xSpell) return null;
  const atoms = [...(primary.atoms || []), ...(reflexive.atoms || [])];
  if (!atoms.every(a => KNOWN.has(a.op)) || !optionalsFormSuffix(atoms)) return null;
  return { atoms };
}

// INSPIRING CALL — "Draw a card for each creature you control with a +1/+1 counter on it. Those creatures gain
// <grantable keyword[s]> until end of turn." The "those creatures" anaphora binds the group grant to the SAME
// +1/+1-counter-filtered set the draw just counted; the two sentences span the clause splitter, so it's matched
// up front as [draw (requiresCounter count-source), grant-keywords-group (requiresCounter filter)]. FP-safe: the
// grant keyword runs through the grantable-keyword allowlist (an un-grantable keyword → the grant clause returns
// null → the whole card stays LOW), the exact "for each creature you control with a +1/+1 counter" anchor can't
// over-match, and BOTH atoms must be KNOWN (draw + grant-keywords-group) or it's LOW (no partial — CREED).
function matchDrawCounterCreaturesThenGrant(oracle, cardType, hasX) {
  const t = stripReminder(oracle).toLowerCase().replace(/[’]/g, "'").trim();
  const m = t.match(/^draw a card for each creature you control with a \+1\/\+1 counter on it\. those creatures gain (.+) until end of turn\.$/);
  if (!m) return null;
  const drawAtom = parseClauseToAtom(cardType, "draw a card for each creature you control with a +1/+1 counter on it", hasX);
  const grantAtom = parseClauseToAtom(cardType, `creatures you control gain ${m[1]} until end of turn`, hasX);
  if (!drawAtom || !grantAtom || grantAtom.op !== "grant-keywords-group") return null;
  return { atoms: [drawAtom, { ...grantAtom, requiresCounter: "+1/+1" }] };
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
  // DICE-ROLL — drop the vacuous "no maximum hand size" rider (Ancient Silver Dragon) so the roll+draw body
  // parses; cleanup discard-to-max is unimplemented, so the resolution is identical (see stripNoMaxHandSizeRider).
  oracle = stripNoMaxHandSizeRider(oracle);
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
      return makeProgram({ confidence: "high", atoms, xSpell: atoms.some(a => a.amountX || a.countX || a.ptX || a.filter?.mvCapX || a.mvCapX), unparsedTail: null });
    }
    return makeProgram({ confidence: "low", atoms: [], unparsedTail: oracle });
  };
  const hd = matchHandDisruption(oracle);
  if (hd) return collapsed(hd);
  const dig = matchImpulseDig(oracle);
  if (dig) return collapsed(dig);
  // DIG-LAND-TO-BATTLEFIELD (Silverback Elder mode 2) — "Look at the top N … You may put a land card from
  // among them onto the battlefield [tapped]. Put the rest on the bottom … in a random order." spans two
  // sentences (the "from among them" / trailing " and " would shatter), so it's collapsed up front to one
  // dig-land-to-battlefield atom, then any rider runs through the normal pipeline. Tried AFTER matchImpulseDig
  // (the two anchors are mutually exclusive — hand vs. battlefield — so order is documentation, not precedence).
  const digLand = matchDigLandToBattlefield(oracle);
  if (digLand) return collapsed(digLand);
  // CHOSEN-TYPE DRAW (Distant Melody) — "Choose a creature type. Draw a card for each permanent you control
  // of that type." spans two sentences, so it's collapsed up front to one chosen-type-count draw atom.
  const ctd = matchChooseTypeDraw(oracle);
  if (ctd) return collapsed(ctd);
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
  // ===== INSPIRING CALL ===== draw-for-each-counter-creature + "those creatures gain <kw>" — see
  // matchDrawCounterCreaturesThenGrant. Emits [draw, grant] directly; HIGH iff both KNOWN (they are).
  const dcg = matchDrawCounterCreaturesThenGrant(oracle, cardType, hasX);
  if (dcg && dcg.atoms.every(a => KNOWN.has(a.op))) {
    return makeProgram({ confidence: "high", atoms: dcg.atoms, xSpell: false, unparsedTail: null });
  }
  // ===== DRAIN-X (Exsanguinate) ===== "Each opponent loses X life. You gain life equal to the life lost this
  // way." → ONE drain-each-opponent atom (the lifegain is the actual total drained, computed at resolution).
  // Gated to an {X}-cost spell (the matcher requires the literal "X"). xSpell:true so the cast path enumerates X.
  if (hasX) {
    const drx = matchDrainEachOpponentX(oracle);
    if (drx && KNOWN.has(drx.atom.op)) {
      return makeProgram({ confidence: "high", atoms: [drx.atom], xSpell: true, unparsedTail: null });
    }
  }
  // ===== ITERATED-EDICT (Torment of Hailfire) ===== "Repeat the following process X times. Each opponent loses
  // 3 life unless that player sacrifices a nonland permanent of their choice or discards a card." → ONE
  // iterated-edict atom (X × per-opponent lose-3 / sac-nonland / discard, each opponent's own choice, resolved
  // through the pausing edict chain). Collapsed up front — the "repeat X times" wrapper + the "unless…or…"
  // multi-mode CHOICE both defeat the clause splitter, which would drop the affected-player decision. Gated to
  // an {X}-cost spell; xSpell:true so the cast path binds the chosen X (the repeat count) into ctx.xValue.
  if (hasX) {
    const ie = matchIteratedEdict(oracle);
    if (ie && KNOWN.has(ie.atom.op)) {
      return makeProgram({ confidence: "high", atoms: [ie.atom], xSpell: true, unparsedTail: null });
    }
  }
  // ===== REVEAL-TOP-DRAIN-BY-MV (Yuriko) ===== "Reveal the top card … put that card into your hand. Each
  // opponent loses life equal to that card's mana value." → reveal-top-to-hand (stamps the drawn card's MV on
  // state.revealedCardMV) + lose-life eachOpponent reading that MV via amountCount:{kind:"revealedCardMV"}. The
  // two-sentence span (the drain reads a mid-resolution value the reveal produced) would shatter under the
  // clause splitter, so it's collapsed up front. HIGH iff both atoms are KNOWN (they are) AND the reveal
  // precedes the MV read (revealTopSequenceOk) — else low → Arbiter (no partial). Not an X spell.
  const rtm = matchRevealTopDrainByMv(oracle);
  if (rtm && rtm.atoms.every(a => KNOWN.has(a.op)) && revealTopSequenceOk(rtm.atoms)) {
    return makeProgram({ confidence: "high", atoms: rtm.atoms, xSpell: false, unparsedTail: null });
  }
  // ===== GENESIS-WAVE ===== (an {X}-cost mass permanent-drop) — "Reveal the top X cards. You may put any number
  // of <filter> cards with mana value X or less from among them onto the battlefield. Then put all cards revealed
  // this way that weren't put onto the battlefield into your graveyard." → ONE `genesis-wave` atom (reveal top X →
  // put every eligible permanent → mill the rest). Spans three sentences reading the SPELL'S X twice (reveal count
  // + MV cap), so it's collapsed up front before the clause splitter shatters it. Gated to hasX (the MV cap = X is
  // the CREED safety — never fired without a real {X} cost); the atom is KNOWN → HIGH, and xSpell:true so the cast
  // path enumerates affordable X into ctx.xValue. A non-matching disposition / singular put / dynamic-X variant
  // fails the exact anchor → falls through → low → Arbiter.
  if (hasX) {
    const gw = matchGenesisWave(oracle);
    if (gw && KNOWN.has(gw.atom.op)) {
      return makeProgram({ confidence: "high", atoms: [gw.atom], xSpell: true, unparsedTail: null });
    }
    // ===== ANIMIST'S AWAKENING ===== (an {X}-cost land-flood) — "Reveal the top X cards. Put all land cards …
    // onto the battlefield tapped and the rest on the bottom … in a random order. Spell mastery — if 2+ instant/
    // sorcery in your graveyard, untap those lands." → ONE `animist-awakening` atom (reveal top X → put all lands
    // tapped → bottom the rest random → spell-mastery untap). The base line + the "those lands" back-referencing
    // rider span sentences the clause splitter would shatter, so it's collapsed up front. Gated to hasX (the
    // reveal count = X); disjoint anchor from genesis-wave ("all land cards … tapped" vs "mana value X or less"),
    // so order-free. xSpell:true so the cast path enumerates affordable X into ctx.xValue. Non-match → low → Arbiter.
    const aa = matchAnimistAwakening(oracle);
    if (aa && KNOWN.has(aa.atom.op)) {
      return makeProgram({ confidence: "high", atoms: [aa.atom], xSpell: true, unparsedTail: null });
    }
    // ===== OPEN-THE-WAY ===== ({X}-cost, X≤players) — "X can't be greater than the number of players in the game.
    // Reveal cards from the top of your library until you reveal X land cards. Put those land cards onto the
    // battlefield tapped and the rest on the bottom of your library in a random order." → ONE `reveal-until-n-lands`
    // atom (reveal-until-X-lands → all lands onto the battlefield tapped → rest to the bottom in random order). The
    // three-sentence span (cap + dig + disposition, all reading the spell's X) would shatter under the clause
    // splitter, so it's collapsed up front. Gated to hasX; the atom is KNOWN → HIGH, xSpell:true so the cast path
    // enumerates affordable X into ctx.xValue (the resolver then caps at the player count). A non-matching cap /
    // disposition / dig variant fails the exact anchor → falls through → low → Arbiter.
    const otw = matchOpenTheWay(oracle);
    if (otw && KNOWN.has(otw.atom.op)) {
      return makeProgram({ confidence: "high", atoms: [otw.atom], xSpell: true, unparsedTail: null });
    }
  }
  // ===== EXILE-X-CONTROLLER-RIDER (Curse of the Swine) ===== "Exile X target creatures. For each creature
  // exiled this way, its controller creates a 2/2 green Boar creature token." → ONE exile atom (targetCountX —
  // the target count is the chosen X) carrying a per-exiled createToken controllerRider. Gated to hasX (the
  // count = X is the CREED safety); xSpell:true so the cast path enumerates affordable X into ctx.xValue and
  // targeting.expandAtoms picks EXACTLY X targets. A non-matching lead / rider fails the anchor → low → Arbiter.
  if (hasX) {
    const exr = matchExileXControllerRider(oracle);
    if (exr && KNOWN.has(exr.atom.op)) {
      return makeProgram({ confidence: "high", atoms: [exr.atom], xSpell: true, unparsedTail: null });
    }
  }
  // ===== FINALE-OF-REVELATION ===== ({X} sorcery) — "Draw X. If X ≥ 10, instead shuffle GY→library, draw X,
  // untap up to five lands. Exile <this>." → [shuffle-gy-into-library(condX 10), draw(amountX), untap-lands(condX
  // 10, uptoN 5)] + selfExile. Collapsed up front (the "instead"-replacement + multi-effect comma list + self-
  // exile would shatter under the clause splitter). HIGH iff every atom is KNOWN (they are); xSpell:true so the
  // cast path enumerates X (both the draw magnitude AND the ≥10 gate read ctx.xValue). Gated to hasX.
  if (hasX) {
    const fr = matchFinaleOfRevelation(oracle);
    if (fr && fr.atoms.every((a) => KNOWN.has(a.op))) {
      return makeProgram({ confidence: "high", atoms: fr.atoms, xSpell: true, unparsedTail: null, selfExile: fr.selfExile });
    }
  }
  // ===== REVEAL-TOP-CONDITIONAL (Lurking Predators) ===== "Reveal the top card … If it's a creature card, put it
  // onto the battlefield. Otherwise, you may put that card on the bottom …" → ONE reveal-top-conditional atom
  // (creature → onto the battlefield firing ETB; else → deterministically to the bottom). The three-sentence
  // branch would shatter under the clause splitter, so it's collapsed up front. HIGH iff the op is KNOWN (it is).
  // Not an X spell.
  const rtc = matchRevealTopConditional(oracle);
  if (rtc && KNOWN.has(rtc.atom.op)) {
    return makeProgram({ confidence: "high", atoms: [rtc.atom], xSpell: false, unparsedTail: null });
  }
  // ===== BLOOD-MONEY ===== "Destroy all creatures. For each nontoken creature destroyed this way, you create a
  // tapped Treasure token." → ONE mass-destroy-treasure-per-nontoken atom (the Treasure count is the nontoken
  // creatures actually destroyed, computed at resolution). The "can't be regenerated" rider (none on Blood
  // Money) is already stripped above; the atom inherits no cannotRegenerate. Not an X spell.
  const bm = matchMassDestroyTreasurePerNontoken(oracle);
  if (bm && KNOWN.has(bm.atom.op)) {
    return makeProgram({ confidence: "high", atoms: [bm.atom], xSpell: false, unparsedTail: null });
  }
  // ===== REFLEXIVE TRIGGER (CR 603.7) ===== "<primary>. When you do, <reflexive>." — fold the reflexive as
  // the sequential tail of the (mandatory, always-firing) primary. matchReflexiveTrigger applies every CREED
  // guard (mandatory primary, both halves HIGH, self-contained reflexive); a fold returns the combined atoms,
  // else null → falls through to the normal pipeline where the "When you do" clause stays unmodeled → LOW →
  // Arbiter. Checked before the clause splitter (which would shatter the "When you do, …" sentence). xSpell
  // false (the matcher rejects an xSpell half), so amount-X binding is unaffected.
  const rfx = matchReflexiveTrigger(oracle, cardType, hasX);
  if (rfx) {
    return makeProgram({ confidence: "high", atoms: rfx.atoms, xSpell: false, unparsedTail: null });
  }
  // ===== OPTIONAL-MANA-PAYMENT (CR 603.7c) ===== "You may pay {cost}. If you do, <effect>." → ONE
  // optional-mana-payment atom (the resolver suspends on a real pay/decline; payManaCost charges the cost, the
  // payoff atoms run only on PAY). Checked before the clause splitter (which would shatter the two sentences:
  // "you may pay {cost}" gates to null as a cost, "if you do, <effect>" is a standalone-meaningless back-
  // reference). matchOptionalManaPayment applies every CREED guard (fixed cost, HIGH non-modal targetless
  // payoff); a match returns the single atom (op KNOWN → HIGH), else null → the clause stays LOW → Arbiter.
  const omp = matchOptionalManaPayment(oracle, cardType);
  if (omp && KNOWN.has(omp.atom.op)) {
    return makeProgram({ confidence: "high", atoms: [omp.atom], xSpell: false, unparsedTail: null });
  }
  // ===== UPKEEP-SAC-UNLESS-PAY ===== "Sacrifice this <noun> unless you pay {cost}." → ONE sac-unless-pay atom (pay
  // keeps it, decline/can't-afford sacrifices the source). MUST be matched WHOLE here, PRE-SPLITTER — a leftover bare
  // "sacrifice this creature" would hit sacrificeEdictClauseParser → an unconditional self-sac that drops the pay-
  // escape (cardinal FP). Disjoint anchor from the other folds ("sacrifice this…" vs "you may…"), so order-free.
  const sup = matchUpkeepSacUnlessPay(oracle);
  if (sup && KNOWN.has(sup.atom.op)) {
    return makeProgram({ confidence: "high", atoms: [sup.atom], xSpell: false, unparsedTail: null });
  }
  // ===== OPPONENT-PAYS-TO-DENY ===== "you may draw a card unless that player pays {N}" (Rhystic Study's trigger
  // effect) → ONE taxed-draw atom (the payer = the opponent who cast, from ctx.castingPlayerId; the beneficiary =
  // you). applyTaxedDraw suspends on the payer's pay/decline. Disjoint anchor from the folds above.
  const txd = matchTaxedDraw(oracle);
  if (txd && KNOWN.has(txd.atom.op)) {
    return makeProgram({ confidence: "high", atoms: [txd.atom], xSpell: false, unparsedTail: null });
  }
  // ===== REFLEXIVE-SAC-BY-SUBTYPE (CR 603.7c) ===== "You may sacrifice a <subtype>. If you do, <effect>." → ONE
  // optional-sac-payment atom (the resolver suspends on a real sac/decline; sacrificeCreatureEffect pitches one
  // matching permanent + fires its dies/TRIG-SACRIFICE watchers, the payoff atoms run only on a real sac).
  // Checked before the clause splitter (which would shatter the two sentences: "you may sacrifice a Food" parses
  // LOW as a bare clause, "if you do, <effect>" is a standalone-meaningless back-reference). matchOptionalSacBySubtype
  // applies every CREED guard (fungible value-token subtype, single permanent, HIGH non-modal targetless payoff,
  // no else-branch); a match returns the single atom (op KNOWN → HIGH), else null → the clause stays LOW → Arbiter.
  const osp = matchOptionalSacBySubtype(oracle, cardType);
  if (osp && KNOWN.has(osp.atom.op)) {
    return makeProgram({ confidence: "high", atoms: [osp.atom], xSpell: false, unparsedTail: null });
  }
  // ===== OPTIONAL DRAW-THEN-DISCARD ===== "you may draw a card. If you do, discard a card." → ONE
  // optional-draw-discard atom (resolver runs [draw, discard] only on yes; the discard's which-card pause chains
  // onto the program continuation). Checked before the clause splitter (the two sentences would shatter).
  const odd = matchOptionalDrawDiscard(oracle);
  if (odd && KNOWN.has(odd.atom.op)) {
    return makeProgram({ confidence: "high", atoms: [odd.atom], xSpell: false, unparsedTail: null });
  }
  // ===== OPTIONAL-DISCARD-PAYMENT ===== "you may discard a card. If you do, <effect>." → ONE optional-discard-payment
  // atom (the discard is the pausing COST; the payoff runs only after a real discard settles — resolveOptionalDiscard-
  // PaymentChoice runs the [discard, ...payoff] program on yes). Checked before the clause splitter (the two sentences
  // would shatter). Mirrors the sac/mana/draw-discard optional-payment folds.
  const odp = matchOptionalDiscardPayment(oracle);
  if (odp && KNOWN.has(odp.atom.op)) {
    return makeProgram({ confidence: "high", atoms: [odp.atom], xSpell: false, unparsedTail: null });
  }
  // DESTROY-TOKEN-RIDER — "Destroy target creature. [It can't be regenerated.] (Its|That creature's) controller
  // creates a N/N <color> <subtype> creature token." (Pongify, Rapid Hybridization). A creature-destroy lead +
  // an intervening can't-be-regenerated sentence + a multi-word-subtype token rider — three shapes the shared
  // RIDER-REMOVAL matcher below can't fold. Emits the SAME { op:"destroy", controllerRider:{kind:"createToken"} }
  // atom that applyRemovalWithRider already resolves end-to-end, so no new resolver. Tried FIRST (its anchor is
  // strictly narrower — a creature lead with the exact token rider — so it can only claim cards the shared
  // matcher misses; anything else falls through to matchRemovalControllerRider unchanged).
  const dtr = parseDestroyTokenRider(oracle);
  if (dtr) return collapsed({ atom: dtr, rest: "" });
  // RIDER-REMOVAL — "Exile/Destroy target X. Its controller <rider>." parses to ONE removal atom carrying
  // a `controllerRider` (resolved to the target's controller). The two sentences span the clause splitter,
  // so it's matched up front like the other collapsed templates.
  const rcr = matchRemovalControllerRider(oracle);
  if (rcr) return collapsed(rcr);
  // DESTROY-DAMAGE-RIDER — "Destroy target X. [If that land was nonbasic, ]<SELF> deals N damage to that X's
  // controller." → ONE destroy atom carrying a `damageRider` (resolved to the target's controller via the shared
  // applyDamageEffect). The two sentences span the clause splitter, so it's matched up front like the controller
  // rider. Tried AFTER matchRemovalControllerRider (disjoint anchors — that one ends "its controller <rider>",
  // this one "<self> deals N damage to that/the <noun> controller"), so neither can claim the other's cards.
  const rdr = matchRemovalDamageRider(oracle);
  if (rdr) return collapsed(rdr);
  // SOFT-COUNTER-RIDER — "Counter target <filter> spell. Its controller <rider>." → ONE counter atom carrying
  // a `controllerRider` (resolved to the countered spell's controller).
  const ccr = matchCounterControllerRider(oracle);
  if (ccr) return collapsed(ccr);
  // CNT-EXILE-INSTEAD — "Counter target <filter> spell. If that spell is countered this way, exile it instead
  // of putting it into its owner's graveyard." → ONE counter atom carrying `exileInstead` (applyCounter exiles
  // the countered spell instead of routing it to the graveyard).
  const cei = matchCounterExileInstead(oracle);
  if (cei) return collapsed(cei);
  // CNT-ZONE-REDIRECT — "Counter target <filter> spell. If that spell is countered this way, put it into its
  // owner's hand|on top of its owner's library instead of into that player's graveyard.[ Draw a card.]" → ONE
  // counter atom carrying `counterDest` (applyCounter routes the countered card to that zone), plus any trailing
  // caster-side clauses (Remand's draw) folded by collapsed(). Remand → hand, Memory Lapse → library top.
  const czr = matchCounterZoneRedirect(oracle);
  if (czr) return collapsed(czr);

  // Modal "Choose one —": each mode is its own sub-program. HIGH iff every mode
  // parses fully (all-or-nothing across modes).
  const modal = parseModal(cardType, oracle, hasX);
  if (modal) {
    if (modal.modes && modal.modes.every(mode => mode.atoms.every(a => KNOWN.has(a.op)) && !fightAtomMisplaced(mode.atoms) && diceRollSequenceOk(mode.atoms) && revealTopSequenceOk(mode.atoms))) {
      const xSpell = modal.modes.some(mode => mode.atoms.some(a => a.amountX || a.countX || a.ptX || a.filter?.mvCapX || a.mvCapX));
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
    if (!atom) {
      // EXILE-IF-DIES rider (subsystem 3) — "If that creature would die this turn, exile it instead."
      // (Lava Coil, Magma Spray, Puncturing Blow): a floating death-replacement scoped to the single
      // creature the spell just damaged. FOLD it onto the immediately-preceding deal-damage-to-target-
      // creature atom as `exileIfWouldDie` (the damage resolver marks the target so the lethal SBA exiles
      // it instead of sending it to the graveyard). Coupled strip+flag — the clause is only absorbed when
      // it directly follows that atom, so a HIGH program never silently drops the exile (CREED). A rider
      // without a preceding creature-damage atom stays unmodeled → the whole spell drops to Arbiter.
      const prev = atoms[atoms.length - 1];
      if (prev && prev.op === "deal-damage"
        && ((EXILE_IF_DIES_RIDER_RE.test(clause) && prev.targetType === "creature")   // single-target "that creature"
          || EXILE_IF_DIES_MASS_RE.test(clause))) {                                    // mass "a creature dealt damage this way"
        prev.exileIfWouldDie = true;
        continue;
      }
      allParsed = false; break;
    }
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
  if (allParsed && atoms.length > 0 && optionalScopeOk && atoms.every(a => KNOWN.has(a.op)) && !fightAtomMisplaced(atoms) && diceRollSequenceOk(atoms) && revealTopSequenceOk(atoms)) {
    // Drop a redundant `shuffle` atom that immediately follows a `tutor` (the tutor
    // already shuffles after its search, CR 701.19e) — some cards template the shuffle as
    // its own sentence, which would otherwise shuffle twice. P3.2 review cleanup.
    const seq = atoms.filter((a, i) => !(a.op === "shuffle" && atoms[i - 1]?.op === "tutor"));
    // `mvCapX` (a search→battlefield tutor whose MV cap IS the spell's X — Wargate, Nature's Rhythm) also makes
    // this an X-spell: the cast path must enumerate affordable X so ctx.xValue reaches applyTutor's cap resolve.
    const xSpell = seq.some(a => a.amountX || a.countX || a.ptX || a.filter?.mvCapX || a.mvCapX);
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
  // Same LOW-until-vetted invariant for a printed alt-cost: a kind whose strip hasn't been corpus-swept
  // FP-clean stays LOW (the sentence was stripped for parsing, so without this gate the body could falsely
  // read HIGH). A kind enters SUPPORTED_ALT_COST_KINDS only once its strip is vetted. The all-or-nothing body
  // parse still bites regardless — Deflecting Swat's free-cost strips but its redirect body is unmodeled → LOW.
  if (program.altCost && !SUPPORTED_ALT_COST_KINDS.has(program.altCost.kind)) return "low";
  if (program.structure === "modal") {
    const modes = program.modal?.modes;
    if (!Array.isArray(modes) || modes.length < 2) return "low";
    return modes.every(mode => Array.isArray(mode.atoms) && mode.atoms.length > 0 && mode.atoms.every(a => KNOWN.has(a.op)) && !fightAtomMisplaced(mode.atoms) && diceRollSequenceOk(mode.atoms) && revealTopSequenceOk(mode.atoms))
      ? "high" : "low";
  }
  if (!Array.isArray(program.atoms) || program.atoms.length === 0) return "low";
  // DISCOVER must be the LAST atom: its cast-free/to-hand decision resolves at the ACTION layer AFTER the
  // effect program finishes, so any atom AFTER a discover would wrongly run before the decision (a reorder).
  // No printed card needs discover-not-last today; this guards the invariant as the vocabulary widens.
  const di = program.atoms.findIndex(a => a.op === "discover");
  if (di !== -1 && di !== program.atoms.length - 1) return "low";
  // FREE-CAST (CR 601.2b) must likewise be the LAST atom: its cast-free/decline decision resolves at the
  // ACTION layer AFTER the program finishes (mirrors discover), so any atom after it would wrongly run
  // before the decision. Every Expertise-cycle card prints it last (lead effect, then the free-cast tail).
  const fi = program.atoms.findIndex(a => a.op === "free-cast");
  if (fi !== -1 && fi !== program.atoms.length - 1) return "low";
  // CASCADE (CR 702.85) must likewise be the LAST atom: its cast-free/decline decision resolves at the ACTION
  // layer AFTER the program finishes (mirrors discover / free-cast), so any atom after it would wrongly run
  // before the decision. The synthesized cascade trigger program is the lone `cascade` atom, so this is a
  // belt-and-braces guard as the vocabulary widens.
  const ci = program.atoms.findIndex(a => a.op === "cascade");
  if (ci !== -1 && ci !== program.atoms.length - 1) return "low";
  if (fightAtomMisplaced(program.atoms)) return "low";
  // SEQUENCE GATES (overhaul hardening): dice-roll and reveal-top payoffs must follow their setup atom.
  // These lived only at the two ASSEMBLY sites, so a program built through collapsed() / the reflexive
  // fold / any future early-return template bypassed them. programConfidence is the single authoritative
  // gate every consumer recomputes — hoisting the invariants here means every path inherits them.
  if (!diceRollSequenceOk(program.atoms) || !revealTopSequenceOk(program.atoms)) return "low";
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
    case "fight-pair":
    case "damage-target-power":
      // FIGHT-PAIR / DAMAGE-TARGET-POWER (the TWO-CHOSEN-TARGET fight) — a SINGLE atom that needs BOTH an
      // "own" creature (the fighter/dealer) AND an "enemy" creature (the target). The intent model is ONE
      // value per atom, which can't express two opposite sides, so report "ambiguous" — that gates the
      // shape OUT of the auto-target paths that assume one side per atom: the trigger flush
      // (programTriggerTargetsResolvable → false → Arbiter) and the loyalty-AI safety check (rejects
      // ambiguous). The shape is handled explicitly on the CAST path (opponentAI two-target chooser) where
      // each role gets its own side; a human picks both interactively. CREED — never a blind mis-target.
      return "ambiguous";
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
    case "cant-block":
      // CANT-BLOCK — "target creature can't block this turn" disables an OPPONENT's blocker so your
      // attacker connects (offensive). The trigger-flush chooser picks an opponent's creature; you'd never
      // disable your own blocker by choice.
      return "enemy";
    case "cant-be-blocked":
      // CANT-BE-BLOCKED — "target creature can't be blocked this turn" makes YOUR attacker unblockable to
      // push damage (own-side), the mirror of cant-block. A trigger-flush chooser picks the controller's
      // own creature; making an opponent's creature unblockable would be self-defeating.
      return "own";
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
    case "source-power-fanout":
      // SOURCE-POWER-FANOUT (Chandra's Ignition) — the CHOSEN target is "creature YOU CONTROL" (the damage
      // source); the harmful fan-out hits OTHER creatures + opponents automatically. So the chosen target is
      // own-side (you point it at your own biggest creature). No fanout card is a trigger today; this future-
      // proofs the trigger-flush chooser to pick the controller's own creature, never an enemy's.
      return "own";
    case "add-counter":
      // COUNTER-TARGET-OWN: "you control" restriction overrides the counterType heuristic so that
      // Baleful Ammit's "-1/-1 on target creature you control" still picks the controller's own creature
      // (not an opponent's, as bare -1/-1 would). The restriction is authoritative; counterType is a
      // fallback for the UNFILTERED "target creature" form only.
      if (atom.targetType === "creatureYouControl") return "own";
      return (typeof atom.counterType === "string" && atom.counterType.trim().startsWith("-")) ? "enemy" : "own";
    case "untap":
    case "return-from-graveyard":
      // The target is a card in the CASTER'S OWN graveyard — always own-side, so a recursion TRIGGER
      // ("When this enters, return target creature card from your graveyard to your hand") routes
      // natively (programTriggerTargetsResolvable → true; the chooser's only candidates are own-gy cards).
      return "own";
    case "reanimate":
      // OWN-graveyard reanimate ("from your graveyard") is own-side, so a reanimation TRIGGER routes
      // natively. But the REANIMATE-FROM-ANY forms ("from a graveyard" / "from an opponent's graveyard")
      // enumerate across other players' graveyards — the one-value-per-atom intent model can't promise the
      // flush chooser a provably-correct side, so report "ambiguous" → such a TRIGGER routes to the Arbiter
      // (a SAFE false-negative). The cast path is unaffected (it enumerates + picks interactively / by AI).
      return (atom.anyGraveyard || atom.opponentGraveyard) ? "ambiguous" : "own";
    case "self-attach":
      // ETB-EQUIP-ATTACH — the Equipment attaches to "target creature YOU CONTROL", so the trigger-flush
      // chooser stays on the controller's own side (the host is always friendly; never an enemy creature).
      return "own";
    case "attach-to-self":
      // EQUIP-AUTO-ATTACH (WAVE 4) — the REVERSE of self-attach: the source is a CREATURE (Captain America)
      // and the chosen target is "target Equipment YOU CONTROL", attached onto the source. Own-side (you
      // attach your own equipment to your own creature), so Cap's combat-begin "Catch" trigger routes
      // natively and the chooser only ever picks the controller's own equipment.
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
      // ETB-BOUNCE / ETB-TUCK — triggered bounce and tuck effects target an OPPONENT's permanent.
      // "YouControl" forms (rare) bounce own permanents (self-protective). Bare "creature" / "artifact" /
      // "land" / "permanent" targets are offensive (Man-o'-War, Aether Adept, Vedalken Dismisser,
      // Dispersal Technician, Glowing Anemone). The trigger-flush chooser picks an opponent's permanent
      // for non-own targets, which is correct for the entire ETB-removal family.
      if (tt.includes("YouControl") || tt.includes("youControl") || tt === "self") return "own";
      return "enemy";
    case "discard":
    case "discard-chosen":
      // "target player/opponent discards" — harmful, enemy-side (Rottenheart Ghoul, Kemuri-Onna).
      // The controller never targets themselves with a discard trigger.
      if (tt === "player" || tt === "opponent") return "enemy";
      return "ambiguous";
    case "gain-life":
      // "target player gains N life" (Titan of Industry's ETB mode, Perrie, various charms) — life gain is
      // purely BENEFICIAL, so the controller always targets THEMSELVES on a trigger flush (targeting an opponent
      // would only help them — never the play). Own-side, mirroring the "target player draws" case below. The
      // applyGainLife who:"target" resolver already gains life for whoever is in ctx.targets, and the flush
      // chooser (chooseTriggerTargets) resolves "own" to the controller — so this routes faithfully, never a
      // wrong target. A non-"player" gain-life target has no card in the corpus → the ambiguous default.
      if (tt === "player") return "own";
      return "ambiguous";
    case "draw":
      // "target player draws N cards" (Saltwater Stalwart: combatDamage → target player draws) —
      // beneficial draw, own-side: the controller always targets themselves to draw.
      if (tt === "player") return "own";
      // DRAW-BY-TARGET-POWER ("draw cards equal to the power of target creature you control" — Soul's
      // Majesty): the chosen CREATURE is the controller's own (the "you control" restriction) and the draw
      // is beneficial, so the target side is unambiguously "own" — mirroring the tap / add-counter "you
      // control" overrides. This future-proofs the trigger-flush chooser (no such card is a trigger today;
      // the cast path picks interactively / the AI aims at its own biggest creature). The BARE "target
      // creature" form (no restriction, none in the corpus) stays "ambiguous" → Arbiter on a trigger, a safe
      // FN: which creature's power you'd want is genuinely board-dependent without the own-side restriction.
      if (tt === "creature" && atom.restrictions?.some(r => r.kind === "controller" && r.who === "you")) return "own";
      return "ambiguous";
    case "regenerate":
      // "Regenerate target creature" (Horizon Seed: cast Spirit/Arcane → regenerate target creature) —
      // protective, own-side: you regenerate your own creatures.
      return "own";
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
  // BLOOD-MONEY — mass-destroy-treasure-per-nontoken is a symmetric board wipe too (it destroys all creatures);
  // include it so the AI HOLDS it like Wrath (the Treasure upside doesn't make a blind self-wipe a good play).
  return atoms.some(a => MASS_WIPE_SCOPES.has(a.targetType) && ["destroy", "exile", "pump", "mass-destroy-treasure-per-nontoken"].includes(a.op));
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
registerClauseParser(selfReturnClauseParser);
// SELF-LTB (Wave 4) — the self-return trigger detector rides the SAME parser.js wiring point as the clause
// parsers (parser.js imports both registerTriggerDetector and detectTriggers), so it's installed before any
// classification can read the WeakMap cache. Detects the Aura self-PiG-return + equipped-creature-dies-return
// CONDITIONS; detectTriggers then rewrites their "return it to its owner's hand" effect to the marker the
// clause parser above models.
registerTriggerDetector(selfReturnTriggerDetector);
// UPKEEP-WIN (Wave 3b) — "you win the game" / "target player loses the game" → the win-game atom.
registerClauseParser(winGameClauseParser);
// DICE-ROLL (CR 726) — "roll a d20" → the roll-d20 atom; "create/draw … equal to the result" → a token/draw
// atom whose count is the diceResult (read off state.diceRoll). Registered as a PAIR: the roll-d20 stamps the
// result, the immediately-following payoff atom reads it. The result-scaled payoff parser needs the
// parseTokenKeywords leaf (the typed-token "with flying" form) — injected here (the registry calls parsers
// with 2 args). Ancient Gold/Silver/Copper Dragon; the reflexive "when you do" dragons (Bronze/Brass) are
// NOT modeled (no reflexive-trigger seam) → they stay body-only (a SAFE false-negative, CREED).
registerClauseParser(rollDieClauseParser);
registerClauseParser((clause, ctx) => resultScaledPayoffClauseParser(clause, ctx, { parseTokenKeywords }));
// COUNTERS-ON-EVENT (Wave 3b) — "put a +1/+1 counter on the triggering creature" → the add-counter atom
// (routed through gameState.addCounter, so the Wave-3 doubler applies). Wired here per the slice contract.
registerClauseParser(counterClausesParser);
// TOKEN-COPY (Wave 5b) — "create a token that's a copy of {this creature | it}" → the create-token-copy
// atom (copySource self/triggering). EXACT anchors only; an unmodeled rider/scope (type-add, target,
// counted/filtered copy) leaves it null → low → Arbiter. count routed through the Wave-3a token doubler.
registerClauseParser(tokenCopyParser);
// EXPLORE (seam batch 1) — migrated verbatim out of parseExtendedAtom into atoms/library.exploreClauseParser.
// Whole-clause-anchored ("this creature explores" / "the triggering creature explores"), so moving it from
// the inline (priority) path to the CLAUSE_PARSERS (post-extended) path is behavior-identical — the explore
// clauses match no other matcher. Acceptance proven by program-fingerprint byte-identical over 34,160 cards.
registerClauseParser(exploreClauseParser);
// PROLIFERATE + GAIN-EXPERIENCE (seam batch 3) — migrated verbatim out of parseExtendedAtom into
// atoms/counters (co-located with applyProliferate / applyGainExperience). Whole-clause-anchored, so the
// inline→CLAUSE_PARSERS move is behavior-identical (proven byte-identical by program-fingerprint).
registerClauseParser(proliferateClauseParser);
registerClauseParser(gainExperienceClauseParser);
// RAD player-grant (seam batch 13 / Wave C) — each/you/target "gets N rad counters" migrated to
// atoms/counters.radClauseParser. The clauses match no earlier registered parser and (verified) no later
// parseExtendedAtom branch — the cdmg rad variants require "they"/"that player", a disjoint anchor — so the
// inline→CLAUSE_PARSERS move is behavior-identical. program-diff = 0 (gate-verified).
registerClauseParser(radClauseParser);
// CDMG-PLAYER-PAYOFF + COUNTERS-PLACED + DIES-RAD (seam batch S2 — the FINAL parseExtendedAtom drain) — the
// 5 sentinel matchers (combat-damage "draw that many cards", the counters-placed draw/life sentinels, the
// damaged-player rad pair, Feral Ghoul dies-rad) migrated as ONE unit to atoms/counters.cdmgPayoffClauseParser
// (they shared no local state). Anchors are disjoint from every other registered parser (radClauseParser is
// each/you/target-lead vs they/that-player here; the misc.js draw parsers anchor numeric/for-each forms only)
// → position-independent, program-fingerprint-verified byte-identical. parseExtendedAtom itself is DELETED.
registerClauseParser(cdmgPayoffClauseParser);
// EARTHBEND (seam batch 5) — migrated to atoms/combat.earthbendClauseParser (whole-clause-anchored; uses the
// SMALL_NUM + parseCountSource parseHelpers leaf). program-fingerprint byte-identical.
registerClauseParser(earthbendClauseParser);
// LIBRARY KEYWORDS (seam batch 6 / Wave A1) — discover/shuffle/scry/surveil migrated to
// atoms/library.libraryKeywordClauseParser (all whole-clause-anchored, mutually exclusive). program-diff = 0.
registerClauseParser(libraryKeywordClauseParser);
registerClauseParser(cascadeClauseParser); // CASCADE (CR 702.85) — the synthesized "cascade through your library" keyword sentinel
// COMBAT KEYWORDS (seam batch 7 / Wave A2) — tap/untap/cant-block/regenerate migrated to
// atoms/combat.combatKeywordClauseParser (all whole-clause-anchored). program-diff = 0.
registerClauseParser(combatKeywordClauseParser);
// PUMP (seam batch 12c / Wave B1b) — the most fragmented op (14 returns, 7 interleaved clusters) migrated to
// atoms/combat.pumpClauseParser; branch order preserved. program-diff = 0 (gate-verified).
registerClauseParser(pumpClauseParser);
// COND-X TEAM PUMP (Finale of Devastation) — "If X is N or more, creatures you control get +X/+X and gain KW
// until end of turn". Registered AFTER pumpClauseParser: the "if x is …" prefix matches no earlier parser
// (disjoint anchor), and the gated pump emits { op:"pump", condX:{min} } which applyPumpEffect no-ops below X.
registerClauseParser(condPumpXClauseParser);
registerClauseParser(groupGrantClauseParser); // GROUP-KEYWORD-GRANT — "(creatures|permanents) you control gain KW until end of turn"
registerClauseParser(setBasePtTeamClauseParser); // SET-BASE-PT-TEAM (Biomass Mutation) — "creatures you control have base power and toughness X/X until end of turn"
// ANIMATE (seam batch 14 / Wave C) — WALT-ANIMATE (target land) + man-land self-animate migrated to
// atoms/combat.animateClauseParser (2 adjacent blocks, order preserved; inline COLOR helpers travel; uses the
// parseGrantedKeywords leaf). The "land becomes a N/N … creature" clauses match no earlier registered parser
// and (verified) no later parseExtendedAtom branch → the inline→CLAUSE_PARSERS move is behavior-identical.
registerClauseParser(animateClauseParser);
// FIGHT FAMILY (seam batch S1) — the ETB-fight / fight-another / fight-pair / damage-target-power /
// source-power-fanout inline dispatch blocks migrated to atoms/combat.fightClauseParser (first-match order
// preserved). The "fights" / "deals damage equal to its power to" anchors match no earlier registered parser
// and no parseExtendedAtom residue → the inline(pre-ext)→CLAUSE_PARSERS(post-ext) move is behavior-identical
// (program-fingerprint-verified). program-diff = 0.
registerClauseParser(fightClauseParser);
// DMG-SCALE (seam batch 15 / Wave C) — the count-scaled deal-damage form migrated to
// atoms/stack.dealDamageScaledClauseParser (parseCountSource leaf). It anchors on "… deals damage to … equal
// to the number of …", which no earlier registered parser matches and (verified) no later parseExtendedAtom
// branch matches before the legacyToAtom tail → the inline→CLAUSE_PARSERS move is behavior-identical.
registerClauseParser(dealDamageScaledClauseParser);
registerClauseParser(massFilteredDamageClauseParser); // MASS-FILTERED-DAMAGE — "deals N damage to each creature with/without flying"
registerClauseParser(cdmgMassToDamagedPlayerClauseParser); // CDMG-MASS-TO-DAMAGED-PLAYER (Balefire Dragon) — combat-damage trigger: "deals that much damage to each creature that player controls"
registerClauseParser(copySpellClauseParser); // STORM (CR 702.40) — the synthesized "copy this spell for each spell cast before it this turn" clause
registerClauseParser(copyCreatureSpellClauseParser); // COPY-A-CREATURE-SPELL (Double Major, CR 707.10) — "copy target creature spell you control[, except it isn't legendary…]"
// GRAVEYARD-RETURN (seam batch 16 / Wave C) — return-from-graveyard ⇄ reanimate co-extracted to
// atoms/zones.graveyardReturnClauseParser (one parser, original first-match order: to-hand then to-battlefield).
// The "return target … from your graveyard …" clauses match no earlier registered parser and (verified) no
// later parseExtendedAtom branch → the inline→CLAUSE_PARSERS move is behavior-identical.
registerClauseParser(graveyardReturnClauseParser);
// BOUNCE (seam batch 24 / Wave C) — all 4 bounce matchers (target creature + β-3 non-creature permanent +
// self + triggering) co-extracted to atoms/zones.bounceClauseParser, original first-match order. NOT in the
// rider-folding dispatch (exile/destroy-only), so unlike destroy⇄exile this lifts byte-identical.
registerClauseParser(bounceClauseParser);
// ADD-COUNTER (seam batch 25 / Wave C) — the 5 ±1/+1-counter matchers (target / target-you-control / self /
// up-to-one-target / each-creature-you-control) co-extracted to atoms/counters.addCounterClauseParser, original
// first-match order; SMALL_NUM leaf. Distinct anchors from the WAVE-3b triggering-counter parser + the
// resolution-time doubler → no overlap; the clauses match no other registered parser → behavior-identical.
registerClauseParser(addCounterClauseParser);
// ADD-NAMED-COUNTER-SELF (CHOSEN-TYPE) — "put a <name> counter on this artifact/permanent" (Door of Destinies'
// cast trigger). A NAMED (non-±1/+1) counter on the SOURCE permanent of any type, resolved via ctx.sourceId.
// Anchored end-to-end; distinct subject ("this artifact/permanent" vs addCounter's "this creature") → no overlap.
registerClauseParser(addNamedCounterSelfClauseParser);
// SHIELD-COUNTER (CR 122.1c) — "put a shield counter on a creature you control" (Titan of Industry's ETB mode)
// / "put a shield counter on target creature" (Boon of Safety, Perrie). A REAL protective counter: the
// destruction sites (destroyLethalCreatures SBA + applyDestroyEffect) and damage sites (applyDamageEffect +
// combatResolution) consume it via the CR 122.1c replacement/prevention. Whole-clause anchored (multi-count /
// permanent-typed / opponent-targeted forms stay on the Arbiter). Distinct subject → no overlap with add-counter.
registerClauseParser(shieldCounterClauseParser);
// DESTROY ⇄ EXILE (seam batch 27 / Wave C, RIDER-FOLDING) — the 5 destroy/exile matchers (exile-creature +
// shared (destroy|exile) target <typelist> + MASS wipes) co-extracted to atoms/removal.destroyExileClauseParser.
// The rider-folding dispatch (matchRemovalControllerRider) now resolves its lead via parseExtendedAtom() ||
// destroyExileClauseParser, so the controllerRider cards keep folding. The bare clauses match no other registered
// parser → behavior-identical (this is the entanglement that reverted as batch-bare; the dispatch rewire fixes it).
registerClauseParser(destroyExileClauseParser);
// COUNTER (seam batch 28 / Wave C, RIDER-FOLDING) — the counter-target-spell family co-extracted to
// atoms/stack.counterClauseParser (hard counters + CNT-MV-EXACT + soft unlessPay/unlessPayX). matchCounter-
// ControllerRider + matchCounterExileInstead resolve their hard-counter lead via parseExtendedAtom() ||
// counterClauseParser. Distinct from the WAVE-3b counterClausesParser (+1/+1 on the triggering creature); the
// "counter target … spell" clauses match no other registered parser → behavior-identical (gate-verified).
registerClauseParser(counterClauseParser);
// DRAW (for-each / count-scaled) (seam batch 26 / Wave C) — the controller-DRAW count-scaled cluster
// (greatest-among / for-each / equal-to-number) migrated to atoms/misc.drawForEachClauseParser; parseCountSource
// leaf. Clean now the life for-each siblings migrated. The clauses match no other registered parser and
// (verified) no later parseExtendedAtom branch → behavior-identical.
registerClauseParser(drawForEachClauseParser);
// SELF-CAST HALF-X (CR 107.3) — the "gain half X life" / "draw half X cards rounded down/up" halves of a "When
// you cast this spell" trigger on an {X}-cost spell (Hydroid Krasis). Gated on ctx.hasX + the rounding suffix the
// splitClauses fold attaches; amountX + halve → the existing effectiveAmount resolution. Disjoint from the bare
// "draw X cards" (no "half"/"rounded") and the rad half-X (different op) → behavior-identical for every other card.
registerClauseParser(selfCastHalfXClauseParser);
// LIFE (seam batch 17 / Wave C) — gain-life ⇄ lose-life co-extracted to atoms/life.lifeClauseParser (scaled
// for-each cluster + fixed-N cluster, one parser, original first-match order; parseCountSource leaf). The
// draw for-each branches stay inline above (disjoint "draw …" anchor). The life clauses match no earlier
// registered parser and (verified) no later parseExtendedAtom branch → inline→CLAUSE_PARSERS is behavior-identical.
registerClauseParser(lifeClauseParser);
// CREATE-NAMED-TOKEN (seam batch 18 / Wave C) — the Treasure/Clue/Food/Gold token family migrated to
// atoms/tokens.createNamedTokenClauseParser (6 matchers, original first-match order; parseCountSource+SMALL_NUM+
// NUM_WORD leaf). The "create … treasure|clue|food|gold token(s)" / "investigate" clauses match no earlier
// registered parser and (verified) no later parseExtendedAtom branch (create-token's anchor is disjoint) → the
// inline→CLAUSE_PARSERS move is behavior-identical.
registerClauseParser(createNamedTokenClauseParser);
// CREATE-TOKEN (seam batch 20 / Wave C) — vanilla typed creature tokens migrated to
// atoms/tokens.createTokenClauseParser (for-each + fixed-N, order preserved; toughness<1 + land guards +
// quote-vs-keyword "with" split travel; leaf helpers incl. parseTokenManaAbility/parseTokenKeywords). The
// "create N P/T … creature token" clauses match no earlier registered parser and (verified) no later
// parseExtendedAtom branch → the inline→CLAUSE_PARSERS move is behavior-identical.
registerClauseParser(createTokenClauseParser);
// SACRIFICE-EDICTS (seam batch 21 / Wave C) — the contiguous edict block migrated to
// atoms/removal.sacrificeEdictClauseParser (target / each-player / each-opponent "sacrifices a creature",
// original order). These were the LAST matchers in parseExtendedAtom, so nothing ran after them; the clauses
// match no earlier registered parser → the inline→CLAUSE_PARSERS move is behavior-identical.
registerClauseParser(sacrificeEdictClauseParser);
// SAC-LAND-RAMP (Toph TIER-2) — "Sacrifice a land." as a resolution EFFECT (the controller self-sacs one of
// their lands of their choice), the lead clause of the sac-then-fetch ramp spells (Roiling Regrowth, Cycle of
// Renewal). Resolver in atoms/sacLand.applySacrificeLand (reuses the sacrifice-choice pause/resume + the
// permanent-safe sacrificeCreatureEffect); the FETCH half is the already-proven RAMP-MULTI tutor. EXACT anchor
// (bare "sacrifice a land [you control]") — a count/filter/each-player land-sac stays LOW → Arbiter (CREED).
registerClauseParser(sacrificeLandClauseParser);
// DRAW (each-player slice) + DISCARD family (seam batch 23 / Wave C) — co-extracted coupling: the each-player/
// target draw forms → atoms/misc.drawEachPlayerClauseParser, the who-scoped discard family → atoms/hand.discardClauseParser
// (separate resolver homes, two sibling parsers). NUM_WORD leaf. The clauses match no earlier registered parser and
// (verified) no later parseExtendedAtom branch → the inline→CLAUSE_PARSERS move is behavior-identical.
registerClauseParser(drawEachPlayerClauseParser);
registerClauseParser(discardClauseParser);
// MISC (seam batch 8 / Wave A3) — fog + divide-damage migrated to atoms/misc.miscClauseParser
// (whole-clause-anchored; divide-damage was already the last inline branch = lowest priority, so the
// CLAUSE_PARSERS position preserves order). program-diff = 0.
registerClauseParser(miscClauseParser);
registerClauseParser(distributeCountersClauseParser);
// EQUIP-ATTACH (seam batch 9 / Wave A4) — self-attach + attach-to-self migrated to atoms/stack.attachClauseParser
// (whole-clause-anchored; attach-to-self returns null when its self-destination guard declines, preserving the
// inline fall-through). program-diff = 0.
registerClauseParser(attachClauseParser);
// TUCK (seam batch 10 / Wave A5) — migrated to atoms/zones.tuckClauseParser (whole-clause-anchored). program-diff = 0.
registerClauseParser(tuckClauseParser);
// MILL (seam batch 11 / Wave A6) — migrated to atoms/library.millClauseParser (3 mutually-exclusive
// who-scoped branches; NUM_WORD leaf). program-diff = 0.
registerClauseParser(millClauseParser);
// TUTOR (seam batch 12e / Wave B2b) — migrated to atoms/library.tutorClauseParser (6 contiguous ordered
// blocks tm/ttm/bfm/mf/spm/lfh; FIRST-MATCH ORDER preserved inside the parser; tutor helpers in the
// parseHelpers leaf). All anchored "search your library…"/"put a land card from your hand…" clauses match no
// earlier registered parser, so the inline→CLAUSE_PARSERS move is behavior-identical. program-diff = 0.
registerClauseParser(tutorClauseParser);
// PUT-FROM-HAND ("put a/up to N/any number of creature|permanent card(s) from your hand onto the battlefield")
// — registered AFTER the tutor parser so the land-from-hand `lfh` form keeps priority (the two are mutually
// exclusive: this parser rejects a LAND filter). Reuses the tutor sourceZone:"hand"→battlefield seam, so the
// emitted op:"tutor" atoms resolve through the SAME applyTutor/resolveTutorChoice path already proven by
// land-from-hand (hand→battlefield move, ETB fires, no mana/stack). Dramatic Entrance / Last March of the Ents
// flip native-spell; the activated/triggered forms (Elvish Piper, Quicksilver Amulet, Root Elemental) flip via
// their respective tiers once the put clause is modeled. program-diff audited (additive — only the previously-
// unmodeled put-from-hand creature/permanent clauses flip; land-from-hand + library tutors unchanged).
registerClauseParser(putFromHandClauseParser);
// FREE-CAST (CR 601.2b) — "you may cast a[n] [instant or sorcery] spell with mana value N or less from your
// hand without paying its mana cost" → the free-cast atom (park eligible hand cards for the action-layer
// cast-free/decline decision, mirroring discover). Fixed-MV-cap forms only; a variable/relational cap or a
// multi-cast "any number of spells" stays low → Arbiter. Whole-clause anchored — matches no earlier parser.
registerClauseParser(freeCastClauseParser);

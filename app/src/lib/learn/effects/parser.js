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
import { isNonChosenTargetType } from "../targetTypes.js"; // MASS_WIPE_SCOPES (the centralized wipe partition) now consumed by ./programQueries.js (slice 3), not here
import { ATOM_RESOLVERS, PAUSING_ATOM_OPS } from "./effectAtoms.js"; // PAUSING_ATOM_OPS (WI-3) — ops whose resolver can set pendingChoice; gates optional-payment payoffs
import { typeOf, isInstantOrSorcery, oracleOf, hasXCost, stripReminder, stripRegenerationRider, stripUncounterableRider, stripNoMaxHandSizeRider, stripCastKeywordLines, rewriteAmountX, CANT_REGEN_TEST } from "./textNormalize.js"; // oracle-text normalization + card-field leaf (parser decomposition slice 1) — pure String|card→String|bool, no cycle
import { splitClauses } from "./splitClauses.js"; // oracle → clause[] sentence splitter (parser decomposition slice 2) — leaf; sole caller is parser.js
import { programNeedsChosenTarget } from "./programQueries.js"; // program-shape query leaf (slice 3) — imported for the assembly-time call sites; the full family is re-exported at the bottom of this file
import { matchImprint, matchHandDisruption, matchRemovalControllerRider, matchRemovalCasterGainLife, matchRemovalDamageRider, matchCounterControllerRider, matchCounterExileInstead, matchCounterZoneRedirect, matchImpulseDig, matchReorderTop, matchDigLandToBattlefield, matchLookTopTake, matchChooseTypeDraw, matchChosenTypeRevealToHand, matchDelayedTrigger } from "./spanMatchers.js"; // up-front multi-sentence span matchers (slice 4) — definitions only; the dispatch ORDER stays in parseEffectClauseImpl below (parseControllerRider now consumed by templateMatchers.js directly)
import { extractAdditionalCosts, extractAltCost, stripSelfCostReduction, stripStormKeywordLine, stripDevoidLine, stripSelfShuffleIntoLibrary, stripSelfExileSentence, stripReboundLine, SUPPORTED_ADDITIONAL_COST_KINDS, SUPPORTED_ALT_COST_KINDS } from "./castModifiers.js"; // cast-cost extraction + disposition strips (slice 5) — zero-import leaf; the SUPPORTED_* kind sets feed programConfidence's LOW-until-vetted cost gates
import { matchDiesGainDrawByPower, matchDrainEachOpponentX, matchIteratedEdict, matchRevealTopDrainByMv, matchReanimateDrain, matchDrainByCount, matchFinaleOfRevelation, matchGenesisWave, matchRevealThatManyPutFiltered, matchAnimistAwakening, matchOpenTheWay, matchExileXControllerRider, matchRevealTopConditional, matchImpulseExilePlay, matchMassDestroyTreasurePerNontoken, matchWindfallMaxDiscard, parseFixedManaPips, matchUpkeepSacUnlessPay, matchCumulativeUpkeep, matchEcho, matchDiscardHandDrawSame, matchTaxedDraw, matchTaxedTreasure, matchPumpThenFight, matchUntapThenPump, matchTwoTargetPump, matchDamagePowerTrampleExcess, matchCounterIfLegendaryThenFight, matchDrawOrCounterTriggering, matchRadOrProliferate, matchTimetwisterWheel, matchRadTargetOrTreasure, matchFreeCastOrLand, matchGyOwnerDrain, matchDoubleOrResetCounters, matchMetalcraftDamage, matchInsteadAmountUpgrade, matchSelfHitDamage, matchCounterThenGrant } from "./templateMatchers.js"; // collapsed-template whole-oracle matchers (slice 6) — definitions only; the dispatch ORDER stays in parseEffectClauseImpl below
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
import { createNamedTokenClauseParser, createTokenClauseParser, mobilizeClauseParser, mobilizeSacClauseParser } from "./atoms/tokens.js";
import { monarchClauseParser } from "./atoms/monarch.js"; // MONARCH (CR 725)
import { sacrificeEdictClauseParser, destroyExileClauseParser, ordealThresholdSacClauseParser } from "./atoms/removal.js"; // seam batch 21 (sacrifice edicts) + 27 (destroy⇄exile, rider-folding) + OC-1 (Ordeal threshold-sac sentinel)
import { sacrificeLandClauseParser } from "./atoms/sacLand.js"; // SAC-LAND-RAMP — "Sacrifice a land." controller self-sac (Roiling Regrowth / Cycle of Renewal)
import { parseDestroyTokenRider } from "./atoms/destroyTokenRider.js"; // DESTROY-TOKEN-RIDER — Pongify / Rapid Hybridization (destroy creature + can't-regen + that controller makes a token)
import { exploreClauseParser, libraryKeywordClauseParser, millClauseParser, tutorClauseParser, cascadeClauseParser } from "./atoms/library.js"; // seam batch 1 (explore) + 6 (discover/shuffle/scry/surveil) + 11 (mill) + 12e (tutor) + CASCADE (CR 702.85, synthesized keyword sentinel)
import { putFromHandClauseParser } from "./atoms/putFromHand.js"; // PUT-FROM-HAND — "put a/N/any number of creature|permanent card(s) from your hand onto the battlefield" (reuses the tutor sourceZone:"hand"→battlefield seam)
import { parseTokenKeywords, SMALL_NUM } from "./parseHelpers.js"; // seam batch 2/4/19: shared parse helpers in a leaf (matchers import cycle-free); parseTutorFilter (rd block) + parseTokenKeywords (token-keyword matcher); parseGrantedKeywords (COUNTER-THEN-GRANT); SMALL_NUM for MULTI-COUNT damage count words; parseCountSource for FE-1 DRAIN-BY-COUNT fused matcher
import { proliferateClauseParser, gainExperienceClauseParser, gainEnergyClauseParser, radClauseParser, cdmgPayoffClauseParser, addCounterClauseParser, addNamedCounterSelfClauseParser, removeNamedCounterSelfClauseParser, shieldCounterClauseParser, evolveCounterSelfClauseParser, renownClauseParser, endureClauseParser, transferCountersClauseParser } from "./atoms/counters.js"; // seam batch 3 (proliferate/gain-experience) + 13 (rad) + 25 (add-counter ±1/+1) + CHOSEN-TYPE (named counter on self artifact) + ARIXMETHES (remove named counter from self) + SHIELD-COUNTER (CR 122.1c protective counter) + KW-EVOLVE sentinel (SHELF S7)
import { earthbendClauseParser, combatKeywordClauseParser, massBlockLockClauseParser, pumpClauseParser, condPumpXClauseParser, animateClauseParser, groupGrantClauseParser, setBasePtTeamClauseParser, setBasePtTargetClauseParser, fightClauseParser } from "./atoms/combat.js"; // seam batch 5 (earthbend) + 7 (tap/untap/cant-block/regenerate) + FT-1 (mass-block-lock) + 12c (pump) + COND-X TEAM PUMP (Finale of Devastation) + 14 (animate) + GROUP-KEYWORD-GRANT + SET-BASE-PT-TEAM (Biomass Mutation) + SET-BASE-PT-TARGET (SU-1 — Diminish/Square Up)
import { miscClauseParser, drawEachPlayerClauseParser, drawForEachClauseParser, selfCastHalfXClauseParser } from "./atoms/misc.js"; // seam batch 8 (fog/divide-damage) + 23 (draw each-player slice) + 26 (draw for-each/count-scaled) + SELF-CAST half-X gain/draw (Hydroid Krasis)
import { distributeCountersClauseParser } from "./atoms/distributeCounters.js"; // distribute-counters (The Earth Crystal) — mirrors divide-bounded
import { discardClauseParser } from "./atoms/hand.js"; // seam batch 23 (discard family)
import { conniveClauseParser } from "./atoms/connive.js"; // CONNIVE (BLITZ EK-1, CR 701.50a) — draw 1 → chosen discard → +1/+1 if nonland
import { suspectClauseParser } from "./atoms/suspect.js"; // SUSPECT (BLITZ EK-1, CR 701.60) — the suspected designation (menace + can't block)
import { attachClauseParser, dealDamageScaledClauseParser, counterClauseParser, massFilteredDamageClauseParser, cdmgMassToDamagedPlayerClauseParser, copySpellClauseParser, copyCreatureSpellClauseParser } from "./atoms/stack.js"; // seam batch 9 (self-attach/attach-to-self) + 15 (deal-damage scaled board-count) + 28 (counter, rider-folding) + MASS-FILTERED-DAMAGE + CDMG-MASS-TO-DAMAGED-PLAYER (Balefire) + STORM (copy-spell) + COPY-A-CREATURE-SPELL (Double Major)
import { tuckClauseParser, graveyardReturnClauseParser, bounceClauseParser, earthbendReturnClauseParser, detainReturnClauseParser } from "./atoms/zones.js"; // seam batch 10 (tuck) + 16 (return-from-graveyard ⇄ reanimate) + 24 (bounce) + EARTHBEND-RETURN (CR 603.7 delayed trigger) + DETAIN-RETURN (DT-1)
import { lifeClauseParser } from "./atoms/life.js"; // seam batch 17 (gain-life ⇄ lose-life, scaled + fixed-N)
import { gainControlClauseParser } from "./atoms/control.js"; // GAIN-CONTROL — indefinite control-change of a target creature/subtype (Sliver Overlord)
import { grantUntilEotClauseParser } from "./atoms/grantUntilEot.js"; // UNTIL-EOT QUOTED GRANT (TG-1) — Feign Death / Showstopper family
import { becomeCopyClauseParser } from "./atoms/becomeCopy.js";
import { staticAbilitiesCoverCard, parseStaticAbilities } from "../staticAbilityParser.js";
import { detectTriggers, registerTriggerDetector } from "../triggers.js";
import { parseKickerCost } from "../kicker.js"; // KICKED-SPELL-EFFECT — a clean single-mana Kicker cost (no multikicker / and-or / {X}); kicker.js → parseHelpers.js → keywords.js is acyclic (parser already imports parseHelpers)
import { spellConditionParseable, activationConditionParseable, evaluateInterveningIf } from "../interveningIf.js"; // CONDITIONAL SPELL RIDER (BLITZ CD-1) — the spell-side shape gate (a board condition a resolving spell can read); interveningIf → gameState is a leaf edge, no cycle (parser is not imported by either)

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
// `create-token` honors it too (SHELF M1b — Screeching Scorchbeast's "create that many … tokens. Do this
// only once each turn."; the latch lives in applyCreateToken, same per-source gate key).
// Every op here MUST have a resolver that reads `atom.oncePerTurn` and both CHECKS and SETS the shared
// `${sourceId}_${op}` latch. Admitting an op whose resolver ignores the flag re-fires it every turn while the
// card claims native — the forbidden FP this gate exists to prevent. Latch first, admit second.
// (`add-counter` joined for Leonardo, the Balance; the prose below saying "today just discover" was already
// stale when this set held four ops — the SET is the source of truth, not the sentence.)
const ONCE_PER_TURN_HONORED = new Set(["discover", "draw", "gain-life", "create-token", "add-counter"]);

// A one-seat empty board — enough for evaluateInterveningIf to ANSWER a condition or admit it cannot.
// Used only by conditionIsDecidable, never for a real verdict. (Same probe trick manaModel uses for
// condition-gated mana; both exist so an UNDECIDABLE condition parks the card at PARSE time rather than
// producing a program that would reject at resolution — the metric and the runtime must agree.)
const _CONDITION_PROBE_STATE = { players: { probe: { battlefield: [], graveyard: [], hand: [], library: [], life: 40 } } };
function conditionIsDecidable(condition) {
  try {
    return typeof evaluateInterveningIf(_CONDITION_PROBE_STATE, condition, "probe", { sourcePermanentId: "probe-src" }) === "boolean";
  } catch {
    return false;
  }
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

function makeProgram({ confidence, structure = "sequence", atoms = [], modal = null, xSpell = false, unparsedTail = null, selfExile = false, selfShuffle = false }) {
  // `selfExile` (Finale of Revelation "Exile <this>.") — the resolved spell exiles ITSELF instead of going to
  // the graveyard (runEffectProgram honors it at GY-1). `selfShuffle` (Green Sun's Zenith / the Sun's Zenith +
  // Beacon family "Shuffle <this> into its owner's library.") — the resolved spell shuffles ITSELF into its
  // owner's library instead of the graveyard (also honored at GY-1). Both are omitted from the object when false
  // so the vast majority of programs are byte-identical to before (no shape churn).
  return { version: 1, source: "parser", confidence, structure, atoms, modal, xSpell, unparsedTail: unparsedTail ?? null, ...(selfExile ? { selfExile: true } : {}), ...(selfShuffle ? { selfShuffle: true } : {}) };
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
    // Both stamp state.revealedCardMV: reveal-top-to-hand (Yuriko/Dark Confidant) and reanimate+stampMv
    // (Reanimate — the reanimated card's MV). A following lose-life reads it via amountCount revealedCardMV.
    if (a?.op === "reveal-top-to-hand" || (a?.op === "reanimate" && a?.stampMv)) { revealed = true; continue; }
    if (usesRevealedCardMV(a) && !revealed) return false; // a revealedCardMV payoff with no preceding stamp → drop
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
/**
 * WHICH CONDITION PROBE APPLIES — the metric⇄runtime shared gate for an atom-level `condition`, split by the
 * context the CALLER can honestly supply at resolution:
 *
 *   • a resolving SPELL has no object thread at all        → spellConditionParseable
 *   • a PERMANENT'S ABILITY has its SOURCE permanent       → activationConditionParseable (source-only probe)
 *
 * `sourceScoped` is set by buildTriggerStack, the one caller that resolves a clause with a source permanent
 * in context. Verified before wiring, not assumed: triggers.js threads `sourcePermanentId` into the trigger
 * context and runProgram passes that same context to evaluateInterveningIf, so a condition admitted here is
 * one the runtime can actually answer — never a claimed-but-unfirable rider.
 *
 * ⭐ THE SOURCE-ONLY PROBE IS DELIBERATE, not laziness. A trigger's context also carries per-event fields
 * (triggering permanent, defender, damage snapshots) which VARY BY EVENT, so probing with all of them would
 * admit conditions that a different event's trigger cannot answer. `sourcePermanentId` is the one field
 * EVERY trigger carries, so it is the honest floor. Anything needing more still parks (a safe FN).
 *
 * Unset (the default) reproduces the previous behaviour exactly, so every spell path is byte-identical.
 */
function conditionReadableHere(condition, sourceScoped) {
  return spellConditionParseable(condition) || (!!sourceScoped && activationConditionParseable(condition));
}

function parseClauseToAtom(cardType, clause, hasX = false, sourceScoped = false) {
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
    const inner = parseClauseToAtom(cardType, mayMatch[1], hasX, sourceScoped);
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

  // ===== CONDITIONAL SPELL RIDER (BLITZ CD-1, CR 608.2) ===== a leading "If <board-condition>, <effect>"
  // clause ("If you control a Wizard, draw a card") — the resolving spell applies <effect> ONLY when the board
  // condition holds AS the instruction resolves (CR 608.2, checked in written order). The condition must be one
  // a spell can read with only its own context (spellConditionParseable — the board/player/turn readers, NO
  // per-object referent), which is the metric⇄runtime shared gate: attach `condition` here ONLY when the
  // resolver (runProgram → evaluateInterveningIf) can evaluate it, so "native" is never claimed for a rider
  // that would silently never fire. SCOPE (this slice): a SINGLE, NON-optional, NON-targeting gated atom. A
  // multi-instruction gated effect (any top-level " and "/", then ") → null → the whole card parks (→ low →
  // Arbiter, CREED — never a partial that drops one instruction's condition); a targeted or optional gated
  // effect likewise parks (a fast-follow). splitClauses keeps the leading-if sentence WHOLE, so the effect
  // text reaching here is complete. The TRAILING form ("<effect> if <cond>") is deferred to a later slice.
  {
    // The optional leading "then" is the SEQUENCED form: "A. THEN IF <cond>, B." (Level Up's granted body,
    // and 118 corpus cards carry the shape). splitClauses already hands the second sentence over intact as
    // "then if <cond>, <effect>", so the ONLY thing that was missing is peeling the connective — "then if X,
    // Y" and "if X, Y" mean the same thing here, since CR 608.2 checks the condition in written order either
    // way and the preceding instruction has already resolved by then. No new condition machinery.
    const cond = s.match(/^(?:then )?if (.+?), (.+)$/i);
    if (cond && conditionReadableHere(cond[1], sourceScoped)) {
      // Once the condition is spell-readable (and splitClauses kept the sentence whole for exactly this), the
      // clause is COMMITTED to the conditional model — every failure below returns null (the card parks → low
      // → Arbiter), NEVER falls through to the legacy parse, which could match the gated verb and SILENTLY DROP
      // the condition (a forbidden FP). A multi-instruction gated effect (top-level " and "/", then ") parks.
      const gated = cond[2];
      if (/\s+\band\b\s+|,\s+then\s+/i.test(gated)) return null; // multi-atom gated rider → park (this slice)
      const inner = parseClauseToAtom(cardType, gated, hasX, sourceScoped);
      if (inner
        && KNOWN.has(inner.op)
        && !inner.condition                 // no nested conditional (defensive — the effect can't re-lead with "if …,")
        && !inner.optional                  // park an optional-gated rider (a fast-follow) — never double-gate here
        && (!inner.targetType || isNonChosenTargetType(inner.targetType))) { // non-targeting gated atom only (this slice)
        return { ...inner, condition: cond[1].toLowerCase() };
      }
      return null; // gated effect isn't a clean single non-targeting atom → park (CREED)
    }
  }

  // ===== CONDITIONAL SPELL RIDER — TRAILING form (BLITZ CD-2, CR 608.2) ===== the mirror of the leading peel
  // above: a "<effect> if <board-condition>" clause (Inga Rune-Eyes's "…draw three cards if three or more
  // creatures died this turn", an activated "{2}: Draw a card if you have no cards in hand" — Idle Thoughts)
  // — the resolving spell/ability applies <effect> ONLY when the board condition holds AS the instruction
  // resolves (CR 608.2, in written order). SAME metric⇄runtime shared gate: attach `condition` ONLY when
  // spellConditionParseable (the board/player/turn readers, NO per-object referent), so the resolver
  // (runProgram → evaluateInterveningIf, unchanged) can evaluate it — never a rider credited native that
  // would silently never fire. SCOPE (this slice): a SINGLE, NON-optional, NON-targeting gated atom whose
  // LEFT side carries NO top-level " and "/", then " (a compound left side — "<A> and <B> if <cond>" — is
  // scope-AMBIGUOUS: does the if gate B only or A+B? → PARK, never guess). Once the trailing condition is
  // spell-readable the clause is COMMITTED to the conditional model — every failure below returns null (the
  // card parks → low → Arbiter, CREED), NEVER falls through to a legacy loose-match that could SILENTLY DROP
  // the trailing condition (a forbidden FP). splitClauses keeps a trailing-if sentence WHOLE so the compound
  // reaches here intact. Runs AFTER the leading peel (a clause starting "if …," never has an internal " if ",
  // so the two never contend); the leading "you may" wrapper is peeled before this, so an optional trailing
  // rider recurses through here as its bare inner atom. A back-reference gated effect ("it/that creature/that
  // player …"), an "instead" replacement, or an ability-word-prefixed effect ("Ferocious — …") fails the
  // clean-atom parse below → parks (never a mis-scoped native).
  {
    const cond = s.match(/^(.+?) if (.+)$/i);
    if (cond && conditionReadableHere(cond[2], sourceScoped)) {
      const gated = cond[1];
      if (/\s+\band\b\s+|,\s+then\s+/i.test(gated)) return null; // compound / scope-ambiguous left side → park (this slice)
      const inner = parseClauseToAtom(cardType, gated, hasX, sourceScoped);
      if (inner
        && KNOWN.has(inner.op)
        && !inner.condition                 // no nested conditional (the effect can't itself re-carry a condition)
        && !inner.optional                  // park an optional-gated rider (a fast-follow) — never double-gate here
        && (!inner.targetType || isNonChosenTargetType(inner.targetType))) { // non-targeting gated atom only (this slice)
        return { ...inner, condition: cond[2].toLowerCase() };
      }
      return null; // gated effect isn't a clean single non-targeting atom → park (CREED)
    }
  }

  // ===== TOKENS ===== T3 X/X-FROM-COMBAT-DAMAGE create-token (Quartzwood Crasher) — "Create an X/X
  // <descriptor> creature token [with <kw>], where X is the amount of damage those creatures dealt to
  // that player." The X here is the TRIGGER's combat-damage amount, NOT a cast {X} — so this sits
  // OUTSIDE the hasX gate below (a trigger effect parses with hasX:false). Strip the EXACT where-tail,
  // rewrite the X/X to the sentinel "1/1" so the FULL create-token atom parses (descriptor / keywords
  // verbatim), then stamp ptContext:"combatDamageAmount" (the resolver reads the trigger ctx — the same
  // key the CDMG payoffs use, set per damaged player by the batch/singular combat-damage checkers).
  // Anchored to THIS tail only ($); any other "where X is …" P/T still falls through to the hasX ptX
  // branch's `where` bail → null → Arbiter (never a mis-bound X).
  {
    const cdmgTail = s.match(/^(create an x\/x .*\bcreature token(?:s)?(?: with [a-z ,]+)?), where x is the amount of (?:combat )?damage those creatures dealt to that player(?: this combat)?\.?$/i);
    if (cdmgTail) {
      const sentinel = cdmgTail[1].replace(/\bx\/x\b/i, "1/1");
      const base = parseClauseToAtom(cardType, sentinel, false);
      if (!base || base.op !== "create-token") return null;
      return { ...base, ptContext: "combatDamageAmount" };
    }
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
      // NEGATIVE symmetric X-pump ("-X/-X", Grim Hireling) — the sentinel parsed to a -1/-1 pump; mark the atom
      // so applyPumpEffect subtracts ctx.xValue on BOTH pips (a debuff, lethal-SBA-checked) instead of adding it.
      if (rw.xSign === -1 && base.op === "pump") atom.amountXNeg = true;
      // MULTIPLIED X-pump ("twice -X/-X", Nuclear Fallout) — both pips scale by N·X in applyPumpEffect.
      if (rw.xTimes && base.op === "pump") atom.amountXTimes = rw.xTimes;
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
  if (atom.op === "draw" && !/^(?:then )?(?:you )?draw\b/i.test(s)) return null;

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
  // CONDITIONAL-BOTH (Akroma's Will — SHELF S7): "Choose one. If you control a commander as you cast this
  // spell, you may choose both instead." A TWO-mode modal whose both-combo is legal ONLY when the caster
  // controls a commander AS THEY CAST (CR 601.2b — a cast-time state read; "control" means on the
  // BATTLEFIELD, CR 109.4 — a command-zone commander is controlled by no one, the Fierce-Guardianship
  // discipline). The flag rides program.modal; targeting.expandCastChoices gates the size-2 combos on the
  // live board at enumeration (= cast) time, so the metric and the cast offer can't drift. Anchored to the
  // EXACT printed lead — any other conditional-modal wording stays un-matched → low → Arbiter (CREED).
  const cb = stripped.match(/^choose one\.\s*if you control a commander as you cast this spell, you may choose both instead\.\s*/i);
  // REPEATABLE MODES (CR 700.2d — the Confluence cycle: Mystic #1431, Fiery #1561, Eldrazi, Verdant, …;
  // also Planewide Celebration and Unite the Coalition). EXACT printed lead: "Choose <N>. You may choose the
  // same mode more than once." Kept as its OWN anchored regex rather than widening MODAL_RE, so every
  // existing modal card matches byte-identically and this can only ADD parses.
  //
  // MODAL_RE requires a DASH after the count, so these never reached the mode splitter at all — the
  // "You may choose…" sentence sat in front of the bullets and became a garbage first "mode" that failed to
  // parse, dropping the whole card. Fixed-N only: the "{P} worth of modes" Season cycle is a point-cost
  // system and "Choose X" is variable; both stay unmatched → low → Arbiter (FN-safe).
  const rep = cb ? null : stripped.match(/^choose (three|four|five)\.\s*you may choose the same mode more than once\.\s*/i);
  const m = (cb || rep) ? null : stripped.match(MODAL_RE);
  if (!cb && !rep && !m) return null;
  const REP_COUNT = { three: 3, four: 4, five: 5 };
  const repeatable = !!rep;
  const tail = (cb || rep) ? "" : (m[2] || "").toLowerCase();
  const orBoth = tail === " or both";
  const orMore = tail === " or more"; // "choose one or more" → MODAL-N (any non-empty subset, CR 700.2)
  const conditionalBothCommander = !!cb;
  const rest = stripped.slice((cb || rep || m)[0].length).trim();
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
  // chooseCount = the MAX modes pickable: 2 for "two"/"one or both"/the conditional-both lead; ALL modes
  // for "one or more"; else 1. (Resolved after parts is known so "one or more" can size to the mode count.)
  const chooseCount = repeatable ? REP_COUNT[rep[1].toLowerCase()]
    : orMore ? parts.length
      : (orBoth || conditionalBothCommander || (m && m[1].toLowerCase() === "two")) ? 2 : 1;
  const upTo = orBoth || conditionalBothCommander; // "one or both" / conditional-both → pick 1 or 2 (of exactly 2)
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
  // Count must be satisfiable: can't pick more modes than exist, and "one or both" (incl. the
  // conditional-both lead) is specifically a TWO-mode card (1 or 2 of exactly 2). An unsatisfiable
  // count → modes:null → low (never a wrong pick).
  // REPEATABLE is EXEMPT from the "can't pick more modes than exist" guard, and that is the point of the
  // mechanic: Unite the Coalition chooses FIVE from four modes precisely because a mode may be re-chosen
  // (CR 700.2d). Applying the guard here would reject the cards this branch exists to model.
  if (!repeatable && chooseCount > modes.length) return { chooseCount, upTo, atLeastOne, modes: null };
  if ((orBoth || conditionalBothCommander) && modes.length !== 2) return { chooseCount, upTo, atLeastOne, modes: null };
  return { chooseCount, upTo, atLeastOne, ...(conditionalBothCommander && { conditionalBothCommander: true }), ...(repeatable && { repeatable: true }), modes };
}

// The up-front multi-sentence SPAN matchers (δ-1 hand disruption · the removal/counter rider folds ·
// impulse-dig / reorder-top / dig-land / look-top-take / choose-type-draw) moved to ./spanMatchers.js
// (decomposition slice 4). The DISPATCH ORDER stays below in parseEffectClauseImpl — only the matcher
// definitions moved, so the extraction cannot reorder matching. Imported at the top of this file.

// The cast-cost extraction + disposition-strip family (extractAdditionalCosts / extractAltCost /
// stripSelfCostReduction / stripStormKeywordLine / stripDevoidLine / stripSelfShuffleIntoLibrary /
// stripReboundLine) moved to ./castModifiers.js (decomposition slice 5 — a zero-import pure leaf).
// matchKickedSpellEffect stays below: it re-parses both halves through the FULL clause pipeline
// (parseEffectClause + programConfidence), so moving it would force a cycle.

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
  // ⭐⭐ THE MAGNITUDE-ONLY REPLACEMENT GRADUATES HERE, and this gate named its own condition: "a
  // conditional-replacement model we don't have". We have one now — `nonKickedOnly`, the exact mirror of
  // `kickedOnly` — so the pair of atoms is mutually exclusive and precisely one resolves per cast, which is
  // what "instead" means. Roil Eruption / Shivan Fire / Burst Lightning / Cinderclasm ("it deals N damage
  // instead") and Might of Murasa / Explosive Growth ("that creature gets +N/+N until end of turn instead").
  //
  // ⛔ THE KICKED ATOM IS A CLONE OF THE BASE WITH ONE FIELD SWAPPED — never an independent parse, and that
  // is the whole safety argument. The printed tail is ELLIPTICAL ("it deals 5 damage instead" restates no
  // target; "that creature gets +5/+5" back-references), so parsing it alone yields LOW at best and a
  // DIFFERENT target set at worst. Cloning makes op / targetType / restrictions identical by construction,
  // so the replacement cannot silently retarget — the failure mode a from-scratch parse would invite.
  //
  // Fires ONLY when the base is a SINGLE atom whose magnitude the tail restates in full. Any extra rider
  // ("and gains trample and haste" — Colossal Growth; "and the damage can't be prevented" — Urza's Rage;
  // "and if it would die" — Scorching Lava) falls through to the refusal below, unchanged.
  const replacement = matchKickedMagnitudeReplacement(baseProgramFor(t, card, cardType), kickedEffect);
  if (replacement) return replacement;
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

/**
 * The BASE program for the kicked-rider matcher, extracted so the magnitude-replacement gate above can read
 * it BEFORE the additive path builds it. Same three transforms as the additive path, in the same order.
 */
function baseProgramFor(t, card, cardType) {
  const base = t
    .replace(/\bkicker\s+(?:\{[^}]+\})+\s*/i, " ")
    .replace(/if this spell was kicked,\s*[^.;]+(?:[.;]|$)/i, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!base) return null;
  const p = parseEffectClause(base, cardType, { hasX: false });
  if (!p || programConfidence(p) !== "high" || p.structure === "modal" || p.xSpell) return null;
  return p;
}

/**
 * KICKED MAGNITUDE REPLACEMENT — "…deals 3 damage to any target. If this spell was kicked, it deals 5 damage
 * instead." → two mutually exclusive atoms: the base stamped `nonKickedOnly` and a CLONE stamped `kickedOnly`
 * with only its magnitude changed.
 *
 * ⛔ EVERY GUARD HERE EXISTS TO KEEP THE PAIR A PURE MAGNITUDE SWAP:
 *   · the base must be exactly ONE atom (a multi-atom base has no single magnitude to replace);
 *   · the tail must match a whole-clause anchor, so a trailing rider can never be silently dropped — the
 *     lossy-tail class, and on a REPLACEMENT an unread rider means the kicked mode under-delivers while the
 *     card reads native;
 *   · the recipient phrase, when the tail restates one, must be the SAME as the base's ("to each creature"
 *     may not replace a single-target base, and vice versa);
 *   · the op must be one whose magnitude is a single known field (deal-damage.amount, pump.ptDelta).
 * Anything else returns null and the card keeps its documented refusal.
 */
function matchKickedMagnitudeReplacement(baseProgram, kickedEffect) {
  if (!baseProgram || baseProgram.atoms.length !== 1) return null;
  const b = baseProgram.atoms[0];
  const tail = String(kickedEffect).trim().toLowerCase();
  const pair = (kickedAtom) => ({
    atoms: [{ ...b, nonKickedOnly: true }, { ...kickedAtom, kickedOnly: true }],
  });

  // DAMAGE — "it deals N damage instead" / "it deals N damage to <recipient> instead".
  if (b.op === "deal-damage" && typeof b.amount === "number") {
    const m = tail.match(/^it deals (\d+) damage(?: to ([a-z ]+?))? instead$/);
    if (m) {
      // A restated recipient must describe the SAME recipient the base already has. "each creature" is the
      // only mass form in this family; a single-target base restating it (or the reverse) is a different
      // effect, not a bigger one.
      if (m[2]) {
        const wantsEach = /^each creature$/.test(m[2].trim());
        if (wantsEach !== (b.targetType === "eachCreature")) return null;
        if (!wantsEach && !/^(?:that creature|that permanent or player|any target)$/.test(m[2].trim())) return null;
      }
      return pair({ ...b, amount: parseInt(m[1], 10) });
    }
    return null;
  }

  // PUMP — "that creature gets +N/+N until end of turn instead".
  if (b.op === "pump" && b.ptDelta) {
    const m = tail.match(/^that creature gets \+(\d+)\/\+(\d+) until end of turn instead$/);
    if (m) return pair({ ...b, ptDelta: { p: parseInt(m[1], 10), t: parseInt(m[2], 10) } });
    return null;
  }

  return null;
}

export function parseEffectProgram(card) {
  if (!isInstantOrSorcery(card) || !oracleOf(card)) return null;
  return parseEffectProgramWithSelfExileRetry(card) ?? null;
}

/**
 * SELF-EXILE RETRY — the outer wrapper. ⭐ STRICTLY ADDITIVE BY CONSTRUCTION: the normal parse runs FIRST and
 * its result is returned untouched whenever it is HIGH. Only a LOW program is retried with a trailing
 * "Exile <this>." sentence peeled off, so no card that parses today can be changed by this path.
 *
 * ⚠️ THE FIRST VERSION STRIPPED UP FRONT, IN THE DISPOSITION CHAIN BESIDE THE SELF-SHUFFLE STRIP, AND THAT
 * REGRESSED FINALE OF REVELATION FROM native-spell TO arbiter-spell. Finale is already handled by a
 * collapse further down that matches its "draw X … Exile <this>." shape AS A WHOLE — removing the sentence
 * first meant that collapse no longer recognised the card, and a working card broke to make a broken one
 * work. Retrying only on LOW makes the two handlers compose instead of compete: whoever succeeds first wins,
 * and the pre-existing owner is always first.
 *
 * ⛔ THE STAMP IS THE POINT, NOT THE STRIP. `selfExile` makes GY-1 exile the spell instead of putting it in
 * the graveyard, and these cards genuinely never reach the yard. Peeling the sentence WITHOUT stamping would
 * flip the card native while silently sending it to the graveyard — corrupting every graveyard count,
 * recursion target and delve/escape cost downstream. So the retry returns the stripped program ONLY when it
 * is HIGH (a LOW retry is discarded and the original LOW is returned) and always stamps it.
 */
function parseEffectProgramWithSelfExileRetry(card) {
  const direct = parseEffectProgramInner(card);
  if (direct && programConfidence(direct) === "high") return direct;
  const { body, selfExile } = stripSelfExileSentence(card, oracleOf(card));
  if (!selfExile) return direct;
  const retried = parseEffectProgramInner({ ...card, oracle: body, oracle_text: body });
  if (!retried || programConfidence(retried) !== "high") return direct;
  retried.selfExile = true;
  return retried;
}

function parseEffectProgramInner(card) {
  if (!isInstantOrSorcery(card) || !oracleOf(card)) return null;
  const rawOracle = stripDevoidLine(stripStormKeywordLine(stripSelfCostReduction(oracleOf(card))));
  // SELF-SHUFFLE DISPOSITION (Green Sun's Zenith + the Sun's Zenith / Beacon family) — peel a trailing "Shuffle
  // <this> into its owner's library." sentence up front so the BODY parses through the normal pipeline, and stamp
  // the resulting program `selfShuffle` (runEffectProgram's GY-1 then tucks the spell into the library instead of
  // the graveyard). No family member carries a kicker/additional/alt cost, so stripping before those checks is
  // safe; the body still must parse HIGH on its own (an unmodeled body stays LOW → Arbiter). A card without the
  // sentence yields `oracle === rawOracle` and `selfShuffle === false` — byte-identical to the prior behavior.
  const { body: shuffleBody, selfShuffle } = stripSelfShuffleIntoLibrary(card, rawOracle);
  // REBOUND DISPOSITION (CR 702.88) — peel a trailing `Rebound` keyword line up front so the BODY parses
  // through the normal pipeline, and stamp the resulting HIGH program `selfExile` (runEffectProgram's GY-1 then
  // exiles the spell instead of the graveyard — the real state divergence; the optional upkeep recast is
  // faithfully DECLINED, CR 702.88e). No rebound printing carries a self-shuffle sentence, so the two strips
  // never overlap (rebound is peeled AFTER shuffle so a hypothetical both-lines card keeps working). A card
  // without the line yields `oracle === shuffleBody` and `rebound === false` — byte-identical to prior behavior.
  const { body: reboundBody, rebound } = stripReboundLine(shuffleBody);
  // ===== ESCALATE (CR 702.121a) =====================================================================
  // "Escalate [cost]" means "For each mode you choose beyond the first, you must pay [cost] as an
  // additional cost to cast this spell." Peel the keyword line so the modal body parses, and record it.
  //
  // ⛔ THIS IS NOT A FREE STRIP, AND THE MEASUREMENT SAID SO. "Choose one or both —" parses to
  // chooseCount 2 / upTo true, so the cast path CAN pick both modes — and picking both without paying
  // escalate casts the spell for less than its cost, a false positive. Escalate is therefore admitted only
  // with the multi-mode option WITHHELD: the modal is clamped to a single mode below, which is a real,
  // complete, legal cast at the printed price with no escalate cost ever due.
  //
  // ⭐ That is the AFTERMATH bargain, verbatim — unpark the card only once the lane withholds the option it
  // cannot pay for — and the same one fuse / delve / myriad / replicate / squad are credited under.
  const escalateLine = /^escalate\s*(?:\{[^}]+\})+\s*(?:\([^)]*\))?\s*$/i;   // the printed reminder paren is still attached here (stripReminder runs later)
  const escalate = reboundBody.split("\n").some((ln) => escalateLine.test(ln.trim()));
  const oracle = escalate
    ? reboundBody.split("\n").filter((ln) => !escalateLine.test(ln.trim())).join("\n").trim()
    : reboundBody;
  // Stamp `selfShuffle` / `selfExile` on the produced program WITHOUT reconstructing it (preserve every field —
  // additionalCosts / altCost / xSpell / modal — that later lines may have attached). Only a HIGH program is
  // flagged: a LOW body (unmodeled family member) routes to the Arbiter, which disposes the spell itself, so
  // the flag would be inert there anyway. Mutating the returned object is safe (it's freshly built per call).
  // selfShuffle and selfExile are mutually exclusive in the corpus (no card both shuffles-self and rebounds).
  const stamp = (p) => {
    if (selfShuffle && p && programConfidence(p) === "high") p.selfShuffle = true;
    if (rebound && p && programConfidence(p) === "high") p.selfExile = true;
    // ESCALATE CLAMP — withhold the multi-mode line the engine cannot price. One mode, no upTo, so
    // expandCastChoices offers exactly the single-mode casts and the escalate cost never comes due.
    // `escalateSingleMode` records WHY the modal is narrower than the printed card, so the next reader sees a
    // deliberate under-offer rather than a parse bug.
    if (escalate && p && programConfidence(p) === "high" && p.modal) {
      p.modal = { ...p.modal, chooseCount: 1, upTo: false, atLeastOne: false };
      p.escalateSingleMode = true;
    }
    return p;
  };
  // KICKED-SPELL-EFFECT (CR 702.33e) — "<base>. If this spell was kicked, <extra>." The kicked atom(s) are
  // appended stamped `kickedOnly` and run ONLY on a kicked cast (runEffectProgram skips them otherwise). The
  // kicker line + kicked sentence keep the NORMAL parse LOW, so this MUST run first. Whole-card-or-null (CREED).
  const kicked = matchKickedSpellEffect(card, typeOf(card), oracle);
  if (kicked && kicked.atoms.every((a) => KNOWN.has(a.op))) {
    return stamp(makeProgram({ confidence: "high", atoms: kicked.atoms, xSpell: false, unparsedTail: null }));
  }
  const { costs, rest } = extractAdditionalCosts(oracle);
  const { altCost, rest: altRest } = extractAltCost(costs ? rest : oracle);
  // A spell that is BOTH an X-spell AND carries an additional/alt cost is a compound we defer — the cast-path
  // X-value expansion and the cost expansion don't yet compose — so parse the FULL oracle and let the
  // un-stripped cost sentence keep it LOW. No clean printed card needs both today.
  if ((costs || altCost) && hasXCost(card)) return stamp(parseEffectClause(oracle, typeOf(card), { hasX: true }));
  // {X}-cost spell (no additional cost): the parser may stamp `amountX` on a damage/draw/pump atom whose
  // amount is the chosen X, bound at cast time (CR 601.2b) and read at resolution.
  const bodyOracle = altCost ? altRest : (costs ? rest : oracle);
  const program = parseEffectClause(bodyOracle, typeOf(card), { hasX: hasXCost(card) });
  if (costs && program) program.additionalCosts = costs;
  if (altCost && program) program.altCost = altCost;
  return stamp(program);
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

// The collapsed-template whole-oracle matchers (matchDiesGainDrawByPower … matchCounterThenGrant, 39 names
// incl. parseFixedManaPips) moved to ./templateMatchers.js (decomposition slice 6). The DISPATCH ORDER stays
// below in parseEffectClauseImpl — only definitions moved. Still inline here (they re-enter the clause
// machinery, so extraction would cycle): matchEmblem + emblemAbilityModeled above, the optional-payment
// quartet + reflexive trio below, matchKickedSpellEffect, parseModal.

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
  // ENERGY variant (CR 122.1e) — "you may pay {E}{E}. If you do, <effect>" (Hexgold Slith, Thriving Rats,
  // Aetherstorm Roc). All pips are {E}; the cost is a count of energy the settler spends (hasEnergy/spendEnergy),
  // NOT mana. The optional-effect suspend + payoff gates below are cost-agnostic — only the cost shape differs.
  let cost;
  if (pips.every((p) => /^e$/i.test(p))) {
    cost = { kind: "energy", amount: pips.length };
  } else {
    const mana = parseFixedManaPips(pips);
    if (!mana) return null;                                          // {X} / unknown symbol → unmodeled cost
    cost = { kind: "mana", mana };
  }
  const rawPayoff = m[2].trim();
  if (/\bif you do\b/i.test(rawPayoff)) return null;                 // a SECOND "if you do" — not modeled
  // SELF-PRONOUN (the Thriving cycle, census slice 40) — "…you may pay {E}{E}. If you do, IT gains first
  // strike / put a +1/+1 counter on IT." On these cards the sentence introduces no other object, so "it" is
  // the source; the bare pronoun otherwise fails to resolve and the whole card parks.
  //
  // An ALLOWLIST of the two printed self-shapes, deliberately NOT a denylist. A denylist would have to
  // anticipate every way another object can be introduced ("create a token … it gains haste" would slip
  // straight through and pump the WRONG permanent), which is the same pronoun trap that made
  // "sacrifice it at the beginning of the next end step" unsafe to normalize. Anything else — a chosen
  // target, "another", a token-maker — keeps its pronoun, fails to parse, and stays on the Arbiter (FN-safe).
  const SELF_PRONOUN_PAYOFF = /^(?:it (?:gains|gets)\b[^.]*|put (?:a|one|two|three) [+-]\d+\/[+-]\d+ counters? on it)$/i;
  const payoffText = SELF_PRONOUN_PAYOFF.test(rawPayoff) ? rawPayoff.replace(/\bit\b/gi, "this creature") : rawPayoff;
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
  return { atom: { op: "optional-mana-payment", cost, effectAtoms: inner, targetType: null } };
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
 * discard (there the discard is the coupled effect, LAST-position; here it's the leading cost). CREED guards: HIGH +
 * non-modal + not-xSpell + every atom KNOWN + targetless; reject a chained 2nd reflexive or an else-branch.
 *
 * PAUSE MODEL: resolveOptionalDiscardPaymentChoice runs [cost-discard, ...payoff] as ONE program through
 * runEffectProgram, whose resume cursor (pendingChoice.resume.nextAtomIndex) chains SEQUENTIAL pauses — each pause
 * records where to resume, the settler re-enters, the next pause records the next resume, and so on. So a LAST-
 * position pausing payoff (Formidable Speaker's ETB: "you may discard a card. If you do, search your library for a
 * creature card, reveal it, put it into your hand, then shuffle" → tutor-to-hand) is SAFE: discard pauses (which-
 * card) → settles → tutor pauses (which-creature) → settles → done, strictly sequential, never interleaved, never a
 * dropped atom (runtime-probed end-to-end). A NON-last pausing atom is still rejected (mirrors matchOptionalDrawDiscard's
 * `inner.slice(0,-1)` rule — only the last may pause) to stay inside the proven-safe last-position family. Match →
 * the single atom, else null (the clause stays LOW → Arbiter).
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
  // atoms (draw/token/pump/tutor) resolve type-agnostically, so "Instant" is behavior-identical and correct.
  const payoff = parseEffectClauseImpl(payoffText, "Instant", { hasX: false });
  if (!payoff || programConfidence(payoff) !== "high" || payoff.structure === "modal" || payoff.xSpell) return null;
  const inner = payoff.atoms || [];
  if (!inner.length || !inner.every((a) => KNOWN.has(a.op)) || programNeedsChosenTarget(payoff)) return null;
  // Only the LAST payoff atom may pause — the [cost-discard, ...payoff] program chains sequential pauses via the
  // resume cursor, so a trailing tutor/scry/etc. is safe, but a mid-payoff pause (atoms after it) stays LOW → Arbiter.
  if (inner.slice(0, -1).some((a) => PAUSING_ATOM_OPS.has(a.op))) return null;
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

/**
 * ===== OPTIONAL-PRIMARY REFLEXIVE (CR 603.7) ===== "You may <primary>. When you do, <reflexive>." — the
 * primary is OPTIONAL and the reflexive fires ONLY IF the controller actually DID the primary (Generous
 * Plunderer's upkeep: "you may create a Treasure token. When you do, target opponent creates a tapped Treasure
 * token."). matchReflexiveTrigger REJECTS this (a naive sequential fold would fire the reflexive even on a
 * DECLINE — the cardinal FP), so this is the distinct, faithful model: emit [optionalPrimaryAtom,
 * {...reflexiveAtom, reflexiveGate:true}]. The `reflexiveGate` flag tells runEffectProgram / resolveOptionalChoice
 * to run the atom ONLY when the immediately-preceding optional was TAKEN, and to SKIP it (never resolve — CR
 * 603.7: the reflexive doesn't even trigger) when it was declined. This is the ONLY safe way an optional-then-
 * dependent sequence can be modeled, so `optionalsFormSuffix` is deliberately NOT applied to the combined atoms
 * (the gate replaces that invariant with a stronger one — the gated atom cannot run without the optional).
 *
 * CREED guards (mirroring matchReflexiveTrigger, but the MANDATORY gate is INVERTED to require optional):
 *  - The PRIMARY must be a SINGLE optional atom (a plain "you may <one thing>"): a multi-atom optional primary
 *    would make "did you do it?" ambiguous per-atom. Exactly one atom, and it must be `optional`.
 *  - Both halves HIGH + non-modal + non-xSpell; the reflexive is self-contained (no leading referent, no chained
 *    2nd reflexive) and carries NO optional atom of its own (the gate is the only conditionality).
 *  - Every atom KNOWN. Anchored to a SINGLE "when you do". Returns { atoms } or null.
 */
function matchOptionalReflexiveTrigger(oracle, cardType, hasX) {
  const s = stripReminder(oracle).trim();
  const m = s.match(/^(.+?\S)\.\s+when you do(?:\s+this|\s+so)?\s*,?\s+(.+?)\.?$/i);
  if (!m) return null;
  const primaryText = m[1].trim();
  const reflexiveText = m[2].trim();
  if (/\bwhen you do\b/i.test(reflexiveText)) return null;          // a chained 2nd reflexive — not modeled
  if (/^(?:it|they|that|those|this)\b/i.test(reflexiveText)) return null; // primary-object referent (e.g. "it fights")
  const primary = parseEffectClauseImpl(primaryText, cardType, { hasX });
  if (!primary || programConfidence(primary) !== "high" || primary.structure === "modal") return null;
  // OPTIONAL-primary gate (INVERTED): the primary must be EXACTLY ONE optional atom.
  const primaryAtoms = primary.atoms || [];
  if (primaryAtoms.length !== 1 || !primaryAtoms[0].optional) return null;
  const reflexive = parseEffectClauseImpl(reflexiveText, cardType, { hasX: false });
  if (!reflexive || programConfidence(reflexive) !== "high" || reflexive.structure === "modal") return null;
  if (primary.xSpell || reflexive.xSpell) return null;
  const reflexiveAtoms = reflexive.atoms || [];
  // The reflexive must be non-empty and carry NO optional atom of its own (the gate is the sole conditionality —
  // an optional-inside-reflexive would need a second pause the simple gate can't express → LOW → Arbiter).
  if (reflexiveAtoms.length === 0 || reflexiveAtoms.some(a => a.optional)) return null;
  // Tag every reflexive atom with reflexiveGate so the runner runs them ONLY if the optional primary was taken.
  const atoms = [primaryAtoms[0], ...reflexiveAtoms.map(a => ({ ...a, reflexiveGate: true }))];
  if (!atoms.every(a => KNOWN.has(a.op))) return null;
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


function parseEffectClauseImpl(oracle, cardType = "", { hasX = false, sourceScoped = false } = {}) {
  if (!oracle) return null;
  // MTG-001 — strip the "can't be regenerated" rider from the PARSE TEXT only, so the lead effect (the
  // board wipe / removal) still matches its anchored pattern instead of being forced low by the rider
  // clause. The rider's MEANING is NOT dropped: the exported parseEffectClause wrapper re-detects it on
  // the original oracle (CANT_REGEN_TEST) and stamps `cannotRegenerate` on the resulting destroy atom(s),
  // which applyDestroyEffect honors by ignoring regeneration shields (CR 701.19).
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
  // ===== CONDITIONAL REPLACEMENT (CR 608.2) ===== "<base>. If <condition>, <alternative> instead."
  // Scute Swarm ("…create a token that's a copy of this creature instead") and Entish Restoration, which
  // prints the other word order ("…, instead search your library for up to three basic land cards").
  //
  // Collapsed to ONE `conditional` atom carrying both branches, so the sentence splitter never shatters it
  // into an unconditional base plus an orphan alternative — that split is the dropped-effect trap: it would
  // run the base every time and silently ignore the replacement, which LOOKS like success.
  //
  // ⚠️ THE CONDITION MUST BE DECIDABLE, and that is checked HERE, not merely at resolution. Both branches
  // must also parse HIGH and non-modal on their own. If any of the three fails the whole thing is LOW →
  // Arbiter (a safe FN): Scythecat Cub's "if this is the second time this ability has resolved this turn"
  // is inexpressible and parks by design. Verified before writing this arm — evaluateInterveningIf already
  // answers "you control six or more lands" and "you control a creature with power 4 or greater".
  {
    const cond = oracle.match(/^(.+?)\.\s*If ([^,]+),\s*(?:instead\s+(.+?)|(.+?)\s+instead)\.?\s*$/is);
    if (cond) {
      const [, baseText, condition, altLeading, altTrailing] = cond;
      const inner = parseEffectClauseImpl(baseText.trim(), cardType, { hasX });
      const alt = parseEffectClauseImpl(String(altLeading || altTrailing).trim(), cardType, { hasX });
      const ok = inner && alt
        && programConfidence(inner) === "high" && programConfidence(alt) === "high"
        && inner.structure !== "modal" && alt.structure !== "modal"
        && inner.atoms.length > 0 && alt.atoms.length > 0
        && conditionIsDecidable(condition.trim());
      if (ok) {
        return makeProgram({
          confidence: "high",
          atoms: [{ op: "conditional", branchOn: condition.trim().toLowerCase(), ifTrue: alt.atoms, ifFalse: inner.atoms, targetType: null }],
          unparsedTail: null,
        });
      }
      // ⚠️ FALL THROUGH — never return LOW from here. This regex also matches shapes that OTHER, older
      // machinery already models: every "deal N damage to target creature. If that creature would die this
      // turn, exile it instead" rider (Anger of the Gods, Pillar of Flame, Incendiary Flow — 23 cards) has
      // this exact grammar, and its alternative ("exile it") does not parse as a standalone branch. Returning
      // LOW here hijacked all of them from native-spell to arbiter-spell. Falling through leaves the prior
      // behaviour byte-identical for anything this arm cannot fully model — the cards it does not claim are
      // exactly as they were.
    }
  }

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

  // ===== EARTHBEND + UNTAP-THAT-LAND ===== "earthbend N, then untap that land" (Avatar Kyoshi, Earthbender).
  // Matched as a COMPOUND rather than letting the splitter hand "untap that land" to a clause parser, and
  // that is a CREED requirement, not a convenience: the corpus prints "untap that land" on FOUR cards and
  // THREE of them mean a DIFFERENT land — Fabled Passage (the land it just fetched), Land Aid '04 (the
  // searched land), Tiller Engine (the land that just entered). A bare clause arm would bind all of them to
  // the earthbend stamp and untap the wrong permanent. Only the earthbend-adjacent form is admitted here.
  {
    const eb = oracle.match(/^earthbend (\d+|a|an|one|two|three|four|five),?\s*then untap that land\.?\s*$/i);
    if (eb) {
      const lead = parseEffectClauseImpl(`earthbend ${eb[1]}`, cardType, { hasX });
      if (lead && programConfidence(lead) === "high" && lead.atoms.length === 1) {
        return makeProgram({
          confidence: "high",
          atoms: [lead.atoms[0], { op: "untap-earthbent-land", targetType: null }],
          unparsedTail: null,
        });
      }
      // Fall through (never return LOW) — same rule the conditional-replacement arm learned the hard way.
    }
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
      const a = parseClauseToAtom(cardType, clause, hasX, sourceScoped);
      if (!a) return makeProgram({ confidence: "low", atoms: [], unparsedTail: oracle });
      atoms.push(a);
    }
    if (atoms.every(a => KNOWN.has(a.op)) && optionalsFormSuffix(atoms)) {
      return makeProgram({ confidence: "high", atoms, xSpell: atoms.some(a => a.amountX || a.countX || a.targetCountX || a.ptX || a.filter?.mvCapX || a.mvCapX), unparsedTail: null });
    }
    return makeProgram({ confidence: "low", atoms: [], unparsedTail: oracle });
  };
  // IMPRINT (CR 207.2c) — the ETB exile-from-hand that STAMPS the permanent (Chrome Mox). Anchored on
  // "exile a … card from your hand", which no other modeled clause claims, so order here is documentation.
  const imp = matchImprint(oracle);
  if (imp) return collapsed(imp);
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
  // REORDER-TOP (Ponder) — "Look at the top N cards of your library, then put them back in any order. You may
  // shuffle." → ONE reorder-top atom (look at top N → put ALL back on top in any order, with an optional shuffle;
  // nothing bottomed). The comma-joined "then" + the separate optional-shuffle sentence would shatter under the
  // clause splitter, so it's collapsed up front; Ponder's trailing "Draw a card." runs through the normal pipeline
  // via collapsed(). Disjoint anchor from impulse-dig ("put them back in any order" vs "put one … into your hand"),
  // so order is documentation. HIGH iff every atom (this + any rider) is KNOWN. Not an X spell.
  const reorderTop = matchReorderTop(oracle);
  if (reorderTop) return collapsed(reorderTop);
  // TOP-CARD TAKE-OR-LEAVE-ON-TOP (BLITZ LK-2) — "Look at the top card of your library. If it's a <quality>
  // card[ of the chosen type], you may reveal it and put it into your hand." → ONE look-top-take atom (top-1,
  // declined/non-matching card stays ON TOP, no disposal). The two sentences span the clause splitter, so it's
  // collapsed up front like impulse-dig; the $-anchored matcher guarantees no rider (rest is always empty). A
  // disjoint anchor from impulse-dig ("put it into your hand" WITH no rest-disposal tail vs. "put the rest on
  // the bottom"), so order is documentation. Dryad Greenseeker / Frost Augur (activated) + Herald's Horn (upkeep
  // trigger, chosen-type) flip through this.
  const lookTopTake = matchLookTopTake(oracle);
  if (lookTopTake) return collapsed(lookTopTake);
  // CHOSEN-TYPE DRAW (Distant Melody) — "Choose a creature type. Draw a card for each permanent you control
  // of that type." spans two sentences, so it's collapsed up front to one chosen-type-count draw atom.
  const ctd = matchChooseTypeDraw(oracle);
  if (ctd) return collapsed(ctd);
  // CHOSEN-TYPE REVEAL TO HAND (For the Ancestors) — "Choose a creature type. Look at the top N cards…
  // reveal any number of the chosen type into your hand. Put the rest on the bottom…" spans four
  // sentences, collapsed the same way as the chosen-type draw just above.
  const cthh = matchChosenTypeRevealToHand(oracle);
  if (cthh) return collapsed(cthh);
  // DELAYED TRIGGER (CR 603.7) — "At the beginning of <next step>, <effect>" / "<effect> at the
  // beginning of <next step>". CREED GATE: emit the scheduling atom ONLY when the INNER clause
  // itself parses HIGH — a scheduled ability must never fire an effect the engine can't model, so an
  // unreadable inner clause leaves the whole card LOW → Arbiter (a safe FN). The inner parse runs on
  // the same "Instant" lane every trigger payoff uses.
  const dly = matchDelayedTrigger(oracle);
  if (dly) {
    const inner = parseEffectClause(dly.delayedClause, "Instant");
    if (programConfidence(inner) === "high") {
      const scheduleAtom = {
        op: "schedule-delayed", fireStep: dly.fireStep, fireScope: dly.fireScope,
        delayedClause: dly.delayedClause, targetType: null,
      };
      // No leading sentence → the whole clause is the delayed ability.
      if (!dly.immediateClause) {
        return makeProgram({ confidence: "high", atoms: [scheduleAtom], xSpell: false, unparsedTail: null });
      }
      // Leading sentences resolve NOW, the final one is scheduled: emit [immediate…, schedule].
      // ALL-OR-NOTHING — an unmodeled immediate half drops the WHOLE program to low (falling through
      // to the normal pipeline), so a spell can never half-resolve with its delayed half silently lost.
      const imm = parseEffectClause(dly.immediateClause, "Instant");
      if (programConfidence(imm) === "high" && imm.atoms.length) {
        return makeProgram({ confidence: "high", atoms: [...imm.atoms, scheduleAtom], xSpell: false, unparsedTail: null });
      }
    }
  }
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
  // ===== REANIMATE-DRAIN (Reanimate) ===== "Put target creature card from a graveyard … under your control.
  // You lose life equal to that card's mana value." → [reanimate(stampMv), lose-life(revealedCardMV, controller)].
  const rd = matchReanimateDrain(oracle);
  if (rd && rd.atoms.every(a => KNOWN.has(a.op)) && revealTopSequenceOk(rd.atoms)) {
    return makeProgram({ confidence: "high", atoms: rd.atoms, xSpell: false, unparsedTail: null });
  }
  // ===== DRAIN-BY-COUNT (BLITZ FE-1) ===== "<source> deals X damage to <target> and you gain X life, where X is
  // the number of <count>" (Tendrils of Corruption / Consuming Corruption / Harsh Sustenance) → [gain-life,
  // deal-damage], both amountCount off the SAME controller board count, gain-life first so X is locked ONCE off
  // the pre-damage board (CR 107.3b — see matchDrainByCount). HIGH iff both atoms are KNOWN (they are). Not X.
  const dbc = matchDrainByCount(oracle);
  if (dbc && dbc.atoms.every(a => KNOWN.has(a.op))) {
    return makeProgram({ confidence: "high", atoms: dbc.atoms, xSpell: false, unparsedTail: null });
  }
  // ===== PUMP-THEN-FIGHT (Epic Confrontation / Savage Smash / Swift Kick / Wild Instincts / Ruthless
  // Predation / Chelonian Tackle) ===== "Target creature you control gets +X/+Y until end of turn. It fights
  // target creature you don't control." → ONE fight-pair atom carrying fighterPump {X,Y} (see matchPumpThenFight).
  // Collapsed up front because the anaphoric "It fights" would otherwise mis-bind to a source-less spell fight
  // (the fightAtomMisplaced park). HIGH iff the op is KNOWN (fight-pair). Not an X spell.
  const ptf = matchPumpThenFight(oracle);
  if (ptf && ptf.atoms.every(a => KNOWN.has(a.op))) {
    return makeProgram({ confidence: "high", atoms: ptf.atoms, xSpell: false, unparsedTail: null });
  }
  // ===== UNTAP-THEN-PUMP (Ornamental Courage / Inspirit / Gerrard's Command / Spidery Grasp / Aim High / Steady
  // Aim) ===== "Untap target creature. It gets +X/+Y [and gains reach] until end of turn." → ONE pump atom with
  // untap:true (see matchUntapThenPump). Collapsed up front so the anaphoric "It" binds to the untap's target.
  // HIGH iff the op is KNOWN (pump). Not an X spell.
  const utp = matchUntapThenPump(oracle);
  if (utp && utp.atoms.every(a => KNOWN.has(a.op))) {
    return makeProgram({ confidence: "high", atoms: utp.atoms, xSpell: false, unparsedTail: null });
  }
  // ===== COUNTER-THEN-GRANT (Snakeskin Veil) ===== "Put a +1/+1 counter on target creature you control. It
  // gains hexproof until end of turn." → ONE add-counter atom carrying grantKeywords (see matchCounterThenGrant).
  // Collapsed up front so the anaphoric "It" binds to the counter's target. HIGH iff the op is KNOWN. Not X.
  const ctg = matchCounterThenGrant(oracle);
  if (ctg && ctg.atoms.every(a => KNOWN.has(a.op))) {
    return makeProgram({ confidence: "high", atoms: ctg.atoms, xSpell: false, unparsedTail: null });
  }
  // ===== DAMAGE-POWER-TRAMPLE-EXCESS (Ram Through) ===== the one-way fight + the trample-excess-to-controller
  // rider → ONE damage-target-power atom with trampleExcess (see matchDamagePowerTrampleExcess). HIGH iff KNOWN.
  const dte = matchDamagePowerTrampleExcess(oracle);
  if (dte && dte.atoms.every(a => KNOWN.has(a.op))) {
    return makeProgram({ confidence: "high", atoms: dte.atoms, xSpell: false, unparsedTail: null });
  }
  // ===== COUNTER-IF-LEGENDARY-THEN-FIGHT (Ancient Animus) ===== conditional counter + anaphoric fight → ONE
  // fight-pair atom carrying fighterCounter (see matchCounterIfLegendaryThenFight). HIGH iff the op is KNOWN.
  const clf = matchCounterIfLegendaryThenFight(oracle);
  if (clf && clf.atoms.every(a => KNOWN.has(a.op))) {
    return makeProgram({ confidence: "high", atoms: clf.atoms, xSpell: false, unparsedTail: null });
  }
  // ===== METALCRAFT-DAMAGE (Galvanic Blast) ===== the base burn + the "deals N instead if you control three
  // or more artifacts" rewrite → ONE deal-damage atom with amountUpgrade (see matchMetalcraftDamage).
  const mcd = matchMetalcraftDamage(oracle);
  if (mcd && mcd.atoms.every(a => KNOWN.has(a.op))) {
    return makeProgram({ confidence: "high", atoms: mcd.atoms, xSpell: false, unparsedTail: null });
  }
  // ===== INSTEAD-AMOUNT (BLITZ INST-1) ===== the condition-gated ability-word amount swap generalizing
  // METALCRAFT-DAMAGE to the Morbid / Hellbent / Raid / Ferocious (+ Metalcraft pump / debuff) family → ONE
  // atom with amountUpgrade / ptUpgrade (see matchInsteadAmountUpgrade). HIGH iff the op is KNOWN. Runs AFTER
  // metalcraft so Galvanic Blast keeps its exact {kind:"artifactsYouControl"} shape (byte-identical).
  const iau = matchInsteadAmountUpgrade(oracle);
  if (iau && iau.atoms.every(a => KNOWN.has(a.op))) {
    return makeProgram({ confidence: "high", atoms: iau.atoms, xSpell: false, unparsedTail: null });
  }
  // ===== SELF-HIT DAMAGE (Orcish Artillery — BLITZ OA-1) ===== "deals N damage to any target and M damage
  // to you" → ONE deal-damage atom with selfDamage (see matchSelfHitDamage; collapsed before the splitter).
  const shd = matchSelfHitDamage(oracle);
  if (shd && shd.atoms.every(a => KNOWN.has(a.op))) {
    return makeProgram({ confidence: "high", atoms: shd.atoms, xSpell: false, unparsedTail: null });
  }
  // ===== RAD-OR-PROLIFERATE (Vexing Radgull) ===== the rad-if-none / else-proliferate branch → ONE rad atom
  // with ifNoRadElseProliferate (see matchRadOrProliferate). HIGH iff the op is KNOWN.
  const rop = matchRadOrProliferate(oracle);
  if (rop && rop.atoms.every(a => KNOWN.has(a.op))) {
    return makeProgram({ confidence: "high", atoms: rop.atoms, xSpell: false, unparsedTail: null });
  }
  // ===== DRAW-OR-COUNTER-TRIGGERING (Marcus, Mutant Mayor) ===== the counter-gated draw/counter branch on
  // the combat-damage dealer → ONE branch atom (see matchDrawOrCounterTriggering). HIGH iff the op is KNOWN.
  const dct = matchDrawOrCounterTriggering(oracle);
  if (dct && dct.atoms.every(a => KNOWN.has(a.op))) {
    return makeProgram({ confidence: "high", atoms: dct.atoms, xSpell: false, unparsedTail: null });
  }
  // ===== DOUBLE-OR-RESET-COUNTERS (Lily Bowen, Raging Grandma) ===== the power-gated double / reset-and-gain
  // branch on the SOURCE's own +1/+1 counters → ONE branch atom (see matchDoubleOrResetCounters). HIGH iff KNOWN.
  const dor = matchDoubleOrResetCounters(oracle);
  if (dor && dor.atoms.every(a => KNOWN.has(a.op))) {
    return makeProgram({ confidence: "high", atoms: dor.atoms, xSpell: false, unparsedTail: null });
  }
  // ===== FREE-CAST-OR-LAND (Kellan, the Kid) ===== the relational-cap free cast + else-land branch → ONE
  // free-cast atom (see matchFreeCastOrLand). HIGH iff KNOWN.
  const fcl = matchFreeCastOrLand(oracle);
  if (fcl && fcl.atoms.every(a => KNOWN.has(a.op))) {
    return makeProgram({ confidence: "high", atoms: fcl.atoms, xSpell: false, unparsedTail: null });
  }
  // ===== RAD-TARGET-OR-TREASURE (The Ghoul, Gunslinger) ===== the chosen-player rad + treasure-if-self
  // branch → ONE rad atom (see matchRadTargetOrTreasure). HIGH iff KNOWN.
  const rtt = matchRadTargetOrTreasure(oracle);
  if (rtt && rtt.atoms.every(a => KNOWN.has(a.op))) {
    return makeProgram({ confidence: "high", atoms: rtt.atoms, xSpell: false, unparsedTail: null });
  }
  // ===== GY-OWNER-DRAIN (Bloodchief Ascension) ===== the optional referent drain + reflexive gain →
  // ONE composite atom (see matchGyOwnerDrain). HIGH iff KNOWN.
  const god = matchGyOwnerDrain(oracle);
  if (god && god.atoms.every(a => KNOWN.has(a.op))) {
    return makeProgram({ confidence: "high", atoms: god.atoms, xSpell: false, unparsedTail: null });
  }
  // ===== TIMETWISTER WHEEL (Echo of Eons / Timetwister) ===== the shuffle-in + draw-7 pair → ONE atom
  // (see matchTimetwisterWheel). HIGH iff KNOWN.
  const ttw = matchTimetwisterWheel(oracle);
  if (ttw && ttw.atoms.every(a => KNOWN.has(a.op))) {
    return makeProgram({ confidence: "high", atoms: ttw.atoms, xSpell: false, unparsedTail: null });
  }
  // ===== TWO-TARGET PUMP/DEBUFF (Leeching Bite / Consume Strength / Schismotivate) ===== "Target creature gets
  // +X/+Y … Another target creature gets -A/-B …" → ONE pump-pair atom (see matchTwoTargetPump). Collapsed up
  // front because the anaphoric "Another target creature" shatters the clause splitter. HIGH iff op KNOWN. Not X.
  const ttp = matchTwoTargetPump(oracle);
  if (ttp && ttp.atoms.every(a => KNOWN.has(a.op))) {
    return makeProgram({ confidence: "high", atoms: ttp.atoms, xSpell: false, unparsedTail: null });
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
  if (rtc) {
    // Router v2 may return the multi-atom shape ({atoms: [scry, router]} — the Windfall contract);
    // the single-atom branches keep {atom}. Every op must be KNOWN either way.
    const rtcAtoms = rtc.atoms || [rtc.atom];
    if (rtcAtoms.every((a) => KNOWN.has(a.op))) {
      return makeProgram({ confidence: "high", atoms: rtcAtoms, xSpell: false, unparsedTail: null });
    }
  }
  // ===== GISHATH / REVEAL-THAT-MANY-PUT-FILTERED ===== "reveal that many cards from the top … Put any number of
  // <subtype> creature cards … onto the battlefield and the rest on the bottom … in a random order." → ONE
  // reveal-put-filtered atom (count = combatDamageAmount; put every matching creature; bottom the rest random).
  // A two-sentence combat-damage payoff the clause splitter would shatter, so it's collapsed up front. The
  // countContext:"combatDamageAmount" referent gate keeps it native ONLY on a combat-damage event. HIGH iff the op
  // is KNOWN (it is — registered in libraryResolvers). Not an X spell.
  const rpf = matchRevealThatManyPutFiltered(oracle);
  if (rpf && KNOWN.has(rpf.atom.op)) {
    return makeProgram({ confidence: "high", atoms: [rpf.atom], xSpell: false, unparsedTail: null });
  }
  // ===== IMPULSE-EXILE-AND-PLAY ===== "Exile the top card of your library. You may play that card this turn."
  // → ONE impulse-exile atom (exile the top card face-up + stamp the this-turn play permission; the action
  // layer then offers a real full-cost cast / play-land from exile). The two-sentence effect would shatter
  // under the clause splitter (each half is individually unmatchable), so it's collapsed up front. HIGH iff the
  // op is KNOWN (it is — registered in libraryResolvers). Not an X spell.
  const iep = matchImpulseExilePlay(oracle);
  if (iep && KNOWN.has(iep.atom.op)) {
    return makeProgram({ confidence: "high", atoms: [iep.atom], xSpell: false, unparsedTail: null });
  }
  // ===== BLOOD-MONEY ===== "Destroy all creatures. For each nontoken creature destroyed this way, you create a
  // tapped Treasure token." → ONE mass-destroy-treasure-per-nontoken atom (the Treasure count is the nontoken
  // creatures actually destroyed, computed at resolution). The "can't be regenerated" rider (none on Blood
  // Money) is already stripped above; the atom inherits no cannotRegenerate. Not an X spell.
  const bm = matchMassDestroyTreasurePerNontoken(oracle);
  if (bm && KNOWN.has(bm.atom.op)) {
    return makeProgram({ confidence: "high", atoms: [bm.atom], xSpell: false, unparsedTail: null });
  }
  // ===== WINDFALL ===== "Each player discards their hand, then draws cards equal to the greatest number of cards
  // a player discarded this way." → [discard eachPlayer all recordMaxDiscarded, draw eachPlayer amountCount
  // maxDiscardedThisWay] (the draw count = the greatest whole-hand pitched, stamped at resolution). The variable
  // "greatest discarded" back-reference defeats the plain WHEEL rewrite (fixed-N only) + the clause splitter, so
  // it's collapsed up front. HIGH iff both atoms are KNOWN (they are — discard + draw). Not an X spell.
  const wf = matchWindfallMaxDiscard(oracle);
  if (wf && wf.atoms.every((a) => KNOWN.has(a.op))) {
    return makeProgram({ confidence: "high", atoms: wf.atoms, xSpell: false, unparsedTail: null });
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
  // ===== OPTIONAL-PRIMARY REFLEXIVE (CR 603.7) ===== "You may <primary>. When you do, <reflexive>." — the
  // reflexive fires ONLY if the OPTIONAL primary was taken. matchReflexiveTrigger rejects the optional primary
  // (a plain fold would over-fire on decline); this emits [optional-primary, reflexiveGate-payoff] where the
  // gated atoms run at resolution ONLY when the optional was accepted (runProgram / resolveOptionalChoice honor
  // reflexiveGate). Checked AFTER the mandatory matcher (shared anchor; this one requires the optional primary).
  const orfx = matchOptionalReflexiveTrigger(oracle, cardType, hasX);
  if (orfx) {
    return makeProgram({ confidence: "high", atoms: orfx.atoms, xSpell: false, unparsedTail: null });
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
  // ===== CUMULATIVE UPKEEP (CR 702.24) ===== the sentinel "cumulative upkeep {cost}" detectTriggers synthesizes
  // off the keyword → ONE cumulative-upkeep atom (add an age counter, scale the per-counter cost by the age total,
  // suspend on the shared pay-or-sacrifice choice). Disjoint anchor from every other fold, so order-free.
  const cuk = matchCumulativeUpkeep(oracle);
  if (cuk && KNOWN.has(cuk.atom.op)) {
    return makeProgram({ confidence: "high", atoms: [cuk.atom], xSpell: false, unparsedTail: null });
  }
  // ===== ECHO (BLITZ EC-1, CR 702.30) ===== the sentinel "echo {cost}" detectTriggers synthesizes off the
  // keyword → ONE echo atom (first-your-upkeep pay-or-sacrifice, echoDone-stamped). Disjoint anchor.
  const ech = matchEcho(oracle);
  if (ech && KNOWN.has(ech.atom.op)) {
    return makeProgram({ confidence: "high", atoms: [ech.atom], xSpell: false, unparsedTail: null });
  }
  // ===== TOLARIAN WINDS (BLITZ TW-1) ===== the whole-hand cycle, matched up front (see matchDiscardHandDrawSame).
  const dhd = matchDiscardHandDrawSame(oracle);
  if (dhd && KNOWN.has(dhd.atom.op)) {
    return makeProgram({ confidence: "high", atoms: [dhd.atom], xSpell: false, unparsedTail: null });
  }
  // ===== OPPONENT-PAYS-TO-DENY ===== "you may draw a card unless that player pays {N}" (Rhystic Study's trigger
  // effect) → ONE taxed-draw atom (the payer = the opponent who cast, from ctx.castingPlayerId; the beneficiary =
  // you). applyTaxedDraw suspends on the payer's pay/decline. Disjoint anchor from the folds above.
  const txd = matchTaxedDraw(oracle);
  if (txd && KNOWN.has(txd.atom.op)) {
    return makeProgram({ confidence: "high", atoms: [txd.atom], xSpell: false, unparsedTail: null });
  }
  // ===== OPPONENT-PAYS-TO-DENY (taxed-treasure) ===== "that player may pay {N}. If the player doesn't, you create
  // a Treasure token" (Smothering Tithe's trigger effect) → ONE taxed-treasure atom (the payer = the opponent who
  // drew, from ctx.drawingPlayerId; the beneficiary = you, who mints a Treasure on decline). applyTaxedTreasure
  // suspends on the payer's pay/decline. Checked pre-splitter (the two sentences would shatter). Disjoint anchor
  // ("that player may pay …" vs "you may draw a card unless …") from the taxed-draw fold above, so order-free.
  const txt = matchTaxedTreasure(oracle);
  if (txt && KNOWN.has(txt.atom.op)) {
    return makeProgram({ confidence: "high", atoms: [txt.atom], xSpell: false, unparsedTail: null });
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
  // The second argument injects THIS module's clause parser as a fallback lead resolver, so a
  // destroy-CREATURE lead (which destroyExileClauseParser does not own) can carry a controller rider. Guarded
  // to a single destroy/exile atom inside the matcher, and only reached when the existing lead parser
  // returned null — so no lead that resolves today changes path.
  const rcr = matchRemovalControllerRider(oracle, (lead) => parseEffectClause(lead, cardType, { hasX: false }));
  if (rcr) return collapsed(rcr);
  // REMOVAL + CASTER GAIN-LIFE — the "You gain life equal to its <toughness|mana value>." sibling of the fold
  // above. Same lead grammar and same pre-removal metric capture; only the BENEFICIARY differs (the caster,
  // not the target's controller). Tried after the controller fold — the two anchors are disjoint on their
  // subject word, so the order is documentation rather than precedence.
  const rcg = matchRemovalCasterGainLife(oracle, (lead) => parseEffectClause(lead, cardType, { hasX: false }));
  if (rcg) return collapsed(rcg);
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
      const xSpell = modal.modes.some(mode => mode.atoms.some(a => a.amountX || a.countX || a.targetCountX || a.ptX || a.filter?.mvCapX || a.mvCapX));
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
    const atom = parseClauseToAtom(cardType, clause, hasX, sourceScoped);
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
    const xSpell = seq.some(a => a.amountX || a.countX || a.targetCountX || a.ptX || a.filter?.mvCapX || a.mvCapX);
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
 * (CR 701.19) — indestructible (a separate replacement, CR 702.12b) is unaffected.
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

// The program-shape query family (programNeedsChosenTarget / atomTargetIntent / the AI
// programContains* heuristics …) moved to ./programQueries.js (decomposition slice 3 — a leaf over
// targetTypes.js). Re-exported below so every existing `from "./effects/parser.js"` import stays valid;
// programNeedsChosenTarget is also imported at the top of this file (assembly-time call sites).
export { programNeedsChosenTarget, programContainsCounter, PERMANENT_TARGET_TYPES, programContainsChosenPermanentRemoval, atomTargetIntent, programTriggerTargetsResolvable, modalChooseOneRoutable, programContainsMassRemoval, programContainsCreatureMassRemoval, programContainsTeamPump, teamPumpAmount, programContainsFog } from "./programQueries.js";

// ─── WAVE 1 clause-parser registration (see import note at the top) ────────────────────────────
// Wire the new-module clause parsers into the additive seam. Runs after CLAUSE_PARSERS + the
// register fn are defined (load-safe). Gives GLOBAL visibility: every importer of parser.js
// (runtime via gameEngine, the coverage metric via coverage.js, tests) sees these parsers, so
// "manifest dread" and "amass <Subtype> N" clauses resolve to their KNOWN atoms everywhere.
registerClauseParser(manifestClauseParser);
registerClauseParser(amassClauseParser);
registerClauseParser(monarchClauseParser);
registerClauseParser(selfReturnClauseParser);
registerClauseParser(earthbendReturnClauseParser); // EARTHBEND-RETURN (CR 603.7) — the [earthbend-return:zone] marker checkLeavesTriggers synthesizes for the animated land's dies/exile return
registerClauseParser(detainReturnClauseParser); // DETAIN-RETURN (DT-1, CR 610.3a) — the [detain-return] marker checkLeavesTriggers synthesizes when a detainer leaves
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
// CONNIVE + SUSPECT (BLITZ EK-1, CR 701.50 / 701.60) — the ETB action-keyword atoms. Whole-clause-anchored
// ("this creature connives" / "suspect this creature" / the chosen-target forms), reached only via the
// detectTriggers it/he/she + leading-"suspect it" rewrites or the printed target forms; every variable
// ("connives X"), anaphoric ("It connives" mid-program, "… and suspect it" token referents), or
// conditional ("If it's suspected …") form stays unmatched → LOW → Arbiter (CREED fail-closed).
registerClauseParser(conniveClauseParser);
registerClauseParser(suspectClauseParser);
// PROLIFERATE + GAIN-EXPERIENCE (seam batch 3) — migrated verbatim out of parseExtendedAtom into
// atoms/counters (co-located with applyProliferate / applyGainExperience). Whole-clause-anchored, so the
// inline→CLAUSE_PARSERS move is behavior-identical (proven byte-identical by program-fingerprint).
registerClauseParser(proliferateClauseParser);
registerClauseParser(gainExperienceClauseParser);
registerClauseParser(gainEnergyClauseParser); // ENERGY (CR 122.1e) — "you get {E}…" → add-energy atom
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
registerClauseParser(massBlockLockClauseParser); // MASS-BLOCK-LOCK (FT-1, the Falter class) — "creatures [without flying] can't block this turn" → one dynamic-selector cantBlock rule (CR 611.2c)
// PUMP (seam batch 12c / Wave B1b) — the most fragmented op (14 returns, 7 interleaved clusters) migrated to
// atoms/combat.pumpClauseParser; branch order preserved. program-diff = 0 (gate-verified).
registerClauseParser(pumpClauseParser);
// COND-X TEAM PUMP (Finale of Devastation) — "If X is N or more, creatures you control get +X/+X and gain KW
// until end of turn". Registered AFTER pumpClauseParser: the "if x is …" prefix matches no earlier parser
// (disjoint anchor), and the gated pump emits { op:"pump", condX:{min} } which applyPumpEffect no-ops below X.
registerClauseParser(condPumpXClauseParser);
registerClauseParser(groupGrantClauseParser); // GROUP-KEYWORD-GRANT — "(creatures|permanents) you control gain KW until end of turn"
registerClauseParser(setBasePtTeamClauseParser); // SET-BASE-PT-TEAM (Biomass Mutation) — "creatures you control have base power and toughness X/X until end of turn"
registerClauseParser(setBasePtTargetClauseParser); // SET-BASE-PT-TARGET (BLITZ SU-1 — Diminish / Square Up) — "target creature has base power and toughness N/N until end of turn"
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
registerClauseParser(evolveCounterSelfClauseParser); // KW-EVOLVE sentinel (SHELF S7) — the synthesized "[evolve] …" clause only
registerClauseParser(renownClauseParser); // KW-RENOWN sentinel (census slice 2026-07-25) — the synthesized "[renown] …" clause only
registerClauseParser(transferCountersClauseParser); // slice 37 — "put its counters on target creature you control" (dies LKI bag)
registerClauseParser(mobilizeClauseParser);    // KW-MOBILIZE sentinel — the synthesized "[mobilize] …" clause only
registerClauseParser(mobilizeSacClauseParser); // …and its CR 603.7 delayed sacrifice half
// ENDURE N (CR 701.63 — BLITZ KW-1) — the modal keyword action "it endures N" (bare, reminder stripped): N +1/+1
// counters on the source, or an N/N white Spirit token when the source has left. Self-scoped (no targetType) →
// routes native on triggers; "endure X" (variable) never matches → LOW → Arbiter. Distinct anchor → no overlap.
registerClauseParser(endureClauseParser);
registerClauseParser(removeNamedCounterSelfClauseParser); // ARIXMETHES — "remove a slumber counter from this creature" (cast trigger)
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
// ORDEAL THRESHOLD-SAC (BLITZ OC-1) — the [ordeal-threshold-sac] sentinel sentence, emitted ONLY by the
// detectTriggers Ordeal rewrite (attacks/equippedCreature descriptor whose whole effect matched the exact
// printed pair). Resolver in atoms/removal.applyOrdealThresholdSac: host at 3+ +1/+1 counters → the source
// Aura sacrifices itself through the shared sacrificeCreatureEffect chokepoint. No printed oracle text can
// produce the bracketed marker, so no earlier/later parser competes for it.
registerClauseParser(ordealThresholdSacClauseParser);
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
// GAIN-CONTROL (CR 613.1b layer-2 / 702.10c) — "Gain control of target creature." / "Gain control of target <Subtype>."
// (Sliver Overlord). INDEFINITE (non-reverting) control change only — the "(This effect lasts indefinitely.)"
// reminder is pre-stripped; a duration word ("until end of turn"), a controller/self-exclusion restriction, or
// a non-curated word after "target" fails the anchored matcher → LOW → Arbiter (CREED). The subtype rides as a
// {kind:"subtype"} target restriction (enumerateTargets enforces it), and applyGainControl moves the permanent
// to the new controller's battlefield summoning-sick. Whole-clause anchored — matches no earlier parser.
registerClauseParser(gainControlClauseParser);
registerClauseParser(becomeCopyClauseParser); // BECOME-COPY (CR 613.1a/707.9) — riders reuse parseCloneRider; unmodelled rider -> null -> Arbiter
registerClauseParser(grantUntilEotClauseParser); // UNTIL-EOT QUOTED GRANT (TG-1) — body-validated via the injected grant validators

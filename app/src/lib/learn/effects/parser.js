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
import { matchHandDisruption, parseControllerRider, matchRemovalControllerRider, matchRemovalDamageRider, matchCounterControllerRider, matchCounterExileInstead, matchCounterZoneRedirect, matchImpulseDig, matchReorderTop, matchDigLandToBattlefield, matchLookTopTake, matchChooseTypeDraw } from "./spanMatchers.js"; // up-front multi-sentence span matchers (slice 4) — definitions only; the dispatch ORDER stays in parseEffectClauseImpl below
import { extractAdditionalCosts, extractAltCost, stripSelfCostReduction, stripStormKeywordLine, stripDevoidLine, stripSelfShuffleIntoLibrary, stripReboundLine, SUPPORTED_ADDITIONAL_COST_KINDS, SUPPORTED_ALT_COST_KINDS } from "./castModifiers.js"; // cast-cost extraction + disposition strips (slice 5) — zero-import leaf; the SUPPORTED_* kind sets feed programConfidence's LOW-until-vetted cost gates
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
import { createNamedTokenClauseParser, createTokenClauseParser } from "./atoms/tokens.js";
import { monarchClauseParser } from "./atoms/monarch.js"; // MONARCH (CR 725)
import { sacrificeEdictClauseParser, destroyExileClauseParser, ordealThresholdSacClauseParser } from "./atoms/removal.js"; // seam batch 21 (sacrifice edicts) + 27 (destroy⇄exile, rider-folding) + OC-1 (Ordeal threshold-sac sentinel)
import { sacrificeLandClauseParser } from "./atoms/sacLand.js"; // SAC-LAND-RAMP — "Sacrifice a land." controller self-sac (Roiling Regrowth / Cycle of Renewal)
import { parseDestroyTokenRider } from "./atoms/destroyTokenRider.js"; // DESTROY-TOKEN-RIDER — Pongify / Rapid Hybridization (destroy creature + can't-regen + that controller makes a token)
import { exploreClauseParser, libraryKeywordClauseParser, millClauseParser, tutorClauseParser, cascadeClauseParser } from "./atoms/library.js"; // seam batch 1 (explore) + 6 (discover/shuffle/scry/surveil) + 11 (mill) + 12e (tutor) + CASCADE (CR 702.85, synthesized keyword sentinel)
import { putFromHandClauseParser } from "./atoms/putFromHand.js"; // PUT-FROM-HAND — "put a/N/any number of creature|permanent card(s) from your hand onto the battlefield" (reuses the tutor sourceZone:"hand"→battlefield seam)
import { parseTutorFilter, parseTokenKeywords, parseGrantedKeywords, SMALL_NUM, parseCountSource } from "./parseHelpers.js"; // seam batch 2/4/19: shared parse helpers in a leaf (matchers import cycle-free); parseTutorFilter (rd block) + parseTokenKeywords (token-keyword matcher); parseGrantedKeywords (COUNTER-THEN-GRANT); SMALL_NUM for MULTI-COUNT damage count words; parseCountSource for FE-1 DRAIN-BY-COUNT fused matcher
import { proliferateClauseParser, gainExperienceClauseParser, gainEnergyClauseParser, radClauseParser, cdmgPayoffClauseParser, addCounterClauseParser, addNamedCounterSelfClauseParser, removeNamedCounterSelfClauseParser, shieldCounterClauseParser, evolveCounterSelfClauseParser, endureClauseParser } from "./atoms/counters.js"; // seam batch 3 (proliferate/gain-experience) + 13 (rad) + 25 (add-counter ±1/+1) + CHOSEN-TYPE (named counter on self artifact) + ARIXMETHES (remove named counter from self) + SHIELD-COUNTER (CR 122.1c protective counter) + KW-EVOLVE sentinel (SHELF S7)
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
import { staticAbilitiesCoverCard, parseStaticAbilities } from "../staticAbilityParser.js";
import { detectTriggers, registerTriggerDetector } from "../triggers.js";
import { parseKickerCost } from "../kicker.js"; // KICKED-SPELL-EFFECT — a clean single-mana Kicker cost (no multikicker / and-or / {X}); kicker.js → parseHelpers.js → keywords.js is acyclic (parser already imports parseHelpers)
import { spellConditionParseable } from "../interveningIf.js"; // CONDITIONAL SPELL RIDER (BLITZ CD-1) — the spell-side shape gate (a board condition a resolving spell can read); interveningIf → gameState is a leaf edge, no cycle (parser is not imported by either)

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
const ONCE_PER_TURN_HONORED = new Set(["discover", "draw", "gain-life", "create-token"]);

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
    const cond = s.match(/^if (.+?), (.+)$/i);
    if (cond && spellConditionParseable(cond[1])) {
      // Once the condition is spell-readable (and splitClauses kept the sentence whole for exactly this), the
      // clause is COMMITTED to the conditional model — every failure below returns null (the card parks → low
      // → Arbiter), NEVER falls through to the legacy parse, which could match the gated verb and SILENTLY DROP
      // the condition (a forbidden FP). A multi-instruction gated effect (top-level " and "/", then ") parks.
      const gated = cond[2];
      if (/\s+\band\b\s+|,\s+then\s+/i.test(gated)) return null; // multi-atom gated rider → park (this slice)
      const inner = parseClauseToAtom(cardType, gated, hasX);
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
    if (cond && spellConditionParseable(cond[2])) {
      const gated = cond[1];
      if (/\s+\band\b\s+|,\s+then\s+/i.test(gated)) return null; // compound / scope-ambiguous left side → park (this slice)
      const inner = parseClauseToAtom(cardType, gated, hasX);
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
  const m = cb ? null : stripped.match(MODAL_RE);
  if (!cb && !m) return null;
  const tail = cb ? "" : (m[2] || "").toLowerCase();
  const orBoth = tail === " or both";
  const orMore = tail === " or more"; // "choose one or more" → MODAL-N (any non-empty subset, CR 700.2)
  const conditionalBothCommander = !!cb;
  const rest = stripped.slice((cb || m)[0].length).trim();
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
  const chooseCount = orMore ? parts.length : (orBoth || conditionalBothCommander || (m && m[1].toLowerCase() === "two")) ? 2 : 1;
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
  if (chooseCount > modes.length) return { chooseCount, upTo, atLeastOne, modes: null };
  if ((orBoth || conditionalBothCommander) && modes.length !== 2) return { chooseCount, upTo, atLeastOne, modes: null };
  return { chooseCount, upTo, atLeastOne, ...(conditionalBothCommander && { conditionalBothCommander: true }), modes };
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
  const { body: oracle, rebound } = stripReboundLine(shuffleBody);
  // Stamp `selfShuffle` / `selfExile` on the produced program WITHOUT reconstructing it (preserve every field —
  // additionalCosts / altCost / xSpell / modal — that later lines may have attached). Only a HIGH program is
  // flagged: a LOW body (unmodeled family member) routes to the Arbiter, which disposes the spell itself, so
  // the flag would be inert there anyway. Mutating the returned object is safe (it's freshly built per call).
  // selfShuffle and selfExile are mutually exclusive in the corpus (no card both shuffles-self and rebounds).
  const stamp = (p) => {
    if (selfShuffle && p && programConfidence(p) === "high") p.selfShuffle = true;
    if (rebound && p && programConfidence(p) === "high") p.selfExile = true;
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
  // "that card" / "the card" / "it" — the printed wordings for the just-revealed card (Yuriko prints "that
  // card"). The drain recipient is either EACH OPPONENT (Yuriko, the Tiger's Shadow) or YOU (Dark Confidant /
  // Dark Tutelage — "you lose life equal to its mana value" → the CONTROLLER loses, applyLoseLife's default
  // branch). Whole-clause-anchored ^…$ like every fused matcher here — any rider ("unless you pay", an Offspring
  // keyword line, a "then" follow-on) leaves residue → null → low → Arbiter (CREED whole-effect).
  const m = s.match(/^reveal the top card of your library and put (?:that card|the card|it) into your hand\. (each opponent loses|you lose) life equal to (?:that card's|the card's|its) mana value$/);
  if (!m) return null;
  const who = m[1] === "you lose" ? "controller" : "eachOpponent";
  return { atoms: [
    { op: "reveal-top-to-hand", targetType: null },
    { op: "lose-life", who, amountCount: { kind: "revealedCardMV", per: 1 }, targetType: null },
  ] };
}

// REANIMATE-DRAIN (Reanimate, Grave Researcher // Reanimate) — "Put target creature card from a graveyard onto
// the battlefield under your control. You lose life equal to that card's mana value." The two sentences span a
// mid-resolution value the reanimate produces (the reanimated card's MV), so they'd shatter under the clause
// splitter — collapsed up front like the Yuriko/Dark-Confidant reveal-top-drain, reusing the SAME stamp slot:
// the reanimate atom (stampMv) records state.revealedCardMV = the reanimated card's MV, and the lose-life reads
// it (amountCount revealedCardMV, who:"controller" — YOU lose). HIGH iff both ops KNOWN (they are) AND the
// reanimate precedes the drain (revealTopSequenceOk, now stamper-aware). Whole-clause anchored — any rider → LOW.
function matchReanimateDrain(oracle) {
  const s = stripReminder(oracle).trim().toLowerCase().replace(/[’]/g, "'").replace(/\s+/g, " ").replace(/\.$/, "");
  if (!/^put target creature card from a graveyard onto the battlefield under your control\. you lose life equal to (?:that card's|the card's|its) mana value$/.test(s)) return null;
  return { atoms: [
    { op: "reanimate", targetType: "graveyardCard", cardFilter: "creature", anyGraveyard: true, stampMv: true },
    { op: "lose-life", who: "controller", amountCount: { kind: "revealedCardMV", per: 1 }, targetType: null },
  ] };
}

/**
 * ===== DRAIN-BY-COUNT (BLITZ FE-1, CR 107.3b + 119.3) ===== the count-scaled "deal-and-gain" drain family:
 * "<source> deals X damage to <target> and you gain X life, where X is [equal to] the number of <count source>."
 * (Tendrils of Corruption — Swamps → target creature; Consuming Corruption — Swamps → target creature or
 * planeswalker; Harsh Sustenance — creatures you control → any target.) The single "where X is the number of
 * <count>" governs BOTH the damage AND the lifegain (CR templating), so X is one value locked ONCE as the spell
 * resolves (CR 107.3b) — but the top-level " and " split would shatter this into ["deals X damage to <target>"
 * (NO amount — the count rides the SECOND half) and "you gain X life, where X is the number of <count>"], and
 * BOTH fragments then fail their anchors (the damage clause has no count; a bare "gain X life where X is the
 * number of" gain-life clause isn't modeled). So match the WHOLE compound up front and emit BOTH atoms directly,
 * exactly like matchDiesGainDrawByPower's shared-magnitude gain+draw.
 *
 * CREED — X LOCKED ONCE (the off-by-one guard): the gain-life atom is emitted FIRST, the deal-damage atom
 * SECOND. Gaining life NEVER mutates a permanent count, so the gain-life atom reads the count off the PRE-damage
 * board; the deal-damage atom then reads the SAME count (the gain didn't change the board) — so both bind the
 * identical value even when the target is your own creature and the count is "creatures you control" (Harsh
 * Sustenance), where the damage could otherwise drop the count by one if computed AFTER. A triggered lifegain
 * ability doesn't resolve between atoms (CR 603.3b — it waits until the whole spell finishes), so the pre-damage
 * board read is exact. Both atoms carry amountCount:{...src, per:1} → resolveScaledAmount/countForSpec computes
 * the controller board count at resolution.
 *
 * The count source is the SHARED parseCountSource leaf with DEFAULT (controller-scoped) opts — an opponent-/
 * target-scoped count ("creatures they control") has no anaphoric referent on a controller drain, so it returns
 * null → no match → low → Arbiter (a SAFE FN, never a mis-scoped count). Whole-string anchored ^…$ (the leading
 * `.+?` consumes the source-name reference exactly like dealDamageScaledClauseParser) — any rider leaves residue
 * → no match → low → Arbiter (CREED). Only the TIGHT damage-target allowlist (the fully-modeled bare forms) is
 * admitted so a restricted target never mis-resolves to the unrestricted set. Returns { atoms }.
 *
 * NOT modeled here (SAFE FN parks): the "deals damage … equal to the number of <count>. You gain life equal to
 * the DAMAGE DEALT this way." phrasing (Corrupt) — its lifegain is the ACTUAL damage dealt (a mid-resolution
 * value, sensitive to prevention), a different mechanism than the count-defined "gain X life" here.
 */
function matchDrainByCount(oracle) {
  const s = stripReminder(oracle).trim().toLowerCase().replace(/[’]/g, "'").replace(/\s+/g, " ").replace(/\.$/, "");
  const DRAIN_TARGET = {
    "any target": "any", "target creature": "creature",
    "target creature or planeswalker": "creatureOrPlaneswalker",
  };
  const m = s.match(/^.+? deals? x damage to (any target|target creature|target creature or planeswalker) and you gain x life, where x is (?:equal to )?the number of (.+)$/);
  if (!m) return null;
  const targetType = DRAIN_TARGET[m[1]];
  const src = parseCountSource(m[2]); // DEFAULT opts — controller-scoped counts only (a "they control"/"that player" scope has no referent here)
  if (!targetType || !src) return null;
  return { atoms: [
    // gain-life FIRST — reads the count off the pre-damage board so both atoms bind the identical locked X (CR 107.3b).
    { op: "gain-life", amountCount: { ...src, per: 1 }, targetType: null },
    { op: "deal-damage", targetType, amountCount: { ...src, per: 1 } },
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
 * ===== GISHATH / REVEAL-THAT-MANY-PUT-FILTERED ===== a COMBAT-DAMAGE trigger's payoff (NOT an {X} spell): "reveal
 * that many cards from the top of your library. Put any number of <SUBTYPE> creature cards from among them onto the
 * battlefield and the rest on the bottom of your library in a random order." (Gishath, Sun's Avatar — Dinosaur;
 * Pantlaza). "that many" = the combat damage this trigger dealt (countContext:"combatDamageAmount"); the referent
 * gate (combatDamageReferentSatisfied) keeps this native ONLY on a combat-damage event, so a non-combat trigger
 * can't route here and silently drop. Whole-clause anchored: any different disposition ("into your graveyard", no
 * "random order"), a missing subtype, or a non-"creature" put fails the exact anchor → low → Arbiter (CREED FN-safe).
 * The subtype is captured (group 1, single word) and folded into an AND-group filter with "creature" so
 * cardMatchesTutorFilter admits a card whose front-face type line names BOTH (e.g. "Creature — Dinosaur"). The op
 * is KNOWN (registered in libraryResolvers), so the caller emits a HIGH single-atom program. Returns { atom }.
 */
function matchRevealThatManyPutFiltered(oracle) {
  const s = stripReminder(oracle).trim().toLowerCase().replace(/[’]/g, "'").replace(/\s+/g, " ").replace(/\.$/, "");
  const m = s.match(
    /^reveal that many cards from the top of your library\. put any number of ([a-z]+) creature cards from among them onto the battlefield and the rest on the bottom of your library in a random order$/,
  );
  if (!m) return null;
  const subtype = m[1].trim(); // "dinosaur" — a creature subtype word
  if (!subtype) return null;
  // Filter = a creature card whose front-face type line names the subtype. cardMatchesTutorFilter ANDs a group's
  // words against the type line, so ["dinosaur","creature"] requires BOTH — "Creature — Dinosaur" matches; an
  // instant/sorcery (no "creature") never does. A bogus subtype simply matches nothing (put 0 — never fabricated).
  const filter = { groups: [[subtype, "creature"]] };
  return { atom: { op: "reveal-put-filtered", filter, countContext: "combatDamageAmount", filterLabel: `${subtype} creature card`, targetType: null } };
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
  // The original fused Lurking Predators shape — param-free atom, byte-identical legacy resolver branch.
  if (/^reveal the top card of your library\. if it's a creature card, put it onto the battlefield\. otherwise, you may put that card on the bottom of your library$/.test(s)) {
    return { atom: { op: "reveal-top-conditional", targetType: null } };
  }
  // ===== TOP-CARD ROUTER (the parameterized family) ===== "[Scry N, then ]Reveal the top card of your
  // library. If it's a <TYPE> card, put it <onto the battlefield[ tapped]|into your hand|into your
  // graveyard>. Otherwise, <put <it|that card> into your <graveyard|hand>|put it onto the battlefield[
  // tapped]|draw a card>." (Zoologist / Call of the Wild: creature→battlefield else graveyard; Neurok
  // Familiar: artifact→hand else graveyard; Thrasios, Triton Hero: scry 1, then land→battlefield TAPPED
  // else draw a card.) Both branches map through REVEAL_THEN/REVEAL_ELSE — a CLOSED route vocabulary
  // (each key resolves to a real modeled atom: put-onto-battlefield tapped/untapped rides
  // enterCardFromZone and fires ETB, put-into-hand/graveyard rides moveCardToZone and is NEITHER a draw
  // nor a mill, draw is a REAL draw). Exact-anchored ^…$ like every fused matcher here — a "you may"
  // then-branch (Matter Reshaper), an MV cap, a name-match predicate (Candles of Leng), a "then shuffle"
  // rider, or ANY other variant leaves residue → null → low → Arbiter (CREED whole-effect). An optional
  // leading "Scry N, then " prepends a REAL scry atom (returned as the {atoms} multi-atom shape, same as
  // the no-else rt2 branch below).
  const rt = s.match(/^(?:scry (\d+), then )?reveal the top card of your library\. if it's an? (creature|artifact|land|enchantment) card, put it (onto the battlefield tapped|onto the battlefield|into your hand|into your graveyard)\. otherwise, (?:put (?:it|that card) (into your graveyard|into your hand|onto the battlefield tapped|onto the battlefield)|(draw a card))$/);
  if (rt) {
    const REVEAL_ROUTE = { "onto the battlefield tapped": "battlefield-tapped", "onto the battlefield": "battlefield", "into your hand": "hand", "into your graveyard": "graveyard" };
    const router = { op: "reveal-top-conditional", targetType: null, predicate: rt[2], thenRoute: REVEAL_ROUTE[rt[3]], elseRoute: rt[5] ? "draw" : REVEAL_ROUTE[rt[4]] };
    if (rt[1]) return { atoms: [{ op: "scry", amount: parseInt(rt[1], 10), targetType: null }, router] };
    return { atom: router };
  }
  // NO-ELSE forms (router v2): "Reveal the top card of your library. If it's a <T1>[ or <T2>] card,
  // <put it into your hand|draw a card>." — the absent otherwise-branch is CR-literal: nothing happens,
  // the revealed card STAYS ON TOP (elseRoute:"leave", a logged no-op). thenRoute "draw" is a REAL draw
  // (Track Down "draw a card" — applyDrawEffect, draw triggers fire; the opposite of the put-into-hand
  // rule). The OR-predicate ("creature or land" — Track Down) is a union test. An optional leading
  // "Scry N, then " (Llanowar Empath / Track Down) prepends a REAL scry atom (the same pause/resume
  // machinery any multi-atom program uses); returned as {atoms} (the Windfall multi-atom shape).
  const rt2 = s.match(/^(?:scry (\d+), then )?reveal the top card of your library\. if it's an? (creature|artifact|land|enchantment)(?: or (creature|artifact|land|enchantment))? card, (put it into your hand|draw a card)$/);
  if (rt2) {
    const router = { op: "reveal-top-conditional", targetType: null, predicate: rt2[2], thenRoute: rt2[4] === "draw a card" ? "draw" : "hand", elseRoute: "leave" };
    if (rt2[3]) router.predicates = [rt2[2], rt2[3]];
    if (rt2[1]) return { atoms: [{ op: "scry", amount: parseInt(rt2[1], 10), targetType: null }, router] };
    return { atom: router };
  }
  return null;
}

/**
 * ===== IMPULSE-EXILE-AND-PLAY ===== "Exile the top card of your library. You may play that card this turn."
 * (Professional Face-Breaker's sac-Treasure activated ability; the Light Up the Stage / impulse-draw family).
 * A TWO-sentence effect: the "exile the top card" half and the "you may play that card this turn" permission
 * half are ONE modeled unit — the clause splitter would shatter them into individually-unmatchable fragments
 * ("exile the top card of your library" alone is not a modeled atom; "you may play that card this turn" is a
 * bare back-reference to the exiled card). So it's collapsed up front to ONE `impulse-exile` atom whose
 * resolver (applyImpulseExileAtom) moves the top card to exile FACE-UP + stamps the this-turn play permission,
 * which the ACTION layer (legalChoices.actionsPlayImpulseFromExile) then genuinely OFFERS + ENFORCES (a real
 * full-cost cast / play-land from exile, this turn only, cleared at cleanup) — never a parse-only marker.
 *
 * ALLOWLIST (CREED whole-effect, anchored ^…$ on the exact two-sentence shape, apostrophe/whitespace normalized,
 * trailing period stripped): the referent-pronoun variants "that card" / "it" and the duration phrasings
 * "this turn" / "until end of turn". Any rider / variant — a COUNT ("the top TWO cards"), a mana-value cap, an
 * IMPRINT / another-zone ("from your graveyard"), a cost rider ("you may play that card. If you do, …"), or a
 * different owner's library — leaves residue → no match → low → Arbiter (never a partial). The op is KNOWN
 * (registered in libraryResolvers), so the caller emits a HIGH single-atom program. Returns { atom }.
 */
function matchImpulseExilePlay(oracle) {
  const s = stripReminder(oracle).trim().toLowerCase().replace(/[’]/g, "'").replace(/\s+/g, " ").replace(/\.$/, "");
  // BOTH clause orders map to the SAME this-turn impulse-exile atom (the duration is identical — "this turn"
  // = "until end of turn"), only the anchor differed: the duration can trail the permission ("you may play
  // that card until end of turn" — Professional Face-Breaker) OR LEAD it ("Until end of turn, you may play
  // that card" — Abbot of Keral Keep, Experimental Synthesizer, Stromkirk Occultist, Irascible Wolverine).
  // The leading-duration form ONLY accepts the bare "until end of turn" phrasing — a "until the end of your
  // NEXT turn" two-turn window is a DIFFERENT effect the this-turn `_impulseTurn` stamp can't model, so it
  // stays unmatched → Arbiter (a SAFE false-negative, never a mis-modeled window; CREED whole-effect).
  if (!/^exile the top card of your library\. (?:you may play (?:that card|it)(?: this turn| until end of turn)|until end of turn, you may play (?:that card|it))$/.test(s)) {
    return null;
  }
  return { atom: { op: "impulse-exile", targetType: null } };
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

/**
 * ===== WINDFALL (max-discarded wheel) ===== "Each player discards their hand, then draws cards equal to the
 * greatest number of cards a player discarded this way." (Windfall, Whispering Madness' base body). A ONE-
 * sentence discard-then-draw where the draw count is the GREATEST number any player discarded — a back-
 * reference to the discard step that just resolved (CR 118.10 "this way"). The plain WHEEL rewrite (§the
 * splitClauses fold above) only handles a FIXED "draws N cards" tail; this variable "greatest discarded" count
 * has no standalone count source, so the ", then" split would orphan it → low. Collapse the whole compound up
 * front to TWO atoms in fixed order:
 *   1. discard who:eachPlayer all:true recordMaxDiscarded — every player pitches their whole hand (no choice,
 *      resolved inline — see applyDiscard), and the resolver stamps state.maxDiscardedThisWay = the greatest
 *      whole-hand size it pitched (the exact "greatest number of cards a player discarded this way").
 *   2. draw who:eachPlayer amountCount:{kind:"maxDiscardedThisWay"} — every player draws that stamped max
 *      (countForSpec reads state.maxDiscardedThisWay, the inter-atom channel — mirrors Yuriko's revealedCardMV /
 *      the dice-roll diceResult mid-resolution value capture).
 * The two atoms are emitted TOGETHER (never independently parseable), so the record-then-read order is
 * structurally guaranteed — the draw can never read a stale/absent max. Anchored ^…$ on the exact printed
 * shape; a rider (Whispering Madness' Cipher line is a SEPARATE line, so the anchored single-sentence match
 * fails on the multi-line oracle → the whole card stays Arbiter — a SAFE false-negative) leaves residue → no
 * match → low → Arbiter (CREED). Not an X spell. Returns { atoms }.
 */
function matchWindfallMaxDiscard(oracle) {
  const s = stripReminder(oracle).trim().toLowerCase().replace(/\s+/g, " ").replace(/\.$/, "");
  if (!/^each player discards their hand, then draws cards equal to the greatest number of cards a player discarded this way$/.test(s)) return null;
  return { atoms: [
    { op: "discard", who: "eachPlayer", all: true, recordMaxDiscarded: true, targetType: null },
    { op: "draw", who: "eachPlayer", amountCount: { kind: "maxDiscardedThisWay", per: 1 }, targetType: null },
  ] };
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
 * ===== CUMULATIVE UPKEEP (CR 702.24) ===== the SENTINEL effect clause detectTriggers synthesizes off the
 * "Cumulative upkeep {cost}" KEYWORD (whose real triggered ability — "At the beginning of your upkeep, put an
 * age counter …, then sacrifice it unless you pay its upkeep cost for each age counter on it." — lives entirely
 * in reminder parens, the Bushido/Afflict precedent). The synthesized effectClause is the bare "cumulative
 * upkeep {cost}"; this maps it to the single `cumulative-upkeep` pausing atom that (at fire time) adds one age
 * counter, scales the printed per-counter cost by the age-counter total, and suspends on the shared sac-unless-
 * pay pay-or-sacrifice choice. CREED guards: a FIXED, PURE generic/colored mana cost only — parseFixedManaPips
 * rejects {X}/snow, and we additionally reject a hybrid cost (mana.hybrid.length) because the per-counter
 * scaling can't faithfully duplicate a hybrid pip's either/or option. An unmodeled cost → null → the synthesized
 * trigger routes LOW → the whole card stays body-only/Arbiter (SAFE FN). NEVER fabricates — this only recognizes
 * the sentinel string detectTriggers itself produces.
 */
function matchCumulativeUpkeep(oracle) {
  const s = stripReminder(oracle).trim().replace(/\.$/, "");
  const m = s.match(/^cumulative upkeep\s+(\{[^}]+\}(?:\{[^}]+\})*)$/i);
  if (!m) return null;
  const pips = (m[1].match(/\{([^}]+)\}/g) || []).map((p) => p.slice(1, -1));
  if (!pips.length) return null;
  const mana = parseFixedManaPips(pips);
  if (!mana) return null; // {X} / snow / unknown symbol → unmodeled cost
  if (Array.isArray(mana.hybrid) && mana.hybrid.length) return null; // a hybrid per-counter cost can't be faithfully scaled → SAFE FN
  return { atom: { op: "cumulative-upkeep", cost: { kind: "mana", mana }, targetType: null } };
}

/**
 * ===== ECHO (BLITZ EC-1, CR 702.30) ===== the SENTINEL "echo {cost}" detectTriggers synthesizes off the
 * keyword (whose triggered ability — "At the beginning of your upkeep, if this came under your control since
 * the beginning of your most recent upkeep, sacrifice it unless you pay its echo cost." — lives entirely in
 * reminder parens, the cumulative-upkeep precedent). Maps to the single `echo` pausing atom: the resolver
 * fires the pay-or-sacrifice ONCE (the permanent's echoDone flag replaces the came-under-control-since
 * intervening-if — for a permanent that stays under one controller, "first of your upkeeps since it entered"
 * ⟺ "echoDone not yet stamped", exactly CR 702.30c's one-payment semantics) and every later upkeep no-ops.
 * A hybrid cost DOES pay faithfully here (no per-counter scaling — the fixed printed cost), but the shared
 * sac-unless-pay payer treats mana as fixed pips, so keep the SAME pure-cost gate as cumulative upkeep:
 * {X}/snow/hybrid → null → LOW → the whole card stays body-only (a SAFE FN). Only recognizes the sentinel
 * detectTriggers itself produces.
 */
function matchEcho(oracle) {
  const s = stripReminder(oracle).trim().replace(/\.$/, "");
  const m = s.match(/^echo\s+(\{[^}]+\}(?:\{[^}]+\})*)$/i);
  if (!m) return null;
  const pips = (m[1].match(/\{([^}]+)\}/g) || []).map((p) => p.slice(1, -1));
  if (!pips.length) return null;
  const mana = parseFixedManaPips(pips);
  if (!mana) return null;
  if (Array.isArray(mana.hybrid) && mana.hybrid.length) return null;
  return { atom: { op: "echo", cost: { kind: "mana", mana }, targetType: null } };
}

/**
 * ===== TOLARIAN WINDS (BLITZ TW-1) ===== "Discard [all the cards in] your hand, then draw that many
 * cards." — the whole-hand cycle as ONE composite atom (hand.applyDiscardHandDrawSame). Matched up front
 * on the WHOLE stripped oracle (the ", then" span would be shattered by splitClauses, and the bare "draw
 * that many cards" tail would mis-bind to the combat-damage countContext — the exact latent gun this
 * composite disarms for the known wordings). Any extra line (flashback / retrace / a rider) breaks the
 * whole-oracle match → LOW → Arbiter (a safe FN).
 */
function matchDiscardHandDrawSame(oracle) {
  const s = stripReminder(oracle).trim().replace(/\.$/, "");
  if (/^discard (?:all the cards in )?your hand, then draw that many cards$/i.test(s)) {
    return { atom: { op: "discard-hand-draw-same", targetType: null } };
  }
  return null;
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
 * ===== OPPONENT-PAYS-TO-DENY (taxed-treasure, CR 603.7c) ===== the effect clause of a "Whenever an opponent draws
 * a card, that player may pay {N}. If the player doesn't, you create a Treasure token." trigger (Smothering Tithe).
 * The PAYER is the opponent who drew (bound at resolution from ctx.drawingPlayerId, threaded by checkCardDrawnTriggers);
 * the BENEFICIARY is the trigger's controller (you) — on decline/can't-afford YOU create a functional Treasure token
 * (the minted Treasure carries "{T}, Sacrifice: Add one mana of any color", so the mana model can tap it). Mirrors
 * matchTaxedDraw exactly but with a create-Treasure decline-payoff instead of a draw. A FIXED mana cost only ({X} /
 * unknown symbol → parseFixedManaPips null → unmodeled, SAFE FN). Anchored to the WHOLE two-sentence effect; a scaled
 * ("that many Treasure tokens") or filtered variant leaves residue → null → the clause stays LOW → Arbiter.
 */
function matchTaxedTreasure(oracle) {
  const s = stripReminder(oracle).trim().replace(/[’]/g, "'").replace(/\.$/, "");
  const m = s.match(/^that player may pay (\{[^}]+\}(?:\{[^}]+\})*)\. if the player doesn't, you create a treasure token$/i);
  if (!m) return null;
  const pips = (m[1].match(/\{([^}]+)\}/g) || []).map((p) => p.slice(1, -1));
  if (!pips.length) return null;
  const mana = parseFixedManaPips(pips);
  if (!mana) return null; // {X} / unknown symbol → unmodeled cost
  return { atom: { op: "taxed-treasure", cost: { kind: "mana", mana }, targetType: null } };
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

// PUMP-THEN-FIGHT (Epic Confrontation / Ruthless Predation / Savage Smash / Swift Kick / Wild Instincts /
// Chelonian Tackle) — "Target creature you control gets +X/+Y until end of turn. [Then ]It fights [up to one ]
// target creature you don't control / an opponent controls." The chosen "target creature you control" is BOTH
// the pump recipient AND the fighter ("It" is anaphoric to it), and the enemy is the second chosen target. The
// two sentences shatter under the clause splitter: the standalone "It fights …" clause parses as a SOURCE-bound
// `fight` atom (fighter = ctx.sourceId), but a spell threads no sourceId → the fight silently no-ops — the exact
// case the fightAtomMisplaced gate deliberately forces LOW. Collapse it up front into ONE `fight-pair` atom
// (the same two-chosen-target shape as Prey Upon, so targeting enumerates the you-control fighter + enemy
// dealee) carrying `fighterPump {X,Y}`; applyFightPair applies the +X/+Y (until end of turn, CR 611.2c) to the
// chosen fighter BEFORE locking powers, so the pumped power deals more and the pumped toughness survives the
// return damage. HIGH iff the op is KNOWN (fight-pair is). A filtered ("green creature"), rider ("When excess
// damage …"), modal, or cost-prefixed variant fails the exact anchor → falls through → LOW → Arbiter (CREED).
function matchPumpThenFight(oracle) {
  const t = stripReminder(oracle).toLowerCase().replace(/[’]/g, "'").replace(/\s+/g, " ").trim().replace(/\.\s*$/, "");
  const m = t.match(/^target creature you control gets \+(\d+)\/\+(\d+) until end of turn\. (?:then )?it fights (up to one )?target creature (?:you don't control|an opponent controls)$/);
  if (!m) return null;
  const power = parseInt(m[1], 10), toughness = parseInt(m[2], 10);
  const upToOne = !!m[3];
  // Reuse the canonical fight-pair (form a) shape so the targeting roles/restrictions stay in sync, then attach
  // the fighter pump. Both enemy phrasings map to the same opponent restriction in form a.
  const fp = fightClauseParser(`target creature you control fights ${upToOne ? "up to one " : ""}target creature you don't control`);
  if (!fp || fp.op !== "fight-pair") return null;
  return { atoms: [{ ...fp, fighterPump: { power, toughness } }] };
}

// UNTAP-THEN-PUMP (Ornamental Courage / Inspirit / Gerrard's Command / Spidery Grasp / Aim High / Steady Aim) —
// "Untap target creature. It gets +X/+Y [and gains reach] until end of turn." The "It" is anaphoric to the
// untap's target, so the clause splitter would shatter it into [untap, <anaphoric pump>] where the pump clause
// alone parses LOW (no bound referent). But untap-then-pump on the SAME single creature is order-independent —
// a pump atom already carries an `untap:true` flag (applyPumpEffect untaps its target after the buff), so this
// collapses UP FRONT into ONE pump atom carrying that flag (identical to the shipped "…until end of turn. Untap
// it." reverse-order form). The reach rider maps to the grantable-keyword grant (reach is grant-verified — Vines
// of the Recluse). A different granted keyword, a second target, or any other rider fails the exact anchor →
// falls through → LOW → Arbiter (CREED). Not an X spell.
function matchUntapThenPump(oracle) {
  const t = stripReminder(oracle).toLowerCase().replace(/[’]/g, "'").replace(/\s+/g, " ").trim().replace(/\.\s*$/, "");
  const m = t.match(/^untap target creature\. it gets \+(\d+)\/\+(\d+)( and gains reach)? until end of turn$/);
  if (!m) return null;
  const atom = { op: "pump", targetType: "creature", ptDelta: { p: parseInt(m[1], 10), t: parseInt(m[2], 10) }, untap: true };
  if (m[3]) atom.grantKeywords = ["Reach"];
  return { atoms: [atom] };
}

// TWO-TARGET PUMP/DEBUFF (Leeching Bite / Consume Strength / Schismotivate) — "Target creature gets +X/+Y until
// end of turn. Another target creature gets -A/-B until end of turn." Two DISTINCT chosen creatures; the two
// sentences shatter under the clause splitter (the second "Another target creature gets -A/-B" alone parses LOW
// — an unbound cross-atom "another" referent), so it's collapsed UP FRONT into ONE pump-pair atom mirroring the
// unrestricted fight-pair form (c): targetType "creature" (role "target" = the -debuff recipient) +
// secondaryTargetType "creature" (role "fighter" = the +buff recipient) + distinct:true (CR 601.2c). The AI
// two-target chooser (opponentAI) assigns fighter=OWN / target=ENEMY, so the buff lands on our board and the
// debuff on an opponent's — never friendly-fire. HIGH iff the op is KNOWN (pump-pair). Not an X spell.
function matchTwoTargetPump(oracle) {
  const t = stripReminder(oracle).toLowerCase().replace(/[’]/g, "'").replace(/\s+/g, " ").trim().replace(/\.\s*$/, "");
  const m = t.match(/^target creature gets \+(\d+)\/\+(\d+) until end of turn\. another target creature gets -(\d+)\/-(\d+) until end of turn$/);
  if (!m) return null;
  return { atoms: [{
    op: "pump-pair", targetType: "creature", restrictions: [], role: "target",
    secondaryTargetType: "creature", secondaryRestrictions: [], secondaryRole: "fighter", distinct: true,
    buffDelta: { p: parseInt(m[1], 10), t: parseInt(m[2], 10) }, debuffDelta: { p: -parseInt(m[3], 10) || 0, t: -parseInt(m[4], 10) || 0 },
  }] };
}

// COUNTER-THEN-GRANT (Snakeskin Veil) — "Put a/two/three +1/+1 counter[s] on target creature [you control].
// [Then ]It gains <grantable keyword[s]> until end of turn." The "It" is anaphoric to the counter's target, so
// the two sentences shatter under the clause splitter (the bare "It gains …" has no bound referent → low).
// Collapsed UP FRONT into ONE add-counter atom carrying `grantKeywords` — applyAddCounter grants each keyword
// via a layer-6 endOfTurn continuous effect on the same targets (the applyPumpEffect grant shape, CR 613.1f).
// Keywords are ALL-OR-NOTHING via parseGrantedKeywords (an ungrantable keyword → null → low → Arbiter, CREED);
// any other rider, a second target, or a non-counter lead fails the exact anchor → falls through → low.
// DAMAGE-POWER-TRAMPLE-EXCESS (Ram Through — SHELF W2) — "Target creature you control deals damage equal to
// its power to target creature you don't control. If the creature you control has trample, excess damage is
// dealt to that creature's controller instead." The second sentence is a RIDER on the one-way fight (it
// rewrites where the damage lands, CR 615 prevention-adjacent redirect), so the clause splitter would leave it
// as unmatched residue → low. Collapsed up front into the existing damage-target-power atom + trampleExcess:
// applyDamageTargetPower assigns lethal to the dealee and routes the excess to its controller only when the
// dealer ACTUALLY has trample at resolution. Any other wording fails the exact anchor → low → Arbiter (CREED).
function matchDamagePowerTrampleExcess(oracle) {
  const t = stripReminder(oracle).toLowerCase().replace(/[’]/g, "'").replace(/\s+/g, " ").trim().replace(/\.\s*$/, "");
  const m = t.match(/^target creature you control deals damage equal to its power to target creature you don't control\. if the creature you control has trample, excess damage is dealt to that creature's controller instead$/);
  if (!m) return null;
  return { atoms: [{
    op: "damage-target-power", targetType: "creature", restrictions: [{ kind: "controller", who: "opponent" }], role: "target",
    secondaryTargetType: "creature", secondaryRestrictions: [{ kind: "controller", who: "you" }], secondaryRole: "fighter",
    trampleExcess: true,
  }] };
}

// COUNTER-IF-LEGENDARY-THEN-FIGHT (Ancient Animus — SHELF W3) — "Put a +1/+1 counter on target creature you
// control if it's legendary. Then it fights target creature an opponent controls." The "it" chains BOTH
// sentences to the same chosen fighter, so the splitter shatters it (a conditional counter + an unbound
// anaphoric fight). Collapsed up front into ONE fight-pair atom carrying `fighterCounter` with
// onlyIfLegendary — applyFightPair places the persistent counter (fighter legendary at resolution) BEFORE
// locking powers, the exact fighterPump ordering. Any other wording → fails the anchor → low → Arbiter.
function matchCounterIfLegendaryThenFight(oracle) {
  const t = stripReminder(oracle).toLowerCase().replace(/[’]/g, "'").replace(/\s+/g, " ").trim().replace(/\.\s*$/, "");
  const m = t.match(/^put a \+1\/\+1 counter on target creature you control if it's legendary\. then it fights target creature (?:an opponent controls|you don't control)$/);
  if (!m) return null;
  const fp = fightClauseParser("target creature you control fights target creature you don't control");
  if (!fp || fp.op !== "fight-pair") return null;
  return { atoms: [{ ...fp, fighterCounter: { counterType: "+1/+1", amount: 1, onlyIfLegendary: true } }] };
}

// METALCRAFT-DAMAGE (Galvanic Blast, SHELF S7) — "<name> deals 2 damage to any target. Metalcraft — <name>
// deals 4 damage instead if you control three or more artifacts." The second sentence REWRITES the amount
// (CR 614 "instead"), so the splitter would leave it as residue → low. Collapsed into ONE deal-damage atom
// with amountUpgrade — resolveScaledAmount reads the artifact count at resolution. Self-names normalized
// to a generic subject; any other wording (a different base/upgraded pair, a different threshold or target)
// fails the exact anchor → low → Arbiter (CREED).
// RAD-OR-PROLIFERATE (Vexing Radgull, SHELF S7) — "that player gets two rad counters if they don't have any
// rad counters. Otherwise, proliferate." The "Otherwise" sentence is the branch's else-arm, so the sentence
// splitter shatters it (an unbound "Otherwise, proliferate" → low). Collapsed into ONE rad atom with
// ifNoRadElseProliferate — applyRad reads the damaged player's rad at resolution (rad when none, else a
// controller proliferate). The who:damagedPlayer referent keeps it gated to combat-damage events.
// DRAW-OR-COUNTER-TRIGGERING (Marcus, Mutant Mayor — SHELF S7) — "draw a card if that creature has a +1/+1
// counter on it. If it doesn't, put a +1/+1 counter on it." The if-else pair shatters under the sentence
// splitter. Collapsed into ONE branch atom whose resolver reads the TRIGGERING creature (the combat-damage
// dealer) at resolution; the routing gate keeps it on cdmg events only (a spell never supplies the referent).
function matchDrawOrCounterTriggering(oracle) {
  const t = stripReminder(oracle).toLowerCase().replace(/[’]/g, "'").replace(/\s+/g, " ").trim().replace(/\.\s*$/, "");
  if (!/^draw a card if that creature has a \+1\/\+1 counter on it\. if it doesn't, put a \+1\/\+1 counter on it$/.test(t)) return null;
  return { atoms: [{ op: "draw-or-counter-triggering", targetType: null }] };
}

function matchRadOrProliferate(oracle) {
  const t = stripReminder(oracle).toLowerCase().replace(/[’]/g, "'").replace(/\s+/g, " ").trim().replace(/\.\s*$/, "");
  const m = t.match(/^(?:they|that player) gets? (a|an|one|two|three|four|five|\d+) rad counters? if they don't have any rad counters\. otherwise, proliferate$/);
  if (!m) return null;
  return { atoms: [{ op: "rad", who: "damagedPlayer", amount: SMALL_NUM[m[1]] ?? parseInt(m[1], 10), ifNoRadElseProliferate: true, targetType: null }] };
}

// UPKEEP DOUBLE-OR-RESET (Lily Bowen, Raging Grandma — SHELF S7) — "double the number of +1/+1 counters on
// this creature if its power is N or less. Otherwise, remove all but one +1/+1 counter from it, then you
// gain 1 life for each +1/+1 counter removed this way." (the self-name was normalized to "this creature"
// upstream by triggers.rewriteSelfNameToThisCreature, whole-clause gated). The if/otherwise pair shatters
// under the sentence splitter, so it's collapsed into ONE branch atom; the resolver reads the SOURCE's
// layer-aware power + its live +1/+1 count at resolution (the printed condition is a trailing effect
// condition, not an intervening-if — CR 608.2 evaluates it on resolution).
// FREE-CAST-OR-LAND (Kellan, the Kid — SHELF S7) — "you may cast a permanent spell with equal or lesser
// mana value from your hand without paying its mana cost. If you don't, you may put a land card from your
// hand onto the battlefield." The RELATIONAL cap ("equal or lesser" vs the TRIGGERING cast — the
// castNotFromHand watcher event) reads ctx.castSpellMv at resolution (stamped by checkCastTriggers); the
// else-arm rides the parked pendingFreeCast decision (decline → the optional land put) or fires directly on
// a whiff. Two sentences → shatters under the splitter → collapsed here into the ONE free-cast atom.
// TIMETWISTER WHEEL (Echo of Eons / Timetwister — SHELF Phase 2): "Each player shuffles their hand and
// graveyard into their library, then draws seven cards." The ", then" would shatter under the clause
// splitter, so it's collapsed here into ONE atom (per player: fold hand+GY into the library, ONE
// deterministic shuffle, draw 7 — see applyTimetwisterWheel). Exact printed sentence only.
function matchTimetwisterWheel(oracle) {
  const t = stripReminder(oracle).toLowerCase().replace(/[’]/g, "'").replace(/\s+/g, " ").trim().replace(/\.\s*$/, "");
  if (!/^each player shuffles their hand and graveyard into their library, then draws seven cards$/.test(t)) return null;
  return { atoms: [{ op: "timetwister-wheel", draw: 7, targetType: null }] };
}

// RAD-TARGET-OR-TREASURE (The Ghoul, Gunslinger — SHELF S7) — "target player gets two rad counters. If
// that player is you, create a Treasure token." A chosen-PLAYER rad (CR 115.1 — any player, self included)
// whose anaphoric second sentence rewards self-targeting with a Treasure. Collapsed into ONE rad atom with
// the treasureIfSelf rider (the sentence splitter would shatter the pair); applyRad's who:"target" branch
// mints the Treasure when the chosen player IS the controller. The flush-chooser intent for a chosen-player
// rad is "enemy" (rad is harmful; radding an opponent is always a legal, faithful play policy — the
// self-rad-for-Treasure line is a strategy refinement, never a correctness requirement).
function matchRadTargetOrTreasure(oracle) {
  const t = stripReminder(oracle).toLowerCase().replace(/[’]/g, "'").replace(/\s+/g, " ").trim().replace(/\.\s*$/, "");
  const m = t.match(/^target player gets (a|an|one|two|three|four|five|\d+) rad counters?\. if that player is you, create a treasure token$/);
  if (!m) return null;
  return { atoms: [{ op: "rad", who: "target", targetType: "player", amount: SMALL_NUM[m[1]] ?? parseInt(m[1], 10), treasureIfSelf: true }] };
}

function matchFreeCastOrLand(oracle) {
  const t = stripReminder(oracle).toLowerCase().replace(/[’]/g, "'").replace(/\s+/g, " ").trim().replace(/\.\s*$/, "");
  if (!/^(?:you may )?cast a permanent spell with equal or lesser mana value from your hand without paying its mana cost\. if you don't, you may put a land card from your hand onto the battlefield$/.test(t)) return null;
  return { atoms: [{ op: "free-cast", capFromCastMv: true, typeFilter: "permanent", elseLandFromHand: true, targetType: null }] };
}

// GY-OWNER-DRAIN (Bloodchief Ascension — SHELF S7): "you may have the graveyard's owner lose N life. if you
// do, you gain N2 life" — the SENTINEL "the graveyard's owner" is delivered ONLY by detectTriggers' gyEnter
// referent rewrite (a spell's / another event's anaphoric "that player" never reaches this matcher), and the
// who:"gyOwner" pin keeps the routing gate event-locked on top. ONE composite atom, optional:true — the
// yes/no covers the whole drain, so the reflexive "If you do" payoff is both-or-neither by construction
// (the sentence splitter would shatter the pair; collapsing mirrors matchRadTargetOrTreasure).
function matchGyOwnerDrain(oracle) {
  const t = stripReminder(oracle).toLowerCase().replace(/[’]/g, "'").replace(/\s+/g, " ").trim().replace(/\.\s*$/, "");
  const m = t.match(/^you may have the graveyard's owner lose (\d+) life\. if you do, you gain (\d+) life$/);
  if (!m) return null;
  return { atoms: [{ op: "gy-owner-drain", who: "gyOwner", lose: parseInt(m[1], 10), gain: parseInt(m[2], 10), optional: true, targetType: null }] };
}

function matchDoubleOrResetCounters(oracle) {
  const t = stripReminder(oracle).toLowerCase().replace(/[’]/g, "'").replace(/\s+/g, " ").trim().replace(/\.\s*$/, "");
  const m = t.match(/^double the number of \+1\/\+1 counters on this creature if its power is (\d+) or less\. otherwise, remove all but one \+1\/\+1 counter from it, then you gain 1 life for each \+1\/\+1 counter removed this way$/);
  if (!m) return null;
  return { atoms: [{ op: "double-or-reset-counters", powerThreshold: parseInt(m[1], 10), targetType: null }] };
}

function matchMetalcraftDamage(oracle) {
  const t = stripReminder(oracle).toLowerCase().replace(/[’]/g, "'").replace(/\s+/g, " ").trim().replace(/\.\s*$/, "");
  const m = t.match(/^(.+?) deals (\d+) damage to any target\. metalcraft — \1 deals (\d+) damage instead if you control three or more artifacts$/);
  if (!m) return null;
  return { atoms: [{
    op: "deal-damage", amount: parseInt(m[2], 10), targetType: "any",
    amountUpgrade: { kind: "artifactsYouControl", atLeast: 3, amount: parseInt(m[3], 10) },
  }] };
}

// INSTEAD-AMOUNT (BLITZ INST-1, CR 608.2 + 614 "instead") — the condition-gated ability-word amount upgrade,
// generalizing matchMetalcraftDamage beyond Metalcraft/artifacts to the wider "<base>. <Ability-word> —
// <upgraded amount> instead if <condition>" family (Brimstone Volley's Morbid burn, Cackling Flames's Hellbent
// burn, Firecannon Blast's Raid burn, Feed the Clan's Ferocious life, Hunger of the Howlpack's Morbid counter,
// Mirran Mettle's Metalcraft pump, Tragic Slip's Morbid debuff). The second sentence REWRITES the amount
// (CR 614 "instead"), so the sentence splitter would leave it as residue → low; collapsed into ONE atom
// carrying `amountUpgrade` (a scalar amount read via the SHARED resolveScaledAmount) or `ptUpgrade` (the P/T
// pair read in applyPumpEffect). Both readers evaluate the board condition at RESOLUTION (evaluateInterveningIf,
// CR 608.2) and swap to the upgraded amount ONLY when it holds — the base amount otherwise (false-negative safe).
//
// The condition is gated on a CURATED ability-word → canonical-condition map AND spellConditionParseable: the
// ability word is a designer LABEL, but the real guard is that the printed condition equals its word's exact,
// reader-verified board query. This is what keeps the graveyard-count mis-reader out — Threshold ("seven or
// more cards in your graveyard": no type word → unparseable) and Descend ("N or more permanent cards …": the
// `\bPermanent\b` type-line scan reads 0 forever, a mis-reader) are NOT in the map, so Cabal Ritual / Join the
// Dead / Kirtar's Wrath PARK (whole-card law). Both amounts are fixed numerals; a reworded upgrade (Arrow
// Storm's added "damage can't be prevented"), an X amount (Crater's Claws "X plus 2"), a non-self-name burn, or
// the leading-"If … instead" form all fail the exact anchors → low → Arbiter (CREED).
const INSTEAD_ABILITY_WORD_CONDITION = {
  metalcraft: "you control three or more artifacts",
  morbid: "a creature died this turn",
  hellbent: "you have no cards in hand",
  raid: "you attacked this turn",
  ferocious: "you control a creature with power 4 or greater",
};
// Accept a printed condition ONLY when it is the ability word's exact canonical query (CLOSED vocabulary) AND
// the resolver can actually read it (spellConditionParseable — the metric⇄runtime shared gate); else null → park.
function insteadCondition(word, cond) {
  const canon = INSTEAD_ABILITY_WORD_CONDITION[word];
  return canon && cond === canon && spellConditionParseable(cond) ? cond : null;
}
function matchInsteadAmountUpgrade(oracle) {
  const t = stripReminder(oracle).toLowerCase().replace(/[’]/g, "'").replace(/\s+/g, " ").trim().replace(/\.\s*$/, "");
  // Family 1 — self-name BURN (deal-damage). Galvanic Blast is caught by matchMetalcraftDamage first (its exact
  // {kind:"artifactsYouControl"} shape preserved); this catches Brimstone Volley / Cackling Flames / Firecannon Blast.
  let m = t.match(/^(.+?) deals (\d+) damage (to any target|to target creature)\. ([a-z][a-z ]*?) — \1 deals (\d+) damage instead if (.+)$/);
  if (m) {
    const cond = insteadCondition(m[4], m[6]);
    if (!cond) return null;
    return { atoms: [{ op: "deal-damage", amount: parseInt(m[2], 10), targetType: m[3] === "to any target" ? "any" : "creature", amountUpgrade: { condition: cond, amount: parseInt(m[5], 10) } }] };
  }
  // Family 2 — GAIN-LIFE (Feed the Clan): "you gain N life. <word> — you gain M life instead if <cond>".
  m = t.match(/^you gain (\d+) life\. ([a-z][a-z ]*?) — you gain (\d+) life instead if (.+)$/);
  if (m) {
    const cond = insteadCondition(m[2], m[4]);
    if (!cond) return null;
    return { atoms: [{ op: "gain-life", amount: parseInt(m[1], 10), targetType: null, amountUpgrade: { condition: cond, amount: parseInt(m[3], 10) } }] };
  }
  // Family 3 — ADD-COUNTER (+1/+1 on the SINGLE target creature; the upgrade's "that creature" is the same
  // chosen target — one atom, one target): Hunger of the Howlpack "put a … Morbid — put three … on that creature".
  m = t.match(/^put (a|an|one|two|three|four|five|\d+) \+1\/\+1 counters? on target creature\. ([a-z][a-z ]*?) — put (a|an|one|two|three|four|five|\d+) \+1\/\+1 counters? on that creature instead if (.+)$/);
  if (m) {
    const cond = insteadCondition(m[2], m[4]);
    if (!cond) return null;
    return { atoms: [{ op: "add-counter", counterType: "+1/+1", amount: SMALL_NUM[m[1]] ?? parseInt(m[1], 10), targetType: "creature", amountUpgrade: { condition: cond, amount: SMALL_NUM[m[3]] ?? parseInt(m[3], 10) } }] };
  }
  // Family 4 — PUMP (single target creature, SIGNED P/T): Mirran Mettle "+2/+2 … Metalcraft — +4/+4 instead",
  // Tragic Slip "-1/-1 … Morbid — -13/-13 instead". ptUpgrade swaps the whole P/T pair at resolution.
  m = t.match(/^target creature gets ([+-]\d+)\/([+-]\d+) until end of turn\. ([a-z][a-z ]*?) — that creature gets ([+-]\d+)\/([+-]\d+) until end of turn instead if (.+)$/);
  if (m) {
    const cond = insteadCondition(m[3], m[6]);
    if (!cond) return null;
    return { atoms: [{ op: "pump", ptDelta: { p: parseInt(m[1], 10), t: parseInt(m[2], 10) }, targetType: "creature", duration: "endOfTurn", ptUpgrade: { condition: cond, ptDelta: { p: parseInt(m[4], 10), t: parseInt(m[5], 10) } } }] };
  }
  return null;
}

// SELF-HIT DAMAGE (BLITZ OA-1 — the Orcish Artillery pinger frame): "<source> deals N damage to any
// target and M damage to you." ONE deal-damage atom carrying the printed self-hit as `selfDamage` —
// the resolver deals the target damage, then M to the CONTROLLER through the SAME applyDamageEffect
// (so replacements / lifegain-from-loss / infect interactions are identical to any burn). Collapsed
// up front: the clause's internal " and " would be shattered by splitClauses into an unparseable
// fragment. The `$` anchor rejects any further rider (FN-safe). Both numbers are mandatory — a
// variable ("that much") or scaled form never matches.
function matchSelfHitDamage(oracle) {
  const t = stripReminder(oracle).toLowerCase().replace(/[’]/g, "'").replace(/\s+/g, " ").trim().replace(/\.\s*$/, "");
  const m = t.match(/^(.+?) deals (\d+) damage to any target and (\d+) damage to you$/);
  if (!m) return null;
  return { atoms: [{ op: "deal-damage", amount: parseInt(m[2], 10), targetType: "any", selfDamage: parseInt(m[3], 10) }] };
}

function matchCounterThenGrant(oracle) {
  const t = stripReminder(oracle).toLowerCase().replace(/[’]/g, "'").replace(/\s+/g, " ").trim().replace(/\.\s*$/, "");
  const m = t.match(/^put (a|two|three) \+1\/\+1 counters? on target creature( you control)?\. (?:then )?it gains (.+) until end of turn$/);
  if (m) {
    const kws = parseGrantedKeywords(m[3]);
    if (!kws) return null;
    return { atoms: [{
      op: "add-counter", counterType: "+1/+1", amount: m[1] === "a" ? 1 : SMALL_NUM[m[1]],
      targetType: "creature", ...(m[2] ? { restrictions: [{ kind: "controller", who: "you" }] } : {}),
      grantKeywords: kws,
    }] };
  }
  // MASS form (Vault 12 chapter I — SAGA, SHELF S7): "Put a +1/+1 counter on EACH creature you control.
  // They gain <keywords> until end of turn." The anaphoric "They" is the same resolution-time set —
  // applyAddCounter expands scope:"youControl" via controllerCreatureTargets (atomTargets) and its
  // grantKeywords loop rides the IDENTICAL `targets` array, so the counter recipients and the keyword
  // recipients cannot diverge. Keywords stay all-or-nothing via parseGrantedKeywords (CREED).
  const mm = t.match(/^put (a|two|three) \+1\/\+1 counters? on each creature you control\. (?:then )?they gain (.+) until end of turn$/);
  if (mm) {
    const kws = parseGrantedKeywords(mm[2]);
    if (!kws) return null;
    return { atoms: [{
      op: "add-counter", counterType: "+1/+1", amount: mm[1] === "a" ? 1 : SMALL_NUM[mm[1]],
      scope: "youControl",
      grantKeywords: kws,
    }] };
  }
  return null;
}

function parseEffectClauseImpl(oracle, cardType = "", { hasX = false } = {}) {
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
      return makeProgram({ confidence: "high", atoms, xSpell: atoms.some(a => a.amountX || a.countX || a.targetCountX || a.ptX || a.filter?.mvCapX || a.mvCapX), unparsedTail: null });
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
registerClauseParser(grantUntilEotClauseParser); // UNTIL-EOT QUOTED GRANT (TG-1) — body-validated via the injected grant validators

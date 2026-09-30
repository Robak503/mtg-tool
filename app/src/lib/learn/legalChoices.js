/**
 * Phase 6 — Learn-to-Play: legalChoices.js
 *
 * Given a GameState and a player who currently holds priority (or is
 * declaring attackers/blockers), generate the list of legal actions
 * they can take. The decisionGate (PR5) presents these to the user
 * (Beginner: ask every time, Intermediate: auto+confirm, Expert:
 * silent-pick).
 *
 * Scope (per design doc §5 step 3):
 *   - pass-priority
 *   - play-land   (sorcery-speed, own main, stack empty, ≤1 land per turn)
 *   - cast-spell  (sorcery vs instant timing; mana-cost can-afford check)
 *   - declare-attacker candidates (untapped creatures, no summoning sick
 *                                   unless haste; own creatures only)
 *   - declare-blocker candidates  (untapped creatures of the defending
 *                                   player against an active attacker)
 *
 * Deferred to later PRs:
 *   - Activate-ability (needs an ability schema layer)
 *   - Target selection (caller picks; legalChoices just exposes that
 *     targets are required and how many)
 *   - Complex cost-payment beyond plain mana costs (life, tap-this,
 *     sacrifice, etc.) — surfaces as needsCostPayment: true so the
 *     decisionGate / Arbiter handle it
 *   - Modes / X-spells / hybrid pips beyond the parser hint
 *
 * Pure: takes a GameState, returns plain JS arrays/objects. No mutation,
 * no fetch.
 */

import { getZone, opponentsOf, totalAvailableMana, findPermanent, creaturePower, nameCastLocked } from "./gameState.js"; // B4: the Reflector Mage name cast lock
import { canAfford, manaSources, manaProduction, landAuraManaBonus, globalTapManaAugment, applyAuraManaGrantSupplement, sourcesExcludingOneShotVictim } from "./manaModel.js";
import { countForSpec } from "./effects/atoms/shared.js"; // MANA-VARIABLE: resolve a count-derived tap-for-mana amount
import { hasKeyword } from "./keywords.js";
import { permanentColors, permanentHasKeyword, permanentIsCreature, permanentTypes, summoningSickNow, colorsOf, grantedManaSpecsFor, grantedActivatedQuotedFor, crewCostWithOverrides } from "./layers.js";
import { etbUsesX, castOwnTurnOnlyLock, abilitiesAsThoughHasteFor, castNoncreatureLockFor, combatCapFor } from "./staticAbilityParser.js"; // + ④-E (Nikya): the noncreature cast lock // + SG-18 (Shang-Chi): abilities as though haste // SG-8 (Dosan): the own-turn cast lock, one sentence read at the instant-speed gate
import { grantsWubrgAltCost, fixedManaAltCostOf } from "./effects/textNormalize.js"; // FIST OF SUNS (RG-5) — the board-granted WUBRG alternative cost; + RG-8 — the spell's OWN fixed-mana alternative cost (the Bringers); leaf readers
import { collectCostReducers, playLandFromGraveyardPermission, costReductionForSpell, coloredPipReductionForSpell, collectCostTaxers, costTaxForSpell, selfCostReductionMetric, cantCastDescriptorOf, extraLandDropsOf, flashCastPermissionsOf, spellMatchesFlashFilter, registerGroupActivatedBodyValidator, registerLevelerCardValidator, collectActivatedCostReducers, activatedCostReductionForCost, collectEquipCostOverrides, castsPerTurnLimitOf, noncreatureCastsPerTurnLimitOf, castFromHandOnlyLockOf, artifactActivationsLocked } from "./staticAbilityParser.js";
import { canBlockAttacker, attackerMinBlockers, isBlockedByAtMostOne, attackDefenderRequirementOf, defenderMeetsAttackRequirement, attackControllerRequirementOf, controllerMeetsBoardPredicate, maxBlocksFor, cantAttackAlone, cantBlockAlone, selfCantAttackNow, selfCantBlockNow } from "./combatEvasion.js";
import { attackTaxDetail, attackTaxManaCost, PHYREXIAN_LIFE_PER_PIP } from "./attackTax.js"; // ATTACK TAX (CR 508.1g) — withhold the attack the tax can't fund (+ the Phyrexian life lane, Norn's Annex)
import { parseSpellEffect, enumerateTargets, effectNeedsTarget, parseCreatureTargetRestrictions, canBeTargetedBy } from "./spellEffects.js";
import { parseEffectProgram, programConfidence, parseEffectClause, programNeedsChosenTarget } from "./effects/parser.js";
import { stripCostOnlyKeywordLines } from "./effects/parseHelpers.js";
import { expandCastChoices } from "./effects/targeting.js";
import { tutorManaValue } from "./effects/atoms/library.js"; // AC-1 — the least-valuable ranking the edict/discard auto-pick uses (library.js is a leaf, cycle-safe)
import { evalLeastValuableCmp, policyEvalEnabledFor } from "./boardEval.js"; // QUARTET PHASE 1 — the shared evaluator's victim ranking (boardEval imports only leaves: gameState + library + cardPlayHints — cycle-free)

// S1.1 (shelf run, 2026-07-10): parse a card's CAST program from the cost-only-keyword-STRIPPED
// oracle — the same strip the classifier (coverage.js) and the dispatcher's fallback use. The
// unstripped parse returned a LOW/empty (but truthy) program for Convoke/Affinity carriers
// (Harmonized Crescendo ×3 in the Phase-0 live-fire), which short-circuited the dispatcher's
// stripped fallback via `action.program ||` and no-opped the resolution. One strip, no drift.
function parseCastProgram(card) {
  return parseEffectProgram({ ...card, oracle: stripCostOnlyKeywordLines(card?.oracle ?? card?.oracle_text ?? "") });
}
/**
 * SAVAGE BEATING (POD-SIM THREE · KT-6, 2026-09-05) — the program-level cast window the parser stamps as `castTiming`
 * ("Cast this spell only during combat on your turn." → { phase: "combat", yourTurn: true }). No stamp → no restriction.
 * A stamped spell is offered ONLY when every named condition holds (CR 601.3 — a restriction on when the spell may be
 * cast); fails closed on an unreadable card.
 */
// NOT OF THIS WORLD (KT-9b): does any chosen stack target itself target a creature YOU control with power ≥ N?
// Reads the stack object's RECORDED targets (spell or ability alike); a target already gone fails closed.
function targetConditionalReductionHits(state, playerId, targets, tcr) {
  const need = tcr.targetsCreatureYouControlPowerAtLeast;
  return (targets || []).some((t) => {
    if (!t || (t.type !== "spell" && t.type !== "stackAbility")) return false;
    const obj = (state.stack || []).find((o) => o.id === t.id);
    return !!obj && (obj.targets || []).some((u) => {
      if (!u || u.type === "player" || u.type === "spell" || u.type === "stackAbility") return false;
      const lk = findPermanent(state, u.id);
      if (!lk || lk.permanent.controller !== playerId || !permanentIsCreature(state, u.id)) return false;
      return creaturePower(lk.permanent, state) >= need;
    });
  });
}
function castTimingAllows(state, playerId, card) {
  const ct = parseCastProgram(card)?.castTiming;
  if (!ct) return true;
  if (ct.yourTurn && state.activePlayer !== playerId) return false;
  if (ct.phase && state.phase !== ct.phase) return false;
  return true;
}
import { isNonChosenTargetType } from "./targetTypes.js";
import { counterClauseParser } from "./effects/atoms/stack.js";
import { parseActivatedAbilities, parseGrantedActivatedAbilities, sacrificeDropsTrigger, castOnlyWhenAttacked, castOnlyAfterAnotherSpell, hasBeenAttackedThisStep, parseCyclingCost, parseCyclingLifeCost, parseDiscardCostAbility, parsePlotCost, parseCrewCost, crewPowerBonus, isModeledGroupActivatedBody, parseGraveyardSelfRecursion, parseGraveyardExileAbility, modeledLeveler } from "./effects/abilities.js";
// PLOT (CR 702.171): the runtime offers a card the plot special action ONLY when its NON-plot text is
// fully native — i.e. classifyCard (which strips the plot line internally) returns a native tier. Reusing
// the metric's OWN authority means the runtime and the coverage metric can never disagree about which plot
// cards flip natively (no duplicated native-determination to drift). coverage.js does NOT import legalChoices
// (verified — metric-only, zero runtime consumers), so this import introduces no cycle.
import { classifyCard, isNativeTier, isNativeBestow, isKeywordOnly, isNativeOrdealAura, grantAuraCastHostType } from "./coverage.js";
import { parseKickerCounterCreature, parseKickerEtbCreature, parseKickerCost } from "./kicker.js"; // KICKER (CR 702.33) — emit a normal + a kicked cast (kicker mana folded into the cost) when the kicker is affordable; ETB-trigger payoff variant (creatures) + kicked-SPELL-effect (instants/sorceries) too
import { registerGrantActivatedBodyValidator } from "./effects/atoms/grantUntilEot.js"; // TG-1 — the until-EOT quoted-grant activated-body gate
import { parseEmergeCard } from "./emerge.js"; // EMERGE (CR 702.97) — emit a normal hard-cast + an emerge cast per legal sacrifice victim (cost reduced by the victim's MV)

// GROUP-ACTIVATED grant (queue 1) — register the modeled-body gate so the runtime path (a SIM that imports
// legalChoices but not coverage) still emits + enumerates group-activated grants. Idempotent with coverage.js's
// identical registration; see registerGroupActivatedBodyValidator in staticAbilityParser.js.
registerGroupActivatedBodyValidator(isModeledGroupActivatedBody);
// UNTIL-EOT QUOTED GRANT (BLITZ TG-1) — the activated-body gate for the grant-until-eot clause parser
// (Lightning Volley's granted "{T}: …" pings). Runtime mirror of coverage.js's identical registration.
registerGrantActivatedBodyValidator(isModeledGroupActivatedBody);
// LEVEL UP (BLITZ LV-1) — register the whole-card leveler gate so parseStaticAbilities emits the
// band P/T + keyword statics for a runtime that imports legalChoices without coverage. Idempotent
// with coverage.js's identical registration; see registerLevelerCardValidator in staticAbilityParser.js.
registerLevelerCardValidator(modeledLeveler);
import { parseLoyaltyAbilities, planeswalkerPlayable } from "./effects/loyaltyAbilities.js";
import { isNativeAura, isNativeManaAura, isPlayerAuraCard, entersWithXCounters, parseBestowCost, auraEnchantSubject, auraEnchantRestrictions, auraEnchantHostSpec, playFromTopPermission, castFromTopFilterAllows, parseStaticAbilities } from "./staticAbilityParser.js";
import { isCloneCard } from "./cloneCopy.js"; // X-COST CLONE (Mockingbird): choose X at cast so the MV cap is right
import { isAdventureCard, adventureFaceCard, creatureFaceCard } from "./adventure.js"; // ADVENTURE (CR 715) — cast either face; pure shape module
import { isSplitCard, splitFaceCards } from "./splitCard.js"; // SPLIT CARDS (CR 709) — cast either half; pure shape module
import { isModalDfc, mdfcLandFaces, mdfcFaceCards } from "./modalDfc.js"; // MODAL DFC (CR 712.8, V1) — the land drop chooses a face; the spell front is cast as a face; pure shape module
import { evaluateInterveningIf } from "./interveningIf.js"; // CR 602.5d "Activate only if <cond>" — the offer gate reads the SAME vocabulary as the trigger + spell lanes
import { extractAdditionalCosts, extractAltCost } from "./effects/castModifiers.js"; // AC-PERMANENT — see permanentAdditionalCosts below; + extractAltCost (EVOKE on a permanent, Solitude)
import { isPermanentSpell } from "./resolvers.js";
import { parseSuspendNoCost } from "./fading.js"; // KW-SUSPEND — the one gate offer/dispatch/classifier all read

/**
 * AC-PERMANENT (CR 601.2f) — the additional cost of a spell that resolves as a PERMANENT.
 *
 * ⛔ THIS EXISTS BECAUSE THOSE COSTS WERE NEVER CHARGED. The cast-path additional-cost block below reads
 * `program.additionalCosts`, and a permanent has no EFFECT program at all: parseEffectClause has no atom for
 * "Flying, trample", so parseEffectProgram returns null and the cost sentence goes with it. Demon of
 * Catastrophes ("sacrifice a creature") was offered, cast, and the sacrifice victim was still on the
 * battlefield afterwards — a spell cast CHEAPER THAN PRINTED, the forbidden direction, live in the runtime.
 *
 * ⛔ THE PROGRAM MUST STAY NULL. The dispatcher's resolution chain tests `else if (program)` BEFORE
 * `else if (isPermanentSpell(castCard))`, so synthesising a cost-carrying program for a creature would route
 * it to EFFECT_PROGRAM — cost paid, nothing enters the battlefield, the card is eaten. So the costs travel
 * beside the program, never inside it, and the routing is untouched.
 *
 * Vetted costs only (extractAdditionalCosts returns null otherwise). An UNVETTED permanent cost is still a
 * free cast today — 67 of them; that is a separate slice with its own decision to make (suppress the offer
 * vs route it), and this helper deliberately does NOT paper over it.
 */
function permanentAdditionalCosts(card) {
  if (!isPermanentSpell(card)) return null;
  return extractAdditionalCosts(String(card?.oracle ?? card?.oracle_text ?? "")).costs || null;
}

/**
 * ⛔ THE UNVETTED-COST GUARD (CR 601.2f) — a MANDATORY additional cost the parser cannot model.
 *
 * We cannot pay what we cannot model, so we must not cast it. Offering it anyway is what the engine did:
 * 151 corpus cards (Goblin Grenade, Fire Covenant, Firestorm, Deprive, "waterbend {5}", "behold a Goblin
 * and exile it") were cast WITHOUT paying their cost — cheaper than printed, the cardinal false positive.
 * Suppressing the offer is a false NEGATIVE: a dead card in hand. Safe direction, and the honest one until
 * the cost kind is vetted. Measured before shipping: only THREE cards on Colton's + Joe's 16 real decks are
 * affected (Abhorrent Oculus, Savage Order, Thunderherd Migration), so the playability price is ~nil.
 *
 * ⛔ "YOU MAY" IS NOT THIS. An OPTIONAL additional cost (CR 601.2b — casualty, "you may sacrifice any
 * number of creatures", Silumgar's Scorn) is legal to DECLINE: casting at the full printed price is then
 * correct, an under-offer at worst. 53 corpus cards are in that class and this guard must never touch them.
 * ⛔ READ REMINDER-STRIPPED TEXT. The phrase appears in the reminder text of several keywords on cards that
 * print no such cost; testing the raw oracle would make 16 permanents uncastable for a cost they don't have.
 */
function hasUnvettedMandatoryAdditionalCost(card) {
  const oracle = String(card?.oracle ?? card?.oracle_text ?? "").replace(/\([^)]*\)/g, " ");
  const m = /as an additional cost to cast this spell,\s*([^.]+)\./i.exec(oracle);
  if (!m) return false;
  if (/^you may\b/i.test(m[1].trim())) return false;              // optional — declining is legal
  return true;
}

// ─── Mana cost parser + can-afford check ──────────────────────────────────────

const SINGLE_COLORS = new Set(["W", "U", "B", "R", "G"]);

/**
 * Parse a mana cost string like "{2}{U}{U}" into a structured object:
 *   { generic: 2, W: 0, U: 2, B: 0, R: 0, G: 0, C: 0, hasX: false, xCount: 0,
 *     hybrid: [], phyrexian: [], anyColor: 0 }
 *
 * Conventions:
 *   - Plain digits → generic (treated as a single chunk; "{10}" → 10)
 *   - W/U/B/R/G  → that color's pip
 *   - C          → colorless (distinct from generic — only colorless mana works)
 *   - X/Y/Z      → hasX flag + xCount++ (caller picks ONE value for X; the
 *                  TOTAL mana owed is xCount * X — a {X}{X} cost owes 2X, CR 107.3).
 *                  All variable pips in a printed cost are the SAME letter in
 *                  practice ({X}{X}), so a single chosen X drives every pip.
 *   - Hybrid {W/U} or {2/U} or {U/P} (phyrexian) → tracked in arrays; the
 *     can-afford check uses the cheaper option per pip (a rough but
 *     workable heuristic for v1)
 *
 * This parser is forgiving: malformed pips are silently dropped rather
 * than throwing, because cardpool variance is real and we'd rather
 * surface "can't afford" than crash the engine. The Arbiter can be
 * consulted for the unusual ones.
 */
export function parseManaCost(costString) {
  const cost = {
    generic: 0,
    W: 0, U: 0, B: 0, R: 0, G: 0, C: 0,
    hasX: false,
    xCount: 0,      // number of {X}/{Y}/{Z} pips — the cost owes xCount * chosenX (CR 107.3: {X}{X} = 2X)
    hybrid: [],     // [["W","U"], ...]
    phyrexian: [],  // ["U","B",...] — can be paid with 2 life
    anyColor: 0,    // count of "any color" pips (rare)
    snow: 0,        // SNOW PIPS ({S}, CR 107.4h) — each payable with one mana from a snow source (planPayment enforces it)
  };
  if (typeof costString !== "string" || !costString) return cost;

  const pips = [...costString.matchAll(/\{([^}]+)\}/g)].map(m => m[1].trim());
  for (const raw of pips) {
    const pip = raw.toUpperCase();

    // Plain integer → generic.
    if (/^\d+$/.test(pip)) {
      cost.generic += parseInt(pip, 10);
      continue;
    }
    // X / Y / Z — each variable pip adds to xCount; the total owed is xCount * chosenX.
    if (pip === "X" || pip === "Y" || pip === "Z") {
      cost.hasX = true;
      cost.xCount += 1;
      continue;
    }
    // Single color
    if (SINGLE_COLORS.has(pip)) {
      cost[pip] += 1;
      continue;
    }
    if (pip === "C") {
      cost.C += 1;
      continue;
    }
    // SNOW ({S}, CR 107.4h / 106.3): a snow mana pip — payable with one mana produced by a snow source.
    // Tracked as its own requirement (NOT generic) so planPayment can enforce the snow-source restriction;
    // it is NEVER fake-paid from non-snow mana (THE CREED — the forbidden FP).
    if (pip === "S") {
      cost.snow += 1;
      continue;
    }
    // Phyrexian pip — "{U/P}" or "{W/P}"
    if (/^[WUBRG]\/P$/.test(pip)) {
      cost.phyrexian.push(pip[0]);
      continue;
    }
    // Hybrid — "{W/U}" or "{2/W}" or rare "{B/G/P}"
    if (pip.includes("/")) {
      const parts = pip.split("/").filter(p => p && p !== "P");
      cost.hybrid.push(parts);
      continue;
    }
    // Unknown — leave it dropped. Arbiter territory.
  }
  return cost;
}

/**
 * AC-MANA (2026-08-07) — add an ADDITIONAL mana cost's pips to an already-adjusted printed cost.
 *
 * ⛔⛔ THIS EXISTS BECAUSE THE OBVIOUS SHORTCUT IS WRONG HERE. Concatenating the two cost STRINGS and
 * re-parsing is exact in the abstract (parseManaCost simply accumulates pips), but by this point the printed
 * `cost` is no longer the printed string: cost-increase tax, static tax, generic reduction and coloured-pip
 * reduction have all been folded in. Re-parsing from the raw mana_cost would silently discard every one of
 * those. So the merge has to happen on the OBJECT.
 *
 * ⛔ AND AN OBJECT MERGE IS THE VERSION THAT SILENTLY DROPS A FIELD — hybrid, phyrexian and snow are the
 * easy ones to forget, and forgetting one UNDERCHARGES, which is the free-spell direction this whole family
 * is wired to avoid. The pinned test therefore checks this helper AGAINST string concatenation on
 * unadjusted costs, so the two definitions of "merged" are held equal by a gate rather than by care.
 *
 * X is deliberately NOT summed as a value: `xCount` adds because {X}{X} owes 2X (CR 107.3), and `hasX` ORs.
 */
export function addExtraManaCost(cost, extraPips) {
  const extra = parseManaCost(extraPips || "");
  return {
    ...cost,
    generic: (cost.generic || 0) + extra.generic,
    W: (cost.W || 0) + extra.W,
    U: (cost.U || 0) + extra.U,
    B: (cost.B || 0) + extra.B,
    R: (cost.R || 0) + extra.R,
    G: (cost.G || 0) + extra.G,
    C: (cost.C || 0) + extra.C,
    snow: (cost.snow || 0) + extra.snow,
    anyColor: (cost.anyColor || 0) + extra.anyColor,
    hasX: !!cost.hasX || extra.hasX,
    xCount: (cost.xCount || 0) + extra.xCount,
    hybrid: [...(cost.hybrid || []), ...extra.hybrid],
    phyrexian: [...(cost.phyrexian || []), ...extra.phyrexian],
  };
}

// W2: the old pool-only `canPayManaCost` heuristic was DELETED — it diverged from the live planner
// (skipped the numeric side of {2/W}, ignored phyrexian) and had zero production callers. Every
// affordability check routes through manaModel.canAfford (planPayment !== null); a pool-only check
// is simply `canAfford(pool, [], cost)`.

/**
 * Total mana value (CMC) from a parsed cost. Used for sort hints and
 * curve analysis, not legality. X counts as 0 here.
 */
export function totalCmc(cost) {
  return (cost.generic || 0)
    + (cost.W || 0) + (cost.U || 0) + (cost.B || 0) + (cost.R || 0) + (cost.G || 0)
    + (cost.C || 0)
    + (cost.snow || 0)   // SNOW ({S}) contributes 1 to mana value each (CR 202.3a)
    + cost.hybrid.length
    + cost.phyrexian.length;
}

/**
 * Sum two parsed mana costs into one payable cost (KICKER — fold the kicker pips onto the base cost so the
 * dispatcher's single mana plan pays the whole thing). Field-by-field: generic + colored + C are added;
 * hybrid + phyrexian + anyColor pip lists are concatenated. X is NOT combined (the kicker path rejects an
 * {X} kicker, and a base X-spell never reaches the kicker branch — both `hasX` falses through to false),
 * so the result is a plain fixed cost. Pure; returns a fresh object (never mutates either input).
 */
export function mergeManaCost(base, add) {
  return {
    generic: (base.generic || 0) + (add.generic || 0),
    W: (base.W || 0) + (add.W || 0),
    U: (base.U || 0) + (add.U || 0),
    B: (base.B || 0) + (add.B || 0),
    R: (base.R || 0) + (add.R || 0),
    G: (base.G || 0) + (add.G || 0),
    C: (base.C || 0) + (add.C || 0),
    hasX: !!base.hasX || !!add.hasX,
    xCount: (base.xCount || 0) + (add.xCount || 0),
    hybrid: [...(base.hybrid || []), ...(add.hybrid || [])],
    phyrexian: [...(base.phyrexian || []), ...(add.phyrexian || [])],
    anyColor: (base.anyColor || 0) + (add.anyColor || 0),
    snow: (base.snow || 0) + (add.snow || 0),
  };
}

// ─── Card type predicates ────────────────────────────────────────────────────

function typeLineOf(card) {
  if (!card) return "";
  if (typeof card.type === "string" && card.type) return card.type;
  if (typeof card.type_line === "string") return card.type_line;
  // DFC fallback — front face.
  if (Array.isArray(card.card_faces) && card.card_faces[0]) {
    return card.card_faces[0].type_line || card.card_faces[0].type || "";
  }
  return "";
}

// ⛔ FRONT FACE ONLY for a multi-face card (V1, 2026-09-04): a TRANSFORM DFC with a land back (Ojer Axonil, Deepest
// Might // Temple of Power) prints "… // Land" and was being offered as a LAND DROP — the back of a transform card is
// never played directly (CR 712.4). A MODAL DFC's land faces are offered by actionsPlayLand's own branch (modalDfc.js),
// so this predicate reads the FRONT face of any "//" type line and nothing else changes for single-face cards.
function isLand(card)        { return String(typeLineOf(card)).split(" // ")[0].includes("Land"); }
function isInstant(card)     { return typeLineOf(card).includes("Instant"); }
function isCreature(card)    { return typeLineOf(card).includes("Creature"); }
function isArtifact(card)    { return typeLineOf(card).includes("Artifact"); }

/** γ1b — does a permanent match a "Sacrifice a/an/another <type>" cost's type? "permanent" = any.
 * γ1b-SUBTYPE — an optional `subtype` (lowercased, Koma "Sacrifice another Serpent"; "Sacrifice a Swamp")
 * additionally requires the victim's type line to carry that subtype (the segment after the "—" em dash,
 * CR 205.3). The parser emits type:"permanent" for a subtype sac (a subtype can sit on a creature, a land, or
 * an artifact), so baseOk is true and the subtype gate does the narrowing — a permanent without the subtype is
 * excluded, exactly as the cost demands. */
/**
 * ADDCOST-3 — does this GRAVEYARD card satisfy an "exile a <type> card from your graveyard" cost?
 * Deliberately separate from sacTypeMatches: that one answers about a PERMANENT on the battlefield, and
 * this one about a CARD in a graveyard. Merging them would be the one-judgement-two-meanings trap — the
 * types read the same but "permanent" is meaningless in a graveyard, so the vocabularies must not be shared.
 */
function cardMatchesAddCostType(card, type) {
  const t = typeLineOf(card);
  if (type === "creature") return t.includes("Creature");
  if (type === "artifact") return t.includes("Artifact");
  if (type === "land") return t.includes("Land");
  if (type === "instant or sorcery") return t.includes("Instant") || t.includes("Sorcery");
  return false;
}

function sacTypeMatches(card, type, subtype = null) {
  if (type === "permanent" && !subtype) return true;
  const t = typeLineOf(card);
  const baseOk =
    type === "permanent" ? true :
    type === "creature" ? t.includes("Creature") :
    type === "artifact" ? t.includes("Artifact") :
    type === "enchantment" ? t.includes("Enchantment") :
    type === "land" ? t.includes("Land") :
    // SHELF-85 V8 — "Sacrifice a token" (Arcade Cabinet): the victim is any TOKEN permanent (CR 111.1 — the token flag
    // the mint stamps), never a card; a type line alone can't tell them apart.
    type === "token" ? !!card?.token :
    // ADDCOST-1 union — "sacrifice an artifact or creature" (Deadly Dispute): a victim matching EITHER type.
    type === "artifactOrCreature" ? (t.includes("Artifact") || t.includes("Creature")) :
    // SAC-UNION (2026-08-07) — the three remaining printed sac-cost unions, measured at 11 carriers across
    // BOTH grammars (the cast additional-cost lane: Heartfire, Final Flare, Merciless Resolve …; the
    // activated-ability lane: Ragamuffyn, Ertai the Corrupted, Spark Reaper, Dredge …). Same one-evaluator
    // pattern as artifactOrCreature above; the fail-closed `false` below still catches any key no branch names.
    type === "creatureOrEnchantment" ? (t.includes("Creature") || t.includes("Enchantment")) :
    type === "creatureOrPlaneswalker" ? (t.includes("Creature") || t.includes("Planeswalker")) :
    type === "creatureOrLand" ? (t.includes("Creature") || t.includes("Land")) :
    false;
  if (!baseOk) return false;
  if (!subtype) return true;
  // Subtype lives after the em dash ("Legendary Creature — Serpent"); match it word-bounded, case-insensitive.
  const dash = t.indexOf("—");
  const subtypeStr = (dash >= 0 ? t.slice(dash + 1) : "").toLowerCase();
  return new RegExp(`\\b${subtype.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(subtypeStr);
}
// AC-1 (count-of-N additional costs, CR 601.2f) — the deterministic "least valuable" ranking the engine uses to
// pick WHICH N permanents/cards to give up when a spell's additional cost demands N>1 (Bankrupt in Blood /
// Phyrexian Tribute "sacrifice two creatures"; Cathartic Reunion "discard two cards"). Mirrors runProgram's
// autoPickSacrificeCandidate / autoPickDiscardCandidate EXACTLY — lowest mana value, then lowest printed power,
// then codepoint name, then id — so the choice is serialize-stable (no Math.random) and consistent with how an
// edict / each-player-discard auto-picks a single victim. The N-count offer reuses this single-choice policy N
// times (take the N cheapest) rather than enumerating C(pool,N) combinations, which would explode the action set.
const _cmpStr = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
function leastValuablePermanentCmp(a, b) {
  return tutorManaValue(a.card) - tutorManaValue(b.card) ||
    (Number(a.card?.power) || 0) - (Number(b.card?.power) || 0) ||
    _cmpStr(String(a.card?.name || ""), String(b.card?.name || "")) ||
    _cmpStr(String(a.id || ""), String(b.id || ""));
}
function leastValuableCardCmp(a, b) {
  return tutorManaValue(a) - tutorManaValue(b) ||
    (Number(a.power) || 0) - (Number(b.power) || 0) ||
    _cmpStr(String(a.name || ""), String(b.name || "")) ||
    _cmpStr(String(a.id || ""), String(b.id || ""));
}
function isSorcerySpeed(card) {
  const type = typeLineOf(card);
  // Sorcery-speed = anything that ISN'T an Instant and doesn't have FLASH (CR 702.8a — "You may cast this spell any time you
  // could cast an instant"). The card's OWN keyword, read by the oracle-aware hasKeyword (the Scryfall keywords array, else
  // the line-anchored scan — the two agree on every one of the corpus's 613 Flash cards, checked 2026-09-30); a GRANTED flash
  // is the separate flash-cast-permission path in the cast builder. Until the 09-06 plan's stage ③ · 22 (2026-09-30) this
  // read the type line alone, so a Flash permanent was castable only at sorcery speed — strictly weaker than printed.
  return !type.includes("Instant") && !hasKeyword(card, "Flash");
}
// hasKeyword is imported from keywords.js (oracle-aware) — a local copy here
// previously shadowed it (keyword-array-only, oracle-blind), so Haste / Flying
// checks silently failed on real cards that carry oracle text but no keywords
// array. Removed; all call sites now use the import.

function manaCostOf(card) {
  if (!card) return "";
  // An EMPTY cost STRING is not a real cost. A DFC / MDFC / transform card leaves the top-level
  // mana_cost "" and carries the castable cost on card_faces[0] (you cast it from its front face,
  // CR 712.4a). The old `typeof === "string"` guards returned that "" early — so such a card read
  // as FREE TO CAST. Skip empties (and a non-string mana) and fall through to the front face before
  // giving up. A genuinely costless card (suspend-only spell, token) has no face cost either, so it
  // still returns "" — correct (it has no mana cost).
  if (card.mana && typeof card.mana === "string") return card.mana;
  if (card.mana_cost && typeof card.mana_cost === "string") return card.mana_cost;
  if (Array.isArray(card.card_faces) && card.card_faces[0]) {
    return card.card_faces[0].mana_cost || card.card_faces[0].mana || "";
  }
  return "";
}

// ─── Timing rules ─────────────────────────────────────────────────────────────

/**
 * Can the player cast a sorcery-speed card right now?
 * Per CR 307.1: only during own main phase, when the stack is empty,
 * and only the active player. Lands follow the same window.
 */
function canCastSorcerySpeed(state, playerId) {
  return (
    state.activePlayer === playerId &&
    state.priorityHolder === playerId &&
    state.stack.length === 0 &&
    (state.phase === "precombat-main" || state.phase === "postcombat-main") &&
    state.step === "main"
  );
}

/**
 * Can the player cast an instant-speed card right now?
 * Per CR 307.1: any time you have priority. We don't validate priority
 * timing windows further (e.g., during damage resolution); the engine
 * surfaces priority via state.priorityHolder.
 */
function canCastInstantSpeed(state, playerId) {
  if (state.priorityHolder !== playerId) return false;
  // SG-8 — Dosan the Falling Leaf: "Players can cast spells only during their own turns." Any battlefield
  // permanent (any controller — the static is symmetric, CR 604.2) locks every OFF-turn cast; own-turn
  // casts are untouched. Read off the same sentence the static parser marks, via castOwnTurnOnlyLock.
  if (state.activePlayer !== playerId
    && Object.values(state.players || {}).some((p) => (p.battlefield || []).some((perm) => castOwnTurnOnlyLock(perm.card)))) return false;
  return true;
}

// ─── Action generators ───────────────────────────────────────────────────────

function actionPassPriority(playerId) {
  return { kind: "pass-priority", playerId };
}

/**
 * EXTRA-LAND-DROPS (CR 305.2 / 505.5b) — the number of lands `playerId` may play THIS turn = the base one
 * (CR 305.2) PLUS the additional plays granted by every static they control ("You may play an additional land
 * on each of your turns" — Exploration → +1; Azusa → +2). Sums extraLandDropsOf across the player's BATTLEFIELD
 * and COMMAND ZONE (a creature-commander like Azusa grants nothing while it sits in the command zone — it must
 * be on the battlefield — so the command-zone scan finds nothing for it; the scan is there only for a future
 * command-zone-functioning grant, mirroring the cost-reducer two-zone pattern). The SINGLE source of truth for
 * the per-turn land allowance — both the action gate (actionsPlayLand) and the dispatcher gate (applyPlayLand)
 * call this, so they can't drift (the CREED two-sites invariant). Pure; ≥ 1 always.
 */
export function landDropAllowance(state, playerId) {
  const player = state.players[playerId];
  if (!player) return 1;
  let extra = 0;
  for (const perm of player.battlefield || []) extra += extraLandDropsOf(perm.card);
  // Command-zone entries are BARE card objects (no { card } wrapper), like the cost-reducer scan. No modeled
  // extra-land card functions from the command zone today, so this contributes 0 — but kept for symmetry.
  for (const card of player.command || []) extra += extraLandDropsOf(card);
  // ONE-SHOT-EXTRA-LAND (CR 505.5b): a resolving "you may play [N] additional land[s] this turn" effect
  // (Explore → +1, Summer Bloom → +3) bumps the player's per-turn budget (play-extra-land-this-turn atom →
  // player.extraLandsThisTurn). It's reset each of the player's turns (resetTurnCounters) so it never persists
  // like the static "each of your turns" form (extraLandDropsOf, above). `?? 0` — not `|| 0` — so a literal 0
  // budget (no effect resolved) reads exactly 0, never a fabricated allowance.
  extra += player.extraLandsThisTurn ?? 0;
  return 1 + extra;
}

/**
 * FLASH-CAST-PERMISSION (CR 601.3e) — the flash-cast-permission specs `playerId` currently has, from every
 * static they control ("You may cast <FILTER> spells as though they had flash" — Yeva, Vedalken Orrery,
 * Leyline of Anticipation, …). A static ability functions ONLY while its source is on the battlefield (CR
 * 113.6), so only the battlefield is scanned — a creature-commander carrying this clause grants nothing while
 * it sits in the command zone. Each spec is the serializable `{ any } | { qualifiers }` filter; the cast site
 * tests each castable card against them (spellMatchesFlashFilter) to decide instant-speed timing. Gathered
 * ONCE per castActionsFromZone (invariant across the loop), mirroring the cost-reducer hoist. Pure; [] when
 * the player controls no such static.
 */
export function flashPermissionSpecsFor(state, playerId) {
  const player = state.players?.[playerId];
  if (!player) return [];
  const specs = [];
  for (const perm of player.battlefield || []) {
    for (const spec of flashCastPermissionsOf(perm.card)) specs.push(spec);
  }
  // TURN-SCOPED grants (the spell form of the same permission — Borne Upon a Wind). Same spec shape as
  // the statics above, cleared at untap with the other per-turn player state, so ONE list serves both.
  for (const spec of player.flashGrantsThisTurn || []) specs.push(spec);
  return specs;
}

function actionsPlayLand(state, playerId) {
  if (!canCastSorcerySpeed(state, playerId)) return [];
  const player = state.players[playerId];
  if (player.landsPlayedThisTurn >= landDropAllowance(state, playerId)) return [];

  const actions = [];
  for (const card of player.hand) {
    // MODAL DFC with a land back (V1 slice 1, 2026-09-04 — the Pathways; the ZNR/MH3 spell//lands): the land drop
    // chooses a FACE (CR 712.8), so each land face is its own play-land action carrying the projected `faceCard`, and
    // the dispatcher enters that face. The combined card is never offered as a land any more — it used to enter as
    // the mashed two-face card with only the FRONT's mana (a Pathway could never be its back face).
    if (isModalDfc(card)) {
      for (const face of mdfcLandFaces(card)) {
        actions.push({ kind: "play-land", playerId, cardId: card.id, name: face.name, faceCard: face });
      }
      continue;
    }
    if (!isLand(card)) continue;
    actions.push({ kind: "play-land", playerId, cardId: card.id, name: card.name });
  }
  return actions;
}

// Bounds the X choices surfaced for an X-spell (CR 107.3). The mana ceiling already
// caps it in practice; this is the backstop so a turbo-mana board can't flood the
// action list (and the UI) with dozens of near-identical casts.
const X_CHOICE_CAP = 10;

/**
 * Affordable X values for an {X}-cost spell, as a bounded ascending list [1..maxX].
 * maxX = total available mana (pool + untapped sources) minus the fixed cost. Each
 * candidate is verified through the real `canAfford` planner (so colored-pip
 * constraints are exact, not estimated); since adding +1 generic only ever makes the
 * cost harder, affordability is monotonic in X — the first failure ends the list.
 * X=0 is legal but never useful here (a 0 X-spell does nothing), so we start at 1.
 */
function affordableXValues(state, playerId, cost) {
  const player = state.players[playerId];
  const sources = manaSources(state, playerId);
  const poolTotal = totalAvailableMana(state, playerId);
  const sourceTotal = sources.reduce((sum, s) => sum + (s.amount || 1), 0);
  const ceiling = Math.min(poolTotal + sourceTotal, X_CHOICE_CAP);
  const out = [];
  for (let x = 1; x <= ceiling; x++) {
    const xCost = xResolvedCost(cost, x);
    if (!canAfford(player.manaPool, sources, xCost)) break; // monotonic in X
    out.push(x);
  }
  return out;
}

/**
 * Resolve a parsed cost at a chosen X: fold the X mana into the generic portion.
 * The amount owed is `xCount * X` (CR 107.3) — a {X}{X} cost charges 2X, not X.
 * `xCount` defaults to 1 (a single {X}) for any cost parsed before this field
 * existed, so the single-X path is byte-identical to the old `generic + x`.
 * Pure: returns a new cost; the chosen X is NOT the effect magnitude (the action
 * still carries `xValue: x`, which resolution uses for counters/tokens/damage).
 */
export function xResolvedCost(cost, x) {
  const pips = cost.xCount ?? (cost.hasX ? 1 : 0);
  return { ...cost, generic: (cost.generic || 0) + pips * x };
}

function actionsCastSpell(state, playerId) {
  return castActionsFromZone(state, playerId, state.players[playerId].hand, "hand", null);
}

// DISCOVER (LCI) — the decision for a card found by discover (parked in exile, state.pendingDiscover): CAST
// IT FREE (full target/mode/additional-cost enumeration via the shared builder with freeCast=true, fromZone
// "exile" — so targeting/AI/the stack all reuse the normal cast path; X is forced to 0 per CR 601.2b) OR
// PUT IT IN HAND. Both clear pendingDiscover in the dispatcher. An unmodeled found card still offers a (no-op)
// free-cast — the engine's consistent behavior for any unmodeled spell, not a discover gap.
function actionsDiscoverDecision(state, playerId) {
  const pd = state.pendingDiscover;
  if (!pd || pd.controller !== playerId) return [];
  const card = (state.players[playerId]?.exile || []).find((c) => c.id === pd.cardId);
  // K8 (The Key to the Vault): a park whose decline LEAVES the card exiled — the same action kind (so every driver's
  // fallback still finds it), with the flag the dispatcher reads to skip the move to hand.
  const toHand = { kind: "discover-to-hand", playerId, cardId: pd.cardId, name: card?.name, ...(pd.declineTo === "exile" ? { leaveExiled: true } : {}) };
  if (!card) return [toHand]; // defensive: the card vanished from exile → only the (no-op) hand option remains
  return [...castActionsFromZone(state, playerId, [card], "exile", null, true), toHand];
}

// FREE-CAST (CR 601.2b) — the decision for "you may cast a spell with mana value N or less from your hand
// without paying its mana cost" (Rishkar's Expertise et al.), parked in state.pendingFreeCast by the free-cast
// atom. Offer a FREE-CAST action per still-eligible hand candidate (full target/mode/additional-cost
// enumeration via the shared builder with freeCast=true, fromZone "hand" — so targeting/AI/the stack all
// reuse the normal cast path; X is forced to 0 per CR 601.2b) PLUS a DECLINE action (the "may" — CR 601.2b).
// The candidate ids were captured at resolution; re-validate against the CURRENT hand (a card may have left,
// e.g. an intervening discard) so a stale id never offers a phantom cast. Both the cast and the decline clear
// pendingFreeCast in the dispatcher. An unmodeled candidate still offers a (no-op) free-cast — the engine's
// consistent behavior for any unmodeled spell, identical to discover.
function actionsFreeCastDecision(state, playerId) {
  const pf = state.pendingFreeCast;
  if (!pf || pf.controller !== playerId) return [];
  const hand = state.players[playerId]?.hand || [];
  const ids = new Set(pf.candidateIds || []);
  const candidates = hand.filter((c) => ids.has(c.id));
  const decline = { kind: "free-cast-decline", playerId };
  // Every candidate is cast from HAND for free; concatenate each card's enumerated cast actions, then the
  // decline. A candidate that left the hand is naturally dropped (re-validated above) — never a phantom cast.
  const castActions = candidates.flatMap((card) => castActionsFromZone(state, playerId, [card], "hand", null, true));
  return [...castActions, decline];
}

// CASCADE (CR 702.85a) — the decision for a card found by cascade (parked in exile, state.pendingCascade): CAST
// IT FREE (full target/mode/additional-cost enumeration via the shared builder with freeCast=true, fromZone
// "exile" — so targeting / the stack / cast triggers / AI all reuse the normal cast path; X is forced to 0 per
// CR 601.2b) OR DECLINE (the "may" — the found card joins "the rest" on the BOTTOM of the library). This differs
// from discover's two options only in the non-cast branch: discover puts the found card in HAND, cascade bottoms
// it (CR 702.85a — "Put the exiled cards on the bottom in a random order"). Both clear pendingCascade in the
// dispatcher. An unmodeled found card still offers a (no-op) free-cast — the engine's consistent behavior for
// any unmodeled spell, identical to discover.
function actionsCascadeDecision(state, playerId) {
  const pc = state.pendingCascade;
  if (!pc || pc.controller !== playerId) return [];
  const card = (state.players[playerId]?.exile || []).find((c) => c.id === pc.cardId);
  const decline = { kind: "cascade-decline", playerId, cardId: pc.cardId };
  if (!card) return [decline]; // defensive: the card vanished from exile → only the (no-op) decline remains
  return [...castActionsFromZone(state, playerId, [card], "exile", null, true), decline];
}

// CMD-CAST (CR 903.8) — a player may cast a commander they own FROM the command zone; it costs an
// additional {2} for each PREVIOUS time they've cast it from the command zone this game (the "commander
// tax"). This mirrors hand-casting EXACTLY (same timing / affordability / target / X / modal / additional
// -cost machinery) via the shared `castActionsFromZone`, adding only the per-commander tax + a
// `fromZone:"command"` marker. Commander-mode only: gated on a non-empty command zone, so Standard (no
// command zone) is a no-op. Most commanders are creatures → sorcery-speed timing via isSorcerySpeed.
function actionsCastCommander(state, playerId) {
  const player = state.players[playerId];
  const command = player.command || [];
  if (command.length === 0) return [];
  const counts = player.commanderCastCount || {};
  const taxFn = (card) => 2 * (counts[card.commanderInstanceId || card.id] || 0);
  const actions = castActionsFromZone(state, playerId, command, "command", taxFn);
  // ADVENTURE commander (CR 715 + 903.8): the shared builder skips a COMBINED adventure card (CR 715.2b),
  // which silently made an adventure commander (Kellan, the Fae-Blooded / Beluna Grandsquall) uncastable
  // from the command zone at all. Mirror the two hand generators: project each half onto its face and run
  // it through the SAME builder with the SAME tax (casting either half from the command zone is casting
  // the commander — the dispatcher bumps commanderCastCount on fromZone "command" for both).
  for (const card of command) {
    if (!isAdventureCard(card)) continue;
    // Creature half — like hand step 1b: NOT tier-gated (entering as the printed creature body is the
    // same posture as every body-only creature; strictly more faithful than an uncastable commander).
    const creature = creatureFaceCard(card);
    if (creature) {
      for (const a of castActionsFromZone(state, playerId, [creature], "command", taxFn)) {
        actions.push({ ...a, faceCard: creature });
      }
    }
    // Adventure half — like hand step 1: gated on BOTH halves modeled (THE CREED — the adventure
    // spell's effect must resolve natively). It resolves, then exiles the card _onAdventure; the
    // creature half later casts from exile TAX-FREE (CR 903.8 taxes only command-zone casts).
    if (isNativeTier(classifyCard(card))) {
      const face = adventureFaceCard(card);
      if (face) {
        for (const a of castActionsFromZone(state, playerId, [face], "command", taxFn)) {
          actions.push({ ...a, adventureCast: true, faceCard: face });
        }
      }
    }
  }
  return actions;
}

// CMD-COMPANION (CR 702.139) — the once-per-game "{3}: put this card from outside the game into your hand"
// action. Sorcery-speed (own main, empty stack); offered only while the companion is still outside the game
// (player.companion is set). The dispatcher pays {3}, moves it to hand, and clears the field, so it's offered
// exactly once. After that the companion is a NORMAL hand card — cast via actionsCastSpell, NO commander tax.
function actionsCompanion(state, playerId) {
  const player = state.players[playerId];
  const companion = player.companion;
  if (!companion) return [];
  if (!canCastSorcerySpeed(state, playerId)) return [];
  const cost = parseManaCost("{3}");
  if (!canAfford(player.manaPool, manaSources(state, playerId), cost)) return [];
  return [{ kind: "companion-to-hand", playerId, cardId: companion.id, name: companion.name, cost, cmc: 3 }];
}

// SELF-METRIC-COST-REDUCTION (CR 601.2f) — the generic-mana reduction a spell grants ITS OWN cast via a
// "This spell costs {X} less to cast, where X is <metric>" clause (Ghalta / The Great Henge / Cavern-Hoard
// Dragon / Excalibur). selfCostReductionMetric parses the clause to a serializable metric kind (or null); this
// evaluates that kind against the LIVE board (read at cast announce). Generic-only + floored by the caller; the
// mana value is untouched (CR 202.3). 0 when the card has no self-metric clause. The four modeled metrics:
//   • totalPowerYouControl            — Σ live power of the controller's creatures (layer-aware creaturePower).
//   • greatestPowerYouControl         — the single greatest live power (reuses countForSpec — same as the draw/mana path).
//   • greatestArtifactsAnOpponentControls — the MAX, over the controller's opponents, of that opponent's artifact count.
//   • totalManaValueHistoricYouControl — Σ MV of the controller's HISTORIC permanents (artifact / legendary / Saga, CR 702.149a).
function selfCostReductionForSpell(state, playerId, card) {
  const metric = selfCostReductionMetric(card);
  if (!metric) return 0;
  const player = state.players[playerId];
  if (!player) return 0;
  switch (metric.kind) {
    case "totalPowerYouControl":
      return (player.battlefield || [])
        .filter((p) => /\bCreature\b/.test(typeLineOf(p.card)))
        .reduce((sum, p) => sum + Math.max(0, creaturePower(p, state)), 0); // CR 107.1b — a negative power contributes 0 to a "total power" count
    case "greatestPowerYouControl":
      return countForSpec(state, { controller: playerId }, { kind: "greatestPowerYouControl" });
    case "lifeBelowStart":
      // LIFE-BELOW-START (Shadow of Mortality, CR 119.1): X = starting life − current life, floored at 0
      // (the printed "if less than" condition is exactly the floor). startingLife is stamped per player at
      // game creation; a legacy state without it falls back to the current life → reduction 0 (never over-cut).
      return Math.max(0, (player.startingLife ?? player.life) - player.life);
    case "creatureDiedThisTurn": // MORBID (KT-8): a fixed reduction if ANY creature died this turn — every seat's count (CR 700.4)
      return Object.values(state.players || {}).some((pl) => (pl?.creaturesDiedThisTurn || 0) > 0) ? metric.amount : 0;
    case "greatestArtifactsAnOpponentControls": {
      let best = 0;
      for (const oppId of opponentsOf(state, playerId)) {
        const opp = state.players[oppId];
        if (!opp) continue;
        const n = (opp.battlefield || []).filter((p) => /\bArtifact\b/.test(typeLineOf(p.card))).length;
        if (n > best) best = n;
      }
      return best;
    }
    case "totalManaValueHistoricYouControl":
      return (player.battlefield || [])
        .filter((p) => isHistoricPermanent(p.card))
        .reduce((sum, p) => sum + manaValueOf(p.card), 0);
    // PER-EACH (Karador, Ghost Chieftain — "costs {1} less to cast for each creature card in your
    // graveyard"): a per-unit times a live COUNT, rather than the single number every other metric here
    // yields. The count runs through countForSpec — the SAME dispatcher greatestPowerYouControl above
    // already uses, and the same one the layer-7c P/T lane reads — so the cost path and the P/T path can
    // never disagree about what a count source means. The synthetic `{controller: playerId}` subject is the
    // established shape at this call site; every source the cost metric can carry is controller-scoped
    // (graveyard / hand / board), none needs a permanent identity.
    case "perEachCount":
      return (metric.per || 0) * countForSpec(state, { controller: playerId }, metric.countSpec);
    default:
      return 0;
  }
}

// HISTORIC (CR 702.149a) — an artifact, a legendary permanent, OR a Saga. Used by the Excalibur self-metric.
function isHistoricPermanent(card) {
  const t = typeLineOf(card);
  return /\bArtifact\b/.test(t) || /\bLegendary\b/.test(t) || /\bSaga\b/.test(t);
}

// A permanent's mana value (CR 202.3 — the printed mana cost). Prefer the card's numeric `cmc` (Scryfall), else
// compute it from the mana-cost string. The commander tax / cost reducers never change MV, so the printed cost
// is correct.
function manaValueOf(card) {
  if (typeof card?.cmc === "number" && Number.isFinite(card.cmc)) return card.cmc;
  return totalCmc(parseManaCost(manaCostOf(card)));
}

// COUNTER-NO-TARGET GATE (CR 601.2c) — the spellFilter of a stack-targeting counter clause on an
// instant/sorcery, or null. A spell whose target requirement is a SPELL ON THE STACK ("counter target
// [noncreature|creature|…] spell", incl. soft/MV-exact forms) can't legally be cast with no legal target
// (CR 601.2c). HIGH single-/multi-atom counters already self-gate via expandCastChoices (the program path
// `continue`s before the no-target fall-through), so this exists for the LOW-confidence counters (Remand,
// Cryptic Command, Force of Will, Daze, Stubborn Denial, …) whose unmodeled rider/alt-cost drops the
// program below HIGH — they currently fall through to the no-target `else` and are wrongly OFFERED at an
// empty stack. Detection reuses the canonical, anchored counterClauseParser (so the spellFilter discipline
// can't drift): split the oracle on sentence / line / bullet / em-dash boundaries (mirroring how the parser
// segments clauses) and return the first fragment that parses to a `counter` atom targeting a spell.
//   FN-SAFE: a counter clause the parser can't anchor-match (Disallow / Voidslime "counter target spell,
//   activated ability, or triggered ability" — which can target an ABILITY, so a spell needn't be present)
//   returns null → behavior UNCHANGED. Restricted to instant/sorcery so a CREATURE/permanent whose counter
//   lives in a triggered ability (Mystic Snake "When this enters, counter target spell") is never gated —
//   its cast needs no stack target (the counter fires from the ETB trigger at resolution).
function counterSpellTargetFilter(card) {
  const type = typeLineOf(card);
  if (!type.includes("Instant") && !type.includes("Sorcery")) return null; // cast-time counters only
  const oracle = String(card?.oracle || card?.oracle_text || "");
  if (!/counter target .*?spell/i.test(oracle)) return null;               // cheap pre-filter
  const fragments = oracle
    .replace(/\([^)]*\)/g, " ")    // strip reminder text
    .split(/[\n.]|•|—/)            // sentences / lines / modal bullets / em-dash mode headers
    .map((s) => s.replace(/^[\s•-]+/, "").trim())
    .filter(Boolean);
  for (const frag of fragments) {
    const atom = counterClauseParser(frag);
    if (atom && atom.op === "counter" && atom.targetType === "spell") return atom.spellFilter || "any";
  }
  return null;
}

// Shared cast-action builder for a player's castable zone (hand or command). `taxFn(card)` returns the
// extra GENERIC mana to add to the printed cost (CR 903.8 commander tax); null = untaxed. `fromZone`
// rides on every emitted action so the dispatcher splices the card out of the correct zone at cast.
// ===== ALT-COST OFFER (CR 601.2b / 118.9) ===== a printed ALTERNATIVE casting cost ("[if <cond>, ] you may
// cast this spell without paying its mana cost" / "you may <pay X> rather than pay this spell's mana cost").
// The parser strips the sentence and records `program.altCost` metadata (parser.js extractAltCost); COVERAGE
// already credits these cards native at their PRINTED cost. This layer is the PLAY-QUALITY half: actually
// OFFER the alternative payment so a player/AI can cast Fierce Guardianship free or pitch to Force of Will.
//
// OFFERED_ALT_COST_KINDS is the offer layer's OWN wave gate — deliberately separate from the parser's
// SUPPORTED_ALT_COST_KINDS (that set gates which STRIPS are coverage-vetted; this set gates which payments
// the cast path knows how to ENFORCE). Growing this set never moves any card's tier (offering is
// runtime-only); the parser stays untouched so the program fingerprint can't drift.
const OFFERED_ALT_COST_KINDS = new Set(["free", "payLife", "payLifeExilePitch", "exileColorCard", "sacrificeCreature", "returnLandsToHand", "tapCreature", "sacrificeLands"]);

// Cheap oracle pre-screen so the offer layer never adds a parseEffectProgram call for a non-carrier
// (castActionsFromZone otherwise parses programs only past the affordability gate). Curly apostrophes are
// matched via the dot ("spell's"/"spell’s" — the parser normalizes, raw oracle may not).
const ALT_COST_OFFER_HINT = /rather than pay this spell.s mana cost|without paying its mana cost|evoke\s*[—–-]/i; // + evoke (Solitude)

const ALT_COST_COLOR_LETTER = { white: "W", blue: "U", black: "B", red: "R", green: "G" };

// The offer-side CONDITION gate. Unknown condition → false (never offer a gate we can't name — the parser's
// condition enum guard already keeps such a card LOW, this is the belt-and-suspenders second site).
function altCostConditionHolds(state, playerId, condition) {
  if (condition === "always") return true;
  if (condition === "controlCommander") {
    // "You control a commander" — control means ON THE BATTLEFIELD (CR 109.4: only battlefield/stack objects
    // have a controller). A commander sitting in the command zone is controlled by NO ONE — scanning the
    // command zone here would let the AI cast Fierce Guardianship free on turn 1 (the cardinal FP). The
    // isCommander FLAG rides the card onto the battlefield permanent (gameState designation + cmdCast).
    return (state.players[playerId]?.battlefield || []).some((p) => p.card?.isCommander === true);
  }
  if (condition === "notYourTurn") return state.activePlayer !== playerId;
  if (condition === "yourTurn") return state.activePlayer === playerId; // Mine Collapse "If it's your turn, …" (2026-09-30)
  if (condition === "submergeGate") {
    // Submerge: "an opponent controls a Forest and you control an Island" — type-line subtypes, live board.
    const hasSubtype = (p, re) => { const t = typeLineOf(p.card); return t.includes("Land") && re.test(t); };
    if (!(state.players[playerId]?.battlefield || []).some((p) => hasSubtype(p, /\bIsland\b/i))) return false;
    return Object.entries(state.players).some(([pid, pl]) =>
      pid !== playerId && (pl?.battlefield || []).some((p) => hasSubtype(p, /\bForest\b/i)));
  }
  if (typeof condition === "string" && condition.startsWith("controlLand:")) {
    const re = new RegExp(`\\b${condition.slice("controlLand:".length)}\\b`, "i");
    return (state.players[playerId]?.battlefield || []).some((p) => { const t = typeLineOf(p.card); return t.includes("Land") && re.test(t); });
  }
  return false;
}

// Pitch candidates ("exile a <color> card from your hand"): the card's COLOR (CR 105.2 — the Scryfall
// `colors` array, indicators included, mana-cost pips fallback via layers.colorsOf), NEVER color identity
// (CR 903.4 is deck-construction only — identity would illegally offer a colorless card with a rules-text
// {U} pip). The spell being cast is on its way to the stack and is NOT a legal pitch (mirror the
// additional-cost discard exclusion).
function altPitchCandidates(player, card, color) {
  const letter = ALT_COST_COLOR_LETTER[color];
  if (!letter) return [];
  return (player.hand || []).filter((h) => h.id !== card.id && colorsOf(h).includes(letter));
}

// Enumerate every legal way to pay the alt cost, as plain payment fields for the action's `altCost` marker.
// Empty array → the alt cost is UNPAYABLE → no offer (illegal-if-unpayable; the dual offer only ever emits
// payable variants, so the dispatcher's fail-fast throws are true upstream-bug detectors).
function enumerateAltPayments(state, playerId, card, alt) {
  const player = state.players[playerId];
  switch (alt.kind) {
    case "free":
      return [{}];
    case "payLife":
      // CR 119.4 — you can't pay more life than you have (paying to exactly 0 is legal; the SBA follows).
      return (player.life ?? 0) >= alt.amount ? [{ payLife: alt.amount }] : [];
    case "payLifeExilePitch": {
      if ((player.life ?? 0) < alt.amount) return [];
      return altPitchCandidates(player, card, alt.color).map((h) => ({ payLife: alt.amount, exilePitchId: h.id, exilePitchName: h.name ?? null }));
    }
    case "exileColorCard":
      return altPitchCandidates(player, card, alt.color).map((h) => ({ exilePitchId: h.id, exilePitchName: h.name ?? null }));
    case "sacrificeCreature": {
      // color:null is the unfiltered "a creature" form (Dark Triumph, 2026-09-30); a colour word that isn't a colour → nothing.
      const letter = alt.color == null ? null : ALT_COST_COLOR_LETTER[alt.color];
      if (alt.color != null && !letter) return [];
      return (player.battlefield || [])
        .filter((v) => sacTypeMatches(v.card, "creature")
          && (!alt.nontoken || !v.card?.token)
          && (letter == null || colorsOf(v.card).includes(letter))
          // A victim whose OWN leave-trigger the dies path can't fire is excluded (mirror the
          // additional-cost sacrifice filter) so we never partially apply a payment.
          && !sacrificeDropsTrigger(v.card?.oracle || v.card?.oracle_text || ""))
        .map((v) => ({ sacId: v.id, sacName: v.card?.name ?? null }));
    }
    case "returnLandsToHand": {
      // ONE canonical land set — never combinatorial (Gush over 10 Islands is C(10,2)=45 near-identical
      // payments per priority window for zero decision value). Same-subtype lands are near-fungible and a
      // TAPPED land is strictly cheaper to return, so: tapped first, then untapped, id-ascending tiebreak
      // (deterministic). Lands carrying an unmodeled leaves/LTB trigger are excluded (leave-drain safety,
      // mirroring the γ1g return-cost offer gate).
      const re = new RegExp(`\\b${alt.subtype}\\b`, "i");
      const lands = (player.battlefield || [])
        .filter((p) => { const t = typeLineOf(p.card); return t.includes("Land") && re.test(t) && !sacrificeDropsTrigger(p.card?.oracle || p.card?.oracle_text || ""); })
        .sort((a, b) => (Number(!!b.tapped) - Number(!!a.tapped)) || String(a.id).localeCompare(String(b.id)));
      if (lands.length < alt.count) return [];
      const chosen = lands.slice(0, alt.count);
      return [{ returnLandIds: chosen.map((l) => l.id), returnLandNames: chosen.map((l) => l.card?.name ?? null) }];
    }
    case "sacrificeLands": {
      // "you may sacrifice a Mountain / two Mountains rather than pay this spell's mana cost" (Thunderclap, Crash, Mine Collapse,
      // Fireblast, Mogg Alarm, Pulverize — 2026-09-30). ONE canonical land set, on Gush's reasoning above: same-subtype lands
      // are near-fungible and a TAPPED land is strictly cheaper to give up, so tapped first, then untapped, id-ascending
      // tiebreak — never C(n,k) near-identical payments. Lands whose own leave trigger the engine can't fire are excluded
      // (the same sacrificeDropsTrigger gate the creature sacrifice uses), so a payment is never partially applied.
      const re = new RegExp(`\\b${alt.subtype}\\b`, "i");
      const lands = (player.battlefield || [])
        .filter((p) => { const t = typeLineOf(p.card); return t.includes("Land") && re.test(t) && !sacrificeDropsTrigger(p.card?.oracle || p.card?.oracle_text || ""); })
        .sort((a, b) => (Number(!!b.tapped) - Number(!!a.tapped)) || String(a.id).localeCompare(String(b.id)));
      if (lands.length < alt.count) return [];
      const chosen = lands.slice(0, alt.count);
      return [{ sacLandIds: chosen.map((l) => l.id), sacLandNames: chosen.map((l) => l.card?.name ?? null) }];
    }
    case "tapCreature":
      // "you may tap an untapped creature you control rather than pay this spell's mana cost" (the Mercadian
      // Plains cycle — Ramosian Rally, Orim's Cure …). One payment per UNTAPPED creature you control, judged
      // layer-aware (an animated land counts). A summoning-sick creature IS a legal payment: CR 302.6 bars only
      // the creature's OWN {T}/{Q} abilities and its attacking — never a cost another spell asks for.
      return (player.battlefield || [])
        .filter((p) => !p.tapped && permanentIsCreature(state, p.id))
        .map((p) => ({ tapCreatureId: p.id, tapCreatureName: p.card?.name ?? null }));
    default:
      return []; // un-offered kind — computeAltCastSpec already gated, defensive
  }
}

function altCastName(alt, pay) {
  if (alt.kind === "free") return "cast without paying its mana cost";
  const bits = [];
  if (pay.payLife) bits.push(`pay ${pay.payLife} life`);
  if (pay.exilePitchId) bits.push(`exile ${pay.exilePitchName ?? "a card"} from hand`);
  if (pay.sacId) bits.push(`sacrifice ${pay.sacName ?? "a creature"}`);
  if (pay.returnLandIds) bits.push(`return ${pay.returnLandIds.length} ${alt.subtype ?? "land"}s to hand`);
  if (pay.tapCreatureId) bits.push(`tap ${pay.tapCreatureName ?? "a creature"}`);
  if (pay.sacLandIds) bits.push(`sacrifice ${pay.sacLandIds.length} ${alt.subtype ?? "land"}${pay.sacLandIds.length === 1 || alt.subtype === "Plains" ? "" : "s"}`);
  return bits.join(", ");
}

// The per-card OFFER decision: a payable, condition-satisfied, wave-vetted alt cost on a HIGH program.
// HIGH is the ALT-6 population gate — the 15 LOW altCost carriers (Misdirection, Deflecting Swat, Force of
// Vigor, …) attach metadata but their BODIES are unmodeled (Arbiter-routed); offering would cast an
// Arbiter-routed spell for an engine-paid cost. Returns { alt, payments } or null.
function computeAltCastSpec(state, playerId, card) {
  const program = parseCastProgram(card); // S1.1 — stripped parse (a Convoke+altCost carrier gated on the raw LOW parse)
  let alt = program?.altCost;
  let needHigh = true;
  // EVOKE ON A PERMANENT (SHELF-85 · Solitude, 2026-09-05): a creature has no cast PROGRAM (its text is a body plus triggers),
  // so the alt cost is read straight off the oracle and the high-program demand — which guards a SPELL's effect — does not
  // apply; the card's playability is the permanent lane's business. Only the evoke shape is admitted this way (the spell-
  // side alt costs keep their program gate).
  if (!alt && /\b(?:creature|artifact|enchantment|planeswalker)\b/i.test(String(card?.type || card?.type_line || "").split(" // ")[0])) {
    const off = extractAltCost(String(card?.oracle ?? card?.oracle_text ?? "")).altCost;
    if (off && off.evoke) { alt = off; needHigh = false; }
  }
  if (!alt || !OFFERED_ALT_COST_KINDS.has(alt.kind)) return null;
  if (needHigh && (!program || programConfidence(program) !== "high")) return null;
  if (!altCostConditionHolds(state, playerId, alt.condition)) return null;
  const payments = enumerateAltPayments(state, playerId, card, alt);
  return payments.length ? { alt, payments } : null;
}

// DISCOVER/free-cast: `freeCast` enumerates a "cast it without paying its mana cost" (CR 601.2b) — it
// BYPASSES the sorcery-speed timing gate (the cast happens during resolution) + the mana affordability
// gate (cost is waived), forces an X-spell's X to 0 (CR 601.2b), and stamps `freeCast` on every emitted
// action (actionDispatcher then skips the mana payment). ADDITIONAL costs still apply (still enumerated
// COLORED-PIP COST-REDUCTION (CR 601.2f) — Morophon "{W}{U}{B}{R}{G}", Edgewalker "{W}{B}", Ragemonger
// "{B}{R}", Nekrataal Avatar "{B}". These reduce COLORED pips, never generic: Edgewalker makes a {1}{W}
// Cleric cost {1}, not {W}. Routing them through the scalar `reduction` channel above would shave the
// generic column instead and make the spell far cheaper than printed — the reason the whole family sat
// body-only rather than being approximated.
//
// Applied AFTER the generic reduction so the two are independent (a card carrying both kinds — none today —
// would get each on its own column). Each colour floors at 0; `generic` and the mana value are untouched
// (CR 202.3). Returns the cost object unchanged when no pip reducer matches, which is every board without
// one of the five cards, so this is a no-op in the common case.
function applyColoredPipReduction(cost, costReducers, card) {
  const pips = coloredPipReductionForSpell(costReducers, card);
  const colors = Object.keys(pips);
  if (!colors.length) return cost;
  const next = { ...cost };
  for (const color of colors) next[color] = Math.max(0, (next[color] || 0) - pips[color]);
  return next;
}

// below). When false (every normal hand/command cast) behavior is byte-identical.
function castActionsFromZone(state, playerId, cards, fromZone, taxFn, freeCast = false) {
  const player = state.players[playerId];
  const actions = [];
  // ALT-COST OFFER: cardId → { alt, payments, affordable } for every alt-carrier in this enumeration.
  // Consumed by the twin post-pass below; empty on every non-carrier deck (the post-pass is then skipped
  // entirely, so the emitted action array is byte-identical to the pre-alt-cost behavior).
  const altSpecs = new Map();
  // FIST OF SUNS (RG-5, 2026-09-05): a board-granted "pay {W}{U}{B}{R}{G} rather than the mana cost" for every hand cast of
  // this player's. The variant's cost IS the five pips, so the normal payment path pays it (never the altCost branch, which
  // pays no mana at all). Offered only when the five pips are payable right now; the printed-cost action survives beside it
  // only when IT is payable (CR 118.9 — the caster picks one).
  const wubrgAlt = grantsWubrgAltCost(state, playerId);
  const WUBRG_COST = wubrgAlt ? parseManaCost("{W}{U}{B}{R}{G}") : null;
  const wubrgSpecs = new Map();

  // STATIC-COST-REDUCTION: the subtype cost-reducers this player controls, gathered ONCE (each zone is
  // invariant across the loop). Skipped for a free-cast (it pays no mana). costReductionForSpell matches each
  // castable card's type line against them below. CR 601.2f. Two sources:
  //   • battlefield permanents — every reducer ("Dragon spells you cast cost {2} less" — Dragonspeaker Shaman).
  //   • the command zone — ONLY EMINENCE reducers (The Ur-Dragon's "as long as ~ is in the command zone or on
  //     the battlefield, other Dragon spells you cast cost {1} less"), so a commander discounts its tribe while
  //     it sits in the command zone (the normal pattern), not only once it has been cast onto the battlefield.
  //     command entries are BARE card objects (no { card } wrapper), unlike battlefield permanents.
  const costReducers = freeCast
    ? []
    : [
        // Pass the battlefield PERMANENTS (not bare cards) so a CHOSEN-TYPE reducer (Urza's Incubator) can pair
        // with its source permanent's stored chosenType; collectCostReducers reads `.card` + `.chosenType`.
        ...collectCostReducers(player.battlefield || []),
        ...collectCostReducers(player.command || [], { commandZone: true }),
      ];
  // STATIC-COST-TAX (CR 601.2f — the increase twin): taxes read EVERY battlefield (Sphere of Resistance
  // taxes everyone; Thalia taxes her own controller too; a "your opponents cast" tax skips its controller
  // via the stamped controller vs playerId check in costTaxForSpell). Gathered ONCE like the reducers.
  // A free-cast pays no mana, so no tax applies (CR 601.2f adjusts a cost that is being paid).
  const costTaxers = freeCast
    ? []
    : collectCostTaxers(Object.entries(state.players || {}).map(([pid, p]) => ({ controller: pid, battlefield: p.battlefield }))); 

  // FLASH-CAST-PERMISSION (CR 601.3e): the flash-cast statics this player controls ("You may cast <FILTER>
  // spells as though they had flash" — Yeva, Vedalken Orrery, …), gathered ONCE (invariant across the loop).
  // A card that isn't instant-speed but matches one of these specs (spellMatchesFlashFilter) is offered at
  // instant speed below (subject to the normal instant-speed priority window). A free-cast bypasses the timing
  // gate entirely, so the specs are unused then.
  const flashSpecs = freeCast ? [] : flashPermissionSpecsFor(state, playerId);

  for (const card of cards) {
    if (isLand(card)) continue;

    // ADVENTURE (CR 715): the COMBINED card is never castable as-is — each half is cast separately via the
    // dedicated adventure generators (adventure half / creature half), which project a single face and re-enter
    // this builder (a projected face has no "//" in its type, so it doesn't trip this gate). Without the skip,
    // a combined type line like "Creature — Giant // Instant — Adventure" reads as containing "Instant" →
    // isSorcerySpeed false → the combined card was offered at INSTANT speed (illegal timing for the creature)
    // at a SUMMED both-halves cost, alongside the correct per-half actions. Skipping is CREED-safe in every
    // zone this builder serves (hand / command / exile / free-cast): a missing offer is a safe FN; the
    // combined-card cast is a false positive.
    if (isAdventureCard(card)) continue;

    // SPLIT CARDS (CR 709): the COMBINED card is never castable as-is — its "{B/G}{B/G} // {4}{B}{G}" cost and
    // its two-face combined oracle would parse to a malformed cost + LOW program. Each half is cast separately
    // via actionsCastSplitFromHand, which projects a single face (no "//" in the projected type/mana, so the
    // face re-enters this builder cleanly). Skipping the combined card is CREED-safe (a missing combined offer
    // is a safe FN; casting the combined card at a summed/malformed cost is a false positive). Fuse/aftermath
    // splits (parseSplitCard returns null for them) are NOT skipped here — they stay Arbiter spells whose
    // combined cast the generic path routes to the Arbiter, unchanged.
    if (isSplitCard(card)) continue;
    // MODAL DFC (V1 slice 2, CR 712.8): the combined "<Spell> // Land" card is never cast as one object — its FRONT face
    // is cast through actionsCastModalDfcFrontFromHand (a projected single face, exactly the split-card lane), and its
    // back is a land drop. The same CREED reasoning as the split skip above: the mashed two-face oracle would parse to a
    // malformed program.
    if (isModalDfc(card)) continue;

    // FLASH-CAST-PERMISSION (CR 601.3e): a sorcery-speed card the player has flash permission for (Yeva → a
    // green creature; Vedalken Orrery → any spell) may be cast whenever the player has priority (instant
    // speed). Checked only when the card ISN'T already instant-speed (a real Instant / a Flash card reads
    // instant-speed via isSorcerySpeed — true since stage ③ · 22) and only against this player's own statics — so it never
    // widens an opponent's timing. A false match is impossible: the spec was validated to a modeled filter
    // upstream (else it's null and never emitted), so this only offers a cast the rules genuinely permit.
    const hasFlashPermission = flashSpecs.length > 0 && flashSpecs.some((spec) => spellMatchesFlashFilter(spec, card));
    const sorcerySpeed = isSorcerySpeed(card) && !hasFlashPermission;
    const timingOk = sorcerySpeed
      ? canCastSorcerySpeed(state, playerId)
      : canCastInstantSpeed(state, playerId);
    if (!freeCast && !timingOk) continue;
    // SAVAGE BEATING (KT-6): a program-level cast window ("Cast this spell only during combat on your turn") — unmet → never offered
    if (!castTimingAllows(state, playerId, card)) continue;
    // ④-E (Nikya of the Old Ways / Nullhide Ferox — CR 604.2): "You can't cast noncreature spells." — the caster's
    // own locker refuses every NON-creature card (the type line's front face; an artifact creature is a creature
    // spell and stays castable). Read off the same sentence the static parser marks. Opponents are untouched.
    if (castNoncreatureLockFor(state, playerId) && !/\bCreature\b/i.test(String(card?.type || card?.type_line || "").split(" // ")[0])) continue;
    // B4 (Reflector Mage — CR 611.2b): a NAME cast lock on this player refuses the named spell until the setter's next turn.
    if (nameCastLocked(state, playerId, card?.name)) continue;
    // S11 (Permission Denied — "your opponents can't cast noncreature spells this turn"): a turn-stamped cast-type lock on
    // this seat refuses every non-creature card while the stamp's turn is the current one (self-expiring).
    {
      const lock = state.castLocksThisTurn?.[playerId];
      if (lock && lock.turn === state.turn && lock.noncreature && !/\bCreature\b/i.test(String(card?.type || card?.type_line || "").split(" // ")[0])) continue;
      // KT-3 (Irencrag Feat): the controller's own "only N more spells this turn" — spells cast since the stamp vs the allowance
      if (lock && lock.turn === state.turn && lock.spellLimit
          && ((state.players[playerId]?.spellsCastThisTurn || 0) - lock.spellLimit.spellsCastAtLock) >= lock.spellLimit.more) continue;
    }

    // CR 202.1a — A CARD WITH NO MANA COST CAN'T BE CAST unless an effect allows it. manaCostOf correctly
    // returns "" for a genuinely costless card (a suspend-only spell — Ancestral Vision, Crashing Footfalls,
    // Wheel of Fate, Profane Tutor — whose ONLY legal entry is paying its suspend cost), but
    // parseManaCost("") yields an all-ZERO cost, which this loop then happily offers. The engine would
    // hand-cast Ancestral Vision for nothing, with no lands, on any turn, every turn. Found 2026-07-25 by
    // the census bug-signature report; the earlier empty-mana_cost audit fixed the DFC/enrichment half of
    // this landmine but its tripwire required cmc>0, so the truly costless cards slipped past it.
    //
    // Precise on both sides: a real zero cost prints as "{0}" and is NOT empty, so Ornithopter / Memnite are
    // untouched; `freeCast` is the legitimate effect-granted permission path and is deliberately exempt (that
    // IS "unless an effect allows it"). Lands never reach here (skipped above).
    if (!freeCast && !String(manaCostOf(card) || "").trim()) continue;
    let cost = parseManaCost(manaCostOf(card));
    // Mana value is a card characteristic the commander tax does NOT change (CR 202.3b) — capture it from
    // the PRINTED cost before the tax is folded into `cost` (which becomes the payable amount).
    const printedCmc = totalCmc(cost);
    if (freeCast) {
      cost = { generic: 0 }; // waived — the dispatcher pays no mana for a free-cast (additional costs still apply)
    } else {
      const tax = taxFn ? taxFn(card) : 0;
      if (tax) cost = { ...cost, generic: (cost.generic || 0) + tax };
      // STATIC-COST-REDUCTION (CR 601.2f): subtype / color / chosen-type reducers ("Dragon spells you cast
      // cost {2} less" — Dragonspeaker; "red or green" — Goblin Anarchomancer; "of the chosen type" — Urza's
      // Incubator) reduce the GENERIC portion only, floored at {0}. SELF-METRIC reduction ("This spell costs
      // {X} less to cast, where X is <board metric>" — Ghalta, The Great Henge, Cavern-Hoard Dragon, Excalibur)
      // is the spell discounting ITS OWN cast by a LIVE board count, read here at cast announce (CR 601.2f).
      // Both are generic-only (the colored pips are NEVER reduced — Math.max(0, …) floors the generic, the pips
      // are untouched). Applied AFTER the commander tax (both adjust the cost to pay) and BEFORE affordability +
      // the {X} branch, so an X-spell's base is reduced before {X}. printedCmc (the mana value) is untouched (CR
      // 202.3). The self-metric reads the casting player's board (creature power / artifact counts / historic MV).
      // STATIC-COST-TAX first (CR 601.2f — cost increases apply before decreases), then the reductions
      // floor the GENERIC at 0. The pips and the mana value are never touched (CR 202.3).
      const staticTax = costTaxForSpell(costTaxers, card, playerId);
      if (staticTax) cost = { ...cost, generic: (cost.generic || 0) + staticTax };
      const reduction = costReductionForSpell(costReducers, card, fromZone) + selfCostReductionForSpell(state, playerId, card);
      if (reduction) cost = { ...cost, generic: Math.max(0, (cost.generic || 0) - reduction) };
      cost = applyColoredPipReduction(cost, costReducers, card);
    }
    // Castable if the pool PLUS what untapped lands/rocks/dorks could produce
    // covers the cost — the dispatcher auto-taps to pay. (Pool-only would
    // never be castable since nothing pre-fills it.) A free-cast skips this (no mana paid).
    // SPEND-RESTRICTED (CR 106.6): the affordability half of the pair. This context MUST match the one the
    // dispatcher passes to planPayment for the same cast, or the two halves disagree and the sim offers a
    // cast whose payment then throws MANA_SHORT — a legal-looking action that cannot be taken. `fromZone` is
    // this builder's own parameter, so commander casts are recognised here exactly as they are there.
    // POOL-RESTRICTED SUB-POOL (QUARTET Phase 4): thread the tagged entries so a qualifying cast can
    // spend them (restricted-first in the planner). The ability-activation path threads NONE — Klauth's
    // "only to cast spells" is enforced by absence (the default-deny posture).
    const spendContext = { castCard: card, isCommander: fromZone === "command", restrictedEntries: player.restrictedMana || [] };
    const affordable = freeCast || canAfford(player.manaPool, manaSources(state, playerId), cost, spendContext);
    // FIST OF SUNS (RG-5): the five-pip alternative — hand casts only, never a free cast, never an X spell (the X would be 0
    // under an alternative cost — a different, unmodeled line), payable right now.
    // RG-8 (2026-09-05 — the Bringers): the card's OWN "You may pay <pips> rather than pay this spell's mana cost" is the
    // same cost-variant; the card's own pips take precedence over a Fist of Suns grant (for the Bringers they coincide).
    const ownPips = (!freeCast && fromZone === "hand") ? fixedManaAltCostOf(card) : null;
    const fixedAltCost = ownPips ? parseManaCost(ownPips) : (wubrgAlt ? WUBRG_COST : null);
    const wubrgAffordable = !!fixedAltCost && !freeCast && fromZone === "hand" && !cost.hasX
      && canAfford(player.manaPool, manaSources(state, playerId), fixedAltCost, spendContext);
    if (wubrgAffordable) wubrgSpecs.set(card.id, { baseAffordable: affordable, cost: fixedAltCost, altManaCost: ownPips ? "own" : "wubrg", altName: `pay ${ownPips || "{W}{U}{B}{R}{G}"} rather than its mana cost` });
    // EMERGE (CR 702.97): the whole POINT of emerge is casting the Eldrazi when the FULL printed cost is out
    // of reach — sacrificing a creature cuts the cost by its mana value. So when the normal cast is NOT
    // affordable, do NOT skip the card outright (the old `if (!affordable) continue`): an emerge cast may
    // still be payable. Compute the emerge spec here (gated on a native body — the SAME gate coverage uses,
    // so the metric and the runtime can't drift) and only `continue` past the card when neither the normal
    // cast NOR any emerge cast is possible. A free-cast pays nothing, so emerge (which needs a sacrifice +
    // reduced mana) isn't offered then.
    const emergeSpec = freeCast ? null : parseEmergeCard(card, classifyCard, isNativeTier);
    // ALT-COST OFFER: computed BEFORE the affordability gate — the whole point of a pitch/free cost is
    // casting when the printed mana is out of reach (mirrors the emerge widening). Hand casts only (the
    // carriers are instants/sorceries; command/exile/free-cast enumerations never dual-offer), and NEVER
    // inside a freeCast (Discover/Cascade/pendingFreeCast) enumeration — those windows' clearing invariant
    // must only ever see action.freeCast casts. The oracle pre-screen keeps non-carriers parse-free here.
    const altSpec = (!freeCast && fromZone === "hand" && ALT_COST_OFFER_HINT.test(String(card?.oracle ?? card?.oracle_text ?? "")))
      ? computeAltCastSpec(state, playerId, card)
      : null;
    if (altSpec) altSpecs.set(card.id, { ...altSpec, affordable });
    // CAST-RESTRICTION (the Fallen Empires combat-trick cycle): "Cast this spell only during the declare
    // attackers step and only if you've been attacked this step." A TIMING + STATE gate printed as a whole
    // sentence. Enforced HERE, at the single cast-offer chokepoint, so the card simply is not offered outside
    // its window — and that enforcement is what lets the classifier credit the sentence. An unenforced cast
    // restriction credited as modeled would hand the engine a combat trick playable at any time, which is a
    // materially stronger card than the printed one.
    if (castOnlyWhenAttacked(card) && !hasBeenAttackedThisStep(state, playerId)) continue;
    // CAST ONLY AFTER ANOTHER SPELL (stage ③ · 12 — Illusory Angel, Skyshroud Condor, Hewed Stone Retainers): "Cast this spell
    // only if you've cast another spell this turn." Refused until the caster's spellsCastThisTurn (this turn's casts, bumped at
    // the cast chokepoint) is at least one — the same enforcement-then-credit basis as the restriction above (CR 601.3).
    if (castOnlyAfterAnotherSpell(card) && !((player.spellsCastThisTurn || 0) >= 1)) continue;
    // ⭐ TARGET-CONDITIONAL REDUCTION (NOT OF THIS WORLD — POD-SIM THREE · KT-9b, 2026-09-05): the printed {7} may fall
    // to {0} depending on the TARGET chosen, so an unaffordable printed cost is not the last word — let the card
    // through on its BEST-CASE cost and settle per chosen target below (each choice re-checks affordability).
    const program = parseCastProgram(card); // S1.1 — stripped parse; matches the classifier + the dispatcher fallback
    const tcr = program?.targetConditionalReduction || null;
    const tcrAffordable = !!tcr && canAfford(player.manaPool, manaSources(state, playerId), { ...cost, generic: Math.max(0, (cost.generic || 0) - tcr.amount) }, spendContext);
    if (!affordable && !emergeSpec && !altSpec && !tcrAffordable && !wubrgAffordable) continue;

    const effect = parseSpellEffect(card);
    // (`program` is bound above the affordability gate — the target-conditional reduction needs it there.)
    const base = {
      kind: "cast-spell",
      playerId,
      fromZone, // CMD-CAST: "hand" (default) or "command" — the dispatcher splices from the right zone
      cardId: card.id,
      name: card.name,
      cost,
      cmc: printedCmc,
      ...(freeCast ? { freeCast: true } : {}), // DISCOVER: the dispatcher skips the mana payment for this cast
      effect: effect || null,
      // P2.2: the serializable EffectProgram the dispatcher resolves through the
      // `effect-program` interpreter. `effect` stays for AI scoring of the legacy
      // single-effect shapes.
      program,
    };

    const isHigh = program && programConfidence(program) === "high";

    // ===== KICKED-SPELL-EFFECT (CR 702.33e) ===== a HIGH instant/sorcery program carrying a `kickedOnly` atom
    // (the "If this spell was kicked, <extra>" additive payoff, parseEffectProgram) can be cast NORMALLY or
    // KICKED. The kicked atoms are TARGETLESS (the parser gate guarantees it), so the per-atom target combos are
    // IDENTICAL for both casts — the kicked variant just folds the kicker pips into the cost and stamps
    // `kicked:true`. The dispatcher threads `kicked` onto the EFFECT_PROGRAM payload; runEffectProgram runs the
    // kickedOnly atoms only on the kicked cast. We compute the kicker cost here (parseKickerCost = the kicker.js
    // source of truth) + whether it's affordable on TOP of the base; the multi-atom emission below crosses each
    // target combo with {kicked:false} and (when affordable) {kicked:true}. A free-cast (Discover) pays nothing,
    // so the kicker is never paid (only the normal cast offered — the base still resolves; a SAFE limitation).
    const kickedSpell = isHigh && (program.atoms || []).some((a) => a.kickedOnly);
    let kickedSpellCost = null, kickedSpellCmc = null, kickedSpellAffordable = false;
    if (kickedSpell && !freeCast) {
      const kStr = parseKickerCost(card); // clean single mana cost (kicker.js gate); the program only carries kickedOnly atoms when this is non-null
      if (kStr) {
        const kCost = parseManaCost(kStr);
        kickedSpellCost = mergeManaCost(cost, kCost);       // base (already taxed/reduced) + the kicker pips
        kickedSpellCmc = printedCmc + totalCmc(kCost);      // CR 202.3b — mana value counts the kicker paid
        kickedSpellAffordable = canAfford(player.manaPool, manaSources(state, playerId), kickedSpellCost);
      }
    }

    // ===== ADDITIONAL COSTS (cast-path, CR 601.2f) ===== a spell carrying a parser-attached additional
    // cost (`program.additionalCosts`) is paid AT CAST. Expand one cast per legal way-to-pay × the program's
    // legal target/mode combos. GATE: no legal way to pay → uncastable (continue; never offer a cast we
    // can't complete). A program is never both xSpell and additional-cost (parseEffectProgram defers that
    // compound to LOW), so this precedes the X / modal / target branches and `continue`s after — additional
    // -cost spells are fully handled here, for every effect shape (expandCastChoices covers single/multi/modal).
    // Cost kinds: sacrifice (γ1b chosen victim) · payLife (no choice) · discard (N=1, chosen hand card).
    // ⛔ NOT GATED ON `isHigh`, AND THAT GATE WAS A SOFT-LOCK. A COST is not an EFFECT: whether the parser can
    // model what the spell DOES has nothing to do with whether its additional cost must be paid. While this
    // read `isHigh ? … : null`, a LOW-confidence spell carrying an additional cost was emitted as a plain cast
    // with NO victim frozen — and the dispatcher's additional-cost loop is unconditional, so it correctly
    // refused to cast cost-free and threw ADDCOST_UNPAID. Every one of the 34 corpus instants/sorceries in
    // that class (Eldritch Evolution, Neoform, Tinker, Final Strike, Tormented Thoughts, …) was a guaranteed
    // wedge the moment a player tried to cast it. Found by the playability sweep, not by any test.
    //
    // Enumerating the cost for a LOW program is the faithful fix rather than suppressing the cast: the cost
    // is paid exactly as printed and the unmodeled EFFECT still routes to the Arbiter, which is where a LOW
    // program was always going. Suppressing instead would have traded a wedge for a dead card in hand —
    // the failure mode the dead-card hunt exists to find.
    // AC-PERMANENT: a permanent spell carries its vetted cost BESIDE the (null) program — see the helper.
    const permAddCosts = program ? null : permanentAdditionalCosts(card);
    let addCost0 = (program?.additionalCosts || permAddCosts || [])[0] || null;
    // PAY-X-LIFE (Toxic Deluge, 2026-08-15) — the ONE vetted cost kind that IS the spell's X: the
    // "never both xSpell and additional-cost" invariant this block documents is deliberately broken by
    // it, and the X-SPELL branch below owns its whole expansion (the life-bounded X range + the
    // dispatcher's loseLife charge). Route it past this block or the terminal continue makes the card
    // uncastable (no way-to-pay branch knows the kind).
    const lifeXAddCost = addCost0?.kind === "payLifeX";
    if (lifeXAddCost) addCost0 = null;
    // ⛔ No vetted cost, but the card PRINTS a mandatory one → do not offer the cast at all. See the helper:
    // casting it is casting cheaper than printed. This must sit BEFORE every remaining cast branch.
    if (!addCost0 && !lifeXAddCost && hasUnvettedMandatoryAdditionalCost(card)) continue; // (payLifeX is vetted — the X branch pays it)
    if (addCost0) {
      // A permanent has no effect atoms to enumerate, so it has exactly ONE (empty) target combo. Asking
      // expandCastChoices for it would return [] (it early-returns on a null program) and the `continue`
      // below would make every one of these cards uncastable — a dead card in hand instead of a paid cast.
      const combos = program ? expandCastChoices(state, playerId, program, colorsOf(card)) : [{ targets: [] }];
      if (combos.length === 0) continue;                  // a required effect target has no legal pick
      // AC-OR (CR 601.2f) — an OR cost expands into one WAY-TO-PAY per option, which is exactly what this
      // block already does for each victim/hand-card within a single cost kind. So the choice needs no new
      // machinery here: loop the options and run the SAME branches, stamping the chosen spec on every action
      // so the dispatcher charges THAT option and not option[0].
      // ⛔ THE `continue`s INSIDE THE BRANCHES NOW MEAN "this option is unpayable, try the next" — which is
      // correct for the OR, AND still correct for a single cost (the loop simply ends). The terminal
      // `continue` after the loop is what keeps a card with NO payable option from falling through to the
      // plain-cast branches below — i.e. it is the line standing between this feature and a FREE SPELL.
      const payWays = addCost0.kind === "choice" ? addCost0.options : [addCost0];
      for (const addCost of payWays) {
      const emit = (ch, extra) => actions.push({
        ...base,
        targets: ch.targets,
        chosenMode: ch.chosenMode ?? null,
        needsTargets: ch.targets.length > 0,
        targetName: ch.targets.map(t => t.name).filter(Boolean).join(", ") || undefined,
        modeName: ch.label || undefined,
        addCostSpec: addCost,                             // ⭐ which option this cast pays (dispatcher reads it)
        ...extra,
      });
      if (addCost.kind === "sacrifice" && (addCost.count ?? 1) > 1) {
        // AC-1 (count-of-N, CR 601.2f) — "sacrifice two creatures" (Bankrupt in Blood, Phyrexian Tribute) /
        // "sacrifice five lands". No combinatorial enumeration: reuse the edict least-valuable policy to pick
        // EXACTLY N victims and offer ONE cast per legal target combo (freezing the N ids on `sacCountIds`,
        // which the dispatcher's additional-cost loop pays). Same fail-safe as γ1b: a victim whose OWN
        // leave-trigger the dies path can't fire is excluded (sacrificeDropsTrigger) so we never partially apply.
        const n = addCost.count;
        const pool = player.battlefield.filter(v =>
          sacTypeMatches(v.card, addCost.sacType) &&
          !sacrificeDropsTrigger(v.card?.oracle || v.card?.oracle_text || ""));
        if (pool.length < n) continue;                    // fewer than N legal victims → cost can't be paid → uncastable
        // QUARTET PHASE 1 (the first converted site, 2026-08-14): behind `state.usePolicyEval` the
        // victim ranking consults the shared board evaluator (boardEval.evalLeastValuableCmp — a Sol
        // Ring is no longer "cheaper" than a vanilla bear just because its MV is lower). Flag absent ⇒
        // the legacy MV-then-power policy byte-identically (the default-off law in
        // SUBSYSTEM-QUARTET-PLAN.md; the flag flips only when the phase gate passes). Ranking-only —
        // the pool's LEGALITY filters above are untouched either way.
        const ranked = [...pool].sort(policyEvalEnabledFor(state, playerId) ? evalLeastValuableCmp(state) : leastValuablePermanentCmp);
        for (const ch of combos) {
          // Don't sacrifice a permanent the effect targets — paid as a cost (gone before the spell resolves) →
          // the target would fizzle (CR 608.2b). Exclude every targeted id BEFORE taking the N cheapest.
          const targeted = new Set(ch.targets.map(t => t.id));
          const chosen = ranked.filter(v => !targeted.has(v.id)).slice(0, n);
          if (chosen.length < n) continue;                // too few once the targeted victims are excluded
          const chosenIds = chosen.map(v => v.id);
          // W3 (two-sites invariant): none of the N one-shot mana victims (Treasure/Gold/Spawn) may ALSO be
          // cracked to pay the spell's mana cost — re-check affordability with all N excluded. A repeatable
          // victim taps first legally, so it's only dropped from the sources when it's a one-shot.
          if (!freeCast) {
            let src = manaSources(state, playerId);
            for (const id of chosenIds) src = sourcesExcludingOneShotVictim(src, id);
            if (!canAfford(player.manaPool, src, cost)) continue;
          }
          emit(ch, { sacCountIds: chosenIds, sacName: `sacrifice ${chosen.map(c => c.card?.name).filter(Boolean).join(", ")}` });
        }
      } else if (addCost.kind === "sacrifice") {
        // γ1b: the player picks which permanent of <type> to sacrifice. A victim whose OWN leave-trigger
        // the dies path can't fire is excluded (sacrificeDropsTrigger) so we never partially apply.
        // SAVAGE ORDER (2026-08-14) — minPower gates the victim pool by LAYER-AWARE power at cast time
        // (creaturePower reads pumps/counters live): a 3-power board can't pay "power 4 or greater".
        const victims = player.battlefield.filter(v =>
          sacTypeMatches(v.card, addCost.sacType) &&
          (addCost.minPower == null || creaturePower(v, state) >= addCost.minPower) &&
          (addCost.color == null || colorsOf(v.card).includes(addCost.color)) &&   // COLOR-qualified sac (Natural Order)
          !sacrificeDropsTrigger(v.card?.oracle || v.card?.oracle_text || ""));
        if (victims.length === 0) continue;               // no legal victim → unpayable → uncastable
        for (const victim of victims) {
          // W3 (two-sites invariant): a ONE-SHOT mana source (Treasure/Gold/Spawn) chosen as THE victim
          // can't also be cracked to pay the mana cost — re-check affordability with it excluded, per
          // victim (another victim or source may still afford). A repeatable victim taps first legally.
          if (!freeCast && !canAfford(player.manaPool, sourcesExcludingOneShotVictim(manaSources(state, playerId), victim.id), cost)) continue;
          for (const ch of combos) {
          // Don't sacrifice the very permanent the effect targets — paid as a cost (gone before the spell
          // resolves) → the target would fizzle (CR 608.2b). Pointless self-defeating action; drop it.
          if (ch.targets.some(t => t.id === victim.id)) continue;
          emit(ch, { sacCreatureId: victim.id, sacCreatureName: victim.card?.name ?? null, sacName: victim.card?.name ? `sacrifice ${victim.card.name}` : undefined });
          }
        }
      } else if (addCost.kind === "payLife") {
        // No choice — just deduct N at cast. CR 119.4: you can't pay life you don't have (paying to exactly
        // 0 is legal, an SBA loss follows), so only a strictly-unaffordable cost is uncastable.
        // R1.5 (audit 2026-07-09): a card admitted past the emission gate ONLY via its altSpec is
        // mana-unaffordable at the printed cost — this branch emits PRINTED-cost casts, so re-check
        // affordability (the sacrifice branch already does per-victim). Without it an unpayable offer
        // reaches the dispatcher and throws MANA_SHORT if picked; the twin post-pass never twins
        // cost-carrying actions, so the alt payment would never be offered either.
        if (!affordable) continue;
        if ((player.life || 0) < addCost.amount) continue;
        for (const ch of combos) emit(ch, { payLifeCost: addCost.amount, payLifeName: `pay ${addCost.amount} life` });
      } else if (addCost.kind === "payMana") {
        // ⭐⭐ AC-MANA (2026-08-07) — "…or pay {3}{B}" (Spark Harvest, Eaten Alive, Lash of the Balrog,
        // Morkrut Behemoth, Bayou Groff).
        // ⛔⛔ THE AFFORDABILITY CHECK MUST BE THE MERGED COST, AND THE PRINTED-COST `affordable` FLAG IS
        // USELESS HERE — in BOTH directions. It can be TRUE while the merged cost is out of reach (offering
        // a cast the dispatcher then can't pay: MANA_SHORT on a legal-looking action), and on a card whose
        // OTHER option got it past the emission gate it can be FALSE while the merged cost is affordable
        // (silently withholding a legal cast). So this branch ignores it and asks `canAfford` about the sum.
        // ⛔ Every other branch's `if (!affordable) continue` is correct for its kind — those costs are not
        // mana, so the printed check is the whole mana question. This one is the exception BECAUSE the cost
        // is itself mana. Do not "tidy" this into the shared guard.
        const mergedCost = addExtraManaCost(cost, addCost.pips);
        if (!freeCast && !canAfford(player.manaPool, manaSources(state, playerId), mergedCost, spendContext)) continue;
        // ⭐⭐ THE CHARGE IS THE SAME OBJECT AS THE OFFER, and that is the entire safety argument. The
        // dispatcher pays `action.cost` through planPayment; stamping the MERGED cost here means the
        // additional mana is charged with NO dispatcher change at all, and offer and payment cannot drift
        // apart — there is only one cost object. The alternative (a second payment step beside the
        // sacrifice/discard arms) would have been a second place to get the merge wrong.
        // ⛔ `cmc` is deliberately LEFT AT THE PRINTED VALUE. It feeds AI curve/sort hints, not legality;
        // an additional cost does not change the spell's mana value (CR 202.3 — mana value reads the mana
        // COST, and an additional cost is not part of it).
        for (const ch of combos) {
          emit(ch, { cost: mergedCost, payManaCost: addCost.pips, payManaName: `pay ${addCost.pips}` });
        }
      } else if (addCost.kind === "revealFromHand") {
        // AC-REVEAL (2026-08-07) — "reveal a <Subtype> card from your hand" (Silvergill Adept, Daring
        // Buccaneer …). Nothing moves; payability is simply a matching card in hand. The subtype check is
        // sacTypeMatches' own word-bounded path (type "permanent" + subtype), so the reveal cost and the
        // sacrifice costs share ONE evaluator rather than growing a second subtype matcher.
        // ⛔⛔ THE SPELL CANNOT REVEAL ITSELF (CR 601.2h — it is on the stack while its costs are paid), and
        // this is not a technicality: Daring Buccaneer IS a Pirate, so without the exclusion every copy in
        // hand would pay its own discount and the {2} would never be charged. Cheaper-than-printed, the
        // forbidden direction.
        if (!affordable) continue;   // R1.5 — printed-cost re-check, exactly as payLife above
        const revealable = player.hand.filter((h) => h.id !== card.id && sacTypeMatches(h, "permanent", addCost.subtype));
        if (!revealable.length) continue;
        // WHICH card is revealed is informationally irrelevant to the engine (nothing moves, no effect reads
        // it back), so the first match is stamped — the auto-pick precedent the discard cost already set.
        for (const ch of combos) {
          emit(ch, { revealCardId: revealable[0].id, revealName: `reveal ${revealable[0].name}` });
        }
      } else if (addCost.kind === "discard") {
        // The player picks which hand card(s) to discard. The spell itself is being cast (on its way to the
        // stack), so it's NOT a legal discard candidate — exclude it. Fewer than N candidates → uncastable.
        if (!affordable) continue; // R1.5 — same printed-cost re-check as payLife above
        const discardable = player.hand.filter(h => h.id !== card.id);
        if (discardable.length < addCost.count) continue;
        if (addCost.random) {
          // RG-7 (2026-09-05 — Sonic Burst): ONE action; the dispatcher picks the pitch at payment with the seeded rng.
          for (const ch of combos) emit(ch, { discardRandom: true, discardName: "discard a card at random" });
        } else if (addCost.count > 1) {
          // AC-1 (count-of-N) — "discard two/three… cards" (Cathartic Reunion). Reuse the each-player discard
          // least-valuable policy (autoPickDiscardCandidate: lowest MV, then power, then name, then id) to pick
          // EXACTLY N and offer ONE cast per target combo (freezing the N ids on `discardIds`).
          const chosen = [...discardable].sort(leastValuableCardCmp).slice(0, addCost.count);
          const chosenIds = chosen.map(c => c.id);
          for (const ch of combos) emit(ch, { discardIds: chosenIds, discardName: `discard ${chosen.map(c => c.name).filter(Boolean).join(", ")}` });
        } else {
          // N=1 — one cast per discardable hand card (a real in-game pick). BYTE-IDENTICAL.
          for (const dc of discardable) for (const ch of combos) {
            emit(ch, { discardCardId: dc.id, discardCardName: dc.name ?? null, discardName: dc.name ? `discard ${dc.name}` : undefined });
          }
        }
      } else if (addCost.kind === "exileFromGraveyard") {
        // ADDCOST-3 (CR 601.2h) — exile a typed card from your OWN graveyard. A graveyard is a public zone
        // and every candidate is equally legal, so this offers one cast per candidate exactly like the N=1
        // discard branch above (a real in-game pick, not an auto-choice). No candidate → uncastable, which
        // is the whole point of the gate: without it the engine would cast the spell for free.
        if (!affordable) continue; // R1.5 — same printed-cost re-check as the branches above
        const gy = player.graveyard || [];
        // ADDCOST-3b — cardType "any" is the UNTYPED count-of-N form ("exile six cards from your graveyard",
        // Abhorrent Oculus); every graveyard card is a legal pick, so the type filter is skipped entirely
        // rather than taught a fake "any" type it would have to keep in sync.
        const candidates = addCost.cardType === "any" ? gy : gy.filter((g) => cardMatchesAddCostType(g, addCost.cardType));
        if (candidates.length < (addCost.count ?? 1)) continue;   // fewer than N → genuinely uncastable
        if ((addCost.count ?? 1) > 1) {
          // Count-of-N: no combinatorial enumeration — reuse the least-valuable policy the discard cost uses
          // to pick EXACTLY N and freeze the ids, exactly like the discard/sacrifice count-N branches.
          const chosen = [...candidates].sort(leastValuableCardCmp).slice(0, addCost.count);
          for (const ch of combos) emit(ch, { exileGyCardIds: chosen.map((c) => c.id), exileGyName: `exile ${chosen.length} cards` });
        } else {
          for (const gc of candidates) for (const ch of combos) {
            emit(ch, { exileGyCardId: gc.id, exileGyCardName: gc.name ?? null, exileGyName: gc.name ? `exile ${gc.name}` : undefined });
          }
        }
      } else if (addCost.kind === "returnToHand") {
        // AC-BOUNCE (CR 601.2f) — return a permanent you control to its owner's hand. Every permanent of the
        // right type is an equally legal pick, so one cast per candidate, exactly like the branches above.
        // ⛔ THE SPELL ITSELF IS NOT A CANDIDATE — it is on the stack, not the battlefield (CR 601.2a); the
        // filter is over the battlefield, so that is structural rather than an exclusion I have to remember.
        // No candidate → uncastable. Deprive with no land in play is genuinely uncastable, not a free counter.
        if (!affordable) continue; // R1.5 — same printed-cost re-check as the branches above
        // Reuses sacTypeMatches — the SAME type vocabulary the sacrifice cost enumerates with, so the two
        // lanes cannot drift on what "a permanent you control" means.
        // ⛔ Same fail-safe as γ1b and the return-land activation cost: a permanent whose OWN leave-trigger
        // the engine cannot fire is excluded, so paying the cost never silently drops printed text.
        const bounceable = (player.battlefield || [])
          .filter((p) => sacTypeMatches(p.card, addCost.permType))
          .filter((p) => !sacrificeDropsTrigger(p));
        // ⚠️ NOT LOAD-BEARING, and said out loud rather than left to look like a gate: a mutation deleting
        // this line SURVIVES the suite (verified). The loop below emits nothing for an empty list and the
        // terminal `continue` still blocks the plain-cast fall-through, so uncastability is enforced there,
        // not here. Kept only for symmetry with the sibling cost branches. The real gate is that `continue`.
        if (bounceable.length === 0) continue;
        for (const bp of bounceable) for (const ch of combos) {
          emit(ch, { returnPermId: bp.id, returnPermName: bp.card?.name ?? null, returnName: bp.card?.name ? `return ${bp.card.name}` : undefined });
        }
      } else {
        continue; // unknown cost kind — programConfidence already gates unsupported kinds to low (defensive)
      }
      }
      // ⛔ THE FREE-SPELL GUARD. Unconditional: a card whose additional cost had NO payable option emitted
      // nothing above, and must NOT reach the X / modal / plain-cast branches below — those would offer it
      // with no cost attached at all. Reached for every additional-cost card, payable or not, exactly as
      // before the OR loop existed.
      continue;
    }

    // X-spell ({X} cost, an `amountX` atom): the player chooses X at cast (CR 601.2b).
    // Surface a BOUNDED set of affordable X values, each crossed with the program's
    // legal target combos (expandCastChoices handles per-atom target binding for both
    // sequence and modal X-spells). Each cast bakes the chosen X into the cost
    // (generic += X, so payment auto-taps fixed + X) and onto the action (xValue),
    // which the dispatcher threads into resolution.
    if (isHigh && program.xSpell) {
      // PAY-X-LIFE (Toxic Deluge, 2026-08-15): the X lives in the ADDITIONAL COST, not the mana — the
      // range is bounded by the caster's LIFE (CR 119.4; capped at life-1 so the sim never offers the
      // suicide cast — a play-quality bound, X=life stays a legal-but-never-offered FN) and the mana
      // half stays the fixed printed cost. MV stays printed too (CR 202.3b counts only {X} in the MANA
      // cost, and this spell has none).
      const lifeX = (program.additionalCosts || []).some((c) => c.kind === "payLifeX");
      // CR 601.2b — a spell cast without paying its mana cost has X = 0. Otherwise enumerate affordable X.
      const xValues = freeCast ? [0]
        : lifeX ? Array.from({ length: Math.max(0, Math.min((state.players[playerId]?.life ?? 0) - 1, X_CHOICE_CAP)) }, (_, i) => i + 1)
        : affordableXValues(state, playerId, cost);
      if (xValues.length === 0) continue;
      // Two reasons the legal target set can DEPEND on the chosen X, BOTH requiring PER-X enumeration:
      //   • targetCountX (Curse of the Swine "Exile X target creatures") — the NUMBER of targets is X.
      //   • mvCapX / valueX restriction (Here Comes a New Hero! "copy up to one target creature with mana value X
      //     or less") — the target's LEGALITY (MV ≤ X) reads X; a shared list would offer a target whose MV
      //     exceeds a smaller X (a confident illegal target, CREED FP).
      // Either way a shared X-independent combo list is wrong, so gate to per-X (threading ctx.xValue). Every
      // ordinary X-spell (damage/draw/token count — X-independent targets) keeps the SINGLE hoisted fast path
      // byte-identical (the flip-diff proves LOST=0). CR 601.2c — declining "up to one" is a legal cast, handled
      // by expandAtoms' optionalTarget decline.
      const expandsTargetsPerX = (program.atoms || []).some((a) =>
        a.targetCountX || a.mvCapX || (Array.isArray(a.restrictions) && a.restrictions.some((r) => r.valueX)));
      const combosOnce = expandsTargetsPerX ? null : expandCastChoices(state, playerId, program, colorsOf(card));
      if (!expandsTargetsPerX && combosOnce.length === 0) continue;
      for (const x of xValues) {
        const xCost = lifeX ? cost : xResolvedCost(cost, x); // PAY-X-LIFE: the mana half is the fixed printed cost (the X is life, charged at the dispatcher)
        const xCmc = lifeX ? printedCmc : printedCmc + (cost.xCount ?? 1) * x; // MV stays printed for a life-X (CR 202.3b counts only mana-{X})
        // Per-X target enumeration for an X-count-target (min=max=X distinct) OR an X-MV-bound target; otherwise
        // the hoisted X-independent combos. An X with too few / no legal targets yields no combos → that X skipped.
        const combos = expandsTargetsPerX
          ? expandCastChoices(state, playerId, program, colorsOf(card), { xValue: x })
          : combosOnce;
        if (combos.length === 0) continue; // this X yields no legal cast (e.g. MV≤X excludes every creature and the copy target is mandatory — never here, "up to one" always has the decline)
        // AI safety: parseSpellEffect returns null for the literal "X", so base.effect
        // is null and pickCastAction would skip its enemy-only target filter. Re-attach
        // a synthetic legacy effect for a single-atom X-damage program so the AI still
        // only aims X-burn at enemies (and holds it when there's no good target).
        let xEffect = base.effect;
        if (!xEffect && (program.atoms?.length === 1) && program.atoms[0].op === "deal-damage") {
          xEffect = { kind: "damage", amount: x, targetType: program.atoms[0].targetType };
        }
        for (const ch of combos) {
          actions.push({
            ...base,
            cost: xCost,
            cmc: xCmc,
            xValue: x,
            effect: xEffect,
            targets: ch.targets,
            chosenMode: ch.chosenMode ?? null,
            needsTargets: ch.targets.length > 0,
            targetName: ch.targets.map(t => t.name).filter(Boolean).join(", ") || undefined,
            modeName: ch.label || undefined,
            xName: `X=${x}`,
          });
        }
      }
      continue;
    }

    // P2.5: a HIGH modal or multi-atom program needs per-(mode × atom) target
    // binding the legacy single-effect path can't express — expand it through
    // `expandCastChoices` (each cast carries atomIndex-tagged targets + chosenMode).
    // Single-atom programs keep the proven legacy targeting path below unchanged.
    const atomNeedsTarget = (a) => !!a && !!a.targetType && !isNonChosenTargetType(a.targetType);
    // A single-atom program whose target the legacy `effect` can't express — the P2.7
    // extended atoms (tap/untap/bounce/exile/add-counter) — also routes through
    // expandCastChoices so its creature target is enumerated + bound.
    const isExtendedTargeted = isHigh && (program.atoms?.length || 0) === 1
      && atomNeedsTarget(program.atoms[0]) && !effectNeedsTarget(effect);
    const isMultiOrModal = isHigh
      && (program.structure === "modal" || (program.atoms?.length || 0) > 1);
    if (isMultiOrModal || isExtendedTargeted) {
      const choices = expandCastChoices(state, playerId, program, colorsOf(card));
      if (choices.length === 0) continue; // no legal cast (a required target is missing)
      for (const ch of choices) {
        const common = {
          ...base,
          targets: ch.targets,
          chosenMode: ch.chosenMode ?? null,
          needsTargets: ch.targets.length > 0,
          targetName: ch.targets.map(t => t.name).filter(Boolean).join(", ") || undefined,
          modeName: ch.label || undefined,
        };
        // KICKED-SPELL-EFFECT: the NORMAL cast (kicked atoms skipped at resolution). For a kicked-spell, stamp
        // kicked:false explicitly so the dispatcher/AI distinguish it from the kicked variant.
        // ⭐ STRIVE (CR 702.106 — ④-AS, 2026-09-04): "this spell costs {N} more to cast for each target beyond the first"
        // rides the program as `strivePerTarget` (parseEffectProgram peels and stamps it). Each chosen subset pays the base
        // cost plus N × (targets − 1), and a subset the player cannot fund is simply not offered — the printed card's
        // own limit. A one-target (or zero-target) cast pays the base cost, exactly as printed.
        let striven = common;
        // TARGET-CONDITIONAL REDUCTION (KT-9b): the reduction bites only when the chosen target itself targets a
        // creature you control with power ≥ N (layer-aware). MV stays PRINTED (CR 202.3 — a reduction never changes
        // mana value); a subset the player cannot fund at its settled cost is not offered.
        if (program.targetConditionalReduction) {
          const hit = targetConditionalReductionHits(state, playerId, ch.targets, program.targetConditionalReduction);
          const tcrCost = hit ? { ...base.cost, generic: Math.max(0, (base.cost.generic || 0) - program.targetConditionalReduction.amount) } : base.cost;
          if (!freeCast && !canAfford(player.manaPool, manaSources(state, playerId), tcrCost, spendContext)) continue;
          striven = { ...common, cost: tcrCost };
        }
        if (program.strivePerTarget && ch.targets.length > 1) {
          const per = parseManaCost(program.strivePerTarget);
          let cost = base.cost;
          for (let i = 1; i < ch.targets.length; i++) cost = mergeManaCost(cost, per);
          if (!canAfford(player.manaPool, manaSources(state, playerId), cost)) continue;
          striven = { ...common, cost, cmc: totalCmc(cost) };
        }
        actions.push(kickedSpell ? { ...striven, kicked: false } : striven);
        // The KICKED cast — kicker pips folded into the cost — when affordable on top of the base. Same target
        // combo (the kicked atoms are targetless), kicked:true → runEffectProgram runs the kickedOnly tail.
        if (kickedSpell && kickedSpellAffordable) {
          actions.push({ ...common, cost: kickedSpellCost, cmc: kickedSpellCmc, kicked: true, kickedName: "kicked" });
        }
      }
      continue;
    }

    // ENTERS-WITH-X (hydras): a permanent whose {X} cost feeds "this creature enters with X +1/+1
    // counters" (Hungering / Lifeblood / Primordial / Hydroid Krasis Hydra…). The X isn't an effect-program
    // atom, so the xSpell branch above never fires — but the player still chooses X at cast (CR 601.2b).
    // Offer each AFFORDABLE X≥1 (a 0/0 hydra dies to the SBA instantly, so X=0 is never surfaced); the
    // dispatcher threads xValue into PERMANENT_ETB, which adds the counters so it enters at its real P/T.
    // X-COST CLONE (Mockingbird {X}{U}): an {X}-cost clone also chooses X at cast (CR 601.2b) — X sets the
    // "mana spent" the MV cap reads (cloneMvCap). Without this branch the cast would pay X=0 implicitly (an
    // underpayment FP) and the cap would be wrong. Same per-X emission as a hydra; resolveCloneChoice reads
    // xValue from the resume. (X≥1 here; X=0 — copy a 1-drop — is a safe false-negative, never surfaced.)
    if (cost.hasX && (entersWithXCounters(card) || etbUsesX(card) || isCloneCard(card))) { // + etbUsesX (Wan Shi Tong, KN-5b)
      const xValues = affordableXValues(state, playerId, cost);
      if (xValues.length === 0) continue; // can't afford even X=1 → not usefully castable
      for (const x of xValues) {
        actions.push({
          ...base,
          cost: xResolvedCost(cost, x), // DOUBLE-X (CR 107.3): {X}{X} (Walking Ballista) owes 2X; xValue stays X for the counters
          cmc: printedCmc + (cost.xCount ?? 1) * x,
          xValue: x,
          targets: [],
          needsTargets: false,
          xName: `X=${x}`,
        });
      }
      continue;
    }

    // Aura (CR 303.4): a native Aura is a targeted permanent spell — it chooses the
    // creature it will enchant as it's cast. One cast action per creature on any
    // battlefield ("Enchant creature" has no controller restriction); no legal creature
    // → can't cast (CR 303.4a). A non-native Aura has no modeled bonus, so it falls
    // through to the no-target branch and the dispatcher routes it to the Arbiter seam.
    // ORDEAL (BLITZ OC-1): the exact Theros Ordeal template (attacks→counter→threshold-sac→"when you
    // sacrifice" payoff) is a fully-modeled trigger-only creature Aura — same cast shape (enter + attach
    // via AURA_ETB; the triggers fire off the attached linkage), gated on the SAME isNativeOrdealAura the
    // metric awards, so the offer and the native-trigger claim can't drift.
    if (isNativeAura(card) || isNativeOrdealAura(card)) {
      // KW-PROTECTION (CR 702.16b): the Aura spell's colors gate targeting — a protection-from-[color]
      // creature can't be the Aura's target if the Aura is that color (also its 702.16c enchant immunity).
      // ENCHANT-RESTRICTION (CR 303.4a): "Enchant creature you control" limits legal targets to the caster's
      // OWN creatures — the SAME restriction (creatureSatisfiesRestrictions "you") isNativeAura gated on, so
      // the aura can never attach to an illegal creature. Bare "Enchant creature" → [] (any creature).
      // ES-1 (2026-08-05): the HOST TYPE comes from the card, not a hardcoded "creature". An Aura whose
      // subject is a type union ("Enchant artifact or creature" — Ice Over; "Enchant creature or Vehicle"
      // — Aether Meltdown) or a bare non-creature ("Enchant artifact" — Stasis Cocoon) enumerates hosts of
      // THAT type. ⛔ The pin that matters is the negative one: an "Enchant artifact" Aura must never
      // enumerate a creature. A test that only checked "it attached" would pass while attaching to
      // anything, which is why enchantSubjectHosts.test.js asserts the pools by NAME in both directions.
      const hostSpec = auraEnchantHostSpec(card) || { targetType: "creature", restrictions: [] };
      const targets = enumerateTargets(state, playerId, { targetType: hostSpec.targetType, restrictions: hostSpec.restrictions }, colorsOf(card));
      if (targets.length === 0) continue;
      for (const t of targets) {
        actions.push({ ...base, targets: [t], targetName: t.name, needsTargets: true, isAuraSpell: true });
      }
      // KICKER on an Aura (④-J, Bubble Snare — CR 702.33): the SAME normal+kicked emission the creature kicker
      // block below uses, one kicked cast per legal host, kicker pips folded into the cost so the dispatcher's
      // normal mana plan pays it all. The dispatcher threads `kicked` onto AURA_ETB → enterPermanent stamps
      // wasKicked → the Aura's "When this Aura enters, if it was kicked, …" trigger fires its payoff only on the
      // kicked cast. A free-cast pays nothing, so no kicked option (the base Aura still resolves — safe).
      // parseKickerCost is the one gate (clean single mana cost; multikicker / {X} → null → unkicked only).
      if (!freeCast) {
        const auraKicker = parseKickerCost(card);
        if (auraKicker) {
          const auraKickerCost = parseManaCost(auraKicker);
          const auraKickedCost = mergeManaCost(cost, auraKickerCost);
          if (canAfford(player.manaPool, manaSources(state, playerId), auraKickedCost)) {
            for (const t of targets) {
              actions.push({ ...base, cost: auraKickedCost, cmc: printedCmc + totalCmc(auraKickerCost), targets: [t], targetName: t.name, needsTargets: true, isAuraSpell: true, kicked: true, kickedName: "kicked" });
            }
          }
        }
      }
      continue;
    }

    // PLAYER-AURA (Fraying Sanity / the Curse class — SHELF S7, CR 303.4): an "Enchant player" Aura
    // targets a PLAYER at cast — one action per living player. Gated on the SAME native-aura tier the
    // metric awards (classifyCard — legalChoices already consults it), so the offer and the claim can't
    // drift: a player-aura with unmodeled residue is body-only → falls through → the Arbiter seam.
    if (isPlayerAuraCard(card) && classifyCard(card) === "native-aura") {
      for (const pid of Object.keys(state.players || {})) {
        if (!state.players[pid]) continue;
        actions.push({ ...base, targets: [{ type: "player", id: pid }], targetName: pid, needsTargets: true, isAuraSpell: true, enchantsPlayer: true });
      }
      continue;
    }

    // BESTOW (CR 702.103): a bestow creature has an ALTERNATIVE cast cost that turns it into an Aura
    // spell enchanting a creature (granting "+X/+X" and/or a keyword), becoming a creature again if it
    // ever stops being attached. We offer the bestow cast ALONGSIDE the normal creature cast (this branch
    // does NOT `continue` — the iteration falls through to the no-target creature push below, so BOTH
    // modes are surfaced). Each bestow cast is the SAME shape a native Aura uses (isAuraSpell + a single
    // creature target) plus `bestow: true`, which the dispatcher routes through AURA_ETB with the
    // `bestowed` flag (the resolved permanent stays on the battlefield + becomes a creature when its host
    // leaves, vs the normal Aura falls-off-to-graveyard SBA). Only offered for a fully-native bestow card
    // (isNativeBestow — both modes clean, CREED). The bestow cost is paid INSTEAD of the printed cost, so
    // it's parsed + affordability-checked independently of the creature-mode `base.cost` above.
    const bestowCostStr = isNativeBestow(card) ? parseBestowCost(card) : null;
    if (bestowCostStr) {
      let bestowCost = parseManaCost(bestowCostStr);
      const bestowCmc = totalCmc(bestowCost); // mana value reads the (printed) bestow cost (CR 202.3b) — before the tax
      // The commander tax + static cost-reducers apply to the alt-cast too (CR 601.2f / 903.8) — mirror
      // the creature-mode cost adjustments above so a taxed/discounted bestow cast is priced correctly.
      const tax = freeCast ? 0 : (taxFn ? taxFn(card) : 0);
      if (tax) bestowCost = { ...bestowCost, generic: (bestowCost.generic || 0) + tax };
      if (!freeCast) {
        const staticTax = costTaxForSpell(costTaxers, card, playerId);   // increases before decreases (CR 601.2f)
        if (staticTax) bestowCost = { ...bestowCost, generic: (bestowCost.generic || 0) + staticTax };
        const reduction = costReductionForSpell(costReducers, card, fromZone) + selfCostReductionForSpell(state, playerId, card);
        if (reduction) bestowCost = { ...bestowCost, generic: Math.max(0, (bestowCost.generic || 0) - reduction) };
        bestowCost = applyColoredPipReduction(bestowCost, costReducers, card);
      }
      const canAffordBestow = freeCast || canAfford(player.manaPool, manaSources(state, playerId), bestowCost);
      // X-cost bestow (Nyxborn Hydra is gated out by isNativeBestow today — its dynamic per-counter bonus
      // isn't modeled) — so a clean bestow card here never has {X} in its bestow cost; no X enumeration.
      if (canAffordBestow && !bestowCost.hasX) {
        const targets = enumerateTargets(state, playerId, { targetType: "creature" }, colorsOf(card));
        for (const t of targets) {
          actions.push({
            ...base,
            cost: bestowCost,
            cmc: bestowCmc,
            targets: [t],
            targetName: t.name,
            needsTargets: true,
            isAuraSpell: true,
            bestow: true,
            bestowName: `bestow onto ${t.name}`,
          });
        }
      }
      // fall through — the normal creature-mode cast is still pushed below
    }

    // AURA-LAND-MANA-BOOST (CR 303.4): a land-enchant mana Aura (Wild Growth / Overgrowth / Fertile
    // Ground) is a targeted permanent spell that chooses the LAND it enchants. "Enchant land" has no
    // controller restriction, but the only USEFUL target is one of the caster's OWN lands (enchanting an
    // opponent's land just ramps them), so we offer own lands only (a safe, useful subset). Once
    // attached, the boost mana appears inline whenever that land taps (manaModel.landAuraManaBonus).
    if (isNativeManaAura(card)) {
      // CHOSEN-COLOR (Utopia Sprawl): the Aura enchants the "Forest" basic-land SUBTYPE, so only the caster's
      // own FORESTS are legal targets (the "forest" targetType requires BOTH a Land type line and the Forest
      // subtype). A bare "Enchant land" mana Aura offers any own land. Honoring the subtype at the target site
      // is what keeps the boost faithful to "enchant Forest" — the Aura only ever attaches to (and boosts) a Forest.
      const targetType = auraEnchantSubject(card) === "forest" ? "forest" : "land";
      const targets = enumerateTargets(state, playerId, { targetType, restrictions: [{ kind: "controller", who: "you" }] }, colorsOf(card));
      if (targets.length === 0) continue;
      for (const t of targets) {
        actions.push({ ...base, targets: [t], targetName: t.name, needsTargets: true, isAuraSpell: true });
      }
      continue;
    }

    // GRANT-AURA CAST (BLITZ TS-1, CR 303.4): an Aura in the GRANT families — granted-activated (Squirrel
    // Nest / Tin Street Market / Hermetic Study), granted-mana (Settlement / Gift of Paradise), granted-
    // triggered (Sixth Sense), aura-own-activated (Freed from the Real) — is fully modeled ON the
    // battlefield, but had NO cast branch: it fell to the no-target push and the dispatcher Arbiter-routed
    // it, so the native tier's card never actually attached. Offer one cast per legal host, exactly like
    // the isNativeAura/mana-aura branches: creature hosts enumerate every battlefield creature (own-only
    // when the subject says "you control" — CR 303.4a); land hosts enumerate the caster's OWN lands (the
    // mana-boost lane's useful-subset precedent). Gated on grantAuraCastHostType — the SAME single gate the
    // dispatcher routes AURA_ETB on and the coverage tier stands on, so offer/resolution/metric can't drift.
    {
      const grantHost = grantAuraCastHostType(card);
      if (grantHost) {
        // QUALIFIED SUBJECT (2026-08-03): read the host filter from auraEnchantRestrictions — the SAME
        // function the tier gate stands on — so a qualified creature subject ("nonblack creature",
        // "creature with mana value 2 or less") enumerates only LEGAL hosts. It already returns
        // [{controller:"you"}] for "creature you control", so it subsumes ownOnly for creature hosts;
        // LAND hosts keep the ownOnly path (that function only speaks about creature subjects).
        const restrictions = grantHost.host === "creature"
          ? (auraEnchantRestrictions(card) || [])
          : (grantHost.ownOnly ? [{ kind: "controller", who: "you" }] : []);
        const targets = enumerateTargets(state, playerId, { targetType: grantHost.host, restrictions }, colorsOf(card));
        if (targets.length === 0) continue;         // no legal host → can't cast (CR 303.4a)
        for (const t of targets) {
          actions.push({ ...base, targets: [t], targetName: t.name, needsTargets: true, isAuraSpell: true });
        }
        continue;
      }
    }

    // KICKER (CR 702.33) — a creature with a modeled kicker (clean single cost + an enters-with-counters
    // kicked payoff, parseKickerCounterCreature). Emit the NORMAL cast (kicked:false) and — when the kicker
    // mana is ALSO affordable on top of the base cost — a KICKED cast (kicked:true) whose `cost` folds in the
    // kicker pips, so the dispatcher's normal mana plan pays the whole thing. The dispatcher threads `kicked`
    // onto the PERMANENT_ETB payload and the resolver adds the kicked +1/+1 counters AS the creature enters.
    // These kicker creatures have no effect target (the body is keyword-only), so we own the emission here and
    // `continue`. A free-cast (Discover, CR 601.2b) is cast WITHOUT paying — kicker isn't paid (no kicked
    // option), so only the normal cast is offered (a safe limitation; the base body still resolves).
    // KICKED ETB-TRIGGER variant (Goblin Ruinblaster "When this creature enters, if it was kicked, destroy
    // target nonbasic land") — the kicked payoff is a TRIGGERED ability, not the enters-with-counters
    // replacement above. Same emission shape (the creature cast itself takes no targets — the ETB trigger
    // chooses its own target when it goes on the stack, CR 603.3c), so it shares the normal+kicked emission.
    // The dispatcher threads `kicked` onto PERMANENT_ETB → enterPermanent stamps perm.wasKicked → the "it was
    // kicked" intervening-if (interveningIf.js) fires the trigger's payoff only on a kicked cast. parseKicker-
    // EtbCreature re-classifies the kicker-line-stripped body native (the same gate coverage uses), so the
    // runtime offers the kick EXACTLY when the metric credits it. Checked alongside the counter variant (the
    // two gates are mutually exclusive — the ETB gate rejects the counters shape — so at most one matches).
    const counterKicker = parseKickerCounterCreature(card, isKeywordOnly);
    const etbKicker = !counterKicker ? parseKickerEtbCreature(card, classifyCard, isNativeTier) : null;
    const kickerSpec = counterKicker || etbKicker;
    if (kickerSpec) {
      actions.push({ ...base, targets: [], needsTargets: false, kicked: false });
      if (!freeCast) {
        const kickerCost = parseManaCost(kickerSpec.kickerCost);
        const kickedCost = mergeManaCost(cost, kickerCost); // base (already taxed/reduced) + the kicker pips
        if (canAfford(player.manaPool, manaSources(state, playerId), kickedCost)) {
          actions.push({
            ...base,
            cost: kickedCost,
            cmc: printedCmc + totalCmc(kickerCost), // CR 202.3b — mana value counts the additional kicker cost paid
            targets: [],
            needsTargets: false,
            kicked: true,
            kickedName: counterKicker ? `kicked (+${counterKicker.kicked.counters} +1/+1)` : "kicked",
          });
        }
      }
      continue;
    }

    // EMERGE (CR 702.97) — a creature with a clean "Emerge {cost}" (or "Emerge from artifact {cost}") line
    // whose BODY is native (parseEmergeCard re-classifies the keyword-line-stripped body — the SAME gate the
    // coverage classifier uses, so the metric and the runtime can't drift). For each legal sacrifice victim
    // of the emerge sac-type, emit an EMERGE cast whose `cost` is the emerge cost with its GENERIC portion
    // reduced by that victim's mana value (floored at {0}; the colored pips are never reduced — mirrors the
    // static-cost-reduction floor above). The cast carries `sacCreatureId` (the victim) + `emerge:true`; the
    // dispatcher sacrifices the victim (excluded from the mana sources, so a sacrificed dork can't also tap)
    // and pays the reduced mana, then the body's self-cast / ETB trigger fires through the normal cast path.
    // This block does NOT `continue` — the normal hard-cast (full printed cost, gated on `affordable`) still
    // falls through below, so BOTH the emerge cast and the normal cast are offered (Emerge is an ALTERNATIVE,
    // not a replacement). `emergeSpec` was computed at the affordability gate above (so an unaffordable normal
    // cost didn't skip the card). A free-cast pays nothing, so emergeSpec is null then (the base body still
    // resolves via the free-cast).
    if (emergeSpec) {
      const emergeCost = parseManaCost(emergeSpec.pips);
      const victims = player.battlefield.filter((v) => {
        const vType = String(v.card?.type || v.card?.type_line || "");
        if (!new RegExp(`\\b${emergeSpec.sacType}\\b`, "i").test(vType)) return false;
        // Exclude a victim whose own leave-trigger the dies path can't fire (mirrors the additional-cost
        // sacrifice filter), so we never offer an emerge we can't cleanly complete (CREED).
        return !sacrificeDropsTrigger(v.card?.oracle || v.card?.oracle_text || "");
      });
      for (const victim of victims) {
        // CR 702.97a — the emerge cost is reduced by the sacrificed creature's MANA VALUE (generic only,
        // floored at {0}); the colored pips stay. parseManaCost returns a fresh object, but build a new one
        // per victim so each emerge cast carries its own reduced cost.
        const reducedGeneric = Math.max(0, (emergeCost.generic || 0) - manaValueOf(victim.card));
        const reducedCost = { ...emergeCost, generic: reducedGeneric };
        // Affordability EXCLUDES the victim from the mana sources — a sacrificed mana dork can't also tap to
        // pay (the γ1 double-spend guard; the dispatcher applies the identical exclusion).
        const sources = manaSources(state, playerId).filter((s) => s.permanentId !== victim.id);
        if (!canAfford(player.manaPool, sources, reducedCost)) continue;
        actions.push({
          ...base,
          cost: reducedCost,
          cmc: printedCmc, // CR 202.3b — mana value reads the card's PRINTED cost, unaffected by the alt-cast
          targets: [],
          needsTargets: false,
          emerge: true,
          sacCreatureId: victim.id,
          sacCreatureName: victim.card?.name ?? null,
          emergeName: victim.card?.name ? `emerge (sacrifice ${victim.card.name})` : "emerge",
        });
      }
      // fall through — the normal creature-mode hard-cast is still pushed below (only when affordable)
    }

    // EMERGE: when the normal printed cost is NOT affordable, only the emerge cast(s) emitted above are
    // offered — skip the normal-cast emission below (we got here past the affordability gate ONLY because an
    // emerge cast was viable). For every normal (affordable) cast this is a no-op (affordable === true).
    // ALT-COST: an unaffordable alt-carrier still emits its normal-shaped actions here — the twin post-pass
    // below converts them to alt-payment casts and SPLICES OUT the unaffordable normal variant (it was
    // never offered pre-change, preserving byte-identity on non-carrier decks).
    // FIST OF SUNS (RG-5): the same twin-post-pass shape — an unaffordable printed cost still emits its normal-shaped actions
    // here when the five-pip alternative is payable; the wubrg post-pass converts them and splices out the printed variant.
    if (!affordable && !altSpec && !wubrgAffordable) continue;

    if (effectNeedsTarget(effect)) {
      // Targeted spell: one cast action per legal target (the action-expansion
      // pattern, same as multi-defender combat). No legal target → can't cast.
      // P2.4: thread target restrictions (controller/tapped/power) so a restricted
      // removal only surfaces the creatures it can legally hit.
      let targetingEffect = effect;
      if (effect.targetType === "creature") {
        const { restrictions } = parseCreatureTargetRestrictions(card);
        if (restrictions.length) targetingEffect = { ...effect, restrictions };
      }
      // KW-PROTECTION (CR 702.16b): the spell's colors gate targeting — a creature with protection from
      // a color the spell is can't be targeted by it (removal/burn immunity), even by its own controller.
      const targets = enumerateTargets(state, playerId, targetingEffect, colorsOf(card));
      if (targets.length === 0) continue;
      for (const t of targets) {
        actions.push({ ...base, targets: [t], targetName: t.name, needsTargets: true });
      }
    } else {
      // COUNTER-NO-TARGET GATE (CR 601.2c): a LOW-confidence counter that reached this no-target
      // fall-through (its unmodeled rider/alt-cost kept the program below HIGH so the self-gating program
      // path was skipped) still targets a SPELL ON THE STACK — it is uncastable with no legal target.
      // Enumerate legal stack targets via the clause's own spellFilter (so a restricted counter only counts
      // spells it can legally hit) and offer one cast per legal target; an empty / no-legal-target stack →
      // not offered. The spell still routes to the Arbiter at resolution (LOW), but is no longer OFFERED at
      // nothing. (HIGH counters never reach here — they `continue` from the program branch above.)
      const counterFilter = counterSpellTargetFilter(card);
      if (counterFilter != null) {
        const stackTargets = enumerateTargets(state, playerId, { kind: "counter", targetType: "spell", spellFilter: counterFilter }, colorsOf(card));
        if (stackTargets.length === 0) continue;       // no legal spell on the stack → can't cast (CR 601.2c)
        for (const t of stackTargets) {
          actions.push({ ...base, targets: [t], targetName: t.name, needsTargets: true });
        }
      } else {
        actions.push({ ...base, targets: [], needsTargets: false });
      }
    }
  }
  // ===== ALT-COST TWIN POST-PASS ===== the dual offer, as a single pass over the EMITTED actions rather
  // than a per-branch insertion: the emission sites are 5+ (additional-cost / X / multi-modal / legacy
  // targeted / no-target) and a per-branch dual-offer is exactly the duplicated-exclusion-list drift trap
  // this repo has been burned by. Every normal-cost cast action of an alt-carrier is twinned once per legal
  // payment; the alt twin carries `altCost` (NEVER `freeCast` — the pendingFreeCast/pendingCascade clearing
  // invariant in the dispatcher is keyed off freeCast and must keep its single producer) and pays no mana
  // (`cost: {generic: 0}`; `cmc` stays the printed mana value, CR 202.3). Guards keep the twin to the plain
  // hand-cast shape only — alt carriers are instants/sorceries, so the emerge/bestow/kicked/X/additional-cost
  // shapes are naturally exclusive; the guards make that structural.
  if (wubrgSpecs.size) {
    // FIST OF SUNS (RG-5): duplicate each plain hand-cast action with the five-pip cost; drop the printed-cost action when it
    // was not itself payable (it was admitted past the affordability gate only for this variant's sake).
    const out = [];
    for (const a of actions) {
      const spec = (a.kind === "cast-spell" && a.fromZone === "hand" && !a.freeCast && !a.altCost && !a.faceCard
        && !a.emerge && !a.bestow && a.kicked === undefined && a.xValue == null
        && !a.sacCreatureId && !a.payLifeCost && !a.discardCardId) ? wubrgSpecs.get(a.cardId) : undefined;
      if (!spec) { out.push(a); continue; }
      if (spec.baseAffordable) out.push(a);
      out.push({ ...a, cost: spec.cost, altManaCost: spec.altManaCost, altName: spec.altName });
    }
    actions.length = 0;
    actions.push(...out);
  }
  if (altSpecs.size) {
    const out = [];
    for (const a of actions) {
      const spec = (a.kind === "cast-spell" && a.fromZone === "hand" && !a.freeCast && !a.faceCard
        && !a.emerge && !a.bestow && a.kicked === undefined && a.xValue == null
        && !a.sacCreatureId && !a.payLifeCost && !a.discardCardId) ? altSpecs.get(a.cardId) : undefined;
      if (!spec) { out.push(a); continue; }
      if (spec.affordable) out.push(a); // the normal hard-cast survives only when genuinely payable
      for (const pay of spec.payments) {
        // Never sacrifice the very permanent the spell targets — the cost is paid before resolution, so the
        // target would fizzle (CR 608.2b). Mirrors the additional-cost sacrifice exclusion.
        if (pay.sacId && (a.targets || []).some((t) => t.id === pay.sacId)) continue;
        out.push({ ...a, cost: { generic: 0 }, altCost: { kind: spec.alt.kind, ...(spec.alt.evoke ? { evoke: true } : {}), ...pay }, altName: altCastName(spec.alt, pay) }); // + evoke flag (Solitude)
      }
    }
    return out;
  }
  return actions;
}

/**
 * Tap-for-mana: any untapped mana source the player controls, one action per
 * (source, color) so a dual surfaces "tap for W" and "tap for U" separately.
 * Mana abilities are technically instant-speed (CR 605.3a), but surfacing
 * them at every priority window would spam the learner. v1 gates to the
 * player's OWN main phase — the window where you'd float mana to cast or to
 * pump Omnath. Casting still auto-taps at any speed via the dispatcher, so
 * this action is only the explicit manual-tap / float path (Beginner +
 * floating-mana decks). Auto modes ignore it, so they never loop on it.
 */
// ── ARTIFACT-ACTIVATION LOCK (BLITZ NR-1, CR 604.2 — Null Rod / Stony Silence / Collector Ouphe:
// "Activated abilities of artifacts can't be activated.") ────────────────────────────────────────────
// Is THIS permanent's activated-ability surface shut off by a live lock? `locked` is the per-call
// artifactActivationsLocked(state) scan (computed once per enumerator — the lock is board-rare, so the
// layer-aware type read only ever runs while a carrier is out). The Artifact test is the DERIVED types
// (layers.permanentTypes, after layer 4): an animated artifact creature is still an artifact; a printed
// check would also miss any future layer-4 Artifact add. Every enumeration site that offers an activated
// ability of a BATTLEFIELD permanent gates through this one predicate: tap-for-mana + double-mana-pool
// (mana abilities ARE activated abilities, CR 605.1a — Sol Ring, Doubling Cube), activate-ability
// (printed + aura/equipment-granted + group-granted + equip, CR 702.6a), crew (CR 702.122a), and loyalty
// (CR 606.2 — Luxior / The Aetherspark are artifact planeswalkers). manaModel.manaSources carries the
// same gate for affordability/payment. NOT gated (CR scope): casting artifact spells (601.2), triggered
// (603.2) / static (604.1) abilities, and hand/graveyard-zone activations — cycling, plot, gy-recursion/
// -exile act on CARDS, not battlefield artifact permanents (CR 109.2).
//
// ⭐⭐ IT COVERS **TWO** LOCKS AS OF 2026-08-05, AND THE SECOND ONE WAS A LIVE BUG. The paragraph above has
// always claimed every activated-ability enumeration site gates through this one predicate — but the
// predicate only knew the BOARD-WIDE artifact lock (NR-1). The PER-PERMANENT lock (AU-2
// "activatedAbilitiesLocked" — Arrest, Lawmage's Binding, Demotion, Stupefying Touch, Detainment Spell,
// and Koma's mode-1) was checked at exactly ONE of the five sites: actionsActivateAbility. So an ARRESTED
// Llanowar Elves was refused by manaModel.manaSources for AFFORDABILITY yet still OFFERED a `tap-for-mana`
// action — tap it and the mana appears. Measured on shipped code before the fix: `{offered: 1,
// forPayment: 0}`. Crew (CR 702.122a), the double-mana-pool ability (CR 605.1a) and loyalty (CR 606.2) had
// the same hole. Every one is an over-delivery — the engine doing MORE than the printed card allows, which
// is the forbidden direction, not the safe one.
// ⛔ FIXED HERE RATHER THAN AT THE FOUR CALL SITES *because* the four-way divergence is what caused it.
function lockedActivationSource(state, locked, permId) {
  // AU-2 (CR 602.5 — "a player can't begin to activate an ability that's prohibited from being activated"):
  // the per-permanent lock, layer-aware via permanentHasKeyword and type-agnostic, so it shuts off a locked
  // artifact, Vehicle, creature or planeswalker alike.
  if (permanentHasKeyword(state, permId, "activatedAbilitiesLocked")) return true;
  return locked && permanentTypes(state, permId).types.includes("Artifact");
}

function actionsTapForMana(state, playerId) {
  if (state.activePlayer !== playerId) return [];
  if (state.priorityHolder !== playerId) return [];
  if (state.step !== "main") return [];
  const player = state.players[playerId];
  const actions = [];
  const artLocked = artifactActivationsLocked(state); // NR-1: locks artifact mana abilities (CR 605.1a)
  for (const perm of player.battlefield) {
    if (perm.tapped) continue;
    if (lockedActivationSource(state, artLocked, perm.id)) continue; // NR-1 artifact lock + AU-2 per-permanent lock
    let prod = manaProduction(perm.card);
    // GROUP-GRANT: a permanent with no own mana ability can have a {T}: Add … ability GRANTED by a lord
    // (Gemhide/Manaweft). DEDUP mirrors manaSources — the grant only adds a source where the permanent has
    // none of its own (the granter keeps its own quoted-text source; granting again would double it).
    if (!prod) {
      const granted = grantedManaSpecsFor(state, perm.id);
      if (granted.length) prod = { colors: granted[0].colors, amount: granted[0].amount };
    } else {
      prod = applyAuraManaGrantSupplement(state, perm, prod);   // AURA-MANA-GRANT supplement — mirrors manaSources (two-sites invariant)
    }
    if (!prod) continue;
    // STAGE ③ · 37 — a no-{T} remove-a-counter source (Pentad Prism) is paid through the planner: manaSources gives it one
    // record per counter and the commit removes the counter. This direct TAP action would add the mana without removing a
    // counter and tap a permanent whose cost has no {T}, so it isn't offered here — a safe under-offer of manual floating,
    // never free mana.
    if (prod.removesCounters?.mode === "each") continue;
    // Granted Haste counts here too (a lord that hastes your mana dorks). Layer-aware sickness (NV-1,
    // CR 302.6): a MASS-ANIMATED land played this turn is a summoning-sick creature — its {T} mana
    // ability is off until its controller's next turn (summoningSickNow; printed creatures read their
    // stamped flag exactly as before).
    if (summoningSickNow(state, perm) && !permanentHasKeyword(state, perm.id, "Haste") && !abilitiesAsThoughHasteFor(state, perm.controller)) continue; // + SG-18 (Shang-Chi)
    // MANA-VARIABLE: a count-derived amount (Gaea's Cradle / Karametra / Bighorner) is resolved LIVE
    // against the board (CR 608.2g), floored at 0. Skip the source entirely when it would tap for 0 —
    // never offer a pointless 0-mana tap (e.g. Gaea's Cradle with no creatures).
    const amount = prod.amountSpec
      ? Math.max(0, countForSpec(state, { controller: playerId, source: perm }, prod.amountSpec))
      : prod.amount;
    if (amount <= 0) continue;
    // AURA-LAND-MANA-BOOST: a land carrying a mana-boost Aura yields extra mana INLINE when it taps
    // (the Aura is NOT tapped). landAuraManaBonus is the SAME helper manaSources/planPayment use, so
    // the explicit tap and the auto-pay planner can't drift (the CREED two-sites invariant). Each
    // bonus entry chooses its color here (a fixed-color uses its color; an any-color picks its first —
    // the explicit-tap learner play just floats the mana, no future-cost lookahead).
    // GLOBAL-TAP-AUGMENT mirrors manaSources (the two-sites invariant): a controller-owned "Whenever you
    // tap a <land|creature> for mana, add …" permanent adds extra fixed-color mana inline on this tap.
    const bonusSources = [...landAuraManaBonus(state, perm), ...globalTapManaAugment(state, playerId, perm)];
    for (const color of prod.colors) {
      // MANA FLARE (MF-1): a sameAsProduced bonus's color IS this action's chosen production color ("one
      // mana of any type that land produced" — resolved per action, so tapping a dual for W carries a +1 W
      // bonus and the U action a +1 U, never an off-type pip). Fixed-color bonuses keep their color.
      const bonus = bonusSources.map(b => ({ color: b.sameAsProduced ? color : b.colors[0], amount: b.amount }));
      actions.push({
        kind: "tap-for-mana",
        playerId,
        permanentId: perm.id,
        color,
        amount,
        sacrifices: !!prod.sacrifices,   // one-shot Treasure/Gold — applyTapForMana sacrifices it (TOK-2)
        ...(bonus.length ? { bonus } : {}),
        name: perm.card.name,
      });
    }
  }
  return actions;
}

/**
 * Activated abilities (`{cost}: effect`, CR 602.1) — P2.9. One action per (ability ×
 * legal-target combo), mirroring the cast-spell expansion. Only abilities whose cost
 * reduces to the modeled subset (mana pips + `{T}`) AND whose effect parses HIGH are
 * offered (`effects/abilities.parseActivatedAbilities`); MANA abilities (`{T}: Add …`)
 * are handled by `actionsTapForMana`, not here.
 *
 * v1 gates to the player's OWN main phase with priority (same window as
 * `actionsTapForMana`) — activated abilities are instant-speed (CR 602.2), but
 * surfacing them at every priority window would spam the learner; the AI auto-pickers
 * ignore this kind (like tap-for-mana) so they never loop on it. Instant-speed timing
 * is a later refinement.
 */
// GRANTED-ACTIVATED (subsystem 1 phase 1b): the activated abilities an Aura confers on its host creature.
// Walks the host's attachments (mirroring landAuraManaBonus) and parses each grant's quoted ability via
// the canonical parseGrantedActivatedAbilities, so cost/effect/modeled match a printed ability exactly.
function grantedActivatedForHost(state, hostPerm) {
  if (!hostPerm?.attachments?.length) return [];
  const out = [];
  for (const attId of hostPerm.attachments) {
    const lk = findPermanent(state, attId);
    if (lk?.permanent?.card) out.push(...parseGrantedActivatedAbilities(lk.permanent.card));
  }
  return out;
}

/**
 * CREW (BLITZ VH-1, CR 702.121c) — offer crewing each of the player's uncrewed Vehicles: tap own untapped
 * creatures with total (layer-aware) power ≥ N; the Vehicle becomes an artifact creature until end of turn.
 * Same window as every activated ability in this engine (own turn + priority + main step). The tap SET is
 * auto-picked deterministically (the oneYouControl auto-pick convention): SUMMONING-SICK creatures first
 * (power desc — they can't attack this turn anyway, so tapping them is free), then non-sick by power ASC
 * (preserve the big attackers), stopping at ≥ N. `allSick` marks a zero-cost crew (the AI's take-it signal).
 * A Vehicle that is ALREADY a creature (crewed, or animated some other way) is skipped — re-crewing is legal
 * by CR but useless here (the type is already on), so the offer stays clean. Total own power < N → no offer.
 */
function actionsCrewVehicle(state, playerId) {
  if (state.activePlayer !== playerId) return [];
  if (state.priorityHolder !== playerId) return [];
  if (state.step !== "main") return [];
  const player = state.players[playerId];
  const out = [];
  const artLocked = artifactActivationsLocked(state); // NR-1: crew is an activated ability of an artifact (CR 702.122a)
  let crewPool = null; // computed once, only if a crewable Vehicle exists
  for (const perm of player.battlefield) {
    if (!/\bVehicle\b/.test(String(perm.card?.type || ""))) continue;
    if (lockedActivationSource(state, artLocked, perm.id)) continue; // NR-1 lock, and AU-2: an ARRESTED Vehicle can't be crewed
    const n = crewCostWithOverrides(state, perm.id, parseCrewCost(perm.card)); // S17 — Kotori's "Vehicles you control have crew 2"
    if (n == null || permanentIsCreature(state, perm.id)) continue;
    if (!crewPool) {
      const own = player.battlefield.filter((p) => !p.tapped && permanentIsCreature(state, p.id));
      const sick = own.filter((p) => p.summoningSick && !permanentHasKeyword(state, p.id, "Haste"))
        .sort((a, b) => creaturePower(b, state) - creaturePower(a, state));
      const ready = own.filter((p) => !(p.summoningSick && !permanentHasKeyword(state, p.id, "Haste")))
        .sort((a, b) => creaturePower(a, state) - creaturePower(b, state));
      crewPool = [...sick, ...ready];
    }
    const tapIds = [];
    let power = 0;
    let allSick = true;
    for (const c of crewPool) {
      if (power >= n) break;
      tapIds.push(c.id);
      power += Math.max(0, creaturePower(c, state) + crewPowerBonus(c.card)); // CR 107.1b — negative power contributes 0; S8 — "crews as though its power were N greater"
      if (!c.summoningSick || permanentHasKeyword(state, c.id, "Haste")) allSick = false;
    }
    if (power < n) continue; // can't meet the crew total
    out.push({ kind: "crew-vehicle", playerId, permanentId: perm.id, vehicleName: perm.card?.name, crew: n, tapIds, allSick });
  }
  return out;
}

/** An activated ability whose effect targets a creature BY COMBAT ROLE ("target attacking creature", "target attacking
 * or blocking creature") — the ④-AE combat window below exists for exactly these and nothing else. */
function abilityTargetsCombatRole(ab) {
  return (ab?.program?.atoms || []).some((a) => Array.isArray(a.restrictions) && a.restrictions.some((r) => r.kind === "combat"));
}

/** An activated ability whose effect targets an ABILITY ON THE STACK ("copy target triggered ability you control" —
 * Strionic Resonator, Peter Parker's Camera; SHELF-85 V6). Its only useful window is while such an ability is on the
 * stack, which is never an empty-stack main phase — so, like the combat window above, it gets the narrowest honest
 * lane: any step, the priority holder, ONLY while the stack holds an ability they control. */
function abilityTargetsStackAbility(ab) {
  return (ab?.program?.atoms || []).some((a) => a.targetType === "abilityYouControl");
}

/** The combat steps in which a player holding priority may activate a COMBAT-ROLE ability (④-AE). */
const COMBAT_WINDOW_STEPS = new Set(["beginning-of-combat", "declare-attackers", "declare-blockers", "combat-damage", "end-of-combat"]);

function actionsActivateAbility(state, playerId) {
  if (state.priorityHolder !== playerId) return [];
  // ⭐ THE COMBAT WINDOW (④-AE, 2026-09-03 — Infantry Veteran "{T}: Target attacking creature gets +1/+1", D'Avenant
  // Archer "{T}: This creature deals 1 damage to target attacking or blocking creature", Serra Advocate, Harpoon
  // Sniper, Kithkin Shielddare … 41 cards). The v1 gate above this function surfaces activations only on the
  // player's OWN main phase — deliberately, so the learner isn't spammed at every priority window. But an ability
  // that targets a creature BY COMBAT ROLE is useless there (nothing is attacking or blocking in a main phase) and
  // was being credited native with a pool that could never be non-empty — 28 archers and their kin, hollow since
  // the day the damage lane learned the phrase. The narrowest honest lane: in a combat step, EITHER player holding
  // priority (the defender uses these on the attacker's turn — CR 602.2 instant speed) may activate ONLY the
  // combat-role abilities; every other activation keeps the v1 main-phase window byte-for-byte. The spam concern
  // does not apply — the pool is exactly the attackers / blockers. The AI's picker (pickAction →
  // pickSafeAbilityActivation) skips every TARGETED activation, so the AI's play is unchanged: an AI archer still
  // never shoots (a safe FN, PR-later — the human learner is who this window is for).
  const combatWindow = COMBAT_WINDOW_STEPS.has(state.step);
  const mainWindow = state.activePlayer === playerId && state.step === "main";
  // THE STACK WINDOW (SHELF-85 V6): open only while the stack holds an ability THIS player controls — the sole moment a
  // "copy target … ability you control" activation has a legal target. Gated per ability below (abilityTargetsStackAbility),
  // so every other activation keeps its main / combat window byte-for-byte.
  const stackWindow = (state.stack || []).some((o) => (o.kind === "triggered-ability" || o.kind === "activated-ability") && o.controller === playerId);
  if (!mainWindow && !combatWindow && !stackWindow) return [];
  const player = state.players[playerId];
  const actions = [];
  // ACTIVATED-ABILITY COST-REDUCTION (Training Grounds, Biomancer's Familiar): the controller's battlefield may
  // carry statics that shave the generic mana of "activated abilities of creatures you control". Collected once
  // per player (invariant across the perm/ability loops); applied ONLY to abilities of a CREATURE the player
  // controls (the modeled subject), floored at one mana by activatedCostReductionForCost.
  const activatedReducers = collectActivatedCostReducers(player.battlefield || []);
  // EQUIP-COST OVERRIDE (SHELF CAP12 — Puresteel Paladin / Astor): the cost-SET sibling of the reducers
  // above. Collected once per enumeration like they are; each entry's condition is evaluated LIVE at the
  // equip branch below (an unconditional entry has condition === null).
  const equipOverrides = collectEquipCostOverrides(player.battlefield || []);
  const artLocked = artifactActivationsLocked(state); // NR-1: covers printed + granted + equip abilities of artifacts (CR 602.1/702.6a)
  for (const perm of player.battlefield) {
    // NR-1 — the WHOLE activated surface of an artifact permanent is off under the lock: printed abilities,
    // aura/equipment-granted and group-granted abilities (the granted ability belongs to the HOST — an
    // artifact host means an artifact's ability), and equip (Equipment is an artifact, CR 702.6a).
    if (lockedActivationSource(state, artLocked, perm.id)) continue;
    // GRANTED-ACTIVATED (subsystem 1 phase 1b): an Aura on this creature can confer an activated ability
    // ("Enchanted creature has \"{T}: …\""). The granted descriptors are enumerated HERE on the host, so
    // tapSelf taps the host and the effect's "this creature"/"you" bind to the host/controller at resolution.
    const printed = parseActivatedAbilities(perm.card);
    // GRANTED-ACTIVATED — abilities conferred on this permanent by (a) an Aura/Equipment ATTACHED to it
    // ("Enchanted creature has \"…\""), and (b) a GROUP static ("All Slivers have \"{2}: Regenerate this
    // permanent.\"" — Clot Sliver). The group grants come from layers.grantedActivatedQuotedFor (selector-
    // matched) as raw quoted text, parsed HERE via the SAME parseActivatedAbilities as printed/attachment
    // grants, so cost/effect/modeled/binding are identical and enumerated ON THIS permanent — "this permanent"
    // binds to perm.id (the recipient), the {T}/sacrifice cost taps/sacs perm, never the granter.
    const groupGranted = grantedActivatedQuotedFor(state, perm.id)
      .flatMap((q) => parseActivatedAbilities({ name: perm.card?.name || "GroupGranted", type: "Creature", oracle: q }))
      .filter((a) => a.modeled && !a.isManaEffect);
    const granted = [...grantedActivatedForHost(state, perm), ...groupGranted];
    const abilities = granted.length ? [...printed, ...granted] : printed;
    if (!abilities.length) continue;
    // LOCK-ACTIVATED (Koma mode 1 / the Arrest class): the "activatedAbilitiesLocked" check that USED to
    // live here moved UP into lockedActivationSource, which this loop already gates on. It was the only
    // one of the five enumeration sites that had it, and that asymmetry was the bug — see the predicate's
    // note. Left as a pointer rather than a duplicate check so there stays exactly ONE source of truth.
    const isCreaturePerm = isCreature(perm.card);
    for (const ab of abilities) {
      if (!ab.modeled) continue;
      // ④-AE: the combat window is for combat-role abilities ONLY; V6: the stack window for stack-ability copiers ONLY.
      if (!mainWindow && !(combatWindow && abilityTargetsCombatRole(ab)) && !(stackWindow && abilityTargetsStackAbility(ab))) continue;
      // PER-TURN ACTIVATION LIMIT (BLITZ ONCE-1, generalized to a count): an ability already activated its
      // limit-many times THIS turn is not offered again. Keyed permId:rawLine (raw is unique per ability,
      // printed OR granted — an index would collide across the two lists). The ledger records { turn, n };
      // a record from an earlier turn counts as ZERO uses, so it self-expires without a cleanup pass.
      // `used >= limit` (not `>`) is the whole safety property — off by one here hands out a free
      // activation, i.e. an engine more permissive than the card, which is the forbidden direction.
      if (ab.activationLimit) {
        const rec = state.activatedOncePerTurn?.[`${perm.id}:${ab.raw}`];
        // POWER-UP (CR 207.2c ability word, "Activate each power-up ability only once"): a GAME-scoped
        // limit ignores the turn stamp, so a record from an earlier turn still counts. The per-turn
        // reading below is what makes the ledger self-expiring — correct for every other carrier, and
        // exactly wrong here: it would re-arm a once-per-GAME ability every upkeep.
        const used = ab.activationLimitScope === "game" ? (rec?.n || 0) : (rec && rec.turn === state.turn ? rec.n : 0);
        if (used >= ab.activationLimit) continue;
      }
      // LEVEL-BAND gate (BLITZ LV-1, CR 711.2a/b): a leveler band's activated ability exists ONLY while
      // the source's level-counter count is inside the band ({LEVEL N1-N2} ⇒ N1 <= level <= N2; the open
      // {LEVEL N3+} band carries atMost null). Read live from the permanent's own counter pile, so the
      // very activation that crosses a boundary flips which band's abilities are offered next window.
      if (ab.levelGate) {
        const lvl = perm.counters?.level || 0;
        if (lvl < ab.levelGate.atLeast) continue;
        if (ab.levelGate.atMost != null && lvl > ab.levelGate.atMost) continue;
      }
      // LEVEL UP is sorcery-only by definition (CR 702.87a "Activate only as a sorcery" = own main,
      // empty stack, priority — CR 602.5i). The main-step gate above already covers own-main+priority;
      // canCastSorcerySpeed adds the empty-stack requirement the generic lane approximates away.
      if (ab.sorceryOnly && !canCastSorcerySpeed(state, playerId)) continue;
      // PRECOMBAT-ONLY ("Activate only during your turn, before attackers are declared") — a NARROWING of
      // this lane's window, not a strip. The gate above is `step === "main"`, which covers BOTH main
      // phases, and the POSTCOMBAT main is after attackers are declared. Treating this rider as implied —
      // the way "only as a sorcery" and "only during your turn" legitimately are — would let the engine
      // activate the ability in a window the card forbids. Narrowing to the precombat main can only ever
      // under-offer, which is the safe direction.
      if (ab.preCombatOnly && state.phase !== "precombat-main") continue;
      // COMBAT-STEP RIDER (SHELF-85 Phase 3 · Desert, 2026-09-05 — "Activate only during the end of combat step"): open in
      // EXACTLY the printed step of the combat window (the defender holds priority there on the attacker's turn, CR 602.2);
      // never the main phase, never another combat step.
      if (ab.combatStepOnly && state.step !== ab.combatStepOnly) continue;
      // BOAST (CR 702.135b) — "only if THIS CREATURE attacked this turn". Read off the PERMANENT, never the
      // seat: the seat-level attackedThisTurn (Raid) would offer boast whenever ANY of your creatures
      // attacked, which is a materially different card. The other half of the reminder — once each turn —
      // rides the existing activationLimit ledger rather than a second mechanism.
      if (ab.boast && !perm.attackedThisTurn) continue;
      // CONDITION rider (CR 602.5d) — "Activate only if <board condition>." Evaluated LIVE at the offer gate
      // against the same vocabulary the trigger and spell lanes read (interveningIf.js), with the activation
      // context: the source permanent, and nothing else. `!== true` is deliberate — null means "outside the
      // modeled vocabulary, can't confirm", and an unconfirmable condition must WITHHOLD the offer rather
      // than fall open. The parse side only attaches a condition the probe already proved readable, so null
      // here means the board drifted out from under it, not a shape gap (CREED — FN-safe either way).
      if (ab.condition && evaluateInterveningIf(state, ab.condition, playerId, { sourcePermanentId: perm.id }) !== true) continue;
      if (ab.tapSelf) {
        if (perm.tapped) continue; // can't tap an already-tapped source
        // CR 302.6: a creature's {T} ability needs it un-summoning-sick (granted Haste counts).
        // summoningSickNow (NV-1): layer-aware — a mass-animated land played this turn is gated too.
        // SG-18 (Shang-Chi): "activate abilities of creatures you control as though those creatures had haste".
        if (summoningSickNow(state, perm) && !permanentHasKeyword(state, perm.id, "Haste") && !abilitiesAsThoughHasteFor(state, perm.controller)) continue;
      }
      // PER-COUNTER DISCOUNT rider (Exploding Barrel) — priced FIRST off the source's live counter bag, so the static
      // reducers below and the affordability gate all see the printed card's own price (CR 601.2f).
      let cost = reduceActivatedAbilityCost(perm, parseManaCost(ab.manaPips || ""), ab.reduction);
      // ACTIVATED-ABILITY COST-REDUCTION: shave the generic mana of an ability OF A CREATURE the player
      // controls (Training Grounds "activated abilities of creatures you control cost {N} less to activate"),
      // floored at one mana. Gated to isCreaturePerm so a non-creature's ability (an artifact/enchantment
      // activated ability, an Equip cost) is never wrongly discounted — the modeled subject is creatures only.
      // Applied BEFORE the affordability gate + the equip branch so the reduced cost is what canAfford judges
      // and what the dispatcher is handed. Mana abilities never reach here (isManaEffect excludes them); an
      // X-cost ability is deferred just below, so the reduced generic never mixes with an unresolved {X}.
      if (activatedReducers.length) {
        // Per-reducer subject gate: the Training-Grounds family applies to a CREATURE's abilities; the
        // equipOnly variant (Bureau Headmaster, SHELF S7) applies to EQUIP activations regardless of the
        // (non-creature) Equipment host. A reducer whose subject doesn't match this ability contributes 0.
        // subject:"artifact" (Forensic Gadgeteer #1374) is the third arm — an ARTIFACT's abilities, which is
        // a disjoint pool from the Training-Grounds creature gate except for artifact creatures, where BOTH
        // legitimately apply. Reading it under the creature gate would discount the wrong abilities: a wrong
        // price, not a missing effect, and one the coverage tier can't see.
        const applicable = activatedReducers.filter((r) => (
          r.equipOnly ? !!ab.isEquipAbility
            : r.powerUpOnly ? (!!ab.powerUp && isCreaturePerm && (!r.excludeSelf || r._sourceId !== perm.id)) // Gamma Goliath — power-up abilities of OTHER creatures
              : r.subject === "artifact" ? isArtifact(perm.card)
                : r.subject === "land" ? isLand(perm.card) // Blossoming Tortoise (2026-09-05)
                  : r.subject === "artifactToken" ? (isArtifact(perm.card) && !!perm.card?.token) // Mutagen Man (2026-09-05)
                    : r.subject === "subtype" ? new RegExp(`\\b${String(r.subtype).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(String(typeLineOf(perm.card)).split(" // ")[0]) // Sam's Foods (2026-09-05) — word-bounded on the front face
                      : isCreaturePerm));
        if (applicable.length) cost = activatedCostReductionForCost(applicable, cost);
      }
      // EQUIP-COST OVERRIDE (SHELF CAP12 — Puresteel Paladin "Equipment you control have equip {0} as long
      // as you control three or more artifacts"; Astor "…have equip {1}"). CR-wise the static GRANTS each
      // Equipment an ADDITIONAL equip ability at the stated cost, leaving the printed one intact — so this
      // takes the CHEAPER of the two rather than replacing outright. Compared by total mana value, the
      // deterministic stand-in for "the player picks the one they'd rather pay"; a strict `<` means a tie
      // keeps the printed cost, so the override can only ever make an equip cheaper, never differently-colored.
      //
      // ⛔ FAIL CLOSED ON AN UNCONFIRMABLE GATE. evaluateInterveningIf returns null for a condition outside
      // its vocabulary, and `!== true` withholds the override on null exactly as the ability-condition gate
      // above does — the parse arm only admits a gate measured against this evaluator, so a null here means
      // the board drifted, not a shape gap. Applied AFTER the reducers and BEFORE the affordability gate, so
      // canAfford and the dispatcher both see the price the player will actually pay.
      if (ab.isEquipAbility && equipOverrides.length) {
        let best = null;
        for (const ov of equipOverrides) {
          if (ov.condition && evaluateInterveningIf(state, ov.condition, playerId, { sourcePermanentId: ov._sourceId }) !== true) continue;
          if (best == null || ov.amount < best) best = ov.amount;
        }
        if (best != null && best < totalCmc(cost)) cost = parseManaCost(best > 0 ? `{${best}}` : "");
      }
      // NO-CHOICE cost affordability gates — X-INDEPENDENT, so they sit ABOVE the γ1f costX expansion and
      // gate EVERY enumeration path below (previously the costX branch `continue`d past them — an {X}
      // ability that also carried a pay-life / pay-energy / remove-counter item would have been offered
      // unpayable; no printed modeled ability hit it, but the seam is now airtight — CREED):
      // γ1 — a "Pay N life" cost needs the life to spend (CR 119.4: you can't pay life you don't
      // have). Paying down to exactly 0 is legal (an SBA loss follows), so only skip a strictly-
      // unaffordable one — never hide a legal play.
      if (ab.payLife && player.life < ab.payLife) continue;
      // γ1e — a "Pay {E}…" energy cost needs the energy to spend (CR 122.1e); never offer an activation the
      // player can't pay for. Energy defaults to 0 (older states), so a source with energy 0 is correctly gated out.
      if (ab.payEnergy && (player.energy || 0) < ab.payEnergy) continue;
      // γ1c/CC-2 — a "Remove [N] <type> counter(s) from this" cost needs the source to actually HAVE ≥N such
      // counters (CR 118.3 — a cost can't be paid without the full resources); otherwise it's unpayable
      // (never offer a cost we can't pay). `count` defaults to 1 for the singular form and for any pre-CC-2
      // serialized descriptor (back-compat with saved states).
      if (ab.removeCounter && !((perm.counters?.[ab.removeCounter.type] || 0) >= (ab.removeCounter.count || 1))) continue;
      // LANDS-4 — the exile-from-graveyard cost is frozen (exileGyIds) ONLY by the single-action push below; the
      // per-X lanes (γ1f costX, γ1e sacX) build their own actions and would carry no victims, and the dispatcher
      // pays only what the action names. An ability combining the two shapes is refused here rather than
      // activated for free (FN-safe; no corpus carrier prints the combination — the census found none).
      if (ab.exileGyCount && (ab.costX || ab.sacX)) continue;
      // γ1f — ACTIVATED-{X} (Candelabra of Tawnos "{X}, {T}: Untap X target lands."): a bare mana-{X} cost whose
      // effect's TARGET COUNT is the paid X (a targetCountX atom → program.xSpell). The PLAYER chooses X at
      // activation, so — exactly like the cast path's X-spell branch — enumerate every affordable X and, per X,
      // expand the X-count-target combos (min=max=X distinct legal lands via targeting.expandAtoms, bound from
      // ctx.xValue). Each action bakes the chosen X into the cost (generic += X, so payment auto-taps fixed + X)
      // and threads xValue:x into resolution (applyActivateAbility → ctx.xValue). Gated to ab.costX AND a
      // targets-per-X program; ANY OTHER X-cost activated ability (an X-scaled magnitude, an unmodeled X body)
      // still falls through to the deferral below (a safe false-negative → Arbiter).
      const expandsTargetsPerX = ab.program && (ab.program.atoms || []).some((a) => a.targetCountX);
      // ⭐ X-SCALED MAGNITUDE (④-AO, 2026-09-04 — Oracle of Nectars "{X}, {T}: you gain X life", Silklash Spider "{X}{G}{G}:
      // deals X damage to each creature with flying", Cinder Elemental, Kessig Wolf Run "+X/+0"): an {X}-cost ability whose
      // EFFECT scales with X (an xSpell program — amountX / ptDelta X) rides the SAME expansion as targets-per-X: X from 1
      // to the affordable ceiling, the chosen X on the action → params.xValue → ctx.xValue (the sacX precedent already
      // resolves amountX off ctx.xValue; the spell lane has done this since P2.5). The classifier gate
      // (abilities.js) admits xSpell beside targetCountX, so the metric and this lane cannot drift.
      const expandsMagnitudeX = ab.costX && !!ab.program?.xSpell && !expandsTargetsPerX;
      if (ab.costX && (expandsTargetsPerX || expandsMagnitudeX)) {
        // Mirror the dispatcher's payment sources: a source paying its own cost by tapping ({T}), sac, or exile
        // can't ALSO tap for mana — exclude it from the affordable-X ceiling and the per-X target expansion's
        // affordability. (Candelabra's {T} taps the artifact, which isn't a mana source anyway, but a future
        // creature-with-{T} X ability needs this exclusion to be correct.)
        const xSources = manaSources(state, playerId).filter((s) =>
          !((ab.tapSelf || ab.sacSelf || ab.exileSelf) && s.permanentId === perm.id));
        const poolTotal = totalAvailableMana(state, playerId);
        const sourceTotal = xSources.reduce((sum, s) => sum + (s.amount || 1), 0);
        const ceiling = Math.min(poolTotal + sourceTotal, X_CHOICE_CAP);
        for (let x = 1; x <= ceiling; x++) {
          const xCost = xResolvedCost(cost, x); // generic += xCount * X (CR 107.3; xCount = 1 for a single {X})
          if (!canAfford(player.manaPool, xSources, xCost, { activatingIsCreature: permanentIsCreature(state, perm.id), activatingTypeLine: String(perm.card?.type || perm.card?.type_line || ""), activatingColors: permanentColors(state, perm.id) })) break; // monotonic in X → stop at the first shortfall (SG-18: activation spend context)
          // Per-X target enumeration: exactly X distinct legal lands (targetCountX → expandAtoms min=max=X). An X
          // with too few legal lands (fewer than X untappable targets exist) yields no combos → that X is skipped.
          const combos = expandCastChoices(state, playerId, ab.program, colorsOf(perm.card), { xValue: x });
          for (const ch of combos) {
            actions.push({
              kind: "activate-ability",
              playerId,
              permanentId: perm.id,
              name: perm.card.name,
              abilityIndex: ab.index,
              cost: xCost,
              cmc: totalCmc(xCost),
              tapSelf: ab.tapSelf,
              payLife: ab.payLife || 0,
              payEnergy: ab.payEnergy || 0,
              sacSelf: ab.sacSelf || false,
              exileSelf: ab.exileSelf || false,
              removeCounter: ab.removeCounter || null,
              sacCreatureId: null,
              sacCreatureName: null,
              sacCountIds: null,
              xValue: x,                                  // γ1f — the chosen X threads into the effect (ctx.xValue)
              ...(ab.activationLimit ? { oncePerTurnKey: `${perm.id}:${ab.raw}` } : {}), // ONCE-1 ledger key
              program: ab.program,
              targets: ch.targets,
              chosenMode: ch.chosenMode ?? null,
              needsTargets: ch.targets.length > 0,
              targetName: ch.targets.map((t) => t.name).filter(Boolean).join(", ") || undefined,
              abilityText: `X=${x}: ${ab.effectClause}`,
            });
          }
        }
        continue; // costX expanded its own per-X actions; skip the deferral + single-action push below
      }
      if (cost.hasX) continue; // X-cost activated abilities deferred (need the X-choice expansion)
      // γ1d — a "Sacrifice N <fungible subtype>" cost (Ruthless Knave "Sacrifice three Treasures", Olivia
      // "Sacrifice two Treasures"). The subtype is a FUNGIBLE value token (Treasure/Food/…), so the N victims
      // are interchangeable — no meaningful choice among them (CR 701.16). Gather every legal victim of the
      // subtype (excluding any that would silently drop its own leave-trigger — the single-sac fail-safe; a
      // value token has none, so it's a belt-and-suspenders no-op), and require ≥ N to exist. The N to-be-
      // sacrificed victims must NOT also tap for mana (a Treasure cracked for the cost can't ALSO pay the
      // {mana} part — that double-spend crashed the dispatcher), so they're excluded from the mana sources
      // below. Computed BEFORE the affordability gate so the cost is judged against the mana sources that
      // actually remain after paying the sac.
      let sacCountPool = null;
      if (ab.sacCount) {
        sacCountPool = player.battlefield.filter((v) =>
          sacTypeMatches(v.card, ab.sacCount.type, ab.sacCount.subtype || null) &&
          !sacrificeDropsTrigger(v.card?.oracle || v.card?.oracle_text || ""),
        );
        if (sacCountPool.length < ab.sacCount.count) continue; // can't pay the sac → not offered
      }
      // LANDS-4 — "Exile N [<type>] cards from your graveyard" (Mines of Moria, Grim Lavamancer, Graveyard
      // Marshal): the victims come from the controller's OWN graveyard, typed through the same
      // cardMatchesAddCostType the spell-side ADDCOST-3 lane reads ("any" = every card), and EXACTLY N are
      // frozen on the action by the same least-valuable policy the count-N discard/exile costs use. Fewer than
      // N legal cards → the cost is unpayable and the ability is never offered (CR 601.2h). The dispatcher
      // re-verifies every id against the graveyard at activation and exiles them before the ability stacks.
      // The pool is gathered here; the EXACT pick — and the ONE "fewer than N → not offered" gate — happens
      // per target combo below, excluding any graveyard card the effect targets (Cabal Surgeon exiles two and
      // returns a third — a victim that is also the target would fizzle the ability, CR 608.2b). No early gate
      // here on purpose: a duplicate gate survived mutation (the per-combo skip already enforced it), and one
      // enforcing line is easier to keep honest than two.
      let exileGyPool = null;
      if (ab.exileGyCount) {
        exileGyPool = (player.graveyard || []).filter((g) =>
          !g.token && (ab.exileGyCount.cardType === "any" || cardMatchesAddCostType(g, ab.exileGyCount.cardType)))
          .sort(leastValuableCardCmp);
      }
      // γ1e — "Sacrifice X <fungible subtype>": gather every legal victim of the subtype (same fungible-value-token
      // pool + leave-trigger fail-safe as γ1d). The PLAYER chooses X (1..available), so at least ONE must exist to
      // offer the ability; the per-X expansion inside the choice loop picks exactly X of these (target-overlap aware).
      let sacXPool = null;
      if (ab.sacX) {
        sacXPool = player.battlefield.filter((v) =>
          sacTypeMatches(v.card, ab.sacX.type, ab.sacX.subtype || null) &&
          !sacrificeDropsTrigger(v.card?.oracle || v.card?.oracle_text || ""),
        );
        if (sacXPool.length < 1) continue; // can't sacrifice even one → X≥1 impossible → not offered
      }
      // The set of permanents consumed BY the sac is always exactly N members of the fungible pool, whichever
      // N — so for the offer-time affordability check, excluding the first N from the mana sources is correct
      // (a different per-choice pick, forced by target overlap below, removes an equally-non-mana member).
      // For γ1e (variable X), exclude the WORST case for the {mana} part — the SINGLE Treasure needed for X=1
      // (a larger X only sacrifices MORE Treasures, but the mana cost is X-independent; the per-X loop below
      // re-checks affordability against that X's exact excluded victims, so this offer-gate stays conservative).
      const sacCountManaExcluded = new Set(
        ab.sacCount ? sacCountPool.slice(0, ab.sacCount.count).map((v) => v.id)
          : ab.sacX ? sacXPool.slice(0, 1).map((v) => v.id)
            : [],
      );
      // A source paying part of its OWN cost by tapping ({T}), being sacrificed, or being exiled can't
      // ALSO tap for mana — drop it from the available mana sources for the affordability + payment. The
      // γ1d sac-N victims are dropped too (a sacrificed Treasure can't also be cracked for mana).
      const sources = manaSources(state, playerId).filter((s) =>
        !((ab.tapSelf || ab.sacSelf || ab.exileSelf) && s.permanentId === perm.id) &&
        !sacCountManaExcluded.has(s.permanentId));
      // W3: a γ1b sacOther ability's affordability is PER-VICTIM (a one-shot mana victim can't also
      // be cracked for the {mana} part) — checked inside the victim loop below; non-sac abilities
      // keep this fast path.
      if (!ab.sacOther && !canAfford(player.manaPool, sources, cost, { activatingIsCreature: permanentIsCreature(state, perm.id), activatingTypeLine: String(perm.card?.type || perm.card?.type_line || ""), activatingColors: permanentColors(state, perm.id) })) continue; // SG-18: activation spend context

      // Equip {cost}: target a creature YOU control (CR 702.6e). Equip is SORCERY-SPEED
      // (CR 702.6f) — unlike other activated abilities (instant-speed, conservatively
      // main-gated here), it also needs an EMPTY stack, or the player could illegally equip
      // in response to a spell already on the stack. One action per legal creature target.
      if (ab.isEquipAbility) {
        if ((state.stack?.length || 0) > 0) continue;
        // SHELF-85 V15 (Detainment Spell's "Attach this Aura to target creature"): an Aura may be moved onto ANY
        // creature ("Enchant creature"), an opponent's included — so the pool is every battlefield; Equip stays yours.
        const pool = ab.isAuraAttach
          ? Object.entries(state.players || {}).flatMap(([pid, pl]) => (pl?.battlefield || []).map((t) => ({ t, pid })))
          : player.battlefield.map((t) => ({ t, pid: playerId }));
        for (const { t, pid: tPid } of pool) {
          if (!isCreature(t.card)) continue;
          if (ab.isAuraAttach && t.id === perm.attachedTo) continue; // already its host — moving it there is no move
          // EQUIP-[QUALITY] (CR 702.6c): a restricted equip ("Equip commander {3}" / "Equip legendary
          // creature {2}") may target only a creature you control that has the stated quality. Two qualities
          // are modeled: "commander" (CR 903.3 designation travels the card) and "legendary" (the target's
          // type line is Legendary). A creature lacking the quality is not a legal target for this ability
          // (a plain "Equip {5}" on the same card still enumerates it).
          if (ab.equipQuality === "commander" && !t.card?.isCommander) continue;
          if (ab.equipQuality === "legendary" && !/\blegendary\b/i.test(t.card?.type || "")) continue;
          // KW-UNTARGET: Equip is a TARGETED ability (CR 702.6e), so it obeys targetability — a Shroud
          // creature (CR 702.18a) can't be targeted even by its controller. Route through the shared
          // guard (hexproof never blocks here, since Equip only targets your OWN creatures — CR 702.11b).
          if (!canBeTargetedBy(state, t, tPid, playerId)) continue; // V15: an opponent's creature obeys hexproof/shroud against the activator
          actions.push({
            kind: "activate-ability", playerId, permanentId: perm.id, name: perm.card.name,
            abilityIndex: ab.index, cost, cmc: totalCmc(cost), tapSelf: false, program: null,
            targets: [{ id: t.id, name: t.card?.name, type: "creature", controller: tPid }],
            needsTargets: true, targetName: t.card?.name, abilityText: ab.costStr, isEquipAbility: true, ...(ab.isAuraAttach ? { isAuraAttach: true } : {}),
          });
        }
        continue;
      }

      // γ1b — a "Sacrifice a/another <type>" cost: the PLAYER picks which permanent to sacrifice. Expand
      // one action per legal victim (a permanent you control of <type>, excluding the source when
      // "another"), so the choice is a real in-game pick from the action list. A victim that would
      // silently drop its OWN trigger on leaving (an LTB / "when you sacrifice" / compound trigger the
      // dies path can't fire) is excluded — the same fail-safe as self-sac — so we never partially apply.
      let sacVictims = [null];
      if (ab.sacOther) {
        sacVictims = player.battlefield.filter((v) =>
          (!ab.sacOther.another || v.id !== perm.id) &&
          sacTypeMatches(v.card, ab.sacOther.type, ab.sacOther.subtype || null) &&
          // SAC-NONTOKEN (2026-08-07) — "Sacrifice a NONTOKEN <type>" (Thopter Foundry, Infernal Tribute):
          // a token victim is excluded. Same `!v.card?.token` read the alt-cost sacrificeCreature lane uses.
          // ⛔ Offering a token here would let Thopter Foundry sacrifice its own Thopters in a loop the card
          // is explicitly printed to forbid — an illegal payment, the forbidden direction.
          (!ab.sacOther.nontoken || !v.card?.token) &&
          !sacrificeDropsTrigger(v.card?.oracle || v.card?.oracle_text || ""),
        );
        if (sacVictims.length === 0) continue; // no legal sacrifice available → the cost can't be paid
      }

      // γ1f — a "Tap an untapped creature you control" cost (Earthcraft): the PLAYER picks which UNTAPPED
      // creature they control to tap. Expand one action per legal creature to tap (an UNTAPPED creature you
      // control). A summoning-sick creature CAN be tapped for a cost that isn't its own {T} ability (CR 302.6
      // only gates the creature's OWN {T}), so no sickness filter here. Empty pool → the cost can't be paid →
      // not offered. Threaded as tapVictims below (parallel to sacVictims), tapped by the dispatcher and
      // excluded from that action's mana sources (a creature tapped for the cost can't also tap for mana).
      // tapCreature + sacOther never co-occur on a modeled ability, so the two victim sets don't mix.
      //
      // SOURCE EXCLUSION (CREED — never offer an unpayable / crashing action): the SOURCE permanent is
      // excluded as its own tap-victim when it would ALREADY be tapped by another part of THIS cost — i.e.
      // when the ability also has a {T} cost (tapSelf), since the source can't tap for both {T} and the
      // tap-creature cost (Selesnya Evangel "{1}, {T}, Tap an untapped creature you control: …"; Revelsong
      // Horn). Also excluded when the cost text says "another" (it never does for the modeled shape, but the
      // flag is honored). Without this, the dispatcher would throw ALREADY_TAPPED on an offered action.
      let tapVictims = [null];
      // V6 slice 2 — the COUNTED form ("Tap two untapped creatures you control", Kirol): ONE action paying a frozen set
      // of N untapped creatures the player controls (the source itself may be one of them — the printed cost has no
      // {T}, and CR 302.6 restricts only {T}/{Q}, so a summoning-sick body may pay it). Auto-picked like the counted
      // sacrifice: summoning-sick creatures first (they can't attack this turn anyway), then battlefield order — a
      // written policy, never a wrong play. Fewer than N untapped creatures → the cost can't be paid → not offered.
      let tapCountIds = null;
      if (ab.tapCreature && ab.tapCreature.count > 1) {
        const selfExcluded = ab.tapSelf || ab.tapCreature.another;
        const pool = player.battlefield.filter((v) => !v.tapped && isCreature(v.card) && !(selfExcluded && v.id === perm.id));
        const ordered = [...pool.filter((v) => v.summoningSick), ...pool.filter((v) => !v.summoningSick)];
        if (ordered.length < ab.tapCreature.count) continue;
        tapCountIds = ordered.slice(0, ab.tapCreature.count).map((v) => v.id);
      } else if (ab.tapCreature) {
        const selfExcluded = ab.tapSelf || ab.tapCreature.another;
        tapVictims = player.battlefield.filter((v) =>
          !v.tapped && isCreature(v.card) &&
          !(selfExcluded && v.id === perm.id),
        );
        if (tapVictims.length === 0) continue; // no untapped creature to tap → the cost can't be paid
      }
      const tapCountSet = tapCountIds ? new Set(tapCountIds) : null;

      // γ1g — a "Return a land you control to its owner's hand" cost (Oboro Breezecaller): the PLAYER picks
      // which LAND they control to bounce. Expand one action per legal land you control; a land that would
      // silently drop its OWN leaves-the-battlefield trigger (an LTB / "when you sacrifice" / compound trigger
      // the bounce path can't fire) is excluded — the SAME fail-safe as sacOther (sacrificeDropsTrigger also
      // matches "leaves the battlefield"), so returning it never partially applies (CREED). The chosen land is
      // bounced by the dispatcher BEFORE the ability goes on the stack, and it can't ALSO tap for mana, so it's
      // excluded from THIS action's mana sources below. returnLand never co-occurs with sacOther/tapCreature on
      // a modeled ability, so the victim sets don't mix. Empty (no land you control) → the cost can't be paid →
      // not offered. Because the cost bounces a LAND you control, a self-source-is-a-land case (the ability's own
      // permanent being a land) never arises for the modeled shape (Oboro is a creature), but the "another"-style
      // self-exclusion would be honored via ab.returnLand.another if a future card needs it.
      let returnLandVictims = [null];
      if (ab.returnLand) {
        const selfExcluded = ab.returnLand.another;
        returnLandVictims = player.battlefield.filter((v) =>
          isLand(v.card) &&
          // stage ③ · 31 — "Return a Forest you control" (Quirion Ranger): the subtype, word-bounded on the type line.
          (!ab.returnLand.subtype || new RegExp(`\\b${ab.returnLand.subtype}\\b`, "i").test(typeLineOf(v.card))) &&
          !(selfExcluded && v.id === perm.id) &&
          !sacrificeDropsTrigger(v.card?.oracle || v.card?.oracle_text || ""),
        );
        if (returnLandVictims.length === 0) continue; // no returnable land → the cost can't be paid
      }

      // γ1i (SHELF CAP14) — an "Unattach an Equipment from <self>" cost (Captain America's "Throw"): the
      // PLAYER picks WHICH Equipment attached to the SOURCE to remove. Expand one action per attached
      // Equipment — they are NOT fungible here, because the chosen one's MANA VALUE becomes the ability's
      // damage, so each is a genuinely different play. An UNEQUIPPED source can't pay the cost at all and
      // is simply not offered (CR 601.2h) — which is also the honest reading of the card: no Equipment,
      // no Throw.
      let unattachVictims = [null];
      if (ab.unattachEquipment) {
        // Read the SOURCE's attachment list off the battlefield permanent being enumerated (`perm`) rather
        // than re-looking it up: the enumerator already holds the live object, exactly as the equip branch
        // below reads its permanents directly.
        unattachVictims = (perm.attachments || [])
          .map((id) => findPermanent(state, id)?.permanent)
          .filter((e) => e && /\bequipment\b/i.test(String(e.card?.type_line ?? e.card?.type ?? "")));
        // ⚠️ DEFENSIVE, AND ITS MUTATION DOES NOT FAIL — measured, not assumed (CAP14 mutation M4). With an
        // empty pool the `for (const unattachVictim of unattachVictims)` loop below already iterates zero
        // times, so deleting this line changes NOTHING and the suite stays green. It is kept as a cheap
        // early exit that skips the remaining per-ability work, NOT as a proven gate — the behaviour it
        // describes (an unequipped source is offered no Throw) is real and pinned, but THIS line is not
        // what enforces it. Said plainly so a later reader doesn't mistake it for a load-bearing guard.
        if (unattachVictims.length === 0) continue; // nothing attached → the cost can't be paid
      }

      // γ1h (BLITZ DC-1) — a "Discard a card" cost (Rummaging Goblin / the granted looter interiors): the
      // PLAYER picks WHICH hand card to pitch. Expand one action per DISTINCT-named hand card (copies are
      // fungible — CR 601.2h pays with the object, and identical cards pay identically), capping the
      // combinatorics at the hand's name variety. Empty hand → the cost can't be paid → not offered. The
      // discard is a hand→graveyard move (no mana interaction, so no affordability filter is needed).
      let discardVictims = [null];
      if (ab.discardCard) {
        const seenNames = new Set();
        discardVictims = (player.hand || []).filter((c) => {
          // γ1h-TYPED (Tortured Existence): a typed discard cost narrows the pool to hand cards whose
          // FRONT-FACE type line carries the type (CR 712.4a, word-cased match — "creature" → Creature).
          if (ab.discardCardFilter) {
            const front = String(c?.type || c?.type_line || "").split(" // ")[0];
            const word = ab.discardCardFilter[0].toUpperCase() + ab.discardCardFilter.slice(1);
            if (!front.includes(word)) return false;
          }
          const k = c?.name || c?.id;
          if (seenNames.has(k)) return false;
          seenNames.add(k);
          return true;
        });
        // RG-7 (2026-09-05): a RANDOM discard is not a choice — ONE pseudo-victim (the dispatcher picks the card at payment
        // with the seeded rng); an empty hand still means the cost can't be paid.
        if (ab.discardRandom) discardVictims = (player.hand || []).length ? [{ id: null, name: "a random card", random: true }] : [];
        if (discardVictims.length === 0) continue; // nothing to discard → the cost can't be paid
      }

      // Thread the SOURCE permanent id into target enumeration so an "another target …" restriction
      // (notSource — Formidable Speaker's "Untap another target permanent") excludes this very permanent
      // (CR 109.5). Non-"another" abilities ignore sourceId, so this is a no-op for every existing ability.
      const choices = expandCastChoices(state, playerId, ab.program, colorsOf(perm.card), { sourceId: perm.id });
      if (choices.length === 0) continue; // a required target has no legal pick → uncastable
      for (const victim of sacVictims) {
        // W3 (two-sites invariant): exclude a ONE-SHOT mana victim from the sources for THIS victim's
        // affordability — mirrors the dispatcher's payment filter exactly.
        if (ab.sacOther && !canAfford(player.manaPool, sourcesExcludingOneShotVictim(sources, victim?.id), cost, { activatingIsCreature: permanentIsCreature(state, perm.id), activatingTypeLine: String(perm.card?.type || perm.card?.type_line || ""), activatingColors: permanentColors(state, perm.id) })) continue;
       for (const tapVictim of tapVictims) {
        // γ1f — a "Tap an untapped creature you control" cost: the chosen creature to tap can't ALSO tap for
        // mana (a mana-dork tapped for the cost is already tapped), so exclude it from THIS victim's mana
        // sources for the affordability check — mirrors the dispatcher's payment filter exactly. Earthcraft's
        // cost has no {mana} part, so this is trivially satisfied there, but the guard keeps a future
        // mana+tap-creature ability payable-only-when-truly-affordable (never an unpayable offer, CREED).
        if (ab.tapCreature && !canAfford(player.manaPool, sources.filter((s) => s.permanentId !== tapVictim?.id && !tapCountSet?.has(s.permanentId)), cost, { activatingIsCreature: permanentIsCreature(state, perm.id), activatingTypeLine: String(perm.card?.type || perm.card?.type_line || ""), activatingColors: permanentColors(state, perm.id) })) continue;
       for (const unattachVictim of unattachVictims) {
       for (const returnLandVictim of returnLandVictims) {
        // γ1g — a "Return a land you control to its owner's hand" cost: the land bounced for the cost can't ALSO
        // tap for mana (it's gone before the {mana} is paid), so exclude it from THIS action's mana sources for
        // the affordability check — mirrors the dispatcher's payment filter exactly. This is the real gate for
        // Oboro: bouncing the land that would have paid the {2} must not be counted as still available.
        if (ab.returnLand && !canAfford(player.manaPool, sources.filter((s) => s.permanentId !== returnLandVictim?.id), cost, { activatingIsCreature: permanentIsCreature(state, perm.id), activatingTypeLine: String(perm.card?.type || perm.card?.type_line || ""), activatingColors: permanentColors(state, perm.id) })) continue;
        for (const discardVictim of discardVictims) { // γ1h (DC-1) — one action per distinct hand card to pitch
        for (const ch of choices) {
          // Don't offer sacrificing the very permanent the effect targets — the victim is paid as a
          // cost (gone before the ability resolves), so the effect would fizzle to a no-op (CR 608.2b).
          // A clean no-op, but a pointless self-defeating action; drop it from the choice list.
          if (victim && ch.targets.some((t) => t.id === victim.id)) continue;
          // γ1f — don't offer tapping the very creature the effect targets when the target is that same
          // creature (a basic-land untap can't target a creature, so this never fires for Earthcraft — it's a
          // belt-and-suspenders no-op guard mirroring the sac path; a future tap-creature ability that targets
          // a creature would need it). The tapped creature stays on the battlefield, so this is only a "don't
          // waste the tap on your own target" nicety, not a correctness gate.
          if (ab.tapCreature && tapVictim && ch.targets.some((t) => t.id === tapVictim.id)) continue;
          if (tapCountSet && ch.targets.some((t) => tapCountSet.has(t.id))) continue; // V6 slice 2 — a frozen tap victim is never also the target
          // γ1g — don't offer bouncing the very land the effect targets: the land is returned to hand as a COST
          // (gone before the ability resolves), so an "untap target land" that targeted that same land would
          // fizzle to a no-op (CR 608.2b — the target is no longer on the battlefield). Drop that self-defeating
          // combo; a DIFFERENT land target (untap one land, bounce another) is still offered.
          if (ab.returnLand && returnLandVictim && ch.targets.some((t) => t.id === returnLandVictim.id)) continue;
          // γ1d — pick the N fungible victims for a "Sacrifice N <subtype>" cost, EXCLUDING any that the
          // effect targets (same no-op guard). If the targets consume so many of the pool that fewer than N
          // remain, this choice can't pay the cost → skip it (a different target combo may still be legal).
          let sacCountIds = null;
          if (ab.sacCount) {
            const targetIds = new Set(ch.targets.map((t) => t.id));
            const pick = sacCountPool.filter((v) => !targetIds.has(v.id)).slice(0, ab.sacCount.count);
            if (pick.length < ab.sacCount.count) continue;
            sacCountIds = pick.map((v) => v.id);
          }
          // LANDS-4 — pick the N graveyard cards to exile for an "Exile N [<type>] cards from your graveyard"
          // cost, EXCLUDING any graveyard card this combo targets (the γ1d no-op guard, one zone over). Too few
          // left after the targets → this combo can't pay → skip it (another target may still be legal).
          let exileGyIds = null;
          if (ab.exileGyCount) {
            const targetIds = new Set(ch.targets.map((t) => t.id));
            const pick = exileGyPool.filter((g) => !targetIds.has(g.id)).slice(0, ab.exileGyCount.count);
            if (pick.length < ab.exileGyCount.count) continue;
            exileGyIds = pick.map((g) => g.id);
          }
          // γ1e — "Sacrifice X <subtype>" (Grim Hireling): the PLAYER chooses X. Expand ONE action per legal X
          // (1..available), each paying exactly X fungible victims and threading xValue:X into the effect (the
          // "-X/-X" reads ctx.xValue). Victims exclude any the effect TARGETS (a sacrificed Treasure the ability
          // also targeted would fizzle — no-op guard, same as γ1d) and any needed to tap for the {mana} part (a
          // Treasure cracked for the sac can't ALSO pay {B}). The mana affordability is re-checked PER X against
          // that X's exact excluded victims — a larger X removes more Treasures from the mana sources, so an X
          // that starves the {mana} part is not offered (never an unpayable cost). One shared code path for the
          // final action push below (sacXIds threads like sacCountIds); the non-sacX case leaves sacXIds null.
          if (ab.sacX) {
            const targetIds = new Set(ch.targets.map((t) => t.id));
            const avail = sacXPool.filter((v) => !targetIds.has(v.id));
            for (let x = 1; x <= avail.length; x++) {
              const sacXIds = avail.slice(0, x).map((v) => v.id);
              const sacXExcluded = new Set(sacXIds);
              // A Treasure sacrificed for the X cost can't ALSO tap for the {mana} part — mirror the dispatcher.
              const sourcesForX = manaSources(state, playerId).filter((s) =>
                !((ab.tapSelf || ab.sacSelf || ab.exileSelf) && s.permanentId === perm.id) &&
                !sacXExcluded.has(s.permanentId));
              if (!canAfford(player.manaPool, sourcesForX, cost, { activatingIsCreature: permanentIsCreature(state, perm.id), activatingTypeLine: String(perm.card?.type || perm.card?.type_line || ""), activatingColors: permanentColors(state, perm.id) })) continue; // this X starves the {mana} part
              actions.push({
                kind: "activate-ability",
                playerId,
                permanentId: perm.id,
                name: perm.card.name,
                abilityIndex: ab.index,
                cost,
                cmc: totalCmc(cost),
                tapSelf: ab.tapSelf,
                payLife: ab.payLife || 0,
                payEnergy: ab.payEnergy || 0,
                sacSelf: ab.sacSelf || false,
                exileSelf: ab.exileSelf || false,
                removeCounter: ab.removeCounter || null,
                sacCreatureId: null,
                sacCreatureName: null,
                sacCountIds: sacXIds,                       // γ1e — the X fungible victims to sacrifice (cost)
                xValue: x,                                  // γ1e — the chosen X threads into the effect (ctx.xValue)
                ...(ab.activationLimit ? { oncePerTurnKey: `${perm.id}:${ab.raw}` } : {}), // ONCE-1 ledger key
                program: ab.program,
                targets: ch.targets,
                chosenMode: ch.chosenMode ?? null,
                needsTargets: ch.targets.length > 0,
                targetName: ch.targets.map((t) => t.name).filter(Boolean).join(", ") || undefined,
                abilityText: `Sacrifice ${x} ${ab.sacX.subtype}${x === 1 ? "" : "s"}: ${ab.effectClause}`,
              });
            }
            continue; // sacX expanded its own per-X actions; skip the single-action push below
          }
          actions.push({
            kind: "activate-ability",
            playerId,
            permanentId: perm.id,
            name: perm.card.name,
            abilityIndex: ab.index,
            cost,
            cmc: totalCmc(cost),
            tapSelf: ab.tapSelf,
            payLife: ab.payLife || 0,
            payEnergy: ab.payEnergy || 0,
            sacSelf: ab.sacSelf || false,
            exileSelf: ab.exileSelf || false,            // γ1c — exile the source from the battlefield
            removeCounter: ab.removeCounter || null,     // γ1c — remove a counter of this type from the source
            sacCreatureId: victim?.id ?? null,           // γ1b — the chosen victim to sacrifice (cost)
            sacCreatureName: victim?.card?.name ?? null,
            sacCountIds,                                  // γ1d — the N fungible victims to sacrifice (cost)
            tapCreatureId: tapVictim?.id ?? null,        // γ1f — the chosen untapped creature to tap (cost)
            tapCreatureName: tapVictim?.card?.name ?? null,
            tapCountIds,                                  // V6 slice 2 — the N frozen untapped creatures to tap (cost)
            returnLandId: returnLandVictim?.id ?? null,  // γ1g — the chosen land to return to owner's hand (cost)
            returnLandName: returnLandVictim?.card?.name ?? null,
            unattachEquipmentId: unattachVictim?.id ?? null,     // γ1i (CAP14) — the chosen attached Equipment (cost)
            unattachEquipmentName: unattachVictim?.card?.name ?? null,
            discardCardId: discardVictim?.id ?? null,    // γ1h (DC-1) — the chosen hand card to pitch (cost)
            discardCardName: discardVictim?.name ?? null,
            ...(discardVictim?.random ? { discardRandom: true } : {}), // RG-7 — the dispatcher picks the pitch with the seeded rng
            ...(ab.discardCardFilter ? { discardCardFilter: ab.discardCardFilter } : {}), // γ1h-TYPED — the dispatcher re-validates the pitch's front-face type
            ...(exileGyIds ? { exileGyIds, exileGyCount: ab.exileGyCount } : {}), // LANDS-4 — the N graveyard cards to exile (cost); the dispatcher re-verifies each
            ...(ab.activationLimit ? { oncePerTurnKey: `${perm.id}:${ab.raw}` } : {}), // ONCE-1 ledger key
            program: ab.program,
            targets: ch.targets,
            chosenMode: ch.chosenMode ?? null,
            needsTargets: ch.targets.length > 0,
            targetName: ch.targets.map((t) => t.name).filter(Boolean).join(", ") || undefined,
            abilityText: ab.sacCount
              ? `Sacrifice ${ab.sacCount.count} ${ab.sacCount.subtype}s: ${ab.effectClause}`
              : ab.tapCreature && tapVictim ? `Tap ${tapVictim.card?.name}: ${ab.effectClause}`
              : ab.returnLand && returnLandVictim ? `Return ${returnLandVictim.card?.name}: ${ab.effectClause}`
              : ab.unattachEquipment && unattachVictim ? `Unattach ${unattachVictim.card?.name}: ${ab.effectClause}`
              : ab.discardCard && discardVictim ? `Discard ${discardVictim.name}: ${ab.effectClause}`
              : victim ? `Sacrifice ${victim.card?.name}: ${ab.effectClause}` : ab.effectClause,
          });
        }
       }
       }
       }
       }
      }
    }
  }
  return actions;
}

/**
 * DOUBLE-MANA-POOL (Doubling Cube — "{3}, {T}: Double the amount of each type of unspent mana you have.").
 * A MANA ability (CR 605.1a) that resolves WITHOUT the stack (CR 605.3a) — so, like tap-for-mana and unlike
 * a stack `activate-ability`, it's enumerated here as its own `double-mana-pool` action rather than through
 * actionsActivateAbility (which filters mana abilities out via `!ab.isManaEffect`). Offer it when the source
 * is untapped, un-summoning-sick if a creature (granted Haste counts, CR 302.6), and its `{3},{T}` cost is
 * affordable from the player's pool + untapped sources (the source itself excluded from paying the {mana},
 * mirroring actionsActivateAbility's tapSelf exclusion). Same main + priority window as the sibling mana /
 * activated-ability enumerators — a conservative gate (mana abilities are instant-speed, CR 605.3a, but
 * under-offering off-turn is a safe false-negative). The AI auto-pickers ignore this kind (like tap-for-mana),
 * so self-play never loops on it; it's the explicit manual play for a floating-mana line + the coverage-native
 * proof that the runtime can actually resolve the card.
 */
function actionsDoubleManaPool(state, playerId) {
  if (state.activePlayer !== playerId) return [];
  if (state.priorityHolder !== playerId) return [];
  if (state.step !== "main") return [];
  const player = state.players[playerId];
  const actions = [];
  const artLocked = artifactActivationsLocked(state); // NR-1: Doubling Cube is an artifact mana ability (CR 605.1a)
  for (const perm of player.battlefield) {
    if (lockedActivationSource(state, artLocked, perm.id)) continue; // NR-1 artifact lock + AU-2 per-permanent lock
    for (const ab of parseActivatedAbilities(perm.card)) {
      if (!ab.doubleManaPool) continue;
      if (ab.tapSelf) {
        if (perm.tapped) continue; // can't tap an already-tapped source
        // summoningSickNow (NV-1, CR 302.6): layer-aware — printed creatures read their flag as before.
        if (summoningSickNow(state, perm) && !permanentHasKeyword(state, perm.id, "Haste")) continue;
      }
      const cost = parseManaCost(ab.manaPips || "");
      if (cost.hasX) continue; // no X-cost double-mana ability exists; guard defensively
      // The {mana} part is paid from the pool + untapped sources EXCLUDING the source itself when it also
      // taps ({T}) — a source can't tap for mana AND pay its own {T} (mirrors actionsActivateAbility).
      const sources = manaSources(state, playerId).filter((s) => !(ab.tapSelf && s.permanentId === perm.id));
      if (!canAfford(player.manaPool, sources, cost)) continue;
      actions.push({
        kind: "double-mana-pool",
        playerId,
        permanentId: perm.id,
        name: perm.card.name,
        abilityIndex: ab.index,
        cost,
        cmc: totalCmc(cost),
        tapSelf: ab.tapSelf,
        abilityText: ab.raw,
      });
    }
  }
  return actions;
}

/**
 * KW-CYCLING (CR 702.29) — cycling is an activated ability usable only from a player's HAND
 * ("[Cost], Discard this card: Draw a card"). Offer one `cycle` action per hand card whose plain,
 * fully-modeled cycling cost (parseCyclingCost — null for typecycling + cycle-trigger cards) the
 * player can afford. Conservatively main + priority gated like the other activated abilities (cycling
 * is instant-speed per CR 702.29a, but under-offering it at instant speed is a safe false-negative).
 */
function actionsCycleFromHand(state, playerId) {
  if (state.activePlayer !== playerId) return [];
  if (state.priorityHolder !== playerId) return [];
  if (state.step !== "main") return [];
  const player = state.players[playerId];
  const actions = [];
  for (const card of player.hand) {
    const costStr = parseCyclingCost(card);
    if (costStr) {
      const cost = parseManaCost(costStr);
      if (cost.hasX) continue; // an X cycling cost would need the X-choice expansion (none in the corpus)
      if (!canAfford(player.manaPool, manaSources(state, playerId), cost)) continue;
      actions.push({ kind: "cycle", playerId, cardId: card.id, name: card.name, cost, cmc: totalCmc(cost) });
      continue;
    }
    // LIFE-COST CYCLING (Street Wraith, SHELF S7): offered only while the player's life STRICTLY exceeds
    // the cost — CR 118.4 allows paying down to 0, but a suicide-cycle is never the AI's line and
    // under-offering at exactly-N life is a safe FN. Zero mana; the dispatcher pays via loseLife.
    const lifeCost = parseCyclingLifeCost(card);
    if (lifeCost != null && player.life > lifeCost) {
      actions.push({ kind: "cycle", playerId, cardId: card.id, name: card.name, cost: parseManaCost("{0}"), lifeCost, cmc: 0 });
    }
  }
  return actions;
}

/**
 * DISCARD-COST HAND ABILITY — "<mana>, Discard this card: <effect>" (Waker of Waves, Ultimo, Visionary's
 * Dance, Elemental Masterpiece …). Structurally IDENTICAL to cycling directly above: an activated ability
 * whose cost is mana plus discarding the card itself, played from hand. Cycling is the special case where
 * the effect is hard-coded "draw a card"; this is the general one.
 *
 * ⛔ THE CREED GATE: the effect program must be HIGH — a low parse would resolve to nothing while the
 * card was still discarded and the mana still spent, strictly worse for the player than not offering it.
 * ⭐ TARGETED LANE (2026-08-14): a chosen-target program is now expanded per legal target combo via
 * expandCastChoices (Steel Wrecking Ball's "destroy target artifact", Trumpeting Carnosaur's damage) —
 * the refusal that used to sit here was a documented FN until the targeting was wired. Zero legal
 * targets → no action (CR 602.2b via 601.2c — never a discarded card with a fizzled effect).
 */
/**
 * LANDS-TIER slice 5 — the live price of a from-hand discard ability under its printed reduction rider
 * ("This ability costs {1} less to activate for each legendary creature you control", the NEO channel
 * lands). Generic only, floored at zero (CR 601.2f — a reduction never touches colored pips and never goes
 * below {0}). Layer-aware creature check (an animated legendary counts, a Legendary non-creature does not);
 * the Legendary supertype is read off the printed type line. ONE function, called by BOTH the offer and the
 * payment, so the two can never price the same board differently; a `null` reduction returns the cost as is.
 */
/**
 * PER-COUNTER ACTIVATION DISCOUNT (SHELF-85 · Halfshell Q4, 2026-09-05 — Exploding Barrel "This ability costs {1} less to
 * activate for each pressure counter on this artifact."): the live price of an activated ability under its printed
 * per-counter rider. Reads the SOURCE permanent's own counter bag for exactly the named kind (a charge counter never
 * discounts a pressure rider); generic only, floored at zero (CR 601.2f). Called by the offer; the action carries the
 * priced cost and the dispatcher pays exactly that, so the two can never disagree. A `null` reduction returns the cost as is.
 */
export function reduceActivatedAbilityCost(perm, cost, reduction) {
  const r = reduction?.perCounterOnSelf;
  if (!r || !(r.amount > 0) || !r.kind) return cost;
  const n = Number(perm?.counters?.[r.kind] || 0);
  const off = n * r.amount;
  return off > 0 ? { ...cost, generic: Math.max(0, (cost.generic || 0) - off) } : cost;
}

export function reduceDiscardAbilityCost(state, playerId, cost, reduction) {
  if (!reduction || !(reduction.perLegendaryCreature > 0)) return cost;
  const n = (state.players?.[playerId]?.battlefield || [])
    .filter((p) => permanentTypes(state, p.id).types.includes("Creature") && /\bLegendary\b/.test(String(p.card?.type || p.card?.type_line || ""))).length;
  const off = n * reduction.perLegendaryCreature;
  return off > 0 ? { ...cost, generic: Math.max(0, (cost.generic || 0) - off) } : cost;
}

function actionsDiscardAbilityFromHand(state, playerId) {
  if (state.activePlayer !== playerId) return [];
  if (state.priorityHolder !== playerId) return [];
  if (state.step !== "main") return [];
  const player = state.players[playerId];
  const actions = [];
  for (const card of player.hand) {
    const ab = parseDiscardCostAbility(card);
    if (!ab) continue;
    // T8 — transmute is "Activate only as a sorcery" (CR 702.53a): main phase + priority are gated above; the
    // remaining sorcery-timing condition is an EMPTY stack (CR 307.1 via 602.5d).
    if (ab.sorceryOnly && (state.stack || []).length) continue;
    const cost = reduceDiscardAbilityCost(state, playerId, parseManaCost(ab.cost), ab.reduction);
    if (cost.hasX) continue;                       // an X cost needs the X-choice expansion
    if (!canAfford(player.manaPool, manaSources(state, playerId), cost)) continue;
    // ⚠️ PARSED UNDER A LITERAL "Instant", NOT the card's own type — the SAME correction
    // matchOptionalDiscardPayment already carries. Several atoms (pump, deal-damage) are
    // type-gated to Instant/Sorcery and return LOW for a Creature, so passing the card's real
    // type refused abilities that are perfectly modeled (Harvester of Misery, Mjolnir).
    // The atoms resolve type-agnostically, so this is behaviour-identical and correct.
    const program = parseEffectClause(ab.effectText, "Instant");
    // ⚠️ THE CONFIDENCE CHECK IS REDUNDANT WITH THE ATOMS CHECK TODAY, and that was MEASURED, not assumed:
    // a mutation deleting it survived, because parseEffectClause never returns a LOW program that still
    // carries atoms — every low parse yields []. Verified across all 17 real carriers AND on synthetic
    // part-parseable text. It stays because it states the intended contract and BECOMES load-bearing the
    // moment the parser gains partial results (atoms present, confidence low). Do not read it as the gate.
    if (!program || programConfidence(program) !== "high") continue;
    if (!(program.atoms || []).length) continue;
    // TARGETED LANE (2026-08-14 — Trumpeting Carnosaur, Steel Wrecking Ball): a chosen-target program
    // expands one action per legal target combo, exactly like the cast path (expandCastChoices with the
    // card's colors for KW-PROTECTION, CR 702.16b). ZERO combos → no action (a target requirement with
    // no legal target is unactivatable, CR 602.2b/601.2c — never a discarded card and a fizzled effect).
    // Non-targeted abilities emit the single bare action, byte-identical to before.
    if (programNeedsChosenTarget(program)) {
      for (const choice of expandCastChoices(state, playerId, program, colorsOf(card))) {
        actions.push({ kind: "discard-ability", playerId, cardId: card.id, name: card.name, cost, cmc: totalCmc(cost), targets: choice.targets || [] });
      }
      continue;
    }
    actions.push({ kind: "discard-ability", playerId, cardId: card.id, name: card.name, cost, cmc: totalCmc(cost) });
  }
  return actions;
}

/**
 * PLOT (CR 702.171) — `plotPlayable` is the runtime CREED gate: a card may use the plot special action
 * (and later be cast free from exile) ONLY when (a) it has a clean modeled plot cost (parsePlotCost) AND
 * (b) its NON-plot text is fully native — classifyCard strips the plot line internally, so a native tier
 * means every remaining clause is modeled. Lands can't be plotted (CR 702.171a — nonland only); classifyCard
 * returns the native "land" tier for them, so they're excluded explicitly. A partially-modeled plot card
 * (intervening-if ETB, unmodeled spell, plot-granting body) fails this gate → never offered plot, never
 * silently dropping its unmodeled text — it routes to the Arbiter as a normal hand card (whole-card CREED).
 */
function plotPlayable(card) {
  if (!card) return false;
  if (isLand(card)) return false;
  if (!parsePlotCost(card)) return false;
  return isNativeTier(classifyCard(card));
}

/**
 * PLOT step 1 — the plot SPECIAL ACTION (CR 702.171a): any time you could cast a sorcery you may pay the
 * plot cost and exile the card face-up from your hand. Offer one `plot` action per plotPlayable hand card
 * whose plot cost the player can afford. Sorcery-speed + own-main + empty-stack + priority (canCastSorcerySpeed,
 * matching "Plot only as a sorcery"). An X plot cost would need the X-choice expansion (none in the corpus) →
 * skipped (safe under-offer). The dispatcher (applyPlot) pays the cost and moves hand → exile, stamping the
 * plotted card with the turn it was plotted so it can't be cast the SAME turn (CR 702.171b).
 */
function actionsPlotFromHand(state, playerId) {
  if (!canCastSorcerySpeed(state, playerId)) return [];
  const player = state.players[playerId];
  const actions = [];
  for (const card of player.hand) {
    if (!plotPlayable(card)) continue;
    let cost = parseManaCost(parsePlotCost(card));
    if (cost.hasX) continue; // an X plot cost would need the X-choice expansion (none in the corpus)
    // PLOT-COST REDUCER (K9 — Doc Aurlock "Plotting cards from your hand costs {2} less"): generic only, floored at 0, read
    // off the controller's own board; the dispatcher pays the action's carried cost, so the reduction is honoured there too.
    const plotReduction = collectCostReducers(player.battlefield || []).filter((r) => r.plot).reduce((sum, r) => sum + (r.amount || 0), 0);
    if (plotReduction) cost = { ...cost, generic: Math.max(0, (cost.generic || 0) - plotReduction) };
    if (!canAfford(player.manaPool, manaSources(state, playerId), cost)) continue;
    actions.push({ kind: "plot", playerId, cardId: card.id, name: card.name, cost, cmc: totalCmc(cost) });
  }
  return actions;
}

/**
 * PLOT step 2 — cast a PLOTTED card from exile for FREE (CR 702.171b): on a turn AFTER the one it was
 * plotted, you may cast it as a sorcery without paying its mana cost. Reuses the shared cast builder with
 * fromZone "exile" + freeCast=true (the EXACT machinery DISCOVER uses to free-cast from exile — same
 * target/mode/additional-cost enumeration, same applyCastSpell resolution), so a plotted creature enters
 * via PERMANENT_ETB and a plotted spell resolves through the effect-program interpreter, identically to a
 * hand-cast. GATES (CREED): only a card stamped `_plotted` whose `_plottedTurn !== state.turn` (NOT this
 * turn — CR 702.171b), and ONLY at sorcery speed (freeCast bypasses the builder's timing gate, so it's
 * enforced here — "cast it as a sorcery"). Once per turn per card is enforced naturally: the card leaves
 * exile onto the stack when cast, so it can't be cast again.
 */
function actionsCastPlottedFromExile(state, playerId) {
  if (!canCastSorcerySpeed(state, playerId)) return [];
  const player = state.players[playerId];
  const plotted = (player.exile || []).filter(c => c && c._plotted && c._plottedTurn !== state.turn);
  if (plotted.length === 0) return [];
  return castActionsFromZone(state, playerId, plotted, "exile", null, true);
}

/**
 * KW-SUSPEND step 1 (CR 702.62a) — the SUSPEND special action for the NO-mana-cost trio (Lotus
 * Bloom / Sol Talisman / Mox Tantalite): pay the suspend cost, exile the card from hand with N
 * time counters (fading.parseSuspendNoCost is the ONE gate the dispatcher, the upkeep tick and the
 * coverage classifier all read — metric⇄runtime). Sorcery-window offer ("any time you could cast
 * this card" — the scoped carriers are artifacts). The dispatcher stamps `_suspendCounters`.
 */
function actionsSuspendFromHand(state, playerId) {
  if (!canCastSorcerySpeed(state, playerId)) return [];
  const player = state.players[playerId];
  const actions = [];
  for (const card of player.hand) {
    const sus = parseSuspendNoCost(card);
    if (!sus) continue;
    const cost = parseManaCost(sus.costPips);
    if (cost.hasX) continue; // an X suspend cost (Jhoira-class) is out of the scoped shape
    if (!canAfford(player.manaPool, manaSources(state, playerId), cost)) continue;
    actions.push({ kind: "suspend", playerId, cardId: card.id, name: card.name, cost, cmc: totalCmc(cost), suspendCounters: sus.n });
  }
  return actions;
}

/**
 * KW-SUSPEND step 2 (CR 702.62e) — a suspended card whose last time counter was removed
 * (`_suspendReady`, stamped by fading.applySuspendUpkeep) is castable FREE from exile through the
 * real cast machinery, so cast triggers/watchers fire exactly as a hand cast's would. The CR makes
 * this cast mandatory; the engine OFFERS it (documented simplification in suspendNoCost.test.js —
 * an offer can never fire wrongly).
 */
function actionsCastSuspendReadyFromExile(state, playerId) {
  const player = state.players[playerId];
  const ready = (player.exile || []).filter(c => c && c._suspendReady);
  if (ready.length === 0) return [];
  return castActionsFromZone(state, playerId, ready, "exile", null, true);
}

/**
 * IMPULSE-EXILE step 2 — PLAY a card impulse-exiled THIS TURN, at FULL COST (CR 118.10 permission — "you may
 * play that card this turn"). The `impulse-exile` atom stamped `_impulse: true` + `_impulseTurn` when it exiled
 * the top card; here we offer to play it FROM EXILE this turn only (the turn stamp gates it, exactly like PLOT's
 * `_plottedTurn`, and gameEngine's cleanup clears the flags at end of turn). "Play" = cast a NONLAND normally
 * (the shared castActionsFromZone builder with fromZone "exile", freeCast=FALSE — the cost is paid in full,
 * respecting the card's own instant/sorcery timing), OR play a LAND from exile (a play-land action consuming a
 * land drop). A NONLAND is enumerated through the exact cast machinery a hand-cast uses (cost / X / modal /
 * targets / additional costs), so target selection / the stack / cast triggers / AI all behave identically; the
 * card leaves exile onto the stack when cast, so it can't be played twice. A LAND rides the play-land path
 * (sorcery-speed, own main, land-drop budget) — the same gates as a hand land — with fromZone "exile" so the
 * dispatcher splices it from the right zone. GATE: `_impulse && _impulseTurn === state.turn` (this turn only —
 * CR; a stale flag from a prior turn is already cleared at cleanup, so this is belt-and-suspenders). Once-per-
 * card is enforced naturally (the card leaves exile when played).
 */
/**
 * GY SELF-RECURSION (BLITZ GY-1, CR 602.2 — Reassembling Skeleton / Sanitarium Skeleton class): offer the
 * graveyard-activated "Return this card from your graveyard …" ability on every own-graveyard card carrying
 * the modeled line (parseGraveyardSelfRecursion — the SAME parse the dispatcher and the coverage classifier
 * key on). Mana-only cost, affordability-gated like any activated ability; instant-speed (an activated
 * ability may be activated whenever the player has priority — no timing rider is in the modeled shape).
 */
function actionsActivateGraveyardRecursion(state, playerId) {
  const player = state.players[playerId];
  const out = [];
  for (const card of player.graveyard || []) {
    if (!card || card.token) continue;
    const rec = parseGraveyardSelfRecursion(card);
    if (!rec) continue;
    const cost = parseManaCost(rec.manaPips);
    if (!canAfford(player.manaPool, manaSources(state, playerId), cost)) continue;
    // GR-1 — the ", Discard N cards" cost rider (Stitchwing Skaab kin): payable only with N cards in
    // hand (CR 601.2h — an unpayable cost is never offered). WHICH cards: the first N by hand order,
    // auto-picked at enumeration and carried on the action — the sacCount slice discipline (the
    // incumbent multi-victim cost pattern; DC-1's per-victim offers stay the single-discard
    // precedent for battlefield activations). The ids ride the action so the dispatcher pays exactly
    // these and the UI can show them.
    let discardIds = null;
    if (rec.discardCards > 0) {
      if ((player.hand || []).length < rec.discardCards) continue;
      discardIds = player.hand.slice(0, rec.discardCards).map((c) => c.id);
    }
    // GR-2 — the EXILE-FROM-GRAVEYARD cost rider. The victim comes from the SAME graveyard the card is
    // sitting in, so the card itself is excluded (paying with it would exile the object being returned).
    // No legal victim → the cost is unpayable and the ability is never offered (CR 601.2h), which is the
    // gate that stops this becoming a free recursion.
    let exileGyIds = null;
    if (rec.exileFromGy) {
      const victims = (player.graveyard || [])
        .filter((g) => g.id !== card.id && !g.token && cardMatchesAddCostType(g, rec.exileFromGy.cardType));
      if (victims.length < rec.exileFromGy.count) continue;
      exileGyIds = victims.slice(0, rec.exileFromGy.count).map((g) => g.id);
    }
    const base = {
      kind: "activate-gy-recursion", playerId, cardId: card.id, name: card.name,
      cost, cmc: totalCmc(cost), dest: rec.dest, entersTapped: rec.entersTapped,
      ...(discardIds ? { discardIds } : {}),
      ...(exileGyIds ? { exileGyIds } : {}),
      abilityText: rec.raw,
    };
    // TAP-AN-UNTAPPED cost (Otharri / Purple Pentapus, 2026-09-05): one action per eligible UNTAPPED permanent you
    // control — "creature" reads layer-aware (an animated land counts, a summoning-sick creature counts: CR 302.6
    // restricts only the creature's OWN {T} abilities), a subtype word is a word-bounded type-line match. No
    // candidate → the ability is not offered (the cost can't be paid).
    if (rec.tapUntapped) {
      const sub = rec.tapUntapped.subtype;
      const subRe = sub ? new RegExp(`\\b${String(sub).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i") : null;
      const pool = (player.battlefield || []).filter((p) => !p.tapped && (subRe ? subRe.test(String(p.card?.type || "")) : permanentIsCreature(state, p.id)));
      for (const p of pool) out.push({ ...base, tapIds: [p.id], tapName: p.card?.name });
      continue;
    }
    out.push(base);
  }
  return out;
}

/**
 * GY EXILE-COST ABILITY (BLITZ GY-2, CR 602.2 — Seasoned Pyromancer / the Soul cycle): offer
 * "<mana>, Exile this card from your graveyard: <effect>" on every own-graveyard card carrying the
 * modeled line (parseGraveyardExileAbility — the SAME parse the dispatcher and the coverage
 * classifier key on). Mana-only + the exile-self cost; a sorceryOnly rider gates on the same
 * sorcery-speed window a sorcery cast uses.
 */
function actionsActivateGraveyardExile(state, playerId) {
  const player = state.players[playerId];
  const out = [];
  for (const card of player.graveyard || []) {
    if (!card || card.token) continue;
    const rec = parseGraveyardExileAbility(card);
    if (!rec) continue;
    if (rec.sorceryOnly && !canCastSorcerySpeed(state, playerId)) continue;
    // KW-ENGINES (CR 702.179d) — a "Max speed —" graveyard ability is live only at speed 4.
    if (rec.maxSpeed && (player.speed || 0) < 4) continue;
    const cost = parseManaCost(rec.manaPips);
    if (!canAfford(player.manaPool, manaSources(state, playerId), cost)) continue;
    // GY-3 (④-T): a targeted program expands through the SAME helper the battlefield activated lane uses; the
    // card's own id rides as sourceId so an "another target … card from your graveyard" restriction (notSource)
    // never offers the card that is being exiled as its own cost. No legal target → not offered (CR 601.2c).
    const choices = rec.targeted ? expandCastChoices(state, playerId, rec.program, colorsOf(card), { sourceId: card.id }) : [{ targets: [] }];
    if (choices.length === 0) continue;
    for (const ch of choices) {
      // The card is exiled as the COST before the ability resolves, so a combo that targets the card ITSELF
      // ("exile target card from a graveyard" aimed at the Strider) fizzles to nothing (CR 608.2b) — legal,
      // pointless, dropped: the same self-defeating-combo guard the sacrifice-victim lane applies.
      if ((ch.targets || []).some((t) => t.id === card.id)) continue;
      out.push({
        kind: "activate-gy-exile", playerId, cardId: card.id, name: card.name,
        cost, cmc: totalCmc(cost), program: rec.program,
        abilityText: rec.raw,
        targets: ch.targets || [],
        chosenMode: ch.chosenMode ?? null,
        needsTargets: (ch.targets || []).length > 0,
        ...(ch.targets?.length === 1 && ch.targets[0]?.name ? { targetName: ch.targets[0].name } : {}),
      });
    }
  }
  return out;
}

function actionsPlayImpulseFromExile(state, playerId) {
  const player = state.players[playerId];
  // EXTENDED WINDOW (CR 118.10 — "until the end of your NEXT turn"): an extended stamp stays playable until
  // gameEngine's cleanup REMOVES it, so its presence IS the permission. A plain stamp keeps the strict
  // this-turn equality. The two conditions are deliberately different: the extended window spans turns the
  // turn counter cannot express, so its lifetime is owned by the cleanup rule, not re-derived here — if both
  // sites tried to compute it, they would drift.
  const impulsed = (player.exile || []).filter(c => c && c._impulse && (c._impulseExtended || c._impulseTurn === state.turn));
  if (impulsed.length === 0) return [];
  const nonlands = impulsed.filter(c => !isLand(c));
  const lands = impulsed.filter(c => isLand(c));
  const actions = [];
  // NONLANDS — cast at full cost from exile (freeCast=false), same builder as a hand cast (timing/cost/X/targets).
  actions.push(...castActionsFromZone(state, playerId, nonlands, "exile", null, false));
  // LANDS — play from exile if a land drop is available at sorcery speed (the same gates the hand play-land uses).
  if (lands.length && canCastSorcerySpeed(state, playerId)
      && player.landsPlayedThisTurn < landDropAllowance(state, playerId)) {
    for (const card of lands) {
      actions.push({ kind: "play-land", playerId, cardId: card.id, name: card.name, fromZone: "exile" });
    }
  }
  return actions;
}

/**
 * PLAY-FROM-TOP-OF-LIBRARY (Future Sight / Bolas's Citadel) — the enforcement of the { playFromTop } static
 * permission (staticAbilityParser). While the player controls such a permanent, the TOP card of their library
 * is playable/castable (CR 118.6 / 601.3e): a NONLAND is cast at FULL cost through the SAME shared builder a
 * hand cast uses (castActionsFromZone with fromZone "library" — target/mode/X/additional-cost enumeration, the
 * stack, cast triggers, AI all identical), and a LAND rides the play-land path (sorcery speed, own main, a land
 * drop available) with fromZone "library" so the dispatcher splices it from the right zone. Only the TOP card is
 * offered (library index 0), so it can't be played twice (it leaves the library onto the stack / battlefield
 * when played). Mirrors actionsPlayImpulseFromExile exactly; the permission is the enforcement that keeps the
 * credited static from being a no-op (CREED). Perfect-information sim → offering the known top card is faithful.
 */
/**
 * MILLED-THIS-TURN GRAVEYARD CAST (Raul, Trouble Shooter — SHELF S6, CR 601.3e): "Once during each of your
 * turns, you may cast a spell from among cards in your graveyard that were milled this turn." While the
 * player controls a permanent carrying the castMilledGraveyardPermission static AND it's THEIR turn AND the
 * per-source once-latch is unused, every NONLAND graveyard card stamped in the millCards ledger with the
 * CURRENT turn is castable at FULL cost through the shared builder (fromZone "graveyard" — target/mode/X/
 * additional-cost enumeration, the stack, cast triggers, AI all identical to a hand cast; applyCastSpell
 * splices from the right zone generically). The dispatcher latches `${sourceId}_milledGyCast` in
 * onceTriggersFiredThisTurn on the cast (cleared at the untap step like every once-latch), enforcing the
 * printed "once". Mirrors actionsPlayFromTopOfLibrary — the enforcement that keeps the credited static
 * from being a no-op (CREED). "Cast a spell" — lands are never castable (CR 601.2), so they're excluded.
 */
// FLASHBACK (CR 702.34a) — parse the "Flashback {cost}" MANA cost off a card's oracle: the pip run immediately
// after the keyword, terminated by a reminder paren / a period / the line end. Returns the cost STRING (e.g.
// "{2}{U}") or null. PARKS (returns null, all SAFE FNs the strip already withheld the recast for):
//   • a NON-MANA em-dash cost — "Flashback—Sacrifice three creatures" (Dread Return), "Flashback—{1}{U}, Pay 3
//     life" (Deep Analysis): `flashback[ \t]+\{` never matches an em-dash / the comma+text breaks the pip run.
//   • an X flashback cost — "Flashback {X}{R}{R}{R}" (Devil's Play): parseManaCost(cost).hasX → null.
//   • a flashback-line cost-reduction rider — "Flashback {8}{W}{W}. This spell costs {X} less…" (Visions of
//     Glory): the ". This" after the pips fails the terminator, so the whole line doesn't match.
// These 9 (of 94 native-body flashback cards) stay NATIVE on their body; only their graveyard recast is withheld.
function parseFlashbackManaCost(card, currentTurn = null) {
  // ④-G — a GRANTED flashback (Snapcaster's "gains flashback until end of turn … equal to its mana cost"): the grant
  // rides the graveyard card as `flashbackGrant: { cost, turn }` and counts ONLY on the turn it was granted (the
  // "until end of turn" without a cleanup pass). A printed flashback line still wins where both exist.
  const g = card?.flashbackGrant;
  if (g && currentTurn != null && g.turn === currentTurn && /^(?:\{[^}]+\}\s*)+$/.test(String(g.cost || "")) && !parseManaCost(g.cost).hasX) {
    const printed = String(card?.oracle || card?.oracle_text || "").match(/(?:^|\n)[ \t]*flashback[ \t]+((?:\{[^}]+\}[ \t]*)+?)[ \t]*(?:\(|\.?[ \t]*(?:\n|$))/i);
    if (!printed) return String(g.cost).trim();
  }
  const oracle = card?.oracle || card?.oracle_text || "";
  const m = oracle.match(/(?:^|\n)[ \t]*flashback[ \t]+((?:\{[^}]+\}[ \t]*)+?)[ \t]*(?:\(|\.?[ \t]*(?:\n|$))/i);
  if (!m) return null;
  const cost = m[1].trim();
  if (!/^(?:\{[^}]+\}[ \t]*)+$/.test(cost)) return null;      // defensive: a pure pip run only
  if (parseManaCost(cost).hasX) return null;                  // X flashback parked (minimal version)
  return cost;
}

/**
 * FLASHBACK (CR 702.34a) — cast an instant/sorcery from YOUR GRAVEYARD for its "Flashback {cost}" mana cost
 * instead of its mana cost (CR 702.34a), then EXILE it as it leaves the stack (CR 702.34a — resolution, fizzle,
 * or counter). This is the runtime PLAY-QUALITY half of the flashback strip: coverage already credits a
 * flashback card native on its BODY (parser.stripCastKeywordLines drops the flashback line so the from-hand body
 * flips native, the graveyard recast a documented SAFE false-negative). This lane makes that recast REAL.
 *
 * LOCKSTEP: the offer is gated on the classifier's OWN native verdict (isNativeTier(classifyCard(card))) — the
 * metric's authority (mirroring the adventure / split gate) — so a flashback card is graveyard-castable IFF its
 * body is a modeled program. The runtime offer and the tier metric can never disagree; a body-only / arbiter
 * flashback card (unmodeled effect — Cabal Therapy, Conflagrate) is NEVER offered, so we never cast-then-Arbiter
 * a spell for an engine-paid flashback cost (THE CREED, no false positive).
 *
 * Infra reuse: we project the card onto a FACE view whose mana cost IS the flashback cost and run it through the
 * SHARED cast builder (fromZone "graveyard", the same path actionsCastMilledFromGraveyard uses), so affordability
 * / target / modal / additional-cost / instant-vs-sorcery timing enumerate EXACTLY like any spell. Each emitted
 * action is stamped `flashbackCast:true`; the dispatcher tags the spellToGraveyard disposition `exile:true`, which
 * finishSpellResolution (resolution + fizzle + resume) and counterSpellById (counter) honor — so the card lands in
 * EXILE at every leave-stack site (never the graveyard → never re-offered → the recast is truly once).
 */
function actionsCastFlashbackFromGraveyard(state, playerId) {
  const player = state.players[playerId];
  const gy = player?.graveyard || [];
  if (!gy.length) return [];
  const actions = [];
  for (const card of gy) {
    if (isLand(card)) continue;
    const fbCost = parseFlashbackManaCost(card, state.turn); // + ④-G: a same-turn granted flashback
    if (!fbCost) continue;                                    // no plain-mana flashback cost → not offered (SAFE FN)
    if (!isNativeTier(classifyCard(card))) continue;         // THE CREED / lockstep: modeled body only
    // Project the flashback cost as the payable cost; body/type/oracle are unchanged (the builder's
    // parseCastProgram strips the flashback line to parse the body, and manaCostOf reads the overridden cost —
    // set BOTH `mana` and `mana_cost` since manaCostOf prefers `mana`). The mana VALUE stays the PRINTED cost
    // (CR 202.3b — an alternative cost doesn't change mana value), so it's restamped after the builder runs.
    const face = { ...card, mana: fbCost, mana_cost: fbCost };
    const printedMv = totalCmc(parseManaCost(manaCostOf(card)));
    for (const a of castActionsFromZone(state, playerId, [face], "graveyard", null, false)) {
      actions.push({ ...a, flashbackCast: true, faceCard: face, cmc: printedMv });
    }
  }
  return actions;
}

function actionsCastMilledFromGraveyard(state, playerId) {
  const player = state.players[playerId];
  if (state.activePlayer !== playerId) return []; // "during each of YOUR turns"
  const source = (player.battlefield || []).find((p) =>
    parseStaticAbilities(p.card).some((d) => d.castMilledGraveyardPermission)
    && !state.onceTriggersFiredThisTurn?.[`${p.id}_milledGyCast`]);
  if (!source) return [];
  const eligible = (player.graveyard || []).filter((c) => c && !isLand(c) && state.milledThisTurn?.[c.id] === state.turn);
  if (!eligible.length) return [];
  return castActionsFromZone(state, playerId, eligible, "graveyard", null, false)
    .map((a) => ({ ...a, milledGyCastSourceId: source.id }));
}

/**
 * DRAGON-CREATURE GRAVEYARD CAST (Rivaz of the Claw — Dragons shelf, CR 601.3e): "Once during each of
 * your turns, you may cast a Dragon creature spell from your graveyard." The Raul machine's type-filtered
 * sibling: same once-per-your-turn latch (`${sourceId}_dragonGyCast`, latched by the dispatcher on the
 * cast, cleared at untap), same SHARED cast builder (fromZone "graveyard" — full cost, targets, timing,
 * cast triggers all identical to a hand cast). The eligibility gate is the CONJUNCTIVE type-line test
 * (Dragon AND Creature, word-bounded — "creature" alone must never qualify) — the enforcement that keeps
 * the credited static from being a no-op (CREED). Rivaz's own exile rider is a separate TRIGGER
 * (checkCastTriggers' castFromZoneOnly descriptor) and fires off this cast like any other.
 */
function actionsCastDragonCreatureFromGraveyard(state, playerId) {
  const player = state.players[playerId];
  if (state.activePlayer !== playerId) return []; // "during each of YOUR turns"
  const source = (player.battlefield || []).find((p) =>
    parseStaticAbilities(p.card).some((d) => d.castDragonCreatureGraveyardPermission)
    && !state.onceTriggersFiredThisTurn?.[`${p.id}_dragonGyCast`]);
  if (!source) return [];
  const eligible = (player.graveyard || []).filter((c) => {
    const t = String(c?.type || c?.type_line || "");
    return /\bDragon\b/.test(t) && /\bCreature\b/.test(t);
  });
  if (!eligible.length) return [];
  return castActionsFromZone(state, playerId, eligible, "graveyard", null, false)
    .map((a) => ({ ...a, dragonGyCastSourceId: source.id }));
}

function actionsPlayFromTopOfLibrary(state, playerId) {
  const perm = playFromTopPermission(state, playerId);
  if (!perm) return [];
  const player = state.players[playerId];
  const top = (player.library || [])[0];
  if (!top) return [];
  const actions = [];
  if (!isLand(top)) {
    // NONLAND — cast the top card at full cost (freeCast=false), same builder / timing as a hand cast.
    // GATED ON THE SPELL HALF: a LANDS-ONLY permission (Oracle of Mul Daya, Courser of Kruphix) grants no
    // right to cast anything. Ungated, those two would cast spells off the library top — a much bigger card
    // than the printed one, on two top-2500 staples.
    // TYPE-FILTERED permissions (Eladamri "creature spells", Mystic Forge "artifact spells") gate on the top
    // card's type line here. This check is the ENFORCEMENT half of the credited static — without it a
    // filtered permission would offer ANY top card, which is a bigger card than the one printed and exactly
    // the false positive the lands-only gate below already exists to prevent.
    if (!castFromTopFilterAllows(perm.spellFilter, top)) return actions;
    actions.push(...castActionsFromZone(state, playerId, [top], "library", null, false));
  } else if (perm.lands && canCastSorcerySpeed(state, playerId) && player.landsPlayedThisTurn < landDropAllowance(state, playerId)) {
    // LAND — play from the library top if the permission grants lands and a land drop is available.
    actions.push({ kind: "play-land", playerId, cardId: top.id, name: top.name, fromZone: "library" });
  }
  return actions;
}

/**
 * PLAY-LANDS-FROM-GRAVEYARD (CR 118.6, census slice 44) — the runtime half of the Crucible of Worlds
 * permission. Offers every LAND in the player's graveyard as a real play-land action from that zone.
 *
 * The permission changes the ZONE and nothing else, so this deliberately reuses the same two gates
 * actionsPlayLand applies: sorcery timing, and an unspent land drop. Crucible does not grant an extra land
 * drop, and a version of this that forgot either gate would hand the player free lands every turn.
 */
function actionsPlayLandFromGraveyard(state, playerId) {
  if (!playLandFromGraveyardPermission(state, playerId)) return [];
  if (!canCastSorcerySpeed(state, playerId)) return [];
  const player = state.players[playerId];
  if (player.landsPlayedThisTurn >= landDropAllowance(state, playerId)) return [];
  return (player.graveyard || [])
    .filter((card) => isLand(card))
    .map((card) => ({ kind: "play-land", playerId, cardId: card.id, name: card.name, fromZone: "graveyard" }));
}

/**
 * ADVENTURE step 1 — cast the ADVENTURE (instant/sorcery) HALF from hand (CR 715.3). Offered ONLY for an
 * Adventure card whose BOTH halves are modeled (classifyCard returns a native tier — the metric's own
 * authority, so the runtime and coverage can't disagree; a card with an unmodeled half is body-only and is
 * NEVER offered, so we never silently drop the unmodeled half — THE CREED). We project the card onto its
 * ADVENTURE face (adventureFaceCard — same id, the adventure half's type/oracle/mana) and run it through the
 * shared cast builder, so the adventure spell's cost / X / modal / targets / additional costs are enumerated
 * EXACTLY like any instant/sorcery (instant-vs-sorcery timing comes from the projected type line). Each emitted
 * cast-spell action is stamped `adventureCast: true` + carries the projected `faceCard`, so the dispatcher
 * (applyCastSpell) resolves the adventure spell's effect and then EXILES the card with `_onAdventure` (CR
 * 715.3d) — instead of the card just vanishing as a normal instant/sorcery does.
 */
function actionsCastAdventureFromHand(state, playerId) {
  const player = state.players[playerId];
  const actions = [];
  for (const card of player.hand) {
    if (!isAdventureCard(card)) continue;
    if (!isNativeTier(classifyCard(card))) continue;            // CREED: both halves modeled, else never offer
    const face = adventureFaceCard(card);                       // project onto the adventure (instant/sorcery) half
    if (!face) continue;
    // Reuse the shared builder on the single projected face (same id) — cost/X/modal/target/timing enumeration
    // is identical to a normal instant/sorcery cast. fromZone "hand", not free (the adventure cost is paid).
    for (const a of castActionsFromZone(state, playerId, [face], "hand", null)) {
      actions.push({ ...a, adventureCast: true, faceCard: face });
    }
  }
  return actions;
}

/**
 * ADVENTURE step 1b — cast the CREATURE half directly from HAND. CR 715.2b: everywhere except the stack, an
 * adventurer card has only its creature characteristics — a normal cast from hand casts the CREATURE at the
 * creature half's own cost and timing. Before this generator existed the combined card rode the generic hand
 * enumerator (summed cost, instant timing when the ADVENTURE half is an Instant) — castActionsFromZone now
 * skips combined adventure cards, and this projects the creature face exactly like the exile generator below.
 * NOT tier-gated (unlike the adventure-half generator): entering as the printed creature body is the same
 * posture as every body-only creature in the trunk — the projected face enters via `faceCard`, so even a card
 * with an unmodeled ADVENTURE half is castable as its creature (strictly more faithful than the old combined
 * cast). The adventure HALF stays gated on both halves being modeled (THE CREED — its effect must resolve).
 */
function actionsCastCreatureFromHand(state, playerId) {
  const player = state.players[playerId];
  const actions = [];
  for (const card of player.hand) {
    if (!isAdventureCard(card)) continue;
    const face = creatureFaceCard(card);                        // project onto the creature half
    if (!face) continue;
    for (const a of castActionsFromZone(state, playerId, [face], "hand", null)) {
      actions.push({ ...a, faceCard: face });
    }
  }
  return actions;
}

/**
 * SPLIT CARDS (CR 709.4) — cast EITHER half from hand. Offered ONLY for a plain split card whose BOTH halves
 * are modeled (classifyCard returns a native tier — the metric's own authority, so runtime and coverage can't
 * disagree; a split with an unmodeled half is arbiter-spell and is NEVER offered here, so we never silently
 * drop the unmodeled half — THE CREED). Each half is projected onto its own face-view (same id, that half's
 * name/type/oracle/mana) and run through the shared cast builder, so cost / X / modal / targets / additional
 * costs / instant-vs-sorcery timing are enumerated EXACTLY like any instant/sorcery. Each emitted action
 * carries the projected `faceCard` (the dispatcher resolves that half's program) but NOT `adventureCast`, so
 * the resolved half's card goes to the GRAVEYARD like a normal spell (CR 709.4 — no exile dance). The real
 * combined card is spliced out of hand by id, so it can't be double-cast.
 */
/**
 * MODAL DFC — cast the SPELL FRONT from hand (V1 slice 2, 2026-09-04; CR 712.8). Offered ONLY when the combined card
 * classifies native (classifyCard's modal-DFC intercept: an instant/sorcery front that is native-spell on its own
 * projected view AND a fully covered land back — the metric's own authority, so runtime and coverage cannot disagree).
 * The front is projected onto its own face-view (same id; that face's name/type/oracle/mana) and run through the shared
 * cast builder, so cost / X / modal / targets / timing are enumerated exactly like any instant/sorcery; each action
 * carries `faceCard`, which the dispatcher already honours (the split/adventure path: the program and the cost are the
 * face's). The resolved spell goes to the graveyard like any instant/sorcery (the split-card precedent: the graveyard
 * object is the face view under the real id). Permanent fronts (creature // land) are slice 3 — a face-entered
 * permanent needs the printedCard restore the land drop already carries.
 */
function actionsCastModalDfcFrontFromHand(state, playerId) {
  const player = state.players[playerId];
  const actions = [];
  for (const card of player.hand) {
    if (!isModalDfc(card)) continue;
    if (!isNativeTier(classifyCard(card))) continue;            // CREED: both faces honest, else never offer
    const faces = mdfcFaceCards(card);
    if (!faces) continue;
    const front = faces[0];
    // ⛔ No "skip a Land front" guard here, deliberately: it was written, mutation-tested and found unobservable — the
    // shared cast builder never emits a cast for a face whose type line is a Land (a Pathway's front yields nothing),
    // so the guard was dead logic. Deleted rather than kept; if it ever returns it needs a test that can see it.
    // slice 2: instant/sorcery fronts · slice 3 (2026-09-04): PERMANENT fronts too (creature / enchantment / artifact) —
    // the dispatcher threads the real card as `printedCard` onto the entering permanent, so leaving the battlefield
    // restores the whole card exactly as the land drop's face does.
    for (const a of castActionsFromZone(state, playerId, [front], "hand", null)) {
      actions.push({ ...a, faceCard: front });
    }
  }
  return actions;
}

function actionsCastSplitFromHand(state, playerId) {
  const player = state.players[playerId];
  const actions = [];
  for (const card of player.hand) {
    if (!isSplitCard(card)) continue;
    if (!isNativeTier(classifyCard(card))) continue;            // CREED: both halves modeled, else never offer
    const faces = splitFaceCards(card);                         // [left, right] projected face-views (same id)
    if (!faces) continue;
    for (const face of faces) {
      // AFTERMATH (CR 702.127a, census slice 55) — the second half is castable ONLY from the graveyard, so
      // it is never offered from HAND. This is the load-bearing half of unparking aftermath: without it the
      // engine would make an illegal cast, which is worse than leaving the card on the Arbiter. The
      // graveyard cast itself is simply not offered (the flashback bargain — a safe under-offer).
      if (face.graveyardOnly) continue;
      for (const a of castActionsFromZone(state, playerId, [face], "hand", null)) {
        actions.push({ ...a, faceCard: face });
      }
    }
  }
  return actions;
}

/**
 * ADVENTURE step 2 — cast the CREATURE HALF from adventure-exile (CR 715.3e). After the adventure spell
 * resolved, the card sits in exile flagged `_onAdventure`; while it's there the owner may cast the creature
 * half at its OWN mana cost (NOT free — unlike plot/discover). We project the card onto its CREATURE face
 * (creatureFaceCard — same id, the creature half's type/oracle/mana/P-T) and run it through the shared cast
 * builder with fromZone "exile" (sorcery-speed, since a creature is sorcery-speed — enforced by the builder's
 * timing gate via the projected creature type line). Each action carries the projected `faceCard` so
 * applyCastSpell enters the CREATURE (via PERMANENT_ETB), not the combined card. Once cast it leaves exile, so
 * it can't be double-cast. The exiled card stays castable across turns (CR 715.3e — no turn restriction).
 */
function actionsCastCreatureFromAdventureExile(state, playerId) {
  const player = state.players[playerId];
  const onAdventure = (player.exile || []).filter(c => c && c._onAdventure);
  if (onAdventure.length === 0) return [];
  const actions = [];
  for (const card of onAdventure) {
    const face = creatureFaceCard(card);                        // project onto the creature half
    if (!face) continue;
    for (const a of castActionsFromZone(state, playerId, [face], "exile", null)) {
      actions.push({ ...a, faceCard: face });
    }
  }
  return actions;
}

/**
 * Loyalty abilities (`[+N]/[−N]/[0]: effect`, CR 606) — PW-1 framework + PW-2 HYBRID. A planeswalker's
 * controller may activate ONE loyalty ability of it per turn (CR 606.3 — "only if no player has
 * previously activated a loyalty ability of that permanent that turn"), only any time they could cast
 * a sorcery (own main, empty stack, priority — `canCastSorcerySpeed`, also CR 606.3). A `−N` cost is
 * offered only when the walker has ≥ N loyalty (CR 118.3).
 *
 * HYBRID (PW-2): offered for any PLAYABLE walker (no unmodeled static/trigger residue). EVERY loyalty
 * ability is surfaced — a MODELED effect resolves natively (one action per legal-target combo); an
 * UNMODELED effect is offered as a single Arbiter-routed action (cost paid natively at activation, the
 * effect adjudicated by the Arbiter). Surfacing all of them is required by the CREED — hiding an
 * unmodeled ability would silently drop it.
 */
function actionsActivateLoyalty(state, playerId) {
  if (!canCastSorcerySpeed(state, playerId)) return [];
  const player = state.players[playerId];
  const actions = [];
  const artLocked = artifactActivationsLocked(state); // NR-1: loyalty abilities are activated abilities (CR 606.2)
  for (const perm of player.battlefield) {
    // A live planeswalker = a permanent carrying a loyalty counter (it entered as one — so a
    // creature-front DFC is excluded). The card-level gate then confirms no unmodeled static/trigger.
    if (perm.counters?.loyalty == null) continue;
    // NR-1 — an ARTIFACT planeswalker's loyalty abilities are activated abilities of an artifact (Luxior,
    // Ignited / The Aetherspark — both arbiter-pw today, so this is a dormant-but-correct future-proof gate).
    if (lockedActivationSource(state, artLocked, perm.id)) continue;
    if (!planeswalkerPlayable(perm.card)) continue;
    if (perm.loyaltyActivatedThisTurn) continue; // CR 606.3 — at most one per turn per walker
    const loyalty = perm.counters.loyalty;
    for (const ab of parseLoyaltyAbilities(perm.card)) {
      // CR 118.3: a player can't pay a cost without the resources to pay it fully — so a −N loyalty
      // cost can't be paid by a walker with fewer than N loyalty. (+N / 0 are always payable.) The
      // cost is known even when the EFFECT isn't, so this gates Arbiter-routed abilities too.
      if (ab.costDelta < 0 && loyalty + ab.costDelta < 0) continue;
      const costLabel = `${ab.costDelta >= 0 ? "+" : ""}${ab.costDelta}`;
      if (ab.modeled) {
        // Thread the walker's id so an "another target …" restriction (notSource) excludes the walker itself
        // (CR 109.5). A no-op for every non-"another" loyalty ability (they ignore sourceId).
        const choices = expandCastChoices(state, playerId, ab.program, [], { sourceId: perm.id });
        if (choices.length === 0) continue; // a required target has no legal pick → can't activate THIS ability
        for (const ch of choices) {
          actions.push({
            kind: "activate-loyalty",
            playerId,
            permanentId: perm.id,
            name: perm.card.name,
            abilityIndex: ab.index,
            costDelta: ab.costDelta,
            program: ab.program,
            targets: ch.targets,
            chosenMode: ch.chosenMode ?? null,
            needsTargets: ch.targets.length > 0,
            targetName: ch.targets.map((t) => t.name).filter(Boolean).join(", ") || undefined,
            abilityText: `${costLabel}: ${ab.effectClause}`,
          });
        }
      } else {
        // Unmodeled effect → one Arbiter-routed action (no native targets; the Arbiter adjudicates).
        actions.push({
          kind: "activate-loyalty",
          playerId,
          permanentId: perm.id,
          name: perm.card.name,
          abilityIndex: ab.index,
          costDelta: ab.costDelta,
          program: null,
          routeToArbiter: true,
          targets: [],
          needsTargets: false,
          abilityText: `${costLabel}: ${ab.effectClause}`,
        });
      }
    }
  }
  return actions;
}

function actionsDeclareAttacker(state, playerId) {
  // Only the active player declares attackers, and only in the
  // declare-attackers step. legalChoices doesn't enforce step phase
  // hard — the caller passes the step intent. We check explicitly.
  if (state.activePlayer !== playerId) return [];
  if (state.step !== "declare-attackers") return [];

  // Creatures already attacking this combat can't be re-declared. Tapping on
  // attack already excludes most, but a Vigilance attacker stays untapped —
  // this set is what stops it (and any future no-tap attacker) from looping.
  const declared = new Set((state.combat?.attackers || []).map(a => a.permanentId));
  // COMBAT CAP (Dueling Grounds / Silent Arbiter, CR 508.1a): once the lowest "no more than N creatures can attack each
  // combat" on any battlefield is met, no further attacker is offered — sequential declaration makes the cap exact.
  const attackCap = combatCapFor(state, "attack");
  if (attackCap != null && declared.size >= attackCap) return [];
  const player = state.players[playerId];
  const attackers = player.battlefield
    // Layer-aware (WALT-ANIMATE): a permanent granted the Creature type — an animated
    // land or man-land — can be declared as an attacker, not just printed creatures.
    .filter(p => permanentIsCreature(state, p.id))
    .filter(p => !p.tapped)
    .filter(p => !declared.has(p.id))
    // Defender (CR 702.3b) can't attack — layer-aware so a granted/removed Defender counts (EVADE).
    // ⭐ THE AS-THOUGH ESCAPE (CR 609.4b) — "can attack as though it didn't have defender" (Ogre Jailbreaker,
    // Skyclave Sentinel, Bristlepack Sentry, ~50 carriers). It does NOT remove defender, and modelling it as
    // removeKeyword would be observably wrong to everything ELSE that reads defender ("each creature you
    // control WITH DEFENDER assigns combat damage equal to its toughness" — Arcades/High Alert; Wall tribal).
    // So it rides its own pseudo-keyword that is honored HERE and at opponentAI's mirror scan, and nowhere
    // else: the creature keeps defender for every other purpose and merely stops being barred from attacking.
    .filter(p => !permanentHasKeyword(state, p.id, "Defender") || permanentHasKeyword(state, p.id, "attacksIgnoringDefender"))
    // PACIFISM CLASS (BLITZ PA-1): the cantAttack pseudo-keyword (an attached "can't attack [or block]"
    // aura grant) — layer-aware, so the restriction lifts the moment the aura leaves.
    .filter(p => !permanentHasKeyword(state, p.id, "cantAttack"))
    // Granted Haste (Concordant Crossroads, sliver) counts, not just printed. The sickness read is
    // flag-OR-layer-aware (NV-1, CR 302.6): the stamped flag keeps every existing verdict (crewed
    // Vehicles re-stamp it; a stolen sick permanent carries it), and summoningSickNow adds the
    // MASS-ANIMATED land played this turn (its flag is false — lands enter unstamped).
    .filter(p => !(p.summoningSick || summoningSickNow(state, p)) || permanentHasKeyword(state, p.id, "Haste"))
    // CANT-ATTACK-ALONE (BLITZ SM-2 + CB-1, CR 508.1h — Mogg Flunkies / Raging Kronch): offered only once
    // ANOTHER attacker is already declared this combat (declaration is sequential here, so a lone can't-alone
    // creature never leads; the AI's per-tick re-offer sweeps it in on a later tick once a teammate is
    // declared). cantAttackAlone matches BOTH the bare "can't attack alone" and the combined "attack or block
    // alone" form — the block-only "can't block alone" (Craven Hulk) is NOT gated here (it may attack alone).
    .filter(p => !cantAttackAlone(p.card) || declared.size > 0)
    // SELF CAN'T-ATTACK[-OR-BLOCK], optionally LAND-GATED (CR 508.1c — Topiary Stomper "can't attack or block
    // unless you control seven or more lands"; the ungated "This creature can't attack." too). Read LIVE each
    // enumeration, so playing the seventh land frees it mid-turn. The BLOCK half of the same printed clause is
    // gated at the blocker chain below, not here — a "can't block"-only card may still attack.
    .filter(p => !selfCantAttackNow(state, p))
    // CANT-ATTACK-UNLESS-YOU (BLITZ CS-1, CR 508.1c — Desperate Castaways / War Falcon / Steelclad
    // Serpent / Warden of the Chained): "can't attack unless you control <predicate>" is a hard attack
    // RESTRICTION — the creature is not offered as an attacker while its controller's board fails the
    // predicate. Read LIVE each enumeration (layer-aware types/subtypes/power), so casting the missing
    // artifact this main phase immediately unlocks the attack.
    .filter(p => {
      const req = attackControllerRequirementOf(p.card);
      return !req || controllerMeetsBoardPredicate(state, playerId, p.id, req);
    });

  // Legal attack targets (CR 508.1a): each opponent (their face) PLUS every planeswalker they
  // control (PW-1 — a creature may attack a planeswalker instead of its controller). A face target
  // carries just `defenderId`; a planeswalker target also carries `defenderPlaneswalkerId`.
  const targets = [];
  for (const oppId of opponentsOf(state, playerId)) {
    targets.push({ defenderId: oppId });
    for (const p of (state.players[oppId]?.battlefield || [])) {
      // A battlefield permanent is an attackable planeswalker iff it ENTERED as one (it carries a
      // loyalty counter) — so a creature-front DFC entered as a creature is never offered as a PW
      // target (PW-1 review P2.1). This is the precise runtime check, not the any-face card read.
      if (p.counters?.loyalty != null) targets.push({ defenderId: oppId, defenderPlaneswalkerId: p.id, pwName: p.card?.name });
    }
  }

  // CANT-ATTACK-UNLESS-DEFENDER (BLITZ SM-1, generalized by CS-1 — CR 508.1c): a creature printed
  // "can't attack unless defending player <predicate>" (islandhome lands + Whimwader's blue permanent,
  // Lurking Green Dragon's flying creature, Godhunter Octopus' enchantment, Chained Throatseeker's
  // poisoned, Crown-Hunter Hireling's monarch) only pairs with defenders who meet the requirement —
  // the same live per-defender board read landwalk uses (4P-correct). Unrestricted creatures see the
  // full target list (identical by construction).
  // ATTACK TAX (CR 508.1g — Propaganda / Ghostly Prison / Windborn Muse): "Creatures can't attack you
  // unless their controller pays {2} for each creature they control that's attacking you." The action is
  // WITHHELD when the tax is unaffordable, and actionDispatcher.applyDeclareAttacker actually pays it on
  // declaration. Offering the attack without charging for it would make the card classify native while
  // doing nothing — the exact false positive attackTax.js exists to prevent — so this filter and that
  // payment are one change, never two.
  //
  // The SOURCE EXCLUSION is the fiddly part and it is load-bearing: CR 508.1 taps attackers (f) BEFORE
  // mana abilities are activated (h), so a non-vigilance attacker cannot be tapped for mana to pay its
  // own tax. Counting it here would offer an attack the dispatcher then can't fund. A VIGILANCE attacker
  // stays untapped and genuinely can pay with itself, so it keeps its own source.
  const taxCache = new Map();
  const taxFor = (defenderId) => {
    if (!taxCache.has(defenderId)) taxCache.set(defenderId, attackTaxDetail(state, defenderId));
    return taxCache.get(defenderId);
  };
  const canPayAttackTax = (p, defenderId) => {
    const detail = taxFor(defenderId);
    if (detail.generic <= 0 && detail.phyrexian.length === 0) return true; // the overwhelmingly common case — one board scan, then out
    const keepsSelf = permanentHasKeyword(state, p.id, "Vigilance");
    const sources = manaSources(state, playerId).filter((s) => keepsSelf || s.permanentId !== p.id);
    const pool = state.players[playerId]?.manaPool;
    if (canAfford(pool, sources, attackTaxManaCost(detail))) return true;
    // PHYREXIAN LIFE LANE (Norn's Annex, CR 107.4f + 119.4): the generic in mana, every pip in 2 life — payable only from
    // a life total at least that large. The dispatcher pays exactly this way when the all-mana plan fails.
    return detail.phyrexian.length > 0 && canAfford(pool, sources, { generic: detail.generic }) && (state.players[playerId]?.life ?? 0) >= detail.phyrexian.length * PHYREXIAN_LIFE_PER_PIP;
  };

  const allowedTargetsFor = (p) => {
    const req = attackDefenderRequirementOf(p.card);
    return targets.filter((t) =>
      canPayAttackTax(p, t.defenderId)
      && (!req || defenderMeetsAttackRequirement(state, t.defenderId, req, p)));
  };

  // Standard fast path (a lone opponent, no enemy planeswalkers → exactly one target): the
  // dispatcher auto-fills the defender, so emit one action per creature — unchanged shape.
  // An islandhome attacker whose lone defender fails the requirement gets NO attack action (SM-1).
  if (targets.length <= 1) {
    return attackers
      .filter(p => allowedTargetsFor(p).length > 0)
      .map(p => ({
        kind: "declare-attacker",
        playerId,
        permanentId: p.id,
        name: p.card.name,
      }));
  }

  // Multiple targets (Commander, OR any game with an enemy planeswalker): each attacker contributes
  // one action per legal target (CR 506.2) — the player picks who/what each creature swings at.
  // N2: attach a human-readable defenderName (the defending seat's commander, falling back to the
  // seat id) so a pod's combat menu doesn't render N byte-identical "Attack with [[X]]." lines.
  const actions = [];
  for (const p of attackers) {
    for (const t of allowedTargetsFor(p)) {
      // POD NAMING (P4 fix): the command zone is EMPTY while the commander is on the battlefield,
      // so the old command-zone-or-raw-id lookup leaked engine seat ids ("ai1") into narration and
      // board buttons for most of a pod game. Resolve across zones; when unknown, emit NO field so
      // the narrator's seatLabel fallback supplies the human name ("Opponent 1").
      const defenderSeat = state.players[t.defenderId];
      const defenderName = defenderSeat?.command?.[0]?.name
        || defenderSeat?.battlefield?.find((p) => p.card?.isCommander)?.card?.name
        || null;
      actions.push({
        kind: "declare-attacker",
        playerId,
        permanentId: p.id,
        name: p.card.name,
        defenderId: t.defenderId,
        ...(defenderName ? { defenderName } : {}),
        ...(t.defenderPlaneswalkerId ? { defenderPlaneswalkerId: t.defenderPlaneswalkerId, targetName: t.pwName } : {}),
      });
    }
  }
  return actions;
}

function actionsDeclareBlocker(state, playerId, declaredAttackers = []) {
  if (state.activePlayer === playerId) return [];  // active player attacks, doesn't block
  if (state.step !== "declare-blockers") return [];
  if (declaredAttackers.length === 0) return [];

  // MULTI-BLOCK (BLITZ CS-1, CR 509.1a): a creature may block ONE attacker by default; a printed
  // "can block an additional creature each combat" (max 2 — Selesnya Sagittars class) or "can block
  // any number of creatures" (∞ — Palace Guard class) raises its cap, and each "EACH creature you control
  // can block an additional creature" static its controller has adds one more — cumulative (maxBlocksFor;
  // High Ground / Brave the Sands, stage ③ · 32). A blocker below
  // its cap stays offerable against OTHER attackers (never the same attacker twice — the pair filter
  // in eligibleByAttacker below); at cap it is excluded exactly like the old assigned-set rule
  // (maxBlocks 1 ⇔ the previous `!assigned.has(p.id)` filter, byte-identical for normal creatures).
  const assigned = new Set((state.combat?.blockers || []).map(b => b.blockerId));
  // COMBAT CAP (Dueling Grounds / Silent Arbiter, CR 509.1a): once the lowest "no more than N creatures can block each
  // combat" on any battlefield is met (N distinct blocking creatures), no further blocker is offered.
  const blockCap = combatCapFor(state, "block");
  if (blockCap != null && assigned.size >= blockCap) return [];
  const blocksDeclaredBy = {};
  for (const b of state.combat?.blockers || []) blocksDeclaredBy[b.blockerId] = (blocksDeclaredBy[b.blockerId] || 0) + 1;
  const blockedPairs = new Set((state.combat?.blockers || []).map(b => `${b.blockerId}::${b.attackerId}`));
  // BLOCK-COUNT CAP (CR 509.1c — the menace-inverse) — count blockers ALREADY assigned per attacker this combat,
  // so a "can't be blocked by more than one creature" attacker (Hungering Hydra) is never offered a 2nd blocker
  // (blocks accumulate one declare-blocker action at a time; combat.blockers is the running tally).
  const blockersOnAttacker = {};
  for (const b of state.combat?.blockers || []) blockersOnAttacker[b.attackerId] = (blockersOnAttacker[b.attackerId] || 0) + 1;
  const player = state.players[playerId];
  const candidateBlockers = player.battlefield
    // Layer-aware (WALT-ANIMATE): an animated permanent can be declared as a blocker.
    .filter(p => permanentIsCreature(state, p.id))
    .filter(p => !p.tapped)
    .filter(p => (blocksDeclaredBy[p.id] || 0) < maxBlocksFor(state, p, playerId)) // + the team statics (High Ground — stage ③ · 32)
    // CANT-BLOCK-ALONE (BLITZ SM-2 + CB-1, CR 509.1a — Mogg Flunkies / Craven Hulk): offered as a blocker
    // only once ANOTHER blocker is already declared this combat (sequential declaration — the exact mirror of
    // the attack gate). cantBlockAlone matches BOTH the bare "can't block alone" and the combined form — the
    // attack-only "can't attack alone" (Raging Kronch) is NOT gated here (it may block alone).
    .filter(p => !cantBlockAlone(p.card) || assigned.size > 0)
    // The BLOCK half of the land-gated self restriction (Topiary Stomper). The bare "can't block" is enforced
    // downstream in canBlockAttacker (isSelfCantBlock); this gate is what adds the LAND WINDOW, read live so
    // the seventh land frees it. Both halves of one printed clause, each enforced at the declaration site
    // that owns it.
    .filter(p => !selfCantBlockNow(state, p));

  // Evasion runs through ONE chokepoint (combatEvasion.canBlockAttacker), read layer-aware so a
  // GRANTED keyword counts: flying/reach, unblockable, basic landwalk (gated by THIS defender's
  // lands), skulk/fear/intimidate/horsemanship, and the blocker-side "can't block" / "can block
  // only flyers". Menace and the printed "except by <N> or more creatures" family are SET rules
  // (≥N, CR 509.1b / 702.111b) — gated below via attackerMinBlockers + normalized at resolution.
  const eligibleByAttacker = {};
  const minBlockersByAttacker = {};
  for (const attackerId of declaredAttackers) {
    // MULTI-BLOCK: a blocker below its cap is eligible for OTHER attackers, never one it already
    // blocks (the blockedPairs filter) — so the ≥N completion count below never double-counts it.
    eligibleByAttacker[attackerId] = candidateBlockers.filter((b) => !blockedPairs.has(`${b.id}::${attackerId}`) && canBlockAttacker(state, b.id, attackerId, playerId));
    minBlockersByAttacker[attackerId] = attackerMinBlockers(state, attackerId);
  }

  // Surface one action per attacker a blocker could legally block. A menace attacker (CR 702.111b)
  // needs ≥2 blockers — and a "can't be blocked except by <N> or more creatures" attacker (BLITZ EV-3,
  // Guile / Rampaging Ceratops class) needs ≥N — so we don't offer a block on it unless a legal ≥N
  // block can still be COMPLETED: blockers ALREADY declared on it this combat (blockersOnAttacker —
  // declaration is one action per tick, and `eligible` excludes already-assigned creatures) PLUS the
  // still-eligible pool must reach N. Counting only `eligible.length` (the pre-EV-3 menace gate) wedged
  // the flow: with exactly N eligible blockers, declaring the 1st shrank the pool below N and the gate
  // then denied the 2nd..Nth declarations — a legal block the defender could never finish. Resolution
  // drops any under-sized block as the safety net. v1 doesn't enforce "must block X" effects (Lure,
  // etc.) — those stay Arbiter cases.
  const actions = [];
  for (const blocker of candidateBlockers) {
    for (const attackerId of declaredAttackers) {
      const eligible = eligibleByAttacker[attackerId];
      if (!eligible.includes(blocker)) continue;                                  // pairwise illegal
      const minBlk = minBlockersByAttacker[attackerId];
      if (minBlk > 1 && (blockersOnAttacker[attackerId] || 0) + eligible.length < minBlk) continue;  // a legal ≥N block can't be completed (menace / EV-3 set rule)
      // BLOCK-COUNT CAP (CR 509.1c) — "can't be blocked by more than one creature": once one blocker is on this
      // attacker, no further blocker may be declared (menace-inverse). PRINTED (the attacker's own card) OR
      // GRANTED (Meltstrider's Resolve, W7 — the attached blockCapOne pseudo-keyword, lifted when the aura leaves).
      if ((blockersOnAttacker[attackerId] || 0) >= 1
        && (isBlockedByAtMostOne(findPermanent(state, attackerId)?.permanent?.card) || permanentHasKeyword(state, attackerId, "blockCapOne"))) continue;
      // N2: attach the attacker's name — without it, blocking among several attackers in a pod
      // renders as N byte-identical "Block the attacker with [[X]]." lines.
      const attackerName = findPermanent(state, attackerId)?.permanent?.card?.name || null;
      actions.push({
        kind: "declare-blocker",
        playerId,
        permanentId: blocker.id,
        attackerId,
        attackerName,
        name: blocker.card.name,
      });
    }
  }
  return actions;
}

// ─── OPPONENTS-CANT-ACT (Grand Abolisher / Voice of Victory / Conqueror's Flail) ────────────────────────

/**
 * The cant-act restriction currently imposed on `playerId` by OTHER players' static abilities (CR 604.2 static-ability continuous effect /
 * CR 116 — "your opponents can't cast spells [or activate abilities of artifacts, creatures, or
 * enchantments] during your turn"). Returns `{ cantCast }`.
 *
 * A descriptor on player P's permanent (battlefield or command zone) suppresses P's OPPONENTS' casts — but
 * ONLY during P's turn (state.activePlayer === P), the "during your turn" window. So we look at the CURRENT
 * active player; if it isn't `playerId` and that active player controls a cant-act source AND `playerId` is
 * one of their opponents, `playerId`'s casts are suppressed. Attachment-gated sources (Conqueror's Flail)
 * count ONLY while the source permanent is actually attached (attachedTo set) — re-checked live, NOT at
 * parse time, so an unattached Flail imposes nothing. The controller is never restricted by their OWN
 * source (we only suppress the active player's opponents), so this never locks your own casts.
 *
 * Only cast suppression is returned: the activated-ability half (Grand Abolisher) is already enforced by
 * the engine's own-turn-only activation gating — see the call site in legalActionsForPlayer.
 */
function opponentsCantActAgainst(state, playerId) {
  const active = state.activePlayer;
  // The window is the active player's turn; only the ACTIVE opponent's source can restrict us right now.
  if (!active || active === playerId) return { cantCast: false };
  const activePlayer = state.players?.[active];
  if (!activePlayer) return { cantCast: false };
  // `playerId` must be one of the active player's opponents for the "your opponents" scope to apply.
  if (!opponentsOf(state, active).includes(playerId)) return { cantCast: false };

  // A static "your opponents can't cast …" ability functions ONLY while its source is on the battlefield
  // (CR 113.6) — NOT from the command zone. So scan only the battlefield: a creature-commander carrying this
  // clause (Dragonlord Dromoka, Kutzil, Myrel) imposes nothing while it sits in the command zone. None of the
  // cant-cast cards have command-zone-functioning wording, so the command zone is never scanned here.
  for (const perm of (activePlayer.battlefield || [])) {
    const d = cantCastDescriptorOf(perm.card);
    if (!d) continue;
    if (d.attachedGated && !perm.attachedTo) continue; // an unattached Conqueror's Flail imposes nothing
    return { cantCast: true };
  }
  return { cantCast: false };
}

// ─── SPLIT SECOND (CR 702.19a) ────────────────────────────────────────────────

/**
 * True while a spell with split second sits on the stack: "As long as this spell is on the stack, players
 * can't cast spells or activate abilities that aren't mana abilities."
 *
 * Note how this DIFFERS from the Grand Abolisher lane above, which is why it cannot reuse it: that
 * restriction is scoped to "your opponents", so the engine's own-turn-only activation gating already
 * covered its activated-ability half for free. Split second restricts EVERY player — including the one who
 * cast it, on their own turn — so the activation half has to be enforced explicitly at the call site.
 *
 * Anchored on the printed keyword line (parens stripped, exact segment match) rather than a substring
 * search of the oracle, so a card that merely mentions split second in rules text cannot impose it.
 */
function splitSecondOnStack(state) {
  return (state.stack || []).some((obj) => {
    if (obj?.kind !== "spell") return false;                    // only a SPELL with split second imposes it
    const oracle = String(obj?.source?.oracle || "").replace(/\([^)]*\)/g, " ");
    return oracle.split("\n").some((line) => line.split(",").some((seg) => seg.trim().toLowerCase() === "split second"));
  });
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Aggregate all legal actions the given player can take right now.
 * Returns an array — empty when the player has nothing legal (the
 * decisionGate auto-passes in that case).
 *
 * Options:
 *   declaredAttackers: array of permanent IDs declared as attacking
 *                      this combat (used only during declare-blockers
 *                      to enumerate blocker candidates). Caller-supplied
 *                      because the engine tracks combat assignments
 *                      separately, not in state.
 */
export function legalActionsForPlayer(state, playerId, { declaredAttackers } = {}) {
  if (!state || !state.players?.[playerId]) {
    throw new Error(`legalActionsForPlayer: invalid playerId "${playerId}"`);
  }
  // DISCOVER (LCI) — a pending discover decision short-circuits normal priority: ONLY the discovering
  // player acts, and ONLY to resolve it (it's made mid-resolution, CR — no one else gets to act). Return
  // exactly the two discover actions for the controller; an empty list for everyone else.
  if (state.pendingDiscover) {
    return state.pendingDiscover.controller === playerId ? actionsDiscoverDecision(state, playerId) : [];
  }
  // FREE-CAST (CR 601.2b) — a pending free-cast decision short-circuits normal priority IDENTICALLY to
  // discover: the casting choice is made mid-resolution (no one else acts), so return ONLY the free-cast /
  // decline actions for the controller; an empty list for everyone else. (Both pendings are FIFO — the
  // free-cast atom is the last atom of its program, so a discover and a free-cast never coexist.)
  if (state.pendingFreeCast) {
    return state.pendingFreeCast.controller === playerId ? actionsFreeCastDecision(state, playerId) : [];
  }
  // CASCADE (CR 702.85) — a pending cascade decision short-circuits normal priority IDENTICALLY to discover /
  // free-cast: the cast-it-free / decline choice is made mid-resolution (no one else acts), so return ONLY the
  // cascade actions for the controller; an empty list for everyone else. All three pendings are FIFO — each
  // parking atom is the last atom of its program — so a cascade never coexists with a discover or a free-cast.
  if (state.pendingCascade) {
    return state.pendingCascade.controller === playerId ? actionsCascadeDecision(state, playerId) : [];
  }
  // Default the declared-attackers list from live combat state, so the
  // session driver gets blocker candidates without threading it explicitly.
  // (Tests may still pass an explicit list — including [] — which wins.)
  const attackerIds = declaredAttackers ?? (state.combat?.attackers || []).map(a => a.permanentId);
  const actions = [];

  // OPPONENTS-CANT-ACT: what an active opponent's static (Grand Abolisher / Voice of Victory / a fitted
  // Conqueror's Flail) forbids THIS player from doing right now (CR 604.2). `cantCast` drops every cast
  // action (spells + command-zone casts) while it is the controller's turn.
  //
  // CREED — the activated-ability half (Grand Abolisher's "or activate abilities of artifacts, creatures,
  // or enchantments") is ALREADY fully enforced, NOT silently dropped: the engine offers activated/mana/
  // loyalty/cycling abilities ONLY on the acting player's own main phase (every such generator early-returns
  // when state.activePlayer !== playerId — see actionsTapForMana/actionsActivateAbility/actionsActivateLoyalty/
  // actionsCycleFromHand). So during the abolisher controller's turn an opponent can ONLY cast spells (and act
  // in combat) — they already cannot activate ANY ability of ANY permanent. Grand Abolisher's lock is thus a
  // strict subset of a restriction the engine already imposes; honoring it needs only the cast suppression
  // here, and both clauses of the card are respected. (`includeActivated` on the descriptor remains the
  // record of the modeled scope and gates the coverage flip.)
  // CAST-LIMIT (BLITZ RL-1, CR 604.2 — Rule of Law / Arcane Laboratory / Eidolon of Rhetoric): while ANY
  // battlefield carries the symmetric one-spell-per-turn static, a player who already cast this turn is
  // offered NO cast-family actions (spellsCastThisTurn is stamped at the cast chokepoint and reset at
  // untap). Lands / activations / special actions are untouched — casting alone is limited (CR 601).
  const castLimited = (state.players[playerId]?.spellsCastThisTurn || 0) >= 1
    && Object.values(state.players).some((pl) => (pl.battlefield || []).some((perm) => castsPerTurnLimitOf(perm.card) != null));
  // SPLIT SECOND (CR 702.19a) — suppresses casting for EVERY player while such a spell is on the stack.
  // Special actions are untouched (playing a land, plotting, the companion {3}): the rule names casting and
  // activating, and CR 116.2 special actions are neither.
  const splitSecondLock = splitSecondOnStack(state);
  const cantCast = opponentsCantActAgainst(state, playerId).cantCast || castLimited || splitSecondLock;

  // Pass priority — always available IF the player has priority.
  if (state.priorityHolder === playerId) {
    actions.push(actionPassPriority(playerId));
  }

  // Lands, spells, mana.
  actions.push(...actionsPlayLand(state, playerId)); // playing a land is NOT casting a spell — never suppressed
  // PLAY-LANDS-FROM-GRAVEYARD (CR 118.6, Crucible of Worlds) — same zone-agnostic special action, sourced
  // from the graveyard under the static permission. Also never cast-suppressed, for the same reason.
  actions.push(...actionsPlayLandFromGraveyard(state, playerId));
  if (!cantCast) {
    actions.push(...actionsCastSpell(state, playerId));
    actions.push(...actionsCastCommander(state, playerId)); // CMD-CAST: cast from the command zone (CR 903.8)
    actions.push(...actionsCastPlottedFromExile(state, playerId)); // PLOT step 2 (CR 702.171b): cast a plotted card free
    actions.push(...actionsSuspendFromHand(state, playerId)); // KW-SUSPEND step 1 (CR 702.62a): exile the no-cost trio with time counters
    actions.push(...actionsCastSuspendReadyFromExile(state, playerId)); // KW-SUSPEND step 2 (CR 702.62e): cast free at zero counters
    actions.push(...actionsPlayImpulseFromExile(state, playerId)); // IMPULSE-EXILE step 2 (CR 118.10): play an impulse-exiled card THIS TURN at full cost (nonland cast / land play from exile)
    actions.push(...actionsPlayFromTopOfLibrary(state, playerId)); // PLAY-FROM-TOP (Future Sight, CR 118.6): cast/play the top library card while the permission static is active
    actions.push(...actionsCastMilledFromGraveyard(state, playerId)); // MILLED-GY CAST (Raul): once per your turn, cast a nonland milled this turn from your graveyard
    actions.push(...actionsCastDragonCreatureFromGraveyard(state, playerId)); // DRAGON-GY CAST (Rivaz): once per your turn, cast a Dragon creature spell from your graveyard
    actions.push(...actionsCastFlashbackFromGraveyard(state, playerId)); // FLASHBACK (CR 702.34a): cast from graveyard for the flashback cost, then exile it
    actions.push(...actionsActivateGraveyardRecursion(state, playerId)); // GY-1 (CR 602.2): "Return this card from your graveyard …" activated from the graveyard
    actions.push(...actionsActivateGraveyardExile(state, playerId)); // GY-2 (CR 602.2): "<mana>, Exile this card from your graveyard: <effect>"
    actions.push(...actionsCastSplitFromHand(state, playerId)); // SPLIT CARDS (CR 709.4): cast either half from hand
    actions.push(...actionsCastModalDfcFrontFromHand(state, playerId)); // MODAL DFC (CR 712.8, V1 slice 2): cast the spell front from hand
    actions.push(...actionsCastAdventureFromHand(state, playerId)); // ADVENTURE step 1 (CR 715.3): cast the adventure (instant/sorcery) half
    actions.push(...actionsCastCreatureFromHand(state, playerId)); // ADVENTURE step 1b (CR 715.2b): cast the creature half from hand at its own cost
    actions.push(...actionsCastCreatureFromAdventureExile(state, playerId)); // ADVENTURE step 2 (CR 715.3e): cast the creature half from exile
  }
  // NONCREATURE CAST-LIMIT (SHELF-85 · Light-Paws L5 Deafening Silence, 2026-09-05 — "Each player can't cast more than one
  // noncreature spell each turn", CR 604.2): while ANY battlefield carries the static, a player who already cast a
  // noncreature spell this turn (noncreatureSpellsCastThisTurn — stamped at the cast chokepoint, reset at untap) is offered
  // no NONCREATURE cast; creature spells stay offered. Every cast lane emits kind "cast-spell" (the dispatcher's single cast
  // handler), so ONE post-filter covers hand / command / graveyard / exile / adventure / split casts alike. The spell's type
  // is the FACE being cast when the action carries one (an adventure's sorcery half is noncreature even though the card's
  // front face is a creature — CR 715.3), else the card resolved from the player's zones by id; an unresolvable card is
  // withheld (fail closed — a safe under-offer, never a second noncreature spell).
  if ((state.players[playerId]?.noncreatureSpellsCastThisTurn || 0) >= 1
    && Object.values(state.players).some((pl) => (pl.battlefield || []).some((perm) => noncreatureCastsPerTurnLimitOf(perm.card) != null))) {
    const zoneCards = Object.values(state.players[playerId] || {}).filter(Array.isArray).flat();
    const isCreatureSpell = (a) => {
      const face = a.faceCard || zoneCards.find((c) => c && c.id === a.cardId && !c.card);
      if (!face) return false;
      return /\bCreature\b/i.test(String(face.type || face.type_line || "").split(" // ")[0]);
    };
    for (let i = actions.length - 1; i >= 0; i--) {
      if (actions[i].kind === "cast-spell" && !isCreatureSpell(actions[i])) actions.splice(i, 1);
    }
  }
  // CAST-FROM-HAND-ONLY LOCK (SHELF-85 · Light-Paws L5 Drannith Magistrate, 2026-09-05 — "Your opponents can't cast spells
  // from anywhere other than their hands", CR 604.2): while any seat that counts this player as an OPPONENT holds the lock on
  // its BATTLEFIELD (CR 113.6 — a commander carrying it imposes nothing from the command zone), every cast-family action whose
  // fromZone is not "hand" is withheld: flashback and other graveyard casts, exile casts (adventure step 2, plot, suspend,
  // impulse, discover), the COMMAND-zone commander cast, the library-top cast. Land plays are not casts and stay; the lock's
  // own controller is untouched. Always on — no turn window (unlike the Grand Abolisher family above).
  if (Object.keys(state.players).some((pid) => pid !== playerId && opponentsOf(state, pid).includes(playerId) && (state.players[pid].battlefield || []).some((perm) => castFromHandOnlyLockOf(perm.card) != null))) {
    for (let i = actions.length - 1; i >= 0; i--) {
      if (actions[i].kind === "cast-spell" && actions[i].fromZone !== "hand") actions.splice(i, 1);
    }
  }
  actions.push(...actionsCompanion(state, playerId));     // CMD-COMPANION: {3} → put the companion into hand (not a cast)
  actions.push(...actionsPlotFromHand(state, playerId));  // PLOT step 1 (CR 702.171a): exile from hand for the plot cost — a SPECIAL action, not casting
  // MANA ABILITIES stay legal under split second (CR 702.19a exempts them by name).
  actions.push(...actionsTapForMana(state, playerId));
  actions.push(...actionsDoubleManaPool(state, playerId)); // DOUBLE-MANA-POOL (Doubling Cube): a no-stack mana ability that doubles the pool
  // …every OTHER activated ability does not. Crew (CR 702.121c), cycling (702.29a) and loyalty (606.1) are
  // all activated abilities, so they go dark with the rest while a split-second spell is on the stack.
  if (!splitSecondLock) {
    actions.push(...actionsActivateAbility(state, playerId));
    actions.push(...actionsCrewVehicle(state, playerId)); // CREW (VH-1, CR 702.121c): tap creatures totaling power ≥ N → the Vehicle animates until EOT
    actions.push(...actionsCycleFromHand(state, playerId)); // KW-CYCLING: discard a hand card to draw
    actions.push(...actionsDiscardAbilityFromHand(state, playerId)); // the GENERAL form: "<mana>, Discard this card: <effect>"
    actions.push(...actionsActivateLoyalty(state, playerId));
  }

  // Combat actions.
  actions.push(...actionsDeclareAttacker(state, playerId));
  actions.push(...actionsDeclareBlocker(state, playerId, attackerIds));

  return applyTargetLifeTaxes(state, playerId, actions);
}

// TARGET-LIFE-TAX post-filter (Terror of the Peaks, 2026-08-14 — "Spells your opponents cast that target
// this creature cost an additional 3 life to cast."): ONE choke over the assembled list instead of edits
// at the seven cast-push sites. A cast-spell action whose chosen targets include a taxed permanent on an
// OPPONENT'S battlefield is stamped `targetLifeTax` (the dispatcher pays it as a cost), and DROPPED
// outright when the caster's life can't cover it (CR 119.4 — a cost you can't pay makes the cast
// illegal, never a cast-then-die). Spells only — the printed tax names "Spells", so abilities pass
// untouched. The common case (no taxed permanent on the board) returns the list unchanged.
function applyTargetLifeTaxes(state, playerId, actions) {
  let taxed = null;
  for (const [pid, pl] of Object.entries(state.players || {})) {
    if (pid === playerId) continue; // the taxer's controller is not their own opponent
    for (const perm of pl?.battlefield || []) {
      for (const d of parseStaticAbilities(perm.card)) {
        if (d.targetLifeTax) { (taxed ||= new Map()).set(perm.id, (taxed.get(perm.id) || 0) + d.targetLifeTax.amount); }
      }
    }
  }
  if (!taxed) return actions;
  const life = state.players[playerId]?.life ?? 0;
  const out = [];
  for (const a of actions) {
    if (a.kind !== "cast-spell" || !a.targets?.length) { out.push(a); continue; }
    let tax = 0;
    for (const t of a.targets) if (t?.id && taxed.has(t.id)) tax += taxed.get(t.id);
    if (!tax) { out.push(a); continue; }
    if (life < tax) continue; // can't pay the added life → this cast is not offered
    out.push({ ...a, targetLifeTax: tax });
  }
  return out;
}

/**
 * Group the actions by kind for UI rendering. Returns:
 *   { "pass-priority": [...], "play-land": [...], "cast-spell": [...], ... }
 */
export function groupActionsByKind(actions) {
  const out = {};
  for (const action of actions) {
    if (!out[action.kind]) out[action.kind] = [];
    out[action.kind].push(action);
  }
  return out;
}

/**
 * Filter to a single kind — convenience for callers that only want
 * "what creatures could I attack with right now?"
 */
export function filterActions(actions, kind) {
  return actions.filter(a => a.kind === kind);
}

// ─── Internal exports (for testing) ───────────────────────────────────────────

export const _internals = {
  isLand,
  isCreature,
  isInstant,
  isSorcerySpeed,
  hasKeyword,
  typeLineOf,
  manaCostOf,
  canCastSorcerySpeed,
  canCastInstantSpeed,
  getZone,
  totalAvailableMana,
};

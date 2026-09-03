/**
 * coverage.js — how much of a deck the Academy engine plays NATIVELY.
 *
 * The metric for Phase 7's "road to 100%". A card is classified into a tier that
 * mirrors what the engine ACTUALLY does when you play it, so the headline number
 * climbs automatically as each coverage phase ships (no separate bookkeeping):
 *
 *   native tiers (the engine does the mechanically-right thing):
 *     land          — a land (the mana system taps it)
 *     native-mana   — a permanent whose tap produces mana (rocks/dorks)
 *     native-body   — a vanilla or keyword-only creature/permanent (body + layers)
 *     native-spell  — an instant/sorcery whose EffectProgram parses HIGH
 *   gap tiers (bounces to the Arbiter, or only the body works):
 *     body-only     — a permanent with abilities the engine doesn't model yet
 *     arbiter-spell — an instant/sorcery the EffectProgram can't model
 *     native-planeswalker — a planeswalker whose every loyalty ability is fully modelled (PW-1; counts native)
 *     playable-pw   — PW-2 hybrid: plays natively (loyalty/combat/modelled abilities) but ≥1 ability
 *                     routes to the Arbiter at activation (NOT counted native — partial coverage)
 *     arbiter-pw    — a planeswalker with unmodelled static/triggered residual text (whole card → Arbiter)
 *     unknown       — not found in the card index
 *
 * Pure: depends only on the EffectProgram parser (no card index, no filesystem),
 * so it runs in CI. The dev dashboard (scripts/measure-coverage.mjs) feeds it
 * enriched cards from the local index; tests feed it fixtures.
 *
 * As P2.8+ land, extend `classifyCard` to recognise the newly-modelled shapes
 * (e.g. an ETB whose clause parses HIGH → native-body), calling the SAME engine
 * parsers the runtime uses so the metric stays honest.
 */

import { parseEffectProgram, parseEffectClause, programConfidence, programNeedsChosenTarget, programTriggerTargetsResolvable } from "./effects/parser.js";
import { stripFlashPermissionLine } from "./effects/textNormalize.js"; // self-flash permission — shared with the spell path so metric and parser read ONE regex
import { stripCostOnlyKeywordLines } from "./effects/parseHelpers.js"; // CONVOKE/AFFINITY = cost-only keywords (strip before parse; runtime hard-casts at full cost — CREED-safe per Ninjutsu precedent)
import { extractAdditionalCosts } from "./effects/castModifiers.js"; // AC-PERMANENT — the metric gates on the SAME vetting the runtime charges on
import { detectTriggers, stripTriggerAbilityLabel, foldTwoTriggerDetain, parseGrantedTriggeredAbilities, compoundTriggerCount, cascadeInstanceCount, ravenousTriggerCount, undyingKeywordCount, evolveKeywordCount, renownKeywordValue, mobilizeKeywordValue, backupKeywordValue, partnerWithName, hasDethrone, hasTraining, firebendingKeywordValue, soulshiftKeywordCount, flankingKeywordCount, persistKeywordCount, battleCryKeywordCount, afterlifeKeywordValues, mentorKeywordCount, modularKeywordValues, startYourEnginesKeywordCount, scanTriggerSentences, stripTriggerSentences } from "./triggers.js"; // scan/stripTriggerSentences: THE shared quote-aware extraction (Codex fix #4) — shaped count + every residue strip must use it or shaped===detected snaps
import { parseSuspendNoCost } from "./fading.js"; // KW-SUSPEND no-cost credit — the same gate the runtime offers through (fading→triggers→… is already a loaded edge; no cycle)
import { isSagaCard, parseSagaChapters } from "./saga.js"; // SAGA (CR 714, SHELF S7) — the all-or-nothing chapter gate
import { parseActivatedAbilities, expandOutlastLines, parseAbilityCost, parseGrantedActivatedAbilities, isModeledGroupActivatedBody, parsePlotCost, parseWarpCost, parseCrewCost, foldModalBulletLines, parseGraveyardSelfRecursion, parseGraveyardExileAbility, modeledLeveler, parseDiscardCostAbility } from "./effects/abilities.js";
import { staticAbilitiesCoverCard, clauseProducesStatic, abilityClauses, isLevelGatedOracle, parseEquipmentBonus, equipmentAbilityClauses, isAuraCard, isPlayerAuraCard, isNativeAura, isNativeManaAura, isNativeManaGrantAura, parseAuraGrantedManaAbility, auraEnchantSubject, entersWithPlusCounters, entersWithMinusCounters, entersWithXCounters, convergeEntersCounters, entersWithMetricCounters, entersWithNamedCounters, entersWithConditionalCounters, entersWithChoiceCounters, isHonestEnterCounterKind, choosesColorOnEnter, entersTapped, selfCostReductionMetric, registerGroupActivatedBodyValidator, registerGroupTriggeredBodyValidator, registerLevelerCardValidator, registerAuraOwnEtbValidator, registerAuraOwnActivatedValidator, registerAuraGrantedAbilityValidator, registerAuraOwnTriggerValidator, parseAuraBonus, parseBestowCost, isEnchantmentCreature, isAttachedNoUntapLine, attachedNoUntapOf, riotKeywordCount, parseSoulbondBond, stripSoulbondText, selfNormalizeOracle } from "./staticAbilityParser.js";
import { spellConditionParseable } from "./interveningIf.js"; // EW-1 — the metric⇄runtime shared gate for a conditional enters-with counter (the resolver evaluates the SAME vocabulary via evaluateInterveningIf); acyclic (interveningIf imports only gameState)
import { isCloneCard } from "./cloneCopy.js";
import { planeswalkerNativelyCovered, planeswalkerPlayable } from "./effects/loyaltyAbilities.js";
import { castsAsPlaneswalker, isPlaneswalker, shufflesIntoLibraryInsteadOfGraveyard } from "./gameState.js";
// triggerRoutesNatively (+ the group-triggered-grant validator) extracted to triggerRouting.js — its
// transitive deps (parseEffectClause / program* / winConditionParseable / interveningIfParseable) live there.
import { triggerRoutesNatively, isModeledGroupTriggeredBody, programCombatReferentAtoms } from "./triggerRouting.js";

// ⛔⛔ A REFERENT CAN RIDE A **RESTRICTION**, NOT ONLY `atom.who` — and the spell fence below had the same
// blind spot triggerRouting's trigger gate did (found 2026-08-05, fixed there; found HERE 2026-08-06 by
// Flames of the Raze-Boar). That card is a SPELL whose second clause reads "each other creature THAT
// PLAYER controls", parsing to restrictions:[{kind:"controller",who:"damagedPlayer"}] with atom.who
// undefined. On a spell ctx.damagedPlayerId is unset, creatureSatisfiesRestrictions then fails EVERY
// creature, and the clause hits NOBODY — a card credited native while silently dropping half its printed
// text, which is the forbidden direction. Both positions are checked from one helper so they cannot drift.
const REFERENT_WHOS = new Set(["damagedPlayer", "defendingPlayer", "lifeLostPlayer", "untappedController", "gyOwner", "triggeringPermanentController"]);
function atomCarriesEventReferent(a) {
  if (REFERENT_WHOS.has(a?.who)) return true;
  return (a?.restrictions || []).some((r) => REFERENT_WHOS.has(r?.who));
}
import { registerGrantTriggeredBodyValidator, registerGrantActivatedBodyValidator } from "./effects/atoms/grantUntilEot.js"; // TG-1 — the until-EOT quoted-grant body gates
import { isNativeGroupWard } from "./groupWard.js";
import { isControlAura } from "./controlAura.js"; // the control-Aura delivery check, shared with the runtime attach/revert (controlAura imports only controlMove, a zero-import leaf, so this edge is acyclic)
import { auraEnchantRestrictions } from "./staticAbilityParser.js"; // the qualified-subject host filter, shared with legalChoices' cast lane so offer + metric read ONE source
import { isNativeKira } from "./kiraTargetCounter.js";
import { isEnforcedEvasionClause, selfDamagePrevention, selfDamagePreventionBy, counterShieldPrevention, attachedPreventPutCountersOf, selfPreventPutCounters } from "./combatEvasion.js";
import { entersTappedUnlessCondition, paysLifeOrEntersTapped, revealLandTypes } from "./landEntersTapped.js"; // LANDS-TIER — the conditional enters-tapped reader BOTH enter sites consult (metric and runtime read one function)
import { stripCreatedTokenAbilities, stripNonSelfQuotedGrants, manaProduction } from "./manaModel.js"; // manaProduction: the runtime mana-amount source — consulted for the variable-X "Add X mana … where X is …" tier so the metric credits ONLY what the engine actually produces (no over-claim)
// OMNATH — ground the classifier on the two RUNTIME registries the engine actually consults (never a
// name-only credit): staticEffectsOf reads layers.STATIC_REGISTRY (the layer-7c dynamic +1/+1-per-green
// descriptor), _registry is cardEffects.REGISTRY (the green-mana retention descriptor). Both are leaf
// modules (layers imports staticAbilityParser/keywords/protection; cardEffects imports nothing) and
// neither imports coverage.js, so these edges are acyclic.
import { staticEffectsOf } from "./layers.js";
import { _registry as cardEffectsRegistry } from "./cardEffects.js";
import { isPureDoubler, doublerProfile, stripModeledDoublerClauses, manaMultiplierProfile, stripModeledManaMultiplierClauses } from "./replacementEffects.js"; // counter/token doublers + mana multipliers → native (full-card)
import { marksDamageToCreature, ENDSTEP_COUNTER } from "./wolverine.js"; // Wave-5a: Wolverine whole-card runtime hook
import { parseDamageReplacements, stripDamageReplacementClauses } from "./damageReplacements.js"; // Wave-5a: source-scoped damage doubler parser + clause stripper
import { parseXCastTokenTrigger } from "./xCastToken.js"; // X-CAST-TOKEN commander (Zaxara) — runtime hook lives in actionDispatcher (applyXCastTokenTriggers)
import { parseUrDragonAttackTrigger } from "./urDragonAttack.js"; // UR-DRAGON commander — runtime hook lives in gameEngine (applyUrDragonAttackTriggers)
import { parseVihaanCombatAnimate } from "./vihaanAnimate.js"; // VIHAAN commander — runtime hook lives in gameEngine (applyVihaanCombatAnimate)
import { parseAnnihilator } from "./annihilator.js"; // KW-ANNIHILATOR (CR 702.86a) — runtime hook lives in gameEngine (applyAnnihilatorTriggers)
import { isSeedbornUntap } from "./seedbornUntap.js"; // SEEDBORN-UNTAP — runtime hook lives in gameEngine (applySeedbornUntap)
import { isMurkfiendUntap } from "./murkfiendUntap.js"; // MURKFIEND-UNTAP — runtime hook lives in gameEngine (applyMurkfiendUntap)
import { parseTypeFilteredUntap } from "./typeFilteredUntap.js"; // TYPE-FILTERED UNTAP — runtime hook lives in gameEngine (applyTypeFilteredUntap)
import { groupNoUntapFiltersOf, GROUP_NO_UNTAP_SENTENCE_RE } from "./groupNoUntap.js"; // GROUP NO-UNTAP static (UT-1) — runtime enforced in gameState.untapAll (groupPreventsUntap)
import { parseStaticAbilities } from "./staticAbilityParser.js"; // for the eminence cost-reduction marker (Ur-Dragon classifier)
import { parseGlobalTapManaAugment, stripGlobalTapManaAugment } from "./staticAbilityParser.js"; // GLOBAL-TAP-AUGMENT: "Whenever you tap a <land|creature> for mana, add …" permanent
import { parseAdventureCard, faceViews } from "./adventure.js"; // ADVENTURE (CR 715) — split the creature/adventure halves; pure shape module (no back-import, acyclic)
import { parseSplitCard, splitFaceViews } from "./splitCard.js"; // SPLIT CARDS (CR 709) — the two-spell-halves shape module; pure leaf, acyclic
import { parseKickerCounterCreature, parseKickerEtbCreature, stripKickerText } from "./kicker.js"; // KICKER (CR 702.33) — optional cast cost + a was-kicked payoff (enters-with-counters OR a kicked ETB trigger); runtime hooks in legalChoices/actionDispatcher/resolvers. Leaf (no back-import, acyclic).
import { parseEmergeCard } from "./emerge.js"; // EMERGE (CR 702.97) — alt cast cost (sac a creature/artifact, pay the emerge cost reduced by its MV); runtime hooks in legalChoices/actionDispatcher. Leaf (no back-import, acyclic).
import { parseTributeCreature } from "./tribute.js"; // TRIBUTE (CR 702.96) — ETB opponent-choice (pay N +1/+1 counters OR the "if tribute wasn't paid" effect); runtime hook in resolvers.enterPermanent. Leaf (no back-import, acyclic).

// Keywords a keyword-only body counts native on — TWO classes, per Colton's
// "enforce, don't drop" policy (2026-06-18, docs/orchestration/retired-fp-ledger.md):
//
//  ENFORCED — the runtime consults the keyword (permanentHasKeyword / an SBA /
//  attack-legality / target-legality), so the body resolves CORRECTLY today:
//    flying·reach + the EVADE block-legality set — menace (≥2, CR 702.111b), skulk, fear,
//    intimidate, horsemanship, basic landwalk, unblockable, can't-block, can-block-only-flying —
//    all via combatEvasion.canBlockAttacker / the menace resolution-normalize · defender (can't
//    attack, CR 702.3b) · hexproof·shroud (enumerateTargets targetability — shroud untargetable by
//    all, hexproof untargetable by opponents; KW-UNTARGET) · prowess (a noncreature-cast self-pump
//    trigger — TRIG-PROWESS, triggers.checkCastTriggers) · first/double strike·trample·deathtouch·
//    lifelink (combatResolution) · vigilance (no attack-tap) · haste (summoning-sickness) ·
//    indestructible (lethal-damage SBA). flash (casting timing) + changeling/devoid (type/color
//    identity) likewise never mis-resolve.
//
//  INTERIM-FP — the rule is NOT enforced yet (a body currently mis-plays it), BUT the
//  mechanic is TRACTABLE: we KEEP it claimed native and BUILD the enforcement
//  (engine-first, Cindy's lane) rather than drop coverage. An accepted, time-boxed
//  trade — do NOT re-drop these (that was #255, SUPERSEDED); the enforcement tasks
//  restore correctness and each is logged in retired-fp-ledger.md:
//    ward·protection → ward = a TAX not an exclusion (CR 702.21, deferred); protection = DEBT (δ)
//  (Dropping to the Arbiter is the LAST RESORT — genuinely-hard/exotic mechanics only.)
export const COVERED_KEYWORDS = [
  "flying", "reach", "first strike", "double strike", "trample", "deathtouch",
  "lifelink", "vigilance", "menace", "haste", "defender", "flash", "hexproof",
  "shroud", "indestructible", "ward", "protection", "prowess", "skulk",
  "intimidate", "fear", "horsemanship", "shadow", "changeling", "devoid",
  // KW-POISON — ENFORCED in combatResolution.js: infect/wither reroute combat damage to a creature
  // into -1/-1 counters (CR 702.90b/702.80a); infect reroutes combat damage to a player into poison
  // (702.90a); toxic N adds N poison on top of normal player damage (702.180a); ten poison loses the
  // game (704.5c). "toxic" matches the oracle clause "toxic N" via the startsWith check.
  "infect", "wither", "toxic",
  // KW-ENGINES (CR 702.179) — ENFORCED: the ETB speed-1 grant is a synthesized self-trigger
  // (detectTriggers → the start-engines atom), the once-per-your-turn increase lives at the
  // gameState.loseLife chokepoint, and "Max speed —" abilities gate on speed 4 in manaModel /
  // legalChoices. The clause splitter's "!" split leaves the bare phrase.
  "start your engines",
  // KW-FADING / KW-VANISHING — ENFORCED: enters with N fade/time counters (resolvers PERMANENT_ETB) +
  // the upkeep remove-or-sacrifice (gameEngine → fading.applyFadeVanishUpkeep), CR 702.32a / 702.63a.
  // "fading N" / "vanishing N" match via the startsWith check.
  "fading", "vanishing",
  // CUMULATIVE UPKEEP (CR 702.24) — ENFORCED: the keyword's triggered ability is synthesized in detectTriggers
  // (a "your upkeep" descriptor whose sentinel effectClause parses to the `cumulative-upkeep` atom) and fired by
  // checkStepTriggers — at each of the controller's upkeeps the atom adds an age counter, scales the printed
  // per-counter cost by the age-counter total, and suspends on the shared pay-or-sacrifice choice. The clause
  // "cumulative upkeep {cost}" matches via the startsWith check (the reminder text is stripped by isKeywordOnly
  // before the keyword-only split), exactly like "fading N"/"bushido N"; allTriggerSentencesModeled bumps the
  // shaped count. Only the EXACT modeled cost shape flips — a hybrid/{X} cost is rejected by the parser matcher
  // (matchCumulativeUpkeep → the synthesized trigger routes LOW → the whole card stays body-only, a SAFE FN).
  "cumulative upkeep",
  // FLANKING (BLITZ FL-1, CR 702.25) — ENFORCED: one synthesized fire-time trigger per printed instance
  // (checkBlockTriggers debuffs each non-flanking blocker -1/-1 per instance; a flanking blocker is
  // immune). "flanking" matches via the startsWith check; allTriggerSentencesModeled bumps the shaped
  // count by flankingKeywordCount so multiples reconcile (CR 702.25b).
  "flanking",
  // KW-PERSIST (BLITZ PS-1, CR 702.79a) — ENFORCED: undying's -1/-1 mirror end to end (the synthesized
  // self-dies descriptor + the "had no -1/-1 counters" LKI intervening-if + the persist-return atom with
  // the immediate zero-toughness SBA). "persist" matches via the startsWith check; persistKeywordCount
  // bumps the shaped count (grants never count — the structural matcher).
  "persist",
  // BATTLE CRY (BLITZ BC-1, CR 702.90) — ENFORCED: one synthesized attacks trigger per printed instance,
  // pumping each OTHER attacker +1/+0 until end of turn (the Trumpet-Blast scope with excludeSource).
  // "battle cry" matches via the startsWith check; battleCryKeywordCount bumps the shaped count.
  "battle cry",
  // ECHO (BLITZ EC-1, CR 702.30) — ENFORCED: the keyword's triggered ability is synthesized in detectTriggers
  // (a "your upkeep" descriptor whose sentinel effectClause parses to the `echo` atom) and fired by
  // checkStepTriggers — the FIRST of the controller's upkeeps after it entered suspends on the shared
  // pay-or-sacrifice choice (echoDone-stamped, so later upkeeps no-op — CR 702.30c's single payment).
  // "echo {cost}" matches via the startsWith check exactly like cumulative upkeep; only the pure-mana cost
  // shape flips (matchEcho rejects {X}/hybrid → LOW → body-only, a SAFE FN).
  "echo",
  // KW-FABRICATE (CR 702.111a) — ENFORCED: the ETB choice (N +1/+1 counters OR N 1/1 Servo tokens) resolves in
  // enterPermanent (resolvers.js) via fabricate.js — the counters branch adds them AS the creature enters
  // (through applyCounterDoubling), the Servo branch mints the tokens + fires their ETB watchers. "fabricate N"
  // matches via the startsWith check (the reminder-text "(When this creature enters …)" is parenthetical, stripped
  // by stripReminder before the keyword-only split), exactly like "fading N" / "bushido N".
  "fabricate",
  // BUSHIDO / RAMPAGE (subsystem 2) — ENFORCED: the keyword's triggered ability is synthesized in
  // detectTriggers + fired by checkBlockTriggers. Bushido (CR 702.45 — "blocks or becomes blocked → +N/+N
  // this turn") + Rampage (CR 702.23a — "becomes blocked → +N/+N for each blocker beyond the first", a
  // DYNAMIC amount computed at fire time). "bushido N" / "rampage N" match via the startsWith check;
  // allTriggerSentencesModeled bumps the shaped count for each.
  "bushido", "rampage",
  // KW-EXALTED (CR 702.83a — BLITZ EX-1) — ENFORCED: fired at the checkAttackTriggers exalted site
  // (attackers.length === 1 → count the controller's battlefield exalted instances, reminder-stripped →
  // one aggregated fire-time +N/+N descriptor on the lone attacker, the rampage pattern). "exalted"
  // matches via the exact keyword-word check; a multi-instance card counts each printed instance.
  "exalted",
  // SOULSHIFT (CR 702.46a — BLITZ SS-1) — ENFORCED: the keyword's dies-trigger is synthesized in
  // detectTriggers ("you may return target spirit card with mana value N or less from your graveyard to
  // your hand" — the printed reminder wording) and fired by the normal dies flush; the clause parses to
  // the return-from-graveyard atom with a STRUCTURED {subtype:"spirit", mvMax:N} filter enforced at the
  // cardMatchesGraveyardFilter chokepoint (enumeration + flush chooser). "soulshift N" matches via the
  // startsWith check; a double soulshift synthesizes two descriptors (CR 702.46b).
  "soulshift",
  // KW-RAVENOUS (Edge of Eternities / Warhammer 40k) — ENFORCED end-to-end: the keyword's ability lives in
  // REMINDER parens (stripped by isKeywordOnly before the keyword-only split, leaving the bare "Ravenous"
  // word, exactly like bushido/afflict). Its TWO halves are both modeled: (1) enters-with-X +1/+1 counters —
  // staticAbilityParser.entersWithXCounters recognizes the reminder form + resolvers.enterPermanent adds the
  // X counters (opts.xValue → applyCounterDoubling); (2) "If X is 5 or more, draw a card when it enters" — a
  // synthesized self-ETB draw trigger (triggers.detectTriggers) gated by the interveningIf "x is 5 or more"
  // (evaluated against ctx.xValue). allTriggerSentencesModeled bumps the shaped count (ravenousTriggerCount)
  // so the synthesized draw trigger balances. The bare "ravenous" residue matches via the exact === check.
  "ravenous",
  // AFFLICT (CR 702.131) — ENFORCED: the keyword's triggered ability ("Whenever this creature becomes
  // blocked, defending player loses N life") is synthesized in detectTriggers + fired by checkBlockTriggers
  // (which now threads the defending player into the context so the lose-life resolves). "afflict N" matches
  // via the startsWith check; allTriggerSentencesModeled bumps the shaped count. This lets a pure printed-
  // afflict creature (Khenra Eternal — "Afflict 1") read keyword-only after its synthesized trigger sentence
  // is stripped, exactly like bushido.
  "afflict",
  // INGEST (CR 702.114a) — ENFORCED end-to-end, exactly like afflict directly above: detectTriggers
  // synthesizes the combat-damage descriptor from the printed keyword, allTriggerSentencesModeled bumps the
  // shaped count for it, and the effect ("that player exiles the top card of their library") parses to the
  // exile-top-of-library atom, which the normal combat-damage flush fires with the damaged player threaded
  // as the referent. Crediting the bare "Ingest" line here is the LAST of the three pieces — the descriptor
  // routed natively and the counts balanced while the card still parked, because the keyword's own printed
  // line survived the trigger-sentence strip as residue.
  // CIPHER (CR 702.98a) — credited on the UNTAKEN-OPTION rationale, and it meets that family's stated
  // criterion exactly rather than by analogy. optionalModeKeywords.test.js sets the bar: "the option has to
  // be one the player may simply decline with no consequence to the rest of the card. A keyword whose
  // UNPAID state still changes the board (or whose reminder hides a mandatory rider) is a different animal."
  //   · "Then you MAY exile this spell card encoded on a creature you control" — declining leaves the spell
  //     resolving normally and going to the graveyard, which is a real, complete, legal play;
  //   · the unpaid state changes NOTHING on the board (contrast champion, whose unpaid state SACRIFICES the
  //     creature — which is why champion is credited only because it is ENFORCED, not for being declinable);
  //   · the reminder hides no mandatory rider: the encoded-copy trigger exists only if you took the option.
  //     Verified rather than assumed — detectTriggers returns ZERO for a cipher carrier, so the reminder's
  //     "Whenever that creature deals combat damage…" never leaks in as a phantom descriptor.
  //   · and its carriers all have real mana costs, so they hard-cast normally — the exact point on which the
  //     SUSPEND precedent was refused (no mana cost ⇒ cannot be hard-cast at all).
  // Myriad is the closest sibling already in the family: another "you may create a copy" rider.
  // ⛔ FN-SAFE: the player loses access to the encode mode, never gains anything. The spell's own printed
  // effect is untouched — which is why every carrier here was already native once this line was removed.
  "cipher",
  // UNDAUNTED (CR 702.150a) — a pure COST REDUCTION and therefore DELVE's exact twin, which this list
  // already credits on "not delving = paying full cost". Not applying undaunted is likewise paying full
  // price: STRICTLY HARDER than the card allows, the safe direction, and nothing about the resolution
  // changes. Crediting delve while refusing its twin was the inconsistency.
  // GRAFT N (CR 702.57a) — ENFORCED on its mandatory half and declined on its optional one, which is what
  // makes the credit honest rather than an untaken-option shortcut:
  //   · MANDATORY: "enters with N +1/+1 counters" — entersWithPlusCounters now reads N off the KEYWORD (the
  //     count exists nowhere else on the card), so a 0/0 graft creature actually lands at N/N. Driven on the
  //     real enter path in graft.test.js; without it these twelve cards die to the SBA on arrival.
  //   · OPTIONAL: "you MAY move a +1/+1 counter from this creature onto it" — declining leaves the counters
  //     where they are, a real complete play, so not offering it loses nothing.
  // Prefix match ("graft"), so the printed count rides along whatever it is.
  "graft",
  "undaunted",
  // WEB-SLINGING — a pure ALTERNATIVE COST ("you may cast this for {2}{G} if you also return a tapped
  // creature you control to its owner's hand"), the prowl / spectacle / surge class this list already
  // credits: declining means casting for the printed mana cost, which is what the engine does anyway.
  "web-slinging",
  // IMPENDING N—{cost} — an alternative CAST MODE. Declining is the normal cast: the permanent enters as an
  // ordinary creature, a real complete play and the one the engine takes. The time-counter / not-a-creature
  // half exists ONLY inside the mode that was not chosen, so nothing is dropped by declining.
  "impending",
  // BARGAIN (CR 702.166a) — an optional ADDITIONAL cost, the replicate/buyback class already in this list:
  // declining leaves the spell simply not bargained, a real and complete play. The carriers' separate
  // "…costs {N} less to cast if it's bargained" sentence is handled on its own, so declining costs only
  // mana. ⛔ Cannot match the "if it's bargained" references — no word boundary between "bargain" and "ed".
  "bargain",
  "ingest",
  // CHAMPION (CR 702.71a) — ENFORCED end-to-end, the ingest pattern exactly: detectTriggers synthesizes the
  // ENTERS descriptor from the printed keyword (one only — the leaves half rides the detain link),
  // allTriggerSentencesModeled bumps the shaped count, and the sentinel effect resolves through
  // removal.applyChampion. Crediting the bare "Champion a <Type>" line here is the third of the three
  // pieces: the descriptor routed natively and the counts balanced while the card still parked, because the
  // keyword's own printed line survived the trigger-sentence strip as residue. Prefix match ("champion a"),
  // so the named type rides along whatever it is.
  "champion a",
  // AFTERLIFE (BLITZ AF-2, CR 702.135a) — ENFORCED end-to-end: detectTriggers synthesizes the self-dies
  // create-token trigger from the printed keyword (afterlifeKeywordValues — structural comma-segment match, so
  // grants like Afterlife Insurance's "gain afterlife 1" / Indebted Spirit's "has afterlife 1" never self-
  // synthesize); the effectClause is the reminder's own create-token wording ("create N 1/1 white and black
  // Spirit creature token(s) with flying"), parsed by the existing create-token atom and fired by the normal
  // dies flush under the dead creature's controller (CR 702.135a). The count is emitted in DIGIT form for N>1
  // so ANY printed value parses HIGH and routes — a skipped/unparseable N would be a claimed-native carrier
  // whose death mints nothing (a forbidden FP). "afterlife N" matches via the startsWith check; allTrigger-
  // SentencesModeled bumps the shaped count per printed instance (CR 702.135b — multiples trigger separately).
  "afterlife",
  // MENTOR (BLITZ MN-1, CR 702.134a) — ENFORCED end-to-end: detectTriggers synthesizes the attacks trigger
  // from the printed keyword (mentorKeywordCount — structural comma-segment match, so a grant "…and has mentor"
  // — Aegis of the Legion / Nyxborn Unicorn — never self-synthesizes); the effectClause "put a +1/+1 counter on
  // target attacking creature with lesser power" parses to the add-counter atom with restrictions
  // [combat:attacking, powerVsSource:"<"] (the DYNAMIC target restriction — target power strictly below the
  // SOURCE's, layer-aware, enforced at enumeration by creatureSatisfiesRestrictions). The +1/+1 counter is
  // "own"-intent, so the enemy/own flush chooser only ever picks the controller's own attacking creature of
  // lesser power; a mentor attacking ALONE (no legal target) fires nothing (CR 603.3c drop). The bare "mentor"
  // residue matches via the exact === check; allTriggerSentencesModeled bumps the shaped count per instance.
  "mentor",
  // MODULAR (BLITZ MOD-1, CR 702.43a) — ENFORCED end-to-end. Modular is BOTH halves of CR 702.43a: (1) an
  // enters-with-N-+1/+1-counters replacement — modeled by resolvers.enterPermanent (reads modularKeywordValues,
  // the SAME DIGIT-only recognizer, so it can't drift); (2) a self-dies "you may put its +1/+1 counters on
  // target artifact creature" trigger — synthesized by detectTriggers, whose count is the dying creature's
  // last-known +1/+1 total (CR 603.6e LKI, ctx.triggeringPlusCounterCount) and whose target is narrowed by
  // cardType:"artifact"; a +1/+1 counter is own-intent, so the flush chooser picks the controller's own artifact
  // creature (no own artifact-creature target → the "you may" declines). The reminder parens (both sentences)
  // are stripped by isKeywordOnly, leaving the bare "modular N" keyword line — matched via the startsWith check,
  // exactly like afterlife/soulshift. allTriggerSentencesModeled bumps the shaped count per printed instance
  // (modularKeywordValues.length). DIGIT-only, so "Modular—Sunburst" (Arcbound Wanderer — variable per-color
  // count) and "Poison Modular N" (Arcbound Mamba — a player-or-artifact-creature + poison variant) never match
  // this keyword and stay body-only/Arbiter (CREED — their differing behavior is never claimed native).
  "modular",
  // KW-UNDYING (CR 702.92a, SHELF S7) — ENFORCED end-to-end: detectTriggers synthesizes the self-dies
  // return trigger from the printed keyword (undyingKeywordCount — structural line-segment match, so grants
  // like Undying Evil / Mikaeus never self-synthesize); checkDiesTriggers fires it with the death look-back's
  // counters snapshot (CR 603.6e LKI); the intervening-if "it had no +1/+1 counters on it" is enforced by
  // interveningIf.js at flush + resolution (CR 603.4 — this terminates the loop: the returned body carries a
  // counter, so its next death reads false); the undying-return atom (selfReturn.js) re-enters the card from
  // the graveyard under its owner + adds the +1/+1 counter through the doubling replacement. A TOKEN never
  // returns (CR 111.7). The bare "undying" residue matches via the exact === check; allTriggerSentencesModeled
  // bumps the shaped count (undyingShaped) so the synthesized trigger balances, exactly like bushido/afflict.
  "undying",
  // KW-EVOLVE (CR 702.100, SHELF S7) — ENFORCED end-to-end, the undying pattern exactly: detectTriggers
  // synthesizes the creature-you-control ETB descriptor from the printed keyword (evolveKeywordCount —
  // structural line-segment match, grants never self-synthesize); the comparative intervening-if
  // ("that creature has greater power or toughness than this creature") is enforced LAYER-AWARE by
  // interveningIf.js at flush + resolution (CR 702.100d); the evolve-counter-self atom places the +1/+1
  // through the standard doubling/watcher path and fires the "this creature evolves" watchers
  // (CR 702.100f — Watchful Radstag's copy rider). The bare "evolve" residue matches via the exact ===
  // check; allTriggerSentencesModeled bumps the shaped count (evolveShaped).
  "evolve",
  // KW-RENOWN (CR 702.111, census slice 2026-07-25) — ENFORCED end to end: detectTriggers synthesizes the
  // combat-damage-to-player descriptor from the printed keyword (renownKeywordValue), and the `renown` atom
  // applies the CR 702.111a latch — if it isn't renowned, place N +1/+1 counters through the standard
  // addCounter chokepoint (doublers/watchers compose) and set the flag; an already-renowned creature dealing
  // damage again does nothing. The keyword prints as "renown N", so it matches via the startsWith check;
  // allTriggerSentencesModeled bumps the shaped count (renownShaped).
  "renown",
  // KW-MOBILIZE (CR 702.174) — ENFORCED end to end: detectTriggers synthesizes the attacks descriptor from
  // the printed keyword (mobilizeKeywordValue), and the `mobilize` atom mints N tapped 1/1 red Warriors AND
  // REGISTERS THEM IN state.combat.attackers against the source's defender. That registration is the whole
  // point: attacking-ness is combat.attackers membership, not a permanent field, so without it the tokens
  // would be inert and this credit would be a lie. The sacrifice rides the CR 603.7 delayed scheduler at
  // the next end step. Prints as "mobilize N", so it matches via the startsWith check; the shaped count is
  // bumped by mobilizeShaped below.
  "mobilize",
  // KW-BACKUP (CR 702.166) — ENFORCED as the SELF-TARGET line: detectTriggers synthesizes an ETB whose
  // effectClause is ordinary modeled text ("put N +1/+1 counters on this creature"), so it resolves through
  // the existing self-scoped add-counter atom with no new runtime code. The narrowing is deliberate and
  // stated at backupKeywordValue: self-target is one of the card's own legal choices (forced when it is your
  // only creature) and makes the "if that's another creature" grant vacuous, so the engine plays a real
  // legal line. It simply never offers backup on ANOTHER creature — an under-offer, the safe direction.
  "backup",
  // KW-ENLIST (CR 702.151a, census slice 49) — "As this creature attacks, YOU MAY tap a nonattacking
  // creature you control without summoning sickness. When you do, add its power to this creature's until
  // end of turn." Wholly optional, and declining leaves a complete, legal attack with the printed power.
  // The engine declines, so the combat it plays is a real one — the myriad rationale exactly.
  "enlist",
  // KW-EXTORT (CR 702.99a, census slice 49) — "Whenever you cast a spell, YOU MAY pay {W/B}. If you do,
  // each opponent loses 1 life and you gain that much life." An optional payment on an already-modeled
  // event; declining costs nothing and changes nothing else on the card.
  //
  "extort",
  // KW-UNLEASH (CR 702.86a, census slice 50) — credited ONLY because it is now ENFORCED, not as an untaken
  // option. Slice 49 refused it on exactly that grounds: its second sentence ("It can't block as long as it
  // has a +1/+1 counter on it") is a conditional static, so a free credit would let the creature block when
  // the printed card forbids it. combatEvasion.canBlockAttacker now reads the permanent's counters LIVE at
  // block declaration, which binds whether the counter came from unleash's own entry choice or from anywhere
  // else — the case that made the free credit unsafe. The entry-counter half stays declined (the engine
  // never takes optional entry choices), which is a legal printed mode.
  "unleash",
  // Census slice 51 — the permanent-side halves of the same four. Each was read off the printed corpus line
  // before crediting, and each is an option whose declined state is the printed card:
  //   provoke  (CR 702.38a)  — "Whenever this creature attacks, YOU MAY have target creature defending
  //                            player controls untap and block it if able." Declined: an ordinary attack.
  //   assist   (CR 702.132a) — cost help from another player the engine never offers; full price is paid.
  //   casualty (CR 702.153a) — an optional additional cost; declined, the spell is copied zero times.
  //   ripple   (CR 702.60a)  — an optional reveal; declined, the library is untouched.
  //
  // (LEARN is deliberately absent despite 13 parked carriers. Its reminder reads "You may reveal a Lesson
  //  card you own from outside the game and put it into your hand, OR discard a card to draw a card" — and
  //  I could not establish from the printed text alone that declining BOTH options is legal. Crediting on an
  //  uncertain rule reading is exactly what this project forbids, so it stays on the Arbiter until someone
  //  checks the rule properly. A false negative costs 13 cards; a false positive costs trust.)
  "provoke", "assist", "casualty", "ripple",
  // KW-TRAINING (CR 702.148a, census slice 52) — NOT a member of the optional-mode family above it: training
  // is a MANDATORY trigger, so it is credited by being MODELED, not by being declined. detectTriggers
  // synthesizes the self-scoped attacks descriptor (ordinary add-counter effectClause) gated by the "another
  // attacking creature has greater power" intervening-if, which compares layer-aware power against the other
  // ATTACKERS — a bigger creature staying home trains nothing.
  "training",
  // ⭐ KW-SUNBURST (CR 702.43a) — ENFORCED, not declined, and the enforcement is what earns the credit.
  // "This permanent enters with a +1/+1 counter on it for each COLOR of mana spent to cast it" (a charge
  // counter instead if it isn't a creature). The colour count is captured off the payment plan at cast time
  // (actionDispatcher reads plan.spend, the same tally the commit deducts), threaded to the ETB beside
  // castFromZone, and applied by resolvers.enterPermanent through the SAME applyCounterDoubling every other
  // enters-with write uses.
  // ⛔ THE COUNTER KIND IS READ FROM THE TYPE LINE, never assumed: creature → +1/+1, non-creature artifact →
  // charge (sunburstCounterKind). Crediting a flat +1/+1 would have quietly mis-modelled Solarion.
  // ⛔ A FREE / ALT-COST CAST SPENDS NO MANA and gets ZERO counters — CR-correct, and an under-count is the
  // safe direction regardless.
  "sunburst",
  // KW-DELVE (CR 702.66a, census slice 48) — "Each card you exile from your graveyard while casting this
  // spell pays for {1}." A pure, OPTIONAL cost reduction; the engine hard-casts at full cost, which is a
  // real legal play, so the option it never takes cannot change what resolves. Same basis as convoke /
  // improvise. Credited on the permanent side too because delve rides CREATURES as well as spells (Gurmag
  // Angler), and the spell path gets it via COST_ONLY_KEYWORD_LINE.
  "delve",
  // KW-MYRIAD (CR 702.115a, census slice 48) — "Whenever this creature attacks, for each opponent other than
  // defending player, YOU MAY create a token that's a copy of this creature attacking that player. Exile
  // those tokens at end of combat." An optional attack rider: declining is a complete, legal attack, and the
  // tokens would be exiled at end of combat anyway. The engine declines, so the board it plays is a real one.
  "myriad",
  // KW-DETHRONE (CR 702.104a, census slice 46) — ENFORCED: detectTriggers synthesizes the self-scoped
  // attacks descriptor whose effectClause is ordinary modeled text (the add-counter atom), gated by the
  // "that player has the most life or is tied for most life" intervening-if, which compares across ALL
  // players (the attacker included) rather than opponents only. Bare keyword only — a GRANTED dethrone
  // (Dack's Duplicate) never matches the anchor and stays on the Arbiter.
  "dethrone",
  // KW-SPLIT-SECOND (CR 702.19a) — ENFORCED in legalChoices.js: while a spell with split second is on the
  // stack, splitSecondOnStack suppresses every player's casts (folded into the same `cantCast` the Grand
  // Abolisher lane feeds) AND every non-mana activated ability (activate / crew / cycling / loyalty). Mana
  // abilities and CR 116.2 special actions stay legal, exactly as the rule words it. Credited because the
  // restriction is really imposed, not because it is vacuous — the engine DOES grant opponents priority
  // with a non-empty stack, so an unenforced split second would have been a live divergence.
  "split second",
  // (KW-FIREBENDING is NOT credited by this list — it needs a DIGIT-anchored gate, exactly like bloodthirst
  //  below. A startsWith("firebending ") credit would also swallow "Firebending X, where X is this creature's
  //  power", whose amount the add-mana atom cannot express; the engine would then add a WRONG fixed amount of
  //  mana. See reFirebendingFixed.)
  // (KW-BLOODTHIRST is NOT credited here — it needs a DIGIT-anchored gate, see reBloodthirstFixed below.
  //  A startsWith("bloodthirst ") credit would also accept "Bloodthirst X", whose counters the runtime
  //  cannot place — caught by the per-flip audit on Petrified Wood-Kin before it shipped.)
  // CASCADE (CR 702.85) — ENFORCED: the keyword's triggered ability is synthesized in detectTriggers (a selfCast
  // `cascade` trigger) + fired by checkCastTriggers (dig the library to a cheaper nonland, park the free-cast/
  // decline decision at the action layer). A SINGLE "cascade" line matches via the `=== "cascade"` check; the
  // shaped count is bumped in allTriggerSentencesModeled. DOUBLE cascade ("Cascade, cascade") is NOT modeled
  // (it digs twice) and is explicitly REJECTED by isKeywordOnly's double-cascade guard, so it never reads
  // keyword-only here despite splitting into two "cascade" clauses on the comma.
  "cascade",
  // KW-CYCLING is NOT a generic startsWith keyword — see reCyclingCost in isKeywordOnly. The generic
  // `startsWith("cycling ")` rule would mis-credit any line opening with "cycling " (e.g. Fluctuator's
  // static "Cycling abilities you activate cost {2} less to activate"), so cycling is gated to the
  // exact "cycling {cost}" activated-ability shape the engine actually enforces (parseCyclingCost).
  // KW-PARTNER is NOT a generic startsWith keyword either — see rePartnerBare in isKeywordOnly. The generic
  // `startsWith("partner ")` rule would ALSO swallow "Partner with <name>", which is a different ability with
  // a real ETB (CR 702.124j), so bare partner stays gated to the EXACT bare-word form.
  //
  // ⚠️ UPDATED: "Partner with <name>" IS now modeled — its ETB is synthesized in detectTriggers
  // (partnerWithName) and its line is removed by stripPartnerWithLine before the clause split, NOT credited
  // as a keyword here. That distinction is the whole point: bare partner is credited because it is VACUOUS at
  // runtime (deck construction only), while partner-with is credited because its ability is BUILT. The one
  // form still not modeled is "Partner with itself" (Mothers Yamazaki) — the recognizer refuses it, so neither
  // path credits it. Keeping both out of this list means neither can be credited by accident.
];

const stripReminder = (s) => String(s || "").replace(/\([^)]*\)/g, " ");

/**
 * True when a permanent's oracle text is empty (vanilla), only evergreen keywords, or an enforced
 * EVADE evasion clause (basic landwalk / unblockable / can't-block / can-block-only-flying). The
 * optional `name` is normalized to "this creature" so a self-clause printed with the card name
 * ("Invisible Stalker can't be blocked.") reads as a covered self-clause; a nameless caller simply
 * under-claims such self-clauses (safe — false-negative).
 */
/**
 * SELF NO-UNTAP STATIC (BLITZ UP-1, CR 302.6) — "This <permanent> doesn't untap during your untap step."
 * The runtime HONORS this (gameState.selfPreventsUntap skips the source at the untap step), so the metric
 * must credit it wherever it appears, or the two diverge in the FN direction. It was previously stripped by
 * an inline copy inside permanentTriggersCovered ONLY, which is why a card whose other text was a modeled
 * TRIGGER flipped while the identical card with a modeled ACTIVATED ability parked — a pure path accident.
 * One shared helper now, so the three residue paths cannot drift apart again.
 *
 * The subject anchors MIRROR selfPreventsUntap exactly and deliberately:
 *   - "this <noun>"     — the modern self reference;
 *   - the CARD'S OWN NAME — legacy printings templated it (Goblin Sharpshooter, Mana Vault; CR 201.4).
 * It must NOT match "Enchanted creature doesn't untap …" (the ATTACHED form, a different runtime path) nor
 * the "your NEXT untap step" wording (a one-shot rider on a mana ability that the runtime refuses).
 */
/**
 * NO-MAXIMUM-HAND-SIZE (CR 402.2 / 514.1 — Reliquary Tower / Spellbook / Kruphix). ENFORCED at runtime:
 * gameEngine.cleanupDiscardExcess returns 0 for a player who controls ANY permanent printing this line, so
 * the cleanup discard genuinely never happens. The metric credited only the ONE-SHOT dice-roll variant
 * ("…for the rest of the game", the Ancient Dragon rider) and not the bare permanent static — the same
 * one-path-only split this session has hit repeatedly, with the runtime already ahead of the metric.
 *
 * Anchored to the exact printed sentence. A card that MODIFIES the maximum instead of removing it
 * ("Your maximum hand size is four" — Cursed Rack) does NOT match: cleanupDiscardExcess deliberately
 * SUSPENDS enforcement for everyone when it sees such text rather than guess, so crediting those would
 * claim a number the engine never applies. Left as residue → Arbiter (FN-safe).
 *
 * ⚠️ THE STRIP MUST GIVE BACK THE BOUNDARY IT MATCHED ON (fixed 2026-08-03). The leading `[\n.;]` is a
 * DELIMITER, not part of the sentence being removed, and replacing the whole match with a space DELETED
 * the previous sentence's period — "…equal to the number of cards in your hand.\nYou have no maximum hand
 * size.\nWhen Tishana enters, …" collapsed to "…in your hand When Tishana enters, …", one glued
 * pseudo-sentence that parses as nothing. Invisible for a card that prints the line FIRST (Reliquary
 * Tower, Spellbook, Thought Vessel — all matched via `^`, no boundary to eat), which is why it survived:
 * every carrier that would have exposed it was already parked for what looked like a different reason.
 * Tishana, Voice of Thunder and Body of Knowledge are the mid-oracle carriers, and they were the tell.
 * This is the runbook's "a fold that eats its own sentence boundary" trap, and the diagnostic it names —
 * a card whose tier does NOT change — is exactly how it stayed hidden.
 */
const NO_MAX_HAND_METRIC_RE = /(?:^|([\n.;]))[ \t]*you have no maximum hand size[ \t]*(?:\.|$)\s*/gi;
export function stripModeledNoMaxHandSize(oracle) {
  return String(oracle || "")
    // Re-emit the matched delimiter (plus a newline so the neighbours stay separate clauses); a match at
    // the very start captures nothing and yields "", trimmed by the leading-whitespace strip below.
    .replace(NO_MAX_HAND_METRIC_RE, (_m, lead) => (lead ? `${lead}\n` : ""))
    .replace(/^\s+/, "");
}

const SELF_NO_UNTAP_NOUNS_METRIC = "creature|artifact|permanent|land|enchantment|equipment|vehicle";
export function stripModeledSelfNoUntap(oracle, name) {
  // END-ANCHORED, exactly like gameState.selfPreventsUntap. Without the anchor a CONDITIONAL variant
  // ("…doesn't untap during your untap step IF IT HAS A DEPLETION COUNTER ON IT" — Veldt, Lava Tubes,
  // River Delta, Timberline Ridge, Land Cap; "…if an opponent controls two or more creatures" — Walking
  // Dream) matched its PREFIX and left a dangling "if …" fragment behind. No card flipped on it, because
  // that fragment survives as residue — but the runtime refuses those conditionals outright, so the metric
  // was crediting something the engine never honors and only an unrelated leftover was keeping the card
  // parked. A loaded gun of exactly the kind slice 10 removed. Found by probing the two implementations
  // against each other corpus-wide: 11 disagreements, now zero.
  let out = String(oracle || "").replace(
  // The trailing `\s*` matters: without it the strip leaves a blank leading line, which downstream clause
  // splitting reads as an empty residue clause and parks the card (caught by the fingerprint — Island Fish
  // Jasconius dropped native-trigger → body-only on the first cut of this anchor).
    // The guard is a NEGATIVE LOOKAHEAD for a trailing "if …", not an end-of-clause anchor. Requiring a
    // terminator looked cleaner but was wrong: this helper also runs on ALREADY-STRIPPED intermediate
    // residue, where an earlier strip may have consumed the sentence's period, so the anchor silently
    // stopped matching and dropped Island Fish Jasconius native-trigger → body-only. The lookahead refuses
    // exactly the conditional variants the runtime refuses and changes nothing else.
    new RegExp(`\\bthis (?:${SELF_NO_UNTAP_NOUNS_METRIC}) doesn['’]t untap during your untap step\\b(?!\\s+if\\b)\\.?\\s*`, "gi"),
    " ",
  );
  const n = String(name || "");
  if (n) {
    const esc = n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/'/g, "['’]");
    out = out.replace(new RegExp(`\\b${esc} doesn['’]t untap during your untap step\\b\\.?\\s*`, "gi"), " ");
  }
  // The separator the replacements emit is a SPACE, which is right mid-text but leaves a leading one when
  // the stripped line was first on the card. Downstream clause reads anchor on `^`, so that stray space is
  // load-bearing: it dropped Island Fish Jasconius native-trigger → body-only until this trim.
  return out.replace(/^\s+/, "");
}

// ESCAPE's printed line, matched WHOLE (see the note inside isKeywordOnly). The dash is load-bearing: the
// keyword must be followed by its cost dash, so a line beginning with the CARD NAME "Escape Velocity …"
// can never match.
const ESCAPE_LINE = /^[ \t]*escape\s*[—–-][^\n]*$/gim;
// ⭐ ESCAPE-WITH-COUNTERS — "This creature escapes with a +1/+1 counter on it." (Phoenix of Ash, Ox of
// Agonas, Underworld Charger, Woe Strider, Tizerus Charger, Charred Graverobber, Underworld Rage-Hound,
// Pharika's Spawn, Chainweb Aracnir, Voracious Typhon, Loathsome Chimera) and the "…instead" tail
// (Polukranos, Unchained). Twelve carriers, ZERO native, and the shapes differ only by COUNT.
//
// ⛔ STRIPPED AS **VACUOUS**, ON THE ESCAPE LINE'S OWN ARGUMENT — and re-verified rather than inherited.
// The escape cost line is stripped because escape is a graveyard re-cast window the runtime never offers and
// every carrier has a real printed mana cost. This rider fires ONLY on an escape-cast, so it can never apply
// either. I checked the precondition independently for all twelve carriers of THIS line: every one has a
// printed mana cost ({G} … {3}{R}{R}) and a printed escape line, so each is fully playable by its ordinary
// cast with this rider inert. Same reasoning, separately evidenced.
// ⛔ SENTENCE-SCOPED, NOT LINE-SCOPED, and Polukranos is exactly why: its line reads "Polukranos enters with
// six +1/+1 counters on it. It escapes with twelve +1/+1 counters on it instead." The first sentence is a
// REAL enters-with rider that fires on a normal cast. A line strip would delete it and credit the card for a
// modelled effect it would then never perform — the precise failure the partner-with note above warns about.
// Only the escape sentence goes.
// ⛔ THE SUBJECT IS ANCHORED to a self reference ("this creature" / "it" / the card's own name, which
// textNormalize has not yet rewritten at this point) plus the literal verb "escapes with", so no other
// sentence can match.
const ESCAPE_WITH_COUNTERS = /(?:^|(?<=\.)\s*)(?:this creature|this permanent|it|[A-Z][\w'’-]*(?:[ ][A-Z][\w'’-]*)*)\s+escapes with [^.\n]*counters? on it(?: instead)?\.?/gim;
// ⭐⭐ TURNED-FACE-UP (CR 707.9) — "When/Whenever/As ~ is turned face up, <effect>." The morph / megamorph /
// disguise flip payoff. **120 real carriers, and the census says 78 of them are blocked by NOTHING ELSE.**
//
// ⭐ STRIPPED AS VACUOUS, ON THE MORPH COST LINE'S OWN ARGUMENT — and the inconsistency is the point. The
// codebase ALREADY strips `morph {cost}` as vacuous, with the reasoning spelled out at reMorphCost: the
// engine has no morph lane in legalChoices, every morph card carries a normal mana cost, so it is hard-cast
// FACE UP and its body resolves correctly. That note then says the flip TRIGGER "keeps that residue and
// stays body-only" — the same unreachable path treated two different ways, which is what left 78 cards
// parked on an ability the engine can never fire.
//
// ⛔ RE-VERIFIED, NOT INHERITED (vacuity is not transitive — the escape-rider slice's rule):
//   · legalChoices has NO morph/face-down cast lane (grep: zero hits).
//   · There is no turn-face-up action ANYWHERE in the runtime. Face-down permanents DO exist — manifest
//     creates them — but manifest.js states its own limit: "that turn-up is NOT modeled here", so a
//     manifested card plays as a vanilla 2/2 until it leaves. Nothing flips, ever.
//   · Every carrier is playable by its normal route: all have a printed mana cost except Branch of
//     Vitu-Ghazi, which is a LAND (played, not cast) and already reads `land` tier.
//
// ⛔ SENTENCE-ANCHORED AT THE CONDITION, and Illusionary Mask is why. Its activated ability contains
// "…has not been turned face up and would assign or deal damage… instead it's turned face up and…" MID-
// SENTENCE. A phrase-level strip would carve a hole in that clause and could credit the card for a mangled
// remainder. The anchor requires when/whenever/as to LEAD the sentence, so the Mask is untouched and stays
// parked on its (genuinely unmodelled) ability.
// ⛔ THE COMPOUND "enters OR is turned face up" (Gadget Technician, Crowd-Control Warden, Ponyback Brigade)
// is EXCLUDED — it routes as a normal ETB and DOES fire on the face-up hard cast. Stripping it would delete
// a working trigger, the exact failure the Polukranos sentence-scope note records.
const TURNED_FACE_UP = /(?:^|(?<=\.)\s*|(?<=\n))[ \t]*(?:when|whenever|as)\s+(?![^.\n]*\benters?\b)[^.\n]{0,80}?\bis turned face up\b[^.\n]*\.?/gi;
// KW-PARTNER-WITH (CR 702.124j) — drop the whole "Partner with <name>" LINE before the clause split below.
// A LINE strip, not a clause credit, and that is the point: partner names routinely contain commas ("Trynn,
// Champion of Freedom" — 28 of the 54 corpus lines), and isKeywordOnly splits its text on commas, so a clause
// acceptor would have shattered those names into "partner with trynn" + "champion of freedom" and rejected
// them. Stripping the line first sidesteps the split entirely. (The escape/ninjutsu strips right here are the
// same shape — ⭐ "ONE CLAUSE HERE, A WHOLE LINE THERE", per the note above stripNinjutsuCostLines.)
//
// ⛔ GATED ON partnerWithName — THE SAME RECOGNIZER detectTriggers USES, not a second private regex, so the
// strip and the synthesis can never disagree about which lines are modeled. That equivalence is load-bearing
// for "Partner with itself" (Mothers Yamazaki): the recognizer refuses it, so nothing is stripped, so the line
// survives as residue and the card stays body-only. Stripping a line whose ability is NOT modeled is exactly
// how a card gets credited for something the engine never does.
const PARTNER_WITH_LINE = /^[ \t]*partner with .+$/i;
// SHUFFLE-INSTEAD-OF-GRAVEYARD (CR 614) - "If <this> would be put into a graveyard from anywhere, reveal
// <this> and shuffle it into its owner's library instead." (Darksteel Colossus, Blightsteel Colossus,
// Progenitus, Legacy Weapon.) A LINE strip, not a clause credit, for the same reason partner-with needed one:
// the sentence contains commas AND a top-level " and ", so isKeywordOnly's clause split would shred it.
//
// GATED ON THE RUNTIME READER shufflesIntoLibraryInsteadOfGraveyard - the SAME predicate moveCardToZone
// consults to actually perform the replacement - so the strip and the enforcement cannot disagree about
// which cards are handled. Crediting this sentence without the replacement would mark a card native while it
// still rotted in the graveyard, which for these five IS the card.
const SHUFFLE_INSTEAD_LINE = /^[ \t]*if .+ would be put into a graveyard from anywhere,.*instead\.?[ \t]*$/i;
function stripShuffleInsteadLine(oracle) {
  if (!shufflesIntoLibraryInsteadOfGraveyard({ oracle })) return oracle;
  const raw = String(oracle || "");
  const lines = raw.split("\n");
  const kept = lines.filter((ln) => !SHUFFLE_INSTEAD_LINE.test(ln));
  return kept.length === lines.length ? raw : kept.join("\n").trim();
}
// COUNTER-SHIELD (Phantom cycle / Bloatfly Swarm, CR 615) — the prevention wall that pays out of +1/+1
// counters. A LINE strip, for the same reason partner-with and shuffle-instead needed one: the Phantom form
// is TWO sentences on one line ("…prevent that damage. Remove a +1/+1 counter…") and the Bloatfly form is a
// single sentence full of commas, so any clause-level split shreds both into fragments no pattern can admit.
//
// ⛔ GATED ON counterShieldPrevention — the SAME reader the two damage paths consult (combatResolution's
// funnel and applyDamageEffect). The metric and the runtime therefore cannot disagree about which cards are
// handled, and crediting this line is only honest because BOTH the prevention AND the counter payment are
// enforced. A creature credited for the prevention alone would be unkillable by damage.
//
// The rest of each carrier rides the normal paths: "enters with N +1/+1 counters" is already modeled, as is
// Phantom Nantuko's "{T}: Put a +1/+1 counter on this creature".
// DISCARD-COST HAND ABILITY ("<mana>, Discard this card: <effect>") — the general form of cycling. Credited
// ONLY under the SAME conditions legalChoices.actionsDiscardAbilityFromHand offers it on: the line
// parses and its effect program is HIGH. Written as one predicate used by both strip paths so the metric
// cannot out-run the runtime.
// ⭐ TARGETED LANE (2026-08-14): the target-refusal is GONE in lockstep with the runtime — legalChoices
// now expands a chosen-target program per legal combo (Steel Wrecking Ball, Trumpeting Carnosaur), so the
// metric credits it. Target-pool emptiness stays a runtime affair (zero combos → no action), exactly as
// on the cast path.
function discardCostAbilityModeled(card) {
  const ab = parseDiscardCostAbility(card);
  if (!ab) return null;
  // ⚠️ PARSED UNDER A LITERAL "Instant", NOT the card's own type — the SAME correction
  // matchOptionalDiscardPayment already carries. Several atoms (pump, deal-damage) are
  // type-gated to Instant/Sorcery and return LOW for a Creature, so passing the card's real
  // type refused abilities that are perfectly modeled (Harvester of Misery, Mjolnir).
  // The atoms resolve type-agnostically, so this is behaviour-identical and correct.
  const program = parseEffectClause(ab.effectText, "Instant");
  // Mirrors legalChoices exactly — including the confidence check, which is measured-redundant there (see
  // the note at that call site). Kept in lockstep so the two predicates cannot drift even where one arm is
  // currently doing no work.
  if (!program || programConfidence(program) !== "high") return null;
  if (!(program.atoms || []).length) return null;
  return ab;
}
/** The printed from-hand discard-ability line, Channel prefix or not (CR 702.33a — the same ability). Shared by
 *  the general path's strip below and the land path's admission (landFullyCovered) so the two cannot drift. */
const DISCARD_ABILITY_LINE_RE = /^(?:channel\s*[—–-]\s*)?(?:\{[^}]+\})+, Discard this card: /i;
/** Drop the whole "<mana>, Discard this card: <effect>" LINE when the engine really offers it. */
function stripDiscardCostAbilityLine(oracle, card) {
  const ab = discardCostAbilityModeled({ ...(card || {}), oracle });
  if (!ab) return oracle;
  const raw = String(oracle || "");
  const lines = raw.split("\n");
  const kept = lines.filter((ln) => !DISCARD_ABILITY_LINE_RE.test(ln.trim()));
  return kept.length === lines.length ? raw : kept.join("\n").trim();
}
function stripCounterShieldLine(oracle) {
  if (!counterShieldPrevention({ oracle })) return oracle;
  const raw = String(oracle || "");
  const lines = raw.split("\n");
  const kept = lines.filter((ln) => !counterShieldPrevention({ oracle: ln }));
  return kept.length === lines.length ? raw : kept.join("\n").trim();
}
function stripPartnerWithLine(oracle) {
  if (!partnerWithName(oracle)) return oracle; // absent, or the unmodeled "partner with itself" — strip nothing
  const raw = String(oracle || "");
  const lines = raw.split("\n");
  const kept = lines.filter((ln) => !PARTNER_WITH_LINE.test(ln));
  return kept.length === lines.length ? raw : kept.join("\n").trim();
}

export function isKeywordOnly(oracle, name) {
  // ESCAPE (CR 702.138a) — removed as a whole LINE, here, BEFORE stripReminder collapses the newlines.
  // Its cost is COMPOUND ("Escape—{2}{B}, Exile two other cards from your graveyard.") and the clause split
  // below breaks on commas, so no clause-level pattern can ever reach it; crediting the bare
  // "exile two other cards from your graveyard" fragment is out of the question — that is a real effect
  // elsewhere. The LINE is the only safe unit, and line structure exists only at this point.
  //
  // Vacuous for the from-hand cast on the same basis flashback carries: escape is a GRAVEYARD re-cast window
  // ("You may cast this card from your graveyard by paying [cost]"), the runtime never offers it, and every
  // carrier has a real printed mana cost — VERIFIED, not assumed: Nethergoyf {B}, Sentinel's Eyes {W},
  // Escape Velocity {R}, Mogis's Favor {B}, Bloodbraid Challenger {3}{R}{G}, Lunar Hatchling {4}{G}{U}.
  //
  // ⛔ SUSPEND IS DELIBERATELY NOT HERE, and this is why the check mattered: Lotus Bloom, Sol Talisman and
  // Mox Tantalite print NO mana cost at all. Suspend is the ONLY way to play them, so crediting the line
  // would mark a card native that the engine cannot play by any route — a false positive, not a missing
  // option. The vacuity argument is about a card that is castable WITHOUT the keyword; it does not survive
  // on a card that is not.
  //
  // The dash is load-bearing: "escape" must be followed by the cost dash, so a line beginning with the CARD
  // NAME "Escape Velocity ..." can never match.
  //
  // SELF-FLASH PERMISSION - stripped here too, via the SAME exported helper the spell path uses, because 8 of
  // the 14 carriers are Auras/enchantments (Spider Climb, Mystic Veil, Soar, Timely Ward, Mystical Tether...)
  // and never reach parseEffectProgram at all. One regex, two callers, so they cannot drift apart. See the
  // note on FLASH_PERMISSION_LINE in textNormalize.js for the runtime evidence that it is vacuous here.
  const deLined = stripDiscardCostAbilityLine(stripCounterShieldLine(stripFlashPermissionLine(
    stripShuffleInsteadLine(stripPartnerWithLine(String(oracle || "").replace(ESCAPE_LINE, " ").replace(ESCAPE_WITH_COUNTERS, " ").replace(TURNED_FACE_UP, " "))),
  )), { name });
  let t = stripReminder(deLined).toLowerCase().replace(/[’']/g, "'");
  // MULTI-INSTANCE CASCADE (CR 702.85) — "Cascade, cascade[, …]" is now MODELED (detectTriggers emits N cascade
  // triggers, each an independent dig; see cascadeInstanceCount). After stripReminder it splits into N covered
  // "cascade" clauses on the comma, each matching the "cascade" COVERED_KEYWORD, so a keyword-only body like Apex
  // Devastator reads keyword-only here just as a single-cascade body does — no special-case guard needed.
  if (name) {
    const n = String(name).toLowerCase().replace(/[’']/g, "'").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (n) t = t.replace(new RegExp(`\\b${n}\\b`, "g"), "this creature");
    // LEGENDARY SHORT NAME (CR 201.4b-adjacent oracle convention): a comma-carrying legend refers to
    // itself by its PRE-COMMA short name ("Toski attacks each combat if able" on "Toski, Bearer of
    // Secrets"), so normalize that form too. FN-safe by construction: a mangled non-self clause just
    // fails the keyword allowlist below (body-only), never credits anything new.
    const shortN = String(name).split(",")[0].toLowerCase().replace(/[’']/g, "'").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (shortN && shortN !== n) t = t.replace(new RegExp(`\\b${shortN}\\b`, "g"), "this creature");
  }
  if (!t.trim()) return true; // vanilla
  // Split on SENTENCE boundaries (. ! ?) too — not just , ; \n and. Otherwise a trailing non-keyword
  // sentence glued on by a strip ("flying  scry 1.") is swallowed whole by `startsWith("flying ")`
  // and mis-credited as keyword-only. Splitting on the period forces "scry 1" to stand alone and fail.
  // The `(?!\/or\b)` lookahead keeps the oracle idiom "and/or" INTACT (BLITZ EV-3 — Amrou Seekers'
  // "artifact creatures and/or white creatures" must reach isEnforcedEvasionClause whole; shredding it at
  // "and" left an uncreditable "/or …" fragment). Safe against over-credit: a 2026-07-17 full-corpus sweep
  // found ZERO "and/or"-carrying clauses that begin with a COVERED_KEYWORD (the startsWith credit), and every
  // other credit test is ^…$-anchored, so a newly-whole "and/or" clause can only match the compound
  // except-by matcher built for it.
  const clauses = t.split(/[,;.!?\n]|\band\b(?!\/or\b)/).map((c) => c.trim()).filter(Boolean);
  return clauses.every((c) =>
    COVERED_KEYWORDS.some((k) => c === k || c === `${k}.` || c.startsWith(`${k} `)) ||
    isEnforcedEvasionClause(c) ||
    reCyclingCost.test(c) ||
    reCyclingLifeCost.test(c) ||
    reWardLifeCost.test(c) ||
    reMorphCost.test(c) ||
    reSneakCost.test(c) ||
    reDashCost.test(c) ||
    reDisguiseCost.test(c) ||
    reAltCastKeywordCost.test(c) ||
    reVacuousAltCastCost.test(c) || // miracle / prowl / surge / flashback — parity with the spell-side strip
    reSpectacleCost.test(c) || // SPECTACLE (CR 702.137a) — an alternative cost the engine never offers
    reMadnessCost.test(c) || // MD-1 — madness on a permanent: a discard-window cast option, vacuous for the hard-cast (the spell path's versioned strip, the ninjutsu/morph rationale)
    rePrototypeCost.test(c) ||
    reNinjutsuCost.test(c) ||
    rePartnerBare.test(c) ||
    // ZONE-OPTION / OPTIONAL-COST family (census slice 2026-07-24 — see the block comment above the consts)
    reGyZoneOptionCost.test(c) ||
    reReinforceCost.test(c) ||
    reBloodthirstFixed.test(c) ||
    reDevourFixed.test(c) ||
    reAmplifyFixed.test(c) ||
    reFirebendingFixed.test(c) ||
    reDredgeCost.test(c) ||
    reOptionalAddlCost.test(c) ||
    reImproviseBare.test(c) ||
    reTypecyclingCost.test(c) ||
    // MUST-ATTACK (subsystem 4, CR 508.1a) — "this creature attacks each combat/turn if able" (the card
    // name was already normalized to "this creature" above). ENFORCED in opponentAI.pickAttackPlan (the
    // creature is force-declared as an attacker when able), so it's a modeled static, not residue.
    /^this creature attacks each (?:combat|turn) if able$/.test(c) ||
    // LURE (BLITZ LU-1, CR 509.1c) — "all creatures able to block this creature do so" (Taunting Elf /
    // Prized Unicorn / Elvish Bard / Breaker of Armies). ENFORCED in opponentAI.pickBlockers: every
    // legal blocker of a lure-carrying attacker is force-assigned before the value heuristic — the SAME
    // versioned bar as MUST-ATTACK above (AI seats comply; the human seat is never hard-gated). The
    // sentence carries no split characters, so it reaches this per-clause test whole; any variant scope
    // ("…able to block target creature…" — the spell form) or rider fails the exact anchor → residue.
    /^all creatures able to block this creature do so$/.test(c),
  );
}

// KW-NINJUTSU (CR 702.49) — credit a clause ONLY when it's the bare "ninjutsu {cost}" activated-ability
// cost line (optionally "commander "/"library " prefixed), mirroring the cycling gate's exact-shape
// discipline. Ninjutsu is an ALTERNATIVE way to put the creature onto the battlefield (return an unblocked
// attacker to hand → the ninja enters tapped and attacking) — it is NOT enforced/offered by the engine yet.
// Crediting it is safe under the metric-is-decoupled-from-runtime rule (classifyCard has ZERO runtime
// consumers — a mis-class is a metric over-count, never a gameplay FP) AND under CREED: every ninjutsu card
// in the index ALSO carries a normal mana cost, so the engine can hard-cast it and resolve its body
// CORRECTLY — the only unmodeled part is the optional cheaper entry, which can never mis-resolve / mis-count
// / drop a payoff clause / fabricate. The remaining oracle text (the combat-damage trigger, any keyword) is
// still validated all-or-nothing by the caller (permanentTriggersCovered / the composite gate): a ninja
// whose OTHER ability is unmodeled (Silver-Fur Master's static cost-reducer, Higure's tutor, Sakashima's
// Student's clone) keeps that residue and stays body-only. Anchored ^…$ with a brace-cost tail, so it can
// ONLY match a true cost line — never Silver-Fur's "ninjutsu abilities you activate cost {1} less…",
// Satoru's "each creature card in your hand has ninjutsu {…}" grant, his "whenever you activate a ninjutsu
// ability" trigger, or Monet's "if Monet was ninjutsu'd" conditional (none end in a brace cost right after
// "ninjutsu ").
const reNinjutsuCost = /^(?:commander |library )?ninjutsu (?:\{[^}]+\})+$/;
// LINE-level twin of reNinjutsuCost, for the CLONE pre-strip further down. Same anchored shape and the same
// three exclusions, but it must tolerate the printed reminder parenthetical: the clone path strips whole
// LINES off the RAW oracle, whereas isKeywordOnly tests clauses that have already had reminders removed.
// ⭐ ONE CLAUSE HERE, A WHOLE LINE THERE — the escape slice's lesson, and the reason a keyword credited in
// one residue path does not automatically reach another.
const NINJUTSU_COST_LINE = /^[ \t]*(?:commander |library )?ninjutsu (?:\{[^}]+\})+[ \t]*(?:\([^)]*\))?[ \t]*$/i;
/** Drop bare "Ninjutsu {cost}" lines (reminder included) — never Silver-Fur's cost-reducer or Satoru's grant. */
function stripNinjutsuCostLines(oracle) {
  const raw = String(oracle || "");
  const lines = raw.split("\n");
  const kept = lines.filter((ln) => !NINJUTSU_COST_LINE.test(ln));
  return kept.length === lines.length ? raw : kept.join("\n").trim();
}

// KW-MORPH / KW-MEGAMORPH (CR 702.37 / 702.109) — credit a clause ONLY when it's the bare "morph {cost}" /
// "megamorph {cost}" line (keyword + one or more brace mana symbols), mirroring the cycling/ninjutsu gate's
// exact-shape discipline. Morph is an ALTERNATIVE way to play the card (cast face down as a vanilla 2/2 for
// {3}, then turn it face up for its morph cost) — it is NOT offered/enforced by the engine (legalChoices has
// no morph lane; the tier-gated alt-cast lanes there are all mechanic-specific — adventure/plot/emerge/kicker/
// bestow — and none fire for a morph card). Every morph card ALSO carries a normal mana cost, so the engine
// hard-casts it FACE UP and resolves its body CORRECTLY; the only unmodeled part is the optional face-down
// entry, which can never mis-resolve / mis-count / drop a payoff / fabricate — the SAME rationale that credits
// ninjutsu. The megamorph "+1/+1 counter when turned face up" only ever applies on that unused face-down path,
// so it changes nothing about the face-up cast. The caller still validates all OTHER text all-or-nothing: a
// morph card with a "When ~ is turned face up, <effect>" trigger keeps that residue and stays body-only.
// Anchored ^…$ with a brace-cost tail, so a non-mana morph ("Morph—Reveal a … card") or a morph-referencing
// static ("Morph abilities you activate cost {1} less") never matches → body-only (a SAFE false-negative).
const reMorphCost = /^(?:mega)?morph (?:\{[^}]+\})+$/;

// KW-SNEAK (Tarkir: Dragonstorm) — credit a clause ONLY when it's the bare "sneak {cost}" line (keyword + one
// or more brace mana symbols), mirroring the cycling/ninjutsu/morph exact-shape discipline. Sneak is an
// ALTERNATIVE way to cast the card (for its sneak cost, if you also return an unblocked attacker you control to
// hand during the declare-blockers step; it enters tapped and attacking) — it is NOT offered/enforced by the
// engine (no sneak lane in legalChoices). Every sneak card ALSO carries a normal mana cost, so the engine
// hard-casts it normally and its body resolves CORRECTLY; the only unmodeled part is the optional sneak entry,
// which can never mis-resolve / mis-count / drop a payoff — the SAME rationale that credits ninjutsu/morph. The
// caller still validates all OTHER text all-or-nothing: a sneak card with an unmodeled sibling ability keeps
// that residue and stays body-only. Anchored ^…$ with a brace-cost tail, so a sneak-referencing static never
// matches. (Reminder text is stripped upstream by isKeywordOnly before the clause split.)
const reSneakCost = /^sneak (?:\{[^}]+\})+$/;

// KW-DASH (CR 702.109) / KW-DISGUISE (CR 702.168) — two more brace-cost ALTERNATIVE-CAST creature keywords,
// credited by the SAME exact-shape discipline as morph/ninjutsu/sneak. DASH: cast for the dash cost → the
// creature gains haste and returns to hand at the next end step. DISGUISE: cast face down for {3} as a 2/2 with
// ward {2}, turn face up for the disguise cost (morph-with-ward). Both are OPTIONAL entries the engine does not
// offer (no dash/disguise lane in legalChoices); every such card ALSO has a normal mana cost, so the engine
// hard-casts it as its printed face-up self and the body resolves correctly — the only unmodeled part is the
// optional alt entry (the haste+bounce for dash / the face-down 2/2 for disguise), which can never mis-resolve.
// The caller still validates all OTHER text all-or-nothing. Anchored ^…$ with a brace-cost tail so a
// keyword-referencing static never matches. A disguise creature with a PURE "when turned face up, <effect>"
// trigger (Mistway Spy) is NOT credited: classifyCondition now leaves that delayed trigger UNDETECTED (it's
// unreachable on a hard cast — see triggers.js), so the shaped trigger sentence out-runs the detected count and
// the card stays body-only. The COMPOUND "enters or is turned face up" ETB (Gadget Technician, Rakish Scoundrel)
// DOES fire on the face-up hard cast, so those correctly flip once disguise is recognized.
const reDashCost = /^dash (?:\{[^}]+\})+$/;
const reDisguiseCost = /^disguise (?:\{[^}]+\})+$/;

// KW-FORETELL (CR 702.143) / KW-BLITZ (CR 702.152) / KW-FREERUNNING (Assassin's Creed) — three more brace-cost
// ALTERNATIVE-CAST keywords credited by the SAME exact-shape discipline as morph/ninjutsu/sneak/dash. FORETELL:
// exile face down for {2}, cast later from exile for the foretell cost. BLITZ: cast for the blitz cost → haste +
// "when it dies, draw a card" + sacrifice at the next end step. FREERUNNING: cast for the freerunning cost if you
// dealt combat damage this turn (Assassin/commander). All are OPTIONAL entries with NO engine lane, and every
// such card ALSO has a normal mana cost, so the engine hard-casts it as its printed self and the body resolves
// correctly — the only unmodeled part is the optional alt entry (the blitz haste+draw+sac / the deferred foretell
// cast), which never applies on a hard cast. The caller still validates all OTHER text all-or-nothing.
const reAltCastKeywordCost = /^(?:foretell|blitz|freerunning) (?:\{[^}]+\})+$/;
// KW-MADNESS on a PERMANENT (BLITZ MD-1, CR 702.35 — Basking Rootwalla / Arrogant Wurm / Gorgon Recluse,
// 21 census carriers blocked by this line alone): madness is a DISCARD-replacement cast option — it does
// NOTHING on the battlefield, and a normal hard-cast resolves the card exactly as printed. The engine
// doesn't offer the discard-window cast (a discarded madness card just goes to the graveyard — the
// unmodeled part is an OPTIONAL alternative entry the player loses, never a mis-resolution), the SAME
// versioned trade the spell path has always shipped (parser.stripCastKeywordLines strips madness-alone
// lines — Fiery Temper is native-spell today) and the same rationale that credits ninjutsu/morph/sneak
// above. The clause split already isolates a compound line's other keywords (each judged on its own gate,
// an unmodeled one → body-only), so only the bare cost clause is credited. Anchored ^…$ brace-cost tail —
// a madness-referencing static/trigger never matches.
const reMadnessCost = /^madness (?:\{[^}]+\})+$/;
// SPECTACLE (CR 702.137a) / ESCAPE (CR 702.138a) — the PERMANENT-side twins of credits the spell path has
// carried for a while (both keywords are already in CAST_KEYWORD_LINE over in textNormalize.js; nothing
// credited them here, so an aura or creature printing one parked on the keyword line alone).
//
// Both are the established vacuous-alt-entry shape, verified against the CR rather than assumed:
//   SPECTACLE 702.137a — "You may pay [cost] rather than pay this spell's mana cost if an opponent lost
//     life this turn." A pure ALTERNATIVE COST; the card is fully castable at its printed cost and the
//     permanent that results is identical. The engine never offers the alt entry — a missing OPTION, never
//     a mis-resolution (the foretell/blitz/freerunning rationale above, word for word).
// ⛔ ESCAPE (CR 702.138a) IS *NOT* CREDITED HERE, and the reason is structural rather than a judgement:
// its cost is COMPOUND — "Escape—{2}{B}, Exile two other cards from your graveyard." — and isKeywordOnly
// splits clauses on commas and periods BEFORE testing them, so the line arrives as two fragments and no
// whole-line pattern can ever match it. Crediting the second fragment ("exile two other cards from your
// graveyard") on its own is out of the question: that is a real effect on other cards. Escape needs the
// line removed BEFORE the clause split (the way the spell path does it), which is a different change.
// 5 permanents wait on it: Nethergoyf · Sentinel's Eyes · Escape Velocity · Mogis's Favor ·
// Bloodbraid Challenger (+ Lunar Hatchling, which also needs its basic-landcycling line).
//
// ⛔ ESCAPE'S COST IS COMPOUND and that is why it needs its own pattern rather than joining the brace-cost
// family: it prints as "Escape—{2}{B}, Exile two other cards from your graveyard." — a dash, a mana cost,
// then one or more ADDITIONAL cost clauses. The tail is matched loosely BUT the line must still START with
// the keyword and its dash, so an escape-REFERENCING trigger ("Whenever a creature you control escapes…")
// never matches: it has no leading "Escape—". Lunar Hatchling's "Exile a land you control, Exile five other
// cards…" rides the same tail.
const reSpectacleCost = /^spectacle (?:\{[^}]+\})+$/;
// ===== SPELL/PERMANENT KEYWORD PARITY (sweep 2026-07-30) =====
// A PARITY SWEEP of every cost-carrying entry in CAST_KEYWORD_LINE (the SPELL-side vacuous-line strip)
// against this credit list found SIXTEEN keywords handled on one side and absent from the other. Spectacle
// above was the first one fixed card-by-card; these are the rest of the simple `KEYWORD {cost}` shape that
// actually have permanent carriers. Each is the same vacuous-alt-entry rationale, and each was checked
// against the CR rather than assumed:
//   MIRACLE   702.94a  — "You may reveal this card from your hand as you draw it … cast it for its miracle cost"
//   PROWL     702.76a  — "You may pay [cost] rather than pay this spell's mana cost if a player was dealt combat damage…"
//   SURGE     702.117a — "You may pay [cost] rather than pay this spell's mana cost as you cast it…"
//   FLASHBACK          — the GRAVEYARD re-cast window; credited on the basis the spell path already states
//                        in CAST_KEYWORD_LINE (the runtime never offers the graveyard cast, so the from-hand
//                        cast resolves the printed body identically — a SAFE false-negative).
// In every case the card is fully castable at its printed cost and the resulting permanent is identical, so
// the unoffered alt entry is a missing OPTION, never a mis-resolution.
//
// ⛔ ANCHORED ^…$ ON THE BARE COST LINE, which is what keeps this safe: a keyword-REFERENCING static
// ("Spells with buyback cost {2} less to cast") has more words and can never match, so a card that CARES
// about the keyword is never credited for merely mentioning it.
//
// ⛔ NOT INCLUDED — escape / suspend / awaken. Their costs are COMPOUND ("Escape—{2}{B}, Exile two other
// cards…", "Suspend 3—{1}{U}"), and isKeywordOnly splits clauses on commas and dashes BEFORE testing, so no
// whole-line pattern can reach them. They need the LINE removed before the split, which is a different
// change; 10 permanents wait on it (escape 6 · suspend 3 · awaken 1).
const reVacuousAltCastCost = /^(?:miracle|prowl|surge|flashback) (?:\{[^}]+\})+$/;

// KW-PROTOTYPE (CR 702.161) — an artifact creature with a SECOND, smaller castable profile ("Prototype {cost} —
// X/Y (…different mana cost, color, and size; keeps its abilities and types)"). Hard-casting at the printed
// (full) cost yields the printed (full) creature — the prototype profile is the OPTIONAL cheaper entry the engine
// never takes — so recognizing the line is CREED-safe (the ninjutsu/morph rationale). Anchored on the "{cost} —
// X/Y" shape so it can only match a true prototype line.
const rePrototypeCost = /^prototype (?:\{[^}]+\})+ [—–-] \d+\/\d+$/;

// ===== ZONE-OPTION / OPTIONAL-COST KEYWORD FAMILY (census slice, 2026-07-24) ==========================
// Ten keywords from the residue census's top clusters, every one credited on the SAME blessed test the
// ninjutsu/morph/madness/flashback/transmute precedents shipped with: the keyword's entire text is an
// OPTIONAL entry, payment, or zone-option with NO engine lane, and a normal hard-cast resolves the card
// byte-identically to its printed self — the unmodeled part is an option the player loses (a safe FN),
// never a mis-resolution (the forbidden FP). The caller still validates every OTHER clause all-or-nothing,
// so a carrier whose second ability is unmodeled stays body-only regardless of these credits.
//
// GY/hand ZONE-OPTIONS (the flashback/transmute rationale — an ability usable only from a non-battlefield
// zone the engine never offers; on the battlefield the line is inert):
//   evoke (CR 702.74 — alt cost whose sac-on-ETB applies ONLY to an evoked cast; hard-cast = normal body)
//   unearth (702.84 — GY-activated one-shot return; census #1 sole-blocker at 18)
//   disturb (702.146 — cast transformed from GY) · embalm (702.128) · scavenge (702.96 — GY-activated
//   counters) · mayhem (discarded-this-turn GY cast window)
//   eternalize (702.129, ADDED 2026-07-25 with the audit its first pass deferred): embalm's exact twin —
//   exile from the GY for a token copy. Audited per the suspend rule: of 11 carriers only Lazotep Archway
//   lacks a mana cost, and it's a LAND (played, not cast) — so every carrier is normally playable and the
//   keyword is a pure extra option. (Suspend stays refused: its no-mana-cost carriers CANNOT be played at all.)
//   encore (702.130, ADDED 2026-07-27): "{cost}, Exile this card from your graveyard: For each opponent,
//   create a token copy that attacks that opponent this turn if able." A GY-activated ability in the exact
//   unearth/scavenge class — while the creature is on the BATTLEFIELD, the only place the engine plays it,
//   the line is inert. Audited per the suspend rule: ALL 26 carriers are creatures with a printed mana cost
//   (zero exceptions, not even a land), so every one is normally castable and encore is a pure extra option.
const reGyZoneOptionCost = /^(?:evoke|unearth|disturb|embalm|eternalize|scavenge|mayhem|encore) (?:\{[^}]+\})+$/;
// REINFORCE N—{cost} (CR 702.77) — a HAND-only discard-activated ability ("{cost}, Discard this card: Put N
// +1/+1 counters on target creature"), the cycling/typecycling class: an option from hand the engine never
// offers, so the card on the battlefield plays exactly as printed. Same castability audit as eternalize —
// of 9 carriers only Rustic Clachan lacks a mana cost, and it too is a LAND. The number-then-em-dash shape
// mirrors the prototype/suspend templating; anchored so a reinforce-referencing static can never match.
const reReinforceCost = /^reinforce \d+\s*[—–-]\s*(?:\{[^}]+\})+$/;
// KW-BLOODTHIRST (CR 702.54) — credited ONLY for a FIXED digit count, mirroring the cycling gate's
// exact-shape discipline: entersWithConditionalCounters synthesizes {n, condition} from "Bloodthirst N"
// and resolvers.js places those counters as the creature enters, so the keyword is genuinely enforced.
// "Bloodthirst X" (Petrified Wood-Kin — X = damage dealt to your opponents this turn) is DELIBERATELY
// excluded: the synthesizer returns null for it, so a startsWith-style credit would mark the card native
// while the runtime placed nothing. Caught by this slice's own per-flip audit before it shipped.
const reBloodthirstFixed = /^bloodthirst \d+$/;
// devour N (CR 702.81a, census slice 53) — "As this creature enters, YOU MAY sacrifice any number of
// creatures. It enters with that many +1/+1 counters on it." (×N for devour 2/3.) The optional-mode family's
// reasoning, in its purest form: sacrificing ZERO creatures is a legal choice, and "that many" is then zero,
// so the permanent enters exactly as printed. Squad's twin — pay zero times, get zero copies.
//
// Digit-anchored for the same reason as bloodthirst directly above: a hypothetical "Devour X" would be a
// dynamic amount, and the anchor must keep refusing it rather than crediting a number nobody can compute.
const reDevourFixed = /^devour \d+$/;
// amplify N (CR 702.37a, census slice 53) — "As this creature enters, REVEAL ANY NUMBER of cards from your
// hand that share a creature type with it. This creature enters with N +1/+1 counters on it for each card
// revealed this way." Devour's hand-side twin: revealing zero is a legal choice, "for each card revealed"
// is then zero, and the creature enters exactly as printed. Digit-anchored like devour/bloodthirst.
const reAmplifyFixed = /^amplify \d+$/;
// firebending N (census slice 41) — "Whenever this creature attacks, add {R}. This mana lasts until end of
// combat." ENFORCED: detectTriggers synthesizes the self-scoped attacks descriptor and misc.js resolves it to
// the add-mana atom carrying the end-of-combat hold, so the mana is really added AND really survives the rest
// of combat. Digit-anchored for the same reason as bloodthirst above: "Firebending X, where X is this
// creature's power" is a dynamic amount the atom cannot express, and it must keep failing this gate.
const reFirebendingFixed = /^firebending \d+$/;
// dredge N (CR 702.52) — a REPLACEMENT OPTION on draws while in the GY ("instead of drawing, return this
// and mill N"). Never offered → every draw stays a normal draw, resolution faithful. Digit tail, not brace.
const reDredgeCost = /^dredge \d+$/;
// OPTIONAL ADDITIONAL COSTS at cast (CR 702.33 kicker / 702.174 offspring): unpaid = the printed base mode,
// which IS a complete, real game mode (an unkicked Skizzik is exactly what the card says it is). The engine
// never pays them → base mode always → faithful. A body clause conditioned on kicked-ness ("if it was
// kicked") is a SEPARATE clause judged on its own gate — crediting the cost line cannot force-flip those.
// SQUAD (CR 702.152a, census slice 47) joins the family on exactly the same reasoning: "Squad {2} (As an
// additional cost to cast this spell, you may pay {2} any number of times. When this creature enters, create
// that many tokens that are copies of it.)" — the ENTIRE ability lives in the reminder, and paying zero times
// is the printed base mode: a real, complete creature with no token copies. The engine never pays optional
// additional costs, so "that many" is always zero and the resolution is faithful, not approximated.
const reOptionalAddlCost = /^(?:kicker|multikicker|offspring|squad) (?:\{[^}]+\})+$/;
// IMPROVISE (CR 702.126) — convoke's artifact twin, pure cost-reduction (tap artifacts to help pay).
// The spell-side strip already ships convoke/affinity on exactly this basis (parseHelpers
// COST_ONLY_KEYWORD_LINE); this is the permanent-side mirror for artifact creatures (Fen Hauler).
const reImproviseBare = /^improvise$/;
// TYPECYCLING (CR 702.29e-f — plains/island/swamp/mountain/forest/land/basic-landcycling + the tribal
// slivercycling/wizardcycling): the same hand-only discard-activated option as cycling (already credited
// above), tutoring the named type instead of drawing. Never offered → the card in hand plays as printed.
// Curated alternation, brace-cost tail — a typecycling-cost-reducer static never matches.
const reTypecyclingCost = /^(?:plains|island|swamp|mountain|forest|land|basic land|sliver|wizard)cycling (?:\{[^}]+\})+$/;

// KW-PARTNER (CR 702.124a) — credit ONLY the EXACT bare "partner" keyword (reminder text already stripped by
// isKeywordOnly). Partner is a DECKBUILDING keyword ("you can have two commanders if both have partner"),
// FULLY modeled at the command zone (cmdPartner — commandersOf seats BOTH partners; the per-commander cast tax
// and per-commander damage track them independently). On the battlefield it is a no-op keyword with no clause
// to drop, so a permanent whose only residue is the bare "partner" line is fully played. EXACT-anchored so it
// can never match "partner with <name>" (CR 702.124f — a LINKED partner-tutor ETB the engine does NOT model,
// which must stay body-only), "friends forever", or "choose a background" (all carry extra unmodeled text).
// ⭐ THE WHOLE COMMAND-ZONE PAIRING FAMILY, not just bare "partner" (CR 702.124 / 702.139–702.141). Corpus
// reminder text, read rather than recalled, shows every one of these is a pure DECK-CONSTRUCTION rule:
//     "Partner—Friends forever   (You can have two commanders if both have this ability.)"
//     "Choose a Background       (You can have a Background as a second commander.)"
//     "Doctor's companion        (You can have two commanders if the other is the Doctor.)"
// None changes anything during a game, and the engine never parses them to decide seating: `commanderCards`
// arrives from the DECK DEFINITION and createPlayerState seats whatever it is given. So they are inert here
// for the same reason bare "partner" is — no clause is being dropped, which is why crediting them cannot
// become a claimed-native no-op.
//
// ⛔ "PARTNER WITH <name>" IS DELIBERATELY EXCLUDED and must stay so. Its reminder is
//     "(When this creature enters, target player may put <name> into their hand from their library…)"
// — a REAL linked ETB tutor (CR 702.124f) the engine does not model. Crediting it would drop an effect.
// The old comment here also lumped "friends forever" and "choose a background" in with it as "carrying extra
// unmodeled text"; the corpus says otherwise, and that mistake parked 19 "Partner—" cards plus the whole
// Background cycle — most of the Halfshell heroes deck's commanders among them.
// The label alternation is corpus-derived, not guessed: every "Partner—X" line in the index carries the
// IDENTICAL reminder "(You can have two commanders if both have this ability.)" across exactly four labels —
// Friends forever, Character select, Survivors, and "Father & son". The `&` in that last one is why the
// character class is not just [a-z' ]; leaving it out silently dropped two cards.
const rePartnerBare = /^(?:partner|partner—[a-z'& ]+|friends forever|choose a background|doctor's companion)$/;

// KW-CYCLING — credit a clause ONLY when it's "cycling {cost}" (the keyword + one or more brace mana
// symbols), mirroring the engine's parseCyclingCost (effects/abilities.js) EXACTLY so the metric never
// over-claims past what actionDispatcher.applyCycle enforces. A bare "cycling " prefix is NOT enough:
// Fluctuator's static "cycling abilities you activate cost {2} less to activate" has no brace cost
// immediately after "cycling" → no match → body-only. Typecycling (landcycling/plainscycling/…) never
// starts with "cycling " and a cycle-trigger leaves residue, so both already stay body-only.
const reCyclingCost = /^cycling (?:\{[^}]+\})+$/;
// LIFE-COST CYCLING (Street Wraith — "Cycling—Pay 2 life.", SHELF S7): credited ONLY because the
// runtime models it end-to-end (parseCyclingLifeCost → the cycle action's lifeCost → applyCycle pays
// via loseLife, CR 118.8). Mirrors the em-dash Ward—pay-life convention below.
const reCyclingLifeCost = /^cycling\s*[—–-]\s*pay \d+ life$/;

// KW-WARD-COST (CR 702.21) — the generic COVERED_KEYWORDS "ward" match above only fires on "ward {cost}" /
// "ward N" (a SPACE after "ward"), so the em-dash "Ward—<cost>" forms miss it and read body-only. Credit ONLY
// "ward—pay N life": its soft-counter tax is FULLY enforced today — ward.js parseWardCost returns {kind:"life"},
// wardTaxForStackObject raises the pay-or-be-countered pause at both cast + ability chokepoints, and
// runProgram.settleSoftCounterCost pays it via loseLife (proven end-to-end). Anchored to the SAME shape
// parseWardCost matches (ward.js — /ward\s*[—-]\s*pay\s+\d+\s+life/) so the metric never out-runs enforcement.
// Ward—Discard / Ward—Sacrifice deliberately do NOT match here: parseWardCost returns null for them (the binary
// soft-counter pause can't express a "which card/permanent?" victim sub-choice — ward.js), so they stay
// body-only (a SAFE false-negative, never a mis-resolved tax). The caller still validates all OTHER text
// all-or-nothing, so a ward-pay-life card with an unmodeled ability keeps that residue and stays body-only.
const reWardLifeCost = /^ward\s*[—-]\s*pay \d+ life$/;

/**
 * True when a permanent's tap produces mana — the mana system taps rocks/dorks
 * generically, so its primary role plays even if a secondary ability doesn't.
 *
 * Reminder text (parentheses) is STRIPPED first (CR 207.2 — reminder text is never
 * rules-bearing): otherwise a token-MAKER whose only "Add … mana" text lives inside the
 * reminder describing the token it creates ("…create a Treasure token. (It's an artifact
 * with "{T}, Sacrifice this token: Add one mana of any color.")" — Mahadi, Brazen Freebooter)
 * would be mis-claimed native-mana even though the permanent itself has NO mana ability and
 * its real ETB/trigger is unmodeled. A genuine mana source states its ability in the main
 * text, so stripping the reminder never drops a real rock/dork (matches the parser, which
 * strips reminders before matching).
 */
// ENERGY-GATED MANA (CR 122.1e) — remove any mana ability whose activation cost includes "Pay {E}": energy is
// not yet an enforced cost, so a "{T}, Pay {E}: Add one mana of any color" line is NOT free mana and must not
// credit native-mana (Servant of the Conduit's ONLY mana ability is energy-gated → it would read as a free
// dork). An energy-FREE line on the SAME card (Aether Hub's "{T}: Add {C}") survives the strip, so the card
// keeps its legitimate native tier. Segment-anchored ([^.\n] cost) so it removes exactly the gated ability, not
// a neighboring free one. (Slice-B pay enforcement will make manaProduction energy-aware and relax this.)
function stripEnergyGatedManaLines(oracle) {
  return String(oracle || "").replace(/[^.\n]*\bpay (?:\{e\})+[^.\n:]*:\s*add\b[^.\n]*\.?/gi, " ");
}

// COUNTER-COST MANA (Druids' Repository — SHELF S7 audit catch): remove any mana ability whose activation
// cost includes "Remove a/N <type> counter(s)": the runtime produces mana ONLY through manaProduction
// (which returns null for these — a counter-removal cost is not a standing source) and the activated lane
// excludes isManaEffect abilities from the stack path, so such a line is DEAD at runtime and must not
// credit native-mana (the exact energy-gate precedent above; a counter-free mana line on the same card
// survives the strip). When a counter-cost mana subsystem lands in manaProduction, relax this with it.
function stripCounterCostManaLines(oracle) {
  return String(oracle || "").replace(/[^.\n]*\bremove (?:a|an|one|two|three|\d+|x) [a-z+\-/0-9]+ counters?[^.\n:]*:\s*add\b[^.\n]*\.?/gi, " ");
}

export function hasManaAbility(oracle, typeLine) {
  // Strip a created token's quoted ability before reading the card's OWN mana — a token's "…Add …"
  // belongs to the token, not the card (mirrors manaModel.manaProduction, so the classifier and runtime
  // agree). Without this, an Eldrazi Spawn-maker is mis-tiered native-mana before its real trigger is
  // even checked (this tier is read at line ~341, ahead of permanentTriggersCovered).
  // Then strip a GROUP-GRANT's quoted ability unless the card self-includes in the grant scope
  // (stripNonSelfQuotedGrants — the Cryptolith Rite phantom-granter fix, mirrored from manaProduction so
  // the metric and the runtime mana model agree). Callers that can't supply a type line get the
  // conservative strip — an under-count, never an over-claim.
  const t = stripCounterCostManaLines(stripEnergyGatedManaLines(stripNonSelfQuotedGrants(stripCreatedTokenAbilities(stripReminder(oracle)), typeLine)));
  return /\badd \{[wubrgcx]/i.test(t) ||
    /\badd (one|two|three|four|five|that much|an amount|\{)/i.test(t);
}

// VARIABLE-X MANA (the "Add X mana of any one color, where X is <metric>" family — Sanctum Weaver,
// Matzalantli, Baldur's Gate). `hasManaAbility` above deliberately does NOT match the bare "add x mana"
// form: an X-amount is native ONLY when the metric is one the RUNTIME can actually compute, else the
// source produces ZERO mana natively (a genuine over-claim, not a false negative — exactly the trap the
// FIX-MANA-OVERCLAIM note documents for triggered-mana). So instead of broadening the regex (which would
// also catch the cards whose metric is unmodeled — Wirewood Channeler's "Elves on the battlefield",
// Accomplished Alchemist's "life gained this turn"), we ask
// the SAME manaProduction the runtime taps: it returns an `amountSpec` ONLY when the connector + metric
// (parseManaMetric: "<type> you control" / devotion / greatest-power|toughness among creatures you
// control / the SOURCE's own power) is in its vocabulary, and null otherwise. So this credits EXACTLY the variable-X sources the
// engine produces mana for — metric and runtime in lockstep, never an over-claim (an unmodeled-metric X
// source stays body-only, a SAFE false-negative). Pure (manaProduction is filesystem-free). The bare
// "add x mana" guard keeps a non-mana card with a coincidental "X" out (it never reaches manaProduction).
function hasModeledVariableXMana(card) {
  // DFC GUARD (CR 712) — a transforming/modal DFC ("Saga // Creature", "Artifact // Land") whose mana
  // ability lives on the BACK face (The Legend of Kyoshi // Avatar Kyoshi; Matzalantli // The Core) is
  // cast/played as its FRONT face; the back-face "{T}: Add X mana …" is reachable only AFTER an unmodeled
  // transform, so crediting it native-mana would be an over-claim (the runtime produces ZERO mana from the
  // front). manaProduction scans the COMBINED oracle, so it can't tell which face the ability is on — the
  // type line's "//" is the DFC tell. Exclude every "//" card here (the rare DFC whose FRONT is the mana
  // source is a SAFE false-negative — under-claim, never an over-claim). CREED.
  if (/\/\//.test(String(card?.type || card?.type_line || ""))) return false;
  const oracle = stripCreatedTokenAbilities(stripReminder(String(card?.oracle || card?.oracle_text || "")));
  if (!/\badd x mana\b/i.test(oracle)) return false;            // not the variable-X form → not this tier
  const prod = manaProduction(card);
  return !!prod?.amountSpec;                                     // native ONLY when the runtime models the metric
}

// DOUBLE-MANA-POOL (Doubling Cube — "{3}, {T}: Double the amount of each type of unspent mana you have.").
// This is a MANA ability (CR 605.1a) the runtime now plays natively OFF the stack (legalChoices.actions-
// DoubleManaPool → actionDispatcher.applyDoubleManaPool doubles the activator's pool). hasManaAbility keys on
// "Add …" and misses this doubling wording, so it's admitted to the native-mana tier separately. Read the
// SAME parseActivatedAbilities the runtime enumerates on (its `doubleManaPool` marker) — so the metric credits
// EXACTLY the ability the runtime resolves, never drifting. `type_line` fallback matches the parser's card
// shape. Any card with such a modeled ability qualifies; the caller's manaCardResidueModeled gate still
// requires the REST of the card (any trigger/level text) to be modeled too, so this can't over-claim a card
// whose non-mana body is unmodeled (Doubling Cube has none — its whole text IS this one ability).
function hasDoubleManaPoolAbility(card) {
  return parseActivatedAbilities(card).some((a) => a.doubleManaPool);
}

/** True when an instant/sorcery resolves fully through the EffectProgram interpreter. */
export function spellIsNative(card) {
  // STORM (CR 702.40): an instant/sorcery can carry the "Storm" KEYWORD ("Storm (When you cast this spell, copy
  // it for each spell cast before it this turn. …)"). The keyword is a triggered ability modeled SEPARATELY from
  // the spell's own effect (triggers.detectTriggers synthesizes a selfCast copy-spell trigger; the runtime fires
  // it in checkCastTriggers and copies the spell N times). So a storm spell is native iff (a) the storm trigger
  // routes natively (copy-spell is HIGH + non-targeted) AND (b) its NON-storm body is itself native. parseEffect-
  // Program strips the whole "Storm (…reminder…)" line internally (the keyword carries no parseable atom of its
  // own — stripReminder would leave a bare "Storm" residue that drags the body to LOW), so the body program below
  // is the storm-free body. A TARGETED storm body (Grapeshot — "copy … you may choose new targets") parses HIGH
  // but a copy of a targeted spell needs new targets the copy atom doesn't choose, so we GATE storm to non-
  // targeted bodies below. Anchored on the keyword's reminder signature so a card merely NAMED "…Storm" without
  // the keyword is untouched. Checked FIRST so the body gate is storm-aware. CREED: an unmodeled body → not
  // native (the whole card stays Arbiter, never a partial).
  if (/\bcopy it for each spell cast before it this turn\b/i.test(String(card.oracle || ""))) {
    const stormTrigs = detectTriggers(card).filter((d) => d.stormCopy);
    if (!stormTrigs.length || !stormTrigs.every(triggerRoutesNatively)) return false; // copy mechanism not modeled → Arbiter
    // parseEffectProgram strips the Storm keyword line, so this is the spell's BODY program (the same one the
    // cast path resolves AND the copy atom snapshots). It must be HIGH for the card to flip.
    const bodyProgram = parseEffectProgram(card);
    if (!bodyProgram || programConfidence(bodyProgram) !== "high") return false;
    // STORM-COPY-TARGET GATE (CR 702.40b / 707.10c) — a copy of a TARGETED spell picks its own targets when
    // it's put on the stack ("You may choose new targets for the copies"). applyCopySpell re-enumerates a fresh
    // legal target per copy via the SAME expandCastChoices + enemy/own chooser the trigger path uses, falling
    // back to the original spell's targets (the CR 707.10c default) when no fresh legal pick exists. So a
    // targeted body flips ONLY when every chosen-target atom is intent-RESOLVABLE — i.e. the chooser can prove
    // a correct-side pick for each copy (deal-damage/lose-life → an opponent; a buff → own). This is exactly
    // programTriggerTargetsResolvable, the gate the trigger-flush path already uses. A targeted body with an
    // AMBIGUOUS atom (bounce, a fight's two-sided target) stays on the Arbiter — the copy chooser can't place
    // it safely, so a SAFE false-negative (never a copy that mis-fires or silently drops its targets). NON-
    // targeted bodies (create-token / gain-life — Empty the Warrens, Chatterstorm) pass trivially (no chosen
    // target). Grapeshot (deal-damage → any target) + Tendrils of Agony (lose-life → target player) now flip;
    // Brain Freeze parks regardless — its targeted-mill body parses LOW (caught by the HIGH gate above).
    if (programNeedsChosenTarget(bodyProgram) && !programTriggerTargetsResolvable(bodyProgram)) return false;
    // Same combat-referent guard as the plain-spell and cascade paths (R1.4, audit 2026-07-09): a storm
    // BODY carrying a damagedPlayer/defendingPlayer/combatDamageAmount referent has no combat context at
    // spell resolution — the clause silently no-ops. Without this, the storm branch credited native a body
    // the plain path correctly parks (verified: the same body without the Storm line returns false).
    for (const a of programCombatReferentAtoms(bodyProgram)) {
      if (a?.who === "damagedPlayer" || a?.countContext === "combatDamageAmount" || a?.countContext === "milledCount" || a?.countContext === "nonlandMilledCount" || a?.countContext === "lifeLostAmount" || a?.countContext === "lifegainAmount" || a?.who === "lifeLostPlayer" || a?.op === "draw-or-counter-triggering" || a?.who === "untappedController" || a?.who === "gyOwner" || atomCarriesEventReferent(a)) return false;
      if (a?.who === "defendingPlayer") return false;
    }
    return true;
  }
  // CASCADE (CR 702.85): an instant/sorcery can carry the "Cascade" KEYWORD ("Cascade (When you cast this spell,
  // exile cards … a nonland card that costs less. You may cast it without paying its mana cost. …)"). Like Storm
  // it's a triggered ability modeled SEPARATELY from the spell's own effect (triggers.detectTriggers synthesizes
  // a selfCast cascade trigger; the runtime fires it in checkCastTriggers, digs, and parks the free-cast/decline
  // decision). So a cascade spell is native iff (a) the cascade trigger routes natively (the `cascade` atom is
  // HIGH + non-targeted) AND (b) its NON-cascade body is itself native. Strip the whole "Cascade (…reminder…)"
  // LINE before parsing the body (the bare "Cascade" residue would drag an otherwise-HIGH spell to LOW — the
  // keyword carries no parseable atom of its own). Anchored on the canonical self-cascade reminder signature so a
  // card merely NAMED "…Cascade" without the keyword is untouched. MULTI-INSTANCE cascade ("Cascade, cascade" —
  // Call Forth the Tempest, Throes of Chaos) is now MODELED: detectTriggers emits N independent cascade triggers
  // (cascadeInstanceCount), each digging separately at the SAME spell-MV cap — so an N-cascade spell is native on
  // the same terms as a 1-cascade spell (native cascade trigger(s) + native non-cascade body). Checked before the
  // cost-only/Plot strips so the body gate is cascade-aware. CREED: an unmodeled body → not native (the whole card
  // stays Arbiter, never a partial).
  if (/\bwhen you cast this spell, exile cards from the top of your library until you exile a nonland card that costs less\b/i.test(String(card.oracle || ""))) {
    const cascadeTrigs = detectTriggers(card).filter((d) => d.cascade);
    if (!cascadeTrigs.length || !cascadeTrigs.every(triggerRoutesNatively)) return false; // dig mechanism not modeled → Arbiter
    // Strip the Cascade keyword LINE (the line carrying the reminder), then parse the bare body. It must be HIGH
    // (and non-cascade — the cascade atom is the trigger's payload, never part of the spell's own program).
    const cascadeStripped = String(card.oracle || "")
      .split("\n")
      .filter((line) => !/\bexile a nonland card that costs less\b/i.test(line) && line.replace(/\([^)]*\)/g, "").trim().toLowerCase() !== "cascade")
      .join("\n").trim();
    const bodyProgram = parseEffectProgram({ type: card.type, oracle: stripCostOnlyKeywordLines(cascadeStripped), mana: card.mana, name: card.name });
    if (!bodyProgram || programConfidence(bodyProgram) !== "high") return false;
    // Same combat-referent guard as the normal spell path (a spell never supplies the combat-damage referent).
    // Flattened via programCombatReferentAtoms so a MODAL mode-level referent can't slip through.
    for (const a of programCombatReferentAtoms(bodyProgram)) {
      if (a?.who === "damagedPlayer" || a?.countContext === "combatDamageAmount" || a?.countContext === "milledCount" || a?.countContext === "nonlandMilledCount" || a?.countContext === "lifeLostAmount" || a?.countContext === "lifegainAmount" || a?.who === "lifeLostPlayer" || a?.op === "draw-or-counter-triggering" || a?.who === "untappedController" || a?.who === "gyOwner" || atomCarriesEventReferent(a)) return false;
    }
    return true;
  }
  // PLOT (CR 702.171): an instant/sorcery can carry a "Plot {cost}" alternate-cast line. It's a modeled
  // special action (exile at sorcery speed for the plot cost, cast FREE later), and a plotted spell resolves
  // through the SAME cast path — so the spell is native iff its actual EFFECT is native. Strip the plot line
  // (when parsePlotCost confirms a clean modeled cost) before parsing, so the bare "Plot {cost}" residue
  // doesn't drag an otherwise-HIGH spell down to LOW. parsePlotCost is null for plot-trigger / plot-granting
  // cards, so those are never stripped (CREED whole-card).
  const plotStripped = parsePlotCost(card)
    ? String(card.oracle || "").replace(/(?:^|\n)[^\n]*\bplot\s+(?:\{[^}]+\})+[^\n]*(?=\n|$)/i, "\n")
    : card.oracle;
  // CONVOKE / AFFINITY (cost-only keywords): strip the standalone keyword line so the spell's EFFECT is parsed
  // on its own. The runtime hard-casts at full printed cost and resolves the body identically — the unmodeled
  // discount can never mis-resolve (THE CREED, mirroring the Ninjutsu/Cycling cost gates). Harmonized Crescendo
  // ("Convoke\nChoose a creature type. Draw a card for each permanent you control of that type.") then parses
  // HIGH on its chosen-type count-draw atom → native-spell. (OVERLOAD is stripped EARLIER by the parser's
  // CAST_KEYWORD_LINE family — its printed single-target mode is the one the engine casts, so the "each"
  // rewrite is vacuous for a normal cast — so Damn/Cyclonic Rift/etc. parse HIGH here on their printed body.)
  const oracle = stripCostOnlyKeywordLines(plotStripped);
  const program = parseEffectProgram({ type: card.type, oracle, mana: card.mana, name: card.name });
  if (!program || programConfidence(program) !== "high") return false;
  // COMBAT-REFERENT SPELL GUARD (CR 510) — an atom whose referent is the just-combat-damaged player
  // (who:"damagedPlayer") or the combat-damage amount (countContext:"combatDamageAmount") is supplied ONLY by
  // a combat-damage trigger (ctx.damagedPlayerId / ctx.combatDamageAmount, set by checkCombatDamageTriggers).
  // A SPELL never supplies them, so such an atom would SILENTLY DROP at resolution (a FORBIDDEN dropped-clause
  // FP, CREED). This mirrors triggerRouting.combatDamageReferentSatisfied (which gates the TRIGGER path) for
  // the spell path: a "That player discards a card" follow-on after a counter (Frightful Delusion) or a
  // damage spell (Ozai's Cruelty) — where "that player" is a back-reference to the countered-spell controller
  // / damaged target, NOT the combat referent — keeps the whole spell on the Arbiter (a SAFE false-negative).
  for (const a of programCombatReferentAtoms(program)) {
    if (a?.who === "damagedPlayer" || a?.countContext === "combatDamageAmount" || a?.countContext === "milledCount" || a?.countContext === "nonlandMilledCount" || a?.countContext === "lifeLostAmount" || a?.countContext === "lifegainAmount" || a?.who === "lifeLostPlayer" || a?.op === "draw-or-counter-triggering" || a?.who === "untappedController" || a?.who === "gyOwner" || atomCarriesEventReferent(a)) return false;
    // who:"defendingPlayer" (CR 509.1a) is the ATTACKS-event referent (ctx.defenderId) — a spell never supplies
    // it, so such an atom would silently drop. Keep the spell on the Arbiter (a SAFE false-negative).
    if (a?.who === "defendingPlayer") return false;
  }
  return true;
}

/**
 * True when a permanent's ENTIRE non-keyword text is triggered abilities the engine
 * now fires natively (P2.8 + the flush-time target chooser): every detected trigger's
 * effect routes through the EffectProgram interpreter (high, non-modal — the same gate
 * `flushTriggers`/`buildTriggerStack` uses, including TARGETED triggers, whose targets
 * the flush chooser binds at stack time), AND nothing else is left after removing the
 * trigger sentences + reminder + keywords (no activated/static residue). This is the
 * common "body + one ETB value/removal trigger" creature — fully native now.
 *
 * Mirrors the runtime exactly: a MODAL trigger (would silently pick a mode) and an
 * INTERVENING-IF trigger (CR 603.4, condition unevaluated at flush) are NOT routed by
 * the engine, so they do NOT count as native.
 */
// triggerRoutesNatively — does ONE detected trigger route natively through the flush stage (HIGH, non-modal,
// target-resolvable, with the intervening-if / upkeep-win carve-outs)? EXTRACTED to triggerRouting.js (a leaf)
// as the SINGLE source of truth, so the runtime group-triggered-grant validator consults the identical gate
// and can't drift from the metric. Imported above; used by permanentTriggersCovered + the composite classifier.

// The When/Whenever/At sentence shape is COUNTED via triggers.js's scanTriggerSentences — the SAME
// quote-aware scanner detectTriggers extracts with (Codex fix #4), so the shaped-sentence count and
// the detected-trigger count read one definition of "a trigger sentence" and cannot desync on a
// quoted granted ability's internal period. (The old TRIGGER_SENTENCE_RE lived here.)

/**
 * Every trigger-shaped sentence on the card is a DETECTED trigger that routes natively.
 * detectTriggers only returns descriptors for events it recognizes (etb/dies/step/attack);
 * an unrecognized trigger sentence is counted by the regex but absent from `detected`, so a
 * count mismatch means there's an unmodeled trigger → the card is NOT fully covered. This
 * closes the residue's blind spot (it strips ALL When/Whenever/At text regardless of model).
 */
function allTriggerSentencesModeled(card, oracle) {
  // Normalize ability-word labels ("Landfall — Whenever …") IDENTICALLY to detectTriggers, so the
  // shaped-sentence count and the detected-trigger count agree (else a landfall card mis-classifies).
  // Strip reminder text (CR 207.2 — no rules meaning) BEFORE counting: a keyword's reminder can contain
  // a "When …" clause that the regex counts as a shaped sentence but is NOT a real trigger (earthbend's
  // "(…When it dies or is exiled, return it to the battlefield tapped.)" reminder inflates the count on
  // Earth Village Ruffians / Haru / Toph). detectTriggers rejects the reminder clause (its referent/effect
  // don't classify), so the shaped count out-runs the detected count → a false body-only. Stripping the
  // reminder can ONLY lower the shaped count, so it never hides a real unmodeled trigger (those are never
  // parenthetical) — strictly FN-safe.
  // BUSHIDO (subsystem 2): detectTriggers synthesizes a trigger from the "Bushido N" KEYWORD (its real
  // trigger sentence lives in stripped reminder text, so it never counts as a shaped sentence). Bump the
  // shaped count for it so shaped === detected holds (the synthesized trigger is validated like any other).
  // STORM (CR 702.40): detectTriggers synthesizes a selfCast trigger from the "Storm" KEYWORD (its real trigger
  // sentence lives in stripped reminder text, so it never counts as a shaped sentence). Bump the shaped count so
  // shaped === detected holds (the synthesized trigger is validated like any other). Keyed on the reminder
  // signature that survives in the RAW oracle (stripReminder removes it from the counting text, so test it before).
  // CASCADE (CR 702.85): detectTriggers synthesizes ONE selfCast trigger PER cascade keyword instance when the
  // card carries the canonical self-cascade reminder ("When you cast this spell, exile cards … a nonland card that
  // costs less"). A MULTI-INSTANCE cascade ("Cascade, cascade, cascade, cascade" — Apex Devastator) emits N
  // triggers, each an independent dig. Its real trigger sentence lives in stripped reminder text, so it never
  // counts as a shaped sentence — bump the shaped count by N (cascadeInstanceCount) so shaped === detected holds.
  // Keyed on the RAW oracle (stripReminder removes the signature, so count before).
  const cascadeKw = cascadeInstanceCount(oracle);
  // AFFLICT (CR 702.131) — like bushido/rampage, the printed "Afflict N" keyword's triggered ability lives in
  // stripped reminder text, so it never counts as a shaped sentence. detectTriggers synthesizes a
  // becomesBlocked descriptor from the keyword; bump the shaped count by 1 so shaped === detected holds. The
  // SAME "have/has afflict" guard detectTriggers uses excludes the GROUP-GRANT form ("Sliver creatures you
  // control have afflict N" — Lazotep Sliver): there the afflict is a static grant to OTHER creatures, not a
  // self-trigger, so it contributes 0 to this bump (and 0 to the detected count — no self becomesBlocked).
  // CUMULATIVE UPKEEP (CR 702.24) — like bushido/afflict, the printed "Cumulative upkeep {cost}" keyword's
  // triggered ability lives entirely in stripped reminder text, so it never counts as a shaped sentence.
  // detectTriggers synthesizes a "your upkeep" descriptor from the keyword; bump the shaped count by 1 so
  // shaped === detected holds. Keyed on the bare keyword surviving in the reminder-stripped text.
  const cumUpkeepShaped = /\bcumulative upkeep\s+\{/i.test(stripReminder(oracle)) ? 1 : 0;
  // ECHO (BLITZ EC-1, CR 702.30) — the same reminder-parens keyword synthesis; bump the shaped count by 1
  // so shaped === detected holds (line-anchored, matching the detectTriggers synthesis exactly).
  const echoShaped = /(?:^|[\n.;])\s*echo\s+\{/i.test(stripReminder(oracle)) ? 1 : 0;
  // RAVENOUS (Edge of Eternities) — the synthesized "If X is 5 or more, draw a card when it enters" ETB draw
  // trigger lives in REMINDER parens, so stripReminder removes it before the shaped-sentence count — it never
  // appears as a When/Whenever/At sentence. Bump the count by 1 for the keyword so shaped === detected holds
  // (mirrors cascadeKw). Keyed on the RAW oracle (the reminder signature is gone after stripReminder).
  const ravenousShaped = ravenousTriggerCount(oracle);
  // KW-UNDYING (CR 702.92a) — like bushido/afflict, the printed "Undying" keyword's triggered ability lives
  // entirely in stripped reminder text, so it never counts as a shaped sentence. detectTriggers synthesizes
  // a self-dies descriptor from the keyword (undyingKeywordCount — the SAME structural matcher, so grant
  // forms contribute 0 to both counts); bump the shaped count by 1 so shaped === detected holds.
  const undyingShaped = undyingKeywordCount(oracle);
  // KW-EVOLVE — the same reminder-text keyword synthesis; bump by 1 so shaped === detected holds.
  const evolveShaped = evolveKeywordCount(oracle);
  // KW-RENOWN (census slice 2026-07-25) — the same reminder-text keyword synthesis; bump by 1 when a
  // printed "Renown N" is present so shaped === detected holds (a GRANTED renown contributes 0 to both).
  const renownShaped = renownKeywordValue(oracle) > 0 ? 1 : 0;
  // KW-MOBILIZE — same reminder-text synthesis; bump by 1 when a printed "Mobilize N" is present.
  const mobilizeShaped = mobilizeKeywordValue(oracle) > 0 ? 1 : 0;
  // KW-BACKUP — same reminder-text synthesis; bump by 1 when a printed "Backup N" is present.
  const backupShaped = backupKeywordValue(oracle) > 0 ? 1 : 0;
  // KW-PARTNER-WITH (CR 702.124j) — same reminder-parens synthesis: the ETB half lives entirely inside the
  // stripped reminder, so it contributes no When/Whenever/At sentence, while detectTriggers synthesizes one
  // descriptor from the printed keyword. Bump by 1 so shaped === detected holds. "Partner with itself"
  // (Mothers Yamazaki) returns null from the SAME recognizer detectTriggers uses, so it contributes 0 to
  // BOTH counts and cannot desynchronize them.
  const partnerWithShaped = partnerWithName(oracle) ? 1 : 0;
  // ⭐ KW-TRIGGER RECONCILIATION GAP (residue census "TWO-FLIP SIGNATURE") — DETHRONE, TRAINING, FIREBENDING
  // and SOULSHIFT are all synthesized as descriptors by detectTriggers, but were missing from this sum. So
  // `detected` counted them and `shaped` did not, and the two only balanced while the keyword was the card's
  // ONLY trigger — which is why a keyword-alone card classified fine and the same keyword beside ANY printed
  // trigger sentence parked the whole card. Ten cards were failing on arithmetic, not on a missing mechanic:
  // Parish-Blade Trainee, Rural Recruit, Marchesa's Infiltrator, Park Heights Maverick, Tundra Tank, Azula,
  // Zhao, Kami of the Honored Dead, Kami of the Tended Garden, Thief of Hope.
  //
  // ⛔ EACH USES THE SAME RECOGNIZER detectTriggers USES, never a re-stated pattern — the invariant every
  // other member of this sum keeps, and the only thing that stops shaped and detected drifting apart again.
  // Soulshift counts INSTANCES (CR 702.46b — a double soulshift synthesizes two dies triggers); the other
  // three synthesize exactly one descriptor each.
  const dethroneShaped = hasDethrone(oracle) ? 1 : 0;
  const trainingShaped = hasTraining(oracle) ? 1 : 0;
  const firebendingShaped = firebendingKeywordValue(oracle) > 0 ? 1 : 0;
  const soulshiftShaped = soulshiftKeywordCount(oracle);
  // FLANKING (BLITZ FL-1) — one synthesized descriptor PER printed instance (CR 702.25b); bump by the
  // structural count so multiples reconcile (grants and "without flanking" phrases contribute 0).
  const flankingShaped = flankingKeywordCount(oracle);
  // KW-PERSIST (BLITZ PS-1) — undying's mirror; bump by 1 (the structural matcher, grants never count).
  const persistShaped = persistKeywordCount(oracle);
  // BATTLE CRY (BLITZ BC-1) — one synthesized attacks descriptor per printed instance (CR 702.90b).
  const battleCryShaped = battleCryKeywordCount(oracle);
  // AFTERLIFE (BLITZ AF-2, CR 702.135b) — the same reminder-parens keyword synthesis; bump by the number of
  // printed instances (the structural matcher — grants never count). Every printed N synthesizes (digit form
  // parses HIGH for any N), so shaped === detected holds for any printed value.
  const afterlifeShaped = afterlifeKeywordValues(oracle).length;
  // MENTOR (BLITZ MN-1, CR 702.134b) — one synthesized attacks descriptor per printed instance (multiples
  // each trigger separately); the structural matcher never counts a grant.
  const mentorShaped = mentorKeywordCount(oracle);
  // MODULAR (BLITZ MOD-1, CR 702.43a) — the "Modular N" keyword's self-dies payoff lives entirely in stripped
  // reminder parens, so it never counts as a When/Whenever/At sentence. detectTriggers synthesizes ONE dies
  // descriptor per printed instance (CR 702.43b — each works separately); bump the shaped count by the DIGIT-only
  // recognizer's length so shaped === detected holds (variant "Modular—Sunburst"/"Poison Modular N" contribute 0
  // to BOTH counts). The enters-with-counters half is a replacement (resolver), not a trigger, so it's not here.
  const modularShaped = modularKeywordValues(oracle).length;
  // KW-ENGINES (CR 702.179b) — "Start your engines!" synthesizes one self-ETB descriptor (speed 1 if
  // none); the printed line is a keyword, never a When/Whenever/At sentence, so bump by the SAME
  // structural recognizer detectTriggers uses (a grant contributes 0 to both counts).
  const enginesShaped = startYourEnginesKeywordCount(oracle);
  // KW-INGEST (CR 702.114a) — the keyword synthesizes ONE combat-damage descriptor in detectTriggers, and
  // its printed line is a KEYWORD rather than a When/Whenever sentence, so TRIGGER_SENTENCE_RE counts zero
  // for it. The shaped count must be bumped to keep `shaped === detected` — exactly what bushido, afflict
  // and rampage do below. Without this the descriptor detects and routes natively while the card still
  // classifies parked, which is the standing tell for this invariant.
  const ingestShaped = /\bingest\b/i.test(stripReminder(oracle)) ? 1 : 0;
  // KW-CHAMPION (CR 702.71a) — same reason as ingest directly above: the keyword synthesizes ONE enters
  // descriptor and its printed line is a keyword, not a When/Whenever sentence. Only the ENTERS half is
  // synthesized (the leaves half rides the detain link), so this bumps by exactly 1.
  const championShaped = /\bchampion an? [a-z]/i.test(stripReminder(oracle)) ? 1 : 0;
  const kwTrigShaped = (/\bbushido \d/i.test(stripReminder(oracle)) ? 1 : 0) + (/\brampage \d/i.test(stripReminder(oracle)) ? 1 : 0)
    + (/(?<!\bhave\s)(?<!\bhas\s)\bafflict \d/i.test(stripReminder(oracle)) ? 1 : 0)
    + (/\bcopy it for each spell cast before it this turn\b/i.test(oracle) ? 1 : 0) + cascadeKw + cumUpkeepShaped + echoShaped + ravenousShaped + undyingShaped + evolveShaped + renownShaped + mobilizeShaped + backupShaped + partnerWithShaped + dethroneShaped + trainingShaped + firebendingShaped + soulshiftShaped + flankingShaped + persistShaped + battleCryShaped + afterlifeShaped + mentorShaped + modularShaped + enginesShaped + ingestShaped + championShaped;
  // COMPOUND TRIGGER (CR 603.1): "When A and whenever B, <effect>" is counted as ONE shaped sentence by TRIGGER_SENTENCE_RE
  // (only the leading When is anchored), but detectTriggers splits it into TWO independent triggers. Bump the shaped
  // count by the number of compounds so `shaped === detected` holds for a successfully-split compound; if a half is
  // unmodeled the detected count under-runs this bumped shaped → the card correctly stays on the Arbiter.
  // TWO-TRIGGER DETAIN FOLD — the SAME text detectTriggers sees (CR 610.3, Journey to Nowhere / Oblivion
  // Ring). The fold turns an enters-exile + leaves-return PAIR into the one-sentence detain form, so the
  // shaped count MUST fold too: counting 2 printed sentences against 1 detected descriptor mismatches and
  // parks the card. This is the "shaped === detected" invariant, and the fold has to be applied on both
  // sides of it or it buys nothing.
  const foldedOracle = foldTwoTriggerDetain(oracle, card);
  const compoundShaped = compoundTriggerCount(stripReminder(stripTriggerAbilityLabel(foldedOracle)));
  const shaped = scanTriggerSentences(stripReminder(stripTriggerAbilityLabel(foldedOracle))).length + kwTrigShaped + compoundShaped;
  const detected = detectTriggers(card);
  if (detected.length !== shaped) return false;     // an unrecognized-event trigger sentence
  return detected.every(triggerRoutesNatively);      // every recognized trigger's effect routes
}

export function permanentTriggersCovered(card) {
  const triggers = detectTriggers(card); // card IS the publicCard shape — keep WeakMap cache hits
  if (triggers.length === 0) return false;
  if (!allTriggerSentencesModeled(card, card?.oracle || "")) return false;
  // Remove the trigger sentences (same anchored grammar detectTriggers uses); what's
  // left must be keyword-only/empty, or there's unmodeled activated/static text. Strip the ability-word
  // label first ("Landfall —"), else it survives the trigger-sentence strip as non-keyword residue.
  // Also strip the "Do this only once each turn." frequency rider — it's part of the trigger's effect
  // (the parser models it via the oncePerTurn flag), but the trigger regex stops at the first period,
  // leaving the rider as apparent residue (Pantlaza, Sun's Vanguard).
  // Likewise the "(It|That creature|They|Those creatures) can't be regenerated." rider — it's part of a
  // DESTROY trigger's effect (the parser re-detects it via CANT_REGEN_TEST and stamps cannotRegenerate on the
  // destroy atom, so the WHOLE effect parses HIGH in allTriggerSentencesModeled above), but the trigger regex
  // stops at the first period after "destroy that creature.", leaving the rider as apparent residue (Toxin
  // Sliver — "destroy that creature. It can't be regenerated."). Anchored to the exact regen-rider subjects
  // (the same anchor parser.js uses), so it can only consume a true follow-up rider — strictly FN-safe.
  // CHOSEN-TYPE (CR 614.12, Kindred Discovery) — "As this enchantment enters, choose a creature type." is a
  // setup replacement, NOT a When/Whenever/At trigger, so the trigger strip leaves it as residue. It's modeled
  // by the ETB auto-pick (resolvers.autoPickCreatureType stores perm.chosenType), so strip it here too. SAFE:
  // this runs only AFTER allTriggerSentencesModeled passed — an anthem/cost-reducer chooser (Shared Triumph,
  // Urza's Incubator) has NO modeled trigger, so it returns false at the triggers gates above and never reaches here.
  // MODAL TRIGGER (CR 700.2) — a "choose one/two/… —" trigger's modes are bulleted (•) lines that SPAN the
  // first period, so the trigger-sentence strip below (anchored `[^.]+\.`) can't consume the whole block: the
  // lead-in line ("When …, choose one —") ends with "—", not a period, and bullets 2+ would survive as
  // apparent residue (Knight of Autumn, Titan of Industry). Strip the FULL modal-trigger block FIRST, anchored
  // to a trigger keyword + a modal lead-in + its consecutive bullet (•) lines: `(When|Whenever|At) … choose
  // one/two/… —` then every `\n•…` line. The trigger-keyword anchor means this can only consume a real modal
  // TRIGGER — never a modal ACTIVATED ability ("{2}: Choose one —", led by a cost) or a leveler, which is the
  // FP this anchoring avoids. FN-safe: allTriggerSentencesModeled passed above (every trigger, modal included,
  // is fully modeled), so removing a modal trigger's own block can only reveal the keyword-only body.
  const residue = stripTriggerAbilityLabel(foldTwoTriggerDetain(card.oracle || "", card))
    // ETB-ENTERING-PRONOUN tail (Surrak and Goreclaw) — "…put a +1/+1 counter on it. It gains haste until end
    // of turn." The entering-creature counter trigger's effect SPANS two sentences (a same-line follow-up):
    // detectTriggers folds the "It gets/gains <kw> until end of turn." sentence into the trigger's effectClause,
    // and the WHOLE effect parses HIGH in allTriggerSentencesModeled above (proven before this residue check
    // runs — an unmodeled keyword fails that gate and never reaches here). The trigger-sentence strip below
    // stops at the first period after "…on it.", leaving the pump sentence as apparent residue. Strip it — but
    // ONLY when it DIRECTLY FOLLOWS the counter clause ("counter on it/that creature/this creature. It gets/
    // gains … until end of turn"), so a standalone / differently-referented "It …until end of turn" elsewhere on
    // the card is NEVER consumed (CREED — the strip can only eat the Surrak counter-then-pump shape, not a
    // separate ability; 602 corpus cards carry an unrelated "It …EOT" and must be untouched). Run FIRST (before
    // the When/Whenever strip removes the "counter on it." prefix this anchor needs); the remaining "…counter on
    // it." stays inside the trigger sentence and is removed by the trigger-sentence strip below.
    .replace(/(counters? on (?:it|that creature|this creature))\.\s+it (?:gets [+-]\d+\/[+-]\d+(?: and gains [^.]+)?|gains [^.]+) until end of turn\b\.?\s*/gi, "$1. ")
    // SUSPECT-THEN-FOLLOW-UP (BLITZ EK-1 — Person of Interest: "When this creature enters, suspect it.
    // Create a 2/2 white and blue Detective creature token."): the same follow-up-sentence class as Surrak
    // above — detectTriggers folds the create-sentence into the trigger's effectClause and the WHOLE effect
    // parses HIGH in allTriggerSentencesModeled (proven before this residue check runs — an unmodeled
    // follow-up fails that gate and never reaches here), but the trigger-sentence strip below stops at the
    // first period after "suspect it.", leaving the follow-up as apparent residue. Anchored to DIRECTLY
    // follow the exact "suspect it." clause (FN-safe — a standalone create-sentence elsewhere is untouched).
    // Runs before the When-strip (which removes the "suspect it." prefix this anchor needs).
    .replace(/(suspect it)\.\s+create a [^.]+ token\b\.?\s*/gi, "$1. ")
    // UPKEEP-PLAYER MAY-PAY follow-up (2026-08-12 — Paralyze "that player may pay {4}. If the player
    // does, untap the creature."; Apathy's discard-at-random form): the SAME follow-up-sentence class as
    // Surrak/Person-of-Interest above — matchOptionalManaPayment collapses the two sentences into ONE
    // optional-mana-payment atom and the WHOLE effect parses HIGH in allTriggerSentencesModeled (proven
    // before this residue check runs), but the trigger-sentence strip stops at the first period after
    // "…may pay {4}.", leaving the payoff sentence as apparent residue. Anchored to DIRECTLY follow the
    // exact may-pay / may-discard-at-random clause (FN-safe — a standalone "If the player does…" with any
    // other antecedent is untouched).
    .replace(/(may (?:pay (?:\{[^}]+\})+|discard a card at random))\.\s+if (?:the player does|they don't),?\s+[^.]+\.?\s*/gi, "$1. ")
    // THE KARLACH FOLD's residue (Increment 3b, 2026-08-12): "untap all attacking creatures. They gain
    // first strike until end of turn. After this phase, there is an additional combat phase." — the two
    // follow-up sentences ride the trigger's effectClause (the they-fold + the extra-combat arm; the
    // WHOLE effect routes natively, proven by allTriggerSentencesModeled before this walk runs), but the
    // trigger-sentence strip stops at the first period. Anchored to DIRECTLY follow the exact untap
    // sentence — the Surrak follow-up discipline, same as every sibling above.
    .replace(/(untap all attacking creatures)\.\s+they gain [^.]+\.(?:\s+after this (?:combat )?phase, there is an additional combat phase\.?)?\s*/gi, "$1. ")
    // TOKEN-ABILITY GRANT (TK-1's residue half, 2026-07-28) — "…create a 1/1 colorless Eldrazi Scion creature
    // token. It has \"Sacrifice this token: Add {C}.\"" (the Scion/Spawn family, Serpent Generator, Mitotic
    // Slime). EXACTLY the Surrak/Person-of-Interest follow-up class: detectTriggers already folds the
    // "It has \"…\"" sentence into the trigger's effectClause (isFollowupSentence, TK-1) and splitClauses
    // normalizes it to the inline "with \"…\"" form, so the WHOLE effect parses HIGH in
    // allTriggerSentencesModeled — proven before this residue check runs. The trigger-sentence strip below
    // stops at the first period after "…token.", leaving the grant as apparent residue and parking a card
    // whose trigger ALREADY routes natively. Half the plumbing was built and the residue check was never
    // taught about it.
    //
    // Anchored to DIRECTLY follow a token-creation clause and to a QUOTED grant, so it cannot consume an
    // unrelated "It has …" sentence (FN-safe, same argument as every sibling here). Runs before the
    // When-strip, which would otherwise remove the token-creation prefix this anchor needs.
    // NEWLINE-SAFE TAIL, and this one bit for real. The trailing whitespace class is [^\S\n] (horizontal
    // space only), NOT \s — \s matches a NEWLINE, so the strip swallowed the line break and welded the NEXT
    // oracle line onto this one, hiding it from the residue check. Drowner of Hope ("Sacrifice an Eldrazi
    // Scion: Tap target creature." on its own line, an ability parseActivatedAbilities does NOT model) was
    // credited native-trigger with a real unmodeled ability on it — a false positive, the one direction the
    // CREED rules out. Every sibling strip in this chain is single-line by nature; this is the only one
    // whose match ends at a line boundary, so it is the only one that needed the narrower class.
    .replace(/(\btokens?)\.[^\S\n]+(?:it has|they have)[^\S\n]+(["“'])[^"“”'\n]*(["”'])\.?[^\S\n]*/gi, "$1. ")
    // RAD-OR-PROLIFERATE (Vexing Radgull, SHELF S7) — the "Otherwise, proliferate." else-arm is part of the
    // SAME combat-damage trigger's effect (folded into effectClause; the whole branch parses HIGH via
    // matchRadOrProliferate — proven by allTriggerSentencesModeled above). The trigger strip stops at the
    // first period, leaving the else-arm as apparent residue. Anchored to DIRECTLY follow the exact
    // rad-if-none clause, so it can only consume this modeled branch (FN-safe). Runs before the When-strip
    // (which removes the prefix this anchor needs).
    .replace(/(rad counters? if they don['’]t have any rad counters)\.\s*otherwise, proliferate\b\.?\s*/gi, "$1. ")
    // DRAW-OR-COUNTER-TRIGGERING (Marcus, SHELF S7) — the same follow-up-arm class as Radgull above: the
    // "If it doesn't, put a +1/+1 counter on it." else-arm belongs to the SAME trigger's effect (the whole
    // branch parses HIGH via matchDrawOrCounterTriggering — proven by allTriggerSentencesModeled). Anchored
    // to DIRECTLY follow the exact counter-gated draw clause (FN-safe).
    .replace(/(draw a card if that creature has a \+1\/\+1 counter on it)\.\s*if it doesn['’]t, put a \+1\/\+1 counter on it\b\.?\s*/gi, "$1. ")
    // DOUBLE-OR-RESET-COUNTERS (Lily Bowen, SHELF S7) — the same follow-up-arm class as Radgull/Marcus: the
    // "Otherwise, remove all but one +1/+1 counter from it, then you gain 1 life …" else-arm belongs to the
    // SAME upkeep trigger's effect (the whole branch parses HIGH via matchDoubleOrResetCounters — proven by
    // allTriggerSentencesModeled). Anchored to DIRECTLY follow the exact power-gated double clause (FN-safe).
    .replace(/(counters? on [^.]+ if its power is \d+ or less)\.\s*otherwise, remove all but one \+1\/\+1 counter from it, then you gain 1 life for each \+1\/\+1 counter removed this way\b\.?\s*/gi, "$1. ")
    // FREE-CAST-OR-LAND (Kellan, the Kid — SHELF S7) — the same follow-up-arm class: the "If you don't, you
    // may put a land card …" else-arm belongs to the SAME cast trigger's effect (the whole branch parses
    // HIGH via matchFreeCastOrLand — proven by allTriggerSentencesModeled). Anchored to DIRECTLY follow the
    // exact free-cast clause (FN-safe).
    .replace(/(without paying its mana cost)\.\s*if you don['’]t, you may put a land card from your hand onto the battlefield\b\.?\s*/gi, "$1. ")
    // RAD-TARGET-OR-TREASURE (The Ghoul, Gunslinger — SHELF S7) — the same follow-up-arm class: "If that
    // player is you, create a Treasure token." belongs to the SAME dies trigger's effect (the whole branch
    // parses HIGH via matchRadTargetOrTreasure — proven by allTriggerSentencesModeled). Anchored to
    // DIRECTLY follow the exact chosen-player rad clause (FN-safe).
    .replace(/(target player gets (?:a|an|one|two|three|four|five|\d+) rad counters?)\.\s*if that player is you, create a treasure token\b\.?\s*/gi, "$1. ")
    .replace(/(?:^|[\n.;]\s*)(?:When|Whenever|At)\b[^\n]*?\bchoose (?:one|two|three|four|five|one or more|one or both|up to (?:one|two|three|four|five))\b\s*[—-][^\n]*(?:\n\s*•[^\n]*)+/gi, " ")
    .replace(/[\s\S]*/, (all) => stripTriggerSentences(all, " ")) // QUOTE-AWARE (Codex fix #4): the shared scanner strips whole sentences (a quoted ability internal period no longer truncates)
    .replace(/\bas\b[^.]*\benters\b[^.]*,\s*choose a creature type\b\.?/gi, " ")
    .replace(/\bDo this only once each turn\b\.?\s*/gi, " ")
    // ONCE-PER-TURN TRIGGER rider (M1a's residue half, 2026-07-28) — "This ability triggers only once each
    // turn." (Mirelurk Queen and 12 siblings). The sentence sibling of the "Do this only once each turn"
    // strip directly above, and the same argument: detectTriggers ALREADY consumes this wording — it sets
    // descriptor.oncePerTurnTrigger and leaves the effect clause clean — but the trigger-sentence strip
    // stops at the first period, so the rider survived as apparent residue and parked the card.
    //
    // Stripping it is honest ONLY because the runtime genuinely ENFORCES it, which I checked rather than
    // assumed: gameEngine's flush chokepoint keys a per-source, per-event ledger
    // (state.onceTriggersFiredThisTurn, cleared each untap) and DROPS a second same-turn firing with its own
    // log line. An unenforced frequency rider stripped here would credit a trigger that fires every time —
    // the same over-credit shape the activation-limit rider is careful about.
    .replace(/\bThis ability triggers only once each turn\b\.?\s*/gi, " ")
    // GLIMMER SELF-RETURN TYPE DIRECTIVE (the "Enduring" cycle — Enduring Tenacity / Enduring Courage) — the
    // sentence "It's an enchantment." trailing "When ~ dies, if it was a creature, return it to the
    // battlefield under its owner's control." It is NOT residue: triggers.js rewrites that whole effect to
    // the `[self-return-bf:enchantment]` marker precisely BECAUSE the type change is part of the modeled
    // effect, and says so at the rewrite site — "the 'It's an enchantment' semantics are captured by the
    // marker tag itself (the resolver strips the creature type)". The trigger-sentence strip stops at the
    // first period after "…owner's control.", leaving the directive behind as apparent residue.
    //
    // ⭐ THE BUG THIS FIXES LOOKED LIKE A KEYWORD DEPENDENCY, which is why it went unnoticed: the directive
    // only decided the outcome when it was the card's ONLY leftover text. Measured —
    //     dies line ALONE                    -> body-only      ❌
    //     "Vigilance" + the same dies line   -> native-trigger ✅
    // and a keyword line cannot possibly bear on whether a dies-trigger is modeled. That is what makes the
    // three natives (Enduring Vitality/Curiosity/Innocence — each led by Vigilance/Flash/Lifelink) and the
    // two parked (Tenacity/Courage — no keyword line) split on a BYTE-IDENTICAL dies sentence.
    //
    // FN-safe and narrow: anchored to the exact directive, and reachable only after
    // allTriggerSentencesModeled has already vouched the trigger HIGH — the same licence every strip in this
    // chain rides. A card printing "It's an enchantment." with NO modeled self-return trigger never gets
    // here, because it fails that gate first.
    .replace(/\bit['’]s an enchantment\b\.?\s*/gi, " ")
    .replace(/\b(?:they|it|that creature|those creatures) can'?t be regenerated\b\.?\s*/gi, " ")
    // NO-UNTAP LOCKDOWN (Junk Winder) — the follow-up sentence "It doesn't untap during its controller's next
    // untap step." is part of the SAME token-enters trigger's effect: detectTriggers keeps it in the effectClause,
    // splitClauses folds it onto the tap atom (noUntapNext), and the WHOLE effect parses HIGH in
    // allTriggerSentencesModeled above (proven before this residue check runs — an unmodeled tap variant fails
    // that gate and never reaches here). The trigger-sentence strip (line ~480) stops at the first period after
    // "…an opponent controls.", leaving the lockdown sentence as apparent residue. Strip the EXACT modeled
    // wording so the card reads keyword-only (Junk Winder's only other text is the stripped Affinity line).
    // Anchored to the exact untap-lockdown phrasing, so it can only consume this modeled follow-up (FN-safe).
    // Curly apostrophe tolerated.
    // Both printed pronouns for the SAME rider: Junk Winder's "It doesn't untap …" and the single-target
    // creature family's "That creature doesn't untap …" (Frost Lynx / Kor Hookmaster / Watertrap Weaver — the
    // ETB shape refers to the tapped creature by noun, not pronoun). Identical justification and identical
    // anchoring: the rider is part of a trigger effect already proven HIGH by allTriggerSentencesModeled above,
    // and the trigger-sentence strip stops at the first period, leaving it as apparent residue.
    .replace(/\b(?:it|that creature) doesn['’]t untap during its controller['’]s next untap step\b\.?\s*/gi, " ")
    // SELF NO-UNTAP LOCKDOWN (BLITZ UP-1) — the CONTINUOUS static "This <permanent> doesn't untap during your
    // untap step." on the untap-tax family (Brass Man / Brass Gnat / Goblin War Wagon / Goblin Dirigible; the
    // pay-to-untap escape is the upkeep trigger, stripped by the "if you do" tail below). NOW MODELED in the
    // runtime — gameState.untapAll (selfPreventsUntap) skips the source at the untap step, so the metric may treat
    // this line as covered (metric mirrors runtime, CREED). Anchored to the SELF subject ("this <noun>", curly
    // apostrophe tolerated); the "enchanted …" attached form (line ~806-region attachmentPreventsUntap) and the
    // "each other player's untap step" Seedborn phase static are DISJOINT and untouched. FN-safe: a card whose
    // ONLY residue is this line reads keyword-only after the strip and the runtime plays it faithfully.
    // SELF NO-UNTAP STATIC — delegated to the shared stripModeledSelfNoUntap helper (defined near
    // isKeywordOnly) so this path, permanentActivatedCovered's residue, and the native-body check all credit
    // the SAME wording. They used to differ: only this one stripped it, which is why a card with a modeled
    // TRIGGER flipped while the identical card with a modeled ACTIVATED ability parked.
    // The helper's anchors mirror gameState.selfPreventsUntap exactly, including its deliberate refusal of the
    // "your NEXT untap step" wording — that is a one-shot rider on a mana ability (the Cloudcrest Lake
    // slow-dual family) with no runtime lane, and crediting what the runtime ignores is the
    // metric-says-faithful / plays-wrong divergence the CREED forbids.
    // DICE-ROLL (CR 726) — the result-scaled payoff sentences that FOLLOW a combat-damage trigger's "roll a
    // d20." are part of THAT trigger's effect (detectTriggers folds them into the effectClause, which parses
    // HIGH in allTriggerSentencesModeled above — proven before this residue check runs), but the trigger
    // regex stops at the first period after "…roll a d20.", leaving the payoff as apparent residue (Ancient
    // Gold/Silver/Copper Dragon). Strip the modeled payoff forms + the vacuous "no maximum hand size" rider
    // so the WHOLE card reads keyword-only. Anchored to the exact result-scaled shapes the parser models, so
    // they can only consume a true modeled follow-up (FN-safe; an UNmodeled die payoff fails the HIGH gate
    // above and never reaches here).
    .replace(/\b(?:you )?create a number of [^.]*? equal to the result\b\.?\s*/gi, " ")
    .replace(/\b(?:you )?draw cards equal to the result\b\.?\s*/gi, " ")
    .replace(/\byou have no maximum hand size for the rest of the game\b\.?\s*/gi, " ")
    // REVEAL-THAT-MANY-PUT-FILTERED (Gishath, Sun's Avatar) — the put/bottom sentence "Put any number of
    // <subtype> creature cards from among them onto the battlefield and the rest on the bottom of your library in
    // a random order." is part of the SAME combat-damage trigger's effect: detectTriggers folds it into the
    // effectClause (after "…reveal that many cards from the top of your library."), and the WHOLE effect parses
    // HIGH in allTriggerSentencesModeled above (the reveal-put-filtered atom — proven before this residue check
    // runs; an UNmodeled disposition fails that gate and never reaches here). The trigger regex stops at the first
    // period after "…top of your library.", leaving the put sentence as apparent residue. Strip the EXACT modeled
    // wording so the card reads keyword-only (Gishath's only other body text is the Vigilance/trample/haste line).
    // Anchored to the modeled shape (a single-word subtype + the exact put/bottom-random disposition), so it can
    // only consume this modeled follow-up (FN-safe — a different disposition fails the HIGH gate above first).
    .replace(/\bput any number of [a-z]+ creature cards from among them onto the battlefield and the rest on the bottom of your library in a random order\b\.?\s*/gi, " ")
    // REFLEXIVE TRIGGER (CR 603.7) — a "When you do[ this/so], <reflexive>." sentence is part of the PRECEDING
    // trigger's effect: detectTriggers folds it into that trigger's effectClause, and it parses HIGH in
    // allTriggerSentencesModeled above (proven before this residue check runs — an UNmodeled reflexive fails
    // that gate and never reaches here). The trigger regex stops at the period BEFORE "When you do", so the
    // reflexive sentence survives as apparent residue. Strip it so the card reads keyword-only. Covers BOTH the
    // dice-result reflexive (Ancient Bronze Dragon: "…where X is the result") AND the general mandatory-primary
    // reflexive (Faebloom-style permanent triggers). FN-safe: the HIGH gate above already vouched the whole
    // trigger effect is modeled, so stripping its reflexive tail can only reveal the keyword-only body — it can
    // never hide a genuinely unmodeled sentence (those are not "When you do"-led and fail the gate first).
    .replace(/\bwhen you do(?:\s+this|\s+so)?,?[ \t]+[^.\n]*\.?[ \t]*/gi, " ")
    // OPTIONAL-MANA-PAYMENT (CR 603.7c) — "you may pay {cost}. If you do, <effect>." is ONE trigger effect:
    // detectTriggers appends the "If you do, <effect>" sentence to the effectClause, and the whole thing parses
    // HIGH in allTriggerSentencesModeled above (proven before this residue check runs — an unmodeled payoff /
    // an {X} cost fails that gate and never reaches here). The trigger regex stops at the period after "…you may
    // pay {cost}.", leaving the "If you do, <effect>." sentence as apparent residue. Strip it so the card reads
    // keyword-only (Lifecrafter's Bestiary, Inheritance, Mind's Eye, Horizon/Origin/Panic Spellbomb, Urza's
    // Miter, Symmetry Matrix, Pedantic Learning). Anchored to the "if you do" lead so it can only consume a true
    // optional-payment tail — FN-safe (the HIGH gate above already vouched the whole trigger effect is modeled).
    .replace(/\bif you do,?[ \t]+[^.\n]*\.?[ \t]*/gi, " ")
    // OPPONENT-PAYS-TO-DENY (taxed-treasure, Smothering Tithe) — "that player may pay {N}. If the player doesn't,
    // you create a Treasure token." is ONE trigger effect: detectTriggers appends the "If the player doesn't, …"
    // sentence to the effectClause, and the whole thing parses HIGH in allTriggerSentencesModeled above (proven
    // before this residue check runs — an unmodeled payoff / {X} cost fails that gate and never reaches here). The
    // trigger regex stops at the period after "…may pay {N}.", leaving the "If the player doesn't, …" sentence as
    // apparent residue. Strip the EXACT modeled wording so the card reads keyword-only (Smothering Tithe's only
    // other body text is the stripped Treasure reminder). Anchored to the modeled decline shape, so it can only
    // consume this modeled follow-up — FN-safe (the HIGH gate above already vouched the whole taxed-treasure effect).
    .replace(/\bif the player doesn['’]t, you create a treasure token\b\.?\s*/gi, " ")
    // REVEAL-TOP-DRAIN-BY-MV — the drain sentence "Each opponent loses life equal to that card's mana value."
    // (Yuriko, the Tiger's Shadow) OR "You lose life equal to its mana value." (Dark Confidant / Dark Tutelage)
    // FOLLOWS the reveal sentence in the SAME trigger's effect (detectTriggers appends it to the effectClause,
    // which parses HIGH in allTriggerSentencesModeled above — proven before this residue check runs, and the
    // matchRevealTopDrainByMv collapse emits both who-variants), but the trigger regex stops at the first period
    // after "…put that card into your hand.", leaving the drain as apparent residue. Strip the EXACT modeled drain
    // shape (each-opponent OR you, "that card's"/"the card's"/"its" mana value) so the card reads keyword-only.
    // Anchored to the modeled wording, so it can only consume a true modeled follow-up (FN-safe — an UNmodeled
    // drain variant fails the HIGH gate above and never reaches here). Curly apostrophe tolerated.
    .replace(/\b(?:each opponent loses|you lose) life equal to (?:that card['’]s|the card['’]s|its) mana value\b\.?\s*/gi, " ")
    // REVEAL-TOP-CONDITIONAL (Lurking Predators) — the two follow-up sentences "If it's a creature card, put it
    // onto the battlefield. Otherwise, you may put that card on the bottom of your library." are part of the SAME
    // cast-trigger's effect (detectTriggers keeps the whole three-sentence body in the effectClause, which parses
    // HIGH in allTriggerSentencesModeled above via the collapsed matchRevealTopConditional — proven before this
    // residue check runs), but the trigger regex stops at the first period after "…reveal the top card of your
    // library.", leaving these two sentences as apparent residue. Strip the EXACT modeled branch shape so the card
    // reads keyword-only (Lurking Predators has no other body text). Anchored to the exact conditional wording, so
    // it can only consume this modeled follow-up — FN-safe (an UNmodeled reveal-conditional variant fails the HIGH
    // gate above and never reaches here). Curly apostrophe tolerated.
    .replace(/\bif it['’]s a creature card, put it onto the battlefield\. otherwise, you may put that card on the bottom of your library\b\.?\s*/gi, " ")
    // TOP-CARD ROUTER (the parameterized family — Neurok Familiar "If it's an artifact card, put it into
    // your hand. Otherwise, put it into your graveyard."): the SAME residue blind spot as the Lurking shape
    // above, generalized to exactly the combos matchRevealTopConditional's router branch models (predicate ×
    // then-route × else-route). Anchored to those exact wordings, so it can only consume a follow-up the
    // HIGH gate already vouched for — an UNmodeled variant (a "you may" then-branch, an MV cap, a name
    // predicate) fails the HIGH gate and never reaches here (FN-safe).
    .replace(/\bif it['’]s an? (?:creature|artifact|land|enchantment) card, put it (?:onto the battlefield|into your hand)\. otherwise, put (?:it|that card) into your (?:graveyard|hand)\b\.?\s*/gi, " ")
    // TOP-CARD ROUTER v2 — the NO-ELSE forms (Llanowar Empath "If it's a creature card, put it into your
    // hand."; the draw-then form), incl. the OR-predicate (Track Down "creature or land"). Same FN-safe
    // discipline: only a follow-up the HIGH gate already vouched for reaches this strip.
    .replace(/\bif it['’]s an? (?:creature|artifact|land|enchantment)(?: or (?:creature|artifact|land|enchantment))? card, (?:put it into your hand|draw a card)\b\.?\s*/gi, " ")
    // DAMAGE-RIDER (2026-08-14 — Marauding Raptor "…deals 2 damage to it. If a Dinosaur is dealt damage
    // this way, this creature gets +2/+0 until end of turn."): the SAME residue blind spot — detectTriggers
    // appends the "if"-led follow-up to the effectClause (isFollowupSentence), the whole program parses
    // HIGH via the parser's DAMAGE-RIDER arm (vouched by allTriggerSentencesModeled BEFORE this strip
    // runs), but the When-strip stops at the first period and leaves the rider as apparent residue.
    // Anchored to the exact modeled shape (subtype × self-pump) — an unmodeled variant fails the HIGH
    // gate above and never reaches here (FN-safe).
    .replace(/\bif an? [a-z]+ is dealt damage this way, this creature gets \+\d+\/\+\d+ until end of turn\b\.?\s*/gi, " ")
    // LK-1 IMPULSE-DIG REVEAL-TAKE (Arcanist's Owl, Faerie Mechanist, Augur of Bolas, Foul Emissary, Glint-Nest
    // Crane, …) — a triggered ability whose effect is the FILTERED impulse-dig ("look at the top N cards … you
    // may reveal a <type> card from among them and put it into your hand. Put the rest on the bottom …") SPANS
    // three sentences. detectTriggers keeps the whole span in the effectClause, and it parses HIGH via the
    // effects/parser.js matchImpulseDig FILTERED matcher (matcher 2 — the SAME atom the runtime plays, proven by
    // the native-spell Commune with Nature / native-activated Brightwood Tracker), so allTriggerSentencesModeled
    // vouched it above — an UNmodeled continuation (a decline-to-graveyard rider, an "if you didn't put a card,
    // draw/gain-life" tail, a multi-keep "put those cards", a tribal/comma filter parseTutorFilter rejects) fails
    // triggerRoutesNatively and NEVER reaches this strip (FN-safe). The When/Whenever/At strip above stops at the
    // first period after "…of your library.", leaving the "You may reveal … Put the rest …" tail as apparent
    // residue. Strip the EXACT modeled continuation (mirroring matcher 2's tail: an optional OR-pair type phrase,
    // "put it/that card into your hand", rest to the bottom in any/a random order) so a carrier whose OTHER text
    // is keyword-only (Owl/Crane/Mechanist = Flying) reads keyword-only → native-trigger. Anchored to the modeled
    // shape, so it can only consume a follow-up the HIGH gate already vouched for.
    .replace(/\byou may reveal an? [a-z][a-z ]*? card from among them and put (?:it|that card) into your hand\. put the rest on the bottom of your library(?: in (?:any|a random) order)?\b\.?\s*/gi, " ")
    // SELF-CAST HALF-X ROUNDING (CR 107.3) — a trailing "Round down/up each time." directive is part of the
    // self-cast trigger's effect (it governs the "half X" magnitudes the parser models via the halve flag, so
    // the WHOLE effect parses HIGH in allTriggerSentencesModeled above — proven before this residue check runs),
    // but the trigger regex stops at the first period after "…draw half X cards.", leaving the directive sentence
    // as apparent residue (Hydroid Krasis). Strip the EXACT wording so the card reads keyword-only (leaving only
    // Flying/trample + the enters-with-X line, both handled by isKeywordOnly). FN-safe: anchored to the exact
    // directive, and the HIGH gate above already vouched the half-X effect is modeled.
    .replace(/\bround (?:down|up) each time\b\.?\s*/gi, " ");
  // …and then the GENERAL case every hand-written tail above is a special case of — the remaining
  // sentences of each natively-routing trigger's own effect (stripTriggerEffectTails, same helper the
  // composite gate uses, same per-descriptor licence). Runs LAST so the anchored strips above keep the
  // exact text they were written against. This is the NATIVE-TRIGGER tier's copy of the wave that landed
  // in permanentFullyCovered; both chains had the identical `[^.]+` assumption and the identical
  // accumulation of patches on top of it.
  const tailless = stripTriggerEffectTails(residue, card);
  return isKeywordOnly(stripModeledNoMaxHandSize(stripModeledSelfNoUntap(tailless, card?.name)), card?.name);
}

/**
 * True when a permanent's ENTIRE non-keyword text is activated abilities the engine now
 * plays natively (P2.9): EVERY detected `{cost}: effect` ability is `modeled` (cost
 * reduces to mana + `{T}`; effect parses HIGH, non-modal, non-X) — the same
 * `parseActivatedAbilities` gate the runtime offers on — AND nothing else is left after
 * removing the activated-ability lines + reminder + keywords.
 *
 * Conservative by construction (never over-claims):
 *  - It does NOT strip trigger sentences. A card with ANY trigger (or static) text keeps
 *    that text in the residue → NOT native-activated, because the engine would route the
 *    trigger to the Arbiter. The trigger+activated COMPOSITE (both modeled → native) is a
 *    deliberate later refinement; under-claiming here is safe, over-claiming is not.
 *  - A complex mana ability ("Add X mana where X is …") that slipped past `hasManaAbility`
 *    is `modeled:false` (its effect is a mana ability, not a stack effect), so it fails the
 *    every-modeled gate — never counted as covered.
 *
 * Simple mana dorks ("{T}: Add {G}") are caught earlier by `hasManaAbility` → native-mana,
 * so this fires on the value-ability case (a `{2}, {T}: Draw`, a `{T}`-pinger, a tapper…).
 */
/**
 * Does this single oracle line read as an activated ability the detector picks up? Mirrors the
 * EXACT detection guard in `parseActivatedAbilities` (a colon whose cost is symbol-bearing OR a
 * modeled word-cost — γ1's "Pay N life" / "Sacrifice this"), so the residue strippers below can
 * never drift from what the parser detects. Single source of truth = the shared `parseAbilityCost`.
 *
 * `card` (CC-3) — threaded to parseAbilityCost so a SELF-NAME remove-counter cost line ("Remove a
 * charge counter from Umezawa's Jitte: …", CR 201.5) is detected with the SAME name anchor the parser
 * uses. Every call site passes the card whose oracle the line came from — passing a DIFFERENT card
 * (or none) would desync this mirror from parseActivatedAbilities and hide/expose phantom residue.
 */
/**
 * ⭐ LAND FULL-COVERAGE GATE (Codex fix #3, 2026-08-30) — is EVERY line of this land's text something the
 * engine actually plays? "land" (native) only when yes; "land-partial" otherwise. The lanes, each the SAME
 * gate its runtime uses (never a parallel re-implementation):
 *   · empty text / a BASIC — vanilla; a basic's whole text is its intrinsic mana + reminder (CR 305.6).
 *   · trigger sentences — allTriggerSentencesModeled + the same anchored strip the permanent gates use
 *     (the Karoo bounce-lands' ETB is modeled — landBounceScope — so they stay "land").
 *   · the bare enters-tapped static — entersTapped(card), the exact recognizer resolvers honors at entry.
 *     A CONDITIONAL tapland ("enters tapped unless …") fails it — the runtime never evaluates the
 *     condition (it enters untapped, the documented player-favorable miss), so the metric must not call
 *     that card fully modeled.
 *   · mana lines — manaProduction ON THE SINGLE LINE (the runtime's own parser), so a second, unparsed
 *     ability can never free-ride on the first line's production.
 *   · activated-ability lines — parseActivatedAbilities' own modeled flag / the graveyard-ability lanes
 *     (Fabled Passage's sac-fetch is modeled and stays "land"; Mystifying Maze's exile is not and parks).
 *   · anything left must be keyword-only (Cycling on a Triome) — else land-partial.
 * FN-safe by construction: every lane is a positive vouch by the runtime's own recognizer; unrecognized
 * text always demotes. Never strips unsupported abilities to inflate the count (the review's explicit ban).
 */
function landFullyCovered(card) {
  const type = String(card?.type || card?.type_line || "");
  const raw = String(card?.oracle ?? card?.oracle_text ?? "");
  if (!stripReminder(raw).trim()) return true;
  if (/\bBasic\b/i.test(type)) return true;
  if (!allTriggerSentencesModeled(card, raw)) return false;
  const isManaLine = (txt) => /\badd\b/i.test(txt) && !!manaProduction({ name: card?.name, type, oracle: txt });
  const isGraveyardAbility = (txt) => {
    const one = { ...card, oracle: txt };
    return !!(parseGraveyardSelfRecursion(one) || parseGraveyardExileAbility(one));
  };
  // Every parsed activated ability must be modeled, a graveyard ability, or a mana line the mana model
  // parses (a land's "{T}: Add …" reads as an activated ability here but is owned by the mana model).
  const activated = parseActivatedAbilities(card);
  if (!activated.every((a) => a.modeled || isGraveyardAbility(a.raw) || isManaLine(a.raw))) return false;
  // Residue: strip trigger sentences (the permanent gates' anchored form), then every remaining line must
  // be an admitted lane. Line-granular on purpose — a rider sharing a line with a modeled ability keeps
  // the line unmatched and demotes the card (CREED: never a silent drop).
  // QUOTE-AWARE (Codex fix #4): the shared scanner strips whole sentences.
  const afterTriggers = stripTriggerSentences(stripTriggerAbilityLabel(foldTwoTriggerDetain(stripReminder(raw), card)), "\n");
  const tapped = entersTapped(card);
  // LANDS-TIER (2026-09-02): the CONDITIONAL "enters tapped unless <condition>" line is vouched by the SAME
  // reader both enter sites consult (landEntersTapped.entersTappedUnlessCondition), which itself admits a
  // condition only when the shared evaluator can read it — so a land whose gate the runtime cannot
  // evaluate stays land-partial here, never native-on-paper. The admitted line must be EXACTLY that
  // sentence (whole line, ending at the condition); a compound or rider leaves residue as before.
  const condTapped = entersTappedUnlessCondition(card);
  const condLineRe = condTapped ? new RegExp(`^[^.]*\\benters tapped unless ${condTapped.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\.?$`, "i") : null;
  // LANDS-TIER slice 2: the SHOCKLAND clause, vouched by the same reader both enter sites consult
  // (landEntersTapped.paysLifeOrEntersTapped — the play-land path raises a real pay-or-tap pause, the tutor
  // site applies the written auto-policy and charges the life). Exactly the printed sentence pair, whole line.
  const shockTapped = paysLifeOrEntersTapped(card);
  const shockLineRe = shockTapped ? /^as this land enters, you may pay \d+ life\. if you don't, it enters tapped\.?$/i : null;
  const discardAb = discardCostAbilityModeled(card); // LANDS-5 — the from-hand (Channel) ability, iff the runtime lane would offer it
  // LANDS-TIER slice 7: the REVEAL-LANDS sentence, vouched by the same reader both enter sites consult
  // (landEntersTapped.revealLandTypes — auto-reveal-if-able at both sites). Exactly the printed sentence.
  const revealTypes = revealLandTypes(card);
  const revealLineRe = revealTypes ? /^as this land enters, you may reveal an? [a-z]+(?: or [a-z]+)? card from your hand\. if you don't, (?:this land|it) enters tapped\.?$/i : null;
  // LANDS-TIER slice 9: "enters [tapped] with N <kind> counters on it" on a LAND — admitted through the SAME
  // reader both enter sites place the counters with (entersWithNamedCounters) AND the same honesty gate the
  // general path applies to the counter KIND (isHonestEnterCounterKind — a kind whose only readers are
  // modeled clauses; an unmodeled reader clause is residue that parks the card anyway).
  const namedCtr = entersWithNamedCounters(card);
  const namedCtrLineRe = namedCtr && isHonestEnterCounterKind(namedCtr.type) ? /^[^.]*\benters (?:the battlefield )?(?:tapped )?with (?:a|an|one|two|three|four|five|\d+) [a-z]+ counters? on (?:it|him|her)\.?$/i : null;
  // LANDS-TIER slice 12: "As it enters, choose a color [other than <X>]." — admitted through the SAME reader
  // both enter sites stamp `chosenColor` with (choosesColorOnEnter); the "one mana of the chosen color"
  // mana line is admitted by isManaLine because the mana-spec parser now reads it. The two lines often share
  // a printed line with "This land enters tapped." — the tapped half is admitted by its own gate above, so
  // the choose sentence is matched as a SENTENCE here (the line loop sees the whole line).
  const landCC = choosesColorOnEnter(card);
  const chooseColorLineRe = landCC ? /^(?:this land enters tapped\.\s*)?as (?:it|this land) enters, choose a color(?: other than (?:white|blue|black|red|green))?\.?$/i : null;
  // CAP-CAVERN (2026-09-03): "As this land enters, choose a creature type." (Cavern of Souls, Unclaimed Territory) —
  // admitted through the SAME chooser both enter sites stamp `chosenType` with (resolvers.choosesCreatureTypeOnEnter
  // is this exact regex; the play-land drop stamps it too now). The chosen-type mana line itself is admitted by
  // isManaLine — the spend parser reads its restriction and manaSources resolves it per permanent, offering the
  // source to nothing until the type is chosen.
  const chooseTypeLineRe = CHOSEN_TYPE_CHOOSER_RE.test(raw) ? /^as (?:it|this land) enters, choose a creature type\.?$/i : null;
  for (const line of afterTriggers.split("\n").map((l) => l.trim()).filter(Boolean)) {
    if (tapped && /^[^.]*\benters (?:the battlefield )?tapped\.?$/i.test(line)) continue;
    if (condLineRe && condLineRe.test(line)) continue;
    if (shockLineRe && shockLineRe.test(line)) continue;
    if (revealLineRe && revealLineRe.test(line)) continue;
    if (namedCtrLineRe && namedCtrLineRe.test(line)) continue;
    if (chooseColorLineRe && chooseColorLineRe.test(line)) continue;
    if (chooseTypeLineRe && chooseTypeLineRe.test(line)) continue; // CAP-CAVERN
    if (isManaLine(line)) continue;
    if (isActivatedAbilityLine(line, card)) continue; // vouched modeled/gy/mana by the .every above
    // LANDS-TIER slice 5 — a FROM-HAND discard ability on a land ("Channel — {3}{U}, Discard this card: …",
    // Otawara and the NEO legendary lands): admitted through the SAME predicate the runtime offer uses
    // (discardCostAbilityModeled — cost read, rider peeled, program HIGH), so the metric can never credit a
    // Channel line the from-hand lane would refuse. The prefix-tolerant line regex is the one the general
    // path's strip uses.
    if (discardAb && DISCARD_ABILITY_LINE_RE.test(line)) continue;
    if (isKeywordOnly(line, card?.name)) continue;
    return false;
  }
  return true;
}

function isActivatedAbilityLine(line, card) {
  // OUTLAST (CR 702.107a) — a bare "Outlast {W}" line has no colon, so expand it through the SHARED expander
  // before testing. parseActivatedAbilities applies the same call, which is the only reason this mirror still
  // mirrors: duplicating the regex here would leave the two one edit apart, and the comment above this
  // function is explicit that they must not drift.
  const expanded = expandOutlastLines(line);
  if (expanded !== line) line = expanded;
  const ci = line.indexOf(":");
  if (ci === -1) return false;
  // QUOTED-GRANT GUARD (CR 113.7) — a GROUP-GRANT static ("Artifacts you control have \"{T}: Add …\"" —
  // Galazeth Prismari; "Treasures you control have \"{T}, Sacrifice …\"" — Goldspan Dragon) carries its
  // ability's colon INSIDE the quotes. The naive first-colon split reads "…have \"{T}" as a cost (it contains
  // "{") and mis-classifies the grant as an activated-ability LINE, so permanentFullyCovered would FILTER it
  // out of the residue — hiding an UNMODELED grant (a spend-restricted / rider-cost one that parseStaticAbilities
  // correctly drops) and false-flipping the card native (CREED FP). A group grant is a STATIC (the residue's
  // clauseProducesStatic judges it), never the card's own activated ability. Detect it by odd double-quote
  // parity before the split colon (the colon is inside an open quote) and return false so the line SURVIVES to
  // the residue static-check. Inert for a printed activated ability (no quote before its cost colon → parity 0).
  const preColonQuotes = (line.slice(0, ci).match(/["“”]/g) || []).length;
  if (preColonQuotes % 2 === 1) return false;
  const costStr = line.slice(0, ci).trim();
  return costStr.includes("{") || !!parseAbilityCost(costStr, card);
}

export function permanentActivatedCovered(card) {
  // LEVEL UP (LV-1): a leveler is owned WHOLLY by the modeledLeveler classifier (band statics + gated
  // abilities together) — this single-mechanism tier must never claim one through a residue coincidence.
  // Mirrors permanentFullyCovered's identical guard. Belt-and-braces: a leveler's band headers / P/T
  // boxes already fail the keyword-only residue below.
  if (isLevelGatedOracle(String(card?.oracle || card?.oracle_text || ""))) return false;
  const abilities = parseActivatedAbilities(card);
  if (abilities.length === 0) return false;
  // A single unmodeled ability (unmodeled cost OR effect, incl. complex mana abilities)
  // leaves the card in the gap — all-or-nothing, mirroring the all-or-nothing runtime.
  if (!abilities.every((a) => a.modeled)) return false;
  // Drop reminder, FOLD modal-ability bullet lines onto their "Choose one —" ability line (so a multi-line
  // modal activated ability — Koma — is stripped as ONE line, not left as mode-bullet residue; same fold the
  // parser uses), then drop every activated-ability-shaped line (the same shape the parser detects).
  // The remainder (keywords, and any trigger/static text) must be keyword-only/empty.
  const residue = stripModeledSelfNoUntap(
    foldModalBulletLines(stripReminder(card.oracle || ""))
      .filter((line) => !isActivatedAbilityLine(line, card))
      .join("\n"),
    card?.name,
  );
  return isKeywordOnly(residue, card?.name);
}

/**
 * The COMPOSITE classifier: true when a permanent's ENTIRE non-body text is modeled, even
 * when it MIXES ability types (an ETB trigger + a `{T}` ability + a static anthem). The
 * single-mechanism predicates above each demand "no OTHER residue", so a multi-ability
 * creature reads body-only despite every piece being modeled — yet the engine already
 * plays all of them (the subsystems are independent). This unifies them: subtract the
 * trigger sentences + activated-ability lines, then require every remaining clause to be a
 * modeled static or keyword-only, with every trigger routing and every activated modeled.
 *
 * Conservative by construction: ANY unmodeled piece (a non-routing trigger, an unmodeled
 * activated cost/effect, an unmodeled static, a leveler) → false. Pure metric — it changes
 * only how cards are COUNTED, never what the engine does.
 */
/**
 * ⭐ TRIGGER-EFFECT TAIL STRIP — the general form of a patch this file kept re-applying by hand.
 *
 * Every residue chain here removes trigger sentences with `…(When|Whenever|At)\b[^.]+\.` — and `[^.]+`
 * stops at the FIRST period. A trigger whose EFFECT spans sentences (Adaptive Omnitool's "look at the
 * top six… You may reveal… Put the rest on the bottom…") is therefore verified as fully modeled by
 * allTriggerSentencesModeled — which reads the whole folded effect — and then leaves its 2nd and 3rd
 * sentences behind as APPARENT residue, sinking a card every piece of which is understood.
 *
 * The accumulated hand-written tails above (the entering-pronoun pump, the reflexive "if you do", the
 * optional-payment "when you do") are all special cases of exactly that. This removes the general case:
 * detectTriggers already folded the full effect into `effectClause`, so strip the sentences IT names.
 *
 * ⚠️ THE LICENCE IS PER-DESCRIPTOR `triggerRoutesNatively`, NOT the caller's gate — and I got that wrong
 * first, which cost four FP pins. My original claim was "allTriggerSentencesModeled already proved every
 * sentence parses HIGH, so stripping them is free." IT DOESN'T. That gate passes for a trigger whose
 * FOLDED FOLLOW-UP is unmodeled ("draw a card. You may discard a card."; the Patient Naturalist mill
 * back-reference; a kicked ETB with a conjoined damage rider) — and for exactly those cards the RESIDUE
 * CHECK IS THE ONLY THING KEEPING THEM HONEST. Stripping their tails deleted the guard and credited
 * three cards with a real unmodeled ability on them.
 *
 * So the strip runs per descriptor, only when THAT trigger routes natively. A trigger whose follow-up
 * drags its program LOW doesn't route, isn't stripped, keeps its residue, and parks its card — which is
 * the pre-existing behaviour, unchanged.
 *
 * ⚠️ HONEST LABEL: that licence is currently BELT-AND-SUSPENDERS, not a live guard. Measured — remove the
 * `triggerRoutesNatively` line and the full suite still passes and the corpus tier-diff is ZERO cards.
 * All three cards it caught turned out to have stale premises (their follow-ups became modeled), and no
 * card in the index exercises it today. It stays because the hazard it closes is REAL — passing
 * allTriggerSentencesModeled demonstrably does NOT imply the effect routes — and one line is cheap
 * insurance against the next folded follow-up that isn't modeled. It is not what holds the FP line here.
 * The NEWLINE restriction below is.
 *
 * Deliberately conservative: a rewritten effectClause (the event-specific sentinels — "that many
 * lifegain +1/+1 counters", "[gy-self-return:hand] …") no longer matches its printed text, so the
 * replace simply doesn't fire and the card keeps its old verdict. Short fragments (<8 chars) are
 * skipped rather than risk matching something unrelated. Self-name normalized first so a legacy card
 * printing its own name (CR 201.4) still matches the normalized clause.
 */
function stripTriggerEffectTails(text, card) {
  const trigs = detectTriggers(card);
  if (!trigs.length) return text;
  let out = selfNormalizeOracle(text, card?.name, card?.type || card?.type_line);
  for (const d of trigs) {
    if (!triggerRoutesNatively(d)) continue;   // ← THE licence (see the note above), not the caller's gate
    const sentences = String(d.effectClause || "").split(/\.\s+/).map((x) => x.trim()).filter(Boolean);
    for (const sent of sentences.slice(1)) {   // the FIRST sentence went with the trigger lead
      if (sent.length < 8) continue;
      // ⚠️ NO `\s` ANYWHERE — it matches a NEWLINE, and this file has already shipped that exact false
      // positive once (tokenAbilityGrantResidue.test.js pins it on Drowner of Hope): swallowing the line
      // break welds the NEXT oracle line onto the stripped one and hides it, so a card with a real
      // unmodeled ability reads native. I reproduced it verbatim on the first attempt here — four
      // FP pins went red, which is exactly what they are for. Horizontal whitespace only, on both sides
      // and inside the sentence, so a strip can never cross a line boundary.
      const esc = sent.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "[ \\t]+");
      out = out.replace(new RegExp(`[ \\t]*${esc}[ \\t]*\\.?`, "i"), " ");
    }
  }
  return out;
}

export function permanentFullyCovered(card) {
  const oracle = String(card?.oracle || "");
  if (!oracle.trim()) return false;             // vanilla → native-body handles it
  if (isLevelGatedOracle(oracle)) return false;  // level-gated buffs aren't always-on

  // Every trigger-shaped sentence must be a detected trigger that routes (the count guard
  // closes the residue's blind spot for unmodeled-event triggers like "Whenever you cast …").
  if (!allTriggerSentencesModeled(card, oracle)) return false;
  const triggers = detectTriggers(card);
  const activated = parseActivatedAbilities(card);
  // GRAVEYARD-ABILITY COMPOSITION (census slice 56). A graveyard ability — "…: Return this card from your
  // graveyard …" (GY-1) / "…, Exile this card from your graveyard: …" (GY-2) — is genuinely MODELED, just by
  // its own lane rather than this one, so `a.modeled` is false and the guard below used to sink the whole
  // card to body-only. That is why a graveyard ability composed fine with KEYWORDS (which never reach this
  // guard) but not with a trigger or a battlefield activated ability. Haunted Dead, Teacher's Pest and
  // Postmortem Professor all park for exactly this reason and nothing else.
  //
  // Admitting it is the SAFEST composition in the file, not the riskiest: the two abilities function in
  // DIFFERENT ZONES and can never both apply to the same object at once — the battlefield ability while it
  // is a permanent, the graveyard ability while it is a card in the graveyard. Proven at the runtime before
  // this line was written, all three halves on one card: the battlefield trigger fires, the graveyard
  // ability is offered from the graveyard, and it is NOT offered while the card is on the battlefield.
  const isGraveyardAbility = (a) => {
    const one = { ...card, oracle: a.raw };
    return !!(parseGraveyardSelfRecursion(one) || parseGraveyardExileAbility(one));
  };
  if (!activated.every((a) => a.modeled || isGraveyardAbility(a))) return false; // an unmodeled activated ability

  // Need at least one MODELED ability (else this is keyword-only/vanilla, caught earlier).
  if (triggers.length === 0 && activated.length === 0) {
    if (!staticAbilitiesCoverCard(card, isKeywordOnly)) return false;
  }

  // Residue: drop trigger sentences (anchored, the detectTriggers grammar) + activated-ability
  // lines (the same shape the parser detects, incl. γ1 word-costs), then every remaining clause
  // must be a modeled static or keyword-only — no unmodeled trigger/static/other text survives.
  // FOLD modal-ability bullet lines first (Koma's "Choose one — \n• … \n• …"), so a multi-line modal
  // activated ability strips as ONE line rather than leaving its mode bullets as apparent residue.
  // LANDFALL / ability-word label (CR 207.2c) — strip a leading "Landfall —" (constellation, enrage, …)
  // FIRST, identically to permanentTriggersCovered. Without this the trigger-sentence strip below — anchored
  // `(?:^|[\n.;]\s*)(When|Whenever|At)` — never matches a landfall trigger ("Landfall — Whenever a land you
  // control enters, …"), because the "Whenever" sits mid-line after "Landfall — " (not at ^ / after a period),
  // so the WHOLE landfall sentence survives as apparent residue and a fully-modeled landfall permanent (Aesi =
  // extra-land static + landfall optional-draw; Bristly Bill = double-counters activated + landfall counter-on-
  // target) falsely reads body-only. FN-safe: allTriggerSentencesModeled (which label-strips the same way)
  // passed above, so every label-prefixed trigger is already proven modeled — the strip only reveals the
  // keyword/static body it was hiding. Mirrors the native-trigger tier's residue chain (line 295).
  //
  // ETB-ENTERING-PRONOUN tail (Surrak and Goreclaw) — strip the "It gets/gains <kw> until end of turn." pump
  // sentence that a same-line entering-creature trigger folds into its effect (the trigger regex stops at the
  // first period after "…on it.", leaving it as residue). FN-safe: allTriggerSentencesModeled passed above, so
  // the whole trigger effect (this tail included) is proven modeled. ONLY strip when it DIRECTLY follows the
  // counter clause (the Surrak shape) — run BEFORE the trigger-sentence strip (which removes the "counter on
  // it." prefix this anchor needs), so a standalone "It …EOT" elsewhere is never consumed (CREED; mirrors the
  // native-trigger residue chain's ordering).
  const afterTriggers = stripTriggerAbilityLabel(foldTwoTriggerDetain(oracle, card))
    .replace(/(counters? on (?:it|that creature|this creature))\.\s+it (?:gets [+-]\d+\/[+-]\d+(?: and gains [^.]+)?|gains [^.]+) until end of turn\b\.?\s*/gi, "$1. ")
    .replace(/[\s\S]*/, (all) => stripTriggerSentences(all, "\n")) // QUOTE-AWARE (Codex fix #4): the shared scanner strips whole sentences (a quoted ability internal period no longer truncates)
    // REFLEXIVE (CR 603.7) + OPTIONAL-PAYMENT (CR 603.7c) tails — a "When you do, <reflexive>." / "If you do,
    // <effect>." sentence is part of the PRECEDING trigger's effect (detectTriggers folds it into the
    // effectClause, which parses HIGH in allTriggerSentencesModeled above — proven before this residue check
    // runs). The trigger-sentence strip stops at the first period, leaving the tail as apparent residue. Mirror
    // permanentTriggersCovered's residue chain EXACTLY (same two anchors) so an ETB reflexive / optional-payment
    // permanent (Formidable Speaker: "you may discard a card. If you do, search your library for a creature
    // card…" + a {1}{T} untap ability) doesn't falsely read body-only in the COMPOSITE gate. FN-safe: the HIGH
    // gate above already vouched the whole trigger effect is modeled, so stripping its "when/if you do" tail can
    // only reveal the keyword/activated body — never hide a genuinely unmodeled sentence.
    .replace(/\bwhen you do(?:\s+this|\s+so)?,?[ \t]+[^.\n]*\.?[ \t]*/gi, " ")
    .replace(/\bif you do,?[ \t]+[^.\n]*\.?[ \t]*/gi, " ")
    // DAMAGE-RIDER (2026-08-14 — Marauding Raptor): the "If a <Subtype> is dealt damage this way, this
    // creature gets +N/+0…" tail is part of the trigger's effect (folded into the effectClause, vouched
    // HIGH above via the parser's DAMAGE-RIDER arm) — MIRRORED from permanentTriggersCovered's chain,
    // same anchored shape, so the composite gate (the Raptor also carries a cost-reduction static)
    // doesn't read the vouched rider as unmodeled residue. FN-safe: an unmodeled variant fails the
    // HIGH gate above and never reaches this strip.
    .replace(/\bif an? [a-z]+ is dealt damage this way, this creature gets \+\d+\/\+\d+ until end of turn\b\.?\s*/gi, " ")
    // ⭐ FREQUENCY RIDERS — "Do this only once each turn." / "This ability triggers only once each turn."
    // MIRRORED FROM permanentTriggersCovered, which has stripped both for a while. This chain did not, so a
    // card whose trigger carries the rider composed fine with NOTHING and parked the moment it also had an
    // activated ability: the trigger-sentence strip above stops at the first period, the rider survived as
    // apparent residue, and the composite gate read it as unmodeled text. Elvish Warmaster and five siblings
    // sat here — each half classifying alone, neither composing.
    //
    // ⛔ HONEST ONLY BECAUSE THE RUNTIME ENFORCES IT, which is the sibling strip's own stated condition and
    // is unchanged here: detectTriggers consumes the wording (descriptor.oncePerTurnTrigger) and the flush
    // chokepoint keys a per-source per-turn ledger (state.onceTriggersFiredThisTurn, cleared each untap) that
    // DROPS a second same-turn firing. An unenforced frequency rider stripped here would credit a trigger
    // that fires every time.
    //
    // ⚠️ THE REAL LESSON IS THE DUPLICATION: these two residue chains are supposed to mirror each other and
    // drifted. Anything added to one belongs in the other, or a card composes in one tier and parks in the next.
    .replace(/\bDo this only once each turn\b\.?\s*/gi, " ")
    .replace(/\bThis ability triggers only once each turn\b\.?\s*/gi, " ");
  // …and then the GENERAL case the three hand-written tails above are each a special case of: every
  // remaining sentence of a modeled trigger's own effect. Runs LAST so those anchored strips keep the
  // exact text they were written against.
  const afterTriggerTails = stripTriggerEffectTails(afterTriggers, card);
  // ⭐ EQUIPMENT COMPOSITION — an Equipment whose bonus + Equip line are the whole remainder once the
  // triggers are stripped. permanentEquipmentCovered ALREADY admits a trigger, but strips it with a naive
  // `[^.]+` that stops at the first period, so any trigger whose effect runs past one sentence leaves the
  // rest as residue and sinks the card: Mask of Memory's "If you do, discard a card.", Goldvein Pick's
  // Treasure reminder, Adaptive Omnitool's three-sentence dig. THIS function's residue chain already
  // handles all of those (the reflexive/optional-payment tails, the label strip, reminder stripping) — it
  // just had no idea what an equipped-creature bonus is, so the two halves each understood their own piece
  // and the card fell between them.
  //
  // Handing the CAREFULLY-stripped remainder to the equipment gate composes them without duplicating
  // either. Safe by construction: every trigger was proven to route natively above, and
  // permanentEquipmentCovered is itself all-or-nothing over what's left. 12 corpus Equipment sit here.
  // The type test is a cheap EARLY-OUT, not a safety gate — permanentEquipmentCovered rejects a
  // non-Equipment on its own first line, and a mutation removing this test changes no verdict. Said plainly
  // so nobody later mistakes it for the thing holding the FP line; the all-or-nothing gate below it is.
  if (/\bEquipment\b/i.test(String(card?.type || card?.type_line || ""))
      && permanentEquipmentCovered({ ...card, oracle: afterTriggerTails })) return true;

  const afterActivated = foldModalBulletLines(stripReminder(afterTriggerTails))
    .filter((line) => !isActivatedAbilityLine(line, card))
    .join("\n");
  // QUOTE-AWARE residue split (abilityClauses, the SAME splitter staticAbilitiesCoverCard uses): a GROUP-GRANT
  // static whose quoted ability carries an internal period ("Treasures you control have \"{T}, Sacrifice this
  // artifact: Add two mana of any one color.\"" — Goldspan Dragon) must NOT be shredded by that period into a
  // dangling "…any one color" + orphan-quote fragment (neither parses → false residue → a false body-only on a
  // fully-modeled MIXED card). Walking quote depth keeps the quoted ability intact. Behavior-identical to the
  // old `/[\n.;]+/` split for quote-free residue (the common case — every existing native-mixed card).
  // SELF-NAME NORMALIZATION (census slice 21) — normalize the residue EXACTLY as staticAbilitiesCoverCard
  // does before splitting it. clauseProducesStatic's grammar is anchored on the modern self reference
  // ("this creature's power and toughness are each equal to …"), so a legacy printing that names ITSELF
  // (Mortivore, Psychosis Crawler — CR 201.4) read as unmodeled residue here while the single-mechanism
  // static tier credited the very same line. That mismatch is why a card with a modeled STATIC plus a
  // modeled ACTIVATED ability fell between both tiers and landed in body-only despite every piece being
  // understood. Same normalizer, same grammar, both paths.
  for (const clause of abilityClauses(selfNormalizeOracle(afterActivated, card?.name, card?.type || card?.type_line))) {
    if (clauseProducesStatic(clause)) continue;  // a modeled static clause
    if (isKeywordOnly(clause, card?.name)) continue;  // keyword-only / vanilla
    return false;                                 // unmodeled residue
  }
  return true;
}

/**
 * True when an Equipment's ENTIRE non-keyword text is the attach mechanic the engine now
 * plays: a modeled "Equip {cost}" ability + a cleanly-modeled "Equipped creature gets +X/+Y
 * / has [keyword]" bonus, plus (ETB-EQUIP-ATTACH) an optional natively-routing ETB-attach
 * trigger ("When this Equipment enters, attach it to target creature you control"). ALL-OR-
 * NOTHING (mirrors the runtime): every trigger sentence must route natively; every activated
 * ability must be a modeled Equip; the bonus must parse cleanly (a rider drops
 * parseEquipmentBonus to []); and nothing else may be left after the trigger + Equip +
 * equipped-creature lines. A complex equipment (a NON-routing trigger, a non-Equip activated
 * ability, an unmodeled bonus rider) stays body-only.
 */
export function permanentEquipmentCovered(card) {
  if (!/\bequipment\b/i.test(String(card?.type || ""))) return false;
  // ETB-EQUIP-ATTACH: allow a natively-routing trigger (the auto-attach). Require EVERY trigger to route,
  // then STRIP the trigger sentences so the Equip + bonus + residue checks below see only the static text
  // — exactly the prior behavior for a trigger-less equipment (the strip is a no-op there). A non-routing
  // trigger fails allTriggerSentencesModeled → body-only (never an over-claim).
  const oracle = String(card.oracle || "");
  if (!allTriggerSentencesModeled(card, oracle)) return false;
  // MODAL TRIGGER (Pip-Boy): the naive [^.]+ trigger-strip stops at the FIRST bullet's period, orphaning
  // the remaining "• …" mode lines as residue. On an EQUIPMENT every bullet line belongs to its (already
  // fully-verified, allTriggerSentencesModeled above) modal trigger — equipment carry no standalone modal
  // statics — so drop the bullet lines with the trigger sentences.
  // QUOTE-AWARE (Codex fix #4): the shared scanner strips whole sentences (a quoted ability's internal
  // period no longer truncates the strip).
  // PREVENT-AND-PUT (SHELF CAP9, CR 615 — Panther Habit): strip the attached prevent-and-put LINE before
  // the bonus / residue analysis, gated on attachedPreventPutCountersOf — the SAME reader both damage
  // paths consult, so the metric and the runtime cannot disagree about which Equipment carry the wall.
  // A LINE strip for the reason stripCounterShieldLine takes one: the clause mentions "equipped creature",
  // so leaving it in makes the bonus-less `anyTouch` guard below reject the card (it cannot tell a modeled
  // touching clause from a dropped rider), and the residue loop would then whitelist it only through the
  // generic "equipped creature" branch — which is vouched by a bonus parse that never ran. Naming the
  // clause here keeps the credit anchored to the reader that proves the runtime plays it.
  // ⛔ HONEST ONLY BECAUSE THE PAYOUT IS ENFORCED: prevention alone would credit an Equipment whose whole
  // upside (the counters) the engine never delivers. See the payout loops in combatResolution/spellEffects.
  const preStripped = attachedPreventPutCountersOf({ ...card, oracle })
    ? oracle.split("\n").filter((ln) => !attachedPreventPutCountersOf({ oracle: ln })).join("\n")
    : oracle;
  const noTrig = { ...card, oracle: stripTriggerSentences(preStripped, " ").replace(/^\s*•[^\n]*$/gm, " ") };
  const abilities = parseActivatedAbilities(noTrig);
  if (abilities.length === 0 || !abilities.every((a) => a.isEquipAbility && a.modeled)) return false;
  // The bonus parser is all-or-nothing over every equipped-creature clause: a non-empty result
  // guarantees EVERY clause touching the creature parsed cleanly (no rider silently dropped).
  if (parseEquipmentBonus(noTrig).length === 0) {
    // A BONUS-LESS equipment (Pip-Boy — a pure modal trigger + Equip {2}) is legitimate ONLY when no
    // remaining clause touches the equipped creature at all: parseAttachedBonus returns [] both for
    // "nothing touches" (safe) and "a touching clause failed to parse" (NOT safe — the residue loop below
    // whitelists equipped-creature clauses on the strength of this parse, so letting a failed parse
    // through would silently drop a rider, the forbidden partial). Distinguish the two here.
    const anyTouch = equipmentAbilityClauses(stripReminder(noTrig.oracle || "")).some((cl) => {
      const c = cl.toLowerCase().trim();
      return /\bequipped creature\b/.test(c) || /^it\b/.test(c) || /^that creature\b/.test(c);
    });
    if (anyTouch) return false;
  }
  // Clause-granular residue (split on . ; \n — same as the bonus parser, so a period-joined
  // rider can't be swallowed by a whole-line strip). Every clause must be a modeled Equip
  // line or an equipped-creature clause (already validated clean above). ANYTHING else — a
  // self-keyword printed on the EQUIPMENT ("Indestructible"), an unmodeled equip variant
  // ("Equip Human {1}"), a non-Equip activated ability — leaves residue → body-only, so a
  // not-fully-modeled equipment is never over-claimed as native (CLAUDE.md "no silent gaps").
  // A modeled Equip line: the plain "Equip {cost}" OR a restricted "Equip [quality] {cost}" variant
  // (CR 702.6c) — the two modeled qualities are "commander" (equipQuality:"commander", legalChoices restricts
  // to a commander you control) and "legendary creature" (equipQuality:"legendary", restricted to a Legendary
  // target — Excalibur, Sword of Eden). Any OTHER "Equip <quality> …" stays residue → body-only (never over-claimed).
  const modeledEquipLine = /^equip(?:\s+commander|\s+legendary\s+creature)?\s*(?:[—–-])?\s*(?:\{[^}]+\})+$/i;
  // ATTACH-AS-A-PLAIN-ACTIVATED-ABILITY (CR 701.3 — the Cranial Plating / Horned Helm cycle): the same attach
  // effect as Equip, printed as "{cost}: Attach this Equipment to target creature you control." parseActivated-
  // Abilities returns it as isEquipAbility, so the all-abilities gate above ALREADY required it to be modeled;
  // it just isn't shaped like an "Equip {cost}" line, so without this the residue loop rejects the whole card.
  // Anchored to the exact modeled wording + a mana-only cost, so it can only admit the form the parser models.
  const modeledAttachAbility = /^(?:\{[^}]+\})+:\s*attach this equipment to target creature you control\.?$/i;
  // RECONFIGURE (CR 702.151) — the ATTACH half is the modeled equip lane (parseActivatedAbilities returns it
  // as isEquipAbility, so the all-abilities gate above already required it modeled), and the half that makes
  // it safe to credit is the layer-4 removeCardType emitted while attached (CR 702.151b — an attached
  // reconfigure Equipment is NOT a creature). Without that layer effect this whitelist would be an
  // over-claim: the card would attach AND keep attacking. Anchored to the keyword + a mana-only cost, so an
  // unmodeled variant stays residue.
  const modeledReconfigureLine = /^reconfigure\s*(?:[—–-])?\s*(?:\{[^}]+\})+$/i;
  for (const clause of equipmentAbilityClauses(stripReminder(noTrig.oracle || ""))) {
    const c = clause.toLowerCase().trim();
    if (!c) continue;
    if (modeledEquipLine.test(c) || modeledAttachAbility.test(c) || modeledReconfigureLine.test(c)) continue;
    // A leftover trigger-shaped clause (When/Whenever/At) is an UNCOUNTED trigger and must NOT be whitelisted
    // by the "equipped creature" clause below. When two triggers share a line (Novel Nunchaku: "When this
    // Equipment enters, attach it … . When you do, equipped creature fights …"), the noTrig strip's regex
    // consumes the period terminating the FIRST trigger, so the reflexive "When you do, …" sentence loses its
    // boundary char → allTriggerSentencesModeled's count misses it (shaped==detected==1) → it survives here.
    // Its fight clause parses LOW (unmodeled). Reject it → body-only (FN-safe, no partial flip — CREED).
    if (/^(?:when|whenever|at)\b/i.test(c)) return false;
    if (/\bequipped creature\b/.test(c) || /^it\b/.test(c) || /^that creature\b/.test(c)) continue;
    // LIVING WEAPON / FOR MIRRODIN! — the keyword's "enters → make a token → attach to it" ETB is modeled
    // in enterPermanent (resolvers.js), and the equipped-creature bonus buffs the token. The bare keyword
    // (reminder text already stripped) is therefore a MODELED clause, not residue.
    if (/^living weapon$/.test(c) || /^for mirrodin!?$/.test(c)) continue;
    // SELF-KEYWORD on the Equipment (Mithril Coat's "Flash"/"Indestructible", a hexproof/ward artifact): a
    // keyword printed on the EQUIPMENT ITSELF is a MODELED clause, not residue. Whitelist a clause that is
    // exactly a COVERED_KEYWORD (the SAME allowlist isKeywordOnly credits on a creature — a keyword modeled on
    // a creature functions identically on an artifact), so an equipment can carry its own keywords and still be
    // fully covered. Only-loosens (never over-claims: an UNmodeled keyword isn't in COVERED_KEYWORDS → residue).
    if (COVERED_KEYWORDS.some((k) => c === k || c === `${k}.` || c.startsWith(`${k} `))) continue;
    // ⭐ MODELED STATIC on the Equipment (SHELF CAP6 — Conqueror's Flail: "As long as this Equipment is
    // attached to a creature, your opponents can't cast spells during your turn."): a clause the shared
    // static grammar emits a REAL descriptor for (clauseProducesStatic — the exact per-clause gate the
    // composite tier trusts) is a MODELED clause, not residue. The Flail's cant-cast is parsed
    // attachment-gated (cantCastDescriptorOf) and enforced at legalChoices' cast gate — pinned in
    // opponentsCantAct.test.js — so crediting it here composes two already-proven halves. The
    // trigger-shaped guard ABOVE runs first, so an uncounted When/Whenever clause can never reach this
    // (clauseProducesStatic would refuse it anyway — parseClause has no trigger grammar). Only-loosens:
    // a clause the grammar doesn't emit for stays residue → body-only.
    if (clauseProducesStatic(c)) continue;
    return false; // residue the engine doesn't model → body-only
  }
  return true;
}

// ===== FIX-MANA-OVERCLAIM: residue gate on the native-mana tier =====
// `hasManaAbility` is loose by design, and `classifyCard` returned `native-mana` on its basis BEFORE the
// trigger/activated/mixed gates and WITHOUT requiring the rest of the card to be modeled — so a mana
// source with an unmodeled TRIGGER or level structure (Mana Crypt's upkeep coin-flip; Sorcerer Class's
// levels) was counted fully native: a metric over-claim (the runtime already routes the unmodeled piece
// to the Arbiter — `classifyCard` has no runtime consumer). This makes `native-mana` all-or-nothing like
// every other native tier: a mana source is native only when its non-mana TRIGGER text is modeled too.
//
// "Modeled" = the SAME gate the native-trigger tier uses (`allTriggerSentencesModeled`: every trigger-shaped
// sentence is a detected trigger whose effect routes natively), plus not level-gated. A "pure mana" trigger
// (an ETB/upkeep/cast "add {mana}") is deliberately NOT a free pass: the runtime mana model produces mana
// ONLY from tapping/sacrificing a `{T}`/sac source — it never fires triggered mana — so a triggered-mana-
// ONLY card (Burning-Tree Emissary, Coal Stoker) yields ZERO mana natively and is a genuine over-claim, not
// a false negative. (The smaller non-mana ACTIVATED-ability over-claim — Lantern of Revealing — is a
// fragile, separate follow-up: distinguishing a mana ability from a value ability is error-prone, and
// under-correcting is the safe direction.)
function manaCardResidueModeled(card, oracle) {
  if (isLevelGatedOracle(oracle) || !allTriggerSentencesModeled(card, oracle)) return false;
  // ⭐ ACTIVATED RESIDUE (2026-08-15) — a PRE-EXISTING hole closed the day it grew carriers: this gate
  // checked triggers and level-gates but NEVER activated abilities, so a mana source with an unmodeled
  // activated line (Shaman of Forgotten Ways' Formidable life-set, Sage of the Maze's land-animation)
  // claimed native-mana while an entire ability was missing — a metric over-claim, the all-or-nothing
  // law violated. Every NON-mana activated ability must now be modeled; the mana line itself is exempt
  // (isManaEffect — it is vouched by the manaProduction credit this tier stands on, and `modeled` is
  // deliberately false for every mana ability since they never ride the stack path).
  return parseActivatedAbilities(card).every((a) => a.modeled || a.isManaEffect);
}

// ADDITIVE registry seam (WAVE 0): module-level list of extra coverage classifiers. A classifier is
// `(card) => tier | null` consulted by classifyCard AFTER all inline single-mechanism tiers and BEFORE
// the composite catch-all (the inline tiers keep priority). Empty by default — a no-op until a slice
// registers one — so existing classification is untouched.
const COVERAGE_CLASSIFIERS = [];
export function registerCoverageClassifier(fn) {
  if (typeof fn !== "function") throw new Error("coverage classifier must be a function");
  COVERAGE_CLASSIFIERS.push(fn);
}

/**
 * BLITZ EQ-2 — the AURA/EQUIPMENT static grant + SELF-SAC-ACTIVATED composite. An Aura or Equipment whose
 * body is EXACTLY {the enchant/equip line, a modeled static grant (parseAuraBonus/parseEquipmentBonus — the
 * SAME all-or-nothing gate isNativeAura/permanentEquipmentCovered already stand on), one-or-more modeled
 * activated abilities, keyword-only residue}. The activated ability is the piece the plain aura/equipment
 * tiers each treat as residue: isNativeAura's residue walk pushes a "{cost}: effect" line (Capashen Standard
 * "{2}, Sacrifice this Aura: Draw a card." falls out of native-aura), and permanentEquipmentCovered requires
 * EVERY activated ability be an Equip line (Lightning Spear's "Sacrifice this Equipment: …" fails it). This
 * COMPOSES the two rather than forking: STRIP the non-attach activated-ability lines, then require the
 * REMAINDER to be a fully-native aura/equipment (the exact existing gate — reuse), AND every activated
 * ability modeled (whole-card CREED). The self-sac cost noun ("Sacrifice this Aura/Equipment", CR 701.21a)
 * is what parseAbilityCost newly parses this slice, so the self-sac ability finally reaches `modeled:true`.
 *
 * TIERING: an Aura returns "native-activated" — NOT "native-aura" — because isNativeAura is FALSE on the
 * residue-carrying FULL card, so the plain aura CAST branch (legalChoices, gated on isNativeAura) would never
 * offer it; grantAuraCastHostType's grant-aura cast lane DOES offer a non-isNativeAura Aura whose tier is
 * native-activated/native-mana-aura/native-trigger, and it attaches through AURA_ETB (the layer engine then
 * applies the static bonus and actionsActivateAbility enumerates the self-sac ability on the attached Aura —
 * the whole card plays). An Equipment returns "native-equipment" (a normal artifact cast; the registry seam
 * tiers it after the inline equipment tiers). A non-Aura/Equipment card returns null (registry no-op).
 *
 * TWO CREED GUARDS (a false negative is SAFE; a dropped rider / mis-bound referent is FORBIDDEN):
 *   • GUARD-LEAVE: a self-sac / self-exile activated COST removes the source (and its attachment) as the cost,
 *     BEFORE the ability's effect resolves (actionDispatcher pays the cost, then the payload carries a
 *     `sourceId` pointing at the now-gone permanent). An effect that references the detached host — an atom
 *     target:"enchanted"/"equipped", or the phrase "enchanted/equipped creature" — can't bind at resolution,
 *     so the effect silently no-ops. Reject such a card: Briar Shield ("Sacrifice this Aura: Enchanted
 *     creature gets +3/+3 until end of turn." → a pump target:"enchanted" the runtime drops) parks. Effects
 *     on a CHOSEN / any target (draw, create a token, "It deals N damage to any target") are unaffected — the
 *     target is picked at activation and survives the source's departure.
 *   • GUARD-QUOTE (EQ-3 composition): a double-quote in the stripped remainder signals a GRANTED quoted
 *     ability. For an AURA it still rejects outright (that composition lives in nativeGrantPlusAuraStatic).
 *     For EQUIPMENT the remainder is handed to isNativeTriggerGrantAuraOrEquipment — the gate that owns the
 *     pure grant shape (runtime: grantedTriggersForHost fires the quoted trigger; parseAttachedBonus's
 *     validator-gated quoted-tail folds apply the static half) — plus a real-vs-stripped bonus-parse
 *     agreement guard, since the layer engine reads the FULL oracle and an activated line naming the host
 *     poisons it. An unvalidated quote still rejects (CREED). Candlestick is the reference carrier.
 */
/**
 * AU-GRANT+STATIC — an Aura that BOTH grants its host a modeled ability AND carries a modeled static bonus.
 * Returns the grant half's tier ("native-trigger" | "native-activated" | "native-mana-aura"), or null.
 *
 * ⭐ NEITHER GATE IS LOOSENED. The card is split by line and each half is handed to the gate it already had:
 * the remainder must satisfy `isNativeAura`, the Enchant+grant lines must satisfy whichever grant gate
 * already claimed that shape alone. So the composite can never credit what its halves would not have — the
 * same strip-then-revalidate discipline as EQ-2 (nativeStaticGrantPlusActivated), and precisely the
 * composition EQ-2's GUARD-QUOTE rejects. Those cards had nowhere to land; this is where they land.
 *
 * ⚠️ ORDER OF WORK: this lane was written once and REVERTED, because the runtime half was missing —
 * parseAttachedBonus dropped the Aura's entire static bonus when a grant line was present, so the tier would
 * have claimed an effect the engine had stopped applying. The validator skip (AU-GRANT+BONUS) landed first;
 * only then did this become honest. auraGrantPlusStatic.test.js keeps the runtime proof AND its positive
 * control, because a metric that runs ahead of its runtime is worse than a parked card.
 */
function nativeGrantPlusAuraStatic(card) {
  if (!/\bAura\b/.test(String(card?.type || card?.type_line || ""))) return null;
  const lines = String(card.oracle || card.oracle_text || "").split("\n");
  const isGrant = (ln) => /^\s*enchanted \w+ has\s+["“]/i.test(stripReminder(ln));
  const isEnchantLine = (ln) => /^\s*enchant\b/i.test(stripReminder(ln));
  const grants = lines.filter(isGrant);
  if (!grants.length) return null;
  const rest = lines.filter((ln) => !isGrant(ln));
  // ≥1 non-grant, non-Enchant clause — otherwise a lane ABOVE already owns the card and keeps priority
  // (a pure-grant Aura is native-trigger/-activated there; a pure-bonus Aura is native-aura).
  // ⚠️ DEFENSIVE, AND UNREACHABLE TODAY — say so rather than imply a check that isn't there. A card with no
  // non-grant clause returns from a lane above before ever arriving here, so deleting this line moves NOTHING
  // and its mutation does not fail (verified, not assumed). It is kept as insurance against a future lane
  // reorder, not as a live gate; the "priority preserved" test pins the lanes above, not this line.
  if (!rest.some((ln) => stripReminder(ln).trim() && !isEnchantLine(ln))) return null;
  // HALF 1 — the card WITHOUT its grant lines must be a natively-played Aura on its own terms. ANY of the
  // three aura-own lanes counts, not just the static-bonus one: a modeled static bonus (Pillory, Compulsory
  // Rest, Utopia Vow), the Aura's OWN activated ability (Ocular Halo), or its OWN triggered/ETB ability
  // (Nurturing Presence). ⭐ Each of those three runtime paths was MEASURED to still work with a grant line
  // present before being admitted here — the own-activated ability still enumerates on the Aura, the own ETB
  // still fires, and the static bonus needed the parseAttachedBonus fix that shipped with this lane's first
  // three cards. Widening on "it's the same shape" without that check is how the first attempt became a
  // false positive.
  const remainder = { ...card, oracle: rest.join("\n") };
  if (!isNativeAura(remainder) && !isNativeOwnActivatedAura(remainder) && !isNativeOwnTriggeredAura(remainder)) return null;
  // HALF 2 — the Enchant line plus the grant lines must satisfy the grant gate that already claimed it.
  const grantOnly = { ...card, oracle: [...lines.filter(isEnchantLine), ...grants].join("\n") };
  if (isNativeTriggerGrantAuraOrEquipment(grantOnly)) return "native-trigger";
  if (isNativeActivatedGrantAura(grantOnly)) return "native-activated";
  if (isNativeManaGrantAura(grantOnly)) return "native-mana-aura";
  return null; // an unmodeled grant → the whole card stays body-only (CREED, whole-card)
}

function nativeStaticGrantPlusActivated(card) {
  const ty = String(card?.type || card?.type_line || "");
  const isAura = /\bAura\b/.test(ty);
  const isEquip = /\bequipment\b/i.test(ty);
  if (!isAura && !isEquip) return null;
  const abilities = parseActivatedAbilities(card);
  if (!abilities.length || !abilities.every((a) => a.modeled)) return null;   // whole-card: every ability modeled
  // The EXTRA abilities = the non-attach (non-Equip), non-mana activated abilities — the piece the plain
  // aura/equipment tier can't already model. ≥1 required (else the plain tier owns the card; keep priority).
  const extra = abilities.filter((a) => !a.isEquipAbility && !a.isManaEffect);
  if (!extra.length) return null;
  // GUARD-LEAVE (see doc): a leaving cost whose effect references the detached host → forbidden FP.
  const refsHost = (a) =>
    (a.program?.atoms || []).some((at) => at.target === "enchanted" || at.target === "equipped") ||
    /\b(?:enchanted|equipped) creature\b/i.test(String(a.effectClause || ""));
  if (extra.some((a) => (a.sacSelf || a.exileSelf) && refsHost(a))) return null;
  // STRIP the extra activated-ability lines from the (reminder-preserved) oracle — every activated-ability
  // line that is NOT the Equip attach line (which the equipment gate still needs). Keyed on the SAME
  // isActivatedAbilityLine the parser's own residue strips use, so the strip can't drift from detection.
  const kept = String(card.oracle || card.oracle_text || "").split("\n").filter((line) => {
    const s = stripReminder(line).trim();
    if (!s) return true;
    return !(isActivatedAbilityLine(s, card) && !/^equip\b/i.test(s));
  });
  const stripped = { ...card, oracle: kept.join("\n") };
  // GUARD-QUOTE → EQ-3 composition (Candlestick): a quoted grant in the remainder is admissible ONLY for
  // Equipment and ONLY through isNativeTriggerGrantAuraOrEquipment — the gate that already owns the pure
  // grant shape, whose runtime is real on BOTH halves: grantedTriggersForHost fires the quoted trigger off
  // the attachment's own line-anchored parse (unaffected by the activated lines stripped here), and the
  // layer engine applies any static half via parseAttachedBonus's validator-gated quoted-tail folds. The
  // gate re-runs its own count / static-half / residue guards on the remainder, so an unmodeled or
  // non-triggered co-grant still parks (CREED).
  // DRIFT GUARD: the layer engine parses the REAL oracle, not the remainder — an activated line that
  // mentions the host ("{1}: Equipped creature gains …") poisons the full-card bonus parse to [] while the
  // remainder's still succeeds; crediting on the remainder would claim a buff the runtime dropped, so the
  // two parses must agree. Auras keep the blanket reject (their composite lane is nativeGrantPlusAuraStatic).
  if (/["“”]/.test(stripReminder(stripped.oracle))) {
    if (isAura || !isNativeTriggerGrantAuraOrEquipment(stripped)) return null;
    if (parseEquipmentBonus(card).length !== parseEquipmentBonus(stripped).length) return null;
    return "native-equipment";
  }
  if (isAura) return isNativeAura(stripped) ? "native-activated" : null;
  return permanentEquipmentCovered(stripped) ? "native-equipment" : null;
}
// EQ-2 — register the EQUIPMENT lane (returns "native-equipment" | null; a non-equipment card is null, so
// this is a no-op for everything but Equipment). The AURA lane is called directly in the aura block below,
// because auras return from classifyCard BEFORE the registry runs.
registerCoverageClassifier((card) => (/\bequipment\b/i.test(String(card?.type || card?.type_line || "")) ? nativeStaticGrantPlusActivated(card) : null));

// GRANTED-ACTIVATED AURA (subsystem 1 phase 1b) — an Aura whose ONLY body is granting the enchanted
// creature one-or-more activated abilities, every one fully modeled (cost in the modeled subset + effect
// parses HIGH, via parseGrantedActivatedAbilities). The runtime enumerates these on the host and resolves
// them through the existing dispatcher (legalChoices.grantedActivatedForHost). All-or-nothing: a rider
// (an ETB trigger, a restriction, a sacrifice clause, an unmodeled second ability) leaves residue → the
// card stays Arbiter, never a partially-modeled grant (CREED).
// LA-1 (BLITZ day 2): an AURA-OWN ETB trigger line ("When this Aura enters, <effect>") whose SINGLE
// descriptor routes natively is MODELED end-to-end — an Aura enters through the same enterPermanent
// chokepoint every permanent uses (checkEnterTriggers is the single ETB-fire site), so the flush fires
// it exactly like a creature's ETB. The metric may therefore admit such a line as non-residue wherever
// an aura gate walks the card's clauses (Gift of Paradise's "you gain 3 life", Abundant Growth's
// "draw a card", Weirding Wood's "investigate"). Strictly ONE detected descriptor, event "etb", scope
// "self", routing natively — anything else stays residue (CREED all-or-nothing).
function isModeledAuraOwnEtbLine(line) {
  const t = String(line || "").trim();
  if (!/^when this (?:aura|enchantment) enters\b/i.test(t)) return false;
  // abilityClauses strips the trailing period; detectTriggers' sentence anchor needs a complete
  // sentence — restore it so the probe sees the line exactly as printed.
  const probeText = /[.!]$/.test(t) ? t : `${t}.`;
  const descs = detectTriggers({ name: "AuraOwnEtbProbe", type: "Enchantment — Aura", oracle: probeText });
  return descs.length === 1 && descs[0].event === "etb" && descs[0].scope === "self" && triggerRoutesNatively(descs[0]);
}

// LA-1 — the Gift of Paradise / Abundant Growth frame: a MANA-GRANT aura (parseAuraGrantedManaAbility)
// whose only other body is Enchant line(s) + modeled aura-own ETB line(s). The bare-grant form is
// isNativeManaGrantAura (staticAbilityParser); this widens it with the ETB rider WITHOUT touching that
// module (the grant-line shape mirrors manaGrantResidueClauses' admission exactly).
const MANA_GRANT_LINE_RE = /^enchanted (?:creature|land) (?:has|have)\s+["“][^"”]*\{t\}[^"”]*add[^"”]*["”]\s*\.?$/i;
function isNativeManaGrantAuraWithEtb(card) {
  if (!isAuraCard(card)) return false;
  if (!parseAuraGrantedManaAbility(card)) return false;
  let sawEtb = false;
  for (const clause of abilityClauses(String(card?.oracle || card?.oracle_text || ""))) {
    const c = clause.toLowerCase().trim();
    if (/^enchant\b/.test(c)) continue;
    if (MANA_GRANT_LINE_RE.test(c)) continue;
    if (isModeledAuraOwnEtbLine(clause)) { sawEtb = true; continue; }
    return false; // any other clause = residue (CREED)
  }
  return sawEtb; // the bare form (no ETB) is isNativeManaGrantAura's — this gate only adds the rider form
}

// ===== ORDEAL AURA (BLITZ OC-1 — the Theros Ordeal cycle, CR 303.4) ===== an "Enchant creature" Aura whose
// WHOLE body is the exact two-trigger Ordeal template:
//   "Whenever enchanted creature attacks, put a +1/+1 counter on it. Then if it has three or more +1/+1
//    counters on it, sacrifice this Aura."  (attacks/equippedCreature — the attached-linkage scope; the
//    counter + the [ordeal-threshold-sac] threshold-sacrifice, CR 608.2c order-written)
//   "When you sacrifice this Aura, <payoff>."  (youSacrificeThis — fired off the sacrifice chokepoint's
//    look-back, CR 603.10a; NEVER on a non-sacrifice exit such as the host-died SBA, CR 704.5m)
// Native ONLY when the lines are EXACTLY {Enchant creature, the Ordeal attack line, the you-sacrifice
// payoff line} — any residue line fails closed — AND detectTriggers yielded exactly one descriptor per
// trigger line AND every descriptor routes natively (the SAME shared gate the runtime flush uses, so the
// metric can't claim a payoff the engine would drop: an unmodeled payoff → LOW → body-only, e.g. a
// "manifest dread"-style payoff card with other unroutable residue). All-or-nothing per THE CREED.
const ORDEAL_ATTACK_LINE_RE = /^whenever enchanted creature attacks, put a \+1\/\+1 counter on it\.\s*then if it has three or more \+1\/\+1 counters on it, sacrifice this aura\.?$/i;
const ORDEAL_PAYOFF_LINE_RE = /^when you sacrifice this aura, .+\.?$/i;
export function isNativeOrdealAura(card) {
  if (!isAuraCard(card)) return false;
  const oracle = String(card.oracle || card.oracle_text || "");
  const lines = oracle.split(/\n+/).map((l) => l.replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim()).filter(Boolean);
  let sawEnchant = false, sawAttack = false, sawPayoff = false;
  for (const line of lines) {
    if (/^enchant creature$/i.test(line)) { sawEnchant = true; continue; }
    if (ORDEAL_ATTACK_LINE_RE.test(line)) { sawAttack = true; continue; }
    if (ORDEAL_PAYOFF_LINE_RE.test(line)) { sawPayoff = true; continue; }
    return false; // any residue line → not the Ordeal template → Arbiter (CREED fail-closed)
  }
  if (!(sawEnchant && sawAttack && sawPayoff)) return false;
  const descs = detectTriggers(card);
  return descs.length === 2
    && descs.some((d) => d.event === "attacks" && d.scope === "equippedCreature")
    && descs.some((d) => d.event === "youSacrificeThis")
    && descs.every((d) => triggerRoutesNatively(d));
}

function isNativeActivatedGrantAura(card) {
  if (!isAuraCard(card)) return false;
  const granted = parseGrantedActivatedAbilities(card);
  if (!granted.length || !granted.every((a) => a.modeled)) return false;
  // EC-1a: REMINDER-STRIPPED like the equipment/trigger sibling gates (and like parseGrantedActivatedAbilities
  // itself, which parses the stripped oracle). A grant line carrying trailing reminder text ("Enchanted creature
  // has \"{T}: Scry 1, then draw a card.\" (To scry 1, …)" — Oracle's Insight) failed the raw-line grantLineRe in
  // BOTH the count guard and the residue walk below, parking a card whose granted body is fully modeled. Reminder
  // text is rules-inert (CR 207.2/207.2a) — stripping it can only align this gate with what the parser already credits,
  // never admit real residue (any non-reminder clause still fails the walk → Arbiter).
  const oracle = stripReminder(String(card?.oracle || card?.oracle_text || ""));
  // Host = the enchanted CREATURE (Hermetic Study) OR an enchanted LAND (Squirrel Nest "Enchanted land has
  // \"{T}: Create a 1/1 …\"", Caustic Tar, Barbed Field) — the runtime (grantedActivatedForHost via the
  // land-extended GRANTED_ACTIVATED_LINE) enumerates the granted ability on the land, which taps for its {T}
  // cost with no summoning-sickness gate. A land-MANA grant ("{T}: Add …") is native-mana-aura (phase 1a),
  // not this tier (parseGrantedActivatedAbilities filters isManaEffect), so the two never overlap.
  const grantLineRe = /^enchanted (?:creature|land)\s+(?:has|have)\s+["“][^"”]+["”]\s*\.?$/i;
  // COUNT GUARD (CREED): every grant line must be one of the parsed activated grants. parseGrantedActivated-
  // Abilities deliberately SKIPS granted-TRIGGERED ("Whenever …") and granted-MANA ("{T}: Add …") quoted
  // abilities, so a card with such a line would have it whitelisted as a grant line below yet never modeled —
  // a silently-dropped clause. Require grant-line count === parsed count so any skipped grant is residue.
  const grantLines = oracle.split(/\n+/).filter((l) => grantLineRe.test(l.trim())).length;
  if (grantLines !== granted.length) return false;
  for (const rawLine of oracle.split(/\n+/)) {
    const t = rawLine.trim();
    if (!t) continue;
    if (/^enchant\b/i.test(t)) continue;                                                  // the Enchant keyword line
    if (grantLineRe.test(t)) continue;                                                     // a granted-ability line
    if (isModeledAuraOwnEtbLine(stripReminder(t))) continue;                               // LA-1: a modeled aura-own ETB rider
    if (isAttachedNoUntapLine(t)) continue;                                                // UT-1: the PZ-1 tap-lock line (untapAll enforces it)
    // TS-1 — AURA SELF-KEYWORD / cost-only keyword lines on a GRANT aura, mirroring the two proven admits:
    //   • "Flash" — the FA-1 admit auraResidueClauses already makes for the pump-aura lane (Oblivion Crown /
    //     Talons of Falkenrath): a cast-TIMING keyword. The engine hard-casts at its sorcery-speed window —
    //     the flash option simply goes unused; the card still does exactly its printed thing (an FN-safe
    //     timing simplification, never a wrong resolution).
    //   • "Cycling {cost}" (CR 702.29a) — a HAND-zone alternative action the runtime already offers for ANY
    //     card type (legalChoices.actionsCycleFromHand is type-agnostic; Footfall Crater cycles today). The
    //     line is meaningless once the Aura is on the battlefield. Anchored to the plain brace-cost form:
    //     typecycling ("Islandcycling {2}") doesn't match (its tutor is unmodeled → residue → park), and a
    //     "when you cycle …" TRIGGER is its own line, hits the fall-through below, and parks the card.
    if (/^flash$/i.test(t)) continue;
    if (/^cycling (?:\{[^}]+\})+$/i.test(t)) continue;
    // TS-1 — CUMULATIVE UPKEEP (CR 702.24) on the Aura itself (Mystic Might): the keyword's synthesized
    // upkeep descriptor (detectTriggers' keyword→trigger synthesis) fires through checkStepTriggers on ANY
    // battlefield permanent — an Aura included — and the pay-or-sacrifice atom sacrifices the Aura (the
    // grant lifts with the attachment). Admit the line ONLY when the synthesized descriptor routes natively
    // (the SAME shared gate the runtime flush uses): a {X}/hybrid cost routes LOW → residue → park (safe FN).
    if (isModeledCumulativeUpkeepLine(stripReminder(t))) continue;
    return false;                                                                          // any other clause = residue
  }
  return true;
}

// TS-1 — is this line exactly a "Cumulative upkeep {cost}" whose SYNTHESIZED upkeep trigger routes
// natively? Probed through the same detectTriggers + triggerRoutesNatively pair the runtime flush uses
// (the isModeledAuraOwnEtbLine pattern), so the metric can never admit a cost shape the runtime would
// route to the Arbiter (a {X}/hybrid cumulative upkeep parses LOW → false → residue).
function isModeledCumulativeUpkeepLine(line) {
  const t = String(line || "").trim();
  if (!/^cumulative upkeep\b/i.test(t)) return false;
  const probeText = /[.!]$/.test(t) ? t : `${t}.`;
  const descs = detectTriggers({ name: "CumulativeUpkeepProbe", type: "Enchantment — Aura", oracle: probeText });
  return descs.length === 1 && descs[0].event === "upkeep" && triggerRoutesNatively(descs[0]);
}

/**
 * GRANT-AURA CAST HOST (BLITZ TS-1) — the cast→attach lane for the GRANT-aura families. The grant tiers
 * (native-activated / native-mana-aura grants / native-trigger grants) were fully modeled ON the
 * battlefield (grantedActivatedForHost / grantedManaSpecsFor / triggersForEvent enumerate on the host),
 * but the CAST of every such Aura fell through legalChoices' aura branches (isNativeAura requires a
 * creature-bonus payload; isNativeManaAura is the Wild Growth boost lane) to the no-target push, and the
 * dispatcher routed it to the Arbiter seam — the metric claimed native for a card whose cast never
 * attached natively. This helper is the SINGLE gate legalChoices (offer) and actionDispatcher (AURA_ETB
 * routing) share, so offer, resolution, and the metric's native claim cannot drift.
 *
 * Returns { host: "creature"|"land", ownOnly } — the host type the Aura legally enchants and whether the
 * offer is restricted to the caster's own permanents — or null when this lane doesn't own the card:
 *   • not an Aura, or one of the lanes with its OWN cast branch (isNativeAura / Ordeal / mana-boost /
 *     player-aura) — those keep priority and stay byte-identical;
 *   • an enchant subject outside the four modeled forms ("creature[ you control]" / "land[ you control]")
 *     — a subtype/zone/opponent-restricted subject is unmodeled → null → the cast still routes to the
 *     Arbiter (safe FN, CR 303.4a never violated);
 *   • a Saga-framed Aura (chapter machinery is the saga lane's — none in the corpus, fail closed);
 *   • a tier outside the three grant tiers — the whole card must be modeled (THE CREED: the tier gate is
 *     the all-or-nothing authority; body-only grant auras keep Arbiter-routed casts).
 * ownOnly: a "you control" subject is CR 303.4a-mandatory; a LAND host is additionally offered own-only
 * (the mana-boost lane's precedent — enchanting an opponent's land only helps them; a safe useful subset).
 */
export function grantAuraCastHostType(card) {
  if (!isAuraCard(card)) return null;
  if (isNativeAura(card) || isNativeOrdealAura(card) || isNativeManaAura(card) || isPlayerAuraCard(card)) return null;
  if (isSagaCard(card)) return null;
  const m = String(auraEnchantSubject(card) || "").match(/^(creature|land)( you control)?$/);
  // QUALIFIED CREATURE SUBJECT (2026-08-03): a subject auraEnchantRestrictions can express — "tapped
  // creature", "creature without flying", "creature with power N or less", and now nonblack / green /
  // "mana value N or less" — is a CREATURE host whose filter rides in the restriction list. Before this,
  // the plain-subject regex was the only thing keeping this lane honest: a qualified-subject Aura in a
  // GRANT/composite family (Wurmweaver Coil, once its subject became expressible) reached a native tier
  // while this returned null, so no aura cast was offered and the card fell to the no-target push — a
  // card credited native that the engine could not attach. The lane's caller now passes the SAME
  // restrictions to enumerateTargets, so offer and metric stand on one source. An INEXPRESSIBLE subject
  // still returns null here (auraEnchantRestrictions is null for it) and keeps the whole card on the
  // Arbiter, which is why widening the tier without this would have been the forbidden direction.
  const qualified = !m && auraEnchantRestrictions(card) ? { host: "creature", ownOnly: false } : null;
  if (!m && !qualified) return null;
  const tier = classifyCard(card);
  if (tier !== "native-activated" && tier !== "native-mana-aura" && tier !== "native-trigger") return null;
  return m ? { host: m[1], ownOnly: !!m[2] || m[1] === "land" } : qualified;
}

// AURA-OWN-ACTIVATED — an Aura whose ONLY body is the Enchant line + one-or-more activated abilities PRINTED
// ON THE AURA that tap/untap the ENCHANTED CREATURE (Freed from the Real "{U}: Tap enchanted creature." /
// "{U}: Untap enchanted creature."). Distinct from the GRANTED-ACTIVATED family (which quotes an ability the
// HOST gains — "Enchanted creature has \"…\""): here the ability lives on the Aura and affects its host via
// the fixed target:"enchanted" referent (atomTargets → the Aura's attachedTo host). The runtime enumerates
// the Aura's printed abilities on the Aura permanent (legalChoices.actionsActivateAbility) and resolves the
// tap/untap on the host (combat.applyTapEffect). ALL-OR-NOTHING (CREED): every printed activated ability must
// be modeled AND its program must be EXCLUSIVELY the aura-safe target:"enchanted" tap/untap atom — a
// self-binding "this creature gets …" (target:"self", which no-ops on the non-creature Aura source) or ANY
// other effect keeps the card Arbiter, and no non-Enchant / non-activated body clause may remain.
function isNativeOwnActivatedAura(card) {
  if (!isAuraCard(card)) return false;
  const abilities = parseActivatedAbilities(card);
  if (!abilities.length) return false;
  // Every printed activated ability must be a modeled, non-mana, non-equip ability whose program is nothing
  // but target:"enchanted" tap/untap atoms — the exact aura-own family this slice models. Anything else
  // (an unmodeled ability, a mana ability, a self/chosen-target effect) fails → the card stays Arbiter.
  const isEnchantedTapProgram = (prog) =>
    !!prog && Array.isArray(prog.atoms) && prog.atoms.length > 0 &&
    prog.structure !== "modal" &&
    // AF-1 widens the trio: the aura-own PUMP ("{R}: Enchanted creature gets +1/+0 until end of turn" —
    // Firebreathing) rides the same fixed enchanted referent as the tap/untap pair. BLITZ RG-1 adds the
    // aura-own REGEN ("{G}: Regenerate enchanted creature." — Regeneration, Keldon Mantle, CR 701.19): the
    // regenerate atom carries the SAME fixed target:"enchanted" referent and resolves through the same
    // enchantedTargets host path (applyRegenerate → addRegenShield on the host), so it's op-for-op safe here.
    // ⭐ AURA SELF-BOUNCE (2026-08-04 — Crown of Flames; census: 5 native carriers of the shape / 3 blocked)
    // — "{R}: Return this Aura to its owner's hand." is the ONE atom here whose referent is the Aura ITSELF
    // rather than its host, so it is admitted by op+target together, never by op alone: a `bounce` aimed at
    // anything else (a chosen target, the host) is a different card and still fails this gate.
    //
    // Runtime-verified before admission, both abilities on the printed card: the pump takes the host 2/2 →
    // 3/2, and the bounce really returns the Aura to hand AND clears the host's attachment list (no
    // orphaned link left behind). That detach is the part a parse check cannot see.
    prog.atoms.every((a) => ((a.op === "tap" || a.op === "untap" || a.op === "pump" || a.op === "regenerate") && a.target === "enchanted")
      || (a.op === "bounce" && a.target === "self"));
  if (!abilities.every((a) => a.modeled && !a.isManaEffect && !a.isEquipAbility && isEnchantedTapProgram(a.program))) return false;
  // No body clause other than the Enchant keyword line and the printed activated-ability lines. An activated
  // ability line contains a colon whose cost is symbol/word-bearing (the same shape parseActivatedAbilities
  // keys on); a residue line (an ETB trigger, a static restriction, a P/T bonus) → Arbiter (CREED whole-card).
  const oracle = stripReminder(String(card?.oracle || card?.oracle_text || ""));
  const activatedLineCount = abilities.length;
  let sawActivated = 0;
  for (const rawLine of oracle.split(/\n+/)) {
    const t = rawLine.trim();
    if (!t) continue;
    if (/^enchant\b/i.test(t)) continue;                                    // the Enchant keyword line
    // COVERED KEYWORD LINE (2026-08-04) — a bare keyword line the project ALREADY treats as covered
    // (COVERED_KEYWORDS via isKeywordOnly) is not residue here either. This lane rejected it, so
    // Blessing of Leeches ("Flash" + Enchant + an upkeep trigger + a modeled aura-own regenerate) parked
    // on the one line every other lane credits: a vanilla Flash creature is native-body, and Ambush Viper
    // (Flash + Deathtouch) is native-body. Same drift as the strips fixed earlier today — one lane
    // accepts a line, another calls it leftover text.
    //
    // ⛔ THIS PROPAGATES AN EXISTING POLICY, IT DOES NOT MAKE ONE. Whether flash-as-covered is right
    // (the runtime does NOT enforce flash timing — legalChoices.isSorcerySpeed says so in its own
    // comment, and a flash permanent is castable only at sorcery speed, i.e. strictly WEAKER than
    // printed) is settled elsewhere, by COVERED_KEYWORDS, and is the same call every keyword-only card
    // already rides on. An UNCOVERED keyword line still fails isKeywordOnly and still parks the card.
    if (isKeywordOnly(t, card?.name)) continue;
    // An activated-ability line: "{cost}: effect." with a colon (mirrors parseActivatedAbilities' detection).
    if (/^[^:]*\{[^}]+\}[^:]*:/.test(t)) { sawActivated++; continue; }
    return false;                                                           // any other clause = residue → Arbiter
  }
  return sawActivated === activatedLineCount;
}

// AU-ACT+TRIG (2026-08-03, the census two-flip list — Fiery Mantle) — an Aura whose body is its OWN modeled
// activated ability/abilities PLUS its OWN modeled triggered ability/abilities. Fiery Mantle is Firebreathing
// (native-activated) plus one line — "When this Aura is put into a graveyard from the battlefield, return it
// to its owner's hand." — and that line made the whole card body-only: the activated lane's residue walk sees
// the trigger as leftover text, and the aura-own TRIGGERED composition one lane over pairs a trigger with a
// STATIC bonus (isNativeAura), which Fiery Mantle has none of. Each gate correct alone; neither knew the
// other's half was covered. A tier COMPOSITION failure, not a missing mechanic.
//
// COMPOSED, NOT LOOSENED — the same strip-then-revalidate discipline as AU-GRANT+STATIC and EQ-2. The card is
// split by line and each half is handed to the gate that ALREADY claimed that shape alone: the non-trigger
// half (Enchant line + activated lines) must pass isNativeOwnActivatedAura, the trigger half must pass
// permanentTriggersCovered. An unmodeled ability, an unrouted trigger, or any third kind of line still fails
// whichever half owns it → the card stays on the Arbiter (THE CREED, all-or-nothing by construction).
//
// ⭐ BOTH RUNTIME HALVES WERE DRIVEN ON THE PRINTED CARD BEFORE THIS SHIPPED — the AU-GRANT+STATIC lane was
// once built, credited, and REVERTED for exactly this omission (both halves verified on text the composition
// invented, neither on the card). Measured on the real oracle, not the split: the {R} pump IS offered on the
// Aura and takes the host 2/2 → 3/2, and the LTB self-return DOES fire and move the card graveyard → hand.
// Pinned in auraOwnActivatedPlusTrigger.test.js.
function isNativeOwnActivatedPlusTriggeredAura(card) {
  if (!isAuraCard(card)) return false;
  if (isPlayerAuraCard(card)) return false;              // player-enchant Auras keep their own lane
  const raw = String(card.oracle || card.oracle_text || "");
  const enchantLine = raw.match(/(?:^|\n)\s*(Enchant [^\n]*)/i)?.[1];
  if (!enchantLine) return false;
  const stripped = raw.replace(/(?:^|\n)\s*Enchant [^\n]*(?=\n|$)/i, "\n");
  const lines = stripped.split("\n").map((l) => l.trim()).filter(Boolean);
  const isTrigger = (l) => /^(?:when|whenever|at)\b/i.test(stripReminder(l));
  const trigLines = lines.filter(isTrigger);
  const restLines = lines.filter((l) => !isTrigger(l));
  // Both halves must be non-empty — a pure-activated or pure-trigger Aura is already owned by its own lane
  // above, and stealing those tiers is the documented hazard the AU-3 composition names.
  if (!trigLines.length || !restLines.length) return false;
  if (!isNativeOwnActivatedAura({ ...card, oracle: [enchantLine, ...restLines].join("\n") })) return false;
  return permanentTriggersCovered({ ...card, oracle: trigLines.join("\n") });
}

// AURA-OWN-TRIGGERED (BLITZ AU-3) — an Aura whose ONLY body (the Enchant keyword line aside) is one-or-more
// TRIGGERED abilities PRINTED ON THE AURA that fire off a modeled event with a natively-routed effect
// (Curiosity "Whenever enchanted creature deals damage to an opponent, you may draw a card"; Sigil of Sleep;
// Extra Arms; Curse of Chains "At the beginning of each upkeep, tap enchanted creature"; Mantle of Leadership).
// The Aura is the trigger SOURCE (CR 603.2), NOT the granter — distinct from the GRANTED-TRIGGERED family
// (isNativeTriggerGrantAuraOrEquipment, "Enchanted creature has \"…\"", which quotes an ability the HOST gains).
// The SAME sibling shape as isNativeOwnActivatedAura, with a trigger CONDITION in place of an activation cost:
//   • The runtime already fires it — checkStepTriggers / checkAttackTriggers / checkCombatDamageTriggers /
//     checkEnterTriggers all scan triggerSourcesOf(state, pid), which returns EVERY battlefield permanent the
//     player controls (Auras included), and scopeMatches gates it: scope:"equippedCreature" fires ONLY when
//     the triggering permanent IS the Aura's host (attachedTo / the CR-603.10a look-back attachments), scope:
//     "you" fires on the Aura CONTROLLER's step (CR 503.1a upkeep, etc.), scope:"eachCreature" on any ETB.
//   • The effect resolves off the Aura source — buildTriggerStack threads sourceId = the trigger's source
//     permanent (the Aura) into the effect program, so an "enchanted creature" referent (target:"enchanted")
//     resolves through atomTargets → enchantedTargets → the host (CR 303.4a), exactly like the aura-own
//     ACTIVATED / regenerate atoms (AU-2 / RG-1). The combatDamageToPlayer attached-watcher fire is the
//     SB-1-hardened path saboteurDamagedPlayer.test.js already pins for Sigil of Sleep.
// ALL-OR-NOTHING (THE CREED): reuse permanentTriggersCovered on the Enchant-stripped oracle — the identical
// gate the player-Aura lane uses — so every printed trigger must (a) be detected (shaped-sentence count ===
// detected count) AND (b) route natively (triggerRoutesNatively: a HIGH, non-modal, target-resolvable effect
// program with its combat-damage referent supplied by the event) AND (c) leave NO non-keyword residue after
// the trigger sentences are stripped. Any static bonus / unmodeled clause / unrouted effect (a "put a +1/+1
// counter on enchanted creature" the counter parser rejects; a "When enchanted creature dies …" detectTriggers
// doesn't recognize) fails the gate → the whole Aura stays on the Arbiter (a SAFE false-negative). Player-
// enchant Auras are deferred to isPlayerAuraCard (their per-player cast lane + elimination sweep); a routing
// trigger's cast is offered through grantAuraCastHostType's generic lane, gated on this native-trigger tier.
function isNativeOwnTriggeredAura(card) {
  if (!isAuraCard(card)) return false;
  if (isPlayerAuraCard(card)) return false; // player-enchant Auras keep their own per-player cast lane (isPlayerAuraCard, below)
  const raw = String(card.oracle || card.oracle_text || "");
  const stripped = raw.replace(/(?:^|\n)\s*Enchant [^\n]*(?=\n|$)/i, "\n");
  if (permanentTriggersCovered({ ...card, oracle: stripped })) return true;

  // STATIC + TRIGGER COMPOSITION (the residue census's "TWO-FLIP SIGNATURE" — a tier composition failure,
  // not a missing mechanic). Elephant Guide / Griffin Guide / Most Wanted / Failed Conversion each pair a
  // MODELED static grant with a MODELED trigger, and BOTH halves classify on their own:
  //     "Enchant creature / Enchanted creature gets +3/+3."                      -> native-aura
  //     "When enchanted creature dies, create a 3/3 green Elephant token."       -> native-trigger
  // …yet the whole card was body-only, because permanentTriggersCovered's residue walk (above) sees the
  // static line as leftover text and the isNativeAura walk sees the trigger line the same way. Each gate is
  // correct in isolation; neither knew the other's half was already covered.
  //
  // COMPOSED, NOT LOOSENED — and that distinction is the whole safety argument. Nothing here relaxes either
  // check: the static half must pass isNativeAura ON ITS OWN (with the Enchant line restored, which that
  // gate requires) and the trigger half must pass permanentTriggersCovered ON ITS OWN. A card with an
  // unmodeled static, an unrouted trigger, or any third kind of line still fails whichever half owns it and
  // stays on the Arbiter. All-or-nothing is preserved by construction (THE CREED).
  // DO NOT STEAL A TIER THE AURA LANE ALREADY OWNS. isNativeAura ALREADY composes a static grant with an
  // aura-OWN ETB ("When this Aura enters, tap enchanted creature." — Roots, Stupefying Touch, the tap-lock
  // frames), and those cards are classified native-AURA. This branch sits earlier in the tier chain, so
  // without this guard it caught them first and re-tiered them to native-trigger — 10 pins fired, all of
  // them asserting the tier rather than the coverage. The composition below is only for the shapes the aura
  // lane does NOT already accept.
  if (isNativeAura(card)) return false;
  const enchantLine = raw.match(/(?:^|\n)\s*(Enchant [^\n]*)/i)?.[1];
  if (!enchantLine) return false; // no Enchant line ⇒ not the shape this composition is about
  const lines = stripped.split("\n").map((l) => l.trim()).filter(Boolean);
  const isTrigger = (l) => /^(?:when|whenever|at)\b/i.test(l);
  const trigLines = lines.filter(isTrigger);
  const staticLines = lines.filter((l) => !isTrigger(l));
  if (!trigLines.length || !staticLines.length) return false; // a pure-static or pure-trigger aura is already handled by its own tier
  if (!isNativeAura({ ...card, oracle: [enchantLine, ...staticLines].join("\n") })) return false;
  if (!permanentTriggersCovered({ ...card, oracle: trigLines.join("\n") })) return false;

  // ⛔ BOTH HALVES CHECK OUT IN ISOLATION AND THE CARD STILL DOES NOTHING. Each half above is verified on
  // TEXT THIS COMPOSITION INVENTED — the static half without its trigger, the trigger half without its
  // static. The runtime sees neither. On the printed card:
  //   • parseAuraBonus is all-or-nothing and the aura-own trigger line is NOT on its skip list, so the
  //     "+3/+3" is dropped — verified on a board, host stays 2/2;
  //   • checkDiesTriggers never enqueues an aura-own dies trigger (the Aura leaves with its host and is
  //     not scanned), so the token is never created — also verified on a board, pendingTriggers === 0.
  // Elephant Guide, Most Wanted and A-Most Wanted were credited native-trigger while doing NEITHER thing.
  //
  // Requiring the printed card's bonus to survive parks exactly those. It is the same rule the equipment
  // composite needed and the same one the aura-own-activated path needed: **a classifier that credits a
  // card on transformed text owes a check that the untransformed card still produces the effect.**
  //
  // CONTROL AURAS ASK THE SAME QUESTION OF A DIFFERENT MECHANISM (2026-08-03, census: "you control
  // enchanted creature" — 7 native carriers / 4 sole blockers). A control Aura has NO P/T-or-keyword
  // bonus by construction, so parseAuraBonus is empty for it no matter what, and the guard refused a
  // composition whose runtime is fine. The guard's real question is "does the PRINTED card still deliver
  // its static?", and for this family the deliverer is controlAura.isControlAura — which tests the printed
  // line directly and is therefore unaffected by a sibling trigger line, the exact property parseAuraBonus
  // lacks. Verified on a board rather than argued: with the FULL printed oracle, Biting Tether moves its
  // host ai1 -> user AND its upkeep trigger fires and lands the -1/-1 counter (controlAuraPlusTrigger.test.js).
  // Still a delivery CHECK, not a bypass — an Aura with neither a surviving bonus nor a control line fails.
  //
  // ⚠️ AND THE HONEST STATE OF THIS GUARD, MEASURED THE SAME DAY: deleting it outright moves ZERO cards
  // across all 34,245. Every card it was written to park has since been fixed AT THE SOURCE by the
  // AU-TRIG+BONUS validator skip — the aura-own trigger line no longer poisons parseAuraBonus, so those
  // bonuses survive and the cards are legitimately native. It is kept because the invariant is still
  // right (credit on transformed text owes a check on the untransformed card) and one parser change
  // could make it load-bearing again, but it is DEFENSIVE, not live, and its own doc above still names
  // Elephant Guide as a victim it no longer has. Said out loud so the next reader doesn't inherit that.
  // NO-UNTAP TAP-LOCK AURAS (2026-08-12 — Paralyze / Apathy, the UPKEEP-PLAYER MAY-PAY slice) — the
  // THIRD deliverer family, same argument as control auras directly above: the tap-lock line is enforced
  // by gameState.untapAll reading the PRINTED attachment (attachedNoUntapOf's regex), so a sibling
  // trigger line cannot poison it — the exact property parseAuraBonus lacks and isControlAura has. A
  // no-untap aura has no P/T-or-keyword bonus by construction, so without this arm the guard refused a
  // composition whose runtime delivery is fine. Still a delivery CHECK, not a bypass — an Aura with
  // neither a surviving bonus, nor a control line, nor the printed tap-lock line fails.
  if (parseAuraBonus(card).length === 0 && !isControlAura(card) && !attachedNoUntapOf(card)) return false;
  return true;
}

// GRANTED-ACTIVATED EQUIPMENT (subsystem 1 phase 1b) — an Equipment whose ONLY body is a modeled Equip
// cost + one-or-more granted activated abilities on the equipped creature ("Equipped creature has \"{T}:
// This creature deals 2 damage to any target.\"" — Bow of the Hunter, Viridian Longbow, Siren Song Lyre).
// The runtime (legalChoices.grantedActivatedForHost) already enumerates these on the equipped host. Gated
// SEPARATELY from permanentEquipmentCovered (which requires a P/T/keyword equipped-creature BONUS these
// have none of). All-or-nothing: every granted ability modeled + a modeled Equip line + NO other clause
// (a P/T bonus, a trigger, an unmodeled equip variant, a self-keyword → residue → Arbiter).
function isNativeActivatedGrantEquipment(card) {
  if (!/\bequipment\b/i.test(String(card?.type || ""))) return false;
  const granted = parseGrantedActivatedAbilities(card);
  if (!granted.length || !granted.every((a) => a.modeled)) return false;
  const oracle = stripReminder(String(card?.oracle || card?.oracle_text || ""));
  const grantLineRe = /^equipped creature\s+(?:has|have)\s+["“][^"”]+["”]\s*\.?$/i;
  // COUNT GUARD (CREED, mirrors the aura gate): a granted-TRIGGERED / granted-MANA "Equipped creature has …"
  // line is skipped by parseGrantedActivatedAbilities but would be whitelisted below — require grant-line
  // count === parsed count so any skipped grant counts as residue (keeps the card on the Arbiter).
  const grantLines = oracle.split(/\n+/).filter((l) => grantLineRe.test(l.trim())).length;
  if (grantLines !== granted.length) return false;
  let sawEquip = false;
  for (const rawLine of oracle.split(/\n+/)) {
    const t = rawLine.trim();
    if (!t) continue;
    if (/^equip\s*(?:[—–-])?\s*(?:\{[^}]+\})+$/i.test(t)) { sawEquip = true; continue; }    // a modeled Equip cost
    if (grantLineRe.test(t)) continue;                                                       // a granted-ability line
    // EQ-GRANT+TRIGGER (2026-08-04 — Mask of Immolation) — an Equipment's OWN triggered ability line is
    // not residue when it is fully covered on its own. Vouched by permanentTriggersCovered on the trigger
    // lines ALONE (the strip-then-revalidate discipline used by every composite in this file), so an
    // unmodeled or unrouted trigger still fails and still parks the card. The two halves are delivered by
    // independent runtimes: the trigger fires at the shared enterPermanent chokepoint, the granted ability
    // is enumerated on the host by legalChoices.grantedActivatedForHost.
    //
    // ⭐ DRIVEN ON A BOARD FIRST, because this card's ETB does something the classifier cannot see: "create
    // a 1/1 red Elemental token, THEN ATTACH THIS EQUIPMENT TO IT." Measured — the token is minted and the
    // Equipment really ends up attached to it. A routing check alone would not have proven that.
    if (/^(?:when|whenever|at)\b/i.test(t) && permanentTriggersCovered({ ...card, oracle: t })) continue;
    return false;                                                                            // any other clause = residue
  }
  return sawEquip;                                                                            // must actually be equippable
}

// GRANTED-MANA EQUIPMENT (subsystem 1 phase 1a — Paradise Mantle, SHELF W4) — an Equipment whose ONLY body
// is a modeled Equip cost + ONE granted tap-for-mana ability on the equipped creature ("Equipped creature
// has \"{T}: Add one mana of any color.\""). The runtime already plays it: layers.js emits the layer-6 mana
// grant for ANY attached permanent (parseAuraGrantedManaAbility, widened to equipped-creature clauses) and
// grantedManaSpecsFor → manaSources offers the host the tap. All-or-nothing: the grant parses + a modeled
// Equip line + NO other clause (any rider → residue → Arbiter, CREED).
function isNativeManaGrantEquipment(card) {
  if (!/\bequipment\b/i.test(String(card?.type || ""))) return false;
  if (!parseAuraGrantedManaAbility(card)) return false;
  const oracle = stripReminder(String(card?.oracle || card?.oracle_text || ""));
  const grantLineRe = /^equipped creature\s+(?:has|have)\s+["“][^"”]*\{t\}[^"”]*add[^"”]*["”]\s*\.?$/i;
  let sawEquip = false, sawGrant = false;
  for (const rawLine of oracle.split(/\n+/)) {
    const t = rawLine.trim();
    if (!t) continue;
    if (/^equip\s*(?:[—–-])?\s*(?:\{[^}]+\})+$/i.test(t)) { sawEquip = true; continue; }     // a modeled Equip cost
    if (grantLineRe.test(t)) { sawGrant = true; continue; }                                   // the granted-mana line
    return false;                                                                             // any other clause = residue
  }
  return sawEquip && sawGrant;
}

// GRANTED-TRIGGERED AURA/EQUIPMENT (subsystem 1 phase 1c) — an Aura/Equipment whose ONLY body is granting
// the host creature a triggered ability ("Enchanted creature has \"Whenever this creature deals combat
// damage to a player, you may draw a card.\"" — Sixth Sense; "\"At the beginning of your upkeep, create a
// 1/1 …\"" — Commander's Authority). The runtime (triggers.triggersForEvent) fires these on the host's
// event. All-or-nothing: every granted trigger routes natively (triggerRoutesNatively) AND no other body
// clause (an Equip line is allowed for equipment; any rider — a P/T bonus, a second unmodeled trigger, a
// restriction — keeps the card Arbiter).
function isNativeTriggerGrantAuraOrEquipment(card) {
  const ty = String(card?.type || "");
  const isAura = /\bAura\b/.test(ty);
  const isEquip = /\bequipment\b/i.test(ty);
  if (!isAura && !isEquip) return false;
  const granted = parseGrantedTriggeredAbilities(card);
  if (!granted.length || !granted.every(triggerRoutesNatively)) return false;
  const oracle = stripReminder(String(card?.oracle || card?.oracle_text || ""));
  // Accepts the pure grant line (Sixth Sense), the P/T-combined form (a "gets +X/+Y and has \"…\"" sword),
  // and the KEYWORD-combined form (Power Fist "has trample and \"Whenever …\"") — mirroring the extended
  // GRANTED_ABILITY_LINE in triggers.js so the two can't disagree on what counts as a grant line.
  const grantLineRe = /^(?:enchanted|equipped) creature\s+(?:gets?\s+[+-]\d+\/[+-]\d+\s+and\s+)?(?:has|have)\s+(?:[a-z][a-z ,]*?\s+and\s+)?["“][^"”]+["”]\s*\.?$/i;
  // A grant line carrying a STATIC half (a P/T bonus and/or a bare-keyword segment before the quote) — the
  // pure form has the quote immediately after has/have.
  const staticHalfRe = /^(?:enchanted|equipped) creature\s+(?:has|have)\s+["“]/i;
  // COUNT GUARD (CREED, mirrors the activated-grant gates): parseGrantedTriggeredAbilities only returns the
  // TRIGGERED grants; an activated / mana / unmodeled co-grant ("Enchanted creature has \"{5}: Untap …\"")
  // is whitelisted as a grant line below yet never routed — a silently-dropped ability while claiming native
  // coverage. Require grant-line count === parsed-triggered count so any non-triggered co-grant is residue
  // (sends the card to the Arbiter; a genuinely all-modeled multi-kind grant under-counts — a SAFE FN).
  const lines = oracle.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const grantLineList = lines.filter((l) => grantLineRe.test(l));
  if (grantLineList.length !== granted.length) return false;
  // STATIC-HALF GUARD (CREED): a combined grant line's P/T bonus / keyword segment is applied by the layer
  // engine via parseAttachedBonus — which is all-or-nothing and returns [] when any half is unmodeled (an
  // ungrantable keyword, a rider). If any grant line carries a static half, that parse must have succeeded,
  // or the card would claim native while the runtime silently drops the buff. Pure grant lines don't parse
  // to a bonus (nothing static to apply), so the gate only arms for combined lines.
  if (grantLineList.some((l) => !staticHalfRe.test(l))) {
    const bonus = isEquip ? parseEquipmentBonus(card) : parseAuraBonus(card);
    if (!bonus.length) return false;
  }
  let sawEquip = !isEquip;                                                                  // auras need no Equip line
  for (const rawLine of oracle.split(/\n+/)) {
    const t = rawLine.trim();
    if (!t) continue;
    if (/^enchant\b/i.test(t)) continue;                                                    // the Enchant keyword line
    if (/^equip\s*(?:[—–-])?\s*(?:\{[^}]+\})+$/i.test(t)) { sawEquip = true; continue; }    // a modeled Equip cost
    if (grantLineRe.test(t)) continue;                                                       // a granted-ability line
    return false;                                                                            // any other clause = residue
  }
  return sawEquip;
}

/**
 * Classify one card into a coverage tier. Input: { type, oracle, mana, name }
 * (the `publicCard` shape — type is the type line, oracle the full oracle text).
 */
export function classifyCard(card) {
  // LEYLINE opening-hand pre-strip (CR 103.6): "If this card is in your opening hand, you may begin the
  // game with it on the battlefield." is a PRE-GAME special action with ZERO in-play runtime effect — the
  // self-play engine never starts a game from an opening hand, and the line never changes how the permanent
  // behaves once it's on the battlefield. Strip it so an otherwise-fully-modeled permanent (Leyline Axe:
  // equip bonus + Equip {3}) isn't dragged to body-only by rules-neutral residue. CREED-safe + LOST-safe:
  // removing text can only let a card reach native, never demote one; every downstream check (equipment /
  // permanent body) then sees only the text that actually plays.
  if (/\bbegin the game with it on the battlefield\b/i.test(card?.oracle || "")) {
    card = {
      ...card,
      oracle: String(card.oracle).replace(/If this card is in your opening hand, you may begin the game with it on the battlefield\.?\s*/i, "").trim(),
    };
  }
  // SUSPEND pre-strip (CR 702.62), gated on the card HAVING A PRINTED MANA COST. Suspend is an optional
  // alternative way to start casting a card — "Rather than cast this card from your hand, pay {cost} and
  // exile it with N time counters". For a card with a real mana cost the HARD CAST resolves byte-identically,
  // so the line is vacuous exactly like flashback / escape / awaken, which textNormalize already strips on
  // the SPELL path (CAST_KEYWORD_LINE). Permanents never pass through that strip, so a creature whose only
  // other text was "Suspend 4—{1}{G}" (Durkwood Baloth, Ivory Giant, Duskrider Peregrine …) parked for a
  // line that cannot change how it plays. Not offering suspend stays a SAFE false negative.
  //
  // THE GATE IS THE WHOLE POINT. A card with NO mana cost — Lotus Bloom, Ancestral Vision, Crashing
  // Footfalls — can ONLY be played by suspending it (CR 202.1a: no mana cost means it can't be cast at all,
  // which slice 18 just enforced in legalChoices). Stripping the line there would claim a card the engine
  // can never put on the stack by any route. So the strip requires a non-empty printed cost, and those cards
  // keep the line as honest residue.
  if (String(card?.mana ?? card?.mana_cost ?? "").trim() && /^[ \t]*suspend \d+\s*[—–-]/im.test(card?.oracle || "")) {
    card = { ...card, oracle: String(card.oracle).replace(/^[ \t]*suspend \d+\s*[—–-][^\n]*$/gim, "").replace(/\n{2,}/g, "\n").trim() };
  }
  // NO-MAX-HAND pre-strip (2026-08-03) — the same shape as the two pre-strips above, and it lands HERE
  // for a reason. "You have no maximum hand size." is MODELED and genuinely ENFORCED: cleanupDiscardExcess
  // suspends the cleanup discard for a player controlling such a permanent. Measured on a CREATURE carrier
  // before this shipped (10 cards in hand → 0 required discards; the identical board without the line → 3).
  // The runtime reads the line off the permanent's own oracle at cleanup, so stripping it here changes
  // classification only — never behavior — and, like every strip, can let a card reach native but never
  // demote one.
  //
  // ⛔ IT IS A PRE-STRIP RATHER THAN A FOURTH CALL SITE, and that is the whole point. THREE residue lanes
  // judge this sentence independently — the native-body gate, permanentTriggersCovered, and (via
  // staticAbilitiesCoverCard / permanentFullyCovered) the static and composite lanes — and only the first
  // two ever stripped it. So a card pairing the line with a modeled STATIC parked while each half alone
  // classified native: Tishana, Voice of Thunder and Body of Knowledge, both carrying the identical
  // P/T-equals-hand-size CDA. Textbook "a judgement implemented in two places will drift, and the drift
  // only shows on inputs that need BOTH" — the runbook's fix for that is one shared source, not a patch on
  // the copy that happened to bite. Stripping once here means every lane below sees the same text.
  // (The two pre-existing call sites stay: those functions are exported and called directly elsewhere.)
  // A card that MODIFIES the maximum instead of removing it ("Your maximum hand size is four" — Cursed
  // Rack) does NOT match the anchored sentence and correctly stays residue → Arbiter.
  if (/\byou have no maximum hand size\b/i.test(card?.oracle || "")) {
    const stripped = stripModeledNoMaxHandSize(String(card.oracle)).trim();
    if (stripped !== String(card.oracle).trim()) card = { ...card, oracle: stripped };
  }
  // DISCARD-COST HAND ABILITY pre-strip (2026-08-03) — the SAME drift, one lane over. A
  // "<mana>, Discard this card: <effect>" ability is played from HAND, so no battlefield-oriented gate
  // can model it and every one of them reads the line as residue. `stripDiscardCostAbilityLine` already
  // removes it — but only inside `isKeywordOnly`, so the native-BODY lane saw a clean card while the
  // native-STATIC lane (staticAbilitiesCoverCard, which walks the raw clauses) saw leftover text. Waker
  // of Waves is the tell: its opponent anthem alone is native-static, its discard ability alone leaves a
  // native-body vanilla, and together they parked.
  //
  // Gated on the SAME `discardCostAbilityModeled` predicate `legalChoices.actionsDiscardAbilityFromHand`
  // offers on (line parses · effect HIGH · needs no chosen target), so a targeted ability the engine
  // REFUSES to offer — Steel Wrecking Ball, Trumpeting Carnosaur — is not stripped and still parks the
  // card. Stripping once here means every lane below sees one text; the in-`isKeywordOnly` call stays,
  // since that function is exported and called directly elsewhere.
  {
    const deLined = stripDiscardCostAbilityLine(String(card?.oracle || ""), card);
    if (deLined !== String(card?.oracle || "")) card = { ...card, oracle: deLined };
  }
  // SELF-NO-UNTAP pre-strip (2026-08-04) — the same "one lane strips, another doesn't" drift, on a
  // BATTLEFIELD static this time. "This artifact doesn't untap during your untap step." is enforced by the
  // runtime independently of any classification (gameState.untapAll consults cardSelfPreventsUntap, which
  // reads the card's own oracle), and stripModeledSelfNoUntap is its deliberate metric mirror — but it ran
  // only in the native-BODY and native-TRIGGER lanes. permanentFullyCovered, the COMPOSITE lane, walks the
  // raw clauses and has no static descriptor for it (clauseProducesStatic is false), so the line read as
  // residue there.
  //
  // Elaborate Firecannon is the tell, and an unusually clean one: EVERY PAIR of its three lines is native
  // (no-untap + activated → native-activated; activated + upkeep → native-mixed; no-untap + upkeep →
  // native-trigger) and only all three together parked. A three-way composition failure is not a missing
  // mechanic by definition — every piece is demonstrably understood.
  //
  // ⛔ THIS SHIPS ONLY BECAUSE THE NEWLINE-EATING FP WAS FIXED FIRST, and the order was not optional. On
  // its own this strip ALSO credited Time Vault, whose skip-your-turn replacement effect was being
  // silently swallowed by the "if you do" strip's newline-eating `\s*` — so it would have put a real FP on
  // a real card. Built, measured at a clean +3/0/0, and REVERTED for exactly that reason; the strip fix
  // landed, and now Time Vault correctly parks on its own unmodeled clause while the other two flip.
  // (The strip stays END-ANCHORED — its own doc explains why a CONDITIONAL variant must not match.)
  {
    const noUntapStripped = stripModeledSelfNoUntap(String(card?.oracle || ""), card?.name);
    if (noUntapStripped !== String(card?.oracle || "")) card = { ...card, oracle: noUntapStripped.trim() };
  }
  // PLOT pre-strip for PERMANENTS (2026-08-03) — the same zone-ability drift as the two strips above.
  // The plot line is already stripped on the SPELL path (parseEffectProgram) and inside the clone view,
  // but a PERMANENT that isn't a clone never met either: the Aura block returns long before both. Demonic
  // Ruckus is the carrier — bonus + a modeled LTB trigger is native-trigger, and adding "Plot {R}" parked
  // the whole card.
  //
  // ⭐ WHY STRIPPING IS HONEST HERE, and it is the SUSPEND test applied unchanged: plot is an ALTERNATIVE
  // way to cast a card that has a real printed mana cost, so the hard cast resolves byte-identically and
  // not offering plot would be a safe false negative. (Contrast the no-mana-cost suspend cards, which can
  // ONLY be played via the keyword — those keep their line.) `parsePlotCost` returns null for a
  // plot-TRIGGER or plot-GRANTING card, so only a clean modeled cost is ever removed.
  //
  // ⛔ AND THE CREDIT WAS DRIVEN, not assumed, because stripping makes the RUNTIME offer plot
  // (plotPlayable gates on isNativeTier(classifyCard)). The whole flow works for an Aura: plot is
  // offered, the card moves hand → exile, and on a later turn the free cast comes back as a real AURA
  // spell targeting a legal host. A plotted card that could not be cast from exile would be a dead end,
  // which is exactly the FP this check exists to rule out (plotAuraFromExile.test.js).
  if (parsePlotCost(card) && !/instant|sorcery/i.test(String(card?.type || ""))) {
    const noPlot = String(card.oracle || "").replace(/(?:^|\n)[^\n]*\bplot\s+(?:\{[^}]+\})+[^\n]*(?=\n|$)/i, "\n").trim();
    if (noPlot !== String(card.oracle || "").trim()) card = { ...card, oracle: noPlot };
  }
  // KW-SUSPEND, the NO-COST half (2026-08-02): the gate above stayed honest for exactly as long as
  // the engine couldn't suspend — that route EXISTS now (legalChoices actionsSuspendFromHand →
  // dispatcher `suspend` → fading.applySuspendUpkeep tick → the zero-counter free cast through the
  // real cast machinery). The credit reads THE SAME parseSuspendNoCost gate the runtime offers
  // through (noncreature, nonland, no printed cost, fixed suspend cost) — metric⇄runtime by
  // construction. A creature carrier (needs the suspend haste grant) or an X-cost suspend returns
  // null there and keeps its line as honest residue, exactly as before.
  if (!String(card?.mana ?? card?.mana_cost ?? "").trim() && parseSuspendNoCost(card)) {
    card = { ...card, oracle: String(card.oracle || card.oracle_text || "").replace(/^[ \t]*suspend \d+\s*[—–-][^\n]*$/gim, "").replace(/\n{2,}/g, "\n").trim() };
  }
  const type = String(card?.type || "").toLowerCase();
  const oracle = card?.oracle || "";
  // A planeswalker (PW-1) — keyed on the FRONT face (castsAsPlaneswalker) so a creature-front DFC
  // (Jace, Vryn's Prodigy) classifies by its creature side below, matching how it actually casts.
  // Native when EVERY loyalty ability is a fully-modeled HIGH program and there's no unmodeled
  // residual text (planeswalkerNativelyCovered, the all-or-nothing CREED gate); otherwise the whole
  // walker routes to the Ollama-only Arbiter (arbiter-pw). CHECKED BEFORE the land tier so a Land
  // Planeswalker (Wrenn and One — type "Land Planeswalker") with unmodeled loyalty isn't masked as
  // native-`land` (FIX-PW-LAND-ORDER): all-or-nothing wins — an unmodeled loyalty ability → arbiter-pw.
  if (castsAsPlaneswalker(card)) {
    if (planeswalkerNativelyCovered(card)) return "native-planeswalker"; // every loyalty ability modeled (counts native)
    if (planeswalkerPlayable(card)) return "playable-pw";                // PW-2 hybrid: plays, some abilities → Arbiter (NOT counted native)
    return "arbiter-pw";                                                 // unmodeled static/trigger residue → whole card to the Arbiter
  }
  // ADVENTURE (CR 715) — Bonecrusher Giant // Stomp et al. MUST be intercepted HERE, before the
  // instant/sorcery branch below: an Adventure card's COMBINED type line is "Creature — … // Instant/
  // Sorcery — Adventure", so `/\b(instant|sorcery)\b/.test(type)` would match and mis-route the whole card
  // to spellIsNative on the COMBINED oracle (→ arbiter-spell, never reaching the registry classifier). The
  // additive-seam registry runs only AFTER this branch, so the seam alone can't catch it. classifyAdventure
  // splits the two faces and credits native-mixed iff BOTH halves are modeled (all-or-nothing CREED); a
  // non-adventure card or an unmodeled half returns null and we fall through to the normal dispatch.
  {
    const advTier = classifyAdventure(card);
    if (advTier) return advTier;
    // An adventure card that DIDN'T flip native (one half unmodeled) must NOT fall into the instant/sorcery
    // branch (which would mis-parse the combined oracle). It's a permanent (the creature half enters the
    // battlefield) whose adventure-spell or creature ability is unmodeled → body-only (the creature still
    // plays; the unmodeled half routes to the Arbiter at cast). parseAdventureCard is the gate.
    if (parseAdventureCard(card)) return "body-only";
  }
  // SPLIT CARDS (CR 709) — intercepted here for the same reason as adventure: the combined "Sorcery // Sorcery"
  // type line would mis-route to spellIsNative on the mashed oracle. classifySplit credits native-spell iff BOTH
  // halves' effects are modeled; a split card that DIDN'T flip (an unmodeled half, or fuse/aftermath) must NOT
  // fall into the instant/sorcery branch below (which parses the combined oracle) — it's an instant/sorcery
  // whose whole cast routes to the Arbiter → arbiter-spell. parseSplitCard is the gate.
  {
    const splitTier = classifySplit(card);
    if (splitTier) return splitTier;
    if (parseSplitCard(card)) return "arbiter-spell";
  }
  // ⭐ LANDS ARE GATED NOW (Codex fix #3, 2026-08-30). This used to be an unconditional `return "land"` —
  // every card with Land on its type line counted fully native, including utility lands whose abilities
  // the engine has never modeled (Mystifying Maze's untargeting exile, man-land animations, conditional
  // taplands whose condition the runtime never evaluates). That inflated every coverage number the
  // project steers by. A land is "land" (native) ONLY when landFullyCovered vouches every line of its
  // text; otherwise it's "land-partial" — PLAYABLE (the land drop + any modeled mana still work at
  // runtime, exactly like playable-pw) but NOT native, so it counts in the gap it belongs to.
  if (/\bland\b/.test(type)) return landFullyCovered(card) ? "land" : "land-partial";
  // A DFC with a planeswalker BACK face but a non-PW front (Jace, Vryn's Prodigy; Valki // Tibalt)
  // enters as its front at runtime; its transform + back face are unmodeled, so it's NEVER native.
  // Classify body-only directly — running the creature native classifiers on the combined oracle could
  // false-positive (a stray "Add"/keyword line) and wrongly count it native (CREED). Caught here,
  // before those classifiers.
  if (isPlaneswalker(card)) return "body-only";
  if (/\b(instant|sorcery)\b/.test(type)) {
    return spellIsNative(card) ? "native-spell" : "arbiter-spell";
  }
  // An Aura's oracle describes effects on the ENCHANTED permanent, not the Aura itself, so the
  // generic permanent classifiers below (mana / trigger / activated / static) would mis-read
  // its text (e.g. a granted "{T}: Add …" on the enchanted land reads as a mana ability the
  // Aura doesn't have). An Aura is EITHER fully native (enter + attach + a clean
  // enchanted-creature bonus, no residue) OR body-only — whose cast routes to the Arbiter
  // seam, never a do-nothing permanent. Exhaustive + first, so no Aura slips into a wrong tier.
  // AURA-LAND-MANA-BOOST: a land-enchant Aura whose only effect is a "tapped for mana" boost (Wild
  // Growth / Overgrowth / Fertile Ground) enters + attaches to a land and adds mana inline when it
  // taps (manaModel.landAuraManaBonus). Checked before the creature-aura gate (single source of truth
  // — isNativeManaAura), so the metric credits EXACTLY the cards the runtime plays natively, no
  // over-claim: an Aura that is neither a clean creature-aura nor a clean mana-aura stays body-only.
  // SAGA (CR 714 — SHELF S7, Vault 12): a Saga is native ONLY when its chapter list parses
  // all-or-nothing (parseSagaChapters — any residue line/gap/unknown numeral ⇒ null) AND detectTriggers
  // synthesized exactly one descriptor per chapter AND every chapter's effect routes natively (the SAME
  // shared gate the runtime flush uses, so the metric can't claim a chapter the engine would drop).
  // Checked BEFORE the Aura block (a Saga is an enchantment; a Saga that is ALSO an Aura stays in this
  // gate's all-or-nothing hands, never half-read as a plain Aura). Any failure ⇒ body-only (Arbiter).
  if (isSagaCard(card)) {
    const parsed = parseSagaChapters(card);
    if (!parsed) return "body-only";
    const descs = detectTriggers(card);
    const chapterDescs = descs.filter((d) => d.event === "sagaChapter");
    return descs.length === chapterDescs.length
      && chapterDescs.length === parsed.chapters.length
      && chapterDescs.every((d) => triggerRoutesNatively(d))
      ? "native-trigger"
      : "body-only";
  }
  if (isAuraCard(card)) {
    if (isNativeManaAura(card)) return "native-mana-aura";
    // GRANTED-MANA-ABILITY (creature OR land host): "Enchanted creature/land has \"{T}: Add …\"" (Multani's
    // Harmony; Settlement / Sheltered Aerie) — the host gains a clean tap-for-mana source through the existing
    // grantedManaSpecsFor runtime (creature = no-own-prod fallback; land = the dominating-grant supplement).
    if (isNativeManaGrantAura(card)) return "native-mana-aura";
    // LA-1 — the mana-grant aura WITH a modeled aura-own ETB rider (Gift of Paradise, Abundant Growth,
    // Weirding Wood): the grant is the same phase-1a machinery; the ETB fires through checkEnterTriggers.
    if (isNativeManaGrantAuraWithEtb(card)) return "native-mana-aura";
    // GRANTED-ACTIVATED (subsystem 1 phase 1b): "Enchanted creature has \"{cost}: {effect}\"" (Hermetic
    // Study, Midnight Covenant, Sadistic Obsession) — the host gains an activated ability the runtime
    // enumerates + resolves (legalChoices.grantedActivatedForHost). All-or-nothing: every granted ability
    // modeled AND no other body clause (a rider keeps it Arbiter).
    if (isNativeActivatedGrantAura(card)) return "native-activated";
    // AURA-OWN-ACTIVATED: an Aura with PRINTED "{cost}: Tap/Untap enchanted creature" abilities (Freed from
    // the Real) — the runtime enumerates the abilities on the Aura and taps/untaps its host via the fixed
    // target:"enchanted" referent. All-or-nothing (isNativeOwnActivatedAura): every printed ability is a
    // modeled aura-safe enchanted-tap/untap + no residue, else Arbiter.
    if (isNativeOwnActivatedAura(card)) return "native-activated";
    // GRANTED-TRIGGERED (1c): "Enchanted creature has \"Whenever/At …\"" (Sixth Sense, Commander's Authority)
    // — the host gains a triggered ability the runtime fires on the host's event (triggers.triggersForEvent).
    if (isNativeTriggerGrantAuraOrEquipment(card)) return "native-trigger";
    // ORDEAL (BLITZ OC-1): the exact Theros Ordeal template — attacks→counter→threshold-sac→"when you
    // sacrifice" payoff, both descriptors routing natively (see isNativeOrdealAura above). native-trigger:
    // the whole body is the Aura's OWN two triggered abilities, fired by checkAttackTriggers (attached
    // linkage) and checkSacrificeTriggers (the youSacrificeThis look-back, CR 603.10a).
    if (isNativeOrdealAura(card)) return "native-trigger";
    // PLAYER-AURA (Fraying Sanity / the Curse class — SHELF S7, CR 303.4): an "Enchant player" Aura whose
    // whole body (the Enchant line aside) is natively-routed TRIGGERS. The runtime lane: legalChoices
    // offers the cast per living player target (gated on THIS tier, so metric and offer can't drift),
    // AURA_ETB enters it with enchantedPlayerId stamped, the elimination sweep moves it to the graveyard
    // when its player leaves. All-or-nothing: any non-trigger residue keeps it body-only (Arbiter).
    if (isPlayerAuraCard(card)) {
      const stripped = String(card.oracle || card.oracle_text || "").replace(/(?:^|\n)\s*Enchant player\s*(?=\n|$)/i, "\n");
      return permanentTriggersCovered({ ...card, oracle: stripped }) ? "native-aura" : "body-only";
    }
    // AURA-OWN-TRIGGERED (BLITZ AU-3): a creature/permanent-enchant Aura whose whole body (the Enchant line
    // aside) is its OWN printed triggered abilities that every detect + route natively (isNativeOwnTriggeredAura
    // — the sibling of the aura-own ACTIVATED gate above, with a trigger condition in place of an activation
    // cost). native-trigger: the Aura is the trigger SOURCE (CR 603.2), fired off triggerSourcesOf (Auras
    // included) with "enchanted creature" referents resolving to the host via ctx.sourceId. Checked AFTER the
    // player-Aura lane (which owns "Enchant player") and BEFORE isNativeAura (a card with any static bonus fails
    // the residue walk, so the two lanes are disjoint — a pure own-trigger Aura has no bonus for isNativeAura).
    if (isNativeOwnTriggeredAura(card)) return "native-trigger";
    // AU-ACT+TRIG (Fiery Mantle): the aura-own ACTIVATED + aura-own TRIGGERED composition. Tiered
    // native-activated to match its pure sibling (Firebreathing), which is what the card mostly is — the
    // trigger is a rider. Placed after the pure lanes so neither tier is stolen (see the fn's doc).
    if (isNativeOwnActivatedPlusTriggeredAura(card)) return "native-activated";
    // isNativeAura keeps PRIORITY: an Aura already fully native (its whole body a modeled creature bonus + an
    // aura-own activated pump/tap it already handles — Shiv's Embrace, Armor of Faith) stays native-aura and
    // keeps its own cast lane (legalChoices' isNativeAura branch). The EQ-2 composite runs ONLY on the residue-
    // carrying auras isNativeAura rejects.
    if (isNativeAura(card)) return "native-aura";
    // EQ-2 — the static-grant + self-sac-activated composite (Capashen Standard, Illuminated Wings, Crackling
    // Club, Inferno Fist): an Aura whose creature bonus is modeled AND whose remaining "{cost}: effect" line is
    // a modeled activated ability the plain native-aura residue walk rejects. Tiered native-activated so
    // grantAuraCastHostType's cast lane offers it (isNativeAura is FALSE on the full residue-carrying card).
    // Called HERE, before body-only, because the aura block returns before the registry seam.
    // AU-GRANT+STATIC — the composite EQ-2's GUARD-QUOTE deliberately refuses: an Aura whose body is a
    // modeled GRANTED ability PLUS a modeled static bonus (Pillory of the Sleepless, Compulsory Rest, Utopia
    // Vow — all three print "Enchanted creature can't attack or block."). Each half is native ALONE and the
    // pair fell out the bottom, because every Aura lane above is all-or-nothing and the lanes are disjoint.
    // ⚠️ THIS LANE SHIPS ONLY BECAUSE THE RUNTIME HALF LANDED FIRST. Built once before and REVERTED: the
    // grant line was dropping the Aura's whole static bonus in parseAttachedBonus, so the tier would have
    // claimed a "can't attack or block" the engine no longer applied. The validator skip fixed that; the
    // before/after and its positive control are pinned in auraGrantPlusStatic.test.js.
    // ⭐ Neither gate is loosened: split by line, hand the remainder to isNativeAura and the Enchant+grant
    // lines to the grant gate that already claimed that shape — the EQ-2 strip-then-revalidate discipline.
    {
      const t = nativeGrantPlusAuraStatic(card);
      if (t) return t;
    }
    {
      const t = nativeStaticGrantPlusActivated(card);
      if (t) return t;
    }
    // AU-GY (2026-08-03, census signature "{2}{R}: Return this card from your graveyard to your hand" —
    // 6 native carriers / 3 sole blockers): an Aura whose body is a modeled creature bonus PLUS the
    // GRAVEYARD self-recursion ability (Bestial Bloodline, Talons of Wildwood, Convenient Target). That
    // ability is modeled — by its OWN lane, from the graveyard — so `parseActivatedAbilities` reports it
    // unmodeled (it is not a battlefield activation) and isNativeAura's residue walk rejected the line,
    // parking cards whose every clause the engine plays. Exactly the shape permanentFullyCovered already
    // composes for non-Auras (census slice 56); Auras never reached it because this block returns first.
    //
    // Strip-then-revalidate, same discipline as EQ-2 above: the remainder must satisfy isNativeAura ON ITS
    // OWN and the stripped line must be a modeled graveyard ability ON ITS OWN. Neither gate is loosened.
    // Tiered native-activated so grantAuraCastHostType's lane offers the CAST — isNativeAura is false on
    // the full residue-carrying card, so tiering it native-aura would credit an Aura the engine never
    // offers (the FP that tier choice exists to avoid).
    //
    // ⭐ RUNTIME MEASURED FIRST, on an AURA rather than the creature carriers the lane was built for:
    // the ability is offered off the graveyard, goes on the stack, resolves, and the Aura actually moves
    // graveyard → hand — identical to the Sanitarium Skeleton control. (The first probe read as a no-op
    // because it stopped at dispatch; the ability uses the stack, so it needed resolveTopOfStack. Assert
    // after resolution or an activated ability always looks dead.)
    {
      const gyLines = [];
      const rest = String(card.oracle || card.oracle_text || "").split("\n").filter((line) => {
        const one = { ...card, oracle: stripReminder(line).trim() };
        if (!one.oracle) return false;
        if (parseGraveyardSelfRecursion(one) || parseGraveyardExileAbility(one)) { gyLines.push(line); return false; }
        return true;
      });
      if (gyLines.length && isNativeAura({ ...card, oracle: rest.join("\n") })) return "native-activated";
    }
    return "body-only";
  }
  // A clone (CR 707) — a creature whose WHOLE text is "enters as a copy of a creature" — now
  // plays natively (it suspends on a copy-choice and enters as a snapshot). Checked before the
  // generic classifiers (its copy clause isn't a trigger/static/mana ability they'd recognize).
  // COST-KEYWORD PRE-STRIP: isCloneCard reads the RAW oracle, so a "Plot {cost}" (Visage Bandit) or
  // Convoke/Affinity line makes parseCloneSpec require the whole oracle be the copy clause and return null →
  // body-only. Those are cost-only keywords the runtime hard-casts at full cost (CREED-safe, the Ninjutsu/
  // Convoke precedent), so stripping them for the copy-SHAPE detection can never over-claim a non-clone.
  // ⭐ NINJUTSU joins that pre-strip on its OWN precedent rather than by widening the cost-only list (it is
  // an alternative ENTRY, not a cost reduction). isKeywordOnly has credited the bare "Ninjutsu {cost}" line
  // since KW-NINJUTSU above, but nothing called that credit from HERE — so Sakashima's Student, whose clone
  // half parses perfectly, parked at body-only with the keyword line still sitting in front of the copy
  // clause. Handled-over-there is not handled-here. Dropped only in this copy-SHAPE view; the card's real
  // residue is still validated all-or-nothing by parseCloneSpec's own `$`-anchor and own-ability tail.
  const cloneCard = {
    ...card,
    oracle: stripNinjutsuCostLines(stripCostOnlyKeywordLines(
      parsePlotCost(card)
        ? String(card.oracle || "").replace(/(?:^|\n)[^\n]*\bplot\s+(?:\{[^}]+\})+[^\n]*(?=\n|$)/i, "\n")
        : String(card.oracle || ""),
    )),
  };
  // COVERED KEYWORD LINE (2026-08-04) — the SAME allowance the aura-own activated lane just got, for the
  // same reason and on the same evidence: `parseCloneSpec` treats a bare keyword line as residue, so
  // Stunt Double ("Flash" + a fully modeled copy clause) parked on the one word this project already
  // credits everywhere else (a vanilla Flash creature is native-body). Dropped only from THIS clone-shape
  // VIEW, exactly like the ninjutsu/cost-only strips it sits inside — the card's real residue is still
  // validated by parseCloneSpec's own anchors. An UNCOVERED keyword line fails isKeywordOnly, survives
  // the strip, and still parks the card.
  const cloneNoKeywordLines = String(cloneCard.oracle || "").split("\n")
    .filter((ln) => ln.trim() && !isKeywordOnly(ln.trim(), card?.name)).join("\n");
  if (isCloneCard(cloneCard) || isCloneCard({ ...cloneCard, oracle: cloneNoKeywordLines })) return "native-clone";
  // Permanent (creature / artifact / enchantment / battle): the body always works.
  // TRUNK-ENTERSCOUNTERS: the modeled "enters with N +1/+1 counters" replacement (CR 614.1c + 122.6a) is covered — the
  // resolver adds the counters on enter. Strip that one sentence from the residue (derived from the SAME
  // entersWithPlusCounters the engine uses), so a card whose only non-keyword text is enters-with-counters
  // classifies native-body. The card-level guard never strips a conditional/variable form (those return 0).
  // ENTERS-WITH-X: a hydra "enters with X +1/+1 counters" is modeled too (the resolver adds the chosen X
  // at ETB) — strip that sentence so a hydra whose only non-keyword text is enters-with-X classifies native.
  // ETB-XCOUNTERS-FROM-METRIC: enters with +1/+1 counters whose count is a board metric ("for each other
  // creature you control" — Squad Captain; "X = greatest power among other creatures" — Prime Speaker Zegana)
  // is modeled too (the resolver resolves the metric via countForSpec at ETB). Strip that one sentence when
  // entersWithMetricCounters confirmed one of its two exact shapes, so a card whose only non-keyword text is the
  // metric enters-with clause classifies native-body (Squad Captain = Vigilance + metric → native-body). Cards
  // with extra unmodeled text (Sheriff's Plot; Zegana's draw trigger) keep their other clauses → not stripped here.
  // DOUBLE-X (CR 107.3): a {X}{X} cost (Walking Ballista, Cryptic Trilobite) owes 2X — the cost machinery now
  // counts the X pips (parseManaCost.xCount → legalChoices.xResolvedCost pays generic + xCount*X), so a multi-X
  // card is paid CORRECTLY (2X, not the old underpaying X). The X→counters resolver still threads the single
  // chosen X (xValue) into the counters — the count is X, the cost is 2X. So enters-with-X is credited for ANY
  // X-pip count (xPipCount >= 1). xPipCount is still read because a card with NO {X} pip but the enters-with-X
  // text (none in the real corpus) must not be credited — the X must be a real cost pip the player pays.
  const xPipCount = (String(card?.mana || card?.mana_cost || "").match(/\{[XYZ]\}/gi) || []).length;
  // PLOT (CR 702.171): "Plot {cost}" is a modeled alternate cast-timing special action (the runtime
  // exiles the card at sorcery speed for the plot cost, then casts it FREE from exile on a later turn —
  // legalChoices.actionsPlotFromHand / actionsCastPlottedFromExile). A plotted card resolves through the
  // SAME applyCastSpell path a hand-cast uses, so the card is native iff its NON-plot text is native.
  // Strip the whole "Plot {cost} (reminder…)" LINE (line-anchored, reminder parens and all) when
  // parsePlotCost confirms a clean modeled plot cost — so a card whose only other text is modeled (Sheriff
  // = metric counters; Spinewoods Paladin = Trample + ETB gain-life) classifies native, exactly the cards
  // the runtime will plot + flip natively. parsePlotCost returns null for a "when/whenever … plot" trigger
  // and for plot-GRANTING cards (Fblthp), so neither is stripped (CREED whole-card). Applied FIRST so the
  // counter/tap strips and every downstream gate see the plot-free residue.
  const plotStrippedRaw = parsePlotCost(card)
    ? oracle.replace(/(?:^|\n)[^\n]*\bplot\s+(?:\{[^}]+\})+[^\n]*(?=\n|$)/i, "\n")
    : oracle;
  // WARP (CR 702.176) — "Warp {cost}" is an alternative cast cost from hand (cast cheaper, exile at the next
  // end step, recast from exile later). Like Plot it changes ONLY how/when the card is cast, never the
  // permanent's printed abilities; the runtime hard-casts at full cost and the body resolves identically (the
  // "exile at end step" rider applies ONLY to a warp cast the engine never offers). Strip the whole "Warp
  // {cost} (reminder…)" line (line-anchored, reminder parens and all) when parseWarpCost confirms a clean
  // modeled cost, so a card whose only other text is modeled (Exalted Sunborn = Flying, lifelink + a token
  // doubler) reaches the downstream gates on its bare body and classifies native — exactly the card the
  // runtime plays. parseWarpCost is null for a "when/whenever … warp" trigger, so that's never stripped (CREED).
  const warpStrippedRaw = parseWarpCost(card)
    ? plotStrippedRaw.replace(/(?:^|\n)[^\n]*\bwarp\s+(?:\{[^}]+\})+[^\n]*(?=\n|$)/i, "\n")
    : plotStrippedRaw;
  // CONVOKE / AFFINITY on a PERMANENT spell (Thrumming Hivepool — "Affinity for Slivers"): strip the cost-only
  // keyword line so the downstream trigger/static/mixed gates see the body alone. Affinity changes only the
  // cast cost (the artifact ALSO has a printed {6}); the runtime hard-casts at full cost and the permanent's
  // abilities resolve identically — the unmodeled scaler can never mis-resolve (THE CREED, Ninjutsu precedent).
  // Without this, the bare "Affinity for Slivers" line is unmodeled residue → body-only despite the group-keyword
  // grant + upkeep token trigger both being fully modeled (→ native-mixed once stripped).
  const costOnlyStrippedOracle = stripCostOnlyKeywordLines(warpStrippedRaw);
  // SELF-COST-REDUCTION (CR 601.2f) — "This spell costs {X} less to cast, where X is …" is a CAST-cost modifier
  // the runtime applies at the cast site (selfCostReductionMetric → the legalChoices cost path) regardless of
  // the card's coverage tier, EXACTLY like the Affinity/Convoke cost-only keywords stripped above. Strip the
  // modeled self-metric sentence so a permanent whose ONLY other text is modeled (Cavern-Hoard Dragon = Flying,
  // trample, haste + a combat-damage Treasure trigger) reaches the trigger/mixed gates on its bare body and
  // classifies native — the runtime still reduces its cast. Gated to the EXACT modeled shape (selfCostReductionMetric);
  // an unmodeled cost line never matches → no strip → stays Arbiter (CREED whole-card). classifySelfCostReduction
  // (the keyword-only flip) is unaffected — it runs its own strip on the raw oracle for the no-trigger case.
  const plotStrippedOracle = selfCostReductionMetric(card)
    ? costOnlyStrippedOracle.replace(SELF_COST_SENTENCE_RE, " ")
    : costOnlyStrippedOracle;
  // KW-RAVENOUS — the enters-with-X counters live in REMINDER parens ("Ravenous (This creature enters with X
  // +1/+1 counters on it. …)"), which the printed-form strip below would half-match: it eats up to the first
  // "…on it." INSIDE the paren and leaves the mangled "If X is 5 or more, draw a card when it enters.)" tail as
  // orphan residue — AND destroys the reminder signature detectTriggers keys on (dropping the synthesized draw
  // trigger). Skip the strip for Ravenous: the WHOLE reminder is removed wholesale by stripReminder in every
  // downstream residue gate (permanentTriggersCovered / isKeywordOnly), leaving the bare covered "ravenous"
  // keyword — so no printed-form strip is needed or wanted here (CREED — never leave a partial fragment).
  const isRavenous = /\bravenous\b\s*\(this creature enters with x \+1\/\+1 counters? on it\b/i.test(oracle);
  // ⭐ GRAFT takes the RAVENOUS exemption, for the identical reason spelled out directly above. Graft's
  // enters-with sentence lives ONLY inside the keyword's reminder parens ("Graft 2 (This creature enters
  // with two +1/+1 counters on it. Whenever another creature enters, …)"). The strip below is not
  // paren-aware, so it cuts at "…on it." INSIDE the paren and leaves the mangled
  // "Graft 2 ( Whenever another creature enters, …)" behind as orphan residue with an unbalanced paren —
  // which parks the card.
  // ⛔ THIS ONLY BIT ONCE entersWithPlusCounters STARTED READING THE GRAFT COUNT off the keyword: before
  // that it returned 0 and this branch was never taken. A fix in one file walked the card into a landmine
  // in another, and the symptom was indistinguishable from "the keyword still isn't credited".
  // Skipping the strip is safe and is what Ravenous already does: stripReminder removes the WHOLE reminder
  // in every downstream residue gate, leaving the bare covered "graft N" keyword — never a partial fragment.
  const isGraft = /^graft \d/im.test(oracle) || /^graft (?:a|an|one|two|three|four|five|six)\b/im.test(oracle);
  // ⭐ THE −1/−1 TWIN gets the SAME strip, gated on the SAME helper the resolver reads — single source of
  // truth, so a card can never be credited for a line the resolver won't honour (or the reverse).
  const baseOracle = entersWithMinusCounters(card) > 0
    ? plotStrippedOracle.replace(/[^.\n]*enters (?:the battlefield )?with (?:a|an|one|two|three|four|five|six|seven|\d+) -1\/-1 counters? on it[^.\n]*\.?/i, " ")
    : entersWithPlusCounters(card) > 0 && !isGraft
    // "on him/her" mirrors the READER's widening (staticAbilityParser 2026-08-14, Hulk Strongest There
    // Is) — strip and reader must accept the same referent set or the credited sentence stays as residue.
    ? plotStrippedOracle.replace(/[^.\n]*enters (?:the battlefield )?with (?:a|an|one|two|three|four|five|\d+) \+1\/\+1 counters? on (?:it|him|her)[^.\n]*\.?/i, " ")
    : entersWithXCounters(card) && xPipCount >= 1 && !isRavenous
      ? plotStrippedOracle.replace(/[^.\n]*enters (?:the battlefield )?with x \+1\/\+1 counters? on it[^.\n]*\.?/i, " ")
      : entersWithMetricCounters(card)
        ? plotStrippedOracle.replace(/[^.\n]*enters (?:the battlefield )?with [^.\n]*\+1\/\+1 counters?[^.\n]*\.?/i, " ")
        // ⭐ CONVERGE ENTERS-WITH (CR 702.117a) — "Converge — This creature enters with a +1/+1 counter on it
        // for each color of mana spent to cast it." Stripped ONLY when convergeEntersCounters confirms the
        // whole-sentence form, the same single-source-of-truth discipline every branch above uses: the
        // helper the RESOLVER reads is the helper that authorises the strip, so a card can never be credited
        // for a sentence the runtime won't honour.
        // ⛔ The strip is anchored to `^converge —` so it takes the WHOLE labelled sentence and nothing else;
        // the generic enters-with strips above lead with `[^.\n]*` and would have left the "Converge —"
        // label behind as residue.
        : convergeEntersCounters(card)
          ? plotStrippedOracle.replace(/^[ \t]*converge\s*[—–-]\s*this creature enters with [^.\n]*for each color of mana spent to cast it\.?/im, " ")
          : plotStrippedOracle;
  // ENTERS-WITH extensions (BLITZ EW-1; CR 614.1c + 122.6a) — three more modeled enters-with-counter shapes,
  // each stripped ONLY when its parser (the SAME helper the resolver reads — single source of truth) confirms
  // the whole-sentence anchored form, so a rider variant is never silently dropped (the strips below carry NO
  // trailing [^.]* slop: the sentence must end at the matched clause, mirroring the parsers' ^…$ anchors).
  //   • NAMED counters ("~ enters with three charge counters on it" — the Trigons; oil / shield / stun /
  //     keyword kinds): credited ONLY for an HONEST kind (isHonestEnterCounterKind — inert vocabulary,
  //     modeled-semantics shield/stun per CR 122.1c/1d, or an enforced CR 122.1b keyword counter). A fade/
  //     time/finality/unknown kind is NOT stripped → the card parks (a shield that doesn't shield would be a
  //     forbidden FP; an unread fade counter would silently skip the vanishing sacrifice).
  //   • CONDITIONAL counters ("Morbid — … enters with four +1/+1 counters on it if a creature died this
  //     turn"; Raid / Ferocious / opponent-lost-life): credited ONLY when spellConditionParseable confirms
  //     the condition is in the interveningIf vocabulary the resolver evaluates at ETB — the metric⇄runtime
  //     shared gate (Patient Turtle's "you didn't go first this game" fails it → parks).
  //   • CHOICE keyword counters ("… your choice of a deathtouch counter or a lifelink counter" — Boot Nipper;
  //     Grimdancer's two-of-three): the parser fails closed unless EVERY option is an enforced 122.1b kind;
  //     the resolver auto-picks (first `pick` printed options) and permanentHasKeyword honors the counter.
  const namedEnterCtr = entersWithNamedCounters(card);
  const namedEnterOracle = namedEnterCtr && isHonestEnterCounterKind(namedEnterCtr.type)
    ? baseOracle.replace(/[^.\n]*\benters (?:the battlefield )?(?:tapped )?with (?:a|an|one|two|three|four|five|\d+) [a-z]+ counters? on (?:it|him|her)\.?/i, " ")
    : baseOracle;
  const condEnterCtr = entersWithConditionalCounters(card);
  const condEnterOracle = condEnterCtr && spellConditionParseable(condEnterCtr.condition)
    ? namedEnterOracle.replace(/[^.\n]*\benters with (?:a|an|one|two|three|four|five|\d+) \+1\/\+1 counters? on (?:it|him|her) if [^.\n]*\.?/i, " ")
    : namedEnterOracle;
  const ewOracle = entersWithChoiceCounters(card)
    ? condEnterOracle.replace(/[^.\n]*\benters with your choice of [^.\n]*\.?/i, " ")
    : condEnterOracle;
  // ENTERS-TAPPED: actionDispatcher handles unconditional "enters tapped" via entersTapped() — credit it
  // here by stripping that sentence from the oracle so it doesn't block coverage on cards whose remaining
  // text is fully modeled (triggers / activated / static / mixed). etCard propagates the stripped oracle
  // through all downstream checks; etOracle combines with baseOracle for the keyword-only gate.
  // The enters-with-counters strip (baseOracle) must ALSO flow into etCard so the downstream
  // trigger/activated/static/mixed gates don't re-see the (already-modeled, already-credited) enters-with
  // sentence as unmodeled residue. Without this a hydra like Goldvein (enters-with-X + a modeled dies→Treasure
  // trigger) failed permanentTriggersCovered on the leftover enters-with-X line and fell to body-only, even
  // though every one of its clauses is modeled. etCard now carries the counter-stripped oracle exactly as it
  // already carries the tap-stripped one.
  const tapRe = /[^\n.]*\benters (?:the battlefield )?tapped\b[^\n.]*\.?\n?/gi;
  // LANDS-TIER (2026-09-02): a CONDITIONAL "enters tapped unless <condition>" sentence is credited here
  // too, on the same reader the enter sites consult (it vouches only conditions the shared evaluator can
  // read). tapRe already spans the whole sentence through the condition, so the strip needs no change.
  // LANDS-TIER slice 2: the SHOCKLAND sentence pair ("As this land enters, you may pay N life. If you don't, it
  // enters tapped.") — tapRe spans only the second sentence, so the pair is stripped as ONE line by shockRe
  // first, on the same reader both enter sites consult (paysLifeOrEntersTapped).
  const shock = paysLifeOrEntersTapped(card);
  const shockRe = /^[ \t]*as this land enters, you may pay \d+ life\. if you don't, it enters tapped\.?[ \t]*$/gim;
  // LANDS-7: the REVEAL-LANDS sentence pair, stripped as ONE line the same way (tapRe alone spans only the
  // "If you don't" half), on the same reader both enter sites consult.
  const reveal = revealLandTypes(card);
  const revealRe = /^[ \t]*as this land enters, you may reveal an? [a-z]+(?: or [a-z]+)? card from your hand\. if you don't, (?:this land|it) enters tapped\.?[ \t]*$/gim;
  const isTapped = entersTapped(card) || !!entersTappedUnlessCondition(card) || !!shock || !!reveal;
  // CREW (BLITZ VH-1, CR 702.121): "Crew N" is a modeled special-activation line — legalChoices.
  // actionsCrewVehicle offers it (tap own creatures with total power ≥ N, auto-picked sick-first),
  // actionDispatcher.applyCrewVehicle taps + animates (a layer-4 endOfTurn Creature type-add; printed P/T
  // and printed keyword lines apply once it's a creature; a same-turn-entered vehicle is stamped
  // summoning-sick — CR 302.6). Strip the line (the plot/warp/enters-tapped precedent) so a Vehicle whose
  // OTHER text is modeled reaches the downstream gates on its bare body — a keyword-only Vehicle rides
  // isKeywordOnly to native-body; one with modeled triggers reaches the trigger gates. LOST-safe (a strip
  // only ever adds coverage); an unmodeled non-crew clause still blocks downstream (whole-card CREED).
  // LINE-START anchored (the parseCrewCost shape exactly): only the printed "Crew N …" keyword line strips.
  // A clause merely CONTAINING "crew N" (Imposter Mech's clone rider "…enter as a copy … with crew 3 and it
  // loses all other card types") must NOT be eaten — that residue keeps such a card parked (CREED).
  // KW-RIOT (BLITZ RT-1, CR 702.136) — "Riot (This creature enters with your choice of a +1/+1 counter or
  // haste.)" is an ENTERS-WITH-CHOICE replacement (CR 702.136a) MODELED at the entry chokepoint
  // (resolvers.enterPermanent): the deterministic house auto-pick picks HASTE when the permanent enters on
  // its controller's own turn at/before the declare-attackers step (so it could swing this turn — a layer-6
  // permanent-duration addKeyword Haste grant, honored by every summoning-sick gate that pairs with
  // permanentHasKeyword("Haste")), else an additional +1/+1 counter added AS it enters (applyCounterDoubling,
  // CR 616). Strip the whole printed "Riot …" keyword LINE (line-initial, reminder and all) — the plot/warp/
  // crew precedent — so a carrier whose OTHER text is modeled reaches the downstream gates on its bare body
  // (Zhur-Taa Goblin → native-body; Frenzied Arynx = Trample + self-pump → native-activated). GATED on
  // riotKeywordCount>0 (structural, grant-safe) so a "…have riot" GRANT line (Rhythm of the Wild / Uncivil
  // Unrest / Spider-Punk's grant — never line-initial "Riot", never counted) is NEVER stripped → those stay
  // body-only (their grant is unmodeled). LINE-START anchored so only the printed keyword line strips; a
  // clause merely CONTAINING "riot" is untouched. LOST-safe (a strip only ever adds coverage).
  const riotN = riotKeywordCount(card);
  const riotOracle = riotN > 0 ? ewOracle.replace(/(?:^|\n)[ \t]*riot\b[^\n]*(?=\n|$)/gi, "\n") : ewOracle;
  const crewRe = /(?:^|\n)\s*crew \d+\b[^\n]*(?=\n|$)/gi;
  const hasCrew = /\bvehicle\b/.test(type) && parseCrewCost(card) != null;
  const crewOracle = hasCrew ? riotOracle.replace(crewRe, "\n") : riotOracle;
  const shockStripped0 = shock ? crewOracle.replace(shockRe, "") : crewOracle;
  const shockStripped = reveal ? shockStripped0.replace(revealRe, "") : shockStripped0;
  const etOracle = isTapped ? shockStripped.replace(tapRe, "\n").trim() : crewOracle;
  const etCard = crewOracle !== oracle || isTapped
    ? { ...card, oracle: (isTapped ? shockStripped.replace(tapRe, "\n") : crewOracle).trim() }
    : card;
  // CREED — AN ADDITIONAL CAST COST ON A PERMANENT IS NOT ENFORCED (census slice 33). extractAdditionalCosts
  // is consumed ONLY on the spell program path (parser.js), so legalChoices gates and the dispatcher charges
  // these costs for instants/sorceries and for nothing else. A permanent carrying one is therefore castable
  // for its bare mana cost — strictly cheaper than printed, the same over-permissive shape as the free
  // Ancestral Visions cast. Two cards reached native this way (Soulbright Seeker, Lys Alana Dignitary, both
  // "behold an X or pay {2}") and are parked here until the permanent cast path charges the cost too.
  //
  //   DO NOT WIDEN THIS TO ALTERNATIVE COSTS. An ADDITIONAL cost makes the card MORE expensive, so skipping
  //   it is cheaper-than-printed — the forbidden direction. An ALTERNATIVE cost ("You may pay {1} and return
  //   a basic land rather than pay this spell's mana cost" — the Borderpost cycle) is OPTIONAL and usually
  //   cheaper, so not offering it means the engine pays the FULL printed cost: an under-offer, which is the
  //   safe direction. Five Borderposts read native for exactly that reason and are correct (checked
  //   2026-07-25) — parking them would lose real cards to fix nothing.
  //   READ THE REMINDER-STRIPPED TEXT. A real additional cost is never inside reminder parens, but the
  //   PHRASE appears in the reminder text of several keywords, on 16 permanents that print no such cost at
  //   all (Wasteland Raider, Ruthless Radrat, Securitron Squadron …). Testing the raw oracle would park
  //   those for a cost they don't have. Latent rather than live today — all 16 are body-only for other
  //   reasons — but it is the same loaded gun as the "your NEXT untap step" credit, so it is closed here.
  //
  // ⭐ THE PIN GRADUATED (2026-07-30) — its premise above is now FALSE for a VETTED cost. legalChoices
  // derives a permanent's additional cost beside its (null) program and offers one cast per legal way to
  // pay, and actionDispatcher charges it; Demon of Catastrophes' sacrifice victim really does leave the
  // battlefield now. So the park NARROWS to exactly what is still unenforced: a cost the parser does not
  // vet. That gate is `extractAdditionalCosts` — the SAME call the runtime gates on, so the metric cannot
  // claim a cost the runtime does not charge. Vetted → the cost is handled, so judge the REST of the card.
  if (/\bas an additional cost to cast this spell,/i.test(String(oracle || "").replace(/\([^)]*\)/g, " "))) {
    const { costs: acCosts, rest: acRest } = extractAdditionalCosts(String(oracle || ""));
    if (!acCosts) return "body-only";                    // unvetted → still cast for free → park (unchanged)
    return classifyCard({ ...card, oracle: acRest });     // acRest has the AC sentence removed — no recursion
  }
  if (isKeywordOnly(stripModeledNoMaxHandSize(stripModeledSelfNoUntap(etOracle, card?.name)), card?.name)) return "native-body";
  // FIX-MANA-OVERCLAIM: a mana source counts native-mana only when its non-mana trigger text is modeled
  // too (else it falls through to the all-or-nothing trigger/activated/mixed gates → body-only/Arbiter).
  // VARIABLE-X MANA: the "Add X mana … where X is <modeled metric>" form (Sanctum Weaver) is admitted via
  // hasModeledVariableXMana — gated on manaProduction returning a runtime amountSpec, so an unmodeled-metric
  // X source (Wirewood Channeler) stays body-only (no over-claim). The same residue gate then applies.
  // DOUBLE-MANA-POOL (Doubling Cube): a no-stack mana ability that doubles the pool — admitted to the
  // native-mana tier alongside "Add …" sources (the runtime resolves it via applyDoubleManaPool). The same
  // residue gate applies, so a variant with unmodeled non-mana body text (none in the corpus) stays Arbiter.
  // ⚠️ REACHABILITY (census slice 38) — `hasManaAbility` is a TEXT check: it sees "Add {G}" and says yes.
  // The RUNTIME produces mana through manaProduction, which refuses anything that isn't a standing source —
  // a costed activation ("{T}, Sacrifice a Forest: Add …"), a dynamic amount ("Add {C} for each charge
  // counter"), a colour chosen as the permanent entered, a second mana ability on the same card. Crediting
  // on text alone claimed 154 cards whose mana the engine cannot obtain BY ANY PATH — verified by driving
  // each on a board and asking manaSources AND the trigger path, not by reading.
  //
  // The same principle is already applied to the variable-X admission on the line above; this extends it to
  // the plain "Add …" case, which is where the over-claim lived. hasModeledVariableXMana and
  // hasDoubleManaPoolAbility keep their own admissions — the doubler produces no mana of its own, so
  // manaProduction is correctly silent for it.
  //
  // A card whose mana is TRIGGERED (Burning-Tree Emissary's "When this creature enters, add {R}{G}") is not
  // dropped by this: it falls through to the trigger tier below, which is where it belonged — the mana
  // really is delivered, just not by a standing source. Losing the native-MANA label is the correction.
  if (((hasManaAbility(oracle, String(etCard?.type ?? etCard?.type_line ?? "")) && manaProduction(etCard)) || hasModeledVariableXMana(etCard) || hasDoubleManaPoolAbility(etCard)) && manaCardResidueModeled(etCard, etOracle)) return "native-mana";
  // Single-mechanism tiers first (the informative labels), then the composite catch-all for
  // multi-ability creatures whose pieces are each modeled but span types.
  if (permanentTriggersCovered(etCard)) return "native-trigger";   // P2.8: body + only-routing triggers
  if (permanentActivatedCovered(etCard)) return "native-activated"; // P2.9: body + only-modeled activated abilities
  if (staticAbilitiesCoverCard(etCard, isKeywordOnly)) return "native-static"; // P2.10: body + only-modeled static anthems
  if (isNativeActivatedGrantEquipment(etCard)) return "native-equipment"; // 1b: Equip + a granted activated ability on the host
  if (isNativeManaGrantEquipment(etCard)) return "native-equipment"; // 1a: Equip + a granted tap-for-mana ability on the host (Paradise Mantle)
  if (isNativeTriggerGrantAuraOrEquipment(etCard)) return "native-trigger"; // 1c: Equip + a granted triggered ability on the host
  if (permanentEquipmentCovered(etCard)) return "native-equipment"; // attach: Equip + a clean equipped-creature bonus
  // ADDITIVE registry seam (WAVE 0): a future slice registers a coverage classifier instead of editing
  // this dispatch body. Each classifier is `(card) => tier | null` consulted ONLY after all the inline
  // single-mechanism tiers (which keep priority) and BEFORE the composite catch-all — so a new tier
  // slots in without touching the existing order. The first classifier to return a truthy tier wins.
  // Empty by default, an exact no-op (the loop body never runs), so existing classification is untouched.
  for (const c of COVERAGE_CLASSIFIERS) {
    const t = c(etCard);
    if (t) return t;
  }
  if (permanentFullyCovered(etCard)) return "native-mixed";        // composite: modeled trigger + activated + static together
  return "body-only";
}

export const NATIVE_TIERS = new Set(["land", "native-mana", "native-body", "native-spell", "native-trigger", "native-activated", "native-static", "native-equipment", "native-aura", "native-mana-aura", "native-clone", "native-mixed", "native-planeswalker"]);
export const isNativeTier = (tier) => NATIVE_TIERS.has(tier);

/**
 * EVERY tier classifyCard can return, in display order (natives, then playable, then the gap).
 *
 * THE SINGLE SOURCE for any tier breakdown. Before this existed, measure-coverage.mjs carried TWO
 * hardcoded tier arrays that had already drifted apart: `native-mana-aura` was missing from BOTH (so
 * those cards were silently absent from every reported breakdown), and the deck-level array was also
 * missing `native-planeswalker` + `playable-pw`. A tier that no dashboard prints is a tier nobody
 * notices is wrong — the same drift genus as the mass-scope trap.
 *
 * coverageTiers.test.js asserts this list matches the tier literals classifyCard actually returns, so
 * adding a tier without adding it here fails the suite instead of quietly vanishing from the reports.
 */
export const ALL_TIERS = Object.freeze([
  // native
  "native-mana", "native-body", "native-spell", "native-trigger", "native-activated",
  "native-static", "native-equipment", "native-aura", "native-mana-aura", "native-mixed",
  "native-clone", "native-planeswalker", "land",
  // playable but not native
  // land-partial (Codex fix #3): a land with text the engine doesn't fully model — the land drop and any
  // modeled mana still play (like playable-pw's loyalty subset), but the card is NOT native and counts in
  // the gap. The unconditional every-Land-is-native short-circuit this replaces inflated every number.
  "playable-pw", "land-partial",
  // the gap
  "body-only", "arbiter-spell", "arbiter-pw",
]);

// Mechanism buckets for the gap (priority-ordered; first match wins) — the roadmap.
const BUCKETS = [
  ["ETB trigger", /when(ever)?\b[^.]{0,50}enters/i],
  ["Dies/LTB trigger", /when(ever)?\b[^.]{0,50}(dies|leaves the battlefield|put into a graveyard)/i],
  ["Attacks/blocks trigger", /when(ever)?\b[^.]{0,50}(attacks|blocks|deals combat damage)/i],
  ["Upkeep/phase trigger", /at the beginning of/i],
  ["Cast/spell trigger", /when(ever)? (you|a player|an opponent) cast/i],
  ["Activated ability", /(\{[^}]+\}|^[a-z ,'-]{1,40})\s*:\s/im],
  ["Static anthem/buff", /(creatures? you control|other creatures)[^.]{0,30}(get|gets|have|has)/i],
  ["Enters-as/replacement", /\bas (this|it) enters|\benters (the battlefield )?(tapped|with|as)/i],
  ["Static (aura/equip)", /\b(enchant|equipped creature|enchanted|as long as)\b/i],
  ["Spell effect (other)", /\b(draw|destroy|exile|return|counter|deals?|gains?|create|search|each|target)\b/i],
];

/** The dominant unmodeled mechanism on a card's oracle text (for roadmap bucketing). */
export function mechanismBucket(oracle) {
  const t = stripReminder(oracle);
  for (const [name, re] of BUCKETS) if (re.test(t)) return name;
  return "Other / unclassified";
}

/**
 * Summarise coverage over a list of enriched cards.
 * Input: [{ type, oracle, mana, name, qty }]. Returns counts by tier (weighted by
 * qty), the native percentage, and the gap bucketed by mechanism.
 */
export function coverageSummary(cards) {
  const tiers = {};
  const gap = {};
  let total = 0;
  let native = 0;
  for (const card of cards) {
    const qty = card.qty || 1;
    total += qty;
    const tier = classifyCard(card);
    tiers[tier] = (tiers[tier] || 0) + qty;
    if (isNativeTier(tier)) {
      native += qty;
    } else {
      const b = mechanismBucket(card.oracle || "");
      gap[b] = (gap[b] || 0) + qty;
    }
  }
  return { total, native, pct: total ? Math.round((native / total) * 100) : 0, tiers, gap };
}

// ─── COUNTER/TOKEN DOUBLER — full-card coverage (generalizes the pure-doubler seam) ─────────────
// A card carrying a runtime-modeled doubler (doublerProfile → applyCounterDoubling / tokenMultiplier, consulted
// at every counter-placement and token-mint regardless of tier) is native when its NON-doubler text is fully
// modeled too (CREED whole-card). Three cases:
//   • pure doubler Enchantment (Doubling Season, Branching Evolution, Primal Vigor) → native-static (unchanged).
//   • doubler on a vanilla/keyword body (Corpsejack 4/4; Vorinclex trample,haste; Adrix & Nev Ward {2}) →
//     native-static — the doubler is the only ability and the runtime already applies it.
//   • doubler MIXED with other abilities that are EACH independently modeled (a routing trigger / modeled
//     activated / modeled static) → native-mixed, self-guarded by permanentFullyCovered on the doubler-stripped
//     card. (Solid Ground = earthbend-ETB + additive counter doubler; earthbend ETB resolves end-to-end —
//     verified by an ETB→flush→resolve probe that placed the +1/+1 counter on the animated land. The wave-1
//     worry that this was an FP was a MISDIAGNOSIS: Badgermole Cub etc. stay body-only because of their OWN
//     unmodeled SECOND abilities (tap-for-mana / mass-counter / CDA-power), NOT a reminder-strip bug.)
// ANY unmodeled residue (Warp on Loading Zone/Exalted Sunborn, an unmodeled activated on Mondrak, the token-
// HALVE of Halving Season) → null → stays Arbiter/body-only.
// The Mauhúr-style subtype-recipient over-fire is excluded upstream (doublerProfile returns no counter profile),
// so it never reaches here. Registered via the additive WAVE-0 seam (after single-mechanism tiers, before the
// composite catch-all).
function doublerCardTier(card) {
  if (!doublerProfile(card)) return null;
  if (isPureDoubler(card)) return "native-static";
  // Pass `card` so a SELF-scope doubler clause (Mowu — "…would be put on Mowu…") is recognized by its short
  // name and stripped, leaving only the keyword body (Vigilance, trample) for the isKeywordOnly check below.
  const strippedOracle = stripModeledDoublerClauses(card?.oracle || "", card);
  if (isKeywordOnly(strippedOracle, card?.name)) return "native-static"; // doubler + vanilla/keyword body
  if (permanentFullyCovered({ ...card, oracle: strippedOracle })) return "native-mixed"; // doubler + other modeled abilities
  return null;
}
registerCoverageClassifier(doublerCardTier);

// ─── SOULBOND (BLITZ SL-1, CR 702.95) — pairing + bond grant ─────────────────────────────────────
// A soulbond creature confers a BOND ability on itself + its paired partner while both stay under its control
// (CR 702.95a/b/e). NATIVE when the bond is a static +N/+N and/or grantable keyword(s) (parseSoulbondBond — the
// SAME parse layers.staticEffectsOf emits at runtime, so metric ≡ runtime) AND every OTHER clause is
// keyword-only (stripSoulbondText removes the soulbond keyword + the bond sentence; a printed Flying/Reach on
// the body survives and passes isKeywordOnly). PARKS (null) when the bond is a quoted triggered/activated
// ability (Tandem Lookout, Deadeye Navigator, Doom Weaver, Breathkeeper Seraph, Galvanic Alchemist, …),
// protection from a subtype (Diregraf Escort's "protection from Zombies"), or the card carries other unmodeled
// text (Donna Noble's damage-redirect + Doctor's companion) — the whole-card-or-park law. RUNTIME:
// resolvers.enterPermanent auto-pairs at ETB (deterministic policy — first eligible unpaired creature),
// layers.staticEffectsOf grants the bond to both ids while paired, and gameState.detachPermanentFromAll /
// control.applyGainControl tear the pairing down on leave / control-change (CR 702.95e).
function soulbondCardTier(card) {
  const bond = parseSoulbondBond(card);
  if (!bond) return null;                                            // not a soulbond carrier, or bond unmodelable → park
  if (isKeywordOnly(stripSoulbondText(card), card?.name)) return "native-static";
  return null;                                                       // other unmodeled residue → park
}
registerCoverageClassifier(soulbondCardTier);

// ─── MANA-MULTIPLIER — full-card coverage (mirrors doublerCardTier) ──────────────────────────────
// A card carrying a runtime-modeled mana multiplier (manaMultiplierProfile → manaModel.manaMultiplier,
// consulted at every tap-for-mana) is native when its NON-multiplier text is fully modeled too (CREED
// whole-card). Two cases — neither has any activated/triggered body, so the mixed case can't arise:
//   • pure replacement Enchantment (Mana Reflection — "If you tap a permanent for mana, it produces twice
//     as much …") → native-static.
//   • multiplier on a vanilla/keyword body (Nyxbloom Ancient — Trample + the ×3 replacement) → native-static.
// ANY unmodeled residue → null → stays Arbiter/body-only. Registered via the additive WAVE-0 seam (after
// single-mechanism tiers, before the composite catch-all), so the existing classification order is untouched.
function manaMultiplierCardTier(card) {
  if (!manaMultiplierProfile(card)) return null;
  const strippedOracle = stripModeledManaMultiplierClauses(card?.oracle || "");
  if (isKeywordOnly(strippedOracle, card?.name)) return "native-static"; // multiplier + vanilla/keyword body
  return null;
}
registerCoverageClassifier(manaMultiplierCardTier);

// ─── GLOBAL TAP-FOR-MANA AUGMENT — full-card coverage (mirrors manaMultiplierCardTier) ──────────────
// A PERMANENT whose triggered mana ability "Whenever you tap a <land|creature> for mana, add [an
// additional] <fixed single-color pips>" is runtime-modeled (parseGlobalTapManaAugment →
// manaModel.globalTapManaAugment, consulted at every tap-for-mana on both read-sites) is native when its
// NON-augment text is fully modeled too (CREED whole-card). The boost is a triggered MANA ability that
// resolves inline (no stack, no targets), so it carries no activated/triggered body of its own — the only
// allowed residue is a modeled keyword (Groundchuck & Dirtbag's "Trample"). Strip the augment line, then
// require the remainder keyword-only via the SAME isKeywordOnly the other keyword-body tiers use; any
// non-keyword rider (Leyline of Abundance's opening-hand clause + activated ability, Badgermole Cub's
// earthbend ETB, Nirkana Revenant's {B} pump — all subtype-gated or rider-dense) survives the strip → null
// → stays body-only/Arbiter. Registered via the additive WAVE-0 seam (after single-mechanism tiers, before
// the composite catch-all), so the existing classification order is untouched.
function globalTapManaAugmentTier(card) {
  if (!parseGlobalTapManaAugment(card)) return null;
  const stripped = stripGlobalTapManaAugment(card);
  if (isKeywordOnly(stripped, card?.name)) return "native-trigger"; // augment + vanilla/keyword body
  // COMPOSE (Regal Behemoth) — the augment-stripped remainder may itself be a fully-native trigger body
  // ("Trample\nWhen this creature enters, you become the monarch."). Reclassify the remainder; if it is a
  // native tier, the whole card is native-mixed (the tap-augment mana + the native trigger body). No
  // recursion: parseGlobalTapManaAugment(stripped) is null (the augment line is gone), so this classifier
  // returns null immediately for the stripped card. FP-safe — an UNMODELED remainder trigger classifies
  // body-only, so the card does not flip.
  const remainderTier = classifyCard({ ...card, oracle: stripped });
  if (isNativeTier(remainderTier)) return "native-mixed";
  return null;
}
registerCoverageClassifier(globalTapManaAugmentTier);

// GROUP-ACTIVATED grant (queue 1) — inject the modeled-body gate into staticAbilityParser's group-grant
// emission (it can't import parseActivatedAbilities directly — a load-time cycle through the atoms registry).
// With this registered, a card whose only non-keyword text is a fully-modeled group-activated grant ("All
// Slivers have \"{2}: Regenerate this permanent.\"") classifies native-static via staticAbilitiesCoverCard,
// and legalChoices offers the ability on every affected permanent (layers.grantedActivatedQuotedFor).
registerGroupActivatedBodyValidator(isModeledGroupActivatedBody);

// LEVEL UP (BLITZ LV-1, CR 702.87 / 711) — inject the whole-card leveler gate into staticAbilityParser's
// band-statics emission (same load-cycle rationale as the group validators above), and register the
// classifier: a WHOLLY-modeled leveler — the level-up activated ability (CR 702.87a rewrite through the
// standard activated lane) + every band being printed P/T + closed-vocabulary keywords + fully-modeled
// band-gated activated abilities — is native. The metric consumes the SAME modeledLeveler parse the
// runtime offers/emits from (abilities lane + band statics + band anthems), so they cannot drift. A banded
// GROUP anthem ("Other creatures you control get +X/+Y" — Kabira Vindicator / Coralhelm Commander) is now
// wired (BLITZ SG-1): staticAbilityParser emits it as a layer-7c ptModifyGated over the OTHER creatures, its
// gate carrying gateOn:"source" so layers reads the SOURCE's level band, not each affected permanent. Any
// OTHER unmodeled band line (islandwalk, protection, a "can't be blocked…" static, a banded trigger, a
// banded mana ability — the mana lane has no band gate) ⇒ modeledLeveler null ⇒ the card stays body-only
// and the runtime emits nothing for it (whole-card-or-park).
registerLevelerCardValidator(modeledLeveler);
registerCoverageClassifier((card) => (modeledLeveler(card) ? "native-mixed" : null));

// GROUP-TRIGGERED grant (Tempered Sliver) — inject the modeled-body gate into staticAbilityParser's
// group-triggered-grant emission. A quoted body is a valid group-triggered grant iff it parses to one-or-more
// triggers (detectTriggers) that ALL route natively (triggerRoutesNatively — the SAME gate the Aura/Equipment
// granted-triggered path uses). With this registered, a card whose only non-keyword text is a fully-modeled
// group-triggered grant ("Sliver creatures you control have \"Whenever this creature deals combat damage to a
// player, put a +1/+1 counter on it.\"") classifies native-static via staticAbilitiesCoverCard, and
// triggers.triggersForEvent fires the granted trigger on every affected permanent (layers.grantedTriggeredQuotedFor).
registerGroupTriggeredBodyValidator(isModeledGroupTriggeredBody);

// UNTIL-EOT QUOTED GRANT (BLITZ TG-1 — Feign Death / Showstopper family): inject the SAME two modeled-body
// gates into the grant-until-eot clause parser (grantUntilEot.js can't import them directly — a load cycle
// through parser.js / the atoms registry). With these registered, "Until end of turn, target creature
// [gets +N/+M and] gains \"<body>\"" / "…creatures you control gain \"<body>\"" parses HIGH exactly when the
// quoted body is fully modeled as a triggered OR an activated grant — the same all-or-nothing standard the
// static group grants live by. Unvalidated body → LOW → Arbiter.
registerGrantTriggeredBodyValidator(isModeledGroupTriggeredBody);
registerGrantActivatedBodyValidator(isModeledGroupActivatedBody);

// PZ-1: inject the aura-own-ETB validator into staticAbilityParser (the group-validator pattern — it
// can't import detectTriggers without a load cycle). With this registered, isNativeAura's residue walk
// and bonus walk admit "When this Aura enters, <natively-routing effect>" lines (tap enchanted
// creature / draw a card / you gain 3 life), fired at the enterPermanent chokepoint like any ETB.
registerAuraOwnEtbValidator(isModeledAuraOwnEtbLine);

// ⭐ AU-GRANT+BONUS — vouch for a GRANTED QUOTED ABILITY clause so parseAttachedBonus can skip it instead of
// dropping the Aura's whole static bonus (the runtime defect proven in auraGrantPlusStatic.test.js).
// ⛔ NO NEW PARSING. The clause is wrapped back into a minimal single-grant Aura and handed to the SAME three
// gates that already claim that shape when it is a card's only body — so this can vouch for exactly what the
// engine already delivers, and an unmodeled grant returns false and still poisons the bonus parse (CREED).
// Anchored on the "<subject> has \"…\"" shape; a clause without a quoted ability never reaches the gates.
function isModeledAuraGrantedAbilityLine(clause) {
  const s = String(clause || "").trim();
  if (!/^enchanted \w+ has\s+["“]/i.test(s)) return false;
  const probe = { name: "GrantProbe", type: "Enchantment — Aura", oracle: `Enchant creature\n${s}` };
  return !!(isNativeTriggerGrantAuraOrEquipment(probe) || isNativeActivatedGrantAura(probe) || isNativeManaGrantAura(probe));
}
registerAuraGrantedAbilityValidator(isModeledAuraGrantedAbilityLine);

// ⭐ AU-TRIG+BONUS — vouch for the AURA'S OWN NON-ETB TRIGGER so parseAttachedBonus can skip it instead of
// dropping the Aura's whole static bonus. Same defect and same shape as AU-GRANT+BONUS above; the runtime
// half (the trigger actually firing on the host's death, CR 603.10a) landed FIRST — see
// auraHostDiesTrigger.test.js — because a metric that runs ahead of its runtime is worse than a parked card.
//
// ⛔ CALLS permanentTriggersCovered DIRECTLY, NOT isNativeOwnTriggeredAura, and that is deliberate rather
// than a shortcut: isNativeOwnTriggeredAura consults isNativeAura, which calls parseAttachedBonus, which
// calls THIS — a load-order recursion straight back into the parse we are being asked about. The probe is a
// single-trigger Aura, so permanentTriggersCovered is exactly the gate that would claim it anyway (it is
// that function's own first branch). No new parsing: an aura-own trigger the engine cannot route returns
// false, still poisons the bonus parse, and keeps the whole card non-native.
//
// The ETB form is left to registerAuraOwnEtbValidator — one shape must not have two vouchers that can disagree.
function isModeledAuraOwnTriggerLine(clause) {
  const s = String(clause || "").trim();
  if (!/^(?:when|whenever|at)\b/i.test(s)) return false;
  if (/^when this aura enters\b/i.test(s)) return false; // owned by the ETB validator
  // ⚠️ THE TRAILING PERIOD IS LOAD-BEARING. abilityClauses hands parseAttachedBonus clauses with sentence
  // punctuation already stripped, and the trigger-sentence counter behind permanentTriggersCovered is
  // sentence-anchored — so the bare clause scores 0 detected sentences and the gate says false for a trigger
  // it would otherwise claim. Cost a full diagnostic cycle: the identical string WITH a period returned true.
  const sentence = /[.!?]$/.test(s) ? s : `${s}.`;
  return !!permanentTriggersCovered({ name: "AuraTriggerProbe", type: "Enchantment — Aura", oracle: sentence });
}
registerAuraOwnTriggerValidator(isModeledAuraOwnTriggerLine);

// AURA-OWN-ACTIVATED validator (BLITZ AF-1 — Armor of Faith / Stonehands / the Firebreathing kin):
// a "{cost}: <effect>" line printed ON THE AURA is admitted (bonus-walk skip + strict-fn pass) only when
// it parses as EXACTLY ONE fully-modeled, non-mana activated ability whose program is exclusively
// enchanted-referent atoms (tap / untap / pump target:"enchanted") — the isNativeOwnActivatedAura
// discipline, per line. The runtime side is already whole: legalChoices enumerates the Aura's printed
// ability on the Aura permanent, and the atom resolves onto the host via the enchanted referent.
function isModeledAuraOwnActivatedLine(line) {
  const abs = parseActivatedAbilities({ name: "AuraOwnActProbe", type: "Enchantment — Aura", oracle: String(line || "") });
  if (abs.length !== 1) return false;
  const a = abs[0];
  if (!a.modeled || a.isManaEffect) return false;
  // ⛔ GUARD-LEAVE, now needed HERE too. A cost that removes the AURA ITSELF (sacrifice/exile this Aura)
  // DETACHES the host, so an effect referencing "enchanted creature" has nothing to resolve onto — the
  // engine can't play it. nativeStaticGrantPlusActivated has always refused those; this validator did not
  // have to care while its caller only ever handed it MANA-cost lines. The moment the pre-filter widened to
  // any cost, Briar Shield / Thrull Retainer / Stamina / Carapace started skipping their self-sac line,
  // keeping their static half, and going native — four false positives, caught by the two GUARD-LEAVE pins
  // that already existed. The rule belongs on both paths, not one.
  if (a.sacSelf || a.exileSelf) return false;
  const prog = a.program;
  return !!prog && Array.isArray(prog.atoms) && prog.atoms.length > 0 && prog.structure !== "modal"
    // REGENERATE joins tap/untap/pump: identical shape (one atom, `target:"enchanted"`, resolved onto the
    // host through the same referent), and leaving it out had a cost only a RUNTIME check exposed. An
    // Aura's own regenerate line was NOT skipped by parseAttachedBonus, so it poisoned the all-or-nothing
    // bonus parse and the card's printed "+N/+N" never reached the battlefield while the card still
    // classified native. See scripts/probe-dropped-attached-grants.mjs.
    && prog.atoms.every((at) => (at.op === "tap" || at.op === "untap" || at.op === "pump" || at.op === "regenerate") && at.target === "enchanted");
}
registerAuraOwnActivatedValidator(isModeledAuraOwnActivatedLine);

// DIFFUSION SLIVER (group-ward analogue) — a card whose whole text is the modeled group-ward trigger
// ("Whenever a Sliver creature you control becomes the target of a spell or ability an opponent controls,
// counter that spell or ability unless its controller pays {2}") classifies native-trigger. detectTriggers has
// no "becomes the target" event, so permanentTriggersCovered/permanentFullyCovered leave it body-only (count
// mismatch) — this registry classifier (consulted before the composite catch-all) credits it, mirroring how
// the runtime enforces it (actionDispatcher's groupWardTax at the cast/ability chokepoints reuses the ward
// soft-counter). isNativeGroupWard is all-or-nothing (any rider → body-only), so the credit is honest.
registerCoverageClassifier((card) => (isNativeGroupWard(card) ? "native-trigger" : null));

// KIRA, GREAT GLASS-SPINNER (hard-counter group-ward analogue) — a card whose only non-keyword text is the
// modeled group grant ("Creatures you control have \"Whenever this creature becomes the target of a spell or
// ability for the first time each turn, counter that spell or ability.\"") classifies native-trigger. Like
// Diffusion, detectTriggers has no "becomes the target" event so the composite path leaves it body-only; this
// registry classifier credits it, mirroring the runtime (actionDispatcher/gameEngine's applyKiraTargetCounter
// at the four target-choice chokepoints hard-counters the first targeting each turn). isNativeKira is
// all-or-nothing — its residue (minus the grant) must be KEYWORD-ONLY (Kira's own Flying is honored; any
// unmodeled rider → body-only), so the credit is honest. isKeywordOnly injected to keep kiraTargetCounter a leaf.
registerCoverageClassifier((card) => (isNativeKira(card, isKeywordOnly) ? "native-trigger" : null));

// GY SELF-RECURSION (BLITZ GY-1, CR 602.2 — Reassembling Skeleton / Sanitarium Skeleton class): a card
// whose only non-keyword text is the modeled graveyard-activated return line ("<mana>: Return this card
// from your graveyard to your hand / the battlefield [tapped]") classifies native-activated — the SAME
// parseGraveyardSelfRecursion the legalChoices enumerator and the dispatcher key on, so the metric can't
// claim a line the runtime doesn't offer. All-or-nothing: any residue beyond keywords → null → body-only.
registerCoverageClassifier((card) => {
  const rec = parseGraveyardSelfRecursion(card);
  if (!rec) return null;
  const residue = stripReminder(String(card?.oracle || card?.oracle_text || ""))
    .split("\n").map((l) => l.trim()).filter((l) => l && l !== rec.raw).join("\n");
  if (!residue) return "native-activated";
  return isKeywordOnly(residue, card?.name) ? "native-activated" : null;
});

// SELF DAMAGE-PREVENTION statics (BLITZ FOG-1 / PV-1, CR 615 — Guard Gomazoa / Dawn Elemental / Fog Bank
// class): a creature whose only non-keyword text is the printed self prevent-all wall classifies
// native-static — the SAME selfDamagePrevention / selfDamagePreventionBy reads both damage paths consult
// (the combat funnel zeroes the TO form on the damaged creature AND the BY form on the dealer;
// applyDamageEffect zeroes the ALL-TO form), so the metric can't claim a wall the runtime doesn't enforce.
// PV-1 extends the stripped line to Fog Bank's compound "…dealt to and dealt by this creature" form and the
// "…dealt by this creature" (BY) form, and normalizes the printed card NAME (and legendary short name) to
// "this creature" the way selfDamagePrevention's selfOracle does — so the name form (Cho-Manno "…dealt to
// Cho-Manno.") strips clean, aligning the metric with the runtime that already read it through selfOracle.
// All-or-nothing: any residue beyond keywords → null → body-only.
const SELF_PREVENT_LINE_RE = /^prevent all (?:combat )?damage that would be dealt (?:to and dealt by|to|by) (?:this creature|it)\.?$/i;
registerCoverageClassifier((card) => {
  if (!selfDamagePrevention(card) && !selfDamagePreventionBy(card)) return null;
  const type = String(card?.type ?? card?.type_line ?? "");
  if (!/creature/i.test(type)) return null;
  const name = String(card?.name ?? "").toLowerCase().replace(/[’']/g, "'");
  const nEsc = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const shortEsc = name.split(",")[0].trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const normSelfName = (line) => {
    let x = line.toLowerCase().replace(/[’']/g, "'");
    if (nEsc) x = x.replace(new RegExp(`\\b${nEsc}\\b`, "g"), "this creature");
    if (shortEsc && shortEsc !== nEsc) x = x.replace(new RegExp(`\\b${shortEsc}\\b`, "g"), "this creature");
    return x;
  };
  const residue = stripReminder(String(card?.oracle || card?.oracle_text || ""))
    .split("\n").map((l) => l.trim()).filter((l) => l && !SELF_PREVENT_LINE_RE.test(normSelfName(l))).join("\n");
  if (!residue) return "native-static";
  return isKeywordOnly(residue, card?.name) ? "native-static" : null;
});

// PREVENT-AND-PUT, SELF form (SHELF CAP9, CR 615 — Ironscale Hydra) — the sibling of the self-prevention
// lane directly above, and built the same way: gated on selfPreventPutCounters, the SAME reader the combat
// funnel consults, so the metric can't claim a wall the runtime doesn't enforce. The line is stripped and
// the remainder must be keyword-only (all-or-nothing) — a carrier with any other clause stays body-only.
//
// ⛔ THE PAYOUT IS WHAT MAKES THIS HONEST, and the runtime enforces BOTH printed restrictions with it: the
// wall fires only on COMBAT damage FROM A CREATURE, and pays exactly ONE counter. Crediting it as a flat
// wall would make the Hydra shrug off a Bolt it should take — the forbidden over-claim.
// Noncombat damage is deliberately NOT covered by this card, so applyDamageEffect never consults it.
const SELF_PREVENT_PUT_LINE_RE = /^if a creature would deal combat damage to (?:this creature|it), prevent that damage and put a \+1\/\+1 counter on (?:this creature|it)\.?$/i;
registerCoverageClassifier((card) => {
  if (!selfPreventPutCounters(card)) return null;
  const type = String(card?.type ?? card?.type_line ?? "");
  if (!/creature/i.test(type)) return null;
  const name = String(card?.name ?? "").toLowerCase().replace(/[’']/g, "'");
  const nEsc = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const shortEsc = name.split(",")[0].trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const normSelfName = (line) => {
    let x = line.toLowerCase().replace(/[’']/g, "'");
    if (nEsc) x = x.replace(new RegExp(`\\b${nEsc}\\b`, "g"), "this creature");
    if (shortEsc && shortEsc !== nEsc) x = x.replace(new RegExp(`\\b${shortEsc}\\b`, "g"), "this creature");
    return x;
  };
  const residue = stripReminder(String(card?.oracle || card?.oracle_text || ""))
    .split("\n").map((l) => l.trim()).filter((l) => l && !SELF_PREVENT_PUT_LINE_RE.test(normSelfName(l))).join("\n");
  if (!residue) return "native-static";
  return isKeywordOnly(residue, card?.name) ? "native-static" : null;
});

// GY EXILE-COST ABILITY (BLITZ GY-2, CR 602.2 — Seasoned Pyromancer / Runehorn Hellkite / the Soul
// cycle): a card whose only non-keyword text is the modeled "<mana>, Exile this card from your
// graveyard: <effect>" line (parseGraveyardExileAbility: HIGH, non-targeted, non-modal, non-X, the
// sorcery rider recognized) classifies native-activated — the SAME parse the legalChoices enumerator
// and the dispatcher key on. All-or-nothing: any residue beyond keywords → null → body-only.
registerCoverageClassifier((card) => {
  const rec = parseGraveyardExileAbility(card);
  if (!rec) return null;
  const residue = stripReminder(String(card?.oracle || card?.oracle_text || ""))
    .split("\n").map((l) => l.trim()).filter((l) => l && l !== rec.raw).join("\n");
  if (!residue) return "native-activated";
  return isKeywordOnly(residue, card?.name) ? "native-activated" : null;
});

// ─── WAVE 5a — Wolverine, Best There Is (the damage-replacement keystone) ──────────────────────────────────
// All THREE clauses modeled (CREED all-or-nothing): the source-scoped double-all-damage replacement
// (damageReplacements.js), the end-step "+1/+1 if dealt damage to another creature this turn" intervening-if
// counter (wolverine.js), and the {1}{G} regenerate activated ability (effects/abilities.js after self-name
// normalization). classifyWolverine returns "native-mixed" only when all three parse AND no residue remains;
// null for every other card. A targeted single-card flip (the #353/#356 pattern) via the additive seam.
const WOLVERINE_DOUBLE_CLAUSE = /unrivaled lethality\s*[—–-]\s*double all damage [^.]*would deal\.?/i;
const WOLVERINE_REGEN_CLAUSE = /\{1\}\{g\}:\s*regenerate [^.]*\.?/i;
function classifyWolverine(card) {
  const type = String(card?.type ?? card?.type_line ?? "").toLowerCase();
  if (!/creature/.test(type)) return null;
  const oracle = String(card?.oracle ?? card?.oracle_text ?? "");
  if (!oracle) return null;
  // (1) source-scoped double-all-damage replacement modeled (damageReplacements.js).
  if (!parseDamageReplacements(card).length) return null;
  // (2) end-step "+1/+1 if dealt damage to another creature" intervening-if clause present (wolverine.js).
  if (!marksDamageToCreature(card)) return null;
  // (3) the {1}{G} regenerate activated ability modeled (effects/abilities, after self-name normalization).
  if (!parseActivatedAbilities(card).some((a) => a.modeled && /regenerate/i.test(a.effectClause || ""))) return null;
  // No fourth, unmodeled clause: strip the three modeled clauses + reminder text, confirm empty (CREED).
  const residue = oracle.replace(/\([^)]*\)/g, " ")
    .replace(WOLVERINE_DOUBLE_CLAUSE, " ")
    .replace(ENDSTEP_COUNTER, " ")
    .replace(WOLVERINE_REGEN_CLAUSE, " ")
    .replace(/[\s.]+/g, " ").trim();
  return residue.length > 0 ? null : "native-mixed";
}
registerCoverageClassifier((card) => classifyWolverine(card));

// ─── KICKER (CR 702.33) — creature kicker whose kicked payoff is enters-with-+1/+1-counters ──────────────────
// A CREATURE with a clean single "Kicker {cost}" optional cast cost and the modeled kicked payoff
// "If this creature was kicked, it enters with N +1/+1 counters on it[ and with <keyword>]" — whose base body
// (Kicker line + kicked sentence stripped) is vanilla/keyword-only — classifies native-body. Both halves are
// modeled atoms: the base body is the existing keyword-only native-body, and the kicked counters reuse the SAME
// enters-with-+1/+1-counters replacement (resolvers.enterPermanent), now GATED on the was-kicked flag. An
// optional "and with <keyword>" grant tail (BLITZ KK-1 — Benalish Lancer first strike, Kavu Titan trample,
// Faerie Squadron flying, Pouncing Wurm haste …) rides the same replacement: resolvers stamps perm.kicked-
// Keywords, permanentHasKeyword (layers.js) seeds from it, admitting ONLY GRANTABLE_COMBAT_KEYWORDS so a
// granted instance is honored exactly like a printed one (a quoted grant / non-grantable keyword parks).
// The runtime makes it genuinely work: legalChoices emits a kicked cast (when the kicker cost is also
// affordable), actionDispatcher pays the folded cost + threads `kicked`, the resolver adds the counters.
// parseKickerCounterCreature is all-or-nothing (multikicker / variable cost / a non-counter kicked payoff /
// any extra unmodeled body clause → null), so the credit is honest — exactly the cards the engine plays.
// isKeywordOnly is passed in (the same predicate the dispatch body uses) to keep kicker.js a leaf module.
registerCoverageClassifier((card) => {
  if (parseKickerCounterCreature(card, isKeywordOnly)) return "native-body";
  // GENERALIZATION (census slice 20) — the gate above credits the kicked-counter payoff only when the BASE
  // BODY is keyword-only, so Urborg Skeleton ("Kicker {3}" + the kicked counter + "{B}: Regenerate this
  // creature.") parked even though EVERY line was individually credited: kicker+counter reads native-body on
  // its own, and the regenerate ability reads native-activated on its own. Nothing about the kicker half
  // depends on what the rest of the body is — so re-classify the stripped body and let the card take THAT
  // tier. Same shape as the self-no-untap parity fix: a credit that existed in one path and not another.
  //
  // Re-classification is an established pattern here (parseTributeCreature does the same). Passing a
  // permissive predicate bypasses ONLY the keyword-only body check while keeping every other gate —
  // creature-ness, a clean single kicker cost, and an all-or-nothing modeled kicked payoff.
  if (!parseKickerCounterCreature(card, () => true)) return null;
  const body = stripKickerText(card?.oracle || card?.oracle_text || "").trim();
  if (!body) return null;
  // Terminates in one step: the stripped body carries no kicker line, so this classifier returns null on the
  // recursive call. A body that ISN'T fully modeled yields a non-native tier and the card parks as before.
  const tier = classifyCard({ ...card, oracle: body });
  return /^native/.test(tier) ? tier : null;
});

// ─── KICKER (CR 702.33) — creature kicker whose kicked payoff is an ETB TRIGGER ──────────────────────────────
// A CREATURE with a clean single "Kicker {cost}" optional cast cost whose kicked payoff is a TRIGGERED ability
// "When this creature enters, if it was kicked, <effect>" (Goblin Ruinblaster destroy-land, Torch Slinger ping,
// Heartstabber Mosquito destroy-creature, Citanul Woodreaders draw-two, Krosan Druid gain-10 …). The kicked flag
// is threaded into the trigger via the "it was kicked" intervening-if (CR 603.4): resolvers.enterPermanent stamps
// `perm.wasKicked` on a kicked cast, and interveningIf.evaluateInterveningIf reads it at BOTH the flush check
// (drop if not kicked) and the resolution re-check. parseKickerEtbCreature strips the Kicker LINE and re-classifies
// the bare body via classifyCard (injected → kicker.js stays a leaf): the body is native iff its kicked ETB
// trigger routes HIGH AND "it was kicked" is in the strict intervening-if vocabulary — so the metric credits
// EXACTLY the cards the runtime plays (legalChoices emits the kicked cast; the ETB trigger fires its payoff only
// when kicked). Distinct from the counter classifier above (parseKickerEtbCreature rejects the counters shape),
// so no card is double-claimed. All-or-nothing (THE CREED): an unmodeled body clause / kicked effect / a
// multikicker / variable cost → null → body-only (the engine still hard-casts; the unmodeled kicked payoff
// routes to the Arbiter only when actually kicked). Returns the body's tier (native-trigger / native-mixed).
registerCoverageClassifier((card) => {
  const spec = parseKickerEtbCreature(card, classifyCard, isNativeTier);
  return spec ? spec.bodyTier : null;
});

// ─── TRIBUTE (CR 702.96) — Eldrazi-Theros ETB opponent-choice (counters vs the "if tribute wasn't paid" effect) ─
// A CREATURE with a clean "Tribute N" keyword whose BODY — the Tribute line stripped — is ALREADY native under
// the existing cascade: a keyword-only base body plus a single "When this creature enters, if tribute wasn't
// paid, <effect>" ETB trigger whose <effect> is fully modeled (Pharagax Giant = damage-to-each-opponent;
// Ornitharch = create-tokens; Nessian Demolok = destroy target noncreature; Shrike Harpy = edict; Snake of
// the Golden Grove = gain-life; Thunder Brute / Fanatic of Xenagos = self-pump). The runtime makes it
// genuinely work: resolvers.enterPermanent resolves the opponent's decision AS the creature enters (pay → add
// N +1/+1 counters + stamp tributePaid=true; decline → tributePaid=false), and the "if tribute wasn't paid"
// ETB trigger fires its payoff through the normal checkEnterTriggers → buildTriggerStack path, gated on the
// "tribute wasn't paid" intervening-if (interveningIf.js) reading that per-permanent flag — exactly how
// KICKER's "it was kicked" trigger reads wasKicked. parseTributeCreature strips the line and RE-CLASSIFIES the
// bare body via classifyCard (injected → tribute.js stays a leaf), crediting the SAME tier the body earns. The
// recursion is bounded (the stripped body has no Tribute line → null on the inner call, like parseKickerEtbCreature).
// All-or-nothing (THE CREED): an unmodeled if-not effect (gain control — Siren; a granted dies-trigger —
// Flame-Wreathed Phoenix; an optional fight — Nessian Wilds Ravager) → the bare body isn't native → null →
// body-only. SINGLE source of truth — resolvers.enterPermanent reads parseTribute too, so the metric credits
// EXACTLY the cards the engine plays. Returns the body's tier (native-trigger / native-mixed).
registerCoverageClassifier((card) => {
  const spec = parseTributeCreature(card, classifyCard, isNativeTier);
  return spec ? spec.bodyTier : null;
});

// ─── EMERGE (CR 702.97) — Eldrazi alternative cast cost (sac a creature/artifact, pay reduced) ───────────────
// An Eldrazi/creature with a clean "Emerge {cost}" (or "Emerge from artifact {cost}") line whose BODY — the
// Emerge keyword line stripped — is ALREADY native under the existing cascade (a keyword-only body, or a body
// whose only non-keyword text is a modeled self-cast / ETB trigger). Emerge changes ONLY how/what you pay,
// never the printed text — the SAME shape Plot / Warp / Bestow already model. parseEmergeCard strips the line
// and RE-CLASSIFIES the bare body via classifyCard (injected → emerge.js stays a leaf), crediting the card the
// SAME tier its body earns. The recursion is bounded: the stripped body has no Emerge line, so this classifier
// returns null on the inner call (mirrors classifyAdventure's bounded self-recursion). The runtime makes it
// genuinely work: legalChoices emits an emerge cast per legal sacrifice victim (cost reduced by the victim's
// MV), actionDispatcher sacrifices the victim (excluded from the mana sources) + pays the reduced mana, and
// the body's self-cast / ETB trigger fires through the normal checkCastTriggers / PERMANENT_ETB path.
// All-or-nothing (CREED): an unmodeled body clause → the stripped body isn't native → null → body-only, so the
// credit is honest (exactly the Emerge cards the engine plays). isNativeTier gates the body tier.
registerCoverageClassifier((card) => {
  const spec = parseEmergeCard(card, classifyCard, isNativeTier);
  return spec ? spec.bodyTier : null;
});

// ─── CHOSEN-TYPE COUNT-ANTHEM — Banner of Kinship / Door of Destinies (cross-deck) ──────────────────────────
// A choose-a-creature-type artifact whose payoff is a counter-scaled anthem on the chosen-type creatures the
// controller controls. WHOLE-CARD (CREED all-or-nothing) — every clause must be modeled:
//   • "As this artifact enters, choose a creature type." — the ETB auto-pick (resolvers.autoPickCreatureType
//     stores perm.chosenType); a setup replacement, not a trigger, so it's stripped like the Kindred chooser.
//   • the COUNT-ANTHEM static "Creatures you control of the chosen type get +X/+Y for each <name> counter on
//     this artifact." — the new layer-7c chosen-type dynamic-count (clauseProducesStatic confirms it parses).
//   • EITHER a Banner ETB-counter replacement ("This artifact enters with a <name> counter on it for each
//     creature you control of the chosen type." — resolvers.entersWithChosenTypeCounter), OR a Door cast
//     trigger ("Whenever you cast a spell of the chosen type, put a <name> counter on this artifact." — the
//     chosenType cast detector + the add-named-counter-self atom, which must route HIGH).
// Returns native-mixed (Door = trigger + static) / native-static (Banner = ETB replacement + static), or null
// for everything else. A targeted single-card flip via the additive seam (the #353/#356 / classifyWolverine
// pattern), so it can never cause collateral: it returns null unless ALL chosen-type clauses match AND no
// residue remains. Mechanism-keyed (not name-keyed), so a future twin of either flips automatically.
const CHOSEN_TYPE_CHOOSER_RE = /\bas\b[^.]*\benters\b[^.]*,\s*choose a creature type\b\.?/i;
const CHOSEN_TYPE_ANTHEM_RE = /creatures you control of the chosen type get \+\d+\/\+\d+ for each [a-z]+ counter on this artifact\.?/i;
const CHOSEN_TYPE_ETB_COUNTER_RE = /this artifact enters (?:the battlefield )?with (?:a|an|one) [a-z]+ counter on it for each creature you control of the chosen type\.?/i;
function classifyChosenTypeAnthem(card) {
  const type = String(card?.type ?? card?.type_line ?? "").toLowerCase();
  if (!/artifact/.test(type)) return null;
  const oracle = stripReminder(String(card?.oracle ?? card?.oracle_text ?? ""));
  if (!oracle) return null;
  // (1) the ETB chosen-type chooser must be present (it's what makes "of the chosen type" meaningful).
  if (!CHOSEN_TYPE_CHOOSER_RE.test(oracle)) return null;
  // (2) the count-anthem static must parse to a modeled descriptor (the layer-7c chosen-type dynamic count).
  if (!CHOSEN_TYPE_ANTHEM_RE.test(oracle)) return null;
  if (!clauseProducesStatic("Creatures you control of the chosen type get +1/+1 for each charge counter on this artifact")) return null;
  // (3) the counter SOURCE half — EXACTLY ONE of: a Banner ETB replacement, or a Door cast trigger. The two
  // shapes are mutually exclusive; a card with BOTH (or NEITHER) → Arbiter.
  const hasEtbCounter = CHOSEN_TYPE_ETB_COUNTER_RE.test(oracle);
  const triggers = detectTriggers(card);
  // BANNER: the counter is an ETB replacement, so there must be NO triggers at all (the chooser + ETB counter
  // are replacements, never When/Whenever/At). Any trigger present means it's not the bare Banner shape →
  // Arbiter (this rejects a Banner-shape with an extra ETB/cast trigger, even one that routes — CREED).
  // DOOR: the counter is added by EXACTLY ONE cast trigger that routes natively (→ the add-named-counter-self
  // atom), and there is NO ETB counter. Any other trigger / a second trigger → Arbiter.
  const isBanner = hasEtbCounter && triggers.length === 0;
  const isDoor = !hasEtbCounter && triggers.length === 1 && triggers[0].event === "cast" && triggerRoutesNatively(triggers[0]);
  if (!isBanner && !isDoor) return null;          // not a clean single-source chosen-type anthem → Arbiter
  // (4) NO residue: strip the chooser, the anthem, the ETB-counter (Banner), and the single cast trigger
  // sentence (Door); nothing else may remain (a rider/extra ability keeps the card on the Arbiter — CREED).
  // For Banner triggers.length===0, so the trigger strip is a no-op; for Door it removes the one cast trigger.
  const residue = oracle
    .replace(CHOSEN_TYPE_CHOOSER_RE, " ")
    .replace(CHOSEN_TYPE_ANTHEM_RE, " ")
    .replace(CHOSEN_TYPE_ETB_COUNTER_RE, " ")
    .replace(/[\s\S]*/, (all) => stripTriggerSentences(all, " ")) // QUOTE-AWARE (Codex fix #4): the shared scanner strips whole sentences (a quoted ability internal period no longer truncates)
    .replace(/[\s.]+/g, " ").trim();
  if (residue.length > 0) return null;
  return isDoor ? "native-mixed" : "native-static";
}
registerCoverageClassifier((card) => classifyChosenTypeAnthem(card));

// ─── CHOSEN-TYPE FLAT ANTHEM — Rally the Ranks / Shared Triumph / Obelisk of Urd / Steely Resolve ──────────
// A choose-a-creature-type permanent whose ONLY payoff is a FIXED-magnitude (non-counter) anthem on the
// chosen-type creatures: "Creatures [you control] of the chosen type get +N/+N" or "… have <keyword>". The
// flat sibling of the COUNT-anthem above (Banner/Door's "… for each <name> counter"). WHOLE-CARD (CREED) —
// exactly two modeled clauses:
//   • "As this <permanent> enters, choose a creature type." — the ETB auto-pick (resolvers.autoPickCreatureType
//     → perm.chosenType, a setup replacement, stripped like the Kindred/Banner chooser), and
//   • the flat anthem static — the new parseCreatureSelector chosen-type branch emits a layer-7c ptModify
//     (P/T) and/or a layer-6 addKeyword carrying selector.chosenTypeOfSource:true, paired at runtime against
//     the SOURCE's stored chosenType by layers.matchesSelector (subtype OR changeling, CR 702.73a). The buff
//     is enforced at the same sites a tribal-lord anthem is (permanentPower/Toughness, permanentHasKeyword
//     read layer-aware), restricted to the chosen type the controller (or all players, for the determiner-less
//     "Creatures of the chosen type …") controls. clauseProducesStatic confirms the exact printed clause parses.
// NOTHING else may remain — Vanquisher's Banner (an extra cast trigger), Icon of Ancestry / Patchwork Banner
// (an activated ability), Morophon (a WUBRG cost-reduction rider) keep residue → null (their anthem STILL
// applies at runtime; only the FLIP is withheld — a safe FN). Returns native-static, or null. Additive-seam
// single-mechanism flip (the classifyWolverine / classifyChosenTypeAnthem pattern), mechanism-keyed (a future
// bare twin flips automatically). DESCRIPTOR-DRIVEN, not regex-substring: the gate is that parseStaticAbilities
// actually EMITS a chosen-type anthem descriptor for the WHOLE card — so an "Other creatures … of the chosen
// type get +1/+1" (Morophon, a determiner/exclude-self form the flat branch doesn't model → no descriptor) can
// never be credited off a substring match. A non-grantable keyword tail ("have protection from …") likewise
// emits no descriptor → null (whole card stays Arbiter — never a partial flip).
// The anthem-clause anchor is ^…(determiner-less) — "creatures [you control] of the chosen type get/have …";
// it deliberately does NOT include the leading "other/all/each" (those are NOT modeled here), so the residue
// strip leaves an "Other …" clause intact → non-keyword residue → null.
// The optional leading "Other" is admitted now that the PARSER models it (selector excludeSelf +
// chosenTypeOfSource composed). The old comment above says an "Other …" clause can never be credited off a
// substring match — that guard is unchanged and still load-bearing: the descriptor gate at (2) is what
// credits the card, and this regex only decides whether the printed line counts as EXPLAINED residue.
const CT_FLAT_ANTHEM_CLAUSE_RE = /^(?:other\s+)?creatures?\s+(?:you control\s+)?of the chosen type (?:gets?|gains?|have|has)\b[^.]*\.?/i;
// "This creature is the chosen type in addition to its other types." (CR 205.1b) — a REAL layer-4 subtype
// add (staticAbilityParser emits the marker; layers.staticEffectsOf resolves it against the permanent's
// stored chosenType, verified on a board). It is therefore explained text, not residue. Before the layer-4
// effect existed this line HAD to count as residue, because crediting it would have been a claimed-native
// no-op — the card would say it is the chosen type while no selector could see it.
const CT_SELF_TYPE_ADD_LINE_RE = /^this (?:creature|artifact|permanent) is the chosen type in addition to its other types\.?$/i;
function classifyChosenTypeFlatAnthem(card) {
  const oracle = stripReminder(String(card?.oracle ?? card?.oracle_text ?? ""));
  if (!oracle) return null;
  // (1) the ETB chosen-type chooser must be present (it's what gives "of the chosen type" a value).
  if (!CHOSEN_TYPE_CHOOSER_RE.test(oracle)) return null;
  // (2) the WHOLE card must actually parse a chosen-type anthem descriptor (selector.chosenTypeOfSource:true —
  // the flat ptModify and/or addKeyword from the parseCreatureSelector branch). This is the load-bearing CREED
  // gate: it credits ONLY a card whose printed anthem the parser truly models (a "for each … counter" COUNT
  // form also carries chosenTypeOfSource, but classifyChosenTypeAnthem owns it and runs first; this fn's
  // residue strip below would also reject a count form — its "for each … counter" tail survives as residue).
  const statics = parseStaticAbilities(card);
  if (!statics.some((d) => d?.affects?.selector?.chosenTypeOfSource === true)) return null;
  // (3) NO other ability — no trigger (Vanquisher's Banner's draw trigger), no activated ability (Icon /
  // Patchwork's {T} abilities); the remainder after stripping the chooser + the FLAT anthem clause(s) must be
  // keyword-only. Strip per-clause (anchored ^) so an "Other …"/COUNT anthem clause is NOT consumed → residue.
  if (detectTriggers(card).length > 0) return null;
  if (parseActivatedAbilities(card).length > 0) return null;
  const residue = oracle
    .split(/\n+/)
    .filter((line) => {
      const t = line.trim();
      if (!t) return false;
      if (CHOSEN_TYPE_CHOOSER_RE.test(t)) return false;        // drop the ETB chooser line
      if (CT_FLAT_ANTHEM_CLAUSE_RE.test(t)) return false;       // drop the flat chosen-type anthem line
      if (CT_SELF_TYPE_ADD_LINE_RE.test(t)) return false;       // drop the layer-4 self type-add (Adaptive Automaton)
      return true;                                              // anything else is residue
    })
    .join(" ")
    // ⚠️ PERIODS PRESERVED — see the sibling note below. Stripping them let a leading "Changeling" swallow
    // Morophon's entire unmodeled {W}{U}{B}{R}{G} cost-reduction rider, crediting the card native-static
    // while its signature ability did nothing.
    .replace(/\s+/g, " ").trim();
  if (residue.length > 0 && !isKeywordOnly(residue, card?.name)) return null;
  return "native-static";
}
registerCoverageClassifier((card) => classifyChosenTypeFlatAnthem(card));

// ─── CHOSEN-TYPE CAST-DRAW (TYPAL CAST-DRAW) — Vanquisher's Banner / Chronicle of Victory (BLITZ TC-1) ─────
// The anthem-PLUS-cast-trigger sibling of the flat anthem above: a choose-a-creature-type artifact/enchantment
// whose payoffs are a FLAT chosen-type anthem AND a "Whenever you cast a [creature] spell of the chosen type,
// <effect>" trigger. WHOLE-CARD (CREED) — every line must be one of exactly three modeled shapes:
//   • "As this <permanent> enters, choose a creature type." — the ETB auto-pick (resolvers.
//     autoPickCreatureType → perm.chosenType; CR 614.12), LINE-anchored here (unlike the substring chooser RE)
//     so a Banner-of-Kinship-style compound chooser line ("… choose a creature type. This artifact enters
//     with …") is NOT consumed — its counter sentence stays residue → null.
//   • the FLAT anthem line — "Creatures [you control] of the chosen type get +N/+N[ and have <kw list>]." or
//     "… have <kw list>." (the parseCreatureSelector chosen-type branch → layer-7c ptModify / layer-6
//     addKeyword with selector.chosenTypeOfSource:true — same lane the flat classifier rides). CONSUMPTION-
//     CHECKED: the line re-parses standalone and must emit EXACTLY (1 if P/T) + (one per listed keyword)
//     descriptors, all chosenTypeOfSource — so a silently-dropped grant tail (the parser keeps "+1/+1" and
//     drops "and can't be blocked") can NEVER be credited: a tail that isn't a fully-parsed have-list fails
//     the count (or the line RE) → residue → null. Chronicle's "get +2/+2 and have first strike and trample"
//     = 1 + 2 = 3 descriptors ✓.
//   • the chosen-type CAST trigger line — "Whenever you cast a [creature] spell of the chosen type, <effect>."
//     (the detectChosenTypeCast shapes, CR 603.2; the creature-spell form gates on creatureOnly at
//     checkCastTriggers). The card's ONE detected trigger must be exactly this cast/chosenType descriptor,
//     route natively (triggerRoutesNatively — the shared metric↔runtime gate; "draw a card" parses HIGH), and
//     its detected effectClause must EQUAL the line's printed effect (a second effect sentence on the line
//     can't be silently shed).
// NOTHING else may remain (keyword-only lines like Flash aside) — Icon of Ancestry / Patchwork Banner (an
// activated ability), Herald's Horn (an unroutable upkeep look-trigger) keep residue or fail the gates → null
// (their anthem/reducer STILL applies at runtime; only the flip is withheld — a safe FN). Returns native-mixed
// (static + trigger), or null. Additive-seam, mechanism-keyed (a future bare twin flips automatically). Door
// of Destinies never reaches here (classifyChosenTypeAnthem owns it and runs first; its COUNT-anthem line
// would fail this classifier's flat-anthem RE anyway).
const CT_CHOOSER_LINE_RE = /^as\b[^.]*\benters\b[^.]*,\s*choose a creature type\.?$/i;
const CT_CAST_TRIGGER_LINE_RE = /^whenever you cast a (?:creature )?spell of the chosen type,\s*([^.]+)\.?$/i;
const CT_CAST_ANTHEM_LINE_RE = /^creatures (?:you control )?of the chosen type (?:get \+\d+\/\+\d+(?: and have ([a-z][a-z ,'-]*))?|have ([a-z][a-z ,'-]*))\.?$/i;
function classifyChosenTypeCastDraw(card) {
  const type = String(card?.type ?? card?.type_line ?? "").toLowerCase();
  if (!/\b(?:artifact|enchantment)\b/.test(type) || /\bcreature\b/.test(type)) return null;
  const oracle = stripReminder(String(card?.oracle ?? card?.oracle_text ?? ""));
  if (!oracle || !CHOSEN_TYPE_CHOOSER_RE.test(oracle)) return null;   // the ETB chooser must be present
  // (1) EXACTLY ONE trigger: the chosen-type cast trigger, routing natively through the shared gate.
  const triggers = detectTriggers(card);
  if (triggers.length !== 1) return null;
  const trig = triggers[0];
  if (trig.event !== "cast" || trig.spellFilter?.kind !== "chosenType" || !triggerRoutesNatively(trig)) return null;
  // (2) ≥1 static, and EVERY parsed static descriptor is a chosen-type anthem one (a stray modeled static
  // that isn't chosen-type-scoped — or Herald's costReduction marker, which has no affects — rejects).
  const statics = parseStaticAbilities(card);
  if (!statics.length || !statics.some((d) => d?.affects?.selector?.chosenTypeOfSource === true)) return null;
  if (!statics.every((d) => d?.affects?.selector?.chosenTypeOfSource === true)) return null;
  if (parseActivatedAbilities(card).length > 0) return null;          // Icon/Patchwork's {T} abilities
  // (3) PER-LINE audit: every line must be the chooser, ONE consumption-checked anthem line, the ONE
  // trigger line (its printed effect === the detected effectClause), or keyword-only (Flash). Else residue.
  let triggerLines = 0;
  const residue = [];
  for (const rawLine of oracle.split(/\n+/)) {
    const line = rawLine.trim();
    if (!line) continue;
    if (CT_CHOOSER_LINE_RE.test(line)) continue;                      // the whole-line ETB chooser
    const trigM = line.match(CT_CAST_TRIGGER_LINE_RE);
    if (trigM) {
      triggerLines += 1;
      // The detected trigger's effect must be EXACTLY this line's effect (nothing shed by the split).
      if (String(trig.effectClause || "").trim().toLowerCase() !== trigM[1].trim().toLowerCase()) return null;
      continue;
    }
    const anthemM = line.match(CT_CAST_ANTHEM_LINE_RE);
    if (anthemM) {
      // CONSUMPTION CHECK: standalone, the line must emit exactly (P/T ? 1 : 0) + (# listed keywords)
      // descriptors, all chosen-type-scoped. A dropped tail or an unparsed keyword fails the count → null.
      const hasPt = /get \+\d+\/\+\d+/i.test(line);
      const kwList = anthemM[1] ?? anthemM[2] ?? null;
      const kwCount = kwList ? kwList.split(/,\s*(?:and\s+)?|\s+and\s+/).filter((w) => w.trim()).length : 0;
      const lineStatics = parseStaticAbilities({ name: card?.name, type: card?.type ?? card?.type_line, oracle: line });
      if (lineStatics.length !== (hasPt ? 1 : 0) + kwCount) return null;
      if (!lineStatics.every((d) => d?.affects?.selector?.chosenTypeOfSource === true)) return null;
      continue;
    }
    residue.push(line);
  }
  if (triggerLines !== 1) return null;                                // the one detected trigger, seen once
  // ⚠️ PERIODS ARE PRESERVED. isKeywordOnly splits on SENTENCE boundaries to stop a leading keyword from
  // swallowing a trailing unmodeled sentence — its own comment: "a trailing non-keyword sentence glued on by
  // a strip ('flying  scry 1.') is swallowed whole by startsWith('flying ')". Stripping periods here removed
  // exactly the boundary that guard depends on, so `isKeywordOnly` returned TRUE for
  // "Changeling Spells of the chosen type you cast cost {W}{U}{B}{R}{G} less to cast …" and FALSE for the
  // same text with its periods intact. Only the two residues that feed isKeywordOnly needed this; the
  // siblings that merely test `length > 0` are unaffected either way.
  const rest = residue.join(" ").replace(/\s+/g, " ").trim();
  if (rest.length > 0 && !isKeywordOnly(rest, card?.name)) return null;
  return "native-mixed";
}
registerCoverageClassifier((card) => classifyChosenTypeCastDraw(card));

// ─── CHOSEN-TYPE ANTHEM + LOOK-AT-TOP DIG — Icon of Ancestry / Patchwork Banner (BLITZ LK-1) ─────────────────
// The activated-ability sibling of the cast-draw classifier above: a choose-a-creature-type artifact/enchantment
// whose payoffs are a FLAT chosen-type anthem AND an activated "{cost}: Look at the top N cards … you may reveal
// a creature card OF THE CHOSEN TYPE … put the rest on the bottom" impulse-dig (the effects/parser.js matchImpulseDig
// chosen-type branch → the applyImpulseDigAtom chosenTypeOfSource filter, which AND-matches the looked-at set
// against the SOURCE's perm.chosenType via ctx.sourceId). WHOLE-CARD (CREED) — every line is one of exactly three
// modeled shapes:
//   • "As this <permanent> enters, choose a creature type." — the ETB auto-pick (resolvers.autoPickCreatureType →
//     perm.chosenType, CR 614.12), LINE-anchored (CT_CHOOSER_LINE_RE), so a compound chooser line stays residue.
//   • the FLAT anthem line — CONSUMPTION-CHECKED exactly like the cast-draw classifier (the parseStaticAbilities
//     chosen-type descriptor count must equal the P/T + keyword tally, so a silently-dropped grant tail can't be
//     credited); every parsed static must be chosen-type-scoped.
//   • the activated impulse-dig ability line(s) — validated by permanentActivatedCovered on the chooser+anthem-
//     stripped body (the SAME gate the runtime offers on: every activated ability modeled, its effect HIGH,
//     non-modal/non-X; nothing else left but keyword-only). So a SECOND unmodeled activated ability → null.
// NOTHING else may remain (keyword-only lines aside) — a card with an extra trigger (Vanquisher's Banner) or an
// unmodeled activated ability keeps residue → null (its anthem STILL applies at runtime; only the flip is withheld,
// a safe FN). Returns native-mixed (static + activated), or null. Additive-seam, mechanism-keyed (a future bare
// twin flips automatically). Ordered AFTER classifyChosenTypeCastDraw so a trigger-carrier is owned there first
// (this fn requires 0 triggers), and its anthem consumption reuses CT_CAST_ANTHEM_LINE_RE / CT_CHOOSER_LINE_RE.
function classifyChosenTypeAnthemDig(card) {
  const type = String(card?.type ?? card?.type_line ?? "").toLowerCase();
  if (!/\b(?:artifact|enchantment)\b/.test(type) || /\bcreature\b/.test(type)) return null;
  const oracle = stripReminder(String(card?.oracle ?? card?.oracle_text ?? ""));
  if (!oracle || !CHOSEN_TYPE_CHOOSER_RE.test(oracle)) return null;   // the ETB chooser must be present
  if (detectTriggers(card).length > 0) return null;                  // no triggers (cast-draw owns those)
  // Every activated ability must be modeled (the SAME .modeled gate permanentActivatedCovered rides); ≥1.
  const acts = parseActivatedAbilities(card);
  if (acts.length === 0 || !acts.every((a) => a.modeled)) return null;
  // ≥1 static, and EVERY parsed static is a chosen-type anthem descriptor (a stray non-chosen static rejects).
  const statics = parseStaticAbilities(card);
  if (!statics.length || !statics.every((d) => d?.affects?.selector?.chosenTypeOfSource === true)) return null;
  // Per-line audit: chooser + ONE-OR-MORE consumption-checked anthem lines get stripped; the remainder must be
  // activated-abilities-fully-covered (permanentActivatedCovered — modeled abilities + keyword-only residue).
  const kept = [];
  for (const rawLine of oracle.split(/\n+/)) {
    const line = rawLine.trim();
    if (!line) continue;
    if (CT_CHOOSER_LINE_RE.test(line)) continue;                      // the whole-line ETB chooser
    const anthemM = line.match(CT_CAST_ANTHEM_LINE_RE);
    if (anthemM) {
      const hasPt = /get \+\d+\/\+\d+/i.test(line);
      const kwList = anthemM[1] ?? anthemM[2] ?? null;
      const kwCount = kwList ? kwList.split(/,\s*(?:and\s+)?|\s+and\s+/).filter((w) => w.trim()).length : 0;
      const lineStatics = parseStaticAbilities({ name: card?.name, type: card?.type ?? card?.type_line, oracle: line });
      if (lineStatics.length !== (hasPt ? 1 : 0) + kwCount) return null;      // a dropped tail → null
      if (!lineStatics.every((d) => d?.affects?.selector?.chosenTypeOfSource === true)) return null;
      continue;
    }
    kept.push(line);
  }
  // The chooser+anthem-stripped body must be exactly modeled activated abilities (+ keyword-only). This re-runs
  // the runtime-mirroring activated gate, so a second UNmodeled activated ability or any static/trigger residue → null.
  if (!permanentActivatedCovered({ ...card, oracle: kept.join("\n") })) return null;
  return "native-mixed";
}
registerCoverageClassifier((card) => classifyChosenTypeAnthemDig(card));

// ─── SELF-METRIC COST-REDUCTION — Ghalta, Primal Hunger (cross-deck big-mana payoff) ────────────────────────
// A permanent SPELL whose only non-keyword text is a modeled self cost-reduction ("This spell costs {X} less to
// cast, where X is <board metric>") + keyword(s). The reduction is applied at the cast site (legalChoices.
// selfCostReductionForSpell reads the live metric), and the body is vanilla/keyword-only — so the card plays
// fully natively. WHOLE-CARD (CREED): strip the self-cost sentence (+ reminder) and the remainder must be
// keyword-only with NO trigger / activated / static residue. Ghalta = self-cost(total power) + Trample →
// native-body. The Great Henge / Cavern-Hoard Dragon / Excalibur DON'T flip here — their extra clauses (a
// mana ability + ETB trigger; a combat-damage trigger; Equip + bonus) leave residue → null (still arbiter for
// classification, but the runtime STILL reduces their cast — a safe FN on the flip, a true win at the table).
// A targeted single-mechanism flip via the additive seam: returns null unless the metric parses AND no residue
// remains, so it can never cause collateral. Mechanism-keyed (any future self-metric + keyword card flips too).
const SELF_COST_SENTENCE_RE = /(?:if your life total is less than your starting life total, )?this spell costs \{x\} less to cast,? where x is [^.]*\.?/i;
function classifySelfCostReduction(card) {
  if (!selfCostReductionMetric(card)) return null; // no MODELED self-metric clause
  // Strip reminder + the self-cost sentence; the remainder must be keyword-only (Trample) with no other ability.
  const stripped = stripReminder(String(card?.oracle ?? card?.oracle_text ?? "")).replace(SELF_COST_SENTENCE_RE, " ");
  if (detectTriggers({ ...card, oracle: stripped }).length > 0) return null;       // a trigger remains → not bare
  if (parseActivatedAbilities({ ...card, oracle: stripped }).length > 0) return null; // an activated ability remains
  if (!isKeywordOnly(stripped, card?.name)) return null;                            // any other residue → arbiter
  return "native-body";
}
registerCoverageClassifier((card) => classifySelfCostReduction(card));

// ─── CHOSEN-TYPE COST-REDUCTION — Urza's Incubator (Joe/Colton tribal artifacts) ───────────────────────────
// A choose-a-creature-type artifact whose ONLY payoff is a chosen-type cost reducer ("Creature spells [you
// cast] of the chosen type cost {N} less to cast"). WHOLE-CARD (CREED): exactly two modeled clauses —
//   • "As this artifact enters, choose a creature type." (the ETB auto-pick → perm.chosenType, a setup
//     replacement, stripped like the Kindred/Banner chooser), and
//   • the chosen-type reducer (parseStaticAbilities emits its { costReduction: { chosenType } } marker —
//     clauseProducesStatic confirms it parses; legalChoices applies it at the cast site).
// NOTHING else may remain — EXCEPT (BLITZ LK-2) a single upkeep TOP-CARD take-or-leave-on-top trigger that
// routes natively (Herald's Horn: "At the beginning of your upkeep, look at the top card of your library. If
// it's a creature card of the chosen type, you may reveal it and put it into your hand." → the look-top-take
// atom). With that trigger now modeled it's Herald's LAST blocker, so the whole card composes → native-mixed
// (reducer static + native trigger). Gathering Stone (its look-trigger has a decline-to-GRAVEYARD tail — a
// DIFFERENT mechanic that fails triggerRoutesNatively) and any OTHER trigger keep residue → null (their reducer
// STILL applies at runtime; only the flip is withheld — a safe FN). A bare reducer (no trigger — Urza's
// Incubator) is unchanged → native-static. Additive-seam, mechanism-keyed (a future bare twin flips too). The
// card-type-chooser variants (Cloud Key / Umori / Stenn — "choose a CARD type") are NOT matched (the chooser RE
// wants a CREATURE type) and stay body-only, since that chooser is unmodeled.
const CT_COST_REDUCER_RE = /creature spells (?:you cast )?of the chosen type cost \{\d+\} less to cast\.?/i;
function classifyChosenTypeCostReducer(card) {
  const type = String(card?.type ?? card?.type_line ?? "").toLowerCase();
  if (!/artifact/.test(type)) return null;
  const oracle = stripReminder(String(card?.oracle ?? card?.oracle_text ?? ""));
  if (!oracle) return null;
  if (!CHOSEN_TYPE_CHOOSER_RE.test(oracle)) return null;           // the ETB creature-type chooser must be present
  if (!CT_COST_REDUCER_RE.test(oracle)) return null;              // the chosen-type reducer must be present
  if (!clauseProducesStatic("Creature spells of the chosen type cost {1} less to cast")) return null; // it parses to a marker
  // TRIGGER gate (BLITZ LK-2): the ONLY permitted trigger is exactly ONE natively-routing look-top-take trigger
  // (Herald's upkeep look). Any second trigger, or a trigger whose effect ISN'T the bare look-top-take atom
  // (Gathering Stone's decline-to-graveyard look fails triggerRoutesNatively; anything else is out of this
  // slice's scope), is residue → null (a safe FN — the reducer still applies at runtime).
  const triggers = detectTriggers(card);
  let mixed = false;
  if (triggers.length > 0) {
    if (triggers.length !== 1) return null;
    const trig = triggers[0];
    if (!triggerRoutesNatively(trig)) return null;
    const prog = parseEffectClause(trig.effectClause, "Instant", { hasX: !!trig.effectHasX });
    if (!(prog && prog.atoms?.length === 1 && prog.atoms[0].op === "look-top-take")) return null;
    mixed = true;
  }
  // NO residue: strip the chooser + the reducer, and (when mixed) drop the ONE look-top-take trigger LINE (it
  // spans two sentences — "At … look … . If it's … put it into your hand." — so a line drop is cleaner than a
  // single-sentence substring strip). Nothing else may remain.
  let body = oracle
    .replace(CHOSEN_TYPE_CHOOSER_RE, " ")
    .replace(CT_COST_REDUCER_RE, " ");
  if (mixed) {
    body = body.split(/\n+/).filter((line) => !/^\s*(?:When|Whenever|At)\b/i.test(line)).join("\n");
  }
  const residue = body.replace(/[\s.]+/g, " ").trim();
  if (residue.length > 0) return null;
  return mixed ? "native-mixed" : "native-static";
}
registerCoverageClassifier((card) => classifyChosenTypeCostReducer(card));

// ─── X-CAST-TOKEN COMMANDER — Zaxara, the Exemplary (Sultai X-spell deck commander) ──────────────────────────
// "Whenever you cast a spell with {X} in its mana cost, create a 0/0 green Hydra creature token, then put X
// +1/+1 counters on it." The general trigger compiler can't route this: detectTriggers sees the cast trigger
// but its effect ("create a 0/0 token, then put X +1/+1 counters") parses LOW (the 0/0 dies-to-SBA guard in
// createTokenClauseParser rejects toughness 0, and the "then put X …" rider isn't a token-clause shape), AND
// the generic cast-trigger flush path (checkCastTriggers) carries NO xValue — so a routed copy would mint a
// 0/0 that dies. Instead the runtime fires a DEDICATED hook (actionDispatcher → applyXCastTokenTriggers,
// xCastToken.js) right after checkCastTriggers, threading the cast's chosen X (action.xValue) so the token
// enters as a REAL X/X (proven end-to-end in xCastToken.test.js + zaxaraHydras.test.js). This classifier
// credits the card the runtime already plays — the #353/#356/classifyWolverine additive-seam pattern (a
// targeted single-card flip that returns null unless EVERY clause matches AND no residue remains, so it can
// never cause collateral). Mechanism-keyed (not name-keyed), so a future twin flips automatically.
//
// CREED — whole card, all clauses modeled:
//   • the X-cast token trigger (parseXCastTokenTrigger, anchored to the exact "create <count> <P>/<T>
//     <descriptor> token, then put X +1/+1 counters on it/them" shape) → applyXCastTokenTriggers;
//   • the {T} mana ability ("Add two mana of any one color") → the native-mana runtime. NOTE the amount
//     under-production ("two" → 1 mana) is a CORPUS-WIDE manaModel.js gap (manaProduction's "mana of any
//     [one] color" branch hardcodes amount 1) that already credits Black Lotus / Goldspan Dragon / Jeweled
//     Lotus / Gilded Lotus et al. as native-mana — Zaxara is in the same boat, not held to a stricter bar
//     (flagged for the manaModel owner; out of this layer's scope);
//   • Deathtouch — an ENFORCED COVERED_KEYWORD.
// All-or-nothing: strip the X-cast trigger sentence; NO other detected trigger may remain (a second unmodeled
// trigger → null), every remaining activated ability must be the mana ability (a non-mana activated → null),
// and the keyword/mana residue must be keyword-only (any other static/text → null). Returns native-mixed
// (mana + trigger + keyword body) or null.
const XCAST_TOKEN_SENTENCE_RE = /whenever you cast a spell with \{x\} in its mana cost, create (?:a|an|one|two|three|four|five|\d+) \d+\/\d+ .+? creature tokens?, then put x \+1\/\+1 counters? on (?:it|them)\.?/i;
function classifyXCastTokenCommander(card) {
  const type = String(card?.type ?? card?.type_line ?? "").toLowerCase();
  // The hook fires on a battlefield permanent the caster controls — only a permanent (creature here) qualifies.
  // An instant/sorcery / land / PW is handled by the dispatch above and never reaches the registry seam, but
  // gate defensively so this never claims a non-permanent.
  if (/\b(instant|sorcery|land)\b/.test(type) || !/\b(creature|artifact|enchantment)\b/.test(type)) return null;
  if (!parseXCastTokenTrigger(card)) return null;                 // not the exact X-cast-token shape → not ours
  const oracle = String(card?.oracle ?? card?.oracle_text ?? "");
  // Strip the X-cast trigger sentence; nothing else trigger-shaped may remain (a second, unmodeled trigger
  // would be silently dropped — a FORBIDDEN FP). detectTriggers on the stripped card must be empty.
  const noTrig = { ...card, oracle: oracle.replace(XCAST_TOKEN_SENTENCE_RE, "\n") };
  if (detectTriggers(noTrig).length > 0) return null;            // a second trigger remains → Arbiter
  // Every remaining activated ability must be a mana ability (the native-mana runtime taps it). A non-mana
  // activated ability (modeled or not) → residue → Arbiter (CREED whole-card). parseActivatedAbilities skips
  // mana abilities' effect modeling (a mana effect isn't a stack effect → modeled:false), so we can't lean on
  // `.modeled`; instead require hasManaAbility AND that stripping the mana line(s) + trigger leaves keyword-only.
  if (!hasManaAbility(noTrig.oracle)) return null;               // the {T}: Add … mana ability must be present
  // EVERY remaining activated ability must be a MANA ability (effect right-of-colon adds mana). A NON-mana
  // activated ability (a sac-drain, a pinger, a tutor) is residue the runtime won't play through this tier —
  // crediting it would be a FORBIDDEN dropped-ability FP. parseActivatedAbilities marks a mana ability
  // modeled:false (its effect is a mana ability, not a stack effect), so we can't use `.modeled`; gate on the
  // effect text instead (mirrors hasManaAbility's "Add …" shape). Reminder stripped first (a keyword reminder
  // can carry a colon). Any activated line whose effect is NOT a mana "Add …" → null.
  for (const line of stripReminder(noTrig.oracle).split(/\n+/)) {
    if (!isActivatedAbilityLine(line, card)) continue;           // not an activated ability → handled by the keyword gate below
    if (!hasManaAbility(line.slice(line.indexOf(":") + 1))) return null; // a non-mana activated ability remains → Arbiter (CREED)
  }
  // Strip reminder + the X-cast trigger + every (now-confirmed-mana) activated-ability line; the remainder
  // must be keyword-only (Deathtouch).
  const manaStripped = stripReminder(noTrig.oracle)
    .split(/\n+/)
    .filter((line) => !isActivatedAbilityLine(line, card))      // drop the "{T}: Add …" mana line(s) — all verified mana above
    .join("\n");
  if (!isKeywordOnly(manaStripped, card?.name)) return null;     // any non-keyword static/text residue → Arbiter
  return "native-mixed";                                         // mana ability + X-cast token trigger + keyword body
}
registerCoverageClassifier((card) => classifyXCastTokenCommander(card));

// ─── UR-DRAGON COMMANDER — The Ur-Dragon (the TIER-1 Dragon-tribal pod commander) ───────────────────────────
// "Eminence — As long as The Ur-Dragon is in the command zone or on the battlefield, other Dragon spells you
//  cast cost {1} less to cast.  Flying.  Whenever one or more Dragons you control attack, draw that many cards,
//  then you may put a permanent card from your hand onto the battlefield."
// The general trigger compiler can't route the attack trigger: the condition uses the PLURAL verb "attack"
// (detectTriggers is anchored on singular "attacks"), the effect is a combat-derived VARIABLE count ("draw THAT
// MANY"), and "put a permanent card from your hand onto the battlefield" isn't in the trigger-effect vocabulary
// at all — so detectTriggers returns [] (verified) and a re-parse on flush would fail. The runtime fires a
// DEDICATED hook instead (gameEngine → applyUrDragonAttackTriggers, urDragonAttack.js), which draws one card per
// attacking Dragon, fires the cardDrawn sub-triggers, then puts the best permanent from hand onto the battlefield
// and fires its ETB (proven end-to-end in urDragonAttack.test.js). The Eminence cost-reduction is ALSO fully
// modeled: parseStaticAbilities emits a { costReduction: { subtype:"Dragon", amount:1, fromCommandZone:true,
// excludeSelf:true } } marker (staticAbilityParser line ~655), and legalChoices applies it at the cast site from
// the command zone (the commander's home). So the runtime plays EVERY clause of this card — this classifier
// credits exactly what the engine already does, the additive-seam single-card pattern (the classifyWolverine /
// classifyXCastTokenCommander #353/#356 precedent: returns null unless EVERY clause matches AND no residue
// remains, so it can never cause collateral). Mechanism-keyed (the attack-trigger templating + the eminence
// shape), not name-keyed — but the corpus sweep already proved both shapes are UNIQUE to The Ur-Dragon among
// the relevant cards, so this is effectively its single-card hook (exactly as urDragonAttack.js is).
//
// CREED — whole card, all clauses modeled:
//   • the variable-count attack trigger (parseUrDragonAttackTrigger) → applyUrDragonAttackTriggers;
//   • the Eminence Dragon cost-reduction (the parseStaticAbilities { costReduction, fromCommandZone } marker);
//   • Flying — an ENFORCED COVERED_KEYWORD.
// All-or-nothing: the attack trigger must parse, the eminence marker must be present, NO other detected trigger
// may remain after stripping the attack sentence (detectTriggers returns [] for the whole card, but gate
// defensively), and the residue after stripping the eminence sentence + the attack sentence must be keyword-only.
const UR_DRAGON_ATTACK_SENTENCE_RE =
  /whenever one or more [a-z]+ you control attack, draw that many cards, then you may put a permanent card from your hand onto the battlefield\.?/i;
const UR_DRAGON_EMINENCE_SENTENCE_RE =
  /eminence\s*[—–-]\s*as long as .+? is in the command zone or on the battlefield, other [a-z]+ spells you cast cost \{\d+\} less to cast\.?/i;
function classifyUrDragon(card) {
  const type = String(card?.type ?? card?.type_line ?? "").toLowerCase();
  // The attack hook reads the controller's battlefield permanents — only a creature qualifies (the commander is
  // a Legendary Creature). Gate defensively so this never claims a non-creature.
  if (!/creature/.test(type)) return null;
  if (!parseUrDragonAttackTrigger(card)) return null;            // not the exact variable-count attack shape → not ours
  // The Eminence cost-reduction must parse to a command-zone subtype reducer (what the runtime applies at cast).
  const statics = parseStaticAbilities(card);
  if (!statics.some((s) => s?.costReduction?.fromCommandZone && s.costReduction.subtype)) return null;
  const oracle = String(card?.oracle ?? card?.oracle_text ?? "");
  // Strip the attack-trigger sentence; NO other detected trigger may remain (a second, unmodeled trigger would be
  // silently dropped — a FORBIDDEN FP). detectTriggers already returns [] for the whole card (the plural-attack
  // trigger isn't recognized), so this is belt-and-suspenders: anything it DID detect is unmodeled residue.
  const noTrig = { ...card, oracle: oracle.replace(UR_DRAGON_ATTACK_SENTENCE_RE, "\n") };
  if (detectTriggers(noTrig).length > 0) return null;           // a recognized trigger remains → Arbiter (CREED)
  // Strip reminder + the eminence sentence + the attack sentence; the remainder must be keyword-only (Flying).
  const residueOracle = stripReminder(oracle)
    .replace(UR_DRAGON_EMINENCE_SENTENCE_RE, " ")
    .replace(UR_DRAGON_ATTACK_SENTENCE_RE, " ");
  if (!isKeywordOnly(residueOracle, card?.name)) return null;   // any non-keyword static/text residue → Arbiter
  return "native-mixed";                                        // eminence cost-reduction + attack trigger + keyword body
}
registerCoverageClassifier((card) => classifyUrDragon(card));

// ─── DAMAGE-REPLACEMENT BODY — source-scoped damage doublers (Twinflame Tyrant; generalizes Wolverine's seam) ─
// A permanent whose ONLY non-keyword text is one-or-more MODELED damage-replacement clauses (parseDamageReplacements
// → the synthesized-on-read consult in combatResolution.js / spellEffects.js, applied at every damage-amount
// finalization regardless of tier). The replacement appears/vanishes with the permanent for free (no ETB/LTB
// hook), so the card plays its full effect natively the instant it's on the battlefield. classifyWolverine
// requires ALL THREE of Wolverine's clauses (doubler + end-step counter + regen); this is the simpler general
// case — the doubler is the ONLY ability beyond keywords. Twinflame Tyrant = Flying + "If a source you control
// would deal damage to an opponent or a permanent an opponent controls, it deals double that damage instead."
// → source-controller-scoped multiply×2 → native-static.
// CREED whole-card / additive-seam single-mechanism flip: strip the modeled damage-replacement sentence(s) +
// reminder; the remainder MUST be keyword-only AND carry NO trigger / activated residue (a card with an extra
// unmodeled ability keeps that residue → null). Mechanism-keyed (a future doubler-on-a-keyword-body flips too).
// Returns null unless parseDamageReplacements matched AND no residue remains, so it can never cause collateral.
function classifyDamageReplacementBody(card) {
  const type = String(card?.type ?? card?.type_line ?? "").toLowerCase();
  // The consult reads battlefield permanents — only a permanent qualifies (an instant/sorcery damage doubler is a
  // one-shot, not a synthesized-on-read static, and is handled by the spell path; gate to permanents here).
  if (/\b(instant|sorcery)\b/.test(type) || !/\b(creature|artifact|enchantment|battle)\b/.test(type)) return null;
  if (!parseDamageReplacements(card).length) return null;             // no modeled damage-replacement clause → not ours
  const oracle = String(card?.oracle ?? card?.oracle_text ?? "");
  // Strip the modeled replacement sentence(s); nothing trigger/activated-shaped may remain (would be dropped — FP).
  const stripped = stripDamageReplacementClauses(oracle, card);
  const strippedCard = { ...card, oracle: stripped };
  if (detectTriggers(strippedCard).length > 0) return null;          // a trigger remains → Arbiter (CREED)
  if (parseActivatedAbilities(strippedCard).length > 0) return null; // an activated ability remains → Arbiter
  if (!isKeywordOnly(stripped, card?.name)) return null;             // any other static/text residue → Arbiter
  return "native-static";                                            // damage-replacement static + keyword body
}
registerCoverageClassifier((card) => classifyDamageReplacementBody(card));

// ─── VIHAAN COMMANDER — Vihaan, Goldwaker (the TIER-2 Mardu Treasure-aristocrats commander) ──────────────────
// "Other outlaws you control have vigilance and haste.  At the beginning of combat on your turn, you may have
//  Treasures you control become 3/3 Construct Assassin artifact creatures in addition to their other types
//  until end of turn."
// TWO modeled abilities, BOTH genuinely resolving at runtime:
//   • the OUTLAW ANTHEM — a layer-6 keyword grant (vigilance + haste) scoped to the outlaw meta-type. The
//     parser emits subtypes:["Outlaw"] (parseCreatureSelector's determiner-anthem branch), and layers.js
//     matchesSelector expands "Outlaw" → {Assassin, Mercenary, Pirate, Rogue, Warlock} at the match chokepoint,
//     so every outlaw the controller controls actually gains both keywords (proven in vihaan.test.js). It's a
//     MODELED static (clauseProducesStatic confirms it parses to the layer-6 grant descriptor).
//   • the BEGIN-COMBAT MASS-ANIMATE — the begin-combat TRIGGER is detected (triggerScheduler → combatBegin),
//     but its mass, optional, subject-scoped layer-4 animate effect isn't in the effect vocabulary (no
//     mass-animate-your-permanents atom), so a DEDICATED hook fires it (gameEngine → applyVihaanCombatAnimate,
//     vihaanAnimate.js), REUSING the shipped WALT-ANIMATE layer framework to make every Treasure you control a
//     3/3 Construct Assassin artifact creature (still an artifact) until end of turn (proven end-to-end in
//     vihaan.test.js). parseVihaanCombatAnimate is anchored to the exact templating.
// The general compiler can't route the animate (the flush path re-parses the clause and it parses LOW), so this
// classifier credits exactly what the engine already plays — the additive-seam single-card pattern (the
// classifyWolverine / classifyXCastTokenCommander / classifyUrDragon #353/#356 precedent: returns null unless
// EVERY clause matches AND no residue remains, so it can never cause collateral). Mechanism-keyed (the animate
// templating + the outlaw anthem), not name-keyed.
//
// CREED — whole card, all clauses modeled:
//   • the begin-combat mass-animate (parseVihaanCombatAnimate) → applyVihaanCombatAnimate;
//   • the outlaw anthem static (clauseProducesStatic on the parsed grant).
// All-or-nothing: the animate must parse; the anthem must be a modeled static; the combatBegin trigger (the
// animate's own trigger) must be the ONLY detected trigger; and the residue after stripping the animate
// trigger sentence + the anthem sentence must be keyword-only (Vihaan's body is vanilla — no other keyword,
// so the residue must be EMPTY). Returns native-mixed (anthem static + animate trigger) or null.
const VIHAAN_ANIMATE_SENTENCE_RE =
  /at the beginning of combat on your turn, you may have treasures you control become \d+\/\d+ [a-z ]+? in addition to their other types until end of turn\.?/i;
const VIHAAN_ANTHEM_SENTENCE_RE =
  /other outlaws you control have vigilance and haste\.?/i;
function classifyVihaan(card) {
  const type = String(card?.type ?? card?.type_line ?? "").toLowerCase();
  // The animate hook reads the active player's battlefield Treasures; the anthem grants to controlled creatures
  // — only a creature (the commander is a Legendary Creature) qualifies. Gate defensively.
  if (!/creature/.test(type)) return null;
  if (!parseVihaanCombatAnimate(card)) return null;             // not the exact mass-Treasure-animate shape → not ours
  // The outlaw anthem must parse to a modeled layer-6 keyword-grant static (what the runtime applies).
  if (!clauseProducesStatic("Other outlaws you control have vigilance and haste")) return null;
  const oracle = stripReminder(String(card?.oracle ?? card?.oracle_text ?? ""));
  if (!VIHAAN_ANTHEM_SENTENCE_RE.test(oracle)) return null;     // the anthem sentence must actually be present on THIS card
  // The combatBegin trigger (the animate's own trigger) is the ONLY trigger this card may carry. A second
  // detected trigger is residue the runtime won't play through this tier — crediting it would be a FORBIDDEN
  // dropped-ability FP (CREED). detectTriggers on the WHOLE card must be exactly that one combatBegin trigger.
  const triggers = detectTriggers(card);
  if (triggers.length !== 1 || triggers[0].event !== "combatBegin") return null;
  // Strip reminder + the animate trigger sentence + the anthem sentence; the remainder must be keyword-only
  // (Vihaan is a vanilla body, so it must be EMPTY). A rider / extra ability keeps residue → null → Arbiter.
  const residue = oracle
    .replace(VIHAAN_ANIMATE_SENTENCE_RE, " ")
    .replace(VIHAAN_ANTHEM_SENTENCE_RE, " ");
  if (!isKeywordOnly(residue, card?.name)) return null;         // any non-keyword static/text residue → Arbiter
  return "native-mixed";                                        // outlaw anthem static + begin-combat animate trigger
}
registerCoverageClassifier((card) => classifyVihaan(card));

// ─── OMNATH, LOCUS OF MANA — the TIER-2 mono-green ramp commander ─────────────────────────────────────────
// "You don't lose unspent green mana as steps and phases end.  Omnath gets +1/+1 for each unspent green mana
//  you have."
// TWO STATIC abilities, BOTH genuinely resolving at runtime through registries the engine already consults:
//   • GREEN-MANA RETENTION (CR 500.4) — cardEffects.REGISTRY["Omnath, Locus of Mana"].manaDoesNotEmpty = ["G"];
//     gameEngine.emptyManaPools (the single step/phase-end chokepoint, routed through advanceStep) keeps the
//     controller's green and empties everything else, controller-scoped (manaDoesNotEmpty reads only that
//     player's battlefield — a NON-controller's green still empties). Proven in cardEffects.test.js.
//   • DYNAMIC +1/+1-PER-GREEN (CR 613, layer 7c) — layers.STATIC_REGISTRY emits a { layerOp:"ptModifyDynamic",
//     fn:"omnathGreen" } self descriptor; DYNAMIC_PT_FNS.omnathGreen reads the controller's live unspent green
//     (state.players[controller].manaPool.G ?? 0) every P/T computation, so Omnath is a live X/X that grows as
//     green is floated and SHRINKS as it's spent — recursion-safe (a plain pool read, never deriveCharacteristics).
//     Proven both directions + in combat in cardEffects.test.js / layers.test.js.
// The general oracle parser can't route either clause (retention is a pool-emptying override with no atom; the
// P/T half is a live mana-pool-derived value), so this classifier credits EXACTLY what the engine already plays
// — the additive-seam single-card pattern (the classifyWolverine / classifyUrDragon / classifyVihaan #353/#356
// precedent: returns null unless EVERY clause matches AND no residue remains, so it can never cause collateral).
// GROUNDED on the two RUNTIME registries (not name-only): the retention descriptor must carry "G" AND the layer-7c
// dynamic descriptor must be present — so the credit tracks the engine, and would self-disable if either half were
// ever removed (the failure mode that killed an earlier build).
//
// CREED — whole card, both clauses modeled:
//   • retention: cardEffects.REGISTRY[name].manaDoesNotEmpty includes "G";
//   • dynamic P/T: layers.staticEffectsOf emits a ptModifyDynamic (omnathGreen) descriptor.
// All-or-nothing: BOTH sentences must be present on THIS card; both registries must back them; NO trigger or
// activated ability may remain; and the residue after stripping both sentences must be keyword-only (Omnath's
// body is vanilla, so the residue must be EMPTY). Returns native-static (two static abilities) or null.
const OMNATH_RETENTION_SENTENCE_RE =
  /you don't lose unspent green mana as steps and phases end\.?/i;
const OMNATH_DYNAMIC_PT_SENTENCE_RE =
  /[a-z, ]+ gets \+1\/\+1 for each unspent green mana you have\.?/i;
function classifyOmnathLocus(card) {
  const type = String(card?.type ?? card?.type_line ?? "").toLowerCase();
  // Both halves read the source's controller (P/T) / the controller's battlefield (retention) — only a creature
  // (the commander is a Legendary Creature) qualifies. Gate defensively so this never claims a non-creature.
  if (!/creature/.test(type)) return null;
  const oracle = stripReminder(String(card?.oracle ?? card?.oracle_text ?? ""));
  // Both sentence shapes must actually be present on THIS card (mechanism-keyed, not name-only).
  if (!OMNATH_RETENTION_SENTENCE_RE.test(oracle)) return null;
  if (!OMNATH_DYNAMIC_PT_SENTENCE_RE.test(oracle)) return null;
  // GROUND the retention half on the runtime registry the engine consults (cardEffects.manaDoesNotEmpty).
  if (!cardEffectsRegistry[card?.name]?.manaDoesNotEmpty?.includes("G")) return null;
  // GROUND the dynamic-P/T half on the layer engine (staticEffectsOf reads layers.STATIC_REGISTRY) — there must
  // be a layer-7c ptModifyDynamic descriptor (omnathGreen). Synthetic permanent (no state needed for the registry
  // lookup); staticEffectsOf is pure and returns [] for an unregistered card.
  const statics = staticEffectsOf(null, { card });
  if (!statics.some((e) => e?.op?.layerOp === "ptModifyDynamic" && e.op.fn === "omnathGreen")) return null;
  // Neither ability is a trigger or activated ability — a detected one would be unmodeled residue the runtime
  // won't play through this tier (a FORBIDDEN dropped-ability FP, CREED). Belt-and-suspenders.
  if (detectTriggers(card).length > 0) return null;
  if (parseActivatedAbilities(card).length > 0) return null;
  // Strip both modeled sentences; the remainder must be keyword-only (Omnath is a vanilla body, so EMPTY).
  const residue = oracle
    .replace(OMNATH_RETENTION_SENTENCE_RE, " ")
    .replace(OMNATH_DYNAMIC_PT_SENTENCE_RE, " ");
  if (!isKeywordOnly(residue, card?.name)) return null;         // any non-keyword static/text residue → Arbiter
  return "native-static";                                       // green-mana retention + dynamic +1/+1-per-green
}
registerCoverageClassifier((card) => classifyOmnathLocus(card));

// ─── SEEDBORN-UNTAP — Seedborn Muse (the Omnath / mono-green ramp untap engine) ──────────────────────────────
// "Untap all permanents you control during each other player's untap step."
// ONE static ability that genuinely resolves at runtime through a DEDICATED untap-step hook (gameEngine.
// runStepActions → case "untap" → applySeedbornUntap, seedbornUntap.js): during every OTHER player's untap
// step, the watcher's controller untaps all THEIR permanents too. The general parser can't route it (no
// "during each other player's untap step" event in detectTriggers, no untap-others atom in the effect
// vocabulary), so this classifier credits EXACTLY what the engine plays — the additive-seam single-card
// pattern (the classifyWolverine / classifyVihaan #319 precedent: returns null unless the static matches AND
// no residue remains, so it can never cause collateral). Mechanism-keyed (the exact templating), not name-keyed.
//
// CREED — whole card, the one ability modeled:
//   • the untap static (isSeedbornUntap → applySeedbornUntap).
// All-or-nothing: the static must be present on THIS card; NO trigger or activated ability may remain (a
// detected one would be unmodeled residue the runtime won't play through this tier — a FORBIDDEN dropped-
// ability FP); and the residue after stripping the untap sentence must be keyword-only (Seedborn Muse is a
// vanilla body, so the residue must be EMPTY). A card that ALSO carries an anthem / second ability (Murkfiend
// Liege — "Other green creatures you control get +1/+1") keeps that residue → null → stays body-only.
// Returns native-static or null.
const SEEDBORN_UNTAP_SENTENCE_RE =
  /untap all permanents you control during each other player'?s untap step\.?/i;
function classifySeedbornUntap(card) {
  const type = String(card?.type ?? card?.type_line ?? "").toLowerCase();
  // The hook untaps a battlefield permanent's controller — only a permanent (Seedborn Muse is a creature)
  // qualifies. Gate defensively so this never claims an instant/sorcery/land/PW.
  if (/\b(instant|sorcery|land)\b/.test(type) || !/\b(creature|artifact|enchantment)\b/.test(type)) return null;
  if (!isSeedbornUntap(card)) return null;                       // not the exact untap-others static → not ours
  const oracle = stripReminder(String(card?.oracle ?? card?.oracle_text ?? ""));
  // Neither half is a trigger or activated ability — a detected one is unmodeled residue (CREED). Belt-and-suspenders.
  if (detectTriggers(card).length > 0) return null;
  if (parseActivatedAbilities(card).length > 0) return null;
  // Strip the modeled untap sentence; the remainder must be keyword-only (Seedborn is vanilla → EMPTY). An
  // anthem / second ability (Murkfiend Liege) leaves residue → null → Arbiter.
  const residue = oracle.replace(SEEDBORN_UNTAP_SENTENCE_RE, " ");
  if (!isKeywordOnly(residue, card?.name)) return null;         // any non-keyword static/text residue → Arbiter
  return "native-static";                                       // the during-each-other-untap-step untap static
}
registerCoverageClassifier((card) => classifySeedbornUntap(card));

// ─── MURKFIEND-UNTAP — Murkfiend Liege (Simic G/U anthem + phase-static untap engine) ─────────────────────────
// "Other green creatures you control get +1/+1.
//  Other blue creatures you control get +1/+1.
//  Untap all green and/or blue creatures you control during each other player's untap step."
// Two color anthems (green +1/+1, blue +1/+1 — already covered by staticAbilitiesCoverCard) PLUS the same
// "during each other player's untap step" phase static Seedborn Muse carries, but FILTERED to the
// controller's green/blue CREATURES. The general parser can't route the untap (no untap-others atom / phase
// event); the runtime plays it through a DEDICATED hook (gameEngine.runStepActions → case "untap" →
// applyMurkfiendUntap, murkfiendUntap.js) that untaps each non-active watcher-controller's green/blue
// creatures — reading the SAME layer-aware effective color/type the anthems use. Seedborn's own classifier
// rejects this card (its residue check requires an EMPTY body, and the anthems leave residue), so this is a
// separate additive classifier that credits the untap static AND requires the anthem residue to be fully
// covered. Mechanism-keyed (the exact untap templating), not name-keyed.
//
// CREED — whole card, all three abilities modeled:
//   • green anthem + blue anthem (staticAbilitiesCoverCard, layer-7 group buffs the runtime applies);
//   • the untap phase static (isMurkfiendUntap → applyMurkfiendUntap, the color/type-filtered untap hook).
// All-or-nothing: the untap static must be present on THIS card; NO trigger or activated ability may remain
// (a detected one is unmodeled residue the runtime won't play through this tier — a FORBIDDEN dropped-ability
// FP, e.g. Balefire Liege's cast triggers keep IT non-native); and after stripping the untap sentence the
// remainder must be fully covered by staticAbilitiesCoverCard (the two anthems). Returns native-static or null.
const MURKFIEND_UNTAP_SENTENCE_RE =
  /untap all green and\/or blue creatures you control during each other player'?s untap step\.?/i;
function classifyMurkfiendUntap(card) {
  const type = String(card?.type ?? card?.type_line ?? "").toLowerCase();
  // The hook untaps a battlefield permanent's controller's creatures — only a permanent qualifies. Gate
  // defensively so this never claims an instant/sorcery/land/PW.
  if (/\b(instant|sorcery|land)\b/.test(type) || !/\b(creature|artifact|enchantment)\b/.test(type)) return null;
  if (!isMurkfiendUntap(card)) return null;                      // not the exact green/blue-untap static → not ours
  // Neither the untap nor the anthems is a trigger/activated ability — a detected one is unmodeled residue
  // (CREED). Belt-and-suspenders: Balefire Liege's "Whenever you cast a red spell…" would trip this.
  if (detectTriggers(card).length > 0) return null;
  if (parseActivatedAbilities(card).length > 0) return null;
  // Strip the modeled untap sentence; the remainder (the two anthems + any keyword line) must be fully
  // covered by the general static path — the anthems parse to layer-7 group buffs, keyword lines are vanilla.
  const oracle = String(card?.oracle ?? card?.oracle_text ?? "");
  const stripped = { ...card, oracle: oracle.replace(MURKFIEND_UNTAP_SENTENCE_RE, " ").replace(/\s+/g, " ").trim() };
  if (!staticAbilitiesCoverCard(stripped, (c) => isKeywordOnly(c, card?.name))) return null; // unmodeled anthem residue → Arbiter
  return "native-static";                                        // green/blue anthems + the phase-filtered untap static
}
registerCoverageClassifier((card) => classifyMurkfiendUntap(card));

// ─── TYPE-FILTERED UNTAP — Unwinding Clock #545 / Drumbellower #1940 / Prophet of Kruphix ──────────────────────
// "Untap all <artifacts|creatures|creatures and lands> you control during each other player's untap step."
// The third shape of the Seedborn/Murkfiend phase-static family, and the first one PARAMETERIZED rather than
// hard-coded per card (typeFilteredUntap.js). The runtime hook is real (gameEngine.runStepActions → case
// "untap" → applyTypeFilteredUntap) and reads the SAME parser this classifier gates on, so the credited
// static is genuinely enforced — never a claimed-native no-op.
//
// CREED — whole card, all-or-nothing, mirroring classifyMurkfiendUntap exactly: NO trigger or activated
// ability may remain (Quest for Renewal's counter trigger and Ohabi Caleria's damage trigger both trip
// this), and the residue after stripping the untap sentence must be fully covered by the general static
// path (Drumbellower's "Flying" is keyword-only; Prophet of Kruphix's flash-cast permission is a modeled
// static). Anything else → null → the card stays body-only.
const TYPE_UNTAP_SENTENCE_RE =
  /untap all (?:artifacts|creatures|creatures and lands) you control during each other player'?s untap step\.?/i;
function classifyTypeFilteredUntap(card) {
  const type = String(card?.type ?? card?.type_line ?? "").toLowerCase();
  // The hook untaps a battlefield permanent's controller's permanents — only a permanent qualifies.
  if (/\b(instant|sorcery|land)\b/.test(type) || !/\b(creature|artifact|enchantment)\b/.test(type)) return null;
  if (!parseTypeFilteredUntap(card)) return null;                // not a type-filtered untap static → not ours
  if (detectTriggers(card).length > 0) return null;              // an unmodeled trigger is dropped-ability residue
  if (parseActivatedAbilities(card).length > 0) return null;
  const oracle = String(card?.oracle ?? card?.oracle_text ?? "");
  const rest = oracle.replace(TYPE_UNTAP_SENTENCE_RE, " ").replace(/\s+/g, " ").trim();
  if (!rest) return "native-static";                             // the untap line was the whole card
  if (isKeywordOnly(rest, card?.name)) return "native-static";   // Drumbellower — Flying
  if (staticAbilitiesCoverCard({ ...card, oracle: rest }, (c) => isKeywordOnly(c, card?.name))) return "native-static";
  return null;                                                   // unmodeled residue → Arbiter
}
registerCoverageClassifier((card) => classifyTypeFilteredUntap(card));

// ─── GROUP NO-UNTAP STATIC — Winter-Orb / Meekstone / Choke lock family (BLITZ UT-1, CR 302.6) ────────────────
// A CONTINUOUS static "<filter> don't untap during their controllers' untap steps" that holds every matching
// permanent tapped through its controller's untap step. NOW ENFORCED in the runtime — gameState.untapAll
// (groupPreventsUntap) reads the SAME groupNoUntap.js recognition source and skips the matching permanents at
// the untap-step chokepoint the stun/self/attached machinery already uses, so the metric may credit the static
// (metric mirrors runtime, CREED). Only the fail-closed supported filter vocabulary flips (subtype Island,
// nonbasic land, creature power ≥/≤ N); an unsupported filter (Crackdown's "nonwhite", An-Zerrin's chosen type)
// yields NO filter → this card is not ours → parks (safe FN).
//
// CREED — whole card, the static modeled:
//   • the group no-untap static (groupNoUntapFiltersOf → groupPreventsUntap).
// All-or-nothing (mirrors classifySeedbornUntap): NO trigger or activated ability may remain (a detected one is
// unmodeled residue the runtime won't play through this tier — a FORBIDDEN dropped-ability FP; e.g. Curse of
// Marit Lage's "tap all Islands" ETB and Embargo's "you lose 2 life" upkeep keep those cards parked), and after
// stripping the modeled static sentence(s) the remainder must be keyword-only or fully static-covered (the five
// shipped locks — Choke / Back to Basics / Meekstone / Marble Titan / Juntu Stakes — are static-only bodies, so
// the residue is EMPTY). Returns native-static or null. Mechanism-keyed (the exact templating), not name-keyed.
function classifyGroupNoUntap(card) {
  const type = String(card?.type ?? card?.type_line ?? "").toLowerCase();
  // A continuous static lives on a permanent — never an instant/sorcery. Gate defensively.
  if (/\b(instant|sorcery)\b/.test(type)) return null;
  const filters = groupNoUntapFiltersOf(card);
  if (filters.length === 0) return null;                         // no supported group no-untap static → not ours
  // No unmodeled trigger/activated residue may remain (CREED — the runtime plays only the static through this tier).
  if (detectTriggers(card).length > 0) return null;
  if (parseActivatedAbilities(card).length > 0) return null;
  // Strip the modeled static sentence(s); the remainder must be keyword-only (the five shipped locks are
  // static-only → EMPTY) or fully covered by the general static path (a future lock + anthem composition).
  const oracle = String(card?.oracle ?? card?.oracle_text ?? "");
  const residue = oracle.replace(GROUP_NO_UNTAP_SENTENCE_RE, " ").replace(/\s+/g, " ").trim();
  if (isKeywordOnly(residue, card?.name)) return "native-static";
  if (staticAbilitiesCoverCard({ ...card, oracle: residue }, (c) => isKeywordOnly(c, card?.name))) return "native-static";
  return null;                                                   // unmodeled residue → Arbiter (safe FN)
}
registerCoverageClassifier((card) => classifyGroupNoUntap(card));

// ─── ADVENTURE (CR 715) — Bonecrusher Giant // Stomp et al. (HIGH corpus yield, ~150 cards) ──────────────────
// An Adventure card has a CREATURE half and an instant/sorcery "Adventure" half (CR 715.1). From hand you may
// cast EITHER half (CR 715.3); casting the Adventure half resolves its spell effect, then EXILES the card (CR
// 715.3d), and while exiled you may cast the CREATURE half from exile at its own cost (CR 715.3e). The runtime
// plays the WHOLE flow (legalChoices.actionsCastAdventureFromHand offers both faces' casts; the adventure spell
// resolves through the EFFECT_PROGRAM interpreter and the card lands in adventure-exile; the creature is then
// castable from exile via actionsCastCreatureFromAdventureExile → applyCastSpell → PERMANENT_ETB), so this
// classifier credits exactly what the engine plays end-to-end.
//
// CREED — whole card, BOTH halves modeled (the adventure.js shape module splits the combined publicCard oracle):
//   • the CREATURE half is a native tier — classifyCard on the creature-face VIEW returns a native tier. This
//     reuses EVERY existing creature classifier (keyword body, ETB/dies trigger, modeled activated/static,
//     enters-with-counters, …), so a creature half with an unmodeled ability fails here and the WHOLE card
//     stays body-only. classifyCard is mutually recursive with this classifier, but ONLY ever on a SINGLE-FACE
//     view (no "//" in the projected type) — parseAdventureCard returns null for a single face, so the recursion
//     terminates immediately (a face view never re-enters this Adventure branch).
//   • the ADVENTURE half's instant/sorcery effect is native — spellIsNative on the adventure-face VIEW (its
//     EffectProgram parses HIGH with no combat-referent atom; the "(Then exile this card…)" reminder is stripped
//     by parseAdventureCard so it never drags the program down).
// All-or-nothing: either half unmodeled → null → the card stays body-only (a SAFE false-negative; never a
// partial flip that silently drops the unmodeled half — THE CREED). Returns "native-mixed" (a composite of a
// modeled creature body + a modeled spell), or null. Mechanism-keyed (the layout), so every clean Adventure
// card in the corpus flips automatically — this is a GENERAL subsystem, not a single-card hook.
//
// NOTE: called INLINE at the TOP of classifyCard (before the instant/sorcery branch), NOT via the additive
// registry seam — the seam runs only after the instant/sorcery branch, which would mis-route the combined
// adventure type line first. It's a plain function declaration (hoisted), so the early call resolves it.
function classifyAdventure(card) {
  const parsed = parseAdventureCard(card);
  if (!parsed) return null;                                       // not an instant/sorcery-adventure card → not ours
  const { creature, adventure } = faceViews(parsed);
  if (!isNativeTier(classifyCard(creature))) return null;         // the creature half's body/abilities must be modeled
  if (!spellIsNative(adventure)) return null;                     // the adventure half's spell effect must be modeled
  return "native-mixed";                                          // both halves modeled — the engine plays the whole card
}

// SPLIT CARDS (CR 709) — Find // Finality, Flesh // Blood, the 58-card plain-split class. Like classifyAdventure
// this MUST be intercepted at the TOP of classifyCard (before the instant/sorcery branch): a split card's
// COMBINED type line is "Sorcery // Sorcery", so `/\b(instant|sorcery)\b/.test(type)` would match and route the
// whole card to spellIsNative on the COMBINED oracle (both faces' header + text mashed together → LOW →
// arbiter-spell). The splitCard.js shape module parses the two halves; a split card is native iff spellIsNative
// holds for BOTH face views (each parses HIGH with no combat-referent atom). All-or-nothing: either half
// unmodeled → null → the whole card stays an Arbiter spell (a SAFE false-negative, never a dropped half — THE
// CREED). FUSE + AFTERMATH are parked inside parseSplitCard (an unmodeled cast option / zone). The runtime plays
// the whole flow: legalChoices.actionsCastSplitFromHand offers BOTH halves' casts, each resolving through the
// EFFECT_PROGRAM interpreter with the card landing in the graveyard (the dispatcher's faceCard path, reused from
// adventure — no new dispatch code). Returns "native-spell" (both halves are spells) or null.
function classifySplit(card) {
  const parsed = parseSplitCard(card);
  if (!parsed) return null;
  const { left, right } = splitFaceViews(parsed);
  if (!spellIsNative(left)) return null;
  if (!spellIsNative(right)) return null;
  return "native-spell";
}

// ─── KW-ANNIHILATOR (CR 702.86a) — the Eldrazi forced-mass-sacrifice attack keyword ─────────────────────────
// "Annihilator N" = "Whenever this creature attacks, defending player sacrifices N permanents."  ENFORCED at
// runtime by applyAnnihilatorTriggers (annihilator.js → wired into gameEngine at the declare-blockers step):
// each attacking annihilator obligates its defending player to sacrifice N permanents of their choice, driven
// through the SHIPPED edict sacrifice chain (a human defender picks; an AI auto-sacs its weakest). So a creature
// whose ENTIRE remaining body is otherwise modeled plays its whole card natively the instant it attacks.
//
// CREED — whole card, all clauses modeled (the classifyWolverine / classifyUrDragon / classifyVihaan #353/#356
// additive-seam precedent: returns null unless EVERY clause matches AND no residue remains, so it can never
// cause collateral). Mechanism-keyed (the annihilator keyword + an otherwise keyword-only body), NOT name-keyed:
//   • annihilator must be present (parseAnnihilator) — the credited mechanism the runtime hook enforces;
//   • the card carries NO other triggered ability — detectTriggers(card) must be EMPTY. Annihilator itself is
//     not a detected trigger (its reminder's "Whenever this creature attacks…" doesn't classify to any event —
//     verified), so a non-empty result means a SECOND, unmodeled trigger (Ulamog's "When you cast this spell…",
//     Kozilek's "When … is put into a graveyard …") → null → the whole Eldrazi titan PARKS to the Arbiter;
//   • after stripping the annihilator keyword line(s), the remaining oracle must be keyword-only (isKeywordOnly)
//     — so a vanilla body (the cheap Annihilator 1/2 Eldrazi) or a keyword body (Flying/trample/…) flips, but
//     any extra static / activated / one-shot text (indestructible-granting auras of text, "exile" payoffs,
//     devoid is already a covered keyword) that ISN'T a covered keyword keeps residue → null → Arbiter.
// All-or-nothing — an unmodeled clause leaves the card body-only (a SAFE false-negative), never a partial flip
// that silently drops it. Returns "native-trigger" (annihilator is, mechanically, an enforced triggered
// ability + an otherwise keyword body), or null. Gate to creatures (the keyword only ever appears on creatures).
//
// Strips ONLY the bare keyword token "annihilator N" (+ optional trailing comma/period), leaving any other
// keyword in the same comma-list intact for isKeywordOnly to validate. The card name is normalized to "this
// creature" by isKeywordOnly itself, so a self-named keyword line still reads as covered.
const ANNIHILATOR_KEYWORD_STRIP = /(?:^|\n|, |; )annihilator\s+\d+\s*(?=$|[\n,;.])/gi;
function classifyAnnihilator(card) {
  const type = String(card?.type ?? card?.type_line ?? "").toLowerCase();
  if (!/creature/.test(type)) return null;                        // annihilator is a creature-only keyword
  if (!parseAnnihilator(card)) return null;                       // no annihilator keyword → not ours
  // No OTHER triggered ability may ride along (annihilator isn't a detected trigger — see header). A second
  // detected trigger is unmodeled residue the runtime won't play through this tier → FORBIDDEN dropped-ability
  // FP. This is what PARKS Ulamog / Kozilek (their cast / GY-shuffle triggers).
  if (detectTriggers(card).length > 0) return null;
  // Strip reminder (CR 207.2) + the annihilator keyword line(s); the remainder must be keyword-only (vanilla or
  // evergreen keywords). A non-keyword static/activated/one-shot clause keeps residue → null → Arbiter.
  const residue = stripReminder(String(card?.oracle ?? card?.oracle_text ?? "")).replace(ANNIHILATOR_KEYWORD_STRIP, " ");
  if (!isKeywordOnly(residue, card?.name)) return null;
  return "native-trigger";                                        // enforced annihilator trigger + an otherwise keyword body
}
registerCoverageClassifier((card) => classifyAnnihilator(card));

// ─── BESTOW (CR 702.103) ─────────────────────────────────────────────────────────
//
// A bestow creature (Theros) is an Enchantment Creature with a "Bestow {cost}" alt-cast that lets it
// be cast as an AURA enchanting a creature (granting "+X/+X" and/or a keyword), and it BECOMES A
// CREATURE again whenever it stops being attached. It plays END-TO-END natively now: both modes work
// at runtime —
//   • CREATURE mode: the normal permanent-spell cast (already offered) enters it as a creature.
//   • AURA mode: legalChoices offers a bestow cast per legal creature target at the bestow cost
//     (isAuraSpell + bestow:true); the dispatcher routes it through the SAME AURA_ETB resolver, which
//     enters it attached + flagged `bestowed`. The enchanted-creature bonus is the SAME parseAuraBonus
//     descriptor a printed Aura uses, applied by layers.staticEffectsOf scoped to attachedTo. While
//     attached, staticEffectsOf also emits a layer-4 REMOVAL of the Creature type (CR 702.103e — it's
//     an Aura, not a creature). When the host leaves, the falls-off SBA EXEMPTS a bestowed permanent
//     (gameState.detachPermanentFromAll): it stays on the battlefield, just unattached → its layer-4
//     removal lapses and it's a creature again, the bonus disappears (keyed on attachedTo).
//
// ALL-OR-NOTHING (CREED — whole card or PARK): native iff (1) it's an Enchantment Creature with a clean
// Bestow cost, (2) the AURA-mode bonus parses (parseAuraBonus non-empty, itself all-or-nothing — a rider
// drops the whole bonus), AND (3) the CREATURE-mode body (oracle minus the bestow line + the enchanted-
// creature bonus clauses) is keyword-only. A bestow card whose creature body has unmodeled abilities, or
// whose aura bonus has a rider, fails one of these and stays body-only (→ Arbiter at cast). Single source
// of truth shared with the runtime offer (legalChoices imports isNativeBestow).
const BESTOW_LINE_RE = /(?:^|\n)[^\n]*\bbestow\s+(?:\{[^}]+\})+[^\n]*(?=\n|$)/i;
export function isNativeBestow(card) {
  if (!isEnchantmentCreature(card)) return false;
  if (!parseBestowCost(card)) return false;
  // (2) the aura mode's enchanted-creature bonus must parse clean (all-or-nothing; a rider → []).
  if (!parseAuraBonus(card).length) return false;
  // (3) the creature-mode body — everything that ISN'T the bestow line or an enchanted-creature bonus
  // clause — must be keyword-only (vanilla / evergreen keywords the layer-body already plays). Strip the
  // bestow LINE, then drop every clause that touches the enchanted creature (those are the parsed aura
  // bonus, validated in (2)); the remainder is the self body. Reminder text is dropped by isKeywordOnly.
  const noBestow = stripReminder(String(card?.oracle ?? card?.oracle_text ?? "")).replace(BESTOW_LINE_RE, "\n");
  const selfBody = equipmentAbilityClauses(noBestow)
    .filter((cl) => !/enchanted creature/i.test(cl))   // an enchanted-creature clause is aura-mode, not self
    .join(". ");
  if (isKeywordOnly(selfBody, card?.name)) return true;
  // ===== BESTOW + A MODELED TRIGGER (2026-07-30) =====
  // (3) originally demanded a KEYWORD-ONLY creature body, which parked every bestow card carrying a triggered
  // ability — including ones whose trigger the engine already routes natively. Measured: 8 such cards
  // (Springheart Nantuko, Herald of Torment, Crystalline Nautilus, Nyxborn Unicorn, Indebted Spirit,
  // Spiteful Returned, Thassa's Emissary, …). The AURA mode is untouched by a self-body trigger, and the
  // CREATURE mode is exactly what triggerRoutesNatively already validates, so the two modes compose.
  //
  // ⛔ STILL ALL-OR-NOTHING. Every detected trigger must route natively, AND the body with its trigger lines
  // removed must be keyword-only. A bestow card with one routing trigger and one unmodeled non-keyword line
  // fails the remainder check and stays parked — the widening admits triggers, never residue.
  const trigs = detectTriggers(card) || [];
  if (!trigs.length || !trigs.every((d) => triggerRoutesNatively(d))) return false;
  // Strip whole LINES, not the descriptor's sourceText. `sourceText` is only the trigger's HEAD — it carries
  // neither the ability-word label ("Landfall — ") nor any following sentence of the effect, so a substring
  // strip leaves debris that is not keyword-only and the card parks for the wrong reason. A printed trigger
  // occupies its own oracle line, so the line IS the unit. A trigger whose head cannot be located in any line
  // returns false rather than guessing (FN-safe).
  const lines = noBestow.split("\n").map((l) => l.trim()).filter(Boolean)
    .filter((l) => !/enchanted creature/i.test(l));                 // aura-mode, validated in (2)
  const remaining = [];
  const heads = trigs.map((d) => String(d?.sourceText || "").trim()).filter(Boolean);
  if (heads.length !== trigs.length) return false;
  for (const line of lines) {
    if (heads.some((h) => line.includes(h))) continue;              // this line IS a natively-routing trigger
    remaining.push(line);
  }
  return isKeywordOnly(remaining.join("\n"), card?.name);
}
// Native tier: a bestow creature plays via the AURA attach machinery (its defining mode), so it shares the
// "native-aura" tier — the metric counts EXACTLY the bestow cards the runtime attaches + plays natively.
registerCoverageClassifier((card) => (isNativeBestow(card) ? "native-aura" : null));

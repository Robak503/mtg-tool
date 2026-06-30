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

import { parseEffectProgram, programConfidence } from "./effects/parser.js";
import { stripCostOnlyKeywordLines } from "./effects/parseHelpers.js"; // CONVOKE/AFFINITY = cost-only keywords (strip before parse; runtime hard-casts at full cost — CREED-safe per Ninjutsu precedent)
import { detectTriggers, stripTriggerAbilityLabel, parseGrantedTriggeredAbilities } from "./triggers.js";
import { parseActivatedAbilities, parseAbilityCost, parseGrantedActivatedAbilities, isModeledGroupActivatedBody, parsePlotCost, foldModalBulletLines } from "./effects/abilities.js";
import { staticAbilitiesCoverCard, clauseProducesStatic, isLevelGatedOracle, parseEquipmentBonus, equipmentAbilityClauses, isAuraCard, isNativeAura, isNativeManaAura, isNativeManaGrantAura, entersWithPlusCounters, entersWithXCounters, entersWithMetricCounters, entersTapped, selfCostReductionMetric, registerGroupActivatedBodyValidator, registerGroupTriggeredBodyValidator } from "./staticAbilityParser.js";
import { isCloneCard } from "./cloneCopy.js";
import { planeswalkerNativelyCovered, planeswalkerPlayable } from "./effects/loyaltyAbilities.js";
import { castsAsPlaneswalker, isPlaneswalker } from "./gameState.js";
// triggerRoutesNatively (+ the group-triggered-grant validator) extracted to triggerRouting.js — its
// transitive deps (parseEffectClause / program* / winConditionParseable / interveningIfParseable) live there.
import { triggerRoutesNatively, isModeledGroupTriggeredBody } from "./triggerRouting.js";
import { isNativeGroupWard } from "./groupWard.js";
import { isEnforcedEvasionClause } from "./combatEvasion.js";
import { stripCreatedTokenAbilities } from "./manaModel.js";
// OMNATH — ground the classifier on the two RUNTIME registries the engine actually consults (never a
// name-only credit): staticEffectsOf reads layers.STATIC_REGISTRY (the layer-7c dynamic +1/+1-per-green
// descriptor), _registry is cardEffects.REGISTRY (the green-mana retention descriptor). Both are leaf
// modules (layers imports staticAbilityParser/keywords/protection; cardEffects imports nothing) and
// neither imports coverage.js, so these edges are acyclic.
import { staticEffectsOf } from "./layers.js";
import { _registry as cardEffectsRegistry } from "./cardEffects.js";
import { isPureDoubler, doublerProfile, stripModeledDoublerClauses } from "./replacementEffects.js"; // counter/token doublers → native (full-card)
import { marksDamageToCreature, ENDSTEP_COUNTER } from "./wolverine.js"; // Wave-5a: Wolverine whole-card runtime hook
import { parseDamageReplacements, stripDamageReplacementClauses } from "./damageReplacements.js"; // Wave-5a: source-scoped damage doubler parser + clause stripper
import { parseXCastTokenTrigger } from "./xCastToken.js"; // X-CAST-TOKEN commander (Zaxara) — runtime hook lives in actionDispatcher (applyXCastTokenTriggers)
import { parseUrDragonAttackTrigger } from "./urDragonAttack.js"; // UR-DRAGON commander — runtime hook lives in gameEngine (applyUrDragonAttackTriggers)
import { parseVihaanCombatAnimate } from "./vihaanAnimate.js"; // VIHAAN commander — runtime hook lives in gameEngine (applyVihaanCombatAnimate)
import { parseStaticAbilities } from "./staticAbilityParser.js"; // for the eminence cost-reduction marker (Ur-Dragon classifier)

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
  // into -1/-1 counters (CR 702.90b/702.79b); infect reroutes combat damage to a player into poison
  // (702.90a); toxic N adds N poison on top of normal player damage (702.180a); ten poison loses the
  // game (704.5c). "toxic" matches the oracle clause "toxic N" via the startsWith check.
  "infect", "wither", "toxic",
  // KW-FADING / KW-VANISHING — ENFORCED: enters with N fade/time counters (resolvers PERMANENT_ETB) +
  // the upkeep remove-or-sacrifice (gameEngine → fading.applyFadeVanishUpkeep), CR 702.32a / 702.63a.
  // "fading N" / "vanishing N" match via the startsWith check.
  "fading", "vanishing",
  // BUSHIDO / RAMPAGE (subsystem 2) — ENFORCED: the keyword's triggered ability is synthesized in
  // detectTriggers + fired by checkBlockTriggers. Bushido (CR 702.46a — "blocks or becomes blocked → +N/+N
  // this turn") + Rampage (CR 702.23a — "becomes blocked → +N/+N for each blocker beyond the first", a
  // DYNAMIC amount computed at fire time). "bushido N" / "rampage N" match via the startsWith check;
  // allTriggerSentencesModeled bumps the shaped count for each.
  "bushido", "rampage",
  // KW-CYCLING is NOT a generic startsWith keyword — see reCyclingCost in isKeywordOnly. The generic
  // `startsWith("cycling ")` rule would mis-credit any line opening with "cycling " (e.g. Fluctuator's
  // static "Cycling abilities you activate cost {2} less to activate"), so cycling is gated to the
  // exact "cycling {cost}" activated-ability shape the engine actually enforces (parseCyclingCost).
];

const stripReminder = (s) => String(s || "").replace(/\([^)]*\)/g, " ");

/**
 * True when a permanent's oracle text is empty (vanilla), only evergreen keywords, or an enforced
 * EVADE evasion clause (basic landwalk / unblockable / can't-block / can-block-only-flying). The
 * optional `name` is normalized to "this creature" so a self-clause printed with the card name
 * ("Invisible Stalker can't be blocked.") reads as a covered self-clause; a nameless caller simply
 * under-claims such self-clauses (safe — false-negative).
 */
export function isKeywordOnly(oracle, name) {
  let t = stripReminder(oracle).toLowerCase().replace(/[’']/g, "'");
  if (name) {
    const n = String(name).toLowerCase().replace(/[’']/g, "'").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (n) t = t.replace(new RegExp(`\\b${n}\\b`, "g"), "this creature");
  }
  if (!t.trim()) return true; // vanilla
  // Split on SENTENCE boundaries (. ! ?) too — not just , ; \n and. Otherwise a trailing non-keyword
  // sentence glued on by a strip ("flying  scry 1.") is swallowed whole by `startsWith("flying ")`
  // and mis-credited as keyword-only. Splitting on the period forces "scry 1" to stand alone and fail.
  const clauses = t.split(/[,;.!?\n]|\band\b/).map((c) => c.trim()).filter(Boolean);
  return clauses.every((c) =>
    COVERED_KEYWORDS.some((k) => c === k || c === `${k}.` || c.startsWith(`${k} `)) ||
    isEnforcedEvasionClause(c) ||
    reCyclingCost.test(c) ||
    reNinjutsuCost.test(c) ||
    // MUST-ATTACK (subsystem 4, CR 508.1a) — "this creature attacks each combat/turn if able" (the card
    // name was already normalized to "this creature" above). ENFORCED in opponentAI.pickAttackPlan (the
    // creature is force-declared as an attacker when able), so it's a modeled static, not residue.
    /^this creature attacks each (?:combat|turn) if able$/.test(c),
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

// KW-CYCLING — credit a clause ONLY when it's "cycling {cost}" (the keyword + one or more brace mana
// symbols), mirroring the engine's parseCyclingCost (effects/abilities.js) EXACTLY so the metric never
// over-claims past what actionDispatcher.applyCycle enforces. A bare "cycling " prefix is NOT enough:
// Fluctuator's static "cycling abilities you activate cost {2} less to activate" has no brace cost
// immediately after "cycling" → no match → body-only. Typecycling (landcycling/plainscycling/…) never
// starts with "cycling " and a cycle-trigger leaves residue, so both already stay body-only.
const reCyclingCost = /^cycling (?:\{[^}]+\})+$/;

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
export function hasManaAbility(oracle) {
  // Strip a created token's quoted ability before reading the card's OWN mana — a token's "…Add …"
  // belongs to the token, not the card (mirrors manaModel.manaProduction, so the classifier and runtime
  // agree). Without this, an Eldrazi Spawn-maker is mis-tiered native-mana before its real trigger is
  // even checked (this tier is read at line ~341, ahead of permanentTriggersCovered).
  const t = stripCreatedTokenAbilities(stripReminder(oracle));
  return /\badd \{[wubrgcx]/i.test(t) ||
    /\badd (one|two|three|four|five|that much|an amount|\{)/i.test(t);
}

/** True when an instant/sorcery resolves fully through the EffectProgram interpreter. */
export function spellIsNative(card) {
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
  // HIGH on its chosen-type count-draw atom → native-spell.
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
  for (const a of program.atoms || []) {
    if (a?.who === "damagedPlayer" || a?.countContext === "combatDamageAmount") return false;
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

// The When/Whenever/At sentence shape (matches detectTriggers' grammar). Used to COUNT
// trigger-shaped sentences so an UNMODELED-event trigger ("Whenever you cast …", "…put
// into a graveyard …") can't be silently stripped from the residue and mis-credited.
const TRIGGER_SENTENCE_RE = /(?:^|[\n.;]\s*)(?:When|Whenever|At)\b\s+[^.]+\./gi;

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
  const kwTrigShaped = (/\bbushido \d/i.test(stripReminder(oracle)) ? 1 : 0) + (/\brampage \d/i.test(stripReminder(oracle)) ? 1 : 0);
  const shaped = (stripReminder(stripTriggerAbilityLabel(oracle)).match(TRIGGER_SENTENCE_RE) || []).length + kwTrigShaped;
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
  const residue = stripTriggerAbilityLabel(card.oracle || "")
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
    .replace(/(?:^|[\n.;]\s*)(?:When|Whenever|At)\b[^\n]*?\bchoose (?:one|two|three|four|five|one or more|one or both|up to (?:one|two|three|four|five))\b\s*[—-][^\n]*(?:\n\s*•[^\n]*)+/gi, " ")
    .replace(/(?:^|[\n.;]\s*)(When|Whenever|At)\b[^.]+\./gi, " ")
    .replace(/\bas\b[^.]*\benters\b[^.]*,\s*choose a creature type\b\.?/gi, " ")
    .replace(/\bDo this only once each turn\b\.?\s*/gi, " ")
    .replace(/\b(?:they|it|that creature|those creatures) can'?t be regenerated\b\.?\s*/gi, " ")
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
    // REFLEXIVE TRIGGER (CR 603.7) — a "When you do[ this/so], <reflexive>." sentence is part of the PRECEDING
    // trigger's effect: detectTriggers folds it into that trigger's effectClause, and it parses HIGH in
    // allTriggerSentencesModeled above (proven before this residue check runs — an UNmodeled reflexive fails
    // that gate and never reaches here). The trigger regex stops at the period BEFORE "When you do", so the
    // reflexive sentence survives as apparent residue. Strip it so the card reads keyword-only. Covers BOTH the
    // dice-result reflexive (Ancient Bronze Dragon: "…where X is the result") AND the general mandatory-primary
    // reflexive (Faebloom-style permanent triggers). FN-safe: the HIGH gate above already vouched the whole
    // trigger effect is modeled, so stripping its reflexive tail can only reveal the keyword-only body — it can
    // never hide a genuinely unmodeled sentence (those are not "When you do"-led and fail the gate first).
    .replace(/\bwhen you do(?:\s+this|\s+so)?,?\s+[^.]*\.?\s*/gi, " ")
    // OPTIONAL-MANA-PAYMENT (CR 603.7c) — "you may pay {cost}. If you do, <effect>." is ONE trigger effect:
    // detectTriggers appends the "If you do, <effect>" sentence to the effectClause, and the whole thing parses
    // HIGH in allTriggerSentencesModeled above (proven before this residue check runs — an unmodeled payoff /
    // an {X} cost fails that gate and never reaches here). The trigger regex stops at the period after "…you may
    // pay {cost}.", leaving the "If you do, <effect>." sentence as apparent residue. Strip it so the card reads
    // keyword-only (Lifecrafter's Bestiary, Inheritance, Mind's Eye, Horizon/Origin/Panic Spellbomb, Urza's
    // Miter, Symmetry Matrix, Pedantic Learning). Anchored to the "if you do" lead so it can only consume a true
    // optional-payment tail — FN-safe (the HIGH gate above already vouched the whole trigger effect is modeled).
    .replace(/\bif you do,?\s+[^.]*\.?\s*/gi, " ")
    // REVEAL-TOP-DRAIN-BY-MV (Yuriko, the Tiger's Shadow) — the drain sentence "Each opponent loses life
    // equal to that card's mana value." FOLLOWS the reveal sentence in the SAME trigger's effect (detectTriggers
    // appends it to the effectClause, which parses HIGH in allTriggerSentencesModeled above — proven before this
    // residue check runs), but the trigger regex stops at the first period after "…put that card into your hand.",
    // leaving the drain as apparent residue. Strip the EXACT modeled drain shape ("that card's"/"the card's"/"its"
    // mana value) so the card reads keyword-only (leaving only the ninjutsu line, handled by isKeywordOnly).
    // Anchored to the modeled wording, so it can only consume a true modeled follow-up (FN-safe — an UNmodeled
    // drain variant fails the HIGH gate above and never reaches here). Curly apostrophe tolerated.
    .replace(/\beach opponent loses life equal to (?:that card['’]s|the card['’]s|its) mana value\b\.?\s*/gi, " ");
  return isKeywordOnly(residue, card?.name);
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
 */
function isActivatedAbilityLine(line) {
  const ci = line.indexOf(":");
  if (ci === -1) return false;
  const costStr = line.slice(0, ci).trim();
  return costStr.includes("{") || !!parseAbilityCost(costStr);
}

export function permanentActivatedCovered(card) {
  const abilities = parseActivatedAbilities(card);
  if (abilities.length === 0) return false;
  // A single unmodeled ability (unmodeled cost OR effect, incl. complex mana abilities)
  // leaves the card in the gap — all-or-nothing, mirroring the all-or-nothing runtime.
  if (!abilities.every((a) => a.modeled)) return false;
  // Drop reminder, FOLD modal-ability bullet lines onto their "Choose one —" ability line (so a multi-line
  // modal activated ability — Koma — is stripped as ONE line, not left as mode-bullet residue; same fold the
  // parser uses), then drop every activated-ability-shaped line (the same shape the parser detects).
  // The remainder (keywords, and any trigger/static text) must be keyword-only/empty.
  const residue = foldModalBulletLines(stripReminder(card.oracle || ""))
    .filter((line) => !isActivatedAbilityLine(line))
    .join("\n");
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
export function permanentFullyCovered(card) {
  const oracle = String(card?.oracle || "");
  if (!oracle.trim()) return false;             // vanilla → native-body handles it
  if (isLevelGatedOracle(oracle)) return false;  // level-gated buffs aren't always-on

  // Every trigger-shaped sentence must be a detected trigger that routes (the count guard
  // closes the residue's blind spot for unmodeled-event triggers like "Whenever you cast …").
  if (!allTriggerSentencesModeled(card, oracle)) return false;
  const triggers = detectTriggers(card);
  const activated = parseActivatedAbilities(card);
  if (!activated.every((a) => a.modeled)) return false;     // an unmodeled activated ability

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
  const afterTriggers = stripTriggerAbilityLabel(oracle)
    .replace(/(counters? on (?:it|that creature|this creature))\.\s+it (?:gets [+-]\d+\/[+-]\d+(?: and gains [^.]+)?|gains [^.]+) until end of turn\b\.?\s*/gi, "$1. ")
    .replace(/(?:^|[\n.;]\s*)(When|Whenever|At)\b[^.]+\./gi, "\n");
  const afterActivated = foldModalBulletLines(stripReminder(afterTriggers))
    .filter((line) => !isActivatedAbilityLine(line))
    .join("\n");
  for (const clause of afterActivated.split(/[\n.;]+/).map((s) => s.trim()).filter(Boolean)) {
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
  const noTrig = { ...card, oracle: oracle.replace(/(?:^|[\n.;]\s*)(When|Whenever|At)\b[^.]+\./gi, " ") };
  const abilities = parseActivatedAbilities(noTrig);
  if (abilities.length === 0 || !abilities.every((a) => a.isEquipAbility && a.modeled)) return false;
  // The bonus parser is all-or-nothing over every equipped-creature clause: a non-empty result
  // guarantees EVERY clause touching the creature parsed cleanly (no rider silently dropped).
  if (parseEquipmentBonus(noTrig).length === 0) return false;
  // Clause-granular residue (split on . ; \n — same as the bonus parser, so a period-joined
  // rider can't be swallowed by a whole-line strip). Every clause must be a modeled Equip
  // line or an equipped-creature clause (already validated clean above). ANYTHING else — a
  // self-keyword printed on the EQUIPMENT ("Indestructible"), an unmodeled equip variant
  // ("Equip Human {1}"), a non-Equip activated ability — leaves residue → body-only, so a
  // not-fully-modeled equipment is never over-claimed as native (CLAUDE.md "no silent gaps").
  const modeledEquipLine = /^equip\s*(?:[—–-])?\s*(?:\{[^}]+\})+$/i;
  for (const clause of equipmentAbilityClauses(stripReminder(noTrig.oracle || ""))) {
    const c = clause.toLowerCase().trim();
    if (!c) continue;
    if (modeledEquipLine.test(c)) continue;
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
  return !isLevelGatedOracle(oracle) && allTriggerSentencesModeled(card, oracle);
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

// GRANTED-ACTIVATED AURA (subsystem 1 phase 1b) — an Aura whose ONLY body is granting the enchanted
// creature one-or-more activated abilities, every one fully modeled (cost in the modeled subset + effect
// parses HIGH, via parseGrantedActivatedAbilities). The runtime enumerates these on the host and resolves
// them through the existing dispatcher (legalChoices.grantedActivatedForHost). All-or-nothing: a rider
// (an ETB trigger, a restriction, a sacrifice clause, an unmodeled second ability) leaves residue → the
// card stays Arbiter, never a partially-modeled grant (CREED).
function isNativeActivatedGrantAura(card) {
  if (!isAuraCard(card)) return false;
  const granted = parseGrantedActivatedAbilities(card);
  if (!granted.length || !granted.every((a) => a.modeled)) return false;
  const oracle = String(card?.oracle || card?.oracle_text || "");
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
    return false;                                                                          // any other clause = residue
  }
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
    return false;                                                                            // any other clause = residue
  }
  return sawEquip;                                                                            // must actually be equippable
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
  const grantLineRe = /^(?:enchanted|equipped) creature\s+(?:has|have)\s+["“][^"”]+["”]\s*\.?$/i;
  // COUNT GUARD (CREED, mirrors the activated-grant gates): parseGrantedTriggeredAbilities only returns the
  // TRIGGERED grants; an activated / mana / unmodeled co-grant ("Enchanted creature has \"{5}: Untap …\"")
  // is whitelisted as a grant line below yet never routed — a silently-dropped ability while claiming native
  // coverage. Require grant-line count === parsed-triggered count so any non-triggered co-grant is residue
  // (sends the card to the Arbiter; a genuinely all-modeled multi-kind grant under-counts — a SAFE FN).
  const grantLines = oracle.split(/\n+/).filter((l) => grantLineRe.test(l.trim())).length;
  if (grantLines !== granted.length) return false;
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
  if (/\bland\b/.test(type)) return "land";
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
  if (isAuraCard(card)) {
    if (isNativeManaAura(card)) return "native-mana-aura";
    // GRANTED-MANA-ABILITY (creature OR land host): "Enchanted creature/land has \"{T}: Add …\"" (Multani's
    // Harmony; Settlement / Sheltered Aerie) — the host gains a clean tap-for-mana source through the existing
    // grantedManaSpecsFor runtime (creature = no-own-prod fallback; land = the dominating-grant supplement).
    if (isNativeManaGrantAura(card)) return "native-mana-aura";
    // GRANTED-ACTIVATED (subsystem 1 phase 1b): "Enchanted creature has \"{cost}: {effect}\"" (Hermetic
    // Study, Midnight Covenant, Sadistic Obsession) — the host gains an activated ability the runtime
    // enumerates + resolves (legalChoices.grantedActivatedForHost). All-or-nothing: every granted ability
    // modeled AND no other body clause (a rider keeps it Arbiter).
    if (isNativeActivatedGrantAura(card)) return "native-activated";
    // GRANTED-TRIGGERED (1c): "Enchanted creature has \"Whenever/At …\"" (Sixth Sense, Commander's Authority)
    // — the host gains a triggered ability the runtime fires on the host's event (triggers.triggersForEvent).
    if (isNativeTriggerGrantAuraOrEquipment(card)) return "native-trigger";
    return isNativeAura(card) ? "native-aura" : "body-only";
  }
  // A clone (CR 707) — a creature whose WHOLE text is "enters as a copy of a creature" — now
  // plays natively (it suspends on a copy-choice and enters as a snapshot). Checked before the
  // generic classifiers (its copy clause isn't a trigger/static/mana ability they'd recognize).
  if (isCloneCard(card)) return "native-clone";
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
  // MULTI-X GUARD (CR 107.3): a cost with more than one {X} pip ({X}{X} — Walking Ballista) is NOT modeled —
  // the cost machinery (parseManaCost.hasX + the legalChoices xCost = generic + X path) treats every {X} as a
  // SINGLE X, so a {X}{X} card underpays (pays X, owes 2X). The X→counters resolver assumes one X feeds the
  // counters. So only credit enters-with-X when the cost has EXACTLY one X pip; a multi-X card stays body-only
  // (Arbiter) until the double-X cost subsystem lands. CREED: a miss is safe, an underpaid cast is forbidden.
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
  // CONVOKE / AFFINITY on a PERMANENT spell (Thrumming Hivepool — "Affinity for Slivers"): strip the cost-only
  // keyword line so the downstream trigger/static/mixed gates see the body alone. Affinity changes only the
  // cast cost (the artifact ALSO has a printed {6}); the runtime hard-casts at full cost and the permanent's
  // abilities resolve identically — the unmodeled scaler can never mis-resolve (THE CREED, Ninjutsu precedent).
  // Without this, the bare "Affinity for Slivers" line is unmodeled residue → body-only despite the group-keyword
  // grant + upkeep token trigger both being fully modeled (→ native-mixed once stripped).
  const costOnlyStrippedOracle = stripCostOnlyKeywordLines(plotStrippedRaw);
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
  const baseOracle = entersWithPlusCounters(card) > 0
    ? plotStrippedOracle.replace(/[^.]*enters (?:the battlefield )?with (?:a|an|one|two|three|four|five|\d+) \+1\/\+1 counters? on it[^.]*\.?/i, " ")
    : entersWithXCounters(card) && xPipCount === 1
      ? plotStrippedOracle.replace(/[^.]*enters (?:the battlefield )?with x \+1\/\+1 counters? on it[^.]*\.?/i, " ")
      : entersWithMetricCounters(card)
        ? plotStrippedOracle.replace(/[^.]*enters (?:the battlefield )?with [^.]*\+1\/\+1 counters?[^.]*\.?/i, " ")
        : plotStrippedOracle;
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
  const isTapped = entersTapped(card);
  const etOracle = isTapped ? baseOracle.replace(tapRe, "\n").trim() : baseOracle;
  const etCard = baseOracle !== oracle || isTapped
    ? { ...card, oracle: (isTapped ? baseOracle.replace(tapRe, "\n") : baseOracle).trim() }
    : card;
  if (isKeywordOnly(etOracle, card?.name)) return "native-body";
  // FIX-MANA-OVERCLAIM: a mana source counts native-mana only when its non-mana trigger text is modeled
  // too (else it falls through to the all-or-nothing trigger/activated/mixed gates → body-only/Arbiter).
  if (hasManaAbility(oracle) && manaCardResidueModeled(etCard, etOracle)) return "native-mana";
  // Single-mechanism tiers first (the informative labels), then the composite catch-all for
  // multi-ability creatures whose pieces are each modeled but span types.
  if (permanentTriggersCovered(etCard)) return "native-trigger";   // P2.8: body + only-routing triggers
  if (permanentActivatedCovered(etCard)) return "native-activated"; // P2.9: body + only-modeled activated abilities
  if (staticAbilitiesCoverCard(etCard, isKeywordOnly)) return "native-static"; // P2.10: body + only-modeled static anthems
  if (isNativeActivatedGrantEquipment(etCard)) return "native-equipment"; // 1b: Equip + a granted activated ability on the host
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
  const strippedOracle = stripModeledDoublerClauses(card?.oracle || "");
  if (isKeywordOnly(strippedOracle, card?.name)) return "native-static"; // doubler + vanilla/keyword body
  if (permanentFullyCovered({ ...card, oracle: strippedOracle })) return "native-mixed"; // doubler + other modeled abilities
  return null;
}
registerCoverageClassifier(doublerCardTier);

// GROUP-ACTIVATED grant (queue 1) — inject the modeled-body gate into staticAbilityParser's group-grant
// emission (it can't import parseActivatedAbilities directly — a load-time cycle through the atoms registry).
// With this registered, a card whose only non-keyword text is a fully-modeled group-activated grant ("All
// Slivers have \"{2}: Regenerate this permanent.\"") classifies native-static via staticAbilitiesCoverCard,
// and legalChoices offers the ability on every affected permanent (layers.grantedActivatedQuotedFor).
registerGroupActivatedBodyValidator(isModeledGroupActivatedBody);

// GROUP-TRIGGERED grant (Tempered Sliver) — inject the modeled-body gate into staticAbilityParser's
// group-triggered-grant emission. A quoted body is a valid group-triggered grant iff it parses to one-or-more
// triggers (detectTriggers) that ALL route natively (triggerRoutesNatively — the SAME gate the Aura/Equipment
// granted-triggered path uses). With this registered, a card whose only non-keyword text is a fully-modeled
// group-triggered grant ("Sliver creatures you control have \"Whenever this creature deals combat damage to a
// player, put a +1/+1 counter on it.\"") classifies native-static via staticAbilitiesCoverCard, and
// triggers.triggersForEvent fires the granted trigger on every affected permanent (layers.grantedTriggeredQuotedFor).
registerGroupTriggeredBodyValidator(isModeledGroupTriggeredBody);

// DIFFUSION SLIVER (group-ward analogue) — a card whose whole text is the modeled group-ward trigger
// ("Whenever a Sliver creature you control becomes the target of a spell or ability an opponent controls,
// counter that spell or ability unless its controller pays {2}") classifies native-trigger. detectTriggers has
// no "becomes the target" event, so permanentTriggersCovered/permanentFullyCovered leave it body-only (count
// mismatch) — this registry classifier (consulted before the composite catch-all) credits it, mirroring how
// the runtime enforces it (actionDispatcher's groupWardTax at the cast/ability chokepoints reuses the ward
// soft-counter). isNativeGroupWard is all-or-nothing (any rider → body-only), so the credit is honest.
registerCoverageClassifier((card) => (isNativeGroupWard(card) ? "native-trigger" : null));

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
    .replace(/(?:^|[\n.;]\s*)(When|Whenever|At)\b[^.]+\./gi, " ")
    .replace(/[\s.]+/g, " ").trim();
  if (residue.length > 0) return null;
  return isDoor ? "native-mixed" : "native-static";
}
registerCoverageClassifier((card) => classifyChosenTypeAnthem(card));

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
const SELF_COST_SENTENCE_RE = /this spell costs \{x\} less to cast,? where x is [^.]*\.?/i;
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
// NOTHING else may remain — Herald's Horn (an extra upkeep look-trigger) and Gathering Stone (an ETB/upkeep
// trigger) keep residue → null (their reducer STILL applies at runtime; only the flip is withheld — a safe FN).
// Returns native-static, or null. Additive-seam single-mechanism flip; mechanism-keyed (a future bare twin
// flips automatically). The card-type-chooser variants (Cloud Key / Umori / Stenn — "choose a CARD type") are
// NOT matched (the chooser RE wants a CREATURE type) and stay body-only, since that chooser is unmodeled.
const CT_COST_REDUCER_RE = /creature spells (?:you cast )?of the chosen type cost \{\d+\} less to cast\.?/i;
function classifyChosenTypeCostReducer(card) {
  const type = String(card?.type ?? card?.type_line ?? "").toLowerCase();
  if (!/artifact/.test(type)) return null;
  const oracle = stripReminder(String(card?.oracle ?? card?.oracle_text ?? ""));
  if (!oracle) return null;
  if (!CHOSEN_TYPE_CHOOSER_RE.test(oracle)) return null;           // the ETB creature-type chooser must be present
  if (!CT_COST_REDUCER_RE.test(oracle)) return null;              // the chosen-type reducer must be present
  if (!clauseProducesStatic("Creature spells of the chosen type cost {1} less to cast")) return null; // it parses to a marker
  // NO residue: strip the chooser + the reducer; nothing else may remain (Herald's upkeep trigger / Gathering
  // Stone's triggers keep residue → arbiter). A trigger present at all is residue.
  if (detectTriggers(card).length > 0) return null;
  const residue = oracle
    .replace(CHOSEN_TYPE_CHOOSER_RE, " ")
    .replace(CT_COST_REDUCER_RE, " ")
    .replace(/[\s.]+/g, " ").trim();
  if (residue.length > 0) return null;
  return "native-static";
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
    if (!isActivatedAbilityLine(line)) continue;                 // not an activated ability → handled by the keyword gate below
    if (!hasManaAbility(line.slice(line.indexOf(":") + 1))) return null; // a non-mana activated ability remains → Arbiter (CREED)
  }
  // Strip reminder + the X-cast trigger + every (now-confirmed-mana) activated-ability line; the remainder
  // must be keyword-only (Deathtouch).
  const manaStripped = stripReminder(noTrig.oracle)
    .split(/\n+/)
    .filter((line) => !isActivatedAbilityLine(line))            // drop the "{T}: Add …" mana line(s) — all verified mana above
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

/**
 * triggerRouting.js — the SINGLE source of truth for "does ONE detected trigger route natively?".
 *
 * Extracted from coverage.js so BOTH the coverage classifier (the metric) AND the runtime
 * group-triggered-grant validator (registered on the trigger-firing path via gameEngine.js) consult the
 * EXACT same routing gate — a copy in either place would risk drift, and a mis-classified trigger is a CREED
 * false positive. A leaf relative to the trigger system: it imports only the effect-program parser
 * (effects/parser.js) + the two strict condition vocabularies (interveningIf.js, winGame.js), NONE of which
 * import coverage.js, so this module can be imported by coverage.js AND by gameEngine.js without a cycle.
 *
 * `triggerRoutesNatively(d)` mirrors gameEngine.buildTriggerStack's α1 ALLOWLIST EXACTLY (see the inline
 * notes) — a HIGH, non-modal, target-resolvable program, with the intervening-if (CR 603.4) and upkeep-win
 * (Wave 3b) carve-outs. Pure.
 */

import { parseEffectClause, programConfidence, programNeedsChosenTarget, programTriggerTargetsResolvable, modalChooseOneRoutable } from "./effects/parser.js";
import { winConditionParseable } from "./effects/atoms/winGame.js";
import { interveningIfParseable } from "./interveningIf.js";
import { detectTriggers } from "./triggers.js";

/**
 * COMBAT-DAMAGE REFERENT GATE (CR 510 — the just-damaged player / dealt amount). Some atoms bind to a damage
 * event's referent rather than a chosen target, and each referent is supplied by a SPECIFIC set of events:
 *   - who:"damagedPlayer" (Sword of Body and Mind "that player mills ten cards"; the rad CDMG payoffs) reads
 *     ctx.damagedPlayerId, set ONLY by combatDamageToPlayer (triggers.checkCombatDamageTriggers).
 *   - countContext:"combatDamageAmount" ("draw/create that many", the rad "that many") reads ctx.combat-
 *     DamageAmount, set by combatDamageToPlayer AND by dealtDamage (checkDealtDamageTriggers aliases the
 *     enrage amount to combatDamageAmount, so "Whenever this creature is dealt damage, draw that many cards"
 *     — Illusory Ambusher — resolves). NOT set by combatDamageBatch (ctx = {batchController}) or any other event.
 * On an event that DOESN'T supply the referent — a CAST trigger ("Whenever an opponent casts a spell, that
 * player mills two cards", Memory Erosion), an ETB, an upkeep — the program parses HIGH but its referent is
 * UNSET, so the clause would SILENTLY DROP at resolution (a FORBIDDEN dropped-clause FP, CREED). Gate it per
 * referent: the trigger routes natively only when EVERY referent its atoms carry is supplied by the event.
 * Both the metric (triggerRoutesNatively) and the runtime (gameEngine.buildTriggerStack) consult this, so they
 * can't drift. A trigger whose event can't supply a referent stays on the Arbiter (a SAFE false-negative). Pure.
 */
// ④-AN (2026-09-04): the BATCH event joined both sets — checkBatchCombatDamageTriggers now fires once per
// (controller, damaged player) pair and threads damagedPlayerId + combatDamageAmount for EVERY batch descriptor (the
// keyword batches always did; the bare and subject-filtered ones fired once per controller with no referent).
const DAMAGED_PLAYER_EVENTS = new Set(["combatDamageToPlayer", "combatDamageBatch"]);
const COMBAT_DAMAGE_AMOUNT_EVENTS = new Set(["combatDamageToPlayer", "combatDamageBatch", "dealtDamage",
  // SL-1 — the DEALT-BY lifegain link ("Whenever this creature deals damage, you gain that much life"):
  // checkDealtByTriggers threads combatDamageAmount = the source's per-event dealt total at BOTH damage
  // paths, so the referent is genuinely satisfied on this event.
  "dealtBy"]);
// who:"defendingPlayer" (CR 509.1 — the attacked player) reads ctx.defenderId, supplied by the ATTACKS event
// (triggers.checkAttackTriggers, CR 509.1a) AND by the BECOMES-BLOCKED event (triggers.checkBlockTriggers,
// CR 509.1h — it now looks up the blocked attacker's declared defender and threads it into the context). On
// any OTHER event the referent is unset → the clause would silently drop (a FORBIDDEN dropped-clause FP,
// CREED), so "defending player loses N life" routes natively only off those two events. AFFLICT (CR 702.131 —
// "Whenever this creature becomes blocked, defending player loses N life") relies on the becomesBlocked entry;
// Silent Skimmer ("Whenever this creature attacks, defending player loses 2 life") on the attacks entry.
// "attacksAlone" (BLITZ TR-2, CR 506.5): the sole-attacker event — checkAttackTriggers threads the sole
// attacker's declared defender into the context exactly like the per-attacker "attacks" fire, so a
// "defending player …" payoff (Nefarox, Overlord of Grixis' edict) genuinely has its referent there.
// "attacksUnblocked" (④-AU, 2026-09-04): the declare-blockers-step complement of becomesBlocked — checkBlockTriggers
// threads the unblocked attacker's declared defender exactly as it does for a blocked one.
const DEFENDING_PLAYER_EVENTS = new Set(["attacks", "becomesBlocked", "attacksAlone", "attacksUnblocked"]);

/**
 * Every atom a combat-referent gate must inspect — MODAL programs keep their atoms in
 * modal.modes[].atoms with atoms:[] at top level, so a top-level-only iteration silently
 * passed a mode-level referent (overhaul hardening; the flatten pattern from
 * parser.programNeedsChosenTarget). Zero corpus impact today — pure future-proofing.
 * Shared by the trigger gate below AND coverage's two spell-path referent loops, so the
 * metric and the runtime read the same atom set.
 */
export function programCombatReferentAtoms(program) {
  if (program?.structure === "modal") return (program.modal?.modes || []).flatMap((m) => m.atoms || []);
  return program?.atoms || [];
}

export function combatDamageReferentSatisfied(program, event) {
  for (const a of programCombatReferentAtoms(program)) {
    // "EACH OF THOSE CREATURES" (shelf D22): the batch dealers are stamped ONLY by the batch combat-damage dispatcher.
    if (a?.scope === "batchDealers" && event !== "combatDamageBatch") return false;
    // "SACRIFICE IT" (shelf D24 — Foot Chopper): "it" is the creature that dealt the combat damage — the per-creature
    // combat-damage event's triggering permanent. No other event is admitted (a safe false negative where "it" means more).
    if (a?.sacTriggering && event !== "combatDamageToPlayer") return false;
    // "PUT ONE OF THEM ONTO THE BATTLEFIELD" (shelf D27 — Colossal Grave-Reaver): "them" is the graveyard-enter batch only.
    if (a?.op === "gy-batch-to-battlefield" && event !== "gyEnterBatch") return false;
    if (a?.who === "damagedPlayer" && !DAMAGED_PLAYER_EVENTS.has(event)) return false;
    if (a?.countContext === "combatDamageAmount" && !COMBAT_DAMAGE_AMOUNT_EVENTS.has(event)) return false;
    if (a?.who === "defendingPlayer" && !DEFENDING_PLAYER_EVENTS.has(event)) return false;
    // ⛔⛔ THE REFERENT CAN ALSO RIDE A **RESTRICTION**, NOT ONLY `atom.who` (DP-TGT, 2026-08-05). A
    // "target creature DEFENDING PLAYER CONTROLS" atom carries the referent as
    // `restrictions:[{kind:"controller",who:"defendingPlayer"}]` while its own `who` is undefined — so the
    // check directly above sails right past it. Off a combat event ctx.defenderId is unset,
    // creatureSatisfiesRestrictions then fails EVERY creature, the target pool comes back empty and the
    // clause SILENTLY DROPS: precisely the forbidden FP this gate exists to stop, arriving through the one
    // door it was not watching. Every referent-carrying atom shape must be inspected, not just the
    // convenient one.
    // ⚠️ GENERALISED (2026-08-06): the first cut of this check hard-coded `defendingPlayer`, and the very
    // next slice needed the identical guard for `damagedPlayer` ("target creature THAT PLAYER controls" —
    // Snapping Thragg, Skirk Commando). Fixing one referent and leaving its twin open is how a guard grows
    // holes, so both referents are now driven off the SAME event tables their atom.who checks use above.
    // Add a referent here and it is covered in both positions at once.
    if ((a?.restrictions || []).some((r) => r?.who === "defendingPlayer") && !DEFENDING_PLAYER_EVENTS.has(event)) return false;
    if ((a?.restrictions || []).some((r) => r?.who === "damagedPlayer") && !DAMAGED_PLAYER_EVENTS.has(event)) return false;
    // MILLED-COUNT (SHELF M1b): a "that many milled[-nonland]" magnitude reads checkMilledTriggers' context —
    // set ONLY by the milled event. Any other event leaves the referent unset (a silent 0 → dropped clause).
    if ((a?.countContext === "milledCount" || a?.countContext === "nonlandMilledCount") && event !== "milled") return false;
    // LIFE-LOSS referents (Mindcrank, SHELF M3): the loser + amount are set ONLY by checkLifeLossTriggers.
    if ((a?.who === "lifeLostPlayer" || a?.countContext === "lifeLostAmount") && event !== "lifeLost") return false;
    // LIFEGAIN amount (BLITZ EC-1b — Sunbond / Light of Promise): "that many" = the life just gained, set
    // ONLY by checkLifegainTriggers' lifegain event. Any other event leaves the referent unset (a silent
    // 0-counter → dropped clause, a forbidden FP) → not native there (a SAFE FN).
    if (a?.countContext === "lifegainAmount" && event !== "lifegain") return false;
    // DYING POWER (CR 603.6e LKI): the dead creature's last-known power, stamped ONLY by checkDiesTriggers.
    // Covers all three carriers of this context key — the "its power" lifegain arm, Lifeblood Hydra's
    // collapsed gain+draw template, and Feral Ghoul's rad payoff — so none of them can route off an event
    // that never sets it (an absent referent reads 0, i.e. a silently dropped clause: a forbidden FP).
    if (a?.countContext === "dyingPower" && event !== "dies") return false;
    // DISCARDING-PLAYER (CR 701.9a): the just-discarded player, set ONLY by checkDiscardTriggers. On any
    // other event the referent is unset — and this one fails LOUDLY wrong rather than quietly: the recipient
    // is the controller's OPPONENT, so an unbound "that player loses 2 life" would drain nobody at all.
    if ((a?.who === "discardingPlayer" || a?.targetType === "discardingPlayer") && event !== "discarded") return false;
    // DEALER-BRANCH (Marcus, SHELF S7): the branch reads the combat-damage DEALER — cdmg events only.
    if (a?.op === "draw-or-counter-triggering" && !DAMAGED_PLAYER_EVENTS.has(event)) return false;
    // TARGETING-OBJECT (the Glasskites, 2026-09-30): "counter that spell or ability" reads the stack object whose target
    // choice fired the trigger — ctx.targetingStackObjectId, set ONLY by checkBecomesTargetTriggers' self becomesTarget
    // event. Anywhere else the referent is unset and the counter would silently do nothing (a dropped payoff credited
    // native — a forbidden FP). The splitter only writes the phrase for that event; this is the belt on top of it.
    if (a?.op === "counter-targeting-object" && event !== "becomesTarget") return false;
    // UNTAPPED-CONTROLLER (Mesmeric Orb, SHELF S6): the mill's referent is the just-untapped permanent's
    // controller — set ONLY by checkUntapTriggers' untapped event.
    if (a?.who === "untappedController" && event !== "untapped") return false;
    // GY-OWNER (Bloodchief Ascension, SHELF S7): the drain's referent is the graveyard's owner — set ONLY
    // by checkGraveyardEventTriggers' gyEnter event (the detectTriggers sentinel rewrite is gyEnter-gated
    // too; this pin is the belt on top of it).
    if (a?.who === "gyOwner" && event !== "gyEnter") return false;
    // MODULAR (BLITZ MOD-1, CR 702.43a): the dies payoff's count is the DYING creature's last-known +1/+1
    // total (ctx.triggeringPlusCounterCount), stamped ONLY by checkDiesTriggers' dies event. On any other
    // event the referent is unset → the clause would silently place 0 (a dropped-payoff FP) → not native
    // there (a SAFE false-negative). The clause is only ever synthesized on the modular dies trigger, so
    // this is belt-and-suspenders that keeps the metric honest if the wording ever appears elsewhere.
    if (a?.countContext === "triggeringPlusCounterCount" && event !== "dies") return false;
    // UPKEEP-PLAYER (BLITZ TR-2, CR 503.1a): the "the upkeep player <effect>" atoms read ctx.upkeepPlayerId,
    // threaded ONLY by checkStepTriggers' upkeep-step fire. On any other event the referent is unset → the
    // clause would silently no-op (a dropped-clause FP) → not native there (a SAFE false-negative). The
    // sentinel phrase is emitted only by the eachPlayersUpkeep detectTriggers rewrite (never printed oracle),
    // so this is the event-side half of the same double gate the gyOwner referent uses.
    // Widened to the DRAW step (CR 504.1) in lockstep with checkStepTriggers' threading — the two are one
    // double gate. The referent is threaded at BOTH step entries and nowhere else, so every other event
    // still falls through to the safe false-negative.
    if (a?.who === "upkeepPlayer" && event !== "upkeep" && event !== "draw") return false;
    // CASTING-PLAYER (TP-1): the caster referent is set ONLY by checkCastTriggers. The detectTriggers
    // sentinel rewrite is already cast-gated; this pin is the belt on top of it, exactly as the gyOwner
    // entry below describes its own pairing.
    if ((a?.who === "castingPlayer" || a?.target === "castingPlayer") && event !== "cast") return false;
    // DRAWING-PLAYER (TP-3): set ONLY by checkCardDrawnTriggers. Same belt-on-the-rewrite pairing.
    if ((a?.who === "drawingPlayer" || a?.target === "drawingPlayer") && event !== "cardDrawn") return false;
    // ENDURE-ON-TRIGGERING (Warden, W4): the recipient referent is the ENTERING creature — meaningful only
    // on the etb watcher event whose triggeringPermanentId is that creature. Any other event's triggering
    // object is a different referent class → not native there (a SAFE false-negative, the belt convention).
    if (a?.recipient === "triggering" && event !== "etb") return false;
  }
  return true;
}

/**
 * Does ONE detected trigger route natively through the flush stage? HIGH, non-modal,
 * non-intervening-if EffectProgram — the exact gate `gameEngine.buildTriggerStack` uses.
 * The single source of truth for `permanentTriggersCovered`, the composite classifier, AND the
 * runtime group-triggered-grant validator, so the trigger-routing rule can't drift between them.
 */
/**
 * CYCLE-SELF, MODELED (shelf D6, 2026-09-30 — CR 702.29c): every printed "When you cycle <this card>, …" line is DETECTED as a
 * cycleSelf trigger (the bare self form — a compound like the Sojourners' "… and when this creature dies" is not) AND
 * routes natively. The cycling OFFER reads this (abilities.parseCyclingCost's `cycleSelfModeled`), so cycling is offered
 * for such a card exactly when its trigger will really fire and resolve — the classifier's trigger reconciliation holds
 * the card to the same two facts. False for a card with no such line.
 */
export function cycleSelfTriggersModeled(card) {
  const oracle = String(card?.oracle ?? card?.oracle_text ?? "");
  const printed = (oracle.match(/(?:^|\n)[ \t]*When you cycle [^,\n]+,/gi) || []).length;
  if (printed === 0) return false;
  const detected = detectTriggers(card).filter((d) => d.event === "cycleSelf");
  return detected.length === printed && detected.every((d) => triggerRoutesNatively(d));
}

export function triggerRoutesNatively(d) {
  if (!d.effectClause) return false;
  if (d.interveningIf) {
    const cp = parseEffectClause(d.effectClause, "Instant", { hasX: !!d.effectHasX, sourceScoped: true });
    const a = cp?.atoms?.length === 1 ? cp.atoms[0] : null;
    // UPKEEP-WIN (Wave 3b, CR 603.4) — a single win-game atom ("you win the game") whose threshold is in
    // the strict win evaluator's vocabulary (Revel in Riches / Felidar Sovereign / Knuckles). A win is
    // modeled exactly (never fail-open) — see winGame.evaluateWinThreshold.
    if (a && a.op === "win-game" && a.who === "controller"
      && programConfidence(cp) === "high" && winConditionParseable(d.interveningIf)) return true;
    // INTERVENING-IF (CR 603.4) — a GENERAL conditional trigger routes natively when (a) its effect program
    // is HIGH + non-modal + target-resolvable (the same α1 allowlist the non-conditional path uses) AND
    // (b) its condition is in the strict board-query vocabulary (interveningIfParseable). gameEngine.
    // buildTriggerStack evaluates the condition at flush (drop if false) and resolvers re-check at
    // resolution (CR 603.4 second check), so the metric mirrors a routing the runtime actually performs.
    // An unparseable condition stays body-only (false-negative SAFE — a mis-evaluated condition is an FP).
    return !!cp && programConfidence(cp) === "high" && cp.structure !== "modal"
      && (!programNeedsChosenTarget(cp) || programTriggerTargetsResolvable(cp))
      && combatDamageReferentSatisfied(cp, d.event)
      && interveningIfParseable(d.interveningIf);
  }
  const p = parseEffectClause(d.effectClause, "Instant", { hasX: !!d.effectHasX, sourceScoped: true }); // SELF-CAST: an {X}-spell self-cast trigger's half-X/X payoff needs hasX to parse (Hydroid Krasis)
  // Mirror buildTriggerStack's α1 ALLOWLIST EXACTLY: a HIGH trigger routes natively only when every
  // chosen-target atom is intent-resolvable (the enemy/own chooser can place it on a correct side). An
  // AMBIGUOUS targeting atom (bounce) stays in the gap, not native — so the metric never claims a routing
  // the runtime won't perform. The combat-damage-referent gate keeps a who:"damagedPlayer" / "that many"
  // program native ONLY on a combat-damage event (else its referent is unset → the clause would silently
  // drop; Memory Erosion's CAST "that player mills" stays Arbiter).
  // MODAL (CR 700.2): a "choose one/two/… —" trigger routes natively iff EVERY mode is modeled (the parser's
  // all-or-nothing modal gate → HIGH only when every mode's atoms are known; one unmodeled mode → LOW, not
  // native) AND every mode's targets are resolvable (programTriggerTargetsResolvable flattens across modes).
  // buildTriggerStack's modal branch fires exactly under these conditions (AI picks a sensible mode at flush),
  // so dropping the old `structure !== "modal"` exclusion keeps the metric in lockstep with the runtime —
  // never an over-claim (a partially-modeled modal is LOW and excluded; an ambiguous-mode modal fails the
  // resolvable gate and stays on the Arbiter).
  // CHOOSE-ONE PARTIAL (BLITZ ML-1, CR 700.2b): a SINGLE-pick "choose one" modal need not have EVERY mode
  // resolvable — the controller declines an unsafe-to-target mode (CR 700.2b — an illegal mode can't be
  // chosen) and picks a fully-resolvable one, so the card routes when ≥1 mode is resolvable
  // (modalChooseOneRoutable). buildTriggerStack consults the SAME helper + its chooser skips the ambiguous
  // modes, so metric and runtime stay in lockstep. "Choose two / one or both / one or more" is unchanged
  // (chooseCount ≠ 1 → the helper is false → the every-mode-resolvable gate still applies).
  return !!p && programConfidence(p) === "high"
    && (!programNeedsChosenTarget(p) || programTriggerTargetsResolvable(p) || modalChooseOneRoutable(p))
    && combatDamageReferentSatisfied(p, d.event);
}

/**
 * GROUP-TRIGGERED grant body validator (Tempered Sliver). A quoted group-grant body ("Whenever this creature
 * deals combat damage to a player, put a +1/+1 counter on it.") is a FULLY-MODELED triggered grant iff it
 * parses to one-or-more triggers (the SAME detectTriggers a printed trigger uses) that ALL route natively
 * (triggerRoutesNatively above — the same gate the Aura/Equipment granted-triggered classifier uses). This is
 * the function registered into staticAbilityParser's group-triggered emission gate by BOTH coverage.js (the
 * classification path) and gameEngine.js (the runtime trigger-firing path) — a single shared definition so the
 * metric and the runtime can't drift. Pure.
 */
export function isModeledGroupTriggeredBody(quoted) {
  const dets = detectTriggers({ name: "GroupGranted", type: "Creature", oracle: String(quoted || "") });
  // ⛔ KIRA OWNS THE GRANTED "counter that spell or ability" (2026-09-30). Since the Glasskites' printed trigger routes
  // natively, Kira, Great Glass-Spinner's quoted body does too — and emitting it as a group grant would DOUBLE-model
  // Kira: kiraTargetCounter.js already counters at the four target-choice chokepoints, so every targeting would also
  // stack a second, fizzling trigger (an extra priority round in every such game). Kira's module is also the more
  // faithful of the two for a GRANT: its per-creature flag records every targeting, so a creature targeted before the
  // grant arrived is not "fresh" later that turn, while the generic once-per-turn latch only starts counting once the
  // granted trigger exists. So a quoted body that resolves to that counter is declined here — exactly the state before
  // the Glasskite slice, for every quoted grant of it (a narrower "Sliver creatures you control have …" stays the safe FN
  // it was). The PRINTED Glasskites never pass through this gate.
  if (dets.some((d) => /^counter the targeting spell or ability\.?$/i.test(String(d.effectClause || "").trim()))) return false;
  return dets.length > 0 && dets.every(triggerRoutesNatively);
}

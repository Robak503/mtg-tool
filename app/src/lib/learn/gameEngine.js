/**
 * Phase 6 — Learn-to-Play: gameEngine.js
 *
 * Turn structure state machine. Consumes the immutable helpers from
 * gameState.js; the engine never mutates state directly. Everything
 * exported is a pure function that returns a new GameState.
 *
 * Scope (per design doc §5 step 2):
 *   - Phase/step transitions (untap → upkeep → draw → main → combat →
 *     main → end → cleanup → next turn)
 *   - Priority handling — passPriority + a tiny "both passed" detector
 *     that either resolves the top of the stack or advances to the
 *     next phase
 *   - Trigger queue — abilities trigger immediately on the event, then
 *     get placed on the stack at the next priority-grant checkpoint
 *
 * Out of scope (deferred to PR3+):
 *   - Legal-choice generation (PR3)
 *   - State-based actions beyond a trivial life-loss check (PR2.5 or
 *     part of the engine when actions land)
 *   - Cleanup-step "until end of turn" effect removal — placeholder
 *
 * Design source: docs/phase6-learn-to-play.md §4
 */

import {
  PHASES,
  STEPS,
  MANA_COLORS,
  nextInTurnOrder,
  blockDeclarationOpen, // CR 509.1, 509.2 — the declare blockers step's open declaration (closeBlockDeclaration)
  drawCards,
  putCardsOnBottom,
  resetTurnCounters,
  resetCardsDrawnAllPlayers,
  resetSpellsCastAllPlayers,
  resetCreatureDeathsAllPlayers,
  resetAttackedThisTurnAllPlayers,
  resetBecameTargetThisTurnAllPlayers,
  resetBecameTappedThisTurnAllPlayers,
  untapAll,
  clearCombatDamage,
  revertEndOfTurnControl,
  revertEndOfTurnCopies,
  clearRemovedFromCombatFlags,
  clearManaHolds,
  logEvent,
  mintId,
  opponentsOf,
  applyRadiation,
  addCounter,
  moveCardToZone,
  findPermanent,
  createPermanent, // the enters-trigger preview (entersTriggerRemovesOwn) puts the entering permanent on a copy of the board
  openResolutionWindow, // CR 704.4 — no state-based action while the top object resolves; the check runs in finalizeStackResolution
  closeResolutionWindow,
} from "./gameState.js";
import { phaseInAndExpireShield, expireNameCastLocks, expireDamageReplacementEffects } from "./gameState.js"; // TEFERI'S PROTECTION - phase in + shield expiry at the active player's untap; B4 — the name cast locks expire there too
import { withoutImpulseStamps, startingLoyalty } from "./gameState.js"; // the impulse lapse at cleanup strips the same stamp list the cast out of exile does
import { permanentValue, policyEvalEnabledFor } from "./boardEval.js"; // QUARTET PHASE 1 slice 3 — the shared evaluator (leaf-importing module, cycle-free)
import { chooseAuraEntryHost, auraEntryHostScore, seatIsHuman } from "./auraEntry.js"; // the flicker policy reads where a returned Aura lands (CR 303.4f) — the choice the return makes (a leaf); + who is a person (the trigger-target pause)
import { setPendingCleanupDiscardChoice, setPendingTriggerTargetChoice, setPendingTriggerOrderChoice, setPendingSoftCounterChoice, clearPendingChoice } from "./pendingChoice.js";
import { targetTaxForStackObject } from "./ward.js"; // ward and Diffusion Sliver on a triggered ability's target (CR 702.21a) — the cast and ability paths' own detector (ward.js reaches gameState, layers, faceUp, groupWard and manaModel; none imports gameEngine)
import { autoPickSoftCounterPay } from "./effects/runProgram.js"; // the AI's pay-or-decline answer to a ward — read by the trigger-target chooser so it never aims where it won't pay
import { skipsDrawStep, extraTurnSkipped } from "./effects/textNormalize.js"; // SKIP YOUR DRAW STEP (RG-4, 2026-09-05) — a leaf reader, controller-scoped; + the opponent-scoped extra-turn skip (Trouble in Pairs, #626)
import { resolveCombatDamage, combatHasFirstStrike } from "./combatResolution.js";
import { manaDoesNotEmpty } from "./cardEffects.js";
import { getResolver } from "./resolvers.js";
import {
  checkStepTriggers,
  checkAttackTriggers,
  checkBlockTriggers,
  checkCardDrawnTriggers,
  checkLeavesTriggers,
  checkMilledTriggers,
  checkBecomesTargetTriggers,
  checkCrimeTriggers, // CRIME (CR 700.13, shelf D9) — a triggered ability that targets an opponent's side reaching the stack
  checkUntapTriggers,
  checkTapTriggers, checkCounterTriggers,
  checkGraveyardEventTriggers,
  checkSagaChapterTriggers,
  checkDiscardTriggers, // CR 514.1 — the cleanup hand-size discard is a discard (CR 701.9a)
  detectTriggers, // FLICKER TARGETS (shelf D21) — does a permanent carry an enters ability worth re-firing?
  checkEnterTriggers, // the enters-trigger preview fires the entering permanent's enters triggers exactly as enterPermanent does
} from "./triggers.js";
import { checkAllStateBasedActions } from "./sba.js";
import { expireContinuousEffects, maxHandSizeFor, sourceTriggerMultiplierCount, permanentIsCreature, permanentToughness, permanentHasKeyword } from "./layers.js"; // + the forced pick's survival read
import { sacrificePermanentForCost } from "./costSacrifice.js"; // the finished Saga's sacrifice (CR 714.4) — THE sacrifice outside a resolution
import {
  parseEffectClause,
  programConfidence,
  programNeedsChosenTarget,
  programTriggerTargetsResolvable,
  modalChooseOneRoutable,
  atomTargetIntent,
} from "./effects/parser.js";
import { expandTriggerChoices } from "./effects/targeting.js"; // expandTriggerChoices — a trigger's offer with its source's colours (protection, CR 702.16b)
import { applyMonarchEndStepDraw } from "./effects/atoms/monarch.js";
import { applyFadeVanishUpkeep, applySuspendUpkeep } from "./fading.js";
import { applyUrDragonAttackTriggers } from "./urDragonAttack.js";
import { applyAnnihilatorTriggers } from "./annihilator.js";
import { applyVihaanCombatAnimate } from "./vihaanAnimate.js";
import { applySeedbornUntap } from "./seedbornUntap.js";
import { applyKiraTargetCounter } from "./kiraTargetCounter.js";
import { applyMurkfiendUntap } from "./murkfiendUntap.js";
import { applyTypeFilteredUntap } from "./typeFilteredUntap.js";

import { applyWolverineEndStep, clearWolverineTurnFlags } from "./wolverine.js";
import { evaluateWinThreshold } from "./effects/atoms/winGame.js";
import { shuffleControllerLibrary, tutorManaValue } from "./effects/atoms/library.js"; // seeded opening shuffle (reuses the threaded-rngSeed mulberry32 path; library.js never imports gameEngine → no cycle); + the mana-value reader the forced trigger target ranks by
import { stackSpellManaValue } from "./spellOnStack.js"; // a spell target's mana value ON THE STACK (CR 202.3 — the announced X, the half cast) for the forced trigger-target pick; a zero-import leaf
import { drainDelayedTriggers, dropSkippedExtraTurnRecords } from "./effects/atoms/delayedTrigger.js"; // CR 603.7 scheduler drain (leaf atom module — imports only gameState, no cycle); + the skipped-extra-turn drop (CR 614.10a)
import { rankBottomCandidates } from "./mulliganPolicy.js"; // London bottom-N picker (leaf module, no cycle)
import { evaluateInterveningIf, interveningIfParseable } from "./interveningIf.js";
import { registerGroupTriggeredBodyValidator, MODELLED_MAX_HAND_RE, lostManaBecomesColorless } from "./staticAbilityParser.js";
import { isModeledGroupTriggeredBody, combatDamageReferentSatisfied } from "./triggerRouting.js";
import { restrainOptionalFights, loopSpent, loopBreakingChoice } from "./triggerTargetRestraint.js"; // the optional-fight read and the loop backstop on the trigger-target chooser
import { registerGrantTriggeredBodyValidator } from "./effects/atoms/grantUntilEot.js"; // TG-1 — the until-EOT quoted-grant body gate

// GROUP-TRIGGERED grant (Tempered Sliver) — RUNTIME registration of the modeled-body gate into
// staticAbilityParser's group-triggered emission. The trigger-firing path (combatResolution / checkXTriggers →
// triggersForEvent → grantedTriggersForGroup → layers.collectContinuousEffects → parseStaticAbilities) flows
// through gameEngine but NOT coverage.js, so without this the group-triggered grant descriptor would never be
// emitted at runtime (the validator would be null) and the granted trigger would silently never fire — a CREED
// false negative. coverage.js registers the SAME shared validator for the classification path; the two
// registrations are idempotent (identical function), mirroring registerGroupActivatedBodyValidator (coverage +
// legalChoices). The validator itself lives in triggerRouting.js so metric + runtime share one definition.
registerGroupTriggeredBodyValidator(isModeledGroupTriggeredBody);

// UNTIL-EOT QUOTED GRANT (BLITZ TG-1) — RUNTIME registration of the triggered-body gate into the
// grant-until-eot clause parser. The runtime CAST path (legalChoices/expandCastChoices → parseEffectProgram)
// flows through gameEngine but not coverage.js; without this the Feign Death clause would parse LOW at
// runtime while the metric (coverage.js registers the same fn) claimed it native — a drift the shared
// definition forbids. Idempotent with coverage's registration (identical function).
registerGrantTriggeredBodyValidator(isModeledGroupTriggeredBody);

const EMPTY_COMBAT = { attackers: [], blockers: [] };

// ─── Step ordering ────────────────────────────────────────────────────────────

/**
 * Flattened (phase, step) sequence — the order they happen in a turn.
 * The engine walks this list. After the last entry, the turn ends and
 * the next player gets a turn.
 */
const TURN_SEQUENCE = PHASES.flatMap((phase) => STEPS[phase].map((step) => ({ phase, step })));

function findSequenceIndex(phase, step) {
  return TURN_SEQUENCE.findIndex((entry) => entry.phase === phase && entry.step === step);
}

// ─── Priority ────────────────────────────────────────────────────────────────

/**
 * Steps where players do NOT receive priority by default (per CR 117.3a):
 *   - untap step
 *   - cleanup step (only if a trigger or instant-speed action happens)
 *
 * Both are auto-pass by default: no priority granted, no priority holder set.
 * The engine still surfaces them as discrete states so the UI / narrator can
 * show "Untap step — untapping permanents…". The one exception is CR 514.3a:
 * a cleanup step whose flush stacked a trigger grants priority
 * (openCleanupPriorityWindow) and is followed by another cleanup step.
 */
const NO_PRIORITY_STEPS = new Set(["untap", "cleanup"]);

function grantsPriority(step) {
  return !NO_PRIORITY_STEPS.has(step);
}

/**
 * IMPULSE-EXILE cleanup (CR 514.2) — the "you may play that card this turn" permission granted by an
 * `impulse-exile` atom LAPSES at end of turn. Strip the `_impulse` / `_impulseTurn` markers off every exiled
 * card whose stamp is from a turn that has now ended, so legalChoices.actionsPlayImpulseFromExile no longer
 * offers it: the card stays inert in exile (CR-correct — the window closed; the card is NOT put anywhere else).
 * Only touches cards that carry the marker (a plotted / adventure / discover-parked exile card is untouched),
 * and only clears stamps from a PRIOR-or-current-ended turn — a card impulse-exiled during a still-live turn is
 * never cleared early. Pure (a shallow rebuild of each affected player's exile array; no closures). A no-op for
 * every player with no impulse-marked exile card, so the common path allocates nothing.
 */
function clearImpulsePlayPermissions(state) {
  let players = null;
  for (const [pid, player] of Object.entries(state.players)) {
    const exile = player.exile || [];
    // EXTENDED WINDOW (CR 611.2a — "until the end of your NEXT turn"): the stamp survives its own turn and
    // lapses only when a turn ENDS that belongs to its OWNER and began after the stamp. This runs in the
    // cleanup step BEFORE the turn advance, so `state.activePlayer` is the player whose turn is ending —
    // which is what makes the owner comparison meaningful. Correct for both castings:
    //   cast on the owner's turn T   → T is not > T, so it survives; the owner's NEXT turn ends it.
    //   cast on an opponent's turn T → wrong owner at T's end; the owner's upcoming turn ends it.
    // A plain (one-turn) stamp keeps the original `<= state.turn` rule byte-identical.
    const expired = (c) => c && c._impulse && (c._impulseExtended
      ? (c._impulseOwner === state.activePlayer && c._impulseTurn < state.turn)
      : c._impulseTurn <= state.turn);
    if (!exile.some(expired)) continue;
    // Every stamp comes off together (gameState.withoutImpulseStamps — the list the cast out of exile uses too),
    // including who held the permission (`_impulseFor`, Ragavan's another-player impulse).
    const cleaned = exile.map((c) => (expired(c) ? withoutImpulseStamps(c) : c));
    players = players || { ...state.players };
    players[pid] = { ...player, exile: cleaned };
  }
  return players ? { ...state, players } : state;
}

/**
 * After a state change, restart the priority loop. Active player
 * receives priority first per CR 117.1.
 */
export function grantPriority(state, holder = state.activePlayer) {
  return {
    ...state,
    priorityHolder: holder,
    consecutivePasses: 0,
  };
}

/**
 * Reset the priority loop without changing the active player (used
 * when state changes — a spell resolved, a trigger went on the stack —
 * because rules require restarting priority from the active player).
 */
function resetPriorityLoop(state) {
  if (!grantsPriority(state.step)) return state;
  return {
    ...state,
    priorityHolder: state.activePlayer,
    consecutivePasses: 0,
  };
}

/**
 * CR 514.3a — the cleanup step's one priority exception. Cleanup normally grants no priority (CR 514.3), but when
 * triggered abilities were put on the stack during it (a cleanup discard's discard watchers, a graveyard-entry watcher, a
 * dies trigger from the 514.2 expiry SBAs) the active player gets priority, and once the stack is empty and all players
 * pass in succession ANOTHER cleanup step begins (passPriority) — the triggers resolve in this turn's cleanup, never in
 * the next turn. A window already open stays open after each resolution, priority returning to the active player (CR
 * 117.3b). Applied after every cleanup flush (runStepActions, finalizeStackResolution); a no-op in every other step. The
 * SBA-only case of 514.3a (state-based actions performed with nothing triggered) still grants no priority — an
 * under-offer of a window, never an action the rules forbid.
 */
function openCleanupPriorityWindow(state) {
  if (state.step !== "cleanup") return state;
  if ((state.stack || []).length === 0 && !state.priorityHolder) return state;
  return grantPriority(state);
}

// ─── Mana emptying (CR 500.4) ──────────────────────────────────────────────────

/**
 * Empty every player's mana pool, EXCEPT colors a "doesn't empty" effect
 * preserves for that player (Omnath keeps green — wired via cardEffects in
 * PR 10.5; default keeps nothing). Per CR 500.4 mana empties as each step and
 * phase ends; this is the one helper all the emptying checkpoints route
 * through, so the preservation hook is honored everywhere. Under Horizon
 * Stone / Kruphix the mana a player would lose stays, as colorless.
 */
export function emptyManaPools(state) {
  const nextPlayers = {};
  for (const pid of Object.keys(state.players)) {
    const keep = manaDoesNotEmpty(state, pid);
    const toColorless = lostManaTurnsColorless(state, pid);
    const pool = state.players[pid].manaPool;
    // MANA-HOLD — the SECOND, bounded preservation: mana printed as outliving the step that made it
    // ("This mana lasts until end of combat"). Unlike the card-name registry above (Omnath keeps green,
    // permanently, in full), this keeps at most `hold[c]` of a color and is cleared at end of combat.
    //
    // The known imprecision, stated rather than hidden: the hold caps a COLOR, not specific mana. Float 2
    // firebending red, spend it, then tap a Mountain in the same step and 1 red survives that shouldn't.
    // It can never preserve MORE than the printed effect promised, so it cannot manufacture mana out of
    // nothing — the failure mode is a rare 1-mana carry, not a leak.
    const hold = state.players[pid].manaHold || {};
    // TURN-SCOPED COLOR HOLD (The Last Agni Kai, W11 — "Until end of turn, you don't lose unspent red
    // mana as steps and phases end"): manaHoldTurn[c] keeps the WHOLE color at every step/phase drain;
    // finishCleanupActions strips the flag BEFORE its own drain, so the mana still empties at cleanup
    // (the printed "until end of turn" bound). Unlike manaHold (a bounded per-color cap, end-of-combat),
    // this is unbounded by design — the printed effect holds ALL unspent mana of the color.
    const holdTurn = state.players[pid].manaHoldTurn || {};
    // + P·37 — the EXACT until-end-of-turn hold on "this mana" (Birgi; gameState.holdManaUntilEndOfTurn), added to the cap.
    const holdEot = state.players[pid].manaHoldEot || {};
    const newPool = {};
    for (const c of MANA_COLORS) newPool[c] = (keep.includes(c) || holdTurn[c]) ? pool[c] || 0 : Math.min(pool[c] || 0, (hold[c] || 0) + (holdEot[c] || 0));
    // LOST MANA BECOMES COLORLESS (stage ③ · 20 — Horizon Stone, Kruphix: "If you would lose unspent mana, that mana becomes
    // colorless instead."): a replacement on exactly the mana this drain would take. Whatever the keeps and holds above leave
    // behind stays in the pool as {C}; kept mana was never lost, so Omnath's green stays green.
    if (toColorless) {
      let lost = 0;
      for (const c of MANA_COLORS) lost += (pool[c] || 0) - newPool[c];
      newPool.C += lost;
    }
    // POOL-RESTRICTED SUB-POOL (QUARTET Phase 4 — Klauth): tagged entries empty with the pool UNLESS
    // they carry the printed until-end-of-turn hold ("you don't lose this mana as steps and phases
    // end") — those survive every step/phase end and are dropped at CLEANUP (finishCleanupActions).
    // Under Horizon Stone / Kruphix an entry that would be dropped stays instead, colorless, with its
    // restriction (both cards' rulings: "those restrictions or riders remain associated with that mana").
    const rm = state.players[pid].restrictedMana;
    const keptEntries = !Array.isArray(rm) ? rm
      : toColorless ? rm.map((e) => (e.holdUntilEndOfTurn ? e : colorlessManaEntry(e)))
      : rm.filter((e) => e.holdUntilEndOfTurn);
    nextPlayers[pid] = { ...state.players[pid], manaPool: newPool,
      ...(keptEntries !== rm ? { restrictedMana: keptEntries } : {}) };
  }
  return { ...state, players: nextPlayers };
}

// Does a permanent this player controls print "If you would lose unspent mana, that mana becomes colorless instead."?
// Battlefields are keyed by controller, a phased-out permanent is spliced out of `battlefield`, and a face-down permanent's
// `card` is its 2/2 stand-in (CR 708.2), so this array is exactly the permanents whose static applies.
function lostManaTurnsColorless(state, playerId) {
  return (state.players?.[playerId]?.battlefield || []).some((perm) => lostManaBecomesColorless(perm?.card));
}

// A restricted entry's mana, turned colorless: the same amount, the same restriction, and no until-end-of-turn hold — the
// Horizon Stone / Kruphix static keeps it now, and asks again at every drain.
function colorlessManaEntry(entry) {
  const total = MANA_COLORS.reduce((n, c) => n + (entry.pool?.[c] || 0), 0);
  const out = { ...entry, pool: { W: 0, U: 0, B: 0, R: 0, G: 0, C: total } };
  delete out.holdUntilEndOfTurn;
  return out;
}

// ─── Step advancement ────────────────────────────────────────────────────────

/**
 * Advance to the next (phase, step) in the turn sequence. When the
 * current step is the last in the turn (cleanup), the turn ends and
 * the next player becomes active.
 *
 * Returns a new state, NOT including any priority/trigger handling.
 * Callers should run runStepActions() afterward to apply the new
 * step's automatic effects (untap, draw, etc.).
 */
/**
 * ENTER-COMBAT post-processing (Increment 3b, 2026-08-12) — everything a beginning of combat step owes as it begins: the
 * "at the beginning of combat" triggers (CR 507.1, 603.2b), the Vihaan animate, and the turn-scoped combat tally
 * (`combatsThisTurn: { turn, count }`) that Karlach's "first combat phase of the turn" intervening-if reads — self-expiring
 * via the turn stamp, so it needs no reset wiring. Run ONCE per beginning of combat step, by runStepActions, whether the
 * step was reached by the normal walk or by one of advanceStep's extra-combat jumps (CR 500.8 — an additional combat phase
 * has its own beginning of combat step, begun once). The jumps also ran it from 2026-08-12 to 2026-10-22, so every
 * additional combat counted twice and its beginning-of-combat triggers triggered twice.
 */
function enterCombatPostProcess(s) {
  let out = { ...s, combatsThisTurn: { turn: s.turn, count: (s.combatsThisTurn?.turn === s.turn ? s.combatsThisTurn.count : 0) + 1 } };
  out = checkStepTriggers(out, "combatBegin");
  out = applyVihaanCombatAnimate(out);
  return out;
}

export function advanceStep(state) {
  const index = findSequenceIndex(state.phase, state.step);
  if (index === -1) {
    throw new Error(`Invalid (phase=${state.phase}, step=${state.step})`);
  }

  // Mana empties as the current step/phase ends (CR 500.4), honoring any
  // "doesn't empty" effect. advanceStep is the single step-transition
  // chokepoint, so every normal transition (and the end-of-turn wrap) clears
  // floated mana here — bulk/forced advances can't skip it.
  const emptied = emptyManaPools(state);

  // ===== EXTRA COMBAT PHASE (CR 500.8) ===================================================================
  // "Some effects can add phases to a turn. They do this by adding the phases directly after the specified
  // phase. If multiple extra phases are created after the same phase, the most recently created phase will
  // occur first." — the SAME LIFO the extra-TURN pop below already implements for CR 500.7.
  //
  // ⛔ WHY A PER-STATE QUEUE AND NOT THE SEQUENCE: TURN_SEQUENCE is a MODULE-LEVEL constant, shared by every
  // game, and findSequenceIndex searches it by (phase, step). A spliced phase cannot live there. So the
  // insertion is a jump: leaving `end-of-combat` with a queued run, go back to `beginning-of-combat`
  // instead of forward to `postcombat-main`.
  //
  // ⛔ CR 505.1a — "Only the FIRST main phase of the turn is a precombat main phase. All other main phases
  // are postcombat main phases." The additional main these cards grant is therefore a POSTCOMBAT main,
  // which is what the normal forward transition already lands on once the queue drains. Nothing extra to
  // do — but it is the detail that would silently mis-fire every precombat-main trigger if modelled as a
  // second "precombat-main", so it is stated rather than assumed.
  //
  // ⛔ THE NON-TERMINATION TRAP: the run is popped as it is taken (never re-queued), so N grants give
  // exactly N extra combats. Without the pop, Relentless Assault loops the turn forever.
  //
  // ⛔ EVERY JUMP BELOW ONLY MOVES THE STATE (2026-10-22). The beginning of combat step it lands on is begun by runStepActions,
  // exactly as on the normal walk — the tally, the "at the beginning of combat" triggers, the Vihaan animate, once
  // (enterCombatPostProcess; CR 507.1, 603.2b). Until 2026-10-22 the five jumps ran enterCombatPostProcess themselves as well,
  // so every additional combat counted twice and its beginning-of-combat triggers triggered twice.
  if (state.step === "end-of-combat" && state.currentExtraCombat && state.currentExtraCombat.withMain === false) {
    // AFTER-MAIN FIDELITY (KT-7b): this extra combat had NO main after it (Full Throttle, Grim Reaper's Sprint) — chain straight
    // to the next after-main combat if one is queued, else to the OWED normal combat; only then does a main follow.
    const queued = state.extraPhases || [];
    const bocIdx = TURN_SEQUENCE.findIndex((e) => e.step === "beginning-of-combat");
    const nextIdx = queued.length ? [...queued].map((e, i) => [e, i]).filter(([e]) => e.after === "main").map(([, i]) => i).pop() : undefined;
    if (bocIdx !== -1 && nextIdx !== undefined) {
      return {
        ...emptied, extraPhases: queued.filter((_, i) => i !== nextIdx), currentExtraCombat: { withMain: queued[nextIdx].withMain !== false },
        phase: TURN_SEQUENCE[bocIdx].phase, step: TURN_SEQUENCE[bocIdx].step, combat: null, priorityHolder: null, consecutivePasses: 0,
      };
    }
    if (bocIdx !== -1 && state.normalCombatOwed) {
      return {
        ...emptied, normalCombatOwed: false, currentExtraCombat: null,
        phase: TURN_SEQUENCE[bocIdx].phase, step: TURN_SEQUENCE[bocIdx].step, combat: null, priorityHolder: null, consecutivePasses: 0,
      };
    }
  }
  if (state.step === "end-of-combat") {
    const queued = state.extraPhases || [];
    // CLASS-AWARE POP (Increment 3, 2026-08-12): this site consumes only the AFTER-COMBAT entries
    // (`after` absent ⇒ the classic kind). LIFO within the class (CR 500.8). An after-MAIN entry queued
    // during this combat's triggers waits for its own pop site below.
    const idx = queued.length ? [...queued].map((e, i) => [e, i]).filter(([e]) => (e.after ?? "combat") === "combat").map(([, i]) => i).pop() : undefined;
    if (idx !== undefined) {
      const bocIdx = TURN_SEQUENCE.findIndex((e) => e.step === "beginning-of-combat");
      if (bocIdx !== -1) {
        return {
          ...emptied,
          extraPhases: queued.filter((_, i) => i !== idx), // LIFO within the class — most recent first (CR 500.8)
          phase: TURN_SEQUENCE[bocIdx].phase,
          step: TURN_SEQUENCE[bocIdx].step,
          combat: null,                     // a NEW combat: last combat's attackers/blockers do not carry over
          priorityHolder: null,
          consecutivePasses: 0,
        };
      }
    }
  }
  // ===== EXTRA COMBAT AFTER A MAIN PHASE (Increment 3, 2026-08-12 — Aggravated Assault, Relentless
  // Assault, Seize the Day: "After this MAIN phase, there is an additional combat phase…") ================
  // The after:"main" pop site: leaving EITHER main phase with a queued after-main run, jump to
  // beginning-of-combat instead of the normal forward transition. The promised "additional main phase"
  // is the normal forward transition once this combat drains (CR 505.1a — every main after the first is
  // a postcombat main; the after-combat block above makes the identical argument). Queued during a
  // NON-main step (an upkeep activation), the entry simply waits here for the next main to end — the
  // printed "after this main phase" resolves to the next main boundary, matching the card's ruling.
  // ⛔ THE NON-TERMINATION TRAP, same as above: popped as taken, never re-queued — N grants, N combats.
  if (state.step === "main") {
    const queued = state.extraPhases || [];
    const idx = queued.length ? [...queued].map((e, i) => [e, i]).filter(([e]) => e.after === "main").map(([, i]) => i).pop() : undefined;
    if (idx !== undefined) {
      const bocIdx = TURN_SEQUENCE.findIndex((e) => e.step === "beginning-of-combat");
      if (bocIdx !== -1) {
        // AFTER-MAIN FIDELITY (KT-7b, CR 500.8): leaving the PRECOMBAT main into an extra combat means the turn's NORMAL
        // combat has not happened yet — it is OWED and comes after the extra sequence. The entry remembers whether a main
        // follows it (`withMain`); a no-main extra combat chains to the next combat at its end (see end-of-combat).
        return {
          ...emptied,
          extraPhases: queued.filter((_, i) => i !== idx),
          normalCombatOwed: state.phase === "precombat-main" ? true : !!state.normalCombatOwed,
          currentExtraCombat: { withMain: queued[idx].withMain !== false },
          phase: TURN_SEQUENCE[bocIdx].phase,
          step: TURN_SEQUENCE[bocIdx].step,
          combat: null,
          priorityHolder: null,
          consecutivePasses: 0,
        };
      }
    }
    // The owed NORMAL combat: leaving a postcombat main with nothing queued and the normal combat still owed → it happens now
    // (then the forward transition lands on a postcombat main again). Never from the precombat main — that is the normal path.
    if (state.phase === "postcombat-main" && state.normalCombatOwed) {
      const bocIdx = TURN_SEQUENCE.findIndex((e) => e.step === "beginning-of-combat");
      if (bocIdx !== -1) {
        return {
          ...emptied, normalCombatOwed: false, currentExtraCombat: null,
          phase: TURN_SEQUENCE[bocIdx].phase, step: TURN_SEQUENCE[bocIdx].step, combat: null, priorityHolder: null, consecutivePasses: 0,
        };
      }
    }
  }

  if (index + 1 < TURN_SEQUENCE.length) {
    let next = TURN_SEQUENCE[index + 1];
    // CR 508.8 / 511.1 (CR-remediation B3) — a combat with NO declared attackers skips the
    // declare-blockers and combat-damage steps entirely (they never begin: no step triggers, no
    // priority windows there). Leaving declare-attackers with an empty attacker set jumps straight
    // to end-of-combat. Besides matching the real turn shape, this stops every non-attacking turn
    // from burning two empty priority laps across the whole table.
    // "If no creatures are DECLARED as attackers or put onto the battlefield attacking" — a creature that was declared
    // and then removed from combat during the step (destroyed, stolen, phased out, regenerated — CR 506.4 drops its
    // record) still keeps the steps: the count the declaration recorded when it closed (closeAttackDeclaration) is read
    // beside the live records, which hold any creature put onto the battlefield attacking.
    if (state.step === "declare-attackers" && (state.combat?.attackers || []).length === 0 && !(state.combat?.declaredAttackerCount > 0)) {
      const eoc = TURN_SEQUENCE.findIndex((e) => e.step === "end-of-combat");
      if (eoc !== -1) next = TURN_SEQUENCE[eoc];
    }
    // CR 510.4 / 506.1 — the phase gets the FIRST-STRIKE combat damage step only "if at least one attacking or blocking creature
    // has first strike … or double strike … as the combat damage step begins". With none in combat as the declare blockers step
    // ends, the combat damage step is the only one: go straight to it. Until 2026-10-22 the first-strike step was always
    // entered — an empty step with its own priority round in every combat with attackers.
    if (state.step === "declare-blockers" && !combatHasFirstStrike(state)) {
      const cd = TURN_SEQUENCE.findIndex((e) => e.step === "combat-damage");
      if (cd !== -1) next = TURN_SEQUENCE[cd];
    }
    return {
      ...emptied,
      phase: next.phase,
      step: next.step,
      priorityHolder: null,
      consecutivePasses: 0,
    };
  }

  return beginNextTurn(state, emptied);
}

/**
 * THE NEXT TURN BEGINS — the end of the turn in `state` (its cleanup done) and the start of the next one at (beginning, untap):
 * advanceStep's end of every turn, and playerLeavesGame's when the active player leaves (their turn ends there — the same queue,
 * the same rotation). `emptied` is `state` with its mana pools emptied (advanceStep's step-end empty; the leaver's cleanup has
 * already emptied them). Returns the new turn's state; runStepActions runs its untap step.
 *
 * THE DEPARTED TURNS (CR 800.4k — "If a player who has left the game would begin a turn, that turn doesn't begin"): every player
 * whose turn the transition reaches and does not begin — an extra turn queued for a departed player, popped untaken, and a departed
 * seat the rotation passes on its way to the next seat still in the game (`state.seatOrder`, the turn order every seat began with,
 * written as the first player leaves) — is named in the new turn's `turnsNotBegun`. That is the moment the turn they would have
 * taken would have begun, when their "until your next turn" effects end (CR 800.4m — the untap step's sweeps, which consume the
 * list; layers.untilNextTurnEndsNow).
 */
export function beginNextTurn(state, emptied = state) {
  // EXTRA TURN (BLITZ XT-1, CR 500.7): if any extra turns are queued, the MOST RECENTLY created one is
  // taken next (a LIFO pop — CR 500.7's "taken … in the reverse of the order they were created") instead
  // of rotating. The extra turn is a full normal turn (turn counter still advances — CR: it IS a turn);
  // once the stack drains, the pop-less branch below rotates from the rotation anchor — the player whose
  // normal turn the extra turns followed (2026-10-20; it used to rotate from the last taker).
  // SKIPPED EXTRA TURN (play-weighted #626 — Trouble in Pairs, CR 614.10): "If an opponent would begin an extra turn, that player
  // skips that turn instead." A skip is a replacement effect applied as the turn would begin, and this is the one place an
  // extra turn begins: while the top entry's taker has an opponent controlling a carrier (textNormalize.extraTurnSkipped, a
  // live battlefield read — a carrier that left before now skips nothing), the entry is popped untaken, the "that turn"
  // delayed records stamped with its stack position go with it (CR 614.10a — Final Fortune's ruling: no loss), and the next
  // queued extra turn is considered in its place. When every queued turn is skipped, the normal rotation below runs from the
  // player whose turn just ended — the turn that comes next once the skipped ones are gone. The carrier's own controller's
  // extra turns are untouched.
  // A PLAYER WHO HAS LEFT THE GAME (CR 800.4k — "If a player who has left the game would begin a turn, that turn doesn't
  // begin"): an extra turn queued for them is popped untaken the same way, with its "that turn" records.
  // THE ROTATION ANCHOR (CR 500.7 — "They do this by adding the turns directly after the specified turn"): an extra turn is
  // inserted after the turn that created it, and the turn order then resumes where it was — after the player whose NORMAL turn the
  // extra turns followed, not after whoever took the last extra turn. That player is the active player at the end of a normal
  // turn, and is carried through every extra turn as `rotationAnchor`. Before 2026-10-20 the rotation ran from the last taker, which
  // is the same player only when a player gives themself an extra turn on their own turn: an opponent's extra turn (Time Warp aimed
  // at ai2, Perch Protection's gift) or one taken after another player's turn (Nexus of Fate cast in an opponent's turn) handed the
  // next normal turn to the wrong seat. A state saved mid-extra-turn before the anchor existed (no `rotationAnchor`) rotates from the
  // active player as before. AN ANCHOR WHO HAS LEFT THE GAME (CR 800.4a; the engine drops them from the turn order) stays the anchor
  // (2026-10-21): the rotation resumes after their SEAT, read in the seat record (`seatOrder`) — until then it went on from the active
  // player, handing the next normal turn to the seat after whoever took the last extra turn. The active player who has just left
  // (playerLeavesGame's end of their turn) is the anchor the same way.
  const order = state.turnOrder || Object.keys(state.players || {});
  const seatOrder = Array.isArray(state.seatOrder) ? state.seatOrder : null;
  const knownSeat = (id) => !!id && (order.includes(id) || !!seatOrder?.includes(id));
  const anchorKept = state.extraTurnOf != null && knownSeat(state.rotationAnchor);
  const anchor = anchorKept ? state.rotationAnchor : state.activePlayer;
  const notBegun = []; // CR 800.4k — the departed players whose turn this transition reaches and does not begin (the doc above)
  let xt = state.extraTurns || [];
  let afterSkips = emptied;
  while (xt.length > 0 && (!afterSkips.players?.[xt[xt.length - 1].player] || extraTurnSkipped(afterSkips, xt[xt.length - 1].player))) {
    const skipped = xt[xt.length - 1];
    const departed = !afterSkips.players?.[skipped.player];
    if (departed) notBegun.push(skipped.player);
    afterSkips = dropSkippedExtraTurnRecords(afterSkips, xt.length - 1);
    xt = xt.slice(0, -1);
    afterSkips = logEvent({ ...afterSkips, extraTurns: xt }, { kind: "extra-turn-skipped", player: skipped.player, ...(departed ? { reason: "left the game" } : {}) });
  }
  const { turnsNotBegun: _spentNotBegun, ...fresh } = afterSkips;
  const withNotBegun = (extra) => (extra.length ? { turnsNotBegun: extra } : {});
  if (xt.length > 0) {
    const taker = xt[xt.length - 1];
    return {
      ...fresh,
      extraTurns: xt.slice(0, -1),
      activePlayer: taker.player,
      extraTurnOf: taker.player, // SHELF-85 V12: THIS turn is an extra turn of that player ("that turn's end step" delayed triggers read it)
      rotationAnchor: anchor, // CR 500.7 — the normal turn the rotation resumes after, once the extra turns are taken
      ...withNotBegun(notBegun),
      turn: state.turn + 1,
      normalCombatOwed: false, currentExtraCombat: null, // AFTER-MAIN FIDELITY (KT-7b): per-turn flags reset
      phase: "beginning",
      step: "untap",
      priorityHolder: null,
      consecutivePasses: 0,
    };
  }

  // End of turn — next player's turn begins at (beginning, untap): the player after the rotation anchor (above). The extra turns
  // are over, so the normal turn carries no anchor. With a seat record, the rotation walks it from the anchor's seat to the next
  // seat still in the game, and every departed seat it passes is a turn that doesn't begin (CR 800.4k).
  let nextActive = null;
  if (seatOrder && seatOrder.includes(anchor)) {
    const at = seatOrder.indexOf(anchor);
    for (let k = 1; k < seatOrder.length && nextActive == null; k++) {
      const seat = seatOrder[(at + k) % seatOrder.length];
      if (order.includes(seat)) nextActive = seat;
      else notBegun.push(seat);
    }
    // Every other seat is gone: the anchor's own turn again when they are still in the game (a one-seat order, nextInTurnOrder's
    // answer), else the turn order's first seat.
    if (nextActive == null) nextActive = order.includes(anchor) ? anchor : (order[0] ?? null);
  } else nextActive = nextInTurnOrder(state, anchor);
  const { rotationAnchor: _spentAnchor, ...rotated } = fresh;
  return {
    ...rotated,
    activePlayer: nextActive,
    extraTurnOf: null, // SHELF-85 V12: a normal rotation is nobody's extra turn
    ...withNotBegun(notBegun),
    turn: state.turn + 1,
    normalCombatOwed: false, currentExtraCombat: null, // AFTER-MAIN FIDELITY (KT-7b): per-turn flags reset
    phase: "beginning",
    step: "untap",
    priorityHolder: null,
    consecutivePasses: 0,
  };
}

/**
 * Apply the automatic actions for the current step:
 *   - untap: untap all active player's permanents, reset turn counters,
 *            empty active player's mana pool (technically end-of-prior-
 *            turn but practically same moment for v1)
 *   - draw: active player draws a card
 *   - cleanup: empties everyone's mana pool; placeholder for discard-
 *              to-7 (PR3 will handle when the engine knows hand max)
 *   - others: no automatic action; surface a priority window
 *
 * Returns a new state with the step's effects applied and priority
 * granted if applicable.
 */
export function runStepActions(state) {
  let next = state;
  let othersUntapStart; // case "untap": the board as the "during each other player's untap step" family begins

  switch (state.step) {
    case "untap":
      next = emptyManaPools(next);
      next = resetTurnCounters(next, { playerId: state.activePlayer });
      next = resetCardsDrawnAllPlayers(next); // TRIG-DRAW2: "draw your second card each turn" counts every seat's draws this turn
      next = resetSpellsCastAllPlayers(next); // TRIG-CAST2: ditto for "cast your second spell each turn"
      next = resetCreatureDeathsAllPlayers(next); // DEATHS-THIS-TURN: "for each / if a creature died this turn" counts every seat's deaths this turn
      next = resetAttackedThisTurnAllPlayers(next); // RAID: "you attacked this turn" — clear every seat's attack flag at untap
      next = resetBecameTargetThisTurnAllPlayers(next); // KIRA: "for the first time each turn" — clear every permanent's became-target flag at untap
      next = resetBecameTappedThisTurnAllPlayers(next); // CAP LIVING LEGEND: "first time that creature has become tapped this turn" — clear the per-permanent tap flag at untap
      next = { ...next, onceTriggersFiredThisTurn: {}, manaAddedByAbilityThisTurn: {} }; // ONCE-PER-TURN: clear per-source discover gates (Pantlaza, etc.) + the mana-added latch (Carpet of Flowers, KT-10a)
      // "UNTIL YOUR NEXT TURN" (goad CR 701.15a, detain CR 701.35a, CR 611.2a): the stored effects of this player's end as
      // their turn begins — before anything untaps — with the shield, the name locks and the damage replacements below.
      next = expireContinuousEffects(next, { atTurnBegin: { playerId: state.activePlayer, turn: state.turn } });
      // TEFERI'S PROTECTION (CR 702.26c / "until your next turn"): the active player's phased-out permanents phase
      // in BEFORE they untap (they return in the state they left, untapped by this same step if they were untapped),
      // and the player's shield expires at the same moment.
      next = phaseInAndExpireShield(next, state.activePlayer);
      // B4 (Reflector Mage — "until your next turn", CR 611.2a): the name cast locks THIS player set on an earlier turn end here.
      next = expireNameCastLocks(next, state.activePlayer);
      // Lightning, Army of One's Stagger ("until your next turn", CR 611.2a): the stored damage replacements this player created end here.
      next = expireDamageReplacementEffects(next, state.activePlayer);
      // The three sweeps above end a departed player's "until your next turn" effects when beginNextTurn named them in
      // `turnsNotBegun` (CR 800.4m — the turn they would have taken would have begun just now); the list is spent here.
      if (next.turnsNotBegun) { const { turnsNotBegun: _spent, ...rest } = next; next = rest; }
      next = untapAll(next, { playerId: state.activePlayer });
      // The board as the "during each other player's untap step" family begins: those untaps happen at the same time as the active
      // player's (CR 502.3 — the bundled rulings), once per permanent per step, so the last pass below skips what an earlier one met.
      othersUntapStart = next;
      // SEEDBORN-UNTAP (a targeted #319-style hook the trigger compiler can't reach): Seedborn Muse —
      // "Untap all permanents you control during each other player's untap step" — gives its controller an
      // ADDITIONAL untap during every OTHER player's untap step. There is no untap-others atom / "during each
      // other player's untap step" event in the vocabulary, so a dedicated synchronous hook untaps each
      // non-active watcher-controller's permanents here, right after the active player's own turn-based untap.
      // A no-op when no Seedborn-style watcher is on any non-active player's board (seedbornUntap.js).
      next = applySeedbornUntap(next, state.activePlayer);
      // MURKFIEND-UNTAP (same #319 phase-static family as Seedborn): Murkfiend Liege — "Untap all green
      // and/or blue creatures you control during each other player's untap step" — untaps only the
      // watcher-controller's green/blue CREATURES (layer-aware color+type), not all permanents. A no-op
      // when no Murkfiend-style watcher is on any non-active player's board (murkfiendUntap.js).
      next = applyMurkfiendUntap(next, state.activePlayer);
      // TYPE-FILTERED UNTAP (same #319 phase-static family, parameterized rather than a third twin):
      // Unwinding Clock "all artifacts", Drumbellower "all creatures", Prophet of Kruphix "all creatures
      // and lands". Layer-aware type read; a no-op when no such watcher sits on a non-active board.
      // + THE SELF MEMBER (play-weighted #558): "Untap this artifact during each other player's untap step." (Bender's Waterskin,
      // Thousand Moons Infantry, Endbringer) — the permanent the line is printed on, once per step even beside Seedborn Muse.
      next = applyTypeFilteredUntap(next, state.activePlayer, { stepStart: othersUntapStart });
      // BECOMES-UNTAPPED triggers (Mesmeric Orb — CR 502.4): drain the untap events recorded by untapAll +
      // the Seedborn/Murkfiend hooks into pending triggers HERE; they naturally wait for the upkeep's
      // priority to go on the stack (no priority exists during the untap step — CR-correct).
      next = checkUntapTriggers(next);
      next = logEvent(next, {
        kind: "step",
        phase: "beginning",
        step: "untap",
        player: state.activePlayer,
      });
      break;

    case "draw":
      // CR 103.8a: in a TWO-player game the starting player skips the draw step
      // of their first turn. CR 103.8c: MULTIPLAYER games don't skip — the 4-seat
      // Commander pod's starting player draws normally. Gate on turnOrder length
      // so only true 1v1 (Standard, or a 2-player duel) applies the skip.
      // SKIP YOUR DRAW STEP (CR 614.10 — RG-4, 2026-09-05): a static the ACTIVE player controls skips their own draw step —
      // no turn-based draw, no draw-step draw watcher. Logged beside the first-turn skip so the record reads the same way.
      if (skipsDrawStep(next, state.activePlayer)) {
        next = logEvent(next, {
          kind: "step",
          phase: "beginning",
          step: "draw",
          player: state.activePlayer,
          skipped: "static",
        });
      } else if (
        next.turn === 1 &&
        state.activePlayer === state.startingPlayer &&
        (state.turnOrder?.length || 0) === 2
      ) {
        next = logEvent(next, {
          kind: "step",
          phase: "beginning",
          step: "draw",
          player: state.activePlayer,
          skipped: "first-turn-draw",
        });
      } else {
        const drawnBefore = next.players[state.activePlayer].cardsDrawnThisTurn;
        // `drawStep: true` — the turn-based draw is the one a draw doubler ("except the first one you draw in each of your
        // draw steps") leaves alone; gameState.drawCards reads the flag (2026-09-05).
        next = drawCards(next, { playerId: state.activePlayer, count: 1, drawStep: true });
        // TRIG-DRAW (CR 121.1): the turn-based draw is a draw → fire "Whenever you draw a card". Guard on
        // the real delta so a decked-out draw step (drew 0) doesn't fire.
        if (next.players[state.activePlayer].cardsDrawnThisTurn > drawnBefore) {
          // V4 (2026-09-04): the turn-based draw is stamped as the draw step's FIRST draw — the one an "except the
          // first one they draw in each of their draw steps" watcher (Orcish Bowmasters) skips.
          next = checkCardDrawnTriggers(next, state.activePlayer, 1, { drawStepFirst: true });
        }
        next = logEvent(next, {
          kind: "step",
          phase: "beginning",
          step: "draw",
          player: state.activePlayer,
        });
      }
      // SAGA (CR 714.3b — Vault 12, SHELF S7): after the active player's draw step, each of their Sagas
      // gets a lore counter (through the doubler, CR 616 — Doubling Season can skip a chapter, correctly
      // firing every crossed number via the transition range). Runs on the SKIPPED first-turn draw too
      // (the rule keys on the step occurring, not on a card being drawn). The finished-Saga sweep does
      // NOT run here — the crossed chapter is pending, so CR 714.4's "no chapter ability on the stack or
      // pending" clause correctly defers the sacrifice to after it resolves.
      for (const sperm of [...(next.players[state.activePlayer]?.battlefield || [])]) {
        if (!sperm.sagaFinal) continue;
        const from = sperm.counters?.lore || 0;
        // addCounter applies the doubler INTERNALLY (the central counter chokepoint) — read the real
        // post-placement count back for the transition range, never pre-compute (a double-double FP).
        next = addCounter(next, { permanentId: sperm.id, type: "lore", amount: 1 });
        const after = (next.players[state.activePlayer]?.battlefield || []).find(
          (p) => p.id === sperm.id,
        );
        next = checkSagaChapterTriggers(next, sperm.id, from, after?.counters?.lore ?? from);
      }
      break;

    case "cleanup":
      // CR 514.1 (CR-remediation B3) — the FIRST cleanup action, mandatory, no stack: the active player
      // discards down to their maximum hand size. When over the max this raises the "cleanup-discard"
      // pendingChoice (the session driver settles it — human picker / AI lowest-value autopick) and the
      // settler (settleCleanupDiscardChoice) re-raises until the hand is legal, THEN runs the deferred
      // 514.2 tail (finishCleanupActions). At/under the max, the tail runs inline — byte-identical to
      // the pre-B3 flow.
      next = beginCleanupStep(next);
      break;

    case "beginning-of-combat":
      // Start each combat from a clean slate (ensureCombat never resets —
      // combat assignments would otherwise leak across turns and pile onto the
      // next attack). Defensively drop any stale removedFromCombat flags too
      // (end-of-combat is the real clearing point; this guards odd paths).
      next = { ...next, combat: { ...EMPTY_COMBAT } };
      next = clearRemovedFromCombatFlags(next);
      next = logEvent(next, {
        kind: "step",
        phase: "combat",
        step: "beginning-of-combat",
        player: state.activePlayer,
      });
      break;

    case "first-strike-damage":
      // First-strike + double-strike creatures deal here. The step exists only when a
      // combatant has first strike or double strike (CR 510.4 — advanceStep enters it
      // only then). Lethal first-strike damage kills before the regular step, so those
      // creatures never deal back.
      next = resolveCombatDamage(next, { firstStrikeStep: true });
      next = logEvent(next, {
        kind: "step",
        phase: "combat",
        step: "first-strike-damage",
        player: state.activePlayer,
      });
      break;

    case "combat-damage":
      // Regular combat damage: everyone WITHOUT first strike (plus double
      // strikers again). Kills lethally-damaged creatures, drops unblocked /
      // trample damage onto the defending player.
      next = resolveCombatDamage(next, { firstStrikeStep: false });
      next = logEvent(next, {
        kind: "step",
        phase: "combat",
        step: "combat-damage",
        player: state.activePlayer,
      });
      break;

    case "end-of-combat":
      next = { ...next, combat: { ...EMPTY_COMBAT } };
      // REGEN (CR 701.19a): removal-from-combat lasts only this combat — clear the per-permanent
      // removedFromCombat flag here so combatResolution stops skipping the creature in later combats.
      next = clearRemovedFromCombatFlags(next);
      // MANA-HOLD EXPIRY — "This mana lasts until end of combat" ends HERE. Clearing the hold (not the
      // pool) is deliberate: advanceStep's own emptyManaPools call, running as this step ends, is what
      // actually drains the mana, and it now sees hold=0. This is the ONE expiry point, and a combat-less
      // turn still reaches it — advanceStep skips the blockers/damage steps straight to end-of-combat
      // rather than past it, so the hold can never survive into a later turn.
      next = clearManaHolds(next);
      next = logEvent(next, {
        kind: "step",
        phase: "combat",
        step: "end-of-combat",
        player: state.activePlayer,
      });
      break;

    case "main": {
      // RAD-COUNTERS (CR 728.1 / 122.1i): the inherent radiation ability triggers at the beginning of a
      // player's PRECOMBAT main phase — that player mills cards equal to their rad counters; for each nonland
      // milled they lose 1 life and remove one rad counter (applyRadiation). Gate on phase (both main phases
      // share step "main"); applyRadiation no-ops at 0 counters. The postcombat main gets no automatic action.
      if (state.phase === "precombat-main") {
        const radBefore = state.players[state.activePlayer]?.radCounters || 0;
        // MILL-ON-EVENT (Wave 3b): the radiation ability is the SECOND real mill chokepoint (the rad payoff
        // mills `rad` cards — CR 728.1). applyRadiation lives in gameState.js, which can't import triggers.js
        // (cycle), so the milled-trigger bind fires HERE at the caller. Snapshot the cards it WILL mill (top
        // N, bounded by library size — the same Math.min applyRadiation uses) BEFORE the mill so their
        // front-face types are readable, then fire the bind for the active player's mill event after.
        const libBefore = state.players[state.activePlayer]?.library || [];
        const radMilled = libBefore.slice(0, Math.min(radBefore, libBefore.length));
        next = applyRadiation(next, { playerId: state.activePlayer });
        if (radBefore > 0)
          next = logEvent(next, {
            kind: "radiation",
            phase: state.phase,
            player: state.activePlayer,
            radCounters: radBefore,
          });
        if (radMilled.length > 0)
          next = checkMilledTriggers(next, {
            milledByPlayer: state.activePlayer,
            milledCards: radMilled,
          });
      }
      next = logEvent(next, {
        kind: "step",
        phase: state.phase,
        step: state.step,
        player: state.activePlayer,
      });
      break;
    }

    default:
      // upkeep, other combat steps — no automatic state mutation.
      next = logEvent(next, {
        kind: "step",
        phase: state.phase,
        step: state.step,
        player: state.activePlayer,
      });
      break;
  }

  // Step-boundary triggers (CR 603.2b), enqueued here, then flushed onto the stack below. Attack triggers are NOT
  // fired at a step entry: they fire when the attack declaration closes, inside the declare attackers step
  // (closeAttackDeclaration, CR 508.1m / 508.2), and resolve before the declare blockers step begins.
  // KW-FADING / KW-VANISHING (CR 702.32a / 702.63a): at the active player's upkeep, remove a fade/time
  // counter from each of their fading/vanishing permanents and sacrifice per the rule — BEFORE the upkeep
  // triggers flush, so a vanishing permanent's dies-trigger sits correctly in the queue.
  // DELAYED TRIGGERS (CR 603.7) — drain every ability a resolving spell/ability scheduled for THIS
  // step into pendingTriggers, so they ride the same flush→stack→resolve path as printed triggers.
  // Runs BEFORE the step's own trigger scan so a delayed ability and a printed one that share the
  // step enter the queue in creation order. Draining removes the record (fires once, then ceases).
  {
    const drained = drainDelayedTriggers(next, next.step, next.activePlayer);
    if (drained.fired.length) {
      next = { ...drained.state, pendingTriggers: [...(drained.state.pendingTriggers || []), ...drained.fired] };
    } else {
      next = drained.state;
    }
  }
  if (next.step === "upkeep") next = applyFadeVanishUpkeep(next);
  // KW-SUSPEND (CR 702.62a) — tick the active player's suspended exile cards beside the other
  // time-counter upkeep; a card reaching zero becomes castable FREE via legalChoices (the real path).
  if (next.step === "upkeep") next = applySuspendUpkeep(next);
  if (next.step === "upkeep") next = checkStepTriggers(next, "upkeep");
  else if (next.step === "draw") next = checkStepTriggers(next, "draw");
  else if (next.step === "end") {
    next = checkStepTriggers(next, "endStep");
    // WOLVERINE clause 2 (CR 603.4 intervening-if): "at the beginning of each end step, if Wolverine dealt
    // damage to another creature this turn, put a +1/+1 counter on him." Routed through addCounter so the
    // Wave-3 counter-doubler composes. A #353-style targeted hook (the templating is unique to Wolverine);
    // checked here because the intervening-if condition isn't in the generic trigger vocabulary. No-op when
    // no armed Wolverine is on the board → byte-identical.
    next = applyWolverineEndStep(next);
    // MONARCH (CR 725.3) — the monarch draws at the beginning of THEIR end step. No monarch → no-op.
    next = applyMonarchEndStepDraw(next);
  }
  // PHASE-TRIGGER-FRAMEWORK (Wave 1): emit the two phase-boundary triggers the spine detected but never
  // fired. detectPhaseTrigger (registered in triggers.js) classifies them; checkStepTriggers fires any
  // event generically (triggersForEvent matches on descriptor.event). Wired alongside the existing step
  // emissions and BEFORE the priority/flush block below so they ride the same flush onto the stack.
  //  - combatBegin: at the beginning-of-combat step. whose:"yours" ("...on your turn") gates to the active
  //    player in triggersForEvent; whose:"any" ("each combat", Unnatural Growth) fires regardless of turn.
  //  - firstMain: at the PRECOMBAT main only (gate on phase — both main phases share step "main"); else it
  //    would fire twice (a postcombat-main double-fire is the landmine here).
  else if (next.step === "beginning-of-combat") next = enterCombatPostProcess(next); // combatBegin triggers + Vihaan animate + the combat tally — the ONE entry for every combat phase, the additional ones included (2026-10-22)
  // VIHAAN-ANIMATE (a targeted #319-style hook the trigger compiler can't reach): at the beginning-of-combat
  // step, Vihaan, Goldwaker makes every Treasure the ACTIVE player controls a 3/3 Construct Assassin artifact
  // creature until end of turn — a MASS, optional, subject-scoped layer-4 animate the effect vocabulary can't
  // model (no mass-animate-your-permanents atom). Applied synchronously via the SHIPPED WALT-ANIMATE layer
  // framework (vihaanAnimate.js); a no-op when no Vihaan-style watcher is on the active player's board. Fired
  // right after the combatBegin step trigger so the now-creature Treasures are full combat participants for the
  // attack/block declarations that follow this step.
  // (the Vihaan animate runs inside enterCombatPostProcess — run once per beginning of combat step, here)
  if (next.phase === "precombat-main" && next.step === "main")
    next = checkStepTriggers(next, "firstMain");
  // secondMain (CR 505.1b) — the postcombat sibling. Gated on the PHASE for the same reason firstMain is:
  // both main phases share step "main", so a step-only gate fires at both and the "second main" trigger
  // would go off before combat as well. Michelangelo, the Heart is the shelf card behind it.
  if (next.phase === "postcombat-main" && next.step === "main")
    next = checkStepTriggers(next, "secondMain");
  if (next.step === "main" && (next.phase === "precombat-main" || next.phase === "postcombat-main"))
    next = checkStepTriggers(next, "anyMain"); // CARPET OF FLOWERS (KT-10a): "each of your main phases" — every main, extra ones included
  // THE BLOCK DECLARATION (CR 509.1). The declare blockers step begins with the defending players' block declaration, a
  // turn-based action during which no player has priority; it fires nothing on entry (the attack triggers and hooks resolved
  // in the declare attackers step: closeAttackDeclaration). The engine takes the declaration one declare-blocker action at a
  // time inside the step's first lap — the active player first, then each player in turn order, a defending player declaring
  // before it passes — and this mark keeps that lap a declaration: only blocks and the pass are offered (legalChoices). When
  // the lap ends, passPriority closes it (closeBlockDeclaration): the block triggers go on the stack, then the active player
  // receives priority (CR 509.2, 509.2a).
  if (next.step === "declare-blockers") next = { ...next, combat: { ...(next.combat || EMPTY_COMBAT), blockDeclarationOpen: true } };

  if (grantsPriority(next.step)) {
    next = grantPriority(next);
  }

  // Flush any pending triggers onto the stack at this priority-grant
  // checkpoint, per CR 603.3a — triggered abilities go on the stack at
  // the next time a player would get priority.
  next = flushTriggers(next, { chooseTargets: chooseTriggerTargets });
  next = openCleanupPriorityWindow(next); // CR 514.3a — a cleanup step whose flush stacked a trigger grants priority

  return next;
}

// ─── Cleanup step (CR 514, CR-remediation B3) ────────────────────────────────

const NO_MAX_HAND_RE = /you have no maximum hand size/i;
const MAX_HAND_RE = /maximum hand size/i;

/**
 * How many cards the player must discard at cleanup (CR 514.1). 0 when at/under the max. The maximum
 * is 7 unless a permanent the player controls prints "You have no maximum hand size." (Reliquary
 * Tower / Spellbook / Kruphix — the anchored-phrase leaf idiom, same as Strong's radiation
 * replacement). CONSERVATIVE GUARD (CREED): any OTHER "maximum hand size"-modifying text on ANY
 * battlefield (Cursed Rack's "is 4", reductions — shapes the engine can't attribute faithfully)
 * suspends enforcement for everyone rather than risk forcing a discard the real rules don't require —
 * a missed mandatory discard is the pre-B3 status quo; a wrong forced discard is a misplay.
 */
export function cleanupDiscardExcess(state, playerId) {
  const player = state.players?.[playerId];
  if (!player) return 0;
  const oracleOf = (p) => String(p?.card?.oracle || p?.card?.oracle_text || "");
  if (player.noMaxHandSizeForGame) return 0; // SEA GATE RESTORATION (BI-3): the spell-granted flag, for the rest of the game
  if ((player.battlefield || []).some((p) => NO_MAX_HAND_RE.test(oracleOf(p)))) return 0;
  // ⛔⛔ THE SUSPENSION IS NOW NARROW. It used to fire on ANY "maximum hand size" text anywhere on the
  // table and returned 0 for EVERY player — so a single Cursed Rack handed its OWN controller an unlimited
  // hand for the rest of the game. It still suspends, but only for text the engine genuinely cannot place:
  // the chosen-player / each-opponent forms, which need a binding the maxHandSize op doesn't carry.
  // ⓘ A line matching MODELLED_MAX_HAND_RE is READ (layers.maxHandSizeFor) rather than feared. That regex
  // is exported from staticAbilityParser as the SINGLE source of truth — a second copy here would drift,
  // and a drift means either a silently-unapplied maximum or a wrongly-suspended cleanup.
  for (const pl of Object.values(state.players)) {
    for (const p of pl.battlefield || []) {
      const o = oracleOf(p);
      if (!MAX_HAND_RE.test(o) || NO_MAX_HAND_RE.test(o)) continue;
      const unreadable = o.split("\n").some((line) => /maximum hand size/i.test(line)
        && !MODELLED_MAX_HAND_RE.test(line.trim().toLowerCase().replace(/\.\s*$/, "")));
      if (unreadable) return 0;
    }
  }
  return Math.max(0, (player.hand || []).length - maxHandSizeFor(state, playerId));
}

/**
 * The CR 514.2/514.3a cleanup tail — everything cleanup does AFTER the 514.1 hand-size discard:
 * damage wears off, per-turn flags reset, "until end of turn" effects expire, and the SBA fixpoint
 * re-checks the post-expiry board. Deferred behind the discard pendingChoice when one is raised;
 * run inline when the hand is already legal.
 */
export function finishCleanupActions(state) {
  // TURN-SCOPED COLOR HOLD (W11): strip manaHoldTurn BEFORE the cleanup drain below — "until end of
  // turn" ends here, so the held color empties with everything else (CR 514.2).
  let next = state;
  {
    const stripped = {};
    let touched = false;
    for (const pid of Object.keys(next.players)) {
      const p = next.players[pid];
      // + P·37: the until-end-of-turn hold on "this mana" (Birgi) ends here too.
      if ((p.manaHoldTurn && Object.keys(p.manaHoldTurn).length) || p.manaHoldEot) { stripped[pid] = { ...p, manaHoldTurn: {}, manaHoldEot: undefined }; touched = true; }
      else stripped[pid] = p;
    }
    if (touched) next = { ...next, players: stripped };
  }
  next = emptyManaPools(next);
  // POOL-RESTRICTED SUB-POOL (QUARTET Phase 4 — Klauth): the until-end-of-turn HELD entries survived
  // every step-end drain above; the turn ends HERE, so every entry drops (CR 514.2 + the printed
  // "until end of turn" bound on the hold itself) — unless Horizon Stone / Kruphix turns the mana the
  // player would lose colorless instead (stage ③ · 20): then each entry stays, colorless, restriction kept.
  {
    const cleared = {};
    let touched = false;
    for (const pid of Object.keys(next.players)) {
      const p = next.players[pid];
      if (Array.isArray(p.restrictedMana) && p.restrictedMana.length) {
        cleared[pid] = { ...p, restrictedMana: lostManaTurnsColorless(next, pid) ? p.restrictedMana.map(colorlessManaEntry) : [] };
        touched = true;
      } else cleared[pid] = p;
    }
    if (touched) next = { ...next, players: cleared };
  }
  next = clearCombatDamage(next); // combat damage wears off at end of turn
  next = clearWolverineTurnFlags(next); // WOLVERINE clause 2: reset the per-turn dealt-damage flag (CR 514.2)
  next = clearImpulsePlayPermissions(next); // IMPULSE-EXILE (CR 514.2): the "play that card this turn" permission lapses
  // "Until end of turn" continuous effects wear off here (CR 514.2) — pump
  // (Giant Growth etc.) registered as endOfTurn-duration layer effects expire. ("Until your next turn" does not: it ends
  // as that turn begins, in the untap step's sweep.)
  next = expireContinuousEffects(next, { atCleanupOfTurn: next.turn });
  // THREATEN (CR 514.2) — an "until end of turn" control change ends here too, with the pump it usually
  // travels with (Act of Treason grants haste in the same breath). Placed BEFORE the SBA fixpoint below
  // because sending a creature home can itself raise one: the original controller may already own a
  // legendary copy, and the legend rule is checked at 514.3a like any other.
  next = revertEndOfTurnControl(next);
  // CURSED MIRROR (CR 514.2) — a copy that lasts "until end of turn" ends here too: the permanent is its own card again, before the
  // state-based check below (an Aura or Equipment on the creature it was may now be on a non-creature, CR 704.5m / 704.5n).
  next = revertEndOfTurnCopies(next);
  // CR 514.3a (CR-remediation B2) — expiring UEOT effects can themselves cause SBAs (a creature whose
  // toughness the expired pump was propping up is now ≤0; an Equipment on a man-land whose animation
  // just ended sits on a non-creature). Checked and applied HERE, per the rule.
  next = checkAllStateBasedActions(next);
  return logEvent(next, {
    kind: "step",
    phase: "ending",
    step: "cleanup",
    player: next.activePlayer,
  });
}

/** Cleanup entry: the 514.1 discard check first, then the 514.2 tail (deferred when a choice is raised). */
function beginCleanupStep(state) {
  const excess = cleanupDiscardExcess(state, state.activePlayer);
  if (excess > 0) {
    const hand = state.players[state.activePlayer].hand || [];
    return setPendingCleanupDiscardChoice(state, {
      controller: state.activePlayer,
      candidates: hand.map((c) => ({ id: c.id, name: c.name })),
      count: excess,
    });
  }
  return finishCleanupActions(state);
}

/**
 * Settle one cleanup-discard pick: move the chosen card hand → graveyard, then either re-raise (still
 * over the max — CR 514.1 discards to the max, one pick at a time through the same seam) or run the
 * deferred cleanup tail. A stale id (card left the hand) discards nothing and re-derives from the live
 * hand — the mandatory discard can neither be skipped nor wedge.
 */
export function settleCleanupDiscardChoice(state, cardId) {
  const pc = state.pendingChoice;
  if (!pc || pc.kind !== "cleanup-discard") return state;
  const { pendingChoice: _drop, ...cleared } = state;
  let next = cleared;
  if ((next.players[pc.controller]?.hand || []).some((c) => c.id === cardId)) {
    next = moveCardToZone(next, {
      playerId: pc.controller,
      fromZone: "hand",
      toZone: "graveyard",
      cardId,
    });
    // The 514.1 discard IS a discard (CR 701.9a): "whenever you / an opponent discards" watchers trigger on it, and the
    // triggers go on the stack at the 514.3a check once the discards and the 514.2 tail are done (finalizeStackResolution).
    next = checkDiscardTriggers(next, pc.controller, [cardId]);
    next = logEvent(next, { kind: "cleanup-discard", controller: pc.controller, turn: next.turn });
  }
  const excess = cleanupDiscardExcess(next, pc.controller);
  if (excess > 0) {
    const hand = next.players[pc.controller].hand || [];
    return setPendingCleanupDiscardChoice(next, {
      controller: pc.controller,
      candidates: hand.map((c) => ({ id: c.id, name: c.name })),
      count: excess,
    });
  }
  return finishCleanupActions(next);
}

// ─── The attack declaration (CR 508.1, 508.2) ────────────────────────────────

/**
 * Is the declare attackers step's attack declaration still open — no action other than declaring an attacker taken in
 * the step yet? The declaration is recorded closed by combat.declaredAttackerCount (set by closeAttackDeclaration and
 * dropped with the rest of combat at the end of combat and the beginning of the next).
 */
export function attackDeclarationOpen(state) {
  return state.step === "declare-attackers" && state.combat?.declaredAttackerCount == null;
}

/**
 * ATTACK DECLARATION CLOSE (CR 508.1, 508.1m, 508.2, 117.5). The engine takes the active player's attacker declaration one
 * declare-attacker action at a time; in the rules it is ONE turn-based action, after which the abilities that triggered on
 * attackers being declared go on the stack and the active player gets priority — all inside the declare attackers step,
 * before the declare blockers step (whose first act is the defending player's block declaration, CR 509.1) can begin.
 * So the declaration closes at the first action of the step that is not an attacker declaration: the first pass
 * (passPriority), a spell or an ability (actionDispatcher.dispatchAction), or a forced advance (nextStep). Here:
 *   · the size of the declaration is recorded (combat.declaredAttackerCount) — it marks the declaration closed (no attacker
 *     is offered after it, legalChoices) and keeps the declare blockers and combat damage steps when every declared
 *     attacker has been removed from combat before the step ends (CR 508.8, advanceStep);
 *   · the attack triggers are enqueued from the declared batch (checkAttackTriggers), and the two attack hooks the trigger
 *     compiler cannot reach resolve: The Ur-Dragon's draw and put-onto-the-battlefield, and annihilator's sacrifice (an
 *     attack trigger too, CR 702.86a) — before any block, so a defender never blocks with a permanent it is about to
 *     sacrifice;
 *   · everything pending goes on the stack (CR 603.3), targets chosen as it does (CR 603.3d).
 * Returns { state, held, resolved }: `resolved` — a hook changed the board (or raised the defender's sacrifice choice);
 * `held` — that, or something went on the stack. When held, the active player receives priority in the declare attackers
 * step (CR 508.2) and the step ends only after the stack is empty and every player passes in succession (CR 500.2), so
 * every attack trigger resolves before blockers are declared. When nothing happened, the board is exactly as the active
 * player last saw it, and the action that closed the declaration stands.
 * The creatures a resolving attack trigger puts onto the battlefield attacking were never declared and trigger nothing
 * (CR 508.3a, 508.4): checkAttackTriggers runs once, here, against the declared batch.
 */
export function closeAttackDeclaration(state) {
  const declared = (state.combat?.attackers || []).length;
  const recorded = { ...state, combat: { ...state.combat, declaredAttackerCount: declared } };
  const triggered = checkAttackTriggers(recorded);
  // The Ur-Dragon variable-count attack trigger (a targeted #319-style hook the compiler can't reach): resolves
  // draw-that-many + may-put-a-permanent synchronously, enqueuing its cardDrawn / ETB sub-triggers for the flush below.
  // Fired AFTER checkAttackTriggers so its draw lands after the printed attack triggers' enqueue.
  // (The Wise Mothman's rad hook is GONE — SHELF C1's "enters or attacks" disjunction split binds the trigger generically
  // through detectTriggers, so the attack half rides checkAttackTriggers like any printed attack trigger. Keeping the
  // hook would double-fire the rad — the coordination note mothmanRad.js carried from day one.)
  let s = applyUrDragonAttackTriggers(triggered);
  // KW-ANNIHILATOR (CR 702.86a): "Whenever this creature attacks, defending player sacrifices N permanents." A #319-style
  // combat hook reusing the SHIPPED edict sacrifice chain — each attacking annihilator obligates its defending player to
  // sacrifice N permanents of their choice (pooled into one FIFO-safe chain). The human defender gets a real picker via
  // the learnSession sacrifice-choice loop; an AI auto-sacs its weakest. May set state.pendingChoice, which the session
  // driver settles before anything else happens. No-op when no annihilator is attacking (annihilator.js).
  s = applyAnnihilatorTriggers(s);
  const resolved = s !== triggered;
  s = flushTriggers(s, { chooseTargets: chooseTriggerTargets });
  const stacked = (s.stack?.length || 0) > (state.stack?.length || 0);
  return { state: s, held: stacked || resolved, resolved };
}

// ─── The block declaration (CR 509.1, 509.2, 509.2a) ─────────────────────────

/**
 * BLOCK TRIGGERS (CR 509.2a): the blocks are declared — fire the block / becomes-blocked / bushido / attacks-unblocked triggers
 * (checkBlockTriggers, from combat.blockers as applyDeclareBlocker recorded them) and put them on the stack. Once per combat:
 * combat._blockTriggersFired, dropped with the rest of combat at the end of combat. The open-declaration mark goes with it.
 * Shared by the declaration's close (passPriority) and a forced advance out of the step (nextStep).
 */
function fireBlockTriggers(state) {
  let s = state;
  if (state.combat?.blockDeclarationOpen) {
    const { blockDeclarationOpen: _closed, ...combat } = state.combat;
    s = { ...state, combat };
  }
  s = checkBlockTriggers(s);
  s = { ...s, combat: { ...(s.combat || {}), _blockTriggersFired: true } };
  return flushTriggers(s, { chooseTargets: chooseTriggerTargets });
}

/**
 * BLOCK DECLARATION CLOSE (CR 509.1, 509.2, 509.2a, 117.3a). In the rules the defending players declare blockers as ONE
 * turn-based action at the start of the declare blockers step, no player holding priority; then the abilities that triggered
 * on the declaration go on the stack and the active player gets priority. The engine takes the declaration one
 * declare-blocker action at a time inside the step's first lap (blockDeclarationOpen — only blocks and the pass are offered),
 * so it closes when every player has passed once since the step began (passPriority): each defending player has declared
 * its blocks, or none, and passed. The block triggers go on the stack, and the active player receives priority with the
 * pass count reset — the attacking player acts first on the declared blocks, then each other player in turn order, and the
 * step ends only when the stack is empty and all players pass in succession again (CR 117.4, 500.2). Nothing resolves
 * during the declaration: an object already on the stack when the step began is still there when priority opens.
 */
export function closeBlockDeclaration(state) {
  const s = fireBlockTriggers(state);
  return { ...s, priorityHolder: s.activePlayer, consecutivePasses: 0 };
}

/**
 * Advance one step and apply its automatic actions. The common
 * combination. Returns a fresh state at the new step with all
 * automatic effects applied + priority granted if applicable.
 */
export function nextStep(state) {
  // ATTACK DECLARATION (CR 508.2) — a forced advance out of an open declaration (the session's no-priority path; a caller
  // stepping the engine directly) closes it first, exactly as the active player's pass does in passPriority. If anything
  // triggered or resolved, HOLD in the declare attackers step with the active player's priority, the BLOCK TRIGGERS shape
  // below; otherwise advance.
  if (attackDeclarationOpen(state)) {
    const closed = closeAttackDeclaration(state);
    if (closed.held) return { ...closed.state, priorityHolder: closed.state.activePlayer, consecutivePasses: 0 };
    return runStepActions(advanceStep(closed.state));
  }
  // BLOCK TRIGGERS (CR 509.2a) on a FORCED advance out of the declare blockers step whose triggers have not fired (the
  // session's no-priority path; a caller stepping the engine directly; a state built inside the step after its declaration).
  // In play the declaration's close fires them (closeBlockDeclaration, from passPriority) and the step then ends here with the
  // flag set. Fire them (fireBlockTriggers — an open declaration ends with it) BEFORE advancing, so they resolve ahead of combat
  // damage: if any went on the stack, HOLD in declare-blockers with the active player's priority; if none, advance.
  if (state.step === "declare-blockers" && !state.combat?._blockTriggersFired) {
    const s = fireBlockTriggers(state);
    if ((s.stack?.length || 0) > (state.stack?.length || 0)) {
      return { ...s, priorityHolder: s.activePlayer, consecutivePasses: 0 };
    }
    return runStepActions(advanceStep(s));
  }
  return runStepActions(advanceStep(state));
}

// ─── Priority pass ────────────────────────────────────────────────────────────

/**
 * The current priority holder passes without taking an action. If both
 * players have passed in succession with an empty stack, the step
 * ends. If both have passed with a non-empty stack, the top object
 * resolves (via resolveTopOfStack) and priority resets to active.
 *
 * Returns a new state. May trigger:
 *   - step advancement (empty stack, both passed)
 *   - stack resolution (non-empty stack, both passed)
 *   - priority handoff to the other player (only one has passed)
 */
export function passPriority(state) {
  if (!state.priorityHolder) {
    throw new Error("passPriority called when no player holds priority");
  }
  // ATTACK DECLARATION (CR 508.1, 508.2): the first pass of the declare attackers step ends the active player's attacker
  // declaration. The attack triggers fire and go on the stack; if anything triggered or resolved, the active player gets
  // priority in the declare attackers step (the pass is spent closing the declaration) and the step holds until the
  // stack is empty and every player passes. If nothing did, the board is as the passing player saw it and the pass stands.
  let current = state;
  if (attackDeclarationOpen(state)) {
    const closed = closeAttackDeclaration(state);
    if (closed.held) return { ...closed.state, priorityHolder: closed.state.activePlayer, consecutivePasses: 0 };
    current = closed.state;
  }
  const passes = (current.consecutivePasses || 0) + 1;
  const newHolder = nextInTurnOrder(current, current.priorityHolder);

  // A step ends / the stack resolves only once every player has passed
  // in succession (CR 117.4 / 405.5). Standard = 2 seats; Commander = 4.
  // Any action taken resets consecutivePasses to 0, so this counts a
  // full lap of the table with no one acting.
  const playerCount = Object.keys(current.players).length;
  if (passes >= playerCount) {
    // THE BLOCK DECLARATION (CR 509.1, 509.2): the declare blockers step's first lap is the defending players' declaration,
    // not a round of priority. When every player has passed once it closes — the block triggers go on the stack and the
    // active player receives priority with the count reset (closeBlockDeclaration). Nothing resolves and the step goes on.
    if (blockDeclarationOpen(current)) return closeBlockDeclaration({ ...current, consecutivePasses: 0 });
    // Every player passed in succession.
    if (current.stack.length === 0) {
      // CR 514.3a — a cleanup step that granted priority ends into ANOTHER cleanup step (the hand-size check, the 514.2
      // tail and the trigger check all run again), never straight into the next turn.
      if (current.step === "cleanup") return runStepActions({ ...current, priorityHolder: null, consecutivePasses: 0 });
      // Empty stack — step ends. Advance to the next step + apply
      // its automatic actions.
      return nextStep({ ...current, priorityHolder: null, consecutivePasses: 0 });
    }
    // Non-empty stack — top resolves. resolveTopOfStack also resets
    // priority back to the active player.
    return resolveTopOfStack({ ...current, consecutivePasses: 0 });
  }

  return {
    ...current,
    priorityHolder: newHolder,
    consecutivePasses: passes,
  };
}

// ─── Stack resolution ────────────────────────────────────────────────────────

/**
 * Resolve the top object on the stack. v1 supports a "payload.onResolve"
 * function on stack objects — when present, it's called with state and
 * returns a new state. This is the escape valve for the engine: cards
 * the rules engine knows about supply onResolve directly; cards it
 * doesn't surface as an Arbiter-driven manual resolution.
 *
 * After resolution, priority resets to the active player.
 */
export function resolveTopOfStack(state) {
  if (state.stack.length === 0) throw new Error("Stack is empty — nothing to resolve");
  const top = state.stack[state.stack.length - 1];
  // A person's triggered ability still waiting for its targets has not finished being put on the stack (CR 601.2a–c via 603.3d):
  // the session driver asks before anyone receives priority, so reaching it here is an engine bug — surfaced, never resolved blind.
  if (top.awaitingTargets) throw new Error(`resolveTopOfStack: ${top.source?.name || "a triggered ability"} is still waiting for its controller to choose its targets`);
  const remainingStack = state.stack.slice(0, -1);

  // THE RESOLUTION WINDOW (gameState.openResolutionWindow, CR 704.4): while the resolver runs, an effect that leaves a creature with
  // lethal damage or toughness 0 does not destroy it — finalizeStackResolution's state-based check below does, after the
  // resolution's last step (an instant or sorcery into its owner's graveyard, CR 608.2n).
  let next = openResolutionWindow({ ...state, stack: remainingStack });

  // Phase-7 data-driven path: payload.resolver -> serializable registry. This is
  // checked FIRST; the legacy closure branch below is the additive fallback that
  // production stops using in PR-3 (kept thereafter for tests + the Arbiter
  // escape valve per D6). No production stack object sets payload.resolver until
  // PR-3, so existing behavior is byte-identical here.
  //
  // The two catches below are a reporting boundary, not a swallow (audited 2026-10-18): a resolver that throws
  // becomes a "stack-resolve-error" log entry, which breakageReport.aggregateBreakages (the Sim Center's breakage
  // table) and crucibleRun's breakage mining surface as a broken card, and which the resolver tests assert absent. A probe
  // over the full suite and an 80-game seeded batch saw no throw but the two tests that pin this path. The entry
  // names its card (`source`, the field the plain "stack-resolve" entry below carries) — without it the breakage
  // report filed every resolver crash under "(unknown card)".
  const resolver = getResolver(top.payload?.resolver);
  if (resolver) {
    try {
      next = resolver(next, top) || next;
    } catch (error) {
      next = logEvent(next, {
        kind: "stack-resolve-error",
        objectId: top.id,
        source: top.source?.name || top.source,
        error: String(error?.message || error),
      });
    }
  } else if (typeof top.payload?.onResolve === "function") {
    try {
      next = top.payload.onResolve(next, top) || next;
    } catch (error) {
      next = logEvent(next, {
        kind: "stack-resolve-error",
        objectId: top.id,
        source: top.source?.name || top.source,
        error: String(error?.message || error),
      });
    }
  } else {
    // No resolver and no closure — log that we resolved it and move on. The
    // Arbiter-driven escape hatch surfaces "unresolved" prompts to the user.
    next = logEvent(next, {
      kind: "stack-resolve",
      objectId: top.id,
      kindOfObject: top.kind,
      source: top.source?.name || top.source,
    });
  }

  // SHELF-85 V10 (2026-09-04): a TRIGGERED ability's resolution is counted per turn on its key (source permanent +
  // printed sentence, stamped at flush). Bumped AFTER the resolver ran, so "if this is the second time this ability
  // has resolved this turn" (evaluated during the resolution) reads the number of PRIOR resolutions — Scythecat Cub's
  // second landfall of the turn sees exactly one. Keyed by turn; nothing to reset.
  if (top.kind === "triggered-ability") {
    const key = top.payload?.params?.context?.abilityKey ?? top.payload?.params?.abilityKey ?? null;
    if (key) {
      const rec = next.abilityResolutionsThisTurn?.[key];
      const n = rec && rec.turn === next.turn ? rec.n + 1 : 1;
      next = { ...next, abilityResolutionsThisTurn: { ...(next.abilityResolutionsThisTurn || {}), [key]: { turn: next.turn, n } } };
    }
  }
  // Flush any triggers that fired as a result of resolution, then
  // restart the priority loop with the active player.
  return finalizeStackResolution(next);
}

/**
 * Finalize a stack resolution: flush any triggers the resolution enqueued onto the
 * stack (CR 603.3), then restart the priority loop at the active player if the step
 * grants priority. Extracted from resolveTopOfStack so the interactive-tutor RESUME
 * path (effects/runProgram.resolveTutorChoice runs the post-tutor atoms OUTSIDE
 * resolveTopOfStack) can run the SAME finalization — otherwise a trigger fired by a
 * resumed atom (e.g. a "[tutor] [destroy]" whose destroy kills a creature with a dies
 * trigger) would sit unflushed past the next priority window.
 */
export function finalizeStackResolution(state) {
  // CR 704.3 (CR-remediation B2) — the comprehensive SBA fixpoint runs BEFORE triggered abilities go on
  // the stack: a resolution's chain reactions (an anthem source dying dropping another creature to 0
  // toughness, a legend-rule duplicate, an orphaned Aura, +1/+1 / -1/-1 annihilation) settle here,
  // enqueueing their own triggers, which the flush below then stacks APNAP with the resolution's own.
  // The resolution window closes first: this is the check the resolution's effects left the lethal-damage and toughness
  // destruction to (CR 704.4). A resolution that paused on a choice is finalized here as it pauses, as before, so the check also
  // runs at the pause and the atoms after it destroy on the spot again (not covered — ENGINE-SCAFFOLD §4.5).
  let next = checkAllStateBasedActions(closeResolutionWindow(state));
  // SELF-LTB (Wave 4) — drain any LTB/leave events a resolution queued (gameState.detachPermanentFromAll
  // records them; the death paths drain via checkDiesTriggers, but a non-death battlefield exit — an Aura
  // bounced/exiled, or a direct Disenchant on an Aura whose effect path skipped checkDiesTriggers — reaches
  // here unflushed). Idempotent: a no-op when the queue is already empty, so it never double-fires.
  next = checkLeavesTriggers(next);
  // SAGA sweep (CR 714.4 — Vault 12, SHELF S7): a Saga whose lore count has reached its final chapter
  // and whose chapter abilities are ALL resolved (none pending, none on the stack) is SACRIFICED — run
  // BEFORE the flush so the sacrifice's own watchers ride this same flush. A Saga whose final chapter
  // is still pending/on the stack is correctly skipped here and swept after THAT resolution finalizes.
  next = sweepFinishedSagas(next);
  next = flushTriggers(next, { chooseTargets: chooseTriggerTargets });
  if (grantsPriority(next.step)) {
    next = resetPriorityLoop(next);
  }
  return openCleanupPriorityWindow(next); // CR 514.3a — open (or keep open) the cleanup window while its triggers resolve
}

/**
 * CR 714.4 — sacrifice each finished Saga: lore ≥ sagaFinal AND none of its chapter abilities pending or
 * on the stack. A state-based action that doesn't use the stack, so the sacrifice is THE one outside a
 * resolution (costSacrifice.sacrificePermanentForCost — it drains its own leave event): its types read as it
 * leaves, layer-aware (CR 603.10a), so a Saga some effect made a creature (Urza's Saga under Living Plane) is
 * sacrificed AS one and dies through gameState.deathLookback — its dies triggers, the deaths tally, a
 * replacement that keeps it out of the graveyard (CR 700.4) — where a Saga that is no creature fires only its
 * leave and sacrifice watchers, as before. Until 2026-10-17 this assumed a Saga is never a creature and moved it
 * by hand. Pure; a board with no finished Saga is a no-op.
 */
function sweepFinishedSagas(state) {
  let next = state;
  for (const pid of Object.keys(next.players || {})) {
    for (const perm of [...(next.players[pid]?.battlefield || [])]) {
      if (!perm.sagaFinal || (perm.counters?.lore || 0) < perm.sagaFinal) continue;
      const pendingOwn = (next.pendingTriggers || []).some(
        (t) => t.event === "sagaChapter" && t.source?.permanentId === perm.id,
      );
      const stackOwn = (next.stack || []).some(
        (o) =>
          o.payload?.params?.sourceId === perm.id ||
          o.payload?.params?.sourcePermanentId === perm.id,
      );
      if (pendingOwn || stackOwn) continue;
      // The live permanent (an earlier Saga's sacrifice this sweep may have changed the board). Its types as it leaves are the
      // helper's read: a printed Saga is no creature, whatever a double-faced card prints on its back face.
      const live = findPermanent(next, perm.id);
      if (!live) continue;
      next = sacrificePermanentForCost(next, live.controller, live.permanent);
      next = logEvent(next, {
        kind: "saga-sacrificed",
        cardName: perm.card?.name,
        controller: pid,
      });
    }
  }
  return next;
}

// ─── Triggered abilities ─────────────────────────────────────────────────────

/**
 * Add a trigger to the pending queue. Triggers are NOT placed on the
 * stack immediately — per CR 603.3a, they go on the stack at the next
 * priority-grant checkpoint. The engine flushes the queue inside
 * runStepActions, resolveTopOfStack, and explicit calls.
 *
 * `trigger` shape:
 *   { id, source, controller, description, payload }
 * `payload.onResolve` (optional) — same contract as a stack object's
 * onResolve.
 */
export function enqueueTrigger(state, trigger) {
  return {
    ...state,
    pendingTriggers: [...(state.pendingTriggers || []), trigger],
  };
}

/**
 * SOURCE-SCOPED TRIGGER MULTIPLIER (CR 603.x) — repeat each pending trigger once per matching static, keyed
 * on the trigger's SOURCE permanent rather than on the event that caused it. See the note at the call site
 * in flushTriggers for why this family is enforced here and not at the enqueue sites.
 *
 * Each extra instance is a distinct copy of the trigger ("that ability triggers an additional time" — CR
 * says an additional instance, not a modified one), pushed adjacent to its original so APNAP ordering keeps
 * them together — the same shape triggers.multiplyTriggers uses for the four event-scoped siblings.
 *
 * The count is memoized per SOURCE permanent, not per controller: two triggers from the same source get the
 * same multiplier, while two Allies with a Katara out are counted separately because the subject differs.
 */
function multiplySourceScopedTriggers(state, pending) {
  const cache = new Map();
  const countFor = (srcId) => {
    if (srcId == null) return 0;
    if (!cache.has(srcId)) cache.set(srcId, sourceTriggerMultiplierCount(state, srcId));
    return cache.get(srcId);
  };
  // Fast path: nothing on the board matches → return the original array untouched (byte-identical flush).
  let anyExtra = false;
  for (const t of pending) { if (countFor(t.source?.permanentId) > 0) { anyExtra = true; break; } }
  if (!anyExtra) return pending;
  const out = [];
  for (const t of pending) {
    out.push(t);
    const extra = countFor(t.source?.permanentId);
    for (let i = 0; i < extra; i++) out.push({ ...t });
  }
  return out;
}

/**
 * Order simultaneous triggers APNAP across ALL seats (CR 603.3b): active player
 * first, then the rest in turn order; FIFO within each controller — the order an
 * AI seat puts its own on the stack. A person chooses the order of theirs after
 * the batch is placed (markTriggerOrder → the trigger-order pause), among their
 * own positions, so APNAP across players stands. Triggers whose controller has
 * left the game (eliminated, CR 800.4a) are dropped because the rotation only
 * walks live seats. Generalizes the old 2-bucket split to the Commander 4-seat pod.
 */
function orderTriggersAPNAP(state, pending) {
  const order = state.turnOrder || Object.keys(state.players);
  const startIdx = order.indexOf(state.activePlayer);
  const rotated = startIdx >= 0 ? order.slice(startIdx).concat(order.slice(0, startIdx)) : order;
  const out = [];
  for (const pid of rotated) out.push(...pending.filter((t) => t.controller === pid));
  return out;
}

/**
 * The default flush-time target chooser: the FIRST legal candidate. It is always a
 * mechanically-legal pick (CR-valid, never a fabricated effect), just not yet an
 * optimized one — an enemy-aware AI chooser and a Beginner-interactive chooser slot
 * in later by passing `flushTriggers(state, { chooseTargets })`. Kept deterministic
 * so serialize→restore replays identically.
 */
function firstLegalChoice(candidates) {
  return candidates[0];
}

/**
 * The enemy/own chooser (chooseTriggerTargets) returns this sentinel when NO correct-side target is
 * legal AND the choice isn't forced — the ability is optional, "choose up to one", or a target's side
 * can't be read (pickForcedTriggerCandidate). buildTriggerStack then routes the trigger to the Arbiter
 * no-op and flushTriggers logs `trigger-no-safe-target`. A MANDATORY ability with only wrong-side
 * targets never gets this: it takes the least harmful legal target (CR 603.3d). Distinct from
 * `undefined`, which keeps the legacy "fall back to first-legal" contract for a generic / absent chooser.
 */
export const NO_SAFE_TARGET = Symbol("no-safe-trigger-target");

/**
 * A PERSON CHOOSES (CR 603.3d → 601.2c; CR 603.3c / 700.2b for a mode): the triggered ability's controller announces its targets
 * as it is put on the stack. For a seat a person plays (auraEntry.seatIsHuman — state.humanSeats, stamped by createLearnSession
 * below Expert), flushTriggers hands buildTriggerStack askControllerChooser instead of the automatic chooser. When there is a real
 * choice — two or more legal candidates, or a modal "choose up to one" with any — it answers ASK_CONTROLLER, and buildTriggerStack
 * returns the ability's payload with no target yet plus `ask: { candidates }`: the ability goes on the stack in its APNAP place
 * carrying `awaitingTargets` (CR 601.2a — an object is on the stack while its choices are made), and the session driver asks
 * (raiseTriggerTargetChoice → the trigger-target pause → settleTriggerTargetChoice). One candidate is no choice: the automatic
 * chooser takes it, as before. Every seat the AI plays never meets this sentinel, so its path is the one it took before.
 */
const ASK_CONTROLLER = Symbol("ask-trigger-controller");
function askControllerChooser(candidates, info) {
  if (candidates.length > 1 || (info?.program?.modal?.allowNone && candidates.length > 0)) return ASK_CONTROLLER;
  return chooseTriggerTargets(candidates, info);
}

/**
 * Build the serializable stack payload + chosen targets a pending trigger goes on the
 * stack with — or `null` to DROP it (CR 603.3d: a triggered ability that needs a target
 * with no legal target is removed from the stack, it never resolves).
 *
 * Routing (mirrors coverage.permanentTriggersCovered exactly so the metric can't drift
 * from the runtime):
 *  - HIGH, non-modal, NON-targeted, no intervening-if → EFFECT_PROGRAM, empty targets.
 *    Inherits the whole P2.x atom family (draw / token / each-opponent / …).
 *  - HIGH, non-modal, TARGETED, no intervening-if → enumerate the legal targets at
 *    flush time via expandCastChoices (CR 603.3d → 601.2c — targets chosen as the ability
 *    goes on the stack). No legal target → DROP; else the chooser picks (default first-legal)
 *    and the atomIndex-tagged targets ride onto the EFFECT_PROGRAM payload, so the
 *    interpreter binds each chosen target to its clause. A mandatory ability whose only
 *    legal targets are on the wrong side still takes one (`forced` on the result, logged
 *    by flushTriggers); one the chooser declines (NO_SAFE_TARGET) carries `noSafeTarget`
 *    with the Arbiter no-op, also logged.
 *  - everything else (MODAL fallthrough; INTERVENING-IF outside the strict evaluators;
 *    unparseable) → the manual/Arbiter no-op payload the trigger already carries
 *    (W4: the naive Phase-1 vocab is deleted), never a fabricated effect (CLAUDE.md §1.2).
 */
// Distinct sentinel for a CR 603.4 intervening-if condition-not-met removal — the ability is correctly NOT put
// on the stack, but this is EXPECTED (a false intervening-if), NOT a CR 603.3d no-legal-target fizzle. buildTriggerStack
// returns this instead of bare null so the caller logs `trigger-condition-not-met` (not `trigger-removed-no-target`),
// which kept polluting the no-target breakage pile (Garruk's Uprising 307×, Inventors' Fair 194×, … — all correct
// condition-skips, e.g. Garruk's ETB draw cast before a power-4 creature is out).
const TRIGGER_CONDITION_NOT_MET = Object.freeze({ removed: "intervening-if-not-met" });

function buildTriggerStack(state, trigger, chooseTargets) {
  if (trigger.reflexiveProgram) return buildReflexiveTriggerStack(state, trigger, chooseTargets);
  const clause = trigger.descriptor?.effectClause;

  // ===== UPKEEP-WIN (Wave 3b, CR 603.4) ===== — the win-game intervening-if family ("At the beginning of
  // your upkeep, IF you control ten or more Treasures, you win the game"). The general intervening-if path
  // routes ALL conditional triggers to the Arbiter no-op (a fail-open draw/lifegain is mostly harmless),
  // but a WIN must be modeled exactly: a fail-open here is an instant fake win (the cardinal FP). So handle
  // the win-game-with-intervening-if shape natively, with a STRICT condition evaluator (never fail-open):
  //   - parses to "you win the game" (a non-targeted win-game atom), AND
  //   - the threshold STRICTLY evaluates (true/false; null = unparsed → route to Arbiter, never fire).
  // CR 603.4 FIRST check: the condition is evaluated as the trigger WOULD go on the stack — false → DROP
  // (it never goes on the stack); true → it goes on the stack carrying `condition` for the resolution
  // re-check (the applyWinGame resolver re-evaluates, the SECOND CR 603.4 check, closing the premature-win FP).
  const interveningIf = trigger.descriptor?.interveningIf;
  if (clause && interveningIf) {
    const condProgram = parseEffectClause(clause, "Instant", {
      hasX: !!trigger.descriptor?.effectHasX,
    });
    const winAtom = condProgram?.atoms?.length === 1 ? condProgram.atoms[0] : null;
    if (
      winAtom &&
      winAtom.op === "win-game" &&
      winAtom.who === "controller" &&
      programConfidence(condProgram) === "high"
    ) {
      const met = evaluateWinThreshold(state, interveningIf, trigger.controller);
      if (met === null) {
        // The condition is outside the strict vocabulary — never fail-open a win → Arbiter no-op (SAFE FN).
        return { payload: { resolver: "manual" }, targets: [] };
      }
      if (met !== true) {
        // CR 603.4 — condition not met at the trigger event → the ability never goes on the stack.
        // Sentinel, not bare null (R1.3): bare null logs as `trigger-removed-no-target` and pollutes
        // the breakage queue that ranks the corpus roadmap; this is a CORRECT skip (same as ~729).
        return TRIGGER_CONDITION_NOT_MET;
      }
      // Met: route the win-game atom natively, binding the intervening-if onto it for the CR 603.4
      // resolution re-check (applyWinGame re-evaluates; if a Treasure was sac'd in response, no win).
      const boundProgram = { ...condProgram, atoms: [{ ...winAtom, condition: interveningIf }] };
      return {
        payload: {
          resolver: "effect-program",
          params: {
            program: boundProgram,
            controller: trigger.controller,
            context: trigger.context,
            sourceId: trigger.source?.permanentId,
            targets: [],
          },
        },
        targets: [],
      };
    }
    // ===== INTERVENING-IF (general board-query, CR 603.4) ===== a NON-win-game conditional trigger whose
    // condition the STRICT board-query evaluator can read (interveningIf.js). Mirrors the win-game shape:
    // CR 603.4 FIRST check at flush — null (unparsed) → Arbiter no-op; false (not met) → DROP (never goes
    // on the stack); true → route the HIGH effect program natively, binding the condition onto params for
    // the resolution re-check (resolvers EFFECT_PROGRAM re-evaluates, the SECOND CR 603.4 check). The
    // effect must itself be HIGH + non-modal + target-resolvable (the same α1 allowlist the no-condition
    // path uses below) — else the conditional trigger stays on the Arbiter (false-negative SAFE).
    else if (interveningIfParseable(interveningIf)) {
      // Pass trigger.context so a per-PERMANENT condition (SAME-NAME ETB — Guardian Project) can read the
      // entering permanent (ctx.triggeringPermanentId). Board-count conditions ignore it.
      const met = evaluateInterveningIf(state, interveningIf, trigger.controller, trigger.context);
      if (met === null) return { payload: { resolver: "manual" }, targets: [] };
      if (met !== true) return TRIGGER_CONDITION_NOT_MET; // CR 603.4 — condition not met → the ability never goes on the stack (a correct skip, NOT a no-target fizzle)
      if (
        condProgram &&
        programConfidence(condProgram) === "high" &&
        condProgram.structure !== "modal" &&
        (!programNeedsChosenTarget(condProgram) || programTriggerTargetsResolvable(condProgram)) &&
        combatDamageReferentSatisfied(condProgram, trigger.descriptor?.event)
      ) {
        const baseParams = {
          program: condProgram,
          controller: trigger.controller,
          context: trigger.context,
          sourceId: trigger.source?.permanentId,
          condition: interveningIf,
        };
        if (!programNeedsChosenTarget(condProgram)) {
          return {
            payload: { resolver: "effect-program", params: { ...baseParams, targets: [] } },
            targets: [],
          };
        }
        const candidates = expandTriggerChoices(state, trigger.controller, condProgram, {
          ...(trigger.context || {}),
          sourceId: trigger.context?.sourceId ?? trigger.source?.permanentId ?? null,
        });
        if (candidates.length === 0) return null; // no legal target → removed (CR 603.3d)
        const picked =
          typeof chooseTargets === "function"
            ? chooseTargets(candidates, { trigger, program: condProgram, state })
            : undefined;
        if (picked === ASK_CONTROLLER) return { payload: { resolver: "effect-program", params: { ...baseParams, targets: [] } }, targets: [], ask: { candidates } };
        if (picked === NO_SAFE_TARGET) return { payload: { resolver: "manual" }, targets: [], noSafeTarget: true };
        const choice =
          typeof picked === "number" && candidates[picked]
            ? candidates[picked]
            : picked && Array.isArray(picked.targets)
              ? picked
              : firstLegalChoice(candidates);
        const targets = choice?.targets || [];
        return {
          payload: { resolver: "effect-program", params: { ...baseParams, targets } },
          targets,
          forced: !!choice?.forced,
        };
      }
      // Condition met but the effect isn't fully modeled (LOW / ambiguous target) → Arbiter no-op (FN-safe).
      return { payload: { resolver: "manual" }, targets: [] };
    }
    // Any OTHER intervening-if trigger keeps the existing behavior (falls through to the Arbiter no-op below).
  }

  if (clause && !trigger.descriptor?.interveningIf) {
    // Parse the trigger's effect clause as spell-like text: a triggered ability's
    // effect resolves exactly as a spell would, and the legacy effect parser
    // (spellEffects.parseSpellEffect) only engages for Instant/Sorcery types — so
    // pass "Instant" to unlock draw/damage/destroy off a permanent source.
    // SELF-CAST (CR 603.2): descriptor.effectHasX (set only for an {X}-spell self-cast trigger) unlocks the
    // half-X/X-amount clause parsers so Hydroid Krasis's "gain half X life and draw half X cards" parses HIGH;
    // every other trigger leaves it undefined → hasX:false → byte-identical.
    const program = parseEffectClause(clause, "Instant", {
      hasX: !!trigger.descriptor?.effectHasX,
      // A TRIGGER resolves with its SOURCE permanent in context — triggers.js threads sourcePermanentId and
      // runProgram passes that same context to evaluateInterveningIf — so a source-dependent atom condition
      // is answerable here in a way a resolving SPELL's is not. See conditionReadableHere in parser.js.
      sourceScoped: true,
    });
    // α1 ALLOWLIST: route a HIGH non-modal trigger natively only when every chosen-target atom is
    // intent-resolvable — i.e. the enemy/own chooser (chooseTriggerTargets, wired in at the live
    // flush call-sites) can prove a correct-side pick: removal/damage/counter/tap/-X-X → an opponent,
    // a buff/+1/+1/untap/graveyard-return → the controller's own. An AMBIGUOUS atom (bounce, or any
    // unmodeled-intent targeting atom) falls through to the Arbiter no-op below rather than risk a
    // first-legal friendly target (CLAUDE.md §1.2). Non-targeted programs always route (no chosen
    // target to mis-pick). This SUBSUMES the old counter / chosen-permanent-removal denylist AND
    // closes the latent first-legal-friendly hazard on unrestricted creature-destroy / damage triggers.
    if (
      program &&
      programConfidence(program) === "high" &&
      program.structure !== "modal" &&
      (!programNeedsChosenTarget(program) || programTriggerTargetsResolvable(program)) &&
      combatDamageReferentSatisfied(program, trigger.descriptor?.event)
    ) {
      // sourceId = the trigger's SOURCE permanent (CR 113.7) — lets a "this creature gets …" /
      // "put a +1/+1 counter on this creature" self atom resolve to the source on the non-targeted path.
      // SELF-CAST (CR 603.2): a "When you cast this spell, …" trigger threads the cast's chosen X via
      // trigger.context.xValue so a half-X / X-amount payoff (Hydroid Krasis "gain half X life and draw half
      // X cards") resolves at the real X — runEffectProgram reads params.xValue. A no-op for every other
      // trigger (none set context.xValue → xValue stays undefined → the FIXED-N / for-each amount resolvers
      // are byte-identical).
      const baseParams = {
        program,
        controller: trigger.controller,
        context: trigger.context,
        sourceId: trigger.source?.permanentId,
        xValue: trigger.context?.xValue ?? null,
      };
      if (!programNeedsChosenTarget(program)) {
        return {
          payload: { resolver: "effect-program", params: { ...baseParams, targets: [] } },
          targets: [],
        };
      }
      // Targeted trigger: choose targets as it's put on the stack (CR 603.3d → 601.2c). The
      // restriction-aware enumerator (expandCastChoices → enumerateTargets) only
      // surfaces LEGAL targets, so a restricted clause ("…an opponent controls")
      // never offers an illegal pick. trigger.context is threaded so a who:"defendingPlayer"
      // restriction ("… defending player controls" — Kogla's attacks trigger) enumerates
      // ONLY the attacked player's permanents (ctx.defenderId, set by checkAttackTriggers).
      // SOURCE THREADING (skeptic-caught FP): excludeSource/notSource restrictions ("another target ...")
      // were inert on the TRIGGER path — ctx carried no sourceId, so Prowler's counter landed on Prowler.
      // Thread the trigger's source permanent (the same id baseParams carries) into the enumeration ctx.
      const candidates = expandTriggerChoices(state, trigger.controller, program, {
        ...(trigger.context || {}),
        sourceId: trigger.context?.sourceId ?? trigger.source?.permanentId ?? null,
      });
      if (candidates.length === 0) return null; // no legal target → removed from the stack (CR 603.3d)
      const picked =
        typeof chooseTargets === "function"
          ? chooseTargets(candidates, { trigger, program, state })
          : undefined;
      // NO_SAFE_TARGET: no correct-side target AND the choice isn't forced (an optional ability — its
      // controller declines, CR 603.5) → the Arbiter no-op, logged by flushTriggers. A MANDATORY ability
      // with only wrong-side targets never gets here: the chooser returns its least harmful legal
      // candidate marked `forced` (CR 603.3d). A numeric index or a candidate object is honored; anything
      // else (a generic / absent chooser) keeps the legacy first-legal pick. ASK_CONTROLLER: a person's seat chooses (above).
      if (picked === ASK_CONTROLLER) return { payload: { resolver: "effect-program", params: { ...baseParams, targets: [] } }, targets: [], ask: { candidates } };
      if (picked === NO_SAFE_TARGET) return { payload: { resolver: "manual" }, targets: [], noSafeTarget: true };
      const choice =
        typeof picked === "number" && candidates[picked]
          ? candidates[picked]
          : picked && Array.isArray(picked.targets)
            ? picked
            : firstLegalChoice(candidates);
      const targets = choice?.targets || [];
      return {
        payload: { resolver: "effect-program", params: { ...baseParams, targets } },
        targets,
        forced: !!choice?.forced,
      };
    }
    // ===== MODAL TRIGGER (CR 700.2) ===== a "choose one/two/one or more/… —" triggered ability where EVERY
    // mode parses HIGH (the parser's all-or-nothing modal gate — one unmodeled mode → LOW → handled below)
    // AND every mode's chosen-target atoms are intent-resolvable (the α1 allowlist, flattened across modes by
    // programTriggerTargetsResolvable — an ambiguous mode keeps the WHOLE card on the Arbiter). The CONTROLLER
    // chooses the mode (CR 601.3b / 700.2); here the AI picks a sensible legal one: expandCastChoices enumerates
    // (mode × legal-target-combo) candidates — a mode with no legal target is simply NOT offered (CR 700.2d) —
    // and the enemy/own chooser picks the first candidate whose targets all sit on their atom's correct side.
    // The chosen mode + its targets ride onto the EFFECT_PROGRAM payload as `chosenMode`; the executor
    // (runProgram.programAtoms) resolves ONLY that mode's atoms, so a mode the player didn't pick never fires.
    // CHOOSE-ONE PARTIAL (BLITZ ML-1, CR 700.2b): a single-pick "choose one" also routes when only SOME modes
    // are resolvable (modalChooseOneRoutable) — chooseTriggerTargets skips the ambiguous-mode candidates (its
    // targetOk rejects ambiguous atoms) and picks a resolvable mode; if none is safe → NO_SAFE_TARGET →
    // Arbiter below. triggerRouting.triggerRoutesNatively mirrors this exact gate so the metric can't drift.
    if (
      program &&
      programConfidence(program) === "high" &&
      program.structure === "modal" &&
      (!programNeedsChosenTarget(program) ||
        programTriggerTargetsResolvable(program) ||
        modalChooseOneRoutable(program)) &&
      combatDamageReferentSatisfied(program, trigger.descriptor?.event)
    ) {
      let candidates = expandTriggerChoices(state, trigger.controller, program, {
        ...(trigger.context || {}),
        sourceId: trigger.context?.sourceId ?? trigger.source?.permanentId ?? null,
      });
      // MODE-MEMORY (Teval's Judgment, 2026-08-15): "choose one that hasn't been chosen this turn" —
      // drop every candidate whose mode is already in the per-source ledger (stamped at RESOLUTION by
      // runProgram's modal exec, cleared at untap like every once-latch). All modes exhausted → the
      // ability can't choose a legal mode → the same removal path directly below.
      if (program.modal?.modeMemoryPerTurn) {
        const srcId = trigger.source?.permanentId ?? trigger.context?.sourceId ?? null;
        if (srcId) {
          candidates = candidates.filter((c) => !state.onceTriggersFiredThisTurn?.[`${srcId}_mode${c.chosenMode}`]);
        }
      }
      // No mode is castable (every mode needs a target none of which is legal) → the ability is removed
      // from the stack (CR 603.3c / 700.2d). A non-targeted mode is always castable, so this only fires
      // when EVERY mode is fully target-gated and unsatisfiable.
      if (candidates.length === 0) return null;
      const picked =
        typeof chooseTargets === "function"
          ? chooseTargets(candidates, { trigger, program, state })
          : undefined;
      // No mode resolves to a provably-correct-side target (every mode is targeted + mis-sideable). A non-targeted mode
      // would be a safe candidate, so this only happens when no safe mode exists at all. A MANDATORY choice is forced
      // (the chooser's least harmful candidate, CR 603.3d); NO_SAFE_TARGET means it wasn't — an optional mode the
      // controller declines (CR 603.5) or only modes whose side can't be read → the Arbiter no-op, logged by flushTriggers.
      // CHOOSE UP TO ONE (play-weighted P·18 — Hullbreaker Horror): "none" is a legal choice, and it is the right one when every
      // candidate would hit your own side — no mode is chosen, so the ability is removed from the stack (CR 603.3c).
      // ASK_CONTROLLER: a person's seat chooses the mode and its targets (above); `chosenMode` is filled with the answer.
      if (picked === ASK_CONTROLLER) {
        return {
          payload: { resolver: "effect-program", params: { program, controller: trigger.controller, context: trigger.context, sourceId: trigger.source?.permanentId, chosenMode: null, targets: [] } },
          targets: [],
          ask: { candidates, allowNone: !!program.modal?.allowNone },
        };
      }
      if (picked === NO_SAFE_TARGET) return program.modal?.allowNone ? null : { payload: { resolver: "manual" }, targets: [], noSafeTarget: true };
      const choice =
        typeof picked === "number" && candidates[picked]
          ? candidates[picked]
          : picked && (Array.isArray(picked.targets) || picked.chosenMode != null)
            ? picked
            : firstLegalChoice(candidates);
      const targets = choice?.targets || [];
      return {
        payload: {
          resolver: "effect-program",
          params: {
            program,
            controller: trigger.controller,
            context: trigger.context,
            sourceId: trigger.source?.permanentId,
            chosenMode: choice.chosenMode,
            targets,
          },
        },
        targets,
        forced: !!choice?.forced,
      };
    }
    // Route to a NO-OP (NOT the unanchored legacy fallback, which would sub-phrase-match a partial)
    // when, non-modal, the program is either:
    //   - LOW = a trigger whose effect ISN'T fully modeled (an unmodeled clause or a follow-up like
    //     "… If a land card was milled this way, you gain 2 life"); the rich parser is a superset of
    //     the legacy vocab, so LOW means genuinely unmodeled; or
    //   - HIGH but carries an AMBIGUOUS chosen target (e.g. bounce) the α1 chooser can't place on a
    //     provably-correct side — firing it with first-legal could hit the controller's OWN
    //     permanent. Explicit no-op (→ Arbiter); false-negative SAFE.
    //   - HIGH but carries a COMBAT-DAMAGE referent (who:"damagedPlayer" / "that many") on a NON-combat
    //     event (Memory Erosion's CAST "that player mills two cards"): the referent is unset, so resolving
    //     it would silently drop the clause. Explicit no-op (→ Arbiter); false-negative SAFE (CREED).
    // (MODAL / intervening-if still use the fallback below — that's deliberate.)
    if (
      program.structure !== "modal" &&
      (programConfidence(program) === "low" ||
        (programNeedsChosenTarget(program) && !programTriggerTargetsResolvable(program)) ||
        !combatDamageReferentSatisfied(program, trigger.descriptor?.event))
    ) {
      return { payload: { resolver: "manual" }, targets: [] };
    }
  }
  // W4: the naive TRIGGER_EFFECT lane is retired — makePendingTrigger emits a manual payload directly,
  // so a trigger the rich paths above could NOT faithfully resolve (intervening-if outside the strict
  // evaluators, HIGH modal fallthrough, LOW/unparseable clause) falls through here already carrying the
  // Arbiter-safe manual no-op (false-negative SAFE, CLAUDE.md §1.2). DEFENSIVE: a stray legacy
  // "trigger.effect" payload (an old serialized game restored mid-stack) is normalized to manual rather
  // than resolved through a deleted vocabulary.
  if (trigger.payload?.resolver === "trigger.effect") {
    return { payload: { resolver: "manual" }, targets: [] };
  }
  return { payload: trigger.payload || {}, targets: trigger.targets || [] };
}

/**
 * A REFLEXIVE TRIGGERED ABILITY goes on the stack (CR 603.12 — runProgram.enqueueReflexiveTrigger queued it when the parent's action
 * happened): its targets are chosen now, against the game after that action (CR 603.3d → 601.2c), by the same enumeration and
 * chooser every targeted trigger uses; no legal target → removed (null — flushTriggers logs it). Its program is already parsed and
 * vetted: the parent routed natively, and the parser marked only a reflexive whose every target the chooser can place on a side.
 */
function buildReflexiveTriggerStack(state, trigger, chooseTargets) {
  const program = trigger.reflexiveProgram;
  const sourceId = trigger.source?.permanentId ?? null;
  const params = { program, controller: trigger.controller, context: trigger.context, sourceId, xValue: trigger.xValue ?? null };
  const candidates = expandTriggerChoices(state, trigger.controller, program, { ...(trigger.context || {}), sourceId: trigger.context?.sourceId ?? sourceId });
  if (candidates.length === 0) return null;
  const picked = typeof chooseTargets === "function" ? chooseTargets(candidates, { trigger, program, state }) : undefined;
  if (picked === ASK_CONTROLLER) return { payload: { resolver: "effect-program", params: { ...params, targets: [] } }, targets: [], ask: { candidates } };
  if (picked === NO_SAFE_TARGET) return { payload: { resolver: "manual" }, targets: [], noSafeTarget: true };
  const choice =
    typeof picked === "number" && candidates[picked]
      ? candidates[picked]
      : picked && Array.isArray(picked.targets)
        ? picked
        : firstLegalChoice(candidates);
  const targets = choice?.targets || [];
  return { payload: { resolver: "effect-program", params: { ...params, targets } }, targets, forced: !!choice?.forced };
}

/**
 * FLICKER TARGETS (shelf D21) — the trigger chooser's pick when a program's one targeted atom is a blink. Each candidate
 * permanent scores what flickering it gains (it returns as a new object, CR 400.7): its enters abilities fire again (+3), it
 * returns untapped (+1), attachments on it fall off — an opponent's (+3) or its controller's own (−2) — an attached Equipment
 * comes off its creature (−2), and counters go: −1/−1 (+1 each), +1/+1 (−1 each), a planeswalker's loyalty back to its
 * starting number (the difference, either way). A token that leaves is gone for good (CR 111.8) and is never chosen, nor is a
 * permanent that would come back under another player's control (Brago's "under their owner's control" — one you took goes
 * home; 2026-10-16). (A commander is fine: it is back on the battlefield before the CR 903.9a state-based action could send it
 * to the command zone.)
 * "UP TO" flickers only what gains (possibly nothing); a mandatory single target takes the best on offer.
 * "ANY NUMBER" (Brago, King Eternal) flickers EVERYTHING that has no reason against it — Colton's rule, 2026-10-03: "unless
 * there's a reason not to, you blink everything every time". A reason against is a negative score: a token, counters or
 * loyalty that would be lost, an attachment left behind. A permanent with nothing to gain and nothing to lose goes too.
 * The expander orders subsets MAXIMAL-first (targeting.expandAtoms), so for "any number" the first candidate already holds
 * every legal target: the set is filtered out of it, whatever the 64-option cap dropped from the middle sizes. Null when the
 * program isn't a lone blink.
 * AN AURA (2026-10-16) comes back choosing what it enchants (CR 303.4f), so what flickering it gains is the RE-AIM: the host the
 * return will choose (auraEntry.chooseAuraEntryHost) scored against its current host by the same policy — your Pacifism from an
 * opponent's 2-power creature to their 6-power one is +4, back onto the same creature 0. Both are read on the board the return
 * will see, with the leaving permanents exiled (so never one returning at the same time — the bundled Brago ruling — and no host
 * counted with this Aura's own bonus on it). A reason against: nothing to come back to (it would stay exiled, CR 303.4g), or a
 * side the policy can't read. One whose host is leaving too would fall off with it, so its baseline there is 0 (losing it).
 * For "any number", the permanents are decided first and every Aura after, against them.
 */
function pickFlickerCandidate(state, controller, safe, program) {
  // (A modal program's top-level atoms are empty — its modes carry them — so it never reaches the flicker pick.)
  const targeted = (program?.atoms || []).filter((a) => a?.targetType);
  if (targeted.length !== 1 || targeted[0].op !== "blink") return null;
  const blink = targeted[0];
  const isAura = (p) => /\bAura\b/.test(String(p.card?.type || p.card?.type_line || "").split(" // ")[0]);
  // The board as the return begins: every leaving permanent exiled (the blink's own exile — effects/atoms/zones.applyBlink).
  const exiled = (ids) => [...ids].reduce((s, id) => {
    const lk = findPermanent(s, id);
    return lk ? moveCardToZone(s, { playerId: lk.controller, fromZone: "battlefield", toZone: "exile", cardId: id }) : s;
  }, state);
  const reaimGain = (p, onReturn) => {
    const hostController = p.attachedTo ? findPermanent(state, p.attachedTo)?.controller ?? null : null;
    const sideHint = hostController ? (hostController === controller ? "own" : "enemy") : null; // as applyBlink passes it
    const choice = chooseAuraEntryHost(onReturn, p.card, controller, { sideHint });
    if (!choice.hostId || !choice.intent) return -Infinity;
    const host = p.attachedTo ? findPermanent(onReturn, p.attachedTo) : null;
    const before = host ? auraEntryHostScore(onReturn, p.card, controller, { id: p.attachedTo, controller: host.controller }, { sideHint }) : 0;
    return choice.score - before;
  };
  // `onReturn`: the board the return sees when this target leaves (alone, unless the any-number pick passes the whole set's).
  const gain = (t, onReturn = null) => {
    const lk = findPermanent(state, t.id); // an enumerated target is on the battlefield by construction
    const p = lk.permanent;
    if (p.card?.token || p.token) return -Infinity;
    // Brago returns cards "under their owner's control": a permanent you took goes home, lost to you.
    if (blink.returnTo === "owner" && (p.owner || lk.controller) !== controller) return -Infinity;
    let g = detectTriggers(p.card).some((d) => d.event === "etb" && d.scope === "self") ? 3 : 0;
    if (p.tapped) g += 1;
    if (isAura(p)) g += reaimGain(p, onReturn || exiled([t.id]));
    else if (p.attachedTo) g -= 2;
    g += (p.counters?.["-1/-1"] || 0) - (p.counters?.["+1/+1"] || 0);
    // A planeswalker returns with its STARTING loyalty (CR 306.5b): above it, the surplus is lost; below it, the reset gains.
    const loyaltyNow = p.counters?.loyalty;
    const loyaltyStart = startingLoyalty(p.card);
    if (loyaltyNow != null && loyaltyStart != null) g += loyaltyStart - loyaltyNow;
    for (const id of p.attachments || []) {
      const a = findPermanent(state, id);
      if (a) g += a.controller === controller ? -2 : 3;
    }
    return g;
  };
  const size = (c) => (c.targets || []).length;
  const empty = safe.find((c) => size(c) === 0) || null;
  if (blink.anyNumber) {
    const full = safe[0]; // maximal-first: every legal target
    const all = full.targets || [];
    const auraTargets = all.filter((t) => isAura(findPermanent(state, t.id).permanent));
    const going = new Set(all.filter((t) => !auraTargets.includes(t) && gain(t) >= 0).map((t) => t.id)); // everything with no reason against it
    const onReturn = exiled([...going, ...auraTargets.map((t) => t.id)]);
    for (const t of auraTargets) if (gain(t, onReturn) >= 0) going.add(t.id);
    return { ...full, targets: all.filter((t) => going.has(t.id)) };
  }
  const total = (c) => (c.targets || []).reduce((s, t) => s + gain(t), 0);
  const best = safe.filter((c) => size(c) > 0).reduce((a, c) => (a == null || total(c) > total(a) ? c : a), null);
  // A mandatory target (no empty choice — Conjurer's Closet) takes the best even at no gain; an optional one only a gain.
  return best && (!empty || total(best) > 0) ? best : empty;
}

/** The harms whose survival the forced pick reads (forcedHarmSurvived) — damage and -X/-X; every other harm keeps the value order. */
const SURVIVAL_READ_OPS = new Set(["deal-damage", "pump"]);

/**
 * Does a wrong-side PERMANENT survive this forced harm whole by the cleanup step? Damage and an until-end-of-turn -X/-X wear off
 * there (CR 514.2), so a creature that lives through them has lost nothing that lasts. Read only where it is provable:
 *   - damage of a FIXED amount below the creature's toughness minus the damage already marked (lethal damage, CR 704.5g), from a
 *     source on the battlefield without deathtouch (any damage from one is lethal, CR 702.2b) — an amount that isn't fixed ("equal
 *     to its power"), or a source the board doesn't hold, is read as lethal;
 *   - an until-end-of-turn -X/-X that leaves the creature's toughness above 0 (CR 704.5f) and above the damage marked.
 * A noncreature, a permanent change (-1/-1 counters), and every other harm are not read as survived.
 */
function forcedHarmSurvived(state, atom, perm, sourceId) {
  if (!perm || !permanentIsCreature(state, perm.id)) return false;
  const toughness = permanentToughness(state, perm.id);
  const marked = Math.max(0, Number(perm.damageMarked) || 0);
  if (atom?.op === "deal-damage") {
    if (typeof atom.amount !== "number" || !Number.isFinite(atom.amount)) return false;
    if (!sourceId || !findPermanent(state, sourceId) || permanentHasKeyword(state, sourceId, "Deathtouch")) return false;
    return atom.amount < toughness - marked;
  }
  if (atom?.op === "pump") {
    const t = Number(atom.ptDelta?.t);
    if (!(t < 0) || atom.duration !== "endOfTurn") return false;
    return toughness + t > 0 && marked < toughness + t;
  }
  return false;
}

/** A plain tap of a permanent that is already tapped does nothing (CR 701.26a). A tap that also locks it (noUntapNext / lockOnly) still bites. */
const forcedTapDoesNothing = (atom, perm) => atom?.op === "tap" && !atom.noUntapNext && !atom.lockOnly && !!perm?.tapped;

/**
 * FORCED TARGET (CR 603.3d, 601.2c) — the pick when NO candidate puts every target on its atom's intended side. A triggered
 * ability is removed from the stack only when no LEGAL choice can be made (CR 603.3d), so a MANDATORY one still takes a
 * target: Man-o'-War with no other creature on the battlefield returns itself to its owner's hand, Flametongue Kavu alone
 * deals 4 damage to itself, Nekrataal beside only your own Grizzly Bears destroys the Bears. Until 2026-10-16 this case went
 * to the Arbiter no-op, which resolves as nothing: a card classified native lost its whole ability, with no reason logged
 * (found on shelf D18).
 *
 * The pick costs the controller least. A target on its atom's WRONG side costs its value — a permanent's mana value, then
 * its power (behind `usePolicyEval`, permanentValue), a spell's mana value on the stack (the announced X, the half cast —
 * spellOnStack.stackSpellManaValue) or a graveyard card's, an ability on the stack or a
 * player nothing — so the least valuable of your own permanents takes the harm and the least valuable of an opponent's takes
 * the help. A candidate whose damage could kill a wrong-side player — a fixed amount at least their life, or an amount that
 * isn't fixed — ranks after every other. Correct-side targets cost nothing; ties keep enumeration order (serialize-stable).
 *
 * A HARM THE TARGET SURVIVES COMES FIRST (2026-10-17). Damage and an until-end-of-turn -X/-X end in the cleanup step (CR 514.2),
 * so a permanent that survives them loses nothing that lasts (forcedHarmSurvived): among the wrong-side permanents of a damage or
 * -X/-X atom, every one that survives ranks before every one that dies, then value as above — Fire Imp beside your own Grizzly
 * Bears and Craw Wurm deals its 2 to the Wurm, no longer killing the Bears because their mana value is lower. A tap of a
 * permanent that is already tapped does nothing (only untapped permanents can be tapped, CR 701.26a), so it costs nothing:
 * Network Disruptor with no opposing permanent taps your tapped land, not an untapped one. Every other harm (destroy, exile,
 * bounce, a counter, -1/-1 counters, a tap that locks) keeps the plain value order.
 *
 * Null (the chooser answers NO_SAFE_TARGET) when the choice isn't forced:
 *   - "choose up to one": choosing no mode is legal, and it removes the ability (CR 603.3c);
 *   - any candidate with an OPTIONAL targeted atom ("you may …", or an optional payment that wraps the payoff): the
 *     controller can decline as it resolves (CR 603.5), and the default autopilot takes every "may", so it is never
 *     handed a wrong-side target to take;
 *   - a target whose side can't be read ("ambiguous" — only the choose-one modal partial reaches the chooser with one).
 */
function pickForcedTriggerCandidate(state, controller, candidates, program, atomsFor, targetOk, sourceId = null) {
  if (program?.modal?.allowNone) return null;
  // A chosen-target atom is one with an intent (atomTargetIntent is null only for a non-chosen type — "self", "each …").
  const optionalTargeted = (a) => atomTargetIntent(a) != null && (!!a.optional || String(a.op || "").startsWith("optional-"));
  if (candidates.some((c) => atomsFor(c).some(optionalTargeted))) return null;
  const byValue = policyEvalEnabledFor(state, controller);
  const mv = (card) => (card ? Math.max(0, tutorManaValue(card)) : 0);
  // [lethal, harmed, value, power], compared in that order; null when a target's side can't be read.
  const costOf = (c) => {
    const atoms = atomsFor(c);
    const onSide = targetOk(atoms);
    const cost = [0, 0, 0, 0];
    for (const t of c.targets || []) {
      const atom = atoms[t.atomIndex];
      if (atomTargetIntent(atom) === "ambiguous") return null;
      if (onSide(t)) continue;
      if (t.type === "player") {
        // Damage that could kill: a fixed amount at least the player's life, or an amount that isn't fixed ("equal to its
        // power"). Only damage is ranked so — it is the one harm that offers a player beside a permanent ("any target").
        const n = Number(atom?.amount);
        if (atom?.op === "deal-damage" && !(Number.isFinite(n) && n < state.players[t.id].life)) cost[0] += 1;
      } else if (t.type === "spell") {
        const spell = (state.stack || []).find((o) => o.id === t.id);
        cost[2] += spell ? Math.max(0, stackSpellManaValue(spell)) : 0;
      } else if (t.type === "graveyardCard") {
        cost[2] += mv((state.players[t.controller]?.graveyard || []).find((card) => card.id === t.id));
      } else if (t.type !== "stackAbility") {
        const perm = findPermanent(state, t.id).permanent; // an enumerated permanent target is on the battlefield by construction
        // `harmed`: a damage / -X/-X target that does not survive it, or an untapped target of a plain tap (a tapped one costs
        // nothing at all — the tap does nothing to it). Every other harm leaves it 0 for every candidate, so the value order decides.
        if (forcedTapDoesNothing(atom, perm)) continue;
        if (atom?.op === "tap" && !atom.noUntapNext && !atom.lockOnly) cost[1] += 1;
        else if (SURVIVAL_READ_OPS.has(atom?.op) && atomTargetIntent(atom) === "enemy" && !forcedHarmSurvived(state, atom, perm, sourceId)) cost[1] += 1;
        if (byValue) cost[2] += permanentValue(perm, state);
        else { cost[2] += mv(perm.card); cost[3] += Number(perm.card?.power) || 0; }
      }
    }
    return cost;
  };
  const cmp = (a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2] || a[3] - b[3];
  let best = null;
  let bestCost = null;
  for (const c of candidates) {
    const cost = costOf(c);
    if (cost && (!bestCost || cmp(cost, bestCost) < 0)) {
      best = c;
      bestCost = cost;
    }
  }
  return best ? { ...best, forced: true } : null;
}

/**
 * The candidates whose ward (CR 702.21a) `controller` would pay — the ward the flush records for the chosen targets (markWardOwed,
 * targetTaxForStackObject: the wards and Diffusion Sliver's tax) answered as the driver will answer it (autoPickSoftCounterPay) —
 * when at least one candidate carries a ward it would not pay and at least one does not; otherwise the candidates unchanged. Order
 * is kept, so a ranking after it reads the same list minus those. Ranking only: every candidate here is already on its correct side.
 */
function withoutUnpaidWard(state, controller, candidates) {
  const paid = candidates.filter((c) => {
    const tax = targetTaxForStackObject(state, { controller, targets: c.targets || [] });
    return !tax || autoPickSoftCounterPay(state, { controller, cost: tax.cost });
  });
  return paid.length && paid.length < candidates.length ? paid : candidates;
}

/**
 * α1 — the enemy/own-aware trigger-target chooser. Injected at the LIVE flush call-sites so a
 * targeted triggered ability picks a target on the side the card intends instead of blind first-legal:
 * removal / damage / counter / tap / -X-X → an OPPONENT's permanent / spell / the opponent; a buff /
 * +1/+1 / untap / graveyard-return → the controller's OWN. Returns the FIRST candidate whose every
 * target sits on its atom's intended side (deterministic over the enumeration order → serialize-stable).
 * If none exists, a MANDATORY ability still takes a target — the least harmful legal candidate, marked
 * `forced` (pickForcedTriggerCandidate, CR 603.3d); otherwise (optional, "choose up to one", or a side
 * that can't be read) it returns the NO_SAFE_TARGET sentinel and buildTriggerStack routes the trigger to
 * the Arbiter no-op. Ambiguous atoms never reach here on the non-modal path — buildTriggerStack gates
 * them to the Arbiter too. Pure function of `info.state`. Every AI seat's triggers are targeted here; a seat a
 * person plays chooses its own whenever there is a real choice (ASK_CONTROLLER — the trigger-target pause),
 * and this chooser keeps only its single-candidate abilities.
 *
 * (Restriction-pinned triggers — "…an opponent controls" / "…you control" — are already correct-side
 * via enumeration; this additionally fixes UNRESTRICTED harmful triggers that first-legal could aim at
 * a friendly. A spell target carries no controller field, so its side is resolved from state.stack.)
 */
export function chooseTriggerTargets(candidates, info) {
  const state = info?.state;
  const controller = info?.trigger?.controller;
  const program = info?.program;
  if (!state || !controller || !candidates?.length) return undefined;
  // A corrupted controller seat THROWS here (opponentsOf → assertPlayer), exactly as it does at every other call site —
  // deliberately not caught (2026-09-30). The old silent catch returned undefined, which buildTriggerStack reads as "no
  // preference" and answers with firstLegalChoice: a removal trigger could first-legal the controller's OWN permanent — the
  // friendly fire this chooser exists to prevent — behind a swallowed error (CLAUDE.md §1.2).
  const enemies = new Set(opponentsOf(state, controller));
  const sideOf = (t) => {
    if (t.type === "player") return t.id;
    if (t.type === "spell") return (state.stack || []).find((o) => o.id === t.id)?.controller;
    return t.controller; // creature / permanent / graveyardCard
  };
  // The atom set a candidate's targets index into (t.atomIndex). For a MODAL program the atomIndex is
  // scoped to the chosen mode(s) EXACTLY as the executor (runProgram.programAtoms) reads them, so resolve
  // per-candidate: a choose-ONE candidate (chosenMode = int) indexes that single mode's LOCAL atoms; a
  // choose-TWO candidate (chosenMode = int[]) indexes the ASCENDING-mode concatenation (global, matching
  // expandCastChoices' enumeration). A non-modal program uses its flat atoms. Mismatching these would test
  // the WRONG atom's intent — a CREED hazard (a removal mode mis-classified as a buff → friendly fire).
  const modes = program?.modal?.modes || [];
  const atomsFor = (cand) => {
    if (program?.structure !== "modal") return program?.atoms || [];
    const cm = cand?.chosenMode;
    if (Array.isArray(cm)) return cm.flatMap((k) => modes[k]?.atoms || []);
    return modes[cm]?.atoms || [];
  };
  const targetOk = (atoms) => (t) => {
    const intent = atomTargetIntent(atoms[t.atomIndex]);
    if (intent === "enemy") {
      const s = sideOf(t);
      return s != null && enemies.has(s);
    }
    if (intent === "own") return sideOf(t) === controller;
    // AMBIGUOUS → reject: the chooser can't place this target on a provably-correct side. For non-modal /
    // choose-two triggers an ambiguous atom is already gated upstream so no such candidate reaches here; for
    // the BLITZ ML-1 choose-one partial gate (modalChooseOneRoutable) an ambiguous MODE's candidate DOES
    // arrive, and rejecting it makes the chooser fall through to a resolvable mode (CR 700.2b — decline the
    // unsafe mode). Never picks the ambiguous mode → never mis-targets (CREED). null = non-targeting atom → ok.
    if (intent === "ambiguous") return false;
    return true;
  };
  // QUARTET PHASE 1 slice 3 (2026-08-14): behind `state.usePolicyEval`, the pick among the
  // CORRECT-SIDE candidates consults the shared evaluator instead of first-in-enumeration-order —
  // removal aims at the BIGGEST enemy threat, a buff lands on the OWN best permanent (both directions
  // prefer the high-value target; permanentValue is the one shared currency). Player-targets score 0
  // (neutral — candidate order breaks the tie, exactly the legacy pick among them). The side FILTER
  // above is untouched either way: this re-ranks only what was already provably safe (ranking-only,
  // THE CREED). Flag absent ⇒ first-correct-side, byte-identical.
  let safe = candidates.filter((c) => (c.targets || []).every(targetOk(atomsFor(c))));
  if (!safe.length) {
    // The trigger's source (a damage source's deathtouch decides whether a forced hit is survived — forcedHarmSurvived).
    const sourceId = info?.trigger?.source?.permanentId ?? info?.trigger?.context?.sourcePermanentId ?? null;
    return pickForcedTriggerCandidate(state, controller, candidates, program, atomsFor, targetOk, sourceId) ?? NO_SAFE_TARGET;
  }
  // WARD (CR 702.21a): a target an opponent's ward protects counters the ability unless its controller pays the cost, and the
  // controller answers that question as it will be asked (autoPickSoftCounterPay — pays when it can). A correct-side candidate
  // whose ward it won't pay is passed over while another is free of it; when every one carries such a ward, nothing changes.
  safe = withoutUnpaidWard(state, controller, safe);
  // THE LOOP BACKSTOP (2026-10-18, triggerTargetRestraint): an ability that has resolved LOOP_ITERATIONS times this turn makes a
  // different choice so its loop does not continue (CR 732.3; a loop with an optional action is never a draw, CR 104.4b) — its
  // optional targets declined, else a player target over a permanent (two indestructible Spitemares).
  if (loopSpent(state, info?.trigger)) {
    const breaking = loopBreakingChoice(safe, atomsFor);
    if (breaking) return breaking;
  }
  // "IT FIGHTS UP TO ONE TARGET CREATURE" (2026-10-18, triggerTargetRestraint): a fight that gains nothing is declined (CR 115.6,
  // 601.2c) — the target must die and the fighter live, or the fight be a step of the fighter's own enrage chain that ends so.
  // An indestructible Apex Altisaur fought the same Lumra 2,000 times in one turn on the first legal target.
  safe = restrainOptionalFights(state, controller, safe, atomsFor, info?.trigger?.source?.permanentId ?? info?.trigger?.context?.sourceId ?? null);
  // FLICKER (shelf D21 — Brago, King Eternal; Thassa, Deep-Dwelling; Displacer Kitten; Teleportation Circle): a blink's targets
  // are its controller's own permanents and WHICH is the whole decision. The expander orders subsets maximal-first, so the
  // first correct-side candidate was whatever permanent came first ("up to one") or every permanent you control, tokens
  // included ("any number" — Brago). The flicker gain decides instead.
  const flicker = pickFlickerCandidate(state, controller, safe, program);
  if (flicker) return flicker;
  if (!policyEvalEnabledFor(state, controller)) return safe[0];
  const candValue = (c) => (c.targets || []).reduce((s, t) => {
    if (t.type === "player" || t.type === "spell") return s;
    const lk = findPermanent(state, t.id);
    return s + (lk ? permanentValue(lk.permanent, state) : 0);
  }, 0);
  return safe.reduce((best, c) => (candValue(c) > candValue(best) ? c : best), safe[0]);
}

/** The harms that take a forced target of the controller's own off the battlefield (or the stack) for the cast-time hold. */
const REMOVING_OPS = new Set(["destroy", "exile", "bounce", "tuck", "bounce-spell-or-permanent", "counter"]);
/**
 * Does this forced harm REMOVE the controller's own permanent? Destroy, exile, bounce and tuck do; damage, an until-end-of-turn
 * -X/-X and -1/-1 counters do unless the permanent provably survives them (forcedHarmSurvived for the first two; for counters a
 * fixed number below its toughness minus the damage marked, CR 704.5f / 704.5g). A tap, a goad, a "can't block" do not.
 */
function forcedHarmRemoves(state, atom, perm, sourceId) {
  if (REMOVING_OPS.has(atom?.op)) return true;
  if (atom?.op === "deal-damage" || atom?.op === "pump") return !forcedHarmSurvived(state, atom, perm, sourceId);
  if (atom?.op === "add-counter" && String(atom.counterType || "").trim() === "-1/-1") {
    if (typeof atom.amount !== "number" || !permanentIsCreature(state, perm.id)) return true;
    const left = permanentToughness(state, perm.id) - atom.amount;
    return !(left > 0 && Math.max(0, Number(perm.damageMarked) || 0) < left);
  }
  return false;
}

/**
 * ENTERS-TRIGGER PREVIEW — the AI's cast-time hold (opponentAI.pickCastAction, 2026-10-17). Would the permanent `card`, entering
 * the battlefield under `controller` now, put an enters trigger on the stack that is FORCED (CR 603.3d: a mandatory ability with
 * no correct-side target still takes a legal one — pickForcedTriggerCandidate) onto one of `controller`'s own permanents or
 * spells, and remove it (forcedHarmRemoves; a countered or bounced spell)? Man-o'-War with no opposing creature bounces your own
 * creature or itself; Mystic Snake flashed in over only your own spell counters it.
 *
 * Read the way the game would do it: a copy of the board with the permanent on it (the stack as it stands — the permanent's own
 * spell has resolved off it), its enters triggers fired by checkEnterTriggers (so a Torpor Orb, an Elesh Norn or a Panharmonicon
 * counts as it would), and each one routed and targeted by buildTriggerStack with chooseTriggerTargets — the flush's own code.
 * Nothing is minted (the preview permanent's id is fixed) and nothing is logged; `state` is never written.
 *
 * Returns { source, op, target: { id, name } } for the first own permanent or spell such a trigger would remove, else null — a
 * correct-side target, no legal target (the ability is removed, CR 603.3d), an optional ability (declined, CR 603.5), a harm the
 * target survives, or an intervening-if that isn't met all leave the cast alone. Cheap when the card has no self enters trigger
 * that targets: that is read off the cached detectTriggers / parseEffectClause before any board is built.
 */
export function entersTriggerRemovesOwn(state, controller, card) {
  const seat = state?.players?.[controller];
  if (!card || !seat) return null;
  const targeted = detectTriggers(card).some((d) => d.event === "etb" && d.scope === "self" && d.effectClause
    && programNeedsChosenTarget(parseEffectClause(d.effectClause, "Instant", { hasX: !!d.effectHasX, sourceScoped: true })));
  if (!targeted) return null;
  const id = `${card.id ?? card.name}~entering`;
  const entering = { ...createPermanent({ id, card, controller, summoningSick: true }), enteredOnTurn: state.turn ?? null };
  const board = { ...state, pendingTriggers: [], players: { ...state.players, [controller]: { ...seat, battlefield: [...(seat.battlefield || []), entering] } } };
  const own = (checkEnterTriggers(board, entering).pendingTriggers || []).filter((t) => t.source?.permanentId === id);
  for (const trigger of own) {
    const built = buildTriggerStack(board, trigger, chooseTriggerTargets);
    if (!built?.forced) continue;
    const params = built.payload?.params || {};
    const program = params.program;
    const modes = program?.modal?.modes || [];
    const atoms = program?.structure !== "modal" ? program?.atoms || []
      : Array.isArray(params.chosenMode) ? params.chosenMode.flatMap((k) => modes[k]?.atoms || []) : modes[params.chosenMode]?.atoms || [];
    for (const t of built.targets || []) {
      const atom = atoms[t.atomIndex];
      if (atomTargetIntent(atom) !== "enemy") continue;
      if (t.type === "spell") {
        const spell = (board.stack || []).find((o) => o.id === t.id);
        if (spell?.controller === controller && REMOVING_OPS.has(atom.op)) return { source: card.name, op: atom.op, target: { id: t.id, name: spell.source?.name ?? null } };
        continue;
      }
      if (t.type === "player" || t.type === "graveyardCard" || t.type === "stackAbility") continue;
      const lk = findPermanent(board, t.id);
      if (lk?.controller === controller && forcedHarmRemoves(board, atom, lk.permanent, id)) {
        return { source: card.name, op: atom.op, target: { id: t.id, name: lk.permanent.card?.name ?? null } };
      }
    }
  }
  return null;
}

/**
 * Move every pending trigger onto the stack at this priority-grant checkpoint (CR
 * 603.3). Targets for a targeted trigger are chosen HERE, as the ability goes on the
 * stack (CR 603.3d → 601.2c); pass `{ chooseTargets }` to override the default first-legal
 * pick (an AI/Beginner-interactive chooser). A targeted trigger with no legal target
 * is dropped (logged, not silent); one whose legal targets are all on the wrong side is
 * logged too — `trigger-target-forced` or `trigger-no-safe-target`. At a live flush (the
 * automatic chooser passed), the ability of a seat a person plays with a real choice goes on
 * the stack waiting for that person (`awaitingTargets` — ASK_CONTROLLER, raiseTriggerTargetChoice).
 */
export { phaseInAndExpireShield as _phaseInAndExpireShieldForTests }; // TEFERI'S PROTECTION — the untap-step hook, re-exported for the witness
export function flushTriggers(state, { chooseTargets } = {}) {
  // GY-EVENT drain (SHELF S7): convert queued graveyard enter/leave events into pending triggers FIRST —
  // every settlement path funnels through this flush, so a recorded event always fires here (BEFORE the
  // empty-pending early return, which would otherwise strand a queue with no other pending triggers).
  state = checkGraveyardEventTriggers(state);
  // BECOMES-TAPPED drain (BLITZ TR-1): same funnel discipline — a tap recorded during action dispatch (mana /
  // crew / cost / attack) or a resolution converts its self "becomes tapped" watcher here, at the next
  // priority-grant checkpoint (CR 603.3a). BEFORE the empty-pending early return so a lone tap trigger isn't
  // stranded. Idempotent (empty queue → no-op), so re-entrant flushes never double-fire.
  state = checkTapTriggers(state);
  // COUNTERS-PUT-ON drain (CR 122.6): same funnel discipline as the two above — a placement recorded during
  // resolution, combat, or an enters-with mint converts to its watcher's trigger here, at the next
  // priority-grant checkpoint. BEFORE the empty-pending early return so a lone counter trigger isn't
  // stranded. Idempotent (empty queue → no-op), so re-entrant flushes can't double-fire.
  state = checkCounterTriggers(state);
  let pending = state.pendingTriggers || [];
  if (pending.length === 0) return state;
  // A PLAYER WHO HAS LEFT THE GAME (CR 800.4d): "If a triggered ability that would be controlled by a player who has left the
  // game would be put onto the stack, it isn't put on the stack." Their own permanents' leaves triggers (recorded as those
  // permanents left with them — playerLeavesGame.js) and their delayed triggers reach this universal chokepoint after their
  // seat is gone; each is dropped here, logged. A trigger with no controller field is not judged.
  if (pending.some((t) => typeof t?.controller === "string" && !state.players?.[t.controller])) {
    const dropped = pending.filter((t) => typeof t?.controller === "string" && !state.players?.[t.controller]);
    pending = pending.filter((t) => !dropped.includes(t));
    for (const t of dropped) state = logEvent(state, { kind: "trigger-controller-left", source: t.source?.name || t.source, controller: t.controller });
    state = { ...state, pendingTriggers: pending };
    if (pending.length === 0) return state;
  }

  // SOURCE-SCOPED TRIGGER MULTIPLIER (the 5th axis — Katara / Harmonic Prodigy / Cloud / Annie Joins Up,
  // CR 603.x). The other four multipliers are scoped by what CAUSED the trigger and are applied at that
  // cause's own enqueue site. This family is scoped by WHOSE ABILITY it is, so it has no single event to
  // hang off — it must see every trigger from every event. THIS is the universal chokepoint (the same
  // reason the once-per-turn latch below lives here), and applying it once here is what keeps it off the
  // ~30 separate pendingTriggers append sites, where it could silently miss one forever.
  //
  // Placed BEFORE orderTriggersAPNAP so the extra instances are ordered with the originals (CR 603.3b —
  // simultaneous triggers go on the stack in APNAP order; a copy is not "later" than its original).
  // Fast-pathed on the board carrying any such static, so an ordinary flush is byte-identical.
  const multiplied = multiplySourceScopedTriggers(state, pending);

  const ordered = orderTriggersAPNAP(state, multiplied);

  // Mint a deterministic stack id for any trigger without one (real triggers
  // from triggers.js carry no id; some tests pass explicit ids). Thread state so
  // idSeq advances per mint and the result is serialize-stable. Target enumeration
  // reads the (board-identical) threaded state — minting never touches the battlefield,
  // so every simultaneous trigger chooses against the same flush-time board.
  let s = state;
  const newStackObjects = [];
  const personAbilities = []; // a person's own abilities of this batch, for the order question (markTriggerOrder) — at a live flush only
  for (const trigger of ordered) {
    // ONCE-PER-TURN TRIGGER (M1a — "This ability triggers only once each turn.", Mirelurk Queen): the
    // ability does not trigger a second time within a turn. Enforced HERE, the universal flush chokepoint,
    // via the SAME state.onceTriggersFiredThisTurn ledger the atom-level "Do this only once each turn"
    // latch uses (cleared each untap step); keyed per source permanent + event so two different
    // once-limited triggers never collide. Marked at first firing — a later same-turn event's trigger is
    // dropped with a distinct log line (a CORRECT skip, not a fizzle).
    if (trigger.descriptor?.oncePerTurnTrigger) {
      const otKey = `otpt_${trigger.source?.permanentId}_${trigger.event}`;
      if ((s.onceTriggersFiredThisTurn || {})[otKey]) {
        s = logEvent(s, {
          kind: "trigger-once-per-turn-latched",
          source: trigger.source?.name || trigger.source,
          controller: trigger.controller,
        });
        continue;
      }
      s = {
        ...s,
        onceTriggersFiredThisTurn: { ...(s.onceTriggersFiredThisTurn || {}), [otKey]: true },
      };
    }
    // SHELF-85 V10 (2026-09-04 — Scythecat Cub "if this is the second time this ability has resolved this turn"): every
    // triggered ability carries a stable key (source permanent + printed sentence) in its context, so the resolution
    // ledger (`abilityResolutionsThisTurn`, bumped in resolveTopOfStack) and the intervening-if word can meet.
    const abilityKey = trigger.source?.permanentId && trigger.descriptor?.sourceText ? `${trigger.source.permanentId}:${trigger.descriptor.sourceText}` : null;
    const keyed = abilityKey ? { ...trigger, context: { ...(trigger.context || {}), abilityKey } } : trigger;
    // A PERSON CHOOSES (ASK_CONTROLLER, CR 603.3d): a seat a person plays announces its own ability's targets — at a live flush
    // (the automatic chooser in play), never in a caller that passes a chooser of its own.
    const asking = chooseTargets === chooseTriggerTargets && seatIsHuman(s, trigger.controller);
    const built = buildTriggerStack(s, keyed, asking ? askControllerChooser : chooseTargets);
    if (built === TRIGGER_CONDITION_NOT_MET) {
      // CR 603.4 — the intervening-if condition was false at trigger time; the ability CORRECTLY never goes on
      // the stack. This is EXPECTED (e.g. Garruk's Uprising's ETB "if you control a creature with power 4+, draw"
      // cast before a power-4 creature is out), NOT a CR 603.3d no-legal-target fizzle. Log it DISTINCTLY so
      // breakage attribution (breakageReport.js / selfplay-report) doesn't conflate a correct condition-skip with a
      // real removal — this was mislabeled `trigger-removed-no-target` and polluted that pile (Garruk's 307×, etc.).
      s = logEvent(s, {
        kind: "trigger-condition-not-met",
        source: trigger.source?.name || trigger.source,
        controller: trigger.controller,
      });
      continue;
    }
    if (!built) {
      // A targeted trigger with no legal target is removed from the stack (CR 603.3d).
      // Log it so the removal is visible to the player, never a silent disappearance.
      s = logEvent(s, {
        kind: "trigger-removed-no-target",
        source: trigger.source?.name || trigger.source,
        controller: trigger.controller,
      });
      continue;
    }
    // Every legal target sat on the wrong side for the effect (CR 603.3d). A MANDATORY ability took the least harmful
    // one — Man-o'-War alone returns itself — and says so; an optional one (its controller declines, CR 603.5) or one
    // whose side can't be read goes on the stack as the Arbiter no-op, which resolves as nothing, so say why here.
    if (built.forced) {
      s = logEvent(s, {
        kind: "trigger-target-forced",
        source: trigger.source?.name || trigger.source,
        controller: trigger.controller,
        targets: built.targets.map((t) => t.id),
      });
    } else if (built.noSafeTarget) {
      s = logEvent(s, {
        kind: "trigger-no-safe-target",
        source: trigger.source?.name || trigger.source,
        controller: trigger.controller,
      });
    }
    let id = trigger.id;
    if (!id) {
      const m = mintId(s, "stk");
      id = m.id;
      s = m.state;
    }
    newStackObjects.push({
      id,
      kind: "triggered-ability",
      source: trigger.source,
      controller: trigger.controller,
      targets: built.targets,
      cost: null,
      payload: built.payload,
      // Waiting for its controller (a person) to choose: the engine's own legal choices, kept on the object the answer settles.
      ...(built.ask
        ? { awaitingTargets: { candidates: built.ask.candidates, abilityText: trigger.descriptor?.sourceText ?? null, ...(built.ask.allowNone ? { allowNone: true } : {}) } }
        : {}),
    });
    if (asking) personAbilities.push({ id, controller: trigger.controller, abilityText: trigger.descriptor?.sourceText ?? null });
  }

  let out = {
    ...s,
    stack: [...s.stack, ...newStackObjects],
    pendingTriggers: [],
  };
  // BECOMES-TARGET (CR 603.2 — the Phantasmal Illusion family): a TRIGGERED ability that chose a target (bound
  // above at stack time, CR 603.3d) may target a permanent carrying the "becomes the target … sacrifice it"
  // trigger. This is the 4th and final target-choice site (the spell-cast / activated-ability / loyalty sites
  // live in actionDispatcher). Fire the sac trigger for each just-created triggered-ability stack object, then
  // recurse to put it ABOVE them (CR 603.3b — it resolves first, sacrificing the creature, so the targeting
  // triggered ability is countered on resolution if it lost its only legal target). Recursion terminates: a
  // sacrifice-it trigger targets nothing, so its own stack object never re-triggers this. No-op (no re-flush)
  // when no new triggered ability targeted a becomes-target permanent — the common case, byte-identical to before.
  for (const so of newStackObjects) {
    if (so.awaitingTargets) continue; // no target yet — its target events run when its controller chooses (settleTriggerTargetChoice)
    out = checkBecomesTargetTriggers(out, so);
    // CRIME (CR 700.13): putting a triggered ability on the stack that targets an opponent's side is a crime by its
    // controller. Its watchers join the recursion below. No crime watcher in the corpus targets an opponent's side
    // itself, and the ones whose payoff could feed a crime print "This ability triggers only once each turn", so the
    // recursion still terminates.
    out = checkCrimeTriggers(out, so);
    // KIRA (kiraTargetCounter.js): this 4th target-choice site also raises Kira's hard counter — a TRIGGERED
    // ability targeting an eligible-and-fresh Kira-protected creature is countered outright (CR 603.2 — "a
    // spell or ability" includes a triggered ability). No-op when no Kira source is in play. counterSpellById
    // removes the just-created triggered-ability stack object (no zone change — it's not a card), so the
    // recursion below never re-flushes a countered object.
    out = applyKiraTargetCounter(out, so);
    // WARD (CR 702.21a): a triggered ability an opponent controls that targets a ward permanent is countered unless its controller
    // pays the ward cost — the question the cast and ability paths raise for a spell and an activated ability (actionDispatcher).
    // Recorded on the ability (`wardOwed`) and asked by the session driver before anyone receives priority (raiseWardOwed), so a
    // second ward in this batch, or the spell's own ward on the cast path that flushed this, never meets an occupied choice slot.
    out = markWardOwed(out, so);
  }
  // A PERSON ORDERS THEIR OWN (CR 603.3b, 405.3): two or more of a person's abilities in this batch that are not all identical copies
  // wait, in the order they triggered, for that person to choose the order (raiseTriggerOrderChoice). Before the recursion below, whose
  // abilities triggered as this batch went on the stack and form the next batch, above this one.
  out = markTriggerOrder(out, personAbilities);
  if ((out.pendingTriggers || []).length) {
    return flushTriggers(out, { chooseTargets });
  }
  return out;
}

/**
 * THE TRIGGER-ORDER QUESTION, RECORDED (CR 603.3b — "each player, in APNAP order, puts each triggered ability they control … on the
 * stack in any order they choose"; CR 405.3). `abilities` are the abilities a person's seat put on the stack in this batch at a live
 * flush (flushTriggers' `asking`), in the order they triggered. When two or more of one person's are still on the stack and they are
 * not all interchangeable, each is stamped `awaitingOrder: { batch, abilityText }` — `batch` the id of the lowest — and the session
 * driver asks the order before anyone receives priority (raiseTriggerOrderChoice). They already stand in their APNAP place, lowest
 * first in the order they triggered; the answer only permutes them among their own positions, so every other player's abilities keep
 * theirs. INTERCHANGEABLE: identical copies — the same ability of the same source for the same trigger event (Panharmonicon's extra
 * instance, CR 603.2d) — carry the same object apart from their id, and copies resolve the same in any order, so a batch of nothing
 * else asks nothing. Every AI seat, and every table with no person, never reaches the stamp: `abilities` is empty there.
 */
function markTriggerOrder(state, abilities) {
  if (abilities.length < 2) return state;
  let out = state;
  for (const seat of [...new Set(abilities.map((a) => a.controller))]) {
    const mine = abilities.filter((a) => a.controller === seat && (out.stack || []).some((o) => o.id === a.id)); // still there (Kira's counter removes one)
    if (mine.length < 2) continue;
    const key = (a) => {
      const { id: _id, ...rest } = out.stack.find((o) => o.id === a.id);
      return JSON.stringify([rest, a.abilityText]);
    };
    if (new Set(mine.map(key)).size < 2) continue;
    const marks = new Map(mine.map((a) => [a.id, { batch: mine[0].id, abilityText: a.abilityText }]));
    out = { ...out, stack: out.stack.map((o) => (marks.has(o.id) ? { ...o, awaitingOrder: marks.get(o.id) } : o)) };
  }
  return out;
}

/**
 * THE TRIGGER-ORDER PAUSE (CR 603.3b, 405.3) — raise the question for the lowest batch of a person's abilities waiting for their order
 * (markTriggerOrder). The order comes before any of the batch's targets: each ability's targets are chosen as it is put on the stack
 * (CR 603.3d → 601.2c), so the trigger-target question follows in the order chosen. An ability put on the stack before this batch
 * that still waits for its targets is asked first (it went on the stack first). `candidates` list the abilities as they stand, the
 * topmost — the one that resolves first — first. The session driver calls this before the trigger-target raise; the same state when a
 * choice is pending or nothing waits (every game with no person at it, always).
 */
export function raiseTriggerOrderChoice(state) {
  if (state.pendingChoice) return state;
  const stack = state.stack || [];
  const at = stack.findIndex((o) => o.awaitingOrder);
  if (at < 0) return state;
  const targetsFirst = stack.findIndex((o) => o.awaitingTargets);
  if (targetsFirst >= 0 && targetsFirst < at) return state;
  const { batch } = stack[at].awaitingOrder;
  const members = stack.filter((o) => o.awaitingOrder?.batch === batch);
  return setPendingTriggerOrderChoice(state, {
    controller: stack[at].controller,
    batch,
    candidates: members.reverse().map((o) => ({
      id: o.id,
      sourceName: o.source?.name ?? null,
      abilityText: o.awaitingOrder.abilityText ?? null,
      targets: (o.targets || []).map((t) => triggerTargetView(state, t)),
      ...(o.awaitingTargets ? { targetsNext: true } : {}),
    })),
  });
}

/**
 * Settle the trigger-order pause with the person's answer — `resolveOrder`, the ids of the batch's abilities with the one that resolves
 * FIRST first. The last to resolve is put on the stack first (CR 603.3b): the abilities take the batch's own positions bottom-up in the
 * reverse of `resolveOrder`, and are no longer waiting. Anything that is not an order of exactly those abilities — not a list, one
 * missing, one twice, an id not of the batch — decides nothing: the question stands.
 */
export function settleTriggerOrderChoice(state, resolveOrder) {
  const pc = state.pendingChoice;
  if (!pc || pc.kind !== "trigger-order") return state;
  const stack = state.stack || [];
  const at = [];
  stack.forEach((o, i) => { if (o.awaitingOrder?.batch === pc.batch) at.push(i); });
  if (at.length === 0) {
    // Nothing on the stack waits under that batch any more (the fixture's auto path; a controller who left the game): nothing to order.
    return logEvent(clearPendingChoice(state), { kind: "trigger-order-gone", batch: pc.batch ?? null, controller: pc.controller ?? null });
  }
  const ids = at.map((i) => stack[i].id);
  if (!Array.isArray(resolveOrder) || resolveOrder.length !== ids.length || new Set(resolveOrder).size !== ids.length || !resolveOrder.every((id) => ids.includes(id))) {
    return state;
  }
  const byId = new Map(at.map((i) => [stack[i].id, stack[i]]));
  const bottomUp = [...resolveOrder].reverse();
  const next = stack.slice();
  at.forEach((pos, k) => {
    const { awaitingOrder: _ordered, ...placed } = byId.get(bottomUp[k]);
    next[pos] = placed;
  });
  return logEvent({ ...clearPendingChoice(state), stack: next }, { kind: "trigger-order-chosen", controller: pc.controller, resolveOrder: [...resolveOrder] });
}

/**
 * The automatic answer to a trigger-order pause — the contract's settle-in-one-tick path (a pause the driver doesn't hold for a
 * person): the order the abilities stand in, the order they triggered in (every AI seat's order). Empty when nothing waits.
 */
export function autoPickTriggerOrder(state, pc) {
  return (state.stack || []).filter((o) => o.awaitingOrder && o.awaitingOrder.batch === pc?.batch).map((o) => o.id).reverse();
}

/**
 * THE TRIGGER-TARGET PAUSE (CR 603.3d, 601.2c, 603.3c) — raise the question for the first ability on the stack still waiting for its
 * controller's choice (flushTriggers' `awaitingTargets`, a person's seat only): the lowest such object, the first put on the stack —
 * each simultaneous ability is put on the stack, its targets announced, in that order (CR 603.3b). The session driver calls this
 * before anyone receives priority. Returns the same state when a choice is already pending or nothing waits (every game with no
 * person at it, always).
 */
export function raiseTriggerTargetChoice(state) {
  if (state.pendingChoice) return state;
  const obj = (state.stack || []).find((o) => o.awaitingTargets);
  if (!obj) return state;
  const { candidates = [], abilityText = null, allowNone = false } = obj.awaitingTargets;
  return setPendingTriggerTargetChoice(state, {
    controller: obj.controller,
    stackObjectId: obj.id,
    sourceName: obj.source?.name ?? null,
    abilityText,
    candidates: candidates.map((c, i) => triggerChoiceView(state, c, i)),
    allowNone,
  });
}

/** A legal choice as the panel reads it: its index, a mode's text, each target by id, kind, name and controller. A face-down permanent's name never shows (CR 708.2). */
function triggerChoiceView(state, c, i) {
  return {
    id: String(i),
    ...(c.label ? { label: c.label } : {}),
    targets: (c.targets || []).map((t) => triggerTargetView(state, t)),
  };
}

/** A target as a panel reads it: id, kind, name and controller (a player's controller is the player). Shared by the trigger-target and trigger-order questions. */
function triggerTargetView(state, t) {
  const perm = t.type === "player" ? null : findPermanent(state, t.id)?.permanent;
  return { id: t.id, type: t.type, name: perm?.faceDown ? "Face-down creature" : t.name ?? null, controller: t.type === "player" ? t.id : t.controller ?? null };
}

/**
 * Settle the trigger-target pause with the person's answer — `candidateId`, a choice's index in the waiting object's own list, or
 * "none" for a modal "choose up to one". The chosen targets (and mode) are written onto the ability exactly where the automatic chooser
 * writes them (`targets`, `payload.params.targets` / `.chosenMode`); then the events of choosing a target run — becomes-the-target
 * triggers, a crime, Kira's counter — which flushTriggers skipped for an object with no target yet. No mode chosen removes the
 * ability (CR 603.3c, 700.2b). An answer that is no legal choice decides nothing: the question stands. The triggers those events and
 * any state-based check enqueued are put on the stack once the last waiting ability of the batch is answered (they all went on the
 * stack together, CR 603.3b). "no-safe-target" (the automatic answer only — autoPickTriggerTarget) makes it the Arbiter no-op the
 * flush gives an AI seat's ability with no correct-side target.
 */
export function settleTriggerTargetChoice(state, candidateId) {
  const pc = state.pendingChoice;
  if (!pc || pc.kind !== "trigger-target") return state;
  const at = (state.stack || []).findIndex((o) => o.id === pc.stackObjectId && o.awaitingTargets);
  if (at < 0) {
    // Nothing on the stack waits under that id any more (its controller left the game, CR 800.4a): nothing to choose.
    return logEvent(clearPendingChoice(state), { kind: "trigger-target-gone", stackObjectId: pc.stackObjectId ?? null, controller: pc.controller ?? null });
  }
  const obj = state.stack[at];
  const { candidates = [], allowNone = false } = obj.awaitingTargets;
  const { awaitingTargets: _answered, ...rest } = obj;
  const source = obj.source?.name || obj.source;
  const replaced = (next) => ({ ...clearPendingChoice(state), stack: state.stack.map((o, i) => (i === at ? next : o)) });
  if (candidateId === "none" && allowNone) {
    const removed = { ...clearPendingChoice(state), stack: state.stack.filter((_, i) => i !== at) };
    return finishTriggerTargets(logEvent(removed, { kind: "trigger-removed-no-mode", source, controller: obj.controller }));
  }
  if (candidateId === "no-safe-target") {
    const manual = replaced({ ...rest, targets: [], payload: { resolver: "manual" } });
    return finishTriggerTargets(logEvent(manual, { kind: "trigger-no-safe-target", source, controller: obj.controller }));
  }
  const choice = typeof candidateId === "string" && /^\d+$/.test(candidateId) ? candidates[Number(candidateId)] : undefined;
  if (!choice) return state;
  const targets = choice.targets || [];
  const params = obj.payload?.params || {};
  const chosen = {
    ...rest,
    targets,
    payload: { ...obj.payload, params: { ...params, ...(choice.chosenMode !== undefined ? { chosenMode: choice.chosenMode } : {}), targets } },
  };
  let out = logEvent(replaced(chosen), {
    kind: "trigger-target-chosen",
    source,
    controller: obj.controller,
    targets: targets.map((t) => t.id),
    ...(choice.chosenMode !== undefined ? { mode: choice.chosenMode } : {}),
  });
  // The events of choosing a target — flushTriggers' fourth target-choice site, run now that there is a target.
  out = checkBecomesTargetTriggers(out, chosen);
  out = checkCrimeTriggers(out, chosen);
  out = applyKiraTargetCounter(out, chosen);
  out = markWardOwed(out, chosen); // ward (CR 702.21a) — asked by the driver once no ability of the batch waits (raiseWardOwed)
  return finishTriggerTargets(out);
}

/**
 * WARD ON A TRIGGERED ABILITY (CR 702.21a) — "Whenever this permanent becomes the target of a spell or ability an opponent controls,
 * counter that spell or ability unless that player pays [cost]." A triggered ability's targets are chosen as it is put on the stack
 * (CR 603.3d → 601.2c); when it targets a ward permanent an opponent of its controller controls, record the ward on the ability:
 * `wardOwed: { cost, wardName }`, the cost and the ward's name as targetTaxForStackObject reads them now, as the ward triggers (the
 * same detector the cast, ability and loyalty paths use — every ward target and every ward instance on it, and every Diffusion Sliver
 * trigger, in one cost; a cost the engine can't take is recorded as unpayable, never dropped; no ward or an own permanent records
 * nothing). The question itself is raised by raiseWardOwed. An ability already gone (Kira's counter) records nothing.
 */
function markWardOwed(state, so) {
  const tax = targetTaxForStackObject(state, so);
  if (!tax) return state;
  const at = (state.stack || []).findIndex((o) => o.id === so.id);
  if (at < 0) return state;
  return { ...state, stack: state.stack.map((o, i) => (i === at ? { ...o, wardOwed: { cost: tax.cost, wardName: tax.wardName } } : o)) };
}

/**
 * Raise the ward question for a triggered ability whose target's ward has triggered (markWardOwed): the soft-counter pause the cast
 * and ability paths raise — that ability's controller pays the cost, or it is countered (runProgram.resolveSoftCounterChoice; an AI
 * pays when it can, autoPickSoftCounterPay). The session driver calls this before anyone receives priority, right after it raises the
 * trigger-target pause, so a ward is asked only once no ability of its batch waits for its targets (the batch is put on the stack
 * before the ward triggers are, CR 603.3); never while a choice is pending. The lowest such ability first (the order they were put on
 * the stack); one question per call, the record cleared as it is asked. Returns the same state when nothing is owed — every game in
 * which no triggered ability aimed at an opponent's ward permanent.
 */
export function raiseWardOwed(state) {
  if (state.pendingChoice) return state;
  const stack = state.stack || [];
  const at = stack.findIndex((o) => o.wardOwed);
  if (at < 0) return state;
  const obj = stack[at];
  const { wardOwed, ...rest } = obj;
  const asked = { ...state, stack: stack.map((o, i) => (i === at ? rest : o)) };
  return setPendingSoftCounterChoice(asked, { controller: obj.controller, cost: wardOwed.cost, spellId: obj.id, spellName: obj.source?.name ?? null, sourceName: wardOwed.wardName });
}

/** Once no ability of the batch waits for its controller, put what triggered meanwhile on the stack (the flush the batch's own would have run). */
function finishTriggerTargets(state) {
  if ((state.stack || []).some((o) => o.awaitingTargets)) return state;
  return flushTriggers(state, { chooseTargets: chooseTriggerTargets });
}

/**
 * The automatic answer to a trigger-target pause — the contract's settle-in-one-tick path (a pause the driver doesn't hold for a
 * person). The pause is raised only for a person's seat, so a real game never takes it: the automatic chooser's pick among the waiting
 * object's own choices, as the flush would have made it — its index (the first legal when the chooser has no preference),
 * "no-safe-target" when it declines, "none" when it declines a modal "choose up to one". Null when nothing waits.
 */
export function autoPickTriggerTarget(state, pc) {
  const obj = (state.stack || []).find((o) => o.id === pc?.stackObjectId && o.awaitingTargets);
  if (!obj) return null;
  const { candidates = [], allowNone = false } = obj.awaitingTargets;
  const params = obj.payload?.params || {};
  const picked = chooseTriggerTargets(candidates, { trigger: { controller: obj.controller, source: obj.source, context: params.context }, program: params.program, state });
  if (picked === NO_SAFE_TARGET) return allowNone ? "none" : "no-safe-target";
  const key = (c) => JSON.stringify([c?.chosenMode ?? null, (c?.targets || []).map((t) => [t.type, t.id, t.atomIndex ?? null, t.role ?? null])]);
  const at = picked ? candidates.findIndex((c) => key(c) === key(picked)) : -1;
  return String(at >= 0 ? at : 0);
}

// ─── Game start helper ───────────────────────────────────────────────────────

// London mulligan starting hand size (CR 103.4 — normally seven). A seat can take
// mulligans until its opening hand would be ZERO cards (CR 103.5), i.e. it may ship
// at most STARTING_HAND_SIZE times (the 7th keep bottoms all 7 → 0 cards). The cap is
// a real-rules floor, not an arbitrary safety latch.
const STARTING_HAND_SIZE = 7;

// ─── London mulligan step-primitives (CR 103.5) ──────────────────────────────
// Shared by the synchronous bot loop (runMulliganPhaseForSeat, below) AND the human
// interactive flow (learnSession advances the human seat one step at a time). A ship
// reshuffles + redraws + counts; a keep bottoms N (= the mulligan count) and stamps.
// DECK-SIZE INVARIANT: library.length + hand.length is conserved across every ship and
// keep (both are pure moves) — no card lost or duplicated.

/**
 * One London SHIP: shuffle the seat's hand back into the library, redraw a fresh
 * STARTING_HAND_SIZE, log the mulligan. `priorShips` is the count BEFORE this ship (the log
 * records `priorShips + 1`, matching the pre-extraction behavior). shuffleControllerLibrary
 * advances the threaded rngSeed so the redraw is deterministic per seed and serialize-stable.
 * Move-only ⇒ the deck-size invariant (library + hand conserved) holds. Pure.
 */
export function applyMulliganShip(state, seat, priorShips = 0) {
  let next = state;
  const hand = next.players[seat]?.hand || [];
  next = putCardsOnBottom(next, { playerId: seat, cardIds: hand.map((c) => c.id) }); // hand → library
  next = shuffleControllerLibrary(next, seat);
  // Reset cardsDrawnThisTurn so the redraw doesn't inflate it (the opening draw is not a
  // "draw this turn"); the original deal already set it via drawCards, so zero it first.
  next = {
    ...next,
    players: { ...next.players, [seat]: { ...next.players[seat], cardsDrawnThisTurn: 0 } },
  };
  next = drawCards(next, { playerId: seat, count: STARTING_HAND_SIZE });
  next = logEvent(next, { kind: "mulligan-ship", player: seat, mulligans: priorShips + 1 });
  return next;
}

/**
 * London KEEP: bottom `ships` cards (CR 103.5 — one per mulligan taken), stamp the seat's
 * final mulligan count, log. `ships === 0` ⇒ a kept first 7, no bottoming.
 *
 * WHICH cards go to the bottom:
 *   - `chooseBottom({ state, seat, count, hand }) -> cardIds[]` provided (the human London
 *     picker) ⇒ bottom exactly those, AFTER validation (an array of `count` distinct ids all
 *     present in hand). A malformed return silently falls back to the heuristic — a bad UI
 *     payload can never strand setup or bottom the wrong count. A picker that THROWS is a
 *     caller bug and propagates (no catch — see below).
 *   - absent (every bot / self-play caller) ⇒ rankBottomCandidates: the N WORST by the
 *     mulligan evaluator's rank. Byte-identical to the pre-seam engine.
 * `forcedFloor` only tags the log (a ship requested at the zero-hand floor, resolved as a keep).
 * Pure.
 */
export function applyMulliganKeep(
  state,
  seat,
  { ships = 0, pilot = null, chooseBottom = null, forcedFloor = false } = {},
) {
  let next = state;
  if (ships > 0) {
    const hand = next.players[seat]?.hand || [];
    let bottomIds = null;
    if (typeof chooseBottom === "function") {
      // No try/catch around the picker (removed 2026-10-18). Its one production caller is learnSession's
      // human bottom step, `() => cardIds` over the UI payload, which cannot throw; a probe over the full
      // suite reached this 8 times and saw no throw but the test's deliberate one (self-play never passes
      // a picker). The old catch logged a console warning and bottomed the heuristic's cards instead of
      // the player's (CLAUDE.md §1.2).
      const picked = chooseBottom({ state: next, seat, count: ships, hand });
      // Validate: exactly `ships` distinct ids, every one currently in hand. Anything off ⇒ heuristic.
      const handIds = new Set(hand.map((c) => c.id));
      if (
        Array.isArray(picked) &&
        picked.length === ships &&
        new Set(picked).size === ships &&
        picked.every((id) => handIds.has(id))
      ) {
        bottomIds = picked;
      }
    }
    if (bottomIds === null) {
      // Heuristic bottom: N WORST by rank (excess lands beyond the playbook window first, then
      // uncastable / highest-MV spells). Deterministic; the self-play / bot path.
      bottomIds = rankBottomCandidates(hand, ships, pilot?.playbook ?? null);
    }
    next = putCardsOnBottom(next, { playerId: seat, cardIds: bottomIds });
    next = logEvent(next, {
      kind: "mulligan-keep",
      player: seat,
      mulligans: ships,
      bottomed: bottomIds.length,
      ...(forcedFloor ? { forcedFloor: true } : {}),
    });
  } else {
    next = logEvent(next, { kind: "mulligan-keep", player: seat, mulligans: 0, bottomed: 0 });
  }
  // Stamp the seat's final mulligan count (a metric the recorder/UI reads).
  next = {
    ...next,
    players: {
      ...next.players,
      [seat]: { ...next.players[seat], mulligans: ships, hasMulliganed: ships > 0 || forcedFloor },
    },
  };
  return next;
}

/**
 * Run the whole London mulligan keep/ship phase for ONE seat SYNCHRONOUSLY (opt-in; the
 * default path never calls this). This is the BOT / self-play driver: it loops, calling
 * `decideMulligan({ state, legalActions, seat, pilot }) -> action` (legalActions =
 * `[{kind:"mulligan-keep"},{kind:"mulligan-ship"}]`) until the seat keeps or hits the
 * zero-hand floor, composing applyMulliganShip / applyMulliganKeep for each step. A return
 * that isn't a clean "mulligan-ship" → KEEP (safe default; a garbage/learned-pilot value can
 * never strand setup or over-mulligan); a throw is logged and read as KEEP. `chooseBottom` (optional)
 * is forwarded to the keep step so a caller can pick the bottomed cards; absent ⇒ the worst-N
 * heuristic (byte-identical). `recordMulligan` (optional) is invoked once per decision; a throw
 * from it propagates.
 *
 * The HUMAN path does NOT use this — it can't block on a synchronous decider — and instead
 * drives applyMulliganShip / applyMulliganKeep one step per HTTP round-trip (learnSession).
 */
function runMulliganPhaseForSeat(
  state,
  seat,
  { decideMulligan, pilot = null, recordMulligan = null, chooseBottom = null },
) {
  let next = state;
  let ships = 0; // = the seat's mulligan count; bottom this many on keep (CR 103.5 London)

  // Offer keep/ship until the seat keeps or hits the zero-hand floor (CR 103.5).
  for (;;) {
    const legalActions = [{ kind: "mulligan-keep" }, { kind: "mulligan-ship" }];
    let action;
    try {
      action = decideMulligan({ state: next, legalActions, seat, pilot });
    } catch (err) {
      // A throwing pilot must never abort game setup — default to KEEP. This catch is the mulligan half of the
      // pilot-seam contract: persona modules are hot-loaded from the writable pilots dir (pilotLoader.js), and a
      // throwing one falls back to the default, exactly as learnSession.resolveDecideAction does for the in-game
      // decide (scripts/pilots/example-pilot.mjs states it). Kept 2026-10-18: a probe over the full suite and an
      // 80-game seeded batch (the engine's own decideMulliganForAI behind it) saw no throw but the test's deliberate one.
      if (typeof console !== "undefined" && console.warn) {
        console.warn(`[learn] decideMulligan threw (keeping): ${err?.message || err}`);
      }
      action = { kind: "mulligan-keep" };
    }
    // Anything that isn't a clean "mulligan-ship" → KEEP (the safe default — a garbage /
    // out-of-set / learned-pilot return can never force an extra mulligan or strand setup).
    const wantsShip = action && action.kind === "mulligan-ship";

    // Record the decision (opt-in). No try/catch (removed 2026-10-18): the one recorder is selfPlayRunner's row
    // push, which a probe over the full suite and an 80-game seeded batch reached and never saw throw. The old
    // catch logged a console warning and dropped the row, so a broken recorder left a trajectory missing its
    // mulligan rows with nothing in the result to say so (CLAUDE.md §1.2).
    if (typeof recordMulligan === "function") {
      recordMulligan({
        turn: 0,
        seat,
        pilot,
        decision: wantsShip ? "ship" : "keep",
        mulligans: ships,
      });
    }

    // KEEP (chosen, or forced at the zero-hand floor — CR 103.5: once shipped
    // STARTING_HAND_SIZE times, the next keep would bottom all 7 → 0 cards; a further ship
    // is not allowed, so treat a ship request at the floor as a forced keep).
    if (!wantsShip) {
      return applyMulliganKeep(next, seat, { ships, pilot, chooseBottom });
    }
    if (ships >= STARTING_HAND_SIZE) {
      return applyMulliganKeep(next, seat, { ships, pilot, chooseBottom, forcedFloor: true });
    }

    // SHIP — reshuffle, redraw, count.
    next = applyMulliganShip(next, seat, ships);
    ships += 1;
  }
}

/**
 * Resolve the caller's `mulligan` option into a concrete config — or null when the
 * feature is OFF (the default-off, byte-identical path). Accepts:
 *   - falsy / no `decide`  → null (OFF; startGame keeps the dealt 7 exactly as before)
 *   - { decide, pilots?, recordMulligan? }  → the active config
 * `decide` is the per-call mulligan decider; `pilots` (optional) is a per-seat
 * `{ [seatId]: pilotIdentity }` map for recorder tagging. Pure.
 */
function resolveMulligan(mulligan) {
  if (!mulligan || typeof mulligan.decide !== "function") return null;
  return {
    decide: mulligan.decide,
    pilots: mulligan.pilots || null,
    recordMulligan: typeof mulligan.recordMulligan === "function" ? mulligan.recordMulligan : null,
  };
}

/**
 * Run the start-of-game routine: stamp startingPlayer (needed by
 * draw-step skip), OPTIONALLY shuffle every library (seeded — see below),
 * draw 7, OPTIONALLY run the London mulligan keep/ship phase (opt-in — see
 * below), then apply the untap step's automatic effects so the game opens
 * at the first priority window.
 *
 * SEEDED OPENING SHUFFLE (opt-in, default-preserving):
 *   - `seed` omitted (default): libraries are NOT shuffled here — each stays
 *     in deck-list order. This keeps every existing caller and test byte-
 *     identical (the ~250-case corpus asserts deck-order opening hands).
 *   - `seed` provided: stamp `state.rngSeed = seed` and shuffle EACH seat's
 *     library deterministically via shuffleControllerLibrary (the existing
 *     threaded-rngSeed mulberry32 Fisher-Yates — CR 103.3 / 701.24a, uniform,
 *     no card lost/duplicated). Same seed ⇒ byte-identical game (reproducible
 *     for debugging); different seeds ⇒ different opening draws + game. This is
 *     what lets self-play repeat a pairing with REAL variety (the "most data"
 *     enabler for the Sim Center). Shuffle order is turnOrder so the seed→game
 *     mapping is stable across runs.
 *
 * LONDON MULLIGAN (opt-in, default-preserving — CR 103.5):
 *   - `mulligan` omitted / no `.decide` (default): NO mulligan is surfaced. The
 *     dealt opening 7s are KEPT exactly as today — this path is BYTE-IDENTICAL to
 *     the pre-slice engine (the Academy / human play / the whole corpus rely on it).
 *   - `mulligan = { decide, pilots?, recordMulligan? }` provided: after dealing 7,
 *     each seat (in turn order) runs the London keep/ship loop via
 *     runMulliganPhaseForSeat — ship ⇒ shuffle hand in, redraw 7, count it; keep ⇒
 *     bottom N (the mulligan count) cards. A pilot opts in here; the engine never
 *     imports a pilot. Per CR 103.5 the declarations are simultaneous; v1 resolves
 *     each seat in turn order (correct outcome — no cross-seat dependency in the
 *     redraw/bottom), which is sufficient for self-play and human play.
 *
 * When `mulligan` is OFF this function is byte-identical to before: the caller is
 * then expected to have already locked opening hands (or accept the dealt 7).
 */
/**
 * PREPARE the start: stamp startingPlayer (the draw-step skip reads it) and, when a `seed`
 * is given, deterministically shuffle every library in turn order. No deal, no open. Pure.
 * Extracted from startGame so the human-mulligan session can deal WITHOUT opening the game.
 */
export function prepareStart(state, { seed = null } = {}) {
  let next = { ...state, startingPlayer: state.activePlayer };
  if (seed != null) {
    // Stamp the deterministic seed, then shuffle each seat in turn order. shuffleControllerLibrary
    // advances rngSeed after each shuffle (an LCG step), so seat N is shuffled with a seed derived
    // deterministically from the prior — same `seed` ⇒ identical multi-seat shuffle, serialize-stable.
    next = { ...next, rngSeed: seed >>> 0 };
    for (const playerId of next.turnOrder || Object.keys(next.players)) {
      next = shuffleControllerLibrary(next, playerId);
    }
  }
  return next;
}

/**
 * DEAL opening hands: draw 7 to every seat in turn order (standard = user + ai; commander =
 * all four pod members). No mulligan, no open — the hands are on the table, nothing decided.
 * Call after prepareStart. Pure. This is the middle stage the human-mulligan flow pauses on.
 */
export function dealOpeningHands(state) {
  let next = state;
  for (const playerId of next.turnOrder || Object.keys(next.players)) {
    next = drawCards(next, { playerId, count: 7 });
  }
  return next;
}

/**
 * OPEN the game at the first priority window: log game-start, then run the untap step's
 * automatic actions (which include skipping the starting player's first draw). Call once the
 * opening hands are locked — dealt-and-kept, or resolved through the mulligan phase. Reads the
 * startingPlayer prepareStart stamped. Extracted from startGame so the human-mulligan session
 * can open the game after the player finishes keep/ship/bottom.
 */
export function openFirstPriority(state) {
  const next = logEvent(state, { kind: "game-start", startingPlayer: state.startingPlayer });
  // First step is untap — run its actions (which include skipping the
  // first draw for the starting player).
  return runStepActions(next);
}

export function startGame(state, { skipMulliganDraw = false, seed = null, mulligan = null } = {}) {
  let next = prepareStart(state, { seed });
  if (!skipMulliganDraw) {
    next = dealOpeningHands(next);
    // London mulligan (opt-in). OFF (mulliganCfg null) ⇒ the dealt 7s are kept untouched —
    // byte-identical to before. ON ⇒ each seat runs the keep/ship loop in turn order.
    const mulliganCfg = resolveMulligan(mulligan);
    if (mulliganCfg) {
      for (const playerId of next.turnOrder || Object.keys(next.players)) {
        next = runMulliganPhaseForSeat(next, playerId, {
          decideMulligan: mulliganCfg.decide,
          pilot: mulliganCfg.pilots ? mulliganCfg.pilots[playerId] || null : null,
          recordMulligan: mulliganCfg.recordMulligan,
        });
      }
    }
  }
  return openFirstPriority(next);
}

// ─── Misc reads ──────────────────────────────────────────────────────────────

/**
 * Step out of the current state without applying automatic actions or
 * priority. Lower-level than nextStep; used by tests that want to
 * snapshot a state at a specific step without triggering its effects.
 */
export { advanceStep as _advanceStepRaw };

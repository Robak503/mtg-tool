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
  drawCards,
  putCardsOnBottom,
  resetTurnCounters,
  resetCardsDrawnAllPlayers,
  resetSpellsCastAllPlayers,
  resetCreatureDeathsAllPlayers,
  resetAttackedThisTurnAllPlayers,
  resetBecameTargetThisTurnAllPlayers,
  untapAll,
  clearCombatDamage,
  clearRemovedFromCombatFlags,
  clearManaHolds,
  logEvent,
  mintId,
  opponentsOf,
  applyRadiation,
  addCounter,
  moveCardToZone,
} from "./gameState.js";
import { setPendingCleanupDiscardChoice } from "./pendingChoice.js";
import { resolveCombatDamage } from "./combatResolution.js";
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
  checkUntapTriggers,
  checkTapTriggers, checkCounterTriggers,
  checkGraveyardEventTriggers,
  checkSagaChapterTriggers,
  checkSacrificeTriggers,
} from "./triggers.js";
import { checkAllStateBasedActions } from "./sba.js";
import { expireContinuousEffects } from "./layers.js";
import {
  parseEffectClause,
  programConfidence,
  programNeedsChosenTarget,
  programTriggerTargetsResolvable,
  modalChooseOneRoutable,
  atomTargetIntent,
} from "./effects/parser.js";
import { expandCastChoices } from "./effects/targeting.js";
import { applyMonarchEndStepDraw } from "./effects/atoms/monarch.js";
import { applyFadeVanishUpkeep } from "./fading.js";
import { applyUrDragonAttackTriggers } from "./urDragonAttack.js";
import { applyAnnihilatorTriggers } from "./annihilator.js";
import { applyVihaanCombatAnimate } from "./vihaanAnimate.js";
import { applySeedbornUntap } from "./seedbornUntap.js";
import { applyKiraTargetCounter } from "./kiraTargetCounter.js";
import { applyMurkfiendUntap } from "./murkfiendUntap.js";
import { applyTypeFilteredUntap } from "./typeFilteredUntap.js";

import { applyWolverineEndStep, clearWolverineTurnFlags } from "./wolverine.js";
import { evaluateWinThreshold } from "./effects/atoms/winGame.js";
import { shuffleControllerLibrary } from "./effects/atoms/library.js"; // seeded opening shuffle (reuses the threaded-rngSeed mulberry32 path; library.js never imports gameEngine → no cycle)
import { drainDelayedTriggers } from "./effects/atoms/delayedTrigger.js"; // CR 603.7 scheduler drain (leaf atom module — imports only gameState, no cycle)
import { rankBottomCandidates } from "./mulliganPolicy.js"; // London bottom-N picker (leaf module, no cycle)
import { evaluateInterveningIf, interveningIfParseable } from "./interveningIf.js";
import { registerGroupTriggeredBodyValidator } from "./staticAbilityParser.js";
import { isModeledGroupTriggeredBody, combatDamageReferentSatisfied } from "./triggerRouting.js";
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
 * In v1 we treat both as auto-pass: no priority granted, no priority
 * holder set. The engine still surfaces them as discrete states so the
 * UI / narrator can show "Untap step — untapping permanents…"
 */
const NO_PRIORITY_STEPS = new Set(["untap", "cleanup"]);

function grantsPriority(step) {
  return !NO_PRIORITY_STEPS.has(step);
}

/**
 * IMPULSE-EXILE cleanup (CR 118.10 / 514.2) — the "you may play that card this turn" permission granted by an
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
    // EXTENDED WINDOW (CR 118.10 — "until the end of your NEXT turn"): the stamp survives its own turn and
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
    const cleaned = exile.map((c) => {
      if (!expired(c)) return c;
      const { _impulse: _drop, _impulseTurn: _dropTurn, _impulseExtended: _dropExt, _impulseOwner: _dropOwner, ...rest } = c;
      return rest;
    });
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

// ─── Mana emptying (CR 500.4) ──────────────────────────────────────────────────

/**
 * Empty every player's mana pool, EXCEPT colors a "doesn't empty" effect
 * preserves for that player (Omnath keeps green, Kruphix keeps all — wired
 * via cardEffects in PR 10.5; default keeps nothing). Per CR 500.4 mana
 * empties as each step and phase ends; this is the one helper all the
 * emptying checkpoints route through, so the preservation hook is honored
 * everywhere.
 */
export function emptyManaPools(state) {
  const nextPlayers = {};
  for (const pid of Object.keys(state.players)) {
    const keep = manaDoesNotEmpty(state, pid);
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
    const newPool = {};
    for (const c of MANA_COLORS) newPool[c] = keep.includes(c) ? pool[c] || 0 : Math.min(pool[c] || 0, hold[c] || 0);
    nextPlayers[pid] = { ...state.players[pid], manaPool: newPool };
  }
  return { ...state, players: nextPlayers };
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
  if (state.step === "end-of-combat") {
    const queued = state.extraPhases || [];
    if (queued.length > 0) {
      const bocIdx = TURN_SEQUENCE.findIndex((e) => e.step === "beginning-of-combat");
      if (bocIdx !== -1) {
        return {
          ...emptied,
          extraPhases: queued.slice(0, -1), // LIFO — most recently created occurs first (CR 500.8)
          phase: TURN_SEQUENCE[bocIdx].phase,
          step: TURN_SEQUENCE[bocIdx].step,
          combat: null,                     // a NEW combat: last combat's attackers/blockers do not carry over
          priorityHolder: null,
          consecutivePasses: 0,
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
    if (state.step === "declare-attackers" && (state.combat?.attackers || []).length === 0) {
      const eoc = TURN_SEQUENCE.findIndex((e) => e.step === "end-of-combat");
      if (eoc !== -1) next = TURN_SEQUENCE[eoc];
    }
    return {
      ...emptied,
      phase: next.phase,
      step: next.step,
      priorityHolder: null,
      consecutivePasses: 0,
    };
  }

  // EXTRA TURN (BLITZ XT-1, CR 500.7): if any extra turns are queued, the MOST RECENTLY created one is
  // taken next (a LIFO pop — CR 500.7's "taken … in the reverse of the order they were created") instead
  // of rotating. The extra turn is a full normal turn (turn counter still advances — CR: it IS a turn);
  // once the stack drains, the pop-less branch below rotates from the LAST taker, which lands on the
  // normally-scheduled seat with no extra bookkeeping.
  const xt = state.extraTurns || [];
  if (xt.length > 0) {
    const taker = xt[xt.length - 1];
    return {
      ...emptied,
      extraTurns: xt.slice(0, -1),
      activePlayer: taker.player,
      turn: state.turn + 1,
      phase: "beginning",
      step: "untap",
      priorityHolder: null,
      consecutivePasses: 0,
    };
  }

  // End of turn — next player's turn begins at (beginning, untap).
  const nextActive = nextInTurnOrder(state, state.activePlayer);
  return {
    ...emptied,
    activePlayer: nextActive,
    turn: state.turn + 1,
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

  switch (state.step) {
    case "untap":
      next = emptyManaPools(next);
      next = resetTurnCounters(next, { playerId: state.activePlayer });
      next = resetCardsDrawnAllPlayers(next); // TRIG-DRAW2: "draw your second card each turn" counts every seat's draws this turn
      next = resetSpellsCastAllPlayers(next); // TRIG-CAST2: ditto for "cast your second spell each turn"
      next = resetCreatureDeathsAllPlayers(next); // DEATHS-THIS-TURN: "for each / if a creature died this turn" counts every seat's deaths this turn
      next = resetAttackedThisTurnAllPlayers(next); // RAID: "you attacked this turn" — clear every seat's attack flag at untap
      next = resetBecameTargetThisTurnAllPlayers(next); // KIRA: "for the first time each turn" — clear every permanent's became-target flag at untap
      next = { ...next, onceTriggersFiredThisTurn: {} }; // ONCE-PER-TURN: clear per-source discover gates (Pantlaza, etc.)
      next = untapAll(next, { playerId: state.activePlayer });
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
      next = applyTypeFilteredUntap(next, state.activePlayer);
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
      if (
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
        next = drawCards(next, { playerId: state.activePlayer, count: 1 });
        // TRIG-DRAW (CR 121.1): the turn-based draw is a draw → fire "Whenever you draw a card". Guard on
        // the real delta so a decked-out draw step (drew 0) doesn't fire.
        if (next.players[state.activePlayer].cardsDrawnThisTurn > drawnBefore) {
          next = checkCardDrawnTriggers(next, state.activePlayer, 1);
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
      // First-strike + double-strike creatures deal here; the call no-ops when
      // none have it (CR 510.4 — a first-strike/double-strike combatant creates this
      // first combat-damage step). Lethal first-strike damage kills before the
      // regular step, so those creatures never deal back.
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

  // Step-boundary triggers (CR 603.2b) and attack triggers (CR 508.3). Attack
  // triggers fire at the declare-blockers step, when the full attacker batch is
  // in state.combat.attackers. Enqueued here, then flushed onto the stack below.
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
  else if (next.step === "beginning-of-combat") next = checkStepTriggers(next, "combatBegin");
  // VIHAAN-ANIMATE (a targeted #319-style hook the trigger compiler can't reach): at the beginning-of-combat
  // step, Vihaan, Goldwaker makes every Treasure the ACTIVE player controls a 3/3 Construct Assassin artifact
  // creature until end of turn — a MASS, optional, subject-scoped layer-4 animate the effect vocabulary can't
  // model (no mass-animate-your-permanents atom). Applied synchronously via the SHIPPED WALT-ANIMATE layer
  // framework (vihaanAnimate.js); a no-op when no Vihaan-style watcher is on the active player's board. Fired
  // right after the combatBegin step trigger so the now-creature Treasures are full combat participants for the
  // attack/block declarations that follow this step.
  if (next.step === "beginning-of-combat") next = applyVihaanCombatAnimate(next);
  if (next.phase === "precombat-main" && next.step === "main")
    next = checkStepTriggers(next, "firstMain");
  // secondMain (CR 505.1b) — the postcombat sibling. Gated on the PHASE for the same reason firstMain is:
  // both main phases share step "main", so a step-only gate fires at both and the "second main" trigger
  // would go off before combat as well. Michelangelo, the Heart is the shelf card behind it.
  if (next.phase === "postcombat-main" && next.step === "main")
    next = checkStepTriggers(next, "secondMain");
  if (next.step === "declare-blockers") {
    next = checkAttackTriggers(next);
    // NOTE (subsystem 2): block / becomes-blocked / bushido / rampage triggers do NOT fire here — at the
    // declare-blockers STEP ENTRY combat.blockers is still empty (blocks are declared DURING the step). They
    // fire in nextStep when LEAVING declare-blockers (blockers fully declared) so they resolve before damage.
    // The Ur-Dragon variable-count attack trigger (a targeted #319-style hook the compiler can't reach):
    // resolves draw-that-many + may-cheat-a-permanent synchronously, enqueuing its cardDrawn/ETB sub-triggers
    // for the same flush below. Fired AFTER checkAttackTriggers so its draw lands after the normal attack-
    // trigger enqueue, and its own sub-triggers ride the line-302 flush.
    next = applyUrDragonAttackTriggers(next);
    // (The Wise Mothman's rad hook is GONE — SHELF C1's "enters or attacks" disjunction split binds the
    // trigger generically through detectTriggers, so the attack half now rides checkAttackTriggers like
    // any printed attack trigger. Keeping the hook would double-fire the rad — the coordination note
    // mothmanRad.js carried from day one.)
    // KW-ANNIHILATOR (CR 702.86a): "Whenever this creature attacks, defending player sacrifices N permanents."
    // A #319-style combat hook reusing the SHIPPED edict sacrifice chain — each attacking annihilator obligates
    // its defending player to sacrifice N permanents of their choice (pooled into one FIFO-safe chain). The
    // human defender gets a real picker via the learnSession sacrifice-choice loop; an AI auto-sacs its weakest.
    // May set state.pendingChoice (a human pick), which the session driver settles before combat advances.
    // No-op when no annihilator is attacking. See annihilator.js for the multi-attacker FIFO rationale.
    next = applyAnnihilatorTriggers(next);
  }

  if (grantsPriority(next.step)) {
    next = grantPriority(next);
  }

  // Flush any pending triggers onto the stack at this priority-grant
  // checkpoint, per CR 603.3a — triggered abilities go on the stack at
  // the next time a player would get priority.
  next = flushTriggers(next, { chooseTargets: chooseTriggerTargets });

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
  if ((player.battlefield || []).some((p) => NO_MAX_HAND_RE.test(oracleOf(p)))) return 0;
  for (const pl of Object.values(state.players)) {
    for (const p of pl.battlefield || []) {
      const o = oracleOf(p);
      if (MAX_HAND_RE.test(o) && !NO_MAX_HAND_RE.test(o)) return 0;
    }
  }
  return Math.max(0, (player.hand || []).length - 7);
}

/**
 * The CR 514.2/514.3a cleanup tail — everything cleanup does AFTER the 514.1 hand-size discard:
 * damage wears off, per-turn flags reset, "until end of turn" effects expire, and the SBA fixpoint
 * re-checks the post-expiry board. Deferred behind the discard pendingChoice when one is raised;
 * run inline when the hand is already legal.
 */
export function finishCleanupActions(state) {
  let next = emptyManaPools(state);
  next = clearCombatDamage(next); // combat damage wears off at end of turn
  next = clearWolverineTurnFlags(next); // WOLVERINE clause 2: reset the per-turn dealt-damage flag (CR 514.2)
  next = clearImpulsePlayPermissions(next); // IMPULSE-EXILE (CR 118.10): the "play that card this turn" permission lapses
  // "Until end of turn" continuous effects wear off here (CR 514.2) — pump
  // (Giant Growth etc.) registered as endOfTurn-duration layer effects expire.
  next = expireContinuousEffects(next, { atCleanupOfTurn: next.turn });
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

/**
 * Advance one step and apply its automatic actions. The common
 * combination. Returns a fresh state at the new step with all
 * automatic effects applied + priority granted if applicable.
 */
export function nextStep(state) {
  // BLOCK TRIGGERS (subsystem 2, CR 509.4): when LEAVING declare-blockers, blocks are now fully declared
  // (combat.blockers populated by applyDeclareBlocker). Fire block / becomes-blocked / bushido / rampage
  // triggers and flush them onto the stack BEFORE advancing — so they resolve (with priority) ahead of
  // combat damage, exactly like attack triggers. Guard with combat._blockTriggersFired so it fires ONCE
  // per combat (the flag rides combat state and is cleared when combat resets to EMPTY_COMBAT at end-of-
  // combat). If any trigger enqueues, HOLD in declare-blockers (priority back to the active player) for
  // resolution instead of advancing to the damage step; if none, advance from the flag-marked state.
  if (state.step === "declare-blockers" && !state.combat?._blockTriggersFired) {
    let s = checkBlockTriggers(state);
    s = { ...s, combat: { ...(s.combat || {}), _blockTriggersFired: true } };
    s = flushTriggers(s, { chooseTargets: chooseTriggerTargets });
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
  const passes = (state.consecutivePasses || 0) + 1;
  const newHolder = nextInTurnOrder(state, state.priorityHolder);

  // A step ends / the stack resolves only once every player has passed
  // in succession (CR 117.4 / 405.5). Standard = 2 seats; Commander = 4.
  // Any action taken resets consecutivePasses to 0, so this counts a
  // full lap of the table with no one acting.
  const playerCount = Object.keys(state.players).length;
  if (passes >= playerCount) {
    // Every player passed in succession.
    if (state.stack.length === 0) {
      // Empty stack — step ends. Advance to the next step + apply
      // its automatic actions.
      return nextStep({ ...state, priorityHolder: null, consecutivePasses: 0 });
    }
    // Non-empty stack — top resolves. resolveTopOfStack also resets
    // priority back to the active player.
    return resolveTopOfStack({ ...state, consecutivePasses: 0 });
  }

  return {
    ...state,
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
  const remainingStack = state.stack.slice(0, -1);

  let next = { ...state, stack: remainingStack };

  // Phase-7 data-driven path: payload.resolver -> serializable registry. This is
  // checked FIRST; the legacy closure branch below is the additive fallback that
  // production stops using in PR-3 (kept thereafter for tests + the Arbiter
  // escape valve per D6). No production stack object sets payload.resolver until
  // PR-3, so existing behavior is byte-identical here.
  const resolver = getResolver(top.payload?.resolver);
  if (resolver) {
    try {
      next = resolver(next, top) || next;
    } catch (error) {
      next = logEvent(next, {
        kind: "stack-resolve-error",
        objectId: top.id,
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
  let next = checkAllStateBasedActions(state);
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
  return next;
}

/**
 * CR 714.4 — sacrifice each finished Saga: lore ≥ sagaFinal AND none of its chapter abilities pending or
 * on the stack. The sacrifice mirrors the dispatcher's non-creature cost-sacrifice flow exactly
 * (moveCardToZone → checkLeavesTriggers → checkSacrificeTriggers), so LTB + "you sacrifice" watchers fire
 * like any other sacrifice. Pure; a board with no finished Saga is a no-op.
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
      next = moveCardToZone(next, {
        playerId: pid,
        fromZone: "battlefield",
        toZone: "graveyard",
        cardId: perm.id,
      });
      next = checkLeavesTriggers(next);
      next = checkSacrificeTriggers(next, pid, { id: perm.id, controller: pid, card: perm.card });
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
 * Move every pending trigger onto the stack. Each trigger's controller
 * orders their own triggers, then APNAP (active player first) interleaves
 * — for v1 we just put them on the stack in (active-player triggers,
 * non-active triggers) order, preserving FIFO within each group. That's
 * a close-enough approximation for the common case; complex orderings
 * (Sundial of the Infinite, conflict between multiple "your triggers")
 * are an Arbiter case.
 */
/**
 * Order simultaneous triggers APNAP across ALL seats (CR 603.3b): active player
 * first, then the rest in turn order; FIFO within each controller. Triggers
 * whose controller has left the game (eliminated, CR 800.4a) are dropped because
 * the rotation only walks live seats. Generalizes the old 2-bucket split to the
 * Commander 4-seat pod.
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
 * legal — telling buildTriggerStack to route the trigger to the Arbiter no-op rather than first-legal
 * a friendly (the self-harm hazard the α1 allowlist guards). Distinct from `undefined`, which keeps
 * the legacy "fall back to first-legal" contract for a generic / absent chooser.
 */
export const NO_SAFE_TARGET = Symbol("no-safe-trigger-target");

/**
 * Build the serializable stack payload + chosen targets a pending trigger goes on the
 * stack with — or `null` to DROP it (CR 603.3c/608.2b: a triggered ability that needs
 * a target with no legal target is removed from the stack, it never resolves).
 *
 * Routing (mirrors coverage.permanentTriggersCovered exactly so the metric can't drift
 * from the runtime):
 *  - HIGH, non-modal, NON-targeted, no intervening-if → EFFECT_PROGRAM, empty targets.
 *    Inherits the whole P2.x atom family (draw / token / each-opponent / …).
 *  - HIGH, non-modal, TARGETED, no intervening-if → enumerate the legal targets at
 *    flush time via expandCastChoices (CR 603.3c — targets chosen as the ability goes
 *    on the stack). No legal target → DROP; else the chooser picks (default first-legal)
 *    and the atomIndex-tagged targets ride onto the EFFECT_PROGRAM payload, so the
 *    interpreter binds each chosen target to its clause.
 *  - everything else (MODAL fallthrough; INTERVENING-IF outside the strict evaluators;
 *    unparseable) → the manual/Arbiter no-op payload the trigger already carries
 *    (W4: the naive Phase-1 vocab is deleted), never a fabricated effect (CLAUDE.md §1.2).
 */
// Distinct sentinel for a CR 603.4 intervening-if condition-not-met removal — the ability is correctly NOT put
// on the stack, but this is EXPECTED (a false intervening-if), NOT a CR 603.3c no-legal-target fizzle. buildTriggerStack
// returns this instead of bare null so the caller logs `trigger-condition-not-met` (not `trigger-removed-no-target`),
// which kept polluting the no-target breakage pile (Garruk's Uprising 307×, Inventors' Fair 194×, … — all correct
// condition-skips, e.g. Garruk's ETB draw cast before a power-4 creature is out).
const TRIGGER_CONDITION_NOT_MET = Object.freeze({ removed: "intervening-if-not-met" });

function buildTriggerStack(state, trigger, chooseTargets) {
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
        const candidates = expandCastChoices(state, trigger.controller, condProgram, [], {
          ...(trigger.context || {}),
          sourceId: trigger.context?.sourceId ?? trigger.source?.permanentId ?? null,
        });
        if (candidates.length === 0) return null; // no legal target → removed (CR 603.3c)
        const picked =
          typeof chooseTargets === "function"
            ? chooseTargets(candidates, { trigger, program: condProgram, state })
            : undefined;
        if (picked === NO_SAFE_TARGET) return { payload: { resolver: "manual" }, targets: [] };
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
      // Targeted trigger: choose targets as it's put on the stack (CR 603.3c). The
      // restriction-aware enumerator (expandCastChoices → enumerateTargets) only
      // surfaces LEGAL targets, so a restricted clause ("…an opponent controls")
      // never offers an illegal pick. trigger.context is threaded so a who:"defendingPlayer"
      // restriction ("… defending player controls" — Kogla's attacks trigger) enumerates
      // ONLY the attacked player's permanents (ctx.defenderId, set by checkAttackTriggers).
      // SOURCE THREADING (skeptic-caught FP): excludeSource/notSource restrictions ("another target ...")
      // were inert on the TRIGGER path — ctx carried no sourceId, so Prowler's counter landed on Prowler.
      // Thread the trigger's source permanent (the same id baseParams carries) into the enumeration ctx.
      const candidates = expandCastChoices(state, trigger.controller, program, [], {
        ...(trigger.context || {}),
        sourceId: trigger.context?.sourceId ?? trigger.source?.permanentId ?? null,
      });
      if (candidates.length === 0) return null; // no legal target → removed from the stack (CR 603.3c)
      const picked =
        typeof chooseTargets === "function"
          ? chooseTargets(candidates, { trigger, program, state })
          : undefined;
      // NO_SAFE_TARGET: the enemy/own chooser found no correct-side target → route to the Arbiter
      // no-op rather than first-legal a friendly (false-negative SAFE). A numeric index or a candidate
      // object is honored; anything else (a generic / absent chooser) keeps the legacy first-legal pick.
      if (picked === NO_SAFE_TARGET) return { payload: { resolver: "manual" }, targets: [] };
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
      const candidates = expandCastChoices(state, trigger.controller, program, [], {
        ...(trigger.context || {}),
        sourceId: trigger.context?.sourceId ?? trigger.source?.permanentId ?? null,
      });
      // No mode is castable (every mode needs a target none of which is legal) → the ability is removed
      // from the stack (CR 603.3c / 700.2d). A non-targeted mode is always castable, so this only fires
      // when EVERY mode is fully target-gated and unsatisfiable.
      if (candidates.length === 0) return null;
      const picked =
        typeof chooseTargets === "function"
          ? chooseTargets(candidates, { trigger, program, state })
          : undefined;
      // No mode resolves to a provably-correct-side target (every mode is targeted + mis-sideable) → Arbiter
      // no-op rather than risk friendly fire (false-negative SAFE). A non-targeted mode would be a safe
      // candidate, so this only happens when no safe mode exists at all.
      if (picked === NO_SAFE_TARGET) return { payload: { resolver: "manual" }, targets: [] };
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
 * α1 — the enemy/own-aware trigger-target chooser. Injected at the LIVE flush call-sites so a
 * targeted triggered ability picks a target on the side the card intends instead of blind first-legal:
 * removal / damage / counter / tap / -X-X → an OPPONENT's permanent / spell / the opponent; a buff /
 * +1/+1 / untap / graveyard-return → the controller's OWN. Returns the FIRST candidate whose every
 * target sits on its atom's intended side (deterministic over the enumeration order → serialize-stable);
 * if none exists (no correct-side target is legal), returns the NO_SAFE_TARGET sentinel so
 * buildTriggerStack routes the trigger to the Arbiter no-op rather than first-legal a friendly
 * (false-negative SAFE). Ambiguous atoms (bounce) never reach here — buildTriggerStack gates them to
 * the Arbiter too. Pure function of `info.state`.
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
  let enemies;
  try {
    enemies = new Set(opponentsOf(state, controller));
  } catch {
    return undefined;
  }
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
  return candidates.find((c) => (c.targets || []).every(targetOk(atomsFor(c)))) || NO_SAFE_TARGET;
}

/**
 * Move every pending trigger onto the stack at this priority-grant checkpoint (CR
 * 603.3). Targets for a targeted trigger are chosen HERE, as the ability goes on the
 * stack (CR 603.3c); pass `{ chooseTargets }` to override the default first-legal
 * pick (an AI/Beginner-interactive chooser). A targeted trigger with no legal target
 * is dropped (logged, not silent).
 */
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
  const pending = state.pendingTriggers || [];
  if (pending.length === 0) return state;

  const ordered = orderTriggersAPNAP(state, pending);

  // Mint a deterministic stack id for any trigger without one (real triggers
  // from triggers.js carry no id; some tests pass explicit ids). Thread state so
  // idSeq advances per mint and the result is serialize-stable. Target enumeration
  // reads the (board-identical) threaded state — minting never touches the battlefield,
  // so every simultaneous trigger chooses against the same flush-time board.
  let s = state;
  const newStackObjects = [];
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
    const built = buildTriggerStack(s, trigger, chooseTargets);
    if (built === TRIGGER_CONDITION_NOT_MET) {
      // CR 603.4 — the intervening-if condition was false at trigger time; the ability CORRECTLY never goes on
      // the stack. This is EXPECTED (e.g. Garruk's Uprising's ETB "if you control a creature with power 4+, draw"
      // cast before a power-4 creature is out), NOT a CR 603.3c no-legal-target fizzle. Log it DISTINCTLY so
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
      // A targeted trigger with no legal target is removed from the stack (CR 603.3c).
      // Log it so the removal is visible to the player, never a silent disappearance.
      s = logEvent(s, {
        kind: "trigger-removed-no-target",
        source: trigger.source?.name || trigger.source,
        controller: trigger.controller,
      });
      continue;
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
    });
  }

  let out = {
    ...s,
    stack: [...s.stack, ...newStackObjects],
    pendingTriggers: [],
  };
  // BECOMES-TARGET (CR 603.2 — the Phantasmal Illusion family): a TRIGGERED ability that chose a target (bound
  // above at stack time, CR 603.3c) may target a permanent carrying the "becomes the target … sacrifice it"
  // trigger. This is the 4th and final target-choice site (the spell-cast / activated-ability / loyalty sites
  // live in actionDispatcher). Fire the sac trigger for each just-created triggered-ability stack object, then
  // recurse to put it ABOVE them (CR 603.3b — it resolves first, sacrificing the creature, so the targeting
  // triggered ability is countered on resolution if it lost its only legal target). Recursion terminates: a
  // sacrifice-it trigger targets nothing, so its own stack object never re-triggers this. No-op (no re-flush)
  // when no new triggered ability targeted a becomes-target permanent — the common case, byte-identical to before.
  for (const so of newStackObjects) {
    out = checkBecomesTargetTriggers(out, so);
    // KIRA (kiraTargetCounter.js): this 4th target-choice site also raises Kira's hard counter — a TRIGGERED
    // ability targeting an eligible-and-fresh Kira-protected creature is countered outright (CR 603.2 — "a
    // spell or ability" includes a triggered ability). No-op when no Kira source is in play. counterSpellById
    // removes the just-created triggered-ability stack object (no zone change — it's not a card), so the
    // recursion below never re-flushes a countered object.
    out = applyKiraTargetCounter(out, so);
  }
  if ((out.pendingTriggers || []).length) {
    return flushTriggers(out, { chooseTargets });
  }
  return out;
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
 *     payload can never strand setup or bottom the wrong count.
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
      let picked;
      try {
        picked = chooseBottom({ state: next, seat, count: ships, hand });
      } catch (err) {
        if (typeof console !== "undefined" && console.warn) {
          console.warn(
            `[learn] chooseBottom threw (falling back to heuristic): ${err?.message || err}`,
          );
        }
        picked = null;
      }
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
 * never strand setup or over-mulligan); a throw is swallowed → KEEP. `chooseBottom` (optional)
 * is forwarded to the keep step so a caller can pick the bottomed cards; absent ⇒ the worst-N
 * heuristic (byte-identical). `recordMulligan` (optional) is invoked once per decision.
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
      // A throwing pilot must never abort game setup — default to KEEP.
      if (typeof console !== "undefined" && console.warn) {
        console.warn(`[learn] decideMulligan threw (keeping): ${err?.message || err}`);
      }
      action = { kind: "mulligan-keep" };
    }
    // Anything that isn't a clean "mulligan-ship" → KEEP (the safe default — a garbage /
    // out-of-set / learned-pilot return can never force an extra mulligan or strand setup).
    const wantsShip = action && action.kind === "mulligan-ship";

    // Record the decision (opt-in, crash-isolated).
    if (typeof recordMulligan === "function") {
      try {
        recordMulligan({
          turn: 0,
          seat,
          pilot,
          decision: wantsShip ? "ship" : "keep",
          mulligans: ships,
        });
      } catch (err) {
        if (typeof console !== "undefined" && console.warn) {
          console.warn(`[learn] recordMulligan threw (ignored): ${err?.message || err}`);
        }
      }
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
 *     threaded-rngSeed mulberry32 Fisher-Yates — CR 103.2 / 701.19e, uniform,
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

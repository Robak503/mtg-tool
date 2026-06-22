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
  resetTurnCounters,
  resetCardsDrawnAllPlayers,
  resetSpellsCastAllPlayers,
  untapAll,
  clearCombatDamage,
  logEvent,
  mintId,
  opponentsOf,
  applyRadiation,
} from "./gameState.js";
import { resolveCombatDamage } from "./combatResolution.js";
import { manaDoesNotEmpty } from "./cardEffects.js";
import { getResolver } from "./resolvers.js";
import { checkStepTriggers, checkAttackTriggers, checkCardDrawnTriggers, checkMilledTriggers } from "./triggers.js";
import { expireContinuousEffects } from "./layers.js";
import { parseEffectClause, programConfidence, programNeedsChosenTarget, programTriggerTargetsResolvable, atomTargetIntent } from "./effects/parser.js";
import { expandCastChoices } from "./effects/targeting.js";
import { applyFadeVanishUpkeep } from "./fading.js";
import { applyUrDragonAttackTriggers } from "./urDragonAttack.js";
import { applyMothmanRadOnAttack } from "./mothmanRad.js";

const EMPTY_COMBAT = { attackers: [], blockers: [] };

// ─── Step ordering ────────────────────────────────────────────────────────────

/**
 * Flattened (phase, step) sequence — the order they happen in a turn.
 * The engine walks this list. After the last entry, the turn ends and
 * the next player gets a turn.
 */
const TURN_SEQUENCE = PHASES.flatMap(phase => STEPS[phase].map(step => ({ phase, step })));

function findSequenceIndex(phase, step) {
  return TURN_SEQUENCE.findIndex(entry => entry.phase === phase && entry.step === step);
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
    const newPool = {};
    for (const c of MANA_COLORS) newPool[c] = keep.includes(c) ? (pool[c] || 0) : 0;
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

  if (index + 1 < TURN_SEQUENCE.length) {
    const next = TURN_SEQUENCE[index + 1];
    return {
      ...emptied,
      phase: next.phase,
      step: next.step,
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
      next = { ...next, onceTriggersFiredThisTurn: {} }; // ONCE-PER-TURN: clear per-source discover gates (Pantlaza, etc.)
      next = untapAll(next, { playerId: state.activePlayer });
      next = logEvent(next, { kind: "step", phase: "beginning", step: "untap", player: state.activePlayer });
      break;

    case "draw":
      // Per CR 103.7a, the player whose turn it is the very first turn
      // skips their draw step. We track that via turn === 1 and the
      // active player being whoever started.
      if (next.turn === 1 && state.activePlayer === state.startingPlayer) {
        next = logEvent(next, { kind: "step", phase: "beginning", step: "draw", player: state.activePlayer, skipped: "first-turn-draw" });
      } else {
        const drawnBefore = next.players[state.activePlayer].cardsDrawnThisTurn;
        next = drawCards(next, { playerId: state.activePlayer, count: 1 });
        // TRIG-DRAW (CR 121.1): the turn-based draw is a draw → fire "Whenever you draw a card". Guard on
        // the real delta so a decked-out draw step (drew 0) doesn't fire.
        if (next.players[state.activePlayer].cardsDrawnThisTurn > drawnBefore) {
          next = checkCardDrawnTriggers(next, state.activePlayer, 1);
        }
        next = logEvent(next, { kind: "step", phase: "beginning", step: "draw", player: state.activePlayer });
      }
      break;

    case "cleanup":
      next = emptyManaPools(next);
      next = clearCombatDamage(next); // combat damage wears off at end of turn
      // "Until end of turn" continuous effects wear off here (CR 514.2) — pump
      // (Giant Growth etc.) registered as endOfTurn-duration layer effects expire.
      next = expireContinuousEffects(next, { atCleanupOfTurn: next.turn });
      // Discard-to-hand-size is deferred to a later PR (the engine needs hand max).
      next = logEvent(next, { kind: "step", phase: "ending", step: "cleanup", player: state.activePlayer });
      break;

    case "beginning-of-combat":
      // Start each combat from a clean slate (ensureCombat never resets, and
      // clearCombat was never wired in — combat assignments would otherwise leak
      // across turns and pile onto the next attack).
      next = { ...next, combat: { ...EMPTY_COMBAT } };
      next = logEvent(next, { kind: "step", phase: "combat", step: "beginning-of-combat", player: state.activePlayer });
      break;

    case "first-strike-damage":
      // First-strike + double-strike creatures deal here; the call no-ops when
      // none have it (CR 510.4 — a first-strike/double-strike combatant creates this
      // first combat-damage step). Lethal first-strike damage kills before the
      // regular step, so those creatures never deal back.
      next = resolveCombatDamage(next, { firstStrikeStep: true });
      next = logEvent(next, { kind: "step", phase: "combat", step: "first-strike-damage", player: state.activePlayer });
      break;

    case "combat-damage":
      // Regular combat damage: everyone WITHOUT first strike (plus double
      // strikers again). Kills lethally-damaged creatures, drops unblocked /
      // trample damage onto the defending player.
      next = resolveCombatDamage(next, { firstStrikeStep: false });
      next = logEvent(next, { kind: "step", phase: "combat", step: "combat-damage", player: state.activePlayer });
      break;

    case "end-of-combat":
      next = { ...next, combat: { ...EMPTY_COMBAT } };
      next = logEvent(next, { kind: "step", phase: "combat", step: "end-of-combat", player: state.activePlayer });
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
        if (radBefore > 0) next = logEvent(next, { kind: "radiation", phase: state.phase, player: state.activePlayer, radCounters: radBefore });
        if (radMilled.length > 0) next = checkMilledTriggers(next, { milledByPlayer: state.activePlayer, milledCards: radMilled });
      }
      next = logEvent(next, { kind: "step", phase: state.phase, step: state.step, player: state.activePlayer });
      break;
    }

    default:
      // upkeep, other combat steps — no automatic state mutation.
      next = logEvent(next, { kind: "step", phase: state.phase, step: state.step, player: state.activePlayer });
      break;
  }

  // Step-boundary triggers (CR 603.2b) and attack triggers (CR 508.3). Attack
  // triggers fire at the declare-blockers step, when the full attacker batch is
  // in state.combat.attackers. Enqueued here, then flushed onto the stack below.
  // KW-FADING / KW-VANISHING (CR 702.32a / 702.63a): at the active player's upkeep, remove a fade/time
  // counter from each of their fading/vanishing permanents and sacrifice per the rule — BEFORE the upkeep
  // triggers flush, so a vanishing permanent's dies-trigger sits correctly in the queue.
  if (next.step === "upkeep") next = applyFadeVanishUpkeep(next);
  if (next.step === "upkeep") next = checkStepTriggers(next, "upkeep");
  else if (next.step === "draw") next = checkStepTriggers(next, "draw");
  else if (next.step === "end") next = checkStepTriggers(next, "endStep");
  // PHASE-TRIGGER-FRAMEWORK (Wave 1): emit the two phase-boundary triggers the spine detected but never
  // fired. detectPhaseTrigger (registered in triggers.js) classifies them; checkStepTriggers fires any
  // event generically (triggersForEvent matches on descriptor.event). Wired alongside the existing step
  // emissions and BEFORE the priority/flush block below so they ride the same flush onto the stack.
  //  - combatBegin: at the beginning-of-combat step. whose:"yours" ("...on your turn") gates to the active
  //    player in triggersForEvent; whose:"any" ("each combat", Unnatural Growth) fires regardless of turn.
  //  - firstMain: at the PRECOMBAT main only (gate on phase — both main phases share step "main"); else it
  //    would fire twice (a postcombat-main double-fire is the landmine here).
  else if (next.step === "beginning-of-combat") next = checkStepTriggers(next, "combatBegin");
  if (next.phase === "precombat-main" && next.step === "main") next = checkStepTriggers(next, "firstMain");
  if (next.step === "declare-blockers") {
    next = checkAttackTriggers(next);
    // The Ur-Dragon variable-count attack trigger (a targeted #319-style hook the compiler can't reach):
    // resolves draw-that-many + may-cheat-a-permanent synchronously, enqueuing its cardDrawn/ETB sub-triggers
    // for the same flush below. Fired AFTER checkAttackTriggers so its draw lands after the normal attack-
    // trigger enqueue, and its own sub-triggers ride the line-302 flush.
    next = applyUrDragonAttackTriggers(next);
    // The Wise Mothman "enters or attacks → each player gets a rad counter" — attack half (#319-style hook;
    // the ETB half rides checkEnterTriggers). Grants rad synchronously for each Mothman in the attacker
    // batch; a no-op when none is attacking. See mothmanRad.js for the compound-event-guard rationale.
    next = applyMothmanRadOnAttack(next);
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

/**
 * Advance one step and apply its automatic actions. The common
 * combination. Returns a fresh state at the new step with all
 * automatic effects applied + priority granted if applicable.
 */
export function nextStep(state) {
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
  let next = flushTriggers(state, { chooseTargets: chooseTriggerTargets });
  if (grantsPriority(next.step)) {
    next = resetPriorityLoop(next);
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
  for (const pid of rotated) out.push(...pending.filter(t => t.controller === pid));
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
 *  - everything else (MODAL — would silently pick a mode; INTERVENING-IF — condition
 *    unevaluated at flush; unparseable) → the small `trigger.effect` fallback (→ the
 *    Phase-1 vocab or the Arbiter), never a fabricated effect (CLAUDE.md §1.2).
 */
function buildTriggerStack(state, trigger, chooseTargets) {
  const clause = trigger.descriptor?.effectClause;
  if (clause && !trigger.descriptor?.interveningIf) {
    // Parse the trigger's effect clause as spell-like text: a triggered ability's
    // effect resolves exactly as a spell would, and the legacy effect parser
    // (spellEffects.parseSpellEffect) only engages for Instant/Sorcery types — so
    // pass "Instant" to unlock draw/damage/destroy off a permanent source.
    const program = parseEffectClause(clause, "Instant");
    // α1 ALLOWLIST: route a HIGH non-modal trigger natively only when every chosen-target atom is
    // intent-resolvable — i.e. the enemy/own chooser (chooseTriggerTargets, wired in at the live
    // flush call-sites) can prove a correct-side pick: removal/damage/counter/tap/-X-X → an opponent,
    // a buff/+1/+1/untap/graveyard-return → the controller's own. An AMBIGUOUS atom (bounce, or any
    // unmodeled-intent targeting atom) falls through to the Arbiter no-op below rather than risk a
    // first-legal friendly target (CLAUDE.md §1.2). Non-targeted programs always route (no chosen
    // target to mis-pick). This SUBSUMES the old counter / chosen-permanent-removal denylist AND
    // closes the latent first-legal-friendly hazard on unrestricted creature-destroy / damage triggers.
    if (program && programConfidence(program) === "high" && program.structure !== "modal" && (!programNeedsChosenTarget(program) || programTriggerTargetsResolvable(program))) {
      // sourceId = the trigger's SOURCE permanent (CR 113.7) — lets a "this creature gets …" /
      // "put a +1/+1 counter on this creature" self atom resolve to the source on the non-targeted path.
      const baseParams = { program, controller: trigger.controller, context: trigger.context, sourceId: trigger.source?.permanentId };
      if (!programNeedsChosenTarget(program)) {
        return { payload: { resolver: "effect-program", params: { ...baseParams, targets: [] } }, targets: [] };
      }
      // Targeted trigger: choose targets as it's put on the stack (CR 603.3c). The
      // restriction-aware enumerator (expandCastChoices → enumerateTargets) only
      // surfaces LEGAL targets, so a restricted clause ("…an opponent controls")
      // never offers an illegal pick.
      const candidates = expandCastChoices(state, trigger.controller, program);
      if (candidates.length === 0) return null; // no legal target → removed from the stack (CR 603.3c)
      const picked = typeof chooseTargets === "function" ? chooseTargets(candidates, { trigger, program, state }) : undefined;
      // NO_SAFE_TARGET: the enemy/own chooser found no correct-side target → route to the Arbiter
      // no-op rather than first-legal a friendly (false-negative SAFE). A numeric index or a candidate
      // object is honored; anything else (a generic / absent chooser) keeps the legacy first-legal pick.
      if (picked === NO_SAFE_TARGET) return { payload: { resolver: "manual" }, targets: [] };
      const choice = (typeof picked === "number" && candidates[picked]) ? candidates[picked]
        : (picked && Array.isArray(picked.targets)) ? picked
        : firstLegalChoice(candidates);
      const targets = choice?.targets || [];
      return { payload: { resolver: "effect-program", params: { ...baseParams, targets } }, targets };
    }
    // Route to a NO-OP (NOT the unanchored legacy fallback, which would sub-phrase-match a partial)
    // when, non-modal, the program is either:
    //   - LOW = a trigger whose effect ISN'T fully modeled (an unmodeled clause or a follow-up like
    //     "… If a land card was milled this way, you gain 2 life"); the rich parser is a superset of
    //     the legacy vocab, so LOW means genuinely unmodeled; or
    //   - HIGH but carries an AMBIGUOUS chosen target (e.g. bounce) the α1 chooser can't place on a
    //     provably-correct side — firing it with first-legal could hit the controller's OWN
    //     permanent. Explicit no-op (→ Arbiter); false-negative SAFE.
    // (MODAL / intervening-if still use the fallback below — that's deliberate.)
    if (program.structure !== "modal" && (programConfidence(program) === "low" || (programNeedsChosenTarget(program) && !programTriggerTargetsResolvable(program)))) {
      return { payload: { resolver: "manual" }, targets: [] };
    }
  }
  // CREED (CLAUDE.md §1.2 — never fabricate): a trigger that reaches here WITH an effect clause but
  // carrying the legacy naive `trigger.effect` payload is one we could NOT faithfully resolve — it has an
  // intervening-if (the `clause && !interveningIf` guard above skipped the rich path) or is a HIGH modal
  // (excluded from both rich-path returns). The naive payload applies a substring-matched small effect
  // (parseTriggerEffect → applyTriggerEffect: draw/loseLife/gainLife) UNCONDITIONALLY: checkInterveningIf
  // is NOT wired into the live resolution path, so the condition is IGNORED, and any "may"/"if you do"
  // rider is dropped. That fabricates an effect the card doesn't have (e.g. Boundary Lands Ranger drawing
  // a card with no power-4 creature; an "each opponent's upkeep, if that player has ≤1 card, they lose 4
  // life" draining unconditionally). Route such a trigger to the Arbiter no-op (false-negative SAFE).
  // (Wiring checkInterveningIf to fire the 3 modeled condition shapes natively is a tracked enhancement;
  // until then the WHOLE conditional trigger stays non-native rather than mis-resolve.) A genuinely
  // clause-less trigger, or one with a non-naive faithful payload, keeps its pre-set payload.
  if (clause && trigger.payload?.resolver === "trigger.effect") {
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
  const atoms = program?.structure === "modal"
    ? (program.modal?.modes || []).flatMap((m) => m.atoms || [])
    : (program?.atoms || []);
  let enemies;
  try { enemies = new Set(opponentsOf(state, controller)); } catch { return undefined; }
  const sideOf = (t) => {
    if (t.type === "player") return t.id;
    if (t.type === "spell") return (state.stack || []).find((o) => o.id === t.id)?.controller;
    return t.controller; // creature / permanent / graveyardCard
  };
  const targetOk = (t) => {
    const intent = atomTargetIntent(atoms[t.atomIndex]);
    if (intent === "enemy") { const s = sideOf(t); return s != null && enemies.has(s); }
    if (intent === "own") return sideOf(t) === controller;
    return true; // null/ambiguous: ambiguous is gated upstream; null = a non-targeting atom
  };
  return candidates.find((c) => (c.targets || []).every(targetOk)) || NO_SAFE_TARGET;
}

/**
 * Move every pending trigger onto the stack at this priority-grant checkpoint (CR
 * 603.3). Targets for a targeted trigger are chosen HERE, as the ability goes on the
 * stack (CR 603.3c); pass `{ chooseTargets }` to override the default first-legal
 * pick (an AI/Beginner-interactive chooser). A targeted trigger with no legal target
 * is dropped (logged, not silent).
 */
export function flushTriggers(state, { chooseTargets } = {}) {
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
    const built = buildTriggerStack(s, trigger, chooseTargets);
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

  return {
    ...s,
    stack: [...s.stack, ...newStackObjects],
    pendingTriggers: [],
  };
}

// ─── Game start helper ───────────────────────────────────────────────────────

/**
 * Run the start-of-game routine: stamp startingPlayer (needed by
 * draw-step skip), shuffle libraries (caller-supplied rng), draw 7,
 * then apply the untap step's automatic effects so the game opens at
 * the first priority window.
 *
 * Caller is expected to handle London mulligan via gameState helpers
 * before calling startGame — startGame assumes the opening hands are
 * already locked in.
 */
export function startGame(state, { skipMulliganDraw = false } = {}) {
  let next = { ...state, startingPlayer: state.activePlayer };
  if (!skipMulliganDraw) {
    // Deal opening hands to every seat in turn order. Standard draws
    // user + ai (unchanged); Commander deals all four pod members.
    for (const playerId of (state.turnOrder || Object.keys(state.players))) {
      next = drawCards(next, { playerId, count: 7 });
    }
  }
  next = logEvent(next, { kind: "game-start", startingPlayer: state.activePlayer });
  // First step is untap — run its actions (which include skipping the
  // first draw for the starting player).
  return runStepActions(next);
}

// ─── Misc reads ──────────────────────────────────────────────────────────────

/**
 * Step out of the current state without applying automatic actions or
 * priority. Lower-level than nextStep; used by tests that want to
 * snapshot a state at a specific step without triggering its effects.
 */
export { advanceStep as _advanceStepRaw };

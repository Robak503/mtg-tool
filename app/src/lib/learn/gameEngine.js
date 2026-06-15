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
  untapAll,
  clearCombatDamage,
  logEvent,
  mintId,
} from "./gameState.js";
import { resolveCombatDamage } from "./combatResolution.js";
import { manaDoesNotEmpty } from "./cardEffects.js";
import { getResolver } from "./resolvers.js";
import { checkStepTriggers, checkAttackTriggers } from "./triggers.js";
import { expireContinuousEffects } from "./layers.js";
import { parseEffectClause, programConfidence, programNeedsChosenTarget } from "./effects/parser.js";

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
        next = drawCards(next, { playerId: state.activePlayer, count: 1 });
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
      // none have it (CR 510.5). Lethal first-strike damage kills before the
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

    default:
      // upkeep, main, other combat steps — no automatic state mutation.
      next = logEvent(next, { kind: "step", phase: state.phase, step: state.step, player: state.activePlayer });
      break;
  }

  // Step-boundary triggers (CR 603.2b) and attack triggers (CR 508.3). Attack
  // triggers fire at the declare-blockers step, when the full attacker batch is
  // in state.combat.attackers. Enqueued here, then flushed onto the stack below.
  if (next.step === "upkeep") next = checkStepTriggers(next, "upkeep");
  else if (next.step === "draw") next = checkStepTriggers(next, "draw");
  else if (next.step === "end") next = checkStepTriggers(next, "endStep");
  else if (next.step === "declare-blockers") next = checkAttackTriggers(next);

  if (grantsPriority(next.step)) {
    next = grantPriority(next);
  }

  // Flush any pending triggers onto the stack at this priority-grant
  // checkpoint, per CR 603.3a — triggered abilities go on the stack at
  // the next time a player would get priority.
  next = flushTriggers(next);

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
  next = flushTriggers(next);
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
 * The serializable payload a pending trigger goes on the stack with. P2.8: when the
 * trigger's effect clause parses to a HIGH, non-modal, NON-TARGETED EffectProgram
 * (draw / gain-life / make-a-token / each-opponent / …), route it through the full
 * EFFECT_PROGRAM interpreter so the trigger inherits the whole P2.x atom family.
 * Targeted + modal triggers keep the small `trigger.effect` fallback until the
 * flush-time target chooser lands (a clean follow-up). An unparseable clause also
 * keeps the fallback (→ Arbiter), never a fabricated effect (CLAUDE.md §1.2).
 *
 * An INTERVENING-IF trigger (CR 603.4, "When ~ enters, if <cond>, <effect>") is NOT
 * routed: the flush stage doesn't evaluate the condition yet, so firing the effect
 * unconditionally would be a false grant. It keeps the fallback (→ Arbiter) until
 * checkInterveningIf is wired into the flush filter (a clean follow-up).
 */
function triggerStackPayload(trigger) {
  const clause = trigger.descriptor?.effectClause;
  if (clause && !trigger.descriptor?.interveningIf) {
    // Parse the trigger's effect clause as spell-like text: a triggered ability's
    // effect resolves exactly as a spell would, and the legacy effect parser
    // (spellEffects.parseSpellEffect) only engages for Instant/Sorcery types — so
    // pass "Instant" to unlock draw/damage/destroy off a permanent source.
    const program = parseEffectClause(clause, "Instant");
    if (program && programConfidence(program) === "high" && program.structure !== "modal" && !programNeedsChosenTarget(program)) {
      return {
        resolver: "effect-program",
        params: { program, controller: trigger.controller, targets: [], context: trigger.context },
      };
    }
  }
  return trigger.payload || {};
}

export function flushTriggers(state) {
  const pending = state.pendingTriggers || [];
  if (pending.length === 0) return state;

  const ordered = orderTriggersAPNAP(state, pending);

  // Mint a deterministic stack id for any trigger without one (real triggers
  // from triggers.js carry no id; some tests pass explicit ids). Thread state so
  // idSeq advances per mint and the result is serialize-stable.
  let s = state;
  const newStackObjects = [];
  for (const trigger of ordered) {
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
      targets: trigger.targets || [],
      cost: null,
      payload: triggerStackPayload(trigger),
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

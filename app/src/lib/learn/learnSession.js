/**
 * Phase 6 PR6.2 — learnSession.js
 *
 * Top-level lifecycle container for a Learn-to-Play session. Wraps the
 * GameState with metadata (difficulty, decision log, status) and
 * exposes the "user perspective" API the UI consumes:
 *
 *   createLearnSession({ userDeck, opponentDeck, ... })
 *     → fresh session in "active" status with both opening 7s drawn
 *
 *   advanceUntilDecision(session)
 *     → drives the engine forward applying AI decisions and trivial
 *       user auto-passes until the user has a real decision to make
 *       OR the game ends. Returns { session, decision } where
 *       decision is the next thing to render in the UI.
 *
 *   applyChoice(session, choice)
 *     → user picks one of the legal options; dispatcher applies it,
 *       decisionLog appends, returns updated session.
 *
 *   isComplete(session)
 *     → "active" | "user-wins" | "ai-wins" | "abandoned"
 *
 *   abandon(session)
 *     → marks status and returns the final session.
 *
 * Pure: no fetches, no React. The /api/learn routes (PR6.3) wrap
 * this; the UI (PR6.4) consumes the routes.
 */

import {
  createGameState,
  loseLife,
  logEvent,
  MODES,
} from "./gameState.js";
import {
  startGame,
  nextStep,
  runStepActions,
  finalizeStackResolution,
} from "./gameEngine.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { makeDecision, resolveChoice } from "./decisionGate.js";
import { dispatchAction } from "./actionDispatcher.js";
import { autoPickTutorCandidate, resolveTutorChoice, resolveScryChoice } from "./effects/runProgram.js";
import { resolveCloneChoice } from "./resolvers.js";
import { autoPickCloneCandidate } from "./cloneCopy.js";

const VALID_DIFFICULTIES = new Set(["beginner", "intermediate", "expert"]);

function generateSessionId() {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return `learn-${globalThis.crypto.randomUUID().slice(0, 12)}`;
  }
  return `learn-${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 8)}`;
}

// ─── Factory ──────────────────────────────────────────────────────────────────

/**
 * Build a fresh session. Opening 7s drawn for every seat, status
 * "active", decisionLog empty. Caller passes:
 *   userDeck         — array of card objects
 *   mode             — "standard" (1v1) | "commander" (4P FFA); default "standard"
 *   opponentDeck     — Standard: the lone opponent's cards
 *   opponentDecks    — Commander: array of exactly 3 opponent libraries (the pod)
 *   userCommanders   — optional array of commander cards
 *   opponentCommanders — Standard: the lone opponent's commanders;
 *                        Commander: array of 3 per-opponent commander arrays
 *   difficulty       — "beginner" | "intermediate" | "expert"
 *   activePlayer     — optional player id (default "user")
 *
 * Throws on missing decks, invalid difficulty, invalid mode, or a
 * commander pod that isn't exactly 3 decks.
 */
export function createLearnSession({
  userDeck,
  opponentDeck,
  opponentDecks = null,
  userCommanders = [],
  opponentCommanders = [],
  difficulty = "beginner",
  activePlayer = "user",
  mode = "standard",
} = {}) {
  if (!Array.isArray(userDeck) || userDeck.length === 0) {
    throw new Error("createLearnSession: userDeck must be a non-empty array");
  }
  if (!VALID_DIFFICULTIES.has(difficulty)) {
    throw new Error(`createLearnSession: difficulty must be one of ${[...VALID_DIFFICULTIES].join(", ")}`);
  }
  if (!MODES.includes(mode)) {
    throw new Error(`createLearnSession: mode must be one of ${MODES.join(", ")}`);
  }

  let state;
  if (mode === "commander") {
    if (!Array.isArray(opponentDecks) || opponentDecks.length !== 3) {
      throw new Error("createLearnSession: commander mode requires opponentDecks to be an array of exactly 3 decks");
    }
    opponentDecks.forEach((deck, i) => {
      if (!Array.isArray(deck) || deck.length === 0) {
        throw new Error(`createLearnSession: opponentDecks[${i}] must be a non-empty array`);
      }
    });
    state = createGameState({
      userDeck,
      opponentDecks,
      userCommanders,
      opponentCommanders, // array-of-arrays, one per opponent
      activePlayer,
      mode,
    });
  } else {
    if (!Array.isArray(opponentDeck) || opponentDeck.length === 0) {
      throw new Error("createLearnSession: opponentDeck must be a non-empty array");
    }
    state = createGameState({
      userDeck,
      aiDeck: opponentDeck,
      userCommanders,
      aiCommanders: opponentCommanders,
      activePlayer,
      mode,
    });
  }
  state = startGame(state);

  return {
    id: generateSessionId(),
    createdAt: new Date().toISOString(),
    difficulty,
    mode,
    state,
    decisionLog: [],
    status: "active",
  };
}

// ─── Status helpers ──────────────────────────────────────────────────────────

/**
 * A player loses if their life is 0 or less (CR 104.3a / 704.5a) or if
 * they've taken 21+ combat damage from any single commander (CR 903.10a / 704.6c).
 * A player already removed from state.players counts as dead.
 */
function isPlayerDead(state, playerId) {
  const player = state.players[playerId];
  if (!player) return true;
  if (player.life <= 0) return true;
  const dmgFrom = player.commanderDamageFrom || {};
  for (const fromId of Object.keys(dmgFrom)) {
    if (dmgFrom[fromId] >= 21) return true;
  }
  return false;
}

/**
 * Remove an eliminated player from the game (CR 800.4a — objects they own
 * leave with them). We drop their whole player record plus the references
 * other state holds to them: their objects on the stack, their combat
 * involvement, and the commander damage they dealt to survivors. turnOrder
 * shrinks so nextInTurnOrder / opponentsOf / the priority-pass threshold
 * all adapt automatically.
 *
 * Two cases:
 *   - Bystander leaves → keep the current turn going; reassign priority
 *     only if they held it (or it now points at a removed seat).
 *   - The ACTIVE player leaves → their turn ends now; we start the next
 *     surviving seat's turn cleanly from untap (via runStepActions) so no
 *     one inherits a half-finished turn.
 */
function removePlayerFromGame(state, playerId) {
  const oldOrder = state.turnOrder || Object.keys(state.players);
  const { [playerId]: _gone, ...players } = state.players;
  const turnOrder = oldOrder.filter((id) => id !== playerId);

  // Strip commander damage the leaving player dealt to survivors.
  for (const id of turnOrder) {
    const dmg = players[id]?.commanderDamageFrom;
    if (dmg && playerId in dmg) {
      const { [playerId]: _d, ...rest } = dmg;
      players[id] = { ...players[id], commanderDamageFrom: rest };
    }
  }

  // Drop their objects on the stack and their combat involvement so later
  // resolution / combat steps never dereference a removed seat.
  const stack = (state.stack || []).filter((obj) => obj.controller !== playerId);
  let combat = state.combat;
  if (combat) {
    combat = {
      ...combat,
      attackers: (combat.attackers || []).filter(
        (a) => a.attackingPlayer !== playerId && a.defender !== playerId,
      ),
      blockers: (combat.blockers || []).filter((b) => b.blockingPlayer !== playerId),
    };
  }

  const log = [...state.log, { turn: state.turn, kind: "player-eliminated", player: playerId }];
  const base = { ...state, players, turnOrder, stack, combat, log };

  if (state.activePlayer === playerId) {
    // Active player left mid-turn: end the turn and start the next
    // surviving seat's turn from untap, rather than splicing a survivor
    // into the dead player's phase/step.
    const idx = oldOrder.indexOf(playerId);
    let nextActive = turnOrder[0] || null;
    for (let k = 1; k <= oldOrder.length; k++) {
      const cand = oldOrder[(idx + k) % oldOrder.length];
      if (cand !== playerId && players[cand]) { nextActive = cand; break; }
    }
    return runStepActions({
      ...base,
      activePlayer: nextActive,
      turn: state.turn + 1,
      phase: "beginning",
      step: "untap",
      priorityHolder: null,
      consecutivePasses: 0,
    });
  }

  // Bystander left — keep the current turn going.
  let priorityHolder = state.priorityHolder;
  if (priorityHolder === playerId || (priorityHolder && !players[priorityHolder])) {
    priorityHolder = players[state.activePlayer] ? state.activePlayer : (turnOrder[0] || null);
  }
  return { ...base, priorityHolder, consecutivePasses: 0 };
}

/**
 * State-based win/loss + elimination, run before every priority window.
 * From the user's seat:
 *   - user dead → "ai-wins" (you lost)
 *   - every opponent dead → "user-wins"
 *   - some-but-not-all opponents dead → remove them, keep playing
 *
 * Standard (a single opponent) only ever hits the first two branches, so
 * its board is never mutated mid-game and behavior is unchanged.
 */
function recordOutcomeIfChanged(session) {
  if (session.status !== "active") return session;
  const state = session.state;

  const order = state.turnOrder || Object.keys(state.players);
  const opponents = order.filter((id) => id !== "user");
  const userDead = isPlayerDead(state, "user");
  const deadOpponents = opponents.filter((id) => isPlayerDead(state, id));
  const allOpponentsDead = opponents.length > 0 && deadOpponents.length === opponents.length;

  // Simultaneous death — the user AND every remaining opponent die in the same
  // SBA check (mutual lethal in one combat-damage step) → draw, not a user
  // loss (CR 104.4a). Checked before the user-loss branch so it wins the tie.
  if (userDead && allOpponentsDead) {
    return { ...session, status: "draw", endedAt: new Date().toISOString() };
  }

  if (userDead) {
    return { ...session, status: "ai-wins", endedAt: new Date().toISOString() };
  }

  // All opponents gone → win (no board mutation; the game is over).
  if (allOpponentsDead) {
    return { ...session, status: "user-wins", endedAt: new Date().toISOString() };
  }

  // Some opponents fell but others remain (Commander only): drop the
  // eliminated seats and keep playing.
  if (deadOpponents.length > 0) {
    let cleaned = state;
    for (const id of deadOpponents) cleaned = removePlayerFromGame(cleaned, id);
    return { ...session, state: cleaned };
  }

  return session;
}

// ─── Decision loop ───────────────────────────────────────────────────────────

// A real learn game ends long before this. Hitting it means the AI couldn't
// close (or a genuine non-progress bug) — we end as a draw with diagnostics
// rather than spinning to the tick cap.
const MAX_TURNS = 100;

/**
 * A cheap fingerprint of "meaningful progress." If an actor takes a non-pass
 * action that leaves this unchanged, the action did nothing and the driver
 * would risk spinning — so we force a pass instead. Uses DISTINCT combat
 * permanent counts (not raw lengths) so a re-declare-style loop, which would
 * grow a raw length, is still caught as no-progress.
 */
function progressSignature(state) {
  const active = state.players[state.activePlayer];
  const handCount = active ? active.hand.length : 0;
  const poolTotal = active ? Object.values(active.manaPool).reduce((a, b) => a + b, 0) : 0;
  const bfCount = Object.values(state.players).reduce((sum, p) => sum + p.battlefield.length, 0);
  const distinctAttackers = new Set((state.combat?.attackers || []).map(a => a.permanentId)).size;
  const distinctBlockers = new Set((state.combat?.blockers || []).map(b => b.blockerId)).size;
  return [
    state.turn, state.phase, state.step,
    distinctAttackers, distinctBlockers, state.stack.length,
    handCount, poolTotal, bfCount,
  ].join("|");
}

/** Strip the transient P2.1 unresolved→Arbiter flag from a state (pure). */
function clearPendingArbiter(state) {
  if (!state.pendingArbiter) return state;
  const { pendingArbiter: _gone, ...rest } = state;
  return rest;
}

/**
 * Settle a tutor's pending choice (apply the fetch + shuffle + resume the suspended
 * program). When the program FULLY completes — not re-paused on a second tutor — run the
 * stack-resolution finalization the spell missed while paused: flush any triggers the
 * resumed post-tutor atoms enqueued (CR 603.3), so they don't sit unflushed past the next
 * priority window. A re-paused program (a second tutor) finalizes when ITS choice settles.
 */
function settleTutorChoice(state, cardId) {
  const next = resolveTutorChoice(state, cardId);
  return next.pendingChoice ? next : finalizeStackResolution(next);
}

/**
 * Settle a clone copy-choice: the clone enters (as the chosen copy, or as itself), then
 * finalizeStackResolution flushes the ETB triggers the entry enqueued (CR 603.3) and resets
 * priority — the same finalize the normal stack-resolution path runs, so a copied creature's
 * "when this enters" trigger doesn't sit unflushed past the next priority window.
 */
function settleCloneChoice(state, chosenPermId) {
  return finalizeStackResolution(resolveCloneChoice(state, chosenPermId));
}

/**
 * Settle a scry/surveil choice: apply the keep/move reorder, resume the suspended program (the
 * "draw a card" after "Scry 1, then draw"), then finalizeStackResolution flushes any triggers a
 * resumed atom enqueued — the same finalize the tutor path runs. A re-pause (a second scry) returns
 * as-is for the driver to surface. `keepIds` is the ordered list of top-card ids to keep on top.
 */
function settleScryChoice(state, keepIds) {
  const next = resolveScryChoice(state, keepIds);
  return next.pendingChoice ? next : finalizeStackResolution(next);
}

/**
 * The driver. Given an active session, advance the engine until the
 * user has a real decision (kind: "ask") OR the game ends. AI
 * decisions auto-apply; trivial user auto-passes also auto-apply.
 *
 * Returns { session, decision }:
 *   decision.kind === "ask"   → UI renders the prompt with options
 *   decision.kind === "game-over" → game ended; session.status reflects
 *
 * A safety cap (1000 ticks) protects against engine bugs that could
 * otherwise spin forever. Hitting the cap surfaces an "engine-stuck"
 * decision so the UI can show a meaningful error.
 */
export function advanceUntilDecision(session, { archetype = null } = {}) {
  if (session.status !== "active") {
    return {
      session,
      decision: { kind: "game-over", reason: session.status },
    };
  }

  // High cap = a true-infinite-loop backstop only. Normal termination is the
  // game ending or the turn limit; an Expert full-game runs to completion in a
  // single call (it never stops for a user decision), so the cap must clear a
  // long game. The anti-loop latch below is the primary guard.
  const SAFETY_CAP = 50000;
  let current = session;
  let ticks = 0;

  while (ticks < SAFETY_CAP) {
    ticks += 1;

    // SBA check before every priority window.
    current = recordOutcomeIfChanged(current);
    if (current.status !== "active") {
      return {
        session: current,
        decision: { kind: "game-over", reason: current.status },
      };
    }

    // P2.1 — the unresolved→Arbiter seam. A resolver flagged a cast spell it
    // can't model (state.pendingArbiter). Surface it as a teaching moment for
    // the PLAYER'S OWN spells at beginner/intermediate; otherwise (Expert
    // autopilot, or an opponent's unmodeled spell) the `spell-unresolved` log
    // already recorded it honestly — clear the flag and keep playing rather than
    // flooding the modal or stalling the autopilot. The engine never calls the
    // network; the UI invokes the Ollama-only Arbiter on this decision.
    if (current.state.pendingArbiter) {
      const pa = current.state.pendingArbiter;
      const pause = pa.controller === "user" && current.difficulty !== "expert";
      if (pause) {
        return { session: current, decision: { kind: "unresolved", ...pa } };
      }
      // Expert autopilot, or an opponent's unmodeled spell: don't block, but
      // surface it in the action feed so the player is TOLD the simulator
      // couldn't model the spell (not just the engine record) — the honesty
      // mandate applies to the player, not only Phase-3 logs.
      const feedEntry = {
        ts: Date.now(),
        turn: current.state.turn,
        phase: current.state.phase,
        step: current.state.step,
        actor: pa.controller,
        action: { kind: "spell-unresolved", name: pa.cardName },
        auto: true,
        reasoning: "engine could not model this spell",
      };
      current = {
        ...current,
        state: clearPendingArbiter(current.state),
        decisionLog: [...current.decisionLog, feedEntry],
      };
      continue;
    }

    // Interactive resolution-time choice (a tutor's library search). The player's OWN
    // tutor at beginner/intermediate surfaces a card PICKER; Expert autopilot and an
    // opponent's tutor AUTO-PICK the best candidate with no panel (the same pause-or-
    // auto split as pendingArbiter). The picker resumes via /api/learn/choose.
    if (current.state.pendingChoice) {
      const pc = current.state.pendingChoice;
      const pause = pc.controller === "user" && current.difficulty !== "expert";
      // Clone copy-choice (CR 707.9): the player's OWN clone surfaces a copy PICKER; Expert
      // autopilot + an opponent's clone auto-pick the best creature (no panel).
      if (pc.kind === "clone-search") {
        if (pause) {
          return { session: current, decision: { kind: "clone-search", ...pc } };
        }
        current = { ...current, state: settleCloneChoice(current.state, autoPickCloneCandidate(current.state, pc)) };
        continue;
      }
      // Scry / surveil (CR 701.18 / 701.43): the player's OWN reorder surfaces a keep/move picker;
      // Expert autopilot + an opponent's scry KEEP ALL on top (a legal, deterministic default — a
      // board-aware "bin a land when flooded" heuristic is a future refinement).
      if (pc.kind === "scry-surveil") {
        if (pause) {
          return { session: current, decision: { kind: "scry-surveil", ...pc } };
        }
        current = { ...current, state: settleScryChoice(current.state, (pc.cards || []).map((c) => c.id)) };
        continue;
      }
      // Tutor library search.
      if (pause) {
        return { session: current, decision: { kind: "tutor-search", ...pc } };
      }
      current = { ...current, state: settleTutorChoice(current.state, autoPickTutorCandidate(current.state, pc)) };
      continue;
    }

    // Turn-limit stalemate: end as a draw with diagnostics, not a scary
    // "engine stuck". A dev warning fires so a draw that's really a bug (the
    // AI never closing) is visible rather than silently "normal".
    if (current.state.turn > MAX_TURNS) {
      if (typeof console !== "undefined" && console.warn) {
        console.warn(`[learn] turn limit (${MAX_TURNS}) reached at turn ${current.state.turn} — ending as a draw`);
      }
      return {
        session: { ...current, status: "draw", endedAt: new Date().toISOString() },
        decision: {
          kind: "game-over",
          reason: "turn-limit",
          diagnostic: { turn: current.state.turn, phase: current.state.phase, step: current.state.step },
        },
      };
    }

    const state = current.state;

    // No priority holder → advance to next step.
    if (!state.priorityHolder) {
      try {
        current = { ...current, state: nextStep(state) };
        continue;
      } catch (error) {
        return {
          session: current,
          decision: { kind: "engine-stuck", reason: error.message },
        };
      }
    }

    // Priority holder set: ask the decisionGate.
    const actor = state.priorityHolder;
    const actions = legalActionsForPlayer(state, actor);
    const decision = makeDecision(state, actor, actions, {
      difficulty: actor === "user" ? current.difficulty : "expert",
      archetype,
    });

    if (decision.kind === "ask") {
      // User has a real decision. Return it.
      return { session: current, decision };
    }

    // Auto-decided — apply and continue.
    if (!decision.action) {
      // No legal action and no auto-pick — defensively pass.
      try {
        current = { ...current, state: dispatchAction(state, { kind: "pass-priority", playerId: actor }) };
      } catch {
        return {
          session: current,
          decision: { kind: "engine-stuck", reason: "no legal action and no pass available" },
        };
      }
      continue;
    }

    try {
      const newState = dispatchAction(state, decision.action);
      // Anti-loop latch (defense-in-depth behind the combat exclusion fix): a
      // non-pass action that leaves the progress signature unchanged did
      // nothing meaningful. Rather than re-applying the same no-op forever,
      // force a pass to move the game forward.
      if (
        decision.action.kind !== "pass-priority" &&
        progressSignature(newState) === progressSignature(state)
      ) {
        current = {
          ...current,
          state: dispatchAction(state, { kind: "pass-priority", playerId: actor }),
        };
        continue;
      }
      const logEntry = {
        ts: Date.now(),
        turn: state.turn,
        phase: state.phase,
        step: state.step,
        actor,
        action: decision.action,
        auto: true,
        reasoning: decision.metadata?.reasoning,
      };
      current = {
        ...current,
        state: newState,
        decisionLog: [...current.decisionLog, logEntry],
      };
    } catch (error) {
      // DispatcherError or other — bail with a structured decision so
      // the UI can show what happened.
      return {
        session: current,
        decision: { kind: "dispatch-error", reason: error.message, code: error.code },
      };
    }
  }

  return {
    session: current,
    decision: { kind: "engine-stuck", reason: `safety cap (${SAFETY_CAP} ticks) hit` },
  };
}

// ─── User-choice application ─────────────────────────────────────────────────

/**
 * The user picked an option from a decision.options list. Validate
 * the choice against the legal actions, dispatch, log, then call
 * advanceUntilDecision so the next prompt is ready to render.
 *
 * Returns { session, decision } same shape as advanceUntilDecision.
 */
export function applyChoice(session, choice) {
  if (session.status !== "active") {
    return {
      session,
      decision: { kind: "game-over", reason: session.status },
    };
  }
  if (!session.state.priorityHolder) {
    return {
      session,
      decision: { kind: "dispatch-error", reason: "No priority holder set" },
    };
  }

  const actor = session.state.priorityHolder;
  const actions = legalActionsForPlayer(session.state, actor);
  const matched = resolveChoice(actions, choice);
  if (!matched) {
    return {
      session,
      decision: { kind: "dispatch-error", reason: "Choice doesn't match any legal action", code: "INVALID_CHOICE" },
    };
  }

  let newState;
  try {
    newState = dispatchAction(session.state, matched);
  } catch (error) {
    return {
      session,
      decision: { kind: "dispatch-error", reason: error.message, code: error.code },
    };
  }

  const logEntry = {
    ts: Date.now(),
    turn: session.state.turn,
    phase: session.state.phase,
    step: session.state.step,
    actor,
    action: matched,
    auto: false,
    reasoning: "user-chose",
  };

  const next = {
    ...session,
    state: newState,
    decisionLog: [...session.decisionLog, logEntry],
  };

  return advanceUntilDecision(next);
}

/**
 * P2.1 — the player has seen the Arbiter's ruling for an `unresolved` spell and
 * wants to continue. Clears the `pendingArbiter` flag, records that the ruling
 * was acknowledged (audit trail for Phase-3 records), and resumes the driver.
 *
 * The unresolved spell already left the stack at resolution; its effect was
 * deferred to the player's manual application of the ruling — the engine never
 * fabricates it. Returns { session, decision } like advanceUntilDecision.
 */
export function continueFromArbiter(session) {
  if (session.status !== "active") {
    return { session, decision: { kind: "game-over", reason: session.status } };
  }
  if (!session.state.pendingArbiter) {
    // Nothing pending (e.g. a double-submit) — just re-derive the next decision.
    return advanceUntilDecision(session);
  }

  const pa = session.state.pendingArbiter;
  const cleared = clearPendingArbiter(session.state);
  const logged = logEvent(cleared, {
    kind: "arbiter-acknowledged",
    objectId: pa.stackObjectId,
    cardName: pa.cardName,
  });
  const logEntry = {
    ts: Date.now(),
    turn: session.state.turn,
    phase: session.state.phase,
    step: session.state.step,
    actor: "user",
    action: { kind: "continue-after-arbiter", name: pa.cardName },
    auto: false,
    reasoning: "arbiter-acknowledged",
  };

  return advanceUntilDecision({
    ...session,
    state: logged,
    decisionLog: [...session.decisionLog, logEntry],
  });
}

/**
 * The player picked a card (or chose "find nothing") from a `tutor-search` decision.
 * Validates the pick against the pending candidates, applies the fetch + shuffle, resumes
 * the suspended effect program, then re-derives the next decision. `choice.cardId` is the
 * chosen library card id, or null/absent to find nothing (CR 701.19f). Returns
 * { session, decision } like advanceUntilDecision.
 */
export function applyTutorChoice(session, choice) {
  if (session.status !== "active") {
    return { session, decision: { kind: "game-over", reason: session.status } };
  }
  const pc = session.state.pendingChoice;
  if (!pc || pc.kind !== "tutor-search") {
    // Nothing pending (e.g. a double-submit) — just re-derive the next decision.
    return advanceUntilDecision(session);
  }
  const cardId = choice?.cardId ?? null;
  if (cardId !== null && !pc.candidates.some((c) => c.id === cardId)) {
    // An illegal/stale pick must NOT strand the game: the choice is still pending, so
    // re-surface the SAME picker (advanceUntilDecision re-derives it) instead of a
    // terminal dispatch-error the UI can't recover from.
    return advanceUntilDecision(session);
  }

  let newState;
  try {
    newState = settleTutorChoice(session.state, cardId);
  } catch (error) {
    return { session, decision: { kind: "dispatch-error", reason: error.message, code: error.code } };
  }

  const logEntry = {
    ts: Date.now(),
    turn: session.state.turn,
    phase: session.state.phase,
    step: session.state.step,
    actor: "user",
    action: { kind: "tutor-choice", found: cardId !== null },
    auto: false,
    reasoning: "user-chose-tutor",
  };

  return advanceUntilDecision({
    ...session,
    state: newState,
    decisionLog: [...session.decisionLog, logEntry],
  });
}

/**
 * The player picked which creature to copy (or declined) from a `clone-search` decision (CR 707).
 * Validates the pick against the pending candidates, then enters the clone as that copy (or as
 * itself on decline/illegal), flushes its ETB triggers, and re-derives the next decision.
 * `choice.permId` is the chosen battlefield permanent id, or null/absent to decline a "you may"
 * clone. Returns { session, decision } like advanceUntilDecision.
 */
export function applyCloneChoice(session, choice) {
  if (session.status !== "active") {
    return { session, decision: { kind: "game-over", reason: session.status } };
  }
  const pc = session.state.pendingChoice;
  if (!pc || pc.kind !== "clone-search") {
    return advanceUntilDecision(session); // nothing pending (double-submit) — re-derive.
  }
  const permId = choice?.permId ?? null;
  if (permId !== null && !pc.candidates.some((c) => c.id === permId)) {
    return advanceUntilDecision(session); // illegal/stale pick → re-surface the same picker.
  }

  let newState;
  try {
    newState = settleCloneChoice(session.state, permId);
  } catch (error) {
    return { session, decision: { kind: "dispatch-error", reason: error.message, code: error.code } };
  }

  const logEntry = {
    ts: Date.now(),
    turn: session.state.turn,
    phase: session.state.phase,
    step: session.state.step,
    actor: "user",
    action: { kind: "clone-choice", copied: permId !== null },
    auto: false,
    reasoning: "user-chose-copy-target",
  };

  return advanceUntilDecision({
    ...session,
    state: newState,
    decisionLog: [...session.decisionLog, logEntry],
  });
}

/**
 * The player resolved a `scry-surveil` decision (CR 701.18 / 701.43). `choice.keep` is the ordered
 * list of top-card ids to keep on top; everything else among the looked-at cards goes to the bottom
 * (scry) or the graveyard (surveil). Applies the reorder + resumes, then re-derives the next
 * decision. Returns { session, decision } like advanceUntilDecision.
 */
export function applyScryChoice(session, choice) {
  if (session.status !== "active") {
    return { session, decision: { kind: "game-over", reason: session.status } };
  }
  const pc = session.state.pendingChoice;
  if (!pc || pc.kind !== "scry-surveil") {
    return advanceUntilDecision(session); // nothing pending (double-submit) — re-derive.
  }
  // Keep only ids that are actually among the looked-at cards, each at most once (defensive
  // against a stale/duplicate-id UI submit — keeps the library mutation + the log count honest).
  const valid = new Set((pc.cards || []).map((c) => c.id));
  const keep = [...new Set((Array.isArray(choice?.keep) ? choice.keep : []).filter((id) => valid.has(id)))];

  let newState;
  try {
    newState = settleScryChoice(session.state, keep);
  } catch (error) {
    return { session, decision: { kind: "dispatch-error", reason: error.message, code: error.code } };
  }

  const logEntry = {
    ts: Date.now(),
    turn: session.state.turn,
    phase: session.state.phase,
    step: session.state.step,
    actor: "user",
    action: { kind: "scry-choice", mode: pc.mode, kept: keep.length, looked: (pc.cards || []).length },
    auto: false,
    reasoning: "user-chose-scry",
  };

  return advanceUntilDecision({
    ...session,
    state: newState,
    decisionLog: [...session.decisionLog, logEntry],
  });
}

/**
 * Dispatch an interactive resolution-time choice (state.pendingChoice) to the right handler by
 * its kind — so the single /api/learn/choose route serves the tutor search, the clone copy-pick,
 * and scry/surveil. (Named apart from the decision-gate `applyChoice`, which resolves a player
 * ACTION, not a pendingChoice.)
 */
export function applyPendingChoice(session, choice) {
  const kind = session.state?.pendingChoice?.kind;
  if (kind === "clone-search") return applyCloneChoice(session, choice);
  if (kind === "scry-surveil") return applyScryChoice(session, choice);
  return applyTutorChoice(session, choice);
}

// ─── Termination ─────────────────────────────────────────────────────────────

export function abandon(session, reason = "user-abandoned") {
  if (session.status !== "active") return session;
  return {
    ...session,
    status: "abandoned",
    abandonReason: reason,
    endedAt: new Date().toISOString(),
  };
}

export function isComplete(session) {
  return session?.status !== "active";
}

// ─── Test helpers ────────────────────────────────────────────────────────────

/**
 * Direct life-deduction for test setup. Production code should never
 * call this — it's a shortcut for "force the user to lose this turn"
 * scenarios in integration tests.
 */
export function _forceLifeForTests(session, playerId, life) {
  return {
    ...session,
    state: {
      ...session.state,
      players: {
        ...session.state.players,
        [playerId]: { ...session.state.players[playerId], life },
      },
    },
  };
}

export { loseLife as _loseLifeForTests };

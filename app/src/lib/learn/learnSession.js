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
  PLAYER_IDS,
} from "./gameState.js";
import {
  startGame,
  nextStep,
} from "./gameEngine.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { makeDecision, resolveChoice } from "./decisionGate.js";
import { dispatchAction } from "./actionDispatcher.js";

const VALID_DIFFICULTIES = new Set(["beginner", "intermediate", "expert"]);

function generateSessionId() {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return `learn-${globalThis.crypto.randomUUID().slice(0, 12)}`;
  }
  return `learn-${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 8)}`;
}

// ─── Factory ──────────────────────────────────────────────────────────────────

/**
 * Build a fresh session. Opening 7s drawn for both sides, status
 * "active", decisionLog empty. Caller passes:
 *   userDeck         — array of card objects (60-100)
 *   opponentDeck     — array of card objects
 *   userCommanders   — optional array of commander cards (Commander variant)
 *   opponentCommanders — optional
 *   difficulty       — "beginner" | "intermediate" | "expert"
 *   activePlayer     — optional "user" | "ai" (default "user")
 *
 * Throws on missing decks or invalid difficulty.
 */
export function createLearnSession({
  userDeck,
  opponentDeck,
  userCommanders = [],
  opponentCommanders = [],
  difficulty = "beginner",
  activePlayer = "user",
} = {}) {
  if (!Array.isArray(userDeck) || userDeck.length === 0) {
    throw new Error("createLearnSession: userDeck must be a non-empty array");
  }
  if (!Array.isArray(opponentDeck) || opponentDeck.length === 0) {
    throw new Error("createLearnSession: opponentDeck must be a non-empty array");
  }
  if (!VALID_DIFFICULTIES.has(difficulty)) {
    throw new Error(`createLearnSession: difficulty must be one of ${[...VALID_DIFFICULTIES].join(", ")}`);
  }

  let state = createGameState({
    userDeck,
    aiDeck: opponentDeck,
    userCommanders,
    aiCommanders: opponentCommanders,
    activePlayer,
  });
  state = startGame(state);

  return {
    id: generateSessionId(),
    createdAt: new Date().toISOString(),
    difficulty,
    state,
    decisionLog: [],
    status: "active",
  };
}

// ─── Status helpers ──────────────────────────────────────────────────────────

/**
 * Check state-based actions that end the game. v1 covers life ≤ 0 and
 * library-out-on-draw (the engine doesn't currently track "lost on
 * empty draw" so we infer from the cardsDrawnThisTurn delta).
 *
 * Per CR 704: a player whose life total is 0 or less loses; a player
 * who tries to draw from an empty library loses (we approximate this
 * by detecting a library that became empty mid-turn).
 *
 * Returns the new status string or "active" if the game continues.
 */
function checkGameEnd(state) {
  if (state.players.user.life <= 0) return "ai-wins";
  if (state.players.ai.life <= 0) return "user-wins";

  // Commander damage SBA (CR 903.14a).
  for (const playerId of PLAYER_IDS) {
    const dmgFrom = state.players[playerId].commanderDamageFrom || {};
    for (const fromId of Object.keys(dmgFrom)) {
      if (dmgFrom[fromId] >= 21) {
        return playerId === "user" ? "ai-wins" : "user-wins";
      }
    }
  }

  return "active";
}

function recordOutcomeIfChanged(session) {
  if (session.status !== "active") return session;
  const newStatus = checkGameEnd(session.state);
  if (newStatus === "active") return session;
  return {
    ...session,
    status: newStatus,
    endedAt: new Date().toISOString(),
  };
}

// ─── Decision loop ───────────────────────────────────────────────────────────

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

  const SAFETY_CAP = 1000;
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

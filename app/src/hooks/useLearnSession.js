"use client";

/**
 * useLearnSession — client-side hook for the Phase 6 Learn-to-Play flow.
 *
 * Talks to /api/learn/start (POST) and /api/learn/step (POST). Holds
 * the latest decision + a small status surface for the UI. The server
 * holds the actual GameState; this hook keeps just the wire-side
 * snapshot needed to render the decision modal, zone counts, and
 * the recent action feed.
 *
 * Usage:
 *   const { start, applyChoice, decision, status, ... } = useLearnSession();
 *   await start({ userDeck, opponentDeck, difficulty });
 *   // decision is now non-null with options
 *   await applyChoice(decision.options[0]);
 *   // decision updates to the next prompt (or game-over)
 *
 * All errors are caught and surfaced in `error`. The hook never throws.
 */

import { useCallback, useRef, useState } from "react";

const INITIAL_STATE = {
  sessionId: null,
  decision: null,
  status: "idle",        // idle → starting → active → ended → error
  turn: null,
  activePlayer: null,
  step: null,
  decisionLogTail: [],
  error: null,
};

export default function useLearnSession() {
  const [state, setState] = useState(INITIAL_STATE);
  const inFlightRef = useRef(false);

  const reset = useCallback(() => {
    setState(INITIAL_STATE);
    inFlightRef.current = false;
  }, []);

  /**
   * Start a new learn session. Returns the first decision (also
   * available via the hook's state). Subsequent calls reset and
   * start fresh.
   */
  const start = useCallback(async ({
    userDeck,
    opponentDeck,
    userCommanders,
    opponentCommanders,
    difficulty = "beginner",
    activePlayer = "user",
  }) => {
    if (inFlightRef.current) return null;
    inFlightRef.current = true;
    setState({ ...INITIAL_STATE, status: "starting" });

    try {
      const response = await fetch("/api/learn/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userDeck,
          opponentDeck,
          userCommanders,
          opponentCommanders,
          difficulty,
          activePlayer,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setState({ ...INITIAL_STATE, status: "error", error: data.error || `Start failed: ${response.status}` });
        return null;
      }
      const next = {
        sessionId: data.sessionId,
        decision: data.decision,
        status: data.decision?.kind === "game-over" ? "ended" : "active",
        turn: data.turn,
        activePlayer: data.activePlayer,
        step: data.step,
        decisionLogTail: [],
        error: null,
      };
      setState(next);
      return next.decision;
    } catch (error) {
      setState({ ...INITIAL_STATE, status: "error", error: error.message || "network error" });
      return null;
    } finally {
      inFlightRef.current = false;
    }
  }, []);

  /**
   * Apply a chosen action. Returns the next decision (also written
   * to state). No-op when there's no active session or a request is
   * already in flight.
   */
  const applyChoice = useCallback(async (choice) => {
    if (inFlightRef.current || !state.sessionId) return null;
    inFlightRef.current = true;

    try {
      const response = await fetch("/api/learn/step", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: state.sessionId,
          choice,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setState(prev => ({ ...prev, status: "error", error: data.error || `Step failed: ${response.status}` }));
        return null;
      }
      const isOver = data.decision?.kind === "game-over";
      setState(prev => ({
        ...prev,
        decision: data.decision,
        status: isOver ? "ended" : "active",
        turn: data.turn,
        activePlayer: data.activePlayer,
        step: data.step,
        decisionLogTail: data.decisionLogTail || [],
        error: null,
      }));
      return data.decision;
    } catch (error) {
      setState(prev => ({ ...prev, status: "error", error: error.message || "network error" }));
      return null;
    } finally {
      inFlightRef.current = false;
    }
  }, [state.sessionId]);

  return {
    ...state,
    start,
    applyChoice,
    reset,
  };
}

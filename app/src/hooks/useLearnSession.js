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
  mode: null,            // "standard" | "commander"
  difficulty: null,      // "beginner" | "intermediate" | "expert" (echoed by the routes)
  turn: null,
  activePlayer: null,
  step: null,
  table: [],             // per-seat snapshot (life / zone counts / cmd damage)
  board: null,           // full board view model (hands/permanents/zones/stack) for LearnBoard
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
    opponentDecks,
    userCommanders,
    opponentCommanders,
    difficulty = "beginner",
    activePlayer = "user",
    mode = "standard",
    userDeckId,
    userDeckName,
    opponentDeckNames,
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
          opponentDecks,
          userCommanders,
          opponentCommanders,
          difficulty,
          activePlayer,
          mode,
          userDeckId,
          userDeckName,
          opponentDeckNames,
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
        mode: data.mode || mode,
        difficulty: data.difficulty || difficulty,
        turn: data.turn,
        activePlayer: data.activePlayer,
        step: data.step,
        table: data.table || [],
        board: data.board || null,
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
        difficulty: data.difficulty ?? prev.difficulty,
        turn: data.turn,
        activePlayer: data.activePlayer,
        step: data.step,
        table: data.table || prev.table,
        board: data.board || prev.board,
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

  /**
   * Continue after the player has seen the Arbiter's ruling for an `unresolved`
   * spell (P2.1). Clears the pause server-side and returns the next decision.
   */
  const continueGame = useCallback(async () => {
    if (inFlightRef.current || !state.sessionId) return null;
    inFlightRef.current = true;

    try {
      const response = await fetch("/api/learn/continue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: state.sessionId }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setState(prev => ({ ...prev, status: "error", error: data.error || `Continue failed: ${response.status}` }));
        return null;
      }
      const isOver = data.decision?.kind === "game-over";
      setState(prev => ({
        ...prev,
        decision: data.decision,
        status: isOver ? "ended" : "active",
        difficulty: data.difficulty ?? prev.difficulty,
        turn: data.turn,
        activePlayer: data.activePlayer,
        step: data.step,
        table: data.table || prev.table,
        board: data.board || prev.board,
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

  /**
   * Submit the player's pick from an interactive `tutor-search` decision (a tutor's
   * "search your library for a card"). `cardId` is the chosen library card id, or null
   * to find nothing. Resumes the suspended spell server-side and returns the next decision.
   */
  const applyTutorChoice = useCallback(async (cardId) => {
    if (inFlightRef.current || !state.sessionId) return null;
    inFlightRef.current = true;

    try {
      const response = await fetch("/api/learn/choose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: state.sessionId, choice: { cardId: cardId ?? null } }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setState(prev => ({ ...prev, status: "error", error: data.error || `Choose failed: ${response.status}` }));
        return null;
      }
      const isOver = data.decision?.kind === "game-over";
      setState(prev => ({
        ...prev,
        decision: data.decision,
        status: isOver ? "ended" : "active",
        difficulty: data.difficulty ?? prev.difficulty,
        turn: data.turn,
        activePlayer: data.activePlayer,
        step: data.step,
        table: data.table || prev.table,
        board: data.board || prev.board,
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

  /** List resumable saved games for the active profile (Phase-7 PR-4a). */
  const listSaves = useCallback(async () => {
    try {
      const response = await fetch("/api/learn/saves");
      const data = await response.json().catch(() => ({}));
      if (!response.ok) return [];
      return Array.isArray(data.saves) ? data.saves : [];
    } catch {
      return [];
    }
  }, []);

  /** Resume a saved game by id. Sets hook state like start(); returns the decision. */
  const resume = useCallback(async (sessionId) => {
    if (inFlightRef.current || !sessionId) return null;
    inFlightRef.current = true;
    setState({ ...INITIAL_STATE, status: "starting" });
    try {
      const response = await fetch("/api/learn/resume", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setState({ ...INITIAL_STATE, status: "error", error: data.error || `Resume failed: ${response.status}` });
        return null;
      }
      const next = {
        sessionId: data.sessionId,
        decision: data.decision,
        status: data.decision?.kind === "game-over" ? "ended" : "active",
        mode: data.mode || null,
        difficulty: data.difficulty || null,
        turn: data.turn,
        activePlayer: data.activePlayer,
        step: data.step,
        table: data.table || [],
        board: data.board || null,
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

  /** Delete a saved game by id. Returns true on success. */
  const deleteSave = useCallback(async (sessionId) => {
    try {
      const response = await fetch("/api/learn/saves/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId }),
      });
      return response.ok;
    } catch {
      return false;
    }
  }, []);

  return {
    ...state,
    start,
    applyChoice,
    continueGame,
    applyTutorChoice,
    reset,
    listSaves,
    resume,
    deleteSave,
  };
}

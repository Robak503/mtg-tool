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
    userCompanion,
    opponentCompanions,
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
          userCompanion,
          opponentCompanions,
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

  /**
   * Submit the player's pick from an interactive `clone-search` decision (CR 707 — "which creature
   * to copy"). `permId` is the chosen battlefield permanent id, or null to decline a "you may"
   * clone (it then enters as a 0/0 and dies). Finishes the clone entry server-side + next decision.
   */
  const applyCloneChoice = useCallback(async (permId) => {
    if (inFlightRef.current || !state.sessionId) return null;
    inFlightRef.current = true;

    try {
      const response = await fetch("/api/learn/choose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: state.sessionId, choice: { permId: permId ?? null } }),
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

  /**
   * Submit the player's scry/surveil reorder (CR 701.22 / 701.25). `keep` is the ordered list of
   * top-card ids to keep on top; everything else among the looked-at cards goes to the bottom
   * (scry) or graveyard (surveil). Applies the reorder + resumes the spell server-side.
   */
  const applyScryChoice = useCallback(async (keep) => {
    if (inFlightRef.current || !state.sessionId) return null;
    inFlightRef.current = true;

    try {
      const response = await fetch("/api/learn/choose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: state.sessionId, choice: { keep: Array.isArray(keep) ? keep : [] } }),
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

  /**
   * ===== DIVIDE ===== (MT-1) — submit the player's divide-damage division. `distribution` is
   * `[{ id, type, amount }]` (each chosen target + how much of the spell's total it takes). The engine
   * validates it against the candidates + caps the running total, then applies + resumes server-side.
   */
  const applyDivideChoice = useCallback(async (distribution) => {
    if (inFlightRef.current || !state.sessionId) return null;
    inFlightRef.current = true;

    try {
      const response = await fetch("/api/learn/choose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: state.sessionId, choice: { distribution: Array.isArray(distribution) ? distribution : [] } }),
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

  /**
   * SOFT-CNT — submit the pay-or-be-countered decision for a `soft-counter` (Force Spike / Mana Leak /
   * Spell Pierce): `pay` is true to pay {N} and save the spell, false to let it be countered. Charges the
   * mana + resumes server-side and returns the next decision.
   */
  const applySoftCounterChoice = useCallback(async (pay) => {
    if (inFlightRef.current || !state.sessionId) return null;
    inFlightRef.current = true;

    try {
      const response = await fetch("/api/learn/choose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: state.sessionId, choice: { pay: pay === true } }),
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

  // OPTIONAL-MANA-PAYMENT (CR 603.7c) — answer "you may pay {cost}. If you do, <effect>" (Lifecrafter's
  // Bestiary / Mind's Eye / Inheritance / …). `pay` true charges the cost + runs the payoff, false skips it.
  // Mirrors applySoftCounterChoice.
  const applyOptionalManaPaymentChoice = useCallback(async (pay) => {
    if (inFlightRef.current || !state.sessionId) return null;
    inFlightRef.current = true;

    try {
      const response = await fetch("/api/learn/choose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: state.sessionId, choice: { pay: pay === true } }),
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

  // REFLEXIVE-SAC-BY-SUBTYPE (CR 603.7c) — answer "you may sacrifice a <subtype>. If you do, <effect>"
  // (The Goose Mother / Wedding Security). `sac` true pitches one matching permanent + runs the payoff,
  // false declines. Mirrors applySoftCounterChoice.
  const applyOptionalSacChoice = useCallback(async (sac) => {
    if (inFlightRef.current || !state.sessionId) return null;
    inFlightRef.current = true;

    try {
      const response = await fetch("/api/learn/choose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: state.sessionId, choice: { sac: sac === true } }),
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

  // CMD-RETURN (CR 903.9) — answer the "return your commander to the command zone?" yes/no. `doReturn`
  // true sends it back (recastable, taxed), false leaves it in the graveyard. Mirrors applySoftCounterChoice.
  const applyCommanderReturnChoice = useCallback(async (doReturn) => {
    if (inFlightRef.current || !state.sessionId) return null;
    inFlightRef.current = true;

    try {
      const response = await fetch("/api/learn/choose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: state.sessionId, choice: { return: doReturn === true } }),
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

  /**
   * Submit the player's pick from a `hand-discard` decision (δ-1b — Duress / Thoughtseize). `cardId`
   * is the chosen card in the targeted opponent's revealed hand to strip. Discards it + resumes the
   * caster's riders server-side and returns the next decision.
   */
  const applyHandDiscardChoice = useCallback(async (cardId) => {
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

  /**
   * Submit the player's pick from an `impulse-dig` decision (δ-2 — Strategic Planning / Anticipate).
   * `cardId` is the looked-at card to keep (→ hand); the rest go to the bottom / graveyard. Resumes the
   * suspended spell server-side and returns the next decision.
   */
  const applyImpulseDigChoice = useCallback(async (cardId) => {
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

  /**
   * EDICTS — submit the player's pick from a `sacrifice-choice` decision (Diabolic Edict / Cruel Edict /
   * Geth's Verdict). Fires when the HUMAN is the edict's target. `cardId` is the chosen creature's
   * permanent id to sacrifice. Resumes the suspended spell server-side and returns the next decision.
   */
  const applySacrificeChoice = useCallback(async (cardId) => {
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

  /**
   * EACH-PLAYER discard (EP-2) — submit the player's pick from a `discard` decision (Mind Rot / Fugue /
   * Delirium Skeins). Fires when the HUMAN is a discarder (CR 701.8 — the discarding player chooses).
   * `cardId` is the chosen hand card id to pitch. Resumes the chain (more cards / the caster's riders)
   * server-side and returns the next decision.
   */
  const applyDiscardChoice = useCallback(async (cardId) => {
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

  /** Resolve an "optional-effect" decision ("you may <effect>", α2): take it (true) or decline. */
  const applyOptionalChoice = useCallback(async (take) => {
    if (inFlightRef.current || !state.sessionId) return null;
    inFlightRef.current = true;

    try {
      const response = await fetch("/api/learn/choose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: state.sessionId, choice: { take: take === true } }),
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
    applyCloneChoice,
    applyScryChoice,
    applyOptionalChoice,
    applyHandDiscardChoice,
    applyImpulseDigChoice,
    applySacrificeChoice,
    applyDiscardChoice,
    applyDivideChoice,
    applySoftCounterChoice,
    applyOptionalManaPaymentChoice,
    applyOptionalSacChoice,
    applyCommanderReturnChoice,
    reset,
    listSaves,
    resume,
    deleteSave,
  };
}

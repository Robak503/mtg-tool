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
  status: "idle", // idle → starting → active → ended → error
  mode: null, // "standard" | "commander"
  difficulty: null, // "beginner" | "intermediate" | "expert" (echoed by the routes)
  turn: null,
  activePlayer: null,
  step: null,
  table: [], // per-seat snapshot (life / zone counts / cmd damage)
  board: null, // full board view model (hands/permanents/zones/stack) for LearnBoard
  decisionLogTail: [],
  puzzle: null, // P9: { id, goal, startTurn } when this session is a puzzle attempt; null otherwise
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
  const start = useCallback(
    async ({
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
      humanMulligan = false, // opt-in London mulligan on the human path (free-play passes true)
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
            humanMulligan,
          }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          setState({
            ...INITIAL_STATE,
            status: "error",
            error: data.error || `Start failed: ${response.status}`,
          });
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
    },
    [],
  );

  /**
   * Apply a chosen action. Returns the next decision (also written
   * to state). No-op when there's no active session or a request is
   * already in flight.
   */
  const applyChoice = useCallback(
    async (choice) => {
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
          setState((prev) => ({
            ...prev,
            status: "error",
            error: data.error || `Step failed: ${response.status}`,
          }));
          return null;
        }
        const isOver = data.decision?.kind === "game-over";
        setState((prev) => ({
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
        setState((prev) => ({ ...prev, status: "error", error: error.message || "network error" }));
        return null;
      } finally {
        inFlightRef.current = false;
      }
    },
    [state.sessionId],
  );

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
        setState((prev) => ({
          ...prev,
          status: "error",
          error: data.error || `Continue failed: ${response.status}`,
        }));
        return null;
      }
      const isOver = data.decision?.kind === "game-over";
      setState((prev) => ({
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
      setState((prev) => ({ ...prev, status: "error", error: error.message || "network error" }));
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
  const applyTutorChoice = useCallback(
    async (cardId) => {
      if (inFlightRef.current || !state.sessionId) return null;
      inFlightRef.current = true;

      try {
        const response = await fetch("/api/learn/choose", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId: state.sessionId,
            choice: { kind: "tutor-search", cardId: cardId ?? null },
          }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          setState((prev) => ({
            ...prev,
            status: "error",
            error: data.error || `Choose failed: ${response.status}`,
          }));
          return null;
        }
        const isOver = data.decision?.kind === "game-over";
        setState((prev) => ({
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
        setState((prev) => ({ ...prev, status: "error", error: error.message || "network error" }));
        return null;
      } finally {
        inFlightRef.current = false;
      }
    },
    [state.sessionId],
  );

  /**
   * Submit the player's pick from an interactive `clone-search` decision (CR 707 — "which creature
   * to copy"). `permId` is the chosen battlefield permanent id, or null to decline a "you may"
   * clone (it then enters as a 0/0 and dies). Finishes the clone entry server-side + next decision.
   */
  const applyCloneChoice = useCallback(
    async (permId) => {
      if (inFlightRef.current || !state.sessionId) return null;
      inFlightRef.current = true;

      try {
        const response = await fetch("/api/learn/choose", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId: state.sessionId,
            choice: { kind: "clone-search", permId: permId ?? null },
          }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          setState((prev) => ({
            ...prev,
            status: "error",
            error: data.error || `Choose failed: ${response.status}`,
          }));
          return null;
        }
        const isOver = data.decision?.kind === "game-over";
        setState((prev) => ({
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
        setState((prev) => ({ ...prev, status: "error", error: error.message || "network error" }));
        return null;
      } finally {
        inFlightRef.current = false;
      }
    },
    [state.sessionId],
  );

  /**
   * Submit the player's scry/surveil reorder (CR 701.22 / 701.25). `keep` is the ordered list of
   * top-card ids to keep on top; everything else among the looked-at cards goes to the bottom
   * (scry) or graveyard (surveil). Applies the reorder + resumes the spell server-side.
   */
  const applyScryChoice = useCallback(
    async (keep) => {
      if (inFlightRef.current || !state.sessionId) return null;
      inFlightRef.current = true;

      try {
        const response = await fetch("/api/learn/choose", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId: state.sessionId,
            choice: { kind: "scry-surveil", keep: Array.isArray(keep) ? keep : [] },
          }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          setState((prev) => ({
            ...prev,
            status: "error",
            error: data.error || `Choose failed: ${response.status}`,
          }));
          return null;
        }
        const isOver = data.decision?.kind === "game-over";
        setState((prev) => ({
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
        setState((prev) => ({ ...prev, status: "error", error: error.message || "network error" }));
        return null;
      } finally {
        inFlightRef.current = false;
      }
    },
    [state.sessionId],
  );

  /**
   * ===== DIVIDE ===== (MT-1) — submit the player's divide-damage division. `distribution` is
   * `[{ id, type, amount }]` (each chosen target + how much of the spell's total it takes). The engine
   * validates it against the candidates + caps the running total, then applies + resumes server-side.
   */
  const applyDivideChoice = useCallback(
    async (distribution) => {
      if (inFlightRef.current || !state.sessionId) return null;
      inFlightRef.current = true;

      try {
        const response = await fetch("/api/learn/choose", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId: state.sessionId,
            choice: {
              kind: "divide-damage",
              distribution: Array.isArray(distribution) ? distribution : [],
            },
          }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          setState((prev) => ({
            ...prev,
            status: "error",
            error: data.error || `Choose failed: ${response.status}`,
          }));
          return null;
        }
        const isOver = data.decision?.kind === "game-over";
        setState((prev) => ({
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
        setState((prev) => ({ ...prev, status: "error", error: error.message || "network error" }));
        return null;
      } finally {
        inFlightRef.current = false;
      }
    },
    [state.sessionId],
  );

  /**
   * SOFT-CNT — submit the pay-or-be-countered decision for a `soft-counter` (Force Spike / Mana Leak /
   * Spell Pierce): `pay` is true to pay {N} and save the spell, false to let it be countered. Charges the
   * mana + resumes server-side and returns the next decision.
   */
  const applySoftCounterChoice = useCallback(
    async (pay) => {
      if (inFlightRef.current || !state.sessionId) return null;
      inFlightRef.current = true;

      try {
        const response = await fetch("/api/learn/choose", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId: state.sessionId,
            choice: { kind: "soft-counter", pay: pay === true },
          }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          setState((prev) => ({
            ...prev,
            status: "error",
            error: data.error || `Choose failed: ${response.status}`,
          }));
          return null;
        }
        const isOver = data.decision?.kind === "game-over";
        setState((prev) => ({
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
        setState((prev) => ({ ...prev, status: "error", error: error.message || "network error" }));
        return null;
      } finally {
        inFlightRef.current = false;
      }
    },
    [state.sessionId],
  );

  // OPTIONAL-MANA-PAYMENT (CR 603.7c) — answer "you may pay {cost}. If you do, <effect>" (Lifecrafter's
  // Bestiary / Mind's Eye / Inheritance / …). `pay` true charges the cost + runs the payoff, false skips it.
  // Mirrors applySoftCounterChoice.
  const applyOptionalManaPaymentChoice = useCallback(
    async (pay) => {
      if (inFlightRef.current || !state.sessionId) return null;
      inFlightRef.current = true;

      try {
        const response = await fetch("/api/learn/choose", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId: state.sessionId,
            choice: { kind: "optional-mana-payment", pay: pay === true },
          }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          setState((prev) => ({
            ...prev,
            status: "error",
            error: data.error || `Choose failed: ${response.status}`,
          }));
          return null;
        }
        const isOver = data.decision?.kind === "game-over";
        setState((prev) => ({
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
        setState((prev) => ({ ...prev, status: "error", error: error.message || "network error" }));
        return null;
      } finally {
        inFlightRef.current = false;
      }
    },
    [state.sessionId],
  );

  // OPTIONAL-LIFE-PAYMENT (LANDS-TIER slice 2; CR 614.1c + 119.4) — answer the shockland clause "As this
  // land enters, you may pay N life. If you don't, it enters tapped." `pay` true charges the life for an
  // untapped land, false lets it enter tapped. Mirrors applyOptionalManaPaymentChoice.
  const applyOptionalLifePaymentChoice = useCallback(
    async (pay) => {
      if (inFlightRef.current || !state.sessionId) return null;
      inFlightRef.current = true;

      try {
        const response = await fetch("/api/learn/choose", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId: state.sessionId,
            choice: { kind: "optional-life-payment", pay: pay === true },
          }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          setState((prev) => ({
            ...prev,
            status: "error",
            error: data.error || `Choose failed: ${response.status}`,
          }));
          return null;
        }
        const isOver = data.decision?.kind === "game-over";
        setState((prev) => ({
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
        setState((prev) => ({ ...prev, status: "error", error: error.message || "network error" }));
        return null;
      } finally {
        inFlightRef.current = false;
      }
    },
    [state.sessionId],
  );

  // REFLEXIVE-SAC-BY-SUBTYPE (CR 603.7c) — answer "you may sacrifice a <subtype>. If you do, <effect>"
  // (The Goose Mother / Wedding Security). `sac` true pitches one matching permanent + runs the payoff,
  // false declines. Mirrors applySoftCounterChoice.
  const applyOptionalSacChoice = useCallback(
    async (sac) => {
      if (inFlightRef.current || !state.sessionId) return null;
      inFlightRef.current = true;

      try {
        const response = await fetch("/api/learn/choose", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId: state.sessionId,
            choice: { kind: "optional-sac-payment", sac: sac === true },
          }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          setState((prev) => ({
            ...prev,
            status: "error",
            error: data.error || `Choose failed: ${response.status}`,
          }));
          return null;
        }
        const isOver = data.decision?.kind === "game-over";
        setState((prev) => ({
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
        setState((prev) => ({ ...prev, status: "error", error: error.message || "network error" }));
        return null;
      } finally {
        inFlightRef.current = false;
      }
    },
    [state.sessionId],
  );

  // CMD-RETURN (CR 903.9) — answer the "return your commander to the command zone?" yes/no. `doReturn`
  // true sends it back (recastable, taxed), false leaves it in the graveyard. Mirrors applySoftCounterChoice.
  const applyCommanderReturnChoice = useCallback(
    async (doReturn) => {
      if (inFlightRef.current || !state.sessionId) return null;
      inFlightRef.current = true;

      try {
        const response = await fetch("/api/learn/choose", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId: state.sessionId,
            choice: { kind: "commander-return", return: doReturn === true },
          }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          setState((prev) => ({
            ...prev,
            status: "error",
            error: data.error || `Choose failed: ${response.status}`,
          }));
          return null;
        }
        const isOver = data.decision?.kind === "game-over";
        setState((prev) => ({
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
        setState((prev) => ({ ...prev, status: "error", error: error.message || "network error" }));
        return null;
      } finally {
        inFlightRef.current = false;
      }
    },
    [state.sessionId],
  );

  /**
   * Submit the player's pick from a `hand-discard` decision (δ-1b — Duress / Thoughtseize). `cardId`
   * is the chosen card in the targeted opponent's revealed hand to strip. Discards it + resumes the
   * caster's riders server-side and returns the next decision.
   */
  const applyHandDiscardChoice = useCallback(
    async (cardId) => {
      if (inFlightRef.current || !state.sessionId) return null;
      inFlightRef.current = true;

      try {
        const response = await fetch("/api/learn/choose", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId: state.sessionId,
            choice: { kind: "hand-discard", cardId: cardId ?? null },
          }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          setState((prev) => ({
            ...prev,
            status: "error",
            error: data.error || `Choose failed: ${response.status}`,
          }));
          return null;
        }
        const isOver = data.decision?.kind === "game-over";
        setState((prev) => ({
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
        setState((prev) => ({ ...prev, status: "error", error: error.message || "network error" }));
        return null;
      } finally {
        inFlightRef.current = false;
      }
    },
    [state.sessionId],
  );

  /**
   * Submit the player's pick from a `imprint-exile` decision (IMPRINT, CR 207.2c — Chrome Mox,
   * Semblance Anvil, Isochron Scepter). `cardId` is the chosen card in the player's OWN hand to exile and
   * stamp onto the imprinting permanent. Imprint is "you MAY", so passing null is a legal DECLINE — the
   * permanent simply stays un-imprinted — unlike hand-discard, which always strips one.
   */
  const applyImprintChoice = useCallback(
    async (cardId) => {
      if (inFlightRef.current || !state.sessionId) return null;
      inFlightRef.current = true;

      try {
        const response = await fetch("/api/learn/choose", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId: state.sessionId,
            choice: { kind: "imprint-exile", cardId: cardId ?? null },
          }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          setState((prev) => ({
            ...prev,
            status: "error",
            error: data.error || `Choose failed: ${response.status}`,
          }));
          return null;
        }
        const isOver = data.decision?.kind === "game-over";
        setState((prev) => ({
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
        setState((prev) => ({ ...prev, status: "error", error: error.message || "network error" }));
        return null;
      } finally {
        inFlightRef.current = false;
      }
    },
    [state.sessionId],
  );

  /**
   * Shared submitter for the WI-7 pending-choice methods below (the seven kinds wired 2026-07-18).
   *
   * Every apply* method in this hook posts the same request and folds the same response fields; the
   * older methods each spell that out longhand. Rather than add seven more copies, these share one
   * helper. `kind` is ALWAYS stamped into the payload — applyPendingChoice's kind echo-check
   * (learnSession.js) drops a submit whose kind doesn't match the CURRENT pendingChoice, which is what
   * stops a double-click race from answering a decision the player never saw.
   */
  const submitPendingChoice = useCallback(
    async (kind, payload) => {
      if (inFlightRef.current || !state.sessionId) return null;
      inFlightRef.current = true;
      try {
        const response = await fetch("/api/learn/choose", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId: state.sessionId, choice: { kind, ...payload } }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          setState((prev) => ({
            ...prev,
            status: "error",
            error: data.error || `Choose failed: ${response.status}`,
          }));
          return null;
        }
        const isOver = data.decision?.kind === "game-over";
        setState((prev) => ({
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
        setState((prev) => ({ ...prev, status: "error", error: error.message || "network error" }));
        return null;
      } finally {
        inFlightRef.current = false;
      }
    },
    [state.sessionId],
  );

  /** DIG-LAND-TO-BATTLEFIELD — put one of the revealed lands onto the battlefield. `cardId` is the pick. */
  const applyDigLandChoice = useCallback(
    (cardId) => submitPendingChoice("dig-land-to-battlefield", { cardId: cardId ?? null }),
    [submitPendingChoice],
  );

  /** DISTRIBUTE-COUNTERS — `distribution` is [{ id, amount }], and must assign the full amount (CR 121.5-shaped). */
  const applyDistributeCountersChoice = useCallback(
    (distribution) =>
      submitPendingChoice("distribute-counters", { distribution: distribution || [] }),
    [submitPendingChoice],
  );

  /** OPTIONAL-DRAW-DISCARD — take the optional draw-then-discard, or decline. */
  const applyOptionalDrawDiscardChoice = useCallback(
    (draw) => submitPendingChoice("optional-draw-discard", { draw: draw === true }),
    [submitPendingChoice],
  );

  /** OPTIONAL-DISCARD-PAYMENT — pay the discard COST to get the payoff, or decline. */
  const applyOptionalDiscardPaymentChoice = useCallback(
    (discard) => submitPendingChoice("optional-discard-payment", { discard: discard === true }),
    [submitPendingChoice],
  );

  /** OPTIONAL-EXILE-SELF (Undead Butler) — pay by exiling the dead card from the graveyard, or decline. */
  const applyOptionalExileSelfChoice = useCallback(
    (exile) => submitPendingChoice("optional-exile-self-payment", { exile: exile === true }),
    [submitPendingChoice],
  );

  /** MILLED-PICK (Ripples / Six) — take the named just-milled card from the graveyard to hand. */
  const applyMilledPickChoice = useCallback(
    (cardId) => submitPendingChoice("milled-pick", { cardId }),
    [submitPendingChoice],
  );

  /** SAC-UNLESS-PAY — INVERTED polarity: paying KEEPS the permanent, declining sacrifices it. */
  const applySacUnlessPayChoice = useCallback(
    (pay) => submitPendingChoice("sac-unless-pay", { pay: pay === true }),
    [submitPendingChoice],
  );

  /** TAXED-PAYMENT (Rhystic Study class) — the PAYER pays the tax, or declines and the caster gets the payoff. */
  const applyTaxedPaymentChoice = useCallback(
    (pay) => submitPendingChoice("taxed-payment", { pay: pay === true }),
    [submitPendingChoice],
  );

  /** EDICT-MODE — pick the mode; a sac/discard mode carries the chosen `permId` / `cardId` with it. */
  const applyEdictModeChoice = useCallback(
    (mode, target = {}) =>
      submitPendingChoice("edict-mode", {
        mode,
        permId: target.permId ?? null,
        cardId: target.cardId ?? null,
      }),
    [submitPendingChoice],
  );

  /**
   * Submit the player's pick from a `cleanup-discard` decision (CR 514.1 — discard down to maximum hand
   * size at cleanup). `cardId` is the chosen card in the player's OWN hand. Mandatory and repeatable: the
   * server settles one pick at a time and RE-RAISES the picker while still over the max, so the caller
   * simply renders whatever decision comes back (count ticks down each submit).
   *
   * Engine-side (gameEngine.settleCleanupDiscardStep / learnSession.applyCleanupDiscardChoice) shipped with
   * CR-remediation B3 (ea5a2b08, 2026-07-11); this client half was missing, which stranded the play loop at
   * the first cleanup with an over-full hand — the "breaks at turn 1" report (Colton, 2026-07-12).
   */
  const applyCleanupDiscardChoice = useCallback(
    async (cardId) => {
      if (inFlightRef.current || !state.sessionId) return null;
      inFlightRef.current = true;

      try {
        const response = await fetch("/api/learn/choose", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId: state.sessionId,
            choice: { kind: "cleanup-discard", cardId: cardId ?? null },
          }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          setState((prev) => ({
            ...prev,
            status: "error",
            error: data.error || `Choose failed: ${response.status}`,
          }));
          return null;
        }
        const isOver = data.decision?.kind === "game-over";
        setState((prev) => ({
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
        setState((prev) => ({ ...prev, status: "error", error: error.message || "network error" }));
        return null;
      } finally {
        inFlightRef.current = false;
      }
    },
    [state.sessionId],
  );

  /**
   * Submit the player's pick from an `impulse-dig` decision (δ-2 — Strategic Planning / Anticipate).
   * `cardId` is the looked-at card to keep (→ hand); the rest go to the bottom / graveyard. Resumes the
   * suspended spell server-side and returns the next decision.
   */
  const applyImpulseDigChoice = useCallback(
    async (cardId) => {
      if (inFlightRef.current || !state.sessionId) return null;
      inFlightRef.current = true;

      try {
        const response = await fetch("/api/learn/choose", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId: state.sessionId,
            choice: { kind: "impulse-dig", cardId: cardId ?? null },
          }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          setState((prev) => ({
            ...prev,
            status: "error",
            error: data.error || `Choose failed: ${response.status}`,
          }));
          return null;
        }
        const isOver = data.decision?.kind === "game-over";
        setState((prev) => ({
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
        setState((prev) => ({ ...prev, status: "error", error: error.message || "network error" }));
        return null;
      } finally {
        inFlightRef.current = false;
      }
    },
    [state.sessionId],
  );

  /**
   * BLITZ LK-2 — submit the player's answer to a `look-top-take` decision (Dryad Greenseeker / Frost Augur /
   * Herald's Horn, Domri Rade's +1). `cardId` = the matched top card's id → TAKE it (→ hand); `cardId` null →
   * LEAVE it on top (a legal, non-dominated decline). Resumes the suspended ability/trigger server-side and
   * returns the next decision.
   */
  const applyLookTopTakeChoice = useCallback(
    async (cardId) => {
      if (inFlightRef.current || !state.sessionId) return null;
      inFlightRef.current = true;

      try {
        const response = await fetch("/api/learn/choose", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId: state.sessionId,
            choice: { kind: "look-top-take", cardId: cardId ?? null },
          }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          setState((prev) => ({
            ...prev,
            status: "error",
            error: data.error || `Choose failed: ${response.status}`,
          }));
          return null;
        }
        const isOver = data.decision?.kind === "game-over";
        setState((prev) => ({
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
        setState((prev) => ({ ...prev, status: "error", error: error.message || "network error" }));
        return null;
      } finally {
        inFlightRef.current = false;
      }
    },
    [state.sessionId],
  );

  /**
   * EDICTS — submit the player's pick from a `sacrifice-choice` decision (Diabolic Edict / Cruel Edict /
   * Geth's Verdict). Fires when the HUMAN is the edict's target. `cardId` is the chosen creature's
   * permanent id to sacrifice. Resumes the suspended spell server-side and returns the next decision.
   */
  const applySacrificeChoice = useCallback(
    async (cardId) => {
      if (inFlightRef.current || !state.sessionId) return null;
      inFlightRef.current = true;

      try {
        const response = await fetch("/api/learn/choose", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId: state.sessionId,
            choice: { kind: "sacrifice-choice", cardId: cardId ?? null },
          }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          setState((prev) => ({
            ...prev,
            status: "error",
            error: data.error || `Choose failed: ${response.status}`,
          }));
          return null;
        }
        const isOver = data.decision?.kind === "game-over";
        setState((prev) => ({
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
        setState((prev) => ({ ...prev, status: "error", error: error.message || "network error" }));
        return null;
      } finally {
        inFlightRef.current = false;
      }
    },
    [state.sessionId],
  );

  /**
   * EACH-PLAYER discard (EP-2) — submit the player's pick from a `discard` decision (Mind Rot / Fugue /
   * Delirium Skeins). Fires when the HUMAN is a discarder (CR 701.8 — the discarding player chooses).
   * `cardId` is the chosen hand card id to pitch. Resumes the chain (more cards / the caster's riders)
   * server-side and returns the next decision.
   */
  const applyDiscardChoice = useCallback(
    async (cardId) => {
      if (inFlightRef.current || !state.sessionId) return null;
      inFlightRef.current = true;

      try {
        const response = await fetch("/api/learn/choose", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId: state.sessionId,
            choice: { kind: "discard", cardId: cardId ?? null },
          }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          setState((prev) => ({
            ...prev,
            status: "error",
            error: data.error || `Choose failed: ${response.status}`,
          }));
          return null;
        }
        const isOver = data.decision?.kind === "game-over";
        setState((prev) => ({
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
        setState((prev) => ({ ...prev, status: "error", error: error.message || "network error" }));
        return null;
      } finally {
        inFlightRef.current = false;
      }
    },
    [state.sessionId],
  );

  /**
   * HAND→LIBRARY-TOP (the Brainstorm put-back): the human picks which hand card goes on top of
   * their library; the chain re-raises until the printed count is placed. Same transport shape as
   * applyDiscardChoice with the put-back kind.
   */
  const applyHandToLibraryTopChoice = useCallback(
    async (cardId) => {
      if (inFlightRef.current || !state.sessionId) return null;
      inFlightRef.current = true;
      try {
        const response = await fetch("/api/learn/choose", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId: state.sessionId,
            choice: { kind: "hand-to-library-top", cardId: cardId ?? null },
          }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          setState((prev) => ({
            ...prev,
            status: "error",
            error: data.error || `Choose failed: ${response.status}`,
          }));
          return null;
        }
        const isOver = data.decision?.kind === "game-over";
        setState((prev) => ({
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
        setState((prev) => ({ ...prev, status: "error", error: error.message || "network error" }));
        return null;
      } finally {
        inFlightRef.current = false;
      }
    },
    [state.sessionId],
  );

  /** Resolve an "optional-effect" decision ("you may <effect>", α2): take it (true) or decline. */
  const applyOptionalChoice = useCallback(
    async (take) => {
      if (inFlightRef.current || !state.sessionId) return null;
      inFlightRef.current = true;

      try {
        const response = await fetch("/api/learn/choose", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId: state.sessionId,
            choice: { kind: "optional-effect", take: take === true },
          }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          setState((prev) => ({
            ...prev,
            status: "error",
            error: data.error || `Choose failed: ${response.status}`,
          }));
          return null;
        }
        const isOver = data.decision?.kind === "game-over";
        setState((prev) => ({
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
        setState((prev) => ({ ...prev, status: "error", error: error.message || "network error" }));
        return null;
      } finally {
        inFlightRef.current = false;
      }
    },
    [state.sessionId],
  );

  /**
   * Answer a step of the interactive human London mulligan (CR 103.5). `action` is one of
   * `{ kind: "mulligan-ship" }`, `{ kind: "mulligan-keep" }`, or
   * `{ kind: "mulligan-bottom", cardIds: string[] }`. The response is either another mulligan
   * ask (decision.kind stays "mulligan") or, once the player keeps, the game's first real
   * decision. Fired from the pre-game MulliganPanel, before status leaves the mulligan phase.
   */
  const mulligan = useCallback(
    async (action) => {
      if (inFlightRef.current || !state.sessionId) return null;
      inFlightRef.current = true;

      try {
        const response = await fetch("/api/learn/mulligan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId: state.sessionId, action }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          setState((prev) => ({
            ...prev,
            status: "error",
            error: data.error || `Mulligan failed: ${response.status}`,
          }));
          return null;
        }
        const isOver = data.decision?.kind === "game-over";
        setState((prev) => ({
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
        setState((prev) => ({ ...prev, status: "error", error: error.message || "network error" }));
        return null;
      } finally {
        inFlightRef.current = false;
      }
    },
    [state.sessionId],
  );

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
        setState({
          ...INITIAL_STATE,
          status: "error",
          error: data.error || `Resume failed: ${response.status}`,
        });
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

  /**
   * P9 — capture the current live position as a puzzle. The server snapshots the
   * in-memory session (only the id crosses the wire). Returns { ok, id? , error? };
   * does NOT change game state. `goal` defaults to "win-this-turn" server-side.
   */
  const saveAsPuzzle = useCallback(
    async ({ goal, label } = {}) => {
      if (!state.sessionId) return { ok: false, error: "No active game to capture." };
      try {
        const response = await fetch("/api/puzzles", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId: state.sessionId, goal, label }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok)
          return { ok: false, error: data.error || `Save failed: ${response.status}` };
        return { ok: true, id: data.id };
      } catch (error) {
        return { ok: false, error: error.message || "network error" };
      }
    },
    [state.sessionId],
  );

  /** P9 — list saved puzzles for the active profile (newest first). */
  const listPuzzles = useCallback(async () => {
    try {
      const response = await fetch("/api/puzzles", { cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) return [];
      return Array.isArray(data.puzzles) ? data.puzzles : [];
    } catch {
      return [];
    }
  }, []);

  /** P9 — load a saved puzzle's position into a fresh attempt. Sets hook state like start(). */
  const resumePuzzle = useCallback(async (puzzleId) => {
    if (inFlightRef.current || !puzzleId) return null;
    inFlightRef.current = true;
    setState({ ...INITIAL_STATE, status: "starting" });
    try {
      const response = await fetch("/api/learn/resume-puzzle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ puzzleId }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setState({
          ...INITIAL_STATE,
          status: "error",
          error: data.error || `Load failed: ${response.status}`,
        });
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
        puzzle: data.puzzle || null,
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
    applyImprintChoice,
    applyCleanupDiscardChoice,
    // WI-7 — the seven kinds that previously had no client half (soft-locked a human seat).
    applyDigLandChoice,
    applyDistributeCountersChoice,
    applyOptionalDrawDiscardChoice,
    applyOptionalDiscardPaymentChoice,
    applyOptionalExileSelfChoice, // OPTIONAL-EXILE-SELF (Undead Butler)
    applyMilledPickChoice, // MILLED-PICK (Ripples / Six)
    applySacUnlessPayChoice,
    applyTaxedPaymentChoice,
    applyEdictModeChoice,
    applyImpulseDigChoice,
    applyLookTopTakeChoice,
    applySacrificeChoice,
    applyDiscardChoice,
    applyHandToLibraryTopChoice,
    applyDivideChoice,
    applySoftCounterChoice,
    applyOptionalManaPaymentChoice,
    applyOptionalLifePaymentChoice,
    applyOptionalSacChoice,
    applyCommanderReturnChoice,
    mulligan,
    reset,
    listSaves,
    resume,
    deleteSave,
    saveAsPuzzle,
    listPuzzles,
    resumePuzzle,
  };
}

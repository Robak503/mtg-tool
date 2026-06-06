/**
 * arbiterSeam.js — wire-layer enrichment for the Phase-2 P2.1 unresolved→Arbiter
 * seam.
 *
 * The PURE engine (learnSession) only flags `state.pendingArbiter` and surfaces a
 * `decision.kind === "unresolved"` carrying the card. It deliberately does NOT
 * build a board summary or compose a prompt — that is a wire/UI concern, and the
 * engine must never call the network (Arbiter is a server route, Ollama-only).
 *
 * This module (imported by the /api/learn/* routes, never by the engine loop)
 * enriches the wire decision with:
 *   - `question`: a plain-English prompt for the Arbiter
 *   - `context`:  the live board rendered for grounding (reuses buildBoardContext)
 * so the UI can hand the card to the Ollama-only Arbiter (/api/arbiter) for a
 * verified ruling. Pure: takes a decision + state, returns a new decision.
 */

import { buildBoardContext } from "./boardContext.js";

/** Compose the Arbiter question for an unresolved cast spell. */
export function composeArbiterQuestion({ cardName, oracle, controller } = {}) {
  const name = cardName || "this card";
  const who = controller === "user" ? "You" : "An opponent";
  const text = oracle ? ` Its text reads: "${oracle}".` : "";
  return (
    `${who} cast ${name} during a game of Magic.${text} The teaching simulator ` +
    `can't model this card's effect automatically. Explain exactly what happens ` +
    `when ${name} resolves, given the current board state, and cite the relevant rules.`
  );
}

/**
 * Enrich an `unresolved` decision with a composed question + the live board
 * context so the UI can call the Arbiter. A no-op for any other decision kind
 * (so routes can wrap every decision unconditionally).
 */
export function enrichUnresolvedDecision(decision, state) {
  if (!decision || decision.kind !== "unresolved") return decision;
  return {
    ...decision,
    question: composeArbiterQuestion(decision),
    context: buildBoardContext(state),
  };
}

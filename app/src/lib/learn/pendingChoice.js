/**
 * pendingChoice.js — the resolution-time interactive-choice seam (leaf module).
 *
 * Mirrors pendingArbiter.js, but for a choice the engine CAN model yet needs the
 * player to make: a tutor's "search your library for a card" (CR 701.19). When a
 * tutor atom resolves, instead of auto-picking it flags `state.pendingChoice` with
 * the legal candidates and pauses the effect program (runProgram records where to
 * resume). The session driver then either surfaces a picker (the player's own tutor,
 * beginner/intermediate) or auto-picks (Expert autopilot / an opponent), exactly the
 * pendingArbiter pause-or-autocontinue split.
 *
 * Plain JSON only (no closures) so a game serialized mid-choice restores intact.
 * Imports only logEvent from gameState — no cycle.
 */

import { logEvent } from "./gameState.js";

/**
 * Flag a tutor search awaiting a card choice. `candidates` is the list of legal
 * library cards as `{ id, name }` (hidden-info safe — names are the searcher's own
 * library). FIFO: one pending choice at a time (the driver settles it before the
 * next atom/spell resolves, so this guard is belt-and-braces).
 */
export function setPendingTutorChoice(state, { controller, candidates, sourceName = null, filterLabel = null }) {
  if (state.pendingChoice) return state;
  const next = logEvent(state, { kind: "tutor-search-pending", controller, count: candidates.length, sourceName });
  return {
    ...next,
    pendingChoice: {
      kind: "tutor-search",
      controller,
      candidates,
      sourceName,
      filterLabel,
    },
  };
}

/** Clear the pending choice (after it's resolved). */
export function clearPendingChoice(state) {
  if (!state.pendingChoice) return state;
  const { pendingChoice: _drop, ...rest } = state;
  return rest;
}

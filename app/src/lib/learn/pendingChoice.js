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

/**
 * Flag a clone awaiting its "which creature to copy" choice (CR 707.9 — chosen as the permanent
 * enters). `candidates` is the list of legal copy-target battlefield permanents as `{ id, name }`.
 * `resume` carries what's needed to finish the entry once chosen: the clone's own card + its
 * controller + whether the choice is optional (a "you may" clone can decline → enter as itself).
 * Public info (the candidates are visible permanents). FIFO like the tutor choice.
 */
export function setPendingCloneChoice(state, { controller, candidates, sourceName = null, resume }) {
  if (state.pendingChoice) return state;
  const next = logEvent(state, { kind: "clone-choice-pending", controller, count: candidates.length, sourceName });
  return {
    ...next,
    pendingChoice: {
      kind: "clone-search",
      controller,
      candidates,
      sourceName,
      resume,
    },
  };
}

/**
 * Flag a scry/surveil awaiting the player's keep-on-top / move-away decision (CR 701.18 / 701.43).
 * `cards` is the top N of the controller's library, top-first, as `{ id, name }` (public to the
 * controller — they're looking at their own library). `mode` is "scry" (rest → bottom) or
 * "surveil" (rest → graveyard). Like the tutor, `runProgram` records the suspended-program
 * continuation onto `pendingChoice.resume` when it detects the pause. FIFO: one choice at a time.
 */
export function setPendingScryChoice(state, { controller, mode, cards, sourceName = null }) {
  if (state.pendingChoice) return state;
  const next = logEvent(state, { kind: "scry-pending", controller, mode, count: cards.length, sourceName });
  return {
    ...next,
    pendingChoice: {
      kind: "scry-surveil",
      controller,
      mode,
      cards,
      sourceName,
    },
  };
}

/**
 * Flag a hand-disruption awaiting the CASTER's pick of which card to discard (δ-1b, CR 701.8 — Duress
 * / Thoughtseize / …). The spell already targeted ONE opponent (`victim`) at cast; the atom resolved by
 * revealing that opponent's hand and filtering it, so `candidates` is the matching subset as
 * `{ id, name }`. The caster picks one to discard (driver: a picker for the human, auto-pick the best for
 * the AI / Expert). `controller` is the CASTER (who decides); `victim` is the opponent whose hand it is
 * and whose graveyard the card moves to. The candidate names are revealed by the spell — surfacing them
 * to the caster is the "reveal," and ONLY this one opponent's hand is exposed (no 4P leak). FIFO.
 */
export function setPendingHandDiscardChoice(state, { controller, victim, candidates, sourceName = null }) {
  if (state.pendingChoice) return state;
  const next = logEvent(state, { kind: "hand-discard-pending", controller, victim, count: candidates.length, sourceName });
  return {
    ...next,
    pendingChoice: {
      kind: "hand-discard",
      controller,
      victim,
      candidates,
      sourceName,
    },
  };
}

/**
 * Flag an impulse-dig awaiting the player's pick of which looked-at card to keep (δ-2 — Telling Time /
 * Strategic Planning / Glimpse the Cosmos). `candidates` is the top N of the controller's OWN library,
 * top-first, as `{ id, name }` (public to the controller — they're looking at their own library). The
 * chosen card goes to HAND; the rest go to `restTo` ("bottom" of the library / "graveyard"). Like the
 * tutor/scry, `runProgram` records the suspended-program continuation onto `pendingChoice.resume` when
 * it detects the pause. FIFO: one choice at a time.
 */
export function setPendingImpulseDigChoice(state, { controller, candidates, restTo, sourceName = null }) {
  if (state.pendingChoice) return state;
  const next = logEvent(state, { kind: "impulse-dig-pending", controller, count: candidates.length, restTo, sourceName });
  return {
    ...next,
    pendingChoice: {
      kind: "impulse-dig",
      controller,
      candidates,
      restTo,
      sourceName,
    },
  };
}

/** Clear the pending choice (after it's resolved). */
export function clearPendingChoice(state) {
  if (!state.pendingChoice) return state;
  const { pendingChoice: _drop, ...rest } = state;
  return rest;
}

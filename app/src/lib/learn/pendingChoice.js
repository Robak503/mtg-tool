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
 * Flag an impulse-dig awaiting the player's pick of which looked-at card to keep (δ-2 — Anticipate /
 * Strategic Planning / Impulse). `candidates` is the top N of the controller's OWN library,
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

/**
 * ===== EDICTS ===== — flag a sacrifice awaiting the SACRIFICING player's pick of which creature to give
 * up (CR 701.16 — Diabolic Edict / Cruel Edict / Geth's Verdict). The spell targeted ONE player; that
 * target is the sacrificer, and `controller` here is THAT player (not the caster) — so the driver's
 * `pause = pc.controller === "user"` rule pauses for a human sacrificer and auto-sacs an AI one, exactly
 * like the other choices. `candidates` is the sacrificer's creatures as `{ id, name }` (public — on the
 * battlefield, and the chooser is their controller). The caster's continuation rides on `pendingChoice
 * .resume` (attached by runProgram), so a rider — Geth's Verdict "You lose 1 life" — runs after. FIFO.
 */
export function setPendingSacrificeChoice(state, { controller, candidates, queue = null, sourceName = null }) {
  if (state.pendingChoice) return state;
  const next = logEvent(state, { kind: "sacrifice-pending", controller, count: candidates.length, sourceName });
  return {
    ...next,
    pendingChoice: {
      kind: "sacrifice-choice",
      controller,
      candidates,
      // EACH-PLAYER / EACH-OPPONENT edicts resolve as a CHAIN: `queue` is the remaining sacrificers (head =
      // the current one). Single-target edicts (#214) pass no queue → a queue-of-one settles then resumes.
      queue,
      sourceName,
    },
  };
}

/**
 * ===== DIVIDE ===== (MT-1) — flag a divide-damage spell awaiting the CASTER's DIVISION decision (which
 * targets get how much of `amount`; CR 601.2d's division is modeled at RESOLUTION to avoid the cast-time
 * cartesian blow-up of "any number of targets × every split"). `controller` is the caster (the divider);
 * the driver pauses for a human caster and auto-distributes for an AI/Expert (autoPickDivideDistribution).
 * `candidates` is the legal target set as `{ id, name, type }` (creatures on every battlefield + players,
 * per the spell's `group`) — all public, hidden-info safe. `amount` is the total damage to split (each
 * assigned target gets ≥1, CR 601.2d). The caster's continuation rides on `pendingChoice.resume`.
 */
export function setPendingDivideChoice(state, { controller, amount, candidates, group, sourceName = null }) {
  if (state.pendingChoice) return state;
  const next = logEvent(state, { kind: "divide-damage-pending", controller, amount, count: candidates.length, sourceName });
  return {
    ...next,
    pendingChoice: { kind: "divide-damage", controller, amount, candidates, group, sourceName },
  };
}

/**
 * ===== EACH-PLAYER ===== discard (EP-2) — flag a discard awaiting the DISCARDING player's pick of which
 * card to pitch (CR 701.8 — the discarding player chooses, NOT the caster; the opposite chooser to δ-1b
 * hand disruption). `controller` here is the DISCARDER (Mind Rot's target / each player), so the driver's
 * `pause = pc.controller === "user"` rule pauses for a human discarder and auto-discards an AI one. A
 * discard of N>1 or by several players ("each player discards N") resolves as a CHAIN: this flags the
 * NEXT single-card pick; `remaining` is how many more THIS discarder owes, and `queue` is the remaining
 * discarders (head = the current one, with its own `remaining`). `candidates` is the discarder's hand as
 * `{ id, name }` (public — the chooser owns the hand). The caster's continuation rides on
 * `pendingChoice.resume` (attached by runProgram on the FIRST pause; resolveDiscardChoice carries it
 * forward across the chain). Only flagged when a REAL choice exists (hand > remaining); a hand ≤ remaining
 * is the forced whole-hand discard, resolved inline with no pause. FIFO: one pick at a time.
 */
export function setPendingDiscardChoice(state, { controller, remaining, candidates, queue, sourceName = null }) {
  if (state.pendingChoice) return state;
  const next = logEvent(state, { kind: "discard-pending", controller, remaining, count: candidates.length, sourceName });
  return {
    ...next,
    pendingChoice: {
      kind: "discard",
      controller,
      remaining,
      candidates,
      queue,
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

/**
 * pendingArbiter.js — the P2.1 unresolved→Arbiter seam marker (leaf module).
 *
 * Extracted from resolvers.js so BOTH the resolver registry (spell.noop) AND the
 * Phase-2 EffectProgram interpreter (effect-program, low confidence) can flag an
 * unresolved spell without an import cycle (resolvers → runProgram → here, and
 * resolvers → here; neither imports back). Imports only logEvent from gameState.
 *
 * Contract (CLAUDE.md §1.2/§8 — "incomplete but never wrong"): when the engine
 * can't model a cast spell it leaves an HONEST marker — a structured
 * `spell-unresolved` log + `state.pendingArbiter` — and NEVER fabricates the
 * effect or silently no-ops. The session driver decides whether to pause (the
 * player's own spell, beginner/intermediate) and the UI hands the card to the
 * Ollama-only Arbiter for a ruling. The engine itself never calls the network.
 */

import { logEvent } from "./gameState.js";

/**
 * Flag a stack object the engine couldn't resolve. Logs `spell-unresolved` and
 * sets `state.pendingArbiter` (FIFO — the first unresolved object wins; the
 * driver pauses before a second can resolve, so this guard is belt-and-braces).
 */
export function markPendingArbiter(state, obj, reason) {
  const card = obj?.source && typeof obj.source === "object" ? obj.source : {};
  const cardName = card.name || obj?.payload?.params?.cardName || (typeof obj?.source === "string" ? obj.source : "Unknown card");
  const oracle = card.oracle || card.oracle_text || "";
  let next = logEvent(state, {
    kind: "spell-unresolved",
    objectId: obj?.id,
    cardName,
    controller: obj?.controller,
    reason,
  });
  if (!next.pendingArbiter) {
    next = {
      ...next,
      pendingArbiter: {
        stackObjectId: obj?.id ?? null,
        cardName,
        oracle,
        reason,
        controller: obj?.controller ?? null,
      },
    };
  }
  return next;
}

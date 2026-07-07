/**
 * effects/atoms/monarch.js — THE MONARCH (CR 720): the become-monarch atom + the two subsystem hooks.
 *
 * CR 720 in three parts, each with one owner:
 *   - "you become the monarch" — an effect atom (op:"become-monarch") any spell/trigger program can carry
 *     (Palace Sentinels' ETB, Feast of Succession's second sentence). Sets `state.monarchId` + logs.
 *   - CR 720.3 — at the beginning of the monarch's end step, that player draws a card. Hooked from the
 *     end-step turn processing (gameEngine), active only when the ACTIVE player IS the monarch.
 *   - CR 720.4 — a creature dealing combat damage to the monarch passes the crown to its controller.
 *     Hooked from combatResolution's per-attacker player-damage events (creature combat damage only, the
 *     exact CR scope). Simultaneous hits resolve in deterministic event order (last dealer crowned) — an
 *     accepted approximation of the APNAP choice, never a dropped steal.
 *
 * There is no monarch until an effect crowns someone (state.monarchId stays undefined — every hook
 * no-ops); once crowned there is always exactly one monarch (CR 720.2), which the single-field state
 * guarantees by construction.
 *
 * CIRCULAR-IMPORT HAZARD (Wave-0): imports gameState only (a leaf); the INTEGRATOR wires
 * registerClauseParser at parser.js-bottom, the resolvers via the effectAtoms barrel, and the two hooks
 * at their turn/combat sites.
 */

import { logEvent, drawCards } from "../../gameState.js";

/** Crown `playerId` (CR 720.1). Idempotent for the sitting monarch (no event spam); unknown player = no-op. */
export function becomeMonarch(state, playerId) {
  if (!playerId || !state?.players?.[playerId]) return state;
  if (state.monarchId === playerId) return state;
  return logEvent({ ...state, monarchId: playerId }, { kind: "monarch", turn: state.turn, playerId });
}

/** The effect atom: the resolving program's CONTROLLER takes the crown ("you become the monarch"). */
export function applyBecomeMonarch(state, atom, ctx) {
  return becomeMonarch(state, ctx.controller);
}

export const monarchResolvers = { "become-monarch": applyBecomeMonarch };

/**
 * Clause parser — the EXACT self form only ("you become the monarch"). A targeted form ("target player
 * becomes the monarch" — Denethor) needs a chosen player target and stays unparsed → low → Arbiter
 * (a SAFE FN; never a mis-crowned player).
 */
export function monarchClauseParser(clause) {
  const t = String(clause || "").toLowerCase().trim().replace(/\.\s*$/, "");
  if (t === "you become the monarch") return { op: "become-monarch", targetType: null };
  return null;
}

/** CR 720.3 — the monarch draws at the beginning of THEIR end step. Called at the end-step processing. */
export function applyMonarchEndStepDraw(state) {
  const m = state?.monarchId;
  if (!m || m !== state.activePlayer || !state.players?.[m]) return state;
  return logEvent(drawCards(state, { playerId: m, count: 1 }), { kind: "monarch-draw", turn: state.turn, playerId: m });
}

/** CR 720.4 — creature combat damage to the monarch steals the crown for the dealer's controller. */
export function applyMonarchCombatSteal(state, playerEvents) {
  let next = state;
  for (const ev of playerEvents || []) {
    if (ev.kind === "combat-damage-player" && ev.amount > 0 && next.monarchId
      && ev.defender === next.monarchId && ev.attackingPlayer !== next.monarchId) {
      next = becomeMonarch(next, ev.attackingPlayer);
    }
  }
  return next;
}

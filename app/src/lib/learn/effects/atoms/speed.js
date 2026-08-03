/**
 * effects/atoms/speed.js — the KW-ENGINES speed subsystem's atom half (Aetherdrift, CR 702.179).
 *
 * "Start your engines!" is a keyword ability: when the permanent enters, if its controller has no
 * speed, their speed becomes 1 (CR 702.179b). detectTriggers synthesizes a self-ETB descriptor
 * whose effectClause is the [start-your-engines] sentinel (the undying/afterlife precedent) — ONLY
 * this parser reads that sentinel, so no printed wording can reach the atom by accident.
 *
 * The rest of the subsystem lives at its natural chokepoints:
 *   - the once-per-your-turn increase on opponent life loss → gameState.loseLife (the single
 *     life-loss funnel; CR 702.179c);
 *   - the turn re-arm → gameState.resetCreatureDeathsAllPlayers (the sibling-ledger cadence);
 *   - the "Max speed —" gate → manaModel (a max-speed mana ability is live only at speed 4).
 *
 * Speed is a PLAYER property (player.speed, undefined = has none) and persists for the game.
 */

import { logEvent } from "../../gameState.js";

export const START_ENGINES_SENTINEL = "[start-your-engines] if you have no speed, your speed becomes 1";

/** Clause parser for the synthesized sentinel — registered in parser.js. */
export function startEnginesClauseParser(clause) {
  if (String(clause || "").trim().toLowerCase() === START_ENGINES_SENTINEL) {
    return { op: "start-engines" };
  }
  return null;
}

/** CR 702.179b — the controller's speed becomes 1 ONLY if they have none; never lowers, never exceeds. */
export function applyStartEngines(state, atom, ctx) {
  const pid = ctx?.controller;
  const player = state.players?.[pid];
  if (!player) return state;
  if ((player.speed || 0) >= 1) return state; // already has speed — the keyword does nothing (CR 702.179b)
  const next = { ...state, players: { ...state.players, [pid]: { ...player, speed: 1 } } };
  return logEvent(next, { kind: "speed-started", playerId: pid, speed: 1 });
}

export const speedResolvers = {
  "start-engines": applyStartEngines,
};

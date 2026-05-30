/**
 * boardContext.js — render the live game into a compact text block so the
 * in-session "ask the tutor" pop-out can answer questions grounded in the
 * actual board (not a guess). Reused by /api/learn/ask.
 */

import { tableSnapshot } from "./tableSnapshot.js";

const SEAT_LABELS = { user: "You", ai: "Opponent", ai1: "AI 1", ai2: "AI 2", ai3: "AI 3" };
const label = id => SEAT_LABELS[id] || id;

function permLabel(perm) {
  const card = perm?.card || {};
  const pt = (card.power != null && card.toughness != null) ? ` ${card.power}/${card.toughness}` : "";
  const tapped = perm?.tapped ? " (tapped)" : "";
  return `${card.name || "?"}${pt}${tapped}`;
}

/** A concise snapshot of the current game for the tutor to reason over. */
export function buildBoardContext(state) {
  if (!state || !state.players) return "";
  const lines = [];
  lines.push(`## CURRENT GAME — turn ${state.turn}, ${[state.phase, state.step].filter(Boolean).join(" / ")}, ${label(state.activePlayer)}'s turn`);
  lines.push("");
  lines.push("Seats:");
  for (const seat of tableSnapshot(state)) {
    const cmd = Object.entries(seat.commanderDamage || {})
      .filter(([, n]) => n > 0)
      .map(([from, n]) => `${label(from)} ${n}`)
      .join(", ");
    lines.push(
      `- ${label(seat.id)}${seat.isActive ? " (active)" : ""}: ${seat.life} life, ` +
      `${seat.handCount} in hand, ${seat.boardCount} on board, ${seat.graveyardCount} in graveyard` +
      (cmd ? `, commander damage from ${cmd}` : ""),
    );
  }

  const user = state.players.user;
  if (user) {
    lines.push("");
    const hand = (user.hand || []).map(c => c?.name).filter(Boolean);
    lines.push(`Your hand (${hand.length}): ${hand.length ? hand.join(", ") : "(empty)"}`);
    const board = (user.battlefield || []).map(permLabel);
    lines.push(`Your board: ${board.length ? board.join(", ") : "(empty)"}`);
  }

  return lines.join("\n");
}

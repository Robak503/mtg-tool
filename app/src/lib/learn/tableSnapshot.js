/**
 * tableSnapshot.js — slim per-player view model for the Learn-to-Play UI.
 *
 * The server holds the full GameState; the client only needs each seat's life,
 * zone counts, commander damage, and whose turn it is to render the table
 * (the player's own panel + the opponent strips). Eliminated seats are already
 * removed from `turnOrder`/`players` by learnSession, so the snapshot only ever
 * lists living players, in turn order.
 */

/** @returns {Array<{ id, isUser, isActive, life, handCount, boardCount, graveyardCount, commanderDamage }>} */
export function tableSnapshot(state) {
  if (!state || !state.players) return [];
  const order = Array.isArray(state.turnOrder) && state.turnOrder.length
    ? state.turnOrder
    : Object.keys(state.players);
  return order
    .filter(id => state.players[id])
    .map(id => {
      const p = state.players[id];
      return {
        id,
        isUser: id === "user",
        isActive: id === state.activePlayer,
        life: p.life,
        handCount: (p.hand || []).length,
        boardCount: (p.battlefield || []).length,
        graveyardCount: (p.graveyard || []).length,
        commanderDamage: { ...(p.commanderDamageFrom || {}) },
      };
    });
}

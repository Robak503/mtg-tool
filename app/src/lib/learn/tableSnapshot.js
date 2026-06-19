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
  // CMD-DAMAGE: `commanderDamageFrom` is keyed by the source commander's CARD id — build an id→name map
  // across every zone so the UI shows "cmdr dmg <Commander> N", not a raw card id.
  const commanderName = {};
  for (const pid of Object.keys(state.players)) {
    const pl = state.players[pid];
    for (const zone of ["command", "battlefield", "graveyard", "exile", "hand"]) {
      for (const entry of (pl?.[zone] || [])) {
        const card = entry?.card || entry;
        if (card?.isCommander && card.id) commanderName[card.id] = card.name || card.id;
      }
    }
  }
  const order = Array.isArray(state.turnOrder) && state.turnOrder.length
    ? state.turnOrder
    : Object.keys(state.players);
  return order
    .filter(id => state.players[id])
    .map(id => {
      const p = state.players[id];
      const commanderDamage = {};
      for (const [cmdId, n] of Object.entries(p.commanderDamageFrom || {})) {
        commanderDamage[commanderName[cmdId] || cmdId] = n; // key by commander name for display
      }
      return {
        id,
        isUser: id === "user",
        isActive: id === state.activePlayer,
        life: p.life,
        handCount: (p.hand || []).length,
        boardCount: (p.battlefield || []).length,
        graveyardCount: (p.graveyard || []).length,
        commanderDamage,
      };
    });
}

/**
 * tableSnapshot.js — slim per-player view model for the Learn-to-Play UI.
 *
 * The server holds the full GameState; the client only needs each seat's life,
 * zone counts, commander damage, and whose turn it is to render the table
 * (the player's own panel + the opponent strips). Eliminated seats are already
 * removed from `turnOrder`/`players` by learnSession, so the snapshot only ever
 * lists living players, in turn order.
 */

/** @returns {Array<{ id, isUser, isActive, life, eliminated, handCount, boardCount, graveyardCount, commanderDamage }>} */
export function tableSnapshot(state) {
  if (!state || !state.players) return [];
  // CMD-DAMAGE: `commanderDamageFrom` is keyed by the source commander's CARD id — build an id→name map
  // across every zone so the UI shows "cmdr dmg <Commander> N", not a raw card id.
  const commanderName = {}; // tracker key -> { name, seat }
  const nameSeen = {}; // name -> count of DISTINCT tracker keys (mirror detection)
  for (const pid of Object.keys(state.players)) {
    const pl = state.players[pid];
    for (const zone of ["command", "battlefield", "graveyard", "exile", "hand"]) {
      for (const entry of pl?.[zone] || []) {
        const card = entry?.card || entry;
        if (!card?.isCommander || !card.id) continue;
        const key = card.commanderInstanceId || card.id;
        if (!commanderName[key]) {
          const name = card.name || key;
          commanderName[key] = { name, seat: pid };
          nameSeen[name] = (nameSeen[name] || 0) + 1;
        }
      }
    }
  }
  const order =
    Array.isArray(state.turnOrder) && state.turnOrder.length
      ? state.turnOrder
      : Object.keys(state.players);
  return order
    .filter((id) => state.players[id])
    .map((id) => {
      const p = state.players[id];
      const commanderDamage = {};
      for (const [cmdId, n] of Object.entries(p.commanderDamageFrom || {})) {
        const info = commanderName[cmdId];
        // MIRROR display: two live tracker keys sharing one name get seat-suffixed labels so the
        // rows don't last-write-win into one; the non-mirror label is byte-identical to before.
        const label = info
          ? nameSeen[info.name] > 1
            ? `${info.name} (${info.seat})`
            : info.name
          : cmdId;
        commanderDamage[label] = n;
      }
      // ELIMINATED (display): in FFA sole-survivor a dead seat can persist in the snapshot for a
      // window (before it's pruned from players), showing a raw negative life like "-4 life". Flag
      // it so the UI shows an ELIMINATED badge instead. Mirrors learnSession.isPlayerDead's
      // conditions (life ≤ 0, ten poison, 21+ from one commander, or an explicit loss).
      const eliminated =
        p.lostGame === true ||
        p.life <= 0 ||
        (p.poison || 0) >= 10 ||
        Object.values(commanderDamage).some((n) => n >= 21);
      return {
        id,
        isUser: id === "user",
        isActive: id === state.activePlayer,
        life: p.life,
        eliminated,
        handCount: (p.hand || []).length,
        boardCount: (p.battlefield || []).length,
        graveyardCount: (p.graveyard || []).length,
        commanderDamage,
      };
    });
}

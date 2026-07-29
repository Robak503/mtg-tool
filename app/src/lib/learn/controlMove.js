/**
 * controlMove.js — the ONE way a permanent changes controller (CR 613.1b layer-2 / CR 702.10c).
 *
 * WHY THIS EXISTS. The move was written twice: once in `effects/atoms/control.js` (the indefinite
 * gain-control atom — Sliver Overlord) and once in `controlAura.js` (the while-attached control Auras —
 * Mind Control). The second copy was a DELIBERATE debt, taken to avoid destabilising a proven atom in the
 * middle of a build, and recorded as such at the time. This closes it: both callers now share one body, so
 * a fix to how control moves cannot land on one and miss the other.
 *
 * ⛔ AN ARRAY SPLICE, NOT `moveCardToZone`, and that distinction is the whole correctness of it. The
 * creature never LEAVES the battlefield when it changes hands, so:
 *   · no dies/LTB trigger fires (a creature that only changed controller has not died);
 *   · its identity survives, so every `attachedTo` back-reference pointing at it stays valid;
 *   · tapped state, counters, marked damage and attachments all ride along untouched (CR 702.10e — gaining
 *     control of a creature does not change control of what is attached to it).
 * The one thing that DOES change besides the controller is summoning sickness: it has not been under the
 * new controller's control since their turn began, so it is sick under them (CR 702.10c) and untaps/clears
 * on their next untap step exactly like a freshly-entered creature.
 *
 * ⛔ ZERO IMPORTS. `controlAura.js` calls this and is itself called from `gameState.js`, the lowest layer —
 * any import here would risk a cycle back into that. Pure data in, pure data out; no closures, so a game
 * serialized mid-resolution restores byte-identical.
 *
 * Callers keep what is THEIRS: the gain-control atom keeps its own event log and soulbond teardown, the
 * Aura path keeps its control-stash fields. Only the move itself is shared.
 */

/**
 * Move `permId` to `toController`'s battlefield. Returns the state unchanged when the permanent cannot be
 * found, is already there, or either seat has left the game (CR 800.4a) — never a throw, so a caller mid-
 * resolution degrades to a clean no-op rather than aborting the game.
 *
 * @param extra extra fields to stamp on the moved permanent (the Aura path's control stash).
 */
export function moveControl(state, permId, toController, extra = {}) {
  const players = state?.players || {};
  let from = null;
  for (const pid of Object.keys(players)) {
    if ((players[pid]?.battlefield || []).some((p) => p?.id === permId)) { from = pid; break; }
  }
  if (from == null || from === toController) return state;
  const fromPlayer = players[from];
  const toPlayer = players[toController];
  if (!fromPlayer || !toPlayer) return state;
  const perm = fromPlayer.battlefield.find((p) => p.id === permId);
  if (!perm) return state;
  const moved = { ...perm, controller: toController, summoningSick: true, ...extra };
  return {
    ...state,
    players: {
      ...players,
      [from]: { ...fromPlayer, battlefield: fromPlayer.battlefield.filter((p) => p.id !== permId) },
      [toController]: { ...toPlayer, battlefield: [...toPlayer.battlefield, moved] },
    },
  };
}

/** Which player currently controls `permId`? null when it is not on any battlefield. Shared so callers
 *  agree on what "where is it now" means. */
export function controllerOfPermanent(state, permId) {
  for (const pid of Object.keys(state?.players || {})) {
    if ((state.players[pid]?.battlefield || []).some((p) => p?.id === permId)) return pid;
  }
  return null;
}

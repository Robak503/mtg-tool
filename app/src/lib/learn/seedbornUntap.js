/**
 * seedbornUntap.js — Seedborn Muse's "untap all permanents you control during each other player's
 * untap step":
 *   "Untap all permanents you control during each other player's untap step."
 *
 * WHY A TARGETED HOOK (the vihaanAnimate.js / urDragonAttack.js / xCastToken.js #319 precedent):
 *   This is a STATIC ability that creates an extra untap event during OTHER players' untap steps (CR
 *   702 / 508-style turn-based untap, but driven off a permanent's static text, not the normal "untap
 *   your permanents" turn-based action). The general trigger compiler can't route it: detectTriggers
 *   has no "during each other player's untap step" event, and there is no untap-others atom in the
 *   effect vocabulary — so the clause parses LOW and the card stays body-only. The runtime instead
 *   fires a DEDICATED synchronous hook at the untap step (gameEngine.runStepActions → case "untap",
 *   right after the active player's own untapAll): for every NON-active player who controls a
 *   Seedborn-style watcher, untap that player's permanents too.
 *
 * CR: 502.x (the untap step's turn-based action untaps the ACTIVE player's permanents); Seedborn Muse's
 * static creates an ADDITIONAL untap of ITS controller's permanents during each OTHER player's untap
 * step (so a Seedborn controller effectively untaps on every player's turn). We set `tapped:false` only
 * — we deliberately do NOT clear summoningSick or the once-per-turn loyalty flag (those are tied to the
 * permanent CONTROLLER's OWN untap step, CR 302.6 / 606.3; clearing them on an opponent's untap would be
 * a fabrication). A controller with no tapped permanents untaps nothing (no-op).
 *
 * Self-contained + pure (returns a new state). ADDITIVE only — no core surgery; isolated to this module
 * + one wiring line in gameEngine + one additive coverage classifier. A board with no Seedborn-style
 * watcher is byte-identical (the watchers scan is empty → the state is returned unchanged).
 */
import { logEvent, untapOrConsumeStun } from "./gameState.js";

// Anchored to the WHOLE Seedborn templating so no other card false-matches. The subject must be "all
// permanents YOU control" (the controller's own permanents) and the timing must be "during each other
// player's untap step". Reminder text is stripped before matching. A different subject (a single type,
// "creatures", an opponent's permanents) or a different timing fails the anchor → null → not ours (the
// card stays on the Arbiter — CREED whole-card).
const SEEDBORN_UNTAP =
  /untap all permanents you control during each other player'?s untap step/i;

/**
 * Does this card carry the exact Seedborn "untap all permanents you control during each other player's
 * untap step" static? Returns true/false (mechanism-keyed, not name-keyed, so a future reprint/twin with
 * the identical templating flips automatically). Pure.
 */
export function isSeedbornUntap(card) {
  const oracle = String(card?.oracle ?? card?.oracle_text ?? "").replace(/\([^)]*\)/g, " ");
  return SEEDBORN_UNTAP.test(oracle);
}

/**
 * At the untap step of `activePlayer`, each Seedborn-style watcher controlled by a NON-active player makes
 * that player untap all THEIR permanents too. Mirrors gameState.untapAll's tap clear, but scoped to the
 * extra "during each other player's untap step" event — so it sets `tapped:false` ONLY (summoning sickness
 * and loyalty-activation flags stay, per the CR rationale above). A non-active controller with a watcher
 * untaps their whole battlefield; everyone else is untouched. Pure (returns a new state). ADDITIVE: a board
 * with no watcher returns `state` unchanged.
 */
export function applySeedbornUntap(state, activePlayer) {
  const players = state?.players;
  if (!players) return state;
  let next = state;
  for (const pid of Object.keys(players)) {
    if (pid === activePlayer) continue; // the active player already untapped via the normal turn-based untapAll
    const player = next.players[pid];
    if (!player?.battlefield?.length) continue;
    const hasWatcher = player.battlefield.some((perm) => isSeedbornUntap(perm.card));
    if (!hasWatcher) continue;
    // BECOMES-UNTAPPED events (Mesmeric Orb + Seedborn = the classic mill engine): record every real
    // tapped→untapped transition (a stun-consume stays tapped and never fires), the untapAll pattern.
    const becameUntapped = player.battlefield
      .filter((p) => p.tapped && !((p.counters?.stun || 0) > 0))
      .map((p) => ({ id: p.id, controller: pid }));
    const untapped = player.battlefield.map((p) => (p.tapped ? untapOrConsumeStun(p) : p)); // STUN (CR 122.1c): a stunned permanent consumes a stun counter here instead of untapping
    next = { ...next, players: { ...next.players, [pid]: { ...next.players[pid], battlefield: untapped } } };
    if (becameUntapped.length) next = { ...next, pendingUntapEvents: [...(next.pendingUntapEvents || []), ...becameUntapped] };
    next = logEvent(next, { kind: "seedborn-untap", controller: pid, duringUntapOf: activePlayer });
  }
  return next;
}

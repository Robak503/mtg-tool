/**
 * murkfiendUntap.js — Murkfiend Liege's "untap all green and/or blue creatures you control during each
 * other player's untap step":
 *   "Untap all green and/or blue creatures you control during each other player's untap step."
 *
 * WHY A TARGETED HOOK (the seedbornUntap.js precedent, same #319 family):
 *   This is a STATIC ability that creates an EXTRA untap event during OTHER players' untap steps — the
 *   same "during each other player's untap step" phase static Seedborn Muse carries, but with a COLOR +
 *   TYPE filter: it untaps only the controller's GREEN and/or BLUE CREATURES, not "all permanents". The
 *   general trigger compiler can't route it (no "during each other player's untap step" event in
 *   detectTriggers, no untap-others atom in the effect vocabulary), so the runtime instead fires a
 *   DEDICATED synchronous hook at the untap step (gameEngine.runStepActions → case "untap", right after
 *   the active player's own untapAll and after applySeedbornUntap): for every NON-active player who
 *   controls a Murkfiend-style watcher, untap that player's green/blue creatures too.
 *
 * WHY SEEDBORN CAN'T COVER IT: seedbornUntap.js untaps EVERY permanent the watcher's controller owns
 * (its selector is "all permanents you control"). Murkfiend restricts to green-and/or-blue creatures, so
 * reusing applySeedbornUntap would untap lands/artifacts/other-color creatures the card must NOT untap —
 * a mis-applied clause (forbidden FP). This hook honors the exact filter.
 *
 * COLOR/TYPE READ IS LAYER-AWARE: it reads each candidate permanent's EFFECTIVE color (permanentColors,
 * layer 5) and EFFECTIVE creature-ness (permanentIsCreature, layer 4) — the SAME derived characteristics
 * the two color anthems on this card use to decide who they buff. So an animated land that became a
 * blue creature, or a creature whose color was changed, is untapped iff the anthems would pump it — the
 * classifier and the runtime read one source of truth.
 *
 * CR: 502.x (the untap step's turn-based action untaps the ACTIVE player's permanents); Murkfiend's static
 * creates an ADDITIONAL untap of ITS controller's green/blue creatures during each OTHER player's untap
 * step. We set `tapped:false` only — we deliberately do NOT clear summoningSick or any once-per-turn flag
 * (those are tied to the permanent CONTROLLER's OWN untap step, CR 302.6 / 606.3; clearing them on an
 * opponent's untap would be a fabrication). A controller with no tapped green/blue creatures untaps
 * nothing (no-op).
 *
 * Self-contained + pure (returns a new state). ADDITIVE only — no core surgery; isolated to this module
 * + one wiring line in gameEngine + one additive coverage classifier. A board with no Murkfiend-style
 * watcher is byte-identical (the watchers scan is empty → the state is returned unchanged).
 */
import { logEvent, untapOrConsumeStun } from "./gameState.js";
import { permanentColors, permanentIsCreature } from "./layers.js";

// Anchored to the WHOLE Murkfiend templating so no other card false-matches. The subject must be "all
// green and/or blue creatures YOU control" (the controller's own green/blue creatures) and the timing must
// be "during each other player's untap step". Reminder text is stripped before matching. A different subject
// (a single color, "all permanents", "creatures and lands" — Prophet of Kruphix, an opponent's permanents)
// or a different timing fails the anchor → false → not ours (the card stays on the Arbiter — CREED whole-card).
const MURKFIEND_UNTAP =
  /untap all green and\/or blue creatures you control during each other player'?s untap step/i;

/**
 * Does this card carry the exact Murkfiend "untap all green and/or blue creatures you control during each
 * other player's untap step" static? Returns true/false (mechanism-keyed, not name-keyed, so a future
 * reprint/twin with the identical templating flips automatically). Pure.
 */
export function isMurkfiendUntap(card) {
  const oracle = String(card?.oracle ?? card?.oracle_text ?? "").replace(/\([^)]*\)/g, " ");
  return MURKFIEND_UNTAP.test(oracle);
}

/**
 * At the untap step of `activePlayer`, each Murkfiend-style watcher controlled by a NON-active player makes
 * that player untap all THEIR green and/or blue creatures too. Mirrors the Seedborn hook's tap clear, but
 * scoped to green/blue creatures (effective color + type, layer-aware) — so it sets `tapped:false` ONLY on
 * a permanent that is BOTH a creature and green or blue right now. A non-active controller with a watcher
 * untaps exactly their qualifying creatures; everyone else is untouched. Pure (returns a new state).
 * ADDITIVE: a board with no watcher returns `state` unchanged.
 */
export function applyMurkfiendUntap(state, activePlayer) {
  const players = state?.players;
  if (!players) return state;
  let next = state;
  for (const pid of Object.keys(players)) {
    if (pid === activePlayer) continue; // the active player already untapped via the normal turn-based untapAll
    const player = next.players[pid];
    if (!player?.battlefield?.length) continue;
    const hasWatcher = player.battlefield.some((perm) => isMurkfiendUntap(perm.card));
    if (!hasWatcher) continue;
    let changed = false;
    const becameUntapped = []; // BECOMES-UNTAPPED events (Mesmeric Orb) — real tapped→untapped transitions only
    const untapped = player.battlefield.map((p) => {
      if (!p.tapped) return p;
      // Layer-aware green/blue creature check — the SAME derived characteristics the anthems on this card
      // use. Must be BOTH a creature (layer 4) and green or blue (layer 5) to be untapped by this static.
      if (!permanentIsCreature(next, p.id)) return p;
      const cols = permanentColors(next, p.id) || [];
      if (!cols.includes("G") && !cols.includes("U")) return p;
      changed = true;
      if (!((p.counters?.stun || 0) > 0)) becameUntapped.push({ id: p.id, controller: pid }); // a stun-consume stays tapped
      return untapOrConsumeStun(p); // STUN (CR 122.1c): a stunned creature consumes a stun counter here instead of untapping
    });
    if (!changed) continue;
    next = { ...next, players: { ...next.players, [pid]: { ...next.players[pid], battlefield: untapped } } };
    if (becameUntapped.length) next = { ...next, pendingUntapEvents: [...(next.pendingUntapEvents || []), ...becameUntapped] };
    next = logEvent(next, { kind: "murkfiend-untap", controller: pid, duringUntapOf: activePlayer });
  }
  return next;
}

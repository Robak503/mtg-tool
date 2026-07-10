/**
 * fading.js — KW-FADING (CR 702.32a) + KW-VANISHING (CR 702.63a).
 *
 *   Fading N    — "enters with N fade counters on it" + "At the beginning of your upkeep, remove a fade
 *                 counter from this permanent. If you can't, sacrifice the permanent."
 *   Vanishing N — "enters with N time counters on it" + "At the beginning of your upkeep, if this permanent
 *                 has a time counter on it, remove a time counter from it" + "When the last time counter is
 *                 removed from this permanent, sacrifice it."
 *
 * Both are SELF-CONTAINED and deterministic (no player choice): an ETB counter-add + an upkeep
 * remove-or-sacrifice. So the keyword body plays correctly end-to-end with two hooks — the ETB resolver
 * (adds the counters) and the upkeep step (this module's `applyFadeVanishUpkeep`). No stack/targeting.
 *
 * The "when the last time counter is removed → sacrifice" ability is hard-coded into the upkeep removal
 * (the normal path). A time counter removed by some OTHER effect won't trigger the sacrifice here — a rare
 * edge left as a safe false-negative.
 *
 * Pure: regex + board reads; returns a new state.
 */

import { findPermanent, moveCardToZone, removeCounter, logEvent, creaturePower, creatureBasePower } from "./gameState.js";
import { checkDiesTriggers } from "./triggers.js";

// Keyword-position match (line start / keyword-list) so a reminder-text or granted mention can't false-fire.
const FADING = /(?:^|\n|, |; )fading\s+(\d+)/i;
const VANISHING = /(?:^|\n|, |; )vanishing\s+(\d+)/i;

/** { kind: "fading"|"vanishing", n, counterType: "fade"|"time" } or null. */
export function parseFadingVanishing(card) {
  const oracle = String(card?.oracle ?? card?.oracle_text ?? "");
  const f = oracle.match(FADING);
  if (f) return { kind: "fading", n: parseInt(f[1], 10), counterType: "fade" };
  const v = oracle.match(VANISHING);
  if (v) return { kind: "vanishing", n: parseInt(v[1], 10), counterType: "time" };
  return null;
}

/** The fade/time counters a permanent ENTERS with (for the ETB resolver). 0 if it isn't fading/vanishing. */
export function entersWithFadeCounters(card) {
  const fv = parseFadingVanishing(card);
  return fv ? { type: fv.counterType, n: fv.n } : null;
}

/**
 * At the ACTIVE player's upkeep (CR "your upkeep"), process every fading/vanishing permanent they control:
 *   fading    — remove a fade counter; if there are none, sacrifice it;
 *   vanishing — if it has a time counter, remove one; if that was the last, sacrifice it.
 * Sacrificed permanents go to their owner's graveyard and fire dies-triggers (look-back snapshot). Pure.
 */
export function applyFadeVanishUpkeep(state) {
  const pid = state.activePlayer;
  const player = state.players?.[pid];
  if (!player) return state;
  let next = state;
  const dead = [];
  // Snapshot the battlefield up front (we mutate `next` while iterating).
  for (const snapshot of [...player.battlefield]) {
    const fv = parseFadingVanishing(snapshot.card);
    if (!fv) continue;
    const lk = findPermanent(next, snapshot.id);
    if (!lk) continue; // already gone
    const count = lk.permanent.counters?.[fv.counterType] || 0;
    const sacrifice = () => {
      // Power + base power captured pre-move (CR 603.6e) so a dies-payoff reading either LKI resolves.
      const fvPw = creaturePower(lk.permanent, next);
      const fvBpw = creatureBasePower(lk.permanent, next);
      dead.push({ controller: pid, id: snapshot.id, name: snapshot.card?.name || "permanent", card: snapshot.card, counters: { ...(lk.permanent.counters || {}) }, power: Number.isFinite(fvPw) ? fvPw : null, basePower: Number.isFinite(fvBpw) ? fvBpw : null });
      next = moveCardToZone(next, { playerId: pid, fromZone: "battlefield", toZone: "graveyard", cardId: snapshot.id });
    };
    if (fv.kind === "fading") {
      if (count > 0) next = removeCounter(next, { permanentId: snapshot.id, type: "fade", amount: 1 });
      else sacrifice(); // can't remove a fade counter → sacrifice (CR 702.32a)
    } else { // vanishing
      if (count > 0) {
        next = removeCounter(next, { permanentId: snapshot.id, type: "time", amount: 1 });
        if (count - 1 === 0) sacrifice(); // the LAST time counter was removed → sacrifice (CR 702.63a)
      }
      // 0 time counters: "if it has a time counter" guard → no removal, no sacrifice (it left already).
    }
  }
  if (dead.length) {
    next = logEvent(next, { kind: "fade-vanish-sacrifice", turn: next.turn, controller: pid, names: dead.map((d) => d.name) });
    next = checkDiesTriggers(next, dead);
  }
  return next;
}

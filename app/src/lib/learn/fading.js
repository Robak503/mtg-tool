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

// ─── KW-SUSPEND (CR 702.62) — the NO-MANA-COST trio's only cast path ─────────────────────────────
//
// "Suspend N—{cost}" on a card with NO printed mana cost (Lotus Bloom / Sol Talisman / Mox
// Tantalite): suspending is the ONLY way to cast it, so the keyword cannot be pre-stripped as a
// vacuous alt-cast (the with-mana-cost carriers' path). Modeled here because suspend IS the time-
// counter mechanic this module owns:
//   - the SUSPEND special action (legalChoices/actionDispatcher): pay {cost}, exile the card with
//     `_suspendCounters: N` (the plot stamp pattern — exile zone + plain-JSON flags);
//   - the OWNER's upkeep (applySuspendUpkeep, wired beside applyFadeVanishUpkeep): remove one time
//     counter; at ZERO the card is stamped `_suspendReady` and legalChoices offers the FREE cast
//     through the REAL cast path (castActionsFromZone freeCast — the plot machinery), so cast
//     triggers/watchers fire exactly as a hand cast's would (CR 702.62e — the card IS cast).
//
// TWO DOCUMENTED SIMPLIFICATIONS, both FN-safe by direction and pinned in suspendNoCost.test.js:
//   - CR makes the zero-counter cast MANDATORY; the engine OFFERS it (an offer can never fire
//     wrongly; a declined Bloom under-uses the card, never mis-plays it).
//   - the cast window is "whenever the owner has priority once ready" rather than exactly the
//     upkeep trigger's resolution — for the three scoped ARTIFACTS the battlefield result is
//     identical; a CREATURE carrier (which would also need the suspend haste grant) is NOT scoped
//     and stays parked (the classifier credit below matches this gate exactly).

// The bare suspend line, whole-line anchored; only meaningful when the card has no mana cost.
// The printed line carries its reminder on the SAME line ("Suspend 3—{0} (Rather than cast…)"),
// so a trailing paren block is tolerated — but nothing else may follow (a rider fails the anchor).
const SUSPEND_LINE = /(?:^|\n)suspend\s+(\d+)\s*[—–-]\s*((?:\{[^}]+\})+)\s*(?:\([^)]*\))?\s*(?:\n|$)/i;

/** { n, costPips } for a NO-mana-cost suspend card the runtime can play; null otherwise. */
export function parseSuspendNoCost(card) {
  const mana = String(card?.mana ?? card?.mana_cost ?? "").trim();
  if (mana) return null; // a with-cost carrier hard-casts; its suspend line is the vacuous-alt-cast strip's job
  const type = String(card?.type ?? card?.type_line ?? "");
  if (/\bCreature\b/i.test(type)) return null; // creature suspend needs the haste grant — not scoped, parked
  if (/\bLand\b/i.test(type)) return null;     // lands cannot be cast at all
  const m = String(card?.oracle ?? card?.oracle_text ?? "").match(SUSPEND_LINE);
  if (!m) return null;
  return { n: parseInt(m[1], 10), costPips: m[2] };
}

/**
 * The OWNER's upkeep half (CR 702.62d): remove one time counter from each of the active player's
 * suspended exile cards; a card reaching ZERO is stamped `_suspendReady` (the free cast is offered
 * from legalChoices through the real cast machinery). Wired in gameEngine beside the fade/vanish
 * upkeep. Pure.
 */
export function applySuspendUpkeep(state) {
  const pid = state.activePlayer;
  const player = state.players?.[pid];
  if (!player) return state;
  const exile = player.exile || [];
  if (!exile.some((c) => c && c._suspendCounters > 0)) return state;
  let next = state;
  const updated = exile.map((c) => {
    if (!c || !(c._suspendCounters > 0)) return c;
    const left = c._suspendCounters - 1;
    next = logEvent(next, { kind: "suspend-tick", playerId: pid, cardName: c.name, countersLeft: left });
    return left === 0
      ? { ...c, _suspendCounters: 0, _suspendReady: true }
      : { ...c, _suspendCounters: left };
  });
  return { ...next, players: { ...next.players, [pid]: { ...next.players[pid], exile: updated } } };
}

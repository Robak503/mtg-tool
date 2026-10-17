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
 * The sacrifice is the shared one (costSacrifice.sacrificePermanentForCost), never a hand-built move.
 *
 * The "when the last time counter is removed → sacrifice" ability is hard-coded into the upkeep removal
 * (the normal path). A time counter removed by some OTHER effect won't trigger the sacrifice here — a rare
 * edge left as a safe false-negative.
 *
 * Pure: regex + board reads; returns a new state.
 */

import { findPermanent, removeCounter, logEvent } from "./gameState.js";
import { sacrificePermanentForCost } from "./costSacrifice.js"; // THE sacrifice outside a resolution (gameState, layers, triggers only — no cycle)

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
 * Each sacrifice is its own trigger's resolution, so its own event, and it leaves through THE sacrifice sequence
 * (costSacrifice.sacrificePermanentForCost — this one runs inline as the step begins, where no resolution finalizer follows,
 * so it needs the sequence that drains its own leave event): the types it had as it left (CR 603.10a), the death look-back
 * (gameState.deathLookback) for a creature, the death-specific exile as its destination, a creature a replacement kept out of
 * the graveyard never died (CR 700.4 — Rest in Peace, a shuffle-instead), and the sacrifice watchers fire (CR 701.21a).
 * Before 2026-10-17 this built its own death entry without the replacement flags: Blastoderm exiled by Rest in Peace still
 * fired Blood Artist and counted a death, a death-specific exile (an opponent's Misery's Shadow) was not the destination, and
 * Korvold never saw the sacrifice. The permanent is read off the live board at the sacrifice, after a vanishing counter came
 * off (its look-back holds the counters it left with).
 * Pure.
 */
export function applyFadeVanishUpkeep(state) {
  const pid = state.activePlayer;
  const player = state.players?.[pid];
  if (!player) return state;
  let next = state;
  const sacrificed = [];
  // Snapshot the battlefield up front (we mutate `next` while iterating).
  for (const snapshot of [...player.battlefield]) {
    const fv = parseFadingVanishing(snapshot.card);
    if (!fv) continue;
    const lk = findPermanent(next, snapshot.id);
    if (!lk) continue; // already gone
    const count = lk.permanent.counters?.[fv.counterType] || 0;
    const sacrifice = () => {
      sacrificed.push(snapshot.card?.name || "permanent");
      next = sacrificePermanentForCost(next, pid, findPermanent(next, snapshot.id).permanent);
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
  if (sacrificed.length) next = logEvent(next, { kind: "fade-vanish-sacrifice", turn: next.turn, controller: pid, names: sacrificed });
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
//     triggers/watchers fire exactly as a hand cast's would (CR 702.62d — the card IS cast).
//
// TWO DOCUMENTED POINTS, both FN-safe by direction and pinned in suspendNoCost.test.js:
//   - CR 702.62a makes the zero-counter play optional; the engine OFFERS it (an offer can never fire
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
 * The OWNER's upkeep half (CR 702.62a): remove one time counter from each of the active player's
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

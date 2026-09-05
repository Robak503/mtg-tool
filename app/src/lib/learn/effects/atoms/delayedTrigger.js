/**
 * effects/atoms/delayedTrigger.js — DELAYED TRIGGERED ABILITIES (CR 603.7).
 *
 * A resolving spell or ability can CREATE a triggered ability that fires at a future step:
 *   "Draw a card at the beginning of the next turn's upkeep."          (Heal, Bone Harvest — 40 carriers)
 *   "At the beginning of the next end step, sacrifice it."             (the blink/impulse family)
 *   "At the beginning of your next upkeep, pay {3}{U}{U}..."           (the Pact cycle)
 * Census (2026-07-25): 679 real cards carry this shape, 589 of them non-native — the single largest
 * lever in the corpus, and the engine had NO scheduler at all (impulse-exile's end-of-turn lapse is a
 * marker-and-sweep on exiled cards, not a general delayed ability).
 *
 * DESIGN — deliberately reuses the whole existing trigger pipeline instead of a parallel one:
 *   1. `schedule-delayed` (this atom) pushes a plain-JSON record onto `state.delayedTriggers`.
 *   2. gameEngine drains matching records at STEP ENTRY into `pendingTriggers`, shaped exactly like
 *      any printed trigger (makePendingTrigger's fields), so flushTriggers → buildTriggerStack →
 *      the effect-program resolver handle it with ZERO new resolution code — targeting, the
 *      Arbiter fallback for an unmodeled inner clause, and serialization all come free.
 *   3. Draining REMOVES the record: CR 603.7 — a delayed trigger fires once, then ceases to exist.
 *
 * TIMING VOCABULARY (`fireStep` × `fireScope`), matching the printed wordings the corpus actually uses:
 *   fireStep: "upkeep" | "end" | "main" | "cleanup"
 *   fireScope: "any"   — "the NEXT end step" / "the next turn's upkeep": the very next such step in
 *                        the game, whoever's turn it is (CR 603.7b).
 *              "yours" — "YOUR next upkeep": only a step of the ability controller's own turn.
 * Firing at STEP ENTRY makes "next" correct by construction: a record created during a step can only
 * match the FOLLOWING entry into that step, never the one it was created in (the Pact created on your
 * own upkeep correctly waits for your NEXT upkeep).
 *
 * CREED: the atom is emitted ONLY when the inner effect clause itself parses HIGH (the parser gates
 * this — see matchDelayedTrigger), so a scheduled ability can never fire an unmodeled effect. If the
 * inner clause is unreadable the whole card routes to the Arbiter, exactly like any other trigger.
 * Pure — every function returns new state; records are plain JSON so a mid-game save round-trips.
 */

import { logEvent } from "../../gameState.js";

/** Steps a delayed trigger can be scheduled for. Kept in lockstep with gameEngine's drain call sites. */
export const DELAYED_FIRE_STEPS = Object.freeze(["upkeep", "end", "main", "cleanup"]);

/**
 * Schedule a delayed triggered ability (CR 603.7). The inner effect rides as `effectClause` — the
 * SAME field a printed trigger's descriptor carries — so the drain can hand it to the normal flush.
 */
export function applyScheduleDelayed(state, atom, ctx) {
  const controller = ctx.controller;
  if (!state.players?.[controller]) return state; // controller eliminated mid-resolution → clean no-op (CR 800.4a)
  const clause = String(atom.delayedClause || "").trim();
  if (!clause) return state; // nothing to schedule — never a fabricated firing
  const queue = state.delayedTriggers || [];
  const record = {
    id: `dly-${queue.length + 1}-${state.turn || 0}`,
    controller,
    fireStep: atom.fireStep,
    fireScope: atom.fireScope || "any",
    effectClause: clause,
    // Carried so the fired trigger names its real source in the log/UI (the spell that scheduled it).
    sourceName: ctx.cardName || null,
    sourceCardId: ctx.sourceCardId || null,
    sourcePermanentId: ctx.sourceId || null,
    createdTurn: state.turn || 0,
    ...(atom.repeatThisTurn ? { repeatThisTurn: true } : {}), // Full Throttle (KT-7b)
  };
  const next = { ...state, delayedTriggers: [...queue, record] };
  return logEvent(next, {
    kind: "spell-effect",
    effect: "schedule-delayed",
    controller,
    fireStep: record.fireStep,
    fireScope: record.fireScope,
  });
}

/**
 * Drain every delayed trigger whose timing matches this step entry, returning
 * `{ state, fired }` — `fired` is an array of pending-trigger records ready to push onto
 * `state.pendingTriggers` (the caller does the push so this module never imports triggers.js).
 *
 * `step` is the engine's step name; `activePlayer` gates the "yours" scope. Matched records are
 * REMOVED from the queue (CR 603.7 — fires once, then ceases to exist), including when the
 * controller has since been eliminated (the record is dropped, not stranded, and nothing fires).
 */
export function drainDelayedTriggers(state, step, activePlayer) {
  const queue = state.delayedTriggers || [];
  if (queue.length === 0) return { state, fired: [] };
  const keep = [];
  const fired = [];
  for (const rec of queue) {
    const stepMatches = rec.fireStep === step;
    // SHELF-85 V12 — "that turn's end step" (Final Fortune): fires ONLY on a turn advanceStep stamped as the controller's
    // extra turn. The casting turn is never stamped, so the loss cannot land on the turn the spell resolved; an
    // opponent's turn or a normal later turn of the controller never matches either. (Two stacked extra turns: the
    // record fires at the first one — a loss is a loss.)
    const scopeMatches = rec.fireScope === "thatTurn"
      ? (state.extraTurnOf != null && state.extraTurnOf === rec.controller && activePlayer === rec.controller)
      : (rec.fireScope !== "yours" || rec.controller === activePlayer);
    // FULL THROTTLE (POD-SIM THREE · KT-7b, 2026-09-05): a "this turn, each <step>" record fires at EVERY matching step of
    // the turn it was created in (each combat of the turn — the extra combats too) and lapses silently once the turn moves on.
    if (rec.repeatThisTurn && rec.createdTurn !== (state.turn || 0)) continue;
    if (!stepMatches || !scopeMatches) { keep.push(rec); continue; }
    // Matched → it ceases to exist either way; it only FIRES if its controller is still in the game.
    if (!state.players?.[rec.controller]) continue;
    if (rec.repeatThisTurn) keep.push(rec); // … except the repeating kind, which stays for the next matching step this turn
    fired.push({
      event: "delayed",
      source: { permanentId: rec.sourcePermanentId, cardId: rec.sourceCardId, name: rec.sourceName },
      controller: rec.controller,
      descriptor: {
        event: "delayed",
        scope: "you",
        whose: "any",
        effectClause: rec.effectClause,
        optional: false,
        interveningIf: null,
        effectHasX: false,
      },
      context: { sourcePermanentId: rec.sourcePermanentId, delayedTriggerId: rec.id },
      targets: [],
      optional: false,
      payload: {
        resolver: "manual",
        params: { controller: rec.controller, targets: [], context: {}, sourcePermanentId: rec.sourcePermanentId },
      },
    });
  }
  if (fired.length === 0 && keep.length === queue.length) return { state, fired: [] };
  return { state: { ...state, delayedTriggers: keep }, fired };
}

export const delayedTriggerResolvers = Object.freeze({
  "schedule-delayed": applyScheduleDelayed,
});

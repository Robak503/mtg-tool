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

import { logEvent, findPermanent, moveCardToZone } from "../../gameState.js";

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
  // "THAT TURN" IS ONE EXTRA TURN (Final Fortune; Trouble in Pairs, play-weighted #626): the record belongs to the extra turn the
  // same resolution just created — the newest entry on the extra-turn stack (the program's extra-turn atom runs first). Its
  // stack position names that entry until it is taken or skipped: entries are pushed and popped only at the top (CR 500.7), so
  // an entry never moves while it waits. If that turn is skipped (CR 614.10a — anything scheduled for a skipped turn won't
  // happen), gameEngine.advanceStep drops the record through dropSkippedExtraTurnRecords.
  const extraTurns = state.extraTurns || [];
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
    ...(atom.fireScope === "thatTurn" ? { extraTurnIndex: extraTurns.length - 1 } : {}),
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
    // A DIES WATCH (below) is keyed on an event, never a step: it stays while its turn lasts and lapses after (CR 603.7b).
    if (rec.watchDies) { if (rec.createdTurn === (state.turn || 0)) keep.push(rec); continue; }
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
    fired.push(firedFromRecord(rec));
  }
  if (fired.length === 0 && keep.length === queue.length) return { state, fired: [] };
  return { state: { ...state, delayedTriggers: keep }, fired };
}

/**
 * A SKIPPED EXTRA TURN takes its "that turn" records with it (Trouble in Pairs, play-weighted #626 — CR 614.10a: anything
 * scheduled for a skipped turn won't happen; Final Fortune's ruling: "If you end up skipping the extra turn that is gained, you
 * do not lose the game."). `index` is the skipped entry's position on the extra-turn stack — the position applyScheduleDelayed
 * stamped on the records that belong to it. Every other record is kept: one scheduled for "the next" occurrence of a step waits
 * for the first occurrence that isn't skipped (CR 614.10a). Pure.
 */
export function dropSkippedExtraTurnRecords(state, index) {
  return { ...state, delayedTriggers: (state.delayedTriggers || []).filter((rec) => rec.extraTurnIndex !== index) };
}

/** A record that fires becomes a pending trigger shaped exactly like a printed one, so the normal flush resolves it. */
function firedFromRecord(rec) {
  return {
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
  };
}

/**
 * "WHEN THAT CREATURE DIES THIS TURN, <payoff>" (shelf D25 — Together Forever; CR 603.7) — the EVENT-keyed sibling of the
 * step-keyed record above. The resolving spell or ability watches ONE permanent: the creature its previous atom targeted
 * (the referent binding, CR 608.2). If that permanent dies this turn (CR 700.4), the payoff triggers. Keyed on the
 * PERMANENT id, so a creature that left the battlefield before the watch existed can never fire it (CR 603.7a), and one
 * that blinked or was bounced and recast is a new object that never does (CR 400.7). The watch lapses with its turn
 * (its stated duration, CR 603.7b). Its controller is the controller of the spell or ability that made it (CR 603.7d/e).
 *
 * The payoff rides as `effectClause`, exactly like a scheduled ability. "Return that card to its owner's hand" is the one
 * payoff that names the dead creature, so it is baked into a `[died-card-to-hand <cardId>]` sentinel here, while the card
 * is still known.
 */
export function applyWatchDiesThisTurn(state, atom, ctx) {
  const controller = ctx.controller;
  let next = state;
  for (const t of ctx.targets || []) {
    const lk = t?.id ? findPermanent(next, t.id) : null;
    if (!lk) continue; // gone already — it can never die as this object now (CR 603.7a)
    const perm = lk.permanent;
    const clause = atom.payoffKind === "diedCardToHand" ? `[died-card-to-hand ${perm.card?.id}]` : String(atom.delayedClause || "").trim();
    const queue = next.delayedTriggers || [];
    const record = {
      id: `dly-${queue.length + 1}-${next.turn || 0}`,
      controller,
      watchDies: perm.id,
      effectClause: clause,
      sourceName: ctx.cardName || null,
      sourceCardId: ctx.sourceCardId || null,
      sourcePermanentId: ctx.sourceId || null,
      createdTurn: next.turn || 0,
    };
    next = logEvent({ ...next, delayedTriggers: [...queue, record] }, { kind: "spell-effect", effect: "watch-dies-this-turn", controller, watched: perm.id });
  }
  return next;
}

/**
 * A batch of deaths fires the watches on them (called from triggers.checkDiesTriggers — the single death chokepoint — with
 * the entries that really DIED; exiled-instead and shuffled-instead never did, CR 700.4). A matched watch fires once and
 * is removed; a watch from an earlier turn has lapsed and is dropped; one whose controller has left the game is dropped
 * without firing (CR 800.4a). Returns `{ state, fired }` — the caller pushes `fired`, as with the drain above.
 */
export function fireDiesWatches(state, dead) {
  const queue = state.delayedTriggers || [];
  if (!dead?.length || !queue.some((r) => r.watchDies)) return { state, fired: [] };
  const died = new Set(dead.map((d) => d?.id).filter(Boolean));
  const keep = [];
  const fired = [];
  for (const rec of queue) {
    if (!rec.watchDies) { keep.push(rec); continue; }
    if (rec.createdTurn !== (state.turn || 0)) continue;
    if (!died.has(rec.watchDies)) { keep.push(rec); continue; }
    if (!state.players?.[rec.controller]) continue;
    fired.push(firedFromRecord(rec));
  }
  if (fired.length === 0 && keep.length === queue.length) return { state, fired: [] };
  return { state: { ...state, delayedTriggers: keep }, fired };
}

/** The sentinel's parser — case-preserving on the card id, like the blink-return sentinel's. */
export function diedCardToHandClauseParser(clause) {
  const m = String(clause || "").trim().match(/^\[died-card-to-hand (\S+)\]$/i);
  return m ? { op: "died-card-to-hand", cardId: m[1] } : null;
}

/**
 * "Return that card to its owner's hand": the dead creature's card, found in the graveyard it went to (CR 400.7e — a
 * zone-change trigger finds the new object in a public zone). That graveyard is its owner's (CR 404.1), so the owner's
 * hand is the same player's. No longer there (exiled, already returned) → nothing (CR 603.7c). A token is never there to
 * find: moveCardToZone drops a token as it leaves the battlefield (CR 111.7), so it never comes back (CR 111.8).
 */
export function applyDiedCardToHand(state, atom, ctx) {
  for (const pid of Object.keys(state.players || {})) {
    const card = (state.players[pid].graveyard || []).find((c) => c.id === atom.cardId);
    if (!card) continue;
    const next = moveCardToZone(state, { playerId: pid, fromZone: "graveyard", toZone: "hand", cardId: atom.cardId });
    return logEvent(next, { kind: "spell-effect", effect: "died-card-to-hand", returned: card.name || null, controller: ctx.controller });
  }
  return logEvent(state, { kind: "spell-effect", effect: "died-card-to-hand", returned: null, controller: ctx.controller });
}

/**
 * "Choose target creature …" — the choice is the whole effect: it names the object a following referent ("that creature")
 * acts on. The parser admits it only directly before a referent atom (parser.chooseTargetBoundOk).
 */
export function applyChooseTarget(state, atom, ctx) {
  return logEvent(state, { kind: "spell-effect", effect: "choose-target", controller: ctx.controller, targets: (ctx.targets || []).map((t) => t.id) });
}

export const delayedTriggerResolvers = Object.freeze({
  "schedule-delayed": applyScheduleDelayed,
  "watch-dies-this-turn": applyWatchDiesThisTurn, // shelf D25 — the event-keyed watch
  "died-card-to-hand": applyDiedCardToHand,       // its "return that card to its owner's hand" sentinel
  "choose-target": applyChooseTarget,             // "Choose target creature …" — the antecedent the watch binds to
});

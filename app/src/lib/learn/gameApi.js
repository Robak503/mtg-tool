/**
 * gameApi.js — THE stable play-API for pilot decision-modules.
 * ============================================================================
 *
 * This is the ONE seam Omnath's pilots plug into to play a game. A pilot's
 * decision function has the locked shape:
 *
 *     decide({ state, legalActions, seat, pilot }) -> action
 *
 * and the self-play LOOP drives the game like this:
 *
 *     let s = createLearnSession({ ... }).state;          // build a game
 *     while (!gameStatus(s).over) {
 *       const seat = s.priorityHolder ?? s.activePlayer;  // whose turn to act
 *       const actions = legalActions(s, seat);            // the moves to choose among
 *       const action  = pilot.decide({ state: observe(s, seat), legalActions: actions, seat, pilot });
 *       s = applyAction(s, action);                       // commit the chosen move
 *     }
 *     const { result, winnerSeat } = gameStatus(s);
 *
 * CONTRACT (what callers may and may not do):
 *   - Pilots READ the game ONLY through `observe(state, seat)` and the
 *     `legalActions(state, seat)` array. They act ONLY by returning one of those
 *     actions, which the loop commits via `applyAction(state, action)`.
 *   - Pilots MUST NOT reach into the engine, mutate state, or fabricate actions.
 *     `applyAction` validates that the action is currently legal and rejects
 *     anything else — a learned/garbage pilot cannot inject an illegal move.
 *   - The LOOP (not this module) owns: turn-cap / stalemate handling, recording
 *     decisions for training, and the decisive objective (who is the "learner").
 *
 * DESIGN RULES (CREED):
 *   - Every export here is a PURE wrapper over an already-verified engine
 *     function. This module changes NO engine or AI logic — it only re-shapes
 *     the existing surface into the stable pilot contract. No state mutation.
 *   - `legalActions`  wraps  legalActionsForPlayer  (legalChoices.js)
 *   - `applyAction`   wraps  dispatchAction         (actionDispatcher.js)
 *   - `gameStatus`    derives from isPlayerDead / hasWonGame (learnSession.js) —
 *                     the SAME SBA rules the session driver uses, so the verdict
 *                     can't drift from the live game.
 *   - `observe`       returns the full state today (v1); see its doc for the
 *                     planned hidden-information harden.
 *
 * Pure functions, no side effects, safe to call repeatedly on the same state.
 */

import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction, DispatcherError } from "./actionDispatcher.js";
import { isPlayerDead, hasWonGame } from "./learnSession.js";

/**
 * The legal actions seat `seat` may take in `state` right now — the set of
 * moves a pilot chooses among. Returns an array (possibly empty: the seat has
 * nothing legal but to let the game proceed; in the driver an empty list
 * auto-passes). Pure wrapper over legalActionsForPlayer.
 *
 * Throws if `seat` is not a player in the state (a programming error in the
 * loop, not a pilot choice) — surfaced, never swallowed.
 *
 * @param {object} state  a learn-engine game state
 * @param {string} seat   the seat id to enumerate moves for (e.g. "user", "ai")
 * @returns {Array<object>} legal action objects, each with a `kind` + `playerId`
 */
export function legalActions(state, seat) {
  return legalActionsForPlayer(state, seat);
}

/**
 * Whether `action` is among the actions currently legal for its own seat —
 * the security gate for `applyAction`. Actions carry no stable unique id, so we
 * match by deep structural equality against the live legal set. Pure.
 *
 * @param {object} state   the current game state
 * @param {object} action  a proposed action (must carry `playerId`)
 * @returns {boolean} true iff an identical action is legal right now
 */
export function isLegalAction(state, action) {
  if (!action || typeof action !== "object" || typeof action.playerId !== "string") {
    return false;
  }
  let legal;
  try {
    legal = legalActionsForPlayer(state, action.playerId);
  } catch {
    // Unknown seat ⇒ no legal actions ⇒ not legal. (legalActionsForPlayer throws
    // on an invalid seat; here that simply means "reject", not a crash.)
    return false;
  }
  return legal.some((candidate) => actionsEqual(candidate, action));
}

/**
 * Apply `action` to `state`, returning the NEW state (the engine is immutable —
 * the input state is never mutated). Pure wrapper over dispatchAction, with a
 * legality gate in front: a pilot or learned model could feed garbage, so an
 * action that is NOT in the current legal set is rejected — `applyAction` returns
 * the state UNCHANGED rather than fabricating an effect. This is the security
 * boundary of the play-API: no illegal move can ever mutate the game.
 *
 * A legal action that the dispatcher nonetheless rejects (a DispatcherError —
 * e.g. a mid-resolution invariant the legal-set didn't capture) is also surfaced
 * as an unchanged state, never a silent partial apply. Any non-dispatcher error
 * is a real bug and is rethrown.
 *
 * @param {object} state   the current game state
 * @param {object} action  the action to apply (must be currently legal)
 * @returns {object} the state after the action (or the same state if rejected)
 */
export function applyAction(state, action) {
  if (!isLegalAction(state, action)) {
    return state; // illegal / garbage action — no-op, never a fabricated effect
  }
  try {
    return dispatchAction(state, action);
  } catch (err) {
    if (err instanceof DispatcherError) {
      // Legal per the action set but rejected by the dispatcher's own guards —
      // leave the game untouched (the loop can pick another action) rather than
      // half-applying. Surfaced as a no-op, not a swallowed crash.
      return state;
    }
    throw err; // a genuine bug — do not hide it
  }
}

/**
 * The current game outcome, derived from the SAME state-based win/loss rules the
 * session driver uses (isPlayerDead / hasWonGame in learnSession.js), so this
 * verdict can never drift from the live game. Pure.
 *
 * Returns:
 *   {
 *     over:       boolean,                                      // is the game finished?
 *     result:     "user-wins" | "ai-wins" | "draw" | null,     // from the learner's seat
 *     winnerSeat: string | null,                               // the actual winning seat
 *     reason:     string | null,                               // one-line why
 *   }
 *
 * Conventions (matching recordOutcomeIfChanged):
 *   - Seat "user" is the learner's seat. `result` is reported from that seat:
 *     "user-wins" (the learner won), "ai-wins" (the learner lost), "draw".
 *   - `winnerSeat` is the literal seat that won (e.g. "user", "ai", "ai-2"), or
 *     null on a draw / not-over — so a seat-agnostic pilot can read the raw
 *     winner without the learner-relative label.
 *   - A player who WON (CR 104.2a, a "you win the game" effect / wonGame flag) is
 *     checked BEFORE the death checks: you can win even while at lethal.
 *   - Simultaneous death of the learner AND every remaining opponent in one SBA
 *     check is a DRAW (CR 104.4a), not a loss.
 *
 * NOTE on "timeout": a turn-cap / stalemate verdict is owned by the self-play
 * LOOP (the stalemate fix), NOT by gameStatus. gameStatus reports only the REAL
 * game state; a generous turn cap is the loop's concern, so "timeout" is not one
 * of the results returned here.
 *
 * @param {object} state  a learn-engine game state
 * @returns {{over: boolean, result: string|null, winnerSeat: string|null, reason: string|null}}
 */
export function gameStatus(state) {
  const players = state?.players || {};
  const order = state?.turnOrder || Object.keys(players);
  const seats = order.filter((id) => players[id] !== undefined || id === "user");
  const opponents = order.filter((id) => id !== "user");

  // 1) WIN flags first (CR 104.2a) — a win ends the game before the death checks.
  if (hasWonGame(state, "user")) {
    return done("user-wins", "user", "you win the game (CR 104.2a)");
  }
  const wonOpponent = opponents.find((id) => hasWonGame(state, id));
  if (wonOpponent) {
    return done("ai-wins", wonOpponent, `${wonOpponent} wins the game (CR 104.2a)`);
  }

  // 2) Death checks (CR 104.3a / 704.5a life≤0, 704.5c poison, 704.6c cmd dmg).
  const userDead = isPlayerDead(state, "user");
  const liveOpponents = opponents.filter((id) => !isPlayerDead(state, id));
  const deadOpponents = opponents.filter((id) => isPlayerDead(state, id));
  const allOpponentsDead = opponents.length > 0 && deadOpponents.length === opponents.length;

  // Simultaneous death of the learner and every remaining opponent ⇒ draw (CR 104.4a).
  if (userDead && allOpponentsDead) {
    return done("draw", null, "all remaining players died simultaneously (CR 104.4a)");
  }
  if (userDead) {
    return done("ai-wins", liveOpponents[0] ?? null, "you lost (CR 704.5)");
  }
  if (allOpponentsDead) {
    return done("user-wins", "user", "all opponents lost (CR 704.5)");
  }

  // Game still going (a multiplayer game may have lost SOME opponents but others
  // remain — not over; the driver drops the dead seats and plays on).
  return { over: false, result: null, winnerSeat: null, reason: null };

  function done(result, winnerSeat, reason) {
    void seats; // reserved for richer multi-seat reporting; not load-bearing yet
    return { over: true, result, winnerSeat, reason };
  }
}

/**
 * The view of the game a pilot sees from `seat`.
 *
 * v1: returns the FULL state (perfect information). This is intentional and
 * documented: the engine state is the single source of truth the pilots train
 * against today, and self-play with full information is the v1 data engine.
 *
 * TODO (Tweak 4 — hidden-information harden, NOT built here): a future
 * seat-scoped observation will redact what `seat` shouldn't see — other seats'
 * hands and libraries (and any face-down information) — so a learned pilot can't
 * cheat by reading hidden zones. This is the planned seam; the signature already
 * takes `seat` so flipping to a scoped view is a non-breaking change for callers.
 * Do NOT add the hiding now — the loop and pilots are written against full state.
 *
 * @param {object} state  the current game state
 * @param {string} seat   the observing seat (currently unused; see TODO above)
 * @returns {object} the game state visible to `seat` (today: the full state)
 */
export function observe(state, seat) {
  void seat; // v1: perfect information; seat reserved for the Tweak-4 scoped view
  return state;
}

// ─── internals ───────────────────────────────────────────────────────────────

/**
 * Deep structural equality for two action objects. Actions are small, JSON-ish
 * plain objects (no functions, no cycles) — `kind` + scalar payload fields, with
 * occasional small arrays (e.g. `targets`) and nested plain objects (e.g. a
 * parsed `cost`). A canonical-key JSON compare is exact and order-insensitive
 * for object keys, which is what we need to match a proposed action against the
 * engine's freshly-built legal action. Pure.
 */
function actionsEqual(a, b) {
  if (a === b) return true;
  if (a == null || b == null) return false;
  return stableStringify(a) === stableStringify(b);
}

/** JSON.stringify with object keys sorted recursively, so key order never
 *  affects equality. Arrays keep their order (action arrays are positional). */
function stableStringify(value) {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  const keys = Object.keys(value).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(",")}}`;
}

export const _internals = { actionsEqual, stableStringify };

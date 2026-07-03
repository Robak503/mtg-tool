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
import {
  isPlayerDead,
  hasWonGame,
  createLearnSession,
  advanceUntilDecision,
  applyChoice,
  applyPendingChoice,
  continueFromArbiter,
} from "./learnSession.js";
import { PENDING_CHOICE_KINDS } from "./pendingChoice.js";

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

// ─── v1 SESSION API (the FULL play seam — settles pending choices) ──────────────
//
// The pure v0 functions above (legalActions/applyAction/gameStatus/observe) cannot settle
// state.pendingChoice / state.pendingArbiter — a raw applyAction loop WEDGES the moment a
// tutor/scry/optional pauses resolution (the parked WAKE-REPORT seam). The v1 session API is
// the real end-to-end seam: it wraps the SAME learnSession driver the Academy and the
// self-play runner use, so an external pilot can drive a complete game — priority windows,
// mulligans, every pendingChoice kind, arbiter acknowledgements — with nothing else imported.
//
// THE DRIVE LOOP (the locked Omnath contract, PLAY-API-CONTRACT.md):
//
//     let { session, decision } = nextDecision(createGame({ userDeck, opponentDecks, mode: "commander" }));
//     while (decision.kind !== "game-over") {
//       const answer = pilotAnswer(decision);            // ∈ decision.options
//       ({ session, decision } = act(session, decision, answer));
//     }
//     const verdict = gameStatus(session.state);
//
// DECISION VOCABULARY (decision.kind):
//   "ask"                    — a priority window: choose one of decision.options (answer = the action).
//   one of PENDING_CHOICE_KINDS — a resolution-time choice; answer shape per kind (echo answer.kind —
//                              the wire validates it; see applyPendingChoice).
//   "unresolved"             — an Arbiter ruling to acknowledge (answer ignored).
//   "game-over"              — terminal; session.status holds the verdict.
//   "dispatch-error" / "engine-stuck" — surfaced honestly, never swallowed; the session is unchanged
//                              (pick a different answer) or honestly stuck (stop).
//
// VERSIONING: PLAY_API_VERSION is semver. The exported names + decision vocabulary + answer shapes
// are the contract surface — breaking any of them bumps the MAJOR and is announced on memory/COMMS.md
// before release. Additive fields are MINOR and safe to ignore.

// 1.1.0 (additive MINOR — PLAY-API-CONTRACT change discipline):
//   - act(session, decision, answer, opts = {}) grew the optional trailing opts bag; the
//     settlers thread it through every internal re-advance, so a caller-driven game stays
//     instrumented (decide/recordDecision/timePressure/onTurnStart) past the first act().
//   - createGame now HONORS the contract-documented `pilots` option (previously silently
//     dropped): pilots are routed via session.playOpts.decide + a mulligan config.
//   - Instrumented advances stamp `state.observedTurn` (additive state field, save-schema v5)
//     so re-entrant advances never re-fire the turn-boundary clock/observer.
// 1.2.0 (additive MINOR — SD-5/PS-4, the session-layer A/B seam):
//   - createGame gained the optional `policy` option (null | "v1" | per-subsystem map — see
//     opponentAI.normalizePolicy). It rides session.playOpts.policy, is merged into every
//     nextDecision/act advance (explicit opts.policy wins), and reaches pickAction/
//     pickAttackPlan/pickBlockPlan for every AI-auto-picked decision — so pilots can run
//     old-vs-new policy probes through the contract seam. It only ever re-ranks actions
//     already offered by legalChoices — NEVER a legality gate (THE CREED). Default null ⇒
//     byte-identical play.
export const PLAY_API_VERSION = "1.2.0";

/**
 * Build a fresh game session. Thin, versioned wrapper over createLearnSession — see its JSDoc for
 * the full option set. The load-bearing options for a pilot driver:
 *   { userDeck, opponentDeck | opponentDecks[3], mode: "standard"|"commander", difficulty: "expert",
 *     userCommanders/opponentCommanders, seed, pilots: { [seat]: { decide, decideMulligan?, ... } } }
 * difficulty "expert" makes AI seats self-decide inside nextDecision; pass pilots to route every
 * seat's decisions through your own decide instead (the selfPlayRunner adapter).
 *
 * `pilots` (contract §1.1/§1.3) is consumed HERE, not by createLearnSession: each seat's
 * decide is wrapped in a per-seat router stored as `session.playOpts.decide`, which
 * nextDecision/act merge into the driver opts on every advance (an explicit opts.decide
 * from the caller wins — lab.mjs-style drivers are unaffected). When any pilots[seat] has a
 * decideMulligan, a mulligan config (same construction as the selfPlayRunner adapter) is
 * built and passed to createLearnSession — unless the caller supplied `mulligan` themselves
 * (explicit caller mulligan wins). Malformed pilots THROW loudly (never silently dropped —
 * a contract-faithful consumer must never get default-AI play while believing pilots drive).
 * No pilots ⇒ no playOpts key ⇒ byte-identical to a bare createLearnSession.
 * NOTE: a pilots session holds live closures (playOpts) — it is driver-memory-only and is
 * honestly rejected by the save layer's isSerializable guard; the HTTP path never has one.
 *
 * `policy` (contract §1.1, v1.2.0 — SD-5/PS-4) is the opponentAI A/B knob (null | "v1" |
 * a per-subsystem map; see opponentAI.normalizePolicy). It rides session.playOpts.policy
 * and is merged into every nextDecision/act advance exactly like the pilots router, so
 * a whole game plays under the requested policy with no per-call plumbing. Single knob,
 * whole game (per-seat policy is explicitly out of v1.x scope). Default null ⇒ no
 * playOpts.policy key ⇒ byte-identical.
 */
export function createGame(options) {
  const { pilots = null, policy = null, ...engineOpts } = options ?? {};
  if (pilots == null && policy == null) return createLearnSession(engineOpts);
  const { decide, mulliganConfig } = pilots == null
    ? { decide: null, mulliganConfig: null }
    : buildPilotRouter(pilots);
  if (mulliganConfig && engineOpts.mulligan == null) {
    engineOpts.mulligan = mulliganConfig;
  }
  const session = createLearnSession(engineOpts);
  const playOpts = {};
  if (decide) playOpts.decide = decide; // identity-only pilots (no decide anywhere) — nothing to route
  if (policy != null) playOpts.policy = policy;
  if (Object.keys(playOpts).length === 0) return session;
  return { ...session, playOpts };
}

/**
 * Advance the game to the NEXT decision point (or game over): runs SBAs, eliminations, AI-seat
 * turns, trigger flushes, and pending-* settlement exactly like the Academy driver, then returns
 * { session, decision }. Options pass through to advanceUntilDecision (decide/pilot/recordDecision/
 * timePressure — the self-play instrumentation seam).
 */
export function nextDecision(session, options = {}) {
  return advanceUntilDecision(session, mergePlayOpts(session, options));
}

/**
 * Answer the current decision and advance to the next one. Routes by decision.kind:
 * "ask" → the priority-action path (validated against the live legal set — an out-of-set answer
 * returns a "dispatch-error" decision and an UNCHANGED session, never a fabricated move);
 * a PENDING_CHOICE_KINDS member → the kind-echo-validated settler; "unresolved" → the Arbiter
 * acknowledgement. Terminal/no-op kinds return the session unchanged with the same decision.
 * Always returns { session, decision } — the same shape as nextDecision.
 *
 * `opts` (v1.1.0, additive) is the instrumentation bag nextDecision already takes
 * ({ decide, pilot, recordDecision, timePressure, onTurnStart, archetype }); it is threaded
 * through the settlers into every internal re-advance, so the engine-auto segments BETWEEN
 * caller decisions stay routed/recorded/clocked. Omitted ⇒ {} ⇒ byte-identical to v1.0.0
 * (the HTTP/human path). session.playOpts (the createGame pilots router) is merged in with
 * explicit opts winning per-field.
 */
export function act(session, decision, answer, opts = {}) {
  const kind = decision?.kind;
  const merged = mergePlayOpts(session, opts);
  if (kind === "ask") return applyChoice(session, answer, merged);
  if (kind === "unresolved") return continueFromArbiter(session, merged);
  if (PENDING_CHOICE_KINDS.includes(kind)) return applyPendingChoice(session, answer, merged);
  if (kind === "game-over" || kind === "dispatch-error" || kind === "engine-stuck") {
    return { session, decision };
  }
  // An unknown kind is a contract break — surface it honestly (mirrors the driver's failsafe).
  return { session, decision: { kind: "dispatch-error", reason: `act(): unknown decision kind "${kind}"`, code: "UNKNOWN_DECISION_KIND" } };
}

// ─── internals ───────────────────────────────────────────────────────────────

/**
 * Merge the session-level pilots router (session.playOpts, set by createGame's `pilots`
 * option) into a caller's per-call opts bag. Explicit opts win per-field, so a driver
 * that routes decisions itself (lab.mjs's nextDecision-opts style) is unaffected; a
 * contract-faithful createGame({ pilots }) consumer gets its router on EVERY advance —
 * nextDecision and act alike — with no per-call plumbing. No playOpts ⇒ the caller's
 * opts pass through untouched (byte-identical default path).
 */
function mergePlayOpts(session, opts) {
  const po = session?.playOpts;
  if (!po) return opts;
  const merged = { ...opts };
  if (merged.decide === undefined && typeof po.decide === "function") {
    merged.decide = po.decide;
  }
  // The createGame `policy` knob (v1.2.0) — same explicit-wins semantics as decide.
  if (merged.policy === undefined && po.policy != null) {
    merged.policy = po.policy;
  }
  return merged;
}

/**
 * Validate + compile a contract §1.3 `pilots` map into the driver's single-decide seam.
 * Same construction as the selfPlayRunner adapter (its per-seat router + identity map +
 * mulligan config) — duplicated here deliberately rather than importing the runner
 * (selfPlayRunner imports gameApi; the reverse import would be a cycle) and kept
 * byte-equivalent so both paths route identically.
 *
 * THROWS on a malformed map (non-object pilots, a non-object seat entry, a present-but-
 * non-function decide/decideMulligan): the contract documents `pilots` as load-bearing,
 * so silently dropping a broken one would mislabel default-AI play as pilot-driven —
 * the self-play data-trust poison case. A seat entry with NEITHER decide nor
 * decideMulligan is legal (identity-only, plays the default AI — the runner allows it).
 *
 * Returns { decide, mulliganConfig } (either may be null when no seat opted in).
 */
function buildPilotRouter(pilots) {
  if (typeof pilots !== "object" || pilots === null || Array.isArray(pilots)) {
    throw new Error("createGame: pilots must be a { [seat]: { decide, decideMulligan?, playbook?, temperament? } } map");
  }
  for (const [seat, p] of Object.entries(pilots)) {
    if (!p || typeof p !== "object" || Array.isArray(p)) {
      throw new Error(`createGame: pilots["${seat}"] must be an object ({ decide, decideMulligan?, ... })`);
    }
    if (p.decide !== undefined && typeof p.decide !== "function") {
      throw new Error(`createGame: pilots["${seat}"].decide must be a function (got ${typeof p.decide})`);
    }
    if (p.decideMulligan !== undefined && typeof p.decideMulligan !== "function") {
      throw new Error(`createGame: pilots["${seat}"].decideMulligan must be a function (got ${typeof p.decideMulligan})`);
    }
  }

  // Per-seat pilot identity ({playbook,temperament} | null) — passed to decide and stamped
  // on recorded rows, exactly like the selfPlayRunner's pilotIdentity.
  const pilotIdentity = (seat) => {
    const p = pilots?.[seat];
    return p ? { playbook: p.playbook ?? null, temperament: p.temperament ?? null } : null;
  };

  // The in-game router: advanceUntilDecision takes ONE decide; route it to the acting
  // seat's pilot. A seat with no pilot decide returns undefined ⇒ the driver falls back
  // to the default autopilot pick (byte-identical for that seat).
  const hasAnyPilot = Object.values(pilots).some((p) => typeof p?.decide === "function");
  const decide = hasAnyPilot
    ? ({ state, legalActions, seat }) => {
        const p = pilots?.[seat];
        if (typeof p?.decide !== "function") return undefined;
        return p.decide({ state, legalActions, seat, pilot: pilotIdentity(seat) });
      }
    : null;

  // Pre-game London mulligan (CR 103.5), built iff ANY seat has a decideMulligan — the
  // selfPlayRunner's exact construction (a seat without one keeps its dealt 7).
  const hasAnyMulliganPilot = Object.values(pilots).some((p) => typeof p?.decideMulligan === "function");
  const mulliganConfig = hasAnyMulliganPilot
    ? {
        decide: ({ state, legalActions, seat, pilot }) => {
          const p = pilots?.[seat];
          if (typeof p?.decideMulligan !== "function") return { kind: "mulligan-keep" }; // no mull pilot → keep the 7
          return p.decideMulligan({ state, legalActions, seat, pilot });
        },
        pilots: Object.fromEntries(Object.keys(pilots).map((seat) => [seat, pilotIdentity(seat)])),
      }
    : null;

  return { decide, mulliganConfig };
}

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

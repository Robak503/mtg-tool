/**
 * Tests for gameApi.js — THE stable play-API seam pilots plug into.
 *
 * Verifies the wrappers stay faithful to the engine they wrap:
 *   - legalActions returns exactly what the engine considers legal for a seat
 *   - applyAction advances the state for a legal action AND rejects (no-ops) an
 *     illegal / garbage one without fabricating an effect
 *   - gameStatus reports over/winner/draw for terminal states and not-over mid-game,
 *     derived from the same SBA rules the session driver uses
 *   - observe returns the (full, v1) state for a seat
 *   - a mini end-to-end loop drives a real 2-deck game several steps via the API
 */

import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests } from "./gameState.js";
import { createLearnSession, advanceUntilDecision } from "./learnSession.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import {
  legalActions,
  applyAction,
  isLegalAction,
  gameStatus,
  observe,
  _internals,
} from "./gameApi.js";

// ─── deck fixtures (mirror learnSession.test.js) ───────────────────────────────

function basicForest(i) {
  return {
    id: `forest-${i}`,
    name: "Forest",
    type: "Basic Land — Forest",
    oracle: "{T}: Add {G}.",
    mana: "",
  };
}

function bear(i) {
  return {
    id: `bear-${i}`,
    name: "Grizzly Bears",
    type: "Creature — Bear",
    oracle: "",
    mana: "{1}{G}",
    cmc: 2,
    keywords: [],
    power: 2,
    toughness: 2,
  };
}

function makeDeck(prefix) {
  const cards = [];
  for (let i = 0; i < 18; i++) cards.push(basicForest(`${prefix}-${i}`));
  for (let i = 0; i < 12; i++) cards.push(bear(`${prefix}-${i}`));
  return cards;
}

function freshSession() {
  return createLearnSession({
    userDeck: makeDeck("u"),
    opponentDeck: makeDeck("a"),
    difficulty: "beginner",
  });
}

function freshState() {
  return freshSession().state;
}

/**
 * Advance a fresh game to the first point a PLAYER must choose (the engine
 * fast-forwards untap/upkeep/draw/stack-resolution itself — those aren't pilot
 * actions). Returns { state, seat, options } at that decision. This mirrors how
 * the real self-play loop reaches an actionable priority window before calling
 * the pilot. We bail (return null) if the game ends or no "ask" decision arises
 * within the cap — the API tests that need an actionable state assert on a found
 * decision, not on a fresh (pre-priority) state.
 */
function advanceToDecision(session) {
  let current = session;
  for (let i = 0; i < 50; i++) {
    const { session: next, decision } = advanceUntilDecision(current);
    current = next;
    if (decision.kind === "game-over") return null;
    if (decision.kind === "ask") {
      // At an "ask" the engine has set priorityHolder to the deciding seat, and
      // decision.options is exactly legalActionsForPlayer(state, that seat).
      const seat = current.state.priorityHolder ?? current.state.activePlayer;
      return { state: current.state, seat, options: decision.options, session: current };
    }
    // A non-"ask" decision (e.g. an unresolved/tutor pause we don't exercise
    // here) — nudge past it is out of scope; just stop.
    return null;
  }
  return null;
}

beforeEach(() => {
  _resetIdsForTests();
});

// ─── legalActions ──────────────────────────────────────────────────────────────

describe("legalActions", () => {
  it("returns exactly the actions the engine considers legal for a seat", () => {
    const dp = advanceToDecision(freshSession());
    expect(dp).toBeTruthy(); // a real decision point was reached

    const viaApi = legalActions(dp.state, dp.seat);
    const viaEngine = legalActionsForPlayer(dp.state, dp.seat);

    // Same set, same shapes — the wrapper adds nothing and drops nothing.
    expect(viaApi).toEqual(viaEngine);
    // …and exactly what the engine surfaces to a pilot at this decision (the
    // driver's decision.options IS legalActionsForPlayer at the priority window).
    expect(viaApi).toEqual(dp.options);
    expect(Array.isArray(viaApi)).toBe(true);
    expect(viaApi.length).toBeGreaterThan(0);
    // Every action carries the seat's playerId + a kind (the contract pilots read).
    for (const action of viaApi) {
      expect(action.playerId).toBe(dp.seat);
      expect(typeof action.kind).toBe("string");
    }
  });

  it("propagates the engine's error for an unknown seat (loop bug, not a pilot choice)", () => {
    const state = freshState();
    expect(() => legalActions(state, "no-such-seat")).toThrow();
  });
});

// ─── isLegalAction / applyAction ───────────────────────────────────────────────

describe("applyAction", () => {
  it("advances the state when given a legal action", () => {
    const dp = advanceToDecision(freshSession());
    expect(dp).toBeTruthy();
    // Take a non-pass action if one exists (it visibly changes state); otherwise
    // pass-priority, which still produces a new state object.
    const action = dp.options.find((a) => a.kind !== "pass-priority") ?? dp.options[0];

    const next = applyAction(dp.state, action);
    expect(next).toBeTruthy();
    // Pure: the input state object is not mutated (new object returned).
    expect(next).not.toBe(dp.state);
  });

  it("does not mutate the input state (immutability)", () => {
    const dp = advanceToDecision(freshSession());
    expect(dp).toBeTruthy();
    const before = JSON.stringify(dp.state);
    const action = dp.options.find((a) => a.kind !== "pass-priority") ?? dp.options[0];

    applyAction(dp.state, action);
    expect(JSON.stringify(dp.state)).toBe(before);
  });

  it("rejects an illegal action as a no-op (same state, no fabricated effect)", () => {
    const dp = advanceToDecision(freshSession());
    expect(dp).toBeTruthy();
    const bogus = { kind: "play-land", playerId: dp.seat, cardId: "does-not-exist", name: "Phantom" };

    expect(isLegalAction(dp.state, bogus)).toBe(false);
    const next = applyAction(dp.state, bogus);
    expect(next).toBe(dp.state); // exact same object — untouched
  });

  it("rejects garbage / malformed actions without throwing", () => {
    const state = freshState();
    expect(applyAction(state, null)).toBe(state);
    expect(applyAction(state, {})).toBe(state);
    expect(applyAction(state, { kind: "totally-made-up", playerId: "user" })).toBe(state);
    expect(applyAction(state, { kind: "pass-priority" })).toBe(state); // missing playerId
  });

  it("rejects an action attributed to the wrong seat", () => {
    const dp = advanceToDecision(freshSession());
    expect(dp).toBeTruthy();
    const other = dp.seat === "user" ? "ai" : "user";
    // Re-attribute a legal action to a seat that doesn't hold priority — must reject.
    const stolen = { ...dp.options[0], playerId: other };
    expect(isLegalAction(dp.state, stolen)).toBe(false);
    expect(applyAction(dp.state, stolen)).toBe(dp.state);
  });
});

// ─── gameStatus ────────────────────────────────────────────────────────────────

describe("gameStatus", () => {
  it("reports not-over for a fresh mid-game state", () => {
    const status = gameStatus(freshState());
    expect(status).toEqual({ over: false, result: null, winnerSeat: null, reason: null });
  });

  it("reports a user loss when the user is dead (life ≤ 0)", () => {
    const state = freshState();
    state.players.user.life = 0;
    const status = gameStatus(state);
    expect(status.over).toBe(true);
    expect(status.result).toBe("ai-wins");
    expect(status.winnerSeat).toBe("ai");
    expect(status.reason).toMatch(/lost/i);
  });

  it("reports a user win when every opponent is dead", () => {
    const state = freshState();
    state.players.ai.life = -3;
    const status = gameStatus(state);
    expect(status.over).toBe(true);
    expect(status.result).toBe("user-wins");
    expect(status.winnerSeat).toBe("user");
  });

  it("reports a win-flag (CR 104.2a) before any death check", () => {
    const state = freshState();
    state.players.user.life = 0;      // also at lethal…
    state.players.user.wonGame = true; // …but the win flag is checked first
    const status = gameStatus(state);
    expect(status.over).toBe(true);
    expect(status.result).toBe("user-wins");
    expect(status.winnerSeat).toBe("user");
    expect(status.reason).toMatch(/win/i);
  });

  it("reports a draw on simultaneous death of user and the lone opponent (CR 104.4a)", () => {
    const state = freshState();
    state.players.user.life = 0;
    state.players.ai.life = 0;
    const status = gameStatus(state);
    expect(status.over).toBe(true);
    expect(status.result).toBe("draw");
    expect(status.winnerSeat).toBe(null);
  });

  it("reports a user loss via 21 commander damage (CR 704.6c)", () => {
    const state = freshState();
    state.players.user.commanderDamageFrom = { "some-cmdr": 21 };
    const status = gameStatus(state);
    expect(status.over).toBe(true);
    expect(status.result).toBe("ai-wins");
  });
});

// ─── observe ─────────────────────────────────────────────────────────────────

describe("observe", () => {
  it("returns the full state for a seat (v1 perfect information)", () => {
    const state = freshState();
    expect(observe(state, "user")).toBe(state);
    expect(observe(state, "ai")).toBe(state);
  });
});

// ─── internals: deep action equality ───────────────────────────────────────────

describe("action equality", () => {
  it("matches identical actions regardless of key order", () => {
    const a = { kind: "play-land", playerId: "user", cardId: "x", name: "Forest" };
    const b = { name: "Forest", cardId: "x", playerId: "user", kind: "play-land" };
    expect(_internals.actionsEqual(a, b)).toBe(true);
  });

  it("distinguishes actions differing in any field", () => {
    const a = { kind: "play-land", playerId: "user", cardId: "x" };
    expect(_internals.actionsEqual(a, { ...a, cardId: "y" })).toBe(false);
    expect(_internals.actionsEqual(a, { ...a, playerId: "ai" })).toBe(false);
  });

  it("handles nested objects and arrays (e.g. targets / cost)", () => {
    const a = { kind: "cast-spell", playerId: "user", cost: { generic: 1, G: 1 }, targets: ["t1"] };
    const b = { kind: "cast-spell", playerId: "user", targets: ["t1"], cost: { G: 1, generic: 1 } };
    expect(_internals.actionsEqual(a, b)).toBe(true);
    expect(_internals.actionsEqual(a, { ...a, targets: ["t2"] })).toBe(false);
  });
});

// ─── mini end-to-end: drive a real game via the API ────────────────────────────

describe("end-to-end pilot loop", () => {
  it("drives a real 2-deck game several steps purely through the API", () => {
    // The real self-play loop: the engine fast-forwards to each player decision
    // (advanceUntilDecision — untap/upkeep/draw/stack-resolution aren't pilot
    // moves), then the PILOT reads the game via observe + legalActions and acts
    // via applyAction. We interleave the two here to prove gameApi can drive a
    // real game end-to-end.
    let session = freshSession();
    let decisions = 0;
    const maxDecisions = 30; // local test cap (the real loop owns turn-capping)

    while (decisions < maxDecisions) {
      const { session: next, decision } = advanceUntilDecision(session);
      session = next;
      if (decision.kind === "game-over") break;
      if (decision.kind !== "ask") break; // out-of-scope pause (tutor/unresolved)

      const state = session.state;
      // gameStatus agrees with the engine that the game is still going here.
      expect(gameStatus(state).over).toBe(false);

      const seat = state.priorityHolder ?? state.activePlayer;

      // --- pilot acts ONLY through the play-API ---
      const view = observe(state, seat);
      const actions = legalActions(view, seat);
      expect(actions).toEqual(decision.options); // the API sees what the loop offers
      // A trivial pilot: develop the board if possible (play a land / cast), else pass.
      const pass = actions.find((a) => a.kind === "pass-priority");
      const dev = actions.find((a) => a.kind === "play-land" || a.kind === "cast-spell" || a.kind === "tap-for-mana");
      const choice = dev ?? pass ?? actions[0];
      const after = applyAction(state, choice);
      // The chosen action is legal, so it must produce a new state (never a no-op).
      expect(after).not.toBe(state);

      // Feed the post-action state back into the session for the next advance.
      session = { ...session, state: after };
      decisions += 1;
    }

    // We made real progress through the API without throwing.
    expect(decisions).toBeGreaterThan(0);
    // gameStatus is callable on the final state and returns the documented shape.
    const status = gameStatus(session.state);
    expect(status).toHaveProperty("over");
    expect(status).toHaveProperty("result");
    expect(status).toHaveProperty("winnerSeat");
    expect(status).toHaveProperty("reason");
  });
});

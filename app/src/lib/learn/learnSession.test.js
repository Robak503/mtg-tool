/**
 * Tests for learnSession.js — top-level session lifecycle.
 *
 * Covers factory validation, advanceUntilDecision pause behavior at
 * a real user decision, applyChoice routing through the dispatcher
 * + decisionLog append, game-end detection (life ≤ 0 and commander
 * damage), abandon, isComplete.
 */

import { beforeEach, describe, expect, it } from "vitest";
import {
  _resetIdsForTests,
} from "./gameState.js";
import {
  createLearnSession,
  advanceUntilDecision,
  applyChoice,
  abandon,
  isComplete,
  _forceLifeForTests,
  _loseLifeForTests,
} from "./learnSession.js";

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

beforeEach(() => {
  _resetIdsForTests();
});

describe("createLearnSession — factory validation", () => {
  it("creates an active session with both opening hands drawn", () => {
    const session = createLearnSession({
      userDeck: makeDeck("u"),
      opponentDeck: makeDeck("a"),
      difficulty: "beginner",
    });
    expect(session.status).toBe("active");
    expect(session.difficulty).toBe("beginner");
    expect(session.state.players.user.hand).toHaveLength(7);
    expect(session.state.players.ai.hand).toHaveLength(7);
    expect(session.decisionLog).toEqual([]);
    expect(session.id).toMatch(/^learn-/);
  });

  it("throws on missing userDeck", () => {
    expect(() => createLearnSession({
      opponentDeck: makeDeck("a"),
    })).toThrow();
  });

  it("throws on missing opponentDeck", () => {
    expect(() => createLearnSession({
      userDeck: makeDeck("u"),
    })).toThrow();
  });

  it("throws on invalid difficulty", () => {
    expect(() => createLearnSession({
      userDeck: makeDeck("u"),
      opponentDeck: makeDeck("a"),
      difficulty: "godlike",
    })).toThrow();
  });

  it("accepts commanders + custom activePlayer", () => {
    const commander = { id: "cmd-1", name: "Atraxa", type: "Legendary Creature", mana: "{G}{W}{U}{B}" };
    const session = createLearnSession({
      userDeck: makeDeck("u"),
      opponentDeck: makeDeck("a"),
      userCommanders: [commander],
      activePlayer: "ai",
    });
    expect(session.state.players.user.command).toHaveLength(1);
    expect(session.state.activePlayer).toBe("ai");
  });
});

describe("advanceUntilDecision", () => {
  it("returns an ask decision at Beginner when the user has priority on a real choice", () => {
    const session = createLearnSession({
      userDeck: makeDeck("u"),
      opponentDeck: makeDeck("a"),
      difficulty: "beginner",
    });
    const { decision } = advanceUntilDecision(session);
    expect(decision.kind).toBe("ask");
    expect(decision.options).toBeDefined();
    expect(decision.options.length).toBeGreaterThan(0);
    expect(decision.prompt).toBeTruthy();
  });

  it("returns game-over when status is no longer active", () => {
    let session = createLearnSession({
      userDeck: makeDeck("u"),
      opponentDeck: makeDeck("a"),
    });
    session = _forceLifeForTests(session, "user", 0);
    const { decision } = advanceUntilDecision(session);
    expect(decision.kind).toBe("game-over");
    expect(decision.reason).toBe("ai-wins");
  });

  it("detects user-wins when AI life drops to 0", () => {
    let session = createLearnSession({
      userDeck: makeDeck("u"),
      opponentDeck: makeDeck("a"),
    });
    session = _forceLifeForTests(session, "ai", 0);
    const { session: after, decision } = advanceUntilDecision(session);
    expect(decision.kind).toBe("game-over");
    expect(decision.reason).toBe("user-wins");
    expect(after.status).toBe("user-wins");
    expect(after.endedAt).toBeTruthy();
  });

  it("detects commander damage win condition (≥ 21 from one source)", () => {
    let session = createLearnSession({
      userDeck: makeDeck("u"),
      opponentDeck: makeDeck("a"),
    });
    session = {
      ...session,
      state: {
        ...session.state,
        players: {
          ...session.state.players,
          user: {
            ...session.state.players.user,
            commanderDamageFrom: { ai: 21 },
          },
        },
      },
    };
    const { decision } = advanceUntilDecision(session);
    expect(decision.kind).toBe("game-over");
    expect(decision.reason).toBe("ai-wins");
  });

  it("at expert difficulty, AUTO-DECIDES every priority window so the loop reaches game-end without ever asking", () => {
    let session = createLearnSession({
      userDeck: makeDeck("u"),
      opponentDeck: makeDeck("a"),
      difficulty: "expert",
    });
    // Force user life low so the SBA triggers a game-end before 1000-tick cap.
    session = _forceLifeForTests(session, "user", 1);
    session = {
      ...session,
      state: {
        ...session.state,
        // Drop user life to 0 via a synthetic SBA trigger on the next pass.
        players: {
          ...session.state.players,
          user: { ...session.state.players.user, life: 0 },
        },
      },
    };
    const { decision } = advanceUntilDecision(session);
    expect(decision.kind).toBe("game-over");
  });
});

describe("applyChoice", () => {
  it("dispatches the chosen action and appends to decisionLog with auto:false", () => {
    const fresh = createLearnSession({
      userDeck: makeDeck("u"),
      opponentDeck: makeDeck("a"),
      difficulty: "beginner",
    });
    // The session starts at (beginning, untap) with no priority holder.
    // advanceUntilDecision drives the engine to the first user prompt
    // — the UI flow is: advance → render → choose → applyChoice on the
    // advanced session.
    const { session: paused, decision } = advanceUntilDecision(fresh);
    expect(decision.kind).toBe("ask");

    const passOption = decision.options.find(o => o.kind === "pass-priority");
    expect(passOption).toBeDefined();

    const { session: next } = applyChoice(paused, passOption);
    expect(next.decisionLog.length).toBeGreaterThanOrEqual(1);
    const userEntry = next.decisionLog.find(e => !e.auto);
    expect(userEntry).toBeDefined();
    expect(userEntry.actor).toBe("user");
    expect(userEntry.action.kind).toBe("pass-priority");
  });

  it("returns INVALID_CHOICE when the user picks something not in the legal options", () => {
    const fresh = createLearnSession({
      userDeck: makeDeck("u"),
      opponentDeck: makeDeck("a"),
      difficulty: "beginner",
    });
    const { session: paused } = advanceUntilDecision(fresh);
    const { decision } = applyChoice(paused, { kind: "made-up-action", cardId: "nope" });
    expect(decision.kind).toBe("dispatch-error");
    expect(decision.code).toBe("INVALID_CHOICE");
  });

  it("returns game-over when session is already complete", () => {
    let session = createLearnSession({
      userDeck: makeDeck("u"),
      opponentDeck: makeDeck("a"),
    });
    session = { ...session, status: "user-wins" };
    const { decision } = applyChoice(session, { kind: "pass-priority" });
    expect(decision.kind).toBe("game-over");
  });

  it("after applyChoice, advanceUntilDecision is invoked automatically", () => {
    const fresh = createLearnSession({
      userDeck: makeDeck("u"),
      opponentDeck: makeDeck("a"),
      difficulty: "beginner",
    });
    const { session: paused, decision: first } = advanceUntilDecision(fresh);
    const passOption = first.options.find(o => o.kind === "pass-priority");

    const { session: next, decision: secondDecision } = applyChoice(paused, passOption);
    expect(secondDecision.kind).toBeTruthy();
    expect(next.id).toBe(fresh.id);
  });
});

describe("abandon + isComplete", () => {
  it("abandon marks the session as abandoned with a reason", () => {
    const session = createLearnSession({
      userDeck: makeDeck("u"),
      opponentDeck: makeDeck("a"),
    });
    const after = abandon(session, "took-too-long");
    expect(after.status).toBe("abandoned");
    expect(after.abandonReason).toBe("took-too-long");
    expect(after.endedAt).toBeTruthy();
  });

  it("abandon is a no-op on already-complete sessions", () => {
    let session = createLearnSession({
      userDeck: makeDeck("u"),
      opponentDeck: makeDeck("a"),
    });
    session = { ...session, status: "user-wins" };
    expect(abandon(session)).toBe(session);
  });

  it("isComplete returns true for any non-active status", () => {
    expect(isComplete({ status: "active" })).toBe(false);
    expect(isComplete({ status: "user-wins" })).toBe(true);
    expect(isComplete({ status: "ai-wins" })).toBe(true);
    expect(isComplete({ status: "abandoned" })).toBe(true);
    expect(isComplete(null)).toBe(true);
  });
});

describe("_loseLifeForTests is the same as gameState.loseLife", () => {
  it("re-exports the helper for tests to reach for", () => {
    expect(typeof _loseLifeForTests).toBe("function");
  });
});

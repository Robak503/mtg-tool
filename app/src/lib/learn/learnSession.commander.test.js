/**
 * Phase 6 PR 9 — Commander (4P FFA) session lifecycle.
 *
 * Standard 1v1 lifecycle is covered in learnSession.test.js. This file
 * proves the four-player path: session construction with a 3-deck pod,
 * opening hands for every seat, AI seats auto-deciding regardless of the
 * user's difficulty, and the multiplayer win/loss + elimination rules.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests } from "./gameState.js";
import { makeDecision } from "./decisionGate.js";
import {
  createLearnSession,
  advanceUntilDecision,
  _forceLifeForTests,
} from "./learnSession.js";

function basicForest(i) {
  return { id: `forest-${i}`, name: "Forest", type: "Basic Land — Forest", oracle: "{T}: Add {G}.", mana: "" };
}
function bear(i) {
  return { id: `bear-${i}`, name: "Grizzly Bears", type: "Creature — Bear", oracle: "", mana: "{1}{G}", cmc: 2, keywords: [], power: 2, toughness: 2 };
}
function makeDeck(prefix) {
  const cards = [];
  for (let i = 0; i < 18; i++) cards.push(basicForest(`${prefix}-${i}`));
  for (let i = 0; i < 12; i++) cards.push(bear(`${prefix}-${i}`));
  return cards;
}
function pod() {
  return [makeDeck("o1"), makeDeck("o2"), makeDeck("o3")];
}

beforeEach(() => {
  _resetIdsForTests();
});

describe("createLearnSession — commander construction", () => {
  it("seats four players, deals 7 to each, stores mode", () => {
    const session = createLearnSession({
      userDeck: makeDeck("u"),
      opponentDecks: pod(),
      mode: "commander",
      difficulty: "beginner",
    });
    expect(session.status).toBe("active");
    expect(session.mode).toBe("commander");
    expect(session.state.turnOrder).toEqual(["user", "ai1", "ai2", "ai3"]);
    for (const seat of ["user", "ai1", "ai2", "ai3"]) {
      expect(session.state.players[seat].hand).toHaveLength(7);
    }
  });

  it("throws unless the pod is exactly 3 decks", () => {
    expect(() =>
      createLearnSession({ userDeck: makeDeck("u"), opponentDecks: [makeDeck("o1")], mode: "commander" }),
    ).toThrow(/exactly 3 decks/);
    expect(() =>
      createLearnSession({ userDeck: makeDeck("u"), mode: "commander" }),
    ).toThrow(/exactly 3 decks/);
  });

  it("throws if any pod deck is empty", () => {
    expect(() =>
      createLearnSession({ userDeck: makeDeck("u"), opponentDecks: [makeDeck("o1"), [], makeDeck("o3")], mode: "commander" }),
    ).toThrow(/opponentDecks\[1\]/);
  });
});

describe("AI seats auto-decide at any difficulty", () => {
  // The decisionGate must treat ai1/ai2/ai3 as AI-controlled, not fall
  // through to the user-ask branches. Guards the "playerId !== user" fix.
  it("makeDecision for an ai2 seat auto-decides even at beginner", () => {
    const state = { players: { user: { hand: [] }, ai2: { hand: [] } } };
    const actions = [
      { kind: "pass-priority" },
      { kind: "play-land", cardId: "forest-x", name: "Forest" },
    ];
    const decision = makeDecision(state, "ai2", actions, { difficulty: "beginner" });
    expect(decision.kind).toBe("auto-decided");
    expect(decision.metadata.reasoning).toBe("ai-player");
  });
});

describe("commander win / loss / elimination", () => {
  function freshCommander(difficulty = "beginner") {
    return createLearnSession({ userDeck: makeDeck("u"), opponentDecks: pod(), mode: "commander", difficulty });
  }

  it("user death → ai-wins", () => {
    let session = freshCommander();
    session = _forceLifeForTests(session, "user", 0);
    const { decision } = advanceUntilDecision(session);
    expect(decision.kind).toBe("game-over");
    expect(decision.reason).toBe("ai-wins");
  });

  it("all three opponents dead → user-wins", () => {
    let session = freshCommander();
    session = _forceLifeForTests(session, "ai1", 0);
    session = _forceLifeForTests(session, "ai2", 0);
    session = _forceLifeForTests(session, "ai3", -3);
    const { session: after, decision } = advanceUntilDecision(session);
    expect(decision.kind).toBe("game-over");
    expect(decision.reason).toBe("user-wins");
    expect(after.status).toBe("user-wins");
    expect(after.endedAt).toBeTruthy();
  });

  it("a single dead opponent is removed and the game continues", () => {
    let session = freshCommander();
    session = _forceLifeForTests(session, "ai2", 0);
    const { session: after, decision } = advanceUntilDecision(session);

    // Still playing: ai1 + ai3 remain.
    expect(after.status).toBe("active");
    expect(decision.kind).toBe("ask");
    expect(after.state.players.ai2).toBeUndefined();
    expect(after.state.turnOrder).toEqual(["user", "ai1", "ai3"]);
    // The elimination was logged.
    expect(after.state.log.some(e => e.kind === "player-eliminated" && e.player === "ai2")).toBe(true);
  });

  it("commander damage of 21 to the user → ai-wins", () => {
    let session = freshCommander();
    session = {
      ...session,
      state: {
        ...session.state,
        players: {
          ...session.state.players,
          user: { ...session.state.players.user, commanderDamageFrom: { ai3: 21 } },
        },
      },
    };
    const { decision } = advanceUntilDecision(session);
    expect(decision.kind).toBe("game-over");
    expect(decision.reason).toBe("ai-wins");
  });

  it("two opponents falling at once both get removed, last one stands", () => {
    let session = freshCommander();
    session = _forceLifeForTests(session, "ai1", 0);
    session = _forceLifeForTests(session, "ai3", 0);
    const { session: after, decision } = advanceUntilDecision(session);
    expect(after.status).toBe("active");
    expect(decision.kind).toBe("ask");
    expect(after.state.turnOrder).toEqual(["user", "ai2"]);
    expect(after.state.players.ai1).toBeUndefined();
    expect(after.state.players.ai3).toBeUndefined();
  });

  it("eliminating the ACTIVE player ends their turn cleanly, not mid-step", () => {
    let session = freshCommander();
    // Make it ai2's turn, then kill ai2 on its own turn (the edge the
    // review flagged: the active seat being the one eliminated).
    session = { ...session, state: { ...session.state, activePlayer: "ai2" } };
    session = _forceLifeForTests(session, "ai2", 0);
    const { session: after, decision } = advanceUntilDecision(session);

    // The engine must not get stuck or corrupt — it reaches a real user
    // decision with ai2 gone and the turn moved off the dead seat.
    expect(after.status).toBe("active");
    expect(decision.kind).toBe("ask");
    expect(after.state.players.ai2).toBeUndefined();
    expect(after.state.turnOrder).toEqual(["user", "ai1", "ai3"]);
    expect(after.state.activePlayer).not.toBe("ai2");
    expect(after.state.turn).toBeGreaterThan(1); // ai2's turn ended
  });
});

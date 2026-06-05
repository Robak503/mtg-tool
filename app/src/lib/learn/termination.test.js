/**
 * PR 10.4 tests — termination + loop safety.
 *
 * Games end naturally (win/loss/elimination); mutual lethal is a draw, not a
 * user loss; a game that goes too long ends as a turn-limit draw with
 * diagnostics rather than the scary "engine stuck"; and an Expert full game
 * runs to completion in a single advanceUntilDecision call.
 */

import { describe, expect, it, beforeEach, vi } from "vitest";
import { _resetIdsForTests } from "./gameState.js";
import {
  createLearnSession,
  advanceUntilDecision,
  _forceLifeForTests,
} from "./learnSession.js";

beforeEach(() => _resetIdsForTests());

function forest(i) {
  return { id: `f-${i}`, name: "Forest", type: "Basic Land — Forest", oracle: "{T}: Add {G}.", mana: "" };
}
function bear(i) {
  return { id: `b-${i}`, name: "Grizzly Bears", type: "Creature — Bear", oracle: "", mana: "{1}{G}", cmc: 2, keywords: [], power: 2, toughness: 2 };
}
function aggroDeck(prefix) {
  const cards = [];
  for (let i = 0; i < 25; i++) cards.push(forest(`${prefix}-${i}`));
  for (let i = 0; i < 25; i++) cards.push(bear(`${prefix}-${i}`));
  return cards;
}

describe("simultaneous death", () => {
  it("user and all opponents dying together is a draw, not a loss", () => {
    let sess = createLearnSession({ userDeck: aggroDeck("u"), opponentDeck: aggroDeck("a"), difficulty: "expert" });
    sess = _forceLifeForTests(sess, "user", 0);
    sess = _forceLifeForTests(sess, "ai", 0);
    const { session: out, decision } = advanceUntilDecision(sess);
    expect(out.status).toBe("draw");
    expect(decision.kind).toBe("game-over");
  });

  it("only the user dying is still a loss", () => {
    let sess = createLearnSession({ userDeck: aggroDeck("u"), opponentDeck: aggroDeck("a"), difficulty: "expert" });
    sess = _forceLifeForTests(sess, "user", 0);
    const { session: out } = advanceUntilDecision(sess);
    expect(out.status).toBe("ai-wins");
  });
});

describe("turn-limit stalemate", () => {
  it("ends as a draw with a turn-limit reason past the ceiling", () => {
    let sess = createLearnSession({ userDeck: aggroDeck("u"), opponentDeck: aggroDeck("a"), difficulty: "expert" });
    sess = { ...sess, state: { ...sess.state, turn: 101 } };
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { session: out, decision } = advanceUntilDecision(sess);
    warn.mockRestore();
    expect(out.status).toBe("draw");
    expect(decision.kind).toBe("game-over");
    expect(decision.reason).toBe("turn-limit");
    expect(decision.diagnostic?.turn).toBe(101);
  });
});

describe("expert full game", () => {
  it("autopilots a whole game to a definite end in one call (no engine-stuck)", () => {
    const sess = createLearnSession({ userDeck: aggroDeck("u"), opponentDeck: aggroDeck("a"), difficulty: "expert" });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { session: out, decision } = advanceUntilDecision(sess);
    warn.mockRestore();
    expect(decision.kind).toBe("game-over");
    expect(["user-wins", "ai-wins", "draw"]).toContain(out.status);
  });
});

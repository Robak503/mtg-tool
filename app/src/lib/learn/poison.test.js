/**
 * poison.test.js — KW-POISON foundation (CR 704.5c / 122): the poison-counter track + the
 * ten-poison loss SBA. The infect/wither/toxic COMBAT integration (damage → −1/−1 counters / poison
 * instead of life) lands on top of this foundation; here we pin the track + the loss rule.
 */
import { describe, it, expect } from "vitest";
import { createGameState, addPoison } from "./gameState.js";
import { createLearnSession, advanceUntilDecision } from "./learnSession.js";

describe("KW-POISON — poison-counter track + loss SBA", () => {
  it("addPoison accumulates poison counters on a player", () => {
    let s = createGameState({ userDeck: [], aiDeck: [] });
    expect(s.players.user.poison).toBe(0);
    s = addPoison(s, { playerId: "user", amount: 4 });
    s = addPoison(s, { playerId: "user", amount: 3 });
    expect(s.players.user.poison).toBe(7);
  });

  it("rejects a negative amount", () => {
    const s = createGameState({ userDeck: [], aiDeck: [] });
    expect(() => addPoison(s, { playerId: "user", amount: -1 })).toThrow();
  });

  it("ten or more poison counters loses the game (CR 704.5c)", () => {
    const deck = Array.from({ length: 10 }, (_, i) => ({ id: `f${i}`, name: "Forest", type: "Basic Land — Forest" }));
    const session = createLearnSession({ userDeck: deck, opponentDeck: deck, difficulty: "expert" });
    // The opponent reaches 10 poison → it loses → the user wins.
    const poisoned = {
      ...session,
      state: { ...session.state, players: { ...session.state.players, ai: { ...session.state.players.ai, poison: 10 } } },
    };
    const { session: out, decision } = advanceUntilDecision(poisoned);
    expect(decision.kind).toBe("game-over");
    expect(out.status).toBe("user-wins");
  });

  it("nine poison counters does NOT lose (the threshold is exactly ten)", () => {
    const deck = Array.from({ length: 10 }, (_, i) => ({ id: `f${i}`, name: "Forest", type: "Basic Land — Forest" }));
    const session = createLearnSession({ userDeck: deck, opponentDeck: deck, difficulty: "expert" });
    const poisoned = {
      ...session,
      state: { ...session.state, players: { ...session.state.players, ai: { ...session.state.players.ai, poison: 9 } } },
    };
    const { session: out } = advanceUntilDecision(poisoned);
    expect(out.status).not.toBe("user-wins"); // 9 < 10 → game continues (or ends some other way, just not by poison)
  });
});

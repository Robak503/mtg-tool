import { describe, it, expect } from "vitest";

import { buildBoardContext } from "./boardContext.js";

describe("buildBoardContext", () => {
  it("returns '' for an empty state", () => {
    expect(buildBoardContext(null)).toBe("");
    expect(buildBoardContext({})).toBe("");
  });

  it("renders turn/step, every seat, and the user's hand + board", () => {
    const state = {
      turn: 4,
      phase: "combat",
      step: "declare-attackers",
      activePlayer: "user",
      turnOrder: ["user", "ai1", "ai2", "ai3"],
      players: {
        user: {
          life: 38, hand: [{ name: "Sol Ring" }, { name: "Counterspell" }], graveyard: [],
          battlefield: [
            { card: { name: "Llanowar Elves", power: 1, toughness: 1 }, tapped: true },
            { card: { name: "Forest" } },
          ],
        },
        ai1: { life: 40, hand: [{}, {}], battlefield: [], graveyard: [], commanderDamageFrom: {} },
        ai2: { life: 21, hand: [], battlefield: [{}], graveyard: [], commanderDamageFrom: { user: 7 } },
        ai3: { life: 12, hand: [], battlefield: [], graveyard: [], commanderDamageFrom: {} },
      },
    };
    const ctx = buildBoardContext(state);
    expect(ctx).toMatch(/turn 4, combat \/ declare-attackers, You's turn/);
    expect(ctx).toMatch(/You \(active\): 38 life, 2 in hand, 2 on board/);
    expect(ctx).toMatch(/AI 2: 21 life.*commander damage from You 7/);
    expect(ctx).toMatch(/Your hand \(2\): Sol Ring, Counterspell/);
    expect(ctx).toMatch(/Your board: Llanowar Elves 1\/1 \(tapped\), Forest/);
  });
});

/**
 * Tests for arbiterSeam.js — the P2.1 wire-layer enrichment of an `unresolved`
 * decision (question + board context for the Ollama-only Arbiter).
 */

import { describe, expect, it } from "vitest";
import { createGameState } from "./gameState.js";
import { composeArbiterQuestion, enrichUnresolvedDecision } from "./arbiterSeam.js";

function deck(n, p = "C") {
  return Array.from({ length: n }, (_, i) => ({ id: `card-${p}-${i}`, name: `${p}${i}` }));
}

describe("composeArbiterQuestion", () => {
  it("names the card, quotes its oracle, and attributes the caster", () => {
    const q = composeArbiterQuestion({ cardName: "Mystic Confluence", oracle: "Choose three —", controller: "user" });
    expect(q).toContain("Mystic Confluence");
    expect(q).toContain("Choose three —");
    expect(q).toMatch(/^You cast/);
  });

  it("attributes an opponent's spell and tolerates a missing oracle", () => {
    const q = composeArbiterQuestion({ cardName: "Cyclonic Rift", controller: "ai" });
    expect(q).toMatch(/^An opponent cast/);
    expect(q).toContain("Cyclonic Rift");
    expect(q).not.toContain('reads: ""');
  });
});

describe("enrichUnresolvedDecision", () => {
  it("attaches a question + board context to an unresolved decision", () => {
    const state = createGameState({ userDeck: deck(5, "U"), aiDeck: deck(5, "A") });
    const decision = {
      kind: "unresolved",
      cardName: "Mystic Confluence",
      oracle: "Choose three —",
      controller: "user",
      stackObjectId: "stk-1",
    };
    const enriched = enrichUnresolvedDecision(decision, state);
    expect(enriched.question).toContain("Mystic Confluence");
    expect(enriched.context).toContain("CURRENT GAME");
    // Original fields preserved.
    expect(enriched.cardName).toBe("Mystic Confluence");
    expect(enriched.kind).toBe("unresolved");
  });

  it("is a no-op for non-unresolved decisions (routes can wrap unconditionally)", () => {
    const ask = { kind: "ask", options: [] };
    expect(enrichUnresolvedDecision(ask, {})).toBe(ask);
    expect(enrichUnresolvedDecision(null, {})).toBe(null);
    const over = { kind: "game-over", reason: "user-wins" };
    expect(enrichUnresolvedDecision(over, {})).toBe(over);
  });
});

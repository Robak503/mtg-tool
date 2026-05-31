import { describe, expect, it } from "vitest";

import { defaultDeckMemory, normalizeDeck } from "./deckMemory";

describe("deckMemory — snapshots field", () => {
  it("defaultDeckMemory includes an empty snapshots array", () => {
    expect(defaultDeckMemory().snapshots).toEqual([]);
  });

  it("normalizeDeck preserves a snapshots array", () => {
    const snap = {
      id: "s1",
      date: "2026-05-30",
      snapshot: { commander: "Atraxa", mainCount: 99, tokenCount: 0, cardNames: ["1 Sol Ring"] },
    };
    const deck = normalizeDeck({ id: "d", name: "D", cards: [], memory: { snapshots: [snap] } });
    expect(deck.memory.snapshots).toHaveLength(1);
    expect(deck.memory.snapshots[0].id).toBe("s1");
    expect(deck.memory.snapshots[0].snapshot.cardNames).toEqual(["1 Sol Ring"]);
  });

  it("normalizeDeck defaults snapshots to [] when memory omits it", () => {
    const deck = normalizeDeck({ id: "d", name: "D", cards: [] });
    expect(deck.memory.snapshots).toEqual([]);
  });

  it("normalizeDeck coerces a non-array snapshots value to []", () => {
    const deck = normalizeDeck({ id: "d", name: "D", cards: [], memory: { snapshots: "oops" } });
    expect(deck.memory.snapshots).toEqual([]);
  });
});

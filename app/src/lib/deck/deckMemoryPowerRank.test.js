// Wave Q2 — the machine power rating reaches agent prompts via
// serializeDeckMemory, distinct from Colton's free-text powerLevel line.
import { describe, expect, it } from "vitest";

import { serializeDeckMemory } from "./deckMemory.js";

const deck = (memory) => ({ id: "d1", name: "Test Deck", cards: [], memory });

describe("serializeDeckMemory powerRank line", () => {
  it("emits the machine rating with bracket, label, and date", () => {
    const out = serializeDeckMemory(deck({
      powerLevel: "7ish, casual",
      powerRank: { powerLevel: 6.8, bracket: 3, bracketLabel: "Upgraded", ratedAt: "2026-07-04T10:00:00.000Z" },
    }));
    expect(out).toContain("Power Level: 7ish, casual");
    expect(out).toContain("Machine Power Rating: 6.8/10 — Bracket 3 (Upgraded), rated 2026-07-04");
  });

  it("omits the machine line when powerRank is absent (legacy decks)", () => {
    const out = serializeDeckMemory(deck({ powerLevel: "7" }));
    expect(out).toContain("Power Level: 7");
    expect(out).not.toContain("Machine Power Rating");
  });

  it("survives a partial powerRank (no label, no date)", () => {
    const out = serializeDeckMemory(deck({ powerRank: { powerLevel: 5.2, bracket: 2 } }));
    expect(out).toContain("Machine Power Rating: 5.2/10 — Bracket 2");
    expect(out).not.toContain("rated");
  });
});

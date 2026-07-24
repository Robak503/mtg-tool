import { describe, it, expect } from "vitest";

import { normalizeMoxfieldDeck, normalizeArchidektDeck } from "./deckUrlFetch.js";

// Fixtures trimmed from real API responses (Moxfield v3, Archidekt v1).
const MOX_FIXTURE = {
  name: "Test Moxfield Deck",
  format: "commander",
  boards: {
    commanders: { count: 1, cards: { a: { quantity: 1, card: { name: "Krenko, Mob Boss", scryfall_id: "abc", set: "OGW", cn: "107" } } } },
    mainboard: {
      count: 2,
      cards: {
        b: { quantity: 1, card: { name: "Sol Ring", scryfall_id: "def", set: "SOC", cn: "128" } },
        c: { quantity: 4, card: { name: "Mountain", scryfall_id: "ghi", set: "M21", cn: "275" } },
      },
    },
    sideboard: { count: 1, cards: { d: { quantity: 1, card: { name: "Pyroblast", scryfall_id: "jkl", set: "ICE", cn: "213" } } } },
    maybeboard: { count: 1, cards: { e: { quantity: 1, card: { name: "Goblin Bombardment", scryfall_id: "mno" } } } },
  },
};

// Deck-level categories[] shape trimmed from a REAL Archidekt response (Zaxara, id 19510972,
// fetched live 2026-07-23) — the shape the maybeboard-fix regression test below depends on.
// includedInDeck:false is the actual signal; category NAME is not reliably "Maybeboard" (a
// deck's default "Tokens & Extras" bucket is excluded too, and any custom board name could be).
const ARCH_FIXTURE = {
  name: "Test Archidekt Deck",
  deckFormat: 3,
  categories: [
    { name: "Tokens & Extras", includedInDeck: false },
    { name: "Maybeboard", includedInDeck: false },
    { name: "Ramp", includedInDeck: true },
    { name: "Sideboard", includedInDeck: true },
    { name: "Commander", includedInDeck: true },
  ],
  cards: [
    { quantity: 1, categories: ["Commander"], card: { uid: "u1", collectorNumber: "1", edition: { editioncode: "CMM" }, oracleCard: { name: "Grismold, the Dreadsower" } } },
    { quantity: 1, categories: ["Ramp"], card: { uid: "u2", collectorNumber: "128", edition: { editioncode: "SOC" }, oracleCard: { name: "Sol Ring" } } },
    { quantity: 1, categories: ["Maybeboard"], card: { uid: "u3", oracleCard: { name: "Lightning Greaves" } } },
    { quantity: 1, categories: ["Sideboard"], card: { uid: "u4", oracleCard: { name: "Negate" } } },
    // The bug this fixture now catches: a card tagged with BOTH a real type AND an excluded
    // bucket (Archidekt keeps the type tag even inside Tokens & Extras) must still be excluded —
    // "placement beats type". Before the fix this card had no "Maybeboard" tag, so it silently
    // counted as a real deck card.
    { quantity: 1, categories: ["Creature", "Tokens & Extras"], card: { uid: "u5", oracleCard: { name: "Zaxara Playtest Token" } } },
  ],
};

describe("normalizeMoxfieldDeck", () => {
  it("flattens boards into sectioned cards", () => {
    const out = normalizeMoxfieldDeck(MOX_FIXTURE);
    expect(out.name).toBe("Test Moxfield Deck");
    expect(out.format).toBe("commander");
    expect(out.source).toBe("moxfield");
    const byName = Object.fromEntries(out.cards.map(c => [c.name, c]));
    expect(byName["Krenko, Mob Boss"].section).toBe("Commander");
    expect(byName["Sol Ring"]).toMatchObject({ qty: 1, section: "Mainboard", scryfallId: "def", set: "soc", collectorNumber: "128" });
    expect(byName["Mountain"].qty).toBe(4);
    expect(byName["Pyroblast"].section).toBe("Sideboard");
  });

  it("excludes the maybeboard", () => {
    const out = normalizeMoxfieldDeck(MOX_FIXTURE);
    expect(out.cards.find(c => c.name === "Goblin Bombardment")).toBeUndefined();
  });
});

describe("normalizeArchidektDeck", () => {
  it("maps categories to sections and reads set/collector", () => {
    const out = normalizeArchidektDeck(ARCH_FIXTURE);
    expect(out.name).toBe("Test Archidekt Deck");
    expect(out.format).toBe("commander");
    expect(out.source).toBe("archidekt");
    const byName = Object.fromEntries(out.cards.map(c => [c.name, c]));
    expect(byName["Grismold, the Dreadsower"].section).toBe("Commander");
    expect(byName["Sol Ring"]).toMatchObject({ qty: 1, section: "Mainboard", scryfallId: "u2", set: "soc", collectorNumber: "128" });
    expect(byName["Negate"].section).toBe("Sideboard");
  });

  it("excludes maybeboard cards", () => {
    const out = normalizeArchidektDeck(ARCH_FIXTURE);
    expect(out.cards.find(c => c.name === "Lightning Greaves")).toBeUndefined();
  });

  it("excludes a card in any deck-level includedInDeck:false bucket, not just literal Maybeboard (the Zaxara regression)", () => {
    const out = normalizeArchidektDeck(ARCH_FIXTURE);
    expect(out.cards.find(c => c.name === "Zaxara Playtest Token")).toBeUndefined();
    // The real type tag riding alongside the excluded bucket must not rescue it into the mainboard.
    expect(out.cards.map(c => c.name)).not.toContain("Zaxara Playtest Token");
  });

  it("keeps a card whose category has NO deck-level categories[] entry at all (defensive: don't over-exclude on a malformed/partial response)", () => {
    const out = normalizeArchidektDeck({
      ...ARCH_FIXTURE,
      categories: undefined,
      cards: [{ quantity: 1, categories: ["Ramp"], card: { uid: "u9", oracleCard: { name: "Rampant Growth" } } }],
    });
    expect(out.cards.find(c => c.name === "Rampant Growth")).toBeDefined();
  });

  it("handles an empty / malformed deck without throwing", () => {
    expect(normalizeArchidektDeck({}).cards).toEqual([]);
    expect(normalizeMoxfieldDeck({}).cards).toEqual([]);
  });
});

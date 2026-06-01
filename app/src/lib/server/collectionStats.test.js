/**
 * collectionStats — composition breakdowns (Vault #10).
 * Pure functions, synthetic data, injected metadata.
 */

import { describe, expect, it } from "vitest";
import { primaryType, colorBucket, computeCollectionBreakdowns } from "./collectionStats.js";

describe("primaryType", () => {
  it("picks the headline type with creature > artifact precedence", () => {
    expect(primaryType("Artifact Creature — Golem")).toBe("Creature");
    expect(primaryType("Legendary Land")).toBe("Land");
    expect(primaryType("Enchantment Artifact")).toBe("Enchantment");
    expect(primaryType("Instant")).toBe("Instant");
    expect(primaryType("Legendary Planeswalker — Teferi")).toBe("Planeswalker");
    expect(primaryType("Sorcery // Land")).toBe("Sorcery"); // front face
    expect(primaryType("")).toBe("Other");
    expect(primaryType(null)).toBe("Other");
  });
});

describe("colorBucket", () => {
  it("buckets mono / colorless / multicolor", () => {
    expect(colorBucket(["U"])).toBe("U");
    expect(colorBucket([])).toBe("Colorless");
    expect(colorBucket(null)).toBe("Colorless");
    expect(colorBucket(["W", "U"])).toBe("Multicolor");
    expect(colorBucket(["W", "U", "B", "R", "G"])).toBe("Multicolor");
  });
});

describe("computeCollectionBreakdowns", () => {
  const collection = {
    cards: [
      { scryfallId: "a", name: "Sol Ring", setCode: "c21", collectorNumber: "1",
        stacks: [{ finish: "nonfoil", quantity: 1 }], prices: { usd: "2.00" } },
      { scryfallId: "b", name: "Llanowar Elves", setCode: "c21", collectorNumber: "2",
        stacks: [{ finish: "nonfoil", quantity: 2 }], prices: { usd: "0.50" } },
      { scryfallId: "c", name: "Forest", setCode: "m21", collectorNumber: "3",
        stacks: [{ finish: "nonfoil", quantity: 4 }], prices: { usd: "0.10" } },
      { scryfallId: "d", name: "Mana Crypt", setCode: "2xm", collectorNumber: "4",
        stacks: [{ finish: "foil", quantity: 1 }], prices: { usd: "100", usdFoil: "180" } },
      { scryfallId: "w", name: "Wishlisted", setCode: "x", collectorNumber: "9",
        wishlist: true, stacks: [{ finish: "nonfoil", quantity: 1 }], prices: { usd: "999" } },
      { scryfallId: "z", name: "Zero Qty", setCode: "x", collectorNumber: "10",
        stacks: [{ finish: "nonfoil", quantity: 0 }], prices: { usd: "5" } },
    ],
  };

  const META = {
    "Sol Ring": { typeLine: "Artifact", cmc: 1, colors: [], rarity: "uncommon", setName: "Commander 2021" },
    "Llanowar Elves": { typeLine: "Creature — Elf Druid", cmc: 1, colors: ["G"], rarity: "common", setName: "Commander 2021" },
    "Forest": { typeLine: "Basic Land — Forest", cmc: 0, colors: [], rarity: "common", setName: "Core Set 2021" },
    "Mana Crypt": { typeLine: "Artifact", cmc: 0, colors: [], rarity: "mythic", setName: "Double Masters" },
  };
  const getMeta = (row) => META[row.name] || null;

  it("ignores wishlist + zero-quantity rows", () => {
    const b = computeCollectionBreakdowns(collection, getMeta);
    expect(b.ownedRows).toBe(4); // a, b, c, d
  });

  it("breaks down by type / rarity / color", () => {
    const b = computeCollectionBreakdowns(collection, getMeta);
    expect(b.byType).toEqual({ Artifact: 2, Creature: 1, Land: 1 });
    expect(b.byRarity).toEqual({ uncommon: 1, common: 2, mythic: 1 });
    expect(b.byColor).toMatchObject({ G: 1, Colorless: 3 });
  });

  it("builds a mana curve over non-land cards only", () => {
    const b = computeCollectionBreakdowns(collection, getMeta);
    // Sol Ring(1), Llanowar(1), Mana Crypt(0) — Forest is a land, excluded
    expect(b.manaCurve["0"]).toBe(1);
    expect(b.manaCurve["1"]).toBe(2);
  });

  it("ranks top sets and most-valuable cards (value = price × qty)", () => {
    const b = computeCollectionBreakdowns(collection, getMeta);
    expect(b.topSets[0]).toEqual({ setCode: "C21", setName: "Commander 2021", count: 2 });
    // Mana Crypt foil: 180 × 1 = 180 (uses usdFoil for the foil stack)
    expect(b.mostValuable[0]).toMatchObject({ name: "Mana Crypt", lineValue: 180, quantity: 1 });
    expect(b.pricedRows).toBe(4);
  });

  it("degrades gracefully with no metadata (Other / Colorless / unknown)", () => {
    const b = computeCollectionBreakdowns(collection, () => null);
    expect(b.byType.Other).toBe(4);
    expect(b.byRarity.unknown).toBe(4);
    expect(b.byColor.Colorless).toBe(4);
  });

  it("returns an empty-but-shaped result for a junk collection", () => {
    const b = computeCollectionBreakdowns(null, getMeta);
    expect(b.ownedRows).toBe(0);
    expect(b.topSets).toEqual([]);
    expect(b.mostValuable).toEqual([]);
  });
});

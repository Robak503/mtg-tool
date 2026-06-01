/**
 * setBrowser — owned-counting + card annotation (Vault #23). Pure, synthetic.
 */

import { describe, expect, it } from "vitest";
import { ownedCountsBySet, ownedSets, annotateSetCards } from "./setBrowser.js";

const collection = {
  cards: [
    { scryfallId: "a", oracleId: "o-sol", name: "Sol Ring", setCode: "C21", stacks: [{ finish: "nonfoil", quantity: 1 }] },
    { scryfallId: "b", oracleId: "o-llan", name: "Llanowar Elves", setCode: "c21", stacks: [{ finish: "nonfoil", quantity: 2 }] },
    { scryfallId: "c", oracleId: "o-forest", name: "Forest", setCode: "M21", stacks: [{ finish: "nonfoil", quantity: 4 }] },
    { scryfallId: "w", oracleId: "o-w", name: "Wish", setCode: "C21", wishlist: true, stacks: [{ finish: "nonfoil", quantity: 1 }] },
    { scryfallId: "z", oracleId: "o-z", name: "Zero", setCode: "C21", stacks: [{ finish: "nonfoil", quantity: 0 }] },
  ],
};

describe("ownedCountsBySet", () => {
  it("counts distinct owned printings per set (lowercased), skipping wishlist + zero-qty", () => {
    const counts = ownedCountsBySet(collection);
    expect(counts.get("c21")).toBe(2); // Sol Ring + Llanowar (Wish=wishlist, Zero=0qty excluded)
    expect(counts.get("m21")).toBe(1);
    expect(counts.has("zzz")).toBe(false);
  });
  it("returns an empty map for a junk collection", () => {
    expect(ownedCountsBySet(null).size).toBe(0);
  });
});

describe("ownedSets", () => {
  it("collects owned scryfall + oracle ids, excluding wishlist/zero", () => {
    const { scryfall, oracles } = ownedSets(collection);
    expect([...scryfall].sort()).toEqual(["a", "b", "c"]);
    expect(oracles.has("o-sol")).toBe(true);
    expect(oracles.has("o-w")).toBe(false); // wishlist
    expect(oracles.has("o-z")).toBe(false); // zero qty
  });
});

describe("annotateSetCards", () => {
  const raw = [
    { id: "a", oracleId: "o-sol", name: "Sol Ring", collectorNumber: "1", set: "c21", rarity: "uncommon", prices: { usd: "2.00", usdFoil: "9.00" }, artCropUrl: "x" },
    { id: "a2", oracleId: "o-sol", name: "Sol Ring", collectorNumber: "200", set: "c21", rarity: "rare", prices: { usd: "5.00" } },
    { id: "new", oracleId: "o-new", name: "New Card", collectorNumber: "3", set: "c21", prices: {} },
  ];
  const { scryfall, oracles } = ownedSets(collection);

  it("flags owned (exact) and owned-other-printing (same oracle, different printing)", () => {
    const out = annotateSetCards(raw, scryfall, oracles);
    expect(out[0]).toMatchObject({ scryfallId: "a", owned: true, ownedOtherPrinting: false, usd: 2, usdFoil: 9, rarity: "uncommon" });
    // a2 is a different Sol Ring printing — owned via the oracle, not this scryfallId
    expect(out[1]).toMatchObject({ scryfallId: "a2", owned: false, ownedOtherPrinting: true });
    // unowned card
    expect(out[2]).toMatchObject({ scryfallId: "new", owned: false, ownedOtherPrinting: false, usd: null });
  });

  it("handles empty input", () => {
    expect(annotateSetCards(null, scryfall, oracles)).toEqual([]);
  });
});

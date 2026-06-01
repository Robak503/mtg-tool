/**
 * deckOverlap — deck-scoped owned signal for collection-aware Karn (G1). Pure.
 */

import { describe, expect, it } from "vitest";
import { ciSubset, computeDeckOverlap, renderDeckOverlapBlock } from "./deckOverlap.js";

describe("ciSubset", () => {
  it("allows a card whose colors are within the deck identity", () => {
    expect(ciSubset(["G"], ["G", "W"])).toBe(true);
    expect(ciSubset([], ["G", "W"])).toBe(true); // colorless fits anything
    expect(ciSubset(["G", "W"], ["G", "W"])).toBe(true);
  });
  it("rejects a card with an off-color pip", () => {
    expect(ciSubset(["U"], ["G", "W"])).toBe(false);
    expect(ciSubset(["G", "B"], ["G", "W"])).toBe(false);
  });
});

describe("computeDeckOverlap", () => {
  const deckNames = ["Sol Ring", "Llanowar Elves", "Forest"];
  const owned = [
    { name: "Sol Ring", colorIdentity: [], edhrecRank: 1 },        // in deck → owned-in-deck
    { name: "Rhystic Study", colorIdentity: ["U"], edhrecRank: 20 }, // off-color (deck is G) → excluded
    { name: "Beast Whisperer", colorIdentity: ["G"], edhrecRank: 300 }, // in-color, not in deck → pool
    { name: "Cultivate", colorIdentity: ["G"], edhrecRank: 50 },        // in-color, not in deck → pool
    { name: "Arcane Signet", colorIdentity: [], edhrecRank: 5 },        // colorless, not in deck → pool
  ];

  it("counts owned-in-deck and builds an in-color pool sorted by EDHREC rank", () => {
    const o = computeDeckOverlap(deckNames, owned, ["G"]);
    expect(o.ownedInDeck).toBe(1);          // Sol Ring
    expect(o.deckTotal).toBe(3);
    // Rhystic Study (U) excluded; pool sorted by rank: Arcane Signet(5), Cultivate(50), Beast Whisperer(300)
    expect(o.pool).toEqual(["Arcane Signet", "Cultivate", "Beast Whisperer"]);
  });

  it("respects maxPool and dedupes by name", () => {
    const o = computeDeckOverlap(deckNames, owned, ["G"], { maxPool: 2 });
    expect(o.pool).toEqual(["Arcane Signet", "Cultivate"]);
  });

  it("empty owned → empty pool, zero owned-in-deck", () => {
    const o = computeDeckOverlap(deckNames, [], ["G"]);
    expect(o).toMatchObject({ ownedInDeck: 0, deckTotal: 3, pool: [] });
  });
});

describe("renderDeckOverlapBlock", () => {
  it("renders owned count + a bracketed pool", () => {
    const block = renderDeckOverlapBlock({ ownedInDeck: 1, deckTotal: 3, pool: ["Cultivate", "Arcane Signet"] });
    expect(block).toContain("owns 1 of the 3 cards");
    expect(block).toContain("[[Cultivate]], [[Arcane Signet]]");
  });
  it("handles an empty pool gracefully", () => {
    const block = renderDeckOverlapBlock({ ownedInDeck: 5, deckTotal: 99, pool: [] });
    expect(block).toContain("suggest acquisitions as usual");
  });
});

import { describe, it, expect } from "vitest";

import { deckCostToFinish, cheapestPaperPrice } from "./deckCost.js";

// Stub printing lookup: name -> printings (with oracleId + prices).
const PRINTINGS = {
  "Sol Ring": [
    { oracleId: "o-sol", prices: { usd: "2.50" } },
    { oracleId: "o-sol", prices: { usd: "1.20" } },
    { oracleId: "o-sol", prices: { usd: "9.00" } },
  ],
  "Cyclonic Rift": [{ oracleId: "o-rift", prices: { usd: "18.00" } }],
  "Llanowar Elves": [{ oracleId: "o-llan", prices: { usd: "0.25" } }],
  "Obscure Card": [{ oracleId: "o-obs", prices: { usd: null } }], // no price
};
const lookup = name => PRINTINGS[name] || [];

function collectionWith(owned) {
  // owned: { oracleId: total nonfoil qty }
  return { cards: Object.entries(owned).map(([oracleId, qty]) => ({ oracleId, wishlist: false, stacks: [{ finish: "nonfoil", quantity: qty }] })) };
}

describe("cheapestPaperPrice", () => {
  it("picks the lowest non-null usd", () => {
    expect(cheapestPaperPrice(PRINTINGS["Sol Ring"])).toBe(1.2);
  });
  it("returns null when nothing is priced", () => {
    expect(cheapestPaperPrice(PRINTINGS["Obscure Card"])).toBeNull();
  });
});

describe("deckCostToFinish", () => {
  const deck = {
    id: "d1",
    name: "Test Deck",
    cards: [
      { qty: 1, name: "Sol Ring", section: "Commander" },
      { qty: 1, name: "Cyclonic Rift", section: "Mainboard" },
      { qty: 4, name: "Llanowar Elves", section: "Mainboard" },
      { qty: 10, name: "Forest", section: "Mainboard" },   // basic land — free
      { qty: 2, name: "Negate", section: "Sideboard" },      // sideboard — ignored
    ],
  };

  it("totals the cheapest cost of cards you don't own (basics free, SB ignored)", () => {
    const out = deckCostToFinish(deck, collectionWith({ "o-llan": 4 }), lookup);
    // Own all 4 Llanowar; basics free. Need Sol Ring (1.20) + Cyclonic Rift (18).
    expect(out.costToFinish).toBe(19.2);
    expect(out.neededCards).toBe(2);
    expect(out.complete).toBe(false);
    expect(out.missing.map(m => m.name)).toEqual(["Cyclonic Rift", "Sol Ring"]); // sorted by lineCost desc
  });

  it("counts owned copies toward ownedCards + ownedPct (basics included as owned)", () => {
    const out = deckCostToFinish(deck, collectionWith({ "o-sol": 1, "o-rift": 1, "o-llan": 4 }), lookup);
    // total counted = 1 + 1 + 4 + 10 = 16; all owned (basics free).
    expect(out.totalCards).toBe(16);
    expect(out.ownedCards).toBe(16);
    expect(out.ownedPct).toBe(100);
    expect(out.complete).toBe(true);
    expect(out.costToFinish).toBe(0);
  });

  it("partial ownership reduces the need", () => {
    const out = deckCostToFinish(deck, collectionWith({ "o-llan": 2 }), lookup);
    // own 2 of 4 Llanowar → need 2 @ 0.25 = 0.50; + Sol 1.20 + Rift 18 = 19.70
    expect(out.costToFinish).toBe(19.7);
    const llan = out.missing.find(m => m.name === "Llanowar Elves");
    expect(llan).toMatchObject({ owned: 2, need: 2, deckQty: 4 });
  });

  it("flags unpriced cards instead of adding 0 silently", () => {
    const d = { id: "d2", name: "X", cards: [{ qty: 1, name: "Obscure Card", section: "Mainboard" }] };
    const out = deckCostToFinish(d, collectionWith({}), lookup);
    expect(out.unpricedCount).toBe(1);
    expect(out.missing[0].unitPrice).toBeNull();
  });
});

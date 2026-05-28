/**
 * collectionContext — pure aggregation functions over a Collection.
 *
 * No I/O. All inputs are synthetic. Covers the cases the eng-review
 * called out: stack sums, multi-printing sums, wishlist exclusion,
 * conflict math, ownedCount per finish, summary token-budget sanity.
 */

import { describe, expect, it } from "vitest";
import {
  ownedCount,
  isOwned,
  buildOwnedSet,
  crossDeckUsage,
  conflicts,
  collectionSummary,
} from "./collectionContext.js";

function makeRow(oracleId, name, stacks, opts = {}) {
  return {
    scryfallId: opts.scryfallId || `${oracleId}-print-${Math.random().toString(36).slice(2, 6)}`,
    oracleId,
    name,
    setCode: opts.setCode || "tst",
    collectorNumber: opts.collectorNumber || "1",
    stacks,
    wishlist: !!opts.wishlist,
    prices: opts.prices,
  };
}

describe("ownedCount", () => {
  it("returns zeros for missing collection or oracle", () => {
    expect(ownedCount(null, "x")).toEqual({ nonfoil: 0, foil: 0, etched: 0, total: 0 });
    expect(ownedCount({ cards: [] }, "x")).toEqual({ nonfoil: 0, foil: 0, etched: 0, total: 0 });
    expect(ownedCount({ cards: [makeRow("a", "X", [{ finish: "nonfoil", quantity: 1 }])] }, null))
      .toEqual({ nonfoil: 0, foil: 0, etched: 0, total: 0 });
  });

  it("sums across stacks on a single row", () => {
    const c = {
      cards: [
        makeRow("sol", "Sol Ring", [
          { finish: "nonfoil", quantity: 4, condition: "NM" },
          { finish: "foil",    quantity: 1, condition: "LP" },
          { finish: "etched",  quantity: 2, condition: "NM" },
        ]),
      ],
    };
    expect(ownedCount(c, "sol")).toEqual({ nonfoil: 4, foil: 1, etched: 2, total: 7 });
  });

  it("sums across multiple printings (same oracleId)", () => {
    const c = {
      cards: [
        makeRow("sol", "Sol Ring", [{ finish: "nonfoil", quantity: 2 }], { scryfallId: "p1", setCode: "c21" }),
        makeRow("sol", "Sol Ring", [{ finish: "nonfoil", quantity: 3 }], { scryfallId: "p2", setCode: "mh3" }),
        makeRow("sol", "Sol Ring", [{ finish: "foil",    quantity: 1 }], { scryfallId: "p3", setCode: "tsr" }),
      ],
    };
    expect(ownedCount(c, "sol")).toEqual({ nonfoil: 5, foil: 1, etched: 0, total: 6 });
  });

  it("excludes wishlist rows", () => {
    const c = {
      cards: [
        makeRow("sol", "Sol Ring", [{ finish: "nonfoil", quantity: 1 }]),
        makeRow("sol", "Sol Ring", [{ finish: "foil",    quantity: 0 }], { wishlist: true }),
      ],
    };
    expect(ownedCount(c, "sol")).toEqual({ nonfoil: 1, foil: 0, etched: 0, total: 1 });
  });
});

describe("isOwned", () => {
  it("returns true when total >= minQty (default 1)", () => {
    const c = { cards: [makeRow("a", "X", [{ finish: "nonfoil", quantity: 1 }])] };
    expect(isOwned(c, "a")).toBe(true);
    expect(isOwned(c, "a", 1)).toBe(true);
    expect(isOwned(c, "a", 2)).toBe(false);
  });

  it("returns false for unknown oracle", () => {
    const c = { cards: [makeRow("a", "X", [{ finish: "nonfoil", quantity: 1 }])] };
    expect(isOwned(c, "nope")).toBe(false);
  });
});

describe("buildOwnedSet", () => {
  it("includes oracles with any owned quantity", () => {
    const c = {
      cards: [
        makeRow("a", "A", [{ finish: "nonfoil", quantity: 1 }]),
        makeRow("b", "B", [{ finish: "foil",    quantity: 2 }]),
      ],
    };
    const s = buildOwnedSet(c);
    expect(s.has("a")).toBe(true);
    expect(s.has("b")).toBe(true);
    expect(s.size).toBe(2);
  });

  it("excludes wishlist and zero-quantity rows", () => {
    const c = {
      cards: [
        makeRow("a", "A", [{ finish: "nonfoil", quantity: 0 }]),
        makeRow("b", "B", [{ finish: "foil",    quantity: 1 }], { wishlist: true }),
        makeRow("c", "C", [{ finish: "nonfoil", quantity: 1 }]),
      ],
    };
    const s = buildOwnedSet(c);
    expect(s.has("a")).toBe(false);
    expect(s.has("b")).toBe(false);
    expect(s.has("c")).toBe(true);
  });
});

describe("crossDeckUsage", () => {
  it("returns empty map when no decks", () => {
    const c = { cards: [makeRow("a", "A", [{ finish: "nonfoil", quantity: 1 }])] };
    expect(crossDeckUsage(c, []).size).toBe(0);
    expect(crossDeckUsage(c, null).size).toBe(0);
  });

  it("joins owned + used quantities", () => {
    const c = {
      cards: [
        makeRow("sol", "Sol Ring", [{ finish: "nonfoil", quantity: 2 }]),
      ],
    };
    const decks = [
      { id: "deck-a", name: "Atraxa", cards: [{ oracleId: "sol", quantity: 1 }] },
      { id: "deck-b", name: "Yarok",  cards: [{ oracleId: "sol", quantity: 1 }] },
    ];
    const usage = crossDeckUsage(c, decks);
    expect(usage.get("sol")).toEqual({
      ownedQty: 2,
      usedQty: 2,
      deckIds: ["deck-a", "deck-b"],
    });
  });

  it("counts a deck only once per oracle even if duplicated", () => {
    const c = { cards: [makeRow("sol", "Sol Ring", [{ finish: "nonfoil", quantity: 1 }])] };
    const decks = [
      {
        id: "deck-a", name: "Atraxa",
        cards: [
          { oracleId: "sol", quantity: 1 },
          { oracleId: "sol", quantity: 1 },
        ],
      },
    ];
    const usage = crossDeckUsage(c, decks);
    expect(usage.get("sol").deckIds).toEqual(["deck-a"]);
    expect(usage.get("sol").usedQty).toBe(2);
  });

  it("skips deck cards without oracleId", () => {
    const c = { cards: [makeRow("sol", "Sol Ring", [{ finish: "nonfoil", quantity: 1 }])] };
    const decks = [
      { id: "deck-a", name: "X", cards: [{ name: "Sol Ring (unmapped)", quantity: 1 }] },
    ];
    expect(crossDeckUsage(c, decks).size).toBe(0);
  });
});

describe("conflicts", () => {
  it("returns empty when usage <= owned", () => {
    const c = { cards: [makeRow("sol", "Sol Ring", [{ finish: "nonfoil", quantity: 2 }])] };
    const decks = [{ id: "deck-a", name: "X", cards: [{ oracleId: "sol", quantity: 1 }] }];
    expect(conflicts(c, decks)).toEqual([]);
  });

  it("detects over-allocation across decks", () => {
    const c = { cards: [makeRow("sol", "Sol Ring", [{ finish: "nonfoil", quantity: 1 }])] };
    const decks = [
      { id: "deck-a", name: "Atraxa", cards: [{ oracleId: "sol", quantity: 1 }] },
      { id: "deck-b", name: "Yarok",  cards: [{ oracleId: "sol", quantity: 1 }] },
    ];
    const out = conflicts(c, decks);
    expect(out).toHaveLength(1);
    expect(out[0]).toEqual({
      oracleId: "sol",
      ownedQty: 1,
      usedQty: 2,
      deckIds: ["deck-a", "deck-b"],
    });
  });

  it("detects conflicts when the card isn't owned at all", () => {
    const c = { cards: [] };
    const decks = [{ id: "deck-a", name: "X", cards: [{ oracleId: "sol", quantity: 1 }] }];
    const out = conflicts(c, decks);
    expect(out).toEqual([{ oracleId: "sol", ownedQty: 0, usedQty: 1, deckIds: ["deck-a"] }]);
  });
});

describe("collectionSummary", () => {
  it("returns empty stats for an empty collection", () => {
    const out = collectionSummary({ cards: [] });
    expect(out.totalCards).toBe(0);
    expect(out.uniqueOracles).toBe(0);
    expect(out.topByCount).toEqual([]);
    expect(out.totalValueUsd).toBe(0);
  });

  it("counts cards and unique oracles correctly", () => {
    const c = {
      cards: [
        makeRow("a", "A", [{ finish: "nonfoil", quantity: 4 }]),
        makeRow("a", "A", [{ finish: "foil",    quantity: 1 }], { scryfallId: "a-foil" }),
        makeRow("b", "B", [{ finish: "nonfoil", quantity: 2 }]),
      ],
    };
    const out = collectionSummary(c);
    expect(out.totalCards).toBe(7);
    expect(out.uniqueOracles).toBe(2);
    expect(out.topByCount[0]).toEqual({ oracleId: "a", name: "A", qty: 5 });
    expect(out.topByCount[1]).toEqual({ oracleId: "b", name: "B", qty: 2 });
  });

  it("sums value per finish using the correct price field", () => {
    const c = {
      cards: [
        makeRow("a", "A",
          [
            { finish: "nonfoil", quantity: 2 },
            { finish: "foil",    quantity: 1 },
          ],
          { prices: { usd: "1.00", usdFoil: "5.00", usdEtched: null } }),
      ],
    };
    const out = collectionSummary(c);
    expect(out.totalValueUsd).toBe(7.00);
  });

  it("uses lookupOracleColors when provided", () => {
    const c = {
      cards: [
        makeRow("counter", "Counterspell", [{ finish: "nonfoil", quantity: 3 }]),
        makeRow("titan", "Primeval Titan",  [{ finish: "nonfoil", quantity: 1 }]),
        makeRow("sol", "Sol Ring",          [{ finish: "nonfoil", quantity: 2 }]),
      ],
    };
    const colors = (id) => ({
      counter: ["U"],
      titan: ["G"],
      sol: [], // colorless
    }[id] || null);
    const out = collectionSummary(c, colors);
    expect(out.colorBreakdown).toEqual({ W: 0, U: 3, B: 0, R: 0, G: 1, C: 2 });
  });

  it("caps topByCount at 20 entries (token budget guard)", () => {
    const cards = [];
    for (let i = 0; i < 30; i++) {
      cards.push(makeRow(`o-${i}`, `Card-${i}`, [{ finish: "nonfoil", quantity: i + 1 }]));
    }
    const out = collectionSummary({ cards });
    expect(out.topByCount).toHaveLength(20);
    // Sorted by qty descending
    expect(out.topByCount[0].qty).toBe(30);
  });

  it("excludes wishlist rows", () => {
    const c = {
      cards: [
        makeRow("a", "A", [{ finish: "nonfoil", quantity: 1 }]),
        makeRow("b", "B", [{ finish: "foil",    quantity: 0 }], { wishlist: true }),
      ],
    };
    const out = collectionSummary(c);
    expect(out.uniqueOracles).toBe(1);
    expect(out.topByCount).toHaveLength(1);
  });
});

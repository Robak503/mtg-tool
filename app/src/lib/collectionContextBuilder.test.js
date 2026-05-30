/**
 * collectionContextBuilder — gating + rendering for the COLLECTION SUMMARY
 * prompt block injected into agent system messages.
 *
 * Pure functions; no fetch, no I/O. The fetchCollectionContextBlock
 * helper is exercised via an integration-style test in chat-stream
 * later — for unit purposes we focus on the building blocks.
 */

import { describe, expect, it } from "vitest";
import {
  shouldInjectCollectionContext,
  buildCollectionContextBlock,
  buildOwnedListBlock,
  buildSwapCandidatesBlock,
  isBuildFromCollectionPrompt,
} from "./collectionContextBuilder.js";

function makeRow(oracleId, name, stacks, opts = {}) {
  return {
    scryfallId: opts.scryfallId || `${oracleId}-${Math.random()}`,
    oracleId,
    name,
    setCode: opts.setCode || "tst",
    collectorNumber: opts.collectorNumber || "1",
    stacks,
    wishlist: !!opts.wishlist,
    prices: opts.prices,
    colorTagId: opts.colorTagId,
  };
}

function collectionWithN(n) {
  const cards = [];
  for (let i = 0; i < n; i++) {
    cards.push(makeRow(`o-${i}`, `Card-${i}`, [{ finish: "nonfoil", quantity: 1, condition: "NM" }]));
  }
  return { version: 1, updatedAt: "x", cards };
}

describe("shouldInjectCollectionContext", () => {
  it("returns false for an empty collection", () => {
    expect(shouldInjectCollectionContext("karn", "anything", { cards: [] })).toBe(false);
    expect(shouldInjectCollectionContext("karn", "anything", null)).toBe(false);
  });

  it("returns false for Karn with fewer than 10 owned cards", () => {
    expect(shouldInjectCollectionContext("karn", "build me a deck", collectionWithN(9))).toBe(false);
  });

  it("returns true for Karn with ≥10 owned cards", () => {
    expect(shouldInjectCollectionContext("karn", "build me a deck", collectionWithN(10))).toBe(true);
    expect(shouldInjectCollectionContext("karn", "build me a deck", collectionWithN(500))).toBe(true);
  });

  it("excludes wishlist-only rows from Karn's 10-card threshold", () => {
    const c = { cards: [] };
    for (let i = 0; i < 9; i++) {
      c.cards.push(makeRow(`o-${i}`, `Card-${i}`, [{ finish: "nonfoil", quantity: 1 }]));
    }
    for (let i = 0; i < 50; i++) {
      c.cards.push(makeRow(`w-${i}`, `Wish-${i}`, [{ finish: "foil", quantity: 0 }], { wishlist: true }));
    }
    expect(shouldInjectCollectionContext("karn", "x", c)).toBe(false);
  });

  it("returns true for Jace only on collection-intent prompts", () => {
    const c = collectionWithN(50);
    expect(shouldInjectCollectionContext("jace", "How does the stack work?", c)).toBe(false);
    expect(shouldInjectCollectionContext("jace", "do I own a Counterspell?", c)).toBe(true);
    expect(shouldInjectCollectionContext("jace", "What's in my collection?", c)).toBe(true);
    expect(shouldInjectCollectionContext("jace", "show my wishlist", c)).toBe(true);
  });

  it("returns false for Tibalt in chat-stream (dedicated endpoint handles roasts)", () => {
    expect(shouldInjectCollectionContext("tibalt", "roast my collection", collectionWithN(100))).toBe(false);
  });

  it("returns false for unknown agents", () => {
    expect(shouldInjectCollectionContext("arbiter", "anything", collectionWithN(100))).toBe(false);
    expect(shouldInjectCollectionContext("garfield", "anything", collectionWithN(100))).toBe(false);
  });
});

describe("buildCollectionContextBlock", () => {
  it("returns empty string for empty collection", () => {
    expect(buildCollectionContextBlock({ cards: [] })).toBe("");
    expect(buildCollectionContextBlock(null)).toBe("");
  });

  it("renders the header, instruction, and stats lines", () => {
    const c = {
      cards: [
        makeRow("sol", "Sol Ring", [{ finish: "nonfoil", quantity: 4, condition: "NM" }]),
        makeRow("counter", "Counterspell", [{ finish: "nonfoil", quantity: 3, condition: "NM" }]),
      ],
    };
    const block = buildCollectionContextBlock(c);
    expect(block).toMatch(/^## COLLECTION SUMMARY/);
    expect(block).toMatch(/Total owned: 7 cards across 2 unique cards/);
    expect(block).toMatch(/Sol Ring x4/);
    expect(block).toMatch(/Counterspell x3/);
  });

  it("includes the value line when prices are present", () => {
    const c = {
      cards: [
        makeRow("sol", "Sol Ring",
          [{ finish: "nonfoil", quantity: 2 }],
          { prices: { usd: "5.00", usdFoil: null, usdEtched: null } }),
      ],
    };
    expect(buildCollectionContextBlock(c)).toMatch(/Estimated value: \$10\.00/);
  });

  it("includes color breakdown only when colors are supplied", () => {
    const c = {
      cards: [
        makeRow("a", "Card A", [{ finish: "nonfoil", quantity: 2 }]),
      ],
    };
    expect(buildCollectionContextBlock(c)).not.toMatch(/Color breakdown/);

    const colors = (id) => ({ a: ["U"] }[id] || null);
    const block = buildCollectionContextBlock(c, colors);
    expect(block).toMatch(/Color breakdown:/);
    expect(block).toMatch(/U 100%/);
  });

  it("caps top-by-count at 20 entries for token budget", () => {
    const cards = [];
    for (let i = 0; i < 30; i++) {
      cards.push(makeRow(`o-${i}`, `Card-${i}`, [{ finish: "nonfoil", quantity: 30 - i }]));
    }
    const block = buildCollectionContextBlock({ cards });
    const cardLines = block.split("\n").filter(l => l.startsWith("- Card-"));
    expect(cardLines.length).toBeLessThanOrEqual(20);
    // Highest-quantity card should be first
    expect(cardLines[0]).toBe("- Card-0 x30");
  });

  it("excludes wishlist-only rows from the summary", () => {
    const c = {
      cards: [
        makeRow("a", "Sol Ring", [{ finish: "nonfoil", quantity: 1 }]),
        makeRow("b", "Wishlist Card", [{ finish: "foil", quantity: 0 }], { wishlist: true }),
      ],
    };
    const block = buildCollectionContextBlock(c);
    expect(block).toMatch(/1 cards across 1 unique cards/);
    expect(block).not.toMatch(/Wishlist Card/);
  });

  it("stays under the 400-token target on a large collection", () => {
    const cards = [];
    for (let i = 0; i < 1000; i++) {
      cards.push(makeRow(`o-${i}`, `Card-${i}`, [{ finish: "nonfoil", quantity: 1 }]));
    }
    const block = buildCollectionContextBlock({ cards });
    // Rough token estimate: ~4 chars/token. 400 tokens ≈ 1600 chars.
    expect(block.length).toBeLessThan(1800);
  });
});

describe("buildSwapCandidatesBlock", () => {
  const cards = [
    makeRow("o-sol", "Sol Ring", [{ finish: "nonfoil", quantity: 1 }], { colorTagId: "swap" }),
    makeRow("o-counter", "Counterspell", [{ finish: "nonfoil", quantity: 1 }], { colorTagId: "have" }),
    makeRow("o-llanowar", "Llanowar Elves", [{ finish: "nonfoil", quantity: 1 }], { colorTagId: "swap" }),
  ];

  it("returns '' when no swap tag ids are given", () => {
    expect(buildSwapCandidatesBlock({ cards }, [])).toBe("");
    expect(buildSwapCandidatesBlock({ cards }, null)).toBe("");
  });

  it("returns '' when no rows carry a swap tag", () => {
    expect(buildSwapCandidatesBlock({ cards }, ["nonexistent"])).toBe("");
  });

  it("lists only the swap-tagged cards", () => {
    const block = buildSwapCandidatesBlock({ cards }, ["swap"]);
    expect(block).toMatch(/## SWAP CANDIDATES/);
    expect(block).toMatch(/- Sol Ring/);
    expect(block).toMatch(/- Llanowar Elves/);
    expect(block).not.toMatch(/Counterspell/);
  });

  it("dedupes by oracleId across printings", () => {
    const dupes = [
      makeRow("o-sol", "Sol Ring", [{ finish: "nonfoil", quantity: 1 }], { colorTagId: "swap", scryfallId: "a" }),
      makeRow("o-sol", "Sol Ring", [{ finish: "foil", quantity: 1 }], { colorTagId: "swap", scryfallId: "b" }),
    ];
    const block = buildSwapCandidatesBlock({ cards: dupes }, ["swap"]);
    expect(block.match(/- Sol Ring/g)).toHaveLength(1);
  });

  it("handles missing/empty collection", () => {
    expect(buildSwapCandidatesBlock(null, ["swap"])).toBe("");
    expect(buildSwapCandidatesBlock({ cards: [] }, ["swap"])).toBe("");
  });
});

describe("isBuildFromCollectionPrompt", () => {
  it("detects explicit build-from-collection phrasing", () => {
    expect(isBuildFromCollectionPrompt("build a deck from my collection")).toBe(true);
    expect(isBuildFromCollectionPrompt("Karn, build me a deck using cards from my collection")).toBe(true);
    expect(isBuildFromCollectionPrompt("build it from what i own")).toBe(true);
    expect(isBuildFromCollectionPrompt("out of my collection, build a deck")).toBe(true);
  });
  it("returns false for casual chat", () => {
    expect(isBuildFromCollectionPrompt("How does the stack work?")).toBe(false);
    expect(isBuildFromCollectionPrompt("show me my collection")).toBe(false);
  });
});

describe("buildOwnedListBlock", () => {
  it("returns empty string for empty collection", () => {
    expect(buildOwnedListBlock({ cards: [] })).toBe("");
    expect(buildOwnedListBlock(null)).toBe("");
  });

  it("renders the constraint instruction + owned list", () => {
    const c = {
      cards: [
        makeRow("sol", "Sol Ring", [{ finish: "nonfoil", quantity: 4 }]),
        makeRow("counter", "Counterspell", [{ finish: "nonfoil", quantity: 3 }]),
      ],
    };
    const block = buildOwnedListBlock(c);
    expect(block).toMatch(/^## BUILD FROM COLLECTION MODE/);
    expect(block).toMatch(/STRETCH GOALS/);
    expect(block).toMatch(/Sol Ring x4/);
    expect(block).toMatch(/Counterspell x3/);
  });

  it("caps the owned list at the limit and notes 'of N total' when truncated", () => {
    const cards = [];
    for (let i = 0; i < 300; i++) {
      cards.push(makeRow(`o-${i}`, `Card-${i}`, [{ finish: "nonfoil", quantity: 1 }]));
    }
    const block = buildOwnedListBlock({ cards }, 200);
    expect(block).toMatch(/top 200 by count, of 300 total/);
    const cardLines = block.split("\n").filter(l => l.startsWith("- Card-"));
    expect(cardLines).toHaveLength(200);
  });

  it("excludes wishlist rows", () => {
    const c = {
      cards: [
        makeRow("a", "Card A", [{ finish: "nonfoil", quantity: 1 }]),
        makeRow("b", "Wish Card", [{ finish: "foil", quantity: 0 }], { wishlist: true }),
      ],
    };
    const block = buildOwnedListBlock(c);
    expect(block).toMatch(/Card A/);
    expect(block).not.toMatch(/Wish Card/);
  });
});

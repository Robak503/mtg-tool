/**
 * showpiece.test.js — the C5-P2.1 treasure predicate + shelf builder.
 * Pure functions; the shelf's RENDER is covered in collectionVaultUi.test.jsx.
 */
import { describe, it, expect } from "vitest";

import { isShowpiece, rowUnitValue, buildShelf } from "./showpiece.js";

const row = (over = {}) => ({
  scryfallId: over.scryfallId || Math.random().toString(36).slice(2),
  name: "Card",
  stacks: [{ finish: "nonfoil", quantity: 1, condition: "NM" }],
  prices: { usd: "1.00" },
  ...over,
});

describe("isShowpiece — the provenance predicate", () => {
  it("flags signed / artistProof / altered / showcase rows", () => {
    expect(isShowpiece(row({ signed: { artist: "Rebecca Guay" } }))).toBe(true);
    expect(isShowpiece(row({ artistProof: true }))).toBe(true);
    expect(isShowpiece(row({ altered: true }))).toBe(true);
    expect(isShowpiece(row({ showcase: true }))).toBe(true);
  });
  it("bulk (no flags) and nullish rows are not showpieces", () => {
    expect(isShowpiece(row())).toBe(false);
    expect(isShowpiece(null)).toBe(false);
  });
});

describe("rowUnitValue — highest owned-finish price", () => {
  it("uses the matching per-finish price key and ignores qty-0 stacks", () => {
    const r = row({
      stacks: [
        { finish: "nonfoil", quantity: 1 },
        { finish: "foil", quantity: 1 },
        { finish: "etched", quantity: 0 },
      ],
      prices: { usd: "10.00", usdFoil: "80.00", usdEtched: "500.00" },
    });
    expect(rowUnitValue(r)).toBe(80); // etched is priced higher but not owned
  });
  it("missing prices → 0, never NaN", () => {
    expect(rowUnitValue(row({ prices: {} }))).toBe(0);
    expect(rowUnitValue(row({ prices: { usd: "garbage" } }))).toBe(0);
  });
});

describe("buildShelf — flagged first, then top-value picks above the floor", () => {
  it("every flagged row makes the shelf; unflagged need value ≥ the $50 floor", () => {
    const cards = [
      row({ scryfallId: "signed", signed: { artist: "X" }, prices: { usd: "2.00" } }),
      row({ scryfallId: "grail", prices: { usd: "120.00" } }),
      row({ scryfallId: "bulk", prices: { usd: "0.25" } }),
    ];
    const shelf = buildShelf(cards);
    expect(shelf.map((e) => e.row.scryfallId)).toEqual(["signed", "grail"]);
    expect(shelf[0].flagged).toBe(true);
    expect(shelf[1].flagged).toBe(false);
  });

  it("flagged rows sort by value; value picks cap at valuePicks, sorted desc", () => {
    const cards = [
      row({ scryfallId: "cheap-signed", signed: {}, prices: { usd: "1.00" } }),
      row({ scryfallId: "dear-signed", signed: {}, prices: { usd: "300.00" } }),
      ...[60, 90, 70, 80, 55, 65].map((v) => row({ scryfallId: `v${v}`, prices: { usd: String(v) } })),
    ];
    const shelf = buildShelf(cards, { valuePicks: 3 });
    expect(shelf.map((e) => e.row.scryfallId)).toEqual([
      "dear-signed", "cheap-signed", // all flagged, value-desc
      "v90", "v80", "v70",           // top 3 unflagged only
    ]);
  });

  it("wishlist rows never make the shelf as value picks (not owned treasure)", () => {
    const cards = [row({ scryfallId: "wish", wishlist: true, prices: { usd: "500.00" } })];
    expect(buildShelf(cards)).toEqual([]);
  });

  it("an all-bulk collection yields an empty shelf (it simply doesn't render)", () => {
    expect(buildShelf([row(), row(), row()])).toEqual([]);
    expect(buildShelf([])).toEqual([]);
    expect(buildShelf(undefined)).toEqual([]);
  });
});

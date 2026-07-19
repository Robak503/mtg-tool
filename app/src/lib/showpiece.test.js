/**
 * showpiece.test.js — the C5-P2.1 treasure predicate + shelf builder.
 * Pure functions; the shelf's RENDER is covered in collectionVaultUi.test.jsx.
 */
import { describe, it, expect } from "vitest";

import { isShowpiece, rowUnitValue, buildShelf, buildDailyShelf } from "./showpiece.js";

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

describe("buildDailyShelf — one big-dollar hero + provenance-first supporting, rotating daily", () => {
  const DAY = 86400000;
  const day = (n) => new Date(n * DAY + 1000); // mid-day n in epoch-day terms

  const cards = [
    row({ scryfallId: "chase-950", prices: { usd: "950.00" } }),
    row({ scryfallId: "chase-240", prices: { usd: "240.00" } }),
    row({ scryfallId: "signed-5", signed: { artist: "X" }, prices: { usd: "5.00" } }),
    row({ scryfallId: "altered-30", altered: true, prices: { usd: "30.00" } }),
    row({ scryfallId: "mid-60", prices: { usd: "60.00" } }),
    row({ scryfallId: "mid-25", prices: { usd: "25.00" } }),
    row({ scryfallId: "bulk-1", prices: { usd: "1.00" } }),
  ];

  it("hero is a top-value chase (price beats provenance for the big slot)", () => {
    const { hero } = buildDailyShelf(cards, { now: day(0) });
    // day 0 → chases[0] = the most expensive card, flags irrelevant for the hero slot
    expect(hero.row.scryfallId).toBe("chase-950");
  });

  it("supporting favors provenance over price and never re-seats the hero", () => {
    const { hero, supporting } = buildDailyShelf(cards, { now: day(0) });
    const ids = supporting.map((e) => e.row.scryfallId);
    expect(ids).toContain("signed-5");    // $5 signed beats $60 unflagged for a small slot
    expect(ids).toContain("altered-30");
    expect(ids).not.toContain(hero.row.scryfallId);
    expect(ids).not.toContain("bulk-1");  // under the support floor, unflagged
    expect(supporting.length).toBeLessThanOrEqual(4);
  });

  it("same day → the identical case (deterministic)", () => {
    const a = buildDailyShelf(cards, { now: day(7) });
    const b = buildDailyShelf(cards, { now: new Date(7 * DAY + 60_000) });
    expect(b.hero.row.scryfallId).toBe(a.hero.row.scryfallId);
    expect(b.supporting.map((e) => e.row.scryfallId)).toEqual(a.supporting.map((e) => e.row.scryfallId));
  });

  it("the hero SWAPS on the next day (rotates through the chase pool)", () => {
    const today = buildDailyShelf(cards, { now: day(0) });
    const tomorrow = buildDailyShelf(cards, { now: day(1) });
    expect(tomorrow.hero.row.scryfallId).not.toBe(today.hero.row.scryfallId);
  });

  it("thin collections degrade honestly — never padded, never fabricated", () => {
    const two = [row({ scryfallId: "a", prices: { usd: "80.00" } }), row({ scryfallId: "b", prices: { usd: "60.00" } })];
    const { hero, supporting } = buildDailyShelf(two, { now: day(0) });
    expect(hero.row.scryfallId).toBe("a");
    expect(supporting.map((e) => e.row.scryfallId)).toEqual(["b"]);
    expect(buildDailyShelf([], { now: day(0) })).toEqual({ hero: null, supporting: [] });
    expect(buildDailyShelf(undefined, { now: day(0) })).toEqual({ hero: null, supporting: [] });
  });

  it("wishlist rows never enter the case — not even provenance-flagged ones", () => {
    const wishful = [row({ scryfallId: "wish", wishlist: true, signed: {}, prices: { usd: "500.00" } })];
    expect(buildDailyShelf(wishful, { now: day(0) })).toEqual({ hero: null, supporting: [] });
  });

  it("bulk never headlines: below the hero floor, provenance takes the slot; pure bulk shows nothing", () => {
    const cheapTreasure = [
      row({ scryfallId: "signed-3", signed: {}, prices: { usd: "3.00" } }),
      row({ scryfallId: "bulk-2", prices: { usd: "2.00" } }),
    ];
    expect(buildDailyShelf(cheapTreasure, { now: day(0) }).hero.row.scryfallId).toBe("signed-3");
    const allBulk = [row({ scryfallId: "b1", prices: { usd: "2.00" } })];
    expect(buildDailyShelf(allBulk, { now: day(0) })).toEqual({ hero: null, supporting: [] });
  });
});

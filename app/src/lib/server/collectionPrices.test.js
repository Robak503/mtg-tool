/**
 * collectionPrices — snapshot building, compaction, and delta math.
 * Pure functions, synthetic data, deterministic clock.
 */

import { describe, expect, it } from "vitest";
import {
  todayStamp,
  parseHistory,
  serializeHistory,
  hasSnapshotForDate,
  buildSnapshotEntries,
  compactHistory,
  valueCollectionAtPrices,
  computeDeltas,
  cardPriceSeries,
} from "./collectionPrices.js";

function row(scryfallId, stacks, prices, opts = {}) {
  return {
    scryfallId,
    oracleId: opts.oracleId || `o-${scryfallId}`,
    name: opts.name || scryfallId,
    stacks,
    prices,
    wishlist: !!opts.wishlist,
  };
}

describe("todayStamp", () => {
  it("formats YYYY-MM-DD in UTC", () => {
    expect(todayStamp(new Date("2026-05-28T23:59:00Z"))).toBe("2026-05-28");
  });
});

describe("parse/serialize round-trip", () => {
  it("survives a round trip and skips malformed lines", () => {
    const entries = [
      { snappedAt: "2026-05-01", scryfallId: "a", usd: "1.00" },
      { snappedAt: "2026-05-02", scryfallId: "a", usd: "1.10" },
    ];
    const raw = serializeHistory(entries);
    expect(parseHistory(raw)).toEqual(entries);
    expect(parseHistory("garbage\n" + raw)).toEqual(entries);
    expect(parseHistory("")).toEqual([]);
  });
});

describe("hasSnapshotForDate", () => {
  it("detects an existing day", () => {
    const h = [{ snappedAt: "2026-05-01", scryfallId: "a" }];
    expect(hasSnapshotForDate(h, "2026-05-01")).toBe(true);
    expect(hasSnapshotForDate(h, "2026-05-02")).toBe(false);
  });
});

describe("buildSnapshotEntries", () => {
  it("emits one entry per owned printing, skipping wishlist and zero-qty", () => {
    const collection = {
      cards: [
        row("a", [{ finish: "nonfoil", quantity: 2 }], { usd: "3.00", usdFoil: "9.00" }),
        row("b", [{ finish: "foil", quantity: 0 }], { usd: "1.00" }),               // zero qty
        row("c", [{ finish: "nonfoil", quantity: 1 }], { usd: "5.00" }, { wishlist: true }), // wishlist
      ],
    };
    const entries = buildSnapshotEntries(collection, "2026-05-28", null);
    expect(entries).toEqual([
      { snappedAt: "2026-05-28", scryfallId: "a", usd: "3.00", usdFoil: "9.00", usdEtched: null },
    ]);
  });

  it("prefers the injected priceFor lookup over row.prices", () => {
    const collection = { cards: [row("a", [{ finish: "nonfoil", quantity: 1 }], { usd: "1.00" })] };
    const priceFor = () => ({ usd: "2.50", usdFoil: "7.00", usdEtched: null });
    const entries = buildSnapshotEntries(collection, "2026-05-28", priceFor);
    expect(entries[0].usd).toBe("2.50");
    expect(entries[0].usdFoil).toBe("7.00");
  });

  it("normalizes scryfall snake_case price keys from the printing index", () => {
    const collection = { cards: [row("a", [{ finish: "nonfoil", quantity: 1 }], {})] };
    const priceFor = () => ({ usd: "1.00", usd_foil: "4.00", usd_etched: "9.00" });
    const entries = buildSnapshotEntries(collection, "2026-05-28", priceFor);
    expect(entries[0]).toEqual({
      snappedAt: "2026-05-28", scryfallId: "a",
      usd: "1.00", usdFoil: "4.00", usdEtched: "9.00",
    });
  });
});

describe("compactHistory", () => {
  it("keeps recent entries daily and rolls up old ones to monthly-latest", () => {
    const now = new Date("2026-06-01T00:00:00Z");
    // cutoff = 2026-03-03 (90 days before)
    const history = [
      // old (before cutoff) — Jan has two entries for "a", keep the latest
      { snappedAt: "2026-01-05", scryfallId: "a", usd: "1.00" },
      { snappedAt: "2026-01-20", scryfallId: "a", usd: "1.20" },
      { snappedAt: "2026-02-10", scryfallId: "a", usd: "1.30" },
      // recent (after cutoff) — keep all
      { snappedAt: "2026-05-01", scryfallId: "a", usd: "2.00" },
      { snappedAt: "2026-05-15", scryfallId: "a", usd: "2.10" },
    ];
    const out = compactHistory(history, now);
    const stamps = out.map(e => e.snappedAt);
    // Jan collapses to the 2026-01-20 entry; Feb stays; both May entries stay
    expect(stamps).toEqual(["2026-01-20", "2026-02-10", "2026-05-01", "2026-05-15"]);
    expect(out.find(e => e.snappedAt === "2026-01-20").usd).toBe("1.20");
  });
});

describe("valueCollectionAtPrices", () => {
  it("values current holdings using a per-scryfallId price map", () => {
    const collection = {
      cards: [
        row("a", [{ finish: "nonfoil", quantity: 2 }, { finish: "foil", quantity: 1 }]),
        row("b", [{ finish: "nonfoil", quantity: 4 }]),
      ],
    };
    const priceMap = new Map([
      ["a", { usd: "1.00", usdFoil: "5.00" }],
      ["b", { usd: "0.50" }],
    ]);
    // a: 2*1 + 1*5 = 7 ; b: 4*0.5 = 2 ; total 9
    expect(valueCollectionAtPrices(collection, priceMap)).toBe(9);
  });

  it("ignores cards missing from the price map and wishlist rows", () => {
    const collection = {
      cards: [
        row("a", [{ finish: "nonfoil", quantity: 1 }]),
        row("missing", [{ finish: "nonfoil", quantity: 9 }]),
        row("w", [{ finish: "nonfoil", quantity: 1 }], null, { wishlist: true }),
      ],
    };
    const priceMap = new Map([
      ["a", { usd: "3.00" }],
      ["w", { usd: "100.00" }],
    ]);
    expect(valueCollectionAtPrices(collection, priceMap)).toBe(3);
  });
});

describe("computeDeltas", () => {
  const collection = { cards: [row("a", [{ finish: "nonfoil", quantity: 2 }])] };

  it("returns all-null when history is empty", () => {
    expect(computeDeltas(collection, [], new Date("2026-06-01T00:00:00Z")))
      .toEqual({ d30: null, d90: null, d365: null });
  });

  it("computes a 30-day delta from current holdings at past prices", () => {
    const now = new Date("2026-06-01T00:00:00Z");
    const history = [
      { snappedAt: "2026-05-01", scryfallId: "a", usd: "1.00" },  // ~31 days ago
      { snappedAt: "2026-06-01", scryfallId: "a", usd: "1.50" },  // today
    ];
    const d = computeDeltas(collection, history, now);
    // current = 2 * 1.50 = 3.00 ; 30d-ago (2026-05-01) = 2 * 1.00 = 2.00 ; delta +1.00
    expect(d.d30).toEqual({
      asOf: "2026-05-01",
      pastValue: 2,
      currentValue: 3,
      delta: 1,
    });
    // No snapshot 90+ days old
    expect(d.d90).toBeNull();
    expect(d.d365).toBeNull();
  });

  it("returns null for a lookback when only today's snapshot exists", () => {
    const now = new Date("2026-06-01T00:00:00Z");
    const history = [{ snappedAt: "2026-06-01", scryfallId: "a", usd: "1.50" }];
    expect(computeDeltas(collection, history, now)).toEqual({ d30: null, d90: null, d365: null });
  });
});

describe("cardPriceSeries", () => {
  const history = [
    { snappedAt: "2026-05-01", scryfallId: "a", usd: "1.00" },
    { snappedAt: "2026-05-03", scryfallId: "a", usd: "1.50" },
    { snappedAt: "2026-05-02", scryfallId: "a", usd: "1.20" }, // out of order
    { snappedAt: "2026-05-03", scryfallId: "a", usd: "1.60" }, // dup date → last wins
    { snappedAt: "2026-05-02", scryfallId: "b", usd: "9.00" }, // other card
    { snappedAt: "2026-05-04", scryfallId: "a", usd: null }, // non-numeric → skipped
  ];

  it("returns the card's series oldest→newest, one point per day (last write wins)", () => {
    expect(cardPriceSeries(history, "a")).toEqual([
      { snappedAt: "2026-05-01", usd: 1.0 },
      { snappedAt: "2026-05-02", usd: 1.2 },
      { snappedAt: "2026-05-03", usd: 1.6 },
    ]);
  });

  it("returns [] for an unknown card or missing id", () => {
    expect(cardPriceSeries(history, "zzz")).toEqual([]);
    expect(cardPriceSeries(history, null)).toEqual([]);
  });

  it("caps to the most recent maxPoints", () => {
    const long = Array.from({ length: 100 }, (_, i) => ({
      snappedAt: `2026-${String(i).padStart(3, "0")}`,
      scryfallId: "a",
      usd: String(i),
    }));
    const series = cardPriceSeries(long, "a", { maxPoints: 10 });
    expect(series).toHaveLength(10);
    expect(series[9].usd).toBe(99);
  });
});

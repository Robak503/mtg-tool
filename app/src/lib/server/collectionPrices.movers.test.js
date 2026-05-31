import { describe, expect, it } from "vitest";

import { computeCardMovers, buildExtraSnapshotEntries } from "./collectionPrices";

// A two-snapshot history: ~46 days ago + "today". With a 30-day window the
// older snapshot is the lookback (nearest on/before now-30d).
function history() {
  return [
    { snappedAt: "2026-04-15", scryfallId: "A", usd: "10.00" },
    { snappedAt: "2026-04-15", scryfallId: "B", usd: "20.00" },
    { snappedAt: "2026-04-15", scryfallId: "C", usd: "5.00" },
    { snappedAt: "2026-05-31", scryfallId: "A", usd: "15.00" }, // +50%
    { snappedAt: "2026-05-31", scryfallId: "B", usd: "10.00" }, // -50%
    { snappedAt: "2026-05-31", scryfallId: "C", usd: "5.00" },  // flat → excluded
    { snappedAt: "2026-05-31", scryfallId: "D", usd: "3.00" },  // no past → excluded
  ];
}
const NOW = new Date("2026-05-31T12:00:00Z");

describe("computeCardMovers", () => {
  it("computes %/$ change vs the lookback snapshot, sorted risers→fallers", () => {
    const movers = computeCardMovers(history(), null, NOW, 30);
    expect(movers.map(m => m.scryfallId)).toEqual(["A", "B"]);
    expect(movers[0]).toMatchObject({ scryfallId: "A", current: 15, past: 10, pctChange: 50, absChange: 5 });
    expect(movers[1]).toMatchObject({ scryfallId: "B", pctChange: -50, absChange: -10 });
  });

  it("restricts to the given scryfallId set", () => {
    const movers = computeCardMovers(history(), ["A"], NOW, 30);
    expect(movers).toHaveLength(1);
    expect(movers[0].scryfallId).toBe("A");
  });

  it("excludes flat cards and cards lacking a past price", () => {
    const ids = computeCardMovers(history(), null, NOW, 30).map(m => m.scryfallId);
    expect(ids).not.toContain("C");
    expect(ids).not.toContain("D");
  });

  it("returns [] when history doesn't span the window", () => {
    const oneDay = [{ snappedAt: "2026-05-31", scryfallId: "A", usd: "10" }];
    expect(computeCardMovers(oneDay, null, NOW, 30)).toEqual([]);
    expect(computeCardMovers([], null, NOW, 30)).toEqual([]);
  });
});

describe("buildExtraSnapshotEntries", () => {
  it("prices a target list, dedupes, and honors excludeIds", () => {
    const entries = buildExtraSnapshotEntries(
      [
        { scryfallId: "x", prices: { usd: "1.00", usdFoil: "2.00" } },
        { scryfallId: "x", prices: { usd: "9.99" } }, // dupe → dropped
        { scryfallId: "y", prices: { usd: null } },
        { scryfallId: "owned", prices: { usd: "5.00" } }, // excluded
      ],
      "2026-05-31",
      new Set(["owned"]),
    );
    expect(entries.map(e => e.scryfallId)).toEqual(["x", "y"]);
    expect(entries[0]).toMatchObject({ snappedAt: "2026-05-31", scryfallId: "x", usd: "1.00", usdFoil: "2.00" });
    expect(entries[1].usd).toBeNull();
  });
});

/**
 * priceAlerts — normalize, evaluate, and crossing logic.
 * Pure functions, synthetic data, fixed clock.
 */

import { describe, expect, it } from "vitest";
import {
  normalizeAlert,
  normalizeAlerts,
  isMet,
  evaluateAlerts,
  applyCrossings,
} from "./priceAlerts.js";

const NOW = "2026-05-31T00:00:00.000Z";

describe("normalizeAlert", () => {
  it("fills defaults and rounds the target", () => {
    expect(normalizeAlert({ scryfallId: "a", target: "12.345" }, NOW)).toEqual({
      scryfallId: "a",
      name: "",
      target: 12.35,
      direction: "below",
      createdAt: NOW,
      triggeredAt: null,
      lastPrice: null,
    });
  });

  it("keeps a valid above-direction and preserves crossing state", () => {
    const a = normalizeAlert(
      { scryfallId: "a", name: "Sol Ring", target: 5, direction: "above", createdAt: "2026-01-01", triggeredAt: NOW, lastPrice: "6" },
      NOW,
    );
    expect(a.direction).toBe("above");
    expect(a.createdAt).toBe("2026-01-01");
    expect(a.triggeredAt).toBe(NOW);
    expect(a.lastPrice).toBe(6);
  });

  it("rejects missing id / non-positive / unparseable targets", () => {
    expect(normalizeAlert({ target: 5 }, NOW)).toBeNull();
    expect(normalizeAlert({ scryfallId: "a", target: 0 }, NOW)).toBeNull();
    expect(normalizeAlert({ scryfallId: "a", target: -3 }, NOW)).toBeNull();
    expect(normalizeAlert({ scryfallId: "a", target: "x" }, NOW)).toBeNull();
  });

  it("falls back to 'below' for an unknown direction", () => {
    expect(normalizeAlert({ scryfallId: "a", target: 5, direction: "sideways" }, NOW).direction).toBe("below");
  });
});

describe("normalizeAlerts", () => {
  it("dedupes by scryfallId (first wins) and drops invalid entries", () => {
    const out = normalizeAlerts(
      { alerts: [
        { scryfallId: "a", target: 5 },
        { scryfallId: "a", target: 9 },   // dup → dropped
        { scryfallId: "b", target: 0 },   // invalid → dropped
        { scryfallId: "c", target: 3 },
      ] },
      NOW,
    );
    expect(out.version).toBe(1);
    expect(out.updatedAt).toBe(NOW);
    expect(out.alerts.map(a => [a.scryfallId, a.target])).toEqual([["a", 5], ["c", 3]]);
  });

  it("returns an empty list for a junk payload", () => {
    expect(normalizeAlerts(null, NOW).alerts).toEqual([]);
    expect(normalizeAlerts({}, NOW).alerts).toEqual([]);
  });
});

describe("isMet", () => {
  it("below fires at or under target", () => {
    const a = { direction: "below", target: 10 };
    expect(isMet(a, 9.99)).toBe(true);
    expect(isMet(a, 10)).toBe(true);
    expect(isMet(a, 10.01)).toBe(false);
  });
  it("above fires at or over target", () => {
    const a = { direction: "above", target: 10 };
    expect(isMet(a, 10)).toBe(true);
    expect(isMet(a, 12)).toBe(true);
    expect(isMet(a, 9.99)).toBe(false);
  });
  it("a null/unparseable price never meets", () => {
    expect(isMet({ direction: "below", target: 10 }, null)).toBe(false);
    expect(isMet({ direction: "below", target: 10 }, "n/a")).toBe(false);
  });
});

describe("evaluateAlerts", () => {
  it("annotates each alert with current price + met", () => {
    const alerts = [
      { scryfallId: "a", direction: "below", target: 10 },
      { scryfallId: "b", direction: "above", target: 4 },
      { scryfallId: "c", direction: "below", target: 1 },
    ];
    const prices = { a: "8.00", b: "5.00", c: "2.00" };
    const out = evaluateAlerts(alerts, (id) => prices[id] ?? null);
    expect(out.map(a => [a.scryfallId, a.currentPrice, a.met])).toEqual([
      ["a", 8, true],
      ["b", 5, true],
      ["c", 2, false],
    ]);
  });
});

describe("applyCrossings", () => {
  const base = [
    { scryfallId: "a", direction: "below", target: 10, triggeredAt: null, lastPrice: null },
    { scryfallId: "b", direction: "below", target: 10, triggeredAt: NOW, lastPrice: 9 },
  ];

  it("stamps triggeredAt on a newly-met alert and reports it as newlyTriggered", () => {
    const { alerts, newlyTriggered } = applyCrossings(base, () => "8.00", NOW);
    expect(alerts[0].triggeredAt).toBe(NOW);
    expect(alerts[0].lastPrice).toBe(8);
    expect(newlyTriggered.map(a => a.scryfallId)).toEqual(["a"]);
  });

  it("re-arms (clears triggeredAt) when a previously-triggered alert is no longer met", () => {
    const { alerts, newlyTriggered } = applyCrossings(base, () => "11.00", NOW);
    expect(alerts[0].triggeredAt).toBeNull(); // never met → stays armed
    expect(alerts[1].triggeredAt).toBeNull(); // was triggered, now above target → re-armed
    expect(newlyTriggered).toEqual([]);
  });

  it("does not re-fire an already-triggered alert that stays met", () => {
    const { newlyTriggered } = applyCrossings(base, () => "9.00", NOW);
    // a (8<=10 wait price 9): newly met → fires; b already triggered & still met → no re-fire
    expect(newlyTriggered.map(a => a.scryfallId)).toEqual(["a"]);
  });

  it("leaves a triggered alert untouched when the price is unavailable (no spurious re-arm)", () => {
    const { alerts, newlyTriggered } = applyCrossings(base, () => null, NOW);
    // b was triggered with lastPrice 9 — a missing price must not re-arm it or null lastPrice
    expect(alerts[1].triggeredAt).toBe(NOW);
    expect(alerts[1].lastPrice).toBe(9);
    // a was never triggered and has no price — stays armed, nothing fires
    expect(alerts[0].triggeredAt).toBeNull();
    expect(newlyTriggered).toEqual([]);
  });

  it("refreshes lastPrice even when met-state is unchanged", () => {
    const { alerts } = applyCrossings(base, () => "9.50", NOW);
    expect(alerts[1].lastPrice).toBe(9.5);
    expect(alerts[1].triggeredAt).toBe(NOW); // still met, still triggered
  });
});

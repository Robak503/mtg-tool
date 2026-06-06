/**
 * ptPrimitive.test.js — the printed+counters P/T primitive (Phase-7 PR-9).
 * The cycle-breaking leaf both gameState and layers import.
 */

import { describe, it, expect } from "vitest";
import {
  printedPower,
  printedToughness,
  counterPtDelta,
  printedPowerWithCounters,
  printedToughnessWithCounters,
  hasPtCounters,
} from "./ptPrimitive.js";

function perm(power, toughness, counters = {}) {
  return { id: "p1", card: { name: "X", power, toughness }, counters };
}

describe("printed P/T", () => {
  it("reads numeric printed values", () => {
    expect(printedPower(perm(3, 4))).toBe(3);
    expect(printedToughness(perm(3, 4))).toBe(4);
  });
  it("reads non-numeric ('*') and missing as 0", () => {
    expect(printedPower(perm("*", "*"))).toBe(0);
    expect(printedToughness(perm("*", "*"))).toBe(0);
    expect(printedPower({})).toBe(0);
    expect(printedPower(null)).toBe(0);
  });
});

describe("counter delta (CR 613.4c)", () => {
  it("is +1/+1 minus -1/-1", () => {
    expect(counterPtDelta(perm(2, 2, { "+1/+1": 3 }))).toBe(3);
    expect(counterPtDelta(perm(2, 2, { "-1/-1": 2 }))).toBe(-2);
    expect(counterPtDelta(perm(2, 2, { "+1/+1": 3, "-1/-1": 1 }))).toBe(2);
    expect(counterPtDelta(perm(2, 2))).toBe(0);
  });
  it("combined accessors add the delta to printed", () => {
    const p = perm(2, 2, { "+1/+1": 1 });
    expect(printedPowerWithCounters(p)).toBe(3);
    expect(printedToughnessWithCounters(p)).toBe(3);
  });
  it("can go negative below 0 toughness", () => {
    const p = perm(1, 1, { "-1/-1": 3 });
    expect(printedToughnessWithCounters(p)).toBe(-2);
  });
  it("hasPtCounters detects any +1/+1 or -1/-1", () => {
    expect(hasPtCounters(perm(2, 2))).toBe(false);
    expect(hasPtCounters(perm(2, 2, { "+1/+1": 1 }))).toBe(true);
    expect(hasPtCounters(perm(2, 2, { "-1/-1": 1 }))).toBe(true);
    expect(hasPtCounters(perm(2, 2, { stun: 1 }))).toBe(false);
  });
});

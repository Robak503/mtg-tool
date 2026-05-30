import { describe, it, expect } from "vitest";

import { adjustStacks, stackTotal } from "./collectionStacks.js";

describe("stackTotal", () => {
  it("sums quantities across stacks", () => {
    expect(stackTotal([{ finish: "nonfoil", quantity: 2 }, { finish: "foil", quantity: 1 }])).toBe(3);
  });
  it("treats missing/invalid quantities as zero", () => {
    expect(stackTotal(null)).toBe(0);
    expect(stackTotal([{ finish: "nonfoil" }])).toBe(0);
  });
});

describe("adjustStacks", () => {
  it("increments the first stack", () => {
    expect(adjustStacks([{ finish: "nonfoil", quantity: 1, condition: "NM" }], +1))
      .toEqual([{ finish: "nonfoil", quantity: 2, condition: "NM" }]);
  });

  it("creates a nonfoil stack when incrementing an empty row (wishlist acquire)", () => {
    expect(adjustStacks([], +1)).toEqual([{ finish: "nonfoil", quantity: 1, condition: "NM" }]);
  });

  it("decrements the FIRST non-empty stack, leaving later ones intact", () => {
    expect(adjustStacks(
      [{ finish: "nonfoil", quantity: 2, condition: "NM" }, { finish: "foil", quantity: 1, condition: "NM" }],
      -1,
    )).toEqual([
      { finish: "nonfoil", quantity: 1, condition: "NM" },
      { finish: "foil", quantity: 1, condition: "NM" },
    ]);
  });

  it("+ then - round-trips a multi-finish row (no foil -> nonfoil corruption)", () => {
    const start = [
      { finish: "nonfoil", quantity: 2, condition: "NM" },
      { finish: "foil", quantity: 1, condition: "NM" },
    ];
    const back = adjustStacks(adjustStacks(start, +1), -1);
    expect(back).toEqual(start);
  });

  it("drains a multi-finish row front-to-back, then deletes", () => {
    let s = [
      { finish: "nonfoil", quantity: 1, condition: "NM" },
      { finish: "foil", quantity: 1, condition: "NM" },
    ];
    s = adjustStacks(s, -1); // nonfoil 1 -> 0, dropped
    expect(s).toEqual([{ finish: "foil", quantity: 1, condition: "NM" }]);
    s = adjustStacks(s, -1); // foil 1 -> 0, dropped => empty => delete
    expect(s).toEqual([]);
  });

  it("drops a stack that hits zero", () => {
    expect(adjustStacks([{ finish: "foil", quantity: 1, condition: "NM" }], -1)).toEqual([]);
  });

  it("returns empty (=> delete row) when the last copy is removed", () => {
    expect(stackTotal(adjustStacks([{ finish: "nonfoil", quantity: 1 }], -1))).toBe(0);
  });

  it("is a no-op decrement on an already-empty row", () => {
    expect(adjustStacks([], -1)).toEqual([]);
  });

  it("does not mutate the input array or its stacks", () => {
    const input = [{ finish: "nonfoil", quantity: 1, condition: "NM" }];
    adjustStacks(input, +1);
    expect(input[0].quantity).toBe(1);
  });
});

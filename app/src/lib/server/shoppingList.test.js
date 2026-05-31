/**
 * Tests for shoppingList.js (G2) — the buy-list serializers over
 * deckCostToFinish().missing.
 */

import { describe, expect, it } from "vitest";

import { buildShoppingList, shoppingListText, shoppingListCsv } from "./shoppingList.js";

const MISSING = [
  { name: "Mana Crypt", need: 1, unitPrice: 60, lineCost: 60, resolved: true },
  { name: "Fabricate", need: 2, unitPrice: 0.5, lineCost: 1, resolved: true },
  { name: "Some Unmatched Card", need: 1, unitPrice: null, lineCost: null, resolved: false },
];

describe("buildShoppingList", () => {
  it("totals quantities and cost and tracks unpriced cards", () => {
    const list = buildShoppingList(MISSING);
    expect(list.entries).toHaveLength(3);
    expect(list.totalCards).toBe(4); // 1 + 2 + 1
    expect(list.totalCost).toBe(61); // 60 + 1
    expect(list.unpricedCount).toBe(1);
  });

  it("can drop unresolved cards", () => {
    const list = buildShoppingList(MISSING, { excludeUnresolved: true });
    expect(list.entries).toHaveLength(2);
    expect(list.entries.find(e => e.name === "Some Unmatched Card")).toBeUndefined();
  });

  it("handles an empty / complete deck", () => {
    const list = buildShoppingList([]);
    expect(list.entries).toEqual([]);
    expect(list.totalCards).toBe(0);
    expect(list.totalCost).toBe(0);
  });
});

describe("shoppingListText", () => {
  it("emits a paste-ready decklist (N Name)", () => {
    const text = shoppingListText(buildShoppingList(MISSING));
    expect(text).toContain("1 Mana Crypt");
    expect(text).toContain("2 Fabricate");
  });

  it("is empty for an empty list", () => {
    expect(shoppingListText(buildShoppingList([]))).toBe("");
  });
});

describe("shoppingListCsv", () => {
  it("emits a header + quantity/price columns and escapes commas", () => {
    const list = buildShoppingList([{ name: "Kess, Dissident Mage", need: 1, unitPrice: 3.5, lineCost: 3.5, resolved: true }]);
    const csv = shoppingListCsv(list);
    expect(csv.split("\n")[0]).toBe("Quantity,Name,Unit Price,Line Cost");
    expect(csv).toContain('"Kess, Dissident Mage"');
    expect(csv).toContain("1,");
  });
});

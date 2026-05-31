/**
 * Tests for collectionExport.js (G3). The headline guarantee: a CSV export
 * round-trips back through the app's own importer (parseCollectionCsv),
 * including comma-in-name escaping.
 */

import { describe, expect, it } from "vitest";

import { collectionToJson, collectionToCsv } from "./collectionExport.js";
import { parseCollectionCsv } from "./collectionCsvImport.js";

const COLLECTION = {
  version: 1,
  cards: [
    { name: "Kess, Dissident Mage", setCode: "c17", wishlist: false, stacks: [{ finish: "nonfoil", quantity: 1, condition: "NM" }] },
    { name: "Sol Ring", setCode: "c21", wishlist: false, stacks: [{ finish: "foil", quantity: 2, condition: "LP" }] },
    { name: "Future Pickup", setCode: "x", wishlist: true, stacks: [{ finish: "nonfoil", quantity: 0 }] },
    { name: "Zero Qty", setCode: "y", wishlist: false, stacks: [{ finish: "nonfoil", quantity: 0 }] },
  ],
};

describe("collectionToCsv", () => {
  it("emits a Deckbox-style header and one row per owned stack", () => {
    const csv = collectionToCsv(COLLECTION);
    const lines = csv.trim().split("\n");
    expect(lines[0]).toBe("Count,Name,Edition,Condition,Foil,Language");
    // 2 owned rows (wishlist + zero-qty excluded)
    expect(lines).toHaveLength(3);
  });

  it("quotes names containing commas", () => {
    const csv = collectionToCsv(COLLECTION);
    expect(csv).toContain('"Kess, Dissident Mage"');
  });

  it("round-trips through the app's own CSV importer", () => {
    const csv = collectionToCsv(COLLECTION);
    const parsed = parseCollectionCsv(csv);
    expect(parsed.format).toBe("deckbox");
    expect(parsed.errors).toEqual([]);
    expect(parsed.entries).toHaveLength(2);

    const kess = parsed.entries.find(e => e.name === "Kess, Dissident Mage");
    expect(kess).toMatchObject({ count: 1, setCode: "c17", finish: "nonfoil", condition: "NM" });

    const sol = parsed.entries.find(e => e.name === "Sol Ring");
    expect(sol).toMatchObject({ count: 2, setCode: "c21", finish: "foil", condition: "LP" });
  });

  it("handles an empty collection (header only)", () => {
    expect(collectionToCsv({ cards: [] }).trim()).toBe("Count,Name,Edition,Condition,Foil,Language");
    expect(collectionToCsv(null).trim()).toBe("Count,Name,Edition,Condition,Foil,Language");
  });
});

describe("collectionToJson", () => {
  it("wraps the full collection losslessly with metadata", () => {
    const json = JSON.parse(collectionToJson(COLLECTION, "2026-05-31T00:00:00.000Z"));
    expect(json.kind).toBe("mtg-tool-collection");
    expect(json.version).toBe(1);
    expect(json.exportedAt).toBe("2026-05-31T00:00:00.000Z");
    expect(json.cardCount).toBe(4);
    // Wishlist + tags + stacks are preserved (lossless).
    expect(json.cards.find(c => c.name === "Future Pickup").wishlist).toBe(true);
  });
});

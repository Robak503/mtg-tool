/**
 * collectionCsvImport — parsing + matching tests.
 *
 * The matchEntries / mergeImportRows tests use a tmpdir printings-index
 * fixture so the printingIndex module has data to look up against.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import {
  parseCsv,
  detectFormat,
  normalizeCondition,
  normalizeFinish,
  parseCollectionCsv,
  mergeImportRows,
  diffImport,
  matchEntries,
} from "./collectionCsvImport.js";
import { resetPrintingIndexCache } from "./printingIndex.js";

describe("parseCsv", () => {
  it("parses a simple CSV", () => {
    const rows = parseCsv("a,b,c\n1,2,3");
    expect(rows).toEqual([["a", "b", "c"], ["1", "2", "3"]]);
  });

  it("handles quoted fields with embedded commas", () => {
    const rows = parseCsv('a,b\n"hello, world",2');
    expect(rows).toEqual([["a", "b"], ["hello, world", "2"]]);
  });

  it("handles escaped quotes inside quoted fields", () => {
    const rows = parseCsv('a,b\n"say ""hi""",2');
    expect(rows).toEqual([["a", "b"], ['say "hi"', "2"]]);
  });

  it("handles CRLF line endings", () => {
    const rows = parseCsv("a,b\r\n1,2\r\n");
    expect(rows).toEqual([["a", "b"], ["1", "2"]]);
  });

  it("strips a UTF-8 BOM from the first cell", () => {
    const rows = parseCsv("﻿Count,Name\n1,Sol Ring");
    expect(rows[0][0]).toBe("Count");
  });
});

describe("detectFormat", () => {
  it("identifies Moxfield via Tags + Last Modified columns", () => {
    expect(detectFormat(["Count", "Name", "Edition", "Condition", "Language", "Foil", "Tags", "Last Modified"]))
      .toBe("moxfield");
  });
  it("identifies Deckbox by absence of Tags/Last Modified", () => {
    expect(detectFormat(["Count", "Name", "Edition", "Condition", "Language", "Foil", "Signed"]))
      .toBe("deckbox");
  });
  it("returns 'unknown' for unrelated CSVs", () => {
    expect(detectFormat(["foo", "bar"])).toBe("unknown");
  });
});

describe("normalizeCondition", () => {
  it("maps Deckbox long-form to short codes", () => {
    expect(normalizeCondition("Near Mint")).toBe("NM");
    expect(normalizeCondition("Good")).toBe("LP");
    expect(normalizeCondition("Played")).toBe("MP");
    expect(normalizeCondition("Heavily Played")).toBe("HP");
    expect(normalizeCondition("Poor")).toBe("DMG");
  });
  it("maps Moxfield short codes to themselves", () => {
    expect(normalizeCondition("NM")).toBe("NM");
    expect(normalizeCondition("LP")).toBe("LP");
    expect(normalizeCondition("dmg")).toBe("DMG");
  });
  it("defaults to NM for blank or unknown values", () => {
    expect(normalizeCondition("")).toBe("NM");
    expect(normalizeCondition("???")).toBe("NM");
  });
});

describe("normalizeFinish", () => {
  it("maps foil-column values", () => {
    expect(normalizeFinish("foil")).toBe("foil");
    expect(normalizeFinish("etched")).toBe("etched");
    expect(normalizeFinish("non-foil")).toBe("nonfoil");
    expect(normalizeFinish("")).toBe("nonfoil");
  });
});

describe("parseCollectionCsv — Deckbox", () => {
  const DECKBOX_CSV = `Count,Name,Edition,Condition,Language,Foil,Signed,Artist Proof
4,Sol Ring,Commander 2021,Near Mint,English,,,,
1,"Counterspell",Modern Horizons 3,Lightly Played,English,foil,,,`;

  it("parses Deckbox format and emits normalized entries", () => {
    const result = parseCollectionCsv(DECKBOX_CSV);
    expect(result.format).toBe("deckbox");
    expect(result.errors).toEqual([]);
    expect(result.entries).toHaveLength(2);

    expect(result.entries[0]).toEqual({
      count: 4,
      name: "Sol Ring",
      setCode: "Commander 2021",
      condition: "NM",
      finish: "nonfoil",
      language: "English",
      sourceLineNumber: 2,
    });
    expect(result.entries[1]).toMatchObject({
      count: 1,
      name: "Counterspell",
      condition: "LP",
      finish: "foil",
    });
  });
});

describe("parseCollectionCsv — Moxfield", () => {
  const MOXFIELD_CSV = `"Count","Name","Edition","Condition","Language","Foil","Tags","Last Modified"
"2","Atraxa, Praetors' Voice","CMR","NM","English","foil","","2025-12-01"
"1","Esper Sentinel","mh2","NM","English","etched","commander-only","2026-01-15"`;

  it("parses Moxfield format with quoted fields", () => {
    const result = parseCollectionCsv(MOXFIELD_CSV);
    expect(result.format).toBe("moxfield");
    expect(result.errors).toEqual([]);
    expect(result.entries).toHaveLength(2);
    expect(result.entries[0].name).toBe("Atraxa, Praetors' Voice");
    expect(result.entries[0].finish).toBe("foil");
    expect(result.entries[1].finish).toBe("etched");
  });
});

describe("parseCollectionCsv — error rows", () => {
  it("reports rows with missing name + skips them", () => {
    const csv = `Count,Name,Edition,Condition,Language,Foil
1,,,NM,English,
2,Sol Ring,C21,NM,English,`;
    const result = parseCollectionCsv(csv);
    expect(result.entries).toHaveLength(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].message).toMatch(/missing card name/i);
  });

  it("reports rows with invalid count + skips them", () => {
    const csv = `Count,Name,Edition,Condition,Language,Foil
abc,Sol Ring,C21,NM,English,
1,Counterspell,MH3,NM,English,`;
    const result = parseCollectionCsv(csv);
    expect(result.entries).toHaveLength(1);
    expect(result.errors).toHaveLength(1);
  });

  it("returns 'unknown' format and an error when header is unrecognized", () => {
    const result = parseCollectionCsv("foo,bar\n1,2");
    expect(result.format).toBe("unknown");
    expect(result.errors[0].message).toMatch(/unrecognized/i);
  });
});

describe("mergeImportRows", () => {
  function makeImportRow(scryfallId, finish, qty) {
    return {
      scryfallId,
      oracleId: `oracle-${scryfallId}`,
      name: `Card ${scryfallId}`,
      setCode: "tst",
      collectorNumber: "1",
      stacks: [{ finish, quantity: qty, condition: "NM" }],
      addedAt: "2026-05-27T00:00:00Z",
      notes: "",
      wishlist: false,
    };
  }

  it("appends new rows", () => {
    const result = mergeImportRows({ cards: [] }, [
      makeImportRow("a", "nonfoil", 2),
      makeImportRow("b", "foil", 1),
    ]);
    expect(result.stats).toEqual({ added: 2, mergedCount: 0, removed: 0 });
    expect(result.merged.cards).toHaveLength(2);
  });

  it("merges by scryfallId + sums stacks by finish", () => {
    const existing = {
      cards: [{
        scryfallId: "a",
        oracleId: "oracle-a",
        name: "Card a",
        stacks: [{ finish: "nonfoil", quantity: 2, condition: "NM" }],
        wishlist: false,
      }],
    };
    const result = mergeImportRows(existing, [
      makeImportRow("a", "nonfoil", 1),
      makeImportRow("a", "foil", 1),
    ]);
    expect(result.stats).toEqual({ added: 0, mergedCount: 2, removed: 0 });
    expect(result.merged.cards).toHaveLength(1);
    const stacks = result.merged.cards[0].stacks;
    expect(stacks.find(s => s.finish === "nonfoil").quantity).toBe(3);
    expect(stacks.find(s => s.finish === "foil").quantity).toBe(1);
  });

  it("flips wishlist=false when import gives an existing wishlist row quantity", () => {
    const existing = {
      cards: [{
        scryfallId: "a",
        oracleId: "oracle-a",
        name: "Card a",
        stacks: [{ finish: "foil", quantity: 0, condition: null }],
        wishlist: true,
      }],
    };
    const result = mergeImportRows(existing, [makeImportRow("a", "foil", 1)]);
    expect(result.merged.cards[0].wishlist).toBe(false);
    expect(result.merged.cards[0].stacks[0].quantity).toBe(1);
  });

  const ownedColl = () => ({
    cards: [
      { scryfallId: "a", oracleId: "oracle-a", name: "Card a", stacks: [{ finish: "nonfoil", quantity: 2, condition: "NM" }], wishlist: false },
      { scryfallId: "b", oracleId: "oracle-b", name: "Card b", stacks: [{ finish: "nonfoil", quantity: 1, condition: "NM" }], wishlist: false },
    ],
  });

  it("add-only leaves an existing finish's quantity untouched but adds a new finish", () => {
    const result = mergeImportRows(ownedColl(), [makeImportRow("a", "nonfoil", 5), makeImportRow("a", "foil", 1)], "add-only");
    const stacks = result.merged.cards.find(c => c.scryfallId === "a").stacks;
    expect(stacks.find(s => s.finish === "nonfoil").quantity).toBe(2); // untouched
    expect(stacks.find(s => s.finish === "foil").quantity).toBe(1);    // new finish added
  });

  it("replace sets an existing printing's stacks to exactly the import's", () => {
    const result = mergeImportRows(ownedColl(), [makeImportRow("a", "nonfoil", 5)], "replace");
    const card = result.merged.cards.find(c => c.scryfallId === "a");
    expect(card.stacks).toEqual([{ finish: "nonfoil", quantity: 5, condition: "NM" }]);
    // a card not in the import is untouched
    expect(result.merged.cards.find(c => c.scryfallId === "b").stacks[0].quantity).toBe(1);
  });

  it("reconcile replaces present cards and removes owned cards absent from the import", () => {
    const result = mergeImportRows(ownedColl(), [makeImportRow("a", "nonfoil", 3)], "reconcile");
    expect(result.merged.cards.find(c => c.scryfallId === "a").stacks[0].quantity).toBe(3);
    expect(result.merged.cards.find(c => c.scryfallId === "b")).toBeUndefined(); // marked absent
    expect(result.stats.removed).toBe(1);
  });

  it("reconcile never drops wishlist rows", () => {
    const coll = { cards: [
      { scryfallId: "w", oracleId: "oracle-w", name: "Wish", stacks: [{ finish: "nonfoil", quantity: 0, condition: null }], wishlist: true },
    ] };
    const result = mergeImportRows(coll, [makeImportRow("a", "nonfoil", 1)], "reconcile");
    expect(result.merged.cards.find(c => c.scryfallId === "w")).toBeDefined();
  });
});

describe("diffImport", () => {
  const row = (id, finish, qty, name) => ({ scryfallId: id, oracleId: `o-${id}`, name: name || `Card ${id}`, stacks: [{ finish, quantity: qty, condition: "NM" }] });
  const coll = () => ({ cards: [
    { scryfallId: "a", name: "Card a", stacks: [{ finish: "nonfoil", quantity: 2 }], wishlist: false },
    { scryfallId: "b", name: "Card b", stacks: [{ finish: "nonfoil", quantity: 1 }], wishlist: false },
  ] });

  it("classifies new / changed / unchanged under merge", () => {
    const d = diffImport(coll(), [row("a", "nonfoil", 1), row("c", "foil", 1, "Card c")], "merge");
    expect(d.newCards).toEqual([{ name: "Card c", qty: 1 }]);
    expect(d.changed).toEqual([{ name: "Card a", from: 2, to: 3 }]); // 2 + 1
    expect(d.removed).toEqual([]);
  });

  it("reports removals only under reconcile", () => {
    const merge = diffImport(coll(), [row("a", "nonfoil", 2)], "merge");
    expect(merge.removed).toEqual([]);
    const reconcile = diffImport(coll(), [row("a", "nonfoil", 2)], "reconcile");
    expect(reconcile.removed).toEqual([{ name: "Card b", qty: 1 }]);
  });

  it("add-only shows no change for an existing finish", () => {
    const d = diffImport(coll(), [row("a", "nonfoil", 9)], "add-only");
    expect(d.changed).toEqual([]);
    expect(d.unchangedCount).toBe(1);
  });
});

// ──────────────────────────────────────────────────────────────────────
// matchEntries — exercises printingIndex against a tmpdir fixture.
// ──────────────────────────────────────────────────────────────────────

const FIXTURE = {
  generatedAt: "2026-05-27T00:00:00Z",
  count: 2,
  cards: [
    {
      id: "sol-c21",
      oracleId: "oracle-sol",
      name: "Sol Ring",
      set: "c21",
      collectorNumber: "256",
      finishes: ["nonfoil", "foil"],
      layout: "normal",
      artCropUrl: "https://example.com/sol.jpg",
      prices: { usd: "3.50", usdFoil: "12.00", usdEtched: null },
    },
    {
      id: "counter-mh3",
      oracleId: "oracle-counter",
      name: "Counterspell",
      set: "mh3",
      collectorNumber: "42",
      finishes: ["nonfoil"],
      layout: "normal",
      artCropUrl: null,
      prices: { usd: "1.00", usdFoil: null, usdEtched: null },
    },
  ],
};

describe("matchEntries", () => {
  let tmpDir, originalCwd;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "csv-match-"));
    await fs.mkdir(path.join(tmpDir, "data", "scryfall-bulk"), { recursive: true });
    await fs.writeFile(
      path.join(tmpDir, "data", "scryfall-bulk", "printings-index.json"),
      JSON.stringify(FIXTURE),
      "utf8",
    );
    originalCwd = process.cwd();
    process.chdir(tmpDir);
    // Rebuild the printings index from this tmpdir fixture. We use the
    // module's explicit cache reset rather than a cache-busting dynamic
    // import: `import("...?bust=" + Math.random())` spawned a fresh module
    // graph per call that Vitest couldn't settle, hanging the worker (and
    // stalling the whole suite at the 300s watchdog).
    resetPrintingIndexCache();
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    resetPrintingIndexCache();
  });

  it("matches entries against bundled printings", () => {
    const result = matchEntries([
      { name: "Sol Ring", setCode: "c21", finish: "nonfoil", count: 2, condition: "NM" },
      { name: "Counterspell", setCode: "mh3", finish: "nonfoil", count: 1, condition: "NM" },
    ]);
    expect(result.matched).toHaveLength(2);
    expect(result.unmatched).toEqual([]);
    expect(result.matched[0].row.scryfallId).toBe("sol-c21");
    expect(result.matched[0].row.stacks[0].quantity).toBe(2);
  });

  it("falls back to any-set match when set doesn't match", () => {
    const result = matchEntries([
      { name: "Sol Ring", setCode: "lea", finish: "nonfoil", count: 1, condition: "NM" },
    ]);
    expect(result.matched).toHaveLength(1);
    expect(result.matched[0].row.scryfallId).toBe("sol-c21");
  });

  it("reports unmatched entries", () => {
    const result = matchEntries([
      { name: "Made Up Card", setCode: "xyz", finish: "nonfoil", count: 1, condition: "NM" },
    ]);
    expect(result.matched).toEqual([]);
    expect(result.unmatched).toHaveLength(1);
    expect(result.unmatched[0].name).toBe("Made Up Card");
  });
});

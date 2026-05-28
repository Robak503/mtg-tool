/**
 * printingIndex — load + lookup over a tiny fixture printings-index.json.
 *
 * Uses process.chdir(tmpdir) + writes a fixture so we don't depend on
 * the real 17 MB bundled index. Matches paths.test.js pattern.
 */

import { describe, expect, it, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

let workDir;
let originalCwd;

const FIXTURE = {
  generatedAt: "2026-05-27T00:00:00Z",
  sourceFile: "test",
  sourceCount: 3,
  count: 3,
  cards: [
    {
      id: "scry-1",
      oracleId: "oracle-sol-ring",
      name: "Sol Ring",
      set: "c21",
      collectorNumber: "256",
      finishes: ["nonfoil", "foil"],
      layout: "normal",
      artCropUrl: "https://example.com/sol.jpg",
      prices: { usd: "3.50", usdFoil: "12.00", usdEtched: null },
    },
    {
      id: "scry-2",
      oracleId: "oracle-counter",
      name: "Counterspell",
      set: "mh3",
      collectorNumber: "42",
      finishes: ["nonfoil"],
      layout: "normal",
      artCropUrl: "https://example.com/counter.jpg",
      prices: { usd: "1.00", usdFoil: null, usdEtched: null },
    },
    {
      id: "scry-3",
      oracleId: "oracle-delver",
      name: "Delver of Secrets",
      set: "isd",
      collectorNumber: "51",
      finishes: ["nonfoil", "foil"],
      layout: "transform",
      artCropUrl: "https://example.com/delver.jpg",
      prices: { usd: "0.50", usdFoil: null, usdEtched: null },
    },
  ],
};

beforeEach(async () => {
  workDir = await fs.mkdtemp(path.join(os.tmpdir(), "printing-index-"));
  await fs.mkdir(path.join(workDir, "data", "scryfall-bulk"), { recursive: true });
  await fs.writeFile(
    path.join(workDir, "data", "scryfall-bulk", "printings-index.json"),
    JSON.stringify(FIXTURE),
    "utf8",
  );
  originalCwd = process.cwd();
  process.chdir(workDir);
});

afterEach(async () => {
  process.chdir(originalCwd);
  await fs.rm(workDir, { recursive: true, force: true });
});

async function loadIndex() {
  return import("./printingIndex.js?bust=" + Math.random());
}

describe("lookupBySetCollector", () => {
  it("returns the matching row for exact key", async () => {
    const { lookupBySetCollector } = await loadIndex();
    const row = lookupBySetCollector("c21", "256");
    expect(row).toBeDefined();
    expect(row.name).toBe("Sol Ring");
    expect(row.id).toBe("scry-1");
  });

  it("lowercases the set code (case-insensitive CSV match)", async () => {
    const { lookupBySetCollector } = await loadIndex();
    const row = lookupBySetCollector("C21", "256");
    expect(row).toBeDefined();
    expect(row.name).toBe("Sol Ring");
  });

  it("returns null on miss", async () => {
    const { lookupBySetCollector } = await loadIndex();
    expect(lookupBySetCollector("nope", "1")).toBeNull();
    expect(lookupBySetCollector("c21", "9999")).toBeNull();
  });

  it("returns null for missing inputs", async () => {
    const { lookupBySetCollector } = await loadIndex();
    expect(lookupBySetCollector("", "1")).toBeNull();
    expect(lookupBySetCollector("c21", "")).toBeNull();
    expect(lookupBySetCollector(null, null)).toBeNull();
  });
});

describe("lookupById", () => {
  it("returns the row by scryfallId", async () => {
    const { lookupById } = await loadIndex();
    const row = lookupById("scry-2");
    expect(row).toBeDefined();
    expect(row.name).toBe("Counterspell");
  });

  it("returns null on miss", async () => {
    const { lookupById } = await loadIndex();
    expect(lookupById("nope")).toBeNull();
    expect(lookupById(null)).toBeNull();
    expect(lookupById("")).toBeNull();
  });
});

describe("printingIndexStats", () => {
  it("returns count + generatedAt", async () => {
    const { printingIndexStats } = await loadIndex();
    const stats = printingIndexStats();
    expect(stats.count).toBe(3);
    expect(stats.generatedAt).toBe("2026-05-27T00:00:00Z");
  });
});

describe("missing index file", () => {
  it("throws with a helpful build hint", async () => {
    // Wipe the fixture
    await fs.rm(
      path.join(workDir, "data", "scryfall-bulk", "printings-index.json"),
      { force: true },
    );
    const { lookupById, resetPrintingIndexCache } = await loadIndex();
    resetPrintingIndexCache();

    expect(() => lookupById("scry-1")).toThrow(/printings-index.json/);
    expect(() => lookupById("scry-1")).toThrow(/build:printings-index/);
  });
});

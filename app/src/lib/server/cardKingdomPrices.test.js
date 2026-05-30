/**
 * cardKingdomPrices — load + lookup over a tiny fixture cardkingdom-prices.json.
 * Uses process.chdir(tmpdir) + cache-busted imports (matches printingIndex.test.js).
 */

import { describe, expect, it, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

let workDir;
let originalCwd;

const FIXTURE = {
  generatedAt: "2026-05-30T00:00:00Z",
  source: "cardkingdom-v2-pricelist",
  count: 2,
  prices: {
    "ck-sol": { usd: "129.99" },
    "ck-bolt": { usd: "0.49", usdFoil: "3.25" },
  },
};

beforeEach(async () => {
  workDir = await fs.mkdtemp(path.join(os.tmpdir(), "ck-prices-"));
  await fs.mkdir(path.join(workDir, "data"), { recursive: true });
  originalCwd = process.cwd();
  process.chdir(workDir);
});

afterEach(async () => {
  process.chdir(originalCwd);
  await fs.rm(workDir, { recursive: true, force: true });
});

async function writeFixture(obj = FIXTURE) {
  await fs.writeFile(path.join(workDir, "data", "cardkingdom-prices.json"), JSON.stringify(obj), "utf8");
}

async function load() {
  return import("./cardKingdomPrices.js?bust=" + Math.random());
}

describe("cardKingdomPrice", () => {
  it("returns the retail prices for a known scryfallId", async () => {
    await writeFixture();
    const { cardKingdomPrice } = await load();
    expect(cardKingdomPrice("ck-bolt")).toEqual({ usd: "0.49", usdFoil: "3.25" });
    expect(cardKingdomPrice("ck-sol")).toEqual({ usd: "129.99" });
  });

  it("returns null for an unknown scryfallId", async () => {
    await writeFixture();
    const { cardKingdomPrice } = await load();
    expect(cardKingdomPrice("nope")).toBeNull();
  });

  it("returns null for falsy input", async () => {
    await writeFixture();
    const { cardKingdomPrice } = await load();
    expect(cardKingdomPrice("")).toBeNull();
    expect(cardKingdomPrice(null)).toBeNull();
    expect(cardKingdomPrice(undefined)).toBeNull();
  });

  it("degrades to empty (no throw) when the index file is missing", async () => {
    // No writeFixture() — file absent, as in dev before a sync.
    const { cardKingdomPrice, cardKingdomStats } = await load();
    expect(cardKingdomPrice("ck-sol")).toBeNull();
    expect(cardKingdomStats()).toEqual({ generatedAt: null, count: 0 });
  });
});

describe("cardKingdomStats", () => {
  it("reports freshness + count from the index", async () => {
    await writeFixture();
    const { cardKingdomStats } = await load();
    expect(cardKingdomStats()).toEqual({ generatedAt: "2026-05-30T00:00:00Z", count: 2 });
  });
});

/**
 * priceResolution — the never-nil fallback chain over fixture printing +
 * Card Kingdom indexes.
 *
 * priceResolution.js statically imports printingIndex.js + cardKingdomPrices.js,
 * which cache at module scope and can't be re-pointed per test via ?bust. So we
 * set up ONE shared tmpdir with both fixtures, chdir into it, then import once.
 * The fallback inputs we vary per test are passed as the basePrices argument.
 */

import { describe, expect, it, beforeAll, afterAll } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

let workDir;
let originalCwd;
let mod;

const PRINTINGS = {
  generatedAt: "2026-05-30T00:00:00Z",
  count: 2,
  cards: [
    // Printing index has a TCGPlayer price (sync-fresh).
    { id: "p-has", oracleId: "o-has", name: "Has Price", set: "x", collectorNumber: "1",
      prices: { usd: "5.00", usdFoil: "15.00", usdEtched: null } },
    // Printing index price is null (TCGPlayer hasn't computed market).
    { id: "p-null", oracleId: "o-null", name: "No TCG Price", set: "x", collectorNumber: "2",
      prices: { usd: null, usdFoil: null, usdEtched: null } },
  ],
};

const CK = {
  generatedAt: "2026-05-30T00:00:00Z",
  source: "cardkingdom-v2-pricelist",
  count: 2,
  prices: {
    // Card Kingdom HAS the printing the index couldn't price.
    "p-null": { usd: "4.00", usdFoil: "9.00" },
    // A printing only Card Kingdom knows about.
    "ck-only": { usd: "2.50", usdFoil: "7.00" },
  },
};

beforeAll(async () => {
  workDir = await fs.mkdtemp(path.join(os.tmpdir(), "price-res-"));
  await fs.mkdir(path.join(workDir, "data", "scryfall-bulk"), { recursive: true });
  await fs.writeFile(path.join(workDir, "data", "scryfall-bulk", "printings-index.json"), JSON.stringify(PRINTINGS), "utf8");
  await fs.writeFile(path.join(workDir, "data", "cardkingdom-prices.json"), JSON.stringify(CK), "utf8");
  originalCwd = process.cwd();
  process.chdir(workDir);
  mod = await import("./priceResolution.js");
});

afterAll(async () => {
  process.chdir(originalCwd);
  await fs.rm(workDir, { recursive: true, force: true });
});

describe("resolvePrices", () => {
  it("keeps the row's own TCGPlayer price (highest priority)", () => {
    const r = mod.resolvePrices("p-has", { usd: "99.00" });
    expect(r.usd).toBe("99.00");
    expect(r.sources.usd).toBe("tcgplayer");
  });

  it("falls back to the printing index when the row has no price", () => {
    const r = mod.resolvePrices("p-has", null);
    expect(r.usd).toBe("5.00");
    expect(r.usdFoil).toBe("15.00");
    expect(r.sources.usd).toBe("printing-index");
  });

  it("falls back to Card Kingdom when TCGPlayer/printing-index are null", () => {
    const r = mod.resolvePrices("p-null", { usd: null, usdFoil: null });
    expect(r.usd).toBe("4.00");
    expect(r.usdFoil).toBe("9.00");
    expect(r.sources.usd).toBe("cardkingdom");
    expect(r.sources.usdFoil).toBe("cardkingdom");
  });

  it("resolves a printing only Card Kingdom knows about", () => {
    const r = mod.resolvePrices("ck-only", null);
    expect(r.usd).toBe("2.50");
    expect(r.sources.usd).toBe("cardkingdom");
  });

  it("falls back etched to a Card Kingdom foil price", () => {
    const r = mod.resolvePrices("p-null", null);
    expect(r.usdEtched).toBe("9.00");
    expect(r.sources.usdEtched).toBe("cardkingdom");
  });

  it("returns nulls when nothing anywhere has a price", () => {
    const r = mod.resolvePrices("ghost", null);
    expect(r.usd).toBeNull();
    expect(r.usdFoil).toBeNull();
    expect(r.usdEtched).toBeNull();
    expect(r.sources).toEqual({ usd: null, usdFoil: null, usdEtched: null });
  });
});

describe("resolvedCheapestUsd", () => {
  it("returns the cheapest finish after fallback", () => {
    // p-null: CK usd 4.00, foil 9.00 → cheapest 4.00.
    expect(mod.resolvedCheapestUsd("p-null", null)).toBe(4.0);
  });

  it("ignores zero/negative and returns null when unpriced", () => {
    expect(mod.resolvedCheapestUsd("ghost", { usd: "0.00" })).toBeNull();
  });
});

describe("enrichCollectionPrices", () => {
  it("fills null row prices from the fallback chain and flags fallback use", () => {
    const collection = {
      cards: [
        { scryfallId: "p-null", prices: { usd: null, usdFoil: null }, stacks: [{ finish: "nonfoil", quantity: 1 }] },
        { scryfallId: "p-has", prices: { usd: "5.00" }, stacks: [{ finish: "nonfoil", quantity: 1 }] },
      ],
    };
    const out = mod.enrichCollectionPrices(collection);
    expect(out.cards[0].prices.usd).toBe("4.00");      // filled from Card Kingdom
    expect(out.cards[0].pricesFallback).toBe(true);
    expect(out.cards[1].prices.usd).toBe("5.00");      // own price kept
    expect(out.cards[1].pricesFallback).toBe(false);
    // Non-mutating: original collection untouched.
    expect(collection.cards[0].prices.usd).toBeNull();
  });

  it("passes through a collection with no cards array", () => {
    expect(mod.enrichCollectionPrices(null)).toBeNull();
    expect(mod.enrichCollectionPrices({ foo: 1 })).toEqual({ foo: 1 });
  });
});

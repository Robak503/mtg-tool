/**
 * /api/collection/stats — smoke + behavior over a tmpdir collection.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

let tmpDir, originalCwd, route;

async function loadRoute() {
  vi.resetModules();
  return import("./route.js");
}

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "collection-stats-"));
  await fs.mkdir(path.join(tmpDir, "data"), { recursive: true });
  originalCwd = process.cwd();
  process.chdir(tmpDir);
  route = await loadRoute();
});

afterEach(async () => {
  process.chdir(originalCwd);
  await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
});

describe("module load", () => {
  it("imports without throwing", async () => {
    await expect(loadRoute()).resolves.toBeDefined();
  });
});

describe("GET /api/collection/stats", () => {
  it("returns zero stats for an empty collection (no file)", async () => {
    const resp = await route.GET();
    expect(resp.status).toBe(200);
    const body = await resp.json();
    expect(body.counts.totalCards).toBe(0);
    expect(body.value.currentUsd).toBe(0);
    expect(body.historyAvailable).toBe(false);
  });

  it("computes total value from stored row prices", async () => {
    const collection = {
      version: 1,
      updatedAt: "2026-05-27T00:00:00Z",
      cards: [
        {
          scryfallId: "a",
          oracleId: "oracle-a",
          name: "Sol Ring",
          stacks: [{ finish: "nonfoil", quantity: 4, condition: "NM" }],
          prices: { usd: "3.50", usdFoil: "12.00", usdEtched: null },
          wishlist: false,
        },
        {
          scryfallId: "b",
          oracleId: "oracle-b",
          name: "Counterspell",
          stacks: [{ finish: "foil", quantity: 1, condition: "NM" }],
          prices: { usd: "1.00", usdFoil: "8.00", usdEtched: null },
          wishlist: false,
        },
      ],
    };
    await fs.writeFile(
      path.join(tmpDir, "data", "collection.json"),
      JSON.stringify(collection),
      "utf8",
    );
    const fresh = await loadRoute();
    const body = await (await fresh.GET()).json();
    // 4 * 3.50 (Sol Ring nonfoil) + 1 * 8.00 (Counterspell foil) = 22.00
    expect(body.value.currentUsd).toBe(22);
    expect(body.counts.totalCards).toBe(5);
    expect(body.counts.uniqueOracles).toBe(2);
  });

  it("separates wishlist count from owned counts", async () => {
    const collection = {
      version: 1,
      updatedAt: "x",
      cards: [
        {
          scryfallId: "owned",
          oracleId: "o-owned",
          name: "Owned Card",
          stacks: [{ finish: "nonfoil", quantity: 1 }],
          prices: { usd: "1.00" },
          wishlist: false,
        },
        {
          scryfallId: "wished",
          oracleId: "o-wished",
          name: "Wishlist Card",
          stacks: [{ finish: "foil", quantity: 0 }],
          prices: { usd: null, usdFoil: "10.00" },
          wishlist: true,
        },
      ],
    };
    await fs.writeFile(
      path.join(tmpDir, "data", "collection.json"),
      JSON.stringify(collection),
      "utf8",
    );
    const fresh = await loadRoute();
    const body = await (await fresh.GET()).json();
    expect(body.counts.totalCards).toBe(1);
    expect(body.counts.wishlistCount).toBe(1);
  });

  it("reports historyAvailable=true when collection-prices.jsonl has matching entries", async () => {
    const collection = {
      version: 1,
      updatedAt: "x",
      cards: [{
        scryfallId: "a",
        oracleId: "oracle-a",
        name: "Sol Ring",
        stacks: [{ finish: "nonfoil", quantity: 1 }],
        prices: { usd: "3.50" },
        wishlist: false,
      }],
    };
    await fs.writeFile(
      path.join(tmpDir, "data", "collection.json"),
      JSON.stringify(collection),
      "utf8",
    );
    const history = [
      { snappedAt: "2026-04-01", scryfallId: "a", usd: "3.00" },
      { snappedAt: "2026-05-01", scryfallId: "a", usd: "3.25" },
    ].map(e => JSON.stringify(e)).join("\n");
    await fs.writeFile(
      path.join(tmpDir, "data", "collection-prices.jsonl"),
      history,
      "utf8",
    );
    const fresh = await loadRoute();
    const body = await (await fresh.GET()).json();
    expect(body.historyAvailable).toBe(true);
    expect(body.historyDates).toEqual(["2026-04-01", "2026-05-01"]);
  });
});

/**
 * /api/collection/refresh-prices — behavior over a chdir'd tmp dir with
 * fetchScryfallPrices mocked (no network). Verifies the route only re-pulls
 * the null-priced cards and writes the fresh numbers back.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

let tmpDir;
let originalCwd;

// Mock the network layer; assert the route's selection + merge logic only.
const fetchMock = vi.fn();
vi.mock("../../../../lib/server/scryfallPriceFetch.js", () => ({
  fetchScryfallPrices: (...args) => fetchMock(...args),
}));

async function loadRoute() {
  vi.resetModules();
  return import("./route.js");
}

async function writeCollection(cards) {
  await fs.writeFile(
    path.join(tmpDir, "data", "collection.json"),
    JSON.stringify({ version: 1, updatedAt: "2026-05-30T00:00:00Z", cards }),
    "utf8",
  );
}

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "refresh-prices-test-"));
  await fs.mkdir(path.join(tmpDir, "data"), { recursive: true });
  originalCwd = process.cwd();
  process.chdir(tmpDir);
  fetchMock.mockReset();
});

afterEach(async () => {
  process.chdir(originalCwd);
  await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
});

describe("POST /api/collection/refresh-prices", () => {
  it("no-ops (no network) when every owned card already has a price", async () => {
    await writeCollection([
      { scryfallId: "a", prices: { usd: "1.00" }, stacks: [{ finish: "nonfoil", quantity: 1 }] },
    ]);
    const { POST } = await loadRoute();
    const res = await POST();
    const body = await res.json();
    expect(body).toMatchObject({ needed: 0, refreshed: 0 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("re-pulls only null-priced owned cards and writes the fresh price back", async () => {
    await writeCollection([
      { scryfallId: "has", prices: { usd: "1.00" }, stacks: [{ finish: "nonfoil", quantity: 1 }] },
      { scryfallId: "null", prices: { usd: null }, stacks: [{ finish: "nonfoil", quantity: 2 }] },
    ]);
    fetchMock.mockResolvedValue(new Map([["null", { usd: "4.25", usdFoil: null, usdEtched: null }]]));

    const { POST } = await loadRoute();
    const res = await POST();
    const body = await res.json();

    // Only the null-priced card was requested.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toEqual(["null"]);
    expect(body).toMatchObject({ needed: 1, refreshed: 1, stillNull: 0 });

    // Persisted to disk.
    const saved = JSON.parse(await fs.readFile(path.join(tmpDir, "data", "collection.json"), "utf8"));
    const row = saved.cards.find(c => c.scryfallId === "null");
    expect(row.prices.usd).toBe("4.25");
  });

  it("reports cards still null when Scryfall also has no price", async () => {
    await writeCollection([
      { scryfallId: "ghost", prices: { usd: null }, stacks: [{ finish: "nonfoil", quantity: 1 }] },
    ]);
    fetchMock.mockResolvedValue(new Map()); // Scryfall returned nothing.

    const { POST } = await loadRoute();
    const body = await (await POST()).json();
    expect(body).toMatchObject({ needed: 1, refreshed: 0, stillNull: 1 });
  });

  it("returns 502 when Scryfall is unreachable", async () => {
    await writeCollection([
      { scryfallId: "x", prices: { usd: null }, stacks: [{ finish: "nonfoil", quantity: 1 }] },
    ]);
    fetchMock.mockRejectedValue(new Error("ECONNREFUSED"));

    const { POST } = await loadRoute();
    const res = await POST();
    expect(res.status).toBe(502);
  });
});

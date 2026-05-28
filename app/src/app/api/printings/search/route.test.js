/**
 * /api/printings/search — smoke + behavior over a tmpdir fixture.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

let tmpDir;
let originalCwd;
let route;

const FIXTURE = {
  generatedAt: "2026-05-27T00:00:00Z",
  sourceFile: "test",
  sourceCount: 3,
  count: 3,
  cards: [
    {
      id: "sol-c21",
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
      id: "sol-lea",
      oracleId: "oracle-sol-ring", // same oracle, different printing
      name: "Sol Ring",
      set: "lea",
      collectorNumber: "270",
      finishes: ["nonfoil"],
      layout: "normal",
      artCropUrl: "https://example.com/sol-lea.jpg",
      prices: { usd: "9000.00", usdFoil: null, usdEtched: null },
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

async function loadRoute() {
  vi.resetModules();
  return import("./route.js");
}

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "printings-search-test-"));
  await fs.mkdir(path.join(tmpDir, "data", "scryfall-bulk"), { recursive: true });
  await fs.writeFile(
    path.join(tmpDir, "data", "scryfall-bulk", "printings-index.json"),
    JSON.stringify(FIXTURE),
    "utf8",
  );
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
  it("exports GET", () => {
    expect(typeof route.GET).toBe("function");
  });
});

describe("GET /api/printings/search", () => {
  function search(q, extra = "") {
    return route.GET(new Request(`http://localhost/api/printings/search?q=${encodeURIComponent(q)}${extra}`));
  }

  it("returns matches by name", async () => {
    const resp = await search("sol");
    expect(resp.status).toBe(200);
    const body = await resp.json();
    expect(body.count).toBeGreaterThan(0);
    expect(body.results[0].name).toBe("Sol Ring");
  });

  it("dedupes by oracleId (one printing per card)", async () => {
    const resp = await search("sol ring");
    const body = await resp.json();
    const solCount = body.results.filter(r => r.name === "Sol Ring").length;
    expect(solCount).toBe(1);
  });

  it("ranks exact match higher than substring", async () => {
    const resp = await search("counterspell");
    const body = await resp.json();
    expect(body.results[0].name).toBe("Counterspell");
  });

  it("matches against set + collector number", async () => {
    const resp = await search("mh3");
    const body = await resp.json();
    expect(body.results.some(r => r.set === "mh3")).toBe(true);
  });

  it("returns empty results for queries under 2 chars", async () => {
    const resp = await search("s");
    expect(resp.status).toBe(200);
    const body = await resp.json();
    expect(body.results).toEqual([]);
    expect(body.message).toMatch(/2 characters/);
  });

  it("respects the limit param", async () => {
    const resp = await search("o", "&limit=1"); // matches everything
    expect(resp.status).toBe(200);
    const body = await resp.json();
    expect(body.results.length).toBeLessThanOrEqual(1);
  });

  it("returns 503 when printings index is missing", async () => {
    await fs.rm(
      path.join(tmpDir, "data", "scryfall-bulk", "printings-index.json"),
      { force: true },
    );
    const fresh = await loadRoute();
    const resp = await fresh.GET(new Request("http://localhost/api/printings/search?q=sol"));
    expect(resp.status).toBe(503);
  });
});

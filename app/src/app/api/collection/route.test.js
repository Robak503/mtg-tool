/**
 * /api/collection — module-load smoke + behavior over a temp workdir.
 *
 * Per CLAUDE.md §5 #10 every new route must have at least an import
 * smoke test. We go further: GET / POST / DELETE happy paths + validation
 * + merge behavior, all over a chdir'd tmp dir so writes land somewhere
 * disposable. A tiny printings-index fixture lets POST validate.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

let tmpDir;
let originalCwd;
let route;

const PRINTING_FIXTURE = {
  generatedAt: "2026-05-27T00:00:00Z",
  sourceFile: "test",
  sourceCount: 2,
  count: 2,
  cards: [
    {
      id: "scry-sol",
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
      id: "scry-counter",
      oracleId: "oracle-counter",
      name: "Counterspell",
      set: "mh3",
      collectorNumber: "42",
      finishes: ["nonfoil"],
      layout: "normal",
      artCropUrl: "https://example.com/counter.jpg",
      prices: { usd: "1.00", usdFoil: null, usdEtched: null },
    },
  ],
};

async function loadRoute() {
  vi.resetModules();
  return import("./route.js");
}

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "collection-route-test-"));
  await fs.mkdir(path.join(tmpDir, "data", "scryfall-bulk"), { recursive: true });
  await fs.writeFile(
    path.join(tmpDir, "data", "scryfall-bulk", "printings-index.json"),
    JSON.stringify(PRINTING_FIXTURE),
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

  it("exports GET, POST, and DELETE", () => {
    expect(typeof route.GET).toBe("function");
    expect(typeof route.POST).toBe("function");
    expect(typeof route.DELETE).toBe("function");
  });
});

describe("GET /api/collection", () => {
  it("returns an empty collection on first launch (no file)", async () => {
    const resp = await route.GET();
    expect(resp.status).toBe(200);
    const body = await resp.json();
    expect(body.collection.cards).toEqual([]);
    expect(body.collection.version).toBe(1);
    expect(body.recoveryWarning).toBeNull();
  });
});

describe("POST /api/collection", () => {
  function postBody(body) {
    return new Request("http://localhost/api/collection", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  it("adds a new card row using printing-index enrichment", async () => {
    const resp = await route.POST(postBody({
      scryfallId: "scry-sol",
      stacks: [{ finish: "nonfoil", quantity: 4, condition: "NM" }],
    }));
    expect(resp.status).toBe(200);
    const body = await resp.json();
    expect(body.added).toBe("Sol Ring");
    expect(body.merged).toBe(false);
    expect(body.collection.cards).toHaveLength(1);
    expect(body.collection.cards[0]).toMatchObject({
      scryfallId: "scry-sol",
      oracleId: "oracle-sol",
      name: "Sol Ring",
      setCode: "c21",
      collectorNumber: "256",
      stacks: [{ finish: "nonfoil", quantity: 4, condition: "NM" }],
    });
  });

  it("merges stacks when the scryfallId already exists", async () => {
    await route.POST(postBody({
      scryfallId: "scry-sol",
      stacks: [{ finish: "nonfoil", quantity: 2, condition: "NM" }],
    }));
    const resp = await route.POST(postBody({
      scryfallId: "scry-sol",
      stacks: [
        { finish: "nonfoil", quantity: 1, condition: "NM" },
        { finish: "foil",    quantity: 1, condition: "LP" },
      ],
    }));
    expect(resp.status).toBe(200);
    const body = await resp.json();
    expect(body.merged).toBe(true);
    expect(body.collection.cards).toHaveLength(1);
    const stacks = body.collection.cards[0].stacks;
    const nonfoil = stacks.find(s => s.finish === "nonfoil");
    const foil = stacks.find(s => s.finish === "foil");
    expect(nonfoil.quantity).toBe(3); // 2 + 1
    expect(foil.quantity).toBe(1);
    expect(foil.condition).toBe("LP");
  });

  it("rejects missing scryfallId with 400", async () => {
    const resp = await route.POST(postBody({ stacks: [] }));
    expect(resp.status).toBe(400);
    const body = await resp.json();
    expect(body.error).toMatch(/scryfallId/);
  });

  it("rejects empty stacks with 400", async () => {
    const resp = await route.POST(postBody({ scryfallId: "scry-sol", stacks: [] }));
    expect(resp.status).toBe(400);
  });

  it("rejects bad finish with 400", async () => {
    const resp = await route.POST(postBody({
      scryfallId: "scry-sol",
      stacks: [{ finish: "shiny", quantity: 1 }],
    }));
    expect(resp.status).toBe(400);
    const body = await resp.json();
    expect(body.error).toMatch(/nonfoil/);
  });

  it("rejects negative quantity with 400", async () => {
    const resp = await route.POST(postBody({
      scryfallId: "scry-sol",
      stacks: [{ finish: "nonfoil", quantity: -1 }],
    }));
    expect(resp.status).toBe(400);
  });

  it("returns 404 when scryfallId is not in printings index and no oracleId in body", async () => {
    const resp = await route.POST(postBody({
      scryfallId: "scry-unknown",
      stacks: [{ finish: "nonfoil", quantity: 1 }],
    }));
    expect(resp.status).toBe(404);
  });

  it("accepts scryfallId with explicit oracleId when printing-index lookup misses", async () => {
    const resp = await route.POST(postBody({
      scryfallId: "scry-custom",
      oracleId: "oracle-custom",
      name: "Custom Card",
      setCode: "tst",
      collectorNumber: "1",
      stacks: [{ finish: "nonfoil", quantity: 1, condition: "NM" }],
    }));
    expect(resp.status).toBe(200);
    const body = await resp.json();
    expect(body.collection.cards[0].oracleId).toBe("oracle-custom");
  });

  it("auto-flips wishlist=false when an acquired stack lands on a wishlist row", async () => {
    // Seed a wishlist row directly via storage helper
    const { writeCollectionAtomic } = await import("../../../lib/server/collectionStorage.js?bust=" + Math.random());
    await writeCollectionAtomic({
      cards: [{
        scryfallId: "scry-sol",
        oracleId: "oracle-sol",
        name: "Sol Ring",
        setCode: "c21",
        collectorNumber: "256",
        stacks: [{ finish: "foil", quantity: 0, condition: null }],
        addedAt: new Date().toISOString(),
        notes: "",
        wishlist: true,
      }],
    });
    const resp = await route.POST(postBody({
      scryfallId: "scry-sol",
      stacks: [{ finish: "foil", quantity: 1, condition: "NM" }],
    }));
    expect(resp.status).toBe(200);
    const body = await resp.json();
    expect(body.collection.cards[0].wishlist).toBe(false);
    expect(body.collection.cards[0].stacks.find(s => s.finish === "foil").quantity).toBe(1);
  });

  it("rejects malformed JSON with 400", async () => {
    const req = new Request("http://localhost/api/collection", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{not valid json",
    });
    const resp = await route.POST(req);
    expect(resp.status).toBe(400);
  });
});

describe("DELETE /api/collection", () => {
  it("requires ?confirm=true and rejects without it", async () => {
    const resp = await route.DELETE(new Request("http://localhost/api/collection", { method: "DELETE" }));
    expect(resp.status).toBe(400);
    const body = await resp.json();
    expect(body.error).toMatch(/confirm/i);
  });

  it("clears the collection when ?confirm=true is provided", async () => {
    // Seed
    await route.POST(new Request("http://localhost/api/collection", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        scryfallId: "scry-sol",
        stacks: [{ finish: "nonfoil", quantity: 1 }],
      }),
    }));
    const resp = await route.DELETE(new Request("http://localhost/api/collection?confirm=true", { method: "DELETE" }));
    expect(resp.status).toBe(200);
    const body = await resp.json();
    expect(body.ok).toBe(true);
    expect(body.cleared).toBe(1);
    expect(body.collection.cards).toEqual([]);
  });
});

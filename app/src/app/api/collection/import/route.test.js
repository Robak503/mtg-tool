/**
 * /api/collection/import — smoke + behavior over a tmpdir fixture.
 *
 * Tests both call shapes: { csv } → preview, { rows } → commit.
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

async function loadRoute() {
  vi.resetModules();
  return import("./route.js");
}

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "collection-import-test-"));
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
  it("exports POST", () => {
    expect(typeof route.POST).toBe("function");
  });
});

describe("POST preview ({ csv })", () => {
  function previewRequest(csv) {
    return new Request("http://localhost/api/collection/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ csv }),
    });
  }

  it("parses Deckbox CSV and returns matched + unmatched", async () => {
    const csv =
      "Count,Name,Edition,Condition,Language,Foil\n" +
      "4,Sol Ring,c21,Near Mint,English,\n" +
      "1,Made Up Card,xyz,NM,English,";
    const resp = await route.POST(previewRequest(csv));
    expect(resp.status).toBe(200);
    const body = await resp.json();
    expect(body.format).toBe("deckbox");
    expect(body.matched).toHaveLength(1);
    expect(body.matched[0].row.name).toBe("Sol Ring");
    expect(body.matched[0].row.stacks[0].quantity).toBe(4);
    expect(body.unmatched).toHaveLength(1);
    expect(body.unmatched[0].name).toBe("Made Up Card");
  });

  it("parses Moxfield CSV with quoted fields", async () => {
    const csv =
      '"Count","Name","Edition","Condition","Language","Foil","Tags","Last Modified"\n' +
      '"2","Counterspell","mh3","NM","English","foil","","2026-01-01"';
    const resp = await route.POST(previewRequest(csv));
    expect(resp.status).toBe(200);
    const body = await resp.json();
    expect(body.format).toBe("moxfield");
    expect(body.matched).toHaveLength(1);
    expect(body.matched[0].row.stacks[0].finish).toBe("foil");
    expect(body.matched[0].row.stacks[0].quantity).toBe(2);
  });

  it("returns format=unknown + an error when header is unrecognized", async () => {
    const resp = await route.POST(previewRequest("foo,bar\n1,2"));
    const body = await resp.json();
    expect(body.format).toBe("unknown");
    expect(body.errors[0].message).toMatch(/unrecognized/i);
  });

  it("does NOT write to collection.json during preview", async () => {
    const csv = "Count,Name,Edition,Condition,Language,Foil\n4,Sol Ring,c21,NM,English,";
    await route.POST(previewRequest(csv));
    const collectionFile = path.join(tmpDir, "data", "collection.json");
    const exists = await fs.stat(collectionFile).then(() => true).catch(() => false);
    expect(exists).toBe(false);
  });
});

describe("POST preview ({ text }) — paste-a-list (C5-P1.2)", () => {
  function textRequest(text) {
    return new Request("http://localhost/api/collection/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
  }

  it("parses a pasted list into matched + unmatched, same shape as CSV", async () => {
    const resp = await route.POST(textRequest("4 Sol Ring (c21) 263\nMade Up Card\n"));
    expect(resp.status).toBe(200);
    const body = await resp.json();
    expect(body.format).toBe("text");
    expect(body.matched).toHaveLength(1);
    expect(body.matched[0].row.name).toBe("Sol Ring");
    expect(body.matched[0].row.stacks[0].quantity).toBe(4);
    expect(body.matched[0].pickedLatest).toBe(false); // exact set given
    expect(body.unmatched.map(u => u.name)).toContain("Made Up Card");
  });

  it("a foil token + no set resolves foil and flags pickedLatest (honest ambiguity)", async () => {
    const resp = await route.POST(textRequest("Counterspell *F*"));
    const body = await resp.json();
    expect(body.matched[0].row.stacks[0].finish).toBe("foil");
    expect(body.matched[0].pickedLatest).toBe(true); // no set → picked a default printing
  });

  it("a wrong set falls back to a printing AND flags pickedLatest", async () => {
    const resp = await route.POST(textRequest("1 Sol Ring (zzz)"));
    const body = await resp.json();
    expect(body.matched).toHaveLength(1);
    expect(body.matched[0].pickedLatest).toBe(true); // "zzz" had no exact printing → fell back
  });

  it("text preview writes nothing (no collection file created)", async () => {
    await route.POST(textRequest("4 Sol Ring (c21)"));
    const collectionFile = path.join(tmpDir, "data", "collection.json");
    const exists = await fs.stat(collectionFile).then(() => true).catch(() => false);
    expect(exists).toBe(false);
  });
});

describe("POST commit ({ rows })", () => {
  function commitRequest(rows) {
    return new Request("http://localhost/api/collection/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rows }),
    });
  }

  function makeRow(scryfallId, oracleId, name) {
    return {
      scryfallId,
      oracleId,
      name,
      setCode: "tst",
      collectorNumber: "1",
      stacks: [{ finish: "nonfoil", quantity: 2, condition: "NM" }],
      addedAt: "2026-05-27T00:00:00Z",
      notes: "",
      wishlist: false,
    };
  }

  it("writes multiple rows atomically", async () => {
    const resp = await route.POST(commitRequest([
      makeRow("a", "oracle-a", "Card A"),
      makeRow("b", "oracle-b", "Card B"),
    ]));
    expect(resp.status).toBe(200);
    const body = await resp.json();
    expect(body.stats.added).toBe(2);
    expect(body.stats.mergedCount).toBe(0);
    expect(body.collection.cards).toHaveLength(2);
  });

  it("merges into existing rows by scryfallId", async () => {
    await route.POST(commitRequest([makeRow("a", "oracle-a", "Card A")]));
    const resp = await route.POST(commitRequest([makeRow("a", "oracle-a", "Card A")]));
    const body = await resp.json();
    expect(body.stats.added).toBe(0);
    expect(body.stats.mergedCount).toBe(1);
    const stacks = body.collection.cards[0].stacks;
    expect(stacks.find(s => s.finish === "nonfoil").quantity).toBe(4);
  });
});

describe("POST — bad shapes", () => {
  it("rejects empty body with 400", async () => {
    const resp = await route.POST(new Request("http://localhost/api/collection/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    }));
    expect(resp.status).toBe(400);
  });
  it("rejects malformed JSON with 400", async () => {
    const resp = await route.POST(new Request("http://localhost/api/collection/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{nope",
    }));
    expect(resp.status).toBe(400);
  });
});

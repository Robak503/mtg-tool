/**
 * /api/collection/conflicts — smoke + behavior over a tmpdir fixture.
 *
 * Seeds collection.json + decks.local.json + a tiny oracle-index, then
 * checks that the conflict math + name enrichment land correctly.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

let tmpDir;
let originalCwd;
let route;

const ORACLE_INDEX = {
  generatedAt: "2026-05-27T00:00:00Z",
  cards: [
    { name: "Sol Ring", oracle_id: "oracle-sol", type_line: "Artifact", oracle_text: "", mana_cost: "{1}", cmc: 1, color_identity: [], legalities: { commander: "legal" }, layout: "normal", keywords: [] },
    { name: "Counterspell", oracle_id: "oracle-counter", type_line: "Instant", oracle_text: "", mana_cost: "{U}{U}", cmc: 2, color_identity: ["U"], legalities: { commander: "legal" }, layout: "normal", keywords: [] },
  ],
};

const COLLECTION = {
  version: 1,
  updatedAt: "2026-05-27T00:00:00Z",
  cards: [
    {
      scryfallId: "scry-sol",
      oracleId: "oracle-sol",
      name: "Sol Ring",
      setCode: "c21",
      collectorNumber: "256",
      stacks: [{ finish: "nonfoil", quantity: 1, condition: "NM" }],
      wishlist: false,
    },
    {
      scryfallId: "scry-counter",
      oracleId: "oracle-counter",
      name: "Counterspell",
      setCode: "mh3",
      collectorNumber: "42",
      stacks: [{ finish: "nonfoil", quantity: 4, condition: "NM" }],
      wishlist: false,
    },
  ],
};

const DECKS = {
  version: 1,
  updatedAt: "2026-05-27T00:00:00Z",
  decks: [
    {
      id: "atraxa-deck",
      name: "Atraxa Superfriends",
      cards: [
        { name: "Sol Ring", qty: 1, section: "Mainboard" },
        { name: "Counterspell", qty: 1, section: "Mainboard" },
      ],
    },
    {
      id: "yarok-deck",
      name: "Yarok ETB",
      cards: [
        { name: "Sol Ring", qty: 1, section: "Mainboard" },
      ],
    },
  ],
};

async function loadRoute() {
  vi.resetModules();
  return import("./route.js");
}

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "collection-conflicts-test-"));
  await fs.mkdir(path.join(tmpDir, "data", "scryfall-bulk"), { recursive: true });
  await fs.writeFile(
    path.join(tmpDir, "data", "scryfall-bulk", "oracle-index.json"),
    JSON.stringify(ORACLE_INDEX),
    "utf8",
  );
  await fs.writeFile(
    path.join(tmpDir, "data", "collection.json"),
    JSON.stringify(COLLECTION),
    "utf8",
  );
  await fs.writeFile(
    path.join(tmpDir, "data", "decks.local.json"),
    JSON.stringify(DECKS),
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

describe("GET /api/collection/conflicts", () => {
  it("detects Sol Ring overflow across two decks", async () => {
    const resp = await route.GET();
    expect(resp.status).toBe(200);
    const body = await resp.json();
    expect(body.conflicts).toHaveLength(1);
    expect(body.conflicts[0].name).toBe("Sol Ring");
    expect(body.conflicts[0].ownedQty).toBe(1);
    expect(body.conflicts[0].usedQty).toBe(2);
    expect(body.conflicts[0].overflow).toBe(1);
    expect(body.conflicts[0].deckNames.sort()).toEqual(["Atraxa Superfriends", "Yarok ETB"]);
  });

  it("returns empty conflicts when no decks exist", async () => {
    await fs.rm(path.join(tmpDir, "data", "decks.local.json"), { force: true });
    const fresh = await loadRoute();
    const resp = await fresh.GET();
    expect(resp.status).toBe(200);
    const body = await resp.json();
    expect(body.conflicts).toEqual([]);
    expect(body.totalDecks).toBe(0);
  });

  it("returns 0 conflicts when ownership exceeds deck usage", async () => {
    const richCollection = {
      ...COLLECTION,
      cards: COLLECTION.cards.map(card => ({
        ...card,
        stacks: [{ finish: "nonfoil", quantity: 4, condition: "NM" }],
      })),
    };
    await fs.writeFile(
      path.join(tmpDir, "data", "collection.json"),
      JSON.stringify(richCollection),
      "utf8",
    );
    const fresh = await loadRoute();
    const resp = await fresh.GET();
    const body = await resp.json();
    expect(body.conflicts).toEqual([]);
  });

  it("flags deck cards that are entirely unowned as conflicts (overflow = used)", async () => {
    const noCounters = {
      ...COLLECTION,
      cards: COLLECTION.cards.filter(c => c.oracleId !== "oracle-counter"),
    };
    await fs.writeFile(
      path.join(tmpDir, "data", "collection.json"),
      JSON.stringify(noCounters),
      "utf8",
    );
    const fresh = await loadRoute();
    const body = await (await fresh.GET()).json();
    const counterConflict = body.conflicts.find(c => c.name === "Counterspell");
    expect(counterConflict).toBeDefined();
    expect(counterConflict.ownedQty).toBe(0);
    expect(counterConflict.usedQty).toBe(1);
  });
});

/**
 * /api/collection/prices — POST snapshot, idempotent per day.
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

async function seedCollection(cards) {
  await fs.writeFile(
    path.join(tmpDir, "data", "collection.json"),
    JSON.stringify({ version: 1, updatedAt: "x", cards }),
    "utf8",
  );
}

async function readHistoryFile() {
  const raw = await fs.readFile(path.join(tmpDir, "data", "collection-prices.jsonl"), "utf8");
  return raw.split("\n").map(s => s.trim()).filter(Boolean).map(l => JSON.parse(l));
}

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "collection-prices-route-"));
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
  it("exports POST", () => {
    expect(typeof route.POST).toBe("function");
  });
});

describe("POST /api/collection/prices", () => {
  it("no-ops for an empty collection", async () => {
    await seedCollection([]);
    const fresh = await loadRoute();
    const body = await (await fresh.POST()).json();
    expect(body.snapped).toBe(false);
    expect(body.entryCount).toBe(0);
  });

  it("writes one entry per owned card and reports snapped:true", async () => {
    await seedCollection([
      {
        scryfallId: "a", oracleId: "o-a", name: "Sol Ring",
        stacks: [{ finish: "nonfoil", quantity: 2 }],
        prices: { usd: "3.50", usdFoil: "12.00", usdEtched: null },
        wishlist: false,
      },
      {
        scryfallId: "w", oracleId: "o-w", name: "Wishlist",
        stacks: [{ finish: "foil", quantity: 0 }],
        prices: { usd: null, usdFoil: "9.00" },
        wishlist: true,
      },
    ]);
    const fresh = await loadRoute();
    const body = await (await fresh.POST()).json();
    expect(body.snapped).toBe(true);
    expect(body.entryCount).toBe(1);

    const history = await readHistoryFile();
    expect(history).toHaveLength(1);
    expect(history[0].scryfallId).toBe("a");
    expect(history[0].usd).toBe("3.50");
    expect(history[0].snappedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("is idempotent within the same day", async () => {
    await seedCollection([
      { scryfallId: "a", oracleId: "o-a", name: "Sol Ring", stacks: [{ finish: "nonfoil", quantity: 1 }], prices: { usd: "3.50" }, wishlist: false },
    ]);

    const r1 = await (await loadRoute()).POST();
    expect((await r1.json()).snapped).toBe(true);

    const r2 = await (await loadRoute()).POST();
    const body2 = await r2.json();
    expect(body2.snapped).toBe(false);
    expect(body2.alreadyExisted).toBe(true);

    const history = await readHistoryFile();
    expect(history).toHaveLength(1); // not doubled
  });

  it("leaves no stray .tmp file", async () => {
    await seedCollection([
      { scryfallId: "a", oracleId: "o-a", name: "X", stacks: [{ finish: "nonfoil", quantity: 1 }], prices: { usd: "1.00" }, wishlist: false },
    ]);
    await (await loadRoute()).POST();
    const files = await fs.readdir(path.join(tmpDir, "data"));
    expect(files.find(n => n.includes(".tmp."))).toBeUndefined();
  });
});

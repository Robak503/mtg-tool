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
  delete process.env.MTG_REFERENCE_DIR;
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

describe("bundled seed history (#4 groundwork)", () => {
  it("reads a bundled seed and writes the merged history to the writable dir, leaving the bundle untouched", async () => {
    // A read-only bundled seed, as shipped under resources/data on a fresh
    // install. dataPath() falls back to it because the writable copy is absent.
    const bundleDir = path.join(tmpDir, "bundle");
    await fs.mkdir(bundleDir, { recursive: true });
    const seedFile = path.join(bundleDir, "collection-prices.jsonl");
    const seedLine = JSON.stringify({
      snappedAt: "2020-01-01", scryfallId: "staple1", usd: "5.00", usdFoil: null, usdEtched: null,
    });
    await fs.writeFile(seedFile, seedLine + "\n", "utf8");
    process.env.MTG_REFERENCE_DIR = bundleDir;

    await seedCollection([
      { scryfallId: "a", oracleId: "o-a", name: "Sol Ring", stacks: [{ finish: "nonfoil", quantity: 1 }], prices: { usd: "3.50" }, wishlist: false },
    ]);

    const fresh = await loadRoute();
    const body = await (await fresh.POST()).json();
    expect(body.snapped).toBe(true);

    // Writable history now carries the seed (past point) + today's owned entry —
    // exactly what the Finance movers need on day 1.
    const history = await readHistoryFile();
    const ids = history.map(e => e.scryfallId);
    expect(ids).toContain("staple1");
    expect(ids).toContain("a");
    expect(history.some(e => e.snappedAt === "2020-01-01")).toBe(true);

    // The read-only bundle was never written to.
    const bundleAfter = (await fs.readFile(seedFile, "utf8")).trim().split("\n").filter(Boolean);
    expect(bundleAfter).toHaveLength(1);
    expect(JSON.parse(bundleAfter[0]).scryfallId).toBe("staple1");
  });

  it("snapshot writes go to the writable dir even when a bundled seed exists", async () => {
    const bundleDir = path.join(tmpDir, "bundle");
    await fs.mkdir(bundleDir, { recursive: true });
    await fs.writeFile(
      path.join(bundleDir, "collection-prices.jsonl"),
      JSON.stringify({ snappedAt: "2020-01-01", scryfallId: "staple1", usd: "5.00" }) + "\n",
      "utf8",
    );
    process.env.MTG_REFERENCE_DIR = bundleDir;
    await seedCollection([
      { scryfallId: "a", oracleId: "o-a", name: "X", stacks: [{ finish: "nonfoil", quantity: 1 }], prices: { usd: "1.00" }, wishlist: false },
    ]);
    await (await loadRoute()).POST();
    // The writable copy now exists (proving the write didn't target the bundle).
    await expect(fs.access(path.join(tmpDir, "data", "collection-prices.jsonl"))).resolves.toBeUndefined();
  });
});

describe("per-profile scoping (profiles active)", () => {
  it("writes the day-1 snapshot into the ACTIVE profile, seeded from the global bundle", async () => {
    // Fresh-install layout: a global staples seed in the bundle (dataPath), and
    // legacy data the migration sorts into a real owner profile.
    const bundleDir = path.join(tmpDir, "bundle");
    await fs.mkdir(bundleDir, { recursive: true });
    await fs.writeFile(
      path.join(bundleDir, "collection-prices.jsonl"),
      JSON.stringify({ snappedAt: "2020-01-01", scryfallId: "staple1", usd: "5.00" }) + "\n",
      "utf8",
    );
    process.env.MTG_REFERENCE_DIR = bundleDir;

    // Seed legacy decks + collection BEFORE migration so ensureMigrated routes
    // the collection into the primary profile (where loadCollection reads it).
    await fs.writeFile(
      path.join(tmpDir, "data", "decks.local.json"),
      JSON.stringify({ version: 1, decks: [{ id: "d1", name: "A", memory: { owner: "Colton" } }] }),
      "utf8",
    );
    await seedCollection([
      { scryfallId: "a", oracleId: "o-a", name: "Sol Ring", stacks: [{ finish: "nonfoil", quantity: 1 }], prices: { usd: "3.50" }, wishlist: false },
    ]);

    const { ensureMigrated } = await import("../../../../lib/server/profiles.js?bust=" + Math.random());
    ensureMigrated();
    const reg = JSON.parse(await fs.readFile(path.join(tmpDir, "data", "profiles.json"), "utf8"));
    const activeId = reg.activeProfileId;

    const body = await (await loadRoute()).POST();
    expect((await body.json()).snapped).toBe(true);

    // History landed UNDER THE ACTIVE PROFILE, carrying the global seed (day-1
    // Finance baseline) plus today's owned entry.
    const profileHist = path.join(tmpDir, "data", "profiles", activeId, "collection-prices.jsonl");
    const ids = (await fs.readFile(profileHist, "utf8"))
      .trim().split("\n").filter(Boolean).map(l => JSON.parse(l).scryfallId);
    expect(ids).toContain("staple1");
    expect(ids).toContain("a");

    // NOT at the legacy flat location, and the read-only bundle is untouched.
    await expect(fs.access(path.join(tmpDir, "data", "collection-prices.jsonl"))).rejects.toThrow();
    const bundleAfter = (await fs.readFile(path.join(bundleDir, "collection-prices.jsonl"), "utf8")).trim().split("\n").filter(Boolean);
    expect(bundleAfter).toHaveLength(1);
  });

  it("a second profile starts with the global seed too (no cross-profile history bleed)", async () => {
    const bundleDir = path.join(tmpDir, "bundle");
    await fs.mkdir(bundleDir, { recursive: true });
    await fs.writeFile(
      path.join(bundleDir, "collection-prices.jsonl"),
      JSON.stringify({ snappedAt: "2020-01-01", scryfallId: "staple1", usd: "5.00" }) + "\n",
      "utf8",
    );
    process.env.MTG_REFERENCE_DIR = bundleDir;

    await fs.writeFile(
      path.join(tmpDir, "data", "decks.local.json"),
      JSON.stringify({ version: 1, decks: [
        { id: "d1", name: "A", memory: { owner: "Colton" } },
        { id: "d2", name: "B", memory: { owner: "Joe" } },
      ] }),
      "utf8",
    );
    const profilesMod = await import("../../../../lib/server/profiles.js?bust=" + Math.random());
    profilesMod.ensureMigrated();
    const reg = JSON.parse(await fs.readFile(path.join(tmpDir, "data", "profiles.json"), "utf8"));
    const joe = reg.profiles.find(p => p.name === "Joe");

    // Switch to Joe (who has no collection) and snapshot — Joe's collection is
    // empty so nothing owned is snapped, but the read still falls back to the
    // shared global seed rather than Colton's profile history.
    profilesMod.setActiveProfile(joe.id);
    await fs.writeFile(
      path.join(tmpDir, "data", "profiles", joe.id, "collection.json"),
      JSON.stringify({ version: 1, cards: [
        { scryfallId: "z", oracleId: "o-z", name: "Z", stacks: [{ finish: "nonfoil", quantity: 1 }], prices: { usd: "2.00" }, wishlist: false },
      ] }),
      "utf8",
    );
    await (await loadRoute()).POST();

    const joeHist = path.join(tmpDir, "data", "profiles", joe.id, "collection-prices.jsonl");
    const ids = (await fs.readFile(joeHist, "utf8"))
      .trim().split("\n").filter(Boolean).map(l => JSON.parse(l).scryfallId);
    expect(ids).toContain("staple1"); // shared global seed
    expect(ids).toContain("z");       // Joe's own card
  });
});

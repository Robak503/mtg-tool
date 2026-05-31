/**
 * Tests for syncCacheInvalidation (A5).
 *
 * Proves that after a sync rewrites a data file, invalidateCachesFor() drops the
 * matching in-memory singleton so the next lookup reflects the fresh file —
 * i.e. in-app sync is visible without a server restart.
 *
 * chdir into a fresh tmp dir + vi.resetModules so each cache module's
 * dataPath()-derived files land in the tmp data dir. Modules are imported AFTER
 * fixtures are written because some resolve their file path at module load.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

let tmpDir;
let originalCwd;

async function write(rel, data) {
  const full = path.join(tmpDir, "data", ...rel);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, typeof data === "string" ? data : JSON.stringify(data), "utf8");
}
async function rm(rel) {
  await fs.rm(path.join(tmpDir, "data", ...rel), { force: true });
}

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "sync-cache-test-"));
  originalCwd = process.cwd();
  process.chdir(tmpDir);
  vi.resetModules();
});

afterEach(async () => {
  process.chdir(originalCwd);
  await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
});

describe("invalidateCachesFor (A5)", () => {
  it("maps every cache-affecting sync action to one or more reset fns", async () => {
    const { CACHE_RESETTERS } = await import("./syncCacheInvalidation.js");
    expect(Object.keys(CACHE_RESETTERS).sort()).toEqual(
      ["cardkingdom-prices", "edhrec-salt", "oracle-index", "rules-index", "scryfall-bulk", "spellbook"]
    );
    for (const list of Object.values(CACHE_RESETTERS)) {
      expect(Array.isArray(list)).toBe(true);
      expect(list.length).toBeGreaterThan(0);
      expect(list.every(fn => typeof fn === "function")).toBe(true);
    }
  });

  it("is a no-op for unknown / missing actions and never throws", async () => {
    const { invalidateCachesFor } = await import("./syncCacheInvalidation.js");
    expect(() => invalidateCachesFor("wipe-disk")).not.toThrow();
    expect(() => invalidateCachesFor(undefined)).not.toThrow();
  });

  it("oracle-index: the card index reloads fresh card data without a restart", async () => {
    await write(["scryfall-bulk", "oracle-index.json"], { cards: [{ name: "Sol Ring" }] });
    const cardIndex = await import("./cardIndex.js");
    const { invalidateCachesFor } = await import("./syncCacheInvalidation.js");

    expect(cardIndex.getCardIndex().count).toBe(1);
    // A sync rewrites the file with more cards...
    await write(["scryfall-bulk", "oracle-index.json"], { cards: [{ name: "Sol Ring" }, { name: "Lightning Bolt" }] });
    expect(cardIndex.getCardIndex().count).toBe(1); // ...still stale until invalidation
    invalidateCachesFor("oracle-index");
    expect(cardIndex.getCardIndex().count).toBe(2);
  });

  it("cardkingdom-prices: the price cache reloads after a sync", async () => {
    await write(["cardkingdom-prices.json"], { count: 1, prices: {} });
    const ck = await import("./cardKingdomPrices.js");
    const { invalidateCachesFor } = await import("./syncCacheInvalidation.js");

    expect(ck.cardKingdomStats().count).toBe(1);
    await write(["cardkingdom-prices.json"], { count: 2, prices: {} });
    expect(ck.cardKingdomStats().count).toBe(1); // stale
    invalidateCachesFor("cardkingdom-prices");
    expect(ck.cardKingdomStats().count).toBe(2);
  });

  it("edhrec-salt: the salt cache reloads after a sync", async () => {
    await write(["edhrec-salt.local.json"], [{ name: "Armageddon", salt: 3, rank: 1 }]);
    const salt = await import("./edhrecSalt.js");
    const { invalidateCachesFor } = await import("./syncCacheInvalidation.js");

    expect(salt.lookupSalt("Armageddon")).toBeTruthy();
    expect(salt.lookupSalt("Winter Orb")).toBeNull();
    await write(["edhrec-salt.local.json"], [{ name: "Winter Orb", salt: 4, rank: 1 }]);
    expect(salt.lookupSalt("Winter Orb")).toBeNull(); // stale
    invalidateCachesFor("edhrec-salt");
    expect(salt.lookupSalt("Winter Orb")).toBeTruthy();
    expect(salt.lookupSalt("Armageddon")).toBeNull();
  });

  it("spellbook: the combo cache is dropped so a reload re-reads disk", async () => {
    await write(["spellbook-combos.local.json"], [{ id: "c1" }]);
    await write(["spellbook-index.local.json"], {});
    const spellbook = await import("./spellbook.js");
    const { invalidateCachesFor } = await import("./syncCacheInvalidation.js");

    expect(spellbook.spellbookReady()).toBe(true);
    // Drop the cache, then make the files vanish: a reload now reflects that —
    // proving the cached `true` was cleared rather than retained.
    invalidateCachesFor("spellbook");
    await rm(["spellbook-combos.local.json"]);
    expect(spellbook.spellbookReady()).toBe(false);
  });
});

/**
 * collectionStorage — atomic read/write + version + corrupted-file recovery.
 *
 * Uses process.chdir(tmpdir) so paths.js resolves collection.json to a
 * throwaway location per test (no MTG_APP_ROOT needed). Matches the
 * pattern paths.test.js uses.
 */

import { describe, expect, it, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

let workDir;
let originalCwd;

beforeEach(async () => {
  workDir = await fs.mkdtemp(path.join(os.tmpdir(), "collection-storage-"));
  await fs.mkdir(path.join(workDir, "data"), { recursive: true });
  originalCwd = process.cwd();
  process.chdir(workDir);
});

afterEach(async () => {
  process.chdir(originalCwd);
  await fs.rm(workDir, { recursive: true, force: true });
});

async function loadStorage() {
  return import("./collectionStorage.js?bust=" + Math.random());
}

describe("loadCollection — missing file", () => {
  it("returns empty collection with no warning", async () => {
    const { loadCollection } = await loadStorage();
    const result = await loadCollection();

    expect(result.recoveryWarning).toBeNull();
    expect(result.collection.cards).toEqual([]);
    expect(result.collection.version).toBe(1);
  });
});

describe("loadCollection — valid file", () => {
  it("preserves cards and metadata", async () => {
    const payload = {
      version: 1,
      updatedAt: "2026-05-27T18:00:00Z",
      cards: [
        {
          scryfallId: "abc",
          oracleId: "def",
          name: "Sol Ring",
          setCode: "c21",
          collectorNumber: "256",
          stacks: [{ finish: "nonfoil", quantity: 4, condition: "NM" }],
          wishlist: false,
        },
      ],
    };
    await fs.writeFile(
      path.join(workDir, "data", "collection.json"),
      JSON.stringify(payload),
      "utf8",
    );

    const { loadCollection } = await loadStorage();
    const result = await loadCollection();

    expect(result.recoveryWarning).toBeNull();
    expect(result.collection.cards).toHaveLength(1);
    expect(result.collection.cards[0].name).toBe("Sol Ring");
    expect(result.collection.cards[0].stacks[0].quantity).toBe(4);
  });
});

describe("loadCollection — corrupted file", () => {
  it("backs up the broken file and returns empty", async () => {
    const target = path.join(workDir, "data", "collection.json");
    await fs.writeFile(target, "{not valid json", "utf8");

    const { loadCollection } = await loadStorage();
    const result = await loadCollection();

    expect(result.collection.cards).toEqual([]);
    expect(result.recoveryWarning).toMatch(/malformed/i);
    expect(result.recoveryWarning).toMatch(/collection\.broken-/);

    // The original file is renamed away
    const dataFiles = await fs.readdir(path.join(workDir, "data"));
    const brokenBackup = dataFiles.find(n => n.startsWith("collection.broken-"));
    expect(brokenBackup).toBeDefined();
  });
});

describe("loadCollection — newer version", () => {
  it("throws CollectionVersionMismatch", async () => {
    const payload = { version: 99, updatedAt: "x", cards: [] };
    await fs.writeFile(
      path.join(workDir, "data", "collection.json"),
      JSON.stringify(payload),
      "utf8",
    );

    const { loadCollection, CollectionVersionMismatch } = await loadStorage();

    await expect(loadCollection()).rejects.toThrow(CollectionVersionMismatch);
    await expect(loadCollection()).rejects.toMatchObject({
      code: "COLLECTION_VERSION_MISMATCH",
      found: 99,
      expected: 1,
    });
  });
});

describe("writeCollectionAtomic", () => {
  it("writes via temp + rename and refreshes updatedAt", async () => {
    const { writeCollectionAtomic, loadCollection } = await loadStorage();

    const result = await writeCollectionAtomic({
      cards: [{ scryfallId: "a", oracleId: "b", name: "Test", stacks: [] }],
    });

    expect(result.cards).toHaveLength(1);
    expect(result.version).toBe(1);
    expect(result.updatedAt).toBeTruthy();

    const reloaded = await loadCollection();
    expect(reloaded.collection.cards).toHaveLength(1);
    expect(reloaded.collection.cards[0].name).toBe("Test");
  });

  it("normalizes missing cards array to []", async () => {
    const { writeCollectionAtomic } = await loadStorage();
    const result = await writeCollectionAtomic({});
    expect(result.cards).toEqual([]);
  });

  it("leaves no stray .tmp file when write succeeds", async () => {
    const { writeCollectionAtomic } = await loadStorage();
    await writeCollectionAtomic({ cards: [] });

    const dataFiles = await fs.readdir(path.join(workDir, "data"));
    const tmpFile = dataFiles.find(n => n.includes(".tmp."));
    expect(tmpFile).toBeUndefined();
  });

  it("creates data/ if it doesn't exist", async () => {
    await fs.rm(path.join(workDir, "data"), { recursive: true, force: true });

    const { writeCollectionAtomic } = await loadStorage();
    await expect(writeCollectionAtomic({ cards: [] })).resolves.toBeDefined();

    const exists = await fs.stat(path.join(workDir, "data", "collection.json"));
    expect(exists.isFile()).toBe(true);
  });
});

describe("emptyCollection", () => {
  it("returns a valid empty shape", async () => {
    const { emptyCollection } = await loadStorage();
    const empty = emptyCollection();
    expect(empty.version).toBe(1);
    expect(empty.cards).toEqual([]);
    expect(empty.updatedAt).toBeTruthy();
  });
});

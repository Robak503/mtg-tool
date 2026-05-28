/**
 * paths.js — fallback semantics for dataPath when MTG_REFERENCE_DIR
 * is set. Verifies the .exe production case where bundled reference
 * data is read straight from resources/ without copying it to AppData.
 */

import { describe, expect, it, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

let appRootDir;
let refDir;
let originalCwd;
let originalAppRoot;
let originalRefDir;

beforeEach(async () => {
  appRootDir = await fs.mkdtemp(path.join(os.tmpdir(), "paths-approot-"));
  refDir = await fs.mkdtemp(path.join(os.tmpdir(), "paths-refdir-"));
  originalCwd = process.cwd();
  originalAppRoot = process.env.MTG_APP_ROOT;
  originalRefDir = process.env.MTG_REFERENCE_DIR;
  process.chdir(appRootDir);
});

afterEach(async () => {
  process.chdir(originalCwd);
  if (originalAppRoot === undefined) delete process.env.MTG_APP_ROOT;
  else process.env.MTG_APP_ROOT = originalAppRoot;
  if (originalRefDir === undefined) delete process.env.MTG_REFERENCE_DIR;
  else process.env.MTG_REFERENCE_DIR = originalRefDir;
  await fs.rm(appRootDir, { recursive: true, force: true });
  await fs.rm(refDir, { recursive: true, force: true });
});

async function loadPaths() {
  const mod = await import("./paths.js?bust=" + Math.random());
  return mod;
}

describe("paths.dataPath — reference dir fallback", () => {
  it("returns appRoot/data path when MTG_REFERENCE_DIR is unset (dev mode)", async () => {
    delete process.env.MTG_REFERENCE_DIR;
    const { dataPath } = await loadPaths();
    const p = dataPath("rules-index.json");
    expect(p).toBe(path.join(appRootDir, "data", "rules-index.json"));
  });

  it("returns appRoot/data path even with refdir set, when the live file exists", async () => {
    // Live file present → reference fallback should NOT trigger.
    await fs.mkdir(path.join(appRootDir, "data"), { recursive: true });
    await fs.writeFile(path.join(appRootDir, "data", "oracle-index.json"), "{live}");
    await fs.mkdir(path.join(refDir, "scryfall-bulk"), { recursive: true });
    await fs.writeFile(path.join(refDir, "oracle-index.json"), "{bundled}");
    process.env.MTG_REFERENCE_DIR = refDir;

    const { dataPath } = await loadPaths();
    const p = dataPath("oracle-index.json");
    expect(p).toBe(path.join(appRootDir, "data", "oracle-index.json"));
  });

  it("falls back to MTG_REFERENCE_DIR when the live file is missing", async () => {
    // Live file absent, bundled file present → fallback wins.
    await fs.mkdir(path.join(refDir, "scryfall-bulk"), { recursive: true });
    await fs.writeFile(
      path.join(refDir, "scryfall-bulk", "oracle_cards.json"),
      "[bundled]",
    );
    process.env.MTG_REFERENCE_DIR = refDir;

    const { dataPath } = await loadPaths();
    const p = dataPath("scryfall-bulk", "oracle_cards.json");
    expect(p).toBe(path.join(refDir, "scryfall-bulk", "oracle_cards.json"));
  });

  it("returns the appRoot path when neither location has the file (so writes go where expected)", async () => {
    process.env.MTG_REFERENCE_DIR = refDir;
    const { dataPath } = await loadPaths();
    const p = dataPath("decks.local.json");
    // The writable side is always appRoot/data, even when nothing exists yet.
    expect(p).toBe(path.join(appRootDir, "data", "decks.local.json"));
  });

  it("once a write lands in appRoot/data, subsequent reads return the live path (not the bundle)", async () => {
    // Simulate: bundle has v1, app writes v2 → reads should see v2.
    await fs.mkdir(path.join(refDir, "spellbook"), { recursive: true });
    await fs.writeFile(path.join(refDir, "spellbook-combos.local.json"), "v1");
    process.env.MTG_REFERENCE_DIR = refDir;

    const { dataPath } = await loadPaths();
    // First read: nothing in appRoot, falls back to refdir.
    let p = dataPath("spellbook-combos.local.json");
    expect(p).toBe(path.join(refDir, "spellbook-combos.local.json"));

    // App refreshes data → writes new copy to appRoot.
    await fs.mkdir(path.join(appRootDir, "data"), { recursive: true });
    await fs.writeFile(
      path.join(appRootDir, "data", "spellbook-combos.local.json"),
      "v2",
    );

    // Second read: live exists, fallback skipped.
    p = dataPath("spellbook-combos.local.json");
    expect(p).toBe(path.join(appRootDir, "data", "spellbook-combos.local.json"));
  });
});

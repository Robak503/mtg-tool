/**
 * Tests for edhrecSalt.js.
 *
 * Primary purpose: verify salt data resolves through paths.js (`dataPath`) from
 * the writable data dir, not relative to the source file. This is a regression
 * guard — the previous `path.join(__dirname, "../../../data")` ignored cwd and
 * the MTG_REFERENCE_DIR / AppData override, so an in-app sync was invisible and
 * lookups broke in the packaged .exe. The chdir-to-tmpdir setup makes the old
 * code (which read the real app/data) fail and the fixed code pass.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

let tmpDir;
let originalCwd;

async function loadModule() {
  return await import("./edhrecSalt.js");
}

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "edhrec-salt-test-"));
  await fs.mkdir(path.join(tmpDir, "data"), { recursive: true });
  originalCwd = process.cwd();
  process.chdir(tmpDir);
  // Fresh module each test — edhrecSalt caches its index in module scope.
  vi.resetModules();
});

afterEach(async () => {
  process.chdir(originalCwd);
  await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
});

describe("edhrecSalt — data resolution via paths.js", () => {
  it("loads salt entries written to <cwd>/data and looks them up", async () => {
    await fs.writeFile(
      path.join(tmpDir, "data", "edhrec-salt.local.json"),
      JSON.stringify([
        { name: "Sol Ring", salt: 1.23, rank: 1, numDecks: 1000 },
        { name: "Rhystic Study", salt: 2.5, rank: 2, numDecks: 900 },
      ])
    );

    const { edhrecSaltReady, lookupSalt, evaluateDeckSalt } = await loadModule();
    expect(edhrecSaltReady()).toBe(true);

    const entry = lookupSalt("Sol Ring");
    expect(entry).toBeTruthy();
    expect(entry.salt).toBe(1.23);

    const result = evaluateDeckSalt(["Sol Ring", "Rhystic Study"]);
    expect(result.ready).toBe(true);
    expect(result.count).toBe(2);
    // Sorted by salt descending — Rhystic Study (2.5) outranks Sol Ring (1.23).
    expect(result.topCards[0].name).toBe("Rhystic Study");
  });

  it("reports not-ready when the salt file is absent", async () => {
    const { edhrecSaltReady, evaluateDeckSalt } = await loadModule();
    expect(edhrecSaltReady()).toBe(false);
    expect(evaluateDeckSalt(["Sol Ring"]).ready).toBe(false);
  });

  it("returns meta when the meta file is present", async () => {
    await fs.writeFile(
      path.join(tmpDir, "data", "edhrec-salt.local.json"),
      JSON.stringify([{ name: "Sol Ring", salt: 1.23, rank: 1, numDecks: 1000 }])
    );
    await fs.writeFile(
      path.join(tmpDir, "data", "edhrec-salt-meta.local.json"),
      JSON.stringify({ syncedAt: "2026-05-28T00:00:00.000Z", count: 1 })
    );

    const { getEdhrecSaltMeta } = await loadModule();
    expect(getEdhrecSaltMeta()).toEqual({ syncedAt: "2026-05-28T00:00:00.000Z", count: 1 });
  });
});

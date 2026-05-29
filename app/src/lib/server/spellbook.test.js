/**
 * Tests for spellbook.js.
 *
 * Primary purpose: verify combo data resolves through paths.js (`dataPath`)
 * from the writable data dir, not relative to the source file. Regression guard
 * for the old `path.join(__dirname, "../../../data")`, which ignored cwd and the
 * MTG_REFERENCE_DIR / AppData override and broke in the packaged .exe. Also
 * covers the core findCombos matching (full hit + almost-hit).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

let tmpDir;
let originalCwd;

async function loadModule() {
  return await import("./spellbook.js");
}

async function writeFixtures(dir) {
  await fs.writeFile(
    path.join(dir, "data", "spellbook-combos.local.json"),
    JSON.stringify([
      {
        id: "combo-1",
        cards: ["Card A", "Card B"],
        produces: ["infinite mana"],
        bracketTag: "C",
        popularity: 100,
      },
    ])
  );
  await fs.writeFile(
    path.join(dir, "data", "spellbook-index.local.json"),
    JSON.stringify({ "card a": ["combo-1"], "card b": ["combo-1"] })
  );
  await fs.writeFile(
    path.join(dir, "data", "spellbook-meta.local.json"),
    JSON.stringify({ syncedAt: "2026-05-28T00:00:00.000Z", variants: 1, cards: 2 })
  );
}

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "spellbook-test-"));
  await fs.mkdir(path.join(tmpDir, "data"), { recursive: true });
  originalCwd = process.cwd();
  process.chdir(tmpDir);
  // Fresh module each test — spellbook caches its combo index in module scope.
  vi.resetModules();
});

afterEach(async () => {
  process.chdir(originalCwd);
  await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
});

describe("spellbook — data resolution via paths.js", () => {
  it("loads combo data written to <cwd>/data and returns its meta", async () => {
    await writeFixtures(tmpDir);
    const { spellbookReady, getSpellbookMeta } = await loadModule();
    expect(spellbookReady()).toBe(true);
    expect(getSpellbookMeta()).toEqual({
      syncedAt: "2026-05-28T00:00:00.000Z",
      variants: 1,
      cards: 2,
    });
  });

  it("reports not-ready when combo files are absent", async () => {
    const { spellbookReady, findCombos } = await loadModule();
    expect(spellbookReady()).toBe(false);
    expect(findCombos(["Card A"]).ready).toBe(false);
  });
});

describe("spellbook — findCombos matching", () => {
  it("detects a fully-present combo and a one-card-away combo", async () => {
    await writeFixtures(tmpDir);
    const { findCombos } = await loadModule();

    const full = findCombos(["Card A", "Card B"]);
    expect(full.ready).toBe(true);
    expect(full.included).toHaveLength(1);
    expect(full.included[0].id).toBe("combo-1");

    const almost = findCombos(["Card A"]);
    expect(almost.included).toHaveLength(0);
    expect(almost.almostIncluded).toHaveLength(1);
    expect(almost.almostIncluded[0].missingCard).toBe("Card B");
  });
});

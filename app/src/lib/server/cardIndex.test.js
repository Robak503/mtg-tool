/**
 * Tests for cardIndex.js — slim oracle index preferred path, fallback to the
 * full 165MB file, normalizeName edge cases.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

let tmpDir;
let originalCwd;

async function loadModule() {
  return await import("./cardIndex.js");
}

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "card-index-test-"));
  await fs.mkdir(path.join(tmpDir, "data", "scryfall-bulk"), { recursive: true });
  originalCwd = process.cwd();
  process.chdir(tmpDir);
  // Fresh module each test — cardIndex caches a singleton.
  vi.resetModules();
});

afterEach(async () => {
  process.chdir(originalCwd);
  await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
});

describe("normalizeName", () => {
  it("normalises basic ASCII names", async () => {
    const { normalizeName } = await loadModule();
    expect(normalizeName("Lightning Bolt")).toBe("lightning bolt");
  });

  it("normalises curly apostrophes and unicode", async () => {
    const { normalizeName } = await loadModule();
    expect(normalizeName("Æther Vial")).toMatch(/aether vial|ther vial/);
    // normalizeName converts curly apostrophes to ASCII then strips them,
    // leaving a space — "Sol's Acolyte" → "sol s acolyte".
    expect(normalizeName("Sol’s Acolyte")).toBe("sol s acolyte");
  });

  it("returns empty string for empty input (no crash)", async () => {
    const { normalizeName } = await loadModule();
    expect(normalizeName("")).toBe("");
    expect(normalizeName(null)).toBe("");
    expect(normalizeName(undefined)).toBe("");
  });
});

describe("slim oracle index path", () => {
  it("loads cards from oracle-index.json when present", async () => {
    await fs.writeFile(
      path.join(tmpDir, "data", "scryfall-bulk", "oracle-index.json"),
      JSON.stringify({
        generatedAt: new Date().toISOString(),
        count: 1,
        cards: [
          {
            name: "Lightning Bolt",
            oracle_id: "bolt-id",
            type_line: "Instant",
            oracle_text: "Deal 3 damage.",
            mana_cost: "{R}",
            cmc: 1,
            color_identity: ["R"],
            legalities: { commander: "legal" },
            layout: "normal",
          },
        ],
      })
    );

    const { lookupCard, getCardIndex } = await loadModule();
    const repo = getCardIndex();
    expect(repo.count).toBe(1);
    expect(repo.file).toMatch(/oracle-index\.json$/);

    const card = lookupCard("Lightning Bolt");
    expect(card).toBeTruthy();
    expect(card.oracle_text).toMatch(/3 damage/i);
  });
});

describe("fallback to full oracle file", () => {
  it("falls back to oracle_cards.json when the slim index is absent", async () => {
    await fs.writeFile(
      path.join(tmpDir, "data", "scryfall-bulk", "oracle_cards.json"),
      JSON.stringify([
        {
          name: "Sol Ring",
          oracle_id: "sol-id",
          type_line: "Artifact",
          oracle_text: "{T}: Add {C}{C}.",
          cmc: 1,
          color_identity: [],
          legalities: { commander: "legal" },
          layout: "normal",
        },
      ])
    );

    const { getCardIndex, lookupCard } = await loadModule();
    const repo = getCardIndex();
    expect(repo.file).toMatch(/oracle_cards\.json$/);
    expect(lookupCard("Sol Ring")).toBeTruthy();
  });

  it("throws ENOENT with a helpful hint when no source exists", async () => {
    const { getCardIndex } = await loadModule();
    let caught;
    try {
      getCardIndex();
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeTruthy();
    expect(caught.code).toBe("ENOENT");
    expect(caught.message).toMatch(/Local Oracle repository missing/);
  });
});

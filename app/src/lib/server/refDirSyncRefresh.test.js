/**
 * refDirSyncRefresh.test.js — pins the packaged-.exe "sync refresh" contract
 * for the two singleton indexes that used to capture their dataPath() result
 * at module load (cardIndex.js, rulesRetrieval.js).
 *
 * In the .exe, MTG_REFERENCE_DIR points at the read-only bundled snapshot and
 * the writable app root starts empty, so first load resolves to the bundle.
 * An in-app sync (/api/sync-data) then writes a fresher copy under the app
 * root and calls invalidateCachesFor(), which drops the in-memory singletons.
 * The rebuild MUST re-resolve the path — a path captured once at import kept
 * re-reading the frozen bundled file forever (S-P1-1). These tests exercise
 * exactly that sequence: bundle-first read → app-root write → cache reset →
 * fresh read from the app root.
 *
 * Env-shimming pattern follows profilesRefDir.test.js, but with MTG_APP_ROOT
 * (not chdir) so the modules' own reset functions — the production
 * invalidation path — are what pick up the change.
 */
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

import {
  getCardIndex,
  lookupCard,
  getRulingsIndex,
  resetCardIndexForTests,
} from "./cardIndex.js";
import { retrieveRules, resetRulesRetrievalForTests } from "./rulesRetrieval.js";

let appRootDir;
let refDir;
let originalAppRoot;
let originalRefDir;

function oracleIndexPayload(cardName) {
  return {
    generatedAt: "2026-01-01T00:00:00.000Z",
    count: 1,
    cards: [
      {
        name: cardName,
        oracle_id: `${cardName.toLowerCase().replace(/\s+/g, "-")}-id`,
        type_line: "Instant",
        oracle_text: "Test text.",
        mana_cost: "{R}",
        cmc: 1,
        color_identity: ["R"],
        legalities: { commander: "legal" },
        layout: "normal",
      },
    ],
  };
}

function rulesIndexPayload(ruleNumber, keyword) {
  return [{ ruleNumber, text: `Rule ${ruleNumber} body.`, keywords: [keyword] }];
}

async function writeJson(file, payload) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(payload, null, 2));
}

beforeEach(async () => {
  appRootDir = await fs.mkdtemp(path.join(os.tmpdir(), "refdir-sync-app-"));
  refDir = await fs.mkdtemp(path.join(os.tmpdir(), "refdir-sync-ref-"));
  originalAppRoot = process.env.MTG_APP_ROOT;
  originalRefDir = process.env.MTG_REFERENCE_DIR;
  process.env.MTG_APP_ROOT = appRootDir; // writable app root (empty data/)
  process.env.MTG_REFERENCE_DIR = refDir; // read-only bundled snapshot
  await fs.mkdir(path.join(appRootDir, "data"), { recursive: true });
  resetCardIndexForTests();
  resetRulesRetrievalForTests();
});

afterEach(async () => {
  resetCardIndexForTests();
  resetRulesRetrievalForTests();
  if (originalAppRoot === undefined) delete process.env.MTG_APP_ROOT;
  else process.env.MTG_APP_ROOT = originalAppRoot;
  if (originalRefDir === undefined) delete process.env.MTG_REFERENCE_DIR;
  else process.env.MTG_REFERENCE_DIR = originalRefDir;
  await fs.rm(appRootDir, { recursive: true, force: true }).catch(() => {});
  await fs.rm(refDir, { recursive: true, force: true }).catch(() => {});
});

describe("cardIndex × MTG_REFERENCE_DIR sync refresh", () => {
  it("reads the bundle on a fresh install, then the app-root copy after sync + invalidation", async () => {
    const bundled = path.join(refDir, "scryfall-bulk", "oracle-index.json");
    await writeJson(bundled, oracleIndexPayload("Bundled Bolt"));

    // Fresh install: app root has no oracle data → resolves to the bundle.
    expect(getCardIndex().file).toBe(bundled);
    expect(lookupCard("Bundled Bolt")).toBeTruthy();

    // In-app sync writes a fresher copy into the WRITABLE app root.
    const synced = path.join(appRootDir, "data", "scryfall-bulk", "oracle-index.json");
    await writeJson(synced, oracleIndexPayload("Synced Ring"));

    // Until the cache is invalidated the in-memory index still serves the old
    // snapshot (singleton semantics)...
    expect(lookupCard("Synced Ring")).toBeNull();

    // ...but invalidation + rebuild must pick up the app-root file, not the
    // path frozen at module load.
    resetCardIndexForTests();
    expect(getCardIndex().file).toBe(synced);
    expect(lookupCard("Synced Ring")).toBeTruthy();
    expect(lookupCard("Bundled Bolt")).toBeNull();
  });

  it("rulings follow the same bundle-then-app-root re-resolution", async () => {
    await writeJson(
      path.join(refDir, "scryfall-bulk", "oracle-index.json"),
      oracleIndexPayload("Bundled Bolt"),
    );
    const bundledRulings = path.join(refDir, "scryfall-bulk", "rulings.json");
    await writeJson(bundledRulings, [
      { oracle_id: "bundled-bolt-id", source: "wotc", published_at: "2020-01-01", comment: "Bundled ruling." },
    ]);

    expect(getRulingsIndex().file).toBe(bundledRulings);
    expect(getRulingsIndex().byOracleId.get("bundled-bolt-id")).toHaveLength(1);

    const syncedRulings = path.join(appRootDir, "data", "scryfall-bulk", "rulings.json");
    await writeJson(syncedRulings, [
      { oracle_id: "bundled-bolt-id", source: "wotc", published_at: "2026-01-01", comment: "Synced ruling A." },
      { oracle_id: "bundled-bolt-id", source: "wotc", published_at: "2026-01-02", comment: "Synced ruling B." },
    ]);

    resetCardIndexForTests();
    expect(getRulingsIndex().file).toBe(syncedRulings);
    expect(getRulingsIndex().byOracleId.get("bundled-bolt-id")).toHaveLength(2);
  });
});

describe("rulesRetrieval × MTG_REFERENCE_DIR sync refresh", () => {
  it("reads the bundled rules index first, then the app-root copy after sync + invalidation", async () => {
    // retrieveRules touches the card index for card-name detection — give it a
    // card source so the rules path is what's under test.
    await writeJson(
      path.join(refDir, "scryfall-bulk", "oracle-index.json"),
      oracleIndexPayload("Bundled Bolt"),
    );
    await writeJson(
      path.join(refDir, "rules-index.json"),
      rulesIndexPayload("100.1", "bundledword"),
    );

    const fromBundle = retrieveRules("bundledword question");
    expect(fromBundle.rules.map(r => r.ruleNumber)).toContain("100.1");

    // Sync writes a fresher index to the app root; after invalidation the
    // retrieval must serve the new rules and drop the old ones.
    await writeJson(
      path.join(appRootDir, "data", "rules-index.json"),
      rulesIndexPayload("200.1", "syncedword"),
    );
    resetRulesRetrievalForTests();

    const fromAppRoot = retrieveRules("syncedword question");
    expect(fromAppRoot.rules.map(r => r.ruleNumber)).toContain("200.1");
    expect(retrieveRules("bundledword question").rules.map(r => r.ruleNumber)).not.toContain("100.1");
  });
});

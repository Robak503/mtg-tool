/**
 * paths.js — REFERENCE DATA FRESHNESS (2026-09-29).
 *
 * Found live on the build box: the v0.160.0 app kept reading its 2026-07-19 reference sync for 72 days,
 * because dataPath() returned the writable AppData copy whenever one existed — every newer bundle an app
 * update brought was shadowed. The rule pinned here: for the five REFERENCE groups only, a bundled copy
 * whose group stamp is STRICTLY newer than the synced copy's is read instead. Ties and unprovable
 * comparisons keep the synced copy (false-negative safe), and user data (price history, play hints,
 * caches, logs) is never shadowed by the bundle, however new.
 *
 * The stamps deliberately DISAGREE with file mtimes in several cases, so an implementation that compares
 * per-file mtimes (or ignores the embedded stamp) fails loudly.
 */

import { describe, expect, it, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

let appRootDir;
let refDir;
let originalAppRoot;
let originalRefDir;

beforeEach(async () => {
  appRootDir = await fs.mkdtemp(path.join(os.tmpdir(), "freshness-approot-"));
  refDir = await fs.mkdtemp(path.join(os.tmpdir(), "freshness-refdir-"));
  originalAppRoot = process.env.MTG_APP_ROOT;
  originalRefDir = process.env.MTG_REFERENCE_DIR;
  process.env.MTG_APP_ROOT = appRootDir;
  process.env.MTG_REFERENCE_DIR = refDir;
});

afterEach(async () => {
  if (originalAppRoot === undefined) delete process.env.MTG_APP_ROOT;
  else process.env.MTG_APP_ROOT = originalAppRoot;
  if (originalRefDir === undefined) delete process.env.MTG_REFERENCE_DIR;
  else process.env.MTG_REFERENCE_DIR = originalRefDir;
  await fs.rm(appRootDir, { recursive: true, force: true });
  await fs.rm(refDir, { recursive: true, force: true });
});

const live = (...parts) => path.join(appRootDir, "data", ...parts);
const bundle = (...parts) => path.join(refDir, ...parts);

/** Write a file and pin its mtime (never rely on write order — two writes can share a millisecond). */
async function put(file, content, mtimeIso) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, content);
  const t = new Date(mtimeIso);
  await fs.utimes(file, t, t);
}

async function loadPaths() {
  return import("./paths.js?bust=" + Math.random());
}

describe("dataPath — a newer bundle outranks an older synced copy (reference groups only)", () => {
  it("scryfall-bulk: the bundled manifest's generatedAt decides for EVERY member, not per-file mtimes", async () => {
    await put(live("scryfall-bulk", "manifest.json"), JSON.stringify({ generatedAt: "2026-07-19T03:03:54.789Z" }), "2026-07-19T03:04:00Z");
    // Synced members carry mtimes NEWER than the bundle's — a per-file mtime comparison would keep them.
    await put(live("scryfall-bulk", "oracle-index.json"), '{"generatedAt":"2026-07-19T03:04:14.272Z","cards":[]}', "2026-09-01T00:00:00Z");
    await put(live("scryfall-bulk", "rulings.json"), "[]", "2026-09-01T00:00:00Z");
    await put(bundle("scryfall-bulk", "manifest.json"), JSON.stringify({ generatedAt: "2026-08-16T10:53:09.000Z" }), "2026-08-16T10:53:09Z");
    await put(bundle("scryfall-bulk", "oracle-index.json"), '{"generatedAt":"2026-08-16T10:53:11.987Z","cards":[]}', "2026-08-16T10:53:12Z");
    await put(bundle("scryfall-bulk", "rulings.json"), "[]", "2026-08-16T10:53:12Z");

    const { dataPath } = await loadPaths();
    expect(dataPath("scryfall-bulk", "oracle-index.json")).toBe(bundle("scryfall-bulk", "oracle-index.json"));
    expect(dataPath("scryfall-bulk", "rulings.json")).toBe(bundle("scryfall-bulk", "rulings.json"));
    expect(dataPath("scryfall-bulk", "manifest.json")).toBe(bundle("scryfall-bulk", "manifest.json"));
  });

  it("a sync AFTER the update wins: an older bundle never outranks a newer synced copy", async () => {
    await put(live("scryfall-bulk", "manifest.json"), JSON.stringify({ generatedAt: "2026-08-20T00:00:00.000Z" }), "2026-08-20T00:00:00Z");
    await put(live("scryfall-bulk", "oracle-index.json"), "{}", "2026-08-20T00:00:00Z");
    await put(bundle("scryfall-bulk", "manifest.json"), JSON.stringify({ generatedAt: "2026-08-16T10:53:09.000Z" }), "2026-08-16T10:53:09Z");
    await put(bundle("scryfall-bulk", "oracle-index.json"), "{}", "2026-08-16T10:53:12Z");

    const { dataPath } = await loadPaths();
    expect(dataPath("scryfall-bulk", "oracle-index.json")).toBe(live("scryfall-bulk", "oracle-index.json"));
  });

  it("a tie keeps the synced copy", async () => {
    const stamp = JSON.stringify({ generatedAt: "2026-08-16T10:53:09.000Z" });
    await put(live("scryfall-bulk", "manifest.json"), stamp, "2026-08-16T10:53:09Z");
    await put(live("scryfall-bulk", "oracle-index.json"), "{}", "2026-08-16T10:53:12Z");
    await put(bundle("scryfall-bulk", "manifest.json"), stamp, "2026-08-16T10:53:09Z");
    await put(bundle("scryfall-bulk", "oracle-index.json"), "{}", "2026-08-16T10:53:12Z");

    const { dataPath } = await loadPaths();
    expect(dataPath("scryfall-bulk", "oracle-index.json")).toBe(live("scryfall-bulk", "oracle-index.json"));
  });

  it("an unprovable comparison keeps the synced copy: the synced side has no group stamp", async () => {
    // Synced Spellbook combos with NO synced meta; the bundle has a meta. Nothing proves the bundle is newer.
    await put(live("spellbook-combos.local.json"), "[]", "2026-07-19T03:04:00Z");
    await put(bundle("spellbook-combos.local.json"), "[]", "2026-08-16T10:55:00Z");
    await put(bundle("spellbook-meta.local.json"), JSON.stringify({ syncedAt: "2026-08-16T10:55:00.000Z" }), "2026-08-16T10:55:00Z");

    const { dataPath } = await loadPaths();
    expect(dataPath("spellbook-combos.local.json")).toBe(live("spellbook-combos.local.json"));
  });

  it("user data is NEVER shadowed by the bundle, however new (price history, play hints)", async () => {
    await put(live("collection-prices.jsonl"), '{"generatedAt":"2026-07-01T00:00:00.000Z"}\n', "2026-07-01T00:00:00Z");
    await put(bundle("collection-prices.jsonl"), '{"generatedAt":"2026-08-16T00:00:00.000Z"}\n', "2026-08-16T00:00:00Z");
    await put(live("card-play-hints.json"), '{"generatedAt":"2026-07-01T00:00:00.000Z"}', "2026-07-01T00:00:00Z");
    await put(bundle("card-play-hints.json"), '{"generatedAt":"2026-08-16T00:00:00.000Z"}', "2026-08-16T00:00:00Z");

    const { dataPath } = await loadPaths();
    expect(dataPath("collection-prices.jsonl")).toBe(live("collection-prices.jsonl"));
    expect(dataPath("card-play-hints.json")).toBe(live("card-play-hints.json"));
  });

  it("the Spellbook four follow spellbook-meta's syncedAt as one group", async () => {
    const files = ["spellbook-combos.local.json", "spellbook-index.local.json", "spellbook-cards.local.json"];
    await put(live("spellbook-meta.local.json"), JSON.stringify({ syncedAt: "2026-07-19T03:06:09.901Z" }), "2026-07-19T03:06:10Z");
    await put(bundle("spellbook-meta.local.json"), JSON.stringify({ syncedAt: "2026-08-16T10:57:00.000Z" }), "2026-08-16T10:57:00Z");
    for (const f of files) {
      await put(live(f), "[]", "2026-07-19T03:06:10Z");
      await put(bundle(f), "[]", "2026-08-16T10:57:00Z");
    }

    const { dataPath } = await loadPaths();
    for (const f of [...files, "spellbook-meta.local.json"]) expect(dataPath(f)).toBe(bundle(f));
  });

  it("the EDHREC salt pair follows edhrec-salt-meta's syncedAt", async () => {
    await put(live("edhrec-salt-meta.local.json"), JSON.stringify({ syncedAt: "2026-07-19T03:06:39.919Z" }), "2026-07-19T03:06:40Z");
    await put(live("edhrec-salt.local.json"), "{}", "2026-07-19T03:06:40Z");
    await put(bundle("edhrec-salt-meta.local.json"), JSON.stringify({ syncedAt: "2026-08-16T10:56:00.000Z" }), "2026-08-16T10:56:00Z");
    await put(bundle("edhrec-salt.local.json"), "{}", "2026-08-16T10:56:00Z");

    const { dataPath } = await loadPaths();
    expect(dataPath("edhrec-salt.local.json")).toBe(bundle("edhrec-salt.local.json"));
    expect(dataPath("edhrec-salt-meta.local.json")).toBe(bundle("edhrec-salt-meta.local.json"));
  });

  it("cardkingdom-prices reads its OWN embedded generatedAt, not the file mtime", async () => {
    // Embedded stamps say the bundle is newer; the mtimes say the opposite. The embedded stamp must win.
    await put(live("cardkingdom-prices.json"), '{"generatedAt":"2026-07-19T03:06:44.231Z","prices":{}}', "2026-09-01T00:00:00Z");
    await put(bundle("cardkingdom-prices.json"), '{"generatedAt":"2026-08-16T10:58:00.000Z","prices":{}}', "2026-08-16T10:58:00Z");

    const { dataPath } = await loadPaths();
    expect(dataPath("cardkingdom-prices.json")).toBe(bundle("cardkingdom-prices.json"));
  });

  it("rules-index (a bare array — no embedded stamp) decides by file mtime, both ways", async () => {
    await put(live("rules-index.json"), "[]", "2026-07-19T03:06:44Z");
    await put(bundle("rules-index.json"), "[]", "2026-08-16T10:54:00Z");
    let { dataPath } = await loadPaths();
    expect(dataPath("rules-index.json")).toBe(bundle("rules-index.json"));

    await put(live("rules-index.json"), "[]", "2026-09-01T00:00:00Z"); // a later in-app rebuild
    ({ dataPath } = await loadPaths());
    expect(dataPath("rules-index.json")).toBe(live("rules-index.json"));
  });

  it("an unparseable embedded stamp falls back to that file's own mtime (it is not treated as unknown)", async () => {
    // Synced manifest's stamp is garbage; its mtime (07-01) is older than the bundle's stamp (08-16) → bundle.
    await put(live("scryfall-bulk", "manifest.json"), JSON.stringify({ generatedAt: "not-a-date" }), "2026-07-01T00:00:00Z");
    await put(live("scryfall-bulk", "oracle-index.json"), "{}", "2026-07-01T00:00:00Z");
    await put(bundle("scryfall-bulk", "manifest.json"), JSON.stringify({ generatedAt: "2026-08-16T10:53:09.000Z" }), "2026-08-16T10:53:09Z");
    await put(bundle("scryfall-bulk", "oracle-index.json"), "{}", "2026-08-16T10:53:12Z");

    const { dataPath } = await loadPaths();
    expect(dataPath("scryfall-bulk", "oracle-index.json")).toBe(bundle("scryfall-bulk", "oracle-index.json"));
  });

  it("a member only the synced side has still reads the synced copy (nothing to switch to)", async () => {
    await put(live("scryfall-bulk", "manifest.json"), JSON.stringify({ generatedAt: "2026-07-19T03:03:54.789Z" }), "2026-07-19T03:04:00Z");
    await put(live("scryfall-bulk", "unique_artwork.json"), "[]", "2026-07-19T03:04:00Z");
    await put(bundle("scryfall-bulk", "manifest.json"), JSON.stringify({ generatedAt: "2026-08-16T10:53:09.000Z" }), "2026-08-16T10:53:09Z");

    const { dataPath } = await loadPaths();
    expect(dataPath("scryfall-bulk", "unique_artwork.json")).toBe(live("scryfall-bulk", "unique_artwork.json"));
  });
});

describe("dataPathSource — which copy a read resolves to", () => {
  it('reports "bundle" when the newer bundle wins and "appdata" when the synced copy does', async () => {
    await put(live("rules-index.json"), "[]", "2026-07-19T03:06:44Z");
    await put(bundle("rules-index.json"), "[]", "2026-08-16T10:54:00Z");
    await put(live("decks.local.json"), "[]", "2026-07-19T03:06:44Z");

    const { dataPathSource } = await loadPaths();
    expect(dataPathSource("rules-index.json")).toBe("bundle");
    expect(dataPathSource("decks.local.json")).toBe("appdata");
  });

  it('reports "appdata" in dev, where there is no bundle', async () => {
    delete process.env.MTG_REFERENCE_DIR;
    await put(live("rules-index.json"), "[]", "2026-07-19T03:06:44Z");

    const { dataPathSource } = await loadPaths();
    expect(dataPathSource("rules-index.json")).toBe("appdata");
  });
});

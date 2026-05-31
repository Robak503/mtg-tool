/**
 * /api/support-bundle — smoke. Works on a fresh install (everything just reads
 * 0/absent). Confirms it never leaks secrets (only counts + freshness).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

let tmpDir, originalCwd;

async function loadRoute() {
  vi.resetModules();
  return import("./route.js");
}

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "support-bundle-"));
  await fs.mkdir(path.join(tmpDir, "data"), { recursive: true });
  originalCwd = process.cwd();
  process.chdir(tmpDir);
});

afterEach(async () => {
  process.chdir(originalCwd);
  await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
});

describe("/api/support-bundle", () => {
  it("returns a redacted diagnostics bundle", async () => {
    const route = await loadRoute();
    const res = await route.GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.kind).toBe("mtg-tool-support");
    expect(typeof body.app.version).toBe("string");
    expect(body.runtime.platform).toBe(process.platform);
    expect(typeof body.text).toBe("string");
    // fresh install: nothing present, all counts zero
    expect(body.data.oracleIndex.present).toBe(false);
    expect(body.content.decks).toBe(0);
  });

  it("reflects content counts + data freshness when files exist", async () => {
    await fs.writeFile(
      path.join(tmpDir, "data", "collection.json"),
      JSON.stringify({ version: 1, cards: [{ name: "Sol Ring" }, { name: "Mana Crypt" }] }),
      "utf8",
    );
    await fs.mkdir(path.join(tmpDir, "data", "scryfall-bulk"), { recursive: true });
    await fs.writeFile(path.join(tmpDir, "data", "scryfall-bulk", "oracle-index.json"), "{}", "utf8");

    const route = await loadRoute();
    const body = await (await route.GET()).json();
    expect(body.content.collectionCards).toBe(2);
    expect(body.data.oracleIndex.present).toBe(true);
  });
});

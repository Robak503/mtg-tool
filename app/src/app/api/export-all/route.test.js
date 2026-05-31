/**
 * /api/export-all — reads user-data files from the data dir and bundles them.
 * chdir into a tmp dir, seed a couple of files, assert the download bundle.
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
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "export-all-"));
  await fs.mkdir(path.join(tmpDir, "data"), { recursive: true });
  originalCwd = process.cwd();
  process.chdir(tmpDir);
});

afterEach(async () => {
  process.chdir(originalCwd);
  await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
});

describe("/api/export-all", () => {
  it("returns an empty-but-valid bundle on a fresh install", async () => {
    const route = await loadRoute();
    const res = await route.GET();
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Disposition")).toMatch(/mtg-tool-backup-.*\.json/);
    const body = await res.json();
    expect(body.kind).toBe("mtg-tool-backup");
    expect(body.sections.decks).toBeNull();
    expect(body.summary.collectionCards).toBe(0);
  });

  it("bundles the user-data files that exist", async () => {
    await fs.writeFile(
      path.join(tmpDir, "data", "decks.local.json"),
      JSON.stringify({ version: 1, decks: [{ id: "d1", name: "Atraxa" }] }),
      "utf8",
    );
    await fs.writeFile(
      path.join(tmpDir, "data", "collection.json"),
      JSON.stringify({ version: 1, cards: [{ name: "Sol Ring" }, { name: "Mana Crypt" }] }),
      "utf8",
    );
    await fs.mkdir(path.join(tmpDir, "data", "feedback"), { recursive: true });
    await fs.writeFile(path.join(tmpDir, "data", "feedback", "a.json"), JSON.stringify({ id: "f1", message: "hi" }), "utf8");

    const route = await loadRoute();
    const res = await route.GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.sections.decks.decks).toHaveLength(1);
    expect(body.summary.collectionCards).toBe(2);
    expect(body.summary.decks).toBe(1);
    expect(body.sections.feedback).toHaveLength(1);
  });
});

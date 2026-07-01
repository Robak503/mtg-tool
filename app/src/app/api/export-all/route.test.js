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

describe("/api/export-all sectionStatus (S-P2-2)", () => {
  it("marks absent sections ok and readable sections ok", async () => {
    await fs.writeFile(
      path.join(tmpDir, "data", "decks.local.json"),
      JSON.stringify({ version: 1, decks: [] }),
      "utf8",
    );
    const route = await loadRoute();
    const body = await (await route.GET()).json();
    expect(body.sectionStatus.decks).toEqual({ ok: true });
    expect(body.sectionStatus.collection).toEqual({ ok: true, absent: true });
    expect(body.sectionStatus.feedback).toEqual({ ok: true, absent: true });
  });

  it("flags an unreadable section instead of silently omitting it", async () => {
    await fs.writeFile(path.join(tmpDir, "data", "chats.local.json"), "{ not json", "utf8");
    await fs.mkdir(path.join(tmpDir, "data", "feedback"), { recursive: true });
    await fs.writeFile(path.join(tmpDir, "data", "feedback", "ok.json"), JSON.stringify({ id: "f1" }), "utf8");
    await fs.writeFile(path.join(tmpDir, "data", "feedback", "bad.json"), "nope", "utf8");

    const route = await loadRoute();
    const res = await route.GET();
    expect(res.status).toBe(200); // the backup still downloads
    const body = await res.json();
    // Data shape unchanged: the broken section is null/partial as before...
    expect(body.sections.chats).toBeNull();
    expect(body.sections.feedback).toHaveLength(1);
    // ...but the failure is now detectable in the bundle metadata.
    expect(body.sectionStatus.chats.ok).toBe(false);
    expect(body.sectionStatus.chats.error).toBeTruthy();
    expect(body.sectionStatus.feedback.ok).toBe(false);
    expect(body.sectionStatus.feedback.error).toMatch(/bad\.json/);
    expect(body.sectionStatus.decks).toEqual({ ok: true, absent: true });
  });
});

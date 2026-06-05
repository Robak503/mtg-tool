/**
 * Tests for /api/decks — atomic, corrupt-resilient, race-safe deck store.
 *
 * tmpdir + process.chdir so paths.js resolves the deck file under the temp
 * tree. The route now runs the profiles migration on each request and resolves
 * its paths lazily, so user decks live under data/profiles/<activeId>/ — the
 * helpers below read the registry to find that path.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

let tmpDir;
let originalCwd;
let route;

function postReq(body) {
  return new Request("http://localhost/api/decks", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const dataDirPath = () => path.join(tmpDir, "data");

async function activeProfileDir() {
  const reg = JSON.parse(await fs.readFile(path.join(dataDirPath(), "profiles.json"), "utf8"));
  return path.join(dataDirPath(), "profiles", reg.activeProfileId);
}

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "decks-test-"));
  await fs.mkdir(dataDirPath(), { recursive: true });
  originalCwd = process.cwd();
  process.chdir(tmpDir);
  vi.resetModules();
  route = await import("./route.js");
});

afterEach(async () => {
  process.chdir(originalCwd);
  await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
});

describe("/api/decks", () => {
  it("GET returns the active profile's decks without throwing (empty on a fresh tree)", async () => {
    const resp = await route.GET();
    expect(resp.status).toBe(200);
    const body = await resp.json();
    expect(Array.isArray(body.decks)).toBe(true);
    // A fresh tree migrates to a single empty default profile — no auto-seeding
    // of the bundled personal deck library into a new namespace.
    expect(body.decks.length).toBe(0);
  });

  it("POST persists a deck atomically into the active profile (read back, no stray .tmp file)", async () => {
    const deck = { name: "Atomic Test Deck", memory: { owner: "Colton" }, cards: [] };
    const resp = await route.POST(postReq({ decks: [deck] }));
    expect(resp.status).toBe(200);
    const saved = await resp.json();
    expect(saved.decks.some(d => d.name === "Atomic Test Deck")).toBe(true);

    const dir = await activeProfileDir();
    const onDisk = JSON.parse(await fs.readFile(path.join(dir, "decks.local.json"), "utf8"));
    expect(onDisk.decks.some(d => d.name === "Atomic Test Deck")).toBe(true);

    // temp file was renamed away, not left behind
    const files = await fs.readdir(dir);
    expect(files.some(f => f.includes(".tmp"))).toBe(false);
  });

  it("POST rejects a non-array decks body with 400", async () => {
    const resp = await route.POST(postReq({ decks: "nope" }));
    expect(resp.status).toBe(400);
  });

  it("recovers from a corrupt deck file (backs it up, no 500)", async () => {
    // Trigger migration so the active profile + its deck file exist.
    await route.GET();
    const dir = await activeProfileDir();
    await fs.writeFile(path.join(dir, "decks.local.json"), "{ this is not valid json", "utf8");

    const resp = await route.GET();
    expect(resp.status).toBe(200); // not a 500

    const body = await resp.json();
    expect(Array.isArray(body.decks)).toBe(true);

    const files = await fs.readdir(dir);
    expect(files.some(f => f.startsWith("decks.local.broken-"))).toBe(true);
  });
});

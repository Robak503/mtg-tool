/**
 * Tests for /api/decks — atomic, corrupt-resilient, race-safe deck store.
 *
 * tmpdir + process.chdir so paths.js resolves the deck file under the temp
 * tree. This works because the route now resolves its paths lazily (the old
 * eager `const DECK_FILE = dataPath(...)` froze the path at import and ignored
 * the changed cwd — a bug this also covers).
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
const deckFilePath = () => path.join(dataDirPath(), "decks.local.json");

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
  it("GET returns seed decks on a fresh tree without throwing", async () => {
    const resp = await route.GET();
    expect(resp.status).toBe(200);
    const body = await resp.json();
    expect(Array.isArray(body.decks)).toBe(true);
    expect(body.decks.length).toBeGreaterThan(0); // seeded
  });

  it("POST persists a deck atomically (read back, no stray .tmp file)", async () => {
    const deck = { name: "Atomic Test Deck", memory: { owner: "Colton" }, cards: [] };
    const resp = await route.POST(postReq({ decks: [deck] }));
    expect(resp.status).toBe(200);
    const saved = await resp.json();
    expect(saved.decks.some(d => d.name === "Atomic Test Deck")).toBe(true);

    const onDisk = JSON.parse(await fs.readFile(deckFilePath(), "utf8"));
    expect(onDisk.decks.some(d => d.name === "Atomic Test Deck")).toBe(true);

    // temp file was renamed away, not left behind
    const files = await fs.readdir(dataDirPath());
    expect(files.some(f => f.includes(".tmp"))).toBe(false);
  });

  it("POST rejects a non-array decks body with 400", async () => {
    const resp = await route.POST(postReq({ decks: "nope" }));
    expect(resp.status).toBe(400);
  });

  it("recovers from a corrupt deck file (backs it up, no 500)", async () => {
    await fs.writeFile(deckFilePath(), "{ this is not valid json", "utf8");

    const resp = await route.GET();
    expect(resp.status).toBe(200); // not a 500

    const body = await resp.json();
    expect(Array.isArray(body.decks)).toBe(true);

    const files = await fs.readdir(dataDirPath());
    expect(files.some(f => f.startsWith("decks.local.broken-"))).toBe(true);
  });
});

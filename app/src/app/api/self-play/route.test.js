/**
 * Tests for /api/self-play — runs an offline self-play batch and writes a .txt.
 *
 * tmpdir + process.chdir so paths.js resolves under the temp tree (no profile
 * registry → profilePath falls back to flat data/, matching /api/games tests).
 * Cards are written WITH engine shape (type/mana/oracle) so they don't depend on
 * the bundled oracle index (absent in a fresh worktree) — enrichDeck is idempotent
 * on already-shaped cards, so the route runs a real game from this fixture alone.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

let tmpDir;
let originalCwd;
let route;

function postReq(body) {
  return new Request("http://localhost/api/self-play", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const dataDirPath = () => path.join(tmpDir, "data");

// Build a deck-store entry whose cards already carry engine shape, so the route's
// enrichDeck is a no-op and the game runs without the oracle index.
function shapedDeck(id, name) {
  const cards = [];
  for (let i = 0; i < 30; i++) {
    cards.push({ qty: 1, name: "Forest", section: "Mainboard", type: "Basic Land — Forest", mana: "", oracle: "{T}: Add {G}." });
  }
  for (let i = 0; i < 30; i++) {
    cards.push({ qty: 1, name: "Grizzly Bears", section: "Mainboard", type: "Creature — Bear", mana: "{1}{G}", oracle: "x" });
  }
  return { id, name, cards };
}

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "self-play-test-"));
  await fs.mkdir(dataDirPath(), { recursive: true });
  // Flat data/decks.local.json (no profile registry → profilePath uses flat data/).
  await fs.writeFile(
    path.join(dataDirPath(), "decks.local.json"),
    JSON.stringify({ version: 1, decks: [
      shapedDeck("a", "Deck A"), shapedDeck("b", "Deck B"),
      shapedDeck("c", "Deck C"), shapedDeck("d", "Deck D"),
    ] }),
    "utf8"
  );
  originalCwd = process.cwd();
  process.chdir(tmpDir);
  vi.resetModules();
  route = await import("./route.js");
});

afterEach(async () => {
  process.chdir(originalCwd);
  await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
});

describe("/api/self-play", () => {
  it("400s when deckIds is missing", async () => {
    const resp = await route.POST(postReq({ mode: "commander" }));
    expect(resp.status).toBe(400);
  });

  it("400s when no deckIds match a saved deck", async () => {
    const resp = await route.POST(postReq({ deckIds: ["nope"], mode: "commander" }));
    expect(resp.status).toBe(400);
  });

  it("runs a commander pod, returns the report, and writes the .txt to disk", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const resp = await route.POST(postReq({ deckIds: ["a", "b", "c", "d"], mode: "commander" }));
    warn.mockRestore();
    log.mockRestore();

    expect(resp.status).toBe(200);
    const body = await resp.json();
    expect(body.ok).toBe(true);
    expect(body.games).toBe(1); // one full 4-player pod
    expect(body.deckNames).toEqual(["Deck A", "Deck B", "Deck C", "Deck D"]);
    expect(typeof body.report).toBe("string");
    expect(body.report).toContain("UNMODELED / BROKEN CARDS");
    expect(body.file).toMatch(/^self-play-.*\.txt$/);

    // The .txt was actually written under data/self-play/.
    const onDisk = await fs.readFile(path.join(dataDirPath(), "self-play", body.file), "utf8");
    expect(onDisk).toContain("MTG Tool — Self-Play Stress Test");
    expect(onDisk).toBe(body.report);
  });
});

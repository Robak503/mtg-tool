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

function getReq(query = "") {
  return new Request(`http://localhost/api/self-play${query}`);
}

// Silence the engine's verbose console during a run, then restore.
async function runPost(body) {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  try {
    return await route.POST(postReq(body));
  } finally {
    warn.mockRestore();
    log.mockRestore();
  }
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
    const resp = await runPost({ deckIds: ["a", "b", "c", "d"], mode: "commander" });

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

  it("scope:pod trims a >4 selection to a single Commander table", async () => {
    // Add a 5th deck so an all-pairings run would build 2 pods; pod scope → 1.
    const decksFile = JSON.parse(await fs.readFile(path.join(dataDirPath(), "decks.local.json"), "utf8"));
    decksFile.decks.push(shapedDeck("e", "Deck E"));
    await fs.writeFile(path.join(dataDirPath(), "decks.local.json"), JSON.stringify(decksFile), "utf8");

    const resp = await runPost({ deckIds: ["a", "b", "c", "d", "e"], mode: "commander", scope: "pod" });
    expect(resp.status).toBe(200);
    const body = await resp.json();
    expect(body.games).toBe(1); // single pod, not two
    expect(body.deckNames).toEqual(["Deck A", "Deck B", "Deck C", "Deck D"]);
  });
});

describe("/api/self-play GET — deck picker + history + stats", () => {
  it("lists the cross-profile deck picker (id/name/profile) by default", async () => {
    const resp = await route.GET(getReq());
    expect(resp.status).toBe(200);
    const body = await resp.json();
    expect(Array.isArray(body.decks)).toBe(true);
    // No registry in this fixture → loadAllProfileDecks reads nothing, so the list
    // is empty (honest: the picker only lists profile-registered decks). The shape
    // is still correct, which is what the UI relies on.
    expect(body).toHaveProperty("decks");
  });

  it("lists saved reports after a run, newest-first, with metadata", async () => {
    const post = await runPost({ deckIds: ["a", "b", "c", "d"], mode: "commander" });
    const { file } = await post.json();

    const resp = await route.GET(getReq("?action=reports"));
    expect(resp.status).toBe(200);
    const body = await resp.json();
    expect(Array.isArray(body.reports)).toBe(true);
    const entry = body.reports.find((r) => r.file === file);
    expect(entry).toBeTruthy();
    expect(entry.mode).toBe("commander");
    expect(entry.deckNames).toEqual(["Deck A", "Deck B", "Deck C", "Deck D"]);
    expect(typeof entry.games).toBe("number");
    expect(typeof entry.breakages).toBe("number");
  });

  it("reads one saved report verbatim via ?action=report&file", async () => {
    const post = await runPost({ deckIds: ["a", "b", "c", "d"], mode: "commander" });
    const { file, report } = await post.json();

    const resp = await route.GET(getReq(`?action=report&file=${encodeURIComponent(file)}`));
    expect(resp.status).toBe(200);
    const body = await resp.json();
    expect(body.file).toBe(file);
    expect(body.report).toBe(report);
  });

  it("rejects a path-traversal report file name", async () => {
    const resp = await route.GET(getReq("?action=report&file=..%2F..%2Fsecret.txt"));
    expect(resp.status).toBe(400);
  });

  it("404s an unknown report file", async () => {
    const resp = await route.GET(getReq("?action=report&file=self-play-nope.txt"));
    expect(resp.status).toBe(404);
  });

  it("reports zero banked-trajectory stats before any record run", async () => {
    const resp = await route.GET(getReq("?action=stats"));
    expect(resp.status).toBe(200);
    const body = await resp.json();
    expect(body).toEqual({ games: 0, rows: 0, files: 0 });
  });

  it("banks a trajectory JSONL when record:true and counts it in stats", async () => {
    const post = await runPost({ deckIds: ["a", "b", "c", "d"], mode: "commander", record: true });
    expect(post.status).toBe(200);
    const body = await post.json();
    // A completed pod yields labeled rows → a JSONL file is written.
    expect(body.trajectoryFile).toMatch(/\.jsonl$/);
    expect(body.trajectoryRows).toBeGreaterThan(0);

    const stats = await (await route.GET(getReq("?action=stats"))).json();
    expect(stats.files).toBe(1);
    expect(stats.rows).toBe(body.trajectoryRows);
  });
});

/**
 * Tests for /api/games-summary — reads data/games/, summarises via
 * gameInsights, returns the structured snapshot. Filtering by deckId.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

let tmpDir;
let originalCwd;
let route;

async function writeRun(filename, entry) {
  const dir = path.join(tmpDir, "data", "games");
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, filename), JSON.stringify(entry), "utf8");
}

async function loadRoute() {
  vi.resetModules();
  return await import("./route.js");
}

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "games-summary-test-"));
  originalCwd = process.cwd();
  process.chdir(tmpDir);
  route = await loadRoute();
});

afterEach(async () => {
  process.chdir(originalCwd);
  await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
});

function makeRun({ deckId = "deck-a", score = 60, archetype = "ramp", mulligans = 0, summary = "", savedAt }) {
  return {
    deckId,
    deckName: "Test Deck",
    score,
    archetype,
    mulligans,
    summary,
    savedAt: savedAt || new Date().toISOString(),
  };
}

describe("GET /api/games-summary", () => {
  it("returns count:0 when no games dir exists", async () => {
    const response = await route.GET(new Request("http://localhost/api/games-summary?deckId=deck-a"));
    const data = await response.json();
    expect(data.count).toBe(0);
  });

  it("aggregates runs for a specific deckId", async () => {
    await writeRun("deck-a-1.json", makeRun({ deckId: "deck-a", score: 60, archetype: "combo" }));
    await writeRun("deck-a-2.json", makeRun({ deckId: "deck-a", score: 70, archetype: "combo" }));
    await writeRun("deck-a-3.json", makeRun({ deckId: "deck-a", score: 65, archetype: "combo" }));
    // Decoy: different deck should be excluded.
    await writeRun("deck-b-1.json", makeRun({ deckId: "deck-b", score: 30, archetype: "aggro" }));

    const response = await route.GET(new Request("http://localhost/api/games-summary?deckId=deck-a"));
    const data = await response.json();
    expect(data.count).toBe(3);
    expect(data.archetype.consensus).toBe("combo");
    expect(data.score.avg).toBe(Math.round((60 + 70 + 65) / 3));
  });

  it("aggregates across ALL decks when no deckId is provided", async () => {
    await writeRun("deck-a-1.json", makeRun({ deckId: "deck-a", score: 60 }));
    await writeRun("deck-b-1.json", makeRun({ deckId: "deck-b", score: 80 }));

    const response = await route.GET(new Request("http://localhost/api/games-summary"));
    const data = await response.json();
    expect(data.count).toBe(2);
  });

  it("sanitises the deckId query param", async () => {
    await writeRun("deck-a-1.json", makeRun({ deckId: "deck-a", score: 60 }));
    // Malicious deckId in query — sanitiseId strips path-traversal chars.
    const response = await route.GET(new Request("http://localhost/api/games-summary?deckId=../../etc"));
    const data = await response.json();
    // The sanitised filter won't match anything (becomes "_.._etc" or similar), so count is 0.
    expect(data.count).toBe(0);
  });

  it("skips corrupted JSON files instead of failing the whole request", async () => {
    await writeRun("deck-a-1.json", makeRun({ deckId: "deck-a", score: 60 }));
    // Drop a corrupted file in the same dir.
    await fs.writeFile(path.join(tmpDir, "data", "games", "deck-a-corrupt.json"), "{not valid", "utf8");

    const response = await route.GET(new Request("http://localhost/api/games-summary?deckId=deck-a"));
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.count).toBe(1);
  });

  it("surfaces weak signals from pacing-poor runs", async () => {
    // Five runs all reporting bad pacing.
    for (let i = 0; i < 5; i++) {
      await writeRun(`deck-a-${i}.json`, makeRun({
        deckId: "deck-a",
        score: 40,
        archetype: "midrange",
        summary: "archetype midrange; commander not cast by turn 6; no early ramp; no early card flow; no clear threat by turn 6",
      }));
    }

    const response = await route.GET(new Request("http://localhost/api/games-summary?deckId=deck-a"));
    const data = await response.json();
    expect(data.count).toBe(5);
    expect(data.weakSignals?.length).toBeGreaterThan(0);
    expect(data.weakSignals.some(s => /Commander/i.test(s))).toBe(true);
  });
});

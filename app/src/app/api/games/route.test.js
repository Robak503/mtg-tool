/**
 * Tests for /api/games — POST happy path, validation, GET filtering, pruning.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

let tmpDir;
let originalCwd;
let route;

async function loadRoute() {
  vi.resetModules();
  return await import("./route.js");
}

async function listGameFiles() {
  const dir = path.join(tmpDir, "data", "games");
  try {
    return await fs.readdir(dir);
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "games-route-test-"));
  originalCwd = process.cwd();
  process.chdir(tmpDir);
  route = await loadRoute();
});

afterEach(async () => {
  process.chdir(originalCwd);
  await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
});

describe("POST /api/games", () => {
  it("writes one JSON file per run with deckId-prefixed filename", async () => {
    const request = new Request("http://localhost/api/games", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        result: {
          deckId: "atraxa-superfriends",
          deckName: "Atraxa Superfriends",
          archetype: "ramp",
          score: 72,
          mulligans: 0,
          summary: "test run",
          turns: [],
        },
      }),
    });
    const response = await route.POST(request);
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.ok).toBe(true);
    expect(data.filename).toMatch(/^atraxa-superfriends-/);
    expect(data.deckId).toBe("atraxa-superfriends");

    const files = await listGameFiles();
    expect(files).toHaveLength(1);
    const entry = JSON.parse(await fs.readFile(path.join(tmpDir, "data", "games", files[0]), "utf8"));
    expect(entry.deckId).toBe("atraxa-superfriends");
    expect(entry.score).toBe(72);
    expect(entry.savedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("sanitises malicious deckId values (no path traversal possible)", async () => {
    const request = new Request("http://localhost/api/games", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        result: {
          deckId: "../../etc/passwd",
          score: 50,
          summary: "test",
        },
      }),
    });
    const response = await route.POST(request);
    expect(response.status).toBe(200);
    const files = await listGameFiles();
    expect(files).toHaveLength(1);
    // The real security property: no path separator survives, and the
    // filename never starts with a dot (no hidden-file or "../" prefix).
    expect(files[0]).not.toContain("/");
    expect(files[0]).not.toContain("\\");
    expect(files[0].startsWith(".")).toBe(false);
    // And the file is genuinely inside the games dir — path.join cannot
    // be tricked because we never had a separator in the first place.
    const fullPath = path.join(tmpDir, "data", "games", files[0]);
    const resolved = path.resolve(fullPath);
    expect(resolved.startsWith(path.resolve(tmpDir, "data", "games"))).toBe(true);
  });

  it("rejects missing result.score", async () => {
    const request = new Request("http://localhost/api/games", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ result: { deckId: "x" } }),
    });
    const response = await route.POST(request);
    expect(response.status).toBe(400);
  });

  it("rejects missing result object", async () => {
    const request = new Request("http://localhost/api/games", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const response = await route.POST(request);
    expect(response.status).toBe(400);
  });

  it("rejects invalid JSON", async () => {
    const request = new Request("http://localhost/api/games", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{not valid",
    });
    const response = await route.POST(request);
    expect(response.status).toBe(400);
  });

  it("returns 507 on ENOSPC", async () => {
    const fsPromises = await import("node:fs/promises");
    const renameSpy = vi.spyOn(fsPromises.default, "rename").mockImplementation(async () => {
      const err = new Error("No space");
      err.code = "ENOSPC";
      throw err;
    });
    const request = new Request("http://localhost/api/games", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ result: { deckId: "x", score: 50 } }),
    });
    const response = await route.POST(request);
    expect(response.status).toBe(507);
    renameSpy.mockRestore();
  });
});

describe("GET /api/games", () => {
  it("returns empty when no games exist", async () => {
    const response = await route.GET(new Request("http://localhost/api/games"));
    const data = await response.json();
    expect(data.entries).toEqual([]);
    expect(data.count).toBe(0);
  });

  it("returns games newest-first", async () => {
    const post = async (deckId, score) => {
      await route.POST(new Request("http://localhost/api/games", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ result: { deckId, score, summary: `score ${score}` } }),
      }));
      await new Promise(r => setTimeout(r, 5));
    };
    await post("deck-a", 50);
    await post("deck-a", 60);
    await post("deck-b", 70);

    const response = await route.GET(new Request("http://localhost/api/games"));
    const data = await response.json();
    expect(data.count).toBe(3);
    expect(data.entries[0].score).toBe(70);  // most recent
    expect(data.entries[2].score).toBe(50);  // oldest
  });

  it("filters by deckId when query param is present", async () => {
    const post = async (deckId, score) => {
      await route.POST(new Request("http://localhost/api/games", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ result: { deckId, score } }),
      }));
      await new Promise(r => setTimeout(r, 5));
    };
    await post("deck-a", 50);
    await post("deck-b", 60);
    await post("deck-a", 70);

    const response = await route.GET(new Request("http://localhost/api/games?deckId=deck-a"));
    const data = await response.json();
    expect(data.returned).toBe(2);
    expect(data.entries.every(e => e.deckId === "deck-a")).toBe(true);
  });

  it("respects limit query param", async () => {
    for (let i = 0; i < 5; i++) {
      await route.POST(new Request("http://localhost/api/games", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ result: { deckId: "deck-a", score: i * 10 } }),
      }));
      await new Promise(r => setTimeout(r, 5));
    }
    const response = await route.GET(new Request("http://localhost/api/games?limit=2"));
    const data = await response.json();
    expect(data.returned).toBe(2);
    expect(data.count).toBe(5); // total still 5
  });
});

describe("pruning (per-deck cap)", () => {
  it("prunes archived games beyond MAX_GAMES_PER_DECK", async () => {
    // Set the env BEFORE importing the route so the constant picks it up.
    process.env.MAX_GAMES_PER_DECK = "3";
    vi.resetModules();
    const localRoute = await import("./route.js");

    for (let i = 0; i < 6; i++) {
      await localRoute.POST(new Request("http://localhost/api/games", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ result: { deckId: "deck-a", score: i * 10 } }),
      }));
      await new Promise(r => setTimeout(r, 10));
    }
    // The prune runs in the background (POST intentionally does not await it),
    // so poll until it settles instead of relying on a fixed sleep that flakes
    // under load (e.g. the full parallel suite on a busy CI runner). The prune
    // only ever deletes down toward the cap, so once the count reaches <= 3 it
    // stays there; a genuinely broken prune makes this loop time out and the
    // assertion below still fails.
    let files = await listGameFiles();
    const deadline = Date.now() + 3000;
    while (files.length > 3 && Date.now() < deadline) {
      await new Promise(r => setTimeout(r, 25));
      files = await listGameFiles();
    }
    expect(files.length).toBeLessThanOrEqual(3);
    delete process.env.MAX_GAMES_PER_DECK;
  });
});

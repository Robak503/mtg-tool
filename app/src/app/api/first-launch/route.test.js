/**
 * Tests for /api/first-launch — fresh-install detection + import flow.
 *
 * paths.js falls back to process.cwd() when MTG_APP_ROOT isn't set, so
 * tests just chdir into a temp dir and exercise the route against
 * synthetic source data they create alongside.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

let tmpDir;
let originalCwd;
let route;
let sourceDir;

async function loadRoute() {
  vi.resetModules();
  return await import("./route.js");
}

function getRequest() {
  return new Request("http://localhost/api/first-launch");
}

// Import runs the profiles migration, so per-profile data (decks, chats, games)
// lands under data/profiles/<activeId>/; feedback stays at the global data root.
async function activeProfileDir() {
  const reg = JSON.parse(await fs.readFile(path.join(tmpDir, "data", "profiles.json"), "utf8"));
  return path.join(tmpDir, "data", "profiles", reg.activeProfileId);
}

function postRequest(body) {
  return new Request("http://localhost/api/first-launch", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "first-launch-test-"));
  originalCwd = process.cwd();
  process.chdir(tmpDir);

  // Build a fake "source" dev tree alongside the live dir.
  sourceDir = await fs.mkdtemp(path.join(os.tmpdir(), "first-launch-source-"));
  await fs.writeFile(
    path.join(sourceDir, "decks.local.json"),
    JSON.stringify({ decks: [{ id: "test-deck", name: "Test Deck" }] }),
  );
  await fs.writeFile(
    path.join(sourceDir, "chats.local.json"),
    JSON.stringify({ sessions: [] }),
  );
  await fs.mkdir(path.join(sourceDir, "feedback"), { recursive: true });
  await fs.writeFile(
    path.join(sourceDir, "feedback", "fb-1.json"),
    JSON.stringify({ text: "hello" }),
  );
  await fs.mkdir(path.join(sourceDir, "games"), { recursive: true });
  await fs.writeFile(
    path.join(sourceDir, "games", "game-1.json"),
    JSON.stringify({ id: "g1" }),
  );

  route = await loadRoute();
});

afterEach(async () => {
  process.chdir(originalCwd);
  await fs.rm(tmpDir, { recursive: true, force: true });
  await fs.rm(sourceDir, { recursive: true, force: true });
});

describe("GET /api/first-launch", () => {
  it("returns needsBootstrap=true when the marker file is missing", async () => {
    const resp = await route.GET(getRequest());
    const body = await resp.json();
    expect(body.needsBootstrap).toBe(true);
    expect(body.currentDataDir).toContain("data");
  });

  it("returns needsBootstrap=false once the marker is written", async () => {
    await fs.mkdir(path.join(tmpDir, "data"), { recursive: true });
    await fs.writeFile(
      path.join(tmpDir, "data", ".first-launch-marker.json"),
      JSON.stringify({ completedAt: new Date().toISOString(), reason: "import" }),
    );
    const resp = await route.GET(getRequest());
    const body = await resp.json();
    expect(body.needsBootstrap).toBe(false);
  });

  it("returns needsBootstrap=true even when decks.local.json exists (since decks are auto-seeded)", async () => {
    // /api/decks auto-creates decks.local.json from a built-in seed on
    // first GET. The first-launch wizard must NOT treat that as proof
    // the user has imported anything — only the marker counts.
    await fs.mkdir(path.join(tmpDir, "data"), { recursive: true });
    await fs.writeFile(
      path.join(tmpDir, "data", "decks.local.json"),
      JSON.stringify({ decks: [{ id: "sliver-hivelord-seed" }] }),
    );
    const resp = await route.GET(getRequest());
    const body = await resp.json();
    expect(body.needsBootstrap).toBe(true);
  });

  it("includes suggestedSource when a likely dev tree is detectable", async () => {
    const resp = await route.GET(getRequest());
    const body = await resp.json();
    expect(body.suggestedSource === null || typeof body.suggestedSource === "string").toBe(true);
  });
});

describe("POST /api/first-launch — dismiss", () => {
  it("writes the marker and returns ok:true on action:dismiss", async () => {
    const resp = await route.POST(postRequest({ action: "dismiss" }));
    expect(resp.status).toBe(200);
    const body = await resp.json();
    expect(body.ok).toBe(true);
    expect(body.dismissed).toBe(true);

    const markerPath = path.join(tmpDir, "data", ".first-launch-marker.json");
    const marker = JSON.parse(await fs.readFile(markerPath, "utf8"));
    expect(marker.reason).toBe("dismiss");
  });

  it("flips needsBootstrap to false after a dismiss", async () => {
    await route.POST(postRequest({ action: "dismiss" }));
    const resp = await route.GET(getRequest());
    const body = await resp.json();
    expect(body.needsBootstrap).toBe(false);
  });
});

describe("POST /api/first-launch — validation", () => {
  it("rejects invalid JSON body with 400", async () => {
    const req = new Request("http://localhost/api/first-launch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{ not json",
    });
    const resp = await route.POST(req);
    expect(resp.status).toBe(400);
    const body = await resp.json();
    expect(body.error).toContain("Invalid JSON");
  });

  it("rejects empty sourcePath with 400", async () => {
    const resp = await route.POST(postRequest({}));
    expect(resp.status).toBe(400);
    const body = await resp.json();
    expect(body.error).toContain("required");
  });

  it("rejects nonexistent source with 400 and clear message", async () => {
    const resp = await route.POST(postRequest({ sourcePath: path.join(tmpDir, "nope") }));
    expect(resp.status).toBe(400);
    const body = await resp.json();
    expect(body.error).toContain("does not exist");
  });

  it("rejects source missing decks.local.json with 400", async () => {
    const bareDir = await fs.mkdtemp(path.join(os.tmpdir(), "bare-"));
    try {
      const resp = await route.POST(postRequest({ sourcePath: bareDir }));
      expect(resp.status).toBe(400);
      const body = await resp.json();
      expect(body.error).toContain("decks.local.json");
    } finally {
      await fs.rm(bareDir, { recursive: true, force: true });
    }
  });

  it("rejects src equal to dst with 400", async () => {
    await fs.mkdir(path.join(tmpDir, "data"), { recursive: true });
    await fs.writeFile(
      path.join(tmpDir, "data", "decks.local.json"),
      JSON.stringify({ decks: [] }),
    );
    const resp = await route.POST(
      postRequest({ sourcePath: path.join(tmpDir, "data") }),
    );
    expect(resp.status).toBe(400);
    const body = await resp.json();
    expect(body.error.toLowerCase()).toContain("same");
  });
});

describe("POST /api/first-launch — import happy path", () => {
  it("copies decks.local.json + chats.local.json + feedback/ + games/", async () => {
    const resp = await route.POST(postRequest({ sourcePath: sourceDir }));
    const body = await resp.json();
    expect(resp.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.copied).toContain("decks.local.json");
    expect(body.copied).toContain("chats.local.json");
    expect(body.copied.some((s) => s.startsWith("feedback/"))).toBe(true);
    expect(body.copied.some((s) => s.startsWith("games/"))).toBe(true);

    // Verify the actual files landed. Per-profile data → active profile folder;
    // feedback (dev channel) → global data root.
    const dst = path.join(tmpDir, "data");
    const profileDir = await activeProfileDir();
    const decks = JSON.parse(await fs.readFile(path.join(profileDir, "decks.local.json"), "utf8"));
    expect(decks.decks[0].id).toBe("test-deck");
    const fb = await fs.readdir(path.join(dst, "feedback"));
    expect(fb).toContain("fb-1.json");
    const games = await fs.readdir(path.join(profileDir, "games"));
    expect(games).toContain("game-1.json");
  });

  it("flips needsBootstrap to false after a successful import", async () => {
    await route.POST(postRequest({ sourcePath: sourceDir }));
    const resp = await route.GET(getRequest());
    const body = await resp.json();
    expect(body.needsBootstrap).toBe(false);
  });

  it("writes the marker after a successful import", async () => {
    await route.POST(postRequest({ sourcePath: sourceDir }));
    const markerPath = path.join(tmpDir, "data", ".first-launch-marker.json");
    const marker = JSON.parse(await fs.readFile(markerPath, "utf8"));
    expect(marker.reason).toBe("import");
    expect(marker.sourcePath).toBe(path.resolve(sourceDir));
  });

  it("skips files that don't exist in source instead of failing", async () => {
    const resp = await route.POST(postRequest({ sourcePath: sourceDir }));
    const body = await resp.json();
    // sourceDir doesn't have model-calls.local.json etc — those should
    // be in the skipped list, not errors.
    expect(body.skipped.length).toBeGreaterThan(0);
    expect(body.errors).toEqual([]);
  });

  it("creates the destination data dir if it didn't exist", async () => {
    // tmpDir starts without data/ — the import should create it.
    const dst = path.join(tmpDir, "data");
    await expect(fs.stat(dst)).rejects.toThrow();
    await route.POST(postRequest({ sourcePath: sourceDir }));
    const stat = await fs.stat(dst);
    expect(stat.isDirectory()).toBe(true);
  });
});

describe("marker write hygiene (S-P3)", () => {
  it("dismiss writes a complete, parseable marker with no lingering temp files", async () => {
    route = await loadRoute();
    const resp = await route.POST(postRequest({ action: "dismiss" }));
    expect(resp.status).toBe(200);

    const marker = JSON.parse(
      await fs.readFile(path.join(tmpDir, "data", ".first-launch-marker.json"), "utf8"),
    );
    expect(marker.reason).toBe("dismiss");
    expect(marker.completedAt).toBeTruthy();

    const names = await fs.readdir(path.join(tmpDir, "data"));
    expect(names.filter(n => n.includes(".tmp."))).toEqual([]);
  });
});

/**
 * Tests for the /api/chats route — v1 → v2 migration, atomic write, error paths.
 *
 * Strategy: chdir into a fresh tmp directory, then dynamic-import the route so
 * the module's `process.cwd()`-derived paths land inside the tmp dir. Each test
 * resets module state via vi.resetModules() so the route loads fresh.
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

async function writeChatFile(payload) {
  await fs.mkdir(path.join(tmpDir, "data"), { recursive: true });
  await fs.writeFile(
    path.join(tmpDir, "data", "chats.local.json"),
    typeof payload === "string" ? payload : JSON.stringify(payload),
    "utf8"
  );
}

async function readChatFile() {
  const raw = await fs.readFile(path.join(tmpDir, "data", "chats.local.json"), "utf8");
  return JSON.parse(raw);
}

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "chats-route-test-"));
  originalCwd = process.cwd();
  process.chdir(tmpDir);
  route = await loadRoute();
});

afterEach(async () => {
  process.chdir(originalCwd);
  await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
});

describe("v1 → v2 migration", () => {
  it("migrates a populated v1 file into archived sessions", async () => {
    await writeChatFile({
      version: 1,
      histories: {
        jace: [
          { role: "user", content: "hello jace" },
          { role: "assistant", content: "hi" },
        ],
        karn: [],
        tibalt: [],
      },
      locks: {
        jace: { id: "deck-1", name: "Atraxa", commander: "Atraxa" },
      },
    });

    const response = await route.GET();
    const data = await response.json();

    expect(data.version).toBe(2);
    expect(data.sessions).toHaveLength(1);
    const session = data.sessions[0];
    expect(session.agent).toBe("jace");
    expect(session.messages).toHaveLength(2);
    expect(session.lockedDeck.name).toBe("Atraxa");
    expect(session.archived).toBe(true);
    expect(session.name).toContain("Imported");
  });

  it("creates no synthetic sessions when all histories are empty", async () => {
    await writeChatFile({
      version: 1,
      histories: { jace: [], karn: [], tibalt: [] },
      locks: {},
    });

    const response = await route.GET();
    const data = await response.json();
    expect(data.sessions).toEqual([]);
  });

  it("sets lockedDeck to null when v1 lock is missing or null", async () => {
    await writeChatFile({
      version: 1,
      histories: { karn: [{ role: "user", content: "build" }] },
      locks: { karn: null },
    });

    const response = await route.GET();
    const data = await response.json();
    expect(data.sessions[0].lockedDeck).toBeNull();
  });

  it("coerces malformed messages (missing role) to user", async () => {
    await writeChatFile({
      version: 1,
      histories: { jace: [{ content: "no role here" }] },
      locks: {},
    });

    const response = await route.GET();
    const data = await response.json();
    expect(data.sessions[0].messages[0].role).toBe("user");
    expect(data.sessions[0].messages[0].content).toBe("no role here");
  });

  it("writes a v1.bak backup before overwriting with v2", async () => {
    await writeChatFile({
      version: 1,
      histories: { jace: [{ role: "user", content: "x" }] },
      locks: {},
    });

    await route.GET();

    const backupRaw = await fs.readFile(
      path.join(tmpDir, "data", "chats.local.json.v1.bak"),
      "utf8"
    );
    const backup = JSON.parse(backupRaw);
    expect(backup.version).toBe(1);
    expect(backup.histories.jace).toHaveLength(1);
  });
});

describe("SyntaxError recovery", () => {
  it("returns empty v2 state (not a throw) when the file is corrupted", async () => {
    await writeChatFile("{not valid json");

    const response = await route.GET();
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.version).toBe(2);
    expect(data.sessions).toEqual([]);
  });

  it("preserves the corrupted file as .corrupted for forensics", async () => {
    await writeChatFile("not json at all");

    await route.GET();

    const corruptedRaw = await fs.readFile(
      path.join(tmpDir, "data", "chats.local.json.corrupted"),
      "utf8"
    );
    expect(corruptedRaw).toContain("not json");
  });
});

describe("atomic write", () => {
  it("writes a valid JSON file with no .tmp left behind", async () => {
    const request = new Request("http://localhost/api/chats", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessions: [{
          id: "s1",
          agent: "jace",
          name: "Test session",
          messages: [{ role: "user", content: "hi" }],
          lockedDeck: null,
        }],
      }),
    });

    const response = await route.POST(request);
    expect(response.status).toBe(200);

    const written = await readChatFile();
    expect(written.version).toBe(2);
    expect(written.sessions).toHaveLength(1);
    expect(written.sessions[0].agent).toBe("jace");

    // No .tmp file should remain after a successful rename.
    const entries = await fs.readdir(path.join(tmpDir, "data"));
    expect(entries.some(name => name.endsWith(".tmp"))).toBe(false);
  });

  it("rejects with 507 when the rename fails with ENOSPC", async () => {
    // Spy on fs.rename and inject ENOSPC.
    const fsPromises = await import("node:fs/promises");
    const renameSpy = vi.spyOn(fsPromises.default, "rename").mockImplementation(async () => {
      const err = new Error("No space left on device");
      err.code = "ENOSPC";
      throw err;
    });

    const request = new Request("http://localhost/api/chats", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessions: [] }),
    });

    const response = await route.POST(request);
    expect(response.status).toBe(507);
    const data = await response.json();
    expect(data.error).toMatch(/disk full/i);

    renameSpy.mockRestore();
  });
});

describe("v1 shim on POST", () => {
  it("converts incoming { histories, locks } into v2 sessions on disk", async () => {
    const request = new Request("http://localhost/api/chats", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        histories: { jace: [{ role: "user", content: "ping" }] },
        locks: { jace: { name: "deck" } },
      }),
    });

    const response = await route.POST(request);
    expect(response.status).toBe(200);

    const written = await readChatFile();
    expect(written.version).toBe(2);
    expect(written.sessions).toHaveLength(1);
    expect(written.sessions[0].agent).toBe("jace");
    expect(written.sessions[0].lockedDeck.name).toBe("deck");
    expect(written.sessions[0].archived).toBe(false);
  });
});

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

describe("v1 shim removal (T20)", () => {
  it("rejects { histories, locks } payload with 400 — sessions-only now", async () => {
    const request = new Request("http://localhost/api/chats", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        histories: { jace: [{ role: "user", content: "ping" }] },
        locks: { jace: { name: "deck" } },
      }),
    });
    const response = await route.POST(request);
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toMatch(/sessions array/i);
  });
});

describe("session message cap (MAX_SESSION_MESSAGES)", () => {
  it("trims sessions with >500 messages to the most recent 500", async () => {
    // Build a session with 750 user messages — should be trimmed to last 500.
    const messages = Array.from({ length: 750 }, (_, i) => ({
      role: i % 2 === 0 ? "user" : "assistant",
      content: `msg-${i}`,
    }));

    const request = new Request("http://localhost/api/chats", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessions: [{
          id: "s-big",
          agent: "jace",
          name: "Big session",
          messages,
          lockedDeck: null,
        }],
      }),
    });

    const response = await route.POST(request);
    expect(response.status).toBe(200);

    const written = await readChatFile();
    expect(written.sessions[0].messages).toHaveLength(500);
    // First retained message should be the (750-500)=250th input message.
    expect(written.sessions[0].messages[0].content).toBe("msg-250");
    expect(written.sessions[0].messages[499].content).toBe("msg-749");
  });

  it("leaves under-limit sessions untouched", async () => {
    const messages = Array.from({ length: 10 }, (_, i) => ({
      role: "user", content: `msg-${i}`,
    }));

    const request = new Request("http://localhost/api/chats", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessions: [{ id: "s-small", agent: "karn", name: "Small", messages, lockedDeck: null }],
      }),
    });
    await route.POST(request);
    const written = await readChatFile();
    expect(written.sessions[0].messages).toHaveLength(10);
  });
});

describe("message + session metadata persistence (A2)", () => {
  const fullAssistantMessage = {
    id: "m-1",
    role: "assistant",
    content: "Here is the ruling.",
    arbiterTrace: "STATE\nRESOLUTION\nstep 1",
    arbiterStatus: "resolved",
    arbiterSources: { ruleNumbers: ["117.3a"], cards: ["Lightning Bolt"] },
    factReceipt: { provider: "ollama", deckLocked: true, arbiterStatus: "resolved" },
  };

  async function saveAndRead(session) {
    const request = new Request("http://localhost/api/chats", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessions: [session] }),
    });
    const response = await route.POST(request);
    expect(response.status).toBe(200);
    const written = await readChatFile();
    return written.sessions[0];
  }

  it("preserves Arbiter trace/status/sources and the fact receipt", async () => {
    const session = await saveAndRead({
      id: "s1", agent: "jace", name: "Ruling", lockedDeck: null,
      messages: [{ role: "user", content: "q" }, fullAssistantMessage],
    });
    const msg = session.messages[1];
    expect(msg.id).toBe("m-1");
    expect(msg.arbiterTrace).toContain("RESOLUTION");
    expect(msg.arbiterStatus).toBe("resolved");
    expect(msg.arbiterSources).toEqual({ ruleNumbers: ["117.3a"], cards: ["Lightning Bolt"] });
    expect(msg.factReceipt).toEqual({ provider: "ollama", deckLocked: true, arbiterStatus: "resolved" });
  });

  it("preserves error/retry metadata", async () => {
    const session = await saveAndRead({
      id: "s1", agent: "jace", name: "Err", lockedDeck: null,
      messages: [{
        role: "assistant",
        content: "Could not connect.",
        isError: true,
        fallbackAvailable: true,
        originalPrompt: "what happens if...",
        errorProvider: "ollama",
      }],
    });
    const msg = session.messages[0];
    expect(msg.isError).toBe(true);
    expect(msg.fallbackAvailable).toBe(true);
    expect(msg.originalPrompt).toBe("what happens if...");
    expect(msg.errorProvider).toBe("ollama");
  });

  it("preserves session.deckDeclined — the deck-gate opt-out survives reload", async () => {
    const session = await saveAndRead({
      id: "s1", agent: "karn", name: "No deck", lockedDeck: null, deckDeclined: true,
      messages: [{ role: "user", content: "build me something" }],
    });
    expect(session.deckDeclined).toBe(true);
  });

  it("omits deckDeclined when not set", async () => {
    const session = await saveAndRead({
      id: "s1", agent: "jace", name: "x", lockedDeck: null, messages: [],
    });
    expect(session.deckDeclined).toBeUndefined();
  });

  it("drops transient/unknown message fields (streaming, arbitrary keys)", async () => {
    const session = await saveAndRead({
      id: "s1", agent: "jace", name: "x", lockedDeck: null,
      messages: [{ role: "assistant", content: "partial", streaming: true, evilField: "x", id: "m9" }],
    });
    const msg = session.messages[0];
    expect(msg.streaming).toBeUndefined();
    expect(msg.evilField).toBeUndefined();
    expect(msg.id).toBe("m9"); // allowlisted field still kept
    expect(msg.content).toBe("partial");
  });

  it("round-trips metadata through GET as well as the written file", async () => {
    await saveAndRead({
      id: "s1", agent: "jace", name: "Ruling", lockedDeck: null,
      messages: [fullAssistantMessage],
    });
    const response = await route.GET();
    const data = await response.json();
    const msg = data.sessions[0].messages[0];
    expect(msg.arbiterStatus).toBe("resolved");
    expect(msg.factReceipt.provider).toBe("ollama");
  });

  it("loads an old assistant message that lacks the new metadata (back-compat)", async () => {
    const session = await saveAndRead({
      id: "s1", agent: "jace", name: "Legacy", lockedDeck: null,
      messages: [{ role: "assistant", content: "plain answer" }],
    });
    expect(session.messages[0]).toEqual({ role: "assistant", content: "plain answer" });
  });
});

describe("pruneSessions", () => {
  it("never prunes active sessions, even when there are many", async () => {
    // 60 active sessions — exceeds MAX_ARCHIVED_SESSIONS=50 but active is uncapped.
    const sessions = Array.from({ length: 60 }, (_, i) => ({
      id: `s-active-${i}`,
      agent: "karn",
      name: `Active ${i}`,
      messages: [],
      archived: false,
      lockedDeck: null,
    }));

    const request = new Request("http://localhost/api/chats", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessions }),
    });
    await route.POST(request);

    const written = await readChatFile();
    expect(written.sessions.filter(s => !s.archived)).toHaveLength(60);
  });

  it("trims archived sessions to the most recent 50 when there are more", async () => {
    // 80 archived sessions stamped within the past few days so the age cap
    // doesn't kick in; only the count cap should trigger. Sessions with
    // higher i are more recent.
    const now = Date.now();
    const sessions = Array.from({ length: 80 }, (_, i) => {
      const stamp = new Date(now - (80 - i) * 1000).toISOString();
      return {
        id: `s-arch-${i}`,
        agent: "jace",
        name: `Archived ${i}`,
        messages: [],
        archived: true,
        lockedDeck: null,
        createdAt: stamp,
        updatedAt: stamp,
      };
    });

    const request = new Request("http://localhost/api/chats", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessions }),
    });
    await route.POST(request);

    const written = await readChatFile();
    const archived = written.sessions.filter(s => s.archived);
    expect(archived).toHaveLength(50);
    // Most recent (id=79) should be kept; oldest (id=0) should be pruned.
    const keptIds = new Set(archived.map(s => s.id));
    expect(keptIds.has("s-arch-79")).toBe(true);
    expect(keptIds.has("s-arch-30")).toBe(true);
    expect(keptIds.has("s-arch-29")).toBe(false);
    expect(keptIds.has("s-arch-0")).toBe(false);
  });

  it("drops archived sessions older than 90 days", async () => {
    const now = Date.now();
    const dayMs = 86_400_000;
    const sessions = [
      // Recent — keep
      { id: "s-recent", agent: "jace", name: "Recent", messages: [], archived: true, lockedDeck: null,
        createdAt: new Date(now - 10 * dayMs).toISOString(),
        updatedAt: new Date(now - 10 * dayMs).toISOString() },
      // Old — drop
      { id: "s-old", agent: "jace", name: "Old", messages: [], archived: true, lockedDeck: null,
        createdAt: new Date(now - 120 * dayMs).toISOString(),
        updatedAt: new Date(now - 120 * dayMs).toISOString() },
    ];

    const request = new Request("http://localhost/api/chats", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessions }),
    });
    await route.POST(request);

    const written = await readChatFile();
    const ids = written.sessions.map(s => s.id);
    expect(ids).toContain("s-recent");
    expect(ids).not.toContain("s-old");
  });
});

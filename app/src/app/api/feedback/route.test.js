/**
 * Tests for /api/feedback — POST happy path, validation, ENOSPC, GET listing.
 *
 * Same chdir-tmp pattern as the chats route tests.
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

async function listFeedbackFiles() {
  const dir = path.join(tmpDir, "data", "feedback");
  try {
    return await fs.readdir(dir);
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

async function readFeedbackFile(filename) {
  const raw = await fs.readFile(path.join(tmpDir, "data", "feedback", filename), "utf8");
  return JSON.parse(raw);
}

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "feedback-route-test-"));
  originalCwd = process.cwd();
  process.chdir(tmpDir);
  route = await loadRoute();
});

afterEach(async () => {
  process.chdir(originalCwd);
  await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
});

describe("POST /api/feedback", () => {
  it("writes a feedback entry with timestamp + context to data/feedback/", async () => {
    const request = new Request("http://localhost/api/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: "Karn's cut suggestions sometimes include lands when I asked for non-lands",
        category: "agent-quality",
        context: {
          agent: "karn",
          sessionId: "s-abc123",
          sessionName: "Karn — Atraxa rebuild",
          deckName: "Atraxa Superfriends",
          deckCommander: "Atraxa, Praetors' Voice",
          page: "chat",
          userAgent: "TestRunner/1.0",
        },
      }),
    });

    const response = await route.POST(request);
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.ok).toBe(true);
    expect(data.filename).toMatch(/\.json$/);
    expect(data.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);

    const files = await listFeedbackFiles();
    expect(files).toHaveLength(1);
    const entry = await readFeedbackFile(files[0]);
    expect(entry.message).toMatch(/Karn's cut suggestions/);
    expect(entry.category).toBe("agent-quality");
    expect(entry.context.agent).toBe("karn");
    expect(entry.context.deckCommander).toBe("Atraxa, Praetors' Voice");
  });

  it("rejects empty messages with 400", async () => {
    const request = new Request("http://localhost/api/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "   " }),
    });
    const response = await route.POST(request);
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toMatch(/required/i);
  });

  it("rejects missing message field with 400", async () => {
    const request = new Request("http://localhost/api/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category: "bug" }),
    });
    const response = await route.POST(request);
    expect(response.status).toBe(400);
  });

  it("rejects invalid JSON with 400", async () => {
    const request = new Request("http://localhost/api/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{not valid",
    });
    const response = await route.POST(request);
    expect(response.status).toBe(400);
  });

  it("defaults to category 'other' when an unknown category is sent", async () => {
    const request = new Request("http://localhost/api/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: "Something happened",
        category: "definitely-not-valid",
      }),
    });
    await route.POST(request);
    const files = await listFeedbackFiles();
    const entry = await readFeedbackFile(files[0]);
    expect(entry.category).toBe("other");
  });

  it("filters unknown context fields and clamps oversized strings", async () => {
    const longString = "a".repeat(2000);
    const request = new Request("http://localhost/api/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: "Test entry",
        context: {
          agent: "invalid-agent",   // not in VALID_AGENTS → dropped
          page: "invalid-page",      // not in VALID_PAGES → dropped
          deckName: longString,      // clamped to 400 chars
          rogueField: "ignored",     // not in allowlist → dropped
        },
      }),
    });
    await route.POST(request);
    const files = await listFeedbackFiles();
    const entry = await readFeedbackFile(files[0]);
    expect(entry.context.agent).toBeUndefined();
    expect(entry.context.page).toBeUndefined();
    expect(entry.context.deckName).toHaveLength(400);
    expect(entry.context.rogueField).toBeUndefined();
  });

  it("clamps messages to MAX_MESSAGE_LENGTH (4000 chars)", async () => {
    const huge = "x".repeat(5000);
    const request = new Request("http://localhost/api/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: huge }),
    });
    await route.POST(request);
    const files = await listFeedbackFiles();
    const entry = await readFeedbackFile(files[0]);
    expect(entry.message).toHaveLength(4000);
  });

  it("returns 507 when the rename fails with ENOSPC", async () => {
    const fsPromises = await import("node:fs/promises");
    const renameSpy = vi.spyOn(fsPromises.default, "rename").mockImplementation(async () => {
      const err = new Error("No space left on device");
      err.code = "ENOSPC";
      throw err;
    });

    const request = new Request("http://localhost/api/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "Test" }),
    });
    const response = await route.POST(request);
    expect(response.status).toBe(507);
    const data = await response.json();
    expect(data.error).toMatch(/disk full/i);

    renameSpy.mockRestore();
  });

  it("never leaves a .tmp file after a successful write", async () => {
    const request = new Request("http://localhost/api/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "Atomic write test" }),
    });
    await route.POST(request);
    const files = await listFeedbackFiles();
    expect(files.some(name => name.endsWith(".tmp"))).toBe(false);
    expect(files.some(name => name.endsWith(".json"))).toBe(true);
  });
});

describe("GET /api/feedback", () => {
  it("returns empty list when no feedback exists", async () => {
    const response = await route.GET();
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.entries).toEqual([]);
    expect(data.count).toBe(0);
  });

  it("lists submissions newest-first", async () => {
    const post = async (msg) => {
      await route.POST(new Request("http://localhost/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: msg }),
      }));
      // Ensure unique timestamps in the filename.
      await new Promise(r => setTimeout(r, 5));
    };
    await post("first");
    await post("second");
    await post("third");

    const response = await route.GET();
    const data = await response.json();
    expect(data.count).toBe(3);
    expect(data.entries[0].message).toBe("third");
    expect(data.entries[2].message).toBe("first");
  });

  it("skips unreadable files instead of blowing up the listing", async () => {
    // Write a valid one through the route.
    await route.POST(new Request("http://localhost/api/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "good" }),
    }));

    // Now write a corrupted file alongside it.
    const dir = path.join(tmpDir, "data", "feedback");
    await fs.writeFile(path.join(dir, "corrupt-file.json"), "{not valid", "utf8");

    const response = await route.GET();
    const data = await response.json();
    expect(data.count).toBe(1);
    expect(data.entries[0].message).toBe("good");
  });
});

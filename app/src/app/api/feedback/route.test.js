/**
 * Tests for /api/feedback — POST happy path, validation, ENOSPC, GET
 * (JSON + markdown digest), DELETE, FEEDBACK.md digest regeneration.
 *
 * The route writes one JSON file per submission AND regenerates the
 * consolidated FEEDBACK.md digest after every POST and DELETE. Tests
 * account for both files when counting directory contents.
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

async function listEntryFiles() {
  // Just the per-submission JSON entries; skip the FEEDBACK.md digest
  // and any temp files.
  const all = await listFeedbackFiles();
  return all.filter(f => f.endsWith(".json") && !f.endsWith(".tmp.json"));
}

async function readFeedbackFile(filename) {
  const raw = await fs.readFile(path.join(tmpDir, "data", "feedback", filename), "utf8");
  return JSON.parse(raw);
}

function jsonRequest(body, method = "POST") {
  return new Request("http://localhost/api/feedback", {
    method,
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
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
  it("writes a feedback entry + regenerates the FEEDBACK.md digest", async () => {
    const response = await route.POST(jsonRequest({
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
    }));

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.ok).toBe(true);
    expect(data.filename).toMatch(/\.json$/);
    expect(data.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(data.digestEntryCount).toBe(1);

    const entryFiles = await listEntryFiles();
    expect(entryFiles).toHaveLength(1);
    const entry = await readFeedbackFile(entryFiles[0]);
    expect(entry.message).toMatch(/Karn's cut suggestions/);
    expect(entry.category).toBe("agent-quality");
    expect(entry.context.agent).toBe("karn");
    expect(entry.context.deckCommander).toBe("Atraxa, Praetors' Voice");

    // FEEDBACK.md should also exist now with the new entry.
    const allFiles = await listFeedbackFiles();
    expect(allFiles).toContain("FEEDBACK.md");
    const digest = await fs.readFile(path.join(tmpDir, "data", "feedback", "FEEDBACK.md"), "utf8");
    expect(digest).toContain("MTG Tool — Feedback Log");
    expect(digest).toContain("Karn's cut suggestions");
    expect(digest).toContain("agent=karn");
  });

  it("rejects empty messages with 400", async () => {
    const response = await route.POST(jsonRequest({ message: "   " }));
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toMatch(/required/i);
  });

  it("rejects missing message field with 400", async () => {
    const response = await route.POST(jsonRequest({ category: "bug" }));
    expect(response.status).toBe(400);
  });

  it("rejects invalid JSON with 400", async () => {
    const response = await route.POST(jsonRequest("{not valid"));
    expect(response.status).toBe(400);
  });

  it("defaults to category 'other' when an unknown category is sent", async () => {
    await route.POST(jsonRequest({
      message: "Something happened",
      category: "definitely-not-valid",
    }));
    const entryFiles = await listEntryFiles();
    const entry = await readFeedbackFile(entryFiles[0]);
    expect(entry.category).toBe("other");
  });

  it("filters unknown context fields and clamps oversized strings", async () => {
    const longString = "a".repeat(2000);
    await route.POST(jsonRequest({
      message: "Test entry",
      context: {
        agent: "invalid-agent",
        page: "invalid-page",
        deckName: longString,
        rogueField: "ignored",
      },
    }));
    const entryFiles = await listEntryFiles();
    const entry = await readFeedbackFile(entryFiles[0]);
    expect(entry.context.agent).toBeUndefined();
    expect(entry.context.page).toBeUndefined();
    expect(entry.context.deckName).toHaveLength(400);
    expect(entry.context.rogueField).toBeUndefined();
  });

  it("clamps messages to MAX_MESSAGE_LENGTH (4000 chars)", async () => {
    await route.POST(jsonRequest({ message: "x".repeat(5000) }));
    const entryFiles = await listEntryFiles();
    const entry = await readFeedbackFile(entryFiles[0]);
    expect(entry.message).toHaveLength(4000);
  });

  it("returns 507 when the rename fails with ENOSPC", async () => {
    const fsPromises = await import("node:fs/promises");
    const renameSpy = vi.spyOn(fsPromises.default, "rename").mockImplementation(async () => {
      const err = new Error("No space left on device");
      err.code = "ENOSPC";
      throw err;
    });

    const response = await route.POST(jsonRequest({ message: "Test" }));
    expect(response.status).toBe(507);
    const data = await response.json();
    expect(data.error).toMatch(/disk full/i);

    renameSpy.mockRestore();
  });

  it("never leaves a .tmp file after a successful write", async () => {
    await route.POST(jsonRequest({ message: "Atomic write test" }));
    const files = await listFeedbackFiles();
    expect(files.some(name => name.endsWith(".tmp"))).toBe(false);
    expect(files.some(name => name.endsWith(".json"))).toBe(true);
  });
});

describe("GET /api/feedback", () => {
  function getRequest(query = "") {
    return new Request(`http://localhost/api/feedback${query}`);
  }

  it("returns empty list when no feedback exists", async () => {
    const response = await route.GET(getRequest());
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.entries).toEqual([]);
    expect(data.count).toBe(0);
  });

  it("lists submissions newest-first", async () => {
    const post = async (msg) => {
      await route.POST(jsonRequest({ message: msg }));
      await new Promise(r => setTimeout(r, 5));
    };
    await post("first");
    await post("second");
    await post("third");

    const response = await route.GET(getRequest());
    const data = await response.json();
    expect(data.count).toBe(3);
    expect(data.entries[0].message).toBe("third");
    expect(data.entries[2].message).toBe("first");
  });

  it("skips unreadable files instead of blowing up the listing", async () => {
    await route.POST(jsonRequest({ message: "good" }));
    const dir = path.join(tmpDir, "data", "feedback");
    await fs.writeFile(path.join(dir, "corrupt-file.json"), "{not valid", "utf8");

    const response = await route.GET(getRequest());
    const data = await response.json();
    expect(data.count).toBe(1);
    expect(data.entries[0].message).toBe("good");
  });

  it("returns the FEEDBACK.md digest as markdown when ?format=md", async () => {
    await route.POST(jsonRequest({ message: "first feedback note" }));
    await route.POST(jsonRequest({ message: "second feedback note" }));

    const response = await route.GET(getRequest("?format=md"));
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toMatch(/text\/markdown/);
    const body = await response.text();
    expect(body).toContain("# MTG Tool — Feedback Log");
    expect(body).toContain("first feedback note");
    expect(body).toContain("second feedback note");
  });

  it("generates an empty-state digest on first ?format=md call with no entries", async () => {
    const response = await route.GET(getRequest("?format=md"));
    expect(response.status).toBe(200);
    const body = await response.text();
    expect(body).toContain("no feedback yet");
  });
});

describe("DELETE /api/feedback", () => {
  function deleteRequest(filename) {
    const url = filename
      ? `http://localhost/api/feedback?filename=${encodeURIComponent(filename)}`
      : "http://localhost/api/feedback";
    return new Request(url, { method: "DELETE" });
  }

  it("removes a specific entry and regenerates the digest", async () => {
    await route.POST(jsonRequest({ message: "delete me" }));
    await route.POST(jsonRequest({ message: "keep me" }));

    let entries = await listEntryFiles();
    expect(entries).toHaveLength(2);

    // Pick the "delete me" entry's filename.
    const deleteMe = (await Promise.all(entries.map(async f => ({
      filename: f,
      data: await readFeedbackFile(f),
    })))).find(e => e.data.message === "delete me");
    expect(deleteMe).toBeTruthy();

    const response = await route.DELETE(deleteRequest(deleteMe.filename));
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.ok).toBe(true);
    expect(data.deleted).toBe(deleteMe.filename);
    expect(data.digestEntryCount).toBe(1);

    entries = await listEntryFiles();
    expect(entries).toHaveLength(1);
    const remaining = await readFeedbackFile(entries[0]);
    expect(remaining.message).toBe("keep me");

    const digest = await fs.readFile(path.join(tmpDir, "data", "feedback", "FEEDBACK.md"), "utf8");
    expect(digest).toContain("keep me");
    expect(digest).not.toContain("delete me");
  });

  it("rejects missing filename param with 400", async () => {
    const response = await route.DELETE(deleteRequest());
    expect(response.status).toBe(400);
  });

  it("rejects path-traversal in filename", async () => {
    const response = await route.DELETE(deleteRequest("../../etc/passwd"));
    // sanitiseFilename strips it via basename; the result is "passwd" which
    // doesn't end in .json so the regex rejects it.
    expect(response.status).toBe(400);
  });

  it("returns 404 when the entry doesn't exist", async () => {
    const response = await route.DELETE(deleteRequest("2026-01-01T00-00-00Z-nonexistent.json"));
    expect(response.status).toBe(404);
  });
});

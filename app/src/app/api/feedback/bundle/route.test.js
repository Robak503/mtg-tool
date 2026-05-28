/**
 * Tests for /api/feedback/bundle — export shape, schemaVersion guard,
 * idempotent import, malformed-bundle rejection.
 *
 * Bundle is the email-share format: GET returns every local entry in
 * one JSON blob, POST merges incoming entries dedup'd by id. Round-trip
 * (export → import) on the same store must add zero new entries.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

let tmpDir;
let originalCwd;
let bundleRoute;
let mainRoute;

async function loadRoutes() {
  vi.resetModules();
  bundleRoute = await import("./route.js");
  mainRoute = await import("../route.js");
}

function bundleRequest(body, method = "POST") {
  return new Request("http://localhost/api/feedback/bundle", {
    method,
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

async function seedEntry(message, category = "bug", extra = {}) {
  const request = new Request("http://localhost/api/feedback", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, category, ...extra }),
  });
  const response = await mainRoute.POST(request);
  return response.json();
}

async function listEntryFiles() {
  const dir = path.join(tmpDir, "data", "feedback");
  try {
    const all = await fs.readdir(dir);
    return all.filter(f => f.endsWith(".json") && !f.endsWith(".tmp.json"));
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "feedback-bundle-test-"));
  originalCwd = process.cwd();
  process.chdir(tmpDir);
  await loadRoutes();
});

afterEach(async () => {
  process.chdir(originalCwd);
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe("GET /api/feedback/bundle (export)", () => {
  it("returns an empty bundle when no entries exist", async () => {
    const response = await bundleRoute.GET();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.kind).toBe("mtg-tool-feedback-bundle");
    expect(body.schemaVersion).toBe(1);
    expect(body.entryCount).toBe(0);
    expect(body.entries).toEqual([]);
  });

  it("includes every entry and sets Content-Disposition for download", async () => {
    await seedEntry("first bug");
    await seedEntry("second bug", "feature");

    const response = await bundleRoute.GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Disposition")).toMatch(/^attachment;/);
    expect(response.headers.get("Content-Disposition")).toMatch(/mtg-feedback-bundle-/);

    const body = await response.json();
    expect(body.entryCount).toBe(2);
    expect(body.entries).toHaveLength(2);
    expect(body.entries.map(e => e.message).sort()).toEqual(["first bug", "second bug"]);
  });

  it("strips the per-store filename from exported entries", async () => {
    await seedEntry("filename should not leak");
    const response = await bundleRoute.GET();
    const body = await response.json();
    expect(body.entries[0].filename).toBeUndefined();
    expect(body.entries[0].id).toBeDefined();
    expect(body.entries[0].timestamp).toBeDefined();
  });

  it("surfaces the exporter's app version when present in any entry", async () => {
    await seedEntry("anon entry");
    await seedEntry("tagged entry", "bug", {
      context: { agent: "karn", appVersion: "0.4.2" },
    });
    const response = await bundleRoute.GET();
    const body = await response.json();
    expect(body.exportedFromAppVersion).toBe("0.4.2");
  });
});

describe("POST /api/feedback/bundle (import)", () => {
  it("rejects non-bundle payloads", async () => {
    const response = await bundleRoute.POST(bundleRequest({ message: "not a bundle" }));
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toMatch(/Not a feedback bundle/);
  });

  it("rejects unsupported schemaVersion", async () => {
    const response = await bundleRoute.POST(bundleRequest({
      kind: "mtg-tool-feedback-bundle",
      schemaVersion: 99,
      entries: [],
    }));
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toMatch(/Unsupported schemaVersion/);
  });

  it("rejects entries-not-an-array", async () => {
    const response = await bundleRoute.POST(bundleRequest({
      kind: "mtg-tool-feedback-bundle",
      schemaVersion: 1,
      entries: "nope",
    }));
    expect(response.status).toBe(400);
  });

  it("imports valid entries and regenerates the digest", async () => {
    const bundle = {
      kind: "mtg-tool-feedback-bundle",
      schemaVersion: 1,
      entries: [
        {
          id: "abc12345",
          timestamp: "2026-05-28T10:00:00.000Z",
          category: "bug",
          message: "imported entry from friend",
          context: { agent: "karn", appVersion: "0.1.0" },
        },
      ],
    };
    const response = await bundleRoute.POST(bundleRequest(bundle));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.ok).toBe(true);
    expect(body.imported).toBe(1);
    expect(body.skipped).toBe(0);
    expect(body.digestEntryCount).toBe(1);

    // The digest now contains the imported message.
    const digest = await fs.readFile(
      path.join(tmpDir, "data", "feedback", "FEEDBACK.md"),
      "utf8"
    );
    expect(digest).toMatch(/imported entry from friend/);
  });

  it("is idempotent — re-importing the same bundle adds nothing", async () => {
    const bundle = {
      kind: "mtg-tool-feedback-bundle",
      schemaVersion: 1,
      entries: [
        {
          id: "abc12345",
          timestamp: "2026-05-28T10:00:00.000Z",
          category: "bug",
          message: "dedupe me",
          context: {},
        },
      ],
    };
    await bundleRoute.POST(bundleRequest(bundle));
    const second = await bundleRoute.POST(bundleRequest(bundle));
    const body = await second.json();
    expect(body.imported).toBe(0);
    expect(body.skipped).toBe(1);
    const files = await listEntryFiles();
    expect(files).toHaveLength(1);
  });

  it("round-trips: export then re-import on same store adds zero entries", async () => {
    await seedEntry("round trip 1");
    await seedEntry("round trip 2");

    const exported = await bundleRoute.GET();
    const bundle = await exported.json();

    const reimport = await bundleRoute.POST(bundleRequest(bundle));
    const body = await reimport.json();
    expect(body.imported).toBe(0);
    expect(body.skipped).toBe(2);

    const files = await listEntryFiles();
    expect(files).toHaveLength(2);
  });

  it("skips entries with empty messages but processes valid ones", async () => {
    const bundle = {
      kind: "mtg-tool-feedback-bundle",
      schemaVersion: 1,
      entries: [
        { id: "good0001", message: "valid", category: "bug", timestamp: "2026-05-28T10:00:00Z", context: {} },
        { id: "bad00001", message: "   ", category: "bug", timestamp: "2026-05-28T10:01:00Z", context: {} },
        { id: "bad00002", message: "", category: "bug", timestamp: "2026-05-28T10:02:00Z", context: {} },
      ],
    };
    const response = await bundleRoute.POST(bundleRequest(bundle));
    const body = await response.json();
    expect(body.imported).toBe(1);
    expect(body.skipped).toBe(2);
  });

  it("rejects garbage category and falls back to 'other'", async () => {
    const bundle = {
      kind: "mtg-tool-feedback-bundle",
      schemaVersion: 1,
      entries: [
        { id: "cat00001", message: "weird category", category: "explosion", timestamp: "2026-05-28T10:00:00Z", context: {} },
      ],
    };
    const response = await bundleRoute.POST(bundleRequest(bundle));
    const body = await response.json();
    expect(body.imported).toBe(1);

    const files = await listEntryFiles();
    const written = JSON.parse(
      await fs.readFile(path.join(tmpDir, "data", "feedback", files[0]), "utf8")
    );
    expect(written.category).toBe("other");
  });

  it("clamps oversized messages to MAX_MESSAGE_LENGTH", async () => {
    const huge = "x".repeat(10_000);
    const bundle = {
      kind: "mtg-tool-feedback-bundle",
      schemaVersion: 1,
      entries: [
        { id: "big00001", message: huge, category: "bug", timestamp: "2026-05-28T10:00:00Z", context: {} },
      ],
    };
    const response = await bundleRoute.POST(bundleRequest(bundle));
    const body = await response.json();
    expect(body.imported).toBe(1);

    const files = await listEntryFiles();
    const written = JSON.parse(
      await fs.readFile(path.join(tmpDir, "data", "feedback", files[0]), "utf8")
    );
    expect(written.message.length).toBeLessThanOrEqual(4000);
  });

  it("rejects oversized bundles", async () => {
    const entries = [];
    for (let i = 0; i < 5001; i++) {
      entries.push({ id: `id${i}`, message: `e${i}`, category: "bug", timestamp: "2026-05-28T10:00:00Z", context: {} });
    }
    const response = await bundleRoute.POST(bundleRequest({
      kind: "mtg-tool-feedback-bundle",
      schemaVersion: 1,
      entries,
    }));
    expect(response.status).toBe(413);
  });
});

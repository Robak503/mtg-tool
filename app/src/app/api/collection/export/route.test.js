/**
 * /api/collection/export — smoke. The collection is user data (not a big synced
 * index), so this returns 200 even on a fresh/empty install.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

let tmpDir, originalCwd;

async function loadRoute() {
  vi.resetModules();
  return import("./route.js");
}

function get(url) {
  return new Request(url, { method: "GET" });
}

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "collection-export-"));
  await fs.mkdir(path.join(tmpDir, "data"), { recursive: true });
  originalCwd = process.cwd();
  process.chdir(tmpDir);
});

afterEach(async () => {
  process.chdir(originalCwd);
  await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
});

describe("/api/collection/export", () => {
  it("exports CSV with a download header", async () => {
    const route = await loadRoute();
    const res = await route.GET(get("http://localhost/api/collection/export?format=csv"));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toMatch(/text\/csv/);
    expect(res.headers.get("Content-Disposition")).toMatch(/attachment;.*\.csv/);
    expect(await res.text()).toContain("Count,Name,Edition,Condition,Foil,Language");
  });

  it("exports JSON by default", async () => {
    const route = await loadRoute();
    const res = await route.GET(get("http://localhost/api/collection/export"));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toMatch(/application\/json/);
    const body = await res.json();
    expect(body.kind).toBe("mtg-tool-collection");
    expect(Array.isArray(body.cards)).toBe(true);
  });

  it("rejects an unknown format with 400", async () => {
    const route = await loadRoute();
    const res = await route.GET(get("http://localhost/api/collection/export?format=xml"));
    expect(res.status).toBe(400);
  });
});

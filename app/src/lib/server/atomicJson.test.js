/**
 * Tests for atomicJson.js (Phase-7 PR-4a) — the shared crash-safe JSON IO.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { atomicWriteJson, readJsonSafe } from "./atomicJson.js";

let dir;
beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "mtg-atomic-"));
});
afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

describe("atomicJson", () => {
  it("writes and reads back JSON, creating parent directories", async () => {
    const p = path.join(dir, "deep", "nested", "a.json");
    await atomicWriteJson(p, { hello: "world", n: 1 });
    expect(await readJsonSafe(p)).toEqual({ hello: "world", n: 1 });
  });

  it("readJsonSafe returns null for a missing file", async () => {
    expect(await readJsonSafe(path.join(dir, "nope.json"))).toBeNull();
  });

  it("readJsonSafe returns null for corrupt JSON (never throws)", async () => {
    const p = path.join(dir, "bad.json");
    await fs.writeFile(p, "{ not valid json", "utf8");
    expect(await readJsonSafe(p)).toBeNull();
  });

  it("leaves no .tmp file behind after a successful write", async () => {
    await atomicWriteJson(path.join(dir, "c.json"), { x: 1 });
    const files = await fs.readdir(dir);
    expect(files.some(f => f.includes(".tmp."))).toBe(false);
    expect(files).toContain("c.json");
  });

  it("overwrites an existing file atomically", async () => {
    const p = path.join(dir, "d.json");
    await atomicWriteJson(p, { v: 1 });
    await atomicWriteJson(p, { v: 2 });
    expect(await readJsonSafe(p)).toEqual({ v: 2 });
  });
});

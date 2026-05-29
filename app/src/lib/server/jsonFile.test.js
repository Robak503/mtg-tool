/**
 * Tests for readJsonOrNull — the corrupt/missing-tolerant JSON reader the data
 * loaders use so one bad reference file degrades a single feature instead of
 * 500-ing the whole app.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

import { readJsonOrNull } from "./jsonFile.js";

let tmpDir;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "jsonfile-test-"));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
});

describe("readJsonOrNull", () => {
  it("parses a valid JSON file", async () => {
    const f = path.join(tmpDir, "ok.json");
    await fs.writeFile(f, JSON.stringify({ a: 1 }), "utf8");
    expect(readJsonOrNull(f)).toEqual({ a: 1 });
  });

  it("returns the fallback for a missing file (default null)", () => {
    const f = path.join(tmpDir, "nope.json");
    expect(readJsonOrNull(f)).toBeNull();
    expect(readJsonOrNull(f, { fallback: [] })).toEqual([]);
  });

  it("returns the fallback (never throws) for a corrupt file", async () => {
    const f = path.join(tmpDir, "bad.json");
    await fs.writeFile(f, "{ not valid json", "utf8");
    expect(() => readJsonOrNull(f, { fallback: {}, label: "bad" })).not.toThrow();
    expect(readJsonOrNull(f, { fallback: {} })).toEqual({});
  });
});

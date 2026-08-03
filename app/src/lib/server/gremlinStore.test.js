/**
 * gremlinStore.js — per-profile persistence for Tibalt's gremlin (A1).
 *
 * The established process.chdir(tmpdir) idiom: with MTG_APP_ROOT unset, paths.js falls back to
 * cwd, so profilePath("gremlin.json") lands under <tmpdir>/data/. Pins:
 *   - a missing file reads as a fresh DISABLED record (opt-in, never opt-out);
 *   - the record round-trips (enabled, policy state, log);
 *   - garbage on disk degrades to the fresh disabled record instead of throwing;
 *   - firedThisSession SURVIVES within one process (same boot marker) — the session-cap
 *     cross-launch reset is a boot-time behavior a single test process cannot observe two
 *     sides of, so the write path's marker stamping is asserted directly instead.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { readGremlin, writeGremlin } from "./gremlinStore.js";

let tmpDir, originalCwd;
beforeEach(() => {
  originalCwd = process.cwd();
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mtg-gremlin-"));
  process.chdir(tmpDir);
});
afterEach(() => {
  process.chdir(originalCwd);
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("gremlinStore — per-profile persistence", () => {
  it("a missing file reads as a fresh DISABLED record", async () => {
    const rec = await readGremlin();
    expect(rec.enabled).toBe(false);
    expect(rec.state.firedThisSession).toBe(0);
    expect(rec.log).toEqual([]);
  });

  it("round-trips enabled + state + log, and keeps firedThisSession within the same process", async () => {
    await writeGremlin({
      enabled: true,
      state: { firedThisSession: 1, lastFireAt: 123, recentFires: [123], suppressed: { "d1:draw-count-low": 3 }, consecutiveIgnores: 2 },
      log: [{ id: "fire-1", findingKey: "draw-count-low", reaction: "pending" }],
    });
    const rec = await readGremlin();
    expect(rec.enabled).toBe(true);
    expect(rec.state).toMatchObject({ firedThisSession: 1, lastFireAt: 123, suppressed: { "d1:draw-count-low": 3 }, consecutiveIgnores: 2 });
    expect(rec.log).toHaveLength(1);
  });

  it("stamps the boot marker on every write (the cross-launch session-cap reset's anchor)", async () => {
    await writeGremlin({ enabled: true, state: { firedThisSession: 1 }, log: [] });
    const raw = JSON.parse(fs.readFileSync(path.join(tmpDir, "data", "gremlin.json"), "utf8"));
    expect(Number.isFinite(raw.sessionMarker)).toBe(true);
    // A record stamped by a DIFFERENT launch must reset the session counter on read.
    raw.sessionMarker = raw.sessionMarker - 999_999;
    fs.writeFileSync(path.join(tmpDir, "data", "gremlin.json"), JSON.stringify(raw));
    const rec = await readGremlin();
    expect(rec.state.firedThisSession).toBe(0);
  });

  it("garbage on disk degrades to the fresh disabled record", async () => {
    fs.mkdirSync(path.join(tmpDir, "data"), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, "data", "gremlin.json"), "not json{");
    const rec = await readGremlin();
    expect(rec.enabled).toBe(false);
    expect(rec.state.firedThisSession).toBe(0);
  });
});

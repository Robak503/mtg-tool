/**
 * Tests for learnSaveStore.js (Phase-7 PR-4a) — per-profile disk save/resume.
 *
 * Uses the established process.chdir(tmpdir) idiom: with MTG_APP_ROOT unset,
 * paths.js falls back to cwd, so profilePath("learn-sessions") lands under
 * <tmpdir>/data/learn-sessions.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  autosaveSession,
  loadSave,
  listSaves,
  deleteSave,
} from "./learnSaveStore.js";
import { checksumOf } from "./learnSaveSchema.js";

let tmpDir, originalCwd;
beforeEach(() => {
  originalCwd = process.cwd();
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mtg-learnsave-"));
  process.chdir(tmpDir);
});
afterEach(() => {
  process.chdir(originalCwd);
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function saveDirFile(name) {
  return path.join(tmpDir, "data", "learn-sessions", name);
}
function session(id, over = {}) {
  return {
    id,
    createdAt: "2026-06-06T00:00:00.000Z",
    difficulty: "beginner",
    mode: "standard",
    status: "active",
    state: { turn: 2, idSeq: 3, stack: [], players: { user: { life: 40 }, ai: { life: 40 } } },
    decisionLog: [],
    meta: { userDeckName: "Sliver Hivelord" },
    ...over,
  };
}

describe("learnSaveStore", () => {
  it("autosaves and loads a session round-trip", async () => {
    const s = session("learn-aaa");
    await autosaveSession(s);
    const res = await loadSave("learn-aaa");
    expect(res.ok).toBe(true);
    expect(res.saveDoc.serializable).toBe(true);
    expect(res.saveDoc.session).toEqual(s);
  });

  it("lists saves with denormalized index entries", async () => {
    await autosaveSession(session("learn-aaa"));
    await autosaveSession(session("learn-bbb", { mode: "commander" }));
    const saves = await listSaves();
    expect(saves).toHaveLength(2);
    const a = saves.find(x => x.sessionId === "learn-aaa");
    expect(a.userDeckName).toBe("Sliver Hivelord");
    expect(a.opponentSummary).toBe("1 opponent");
    expect(a.resumable).toBe(true);
    const b = saves.find(x => x.sessionId === "learn-bbb");
    expect(b.opponentSummary).toBe("3 opponents (pod)");
  });

  it("loadSave returns not-found for an unknown id", async () => {
    expect(await loadSave("nope")).toEqual({ ok: false, reason: "not-found" });
  });

  it("loadSave returns checksum on a tampered save file", async () => {
    await autosaveSession(session("learn-aaa"));
    const file = saveDirFile("learn-aaa.json");
    const doc = JSON.parse(fs.readFileSync(file, "utf8"));
    doc.session.state.turn = 999; // tamper without recomputing the checksum
    fs.writeFileSync(file, JSON.stringify(doc), "utf8");
    expect((await loadSave("learn-aaa")).reason).toBe("checksum");
  });

  it("deleteSave removes the save and drops it from the index", async () => {
    await autosaveSession(session("learn-aaa"));
    await deleteSave("learn-aaa");
    expect((await loadSave("learn-aaa")).ok).toBe(false);
    expect(await listSaves()).toHaveLength(0);
  });

  it("self-heals a missing index on list", async () => {
    await autosaveSession(session("learn-aaa"));
    fs.rmSync(saveDirFile("index.json"), { force: true });
    expect(await listSaves()).toHaveLength(1);
  });

  it("flags a session carrying a closure as not resumable (defensive)", async () => {
    const bad = session("learn-bad");
    bad.state.stack.push({ id: "stk-1", payload: { onResolve: () => {} } });
    await autosaveSession(bad);
    const entry = (await listSaves()).find(x => x.sessionId === "learn-bad");
    expect(entry.resumable).toBe(false);
  });

  // Regression: a save written by an OLDER schema (e.g. the shipped v0.25.x /
  // schema-v2 build) must still list as resumable — the index computes the flag
  // against the MIGRATED doc, matching what the resume route does. Without this,
  // bumping CURRENT_SCHEMA_VERSION greys out the Resume button for every in-flight
  // game and strands it, defeating the migration's whole purpose.
  it("lists an older-schema (v2) save as resumable (migration honored at the index)", async () => {
    const s = session("learn-old2");
    const v2Doc = {
      schemaVersion: 2,
      engineVersion: "0.25.0",
      kind: "learn-session-save",
      savedAt: "2026-06-06T00:01:00.000Z",
      sessionId: "learn-old2",
      session: s,
      serializable: true,
      checksum: checksumOf(s),
    };
    fs.mkdirSync(path.dirname(saveDirFile("learn-old2.json")), { recursive: true });
    fs.writeFileSync(saveDirFile("learn-old2.json"), JSON.stringify(v2Doc), "utf8");
    const entry = (await listSaves()).find(x => x.sessionId === "learn-old2");
    expect(entry).toBeTruthy();
    expect(entry.resumable).toBe(true);
  });
});

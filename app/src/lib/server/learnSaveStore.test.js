/**
 * Tests for learnSaveStore.js (Phase-7 PR-4a) — per-profile disk save/resume.
 *
 * Uses the established process.chdir(tmpdir) idiom: with MTG_APP_ROOT unset,
 * paths.js falls back to cwd, so profilePath("learn-sessions") lands under
 * <tmpdir>/data/learn-sessions.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  autosaveSession,
  loadSave,
  listSaves,
  deleteSave,
} from "./learnSaveStore.js";
import { checksumOf } from "./learnSaveSchema.js";
import { engineBuild } from "../learn/engineBuild.js";

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
    // The engine BUILD stamp (release-readiness R2) — was npm_package_version: a stale "0.150.0" under npm,
    // and null in the packaged exe.
    expect(res.saveDoc.engineVersion).toBe(engineBuild());
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

// 2026-10-21 — no silent catches in the save store. A failure that costs the player their game (the save, or the
// index the Resume list reads) throws to the route, which logs and reports it; pruning is the one best-effort
// step, and its failures are logged with the new save left standing.
describe("learnSaveStore — failures surface", () => {
  let errorSpy;
  beforeEach(() => {
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });
  const logged = () => errorSpy.mock.calls.map((args) => args.map(String).join(" "));

  it("deleteSave throws when the save exists but can't be removed", async () => {
    await autosaveSession(session("learn-aaa"));
    fs.rmSync(saveDirFile("learn-aaa.json"), { force: true });
    fs.mkdirSync(saveDirFile("learn-aaa.json")); // unlink on a folder: EPERM / EISDIR, not ENOENT
    await expect(deleteSave("learn-aaa")).rejects.toThrow();
  });

  it("deleteSave of a save that is already gone is fine (control)", async () => {
    await autosaveSession(session("learn-aaa"));
    fs.rmSync(saveDirFile("learn-aaa.json"), { force: true });
    await expect(deleteSave("learn-aaa")).resolves.toBe(true);
    expect(await listSaves()).toHaveLength(0);
  });

  it("autosaveSession throws when the saved-games index can't be written (the Resume list would miss the game)", async () => {
    fs.mkdirSync(saveDirFile("index.json"), { recursive: true }); // the index's rename onto a folder fails
    await expect(autosaveSession(session("learn-aaa"))).rejects.toThrow();
  });

  it("listSaves lists from the save files when the rebuilt index can't be written, and logs that", async () => {
    await autosaveSession(session("learn-aaa"));
    fs.rmSync(saveDirFile("index.json"), { force: true });
    fs.mkdirSync(saveDirFile("index.json")); // unreadable as JSON (self-heal) and unwritable
    const saves = await listSaves();
    expect(saves.map((s) => s.sessionId)).toEqual(["learn-aaa"]);
    expect(logged().some((l) => l.includes("[learnSaveStore] the rebuilt saved-games index could not be written"))).toBe(true);
  });

  it("a prune that fails is logged, and the new save stands", async () => {
    const old = session("learn-old");
    fs.mkdirSync(path.dirname(saveDirFile("x")), { recursive: true });
    fs.writeFileSync(
      saveDirFile("learn-old.json"),
      JSON.stringify({ schemaVersion: 6, kind: "learn-session-save", savedAt: "2020-01-01T00:00:00.000Z", sessionId: "learn-old", session: old, serializable: true, checksum: checksumOf(old) }),
    );
    const realUnlink = fsp.unlink;
    vi.spyOn(fsp, "unlink").mockImplementation(async (p) => {
      if (String(p).endsWith("learn-old.json")) throw Object.assign(new Error("EPERM: operation not permitted, unlink"), { code: "EPERM" });
      return realUnlink(p);
    });
    await expect(autosaveSession(session("learn-new"))).resolves.toBeTruthy();
    expect((await loadSave("learn-new")).ok).toBe(true);
    expect(fs.existsSync(saveDirFile("learn-old.json"))).toBe(true);
    expect(logged().some((l) => l.includes("[learnSaveStore] pruning old Academy saves failed (the new save of learn-new stands)"))).toBe(true);
  });

  it("a prune that succeeds deletes the expired save and logs nothing (control)", async () => {
    const old = session("learn-old");
    fs.mkdirSync(path.dirname(saveDirFile("x")), { recursive: true });
    fs.writeFileSync(
      saveDirFile("learn-old.json"),
      JSON.stringify({ schemaVersion: 6, kind: "learn-session-save", savedAt: "2020-01-01T00:00:00.000Z", sessionId: "learn-old", session: old, serializable: true, checksum: checksumOf(old) }),
    );
    await autosaveSession(session("learn-new"));
    expect(fs.existsSync(saveDirFile("learn-old.json"))).toBe(false);
    expect((await listSaves()).map((s) => s.sessionId)).toEqual(["learn-new"]);
    expect(logged()).toEqual([]);
  });
});

/**
 * learnPersistence.test.js — the play routes' disk step after a move (2026-10-21): kept → null; not kept → logged
 * and returned as a `saveFailure` for the Academy's notice; dropping a finished game's save logs only.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { autosaveForPlay, recordFinishedGame, dropFinishedGameSave } from "./learnPersistence.js";
import { loadSave } from "./learnSaveStore.js";
import { listGameRecords } from "./gameRecordsStore.js";

let tmpDir, originalCwd, errorSpy;
beforeEach(() => {
  originalCwd = process.cwd();
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mtg-learn-persist-"));
  process.chdir(tmpDir);
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
  process.chdir(originalCwd);
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

const logged = () => errorSpy.mock.calls.map((args) => args.map(String).join(" "));
function session(id, state = {}) {
  return {
    id,
    createdAt: "2026-10-21T00:00:00.000Z",
    difficulty: "beginner",
    mode: "standard",
    status: "active",
    state: { turn: 4, step: "main", idSeq: 1, stack: [], players: { user: { life: 40 }, ai: { life: 40 } }, ...state },
    decisionLog: [],
  };
}

describe("autosaveForPlay", () => {
  it("saves the game and reports nothing", async () => {
    expect(await autosaveForPlay(session("learn-p1"))).toBeNull();
    expect((await loadSave("learn-p1")).saveDoc.session.state.turn).toBe(4);
    expect(logged()).toEqual([]);
  });

  it("a write that fails is logged and returned, never thrown", async () => {
    fs.mkdirSync(path.join(tmpDir, "data"), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, "data", "learn-sessions"), "not a folder");
    const failure = await autosaveForPlay(session("learn-p2"));
    expect(failure).toEqual({ kind: "autosave", detail: expect.stringMatching(/EEXIST/) });
    expect(logged().some((l) => l.includes("[learn] autosave failed for learn-p2"))).toBe(true);
  });

  it("a save written but not resumable (a closure in state) is reported too", async () => {
    const s = session("learn-p3", { stack: [{ id: "stk-1", payload: { onResolve: () => {} } }] });
    const failure = await autosaveForPlay(s);
    expect(failure).toEqual({ kind: "autosave", detail: "the saved game can't be resumed (live-closure-in-state)" });
    expect(logged().some((l) => l.includes("[learn] autosave of learn-p3 wrote a save that can't be resumed"))).toBe(true);
  });
});

describe("recordFinishedGame", () => {
  it("keeps the record and reports nothing", async () => {
    expect(await recordFinishedGame({ id: "learn-r1", status: "user-wins" })).toBeNull();
    expect((await listGameRecords()).map((r) => r.id)).toEqual(["learn-r1"]);
  });

  it("a record that can't be written is logged and returned as a game-record failure", async () => {
    fs.mkdirSync(path.join(tmpDir, "data", "learn-records.json"), { recursive: true });
    const failure = await recordFinishedGame({ id: "learn-r2", status: "ai-wins" });
    expect(failure?.kind).toBe("game-record");
    expect(logged().some((l) => l.includes("[learn] the record of finished game learn-r2 could not be saved"))).toBe(true);
  });
});

describe("dropFinishedGameSave", () => {
  it("removes the save quietly", async () => {
    await autosaveForPlay(session("learn-d1"));
    await dropFinishedGameSave("learn-d1");
    expect((await loadSave("learn-d1")).ok).toBe(false);
    expect(logged()).toEqual([]);
  });

  it("a save that can't be removed is logged, not thrown and not reported", async () => {
    fs.mkdirSync(path.join(tmpDir, "data", "learn-sessions", "learn-d2.json"), { recursive: true });
    await expect(dropFinishedGameSave("learn-d2")).resolves.toBeUndefined();
    expect(logged().some((l) => l.includes("[learn] the in-flight save of finished game learn-d2 could not be removed"))).toBe(true);
  });
});

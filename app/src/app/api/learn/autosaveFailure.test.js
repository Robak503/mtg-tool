/**
 * autosaveFailure.test.js — a game that can't be kept on disk keeps playing, and the failure is logged and
 * reported, never swallowed (2026-10-21).
 *
 * Every play route (start, step, choose, continue, mulligan) used to wrap its autosave in an empty catch. When the
 * save threw — as it did on every move in `npm run dev` and in the exe from v0.161.0, where engineBuild() could not
 * read package.json under webpack (engineBuild.bundled.test.js) — the game was simply never written, and nothing
 * said so. Here the save is made to fail by putting a file where the save folder goes (mkdir: EEXIST): each route
 * still answers 200 with the next decision, logs the error, and carries `saveFailure: { kind: "autosave" }` for the
 * Academy's notice. The controls, with a writable folder, show the save written and no `saveFailure`.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

let startRoute;
let stepRoute;
let chooseRoute;
let continueRoute;
let mulliganRoute;
let store;
let tmpDir;
let originalCwd;
let errorSpy;

function forest(i) {
  return { id: `f-${i}`, name: "Forest", type: "Basic Land — Forest", oracle: "{T}: Add {G}.", mana: "" };
}
function bear(i) {
  return { id: `b-${i}`, name: "Grizzly Bears", type: "Creature — Bear", oracle: "", mana: "{1}{G}", cmc: 2 };
}
function deck(label) {
  const out = [];
  for (let i = 0; i < 18; i++) out.push(forest(`${label}-${i}`));
  for (let i = 0; i < 12; i++) out.push(bear(`${label}-${i}`));
  return out;
}
function post(url, body) {
  return new Request(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
}

const savesDir = () => path.join(tmpDir, "data", "learn-sessions");
const saveFile = (id) => path.join(savesDir(), `${id}.json`);
const readSave = (id) => JSON.parse(fs.readFileSync(saveFile(id), "utf8"));

/** Put a plain file where the save folder goes: the next autosave's mkdir fails (EEXIST). */
function blockSaves() {
  fs.rmSync(savesDir(), { recursive: true, force: true });
  fs.mkdirSync(path.dirname(savesDir()), { recursive: true });
  fs.writeFileSync(savesDir(), "not a folder");
}

async function start(extra = {}) {
  const res = await startRoute.POST(
    post("http://localhost/api/learn/start", { userDeck: deck("u"), opponentDeck: deck("a"), difficulty: "beginner", ...extra }),
  );
  return { status: res.status, data: await res.json() };
}

/** The console.error lines the save path logged (message text of each call). */
function loggedLines() {
  return errorSpy.mock.calls.map((args) => args.map((a) => (a instanceof Error ? `${a.code || ""} ${a.message}` : String(a))).join(" "));
}

beforeEach(async () => {
  originalCwd = process.cwd();
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mtg-autosave-failure-"));
  process.chdir(tmpDir); // paths.js falls back to cwd with MTG_APP_ROOT unset: saves land in <tmp>/data/learn-sessions
  vi.resetModules();
  startRoute = await import("./start/route.js");
  stepRoute = await import("./step/route.js");
  chooseRoute = await import("./choose/route.js");
  continueRoute = await import("./continue/route.js");
  mulliganRoute = await import("./mulligan/route.js");
  store = await import("../../../lib/server/learnSessionStore.js");
  store.resetStore();
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  process.chdir(originalCwd);
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

/** Each play route, driven from a started game to the request whose autosave is under test. */
const ROUTES = {
  start: async () => start(),
  step: async (first) => {
    const pass = first.decision.options.find((o) => o.kind === "pass-priority");
    const res = await stepRoute.POST(post("http://localhost/api/learn/step", { sessionId: first.sessionId, choice: pass }));
    return { status: res.status, data: await res.json() };
  },
  choose: async (first) => {
    // No pending choice: the route re-derives the current decision and saves, like any answered choice.
    const res = await chooseRoute.POST(post("http://localhost/api/learn/choose", { sessionId: first.sessionId, choice: {} }));
    return { status: res.status, data: await res.json() };
  },
  continue: async (first) => {
    const session = store.getSession(first.sessionId);
    session.state.pendingArbiter = {
      stackObjectId: "stk-77",
      cardName: "Mystic Confluence",
      oracle: "Choose three —",
      reason: "instant-or-sorcery (no recognized effect)",
      controller: "user",
    };
    store.putSession(session);
    const res = await continueRoute.POST(post("http://localhost/api/learn/continue", { sessionId: first.sessionId }));
    return { status: res.status, data: await res.json() };
  },
  mulligan: async (first) => {
    const res = await mulliganRoute.POST(
      post("http://localhost/api/learn/mulligan", { sessionId: first.sessionId, action: { kind: "mulligan-keep" } }),
    );
    return { status: res.status, data: await res.json() };
  },
};

describe.each(Object.keys(ROUTES))("POST /api/learn/%s — autosave", (route) => {
  async function play({ blocked }) {
    if (route === "start") {
      if (blocked) blockSaves();
      return ROUTES.start();
    }
    const first = await start(route === "mulligan" ? { humanMulligan: true } : {});
    expect(first.status).toBe(200);
    if (blocked) blockSaves();
    return ROUTES[route](first.data);
  }

  it("control: the move is saved to disk and the response carries no saveFailure", async () => {
    const { status, data } = await play({ blocked: false });
    expect(status).toBe(200);
    expect(data.saveFailure).toBeUndefined();
    const saved = readSave(data.sessionId).session;
    expect(saved.state.turn).toBe(data.turn);
    expect(saved.state.step).toBe(data.step);
    expect(saved.status).toBe(store.getSession(data.sessionId).status);
    expect(loggedLines().filter((l) => l.includes("[learn]"))).toEqual([]);
  });

  it("a save that throws: play goes on, the error is logged, and the response reports it", async () => {
    const { status, data } = await play({ blocked: true });
    expect(status).toBe(200);
    expect(data.decision).toBeTruthy(); // the game answered as usual
    expect(store.getSession(data.sessionId)).toBeTruthy(); // and is still live
    expect(data.saveFailure?.kind).toBe("autosave");
    expect(data.saveFailure?.detail).toMatch(/EEXIST/);
    const lines = loggedLines();
    expect(lines.some((l) => l.includes(`[learn] autosave failed for ${data.sessionId}`) && /EEXIST/.test(l))).toBe(true);
  });
});

describe("game over — the finished game's record and its in-flight save", () => {
  async function finishGame() {
    const first = await start();
    const session = store.getSession(first.data.sessionId);
    session.state.players.user.life = 0;
    store.putSession(session);
    return first.data.sessionId;
  }
  async function step(sessionId) {
    const res = await stepRoute.POST(post("http://localhost/api/learn/step", { sessionId, choice: { kind: "pass-priority" } }));
    return { status: res.status, data: await res.json() };
  }

  it("control: the record is kept, the save is dropped, nothing is reported", async () => {
    const sessionId = await finishGame();
    const { status, data } = await step(sessionId);
    expect(status).toBe(200);
    expect(data.decision.kind).toBe("game-over");
    expect(data.saveFailure).toBeUndefined();
    const records = JSON.parse(fs.readFileSync(path.join(tmpDir, "data", "learn-records.json"), "utf8"));
    expect(records.some((r) => r.id === sessionId)).toBe(true);
    expect(fs.existsSync(saveFile(sessionId))).toBe(false);
  });

  it("a record that can't be written is logged and reported as a game-record failure; the game still ends", async () => {
    const sessionId = await finishGame();
    fs.mkdirSync(path.join(tmpDir, "data", "learn-records.json"), { recursive: true }); // the rename onto it fails
    const { status, data } = await step(sessionId);
    expect(status).toBe(200);
    expect(data.decision.kind).toBe("game-over");
    expect(data.saveFailure?.kind).toBe("game-record");
    expect(store.getSession(sessionId)).toBeNull();
    expect(loggedLines().some((l) => l.includes(`[learn] the record of finished game ${sessionId} could not be saved`))).toBe(true);
  });

  it("an in-flight save that can't be removed is logged only (cleanup) — no notice", async () => {
    const sessionId = await finishGame();
    fs.rmSync(saveFile(sessionId), { force: true });
    fs.mkdirSync(saveFile(sessionId)); // unlink on a folder fails (EPERM / EISDIR), not ENOENT
    const { status, data } = await step(sessionId);
    expect(status).toBe(200);
    expect(data.decision.kind).toBe("game-over");
    expect(data.saveFailure).toBeUndefined();
    expect(loggedLines().some((l) => l.includes(`[learn] the in-flight save of finished game ${sessionId} could not be removed`))).toBe(true);
  });
});

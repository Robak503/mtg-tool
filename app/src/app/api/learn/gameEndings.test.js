/**
 * gameEndings.test.js — how an Academy game leaves play, through the routes (2026-10-22).
 *
 * The stuck-game slice (every guard-stopped game ends as "engine-stopped") left four gaps, each a way a game stayed in
 * "Continue a game" or a finished game read wrong:
 *   1. "Abandon game" never abandoned: the button only reset the page and `learnSession.abandon` had no caller, so the
 *      game stayed resumable and no record was kept. POST /api/learn/abandon now ends it: status "abandoned" ("You ended
 *      the game early."), its record kept with that result, its session freed and its save dropped — through
 *      learnPersistence.finishGame, the one way a finished game leaves play — whether the game is in memory, only on
 *      disk (the server restarted since it was last played), or still at its opening-hand mulligans.
 *   2. The two engine faults trapped the way the guards did: a step that throws, and a seat holding priority with no
 *      legal action whose pass throws, answered "engine-stuck" with no `guard`; the game stayed active, was autosaved,
 *      and every resume re-derived the same throw. Each now names itself (`engine-error`, `no-legal-action`), the game
 *      ends as engine-stopped like a guard's, and the error is logged with its stack.
 *   3. Every Academy record's table read "—": the records reader (RecordsView `seatLine`) read fields no writer writes.
 *   4. After a resume the header read "You vs Opponent": resume (and resume-puzzle) answered no deck names.
 *
 * The faults are reached through real engine states that throw (a step the turn structure doesn't have, so moving on
 * from it throws "Invalid (phase=…, step=…)"); the route, the driver, the stores and the files are real, and the data
 * root is a temp dir (paths.js falls back to cwd with MTG_APP_ROOT unset).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

let routes;
let store;
let saveStore;
let records;
let learn;
let seatLine;
let reasonToOutcome;
let tmpDir;
let originalCwd;
let warnSpy;
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
async function call(route, url, body) {
  const res = await route.POST(post(url, body));
  return { status: res.status, data: await res.json() };
}

const USER_DECK = "Forest Bears";
const OPPONENT_DECK = "Bear Forest";
const saveFile = (id) => path.join(tmpDir, "data", "learn-sessions", `${id}.json`);

async function start(extra = {}) {
  return call(routes.start, "http://localhost/api/learn/start", {
    userDeck: deck("u"),
    opponentDeck: deck("a"),
    difficulty: "beginner",
    userDeckName: USER_DECK,
    opponentDeckNames: [OPPONENT_DECK],
    ...extra,
  });
}

/** Start a game and make one move (a pass), so it is autosaved and listed like any game in progress. */
async function startAndMove() {
  const first = await start();
  expect(first.status).toBe(200);
  const pass = first.data.decision.options.find((o) => o.kind === "pass-priority");
  const moved = await call(routes.step, "http://localhost/api/learn/step", { sessionId: first.data.sessionId, choice: pass });
  expect(moved.status).toBe(200);
  expect(moved.data.status).toBe("active");
  expect(fs.existsSync(saveFile(first.data.sessionId))).toBe(true);
  return moved.data;
}

/** The saved games "Continue a game" lists. */
async function listedSaves() {
  const res = await routes.saves.GET();
  return (await res.json()).saves;
}

/** POST /api/learn/abandon — the route is looked up at call time, so its absence fails on an assertion. */
async function abandonGame(sessionId) {
  let mod;
  let importError = null;
  try {
    mod = await import("./abandon/route.js");
  } catch (error) {
    importError = error;
  }
  expect(typeof mod?.POST, `POST /api/learn/abandon exists${importError ? ` (${importError.message})` : ""}`).toBe("function");
  return call(mod, "http://localhost/api/learn/abandon", { sessionId });
}

/** The opponent seat's id. */
const opponentOf = (session) => Object.keys(session.state.players).find((id) => id !== "user");

/**
 * Two engine states the engine cannot move on from — each throws again on every re-derive, which is what made them a
 * trap once saved:
 *   - THROWING_STEP: nobody holds priority on a step the turn structure doesn't have, so moving to the next step throws;
 *   - NO_LEGAL_ACTION: you hold priority while the opponent's free-cast window is open (you have no legal action), so the
 *     driver passes for you, and that pass — the last one round the table — moves to the next step, which throws.
 */
const THROWING_STEP = () => ({ priorityHolder: null, step: "no-such-step" });
const NO_LEGAL_ACTION = (session) => ({
  pendingFreeCast: { controller: opponentOf(session), card: null },
  priorityHolder: "user",
  consecutivePasses: 1,
  step: "no-such-step",
});
// What moving on from that step throws (the phase is the one the game is in).
const THROWN = /^Invalid \(phase=[a-z-]+, step=no-such-step\)$/;
const THROWN_IN_TEXT = /Invalid \(phase=[a-z-]+, step=no-such-step\)/;

/** Put the stored session into a faulted engine state. */
function fault(sessionId, patchOf) {
  const session = store.getSession(sessionId);
  const faulted = { ...session, state: { ...session.state, ...patchOf(session) } };
  store.putSession(faulted);
  return faulted;
}

beforeEach(async () => {
  originalCwd = process.cwd();
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mtg-game-endings-"));
  process.chdir(tmpDir);
  vi.resetModules();
  routes = {
    start: await import("./start/route.js"),
    step: await import("./step/route.js"),
    choose: await import("./choose/route.js"),
    resume: await import("./resume/route.js"),
    resumePuzzle: await import("./resume-puzzle/route.js"),
    puzzles: await import("../puzzles/route.js"),
    saves: await import("./saves/route.js"),
  };
  store = await import("../../../lib/server/learnSessionStore.js");
  saveStore = await import("../../../lib/server/learnSaveStore.js");
  records = await import("../../../lib/server/gameRecordsStore.js");
  learn = await import("../../../lib/learn/learnSession.js");
  ({ seatLine } = await import("../../../components/mtg/RecordsView.jsx"));
  ({ reasonToOutcome } = await import("../../../lib/learn/learnOutcome.js"));
  store.resetStore();
  warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  process.chdir(originalCwd);
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

/** The record kept for a game, by id. */
async function recordOf(sessionId) {
  return (await records.listGameRecords()).find((r) => r.id === sessionId);
}

/** Nothing left to continue: not in memory, not on disk, not in the list. */
async function expectGone(sessionId) {
  expect(store.getSession(sessionId)).toBeNull();
  expect(fs.existsSync(saveFile(sessionId))).toBe(false);
  expect((await listedSaves()).map((s) => s.sessionId)).not.toContain(sessionId);
}

/** Everything an abandoned game must leave behind. */
async function expectAbandoned({ status, data }, sessionId) {
  expect(status).toBe(200);
  expect(data.sessionId).toBe(sessionId);
  expect(data.status).toBe("abandoned");
  expect(data.decision).toEqual({ kind: "game-over", reason: "abandoned" });
  // The end screen's words: the person's own ending.
  expect(reasonToOutcome(data.decision.reason)).toEqual({ tone: "neutral", title: "Game abandoned.", blurb: "You ended the game early." });
  // The header keeps the decks.
  expect(data.userDeckName).toBe(USER_DECK);
  expect(data.opponentDeckNames).toEqual([OPPONENT_DECK]);

  await expectGone(sessionId);

  // Its record is kept with that result, and the records list names the table.
  const kept = await recordOf(sessionId);
  expect(kept).toBeTruthy();
  expect(kept.status).toBe("abandoned");
  expect(kept.meta).toMatchObject({ userDeckName: USER_DECK, opponentNames: [OPPONENT_DECK] });
  expect(seatLine(kept.meta)).toBe(`${USER_DECK} vs ${OPPONENT_DECK}`);
  return kept;
}

describe("“Abandon game” ends the game — POST /api/learn/abandon", () => {
  it("a game in progress: ended as abandoned, its record kept, its save dropped, gone from “Continue a game”", async () => {
    const moved = await startAndMove();
    expect((await listedSaves()).map((s) => s.sessionId)).toContain(moved.sessionId);
    const res = await abandonGame(moved.sessionId);
    const kept = await expectAbandoned(res, moved.sessionId);
    expect(kept.turns).toBe(moved.turn);
  });

  it("a game only on disk (the server restarted since its last move) is ended from its save", async () => {
    const moved = await startAndMove();
    store.resetStore(); // the server restarted
    expect(store.getSession(moved.sessionId)).toBeNull();
    const res = await abandonGame(moved.sessionId);
    await expectAbandoned(res, moved.sessionId);
  });

  it("a game still at its opening-hand mulligans (saved and listed from the start) can be abandoned", async () => {
    const first = await start({ humanMulligan: true });
    expect(first.data.status).toBe("mulligan");
    expect((await listedSaves()).map((s) => s.sessionId)).toContain(first.data.sessionId);
    const res = await abandonGame(first.data.sessionId);
    await expectAbandoned(res, first.data.sessionId);
  });

  it("nothing to abandon: an unknown game is 404, a game already over is 409 and its record is left as it was", async () => {
    const unknown = await abandonGame("learn-no-such-game");
    expect(unknown.status).toBe(404);

    const moved = await startAndMove();
    const live = store.getSession(moved.sessionId);
    store.putSession({ ...live, status: "user-wins", endedAt: new Date().toISOString() }); // a finished game still in memory
    const over = await abandonGame(moved.sessionId);
    expect(over.status).toBe(409);
    expect(over.data.status).toBe("user-wins");
    // The refused abandon changed nothing: no record written, the save where it was.
    expect(await recordOf(moved.sessionId)).toBeUndefined();
    expect(fs.existsSync(saveFile(moved.sessionId))).toBe(true);
  });
});

/**
 * Everything an engine-fault-stopped game must leave behind — what the stuck-game slice requires of a guard's stop
 * (the end-of-game response with the honest message, the log line, no session, no save, the record), plus the error
 * logged with its stack.
 */
async function expectEndedByFault({ status, data }, sessionId, guard, messagePattern) {
  expect(status).toBe(200);
  expect(data.sessionId).toBe(sessionId);
  expect(data.status).toBe("engine-stopped");
  expect(data.decision.kind).toBe("game-over");
  expect(data.decision.reason).toBe("engine-stopped");
  expect(data.decision.guard).toBe(guard);
  expect(data.decision.message).toMatch(/^The engine stopped the game: /);
  expect(data.decision.message).toMatch(messagePattern);
  expect(data.decision.message).toMatch(THROWN_IN_TEXT); // the error itself, in one line
  expect(data.decision.message).not.toMatch(/\bwon\b|\blost\b|abandon/i);

  const last = data.decisionLogTail.at(-1);
  expect(last.action).toEqual({ kind: "game-stopped", guard, message: data.decision.message });
  expect(last.actor).toBe(null);

  await expectGone(sessionId);

  const kept = await recordOf(sessionId);
  expect(kept).toBeTruthy();
  expect(kept.status).toBe("engine-stopped");
  expect(kept.engineStop).toMatchObject({ guard, message: data.decision.message });

  // The stop named in the server log, and the engine's error logged WITH its stack (the Error itself, not its text).
  const warned = warnSpy.mock.calls.map((args) => args.map(String).join(" "));
  expect(warned.some((l) => l.includes(sessionId) && l.includes("engine stopped"))).toBe(true);
  const logged = errorSpy.mock.calls.find((args) => String(args[0]).includes(sessionId) && args.some((a) => a instanceof Error));
  expect(logged, "console.error(<which game>, <the Error>)").toBeTruthy();
  const err = logged.find((a) => a instanceof Error);
  expect(err.message).toMatch(THROWN);
  expect(err.stack).toMatch(/\n\s+at /);
}

describe("the two engine faults end the game they stop", () => {
  it("a step that throws (`engine-error`)", async () => {
    const moved = await startAndMove();
    fault(moved.sessionId, THROWING_STEP);
    const res = await call(routes.choose, "http://localhost/api/learn/choose", { sessionId: moved.sessionId, choice: {} });
    await expectEndedByFault(res, moved.sessionId, "engine-error", /an engine error/);
  });

  it("no legal action, and the pass throws (`no-legal-action`)", async () => {
    const moved = await startAndMove();
    fault(moved.sessionId, NO_LEGAL_ACTION);
    const res = await call(routes.choose, "http://localhost/api/learn/choose", { sessionId: moved.sessionId, choice: {} });
    await expectEndedByFault(res, moved.sessionId, "no-legal-action", /^The engine stopped the game: You had priority with no legal action/);
  });

  it("a faulted save from before this fix ends on its first resume and leaves the list", async () => {
    for (const [patchOf, guard] of [[THROWING_STEP, "engine-error"], [NO_LEGAL_ACTION, "no-legal-action"]]) {
      const moved = await startAndMove();
      const faulted = fault(moved.sessionId, patchOf);
      await saveStore.autosaveSession(faulted); // what the old routes saved: the faulted game, still "active"
      store.resetStore(); // the server restarted
      expect((await listedSaves()).find((s) => s.sessionId === moved.sessionId)).toMatchObject({ status: "active", resumable: true });
      const res = await call(routes.resume, "http://localhost/api/learn/resume", { sessionId: moved.sessionId });
      await expectEndedByFault(res, moved.sessionId, guard, /an engine error/);
    }
  });
});

describe("the decks a game carries come back with it", () => {
  it("start and resume answer the deck names (the header names them after a restart)", async () => {
    const first = await start();
    expect(first.data.userDeckName).toBe(USER_DECK);
    expect(first.data.opponentDeckNames).toEqual([OPPONENT_DECK]);
    const moved = await startAndMove();
    store.resetStore(); // the server restarted
    const resumed = await call(routes.resume, "http://localhost/api/learn/resume", { sessionId: moved.sessionId });
    expect(resumed.status).toBe(200);
    expect(resumed.data.status).toBe("active");
    expect(resumed.data.userDeckName).toBe(USER_DECK);
    expect(resumed.data.opponentDeckNames).toEqual([OPPONENT_DECK]);
  });

  it("a puzzle attempt answers the captured game's deck names", async () => {
    const moved = await startAndMove();
    const saved = await call(routes.puzzles, "http://localhost/api/puzzles", { sessionId: moved.sessionId, goal: "win-this-turn" });
    expect(saved.status).toBe(200);
    const puzzleId = saved.data.id;
    expect(typeof puzzleId).toBe("string");
    const attempt = await call(routes.resumePuzzle, "http://localhost/api/learn/resume-puzzle", { puzzleId });
    expect(attempt.status).toBe(200);
    expect(attempt.data.puzzle.id).toBe(puzzleId);
    expect(attempt.data.userDeckName).toBe(USER_DECK);
    expect(attempt.data.opponentDeckNames).toEqual([OPPONENT_DECK]);
  });
});

describe("controls", () => {
  it("a normal game is still autosaved, listed, and resumes where it was after a restart", async () => {
    const moved = await startAndMove();
    expect((await listedSaves()).find((s) => s.sessionId === moved.sessionId)).toMatchObject({ status: "active", resumable: true, turn: moved.turn });
    store.resetStore();
    const resumed = await call(routes.resume, "http://localhost/api/learn/resume", { sessionId: moved.sessionId });
    expect(resumed.status).toBe(200);
    expect(resumed.data.status).toBe("active");
    expect(resumed.data.decision.kind).toBe("ask");
    expect(resumed.data.turn).toBe(moved.turn);
    expect(resumed.data.step).toBe(moved.step);
    expect(fs.existsSync(saveFile(moved.sessionId))).toBe(true);
    expect(await recordOf(moved.sessionId)).toBeUndefined();
  });

  it("a game finished by play still records its winner and leaves nothing to continue", async () => {
    const moved = await startAndMove();
    const session = store.getSession(moved.sessionId);
    store.putSession(learn._forceLifeForTests(session, opponentOf(session), 0));
    const res = await call(routes.choose, "http://localhost/api/learn/choose", { sessionId: moved.sessionId, choice: {} });
    expect(res.status).toBe(200);
    expect(res.data.status).toBe("user-wins");
    expect(res.data.decision).toMatchObject({ kind: "game-over", reason: "user-wins" });
    await expectGone(moved.sessionId);
    expect((await recordOf(moved.sessionId)).status).toBe("user-wins");
  });

  // 2026-11-01: a throw is a crash, reported as one — both faults are a "dispatch-error" carrying the error and its stack (the
  // self-play record's result too), still on an active session, still ended by the routes through their guard.
  it("the driver itself reports both faults as a dispatch-error with the error's stack, on an active session (what the self-play harnesses count)", async () => {
    const first = await start();
    const thrown = learn.advanceUntilDecision(fault(first.data.sessionId, THROWING_STEP));
    expect(thrown.decision.kind).toBe("dispatch-error");
    expect(thrown.decision.reason).toMatch(THROWN);
    expect(typeof thrown.decision.error.stack).toBe("string");
    expect(thrown.session.status).toBe("active");
    const second = await start();
    const stuck = learn.advanceUntilDecision(fault(second.data.sessionId, NO_LEGAL_ACTION));
    expect(stuck.decision.kind).toBe("dispatch-error");
    expect(stuck.decision.reason).toBe("no legal action and no pass available");
    expect(typeof stuck.decision.error.stack).toBe("string");
    expect(stuck.session.status).toBe("active");
  });
});

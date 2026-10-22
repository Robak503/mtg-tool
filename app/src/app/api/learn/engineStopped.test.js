/**
 * engineStopped.test.js — a game one of the session loop's guards stops ENDS, through every Academy route (2026-10-22).
 *
 * The driver has three guards (learnSession.advanceUntilDecision): the RUNAWAY size guard (a stack past 500 objects, a
 * seat past 2,000 permanents), the per-turn tick budget ("turn stall") and the 50,000-tick safety cap. When one fired,
 * the person saw "⚠ The engine got stuck: … — use “Abandon game” below to start over." and no choices, while the
 * session stayed ACTIVE: no log line, no game record, and the stuck game was AUTOSAVED — "Abandon game" only reset the
 * page, so the save stayed in "Continue a game", and resuming it hit the guard again at once. A trap.
 *
 * Now a guard's stop ends the game: the session's status is "engine-stopped" (not "abandoned" — the person ended
 * nothing), a plain game-log line says the engine stopped it and why, the game's record is kept with that result, its
 * save is removed, and the response is the end-of-game decision. A save written before this fix ends the same way when
 * it is resumed, and is gone from the list after.
 *
 * The runaway guard fires here with its real limits (an opponent controlling 2,001 permanents, the board the runaway
 * builder measured through /api/learn/step). The tick budget and the safety cap can't be reached by a real game in a
 * test, so the engine call the route makes is given the driver's test limits (`turnTickBudget`, `safetyCap`) — the
 * route, the driver, the stores and the files are real.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// The test limits handed to every engine call the routes make (empty = the shipped limits).
const limits = vi.hoisted(() => ({ current: {} }));
vi.mock("../../../lib/learn/learnSession.js", async (importOriginal) => {
  const real = await importOriginal();
  const withLimits = (opts) => ({ ...(opts || {}), ...limits.current });
  return {
    ...real,
    advanceUntilDecision: (session, opts) => real.advanceUntilDecision(session, withLimits(opts)),
    applyChoice: (session, choice, opts) => real.applyChoice(session, choice, withLimits(opts)),
    applyPendingChoice: (session, choice, opts) => real.applyPendingChoice(session, choice, withLimits(opts)),
    continueFromArbiter: (session, opts) => real.continueFromArbiter(session, withLimits(opts)),
    advanceMulligan: (session, action, opts) => real.advanceMulligan(session, action, withLimits(opts)),
  };
});

let routes;
let store;
let saveStore;
let records;
let learn;
let createPermanent;
let tmpDir;
let originalCwd;
let warnSpy;

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

const saveFile = (id) => path.join(tmpDir, "data", "learn-sessions", `${id}.json`);

async function start(extra = {}) {
  return call(routes.start, "http://localhost/api/learn/start", {
    userDeck: deck("u"),
    opponentDeck: deck("a"),
    difficulty: "beginner",
    userDeckName: "Forest Bears",
    opponentDeckNames: ["Bear Forest"],
    ...extra,
  });
}

/** The saved games "Continue a game" lists. */
async function listedSaves() {
  const res = await routes.saves.GET();
  return (await res.json()).saves;
}

/** The opponent of a stored session takes control of `count` 1/1 Squirrel tokens (the runaway board). */
function seedSwarm(sessionId, count = 2001) {
  const session = store.getSession(sessionId);
  const ai = Object.keys(session.state.players).find((id) => id !== "user");
  const squirrel = { name: "Squirrel", type: "Token Creature — Squirrel", power: 1, toughness: 1, oracle: "", keywords: [], token: true, colors: ["G"] };
  const swarm = Array.from({ length: count }, (_, i) =>
    createPermanent({ id: `sq-${i}`, card: { ...squirrel, id: `sq-${i}-card` }, controller: ai, summoningSick: false }),
  );
  const seeded = {
    ...session,
    state: { ...session.state, players: { ...session.state.players, [ai]: { ...session.state.players[ai], battlefield: swarm } } },
  };
  store.putSession(seeded);
  return seeded;
}

beforeEach(async () => {
  originalCwd = process.cwd();
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mtg-engine-stopped-"));
  process.chdir(tmpDir); // paths.js falls back to cwd with MTG_APP_ROOT unset: saves and records land under <tmp>/data
  limits.current = {};
  vi.resetModules();
  routes = {
    start: await import("./start/route.js"),
    step: await import("./step/route.js"),
    choose: await import("./choose/route.js"),
    continue: await import("./continue/route.js"),
    mulligan: await import("./mulligan/route.js"),
    resume: await import("./resume/route.js"),
    saves: await import("./saves/route.js"),
  };
  store = await import("../../../lib/server/learnSessionStore.js");
  saveStore = await import("../../../lib/server/learnSaveStore.js");
  records = await import("../../../lib/server/gameRecordsStore.js");
  learn = await import("../../../lib/learn/learnSession.js");
  ({ createPermanent } = await import("../../../lib/learn/gameState.js"));
  store.resetStore();
  warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  process.chdir(originalCwd);
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

/**
 * Everything a stopped game must leave behind: the end-of-game response with the honest message, the log line, no
 * session in memory, no save on disk or in the list, and the game's record with the engine-stopped result.
 */
async function expectEndedByEngine({ status, data }, sessionId, guard, messagePattern) {
  expect(status).toBe(200);
  expect(data.sessionId).toBe(sessionId);
  expect(data.status).toBe("engine-stopped");
  expect(data.decision.kind).toBe("game-over");
  expect(data.decision.reason).toBe("engine-stopped");
  expect(data.decision.guard).toBe(guard);
  expect(data.decision.message).toMatch(/^The engine stopped the game: /);
  expect(data.decision.message).toMatch(messagePattern);
  expect(data.decision.message).not.toMatch(/\bwon\b|\blost\b|abandon/i);

  // The game log's last line says so, in words.
  const last = data.decisionLogTail.at(-1);
  expect(last.action).toEqual({ kind: "game-stopped", guard, message: data.decision.message });
  expect(last.actor).toBe(null);

  // Nothing left to continue: not in memory, not on disk, not in the list.
  expect(store.getSession(sessionId)).toBeNull();
  expect(fs.existsSync(saveFile(sessionId))).toBe(false);
  expect((await listedSaves()).map((s) => s.sessionId)).not.toContain(sessionId);

  // The record keeps the game, with that result and the log line.
  const kept = (await records.listGameRecords()).find((r) => r.id === sessionId);
  expect(kept).toBeTruthy();
  expect(kept.status).toBe("engine-stopped");
  expect(kept.engineStop).toMatchObject({ guard, message: data.decision.message });
  expect(kept.logTail.at(-1).action).toEqual({ kind: "game-stopped", guard, message: data.decision.message });

  // And the server log says which game and why.
  const lines = warnSpy.mock.calls.map((args) => args.map(String).join(" "));
  expect(lines.some((l) => l.includes(sessionId) && l.includes("engine stopped"))).toBe(true);
}

describe("each guard ends the game it stops — POST /api/learn/step", () => {
  it("the runaway size guard (real limits: an opponent controls 2,001 permanents)", async () => {
    const first = await start();
    expect(first.status).toBe(200);
    seedSwarm(first.data.sessionId);
    const pass = first.data.decision.options.find((o) => o.kind === "pass-priority");
    const res = await call(routes.step, "http://localhost/api/learn/step", { sessionId: first.data.sessionId, choice: pass });
    await expectEndedByEngine(res, first.data.sessionId, "runaway", /Opponent controlled 2,001 permanents/);
    expect(res.data.decision.message).toMatch(/limit of 2,000/);
  });

  it("the per-turn tick budget (turn stall)", async () => {
    const first = await start();
    limits.current = { turnTickBudget: 3 };
    const pass = first.data.decision.options.find((o) => o.kind === "pass-priority");
    const res = await call(routes.step, "http://localhost/api/learn/step", { sessionId: first.data.sessionId, choice: pass });
    await expectEndedByEngine(res, first.data.sessionId, "turn-stall", /turn 1 /);
    expect(res.data.decision.message).toMatch(/limit of 3 /);
  });

  it("the safety cap", async () => {
    const first = await start();
    limits.current = { turnTickBudget: Infinity, safetyCap: 1 };
    const pass = first.data.decision.options.find((o) => o.kind === "pass-priority");
    const res = await call(routes.step, "http://localhost/api/learn/step", { sessionId: first.data.sessionId, choice: pass });
    await expectEndedByEngine(res, first.data.sessionId, "safety-cap", /limit of 1 /);
  });
});

describe("every play route ends a stopped game the same way", () => {
  it("POST /api/learn/start — a guard on the first advance", async () => {
    limits.current = { turnTickBudget: 1 };
    const res = await start();
    await expectEndedByEngine(res, res.data.sessionId, "turn-stall", /turn 1 /);
  });

  it("POST /api/learn/choose — re-deriving onto a runaway board", async () => {
    const first = await start();
    seedSwarm(first.data.sessionId);
    const res = await call(routes.choose, "http://localhost/api/learn/choose", { sessionId: first.data.sessionId, choice: {} });
    await expectEndedByEngine(res, first.data.sessionId, "runaway", /2,001 permanents/);
  });

  it("POST /api/learn/continue — after an Arbiter ruling, onto a runaway board", async () => {
    const first = await start();
    const seeded = seedSwarm(first.data.sessionId);
    seeded.state.pendingArbiter = {
      stackObjectId: "stk-77",
      cardName: "Mystic Confluence",
      oracle: "Choose three —",
      reason: "instant-or-sorcery (no recognized effect)",
      controller: "user",
    };
    store.putSession(seeded);
    const res = await call(routes.continue, "http://localhost/api/learn/continue", { sessionId: first.data.sessionId });
    await expectEndedByEngine(res, first.data.sessionId, "runaway", /2,001 permanents/);
  });

  it("POST /api/learn/mulligan — the kept hand opens into a stalled turn", async () => {
    const first = await start({ humanMulligan: true });
    expect(first.data.status).toBe("mulligan");
    limits.current = { turnTickBudget: 1 };
    const res = await call(routes.mulligan, "http://localhost/api/learn/mulligan", {
      sessionId: first.data.sessionId,
      action: { kind: "mulligan-keep" },
    });
    await expectEndedByEngine(res, first.data.sessionId, "turn-stall", /turn 1 /);
  });
});

describe("a stuck save written before this fix", () => {
  /** What the old routes wrote when a guard fired: the stuck session, still "active", autosaved. */
  async function writePreFixSave({ swarm }) {
    const first = await start();
    const id = first.data.sessionId;
    const session = swarm ? seedSwarm(id) : store.getSession(id);
    expect(session.status).toBe("active");
    await saveStore.autosaveSession(session);
    store.resetStore(); // the server restarted
    expect((await listedSaves()).find((s) => s.sessionId === id)).toMatchObject({ status: "active", resumable: true });
    return id;
  }

  it("ends the way a new stop does when it is resumed (runaway, real limits), and the list no longer offers it", async () => {
    const id = await writePreFixSave({ swarm: true });
    const res = await call(routes.resume, "http://localhost/api/learn/resume", { sessionId: id });
    await expectEndedByEngine(res, id, "runaway", /2,001 permanents/);
  });

  it("ends the same way when the guard that stopped it was the tick budget", async () => {
    const id = await writePreFixSave({ swarm: false });
    limits.current = { turnTickBudget: 0 };
    const res = await call(routes.resume, "http://localhost/api/learn/resume", { sessionId: id });
    await expectEndedByEngine(res, id, "turn-stall", /turn 1 /);
  });
});

describe("controls", () => {
  it("a normal game is still autosaved, offered in the list, and resumes where it was after a restart", async () => {
    const first = await start();
    const id = first.data.sessionId;
    const pass = first.data.decision.options.find((o) => o.kind === "pass-priority");
    const stepped = await call(routes.step, "http://localhost/api/learn/step", { sessionId: id, choice: pass });
    expect(stepped.status).toBe(200);
    expect(stepped.data.status).toBe("active");
    expect(stepped.data.decision.kind).toBe("ask");
    expect(fs.existsSync(saveFile(id))).toBe(true);
    expect((await listedSaves()).find((s) => s.sessionId === id)).toMatchObject({ status: "active", resumable: true, turn: stepped.data.turn });

    store.resetStore(); // the server restarted
    const resumed = await call(routes.resume, "http://localhost/api/learn/resume", { sessionId: id });
    expect(resumed.status).toBe(200);
    expect(resumed.data.status).toBe("active");
    expect(resumed.data.decision.kind).toBe("ask");
    expect(resumed.data.turn).toBe(stepped.data.turn);
    expect(resumed.data.step).toBe(stepped.data.step);
    expect(store.getSession(id)).toBeTruthy();
    expect(fs.existsSync(saveFile(id))).toBe(true);
    expect((await records.listGameRecords()).find((r) => r.id === id)).toBeUndefined();
  });

  it("abandoning is still \"abandoned\", and its words are still the person's own ending", async () => {
    const first = await start();
    const abandoned = learn.abandon(store.getSession(first.data.sessionId));
    expect(abandoned.status).toBe("abandoned");
    expect(abandoned.abandonReason).toBe("user-abandoned");
    const { reasonToOutcome } = await import("../../../lib/learn/learnOutcome.js");
    expect(reasonToOutcome("abandoned")).toEqual({ tone: "neutral", title: "Game abandoned.", blurb: "You ended the game early." });
  });

  it("the driver itself still reports a guard as engine-stuck on an active session (what the self-play harnesses count)", async () => {
    const first = await start();
    const session = store.getSession(first.data.sessionId);
    const pass = first.data.decision.options.find((o) => o.kind === "pass-priority");
    const stalled = learn.applyChoice(session, pass, { turnTickBudget: 3 });
    expect(stalled.decision.kind).toBe("engine-stuck");
    expect(stalled.decision.reason).toMatch(/^turn stall \(\d+ ticks in a single turn — non-terminating loop\)$/);
    expect(stalled.session.status).toBe("active");
    const runaway = learn.advanceUntilDecision(seedSwarm(first.data.sessionId));
    expect(runaway.decision.kind).toBe("engine-stuck");
    expect(runaway.decision.reason).toBe("runaway battlefield (2001 permanents, ai)");
    expect(runaway.session.status).toBe("active");
  });
});

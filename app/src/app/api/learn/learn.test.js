/**
 * Tests for /api/learn/start and /api/learn/step.
 *
 * The routes wrap learnSession (already unit-tested) over an HTTP
 * shape with an in-memory store. These tests focus on the HTTP
 * surface: input validation, session-id round-trip, store cleanup
 * on game-end, error mapping.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

let startRoute;
let stepRoute;
let savesRoute;
let resumeRoute;
let deleteRoute;
let store;
let tmpDir;
let originalCwd;

async function loadRoutes() {
  vi.resetModules();
  startRoute = await import("./start/route.js");
  stepRoute = await import("./step/route.js");
  savesRoute = await import("./saves/route.js");
  resumeRoute = await import("./resume/route.js");
  deleteRoute = await import("./saves/delete/route.js");
  store = await import("../../../lib/server/learnSessionStore.js");
}

function basicForest(i) {
  return { id: `f-${i}`, name: "Forest", type: "Basic Land — Forest", oracle: "{T}: Add {G}.", mana: "" };
}
function bear(i) {
  return { id: `b-${i}`, name: "Grizzly Bears", type: "Creature — Bear", oracle: "", mana: "{1}{G}", cmc: 2 };
}
function deck(label) {
  const out = [];
  for (let i = 0; i < 18; i++) out.push({ ...basicForest(`${label}-${i}`) });
  for (let i = 0; i < 12; i++) out.push({ ...bear(`${label}-${i}`) });
  return out;
}

function postRequest(url, body) {
  return new Request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

beforeEach(async () => {
  // chdir to a temp dir so autosave (PR-4a) writes saves under <tmp>/data/
  // instead of polluting the repo. paths.js falls back to cwd when MTG_APP_ROOT
  // is unset.
  originalCwd = process.cwd();
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mtg-learn-route-"));
  process.chdir(tmpDir);
  await loadRoutes();
  store.resetStore();
});

afterEach(() => {
  vi.restoreAllMocks();
  process.chdir(originalCwd);
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("POST /api/learn/start", () => {
  it("creates a session, stores it, returns sessionId + first decision", async () => {
    const response = await startRoute.POST(postRequest("http://localhost/api/learn/start", {
      userDeck: deck("u"),
      opponentDeck: deck("a"),
      difficulty: "beginner",
    }));
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.sessionId).toMatch(/^learn-/);
    expect(data.decision).toBeTruthy();
    expect(data.status).toBe("active");
    expect(data.turn).toBe(1);
    expect(data.activePlayer).toBe("user");

    // Session is in the store.
    expect(store.getSession(data.sessionId)).toBeTruthy();
  });

  it("returns an 'ask' decision at Beginner difficulty", async () => {
    const response = await startRoute.POST(postRequest("http://localhost/api/learn/start", {
      userDeck: deck("u"),
      opponentDeck: deck("a"),
      difficulty: "beginner",
    }));
    const data = await response.json();
    expect(data.decision.kind).toBe("ask");
    expect(data.decision.options.length).toBeGreaterThan(0);
    expect(data.decision.prompt).toBeTruthy();
  });

  it("strips function fields from the wire payload (options + suggestion)", async () => {
    const response = await startRoute.POST(postRequest("http://localhost/api/learn/start", {
      userDeck: deck("u"),
      opponentDeck: deck("a"),
      difficulty: "beginner",
    }));
    const data = await response.json();
    // Round-trip through JSON to be sure no function survives.
    const roundTripped = JSON.parse(JSON.stringify(data));
    expect(roundTripped.decision.options.every(o => Object.values(o).every(v => typeof v !== "function"))).toBe(true);
  });

  it("rejects missing userDeck with 400", async () => {
    const response = await startRoute.POST(postRequest("http://localhost/api/learn/start", {
      opponentDeck: deck("a"),
    }));
    expect(response.status).toBe(400);
  });

  it("rejects missing opponentDeck with 400", async () => {
    const response = await startRoute.POST(postRequest("http://localhost/api/learn/start", {
      userDeck: deck("u"),
    }));
    expect(response.status).toBe(400);
  });

  it("rejects empty decks with 400", async () => {
    const response = await startRoute.POST(postRequest("http://localhost/api/learn/start", {
      userDeck: [],
      opponentDeck: deck("a"),
    }));
    expect(response.status).toBe(400);
  });

  it("rejects invalid JSON with 400", async () => {
    const response = await startRoute.POST(postRequest("http://localhost/api/learn/start", "not valid"));
    expect(response.status).toBe(400);
  });

  it("rejects invalid difficulty with 400 (from the factory)", async () => {
    const response = await startRoute.POST(postRequest("http://localhost/api/learn/start", {
      userDeck: deck("u"),
      opponentDeck: deck("a"),
      difficulty: "godlike",
    }));
    expect(response.status).toBe(400);
  });

  it("starts a commander session with a 3-deck pod", async () => {
    const response = await startRoute.POST(postRequest("http://localhost/api/learn/start", {
      userDeck: deck("u"),
      opponentDecks: [deck("o1"), deck("o2"), deck("o3")],
      mode: "commander",
      difficulty: "beginner",
    }));
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.sessionId).toMatch(/^learn-/);
    expect(data.mode).toBe("commander");
    expect(data.status).toBe("active");
    expect(store.getSession(data.sessionId)).toBeTruthy();
  });

  it("rejects commander mode without exactly 3 opponentDecks with 400", async () => {
    const response = await startRoute.POST(postRequest("http://localhost/api/learn/start", {
      userDeck: deck("u"),
      opponentDecks: [deck("o1"), deck("o2")],
      mode: "commander",
    }));
    expect(response.status).toBe(400);
  });

  it("threads per-opponent commanders into each seat", async () => {
    const cmd = (n) => ({ id: `cmd-${n}`, name: n, type: "Legendary Creature", mana: "{G}" });
    const response = await startRoute.POST(postRequest("http://localhost/api/learn/start", {
      userDeck: deck("u"),
      opponentDecks: [deck("o1"), deck("o2"), deck("o3")],
      opponentCommanders: [[cmd("A")], [cmd("B")], []],
      mode: "commander",
      difficulty: "beginner",
    }));
    expect(response.status).toBe(200);
    const data = await response.json();
    const stored = store.getSession(data.sessionId);
    expect(stored.state.players.ai1.command).toHaveLength(1);
    expect(stored.state.players.ai2.command).toHaveLength(1);
    expect(stored.state.players.ai3.command).toHaveLength(0);
  });
});

describe("POST /api/learn/step", () => {
  async function startGame() {
    const response = await startRoute.POST(postRequest("http://localhost/api/learn/start", {
      userDeck: deck("u"),
      opponentDeck: deck("a"),
      difficulty: "beginner",
    }));
    return await response.json();
  }

  it("dispatches a valid choice and returns the next decision", async () => {
    const { sessionId, decision: firstDecision } = await startGame();
    const passOption = firstDecision.options.find(o => o.kind === "pass-priority");

    const response = await stepRoute.POST(postRequest("http://localhost/api/learn/step", {
      sessionId,
      choice: passOption,
    }));
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.sessionId).toBe(sessionId);
    expect(data.decision).toBeTruthy();
    expect(data.decisionLogTail.length).toBeGreaterThan(0);
  });

  it("rejects unknown sessionId with 404", async () => {
    const response = await stepRoute.POST(postRequest("http://localhost/api/learn/step", {
      sessionId: "learn-nonexistent",
      choice: { kind: "pass-priority" },
    }));
    expect(response.status).toBe(404);
  });

  it("rejects missing sessionId with 400", async () => {
    const response = await stepRoute.POST(postRequest("http://localhost/api/learn/step", {
      choice: { kind: "pass-priority" },
    }));
    expect(response.status).toBe(400);
  });

  it("rejects missing choice with 400", async () => {
    const response = await stepRoute.POST(postRequest("http://localhost/api/learn/step", {
      sessionId: "anything",
    }));
    expect(response.status).toBe(400);
  });

  it("returns a dispatch-error decision (not 500) when the choice is invalid for the current state", async () => {
    const { sessionId } = await startGame();

    const response = await stepRoute.POST(postRequest("http://localhost/api/learn/step", {
      sessionId,
      choice: { kind: "play-land", playerId: "user", cardId: "made-up-card-id" },
    }));
    expect(response.status).toBe(200);  // engine didn't throw; the dispatch surfaced an error
    const data = await response.json();
    expect(data.decision.kind).toBe("dispatch-error");
    expect(data.decision.code).toBe("INVALID_CHOICE");
  });

  it("deletes the session from the store after game-end", async () => {
    const { sessionId } = await startGame();
    // Force-end the game by mutating the stored session's state directly.
    const session = store.getSession(sessionId);
    session.state.players.user.life = 0;
    store.putSession(session);

    const response = await stepRoute.POST(postRequest("http://localhost/api/learn/step", {
      sessionId,
      choice: { kind: "pass-priority" },
    }));
    const data = await response.json();
    expect(data.status).toBe("ai-wins");
    expect(store.getSession(sessionId)).toBeNull();
  });

  it("rejects invalid JSON with 400", async () => {
    const response = await stepRoute.POST(postRequest("http://localhost/api/learn/step", "not valid"));
    expect(response.status).toBe(400);
  });
});

describe("session store behaviour", () => {
  it("getSession returns null for unknown ids", () => {
    expect(store.getSession("nope")).toBeNull();
    expect(store.getSession(null)).toBeNull();
  });

  it("putSession requires an id field", () => {
    expect(() => store.putSession({})).toThrow();
  });

  it("deleteSession returns false for unknown ids", () => {
    expect(store.deleteSession("nope")).toBe(false);
  });

  it("resetStore clears everything", async () => {
    await startRoute.POST(postRequest("http://localhost/api/learn/start", {
      userDeck: deck("u"),
      opponentDeck: deck("a"),
    }));
    expect(store.sessionCount()).toBeGreaterThan(0);
    store.resetStore();
    expect(store.sessionCount()).toBe(0);
  });
});

describe("save / resume / delete (Phase-7 PR-4a)", () => {
  async function startAGame() {
    const res = await startRoute.POST(postRequest("http://localhost/api/learn/start", {
      userDeck: deck("u"),
      opponentDeck: deck("a"),
      difficulty: "beginner",
      userDeckId: "my-deck",
      userDeckName: "My Forest Deck",
    }));
    return res.json();
  }

  it("autosaves on start and lists the save with deck metadata", async () => {
    const { sessionId } = await startAGame();
    const listRes = await savesRoute.GET();
    const { saves } = await listRes.json();
    const entry = saves.find(s => s.sessionId === sessionId);
    expect(entry).toBeTruthy();
    expect(entry.userDeckName).toBe("My Forest Deck");
    expect(entry.resumable).toBe(true);
    expect(entry.turn).toBe(1);
  });

  it("resumes a saved game after the in-memory store is cleared (simulated restart)", async () => {
    const { sessionId } = await startAGame();
    store.resetStore(); // simulate a server restart — the in-memory session is gone
    expect(store.getSession(sessionId)).toBeNull();

    const res = await resumeRoute.POST(postRequest("http://localhost/api/learn/resume", { sessionId }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.sessionId).toBe(sessionId);
    expect(data.resumed).toBe(true);
    expect(data.decision).toBeTruthy();
    expect(store.getSession(sessionId)).toBeTruthy(); // re-hydrated into the store
  });

  it("resume returns 404 for an unknown save", async () => {
    const res = await resumeRoute.POST(postRequest("http://localhost/api/learn/resume", { sessionId: "learn-nope" }));
    expect(res.status).toBe(404);
  });

  it("resume rejects a missing sessionId with 400", async () => {
    const res = await resumeRoute.POST(postRequest("http://localhost/api/learn/resume", {}));
    expect(res.status).toBe(400);
  });

  it("deletes a saved game", async () => {
    const { sessionId } = await startAGame();
    const delRes = await deleteRoute.POST(postRequest("http://localhost/api/learn/saves/delete", { sessionId }));
    expect((await delRes.json()).ok).toBe(true);
    const { saves } = await (await savesRoute.GET()).json();
    expect(saves.some(s => s.sessionId === sessionId)).toBe(false);
  });

  it("drops the in-flight save when the game ends", async () => {
    const { sessionId } = await startAGame();
    // Force-end the game, then take a step so the route's game-over path runs.
    const session = store.getSession(sessionId);
    session.state.players.user.life = 0;
    store.putSession(session);
    await stepRoute.POST(postRequest("http://localhost/api/learn/step", {
      sessionId,
      choice: { kind: "pass-priority" },
    }));
    const { saves } = await (await savesRoute.GET()).json();
    expect(saves.some(s => s.sessionId === sessionId)).toBe(false);
  });
});

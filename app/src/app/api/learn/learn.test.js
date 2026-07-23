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
let mulliganRoute;
let savesRoute;
let resumeRoute;
let deleteRoute;
let continueRoute;
let store;
let tmpDir;
let originalCwd;

async function loadRoutes() {
  vi.resetModules();
  startRoute = await import("./start/route.js");
  stepRoute = await import("./step/route.js");
  mulliganRoute = await import("./mulligan/route.js");
  savesRoute = await import("./saves/route.js");
  resumeRoute = await import("./resume/route.js");
  deleteRoute = await import("./saves/delete/route.js");
  continueRoute = await import("./continue/route.js");
  store = await import("../../../lib/server/learnSessionStore.js");
}

function basicForest(i) {
  return {
    id: `f-${i}`,
    name: "Forest",
    type: "Basic Land — Forest",
    oracle: "{T}: Add {G}.",
    mana: "",
  };
}
function bear(i) {
  return {
    id: `b-${i}`,
    name: "Grizzly Bears",
    type: "Creature — Bear",
    oracle: "",
    mana: "{1}{G}",
    cmc: 2,
  };
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
    const response = await startRoute.POST(
      postRequest("http://localhost/api/learn/start", {
        userDeck: deck("u"),
        opponentDeck: deck("a"),
        difficulty: "beginner",
      }),
    );
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
    const response = await startRoute.POST(
      postRequest("http://localhost/api/learn/start", {
        userDeck: deck("u"),
        opponentDeck: deck("a"),
        difficulty: "beginner",
      }),
    );
    const data = await response.json();
    expect(data.decision.kind).toBe("ask");
    expect(data.decision.options.length).toBeGreaterThan(0);
    expect(data.decision.prompt).toBeTruthy();
  });

  it("strips function fields from the wire payload (options + suggestion)", async () => {
    const response = await startRoute.POST(
      postRequest("http://localhost/api/learn/start", {
        userDeck: deck("u"),
        opponentDeck: deck("a"),
        difficulty: "beginner",
      }),
    );
    const data = await response.json();
    // Round-trip through JSON to be sure no function survives.
    const roundTripped = JSON.parse(JSON.stringify(data));
    expect(
      roundTripped.decision.options.every((o) =>
        Object.values(o).every((v) => typeof v !== "function"),
      ),
    ).toBe(true);
  });

  it("rejects missing userDeck with 400", async () => {
    const response = await startRoute.POST(
      postRequest("http://localhost/api/learn/start", {
        opponentDeck: deck("a"),
      }),
    );
    expect(response.status).toBe(400);
  });

  it("rejects missing opponentDeck with 400", async () => {
    const response = await startRoute.POST(
      postRequest("http://localhost/api/learn/start", {
        userDeck: deck("u"),
      }),
    );
    expect(response.status).toBe(400);
  });

  it("rejects empty decks with 400", async () => {
    const response = await startRoute.POST(
      postRequest("http://localhost/api/learn/start", {
        userDeck: [],
        opponentDeck: deck("a"),
      }),
    );
    expect(response.status).toBe(400);
  });

  it("rejects invalid JSON with 400", async () => {
    const response = await startRoute.POST(
      postRequest("http://localhost/api/learn/start", "not valid"),
    );
    expect(response.status).toBe(400);
  });

  it("rejects invalid difficulty with 400 (from the factory)", async () => {
    const response = await startRoute.POST(
      postRequest("http://localhost/api/learn/start", {
        userDeck: deck("u"),
        opponentDeck: deck("a"),
        difficulty: "godlike",
      }),
    );
    expect(response.status).toBe(400);
  });

  it("starts a commander session with a 3-deck pod", async () => {
    const response = await startRoute.POST(
      postRequest("http://localhost/api/learn/start", {
        userDeck: deck("u"),
        opponentDecks: [deck("o1"), deck("o2"), deck("o3")],
        mode: "commander",
        difficulty: "beginner",
      }),
    );
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.sessionId).toMatch(/^learn-/);
    expect(data.mode).toBe("commander");
    expect(data.status).toBe("active");
    expect(store.getSession(data.sessionId)).toBeTruthy();
  });

  it("rejects commander mode without exactly 3 opponentDecks with 400", async () => {
    const response = await startRoute.POST(
      postRequest("http://localhost/api/learn/start", {
        userDeck: deck("u"),
        opponentDecks: [deck("o1"), deck("o2")],
        mode: "commander",
      }),
    );
    expect(response.status).toBe(400);
  });

  it("threads per-opponent commanders into each seat", async () => {
    const cmd = (n) => ({ id: `cmd-${n}`, name: n, type: "Legendary Creature", mana: "{G}" });
    const response = await startRoute.POST(
      postRequest("http://localhost/api/learn/start", {
        userDeck: deck("u"),
        opponentDecks: [deck("o1"), deck("o2"), deck("o3")],
        opponentCommanders: [[cmd("A")], [cmd("B")], []],
        mode: "commander",
        difficulty: "beginner",
      }),
    );
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
    const response = await startRoute.POST(
      postRequest("http://localhost/api/learn/start", {
        userDeck: deck("u"),
        opponentDeck: deck("a"),
        difficulty: "beginner",
      }),
    );
    return await response.json();
  }

  it("dispatches a valid choice and returns the next decision", async () => {
    const { sessionId, decision: firstDecision } = await startGame();
    const passOption = firstDecision.options.find((o) => o.kind === "pass-priority");

    const response = await stepRoute.POST(
      postRequest("http://localhost/api/learn/step", {
        sessionId,
        choice: passOption,
      }),
    );
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.sessionId).toBe(sessionId);
    expect(data.decision).toBeTruthy();
    expect(data.decisionLogTail.length).toBeGreaterThan(0);
  });

  it("rejects unknown sessionId with 404", async () => {
    const response = await stepRoute.POST(
      postRequest("http://localhost/api/learn/step", {
        sessionId: "learn-nonexistent",
        choice: { kind: "pass-priority" },
      }),
    );
    expect(response.status).toBe(404);
  });

  it("rejects missing sessionId with 400", async () => {
    const response = await stepRoute.POST(
      postRequest("http://localhost/api/learn/step", {
        choice: { kind: "pass-priority" },
      }),
    );
    expect(response.status).toBe(400);
  });

  it("rejects missing choice with 400", async () => {
    const response = await stepRoute.POST(
      postRequest("http://localhost/api/learn/step", {
        sessionId: "anything",
      }),
    );
    expect(response.status).toBe(400);
  });

  it("returns a dispatch-error decision (not 500) when the choice is invalid for the current state", async () => {
    const { sessionId } = await startGame();

    const response = await stepRoute.POST(
      postRequest("http://localhost/api/learn/step", {
        sessionId,
        choice: { kind: "play-land", playerId: "user", cardId: "made-up-card-id" },
      }),
    );
    expect(response.status).toBe(200); // engine didn't throw; the dispatch surfaced an error
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

    const response = await stepRoute.POST(
      postRequest("http://localhost/api/learn/step", {
        sessionId,
        choice: { kind: "pass-priority" },
      }),
    );
    const data = await response.json();
    expect(data.status).toBe("ai-wins");
    expect(store.getSession(sessionId)).toBeNull();
  });

  it("rejects invalid JSON with 400", async () => {
    const response = await stepRoute.POST(
      postRequest("http://localhost/api/learn/step", "not valid"),
    );
    expect(response.status).toBe(400);
  });
});

describe("POST /api/learn/continue — the P2.1 unresolved→Arbiter seam", () => {
  async function startGame() {
    const response = await startRoute.POST(
      postRequest("http://localhost/api/learn/start", {
        userDeck: deck("u"),
        opponentDeck: deck("a"),
        difficulty: "beginner",
      }),
    );
    return await response.json();
  }

  function flagUnmodeledUserSpell(sessionId) {
    const session = store.getSession(sessionId);
    session.state.pendingArbiter = {
      stackObjectId: "stk-77",
      cardName: "Mystic Confluence",
      oracle: "Choose three —",
      reason: "instant-or-sorcery (no recognized effect)",
      controller: "user",
    };
    store.putSession(session);
  }

  it("surfaces an enriched unresolved decision (question + board context) via /step", async () => {
    const { sessionId, decision: first } = await startGame();
    flagUnmodeledUserSpell(sessionId);
    const passOption = first.options.find((o) => o.kind === "pass-priority");

    const res = await stepRoute.POST(
      postRequest("http://localhost/api/learn/step", { sessionId, choice: passOption }),
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.decision.kind).toBe("unresolved");
    expect(data.decision.cardName).toBe("Mystic Confluence");
    // Enriched for the Ollama-only Arbiter call from the UI.
    expect(data.decision.question).toContain("Mystic Confluence");
    expect(data.decision.context).toContain("CURRENT GAME");
  });

  it("/continue clears the flag, resumes, and the next decision is not unresolved", async () => {
    const { sessionId } = await startGame();
    flagUnmodeledUserSpell(sessionId);

    const res = await continueRoute.POST(
      postRequest("http://localhost/api/learn/continue", { sessionId }),
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.decision.kind).not.toBe("unresolved");
    expect(store.getSession(sessionId).state.pendingArbiter).toBeUndefined();
  });

  it("/continue rejects an unknown sessionId with 404", async () => {
    const res = await continueRoute.POST(
      postRequest("http://localhost/api/learn/continue", { sessionId: "learn-nope" }),
    );
    expect(res.status).toBe(404);
  });

  it("/continue rejects a missing sessionId with 400", async () => {
    const res = await continueRoute.POST(postRequest("http://localhost/api/learn/continue", {}));
    expect(res.status).toBe(400);
  });

  it("/continue rejects invalid JSON with 400", async () => {
    const res = await continueRoute.POST(
      postRequest("http://localhost/api/learn/continue", "not valid"),
    );
    expect(res.status).toBe(400);
  });

  it("resume re-surfaces the unresolved decision from a save persisted while paused", async () => {
    const { sessionId, decision: first } = await startGame();
    flagUnmodeledUserSpell(sessionId);
    const passOption = first.options.find((o) => o.kind === "pass-priority");
    // The /step persists the paused session (pendingArbiter still set) via autosave.
    const stepData = await (
      await stepRoute.POST(
        postRequest("http://localhost/api/learn/step", { sessionId, choice: passOption }),
      )
    ).json();
    expect(stepData.decision.kind).toBe("unresolved");

    store.resetStore(); // simulate a server restart — the in-memory session is gone
    expect(store.getSession(sessionId)).toBeNull();

    const res = await resumeRoute.POST(
      postRequest("http://localhost/api/learn/resume", { sessionId }),
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.decision.kind).toBe("unresolved");
    expect(data.decision.cardName).toBe("Mystic Confluence");
    expect(data.decision.question).toContain("Mystic Confluence");
    expect(data.decision.context).toContain("CURRENT GAME");
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
    await startRoute.POST(
      postRequest("http://localhost/api/learn/start", {
        userDeck: deck("u"),
        opponentDeck: deck("a"),
      }),
    );
    expect(store.sessionCount()).toBeGreaterThan(0);
    store.resetStore();
    expect(store.sessionCount()).toBe(0);
  });
});

describe("save / resume / delete (Phase-7 PR-4a)", () => {
  async function startAGame() {
    const res = await startRoute.POST(
      postRequest("http://localhost/api/learn/start", {
        userDeck: deck("u"),
        opponentDeck: deck("a"),
        difficulty: "beginner",
        userDeckId: "my-deck",
        userDeckName: "My Forest Deck",
      }),
    );
    return res.json();
  }

  it("autosaves on start and lists the save with deck metadata", async () => {
    const { sessionId } = await startAGame();
    const listRes = await savesRoute.GET();
    const { saves } = await listRes.json();
    const entry = saves.find((s) => s.sessionId === sessionId);
    expect(entry).toBeTruthy();
    expect(entry.userDeckName).toBe("My Forest Deck");
    expect(entry.resumable).toBe(true);
    expect(entry.turn).toBe(1);
  });

  it("resumes a saved game after the in-memory store is cleared (simulated restart)", async () => {
    const { sessionId } = await startAGame();
    store.resetStore(); // simulate a server restart — the in-memory session is gone
    expect(store.getSession(sessionId)).toBeNull();

    const res = await resumeRoute.POST(
      postRequest("http://localhost/api/learn/resume", { sessionId }),
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.sessionId).toBe(sessionId);
    expect(data.resumed).toBe(true);
    expect(data.decision).toBeTruthy();
    expect(store.getSession(sessionId)).toBeTruthy(); // re-hydrated into the store
  });

  it("resume returns 404 for an unknown save", async () => {
    const res = await resumeRoute.POST(
      postRequest("http://localhost/api/learn/resume", { sessionId: "learn-nope" }),
    );
    expect(res.status).toBe(404);
  });

  it("resume rejects a missing sessionId with 400", async () => {
    const res = await resumeRoute.POST(postRequest("http://localhost/api/learn/resume", {}));
    expect(res.status).toBe(400);
  });

  it("deletes a saved game", async () => {
    const { sessionId } = await startAGame();
    const delRes = await deleteRoute.POST(
      postRequest("http://localhost/api/learn/saves/delete", { sessionId }),
    );
    expect((await delRes.json()).ok).toBe(true);
    const { saves } = await (await savesRoute.GET()).json();
    expect(saves.some((s) => s.sessionId === sessionId)).toBe(false);
  });

  it("drops the in-flight save when the game ends", async () => {
    const { sessionId } = await startAGame();
    // Force-end the game, then take a step so the route's game-over path runs.
    const session = store.getSession(sessionId);
    session.state.players.user.life = 0;
    store.putSession(session);
    await stepRoute.POST(
      postRequest("http://localhost/api/learn/step", {
        sessionId,
        choice: { kind: "pass-priority" },
      }),
    );
    const { saves } = await (await savesRoute.GET()).json();
    expect(saves.some((s) => s.sessionId === sessionId)).toBe(false);
  });
});

describe("POST /api/learn/start + /api/learn/mulligan (human London flow)", () => {
  async function startHuman(extra = {}) {
    const response = await startRoute.POST(
      postRequest("http://localhost/api/learn/start", {
        userDeck: deck("u"),
        opponentDeck: deck("a"),
        difficulty: "beginner",
        humanMulligan: true,
        ...extra,
      }),
    );
    return { response, data: await response.json() };
  }
  const mulligan = (sessionId, action) =>
    mulliganRoute.POST(postRequest("http://localhost/api/learn/mulligan", { sessionId, action }));

  it("humanMulligan:true deals but does NOT open — returns a status 'mulligan' keep/ship ask, hand slimmed", async () => {
    const { response, data } = await startHuman();
    expect(response.status).toBe(200);
    expect(data.status).toBe("mulligan");
    expect(data.decision.kind).toBe("mulligan");
    expect(data.decision.phase).toBe("decide");
    expect(data.decision.hand).toHaveLength(7);
    expect(data.decision.options.map((o) => o.kind).sort()).toEqual([
      "mulligan-keep",
      "mulligan-ship",
    ]);
    // The wire hand is slimmed — id + name for rendering, NO engine internals (oracle/mana).
    const card = data.decision.hand[0];
    expect(card.id).toBeTruthy();
    expect(card.name).toBeTruthy();
    expect(card.oracle).toBeUndefined();
    expect(card.mana).toBeUndefined();
    expect(store.getSession(data.sessionId).status).toBe("mulligan");
  });

  it("WITHOUT humanMulligan the game opens immediately (the flag gates it)", async () => {
    const response = await startRoute.POST(
      postRequest("http://localhost/api/learn/start", {
        userDeck: deck("u"),
        opponentDeck: deck("a"),
        difficulty: "beginner",
      }),
    );
    const data = await response.json();
    expect(data.status).toBe("active");
    expect(data.decision.kind).not.toBe("mulligan");
  });

  it("KEEP at 0 opens the game (status flips to active with a real decision)", async () => {
    const { data } = await startHuman();
    const res = await mulligan(data.sessionId, { kind: "mulligan-keep" });
    const kept = await res.json();
    expect(kept.status).toBe("active");
    expect(kept.decision).toBeTruthy();
    expect(kept.decision.kind).not.toBe("mulligan");
  });

  it("SHIP → KEEP → BOTTOM round-trips over the wire and opens the game", async () => {
    const { data } = await startHuman();

    // Ship — still a mulligan ask, count now 1.
    let step = await (await mulligan(data.sessionId, { kind: "mulligan-ship" })).json();
    expect(step.status).toBe("mulligan");
    expect(step.decision.phase).toBe("decide");
    expect(step.decision.mulligans).toBe(1);
    expect(step.decision.hand).toHaveLength(7);

    // Keep — advance to the bottom-pick (must bottom 1).
    step = await (await mulligan(data.sessionId, { kind: "mulligan-keep" })).json();
    expect(step.status).toBe("mulligan");
    expect(step.decision.phase).toBe("bottom");
    expect(step.decision.bottomCount).toBe(1);

    // Bottom a chosen card — the game opens.
    const chosen = step.decision.hand[2].id;
    step = await (
      await mulligan(data.sessionId, { kind: "mulligan-bottom", cardIds: [chosen] })
    ).json();
    expect(step.status).toBe("active");
    expect(step.decision.kind).not.toBe("mulligan");
  });

  it("mulligan on an unknown session → 404; missing sessionId → 400", async () => {
    expect((await mulligan("learn-does-not-exist", { kind: "mulligan-keep" })).status).toBe(404);
    const noId = await mulliganRoute.POST(
      postRequest("http://localhost/api/learn/mulligan", { action: { kind: "mulligan-keep" } }),
    );
    expect(noId.status).toBe(400);
  });
});

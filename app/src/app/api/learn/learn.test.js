/**
 * Tests for /api/learn/start and /api/learn/step.
 *
 * The routes wrap learnSession (already unit-tested) over an HTTP
 * shape with an in-memory store. These tests focus on the HTTP
 * surface: input validation, session-id round-trip, store cleanup
 * on game-end, error mapping.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let startRoute;
let stepRoute;
let store;

async function loadRoutes() {
  vi.resetModules();
  startRoute = await import("./start/route.js");
  stepRoute = await import("./step/route.js");
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
  await loadRoutes();
  store.resetStore();
});

afterEach(() => {
  vi.restoreAllMocks();
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

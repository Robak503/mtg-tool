/**
 * policyThreading.test.js — SD-5 + PS-4 (Lane A3, play-harness overhaul).
 *
 * The opponentAI A/B knob (`policy: "v1"` = the legacy heuristics; see
 * opponentAI.normalizePolicy) was previously reachable ONLY by driving
 * pickAction directly (scripts/play-quality-probe.mjs) — decisionGate.autoPick
 * never forwarded it, so session-layer old-vs-new probes were impossible.
 *
 * This pins the full thread: createGame({ policy }) → session.playOpts.policy →
 * mergePlayOpts → advanceUntilDecision → makeDecision → autoPick → pickAction
 * (and selfPlayRunner's advanceOpts passthrough), plus the byte-identical
 * default: policy absent and policy:null must be indistinguishable.
 *
 * pickAction is spied via vi.mock with a delegate to the REAL implementation,
 * so game behavior is untouched — only the received options are recorded.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { _resetIdsForTests } from "./gameState.js";

// Spy on pickAction while delegating to the real implementation (behavior-neutral).
const pickActionOpts = [];
vi.mock("./opponentAI.js", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    pickAction: (state, playerId, actions, opts) => {
      pickActionOpts.push({ playerId, opts: opts ?? null });
      return actual.pickAction(state, playerId, actions, opts);
    },
  };
});

import { makeDecision } from "./decisionGate.js";
import { createGame, nextDecision, act } from "./gameApi.js";
import { runSelfPlayGame } from "./selfPlayRunner.js";

beforeEach(() => {
  _resetIdsForTests();
  pickActionOpts.length = 0;
});

function forest(i) {
  return { id: `f-${i}`, name: "Forest", type: "Basic Land — Forest", oracle: "{T}: Add {G}.", mana: "" };
}
function bear(i) {
  return { id: `b-${i}`, name: "Grizzly Bears", type: "Creature — Bear", oracle: "", mana: "{1}{G}", cmc: 2, keywords: [], power: 2, toughness: 2 };
}
function makeDeck(prefix) {
  const cards = [];
  for (let i = 0; i < 18; i++) cards.push(forest(`${prefix}-${i}`));
  for (let i = 0; i < 12; i++) cards.push(bear(`${prefix}-${i}`));
  return cards;
}

const passOnly = (playerId) => [{ kind: "pass-priority", playerId }, { kind: "cast-spell", playerId, cardId: "x" }];

describe("decisionGate.makeDecision forwards `policy` to pickAction", () => {
  // A REAL game state (pickAction walks zones — deriveDeckRepresentation needs
  // full player shells, so a thin mock won't do).
  function miniState() {
    return createGame({ userDeck: makeDeck("u"), opponentDeck: makeDeck("a") }).state;
  }

  it("AI seat: policy:'v1' reaches pickAction", () => {
    makeDecision(miniState(), "ai", passOnly("ai"), { difficulty: "beginner", policy: "v1" });
    const call = pickActionOpts.find((c) => c.playerId === "ai");
    expect(call).toBeDefined();
    expect(call.opts.policy).toBe("v1");
  });

  it("expert USER auto-pick: policy:'v1' reaches pickAction", () => {
    makeDecision(miniState(), "user", passOnly("user"), { difficulty: "expert", policy: "v1" });
    const call = pickActionOpts.find((c) => c.playerId === "user");
    expect(call).toBeDefined();
    expect(call.opts.policy).toBe("v1");
  });

  it("DEFAULT PIN — policy absent and policy:null both reach pickAction as null (byte-identical)", () => {
    makeDecision(miniState(), "ai", passOnly("ai"), { difficulty: "beginner" });
    makeDecision(miniState(), "ai", passOnly("ai"), { difficulty: "beginner", policy: null });
    expect(pickActionOpts).toHaveLength(2);
    expect(pickActionOpts[0].opts.policy).toBeNull();
    expect(pickActionOpts[1].opts.policy).toBeNull();
    expect(pickActionOpts[0].opts).toEqual(pickActionOpts[1].opts);
  });
});

describe("gameApi.createGame({ policy }) — the session-layer A/B seam (PLAY_API v1.2.0)", () => {
  it("attaches playOpts.policy; the default session carries NO playOpts key (byte-identical)", () => {
    const withPolicy = createGame({ userDeck: makeDeck("u"), opponentDeck: makeDeck("a"), policy: "v1" });
    expect(withPolicy.playOpts).toEqual({ policy: "v1" });
    const bare = createGame({ userDeck: makeDeck("u"), opponentDeck: makeDeck("a") });
    expect("playOpts" in bare).toBe(false);
    const nulled = createGame({ userDeck: makeDeck("u"), opponentDeck: makeDeck("a"), policy: null });
    expect("playOpts" in nulled).toBe(false);
  });

  it("nextDecision on a policy session drives pickAction with policy:'v1' (merged from playOpts)", () => {
    const session = createGame({
      userDeck: makeDeck("u"),
      opponentDeck: makeDeck("a"),
      difficulty: "beginner",
      policy: "v1",
    });
    const { decision } = nextDecision(session);
    // Beginner pauses on the user's first ask; the suggestion + any auto segment
    // already routed through pickAction — every call must carry the session policy.
    expect(decision.kind).toBe("ask");
    expect(pickActionOpts.length).toBeGreaterThan(0);
    expect(pickActionOpts.every((c) => c.opts.policy === "v1")).toBe(true);
  });

  it("act() keeps the session policy across the re-advance; explicit opts.policy wins", () => {
    const session = createGame({
      userDeck: makeDeck("u"),
      opponentDeck: makeDeck("a"),
      difficulty: "beginner",
      policy: "v1",
    });
    const { session: paused, decision } = nextDecision(session);
    pickActionOpts.length = 0;

    const pass = decision.options.find((o) => o.kind === "pass-priority");
    act(paused, decision, pass); // no explicit opts → playOpts.policy rides
    expect(pickActionOpts.length).toBeGreaterThan(0);
    expect(pickActionOpts.every((c) => c.opts.policy === "v1")).toBe(true);

    pickActionOpts.length = 0;
    act(paused, decision, pass, { policy: null }); // explicit per-call opts win (mirrors decide)
    expect(pickActionOpts.length).toBeGreaterThan(0);
    expect(pickActionOpts.every((c) => c.opts.policy === null)).toBe(true);
  });
});

describe("selfPlayRunner passthrough", () => {
  it("runSelfPlayGame({ policy:'v1' }) threads the knob into every AI pick of a full game", () => {
    const game = runSelfPlayGame({
      deckA: makeDeck("u"),
      deckB: makeDeck("a"),
      mode: "standard",
      seed: 7,
      policy: "v1",
    });
    expect(["user-wins", "ai-wins", "draw"]).toContain(game.result); // a real terminal game
    expect(pickActionOpts.length).toBeGreaterThan(0);
    expect(pickActionOpts.every((c) => c.opts.policy === "v1")).toBe(true);
  });

  it("default runSelfPlayGame passes NO policy (advanceOpts stays byte-identical)", () => {
    runSelfPlayGame({ deckA: makeDeck("u"), deckB: makeDeck("a"), mode: "standard", seed: 7 });
    expect(pickActionOpts.length).toBeGreaterThan(0);
    expect(pickActionOpts.every((c) => c.opts.policy == null)).toBe(true);
  });
});

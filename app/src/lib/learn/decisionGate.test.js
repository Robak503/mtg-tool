/**
 * Tests for Phase 6 PR5 — decisionGate + narrator (Beginner mode focus).
 *
 * Covers: trivial-pass short-circuit, AI side always auto-decides,
 * difficulty branches (beginner asks everything, intermediate auto-
 * picks lands + auto-passes empty, expert silent), narration shape
 * and templates, choice resolution.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { makeDecision, resolveChoice } from "./decisionGate.js";
import { narrateStep, narrateAction, narrateDecision, narrateAttackTrap } from "./narrator.js";

function makeCard({ id, name, type, mana = "", oracle = "", power, toughness, keywords = [] }) {
  return {
    id: id || `card-${name}`,
    name,
    type,
    mana,
    oracle,
    keywords,
    ...(power !== undefined ? { power } : {}),
    ...(toughness !== undefined ? { toughness } : {}),
  };
}

function makeState({ activePlayer = "user", phase = "precombat-main", step = "main", priorityHolder = "user", turn = 1, startingPlayer = "user" } = {}) {
  return {
    ...createGameState({ userDeck: [], aiDeck: [] }),
    activePlayer,
    phase,
    step,
    priorityHolder,
    turn,
    startingPlayer,
    consecutivePasses: 0,
  };
}

beforeEach(() => {
  _resetIdsForTests();
});

describe("makeDecision — trivial cases", () => {
  it("auto-decides when only pass-priority is legal", () => {
    const state = makeState();
    const actions = [{ kind: "pass-priority", playerId: "user" }];
    const decision = makeDecision(state, "user", actions, { difficulty: "beginner" });
    expect(decision.kind).toBe("auto-decided");
    expect(decision.action.kind).toBe("pass-priority");
    expect(decision.metadata.reasoning).toBe("only-pass-available");
  });

  it("returns auto-decided with null action on empty list", () => {
    const decision = makeDecision(makeState(), "user", [], {});
    expect(decision.kind).toBe("auto-decided");
    expect(decision.action).toBeNull();
  });

  it("rejects null actions array", () => {
    const decision = makeDecision(makeState(), "user", null, {});
    expect(decision.kind).toBe("auto-decided");
    expect(decision.action).toBeNull();
  });
});

describe("makeDecision — AI side", () => {
  it("AI player always auto-decides regardless of difficulty", () => {
    const state = makeState({ activePlayer: "ai", priorityHolder: "ai" });
    const actions = [
      { kind: "play-land", playerId: "ai", cardId: "card-Forest", name: "Forest" },
      { kind: "pass-priority", playerId: "ai" },
    ];
    for (const difficulty of ["beginner", "intermediate", "expert"]) {
      const decision = makeDecision(state, "ai", actions, { difficulty });
      expect(decision.kind).toBe("auto-decided");
      expect(decision.action.kind).toBe("play-land");
      expect(decision.metadata.reasoning).toBe("ai-player");
    }
  });
});

describe("makeDecision — Beginner mode (user)", () => {
  function castableState() {
    const bolt = makeCard({ name: "Lightning Bolt", type: "Instant", mana: "{R}", oracle: "Deal 3." });
    let state = makeState({ phase: "beginning", step: "upkeep" });
    state = {
      ...state,
      players: {
        ...state.players,
        user: { ...state.players.user, hand: [bolt], manaPool: { ...state.players.user.manaPool, R: 1 } },
      },
    };
    return {
      state,
      bolt,
      actions: [
        { kind: "cast-spell", playerId: "user", cardId: bolt.id, name: "Lightning Bolt", cost: { generic: 0, R: 1 }, cmc: 1 },
        { kind: "pass-priority", playerId: "user" },
      ],
    };
  }

  it("asks the user with prompt + options + defaultIndex pointing to AI's suggestion", () => {
    const { state, actions } = castableState();
    const decision = makeDecision(state, "user", actions, { difficulty: "beginner" });
    expect(decision.kind).toBe("ask");
    expect(decision.prompt).toBeTruthy();
    expect(decision.options).toBe(actions);
    expect(typeof decision.metadata.defaultIndex).toBe("number");
    expect(decision.metadata.suggestion).toBeTruthy();
  });

  it("prompt includes step narration AND per-action descriptions", () => {
    const { state, bolt, actions } = castableState();
    const decision = makeDecision(state, "user", actions, {
      difficulty: "beginner",
      cardLookup: (id) => (id === bolt.id ? bolt : null),
    });
    expect(decision.prompt).toContain("upkeep");
    expect(decision.prompt).toContain("[[Lightning Bolt]]");
    expect(decision.prompt).toContain("Pass priority");
  });
});

describe("makeDecision — Intermediate mode", () => {
  it("auto-picks lands without asking", () => {
    const state = makeState();
    const forest = makeCard({ name: "Forest", type: "Basic Land — Forest" });
    state.players.user.hand = [forest];
    const actions = [
      { kind: "play-land", playerId: "user", cardId: forest.id, name: "Forest" },
      { kind: "pass-priority", playerId: "user" },
    ];
    const decision = makeDecision(state, "user", actions, { difficulty: "intermediate" });
    expect(decision.kind).toBe("auto-decided");
    expect(decision.action.kind).toBe("play-land");
    expect(decision.metadata.reasoning).toBe("intermediate-auto-land");
  });

  it("auto-passes when only pass is interesting", () => {
    const state = makeState();
    const actions = [{ kind: "pass-priority", playerId: "user" }];
    const decision = makeDecision(state, "user", actions, { difficulty: "intermediate" });
    expect(decision.kind).toBe("auto-decided");
    expect(decision.action.kind).toBe("pass-priority");
    // The single-pass short-circuit fires before the intermediate path,
    // so reasoning is "only-pass-available", not the intermediate-specific
    // "intermediate-auto-pass".
    expect(decision.metadata.reasoning).toBe("only-pass-available");
  });

  it("asks on castable spells (real decision)", () => {
    const bolt = makeCard({ name: "Lightning Bolt", type: "Instant", mana: "{R}", oracle: "Deal 3." });
    const state = makeState({ phase: "beginning", step: "upkeep" });
    state.players.user.hand = [bolt];
    state.players.user.manaPool = { ...state.players.user.manaPool, R: 1 };
    const actions = [
      { kind: "cast-spell", playerId: "user", cardId: bolt.id, name: "Lightning Bolt", cost: { generic: 0, R: 1 }, cmc: 1 },
      { kind: "pass-priority", playerId: "user" },
    ];
    const decision = makeDecision(state, "user", actions, { difficulty: "intermediate" });
    expect(decision.kind).toBe("ask");
    expect(decision.metadata.reasoning).toContain("intermediate");
  });

  it("auto-attacks when no trap fires", () => {
    // User has an attacker, opponent has nothing scary.
    const bear = createPermanent({
      card: makeCard({ name: "Llanowar Elves", type: "Creature — Elf", power: 1, toughness: 1 }),
      controller: "user",
      summoningSick: false,
    });
    let state = makeState({ phase: "combat", step: "declare-attackers", activePlayer: "user" });
    state.players.user.battlefield = [bear];
    const actions = [
      { kind: "declare-attacker", playerId: "user", permanentId: bear.id, name: "Llanowar Elves" },
      { kind: "pass-priority", playerId: "user" },
    ];
    const decision = makeDecision(state, "user", actions, { difficulty: "intermediate" });
    expect(decision.kind).toBe("auto-decided");
    expect(decision.action.kind).toBe("declare-attacker");
    expect(decision.metadata.reasoning).toBe("intermediate-auto-attack");
  });

  it("asks with trap warning when opponent has lethal counter-swing", () => {
    const userBear = createPermanent({
      card: makeCard({ name: "Llanowar Elves", type: "Creature — Elf", power: 1, toughness: 1 }),
      controller: "user",
      summoningSick: false,
    });
    const fattie = createPermanent({
      card: makeCard({ name: "Skyship", type: "Creature — Beast", power: 20, toughness: 4 }),
      controller: "ai",
      summoningSick: false,
    });
    let state = makeState({ phase: "combat", step: "declare-attackers", activePlayer: "user" });
    state.players.user.battlefield = [userBear];
    state.players.user.life = 5;
    state.players.ai.battlefield = [fattie];
    const actions = [
      { kind: "declare-attacker", playerId: "user", permanentId: userBear.id, name: "Llanowar Elves" },
      { kind: "pass-priority", playerId: "user" },
    ];
    const decision = makeDecision(state, "user", actions, { difficulty: "intermediate" });
    expect(decision.kind).toBe("ask");
    expect(decision.metadata.reasoning).toBe("intermediate-attack-trap");
    expect(decision.metadata.traps.length).toBeGreaterThan(0);
    expect(decision.prompt).toContain("Stop");
    expect(decision.prompt).toContain("lethal");
  });
});

describe("makeDecision — Expert mode", () => {
  it("auto-decides every legal choice", () => {
    const state = makeState();
    const bolt = makeCard({ name: "Lightning Bolt", type: "Instant", mana: "{R}", oracle: "Deal 3." });
    state.players.user.hand = [bolt];
    state.players.user.manaPool = { ...state.players.user.manaPool, R: 1 };
    const actions = [
      { kind: "cast-spell", playerId: "user", cardId: bolt.id, name: "Lightning Bolt", cost: { generic: 0, R: 1 }, cmc: 1 },
      { kind: "pass-priority", playerId: "user" },
    ];
    const decision = makeDecision(state, "user", actions, { difficulty: "expert" });
    expect(decision.kind).toBe("auto-decided");
    expect(decision.metadata.reasoning).toBe("expert-auto-pilot");
  });
});

describe("resolveChoice", () => {
  it("returns the matching action object", () => {
    const actions = [
      { kind: "play-land", cardId: "card-Forest", name: "Forest" },
      { kind: "cast-spell", cardId: "card-Bolt", name: "Bolt" },
      { kind: "pass-priority" },
    ];
    const match = resolveChoice(actions, { kind: "cast-spell", cardId: "card-Bolt" });
    expect(match).toBe(actions[1]);
  });

  it("returns null when no match is found", () => {
    const actions = [{ kind: "pass-priority" }];
    expect(resolveChoice(actions, { kind: "play-land", cardId: "nope" })).toBeNull();
  });

  it("returns null for null choice", () => {
    expect(resolveChoice([{ kind: "pass-priority" }], null)).toBeNull();
  });

  it("CANONICAL: two declare-attacker options differing only in defenderId — the chosen one wins", () => {
    // The old field-subset match ignored defenderId and returned the FIRST option, so picking
    // "attack ai2" dispatched "attack ai1". The full round-tripped option must match exactly.
    const actions = [
      { kind: "declare-attacker", playerId: "user", permanentId: "p1", name: "Bear", defenderId: "ai1" },
      { kind: "declare-attacker", playerId: "user", permanentId: "p1", name: "Bear", defenderId: "ai2" },
    ];
    // JSON round-trip (UI → API → applyChoice) with scrambled key order still matches canonically.
    const choice = JSON.parse(JSON.stringify({ defenderId: "ai2", name: "Bear", permanentId: "p1", playerId: "user", kind: "declare-attacker" }));
    expect(resolveChoice(actions, choice)).toBe(actions[1]);
  });

  it("CANONICAL: options differing only in a collapsed field (xValue / chosenMode / later targets) resolve exactly", () => {
    const xActions = [
      { kind: "cast-spell", cardId: "c1", xValue: 2 },
      { kind: "cast-spell", cardId: "c1", xValue: 5 },
    ];
    expect(resolveChoice(xActions, { kind: "cast-spell", cardId: "c1", xValue: 5 })).toBe(xActions[1]);
    const multiTarget = [
      { kind: "cast-spell", cardId: "c2", targets: [{ id: "t1" }, { id: "t2" }] },
      { kind: "cast-spell", cardId: "c2", targets: [{ id: "t1" }, { id: "t3" }] },
    ];
    expect(resolveChoice(multiTarget, { kind: "cast-spell", cardId: "c2", targets: [{ id: "t1" }, { id: "t3" }] })).toBe(multiTarget[1]);
  });

  it("LEGACY partial choice still matches when unambiguous, but an AMBIGUOUS partial returns null", () => {
    const actions = [
      { kind: "declare-attacker", playerId: "user", permanentId: "p1", name: "Bear", defenderId: "ai1" },
      { kind: "declare-attacker", playerId: "user", permanentId: "p1", name: "Bear", defenderId: "ai2" },
      { kind: "cast-spell", cardId: "c9", name: "Bolt" },
    ];
    // Unambiguous partial (only one cast-spell with that cardId) → matched.
    expect(resolveChoice(actions, { kind: "cast-spell", cardId: "c9" })).toBe(actions[2]);
    // Ambiguous partial (fits BOTH attack options — the legacy fields can't tell them apart) → null,
    // never a guess (dispatching an action the user didn't pick is a runtime false positive).
    expect(resolveChoice(actions, { kind: "declare-attacker", permanentId: "p1" })).toBeNull();
  });
});

describe("narrator — narrateStep", () => {
  it("returns beginner-length narration with rule citations", () => {
    const state = makeState({ phase: "beginning", step: "untap", turn: 1, activePlayer: "user", startingPlayer: "user" });
    const text = narrateStep(state, { difficulty: "beginner" });
    expect(text).toContain("untap step");
    expect(text).toContain("117.3a");
    expect(text).toContain("You");
  });

  it("returns first-sentence-only at intermediate difficulty", () => {
    const state = makeState({ step: "main", phase: "precombat-main" });
    const text = narrateStep(state, { difficulty: "intermediate" });
    expect(text.length).toBeLessThan(150);
  });

  it("returns empty string at expert difficulty", () => {
    const state = makeState({ step: "main", phase: "precombat-main" });
    expect(narrateStep(state, { difficulty: "expert" })).toBe("");
  });

  it("flags first-turn draw skip in narration", () => {
    const state = makeState({ phase: "beginning", step: "draw", turn: 1, activePlayer: "user", startingPlayer: "user" });
    const text = narrateStep(state, { difficulty: "beginner" });
    expect(text).toContain("skipped");
    expect(text).toContain("103.8a"); // CR renumbered: two-player first-draw skip is 103.8a (103.7a no longer exists)
  });

  it("describes draw step on subsequent turns without skip", () => {
    const state = makeState({ phase: "beginning", step: "draw", turn: 3, activePlayer: "user" });
    const text = narrateStep(state, { difficulty: "beginner" });
    expect(text).toContain("draws one card");
    expect(text).not.toContain("skipped");
  });
});

describe("narrator — narrateAction", () => {
  it("describes pass-priority differently per difficulty", () => {
    const action = { kind: "pass-priority" };
    expect(narrateAction(action, makeState(), { difficulty: "beginner" })).toContain("step ends");
    expect(narrateAction(action, makeState(), { difficulty: "intermediate" })).toBe("Pass priority.");
  });

  it("wraps card names in double brackets and includes cost", () => {
    const action = { kind: "cast-spell", name: "Lightning Bolt", cost: { generic: 0, R: 1 } };
    const card = makeCard({ name: "Lightning Bolt", type: "Instant", mana: "{R}", oracle: "Deals 3 damage to any target." });
    const text = narrateAction(action, makeState(), { card, difficulty: "beginner" });
    expect(text).toContain("[[Lightning Bolt]]");
    expect(text).toContain("{R}");
    expect(text).toContain("3 damage");
  });

  it("formats hybrid pips in costs", () => {
    const action = { kind: "cast-spell", name: "Bituminous Blast", cost: { generic: 4, hybrid: [["B", "R"]] } };
    const text = narrateAction(action, makeState(), { difficulty: "beginner" });
    expect(text).toContain("{B/R}");
  });

  it("describes attack action with combat-damage explanation at beginner", () => {
    const action = { kind: "declare-attacker", name: "Llanowar Elves" };
    const text = narrateAction(action, makeState(), { difficulty: "beginner" });
    expect(text).toContain("[[Llanowar Elves]]");
    expect(text).toContain("combat-damage");
  });

  it("describes block action with simultaneous-damage explanation at beginner", () => {
    const action = { kind: "declare-blocker", name: "Wall of Omens" };
    const text = narrateAction(action, makeState(), { difficulty: "beginner" });
    expect(text).toContain("[[Wall of Omens]]");
    expect(text).toContain("simultaneously");
  });

  it("falls back to a generic description for unknown action kinds", () => {
    const action = { kind: "weird-action", name: "Something" };
    const text = narrateAction(action, makeState());
    expect(text).toContain("Something");
  });
});

describe("narrator — narrateAttackTrap", () => {
  it("returns empty string for empty trap list", () => {
    expect(narrateAttackTrap([])).toBe("");
    expect(narrateAttackTrap(null)).toBe("");
    expect(narrateAttackTrap(undefined)).toBe("");
  });

  it("uses 'Stop.' lead when any trap is danger severity", () => {
    const text = narrateAttackTrap([
      { type: "counter-attack-lethal", severity: "danger", message: "Lethal swing-back." },
    ]);
    expect(text.startsWith("Stop")).toBe(true);
    expect(text).toContain("Lethal swing-back.");
  });

  it("uses 'Heads up' lead when only warn-level traps", () => {
    const text = narrateAttackTrap([
      { type: "instant-speed-response", severity: "warn", message: "Open mana." },
    ]);
    expect(text.startsWith("Heads up")).toBe(true);
    expect(text).toContain("Open mana.");
  });

  it("renders each trap as a bullet line", () => {
    const text = narrateAttackTrap([
      { type: "counter-attack-lethal", severity: "danger", message: "Trap A." },
      { type: "instant-speed-response", severity: "warn", message: "Trap B." },
    ]);
    expect(text).toContain("• Trap A.");
    expect(text).toContain("• Trap B.");
  });
});

describe("narrator — narrateDecision composition", () => {
  it("combines step narration with numbered action list at beginner", () => {
    const state = makeState({ step: "main", phase: "precombat-main" });
    const actions = [
      { kind: "play-land", name: "Forest" },
      { kind: "pass-priority" },
    ];
    const text = narrateDecision(state, actions, { difficulty: "beginner" });
    expect(text).toContain("main phase");
    expect(text).toContain("1. ");
    expect(text).toContain("2. ");
    expect(text).toContain("[[Forest]]");
  });

  it("returns only step narration at intermediate", () => {
    const state = makeState({ step: "main", phase: "precombat-main" });
    const text = narrateDecision(state, [], { difficulty: "intermediate" });
    expect(text).not.toContain("1. ");
  });

  it("returns empty at expert", () => {
    expect(narrateDecision(makeState(), [], { difficulty: "expert" })).toBe("");
  });
});

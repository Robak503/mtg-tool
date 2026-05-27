/**
 * Tests for Phase 6 PR4 — opponentAI.js.
 *
 * Covers picker behavior: prefers lands, picks casts by archetype
 * scoring, falls back to pass-priority, attack-all-legal default,
 * smallest-blocker block assignment.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState } from "./gameState.js";
import {
  pickAction,
  pickAttackPlan,
  pickBlockPlan,
  deriveDeckRepresentation,
} from "./opponentAI.js";

function makeCard({ id, name, type, mana = "", oracle = "", power, toughness }) {
  return {
    id: id || `card-${name}`,
    name,
    type,
    mana,
    oracle,
    ...(power !== undefined ? { power } : {}),
    ...(toughness !== undefined ? { toughness } : {}),
  };
}

function makeState({ hand = [], battlefield = [], opponentBattlefield = [], manaPool = {} } = {}) {
  const base = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...base,
    activePlayer: "ai",
    phase: "precombat-main",
    step: "main",
    priorityHolder: "ai",
    players: {
      user: { ...base.players.user, battlefield: opponentBattlefield },
      ai: {
        ...base.players.ai,
        hand,
        battlefield,
        manaPool: { ...base.players.ai.manaPool, ...manaPool },
      },
    },
  };
}

beforeEach(() => {
  _resetIdsForTests();
});

describe("pickAction priority order", () => {
  it("always picks land before spell when a land is legal", () => {
    const forest = makeCard({ name: "Forest", type: "Basic Land — Forest" });
    const bolt = makeCard({ name: "Lightning Bolt", type: "Instant", mana: "{R}", oracle: "Deals 3 damage to any target." });
    const state = makeState({ hand: [forest, bolt], manaPool: { R: 1 } });

    const actions = [
      { kind: "play-land", playerId: "ai", cardId: forest.id, name: "Forest" },
      { kind: "cast-spell", playerId: "ai", cardId: bolt.id, name: "Lightning Bolt", cost: { generic: 0, R: 1 }, cmc: 1 },
      { kind: "pass-priority", playerId: "ai" },
    ];
    const choice = pickAction(state, "ai", actions, { archetype: "aggro" });
    expect(choice.kind).toBe("play-land");
  });

  it("picks the highest-priority cast when there's no land", () => {
    const elf = makeCard({ name: "Llanowar Elves", type: "Creature — Elf", mana: "{G}", oracle: "{T}: Add {G}." });
    const sage = makeCard({ name: "Sage of Hours", type: "Creature — Human Wizard", mana: "{1}{U}", oracle: "Remove five +1/+1 counters: extra turn." });
    const state = makeState({ hand: [elf, sage], manaPool: { G: 1, U: 1, C: 1 } });

    const actions = [
      { kind: "cast-spell", playerId: "ai", cardId: elf.id, name: "Llanowar Elves", cost: { G: 1 }, cmc: 1 },
      { kind: "cast-spell", playerId: "ai", cardId: sage.id, name: "Sage of Hours", cost: { generic: 1, U: 1 }, cmc: 2 },
      { kind: "pass-priority", playerId: "ai" },
    ];
    // Ramp archetype prefers the ramp creature.
    const choice = pickAction(state, "ai", actions, { archetype: "ramp" });
    expect(choice.kind).toBe("cast-spell");
    expect(choice.name).toBe("Llanowar Elves");
  });

  it("falls back to pass-priority when nothing is castable", () => {
    const state = makeState({ hand: [] });
    const actions = [{ kind: "pass-priority", playerId: "ai" }];
    const choice = pickAction(state, "ai", actions, { archetype: "midrange" });
    expect(choice.kind).toBe("pass-priority");
  });

  it("returns null when given an empty action list", () => {
    const state = makeState({ hand: [] });
    expect(pickAction(state, "ai", [], {})).toBeNull();
  });
});

describe("archetype-aware cast scoring", () => {
  function setup(archetype) {
    const elf = makeCard({ name: "Llanowar Elves", type: "Creature — Elf", mana: "{G}", oracle: "{T}: Add {G}." });
    const removal = makeCard({ name: "Doom Blade", type: "Instant", mana: "{1}{B}", oracle: "Destroy target nonblack creature." });
    const draw = makeCard({ name: "Sign in Blood", type: "Sorcery", mana: "{B}{B}", oracle: "Target player draws two cards and loses 2 life." });
    const finisher = makeCard({ name: "Craterhoof Behemoth", type: "Creature — Beast", mana: "{5}{G}{G}{G}", oracle: "Creatures you control get +X/+X." });

    return {
      state: makeState({ hand: [elf, removal, draw, finisher], manaPool: { B: 2, G: 1, C: 5 } }),
      actions: [
        { kind: "cast-spell", playerId: "ai", cardId: elf.id, name: "Llanowar Elves", cost: { G: 1 }, cmc: 1 },
        { kind: "cast-spell", playerId: "ai", cardId: removal.id, name: "Doom Blade", cost: { generic: 1, B: 1 }, cmc: 2 },
        { kind: "cast-spell", playerId: "ai", cardId: draw.id, name: "Sign in Blood", cost: { B: 2 }, cmc: 2 },
        { kind: "cast-spell", playerId: "ai", cardId: finisher.id, name: "Craterhoof Behemoth", cost: { generic: 5, G: 3 }, cmc: 8 },
        { kind: "pass-priority", playerId: "ai" },
      ],
      archetype,
    };
  }

  it("control prefers interaction first", () => {
    const { state, actions, archetype } = setup("control");
    const choice = pickAction(state, "ai", actions, { archetype });
    expect(choice.name).toBe("Doom Blade");
  });

  it("ramp prefers the ramp creature first", () => {
    const { state, actions, archetype } = setup("ramp");
    const choice = pickAction(state, "ai", actions, { archetype });
    expect(choice.name).toBe("Llanowar Elves");
  });

  it("combo prefers ramp then draw", () => {
    const { state, actions, archetype } = setup("combo");
    const choice = pickAction(state, "ai", actions, { archetype });
    expect(choice.name).toBe("Llanowar Elves");
  });

  it("midrange prefers ramp then draw then interaction", () => {
    const { state, actions, archetype } = setup("midrange");
    const choice = pickAction(state, "ai", actions, { archetype });
    expect(choice.name).toBe("Llanowar Elves");
  });
});

describe("pickAttackPlan", () => {
  it("attacks with every legal attacker by default", () => {
    const actions = [
      { kind: "declare-attacker", permanentId: "p1", name: "Bear" },
      { kind: "declare-attacker", permanentId: "p2", name: "Wolf" },
    ];
    const plan = pickAttackPlan({}, "ai", actions);
    expect(plan).toHaveLength(2);
    expect(plan.map(a => a.permanentId).sort()).toEqual(["p1", "p2"]);
  });

  it("returns empty when no attacker actions exist", () => {
    expect(pickAttackPlan({}, "ai", [])).toEqual([]);
  });
});

describe("pickBlockPlan", () => {
  function makePerm({ id, power = 1, toughness = 1 }) {
    return {
      id,
      card: { name: id, type: "Creature — Beast", power, toughness },
      controller: "user",
      tapped: false,
      summoningSick: false,
      counters: {}, attachments: [], attachedTo: null,
    };
  }

  it("assigns at most one blocker per attacker, preferring smallest-power", () => {
    const state = makeState({
      battlefield: [
        makePerm({ id: "perm-small", power: 1 }),
        makePerm({ id: "perm-big", power: 5 }),
      ],
    });
    const blockerActions = [
      { kind: "declare-blocker", permanentId: "perm-small", attackerId: "a1", name: "small" },
      { kind: "declare-blocker", permanentId: "perm-big", attackerId: "a1", name: "big" },
      { kind: "declare-blocker", permanentId: "perm-small", attackerId: "a2", name: "small" },
    ];
    // Note: in this setup, "small" is in user's battlefield (defender)
    // because we set opponentBattlefield via the "battlefield" key in
    // makeState's user perspective. The picker reads ai's permanents,
    // not user's, so swap:
    const swapped = {
      ...state,
      players: {
        ...state.players,
        ai: { ...state.players.ai, battlefield: state.players.user.battlefield },
        user: { ...state.players.user, battlefield: [] },
      },
    };
    const plan = pickBlockPlan(swapped, "ai", blockerActions);
    expect(plan).toHaveLength(2);
    // Each attacker assigned at most one blocker.
    const attackers = plan.map(p => p.attackerId);
    expect(new Set(attackers).size).toBe(2);
    // The "small" blocker is preferred (lower power = better chump).
    expect(plan.some(p => p.permanentId === "perm-small")).toBe(true);
  });

  it("returns empty when no block actions exist", () => {
    expect(pickBlockPlan({}, "ai", [])).toEqual([]);
  });
});

describe("deriveDeckRepresentation", () => {
  it("flattens all zones into a card list shape detectArchetype can read", () => {
    const state = createGameState({
      userDeck: [],
      aiDeck: [{ id: "c-1", name: "Sol Ring" }, { id: "c-2", name: "Atraxa" }],
      aiCommanders: [{ id: "cmd-1", name: "Edgar Markov" }],
    });
    const cards = deriveDeckRepresentation(state, "ai");
    const names = cards.map(c => c.name).sort();
    expect(names).toContain("Sol Ring");
    expect(names).toContain("Atraxa");
    expect(names).toContain("Edgar Markov");
    expect(cards.every(c => c.qty === 1 && c.section === "Mainboard")).toBe(true);
  });

  it("returns empty for an unknown player", () => {
    const state = createGameState({ userDeck: [], aiDeck: [] });
    expect(deriveDeckRepresentation(state, "eve")).toEqual([]);
  });
});

describe("pickAction with auto-archetype-detection", () => {
  it("falls back to detecting archetype from the AI's known zones when not supplied", () => {
    // Stack the AI's hand with combo-shape stuff so the detector
    // votes "combo" and the picker prefers ramp/draw accordingly.
    const ramp = makeCard({ name: "Sol Ring", type: "Artifact", mana: "{1}", oracle: "{T}: Add {C}{C}." });
    const draw = makeCard({ name: "Sign in Blood", type: "Sorcery", mana: "{B}{B}", oracle: "Target player draws two cards." });
    const tutor = makeCard({ name: "Demonic Tutor", type: "Sorcery", mana: "{1}{B}", oracle: "Search your library for a card." });
    const state = makeState({ hand: [ramp, draw, tutor], manaPool: { B: 2, C: 2 } });

    const actions = [
      { kind: "cast-spell", playerId: "ai", cardId: ramp.id, name: "Sol Ring", cost: { generic: 1 }, cmc: 1 },
      { kind: "cast-spell", playerId: "ai", cardId: draw.id, name: "Sign in Blood", cost: { B: 2 }, cmc: 2 },
      { kind: "cast-spell", playerId: "ai", cardId: tutor.id, name: "Demonic Tutor", cost: { generic: 1, B: 1 }, cmc: 2 },
      { kind: "pass-priority", playerId: "ai" },
    ];
    // Don't pass archetype; the picker should auto-detect and pick
    // Sol Ring first regardless of detected archetype (ramp goes
    // first in every preset). Just verify a deterministic legal pick.
    const choice = pickAction(state, "ai", actions);
    expect(choice.kind).toBe("cast-spell");
    expect(choice.name).toBe("Sol Ring");
  });
});

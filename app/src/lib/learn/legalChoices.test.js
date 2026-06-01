/**
 * Tests for Phase 6 PR3 — legalChoices.js.
 *
 * Covers parseManaCost / canPayManaCost / totalCmc, plus the action
 * generators: pass-priority, play-land, cast-spell, declare-attacker,
 * declare-blocker. Tests are timing-rule heavy because that's where
 * MTG legality lives.
 */

import { beforeEach, describe, expect, it } from "vitest";
import {
  _resetIdsForTests,
  createGameState,
} from "./gameState.js";
import {
  parseManaCost,
  canPayManaCost,
  totalCmc,
  legalActionsForPlayer,
  groupActionsByKind,
  filterActions,
} from "./legalChoices.js";

function makeCard({ id, name, type, mana, keywords = [] }) {
  return { id: id || `card-${name}`, name, type, mana, keywords };
}

function stateWith({ activePlayer = "user", phase = "precombat-main", step = "main", priorityHolder = "user" } = {}) {
  return {
    ...createGameState({
      userDeck: [],
      aiDeck: [],
    }),
    activePlayer,
    phase,
    step,
    priorityHolder,
    consecutivePasses: 0,
  };
}

beforeEach(() => {
  _resetIdsForTests();
});

describe("parseManaCost", () => {
  it("parses generic + colored pips", () => {
    const cost = parseManaCost("{2}{U}{U}");
    expect(cost.generic).toBe(2);
    expect(cost.U).toBe(2);
    expect(cost.W).toBe(0);
  });

  it("parses multi-digit generic", () => {
    expect(parseManaCost("{10}").generic).toBe(10);
  });

  it("parses X and sets hasX", () => {
    const cost = parseManaCost("{X}{R}{R}");
    expect(cost.hasX).toBe(true);
    expect(cost.R).toBe(2);
  });

  it("parses colorless C pips distinctly from generic", () => {
    const cost = parseManaCost("{1}{C}{C}");
    expect(cost.generic).toBe(1);
    expect(cost.C).toBe(2);
  });

  it("parses phyrexian pips into the phyrexian array", () => {
    const cost = parseManaCost("{U/P}{U/P}");
    expect(cost.phyrexian).toEqual(["U", "U"]);
    expect(cost.U).toBe(0);
  });

  it("parses hybrid pips", () => {
    const cost = parseManaCost("{W/U}{R}");
    expect(cost.hybrid).toHaveLength(1);
    expect(cost.hybrid[0]).toContain("W");
    expect(cost.hybrid[0]).toContain("U");
    expect(cost.R).toBe(1);
  });

  it("returns a zero-cost object for empty / non-string input", () => {
    expect(parseManaCost("").generic).toBe(0);
    expect(parseManaCost(null).generic).toBe(0);
    expect(parseManaCost(undefined).generic).toBe(0);
  });

  it("silently drops malformed pips", () => {
    const cost = parseManaCost("{2}{garbage}{U}");
    expect(cost.generic).toBe(2);
    expect(cost.U).toBe(1);
  });
});

describe("canPayManaCost", () => {
  it("returns true when pool exactly matches cost", () => {
    const cost = parseManaCost("{2}{U}");
    expect(canPayManaCost({ W: 0, U: 1, B: 0, R: 0, G: 0, C: 2 }, cost)).toBe(true);
  });

  it("returns false when colored pip is missing", () => {
    const cost = parseManaCost("{U}{U}");
    expect(canPayManaCost({ W: 0, U: 1, B: 0, R: 0, G: 0, C: 0 }, cost)).toBe(false);
  });

  it("returns false when generic is short", () => {
    const cost = parseManaCost("{3}");
    expect(canPayManaCost({ W: 0, U: 0, B: 0, R: 0, G: 2, C: 0 }, cost)).toBe(false);
  });

  it("treats colored mana as substitutable for generic", () => {
    const cost = parseManaCost("{3}");
    // 1 W + 1 U + 1 R + 1 G = 4 total mana ≥ 3 generic.
    expect(canPayManaCost({ W: 1, U: 1, B: 0, R: 1, G: 1, C: 0 }, cost)).toBe(true);
  });

  it("hybrid pips pay from whichever color is available", () => {
    const cost = parseManaCost("{W/U}{W/U}");
    expect(canPayManaCost({ W: 2, U: 0, B: 0, R: 0, G: 0, C: 0 }, cost)).toBe(true);
    expect(canPayManaCost({ W: 1, U: 1, B: 0, R: 0, G: 0, C: 0 }, cost)).toBe(true);
    expect(canPayManaCost({ W: 0, U: 2, B: 0, R: 0, G: 0, C: 0 }, cost)).toBe(true);
    expect(canPayManaCost({ W: 0, U: 1, B: 0, R: 0, G: 0, C: 0 }, cost)).toBe(false);
  });

  it("returns true for an empty cost regardless of pool", () => {
    expect(canPayManaCost({ W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 }, parseManaCost(""))).toBe(true);
  });
});

describe("totalCmc", () => {
  it("counts every pip including hybrid and phyrexian", () => {
    expect(totalCmc(parseManaCost("{2}{U}{U}"))).toBe(4);
    expect(totalCmc(parseManaCost("{W/U}{B/G}"))).toBe(2);
    expect(totalCmc(parseManaCost("{U/P}{U/P}"))).toBe(2);
  });
  it("X is 0 for purposes of CMC here", () => {
    expect(totalCmc(parseManaCost("{X}{R}"))).toBe(1);
  });
});

describe("legalActionsForPlayer — pass-priority", () => {
  it("includes pass-priority when the player holds priority", () => {
    const actions = legalActionsForPlayer(stateWith({ priorityHolder: "user" }), "user");
    expect(actions.some(a => a.kind === "pass-priority")).toBe(true);
  });

  it("does NOT include pass-priority when the player doesn't hold priority", () => {
    const actions = legalActionsForPlayer(stateWith({ priorityHolder: "ai" }), "user");
    expect(actions.some(a => a.kind === "pass-priority")).toBe(false);
  });

  it("throws on invalid playerId", () => {
    expect(() => legalActionsForPlayer(stateWith(), "eve")).toThrow();
  });
});

describe("legalActionsForPlayer — play-land", () => {
  function withHand(state, cards, playerId = "user") {
    return {
      ...state,
      players: {
        ...state.players,
        [playerId]: { ...state.players[playerId], hand: cards },
      },
    };
  }

  const forest = makeCard({ name: "Forest", type: "Basic Land — Forest", mana: "" });
  const island = makeCard({ name: "Island", type: "Basic Land — Island", mana: "" });
  const bolt = makeCard({ name: "Lightning Bolt", type: "Instant", mana: "{R}" });

  it("offers each land in hand during own main phase with empty stack", () => {
    const state = withHand(stateWith(), [forest, island, bolt]);
    const actions = legalActionsForPlayer(state, "user");
    const lands = filterActions(actions, "play-land");
    expect(lands).toHaveLength(2);
    expect(lands.map(a => a.name).sort()).toEqual(["Forest", "Island"]);
  });

  it("does NOT offer lands during combat", () => {
    const state = withHand(
      stateWith({ phase: "combat", step: "beginning-of-combat", priorityHolder: "user" }),
      [forest],
    );
    expect(filterActions(legalActionsForPlayer(state, "user"), "play-land")).toHaveLength(0);
  });

  it("does NOT offer lands when stack is non-empty", () => {
    const base = withHand(stateWith(), [forest]);
    const state = { ...base, stack: [{ id: "fake-stk", kind: "spell" }] };
    expect(filterActions(legalActionsForPlayer(state, "user"), "play-land")).toHaveLength(0);
  });

  it("does NOT offer lands on opponent's turn", () => {
    const state = withHand(stateWith({ activePlayer: "ai", priorityHolder: "user" }), [forest]);
    expect(filterActions(legalActionsForPlayer(state, "user"), "play-land")).toHaveLength(0);
  });

  it("does NOT offer lands when one has already been played this turn", () => {
    const base = withHand(stateWith(), [forest]);
    const state = {
      ...base,
      players: {
        ...base.players,
        user: { ...base.players.user, landsPlayedThisTurn: 1 },
      },
    };
    expect(filterActions(legalActionsForPlayer(state, "user"), "play-land")).toHaveLength(0);
  });
});

describe("legalActionsForPlayer — cast-spell", () => {
  function withHandAndMana(handCards, mana, opts = {}) {
    let state = stateWith(opts);
    state = {
      ...state,
      players: {
        ...state.players,
        user: { ...state.players.user, hand: handCards, manaPool: { ...state.players.user.manaPool, ...mana } },
      },
    };
    return state;
  }

  const bolt = makeCard({ name: "Lightning Bolt", type: "Instant", mana: "{R}" });
  const counterspell = makeCard({ name: "Counterspell", type: "Instant", mana: "{U}{U}" });
  const wrath = makeCard({ name: "Wrath of God", type: "Sorcery", mana: "{2}{W}{W}" });
  const creature = makeCard({ name: "Llanowar Elves", type: "Creature — Elf Druid", mana: "{G}" });

  it("offers an affordable instant when player has priority (any phase)", () => {
    const state = withHandAndMana([bolt], { R: 1 }, { phase: "beginning", step: "upkeep" });
    const casts = filterActions(legalActionsForPlayer(state, "user"), "cast-spell");
    expect(casts).toHaveLength(1);
    expect(casts[0].name).toBe("Lightning Bolt");
  });

  it("does NOT offer an unaffordable spell", () => {
    const state = withHandAndMana([counterspell], { U: 1 });
    expect(filterActions(legalActionsForPlayer(state, "user"), "cast-spell")).toHaveLength(0);
  });

  it("offers a sorcery only during the active player's main phase", () => {
    let state = withHandAndMana([wrath], { W: 2, C: 2, U: 0, B: 0, R: 0, G: 0 });
    expect(filterActions(legalActionsForPlayer(state, "user"), "cast-spell")
      .some(a => a.name === "Wrath of God")).toBe(true);

    // Now switch to combat — sorcery becomes illegal.
    state = { ...state, phase: "combat", step: "beginning-of-combat" };
    expect(filterActions(legalActionsForPlayer(state, "user"), "cast-spell")
      .some(a => a.name === "Wrath of God")).toBe(false);
  });

  it("does NOT offer a creature spell (sorcery-speed by default) on opponent's turn", () => {
    const state = withHandAndMana(
      [creature],
      { G: 1, W: 0, U: 0, B: 0, R: 0, C: 0 },
      { activePlayer: "ai", priorityHolder: "user", phase: "precombat-main", step: "main" },
    );
    expect(filterActions(legalActionsForPlayer(state, "user"), "cast-spell")).toHaveLength(0);
  });

  it("includes parsed cost + cmc in the action object", () => {
    const state = withHandAndMana([wrath], { W: 2, C: 2 });
    const wrathAction = filterActions(legalActionsForPlayer(state, "user"), "cast-spell")
      .find(a => a.name === "Wrath of God");
    expect(wrathAction.cost.W).toBe(2);
    expect(wrathAction.cost.generic).toBe(2);
    expect(wrathAction.cmc).toBe(4);
  });
});

describe("legalActionsForPlayer — declare-attacker", () => {
  function withBattlefield(perms, playerId = "user", opts = {}) {
    let state = stateWith({
      activePlayer: "user",
      phase: "combat",
      step: "declare-attackers",
      priorityHolder: null,
      ...opts,
    });
    state = {
      ...state,
      players: {
        ...state.players,
        [playerId]: { ...state.players[playerId], battlefield: perms },
      },
    };
    return state;
  }

  function permanent({ name, controller = "user", tapped = false, summoningSick = false, keywords = [] }) {
    return {
      id: `perm-${name}`,
      card: makeCard({ name, type: "Creature — Beast", mana: "{3}{G}", keywords }),
      controller,
      tapped,
      summoningSick,
      counters: {},
      attachments: [],
      attachedTo: null,
    };
  }

  it("offers untapped, non-sick creatures as attackers", () => {
    const state = withBattlefield([
      permanent({ name: "Bear" }),
      permanent({ name: "Wolf" }),
    ]);
    const attackers = filterActions(legalActionsForPlayer(state, "user"), "declare-attacker");
    expect(attackers).toHaveLength(2);
  });

  it("excludes tapped creatures", () => {
    const state = withBattlefield([
      permanent({ name: "Bear", tapped: true }),
      permanent({ name: "Wolf" }),
    ]);
    const attackers = filterActions(legalActionsForPlayer(state, "user"), "declare-attacker");
    expect(attackers.map(a => a.name)).toEqual(["Wolf"]);
  });

  it("excludes summoning-sick creatures unless they have Haste", () => {
    const state = withBattlefield([
      permanent({ name: "Bear", summoningSick: true }),
      permanent({ name: "Lava Dart Goblin", summoningSick: true, keywords: ["Haste"] }),
    ]);
    const attackers = filterActions(legalActionsForPlayer(state, "user"), "declare-attacker");
    expect(attackers.map(a => a.name)).toEqual(["Lava Dart Goblin"]);
  });

  it("returns no attackers outside the declare-attackers step", () => {
    const state = withBattlefield([permanent({ name: "Bear" })], "user", { step: "main", phase: "precombat-main" });
    expect(filterActions(legalActionsForPlayer(state, "user"), "declare-attacker")).toHaveLength(0);
  });

  it("returns no attackers on opponent's turn", () => {
    const state = withBattlefield([permanent({ name: "Bear" })], "user", { activePlayer: "ai" });
    expect(filterActions(legalActionsForPlayer(state, "user"), "declare-attacker")).toHaveLength(0);
  });
});

describe("legalActionsForPlayer — declare-blocker", () => {
  function blockerState({ attackerIds = ["perm-attacker-1"] } = {}) {
    let state = stateWith({
      activePlayer: "ai",
      phase: "combat",
      step: "declare-blockers",
      priorityHolder: null,
    });
    state = {
      ...state,
      players: {
        ...state.players,
        user: {
          ...state.players.user,
          battlefield: [
            { id: "perm-blocker-1", card: makeCard({ name: "Wall", type: "Creature — Wall", mana: "{2}" }), controller: "user", tapped: false, summoningSick: false, counters: {}, attachments: [], attachedTo: null },
            { id: "perm-blocker-2", card: makeCard({ name: "Wall 2", type: "Creature — Wall", mana: "{2}" }), controller: "user", tapped: true, summoningSick: false, counters: {}, attachments: [], attachedTo: null },
          ],
        },
      },
    };
    return { state, attackerIds };
  }

  it("offers one block action per (untapped blocker × attacker) pair", () => {
    const { state, attackerIds } = blockerState();
    const actions = filterActions(
      legalActionsForPlayer(state, "user", { declaredAttackers: attackerIds }),
      "declare-blocker"
    );
    expect(actions).toHaveLength(1);  // one untapped blocker × one attacker
    expect(actions[0].permanentId).toBe("perm-blocker-1");
    expect(actions[0].attackerId).toBe("perm-attacker-1");
  });

  it("excludes tapped blockers", () => {
    const { state, attackerIds } = blockerState();
    const actions = filterActions(
      legalActionsForPlayer(state, "user", { declaredAttackers: attackerIds }),
      "declare-blocker"
    );
    expect(actions.every(a => a.permanentId !== "perm-blocker-2")).toBe(true);
  });

  it("returns no blocks for the active player (they're attacking, not blocking)", () => {
    const { state, attackerIds } = blockerState();
    expect(filterActions(legalActionsForPlayer(state, "ai", { declaredAttackers: attackerIds }), "declare-blocker"))
      .toHaveLength(0);
  });

  it("returns no blocks outside the declare-blockers step", () => {
    const { state, attackerIds } = blockerState();
    const wrongStep = { ...state, step: "declare-attackers" };
    expect(filterActions(legalActionsForPlayer(wrongStep, "user", { declaredAttackers: attackerIds }), "declare-blocker"))
      .toHaveLength(0);
  });
});

describe("groupActionsByKind + filterActions", () => {
  it("groups by kind", () => {
    const actions = [
      { kind: "pass-priority" },
      { kind: "play-land", name: "Forest" },
      { kind: "play-land", name: "Island" },
      { kind: "cast-spell", name: "Bolt" },
    ];
    const grouped = groupActionsByKind(actions);
    expect(grouped["play-land"]).toHaveLength(2);
    expect(grouped["cast-spell"]).toHaveLength(1);
    expect(grouped["pass-priority"]).toHaveLength(1);
  });

  it("filterActions returns only matching kind", () => {
    const actions = [
      { kind: "pass-priority" },
      { kind: "play-land", name: "Forest" },
      { kind: "cast-spell", name: "Bolt" },
    ];
    expect(filterActions(actions, "cast-spell")).toHaveLength(1);
    expect(filterActions(actions, "play-land")[0].name).toBe("Forest");
  });
});

/**
 * Tests for actionDispatcher.js — applies legal actions to a state.
 *
 * Covers happy paths and error codes for each action kind, plus the
 * mana-deduction arithmetic that cast-spell relies on.
 */

import { beforeEach, describe, expect, it } from "vitest";
import {
  _resetIdsForTests,
  createGameState,
} from "./gameState.js";
import {
  dispatchAction,
  clearCombat,
  DispatcherError,
  _deductManaCostForTests,
} from "./actionDispatcher.js";
import { parseManaCost } from "./legalChoices.js";
import { resolveTopOfStack } from "./gameEngine.js";

function card(name, type, mana = "", id = null) {
  return { id: id || `card-${name}`, name, type, mana };
}

function stateWith({ phase = "precombat-main", step = "main", priorityHolder = "user", activePlayer = "user" } = {}) {
  return {
    ...createGameState({ userDeck: [], aiDeck: [] }),
    phase,
    step,
    priorityHolder,
    activePlayer,
    consecutivePasses: 0,
    startingPlayer: "user",
  };
}

function withHand(state, cards, playerId = "user") {
  return {
    ...state,
    players: {
      ...state.players,
      [playerId]: { ...state.players[playerId], hand: cards },
    },
  };
}

function withMana(state, pool, playerId = "user") {
  return {
    ...state,
    players: {
      ...state.players,
      [playerId]: {
        ...state.players[playerId],
        manaPool: { ...state.players[playerId].manaPool, ...pool },
      },
    },
  };
}

function withBattlefield(state, perms, playerId = "user") {
  return {
    ...state,
    players: {
      ...state.players,
      [playerId]: { ...state.players[playerId], battlefield: perms },
    },
  };
}

function perm(name, { id, type = "Creature — Bear", tapped = false, summoningSick = false, controller = "user", power = 2, toughness = 2 } = {}) {
  return {
    id: id || `perm-${name}`,
    card: { name, type, mana: "{1}{G}", power, toughness },
    controller,
    tapped,
    summoningSick,
    counters: {},
    attachments: [],
    attachedTo: null,
  };
}

beforeEach(() => {
  _resetIdsForTests();
});

describe("dispatchAction — error paths", () => {
  it("throws BAD_ACTION on null action", () => {
    const state = stateWith();
    expect(() => dispatchAction(state, null)).toThrow(DispatcherError);
  });

  it("throws BAD_ACTION on unknown kind", () => {
    const state = stateWith();
    try {
      dispatchAction(state, { kind: "alien-action" });
    } catch (error) {
      expect(error.code).toBe("BAD_ACTION");
    }
  });
});

describe("pass-priority", () => {
  it("hands priority to the opponent", () => {
    const state = stateWith();
    const after = dispatchAction(state, { kind: "pass-priority", playerId: "user" });
    expect(after.priorityHolder).toBe("ai");
  });
});

describe("play-land", () => {
  it("moves the land from hand to battlefield as a permanent + increments lands-played", () => {
    const forest = card("Forest", "Basic Land — Forest");
    const state = withHand(stateWith(), [forest]);

    const after = dispatchAction(state, { kind: "play-land", playerId: "user", cardId: forest.id, name: "Forest" });

    expect(after.players.user.hand).toHaveLength(0);
    expect(after.players.user.battlefield).toHaveLength(1);
    expect(after.players.user.battlefield[0].card.name).toBe("Forest");
    expect(after.players.user.landsPlayedThisTurn).toBe(1);
    expect(after.priorityHolder).toBe("user");
    expect(after.log.some(e => e.kind === "play-land")).toBe(true);
  });

  it("throws LAND_PER_TURN if the player already played a land", () => {
    const forest = card("Forest", "Basic Land — Forest");
    let state = withHand(stateWith(), [forest]);
    state = {
      ...state,
      players: {
        ...state.players,
        user: { ...state.players.user, landsPlayedThisTurn: 1 },
      },
    };
    try {
      dispatchAction(state, { kind: "play-land", playerId: "user", cardId: forest.id });
    } catch (error) {
      expect(error.code).toBe("LAND_PER_TURN");
    }
  });

  it("throws CARD_NOT_IN_HAND when the cardId doesn't match a hand card", () => {
    const state = withHand(stateWith(), []);
    try {
      dispatchAction(state, { kind: "play-land", playerId: "user", cardId: "nonexistent" });
    } catch (error) {
      expect(error.code).toBe("CARD_NOT_IN_HAND");
    }
  });
});

describe("cast-spell", () => {
  it("moves card from hand to stack + deducts mana + resets priority", () => {
    const bear = card("Grizzly Bears", "Creature — Bear", "{1}{G}");
    let state = withHand(stateWith(), [bear]);
    state = withMana(state, { G: 1, C: 1 });

    const cost = parseManaCost("{1}{G}");
    const after = dispatchAction(state, {
      kind: "cast-spell",
      playerId: "user",
      cardId: bear.id,
      name: "Grizzly Bears",
      cost,
      cmc: 2,
    });

    expect(after.players.user.hand).toHaveLength(0);
    expect(after.stack).toHaveLength(1);
    expect(after.stack[0].kind).toBe("spell");
    expect(after.stack[0].source.name).toBe("Grizzly Bears");
    // Phase-7 PR-3: the cast path emits a plain-data, serializable payload
    // (no closure). Grizzly Bears is a creature -> the spell.permanent resolver.
    expect(after.stack[0].payload.resolver).toBe("spell.permanent");
    expect(after.stack[0].payload.params.card.name).toBe("Grizzly Bears");
    expect(after.players.user.manaPool.G).toBe(0);
    expect(after.players.user.manaPool.C).toBe(0);
    expect(after.priorityHolder).toBe("user");
    expect(after.log.some(e => e.kind === "cast-spell")).toBe(true);
  });

  it("creature spell resolves onto the battlefield with summoning sickness", () => {
    const bear = card("Grizzly Bears", "Creature — Bear", "{1}{G}");
    let state = withHand(stateWith(), [bear]);
    state = withMana(state, { G: 1, C: 1 });

    state = dispatchAction(state, {
      kind: "cast-spell",
      playerId: "user",
      cardId: bear.id,
      name: "Grizzly Bears",
      cost: parseManaCost("{1}{G}"),
      cmc: 2,
    });

    // Resolve the spell on the stack.
    const resolved = resolveTopOfStack(state);
    expect(resolved.stack).toHaveLength(0);
    expect(resolved.players.user.battlefield).toHaveLength(1);
    const perm = resolved.players.user.battlefield[0];
    expect(perm.card.name).toBe("Grizzly Bears");
    expect(perm.summoningSick).toBe(true);
    expect(resolved.log.some(e => e.kind === "permanent-enters")).toBe(true);
  });

  it("instant spell resolves as no-op + log", () => {
    const bolt = card("Lightning Bolt", "Instant", "{R}");
    let state = withHand(stateWith(), [bolt]);
    state = withMana(state, { R: 1 });

    state = dispatchAction(state, {
      kind: "cast-spell",
      playerId: "user",
      cardId: bolt.id,
      name: "Lightning Bolt",
      cost: parseManaCost("{R}"),
      cmc: 1,
    });

    const resolved = resolveTopOfStack(state);
    expect(resolved.stack).toHaveLength(0);
    expect(resolved.players.user.battlefield).toHaveLength(0);
    expect(resolved.log.some(e => e.kind === "spell-no-op-resolve")).toBe(true);
  });

  it("throws MANA_SHORT when the cost can't be paid", () => {
    const counterspell = card("Counterspell", "Instant", "{U}{U}");
    let state = withHand(stateWith(), [counterspell]);
    state = withMana(state, { U: 1 });

    try {
      dispatchAction(state, {
        kind: "cast-spell",
        playerId: "user",
        cardId: counterspell.id,
        cost: parseManaCost("{U}{U}"),
        cmc: 2,
      });
    } catch (error) {
      expect(error.code).toBe("MANA_SHORT");
    }
  });
});

describe("declare-attacker", () => {
  it("adds the attacker to state.combat.attackers", () => {
    const attacker = perm("Bear");
    const state = withBattlefield(stateWith({ phase: "combat", step: "declare-attackers" }), [attacker]);
    const after = dispatchAction(state, {
      kind: "declare-attacker",
      playerId: "user",
      permanentId: attacker.id,
      name: "Bear",
    });
    expect(after.combat.attackers).toHaveLength(1);
    expect(after.combat.attackers[0].permanentId).toBe(attacker.id);
    expect(after.combat.attackers[0].defender).toBe("ai");
    expect(after.log.some(e => e.kind === "attack-declared")).toBe(true);
  });

  it("throws PERM_NOT_FOUND when the permanentId isn't on the battlefield", () => {
    const state = stateWith({ phase: "combat", step: "declare-attackers" });
    try {
      dispatchAction(state, { kind: "declare-attacker", playerId: "user", permanentId: "nope" });
    } catch (error) {
      expect(error.code).toBe("PERM_NOT_FOUND");
    }
  });
});

describe("declare-blocker", () => {
  it("adds the blocker + attackerId pairing to state.combat.blockers", () => {
    const blocker = perm("Wall", { id: "perm-wall" });
    const state = withBattlefield(stateWith({ phase: "combat", step: "declare-blockers", activePlayer: "ai" }), [blocker]);
    const after = dispatchAction(state, {
      kind: "declare-blocker",
      playerId: "user",
      permanentId: blocker.id,
      attackerId: "perm-attacker-1",
    });
    expect(after.combat.blockers).toHaveLength(1);
    expect(after.combat.blockers[0]).toMatchObject({
      blockerId: "perm-wall",
      blockingPlayer: "user",
      attackerId: "perm-attacker-1",
    });
  });
});

describe("clearCombat", () => {
  it("resets the combat slot", () => {
    let state = stateWith();
    state = { ...state, combat: { attackers: [{}], blockers: [{}] } };
    const after = clearCombat(state);
    expect(after.combat.attackers).toEqual([]);
    expect(after.combat.blockers).toEqual([]);
  });

  it("no-op when combat doesn't exist yet", () => {
    const state = stateWith();
    expect(clearCombat(state)).toBe(state);
  });
});

describe("_deductManaCostForTests — mana arithmetic", () => {
  it("drains colored pips exactly", () => {
    const after = _deductManaCostForTests(
      { W: 0, U: 2, B: 0, R: 0, G: 0, C: 0 },
      parseManaCost("{U}{U}"),
    );
    expect(after.U).toBe(0);
  });

  it("spends C before colored for generic costs (preserves colored mana)", () => {
    const after = _deductManaCostForTests(
      { W: 0, U: 0, B: 0, R: 0, G: 2, C: 2 },
      parseManaCost("{2}"),
    );
    expect(after.C).toBe(0);
    expect(after.G).toBe(2);  // colored preserved
  });

  it("falls through to colored mana when C runs out", () => {
    const after = _deductManaCostForTests(
      { W: 0, U: 0, B: 0, R: 0, G: 3, C: 1 },
      parseManaCost("{3}"),
    );
    expect(after.C).toBe(0);
    expect(after.G).toBe(1);  // 3 - 1(C) - 2(G) = 0
  });

  it("hybrid pip pays from the smaller side first to preserve flexibility", () => {
    const after = _deductManaCostForTests(
      { W: 3, U: 1, B: 0, R: 0, G: 0, C: 0 },
      parseManaCost("{W/U}"),
    );
    // Smaller side is U (1) — should drain U first.
    expect(after.U).toBe(0);
    expect(after.W).toBe(3);
  });

  it("throws MANA_SHORT when the cost can't be paid", () => {
    try {
      _deductManaCostForTests(
        { W: 0, U: 1, B: 0, R: 0, G: 0, C: 0 },
        parseManaCost("{U}{U}"),
      );
    } catch (error) {
      expect(error.code).toBe("MANA_SHORT");
    }
  });
});

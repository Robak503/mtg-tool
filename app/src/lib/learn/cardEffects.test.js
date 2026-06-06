/**
 * PR 10.5 tests — card-effects registry (static P/T + mana-doesn't-empty).
 *
 * Omnath, Locus of Mana is the headline: +1/+1 per unspent green, and green
 * mana that doesn't empty between steps — so floated green makes Omnath
 * bigger AND survives into combat to hit for it.
 */

import { describe, expect, it } from "vitest";
import { createGameState, creaturePower, creatureToughness, _resetIdsForTests } from "./gameState.js";
import { emptyManaPools } from "./gameEngine.js";
import { resolveCombatDamage } from "./combatResolution.js";
import { manaDoesNotEmpty } from "./cardEffects.js";
import { permanentPower } from "./layers.js";

function perm(name, id, controller, { power = 1, toughness = 1, type = "Legendary Creature — Elemental" } = {}) {
  return { id, card: { name, type, power, toughness }, controller, tapped: false, summoningSick: false, counters: {}, damageMarked: 0, attachments: [], attachedTo: null };
}

function stateWith({ userBf = [], aiBf = [], userPool = {}, aiLife = 40, combat = { attackers: [], blockers: [] } } = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...s,
    combat,
    players: {
      ...s.players,
      user: { ...s.players.user, battlefield: userBf, manaPool: { ...s.players.user.manaPool, ...userPool } },
      ai: { ...s.players.ai, battlefield: aiBf, life: aiLife },
    },
  };
}

const OMNATH = (id = "omn") => perm("Omnath, Locus of Mana", id, "user", { power: 1, toughness: 1 });

describe("Omnath static P/T", () => {
  it("is a 1/1 with no floating green", () => {
    const state = stateWith({ userBf: [OMNATH()], userPool: { G: 0 } });
    const omnath = state.players.user.battlefield[0];
    expect(creaturePower(omnath, state)).toBe(1);
    expect(creatureToughness(omnath, state)).toBe(1);
  });

  it("grows +1/+1 per unspent green (6/6 with 5 green floating)", () => {
    const state = stateWith({ userBf: [OMNATH()], userPool: { G: 5 } });
    const omnath = state.players.user.battlefield[0];
    expect(creaturePower(omnath, state)).toBe(6);
    expect(creatureToughness(omnath, state)).toBe(6);
  });

  it("without state, reads printed value only (no modifier)", () => {
    const state = stateWith({ userBf: [OMNATH()], userPool: { G: 5 } });
    const omnath = state.players.user.battlefield[0];
    expect(creaturePower(omnath)).toBe(1);
  });

  it("does not affect a non-registered creature", () => {
    const bear = perm("Grizzly Bears", "b1", "user", { power: 2, toughness: 2, type: "Creature — Bear" });
    const state = stateWith({ userBf: [bear], userPool: { G: 5 } });
    expect(creaturePower(state.players.user.battlefield[0], state)).toBe(2);
    // The static P/T half is now in the layer engine: a non-registered creature
    // with no continuous effects derives to its printed power (no green buff).
    expect(permanentPower(state, "b1")).toBe(2);
  });
});

describe("mana doesn't empty", () => {
  it("Omnath keeps green but not other colors", () => {
    const state = stateWith({ userBf: [OMNATH()], userPool: { G: 4, U: 2 } });
    expect(manaDoesNotEmpty(state, "user")).toEqual(["G"]);
    const after = emptyManaPools(state);
    expect(after.players.user.manaPool.G).toBe(4);
    expect(after.players.user.manaPool.U).toBe(0);
  });

  it("Kruphix keeps every color", () => {
    const kruphix = perm("Kruphix, God of Horizons", "k1", "user", { power: 4, toughness: 7, type: "Legendary Creature — God" });
    const state = stateWith({ userBf: [kruphix], userPool: { G: 3, U: 2, B: 1 } });
    const after = emptyManaPools(state);
    expect(after.players.user.manaPool.G).toBe(3);
    expect(after.players.user.manaPool.U).toBe(2);
    expect(after.players.user.manaPool.B).toBe(1);
  });
});

describe("Omnath in combat", () => {
  it("hits for its buffed power (green survives into combat)", () => {
    // Omnath attacking with 5 floating green = a 6/6; unblocked → 6 to the
    // defender. (Green doesn't empty, so it's still there at combat damage.)
    const state = stateWith({
      userBf: [OMNATH()],
      userPool: { G: 5 },
      aiLife: 40,
      combat: { attackers: [{ permanentId: "omn", attackingPlayer: "user", defender: "ai" }], blockers: [] },
    });
    const after = resolveCombatDamage(state);
    expect(after.players.ai.life).toBe(34); // 40 - 6
  });
});

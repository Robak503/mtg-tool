/**
 * layers.integration.test.js — the CR 613 layers engine VISIBLY changing
 * gameplay through the real engine (Phase-7 PR-12). These are the "anthems and
 * lords actually do something" tests that justify cutting v0.25.0:
 *   - granted keywords gate blocking (evasion) + drive combat resolution,
 *   - anthem-buffed P/T deals real combat damage,
 *   - until-end-of-turn layer effects wear off at the cleanup step (CR 514.2).
 */

import { describe, it, expect } from "vitest";
import { createGameState } from "./gameState.js";
import { resolveCombatDamage } from "./combatResolution.js";
import { legalActionsForPlayer, filterActions } from "./legalChoices.js";
import { runStepActions } from "./gameEngine.js";
import { addContinuousEffect, permanentPower } from "./layers.js";

function perm(name, id, controller, { power = 1, toughness = 1, type = "Creature", oracle = "", tapped = false, summoningSick = false } = {}) {
  return {
    id, card: { name, type, power, toughness, oracle }, controller, tapped, summoningSick,
    counters: {}, damageMarked: 0, attachments: [], attachedTo: null, timestamp: 0,
  };
}

function gameWith({ userBf = [], aiBf = [], combat, step, activePlayer = "ai", priorityHolder } = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...s,
    activePlayer,
    step: step ?? s.step,
    priorityHolder: priorityHolder ?? null,
    combat: combat ?? { attackers: [], blockers: [] },
    players: {
      ...s.players,
      user: { ...s.players.user, battlefield: userBf },
      ai: { ...s.players.ai, battlefield: aiBf },
    },
  };
}

describe("granted flying gates blocking (evasion respects grants)", () => {
  it("a ground creature can't block a granted-flying attacker, a reacher can", () => {
    const skyAnthem = perm("Levitation", "lev", "ai", { type: "Enchantment", oracle: "Creatures you control have flying." });
    const flyer = perm("Granted Flyer", "f1", "ai", { power: 2, toughness: 2 });
    const grounder = perm("Grizzly Bears", "g1", "user", { power: 2, toughness: 2, type: "Creature — Bear" });
    const spider = perm("Giant Spider", "sp", "user", { power: 2, toughness: 4, oracle: "Reach" });
    const state = gameWith({
      aiBf: [skyAnthem, flyer],
      userBf: [grounder, spider],
      step: "declare-blockers",
      activePlayer: "ai",
      priorityHolder: "user",
      combat: { attackers: [{ permanentId: "f1", attackingPlayer: "ai", defender: "user" }], blockers: [] },
    });

    const blocks = filterActions(legalActionsForPlayer(state, "user", { declaredAttackers: ["f1"] }), "declare-blocker");
    const blockerIds = blocks.map(b => b.permanentId);
    expect(blockerIds).not.toContain("g1"); // grounder can't block the flyer
    expect(blockerIds).toContain("sp");      // reach can
  });
});

describe("anthem-buffed power deals real combat damage", () => {
  it("a 1/1 buffed to 2/2 by an anthem hits for 2 unblocked", () => {
    const anthem = perm("Glorious Anthem", "an", "ai", { type: "Enchantment", oracle: "Creatures you control get +1/+1." });
    const attacker = perm("Soldier", "s1", "ai", { power: 1, toughness: 1 });
    const state = gameWith({
      aiBf: [anthem, attacker],
      activePlayer: "ai",
      combat: { attackers: [{ permanentId: "s1", attackingPlayer: "ai", defender: "user" }], blockers: [] },
    });
    expect(permanentPower(state, "s1")).toBe(2);
    const after = resolveCombatDamage(state);
    expect(after.players.user.life).toBe(38); // 40 - 2
  });
});

describe("granted deathtouch drives combat resolution", () => {
  it("a 1/1 blocker with granted deathtouch kills a 5/5 attacker", () => {
    const dtAnthem = perm("Deathtouch Aura", "dt", "user", { type: "Enchantment", oracle: "Creatures you control have deathtouch." });
    const chump = perm("Deadly Chump", "c1", "user", { power: 1, toughness: 1 });
    const bigAttacker = perm("Big Beast", "b1", "ai", { power: 5, toughness: 5 });
    const state = gameWith({
      aiBf: [bigAttacker],
      userBf: [dtAnthem, chump],
      activePlayer: "ai",
      combat: {
        attackers: [{ permanentId: "b1", attackingPlayer: "ai", defender: "user" }],
        blockers: [{ blockerId: "c1", attackerId: "b1" }],
      },
    });
    const after = resolveCombatDamage(state);
    // The 5/5 took 1 deathtouch damage → dies; the 1/1 took 5 → dies.
    expect(after.players.ai.battlefield.find(p => p.id === "b1")).toBeUndefined();
    expect(after.players.ai.graveyard.some(c => c.name === "Big Beast")).toBe(true);
    expect(after.players.user.battlefield.find(p => p.id === "c1")).toBeUndefined();
  });
});

describe("until-end-of-turn effects expire at cleanup (CR 514.2) through the engine", () => {
  it("a +3/+3 pump wears off when the cleanup step runs", () => {
    const creature = perm("Pumped Creature", "p1", "user", { power: 1, toughness: 1 });
    const base = gameWith({ userBf: [creature], step: "cleanup", activePlayer: "user" });
    const { state: pumped } = addContinuousEffect(base, {
      layer: 7, sublayer: "7c", op: { layerOp: "ptModify", power: 3, toughness: 3 },
      affects: { mode: "fixed", permanentIds: ["p1"] }, duration: { kind: "endOfTurn", turn: base.turn },
      source: { kind: "resolution", permanentId: null, cardName: "Giant Growth" },
    });
    expect(permanentPower(pumped, "p1")).toBe(4);
    const afterCleanup = runStepActions(pumped);
    expect(afterCleanup.continuousEffects).toEqual([]);
    expect(permanentPower(afterCleanup, "p1")).toBe(1);
  });
});

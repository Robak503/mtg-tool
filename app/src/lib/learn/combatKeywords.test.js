/**
 * PR 11.1 — combat keyword behavior + the isCreatureCard real-card fix.
 *
 * Covers: creatures with `.type` (not type_line) actually dying, trample,
 * deathtouch, lifelink, first strike + double strike (two-step), and flying
 * blocking legality.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { createGameState, _resetIdsForTests } from "./gameState.js";
import { resolveCombatDamage } from "./combatResolution.js";
import { legalActionsForPlayer, filterActions } from "./legalChoices.js";

beforeEach(() => _resetIdsForTests());

function cr(name, id, controller, { power = 2, toughness = 2, oracle = "", type = "Creature — Bear", tapped = false, summoningSick = false } = {}) {
  return { id, card: { name, type, power, toughness, oracle }, controller, tapped, summoningSick, counters: {}, damageMarked: 0, attachments: [], attachedTo: null };
}

function st({ userBf = [], aiBf = [], userLife = 40, aiLife = 40, attackers = [], blockers = [], step = "combat-damage" } = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...s,
    step,
    phase: "combat",
    combat: { attackers, blockers },
    players: {
      ...s.players,
      user: { ...s.players.user, battlefield: userBf, life: userLife },
      ai: { ...s.players.ai, battlefield: aiBf, life: aiLife },
    },
  };
}

const grave = (s, pid) => s.players[pid].graveyard.map(c => c.name);

describe("isCreatureCard real-card fix", () => {
  it("creatures defined with `.type` (not type_line) actually die in combat", () => {
    // The latent bug: isCreatureCard checked only type_line, so real deck cards
    // (which use `type`) never got judged for lethal damage.
    const state = st({
      userBf: [cr("Grizzly", "g1", "user", { power: 2, toughness: 2 })],
      aiBf: [cr("Bear", "b1", "ai", { power: 2, toughness: 2 })],
      attackers: [{ permanentId: "g1", attackingPlayer: "user", defender: "ai" }],
      blockers: [{ blockerId: "b1", blockingPlayer: "ai", attackerId: "g1" }],
    });
    const after = resolveCombatDamage(state);
    expect(grave(after, "user")).toEqual(["Grizzly"]);
    expect(grave(after, "ai")).toEqual(["Bear"]);
  });
});

describe("trample", () => {
  it("spills excess over the blocker's toughness to the defender", () => {
    const state = st({
      userBf: [cr("Tromper", "t1", "user", { power: 5, toughness: 5, oracle: "Trample" })],
      aiBf: [cr("Wall", "w1", "ai", { power: 0, toughness: 2 })],
      aiLife: 40,
      attackers: [{ permanentId: "t1", attackingPlayer: "user", defender: "ai" }],
      blockers: [{ blockerId: "w1", blockingPlayer: "ai", attackerId: "t1" }],
    });
    const after = resolveCombatDamage(state);
    expect(grave(after, "ai")).toEqual(["Wall"]); // 2 lethal to the wall
    expect(after.players.ai.life).toBe(37);        // 3 trampled over
  });
});

describe("deathtouch", () => {
  it("any damage is lethal — a 1/1 deathtoucher trades with a 5/5", () => {
    const state = st({
      userBf: [cr("Snake", "s1", "user", { power: 1, toughness: 1, oracle: "Deathtouch" })],
      aiBf: [cr("Giant", "g1", "ai", { power: 5, toughness: 5 })],
      attackers: [{ permanentId: "s1", attackingPlayer: "user", defender: "ai" }],
      blockers: [{ blockerId: "g1", blockingPlayer: "ai", attackerId: "s1" }],
    });
    const after = resolveCombatDamage(state);
    expect(grave(after, "ai")).toEqual(["Giant"]);  // 1 deathtouch damage kills it
    expect(grave(after, "user")).toEqual(["Snake"]); // 5 back kills the snake
  });
});

describe("lifelink", () => {
  it("the dealer's controller gains life equal to damage dealt", () => {
    const state = st({
      userBf: [cr("Cleric", "c1", "user", { power: 3, toughness: 3, oracle: "Lifelink" })],
      userLife: 40,
      aiLife: 40,
      attackers: [{ permanentId: "c1", attackingPlayer: "user", defender: "ai" }], // unblocked
    });
    const after = resolveCombatDamage(state);
    expect(after.players.ai.life).toBe(37);   // 3 damage
    expect(after.players.user.life).toBe(43); // +3 lifelink
  });
});

describe("first strike", () => {
  it("a first-striker kills its blocker before taking damage back", () => {
    const fsState = st({
      step: "first-strike-damage",
      userBf: [cr("Knight", "k1", "user", { power: 2, toughness: 2, oracle: "First strike" })],
      aiBf: [cr("Goblin", "go1", "ai", { power: 2, toughness: 2 })],
      attackers: [{ permanentId: "k1", attackingPlayer: "user", defender: "ai" }],
      blockers: [{ blockerId: "go1", blockingPlayer: "ai", attackerId: "k1" }],
    });
    // First-strike step: knight deals 2, goblin dies; goblin (no FS) deals nothing.
    const afterFS = resolveCombatDamage(fsState, { firstStrikeStep: true });
    expect(grave(afterFS, "ai")).toEqual(["Goblin"]);
    // Regular step: goblin is gone, knight already dealt — knight survives unscathed.
    const afterReg = resolveCombatDamage(afterFS, { firstStrikeStep: false });
    expect(grave(afterReg, "user")).toEqual([]);
    const knight = afterReg.players.user.battlefield.find(p => p.id === "k1");
    expect(knight.damageMarked).toBe(0);
  });
});

describe("double strike", () => {
  it("an unblocked double-striker deals damage twice", () => {
    const base = {
      step: "first-strike-damage",
      userBf: [cr("Blademaster", "bm", "user", { power: 2, toughness: 2, oracle: "Double strike" })],
      aiLife: 40,
      attackers: [{ permanentId: "bm", attackingPlayer: "user", defender: "ai" }], // unblocked
    };
    const afterFS = resolveCombatDamage(st(base), { firstStrikeStep: true });
    expect(afterFS.players.ai.life).toBe(38); // first 2
    const afterReg = resolveCombatDamage(afterFS, { firstStrikeStep: false });
    expect(afterReg.players.ai.life).toBe(36); // second 2
  });
});

describe("flying blocking legality", () => {
  it("a non-flyer can't block a flyer, but flying/reach can", () => {
    const state = {
      ...st({
        step: "declare-blockers",
        userBf: [cr("Drake", "d1", "user", { power: 2, toughness: 2, oracle: "Flying" })],
        aiBf: [
          cr("Groundling", "ai-g", "ai", { power: 2, toughness: 2 }),
          cr("Spider", "ai-s", "ai", { power: 1, toughness: 3, oracle: "Reach" }),
          cr("Bird", "ai-b", "ai", { power: 1, toughness: 1, oracle: "Flying" }),
        ],
        attackers: [{ permanentId: "d1", attackingPlayer: "user", defender: "ai" }],
      }),
      activePlayer: "user",
      priorityHolder: "ai",
    };
    const blocks = filterActions(legalActionsForPlayer(state, "ai"), "declare-blocker");
    const blockerIds = blocks.map(b => b.permanentId);
    expect(blockerIds).not.toContain("ai-g");  // groundling can't block the flyer
    expect(blockerIds).toContain("ai-s");       // reach can
    expect(blockerIds).toContain("ai-b");       // flying can
  });
});

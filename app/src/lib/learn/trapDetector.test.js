/**
 * Tests for trapDetector — Phase 6 PR 7 (Intermediate mode trap warnings).
 *
 * Each detector is exercised in isolation; the public detectAttackTraps()
 * is exercised as a small integration that confirms ordering by severity
 * and that multiple detectors can fire together.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import {
  detectAttackTraps,
  detectCounterAttackLethal,
  detectInstantSpeedResponse,
} from "./trapDetector.js";

function card({ name, type, power, toughness, oracle = "", keywords = [] }) {
  return {
    id: `card-${name}`,
    name,
    type,
    oracle,
    keywords,
    ...(power !== undefined ? { power } : {}),
    ...(toughness !== undefined ? { toughness } : {}),
  };
}

function withBoard(state, playerId, permanents) {
  return {
    ...state,
    players: {
      ...state.players,
      [playerId]: {
        ...state.players[playerId],
        battlefield: permanents,
      },
    },
  };
}

function withHand(state, playerId, hand) {
  return {
    ...state,
    players: {
      ...state.players,
      [playerId]: { ...state.players[playerId], hand },
    },
  };
}

function withLife(state, playerId, life) {
  return {
    ...state,
    players: {
      ...state.players,
      [playerId]: { ...state.players[playerId], life },
    },
  };
}

function makeState() {
  return createGameState({ userDeck: [], aiDeck: [] });
}

function island(tapped = false) {
  return createPermanent({ card: card({ name: "Island", type: "Basic Land — Island" }), controller: "ai", tapped });
}

function forestUser(tapped = false) {
  return createPermanent({ card: card({ name: "Forest", type: "Basic Land — Forest" }), controller: "user", tapped });
}

function bear(controller, opts = {}) {
  const c = card({
    name: opts.name || "Grizzly Bears",
    type: "Creature — Bear",
    power: opts.power ?? 2,
    toughness: opts.toughness ?? 2,
    oracle: opts.oracle || "",
    keywords: opts.keywords || [],
  });
  return createPermanent({
    card: c,
    controller,
    tapped: opts.tapped || false,
    summoningSick: opts.summoningSick ?? false,
  });
}

beforeEach(() => { _resetIdsForTests(); });

// ─── detectInstantSpeedResponse ─────────────────────────────────────────────

describe("detectInstantSpeedResponse", () => {
  it("returns null when opponent has fewer than 2 untapped lands", () => {
    let s = withBoard(makeState(), "ai", [island(false)]);
    s = withHand(s, "ai", [card({ name: "Mystery", type: "Instant" })]);
    expect(detectInstantSpeedResponse(s, "ai")).toBeNull();
  });

  it("returns null when opponent's hand is empty", () => {
    const s = withBoard(makeState(), "ai", [island(false), island(false), island(false)]);
    expect(detectInstantSpeedResponse(s, "ai")).toBeNull();
  });

  it("returns warn when opponent has 2 untapped lands + 1 card", () => {
    let s = withBoard(makeState(), "ai", [island(false), island(false), island(true)]);
    s = withHand(s, "ai", [card({ name: "Mystery", type: "Instant" })]);
    const trap = detectInstantSpeedResponse(s, "ai");
    expect(trap).not.toBeNull();
    expect(trap.severity).toBe("warn");
    expect(trap.type).toBe("instant-speed-response");
    expect(trap.message).toContain("2 untapped lands");
    expect(trap.message).toContain("1 card");
    expect(trap.details).toEqual({ lands: 2, cards: 1 });
  });

  it("escalates to danger when opponent has 4+ untapped lands AND 2+ cards", () => {
    let s = withBoard(makeState(), "ai", [island(false), island(false), island(false), island(false)]);
    s = withHand(s, "ai", [
      card({ name: "A", type: "Instant" }),
      card({ name: "B", type: "Instant" }),
    ]);
    const trap = detectInstantSpeedResponse(s, "ai");
    expect(trap.severity).toBe("danger");
    expect(trap.details).toEqual({ lands: 4, cards: 2 });
  });

  it("ignores tapped lands when counting open mana", () => {
    let s = withBoard(makeState(), "ai", [island(true), island(true), island(false)]);
    s = withHand(s, "ai", [card({ name: "Mystery", type: "Instant" })]);
    expect(detectInstantSpeedResponse(s, "ai")).toBeNull();
  });
});

// ─── detectCounterAttackLethal ──────────────────────────────────────────────

describe("detectCounterAttackLethal", () => {
  it("returns null when opponent has no untapped ready creatures", () => {
    const s = withBoard(makeState(), "ai", []);
    expect(detectCounterAttackLethal(s, "user", [{ permanentId: "perm-1" }])).toBeNull();
  });

  it("returns null when attackerActions is empty", () => {
    let s = withBoard(makeState(), "ai", [bear("ai", { power: 5 })]);
    expect(detectCounterAttackLethal(s, "user", [])).toBeNull();
  });

  it("flags danger when committed attackers leave no defenders + opponent has lethal counter-swing", () => {
    const userBear = bear("user", { name: "Llanowar Elves", power: 1, toughness: 1 });
    const aiBear = bear("ai", { name: "Skyship", power: 5, toughness: 4 });
    let s = withBoard(makeState(), "user", [userBear]);
    s = withBoard(s, "ai", [aiBear]);
    s = withLife(s, "user", 5);
    const trap = detectCounterAttackLethal(s, "user", [{ permanentId: userBear.id }]);
    expect(trap).not.toBeNull();
    expect(trap.severity).toBe("danger");
    expect(trap.message).toContain("lethal");
    expect(trap.details.exposed).toBe(5);
  });

  it("returns warn when exposed damage is >= half your life but not lethal", () => {
    const aiBear = bear("ai", { name: "Skyship", power: 6, toughness: 4 });
    let s = withBoard(makeState(), "user", []);  // no defenders staying home
    s = withBoard(s, "ai", [aiBear]);
    // life=10 so exposed=6 fires warn (6*2 >= 10) but not danger (6 < 10).
    s = withLife(s, "user", 10);
    const trap = detectCounterAttackLethal(s, "user", [{ permanentId: "perm-anything" }]);
    expect(trap).not.toBeNull();
    expect(trap.severity).toBe("warn");
    expect(trap.type).toBe("counter-attack-dangerous");
  });

  it("returns null when staying-home blockers can soak the counter-swing", () => {
    const userBear = bear("user", { name: "Big", power: 1, toughness: 5 });
    const aiBear = bear("ai", { name: "Small", power: 2, toughness: 2 });
    let s = withBoard(makeState(), "user", [userBear]);
    s = withBoard(s, "ai", [aiBear]);
    s = withLife(s, "user", 20);
    // attacker plan does NOT include userBear, so it's a blocker.
    const trap = detectCounterAttackLethal(s, "user", [{ permanentId: "perm-other" }]);
    expect(trap).toBeNull();
  });

  it("ignores tapped opponent creatures (can't swing this turn-cycle)", () => {
    const aiBear = bear("ai", { name: "Tapped", power: 10, toughness: 10, tapped: true });
    let s = withBoard(makeState(), "ai", [aiBear]);
    s = withLife(s, "user", 5);
    expect(detectCounterAttackLethal(s, "user", [{ permanentId: "perm-x" }])).toBeNull();
  });

  it("ignores summoning-sick opponent creatures without Haste", () => {
    const sick = bear("ai", { name: "Sick", power: 10, summoningSick: true });
    let s = withBoard(makeState(), "ai", [sick]);
    s = withLife(s, "user", 5);
    expect(detectCounterAttackLethal(s, "user", [{ permanentId: "perm-x" }])).toBeNull();
  });

  it("counts a summoning-sick creature WITH Haste keyword on its oracle", () => {
    const hasty = bear("ai", { name: "Hasty", power: 10, oracle: "Haste", summoningSick: true });
    let s = withBoard(makeState(), "ai", [hasty]);
    s = withLife(s, "user", 5);
    const trap = detectCounterAttackLethal(s, "user", [{ permanentId: "perm-x" }]);
    expect(trap?.severity).toBe("danger");
  });

  it("counts a summoning-sick creature with Haste in keywords array", () => {
    const hasty = bear("ai", { name: "Hasty2", power: 10, keywords: ["Haste"], summoningSick: true });
    let s = withBoard(makeState(), "ai", [hasty]);
    s = withLife(s, "user", 5);
    const trap = detectCounterAttackLethal(s, "user", [{ permanentId: "perm-x" }]);
    expect(trap?.severity).toBe("danger");
  });
});

// ─── detectAttackTraps integration ──────────────────────────────────────────

describe("detectAttackTraps (public entry)", () => {
  it("returns empty when board is quiet", () => {
    const s = makeState();
    expect(detectAttackTraps(s, "user", [{ permanentId: "perm-x" }])).toEqual([]);
  });

  it("returns danger trap first when both fire", () => {
    // Opponent has a fat untapped attacker (lethal swing-back) + 4 lands + 2 in hand
    // (danger instant-speed). detectAttackTraps should sort danger ahead of warn.
    const aiBear = bear("ai", { name: "Big", power: 20, toughness: 4 });
    let s = withBoard(makeState(), "ai", [aiBear, island(false), island(false), island(false), island(false)]);
    s = withHand(s, "ai", [
      card({ name: "A", type: "Instant" }),
      card({ name: "B", type: "Instant" }),
    ]);
    s = withLife(s, "user", 5);
    const traps = detectAttackTraps(s, "user", [{ permanentId: "perm-x" }]);
    expect(traps.length).toBeGreaterThanOrEqual(2);
    expect(traps[0].severity).toBe("danger");
    expect(traps[0].type).toMatch(/lethal|response/);
  });

  it("rejects invalid input gracefully (no state, no playerId)", () => {
    expect(detectAttackTraps(null, "user", [])).toEqual([]);
    expect(detectAttackTraps(makeState(), null, [])).toEqual([]);
  });

  it("flips defenderId correctly when attackerPlayerId is ai", () => {
    // User has 4 untapped lands + 2 in hand. AI is attacking. AI should
    // see the user as the defender and surface instant-speed danger.
    let s = withBoard(makeState(), "user", [
      forestUser(false), forestUser(false), forestUser(false), forestUser(false),
    ]);
    s = withHand(s, "user", [
      card({ name: "A", type: "Instant" }),
      card({ name: "B", type: "Instant" }),
    ]);
    const traps = detectAttackTraps(s, "ai", [{ permanentId: "perm-x" }]);
    expect(traps.some(t => t.type === "instant-speed-response")).toBe(true);
  });
});

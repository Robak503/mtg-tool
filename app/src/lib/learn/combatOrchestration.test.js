/**
 * PR 10.3 tests — combat orchestration.
 *
 * The original "engine got stuck" bug: the user's intermediate auto-attack
 * re-declared the same creature forever (declared attackers were never
 * excluded) and the AI never attacked at all (pickAttackPlan/pickBlockPlan
 * were never called by the driver). These tests prove both are fixed, plus
 * tap-on-attack (with the vigilance exception) and the declared-set exclusion.
 */

import { describe, expect, it, beforeEach } from "vitest";
import { createGameState, _resetIdsForTests } from "./gameState.js";
import { advanceUntilDecision } from "./learnSession.js";
import { legalActionsForPlayer, filterActions } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { pickAction } from "./opponentAI.js";

beforeEach(() => _resetIdsForTests());

function creature(name, id, controller, { power = 2, toughness = 2, tapped = false, summoningSick = false, keywords = [] } = {}) {
  return {
    id,
    card: { name, type: "Creature — Bear", power, toughness, keywords, oracle: "" },
    controller,
    tapped,
    summoningSick,
    counters: {},
    damageMarked: 0,
    attachments: [],
    attachedTo: null,
  };
}

function buildState({ phase = "combat", step = "declare-attackers", activePlayer = "user", priorityHolder = "user", userBf = [], aiBf = [], userLife = 40, aiLife = 40, combat = { attackers: [], blockers: [] } } = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...s,
    startingPlayer: "user",
    phase,
    step,
    activePlayer,
    priorityHolder,
    consecutivePasses: 0,
    combat,
    players: {
      ...s.players,
      user: { ...s.players.user, battlefield: userBf, life: userLife },
      ai: { ...s.players.ai, battlefield: aiBf, life: aiLife },
    },
  };
}

function session(state, difficulty = "intermediate") {
  return { id: "t", difficulty, mode: "standard", decisionLog: [], status: "active", state };
}

// ─── Unit: tapping on attack ─────────────────────────────────────────────────

describe("applyDeclareAttacker — tapping", () => {
  it("taps the attacker on declaration", () => {
    const state = buildState({ userBf: [creature("Grizzly Bears", "b1", "user")] });
    const after = dispatchAction(state, { kind: "declare-attacker", playerId: "user", permanentId: "b1" });
    expect(after.players.user.battlefield[0].tapped).toBe(true);
    expect(after.combat.attackers).toHaveLength(1);
  });

  it("does NOT tap a vigilance attacker", () => {
    const state = buildState({ userBf: [creature("Serra Angel", "s1", "user", { keywords: ["Vigilance"] })] });
    const after = dispatchAction(state, { kind: "declare-attacker", playerId: "user", permanentId: "s1" });
    expect(after.players.user.battlefield[0].tapped).toBe(false);
    expect(after.combat.attackers).toHaveLength(1);
  });
});

// ─── Unit: declared-set exclusion ────────────────────────────────────────────

describe("declared-attacker exclusion", () => {
  it("excludes a creature already in combat.attackers (vigilance loop guard)", () => {
    const state = buildState({
      userBf: [creature("Serra Angel", "s1", "user", { keywords: ["Vigilance"] })],
      combat: { attackers: [{ permanentId: "s1", attackingPlayer: "user", defender: "ai" }], blockers: [] },
    });
    // Even though the vigilance angel is untapped, it's already attacking, so
    // it is NOT offered again — this is what stops the infinite re-declare.
    const attacks = filterActions(legalActionsForPlayer(state, "user"), "declare-attacker");
    expect(attacks).toHaveLength(0);
  });
});

// ─── Unit: AI combat ─────────────────────────────────────────────────────────

describe("pickAction — combat-aware", () => {
  it("returns a declare-attacker during the declare-attackers step", () => {
    const state = buildState({ activePlayer: "ai", priorityHolder: "ai", aiBf: [creature("Bear", "ab", "ai")] });
    const actions = legalActionsForPlayer(state, "ai");
    const picked = pickAction(state, "ai", actions);
    expect(picked.kind).toBe("declare-attacker");
    expect(picked.permanentId).toBe("ab");
  });

  it("returns a declare-blocker during the declare-blockers step", () => {
    const state = buildState({
      step: "declare-blockers",
      activePlayer: "user",
      priorityHolder: "ai",
      userBf: [],
      aiBf: [creature("Blocker", "blk", "ai")],
      combat: { attackers: [{ permanentId: "att", attackingPlayer: "user", defender: "ai" }], blockers: [] },
    });
    // The user is attacking with "att"; the AI (defender) should block.
    const actions = legalActionsForPlayer(state, "ai");
    const picked = pickAction(state, "ai", actions);
    expect(picked.kind).toBe("declare-blocker");
    expect(picked.attackerId).toBe("att");
  });
});

// ─── Integration: bounded full combats ───────────────────────────────────────

describe("end-to-end combat through advanceUntilDecision", () => {
  it("user intermediate auto-attack drains (no engine-stuck) and wins on lethal", () => {
    const state = buildState({
      activePlayer: "user",
      priorityHolder: "user",
      userBf: [creature("Grizzly Bears", "b1", "user")], // 2 power, untapped, not sick
      aiBf: [],
      aiLife: 1, // lethal to a 2-power swing
    });
    const { session: out, decision } = advanceUntilDecision(session(state, "intermediate"));
    expect(decision.kind).not.toBe("engine-stuck"); // the original bug
    expect(out.status).toBe("user-wins");
    expect(decision.kind).toBe("game-over");
  });

  it("the AI actually attacks and can win", () => {
    const state = buildState({
      activePlayer: "ai",
      priorityHolder: "ai",
      userBf: [], // no blockers, so the user just takes it
      aiBf: [creature("Bear", "ab", "ai")],
      userLife: 1,
    });
    const { session: out, decision } = advanceUntilDecision(session(state, "intermediate"));
    expect(decision.kind).not.toBe("engine-stuck");
    expect(out.status).toBe("ai-wins");
  });
});

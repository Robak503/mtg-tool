import { describe, it, expect } from "vitest";

import { createPermanent } from "./gameState.js";
import { pickAttackPlan } from "./opponentAI.js";
import { detectCounterAttackLethal } from "./trapDetector.js";

const SEATS = ["user", "ai1", "ai2", "ai3"];

function creature(name, power, toughness, controller, { tapped = false, summoningSick = false } = {}) {
  return {
    ...createPermanent({ card: { id: `${name}-c`, name, power, toughness, type_line: "Creature" }, controller }),
    tapped,
    summoningSick,
  };
}

function commanderState({ life = {}, battlefield = {}, activePlayer = "ai1", step = "declare-attackers" } = {}) {
  const players = {};
  for (const id of SEATS) {
    players[id] = {
      life: life[id] ?? 40,
      battlefield: battlefield[id] || [],
      hand: [],
      graveyard: [],
      manaPool: {},
      commanderDamageFrom: {},
    };
  }
  return { turnOrder: SEATS, players, activePlayer, step, turn: 5, log: [] };
}

// One declare-attacker action per (creature, defender) — the Commander shape.
function perDefenderActions(aiId, permanentIds, defenders) {
  const out = [];
  for (const pid of permanentIds) {
    for (const def of defenders) out.push({ kind: "declare-attacker", playerId: aiId, permanentId: pid, name: pid, defenderId: def });
  }
  return out;
}

describe("pickAttackPlan — defender heuristic (Commander)", () => {
  it("focuses all attackers on the lowest-life opponent, one action per creature", () => {
    const state = commanderState({ life: { user: 40, ai2: 9, ai3: 40 } });
    const actions = perDefenderActions("ai1", ["c1", "c2"], ["user", "ai2", "ai3"]);
    const plan = pickAttackPlan(state, "ai1", actions);
    expect(plan).toHaveLength(2); // one per creature, not one per (creature×defender)
    expect(plan.every(a => a.defenderId === "ai2")).toBe(true);
  });

  it("breaks a life tie by attacking the opponent with fewer untapped blockers", () => {
    const state = commanderState({
      life: { user: 10, ai2: 10, ai3: 40 },
      battlefield: { user: [], ai2: [creature("Guard", 2, 2, "ai2")] }, // ai2 has a blocker, user has none
    });
    const actions = perDefenderActions("ai1", ["c1"], ["user", "ai2", "ai3"]);
    const plan = pickAttackPlan(state, "ai1", actions);
    expect(plan[0].defenderId).toBe("user");
  });

  it("Standard actions (no defenderId) pass through unchanged", () => {
    const state = commanderState();
    const actions = [{ kind: "declare-attacker", playerId: "ai1", permanentId: "c1" }];
    expect(pickAttackPlan(state, "ai1", actions)).toEqual(actions);
  });
});

describe("detectCounterAttackLethal — all opponents (Commander)", () => {
  it("flags a NON-attacked opponent who can swing back lethal", () => {
    const myAttacker = creature("Striker", 3, 3, "user");
    const state = commanderState({
      activePlayer: "user",
      step: "declare-attackers",
      life: { user: 5 },
      battlefield: {
        user: [myAttacker],                               // committed to the attack
        ai1: [],                                          // the player you hit — harmless
        ai2: [creature("Hulk", 6, 6, "ai2")],             // a different opponent — lethal back
      },
    });
    const warn = detectCounterAttackLethal(state, "user", [{ permanentId: myAttacker.id }]);
    expect(warn).not.toBeNull();
    expect(warn.severity).toBe("danger");
    expect(warn.details.opponent).toBe("ai2");
  });

  it("returns null when no opponent can punish", () => {
    const myAttacker = creature("Striker", 3, 3, "user");
    const state = commanderState({
      activePlayer: "user",
      life: { user: 40 },
      battlefield: { user: [myAttacker] }, // opponents have empty boards
    });
    expect(detectCounterAttackLethal(state, "user", [{ permanentId: myAttacker.id }])).toBeNull();
  });
});

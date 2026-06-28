/**
 * mustAttack.test.js — SUBSYSTEM 4: MUST-ATTACK (CR 508.1a).
 *
 * "<this creature> attacks each combat/turn if able" is a static combat REQUIREMENT. The card is now
 * (a) classified native (coverage.isKeywordOnly recognizes the requirement clause) AND (b) ENFORCED:
 * opponentAI.pickAttackPlan force-declares an eligible must-attack creature as an attacker even when the
 * profitability filter would hold it back — because NOT attacking with it would be illegal (a requirement,
 * not a restriction). Recognition without enforcement would over-permit the illegal "don't attack", so
 * both halves ship together.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { classifyCard } from "./coverage.js";
import { pickAttackPlan } from "./opponentAI.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const cr = (name, oracle) => ({ name, type: "Creature — Goblin", power: 1, toughness: 1, oracle });

describe("MUST-ATTACK (subsystem 4) — recognition", () => {
  it("a self must-attack requirement classifies native (keyword-only / + modeled keywords)", () => {
    expect(classifyCard(cr("Crazed Goblin", "Crazed Goblin attacks each combat if able."))).toBe("native-body");
    expect(classifyCard(cr("Tattermunge Maniac", "Tattermunge Maniac attacks each turn if able."))).toBe("native-body");
    expect(classifyCard(cr("Ashen Monstrosity", "Haste\nAshen Monstrosity attacks each combat if able."))).toBe("native-body");
  });
  it("FN boundary: a GROUP must-attack form is NOT this slice (stays Arbiter)", () => {
    expect(classifyCard(cr("Group", "Creatures you control attack each combat if able."))).toBe("body-only");
  });
});

describe("MUST-ATTACK (subsystem 4) — enforcement in pickAttackPlan", () => {
  // AI at safe life with an unprofitable attack (a 1/1 into a 3/3 untapped blocker): the racer holds back
  // a NON-must 1/1, but MUST-attack forces the must-1/1 to be declared anyway.
  function board(attackerOracle) {
    const atk = createPermanent({ id: "atk", card: { name: "Goblin", type: "Creature — Goblin", power: 1, toughness: 1, oracle: attackerOracle }, controller: "ai", summoningSick: false });
    const blk = createPermanent({ id: "blk", card: { name: "Ogre", type: "Creature — Ogre", power: 3, toughness: 3, oracle: "" }, controller: "user", summoningSick: false });
    const g = createGameState({ userDeck: [], aiDeck: [] });
    return { ...g, activePlayer: "ai", priorityHolder: "ai", phase: "combat", step: "declare-attackers", players: { ...g.players, ai: { ...g.players.ai, battlefield: [atk], life: 20 }, user: { ...g.players.user, battlefield: [blk], life: 20 } } };
  }
  const planFor = (s) => pickAttackPlan(s, "ai", legalActionsForPlayer(s, "ai").filter((a) => a.kind === "declare-attacker"));

  it("force-declares an unprofitable MUST-ATTACK creature", () => {
    const plan = planFor(board("Goblin attacks each combat if able."));
    expect(plan.some((a) => a.permanentId === "atk")).toBe(true);
  });
  it("a non-must unprofitable 1/1 is held back by the racer (isolates the force-include)", () => {
    const plan = planFor(board(""));   // same board, no must-attack
    expect(plan.some((a) => a.permanentId === "atk")).toBe(false);
  });
  it("a SUMMONING-SICK must-attack creature is not force-declared (it isn't 'able')", () => {
    const s = board("Goblin attacks each combat if able.");
    s.players.ai.battlefield[0].summoningSick = true;
    const plan = planFor(s);
    expect(plan.some((a) => a.permanentId === "atk")).toBe(false);   // not eligible → not in attackerActions → not forced
  });
});

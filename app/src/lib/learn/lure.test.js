/**
 * lure.test.js — BLITZ LU-1: "All creatures able to block this creature do so." (CR 509.1c — Taunting
 * Elf / Prized Unicorn / Elvish Bard / Breaker of Armies / Ochran Assassin / Treeshaker Chimera).
 * A BLOCK REQUIREMENT enforced at the AI block plan (opponentAI.pickBlockers force-assigns every
 * offered — i.e. legal — blocker of a lure-carrying attacker before the value heuristic), the SAME
 * versioned bar as MUST-ATTACK (CR 508.1a) at pickAttackPlan; coverage credits the line on exactly
 * that basis. The offered-actions surface already encodes "able" (canBlockAttacker gates upstream),
 * so restrictions are never overridden (CR 509.1c). Real oracle fixtures (bundled Scryfall, 2026-07-16).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState } from "./gameState.js";
import { pickBlockPlan } from "./opponentAI.js";
import { classifyCard, isKeywordOnly } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const LURE_LINE = "All creatures able to block this creature do so.";

function makePerm({ id, power = 1, toughness = 1, controller = "user", oracle = "" }) {
  return {
    id, card: { id: `c-${id}`, name: id, type: "Creature — Beast", power: String(power), toughness: String(toughness), oracle },
    controller, tapped: false, summoningSick: false, counters: {}, attachments: [], attachedTo: null,
  };
}
function blockState({ aiCreatures, userAttackers }) {
  const base = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...base,
    activePlayer: "user", phase: "combat", step: "declare-blockers", priorityHolder: "ai",
    combat: { attackers: userAttackers.map((p) => ({ permanentId: p.id, attackingPlayer: "user", defender: "ai" })), blockers: [] },
    players: {
      user: { ...base.players.user, battlefield: userAttackers },
      ai: { ...base.players.ai, battlefield: aiCreatures },
    },
  };
}
const blk = (blockerId, attackerId) => ({ kind: "declare-blocker", permanentId: blockerId, attackerId, name: blockerId });

describe("classify — the credit at the MUST-ATTACK bar", () => {
  it("the six exact-form carriers flip; scoped/spell variants stay off", () => {
    expect(classifyCard({ id: "te", name: "Taunting Elf", type: "Creature — Elf", power: "0", toughness: "1", mana: "{G}", oracle: LURE_LINE })).toBe("native-body");
    expect(classifyCard({ id: "oa", name: "Ochran Assassin", type: "Creature — Elf Assassin", power: "1", toughness: "1", mana: "{1}{B}{G}", oracle: "Deathtouch\n" + LURE_LINE })).toBe("native-body");
    expect(classifyCard({ id: "tc", name: "Treeshaker Chimera", type: "Creature — Chimera", power: "8", toughness: "5", mana: "{5}{G}",
      oracle: LURE_LINE + "\nWhen this creature dies, draw three cards." })).toBe("native-trigger");
    // The this-turn / targeted / "it" variants are DIFFERENT shapes — never credited by the exact anchor.
    expect(isKeywordOnly("All creatures able to block this creature this turn do so.", "Mortipede")).toBe(false);
    expect(classifyCard({ id: "as", name: "Alluring Scent", type: "Sorcery", mana: "{1}{G}{G}", oracle: "All creatures able to block target creature this turn do so." })).toBe("arbiter-spell");
  });
});

describe("runtime — the AI block plan complies (CR 509.1c at the MUST-ATTACK bar)", () => {
  it("EVERY able blocker is force-assigned to the lured attacker; none left for value declines", () => {
    const s = blockState({
      aiCreatures: [makePerm({ id: "b1", power: 1, toughness: 1, controller: "ai" }), makePerm({ id: "b2", power: 3, toughness: 3, controller: "ai" })],
      userAttackers: [makePerm({ id: "lure", power: 0, toughness: 1, oracle: LURE_LINE })],
    });
    const plan = pickBlockPlan(s, "ai", [blk("b1", "lure"), blk("b2", "lure")]);
    expect(plan.map((a) => a.permanentId).sort()).toEqual(["b1", "b2"]); // ALL able blockers — not the value pick
  });
  it("an unlured co-attacker still gets the normal plan from the REMAINING blockers only", () => {
    const s = blockState({
      aiCreatures: [makePerm({ id: "b1", power: 2, toughness: 2, controller: "ai" }), makePerm({ id: "b2", power: 3, toughness: 3, controller: "ai" })],
      userAttackers: [makePerm({ id: "lure", power: 0, toughness: 1, oracle: LURE_LINE }), makePerm({ id: "bear", power: 2, toughness: 2 })],
    });
    // Both blockers CAN block either attacker; the lure eats both, so the bear goes unblocked.
    const plan = pickBlockPlan(s, "ai", [blk("b1", "lure"), blk("b2", "lure"), blk("b1", "bear"), blk("b2", "bear")]);
    expect(plan.filter((a) => a.attackerId === "lure").map((a) => a.permanentId).sort()).toEqual(["b1", "b2"]);
    expect(plan.filter((a) => a.attackerId === "bear")).toHaveLength(0);
  });
  it("a blocker NOT offered against the lure (unable — cantBlock/evasion upstream) is never forced", () => {
    const s = blockState({
      aiCreatures: [makePerm({ id: "b1", power: 1, toughness: 1, controller: "ai" }), makePerm({ id: "grounded", power: 2, toughness: 2, controller: "ai" })],
      userAttackers: [makePerm({ id: "lure", power: 0, toughness: 1, oracle: LURE_LINE })],
    });
    // "grounded" has no offered action vs the lure (upstream legality said no) — only b1 is forced.
    const plan = pickBlockPlan(s, "ai", [blk("b1", "lure")]);
    expect(plan.map((a) => a.permanentId)).toEqual(["b1"]);
  });
});

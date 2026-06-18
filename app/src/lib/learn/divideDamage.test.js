/**
 * divideDamage.test.js — MT-1 ENGINE CORE (divide-damage), step 1 of the subsystem.
 *
 * "Deals N damage divided as you choose among any number of target creatures/players" (Boulderfall,
 * Mythos of Vadrok, Meteor Swarm). The division is a RESOLUTION-time pending-choice (cast-time
 * enumeration of "any number of targets × every split" would explode the action list). This file pins
 * the three engine pieces in isolation: applyDivideDamage (gather legal targets → pause),
 * autoPickDivideDistribution (the AI greedy-kill split), and resolveDivideChoice (apply the split).
 *
 * NOTE: divide-damage is intentionally NOT yet registered in ATOM_RESOLVERS (so no card flips HIGH until
 * the picker + driver + UI land in the next steps) — these are direct-call unit tests of the logic.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { applyDivideDamage } from "./effects/effectAtoms.js";
import { autoPickDivideDistribution, resolveDivideChoice } from "./effects/runProgram.js";

beforeEach(() => _resetIdsForTests());

function creature(name, power, toughness, controller) {
  return createPermanent({ card: { id: `${name}-c`, name, power, toughness, type_line: "Creature" }, controller });
}
function state({ aiBf = [], userLife = 40, aiLife = 40 } = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...s,
    players: {
      ...s.players,
      user: { ...s.players.user, life: userLife },
      ai: { ...s.players.ai, battlefield: aiBf, life: aiLife },
    },
  };
}
const pcOf = (s) => s.pendingChoice;

describe("MT-1 applyDivideDamage — gathers legal targets + pauses for the division", () => {
  it("anyTarget: candidates = every creature + every player, with controllers", () => {
    const s = state({ aiBf: [creature("Goblin", 1, 1, "ai"), creature("Bear", 2, 2, "ai")] });
    const after = applyDivideDamage(s, { op: "divide-damage", amount: 5, group: "anyTarget" }, { controller: "user" });
    const pc = pcOf(after);
    expect(pc).toMatchObject({ kind: "divide-damage", controller: "user", amount: 5 });
    expect(pc.candidates.filter((c) => c.type === "creature").map((c) => c.name).sort()).toEqual(["Bear", "Goblin"]);
    expect(pc.candidates.filter((c) => c.type === "player").map((c) => c.id).sort()).toEqual(["ai", "user"]);
  });
  it("creatures group: only creatures are candidates (no players)", () => {
    const s = state({ aiBf: [creature("Goblin", 1, 1, "ai")] });
    const pc = pcOf(applyDivideDamage(s, { op: "divide-damage", amount: 3, group: "creatures" }, { controller: "user" }));
    expect(pc.candidates.every((c) => c.type === "creature")).toBe(true);
  });
  it("0 amount is a logged no-op (no pause)", () => {
    const after = applyDivideDamage(state(), { op: "divide-damage", amount: 0, group: "anyTarget" }, { controller: "user" });
    expect(after.pendingChoice).toBeUndefined();
  });
});

describe("MT-1 autoPickDivideDistribution — AI greedy-kills enemy creatures, rest to face", () => {
  it("splits 5 to kill a 2-toughness and a 3-toughness enemy creature (no waste on own board)", () => {
    const s = state({ aiBf: [creature("Small", 1, 2, "ai"), creature("Big", 1, 3, "ai")] });
    const pc = pcOf(applyDivideDamage(s, { op: "divide-damage", amount: 5, group: "anyTarget" }, { controller: "user" }));
    const dist = autoPickDivideDistribution(s, pc);
    const total = dist.reduce((n, d) => n + d.amount, 0);
    expect(total).toBe(5);
    expect(dist.every((d) => d.type !== "player" || d.id === "ai")).toBe(true); // never the caster's own face
    // cheapest-first: the 2-toughness creature gets exactly lethal (2)
    const small = s.players.ai.battlefield.find((p) => p.card.name === "Small");
    expect(dist.find((d) => d.id === small.id)?.amount).toBe(2);
  });
  it("dumps the remainder on the enemy player when creatures are dead", () => {
    const s = state({ aiBf: [creature("Small", 1, 2, "ai")] });
    const pc = pcOf(applyDivideDamage(s, { op: "divide-damage", amount: 5, group: "anyTarget" }, { controller: "user" }));
    const dist = autoPickDivideDistribution(s, pc);
    expect(dist.find((d) => d.type === "player" && d.id === "ai")?.amount).toBe(3); // 2 to kill Small, 3 to face
  });
});

describe("MT-1 resolveDivideChoice — applies the split through the deal-damage atom", () => {
  it("kills the assigned creature and burns the assigned player; caps at the total", () => {
    const s0 = state({ aiBf: [creature("Bear", 2, 2, "ai")], aiLife: 40 });
    const s = applyDivideDamage(s0, { op: "divide-damage", amount: 5, group: "anyTarget" }, { controller: "user" });
    const bear = s.players.ai.battlefield.find((p) => p.card.name === "Bear");
    const out = resolveDivideChoice(s, [{ id: bear.id, type: "creature", amount: 2 }, { id: "ai", type: "player", amount: 99 }]);
    expect(out.players.ai.battlefield.find((p) => p.card.name === "Bear")).toBeUndefined(); // 2 dmg = lethal → dead
    expect(out.players.ai.life).toBe(40 - 3); // capped: 5 total − 2 already spent = only 3 to face
    expect(out.pendingChoice).toBeUndefined();
  });
  it("ignores a non-candidate target id", () => {
    const s = applyDivideDamage(state({ aiBf: [creature("Bear", 2, 2, "ai")] }), { op: "divide-damage", amount: 4, group: "anyTarget" }, { controller: "user" });
    const out = resolveDivideChoice(s, [{ id: "not-a-target", type: "player", amount: 4 }]);
    expect(out.players.ai.life).toBe(40); // nothing applied
  });
});

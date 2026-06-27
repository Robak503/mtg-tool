/**
 * divideDamage.test.js — MT-1 ENGINE CORE (divide-damage), step 1 of the subsystem.
 *
 * "Deals N damage divided as you choose among any number of target creatures/players" (Boulderfall,
 * Mythos of Vadrok, Meteor Swarm). The division is a RESOLUTION-time pending-choice (cast-time
 * enumeration of "any number of targets × every split" would explode the action list). This file pins
 * the three engine pieces in isolation: applyDivideDamage (gather legal targets → pause),
 * autoPickDivideDistribution (the AI greedy-kill split), and resolveDivideChoice (apply the split).
 *
 * The atom is now REGISTERED + wired end-to-end (parser → picker → AI/human driver → resolution), so
 * divide-damage cards classify native-spell; these pin the engine pieces + the parser/coverage contract.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { applyDivideDamage } from "./effects/effectAtoms.js";
import { autoPickDivideDistribution, resolveDivideChoice } from "./effects/runProgram.js";
import { parseEffectProgram, programConfidence } from "./effects/parser.js";
import { classifyCard } from "./coverage.js";

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

describe("MT-1 parser + coverage — divide-damage is native (the card-name prefix is tolerated)", () => {
  const I = (oracle, mana = "{X}{R}") => ({ type: "Sorcery", mana, oracle, name: oracle.split(" ")[0] });
  it("parses the divide shapes to a divide-damage atom + classifies native-spell", () => {
    expect(parseEffectProgram(I("Boulderfall deals 5 damage divided as you choose among any number of targets.", "{4}{R}")).atoms)
      .toEqual([{ op: "divide-damage", amount: 5, group: "anyTarget" }]);
    expect(parseEffectProgram(I("Hail of Arrows deals 4 damage divided as you choose among any number of target creatures.", "{3}{W}")).atoms[0])
      .toMatchObject({ op: "divide-damage", amount: 4, group: "creatures" });
    expect(classifyCard(I("Boulderfall deals 5 damage divided as you choose among any number of targets.", "{4}{R}"))).toBe("native-spell");
  });
  it("MUST_DROP_TO_LOW: an over-cap bounded count, a flying-restricted group, an X-divide, or a rider stays low → Arbiter", () => {
    const low = (o, m) => expect(programConfidence(parseEffectProgram(I(o, m)))).toBe("low");
    // bounded N ≤ cap is now native (DIVIDE-BOUNDED) — but these bounded forms still drop to low:
    low("Forked Lightning deals 4 damage divided as you choose among one, two, or three target creatures.", "{2}{R}{R}"); // N(4) > maxTargets(3): the picker can't enforce the 3-target cap → low (CREED)
    low("Aerial Volley deals 3 damage divided as you choose among one, two, or three target creatures with flying.", "{1}{W}"); // restricted creatures group (with flying) — the resolver can't filter → residue → low
    low("Conflagrate deals X damage divided as you choose among any number of targets.", "{X}{X}{R}"); // X (not numeric) — fast-follow
    low("Rolling Thunder deals X damage divided as you choose among any number of target creatures and/or players.", "{X}{X}{R}");
  });
});

// ===== DIVIDE-BOUNDED ===== "deals N damage divided as you choose among one or two / one, two, or three
// TARGETS" (Arc Lightning, Twin Bolt, Electrolyze, Flames of the Firebrand). Reuses the SAME resolver/picker
// with NO picker change: when amount ≤ the printed cap, the picker's "≥1 per chosen target, total = amount"
// rule already makes the effective target count ≤ amount ≤ cap, so it behaves identically to the unbounded
// `any number` group. amount > cap (Forked Lightning N=4) is rejected so the picker can never over-target.
describe("DIVIDE-BOUNDED — native when amount ≤ the printed target cap (reuses the divide picker)", () => {
  const C = (oracle, type = "Sorcery", mana = "{1}{R}") => ({ type, mana, oracle, name: oracle.split(" ")[0] });
  it("'one, two, or three targets' (N=3) and 'one or two targets' (N=2) parse to the divide atom + go native", () => {
    expect(parseEffectProgram(C("Arc Lightning deals 3 damage divided as you choose among one, two, or three targets.")).atoms)
      .toEqual([{ op: "divide-damage", amount: 3, group: "anyTarget" }]);
    expect(parseEffectProgram(C("Twin Bolt deals 2 damage divided as you choose among one or two targets.", "Instant", "{1}{R}")).atoms)
      .toEqual([{ op: "divide-damage", amount: 2, group: "anyTarget" }]);
    expect(classifyCard(C("Arc Lightning deals 3 damage divided as you choose among one, two, or three targets."))).toBe("native-spell");
    // a trailing modeled clause rides along (Electrolyze = divide + draw)
    expect(classifyCard(C("Electrolyze deals 2 damage divided as you choose among one or two targets.\nDraw a card.", "Instant", "{1}{U}{R}"))).toBe("native-spell");
  });
  it("the 'target creatures' / 'target players' bounded groups map correctly", () => {
    expect(parseEffectProgram(C("Spark deals 3 damage divided as you choose among one, two, or three target creatures.")).atoms[0]).toMatchObject({ op: "divide-damage", amount: 3, group: "creatures" });
    expect(parseEffectProgram(C("Spark deals 2 damage divided as you choose among one or two target players.")).atoms[0]).toMatchObject({ op: "divide-damage", amount: 2, group: "players" });
  });
  it("CREED: amount > cap stays low (Forked Lightning N=4 > 3); a flying restriction leaves residue → low", () => {
    expect(programConfidence(parseEffectProgram(C("Forked Lightning deals 4 damage divided as you choose among one, two, or three target creatures.")))).toBe("low");
    expect(programConfidence(parseEffectProgram(C("Aerial Volley deals 3 damage divided as you choose among one, two, or three target creatures with flying.", "Instant", "{1}{W}")))).toBe("low");
  });
  it("a bounded creature with the divide as a death/activated ability flips (Gang of Devils, Mogg Mob)", () => {
    expect(classifyCard({ name: "Gang of Devils", type: "Creature — Devil", mana: "{4}{R}", power: 3, toughness: 3, oracle: "When this creature dies, it deals 3 damage divided as you choose among one, two, or three targets." })).toBe("native-trigger");
    expect(classifyCard({ name: "Mogg Mob", type: "Creature — Goblin", mana: "{3}{R}", power: 1, toughness: 1, oracle: "Sacrifice this creature: It deals 3 damage divided as you choose among one, two, or three targets." })).toBe("native-activated");
  });
  it("cap invariant e2e — 2 damage among ≤2 targets: a 3rd assigned target gets 0 (total caps at amount)", () => {
    const s0 = state({ aiBf: [creature("A", 0, 5, "ai"), creature("B", 0, 5, "ai"), creature("C", 0, 5, "ai")], aiLife: 40 });
    const s = applyDivideDamage(s0, { op: "divide-damage", amount: 2, group: "creatures" }, { controller: "user" });
    const id = (n) => s.players.ai.battlefield.find((p) => p.card.name === n).id;
    // try to spread 1 onto THREE creatures — only 2 damage exists, so the 3rd gets nothing (effective targets ≤ 2 = the printed cap)
    const out = resolveDivideChoice(s, [{ id: id("A"), type: "creature", amount: 1 }, { id: id("B"), type: "creature", amount: 1 }, { id: id("C"), type: "creature", amount: 1 }]);
    const dmg = (n) => { const p = out.players.ai.battlefield.find((q) => q.card.name === n); return p ? p.damageMarked : null; };
    expect(dmg("A")).toBe(1);
    expect(dmg("B")).toBe(1);
    expect(dmg("C")).toBe(0); // capped — the 3rd target got 0, so only 2 effective targets (≤ the "one or two" bound)
  });
});

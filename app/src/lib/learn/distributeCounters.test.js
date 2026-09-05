/**
 * distributeCounters.test.js — DISTRIBUTE-COUNTERS (The Earth Crystal), mirroring divideDamage.test.js.
 *
 * "Distribute N +1/+1 counters among one or two / one, two, or three target creatures you control": a
 * resolution-time division picker (pendingChoice kind "distribute-counters"), applied per-target through the
 * registered add-counter atom so the controller's +1/+1 doublers compose (CR 616). Covers: the parser (both
 * bounded shapes HIGH, the FP-guard near-misses LOW), the classifier flip (Earth Crystal → native-mixed), the
 * apply→pause→auto-pick→resolve flow, the amount cap + invalid-id guard, and the doubler-compose (Earth
 * Crystal's OWN doubler doubles what it distributes).
 */
import { describe, it, expect, beforeEach } from "vitest";
import { parseEffectClause, programConfidence } from "./effects/parser.js";
import { classifyCard } from "./coverage.js";
import { applyDistributeCounters, distributeCountersClauseParser } from "./effects/atoms/distributeCounters.js";
import { autoPickDistributeCounters, resolveDistributeChoice } from "./effects/runProgram.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const conf = (t) => programConfidence(parseEffectClause(t, "Instant"));
const creature = (id) => createPermanent({ id, card: { id: `c-${id}`, name: id, type: "Creature — Beast", power: 1, toughness: 1 }, controller: "user" });
function stateWith(user = [], ai = []) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: user }, ai: { ...s.players.ai, battlefield: ai } } };
}
const counterOf = (s, id) => s.players.user.battlefield.find((p) => p.id === id)?.counters?.["+1/+1"] || 0;
// A permanent carrying The Earth Crystal's own +1/+1 doubler static ("twice that many … are put … instead").
const doublerPerm = () => createPermanent({ id: "doubler", card: { id: "c-doubler", name: "Doubler", type: "Enchantment", oracle: "If one or more +1/+1 counters would be put on a creature you control, twice that many +1/+1 counters are put on that creature instead." }, controller: "user" });

describe("distribute-counters — parser", () => {
  it("MUST STAY HIGH: the two bounded shapes parse to a distribute-counters atom", () => {
    expect(distributeCountersClauseParser("Distribute two +1/+1 counters among one or two target creatures you control."))
      .toMatchObject({ op: "distribute-counters", counterType: "+1/+1", amount: 2, maxTargets: 2, group: "creaturesYouControl" });
    expect(distributeCountersClauseParser("Distribute three +1/+1 counters among one, two, or three target creatures you control."))
      .toMatchObject({ op: "distribute-counters", amount: 3, maxTargets: 3 });
  });
  it("MUST DROP TO LOW: wrong kind / no 'you control' / wrong count-shape / over-target / rider → Arbiter", () => {
    // GRADUATED (POD-SIM THREE · BI-4, 2026-09-05): any P/T counter kind and any-controller creatures are modelled now
    // (Contagion / Splendid Agony / Elven Rite) — the two former parks below read HIGH; the counter deltas are per-axis.
    expect(conf("Distribute two -1/-1 counters among one or two target creatures you control.")).toBe("high");
    expect(conf("Distribute two +1/+1 counters among one or two target creatures.")).toBe("high");
    expect(conf("Distribute two +1/+1 counters among any number of target creatures you control.")).toBe("low"); // wrong count-shape
    expect(conf("Distribute two +1/+1 counters among up to two target creatures you control.")).toBe("low");     // up-to-N
    expect(distributeCountersClauseParser("Distribute four +1/+1 counters among one, two, or three target creatures you control.")).toBeNull(); // amount>maxTargets
    expect(conf("Distribute two +1/+1 counters among one or two other target creatures you control.")).toBe("low"); // "other" qualifier breaks the anchor
    expect(conf("Distribute two +1/+1 counters among one or two target creatures you control with flying.")).toBe("low"); // within-clause filter rider
  });
});

describe("distribute-counters — classifier flip (inline card, no data dependency)", () => {
  it("The Earth Crystal shape → native-mixed (distribute activated ability + the two modeled statics)", () => {
    const earthCrystal = {
      type: "Legendary Artifact", mana: "{2}{G}{G}", name: "The Earth Crystal",
      oracle: "Green spells you cast cost {1} less to cast.\nIf one or more +1/+1 counters would be put on a creature you control, twice that many +1/+1 counters are put on that creature instead.\n{4}{G}{G}, {T}: Distribute two +1/+1 counters among one or two target creatures you control.",
    };
    expect(classifyCard(earthCrystal)).toBe("native-mixed");
  });
});

describe("distribute-counters — resolution", () => {
  it("applyDistributeCounters gathers ONLY the controller's own creatures and pauses on pendingChoice", () => {
    const s = stateWith([creature("u1"), creature("u2")], [creature("a1")]);
    const paused = applyDistributeCounters(s, { op: "distribute-counters", amount: 2, maxTargets: 2, counterType: "+1/+1" }, { controller: "user" });
    expect(paused.pendingChoice).toMatchObject({ kind: "distribute-counters", amount: 2, controller: "user" });
    expect(paused.pendingChoice.candidates.map((c) => c.id).sort()).toEqual(["u1", "u2"]); // NOT the opponent's a1
  });
  it("0 candidates → clean no-op, no pause (never a fabricated counter)", () => {
    const s = stateWith([], []);
    const after = applyDistributeCounters(s, { op: "distribute-counters", amount: 2, maxTargets: 2 }, { controller: "user" });
    expect(after.pendingChoice).toBeUndefined();
  });
  it("autoPickDistributeCounters round-robins amount across up to maxTargets own creatures", () => {
    const pc = { amount: 2, maxTargets: 2, controller: "user", candidates: [{ id: "u1" }, { id: "u2" }] };
    const s = stateWith([creature("u1"), creature("u2")]);
    const dist = autoPickDistributeCounters(s, pc);
    expect(dist.reduce((n, d) => n + d.amount, 0)).toBe(2); // total exactly amount
    expect(dist.length).toBe(2); expect(dist.every((d) => d.amount === 1)).toBe(true);
    // one creature only → both counters land on it
    expect(autoPickDistributeCounters(stateWith([creature("u1")]), { amount: 2, maxTargets: 2, controller: "user", candidates: [{ id: "u1" }] })).toEqual([{ id: "u1", type: "creature", amount: 2 }]);
  });
  it("resolveDistributeChoice applies the distribution, caps at amount, ignores non-candidate ids", () => {
    let s = stateWith([creature("u1"), creature("u2")]);
    s = { ...s, pendingChoice: { kind: "distribute-counters", controller: "user", amount: 2, counterType: "+1/+1", maxTargets: 2, candidates: [{ id: "u1" }, { id: "u2" }] } };
    const after = resolveDistributeChoice(s, [{ id: "u1", type: "creature", amount: 1 }, { id: "u2", type: "creature", amount: 5 }, { id: "ghost", type: "creature", amount: 9 }]);
    expect(counterOf(after, "u1")).toBe(1);
    expect(counterOf(after, "u2")).toBe(1);  // capped: only 1 of the remaining budget left after u1's 1
    expect(after.pendingChoice).toBeUndefined();
  });
  it("DOUBLER COMPOSES (CR 616): with The Earth Crystal's own +1/+1 doubler out, each distributed counter is doubled", () => {
    let s = stateWith([creature("u1"), creature("u2"), doublerPerm()]);
    s = { ...s, pendingChoice: { kind: "distribute-counters", controller: "user", amount: 2, counterType: "+1/+1", maxTargets: 2, candidates: [{ id: "u1" }, { id: "u2" }] } };
    const after = resolveDistributeChoice(s, [{ id: "u1", type: "creature", amount: 1 }, { id: "u2", type: "creature", amount: 1 }]);
    expect(counterOf(after, "u1")).toBe(2); // 1 distributed × 2 doubler
    expect(counterOf(after, "u2")).toBe(2);
  });
});

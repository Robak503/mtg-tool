/**
 * divideDamageBounded.test.js — SHELF CAP13: the PRINTED TARGET BOUND on divide-damage (CR 601.2d).
 *
 *   "<source> deals N damage divided as you choose among one, two, or three targets."
 *
 * The bound used to be relied upon rather than enforced. Because the picker requires >=1 damage per chosen
 * target and the total is `amount`, a card whose amount is <= its target cap can never exceed the cap by
 * construction — so the old parse arm simply REFUSED any card where `amount > maxTargets` (Forked
 * Lightning, 4 damage among three targets; Sundering Stroke, 7 among three). That refusal was correct at
 * the time: an unbounded picker handed 4 damage would happily open a fourth target, which is a fabricated
 * extra target — a forbidden false positive.
 *
 * This slice CARRIES the bound and enforces it in all three consumers, so those cards are honestly
 * playable instead of refused:
 *   · autoPickDivideDistribution — the AI stops opening new targets once the bound is full
 *   · resolveDivideChoice        — the settle ignores further NEW targets (defence in depth)
 *   · applyDivideChoice          — an over-target submit re-surfaces the picker unresolved
 * The DivideDamagePanel gates its + button and its submit the same way, so the UI cannot build a division
 * the engine would bounce. maxTargets === null (the "any number of target" forms) leaves every path inert.
 *
 * Real oracle fixtures (bundled Scryfall snapshot, verified in-session 2026-08-30).
 */

import { describe, it, expect, beforeEach } from "vitest";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { applyDivideDamage } from "./effects/effectAtoms.js";
import { autoPickDivideDistribution, resolveDivideChoice } from "./effects/runProgram.js";
import { parseEffectClause } from "./effects/parser.js";
import { classifyCard } from "./coverage.js";
import { applyDivideChoice } from "./learnSession.js";

beforeEach(() => _resetIdsForTests());

const creature = (name, power, toughness, controller) =>
  createPermanent({ card: { id: `${name}-c`, name, power, toughness, type_line: "Creature" }, controller });

function state({ aiBf = [], aiLife = 40 } = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return { ...s, players: { ...s.players, ai: { ...s.players.ai, battlefield: aiBf, life: aiLife } } };
}

const FORKED_LIGHTNING = { name: "Forked Lightning", type: "Sorcery", mana: "{2}{R}",
  oracle: "Forked Lightning deals 4 damage divided as you choose among one, two, or three target creatures." };
const ARC_LIGHTNING = { name: "Arc Lightning", type: "Sorcery", mana: "{2}{R}",
  oracle: "Arc Lightning deals 3 damage divided as you choose among one, two, or three targets." };
const TWIN_BOLT = { name: "Twin Bolt", type: "Instant", mana: "{1}{R}",
  oracle: "Twin Bolt deals 2 damage divided as you choose among one or two targets." };

describe("parse — the bound rides the atom, and the amount>cap refusal is gone", () => {
  const atomsOf = (o, t = "Sorcery") => parseEffectClause(o.replace(/\.$/, "").toLowerCase(), t)?.atoms;

  it("both printed bounds are carried", () => {
    expect(atomsOf(ARC_LIGHTNING.oracle)).toEqual([{ op: "divide-damage", amount: 3, group: "anyTarget", maxTargets: 3 }]);
    expect(atomsOf(TWIN_BOLT.oracle, "Instant")).toEqual([{ op: "divide-damage", amount: 2, group: "anyTarget", maxTargets: 2 }]);
  });

  it("⭐ amount > cap now PARSES instead of being refused (Forked Lightning: 4 among three)", () => {
    expect(atomsOf(FORKED_LIGHTNING.oracle)).toEqual([{ op: "divide-damage", amount: 4, group: "creatures", maxTargets: 3 }]);
  });

  it("the UNBOUNDED forms carry no cap — every path below stays inert for them", () => {
    const a = parseEffectClause("x deals 5 damage divided as you choose among any number of targets", "Sorcery")?.atoms;
    expect(a).toEqual([{ op: "divide-damage", amount: 5, group: "anyTarget" }]);
    expect(a[0].maxTargets).toBeUndefined();
  });

  it("the bound reaches the pending choice", () => {
    const s = applyDivideDamage(state({ aiBf: [creature("Bear", 2, 2, "ai")] }),
      { op: "divide-damage", amount: 4, group: "creatures", maxTargets: 3 }, { controller: "user" });
    expect(s.pendingChoice.maxTargets).toBe(3);
    const un = applyDivideDamage(state({ aiBf: [creature("Bear", 2, 2, "ai")] }),
      { op: "divide-damage", amount: 4, group: "creatures" }, { controller: "user" });
    expect(un.pendingChoice.maxTargets).toBe(null);
  });
});

describe("coverage — Forked Lightning graduates; its already-working kin are untouched", () => {
  it("GRADUATED (CAP13): Forked Lightning is native-spell", () => {
    expect(classifyCard(FORKED_LIGHTNING)).toBe("native-spell");
  });
  it("the cards that already worked still do (no regression on the family)", () => {
    expect(classifyCard(ARC_LIGHTNING)).toBe("native-spell");
    expect(classifyCard(TWIN_BOLT)).toBe("native-spell");
  });
});

describe("⭐ the AUTO-PICK honors the bound", () => {
  // Five one-toughness enemies and 4 damage: unbounded, the greedy kill loop opens FOUR targets.
  const fiveChumps = () => [1, 2, 3, 4, 5].map((i) => creature(`Chump${i}`, 1, 1, "ai"));

  it("bounded at three: at most THREE targets are opened, and the whole amount is still assigned", () => {
    const s = applyDivideDamage(state({ aiBf: fiveChumps() }), { op: "divide-damage", amount: 4, group: "creatures", maxTargets: 3 }, { controller: "user" });
    const dist = autoPickDivideDistribution(s, s.pendingChoice);
    expect(new Set(dist.map((d) => d.id)).size).toBeLessThanOrEqual(3);
    expect(dist.reduce((n, d) => n + d.amount, 0)).toBe(4);   // CR 601.2d — the full amount is assigned
  });

  it("NEGATIVE CONTROL — unbounded, the same board opens FOUR targets (so the bound above is doing work)", () => {
    const s = applyDivideDamage(state({ aiBf: fiveChumps() }), { op: "divide-damage", amount: 4, group: "creatures" }, { controller: "user" });
    const dist = autoPickDivideDistribution(s, s.pendingChoice);
    expect(new Set(dist.map((d) => d.id)).size).toBe(4);
  });

  it("the PLAYER is not opened as an extra target once the bound is full", () => {
    // anyTarget group, three chumps, 4 damage, cap 3: the three creatures fill the bound, so the 4th
    // point of damage must ride an already-chosen creature rather than opening the player.
    const s = applyDivideDamage(state({ aiBf: [creature("A", 1, 1, "ai"), creature("B", 1, 1, "ai"), creature("C", 1, 1, "ai")] }),
      { op: "divide-damage", amount: 4, group: "anyTarget", maxTargets: 3 }, { controller: "user" });
    const dist = autoPickDivideDistribution(s, s.pendingChoice);
    expect(new Set(dist.map((d) => d.id)).size).toBe(3);
    expect(dist.some((d) => d.type === "player")).toBe(false);
    expect(dist.reduce((n, d) => n + d.amount, 0)).toBe(4);
  });
});

describe("⭐ the SETTLE refuses to exceed the bound (defence in depth)", () => {
  it("a hand-built 4-target distribution only lands on the first THREE", () => {
    const bf = [1, 2, 3, 4].map((i) => creature(`C${i}`, 1, 1, "ai"));
    const s = applyDivideDamage(state({ aiBf: bf }), { op: "divide-damage", amount: 4, group: "creatures", maxTargets: 3 }, { controller: "user" });
    const ids = s.players.ai.battlefield.map((p) => p.id);
    const after = resolveDivideChoice(s, ids.map((id) => ({ id, type: "creature", amount: 1 })));
    // Three 1/1s died; the fourth was never assigned to because the bound was full.
    expect(after.players.ai.battlefield.length).toBe(1);
    expect(after.players.ai.battlefield[0].id).toBe(ids[3]);
  });

  it("NEGATIVE CONTROL — unbounded, the same submit kills all four", () => {
    const bf = [1, 2, 3, 4].map((i) => creature(`C${i}`, 1, 1, "ai"));
    const s = applyDivideDamage(state({ aiBf: bf }), { op: "divide-damage", amount: 4, group: "creatures" }, { controller: "user" });
    const ids = s.players.ai.battlefield.map((p) => p.id);
    const after = resolveDivideChoice(s, ids.map((id) => ({ id, type: "creature", amount: 1 })));
    expect(after.players.ai.battlefield.length).toBe(0);
  });

  it("two entries naming ONE target consume a single slot (distinct ids, not rows)", () => {
    const bf = [creature("A", 5, 5, "ai"), creature("B", 5, 5, "ai")];
    const s = applyDivideDamage(state({ aiBf: bf }), { op: "divide-damage", amount: 4, group: "creatures", maxTargets: 2 }, { controller: "user" });
    const [a, b] = s.players.ai.battlefield.map((p) => p.id);
    const after = resolveDivideChoice(s, [
      { id: a, type: "creature", amount: 1 }, { id: a, type: "creature", amount: 1 }, { id: b, type: "creature", amount: 2 },
    ]);
    expect(after.players.ai.battlefield.find((p) => p.id === a).damageMarked).toBe(2);
    expect(after.players.ai.battlefield.find((p) => p.id === b).damageMarked).toBe(2);
  });
});

describe("⭐ the SUBMIT GUARD re-surfaces an over-target division", () => {
  function session(aiBf, atom) {
    const s = applyDivideDamage(state({ aiBf }), atom, { controller: "user" });
    return { status: "active", state: s, difficulty: "beginner", decisionLog: [] };
  }

  it("four targets against a cap of three is rejected — nothing is settled", () => {
    const sess = session([1, 2, 3, 4].map((i) => creature(`C${i}`, 1, 1, "ai")), { op: "divide-damage", amount: 4, group: "creatures", maxTargets: 3 });
    const ids = sess.state.players.ai.battlefield.map((p) => p.id);
    const { session: after, decision } = applyDivideChoice(sess, { distribution: ids.map((id) => ({ id, type: "creature", amount: 1 })) });
    expect(decision.kind).toBe("divide-damage");
    expect(after.state.pendingChoice?.kind).toBe("divide-damage");        // unresolved
    expect(after.state.players.ai.battlefield.length).toBe(4);            // and no damage applied
  });

  it("exactly three targets settles normally", () => {
    const sess = session([1, 2, 3, 4].map((i) => creature(`C${i}`, 1, 1, "ai")), { op: "divide-damage", amount: 4, group: "creatures", maxTargets: 3 });
    const ids = sess.state.players.ai.battlefield.map((p) => p.id);
    const { session: after } = applyDivideChoice(sess, {
      distribution: [{ id: ids[0], type: "creature", amount: 2 }, { id: ids[1], type: "creature", amount: 1 }, { id: ids[2], type: "creature", amount: 1 }],
    });
    expect(after.state.pendingChoice).toBeUndefined();
    expect(after.state.players.ai.battlefield.length).toBe(1);            // three 1/1s died
  });

  it("a zero-amount row does not consume a target slot (it receives no damage)", () => {
    const sess = session([1, 2, 3, 4].map((i) => creature(`C${i}`, 1, 1, "ai")), { op: "divide-damage", amount: 3, group: "creatures", maxTargets: 3 });
    const ids = sess.state.players.ai.battlefield.map((p) => p.id);
    const { session: after } = applyDivideChoice(sess, {
      distribution: [
        { id: ids[0], type: "creature", amount: 1 }, { id: ids[1], type: "creature", amount: 1 },
        { id: ids[2], type: "creature", amount: 1 }, { id: ids[3], type: "creature", amount: 0 },
      ],
    });
    expect(after.state.pendingChoice).toBeUndefined();                    // accepted, not re-surfaced
  });
});

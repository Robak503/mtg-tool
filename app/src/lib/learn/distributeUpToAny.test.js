/**
 * distributeUpToAny.test.js — "distribute N +1/+1 counters among UP TO M target creatures" (SHELF-TAIL SH8
 * — Court of Garenbrig; CR 122.3). The fast-follow the distributeCounters header names: two widenings from
 * the you-control arm — the "up to M" count-target shape and the ANY-creature recipient (group:"creatures",
 * the same pool The Wise Mothman uses; the distribute-choice policy picks own creatures for a +1/+1 benefit).
 * Court's other clauses already parsed (the "if you're the monarch" intervening-if + the mass counter-doubling
 * "double the number of +1/+1 counters on each creature you control"), so this one arm flips it. Flip +1/0/0.
 *
 * Mutation-checked (via Edit): disabling the up-to arm → the clause stays LOW → Court body-only (parse +
 * classify pins die). The amount ≤ maxTargets guard is pinned (over-targeting → null, never a fabricated
 * over-spend — the divide-bounded discipline).
 */
import { describe, it, expect } from "vitest";
import { classifyCard } from "./coverage.js";
import { distributeCountersClauseParser } from "./effects/atoms/distributeCounters.js";

describe("SH8 — the up-to / any-creature parse", () => {
  it("'distribute N +1/+1 counters among up to M target creatures' → any-creature distribute", () => {
    expect(distributeCountersClauseParser("distribute two +1/+1 counters among up to two target creatures"))
      .toMatchObject({ op: "distribute-counters", counterType: "+1/+1", amount: 2, maxTargets: 2, group: "creatures" });
  });
  it("the you-control form is unchanged (own-side group)", () => {
    expect(distributeCountersClauseParser("distribute two +1/+1 counters among one or two target creatures you control"))
      .toMatchObject({ op: "distribute-counters", group: "creaturesYouControl", maxTargets: 2 });
  });
  it("GUARD — amount > maxTargets → null (never an over-targeting distribution)", () => {
    expect(distributeCountersClauseParser("distribute three +1/+1 counters among up to two target creatures")).toBeNull();
  });
});

describe("SH8 — Court of Garenbrig classifies native-trigger (distribute + monarch-if + mass doubling)", () => {
  it("the whole card", () => {
    expect(classifyCard({ name: "Court of Garenbrig", type: "Enchantment", oracle: "When this enchantment enters, you become the monarch.\nAt the beginning of your upkeep, distribute two +1/+1 counters among up to two target creatures. Then if you're the monarch, double the number of +1/+1 counters on each creature you control." })).toBe("native-trigger");
  });
});

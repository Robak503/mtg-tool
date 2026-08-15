/**
 * restrictedSubPool.test.js — QUARTET PHASE 4 CORE (2026-08-15): the POOL-restricted sub-pool.
 * Plan: docs/orchestration/SUBSYSTEM-QUARTET-PLAN.md. Klauth's class — trigger-granted mana carrying
 * a spend restriction, which the per-color pool cannot express (the laundering hazard the source
 * filter's full-consumption guard documents; entries stay TAGGED, so partial spends can't launder).
 *
 * ⭐ THE MODEL: player.restrictedMana = [{ pool:{W..C}, restriction, holdUntilEndOfTurn? }].
 *   · planPayment PRE-PASS: qualifying entries pay FIRST (restricted-first — never strand restricted
 *     mana), colored pips then generic; hybrids deliberately not entry-payable (conservative FN).
 *   · the plan carries entrySpends; commitPaymentPlan deducts the EXACT entries (affordable == paid).
 *   · emptyManaPools drops un-held entries at step ends; holdUntilEndOfTurn entries survive to
 *     CLEANUP (finishCleanupActions — Klauth's "you don't lose this mana as steps and phases end").
 *   · "@any-spell" (the bare "Spend this mana only to cast spells"): any castCard qualifies; the
 *     ability path threads NO context, so the restriction is enforced by the default-deny.
 *
 * Mutation-checked (2026-08-15, applied-check by PRINTING THE CHANGED LINE BACK; throw on no-op):
 *   · the pre-pass restriction filter dropped → an entry pays WITHOUT context (the ability-payment FP).
 *   · commit's entry deduction dropped → the mana is spent but the entry keeps it (double-spend).
 *   · the hold check inverted at the drain → the held entry dies at a step end (Klauth's whole rider).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { planPayment, commitPaymentPlan, parseSpendRestriction } from "./manaModel.js";
import { emptyManaPools, finishCleanupActions } from "./gameEngine.js";
import { _resetIdsForTests, createGameState } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const ANY_SPELL = parseSpendRestriction("Add {R}. Spend this mana only to cast spells.");
const zeroPool = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };
const entry = (pool, hold = false) => ({ pool: { ...zeroPool, ...pool }, restriction: ANY_SPELL, ...(hold ? { holdUntilEndOfTurn: true } : {}) });
const cost = (c) => ({ generic: 0, W: 0, U: 0, B: 0, R: 0, G: 0, C: 0, ...c });

describe("the planner: restricted-first, context-gated", () => {
  it("⭐ '@any-spell' parses from the bare form; the entry pays a spell cost from ZERO open mana", () => {
    expect(ANY_SPELL).toEqual({ castTypes: ["@any-spell"] });
    const plan = planPayment(zeroPool, [], cost({ R: 1, generic: 1 }), { castCard: { type: "Sorcery" }, restrictedEntries: [entry({ R: 2, G: 1 })] });
    const row = { paid: plan !== null, entrySpends: plan?.entrySpends };
    console.log("  WITNESS subPoolPays", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row.paid).toBe(true);
    expect(row.entrySpends).toEqual([{ entry: 0, spend: { W: 0, U: 0, B: 0, R: 2, G: 0, C: 0 } }]); // R pip + 1 generic from R
  });

  it("⛔ SEEN-TO-FAIL control: NO context (the ability path) → the entry is invisible → unpayable", () => {
    expect(planPayment(zeroPool, [], cost({ R: 1 }), null)).toBeNull();
    expect(planPayment(zeroPool, [], cost({ R: 1 }), { restrictedEntries: [entry({ R: 2 })] })).toBeNull(); // entries WITHOUT a castCard still refuse (default-deny)
  });

  it("⭐ restricted-FIRST: with open mana available too, the entry is consumed and the pool untouched", () => {
    const openPool = { ...zeroPool, R: 3 };
    const plan = planPayment(openPool, [], cost({ R: 2 }), { castCard: { type: "Instant" }, restrictedEntries: [entry({ R: 2 })] });
    expect(plan.entrySpends?.[0]?.spend?.R).toBe(2);
    expect(plan.spend.R).toBe(0); // the open pool pays nothing — never strand restricted mana
  });
});

describe("⭐⭐ LAW 6 — commit deducts the exact entries; the drains honor the hold", () => {
  const board = (entries) => {
    const g = createGameState({ userDeck: [], aiDeck: [] });
    return { ...g, players: { ...g.players, user: { ...g.players.user, restrictedMana: entries } } };
  };

  it("⭐⭐ a PARTIAL spend leaves the remainder TAGGED (never laundered into the open pool)", () => {
    const s = board([entry({ R: 3 })]);
    const plan = planPayment(zeroPool, [], cost({ R: 1 }), { castCard: { type: "Sorcery" }, restrictedEntries: s.players.user.restrictedMana });
    const next = commitPaymentPlan(s, "user", plan);
    const row = { remaining: next.players.user.restrictedMana?.[0]?.pool?.R, openPoolR: next.players.user.manaPool.R };
    console.log("  WITNESS subPoolPartial", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ remaining: 2, openPoolR: 0 }); // 2 stay tagged; the open pool gains NOTHING
  });

  it("an emptied entry is dropped entirely", () => {
    const s = board([entry({ R: 1 })]);
    const plan = planPayment(zeroPool, [], cost({ R: 1 }), { castCard: { type: "Sorcery" }, restrictedEntries: s.players.user.restrictedMana });
    const next = commitPaymentPlan(s, "user", plan);
    expect(next.players.user.restrictedMana).toEqual([]);
  });

  it("⭐⭐ the drains: an un-held entry dies at a step end; the HELD one survives to cleanup, then dies", () => {
    const s = board([entry({ R: 1 }), entry({ G: 2 }, true)]);
    const afterStep = emptyManaPools(s);
    const row = { afterStep: (afterStep.players.user.restrictedMana || []).map((e) => Object.entries(e.pool).filter(([, n]) => n > 0)) };
    console.log("  WITNESS subPoolHold", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(afterStep.players.user.restrictedMana).toHaveLength(1);              // the un-held R entry died
    expect(afterStep.players.user.restrictedMana[0].pool.G).toBe(2);            // Klauth's held mana survives
    const afterCleanup = finishCleanupActions(afterStep);
    expect(afterCleanup.players.user.restrictedMana).toEqual([]);               // the turn ends — everything drops
  });
});

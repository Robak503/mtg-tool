/**
 * counterRemovalMana.test.js — STAGE ④-4 (2026-09-03): counter-removal mana (CR 605.1a / 122.1) — the tap-only,
 * mana-cost-free forms: "{T}, Remove any number of storage counters from this land: Add {C} for each storage
 * counter removed this way." (Mage-Ring Network and the storage lands) and "{T}, Remove any number of charge
 * counters from this artifact: Add {U}, then add an additional {U} for each charge counter removed this way."
 * (the Mana Batteries). The amount is the permanent's LIVE counters (plus one for the Battery form), the plan
 * carries the counters it priced, and the commit removes exactly those. The {1}-costed Saltcrusted Steppe form
 * stays refused. This makes LANDS-10's 13 storage lands honest at runtime (the 04:50 correction).
 *
 * Real oracle fixtures (bundled Scryfall snapshot, read in-session 2026-09-03).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { manaSources, planPayment, commitPaymentPlan, manaProduction } from "./manaModel.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const MAGE_RING = { id: "c-mrn", name: "Mage-Ring Network", type: "Land", mana: "", keywords: [], oracle: "{T}: Add {C}.\n{1}, {T}: Put a storage counter on this land.\n{T}, Remove any number of storage counters from this land: Add {C} for each storage counter removed this way." };
const BATTERY = { id: "c-bmb", name: "Blue Mana Battery", type: "Artifact", mana: "{4}", keywords: [], oracle: "{2}, {T}: Put a charge counter on this artifact.\n{T}, Remove any number of charge counters from this artifact: Add {U}, then add an additional {U} for each charge counter removed this way." };
const STEPPE = { id: "c-scs", name: "Saltcrusted Steppe", type: "Land", mana: "", keywords: [], oracle: "{T}: Add {C}.\n{1}, {T}: Put a storage counter on this land.\n{1}, Remove X storage counters from this land: Add X mana in any combination of {G} and/or {W}." };

function board(perms) {
  const s0 = createGameState({ userDeck: [], aiDeck: [] });
  return { ...s0, turn: 6, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", players: { ...s0.players, user: { ...s0.players.user, battlefield: perms, manaPool: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 } } } };
}
const perm = (id, card, counters = {}) => ({ ...createPermanent({ id, card, controller: "user", summoningSick: false }), enteredOnTurn: 2, counters });
const recs = (s, id) => manaSources(s, "user").filter((r) => r.permanentId === id).map((r) => ({ colors: [...r.colors], amount: r.amount, removes: r.removesCounters || null }));
const pool = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };
const cost = (o) => ({ generic: 0, W: 0, U: 0, B: 0, R: 0, G: 0, ...o });

describe("the products", () => {
  it("a Battery's only mana line is the removal line — a main product carrying removesCounters (plusOne)", () => {
    expect(manaProduction(BATTERY)).toMatchObject({ colors: ["U"], removesCounters: { type: "charge", mode: "plusOne" } });
  });

  it("⛔ a storage land keeps its plain {C} as the main; the {1}-costed Steppe form is never a source", () => {
    expect(manaProduction(MAGE_RING)).toMatchObject({ colors: ["C"] });
    expect(manaProduction(MAGE_RING).removesCounters).toBeUndefined();
    expect(recs(board([perm("st", STEPPE, { storage: 3 })]), "st")).toEqual([{ colors: ["C"], amount: 1, removes: null }]);
  });
});

describe("runtime — the storage land", () => {
  it("⭐ with three storage counters: the plain {C} and a {C}×3 removal record; paying {C}{C}{C} removes the counters and taps the land", () => {
    const s = board([perm("mrn", MAGE_RING, { storage: 3 })]);
    expect(recs(s, "mrn")).toEqual([{ colors: ["C"], amount: 1, removes: null }, { colors: ["C"], amount: 3, removes: { type: "storage", count: 3 } }]);
    const plan = planPayment(pool, manaSources(s, "user"), cost({ generic: 3 }));
    expect(plan?.taps).toHaveLength(1);
    expect(plan.taps[0]).toMatchObject({ permanentId: "mrn", amount: 3, removesCounters: { type: "storage", count: 3 } });
    const paid = commitPaymentPlan(s, "user", plan);
    const land = paid.players.user.battlefield.find((p) => p.id === "mrn");
    expect(land.counters?.storage || 0).toBe(0);
    expect(land.tapped).toBe(true);
  });

  it("paying a single {C} uses the plain tap and PRESERVES the counters (the removal line is a second pass)", () => {
    const s = board([perm("mrn", MAGE_RING, { storage: 3 })]);
    const plan = planPayment(pool, manaSources(s, "user"), cost({ generic: 1 }));
    expect(plan?.taps).toHaveLength(1);
    expect(plan.taps[0].removesCounters).toBeUndefined();
    const paid = commitPaymentPlan(s, "user", plan);
    expect(paid.players.user.battlefield.find((p) => p.id === "mrn").counters.storage).toBe(3);
  });

  it("with no counters only the plain tap is offered — a zero-amount removal is never a source", () => {
    expect(recs(board([perm("mrn", MAGE_RING, {})]), "mrn")).toEqual([{ colors: ["C"], amount: 1, removes: null }]);
  });

  it("the two records are one {T}: {C}{C}{C}{C} from the land alone is unpayable", () => {
    const s = board([perm("mrn", MAGE_RING, { storage: 3 })]);
    expect(planPayment(pool, manaSources(s, "user"), cost({ generic: 4 }))).toBeNull();
  });
});

describe("runtime — the Mana Battery", () => {
  it("⭐ zero charge → {U}×1; two charge → {U}×3, and paying with it removes both counters", () => {
    expect(recs(board([perm("bat", BATTERY, {})]), "bat")).toEqual([{ colors: ["U"], amount: 1, removes: { type: "charge", count: 0 } }]);
    const s = board([perm("bat", BATTERY, { charge: 2 })]);
    expect(recs(s, "bat")).toEqual([{ colors: ["U"], amount: 3, removes: { type: "charge", count: 2 } }]);
    const plan = planPayment(pool, manaSources(s, "user"), cost({ U: 3 }));
    expect(plan?.taps).toHaveLength(1);
    const paid = commitPaymentPlan(s, "user", plan);
    expect(paid.players.user.battlefield.find((p) => p.id === "bat").counters?.charge || 0).toBe(0);
    expect(paid.players.user.manaPool.U).toBe(0);
  });
});

describe("classification", () => {
  it("Blue Mana Battery is native-mana now that the runtime offers its line; Mage-Ring Network stays a land", () => {
    expect(classifyCard(BATTERY)).toMatch(/^native/);
    expect(classifyCard(MAGE_RING)).toBe("land");
  });
});

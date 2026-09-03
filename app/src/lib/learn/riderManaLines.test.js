/**
 * riderManaLines.test.js — STAGE ④-5 (2026-09-03): rider-bearing mana lines, three shapes. (1) PAY-LIFE LANDS —
 * the Horizon cycle and Mana Confluence produced their colours for FREE (the pay-life reader excluded lands);
 * a land pays life like a rock now, gated on having more life than the cost and paid at the commit. (2) The
 * DOESN'T-UNTAP duals (Mogg Hollows and the Tempest cycle) — the coloured second line is offered with its
 * rider and the tapped land skips its controller's next untap step. (3) The ANY-COLOUR painland (Grand
 * Coliseum) — its coloured line is admitted only together with the pain.
 *
 * Real oracle fixtures (bundled Scryfall snapshot, read in-session 2026-09-03).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { createGameState, createPermanent, untapAll, _resetIdsForTests } from "./gameState.js";
import { manaSources, planPayment, commitPaymentPlan, manaProduction } from "./manaModel.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const L = (name, oracle) => ({ id: "c-" + name.replace(/\W+/g, "").toLowerCase(), name, type: "Land", mana: "", keywords: [], oracle });
const CANOPY = L("Horizon Canopy", "{T}, Pay 1 life: Add {G} or {W}.\n{1}, {T}, Sacrifice this land: Draw a card.");
const CONFLUENCE = L("Mana Confluence", "{T}, Pay 1 life: Add one mana of any color.");
const HOLLOWS = L("Mogg Hollows", "{T}: Add {C}.\n{T}: Add {R} or {G}. This land doesn't untap during your next untap step.");
const COLISEUM = L("Grand Coliseum", "This land enters tapped.\n{T}: Add {C}.\n{T}: Add one mana of any color. This land deals 1 damage to you.");

function board(perms, life = 20) {
  const s0 = createGameState({ userDeck: [], aiDeck: [] });
  return { ...s0, turn: 6, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", players: { ...s0.players, user: { ...s0.players.user, life, battlefield: perms, manaPool: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 } } } };
}
const perm = (id, card) => ({ ...createPermanent({ id, card, controller: "user", summoningSick: false }), enteredOnTurn: 2 });
const recs = (s, id) => manaSources(s, "user").filter((r) => r.permanentId === id);
const pool = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };
const cost = (o) => ({ generic: 0, W: 0, U: 0, B: 0, R: 0, G: 0, ...o });

describe("pay-life lands", () => {
  it("⭐ Horizon Canopy and Mana Confluence carry their life cost; at 1 life the source is not offered; paying charges the life", () => {
    expect(manaProduction(CANOPY)).toMatchObject({ colors: ["G", "W"], payLife: 1 });
    expect(manaProduction(CONFLUENCE)).toMatchObject({ payLife: 1 });
    expect([...manaProduction(CONFLUENCE).colors].sort()).toEqual(["B", "G", "R", "U", "W"]);
    expect(recs(board([perm("hc", CANOPY)], 1), "hc")).toEqual([]);
    const s = board([perm("hc", CANOPY)], 20);
    expect(recs(s, "hc")).toHaveLength(1);
    const plan = planPayment(pool, manaSources(s, "user"), cost({ G: 1 }));
    expect(plan?.taps).toHaveLength(1);
    const paid = commitPaymentPlan(s, "user", plan);
    expect(paid.players.user.life).toBe(19);
    expect(paid.players.user.battlefield.find((p) => p.id === "hc").tapped).toBe(true);
  });
});

describe("the doesn't-untap duals", () => {
  it("⭐ Mogg Hollows: {C} plain and {R}/{G} with the rider; paying {R} taps it and it skips the NEXT untap step only", () => {
    const s = board([perm("mh", HOLLOWS)]);
    const rs = recs(s, "mh");
    expect(rs.map((r) => [...r.colors].sort())).toEqual([["C"], ["G", "R"]]);
    expect(rs[1].doesNotUntapNext).toBe(true);
    expect(rs[0].doesNotUntapNext).toBeUndefined();
    const plan = planPayment(pool, manaSources(s, "user"), cost({ R: 1 }));
    expect(plan.taps[0]).toMatchObject({ permanentId: "mh", doesNotUntapNext: true });
    const paid = commitPaymentPlan(s, "user", plan);
    const land = paid.players.user.battlefield.find((p) => p.id === "mh");
    expect(land.tapped).toBe(true);
    expect(land.doesNotUntapNext).toBe(true);
    const afterOne = untapAll(paid, { playerId: "user" });
    expect(afterOne.players.user.battlefield.find((p) => p.id === "mh").tapped).toBe(true);
    const afterTwo = untapAll(afterOne, { playerId: "user" });
    expect(afterTwo.players.user.battlefield.find((p) => p.id === "mh").tapped).toBe(false);
  });

  it("the plain {C} tap carries no rider: paying {C} does not lock the land", () => {
    const s = board([perm("mh", HOLLOWS)]);
    const plan = planPayment(pool, manaSources(s, "user"), cost({ generic: 1 }));
    const paid = commitPaymentPlan(s, "user", plan);
    expect(!!paid.players.user.battlefield.find((p) => p.id === "mh").doesNotUntapNext).toBe(false);
  });
});

describe("the any-colour painland", () => {
  it("⭐ Grand Coliseum: the coloured line is admitted WITH the pain — paying {G} costs 1 life", () => {
    const m = manaProduction(COLISEUM);
    expect([...m.colors].sort()).toEqual(["B", "C", "G", "R", "U", "W"]);
    expect(m.painColors).toEqual(["W", "U", "B", "R", "G"]);
    const s = board([perm("gc", COLISEUM)]);
    const plan = planPayment(pool, manaSources(s, "user"), cost({ G: 1 }));
    expect(plan?.taps).toHaveLength(1);
    expect(commitPaymentPlan(s, "user", plan).players.user.life).toBe(19);
  });
});

describe("classification", () => {
  it("every fixture stays a fully covered land", () => {
    for (const c of [CANOPY, CONFLUENCE, HOLLOWS, COLISEUM]) expect(classifyCard(c)).toBe("land");
  });
});

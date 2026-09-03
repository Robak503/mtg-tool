/**
 * altarManaSac.test.js — SG-3 (2026-09-03): the SACRIFICE-A-CREATURE mana cost — Ashnod's Altar ("Sacrifice a
 * creature: Add {C}{C}") and Phyrexian Altar ("Sacrifice a creature: Add one mana of any color"), both in
 * Colton's Squirrel Girl deck. Until now a non-self sacrifice was refused as PHANTOM mana (the sim would
 * have "paid" it for free every turn). It is paid for real now, exactly as the exile-from-graveyard cost
 * is: the production carries `sacrificesCreature`, manaSources offers the source only while ANOTHER
 * creature is there to feed it, and commitManaTap sacrifices the least-valuable one through the dies
 * chokepoint — dies triggers fire, the source itself is never the victim.
 *
 * Real oracle fixtures (bundled Scryfall snapshot, read in-session 2026-09-03).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { manaProduction, manaSources, planPayment, commitPaymentPlan } from "./manaModel.js";
import { parseManaCost } from "./legalChoices.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const ASHNOD = { id: "c-ashnod", name: "Ashnod's Altar", type: "Artifact", mana: "{3}", oracle: "Sacrifice a creature: Add {C}{C}." };
const PHYREXIAN = { id: "c-phyrexian", name: "Phyrexian Altar", type: "Artifact", mana: "{3}", oracle: "Sacrifice a creature: Add one mana of any color." };
const creature = (id, name, mana, extra = {}) => createPermanent({ id, card: { id: "c-" + id, name, type: "Creature — Bear", mana, mana_cost: mana, power: 2, toughness: 2, oracle: "", ...extra }, controller: "user", summoningSick: false });

describe("the production flag — exactly 'Sacrifice a creature'", () => {
  it("reads both Altars with sacrificesCreature; a self-sac, a typed sac and a rider are not carved out", () => {
    expect(manaProduction(ASHNOD)).toMatchObject({ colors: ["C"], amount: 2, sacrificesCreature: true });
    expect(manaProduction(PHYREXIAN)).toMatchObject({ colors: ["W", "U", "B", "R", "G"], amount: 1, sacrificesCreature: true });
    expect(manaProduction({ name: "Probe Artifact Sac", type: "Artifact", oracle: "Sacrifice an artifact: Add {C}{C}." })).toBeFalsy();
    expect(manaProduction({ name: "Probe Saproling Sac", type: "Artifact", oracle: "Sacrifice a Saproling: Add {C}{C}." })).toBeFalsy();
  });

  it("⛔ a card with a FREE tap beside a sacrifice line keeps the free tap and is NOT stamped (Phyrexian Tower)", () => {
    // The production is the free "{T}: Add {C}"; stamping sacrificesCreature on it would feed a creature to
    // every {C}. The sac line stays an honest under-offer.
    const tower = manaProduction({ name: "Phyrexian Tower", type: "Legendary Land", oracle: "{T}: Add {C}.\n{T}, Sacrifice a creature: Add {B}{B}." });
    expect(tower).toMatchObject({ colors: ["C"], amount: 1 });
    expect(tower.sacrificesCreature).toBeFalsy();
  });
});

function board(altar, creatures) {
  const s0 = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...s0, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
    players: { ...s0.players, user: { ...s0.players.user, battlefield: [createPermanent({ id: "altar", card: altar, controller: "user", summoningSick: false }), ...creatures], graveyard: [], hand: [], library: [{ id: "L0", name: "Forest", type: "Basic Land — Forest" }], manaPool: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 } } },
  };
}
const altarSource = (s) => manaSources(s, "user").find((x) => x.permanentId === "altar");

describe("the offer gate — another creature must be there to feed it", () => {
  it("⛔ Ashnod's Altar alone is no source; with a creature it offers {C}{C} tagged sacrificesCreature", () => {
    expect(altarSource(board(ASHNOD, []))).toBeUndefined();
    const src = altarSource(board(ASHNOD, [creature("bear", "Grizzly Bears", "{1}{G}")]));
    expect(src).toMatchObject({ amount: 2, sacrificesCreature: true });
  });
});

describe("the payment — the least-valuable OTHER creature dies through the chokepoint", () => {
  it("⭐ paying {C}{C} off Ashnod's Altar sacrifices the cheapest creature, never the Altar; dies triggers fire", () => {
    const s = board(ASHNOD, [
      creature("big", "Big Bear", "{4}{G}"),
      creature("small", "Small Bear", "{G}", { oracle: "When this creature dies, draw a card." }),
    ]);
    const sources = manaSources(s, "user").filter((x) => x.permanentId === "altar");
    const plan = planPayment(s.players.user.manaPool, sources, parseManaCost("{C}{C}"));
    expect(plan).toBeTruthy();
    const out = commitPaymentPlan(s, "user", plan);
    const names = (id) => out.players.user.battlefield.some((p) => p.id === id);
    expect(names("altar")).toBe(true);
    expect(names("big")).toBe(true);
    expect(names("small")).toBe(false);
    expect(out.players.user.graveyard.some((c) => c.name === "Small Bear")).toBe(true);
    // the sacrificed creature's own dies trigger reached the pending-trigger queue / stack
    expect(((out.pendingTriggers || []).length + (out.stack || []).length) > 0).toBe(true);
    expect(out.log.some((e) => e.event === "sacrifice-creature-cost" && e.victimName === "Small Bear")).toBe(true);
  });

  it("Phyrexian Altar pays a colored pip the same way", () => {
    const s = board(PHYREXIAN, [creature("bear", "Grizzly Bears", "{1}{G}")]);
    const sources = manaSources(s, "user").filter((x) => x.permanentId === "altar");
    const plan = planPayment(s.players.user.manaPool, sources, parseManaCost("{G}"));
    expect(plan).toBeTruthy();
    const out = commitPaymentPlan(s, "user", plan);
    expect(out.players.user.battlefield.some((p) => p.id === "bear")).toBe(false);
    expect(out.players.user.battlefield.some((p) => p.id === "altar")).toBe(true);
  });
});

describe("classification", () => {
  it("both Altars are native-mana; the artifact-sac and typed-sac probes stay body-only", () => {
    expect(classifyCard(ASHNOD)).toBe("native-mana");
    expect(classifyCard(PHYREXIAN)).toBe("native-mana");
    expect(classifyCard({ name: "Probe Artifact Sac", type: "Artifact", mana: "{3}", oracle: "Sacrifice an artifact: Add {C}{C}." })).toBe("body-only");
  });
});

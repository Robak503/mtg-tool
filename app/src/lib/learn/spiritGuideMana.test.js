/**
 * spiritGuideMana.test.js — SG-6 (2026-09-03): Elvish Spirit Guide "Exile this card from your hand: Add {G}."
 * (the Squirrel Girl deck) and Simian Spirit Guide — a mana ability of a card IN HAND (CR 605.1a). The
 * production carries `fromHand`; manaSources walks the hand for such cards and never offers the same card as
 * a battlefield tap (the ability does not exist there); the planner carries the rider; commitManaTap exiles
 * the card instead of tapping a permanent.
 *
 * Real oracle fixtures (bundled Scryfall snapshot, read in-session 2026-09-03).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { manaProduction, manaSources, planPayment, commitPaymentPlan } from "./manaModel.js";
import { parseManaCost } from "./legalChoices.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const ESG = { id: "c-esg", name: "Elvish Spirit Guide", type: "Creature — Elf Spirit", mana: "{2}{G}", mana_cost: "{2}{G}", power: 2, toughness: 2, keywords: [], oracle: "Exile this card from your hand: Add {G}." };
const SSG = { id: "c-ssg", name: "Simian Spirit Guide", type: "Creature — Ape Spirit", mana: "{2}{R}", mana_cost: "{2}{R}", power: 2, toughness: 2, keywords: [], oracle: "Exile this card from your hand: Add {R}." };

describe("the production — a hand-zone source, exactly that cost", () => {
  it("reads both Guides with fromHand; a graveyard-zone or rider variant is refused", () => {
    expect(manaProduction(ESG)).toMatchObject({ colors: ["G"], amount: 1, fromHand: true });
    expect(manaProduction(SSG)).toMatchObject({ colors: ["R"], amount: 1, fromHand: true });
    // a GRAVEYARD-zone self-exile is its own pre-existing lane — whatever it reads, it is never a hand source
    expect(manaProduction({ name: "Probe GY", type: "Creature — Elf", oracle: "Exile this card from your graveyard: Add {G}." })?.fromHand).toBeFalsy();
    expect(manaProduction({ name: "Probe Rider", type: "Creature — Elf", oracle: "Exile this card from your hand: Add {G}. Activate only during your turn." })?.fromHand).toBeFalsy();
    // ⛔ a ZONELESS self-exile ("Exile this card: Add {G}") is a battlefield ability, not a hand source — the
    // "from your hand" words are the gate, not decoration (a mutation that made them optional survived until this pin)
    expect(manaProduction({ name: "Probe Zoneless", type: "Creature — Elf", oracle: "Exile this card: Add {G}." })?.fromHand).toBeFalsy();
  });
});

function board({ hand = [], bf = [] }) {
  const s0 = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...s0, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
    players: { ...s0.players, user: { ...s0.players.user, hand, battlefield: bf, exile: [], manaPool: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 } } },
  };
}

describe("the sources — in hand yes, on the battlefield no", () => {
  it("⭐ a Guide in hand is a one-shot {G} source keyed by the card id", () => {
    const s = board({ hand: [{ ...ESG, id: "h-esg" }] });
    expect(manaSources(s, "user").find((x) => x.permanentId === "h-esg")).toMatchObject({ colors: ["G"], amount: 1, fromHand: true });
  });

  it("⛔ the same Guide ON THE BATTLEFIELD is not a source (the ability lives in hand only)", () => {
    const s = board({ bf: [createPermanent({ id: "b-esg", card: ESG, controller: "user", summoningSick: false })] });
    expect(manaSources(s, "user").find((x) => x.permanentId === "b-esg")).toBeUndefined();
  });
});

describe("the payment — the card is exiled, the mana arrives, nothing taps", () => {
  it("⭐ paying {G} off a Guide in hand exiles it and leaves the pool spent", () => {
    const s = board({ hand: [{ ...ESG, id: "h-esg" }, { id: "h-other", name: "Forest", type: "Basic Land — Forest" }] });
    const sources = manaSources(s, "user").filter((x) => x.permanentId === "h-esg");
    const plan = planPayment(s.players.user.manaPool, sources, parseManaCost("{G}"));
    expect(plan).toBeTruthy();
    const out = commitPaymentPlan(s, "user", plan);
    expect(out.players.user.hand.some((c) => c.id === "h-esg")).toBe(false);
    expect(out.players.user.exile.some((c) => c.id === "h-esg")).toBe(true);
    expect(out.players.user.hand.length).toBe(1);
    expect(out.log.some((e) => e.event === "exile-from-hand-cost" && e.cardId === "h-esg")).toBe(true);
  });
});

describe("classification", () => {
  it("both Guides are native; the graveyard-zone probe stays body-only", () => {
    expect(classifyCard(ESG)).toMatch(/^native/);
    expect(classifyCard(SSG)).toMatch(/^native/);
    expect(classifyCard({ name: "Probe GY", type: "Creature — Elf", mana: "{2}{G}", power: 2, toughness: 2, oracle: "Exile this card from your graveyard: Add {G}." })).toBe("body-only");
  });
});

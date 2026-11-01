/**
 * targetTaxCostChoices.test.js — a target tax judges every payment of a cast that carries cost choices (CR 601.2f, 118.9d) —
 * 2026-11-01, the castexplode re-review's N1.
 *
 * Inside the engine an alternative cost payable more than one way is one cast per target, its payments on `altCostChoices`
 * (costChoices.js); applyTargetTaxes priced that cast by its HOUSE payment alone and, when the house couldn't fund the tax, dropped
 * the cast with every payment on it — though another payment could. Orim's Cure with a Plains, Llanowar Elves and Grizzly Bears,
 * aimed at the opponent's Sphinx of New Prahv (+{2}): tapping the Elves for the alternative cost leaves the Plains alone for the
 * {2}, but tapping the Bears leaves the Plains and the Elves, which pay it. The house tapper is the first creature offered, so with
 * the Elves first the whole cast at the Sphinx vanished — from the play-API, the pilots, the Academy and the AI alike. Each payment
 * is judged now (withPayableOwedMana), as each was when it was its own cast. Real oracle text (bundled Scryfall snapshot).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { legalActions } from "./gameApi.js";
import { expandAllCostChoices } from "./costChoices.js";
import { dispatchAction } from "./actionDispatcher.js";

beforeEach(() => _resetIdsForTests());

const CURE = { id: "cure", name: "Orim's Cure", type: "Instant", mana: "{1}{W}", colors: ["W"], cmc: 2,
  oracle: "If you control a Plains, you may tap an untapped creature you control rather than pay this spell's mana cost.\nPrevent the next 4 damage that would be dealt to any target this turn." };
const SPHINX = { name: "Sphinx of New Prahv", type: "Creature — Sphinx", mana: "{W}{W}{U}{U}", colors: ["U", "W"], cmc: 4, power: 4, toughness: 3, keywords: ["Flying", "Vigilance"],
  oracle: "Flying, vigilance\nSpells your opponents cast that target this creature cost {2} more to cast." };
const PLAINS = { name: "Plains", type: "Basic Land — Plains", oracle: "({T}: Add {W}.)" };
const ELVES = { name: "Llanowar Elves", type: "Creature — Elf Druid", mana: "{G}", colors: ["G"], cmc: 1, power: 1, toughness: 1, keywords: [], oracle: "{T}: Add {G}." };
const BEARS = { name: "Grizzly Bears", type: "Creature — Bear", mana: "{1}{G}", colors: ["G"], cmc: 2, power: 2, toughness: 2, keywords: [], oracle: "" };
const perm = (id, card, controller = "user") => createPermanent({ id, card: { id: `${id}-c`, ...card }, controller, summoningSick: false });

function cureBoard(order) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  const mine = { p1: perm("p1", PLAINS), elf: perm("elf", ELVES), bear: perm("bear", BEARS) };
  return { ...s, phase: "precombat-main", step: "main", activePlayer: "ai", priorityHolder: "user", consecutivePasses: 0, stack: [],
    players: { ...s.players, user: { ...s.players.user, hand: [CURE], battlefield: order.map((k) => mine[k]), exile: [] }, ai: { ...s.players.ai, battlefield: [perm("sphinx", SPHINX, "ai")] } } };
}
const atSphinx = (actions) => actions.filter((a) => a.kind === "cast-spell" && a.cardId === "cure" && a.targets?.[0]?.id === "sphinx");
const ORDERS = [["p1", "elf", "bear"], ["p1", "bear", "elf"]];

describe("WITNESS — the cast at a taxed target keeps every payment that can fund the tax, whatever the board's order", () => {
  for (const order of ORDERS) {
    it(`${order.join(", ")}: the play-API lists "tap Grizzly Bears" at the Sphinx with the {2} tax, and it dispatches`, () => {
      const s = cureBoard(order);
      const casts = atSphinx(legalActions(s, "user"));
      expect(casts.map((a) => a.altCost?.tapCreatureId ?? "hard")).toEqual(["bear"]);
      expect(casts[0].cost.generic).toBe(2);
      expect(casts[0].targetManaTax).toBe(2);
      const next = dispatchAction(s, casts[0]);
      expect(next.players.user.battlefield.find((p) => p.id === "bear").tapped).toBe(true);
      expect(next.stack.at(-1).source.name).toBe("Orim's Cure");
    });

    it(`${order.join(", ")}: the engine's own list (the AI's) carries it — its house the payment that funds the tax`, () => {
      const casts = atSphinx(legalActionsForPlayer(cureBoard(order), "user"));
      expect(casts.length).toBe(1);
      expect(casts[0].altCost.tapCreatureId).toBe("bear");
      expect(atSphinx(expandAllCostChoices(casts)).map((a) => a.altCost.tapCreatureId)).toEqual(["bear"]);
    });
  }

  it("the whole list is the same in both orders but for the order the creatures are listed in (13 casts)", () => {
    const keysOf = (order) => legalActions(cureBoard(order), "user").filter((a) => a.kind === "cast-spell")
      .map((a) => `${a.targets?.[0]?.id}|${a.altCost?.tapCreatureId ?? "hard"}`).sort();
    expect(keysOf(ORDERS[0])).toEqual(keysOf(ORDERS[1]));
    expect(keysOf(ORDERS[0]).length).toBe(13);
  });
});

describe("CONTROL — an untaxed target keeps every tapper, and a tax nobody can fund drops the cast", () => {
  it("at the opponent (no tax): the hard cast and a cast per untapped creature", () => {
    const casts = legalActions(cureBoard(ORDERS[0]), "user").filter((a) => a.kind === "cast-spell" && a.cardId === "cure" && a.targets?.[0]?.id === "ai");
    expect(casts.map((a) => a.altCost?.tapCreatureId ?? "hard").sort()).toEqual(["bear", "elf", "hard"]);
  });

  it("with the Plains alone and the Bears: no payment funds the {2} at the Sphinx — nothing at the Sphinx", () => {
    const s0 = cureBoard(ORDERS[0]);
    const s = { ...s0, players: { ...s0.players, user: { ...s0.players.user, battlefield: s0.players.user.battlefield.filter((p) => p.id !== "elf") } } };
    expect(atSphinx(legalActions(s, "user"))).toEqual([]);
    expect(atSphinx(legalActionsForPlayer(s, "user"))).toEqual([]);
  });
});

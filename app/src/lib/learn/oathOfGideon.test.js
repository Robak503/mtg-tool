/**
 * OATH OF GIDEON — SHELF-85 · Atraxa A2, 2026-09-05. "When Oath of Gideon enters, create two 1/1 white Kor Ally creature
 * tokens. / Each planeswalker you control enters with an additional loyalty counter on it."
 *
 * The ETB was native; the static is the OTHERS-ENTER-WITH family (Renata / Arwen / Bramblewood Paragon) in its one
 * planeswalker printing. The reader the entry site honours and coverage strips on (othersEnterWithCounters) admits it
 * with an explicit subject + counter kind — the creature shape's descriptor is byte-identical. At the entry site the
 * extra loyalty joins the printed starting loyalty BEFORE the counter doubler (both are enters-with replacements the
 * controller orders, CR 616.1 — Doubling Season gives 2 × (N + 1)); a creature entering under Oath reads nothing, and
 * a walker entering under Renata reads nothing.
 *
 * Mutation-checked: see the run ledger (docs-sk80).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { othersEnterWithCounters } from "./staticAbilityParser.js";
import { enterPermanent } from "./resolvers.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const OATH = { id: "c-oath", name: "Oath of Gideon", type: "Legendary Enchantment", mana: "{2}{W}", keywords: [],
  oracle: "When Oath of Gideon enters, create two 1/1 white Kor Ally creature tokens.\nEach planeswalker you control enters with an additional loyalty counter on it." };
const RENATA = { id: "c-renata", name: "Renata, Called to the Hunt", type: "Legendary Enchantment Creature — Demigod", mana: "{2}{G}{G}", keywords: [], power: 0, toughness: 3,
  oracle: "Renata's power is equal to your devotion to green.\nEach other creature you control enters with an additional +1/+1 counter on it." };
const DOUBLING_SEASON = { id: "c-ds", name: "Doubling Season", type: "Enchantment", mana: "{4}{G}", keywords: [],
  oracle: "If an effect would create one or more tokens under your control, it creates twice that many of those tokens instead.\nIf an effect would put one or more counters on a permanent you control, it puts twice that many of those counters on that permanent instead." };
const WALKER = { id: "c-pw", name: "Plain Spark", type: "Legendary Planeswalker — Test", mana: "{3}{W}", loyalty: "4", keywords: [], oracle: "+1: You gain 2 life." };
const BEARS = { id: "c-bears", name: "Grizzly Bears", type: "Creature — Bear", mana: "{1}{G}", oracle: "", power: 2, toughness: 2, keywords: [] };

const base = () => {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return { ...s, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0, turn: 6 };
};
const withPerms = (cards) => {
  const s = base();
  return { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: cards.map((c, i) => createPermanent({ id: `p${i}`, card: c, controller: "user" })) } } };
};
const enteredCounters = (s, cardId) => s.players.user.battlefield.find((p) => p.card?.id === cardId)?.counters || {};

describe("the reader — the planeswalker printing beside the creature one", () => {
  it("Oath reads to the loyalty shape; Renata's descriptor is byte-identical; a nonsense counter word is refused", () => {
    const row = { oath: othersEnterWithCounters(OATH), renata: othersEnterWithCounters(RENATA) };
    console.log("  WITNESS oathReader", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row.oath).toEqual({ subtype: null, fixed: 1, metric: null, subject: "planeswalker", counter: "loyalty" });
    expect(row.renata).toEqual({ subtype: null, fixed: 1, metric: null });
    expect(othersEnterWithCounters({ ...OATH, oracle: "Each planeswalker you control enters with an additional charge counter on it." })).toBeNull();
    expect(othersEnterWithCounters({ ...OATH, oracle: "Each planeswalker you control enters with an additional loyalty counter on it for each creature you control." })).toBeNull();
  });

  it("classification — Oath of Gideon flips native", () => {
    expect(classifyCard(OATH)).toMatch(/^native/);
  });
});

describe("RUNTIME — the entering walker reads Oath", () => {
  it("a 4-loyalty walker enters with 5 under Oath, 4 without, 6 under two Oaths", () => {
    const row = {
      oath: enteredCounters(enterPermanent(withPerms([OATH]), WALKER, "user"), "c-pw").loyalty,
      none: enteredCounters(enterPermanent(withPerms([]), WALKER, "user"), "c-pw").loyalty,
      two: enteredCounters(enterPermanent(withPerms([OATH, { ...OATH, id: "c-oath2" }]), WALKER, "user"), "c-pw").loyalty,
    };
    console.log("  WITNESS oathRuntime", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ oath: 5, none: 4, two: 6 });
  });

  it("under Oath + Doubling Season the walker enters with 2 × (4 + 1) = 10 — the extra counter joins before the doubler", () => {
    expect(enteredCounters(enterPermanent(withPerms([OATH, DOUBLING_SEASON]), WALKER, "user"), "c-pw").loyalty).toBe(10);
  });

  it("the shapes never cross: a creature under Oath gets no counter; a walker under Renata gets only its printed loyalty", () => {
    const bear = enteredCounters(enterPermanent(withPerms([OATH]), BEARS, "user"), "c-bears");
    expect(bear["+1/+1"] || 0).toBe(0);
    expect(bear.loyalty).toBeUndefined();
    expect(enteredCounters(enterPermanent(withPerms([RENATA]), WALKER, "user"), "c-pw").loyalty).toBe(4);
  });
});

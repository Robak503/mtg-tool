/**
 * manaGraveyardComposition.test.js — CORPUS ④-R (2026-09-03 night): a MANA SOURCE with a GRAVEYARD-ZONE ability —
 * Abzan Devotee ("{1}: Add {W}, {B}, or {G}. Activate only once each turn. / {2}{B}: Return this card from your
 * graveyard to your hand."), Gravestone Strider, Buried Treasure. The graveyard line is modeled by its own lane
 * (GY-1 / GY-2: offered FROM the graveyard, never from the battlefield) so `modeled` reads false on the battlefield
 * parse, and the mana tier's residue gate sank the whole card — the activated composition had already admitted the
 * same zone argument (census slice 56). Same predicate now, both gates. Jack-o'-Lantern stays parked: its graveyard
 * line IS a mana ability, which no lane produces from the graveyard. Real oracle fixtures (bundled Scryfall snapshot).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { classifyCard } from "./coverage.js";
import { legalActionsForPlayer, filterActions } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { manaSources } from "./manaModel.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const DEVOTEE = { id: "c-dev", name: "Abzan Devotee", type: "Creature — Dog Cleric", mana: "{1}{B}", cmc: 2, power: 2, toughness: 2, keywords: [],
  oracle: "{1}: Add {W}, {B}, or {G}. Activate only once each turn.\n{2}{B}: Return this card from your graveyard to your hand." };
const STRIDER = { id: "c-gs", name: "Gravestone Strider", type: "Artifact Creature — Construct", mana: "{3}", cmc: 3, power: 2, toughness: 2, keywords: [],
  oracle: "{1}: Add one mana of any color. Activate only once each turn.\n{2}, Exile this card from your graveyard: Exile target card from a graveyard." };
const TREASURE = { id: "c-bt", name: "Buried Treasure", type: "Artifact — Treasure", mana: "{2}", cmc: 2, keywords: [],
  oracle: "{T}, Sacrifice this artifact: Add one mana of any color.\n{5}, Exile this card from your graveyard: Discover 5. Activate only as a sorcery." };
const JACK = { id: "c-jack", name: "Jack-o'-Lantern", type: "Artifact", mana: "{1}", cmc: 1, keywords: [],
  oracle: "{1}, {T}, Sacrifice this artifact: Exile up to one target card from a graveyard. Draw a card.\n{1}, Exile this card from your graveyard: Add one mana of any color." };

function board({ battlefield = [], graveyard = [], pool = {} } = {}) {
  const s0 = createGameState({ userDeck: [], aiDeck: [] });
  return { ...s0, turn: 5, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
    players: { ...s0.players, user: { ...s0.players.user, hand: [], graveyard, battlefield, manaPool: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0, ...pool } } } };
}

describe("the tiers", () => {
  it("⭐ Abzan Devotee and Buried Treasure are native-mana; Jack-o'-Lantern (a graveyard MANA ability) and Gravestone Strider (its once-per-turn any-colour line is a separate gap) stay parked", () => {
    expect(classifyCard(DEVOTEE)).toBe("native-mana");
    expect(classifyCard(TREASURE)).toBe("native-mana");
    expect(classifyCard(JACK)).not.toMatch(/^native/);
    expect(classifyCard(STRIDER)).not.toMatch(/^native/);
  });
});

describe("runtime — two zones, two lanes, never both", () => {
  it("⭐ Abzan Devotee on the battlefield is a mana source; its graveyard line is NOT offered there", () => {
    const s = board({ battlefield: [createPermanent({ id: "dev", card: DEVOTEE, controller: "user", summoningSick: false })], pool: { C: 3 } });
    expect(manaSources(s, "user").some((src) => src.permanentId === "dev")).toBe(true);
    expect(filterActions(legalActionsForPlayer(s, "user"), "activate-gy-recursion").length).toBe(0);
  });
  it("⭐ Abzan Devotee in the graveyard: {2}{B} returns it to hand — offered, resolves, moves", () => {
    let s = board({ graveyard: [DEVOTEE], pool: { B: 1, C: 2 } });
    const act = filterActions(legalActionsForPlayer(s, "user"), "activate-gy-recursion").find((a) => a.cardId === "c-dev");
    expect(act).toBeTruthy();
    s = resolveTopOfStack(dispatchAction(s, act));
    expect(s.players.user.hand.map((c) => c.name)).toEqual(["Abzan Devotee"]);
    expect(s.players.user.graveyard.length).toBe(0);
  });
  it("⛔ not offered from the graveyard without the mana", () => {
    const s = board({ graveyard: [DEVOTEE], pool: { B: 1 } });
    expect(filterActions(legalActionsForPlayer(s, "user"), "activate-gy-recursion").find((a) => a.cardId === "c-dev")).toBeUndefined();
  });
});

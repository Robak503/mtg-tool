/**
 * cityOfBrass.test.js — ④-AB (2026-09-03 night): CITY OF BRASS — "Whenever this land becomes tapped, it deals 1 damage to
 * you." (Hulk Smash; a five-colour staple). The becomes-tapped SELF watcher existed (creature / permanent / artifact /
 * name forms) and a land's mana tap already funnels through the same tapPermanent chokepoint; only the noun "this land"
 * was missing from the self-subject list, so the watcher was never detected and the land parked on its own drawback.
 * Real oracle fixture (bundled Scryfall snapshot, read in-session 2026-09-03).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { classifyCard } from "./coverage.js";
import { detectTriggers } from "./triggers.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { flushTriggers, resolveTopOfStack } from "./gameEngine.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const CITY = { id: "c-city", name: "City of Brass", type: "Land", mana: "", cmc: 0, keywords: [], oracle: "Whenever this land becomes tapped, it deals 1 damage to you.\n{T}: Add one mana of any color." };
const SPELL = { id: "h-sp", name: "Cheap Cantrip", type: "Instant", mana: "{U}", mana_cost: "{U}", cmc: 1, keywords: [], oracle: "Draw a card." };

describe("the detection + the tier", () => {
  it("⭐ 'this land' is a self subject for the becomes-tapped watcher; City of Brass sits on the land tier", () => {
    expect(detectTriggers(CITY).map((d) => ({ event: d.event, scope: d.scope }))).toEqual([{ event: "becomesTapped", scope: "self" }]);
    expect(classifyCard(CITY)).toBe("land");
    // ⛔ a WATCHER form ("a creature an opponent controls becomes tapped" — Gideon's Avenger) is not the self shape and
    // stays undetected; a subject test that widened to any subject would fire it as the source's own tap.
    expect(detectTriggers({ id: "c-ga", name: "Gideon's Avenger", type: "Creature — Human Soldier", mana: "{1}{W}{W}", cmc: 3, power: 2, toughness: 3, keywords: [],
      oracle: "Whenever a creature an opponent controls becomes tapped, put a +1/+1 counter on this creature." }).filter((d) => d.event === "becomesTapped")).toEqual([]);
  });
});

describe("runtime — tapping it for mana hurts", () => {
  it("⭐ paying a spell with the City taps it, the watcher fires at the flush, and the controller takes 1", () => {
    const s0 = createGameState({ userDeck: [], aiDeck: [] });
    const s = { ...s0, turn: 4, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
      players: { ...s0.players, user: { ...s0.players.user, life: 20, hand: [SPELL], library: [{ id: "l1", name: "Lib", type: "Sorcery", cmc: 1, keywords: [], oracle: "" }], battlefield: [createPermanent({ id: "city", card: CITY, controller: "user", summoningSick: false })], manaPool: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 } } } };
    const act = legalActionsForPlayer(s, "user").find((a) => a.kind === "cast-spell" && a.cardId === "h-sp");
    expect(act).toBeTruthy();
    const cast = flushTriggers(dispatchAction(s, act));
    expect(cast.players.user.battlefield.find((p) => p.id === "city").tapped).toBe(true);
    expect(cast.stack.map((o) => o.kind)).toEqual(["spell", "triggered-ability"]);
    const afterTrigger = resolveTopOfStack(cast);
    expect(afterTrigger.players.user.life).toBe(19);
  });
});

/**
 * revealLands.test.js — LANDS-TIER slice 7 (2026-09-03): the REVEAL-LANDS (CR 614.1c) — "As this land
 * enters, you may reveal a <Type> [or <Type>] card from your hand. If you don't, this land enters tapped."
 * 19 corpus lands: the Snarls (Vineglimmer, Furycalm …), the SOI shadow lands (Game Trail, Port Town,
 * Fortified Village …), the Lorwyn tribal lands (Secluded Glen "a Faerie card", Gilt-Leaf Palace "an Elf
 * card", Murmuring Bosk "a Treefolk card", Ancient Amphitheater "a Giant card").
 *
 * ONE READER, TWO ENTER SITES, TWO CLASSIFIER SITES — the LANDS-1 shape. THE WRITTEN POLICY: a matching card
 * in hand is always revealed (revealing costs nothing — CR 701.15a — and an untapped land is worth more than
 * hiding one card), so the gate is automatic at both sites; the hidden-information side (an opponent seeing
 * the card) is not modeled and is named as a limit, never faked. The entering land is never in the hand at
 * either site, so the scan is exactly the rest of the hand.
 *
 * Real oracle fixtures (bundled Scryfall snapshot, read in-session 2026-09-03).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { createGameState, _resetIdsForTests } from "./gameState.js";
import { dispatchAction } from "./actionDispatcher.js";
import { enterPermanent } from "./resolvers.js";
import { revealLandTypes, revealLandEntersTapped } from "./landEntersTapped.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const L = (name, oracle) => ({ id: "c-" + name.replace(/\W+/g, "").toLowerCase(), name, type: "Land", oracle });
const GAME_TRAIL = L("Game Trail", "As this land enters, you may reveal a Mountain or Forest card from your hand. If you don't, this land enters tapped.\n{T}: Add {R} or {G}.");
const GILT_LEAF = L("Gilt-Leaf Palace", "As this land enters, you may reveal an Elf card from your hand. If you don't, this land enters tapped.\n{T}: Add {B} or {G}.");
const SECLUDED_GLEN = L("Secluded Glen", "As this land enters, you may reveal a Faerie card from your hand. If you don't, this land enters tapped.\n{T}: Add {U} or {B}.");
const TEMPLE_DQ = L("Temple of the Dragon Queen", "As this land enters, you may reveal a Dragon card from your hand. This land enters tapped unless you revealed a Dragon card this way or you control a Dragon.\n{T}: Add one mana of any color.");
const RIDER = L("Probe Rider", "As this land enters, you may reveal a Mountain card from your hand. If you don't, this land enters tapped. When it enters untapped, draw a card.\n{T}: Add {R}.");

const FOREST = { id: "h-forest", name: "Forest", type: "Basic Land — Forest", oracle: "" };
const ISLAND = { id: "h-island", name: "Island", type: "Basic Land — Island", oracle: "" };
const FAERIE = { id: "h-faerie", name: "Spellstutter Sprite", type: "Creature — Faerie Wizard", oracle: "", power: 1, toughness: 1 };
const MDFC_BACK_FOREST = { id: "h-mdfc", name: "Probe MDFC", type: "Creature — Elf // Land — Forest", oracle: "" };

const twoSeat = () => createGameState({ userDeck: [], aiDeck: [] });
const withHand = (state, hand) => ({ ...state, players: { ...state.players, user: { ...state.players.user, hand } } });

/** Play `card` via the real play-land action with `hand` as the REST of the hand; returns the tapped flag. */
function playLand(state, card, hand) {
  const st = {
    ...state, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
    players: { ...state.players, user: { ...state.players.user, hand: [{ ...card, id: "L" }, ...hand], battlefield: [], landsPlayedThisTurn: 0 } },
  };
  const out = dispatchAction(st, { kind: "play-land", playerId: "user", cardId: "L" });
  const p = out.players.user.battlefield.find((x) => x.card?.name === card.name);
  if (!p) throw new Error("land did not enter");
  return p.tapped;
}

describe("the reader — exactly the printed sentence", () => {
  it("reads one or two type words, lowercased", () => {
    expect(revealLandTypes(GAME_TRAIL)).toEqual(["mountain", "forest"]);
    expect(revealLandTypes(GILT_LEAF)).toEqual(["elf"]);
  });

  it("⛔ refuses the 'unless you revealed … or you control' continuation and a rider", () => {
    expect(revealLandTypes(TEMPLE_DQ)).toBe(null);
    expect(revealLandTypes(RIDER)).toBe(null);
  });
});

describe("play-land path — auto-reveal-if-able", () => {
  it("Game Trail: untapped with a Forest in hand, tapped with only an Island", () => {
    expect(playLand(twoSeat(), GAME_TRAIL, [FOREST, ISLAND])).toBe(false);
    expect(playLand(twoSeat(), GAME_TRAIL, [ISLAND])).toBe(true);
    expect(playLand(twoSeat(), GAME_TRAIL, [])).toBe(true);
  });

  it("a CREATURE-type reveal reads the creature's subtypes (Secluded Glen + a Faerie)", () => {
    expect(playLand(twoSeat(), SECLUDED_GLEN, [FAERIE])).toBe(false);
    expect(playLand(twoSeat(), SECLUDED_GLEN, [FOREST])).toBe(true);
  });

  it("⛔ FRONT face only (CR 712.4a): an MDFC whose BACK is a Forest does not reveal as one", () => {
    expect(playLand(twoSeat(), GAME_TRAIL, [MDFC_BACK_FOREST])).toBe(true);
  });

  it("the land itself is never counted (it has left the hand): a lone Game Trail enters tapped", () => {
    expect(playLand(twoSeat(), GAME_TRAIL, [])).toBe(true);
  });
});

describe("tutor site — resolvers.enterPermanent reads the same gate", () => {
  it("untapped with a Mountain in hand, tapped without", () => {
    const MOUNTAIN = { id: "h-mtn", name: "Mountain", type: "Basic Land — Mountain", oracle: "" };
    const a = enterPermanent(withHand(twoSeat(), [MOUNTAIN]), GAME_TRAIL, "user");
    expect(a.players.user.battlefield.find((p) => p.card.name === GAME_TRAIL.name).tapped).toBe(false);
    const b = enterPermanent(withHand(twoSeat(), [ISLAND]), GAME_TRAIL, "user");
    expect(b.players.user.battlefield.find((p) => p.card.name === GAME_TRAIL.name).tapped).toBe(true);
  });

  it("the helper: false when no clause, false when a match is in hand, true when none", () => {
    expect(revealLandEntersTapped(withHand(twoSeat(), []), { name: "Plain", type: "Land", oracle: "{T}: Add {C}." }, "user")).toBe(false);
    expect(revealLandEntersTapped(withHand(twoSeat(), [FOREST]), GAME_TRAIL, "user")).toBe(false);
    expect(revealLandEntersTapped(withHand(twoSeat(), [ISLAND]), GAME_TRAIL, "user")).toBe(true);
  });
});

describe("classification — credited only through the same reader", () => {
  it("the reveal-lands flip to `land`; the unless-continuation and the rider stay land-partial", () => {
    expect(classifyCard(GAME_TRAIL)).toBe("land");
    expect(classifyCard(GILT_LEAF)).toBe("land");
    expect(classifyCard(SECLUDED_GLEN)).toBe("land");
    expect(classifyCard(TEMPLE_DQ)).toBe("land-partial");
    expect(classifyCard(RIDER)).toBe("land-partial");
  });
});

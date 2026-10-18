/**
 * nonbasicLandsEnterTapped.test.js — the play-weighted program: the opponents-enter-tapped imposition over NONBASIC lands.
 *
 *   Thalia, Heretic Cathar (#1476): "First strike / Creatures and nonbasic lands your opponents control enter tapped."
 *   Archon of Emeria (#2115):       "Flying / Each player can't cast more than one spell each turn. / Nonbasic lands your
 *                                    opponents control enter tapped."
 *
 * The imposition (CR 614.1c, every entry chokepoint — staticAbilityParser.impositionEntersTapped) read bare type words only;
 * "nonbasic lands" now joins them as its own entry: a land without the basic supertype (CR 205.4c), read off the face that is
 * up (a transform card's back face is not what enters). A basic land — snow basics included — still enters untapped.
 *
 * The bundled rulings: an opponent's land that "enters tapped unless a condition is met" enters tapped under either even when
 * the condition is met (the imposition is its own replacement); Thalia entering at the same time as an opponent's permanents
 * doesn't affect them.
 *
 * Real oracle fixtures (bundled Scryfall via cardIndex.publicCard, 2026-10-17; the trailing comment is the tier BEFORE this
 * slice).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard, isNativeTier } from "./coverage.js";
import { opponentsEnterTappedTypesOf, impositionEntersTapped } from "./staticAbilityParser.js";
import { applyEnterReplacements } from "./enterReplacements.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

// ── real card fixtures (bundled Scryfall, cardIndex.publicCard) ──
const THALIA = {"name":"Thalia, Heretic Cathar","type":"Legendary Creature — Human Soldier","mana":"{2}{W}","cmc":3,"power":"3","toughness":"2","keywords":["First strike"],"colors":["W"],"oracle":"First strike\nCreatures and nonbasic lands your opponents control enter tapped."}; // body-only #1476
const ARCHON = {"name":"Archon of Emeria","type":"Creature — Archon","mana":"{2}{W}","cmc":3,"power":"2","toughness":"3","keywords":["Flying"],"colors":["W"],"oracle":"Flying\nEach player can't cast more than one spell each turn.\nNonbasic lands your opponents control enter tapped."}; // body-only #2115
const GITROG = {"name":"Thalia and The Gitrog Monster","type":"Legendary Creature — Human Frog Horror","mana":"{1}{W}{B}{G}","cmc":4,"power":"4","toughness":"4","keywords":["First strike","Deathtouch"],"colors":["B","G","W"],"oracle":"First strike, deathtouch\nYou may play an additional land on each of your turns.\nCreatures and nonbasic lands your opponents control enter tapped.\nWhenever Thalia and The Gitrog Monster attacks, sacrifice a creature or land, then draw a card."}; // body-only #3939
const TOWER = {"name":"Command Tower","type":"Land","mana":"","cmc":0,"keywords":[],"colors":[],"oracle":"{T}: Add one mana of any color in your commander's color identity."}; // land #2
const FOREST = {"name":"Forest","type":"Basic Land — Forest","mana":"","cmc":0,"keywords":[],"colors":[],"oracle":"({T}: Add {G}.)"}; // land
const SNOW_FOREST = {"name":"Snow-Covered Forest","type":"Basic Snow Land — Forest","mana":"","cmc":0,"keywords":[],"colors":[],"oracle":"({T}: Add {G}.)"}; // land
const COMPASS = {"name":"Thaumatic Compass // Spires of Orazca","type":"Artifact // Land","mana":"{2}","cmc":2,"keywords":["Transform"],"colors":[],"oracle":"Thaumatic Compass - Artifact {2}\n{3}, {T}: Search your library for a basic land card, reveal it, put it into your hand, then shuffle.\nAt the beginning of your end step, if you control seven or more lands, transform this artifact.\n//\nSpires of Orazca - Land \n(Transforms from Thaumatic Compass.)\n{T}: Add {C}.\n{T}: Untap target attacking creature an opponent controls and remove it from combat."}; // body-only #5223
const BEARS = {"name":"Grizzly Bears","type":"Creature — Bear","mana":"{1}{G}","cmc":2,"power":"2","toughness":"2","keywords":[],"colors":["G"],"oracle":""}; // native-body
const MIND_STONE = {"name":"Mind Stone","type":"Artifact","mana":"{2}","cmc":2,"keywords":[],"colors":[],"oracle":"{T}: Add {C}.\n{1}, {T}, Sacrifice this artifact: Draw a card."}; // native-mana #32

const P = (id, card, controller) => createPermanent({ id, card: { id: `c-${id}`, ...card }, controller, summoningSick: false });

/** Does the imposition `source` (on the user's side) tap `entering` as it enters under the AI (or `who`)? */
function taps(source, entering, who = "ai") {
  const s0 = createGameState({ userDeck: [], aiDeck: [] });
  const s = { ...s0, players: { ...s0.players, user: { ...s0.players.user, battlefield: [P("src", source, "user")] } } };
  return impositionEntersTapped(s, { id: "e1", ...entering }, who);
}

/** Two seats; the imposition on the user's side; the AI holds `hand` in its own main phase. */
function aiTurn({ user = [], hand = [] } = {}) {
  const s0 = createGameState({ userDeck: [], aiDeck: [] });
  const players = { ...s0.players };
  for (const pid of Object.keys(players)) players[pid] = { ...players[pid], battlefield: [], hand: [], graveyard: [], library: [], life: 20, landsPlayedThisTurn: 0 };
  players.user = { ...players.user, battlefield: user };
  players.ai = { ...players.ai, hand };
  return { ...s0, players, turn: 6, phase: "precombat-main", step: "main", activePlayer: "ai", priorityHolder: "ai", consecutivePasses: 0, stack: [] };
}
/** `pid` plays the land `cardId` from hand (the offered land drop); returns whether it entered tapped. */
function playLand(s, pid, cardId) {
  const a = legalActionsForPlayer(s, pid).find((x) => x.kind === "play-land" && x.cardId === cardId);
  expect(a).toBeTruthy();
  const next = dispatchAction(s, a);
  const entered = next.players[pid].battlefield.find((p) => p.card?.id === cardId);
  expect(entered).toBeTruthy();
  return entered.tapped;
}

describe("THE READ — 'nonbasic lands' is a type entry of its own", () => {
  it("⭐ Thalia → creatures + nonbasic lands; Archon of Emeria → nonbasic lands", () => {
    expect({ thalia: [...(opponentsEnterTappedTypesOf(THALIA) || [])].sort(), archon: [...(opponentsEnterTappedTypesOf(ARCHON) || [])] })
      .toEqual({ thalia: ["Creature", "NonbasicLand"], archon: ["NonbasicLand"] });
  });

  it("⭐ Thalia, Heretic Cathar and Archon of Emeria classify native", () => {
    for (const c of [THALIA, ARCHON]) expect([c.name, isNativeTier(classifyCard(c))]).toEqual([c.name, true]);
  });

  it("CREED — Thalia and The Gitrog Monster stays parked (its attack trigger); a snow or 'played by' subject stays unread", () => {
    expect(isNativeTier(classifyCard(GITROG))).toBe(false);
    expect(opponentsEnterTappedTypesOf({ oracle: "Snow lands your opponents control enter tapped." })).toBeNull();
    expect(opponentsEnterTappedTypesOf({ oracle: "Nonbasic lands played by your opponents enter tapped." })).toBeNull();
  });
});

describe("ENFORCEMENT — the imposition reader", () => {
  it("⭐ Archon taps the AI's nonbasic land; Thalia taps the AI's nonbasic land and its creature", () => {
    expect({ archonTower: taps(ARCHON, TOWER), thaliaTower: taps(THALIA, TOWER), thaliaBears: taps(THALIA, BEARS) })
      .toEqual({ archonTower: true, thaliaTower: true, thaliaBears: true });
  });

  it("control — a basic land (a snow basic too) enters untapped under either; Archon taps no creature and no artifact", () => {
    expect({
      archonForest: taps(ARCHON, FOREST), thaliaForest: taps(THALIA, FOREST), thaliaSnow: taps(THALIA, SNOW_FOREST),
      archonBears: taps(ARCHON, BEARS), archonStone: taps(ARCHON, MIND_STONE),
    }).toEqual({ archonForest: false, thaliaForest: false, thaliaSnow: false, archonBears: false, archonStone: false });
  });

  it("control — the face that is up: Thaumatic Compass (Artifact // Land) enters as an artifact, untapped under Archon", () => {
    expect(taps(ARCHON, COMPASS)).toBe(false);
  });

  it("control — 'your opponents': the imposition's controller's own nonbasic land is untouched", () => {
    expect(taps(ARCHON, TOWER, "user")).toBe(false);
  });
});

describe("RUNTIME — the land drop and an effect's entry", () => {
  it("⭐ the AI's Command Tower played under the user's Archon of Emeria enters tapped", () => {
    expect(playLand(aiTurn({ user: [P("archon", ARCHON, "user")], hand: [{ ...TOWER, id: "tower" }] }), "ai", "tower")).toBe(true);
  });

  it("⭐ the AI's Command Tower played under the user's Thalia enters tapped", () => {
    expect(playLand(aiTurn({ user: [P("thalia", THALIA, "user")], hand: [{ ...TOWER, id: "tower" }] }), "ai", "tower")).toBe(true);
  });

  it("control — the AI's Forest enters untapped under Archon", () => {
    expect(playLand(aiTurn({ user: [P("archon", ARCHON, "user")], hand: [{ ...FOREST, id: "forest" }] }), "ai", "forest")).toBe(false);
  });

  it("⭐ an effect putting the AI's nonbasic land onto the battlefield (the shared enter replacements) enters it tapped", () => {
    const s = aiTurn({ user: [P("archon", ARCHON, "user")] });
    const base = createPermanent({ id: "eff-tower", card: { id: "c-eff-tower", ...TOWER }, controller: "ai", summoningSick: false });
    expect(applyEnterReplacements(s, base).perm.tapped).toBe(true);
  });
});

/**
 * selfGraveyardCast.test.js — "You may cast this card from your graveyard as long as <condition>" (shelf decks D31,
 * 2026-09-30: Shorikai Vehicles' The Indomitable; Gravecrawler).
 *
 * An ability that works FROM the graveyard (CR 113.6b): legalChoices offers the card from its owner's graveyard while the
 * condition holds as the cast begins (CR 601.3), through the shared graveyard cast builder (full cost, timing). The condition is
 * the shared reader's (interveningIf) — injected into the static parser (registerSelfGraveyardCastConditionReader, an import
 * would be a cycle), so a condition it cannot read parks the line. The reader's type union now reads "and/or".
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-09-30; cmc from each mana cost).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { chooseTriggerTargets, flushTriggers, resolveTopOfStack } from "./gameEngine.js";
import { resolveTutorChoice } from "./effects/runProgram.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { parseStaticAbilities } from "./staticAbilityParser.js";
import { evaluateInterveningIf, interveningIfParseable } from "./interveningIf.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const INDOMITABLE = { name: "The Indomitable", type: "Legendary Artifact — Vehicle", mana: "{2}{U}{U}", cmc: 4, power: "6", toughness: "6", keywords: ["Crew", "Trample"],
  oracle: "Trample\nWhenever a creature you control deals combat damage to a player, draw a card.\nCrew 3\nYou may cast this card from your graveyard as long as you control three or more tapped Pirates and/or Vehicles." };
const GRAVECRAWLER = { name: "Gravecrawler", type: "Creature — Zombie", mana: "{B}", cmc: 1, power: "2", toughness: "1", keywords: [],
  oracle: "This creature can't block.\nYou may cast this card from your graveyard as long as you control a Zombie." };
const PROWLER = { name: "Marang River Prowler", type: "Creature — Human Rogue", mana: "{2}{U}", cmc: 3, power: "2", toughness: "1", keywords: [],
  oracle: "This creature can't block and can't be blocked.\nYou may cast this card from your graveyard as long as you control a black or green permanent." };
const COPTER = { name: "Smuggler's Copter", type: "Artifact — Vehicle", mana: "{2}", cmc: 2, power: "3", toughness: "3", keywords: ["Flying", "Crew"],
  oracle: "Flying\nWhenever this Vehicle attacks or blocks, you may draw a card. If you do, discard a card.\nCrew 1 (Tap any number of creatures you control with total power 1 or more: This Vehicle becomes an artifact creature until end of turn.)" };
const BRUTE = { name: "Headstrong Brute", type: "Creature — Orc Pirate", mana: "{2}{R}", cmc: 3, power: "3", toughness: "3", keywords: [],
  oracle: "This creature can't block.\nThis creature has menace as long as you control another Pirate." };
const TEND = { name: "Tend the Sprigs", type: "Sorcery", mana: "{2}{G}", cmc: 3, keywords: [],
  oracle: "Search your library for a basic land card, put it onto the battlefield tapped, then shuffle. Then if you control seven or more lands and/or Treefolk, create a 3/4 green Treefolk creature token with reach. (It can block creatures with flying.)" };
const SEEDLINGS = { name: "Treefolk Seedlings", type: "Creature — Treefolk", mana: "{2}{G}", cmc: 3, power: "2", toughness: "*", keywords: [], oracle: "Treefolk Seedlings's toughness is equal to the number of Forests you control." };
const FOREST = { name: "Forest", type: "Basic Land — Forest", mana: "", cmc: 0, keywords: [], oracle: "({T}: Add {G}.)" };
const GHOUL = { name: "Diregraf Ghoul", type: "Creature — Zombie", mana: "{B}", cmc: 1, power: "2", toughness: "2", keywords: [], oracle: "This creature enters tapped." };

function table({ user = [], graveyard = [], hand = [], library = [], mana = {} } = {}) {
  const g = createGameState({ userDeck: [], aiDeck: [] });
  return { ...g, turn: 6, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main", stack: [], pendingTriggers: [],
    players: { ...g.players, user: { ...g.players.user, battlefield: user, graveyard: graveyard.map(([id, c]) => ({ ...c, id })), hand: hand.map(([id, c]) => ({ ...c, id })), library: library.map(([id, c]) => ({ ...c, id })), manaPool: { ...g.players.user.manaPool, ...mana } } } };
}
const P = (id, c, extra = {}) => ({ ...createPermanent({ id, card: { ...c, id: `c-${id}` }, controller: "user", summoningSick: false }), ...extra });
/** Resolve the stack, putting any triggers that fire onto it — and fail loudly if a resolver crashed (logged, not thrown). */
function settle(s) {
  let n = s, g = 0;
  while ((n.stack?.length || n.pendingTriggers?.length) && !n.pendingChoice && g++ < 30) n = n.stack?.length ? resolveTopOfStack(n) : flushTriggers(n, { chooseTargets: chooseTriggerTargets });
  const crash = (n.log || []).find((e) => e.kind === "stack-resolve-error");
  if (crash) throw new Error(`a resolver crashed: ${crash.error}`);
  return n;
}
const gyCasts = (s) => legalActionsForPlayer(s, "user").filter((a) => a.kind === "cast-spell" && s.players.user.graveyard.some((c) => c.id === a.cardId)).map((a) => a.cardId).sort();

describe("the cards", () => {
  it("The Indomitable and Gravecrawler read native; the marker carries the condition; an unreadable condition parks (Marang River Prowler)", () => {
    expect({
      marker: parseStaticAbilities(INDOMITABLE).filter((d) => d.castSelfFromGraveyard),
      tiers: [classifyCard(INDOMITABLE), classifyCard(GRAVECRAWLER)],
      prowler: classifyCard(PROWLER),
    }).toEqual({
      marker: [{ castSelfFromGraveyard: true, condition: "you control three or more tapped pirates and/or vehicles" }],
      tiers: [expect.stringMatching(/^native/), expect.stringMatching(/^native/)],
      prowler: expect.not.stringMatching(/^native/),
    });
  });
  it("the reader's type union reads \"and/or\": a Pirate and a Vehicle each count once", () => {
    const cond = "you control two or more tapped Pirates and/or Vehicles";
    const s = table({ user: [P("brute", BRUTE, { tapped: true }), P("copter", COPTER, { tapped: true })] });
    expect({ readable: interveningIfParseable(cond), holds: evaluateInterveningIf(s, cond, "user") }).toEqual({ readable: true, holds: true });
  });
});

describe("⭐ in play", () => {
  it("⭐ The Indomitable: three TAPPED Pirates and/or Vehicles → castable from the graveyard, and it resolves; one of them untapped → not", () => {
    const three = table({ user: [P("brute", BRUTE, { tapped: true }), P("c1", COPTER, { tapped: true }), P("c2", COPTER, { tapped: true })], graveyard: [["indom", INDOMITABLE]], mana: { U: 2, C: 2 } });
    const two = table({ user: [P("brute", BRUTE, { tapped: true }), P("c1", COPTER, { tapped: true }), P("c2", COPTER)], graveyard: [["indom", INDOMITABLE]], mana: { U: 2, C: 2 } });
    const cast = settle(dispatchAction(three, legalActionsForPlayer(three, "user").find((a) => a.kind === "cast-spell" && a.cardId === "indom")));
    const row = { withThree: gyCasts(three), withTwo: gyCasts(two), resolved: cast.players.user.battlefield.some((p) => p.card?.id === "indom"), leftGraveyard: !cast.players.user.graveyard.some((c) => c.id === "indom") };
    console.log(`WITNESS indomitable ${JSON.stringify(row)}`);
    expect(row).toEqual({ withThree: ["indom"], withTwo: [], resolved: true, leftGraveyard: true });
  });
  it("Gravecrawler: castable from the graveyard while you control a Zombie, not otherwise", () => {
    const withZombie = table({ user: [P("ghoul", GHOUL)], graveyard: [["crawler", GRAVECRAWLER]], mana: { B: 1 } });
    const without = table({ graveyard: [["crawler", GRAVECRAWLER]], mana: { B: 1 } });
    expect({ withZombie: gyCasts(withZombie), without: gyCasts(without) }).toEqual({ withZombie: ["crawler"], without: [] });
  });
});

describe("⭐ the and/or union in play — Tend the Sprigs (reached by it, verified)", () => {
  /** Cast it over <lands> Forests (+ extra permanents), fetch the library Forest, and count the Treefolk tokens. */
  function tend(lands, extra = []) {
    const s0 = table({ user: [...Array.from({ length: lands }, (_, i) => P(`f${i}`, FOREST)), ...extra], hand: [["tend", TEND]], library: [["libForest", FOREST]], mana: { G: 1, C: 2 } });
    let s = settle(dispatchAction(s0, legalActionsForPlayer(s0, "user").find((a) => a.kind === "cast-spell" && a.cardId === "tend")));
    if (s.pendingChoice?.kind === "tutor-search") s = settle(resolveTutorChoice(s, "libForest"));
    return s.players.user.battlefield.filter((p) => p.card?.token && /Treefolk/.test(String(p.card?.type))).length;
  }
  it("six Forests + the fetched one make seven → a Treefolk; five Forests and a Treefolk make seven too (each counted once); five Forests alone → none", () => {
    const row = { sixLands: tend(6), fiveAndTreefolk: tend(5, [P("seed", SEEDLINGS)]), fiveAlone: tend(5) };
    console.log(`WITNESS tendTheSprigs ${JSON.stringify(row)}`);
    expect(row).toEqual({ sixLands: 1, fiveAndTreefolk: 1, fiveAlone: 0 });
  });
});

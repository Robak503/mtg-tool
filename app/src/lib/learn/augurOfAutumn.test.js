/**
 * augurOfAutumn.test.js — AUGUR OF AUTUMN (the play-weighted program, EDHREC #1141):
 *
 *   "You may look at the top card of your library any time."
 *   "You may play lands from the top of your library."
 *   "Coven — As long as you control three or more creatures with different powers, you may cast creature spells from the top of your library."
 *
 * The coven gate (staticAbilityParser.playFromTopPermission — the permission's `coven` condition): the creatures its controller controls,
 * as they are now (layer-aware power), show three or more different powers (its rulings: a 1/1, a 2/1 and another 2/1 are not three).
 * While it holds, a creature card on top is a cast from the library under the cast's own timing (its ruling: a flash creature whenever an
 * instant could be cast); it is checked as the cast is proposed (CR 601.3). Witnessed through real game states, the person and the AI.
 *
 * Card text: the bundled Scryfall oracle (cardIndex.publicCard → learnDeckEnrich.mergeCardData), generated, never typed.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { finalizeStackResolution, resolveTopOfStack } from "./gameEngine.js";
import { pickAction } from "./opponentAI.js";
import { classifyCard, isNativeTier } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const AUGUR = {"name":"Augur of Autumn","type":"Creature — Human Druid","mana":"{1}{G}{G}","oracle":"You may look at the top card of your library any time.\nYou may play lands from the top of your library.\nCoven — As long as you control three or more creatures with different powers, you may cast creature spells from the top of your library.","layout":"normal","cmc":3,"power":"2","toughness":"3","loyalty":null,"keywords":["Coven"],"colors":["G"],"colorIdentity":["G"]}; // EDHREC #1141
const ELVES = {"name":"Llanowar Elves","type":"Creature — Elf Druid","mana":"{G}","oracle":"{T}: Add {G}.","layout":"normal","cmc":1,"power":"1","toughness":"1","loyalty":null,"keywords":[],"colors":["G"],"colorIdentity":["G"]}; // EDHREC #58
const BEARS = {"name":"Grizzly Bears","type":"Creature — Bear","mana":"{1}{G}","oracle":"","layout":"normal","cmc":2,"power":"2","toughness":"2","loyalty":null,"keywords":[],"colors":["G"],"colorIdentity":["G"]}; // EDHREC #8126
const GIANT = {"name":"Hill Giant","type":"Creature — Giant","mana":"{3}{R}","oracle":"","layout":"normal","cmc":4,"power":"3","toughness":"3","loyalty":null,"keywords":[],"colors":["R"],"colorIdentity":["R"]}; // EDHREC #29123
const BOLT = {"name":"Lightning Bolt","type":"Instant","mana":"{R}","oracle":"Lightning Bolt deals 3 damage to any target.","layout":"normal","cmc":1,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["R"],"colorIdentity":["R"]}; // EDHREC #157
const FOREST = {"name":"Forest","type":"Basic Land — Forest","mana":"","oracle":"({T}: Add {G}.)","layout":"normal","cmc":0,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":["G"]}; // EDHREC #—
const VIPER = {"name":"Ambush Viper","type":"Creature — Snake","mana":"{1}{G}","oracle":"Flash\nDeathtouch","layout":"normal","cmc":2,"power":"2","toughness":"1","loyalty":null,"keywords":["Flash","Deathtouch"],"colors":["G"],"colorIdentity":["G"]}; // EDHREC #4832

const on = (seat, id, card, extra = {}) => ({ ...createPermanent({ id, card: { ...card, id: `c-${id}` }, controller: seat, summoningSick: false }), ...extra });
/**
 * `seat`'s precombat main (or the other seat's turn with `theirTurn`): Augur of Autumn and `board` for `seat`, `foes` for the other seat,
 * `top` the top of `seat`'s library (then two Forests), `pool` floating.
 */
function table({ seat = "user", board = [], foes = [], top = BEARS, pool = { G: 2, C: 2 }, theirTurn = false } = {}) {
  const g = createGameState({ userDeck: [], aiDeck: [] });
  const other = seat === "user" ? "ai" : "user";
  const players = { ...g.players };
  for (const pid of Object.keys(players)) {
    const mine = pid === seat;
    players[pid] = { ...players[pid], graveyard: [], hand: [], landsPlayedThisTurn: 0,
      battlefield: mine ? [on(pid, "augur", AUGUR), ...board] : foes,
      library: mine ? [{ ...top, id: "top" }, { ...FOREST, id: "l1" }, { ...FOREST, id: "l2" }] : [],
      manaPool: mine ? { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0, ...pool } : { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 } };
  }
  const active = theirTurn ? other : seat;
  return { ...g, turn: 5, phase: "precombat-main", step: "main", activePlayer: active, priorityHolder: seat, consecutivePasses: 0, players };
}
const fromTop = (s, seat = "user") => legalActionsForPlayer(s, seat).filter((a) => (a.kind === "cast-spell" || a.kind === "play-land") && a.cardId === "top");
const castTop = (s, seat = "user") => fromTop(s, seat).filter((a) => a.kind === "cast-spell");
const elvesP1 = () => on("user", "elves", ELVES); // power 1
const giantP3 = () => on("user", "giant", GIANT); // power 3

describe("the card", () => {
  it("⭐ native: every line plays", () => {
    expect(isNativeTier(classifyCard(AUGUR))).toBe(true);
  });
});

describe("coven: three or more creatures with different powers", () => {
  it("⭐ the Augur (2), Llanowar Elves (1) and Hill Giant (3): the top creature card is cast from the library", () => {
    const s0 = table({ board: [elvesP1(), giantP3()] });
    const offers = castTop(s0);
    expect(offers.length, "Grizzly Bears on top is not offered").toBeGreaterThan(0);
    let s = resolveTopOfStack(dispatchAction(s0, offers[0]));
    s = finalizeStackResolution(s);
    expect({ library: s.players.user.library.map((c) => c.id), bears: s.players.user.battlefield.some((p) => p.card?.name === "Grizzly Bears"), pool: s.players.user.manaPool.G + s.players.user.manaPool.C })
      .toEqual({ library: ["l1", "l2"], bears: true, pool: 2 });
  });
  it("⭐ its ruling — a flash creature on top may be cast whenever an instant could: Ambush Viper in the opponent's turn", () => {
    expect(castTop(table({ board: [elvesP1(), giantP3()], top: VIPER, theirTurn: true })).length).toBeGreaterThan(0);
  });
  it("⭐ the power that counts is the power now: Grizzly Bears with a +1/+1 counter is a 3", () => {
    const pumped = on("user", "bears2", BEARS, { counters: { "+1/+1": 1 } });
    expect(castTop(table({ board: [elvesP1(), pumped] })).length).toBeGreaterThan(0);
  });
  it("only two different powers (the Augur 2, Bears 2, Elves 1): no creature cast from the top", () => {
    expect(castTop(table({ board: [elvesP1(), on("user", "bears2", BEARS)] })).length).toBe(0);
  });
  it("its ruling — each power must differ: the Augur (2) and two Llanowar Elves (1, 1) are not three", () => {
    expect(castTop(table({ board: [elvesP1(), on("user", "elves2", ELVES)] })).length).toBe(0);
  });
  it("an opponent's creatures don't count: the AI's Hill Giant beside the Augur and the Elves", () => {
    expect(castTop(table({ board: [elvesP1()], foes: [on("ai", "giant", GIANT)] })).length).toBe(0);
  });
  it("a noncreature card on top (Lightning Bolt) is never cast from there, coven or not", () => {
    expect(castTop(table({ board: [elvesP1(), giantP3()], top: BOLT, pool: { R: 1 } })).length).toBe(0);
  });
  it("a creature without flash is cast from the top only when a sorcery could be: not in the opponent's turn", () => {
    expect(castTop(table({ board: [elvesP1(), giantP3()], theirTurn: true })).length).toBe(0);
  });
  it("lands from the top play as ever, coven or not: a Forest on top is a land play", () => {
    expect(fromTop(table({ top: FOREST })).map((a) => a.kind)).toEqual(["play-land"]);
  });
});

describe("the default AI", () => {
  it("⭐ with coven, it casts the creature card on top of its library", () => {
    const s = table({ seat: "ai", board: [on("ai", "elves", ELVES), on("ai", "giant", GIANT)] });
    const pick = pickAction(s, "ai", legalActionsForPlayer(s, "ai"));
    expect({ kind: pick?.kind, card: pick?.cardId }).toEqual({ kind: "cast-spell", card: "top" });
  });
});

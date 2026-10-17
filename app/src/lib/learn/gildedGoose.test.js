/**
 * gildedGoose.test.js — the play-weighted program, #803 Gilded Goose.
 *
 *   "Flying
 *    When this creature enters, create a Food token. (It's an artifact with "{2}, {T}, Sacrifice this token: You gain 3 life.")
 *    {1}{G}, {T}: Create a Food token.
 *    {T}, Sacrifice a Food: Add one mana of any color."
 *
 * A mana ability whose cost sacrifices another permanent was refused (a consumable cost the planner could not pay — phantom mana
 * otherwise), except "Sacrifice a creature" (the Altars, SG-3), which the commit pays for real. "Sacrifice a Food" now rides the
 * same machinery with its own victim kind: the source is offered only while its controller controls a Food (CR 118.3 — no Food,
 * no activation), the commit sacrifices one — the least valuable, through the cost sacrifice (dies and sacrifice watchers fire) —
 * and a planned payment holds it back like every one-shot source (spent only when nothing else pays). "A Food" is any Food
 * artifact (CR 205.3g; the card's ruling — Tough Cookie, an Artifact Creature — Food Golem, is one). One Food pays one cost (the
 * card's ruling): a Food the action's own costs still need is never fed to the Goose.
 *
 * Real oracle fixtures (bundled Scryfall via cardIndex.publicCard, 2026-10-17; the trailing comment is the tier BEFORE this
 * slice). Runtime cases run through manaSources, the explicit tap and the cast offer (legalActionsForPlayer + dispatchAction).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard, isNativeTier } from "./coverage.js";
import { manaProduction, manaSources } from "./manaModel.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { passPriority } from "./gameEngine.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

// ── real card fixtures (bundled Scryfall, cardIndex.publicCard) ──
const GOOSE = {"name":"Gilded Goose","type":"Creature — Bird","mana":"{G}","cmc":1,"power":"0","toughness":"2","keywords":["Flying","Food"],"colors":["G"],"oracle":"Flying\nWhen this creature enters, create a Food token. (It's an artifact with \"{2}, {T}, Sacrifice this token: You gain 3 life.\")\n{1}{G}, {T}: Create a Food token.\n{T}, Sacrifice a Food: Add one mana of any color."}; // body-only #803
const COOKIE = {"name":"Tough Cookie","type":"Artifact Creature — Food Golem","mana":"{1}{G}","cmc":2,"power":"2","toughness":"2","keywords":["Food"],"colors":["G"],"oracle":"When this creature enters, create a Food token. (It's an artifact with \"{2}, {T}, Sacrifice this token: You gain 3 life.\")\n{2}{G}: Until end of turn, target noncreature artifact you control becomes a 4/4 artifact creature.\n{2}, {T}, Sacrifice this creature: You gain 3 life."}; // native-mixed
const MYCON = {"name":"Utopia Mycon","type":"Creature — Fungus","mana":"{G}","cmc":1,"power":"0","toughness":"2","keywords":[],"colors":["G"],"oracle":"At the beginning of your upkeep, put a spore counter on this creature.\nRemove three spore counters from this creature: Create a 1/1 green Saproling creature token.\nSacrifice a Saproling: Add one mana of any color."}; // body-only
const KCI = {"name":"Krark-Clan Ironworks","type":"Artifact","mana":"{4}","cmc":4,"keywords":[],"colors":[],"oracle":"Sacrifice an artifact: Add {C}{C}."}; // body-only
const PHYREXIAN_ALTAR = {"name":"Phyrexian Altar","type":"Artifact","mana":"{3}","cmc":3,"keywords":[],"colors":[],"oracle":"Sacrifice a creature: Add one mana of any color."}; // native-mana
const BEARS = {"name":"Grizzly Bears","type":"Creature — Bear","mana":"{1}{G}","cmc":2,"power":"2","toughness":"2","keywords":[],"colors":["G"],"oracle":""}; // native-body
const FOREST = {"name":"Forest","type":"Basic Land — Forest","mana":"","cmc":0,"keywords":[],"colors":[],"oracle":"({T}: Add {G}.)"}; // land
const FOOD = { name: "Food", type: "Token Artifact — Food", token: true, oracle: "{2}, {T}, Sacrifice this token: You gain 3 life." };

const P = (id, card, controller, over = {}) => ({ ...createPermanent({ id, card: { id: `c-${id}`, ...card }, controller, summoningSick: false }), ...over });

function table({ user = [], ai = [], hand = [] } = {}) {
  const s0 = createGameState({ userDeck: [], aiDeck: [] });
  const players = { ...s0.players };
  for (const pid of Object.keys(players)) players[pid] = { ...players[pid], battlefield: [], hand: [], graveyard: [], library: [], life: 20 };
  players.user = { ...players.user, battlefield: user, hand };
  players.ai = { ...players.ai, battlefield: ai };
  return { ...s0, players, turn: 4, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0 };
}
function resolveStack(s) {
  let g = 0;
  while ((s.stack.length || (s.pendingTriggers || []).length) && g++ < 100) s = passPriority(s);
  return s;
}
const gooseSources = (s) => manaSources(s, "user").filter((src) => src.permanentId === "goose");
const onField = (s, id) => s.players.user.battlefield.some((p) => p.id === id);
const poolTotal = (s) => Object.values(s.players.user.manaPool || {}).reduce((n, v) => n + (Number(v) || 0), 0);

describe("production + classification", () => {
  it("the mana line is read: one mana of any colour, {T}, a Food sacrificed", () => {
    expect(manaProduction(GOOSE)).toMatchObject({ colors: ["W", "U", "B", "R", "G"], amount: 1, requiresTap: true, sacrificesFood: true });
  });

  it("Gilded Goose classifies native", () => {
    expect(isNativeTier(classifyCard(GOOSE))).toBe(true);
  });

  it("CREED — Utopia Mycon's \"Sacrifice a Saproling\" and Krark-Clan Ironworks' \"Sacrifice an artifact\" stay refused", () => {
    expect(manaProduction(MYCON)).toBeNull();
    expect(manaProduction(KCI)).toBeNull();
    expect(isNativeTier(classifyCard(MYCON))).toBe(false);
    expect(isNativeTier(classifyCard(KCI))).toBe(false);
  });
});

describe("RUNTIME — the source", () => {
  it("⭐ with a Food: one source, any colour, carrying the Food sacrifice; with none: no source (CR 118.3)", () => {
    const withFood = table({ user: [P("goose", GOOSE, "user"), P("food", FOOD, "user")] });
    expect(gooseSources(withFood)).toHaveLength(1);
    expect(gooseSources(withFood)[0]).toMatchObject({ colors: ["W", "U", "B", "R", "G"], sacrificesFood: true });
    const without = table({ user: [P("goose", GOOSE, "user")] });
    expect(gooseSources(without)).toHaveLength(0);
  });

  it("an opponent's Food feeds nothing; a non-Food artifact feeds nothing", () => {
    const s = table({ user: [P("goose", GOOSE, "user"), P("kci", KCI, "user")], ai: [P("food-ai", FOOD, "ai")] });
    expect(gooseSources(s)).toHaveLength(0);
  });

  it("Tough Cookie (Artifact Creature — Food Golem) is a Food", () => {
    const s = table({ user: [P("goose", GOOSE, "user"), P("cookie", COOKIE, "user")] });
    expect(gooseSources(s)).toHaveLength(1);
  });

  it("a summoning-sick Goose offers nothing ({T})", () => {
    const s = table({ user: [P("goose", GOOSE, "user", { summoningSick: true }), P("food", FOOD, "user")] });
    expect(gooseSources(s)).toHaveLength(0);
  });

  it("⭐ the explicit tap: the Goose taps, the Food is sacrificed, one mana of the chosen colour is added", () => {
    let s = table({ user: [P("goose", GOOSE, "user"), P("food", FOOD, "user")] });
    const tap = legalActionsForPlayer(s, "user").find((a) => a.kind === "tap-for-mana" && a.permanentId === "goose" && a.color === "U");
    expect(tap).toBeTruthy();
    s = dispatchAction(s, tap);
    expect(onField(s, "food")).toBe(false);
    expect(s.players.user.battlefield.find((p) => p.id === "goose").tapped).toBe(true);
    expect(s.players.user.manaPool.U).toBe(1);
    expect(poolTotal(s)).toBe(1);
  });

  it("two Foods: the least valuable goes (the Food token before Tough Cookie)", () => {
    let s = table({ user: [P("goose", GOOSE, "user"), P("cookie", COOKIE, "user"), P("food", FOOD, "user")] });
    const tap = legalActionsForPlayer(s, "user").find((a) => a.kind === "tap-for-mana" && a.permanentId === "goose");
    expect(tap).toBeTruthy();
    s = dispatchAction(s, tap);
    expect(onField(s, "food")).toBe(false);
    expect(onField(s, "cookie")).toBe(true);
  });
});

describe("RUNTIME — the planner pays with it", () => {
  it("⭐ Goose + Food + one Forest cast Grizzly Bears ({1}{G}); the Food is spent", () => {
    let s = table({ user: [P("goose", GOOSE, "user"), P("food", FOOD, "user"), P("f1", FOREST, "user")], hand: [{ ...BEARS, id: "h-bear" }] });
    const cast = legalActionsForPlayer(s, "user").find((a) => a.kind === "cast-spell" && a.cardId === "h-bear");
    expect(cast).toBeTruthy();
    s = resolveStack(dispatchAction(s, cast));
    expect(s.players.user.battlefield.some((p) => p.card?.name === "Grizzly Bears")).toBe(true);
    expect(onField(s, "food")).toBe(false);
  });

  it("held back when the lands pay: two Forests cast Grizzly Bears and the Food stays", () => {
    let s = table({ user: [P("goose", GOOSE, "user"), P("food", FOOD, "user"), P("f1", FOREST, "user"), P("f2", FOREST, "user")], hand: [{ ...BEARS, id: "h-bear" }] });
    const cast = legalActionsForPlayer(s, "user").find((a) => a.kind === "cast-spell" && a.cardId === "h-bear");
    s = resolveStack(dispatchAction(s, cast));
    expect(s.players.user.battlefield.some((p) => p.card?.name === "Grizzly Bears")).toBe(true);
    expect(onField(s, "food")).toBe(true);
  });

  it("CREED — no Food, no mana: Goose + one Forest can't cast Grizzly Bears", () => {
    const s = table({ user: [P("goose", GOOSE, "user"), P("f1", FOREST, "user")], hand: [{ ...BEARS, id: "h-bear" }] });
    expect(legalActionsForPlayer(s, "user").some((a) => a.kind === "cast-spell" && a.cardId === "h-bear")).toBe(false);
  });

  it("control — Phyrexian Altar still sacrifices a creature, never a Food token", () => {
    let s = table({ user: [P("altar", PHYREXIAN_ALTAR, "user"), P("food", FOOD, "user"), P("bear", BEARS, "user")] });
    const tap = legalActionsForPlayer(s, "user").find((a) => a.kind === "tap-for-mana" && a.permanentId === "altar");
    expect(tap).toBeTruthy();
    s = dispatchAction(s, tap);
    expect(onField(s, "bear")).toBe(false);
    expect(onField(s, "food")).toBe(true);
  });
});

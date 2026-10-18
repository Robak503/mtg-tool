/**
 * highTide.test.js — the play-weighted program: a tap-for-mana augment a spell creates until end of turn.
 *
 *   High Tide (#798)      "Until end of turn, whenever a player taps an Island for mana, that player adds an additional {U}."
 *   Bubbling Muck (#2219) "Until end of turn, whenever a player taps a Swamp for mana, that player adds an additional {B}."
 *   Molten Tide (Pyre Rhymer's spell) "Until end of turn, whenever you tap a Mountain for mana, add an additional {R}."
 *
 * A delayed triggered mana ability (CR 603.7, 605.1b): the resolving spell records it for the rest of the turn, and the mana model reads
 * it at every tap — any player's land of that type ("a player"), or the caster's ("you"); the rulings: it applies to an Island that
 * entered after the spell resolved, and to any land with the type. It ends with the turn. Real oracle fixtures (bundled Scryfall via
 * cardIndex.publicCard, 2026-10-17); the trailing comment is the tier before this slice.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard, isNativeTier } from "./coverage.js";
import { parseEffectProgram } from "./effects/parser.js";
import { manaSources, canAfford, planPayment, commitPaymentPlan } from "./manaModel.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

// ── real card fixtures (bundled Scryfall, cardIndex.publicCard) ──
const HIGH_TIDE = {"name":"High Tide","type":"Instant","mana":"{U}","cmc":1,"keywords":[],"colors":["U"],"oracle":"Until end of turn, whenever a player taps an Island for mana, that player adds an additional {U}."}; // arbiter-spell #798
const BUBBLING_MUCK = {"name":"Bubbling Muck","type":"Sorcery","mana":"{B}","cmc":1,"keywords":[],"colors":["B"],"oracle":"Until end of turn, whenever a player taps a Swamp for mana, that player adds an additional {B}."}; // arbiter-spell #2219
const MOLTEN_TIDE_TEXT = "Until end of turn, whenever you tap a Mountain for mana, add an additional {R}."; // Pyre Rhymer // Molten Tide's spell
const ISLAND = {"name":"Island","type":"Basic Land — Island","mana":"","cmc":0,"keywords":[],"colors":[],"oracle":"({T}: Add {U}.)"}; // land
const SWAMP = {"name":"Swamp","type":"Basic Land — Swamp","mana":"","cmc":0,"keywords":[],"colors":[],"oracle":"({T}: Add {B}.)"}; // land
const MOUNTAIN = {"name":"Mountain","type":"Basic Land — Mountain","mana":"","cmc":0,"keywords":[],"colors":[],"oracle":"({T}: Add {R}.)"}; // land
const BREEDING_POOL = {"name":"Breeding Pool","type":"Land — Forest Island","mana":"","cmc":0,"keywords":[],"colors":[],"oracle":"({T}: Add {G} or {U}.)\nAs this land enters, you may pay 2 life. If you don't, it enters tapped."}; // land

const EMPTY = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };
const P = (id, card, controller, over = {}) => ({ ...createPermanent({ id, card: { id: `c-${id}`, ...card }, controller, summoningSick: false }), ...over });
function table({ user = [], ai = [], hand = [] } = {}) {
  const s0 = createGameState({ userDeck: [], aiDeck: [] });
  const players = { ...s0.players };
  for (const pid of Object.keys(players)) players[pid] = { ...players[pid], battlefield: [], hand: [], graveyard: [], library: [], manaPool: { ...EMPTY } };
  players.user = { ...players.user, battlefield: user, hand };
  players.ai = { ...players.ai, battlefield: ai };
  return { ...s0, players, turn: 4, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0 };
}
const affords = (s, pid, cost) => canAfford(s.players[pid].manaPool, manaSources(s, pid), cost);
function castAndResolve(s, cardId) {
  const cast = legalActionsForPlayer(s, "user").find((a) => a.kind === "cast-spell" && a.cardId === cardId);
  expect(cast).toBeTruthy();
  let st = dispatchAction(s, cast);
  for (let g = 0; (st.stack || []).length && g < 10; g++) st = resolveTopOfStack(st);
  return { ...st, players: { ...st.players, user: { ...st.players.user, manaPool: { ...EMPTY } } } };
}

describe("parse + classification", () => {
  it("High Tide and Bubbling Muck classify native", () => {
    expect(isNativeTier(classifyCard(HIGH_TIDE))).toBe(true);
    expect(isNativeTier(classifyCard(BUBBLING_MUCK))).toBe(true);
  });

  it("the clause parses to one augment atom: any player's Island for High Tide, the caster's Mountain for Molten Tide", () => {
    expect(parseEffectProgram(HIGH_TIDE).atoms).toEqual([expect.objectContaining({ op: "tap-mana-augment-eot", subject: "island", allPlayers: true, colors: ["U"], amount: 1 })]);
    expect(parseEffectProgram({ name: "Molten Tide", type: "Instant", oracle: MOLTEN_TIDE_TEXT }).atoms).toEqual([expect.objectContaining({ op: "tap-mana-augment-eot", subject: "mountain", allPlayers: false, colors: ["R"] })]);
  });
});

describe("RUNTIME — until end of turn, an Island taps for {U}{U}", () => {
  it("⭐ after High Tide resolves, the caster's untapped Island pays {U}{U}, and the plan and commit agree", () => {
    const s = castAndResolve(table({ user: [P("i1", ISLAND, "user"), P("i2", ISLAND, "user")], hand: [{ ...HIGH_TIDE, id: "tide" }] }), "tide");
    const plan = planPayment(EMPTY, manaSources(s, "user"), { U: 2 });
    expect(plan).not.toBeNull();
    expect(plan.taps).toEqual([expect.objectContaining({ color: "U", bonus: [{ color: "U", amount: 1 }] })]);
    expect(commitPaymentPlan(s, "user", plan).players.user.manaPool).toEqual(EMPTY);
  });

  it("⭐ every player's Islands: the opponent's Island pays {U}{U} too; a dual with the Island type (Breeding Pool) adds the {U} tapped for {G}", () => {
    const s = castAndResolve(table({ user: [P("i1", ISLAND, "user"), P("pool", BREEDING_POOL, "user")], ai: [P("ai1", ISLAND, "ai")], hand: [{ ...HIGH_TIDE, id: "tide" }] }), "tide");
    expect(affords(s, "ai", { U: 2 })).toBe(true);
    expect(affords(s, "user", { G: 1, U: 1 })).toBe(true); // the Pool (an Island) tapped for {G} still adds the {U}
  });

  it("an Island the user explicitly taps adds {U}{U}", () => {
    const s = castAndResolve(table({ user: [P("i1", ISLAND, "user"), P("i2", ISLAND, "user")], hand: [{ ...HIGH_TIDE, id: "tide" }] }), "tide");
    const tap = legalActionsForPlayer(s, "user").find((a) => a.kind === "tap-for-mana" && a.permanentId === "i2");
    expect(dispatchAction(s, tap).players.user.manaPool.U).toBe(2);
  });

  it("⭐ Bubbling Muck: a Swamp pays {B}{B}", () => {
    const s = castAndResolve(table({ user: [P("s1", SWAMP, "user"), P("s2", SWAMP, "user")], hand: [{ ...BUBBLING_MUCK, id: "muck" }] }), "muck");
    expect(affords(s, "user", { B: 2 })).toBe(true);
  });

  it("CONTROL — after High Tide a Swamp makes one {B}; it ends with the turn", () => {
    const s = castAndResolve(table({ user: [P("i1", ISLAND, "user"), P("i2", ISLAND, "user"), P("sw", SWAMP, "user")], hand: [{ ...HIGH_TIDE, id: "tide" }] }), "tide");
    const swampOnly = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: s.players.user.battlefield.filter((p) => p.id === "sw") } } };
    expect(affords(swampOnly, "user", { generic: 2 })).toBe(false);
    const nextTurn = { ...s, turn: s.turn + 1 };
    const islandOnly = { ...nextTurn, players: { ...nextTurn.players, user: { ...nextTurn.players.user, battlefield: nextTurn.players.user.battlefield.filter((p) => p.id === "i2") } } };
    expect(affords(islandOnly, "user", { U: 2 })).toBe(false);
  });

  it("CONTROL — before any High Tide, an Island makes one {U}", () => {
    expect(affords(table({ user: [P("i1", ISLAND, "user")] }), "user", { U: 2 })).toBe(false);
  });

  it("the caster-scoped form (Molten Tide): the caster's Mountain makes {R}{R}, the opponent's one {R}", () => {
    const s = { ...table({ user: [P("m1", MOUNTAIN, "user")], ai: [P("am", MOUNTAIN, "ai")] }), tapManaAugmentsEot: [{ controller: "user", subject: "mountain", allPlayers: false, colors: ["R"], amount: 1, turn: 4 }] };
    expect(affords(s, "user", { R: 2 })).toBe(true);
    expect(affords(s, "ai", { R: 2 })).toBe(false);
  });
});

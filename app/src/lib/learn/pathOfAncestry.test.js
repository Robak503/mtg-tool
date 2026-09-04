/**
 * pathOfAncestry.test.js — SHELF-85 runbook V11 (2026-09-04): Path of Ancestry (Halfshell; Mothman and Jurassic too).
 *
 *   "This land enters tapped.
 *    {T}: Add one mana of any color in your commander's color identity. When that mana is spent to cast a creature
 *    spell that shares a creature type with your commander, scry 1."
 *
 * A REFLEXIVE trigger on the mana this source made — built whole (CREED) as one chain:
 *   · manaModel.parseManaSpentRider reads the printed rider onto the source record (`spentRider`);
 *   · the payment planner's projection and its tap record carry it (an unlisted field there is a dropped field —
 *     the first draft lost it exactly at the projection);
 *   · the CAST SITE reads the riders off the same plan the commit deducted: a creature spell sharing a printed
 *     creature type with one of the caster's commanders (command zone or battlefield, CR 903.3) enqueues the
 *     land's scry, flushed with the cast triggers so it resolves ABOVE the spell;
 *   · detectTriggers recognises the sentence FIRST (ahead of the cast-family gates), so coverage's trigger
 *     reconciliation counts it as modeled — no event checker ever fires it.
 *
 * Real oracle fixture (bundled Scryfall snapshot, verified in-session 2026-09-04).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { manaSources, planPayment, parseManaSpentRider } from "./manaModel.js";
import { parseManaCost, legalActionsForPlayer } from "./legalChoices.js";
import { detectTriggers } from "./triggers.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { classifyCard } from "./coverage.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const PATH = { id: "c-path", name: "Path of Ancestry", type: "Land", keywords: [],
  oracle: "This land enters tapped.\n{T}: Add one mana of any color in your commander's color identity. When that mana is spent to cast a creature spell that shares a creature type with your commander, scry 1." };
const COMMANDER = { id: "c-cmdr", name: "Probe Commander", type: "Legendary Creature — Turtle Warrior", power: 3, toughness: 3, mana: "{2}{G}" };
const TURTLE = { id: "c-turtle", name: "Probe Turtle", type: "Creature — Turtle", power: 1, toughness: 1, mana: "{G}" };
const BEAR = { id: "c-bear", name: "Probe Bear", type: "Creature — Bear", power: 2, toughness: 2, mana: "{G}" };
const SHOCK = { id: "c-shock", name: "Probe Bolt", type: "Instant", mana: "{R}", oracle: "Draw a card." };

const lib = () => Array.from({ length: 3 }, (_, i) => ({ id: `u-${i}`, name: "Card " + i, type: "Instant", oracle: "" }));
function board({ commanders = [COMMANDER], commanderOnBattlefield = false } = {}) {
  let s = createGameState({ userDeck: [], aiDeck: [], userCommanders: commanders });
  const bf = [createPermanent({ id: "PATH", card: PATH, controller: "user" })];
  let command = s.players.user.command;
  if (commanderOnBattlefield) {
    bf.push({ ...createPermanent({ id: "CMDR", card: { ...COMMANDER, isCommander: true }, controller: "user" }), summoningSick: false });
    command = [];
  }
  return { ...s, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0, turn: 3,
    players: { ...s.players, user: { ...s.players.user, hand: [TURTLE, BEAR, SHOCK], library: lib(), battlefield: bf, command } } };
}
const castFrom = (s, cardId) => legalActionsForPlayer(s, "user").find((a) => a.kind === "cast-spell" && a.cardId === cardId);
const pathTrigger = (s) => (s.stack || []).find((o) => o.kind === "triggered-ability" && o.source?.name === "Path of Ancestry");

describe("the rider rides the mana", () => {
  it("parses off the printed sentence and nothing wider", () => {
    expect(parseManaSpentRider(PATH)).toEqual({ kind: "scry", amount: 1, castType: "creature", sharesCommanderType: true });
    expect(parseManaSpentRider({ ...PATH, oracle: "{T}: Add {C}. When that mana is spent to cast a creature spell, draw a card." })).toBeNull();
  });
  it("the source record and the planner's tap both carry it", () => {
    const s = board();
    const sources = manaSources(s, "user");
    expect(sources.find((x) => x.permanentId === "PATH").spentRider).toEqual({ kind: "scry", amount: 1, castType: "creature", sharesCommanderType: true });
    const plan = planPayment(s.players.user.manaPool, sources, parseManaCost("{G}"));
    expect(plan.taps[0]).toMatchObject({ permanentId: "PATH", spentRider: { kind: "scry", amount: 1 } });
  });
  it("detectTriggers recognises the sentence; the whole land is credited", () => {
    expect(detectTriggers(PATH).map((d) => [d.event, d.effectClause])).toEqual([["manaSpentRider", "scry 1"]]);
    expect(classifyCard(PATH)).toBe("land");
  });
});

describe("the cast site — a sharing creature spell fires the scry above the spell", () => {
  it("a Turtle cast with the Path's mana (commander in the command zone): the Path's trigger stacks above it and resolves into a scry choice", () => {
    let s = board();
    s = dispatchAction(s, castFrom(s, "c-turtle"));
    expect(s.stack.map((o) => o.kind)).toEqual(["spell", "triggered-ability"]);
    expect(pathTrigger(s)).toBeTruthy();
    s = resolveTopOfStack(s);
    expect(s.pendingChoice?.kind).toBe("scry-surveil");
  });
  it("the commander ON THE BATTLEFIELD counts too", () => {
    let s = board({ commanderOnBattlefield: true });
    s = dispatchAction(s, castFrom(s, "c-turtle"));
    expect(pathTrigger(s)).toBeTruthy();
  });
  it("a creature that shares no type: nothing", () => {
    let s = board();
    s = dispatchAction(s, castFrom(s, "c-bear"));
    expect(s.stack.map((o) => o.kind)).toEqual(["spell"]);
  });
  it("a noncreature spell: nothing (the rider names a creature spell)", () => {
    let s = board();
    s = { ...s, players: { ...s.players, user: { ...s.players.user, hand: [SHOCK] } } };
    const cast = castFrom(s, "c-shock");
    expect(cast).toBeTruthy();
    s = dispatchAction(s, cast);
    expect(s.stack.map((o) => o.kind)).toEqual(["spell"]);
  });
  it("a KINDRED instant sharing the type is still not a creature spell: nothing (the creature gate is the printed word, not redundancy)", () => {
    const KINDRED = { id: "c-kin", name: "Probe Kindred Trick", type: "Kindred Instant — Turtle", mana: "{G}", oracle: "Draw a card." };
    let s = board();
    s = { ...s, players: { ...s.players, user: { ...s.players.user, hand: [KINDRED] } } };
    const cast = castFrom(s, "c-kin");
    expect(cast).toBeTruthy();
    s = dispatchAction(s, cast);
    expect(s.stack.map((o) => o.kind)).toEqual(["spell"]);
  });
  it("no commander at all: nothing (nothing to share a type with)", () => {
    let s = board({ commanders: [] });
    s = dispatchAction(s, castFrom(s, "c-turtle"));
    expect(s.stack.map((o) => o.kind)).toEqual(["spell"]);
  });
});

/**
 * NONTOKEN LEAVES — SHELF-85 · Halfshell Q3 (Tokka & Rahzar, Unsupervised / Splinter, the Mentor), 2026-09-05.
 * "Whenever another nontoken creature you control leaves the battlefield, put a +1/+1 counter on Tokka & Rahzar and
 * create a Treasure token. This ability triggers only once each turn." / "Whenever Splinter or another nontoken creature
 * you control leaves the battlefield, create a Mutagen token."
 *
 * The leaves family knew three subjects; both payoffs, the once-each-turn rider and the Mutagen token were already
 * modelled. Two scopes join it: the "another nontoken" form (the "another" arm with a token gate on the leaving
 * permanent — card.token, the token-factory convention) and the SELF-INCLUSIVE union "<Name> or another nontoken
 * creature you control" (the source's own leave arrives through the self look-back and fires it). A stranger-headed
 * union leaves residue and parks.
 *
 * Mutation-checked: see the run ledger (docs-sk86).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { detectTriggers, checkLeavesTriggers } from "./triggers.js";
import { classifyCard } from "./coverage.js";
import { _resetIdsForTests, createGameState, moveCardToZone } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const TOKKA = { id: "c-tr", name: "Tokka & Rahzar, Unsupervised", type: "Legendary Creature — Turtle Wolf Mutant", mana: "{2}{R}", power: 3, toughness: 2, keywords: ["First strike"],
  oracle: "First strike\nWhenever another nontoken creature you control leaves the battlefield, put a +1/+1 counter on Tokka & Rahzar and create a Treasure token. This ability triggers only once each turn." };
const SPLINTER = { id: "c-sp", name: "Splinter, the Mentor", type: "Legendary Creature — Mutant Ninja Rat", mana: "{1}{B}", power: 2, toughness: 2, keywords: ["Menace"],
  oracle: "Menace\nWhenever Splinter or another nontoken creature you control leaves the battlefield, create a Mutagen token.\nPartner—Character select (You can have two commanders if both have this ability.)" };
const BEAR = { id: "c-bear", name: "Grizzly Bears", type: "Creature — Bear", power: 2, toughness: 2, oracle: "" };
const TOKEN_BEAR = { id: "c-tok", name: "Bear Token", type: "Token Creature — Bear", power: 2, toughness: 2, oracle: "", token: true };

const permObj = (card, controller, id, over = {}) => ({ id, card, controller, tapped: false, summoningSick: false, counters: {}, damageMarked: 0, attachments: [], attachedTo: null, ...over });
function stateWith() {
  const base = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
  return { ...base, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main" };
}
function placePerms(state, perms) {
  const players = { ...state.players };
  for (const p of perms) players[p.controller] = { ...players[p.controller], battlefield: [...players[p.controller].battlefield, p] };
  return { ...state, players };
}
const firedFor = (s, pid) => (s.pendingTriggers || []).filter((t) => t.controller === pid).map((t) => t.descriptor.effectClause);

describe("detection + classification", () => {
  it("Tokka reads the 'another nontoken' scope, Splinter the self-inclusive union; a stranger-headed union parks; both cards flip native", () => {
    const row = { tokka: detectTriggers(TOKKA).map((d) => [d.event, d.scope]), splinter: detectTriggers(SPLINTER).map((d) => [d.event, d.scope]),
      stranger: detectTriggers({ ...SPLINTER, oracle: "Whenever Gimli or another nontoken creature you control leaves the battlefield, create a Mutagen token." }).length,
      // a head that MENTIONS the source without being it (the self-reference gate is true, the head check is what refuses)
      named: detectTriggers({ ...SPLINTER, oracle: "Whenever a creature named Splinter or another nontoken creature you control leaves the battlefield, create a Mutagen token." }).length,
      tiers: [classifyCard(TOKKA), classifyCard(SPLINTER)] };
    console.log("  WITNESS nontokenLeaves", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row.tokka).toEqual([["permanentLeaves", "otherNontokenCreatureYouControlLeaves"]]);
    expect(row.splinter).toEqual([["permanentLeaves", "nontokenCreatureYouControlLeaves"]]);
    expect(row.stranger).toBe(0);
    expect(row.named).toBe(0);
    expect(row.tiers[0]).toMatch(/^native/);
    expect(row.tiers[1]).toMatch(/^native/);
  });
});

describe("RUNTIME — the leaves look-back fires the right exits", () => {
  it("Tokka: a nontoken creature you control leaving fires; a TOKEN leaving does not; an opponent's creature does not; Tokka's own leave does not", () => {
    let s = placePerms(stateWith(), [permObj(TOKKA, "user", "tr"), permObj(BEAR, "user", "bear"), permObj(TOKEN_BEAR, "user", "tok"), permObj({ ...BEAR, id: "c-ob" }, "ai1", "obear")]);
    const a = checkLeavesTriggers(moveCardToZone(s, { playerId: "user", fromZone: "battlefield", toZone: "graveyard", cardId: "bear" }));
    expect(firedFor(a, "user")).toHaveLength(1);
    expect(firedFor(a, "user")[0]).toMatch(/put a \+1\/\+1 counter on (?:tokka & rahzar|this creature) and create a treasure token/i); // the self-name is rewritten to the self noun
    const b = checkLeavesTriggers(moveCardToZone(s, { playerId: "user", fromZone: "battlefield", toZone: "graveyard", cardId: "tok" }));
    expect(firedFor(b, "user")).toHaveLength(0);
    const c = checkLeavesTriggers(moveCardToZone(s, { playerId: "ai1", fromZone: "battlefield", toZone: "graveyard", cardId: "obear" }));
    expect(firedFor(c, "user")).toHaveLength(0);
    const d = checkLeavesTriggers(moveCardToZone(s, { playerId: "user", fromZone: "battlefield", toZone: "hand", cardId: "tr" }));
    expect(firedFor(d, "user")).toHaveLength(0);
  });

  it("Splinter: his OWN bounce fires the union; another nontoken creature fires it; a token does not", () => {
    let s = placePerms(stateWith(), [permObj(SPLINTER, "user", "sp"), permObj(BEAR, "user", "bear"), permObj(TOKEN_BEAR, "user", "tok")]);
    const own = checkLeavesTriggers(moveCardToZone(s, { playerId: "user", fromZone: "battlefield", toZone: "hand", cardId: "sp" }));
    const row = { own: firedFor(own, "user"), other: firedFor(checkLeavesTriggers(moveCardToZone(s, { playerId: "user", fromZone: "battlefield", toZone: "graveyard", cardId: "bear" })), "user"),
      token: firedFor(checkLeavesTriggers(moveCardToZone(s, { playerId: "user", fromZone: "battlefield", toZone: "graveyard", cardId: "tok" })), "user") };
    console.log("  WITNESS splinterLeaves", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row.own).toHaveLength(1);
    expect(row.own[0]).toMatch(/create a mutagen token/i);
    expect(row.other).toHaveLength(1);
    expect(row.token).toHaveLength(0);
  });
});

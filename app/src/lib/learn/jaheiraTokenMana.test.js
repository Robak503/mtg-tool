/**
 * jaheiraTokenMana.test.js — SG-4 (2026-09-03): Jaheira, Friend of the Forest — "Tokens you control have
 * \"{T}: Add {G}.\"" (the Squirrel Girl deck: every Squirrel token taps for green). The quoted mana-grant lane
 * existed for creature selectors and for mana-ARTIFACT token subtypes ("Treasures you control have …" — an
 * in-place UPGRADE of the token's own tap). A BARE "tokens you control" selector joins it: every token the
 * controller controls, any type, through layers' `token` predicate — and it is NOT an upgrade: a Treasure keeps
 * its own sacrifice-for-any-color (the granted "{T}: Add {G}" on a permanent that already produces is an
 * honest under-offer, never a replacement).
 *
 * Real oracle fixture (bundled Scryfall snapshot, read in-session 2026-09-03).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { manaSources } from "./manaModel.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const JAHEIRA = { id: "c-jaheira", name: "Jaheira, Friend of the Forest", type: "Legendary Creature — Human Elf Druid", mana: "{2}{G}", power: 2, toughness: 4, keywords: [],
  oracle: "Tokens you control have \"{T}: Add {G}.\"\nChoose a Background (You can have a Background as a second commander.)" };
const squirrel = (id) => createPermanent({ id, card: { id: "c-" + id, name: "Squirrel", type: "Token Creature — Squirrel", power: 1, toughness: 1, oracle: "", token: true }, controller: "user", summoningSick: false });
const treasure = (id) => createPermanent({ id, card: { id: "c-" + id, name: "Treasure", type: "Token Artifact — Treasure", oracle: "{T}, Sacrifice this artifact: Add one mana of any color.", token: true }, controller: "user", summoningSick: false });
const bear = (id) => createPermanent({ id, card: { id: "c-" + id, name: "Grizzly Bears", type: "Creature — Bear", power: 2, toughness: 2, oracle: "" }, controller: "user", summoningSick: false });

function board(perms) {
  const s0 = createGameState({ userDeck: [], aiDeck: [] });
  return { ...s0, players: { ...s0.players, user: { ...s0.players.user, battlefield: perms } } };
}
const src = (s, id) => manaSources(s, "user").find((x) => x.permanentId === id);

describe("the grant — every token you control, tokens only, not an upgrade", () => {
  it("⭐ with Jaheira, a Squirrel token taps for {G}; without her, it is no source", () => {
    const j = createPermanent({ id: "j", card: JAHEIRA, controller: "user", summoningSick: false });
    expect(src(board([j, squirrel("sq")]), "sq")).toMatchObject({ colors: ["G"], amount: 1 });
    expect(src(board([squirrel("sq")]), "sq")).toBeUndefined();
  });

  it("⛔ a NON-token creature gains nothing (the selector is tokens only)", () => {
    const j = createPermanent({ id: "j", card: JAHEIRA, controller: "user", summoningSick: false });
    expect(src(board([j, bear("b")]), "b")).toBeUndefined();
  });

  it("⛔ a Treasure keeps its OWN sacrifice-for-any-color (the bare grant is not an in-place upgrade)", () => {
    const j = createPermanent({ id: "j", card: JAHEIRA, controller: "user", summoningSick: false });
    const t = src(board([j, treasure("t")]), "t");
    expect(t).toBeTruthy();
    expect(t.sacrifices).toBe(true);
    expect(t.colors.length).toBe(5);
  });

  it("an opponent's token gains nothing (controller-scoped)", () => {
    const s0 = createGameState({ userDeck: [], aiDeck: [] });
    const j = createPermanent({ id: "j", card: JAHEIRA, controller: "user", summoningSick: false });
    const theirs = createPermanent({ id: "osq", card: { id: "c-osq", name: "Squirrel", type: "Token Creature — Squirrel", power: 1, toughness: 1, oracle: "", token: true }, controller: "ai", summoningSick: false });
    const s = { ...s0, players: { ...s0.players, user: { ...s0.players.user, battlefield: [j] }, ai: { ...s0.players.ai, battlefield: [theirs] } } };
    expect(manaSources(s, "ai").find((x) => x.permanentId === "osq")).toBeUndefined();
  });
});

describe("classification", () => {
  it("Jaheira is native", () => {
    expect(classifyCard(JAHEIRA)).toMatch(/^native/);
  });

  it("CREED — a grant body the mana parser cannot read still parks", () => {
    expect(classifyCard({ ...JAHEIRA, oracle: JAHEIRA.oracle.replace("{T}: Add {G}.", "{T}: Add {G} for each Squirrel you control.") })).not.toMatch(/^native/);
  });
});

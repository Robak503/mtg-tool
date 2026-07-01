/**
 * consolidationWaveA.test.js — Fable 5 consolidation pass, classification/parsing repairs.
 *
 * Locks in the four probe-verified fixes from the full-codebase audit:
 *   E-P0-1  quoted GROUP-GRANT mana is no longer credited as the granter's OWN mana (phantom-source FP).
 *   R-P1-5  Mana Vault's unmodeled untap restriction routes it out of the standing mana model.
 *   E-P0-2  "(other) permanents you control have <keyword>" grants to EVERY permanent (was a dead selector).
 *   E-P1-1  irregular/invariant plural subtypes normalize to a real subtype (Pegasus, Mice, Detectives…).
 *   E-P1-2  invariant basic-land types in an intervening-if evaluate correctly ("two or more Plains").
 */
import { describe, it, expect, beforeEach } from "vitest";
import { manaProduction, stripNonSelfQuotedGrants } from "./manaModel.js";
import { classifyCard, hasManaAbility } from "./coverage.js";
import { evaluateInterveningIf, interveningIfParseable } from "./interveningIf.js";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { permanentHasKeyword } from "./layers.js";

beforeEach(() => _resetIdsForTests());

describe("E-P0-1 — quoted group-grant mana is not the granter's own mana", () => {
  it("strips a non-self group grant but keeps a self-including one", () => {
    // Cryptolith Rite (Enchantment) grants to creatures — it is not itself a creature → not its own source.
    expect(hasManaAbility('Creatures you control have "{T}: Add one mana of any color."', "Enchantment")).toBe(false);
    // Gemhide Sliver IS a Sliver, so "All Slivers have …" self-includes → keeps its own production.
    expect(hasManaAbility('All Slivers have "{T}: Add one mana of any color."', "Creature — Sliver")).toBe(true);
    // Aura grant to the host, and Goldspan's Treasure grant, and Toxicrene's all-lands grant: not self.
    expect(hasManaAbility('Enchanted creature has "{T}: Add one mana of any color."', "Enchantment — Aura")).toBe(false);
    expect(hasManaAbility('Treasures you control have "{T}, Sacrifice this artifact: Add two mana of any one color."', "Creature — Dragon")).toBe(false);
  });

  it("manaProduction: a non-self granter is not a phantom standing source", () => {
    expect(manaProduction({ name: "Cryptolith Rite", type: "Enchantment", oracle: 'Creatures you control have "{T}: Add one mana of any color."' })).toBeNull();
    // Gemhide keeps its own tap-for-any.
    const gem = manaProduction({ name: "Gemhide Sliver", type: "Creature — Sliver", oracle: 'All Slivers have "{T}: Add one mana of any color."' });
    expect(gem).toMatchObject({ amount: 1 });
    // Chromatic Lantern has its OWN bare "{T}: Add one mana of any color" alongside the lands grant → still a source.
    const lantern = manaProduction({ name: "Chromatic Lantern", type: "Artifact", oracle: 'Lands you control have "{T}: Add one mana of any color."\n{T}: Add one mana of any color.' });
    expect(lantern).toMatchObject({ amount: 1 });
  });

  it("stripNonSelfQuotedGrants with no type line strips conservatively (never a phantom)", () => {
    expect(/add one mana/i.test(stripNonSelfQuotedGrants('Creatures you control have "{T}: Add one mana of any color."', ""))).toBe(false);
  });
});

describe("R-P1-5 — Mana Vault's unmodeled untap restriction", () => {
  it("Mana Vault is not a standing mana source (doesn't untap normally)", () => {
    expect(manaProduction({ name: "Mana Vault", type: "Artifact", oracle: "Mana Vault doesn't untap during your untap step.\n{T}: Add {C}{C}{C}." })).toBeNull();
  });
  it("Sol Ring and Mana Crypt (no untap restriction) still produce", () => {
    expect(manaProduction({ name: "Sol Ring", type: "Artifact", oracle: "{T}: Add {C}{C}." })).toMatchObject({ amount: 2 });
    expect(manaProduction({ name: "Mana Crypt", type: "Artifact", oracle: "{T}: Add {C}{C}." })).toMatchObject({ amount: 2 });
  });
});

describe("E-P0-2 — all-permanents keyword anthem grants to every permanent", () => {
  it("Privileged Position gives hexproof to your creatures AND non-creatures, not itself, not opponents", () => {
    let s = createGameState({ userDeck: [], aiDeck: [] });
    const pp = createPermanent({ id: "pp", card: { id: "pp", name: "Privileged Position", type: "Enchantment", oracle: "Other permanents you control have hexproof." }, controller: "user" });
    const bear = createPermanent({ id: "bear", card: { id: "bear", name: "Bear", type: "Creature — Bear", power: 2, toughness: 2 }, controller: "user" });
    const rock = createPermanent({ id: "rock", card: { id: "rock", name: "Sol Ring", type: "Artifact" }, controller: "user" });
    const opp = createPermanent({ id: "opp", card: { id: "opp", name: "OppArt", type: "Artifact" }, controller: "ai" });
    s = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [pp, bear, rock] }, ai: { ...s.players.ai, battlefield: [opp] } } };
    expect(permanentHasKeyword(s, "bear", "Hexproof")).toBe(true);   // creature
    expect(permanentHasKeyword(s, "rock", "Hexproof")).toBe(true);   // non-creature permanent
    expect(permanentHasKeyword(s, "pp", "Hexproof")).toBe(false);    // excludeSelf ("Other")
    expect(permanentHasKeyword(s, "opp", "Hexproof")).toBe(false);   // you-scope, not opponents
  });
  it("still classifies native-static (a true positive now, not a phantom)", () => {
    expect(classifyCard({ type: "Enchantment", name: "Privileged Position", oracle: "Other permanents you control have hexproof." })).toBe("native-static");
  });
});

describe("E-P1-1 — irregular / invariant plural subtypes", () => {
  it("a Pegasus lifelink anthem applies to Pegasus creatures", () => {
    let s = createGameState({ userDeck: [], aiDeck: [] });
    const archon = createPermanent({ id: "arc", card: { id: "arc", name: "Archon of Sun's Grace", type: "Enchantment Creature — Archon", power: 4, toughness: 5, oracle: "Flying, lifelink\nPegasus creatures you control have lifelink." }, controller: "user" });
    const peg = createPermanent({ id: "peg", card: { id: "peg", name: "Pegasus Token", type: "Creature — Pegasus", power: 2, toughness: 2 }, controller: "user" });
    s = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [archon, peg] } } };
    expect(permanentHasKeyword(s, "peg", "Lifelink")).toBe(true);
  });
});

describe("E-P1-2 — invariant basic-land types in an intervening-if", () => {
  it('"you control two or more Plains" evaluates against Plains on the board', () => {
    const state = { players: { p1: { id: "p1", battlefield: [
      { id: "l1", controller: "p1", card: { name: "Plains", type: "Basic Land — Plains" } },
      { id: "l2", controller: "p1", card: { name: "Plains", type: "Basic Land — Plains" } },
    ] } } };
    expect(interveningIfParseable("you control two or more Plains")).toBe(true);
    expect(evaluateInterveningIf(state, "you control two or more Plains", "p1")).toBe(true);
    expect(evaluateInterveningIf(state, "you control a Plains", "p1")).toBe(true);
  });
});

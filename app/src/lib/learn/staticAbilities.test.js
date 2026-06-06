/**
 * staticAbilities.test.js — the bounded oracle → static-effect parser (PR-9).
 * Focus: the recognized anthem/lord/grant grammar AND the anti-fabrication
 * guards (a miss is safe; reminder/conditional text must NOT grant anything).
 */

import { describe, it, expect } from "vitest";
import { parseStaticAbilities } from "./staticAbilityParser.js";
import { createGameState } from "./gameState.js";
import { permanentPower, permanentToughness, permanentHasKeyword } from "./layers.js";

function card(name, oracle, type = "Creature") {
  return { name, type, oracle, power: 0, toughness: 0 };
}
function perm(name, id, controller, { power = 1, toughness = 1, type = "Creature", oracle = "" } = {}) {
  return { id, card: { name, type, power, toughness, oracle }, controller, tapped: false, summoningSick: false, counters: {}, attachments: [], attachedTo: null, timestamp: 0 };
}
function stateWith(userBf, aiBf = []) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: userBf }, ai: { ...s.players.ai, battlefield: aiBf } } };
}

describe("parseStaticAbilities — P/T anthems", () => {
  it("'Creatures you control get +1/+1.'", () => {
    const d = parseStaticAbilities(card("Glorious Anthem", "Creatures you control get +1/+1.", "Enchantment"));
    expect(d).toHaveLength(1);
    expect(d[0].layer).toBe(7);
    expect(d[0].sublayer).toBe("7c");
    expect(d[0].op).toEqual({ layerOp: "ptModify", power: 1, toughness: 1 });
    expect(d[0].affects.selector.controllerScope).toBe("you");
  });

  it("'Other Sliver creatures you control get +1/+1.' (excludeSelf)", () => {
    const d = parseStaticAbilities(card("Muscle Sliver", "Other Sliver creatures you control get +1/+1.", "Creature — Sliver"));
    expect(d).toHaveLength(1);
    expect(d[0].affects.selector.subtypes).toEqual(["Sliver"]);
    expect(d[0].affects.selector.excludeSelf).toBe(true);
  });

  it("'Other Slivers you control get +1/+1.' (plural subtype, no 'creatures')", () => {
    const d = parseStaticAbilities(card("Sliver Lord", "Other Slivers you control get +1/+1.", "Creature — Sliver"));
    expect(d).toHaveLength(1);
    expect(d[0].affects.selector.subtypes).toEqual(["Sliver"]);
  });

  it("color anthem: 'White creatures you control get +1/+1.'", () => {
    const d = parseStaticAbilities(card("Honor of the Pure", "White creatures you control get +1/+1.", "Enchantment"));
    expect(d).toHaveLength(1);
    expect(d[0].affects.selector.colors).toEqual(["W"]);
  });

  it("handles +2/+0 style boosts", () => {
    const d = parseStaticAbilities(card("Weird Anthem", "Creatures you control get +2/+0.", "Enchantment"));
    expect(d[0].op).toEqual({ layerOp: "ptModify", power: 2, toughness: 0 });
  });
});

describe("parseStaticAbilities — keyword grants", () => {
  it("'Creatures you control have flying.'", () => {
    const d = parseStaticAbilities(card("Levitation", "Creatures you control have flying.", "Enchantment"));
    expect(d).toHaveLength(1);
    expect(d[0].layer).toBe(6);
    expect(d[0].op).toEqual({ layerOp: "addKeyword", keyword: "Flying" });
  });

  it("'Other Sliver creatures you control have flying.'", () => {
    const d = parseStaticAbilities(card("Galerider Sliver", "Other Sliver creatures you control have flying.", "Creature — Sliver"));
    expect(d).toHaveLength(1);
    expect(d[0].op).toEqual({ layerOp: "addKeyword", keyword: "Flying" });
    expect(d[0].affects.selector.subtypes).toEqual(["Sliver"]);
  });

  it("grants multiple keywords in one 'have' clause", () => {
    const d = parseStaticAbilities(card("Big Lord", "Creatures you control have flying and vigilance.", "Enchantment"));
    const kws = d.map(e => e.op.keyword).sort();
    expect(kws).toEqual(["Flying", "Vigilance"]);
  });
});

describe("anti-fabrication guards (CLAUDE.md §1.2)", () => {
  it("does NOT grant flying from 'can't be blocked by creatures with flying'", () => {
    const d = parseStaticAbilities(card("Sneaky", "Sneaky can't be blocked by creatures with flying."));
    expect(d).toEqual([]);
  });

  it("does NOT treat an activated 'gains trample' line as a static grant", () => {
    const d = parseStaticAbilities(card("Pumper", "{G}: Target creature gains trample until end of turn."));
    expect(d).toEqual([]);
  });

  it("ignores unknown / non-grantable keyword words", () => {
    const d = parseStaticAbilities(card("Weird", "Creatures you control have foobar."));
    expect(d).toEqual([]);
  });

  it("a vanilla creature yields no static abilities", () => {
    expect(parseStaticAbilities(card("Grizzly Bears", "", "Creature — Bear"))).toEqual([]);
  });

  it("reminder text in parens does not double-grant", () => {
    const d = parseStaticAbilities(card("Anthem", "Creatures you control get +1/+1.", "Enchantment"));
    expect(d).toHaveLength(1);
  });
});

describe("end-to-end through the layer engine", () => {
  it("Honor of the Pure pumps a white creature, not a black one (CR 613.5)", () => {
    const honor = perm("Honor of the Pure", "h1", "user", { type: "Enchantment", oracle: "White creatures you control get +1/+1." });
    const whiteGuy = { ...perm("Soldier", "w1", "user", { power: 2, toughness: 2 }), card: { name: "Soldier", type: "Creature", power: 2, toughness: 2, mana: "{W}{W}" } };
    const blackGuy = { ...perm("Zombie", "z1", "user", { power: 2, toughness: 2 }), card: { name: "Zombie", type: "Creature", power: 2, toughness: 2, mana: "{B}{B}" } };
    const state = stateWith([honor, whiteGuy, blackGuy]);
    expect(permanentPower(state, "w1")).toBe(3);
    expect(permanentToughness(state, "w1")).toBe(3);
    expect(permanentPower(state, "z1")).toBe(2);
  });

  it("Sliver lord grants flying to other Slivers, queryable via permanentHasKeyword", () => {
    const gale = perm("Galerider Sliver", "g1", "user", { type: "Creature — Sliver", oracle: "Other Sliver creatures you control have flying." });
    const other = perm("Muscle Sliver", "o1", "user", { type: "Creature — Sliver", power: 1, toughness: 1 });
    const bear = perm("Bear", "b1", "user", { type: "Creature — Bear", power: 2, toughness: 2 });
    const state = stateWith([gale, other, bear]);
    expect(permanentHasKeyword(state, "o1", "Flying")).toBe(true);
    expect(permanentHasKeyword(state, "b1", "Flying")).toBe(false);
    // "other" — the lord itself doesn't get its own grant.
    expect(permanentHasKeyword(state, "g1", "Flying")).toBe(false);
  });
});

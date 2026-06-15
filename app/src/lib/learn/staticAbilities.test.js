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

describe("parseStaticAbilities — P2.10 widened anthems", () => {
  it("'Other creatures you control get +1/+1.' (generic excludeSelf lord — Benalish Marshal)", () => {
    const d = parseStaticAbilities(card("Benalish Marshal", "Other creatures you control get +1/+1.", "Creature — Human Soldier"));
    expect(d).toHaveLength(1);
    expect(d[0].op).toEqual({ layerOp: "ptModify", power: 1, toughness: 1 });
    expect(d[0].affects.selector).toMatchObject({ controllerScope: "you", excludeSelf: true });
    expect(d[0].affects.selector.subtypes).toBeUndefined();
  });

  it("'Each creature you control gets +1/+1.' (determiner 'each', includes self)", () => {
    const d = parseStaticAbilities(card("Each Lord", "Each creature you control gets +1/+1.", "Enchantment"));
    expect(d).toHaveLength(1);
    expect(d[0].affects.selector).toMatchObject({ controllerScope: "you", excludeSelf: false });
  });

  it("'All creatures have haste.' (symmetric global — Mass Hysteria)", () => {
    const d = parseStaticAbilities(card("Mass Hysteria", "All creatures have haste.", "Enchantment"));
    expect(d).toHaveLength(1);
    expect(d[0].op).toEqual({ layerOp: "addKeyword", keyword: "Haste" });
    expect(d[0].affects.selector.controllerScope).toBe("each");
  });

  it("'All creatures get -1/-1.' (symmetric debuff — Night of Souls' Betrayal)", () => {
    const d = parseStaticAbilities(card("Night of Souls' Betrayal", "All creatures get -1/-1.", "Enchantment"));
    expect(d[0].op).toEqual({ layerOp: "ptModify", power: -1, toughness: -1 });
    expect(d[0].affects.selector.controllerScope).toBe("each");
  });

  it("'Other creatures you control have trample.' (generic keyword grant, excludeSelf)", () => {
    const d = parseStaticAbilities(card("Trampler", "Other creatures you control have trample.", "Creature — Beast"));
    expect(d).toHaveLength(1);
    expect(d[0].op).toEqual({ layerOp: "addKeyword", keyword: "Trample" });
    expect(d[0].affects.selector.excludeSelf).toBe(true);
  });

  it("multi-grant: '… get +1/+1 and have vigilance' emits BOTH the buff and the keyword", () => {
    const d = parseStaticAbilities(card("Captain", "Creatures you control get +1/+1 and have vigilance.", "Enchantment"));
    expect(d).toHaveLength(2);
    expect(d.find(e => e.op.layerOp === "ptModify").op).toEqual({ layerOp: "ptModify", power: 1, toughness: 1 });
    expect(d.find(e => e.op.layerOp === "addKeyword").op).toEqual({ layerOp: "addKeyword", keyword: "Vigilance" });
  });

  it("multi-grant on a tribal lord: 'Other Soldier creatures get +1/+1 and have first strike' (Field Marshal)", () => {
    const d = parseStaticAbilities(card("Field Marshal", "Other Soldier creatures get +1/+1 and have first strike.", "Creature — Soldier"));
    const pt = d.find(e => e.op.layerOp === "ptModify");
    const kw = d.find(e => e.op.layerOp === "addKeyword");
    expect(pt.affects.selector.subtypes).toEqual(["Soldier"]);
    expect(pt.affects.selector.excludeSelf).toBe(true);
    expect(kw.op.keyword).toBe("First strike");
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

  // ── Variable / conditional magnitude must be a clean MISS, never a flat buff ──
  it("does NOT fabricate a flat buff from a 'for each' lord (Sliver Legion)", () => {
    // Sliver Legion: "Other Slivers get +1/+1 for each other Sliver on the
    // battlefield." A flat +1/+1 would be the WRONG magnitude — a forbidden false
    // grant. Until variable-count ops exist, it must parse to nothing.
    expect(parseStaticAbilities(card("Sliver Legion", "Other Slivers get +1/+1 for each other Sliver on the battlefield.", "Creature — Sliver"))).toEqual([]);
  });

  it("does NOT fabricate an unconditional buff from an 'as long as' anthem", () => {
    expect(parseStaticAbilities(card("Conditional", "Other creatures you control get +2/+2 as long as you control a Forest.", "Enchantment"))).toEqual([]);
  });

  // ── Triggered / activated / ETB abilities are NOT static continuous effects ──
  it("does NOT treat a triggered anthem ('Whenever ~ attacks, ... get +1/+1 until end of turn') as static", () => {
    expect(parseStaticAbilities(card("Warleader", "Whenever this creature attacks, other creatures you control get +1/+1 until end of turn.", "Creature — Cat"))).toEqual([]);
  });

  it("does NOT treat an activated anthem ('{G}: Creatures you control get +1/+1 ...') as static", () => {
    expect(parseStaticAbilities(card("Overrunner", "{G}: Creatures you control get +1/+1 until end of turn.", "Enchantment"))).toEqual([]);
  });

  it("does NOT treat an ETB anthem ('When this enters, ... get +2/+2 until end of turn') as static", () => {
    expect(parseStaticAbilities(card("Flash Pump", "When this creature enters, creatures you control get +2/+2 until end of turn.", "Creature — Elemental"))).toEqual([]);
  });

  it("does NOT treat a triggered keyword grant ('Whenever ~ attacks, ... have flying') as static", () => {
    expect(parseStaticAbilities(card("Skyleader", "Whenever this creature attacks, creatures you control have flying until end of turn.", "Creature — Bird"))).toEqual([]);
  });

  it("does NOT treat an activated keyword grant ('{T}: Creatures you control have haste') as static", () => {
    expect(parseStaticAbilities(card("Hastemaker", "{T}: Creatures you control have haste until end of turn.", "Artifact"))).toEqual([]);
  });

  // ── Level-gated cards (CR: ability active only at the right level) — a buff line on a
  // leveler / Class is NOT an always-on static. The whole card parses to NOTHING. ──
  it("does NOT fabricate a static anthem from a LEVELER's level-band buff", () => {
    const leveler = card("Transcendent Master", "Level up {W} ({W}: Put a level counter on this. Level up only as a sorcery.)\nLEVEL 1-5\n6/6\nLifelink\nLEVEL 6+\n9/9\nCreatures you control get +1/+1.", "Creature — Human Monk");
    expect(parseStaticAbilities(leveler)).toEqual([]);
  });

  it("does NOT fabricate a static anthem from a CLASS's level ability", () => {
    const klass = card("Ninja Teen", "Whenever a creature you control leaves the battlefield, each opponent loses 1 life.\n{1}{B}: Level 2\nCreatures you control get +1/+0 and have menace.", "Enchantment — Class");
    expect(parseStaticAbilities(klass)).toEqual([]);
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

  it("P2.10: 'Other creatures you control get +1/+1' pumps another creature but not itself", () => {
    const marshal = perm("Benalish Marshal", "m1", "user", { type: "Creature — Soldier", power: 2, toughness: 2, oracle: "Other creatures you control get +1/+1." });
    const ally = perm("Ally", "a1", "user", { type: "Creature — Soldier", power: 2, toughness: 2 });
    const state = stateWith([marshal, ally]);
    expect(permanentPower(state, "a1")).toBe(3);   // other creature buffed
    expect(permanentPower(state, "m1")).toBe(2);   // the lord excludes itself
  });
});

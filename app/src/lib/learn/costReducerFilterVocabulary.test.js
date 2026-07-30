/**
 * costReducerFilterVocabulary.test.js — the cost reducer's FILTER vocabulary (8 cards).
 * Ballyrush · Bosk · Brighthearth · Frogtosser · Stonybrook Banneret · Iron Lad · Longshot · Valeria Richards.
 *
 * The reducer's parse arm anchored on a SINGLE `[a-z]+` word, so any multi-word filter failed outright. Two
 * real shapes were unreachable:
 *   • a two-SUBTYPE union — "Goblin spells and Rogue spells you cast cost {1} less" (the Banneret cycle);
 *   • a NEGATED card type — "Noncreature spells you cast cost {1} less".
 *
 * ⭐ THE NEGATION'S EXCLUSION WAS CAPABILITY LANGUAGE, and its own comment said so: `noncreature` sits in
 * NON_SUBTYPE_COST_FILTER_WORDS because "a word-bound type-line match for these would NEVER fire, so claiming
 * the reducer native while it silently reduces nothing is a CREED false positive." Exactly right — so this
 * emits a real `notCardType` PREDICATE rather than a word scan, and the word stays excluded from the
 * scan-based arm. The reason was the implementation, not the rules.
 *
 * ⛔⭐ AND THE FIRST CUT REGRESSED FIVE CARDS — the finding worth keeping. The union arm `return`ed
 * unconditionally, so when its guard REJECTED a filter it still consumed the clause, and the Familiar cycle
 * (Nightscape / Stormscape / Sunscape / Thornscape / Thunderscape — "Blue spells and red spells you cast cost
 * {1} less") stopped reaching the LATER arm that already handled it natively. A widening must be gated behind
 * the prior paths' failure; swallowing the clause on rejection inverts that and silently NARROWS the engine.
 * Caught by the flip-diff's LOST column, which is precisely what it is for.
 */
import { describe, it, expect } from "vitest";
import { parseStaticAbilities, costReductionForSpell } from "./staticAbilityParser.js";
import { classifyCard, isNativeTier } from "./coverage.js";

const reducersOf = (card) => parseStaticAbilities(card).filter((d) => d.costReduction).map((d) => d.costReduction);
const spell = (type) => ({ name: "S", type, mana: "{3}" });

const BANNERET = { name: "Frogtosser Banneret", type: "Creature — Goblin Rogue", mana: "{2}{B}", power: 2, toughness: 2,
  oracle: "Haste\nGoblin spells and Rogue spells you cast cost {1} less to cast." };
const LONGSHOT = { name: "Longshot, Rebel Bowman", type: "Legendary Creature — Human Archer", mana: "{2}{G}", power: 2, toughness: 3,
  oracle: "Reach (This creature can block creatures with flying.)\nNoncreature spells you cast cost {1} less to cast.\nWhenever you cast a noncreature spell, Longshot deals 2 damage to each opponent." };
const FAMILIAR = { name: "Nightscape Familiar", type: "Creature — Zombie Horror", mana: "{1}{B}", power: 1, toughness: 1,
  oracle: "Blue spells and red spells you cast cost {1} less to cast.\n{1}{B}: Regenerate this creature." };

describe("⭐ two-SUBTYPE union — either subtype, and the discount applies ONCE", () => {
  it("parses to a single union reducer", () => {
    expect(reducersOf(BANNERET)).toEqual([{ subtypes: ["Goblin", "Rogue"], amount: 1 }]);
  });

  it("either half matches; neither does not", () => {
    const r = reducersOf(BANNERET);
    expect(costReductionForSpell(r, spell("Creature — Goblin"))).toBe(1);
    expect(costReductionForSpell(r, spell("Creature — Human Rogue"))).toBe(1);
    expect(costReductionForSpell(r, spell("Creature — Elf"))).toBe(0);
  });

  it("⛔⭐ a spell matching BOTH is reduced ONCE, not twice", () => {
    // Two separate reducers would give a Goblin Rogue {2} off a card that says {1} — a spell cheaper than the
    // card allows, the forbidden direction for a cost effect.
    expect(costReductionForSpell(reducersOf(BANNERET), spell("Creature — Goblin Rogue"))).toBe(1);
  });
});

describe("⭐ NEGATED card type — a predicate, not a word scan", () => {
  it("parses to notCardType", () => {
    expect(reducersOf(LONGSHOT)).toEqual([{ notCardType: "creature", amount: 1 }]);
  });

  it("reduces non-creature spells and leaves creatures alone", () => {
    const r = reducersOf(LONGSHOT);
    expect(costReductionForSpell(r, spell("Instant"))).toBe(1);
    expect(costReductionForSpell(r, spell("Artifact"))).toBe(1);
    expect(costReductionForSpell(r, spell("Creature — Bear"))).toBe(0);
    expect(costReductionForSpell(r, spell("Artifact Creature — Golem"))).toBe(0);
  });

  it("⛔ fails CLOSED on an unreadable type line — no discount beats a wrong one", () => {
    expect(costReductionForSpell(reducersOf(LONGSHOT), { name: "X", mana: "{3}" })).toBe(0);
  });
});

describe("⛔⭐ THE REGRESSION GUARD — a rejected filter must FALL THROUGH, never be consumed", () => {
  it("the Familiar cycle still reduces by colour", () => {
    // The union arm's guard rejects colour words. If it returns instead of falling through, this clause never
    // reaches the later arm that handles it, and five natives silently become body-only. That is what the
    // first cut of this slice did.
    const r = reducersOf(FAMILIAR);
    expect(r.length).toBeGreaterThan(0);
    expect(costReductionForSpell(r, { name: "S", type: "Instant", mana: "{3}", colors: ["U"] })).toBe(1);
    expect(costReductionForSpell(r, { name: "S", type: "Instant", mana: "{3}", colors: ["R"] })).toBe(1);
    expect(costReductionForSpell(r, { name: "S", type: "Instant", mana: "{3}", colors: ["G"] })).toBe(0);
  });

  it("Nightscape Familiar is still native", () => {
    expect(isNativeTier(classifyCard(FAMILIAR)), classifyCard(FAMILIAR)).toBe(true);
  });
});

describe("⛔ the incumbent single-word arms are unchanged", () => {
  it("a bare subtype reducer and a colour reducer still parse", () => {
    expect(reducersOf({ name: "Goblin Warchief", type: "Creature — Goblin Warrior", mana: "{1}{R}{R}", power: 2, toughness: 2,
      oracle: "Goblin spells you cast cost {1} less to cast." })).toEqual([{ subtype: "Goblin", amount: 1 }]);
    expect(reducersOf({ name: "Ruby Medallion", type: "Artifact", mana: "{2}",
      oracle: "Red spells you cast cost {1} less to cast." })).toEqual([{ colors: ["R"], amount: 1 }]);
  });
});

describe("⭐ carriers classify native", () => {
  for (const card of [BANNERET, LONGSHOT]) {
    it(`${card.name}`, () => expect(isNativeTier(classifyCard(card)), classifyCard(card)).toBe(true));
  }
});

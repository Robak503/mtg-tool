/**
 * controllerSacAndCounterPlacement.test.js — two small vocabulary axes measured early in the run and carried
 * until now (5 cards): Drinker of Sorrow · Lorehold Command · Perilous Research · Recycla-bird ·
 * Selfcraft Mechan.
 *
 * ⭐ 1 · THE CONTROLLER'S SACRIFICE VICTIM. `sacrificeEdictClauseParser`'s controller-subject arm was ONE
 * string, `/^sacrifice a creature$/`, while its four sibling SUBJECTS (target player / each player / each
 * opponent / the upkeep player) each carried EDICT_NOUN + permanent + TYPED. All five resolve through the
 * same `advanceSacrificeChain`, which threads `atom.what` onto the queue head regardless of `who` and narrows
 * the pool via `sacrificePoolMatch` — so the RUNTIME has supported all eleven pools for any subject since it
 * was written. Textbook axis: capability on four arms of a function, absent on the fifth.
 *
 * ⭐ 2 · KEYWORD-COUNTER PLACEMENT. `permanentHasKeyword` has read keyword counters off the counter pile since
 * the enters-with static shipped, but there was no arm to PLACE one on a chosen target. And the shield-counter
 * parser was exact string equality, so "…on target creature YOU CONTROL" refused a card whose effect is
 * identical to one it already accepted.
 *
 * ⛔⭐ THE GATE THAT MATTERS: the keyword-counter arm is bounded by ENFORCED_KEYWORD_COUNTER_KINDS, IMPORTED
 * from the module that does the granting rather than copied. A counter placed for a keyword nobody enforces
 * would sit on the board looking correct and do NOTHING — a silent wrong-behaviour FP, worse than parking.
 * That is exactly why Emissary of Soulfire ("an exalted counter") is REFUSED: exalted is not enforced.
 */
import { describe, it, expect } from "vitest";
import { parseEffectClause } from "./effects/parser.js";
import { ENFORCED_KEYWORD_COUNTER_KINDS } from "./staticAbilityParser.js";
import { classifyCard, isNativeTier } from "./coverage.js";

const atomOf = (clause, type = "Instant") => (parseEffectClause(clause, type, { hasX: false })?.atoms || [])[0] || null;

describe("⭐ 1 · the controller's sacrifice victim vocabulary", () => {
  const CASES = [
    ["Sacrifice a permanent.", "permanent"],
    ["Sacrifice an artifact.", "artifact"],
    ["Sacrifice an enchantment.", "enchantment"],
    ["Sacrifice a nontoken creature.", "nontokenCreature"],
    ["Sacrifice a creature token.", "creatureToken"],
    ["Sacrifice a planeswalker.", "planeswalker"],
    ["Sacrifice an artifact or enchantment.", "artifactOrEnchantment"],
  ];
  for (const [clause, pool] of CASES) {
    it(`«${clause}» → ${pool}`, () => {
      expect(atomOf(clause)).toEqual({ op: "sacrifice", who: "controller", what: pool });
    });
  }

  it("⛔ the incumbent bare form is byte-identical", () => {
    expect(atomOf("Sacrifice a creature.")).toEqual({ op: "sacrifice", who: "controller", what: "creature" });
  });

  it("⛔ a COUNT, a FILTER or a CONJOINED victim still parks — a wrong-victim sac is the forbidden FP", () => {
    for (const c of ["Sacrifice two creatures.", "Sacrifice a creature with flying.", "Sacrifice a creature or land.",
      "Sacrifice a nonbasic land."]) {
      expect(atomOf(c), c).toBe(null);
    }
  });

  it("⛔ 'a land' is deliberately NOT here — sacLand.js already owns it, and two parsers for one phrase drift", () => {
    // It still parses (via that other arm); what matters is that it does not come back as a controller edict
    // with what:"land", which would mean the same printed phrase had two owners.
    const a = atomOf("Sacrifice a land.");
    expect(a?.what).not.toBe("land");
  });
});

describe("⭐ 2 · counter placement on a chosen target", () => {
  it("the shield counter accepts the controller-scoped target", () => {
    expect(atomOf("Put a shield counter on target creature you control.", "Creature")).toEqual({
      op: "shield-counter", targetType: "creature", restrictions: [{ kind: "controller", who: "you" }] });
  });

  it("⛔ both incumbent shield forms are byte-identical", () => {
    expect(atomOf("Put a shield counter on target creature.")).toEqual({ op: "shield-counter", targetType: "creature" });
    expect(atomOf("Put a shield counter on a creature you control.")).toEqual({ op: "shield-counter", scope: "oneYouControl" });
  });

  it("a keyword counter is placed as a normal counter of that name", () => {
    expect(atomOf("Put a flying counter on target creature you control.", "Creature")).toEqual({
      op: "add-counter", counterType: "flying", amount: 1, targetType: "creature",
      restrictions: [{ kind: "controller", who: "you" }] });
    expect(atomOf("Put a trample counter on target creature.")).toEqual({
      op: "add-counter", counterType: "trample", amount: 1, targetType: "creature" });
  });

  it("⛔⭐ A KEYWORD NOBODY ENFORCES IS REFUSED — the whole point of the gate", () => {
    // Emissary of Soulfire prints "an exalted counter". Placing it would put a counter on the board that
    // grants nothing: the card would look played and do nothing. Parking is the honest answer.
    expect(ENFORCED_KEYWORD_COUNTER_KINDS.has("exalted")).toBe(false);
    expect(atomOf("Put an exalted counter on target creature you control.", "Creature")).toBe(null);
    expect(atomOf("Put a charge counter on target creature you control.", "Creature")).toBe(null);
  });

  it("⛔ the gate is the IMPORTED set, so it cannot drift from the grant", () => {
    // If these ever diverge, a keyword could be grantable-but-unplaceable or placeable-but-inert.
    for (const k of ["flying", "trample", "deathtouch", "lifelink", "vigilance"]) {
      expect(ENFORCED_KEYWORD_COUNTER_KINDS.has(k), k).toBe(true);
      expect(atomOf(`Put a ${k} counter on target creature.`), k).not.toBe(null);
    }
  });
});

describe("⭐ carriers classify native", () => {
  // ⚠️ Oracle text copied from the bundle. This run has twice shipped a fixture written from recall.
  for (const card of [
    { name: "Drinker of Sorrow", type: "Creature — Horror", mana: "{2}{B}", power: 5, toughness: 3,
      oracle: "This creature can't block.\nWhenever this creature deals combat damage, sacrifice a permanent." },
    { name: "Perilous Research", type: "Instant", mana: "{1}{U}",
      oracle: "Draw two cards, then sacrifice a permanent." },
  ]) {
    it(`${card.name}`, () => expect(isNativeTier(classifyCard(card)), classifyCard(card)).toBe(true));
  }
});

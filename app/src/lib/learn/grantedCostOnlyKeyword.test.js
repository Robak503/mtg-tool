/**
 * grantedCostOnlyKeyword.test.js — "<Type> spells you cast have <cost-only keyword>."
 * Chief Engineer (#7075, convoke) · Inspiring Statuary (#963, improvise) · Ironheart, Clever Champion
 * (improvise) · Hunting Velociraptor (#3790, prowl — on the shelf).
 *
 * ⭐ VACUOUS ON EXACTLY THE PREMISE THAT ALREADY CREDITS THE PRINTED FORM. parseHelpers'
 * COST_ONLY_KEYWORD_LINE credits convoke / improvise / delve ON A SPELL because "the runtime hard-casts at
 * full printed cost, so an option it never takes cannot change what resolves", and coverage's
 * reVacuousAltCastCost credits prowl the same way. GRANTING one of those keywords to a class of spells adds
 * the SAME never-taken option to other cards, so the grant is vacuous iff the print is — the two credits
 * stand or fall together, and if the engine ever learns to USE these costs both must be revisited.
 *
 * ⛔⛔ THE ALLOWLIST IS THE WHOLE GUARD AND IT IS DELIBERATELY SHORT. The corpus grants TEN other keywords
 * through this identical sentence shape and not one may be credited, because each changes what HAPPENS
 * rather than offering a cheaper route. A generic `\w+` in that slot would have credited all ten. Every one
 * is pinned below — especially FLASH, which changes TIMING and is the easiest to wave through by accident.
 */
import { describe, expect, it } from "vitest";
import { parseStaticAbilities } from "./staticAbilityParser.js";
import { classifyCard } from "./coverage.js";

// Real printed oracle, read out of the bundled index.
const CHIEF_ENGINEER = { name: "Chief Engineer", type: "Creature — Vedalken Artificer", power: "1", toughness: "3", mana: "{1}{U}",
  oracle: "Artifact spells you cast have convoke. (Your creatures can help cast those spells.)" };
const INSPIRING_STATUARY = { name: "Inspiring Statuary", type: "Artifact", mana: "{3}",
  oracle: "Nonartifact spells you cast have improvise. (Your artifacts can help cast those spells.)" };
const HUNTING_VELOCIRAPTOR = { name: "Hunting Velociraptor", type: "Creature — Dinosaur", power: "2", toughness: "2", mana: "{2}{R}",
  oracle: "First strike\nDinosaur spells you cast have prowl {2}{R}." };
const st = (oracle) => parseStaticAbilities({ name: "Probe", type: "Creature — Wizard", oracle });

describe("the three cost-only grants are recognised as the no-ops they are", () => {
  it("convoke / improvise / delve / prowl-with-a-cost", () => {
    for (const line of ["Artifact spells you cast have convoke.", "Nonartifact spells you cast have improvise.",
      "Zombie spells you cast have delve.", "Dinosaur spells you cast have prowl {2}{R}."]) {
      expect(st(line)).toEqual([{ grantedCostOnlyKeywordNoop: true }]);
    }
  });

  // ⭐ THE COST PATTERN BIT ME AND THE FLIP-DIFF CAUGHT IT. My first anchor was `prowl(?: \{[^}]+\})+`,
  // which requires a space before EVERY brace group — so it matched "prowl {2}" but NOT "prowl {2}{R}",
  // and Hunting Velociraptor (the whole reason for the slice) silently stayed parked while three other
  // cards flipped. A multi-pip cost is ONE space then N adjacent groups.
  it("a MULTI-PIP prowl cost matches (one space, then adjacent pips)", () => {
    expect(st("Dinosaur spells you cast have prowl {2}{R}.")).toHaveLength(1);
    expect(st("Ninja spells you cast have prowl {1}{U}{B}.")).toHaveLength(1);
  });

  it("⛔ prowl WITHOUT a cost is not the printed shape and is not credited", () => {
    expect(st("Dinosaur spells you cast have prowl.")).toEqual([]);
  });
});

describe("⛔⛔ the ten keywords the corpus grants through this SAME sentence that must NOT be credited", () => {
  // Each changes what happens rather than offering a cheaper route. All are real corpus grants.
  const FORBIDDEN = [
    ["cascade", "Sliver spells you cast have cascade."],                  // The First Sliver — free spells
    ["storm", "Sorcery spells you cast have storm."],                     // Ral / Prismari — copies
    ["demonstrate", "Creature spells you cast have demonstrate."],        // copy + an opponent draws
    ["flash", "Familiar spells you cast have flash."],                    // ⚠️ TIMING — the easy mistake
    ["affinity", "Enchantment spells you cast have affinity."],           // needs a "for <type>" tail to mean anything
    ["sticker", "Creature spells you cast have sticker."],
    ["freerunning", "Assassin spells you cast have freerunning."],
    ["madness", "Goblin spells you cast have madness."],
    ["escape", "Zombie spells you cast have escape."],
    ["riot", "Dinosaur spells you cast have riot."],
  ];
  for (const [kw, line] of FORBIDDEN) {
    it(`⛔ ${kw}`, () => { expect(st(line)).toEqual([]); });
  }
});

describe("coverage — the four carriers flip, and the real forbidden cards stay parked", () => {
  it("Chief Engineer / Inspiring Statuary / Hunting Velociraptor", () => {
    expect(classifyCard(CHIEF_ENGINEER)).toBe("native-static");
    expect(classifyCard(INSPIRING_STATUARY)).toBe("native-static");
    expect(classifyCard(HUNTING_VELOCIRAPTOR)).toBe("native-static");
  });

  it("⛔ The First Sliver stays parked — cascade is a real effect, not a cheaper route", () => {
    expect(classifyCard({ name: "The First Sliver", type: "Legendary Creature — Sliver", power: "7", toughness: "7", mana: "{W}{U}{B}{R}{G}",
      oracle: "Changeling\nThe First Sliver and Sliver spells you cast have cascade." })).not.toMatch(/^native/);
  });

  it("⛔ an unmodeled companion line still parks a credited carrier", () => {
    expect(classifyCard({ ...CHIEF_ENGINEER, name: "Fake Engineer",
      oracle: "Artifact spells you cast have convoke.\nWhenever a player consults an oracle, interpret its riddle however you like." }))
      .not.toMatch(/^native/);
  });
});

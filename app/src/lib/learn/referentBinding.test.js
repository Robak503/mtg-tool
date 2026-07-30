/**
 * referentBinding.test.js — BOUND REFERENT keyword grants (CR 608.2):
 *
 *   "Rile deals 1 damage to target creature you control. THAT CREATURE gains trample until end of turn."
 *   "…attach it to target creature you control. THAT CREATURE gains first strike until end of turn."  (Coral Sword)
 *   "…put a +1/+1 counter on target creature. THAT CREATURE gains flying until end of turn."          (Eutropia)
 *
 * The parser refused unbound referents everywhere before this, on the correct instinct that a mis-bound
 * "it" is a confident wrong grant on the WRONG permanent. That instinct is now preserved structurally, not
 * by refusal: the atom carries no targetType of its own, and programConfidence forces the whole program LOW
 * unless a targeting atom sits immediately before it.
 *
 * The load-bearing test in this file is the one asserting the grant lands on the targeted creature AND NOT
 * on its neighbour — a binding that grants to everything would satisfy every other assertion here.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { classifyCard } from "./coverage.js";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { parseEffectClause } from "./effects/parser.js";
import { runEffectProgram } from "./effects/runProgram.js";
import { permanentHasKeyword } from "./layers.js";

beforeEach(() => _resetIdsForTests());

const spell = (o) => ({ name: "C", type: "Instant", mana: "{1}{W}", oracle: o });

/** Two creatures the user controls, so a leaked grant is visible on the neighbour. */
function twoCreatures() {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  const mk = (id) => createPermanent({ id, card: { name: id, type: "Creature — Bear", mana: "{1}{G}", oracle: "", id: `c${id}` }, controller: "user" });
  return { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [mk("alpha"), mk("beta")] } } };
}

describe("bound referent — parse and the CREED gate", () => {
  it("parses with NO targetType of its own, marked to bind the previous atom's targets", () => {
    const prog = parseEffectClause("Target creature gets +2/+2 until end of turn. It gains flying until end of turn.", "Instant");
    const bound = (prog?.atoms || []).filter((a) => a.bindPreviousTargets);
    expect(bound).toHaveLength(1);
    expect(bound[0].targetType).toBeUndefined();   // must never enumerate a target of its own
    expect(bound[0].grantKeywords).toContain("Flying");
  });

  it("accepts the referent spellings that share one antecedent", () => {
    for (const ref of ["It", "That creature", "They", "Those creatures"]) {
      const o = `Target creature gets +2/+2 until end of turn. ${ref} gains flying until end of turn.`;
      expect(classifyCard(spell(o))).toBe("native-spell");
    }
  });

  it("⛔ REFUSES a referent with no antecedent (the whole point of the gate)", () => {
    // Index 0 — nothing before it at all.
    expect(classifyCard(spell("It gains flying until end of turn."))).toBe("arbiter-spell");
    // A preceding atom that targets NOTHING. Without the gate this parses, classifies native, and then
    // resolves to nothing — a card credited for an effect it never applies.
    expect(classifyCard(spell("Draw a card. It gains flying until end of turn."))).toBe("arbiter-spell");
  });

  it("leaves the explicitly-targeted twin untouched", () => {
    expect(classifyCard(spell("Target creature gains flying until end of turn."))).toBe("native-spell");
  });
});

describe("ENFORCEMENT — the grant lands on the bound creature", () => {
  // ⚠️ atomIndex:0 IS LOAD-BEARING and the first draft of this file omitted it. The real cast path
  // (targeting.expandCastChoices) tags every chosen target with the atom that chose it; targetsForAtom
  // then hands each atom only its own slice. With UNTAGGED targets it falls back to giving every atom
  // ALL of them — so the referent atom received the creature for free and three mutations survived,
  // including "delete the binding entirely". Tagging reproduces the real shape, where the referent atom
  // is allocated nothing and only the binding can find it.
  const run = (oracle, targetId) => {
    const program = parseEffectClause(oracle, "Instant");
    return runEffectProgram(twoCreatures(), {
      source: { name: "C" },
      payload: { params: { program, controller: "user", targets: [{ type: "creature", id: targetId, atomIndex: 0 }], sourceId: "src", context: {} } },
    });
  };

  it("VACUITY CONTROL: with no referent clause, neither creature has flying", () => {
    const out = run("Target creature gets +2/+2 until end of turn.", "alpha");
    const st = out?.state ?? out;
    expect(permanentHasKeyword(st, "alpha", "Flying")).toBe(false);
    expect(permanentHasKeyword(st, "beta", "Flying")).toBe(false);
  });

  it("⭐ grants to the TARGETED creature and NOT its neighbour", () => {
    const out = run("Target creature gets +2/+2 until end of turn. It gains flying until end of turn.", "alpha");
    const st = out?.state ?? out;
    expect(permanentHasKeyword(st, "alpha", "Flying")).toBe(true);
    // The assertion that matters: a binding that grants to every creature would pass every other test here.
    expect(permanentHasKeyword(st, "beta", "Flying")).toBe(false);
  });

  it("⭐ binds to the PREVIOUS atom's target only, not to every target on the spell", () => {
    // Three atoms: [0] pumps alpha, [1] is the referent, [2] separately targets beta. The referent must
    // reach alpha alone. With one target in the list "bind to the previous atom" and "bind to everything"
    // are indistinguishable — this is the only shape that separates them, and without it a mutation
    // replacing the binding with the whole target list survives the entire file.
    const program = parseEffectClause(
      "Target creature gets +2/+2 until end of turn. It gains flying until end of turn. Target creature gains haste until end of turn.",
      "Instant",
    );
    const out = runEffectProgram(twoCreatures(), {
      source: { name: "C" },
      payload: { params: { program, controller: "user", sourceId: "src", context: {},
        targets: [{ type: "creature", id: "alpha", atomIndex: 0 }, { type: "creature", id: "beta", atomIndex: 2 }] } },
    });
    const st = out?.state ?? out;
    expect(permanentHasKeyword(st, "alpha", "Flying")).toBe(true);
    expect(permanentHasKeyword(st, "beta", "Flying")).toBe(false);  // the discriminating assertion
    expect(permanentHasKeyword(st, "beta", "Haste")).toBe(true);    // atom 2 still reaches its own target
  });

  it("follows the target — pointing the spell at beta moves the grant with it", () => {
    const out = run("Target creature gets +2/+2 until end of turn. It gains flying until end of turn.", "beta");
    const st = out?.state ?? out;
    expect(permanentHasKeyword(st, "beta", "Flying")).toBe(true);
    expect(permanentHasKeyword(st, "alpha", "Flying")).toBe(false);
  });
});

describe("the real cards", () => {
  // Oracle text read from the bundled Scryfall snapshot.
  it("Rile — damage then a bound trample grant", () => {
    expect(classifyCard({
      name: "Rile", type: "Sorcery", mana: "{G}",
      oracle: "Rile deals 1 damage to target creature you control. That creature gains trample until end of turn.\nDraw a card.",
    })).toBe("native-spell");
  });

  it("Eutropia the Twice-Favored — a counter then a bound flying grant", () => {
    expect(classifyCard({
      name: "Eutropia the Twice-Favored", type: "Legendary Creature — Human Wizard", mana: "{1}{G}{U}",
      oracle: "Constellation — Whenever an enchantment you control enters, put a +1/+1 counter on target creature. That creature gains flying until end of turn.",
    })).toBe("native-trigger");
  });
});

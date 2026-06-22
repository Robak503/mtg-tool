/**
 * COUNT-OTHER (WALT) — "for each OTHER <X> you control" excludes the source permanent itself.
 *
 * A leading "other " on a controller-scoped count source ("draw a card for each other Dinosaur you
 * control" — Earthshaker Dreadmaw) means "every <X> you control but this one" (CR 113.7). The parser
 * tags the count spec `excludeSelf`; countForSpec drops ctx.sourceId from the tally at resolution. This
 * is a pure additive widening of the existing count engine — every non-"other" count source is
 * byte-identical, and "other" on a non-battlefield source (hand/graveyard) routes to the Arbiter (safe
 * false-negative) rather than guessing. The single resolver chokepoint (countForSpec) means EVERY
 * count consumer (FOR-EACH draw / gain-life / lose-life, DMG-SCALE, token countFor) self-excludes
 * uniformly; this consolidates the positive coverage the old MUST_DROP_TO_LOW pins used to (wrongly) deny.
 *
 * 13-deck citation: Earthshaker Dreadmaw (Joe's Pantlaza, Sun-Favored) flips body-only → native-trigger.
 * Corpus by-proxy: Goldnight Redeemer, Speakeasy Server (gain-life-for-each-other ETBs).
 */
import { describe, it, expect } from "vitest";
import { parseEffectClause, parseEffectProgram, programConfidence } from "./parser.js";
import { countForSpec } from "./atoms/shared.js";
import { classifyCard } from "../coverage.js";

const atomOf = (clause) => {
  const p = parseEffectClause(clause, "Instant");
  return p && programConfidence(p) === "high" ? p.atoms[0] : null;
};
const I = (oracle) => ({ type: "Sorcery", oracle, mana: "{1}{G}", name: "Test" });
const conf = (oracle) => programConfidence(parseEffectProgram(I(oracle)));

describe("COUNT-OTHER — parse: 'for each other <X> you control' tags excludeSelf", () => {
  it("draw a card for each other <subtype> you control → high, excludeSelf", () => {
    const a = atomOf("draw a card for each other Dinosaur you control");
    expect(a).toEqual({ op: "draw", amountCount: { kind: "permanentsYouControl", subtype: "Dinosaur", excludeSelf: true, per: 1 }, targetType: null });
  });

  it("you gain N life for each other creature you control → high, excludeSelf (cardType)", () => {
    const a = atomOf("you gain 1 life for each other creature you control");
    expect(a?.amountCount).toEqual({ kind: "permanentsYouControl", cardType: "creature", excludeSelf: true, per: 1 });
  });

  it("you gain N life for each other <subtype> you control → high, excludeSelf (subtype)", () => {
    const a = atomOf("you gain 1 life for each other Elf you control");
    expect(a?.amountCount).toEqual({ kind: "permanentsYouControl", subtype: "Elf", excludeSelf: true, per: 1 });
  });

  it("create a token for each other <X> you control → high, countFor excludeSelf", () => {
    const a = atomOf("create a 1/1 green Saproling creature token for each other creature you control");
    expect(a?.op).toBe("create-token");
    expect(a?.countFor).toMatchObject({ kind: "permanentsYouControl", cardType: "creature", excludeSelf: true });
  });

  it("the full program parses HIGH (these were the old stale MUST_DROP_TO_LOW pins)", () => {
    expect(conf("You gain 2 life for each other creature you control.")).toBe("high");
    expect(conf("Draw a card for each other Dinosaur you control.")).toBe("high");
  });

  it("REGRESSION: the non-'other' form is byte-identical (no excludeSelf)", () => {
    const a = atomOf("draw a card for each Dinosaur you control");
    expect(a?.amountCount).toEqual({ kind: "permanentsYouControl", subtype: "Dinosaur", per: 1 });
    expect(a?.amountCount?.excludeSelf).toBeUndefined();
  });

  it("FP guard: 'other' on a non-subtype word → not modeled (low)", () => {
    expect(atomOf("draw a card for each other widget you control")).toBeNull();
  });

  it("FP guard: 'other' on a NON-battlefield source (hand) → not modeled (safe FN)", () => {
    expect(atomOf("you gain 1 life for each other card in your hand")).toBeNull();
  });
});

describe("COUNT-OTHER — resolve: countForSpec excludes the source permanent", () => {
  const field = (...types) => ({ players: { P: { battlefield: types.map((t, i) => ({ id: `c${i}`, card: { type: t } })) } } });
  const dinoSpec = { kind: "permanentsYouControl", subtype: "Dinosaur", excludeSelf: true };
  const state = field("Creature — Dinosaur", "Creature — Dinosaur", "Creature — Dinosaur", "Creature — Beast");

  it("excludeSelf with the source on the battlefield drops exactly one (3 Dinos, src=c0 → 2)", () => {
    expect(countForSpec(state, { controller: "P", sourceId: "c0" }, dinoSpec)).toBe(2);
  });

  it("the same count WITHOUT excludeSelf is unchanged (→ 3)", () => {
    expect(countForSpec(state, { controller: "P", sourceId: "c0" }, { kind: "permanentsYouControl", subtype: "Dinosaur" })).toBe(3);
  });

  it("excludeSelf with the source NOT on the battlefield excludes nothing (→ 3)", () => {
    expect(countForSpec(state, { controller: "P", sourceId: "ghost" }, dinoSpec)).toBe(3);
  });

  it("excludeSelf with no sourceId (e.g. a spell) excludes nothing (→ 3)", () => {
    expect(countForSpec(state, { controller: "P" }, dinoSpec)).toBe(3);
  });

  it("a non-matching source is not spuriously excluded (src is the Beast → 3 Dinos)", () => {
    expect(countForSpec(state, { controller: "P", sourceId: "c3" }, dinoSpec)).toBe(3);
  });
});

describe("COUNT-OTHER — classify: whole-card flips to native (CREED)", () => {
  // Real oracle text (verified against the bundled index) — body keyword + a single ETB for-each-other clause.
  const cards = [
    { name: "Earthshaker Dreadmaw", type: "Creature — Dinosaur", mana: "{4}{G}{G}", oracle: "Trample\nWhen this creature enters, draw a card for each other Dinosaur you control." },
    { name: "Goldnight Redeemer", type: "Creature — Angel", mana: "{4}{W}{W}", oracle: "Flying\nWhen this creature enters, you gain 2 life for each other creature you control." },
    { name: "Speakeasy Server", type: "Creature — Bird Citizen", mana: "{4}{W}", oracle: "Flying\nWhen this creature enters, you gain 1 life for each other creature you control." },
  ];
  for (const c of cards) {
    it(`${c.name} → native-trigger`, () => {
      expect(classifyCard(c)).toBe("native-trigger");
    });
  }
});

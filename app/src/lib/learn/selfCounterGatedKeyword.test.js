/**
 * SELF-COUNTER-GATED KEYWORD (CR 613.1f-adjacent, layer 6) — a permanent that has a keyword "as long as it
 * has N or more +1/+1 counters on it". The conditional-keyword static is now modeled: parseStaticAbilities
 * emits a layer-6 gated `addKeyword` whose gate (`countSpec.kind === "countersOnSelf"`) layers.gateMet reads
 * off the permanent's OWN +1/+1 pile and re-evaluates live (CR 613.7) — so the keyword appears the instant the
 * count crosses N and disappears if it later drops. This is the LAST blocker on Primordial Hydra (a Zaxara
 * deck card): its upkeep counter-doubler trigger already routes natively, so once the trample static is modeled
 * the WHOLE card is CREED-clean → native-mixed.
 *
 * This file pins:
 *   1. CLASSIFY — Primordial Hydra flips to native-mixed (every clause modeled: enters-with-X + upkeep doubler
 *      + counter-gated trample).
 *   2. RUNTIME — the trample grant flips EXACTLY at the threshold (off below N, on at ≥N), live, via
 *      permanentHasKeyword (the same accessor combat/legality read). The metric matches real engine behavior.
 *   3. CREED anti-FP — Taborax (same lever, but an UNMODELED death-trigger rider) stays body-only; a wrong
 *      counter kind / a qualified threshold / an ungrantable rider all emit NOTHING (the card stays LOW).
 *
 * Real oracle text (verified vs the bundled local index), verbatim.
 */
import { describe, it, expect } from "vitest";
import { classifyCard } from "./coverage.js";
import { parseStaticAbilities, clauseProducesStatic } from "./staticAbilityParser.js";
import { createGameState, _resetIdsForTests, createPermanent } from "./gameState.js";
import { permanentHasKeyword } from "./layers.js";

const PRIMORDIAL = {
  name: "Primordial Hydra", type: "Creature — Hydra", mana: "{X}{G}{G}", power: 0, toughness: 0,
  oracle: "This creature enters with X +1/+1 counters on it.\nAt the beginning of your upkeep, double the number of +1/+1 counters on this creature.\nThis creature has trample as long as it has ten or more +1/+1 counters on it.",
};

// Taborax uses its OWN NAME ("Taborax has lifelink …") — selfNormalizeOracle rewrites it to "this creature"
// before the static parser runs, so the same gate matches. Its lifelink clause is now modeled, but its
// death-trigger ("…If that creature was a Cleric, you may draw a card. If you do, you lose 1 life.") is an
// unmodeled rider, so the WHOLE card stays body-only (a SAFE false-negative — never a partial-coverage FP).
const TABORAX = {
  name: "Taborax, Hope's Demise", type: "Legendary Creature — Demon Cleric", mana: "{2}{B}", power: 3, toughness: 3,
  oracle: "Flying\nTaborax has lifelink as long as it has five or more +1/+1 counters on it.\nWhenever another nontoken creature you control dies, put a +1/+1 counter on Taborax. If that creature was a Cleric, you may draw a card. If you do, you lose 1 life.",
};

describe("SELF-COUNTER-GATED KEYWORD — coverage classification", () => {
  it("Primordial Hydra → native-mixed (enters-with-X + upkeep doubler + counter-gated trample all modeled)", () => {
    expect(classifyCard(PRIMORDIAL)).toBe("native-mixed");
  });

  it("the counter-gated-trample clause alone produces a modeled static descriptor", () => {
    // selfNormalizeOracle has already rewritten any card-name self-ref to "this creature" upstream.
    expect(clauseProducesStatic("this creature has trample as long as it has ten or more +1/+1 counters on it")).toBe(true);
  });

  it("emits ONE layer-6 gated addKeyword(trample) with a countersOnSelf ≥10 gate", () => {
    const fx = parseStaticAbilities(PRIMORDIAL);
    const kw = fx.filter((e) => e.layer === 6 && e.op?.layerOp === "addKeyword");
    expect(kw.length).toBe(1);
    expect(String(kw[0].op.keyword).toLowerCase()).toBe("trample");
    expect(kw[0].op.gate).toEqual({ countSpec: { kind: "countersOnSelf", counterType: "+1/+1" }, atLeast: 10, excludeSelf: false });
  });
});

describe("SELF-COUNTER-GATED KEYWORD — runtime: the grant flips exactly at the threshold (live)", () => {
  const hasTrampleAt = (count) => {
    _resetIdsForTests();
    let s = createGameState({ userDeck: [], aiDeck: [] });
    const perm = createPermanent({ id: "prim", card: { ...PRIMORDIAL, id: "prim" }, controller: "user" });
    perm.counters = { "+1/+1": count };
    s = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [perm] } } };
    return permanentHasKeyword(s, "prim", "trample");
  };

  it("0 counters → no trample", () => { expect(hasTrampleAt(0)).toBe(false); });
  it("9 counters → no trample (below the threshold)", () => { expect(hasTrampleAt(9)).toBe(false); });
  it("10 counters → trample (the threshold is inclusive: 'ten or more')", () => { expect(hasTrampleAt(10)).toBe(true); });
  it("15 counters → trample", () => { expect(hasTrampleAt(15)).toBe(true); });

  it("Taborax's lifelink flips at 5 (a different keyword, different threshold, same lever)", () => {
    const hasLifelinkAt = (count) => {
      _resetIdsForTests();
      let s = createGameState({ userDeck: [], aiDeck: [] });
      const perm = createPermanent({ id: "tab", card: { ...TABORAX, id: "tab" }, controller: "user" });
      perm.counters = { "+1/+1": count };
      s = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [perm] } } };
      return permanentHasKeyword(s, "tab", "lifelink");
    };
    expect(hasLifelinkAt(4)).toBe(false);
    expect(hasLifelinkAt(5)).toBe(true);
  });
});

describe("SELF-COUNTER-GATED KEYWORD — CREED anti-FP (never a partial-coverage over-claim)", () => {
  it("Taborax stays body-only — its death-trigger rider is unmodeled (the modeled lifelink static can't mask it)", () => {
    expect(classifyCard(TABORAX)).toBe("body-only");
  });

  it("a NAMED counter kind (charge counters) is not this lever's — but the BLITZ CA-2 unified self lane models it exactly (countersOnSelf 'charge')", () => {
    // Pre-CA-2 this pinned FALSE (the +1/+1-only parseSelfCounterGate was the sole lane and rightly
    // rejected other kinds). CA-2 routes the leftover through parseAsLongAsGate, whose named-counter
    // threshold reads the permanent's own 'charge' pile — the same exact evaluator, a lifted park.
    expect(clauseProducesStatic("this creature has trample as long as it has three or more charge counters on it")).toBe(true);
  });

  it("a QUALIFIED threshold ('the most +1/+1 counters', not 'N or more on it') is NOT modeled", () => {
    expect(clauseProducesStatic("this creature has trample as long as it has the most +1/+1 counters")).toBe(false);
  });

  it("an UNGRANTABLE rider ('is a 4/4') drops the whole clause → not modeled (no silent drop)", () => {
    expect(clauseProducesStatic("this creature is a 4/4 as long as it has five or more +1/+1 counters on it")).toBe(false);
  });

  it("a non-grantable keyword (banding) gated on the same counter threshold stays unmodeled", () => {
    expect(clauseProducesStatic("this creature has banding as long as it has five or more +1/+1 counters on it")).toBe(false);
  });
});

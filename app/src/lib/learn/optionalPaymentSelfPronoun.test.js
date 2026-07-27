/**
 * optionalPaymentSelfPronoun.test.js — the Thriving cycle's self pronoun (census slice 40).
 *
 * "Whenever this creature attacks, you may pay {E}{E}. If you do, put a +1/+1 counter on IT."
 * "…you may pay {W}. If you do, IT gains flying until end of turn."
 *
 * The optional-payment lane already existed (cost parsing, the energy variant, the pending-choice runtime).
 * The only thing failing was the bare pronoun: "it" does not resolve, so the payoff parsed LOW and the whole
 * card parked. On these cards the sentence introduces no other object, so "it" is the source.
 *
 * WHY AN ALLOWLIST AND NOT A DENYLIST — this is the important part. A denylist would have to anticipate
 * every way another object can enter the sentence, and "create a token … it gains haste" would slip straight
 * through and pump the WRONG permanent. That is the same pronoun trap that made "sacrifice it at the
 * beginning of the next end step" unsafe to normalize earlier in this session (1 safe card against 48
 * landmines). So only the two printed self-shapes are rewritten; everything else keeps its pronoun, fails to
 * parse, and stays on the Arbiter.
 */
import { describe, expect, it } from "vitest";

import { parseEffectClause } from "./effects/parser.js";
import { classifyCard } from "./coverage.js";
import { detectTriggers } from "./triggers.js";

const attacks = (payoff, cost = "{E}{E}") => `Whenever this creature attacks, you may pay ${cost}. If you do, ${payoff}`;
const rat = (oracle) => ({ name: "Thriving Rats", type: "Creature — Rat", mana: "{2}{B}", power: 2, toughness: 2, keywords: [], oracle });

describe("the self pronoun now binds to the source", () => {
  it("'put a +1/+1 counter on it' → an add-counter atom targeting SELF", () => {
    const r = parseEffectClause("you may pay {E}{E}. If you do, put a +1/+1 counter on it", "Creature");
    expect(r.confidence).toBe("high");
    expect(r.atoms[0]).toMatchObject({ op: "optional-mana-payment", cost: { kind: "energy", amount: 2 } });
    expect(r.atoms[0].effectAtoms[0]).toMatchObject({ op: "add-counter", target: "self" });
  });

  it("'it gains flying until end of turn' likewise", () => {
    const r = parseEffectClause("you may pay {W}. If you do, it gains flying until end of turn", "Creature");
    expect(r.confidence).toBe("high");
    expect(r.atoms[0].effectAtoms[0]).toMatchObject({ op: "pump", target: "self" });
  });

  it("the carrier flips, and its trigger is the SELF-scoped attacks event", () => {
    const card = rat(`This creature enters tapped.\n${attacks("put a +1/+1 counter on it.")}`);
    expect(classifyCard(card)).toMatch(/^native/);
    expect(detectTriggers(card)[0]).toMatchObject({ event: "attacks", scope: "self" });
  });
});

describe("CREED — the allowlist refuses every ambiguous pronoun", () => {
  it("a TOKEN-maker keeps its pronoun and parks — 'it' would be the token, not the source", () => {
    // The exact shape a denylist would have missed. Pumping the source here would be the wrong permanent.
    const r = parseEffectClause("you may pay {2}. If you do, create a 2/2 colorless Robot artifact creature token. it gains haste until end of turn", "Creature");
    expect(r.confidence).not.toBe("high");
  });

  it("'ANOTHER target creature' is not rewritten", () => {
    const r = parseEffectClause("you may pay {C}. If you do, another target creature gains flying until end of turn", "Creature");
    expect(r.confidence).not.toBe("high");
  });

  it("a CHOSEN target payoff is not rewritten", () => {
    const r = parseEffectClause("you may pay {W}. If you do, tap target creature an opponent controls", "Creature");
    expect(r.confidence).not.toBe("high");
  });

  it("the EXPLICIT self wording was already high — this slice added the pronoun path, not the lane", () => {
    // Proves the change is narrow: "this creature" payoffs worked before and are untouched. (A "draw a
    // card" payoff is LOW here for its own pre-existing reason, unrelated to this slice.)
    const r = parseEffectClause("you may pay {2}. If you do, put a +1/+1 counter on this creature", "Creature");
    expect(r.confidence).toBe("high");
    expect(r.atoms[0].effectAtoms[0]).toMatchObject({ op: "add-counter", target: "self" });
  });
});

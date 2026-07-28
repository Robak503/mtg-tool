/**
 * sacrificedReferent.test.js — THE SACRIFICED REFERENT (CR 608.2h + 603.6e last-known-info):
 * "…equal to the sacrificed creature's power" (Fling #1462, Thud, Airdrop Condor, Bloodshot Cyclops).
 *
 * The permanent is GONE by the time the spell resolves, so its magnitude is captured at COST-PAYMENT time —
 * the only moment it is still on the battlefield — and read back through countForSpec, the same inter-atom
 * state channel the reanimate-drain chain uses for `revealedCardMV`.
 *
 * ⚠️ THIS SLICE NARROWED A REAL SAFETY GUARD, so most of the tests below are about what is STILL refused.
 * castModifiers carried a self-reference guard whose stated reason was that such an effect "can't be fed the
 * cost details" — accurate until this session. Now three magnitudes CAN be fed: power, toughness, mana value.
 *
 * The guard is therefore NARROWED, not lifted: a card is admitted only when EVERY "sacrificed" mention is one
 * of those three modeled phrases. Naming the creature as an OBJECT ("return the sacrificed creature"), or any
 * discard/exile self-reference (whose cost details are still uncaptured), keeps the whole card LOW exactly as
 * before. Those refusals are pinned here — they are the half of this change that must not rot.
 */
import { describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { parseEffectProgram, parseEffectClause } from "./effects/parser.js";
import { parseCountSource } from "./effects/parseHelpers.js";
import { countForSpec } from "./effects/atoms/shared.js";
import { _resetIdsForTests, createGameState } from "./gameState.js";

const SAC_COST = "As an additional cost to cast this spell, sacrifice a creature.";
const I = (body) => ({ name: "Fling", type: "Instant", mana: "{1}{R}", keywords: [], oracle: `${SAC_COST}\n${body}` });

describe("count source", () => {
  it("parses the three modeled magnitudes", () => {
    expect(parseCountSource("the sacrificed creature's power")).toEqual({ kind: "sacrificedPower" });
    expect(parseCountSource("the sacrificed creature's toughness")).toEqual({ kind: "sacrificedToughness" });
    expect(parseCountSource("the sacrificed creature's mana value")).toEqual({ kind: "sacrificedManaValue" });
  });

  it("reads the captured stamp, and an ABSENT stamp is 0 — never a fabricated magnitude", () => {
    _resetIdsForTests();
    const s = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
    expect(countForSpec(s, { controller: "user" }, { kind: "sacrificedPower" })).toBe(0);
    const stamped = { ...s, sacrificedForCost: { power: 4, toughness: 5, manaValue: 3 } };
    expect(countForSpec(stamped, { controller: "user" }, { kind: "sacrificedPower" })).toBe(4);
    expect(countForSpec(stamped, { controller: "user" }, { kind: "sacrificedToughness" })).toBe(5);
    expect(countForSpec(stamped, { controller: "user" }, { kind: "sacrificedManaValue" })).toBe(3);
  });
});

describe("the NARROWED guard — what it now admits", () => {
  it("Fling's shape flips, with the amount bound to the captured power", () => {
    const p = parseEffectProgram(I("Fling deals damage equal to the sacrificed creature's power to any target."));
    expect(p.confidence).toBe("high");
    expect(p.additionalCosts).toEqual([{ kind: "sacrifice", sacType: "creature" }]);
    expect(p.atoms[0]).toEqual({ op: "deal-damage", targetType: "any", amountCount: { kind: "sacrificedPower", per: 1 } });
  });

  it("the toughness variant is admitted too", () => {
    expect(parseEffectProgram(I("Fling deals damage equal to the sacrificed creature's toughness to any target."))
      .atoms[0].amountCount.kind).toBe("sacrificedToughness");
  });

  it("REGRESSION PIN — a body with NO self-reference is unaffected", () => {
    const p = parseEffectProgram(I("Draw two cards."));
    expect(p.confidence).toBe("high");
    expect(p.additionalCosts).toEqual([{ kind: "sacrifice", sacType: "creature" }]);
  });

  it("the GAIN-LIFE arm reads the same stamp (Reckoner's Bargain #3671)", () => {
    // A second arm off one capture: the stamp was always general, only the readers were per-atom-family.
    const p = parseEffectProgram(I("Draw two cards, then you gain life equal to the sacrificed creature's toughness."));
    expect(p.confidence).toBe("high");
    expect(p.atoms.some((a) => a.op === "gain-life" && a.amountCount?.kind === "sacrificedToughness")).toBe(true);
  });

  it("the gain-life arm accepts power and mana value off the same stamp", () => {
    const pw = parseEffectProgram(I("You gain life equal to the sacrificed creature's power."));
    expect(pw.atoms[0].amountCount.kind).toBe("sacrificedPower");
    const mv = parseEffectProgram(I("You gain life equal to the sacrificed creature's mana value."));
    expect(mv.atoms[0].amountCount.kind).toBe("sacrificedManaValue");
  });

  it("the DRAW arm reads the same stamp (Life's Legacy #2490)", () => {
    const p = parseEffectProgram(I("Draw cards equal to the sacrificed creature's power."));
    expect(p.confidence).toBe("high");
    expect(p.atoms[0]).toEqual({ op: "draw", amountCount: { kind: "sacrificedPower", per: 1 }, targetType: null });
  });

  it("THE DRAW ARM TAKES NO TARGET — the referent is the paid cost, not a chosen creature", () => {
    // It sits beside a "draw cards equal to the power of TARGET creature" arm that DOES take a target.
    // Copying that shape would make the spell demand a target it never prints — a wrong cast, and the exact
    // mistake the adjacency invites.
    expect(parseEffectProgram(I("Draw cards equal to the sacrificed creature's power.")).atoms[0].targetType).toBeNull();
    expect(parseEffectClause("draw cards equal to the power of target creature you control").atoms[0].targetType).toBe("creature");
  });

  it("REGRESSION PIN — the TRIGGERING-creature arm is untouched (a different referent entirely)", () => {
    // The sibling this arm was modelled on. It reads ctx.triggeringPermanentId, not the cost stamp; conflating
    // the two would make an ETB payoff read a sacrifice that never happened.
    // Asserted at the CLAUSE level on purpose: "the triggering creature's …" is a SENTINEL that detectTriggers
    // writes into a trigger's text, so it never appears on a bare spell — a whole-card fixture would test the
    // sentinel gate rather than this arm. (My first attempt did exactly that and failed for the wrong reason.)
    expect(parseEffectClause("you gain life equal to the triggering creature's toughness").atoms[0].amountCount.kind)
      .toBe("triggeringToughness");
  });
});

/**
 * ⚠️ HONESTY NOTE — THESE ARE INTENT PINS, NOT PROOF. Mutation-checked and they DO NOT BITE: deleting the
 * narrowed guard entirely leaves every assertion below still passing.
 *
 * That is not a flaw in the tests, it is a fact about the guard: castModifiers' own comment calls it
 * "belt-and-suspenders", because the UNDERLYING PARSE already refuses these bodies (an unmodeled effect or an
 * unmodeled "equal to …" count drops the program to low on its own). I could not construct a reachable input
 * where the guard is load-bearing — which is also precisely why NARROWING it is safe: the protection that
 * actually stops these cards is the parse, and that is untouched.
 *
 * They are kept because they pin the INTENT (these shapes must never become native by accident) and would
 * catch a future slice that taught the parser one of these phrases without also feeding its referent.
 * Do not cite them as evidence the guard works.
 */
describe("the NARROWED guard — what is STILL refused (intent pins; see the honesty note above)", () => {
  const low = (body) => expect(parseEffectProgram(I(body)).confidence).toBe("low");

  it("THE LOAD-BEARING ONE — naming the creature as an OBJECT is still refused", () => {
    // "the sacrificed creature" as a THING (not a magnitude) has no captured referent — only its numbers
    // were stamped, not the object. Admitting this would bind the effect to nothing.
    low("Return the sacrificed creature to its owner's hand.");
  });

  it("an UNMODELED characteristic of the sacrificed creature is still refused", () => {
    low("Target player reveals their hand and discards all cards that share a color with the sacrificed creature's colors.");
  });

  it("a DISCARD self-reference is untouched by this change (its cost details are still uncaptured)", () => {
    const p = parseEffectProgram({
      name: "X", type: "Instant", mana: "{1}{U}", keywords: [],
      oracle: "As an additional cost to cast this spell, discard a card.\nDraw cards equal to the discarded card's mana value.",
    });
    expect(p.confidence).toBe("low");
  });

  it("a MIXED body — one modeled magnitude AND one object reference — is refused whole (CREED all-or-nothing)", () => {
    low("Fling deals damage equal to the sacrificed creature's power to any target. Return the sacrificed creature to its owner's hand.");
  });
});

describe("classification — the staples this unblocks", () => {
  it("Fling #1462 flips", () => {
    expect(classifyCard(I("Fling deals damage equal to the sacrificed creature's power to any target."))).toMatch(/^native/);
  });
});

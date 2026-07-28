/**
 * copyInstantSorcery.test.js — COPY AN INSTANT OR SORCERY (CR 707.10): Reverberate #1380, Reiterate #2605,
 * Twincast #6278, Flare of Duplication #1123.
 *
 * Wave A of the vein pile's remainder. The engine could copy a CREATURE spell (Double Major) but not an
 * instant/sorcery, and the "you may choose new targets for the copy" rider was never the gap — the copy was.
 *
 * NOT A TOKEN, unlike the creature-spell copy: an instant/sorcery copy resolves its EFFECT and then ceases to
 * exist (CR 707.10a — it was never a card, so it goes to no zone). So the copy IS the original's resolving
 * payload, DEEP-cloned with the controller re-pointed. Deep, not shared: the payload carries the program, its
 * targets and xValue, and the resolver mutates params as it runs — a shared object would let the copy's
 * resolution reach into the original's.
 *
 * THE RETARGET RIDER IS DECLINED, NOT MODELLED. Declining is always legal (CR 707.10c), so keeping the
 * original targets is a faithful SUBSET of the printed card — it can forgo an option, never play a different
 * one. It is stripped in splitClauses' normalize pass, because the rider is its own SENTENCE and the sentence
 * split runs above the clause loop — a keep-whole guard down there cannot reach it. (I tried that first.)
 *
 * ⚠️ THE FALSE POSITIVE THIS SLICE NEARLY SHIPPED, and why the filter test below matters most:
 * spellMatchesCounterFilter returns TRUE ("any spell") for an UNRECOGNISED filter string. I first wrote
 * spellFilter:"instantOrSorcery" — a plausible synonym that is not in the table — which would have let
 * Reverberate copy a CREATURE spell. A wrong target, not a missing one, and invisible in the tier. The real
 * name is "instantSorcery" (Flusterstorm's CNT-IS), reused rather than coined.
 */
import { describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { parseEffectClause } from "./effects/parser.js";
import { splitClauses } from "./effects/splitClauses.js";
import { enumerateTargets } from "./spellEffects.js";
import { stackResolvers } from "./effects/atoms/stack.js";
import { _resetIdsForTests, createGameState, createStackObject } from "./gameState.js";

const S = (name, oracle) => ({ name, type: "Instant", mana: "{1}{R}", keywords: [], oracle });
const REVERBERATE = "Copy target instant or sorcery spell. You may choose new targets for the copy.";

function stacked() {
  _resetIdsForTests();
  const s0 = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
  const bolt = { id: "c-bolt", name: "Bolt", type: "Instant", oracle: "", cmc: 1 };
  const bear = { id: "c-bear", name: "Bear", type: "Creature — Bear", oracle: "", cmc: 2 };
  return {
    ...s0,
    stack: [
      createStackObject({ id: "spl", kind: "spell", source: bolt, controller: "ai1", targets: [{ type: "player", id: "user" }], payload: { resolver: "EFFECT_PROGRAM", params: { controller: "ai1", xValue: 3 } } }),
      createStackObject({ id: "crt", kind: "spell", source: bear, controller: "ai1", payload: { resolver: "PERMANENT_ETB", params: { controller: "ai1", card: bear } } }),
    ],
  };
}

const copy = (state, targetId) =>
  stackResolvers["copy-instant-or-sorcery"](state, { op: "copy-instant-or-sorcery" }, { controller: "user", targets: [{ type: "spell", id: targetId }] });

describe("parse + the normalize strip", () => {
  it("the optional-retarget SENTENCE is stripped, leaving one clean clause", () => {
    expect(splitClauses(REVERBERATE)).toEqual(["Copy target instant or sorcery spell"]);
  });

  it("the clause parses to the copy atom with the REAL filter name", () => {
    expect(parseEffectClause("copy target instant or sorcery spell").atoms).toEqual([
      { op: "copy-instant-or-sorcery", targetType: "spell", spellFilter: "instantSorcery", copyNotCounter: true },
    ]);
  });

  it("CREED — a rider that CHANGES the copy is not claimed (Fork's 'except that the copy is red')", () => {
    expect(parseEffectClause("copy target instant or sorcery spell, except that the copy is red").atoms?.[0]?.op)
      .not.toBe("copy-instant-or-sorcery");
  });

  it("REGRESSION PIN — the creature-spell copy is untouched (Double Major)", () => {
    expect(parseEffectClause("copy target creature spell you control").atoms[0].op).toBe("copy-creature-spell");
  });
});

describe("targeting — the filter that nearly went wrong", () => {
  it("THE LOAD-BEARING ONE — only the INSTANT is offered; the CREATURE spell is NOT", () => {
    // The spec is taken FROM THE PARSED ATOM, not hand-written here. That distinction is the whole test:
    // an unrecognised filter string makes spellMatchesCounterFilter return TRUE for everything, so hand-
    // writing "instantSorcery" would pass even if the atom shipped a bad synonym. (My first version did
    // exactly that and survived a mutation that broke the atom — caught only because the mutation ran.)
    const atom = parseEffectClause("copy target instant or sorcery spell").atoms[0];
    const got = enumerateTargets(stacked(), "user", atom, [], {});
    expect(got.map((t) => t.id)).toEqual(["spl"]);
  });
});

describe("RUNTIME — the copy goes on the stack and is the copier's", () => {
  it("a copy is pushed, ON TOP (it resolves before the spell it copied)", () => {
    const s = copy(stacked(), "spl");
    expect(s.stack).toHaveLength(3);
    expect(s.stack[s.stack.length - 1].isCopy).toBe(true);
  });

  it("the COPIER controls the copy, not the original's controller (CR 707.10)", () => {
    const top = copy(stacked(), "spl").stack.at(-1);
    expect(top.controller).toBe("user");
    expect(top.payload.params.controller).toBe("user");
  });

  it("THE DEEP-CLONE PIN — mutating the copy's payload does NOT reach the original", () => {
    const s = copy(stacked(), "spl");
    const original = s.stack.find((o) => o.id === "spl");
    s.stack.at(-1).payload.params.xValue = 99;
    expect(original.payload.params.xValue).toBe(3);
  });

  it("the copy keeps the original's targets and xValue (CR 707.10b/c — retarget declined)", () => {
    const top = copy(stacked(), "spl").stack.at(-1);
    expect(top.targets).toEqual([{ type: "player", id: "user" }]);
    expect(top.payload.params.xValue).toBe(3);
  });

  it("the ORIGINAL spell is left on the stack untouched", () => {
    const s = copy(stacked(), "spl");
    expect(s.stack.find((o) => o.id === "spl").controller).toBe("ai1");
  });

  it("a target that already left the stack fizzles — no fabricated copy (CR 608.2b)", () => {
    const s = copy(stacked(), "gone");
    expect(s.stack).toHaveLength(2);
  });
});

describe("classification — the staples this unblocks", () => {
  it("Reverberate's shape flips", () => {
    expect(classifyCard(S("Reverberate", REVERBERATE))).toMatch(/^native/);
  });
});

/**
 * registrySeams.test.js — WAVE 0 Part B.
 *
 * Proves the three ADDITIVE registration seams are LIVE (the registered handler is actually consulted
 * by the dispatch body) AND empty-is-an-exact-no-op (a registered handler that returns null leaves the
 * existing result byte-for-byte unchanged — no behavior drift). vitest isolates modules per test file,
 * so the spies registered here don't leak into other suites.
 *
 * Also a barrel-integrity guard on effects/effectAtoms.js (the WAVE 0 Part A split): ATOM_RESOLVERS
 * stays frozen with the full key set, and all named exports resolve.
 */
import { describe, it, expect, vi } from "vitest";

import { detectTriggers, registerTriggerDetector } from "./triggers.js";
import { parseEffectClause, registerClauseParser } from "./effects/parser.js";
import { classifyCard, registerCoverageClassifier } from "./coverage.js";
import * as effectAtoms from "./effects/effectAtoms.js";
import { ATOM_RESOLVERS } from "./effects/effectAtoms.js";

describe("trigger detector registry seam", () => {
  it("consults a registered detector on an UNMATCHED condition and stays a no-op when it returns null", () => {
    const spy = vi.fn(() => null);
    registerTriggerDetector(spy);
    // "flarbnix" is not a real game action — classifyCondition can't match it, so the registry runs.
    const card = { name: "Test", type: "Creature — Human", oracle: "Whenever you flarbnix, draw a card." };
    const out = detectTriggers(card);
    expect(spy).toHaveBeenCalled();        // LIVE — the registry was consulted
    expect(spy.mock.calls[0][0]).toContain("flarbnix"); // it received the condition text
    expect(out).toEqual([]);               // no-op — null detector → no trigger detected (unchanged)
  });
});

describe("clause parser registry seam", () => {
  it("consults a registered parser on an unparseable clause and stays a no-op when it returns null", () => {
    const spy = vi.fn(() => null);
    registerClauseParser(spy);
    // An unparseable effect — neither the extended nor the legacy parse models it.
    const program = parseEffectClause("Flarbnix the wibble.", "Instant");
    expect(spy).toHaveBeenCalled();        // LIVE — the registry was consulted
    // null parser → the clause is still unmodeled → no high atom emitted (result unchanged).
    const atoms = program && Array.isArray(program.atoms) ? program.atoms : [];
    expect(atoms.length).toBe(0);
  });
});

describe("coverage classifier registry seam", () => {
  it("consults a registered classifier and leaves a known card's tier unchanged when it returns null", () => {
    // A composite permanent whose pieces are EACH modeled lands on native-mixed — which sits AFTER the
    // registry in classifyCard, so this card reaches the registry. (The single-mechanism tiers — mana /
    // trigger / activated / static / equipment — all return BEFORE the registry, so a card matching one
    // of them never consults it; native-mixed is the first tier downstream of the seam.) Capture the
    // baseline tier WITHOUT the spy first.
    const card = {
      name: "Registry Probe",
      type: "Creature — Elf",
      oracle: "Other Elves you control get +1/+1.\n{G}, {T}: Create a 1/1 green Elf Warrior creature token.",
    };
    const before = classifyCard(card);
    expect(before).toBe("native-mixed"); // sanity: this card reaches the seam (it's not an earlier tier)
    const spy = vi.fn(() => null);
    registerCoverageClassifier(spy);
    const after = classifyCard(card);
    expect(spy).toHaveBeenCalled();        // LIVE — the registry was consulted
    expect(spy.mock.calls[0][0]).toBe(card); // it received the card
    expect(after).toBe(before);            // no-op — null classifier → tier unchanged (still native-mixed)
  });
});

describe("effectAtoms barrel integrity (WAVE 0 Part A)", () => {
  it("ATOM_RESOLVERS is frozen with the full key set", () => {
    expect(Object.isFrozen(ATOM_RESOLVERS)).toBe(true);
    const keys = Object.keys(ATOM_RESOLVERS);
    expect(keys.length).toBeGreaterThanOrEqual(37);
    for (const op of ["deal-damage", "create-token", "discover", "divide-damage"]) {
      expect(ATOM_RESOLVERS).toHaveProperty(op);
      expect(typeof ATOM_RESOLVERS[op]).toBe("function");
    }
  });

  it("all 14 named exports resolve to the right kind", () => {
    expect(typeof effectAtoms.applyCreateToken).toBe("function");
    expect(typeof effectAtoms.enterCardFromZone).toBe("function");
    expect(typeof effectAtoms.sacrificeCreatureEffect).toBe("function");
    expect(typeof effectAtoms.advanceSacrificeChain).toBe("function");
    expect(typeof effectAtoms.applyProliferate).toBe("function");
    expect(typeof effectAtoms.applyEarthbend).toBe("function");
    expect(typeof effectAtoms.counterSpellById).toBe("function");
    expect(typeof effectAtoms.tutorManaValue).toBe("function");
    expect(typeof effectAtoms.cardMatchesTutorFilter).toBe("function");
    expect(typeof effectAtoms.shuffleControllerLibrary).toBe("function");
    expect(typeof effectAtoms.advanceDiscardChain).toBe("function");
    expect(typeof effectAtoms.applyDivideDamage).toBe("function");
    expect(typeof effectAtoms.resolveAtom).toBe("function");
    expect(typeof effectAtoms.ATOM_RESOLVERS).toBe("object");
  });
});

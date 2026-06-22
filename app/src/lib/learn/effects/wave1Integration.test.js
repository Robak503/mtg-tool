/**
 * wave1Integration.test.js — proves the INTEGRATOR's production wiring of the Wave-1 new-module clause
 * parsers is live. The builder unit tests register the clause parser IN-TEST (registrySeams precedent);
 * this suite registers NOTHING and relies solely on the registerClauseParser(...) calls at the bottom of
 * parser.js. If that wiring regresses (e.g. an atoms module accidentally self-registers and the bottom
 * call is dropped), these clauses fall back to legacy → null → low and this suite fails — the canary for
 * the parser → effectAtoms → atoms one-way edge staying intact while the seam is still wired.
 */
import { describe, it, expect } from "vitest";
import { parseEffectClause } from "./parser.js";
import { ATOM_RESOLVERS } from "./effectAtoms.js";

describe("Wave 1 — production clause-parser registration (no in-test register)", () => {
  it("manifest-dread + amass ops are KNOWN via the barrel", () => {
    expect(typeof ATOM_RESOLVERS["manifest-dread"]).toBe("function");
    expect(typeof ATOM_RESOLVERS.amass).toBe("function");
  });

  it("'Manifest dread.' parses HIGH to a manifest-dread atom (production-wired)", () => {
    const program = parseEffectClause("Manifest dread.", "Creature");
    expect(program.confidence).toBe("high");
    expect(program.atoms).toHaveLength(1);
    expect(program.atoms[0]).toMatchObject({ op: "manifest-dread" });
  });

  it("'Amass Slivers 2.' parses HIGH to an amass atom (production-wired)", () => {
    const program = parseEffectClause("Amass Slivers 2.", "Instant");
    expect(program.confidence).toBe("high");
    expect(program.atoms).toHaveLength(1);
    expect(program.atoms[0]).toMatchObject({ op: "amass", subtype: "Sliver", amount: 2 });
  });

  it("CREED — an unmodeled variant still routes to the Arbiter (no over-flip from the wiring)", () => {
    // amass with an unknown subtype, and a manifest-dread with trailing residue, must both stay LOW.
    expect(parseEffectClause("Amass Goblins 2.", "Sorcery").confidence).toBe("low");
    expect(parseEffectClause("Manifest dread, then draw a card.", "Creature").confidence).toBe("low");
  });
});

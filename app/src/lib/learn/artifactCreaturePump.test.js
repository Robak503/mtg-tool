/**
 * artifactCreaturePump.test.js — "target ARTIFACT creature you control gets ±N/±N [and gains KW]" pump
 * (SHELF-TAIL H1 — Baxter Stockman / Weldfast Engineer / Aethershield Artificer; CR 205.2 cardType target).
 *
 * The you-control pump arm (pctrl) already handled "target creature you control gets …"; the ONLY gap was
 * the ARTIFACT type qualifier. Two seams, both pre-existing: (a) splitClauses' pump keep-whole guard (the
 * clause carries internal " and "s — "+N/+N and gains first strike and vigilance" — that shatter it unless
 * kept whole; the guard matched bare "creature", not "artifact creature") and (b) the cardType restriction
 * {kind:"cardType", type:"artifact"} which creatureSatisfiesRestrictions ALREADY honors (the Modular "target
 * artifact creature" precedent) — so no enumeration/resolver change, only the parse. Flipped +3/0/0: Baxter
 * (ETB token + this pump), Weldfast Engineer (+2/+0), Aethershield Artificer (+2/+2 + indestructible).
 *
 * Mutation-checked (via Edit): the split guard's `(?:artifact )?` → the clause shatters → the classify pins
 * die; the actrl parser arm → the atom pins die; the cardType restriction in the arm → the runtime pin
 * (a NON-artifact creature is not a legal target) dies.
 */
import { describe, it, expect } from "vitest";
import { classifyCard } from "./coverage.js";
import { splitClauses } from "./effects/splitClauses.js";
import { parseEffectClause, programConfidence } from "./effects/parser.js";
import { creatureSatisfiesRestrictions } from "./creatureRestrictions.js";

const CLAUSE = "target artifact creature you control gets +3/+0 and gains first strike and vigilance until end of turn";
const RESTR = [{ kind: "controller", who: "you" }, { kind: "cardType", type: "artifact" }];
const ARTIFACT_ONLY = [{ kind: "cardType", type: "artifact" }];
const cr = (type) => ({ card: { type, power: 2, toughness: 2 } });

describe("H1 — split guard + parse", () => {
  it("SPLIT GUARD: the artifact-creature pump clause stays WHOLE (the internal 'and's never shatter it)", () => {
    expect(splitClauses(CLAUSE)).toEqual([CLAUSE]);
    // Control: the bare-creature form was ALREADY kept whole — unchanged.
    expect(splitClauses("target creature you control gets +3/+0 and gains first strike and vigilance until end of turn"))
      .toEqual(["target creature you control gets +3/+0 and gains first strike and vigilance until end of turn"]);
  });
  it("MUST STAY HIGH: the clause → pump with the cardType:artifact restriction + granted keywords", () => {
    const p = parseEffectClause(CLAUSE, "Instant", { sourceScoped: true });
    expect(programConfidence(p)).toBe("high");
    expect(p.atoms[0]).toMatchObject({ op: "pump", targetType: "creature", ptDelta: { p: 3, t: 0 }, grantKeywords: ["First strike", "Vigilance"] });
    expect(p.atoms[0].restrictions).toEqual(expect.arrayContaining(RESTR));
    // the pt-only form (Weldfast) parses too
    expect(programConfidence(parseEffectClause("target artifact creature you control gets +2/+0 until end of turn", "Instant", { sourceScoped: true }))).toBe("high");
  });
});

describe("H1 — the cardType restriction actually filters (CR 205.2)", () => {
  it("an ARTIFACT creature satisfies the restriction; a plain creature does NOT (mutation-check line)", () => {
    // cardType-only isolates the artifact filter (reads perm.card.type; state/pid/casterId are inert for it).
    expect(creatureSatisfiesRestrictions({}, cr("Artifact Creature — Robot"), "user", "user", ARTIFACT_ONLY)).toBe(true);
    expect(creatureSatisfiesRestrictions({}, cr("Creature — Human"), "user", "user", ARTIFACT_ONLY)).toBe(false);
  });
});

describe("H1 — the three cards classify native-trigger", () => {
  it("Baxter / Weldfast Engineer / Aethershield Artificer", () => {
    expect(classifyCard({ name: "Baxter Stockman", type: "Legendary Creature — Human Scientist", power: 3, toughness: 3, oracle: "When Baxter Stockman enters, create a 1/1 colorless Robot artifact creature token.\nAt the beginning of combat on your turn, target artifact creature you control gets +3/+0 and gains first strike and vigilance until end of turn." })).toBe("native-trigger");
    expect(classifyCard({ name: "Weldfast Engineer", type: "Creature — Human Artificer", power: 3, toughness: 2, oracle: "At the beginning of combat on your turn, target artifact creature you control gets +2/+0 until end of turn." })).toBe("native-trigger");
    expect(classifyCard({ name: "Aethershield Artificer", type: "Creature — Dwarf Artificer", power: 2, toughness: 3, oracle: "At the beginning of combat on your turn, target artifact creature you control gets +2/+2 and gains indestructible until end of turn." })).toBe("native-trigger");
  });
});

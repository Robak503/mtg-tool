/**
 * massBounceFilterDelegation.test.js — mass BOUNCE joins the shared restriction grammar (3 cards).
 *
 * Aetherize · Inundate · Part the Veil.
 *
 * The third verb onto the 16-kind grammar, after damage and destroy/exile. Same shape as the removal
 * delegation: peel "all", singularize the noun, probe, and refuse on any residue.
 *
 * ⚠️⭐ TWO THINGS THIS SLICE GOT WRONG FIRST, both recorded because the numbers are the only reason they
 * surfaced:
 *
 * 1 · **AN APOSTROPHE, NOT A MECHANISM.** The first build anchored on the plural "to their ownerS' handS",
 *     copying the bare wipe above it, and measured ONE flip against a prediction of three. Auditing the two
 *     misses showed the bundled oracle prints the FILTERED bounces with the SINGULAR "to their owner's hand"
 *     (Aetherize, Part the Veil). The cards were not blocked by anything structural — they differed from the
 *     anchor by one character. Both possessive forms are accepted now, and the miss is why: a prediction that
 *     comes in low is a lead, not a rounding error.
 *
 * 2 · **THE MASS-PUMP HALF SHIPPED ZERO AND WAS REVERTED.** The same delegation was written for
 *     "all <filtered> creatures get +N/+N", and three corpus filters read cleanly (Noxious Ghoul's
 *     non-Zombie, Tidal Influence's blue, Tori D'Avenant's other-attacking-you-control). It gained **0
 *     cards**: every one of those sits on a card blocked elsewhere — Ghoul's trigger subject ("this creature
 *     or another Zombie"), Tidal Influence's counter-gated static, Tori's three unmodeled clauses. Per the
 *     run's standing rule a 0-flip widening does not enter the baseline, so it was reverted rather than
 *     banked as "already done". Reading a filter is not flipping a card.
 */
import { describe, it, expect } from "vitest";
import { parseEffectClause } from "./effects/parser.js";
import { classifyCard, isNativeTier } from "./coverage.js";

const atomOf = (clause, type = "Sorcery") => (parseEffectClause(clause, type, { hasX: false })?.atoms || [])[0] || null;

describe("⭐ the delegated filter vocabulary reaches the bounce verb", () => {
  it("colour, combat state and controller all parse", () => {
    expect(atomOf("Return all nonblue creatures to their owners' hands.")).toEqual({
      op: "bounce", targetType: "eachCreature", restrictions: [{ kind: "colorNeg", color: "U" }] });
    expect(atomOf("Return all attacking creatures to their owner's hand.", "Instant")).toEqual({
      op: "bounce", targetType: "eachCreature", restrictions: [{ kind: "combat", value: "attacking" }] });
    expect(atomOf("Return all creatures you control to their owner's hand.", "Instant")).toEqual({
      op: "bounce", targetType: "eachCreature", restrictions: [{ kind: "controller", who: "you" }] });
  });

  it("⚠️ BOTH POSSESSIVE FORMS — the miss that cost two cards on the first run", () => {
    // Anchoring on the plural alone silently refused every card printed with the singular. The two forms
    // must behave identically; nothing about the apostrophe changes the effect.
    const plural = atomOf("Return all attacking creatures to their owners' hands.", "Instant");
    const singular = atomOf("Return all attacking creatures to their owner's hand.", "Instant");
    expect(singular).toEqual(plural);
  });
});

describe("⛔ the incumbents and the CREED gate", () => {
  it("the bare wipe and the except-for wipe are byte-identical", () => {
    expect(atomOf("Return all creatures to their owners' hands.")).toEqual({ op: "bounce", targetType: "eachCreature" });
    expect(atomOf("Return all creatures to their owners' hands except for Krakens, Leviathans, Octopuses, and Serpents."))
      .toMatchObject({ op: "bounce", subtypeNegate: true });
    expect(atomOf("Return all creatures to their owners' hands.").restrictions).toBeUndefined();
  });

  it("⛔ a NON-creature mass bounce still parks (no equivalent grammar behind it)", () => {
    expect(atomOf("Return all nonland permanents to their owners' hands.")).toBe(null);
    expect(atomOf("Return all artifacts to their owners' hands.")).toBe(null);
  });

  it("⛔ an unmodeled qualifier still parks", () => {
    expect(atomOf("Return all creatures blocking or blocked by target creature to their owners' hands.")).toBe(null);
  });
});

describe("⭐ the three carriers classify native", () => {
  for (const card of [
    { name: "Inundate", type: "Sorcery", mana: "{4}{U}", oracle: "Return all nonblue creatures to their owners' hands." },
    { name: "Aetherize", type: "Instant", mana: "{3}{U}", oracle: "Return all attacking creatures to their owner's hand." },
    { name: "Part the Veil", type: "Instant — Arcane", mana: "{2}{U}", oracle: "Return all creatures you control to their owner's hand." },
  ]) {
    it(`${card.name}`, () => expect(isNativeTier(classifyCard(card)), classifyCard(card)).toBe(true));
  }
});

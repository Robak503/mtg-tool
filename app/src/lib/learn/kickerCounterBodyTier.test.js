/**
 * kickerCounterBodyTier.test.js — the kicked-counter credit shouldn't depend on the base body (slice 20).
 *
 * The KICKER counter gate credited "Kicker {cost}" + "If this creature was kicked, it enters with N +1/+1
 * counters on it" ONLY when the rest of the card was keyword-only, returning a hard-coded native-body. So
 * Urborg Skeleton parked with EVERY line individually credited:
 *
 *   Kicker {3} + the kicked counter            -> native-body     on its own
 *   {B}: Regenerate this creature.             -> native-activated on its own
 *   all three together                         -> body-only        (the bug)
 *
 * Nothing about the kicker half depends on what the rest of the body is. The stripped body is re-classified
 * and the card takes THAT tier — the same shape as the self-no-untap parity fix, a credit that existed in
 * one path and not another.
 *
 * FOUND BY the census bug-signature report plus the two-flip signature: a card with TWO different
 * single-line deletions that each flip it native is never a missing mechanic, it is a composition failure.
 */
import { describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";

const KICKER = "Kicker {3} (You may pay an additional {3} as you cast this spell.)";
const COUNTER = "If this creature was kicked, it enters with a +1/+1 counter on it.";
const skel = (lines) => ({ name: "Urborg Skeleton", type: "Creature — Skeleton", mana: "{1}{B}", power: 0, toughness: 1, oracle: lines.join("\n") });

describe("the tier follows the BASE BODY, not a hard-coded native-body", () => {
  it("kicker + counter + a modeled ACTIVATED ability → native-activated", () => {
    expect(classifyCard(skel([KICKER, "{B}: Regenerate this creature.", COUNTER]))).toBe("native-activated");
  });

  it("kicker + counter + a modeled STATIC → native-static (Gnarlid Colony, oracle VERBATIM)", () => {
    // Real oracle text, copied from the bundled index — an invented static reads differently and the first
    // cut of this test failed against text I had written from memory rather than looked up.
    const tier = classifyCard({ name: "Gnarlid Colony", type: "Creature — Beast", mana: "{1}{G}", power: 2, toughness: 2,
      oracle: "Kicker {2}{G} (You may pay an additional {2}{G} as you cast this spell.)\nIf this creature was kicked, it enters with two +1/+1 counters on it.\nEach creature you control with a +1/+1 counter on it has trample. (It can deal excess combat damage to the player or planeswalker it's attacking.)" });
    expect(tier).toBe("native-static");
  });

  it("the keyword-only base body still reads native-body (the original gate is untouched)", () => {
    expect(classifyCard(skel([KICKER, COUNTER]))).toBe("native-body");
    expect(classifyCard(skel([KICKER, "Flying", COUNTER]))).toBe("native-body");
  });
});

describe("CREED — the generalization credits nothing on its own", () => {
  it("an UNMODELED base body still parks the whole card", () => {
    expect(classifyCard(skel([KICKER, "Each player glorbulates twice.", COUNTER]))).not.toMatch(/^native/);
  });

  it("a card with NO kicker is untouched by this path", () => {
    expect(classifyCard(skel(["Each player glorbulates twice."]))).not.toMatch(/^native/);
  });

  it("a kicker card whose kicked payoff ISN'T the modeled counter shape stays parked", () => {
    // parseKickerCounterCreature is all-or-nothing on the payoff; the permissive predicate bypasses ONLY
    // the base-body check, never the payoff gate.
    expect(classifyCard(skel([KICKER, "{B}: Regenerate this creature.", "If this creature was kicked, each opponent glorbulates."])))
      .not.toMatch(/^native/);
  });
});

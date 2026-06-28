/**
 * burnRiders.test.js — BURN-2 regression LOCK.
 *
 * The re-scan the board asked for: "deals N damage to <target>. <rider>" where the rider is a
 * now-modeled atom (draw / gain-life / scry / surveil). The finding: these ALREADY compose to HIGH
 * through the existing multi-clause parser + the P2.7+ rider atoms — there is NO new atom to add.
 * This file PINS that composition so a future parser change can't silently break it (the burn+rider
 * family is ~130 corpus cards), and pins the rider shapes that MUST stay low → Arbiter.
 */
import { describe, it, expect } from "vitest";
import { parseEffectProgram, programConfidence } from "./parser.js";

const I = (oracle, mana = "{1}{R}") => ({ type: "Instant", mana, oracle, name: "X" });
const ops = (oracle, mana) => parseEffectProgram(I(oracle, mana)).atoms.map((a) => a.op);

describe("BURN-2 — burn + modeled rider composes to HIGH (already works; locked)", () => {
  it("gain-life rider (Lightning Helix family), both '. ' and ' and ' joins", () => {
    expect(ops("X deals 3 damage to any target. You gain 3 life.")).toEqual(["deal-damage", "gain-life"]);
    expect(ops("X deals 3 damage to any target and you gain 3 life.")).toEqual(["deal-damage", "gain-life"]);
    expect(ops("X deals 2 damage to target creature and you gain 2 life.")).toEqual(["deal-damage", "gain-life"]);
    expect(ops("X deals 2 damage to target player. You gain 2 life.")).toEqual(["deal-damage", "gain-life"]);
  });
  it("draw rider (Zap / Ember Shot family)", () => {
    expect(ops("X deals 1 damage to any target. Draw a card.")).toEqual(["deal-damage", "draw"]);
    expect(ops("X deals 2 damage to target creature. Draw a card.")).toEqual(["deal-damage", "draw"]);
  });
  it("scry / surveil rider (Magma Jet / Jaya's Greeting family)", () => {
    expect(ops("X deals 2 damage to any target. Scry 2.")).toEqual(["deal-damage", "scry"]);
    expect(ops("X deals 3 damage to target creature. Scry 1.")).toEqual(["deal-damage", "scry"]);
    expect(ops("X deals 4 damage to target creature. Surveil 1.")).toEqual(["deal-damage", "surveil"]);
  });
  it("the whole family is HIGH", () => {
    for (const o of [
      "X deals 3 damage to any target. You gain 3 life.",
      "X deals 1 damage to any target. Draw a card.",
      "X deals 2 damage to any target. Scry 2.",
    ]) expect(programConfidence(parseEffectProgram(I(o)))).toBe("high");
  });
});

describe("BURN-2 — MUST_STAY_LOW: riders/structures we don't model → Arbiter", () => {
  it("a 'deals N to you' self-damage rider (Char) stays low", () => {
    expect(programConfidence(parseEffectProgram(I("X deals 3 damage to any target. X deals 1 damage to you.")))).toBe("low");
  });
  it("an UNMODELED replacement rider ('would die … shuffle into library instead') stays low", () => {
    // NOTE: the "exile it instead" death-replacement is now modeled (subsystem 3 DAMAGE-DIE-EXILE); this
    // guard tracks a STILL-unmodeled die-replacement (shuffle-into-library) so it stays a meaningful pin.
    expect(programConfidence(parseEffectProgram(I("X deals 3 damage to any target. If a creature dealt damage this way would die this turn, its owner shuffles it into their library instead.")))).toBe("low");
  });
  it("a variable damage amount stays low (except now-modeled DMG-SCALE controller counts)", () => {
    // NOTE: "deals damage equal to the number of <permanents you control / cards in your hand>" is now
    // MODELED by DMG-SCALE (WALT-DMG-SCALE) → HIGH. These OTHER variable forms still stay low (deferred):
    expect(programConfidence(parseEffectProgram(I("X deals damage to any target equal to twice the number of Mountains you control.")))).toBe("low"); // a multiplier
    expect(programConfidence(parseEffectProgram(I("X deals damage to target creature equal to the number of creatures target opponent controls.")))).toBe("low"); // opponent-scoped count
    // NOTE: a NUMERIC divided-damage ("deals 3 damage divided as you choose among any number of targets")
    // is now MODELED by MT-1 (the divide-among picker) → HIGH. Only the X-divide stays low (deferred).
    expect(programConfidence(parseEffectProgram(I("X deals X damage divided as you choose among any number of targets.", "{X}{R}")))).toBe("low");
  });
  it("an unmodeled follow-up rider ('Then that player may discard a card') drops the whole program", () => {
    expect(programConfidence(parseEffectProgram(I("X deals 3 damage to any target. Then that player may discard a card.")))).toBe("low");
  });
});

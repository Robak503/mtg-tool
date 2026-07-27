/**
 * attachActivatedAbility.test.js — attach printed as a plain activated ability (CR 701.3), census slice 12.
 *
 * One Mirrodin cycle prints the Equip effect as an ordinary "{cost}: <effect>" line instead of the keyword:
 * Cranial Plating, Horned Helm, Sparring Collar, Healer's Headdress, Neurok Stealthsuit. The three Equip
 * branches in parseActivatedAbilities are all anchored on a COLON-LESS line, so none of them could see it.
 *
 * Carrying `isEquipAbility` routes it to the SAME ATTACH resolver the keyword uses — no new runtime lane.
 * Two seams were needed, and the parse alone measured ZERO flips (the slice-10 signature again): the
 * coverage residue loop rejects any clause that isn't shaped like an "Equip {cost}" line, so it threw the
 * whole card out even though the all-abilities gate above it had already validated this one as modeled.
 *
 * TIMING — why this is FN-safe. The printed ability has no sorcery-speed restriction (instant-speed
 * re-equipping is why the cycle exists), while the engine offers activated abilities only in the
 * controller's own main step. Own-main is a strict SUBSET of "whenever you have priority", so the engine
 * can only UNDER-offer it. Same argument AA-1 makes for "Activate only during your turn."
 */
import { describe, expect, it } from "vitest";

import { parseActivatedAbilities } from "./effects/abilities.js";
import { classifyCard } from "./coverage.js";

const ATTACH = (c) => `{${c}}{${c}}: Attach this Equipment to target creature you control.`;
const eq = (name, lines) => ({ name, type: "Artifact — Equipment", mana: "{2}", oracle: lines.join("\n") });

describe("parse — the attach ability is an EQUIP ability", () => {
  it("routes to the ATTACH resolver via isEquipAbility, with a modeled mana cost", () => {
    const abs = parseActivatedAbilities(eq("Cranial Plating", [
      "Equipped creature gets +1/+0 for each artifact you control.", ATTACH("B"), "Equip {1}"]));
    expect(abs).toHaveLength(2);
    expect(abs[0]).toMatchObject({ isEquipAbility: true, modeled: true, costStr: "{B}{B}", needsTarget: true });
    expect(abs[0].program).toBeNull();          // ATTACH resolver, not an effect program
    expect(abs[1]).toMatchObject({ isEquipAbility: true, modeled: true }); // the printed Equip line
  });

  it("CREED — a non-mana or extended cost is NOT admitted (whole line or nothing)", () => {
    // Anchored to a mana-only cost; anything else falls through to the generic parse, where "attach this
    // Equipment …" is not a modeled effect program, so the ability stays unmodeled and the card parks.
    const abs = parseActivatedAbilities(eq("Fake", [
      "Equipped creature gets +1/+1.", "{2}, Sacrifice a creature: Attach this Equipment to target creature you control.", "Equip {1}"]));
    expect(abs.some((a) => a.isEquipAbility && a.costStr?.includes("Sacrifice"))).toBe(false);
  });

  it("CREED — a trailing rider is not swallowed", () => {
    const abs = parseActivatedAbilities(eq("Fake2", [
      "Equipped creature gets +1/+1.", "{2}: Attach this Equipment to target creature you control. Draw a card.", "Equip {1}"]));
    expect(abs[0].isEquipAbility).not.toBe(true);
  });
});

describe("classification — the whole cycle flips", () => {
  const CYCLE = [
    ["Horned Helm", "Equipped creature gets +1/+1 and has trample.", "G"],
    ["Sparring Collar", "Equipped creature has first strike.", "R"],
    ["Neurok Stealthsuit", "Equipped creature has shroud.", "U"],
    ["Cranial Plating", "Equipped creature gets +1/+0 for each artifact you control.", "B"],
  ];
  it.each(CYCLE)("%s → native-equipment", (name, bonus, color) => {
    expect(classifyCard(eq(name, [bonus, ATTACH(color), "Equip {1}"]))).toBe("native-equipment");
  });

  it("the plain Equip-only equipment is unchanged (no regression on the existing lane)", () => {
    expect(classifyCard(eq("Bonesplitter", ["Equipped creature gets +2/+0.", "Equip {1}"]))).toBe("native-equipment");
  });

  it("an equipment with an UNMODELED extra ability still parks (residue gate intact)", () => {
    expect(classifyCard(eq("Fake3", [
      "Equipped creature gets +1/+1.", ATTACH("G"), "{T}: Target player shuffles their graveyard into their library.", "Equip {1}",
    ]))).not.toMatch(/^native/);
  });
});

/**
 * abilityClausesReminder.test.js — abilityClauses paren/reminder fix (deck wave).
 *
 * abilityClauses (the shared static clause splitter) was quote-aware but NOT paren-aware: a MULTI-sentence
 * reminder — "(It can't be the target of spells or abilities your opponents control. It can attack and {T}
 * no matter when it came under your control.)" (Swiftfoot Boots) — has internal periods that split the clause
 * mid-paren, orphaning the 2nd reminder sentence as fake residue → the whole card fell to body-only. A
 * single-sentence-reminder twin (Lightning Greaves) flipped fine, which is how the bug hid. The fix drops
 * parenthetical reminder text BEFORE the sentence split (CR 207.2 — parens are always reminder), so the
 * clause survives intact and the existing keyword-grant / pump runtime (layer-6 addKeyword / layer-7 ptModify
 * — already proven by Lightning Greaves) applies. Parser-only change; flip-diff vs f560d72 = 25 IN / 0 OUT.
 */

import { describe, expect, it } from "vitest";
import { parseEquipmentBonus } from "./staticAbilityParser.js";
import { classifyCard } from "./coverage.js";

const eq = (name, oracle) => ({ name, type: "Artifact — Equipment", oracle });
const aura = (name, oracle) => ({ name, type: "Enchantment — Aura", oracle });

describe("abilityClauses — a multi-sentence reminder no longer shreds the clause", () => {
  it("Swiftfoot Boots (2-sentence reminder) → native-equipment with the FULL hexproof+haste grant", () => {
    const sw = eq("Swiftfoot Boots", "Equipped creature has hexproof and haste. (It can't be the target of spells or abilities your opponents control. It can attack and {T} no matter when it came under your control.)\nEquip {1}");
    expect(classifyCard(sw)).toBe("native-equipment");
    const kws = parseEquipmentBonus(sw).filter((b) => b.op?.layerOp === "addKeyword").map((b) => String(b.op.keyword).toLowerCase()).sort();
    expect(kws).toEqual(["haste", "hexproof"]);   // both granted, neither dropped
  });

  it("pump+keyword auras with reminders → native-aura, full +N/+N + keywords (no dropped clause)", () => {
    expect(classifyCard(aura("Serra's Embrace", "Enchant creature\nEnchanted creature gets +2/+2 and has flying and vigilance. (Attacking doesn't cause this creature to tap.)"))).toBe("native-aura");
    expect(classifyCard(aura("Unflinching Courage", "Enchant creature\nEnchanted creature gets +2/+2 and has trample and lifelink. (Damage dealt by a creature with trample is assigned to the player or planeswalker it's attacking. Damage dealt by a creature with lifelink also causes its controller to gain that much life.)"))).toBe("native-aura");
    expect(classifyCard(aura("Robe of Mirrors", "Enchant creature (Target a creature as you cast this. This card enters attached to that creature.)\nEnchanted creature has shroud. (It can't be the target of spells or abilities.)"))).toBe("native-aura");
  });

  it("FN boundary — a REAL (non-parenthetical) sentence still splits → stays Arbiter, never merged", () => {
    // the fix drops only PAREN content; periods/newlines OUTSIDE parens still split, so a real trailing
    // clause remains residue and the aura stays body-only (no over-merge that would fabricate coverage).
    expect(classifyCard(aura("Rider", "Enchant creature\nEnchanted creature gets +2/+2 and has flying.\nWhen this Aura is put into a graveyard, draw a card."))).toBe("body-only");
    // paren-drop AND real-clause-keep together: the reminder is dropped, the real LTB trigger survives as
    // residue → still body-only (proves the drop is scoped to parens, not "everything after the bonus").
    expect(classifyCard(aura("RiderRem", "Enchant creature\nEnchanted creature gets +2/+2 and has flying. (Flying reminder text here.)\nWhen this Aura is put into a graveyard, draw a card."))).toBe("body-only");
  });
});

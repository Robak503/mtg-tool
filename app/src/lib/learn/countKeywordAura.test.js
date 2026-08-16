/**
 * countKeywordAura.test.js — count-static P/T + keyword grant on ONE attached permanent (SHELF-TAIL ND2 —
 * Ethereal Armor and kin; CR 613 layers 7c + 6). "Enchanted/Equipped creature gets +N/+N FOR EACH <X> and
 * has <keyword(s)>."
 *
 * Both halves were already native ALONE — the bare count-static ("+1/+1 for each enchantment you control",
 * All That Glitters) and the fixed P/T + keyword ("+2/+2 and has first strike"). Only the COMPOSE broke:
 * parseAttachedBonus's `for each (.+)` greedily swallowed the "and has <keyword>" grant into the count
 * phrase, so parseSelfCountSource nulled and the whole bonus dropped. The fix peels a trailing " and has
 * <keywords>" (NEVER "artifact and/or enchantment") and falls through to the SHARED have-keyword tail — the
 * base-P/T-set lane, one arm over. Flip +8/0/0 (6 auras + 2 equipment: Ethereal Armor, Armored Ascension,
 * Crystalline Armor, Claws of Valakut, Auramancer's Guise, Crown of Skemfar, Glaive of the Guildpact,
 * Thran Power Suit) — parseAttachedBonus drives BOTH auras and equipment.
 *
 * Mutation-checked (via Edit): disabling the " and has " split → the count phrase keeps the keyword text →
 * parseSelfCountSource nulls → the whole bonus drops → Ethereal + Glaive body-only (classify pins die).
 */
import { describe, it, expect } from "vitest";
import { classifyCard } from "./coverage.js";
import { parseAuraBonus, parseEquipmentBonus } from "./staticAbilityParser.js";

const aura = (o) => ({ name: "T", type_line: "Enchantment — Aura", oracle_text: "Enchant creature\n" + o });

describe("ND2 — the compose emits BOTH the dynamic P/T and the keyword grant", () => {
  it("Ethereal Armor: a ptModifyDynamicCount (Enchantment) op AND an addKeyword(First strike) op", () => {
    const ops = parseAuraBonus(aura("Enchanted creature gets +1/+1 for each enchantment you control and has first strike."));
    expect(ops.some((o) => o.op?.layerOp === "ptModifyDynamicCount" && o.op.countSpec?.cardType === "Enchantment")).toBe(true);
    expect(ops.some((o) => o.op?.layerOp === "addKeyword" && o.op.keyword === "First strike")).toBe(true);
  });
  it("multi-keyword tail composes (Glaive-style '…and has vigilance and menace')", () => {
    const ops = parseEquipmentBonus({ name: "G", type_line: "Artifact — Equipment", oracle_text: "Equipped creature gets +1/+0 for each Gate you control and has vigilance and menace.\nEquip {3}" });
    const kws = ops.filter((o) => o.op?.layerOp === "addKeyword").map((o) => o.op.keyword.toLowerCase());
    expect(kws).toEqual(expect.arrayContaining(["vigilance", "menace"]));
    expect(ops.some((o) => o.op?.layerOp === "ptModifyDynamicCount")).toBe(true);
  });
});

describe("ND2 — the split guard doesn't mangle a count phrase that legitimately contains 'and'", () => {
  it("All That Glitters ('artifact and/or enchantment you control') gets the count op and NO phantom keyword", () => {
    const ops = parseAuraBonus(aura("Enchanted creature gets +1/+1 for each artifact and/or enchantment you control."));
    expect(ops.filter((o) => o.op?.layerOp === "addKeyword")).toHaveLength(0);
    expect(ops.some((o) => o.op?.layerOp === "ptModifyDynamicCount")).toBe(true);
  });
});

describe("ND2 — classify: the flips are native, the pre-existing forms are unchanged", () => {
  it("Ethereal Armor + Glaive of the Guildpact classify native", () => {
    expect(classifyCard({ name: "Ethereal Armor", type: "Enchantment — Aura", oracle: "Enchant creature\nEnchanted creature gets +1/+1 for each enchantment you control and has first strike." })).toBe("native-aura");
    expect(classifyCard({ name: "Glaive of the Guildpact", type: "Artifact — Equipment", oracle: "Equipped creature gets +1/+0 for each Gate you control and has vigilance and menace.\nEquip {3}" })).toBe("native-equipment");
  });
  it("REGRESSION — bare count-static, fixed P/T + keyword, and All That Glitters stay native", () => {
    expect(classifyCard({ name: "A", type: "Enchantment — Aura", oracle: "Enchant creature\nEnchanted creature gets +1/+1 for each enchantment you control." })).toBe("native-aura");
    expect(classifyCard({ name: "B", type: "Enchantment — Aura", oracle: "Enchant creature\nEnchanted creature gets +2/+2 and has first strike." })).toBe("native-aura");
    expect(classifyCard({ name: "All That Glitters", type: "Enchantment — Aura", oracle: "Enchant creature\nEnchanted creature gets +1/+1 for each artifact and/or enchantment you control." })).toBe("native-aura");
  });
});

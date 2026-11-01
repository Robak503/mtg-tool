/**
 * subtypeFamilies.test.js — the subtype lists setCardTypes reads (CR 205.3c, 205.1a) are the bundled Comprehensive Rules' lists, word
 * for word: each set is re-read from knowledge/mtg-judge/data/cr/cr_current.json and held equal to its rule.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ARTIFACT_TYPES, ENCHANTMENT_TYPES, LAND_TYPES, PLANESWALKER_TYPES, SPELL_TYPES, BATTLE_TYPES, subtypeFamilyOf } from "./subtypeFamilies.js";
import { CR_CREATURE_TYPES } from "./effects/creatureTypes.js";

const CR = JSON.parse(readFileSync(new URL("../../../../knowledge/mtg-judge/data/cr/cr_current.json", import.meta.url), "utf8"));

/** The list a 205.3 rule names after "The <kind> types are" / "That battle type is", lowercased, cross-references dropped. */
function listOf(rule) {
  const text = CR[rule].ruleText;
  const m = text.match(/(?:The [a-z]+ types are|That battle type is) (.+?)\.(?: Of that list|$| See)/);
  return new Set(m[1].replace(/\s*\(see rule [^)]*\)/g, "").replace(/\band /g, "").split(/,\s*/).map((w) => w.trim().toLowerCase().replace(/’/g, "'")).filter(Boolean));
}

describe("the subtype families are the CR's lists", () => {
  it.each([
    ["205.3g", ARTIFACT_TYPES], ["205.3h", ENCHANTMENT_TYPES], ["205.3i", LAND_TYPES], ["205.3j", PLANESWALKER_TYPES], ["205.3k", SPELL_TYPES], ["205.3q", BATTLE_TYPES],
  ])("%s", (rule, set) => {
    expect([...set].sort()).toEqual([...listOf(rule)].sort());
  });

  it("no word belongs to two families, and the creature types are the CR 205.3m vocabulary", () => {
    const families = [ARTIFACT_TYPES, ENCHANTMENT_TYPES, LAND_TYPES, PLANESWALKER_TYPES, SPELL_TYPES, BATTLE_TYPES, CR_CREATURE_TYPES];
    const seen = new Map();
    for (const f of families) for (const w of f) { expect([w, seen.has(w)]).toEqual([w, false]); seen.set(w, f); }
    expect(CR["205.3m"].ruleText).toContain("Time Lord");
  });

  it("subtypeFamilyOf names the correlated card types, any case; a word no rule lists has none", () => {
    expect(["Equipment", "aura", "Forest", "Urza’s", "Jace", "Siege", "Arcane", "Elf", "Shapeshifter", "Notatype"].map(subtypeFamilyOf)).toEqual([
      ["Artifact"], ["Enchantment"], ["Land"], ["Land"], ["Planeswalker"], ["Battle"], ["Instant", "Sorcery"], ["Creature", "Kindred", "Tribal"], ["Creature", "Kindred", "Tribal"], [],
    ]);
  });
});

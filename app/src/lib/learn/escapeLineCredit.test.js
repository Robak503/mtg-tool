/**
 * escapeLineCredit.test.js — ESCAPE (CR 702.138a) credited by removing the whole LINE.
 * Nethergoyf · Bloodbraid Challenger · Lunar Hatchling.
 *
 * Escape's cost is COMPOUND — "Escape—{2}{B}, Exile two other cards from your graveyard." — and
 * isKeywordOnly splits clauses on commas, so no clause-level pattern can ever reach it. Crediting the bare
 * "exile two other cards from your graveyard" fragment is out of the question: that is a real effect
 * elsewhere. The LINE is the only safe unit, and it is removed BEFORE stripReminder collapses the newlines,
 * because that is the only point where line structure still exists.
 *
 * Vacuous for the from-hand cast on flashback's basis: escape is a GRAVEYARD re-cast window the runtime
 * never offers, so the printed body resolves identically.
 *
 * ⭐⛔ SUSPEND IS *NOT* CREDITED, AND THE REASON IS THE WHOLE LESSON OF THIS SLICE. It looked like the same
 * compound-cost shape and would have paid 3 more cards. But Lotus Bloom, Sol Talisman and Mox Tantalite
 * print NO MANA COST AT ALL — suspend is the only way to play them. Crediting the line would mark a card
 * native that the engine cannot play by ANY route: a false positive, not a missing option. The vacuity
 * argument only holds for a card that is castable WITHOUT the keyword, and it does not survive on one that
 * is not. Checking the printed mana cost is what separated the two.
 */
import { describe, expect, it } from "vitest";
import { classifyCard, isKeywordOnly } from "./coverage.js";

// Real printed oracles + costs, read out of the snapshot (matched on name AND type line).
const NETHERGOYF = { name: "Nethergoyf", type: "Creature — Lhurgoyf", power: "0", toughness: "1", mana: "{B}",
  oracle: "Nethergoyf's power is equal to the number of card types among cards in your graveyard and its toughness is equal to that number plus 1.\nEscape—{2}{B}, Exile any number of other cards from your graveyard with four or more card types among them. (You may cast this card from your graveyard for its escape cost.)" };
const BLOODBRAID_CHALLENGER = { name: "Bloodbraid Challenger", type: "Creature — Elf Berserker", power: "3", toughness: "4", mana: "{3}{R}{G}",
  oracle: "Cascade\nHaste\nEscape—{3}{R}{G}, Exile three other cards from your graveyard. (You may cast this card from your graveyard for its escape cost.)" };

describe("⭐ the escape LINE is removed, and the body classifies", () => {
  it("the carriers flip", () => {
    expect(classifyCard(NETHERGOYF)).toBe("native-static");
    expect(classifyCard(BLOODBRAID_CHALLENGER)).toBe("native-body");
  });

  it("an escape line on its own is keyword-only", () => {
    expect(isKeywordOnly("Escape—{2}{B}, Exile two other cards from your graveyard.")).toBe(true);
  });

  it("⭐ the DASH is load-bearing — a line starting with the card NAME never matches", () => {
    // "Escape Velocity deals 3 damage…" must not be mistaken for an escape cost line.
    expect(isKeywordOnly("Escape Velocity deals 3 damage to target creature.")).toBe(false);
  });
});

describe("⭐ the AURA path needed its own filter — same keyword, different tokenizer", () => {
  // ⭐ ONE CLAUSE HERE, A WHOLE LINE THERE. abilityClauses (the aura residue path) keeps
  // "Escape—{W}, Exile two other cards…" INTACT — it does not split that comma — so one clause pattern
  // suffices. isKeywordOnly DOES split on commas and needed the whole line removed before its split.
  // The same keyword required two different shapes because the two residue paths tokenize differently,
  // which is why fixing the creature side did not carry the auras and they had to be measured separately.
  const SENTINELS_EYES = { name: "Sentinel's Eyes", type: "Enchantment — Aura", mana: "{W}",
    oracle: "Enchant creature\nEnchanted creature gets +1/+1 and has vigilance.\nEscape—{W}, Exile two other cards from your graveyard. (You may cast this card from your graveyard for its escape cost.)" };
  const MOGISS_FAVOR = { name: "Mogis's Favor", type: "Enchantment — Aura", mana: "{B}",
    oracle: "Enchant creature\nEnchanted creature gets +2/-1.\nEscape—{2}{B}, Exile two other cards from your graveyard. (You may cast this card from your graveyard for its escape cost.)" };

  it("escape auras flip", () => {
    expect(classifyCard(SENTINELS_EYES)).toBe("native-aura");
    expect(classifyCard(MOGISS_FAVOR)).toBe("native-aura");
  });

  it("⛔ an aura with an unmodeled line still parks", () => {
    const residue = { ...SENTINELS_EYES, name: "Fake Eyes",
      oracle: "Enchant creature\nEnchanted creature gets +1/+1 and has vigilance.\nWhenever a player consults an oracle, interpret its riddle however you like.\nEscape—{W}, Exile two other cards from your graveyard." };
    expect(classifyCard(residue)).not.toMatch(/^native/);
  });
});

describe("⛔ SUSPEND stays refused — the card has no other way to be played", () => {
  it("a suspend line is NOT credited", () => {
    expect(isKeywordOnly("Suspend 3—{1}{U}")).toBe(false);
  });

  it("Lotus Bloom now flips (INVERTED 2026-08-02 — suspend for no-cost noncreatures is BUILT); a creature carrier still parks", () => {
    // The refusal this pin carried ("crediting suspend claims a card the engine cannot play") is now
    // enforced POSITIVELY: the suspend special action → owner-upkeep tick → zero-counter free cast
    // exists end to end (suspendNoCost.test.js), and the classifier reads the SAME
    // parseSuspendNoCost gate the runtime offers through. The guard's JOB continues on the shape
    // that is still unplayable: a costless CREATURE (needs the suspend haste grant) stays parked.
    const LOTUS_BLOOM = { name: "Lotus Bloom", type: "Artifact", mana: "",
      oracle: "Suspend 3—{0} (Rather than cast this card from your hand, you may pay {0} and exile it with three time counters on it. At the beginning of your upkeep, remove a time counter. When the last is removed, you may cast it without paying its mana cost.)\n{T}, Sacrifice this artifact: Add three mana of any one color." };
    expect(classifyCard(LOTUS_BLOOM)).toBe("native-mana");
    expect(classifyCard({ name: "Costless Beast", type: "Creature — Beast", mana: "", power: "5", toughness: "5",
      oracle: "Suspend 5—{G}" })).not.toMatch(/^native/);
  });
});

describe("⛔ still all-or-nothing", () => {
  it("an unmodeled body parks the card even with the escape line gone", () => {
    const residue = { ...BLOODBRAID_CHALLENGER, name: "Fake Challenger",
      oracle: "Consult an oracle and interpret its riddle however you like.\nEscape—{3}{R}{G}, Exile three other cards from your graveyard." };
    expect(classifyCard(residue)).not.toMatch(/^native/);
  });
});

/**
 * madnessPermanent.test.js — BLITZ MD-1: a bare "Madness {cost}" line on a PERMANENT is credited as
 * covered (CR 702.35 — a discard-window cast option, vacuous for the normal hard-cast; the engine's
 * versioned trade: the option is never offered, exactly like the spell path's strip that ships Fiery
 * Temper native, and the ninjutsu/morph/sneak credit rationale). The card's OTHER text stays gated
 * all-or-nothing. Real oracle fixtures (bundled Scryfall, 2026-07-16).
 */

import { describe, expect, it } from "vitest";
import { classifyCard, isKeywordOnly } from "./coverage.js";

describe("MD-1 — madness on permanents", () => {
  it("the bare cost line is credited; the family flips per whole-card law", () => {
    expect(isKeywordOnly("Madness {2}{G} (If you discard this card, discard it into exile. When you do, cast it for its madness cost or put it into your graveyard.)\nTrample", "Arrogant Wurm")).toBe(true);
    expect(classifyCard({ id: "aw", name: "Arrogant Wurm", type: "Creature — Wurm", power: "4", toughness: "4", mana: "{3}{G}{G}",
      oracle: "Trample\nMadness {2}{G} (If you discard this card, discard it into exile. When you do, cast it for its madness cost or put it into your graveyard.)" })).toBe("native-body");
    expect(classifyCard({ id: "br", name: "Basking Rootwalla", type: "Creature — Lizard", power: "1", toughness: "1", mana: "{G}",
      oracle: "{1}{G}: This creature gets +2/+2 until end of turn. Activate only once each turn.\nMadness {0} (If you discard this card, discard it into exile. When you do, cast it for its madness cost or put it into your graveyard.)" })).toBe("native-activated");
    // Gorgon Recluse — DG-1's park lifts: the basilisk line + madness are now both covered.
    expect(classifyCard({ id: "gr", name: "Gorgon Recluse", type: "Creature — Gorgon", power: "2", toughness: "4", mana: "{3}{B}",
      oracle: "Whenever this creature blocks or becomes blocked by a nonblack creature, destroy that creature at end of combat.\nMadness {B}{B} (If you discard this card, discard it into exile. When you do, cast it for its madness cost or put it into your graveyard.)" })).toBe("native-trigger");
  });
  it("FN guards: a madness-referencing static and an unmodeled sibling still park", () => {
    // A madness-REFERENCING line is not a bare cost — never credited.
    expect(isKeywordOnly("Each card in your hand has madness {1}{R}.", "Hypo Granter")).toBe(false);
    // An unmodeled sibling line keeps the card parked (whole-card law) even with madness credited.
    expect(classifyCard({ id: "gm", name: "Geralf's Masterpiece", type: "Creature — Zombie Horror", power: "7", toughness: "7", mana: "{2}{U}",
      oracle: "Flying\nThis creature gets -1/-1 for each card in your hand.\n{3}{U}, Discard three cards: Return this card from your graveyard to the battlefield tapped.\nMadness {X}" })).toBe("body-only");
  });
});

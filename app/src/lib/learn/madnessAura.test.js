/**
 * madnessAura.test.js — BLITZ MA-1: MADNESS on an AURA is not residue (Senseless Rage / Strength of
 * Isolation / Strength of Lunacy — the three madness-aura carriers).
 *
 * MD-1 (commit 6b23d689) credited the bare "Madness {cost}" line on permanents: a DISCARD-window cast
 * option (CR 702.35), vacuous for the normal hard-cast — the engine never offers the discard-window
 * cast, so a discarded madness card just goes to the graveyard (an FN-safe alternative-entry
 * simplification, the same versioned trade the spell path ships via stripCastKeywordLines). The AURA
 * classify path walks auraResidueClauses, which needed the same admission (the FA-1 flash precedent):
 * the cost-pips-only anchor admits exactly "Madness {…}"; a madness-REFERENCING static or trigger
 * never matches and keeps its card body-only (CREED).
 *
 * Real oracle fixtures (exact bundled Scryfall text, verified 2026-07-16).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests } from "./gameState.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

describe("MA-1 — madness auras", () => {
  it("the three carriers flip native-aura (madness line admitted, bonus fully modeled)", () => {
    expect(classifyCard({ id: "sr", name: "Senseless Rage", type: "Enchantment — Aura", mana: "{1}{R}",
      oracle: "Enchant creature\nEnchanted creature gets +2/+2.\nMadness {1}{R} (If you discard this card, discard it into exile. When you do, cast it for its madness cost or put it into your graveyard.)" })).toBe("native-aura");
    expect(classifyCard({ id: "si", name: "Strength of Isolation", type: "Enchantment — Aura", mana: "{1}{W}",
      oracle: "Enchant creature\nEnchanted creature gets +1/+2 and has protection from black.\nMadness {W} (If you discard this card, discard it into exile. When you do, cast it for its madness cost or put it into your graveyard.)" })).toBe("native-aura");
    expect(classifyCard({ id: "sl", name: "Strength of Lunacy", type: "Enchantment — Aura", mana: "{1}{B}",
      oracle: "Enchant creature\nEnchanted creature gets +2/+1 and has protection from white.\nMadness {B} (If you discard this card, discard it into exile. When you do, cast it for its madness cost or put it into your graveyard.)" })).toBe("native-aura");
  });
  it("CREED FN guards — a madness-REFERENCING line is NOT the cost keyword and still parks", () => {
    // A madness-cast trigger rider (not a bare cost line) keeps the whole Aura body-only.
    expect(classifyCard({ id: "f1", name: "Fake Madness Trigger", type: "Enchantment — Aura",
      oracle: "Enchant creature\nEnchanted creature gets +1/+1.\nWhenever you cast a spell for its madness cost, draw a card." })).toBe("body-only");
    // A madness-cost-reduction static likewise never matches the cost-pips-only anchor.
    expect(classifyCard({ id: "f2", name: "Fake Madness Static", type: "Enchantment — Aura",
      oracle: "Enchant creature\nEnchanted creature gets +1/+1.\nMadness costs you pay cost {1} less." })).toBe("body-only");
  });
});

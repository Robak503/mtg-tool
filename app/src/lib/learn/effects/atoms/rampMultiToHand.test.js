/**
 * rampMultiToHand.test.js — regression pin for the mfh RAMP-MULTI-TO-HAND matcher (2026-07-24).
 *
 * "Search your library for up to N <type> cards[, reveal them,] put them into your hand[, then
 * shuffle]" (Land Tax, Yavimaya Elder, Ignite the Beacon, and 13 more real corpus cards) previously
 * had NO matcher at all — only the battlefield-destination sibling (`mf`) existed. The runtime's
 * resolveTutorChoice chain-until-`remaining` loop was already destination-agnostic (verified before
 * writing the fix), so this was purely a missing parser pattern, not new runtime architecture.
 *
 * Whole-corpus program-fingerprint verified: 34,245 cards, 11 changed, all expected candidates,
 * zero collateral changes. Full-card classifyCard: 9 of 16 real carriers flip to a native tier
 * (the other 7 have separate, unrelated unmodeled residue — correctly still non-native per CREED
 * whole-card-or-nothing, verified individually before this file was written).
 *
 * Cards here are real, oracle text pulled live from the bundled index before being hardcoded,
 * per CLAUDE.md §1.2 — never from memory. Fixtures are hardcoded (index-free) per this codebase's
 * convention (CI has no Scryfall bulk data).
 */
import { describe, expect, it } from "vitest";

import { classifyCard } from "../../coverage.js";

const C = (name, type, oracle) => ({ name, type, oracle, mana: "" });

describe("RAMP-MULTI-TO-HAND — real carriers flip to a native tier", () => {
  const CASES = [
    ["Land Tax", "Enchantment",
      "At the beginning of your upkeep, if an opponent controls more lands than you, you may search your library for up to three basic land cards, reveal them, put them into your hand, then shuffle.",
      "trigger-wrapped (upkeep + interveningIf + optional) — detectTriggers isolates the pure tutor effectClause before this ever reaches the matcher"],
    ["Yavimaya Elder", "Creature — Human Druid",
      "When this creature dies, you may search your library for up to two basic land cards, reveal them, put them into your hand, then shuffle.\n{2}, Sacrifice this creature: Draw a card.",
      "dies-trigger tutor + a separately-modeled sac-activated draw (native-mixed)"],
    ["Ignite the Beacon", "Instant",
      "Search your library for up to two planeswalker cards, reveal them, put them into your hand, then shuffle.",
      "bare spell, non-land filter type (planeswalker) — the hand destination has no guaranteedLand gate unlike the battlefield form"],
  ];

  for (const [name, type, oracle, why] of CASES) {
    it(`${name} — ${why}`, () => {
      const tier = classifyCard(C(name, type, oracle));
      expect(["native-trigger", "native-mixed", "native-spell", "native-activated"]).toContain(tier);
    });
  }
});

describe("RAMP-MULTI-TO-HAND — a modal wrapper around the same clause shape stays parked (real, distinct reason)", () => {
  it("Kura, the Boundless Sky stays body-only — the tutor clause is one modal MODE, not modeled through the modal composition", () => {
    // Same "search...up to N land cards...into your hand, then shuffle" shape as the flips above,
    // but printed as a bulleted "choose one" mode rather than a bare/trigger-wrapped clause. The
    // modal wrapper is the residue here, not the tutor shape itself (mirrors the Night Out in Vegas
    // finding from the same night's Gamble fix: identical words, different composition, different
    // outcome) — a real, distinct reason to stay parked, not an over-claim risk from this matcher.
    const kura = C("Kura, the Boundless Sky", "Legendary Creature — Dragon Spirit",
      "Flying, deathtouch\nWhen Kura dies, choose one —\n• Search your library for up to three land cards, reveal them, put them into your hand, then shuffle.\n• Create an X/X green Spirit creature token, where X is the number of lands you control.");
    expect(classifyCard(kura)).toBe("body-only");
  });
});

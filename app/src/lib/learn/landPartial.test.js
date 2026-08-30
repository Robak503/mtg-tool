/**
 * landPartial.test.js — the LAND FULL-COVERAGE GATE (Codex fix #3, 2026-08-30).
 *
 * classifyCard used to return "land" unconditionally for every card whose type line contains Land —
 * Mystifying Maze counted exactly as native as a basic Forest while its untargeting exile has never
 * been modeled. That inflated the corpus %, every deck %, and the play-weighted number the project
 * steers by. Now landFullyCovered vouches every line through the RUNTIME's own recognizers
 * (allTriggerSentencesModeled / entersTapped / manaProduction per-line / parseActivatedAbilities'
 * modeled flag / isKeywordOnly), and anything unrecognized demotes to "land-partial" — playable
 * (the land drop + modeled mana still work) but NOT native.
 *
 * CREED FP = a land with unmodeled text still counting native; CREED FN-safe = a demotion is always
 * safe. The gate never strips unsupported abilities to inflate the count (the review's explicit ban).
 *
 * Real oracle fixtures (bundled Scryfall snapshot, pulled 2026-08-30 — never from memory).
 */

import { describe, expect, it } from "vitest";
import { classifyCard, isNativeTier, ALL_TIERS, NATIVE_TIERS } from "./coverage.js";

const L = (name, type, oracle) => ({ name, type, oracle });

describe("lands that STAY native — every line vouched by its runtime recognizer", () => {
  it("a basic (intrinsic mana), a vanilla-text land, and Command Tower", () => {
    expect(classifyCard(L("Forest", "Basic Land — Forest", "({T}: Add {G}.)"))).toBe("land");
    expect(classifyCard(L("Wastes", "Basic Land", "{T}: Add {C}."))).toBe("land");
    expect(classifyCard(L("Command Tower", "Land", "{T}: Add one mana of any color in your commander's color identity."))).toBe("land");
  });

  it("Karoo (bare enters-tapped + modeled ETB bounce + mana) — Selesnya Sanctuary", () => {
    expect(classifyCard(L("Selesnya Sanctuary", "Land",
      "This land enters tapped.\nWhen this land enters, return a land you control to its owner's hand.\n{T}: Add {G}{W}."))).toBe("land");
  });

  it("Triome (enters-tapped + Cycling keyword line) — Ketria Triome", () => {
    expect(classifyCard(L("Ketria Triome", "Land — Forest Island Mountain",
      "({T}: Add {G}, {U}, or {R}.)\nThis land enters tapped.\nCycling {3} ({3}, Discard this card: Draw a card.)"))).toBe("land");
  });

  it("modeled sac-fetch — Fabled Passage; modeled scry-temple — Temple of Plenty", () => {
    expect(classifyCard(L("Fabled Passage", "Land",
      "{T}, Sacrifice this land: Search your library for a basic land card, put it onto the battlefield tapped, then shuffle. Then if you control four or more lands, untap that land."))).toBe("land");
    expect(classifyCard(L("Temple of Plenty", "Land",
      "This land enters tapped.\nWhen this land enters, scry 1. (Look at the top card of your library. You may put that card on the bottom.)\n{T}: Add {G} or {W}."))).toBe("land");
  });

  it("modeled player-static — Reliquary Tower", () => {
    expect(classifyCard(L("Reliquary Tower", "Land", "You have no maximum hand size.\n{T}: Add {C}."))).toBe("land");
  });
});

describe("lands that DEMOTE to land-partial — unmodeled text can no longer free-ride", () => {
  it("⭐ Mystifying Maze (the review's named case) — the untargeting exile ability is unmodeled", () => {
    const t = classifyCard(L("Mystifying Maze", "Land",
      "{T}: Add {C}.\n{4}, {T}: Exile target attacking creature an opponent controls. At the beginning of the next end step, return it to the battlefield tapped under its owner's control."));
    expect(t).toBe("land-partial");
    expect(isNativeTier(t)).toBe(false);
  });

  it("man-land — Mutavault's animation is unmodeled", () => {
    expect(classifyCard(L("Mutavault", "Land",
      "{T}: Add {C}.\n{1}: This land becomes a 2/2 creature with all creature types until end of turn. It's still a land."))).toBe("land-partial");
  });

  it("⛔ conditional tapland — the runtime never evaluates the reveal condition, so the metric must not call it modeled (Furycalm Snarl)", () => {
    expect(classifyCard(L("Furycalm Snarl", "Land",
      "As this land enters, you may reveal a Mountain or Plains card from your hand. If you don't, this land enters tapped.\n{T}: Add {R} or {W}."))).toBe("land-partial");
  });
});

describe("tier bookkeeping stays internally consistent", () => {
  it("land is native, land-partial is not, and both are reportable", () => {
    expect(NATIVE_TIERS.has("land")).toBe(true);
    expect(NATIVE_TIERS.has("land-partial")).toBe(false);
    expect(ALL_TIERS).toContain("land");
    expect(ALL_TIERS).toContain("land-partial");
  });
});

/**
 * TOKEN-BARE-MULTICOLOR — "create a 1/1 green and white Citizen creature token" (Elder Auntie,
 * Courier's Briefcase, Creakwood Liege, Rakish Revelers, Darling of the Masses, Bitterbloom Bearer,
 * Mascot Exhibition, Spirit Summoning, …). The multi-color descriptor ("green and white") contains
 * an internal " and " that the sentence splitter severed into two broken fragments → LOW. A new
 * guard before the top-level " and " split keeps the whole bare "create … creature token" sentence
 * intact, letting the existing create-token regex match the full color+type descriptor.
 *
 * CREED: the guard is anchored to $ — only bare "…creature token(s)" sentences are protected;
 * "create a token and draw a card" still splits at " and " since it ends in "card", not "token".
 * Single-color forms (already parsed HIGH) are unchanged. Multi-token "with" / "for each" forms
 * keep their existing guard. No false positives: if the regex fails the token shape it's LOW → Arbiter.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { parseEffectClause } from "./effects/parser.js";
import { classifyCard } from "./coverage.js";
import { _resetIdsForTests } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

// ─── Parser: multi-color forms now parse HIGH ────────────────────────────────

describe("TOKEN-BARE-MULTICOLOR — parser", () => {
  it("'1/1 green and white Citizen creature token' → high", () => {
    const r = parseEffectClause("create a 1/1 green and white citizen creature token", "Instant");
    expect(r).toMatchObject({ confidence: "high", atoms: [{ op: "create-token", power: 1, toughness: 1, descriptor: "green and white citizen" }] });
  });

  it("'1/1 black and red Goblin creature token' → high", () => {
    const r = parseEffectClause("create a 1/1 black and red goblin creature token", "Instant");
    expect(r).toMatchObject({ confidence: "high", atoms: [{ op: "create-token", power: 1, toughness: 1, descriptor: "black and red goblin" }] });
  });

  it("'1/1 black and green Worm creature token' → high", () => {
    const r = parseEffectClause("create a 1/1 black and green worm creature token", "Instant");
    expect(r).toMatchObject({ confidence: "high", atoms: [{ op: "create-token", power: 1, toughness: 1, descriptor: "black and green worm" }] });
  });

  it("'1/1 green and white Human Citizen creature token' (multi-type) → high", () => {
    const r = parseEffectClause("create a 1/1 green and white human citizen creature token", "Instant");
    expect(r).toMatchObject({ confidence: "high", atoms: [{ op: "create-token", descriptor: "green and white human citizen" }] });
  });

  it("single-color form (no change) → high", () => {
    const r = parseEffectClause("create a 1/1 green snake creature token", "Instant");
    expect(r).toMatchObject({ confidence: "high", atoms: [{ op: "create-token", descriptor: "green snake" }] });
  });

  it("'create a Goblin token and draw a card' still splits correctly", () => {
    // Ends in "card", not "token" → NOT protected → splits at " and " → two clauses both HIGH
    const r = parseEffectClause("create a 1/1 Goblin creature token and draw a card", "Instant");
    expect(r).toMatchObject({ confidence: "high" });
    expect(r.atoms).toHaveLength(2);
    expect(r.atoms[0].op).toBe("create-token");
    expect(r.atoms[1].op).toBe("draw");
  });
});

// ─── Coverage flips ───────────────────────────────────────────────────────────

describe("TOKEN-BARE-MULTICOLOR — coverage flips", () => {
  it("Elder-Auntie-style ETB (black and red Goblin) flips native-trigger", () => {
    expect(classifyCard({
      type: "Creature — Goblin",
      name: "Test Auntie",
      mana: "{1}{B}{R}",
      oracle: "When Test Auntie enters, create a 1/1 black and red Goblin creature token.",
    })).toBe("native-trigger");
  });

  it("upkeep trigger (black and green Worm) alone flips native-trigger", () => {
    // Creakwood Liege also has unmodeled unconditional statics ("other black/green creatures get +1/+1")
    // so the real card stays body-only; the pure upkeep-token-only form flips.
    expect(classifyCard({
      type: "Creature — Horror",
      name: "Test Wormmaker",
      mana: "{B}{G}",
      oracle: "At the beginning of your upkeep, you may create a 1/1 black and green Worm creature token.",
    })).toBe("native-trigger");
  });

  it("Citizen-token spell (green and white) flips native-spell", () => {
    expect(classifyCard({
      type: "Sorcery",
      name: "Test Welcome",
      mana: "{1}{G}{W}",
      oracle: "Create a 1/1 green and white Citizen creature token.",
    })).toBe("native-spell");
  });

  it("Faerie-token ETB (blue and black) flips native-trigger", () => {
    expect(classifyCard({
      type: "Creature — Faerie Warlock",
      name: "Test Bearer",
      mana: "{1}{U}{B}",
      oracle: "When Test Bearer enters, create a 1/1 blue and black Faerie creature token.",
    })).toBe("native-trigger");
  });

  it("single-color Goblin token ETB (unchanged — was already HIGH)", () => {
    expect(classifyCard({
      type: "Creature — Goblin",
      name: "Test Warchief",
      mana: "{2}{R}",
      oracle: "When Test Warchief enters, create a 1/1 red Goblin creature token.",
    })).toBe("native-trigger");
  });
});

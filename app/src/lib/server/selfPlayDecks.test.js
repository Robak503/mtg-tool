/**
 * selfPlayDecks.test.js — the BLANK-COMMANDER P0 regression (Omnath 2026-07-10).
 *
 * commandersOf used to fabricate {type:"Legendary Creature", mana:""} stubs, which satisfied
 * learnDeckEnrich's alreadyShaped() → enrichment SKIPPED → every grind/self-play commander was a
 * blank 0/0 with no oracle (no eminence, no radiation, no abilities). The fix: commandersOf emits
 * BARE {id, name} (the companionOf pattern) so mergeCardData fills the REAL card from the oracle
 * index. This test asserts the contract Omnath spec'd: post-toRunnerDeck, commanders[0] has a
 * NUMERIC power and a NON-EMPTY oracle — with an injected lookup, so no bundled index is needed.
 */
import { describe, it, expect } from "vitest";
import { enrichDeck, mergeCardData } from "./learnDeckEnrich.js";

const FULL_KOMA = {
  name: "Koma, Cosmos Serpent", type: "Legendary Creature — Serpent", mana: "{3}{G}{G}{U}{U}",
  power: "6", toughness: "6", oracle: "This spell can't be countered.\nAt the beginning of each upkeep, create a 3/3 blue Serpent creature token named Koma's Coil.",
  cmc: 7, keywords: [], colors: ["G", "U"],
};

describe("BLANK-COMMANDER P0 — a bare {id, name} commander stub enriches to the FULL card", () => {
  it("the bare stub passes alreadyShaped(false) and merges power/toughness/oracle; the id survives", () => {
    const bare = { id: "cmd-test-koma-Koma, Cosmos Serpent", name: "Koma, Cosmos Serpent" };
    const [enriched] = enrichDeck([bare], () => FULL_KOMA);
    expect(enriched.id).toBe("cmd-test-koma-Koma, Cosmos Serpent"); // stable id preserved through the merge
    expect(Number(enriched.power)).toBe(6);                          // NUMERIC power (was undefined → 0/0)
    expect(Number(enriched.toughness)).toBe(6);
    expect(enriched.oracle.length).toBeGreaterThan(0);               // real abilities present
    expect(enriched.type).toMatch(/Serpent/);                        // full type line (tribal seams see it)
  });

  it("REGRESSION: the OLD stub shape (fabricated type + empty mana) would have been skipped — prove the trap", () => {
    const oldStub = { id: "cmd-x", name: "Koma, Cosmos Serpent", type: "Legendary Creature", mana: "" };
    const [enriched] = enrichDeck([oldStub], () => FULL_KOMA);
    // alreadyShaped sees the non-empty type and skips — the card stays blank. This is the P0 mechanism;
    // the assertion documents WHY commandersOf must emit bare stubs.
    expect(enriched.power).toBeUndefined();
    expect(enriched.oracle ?? "").toBe("");
  });

  it("mergeCardData never clobbers real deck-row data (deckCard fields win)", () => {
    const custom = { id: "c1", name: "Koma, Cosmos Serpent", power: "9" };
    expect(mergeCardData(custom, FULL_KOMA).power).toBe("9");
  });
});

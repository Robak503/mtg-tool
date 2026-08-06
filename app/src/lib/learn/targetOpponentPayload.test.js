/**
 * targetOpponentPayload.test.js — TO-1: "target OPPONENT gains N life" / "target OPPONENT draws N cards".
 * Fiery Justice, Armistice (gain) · Bargain (draw).
 *
 * ⭐⭐ A SPLIT-BY-TIER FIND, AND THE SIBLINGS ARE THE EVIDENCE. The same construct was already handled in
 * two neighbouring parsers and missing in two others:
 *   · life.js   `target (player|opponent) loses N life`  — HAD the opponent arm
 *   · hand.js   target-opponent discard                  — HAD it (its own dedicated arm)
 *   · life.js   `target player gains N life`             — did NOT
 *   · misc.js   `target player draws N cards`            — did NOT
 * Nothing about the EFFECT was unmodelled; the recipient wording was. One regex each.
 *
 * ⛔⛔ "opponent" IS NARROWER THAN "player", AND THAT IS THE WHOLE CREED ARGUMENT. targetType "opponent"
 * enumerates only non-controller seats. Reusing "player" would have let Bargain be pointed at its own
 * controller and Armistice hand ITS controller the life — a legal-target set LARGER than printed, which is
 * the forbidden direction. A test that only checked "somebody drew a card" would pass while doing exactly
 * that, so the row below asserts the POOL by seat in both directions.
 *
 * ⓘ Two carriers deliberately still park, and the reasons are unrelated to this slice: Sphinx of
 * Enlightenment's "target opponent draws a card AND you draw three cards" is a compound clause the splitter
 * doesn't break, and Soldevi Steam Beast waits on its becomes-tapped trigger. Safe false-negatives, listed
 * so the next reader doesn't re-probe them.
 *
 * Mutation-checked (2026-08-05, each grep-verified as applied AND verified on the case under test):
 *   · the gain arm pinned back to targetType "player" -> the pool INCLUDES the controller (the over-offer).
 *   · the draw arm's opponent alternative removed -> Bargain parks again.
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-08-05).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { enumerateTargets } from "./spellEffects.js";
import { parseEffectClause } from "./effects/parser.js";
import { _resetIdsForTests, createGameState } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const FIERY_JUSTICE = { id: "c-fj", name: "Fiery Justice", type: "Sorcery", mana: "{R}{G}{W}",
  oracle: ["Fiery Justice deals 5 damage divided as you choose among any number of targets.",
    "Target opponent gains 5 life."].join("\n") };
const ARMISTICE = { id: "c-arm", name: "Armistice", type: "Enchantment", mana: "{2}{W}",
  oracle: "{3}{W}{W}: You draw a card and target opponent gains 3 life." };
const BARGAIN = { id: "c-bar", name: "Bargain", type: "Sorcery", mana: "{2}{B}",
  oracle: ["Target opponent draws a card.", "You gain 7 life."].join("\n") };

describe("the carriers", () => {
  it("⭐ all three flip", () => {
    expect(classifyCard(FIERY_JUSTICE)).toBe("native-spell");
    expect(classifyCard(BARGAIN)).toBe("native-spell");
    expect(classifyCard(ARMISTICE)).toBe("native-activated");
  });

  it("⭐ each parses to targetType 'opponent' — NOT 'player'", () => {
    // The emitted targetType IS the fix. "player" here would be the over-offer.
    const gain = parseEffectClause("Target opponent gains 3 life.", "Instant", { sourceScoped: true })?.atoms;
    const draw = parseEffectClause("Target opponent draws a card.", "Instant", { sourceScoped: true })?.atoms;
    console.log("  WITNESS targetOpponentAtoms", JSON.stringify({ gain, draw })); // vitest 4 needs --disable-console-intercept
    expect(gain).toEqual([{ op: "gain-life", amount: 3, who: "target", targetType: "opponent" }]);
    expect(draw).toEqual([{ op: "draw", amount: 1, who: "target", targetType: "opponent" }]);
    // …and the PLAYER wording still resolves to "player" — this slice is additive, not a replacement.
    expect(parseEffectClause("Target player draws a card.", "Instant", { sourceScoped: true })?.atoms)
      .toEqual([{ op: "draw", amount: 1, who: "target", targetType: "player" }]);
  });
});

describe("⭐⭐ LAW 6 — the enumerated pool, by seat", () => {
  it("⭐⭐ an OPPONENT payload never offers the CONTROLLER", () => {
    const s = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
    const row = {
      opponent: enumerateTargets(s, "user", { targetType: "opponent" }, []).map((t) => t.id).sort(),
      player: enumerateTargets(s, "user", { targetType: "player" }, []).map((t) => t.id).sort(),
    };
    console.log("  WITNESS targetOpponentPool", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    // ⛔ THE ASSERTION THAT MATTERS: Bargain must not be castable at its own controller, and Armistice must
    // not hand its controller the life. Checking "somebody was offered" would pass while doing both.
    expect(row.opponent).not.toContain("user");
    expect(row.player).toContain("user");            // the control — the two targetTypes genuinely differ
    expect(row.opponent).toEqual(["ai1", "ai2", "ai3"]);
  });
});

/**
 * noMaxHandSizeCredit.test.js — "You have no maximum hand size." (CR 402.2 / 514.1), census slice 32.
 *
 * The RUNTIME already modeled this: gameEngine.cleanupDiscardExcess returns 0 for a player controlling any
 * permanent printing the line, so the cleanup discard genuinely never happens (Reliquary Tower / Spellbook /
 * Kruphix). The METRIC credited only the ONE-SHOT dice-roll variant ("…for the rest of the game", the
 * Ancient Dragon rider) and not the bare permanent static — the same one-path-only split this session hit
 * repeatedly, with the runtime already ahead of the metric.
 *
 * THE CREED LINE, and it is a real one: a card that MODIFIES the maximum ("Your maximum hand size is four"
 * — Cursed Rack) must NOT be credited. cleanupDiscardExcess deliberately SUSPENDS enforcement for everyone
 * when it sees such text rather than guess at attribution, so crediting those would claim a number the
 * engine never applies.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard, stripModeledNoMaxHandSize } from "./coverage.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { cleanupDiscardExcess } from "./gameEngine.js";

beforeEach(() => _resetIdsForTests());

const LINE = "You have no maximum hand size.";

describe("the metric now credits the bare static", () => {
  it("an artifact whose only text is the line reads native-body (Spellbook)", () => {
    expect(classifyCard({ name: "Spellbook", type: "Artifact", mana: "{0}", oracle: LINE })).toBe("native-body");
  });
  it("a creature carrying it likewise (Graceful Adept)", () => {
    expect(classifyCard({ name: "Graceful Adept", type: "Creature — Human Wizard", mana: "{2}{U}", power: 1, toughness: 3, oracle: LINE })).toBe("native-body");
  });
  it("and it composes with a modeled trigger (Venser's Journal)", () => {
    expect(classifyCard({ name: "Venser's Journal", type: "Artifact", mana: "{5}",
      oracle: `${LINE}\nAt the beginning of your upkeep, you gain 1 life for each card in your hand.` })).toMatch(/^native/);
  });
  it("the helper is a no-op on text that doesn't carry it", () => {
    expect(stripModeledNoMaxHandSize("Flying\nTrample")).toBe("Flying\nTrample");
  });
});

describe("CREED — a card that MODIFIES the maximum is not credited", () => {
  it("Cursed Rack's 'maximum hand size is four' stays parked", () => {
    expect(classifyCard({ name: "Cursed Rack", type: "Artifact", mana: "{4}",
      oracle: "As this artifact enters, choose a player.\nThat player has a maximum hand size of four." })).not.toMatch(/^native/);
  });
  it("the strip does not touch that wording", () => {
    const o = "That player has a maximum hand size of four.";
    expect(stripModeledNoMaxHandSize(o)).toBe(o);
  });
});

describe("RUNTIME — the discard really is suspended (the basis for the credit)", () => {
  function boardWith(permOracle, handSize) {
    const s = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
    const bf = permOracle ? [createPermanent({ id: "sb", card: { name: "Spellbook", type: "Artifact", oracle: permOracle }, controller: "user" })] : [];
    const hand = Array.from({ length: handSize }, (_, i) => ({ id: `h${i}`, name: `C${i}`, type: "Instant" }));
    return { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: bf, hand } } };
  }

  it("a 10-card hand with NO such permanent must discard 3 (the baseline)", () => {
    expect(cleanupDiscardExcess(boardWith(null, 10), "user")).toBe(3);
  });

  it("…and discards NOTHING once the permanent is out", () => {
    expect(cleanupDiscardExcess(boardWith(LINE, 10), "user")).toBe(0);
  });

  it("a hand at or under seven discards nothing either way", () => {
    expect(cleanupDiscardExcess(boardWith(null, 7), "user")).toBe(0);
  });
});

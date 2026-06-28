/**
 * wheelDiscardHand.test.js — DISCARD-HAND + WHEEL: "discards their hand" (the WHOLE hand, atom.all) and the
 * wheel "Each player discards their hand, then draws N cards" (Wheel of Fortune, Reforge the Soul, Wheel of
 * Fate, Dangerous Wager, One with Nothing, Wit's End).
 *
 * The discard-all atom routes through the EXISTING discard chain with remaining = Infinity (advanceDiscardChain
 * pitches the whole hand inline, no pause). The wheel pairs it with the EXISTING draw who:"eachPlayer" atom; a
 * splitClauses normalize injects the "each player" subject into the orphaned "…, then draws N cards" half.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createGameState, _resetIdsForTests } from "./gameState.js";
import { resolveAtom } from "./effects/effectAtoms.js";
import { parseEffectProgram } from "./effects/parser.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const S = (name, oracle, type = "Sorcery", mana = "{2}{R}") => ({ name, oracle, type, keywords: [], mana });

describe("discard-hand / wheel — parser", () => {
  it("'each player discards their hand' → discard all who:eachPlayer", () => {
    expect(parseEffectProgram(S("X", "Each player discards their hand.")).atoms).toEqual([{ op: "discard", who: "eachPlayer", targetType: null, all: true }]);
  });
  it("'discard your hand' → controller; 'target player discards their hand' → target", () => {
    expect(parseEffectProgram(S("One with Nothing", "Discard your hand.", "Instant", "{B}")).atoms).toEqual([{ op: "discard", who: "controller", targetType: null, all: true }]);
    expect(parseEffectProgram(S("Wit's End", "Target player discards their hand.")).atoms).toEqual([{ op: "discard", who: "target", targetType: "player", all: true }]);
  });
  it("the WHEEL parses to [discard-all eachPlayer, draw-7 eachPlayer] (subject injected into the draw half)", () => {
    expect(parseEffectProgram(S("Wheel of Fortune", "Each player discards their hand, then draws seven cards.")).atoms)
      .toEqual([{ op: "discard", who: "eachPlayer", targetType: null, all: true }, { op: "draw", amount: 7, who: "eachPlayer", targetType: null }]);
  });
  it("'discard your hand, then draw N cards' (Dangerous Wager) → [discard-all controller, draw N]", () => {
    expect(parseEffectProgram(S("Dangerous Wager", "Discard your hand, then draw two cards.", "Instant", "{1}{R}")).atoms)
      .toEqual([{ op: "discard", who: "controller", targetType: null, all: true }, { op: "draw", amount: 2, targetType: null }]);
  });
});

describe("discard-hand / wheel — coverage flips", () => {
  it("spells flip native-spell (Wheel of Fortune, Reforge the Soul, One with Nothing, Wit's End)", () => {
    expect(classifyCard(S("Wheel of Fortune", "Each player discards their hand, then draws seven cards."))).toBe("native-spell");
    expect(classifyCard(S("Reforge the Soul", "Each player discards their hand, then draws seven cards.\nMiracle {1}{R} (You may cast this card for its miracle cost when you draw it if it's the first card you drew this turn.)"))).toBe("native-spell");
    expect(classifyCard(S("One with Nothing", "Discard your hand.", "Instant", "{B}"))).toBe("native-spell");
  });
  it("the trigger / activated forms flip (Dragon Mage, Magus of the Wheel, Mindslicer)", () => {
    expect(classifyCard(S("Dragon Mage", "Flying\nWhenever this creature deals combat damage to a player, each player discards their hand, then draws seven cards.", "Creature — Dragon Wizard", "{5}{R}"))).toBe("native-trigger");
    expect(classifyCard(S("Magus of the Wheel", "{1}{R}, {T}, Sacrifice this creature: Each player discards their hand, then draws seven cards.", "Creature — Human Wizard", "{2}{R}"))).toBe("native-activated");
    expect(classifyCard(S("Mindslicer", "When this creature dies, each player discards their hand.", "Creature — Horror", "{4}{B}"))).toBe("native-trigger");
  });
});

describe("discard-hand / wheel — CREED: a count-scaled draw / unless-pay / rider stays Arbiter", () => {
  it("'draws cards equal to the greatest number discarded' (Windfall) stays Arbiter", () => {
    expect(classifyCard(S("Windfall", "Each player discards their hand, then draws cards equal to the greatest number of cards a player discarded this way."))).not.toMatch(/^native/);
  });
  it("'discards their hand unless they pay 7 life' (Tyrannize) stays Arbiter", () => {
    expect(classifyCard(S("Tyrannize", "Target player discards their hand unless they pay 7 life."))).not.toMatch(/^native/);
  });
  it("a 'for each card discarded this way' pump rider (Pyretic Charge) stays Arbiter", () => {
    expect(classifyCard(S("Pyretic Charge", "Discard your hand, then draw four cards. For each card discarded this way, creatures you control get +1/+0 until end of turn.", "Instant", "{2}{R}"))).not.toMatch(/^native/);
  });
});

describe("discard-hand — resolver e2e (the whole hand goes; no pause)", () => {
  it("each player discards their entire hand to their graveyard", () => {
    const s0 = createGameState({ userDeck: [], aiDeck: [] });
    const s = { ...s0, players: { ...s0.players,
      user: { ...s0.players.user, hand: [{ id: "u1" }, { id: "u2" }, { id: "u3" }] },
      ai: { ...s0.players.ai, hand: [{ id: "a1" }, { id: "a2" }] } } };
    const out = resolveAtom(s, { op: "discard", who: "eachPlayer", all: true }, { controller: "user" });
    expect(out.players.user.hand.length).toBe(0);
    expect(out.players.ai.hand.length).toBe(0);
    expect(out.players.user.graveyard.length).toBe(3);
    expect(out.players.ai.graveyard.length).toBe(2);
    expect(out.pendingChoice).toBeUndefined(); // no picker — a whole-hand discard has no choice
  });
});

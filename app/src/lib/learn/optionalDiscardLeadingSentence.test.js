/**
 * optionalDiscardLeadingSentence.test.js — the rummage pair with a MODELED SENTENCE IN FRONT OF IT.
 * Tweeze · Incinerating Blast · Pursue the Past.
 *
 * "You may discard a card. If you do, <payoff>." was already folded to one optional-discard-payment atom —
 * but only when it was the ENTIRE card. The fold has to run BEFORE the clause splitter (its two sentences
 * would shatter), and it was anchored to the start of the oracle, so a single leading sentence lost the whole
 * card. These three read "<deal damage / gain life>. You may discard a card. If you do, draw." and parsed to
 * nothing at all.
 *
 * ⛔ THE OPTIONAL LANDS LAST, WHICH IS THE ONLY SAFE ARRANGEMENT. The α2 invariant (optionalsFormSuffix)
 * exists because an optional FOLLOWED by a mandatory atom is ambiguous — declining the optional would wrongly
 * cancel the mandatory half. Mandatory-then-optional cannot be misread: the damage happens whatever you
 * choose. Both directions are asserted below, on a real cast, because that is the whole safety argument.
 *
 * ⛔ AND WITCH'S MARK IS DELIBERATELY STILL PARKED. Its shape is the reverse — pair FIRST, then a mandatory
 * Role-token sentence — which needs the PAYOFF text split at its first sentence boundary. A mis-split would
 * bind the token creation to the optional, so it would silently vanish when the player declines: a false
 * positive. Pinned below as a NEGATIVE so nobody "completes" this fold without building that split properly.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { dispatchAction } from "./actionDispatcher.js";
import { parseEffectProgram, programConfidence } from "./effects/parser.js";
import { resolveOptionalDiscardPaymentChoice } from "./effects/runProgram.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { legalActionsForPlayer } from "./legalChoices.js";

beforeEach(() => _resetIdsForTests());

const TWEEZE = { id: "ctw", name: "Tweeze", type: "Instant", mana: "{1}{R}",
  oracle: "Tweeze deals 3 damage to any target. You may discard a card. If you do, draw a card." };

/** Cast Tweeze at an opposing Bear; `takeIt` answers the optional discard. */
function play(takeIt) {
  const s0 = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
  const bear = createPermanent({ id: "b", card: { id: "cb", name: "Grizzly Bears", type: "Creature — Bear", power: 2, toughness: 2, oracle: "" }, controller: "ai1", summoningSick: false });
  let s = {
    ...s0, turn: 5, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user",
    players: {
      ...s0.players,
      user: {
        ...s0.players.user,
        hand: [{ ...TWEEZE, id: "SUBJ" }, { id: "f1", name: "Forest", type: "Basic Land — Forest" }],
        library: [{ id: "L1", name: "Mountain", type: "Basic Land — Mountain" }, { id: "L2", name: "Island", type: "Basic Land — Island" }],
        manaPool: { W: 0, U: 0, B: 0, R: 4, G: 0, C: 4 }, life: 40,
      },
      ai1: { ...s0.players.ai1, battlefield: [bear], life: 40 },
    },
  };
  const act = legalActionsForPlayer(s, "user").find((a) => a.kind === "cast-spell" && a.cardId === "SUBJ");
  expect(act, "Tweeze was never offered").toBeTruthy();
  s = dispatchAction(s, act);
  let guard = 0;
  const choices = [];
  while (((s.stack || []).length || s.pendingChoice) && guard++ < 12) {
    if (s.pendingChoice) {
      choices.push(s.pendingChoice.kind);
      if (s.pendingChoice.kind !== "optional-discard-payment") break;
      s = resolveOptionalDiscardPaymentChoice(s, takeIt);
      continue;
    }
    s = resolveTopOfStack(s);
  }
  return {
    bearAlive: !!s.players.ai1.battlefield.find((p) => p.id === "b"),
    hand: s.players.user.hand.map((c) => c.name),
    library: s.players.user.library.length,
    choices,
    errors: (s.log || []).filter((l) => l.kind === "stack-resolve-error").length,
  };
}

describe("⭐ it really plays — the mandatory half AND the optional half", () => {
  it("TAKING the discard: damage lands, a card is discarded, a card is drawn", () => {
    const r = play(true);
    expect(r.bearAlive).toBe(false);          // 3 damage killed the 2/2
    expect(r.hand).toEqual(["Mountain"]);     // Forest discarded, Mountain drawn
    expect(r.library).toBe(1);                // one card left the library
    expect(r.choices).toEqual(["optional-discard-payment"]);
    expect(r.errors).toBe(0);
  });

  it("⭐ DECLINING: the damage STILL lands, and nothing is discarded or drawn", () => {
    // This is the safety argument for the whole fold. If declining the optional could cancel the damage,
    // mandatory-then-optional would be as ambiguous as the arrangement the α2 invariant forbids.
    const r = play(false);
    expect(r.bearAlive).toBe(false);          // the mandatory half is unaffected by the choice
    expect(r.hand).toEqual(["Forest"]);       // nothing discarded
    expect(r.library).toBe(2);                // nothing drawn
    expect(r.errors).toBe(0);
  });
});

describe("the parse composes, and only in the safe order", () => {
  const prog = (name, type, oracle) => parseEffectProgram({ name, type, mana: "{1}{R}", oracle });
  const ops = (p) => (p?.atoms || []).map((a) => a.op);

  it("leading sentence + rummage pair → [mandatory, optional]", () => {
    const p = prog("Tweeze", "Instant", TWEEZE.oracle);
    expect(programConfidence(p)).toBe("high");
    expect(ops(p)).toEqual(["deal-damage", "optional-discard-payment"]);
  });

  it("a lifegain lead composes the same way", () => {
    const p = prog("Pursue the Past", "Sorcery", "You gain 2 life. You may discard a card. If you do, draw two cards.");
    expect(ops(p)).toEqual(["gain-life", "optional-discard-payment"]);
  });

  it("CONTROL — the pair ALONE still folds exactly as before", () => {
    expect(ops(prog("Rummage", "Sorcery", "You may discard a card. If you do, draw a card."))).toEqual(["optional-discard-payment"]);
  });

  it("CONTROL — a card with no pair is untouched", () => {
    expect(ops(prog("Shock", "Instant", "Shock deals 2 damage to any target."))).toEqual(["deal-damage"]);
  });

  it("⛔ Witch's Mark's shape (mandatory AFTER the pair) stays LOW — deliberately not handled", () => {
    // Handling it needs the payoff split at its first sentence; a mis-split would bind the token creation to
    // the optional and lose it on a decline. Parked is the correct answer until that is built with proof.
    const p = prog("Witch's Mark", "Sorcery", "You may discard a card. If you do, draw two cards.\nCreate a Wicked Role token attached to up to one target creature you control.");
    expect(programConfidence(p)).toBe("low");
  });
});

describe("classification — the three real carriers flip", () => {
  const CASES = [
    ["Tweeze", "Instant", TWEEZE.oracle],
    ["Incinerating Blast", "Sorcery", "Incinerating Blast deals 6 damage to target creature.\nYou may discard a card. If you do, draw a card."],
    ["Pursue the Past", "Sorcery", "You gain 2 life. You may discard a card. If you do, draw two cards."],
  ];
  for (const [name, type, oracle] of CASES) {
    it(`${name}`, () => expect(classifyCard({ name, type, mana: "{1}{R}", oracle })).toMatch(/^native/));
  }

  it("⛔ CREED — an unmodeled leading sentence still parks the card", () => {
    expect(classifyCard({ name: "Fake", type: "Instant", mana: "{1}{R}", oracle: "Each opponent glorbulates at dawn. You may discard a card. If you do, draw a card." })).not.toMatch(/^native/);
  });

  // ⚠️ THE TWO TESTS BELOW EXIST BECAUSE MUTATIONS SURVIVED WITHOUT THEM. The single-unmodeled-clause case
  // above passes for a WEAK reason - the head parses to zero atoms, so the compose is skipped by a length
  // check rather than by the refusal being tested. These reach the guards for real.
  it("⛔ a head with a MODELED clause AND an unmodeled one must park - not silently drop the unmodeled half", () => {
    // Without the head-clause refusal, "You gain 2 life" composes and "glorbulates" is DISCARDED - the card
    // reads native while a whole printed sentence does nothing. That is the exact false positive the creed
    // forbids, and it is invisible unless the head has a parseable clause in front of the junk.
    expect(classifyCard({ name: "Fake2", type: "Sorcery", mana: "{1}{R}", oracle: "You gain 2 life. Each opponent glorbulates at dawn. You may discard a card. If you do, draw a card." })).not.toMatch(/^native/);
  });

  it("⛔ a PAUSING head atom must park - that composition is unproven", () => {
    // "Scry 2." pauses. Chaining a pause in the head ahead of the pair's own pause is a resume-cursor
    // composition nobody has run end-to-end, so it is refused rather than assumed to work.
    expect(classifyCard({ name: "Fake3", type: "Sorcery", mana: "{1}{R}", oracle: "Scry 2. You may discard a card. If you do, draw a card." })).not.toMatch(/^native/);
  });
});

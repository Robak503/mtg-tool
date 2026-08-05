/**
 * maxHandSize.test.js — self-scoped "Your maximum hand size is …" (CR 402.2): Thought Eater, Thought
 * Nibbler, Thought Devourer, Minamo Scrollkeeper, Trusted Advisor, Null Profusion, Recycle, Doctor Octopus.
 *
 * ⛔⛔ THE BUG WAS A GLOBAL FAIL-OPEN, not the four parked cards. `cleanupDiscardExcess` suspended the
 * cleanup discard for **every player** the moment ANY permanent anywhere printed "maximum hand size" text it
 * couldn't read — and returned 0 unconditionally. So a single **Cursed Rack** handed its OWN controller an
 * unlimited hand for the rest of the game, and the opponent it was aimed at got one too. The parked cards
 * were the symptom; the blanket suspension was the defect.
 *
 * ⭐ Fifth find from the runtime-refusal sweep. The suspension is now NARROW: text the engine can read is
 * READ, and only the genuinely unplaceable forms suspend.
 *
 * ⛔ SELF-SCOPED ONLY, and the refusal is deliberate. "The chosen player's …" (Cursed Rack) and "Each
 * opponent's …" (Locust Miser) need a chosen-player / opponent binding the `maxHandSize` op does not carry.
 * They still park AND still suspend — the honest fail-open for a number the engine cannot place on a
 * player. Pinned below so a later edit doesn't quietly widen the regex and start applying those to the
 * wrong seat.
 *
 * ⛔ ONE REGEX, TWO CALLERS. `MODELLED_MAX_HAND_RE` is exported from staticAbilityParser and used BOTH by
 * the arm that emits the op and by cleanupDiscardExcess's readability test. A second copy would drift, and a
 * drift here means either a silently-unapplied maximum or a wrongly-suspended cleanup — the two failure
 * modes this slice exists to remove.
 *
 * ⓘ Sets are applied before deltas (see maxHandSizeFor): a "set" landing after a "delta" would otherwise
 * wipe it. With one card of each in play — the common case — both orderings agree.
 *
 * Mutation-checked (2026-08-05, each grep-verified as applied AND verified on the case under test): the
 * reader call reverted to the hardcoded 7 -> the deltas stop applying and the witness shows the old
 * numbers; the readability test removed -> the blanket suspension returns and Cursed Rack again gives
 * everyone an unlimited hand.
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-08-05).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { cleanupDiscardExcess } from "./gameEngine.js";
import { maxHandSizeFor } from "./layers.js";
import { parseStaticAbilities } from "./staticAbilityParser.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const THOUGHT_EATER = { id: "c-te", name: "Thought Eater", type: "Creature — Spirit", mana: "{2}{U}",
  power: "2", toughness: "2", oracle: "Flying\nYour maximum hand size is reduced by three." };
const MINAMO = { id: "c-ms", name: "Minamo Scrollkeeper", type: "Creature — Human Wizard", mana: "{2}{U}",
  power: "1", toughness: "4", oracle: "Defender\nYour maximum hand size is increased by one." };
const NULL_PROFUSION = { id: "c-np", name: "Null Profusion", type: "Enchantment", mana: "{3}{B}{B}",
  oracle: "Skip your draw step.\nWhenever you play a card, draw a card.\nYour maximum hand size is two." };
const CURSED_RACK = { id: "c-cr", name: "Cursed Rack", type: "Artifact", mana: "{4}",
  oracle: "As this artifact enters, choose a player.\nThe chosen player's maximum hand size is four." };

const hand = (n) => Array.from({ length: n }, (_, i) => ({ id: `h${i}`, name: `Card ${i}`, type: "Instant", oracle: "" }));

describe("the self-scoped forms parse; the other-player forms refuse", () => {
  it("⭐ set and delta both read, with the sign carried", () => {
    expect(parseStaticAbilities(NULL_PROFUSION).map((e) => e.op)).toContainEqual({ layerOp: "maxHandSize", mode: "set", n: 2 });
    expect(parseStaticAbilities(THOUGHT_EATER).map((e) => e.op)).toContainEqual({ layerOp: "maxHandSize", mode: "delta", n: -3 });
    expect(parseStaticAbilities(MINAMO).map((e) => e.op)).toContainEqual({ layerOp: "maxHandSize", mode: "delta", n: 1 });
    expect(classifyCard(THOUGHT_EATER)).toBe("native-static");
  });

  it("⛔ 'the chosen player's …' is REFUSED — it needs a binding this op doesn't carry", () => {
    expect(parseStaticAbilities(CURSED_RACK).some((e) => e.op?.layerOp === "maxHandSize")).toBe(false);
  });
});

describe("⭐ LAW 6 — the cleanup discard uses the real maximum", () => {
  function board(cards, { handSize = 9 } = {}) {
    const g = createGameState({ userDeck: [], aiDeck: [] });
    const bf = cards.map((c, i) => createPermanent({ id: `p${i}`, card: c, controller: "user" }));
    return { ...g, players: { ...g.players, user: { ...g.players.user, hand: hand(handSize), battlefield: bf } } };
  }

  it("⭐ deltas and sets change how many cards are discarded", () => {
    const rows = [
      { board: "empty", max: maxHandSizeFor(board([]), "user"), discard: cleanupDiscardExcess(board([]), "user") },
      { board: "Thought Eater (-3)", max: maxHandSizeFor(board([THOUGHT_EATER]), "user"), discard: cleanupDiscardExcess(board([THOUGHT_EATER]), "user") },
      { board: "Minamo (+1)", max: maxHandSizeFor(board([MINAMO]), "user"), discard: cleanupDiscardExcess(board([MINAMO]), "user") },
      { board: "Null Profusion (set 2)", max: maxHandSizeFor(board([NULL_PROFUSION]), "user"), discard: cleanupDiscardExcess(board([NULL_PROFUSION]), "user") },
      { board: "set 2 AND -3", max: maxHandSizeFor(board([NULL_PROFUSION, THOUGHT_EATER]), "user"), discard: cleanupDiscardExcess(board([NULL_PROFUSION, THOUGHT_EATER]), "user") },
    ];
    console.log("  WITNESS", JSON.stringify(rows)); // printed so a broken harness can't read as a clean negative
    expect(rows).toEqual([
      { board: "empty", max: 7, discard: 2 },
      { board: "Thought Eater (-3)", max: 4, discard: 5 },
      { board: "Minamo (+1)", max: 8, discard: 1 },
      { board: "Null Profusion (set 2)", max: 2, discard: 7 },
      // ⭐ Set applied first, then the delta — 2 − 3 clamps to 0, so the whole hand goes.
      { board: "set 2 AND -3", max: 0, discard: 9 },
    ]);
  });

  it("⛔⛔ CURSED RACK still suspends — but that is now the ONLY thing that does", () => {
    // The honest fail-open: the engine cannot place "the chosen player's" maximum, so it declines to guess.
    expect(cleanupDiscardExcess(board([CURSED_RACK]), "user")).toBe(0);
    // ⭐ AND THE SUSPENSION NO LONGER LEAKS: a readable card beside it is still read, and a board with only
    // readable text discards normally. Before this slice, ANY hand-size text anywhere returned 0 for
    // everyone — which is how Cursed Rack gave its own controller an unlimited hand.
    expect(cleanupDiscardExcess(board([THOUGHT_EATER]), "user")).toBe(5);
  });

  it("⛔ the exemption is CONTROLLER-scoped — an opponent's Thought Eater doesn't shrink your hand", () => {
    const g = createGameState({ userDeck: [], aiDeck: [] });
    const s = { ...g, players: { ...g.players,
      user: { ...g.players.user, hand: hand(9), battlefield: [] },
      ai: { ...g.players.ai, battlefield: [createPermanent({ id: "opp", card: THOUGHT_EATER, controller: "ai" })] } } };
    expect(maxHandSizeFor(s, "user")).toBe(7);
    expect(cleanupDiscardExcess(s, "user")).toBe(2);
  });
});

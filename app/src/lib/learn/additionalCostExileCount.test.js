/**
 * additionalCostExileCount.test.js — ADDCOST-3b (CR 601.2f/h): "exile <N> cards from your graveyard",
 * the UNTYPED count-of-N form. Abhorrent Oculus — a card on Colton's actual shelf, and one of the three
 * shelf cards the unvetted-cost guard left dead in hand.
 *
 * ⛔ NUM_WORD, NOT SMALL_NUM. SMALL_NUM stops at five and the printed cost is SIX — the smaller table would
 * have silently failed to match the single card this shape exists for, and the slice would have read green
 * while doing nothing. The "exactly six" assertions below are what make that visible.
 *
 * ⛔ The failure mode is the family's usual one: fewer than N cards in the graveyard must mean UNCASTABLE,
 * not a discount. Paying N-1 is as much a false positive as paying nothing.
 *
 * Oracle text copied from the bundled Scryfall corpus, never from memory.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { extractAdditionalCosts } from "./effects/castModifiers.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const OCULUS = { name: "Abhorrent Oculus", type: "Creature — Eye", mana: "{2}{U}", power: "5", toughness: "5",
  oracle: "As an additional cost to cast this spell, exile six cards from your graveyard.\nFlying\nAt the beginning of each opponent's upkeep, manifest dread. (Look at the top two cards of your library. Put one onto the battlefield face down as a 2/2 creature and the other into your graveyard. Turn it face up any time for its mana cost if it's a creature card.)" };

const st_ = (out) => out?.state || out;
function board(gyCount) {
  const s0 = createGameState({ userDeck: [], aiDeck: [] });
  const bf = [];
  for (let i = 0; i < 6; i++) bf.push(createPermanent({ id: `L${i}`, card: { id: `cl${i}`, name: "Island", type: "Basic Land — Island", oracle: "{T}: Add {U}." }, controller: "user" }));
  const gy = [];
  for (let i = 0; i < gyCount; i++) gy.push({ id: `g${i}`, name: `Junk${i}`, type: "Creature — Rat", mana_cost: "{1}", cmc: 1, oracle: "" });
  return { ...s0, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main",
    players: { ...s0.players, user: { ...s0.players.user, battlefield: bf, hand: [{ id: "spell", ...OCULUS }], graveyard: gy, life: 20 } } };
}
const castsOf = (s) => (legalActionsForPlayer(s, "user") || []).filter((a) => a.kind === "cast-spell" && a.name === "Abhorrent Oculus");

describe("the parser reads the count", () => {
  it("untyped count-of-N → cardType 'any' with the count", () => {
    expect(extractAdditionalCosts(OCULUS.oracle).costs).toEqual([{ kind: "exileFromGraveyard", cardType: "any", count: 6 }]);
  });

  it("⭐ SIX specifically — the word is past SMALL_NUM's ceiling of five", () => {
    const at = (w) => extractAdditionalCosts(`As an additional cost to cast this spell, exile ${w} cards from your graveyard.\nDraw a card.`).costs?.[0]?.count;
    expect([at("two"), at("five"), at("six"), at("ten")]).toEqual([2, 5, 6, 10]);
  });

  it("⛔ the singular TYPED form is byte-identical (no count field)", () => {
    expect(extractAdditionalCosts("As an additional cost to cast this spell, exile a creature card from your graveyard.\nDraw a card.").costs)
      .toEqual([{ kind: "exileFromGraveyard", cardType: "creature" }]);
  });

  it("⛔ the TYPED count form is still unmodeled — vetting one shape must not widen to its neighbour", () => {
    expect(extractAdditionalCosts("As an additional cost to cast this spell, exile two creature cards from your graveyard.\nDraw a card.").costs).toBeNull();
    expect(extractAdditionalCosts("As an additional cost to cast this spell, exile X cards from your graveyard.\nDraw a card.").costs).toBeNull();
  });
});

describe("⭐⭐ the offer and the charge are both exactly N", () => {
  it("⛔ fewer than six in the graveyard → NOT OFFERED (never a discount)", () => {
    expect(castsOf(board(0))).toHaveLength(0);
    expect(castsOf(board(5))).toHaveLength(0);
  });

  it("exactly six → castable", () => {
    expect(castsOf(board(6))).toHaveLength(1);
  });

  it("exactly SIX are exiled, no more — with eight in the graveyard, two remain", () => {
    const s = board(8);
    const after = st_(dispatchAction(s, castsOf(s)[0]));
    expect(after.players.user.graveyard).toHaveLength(2);
    expect(after.players.user.exile).toHaveLength(6);
  });

  it("the frozen ids are the ones actually exiled", () => {
    const s = board(8);
    const act = castsOf(s)[0];
    expect(act.exileGyCardIds).toHaveLength(6);
    const after = st_(dispatchAction(s, act));
    const goneIds = new Set(act.exileGyCardIds);
    expect(after.players.user.graveyard.every((c) => !goneIds.has(c.id))).toBe(true);
    expect(after.players.user.exile.every((c) => goneIds.has(c.id))).toBe(true);
  });
});

describe("coverage", () => {
  it("Abhorrent Oculus flips", () => {
    expect(classifyCard(OCULUS)).toBe("native-trigger");
  });

  it("⛔ an effect that reads the EXILED cards back is parked — and this guard was silently dead", () => {
    // The selfRef regex on this cost kind was written as /\bexiled\b/ and a tooling slip turned both \b into
    // literal BACKSPACE bytes. Every test still passed, because nothing exercised the guard — a lint rule
    // caught it, not the suite. That is the hollow-gate shape exactly: a safety check that cannot fire looks
    // identical to one that never needed to. This test is the witness that it fires.
    expect(classifyCard({ name: "Referent", type: "Sorcery", mana: "{2}{U}",
      oracle: "As an additional cost to cast this spell, exile six cards from your graveyard.\nDraw cards equal to the number of cards exiled this way." })).not.toMatch(/^native/);
  });
});

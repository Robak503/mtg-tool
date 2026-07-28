/**
 * repeatableModes.test.js — REPEATABLE MODES (CR 700.2d): "You may choose the same mode more than once."
 *
 * The Confluence cycle (Mystic #1431, Fiery #1561, Eldrazi, Verdant, Righteous, Wretched, …) plus Planewide
 * Celebration and Unite the Coalition — 15 cards on the exact fixed-N lead-in.
 *
 * WHY THEY ALL PARSED LOW, which was not obvious: MODAL_RE requires a DASH after the count ("Choose two —"),
 * and these print a PERIOD ("Choose three. You may choose the same mode more than once."). So they never
 * reached the mode splitter at all — the "You may choose…" sentence sat in front of the bullets and became a
 * garbage first "mode" that failed to parse, dropping the whole card. The lead is matched by its own anchored
 * regex rather than by widening MODAL_RE, so every existing modal card still matches byte-identically.
 *
 * THE EXECUTOR NEEDED NOTHING. programAtoms already does `chosenMode.flatMap(k => modes[k].atoms)`, so a pick
 * of [0,0,1] runs mode 0's atoms twice with no change — which is exactly the printed behaviour (CR 700.2e
 * resolves repeated modes in the order chosen). The only new machinery is kMultisets in the enumerator.
 *
 * NON-DECREASING ORDER is deliberate, not incidental: it collapses permutations of the same multiset to ONE
 * cast option, and ascending order matches programAtoms' concatenation order.
 */
import { describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { parseEffectProgram } from "./effects/parser.js";
import { expandCastChoices } from "./effects/targeting.js";
import { _resetIdsForTests, createGameState } from "./gameState.js";

const I = (name, oracle) => ({ name, type: "Instant", mana: "{2}{R}", keywords: [], oracle });

const FIERY = I("Fiery Confluence",
  "Choose three. You may choose the same mode more than once.\n• Fiery Confluence deals 1 damage to each creature.\n• Fiery Confluence deals 2 damage to each opponent.\n• Destroy target artifact.");

/** A 2-mode repeatable program with NO targets, so the expansion is purely the mode multiset. */
const twoModeRepeatable = () => ({
  version: 1, source: "test", confidence: "high", structure: "modal", atoms: [], xSpell: false, unparsedTail: null,
  modal: {
    chooseCount: 3, upTo: false, atLeastOne: false, repeatable: true,
    modes: [
      { label: "you gain 1 life", atoms: [{ op: "gain-life", amount: 1, targetType: null }] },
      { label: "each opponent loses 1 life", atoms: [{ op: "lose-life", amount: 1, who: "eachOpponent", targetType: null }] },
    ],
  },
});

const board = () => {
  _resetIdsForTests();
  return createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
};

const picks = (program) => expandCastChoices(board(), "user", program, [], null).map((o) => o.chosenMode.join(""));

describe("parse — the printed lead-in", () => {
  it("Fiery Confluence parses HIGH with repeatable + chooseCount 3", () => {
    const p = parseEffectProgram(FIERY);
    expect(p.confidence).toBe("high");
    expect(p.modal.repeatable).toBe(true);
    expect(p.modal.chooseCount).toBe(3);
    expect(p.modal.modes).toHaveLength(3);
  });

  it("REGRESSION PIN — a plain 'Choose two —' card is NOT marked repeatable", () => {
    const p = parseEffectProgram(I("Plain", "Choose two —\n• You gain 1 life.\n• Each opponent loses 1 life."));
    expect(p.modal.repeatable).toBeUndefined();
    expect(p.modal.chooseCount).toBe(2);
  });

  it("CREED — the Season cycle's '{P} worth of modes' point system is NOT claimed", () => {
    const p = parseEffectProgram(I("Season", "Choose up to five {P} worth of modes. You may choose the same mode more than once.\n• You gain 1 life.\n• Each opponent loses 1 life."));
    expect(p.confidence).toBe("low");
  });

  it("CREED — a VARIABLE 'Choose X' stays low (Doomsday Confluence)", () => {
    const p = parseEffectProgram(I("DoomsdayC", "Choose X. You may choose the same mode more than once.\n• You gain 1 life.\n• Each opponent loses 1 life."));
    expect(p.confidence).toBe("low");
  });
});

describe("expansion — the same mode may be chosen more than once", () => {
  it("THE LOAD-BEARING ONE — repeats are offered (choose 3 of 2 modes = 4 multisets)", () => {
    // kCombinations could never produce these: it requires strictly ascending indices, so choosing 3 from 2
    // modes would yield NOTHING and the card would be uncastable.
    expect(picks(twoModeRepeatable()).sort()).toEqual(["000", "001", "011", "111"]);
  });

  it("each pick is NON-DECREASING — permutations collapse to one cast option", () => {
    for (const p of picks(twoModeRepeatable())) {
      expect([...p].sort().join("")).toBe(p);
    }
  });

  it("a NON-repeatable program of the same shape offers no repeats", () => {
    const plain = twoModeRepeatable();
    delete plain.modal.repeatable;
    plain.modal.chooseCount = 2;
    expect(picks(plain)).toEqual(["01"]);   // strictly ascending, each mode at most once
  });

  it("chooseCount may EXCEED the mode count when repeatable (Unite the Coalition: five of four)", () => {
    const p = twoModeRepeatable();
    p.modal.chooseCount = 3;                // 3 > 2 modes — legal only because repeats are allowed
    expect(picks(p).length).toBeGreaterThan(0);
  });

  it("the satisfiability guard still rejects an over-count when NOT repeatable", () => {
    const p = parseEffectProgram(I("Over", "Choose two —\n• You gain 1 life."));
    expect(p.confidence).toBe("low");       // one mode, choose two → unsatisfiable
  });
});

describe("classification — the staples this unblocks", () => {
  it("Fiery Confluence #1561 flips", () => {
    expect(classifyCard(FIERY)).toMatch(/^native/);
  });

  it("Mystic Confluence #1431 flips", () => {
    expect(classifyCard(I("Mystic Confluence",
      "Choose three. You may choose the same mode more than once.\n• Counter target spell unless its controller pays {3}.\n• Return target creature to its owner's hand.\n• Draw a card.")))
      .toMatch(/^native/);
  });
});

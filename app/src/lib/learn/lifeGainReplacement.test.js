/**
 * lifeGainReplacement.test.js — the LIFE-GAIN replacement (CR 614.1), the last missing member of
 * replacementEffects' family. Counters, tokens, mill and mana each already had a multiplier and an
 * additive arm; life gain had neither.
 *
 *   "If you would gain life, you gain twice that much life instead."      → ×2  (Rhox Faithmender,
 *                                                                              Boon Reflection, The Wind Crystal)
 *   "If you would gain life, you gain that much life plus N instead."     → +N  (Angel of Vitality,
 *                                            Heron of Hope, Honor Troll, Knight of Dawn's Light)
 *
 * All seven oracle texts read from the bundled Scryfall snapshot. Enforcement is real, not a coverage
 * marker: every claim drives gameState.gainLife, the single life-gain chokepoint, and every assertion is
 * paired with the same measurement in the effect's absence.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { classifyCard } from "./coverage.js";
import { createGameState, createPermanent, gainLife, _resetIdsForTests } from "./gameState.js";
import { doublerProfile, applyLifeGainReplacement } from "./replacementEffects.js";
import { checkLifegainTriggers } from "./triggers.js";

// A plain "whenever you gain life" watcher, used to prove the TRIGGER sees the replaced amount.
const WATCHER = { name: "Watcher", type: "Enchantment", mana: "{2}{W}", oracle: "Whenever you gain life, draw a card." };

beforeEach(() => _resetIdsForTests());

const DOUBLER = { name: "Boon Reflection", type: "Enchantment", mana: "{4}{W}", oracle: "If you would gain life, you gain twice that much life instead." };
const ADDITIVE = { name: "Angel of Vitality", type: "Creature — Angel", mana: "{2}{W}", oracle: "Flying\nIf you would gain life, you gain that much life plus 1 instead.\nThis creature gets +2/+2 as long as you have 25 or more life." };
const RHOX = { name: "Rhox Faithmender", type: "Creature — Rhino Monk", mana: "{3}{W}", oracle: "Lifelink (Damage dealt by this creature also causes you to gain that much life.)\nIf you would gain life, you gain twice that much life instead." };

/** `owner` controls each card in `cards`; nobody else has anything. */
function stateWith(cards, owner = "user") {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  const bf = cards.map((c, i) => createPermanent({ id: `p${i}`, card: { ...c, id: `c${i}` }, controller: owner }));
  return { ...s, players: { ...s.players, [owner]: { ...s.players[owner], battlefield: bf } } };
}

const lifeAfterGain = (state, n, pid = "user") => gainLife(state, { playerId: pid, amount: n }).players[pid].life;

describe("life-gain replacement — the cards", () => {
  it("flips all seven carriers native", () => {
    expect(classifyCard(DOUBLER)).toBe("native-static");
    expect(classifyCard(RHOX)).toBe("native-static");
    expect(classifyCard(ADDITIVE)).toBe("native-mixed");
  });

  it("parses both arms into distinct profile shapes", () => {
    expect(doublerProfile(DOUBLER).life).toEqual({ factor: 2 });
    expect(doublerProfile(ADDITIVE).life).toEqual({ additive: 1 });
  });

  it("reads the clause even when a keyword or reminder shares its split fragment", () => {
    // doublerProfile splits on "." — "Flying\nIf you would gain life…" and Rhox's reminder-text tail
    // both leave text at the head of the fragment. An ^-anchored match cost 5 of the 7 real cards.
    expect(doublerProfile(ADDITIVE).life).toEqual({ additive: 1 });
    expect(doublerProfile(RHOX).life).toEqual({ factor: 2 });
  });

  it("refuses a shape the runtime does not apply (CREED: residue, not a guess)", () => {
    const thrice = { ...DOUBLER, oracle: "If you would gain life, you gain three times that much life instead." };
    expect(doublerProfile(thrice)?.life).toBeUndefined();
    const opp = { ...DOUBLER, oracle: "If an opponent would gain life, they gain twice that much life instead." };
    expect(doublerProfile(opp)?.life).toBeUndefined();
  });
});

describe("ENFORCEMENT — gainLife actually applies it", () => {
  it("VACUITY CONTROL: with an empty board, a gain of 4 is a gain of 4", () => {
    expect(lifeAfterGain(stateWith([]), 4)).toBe(40 + 4);
  });

  it("doubles under a ×2 replacement", () => {
    expect(lifeAfterGain(stateWith([DOUBLER]), 4)).toBe(40 + 8);
  });

  it("adds under a +N replacement", () => {
    expect(lifeAfterGain(stateWith([ADDITIVE]), 4)).toBe(40 + 5);
  });

  it("orders them (base + additive) × multiplier, per the house convention and CR 616.1", () => {
    // The affected player chooses when replacements compete, and would choose this order:
    // (2+1)×2 = 6 beats 2×2+1 = 5. Byte-identical to applyCounterDoubling's order.
    expect(applyLifeGainReplacement(stateWith([DOUBLER, ADDITIVE]), "user", 2)).toBe(6);
    expect(lifeAfterGain(stateWith([DOUBLER, ADDITIVE]), 2)).toBe(40 + 6);
  });

  it("two doublers stack multiplicatively, two additives additively", () => {
    expect(applyLifeGainReplacement(stateWith([DOUBLER, RHOX]), "user", 3)).toBe(12);
    expect(applyLifeGainReplacement(stateWith([ADDITIVE, { ...ADDITIVE, name: "Heron of Hope" }]), "user", 3)).toBe(5);
  });

  it("is CONTROLLER-scoped — an opponent's doubler never touches your gain", () => {
    const oppHasIt = stateWith([DOUBLER], "ai");
    // Same board, other seat: the gain must be untouched. Without the ownerId gate this reads 8.
    expect(lifeAfterGain(oppHasIt, 4, "user")).toBe(40 + 4);
    expect(lifeAfterGain(oppHasIt, 4, "ai")).toBe(40 + 8);
  });

  it("a gain of 0 stays 0 — an additive must not manufacture a life-gain event (CR 119.3)", () => {
    const s = stateWith([ADDITIVE]);
    expect(applyLifeGainReplacement(s, "user", 0)).toBe(0);
    const after = gainLife(s, { playerId: "user", amount: 0 });
    expect(after.players.user.life).toBe(40);
    expect(after.players.user.lifeGainedThisTurn).toBeUndefined();
  });

  it("the this-turn ledger records the REPLACED amount, not the offered one", () => {
    // "You've gained life this turn" thresholds must see what the player actually gained.
    const after = gainLife(stateWith([DOUBLER]), { playerId: "user", amount: 4 });
    expect(after.players.user.lifeGainedThisTurn).toBe(8);
  });

  it("a 'whenever you gain life' trigger sees the REPLACED amount (CR 119.3)", () => {
    // The bug this catches: nine call sites pass the amount the EFFECT OFFERED. Those were the same
    // number until the replacement existed, so adding it silently made every lifegain trigger
    // under-report — a "for each 1 life you gained" rider would count 4 under a Faithmender, not 8.
    // checkLifegainTriggers converts centrally, so a call site that passes the offered amount is right.
    const s = stateWith([DOUBLER, WATCHER]);
    const fired = checkLifegainTriggers(s, "user", 4).pendingTriggers || [];
    expect(fired.length).toBeGreaterThan(0);
    const amounts = fired.map((t) => t.context?.lifegainAmount);
    expect(amounts).toContain(8);
    expect(amounts).not.toContain(4);
  });

  it("VACUITY CONTROL: with no replacement out, that same trigger sees the plain amount", () => {
    const fired = checkLifegainTriggers(stateWith([WATCHER]), "user", 4).pendingTriggers || [];
    expect(fired.length).toBeGreaterThan(0);
    expect(fired.map((t) => t.context?.lifegainAmount)).toContain(4);
  });
});

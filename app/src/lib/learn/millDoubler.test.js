/**
 * millDoubler.test.js — MILL-DOUBLER replacement (SHELF M2, Bruvac the Grandiloquent).
 *
 * "If an opponent would mill one or more cards, they mill twice that many cards instead." — an
 * opponent-scoped mill-COUNT replacement (CR 616) in the doubler family. Applied at BOTH mill
 * chokepoints: millOnePlayer (every mill instruction) and applyRadiation (the inherent rad mill —
 * the doubled nonlands then cost life + rad removal, the deck's real synergy).
 *
 * CREED: opponent-scoped only (Bruvac's controller's own mills are NEVER doubled); two Bruvacs
 * stack ×4; the multiplied count is bounded by the library; classify = native-static via
 * doublerCardTier (the doubler clause strips, a bare legendary body remains).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { doublerProfile, millMultiplier, isModeledDoublerSentence } from "./replacementEffects.js";
import { createGameState, createPermanent, applyRadiation, _resetIdsForTests } from "./gameState.js";
import { resolveAtom } from "./effects/effectAtoms.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const BRUVAC = {
  name: "Bruvac the Grandiloquent", type: "Legendary Creature — Human Advisor", power: 1, toughness: 4,
  oracle: "If an opponent would mill one or more cards, they mill twice that many cards instead.",
};
const lib = (n) => Array.from({ length: n }, (_, i) => ({ id: "c" + i, name: "C" + i, type: "Instant" }));

function board({ userBf = [], aiBf = [], aiLib = [], userLib = [] } = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...s,
    players: {
      ...s.players,
      user: { ...s.players.user, battlefield: userBf, library: userLib },
      ai: { ...s.players.ai, battlefield: aiBf, library: aiLib },
    },
  };
}

describe("MILL-DOUBLER — profile + coverage", () => {
  it("parses to the opponent-scoped ×2 mill profile and classifies native-static", () => {
    expect(doublerProfile(BRUVAC)?.mill).toEqual({ factor: 2, scope: "opponent" });
    expect(isModeledDoublerSentence(BRUVAC.oracle.toLowerCase().replace(/\.$/, ""))).toBe(true);
    expect(classifyCard(BRUVAC)).toBe("native-static");
  });
  it("a rider on the doubler body keeps the card off the tier (CREED)", () => {
    const ridered = { ...BRUVAC, oracle: BRUVAC.oracle + "\nWhenever an opponent mills a card, you gain 1 life and draw seven cards and win." };
    expect(classifyCard(ridered)).not.toBe("native-static");
  });
});

describe("MILL-DOUBLER — runtime", () => {
  it("an opponent's mill is doubled; the controller's own mill is NOT", () => {
    const bruvac = createPermanent({ id: "bru", card: BRUVAC, controller: "user" });
    let s = board({ userBf: [bruvac], aiLib: lib(10), userLib: lib(10) });
    expect(millMultiplier(s, "ai")).toBe(2);
    expect(millMultiplier(s, "user")).toBe(1);
    // "each opponent mills 3" from the user → the ai mills 6.
    s = resolveAtom(s, { op: "mill", who: "eachOpponent", amount: 3 }, { controller: "user", targets: [] });
    expect(s.players.ai.graveyard).toHaveLength(6);
    expect(s.players.user.graveyard).toHaveLength(0);
  });

  it("two Bruvacs stack ×4; the count is bounded by the library", () => {
    const b1 = createPermanent({ id: "b1", card: BRUVAC, controller: "user" });
    const b2 = createPermanent({ id: "b2", card: { ...BRUVAC, name: "Bruvac Twin" }, controller: "user" });
    let s = board({ userBf: [b1, b2], aiLib: lib(10) });
    expect(millMultiplier(s, "ai")).toBe(4);
    s = resolveAtom(s, { op: "mill", who: "eachOpponent", amount: 3 }, { controller: "user", targets: [] });
    expect(s.players.ai.graveyard).toHaveLength(10); // 3×4=12, bounded by the 10-card library
  });

  it("RADIATION mill is doubled too (and the doubled nonlands cost life + rad)", () => {
    const bruvac = createPermanent({ id: "bru", card: BRUVAC, controller: "user" });
    let s = board({ userBf: [bruvac], aiLib: lib(10) });
    s = { ...s, players: { ...s.players, ai: { ...s.players.ai, radCounters: 2, life: 40 } } };
    s = applyRadiation(s, { playerId: "ai" });
    expect(s.players.ai.graveyard).toHaveLength(4);   // 2 rad → 4 milled (all nonland instants)
    expect(s.players.ai.life).toBe(36);               // 4 nonland → -4 life
    expect(s.players.ai.radCounters).toBe(0);         // rad removal floors at the 2 counters held
  });
});

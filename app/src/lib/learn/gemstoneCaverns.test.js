/**
 * gemstoneCaverns.test.js — Gemstone Caverns (the play-weighted program, P·8, 2026-10-01: EDHREC rank #179).
 *
 *   "If this card is in your opening hand and you're not the starting player, you may begin the game with Gemstone Caverns on
 *    the battlefield with a luck counter on it. If you do, exile a card from your hand.
 *    {T}: Add {C}. If Gemstone Caverns has a luck counter on it, instead add one mana of any color."
 *
 * The opening-hand line is a CR 103.6 pre-game action the engine never offers — coverage pre-strips it like the Leylines', so
 * the land is played from hand as printed. That makes the luck counter unreachable, and the mana line's "instead" rider is
 * read as its base: {C}. Before this slice the any-colour arm read "add one mana of any color" off the rider with no counter
 * anywhere, and every Caverns tapped for any colour (probed live) — fixed here.
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-10-01), except the synthetic fence.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { manaProduction, manaSources, planPayment } from "./manaModel.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const CAVERNS = { name: "Gemstone Caverns", type: "Legendary Land", mana: "", cmc: 0, colors: [], keywords: [],
  oracle: "If this card is in your opening hand and you're not the starting player, you may begin the game with Gemstone Caverns on the battlefield with a luck counter on it. If you do, exile a card from your hand.\n{T}: Add {C}. If Gemstone Caverns has a luck counter on it, instead add one mana of any color." };

const board = (counters = {}) => {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  const p = { ...createPermanent({ id: "gc", card: { id: "c-gc", ...CAVERNS }, controller: "user", summoningSick: false }), counters };
  return { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [p] } } };
};
const pays = (s, cost) => planPayment(s.players.user.manaPool, manaSources(s, "user"), { generic: 0, W: 0, U: 0, B: 0, R: 0, G: 0, C: 0, hybrid: [], ...cost }) !== null;

describe("Gemstone Caverns", () => {
  it("a covered land whose tap makes {C} — the luck-counter rider read as its base (WITNESS)", () => {
    const s = board();
    const witness = { tier: classifyCard(CAVERNS), product: manaProduction(CAVERNS), green: pays(s, { G: 1 }), generic: pays(s, { generic: 1 }), colorless: pays(s, { C: 1 }) };
    console.log(`WITNESS gemstoneCaverns ${JSON.stringify(witness)}`);
    expect(witness).toEqual({ tier: "land", product: { colors: ["C"], amount: 1, requiresTap: true }, green: false, generic: true, colorless: true });
  });

  it("fence (synthetic): the pre-game line is stripped only in its printed form — another rider after \"If you do,\" keeps the card partial", () => {
    const other = { ...CAVERNS, oracle: CAVERNS.oracle.replace("exile a card from your hand.", "draw a card.") };
    expect(classifyCard(other)).not.toBe("land");
  });
});

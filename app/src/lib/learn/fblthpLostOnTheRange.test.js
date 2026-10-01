/**
 * fblthpLostOnTheRange.test.js — Fblthp, Lost on the Range (shelf decks D38, 2026-09-30: Kellan of the West).
 *
 *   "The top card of your library has plot. The plot cost is equal to its mana cost.
 *    You may plot nonland cards from the top of your library."
 *
 * CR 702.170f: an effect may let a plot ability function outside a player's hand; the card is exiled from that zone. Three
 * static markers, read together by plotFromLibraryTopGranted; legalChoices offers the library's top nonland card the plot
 * special action (CR 702.170a — main phase, empty stack) for its own mana cost, the dispatcher exiles it from the library,
 * and the existing plotted-card machinery casts it free on a later turn (CR 702.170d). A card with no mana cost has an
 * unpayable plot cost (CR 118.6), and an {X} cost would need the X choice, so neither is offered.
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-09-30), except the synthetic permission that pins the fence.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { parseStaticAbilities } from "./staticAbilityParser.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const FBLTHP = { name: "Fblthp, Lost on the Range", type: "Legendary Creature — Homunculus", mana: "{1}{U}{U}", power: "1", toughness: "1", keywords: ["Plot", "Ward"],
  oracle: "Ward {2}\nYou may look at the top card of your library any time.\nThe top card of your library has plot. The plot cost is equal to its mana cost.\nYou may plot nonland cards from the top of your library." };
const DIVINATION = { name: "Divination", type: "Sorcery", mana: "{2}{U}", keywords: [], oracle: "Draw two cards." };
const ISLAND = { name: "Island", type: "Basic Land — Island", mana: "", keywords: [], oracle: "({T}: Add {U}.)" };
const BLAZE = { name: "Blaze", type: "Sorcery", mana: "{X}{R}", keywords: [], oracle: "Blaze deals X damage to any target." };
const VISION = { name: "Ancestral Vision", type: "Sorcery", mana: "", keywords: ["Suspend"],
  oracle: "Suspend 4—{U} (Rather than cast this card from your hand, pay {U} and exile it with four time counters on it. At the beginning of your upkeep, remove a time counter. When the last is removed, you may cast it without paying its mana cost.)\nTarget player draws three cards." };
const WASTES = { name: "Wastes", type: "Basic Land", mana: "", keywords: [], oracle: "({T}: Add {C}.)" };

function table({ top, source = FBLTHP, active = "user", mana = { U: 3, R: 3 } } = {}) {
  const g = createGameState({ userDeck: [], aiDeck: [] });
  const library = [...(top ? [{ ...top, id: "top" }] : []), ...[0, 1, 2, 3].map((i) => ({ ...WASTES, id: `w${i}` }))];
  return { ...g, turn: 5, activePlayer: active, priorityHolder: "user", consecutivePasses: 0, phase: "precombat-main", step: "main", stack: [], pendingTriggers: [],
    players: { ...g.players, user: { ...g.players.user, library, manaPool: { ...g.players.user.manaPool, ...mana },
      battlefield: source ? [createPermanent({ id: "F", card: { ...source, id: "c-f" }, controller: "user", summoningSick: false })] : [] } } };
}
const plots = (s) => legalActionsForPlayer(s, "user").filter((a) => a.kind === "plot");
const freeFromExile = (s) => legalActionsForPlayer(s, "user").filter((a) => a.kind === "cast-spell" && a.fromZone === "exile" && a.freeCast).map((a) => a.cardId);

describe("the card", () => {
  it("reads native-static; its three sentences are the three plot-from-top markers", () => {
    expect({ tier: classifyCard(FBLTHP), markers: parseStaticAbilities(FBLTHP).filter((d) => !d.inertInfo) })
      .toEqual({ tier: "native-static", markers: [{ topCardHasPlot: true }, { plotCostIsManaCost: true }, { plotNonlandFromTop: true }] });
  });

  it("fence (synthetic): the permission sentence alone grants nothing at runtime", () => {
    const lone = { name: "X", type: "Creature — Homunculus", mana: "{1}", power: "1", toughness: "1", keywords: [], oracle: "You may plot nonland cards from the top of your library." };
    expect(plots(table({ top: DIVINATION, source: lone }))).toEqual([]);
  });
});

describe("in play", () => {
  it("plots the top Divination for its mana cost, keeps the library under it, and casts it free next turn — not this one (WITNESS)", () => {
    let s = table({ top: DIVINATION });
    const offer = plots(s);
    s = dispatchAction(s, offer[0]);
    const plotted = s.players.user.exile.find((c) => c.id === "top");
    const sameTurn = freeFromExile(s);
    let next = { ...s, turn: s.turn + 1, players: { ...s.players, user: { ...s.players.user, manaPool: { ...s.players.user.manaPool, U: 0, R: 0 } } } };
    const nextTurn = freeFromExile(next);
    const handBefore = next.players.user.hand.length;
    next = dispatchAction(next, legalActionsForPlayer(next, "user").find((a) => a.kind === "cast-spell" && a.cardId === "top" && a.freeCast));
    while (next.stack.length) next = resolveTopOfStack(next);
    const witness = {
      offer: offer.map((a) => ({ card: a.cardId, from: a.fromZone, cost: `${a.cost.generic}+U${a.cost.U}` })),
      plotted: { plotted: !!plotted?._plotted, turn: plotted?._plottedTurn ?? null },
      library: s.players.user.library.map((c) => c.id), poolU: s.players.user.manaPool.U,
      sameTurn, nextTurn, drew: next.players.user.hand.length - handBefore, graveyard: next.players.user.graveyard.map((c) => c.id),
    };
    console.log(`WITNESS fblthp ${JSON.stringify(witness)}`);
    expect(witness).toEqual({
      offer: [{ card: "top", from: "library", cost: "2+U1" }], plotted: { plotted: true, turn: 5 },
      library: ["w0", "w1", "w2", "w3"], poolU: 0, sameTurn: [], nextTurn: ["top"], drew: 2, graveyard: ["top"],
    });
  });

  it("is not offered for a land on top, without Fblthp, on an opponent's turn, or for an {X} or costless top card", () => {
    expect({
      land: plots(table({ top: ISLAND })),
      noFblthp: plots(table({ top: DIVINATION, source: null })),
      opponentsTurn: plots(table({ top: DIVINATION, active: "ai" })),
      xCost: plots(table({ top: BLAZE })),
      noManaCost: plots(table({ top: VISION })),
    }).toEqual({ land: [], noFblthp: [], opponentsTurn: [], xCost: [], noManaCost: [] });
  });

  it("only the TOP card: the dispatcher refuses a plot aimed below it", () => {
    const s = table({ top: DIVINATION });
    expect(() => dispatchAction(s, { ...plots(s)[0], cardId: "w0" })).toThrow(/top of the library/);
  });
});

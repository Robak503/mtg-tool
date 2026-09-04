/**
 * docAurlock.test.js — SHELF-85 runbook Phase 2 · K9 (2026-09-04): Doc Aurlock, Grizzled Genius (Kellan).
 *
 *   "Spells you cast from your graveyard or from exile cost {2} less to cast.
 *    Plotting cards from your hand costs {2} less."
 *
 * Two markers on the Savvy Trader seam: a zone-keyed reducer with an EXPLICIT zone list (a cast from the library's top —
 * the Future Sight lane — is not in it and is not reduced), and a plot-cost marker the plot special action reads at the
 * OFFER (the dispatcher pays the action's carried cost, so the reduction is honoured at dispatch too). The plot marker is
 * never a spell reducer: costReductionForSpell skips it.
 *
 * Real oracle fixture (bundled Scryfall snapshot, verified in-session 2026-09-04).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { parseStaticAbilities, costReductionForSpell } from "./staticAbilityParser.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { classifyCard } from "./coverage.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const DOC = { id: "c-doc", name: "Doc Aurlock, Grizzled Genius", type: "Legendary Creature — Bear Druid", mana: "{G}{U}", keywords: [], power: 3, toughness: 4,
  oracle: "Spells you cast from your graveyard or from exile cost {2} less to cast.\nPlotting cards from your hand costs {2} less." };
const LOCK = { id: "c-ll", name: "Lock and Load", type: "Sorcery", mana: "{2}{U}", keywords: ["Plot"],
  oracle: "Draw a card, then draw a card for each other instant and sorcery spell you've cast this turn.\nPlot {3}{U} (You may pay {3}{U} and exile this card from your hand. Cast it as a sorcery on a later turn without paying its mana cost. Plot only as a sorcery.)" };
const BEAR = { id: "c-bear", name: "Grizzly Bears", type: "Creature — Bear", mana: "{1}{G}", oracle: "", power: 2, toughness: 2 };
const island = (id) => createPermanent({ id, card: { id: "card-" + id, name: "Island", type: "Basic Land — Island", oracle: "({T}: Add {U}.)" }, controller: "user" });

const board = ({ hand = [], exile = [], lands = 1, withDoc = true }) => {
  let s = createGameState({ userDeck: [], aiDeck: [] });
  const bf = Array.from({ length: lands }, (_, i) => island("I" + i));
  if (withDoc) bf.push(createPermanent({ id: "D", card: DOC, controller: "user" }));
  return { ...s, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0, turn: 5,
    players: { ...s.players, user: { ...s.players.user, hand, exile, battlefield: bf, landsPlayedThisTurn: 0 } } };
};

describe("parse", () => {
  it("two markers: the named-zone reducer and the plot-cost reducer", () => {
    expect(parseStaticAbilities(DOC)).toEqual([
      { costReduction: { castFromZones: ["graveyard", "exile"], amount: 2 } },
      { costReduction: { plot: true, amount: 2 } },
    ]);
  });
  it("the reader honours the zone list verbatim; the plot marker never touches a cast", () => {
    const red = parseStaticAbilities(DOC).map((d) => d.costReduction);
    expect(costReductionForSpell(red, BEAR, "exile")).toBe(2);
    expect(costReductionForSpell(red, BEAR, "graveyard")).toBe(2);
    expect(costReductionForSpell(red, BEAR, "library")).toBe(0);
    expect(costReductionForSpell(red, BEAR, "hand")).toBe(0);
    expect(costReductionForSpell(red, BEAR)).toBe(0);
    expect(costReductionForSpell([{ plot: true, amount: 2 }], BEAR, "exile")).toBe(0);
  });
});

describe("runtime — the plot offer", () => {
  it("Lock and Load's Plot {3}{U} is offered off TWO Islands only while Doc is out, at a carried cost of {1}{U}", () => {
    const withDoc = legalActionsForPlayer(board({ hand: [LOCK], lands: 2 }), "user").find((a) => a.kind === "plot" && a.cardId === "c-ll");
    expect(withDoc).toBeTruthy();
    expect(withDoc.cost.generic).toBe(1);
    expect(withDoc.cmc).toBe(2);
    const without = legalActionsForPlayer(board({ hand: [LOCK], lands: 2, withDoc: false }), "user").find((a) => a.kind === "plot" && a.cardId === "c-ll");
    expect(without).toBeUndefined();
    const withoutFour = legalActionsForPlayer(board({ hand: [LOCK], lands: 4, withDoc: false }), "user").find((a) => a.kind === "plot" && a.cardId === "c-ll");
    expect(withoutFour?.cost.generic).toBe(3);
  });
  it("the reduction is honoured at dispatch: the plot resolves off two Islands and the card sits plotted in exile", () => {
    let s = board({ hand: [LOCK], lands: 2 });
    const act = legalActionsForPlayer(s, "user").find((a) => a.kind === "plot" && a.cardId === "c-ll");
    expect(act).toBeTruthy();
    s = dispatchAction(s, act);
    expect(s.players.user.exile.some((c) => c.id === "c-ll" && c._plotted)).toBe(true);
    expect(s.players.user.hand.some((c) => c.id === "c-ll")).toBe(false);
  });
});

describe("runtime — the named-zone reducer at the cast offer", () => {
  it("a Bear playable from exile casts for {G} off one land only while Doc is out", () => {
    const exiledBear = { ...BEAR, _impulse: true, _impulseExtended: true, _impulseOwner: "user", _impulseTurn: 1 };
    const forest = createPermanent({ id: "F", card: { id: "card-F", name: "Forest", type: "Basic Land — Forest", oracle: "({T}: Add {G}.)" }, controller: "user" });
    const mk = (withDoc) => { const s = board({ exile: [exiledBear], lands: 0, withDoc }); return { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [...s.players.user.battlefield, forest] } } }; };
    expect(legalActionsForPlayer(mk(true), "user").some((a) => a.kind === "cast-spell" && a.cardId === "c-bear")).toBe(true);
    expect(legalActionsForPlayer(mk(false), "user").some((a) => a.kind === "cast-spell" && a.cardId === "c-bear")).toBe(false);
  });
});

describe("classifier", () => {
  it("Doc Aurlock is native-static", () => {
    expect(classifyCard(DOC)).toBe("native-static");
  });
});

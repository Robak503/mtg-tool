/**
 * makeYourOwnLuck.test.js — SHELF-85 runbook Phase 2 · K7 (2026-09-04): Make Your Own Luck (Kellan).
 *
 *   "Look at the top three cards of your library. You may exile a nonland card from among them. If you do, it becomes
 *    plotted. Put the rest into your hand."
 *
 * The impulse-dig pause with a PLOT destination and a HAND rest: the pick leaves the library for exile carrying the plot
 * stamp the plot special action writes (`_plotted` + `_plottedTurn`, CR 702.171b — castable free on a LATER turn), the
 * rest join the hand; declining sends all three to hand. The pool is nonland only, a local type-line test (the
 * tutor-filter vocabulary refuses "nonland" on purpose).
 *
 * Real oracle fixture (bundled Scryfall snapshot, verified in-session 2026-09-04).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { parseEffectClause, programConfidence } from "./effects/parser.js";
import { resolveImpulseDigChoice } from "./effects/runProgram.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { classifyCard } from "./coverage.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const LUCK = { id: "c-luck", name: "Make Your Own Luck", type: "Sorcery", mana: "{3}{G}{U}", keywords: [],
  oracle: "Look at the top three cards of your library. You may exile a nonland card from among them. If you do, it becomes plotted. Put the rest into your hand. (You may cast it as a sorcery on a later turn without paying its mana cost.)" };
const BEAR = { id: "c-bear", name: "Grizzly Bears", type: "Creature — Bear", mana: "{1}{G}", oracle: "", power: 2, toughness: 2 };
const ISLAND_CARD = { id: "c-isl", name: "Island", type: "Basic Land — Island", oracle: "({T}: Add {U}.)" };
const BOLT = { id: "c-bolt", name: "Lightning Bolt", type: "Instant", mana: "{R}", oracle: "Lightning Bolt deals 3 damage to any target." };
const filler = (id) => ({ id, name: "Filler " + id, type: "Creature — Bear", oracle: "", power: 1, toughness: 1 });
const land = (id, ctrl = "user") => createPermanent({ id, card: { id: "card-" + id, name: "Forest", type: "Basic Land — Forest", oracle: "({T}: Add {G}.)" }, controller: ctrl });

const board = (top) => {
  let s = createGameState({ userDeck: [], aiDeck: [filler("a1"), filler("a2")] });
  const lands = ["L1", "L2", "L3", "L4"].map((id) => land(id));
  const island = createPermanent({ id: "L5", card: { id: "card-L5", name: "Island", type: "Basic Land — Island", oracle: "({T}: Add {U}.)" }, controller: "user" });
  return { ...s, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0, turn: 6,
    players: { ...s.players, user: { ...s.players.user, hand: [LUCK], library: [...top, filler("x1"), filler("x2")], battlefield: [...lands, island] } } };
};
const castLuck = (s) => {
  const act = legalActionsForPlayer(s, "user").find((a) => a.kind === "cast-spell" && a.cardId === "c-luck");
  expect(act).toBeTruthy();
  s = dispatchAction(s, act);
  while (s.stack.length && !s.pendingChoice) s = resolveTopOfStack(s);
  return s;
};

describe("parse", () => {
  it("one impulse-dig atom: look 3, keep 1 to plot-exile, the rest to hand, a nonland pool", () => {
    const r = parseEffectClause(LUCK.oracle, "Sorcery");
    expect(programConfidence(r)).toBe("high");
    expect(r.atoms).toEqual([{ op: "impulse-dig", amount: 3, keep: 1, restTo: "hand", chosenTo: "plotExile", filter: { nonland: true } }]);
    expect(programConfidence(parseEffectClause("Look at the top three cards of your library. You may exile a card from among them. If you do, it becomes plotted. Put the rest into your hand.", "Sorcery"))).toBe("low");
  });
});

describe("runtime", () => {
  it("the pause offers only the NONLAND cards; a pick is plotted in exile and the rest join the hand", () => {
    let s = castLuck(board([BEAR, ISLAND_CARD, BOLT]));
    expect(s.pendingChoice?.kind).toBe("impulse-dig");
    expect(s.pendingChoice.candidates.map((c) => c.id).sort()).toEqual(["c-bear", "c-bolt"]);
    expect(s.pendingChoice.chosenTo).toBe("plotExile");
    s = resolveImpulseDigChoice(s, "c-bear");
    expect(s.pendingChoice).toBeFalsy();
    const plotted = s.players.user.exile.find((c) => c.id === "c-bear");
    expect(plotted?._plotted).toBe(true);
    expect(plotted?._plottedTurn).toBe(6);
    expect(s.players.user.hand.map((c) => c.id).sort()).toEqual(["c-bolt", "c-isl"]);
    expect(s.players.user.library.map((c) => c.id)).toEqual(["x1", "x2"]); // nothing went to the bottom
    // A LATER turn: the plotted Bear is offered as a free cast from exile (the plotted-cast lane).
    const later = { ...s, turn: 7 };
    const free = legalActionsForPlayer(later, "user").find((a) => a.kind === "cast-spell" && a.cardId === "c-bear");
    expect(free).toBeTruthy();
    expect(free.fromZone).toBe("exile");
    expect(legalActionsForPlayer(s, "user").some((a) => a.kind === "cast-spell" && a.cardId === "c-bear")).toBe(false); // not THIS turn (CR 702.171b)
  });
  it("declining sends all three to hand; an all-land top never pauses and goes straight to hand", () => {
    let s = castLuck(board([BEAR, ISLAND_CARD, BOLT]));
    s = resolveImpulseDigChoice(s, null);
    expect(s.players.user.hand.map((c) => c.id).sort()).toEqual(["c-bear", "c-bolt", "c-isl"]);
    expect(s.players.user.exile.some((c) => c._plotted)).toBe(false);
    const t = castLuck(board([ISLAND_CARD, { ...ISLAND_CARD, id: "c-isl2" }, { ...ISLAND_CARD, id: "c-isl3" }]));
    expect(t.pendingChoice).toBeFalsy();
    expect(t.players.user.hand.map((c) => c.id).sort()).toEqual(["c-isl", "c-isl2", "c-isl3"]);
  });
});

describe("classifier", () => {
  it("Make Your Own Luck is a native spell", () => {
    expect(classifyCard(LUCK)).toBe("native-spell");
  });
});

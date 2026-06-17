/**
 * Scry / surveil (CR 701.18 / 701.43) — peek the top N of your library and reorder: keep any on
 * top (in any order), put the rest on the bottom (scry) or into your graveyard (surveil). A
 * resolution-time interactive choice (pendingChoice "scry-surveil"). Covers: the parser, the
 * library reorder (keep-all / keep-none / keep-subset-reordered), surveil → graveyard, the empty-
 * library no-op, and multi-clause resume ("Surveil 1. Draw a card.").
 */

import { describe, it, expect, beforeEach } from "vitest";
import { createGameState, _resetIdsForTests } from "./gameState.js";
import { legalActionsForPlayer, filterActions } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { resolveScryChoice } from "./effects/runProgram.js";
import { parseEffectProgram, programConfidence, programNeedsChosenTarget } from "./effects/parser.js";

beforeEach(() => _resetIdsForTests());

const I = (oracle) => ({ type: "Instant", oracle });
const SCRY2 = { id: "c-scry", name: "Scry Card", type: "Instant", mana: "{U}", oracle: "Scry 2." };
const SURVEIL_DRAW = { id: "c-sd", name: "Surveil Draw", type: "Instant", mana: "{U}", oracle: "Surveil 1.\nDraw a card." };
const lib = (...names) => names.map((n) => ({ id: n.toLowerCase(), name: n, type: "Sorcery", oracle: "" }));

function boardState({ hand = [], library = [], pool = { C: 6, U: 3 } } = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...s, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
    players: { ...s.players, user: { ...s.players.user, hand, library, manaPool: { ...s.players.user.manaPool, ...pool } } },
  };
}
const castToChoice = (s, cardId) => {
  const cast = filterActions(legalActionsForPlayer(s, "user"), "cast-spell").find((a) => a.cardId === cardId);
  expect(cast).toBeTruthy();
  expect(cast.needsTargets).toBeFalsy(); // scry/surveil take no chosen target
  return resolveTopOfStack(dispatchAction(s, cast));
};
const libIds = (s) => s.players.user.library.map((c) => c.id);

describe("parser — numeric scry/surveil are HIGH + non-targeted; variable/modal stay low", () => {
  it("Scry N / Surveil N parse to the right atoms", () => {
    expect(parseEffectProgram(I("Scry 2.")).atoms).toEqual([{ op: "scry", amount: 2, targetType: null }]);
    expect(parseEffectProgram(I("Surveil 1.")).atoms).toEqual([{ op: "surveil", amount: 1, targetType: null }]);
    expect(programNeedsChosenTarget(parseEffectProgram(I("Scry 2.")))).toBe(false);
    expect(programConfidence(parseEffectProgram(I("Scry X.")))).toBe("low"); // variable amount deferred
  });
});

describe("scry resolution — keep/move reorders the top of the library", () => {
  it("casting Scry 2 surfaces a scry-surveil choice over the top 2 cards", () => {
    let s = boardState({ hand: [SCRY2], library: lib("A", "B", "C", "D") });
    s = castToChoice(s, "c-scry");
    expect(s.pendingChoice).toMatchObject({ kind: "scry-surveil", mode: "scry", controller: "user" });
    expect(s.pendingChoice.cards.map((c) => c.id)).toEqual(["a", "b"]);
  });

  it("keep all → library unchanged; keep none → top 2 to the bottom; keep one reordered", () => {
    const base = boardState({ hand: [SCRY2], library: lib("A", "B", "C", "D") });
    expect(libIds(resolveScryChoice(castToChoice(base, "c-scry"), ["a", "b"]))).toEqual(["a", "b", "c", "d"]); // keep both
    expect(libIds(resolveScryChoice(castToChoice(base, "c-scry"), []))).toEqual(["c", "d", "a", "b"]);         // both to bottom
    expect(libIds(resolveScryChoice(castToChoice(base, "c-scry"), ["b"]))).toEqual(["b", "c", "d", "a"]);      // keep B, A to bottom
    expect(libIds(resolveScryChoice(castToChoice(base, "c-scry"), ["b", "a"]))).toEqual(["b", "a", "c", "d"]); // reorder both
  });
});

describe("surveil resolution — moved cards go to the graveyard, and the program resumes", () => {
  it("Surveil 1 → keep none bins the top card; then 'Draw a card' resumes and draws", () => {
    let s = boardState({ hand: [SURVEIL_DRAW], library: lib("A", "B", "C") });
    s = castToChoice(s, "c-sd");
    expect(s.pendingChoice).toMatchObject({ kind: "scry-surveil", mode: "surveil" });
    s = resolveScryChoice(s, []); // bin A
    expect(s.players.user.graveyard.map((c) => c.id)).toEqual(["a"]);
    // The suspended "Draw a card" resumed → B drawn; library now [C].
    expect(s.players.user.hand.some((c) => c.id === "b")).toBe(true);
    expect(libIds(s)).toEqual(["c"]);
    expect(s.pendingChoice).toBeUndefined();
  });

  it("Surveil 1 → keep the card leaves it on top; draw then takes it", () => {
    let s = boardState({ hand: [SURVEIL_DRAW], library: lib("A", "B", "C") });
    s = castToChoice(s, "c-sd");
    s = resolveScryChoice(s, ["a"]); // keep A on top
    expect(s.players.user.graveyard).toHaveLength(0);
    expect(s.players.user.hand.some((c) => c.id === "a")).toBe(true); // drew the kept A
    expect(libIds(s)).toEqual(["b", "c"]);
  });
});

describe("review fixes — eliminated controller + duplicate keep-ids", () => {
  it("a controller eliminated mid-scry → clean no-op, pendingChoice cleared (no throw, no soft-lock)", () => {
    let s = createGameState({ userDeck: [], aiDeck: [] });
    s = { ...s, pendingChoice: { kind: "scry-surveil", controller: "ai", mode: "scry", cards: [{ id: "x", name: "X" }], resume: null } };
    const { ai: _gone, ...players } = s.players; // the controller was removed (eliminated)
    s = { ...s, players };
    let next;
    expect(() => { next = resolveScryChoice(s, ["x"]); }).not.toThrow();
    expect(next.pendingChoice).toBeUndefined(); // cleared → the driver advances, never wedges
  });

  it("a duplicate keep-id reorders correctly (the library mutation dedups)", () => {
    let s = boardState({ hand: [SCRY2], library: lib("A", "B", "C", "D") });
    s = castToChoice(s, "c-scry");
    s = resolveScryChoice(s, ["a", "a"]); // duplicate of A
    expect(libIds(s)).toEqual(["a", "c", "d", "b"]); // A kept on top once, B to the bottom
  });
});

describe("edge — scry of a (nearly) empty library is a clean no-op", () => {
  it("Scry 2 with 1 card looks at just that card; with 0 cards does nothing", () => {
    let s = boardState({ hand: [SCRY2], library: lib("A") });
    s = castToChoice(s, "c-scry");
    expect(s.pendingChoice.cards.map((c) => c.id)).toEqual(["a"]);
    s = boardState({ hand: [SCRY2], library: [] });
    s = castToChoice(s, "c-scry");
    expect(s.pendingChoice).toBeUndefined(); // empty library → no choice, no throw
  });
});

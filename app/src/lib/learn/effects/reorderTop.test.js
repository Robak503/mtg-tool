/**
 * reorderTop.test.js — REORDER-TOP (Ponder) — "Look at the top N cards of your library, then put them back in
 * any order. You may shuffle." A DISTINCT dig from scry/impulse-dig: EVERY looked-at card is put BACK on top in
 * a chosen order (none go to hand, none are bottomed), with an OPTIONAL shuffle, then any trailing effect
 * (Ponder's "Draw a card.") resumes. Reuses the scry-surveil pause→reorder→resume seam narrowed to reorder mode.
 *
 * Pins: the exact-template ALLOWLIST (variable-X / reveal-not-look / on-the-bottom disposition stay low →
 * Arbiter), the collapsed rider draw, the classify flip to native-spell, the resolution-time reorder (all N
 * stay on top, caller order honored + omitted cards appended, NOTHING bottomed), the optional shuffle (opt-in
 * shuffles, decline keeps the order), the "Draw a card" resume, the empty-library no-op, and the CREED near-miss.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createGameState, _resetIdsForTests } from "../gameState.js";
import { legalActionsForPlayer, filterActions } from "../legalChoices.js";
import { dispatchAction } from "../actionDispatcher.js";
import { resolveTopOfStack } from "../gameEngine.js";
import { resolveScryChoice } from "./runProgram.js";
import { parseEffectProgram, programConfidence } from "./parser.js";
import { classifyCard } from "../coverage.js";

beforeEach(() => _resetIdsForTests());

const SORCERY = "Sorcery";
const PONDER = { id: "c-ponder", name: "Ponder", type: SORCERY, mana: "{U}", oracle: "Look at the top three cards of your library, then put them back in any order. You may shuffle.\nDraw a card." };
const lib = (...names) => names.map((n) => ({ id: n.toLowerCase(), name: n, type: SORCERY, oracle: "" }));

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
  expect(cast.needsTargets).toBeFalsy(); // reorder-top takes no chosen target
  return resolveTopOfStack(dispatchAction(s, cast));
};
const libIds = (s) => s.players.user.library.map((c) => c.id);

describe("parser — Ponder's reorder-top is HIGH + non-targeted; the rider draw composes", () => {
  it("parses to [reorder-top(amount 3, mayShuffle), draw]", () => {
    const p = parseEffectProgram(PONDER);
    expect(programConfidence(p)).toBe("high");
    expect(p.atoms).toEqual([
      { op: "reorder-top", amount: 3, mayShuffle: true },
      { op: "draw", amount: 1, targetType: null },
    ]);
  });
  it("a bare reorder (no shuffle, no draw) parses to a single reorder-top atom, mayShuffle false", () => {
    expect(parseEffectProgram({ type: SORCERY, oracle: "Look at the top three cards of your library, then put them back in any order." }).atoms)
      .toEqual([{ op: "reorder-top", amount: 3, mayShuffle: false }]);
  });
});

describe("coverage — Ponder is native-spell; CREED near-misses stay arbiter-spell", () => {
  it("Ponder classifies native-spell", () => {
    expect(classifyCard(PONDER)).toBe("native-spell");
  });
  it("variable-X count / reveal-not-look / on-the-bottom disposition all stay arbiter-spell (FN-safe)", () => {
    const arb = (oracle) => expect(classifyCard({ type: SORCERY, name: "NM", oracle })).toBe("arbiter-spell");
    arb("Look at the top X cards of your library, then put them back in any order. You may shuffle.\nDraw a card."); // variable X — the reorder count isn't fixed
    arb("Reveal the top three cards of your library, then put them back in any order.\nDraw a card.");              // reveal, not look
    arb("Look at the top three cards of your library, then put them on the bottom in any order.\nDraw a card.");    // bottom disposition, not "put them back"
  });
});

describe("resolution — reorder all N on top (nothing bottomed), optional shuffle, then draw resumes", () => {
  it("casting Ponder surfaces a scry-surveil choice (reorder mode) over the top 3", () => {
    let s = boardState({ hand: [PONDER], library: lib("A", "B", "C", "D", "E") });
    s = castToChoice(s, "c-ponder");
    expect(s.pendingChoice).toMatchObject({ kind: "scry-surveil", mode: "scry", controller: "user", reorder: true, mayShuffle: true });
    expect(s.pendingChoice.cards.map((c) => c.id)).toEqual(["a", "b", "c"]);
  });

  it("a chosen order puts ALL three back on top in that order — nothing bottomed — then draws the new top", () => {
    let s = boardState({ hand: [PONDER], library: lib("A", "B", "C", "D", "E") });
    s = castToChoice(s, "c-ponder");
    // Reorder top three as C, A, B (declining the shuffle). D, E untouched below.
    s = resolveScryChoice(s, ["c", "a", "b"], { shuffle: false });
    // The "Draw a card." rider resumes → draws the NEW top (c). Library then [a, b, d, e].
    expect(s.players.user.hand.map((x) => x.id)).toContain("c");
    expect(libIds(s)).toEqual(["a", "b", "d", "e"]); // reordered A,B remain on top; D,E untouched — none bottomed
    expect(s.pendingChoice).toBeUndefined();
  });

  it("a PARTIAL keep-list is completed to the full looked-at set — omitted cards stay on top, never bottomed", () => {
    let s = boardState({ hand: [PONDER], library: lib("A", "B", "C", "D") });
    s = castToChoice(s, "c-ponder");
    // Name only B; A and C are appended in library order (both stay on top). Draw takes the new top (b).
    s = resolveScryChoice(s, ["b"], { shuffle: false });
    expect(s.players.user.hand.map((x) => x.id)).toContain("b");
    expect(libIds(s)).toEqual(["a", "c", "d"]); // B drawn; A,C (appended) + D remain — NOTHING bottomed
  });

  it("the auto/deterministic path (keep-all-in-order, no shuffle) is a pure reorder-noop then draw", () => {
    let s = boardState({ hand: [PONDER], library: lib("A", "B", "C", "D") });
    s = castToChoice(s, "c-ponder");
    // The driver's auto-settle passes all ids in library order, no shuffle (see learnSession scry branch).
    s = resolveScryChoice(s, (s.pendingChoice.cards || []).map((c) => c.id));
    expect(s.players.user.hand.map((x) => x.id)).toContain("a"); // top unchanged → A drawn
    expect(libIds(s)).toEqual(["b", "c", "d"]);
  });

  it("the OPTIONAL shuffle, when opted in, randomizes the library (deterministic seed) before the draw", () => {
    let s = boardState({ hand: [PONDER], library: lib("A", "B", "C", "D", "E", "F", "G") });
    s = castToChoice(s, "c-ponder");
    const before = libIds(s);
    s = resolveScryChoice(s, ["a", "b", "c"], { shuffle: true });
    // A card was drawn (hand grew) and the remaining library order differs from the deliberate reorder (shuffled).
    expect(s.players.user.hand.some((x) => before.includes(x.id))).toBe(true);
    expect(libIds(s)).not.toEqual(["b", "c", "d", "e", "f", "g"]); // not the un-shuffled reorder tail
    expect(libIds(s).length).toBe(6); // 7 looked-at/library − 1 drawn
  });

  it("declining the shuffle preserves the deliberate ordering (mayShuffle honored only on opt-in)", () => {
    let s = boardState({ hand: [PONDER], library: lib("A", "B", "C", "D") });
    s = castToChoice(s, "c-ponder");
    s = resolveScryChoice(s, ["a", "b", "c"], { shuffle: false });
    expect(libIds(s)).toEqual(["b", "c", "d"]); // A drawn, deliberate order intact — no shuffle
  });

  it("empty library → a clean no-op (no pause); the draw rider also draws nothing", () => {
    let s = boardState({ hand: [PONDER], library: [] });
    s = castToChoice(s, "c-ponder");
    expect(s.pendingChoice).toBeUndefined(); // empty library → no reorder choice, no throw
    expect(s.players.user.hand.map((x) => x.id)).not.toContain("a");
  });

  it("fewer cards than N: looks at the whole (small) library, reorders it, no throw", () => {
    let s = boardState({ hand: [PONDER], library: lib("A", "B") });
    s = castToChoice(s, "c-ponder");
    expect(s.pendingChoice.cards.map((c) => c.id)).toEqual(["a", "b"]); // only 2 looked at
    s = resolveScryChoice(s, ["b", "a"], { shuffle: false });
    expect(s.players.user.hand.map((x) => x.id)).toContain("b"); // reordered top (b) drawn
    expect(libIds(s)).toEqual(["a"]);
  });

  it("an eliminated controller mid-pause is a clean no-op (no throw, no resume)", () => {
    let s = boardState({ hand: [PONDER], library: lib("A", "B", "C") });
    s = castToChoice(s, "c-ponder");
    const gone = { ...s, players: Object.fromEntries(Object.entries(s.players).filter(([id]) => id !== "user")) };
    expect(() => resolveScryChoice(gone, ["a", "b", "c"], { shuffle: false })).not.toThrow();
    const next = resolveScryChoice(gone, ["a", "b", "c"], { shuffle: false });
    expect(next.pendingChoice).toBeUndefined(); // cleared → the driver advances, never wedges
  });
});

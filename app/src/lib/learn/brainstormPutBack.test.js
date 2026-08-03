/**
 * brainstormPutBack.test.js — the HAND→LIBRARY-TOP chain (Brainstorm: "Draw three cards, then put
 * two cards from your hand on top of your library in any order.").
 *
 * NOT a discard: the cards go to the library TOP, never the graveyard, and no discard triggers
 * fire. The chain pauses one pick per settle (kind "hand-to-library-top"); each settled card goes
 * on top AT THAT MOMENT, so later picks stack above earlier ones — the player controls the final
 * order pick by pick (CR 401.4). A hand ≤ the printed count is forced back whole with no pause.
 * The wiring contract (driver branch + applyPendingChoice + panel) is enforced by
 * pendingChoiceKinds.test.js the moment the kind exists.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState } from "./gameState.js";
import { legalActionsForPlayer, filterActions } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { parseEffectProgram, programConfidence, parseEffectClause } from "./effects/parser.js";
import { resolveHandToLibraryTopChoice, autoPickHandToLibraryTopCandidate } from "./effects/runProgram.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

// Real printed oracle (bundled Scryfall, pulled 2026-08-02).
const BRAINSTORM = { name: "Brainstorm", type: "Instant", mana: "{U}",
  oracle: "Draw three cards, then put two cards from your hand on top of your library in any order." };

const lc = (id, name, cmc = 2) => ({ id, name, type: "Sorcery", mana: `{${cmc}}`, cmc, oracle: "" });

function setup({ hand = [], lib = [], mana = {} }) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return { ...s, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main",
    players: { ...s.players,
      user: { ...s.players.user, hand, library: lib, battlefield: [], manaPool: { ...s.players.user.manaPool, ...mana } } } };
}

describe("HAND→LIBRARY-TOP — parser + classification", () => {
  it("Brainstorm parses HIGH: draw 3 then put-back 2", () => {
    const p = parseEffectProgram(BRAINSTORM);
    expect(programConfidence(p)).toBe("high");
    expect(p.atoms[0]).toMatchObject({ op: "draw", amount: 3 });
    expect(p.atoms[1]).toMatchObject({ op: "hand-to-library-top", amount: 2 });
    expect(classifyCard(BRAINSTORM)).toBe("native-spell");
  });
  it("CREED — a different destination or owner fails the anchor", () => {
    expect(programConfidence(parseEffectClause("put two cards from your hand on the bottom of your library", "Instant"))).toBe("low");
    expect(programConfidence(parseEffectClause("put two cards from your hand on top of its owner's library", "Instant"))).toBe("low");
  });
});

describe("HAND→LIBRARY-TOP — the live cast chain", () => {
  it("⭐ Brainstorm end to end: draw 3, pick 2 back — later pick on top, nothing in the graveyard", () => {
    let s = setup({
      hand: [{ ...BRAINSTORM, id: "bs" }],
      lib: [lc("L1", "Alpha", 1), lc("L2", "Beta", 2), lc("L3", "Gamma", 3), lc("L4", "Delta", 4)],
      mana: { U: 1 },
    });
    const cast = filterActions(legalActionsForPlayer(s, "user"), "cast-spell").find((a) => a.cardId === "bs");
    expect(cast).toBeTruthy();
    s = dispatchAction(s, cast);
    let g = 0;
    while ((s.stack || []).length && !s.pendingChoice && g++ < 10) s = resolveTopOfStack(s);
    // Drew Alpha/Beta/Gamma; the chain pauses with the full 3-card hand offered.
    expect(s.pendingChoice).toMatchObject({ kind: "hand-to-library-top", remaining: 2, controller: "user" });
    expect(s.pendingChoice.candidates.map((c) => c.name).sort()).toEqual(["Alpha", "Beta", "Gamma"]);
    // Put back Alpha first, then Beta — Beta (the LATER pick) must end on top.
    s = resolveHandToLibraryTopChoice(s, "L1");
    expect(s.pendingChoice).toMatchObject({ kind: "hand-to-library-top", remaining: 1 });
    s = resolveHandToLibraryTopChoice(s, "L2");
    expect(s.pendingChoice).toBeFalsy();
    expect(s.players.user.hand.map((c) => c.name)).toEqual(["Gamma"]);        // kept one
    expect(s.players.user.library.slice(0, 3).map((c) => c.name)).toEqual(["Beta", "Alpha", "Delta"]);
    expect(s.players.user.graveyard.map((c) => c.name)).toEqual(["Brainstorm"]); // ONLY the spell — no card was discarded
  });

  it("a hand ≤ the count is forced back whole — no pause", () => {
    let s = setup({
      hand: [{ ...BRAINSTORM, id: "bs" }],
      lib: [lc("L1", "Alpha", 1), lc("L2", "Beta", 2)],  // draws only 2 → hand of 2 ≤ put-back 2
      mana: { U: 1 },
    });
    const cast = filterActions(legalActionsForPlayer(s, "user"), "cast-spell").find((a) => a.cardId === "bs");
    s = dispatchAction(s, cast);
    let g = 0;
    while ((s.stack || []).length && !s.pendingChoice && g++ < 10) s = resolveTopOfStack(s);
    expect(s.pendingChoice).toBeFalsy();                                     // forced — no decision existed
    expect(s.players.user.hand).toEqual([]);
    expect(s.players.user.library.map((c) => c.name)).toEqual(["Beta", "Alpha"]);
  });

  it("the auto-pick returns the HIGHEST-mana-value card (deterministic tie-break)", () => {
    const s = setup({ hand: [lc("h1", "Cheap", 1), lc("h2", "Bomb", 6), lc("h3", "Mid", 3)], lib: [] });
    const pick = autoPickHandToLibraryTopCandidate(s, { controller: "user", candidates: [{ id: "h1" }, { id: "h2" }, { id: "h3" }] });
    expect(pick).toBe("h2");
  });
});

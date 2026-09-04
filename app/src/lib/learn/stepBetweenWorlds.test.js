/**
 * stepBetweenWorlds.test.js — SHELF-85 runbook Phase 2 · K9 (2026-09-04): Step Between Worlds (Kellan — the 85th card).
 *
 *   "Each player may shuffle their hand and graveyard into their library. Each player who does draws seven cards.
 *    Exile Step Between Worlds.
 *    Plot {4}{U}{U}"
 *
 * A PER-SEAT "may": a new pause kind (each-player-may) raised seat by seat in APNAP order — the controller first — and
 * settled by resolveEachPlayerMayChoice, which re-raises for the next seat and, after the last, folds only the seats that
 * said yes through the SAME per-player helper the mandatory Timetwister wheel uses. The trailing "Exile Step Between
 * Worlds." is the self-exile strip the Finale precedent handles (the program's selfExile flag). Plot was modeled. The
 * session driver routes the pause to the deciding seat with the same yes/no actions optional-effect uses.
 *
 * Real oracle fixture (bundled Scryfall snapshot, verified in-session 2026-09-04).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { parseEffectProgram, programConfidence } from "./effects/parser.js";
import { resolveEachPlayerMayChoice } from "./effects/runProgram.js";
import { PENDING_CHOICE_KINDS } from "./pendingChoice.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { classifyCard } from "./coverage.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const STEP = { id: "c-sbw", name: "Step Between Worlds", type: "Sorcery", mana: "{3}{U}{U}", keywords: ["Plot"],
  oracle: "Each player may shuffle their hand and graveyard into their library. Each player who does draws seven cards. Exile Step Between Worlds.\nPlot {4}{U}{U} (You may pay {4}{U}{U} and exile this card from your hand. Cast it as a sorcery on a later turn without paying its mana cost. Plot only as a sorcery.)" };
const filler = (id) => ({ id, name: "Filler " + id, type: "Creature — Bear", oracle: "", power: 1, toughness: 1 });
const lib = (n, tag) => Array.from({ length: n }, (_, i) => filler(tag + i));
const island = (id) => createPermanent({ id, card: { id: "card-" + id, name: "Island", type: "Basic Land — Island", oracle: "({T}: Add {U}.)" }, controller: "user" });

const board = () => {
  let s = createGameState({ userDeck: lib(12, "u"), aiDeck: lib(12, "a") });
  return { ...s, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0, turn: 6,
    players: { ...s.players,
      user: { ...s.players.user, hand: [STEP, filler("uh1")], graveyard: [filler("ug1"), filler("ug2")], battlefield: [island("I1"), island("I2"), island("I3"), island("I4"), island("I5")] },
      ai: { ...s.players.ai, hand: [filler("ah1"), filler("ah2"), filler("ah3")], graveyard: [filler("ag1")] } } };
};
const castStep = (s) => {
  const act = legalActionsForPlayer(s, "user").find((a) => a.kind === "cast-spell" && a.cardId === "c-sbw");
  expect(act).toBeTruthy();
  s = dispatchAction(s, act);
  while (s.stack.length && !s.pendingChoice) s = resolveTopOfStack(s);
  return s;
};
const settle = (s) => { while (s.stack.length && !s.pendingChoice) s = resolveTopOfStack(s); return s; };

describe("parse", () => {
  it("the card-level program: one each-player-may-wheel atom with the self-exile flag; the kind is registered", () => {
    // The Plot line comes off before the program is read — the SAME strip the classifier's spell path applies (coverage.js)
    // and the cast lane relies on; the raw two-line oracle is never handed to the accessor whole.
    const plotStripped = STEP.oracle.replace(/(?:^|\n)[^\n]*\bplot\s+(?:\{[^}]+\})+[^\n]*(?=\n|$)/i, "\n");
    const p = parseEffectProgram({ type: STEP.type, oracle: plotStripped, mana: STEP.mana, name: STEP.name });
    expect(programConfidence(p)).toBe("high");
    expect(p.atoms).toEqual([{ op: "each-player-may-wheel", draw: 7, targetType: null }]);
    expect(p.selfExile).toBe(true);
    expect(PENDING_CHOICE_KINDS).toContain("each-player-may");
  });
});

describe("runtime", () => {
  it("the pause asks the controller first, then the opponent; only the yes-seats fold and draw seven; the spell exiles itself", () => {
    let s = castStep(board());
    expect(s.pendingChoice?.kind).toBe("each-player-may");
    expect(s.pendingChoice.controller).toBe("user");
    expect(s.pendingChoice.seatsRemaining).toEqual(["ai"]);
    s = resolveEachPlayerMayChoice(s, true); // the controller says yes
    expect(s.pendingChoice?.kind).toBe("each-player-may");
    expect(s.pendingChoice.controller).toBe("ai");
    expect(s.pendingChoice.accepted).toEqual(["user"]);
    s = settle(resolveEachPlayerMayChoice(s, false)); // the opponent declines
    expect(s.pendingChoice).toBeFalsy();
    // the user folded: 1 hand card + 2 graveyard cards + 12 library = 15 in the library, then drew 7
    expect(s.players.user.hand.length).toBe(7);
    expect(s.players.user.graveyard.some((c) => c.id.startsWith("ug"))).toBe(false);
    expect(s.players.user.library.length).toBe(15 - 7);
    // the opponent kept everything
    expect(s.players.ai.hand.map((c) => c.id)).toEqual(["ah1", "ah2", "ah3"]);
    expect(s.players.ai.graveyard.map((c) => c.id)).toEqual(["ag1"]);
    expect(s.players.ai.library.length).toBe(12);
    // the spell exiled itself
    expect(s.players.user.exile.some((c) => c.id === "c-sbw")).toBe(true);
    expect(s.players.user.graveyard.some((c) => c.id === "c-sbw")).toBe(false);
  });
  it("both decline: nothing moves but the spell", () => {
    let s = castStep(board());
    s = resolveEachPlayerMayChoice(s, false);
    s = settle(resolveEachPlayerMayChoice(s, false));
    expect(s.players.user.hand.map((c) => c.id)).toEqual(["uh1"]);
    expect(s.players.user.graveyard.map((c) => c.id)).toEqual(["ug1", "ug2"]);
    expect(s.players.ai.hand.length).toBe(3);
    expect(s.players.user.exile.some((c) => c.id === "c-sbw")).toBe(true);
  });
  it("both accept: both seats fold and draw seven", () => {
    let s = castStep(board());
    s = resolveEachPlayerMayChoice(s, true);
    s = settle(resolveEachPlayerMayChoice(s, true));
    expect(s.players.user.hand.length).toBe(7);
    expect(s.players.ai.hand.length).toBe(7);
    expect(s.players.ai.graveyard).toEqual([]);
    expect(s.players.ai.library.length).toBe(12 + 3 + 1 - 7);
  });
});

describe("classifier", () => {
  it("Step Between Worlds is a native spell", () => {
    expect(classifyCard(STEP)).toBe("native-spell");
  });
});

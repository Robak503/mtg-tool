/**
 * sylvanLibrary.test.js — SG-15b (2026-09-03): Sylvan Library — "At the beginning of your draw step, you may
 * draw two additional cards. If you do, choose two cards in your hand drawn this turn. For each of those
 * cards, pay 4 life or put the card on top of your library." (the Squirrel Girl deck). One optional atom:
 * runProgram's optional-effect pause owns the "you may"; the applier draws two and raises the per-card
 * pay-or-put-back pause (sylvan-library) for the two cards it drew — read off the drawn-this-turn ledger —
 * one card at a time; the settler chains the second card, then resumes.
 *
 * Real oracle fixture (bundled Scryfall snapshot, read in-session 2026-09-03).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { checkStepTriggers } from "./triggers.js";
import { flushTriggers, resolveTopOfStack } from "./gameEngine.js";
import { resolveOptionalChoice, resolveSylvanLibraryChoice } from "./effects/runProgram.js";
import { parseEffectClause } from "./effects/parser.js";
import { autoPickSylvanLibraryPayment } from "./choicePolicy.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const LIBRARY = { id: "c-syl", name: "Sylvan Library", type: "Enchantment", mana: "{1}{G}", keywords: [], oracle: "At the beginning of your draw step, you may draw two additional cards. If you do, choose two cards in your hand drawn this turn. For each of those cards, pay 4 life or put the card on top of your library." };
const card = (id) => ({ id, name: "Card " + id, type: "Instant", mana: "{U}", oracle: "" });

/** A board at the user's draw step with the turn-draw already taken ("pre" — in hand and on the ledger). */
function board({ life = 20 } = {}) {
  const s0 = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...s0, turn: 4, phase: "beginning", step: "draw", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
    players: {
      ...s0.players,
      user: { ...s0.players.user, life, hand: [card("pre")], drawnThisTurnIds: ["pre"], cardsDrawnThisTurn: 1, library: [card("a"), card("b"), card("c"), card("d")], battlefield: [createPermanent({ id: "syl", card: LIBRARY, controller: "user", summoningSick: false })] },
    },
  };
}
/** Fire the draw-step trigger and resolve it up to the optional pause. */
function toOptionalPause(s) {
  const out = resolveTopOfStack(flushTriggers(checkStepTriggers(s, "draw")));
  expect(out.pendingChoice?.kind).toBe("optional-effect");
  return out;
}

describe("the parse", () => {
  it("collapses the three sentences to one optional atom", () => {
    const p = parseEffectClause("you may draw two additional cards. If you do, choose two cards in your hand drawn this turn. For each of those cards, pay 4 life or put the card on top of your library.", "Instant");
    expect(p.confidence).toBe("high");
    expect(p.atoms).toEqual([{ op: "sylvan-library", optional: true, draw: 2, choose: 2, life: 4, targetType: null }]);
  });
});

describe("runtime — the full chain", () => {
  it("⭐ take the draw → the two NEW cards are the choices (never the turn-draw); pay for the first, put the second back on top", () => {
    const s = toOptionalPause(board());
    const drew = resolveOptionalChoice(s, true);
    expect(drew.players.user.hand.map((c) => c.id)).toEqual(["pre", "a", "b"]);
    expect(drew.pendingChoice?.kind).toBe("sylvan-library");
    expect(drew.pendingChoice.cardId).toBe("a");
    expect(drew.pendingChoice.remaining).toEqual(["b"]);
    const one = resolveSylvanLibraryChoice(drew, true);
    expect(one.players.user.life).toBe(16);
    expect(one.pendingChoice?.kind).toBe("sylvan-library");
    expect(one.pendingChoice.cardId).toBe("b");
    const two = resolveSylvanLibraryChoice(one, false);
    expect(two.pendingChoice).toBeFalsy();
    expect(two.players.user.life).toBe(16);
    expect(two.players.user.hand.map((c) => c.id)).toEqual(["pre", "a"]);
    expect(two.players.user.library.map((c) => c.id)).toEqual(["b", "c", "d"]);
  });

  it("⛔ 'pay' without the life to spare is a put-back, never a charge below zero", () => {
    const s = toOptionalPause(board({ life: 3 }));
    const drew = resolveOptionalChoice(s, true);
    const one = resolveSylvanLibraryChoice(drew, true);
    expect(one.players.user.life).toBe(3);
    expect(one.players.user.library[0].id).toBe("a");
  });

  it("decline the draw → nothing drawn, no card pause", () => {
    const s = toOptionalPause(board());
    const out = resolveOptionalChoice(s, false);
    expect(out.players.user.hand.map((c) => c.id)).toEqual(["pre"]);
    expect(out.pendingChoice).toBeFalsy();
  });

  it("the autopilot pays only with 8 life to spare after the payment", () => {
    expect(autoPickSylvanLibraryPayment(board({ life: 20 }), "user", 4)).toBe(true);
    expect(autoPickSylvanLibraryPayment(board({ life: 12 }), "user", 4)).toBe(true);
    expect(autoPickSylvanLibraryPayment(board({ life: 11 }), "user", 4)).toBe(false);
  });
});

describe("classification", () => {
  it("Sylvan Library is native; a different frame parks", () => {
    expect(classifyCard(LIBRARY)).toMatch(/^native/);
    expect(classifyCard({ ...LIBRARY, oracle: LIBRARY.oracle.replace("pay 4 life or put the card on top of your library", "pay 4 life or exile the card") })).not.toMatch(/^native/);
  });
});

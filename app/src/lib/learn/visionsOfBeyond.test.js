/**
 * visionsOfBeyond.test.js — "a graveyard has N or more cards in it" (Veyran Cantrips shelf, 2026-10-17).
 *
 *   Visions of Beyond: "Draw a card. If a graveyard has twenty or more cards in it, draw three cards instead."
 *
 * THE SEAM: the parser's conditional-replacement arm (one `conditional` atom, draw 3 / draw 1) only admits a condition the
 * evaluator can decide, and evaluateInterveningIf had no reading of "a graveyard" — ANY player's graveyard, the caster's
 * included (CR 404.1: each player has their own graveyard). It reads it now: true when at least one player still in the
 * game has N or more cards in their graveyard. A seat that left the game is gone from `state.players`, its cards with it
 * (CR 800.4a), so it can never satisfy the count.
 *
 * Bundled ruling (2018-12-07): the number drawn is decided as Visions of Beyond begins to resolve — applyConditional reads
 * the condition once, then runs the chosen branch.
 *
 * Real oracle fixtures (bundled Scryfall snapshot, generated in-session 2026-10-17 — never typed by hand).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState } from "./gameState.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { finalizeStackResolution, resolveTopOfStack } from "./gameEngine.js";
import { parseEffectProgram } from "./effects/parser.js";
import { evaluateInterveningIf } from "./interveningIf.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const VISIONS_OF_BEYOND = {"name":"Visions of Beyond","type":"Instant","mana":"{U}","cmc":1,"keywords":[],"colors":["U"],"oracle":"Draw a card. If a graveyard has twenty or more cards in it, draw three cards instead."};
const ISLAND = {"name":"Island","type":"Basic Land — Island","mana":"","cmc":0,"keywords":[],"colors":[],"oracle":"({T}: Add {U}.)"};

const cards = (n, tag) => Array.from({ length: n }, (_, i) => ({ ...ISLAND, id: `${tag}-${i}` }));

/** A four-seat pod; `gy` maps a seat to its graveyard size. */
function board(gy = {}) {
  const s = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
  const players = { ...s.players };
  for (const id of Object.keys(players)) players[id] = { ...players[id], graveyard: cards(gy[id] || 0, `gy-${id}`) };
  players.user = { ...players.user, hand: [{ ...VISIONS_OF_BEYOND, id: "vob" }], library: cards(10, "lib"), manaPool: { W: 0, U: 1, B: 0, R: 0, G: 0, C: 0 } };
  return { ...s, turn: 5, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0, players };
}
function castAndSettle(s0) {
  const act = legalActionsForPlayer(s0, "user").find((a) => a.kind === "cast-spell" && a.cardId === "vob");
  expect(act).toBeTruthy();
  let s = finalizeStackResolution(dispatchAction(s0, act));
  let guard = 0;
  while (s.stack.length && !s.pendingChoice && guard++ < 10) s = finalizeStackResolution(resolveTopOfStack(s));
  return s;
}
const drawn = (s) => 10 - s.players.user.library.length;

describe("the condition reader", () => {
  it("⭐ any seat's graveyard counts — the caster's or an opponent's; nineteen everywhere is not twenty", () => {
    const cond = "a graveyard has twenty or more cards in it";
    expect(evaluateInterveningIf(board({ user: 20 }), cond, "user")).toBe(true);
    expect(evaluateInterveningIf(board({ ai2: 23 }), cond, "user")).toBe(true);
    expect(evaluateInterveningIf(board({ user: 19, ai1: 19, ai2: 19, ai3: 19 }), cond, "user")).toBe(false);
    expect(evaluateInterveningIf(board({}), cond, "user")).toBe(false);
  });
});

describe("parse + classify", () => {
  it("one conditional atom: draw three when the condition holds, otherwise draw one; native-spell", () => {
    const p = parseEffectProgram(VISIONS_OF_BEYOND);
    expect(p.confidence).toBe("high");
    expect(p.atoms).toEqual([{ op: "conditional", branchOn: "a graveyard has twenty or more cards in it", ifTrue: [{ op: "draw", amount: 3, targetType: null }], ifFalse: [{ op: "draw", amount: 1, targetType: null }], targetType: null }]);
    expect(classifyCard(VISIONS_OF_BEYOND)).toBe("native-spell");
  });
});

describe("runtime — cast through the dispatcher, resolved on the stack", () => {
  it("⭐ an opponent's graveyard holds twenty: the caster draws THREE", () => {
    expect(drawn(castAndSettle(board({ ai3: 20 })))).toBe(3);
  });
  it("⭐ the caster's own graveyard holds twenty: draws THREE", () => {
    expect(drawn(castAndSettle(board({ user: 20 })))).toBe(3);
  });
  it("control: every graveyard below twenty: draws ONE, and Visions goes to the graveyard", () => {
    const s = castAndSettle(board({ user: 19, ai1: 5 }));
    expect(drawn(s)).toBe(1);
    expect(s.players.user.graveyard.some((c) => c.name === "Visions of Beyond")).toBe(true);
  });
});

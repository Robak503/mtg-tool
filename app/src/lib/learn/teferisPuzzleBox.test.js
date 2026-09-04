/**
 * teferisPuzzleBox.test.js — SHELF-85 runbook Phase 2 · N12 (2026-09-04): Teferi's Puzzle Box (Nekusar).
 *
 *   "At the beginning of each player's draw step, that player puts the cards in their hand on the bottom of their
 *    library in any order, then draws that many cards."
 *
 * The draw-step trigger's "that player" is the upkeep-player sentinel (the player whose step it is). The sentence is
 * kept whole by the splitter and one composite atom tucks the hand to the bottom (current order — "in any order" is
 * the player's unmade choice, never an illegal outcome) and draws that many through the trigger-firing draw chokepoint,
 * so Sheoldred / Phyrexian Tyranny see the draws (Nekusar's plan). The N10 wheel's draws now go through the same
 * chokepoint (a follow-up: Dark Deal's draws were silent to draw watchers).
 *
 * Real oracle fixtures (bundled Scryfall snapshot, verified in-session 2026-09-04).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { parseEffectClause, programConfidence } from "./effects/parser.js";
import { splitClauses } from "./effects/splitClauses.js";
import { detectTriggers, checkStepTriggers } from "./triggers.js";
import { flushTriggers, resolveTopOfStack, chooseTriggerTargets } from "./gameEngine.js";
import { classifyCard } from "./coverage.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const BOX = { id: "c-tpb", name: "Teferi's Puzzle Box", type: "Artifact", mana: "{4}", cmc: 4, keywords: [],
  oracle: "At the beginning of each player's draw step, that player puts the cards in their hand on the bottom of their library in any order, then draws that many cards." };
const SHEOLDRED = { id: "c-sheol", name: "Sheoldred, the Apocalypse", type: "Legendary Creature — Phyrexian Praetor", mana: "{2}{B}{B}", cmc: 4, power: 4, toughness: 5, keywords: ["Deathtouch"],
  oracle: "Deathtouch\nWhenever you draw a card, you gain 2 life.\nWhenever an opponent draws a card, they lose 2 life." };
const card = (id) => ({ id, name: "Card " + id, type: "Instant", mana: "{U}", cmc: 1, oracle: "Draw a card." });
const resolveAll = (s) => { while (s.stack.length && !s.pendingChoice) s = resolveTopOfStack(s); return s; };

function board(active) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return { ...s, turn: 6, activePlayer: active, priorityHolder: active, phase: "beginning", step: "draw",
    players: { ...s.players,
      user: { ...s.players.user, life: 40, battlefield: [createPermanent({ id: "BOX", card: BOX, controller: "user" }), createPermanent({ id: "SHEOL", card: SHEOLDRED, controller: "user" })], hand: [card("u1"), card("u2")], library: [card("ul1"), card("ul2"), card("ul3")] },
      ai: { ...s.players.ai, life: 40, hand: [card("a1"), card("a2"), card("a3")], library: [card("al1"), card("al2"), card("al3"), card("al4")] } } };
}
function fireDrawStep(s) {
  s = checkStepTriggers(s, "draw");
  s = flushTriggers(s, { chooseTargets: chooseTriggerTargets });
  return resolveAll(s);
}

describe("parse", () => {
  it("the draw-step trigger's sentence stays whole and reads as one composite on the upkeep-player referent", () => {
    const d = detectTriggers(BOX);
    expect(d.map((x) => x.event)).toEqual(["draw"]);
    expect(splitClauses(d[0].effectClause)).toHaveLength(1);
    const r = parseEffectClause(d[0].effectClause, "Artifact");
    expect(programConfidence(r)).toBe("high");
    expect(r.atoms).toEqual([{ op: "hand-to-bottom-draw-same", who: "upkeepPlayer", targetType: null }]);
  });
  it("seen-to-fail: the TOP-of-library form is a different card", () => {
    expect(parseEffectClause("the upkeep player puts the cards in their hand on top of their library in any order, then draws that many cards", "Artifact").atoms).toEqual([]);
  });
});

describe("runtime — the active player's draw step", () => {
  it("the AI's draw step: its three cards go to the bottom in hand order, it draws three, and Sheoldred drains 6", () => {
    let s = fireDrawStep(board("ai"));
    expect(s.players.ai.hand.map((c) => c.id)).toEqual(["al1", "al2", "al3"]);
    expect(s.players.ai.library.map((c) => c.id)).toEqual(["al4", "a1", "a2", "a3"]); // the old hand sits at the bottom, in order
    expect(s.players.ai.life).toBe(34); // three opponent draws × 2 (through the trigger-firing chokepoint)
    expect(s.players.user.hand).toHaveLength(2); // the user's hand is untouched on the AI's step
  });
  it("the user's own draw step: two cards tucked, two drawn, Sheoldred's own-draw half gains 4", () => {
    let s = fireDrawStep(board("user"));
    expect(s.players.user.hand.map((c) => c.id)).toEqual(["ul1", "ul2"]);
    expect(s.players.user.library.map((c) => c.id)).toEqual(["ul3", "u1", "u2"]);
    expect(s.players.user.life).toBe(44);
    expect(s.players.ai.hand).toHaveLength(3);
  });
  it("an empty hand tucks nothing and draws nothing", () => {
    let s = board("ai");
    s = { ...s, players: { ...s.players, ai: { ...s.players.ai, hand: [] } } };
    s = fireDrawStep(s);
    expect(s.players.ai.hand).toHaveLength(0);
    expect(s.players.ai.library).toHaveLength(4);
    expect(s.players.ai.life).toBe(40);
  });
});

describe("classifier", () => {
  it("Teferi's Puzzle Box is native-trigger", () => {
    expect(classifyCard(BOX)).toBe("native-trigger");
  });
});

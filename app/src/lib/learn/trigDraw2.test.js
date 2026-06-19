/**
 * TRIG-DRAW2 (CR 121) — "Whenever you draw your second card each turn, <effect>." Builds on the TRIG-DRAW
 * card-draw hook: checkCardDrawnTriggers ALSO fires a drawSecond event once, when a draw crosses the 2nd
 * card of the turn (read from cardsDrawnThisTurn, reset for ALL seats at untap via resetCardsDrawnAllPlayers
 * so an off-turn draw counts faithfully). Fires on the 2nd draw only — not the 1st or 3rd — and again next
 * turn. Riders / other ordinals / scaled variants stay LOW → Arbiter.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { detectTriggers } from "./triggers.js";
import { applyDrawEffect } from "./spellEffects.js";
import { resolveTopOfStack, flushTriggers } from "./gameEngine.js";
import { _resetIdsForTests, createGameState, createPermanent, resetCardsDrawnAllPlayers } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const creature = (name, p, t, oracle = "") => ({ id: `card-${name}`, name, type: "Creature — Knight", power: p, toughness: t, oracle });
// Knights of Dol Amroth: "Whenever you draw your second card each turn, put a +1/+1 counter on this creature."
const KNIGHTS = () => creature("Knights of Dol Amroth", 2, 2, "Whenever you draw your second card each turn, put a +1/+1 counter on this creature.");

function board({ user = [], userLib = [] } = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...s, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
    players: { ...s.players, user: { ...s.players.user, battlefield: user, library: userLib } },
  };
}
const resolveAll = (s) => { while (s.stack.length) s = resolveTopOfStack(s); return s; };
const counterOn = (s, id) => s.players.user.battlefield.find(p => p.id === id)?.counters?.["+1/+1"] || 0;
const lib = (n) => Array.from({ length: n }, (_, i) => ({ id: `lib-${i}`, name: "Card", type: "Instant", oracle: "" }));
const draw = (s, amount = 1) => resolveAll(flushTriggers(applyDrawEffect(s, { controller: "user", amount })));

describe("TRIG-DRAW2 — detection", () => {
  it("detects 'Whenever you draw your second card each turn, …' as a drawSecond event", () => {
    const t = detectTriggers(KNIGHTS());
    expect(t).toHaveLength(1);
    expect(t[0].event).toBe("drawSecond");
  });

  it("'this turn' phrasing is also detected", () => {
    const c = creature("Var", 1, 1, "Whenever you draw your second card this turn, each opponent loses 1 life.");
    expect(detectTriggers(c)[0]?.event).toBe("drawSecond");
  });

  it("a plain 'draw a card' is cardDrawn, NOT drawSecond; a 'first card' ordinal is undetected", () => {
    expect(detectTriggers(creature("A", 1, 1, "Whenever you draw a card, draw a card.")).some(t => t.event === "drawSecond")).toBe(false);
    expect(detectTriggers(creature("B", 1, 1, "Whenever you draw your first card each turn, gain 1 life.")).some(t => t.event === "drawSecond")).toBe(false);
  });
});

describe("TRIG-DRAW2 — resetCardsDrawnAllPlayers zeroes EVERY seat", () => {
  it("resets cardsDrawnThisTurn for all players (so off-turn draws count from 0 each turn)", () => {
    let s = board();
    s = { ...s, players: {
      ...s.players,
      user: { ...s.players.user, cardsDrawnThisTurn: 3 },
      ai: { ...s.players.ai, cardsDrawnThisTurn: 5 },
    } };
    s = resetCardsDrawnAllPlayers(s);
    expect(s.players.user.cardsDrawnThisTurn).toBe(0);
    expect(s.players.ai.cardsDrawnThisTurn).toBe(0);
  });
});

describe("TRIG-DRAW2 — fires on the SECOND draw of the turn only", () => {
  it("does NOT fire on the 1st draw, FIRES on the 2nd, does NOT fire on the 3rd", () => {
    let s = board({ user: [createPermanent({ id: "k", card: KNIGHTS(), controller: "user", summoningSick: false })], userLib: lib(6) });
    s = draw(s, 1); // 1st card
    expect(counterOn(s, "k")).toBe(0);
    s = draw(s, 1); // 2nd card → drawSecond fires
    expect(counterOn(s, "k")).toBe(1);
    s = draw(s, 1); // 3rd card → no fire
    expect(counterOn(s, "k")).toBe(1);
  });

  it("a single batch draw of 2 crosses the 2nd card and fires exactly once", () => {
    let s = board({ user: [createPermanent({ id: "k", card: KNIGHTS(), controller: "user", summoningSick: false })], userLib: lib(6) });
    s = draw(s, 2); // draws 2 at once → the 2nd card is in this batch → fires once
    expect(counterOn(s, "k")).toBe(1);
  });

  it("resets each turn — fires AGAIN on the second draw of the next turn", () => {
    let s = board({ user: [createPermanent({ id: "k", card: KNIGHTS(), controller: "user", summoningSick: false })], userLib: lib(8) });
    s = draw(s, 2);                       // turn 1: 2 draws → fire (counter 1)
    expect(counterOn(s, "k")).toBe(1);
    s = resetCardsDrawnAllPlayers(s);     // new turn (untap reset)
    s = draw(s, 1);                       // next turn 1st card → no fire
    expect(counterOn(s, "k")).toBe(1);
    s = draw(s, 1);                       // next turn 2nd card → fires again
    expect(counterOn(s, "k")).toBe(2);
  });
});

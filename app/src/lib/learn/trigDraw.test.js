/**
 * TRIG-DRAW (CR 121.1/121.2) — the card-draw event: "Whenever you draw a card, <effect>." A new event hook
 * on the drawCards chokepoint, reusing the EFFECT_PROGRAM bridge for the effect. Cards are drawn ONE AT A
 * TIME (CR 121.2), so a batch draw of N fires the trigger N times. Scope: the drawer alone (whose:"any" +
 * scan only the drawing player — drawing is turn-agnostic). Riders/conditionals stay LOW → Arbiter.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { detectTriggers, checkCardDrawnTriggers } from "./triggers.js";
import { applyDrawEffect } from "./spellEffects.js";
import { resolveTopOfStack, flushTriggers } from "./gameEngine.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const creature = (name, p, t, oracle = "") => ({ id: `card-${name}`, name, type: "Creature — Serpent", power: p, toughness: t, oracle });
// Lorescale Coatl: "Whenever you draw a card, put a +1/+1 counter on this creature."
const COATL = () => creature("Lorescale Coatl", 2, 2, "Whenever you draw a card, put a +1/+1 counter on this creature.");

function board({ user = [], ai = [], userLib = [] } = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...s, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
    players: {
      ...s.players,
      user: { ...s.players.user, battlefield: user, library: userLib },
      ai: { ...s.players.ai, battlefield: ai },
    },
  };
}
const resolveAll = (s) => { while (s.stack.length) s = resolveTopOfStack(s); return s; };
const counterOn = (s, id) => s.players.user.battlefield.find(p => p.id === id)?.counters?.["+1/+1"] || 0;
const lib = (n) => Array.from({ length: n }, (_, i) => ({ id: `lib-${i}`, name: "Card", type: "Instant", oracle: "" }));

describe("TRIG-DRAW — detection (classifyCondition)", () => {
  it("detects the BARE 'Whenever you draw a card, …' as a cardDrawn event", () => {
    const t = detectTriggers(COATL());
    expect(t).toHaveLength(1);
    expect(t[0].event).toBe("cardDrawn");
    expect(t[0].effectClause).toBe("put a +1/+1 counter on this creature");
  });

  it("does NOT detect 'draw your second card each turn' (conditional → Arbiter; a separate future slice)", () => {
    const c = creature("Second", 1, 1, "Whenever you draw your second card each turn, this creature deals 2 damage to any target.");
    expect(detectTriggers(c).some(t => t.event === "cardDrawn")).toBe(false);
  });

  it("does NOT detect an opponent-draw trigger ('whenever an opponent draws a card')", () => {
    const c = creature("Tax", 1, 1, "Whenever an opponent draws a card, they lose 1 life.");
    expect(detectTriggers(c).some(t => t.event === "cardDrawn")).toBe(false);
  });
});

describe("TRIG-DRAW — checkCardDrawnTriggers fires for the drawer alone, once per card", () => {
  it("fires the controller's trigger when THEY draw", () => {
    const s = board({ user: [createPermanent({ id: "c", card: COATL(), controller: "user", summoningSick: false })] });
    expect((checkCardDrawnTriggers(s, "user", 1).pendingTriggers || [])).toHaveLength(1);
  });

  it("fires N times for a batch draw of N (CR 121.2 — drawn one at a time)", () => {
    const s = board({ user: [createPermanent({ id: "c", card: COATL(), controller: "user", summoningSick: false })] });
    const out = checkCardDrawnTriggers(s, "user", 3);
    expect(out.pendingTriggers || []).toHaveLength(3);
    // distinct trigger OBJECTS (not the same reference repeated 3×; stack ids are assigned later at flush)
    expect(new Set(out.pendingTriggers || []).size).toBe(3);
  });

  it("does NOT fire on a DIFFERENT player's draw, and no-ops on 0", () => {
    const s = board({ user: [createPermanent({ id: "c", card: COATL(), controller: "user", summoningSick: false })] });
    expect((checkCardDrawnTriggers(s, "ai", 2).pendingTriggers || [])).toHaveLength(0);
    expect(checkCardDrawnTriggers(s, "user", 0)).toBe(s);
  });
});

describe("TRIG-DRAW — resolves through the EFFECT_PROGRAM bridge + the draw atom site", () => {
  it("routes the counter effect through EFFECT_PROGRAM and grows the source", () => {
    let s = board({ user: [createPermanent({ id: "c", card: COATL(), controller: "user", summoningSick: false })] });
    s = flushTriggers(checkCardDrawnTriggers(s, "user", 1));
    expect(s.stack[0].kind).toBe("triggered-ability");
    expect(s.stack[0].payload.resolver).toBe("effect-program");
    s = resolveAll(s);
    expect(counterOn(s, "c")).toBe(1);
  });

  it("end-to-end: applyDrawEffect drawing 2 grows a Lorescale Coatl by 2 (the draw-atom site fires per card)", () => {
    let s = board({
      user: [createPermanent({ id: "c", card: COATL(), controller: "user", summoningSick: false })],
      userLib: lib(5),
    });
    s = applyDrawEffect(s, { controller: "user", amount: 2 });
    expect(s.players.user.hand).toHaveLength(2); // the 2 cards were drawn
    s = resolveAll(flushTriggers(s));            // flush the queued draw triggers onto the stack, then resolve
    expect(counterOn(s, "c")).toBe(2);           // and the Coatl grew once per card
  });

  it("a deck-out draw (library shorter than requested) fires only for cards ACTUALLY drawn", () => {
    let s = board({
      user: [createPermanent({ id: "c", card: COATL(), controller: "user", summoningSick: false })],
      userLib: lib(1), // only 1 card left
    });
    s = applyDrawEffect(s, { controller: "user", amount: 3 }); // asked for 3, only 1 available
    s = resolveAll(flushTriggers(s));
    expect(counterOn(s, "c")).toBe(1); // one real draw → one counter (no fabricated draws)
  });
});

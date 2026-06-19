/**
 * TRIG-LIFEGAIN (CR 119.3) — the first trigger-compiler slice on a NEW event hook: "Whenever you gain
 * life, <effect>." Detection is added to classifyCondition; checkLifegainTriggers fires at each gainLife
 * site (the gain-life effect atom + combat lifelink); the existing EFFECT_PROGRAM bridge applies the
 * effect. Scope: the gainer alone (whose:"any" + scan only the gaining player — life gain is turn-agnostic,
 * so the "yours"/activePlayer gate is wrong here). Riders/conditionals stay LOW → Arbiter (the CREED gate).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { detectTriggers, checkLifegainTriggers } from "./triggers.js";
import { resolveTopOfStack, flushTriggers } from "./gameEngine.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const creature = (name, p, t, oracle = "") => ({ id: `card-${name}`, name, type: "Creature — Cat Soldier", power: p, toughness: t, oracle });
const PRIDEMATE = () => creature("Ajani's Pridemate", 2, 2, "Whenever you gain life, put a +1/+1 counter on this creature.");

function board({ user = [], ai = [] }) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...s, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
    players: { ...s.players, user: { ...s.players.user, battlefield: user }, ai: { ...s.players.ai, battlefield: ai } },
  };
}
const resolveAll = (s) => { while (s.stack.length) s = resolveTopOfStack(s); return s; };
const counterOn = (s, id) => s.players.user.battlefield.find(p => p.id === id)?.counters?.["+1/+1"] || 0;

describe("TRIG-LIFEGAIN — detection (classifyCondition)", () => {
  it("detects the BARE 'Whenever you gain life, …' trigger as a lifegain event", () => {
    const trigs = detectTriggers(PRIDEMATE());
    expect(trigs).toHaveLength(1);
    expect(trigs[0].event).toBe("lifegain");
    expect(trigs[0].effectClause).toBe("put a +1/+1 counter on this creature");
  });

  it("does NOT detect a conditional 'first time each turn' (anchored → Arbiter, a SAFE false-negative)", () => {
    const c = creature("Conditional", 1, 1, "Whenever you gain life for the first time each turn, draw a card.");
    expect(detectTriggers(c).some(t => t.event === "lifegain")).toBe(false);
  });

  it("does NOT detect a compound 'gain or lose life' (residue → Arbiter)", () => {
    const c = creature("Compound", 1, 1, "Whenever you gain or lose life, each opponent loses 1 life.");
    expect(detectTriggers(c).some(t => t.event === "lifegain")).toBe(false);
  });
});

describe("TRIG-LIFEGAIN — checkLifegainTriggers fires for the gainer alone", () => {
  it("fires the controller's trigger when THEY gain life", () => {
    const s = board({ user: [createPermanent({ id: "p", card: PRIDEMATE(), controller: "user", summoningSick: false })] });
    const out = checkLifegainTriggers(s, "user", 3);
    expect(out.pendingTriggers || []).toHaveLength(1);
  });

  it("does NOT fire on a DIFFERENT player's life gain (no over-fire — CR 119.3 is per-gainer)", () => {
    const s = board({ user: [createPermanent({ id: "p", card: PRIDEMATE(), controller: "user", summoningSick: false })] });
    expect((checkLifegainTriggers(s, "ai", 3).pendingTriggers || [])).toHaveLength(0);
  });

  it("is a no-op on a zero/negative amount (no life was actually gained)", () => {
    const s = board({ user: [createPermanent({ id: "p", card: PRIDEMATE(), controller: "user", summoningSick: false })] });
    expect(checkLifegainTriggers(s, "user", 0)).toBe(s);
  });
});

describe("TRIG-LIFEGAIN — the effect resolves through the EFFECT_PROGRAM bridge", () => {
  it("routes the counter effect through EFFECT_PROGRAM and puts a +1/+1 counter on the source", () => {
    let s = board({ user: [createPermanent({ id: "p", card: PRIDEMATE(), controller: "user", summoningSick: false })] });
    s = checkLifegainTriggers(s, "user", 1);
    s = flushTriggers(s);
    expect(s.stack[0].kind).toBe("triggered-ability");
    expect(s.stack[0].payload.resolver).toBe("effect-program"); // the bridge, not the small fallback
    s = resolveAll(s);
    expect(counterOn(s, "p")).toBe(1);
  });
});

describe("TRIG-LIFEGAIN — end to end: gaining life from a spell fires it (the gain-life atom site)", () => {
  it("a 'you gain N life' ETB on the board, with a Pridemate out, both gains the life AND grows the Pridemate", () => {
    const before = createGameState({ userDeck: [], aiDeck: [] }).players.user.life;
    const healer = creature("Healer", 1, 1, "When Healer enters, you gain 3 life.");
    let s = board({ user: [createPermanent({ id: "p", card: PRIDEMATE(), controller: "user", summoningSick: false })] });
    s = { ...s, stack: [{ id: "stk-1", kind: "spell", source: healer, controller: "user", targets: [], cost: null, payload: { resolver: "spell.permanent", params: { card: healer, controller: "user" } } }] };
    s = resolveAll(s); // resolve the spell → ETB gain-life → applyGainLife fires the lifegain trigger → counter
    expect(s.players.user.life).toBe(before + 3); // the life was gained
    expect(counterOn(s, "p")).toBe(1);            // and the Pridemate grew (the lifegain trigger fired via the atom site)
  });
});

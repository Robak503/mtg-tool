/**
 * TRIG-CAST2 (CR 601) — "Whenever you cast your second spell each turn, <effect>." The magecraft-second-
 * spell archetype. A new spellsCastThisTurn counter (incremented at the cast chokepoint, applyCastSpell →
 * recordSpellCast) drives a castSecond event in checkCastTriggers, fired ONCE when the count reaches 2
 * (spells are cast one at a time, so it passes through 2 exactly once per turn). Reset for ALL seats at
 * untap (resetSpellsCastAllPlayers) so off-turn instants count faithfully. Riders/ordinals → Arbiter.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { detectTriggers, checkCastTriggers } from "./triggers.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { _resetIdsForTests, createGameState, createPermanent, recordSpellCast, resetSpellsCastAllPlayers } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const MONK_TEXT = "Whenever you cast your second spell each turn, put a +1/+1 counter on this creature.";
const monkCard = () => ({ id: "card-monk", name: "Monk of the Open Hand", type: "Creature — Monk", power: 1, toughness: 1, oracle: MONK_TEXT });
const monkPerm = () => createPermanent({ id: "m", card: monkCard(), controller: "user", summoningSick: false });

describe("TRIG-CAST2 — detection", () => {
  it("detects 'cast your second spell (each|this) turn' as a castSecond event", () => {
    expect(detectTriggers(monkCard())[0]).toMatchObject({ event: "castSecond" });
    expect(detectTriggers({ name: "V", type: "Creature", oracle: "Whenever you cast your second spell this turn, draw a card." })[0]?.event).toBe("castSecond");
  });

  it("does NOT detect a 'first spell' ordinal, nor collide with the generic cast event", () => {
    expect(detectTriggers({ name: "F", type: "Creature", oracle: "Whenever you cast your first spell each turn, draw a card." }).some(d => d.event === "castSecond")).toBe(false);
    // a plain "cast a spell" is the generic cast event, NOT castSecond
    const plain = detectTriggers({ name: "P", type: "Creature", oracle: "Whenever you cast a spell, draw a card." });
    expect(plain.some(d => d.event === "castSecond")).toBe(false);
    expect(plain.some(d => d.event === "cast")).toBe(true);
  });
});

describe("TRIG-CAST2 — counter helpers", () => {
  it("recordSpellCast increments the caster's count; resetSpellsCastAllPlayers zeroes EVERY seat", () => {
    let s = createGameState({ userDeck: [], aiDeck: [] });
    s = recordSpellCast(s, { playerId: "user" });
    s = recordSpellCast(s, { playerId: "user" });
    s = recordSpellCast(s, { playerId: "ai" });
    expect(s.players.user.spellsCastThisTurn).toBe(2);
    expect(s.players.ai.spellsCastThisTurn).toBe(1);
    s = resetSpellsCastAllPlayers(s);
    expect(s.players.user.spellsCastThisTurn).toBe(0);
    expect(s.players.ai.spellsCastThisTurn).toBe(0);
  });
});

describe("TRIG-CAST2 — checkCastTriggers fires castSecond on the 2nd cast only", () => {
  function stateAt(spellsCast, { aiWatcher = false } = {}) {
    const s = createGameState({ userDeck: [], aiDeck: [] });
    const ai = aiWatcher
      ? [createPermanent({ id: "am", card: { ...monkCard(), id: "card-monk-ai" }, controller: "ai", summoningSick: false })]
      : [];
    return {
      ...s,
      players: {
        ...s.players,
        user: { ...s.players.user, battlefield: [monkPerm()], spellsCastThisTurn: spellsCast },
        ai: { ...s.players.ai, battlefield: ai },
      },
    };
  }
  const fired = (s) => (checkCastTriggers(s, { spellCard: { name: "Bolt", type: "Instant" }, casterId: "user" }).pendingTriggers || []).length;

  it("does not fire at 1, fires at 2, does not fire at 3", () => {
    expect(fired(stateAt(1))).toBe(0);
    expect(fired(stateAt(2))).toBe(1);
    expect(fired(stateAt(3))).toBe(0);
  });

  it("fires for the CASTER's own watcher only — an opponent's castSecond Monk does NOT fire on the user's 2nd cast", () => {
    const s = stateAt(2, { aiWatcher: true });
    // user is the caster at count 2 → only the user's Monk fires (the AI's count is 0 and it isn't the caster)
    expect(fired(s)).toBe(1);
  });
});

describe("TRIG-CAST2 — end to end through the real cast path (applyCastSpell → recordSpellCast)", () => {
  it("casting two spells increments the count and fires castSecond on the 2nd, growing the Monk", () => {
    const bolt = (n) => ({ id: `c-bolt${n}`, name: "Zap", type: "Instant", mana: "{R}", oracle: "Zap deals 1 damage to any target." });
    let s = createGameState({ userDeck: [], aiDeck: [] });
    s = {
      ...s, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main",
      players: { ...s.players, user: { ...s.players.user, battlefield: [monkPerm()], hand: [bolt(1), bolt(2)], manaPool: { W: 0, U: 0, B: 0, R: 2, G: 0, C: 0 } } },
    };
    const cost = { generic: 0, W: 0, U: 0, B: 0, R: 1, G: 0, C: 0, hybrid: [], phyrexian: [] };
    const castAction = (id) => ({ kind: "cast-spell", playerId: "user", cardId: id, name: "Zap", cost, targets: [{ type: "player", id: "ai" }] });

    s = dispatchAction(s, castAction("c-bolt1")); // 1st spell
    expect(s.players.user.spellsCastThisTurn).toBe(1);             // recordSpellCast wired in applyCastSpell
    expect(s.stack.some(o => o.kind === "triggered-ability")).toBe(false); // no castSecond on the 1st

    s = dispatchAction(s, castAction("c-bolt2")); // 2nd spell
    expect(s.players.user.spellsCastThisTurn).toBe(2);
    const trig = s.stack.find(o => o.kind === "triggered-ability");
    expect(trig).toBeTruthy();                                      // castSecond fired on the 2nd cast
    expect(trig.payload.resolver).toBe("effect-program");          // routes the "+1/+1 counter" via the bridge

    s = resolveTopOfStack(s); // resolve the castSecond trigger
    expect(s.players.user.battlefield.find(p => p.id === "m")?.counters?.["+1/+1"]).toBe(1);
  });
});

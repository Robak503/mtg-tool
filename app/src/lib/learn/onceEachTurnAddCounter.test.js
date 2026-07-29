/**
 * onceEachTurnAddCounter.test.js — "Do this only once each turn." on the ADD-COUNTER atom
 * (Leonardo, the Balance — a commander of the worst deck on the shelf).
 *
 * The rider is a FREQUENCY RESTRICTION enforced at resolution through `atom.oncePerTurn` and the shared
 * `state.onceTriggersFiredThisTurn` ledger (cleared at untap). The parser gate `ONCE_PER_TURN_HONORED` is a
 * CREED guard: only ops whose RESOLVER actually reads the flag may keep the program HIGH, because an op that
 * ignores it re-fires every turn while the card claims native — the guard's own comment calls that "a
 * forbidden false positive". `add-counter` had no latch, so it was correctly excluded.
 *
 * ⭐ ORDER MATTERS AND IS THE POINT: the latch was implemented FIRST (check on entry, set after the effect,
 * same `${sourceId}_${op}` key shape as the draw / gain-life / discover latches), and only then was the op
 * admitted to the set. Admitting first would have credited Leonardo for an ability that fires every turn.
 *
 * The n=2 board test below is the whole safety argument — a tier verdict says nothing about whether the
 * second trigger is actually suppressed.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { parseEffectClause } from "./effects/parser.js";
import { checkPermanentEntersTriggers } from "./triggers.js";
import { flushTriggers, resolveTopOfStack, chooseTriggerTargets } from "./gameEngine.js";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { permanentPower } from "./layers.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const ORACLE = "Whenever a token you control enters, put a +1/+1 counter on each creature you control. Do this only once each turn.";
const watcher = { id: "w", name: "Watcher", type: "Legendary Creature — Turtle", mana: "{3}{W}", power: 3, toughness: 3, oracle: ORACLE };
// ⚠️ Token-ness is read off the CARD, not the permanent wrapper — a fixture that sets it on the permanent
// alone fires nothing and looks exactly like a dead trigger. That cost a debugging detour.
const tokenCard = (id) => ({ id, name: "Tok", type: "Creature — Soldier", power: 1, toughness: 1, oracle: "", token: true });

function enterToken(state, id) {
  const p = createPermanent({ id, card: tokenCard(id), controller: "user" });
  let n = { ...state, players: { ...state.players, user: { ...state.players.user, battlefield: [...state.players.user.battlefield, p] } } };
  n = checkPermanentEntersTriggers(n, p);
  n = flushTriggers(n, { chooseTargets: chooseTriggerTargets });
  let guard = 0;
  while ((n.stack || []).length && guard++ < 20) n = resolveTopOfStack(n);
  return n;
}
function board() {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [createPermanent({ id: "w", card: watcher, controller: "user" })] } } };
}

describe("parsing — the rider is carried onto the atom", () => {
  it("the program stays HIGH and stamps oncePerTurn on add-counter", () => {
    const p = parseEffectClause("put a +1/+1 counter on each creature you control. Do this only once each turn", "Creature", { hasX: false });
    expect(p.confidence).toBe("high");
    expect(p.atoms).toHaveLength(1);
    expect(p.atoms[0]).toMatchObject({ op: "add-counter", oncePerTurn: true });
  });

  it("Leonardo, the Balance classifies native", () => {
    expect(classifyCard({
      name: "Leonardo, the Balance", type: "Legendary Creature — Mutant Ninja Turtle", mana: "{3}{W}", power: 3, toughness: 3,
      oracle: "Whenever a token you control enters, you may put a +1/+1 counter on each creature you control. Do this only once each turn.\n{W}{U}{B}{R}{G}: Creatures you control gain menace, trample, and lifelink until end of turn.\nPartner—Character select",
    })).toMatch(/^native/);
  });
});

describe("⭐ RUNTIME — the latch is what makes the credit honest", () => {
  it("the FIRST token places the counters (3 → 4)", () => {
    expect(permanentPower(enterToken(board(), "t1"), "w")).toBe(4);
  });

  it("⭐ THE LOAD-BEARING ONE — the SECOND token in the same turn places NOTHING", () => {
    const st = enterToken(enterToken(board(), "t1"), "t2");
    expect(permanentPower(st, "w")).toBe(4);
  });

  it("the latch is keyed per source+op, so it lands in the shared ledger", () => {
    const st = enterToken(board(), "t1");
    expect(Object.keys(st.onceTriggersFiredThisTurn || {}).some((k) => k.endsWith("_add-counter"))).toBe(true);
  });
});

describe("⭐ CREED — the gate still refuses ops whose resolver ignores the flag", () => {
  it("a PUMP with the rider stays LOW (its resolver has no latch)", () => {
    const p = parseEffectClause("target creature gets +1/+1 until end of turn. Do this only once each turn", "Creature", { hasX: false });
    expect(p.confidence).toBe("low");
    expect(p.atoms).toEqual([]);
  });

  it("an unmodeled core with the rider stays LOW", () => {
    expect(parseEffectClause("glorbulate twice. Do this only once each turn", "Creature", { hasX: false }).confidence).toBe("low");
  });

  it("the rider-less add-counter is untouched", () => {
    const p = parseEffectClause("put a +1/+1 counter on each creature you control", "Creature", { hasX: false });
    expect(p.confidence).toBe("high");
    expect(p.atoms[0].oncePerTurn).toBeUndefined();
  });
});

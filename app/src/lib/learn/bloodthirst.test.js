/**
 * bloodthirst.test.js — KW-BLOODTHIRST (CR 702.54) + the DAMAGE-ONLY per-turn ledger it needs.
 *
 * "Bloodthirst N (If an opponent was dealt damage this turn, this creature enters with N +1/+1 counters
 * on it.)" — the text is reminder-only, so entersWithConditionalCounters synthesizes {n, condition} from
 * the printed keyword and the EXISTING conditional-enters-with-counters lane does the rest (coverage's
 * condEnterCtr gate credits it; resolvers.js places the counters at enter time).
 *
 * THE LEDGER is the load-bearing part. `damageTakenThisTurn` is deliberately NOT `lifeLostThisTurn`:
 * a drain, a pay-life cost, or "each player loses 1 life" all lose life with NO damage dealt, and
 * bloodthirst must not fire on those. gameState.loseLife tallies the damage ledger only when its
 * `combatDamage` flag is defined — which exactly the two damage callers pass (combat resolution: true,
 * the burn/ability damage atom: false) and every non-damage loss leaves undefined.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { entersWithConditionalCounters } from "./staticAbilityParser.js";
import { evaluateInterveningIf, spellConditionParseable } from "./interveningIf.js";
import { classifyCard } from "./coverage.js";
import { _resetIdsForTests, createGameState, loseLife } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const REMINDER = "(If an opponent was dealt damage this turn, this creature enters with three +1/+1 counters on it.)";
const bt = (name, n, extra = "") => ({ name, type: "Creature — Ogre", mana: "{4}{R}", oracle: `${extra}Bloodthirst ${n} ${REMINDER}`.trim() });

function withOpp(patch = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return { ...s, players: { ...s.players, ai: { ...s.players.ai, ...patch } } };
}

describe("keyword bridge — the reminder-only text is synthesized from the printed keyword", () => {
  it("Bloodthirst N yields {n, condition} for the existing conditional-enter lane", () => {
    expect(entersWithConditionalCounters(bt("Blood Ogre", 1))).toEqual({ n: 1, condition: "an opponent was dealt damage this turn" });
    expect(entersWithConditionalCounters(bt("Carnage Wurm", 3))).toEqual({ n: 3, condition: "an opponent was dealt damage this turn" });
  });
  it("the condition is spell-readable, so the coverage gate and the resolver both accept it", () => {
    expect(spellConditionParseable("an opponent was dealt damage this turn")).toBe(true);
  });
  it("real carriers flip; a carrier with an unmodeled sibling clause still parks (whole-card law)", () => {
    expect(classifyCard(bt("Blood Ogre", 1, "Trample\n"))).toMatch(/^native/);
    expect(classifyCard(bt("Synth", 2, "Whenever this creature glorbulates, frobnicate target nonsense.\n"))).toBe("body-only");
  });
  it("CREED — 'Bloodthirst X' is NOT credited: the synthesizer can't produce a count, so the runtime would place nothing", () => {
    // Petrified Wood-Kin (X = damage dealt to your opponents this turn). A startsWith-style keyword credit
    // accepted this and flipped it native while the counters silently never landed — caught by this
    // slice's own per-flip audit, which is why the gate is digit-anchored.
    const woodKin = { name: "Petrified Wood-Kin", type: "Creature — Elemental", mana: "{4}{R}",
      oracle: "This spell can't be countered.\nBloodthirst X (This creature enters with X +1/+1 counters on it if an opponent was dealt damage this turn, where X is the amount of damage dealt to your opponents this turn.)\nTrample" };
    expect(entersWithConditionalCounters({ oracle: woodKin.oracle })).toBeNull();
    expect(classifyCard(woodKin)).toBe("body-only");
  });
});

describe("the DAMAGE-only ledger (the FP this design exists to prevent)", () => {
  const cond = "an opponent was dealt damage this turn";
  it("COMBAT damage to an opponent satisfies the condition", () => {
    const s = loseLife(withOpp(), { playerId: "ai", amount: 3, combatDamage: true });
    expect(s.players.ai.damageTakenThisTurn).toBe(3);
    expect(evaluateInterveningIf(s, cond, "user")).toBe(true);
  });
  it("BURN / ability damage also satisfies it (combatDamage:false is still damage)", () => {
    const s = loseLife(withOpp(), { playerId: "ai", amount: 2, combatDamage: false });
    expect(evaluateInterveningIf(s, cond, "user")).toBe(true);
  });
  it("NON-damage life loss does NOT satisfy it — a drain/pay-life turn can never fire bloodthirst", () => {
    const s = loseLife(withOpp(), { playerId: "ai", amount: 5 }); // no combatDamage flag → not damage
    expect(s.players.ai.lifeLostThisTurn).toBe(5);            // life WAS lost…
    expect(s.players.ai.damageTakenThisTurn).toBeUndefined();  // …but no damage was dealt
    expect(evaluateInterveningIf(s, cond, "user")).toBe(false);
  });
  it("damage to YOURSELF doesn't satisfy it — the condition is scoped to opponents", () => {
    const s0 = createGameState({ userDeck: [], aiDeck: [] });
    const s = loseLife(s0, { playerId: "user", amount: 4, combatDamage: true });
    expect(evaluateInterveningIf(s, cond, "user")).toBe(false);
  });
  it("no damage at all → false (absent tally is fail-closed, never fail-open)", () => {
    expect(evaluateInterveningIf(withOpp(), cond, "user")).toBe(false);
  });
});

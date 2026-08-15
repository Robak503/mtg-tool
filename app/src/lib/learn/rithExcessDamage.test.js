/**
 * rithExcessDamage.test.js — ⭐ RITH, LIBERATED PRIMEVAL (Dragons shelf, 2026-08-15): the whole card.
 *
 *   · the EXCESS-DAMAGE ledger (CR 120.4a): stamped at gameState.markCombatDamage — the single chokepoint
 *     both damage paths (combat aggregation + spell damage) funnel through. Excess = the marked total
 *     exceeding layer-aware toughness; EXACT lethal is NOT excess (the > boundary). Deliberate
 *     under-detection: deathtouch excess (CR 702.2c) and the planeswalker loyalty path are uncredited —
 *     the trigger under-fires, never over-fires (CREED).
 *   · the intervening-if reader: "a creature or planeswalker an opponent controlled was dealt excess
 *     damage this turn" — turn-matched (stale ledger = false), scoped to the CONDITION controller's
 *     opponents (your own creature taking excess damage never satisfies your Rith).
 *   · the ward grant: "Other Dragons you control have ward {2}" — the GENERIC-pip twin of the granted
 *     pay-life ward, riding the same enforced addWard channel (ward.js unions it at the tax site).
 *
 * Mutation-checked (2026-08-15): the ledger's `> tough` flipped to `>=` → the exact-lethal control dies
 * (lethal-but-not-excess damage stamps the ledger); the ledger stamp disabled → the excess witness dies.
 * Both restored green.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { _resetIdsForTests, createGameState, createPermanent, markCombatDamage } from "./gameState.js";
import { evaluateInterveningIf } from "./interveningIf.js";
import { parseStaticAbilities } from "./staticAbilityParser.js";
import { classifyCard } from "./coverage.js";
import { detectTriggers } from "./triggers.js";

beforeEach(() => _resetIdsForTests());

const RITH_ORACLE =
  "Flying, ward {2}\nOther Dragons you control have ward {2}.\nAt the beginning of your end step, if a creature or planeswalker an opponent controlled was dealt excess damage this turn, create a 4/4 red Dragon creature token with flying.";
const rithCard = () => ({ id: "rith-c", name: "Rith, Liberated Primeval", type: "Legendary Creature — Dragon", power: "5", toughness: "5", mana: "{2}{R}{G}{W}", oracle: RITH_ORACLE });
const COND = "a creature or planeswalker an opponent controlled was dealt excess damage this turn";

const bear = (id, controller, toughness = "3") => createPermanent({ id, controller, card: { id: `${id}-c`, name: "Bear", type: "Creature — Bear", power: "2", toughness, oracle: "" } });

function withBoard() {
  const s = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
  return {
    ...s, turn: 4,
    players: { ...s.players,
      user: { ...s.players.user, battlefield: [bear("ub", "user")] },
      ai1: { ...s.players.ai1, battlefield: [bear("ab", "ai1")] } },
  };
}

describe("classify + the ward grant", () => {
  it("⭐ Rith classifies NATIVE-MIXED (keywords + the granted ward {2} + the excess-damage end-step trigger)", () => {
    const row = { tier: classifyCard(rithCard()), trig: detectTriggers(rithCard()).length };
    console.log("  WITNESS rithTier", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row.tier).toBe("native-mixed");
    expect(row.trig).toBe(1);
  });

  it("'Other Dragons you control have ward {2}' → the enforced addWard/generic grant over the other-Dragons selector", () => {
    const [d] = parseStaticAbilities({ name: "R", type: "Legendary Creature — Dragon", oracle: "Other Dragons you control have ward {2}." });
    expect(d).toMatchObject({ layer: 6, op: { layerOp: "addWard", generic: 2 }, affects: { selector: { subtypes: ["Dragon"], excludeSelf: true } } });
  });

  it("seen-to-fail: a granted Ward—Sacrifice tail still nulls the whole clause (no partial grant)", () => {
    expect(parseStaticAbilities({ name: "R", type: "Creature — Dragon", oracle: 'Other Dragons you control have "Ward—Sacrifice a permanent."' })).toEqual([]);
  });
});

describe("⭐⭐ the excess-damage ledger + the opponent-scoped condition (CR 120.4a)", () => {
  it("⭐⭐ 5 damage on an opponent's 3-toughness creature → excess stamped; MY Rith's condition reads TRUE (theirs reads false)", () => {
    let s = withBoard();
    s = markCombatDamage(s, { permanentId: "ab", amount: 5 }); // ai1's bear, toughness 3 → excess 2
    const row = {
      ledger: s.excessDamageThisTurn,
      mine: evaluateInterveningIf(s, COND, "user"),   // ai1 is my opponent → true
      theirs: evaluateInterveningIf(s, COND, "ai1"),  // ai1's OWN creature → false for ai1
    };
    console.log("  WITNESS rithLedger", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row.ledger).toEqual({ turn: 4, controllers: ["ai1"] });
    expect(row.mine).toBe(true);
    expect(row.theirs).toBe(false);
  });

  it("EXACT lethal is NOT excess (CR 120.4a — the > boundary): 3 on a 3-toughness creature stamps nothing", () => {
    let s = withBoard();
    s = markCombatDamage(s, { permanentId: "ab", amount: 3 });
    expect(s.excessDamageThisTurn).toBeUndefined();
    expect(evaluateInterveningIf(s, COND, "user")).toBe(false);
  });

  it("two marks that CROSS the toughness stamp on the crossing mark (the running total is what's excess)", () => {
    let s = withBoard();
    s = markCombatDamage(s, { permanentId: "ab", amount: 2 });
    expect(s.excessDamageThisTurn).toBeUndefined();
    s = markCombatDamage(s, { permanentId: "ab", amount: 2 }); // total 4 > 3
    expect(s.excessDamageThisTurn).toEqual({ turn: 4, controllers: ["ai1"] });
  });

  it("a STALE-turn ledger reads false (self-expiring, both directions)", () => {
    let s = withBoard();
    s = markCombatDamage(s, { permanentId: "ab", amount: 5 });
    expect(evaluateInterveningIf({ ...s, turn: 5 }, COND, "user")).toBe(false);
  });

  it("my OWN creature taking excess damage never satisfies my condition (the ledger records the victim's controller)", () => {
    let s = withBoard();
    s = markCombatDamage(s, { permanentId: "ub", amount: 9 }); // MY bear
    expect(s.excessDamageThisTurn).toEqual({ turn: 4, controllers: ["user"] });
    expect(evaluateInterveningIf(s, COND, "user")).toBe(false);
    expect(evaluateInterveningIf(s, COND, "ai1")).toBe(true); // for ai1, "user" IS an opponent
  });
});

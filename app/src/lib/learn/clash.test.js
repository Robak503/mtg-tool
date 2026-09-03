/**
 * clash.test.js — STAGE ④-1 (2026-09-03): CLASH (CR 701.22) — "clash with an opponent. If you win, <payoff>".
 * Nath's Elite's ETB is the shape (× Oaken Brawler, Paperfin Rascal, Bog Hoodlums, Adder-Staff Boggart):
 * "When this creature enters, clash with an opponent. If you win, put a +1/+1 counter on this creature."
 * Two atoms — the clash (reveal tops vs one opponent; win iff GREATER mana value; a tie wins for nobody;
 * both cards stay on top) and a conditional on the normalized "you won the clash", read off the stamp the
 * clash applier writes for this controller.
 *
 * Real oracle fixture (bundled Scryfall snapshot, read in-session 2026-09-03).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { checkEnterTriggers } from "./triggers.js";
import { flushTriggers, resolveTopOfStack } from "./gameEngine.js";
import { parseEffectClause } from "./effects/parser.js";
import { evaluateInterveningIf, interveningIfParseable, spellConditionParseable } from "./interveningIf.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const ELITE = { id: "c-elite", name: "Nath's Elite", type: "Creature — Elf Warrior", mana: "{4}{G}", power: 4, toughness: 4, keywords: [], oracle: "All creatures able to block this creature do so.\nWhen this creature enters, clash with an opponent. If you win, put a +1/+1 counter on this creature. (Each clashing player reveals the top card of their library, then puts that card on their choice of the top or bottom. A player wins if their card had a greater mana value.)" };
const SPRINGJACK = { id: "c-sj", name: "Springjack Knight", type: "Creature — Kithkin Knight", mana: "{2}{W}", power: 2, toughness: 2, keywords: [], oracle: "Whenever this creature attacks, clash with an opponent. If you win, target creature gains double strike until end of turn. (Each clashing player reveals the top card of their library, then puts that card on their choice of the top or bottom. A player wins if their card had a greater mana value.)" };
const mv = (id, cmc, mana) => ({ id, name: "Card " + id, type: "Creature — Bear", mana, mana_cost: mana, cmc, power: 1, toughness: 1, oracle: "" });

function board({ mine, theirs }) {
  const s0 = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...s0, turn: 5, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
    players: {
      ...s0.players,
      user: { ...s0.players.user, library: mine, battlefield: [createPermanent({ id: "elite", card: ELITE, controller: "user" })] },
      ai: { ...s0.players.ai, library: theirs },
    },
  };
}
/** Fire the Elite's ETB and resolve it. */
function enterAndResolve(s) {
  const elite = s.players.user.battlefield.find((p) => p.id === "elite");
  return resolveTopOfStack(flushTriggers(checkEnterTriggers(s, elite)));
}
const counters = (s) => s.players.user.battlefield.find((p) => p.id === "elite")?.counters?.["+1/+1"] || 0;

describe("the parses", () => {
  it("clash then the conditional payoff; 'you may clash' marks the clash optional", () => {
    const p = parseEffectClause("clash with an opponent. If you win, put a +1/+1 counter on this creature.", "Instant");
    expect(p.confidence).toBe("high");
    expect(p.atoms[0]).toEqual({ op: "clash", targetType: null });
    expect(p.atoms[1]).toMatchObject({ op: "conditional", branchOn: "you won the clash", ifFalse: [] });
    expect(p.atoms[1].ifTrue.length).toBeGreaterThan(0);
    const opt = parseEffectClause("you may clash with an opponent. If you win, put a +1/+1 counter on this creature.", "Instant");
    expect(opt.atoms[0]).toEqual({ op: "clash", optional: true, targetType: null });
  });

  it("the condition is readable by every probe; it answers only for the stamped controller", () => {
    expect(interveningIfParseable("you won the clash")).toBe(true);
    expect(spellConditionParseable("you won the clash")).toBe(true);
    const s = { ...board({ mine: [], theirs: [] }), clashResult: { controller: "user", opponent: "ai", won: true } };
    expect(evaluateInterveningIf(s, "you won the clash", "user", {})).toBe(true);
    expect(evaluateInterveningIf(s, "you won the clash", "ai", {})).toBeNull();
    expect(evaluateInterveningIf(board({ mine: [], theirs: [] }), "you won the clash", "user", {})).toBeNull();
  });
});

describe("runtime — Nath's Elite's ETB", () => {
  it("⭐ a greater mana value wins: the counter lands; both revealed cards stay on top", () => {
    const out = enterAndResolve(board({ mine: [mv("m3", 3, "{2}{G}"), mv("m0", 0, "{0}")], theirs: [mv("t1", 1, "{G}")] }));
    expect(counters(out)).toBe(1);
    expect(out.players.user.library[0].id).toBe("m3");
    expect(out.players.ai.library[0].id).toBe("t1");
    expect(out.clashResult).toMatchObject({ controller: "user", opponent: "ai", won: true });
  });

  it("⛔ a lower mana value loses; a TIE wins for nobody", () => {
    expect(counters(enterAndResolve(board({ mine: [mv("m1", 1, "{G}")], theirs: [mv("t3", 3, "{2}{G}")] })))).toBe(0);
    expect(counters(enterAndResolve(board({ mine: [mv("m2", 2, "{1}{G}")], theirs: [mv("t2", 2, "{1}{G}")] })))).toBe(0);
  });

  it("an opponent with no card to reveal cannot win; the controller wins iff they revealed one", () => {
    expect(counters(enterAndResolve(board({ mine: [mv("m1", 1, "{G}")], theirs: [] })))).toBe(1);
    expect(counters(enterAndResolve(board({ mine: [], theirs: [] })))).toBe(0);
  });

  it("the mana value is read off the cost when no cmc is stamped (a pip is 1, X is 0): {X}{G}{G} is 2 — beats 1, ties 2", () => {
    const noCmc = { id: "x", name: "X card", type: "Creature — Bear", mana: "{X}{G}{G}", mana_cost: "{X}{G}{G}", power: 1, toughness: 1, oracle: "" };
    expect(counters(enterAndResolve(board({ mine: [noCmc], theirs: [mv("t1", 1, "{G}")] })))).toBe(1);
    expect(counters(enterAndResolve(board({ mine: [noCmc], theirs: [mv("t2", 2, "{1}{G}")] })))).toBe(0);
  });
});

describe("classification", () => {
  it("Nath's Elite is native; Springjack Knight (a TARGETING payoff inside the branch) parks", () => {
    expect(classifyCard(ELITE)).toMatch(/^native/);
    expect(classifyCard(SPRINGJACK)).not.toMatch(/^native/);
  });
});

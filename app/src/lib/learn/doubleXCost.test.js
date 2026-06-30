/**
 * doubleXCost.test.js — the DOUBLE-X COST subsystem (CR 107.3). A "{X}{X}" mana cost charges the player 2X
 * mana; the EFFECT (enters-with-counters / token count / token P/T) uses the single chosen X. The old
 * machinery folded only X into the generic cost (an underpay FP for every double-X card); now parseManaCost
 * counts the X pips (xCount) and legalChoices.xResolvedCost pays generic + xCount*X, while the action's xValue
 * stays X for resolution. This file pins:
 *   1. parseManaCost.xCount + xResolvedCost (the cost-resolution unit);
 *   2. Walking Ballista ({X}{X}) + Cryptic Trilobite ({X}{X}) classify native AND pay 2X at runtime, entering
 *      at the X/X their single X buys (count = X, cost = 2X) — the CREED invariant;
 *   3. X/X-P/T tokens: Gelatinous Genesis ({X}{X}{G} "Create X X/X") + Slime Molding ({X}{G} "an X/X")
 *      classify native-spell and mint tokens at xValue/xValue, paying the right total mana;
 *   4. CREED anti-FP: a "create an X/X …, where X is <board metric>" card (Spoils of Blood / Miming Slime) is
 *      NOT credited (its P/T is a board count, not the cast {X}); the double-X cost never underpays.
 * Real oracle text (verified vs the local Scryfall index), verbatim.
 */
import { describe, it, expect } from "vitest";
import { classifyCard } from "./coverage.js";
import { parseManaCost, xResolvedCost, legalActionsForPlayer } from "./legalChoices.js";
import { parseEffectProgram } from "./effects/parser.js";
import { createGameState, _resetIdsForTests } from "./gameState.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { permanentPower, permanentToughness } from "./layers.js";

// ── real oracles ──
const BALLISTA = {
  name: "Walking Ballista", type: "Artifact Creature — Construct", mana: "{X}{X}", power: 0, toughness: 0,
  oracle: "This creature enters with X +1/+1 counters on it.\n{4}: Put a +1/+1 counter on this creature.\nRemove a +1/+1 counter from this creature: It deals 1 damage to any target.",
};
const TRILOBITE = {
  name: "Cryptic Trilobite", type: "Creature — Trilobite", mana: "{X}{X}", power: 0, toughness: 0,
  oracle: "This creature enters with X +1/+1 counters on it.\nRemove a +1/+1 counter from this creature: Add {C}{C}. Spend this mana only to activate abilities.\n{1}, {T}: Put a +1/+1 counter on this creature.",
};
const GENESIS = { name: "Gelatinous Genesis", type: "Sorcery", mana: "{X}{X}{G}", oracle: "Create X X/X green Ooze creature tokens." };
const SLIME = { name: "Slime Molding", type: "Sorcery", mana: "{X}{G}", oracle: "Create an X/X green Ooze creature token." };
// CREED guard cards — variable P/T is a BOARD metric, NOT the cast {X}; must stay Arbiter.
const SPOILS = { name: "Spoils of Blood", type: "Instant", mana: "{B}", oracle: "Create an X/X black Horror creature token, where X is the number of creatures that died this turn." };
const MIMING = { name: "Miming Slime", type: "Sorcery", mana: "{2}{G}", oracle: "Create an X/X green Ooze creature token, where X is the greatest power among creatures you control." };

describe("DOUBLE-X — parseManaCost.xCount + xResolvedCost (the cost-resolution unit)", () => {
  it("counts each {X}/{Y}/{Z} pip into xCount (and still sets hasX)", () => {
    expect(parseManaCost("{X}{X}").xCount).toBe(2);
    expect(parseManaCost("{X}{X}").hasX).toBe(true);
    expect(parseManaCost("{X}{X}{X}{R}{R}").xCount).toBe(3);
    expect(parseManaCost("{X}{G}").xCount).toBe(1);
    expect(parseManaCost("{X}{Y}{Z}{R}{R}").xCount).toBe(3); // the Ultimate Nightmare form
  });
  it("a non-X cost has xCount 0", () => {
    expect(parseManaCost("{2}{G}").xCount).toBe(0);
    expect(parseManaCost("{2}{G}").hasX).toBe(false);
  });
  it("xResolvedCost pays generic + xCount*X — a {X}{X} cost owes 2X (CR 107.3)", () => {
    expect(xResolvedCost(parseManaCost("{X}{X}"), 3).generic).toBe(6);     // 0 + 2*3
    expect(xResolvedCost(parseManaCost("{X}{X}{G}"), 4).generic).toBe(8);  // 0 + 2*4 (the {G} pip is separate)
    expect(xResolvedCost(parseManaCost("{X}{G}"), 4).generic).toBe(4);     // single X — unchanged
    expect(xResolvedCost(parseManaCost("{2}{X}{X}"), 5).generic).toBe(12); // 2 + 2*5
  });
  it("xResolvedCost defaults to a single X when xCount is absent (back-compat)", () => {
    expect(xResolvedCost({ generic: 1, hasX: true }, 3).generic).toBe(4); // 1 + 1*3
  });
});

// helper: cast `card` for X via the real legalChoices→dispatch→resolve flow; return mana spent + the board.
function castForX(card, X, { G = 0, C = 30 } = {}) {
  _resetIdsForTests();
  let s = createGameState({ userDeck: [], aiDeck: [] });
  const c = { ...card, id: "dx" };
  s = {
    ...s, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
    players: { ...s.players, user: { ...s.players.user, hand: [c], manaPool: { ...s.players.user.manaPool, G, C } } },
  };
  const cast = legalActionsForPlayer(s, "user").find((a) => a.kind === "cast-spell" && a.cardId === "dx" && a.xValue === X);
  expect(cast, `an X=${X} cast was offered`).toBeTruthy();
  const before = Object.values(s.players.user.manaPool).reduce((a, b) => a + b, 0);
  s = dispatchAction(s, cast);
  const spent = before - Object.values(s.players.user.manaPool).reduce((a, b) => a + b, 0);
  s = resolveTopOfStack(s);
  return { s, spent, costGeneric: cast.cost.generic };
}

describe("DOUBLE-X — enters-with-X permanents flip native AND pay 2X (the CREED invariant)", () => {
  it("Walking Ballista ({X}{X}) → native-activated", () => {
    expect(classifyCard(BALLISTA)).toBe("native-activated");
  });
  it("Cryptic Trilobite ({X}{X}) → native-mana", () => {
    expect(classifyCard(TRILOBITE)).toBe("native-mana");
  });
  it("Walking Ballista cast for X=3 pays 6 mana (2X) and enters as a real 3/3 with 3 counters", () => {
    const { s, spent, costGeneric } = castForX(BALLISTA, 3, { C: 20 });
    expect(costGeneric).toBe(6);   // the cost folds 2X into generic
    expect(spent).toBe(6);         // the dispatcher actually paid 2X — NOT the old underpaying 3
    const perm = s.players.user.battlefield.find((p) => p.card.id === "dx");
    expect(perm).toBeTruthy();
    expect(perm.counters["+1/+1"]).toBe(3);             // the EFFECT uses the single X (3), not 2X
    expect(permanentPower(s, perm.id)).toBe(3);
    expect(permanentToughness(s, perm.id)).toBe(3);
  });
  it("Cryptic Trilobite cast for X=4 pays 8 mana (2X) and enters at 4/4 (closes the latent underpay FP)", () => {
    const { s, spent } = castForX(TRILOBITE, 4, { C: 20 });
    expect(spent).toBe(8);
    const perm = s.players.user.battlefield.find((p) => p.card.id === "dx");
    expect(perm.counters["+1/+1"]).toBe(4);
    expect(permanentPower(s, perm.id)).toBe(4);
  });
});

describe("DOUBLE-X — X/X-P/T tokens flip native-spell AND mint at the chosen X", () => {
  it("Gelatinous Genesis parses to a countX + ptX create-token (xSpell)", () => {
    const p = parseEffectProgram(GENESIS);
    expect(p.xSpell).toBe(true);
    expect(p.atoms).toHaveLength(1);
    expect(p.atoms[0]).toMatchObject({ op: "create-token", descriptor: "green ooze", countX: true, ptX: true });
  });
  it("Slime Molding parses to a single (count=1) ptX create-token (xSpell)", () => {
    const p = parseEffectProgram(SLIME);
    expect(p.xSpell).toBe(true);
    expect(p.atoms[0]).toMatchObject({ op: "create-token", count: 1, ptX: true });
    expect(p.atoms[0].countX).toBeUndefined();
  });
  it("Gelatinous Genesis ({X}{X}{G}) + Slime Molding ({X}{G}) → native-spell", () => {
    expect(classifyCard(GENESIS)).toBe("native-spell");
    expect(classifyCard(SLIME)).toBe("native-spell");
  });
  it("Gelatinous Genesis cast for X=3 pays 7 mana (2X + G) and makes 3 tokens, all 3/3", () => {
    const { s, spent } = castForX(GENESIS, 3, { G: 3, C: 30 });
    expect(spent).toBe(7); // 2*3 + 1 (the {G})
    const toks = s.players.user.battlefield.filter((p) => p.card.token);
    expect(toks).toHaveLength(3);
    for (const t of toks) {
      expect(permanentPower(s, t.id)).toBe(3);
      expect(permanentToughness(s, t.id)).toBe(3);
    }
  });
  it("Slime Molding cast for X=4 pays 5 mana (X + G) and makes one 4/4", () => {
    const { s, spent } = castForX(SLIME, 4, { G: 3, C: 30 });
    expect(spent).toBe(5); // 1*4 + 1 (the {G})
    const toks = s.players.user.battlefield.filter((p) => p.card.token);
    expect(toks).toHaveLength(1);
    expect(permanentPower(s, toks[0].id)).toBe(4);
    expect(permanentToughness(s, toks[0].id)).toBe(4);
  });
});

describe("DOUBLE-X — CREED anti-FP: a board-metric X/X token is NOT credited as a cast-X token", () => {
  it("Spoils of Blood ('where X is creatures that died') stays arbiter-spell — P/T is a board count, not {X}", () => {
    expect(classifyCard(SPOILS)).toBe("arbiter-spell");
    expect(parseEffectProgram(SPOILS).confidence).toBe("low");
  });
  it("Miming Slime ('where X is greatest power') stays arbiter-spell — never mis-read as the cast X", () => {
    expect(classifyCard(MIMING)).toBe("arbiter-spell");
    expect(parseEffectProgram(MIMING).confidence).toBe("low");
  });
});

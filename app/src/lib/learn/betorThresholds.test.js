/**
 * betorThresholds.test.js — BETOR, KIN TO ALL (2026-08-14), Dragons' toughness ladder. "At the
 * beginning of your end step, if creatures you control have total toughness 10 or greater, draw a
 * card. Then if …20 or greater, untap each creature you control. Then if …40 or greater, each
 * opponent loses half their life, rounded up."
 *
 * ⭐ THREE PIECES: the total-toughness interveningIf predicate (a LAYER-AWARE sum — the powerAtLeast
 * discipline), the SEQUENTIAL "Then if" ladder fold (each rung a conditional atom evaluated at ITS
 * point in the resolution, CR 608.2c), and the each-opponent half-life arm (the existing half
 * machinery fanned across opponents — each computes THEIR OWN half).
 *
 * Mutation-checked (2026-08-14, applied-check by PRINTING THE CHANGED LINE BACK; throw on no-op):
 *   · the predicate disabled -> Betor parks (the trigger's own interveningIf goes unreadable).
 *   · the ladder fold disabled -> Betor parks (the Then-ifs orphan).
 *   · the sum's creature gate dropped -> a noncreature artifact's toughness would count (dies).
 *
 * Real oracle fixture (bundled Scryfall, probed 2026-08-14 — the FULL text).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { parseEffectClause } from "./effects/parser.js";
import { evaluateInterveningIf } from "./interveningIf.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const BETOR = { id: "c-bt", name: "Betor, Kin to All", type: "Legendary Creature — Spirit Dragon", mana: "{2}{W}{B}{G}", power: "5", toughness: "7",
  oracle: "Flying\nAt the beginning of your end step, if creatures you control have total toughness 10 or greater, draw a card. Then if creatures you control have total toughness 20 or greater, untap each creature you control. Then if creatures you control have total toughness 40 or greater, each opponent loses half their life, rounded up." };
const FX = "draw a card. Then if creatures you control have total toughness 20 or greater, untap each creature you control. Then if creatures you control have total toughness 40 or greater, each opponent loses half their life, rounded up";

const board = (toughnesses) => {
  const g = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
  const bf = toughnesses.map((t, i) => createPermanent({ id: "C" + i, controller: "user", summoningSick: false,
    card: { id: "card-C" + i, name: "Body " + i, type: "Creature — Spirit", power: "2", toughness: String(t), oracle: "" } }));
  return { ...g, players: { ...g.players, user: { ...g.players.user, battlefield: bf } } };
};
const COND = (n) => `creatures you control have total toughness ${n} or greater`;

describe("the carrier and the ladder", () => {
  it("⭐ Betor flips native-trigger; the program is [draw, conditional(20), conditional(40)]", () => {
    expect(classifyCard(BETOR)).toBe("native-trigger");
    const p = parseEffectClause(FX, "Instant");
    expect(p.confidence).toBe("high");
    expect(p.atoms.map((a) => a.op)).toEqual(["draw", "conditional", "conditional"]);
    expect(p.atoms[1].branchOn).toBe(COND(20));
    expect(p.atoms[2].branchOn).toBe(COND(40));
  });
});

describe("⭐⭐ LAW 6 — the sum is layer-aware creatures-only, each threshold exact", () => {
  it("⭐⭐ three 7-toughness creatures (21 total): 10 ✓ · 20 ✓ · 40 ✗", () => {
    const s = board([7, 7, 7]);
    const row = { t10: evaluateInterveningIf(s, COND(10), "user", {}), t20: evaluateInterveningIf(s, COND(20), "user", {}), t40: evaluateInterveningIf(s, COND(40), "user", {}) };
    console.log("  WITNESS betorLadder", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ t10: true, t20: true, t40: false });
  });

  it("⛔ a NONCREATURE's toughness never counts (an empty creature board sums 0)", () => {
    const g = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
    const wall = createPermanent({ id: "A", controller: "user", summoningSick: false,
      card: { id: "card-A", name: "Fortress", type: "Artifact", toughness: "99", oracle: "" } });
    const s = { ...g, players: { ...g.players, user: { ...g.players.user, battlefield: [wall] } } };
    expect(evaluateInterveningIf(s, COND(10), "user", {})).toBe(false);
  });
});

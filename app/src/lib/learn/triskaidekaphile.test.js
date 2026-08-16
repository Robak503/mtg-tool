/**
 * triskaidekaphile.test.js — "you have EXACTLY thirteen cards in your hand, you win" (SHELF-TAIL SH2 —
 * Triskaidekaphile; CR 104.2a). The upkeep-win lane already existed (Felidar Sovereign "40 or more life",
 * Mortal Combat's graveyard count); the gap was the CONDITION — an EXACT hand-count (=== 13, never ≥), plus
 * "thirteen" (a teen, absent from the tens-only cardinal allowlist). The "no maximum hand size" static on
 * the same card is what makes holding exactly 13 legal; it was already native alone. Flip +1/0/0.
 *
 * Mutation-checked (via Edit): disabling the hand-count arm → the evaluator nulls → Triskaidekaphile body-
 * only (classify pin dies); flipping === to >= → the "14 does NOT win" pin dies (an over-13 hand would
 * wrongly win — the exact-count is the whole point of a thirteen-fragile combo).
 */
import { describe, it, expect } from "vitest";
import { classifyCard } from "./coverage.js";
import { evaluateWinThreshold, winConditionParseable } from "./effects/atoms/winGame.js";

const COND = "you have exactly thirteen cards in your hand";
const handOf = (n) => ({ players: { user: { hand: Array.from({ length: n }, () => ({})), life: 20, battlefield: [], graveyard: [] } } });

describe("SH2 — the win threshold reads an EXACT hand count", () => {
  it("winConditionParseable accepts it; the tens-only allowlist now includes thirteen", () => {
    expect(winConditionParseable(COND)).toBe(true);
  });
  it("exactly 13 wins; 12 and 14 do NOT (the fragile exact-count — mutation-check line)", () => {
    expect(evaluateWinThreshold(handOf(13), COND, "user")).toBe(true);
    expect(evaluateWinThreshold(handOf(12), COND, "user")).toBe(false);
    expect(evaluateWinThreshold(handOf(14), COND, "user")).toBe(false);
  });
  it("CREED — an exact count the allowlist can't read → null (no fail-open win)", () => {
    expect(evaluateWinThreshold(handOf(12), "you have exactly twelve cards in your hand", "user")).toBeNull();
  });
});

describe("SH2 — classify", () => {
  it("Triskaidekaphile classifies native (its win trigger + no-max-hand static + draw activated)", () => {
    expect(classifyCard({ name: "Triskaidekaphile", type: "Creature — Human Wizard", power: 0, toughness: 3, oracle: "You have no maximum hand size.\nAt the beginning of your upkeep, if you have exactly thirteen cards in your hand, you win the game.\n{3}{U}: Draw a card." })).toBe("native-mixed");
  });
});

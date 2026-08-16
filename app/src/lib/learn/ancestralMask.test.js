/**
 * ancestralMask.test.js — "gets +N/+N for each OTHER <X> on the battlefield" on an ATTACHED permanent
 * (SHELF-TAIL SH3 — Ancestral Mask; CR 109.5 + 613 layer 7c). The count is board-wide but "other" excludes
 * the SOURCE aura/equipment — which the CREATURE-scoped count eval can't see, so the source over-counted
 * itself (Mask gave 6/6 not 4/4 on a two-other-enchantment board). parseAttachedBonus used to DROP the whole
 * bonus (safe FN); now it emits the op and applyLayer7's dynamic-count branch subtracts the source (it holds
 * `cs`, the source permanent) for an attached excludeSelf count. Flip +1/0/0, LOST 0 (retiring the parse
 * guard broke no other subtypeOnBattlefield card).
 *
 * Mutation-checked (via Edit): the source-exclusion in applyLayer7 → the source counts itself → the
 * magnitude is 2(N+1) not 2N (the count pin dies — the hollow-gate: a native flip with the WRONG number).
 */
import { describe, it, expect, beforeEach } from "vitest";
import { classifyCard } from "./coverage.js";
import { permanentPower, permanentToughness } from "./layers.js";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const MASK_ORACLE = "Enchant creature\nEnchanted creature gets +2/+2 for each other enchantment on the battlefield.";
const ench = (id, controller = "user") => createPermanent({ id, controller, card: { id: `c${id}`, name: id, type: "Enchantment", oracle_text: "" } });

/** Bear enchanted by Ancestral Mask, plus `others` extra enchantments; returns "P/T". */
function bearPT(others) {
  const s0 = createGameState({ userDeck: [], aiDeck: [] });
  const bear = createPermanent({ id: "bear", controller: "user", card: { id: "cb", name: "Bear", type: "Creature — Bear", power: 2, toughness: 2, oracle_text: "" } });
  const mask = createPermanent({ id: "mask", controller: "user", card: { id: "cm", name: "Ancestral Mask", type: "Enchantment — Aura", oracle_text: MASK_ORACLE } });
  mask.attachedTo = "bear"; bear.attachments = ["mask"];
  const s = { ...s0, players: { ...s0.players, user: { ...s0.players.user, battlefield: [bear, mask, ...others] } } };
  return permanentPower(s, "bear") + "/" + permanentToughness(s, "bear");
}

describe("SH3 — classify", () => {
  it("Ancestral Mask classifies native-aura", () => {
    expect(classifyCard({ name: "Ancestral Mask", type: "Enchantment — Aura", oracle: MASK_ORACLE })).toBe("native-aura");
  });
});

describe("SH3 — the count excludes the SOURCE aura (the whole point of 'other')", () => {
  it("Mask alone → base 2/2 (zero OTHER enchantments)", () => {
    expect(bearPT([])).toBe("2/2");
  });
  it("Mask + TWO other enchantments → 6/6, NOT 8/8 (the Mask never counts itself — mutation-check line)", () => {
    // three enchantments are on the battlefield (Mask + 2), but "other" is 2 → +4/+4. Counting the Mask
    // would give +6/+6 → 8/8 (the pre-fix over-count).
    expect(bearPT([ench("x1"), ench("x2", "ai")])).toBe("6/6");
  });
  it("the board count spans ALL players (an opponent's enchantment still counts)", () => {
    // Mask + 1 own + 2 opponent = 3 other → +6/+6 → 8/8
    expect(bearPT([ench("y1"), ench("y2", "ai"), ench("y3", "ai")])).toBe("8/8");
  });
});

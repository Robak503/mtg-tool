/**
 * escalateKeyword.test.js — ESCALATE (CR 702.121a), admitted with the multi-mode option WITHHELD.
 *
 * "Escalate [cost]" means "For each mode you choose beyond the first, you must pay [cost] as an additional
 * cost to cast this spell." (Borrowed Hostility, Borrowed Malevolence, Borrowed Grace, Collective Resistance.)
 *
 * ⛔ IT IS NOT A FREE STRIP, AND THE MEASUREMENT IS WHAT SAID SO. "Choose one or both —" parses to
 * chooseCount 2 / upTo true, so the cast path genuinely CAN pick both modes — and picking both without paying
 * escalate casts the spell for less than its cost, which is a false positive, not an under-model. The keyword
 * looked like another cost-shaped line right up until that number was checked.
 *
 * ⭐ SO IT IS ADMITTED THE AFTERMATH WAY: unpark the card only once the lane withholds the option it cannot
 * price. The modal is clamped to a single mode, which is a real, complete, legal cast at the printed cost with
 * no escalate cost ever due — the same bargain fuse / delve / myriad / replicate / squad are credited under.
 * `escalateSingleMode` records WHY the modal is narrower than the printed card, so a later reader sees a
 * deliberate under-offer instead of a parse bug.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { parseEffectProgram, programConfidence } from "./effects/parser.js";
import { classifyCard } from "./coverage.js";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { legalActionsForPlayer } from "./legalChoices.js";

beforeEach(() => _resetIdsForTests());

const BORROWED_HOSTILITY = {
  name: "Borrowed Hostility", type: "Instant", mana: "{1}{R}",
  oracle: "Escalate {3} (Pay this cost for each mode chosen beyond the first.)\nChoose one or both —\n• Target creature gets +3/+0 until end of turn.\n• Target creature gains first strike until end of turn.",
};
// The SAME card without the keyword — the modal the printed card actually offers.
const UNESCALATED = { ...BORROWED_HOSTILITY, name: "Unescalated", oracle: BORROWED_HOSTILITY.oracle.split("\n").slice(1).join("\n") };

describe("the clamp", () => {
  it("⭐ the card is native and the modal is single-mode", () => {
    const p = parseEffectProgram(BORROWED_HOSTILITY);
    expect(programConfidence(p)).toBe("high");
    expect(classifyCard(BORROWED_HOSTILITY)).toBe("native-spell");
    expect(p.modal.chooseCount).toBe(1);
    expect(p.modal.upTo).toBe(false);
    expect(p.escalateSingleMode).toBe(true);
  });

  it("⛔⭐ WITHOUT the clamp the same body offers BOTH modes — this is the FP being avoided", () => {
    // ⚠️ The assertion that makes the clamp legible rather than arbitrary. The identical modal text, absent
    // the escalate keyword, parses to chooseCount 2 / upTo true. That is the shape the cast path would use to
    // pick both modes for the base price, which is why escalate could not simply be stripped.
    const p = parseEffectProgram(UNESCALATED);
    expect(p.modal.chooseCount).toBe(2);
    expect(p.modal.upTo).toBe(true);
    expect(p.escalateSingleMode).toBeUndefined();
  });

  it("⛔ both modes are still MODELED — the clamp narrows the choice, not the card", () => {
    expect(parseEffectProgram(BORROWED_HOSTILITY).modal.modes).toHaveLength(2);
  });

  it("⛔ an unmodeled mode still parks the card (whole-card CREED)", () => {
    const bad = { ...BORROWED_HOSTILITY, name: "Bad", oracle: BORROWED_HOSTILITY.oracle.replace("Target creature gains first strike until end of turn.", "Each player glorbulates.") };
    expect(classifyCard(bad)).not.toBe("native-spell");
  });
});

describe("⛔⭐ RUNTIME — the multi-mode cast is genuinely never offered", () => {
  const castsOf = (card) => {
    const s = createGameState({ userDeck: [], aiDeck: [] });
    const lands = Array.from({ length: 6 }, (_, i) => createPermanent({ id: `m${i}`, controller: "user", card: { id: `m${i}`, name: "Mountain", type: "Basic Land — Mountain" } }));
    const bear = Object.assign(createPermanent({ id: "b", controller: "user", card: { id: "b", name: "Bear", type: "Creature — Bear", power: 2, toughness: 2 } }), { summoningSick: false });
    const st = {
      ...s, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main",
      players: { ...s.players, user: { ...s.players.user, hand: [{ ...card, id: "h1" }], battlefield: [...lands, bear] } },
    };
    return (legalActionsForPlayer(st, "user") || []).filter((a) => a.kind === "cast-spell" && a.cardId === "h1");
  };
  const modeCount = (a) => (Array.isArray(a.chosenMode) ? a.chosenMode.length : (a.chosenMode != null ? 1 : 0));

  it("⭐⭐ POSITIVE CONTROL — a plain choose-one modal IS offered (proves the harness sees casts)", () => {
    // Kept because the equivalent check on a previous slice reported "not offered" purely from a game state
    // with no priority window. A zero here must mean the engine, not the fixture.
    const plain = { name: "Plain", type: "Instant", mana: "{R}", oracle: "Choose one —\n• Target creature gets +3/+0 until end of turn.\n• Target creature gains first strike until end of turn." };
    expect(castsOf(plain).length).toBeGreaterThan(0);
  });

  it("⭐ every offered cast of an escalate card chooses exactly ONE mode", () => {
    const offers = castsOf(BORROWED_HOSTILITY);
    expect(offers.length).toBeGreaterThan(0);
    expect([...new Set(offers.map(modeCount))]).toEqual([1]);
  });

  it("⛔⭐ and the UNCLAMPED twin does offer a two-mode cast — the difference is the whole slice", () => {
    // Without this pair the single-mode assertion above could pass on an engine that never offers two modes
    // to anything. Asserted together, they pin the clamp specifically.
    expect(castsOf(UNESCALATED).some((a) => modeCount(a) === 2)).toBe(true);
  });
});

/**
 * EACHOP-DISCARD — "whenever …, each opponent discards a card" (Liliana's Specter, Burglar Rat,
 * Cackling Fiend, Noxious Toad). Non-targeted mass scope (who:"eachOpponent", targetType:null) so
 * triggers with this effect route natively — atomTargetIntent returns null, programNeedsChosenTarget
 * is false. The resolver walks opponentsOf via the shared advanceDiscardChain.
 *
 * CREED: opponent-only scope must NOT cause the controller to discard; eachPlayer (Delirium Skeins)
 * continues to hit everybody including the controller — these two forms are distinct.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { parseEffectClause } from "./effects/parser.js";
import { classifyCard } from "./coverage.js";
import { _resetIdsForTests, createGameState } from "./gameState.js";
import { resolveAtom } from "./effects/effectAtoms.js";

beforeEach(() => _resetIdsForTests());

// ─── Parser ──────────────────────────────────────────────────────────────────

describe("EACHOP-DISCARD — parser", () => {
  it("parses 'each opponent discards a card' → eachOpponent, targetType null", () => {
    const result = parseEffectClause("each opponent discards a card");
    expect(result).toMatchObject({ confidence: "high", atoms: [{ op: "discard", who: "eachOpponent", amount: 1, targetType: null }] });
  });

  it("parses 'each opponent discards two cards' → amount 2", () => {
    const result = parseEffectClause("each opponent discards two cards");
    expect(result).toMatchObject({ confidence: "high", atoms: [{ op: "discard", who: "eachOpponent", amount: 2, targetType: null }] });
  });

  it("does NOT match 'each player discards a card' as eachOpponent", () => {
    const result = parseEffectClause("each player discards a card");
    expect(result.atoms[0].who).toBe("eachPlayer");
  });
});

// ─── Coverage flips ───────────────────────────────────────────────────────────

describe("EACHOP-DISCARD — coverage flips", () => {
  it("Noxious-Toad-style dies trigger flips native-trigger", () => {
    expect(classifyCard({
      type: "Creature — Frog",
      name: "Test Toad",
      mana: "{1}{B}",
      oracle: "When Test Toad dies, each opponent discards a card.",
    })).toBe("native-trigger");
  });

  it("Burglar-Rat-style ETB-only trigger flips native-trigger", () => {
    expect(classifyCard({
      type: "Creature — Rat",
      name: "Test Rat",
      mana: "{1}{B}",
      oracle: "When Test Rat enters, each opponent discards a card.",
    })).toBe("native-trigger");
  });

  it("Cackling-Fiend-style (2-card discard) flips native-trigger", () => {
    expect(classifyCard({
      type: "Creature — Zombie",
      name: "Test Fiend",
      mana: "{3}{B}",
      oracle: "When Test Fiend enters, each opponent discards two cards.",
    })).toBe("native-trigger");
  });

  it("'each player discards' (Delirium Skeins form) still routes natively and is distinct", () => {
    expect(classifyCard({
      type: "Sorcery",
      name: "Test Skeins",
      mana: "{2}{B}",
      oracle: "Each player discards a card.",
    })).toBe("native-spell");
  });
});

// ─── Engine: eachOpponent hits only opponents, not the controller ─────────────

describe("EACHOP-DISCARD — engine", () => {
  function stateWith({ userHand = [], aiHand = [] } = {}) {
    const s = createGameState({ userDeck: [], aiDeck: [] });
    return {
      ...s,
      players: {
        ...s.players,
        user: { ...s.players.user, hand: userHand },
        ai: { ...s.players.ai, hand: aiHand },
      },
    };
  }

  it("each opponent discards: opponent loses a card, controller hand unchanged", () => {
    const aiCard = { id: "c1", name: "Card", type: "Sorcery", oracle: "" };
    const state = stateWith({ userHand: [], aiHand: [aiCard] });

    const atom = { op: "discard", who: "eachOpponent", amount: 1, targetType: null };
    const ctx = { controller: "user", targets: [] };
    const next = resolveAtom(state, atom, ctx);

    // Opponent (ai) should have discarded their card
    expect(next.players.ai.hand).toHaveLength(0);
    // Controller (user) hand unchanged (was already empty)
    expect(next.players.user.hand).toHaveLength(0);
  });

  it("each opponent discards: controller hand is preserved even if non-empty", () => {
    const userCard = { id: "u1", name: "UCard", type: "Instant", oracle: "" };
    const aiCard = { id: "a1", name: "ACard", type: "Creature", oracle: "" };
    const state = stateWith({ userHand: [userCard], aiHand: [aiCard] });

    const atom = { op: "discard", who: "eachOpponent", amount: 1, targetType: null };
    const ctx = { controller: "user", targets: [] };
    const next = resolveAtom(state, atom, ctx);

    expect(next.players.ai.hand).toHaveLength(0);    // opponent discarded
    expect(next.players.user.hand).toHaveLength(1);  // controller untouched
  });

  it("each player discard still hits controller (eachPlayer form unchanged)", () => {
    const userCard = { id: "u2", name: "UCard2", type: "Instant", oracle: "" };
    const aiCard = { id: "a2", name: "ACard2", type: "Creature", oracle: "" };
    const state = stateWith({ userHand: [userCard], aiHand: [aiCard] });

    const atom = { op: "discard", who: "eachPlayer", amount: 1, targetType: null };
    const ctx = { controller: "user", targets: [] };
    const next = resolveAtom(state, atom, ctx);

    // Both players discard one card
    expect(next.players.user.hand).toHaveLength(0);
    expect(next.players.ai.hand).toHaveLength(0);
  });
});

/**
 * PR 10.6 — end-to-end integration: a session plays a real game.
 *
 * These exercise the whole stack (mana -> cast -> combat -> damage -> a
 * winner) the way The Academy does, in both modes and at the difficulties
 * that matter. They are the regression net for the original "engine got
 * stuck" report.
 */

import { describe, expect, it, beforeEach, vi } from "vitest";
import { _resetIdsForTests } from "./gameState.js";
import { createLearnSession, advanceUntilDecision, applyChoice } from "./learnSession.js";

beforeEach(() => _resetIdsForTests());

function forest(i) {
  return { id: `f-${i}`, name: "Forest", type: "Basic Land — Forest", oracle: "{T}: Add {G}.", mana: "" };
}
function bear(i) {
  return { id: `b-${i}`, name: "Grizzly Bears", type: "Creature — Bear", oracle: "", mana: "{1}{G}", cmc: 2, keywords: [], power: 2, toughness: 2 };
}
function aggroDeck(prefix) {
  const cards = [];
  for (let i = 0; i < 25; i++) cards.push(forest(`${prefix}-${i}`));
  for (let i = 0; i < 25; i++) cards.push(bear(`${prefix}-${i}`));
  return cards;
}
// Top of library alternates land/creature so the player actually draws spells.
function interleavedDeck(prefix) {
  const cards = [];
  for (let i = 0; i < 30; i++) {
    cards.push(forest(`${prefix}-f${i}`));
    cards.push(bear(`${prefix}-b${i}`));
  }
  return cards;
}

describe("Standard 1v1", () => {
  it("expert autopilots a full game to a definite end (no engine-stuck)", () => {
    const sess = createLearnSession({ userDeck: aggroDeck("u"), opponentDeck: aggroDeck("a"), difficulty: "expert" });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { session: out, decision } = advanceUntilDecision(sess);
    warn.mockRestore();
    expect(decision.kind).toBe("game-over");
    expect(["user-wins", "ai-wins", "draw"]).toContain(out.status);
  });

  it("intermediate STOPS to ask the user a real decision (the inverse of the bug)", () => {
    const sess = createLearnSession({ userDeck: interleavedDeck("u"), opponentDeck: aggroDeck("a"), difficulty: "intermediate" });
    const { decision } = advanceUntilDecision(sess);
    // Pre-fix this auto-piloted into the safety cap; now the user is prompted
    // (a castable spell) instead of being stuck.
    expect(decision.kind).toBe("ask");
    expect(Array.isArray(decision.options)).toBe(true);
    expect(decision.options.length).toBeGreaterThan(0);
  });

  it("a user choice advances the game and returns the next decision", () => {
    const sess = createLearnSession({ userDeck: interleavedDeck("u"), opponentDeck: aggroDeck("a"), difficulty: "intermediate" });
    const first = advanceUntilDecision(sess);
    expect(first.decision.kind).toBe("ask");
    // Pick the recommended option and confirm the engine keeps moving.
    const choice = first.decision.metadata?.suggestion || first.decision.options[0];
    const next = applyChoice(first.session, choice);
    expect(["ask", "game-over"]).toContain(next.decision.kind);
  });
});

describe("Commander 4P FFA", () => {
  it("expert autopilots a full 4-player game to a definite end", () => {
    const sess = createLearnSession({
      mode: "commander",
      userDeck: aggroDeck("u"),
      opponentDecks: [aggroDeck("a1"), aggroDeck("a2"), aggroDeck("a3")],
      difficulty: "expert",
    });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { session: out, decision } = advanceUntilDecision(sess);
    warn.mockRestore();
    expect(decision.kind).toBe("game-over");
    expect(["user-wins", "ai-wins", "draw"]).toContain(out.status);
  });
});

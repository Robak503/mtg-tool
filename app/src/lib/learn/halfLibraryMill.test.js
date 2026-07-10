/**
 * halfLibraryMill.test.js — HALF-LIBRARY targeted mill (Kitsune's Technique, rounded up; Traumatize,
 * rounded down — SHELF S7). "Target opponent/player mills half their library, rounded up/down": a chosen
 * player target whose amount is half THEIR live library at resolution (CR 608.2h) with the printed
 * rounding. Kitsune's Sneak line is the cost-only keyword class (already stripped — the runtime hard-casts
 * at full price). CREED FP = wrong half (rounding), the wrong player's library, or a mill on a vanished
 * target.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState } from "./gameState.js";
import { parseEffectClause, programConfidence } from "./effects/parser.js";
import { applyMill } from "./effects/atoms/library.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

// Real oracle text (bundled Scryfall data — never from memory).
const KITSUNE = { id: "kt", name: "Kitsune's Technique", type: "Instant", mana: "{4}{U}{U}",
  oracle: "Sneak {1}{U} (You may cast this spell for {1}{U} if you also return an unblocked attacker you control to hand during the declare blockers step.)\nTarget opponent mills half their library, rounded up." };
const TRAUMATIZE = { id: "tz", name: "Traumatize", type: "Sorcery", mana: "{3}{U}{U}",
  oracle: "Target player mills half their library, rounded down." };

function withLibrary(state, pid, n) {
  const lib = Array.from({ length: n }, (_, i) => ({ id: `${pid}-c${i}`, name: `C${i}`, type: "Instant", oracle: "" }));
  return { ...state, players: { ...state.players, [pid]: { ...state.players[pid], library: lib, graveyard: [] } } };
}

describe("parse + classify", () => {
  it("both roundings parse HIGH to the targeted half-library atom; both cards flip native-spell", () => {
    const up = parseEffectClause("target opponent mills half their library, rounded up", "Instant");
    expect(programConfidence(up)).toBe("high");
    expect(up.atoms).toEqual([{ op: "mill", who: "target", targetType: "opponent", halfLibrary: true, round: "up", amount: 0 }]);
    expect(classifyCard(KITSUNE)).toBe("native-spell");
    expect(classifyCard(TRAUMATIZE)).toBe("native-spell");
  });
  it("CREED — a bare 'half their library' with NO stated rounding stays LOW", () => {
    expect(programConfidence(parseEffectClause("target player mills half their library", "Instant"))).not.toBe("high");
  });
});

describe("resolver (CREED core — exact halves per target's LIVE library)", () => {
  const UP = { op: "mill", who: "target", halfLibrary: true, round: "up", amount: 0 };
  const DOWN = { op: "mill", who: "target", halfLibrary: true, round: "down", amount: 0 };

  it("an ODD 7-card library: rounded up mills 4; rounded down mills 3 — from THAT player's library only", () => {
    let s = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
    s = withLibrary(s, "ai1", 7);
    s = withLibrary(s, "user", 5);
    const up = applyMill(s, UP, { controller: "user", targets: [{ type: "player", id: "ai1" }] });
    expect(up.players.ai1.graveyard).toHaveLength(4);
    expect(up.players.ai1.library).toHaveLength(3);
    expect(up.players.user.library).toHaveLength(5); // the caster's library untouched
    const down = applyMill(s, DOWN, { controller: "user", targets: [{ type: "player", id: "ai1" }] });
    expect(down.players.ai1.graveyard).toHaveLength(3);
  });

  it("a vanished/absent target mills nobody", () => {
    let s = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
    s = withLibrary(s, "ai1", 6);
    const after = applyMill(s, UP, { controller: "user", targets: [] });
    expect(after.players.ai1.graveyard).toHaveLength(0);
  });
});

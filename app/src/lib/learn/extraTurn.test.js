/**
 * extraTurn.test.js — BLITZ XT-1: "Take an extra turn after this one." (CR 500.7 — Time Walk /
 * Temporal Manipulation / Capture of Jingzhou; Second Chance's conditional upkeep trigger rides the
 * same atom). The resolver pushes the controller onto a LIFO stack; advanceStep's end-of-turn branch
 * pops it (most-recently-created first, CR 500.7) instead of rotating, and rotation resumes with the
 * normally-scheduled seat once the stack drains. Real oracle fixtures (bundled Scryfall, 2026-07-16).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState } from "./gameState.js";
import { advanceStep } from "./gameEngine.js";
import { applyExtraTurn } from "./effects/atoms/misc.js";
import { parseEffectProgram, programConfidence } from "./effects/parser.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const TIME_WALK = { id: "tw", name: "Time Walk", type: "Sorcery", mana: "{1}{U}", oracle: "Take an extra turn after this one." };

/** A state parked at the last step of the turn sequence (cleanup), owned by `active`. */
function atCleanup(active) {
  let s = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
  return { ...s, activePlayer: active, phase: "ending", step: "cleanup" };
}

describe("parse + classify", () => {
  it("the bare sentence parses to the extra-turn atom; the family flips; variants stay off", () => {
    const prog = parseEffectProgram(TIME_WALK);
    expect(programConfidence(prog)).toBe("high");
    expect(prog.atoms).toEqual([{ op: "extra-turn", targetType: null }]);
    expect(classifyCard(TIME_WALK)).toBe("native-spell");
    expect(classifyCard({ id: "tm", name: "Temporal Manipulation", type: "Sorcery", mana: "{3}{U}{U}", oracle: "Take an extra turn after this one." })).toBe("native-spell");
    // Second Chance — the conditional upkeep trigger (≤5-life intervening-if + self-sac + the atom) routes whole.
    expect(classifyCard({ id: "sc", name: "Second Chance", type: "Enchantment", mana: "{1}{U}{U}",
      oracle: "At the beginning of your upkeep, if you have 5 or less life, sacrifice this enchantment and take an extra turn after this one." })).toBe("native-trigger");
    // FN guards: a wrong-player form and a multi-turn form must never parse into the atom.
    expect(classifyCard({ id: "x1", name: "Hypo Gift", type: "Sorcery", mana: "{U}", oracle: "Target player takes an extra turn after this one." })).toBe("arbiter-spell");
    expect(classifyCard({ id: "x2", name: "Hypo Double", type: "Sorcery", mana: "{U}", oracle: "Take two extra turns after this one." })).toBe("arbiter-spell");
  });
});

describe("runtime — CR 500.7", () => {
  it("the caster takes the next turn; rotation resumes with the normally-scheduled seat after", () => {
    let s = atCleanup("user");
    s = applyExtraTurn(s, { op: "extra-turn" }, { controller: "user" });
    const t1 = advanceStep(s);
    expect(t1.activePlayer).toBe("user");                 // the extra turn — same seat again
    expect(t1.turn).toBe(s.turn + 1);
    expect(t1.phase).toBe("beginning");
    expect(t1.extraTurns).toEqual([]);
    // Drain: the NEXT end-of-turn rotates normally — to the seat after user (the normally-scheduled turn).
    const t2 = advanceStep({ ...t1, phase: "ending", step: "cleanup" });
    const order = s.turnOrder || Object.keys(s.players);
    expect(t2.activePlayer).toBe(order[(order.indexOf("user") + 1) % order.length]);
  });
  it("two queued extra turns pop most-recently-created FIRST (LIFO)", () => {
    let s = atCleanup("ai1");
    s = applyExtraTurn(s, { op: "extra-turn" }, { controller: "user" });   // created first
    s = applyExtraTurn(s, { op: "extra-turn" }, { controller: "ai2" });    // created second → taken first
    const t1 = advanceStep(s);
    expect(t1.activePlayer).toBe("ai2");
    const t2 = advanceStep({ ...t1, phase: "ending", step: "cleanup" });
    expect(t2.activePlayer).toBe("user");
    expect(t2.extraTurns).toEqual([]);
  });
});

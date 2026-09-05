/**
 * savageBeating.test.js — POD-SIM THREE · Killer Turts KT-6 (2026-09-05): Savage Beating.
 *
 * "Cast this spell only during combat on your turn. Choose one — • Creatures you control gain double strike until end of
 * turn. • Untap all creatures you control. After this phase, there is an additional combat phase. Entwine {1}{R}"
 * Both modes and entwine already parsed; the miss was the CAST WINDOW. The parser peels the sentence and STAMPS the
 * program with `castTiming: { phase: "combat", yourTurn: true }` (the strive discipline — the stamp is the point);
 * legalChoices' offer loop refuses the cast outside the window. Offering it in a main phase, or on an opponent's turn,
 * is an illegal cast — the forbidden over-offer, pinned here.
 *
 * Real oracle fixture (bundled Scryfall snapshot, verified in-session 2026-09-05).
 */

import { describe, it, expect, beforeEach } from "vitest";
import { createGameState, _resetIdsForTests } from "./gameState.js";
import { legalActionsForPlayer, filterActions } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { parseEffectProgram } from "./effects/parser.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const BEATING = { id: "svb", name: "Savage Beating", type: "Instant", mana: "{3}{R}{R}", keywords: ["Entwine"],
  oracle: "Cast this spell only during combat on your turn.\nChoose one —\n• Creatures you control gain double strike until end of turn.\n• Untap all creatures you control. After this phase, there is an additional combat phase.\nEntwine {1}{R} (Choose both if you pay the entwine cost.)" };

function state({ phase, step, activePlayer, priorityHolder = "user" }) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...s, phase, step, activePlayer, priorityHolder, consecutivePasses: 0, turn: 4,
    players: { ...s.players, user: { ...s.players.user, hand: [BEATING], manaPool: { ...s.players.user.manaPool, R: 7 } } },
  };
}
const casts = (s) => filterActions(legalActionsForPlayer(s, "user"), "cast-spell").filter((c) => c.cardId === "svb");

describe("parser + classifier", () => {
  it("the cast window is peeled and STAMPED; both modes parse; the card classifies native-spell", () => {
    const p = parseEffectProgram(BEATING);
    expect(p.confidence).toBe("high");
    expect(p.castTiming).toEqual({ phase: "combat", yourTurn: true });
    expect(p.modal.modes).toHaveLength(2);
    expect(classifyCard(BEATING)).toBe("native-spell");
    // a plain instant carries no stamp
    expect(parseEffectProgram({ ...BEATING, oracle: "Choose one —\n• Creatures you control gain double strike until end of turn.\n• Untap all creatures you control. After this phase, there is an additional combat phase." }).castTiming).toBeUndefined();
  });
});

describe("runtime — the offer honours the window", () => {
  it("offered during YOUR combat; never in your main phase; never during the opponent's combat", () => {
    expect(casts(state({ phase: "combat", step: "declare-attackers", activePlayer: "user" })).length).toBeGreaterThan(0);
    expect(casts(state({ phase: "precombat-main", step: "main", activePlayer: "user" }))).toEqual([]);
    expect(casts(state({ phase: "combat", step: "declare-blockers", activePlayer: "ai", priorityHolder: "user" }))).toEqual([]);
  });

  it("cast in your combat, the double-strike mode resolves (the window gates the offer, not the effect)", () => {
    let s = state({ phase: "combat", step: "declare-attackers", activePlayer: "user" });
    const act = casts(s).find((a) => a.chosenMode === 0) || casts(s)[0];
    s = resolveTopOfStack(dispatchAction(s, act));
    expect(s.stack).toHaveLength(0);
    expect(s.players.user.graveyard.map((c) => c.name)).toEqual(["Savage Beating"]);
  });
});

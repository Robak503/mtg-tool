/**
 * extraCombatPhase.test.js — EXTRA COMBAT PHASES (CR 500.8), wave increment 1: the engine mechanism.
 *
 * 51 corpus cards print "additional combat phase" and not one is native — the densest top-1600 cluster
 * left (Aggravated Assault #699, Aurelia #820, Moraug #995, Combat Celebrant #1000, Karlach #1039, Great
 * Train Heist #1118, Genji Glove #1229, Scourge of the Throne #1277, Full Throttle #1491, Relentless
 * Assault #1543).
 *
 * CR 500.8: "Some effects can add phases to a turn. They do this by adding the phases directly after the
 * specified phase. If multiple extra phases are created after the same phase, the most recently created
 * phase will occur first." — the SAME LIFO the engine already implements for extra TURNS (CR 500.7).
 *
 * ⛔ WHY A PER-STATE QUEUE: TURN_SEQUENCE is a MODULE-LEVEL constant shared by every game, and
 * findSequenceIndex searches it by (phase, step). A spliced phase cannot live there, so the insertion is a
 * JUMP at the advanceStep chokepoint — leaving `end-of-combat` with a queued run, go BACK to
 * `beginning-of-combat` instead of forward to `postcombat-main`.
 *
 * ⛔ THIS INCREMENT CREDITS NO CARD, deliberately — same call as the layer-1 copy increment. The parse arms
 * are increment 3; shipping the mechanism with board assertions first is what keeps a tier number from ever
 * standing in for behaviour that was never verified.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { advanceStep } from "./gameEngine.js";
import { createGameState, _resetIdsForTests } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const atEndOfCombat = (extraPhases) => {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...s, activePlayer: "user", phase: "combat", step: "end-of-combat",
    priorityHolder: null, consecutivePasses: 0,
    ...(extraPhases ? { extraPhases } : {}),
  };
};

describe("⭐ the splice — a queued phase sends the turn back into combat", () => {
  it("⭐ leaving end-of-combat with one queued run returns to beginning-of-combat", () => {
    const out = advanceStep(atEndOfCombat([{ kind: "combat" }]));
    expect(out.phase).toBe("combat");
    expect(out.step).toBe("beginning-of-combat");
  });

  it("⛔ CONTROL — with NO queue it goes forward to the postcombat main, exactly as before", () => {
    // The regression guard for every existing turn: this transition must be untouched when nothing is
    // queued, which is every game that has never cast one of these 51 cards.
    const out = advanceStep(atEndOfCombat(null));
    expect(out.phase).toBe("postcombat-main");
    expect(out.step).toBe("main");
  });

  it("⛔ and an EMPTY queue is the same as no queue", () => {
    const out = advanceStep(atEndOfCombat([]));
    expect(out.phase).toBe("postcombat-main");
  });
});

describe("⛔ THE NON-TERMINATION TRAP — the queue must DRAIN", () => {
  it("⭐ the run is popped as it is taken", () => {
    const out = advanceStep(atEndOfCombat([{ kind: "combat" }]));
    expect(out.extraPhases).toEqual([]);
  });

  it("⛔ ONE grant gives exactly ONE extra combat, then the turn moves on", () => {
    // Without the pop, Relentless Assault loops the turn forever. This is the assertion that proves it
    // cannot: walk from end-of-combat, and the SECOND time we reach end-of-combat the queue is empty and
    // the turn proceeds to the postcombat main.
    let s = advanceStep(atEndOfCombat([{ kind: "combat" }]));
    expect(s.step).toBe("beginning-of-combat");
    let guard = 0;
    while (s.step !== "end-of-combat" && guard++ < 20) s = advanceStep(s);
    expect(s.step, "reached end-of-combat again").toBe("end-of-combat");
    const after = advanceStep(s);
    expect(after.phase).toBe("postcombat-main"); // ⭐ the turn ADVANCES — no third combat
  });

  it("⭐ TWO grants give exactly two extra combats (LIFO, CR 500.8)", () => {
    let s = advanceStep(atEndOfCombat([{ kind: "combat" }, { kind: "combat" }]));
    expect(s.extraPhases).toHaveLength(1); // one popped, one still owed
    let guard = 0;
    while (s.step !== "end-of-combat" && guard++ < 20) s = advanceStep(s);
    s = advanceStep(s);
    expect(s.step).toBe("beginning-of-combat"); // the second grant fires
    expect(s.extraPhases).toEqual([]);          // …and now it is drained
  });
});

describe("⛔ the extra combat is a NEW combat", () => {
  it("last combat's attackers do not carry over", () => {
    // A stale combat object would let the previous attackers count as attacking again — creatures would
    // deal damage twice off one declaration, which is not what an additional combat phase does.
    const s = { ...atEndOfCombat([{ kind: "combat" }]), combat: { attackers: [{ id: "a1" }], blockers: {} } };
    const out = advanceStep(s);
    expect(out.combat).toBeNull();
  });

  it("CONTROL — the normal forward transition is not made to clear combat by this change", () => {
    // Scope guard: the reset belongs to the splice branch only. If the no-queue path started nulling
    // combat, end-of-combat cleanup elsewhere could regress without any test noticing.
    const s = { ...atEndOfCombat(null), combat: { attackers: [{ id: "a1" }], blockers: {} } };
    expect(advanceStep(s).combat).toEqual({ attackers: [{ id: "a1" }], blockers: {} });
  });
});

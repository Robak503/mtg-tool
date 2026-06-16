/**
 * Interactive tutor — the driver split (mirrors pendingArbiter): the player's OWN tutor
 * at beginner/intermediate SURFACES a `tutor-search` picker decision; Expert autopilot and
 * an opponent's tutor AUTO-PICK the best candidate and continue with no panel. Plus
 * applyTutorChoice (the picker's resume path) — valid pick, find-nothing, illegal pick.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { advanceUntilDecision, applyTutorChoice } from "./learnSession.js";
import { runEffectProgram, resolveTutorChoice } from "./effects/runProgram.js";
import { finalizeStackResolution } from "./gameEngine.js";

beforeEach(() => _resetIdsForTests());

// A minimal active session paused on a tutor search, with `library` on the controller.
function sessionWithPendingTutor({ difficulty = "beginner", controller = "user", library = [], candidates } = {}) {
  const base = createGameState({ userDeck: [], aiDeck: [] });
  const state = {
    ...base,
    priorityHolder: null,                 // no priority window — the pendingChoice is checked first
    players: { ...base.players, [controller]: { ...base.players[controller], library } },
    pendingChoice: {
      kind: "tutor-search",
      controller,
      candidates: candidates || library.map((c) => ({ id: c.id, name: c.name })),
      sourceName: "Demonic Tutor",
      filterLabel: "card",
    },
  };
  return { id: "sess-1", status: "active", difficulty, state, decisionLog: [] };
}
const card = (id, name, mana = "") => ({ id, name, type: "Sorcery", mana });

describe("driver — pause vs auto-pick", () => {
  it("surfaces a tutor-search picker for the player's OWN tutor (beginner)", () => {
    const lib = [card("a", "Sol Ring", "{1}"), card("b", "Mana Crypt", "{0}")];
    const { decision } = advanceUntilDecision(sessionWithPendingTutor({ difficulty: "beginner", library: lib }));
    expect(decision.kind).toBe("tutor-search");
    expect(decision.candidates.map((c) => c.name).sort()).toEqual(["Mana Crypt", "Sol Ring"]);
    expect(decision.sourceName).toBe("Demonic Tutor");
  });

  // (The driver auto-settles + keeps playing, so assert the tutor LOG + the picked card
  // leaving the library — invariants that survive the subsequent game advance.)
  it("AUTO-PICKS (no picker) for the player's tutor at EXPERT and continues", () => {
    const lib = [card("a", "Sol Ring", "{1}"), card("b", "Gilded Lotus", "{5}")];
    const { decision, session } = advanceUntilDecision(sessionWithPendingTutor({ difficulty: "expert", library: lib }));
    expect(decision.kind).not.toBe("tutor-search");                            // Expert never sees the picker
    expect(session.state.pendingChoice).toBeUndefined();                       // settled
    expect(session.state.log.some((l) => l.effect === "tutor" && l.found === true)).toBe(true);
  });

  it("AUTO-PICKS for an OPPONENT's tutor regardless of difficulty (no panel — hidden)", () => {
    const lib = [card("a", "Sol Ring", "{1}"), card("b", "Gilded Lotus", "{5}")];
    const { decision, session } = advanceUntilDecision(sessionWithPendingTutor({ difficulty: "beginner", controller: "ai", library: lib }));
    expect(decision.kind).not.toBe("tutor-search");                            // never shows the user an opponent's pick
    expect(session.state.log.some((l) => l.effect === "tutor" && l.controller === "ai" && l.found === true)).toBe(true);
  });
});

describe("applyTutorChoice — the picker resume path", () => {
  it("applies the player's chosen card (it leaves the library) and clears the pause", () => {
    const lib = [card("a", "Sol Ring", "{1}"), card("b", "Gilded Lotus", "{5}")];
    const { session } = applyTutorChoice(sessionWithPendingTutor({ library: lib }), { cardId: "a" });
    expect(session.state.pendingChoice).toBeUndefined();
    expect(session.state.players.user.library.some((c) => c.id === "a")).toBe(false); // Sol Ring fetched out
    expect(session.state.log.some((l) => l.effect === "tutor" && l.found === true)).toBe(true);
  });

  it("find nothing (null cardId) fetches no card (logged found:false)", () => {
    const lib = [card("a", "Sol Ring", "{1}")];
    const { session } = applyTutorChoice(sessionWithPendingTutor({ library: lib }), { cardId: null });
    expect(session.state.log.some((l) => l.effect === "tutor" && l.found === false)).toBe(true);
  });

  it("REVIEW FIX: an illegal/stale pick re-surfaces the SAME picker (not a terminal dead-end)", () => {
    const lib = [card("a", "Sol Ring", "{1}")];
    const { session, decision } = applyTutorChoice(sessionWithPendingTutor({ library: lib }), { cardId: "not-a-candidate" });
    expect(decision.kind).toBe("tutor-search");                 // picker re-opens, game not stranded
    expect(session.state.pendingChoice).toBeTruthy();           // still paused, recoverable
  });
});

describe("REVIEW FIX — triggers from a resumed post-tutor atom are flushed (CR 603.3)", () => {
  it("a [tutor, destroy] that kills a creature with a dies-trigger flushes it (not stuck in pendingTriggers)", () => {
    _resetIdsForTests();
    const base = createGameState({ userDeck: [], aiDeck: [] });
    const enemy = createPermanent({
      id: "enemy",
      card: { name: "Doomed One", type: "Creature — Bear", oracle: "Whenever this creature dies, you draw a card.", power: 1, toughness: 1 },
      controller: "ai", summoningSick: false,
    });
    const state = {
      ...base,
      players: {
        ...base.players,
        user: { ...base.players.user, library: [{ id: "lc", name: "Grizzly", type: "Creature — Bear", mana: "{1}{G}" }] },
        ai: { ...base.players.ai, battlefield: [enemy] },
      },
    };
    const program = { version: 1, confidence: "high", structure: "sequence", unparsedTail: null, atoms: [
      { op: "tutor", filter: { groups: [["creature"]] }, destination: "hand", targetType: null },
      { op: "destroy", targetType: "creature" },
    ] };
    const targets = [{ atomIndex: 1, type: "creature", id: "enemy" }];
    const obj = { id: "stk", kind: "spell", source: { name: "Search and Slay" }, controller: "user", targets, payload: { params: { program, controller: "user", targets } } };

    const paused = runEffectProgram(state, obj);
    expect(paused.pendingChoice).toBeTruthy();
    // resolveTutorChoice runs the destroy on resume → the dies trigger is ENQUEUED but NOT yet flushed.
    const resumed = resolveTutorChoice(paused, "lc");
    expect(resumed.pendingChoice).toBeUndefined();
    expect((resumed.pendingTriggers || []).length).toBeGreaterThan(0); // the bug: unflushed
    // finalizeStackResolution (what the driver's settleTutorChoice now runs) flushes it.
    const final = finalizeStackResolution(resumed);
    expect(final.pendingTriggers || []).toHaveLength(0);
    expect(final.stack.some((o) => o.kind === "triggered-ability")).toBe(true);
  });
});

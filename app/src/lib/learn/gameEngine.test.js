/**
 * Tests for Phase 6 PR2 — gameEngine state machine.
 *
 * Covers: phase/step advancement, end-of-turn wrap-around, priority
 * passing + step end + stack resolution, trigger queue + flush at
 * priority-grant checkpoint, startGame, draw-step skip on first turn.
 */

import { beforeEach, describe, expect, it } from "vitest";
import {
  _resetIdsForTests,
  createGameState,
  createStackObject,
  STEPS,
} from "./gameState.js";
import {
  advanceStep,
  runStepActions,
  nextStep,
  passPriority,
  resolveTopOfStack,
  enqueueTrigger,
  flushTriggers,
  startGame,
  grantPriority,
} from "./gameEngine.js";

function makeDeck(count, prefix = "C") {
  return Array.from({ length: count }, (_, i) => ({
    id: `card-${prefix}-${i}`,
    name: `${prefix} ${i}`,
  }));
}

function baseState({ _skipMulliganDraw = true } = {}) {
  const state = createGameState({
    userDeck: makeDeck(60, "U"),
    aiDeck: makeDeck(60, "A"),
  });
  return { ...state, startingPlayer: "user", consecutivePasses: 0 };
}

beforeEach(() => {
  _resetIdsForTests();
});

describe("advanceStep — phase/step walk", () => {
  it("walks the full beginning phase", () => {
    let state = baseState();
    expect(state.phase).toBe("beginning");
    expect(state.step).toBe("untap");

    state = advanceStep(state);
    expect(state.phase).toBe("beginning");
    expect(state.step).toBe("upkeep");

    state = advanceStep(state);
    expect(state.phase).toBe("beginning");
    expect(state.step).toBe("draw");
  });

  it("transitions from beginning to precombat-main", () => {
    let state = baseState();
    state = advanceStep(advanceStep(advanceStep(state)));  // skip past draw
    expect(state.phase).toBe("precombat-main");
    expect(state.step).toBe("main");
  });

  it("walks every combat step in order", () => {
    let state = baseState();
    // Advance to first combat step.
    while (!(state.phase === "combat" && state.step === "beginning-of-combat")) {
      state = advanceStep(state);
    }
    expect(state.step).toBe("beginning-of-combat");

    const expected = STEPS.combat;
    let i = 0;
    while (state.phase === "combat") {
      expect(state.step).toBe(expected[i]);
      state = advanceStep(state);
      i += 1;
    }
    expect(i).toBe(expected.length);
  });

  it("wraps to next turn after cleanup, swaps active player, increments turn", () => {
    let state = baseState();
    // Fast-forward to cleanup.
    while (!(state.phase === "ending" && state.step === "cleanup")) {
      state = advanceStep(state);
    }
    expect(state.activePlayer).toBe("user");
    expect(state.turn).toBe(1);

    state = advanceStep(state);
    expect(state.phase).toBe("beginning");
    expect(state.step).toBe("untap");
    expect(state.activePlayer).toBe("ai");
    expect(state.turn).toBe(2);
  });

  it("throws on a corrupted (phase, step) pair", () => {
    expect(() => advanceStep({ phase: "bogus", step: "bogus" })).toThrow();
  });
});

describe("runStepActions — automatic effects per step", () => {
  it("untap step: untaps active player's permanents, resets turn counters, empties their mana pool", () => {
    let state = baseState();
    // Put a tapped, summoning-sick permanent on user's battlefield with
    // a counter on it, and seed mana + drew-cards counter.
    const permId = "perm-fake";
    state = {
      ...state,
      players: {
        ...state.players,
        user: {
          ...state.players.user,
          battlefield: [{
            id: permId,
            card: { name: "Llanowar Elves" },
            controller: "user",
            tapped: true,
            summoningSick: true,
            counters: { "+1/+1": 1 },
            attachments: [],
            attachedTo: null,
          }],
          manaPool: { W: 0, U: 0, B: 0, R: 0, G: 2, C: 0 },
          landsPlayedThisTurn: 1,
          cardsDrawnThisTurn: 3,
        },
      },
    };

    const after = runStepActions(state);
    expect(after.players.user.battlefield[0].tapped).toBe(false);
    expect(after.players.user.battlefield[0].summoningSick).toBe(false);
    expect(after.players.user.battlefield[0].counters["+1/+1"]).toBe(1); // untap doesn't drop counters
    expect(after.players.user.manaPool.G).toBe(0);
    expect(after.players.user.landsPlayedThisTurn).toBe(0);
    expect(after.players.user.cardsDrawnThisTurn).toBe(0);
  });

  it("untap step does NOT grant priority", () => {
    const after = runStepActions(baseState());
    expect(after.priorityHolder).toBeNull();
  });

  it("draw step: draws 1 card for the active player", () => {
    let state = baseState();
    // Skip the first-turn draw-skip rule by setting turn > 1.
    state = { ...state, turn: 2, phase: "beginning", step: "draw" };
    const initialLibrary = state.players.user.library.length;
    const after = runStepActions(state);
    expect(after.players.user.library).toHaveLength(initialLibrary - 1);
    expect(after.players.user.hand).toHaveLength(1);
    expect(after.priorityHolder).toBe("user"); // priority granted
  });

  it("draw step on turn 1 for the starting player: skips the draw", () => {
    let state = baseState();
    state = { ...state, phase: "beginning", step: "draw" }; // turn 1, user is starting
    const initialLibrary = state.players.user.library.length;
    const after = runStepActions(state);
    expect(after.players.user.library).toHaveLength(initialLibrary); // no draw
    const skippedLog = after.log.find(l => l.skipped === "first-turn-draw");
    expect(skippedLog).toBeDefined();
  });

  it("cleanup step empties everyone's mana pool", () => {
    let state = baseState();
    state = {
      ...state,
      phase: "ending",
      step: "cleanup",
      players: {
        user: { ...state.players.user, manaPool: { W: 1, U: 0, B: 0, R: 0, G: 0, C: 0 } },
        ai: { ...state.players.ai, manaPool: { W: 0, U: 2, B: 0, R: 0, G: 0, C: 0 } },
      },
    };
    const after = runStepActions(state);
    expect(after.players.user.manaPool.W).toBe(0);
    expect(after.players.ai.manaPool.U).toBe(0);
    expect(after.priorityHolder).toBeNull(); // cleanup doesn't grant priority
  });

  it("main step grants priority to the active player", () => {
    let state = baseState();
    state = { ...state, phase: "precombat-main", step: "main" };
    const after = runStepActions(state);
    expect(after.priorityHolder).toBe("user");
  });
});

describe("nextStep convenience", () => {
  it("advances and runs the next step's actions", () => {
    let state = baseState();  // (beginning, untap)
    state = nextStep(state);  // → upkeep, priority granted
    expect(state.step).toBe("upkeep");
    expect(state.priorityHolder).toBe("user");
  });
});

describe("passPriority", () => {
  function priorityState() {
    let state = baseState();
    state = { ...state, phase: "precombat-main", step: "main" };
    return grantPriority(state);
  }

  it("hands priority to the opponent on a single pass", () => {
    const before = priorityState();
    const after = passPriority(before);
    expect(after.priorityHolder).toBe("ai");
    expect(after.consecutivePasses).toBe(1);
  });

  it("ends the step when both players pass with empty stack", () => {
    let state = priorityState();
    state = passPriority(state);   // user passes
    state = passPriority(state);   // ai passes → step ends, advances to combat
    expect(state.step).not.toBe("main");
    // Specifically: beginning-of-combat is next after precombat-main.
    expect(state.phase).toBe("combat");
    expect(state.step).toBe("beginning-of-combat");
  });

  it("resolves the top of the stack when both pass with non-empty stack", () => {
    let state = priorityState();
    let resolved = false;
    const spellObj = createStackObject({
      kind: "spell",
      source: { name: "Lightning Bolt" },
      controller: "user",
      payload: {
        onResolve: (s) => {
          resolved = true;
          return s;
        },
      },
    });
    state = { ...state, stack: [...state.stack, spellObj] };

    state = passPriority(state);    // user passes
    state = passPriority(state);    // ai passes → resolve top

    expect(resolved).toBe(true);
    expect(state.stack).toHaveLength(0);
    // Priority returns to the active player after resolution.
    expect(state.priorityHolder).toBe("user");
    expect(state.consecutivePasses).toBe(0);
  });

  it("throws when no player holds priority", () => {
    const state = baseState(); // priorityHolder is null in beginning/untap
    expect(() => passPriority(state)).toThrow();
  });
});

describe("resolveTopOfStack", () => {
  it("calls payload.onResolve when present", () => {
    let state = baseState();
    state = { ...state, phase: "precombat-main", step: "main" };
    state = grantPriority(state);

    let receivedState = null;
    const obj = createStackObject({
      kind: "spell",
      source: { name: "Counterspell" },
      controller: "user",
      payload: {
        onResolve: (s) => {
          receivedState = s;
          return s;
        },
      },
    });
    state = { ...state, stack: [obj] };
    state = resolveTopOfStack(state);
    expect(receivedState).toBeTruthy();
    expect(state.stack).toHaveLength(0);
  });

  it("logs and continues if onResolve throws", () => {
    let state = baseState();
    state = { ...state, phase: "precombat-main", step: "main" };
    state = grantPriority(state);
    const obj = createStackObject({
      kind: "spell",
      source: { name: "Broken Card" },
      controller: "user",
      payload: { onResolve: () => { throw new Error("boom"); } },
    });
    state = { ...state, stack: [obj] };
    state = resolveTopOfStack(state);
    expect(state.stack).toHaveLength(0);
    expect(state.log.some(l => l.kind === "stack-resolve-error")).toBe(true);
  });

  it("resolves stack objects without onResolve as a no-op + log", () => {
    let state = baseState();
    state = { ...state, phase: "precombat-main", step: "main" };
    state = grantPriority(state);
    const obj = createStackObject({
      kind: "triggered-ability",
      source: { name: "Soul Warden" },
      controller: "user",
    });
    state = { ...state, stack: [obj] };
    state = resolveTopOfStack(state);
    expect(state.stack).toHaveLength(0);
    expect(state.log.some(l => l.kind === "stack-resolve")).toBe(true);
  });

  it("resets priority to the active player after resolution", () => {
    let state = baseState();
    state = { ...state, phase: "precombat-main", step: "main", activePlayer: "user" };
    state = grantPriority(state, "ai");  // some weird state where ai had priority
    const obj = createStackObject({
      kind: "spell",
      source: { name: "X" },
      controller: "user",
    });
    state = { ...state, stack: [obj] };
    state = resolveTopOfStack(state);
    expect(state.priorityHolder).toBe("user");
  });

  it("throws when the stack is empty", () => {
    let state = baseState();
    state = { ...state, phase: "precombat-main", step: "main" };
    expect(() => resolveTopOfStack(state)).toThrow();
  });
});

describe("trigger queue", () => {
  it("enqueueTrigger appends without touching the stack", () => {
    let state = baseState();
    const trig = {
      id: "trig-1",
      source: { name: "Soul Warden" },
      controller: "user",
      payload: { description: "gain 1" },
    };
    state = enqueueTrigger(state, trig);
    expect(state.pendingTriggers).toHaveLength(1);
    expect(state.stack).toHaveLength(0);
  });

  it("flushTriggers moves pending triggers onto the stack in APNAP order", () => {
    let state = baseState();
    state = { ...state, activePlayer: "user" };
    state = enqueueTrigger(state, { id: "ai-trig", source: { name: "X" }, controller: "ai" });
    state = enqueueTrigger(state, { id: "user-trig-1", source: { name: "Y" }, controller: "user" });
    state = enqueueTrigger(state, { id: "user-trig-2", source: { name: "Z" }, controller: "user" });

    state = flushTriggers(state);
    expect(state.pendingTriggers).toHaveLength(0);
    expect(state.stack).toHaveLength(3);
    // Active player's triggers first (preserving FIFO), then opponent's.
    expect(state.stack[0].id).toBe("user-trig-1");
    expect(state.stack[1].id).toBe("user-trig-2");
    expect(state.stack[2].id).toBe("ai-trig");
  });

  it("flushTriggers is a no-op when no triggers are queued", () => {
    let state = baseState();
    const before = state.stack;
    state = flushTriggers(state);
    expect(state.stack).toBe(before); // reference identity preserved
  });

  it("runStepActions automatically flushes triggers at priority-grant checkpoints", () => {
    let state = baseState();
    state = { ...state, phase: "precombat-main", step: "main" };
    state = enqueueTrigger(state, {
      id: "trig",
      source: { name: "Atraxa" },
      controller: "user",
    });
    state = runStepActions(state);
    expect(state.pendingTriggers).toHaveLength(0);
    expect(state.stack).toHaveLength(1);
    expect(state.priorityHolder).toBe("user");
  });
});

describe("startGame", () => {
  it("draws 7 to each player and applies first-untap-step effects", () => {
    let state = createGameState({
      userDeck: makeDeck(60, "U"),
      aiDeck: makeDeck(60, "A"),
    });
    state = startGame(state);
    expect(state.players.user.hand).toHaveLength(7);
    expect(state.players.ai.hand).toHaveLength(7);
    expect(state.startingPlayer).toBe("user");
    // First step is untap — runStepActions ran, but priority not granted.
    expect(state.step).toBe("untap");
    expect(state.priorityHolder).toBeNull();
  });

  it("skipMulliganDraw skips the opening draw (caller handles mulligans)", () => {
    let state = createGameState({
      userDeck: makeDeck(60, "U"),
      aiDeck: makeDeck(60, "A"),
    });
    state = startGame(state, { skipMulliganDraw: true });
    expect(state.players.user.hand).toHaveLength(0);
  });

  it("first-turn draw-skip applies after startGame: the active player's draw step is skipped", () => {
    let state = createGameState({
      userDeck: makeDeck(60, "U"),
      aiDeck: makeDeck(60, "A"),
    });
    state = startGame(state, { skipMulliganDraw: true });
    expect(state.players.user.hand).toHaveLength(0);
    // Advance to draw step.
    state = nextStep(state); // → upkeep
    expect(state.step).toBe("upkeep");
    state = nextStep(state); // → draw, but skipped for the starting player
    expect(state.step).toBe("draw");
    expect(state.players.user.hand).toHaveLength(0); // no draw happened
  });
});

describe("integration — full turn cycle", () => {
  it("completes turn 1 with no actions and lands on turn 2 untap", () => {
    let state = createGameState({
      userDeck: makeDeck(60, "U"),
      aiDeck: makeDeck(60, "A"),
    });
    state = startGame(state);
    expect(state.turn).toBe(1);
    expect(state.activePlayer).toBe("user");

    // Walk each step that grants priority, passing both players' priority.
    // Untap and cleanup don't grant priority; the engine auto-advances.
    let safety = 0;
    while (!(state.turn === 2 && state.step === "untap") && safety < 60) {
      if (state.priorityHolder) {
        state = passPriority(state);
        // After both pass on empty stack, nextStep is called internally
        // and we may now be in a no-priority step — let runStepActions
        // (which already ran via nextStep inside passPriority) settle.
      } else {
        // No priority — happens at untap (start) or cleanup. The engine
        // doesn't auto-advance from those without our help in v1.
        state = nextStep(state);
      }
      safety += 1;
    }
    expect(state.turn).toBe(2);
    expect(state.activePlayer).toBe("ai");
    expect(state.step).toBe("untap");
  });
});

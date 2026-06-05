/**
 * PR 10.2 tests — mana emptying (CR 500.4) + floating semantics.
 *
 * Mana floats within a step and empties when the step/phase ends, EXCEPT for
 * colors a "doesn't empty" effect preserves (the hook PR 10.5 fills for
 * Omnath/Kruphix). Here we prove the hook works by registering a temporary
 * effect, so 10.5 only has to supply the real descriptors.
 */

import { afterEach, describe, expect, it } from "vitest";
import { createGameState, addMana } from "./gameState.js";
import { emptyManaPools, advanceStep } from "./gameEngine.js";
import { _registry } from "./cardEffects.js";

function base() {
  return {
    ...createGameState({ userDeck: [], aiDeck: [] }),
    phase: "precombat-main",
    step: "main",
    activePlayer: "user",
    priorityHolder: "user",
    startingPlayer: "user",
    consecutivePasses: 0,
  };
}

afterEach(() => {
  // Don't leak temporary registrations into other tests.
  for (const k of Object.keys(_registry)) delete _registry[k];
});

describe("emptyManaPools", () => {
  it("empties every player's pool by default", () => {
    let s = base();
    s = addMana(s, { playerId: "user", color: "G", amount: 3 });
    s = addMana(s, { playerId: "ai", color: "U", amount: 2 });
    const after = emptyManaPools(s);
    expect(after.players.user.manaPool.G).toBe(0);
    expect(after.players.ai.manaPool.U).toBe(0);
  });

  it("preserves only the colors a registered effect keeps (per controller)", () => {
    _registry["Test Locus"] = { manaDoesNotEmpty: ["G"] };
    let s = base();
    s = {
      ...s,
      players: {
        ...s.players,
        user: {
          ...s.players.user,
          battlefield: [{ id: "p1", card: { name: "Test Locus" }, controller: "user", tapped: false, summoningSick: false }],
        },
      },
    };
    s = addMana(s, { playerId: "user", color: "G", amount: 5 });
    s = addMana(s, { playerId: "user", color: "U", amount: 2 });
    // The opponent has no such effect.
    s = addMana(s, { playerId: "ai", color: "G", amount: 4 });

    const after = emptyManaPools(s);
    expect(after.players.user.manaPool.G).toBe(5); // green preserved for the controller
    expect(after.players.user.manaPool.U).toBe(0); // other colors still empty
    expect(after.players.ai.manaPool.G).toBe(0);   // opponent's green empties normally
  });
});

describe("floating across a step boundary", () => {
  it("floats mana within a step, empties it when the step ends", () => {
    let s = base();
    s = addMana(s, { playerId: "user", color: "G", amount: 2 });
    expect(s.players.user.manaPool.G).toBe(2); // floats within the main step

    const after = advanceStep(s); // leaving the main step
    expect(after.players.user.manaPool.G).toBe(0);
    expect(after.step).not.toBe("main");
  });

  it("preserved mana survives the step boundary", () => {
    _registry["Test Locus"] = { manaDoesNotEmpty: ["G"] };
    let s = base();
    s = {
      ...s,
      players: {
        ...s.players,
        user: {
          ...s.players.user,
          battlefield: [{ id: "p1", card: { name: "Test Locus" }, controller: "user", tapped: false, summoningSick: false }],
        },
      },
    };
    s = addMana(s, { playerId: "user", color: "G", amount: 3 });
    const after = advanceStep(s);
    expect(after.players.user.manaPool.G).toBe(3); // green floats past the boundary
  });
});

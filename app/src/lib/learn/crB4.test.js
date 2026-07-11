/**
 * crB4.test.js — CR-remediation B4: win/loss/priority correctness.
 *
 *  - CR 104.3f: a player who would simultaneously win and lose LOSES — the wonGame flag is gated by
 *    !isPlayerDead on BOTH status surfaces (learnSession.recordOutcomeIfChanged + gameApi.gameStatus;
 *    the gameApi side is pinned in gameApi.test.js where the old backwards test lived).
 *  - CR 104.2a: a commander-mode session now defaults to FFA sole-survivor — a human Academy pod
 *    keeps playing after the user dies instead of ending instantly against an arbitrary "winner".
 *    Standard (1v1) keeps the legacy user-pivot default, where the two are CR-equivalent.
 *  - CR 117.3c: after casting/activating at instant speed, the ACTOR retains priority — it no longer
 *    snaps back to the active player.
 *  - CR 608.2b: a spell whose EVERY target is gone at resolution doesn't resolve at all — trailing
 *    non-targeted atoms (the "…you gain 2 life" rider) no longer execute on a fizzled spell.
 */
import { describe, it, expect, beforeEach } from "vitest";

import { createLearnSession } from "./learnSession.js";
import { dispatchAction } from "./actionDispatcher.js";
import { runEffectProgram } from "./effects/runProgram.js";
import { createGameState, _resetIdsForTests } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const DECK = Array.from({ length: 40 }, (_, i) => ({ id: `d${i}`, name: `Filler ${i}`, type: "Sorcery", oracle: "" }));

describe("CR 104.2a — ffaSoleSurvivor defaults by mode (B4)", () => {
  it("commander mode defaults the sole-survivor rule ON", () => {
    const s = createLearnSession({ userDeck: [...DECK], opponentDecks: [[...DECK], [...DECK], [...DECK]], mode: "commander" });
    expect(s.state.rules?.ffaSoleSurvivor).toBe(true);
  });

  it("an explicit false opts a commander session back out (determinism pins)", () => {
    const s = createLearnSession({ userDeck: [...DECK], opponentDecks: [[...DECK], [...DECK], [...DECK]], mode: "commander", ffaSoleSurvivor: false });
    expect(s.state.rules?.ffaSoleSurvivor ?? false).toBe(false);
  });

  it("standard (1v1) keeps the legacy default (off) — the two semantics are CR-equivalent there", () => {
    const s = createLearnSession({ userDeck: [...DECK], opponentDeck: [...DECK], mode: "standard" });
    expect(s.state.rules?.ffaSoleSurvivor ?? false).toBe(false);
  });
});

describe("CR 117.3c — the actor retains priority after a stack action (B4)", () => {
  it("a non-active player casting an instant keeps priority (it does not snap to the turn player)", () => {
    const base = createGameState({ userDeck: [], aiDeck: [] });
    const bolt = { id: "bolt1", name: "Test Trick", type: "Instant", oracle: "Draw a card.", mana: "{U}" };
    const state = {
      ...base,
      activePlayer: "user",
      phase: "precombat-main",
      step: "main",
      priorityHolder: "ai",
      players: {
        ...base.players,
        ai: {
          ...base.players.ai,
          hand: [bolt],
          library: [{ id: "lib1", name: "Top Card", type: "Sorcery", oracle: "" }],
          manaPool: { W: 0, U: 1, B: 0, R: 0, G: 0, C: 0 },
        },
      },
    };
    const after = dispatchAction(state, {
      kind: "cast-spell",
      playerId: "ai",
      cardId: "bolt1",
      program: { atoms: [{ op: "draw", amount: 1 }] },
      targets: [],
      cost: { kind: "mana", mana: { generic: 0, W: 0, U: 1, B: 0, R: 0, G: 0, C: 0, hybrid: [] } },
    });
    expect(after.stack.length).toBe(1);
    expect(after.priorityHolder).toBe("ai"); // the CASTER — was state.activePlayer ("user") before B4
  });
});

describe("CR 608.2b — a spell with every target gone does not resolve (B4)", () => {
  function spellObj(targets, atoms) {
    return {
      id: "stk1",
      source: { name: "Test Removal" },
      payload: { params: { program: { atoms }, controller: "user", targets, spellToGraveyard: { playerId: "user", card: { id: "spell1", name: "Test Removal", type: "Sorcery" } } } },
    };
  }

  it("sole creature target gone → NO atom runs (the non-targeted life-gain rider is skipped), card to graveyard", () => {
    const base = createGameState({ userDeck: [], aiDeck: [] });
    const startLife = base.players.user.life;
    const obj = spellObj(
      [{ type: "creature", id: "ghost-perm", controller: "ai" }],
      [{ op: "destroy" }, { op: "gain-life", amount: 2 }],
    );
    const after = runEffectProgram(base, obj);
    expect(after.players.user.life).toBe(startLife); // the rider did NOT execute
    expect(after.log.some((e) => e.kind === "spell-fizzle" && /608\.2b/.test(e.reason || ""))).toBe(true);
    expect(after.players.user.graveyard.some((c) => c.id === "spell1")).toBe(true); // CR 608.2b — still to GY
  });

  it("a target still present → the program runs normally (no fizzle)", () => {
    const base = createGameState({ userDeck: [], aiDeck: [] });
    const bear = { id: "bear1", card: { name: "Bear", type: "Creature — Bear", power: 2, toughness: 2, oracle: "" }, controller: "ai", tapped: false, counters: {}, damageMarked: 0, attachments: [], attachedTo: null };
    const state = { ...base, players: { ...base.players, ai: { ...base.players.ai, battlefield: [bear] } } };
    const startLife = state.players.user.life;
    const obj = spellObj(
      [{ type: "creature", id: "bear1", controller: "ai" }],
      [{ op: "gain-life", amount: 2 }],
    );
    const after = runEffectProgram(state, obj);
    expect(after.players.user.life).toBe(startLife + 2);
    expect(after.log.some((e) => e.kind === "spell-fizzle")).toBe(false);
  });
});

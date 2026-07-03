/**
 * ITERATED-EDICT (Torment of Hailfire) — the {X}-iterated, per-opponent, THREE-mode edict:
 *   "Repeat the following process X times. Each opponent loses 3 life unless that player sacrifices a
 *    nonland permanent of their choice or discards a card."
 *
 * Covers: classification (native-spell) + the single iterated-edict atom shape; the forced life-loss path
 * (X × 3 when an opponent has no nonland permanent and an empty hand — no pause); the pausing choice chain
 * (a real ≥2-mode choice pauses for the affected opponent); the AI auto-pick heuristic (preserve life when
 * low → discard/sac; lose life when comfortable); the sac / discard branches through the shared helpers;
 * the caster-eliminated + stale-id guards; and CREED anti-FP pins (any text variant stays LOW → Arbiter).
 */

import { beforeEach, describe, expect, it } from "vitest";

import { ATOM_RESOLVERS } from "./effectAtoms.js";
import { classifyCard } from "../coverage.js";
import { parseEffectProgram, programConfidence } from "./parser.js";
import { autoPickEdictMode, resolveEdictModeChoice } from "./runProgram.js";
import { _resetIdsForTests, createGameState, createPermanent } from "../gameState.js";

beforeEach(() => _resetIdsForTests());

const TORMENT = {
  name: "Torment of Hailfire",
  type: "Sorcery",
  mana: "{X}{B}{B}",
  oracle: "Repeat the following process X times. Each opponent loses 3 life unless that player sacrifices a nonland permanent of their choice or discards a card.",
};

function board({ userLife = 40, aiLife = 40, aiBoard = [], aiHand = [] } = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...s, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
    players: {
      ...s.players,
      user: { ...s.players.user, life: userLife },
      ai: { ...s.players.ai, life: aiLife, battlefield: aiBoard, hand: aiHand },
    },
  };
}

const perm = (id, name, type, ctrl = "ai", over = {}) =>
  createPermanent({ id, card: { id: `c-${id}`, name, type, oracle: "", ...over }, controller: ctrl, summoningSick: false });

const run = (s, xValue) =>
  ATOM_RESOLVERS["iterated-edict"](s, { op: "iterated-edict", amountX: true, targetType: null }, { controller: "user", xValue, cardName: "Torment of Hailfire" });

describe("Torment of Hailfire — ITERATED-EDICT classification + parse", () => {
  it("classifies native-spell as a single iterated-edict X atom", () => {
    expect(classifyCard(TORMENT)).toBe("native-spell");
    const p = parseEffectProgram(TORMENT);
    expect(programConfidence(p)).toBe("high");
    expect(p.xSpell).toBe(true);
    expect(p.atoms).toEqual([{ op: "iterated-edict", amountX: true, targetType: null }]);
  });
});

describe("Torment of Hailfire — RUNTIME forced life-loss (no board, no hand)", () => {
  it("X=5, opponent has no nonland permanent + empty hand → loses 15 with NO pause", () => {
    let s = board({ aiLife: 40, aiBoard: [], aiHand: [] });
    s = run(s, 5);
    expect(s.pendingChoice).toBeUndefined();
    expect(s.players.ai.life).toBe(25); // 5 × 3
  });

  it("X=0 is a clean no-op (no loss, no pause)", () => {
    let s = board({ aiLife: 40 });
    s = run(s, 0);
    expect(s.pendingChoice).toBeUndefined();
    expect(s.players.ai.life).toBe(40);
  });

  it("only a LAND on the opponent's board is NOT a legal sac (nonland pool empty) → forced life loss", () => {
    let s = board({ aiLife: 20, aiBoard: [perm("l1", "Swamp", "Basic Land — Swamp")], aiHand: [] });
    s = run(s, 2);
    expect(s.pendingChoice).toBeUndefined(); // life is the ONLY mode → no pause
    expect(s.players.ai.life).toBe(14); // 2 × 3
    expect(s.players.ai.battlefield).toHaveLength(1); // the land is untouched
  });
});

describe("Torment of Hailfire — RUNTIME pausing choice chain (a real ≥2-mode decision)", () => {
  it("opponent with a nonland permanent pauses for a 3-mode edict-mode choice on the OPPONENT's seat", () => {
    let s = board({ aiLife: 20, aiBoard: [perm("a1", "Signet", "Artifact")], aiHand: [{ id: "h1", name: "Island", type: "Basic Land — Island" }] });
    s = run(s, 1);
    expect(s.pendingChoice).toBeTruthy();
    expect(s.pendingChoice.kind).toBe("edict-mode");
    expect(s.pendingChoice.controller).toBe("ai"); // the affected OPPONENT chooses (CR 118.9), not the caster
    expect(s.pendingChoice.modes).toEqual(["life", "sacrifice", "discard"]);
  });

  it("comfortable-life AI auto-picks LOSE LIFE (keep board + hand intact)", () => {
    let s = board({ aiLife: 20, aiBoard: [perm("a1", "Signet", "Artifact")], aiHand: [{ id: "h1", name: "Island", type: "Basic Land — Island" }] });
    s = run(s, 1);
    const pick = autoPickEdictMode(s, s.pendingChoice);
    expect(pick).toEqual({ mode: "life" });
    s = resolveEdictModeChoice(s, pick);
    expect(s.players.ai.life).toBe(17); // -3
    expect(s.players.ai.battlefield).toHaveLength(1); // permanent kept
    expect(s.players.ai.hand).toHaveLength(1); // card kept
    expect(s.pendingChoice).toBeUndefined(); // queue drained (X=1, 1 opponent)
  });

  it("LOW-life AI auto-picks DISCARD (preserve life) when it has a card", () => {
    let s = board({ aiLife: 3, aiBoard: [perm("a1", "Signet", "Artifact")], aiHand: [{ id: "h1", name: "Island", type: "Basic Land — Island" }] });
    s = run(s, 1);
    const pick = autoPickEdictMode(s, s.pendingChoice);
    expect(pick).toEqual({ mode: "discard", cardId: "h1" });
    s = resolveEdictModeChoice(s, pick);
    expect(s.players.ai.life).toBe(3); // life preserved
    expect(s.players.ai.hand).toHaveLength(0); // card discarded
    expect(s.players.ai.battlefield).toHaveLength(1); // board kept
  });

  it("LOW-life AI with NO card sacrifices its nonland permanent (preserve life)", () => {
    let s = board({ aiLife: 2, aiBoard: [perm("a1", "Signet", "Artifact")], aiHand: [] });
    s = run(s, 1);
    const pick = autoPickEdictMode(s, s.pendingChoice);
    expect(pick).toEqual({ mode: "sacrifice", permId: "a1" });
    s = resolveEdictModeChoice(s, pick);
    expect(s.players.ai.life).toBe(2); // life preserved
    expect(s.players.ai.battlefield).toHaveLength(0); // permanent sacrificed
  });

  it("X=2 chains a SECOND round: after the first pick the next iteration re-pauses (queue not dropped)", () => {
    let s = board({ aiLife: 20, aiBoard: [perm("a1", "Signet", "Artifact")], aiHand: [{ id: "h1", name: "Island", type: "Basic Land — Island" }] });
    s = run(s, 2);
    expect(s.pendingChoice.kind).toBe("edict-mode"); // round 1 pauses
    // Round 1: choose life.
    s = resolveEdictModeChoice(s, { mode: "life" });
    // The chain re-pauses for round 2 (the same opponent still has a board + hand → still a real choice).
    expect(s.pendingChoice).toBeTruthy();
    expect(s.pendingChoice.kind).toBe("edict-mode");
    expect(s.players.ai.life).toBe(17); // one life loss applied so far
    // Round 2: choose life again → queue drains.
    s = resolveEdictModeChoice(s, { mode: "life" });
    expect(s.pendingChoice).toBeUndefined();
    expect(s.players.ai.life).toBe(14); // 2 × 3
  });
});

describe("Torment of Hailfire — CREED guards (never a fabricated / illegal branch)", () => {
  it("a stale/illegal permId on a 'sacrifice' pick falls back to the mandatory life loss (no fabricated sac)", () => {
    let s = board({ aiLife: 20, aiBoard: [perm("a1", "Signet", "Artifact")], aiHand: [] });
    s = run(s, 1);
    // Submit a sacrifice of a permanent that isn't in the pool.
    s = resolveEdictModeChoice(s, { mode: "sacrifice", permId: "ghost" });
    expect(s.players.ai.battlefield).toHaveLength(1); // nothing fabricated-sacrificed
    expect(s.players.ai.life).toBe(17); // the mandatory 3 still happens
  });

  it("a stale cardId on a 'discard' pick falls back to the mandatory life loss (no fabricated discard)", () => {
    let s = board({ aiLife: 20, aiBoard: [perm("a1", "Signet", "Artifact")], aiHand: [{ id: "h1", name: "Island", type: "Basic Land — Island" }] });
    s = run(s, 1);
    s = resolveEdictModeChoice(s, { mode: "discard", cardId: "ghost" });
    expect(s.players.ai.hand).toHaveLength(1); // no fabricated discard
    expect(s.players.ai.life).toBe(17); // the mandatory 3 still happens
  });

  it("an opponent eliminated mid-pause (CR 800.4a) is a clean no-op that still drains the queue", () => {
    let s = board({ aiLife: 20, aiBoard: [perm("a1", "Signet", "Artifact")], aiHand: [{ id: "h1", name: "Island", type: "Basic Land — Island" }] });
    s = run(s, 1);
    // Remove the affected opponent while the choice is pending.
    const { ai: _gone, ...rest } = s.players;
    s = { ...s, players: rest };
    s = resolveEdictModeChoice(s, { mode: "life" });
    expect(s.pendingChoice).toBeUndefined(); // resolved without wedging
    expect(s.players.ai).toBeUndefined();
  });
});

describe("Torment of Hailfire — CREED anti-FP: variants stay LOW (routed to the Arbiter)", () => {
  const parked = (oracle) => programConfidence(parseEffectProgram({ name: "X", type: "Sorcery", mana: "{X}{B}{B}", oracle }));

  it("a DIFFERENT life amount (2, not 3) does NOT match → LOW", () => {
    expect(parked("Repeat the following process X times. Each opponent loses 2 life unless that player sacrifices a nonland permanent of their choice or discards a card.")).toBe("low");
  });

  it("dropping the discard alternative does NOT match → LOW", () => {
    expect(parked("Repeat the following process X times. Each opponent loses 3 life unless that player sacrifices a nonland permanent of their choice.")).toBe("low");
  });

  it("a NON-X (no repeat wrapper) fixed edict does NOT match the iterated matcher → LOW", () => {
    // The single-iteration "Each opponent loses 3 life unless…or…" (no repeat) is a different, unmodeled shape.
    expect(programConfidence(parseEffectProgram({ name: "X", type: "Sorcery", mana: "{4}{B}{B}", oracle: "Each opponent loses 3 life unless that player sacrifices a nonland permanent of their choice or discards a card." }))).toBe("low");
  });

  it("a trailing rider after the edict does NOT match → LOW", () => {
    expect(parked("Repeat the following process X times. Each opponent loses 3 life unless that player sacrifices a nonland permanent of their choice or discards a card. You gain 1 life.")).toBe("low");
  });
});

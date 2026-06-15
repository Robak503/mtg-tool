/**
 * Tests for the flush-time target chooser (P2.8b — the flush stage's targeted-trigger
 * support). When a HIGH, non-modal trigger needs a chosen target, `flushTriggers`
 * enumerates the legal targets via `expandCastChoices` as the ability is put on the
 * stack (CR 603.3c), picks one (default first-legal, or an injected `chooseTargets`),
 * and routes the trigger through the full EFFECT_PROGRAM interpreter. A targeted
 * trigger with no legal target is removed from the stack (logged, never fabricated).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { flushTriggers } from "./gameEngine.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

function creature(name, oracle = "", extra = {}) {
  return { id: `card-${name}`, name, type: "Creature — Bear", power: 2, toughness: 2, oracle, ...extra };
}
function stateWith(over = {}) {
  return { ...createGameState({ userDeck: [], aiDeck: [] }), activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main", ...over };
}
/** Place vanilla creatures on a player's battlefield, by deterministic id. */
function withCreatures(state, playerId, ids) {
  const bf = ids.map((id) => createPermanent({ id, card: creature(id), controller: playerId, summoningSick: false }));
  return { ...state, players: { ...state.players, [playerId]: { ...state.players[playerId], battlefield: bf } } };
}
/** A pending targeted trigger controlled by "user" (the shape flushTriggers consumes). */
function targetedTrigger(clause, over = {}) {
  return {
    event: "etb",
    source: { name: "Hunter", permanentId: "perm-src" },
    controller: "user",
    descriptor: { event: "etb", scope: "self", whose: "any", effectClause: clause, interveningIf: null },
    context: {},
    targets: [],
    payload: { resolver: "trigger.effect", params: { effect: null, controller: "user", targets: [], context: {} } },
    ...over,
  };
}

const CLAUSE = "destroy target creature an opponent controls";

describe("flushTriggers — flush-time target chooser (CR 603.3c)", () => {
  it("defaults to the first legal target when no chooser is injected", () => {
    let s = withCreatures(stateWith(), "ai", ["perm-a", "perm-b"]);
    s = { ...s, pendingTriggers: [targetedTrigger(CLAUSE)] };
    const trig = flushTriggers(s).stack.find((o) => o.kind === "triggered-ability");
    expect(trig.payload.resolver).toBe("effect-program");
    expect(trig.payload.params.targets.map((t) => t.id)).toEqual(["perm-a"]);
    expect(trig.payload.params.program.atoms[0].op).toBe("destroy");
  });

  it("an injected chooseTargets overrides the default and sees every candidate", () => {
    let s = withCreatures(stateWith(), "ai", ["perm-a", "perm-b"]);
    s = { ...s, pendingTriggers: [targetedTrigger(CLAUSE)] };
    let seen = 0;
    const chooseTargets = (candidates, info) => {
      seen = candidates.length;
      expect(info.trigger.controller).toBe("user");
      expect(info.program).toBeTruthy();
      return candidates[candidates.length - 1]; // pick the LAST legal target
    };
    const trig = flushTriggers(s, { chooseTargets }).stack.find((o) => o.kind === "triggered-ability");
    expect(seen).toBe(2);
    expect(trig.payload.params.targets.map((t) => t.id)).toEqual(["perm-b"]);
  });

  it("a chooser may return an INDEX into the candidate list", () => {
    let s = withCreatures(stateWith(), "ai", ["perm-a", "perm-b"]);
    s = { ...s, pendingTriggers: [targetedTrigger(CLAUSE)] };
    const trig = flushTriggers(s, { chooseTargets: () => 1 }).stack.find((o) => o.kind === "triggered-ability");
    expect(trig.payload.params.targets.map((t) => t.id)).toEqual(["perm-b"]);
  });

  it("an invalid chooser return falls back to first-legal", () => {
    let s = withCreatures(stateWith(), "ai", ["perm-a", "perm-b"]);
    s = { ...s, pendingTriggers: [targetedTrigger(CLAUSE)] };
    const trig = flushTriggers(s, { chooseTargets: () => undefined }).stack.find((o) => o.kind === "triggered-ability");
    expect(trig.payload.params.targets.map((t) => t.id)).toEqual(["perm-a"]);
  });

  it("drops a targeted trigger with no legal target, logging the removal (CR 603.3c)", () => {
    const s = { ...stateWith(), pendingTriggers: [targetedTrigger(CLAUSE)] }; // no enemy creatures
    const out = flushTriggers(s);
    expect(out.stack.find((o) => o.kind === "triggered-ability")).toBeUndefined();
    expect(out.pendingTriggers).toEqual([]);
    expect(out.log.some((e) => e.kind === "trigger-removed-no-target")).toBe(true);
  });

  it("drops ONLY the unsatisfiable trigger — a sibling with a legal target still resolves", () => {
    // Enemy creature on board, user controls none. The 'you control' trigger has no
    // legal target (dropped); the 'an opponent controls' trigger binds the enemy.
    let s = withCreatures(stateWith(), "ai", ["perm-a"]);
    s = { ...s, pendingTriggers: [
      targetedTrigger("destroy target creature you control", { source: { name: "NoTarget" } }),
      targetedTrigger("destroy target creature an opponent controls", { source: { name: "HasTarget" } }),
    ] };
    const out = flushTriggers(s);
    const trigs = out.stack.filter((o) => o.kind === "triggered-ability");
    expect(trigs).toHaveLength(1);
    expect(trigs[0].source.name).toBe("HasTarget");
    expect(trigs[0].payload.params.targets.map((t) => t.id)).toEqual(["perm-a"]);
    expect(out.log.some((e) => e.kind === "trigger-removed-no-target" && e.source === "NoTarget")).toBe(true);
  });

  it("a NON-targeted trigger is unaffected — routes with empty targets", () => {
    const s = { ...stateWith(), pendingTriggers: [targetedTrigger("draw a card", { descriptor: { effectClause: "draw a card", interveningIf: null } })] };
    const trig = flushTriggers(s).stack.find((o) => o.kind === "triggered-ability");
    expect(trig.payload.resolver).toBe("effect-program");
    expect(trig.payload.params.targets).toEqual([]);
  });
});

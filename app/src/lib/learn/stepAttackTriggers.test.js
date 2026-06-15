/**
 * Tests for step + attack triggers (Phase-7 PR-8).
 *
 * checkStepTriggers (CR 603.2b, "your upkeep" gated by whose) and
 * checkAttackTriggers (CR 508.3, full attacker batch) wired into runStepActions,
 * which flushes them onto the stack at the priority-grant checkpoint.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { checkStepTriggers, checkAttackTriggers } from "./triggers.js";
import { runStepActions } from "./gameEngine.js";
import { _resetIdsForTests, createGameState } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

function creature(name, oracle, extra = {}) {
  return { id: `card-${name}`, name, type: "Creature — Bear", power: 2, toughness: 2, oracle, ...extra };
}
function permObj(card, controller, id, over = {}) {
  return { id, card, controller, tapped: false, summoningSick: false, counters: {}, damageMarked: 0, attachments: [], attachedTo: null, ...over };
}
function stateWith(over = {}) {
  return { ...createGameState({ userDeck: [], aiDeck: [] }), activePlayer: "user", priorityHolder: "user", ...over };
}
function placePerms(state, perms) {
  const players = { ...state.players };
  for (const p of perms) players[p.controller] = { ...players[p.controller], battlefield: [...players[p.controller].battlefield, p] };
  return { ...state, players };
}
function triggerOnStack(state) {
  return (state.stack || []).find(s => s.kind === "triggered-ability");
}

describe("checkStepTriggers (unit)", () => {
  const howler = creature("Howler", "At the beginning of your upkeep, draw a card.", { id: "card-h" });

  it("fires a 'your upkeep' trigger for the active player", () => {
    const state = placePerms(stateWith({ activePlayer: "user" }), [permObj(howler, "user", "perm-h")]);
    const out = checkStepTriggers(state, "upkeep");
    expect(out.pendingTriggers).toHaveLength(1);
    expect(out.pendingTriggers[0].payload.params.effect).toMatchObject({ kind: "draw" });
  });

  it("does NOT fire a 'your upkeep' trigger on an opponent's turn", () => {
    const state = placePerms(stateWith({ activePlayer: "ai" }), [permObj(howler, "user", "perm-h")]);
    expect(checkStepTriggers(state, "upkeep").pendingTriggers || []).toHaveLength(0);
  });
});

describe("checkAttackTriggers (unit)", () => {
  it("fires the attacker's own 'whenever this attacks' trigger with defender context", () => {
    const raider = permObj(creature("Raider", "Whenever Raider attacks, you gain 1 life.", { id: "card-r" }), "user", "perm-r", { tapped: true });
    const state = placePerms(
      stateWith({ combat: { attackers: [{ permanentId: "perm-r", attackingPlayer: "user", defender: "ai" }], blockers: [] } }),
      [raider],
    );
    const out = checkAttackTriggers(state);
    expect(out.pendingTriggers).toHaveLength(1);
    expect(out.pendingTriggers[0].payload.params.effect).toMatchObject({ kind: "gainLife", amount: 1 });
    expect(out.pendingTriggers[0].payload.params.context.defenderId).toBe("ai");
  });

  it("is a no-op with no declared attackers", () => {
    const s = stateWith({ combat: { attackers: [], blockers: [] } });
    expect(checkAttackTriggers(s)).toBe(s);
  });
});

describe("wired into runStepActions", () => {
  it("stepping into upkeep flushes a 'your upkeep' draw trigger onto the stack", () => {
    const howler = creature("Howler", "At the beginning of your upkeep, draw a card.", { id: "card-h" });
    const state = placePerms(stateWith({ phase: "beginning", step: "upkeep", activePlayer: "user" }), [permObj(howler, "user", "perm-h")]);
    const out = runStepActions(state);
    const trig = triggerOnStack(out);
    expect(trig).toBeTruthy();
    // P2.8: a non-targeted trigger effect now routes through the full EffectProgram
    // interpreter (event-agnostic — upkeep triggers ride the same flush upgrade).
    expect(trig.payload.resolver).toBe("effect-program");
    expect(trig.payload.params.program.atoms[0].op).toBe("draw");
  });

  it("a 'your upkeep' trigger does not fire on an opponent's upkeep", () => {
    const howler = creature("Howler", "At the beginning of your upkeep, draw a card.", { id: "card-h" });
    const state = placePerms(stateWith({ phase: "beginning", step: "upkeep", activePlayer: "ai" }), [permObj(howler, "user", "perm-h")]);
    expect(triggerOnStack(runStepActions(state))).toBeFalsy();
  });

  it("the declare-blockers step flushes an attack trigger from the declared batch", () => {
    const raider = permObj(creature("Raider", "Whenever Raider attacks, you gain 1 life.", { id: "card-r" }), "user", "perm-r", { tapped: true });
    const state = placePerms(
      stateWith({ phase: "combat", step: "declare-blockers", activePlayer: "user", combat: { attackers: [{ permanentId: "perm-r", attackingPlayer: "user", defender: "ai" }], blockers: [] } }),
      [raider],
    );
    const trig = triggerOnStack(runStepActions(state));
    expect(trig).toBeTruthy();
    expect(trig.payload.resolver).toBe("effect-program");
    expect(trig.payload.params.program.atoms[0].op).toBe("gain-life");
  });
});

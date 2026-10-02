/**
 * Tests for step + attack triggers (Phase-7 PR-8).
 *
 * checkStepTriggers (CR 603.2b, "your upkeep" gated by whose) wired into runStepActions, and
 * checkAttackTriggers (CR 508.3, full attacker batch) wired into the attack declaration's close
 * (passPriority / nextStep / dispatchAction in the declare attackers step); each flushes its triggers
 * onto the stack at the priority-grant checkpoint.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { checkStepTriggers, checkAttackTriggers, detectTriggers } from "./triggers.js";
import { passPriority, runStepActions, resolveTopOfStack } from "./gameEngine.js";
import { _resetIdsForTests, createGameState } from "./gameState.js";
import { classifyCard } from "./coverage.js";

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
    expect(out.pendingTriggers[0].descriptor.effectClause).toMatch(/draw a card/i); // W4: the clause is what the flush stage parses
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
    expect(out.pendingTriggers[0].descriptor.effectClause).toMatch(/you gain 1 life/i);
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
    let state = placePerms(stateWith({ phase: "beginning", step: "upkeep", activePlayer: "user" }), [permObj(howler, "user", "perm-h")]);
    state = { ...state, players: { ...state.players, user: { ...state.players.user, library: [{ id: "lib-up", name: "Card" }] } } };
    const out = runStepActions(state);
    const trig = triggerOnStack(out);
    expect(trig).toBeTruthy();
    // P2.8: a non-targeted trigger effect now routes through the full EffectProgram
    // interpreter (event-agnostic — upkeep triggers ride the same flush upgrade).
    expect(trig.payload.resolver).toBe("effect-program");
    expect(trig.payload.params.program.atoms[0].op).toBe("draw");
    // …and resolving it actually draws the card (effect, not just shape).
    expect(resolveTopOfStack(out).players.user.hand.map((c) => c.id)).toContain("lib-up");
  });

  it("a 'your upkeep' trigger does not fire on an opponent's upkeep", () => {
    const howler = creature("Howler", "At the beginning of your upkeep, draw a card.", { id: "card-h" });
    const state = placePerms(stateWith({ phase: "beginning", step: "upkeep", activePlayer: "ai" }), [permObj(howler, "user", "perm-h")]);
    expect(triggerOnStack(runStepActions(state))).toBeFalsy();
  });

  // RE-POINTED (the attack-trigger timing fix, CR 508.1m / 508.2): attack triggers no longer fire at the declare-blockers step
  // entry. They fire when the attacker declaration closes — the active player's first pass of the declare attackers step — and
  // the step holds for them with the active player's priority (attackTriggerTiming.test.js).
  it("the attack declaration closing (the first pass of the declare attackers step) flushes an attack trigger from the declared batch", () => {
    const raider = permObj(creature("Raider", "Whenever Raider attacks, you gain 1 life.", { id: "card-r" }), "user", "perm-r", { tapped: true });
    const state = placePerms(
      stateWith({ phase: "combat", step: "declare-attackers", activePlayer: "user", combat: { attackers: [{ permanentId: "perm-r", attackingPlayer: "user", defender: "ai" }], blockers: [] } }),
      [raider],
    );
    const out = passPriority(state);
    expect({ step: out.step, holder: out.priorityHolder }).toEqual({ step: "declare-attackers", holder: "user" });
    const trig = triggerOnStack(out);
    expect(trig).toBeTruthy();
    expect(trig.payload.resolver).toBe("effect-program");
    expect(trig.payload.params.program.atoms[0].op).toBe("gain-life");
    // …and resolving it actually gains the life.
    const lifeBefore = out.players.user.life;
    expect(resolveTopOfStack(out).players.user.life).toBe(lifeBefore + 1);
  });
});

// SUBTYPE attacks / dies (tribal payoffs) — "Whenever a <Subtype> you control attacks/dies, <effect>".
// Reuses the subtypeYouControl scope; checkAttackTriggers / checkDiesTriggers thread the triggering
// creature. Corpus flip-diff: +2 clean (Sanctum Seeker, Utvara Hellkite), 0 regressions; the rest of the
// pattern's cards carry OTHER unmodeled abilities and correctly stay body-only (CREED — no over-claim).
describe("SUBTYPE attacks / dies triggers", () => {
  const trig = (type, oracle) => detectTriggers({ name: "X", type, oracle, mana: "{4}" });
  const C = (type, oracle) => ({ type, oracle, mana: "{4}", name: "X", power: "4", toughness: "4" });

  it("detects 'a <Subtype> you control attacks/dies' as subtypeYouControl with the subtype filter", () => {
    expect(trig("Creature — Vampire", "Whenever a Vampire you control attacks, each opponent loses 1 life and you gain 1 life.")[0])
      .toMatchObject({ event: "attacks", scope: "subtypeYouControl", subtypeFilter: "Vampire" });
    expect(trig("Creature — Human", "Whenever a Human you control dies, draw a card.")[0])
      .toMatchObject({ event: "dies", scope: "subtypeYouControl", subtypeFilter: "Human" });
  });

  it("Sanctum Seeker (Vampire attacks → drain) and Utvara Hellkite (Dragon attacks → token) flip native-trigger", () => {
    expect(classifyCard(C("Creature — Vampire Knight", "Whenever a Vampire you control attacks, each opponent loses 1 life and you gain 1 life."))).toBe("native-trigger");
    expect(classifyCard(C("Creature — Dragon", "Flying\nWhenever a Dragon you control attacks, create a 6/6 red Dragon creature token with flying."))).toBe("native-trigger");
  });

  it("CREED: a restricted subtype-dies ('during your turn') stays undetected → not native", () => {
    expect(trig("Creature — Mutant", "Whenever a Mutant you control dies during your turn, draw a card.")).toHaveLength(0);
  });
});

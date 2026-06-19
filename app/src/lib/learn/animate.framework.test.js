/**
 * animate.framework.test.js — WALT-ANIMATE PR1 (the "becomes a creature" framework).
 *
 * The layer engine already supports adding the Creature type (layer 4) and setting P/T
 * (layer 7b). This PR makes the engine's combat + state-based-action paths consult the
 * DERIVED type (`permanentIsCreature`) instead of the printed type-line, so a permanent
 * granted the Creature type via a continuous effect — an animated land, a man-land —
 * functions as the creature it has become: it can attack, it can block, and it dies to
 * the lethal / 0-toughness SBAs.
 *
 * These are engine SIMS: PR1 flips zero real cards (it's the honest framework, like PW-1).
 * They prove the capability end-to-end through the real `legalActionsForPlayer` and
 * `destroyLethalCreatures`, and they pin the BEHAVIOR-NEUTRALITY guarantee for every
 * existing permanent (printed creatures, "*"-toughness creatures, and inert non-creatures
 * all behave exactly as before, because layer 4 only ADDS types).
 */

import { describe, it, expect } from "vitest";
import { createGameState, destroyLethalCreatures } from "./gameState.js";
import { resolveCombatDamage } from "./combatResolution.js";
import {
  addContinuousEffect,
  permanentIsCreature,
  permanentPower,
  permanentToughness,
} from "./layers.js";
import { legalActionsForPlayer, filterActions } from "./legalChoices.js";

// A real land (no printed P/T) — defaults make it untapped, not summoning sick.
function landPerm(id, controller, { name = "Forest", type = "Basic Land — Forest", summoningSick = false } = {}) {
  return {
    id, card: { name, type, oracle: "" }, controller,
    tapped: false, summoningSick, counters: {}, damageMarked: 0,
    attachments: [], attachedTo: null, timestamp: 0,
  };
}

function creaturePerm(id, controller, { name = "Bear", type = "Creature — Bear", power = 2, toughness = 2 } = {}) {
  return {
    id, card: { name, type, power, toughness, oracle: "" }, controller,
    tapped: false, summoningSick: false, counters: {}, damageMarked: 0,
    attachments: [], attachedTo: null, timestamp: 0,
  };
}

function stateWith({ userBf = [], aiBf = [], step, activePlayer, priorityHolder } = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  const next = {
    ...s,
    players: {
      ...s.players,
      user: { ...s.players.user, battlefield: userBf },
      ai: { ...s.players.ai, battlefield: aiBf },
    },
  };
  if (step !== undefined) next.step = step;
  if (activePlayer !== undefined) next.activePlayer = activePlayer;
  if (priorityHolder !== undefined) next.priorityHolder = priorityHolder;
  return next;
}

// Apply a full ANIMATE: layer-4 add Creature type + layer-7b set P/T (the exact pair an
// animate spell / man-land activation produces). Returns the new state.
function animate(state, permId, { power, toughness, cardName = "Animate", duration = { kind: "permanent" } } = {}) {
  let r = addContinuousEffect(state, {
    layer: 4, op: { types: ["Creature"] },
    affects: { mode: "fixed", permanentIds: [permId] }, duration,
    source: { kind: "resolution", permanentId: null, cardName },
  });
  r = addContinuousEffect(r.state, {
    layer: 7, sublayer: "7b", op: { layerOp: "ptSet", power, toughness },
    affects: { mode: "fixed", permanentIds: [permId] }, duration,
    source: { kind: "resolution", permanentId: null, cardName },
  });
  return r.state;
}

const declareAttackers = (state, pid) => filterActions(legalActionsForPlayer(state, pid), "declare-attacker");
const declareBlockers = (state, pid, attackerIds) =>
  filterActions(legalActionsForPlayer(state, pid, { declaredAttackers: attackerIds }), "declare-blocker");

describe("WALT-ANIMATE framework — a granted Creature type makes a permanent a creature", () => {
  it("an animated land becomes a creature with the set P/T (layer 4 + 7b)", () => {
    let state = stateWith({ userBf: [landPerm("L1", "user")] });
    expect(permanentIsCreature(state, "L1")).toBe(false);

    state = animate(state, "L1", { power: 3, toughness: 3 });
    expect(permanentIsCreature(state, "L1")).toBe(true);
    expect(permanentPower(state, "L1")).toBe(3);
    expect(permanentToughness(state, "L1")).toBe(3);
  });

  it("an animated land can be declared as an attacker (not before, yes after)", () => {
    let state = stateWith({ userBf: [landPerm("L1", "user")], step: "declare-attackers", activePlayer: "user" });
    expect(declareAttackers(state, "user").some(a => a.permanentId === "L1")).toBe(false);

    state = animate(state, "L1", { power: 3, toughness: 3 });
    expect(declareAttackers(state, "user").some(a => a.permanentId === "L1")).toBe(true);
  });

  it("a summoning-sick animated land cannot attack without haste (CR 302.6)", () => {
    let state = stateWith({
      userBf: [landPerm("L1", "user", { summoningSick: true })],
      step: "declare-attackers", activePlayer: "user",
    });
    state = animate(state, "L1", { power: 3, toughness: 3 });
    expect(declareAttackers(state, "user").some(a => a.permanentId === "L1")).toBe(false);
  });

  it("an animated permanent can be declared as a blocker", () => {
    let state = stateWith({
      userBf: [landPerm("L1", "user")],
      aiBf: [creaturePerm("A1", "ai")],
      step: "declare-blockers", activePlayer: "ai",
    });
    expect(declareBlockers(state, "user", ["A1"]).some(a => a.permanentId === "L1")).toBe(false);

    state = animate(state, "L1", { power: 3, toughness: 3 });
    expect(declareBlockers(state, "user", ["A1"]).some(a => a.permanentId === "L1" && a.attackerId === "A1")).toBe(true);
  });

  it("an animated land dies to lethal marked damage (CR 704.5g)", () => {
    let state = stateWith({ userBf: [landPerm("L1", "user")] });
    state = animate(state, "L1", { power: 3, toughness: 3 });
    state.players.user.battlefield[0].damageMarked = 3; // lethal for a 3/3

    const { state: after, dead } = destroyLethalCreatures(state);
    expect(dead.some(d => d.id === "L1")).toBe(true);
    expect(after.players.user.battlefield.some(p => p.id === "L1")).toBe(false);
  });

  it("an animated 0-toughness permanent dies (CR 704.5f)", () => {
    let state = stateWith({ userBf: [landPerm("L1", "user")] });
    state = animate(state, "L1", { power: 0, toughness: 0 });

    const { dead } = destroyLethalCreatures(state);
    expect(dead.some(d => d.id === "L1")).toBe(true);
  });

  it("an unblocked animated land deals its derived power to the defending player (combat damage)", () => {
    let state = stateWith({ userBf: [landPerm("L1", "user")] });
    state = animate(state, "L1", { power: 3, toughness: 3 });
    const life0 = state.players.ai.life;
    state = {
      ...state, step: "combat-damage", phase: "combat",
      combat: { attackers: [{ permanentId: "L1", attackingPlayer: "user", defender: "ai" }], blockers: [] },
    };
    const after = resolveCombatDamage(state);
    expect(after.players.ai.life).toBe(life0 - 3); // the animated 3/3 dealt 3
  });

  it("an animated land is a full combat participant: it both deals and takes combat damage (trades)", () => {
    let state = stateWith({
      userBf: [landPerm("L1", "user")],
      aiBf: [creaturePerm("A1", "ai", { name: "Grizzly Bears", type: "Creature — Bear", power: 3, toughness: 3 })],
    });
    state = animate(state, "L1", { power: 3, toughness: 3 });
    state = {
      ...state, step: "combat-damage", phase: "combat",
      combat: {
        attackers: [{ permanentId: "L1", attackingPlayer: "user", defender: "ai" }],
        blockers: [{ blockerId: "A1", blockingPlayer: "ai", attackerId: "L1" }],
      },
    };
    const after = resolveCombatDamage(state);
    // 3/3 animated land ↔ 3/3 blocker: both take 3 lethal damage → both die in the same SBA pass.
    expect(after.players.user.battlefield.some(p => p.id === "L1")).toBe(false);
    expect(after.players.ai.battlefield.some(p => p.id === "A1")).toBe(false);
  });

  it("an animated land still taps for mana (the printed land ability survives)", () => {
    let state = stateWith({ userBf: [landPerm("L1", "user")], step: "main", activePlayer: "user", priorityHolder: "user" });
    const tapsBefore = filterActions(legalActionsForPlayer(state, "user"), "tap-for-mana").some(a => a.permanentId === "L1");
    expect(tapsBefore).toBe(true);

    state = animate(state, "L1", { power: 3, toughness: 3 });
    const tapsAfter = filterActions(legalActionsForPlayer(state, "user"), "tap-for-mana").some(a => a.permanentId === "L1");
    expect(tapsAfter).toBe(true);
  });
});

describe("WALT-ANIMATE framework — behavior-neutral for every existing permanent", () => {
  it("a non-animated land is not a creature, not an attacker, and immune to the lethal SBA", () => {
    const land = landPerm("L1", "user");
    land.damageMarked = 99; // would be lethal IF it were a creature
    const state = stateWith({ userBf: [land], step: "declare-attackers", activePlayer: "user" });

    expect(permanentIsCreature(state, "L1")).toBe(false);
    expect(declareAttackers(state, "user").some(a => a.permanentId === "L1")).toBe(false);
    expect(destroyLethalCreatures(state).dead.some(d => d.id === "L1")).toBe(false);
  });

  it("a printed creature still attacks and dies to lethal damage (regression)", () => {
    const bear = creaturePerm("C1", "user");
    const state = stateWith({ userBf: [bear], step: "declare-attackers", activePlayer: "user" });
    expect(declareAttackers(state, "user").some(a => a.permanentId === "C1")).toBe(true);

    state.players.user.battlefield[0].damageMarked = 2; // lethal for a 2/2
    expect(destroyLethalCreatures(state).dead.some(d => d.id === "C1")).toBe(true);
  });

  it("a printed '*'-toughness creature is still skipped by the SBA (unevaluable printed toughness)", () => {
    const goyf = creaturePerm("C1", "user", { name: "Lhurgoyf", type: "Creature — Lhurgoyf", power: "*", toughness: "*" });
    goyf.damageMarked = 5;
    const state = stateWith({ userBf: [goyf] });

    // No CDA registered → derived toughness is unevaluable → skipped, exactly as before the rewire.
    expect(destroyLethalCreatures(state).dead.some(d => d.id === "C1")).toBe(false);
  });
});

/**
 * grimReapersSprint.test.js — POD-SIM THREE · Killer Turts KT-8 (2026-09-05): Grim Reaper's Sprint.
 *
 * "Morbid — This spell costs {3} less to cast if a creature died this turn. Enchant creature. When this Aura enters, untap
 * each creature you control. If it's your main phase, there is an additional combat phase after this phase. Enchanted
 * creature gets +2/+2 and has haste." The aura ETB already rides KT-7a's gated extra-combat arm; the miss was MORBID: a
 * self cost-reduction the cast lane's self-metric reader now models as a FIXED amount gated on any creature having died
 * this turn (every seat's counter, CR 700.4). The aura residue check treats the modeled sentence as not-residue — the
 * runtime reduces the cast; the Aura still does its printed thing.
 *
 * Real oracle fixture (bundled Scryfall snapshot, verified in-session 2026-09-05).
 */

import { describe, it, expect, beforeEach } from "vitest";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { legalActionsForPlayer, filterActions } from "./legalChoices.js";
import { selfCostReductionMetric } from "./staticAbilityParser.js";
import { checkEnterTriggers } from "./triggers.js";
import { flushTriggers, resolveTopOfStack, chooseTriggerTargets } from "./gameEngine.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const SPRINT = { id: "grs", name: "Grim Reaper's Sprint", type: "Enchantment — Aura", mana: "{4}{R}", keywords: [],
  oracle: "Morbid — This spell costs {3} less to cast if a creature died this turn.\nEnchant creature\nWhen this Aura enters, untap each creature you control. If it's your main phase, there is an additional combat phase after this phase.\nEnchanted creature gets +2/+2 and has haste." };
const BEAR = { id: "c-bear", name: "Grizzly Bears", type: "Creature — Bear", mana: "{1}{G}", oracle: "", power: 2, toughness: 2 };

function mainState({ pool = {}, deaths = 0, deathsSeat = "user", phase = "precombat-main", step = "main" } = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  const base = {
    ...s, phase, step, activePlayer: "user", priorityHolder: "user", consecutivePasses: 0, turn: 4,
    players: { ...s.players, user: { ...s.players.user, hand: [SPRINT], battlefield: [createPermanent({ id: "B", card: BEAR, controller: "user", tapped: true })], manaPool: { ...s.players.user.manaPool, ...pool } } },
  };
  return deaths ? { ...base, players: { ...base.players, [deathsSeat]: { ...base.players[deathsSeat], creaturesDiedThisTurn: deaths } } } : base;
}
const cast = (s) => filterActions(legalActionsForPlayer(s, "user"), "cast-spell").find((c) => c.cardId === "grs");
const settle = (s) => { let g = 0; while (s.stack.length && !s.pendingChoice && g++ < 20) s = resolveTopOfStack(s); return s; };

describe("reader + classifier", () => {
  it("the morbid sentence reads as a fixed 3 gated on a creature dying this turn; the Aura classifies native-trigger", () => {
    expect(selfCostReductionMetric(SPRINT)).toEqual({ kind: "creatureDiedThisTurn", amount: 3 });
    expect(classifyCard(SPRINT)).toBe("native-trigger");
    // CREED: a different morbid rider is not swept in
    expect(selfCostReductionMetric({ oracle: "Morbid — This spell costs {3} less to cast if a creature died this turn and you control a Zombie." })).toBeNull();
  });
});

describe("runtime — the reduced cast", () => {
  it("with {R}{R} in the pool: not castable with no death this turn; castable after a creature died — under EITHER seat", () => {
    expect(cast(mainState({ pool: { R: 2 } }))).toBeUndefined();
    expect(cast(mainState({ pool: { R: 2 }, deaths: 1 }))).toBeTruthy();
    expect(cast(mainState({ pool: { R: 2 }, deaths: 1, deathsSeat: "ai" }))).toBeTruthy();
    expect(cast(mainState({ pool: { R: 5 } }))).toBeTruthy(); // the full cost still works with no death
  });
});

describe("runtime — the aura ETB rides the gated extra-combat arm", () => {
  it("entering in your main phase: the bear untaps and an after-main extra combat is queued; entering in combat queues none", () => {
    let s = mainState();
    const aura = { ...createPermanent({ id: "A", card: SPRINT, controller: "user" }), attachedTo: "B" };
    s = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [...s.players.user.battlefield, aura] } } };
    s = settle(flushTriggers(checkEnterTriggers(s, aura), { chooseTargets: chooseTriggerTargets }));
    expect(s.players.user.battlefield.find((p) => p.id === "B").tapped).toBe(false);
    expect(s.extraPhases).toEqual([{ kind: "combat", after: "main", withMain: false }]); // the Aura grants no main after its combat
    let c = mainState({ phase: "combat", step: "declare-blockers" });
    const aura2 = { ...createPermanent({ id: "A2", card: SPRINT, controller: "user" }), attachedTo: "B" };
    c = { ...c, players: { ...c.players, user: { ...c.players.user, battlefield: [...c.players.user.battlefield, aura2] } } };
    c = settle(flushTriggers(checkEnterTriggers(c, aura2), { chooseTargets: chooseTriggerTargets }));
    expect(c.players.user.battlefield.find((p) => p.id === "B").tapped).toBe(false);
    expect(c.extraPhases || []).toEqual([]);
  });
});

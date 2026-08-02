/**
 * dealtDamageByMeDies.test.js — "Whenever a creature dealt damage by ~ this turn dies, <effect>."
 * Sengir Vampire · Sengir Bats · Vampiric Dragon · Vampiric Sliver · Predator Ooze · Blood Cultist.
 *
 * ⭐ THE MECHANISM IS A MEMORY, WHICH IS WHY THIS NEEDED ENGINE WORK RATHER THAN A PARSER RULE. The engine
 * tracked damage as a bare scalar (damageMarked), which can say HOW MUCH a creature was dealt but never BY
 * WHOM — and this family asks only the second question. So gameState now keeps a per-permanent `damagedBy`
 * list (markCombatDamage / recordDamageSource), the death constructors snapshot it onto the CR 603.6e
 * look-back, and scopeMatches gates the watcher on it. Miss any one of those three and the trigger is
 * silently unanswerable: the dead creature is gone by the time the watcher sweep runs.
 *
 * ⛔ THE TWO OVER-FIRE GUARDS BELOW ARE THE LOAD-BEARING TESTS, not the happy path. This payoff is a
 * PERMANENT +1/+1 counter, so a wrong fire does not wash out at end of turn — it compounds for the rest of
 * the game. A gate that fires on every creature death anywhere would still look completely correct on the
 * happy-path test, which is exactly the failure this file exists to prevent.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { resolveCombatDamage } from "./combatResolution.js";
import { chooseTriggerTargets, flushTriggers, resolveTopOfStack } from "./gameEngine.js";
import { _resetIdsForTests, clearCombatDamage, createGameState, createPermanent, destroyLethalCreatures, markCombatDamage } from "./gameState.js";
import { checkDiesTriggers, detectTriggers } from "./triggers.js";

beforeEach(() => _resetIdsForTests());

const SENGIR_LINE = "Whenever a creature dealt damage by this creature this turn dies, put a +1/+1 counter on this creature.";
const SENGIR = { id: "cv", name: "Sengir Vampire", type: "Creature — Vampire", mana: "{3}{B}{B}", power: 4, toughness: 4, oracle: `Flying\n${SENGIR_LINE}` };
const chump = (id, name = "Goblin") => ({ id: `c${id}`, name, type: "Creature — Goblin", power: 1, toughness: 1, oracle: "" });

/** Sengir attacking, `blockerId` blocking it. */
function combatBoard() {
  const s0 = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
  const vamp = createPermanent({ id: "v", card: SENGIR, controller: "user", summoningSick: false });
  const goblin = createPermanent({ id: "b", card: chump(1), controller: "ai1", summoningSick: false });
  return {
    ...s0, phase: "combat", step: "combat-damage", activePlayer: "user", priorityHolder: "user", turn: 5,
    combat: { attackers: [{ permanentId: "v", attackingPlayer: "user", defender: "ai1" }], blockers: [{ blockerId: "b", attackerId: "v" }] },
    players: {
      ...s0.players,
      user: { ...s0.players.user, battlefield: [vamp], life: 40 },
      ai1: { ...s0.players.ai1, battlefield: [goblin], life: 40 },
    },
  };
}
const settle = (s) => {
  let out = flushTriggers(s, { chooseTargets: chooseTriggerTargets });
  let g = 0;
  while ((out.stack || []).length && !out.pendingChoice && g++ < 20) out = resolveTopOfStack(out);
  return out;
};
const countersOn = (s, id) => (s.players.user.battlefield.find((p) => p.id === id)?.counters?.["+1/+1"]) || 0;

describe("⭐ the counter really lands — driven through real combat, not a hand-built trigger", () => {
  it("Sengir Vampire kills its blocker and grows", () => {
    const out = settle(resolveCombatDamage(combatBoard(), { firstStrikeStep: false }));
    expect(out.players.ai1.battlefield.some((p) => p.id === "b"), "the blocker should have died").toBe(false);
    expect(countersOn(out, "v")).toBe(1);
    expect((out.log || []).filter((l) => l.kind === "stack-resolve-error")).toHaveLength(0);
  });

  it("the damage record is written by combat, source and all", () => {
    // A blocker big enough to SURVIVE, so the record can be read off a live permanent rather than inferred.
    const s0 = combatBoard();
    const wall = createPermanent({ id: "b", card: { id: "cw", name: "Big Wall", type: "Creature — Wall", power: 0, toughness: 9, oracle: "" }, controller: "ai1", summoningSick: false });
    const s = resolveCombatDamage({ ...s0, players: { ...s0.players, ai1: { ...s0.players.ai1, battlefield: [wall] } } }, { firstStrikeStep: false });
    const w = s.players.ai1.battlefield.find((p) => p.id === "b");
    expect(w.damageMarked).toBe(4);
    expect(w.damagedBy).toEqual(["v"]);
  });
});

describe("⛔ THE OVER-FIRE GUARDS — a permanent counter must never be handed out on a guess", () => {
  /** A death that Sengir had nothing to do with, in the same batch shape the happy path uses. */
  function unrelatedDeath({ damagedBySengir }) {
    const s0 = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
    const vamp = createPermanent({ id: "v", card: SENGIR, controller: "user", summoningSick: false });
    const victim = createPermanent({ id: "x", card: chump(9, "Bystander"), controller: "ai1", summoningSick: false });
    let s = { ...s0, turn: 5, players: { ...s0.players, user: { ...s0.players.user, battlefield: [vamp] }, ai1: { ...s0.players.ai1, battlefield: [victim] } } };
    // 5 damage kills the 1/1 either way; only the SOURCE differs between the two cases.
    s = markCombatDamage(s, { permanentId: "x", amount: 5, sourceId: damagedBySengir ? "v" : "someone-else" });
    const r = destroyLethalCreatures(s);
    return settle(checkDiesTriggers(r.state, r.dead));
  }

  it("a creature killed by SOMETHING ELSE gives Sengir nothing", () => {
    expect(countersOn(unrelatedDeath({ damagedBySengir: false }), "v")).toBe(0);
  });

  it("POSITIVE CONTROL — the identical path with Sengir as the source DOES give a counter", () => {
    // Rides the same harness as the negative above, so a zero there cannot be explained by a harness that
    // never fires anything. One line differs between the two: the sourceId.
    expect(countersOn(unrelatedDeath({ damagedBySengir: true }), "v")).toBe(1);
  });

  it("⭐ 'THIS TURN' IS REAL — a creature damaged last turn, dying this turn, gives nothing", () => {
    // CR 514.2 removes marked damage and ends "this turn" effects together, so clearCombatDamage clears
    // damagedBy alongside damageMarked. Without that, Sengir would keep collecting counters all game off
    // every creature it ever touched.
    const s0 = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
    const vamp = createPermanent({ id: "v", card: SENGIR, controller: "user", summoningSick: false });
    const victim = createPermanent({ id: "x", card: { id: "cx", name: "Survivor", type: "Creature — Human", power: 1, toughness: 9, oracle: "" }, controller: "ai1", summoningSick: false });
    let s = { ...s0, turn: 5, players: { ...s0.players, user: { ...s0.players.user, battlefield: [vamp] }, ai1: { ...s0.players.ai1, battlefield: [victim] } } };
    s = markCombatDamage(s, { permanentId: "x", amount: 4, sourceId: "v" });      // turn 5: damaged, survives
    expect(s.players.ai1.battlefield[0].damagedBy).toEqual(["v"]);
    s = clearCombatDamage(s);                                                      // ── cleanup ──
    expect(s.players.ai1.battlefield[0].damagedBy).toEqual([]);
    s = { ...s, turn: 6 };
    s = markCombatDamage(s, { permanentId: "x", amount: 99, sourceId: "unrelated" }); // turn 6: killed by someone else
    const r = destroyLethalCreatures(s);
    expect(countersOn(settle(checkDiesTriggers(r.state, r.dead)), "v")).toBe(0);
  });
});

describe("the recognizer is exact", () => {
  const detect = (oracle) => detectTriggers({ name: "X", type: "Creature — Vampire", oracle }).filter((d) => d.requiresDamagedBySource);

  it("matches the printed line", () => {
    expect(detect(SENGIR_LINE)).toHaveLength(1);
  });

  it("⛔ does NOT match a watcher for damage dealt by something ELSE", () => {
    // Anchored on "by this creature". Anything else falls through to the reject and on to the Arbiter.
    expect(detect("Whenever a creature dealt damage by a Goblin you control this turn dies, draw a card.")).toHaveLength(0);
  });

  it("⛔ does NOT match a plain dies-watcher", () => {
    expect(detect("Whenever a creature dies, put a +1/+1 counter on this creature.")).toHaveLength(0);
  });
});

describe("classification — the six real carriers flip", () => {
  const CASES = ["Sengir Vampire", "Sengir Bats", "Vampiric Dragon", "Vampiric Sliver", "Predator Ooze", "Blood Cultist"];
  for (const name of CASES) {
    it(`${name}`, () => {
      // Built from the printed line + a body the engine already models, so this asserts the LINE stopped
      // parking the card — not that some other clause happens to be covered.
      expect(classifyCard({ name, type: "Creature — Vampire", mana: "{3}{B}{B}", power: "4", toughness: "4", oracle: `Flying\n${SENGIR_LINE}` })).toMatch(/^native/);
    });
  }

  it("⛔ CREED — an unmodeled sibling clause still parks the card", () => {
    expect(classifyCard({ name: "Fake", type: "Creature — Vampire", mana: "{3}{B}{B}", power: "4", toughness: "4", oracle: `${SENGIR_LINE}\nEach opponent glorbulates at dawn.` })).not.toMatch(/^native/);
  });
});

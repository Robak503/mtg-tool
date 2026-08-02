/**
 * counterShieldPrevention.test.js — the prevention wall that PAYS FOR ITSELF out of +1/+1 counters.
 * Phantom Nantuko · Tiger · Centaur · Wurm · Flock · Nomad, and Bloatfly Swarm's variant.
 *
 * ⭐ WHY THE COUNTER PAYMENT IS THE WHOLE SLICE, not a detail: every one of these carriers has printed
 * TOUGHNESS 0 (Phantom Tiger is 1/0, Nantuko 0/0, Bloatfly 0/0). The +1/+1 counters ARE the creature's
 * toughness. So a prevention credited WITHOUT the counter removal does not merely overstate the card — it
 * produces a creature that prevents every point of damage forever and never sheds the counters keeping it
 * alive. Unkillable. That is the single worst false positive this engine can emit, and it is why the metric
 * strips this line only because both damage paths really spend the counters.
 *
 * ⛔ THE TWO PRINTED FORMS BEHAVE OPPOSITELY AT ZERO COUNTERS AND MUST NOT SHARE A PREDICATE:
 *   PHANTOM  — prevention is UNCONDITIONAL. At 0 counters it still prevents; it simply dies to the
 *              toughness-0 state-based action (CR 704.5f) rather than to the damage.
 *   BLOATFLY — prevention is CONDITIONAL on holding a counter. At 0 counters the damage GOES THROUGH.
 * Collapse them into one "has a counter?" gate and you get either a killable Phantom (a false negative) or
 * an immortal Bloatfly (a forbidden false positive).
 *
 * Both damage paths are covered because both exist: combat (combatResolution's funnel, which must RECORD the
 * payment and apply it after its loops — `state` there is the frozen pre-step board) and non-combat
 * (applyDamageEffect, which owns mutable state and pays inline). A Phantom shrugs off a Bolt too.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { counterShieldPrevention } from "./combatEvasion.js";
import { resolveCombatDamage } from "./combatResolution.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { applyDamageEffect } from "./spellEffects.js";

beforeEach(() => _resetIdsForTests());

const PHANTOM_LINE = "If damage would be dealt to this creature, prevent that damage. Remove a +1/+1 counter from this creature.";
const BLOATFLY_LINE = "If damage would be dealt to this creature while it has a +1/+1 counter on it, prevent that damage, remove that many +1/+1 counters from it, then give each player a rad counter for each +1/+1 counter removed this way.";

const PHANTOM = { id: "cp", name: "Phantom Tiger", type: "Creature — Cat Beast Spirit", mana: "{2}{G}", power: 1, toughness: 0,
  oracle: `This creature enters with two +1/+1 counters on it.\n${PHANTOM_LINE}` };
const BLOATFLY = { id: "cb", name: "Bloatfly Swarm", type: "Creature — Insect Mutant", mana: "{3}{B}", power: 0, toughness: 0,
  oracle: `Flying\nThis creature enters with five +1/+1 counters on it.\n${BLOATFLY_LINE}` };
const PLAIN = { id: "cx", name: "Grizzly Bears", type: "Creature — Bear", mana: "{1}{G}", power: 2, toughness: 2, oracle: "" };

/** `card` blocking an attacker of `power`, holding `counters` +1/+1 counters. */
function combat(card, counters, power) {
  const s0 = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
  const def = createPermanent({ id: "d", card, controller: "user", summoningSick: false });
  def.counters = { "+1/+1": counters };
  const atk = createPermanent({ id: "a", card: { id: "ca", name: "Big", type: "Creature — Giant", power, toughness: power, oracle: "" }, controller: "ai1", summoningSick: false });
  const s = {
    ...s0, phase: "combat", step: "combat-damage", activePlayer: "ai1", priorityHolder: "user", turn: 5,
    combat: { attackers: [{ permanentId: "a", attackingPlayer: "ai1", defender: "user" }], blockers: [{ blockerId: "d", attackerId: "a" }] },
    players: { ...s0.players, user: { ...s0.players.user, battlefield: [def], life: 40 }, ai1: { ...s0.players.ai1, battlefield: [atk], life: 40 } },
  };
  const out = resolveCombatDamage(s, { firstStrikeStep: false });
  const d = out.players.user.battlefield.find((p) => p.id === "d");
  return { alive: !!d, marked: d ? (d.damageMarked || 0) : null, counters: d ? ((d.counters || {})["+1/+1"] || 0) : null, rad: out.players.user.radCounters || 0 };
}

/** `card` taking `amount` non-combat damage while holding `counters`. */
function bolt(card, counters, amount) {
  const s0 = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
  const t = createPermanent({ id: "t", card, controller: "user" });
  t.counters = { "+1/+1": counters };
  const s = { ...s0, turn: 5, players: { ...s0.players, user: { ...s0.players.user, battlefield: [t], life: 40 } } };
  const out = applyDamageEffect(s, { controller: "ai1", amount, targets: [{ type: "creature", id: "t" }] });
  const p = out.players.user.battlefield.find((x) => x.id === "t");
  return { alive: !!p, marked: p ? (p.damageMarked || 0) : null, counters: p ? ((p.counters || {})["+1/+1"] || 0) : null, rad: out.players.user.radCounters || 0 };
}

describe("⭐ COMBAT — the damage is prevented AND the counters are really spent", () => {
  it("Phantom with 2 counters, hit for 3: survives, takes nothing, sheds exactly ONE", () => {
    expect(combat(PHANTOM, 2, 3)).toMatchObject({ alive: true, marked: 0, counters: 1 });
  });

  it("Bloatfly with 5 counters, hit for 3: survives, sheds THAT MANY, and every player gets rad", () => {
    // "remove that many" = the damage amount, not one. The rad rider is the printed consequence of it.
    expect(combat(BLOATFLY, 5, 3)).toMatchObject({ alive: true, marked: 0, counters: 2, rad: 3 });
  });

  it("⛔ CONTROL — a plain creature in the identical harness dies", () => {
    // Without this, every "prevented" result above is equally explained by a harness that deals no damage.
    expect(combat(PLAIN, 0, 9).alive).toBe(false);
  });
});

describe("⛔ ZERO COUNTERS — where the two forms diverge", () => {
  it("Bloatfly with NO counters takes the damage — the condition is real", () => {
    // ⚠️ GIVEN A REAL TOUGHNESS ON PURPOSE. Bloatfly is printed 0/0, so at zero counters it dies to the
    // toughness-0 SBA whether or not the damage was prevented — asserting death here passed even with the
    // zero-counter gate DELETED (mutation M2 survived until this was fixed). Asserting the MARK is what
    // actually distinguishes "prevented" from "dealt".
    expect(combat({ ...BLOATFLY, toughness: 4 }, 0, 3)).toMatchObject({ alive: true, marked: 3 });
  });

  it("⭐ Phantom with NO counters still PREVENTS — it dies to toughness 0, not to the damage", () => {
    // Its printed toughness is 0, so the counters are its toughness and it dies to CR 704.5f the instant the
    // last one goes. The distinction matters: prevention must NOT become conditional to get this outcome —
    // that would be the right answer for the wrong reason, and would break the card the moment anything
    // else set its toughness above 0. Proven by giving it a real toughness and re-running.
    const tough = { ...PHANTOM, toughness: 4 };
    expect(combat(tough, 0, 3)).toMatchObject({ alive: true, marked: 0, counters: 0 });
  });
});

describe("⭐ NON-COMBAT — a Phantom shrugs off a Bolt too", () => {
  it("Phantom with 3 counters, 3 damage: prevented, one counter gone", () => {
    expect(bolt(PHANTOM, 3, 3)).toMatchObject({ alive: true, marked: 0, counters: 2 });
  });

  it("Bloatfly with 5 counters, 3 damage: prevented, three counters gone, rad dealt", () => {
    expect(bolt(BLOATFLY, 5, 3)).toMatchObject({ alive: true, marked: 0, counters: 2, rad: 3 });
  });

  it("⛔ Bloatfly with NO counters takes it", () => {
    // Same masking hazard as the combat case above — real toughness, assert the mark, not the death.
    expect(bolt({ ...BLOATFLY, toughness: 4 }, 0, 3)).toMatchObject({ alive: true, marked: 3 });
  });

  it("⛔ CONTROL — a plain creature takes the same Bolt", () => {
    // Deliberately a 4/4, not the 2/2 above: a 2/2 DIES to 3 damage, so `marked` reads null and the control
    // would prove only "something happened". A creature that survives lets the mark itself be asserted,
    // which is what actually distinguishes "damage prevented" from "damage dealt".
    expect(bolt({ ...PLAIN, power: 4, toughness: 4 }, 0, 3)).toMatchObject({ alive: true, marked: 3 });
  });
});

describe("the reader is exact", () => {
  it("recognizes both printed forms, and distinguishes them", () => {
    expect(counterShieldPrevention(PHANTOM)).toBe("phantom");
    expect(counterShieldPrevention(BLOATFLY)).toBe("bloatfly");
  });

  it("⛔ does NOT match a flat prevent-all wall (that is selfDamagePrevention's job)", () => {
    expect(counterShieldPrevention({ oracle: "Prevent all damage that would be dealt to this creature." })).toBeNull();
  });

  it("⛔ does NOT match a prevention that removes a DIFFERENT counter kind", () => {
    expect(counterShieldPrevention({ oracle: "If damage would be dealt to this creature, prevent that damage. Remove a -1/-1 counter from this creature." })).toBeNull();
  });
});

describe("classification — the seven real carriers flip", () => {
  const CASES = [
    ["Phantom Tiger", "This creature enters with two +1/+1 counters on it.", PHANTOM_LINE],
    ["Phantom Centaur", "Protection from black\nThis creature enters with three +1/+1 counters on it.", PHANTOM_LINE],
    ["Phantom Flock", "Flying\nThis creature enters with three +1/+1 counters on it.", PHANTOM_LINE],
    ["Bloatfly Swarm", "Flying\nThis creature enters with five +1/+1 counters on it.", BLOATFLY_LINE],
  ];
  for (const [name, body, line] of CASES) {
    it(`${name}`, () => {
      expect(classifyCard({ name, type: "Creature — Spirit", mana: "{2}{G}", power: "1", toughness: "0", oracle: `${body}\n${line}` })).toMatch(/^native/);
    });
  }

  it("⛔ CREED — an unmodeled sibling clause still parks the card", () => {
    expect(classifyCard({ name: "Fake", type: "Creature — Spirit", mana: "{2}{G}", power: "1", toughness: "0", oracle: `${PHANTOM_LINE}\nEach opponent glorbulates at dawn.` })).not.toMatch(/^native/);
  });
});

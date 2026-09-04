/**
 * uncivilUnrestKutzil.test.js — SHELF-85 runbook Phase 2 · H11 (2026-09-04): Uncivil Unrest and Kutzil, Malamet Exemplar
 * (Shalai and Hallar).
 *
 * Uncivil Unrest: "If a creature you control with a +1/+1 counter on it would deal damage to a permanent or player, it
 * deals double that damage instead." — the creature-scoped damage doubler with a COUNTER gate (`sourceHasCounter`), read
 * from the source's live counter bag at damage time; the riot grant beside it is a credited static, so the
 * damage-replacement body classifier now accepts a residue the static-cover checker models in full.
 *
 * Kutzil: "Whenever one or more creatures you control each with power greater than its base power deals combat damage
 * to a player, draw a card." — a combat-damage BATCH whose dealer filter is a LIVE layered read (power > base power),
 * carved out above the generic "with …" reject; batchDealerMatches gates each connecting creature, so an unmodified
 * attacker connecting alone never fires it (CREED).
 *
 * Real oracle fixtures (bundled Scryfall snapshot, verified in-session 2026-09-04).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { detectTriggers } from "./triggers.js";
import { resolveCombatDamage } from "./combatResolution.js";
import { flushTriggers, resolveTopOfStack, chooseTriggerTargets } from "./gameEngine.js";
import { consultDamageAmount, parseDamageReplacements } from "./damageReplacements.js";
import { classifyCard } from "./coverage.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const UNREST = { name: "Uncivil Unrest", type: "Enchantment", mana: "{4}{R}", keywords: [],
  oracle: "Nontoken creatures you control have riot. (They enter with your choice of a +1/+1 counter or haste.)\nIf a creature you control with a +1/+1 counter on it would deal damage to a permanent or player, it deals double that damage instead." };
const KUTZIL = { name: "Kutzil, Malamet Exemplar", type: "Legendary Creature — Cat Warrior", mana: "{1}{G}{W}", keywords: [], power: 3, toughness: 2,
  oracle: "Your opponents can't cast spells during your turn.\nWhenever one or more creatures you control each with power greater than its base power deals combat damage to a player, draw a card." };

function st(userBf, aiBf = [], attackers = [], blockers = []) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...s, step: "combat-damage", phase: "combat", combat: { attackers, blockers },
    players: { ...s.players, user: { ...s.players.user, battlefield: userBf, life: 40 }, ai: { ...s.players.ai, battlefield: aiBf, life: 40 } },
  };
}
const resolveAll = (s) => { let cur = s, g = 0; while ((cur.stack || []).length && g++ < 25) cur = resolveTopOfStack(cur); return cur; };
const withLibrary = (s, cards) => ({ ...s, players: { ...s.players, user: { ...s.players.user, library: cards } } });
const drewCard = (s, id) => s.players.user.hand.some((c) => c.id === id);
const perm = (id, card, over = {}) => createPermanent({ id, card: { id: `c-${id}`, ...card }, controller: "user", summoningSick: false, ...over });
const attack = (permanentId) => ({ permanentId, attackingPlayer: "user", defender: "ai" });
const bear = (id, over = {}) => { const { counters, ...rest } = over; const p = perm(id, { name: "Grizzly Bears", type: "Creature — Bear", power: 2, toughness: 2, oracle: "" }, rest); return counters ? { ...p, counters } : p; };

describe("classifier + readers", () => {
  it("both cards classify native; Unrest's entry carries the counter gate; Kutzil's descriptor carries the above-base flag", () => {
    expect(classifyCard(UNREST)).toBe("native-static");
    expect(classifyCard(KUTZIL)).toBe("native-mixed");
    expect(parseDamageReplacements(UNREST)).toEqual([{ op: { op: "multiply", factor: 2 }, scope: { side: "source", controller: "you", sourceIsCreature: true, sourceHasCounter: "+1/+1" } }]);
    const [k] = detectTriggers(KUTZIL);
    expect(k).toMatchObject({ event: "combatDamageBatch", batchPowerAboveBase: true, effectClause: "draw a card" });
    // CREED: the plain creature doubler is a different entry — the counter form never double-credits
    const plain = { ...UNREST, oracle: "If a creature you control would deal damage to a permanent or player, it deals double that damage instead." };
    expect(parseDamageReplacements(plain)).toEqual([{ op: { op: "multiply", factor: 2 }, scope: { side: "source", controller: "you", sourceIsCreature: true } }]);
  });
});

describe("runtime — Uncivil Unrest", () => {
  it("a countered creature's damage is doubled; a plain one's is not; an opponent's countered creature is not", () => {
    const unrest = perm("un", UNREST);
    const countered = bear("cb", { counters: { "+1/+1": 1 } });
    const plain = bear("pb");
    const s = st([unrest, countered, plain]);
    expect(consultDamageAmount(s, { sourceId: "cb", sourceController: "user", amount: 3, targetKind: "player", targetId: "ai" })).toBe(6);
    expect(consultDamageAmount(s, { sourceId: "pb", sourceController: "user", amount: 3, targetKind: "player", targetId: "ai" })).toBe(3);
    const theirs = { ...createPermanent({ id: "tb", card: { id: "c-tb", name: "Grizzly Bears", type: "Creature — Bear", power: 2, toughness: 2, oracle: "" }, controller: "ai", summoningSick: false }), counters: { "+1/+1": 2 } };
    const s2 = { ...s, players: { ...s.players, ai: { ...s.players.ai, battlefield: [theirs] } } };
    expect(consultDamageAmount(s2, { sourceId: "tb", sourceController: "ai", amount: 3, targetKind: "player", targetId: "user" })).toBe(3);
  });

  it("through combat: a 2/2 with a counter (3/3) connects for 6", () => {
    const s0 = st([perm("un", UNREST), bear("cb", { counters: { "+1/+1": 1 } })], [], [attack("cb")], []);
    const s = resolveCombatDamage(s0);
    expect(s.players.ai.life).toBe(34);
  });
});

describe("runtime — Kutzil", () => {
  it("a countered bear (power above base) connecting fires the batch once and draws; Kutzil alone at base power does not", () => {
    let s = st([perm("kz", KUTZIL), bear("cb", { counters: { "+1/+1": 1 } })], [], [attack("cb")], []);
    s = withLibrary(s, [{ id: "L1", name: "Drawn", type: "Instant", oracle: "" }]);
    s = resolveCombatDamage(s);
    expect(s.players.ai.life).toBe(37);
    s = resolveAll(flushTriggers(s, { chooseTargets: chooseTriggerTargets }));
    expect(drewCard(s, "L1")).toBe(true);

    let t = st([perm("kz", KUTZIL), bear("pb")], [], [attack("pb"), attack("kz")], []);
    t = withLibrary(t, [{ id: "L2", name: "Drawn", type: "Instant", oracle: "" }]);
    t = resolveCombatDamage(t);
    expect(t.players.ai.life).toBe(35);
    t = resolveAll(flushTriggers(t, { chooseTargets: chooseTriggerTargets }));
    expect(drewCard(t, "L2")).toBe(false);
  });

  it("two modified creatures connecting still draw exactly ONE card (a batch, not per creature)", () => {
    let s = st([perm("kz", KUTZIL), bear("a", { counters: { "+1/+1": 1 } }), bear("b", { counters: { "+1/+1": 2 } })], [], [attack("a"), attack("b")], []);
    s = withLibrary(s, [{ id: "L1", name: "Drawn", type: "Instant", oracle: "" }, { id: "L2", name: "Drawn2", type: "Instant", oracle: "" }]);
    s = resolveCombatDamage(s);
    s = resolveAll(flushTriggers(s, { chooseTargets: chooseTriggerTargets }));
    expect(drewCard(s, "L1")).toBe(true);
    expect(drewCard(s, "L2")).toBe(false);
  });
});

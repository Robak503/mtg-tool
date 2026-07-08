/**
 * dealtDamageWatcher.test.js — the CONTROLLER-SCOPE dealt-damage trigger (CR 603.2), the non-self sibling of
 * enrage: "Whenever a creature you control is dealt damage, <effect>" (Rite of Passage — "…put a +1/+1 counter
 * on it"). UNLIKE enrage (scope:self, the damaged creature IS the source), the WATCHER is a different permanent,
 * so checkDealtDamageTriggers scans the damaged creature's controller's trigger sources and fires each
 * creatureYouControl-scoped watcher with triggeringPermanent = the damaged creature (mirrors checkAttackTriggers'
 * per-attacker watcher scan). The effect's "it" → the triggering (damaged) creature via the ETB_ENTERING_PRONOUN
 * rewrite arm (extended to dealtDamage). Flips Rite of Passage native (+1); a complex-effect sibling (Jennifer
 * Walters) stays body-only, a safe FN.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { classifyCard } from "./coverage.js";
import { createGameState, createPermanent, _resetIdsForTests, findPermanent } from "./gameState.js";
import { checkDealtDamageTriggers } from "./triggers.js";
import { flushTriggers, resolveTopOfStack, chooseTriggerTargets } from "./gameEngine.js";

beforeEach(() => _resetIdsForTests());

const RITE = { id: "c-rite", name: "Rite of Passage", type: "Enchantment", mana: "{2}{G}", oracle: "Whenever a creature you control is dealt damage, put a +1/+1 counter on it." };
const cr = (id, p, t, ctrl) => createPermanent({ id, card: { id: `c-${id}`, name: id, type: "Creature — Test", power: p, toughness: t }, controller: ctrl, summoningSick: false });
const cnt = (s, id) => findPermanent(s, id)?.permanent?.counters?.["+1/+1"] || 0;
function resolveAll(s) { s = flushTriggers(s, { chooseTargets: chooseTriggerTargets }); let g = 0; while ((s.stack || []).length && g++ < 20) s = resolveTopOfStack(s); return s; }
function bf(perms, aiPerms = []) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return { ...s, turn: 5, phase: "combat-damage", step: "combat-damage", activePlayer: "user", priorityHolder: "user",
    players: { ...s.players, user: { ...s.players.user, battlefield: perms }, ai: { ...s.players.ai, battlefield: aiPerms } } };
}

describe("controller-scope dealt-damage — classification", () => {
  it("Rite of Passage flips native; a complex-effect sibling stays body-only (CREED FN)", () => {
    expect(classifyCard({ name: "Rite of Passage", type: "Enchantment", mana: "{2}{G}", oracle: RITE.oracle })).toBe("native-trigger");
    // an unmodeled payoff on the same trigger scope must NOT be credited
    expect(classifyCard({ name: "T", type: "Enchantment", mana: "{2}{G}", oracle: "Whenever a creature you control is dealt damage, you may draw a card equal to the number of face-down permanents an opponent controls." })).not.toMatch(/^native/);
  });
});

describe("controller-scope dealt-damage — runtime firing", () => {
  it("a creature you control being dealt damage puts one +1/+1 counter on IT", () => {
    let s = bf([createPermanent({ id: "rite", card: RITE, controller: "user" }), cr("bear", 3, 3, "user")]);
    s = resolveAll(checkDealtDamageTriggers(s, [{ creatureId: "bear", amount: 2 }]));
    expect(cnt(s, "bear")).toBe(1);
  });
  it("CREED: an OPPONENT's creature being dealt damage does NOT fire your watcher (controller-gated)", () => {
    let s = bf([createPermanent({ id: "rite", card: RITE, controller: "user" })], [cr("foe", 3, 3, "ai")]);
    s = resolveAll(checkDealtDamageTriggers(s, [{ creatureId: "foe", amount: 2 }]));
    expect(cnt(s, "foe")).toBe(0);
  });
  it("two of your creatures damaged in one event each get exactly one counter (no double, no cross)", () => {
    let s = bf([createPermanent({ id: "rite", card: RITE, controller: "user" }), cr("bear", 3, 3, "user"), cr("wolf", 2, 2, "user")]);
    s = resolveAll(checkDealtDamageTriggers(s, [{ creatureId: "bear", amount: 1 }, { creatureId: "wolf", amount: 1 }]));
    expect(cnt(s, "bear")).toBe(1);
    expect(cnt(s, "wolf")).toBe(1);
  });
  it("two Rite of Passage watchers both fire → two counters on the damaged creature", () => {
    let s = bf([createPermanent({ id: "rite", card: RITE, controller: "user" }), createPermanent({ id: "rite2", card: { ...RITE, id: "c-rite2" }, controller: "user" }), cr("bear", 3, 3, "user")]);
    s = resolveAll(checkDealtDamageTriggers(s, [{ creatureId: "bear", amount: 2 }]));
    expect(cnt(s, "bear")).toBe(2);
  });
});

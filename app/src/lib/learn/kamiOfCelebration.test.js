/**
 * kamiOfCelebration.test.js — SHELF-85 runbook Phase 2 · H13 (2026-09-04): Kami of Celebration (Shalai and Hallar).
 *
 * Two small arms on existing seams:
 *  · "Whenever a MODIFIED creature you control attacks" — the attack twin of Kodama's combat-damage predicate; the same
 *    requiresModified gate (scopeMatches → layers.isModifiedPermanent, a live read), listed in the descriptor assembly.
 *  · "Whenever you cast a spell from exile" — any spell, the Rivaz castFromZoneOnly gate on the cast's threaded source
 *    zone: a hand cast never fires it, and an UNTHREADED cast (no zone) under-fires rather than over-fires (CREED).
 *
 * Real oracle fixture (bundled Scryfall snapshot, verified in-session 2026-09-04).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { detectTriggers, checkAttackTriggers, checkCastTriggers } from "./triggers.js";
import { flushTriggers, resolveTopOfStack, chooseTriggerTargets } from "./gameEngine.js";
import { classifyCard } from "./coverage.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const KAMI = { id: "c-kami", name: "Kami of Celebration", type: "Creature — Spirit", mana: "{4}{R}", keywords: [], power: 3, toughness: 3,
  oracle: "Whenever a modified creature you control attacks, exile the top card of your library. You may play that card this turn. (Equipment, Auras you control, and counters are modifications.)\nWhenever you cast a spell from exile, put a +1/+1 counter on target creature you control." };
const BEARS = { id: "c-bears", name: "Grizzly Bears", type: "Creature — Bear", mana: "{1}{G}", oracle: "", power: 2, toughness: 2 };
const SHOCK = { id: "c-shock", name: "Shock", type: "Instant", mana: "{R}", oracle: "Shock deals 2 damage to any target." };
const forestCard = (id) => ({ id, name: "Forest", type: "Basic Land — Forest", oracle: "({T}: Add {G}.)" });

const base = () => {
  let s = createGameState({ userDeck: [forestCard("f1"), forestCard("f2"), forestCard("f3")], aiDeck: [] });
  return { ...s, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0, turn: 6 };
};
const settle = (s) => { let g = 0; while (s.stack.length && !s.pendingChoice && g++ < 20) s = resolveTopOfStack(s); return s; };
const withPerms = (s, perms) => ({ ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [...s.players.user.battlefield, ...perms] } } });
const counters = (s, id) => s.players.user.battlefield.find((p) => p.id === id)?.counters?.["+1/+1"] || 0;
const impulsed = (s) => (s.players.user.exile || []).filter((c) => c._impulse).length;
const attackWith = (s, id) => settle(flushTriggers(checkAttackTriggers({ ...s, phase: "combat", step: "declare-attackers", combat: { attackers: [{ permanentId: id, attackingPlayer: "user", defender: "ai" }] } }), { chooseTargets: chooseTriggerTargets }));

describe("classifier + descriptors", () => {
  it("Kami classifies native; the attack watcher carries requiresModified, the cast watcher castFromZoneOnly: exile", () => {
    expect(classifyCard({ name: KAMI.name, type: KAMI.type, oracle: KAMI.oracle, mana: KAMI.mana, keywords: [] })).toBe("native-trigger");
    const ds = detectTriggers(KAMI);
    expect(ds).toHaveLength(2);
    expect(ds[0]).toMatchObject({ event: "attacks", scope: "creatureYouControl", requiresModified: true });
    expect(ds[1]).toMatchObject({ event: "cast", scope: "castWatcher", castFromZoneOnly: "exile" });
  });
});

describe("runtime — the modified-attacker impulse", () => {
  it("a bear with a +1/+1 counter attacking exiles the top card face-up for the turn; a plain bear attacking exiles nothing", () => {
    let s = withPerms(base(), [createPermanent({ id: "K", card: KAMI, controller: "user" }), { ...createPermanent({ id: "MB", card: BEARS, controller: "user" }), counters: { "+1/+1": 1 } }]);
    s = attackWith(s, "MB");
    expect(impulsed(s)).toBe(1);
    expect(s.players.user.library).toHaveLength(2);
    let t = withPerms(base(), [createPermanent({ id: "K", card: KAMI, controller: "user" }), createPermanent({ id: "PB", card: { ...BEARS, id: "c-pb" }, controller: "user" })]);
    t = attackWith(t, "PB");
    expect(impulsed(t)).toBe(0);
    expect(t.players.user.library).toHaveLength(3);
  });
});

describe("runtime — the cast-from-exile counter", () => {
  it("a spell cast from exile puts a counter on a creature you control; the same spell from hand does not; an unthreaded cast does not", () => {
    const perms = () => [createPermanent({ id: "K", card: KAMI, controller: "user" }), createPermanent({ id: "B", card: BEARS, controller: "user" })];
    let s = withPerms(base(), perms());
    s = settle(flushTriggers(checkCastTriggers(s, { spellCard: SHOCK, casterId: "user", castFromZone: "exile" }), { chooseTargets: chooseTriggerTargets }));
    expect(counters(s, "K") + counters(s, "B")).toBe(1);
    let h = withPerms(base(), perms());
    h = settle(flushTriggers(checkCastTriggers(h, { spellCard: SHOCK, casterId: "user", castFromZone: "hand" }), { chooseTargets: chooseTriggerTargets }));
    expect(counters(h, "K") + counters(h, "B")).toBe(0);
    let u = withPerms(base(), perms());
    u = settle(flushTriggers(checkCastTriggers(u, { spellCard: SHOCK, casterId: "user" }), { chooseTargets: chooseTriggerTargets }));
    expect(counters(u, "K") + counters(u, "B")).toBe(0);
  });
});

/**
 * capReaverCleaver.test.js — the PLAYER-OR-PLANESWALKER combat-damage union (SHELF CAP5 —
 * The Reaver Cleaver's granted "Whenever this creature deals combat damage to a player or
 * planeswalker, create that many Treasure tokens").
 *
 * The union rides the SAME combatDamageToPlayer event with the alsoPlaneswalker marker:
 *   · the PLAYER half fires through every existing path unchanged (triggersForEvent merges the
 *     equipment's granted descriptor onto the host);
 *   · the PLANESWALKER half is a new dealer-side pass in checkCombatDamageTriggers over
 *     combatResolution's combat-damage-planeswalker events (CR 120.3c — loyalty damage carries an
 *     amount), gated to descriptorFilter alsoPlaneswalker so a bare to-a-player watcher can NEVER
 *     fire off pw damage (the over-fire the gate forbids).
 * The payoff is the existing Old Gnawbone atom: "create that many Treasure tokens" reads
 * ctx.combatDamageAmount — now threaded by both halves.
 * CREED FP = a bare player watcher firing on pw damage, a fabricated count, or a non-self union
 * subject detecting.
 *
 * Real oracle fixtures (bundled Scryfall snapshot, pulled 2026-08-30 — never from memory).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { classifyCard } from "./coverage.js";
import { detectTriggers, checkCombatDamageTriggers, parseGrantedTriggeredAbilities } from "./triggers.js";
import { triggerRoutesNatively } from "./triggerRouting.js";
import { flushTriggers, resolveTopOfStack } from "./gameEngine.js";
import { createGameState, _resetIdsForTests } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const CLEAVER = { id: "c-rc", name: "The Reaver Cleaver", type: "Legendary Artifact — Equipment", mana: "{2}{R}",
  oracle: "Equipped creature gets +1/+1 and has trample and \"Whenever this creature deals combat damage to a player or planeswalker, create that many Treasure tokens.\"\nEquip {3}" };
// A synthetic PRINTED union carrier for the bare detection pins (self-subject form).
const PRINTED = { id: "c-pu", name: "Union Reaver", type: "Creature — Ogre Warrior", mana: "{3}{R}",
  power: 4, toughness: 3, oracle: "Whenever this creature deals combat damage to a player or planeswalker, create that many Treasure tokens." };
// A bare TO-PLAYER watcher (Old Gnawbone's granted shape, self form) — must NOT fire on pw damage.
const PLAYER_ONLY = { id: "c-po", name: "Gnaw Drake", type: "Creature — Drake", mana: "{2}{G}",
  power: 2, toughness: 2, oracle: "Whenever this creature deals combat damage to a player, create that many Treasure tokens." };

const perm = (card, id, controller = "user", over = {}) => ({ id, card, controller, tapped: false, summoningSick: false, counters: {}, damageMarked: 0, attachments: [], attachedTo: null, ...over });

function boardWith(attackerCard, { equipCleaver = false } = {}) {
  const b = createGameState({ userDeck: [], aiDeck: [] });
  const attacker = perm(attackerCard, "atk", "user", equipCleaver ? { attachments: ["rc"] } : {});
  const mine = [attacker, ...(equipCleaver ? [perm(CLEAVER, "rc", "user", { attachedTo: "atk" })] : [])];
  return { ...b, players: { ...b.players, user: { ...b.players.user, battlefield: mine } } };
}
function resolveAll(state) {
  let s = flushTriggers(state, {});
  let guard = 0;
  while ((s.stack || []).length && guard++ < 30) s = resolveTopOfStack(s);
  return s;
}
const treasures = (s) => (s.players.user.battlefield || []).filter((p) => p.card?.token && /Treasure/i.test(String(p.card.name || ""))).length;

describe("detection + classify", () => {
  it("⭐ the union detects as combatDamageToPlayer + alsoPlaneswalker, routes natively; both carriers flip", () => {
    const [t] = detectTriggers(PRINTED);
    expect(t).toMatchObject({ event: "combatDamageToPlayer", scope: "self", alsoPlaneswalker: true });
    expect(t.effectClause).toBe("create that many Treasure tokens");
    expect(triggerRoutesNatively(t, PRINTED)).toBe(true);
    expect(classifyCard(PRINTED)).toBe("native-trigger");
    expect(classifyCard(CLEAVER)).toMatch(/^native/);
    const granted = parseGrantedTriggeredAbilities(CLEAVER).find((d) => d.event === "combatDamageToPlayer");
    expect(granted).toMatchObject({ alsoPlaneswalker: true });
  });

  it("⛔ the bare to-player form does NOT get the union marker; 'or battle' stays parked", () => {
    const [po] = detectTriggers(PLAYER_ONLY);
    expect(po.alsoPlaneswalker).toBeUndefined();
    expect(classifyCard({ ...PRINTED, id: "c-b", name: "Beat Stick",
      oracle: "Whenever this creature deals combat damage to a player, planeswalker, or battle, create that many Treasure tokens." })).toBe("body-only");
  });
});

describe("⭐ LAW 6 — both halves fire with the real damage amount", () => {
  it("PLAYER half: the Cleaver-equipped attacker connects for its damage → that many Treasures", () => {
    const s = boardWith({ name: "Bear Brute", type: "Creature — Bear", power: 5, toughness: 5, oracle: "" }, { equipCleaver: true });
    const fired = checkCombatDamageTriggers(s, [{ kind: "combat-damage-player", attackerId: "atk", attackingPlayer: "user", defender: "ai", amount: 6 }]);
    expect((fired.pendingTriggers || []).length).toBe(1);
    expect(treasures(resolveAll(fired))).toBe(6);
  });

  it("⭐ PLANESWALKER half: the same grant fires off combat-damage-planeswalker with the loyalty amount", () => {
    const s = boardWith({ name: "Bear Brute", type: "Creature — Bear", power: 5, toughness: 5, oracle: "" }, { equipCleaver: true });
    const fired = checkCombatDamageTriggers(s, [{ kind: "combat-damage-planeswalker", attackerId: "atk", attackingPlayer: "user", planeswalkerId: "pw1", amount: 4 }]);
    expect((fired.pendingTriggers || []).length).toBe(1);
    expect(treasures(resolveAll(fired))).toBe(4);
  });

  it("⛔ FP guard — a BARE to-player trigger never fires off planeswalker damage", () => {
    const s = boardWith(PLAYER_ONLY);
    const fired = checkCombatDamageTriggers(s, [{ kind: "combat-damage-planeswalker", attackerId: "atk", attackingPlayer: "user", planeswalkerId: "pw1", amount: 4 }]);
    expect((fired.pendingTriggers || []).length).toBe(0);
  });

  it("the printed union carrier fires on its own player damage too (no equipment involved)", () => {
    const s = boardWith(PRINTED);
    const fired = checkCombatDamageTriggers(s, [{ kind: "combat-damage-player", attackerId: "atk", attackingPlayer: "user", defender: "ai", amount: 4 }]);
    expect((fired.pendingTriggers || []).length).toBe(1);
    expect(treasures(resolveAll(fired))).toBe(4);
  });
});

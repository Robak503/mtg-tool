/**
 * CDMG-MASS-TO-DAMAGED-PLAYER (Balefire Dragon, CR 510 + 119) — "Whenever this creature deals combat damage
 * to a player, it deals that much damage to each creature that player controls." The combat-damage trigger
 * fires (combatDamageToPlayer / self) and its effect deals the SAME amount (ctx.combatDamageAmount) to each
 * creature the just-damaged player (ctx.damagedPlayerId) controls — a one-sided board sweep scaled to the hit.
 * Engine-first: the trigger must actually fire + mark that damage on the right creatures, or the card is an FP.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { detectTriggers } from "./triggers.js";
import { resolveCombatDamage } from "./combatResolution.js";
import { flushTriggers, resolveTopOfStack, chooseTriggerTargets } from "./gameEngine.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const BALEFIRE_ORACLE = "Flying\nWhenever this creature deals combat damage to a player, it deals that much damage to each creature that player controls.";

const balefire = (id, power = 6) =>
  createPermanent({ id, card: { id: `c-${id}`, name: "Balefire Dragon", type: "Creature — Dragon", power, toughness: 6, oracle: BALEFIRE_ORACLE }, controller: "user", summoningSick: false });
const creat = (id, controller, p = 2, t = 2, extra = {}) =>
  createPermanent({ id, card: { id: `c-${id}`, name: id, type: "Creature — Beast", power: p, toughness: t, oracle: "" }, controller, summoningSick: false, ...extra });

function st(userBf, aiBf = [], attackers = [], blockers = []) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...s, step: "combat-damage", phase: "combat", combat: { attackers, blockers },
    players: { ...s.players, user: { ...s.players.user, battlefield: userBf, life: 40 }, ai: { ...s.players.ai, battlefield: aiBf, life: 40 } },
  };
}
function resolveAll(s) { let st = s, g = 0; while ((st.stack || []).length && g++ < 25) st = resolveTopOfStack(st); return st; }
const dmgOf = (s, pid, permId) => (s.players[pid].battlefield.find((pm) => pm.id === permId)?.damageMarked) || 0;

describe("Balefire Dragon — detection + classification", () => {
  it("the combat-damage trigger is detected (self scope)", () => {
    const d = detectTriggers({ name: "Balefire Dragon", type: "Creature — Dragon", oracle: BALEFIRE_ORACLE })
      .filter((t) => t.event === "combatDamageToPlayer");
    expect(d[0]).toMatchObject({ event: "combatDamageToPlayer", scope: "self" });
  });
  it("Balefire Dragon classifies native-trigger (Flying + the modeled combat-damage sweep, no residue)", () => {
    expect(classifyCard({ name: "Balefire Dragon", type: "Creature — Dragon", mana: "{5}{R}{R}", power: "6", toughness: "6", oracle: BALEFIRE_ORACLE })).toBe("native-trigger");
  });
});

describe("Balefire Dragon — engine-first: the sweep fires + scales to the combat damage", () => {
  it("an unblocked 6-power Balefire deals 6 to each creature the damaged player controls", () => {
    const dragon = balefire("bf");
    const oppA = creat("oppA", "ai", 3, 7); // survives 6
    const oppB = creat("oppB", "ai", 1, 4); // dies to 6
    let s = st([dragon], [oppA, oppB], [{ permanentId: "bf", attackingPlayer: "user", defender: "ai" }], []);
    s = resolveCombatDamage(s);
    expect(s.players.ai.life).toBe(34);                       // 6 combat damage landed on the player
    s = resolveAll(flushTriggers(s, { chooseTargets: chooseTriggerTargets }));
    // Each of the damaged player's creatures took 6 (oppB is dead → gone from the battlefield after the SBA)
    expect(dmgOf(s, "ai", "oppA")).toBe(6);
    expect(s.players.ai.battlefield.some((pm) => pm.id === "oppB")).toBe(false); // 6 >= 4 toughness → destroyed
  });

  it("the amount SCALES with the attacker's power (a 3-power Balefire deals 3, not 6)", () => {
    const dragon = balefire("bf3", 3);
    const oppA = creat("oppA", "ai", 3, 7);
    let s = st([dragon], [oppA], [{ permanentId: "bf3", attackingPlayer: "user", defender: "ai" }], []);
    s = resolveCombatDamage(s);
    expect(s.players.ai.life).toBe(37);                       // 3 combat damage
    s = resolveAll(flushTriggers(s, { chooseTargets: chooseTriggerTargets }));
    expect(dmgOf(s, "ai", "oppA")).toBe(3);                   // "that much" = 3, not the printed 6
  });

  it("CREED anti-FP: the sweep hits ONLY the damaged player's creatures — the controller's own are untouched", () => {
    const dragon = balefire("bf2");
    const myOther = creat("mine", "user", 2, 2); // controller's own creature — must NOT be swept
    const opp = creat("opp", "ai", 2, 7);
    let s = st([dragon, myOther], [opp], [{ permanentId: "bf2", attackingPlayer: "user", defender: "ai" }], []);
    s = resolveCombatDamage(s);
    s = resolveAll(flushTriggers(s, { chooseTargets: chooseTriggerTargets }));
    expect(dmgOf(s, "ai", "opp")).toBe(6);                    // the damaged player's creature took 6
    expect(dmgOf(s, "user", "mine")).toBe(0);                 // the attacker's own creature is untouched
  });

  it("CREED anti-FP: a BLOCKED Balefire (no player damage) does NOT sweep", () => {
    const dragon = balefire("bf4");
    const wall = createPermanent({ id: "w", card: { id: "cw", name: "Wall", type: "Creature — Wall", power: 0, toughness: 9, oracle: "" }, controller: "ai", summoningSick: false });
    const opp = creat("opp2", "ai", 2, 7);
    let s = st([dragon], [wall, opp], [{ permanentId: "bf4", attackingPlayer: "user", defender: "ai" }], [{ blockerId: "w", blockingPlayer: "ai", attackerId: "bf4" }]);
    s = resolveCombatDamage(s);
    expect(s.players.ai.life).toBe(40);                       // blocked → no player damage
    s = resolveAll(flushTriggers(s, { chooseTargets: chooseTriggerTargets }));
    expect(dmgOf(s, "ai", "opp2")).toBe(0);                   // no player damage → no sweep
  });
});

/**
 * raidBombardment.test.js — "Whenever a creature you control with power 2 or less attacks, this enchantment deals 1 damage to the
 * player or planeswalker that creature is attacking." (Raid Bombardment; Cavalcade of Calamity at power 1 or less — the 09-06
 * plan's stage ③, census row ㉕'s own cards, 2026-09-30).
 *
 * ③ · 25 built the payoff (the attacked-defender damage). This is the subject: the attack twin of Welcoming Vampire's
 * etbMaxPower, `attackMaxPower`, gated in scopeMatches off the attacker's CURRENT power at declaration (layers.permanentPower) —
 * a pumped creature stops qualifying and a shrunk one starts, where the enters gate reads the printed card. The payoff reads
 * "that creature is attacking": the triggering attacker's declared defender, from the same per-attacker context.
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-09-30); each through checkAttackTriggers → the stack.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { flushTriggers, resolveTopOfStack } from "./gameEngine.js";
import { checkAttackTriggers, detectTriggers } from "./triggers.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const RAID = { id: "c-raid", name: "Raid Bombardment", type: "Enchantment", mana: "{2}{R}",
  oracle: "Whenever a creature you control with power 2 or less attacks, this enchantment deals 1 damage to the player or planeswalker that creature is attacking." };
const CAVALCADE = { id: "c-cav", name: "Cavalcade of Calamity", type: "Enchantment", mana: "{1}{R}",
  oracle: "Whenever a creature you control with power 1 or less attacks, this enchantment deals 1 damage to the player or planeswalker that creature is attacking." };
const JACE = { id: "c-jace", name: "Jace Beleren", type: "Legendary Planeswalker — Jace", mana: "{1}{U}{U}", loyalty: "3",
  oracle: "+2: Each player draws a card.\n−1: Target player draws a card.\n−10: Target player mills twenty cards." };
const body = (name, p, t) => ({ name, type: "Creature — Soldier", mana: "{1}", power: String(p), toughness: String(t), oracle: "" });

const perm = (card, id, controller, counters = {}) => ({ ...createPermanent({ id, card: { ...card, id: `c-${id}` }, controller, summoningSick: false }), counters });
// `attacker` attacks the other seat with `bodies` ([id, card, counters?, "jace"?]); `watchers` sit on the USER's battlefield.
function combat(watchers, bodies, attacker = "user") {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  const defender = attacker === "user" ? "ai" : "user";
  const atk = bodies.map(([id, card, counters]) => perm(card, id, attacker, counters || {}));
  const jace = { ...createPermanent({ id: "jace", card: JACE, controller: defender, summoningSick: false }), counters: { loyalty: 3 } };
  const own = watchers.map((w, i) => perm(w, `w${i}`, "user"));
  return { ...s, turn: 4, phase: "combat", step: "declare-attackers", activePlayer: attacker, priorityHolder: attacker, stack: [], pendingTriggers: [],
    combat: { attackers: bodies.map(([id, , , at]) => ({ permanentId: id, attackingPlayer: attacker, defender, ...(at === "jace" ? { defenderPlaneswalkerId: "jace" } : {}) })), blockers: [] },
    players: { ...s.players,
      user: { ...s.players.user, battlefield: attacker === "user" ? [...own, ...atk] : own },
      ai: { ...s.players.ai, battlefield: attacker === "user" ? [jace] : [...atk] } } };
}
const drain = (s0) => { let s = flushTriggers(s0), g = 0; while ((s.stack || []).length && g++ < 12) s = resolveTopOfStack(s); return s; };
const lifeLost = (s0, s, pid = "ai") => s0.players[pid].life - s.players[pid].life;

describe("parse + classification", () => {
  it("the subject carries the power cap and both enchantments flip native", () => {
    expect(detectTriggers(RAID).map((d) => ({ event: d.event, scope: d.scope, attackMaxPower: d.attackMaxPower })))
      .toEqual([{ event: "attacks", scope: "creatureYouControl", attackMaxPower: 2 }]);
    expect([classifyCard(RAID), classifyCard(CAVALCADE)]).toEqual(["native-trigger", "native-trigger"]);
  });
});

describe("RUNTIME — only the small attackers trigger it, and the damage goes where each is attacking", () => {
  it("VACUITY CONTROL — a 3/3 attacks alone under Raid Bombardment: nothing", () => {
    const s0 = combat([RAID], [["big", body("Big", 3, 3)]]);
    expect(lifeLost(s0, drain(checkAttackTriggers(s0)))).toBe(0);
  });

  it("⭐ two 2/2s and a 3/3 attack: two triggers, two damage — the 3/3 doesn't count", () => {
    const s0 = combat([RAID], [["a", body("Small A", 2, 2)], ["b", body("Small B", 2, 2)], ["big", body("Big", 3, 3)]]);
    const out = { aiLifeLost: lifeLost(s0, drain(checkAttackTriggers(s0))) };
    expect(out).toEqual({ aiLifeLost: 2 });
    console.log(`WITNESS raidTwoOfThree ${JSON.stringify(out)}`);
  });

  it("⭐ the CURRENT power at declaration: a 2/2 with a +1/+1 counter doesn't trigger; a 3/3 with a -1/-1 counter does", () => {
    const pumped = combat([RAID], [["p", body("Pumped", 2, 2), { "+1/+1": 1 }]]);
    expect(lifeLost(pumped, drain(checkAttackTriggers(pumped)))).toBe(0);
    const shrunk = combat([RAID], [["s", body("Shrunk", 3, 3), { "-1/-1": 1 }]]);
    expect(lifeLost(shrunk, drain(checkAttackTriggers(shrunk)))).toBe(1);
  });

  it("⭐ Cavalcade of Calamity is the power-1 version: a 1/1 triggers it, a 2/2 doesn't", () => {
    const s0 = combat([CAVALCADE], [["one", body("One", 1, 1)], ["two", body("Two", 2, 2)]]);
    expect(lifeLost(s0, drain(checkAttackTriggers(s0)))).toBe(1);
  });

  it("⭐ \"that creature is attacking\": a 2/2 attacking Jace Beleren takes a loyalty counter off Jace, not the AI's life", () => {
    const s0 = combat([RAID], [["a", body("Small A", 2, 2), {}, "jace"]]);
    const s = drain(checkAttackTriggers(s0));
    expect({ aiLifeLost: lifeLost(s0, s), jace: s.players.ai.battlefield.find((p) => p.id === "jace")?.counters?.loyalty }).toEqual({ aiLifeLost: 0, jace: 2 });
  });

  it("the AI's small attackers don't trigger the user's Raid Bombardment (\"a creature YOU control\")", () => {
    const s0 = combat([RAID], [["x", body("Their Small", 1, 1)]], "ai");
    expect(lifeLost(s0, drain(checkAttackTriggers(s0)), "user")).toBe(0);
  });
});

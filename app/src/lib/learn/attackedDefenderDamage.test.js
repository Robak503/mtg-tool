/**
 * attackedDefenderDamage.test.js — "… deals 1 damage to the player or planeswalker it's attacking." (Hellrider, Scorch Spitter,
 * Rakdos Roustabout — the 09-06 plan's stage ③, census row ㉕, 2026-09-30).
 *
 * The defending-player damage arm's twin that also reaches a PLANESWALKER: the attacker's declared defender, threaded per
 * attacker as ctx.defenderId plus ctx.defenderPlaneswalkerId when the attack is on a planeswalker. checkBlockTriggers threaded
 * only the player for becomes-blocked / attacks-unblocked, so a blocked Rakdos Roustabout attacking a planeswalker would have
 * hit its controller instead — both contexts carry the planeswalker marker now. who:"defendingPlayer" keeps the atom on the
 * DEFENDING_PLAYER_EVENTS routing gate.
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-09-30); each through checkAttackTriggers / checkBlockTriggers → the stack.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { flushTriggers, resolveTopOfStack } from "./gameEngine.js";
import { checkAttackTriggers, checkBlockTriggers } from "./triggers.js";
import { parseEffectClause } from "./effects/parser.js";
import { combatDamageReferentSatisfied } from "./triggerRouting.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const HELLRIDER = { id: "c-hr", name: "Hellrider", type: "Creature — Devil", mana: "{2}{R}{R}", power: "3", toughness: "3", keywords: ["Haste"],
  oracle: "Haste\nWhenever a creature you control attacks, this creature deals 1 damage to the player or planeswalker it's attacking." };
const SPITTER = { id: "c-ss", name: "Scorch Spitter", type: "Creature — Elemental Lizard", mana: "{R}", power: "1", toughness: "1", keywords: [],
  oracle: "Whenever this creature attacks, it deals 1 damage to the player or planeswalker it's attacking." };
const ROUSTABOUT = { id: "c-rr", name: "Rakdos Roustabout", type: "Creature — Ogre Warrior", mana: "{1}{B}{R}", power: "3", toughness: "2", keywords: [],
  oracle: "Whenever this creature becomes blocked, it deals 1 damage to the player or planeswalker it's attacking." };
const JACE = { id: "c-jace", name: "Jace Beleren", type: "Legendary Planeswalker — Jace", mana: "{1}{U}{U}", loyalty: "3",
  oracle: "+2: Each player draws a card.\n−1: Target player draws a card.\n−10: Target player mills twenty cards." };
const BEARS = { name: "Grizzly Bears", type: "Creature — Bear", mana: "{1}{G}", power: "2", toughness: "2", oracle: "" };

const mine = (card, id) => createPermanent({ id, card: { ...card, id: `c-${id}` }, controller: "user", summoningSick: false });
// The user attacks: `attackers` lists [permanentId, "player" | "jace"]; the AI holds Jace Beleren (loyalty 3) and a blocker.
function combat(userPerms, attackers, blockers = []) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  const jace = { ...createPermanent({ id: "jace", card: JACE, controller: "ai", summoningSick: false }), counters: { loyalty: 3 } };
  const wall = createPermanent({ id: "wall", card: { ...BEARS, id: "c-wall" }, controller: "ai", summoningSick: false });
  return { ...s, turn: 4, phase: "combat", step: "declare-attackers", activePlayer: "user", priorityHolder: "user", stack: [], pendingTriggers: [],
    combat: { attackers: attackers.map(([id, at]) => ({ permanentId: id, attackingPlayer: "user", defender: "ai", ...(at === "jace" ? { defenderPlaneswalkerId: "jace" } : {}) })),
      blockers: blockers.map((attackerId) => ({ blockerId: "wall", attackerId })) },
    players: { ...s.players, user: { ...s.players.user, battlefield: userPerms }, ai: { ...s.players.ai, battlefield: [jace, wall] } } };
}
const drain = (s0) => { let s = flushTriggers(s0), g = 0; while ((s.stack || []).length && g++ < 12) s = resolveTopOfStack(s); return s; };
const hit = (s0, s) => ({ aiLife: s.players.ai.life - s0.players.ai.life,
  jaceLoyalty: (s.players.ai.battlefield.find((p) => p.id === "jace")?.counters?.loyalty ?? 0) - 3 });

describe("parse, routing, classification", () => {
  it("the clause parses to the attacked-defender damage, gated to the combat events that thread a defender", () => {
    const atoms = parseEffectClause("this creature deals 1 damage to the player or planeswalker it's attacking").atoms;
    expect(atoms).toEqual([{ op: "deal-damage", amount: 1, targetType: "attackedDefender", who: "defendingPlayer" }]);
    expect(["attacks", "becomesBlocked", "etb", "dies"].map((ev) => combatDamageReferentSatisfied({ atoms }, ev))).toEqual([true, true, false, false]);
  });
  it("Hellrider, Scorch Spitter and Rakdos Roustabout flip native", () => {
    for (const card of [HELLRIDER, SPITTER, ROUSTABOUT]) expect(classifyCard(card)).toMatch(/^native-/);
  });
});

describe("RUNTIME — the damage goes where the creature is attacking", () => {
  it("VACUITY CONTROL — two Bears attack with no Hellrider: nothing is dealt", () => {
    const s0 = combat([mine(BEARS, "b1"), mine(BEARS, "b2")], [["b1", "player"], ["b2", "player"]]);
    expect(hit(s0, drain(checkAttackTriggers(s0)))).toEqual({ aiLife: 0, jaceLoyalty: 0 });
  });

  it("⭐ Hellrider and two Bears attack the AI: three triggers, three damage to the AI", () => {
    const s0 = combat([mine(HELLRIDER, "hr"), mine(BEARS, "b1"), mine(BEARS, "b2")], [["hr", "player"], ["b1", "player"], ["b2", "player"]]);
    const out = hit(s0, drain(checkAttackTriggers(s0)));
    expect(out).toEqual({ aiLife: -3, jaceLoyalty: 0 });
    console.log(`WITNESS hellriderSwing ${JSON.stringify(out)}`);
  });

  it("⭐ a Bear attacking Jace under Hellrider: Jace loses a loyalty counter and the AI's life is untouched", () => {
    const s0 = combat([mine(HELLRIDER, "hr"), mine(BEARS, "b1")], [["b1", "jace"]]);
    expect(hit(s0, drain(checkAttackTriggers(s0)))).toEqual({ aiLife: 0, jaceLoyalty: -1 });
  });

  it("the attacked planeswalker gone before the trigger resolves: nothing is dealt — never to its controller instead", () => {
    const s0 = combat([mine(HELLRIDER, "hr"), mine(BEARS, "b1")], [["b1", "jace"]]);
    const pending = checkAttackTriggers(s0);
    const gone = { ...pending, players: { ...pending.players, ai: { ...pending.players.ai, battlefield: pending.players.ai.battlefield.filter((p) => p.id !== "jace") } } };
    expect(drain(gone).players.ai.life).toBe(s0.players.ai.life);
  });

  it("⭐ Scorch Spitter attacking deals its 1 to the AI", () => {
    const s0 = combat([mine(SPITTER, "ss")], [["ss", "player"]]);
    expect(hit(s0, drain(checkAttackTriggers(s0)))).toEqual({ aiLife: -1, jaceLoyalty: 0 });
  });

  it("⭐ Rakdos Roustabout becomes blocked: 1 to the AI — and on Jace, 1 to Jace, not to the AI (the block context carries the planeswalker)", () => {
    const face = combat([mine(ROUSTABOUT, "rr")], [["rr", "player"]], ["rr"]);
    expect(hit(face, drain(checkBlockTriggers(face)))).toEqual({ aiLife: -1, jaceLoyalty: 0 });
    const onJace = combat([mine(ROUSTABOUT, "rr")], [["rr", "jace"]], ["rr"]);
    expect(hit(onJace, drain(checkBlockTriggers(onJace)))).toEqual({ aiLife: 0, jaceLoyalty: -1 });
  });

  it("an unblocked Rakdos Roustabout deals nothing (its trigger is the block)", () => {
    const s0 = combat([mine(ROUSTABOUT, "rr")], [["rr", "player"]]);
    expect(hit(s0, drain(checkBlockTriggers(s0)))).toEqual({ aiLife: 0, jaceLoyalty: 0 });
  });
});

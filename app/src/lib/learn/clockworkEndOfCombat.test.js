/**
 * clockworkEndOfCombat.test.js — the Clockwork cycle: "Whenever this creature attacks or blocks, remove a +1/+1 counter from it
 * at end of combat." (Clockwork Beetle, Condor, Vorrac, Dragon — the 09-06 plan's stage ③, census row ⑭, 2026-09-30).
 *
 * The ④-AX self end-of-combat shape (Mardu Blazebringer's "sacrifice it", Windscouter's "return it") with a third action: the
 * trigger enqueues a turn-stamped entry on state.endOfCombatEffects, and combatResolution drains it at the end-of-combat
 * boundary — after the creature has dealt its damage — removing the counter through the counter chokepoint and then running
 * the lethal check, so a Clockwork left at 0/0 dies before anyone gets priority (CR 704.5f).
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-09-30); each run for real through checkAttackTriggers /
 * checkBlockTriggers → the stack → resolveCombatDamage.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent, findPermanent } from "./gameState.js";
import { checkAttackTriggers, checkBlockTriggers } from "./triggers.js";
import { flushTriggers, resolveTopOfStack } from "./gameEngine.js";
import { resolveCombatDamage } from "./combatResolution.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const LINE = "Whenever this creature attacks or blocks, remove a +1/+1 counter from it at end of combat.";
const BEETLE = { name: "Clockwork Beetle", type: "Artifact Creature — Insect", mana: "{1}", power: 0, toughness: 0,
  oracle: `This creature enters with two +1/+1 counters on it.\n${LINE}` };
const CONDOR = { name: "Clockwork Condor", type: "Artifact Creature — Bird", mana: "{4}", power: 0, toughness: 0, keywords: ["Flying"],
  oracle: `Flying\nThis creature enters with three +1/+1 counters on it.\n${LINE}` };
const VORRAC = { name: "Clockwork Vorrac", type: "Artifact Creature — Boar Beast", mana: "{5}", power: 0, toughness: 0, keywords: ["Trample"],
  oracle: `Trample\nThis creature enters with four +1/+1 counters on it.\n${LINE}\n{T}: Put a +1/+1 counter on this creature.` };
const DRAGON = { name: "Clockwork Dragon", type: "Artifact Creature — Dragon", mana: "{7}", power: 0, toughness: 0, keywords: ["Flying"],
  oracle: `Flying\nThis creature enters with six +1/+1 counters on it.\n${LINE}\n{3}: Put a +1/+1 counter on this creature.` };
const OGRE = { name: "Gray Ogre", type: "Creature — Ogre", mana: "{2}{R}", power: 2, toughness: 2, oracle: "" };

const withCounters = (card, id, controller, n) => ({ ...createPermanent({ id, card, controller, summoningSick: false }), counters: { "+1/+1": n } });
const counters = (s, id) => findPermanent(s, id)?.permanent?.counters?.["+1/+1"] || 0;
const resolveAll = (s) => { let st = flushTriggers(s); for (let i = 0; i < 10 && st.stack?.length; i++) st = resolveTopOfStack(st); return st; };

// The user's `attackerId` attacks the AI (unblocked); returns [state after the attack trigger resolved, state after combat].
function attack(board, attackerId) {
  const s0 = createGameState({ userDeck: [], aiDeck: [] });
  const s = { ...s0, turn: 5, activePlayer: "user", priorityHolder: "user", phase: "combat", step: "declare-attackers", stack: [],
    combat: { attackers: [{ permanentId: attackerId, attackingPlayer: "user", defender: "ai" }], blockers: [] },
    players: { ...s0.players, user: { ...s0.players.user, battlefield: board } } };
  const declared = resolveAll(checkAttackTriggers(s));
  return [declared, resolveCombatDamage({ ...declared, step: "combat-damage" })];
}

describe("classification", () => {
  it("Clockwork Beetle and Condor → native-trigger; Clockwork Vorrac and Dragon (with their counter abilities) → native-mixed", () => {
    expect([BEETLE, CONDOR, VORRAC, DRAGON].map(classifyCard)).toEqual(["native-trigger", "native-trigger", "native-mixed", "native-mixed"]);
  });
});

describe("RUNTIME — the counter comes off at end of combat, after the damage", () => {
  it("⭐ ATTACK: the Beetle's trigger waits — it still hits for 2 — then ends combat with one counter", () => {
    const [declared, after] = attack([withCounters(BEETLE, "cb", "user", 2)], "cb");
    expect([counters(declared, "cb"), (declared.endOfCombatEffects || []).map((e) => e.op)]).toEqual([2, ["remove-counter"]]);
    expect([declared.players.ai.life - after.players.ai.life, counters(after, "cb")]).toEqual([2, 1]);
    console.log(`WITNESS beetleAttack damage ${declared.players.ai.life - after.players.ai.life} · counters 2 → ${counters(after, "cb")}`);
  });

  it("⭐ the LAST counter: a Beetle on one counter hits for 1, then dies at 0/0 before anyone gets priority (CR 704.5f)", () => {
    const [declared, after] = attack([withCounters(BEETLE, "cb", "user", 1)], "cb");
    expect(declared.players.ai.life - after.players.ai.life).toBe(1);
    expect(findPermanent(after, "cb")).toBeNull();
    expect(after.players.user.graveyard.map((c) => c.name)).toContain("Clockwork Beetle");
  });

  it("⭐ Clockwork Dragon attacks on six and ends combat on five", () => {
    expect(counters(attack([withCounters(DRAGON, "cd", "user", 6)], "cd")[1], "cd")).toBe(5);
  });

  // The Condor (3 counters) blocks the AI's `attackerCard`; returns [after the block trigger resolved, after combat].
  function block(attackerCard) {
    const s0 = createGameState({ userDeck: [], aiDeck: [] });
    const s = { ...s0, turn: 6, activePlayer: "ai", priorityHolder: "ai", phase: "combat", step: "declare-blockers", stack: [],
      combat: { attackers: [{ permanentId: "att", attackingPlayer: "ai", defender: "user" }], blockers: [{ blockerId: "cc", blockingPlayer: "user", attackerId: "att" }] },
      players: { ...s0.players, user: { ...s0.players.user, battlefield: [withCounters(CONDOR, "cc", "user", 3)] },
        ai: { ...s0.players.ai, battlefield: [createPermanent({ id: "att", card: attackerCard, controller: "ai", summoningSick: false })] } } };
    const declared = resolveAll(checkBlockTriggers(s));
    return [declared, resolveCombatDamage({ ...declared, step: "combat-damage" })];
  }

  it("⭐ BLOCK: the Condor blocks Llanowar Elves (1 damage) and ends combat with one fewer counter", () => {
    const [declared, after] = block({ name: "Llanowar Elves", type: "Creature — Elf Druid", mana: "{G}", power: 1, toughness: 1, oracle: "{T}: Add {G}." });
    expect([counters(declared, "cc"), counters(after, "cc")]).toEqual([3, 2]);
  });

  it("⭐ the damage stays marked: blocking Gray Ogre, the Condor takes 2, shrinks to 2/2 at end of combat, and dies (CR 704.5g)", () => {
    const [, after] = block(OGRE);
    expect(findPermanent(after, "cc")).toBeNull();
    expect(after.players.user.graveyard.map((c) => c.name)).toContain("Clockwork Condor");
  });
});

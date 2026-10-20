/**
 * DRANA, LIBERATOR OF MALAKIR (EDHREC #1535) — "Flying, first strike / Whenever Drana deals combat damage to a player, put a +1/+1
 * counter on each attacking creature you control." The mass +1/+1 counter over "each attacking creature you control": the creatures
 * attacking as the ability resolves (CR 506.4 — a creature removed from combat is no longer attacking), its controller's only.
 * Its bundled rulings, witnessed through the two combat damage steps (CR 510.4):
 *   · "The +1/+1 counter won't change how much damage Drana or any other attacking creature with first strike or double strike deals
 *     during that combat damage step. However, the +1/+1 counters that are put on attacking creatures without first strike will
 *     affect the damage those creatures deal during the regular combat damage step."
 *   · "Drana's last ability triggers after combat damage has been dealt, so only attacking creatures that survive the combat damage
 *     step in which Drana deals combat damage will have +1/+1 counters put on them."
 *
 * Real oracle fixtures (bundled Scryfall via cardIndex.publicCard).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { classifyCard } from "./coverage.js";
import { createGameState, createPermanent, _resetIdsForTests, findPermanent } from "./gameState.js";
import { flushTriggers, resolveTopOfStack, chooseTriggerTargets } from "./gameEngine.js";
import { resolveCombatDamage } from "./combatResolution.js";
import { parseEffectProgram } from "./effects/parser.js";

beforeEach(() => _resetIdsForTests());

const DRANA = {"name":"Drana, Liberator of Malakir","type":"Legendary Creature — Vampire Ally","mana":"{1}{B}{B}","cmc":3,"power":"2","toughness":"3","keywords":["Flying","First strike"],"colors":["B"],"oracle":"Flying, first strike\nWhenever Drana deals combat damage to a player, put a +1/+1 counter on each attacking creature you control."}; // body-only on 55eb7d63
const GRIZZLY_BEARS = {"name":"Grizzly Bears","type":"Creature — Bear","mana":"{1}{G}","cmc":2,"power":"2","toughness":"2","keywords":[],"colors":["G"],"oracle":""};
const WALL_OF_OMENS = {"name":"Wall of Omens","type":"Creature — Wall","mana":"{1}{W}","cmc":2,"power":"0","toughness":"4","keywords":["Defender"],"colors":["W"],"oracle":"Defender\nWhen this creature enters, draw a card."};
const HILL_GIANT = {"name":"Hill Giant","type":"Creature — Giant","mana":"{3}{R}","cmc":4,"power":"3","toughness":"3","keywords":[],"colors":["R"],"oracle":""};

const P = (id, card, controller = "user") => createPermanent({ id, card: { id: `c-${id}`, ...card }, controller, summoningSick: false });
function settle(s0) {
  let s = s0;
  for (let i = 0; i < 30; i++) {
    s = flushTriggers(s, { chooseTargets: chooseTriggerTargets });
    if (!(s.stack || []).length || s.pendingChoice) break;
    s = resolveTopOfStack(s);
  }
  return s;
}
/** A four-seat pod in the user's combat damage step: `attackers` attack ai1; blockers as given. Every seat at 40. */
function combat(user, attackers, { ai = [], blockers = [] } = {}) {
  const s0 = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
  const s = { ...s0, turn: 4, activePlayer: "user", priorityHolder: "user", phase: "combat", step: "combat-damage", stack: [], pendingTriggers: [],
    combat: { attackers: attackers.map((id) => ({ permanentId: id, attackingPlayer: "user", defender: "ai1" })), blockers },
    players: { ...s0.players, user: { ...s0.players.user, life: 40, battlefield: user } } };
  for (const id of ["ai1", "ai2", "ai3"]) s.players[id] = { ...s.players[id], life: 40, battlefield: id === "ai1" ? ai : [] };
  return s;
}
const counters = (s, id) => findPermanent(s, id)?.permanent?.counters?.["+1/+1"] ?? 0;

describe("the reader", () => {
  it("⭐ Drana plays her whole text", () => {
    expect(classifyCard(DRANA)).toBe("native-trigger");
  });
  it("⭐ the atom: every creature, narrowed to attacking and to its controller's", () => {
    const atom = parseEffectProgram({ name: "x", type: "Sorcery", oracle: "Put a +1/+1 counter on each attacking creature you control." }).atoms?.[0] || null;
    expect(atom && { op: atom.op, targetType: atom.targetType, restrictions: atom.restrictions }).toEqual({ op: "add-counter", targetType: "eachCreature",
      restrictions: [{ kind: "combat", value: "attacking" }, { kind: "controller", who: "you" }] });
  });
});

describe("two combat damage steps", () => {
  it("⭐ Drana connects in the first-strike step: a counter on her and on the attacking Bears, none on the Wall at home or the opponent's Giant; the Bears then deals 3", () => {
    const s0 = combat([P("drana", DRANA), P("bears", GRIZZLY_BEARS), P("wall", WALL_OF_OMENS)], ["drana", "bears"], { ai: [P("giant", HILL_GIANT, "ai1")] });
    const afterFirst = settle(resolveCombatDamage(s0, { firstStrikeStep: true }));
    const row1 = { ai1: afterFirst.players.ai1.life, drana: counters(afterFirst, "drana"), bears: counters(afterFirst, "bears"), wall: counters(afterFirst, "wall"), giant: counters(afterFirst, "giant") };
    const afterRegular = settle(resolveCombatDamage(afterFirst, { firstStrikeStep: false }));
    expect({ ...row1, ai1After: afterRegular.players.ai1.life }).toEqual({ ai1: 38, drana: 1, bears: 1, wall: 0, giant: 0, ai1After: 35 });
  });

  it("⭐ a blocked attacker is still attacking and gets one; a creature removed from combat is no longer attacking and gets none (CR 506.4)", () => {
    const blocked = [{ blockerId: "giant", attackerId: "bears", blockingPlayer: "ai1" }];
    const s0 = combat([P("drana", DRANA), P("bears", GRIZZLY_BEARS), P("bears2", GRIZZLY_BEARS)], ["drana", "bears", "bears2"], { ai: [P("giant", HILL_GIANT, "ai1")], blockers: blocked });
    const removed = { ...s0, combat: { ...s0.combat, attackers: s0.combat.attackers.filter((a) => a.permanentId !== "bears2") } };
    const s = settle(resolveCombatDamage(removed, { firstStrikeStep: true }));
    expect({ drana: counters(s, "drana"), bears: counters(s, "bears"), bears2: counters(s, "bears2") }).toEqual({ drana: 1, bears: 1, bears2: 0 });
  });

  it("control: blocked, Drana deals no damage to a player — no trigger, no counters", () => {
    const s0 = combat([P("drana", DRANA), P("bears", GRIZZLY_BEARS)], ["drana", "bears"], { ai: [P("wall2", WALL_OF_OMENS, "ai1")], blockers: [{ blockerId: "wall2", attackerId: "drana", blockingPlayer: "ai1" }] });
    const s = settle(resolveCombatDamage(s0, { firstStrikeStep: true }));
    expect({ drana: counters(s, "drana"), bears: counters(s, "bears") }).toEqual({ drana: 0, bears: 0 });
  });
});

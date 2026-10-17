/**
 * dealtDamageThatMuch.test.js — the play-weighted program, #799 Brash Taunter, and the family that prints the same trigger.
 *
 *   "Whenever this creature is dealt damage, it deals that much damage to <target opponent | any target | target player |
 *    each player | you>."
 *
 * The trigger was detected (the self dealt-damage event — checkDealtDamageTriggers fires it once per damage event with the
 * creature's total, CR 510.2, threading the amount); its effect was not read. Now, on that event and that scope only,
 * detectTriggers rewrites "it deals that much damage to …" to the sentinel "the damaged creature deals that much damage to …",
 * and the damage parser reads the sentinel as a deal-damage atom whose amount is the event's (ctx.dealtDamageAmount) and whose
 * SOURCE is the creature that was dealt the damage (damageSource "triggering" — CR 608.2h: the creature, as it exists or as
 * it last existed, deals it; its lifelink and deathtouch apply, CR 702.15b, 702.2b). A creature the damage kills still deals
 * it: the trigger was put on the stack after the state-based action, and the record of the creature as it left
 * (gameState.stampTriggeringLki) is the source.
 *
 * Real oracle fixtures (bundled Scryfall via cardIndex.publicCard, 2026-10-17; the trailing comment is the tier BEFORE this
 * slice). Every runtime case runs through the engine's own entry points: the casts and the fight are the offered legal
 * actions, dispatched, and passPriority resolves the stack; the combat case runs resolveCombatDamage.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard, isNativeTier } from "./coverage.js";
import { detectTriggers } from "./triggers.js";
import { triggerRoutesNatively } from "./triggerRouting.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { passPriority } from "./gameEngine.js";
import { resolveCombatDamage } from "./combatResolution.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

// ── real card fixtures (bundled Scryfall, cardIndex.publicCard) ──
const TAUNTER = {"name":"Brash Taunter","type":"Creature — Goblin","mana":"{4}{R}","cmc":5,"power":"1","toughness":"1","keywords":["Indestructible","Fight"],"colors":["R"],"oracle":"Indestructible\nWhenever this creature is dealt damage, it deals that much damage to target opponent.\n{2}{R}, {T}: This creature fights another target creature."}; // body-only #799
const RECKONER = {"name":"Boros Reckoner","type":"Creature — Minotaur Wizard","mana":"{R/W}{R/W}{R/W}","cmc":3,"power":"3","toughness":"3","keywords":[],"colors":["R","W"],"oracle":"Whenever this creature is dealt damage, it deals that much damage to any target.\n{R/W}: This creature gains first strike until end of turn."}; // body-only #6346
const SPITEMARE = {"name":"Spitemare","type":"Creature — Elemental","mana":"{2}{R/W}{R/W}","cmc":4,"power":"3","toughness":"3","keywords":[],"colors":["R","W"],"oracle":"Whenever this creature is dealt damage, it deals that much damage to any target."}; // body-only #12356
const PUP = {"name":"Jackal Pup","type":"Creature — Jackal","mana":"{R}","cmc":1,"power":"2","toughness":"1","keywords":[],"colors":["R"],"oracle":"Whenever this creature is dealt damage, it deals that much damage to you."}; // body-only #24146
const GATEKEEPER = {"name":"Shinka Gatekeeper","type":"Creature — Ogre Warrior","mana":"{2}{R}","cmc":3,"power":"3","toughness":"2","keywords":[],"colors":["R"],"oracle":"Whenever this creature is dealt damage, it deals that much damage to you."}; // body-only #28179
const SWINE = {"name":"Coalhauler Swine","type":"Creature — Boar Beast","mana":"{4}{R}{R}","cmc":6,"power":"4","toughness":"4","keywords":[],"colors":["R"],"oracle":"Whenever this creature is dealt damage, it deals that much damage to each player."}; // body-only #15445
const CAPTAIN = {"name":"Truefire Captain","type":"Creature — Human Knight","mana":"{R}{R}{W}{W}","cmc":4,"power":"4","toughness":"3","keywords":["Mentor"],"colors":["R","W"],"oracle":"Mentor (Whenever this creature attacks, put a +1/+1 counter on target attacking creature with lesser power.)\nWhenever this creature is dealt damage, it deals that much damage to target player."}; // body-only #12737
const KLEMENT = {"name":"Klement, Tempest Acolyte","type":"Legendary Creature — Tiefling Cleric","mana":"{1}{R}{W}","cmc":3,"power":"2","toughness":"3","keywords":["Double strike"],"colors":["R","W"],"oracle":"Double strike\nWhenever Klement, Tempest Acolyte is dealt damage, it deals that much damage to any target."}; // body-only (no EDHREC rank)
const MANIAC = {"name":"Mogg Maniac","type":"Creature — Goblin","mana":"{1}{R}","cmc":2,"power":"1","toughness":"1","keywords":[],"colors":["R"],"oracle":"Whenever this creature is dealt damage, it deals that much damage to target opponent or planeswalker."}; // body-only #11776
const DOLL = {"name":"Stuffy Doll","type":"Artifact Creature — Construct","mana":"{5}","cmc":5,"power":"0","toughness":"1","keywords":["Indestructible"],"colors":[],"oracle":"Indestructible\nAs this creature enters, choose a player.\nWhenever this creature is dealt damage, it deals that much damage to the chosen player.\n{T}: This creature deals 1 damage to itself."}; // body-only #2248
const NEMESIS = {"name":"Screaming Nemesis","type":"Creature — Spirit","mana":"{2}{R}","cmc":3,"power":"3","toughness":"3","keywords":["Haste"],"colors":["R"],"oracle":"Haste\nWhenever this creature is dealt damage, it deals that much damage to any other target. If a player is dealt damage this way, they can't gain life for the rest of the game."}; // body-only #3710
const WRATHFUL = {"name":"Wrathful Red Dragon","type":"Creature — Dragon","mana":"{3}{R}{R}","cmc":5,"power":"5","toughness":"5","keywords":["Flying"],"colors":["R"],"oracle":"Flying\nWhenever a Dragon you control is dealt damage, it deals that much damage to any target that isn't a Dragon."}; // body-only #2262
const BOLT = {"name":"Lightning Bolt","type":"Instant","mana":"{R}","cmc":1,"keywords":[],"colors":["R"],"oracle":"Lightning Bolt deals 3 damage to any target."}; // native-spell
const SHOCK = {"name":"Shock","type":"Instant","mana":"{R}","cmc":1,"keywords":[],"colors":["R"],"oracle":"Shock deals 2 damage to any target."}; // native-spell
const GIANT = {"name":"Hill Giant","type":"Creature — Giant","mana":"{3}{R}","cmc":4,"power":"3","toughness":"3","keywords":[],"colors":["R"],"oracle":""}; // native-body
const BEARS = {"name":"Grizzly Bears","type":"Creature — Bear","mana":"{1}{G}","cmc":2,"power":"2","toughness":"2","keywords":[],"colors":["G"],"oracle":""}; // native-body
const MOUNTAIN = {"name":"Mountain","type":"Basic Land — Mountain","mana":"","cmc":0,"keywords":[],"colors":[],"oracle":"({T}: Add {R}.)"}; // land

const P = (id, card, controller, over = {}) => ({ ...createPermanent({ id, card: { id: `c-${id}`, ...card }, controller, summoningSick: false }), ...over });
const mountains = (n) => Array.from({ length: n }, (_, i) => P(`m${i}`, MOUNTAIN, "user"));

/** A two-seat game (user, ai), both at 20, the user active in its precombat main with priority. */
function table({ user = [], ai = [], hand = [] } = {}) {
  const s0 = createGameState({ userDeck: [], aiDeck: [] });
  const players = { ...s0.players };
  for (const pid of Object.keys(players)) players[pid] = { ...players[pid], battlefield: [], hand: [], graveyard: [], library: [], life: 20 };
  players.user = { ...players.user, battlefield: user, hand };
  players.ai = { ...players.ai, battlefield: ai };
  return { ...s0, players, turn: 4, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0 };
}
function resolveStack(s) {
  let g = 0;
  while ((s.stack.length || (s.pendingTriggers || []).length) && g++ < 200) s = passPriority(s);
  return s;
}
const act = (s, pred) => {
  const a = legalActionsForPlayer(s, "user").find(pred);
  if (!a) throw new Error("no matching action for user");
  return resolveStack(dispatchAction(s, a));
};
const castAt = (s, cardId, targetId) => act(s, (a) => a.kind === "cast-spell" && a.cardId === cardId && (a.targets || []).some((t) => t.id === targetId));
const life = (s) => ({ user: s.players.user.life, ai: s.players.ai.life });

describe("classification — the self dealt-damage trigger's \"that much\" damage is read", () => {
  it("Brash Taunter's trigger routes natively and the card classifies native", () => {
    const d = detectTriggers(TAUNTER).find((x) => x.event === "dealtDamage");
    expect(d).toMatchObject({ event: "dealtDamage", scope: "self" });
    expect(triggerRoutesNatively(d)).toBe(true);
    expect(isNativeTier(classifyCard(TAUNTER))).toBe(true);
  });

  it("the family with a modeled recipient classifies native", () => {
    const fam = [RECKONER, SPITEMARE, PUP, GATEKEEPER, SWINE, CAPTAIN, KLEMENT];
    expect(fam.map((c) => [c.name, isNativeTier(classifyCard(c))])).toEqual(fam.map((c) => [c.name, true]));
  });

  it("CREED — a recipient or rider the engine doesn't read stays parked: \"target opponent or planeswalker\", \"the chosen player\", the can't-gain-life rider, a Dragon watcher", () => {
    for (const c of [MANIAC, DOLL, NEMESIS, WRATHFUL]) expect([c.name, isNativeTier(classifyCard(c))]).toEqual([c.name, false]);
  });

  it("CREED — off the dealt-damage event (an attack trigger has no \"that much\") the sentence does not route", () => {
    const atk = detectTriggers({ ...TAUNTER, oracle: "Whenever this creature attacks, it deals that much damage to target opponent." })[0];
    expect(atk?.event).toBe("attacks");
    expect(triggerRoutesNatively(atk)).toBe(false);
  });
});

describe("RUNTIME — the creature that was dealt damage deals that much", () => {
  it("⭐ Brash Taunter fights Hill Giant: dealt 3, it deals 3 to the opponent; the Giant took 1", () => {
    let s = table({ user: [P("taunter", TAUNTER, "user"), ...mountains(3)], ai: [P("giant", GIANT, "ai")] });
    s = act(s, (a) => a.kind === "activate-ability" && a.permanentId === "taunter" && (a.targets || []).some((t) => t.id === "giant"));
    expect(life(s)).toEqual({ user: 20, ai: 17 });
    expect(s.players.user.battlefield.some((p) => p.id === "taunter")).toBe(true); // indestructible
  });

  it("Lightning Bolt at Brash Taunter: the opponent takes 3 from the Taunter", () => {
    let s = table({ user: [P("taunter", TAUNTER, "user"), ...mountains(1)], hand: [{ ...BOLT, id: "bolt" }] });
    s = castAt(s, "bolt", "taunter");
    expect(life(s)).toEqual({ user: 20, ai: 17 });
  });

  it("the Taunter is the damage's source: with lifelink (a keyword counter) its controller gains what it deals", () => {
    let s = table({ user: [P("taunter", TAUNTER, "user", { counters: { lifelink: 1 } }), ...mountains(1)], hand: [{ ...BOLT, id: "bolt" }] });
    s = castAt(s, "bolt", "taunter");
    expect(life(s)).toEqual({ user: 23, ai: 17 });
  });

  it("blocked by two creatures in one combat damage step: ONE trigger, the total (2 + 3 = 5)", () => {
    const s0 = table({ user: [P("taunter", TAUNTER, "user")], ai: [P("bear", BEARS, "ai"), P("giant", GIANT, "ai")] });
    let s = { ...s0, phase: "combat", step: "combat-damage", combat: { attackers: [{ permanentId: "taunter", attackingPlayer: "user", defender: "ai" }],
      blockers: [{ attackerId: "taunter", blockerId: "bear" }, { attackerId: "taunter", blockerId: "giant" }] } };
    s = resolveCombatDamage(s);
    expect((s.pendingTriggers || []).filter((t) => t.descriptor?.event === "dealtDamage")).toHaveLength(1);
    s = resolveStack(s);
    expect(life(s)).toEqual({ user: 20, ai: 15 });
  });

  it("Boros Reckoner (3/3) dies to Lightning Bolt — its trigger still resolves: 3 damage, the opponent the only enemy target", () => {
    let s = table({ user: [P("reck", RECKONER, "user"), ...mountains(1)], hand: [{ ...BOLT, id: "bolt" }] });
    s = castAt(s, "bolt", "reck");
    expect(s.players.user.battlefield.some((p) => p.id === "reck")).toBe(false);
    expect(life(s)).toEqual({ user: 20, ai: 17 });
  });

  it("a dealer the damage killed deals as it last existed: Spitemare with lifelink dies to Lightning Bolt, and its controller still gains the 3", () => {
    let s = table({ user: [P("mare", SPITEMARE, "user", { counters: { lifelink: 1 } }), ...mountains(1)], hand: [{ ...BOLT, id: "bolt" }] });
    s = castAt(s, "bolt", "mare");
    expect(s.players.user.battlefield.some((p) => p.id === "mare")).toBe(false);
    expect(life(s)).toEqual({ user: 23, ai: 17 });
  });

  it("Jackal Pup shocked: it deals 2 to its own controller", () => {
    let s = table({ user: [P("pup", PUP, "user"), ...mountains(1)], hand: [{ ...SHOCK, id: "shock" }] });
    s = castAt(s, "shock", "pup");
    expect(life(s)).toEqual({ user: 18, ai: 20 });
  });

  it("Coalhauler Swine shocked: it deals 2 to each player", () => {
    let s = table({ user: [P("swine", SWINE, "user"), ...mountains(1)], hand: [{ ...SHOCK, id: "shock" }] });
    s = castAt(s, "shock", "swine");
    expect(life(s)).toEqual({ user: 18, ai: 18 });
  });

  it("control — damage prevented (a shield counter) is no damage dealt: no trigger, no life lost", () => {
    let s = table({ user: [P("taunter", TAUNTER, "user", { counters: { shield: 1 } }), ...mountains(1)], hand: [{ ...BOLT, id: "bolt" }] });
    s = castAt(s, "bolt", "taunter");
    expect(life(s)).toEqual({ user: 20, ai: 20 });
  });
});

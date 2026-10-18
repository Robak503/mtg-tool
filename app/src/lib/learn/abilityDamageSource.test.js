/**
 * abilityDamageSource.test.js — damage dealt by a permanent's OWN ability carries that permanent's lifelink, deathtouch,
 * infect and wither, its colours and creature-ness, and its controller (2026-10-17).
 *
 * THE RULES. An object that deals damage is its source (CR 120.1); "This creature deals 1 damage to any target" is dealt by the
 * creature, not by the ability (CR 113.7a, 608.2h: "it's the object as it exists — or as it most recently existed — that does
 * it"). Lifelink applies to any damage its source deals — the source's controller gains that much life (CR 702.15b, 120.3f);
 * deathtouch destroys a creature dealt any damage by the source (CR 702.2b, 704.5h); neither is limited to combat damage. If the
 * source has left the battlefield before the effect makes it deal the damage, its last known information decides whether it had
 * lifelink, deathtouch or wither (CR 702.15c, 702.2e, 702.80b). Damage from a source with a quality a permanent has protection
 * from is prevented (CR 702.16e).
 *
 * THE GAP (spellEffects.damageDealer). The deal path read lifelink, deathtouch, colours and creature-ness only for a source that
 * asked (a `readsKeywords` flag — a fight, a bite, Warstorm Surge's entering creature). A permanent's own ability damage — a pinger,
 * an enters or dies trigger, Walking Ballista's counter, Pestilence — read none of it: Basilisk Collar on Prodigal Pyromancer
 * pinged a 9/9 and left it alive, Merciless Enforcers' lifelink gained nothing, Pestilence's black damage was marked on White
 * Knight, a pyromancer killed in response or a sacrificed Mogg Fanatic dealt plain damage.
 *
 * Real oracle fixtures (bundled Scryfall via cardIndex.publicCard, generated 2026-10-17). Activations and casts run through the
 * engine: legalActionsForPlayer offers the action, dispatchAction pays and stacks it, resolveTopOfStack resolves it and the
 * flush resolves what it triggered. Each witness has a CONTROL one card away, so a pass cannot come from a harness that never
 * dealt the damage.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { chooseTriggerTargets, flushTriggers, resolveTopOfStack } from "./gameEngine.js";
import { resolveCombatDamage } from "./combatResolution.js";
import { applyDestroyEffect } from "./spellEffects.js";
import { permanentHasKeyword } from "./layers.js";
import { _resetIdsForTests, attachPermanent, createGameState, createPermanent, findPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

// ── real card fixtures (bundled Scryfall, cardIndex.publicCard) ──
const BASILISK_COLLAR = {"name":"Basilisk Collar","type":"Artifact — Equipment","mana":"{1}","cmc":1,"keywords":["Equip"],"colors":[],"colorIdentity":[],"oracle":"Equipped creature has deathtouch and lifelink. (Any amount of damage it deals to a creature is enough to destroy it. Damage dealt by this creature also causes you to gain that much life.)\nEquip {2} ({2}: Attach to target creature you control. Equip only as a sorcery.)"};
const PRODIGAL_PYROMANCER = {"name":"Prodigal Pyromancer","type":"Creature — Human Wizard","mana":"{2}{R}","cmc":3,"power":"1","toughness":"1","keywords":[],"colors":["R"],"colorIdentity":["R"],"oracle":"{T}: This creature deals 1 damage to any target."};
const MOGG_FANATIC = {"name":"Mogg Fanatic","type":"Creature — Goblin","mana":"{R}","cmc":1,"power":"1","toughness":"1","keywords":[],"colors":["R"],"colorIdentity":["R"],"oracle":"Sacrifice this creature: It deals 1 damage to any target."};
const WALKING_BALLISTA = {"name":"Walking Ballista","type":"Artifact Creature — Construct","mana":"{X}{X}","cmc":0,"power":"0","toughness":"0","keywords":[],"colors":[],"colorIdentity":[],"oracle":"This creature enters with X +1/+1 counters on it.\n{4}: Put a +1/+1 counter on this creature.\nRemove a +1/+1 counter from this creature: It deals 1 damage to any target."};
const MERCILESS_ENFORCERS = {"name":"Merciless Enforcers","type":"Creature — Human Mercenary Villain","mana":"{1}{B}","cmc":2,"power":"2","toughness":"1","keywords":["Lifelink"],"colors":["B"],"colorIdentity":["B"],"oracle":"Lifelink\n{3}{B}: This creature deals 1 damage to each opponent."};
const BRION_STOUTARM = {"name":"Brion Stoutarm","type":"Legendary Creature — Giant Warrior","mana":"{2}{R}{W}","cmc":4,"power":"4","toughness":"4","keywords":["Lifelink"],"colors":["R","W"],"colorIdentity":["R","W"],"oracle":"Lifelink\n{R}, {T}, Sacrifice another creature: Brion Stoutarm deals damage equal to the sacrificed creature's power to target player or planeswalker."};
const MUDBUTTON_TORCHRUNNER = {"name":"Mudbutton Torchrunner","type":"Creature — Goblin Warrior","mana":"{2}{R}","cmc":3,"power":"1","toughness":"1","keywords":[],"colors":["R"],"colorIdentity":["R"],"oracle":"When this creature dies, it deals 3 damage to any target."};
const SANGUINARY_PRIEST = {"name":"Sanguinary Priest","type":"Creature — Astartes Cleric","mana":"{3}{B}","cmc":4,"power":"2","toughness":"4","keywords":["Lifelink","Blood Chalice"],"colors":["B"],"colorIdentity":["B"],"oracle":"Lifelink\nBlood Chalice — Whenever another creature you control dies, this creature deals 1 damage to any target."};
const PESTILENCE = {"name":"Pestilence","type":"Enchantment","mana":"{2}{B}{B}","cmc":4,"keywords":[],"colors":["B"],"colorIdentity":["B"],"oracle":"At the beginning of the end step, if no creatures are on the battlefield, sacrifice this enchantment.\n{B}: This enchantment deals 1 damage to each creature and each player."};
const THRASHING_WUMPUS = {"name":"Thrashing Wumpus","type":"Creature — Beast","mana":"{3}{B}{B}","cmc":5,"power":"3","toughness":"3","keywords":[],"colors":["B"],"colorIdentity":["B"],"oracle":"{B}: This creature deals 1 damage to each creature and each player."};
const WHITE_KNIGHT = {"name":"White Knight","type":"Creature — Human Knight","mana":"{W}{W}","cmc":2,"power":"2","toughness":"2","keywords":["First strike","Protection"],"colors":["W"],"colorIdentity":["W"],"oracle":"First strike (This creature deals combat damage before creatures without first strike.)\nProtection from black (This creature can't be blocked, targeted, dealt damage, or enchanted by anything black.)"};
const BELOVED_CHAPLAIN = {"name":"Beloved Chaplain","type":"Creature — Human Cleric","mana":"{1}{W}","cmc":2,"power":"1","toughness":"1","keywords":["Protection"],"colors":["W"],"colorIdentity":["W"],"oracle":"Protection from creatures"};
const PALADIN_EN_VEC = {"name":"Paladin en-Vec","type":"Creature — Human Knight","mana":"{1}{W}{W}","cmc":3,"power":"2","toughness":"2","keywords":["First strike","Protection"],"colors":["W"],"colorIdentity":["W"],"oracle":"First strike, protection from black and from red (This creature deals combat damage before creatures without first strike. It can't be blocked, targeted, dealt damage, or enchanted by anything black or red.)"};
const PYROCLASM = {"name":"Pyroclasm","type":"Sorcery","mana":"{1}{R}","cmc":2,"keywords":[],"colors":["R"],"colorIdentity":["R"],"oracle":"Pyroclasm deals 2 damage to each creature."};
const RAKDOS_CHARM = {"name":"Rakdos Charm","type":"Instant","mana":"{B}{R}","cmc":2,"keywords":[],"colors":["B","R"],"colorIdentity":["B","R"],"oracle":"Choose one —\n• Exile target player's graveyard.\n• Destroy target artifact.\n• Each creature deals 1 damage to its controller."};
const VAMPIRE_NIGHTHAWK = {"name":"Vampire Nighthawk","type":"Creature — Vampire Shaman","mana":"{1}{B}{B}","cmc":3,"power":"2","toughness":"3","keywords":["Deathtouch","Flying","Lifelink"],"colors":["B"],"colorIdentity":["B"],"oracle":"Flying\nDeathtouch (Any amount of damage this deals to a creature is enough to destroy it.)\nLifelink (Damage dealt by this creature also causes you to gain that much life.)"};
const GLISTENING_OIL = {"name":"Glistening Oil","type":"Enchantment — Aura","mana":"{B}{B}","cmc":2,"keywords":["Enchant"],"colors":["B"],"colorIdentity":["B"],"oracle":"Enchant creature\nEnchanted creature has infect.\nAt the beginning of your upkeep, put a -1/-1 counter on enchanted creature.\nWhen this Aura is put into a graveyard from the battlefield, return it to its owner's hand."};
const LIGHTNING_BOLT = {"name":"Lightning Bolt","type":"Instant","mana":"{R}","cmc":1,"keywords":[],"colors":["R"],"colorIdentity":["R"],"oracle":"Lightning Bolt deals 3 damage to any target."};
const FALLEN_FERROMANCER = {"name":"Fallen Ferromancer","type":"Creature — Phyrexian Human Shaman","mana":"{3}{R}","cmc":4,"power":"1","toughness":"1","keywords":["Infect"],"colors":["R"],"colorIdentity":["R"],"oracle":"Infect (This creature deals damage to creatures in the form of -1/-1 counters and to players in the form of poison counters.)\n{1}{R}, {T}: This creature deals 1 damage to any target."};
const CAT_GATOR = {"name":"Cat-Gator","type":"Creature — Fish Crocodile","mana":"{6}{B}","cmc":7,"power":"3","toughness":"2","keywords":["Lifelink"],"colors":["B"],"colorIdentity":["B"],"oracle":"Lifelink\nWhen this creature enters, it deals damage equal to the number of Swamps you control to any target."};
const SWAMP = {"name":"Swamp","type":"Basic Land — Swamp","mana":"","cmc":0,"keywords":[],"colors":[],"colorIdentity":["B"],"oracle":"({T}: Add {B}.)"};
const SUPER_STATE = {"name":"Super State","type":"Legendary Enchantment — Aura","mana":"{7}","cmc":7,"keywords":["First strike","Trample","Enchant"],"colors":[],"colorIdentity":[],"oracle":"Enchant creature you control\nEnchanted creature has base power and toughness 9/9 and has flying, first strike, trample, and haste.\nWhenever enchanted creature deals combat damage to an opponent, it deals that much damage to each other opponent."};
const KEDISS = {"name":"Kediss, Emberclaw Familiar","type":"Legendary Creature — Elemental Lizard","mana":"{1}{R}","cmc":2,"power":"1","toughness":"1","keywords":["Partner"],"colors":["R"],"colorIdentity":["R"],"oracle":"Whenever a commander you control deals combat damage to an opponent, it deals that much damage to each other opponent.\nPartner (You can have two commanders if both have partner.)"};
const DAWN_ELEMENTAL = {"name":"Dawn Elemental","type":"Creature — Elemental","mana":"{W}{W}{W}{W}","cmc":4,"power":"3","toughness":"3","keywords":["Flying"],"colors":["W"],"colorIdentity":["W"],"oracle":"Flying\nPrevent all damage that would be dealt to this creature."};
const ANCIENT_BRONTODON = {"name":"Ancient Brontodon","type":"Creature — Dinosaur","mana":"{6}{G}{G}","cmc":8,"power":"9","toughness":"9","keywords":[],"colors":["G"],"colorIdentity":["G"],"oracle":""};
const GRIZZLY_BEARS = {"name":"Grizzly Bears","type":"Creature — Bear","mana":"{1}{G}","cmc":2,"power":"2","toughness":"2","keywords":[],"colors":["G"],"colorIdentity":["G"],"oracle":""};
const HILL_GIANT = {"name":"Hill Giant","type":"Creature — Giant","mana":"{3}{R}","cmc":4,"power":"3","toughness":"3","keywords":[],"colors":["R"],"colorIdentity":["R"],"oracle":""};

const P = (id, card, controller, over = {}) => ({ ...createPermanent({ id, card: { id: `c-${id}`, ...card }, controller, summoningSick: false }), ...over });
const FULL = { W: 9, U: 9, B: 9, R: 9, G: 9, C: 9 };
const LIB = (pid) => [1, 2, 3, 4].map((i) => ({ id: `${pid}-lib${i}`, ...GRIZZLY_BEARS }));

/** A two-seat game in the user's precombat main phase, the stack empty, the user's pool full, both libraries stocked. */
function board({ user = [], ai = [], hand = [] } = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return { ...s, turn: 4, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main", consecutivePasses: 0, stack: [], pendingTriggers: [],
    players: { ...s.players,
      user: { ...s.players.user, life: 20, battlefield: user, hand, manaPool: { ...s.players.user.manaPool, ...FULL }, library: LIB("user") },
      ai: { ...s.players.ai, life: 20, battlefield: ai, hand: [], library: LIB("ai") } } };
}

/** The trigger target chooser: the candidate that names `id`, else the engine's own chooser. */
const aimTriggersAt = (id) => (candidates, info) => candidates.find((c) => JSON.stringify(c).includes(`"${id}"`)) ?? chooseTriggerTargets(candidates, info);

/** Resolve the stack, flushing what each resolution triggers. */
function settle(s0, chooseTargets = chooseTriggerTargets) {
  let s = s0;
  for (let i = 0; i < 30; i++) {
    s = flushTriggers(s, { chooseTargets });
    if (!(s.stack || []).length || s.pendingChoice) break;
    s = resolveTopOfStack(s);
  }
  return s;
}
const noResolveErrors = (s) => expect((s.log || []).filter((l) => l.kind === "stack-resolve-error")).toEqual([]);
const aimsAt = (a, id) => (a.targets || []).some((t) => t.id === id);
const alive = (s, id) => !!findPermanent(s, id);
const marked = (s, id) => findPermanent(s, id)?.permanent.damageMarked ?? null;
const inGraveyard = (s, pid, name) => (s.players[pid].graveyard || []).some((c) => c.name === name);
const equip = (s, equipId, targetId) => attachPermanent(s, { equipId, targetId });

/** The user's activation of `permId` whose targets satisfy `pick` (every target when none is given) — offered, then dispatched. */
function activate(s, permId, pick = () => true) {
  const act = legalActionsForPlayer(s, "user").filter((a) => a.kind === "activate-ability" && a.permanentId === permId).find(pick);
  expect(act, `an activation of ${permId} is offered`).toBeTruthy();
  return dispatchAction(s, act);
}
/** Activate, then resolve everything. */
const activateAndSettle = (s, permId, pick, chooseTargets) => {
  const out = settle(activate(s, permId, pick), chooseTargets);
  noResolveErrors(out);
  return out;
};
/** Cast `spell` from the user's hand: the offered cast satisfying `pick`, paid, resolved and settled. */
function cast(s, spell, pick = () => true) {
  const act = legalActionsForPlayer(s, "user").filter((a) => a.kind === "cast-spell" && a.cardId === spell.id).find(pick);
  expect(act, `${spell.name} is offered`).toBeTruthy();
  const out = settle(dispatchAction(s, act));
  noResolveErrors(out);
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
describe("① a pinger's damage carries its source's deathtouch and lifelink — Basilisk Collar on Prodigal Pyromancer", () => {
  const withCollar = (ai) => equip(board({ user: [P("pyro", PRODIGAL_PYROMANCER, "user"), P("collar", BASILISK_COLLAR, "user")], ai }), "collar", "pyro");

  it("the Collar grants the Pyromancer deathtouch and lifelink (the fixture the cases below need)", () => {
    const s = withCollar([]);
    expect([permanentHasKeyword(s, "pyro", "Deathtouch"), permanentHasKeyword(s, "pyro", "Lifelink")]).toEqual([true, true]);
  });
  it("⭐ 1 damage to a 9/9 destroys it (CR 702.2b) and the user gains 1 (CR 702.15b)", () => {
    const s = activateAndSettle(withCollar([P("bront", ANCIENT_BRONTODON, "ai")]), "pyro", (a) => aimsAt(a, "bront"));
    expect({ alive: alive(s, "bront"), inGraveyard: inGraveyard(s, "ai", ANCIENT_BRONTODON.name), life: s.players.user.life })
      .toEqual({ alive: false, inGraveyard: true, life: 21 });
  });
  it("⭐ 1 damage to the opponent: the opponent loses 1 and the user gains 1", () => {
    const s = activateAndSettle(withCollar([]), "pyro", (a) => aimsAt(a, "ai"));
    expect({ ai: s.players.ai.life, user: s.players.user.life }).toEqual({ ai: 19, user: 21 });
  });
  it("CONTROL — the Pyromancer without the Collar: the 9/9 lives with 1 damage marked, no life gained", () => {
    const s = activateAndSettle(board({ user: [P("pyro", PRODIGAL_PYROMANCER, "user"), P("collar", BASILISK_COLLAR, "user")], ai: [P("bront", ANCIENT_BRONTODON, "ai")] }), "pyro", (a) => aimsAt(a, "bront"));
    expect({ alive: alive(s, "bront"), marked: marked(s, "bront"), life: s.players.user.life }).toEqual({ alive: true, marked: 1, life: 20 });
  });
  it("CONTROL — damage that is prevented is not dealt (CR 120.8): Dawn Elemental lives and nothing is gained", () => {
    const s = activateAndSettle(withCollar([P("dawn", DAWN_ELEMENTAL, "ai")]), "pyro", (a) => aimsAt(a, "dawn"));
    expect({ alive: alive(s, "dawn"), marked: marked(s, "dawn"), life: s.players.user.life }).toEqual({ alive: true, marked: 0, life: 20 });
  });
});

describe("② printed lifelink on the ability's own permanent", () => {
  it("⭐ Merciless Enforcers — {3}{B}: 1 damage to each opponent; the user gains 1", () => {
    const s = activateAndSettle(board({ user: [P("enf", MERCILESS_ENFORCERS, "user")] }), "enf");
    expect({ ai: s.players.ai.life, user: s.players.user.life }).toEqual({ ai: 19, user: 21 });
  });
  it("⭐ Brion Stoutarm — sacrificing a Hill Giant deals 3 to the opponent; the user gains 3", () => {
    const s = activateAndSettle(board({ user: [P("brion", BRION_STOUTARM, "user"), P("giant", HILL_GIANT, "user")] }), "brion", (a) => a.sacCreatureId === "giant" && aimsAt(a, "ai"));
    expect({ ai: s.players.ai.life, user: s.players.user.life, giantGone: inGraveyard(s, "user", HILL_GIANT.name) }).toEqual({ ai: 17, user: 23, giantGone: true });
  });
  it("⭐ Sanguinary Priest — another creature you control dies; its 1 damage to the opponent gains the user 1", () => {
    const s0 = board({ user: [P("priest", SANGUINARY_PRIEST, "user"), P("bears", GRIZZLY_BEARS, "user")] });
    const s = settle(applyDestroyEffect(s0, { controller: "ai", targets: [{ type: "creature", id: "bears" }] }), aimTriggersAt("ai"));
    noResolveErrors(s);
    expect({ ai: s.players.ai.life, user: s.players.user.life }).toEqual({ ai: 19, user: 21 });
  });
  it("⭐ Cat-Gator — cast with two Swamps: its enters trigger deals 2 to the opponent and the user gains 2", () => {
    const gator = { id: "h-gator", ...CAT_GATOR };
    const s0 = board({ user: [P("sw1", SWAMP, "user"), P("sw2", SWAMP, "user")], hand: [gator] });
    const act = legalActionsForPlayer(s0, "user").find((a) => a.kind === "cast-spell" && a.cardId === "h-gator");
    expect(act, "Cat-Gator is offered").toBeTruthy();
    const s = settle(dispatchAction(s0, act), aimTriggersAt("ai"));
    noResolveErrors(s);
    expect({ ai: s.players.ai.life, user: s.players.user.life }).toEqual({ ai: 18, user: 22 });
  });
  it("CONTROL — a printed infect pinger was already read (Fallen Ferromancer): its 1 damage to the opponent is a poison counter", () => {
    const s = activateAndSettle(board({ user: [P("ferro", FALLEN_FERROMANCER, "user")] }), "ferro", (a) => aimsAt(a, "ai"));
    expect({ ai: s.players.ai.life, poison: s.players.ai.poison ?? s.players.ai.poisonCounters ?? 0, user: s.players.user.life }).toEqual({ ai: 20, poison: 1, user: 20 });
  });
  it("CONTROL — combat lifelink is counted once: an unblocked Vampire Nighthawk deals 2 and gains 2", () => {
    let s = board({ user: [P("hawk", VAMPIRE_NIGHTHAWK, "user")] });
    s = { ...s, phase: "combat", step: "combat-damage", combat: { attackers: [{ permanentId: "hawk", attackingPlayer: "user", defender: "ai" }], blockers: [] } };
    const out = resolveCombatDamage(s, { firstStrikeStep: false });
    expect({ ai: out.players.ai.life, user: out.players.user.life }).toEqual({ ai: 18, user: 22 });
  });
  it("CONTROL — a SPELL is not its caster's lifelink creature: Lightning Bolt cast beside Vampire Nighthawk gains nothing", () => {
    const bolt = { id: "h-bolt", ...LIGHTNING_BOLT };
    const s = cast(board({ user: [P("hawk", VAMPIRE_NIGHTHAWK, "user")], hand: [bolt] }), bolt, (a) => aimsAt(a, "ai"));
    expect({ ai: s.players.ai.life, user: s.players.user.life }).toEqual({ ai: 17, user: 20 });
  });
});

describe("③ a source that has LEFT the battlefield deals the damage as it last existed (CR 113.7a, 702.15c, 702.2e)", () => {
  it("⭐ Mogg Fanatic wearing the Collar, sacrificed for its own cost: the 9/9 is destroyed and the user gains 1", () => {
    const s0 = equip(board({ user: [P("fan", MOGG_FANATIC, "user"), P("collar", BASILISK_COLLAR, "user")], ai: [P("bront", ANCIENT_BRONTODON, "ai")] }), "collar", "fan");
    const s = activateAndSettle(s0, "fan", (a) => aimsAt(a, "bront"));
    expect({ fanaticGone: inGraveyard(s, "user", MOGG_FANATIC.name), bront: alive(s, "bront"), life: s.players.user.life }).toEqual({ fanaticGone: true, bront: false, life: 21 });
  });
  it("⭐ Mudbutton Torchrunner wearing the Collar dies: its 3 damage destroys the 9/9 and the user gains 3", () => {
    const s0 = equip(board({ user: [P("torch", MUDBUTTON_TORCHRUNNER, "user"), P("collar", BASILISK_COLLAR, "user")], ai: [P("bront", ANCIENT_BRONTODON, "ai")] }), "collar", "torch");
    const s = settle(applyDestroyEffect(s0, { controller: "ai", targets: [{ type: "creature", id: "torch" }] }), aimTriggersAt("bront"));
    noResolveErrors(s);
    expect({ bront: alive(s, "bront"), life: s.players.user.life }).toEqual({ bront: false, life: 23 });
  });
  it("⭐ the Pyromancer wearing the Collar is destroyed in response: its ability still destroys the 9/9 and gains 1", () => {
    const s0 = equip(board({ user: [P("pyro", PRODIGAL_PYROMANCER, "user"), P("collar", BASILISK_COLLAR, "user")], ai: [P("bront", ANCIENT_BRONTODON, "ai")] }), "collar", "pyro");
    const onStack = activate(s0, "pyro", (a) => aimsAt(a, "bront"));
    expect(onStack.stack.length).toBe(1);
    const killed = applyDestroyEffect(onStack, { controller: "ai", targets: [{ type: "creature", id: "pyro" }] });
    expect(alive(killed, "pyro")).toBe(false);
    const s = settle(killed);
    noResolveErrors(s);
    expect({ bront: alive(s, "bront"), life: s.players.user.life }).toEqual({ bront: false, life: 21 });
  });
  it("⭐ the record rides the ability: a second Mogg Fanatic sacrificed in response does not replace the first one's (the Collar's deathtouch and lifelink)", () => {
    let s = equip(board({ user: [P("fanA", MOGG_FANATIC, "user"), P("fanB", MOGG_FANATIC, "user"), P("collar", BASILISK_COLLAR, "user")], ai: [P("bront", ANCIENT_BRONTODON, "ai")] }), "collar", "fanA");
    s = activate(s, "fanA", (a) => aimsAt(a, "bront"));
    s = activate({ ...s, priorityHolder: "user" }, "fanB", (a) => aimsAt(a, "ai"));
    expect(s.stack.length).toBe(2);
    const out = settle(s);
    noResolveErrors(out);
    expect({ ai: out.players.ai.life, bront: alive(out, "bront"), life: out.players.user.life }).toEqual({ ai: 19, bront: false, life: 21 });
  });
  it("⭐ a TRIGGERED ability whose source is destroyed in response: Sanguinary Priest's 1 damage still gains the user 1", () => {
    const s0 = board({ user: [P("priest", SANGUINARY_PRIEST, "user"), P("bears", GRIZZLY_BEARS, "user")] });
    const triggered = flushTriggers(applyDestroyEffect(s0, { controller: "ai", targets: [{ type: "creature", id: "bears" }] }), { chooseTargets: aimTriggersAt("ai") });
    expect(triggered.stack.length).toBe(1);
    const killed = applyDestroyEffect(triggered, { controller: "ai", targets: [{ type: "creature", id: "priest" }] });
    expect(alive(killed, "priest")).toBe(false);
    const s = settle(killed, aimTriggersAt("ai"));
    noResolveErrors(s);
    expect({ ai: s.players.ai.life, user: s.players.user.life }).toEqual({ ai: 19, user: 21 });
  });
  it("CONTROL — the Pyromancer WITHOUT the Collar destroyed in response: the 9/9 lives with 1 damage", () => {
    const s0 = board({ user: [P("pyro", PRODIGAL_PYROMANCER, "user")], ai: [P("bront", ANCIENT_BRONTODON, "ai")] });
    const killed = applyDestroyEffect(activate(s0, "pyro", (a) => aimsAt(a, "bront")), { controller: "ai", targets: [{ type: "creature", id: "pyro" }] });
    const s = settle(killed);
    noResolveErrors(s);
    expect({ bront: alive(s, "bront"), marked: marked(s, "bront"), life: s.players.user.life }).toEqual({ bront: true, marked: 1, life: 20 });
  });
  it("⭐ Walking Ballista wearing the Collar removes its last counter: it dies, and its 1 damage still destroys the 9/9 and gains 1", () => {
    const s0 = equip(board({ user: [P("bal", WALKING_BALLISTA, "user", { counters: { "+1/+1": 1 } }), P("collar", BASILISK_COLLAR, "user")], ai: [P("bront", ANCIENT_BRONTODON, "ai")] }), "collar", "bal");
    const s = activateAndSettle(s0, "bal", (a) => aimsAt(a, "bront"));
    expect({ ballista: alive(s, "bal"), bront: alive(s, "bront"), life: s.players.user.life }).toEqual({ ballista: false, bront: false, life: 21 });
  });
  it("⭐ Mogg Fanatic enchanted with Glistening Oil, sacrificed: its damage to the opponent is a poison counter (CR 120.3b), not life", () => {
    const s0 = equip(board({ user: [P("fan", MOGG_FANATIC, "user"), P("oil", GLISTENING_OIL, "user")] }), "oil", "fan");
    expect(permanentHasKeyword(s0, "fan", "Infect")).toBe(true);
    const s = activateAndSettle(s0, "fan", (a) => aimsAt(a, "ai"));
    expect({ ai: s.players.ai.life, poison: s.players.ai.poison ?? s.players.ai.poisonCounters ?? 0 }).toEqual({ ai: 20, poison: 1 });
  });
});

describe("④ protection from the ability's source (CR 702.16e) — its colours and creature-ness", () => {
  it("⭐ Pestilence (a black source) deals no damage to White Knight (protection from black); Grizzly Bears takes 1", () => {
    const s = activateAndSettle(board({ user: [P("pest", PESTILENCE, "user"), P("knight", WHITE_KNIGHT, "user")], ai: [P("bears", GRIZZLY_BEARS, "ai")] }), "pest");
    expect({ knight: marked(s, "knight"), bears: marked(s, "bears") }).toEqual({ knight: 0, bears: 1 });
  });
  it("⭐ Thrashing Wumpus (a black creature) deals no damage to Beloved Chaplain (protection from creatures); the Chaplain lives", () => {
    const s = activateAndSettle(board({ user: [P("wump", THRASHING_WUMPUS, "user")], ai: [P("chap", BELOVED_CHAPLAIN, "ai"), P("bears", GRIZZLY_BEARS, "ai")] }), "wump");
    expect({ chaplain: alive(s, "chap"), chaplainMarked: marked(s, "chap"), bears: marked(s, "bears") }).toEqual({ chaplain: true, chaplainMarked: 0, bears: 1 });
  });
  it("⭐ a red SPELL's damage is prevented by protection from red: Pyroclasm leaves Paladin en-Vec unharmed; Grizzly Bears dies", () => {
    const clasm = { id: "h-clasm", ...PYROCLASM };
    const s = cast(board({ ai: [P("pal", PALADIN_EN_VEC, "ai"), P("bears", GRIZZLY_BEARS, "ai")], hand: [clasm] }), clasm);
    expect({ paladin: alive(s, "pal"), paladinMarked: marked(s, "pal"), bears: alive(s, "bears") }).toEqual({ paladin: true, paladinMarked: 0, bears: false });
  });
  it("CONTROL — protection from a colour the source is not: Pyroclasm (red) still deals its 2 to White Knight (protection from black)", () => {
    const clasm = { id: "h-clasm", ...PYROCLASM };
    const s = cast(board({ ai: [P("knight", WHITE_KNIGHT, "ai")], hand: [clasm] }), clasm);
    expect({ knight: alive(s, "knight"), inGraveyard: inGraveyard(s, "ai", WHITE_KNIGHT.name) }).toEqual({ knight: false, inGraveyard: true });
  });
});

describe("⑤ the lifelink gain goes to the SOURCE'S controller (CR 702.15b) — Rakdos Charm's \"each creature deals 1 damage to its controller\"", () => {
  it("⭐ the opponent's Vampire Nighthawk deals 1 to the opponent, who gains 1; the caster gains nothing from it", () => {
    const charm = { id: "h-charm", ...RAKDOS_CHARM };
    const s0 = board({ user: [P("bears", GRIZZLY_BEARS, "user")], ai: [P("hawk", VAMPIRE_NIGHTHAWK, "ai")], hand: [charm] });
    const act = legalActionsForPlayer(s0, "user").find((a) => a.kind === "cast-spell" && a.cardId === "h-charm" && (a.chosenMode === 2 || a.mode === 2 || a.modeIndex === 2));
    expect(act, "Rakdos Charm's third mode is offered").toBeTruthy();
    const s = settle(dispatchAction(s0, act));
    noResolveErrors(s);
    expect({ ai: s.players.ai.life, user: s.players.user.life }).toEqual({ ai: 20, user: 19 });
  });
});

describe("⑥ the combat-damage relay is dealt by the creature that dealt the combat damage (Super State; Kediss's ruling: \"The damage the commander deals\")", () => {
  /** A four-seat Commander pod in the user's combat damage step: `attackerId` attacks ai1 unblocked; every seat at 40. */
  function pod(user, attackerId) {
    const s0 = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
    const s = { ...s0, turn: 4, activePlayer: "user", priorityHolder: "user", phase: "combat", step: "combat-damage", stack: [], pendingTriggers: [],
      combat: { attackers: [{ permanentId: attackerId, attackingPlayer: "user", defender: "ai1" }], blockers: [] },
      players: { ...s0.players, user: { ...s0.players.user, life: 40, battlefield: user } } };
    for (const id of ["ai1", "ai2", "ai3"]) s.players[id] = { ...s.players[id], life: 40, battlefield: [] };
    return s;
  }
  const lives = (s) => ({ user: s.players.user.life, ai1: s.players.ai1.life, ai2: s.players.ai2.life, ai3: s.players.ai3.life });

  it("⭐ Super State on Vampire Nighthawk: the 9/9 deals 9 to ai1 and the relay deals 9 to ai2 and ai3 — all of it lifelink (9 + 18 gained)", () => {
    const s0 = pod([P("hawk", VAMPIRE_NIGHTHAWK, "user", { attachments: ["ss"] }), P("ss", SUPER_STATE, "user", { attachedTo: "hawk" })], "hawk");
    const s = settle(resolveCombatDamage(s0, { firstStrikeStep: true }));
    noResolveErrors(s);
    expect(lives(s)).toEqual({ user: 67, ai1: 31, ai2: 31, ai3: 31 });
  });
  it("⭐ Kediss with a lifelink commander (Brion Stoutarm) connecting for 4: the commander deals the relay, its controller gains 4 + 8", () => {
    const s0 = pod([P("kd", KEDISS, "user"), P("brion", { ...BRION_STOUTARM, isCommander: true }, "user")], "brion");
    const s = settle(resolveCombatDamage(s0));
    noResolveErrors(s);
    expect(lives(s)).toEqual({ user: 52, ai1: 36, ai2: 36, ai3: 36 });
  });
  it("CONTROL — Kediss wearing Basilisk Collar while a commander without lifelink connects: Kediss deals nothing, so nothing is gained", () => {
    const commander = { ...HILL_GIANT, name: "Hill Giant", isCommander: true };
    const s0 = equip(pod([P("kd", KEDISS, "user"), P("collar", BASILISK_COLLAR, "user"), P("cmd", commander, "user")], "cmd"), "collar", "kd");
    expect(permanentHasKeyword(s0, "kd", "Lifelink")).toBe(true);
    const s = settle(resolveCombatDamage(s0));
    noResolveErrors(s);
    expect(lives(s)).toEqual({ user: 40, ai1: 37, ai2: 37, ai3: 37 });
  });
});

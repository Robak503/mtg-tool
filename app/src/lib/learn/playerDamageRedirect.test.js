/**
 * playerDamageRedirect.test.js — "All damage that would be dealt to you is dealt to <enchanted|equipped|this> creature
 * instead." (shelf decks D42, 2026-10-01: Light-Paws Voltron's With Great Power . . .; the same line on Pariah, Pariah's
 * Shield, Empyrial Archangel and Protector of the Crown).
 *
 * CR 614.9: a redirection effect — the damage is dealt to the creature instead; if that is no longer a creature on the
 * battlefield, the effect does nothing. Both damage funnels apply it (spellEffects.applyDamageEffect, combatResolution).
 * In combat the redirected deal is the one an attacker makes to a blocker — protection, a shield counter, Maze of Ith's
 * stamp, deathtouch, infect — and no player is dealt damage, so nothing that keys on combat damage to a player fires.
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-10-01), except the synthetic noncreature that pins CR 614.9's guard.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent, findPermanent } from "./gameState.js";
import { chooseTriggerTargets, flushTriggers, resolveTopOfStack } from "./gameEngine.js";
import { resolveCombatDamage } from "./combatResolution.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { permanentPower, permanentToughness } from "./layers.js";
import { classifyCard } from "./coverage.js";
import { applyDamageEffect } from "./spellEffects.js";

beforeEach(() => _resetIdsForTests());

const WGP = { name: "With Great Power . . .", type: "Enchantment — Aura", mana: "{3}{W}", keywords: ["Enchant"],
  oracle: "Enchant creature you control\nEnchanted creature gets +2/+2 for each Aura and Equipment attached to it.\nAll damage that would be dealt to you is dealt to enchanted creature instead." };
const PARIAH = { name: "Pariah", type: "Enchantment — Aura", mana: "{2}{W}", keywords: ["Enchant"], oracle: "Enchant creature\nAll damage that would be dealt to you is dealt to enchanted creature instead." };
const SHIELD = { name: "Pariah's Shield", type: "Artifact — Equipment", mana: "{5}", keywords: ["Equip"], oracle: "All damage that would be dealt to you is dealt to equipped creature instead.\nEquip {3}" };
const ARCHANGEL = { name: "Empyrial Archangel", type: "Creature — Angel", mana: "{4}{G}{W}{W}{U}", power: "5", toughness: "8", keywords: ["Flying", "Shroud"],
  oracle: "Flying\nShroud (This creature can't be the target of spells or abilities.)\nAll damage that would be dealt to you is dealt to this creature instead." };
const PROTECTOR = { name: "Protector of the Crown", type: "Creature — Giant Soldier", mana: "{5}{W}", power: "2", toughness: "5", keywords: [],
  oracle: "When this creature enters, you become the monarch.\nAll damage that would be dealt to you is dealt to this creature instead." };
const BODYGUARD = { name: "Veteran Bodyguard", type: "Creature — Human", mana: "{3}{W}{W}", power: "2", toughness: "5", keywords: [],
  oracle: "As long as this creature is untapped, all damage that would be dealt to you by unblocked creatures is dealt to this creature instead." };
const PALISADE = { name: "Palisade Giant", type: "Creature — Giant Soldier", mana: "{4}{W}{W}", power: "2", toughness: "7", keywords: [],
  oracle: "All damage that would be dealt to you and other permanents you control is dealt to this creature instead." };
const BEARS = { name: "Grizzly Bears", type: "Creature — Bear", mana: "{1}{G}", power: "2", toughness: "2", keywords: [], oracle: "" };
const CRUSADER = { name: "Mirran Crusader", type: "Creature — Human Knight", mana: "{1}{W}{W}", power: "2", toughness: "2", keywords: ["Protection", "Double strike"],
  oracle: "Double strike, protection from black and from green" };
const SCROLL_THIEF = { name: "Scroll Thief", type: "Creature — Merfolk Rogue", mana: "{2}{U}", power: "1", toughness: "3", keywords: [], oracle: "Whenever this creature deals combat damage to a player, draw a card." };
const RATS = { name: "Typhoid Rats", type: "Creature — Rat", mana: "{B}", power: "1", toughness: "1", keywords: ["Deathtouch"], oracle: "Deathtouch (Any amount of damage this deals to a creature is enough to destroy it.)" };
const ELF = { name: "Glistener Elf", type: "Creature — Phyrexian Elf Warrior", mana: "{G}", power: "1", toughness: "1", keywords: ["Infect"],
  oracle: "Infect (This creature deals damage to creatures in the form of -1/-1 counters and to players in the form of poison counters.)" };
const SENGIR = { name: "Sengir Vampire", type: "Creature — Vampire", mana: "{3}{B}{B}", power: "4", toughness: "4", keywords: ["Flying"],
  oracle: "Flying (This creature can't be blocked except by creatures with flying or reach.)\nWhenever a creature dealt damage by this creature this turn dies, put a +1/+1 counter on this creature." };
const BOLT = { name: "Lightning Bolt", type: "Instant", mana: "{R}", keywords: [], oracle: "Lightning Bolt deals 3 damage to any target." };
const IDOL = { name: "Test Idol", type: "Artifact", mana: "{3}", keywords: [], oracle: "All damage that would be dealt to you is dealt to this creature instead." };

const perm = (id, card, controller, extra = {}) => ({ ...createPermanent({ id, card: { ...card, id: `c-${id}` }, controller, summoningSick: false }), ...extra });
/** The user's HOST (a Bear unless named) wearing `aura` — With Great Power . . . by default (one attachment: a 4/4 Bear). */
const enchanted = (aura = WGP, hostCard = BEARS, hostExtra = {}) => [
  perm("HOST", hostCard, "user", { attachments: ["AURA"], ...hostExtra }), perm("AURA", aura, "user", { attachedTo: "HOST" })];
function table({ user = [], ai = [], aiLibrary = [] } = {}) {
  const g = createGameState({ userDeck: [], aiDeck: [] });
  return { ...g, turn: 5, activePlayer: "ai", priorityHolder: "ai", consecutivePasses: 0, phase: "precombat-main", step: "main", stack: [], pendingTriggers: [],
    players: { ...g.players, user: { ...g.players.user, life: 40, battlefield: user }, ai: { ...g.players.ai, life: 40, battlefield: ai, library: aiLibrary } } };
}
/** Resolve everything pending; fail loudly on a logged resolver crash. */
function settle(s) {
  let n = s, g = 0;
  while ((n.stack?.length || n.pendingTriggers?.length) && !n.pendingChoice && g++ < 30) n = n.stack?.length ? resolveTopOfStack(n) : flushTriggers(n, { chooseTargets: chooseTriggerTargets });
  const crash = (n.log || []).find((e) => e.kind === "stack-resolve-error");
  if (crash) throw new Error(`a resolver crashed: ${crash.error}`);
  return n;
}
/** The AI's ATTACKER hits the user unblocked; combat damage and every trigger it raises are settled. */
const attack = (s) => settle(resolveCombatDamage({ ...s, phase: "combat", step: "combat-damage",
  combat: { attackers: [{ permanentId: "ATTACKER", attackingPlayer: "ai", defender: "user" }], blockers: [] } }));
/** The AI casts Lightning Bolt at the user, through the real cast path. */
function boltTheUser(s) {
  const s1 = { ...s, players: { ...s.players, ai: { ...s.players.ai, hand: [{ ...BOLT, id: "bolt" }], manaPool: { ...s.players.ai.manaPool, R: 1 } } } };
  const cast = legalActionsForPlayer(s1, "ai").find((a) => a.kind === "cast-spell" && a.cardId === "bolt" && a.targets?.[0]?.type === "player" && a.targets[0].id === "user");
  if (!cast) throw new Error("Lightning Bolt at the user is not offered");
  return settle(dispatchAction(s1, cast));
}
const marked = (s, id) => findPermanent(s, id)?.permanent?.damageMarked ?? 0;

describe("the cards", () => {
  it("all five read native; the redirect line is admitted by the Aura, Equipment and creature gates", () => {
    expect([WGP, PARIAH, SHIELD, ARCHANGEL, PROTECTOR].map((c) => `${c.name}: ${classifyCard(c)}`)).toEqual([
      "With Great Power . . .: native-aura", "Pariah: native-aura", "Pariah's Shield: native-equipment",
      "Empyrial Archangel: native-static", "Protector of the Crown: native-mixed"]);
  });

  it("fences (real): a conditional, filtered redirect and a wider-scope one stay unread", () => {
    expect([classifyCard(BODYGUARD), classifyCard(PALISADE)]).toEqual(["body-only", "body-only"]);
  });

  it("With Great Power . . . keeps its +2/+2 for each Aura and Equipment attached", () => {
    const s = table({ user: enchanted() });
    expect([permanentPower(s, "HOST"), permanentToughness(s, "HOST")]).toEqual([4, 4]);
  });
});

describe("combat damage", () => {
  it("an unblocked attacker's damage lands on the enchanted creature, not the player (WITNESS)", () => {
    const s = attack(table({ user: enchanted(), ai: [perm("ATTACKER", BEARS, "ai")] }));
    const witness = { userLife: s.players.user.life, hostDamage: marked(s, "HOST") };
    console.log(`WITNESS playerDamageRedirect ${JSON.stringify(witness)}`);
    expect(witness).toEqual({ userLife: 40, hostDamage: 2 });
  });

  it("no player was dealt damage: no 'deals combat damage to a player' trigger, no commander damage", () => {
    const s = attack(table({ user: enchanted(), ai: [perm("ATTACKER", { ...SCROLL_THIEF, isCommander: true }, "ai")], aiLibrary: [{ ...BEARS, id: "lib1" }] }));
    expect({ userLife: s.players.user.life, hostDamage: marked(s, "HOST"), aiHand: s.players.ai.hand.length, commanderDamage: Object.values(s.players.user.commanderDamageFrom || {}) })
      .toEqual({ userLife: 40, hostDamage: 1, aiHand: 0, commanderDamage: [] });
  });

  it("deathtouch carries: Typhoid Rats' 1 redirected damage destroys the 4/4", () => {
    const s = attack(table({ user: enchanted(), ai: [perm("ATTACKER", RATS, "ai")] }));
    expect({ userLife: s.players.user.life, hostAlive: !!findPermanent(s, "HOST"), graveyard: s.players.user.graveyard.map((c) => c.name).sort() })
      .toEqual({ userLife: 40, hostAlive: false, graveyard: ["Grizzly Bears", "With Great Power . . ."] });
  });

  it("infect carries: Glistener Elf puts a -1/-1 counter on the creature and no poison on the player", () => {
    const s = attack(table({ user: enchanted(), ai: [perm("ATTACKER", ELF, "ai")] }));
    expect({ poison: s.players.user.poison || 0, minus: findPermanent(s, "HOST").permanent.counters?.["-1/-1"] ?? 0, life: s.players.user.life })
      .toEqual({ poison: 0, minus: 1, life: 40 });
  });

  it("the creature's protection prevents it: a green Bear's damage to Mirran Crusader is prevented (CR 702.16e)", () => {
    const s = attack(table({ user: enchanted(WGP, CRUSADER), ai: [perm("ATTACKER", BEARS, "ai")] }));
    expect({ userLife: s.players.user.life, hostDamage: marked(s, "HOST") }).toEqual({ userLife: 40, hostDamage: 0 });
  });

  it("the creature's own prevention applies: a prevent-the-next-2 shield on it soaks the redirected 2 (CR 615)", () => {
    const s0 = table({ user: enchanted(), ai: [perm("ATTACKER", BEARS, "ai")] });
    const s = attack({ ...s0, preventionShields: [{ targetKind: "creature", targetId: "HOST", amount: 2, turn: 5 }] });
    expect({ userLife: s.players.user.life, hostDamage: marked(s, "HOST") }).toEqual({ userLife: 40, hostDamage: 0 });
  });

  it("a shield counter prevents it and is spent (CR 122.1c)", () => {
    const s = attack(table({ user: enchanted(WGP, BEARS, { counters: { shield: 1 } }), ai: [perm("ATTACKER", BEARS, "ai")] }));
    expect({ userLife: s.players.user.life, hostDamage: marked(s, "HOST"), shield: findPermanent(s, "HOST").permanent.counters?.shield ?? 0 })
      .toEqual({ userLife: 40, hostDamage: 0, shield: 0 });
  });

  it("the attacker is recorded as the damage's source: Sengir Vampire grows when the 4/4 it was redirected onto dies", () => {
    const s = attack(table({ user: enchanted(), ai: [perm("ATTACKER", SENGIR, "ai")] }));
    expect({ userLife: s.players.user.life, hostAlive: !!findPermanent(s, "HOST"), sengir: findPermanent(s, "ATTACKER").permanent.counters?.["+1/+1"] ?? 0 })
      .toEqual({ userLife: 40, hostAlive: false, sengir: 1 });
  });

  it("a creature stamped to take no combat damage this turn (Maze of Ith) takes none", () => {
    const s = attack(table({ user: enchanted(WGP, BEARS, { takesNoCombatDamageTurn: 5 }), ai: [perm("ATTACKER", BEARS, "ai")] }));
    expect({ userLife: s.players.user.life, hostDamage: marked(s, "HOST") }).toEqual({ userLife: 40, hostDamage: 0 });
  });
});

describe("non-combat damage", () => {
  it("Lightning Bolt at the player hits the enchanted creature instead", () => {
    const s = boltTheUser(table({ user: enchanted() }));
    expect({ userLife: s.players.user.life, hostDamage: marked(s, "HOST") }).toEqual({ userLife: 40, hostDamage: 3 });
  });

  it("Pariah on an OPPONENT's creature sends the Bolt there — 'you' is Pariah's controller", () => {
    const s = boltTheUser(table({ user: [perm("AURA", PARIAH, "user", { attachedTo: "THEIRS" })], ai: [perm("THEIRS", BEARS, "ai", { attachments: ["AURA"] })] }));
    expect({ userLife: s.players.user.life, theirBearAlive: !!findPermanent(s, "THEIRS") }).toEqual({ userLife: 40, theirBearAlive: false });
  });

  it("Pariah's Shield sends it to the equipped creature; Empyrial Archangel takes it itself", () => {
    const shield = boltTheUser(table({ user: [perm("HOST", BEARS, "user", { attachments: ["EQ"] }), perm("EQ", SHIELD, "user", { attachedTo: "HOST" })] }));
    const angel = boltTheUser(table({ user: [perm("ANGEL", ARCHANGEL, "user")] }));
    expect({ shieldLife: shield.players.user.life, shieldHostAlive: !!findPermanent(shield, "HOST"), angelLife: angel.players.user.life, angelDamage: marked(angel, "ANGEL") })
      .toEqual({ shieldLife: 40, shieldHostAlive: false, angelLife: 40, angelDamage: 3 });
  });

  it("a per-opponent amount follows the redirect: Molten Psyche's metalcraft damage is that player's own drawn count", () => {
    const s0 = table({ user: enchanted() });
    const s1 = { ...s0, players: { ...s0.players, user: { ...s0.players.user, cardsDrawnThisTurn: 3 } } };
    const s = applyDamageEffect(s1, { controller: "ai", amount: 0, targetType: "eachOpponent", amountPerOpponent: "cardsDrawnThisTurn" });
    expect({ userLife: s.players.user.life, hostDamage: marked(s, "HOST") }).toEqual({ userLife: 40, hostDamage: 3 });
  });

  it("not onto a creature with protection here: the spell's colours aren't threaded, so the player takes it (an under-delivery)", () => {
    const s = boltTheUser(table({ user: enchanted(WGP, CRUSADER) }));
    expect({ userLife: s.players.user.life, hostDamage: marked(s, "HOST") }).toEqual({ userLife: 37, hostDamage: 0 });
  });

  it("CR 614.9 (synthetic): a redirect whose recipient is not a creature does nothing", () => {
    const s = boltTheUser(table({ user: [perm("IDOL", IDOL, "user")] }));
    expect({ userLife: s.players.user.life, idolDamage: marked(s, "IDOL") }).toEqual({ userLife: 37, idolDamage: 0 });
  });
});

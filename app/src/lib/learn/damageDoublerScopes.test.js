/**
 * damageDoublerScopes.test.js — five more printed scopes on the damage-replacement consult (CR 614 — shelf decks D11,
 * 2026-09-30: Raphael, the Muscle in Halfshell heroes; Mjölnir, Hammer of Thor in Captain America).
 *
 *   · creatures you control WITH COUNTERS on them (Raphael — any kind of counter)
 *   · CREATURE sources you control (Absorbing Man and Titania)
 *   · a <Subtype> source you control (Calamity Bearer — Giants)
 *   · damage TO AN OPPONENT (Fiendish Duo — players only)
 *   · the EQUIPPED creature (Mjölnir — read live off the Equipment)
 * plus COMPOSITION in coverage (a doubler beside other text that is itself fully modeled reads native-mixed), Mjölnir's
 * "Equip worthy" (its reminder's definition: a legendary non-Villain that's red and/or white), and a shipped false
 * positive closed: Goblin Goliath's ACTIVATED "…this turn, it deals double…" was parsed as a static and doubled every
 * source its controller controls from the moment it entered.
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-09-30).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { resolveCombatDamage } from "./combatResolution.js";
import { applyDamageEffect } from "./spellEffects.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { parseDamageReplacements } from "./damageReplacements.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const RAPHAEL = { name: "Raphael, the Muscle", type: "Legendary Creature — Mutant Ninja Turtle", mana: "{4}{R}", power: "4", toughness: "4", keywords: ["Partner", "Double"],
  oracle: "Double all damage that creatures you control with counters on them would deal.\nWhen Raphael enters, create a Mutagen token.\nPartner—Character select (You can have two commanders if both have this ability.)" };
const ABSORBING = { name: "Absorbing Man and Titania", type: "Legendary Creature — Human Villain", mana: "{3}{R}{G}", power: "4", toughness: "5", keywords: ["Double"],
  oracle: "Double all damage that creature sources you control would deal." };
const CALAMITY = { name: "Calamity Bearer", type: "Creature — Giant Berserker", mana: "{2}{R}{R}", power: "3", toughness: "4", keywords: ["Double"],
  oracle: "If a Giant source you control would deal damage to a permanent or player, it deals double that damage to that permanent or player instead." };
const FIENDISH = { name: "Fiendish Duo", type: "Creature — Devil", mana: "{4}{R}{R}", power: "5", toughness: "5", keywords: ["First strike", "Double"],
  oracle: "First strike (This creature deals combat damage before creatures without first strike.)\nIf a source would deal damage to an opponent, it deals double that damage to that player instead." };
const MJOLNIR = { name: "Mjölnir, Hammer of Thor", type: "Legendary Artifact — Equipment", mana: "{3}{R}", keywords: ["Double"],
  oracle: "When Mjölnir enters, it deals 4 damage to up to one target creature.\nDouble all damage equipped creature would deal.\nEquip worthy {1} (A creature is worthy if it's a legendary non-Villain that's red and/or white.)\n{2}{R}, Discard this card: It deals 2 damage to each creature." };
const GOLIATH = { name: "Goblin Goliath", type: "Creature — Goblin Mutant", mana: "{4}{R}{R}", power: "5", toughness: "4", keywords: ["Double"],
  oracle: "When this creature enters, create a number of 1/1 red Goblin creature tokens equal to the number of opponents you have.\n{3}{R}, {T}: If a source you control would deal damage to an opponent this turn, it deals double that damage to that player instead." };
const SOUND_OF_DRUMS = { name: "The Sound of Drums", type: "Enchantment — Aura", mana: "{2}{R}", keywords: ["Goad", "Enchant", "Double"],
  oracle: "Enchant creature\nEnchanted creature is goaded.\nIf enchanted creature would deal combat damage to a permanent or player, it deals double that damage instead.\n{2}{R}: Return this card from your graveyard to your hand." };
const bear = (name = "Grizzly Bears", type = "Creature — Bear", extra = {}) => ({ name, type, mana: "{1}{G}", power: "2", toughness: "2", keywords: [], oracle: "", ...extra });

const perm = (id, card, controller, extra = {}) => ({ ...createPermanent({ id, card: { ...card, id: `c-${id}` }, controller, summoningSick: false }), ...extra });
/** A combat where each of `attackerIds` (the user's) is unblocked, attacking the AI. */
function combatOf(userBf, aiBf, attackerIds) {
  const g = createGameState({ userDeck: [], aiDeck: [] });
  return { ...g, turn: 3, activePlayer: "user",
    players: { ...g.players, user: { ...g.players.user, battlefield: userBf }, ai: { ...g.players.ai, battlefield: aiBf } },
    combat: { attackers: attackerIds.map((id) => ({ permanentId: id, attackingPlayer: "user", defender: "ai" })), blockers: [] } };
}
const aiLoss = (s) => s.players.ai.life - resolveCombatDamage(s).players.ai.life;

describe("⭐ the scopes, through real combat damage", () => {
  it("⭐ Raphael: a creature you control WITH A COUNTER of any kind deals double; one without deals single", () => {
    const withOil = aiLoss(combatOf([perm("raph", RAPHAEL, "user"), perm("b", bear(), "user", { counters: { oil: 1 } })], [], ["b"]));
    const withPlus = aiLoss(combatOf([perm("raph", RAPHAEL, "user"), perm("b", bear(), "user", { counters: { "+1/+1": 1 } })], [], ["b"]));
    const bare = aiLoss(combatOf([perm("raph", RAPHAEL, "user"), perm("b", bear(), "user")], [], ["b"]));
    const row = { oilCounter: withOil, plusCounter: withPlus, noCounter: bare };
    console.log(`WITNESS raphael ${JSON.stringify(row)}`);
    expect(row).toEqual({ oilCounter: 4, plusCounter: 6, noCounter: 2 });   // 2×2 · (2+1)×2 · 2
  });
  it("Absorbing Man and Titania: creature sources you control double; a noncreature source doesn't", () => {
    const s = combatOf([perm("am", ABSORBING, "user"), perm("b", bear(), "user"), perm("rock", { name: "Pinger", type: "Artifact", mana: "{1}", keywords: [], oracle: "" }, "user")], [], ["b"]);
    const artifactHit = s.players.ai.life - applyDamageEffect(s, { controller: "user", amount: 3, targets: [{ type: "player", id: "ai" }], source: s.players.user.battlefield[2] }).players.ai.life;
    expect({ creatureCombat: aiLoss(s), artifactAbility: artifactHit }).toEqual({ creatureCombat: 4, artifactAbility: 3 });
  });
  it("Calamity Bearer: your Giant doubles, your Bear doesn't", () => {
    const giant = bear("Hill Giant", "Creature — Giant", { power: "3", toughness: "3" });
    expect({ giant: aiLoss(combatOf([perm("cb", CALAMITY, "user"), perm("g", giant, "user")], [], ["g"])), bear: aiLoss(combatOf([perm("cb", CALAMITY, "user"), perm("b", bear(), "user")], [], ["b"])) })
      .toEqual({ giant: 6, bear: 2 });
  });
  it("Fiendish Duo: damage to an OPPONENT doubles; damage to you, or to a creature, doesn't", () => {
    const s = combatOf([perm("fd", FIENDISH, "user"), perm("b", bear(), "user")], [perm("ab", bear(), "ai")], ["b"]);
    const toMe = s.players.user.life - applyDamageEffect(s, { controller: "ai", amount: 3, targets: [{ type: "player", id: "user" }] }).players.user.life;
    const toTheirBear = applyDamageEffect(s, { controller: "user", amount: 1, targets: [{ type: "creature", id: "ab" }] }).players.ai.battlefield.find((p) => p.id === "ab")?.damageMarked;
    expect({ toOpponent: aiLoss(s), toMe, toTheirBear }).toEqual({ toOpponent: 4, toMe: 3, toTheirBear: 1 });
  });
  it("⭐ Mjölnir: the EQUIPPED creature doubles, another creature doesn't, and an unattached hammer doubles nothing", () => {
    const hero = bear("Hero Bear", "Legendary Creature — Bear Hero", { colors: ["R"] });
    const equipped = combatOf([perm("h", hero, "user", { attachments: ["mj"] }), perm("mj", MJOLNIR, "user", { attachedTo: "h" }), perm("b", bear(), "user")], [], ["h", "b"]);
    const loose = combatOf([perm("h", hero, "user"), perm("mj", MJOLNIR, "user")], [], ["h"]);
    expect({ equippedPlusOther: aiLoss(equipped), unattached: aiLoss(loose) }).toEqual({ equippedPlusOther: 6, unattached: 2 });   // 2×2 + 2 · 2
  });
});

describe("Equip worthy (Mjölnir's reminder: a legendary non-Villain that's red and/or white)", () => {
  it("offers equip to a legendary red or white non-Villain only", () => {
    const g = createGameState({ userDeck: [], aiDeck: [] });
    const guys = [
      ["redLegend", bear("Red Legend", "Legendary Creature — Human Hero", { colors: ["R"] })],
      ["whiteLegend", bear("White Legend", "Legendary Creature — Human Soldier", { colors: ["W"] })],
      ["greenLegend", bear("Green Legend", "Legendary Creature — Elf", { colors: ["G"] })],
      ["redVillain", bear("Red Villain", "Legendary Creature — Human Villain", { colors: ["R"] })],
      ["redCommon", bear("Red Common", "Creature — Human", { colors: ["R"] })],
    ];
    const s = { ...g, turn: 3, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main", stack: [],
      players: { ...g.players, user: { ...g.players.user, battlefield: [perm("mj", MJOLNIR, "user"), ...guys.map(([id, c]) => perm(id, c, "user"))], manaPool: { ...g.players.user.manaPool, R: 1 } } } };
    const offered = legalActionsForPlayer(s, "user").filter((a) => a.kind === "activate-ability" && a.permanentId === "mj").flatMap((a) => (a.targets || []).map((t) => t.id)).sort();
    expect(offered).toEqual(["redLegend", "whiteLegend"]);
  });
});

describe("⚠️ the shipped false positive — Goblin Goliath's ACTIVATED doubler was read as a static", () => {
  it("⭐ with Goliath on the battlefield and never activated, your creature deals its normal damage", () => {
    const row = { parsed: parseDamageReplacements(GOLIATH), loss: aiLoss(combatOf([perm("gg", GOLIATH, "user"), perm("b", bear(), "user")], [], ["b"])) };
    console.log(`WITNESS goliath ${JSON.stringify(row)}`);
    expect(row).toEqual({ parsed: [], loss: 2 });
  });
});

describe("guards no printed card reaches today (synthetic shapes, labeled)", () => {
  it("a doubler sentence as a TRIGGER's effect is not a static either", () => {
    expect(parseDamageReplacements({ name: "Fake Drummer", type: "Creature — Goblin", oracle: "Whenever you cast a spell, if a source you control would deal damage this turn, it deals double that damage instead." })).toEqual([]);
  });
  it("'Equip worthy' with any definition but Mjölnir's is not modeled", () => {
    // The ONLY difference from Mjölnir is the definition (the self-name is renamed throughout, or the renamed card's
    // enters trigger would park it for an unrelated reason — the first version of this pin did exactly that).
    const renamed = { ...MJOLNIR, name: "Fake Hammer", oracle: MJOLNIR.oracle.replaceAll("Mjölnir", "Fake Hammer") };
    const foreign = { ...renamed, oracle: renamed.oracle.replace("red and/or white", "blue") };
    expect({ control: classifyCard(renamed), foreign: classifyCard(foreign) }).toEqual({ control: "native-mixed", foreign: "body-only" });
  });
});

describe("the cards", () => {
  it("the five read native (two by composition); Goliath and The Sound of Drums stay parked", () => {
    expect([RAPHAEL, MJOLNIR, ABSORBING, FIENDISH, CALAMITY, GOLIATH, SOUND_OF_DRUMS].map((c) => classifyCard(c)))
      .toEqual(["native-mixed", "native-mixed", "native-static", "native-static", "native-static", "body-only", "body-only"]);
  });
});

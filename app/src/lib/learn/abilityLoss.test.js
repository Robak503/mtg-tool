/**
 * abilityLoss.test.js — the ability-loss program's S0a core (docs/orchestration/ABILITY-LOSS-PROGRAM.md §1, §5): the layer-6
 * `loseAllAbilities` op, abilityLossOf and its board fast path, the stripped view (abilityCardOf / withAbilityLoss), the collection
 * filter, the grant cutoff, the keyword / protection / gate seeds, the name-keyed tables, and the four layer prerequisites — attach
 * timestamps (CR 613.7e), layer 4 in timestamp order (CR 613.7), counter timestamps (CR 613.7c), setCardTypes and the
 * replace-every-creature-type op (CR 205.1a), both mirrored in the recursion-free identity read the lords use.
 *
 * No parser emits the op (every shape is off — abilityLossShapes.js): the loss is injected through addContinuousEffect, as a stored
 * effect, exactly as a resolved spell's would be. The witnesses read through the PUBLIC readers that existed before the slice
 * (permanentHasKeyword, deriveCharacteristics, the protection reads, the granted-ability reads, manaProduction, manaSources,
 * emptyManaPools), so on the base commit they fail on their assertions — the loss is an unknown op there and changes nothing. The
 * new exports are read through the module namespace (`L.abilityCardOf`), so the file loads on the base too. The controls — the
 * board fast path, a loss on another permanent, a grant after the loss, the layer 1–5 effects a lost permanent keeps — pass on both.
 *
 * The cards are real bundled cards (cardIndex.publicCard → learnDeckEnrich.mergeCardData), generated, never typed.
 */
import { beforeEach, describe, expect, it } from "vitest";
import * as L from "./layers.js";
import * as G from "./gameState.js";
import * as M from "./manaModel.js";
import * as CE from "./cardEffects.js";
import * as GE from "./gameEngine.js";
import { applySuspect } from "./effects/atoms/suspect.js";
import { hasKeyword, COMBAT_KEYWORDS, GRANTABLE_STATIC_KEYWORDS } from "./keywords.js";
import { parseProtectionColors, parseProtectionClasses } from "./protection.js";
import { faceUpView } from "./faceUp.js";

beforeEach(() => G._resetIdsForTests());

// ─── the corpus sample (bundled Scryfall data — generated, never typed) ────────────────────────────────────────────────────────
const CORPUS = [
// 67 cards: the carriers of each reader (keywords, protection, statics, mana, types) and the family the program credits later
  {"name":"Serra Angel","type":"Creature — Angel","mana":"{3}{W}{W}","oracle":"Flying\nVigilance (Attacking doesn't cause this creature to tap.)","layout":"normal","cmc":5,"power":"4","toughness":"4","loyalty":null,"keywords":["Flying","Vigilance"],"colors":["W"],"colorIdentity":["W"]},
  {"name":"Baneslayer Angel","type":"Creature — Angel","mana":"{3}{W}{W}","oracle":"Flying, first strike, lifelink, protection from Demons and from Dragons","layout":"normal","cmc":5,"power":"5","toughness":"5","loyalty":null,"keywords":["Flying","Lifelink","First strike","Protection"],"colors":["W"],"colorIdentity":["W"]},
  {"name":"Vampire Nighthawk","type":"Creature — Vampire Shaman","mana":"{1}{B}{B}","oracle":"Flying\nDeathtouch (Any amount of damage this deals to a creature is enough to destroy it.)\nLifelink (Damage dealt by this creature also causes you to gain that much life.)","layout":"normal","cmc":3,"power":"2","toughness":"3","loyalty":null,"keywords":["Deathtouch","Flying","Lifelink"],"colors":["B"],"colorIdentity":["B"]},
  {"name":"Akroma, Angel of Wrath","type":"Legendary Creature — Angel","mana":"{5}{W}{W}{W}","oracle":"Flying, first strike, vigilance, trample, haste, protection from black and from red","layout":"normal","cmc":8,"power":"6","toughness":"6","loyalty":null,"keywords":["Flying","Vigilance","First strike","Protection","Haste","Trample"],"colors":["W"],"colorIdentity":["W"]},
  {"name":"Silver Knight","type":"Creature — Human Knight","mana":"{W}{W}","oracle":"First strike, protection from red","layout":"normal","cmc":2,"power":"2","toughness":"2","loyalty":null,"keywords":["First strike","Protection"],"colors":["W"],"colorIdentity":["W"]},
  {"name":"Progenitus","type":"Legendary Creature — Hydra Avatar","mana":"{W}{W}{U}{U}{B}{B}{R}{R}{G}{G}","oracle":"Protection from everything\nIf Progenitus would be put into a graveyard from anywhere, reveal Progenitus and shuffle it into its owner's library instead.","layout":"normal","cmc":10,"power":"10","toughness":"10","loyalty":null,"keywords":["Protection"],"colors":["B","G","R","U","W"],"colorIdentity":["B","G","R","U","W"]},
  {"name":"Iridescent Angel","type":"Creature — Angel","mana":"{5}{W}{U}","oracle":"Flying, protection from each color","layout":"normal","cmc":7,"power":"4","toughness":"4","loyalty":null,"keywords":["Flying","Protection"],"colors":["U","W"],"colorIdentity":["U","W"]},
  {"name":"Commander Eesha","type":"Legendary Creature — Bird Soldier","mana":"{2}{W}{W}","oracle":"Flying, protection from creatures","layout":"normal","cmc":4,"power":"2","toughness":"4","loyalty":null,"keywords":["Flying","Protection"],"colors":["W"],"colorIdentity":["W"]},
  {"name":"Mystic Crusader","type":"Creature — Human Nomad Mystic","mana":"{1}{W}{W}","oracle":"Protection from black and from red\nThreshold — As long as there are seven or more cards in your graveyard, this creature gets +1/+1 and has flying.","layout":"normal","cmc":3,"power":"2","toughness":"1","loyalty":null,"keywords":["Protection","Threshold"],"colors":["W"],"colorIdentity":["W"]},
  {"name":"Blood Baron of Vizkopa","type":"Creature — Vampire","mana":"{3}{W}{B}","oracle":"Lifelink, protection from white and from black\nAs long as you have 30 or more life and an opponent has 10 or less life, this creature gets +6/+6 and has flying.","layout":"normal","cmc":5,"power":"4","toughness":"4","loyalty":null,"keywords":["Lifelink","Protection"],"colors":["B","W"],"colorIdentity":["B","W"]},
  {"name":"Invisible Stalker","type":"Creature — Human Rogue","mana":"{1}{U}","oracle":"Hexproof (This creature can't be the target of spells or abilities your opponents control.)\nThis creature can't be blocked.","layout":"normal","cmc":2,"power":"1","toughness":"1","loyalty":null,"keywords":["Hexproof"],"colors":["U"],"colorIdentity":["U"]},
  {"name":"Dauthi Slayer","type":"Creature — Dauthi Soldier","mana":"{B}{B}","oracle":"Shadow (This creature can block or be blocked by only creatures with shadow.)\nThis creature attacks each combat if able.","layout":"normal","cmc":2,"power":"2","toughness":"2","loyalty":null,"keywords":["Shadow"],"colors":["B"],"colorIdentity":["B"]},
  {"name":"Bog Wraith","type":"Creature — Wraith","mana":"{3}{B}","oracle":"Swampwalk (This creature can't be blocked as long as defending player controls a Swamp.)","layout":"normal","cmc":4,"power":"3","toughness":"3","loyalty":null,"keywords":["Landwalk","Swampwalk"],"colors":["B"],"colorIdentity":["B"]},
  {"name":"Sightless Ghoul","type":"Creature — Zombie Soldier","mana":"{3}{B}","oracle":"This creature can't block.\nUndying (When this creature dies, if it had no +1/+1 counters on it, return it to the battlefield under its owner's control with a +1/+1 counter on it.)","layout":"normal","cmc":4,"power":"2","toughness":"2","loyalty":null,"keywords":["Undying"],"colors":["B"],"colorIdentity":["B"]},
  {"name":"Elvish Archdruid","type":"Creature — Elf Druid","mana":"{1}{G}{G}","oracle":"Other Elf creatures you control get +1/+1.\n{T}: Add {G} for each Elf you control.","layout":"normal","cmc":3,"power":"2","toughness":"2","loyalty":null,"keywords":[],"colors":["G"],"colorIdentity":["G"]},
  {"name":"Lord of Atlantis","type":"Creature — Merfolk","mana":"{U}{U}","oracle":"Other Merfolk get +1/+1 and have islandwalk. (They can't be blocked as long as defending player controls an Island.)","layout":"normal","cmc":2,"power":"2","toughness":"2","loyalty":null,"keywords":[],"colors":["U"],"colorIdentity":["U"]},
  {"name":"Tarmogoyf","type":"Creature — Lhurgoyf","mana":"{1}{G}","oracle":"Tarmogoyf's power is equal to the number of card types among cards in all graveyards and its toughness is equal to that number plus 1.","layout":"normal","cmc":2,"power":"*","toughness":"1+*","loyalty":null,"keywords":[],"colors":["G"],"colorIdentity":["G"]},
  {"name":"Omnath, Locus of Mana","type":"Legendary Creature — Elemental","mana":"{2}{G}","oracle":"You don't lose unspent green mana as steps and phases end.\nOmnath gets +1/+1 for each unspent green mana you have.","layout":"normal","cmc":3,"power":"1","toughness":"1","loyalty":null,"keywords":[],"colors":["G"],"colorIdentity":["G"]},
  {"name":"Leyline of Sanctity","type":"Enchantment","mana":"{2}{W}{W}","oracle":"If this card is in your opening hand, you may begin the game with it on the battlefield.\nYou have hexproof. (You can't be the target of spells or abilities your opponents control.)","layout":"normal","cmc":4,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["W"],"colorIdentity":["W"]},
  {"name":"Teysa Karlov","type":"Legendary Creature — Human Advisor","mana":"{2}{W}{B}","oracle":"If a creature dying causes a triggered ability of a permanent you control to trigger, that ability triggers an additional time.\nCreature tokens you control have vigilance and lifelink.","layout":"normal","cmc":4,"power":"2","toughness":"4","loyalty":null,"keywords":[],"colors":["B","W"],"colorIdentity":["B","W"]},
  {"name":"Glorious Anthem","type":"Enchantment","mana":"{1}{W}{W}","oracle":"Creatures you control get +1/+1.","layout":"normal","cmc":3,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["W"],"colorIdentity":["W"]},
  {"name":"Tempered Steel","type":"Enchantment","mana":"{1}{W}{W}","oracle":"Artifact creatures you control get +2/+2.","layout":"normal","cmc":3,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["W"],"colorIdentity":["W"]},
  {"name":"Urborg, Tomb of Yawgmoth","type":"Legendary Land","mana":"","oracle":"Each land is a Swamp in addition to its other land types.","layout":"normal","cmc":0,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":[]},
  {"name":"Maze of Ith","type":"Land","mana":"","oracle":"{T}: Untap target attacking creature. Prevent all combat damage that would be dealt to and dealt by that creature this turn.","layout":"normal","cmc":0,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":[]},
  {"name":"Sol Ring","type":"Artifact","mana":"{1}","oracle":"{T}: Add {C}{C}.","layout":"normal","cmc":1,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":[]},
  {"name":"Forest","type":"Basic Land — Forest","mana":"","oracle":"({T}: Add {G}.)","layout":"normal","cmc":0,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":["G"]},
  {"name":"Snow-Covered Forest","type":"Basic Snow Land — Forest","mana":"","oracle":"({T}: Add {G}.)","layout":"normal","cmc":0,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":["G"]},
  {"name":"Tundra","type":"Land — Plains Island","mana":"","oracle":"({T}: Add {W} or {U}.)","layout":"normal","cmc":0,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":["U","W"]},
  {"name":"Bronzeplate Boar","type":"Artifact Creature — Equipment Boar","mana":"{2}{R}","oracle":"Trample\nEquipped creature gets +3/+2 and has trample.\nReconfigure {5} ({5}: Attach to target creature you control; or unattach from a creature. Reconfigure only as a sorcery. While attached, this isn't a creature.)","layout":"normal","cmc":3,"power":"3","toughness":"2","loyalty":null,"keywords":["Trample","Reconfigure"],"colors":["R"],"colorIdentity":["R"]},
  {"name":"Dryad Arbor","type":"Land Creature — Forest Dryad","mana":"","oracle":"(This land isn't a spell, it's affected by summoning sickness, and it has \"{T}: Add {G}.\")","layout":"normal","cmc":0,"power":"1","toughness":"1","loyalty":null,"keywords":[],"colors":["G"],"colorIdentity":["G"]},
  {"name":"Changeling Outcast","type":"Creature — Shapeshifter","mana":"{B}","oracle":"Changeling (This card is every creature type.)\nThis creature can't block and can't be blocked.","layout":"normal","cmc":1,"power":"1","toughness":"1","loyalty":null,"keywords":["Changeling"],"colors":["B"],"colorIdentity":["B"]},
  {"name":"Llanowar Elves","type":"Creature — Elf Druid","mana":"{G}","oracle":"{T}: Add {G}.","layout":"normal","cmc":1,"power":"1","toughness":"1","loyalty":null,"keywords":[],"colors":["G"],"colorIdentity":["G"]},
  {"name":"Karn, Silver Golem","type":"Legendary Artifact Creature — Golem","mana":"{5}","oracle":"Whenever Karn blocks or becomes blocked, it gets -4/+4 until end of turn.\n{1}: Target noncreature artifact becomes an artifact creature with power and toughness each equal to its mana value until end of turn.","layout":"normal","cmc":5,"power":"4","toughness":"4","loyalty":null,"keywords":[],"colors":[],"colorIdentity":[]},
  {"name":"Loxodon Warhammer","type":"Artifact — Equipment","mana":"{3}","oracle":"Equipped creature gets +3/+0 and has trample and lifelink.\nEquip {3}","layout":"normal","cmc":3,"power":null,"toughness":null,"loyalty":null,"keywords":["Equip"],"colors":[],"colorIdentity":[]},
  {"name":"Mtenda Herder","type":"Creature — Human Scout","mana":"{W}","oracle":"Flanking (Whenever a creature without flanking blocks this creature, the blocking creature gets -1/-1 until end of turn.)","layout":"normal","cmc":1,"power":"1","toughness":"1","loyalty":null,"keywords":["Flanking"],"colors":["W"],"colorIdentity":["W"]},
  {"name":"Noble Hierarch","type":"Creature — Human Druid","mana":"{G}","oracle":"Exalted (Whenever a creature you control attacks alone, that creature gets +1/+1 until end of turn.)\n{T}: Add {G}, {W}, or {U}.","layout":"normal","cmc":1,"power":"0","toughness":"1","loyalty":null,"keywords":["Exalted"],"colors":["G"],"colorIdentity":["G","U","W"]},
  {"name":"Heliod, God of the Sun","type":"Legendary Enchantment Creature — God","mana":"{3}{W}","oracle":"Indestructible\nAs long as your devotion to white is less than five, Heliod isn't a creature. (Each {W} in the mana costs of permanents you control counts toward your devotion to white.)\nOther creatures you control have vigilance.\n{2}{W}{W}: Create a 2/1 white Cleric enchantment creature token.","layout":"normal","cmc":4,"power":"5","toughness":"6","loyalty":null,"keywords":["Indestructible"],"colors":["W"],"colorIdentity":["W"]},
  {"name":"Delver of Secrets // Insectile Aberration","type":"Creature — Human Wizard // Creature — Human Insect","mana":"{U}","oracle":"Delver of Secrets - Creature — Human Wizard {U}\nAt the beginning of your upkeep, look at the top card of your library. You may reveal that card. If an instant or sorcery card is revealed this way, transform this creature.\n//\nInsectile Aberration - Creature — Human Insect \nFlying","layout":"transform","cmc":1,"power":"1","toughness":"1","loyalty":null,"keywords":["Flying","Transform"],"colors":[],"colorIdentity":["U"],"card_faces":[{"name":"Delver of Secrets","mana_cost":"{U}","colors":["U"]},{"name":"Insectile Aberration","mana_cost":"","colors":["U"]}]},
  {"name":"Westvale Abbey // Ormendahl, Profane Prince","type":"Land // Legendary Creature — Demon","mana":"","oracle":"Westvale Abbey - Land \n{T}: Add {C}.\n{5}, {T}, Pay 1 life: Create a 1/1 white and black Human Cleric creature token.\n{5}, {T}, Sacrifice five creatures: Transform this land, then untap it.\n//\nOrmendahl, Profane Prince - Legendary Creature — Demon \nFlying, lifelink, indestructible, haste","layout":"transform","cmc":0,"power":null,"toughness":null,"loyalty":null,"keywords":["Flying","Lifelink","Indestructible","Transform","Haste"],"colors":[],"colorIdentity":["B"],"card_faces":[{"name":"Westvale Abbey","mana_cost":"","colors":[]},{"name":"Ormendahl, Profane Prince","mana_cost":"","colors":["B"]}]},
  {"name":"Grizzly Bears","type":"Creature — Bear","mana":"{1}{G}","oracle":"","layout":"normal","cmc":2,"power":"2","toughness":"2","loyalty":null,"keywords":[],"colors":["G"],"colorIdentity":["G"]},
  {"name":"Mesa Enchantress","type":"Creature — Human Druid","mana":"{1}{W}{W}","oracle":"Whenever you cast an enchantment spell, you may draw a card.","layout":"normal","cmc":3,"power":"0","toughness":"2","loyalty":null,"keywords":[],"colors":["W"],"colorIdentity":["W"]},
  {"name":"Elvish Mystic","type":"Creature — Elf Druid","mana":"{G}","oracle":"{T}: Add {G}.","layout":"normal","cmc":1,"power":"1","toughness":"1","loyalty":null,"keywords":[],"colors":["G"],"colorIdentity":["G"]},
  {"name":"Ornithopter","type":"Artifact Creature — Thopter","mana":"{0}","oracle":"Flying","layout":"normal","cmc":0,"power":"0","toughness":"2","loyalty":null,"keywords":["Flying"],"colors":[],"colorIdentity":[]},
  {"name":"Coral Merfolk","type":"Creature — Merfolk","mana":"{1}{U}","oracle":"","layout":"normal","cmc":2,"power":"2","toughness":"1","loyalty":null,"keywords":[],"colors":["U"],"colorIdentity":["U"]},
  {"name":"Solid Footing","type":"Enchantment — Aura","mana":"{W}","oracle":"Flash\nEnchant creature\nEnchanted creature gets +1/+1.\nAs long as enchanted creature has vigilance, it assigns combat damage equal to its toughness rather than its power.","layout":"normal","cmc":1,"power":null,"toughness":null,"loyalty":null,"keywords":["Enchant","Flash"],"colors":["W"],"colorIdentity":["W"]},
  {"name":"Cobbled Wings","type":"Artifact — Equipment","mana":"{2}","oracle":"Equipped creature has flying.\nEquip {1} ({1}: Attach to target creature you control. Equip only as a sorcery.)","layout":"normal","cmc":2,"power":null,"toughness":null,"loyalty":null,"keywords":["Equip"],"colors":[],"colorIdentity":[]},
  {"name":"Lignify","type":"Kindred Enchantment — Treefolk Aura","mana":"{1}{G}","oracle":"Enchant creature\nEnchanted creature is a Treefolk with base power and toughness 0/4 and loses all abilities.","layout":"normal","cmc":2,"power":null,"toughness":null,"loyalty":null,"keywords":["Enchant"],"colors":["G"],"colorIdentity":["G"]},
  {"name":"Kenrith's Transformation","type":"Enchantment — Aura","mana":"{1}{G}","oracle":"Enchant creature\nWhen this Aura enters, draw a card.\nEnchanted creature loses all abilities and is a green Elk creature with base power and toughness 3/3. (It loses all other card types and creature types.)","layout":"normal","cmc":2,"power":null,"toughness":null,"loyalty":null,"keywords":["Enchant"],"colors":["G"],"colorIdentity":["G"]},
  {"name":"Darksteel Mutation","type":"Enchantment — Aura","mana":"{1}{W}","oracle":"Enchant creature\nEnchanted creature is an Insect artifact creature with base power and toughness 0/1 and has indestructible, and it loses all other abilities, card types, and creature types.","layout":"normal","cmc":2,"power":null,"toughness":null,"loyalty":null,"keywords":["Enchant"],"colors":["W"],"colorIdentity":["W"]},
  {"name":"Imprisoned in the Moon","type":"Enchantment — Aura","mana":"{2}{U}","oracle":"Enchant creature, land, or planeswalker\nEnchanted permanent is a colorless land with \"{T}: Add {C}\" and loses all other card types and abilities.","layout":"normal","cmc":3,"power":null,"toughness":null,"loyalty":null,"keywords":["Enchant"],"colors":["U"],"colorIdentity":["U"]},
  {"name":"Turn to Frog","type":"Instant","mana":"{1}{U}","oracle":"Until end of turn, target creature loses all abilities and becomes a blue Frog with base power and toughness 1/1.","layout":"normal","cmc":2,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["U"],"colorIdentity":["U"]},
  {"name":"Humility","type":"Enchantment","mana":"{2}{W}{W}","oracle":"All creatures lose all abilities and have base power and toughness 1/1.","layout":"normal","cmc":4,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["W"],"colorIdentity":["W"]},
  {"name":"Blood Sun","type":"Enchantment","mana":"{2}{R}","oracle":"When this enchantment enters, draw a card.\nAll lands lose all abilities except mana abilities.","layout":"normal","cmc":3,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["R"],"colorIdentity":["R"]},
  {"name":"Dress Down","type":"Enchantment","mana":"{1}{U}","oracle":"Flash\nWhen this enchantment enters, draw a card.\nCreatures lose all abilities.\nAt the beginning of the end step, sacrifice this enchantment.","layout":"normal","cmc":2,"power":null,"toughness":null,"loyalty":null,"keywords":["Flash"],"colors":["U"],"colorIdentity":["U"]},
  {"name":"Sudden Spoiling","type":"Instant","mana":"{1}{B}{B}","oracle":"Split second (As long as this spell is on the stack, players can't cast spells or activate abilities that aren't mana abilities.)\nUntil end of turn, creatures target player controls lose all abilities and have base power and toughness 0/2.","layout":"normal","cmc":3,"power":null,"toughness":null,"loyalty":null,"keywords":["Split second"],"colors":["B"],"colorIdentity":["B"]},
  {"name":"Amphibian Downpour","type":"Enchantment — Aura","mana":"{2}{U}","oracle":"Flash\nStorm (When you cast this spell, copy it for each spell cast before it this turn. You may choose new targets for the copies. Copies become tokens.)\nEnchant creature\nEnchanted creature loses all abilities and is a blue Frog creature with base power and toughness 1/1.","layout":"normal","cmc":3,"power":null,"toughness":null,"loyalty":null,"keywords":["Storm","Enchant","Flash"],"colors":["U"],"colorIdentity":["U"]},
  {"name":"Stasis Field","type":"Enchantment — Aura","mana":"{1}{U}","oracle":"Enchant creature\nEnchanted creature has base power and toughness 0/2, has defender, and loses all other abilities.","layout":"normal","cmc":2,"power":null,"toughness":null,"loyalty":null,"keywords":["Enchant"],"colors":["U"],"colorIdentity":["U"]},
  {"name":"Sliver Legion","type":"Legendary Creature — Sliver","mana":"{W}{U}{B}{R}{G}","oracle":"All Sliver creatures get +1/+1 for each other Sliver on the battlefield.","layout":"normal","cmc":5,"power":"7","toughness":"7","loyalty":null,"keywords":[],"colors":["B","G","R","U","W"],"colorIdentity":["B","G","R","U","W"]},
  {"name":"Muscle Sliver","type":"Creature — Sliver","mana":"{1}{G}","oracle":"All Sliver creatures get +1/+1.","layout":"normal","cmc":2,"power":"1","toughness":"1","loyalty":null,"keywords":[],"colors":["G"],"colorIdentity":["G"]},
  {"name":"Metallic Sliver","type":"Artifact Creature — Sliver","mana":"{1}","oracle":"","layout":"normal","cmc":1,"power":"1","toughness":"1","loyalty":null,"keywords":[],"colors":[],"colorIdentity":[]},
  {"name":"Chandra, Torch of Defiance","type":"Legendary Planeswalker — Chandra","mana":"{2}{R}{R}","oracle":"+1: Exile the top card of your library. You may cast that card. If you don't, Chandra deals 2 damage to each opponent.\n+1: Add {R}{R}.\n−3: Chandra deals 4 damage to target creature.\n−7: You get an emblem with \"Whenever you cast a spell, this emblem deals 5 damage to any target.\"","layout":"normal","cmc":4,"power":null,"toughness":null,"loyalty":"4","keywords":[],"colors":["R"],"colorIdentity":["R"]},
  {"name":"Shared Triumph","type":"Enchantment","mana":"{1}{W}","oracle":"As this enchantment enters, choose a creature type.\nCreatures of the chosen type get +1/+1.","layout":"normal","cmc":2,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["W"],"colorIdentity":["W"]},
  {"name":"Coat of Arms","type":"Artifact","mana":"{5}","oracle":"Each creature gets +1/+1 for each other creature on the battlefield that shares at least one creature type with it. (For example, if two Goblin Warriors and a Goblin Shaman are on the battlefield, each gets +2/+2.)","layout":"normal","cmc":5,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":[]},
  {"name":"Bladed Bracers","type":"Artifact — Equipment","mana":"{1}","oracle":"Equipped creature gets +1/+1.\nAs long as equipped creature is a Human or an Angel, it has vigilance.\nEquip {2} ({2}: Attach to target creature you control. Equip only as a sorcery.)","layout":"normal","cmc":1,"power":null,"toughness":null,"loyalty":null,"keywords":["Equip"],"colors":[],"colorIdentity":[]},
  {"name":"Levitation","type":"Enchantment","mana":"{2}{U}{U}","oracle":"Creatures you control have flying.","layout":"normal","cmc":4,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["U"],"colorIdentity":["U"]},
  {"name":"Drover of the Mighty","type":"Creature — Human Druid","mana":"{1}{G}","oracle":"This creature gets +2/+2 as long as you control a Dinosaur.\n{T}: Add one mana of any color.","layout":"normal","cmc":2,"power":"1","toughness":"1","loyalty":null,"keywords":[],"colors":["G"],"colorIdentity":["G"]},
  {"name":"Colossal Dreadmaw","type":"Creature — Dinosaur","mana":"{4}{G}{G}","oracle":"Trample (This creature can deal excess combat damage to the player or planeswalker it's attacking.)","layout":"normal","cmc":6,"power":"6","toughness":"6","loyalty":null,"keywords":["Trample"],"colors":["G"],"colorIdentity":["G"]},
];
const card = (name) => {
  const c = CORPUS.find((x) => x.name === name || x.name.startsWith(`${name} // `));
  if (!c) throw new Error(`not in the corpus: ${name}`);
  return c;
};

// The whole keyword vocabulary a permanent's keyword readers answer for: the combat keywords, every keyword a grant may give, and
// the keyword-shaped words the engine reads elsewhere.
const VOCAB = [...new Set([...COMBAT_KEYWORDS, ...GRANTABLE_STATIC_KEYWORDS, "changeling", "protection", "ward", "undying", "exalted",
  "flanking", "reconfigure", "equip", "level up", "devoid"].map((k) => String(k).toLowerCase()))];
// The rules-effect pseudo-keywords the engine rides on the keyword op (CR 113.12 — not abilities).
const PSEUDO = ["cantBlock", "cantAttack", "mustAttack", "goaded", "unblockable", "activatedAbilitiesLocked", "attacksIgnoringDefender"];

/** A game state with these permanents ({ id, name | card, controller?, extra? }), timestamps 1…N in order, the counter at N + 1. */
function board(perms, { userPool = {} } = {}) {
  const s0 = G.createGameState({ userDeck: [], aiDeck: [] });
  const bf = { user: [], ai: [] };
  perms.forEach((p, i) => {
    const c = typeof p.name === "string" ? card(p.name) : p.card;
    bf[p.controller || "user"].push({ ...G.createPermanent({ id: p.id, card: c, controller: p.controller || "user", summoningSick: false }), timestamp: i + 1, ...(p.extra || {}) });
  });
  return {
    ...s0,
    timestampCounter: perms.length + 1,
    players: {
      ...s0.players,
      user: { ...s0.players.user, battlefield: bf.user, manaPool: { ...s0.players.user.manaPool, ...userPool } },
      ai: { ...s0.players.ai, battlefield: bf.ai },
    },
  };
}
const permOf = (s, id) => Object.values(s.players).flatMap((p) => p.battlefield).find((p) => p.id === id);

/** Inject a "loses all abilities" effect (a stored resolution effect, as a resolved spell makes one). Returns { state, id, ts }. */
function lose(state, ids, { exceptMana = false, selector = null } = {}) {
  const ts = state.timestampCounter;
  const { state: next, effectId } = L.addContinuousEffect(state, {
    layer: 6,
    op: { layerOp: "loseAllAbilities", ...(exceptMana ? { exceptMana: true } : {}) },
    affects: selector ? { mode: "dynamic", selector } : { mode: "fixed", permanentIds: ids },
    duration: { kind: "permanent" },
    source: { kind: "resolution", permanentId: null, controller: "ai" },
  });
  return { state: next, id: effectId, ts };
}
function grant(state, id, op, extra = {}) {
  return L.addContinuousEffect(state, { layer: 6, op, affects: { mode: "fixed", permanentIds: [id] }, duration: { kind: "permanent" }, source: { kind: "resolution", permanentId: null, controller: "user" }, ...extra }).state;
}
const keywordsOn = (s, id) => VOCAB.filter((k) => L.permanentHasKeyword(s, id, k));
const view = (s, p) => (typeof L.abilityCardOf === "function" ? L.abilityCardOf(s, p) : p.card);

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
describe("the board fast path — no loss on the board (controls: identical on the base)", () => {
  it("every corpus card alone on a board reads exactly its printed card through every layers.js keyword and protection reader", () => {
    let n = 0;
    for (const c of CORPUS) {
      const s = board([{ id: "x", card: c }]);
      for (const k of VOCAB) expect([c.name, k, L.permanentHasKeyword(s, "x", k)]).toEqual([c.name, k, hasKeyword(c, k)]);
      expect([c.name, [...L.permanentProtectionColors(s, "x")].sort()]).toEqual([c.name, [...parseProtectionColors(c)].sort()]);
      expect([c.name, [...L.permanentProtectionClasses(s, "x")].sort()]).toEqual([c.name, [...parseProtectionClasses(c)].sort()]);
      if (typeof L.abilityLossOf === "function") expect(L.abilityLossOf(s, "x")).toBe(null);
      if (typeof L.abilityCardOf === "function") expect(L.abilityCardOf(s, permOf(s, "x"))).toBe(c); // the same object: every cache keyed on it stays warm
      n += 1;
    }
    expect(n).toBe(CORPUS.length);
  });

  it("a loss on ANOTHER permanent leaves this one exactly as it was", () => {
    const s = board([{ id: "angel", name: "Serra Angel" }, { id: "bear", name: "Grizzly Bears" }, { id: "knight", name: "Silver Knight" }]);
    const before = { kw: keywordsOn(s, "angel"), prot: [...L.permanentProtectionColors(s, "knight")], kwk: keywordsOn(s, "knight") };
    const { state: t } = lose(s, ["bear"]);
    expect({ kw: keywordsOn(t, "angel"), prot: [...L.permanentProtectionColors(t, "knight")], kwk: keywordsOn(t, "knight") }).toEqual(before);
    expect(before.kw).toEqual(["flying", "vigilance"]);
  });

  it("an anthem on a board without a loss pumps exactly as before; the collection is one array per state", () => {
    const s = board([{ id: "lord", name: "Elvish Archdruid" }, { id: "elf", name: "Llanowar Elves" }]);
    expect(L.permanentPower(s, "elf")).toBe(2);
    expect(L.collectContinuousEffects(s)).toBe(L.collectContinuousEffects(s));
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
describe("an injected loss empties every layers.js reader for that permanent (witnesses)", () => {
  it("keywords over the whole vocabulary: every card with a printed keyword has none (CR 613.1f)", () => {
    const carriers = CORPUS.filter((c) => VOCAB.some((k) => hasKeyword(c, k)));
    expect(carriers.length).toBeGreaterThanOrEqual(12);
    for (const c of carriers) {
      const s = board([{ id: "x", card: c }]);
      const { state: t } = lose(s, ["x"]);
      expect([c.name, keywordsOn(t, "x")]).toEqual([c.name, []]);
      expect([c.name, [...L.deriveCharacteristics(t, "x").keywords]]).toEqual([c.name, []]);
    }
  });

  it("protection: the printed colours and classes are gone, the own-clause reading too", () => {
    for (const name of ["Silver Knight", "Iridescent Angel", "Akroma, Angel of Wrath", "Commander Eesha", "Mystic Crusader"]) {
      const s = board([{ id: "x", name }]);
      const printed = [...L.permanentProtectionColors(s, "x"), ...L.permanentProtectionClasses(s, "x")];
      expect([name, printed.length > 0]).toEqual([name, true]);
      const { state: t } = lose(s, ["x"]);
      expect([name, [...L.permanentProtectionColors(t, "x")], [...L.permanentProtectionColors(t, "x", null, true)], [...L.permanentProtectionClasses(t, "x")]]).toEqual([name, [], [], []]);
    }
  });

  it("its own statics from layer 6 on are no longer collected — the anthem, the keyword grant, the marker, the P/T CDA — and its layer-4 effect stays (CR 613.6)", () => {
    const s = board([
      { id: "lord", name: "Lord of Atlantis" }, { id: "merfolk", name: "Coral Merfolk" },
      { id: "druid", name: "Elvish Archdruid" }, { id: "elf", name: "Llanowar Elves" },
      { id: "teysa", name: "Teysa Karlov" }, { id: "leyline", name: "Leyline of Sanctity" },
      { id: "goyf", name: "Tarmogoyf" }, { id: "heliod", name: "Heliod, God of the Sun" }, { id: "bear", name: "Grizzly Bears" },
    ]);
    const sources = ["lord", "druid", "teysa", "leyline", "goyf", "heliod"];
    const own = (st) => L.collectContinuousEffects(st).filter((e) => e.source?.kind === "static" && sources.includes(e.source.permanentId));
    expect(own(s).filter((e) => !(e.layer >= 1 && e.layer <= 5)).length).toBeGreaterThanOrEqual(8);
    // controls before the loss
    expect([L.permanentPower(s, "merfolk"), L.permanentHasKeyword(s, "merfolk", "islandwalk"), L.permanentPower(s, "elf"), L.diesTriggerMultiplierCount(s, "user"), L.playerHasHexproof(s, "user"), L.permanentHasKeyword(s, "bear", "vigilance"), L.permanentIsCreature(s, "heliod")]).toEqual([3, true, 2, 1, true, true, false]);
    const { state: t } = lose(s, sources);
    expect(own(t).filter((e) => !(e.layer >= 1 && e.layer <= 5))).toEqual([]);
    expect(own(t).map((e) => [e.source.permanentId, e.layer, e.op.layerOp])).toEqual([["heliod", 4, "removeTypeWhileDevotionBelow"]]);
    expect([L.permanentPower(t, "merfolk"), L.permanentHasKeyword(t, "merfolk", "islandwalk"), L.permanentPower(t, "elf"), L.diesTriggerMultiplierCount(t, "user"), L.playerHasHexproof(t, "user"), L.permanentHasKeyword(t, "bear", "vigilance")]).toEqual([2, false, 1, 0, false, false]);
    // the God's own type ability still applies (layer 4, before the loss — the Theros-God ruling); its indestructible is gone
    expect([L.permanentIsCreature(t, "heliod"), L.permanentHasKeyword(t, "heliod", "indestructible")]).toEqual([false, false]);
    // Tarmogoyf's characteristic-defining P/T (layer 7a) is gone with the ability
    expect(L.deriveCharacteristics(t, "goyf").appliedEffects.some((e) => e.op?.layerOp === "ptSetDynamicCount")).toBe(false);
  });

  it("STATIC_REGISTRY: an Omnath that lost its abilities gets nothing for the green it floats", () => {
    const s = board([{ id: "omnath", name: "Omnath, Locus of Mana" }], { userPool: { G: 3 } });
    expect(L.permanentPower(s, "omnath")).toBe(4);
    expect(L.permanentPower(lose(s, ["omnath"]).state, "omnath")).toBe(1);
  });

  it("keyword counters, the suspected designation and kicked keywords from before the loss are gone (CR 613.7c, 701.60c, 702.33e)", () => {
    let s = board([{ id: "bear", name: "Grizzly Bears", extra: { kickedKeywords: ["haste"] } }]);
    s = G.addCounter(s, { permanentId: "bear", type: "flying", amount: 1 });
    s = applySuspect(s, { op: "suspect", target: "self" }, { controller: "user", sourceId: "bear", targets: [{ id: "bear" }] });
    expect(["flying", "menace", "cantblock", "haste"].map((k) => L.permanentHasKeyword(s, "bear", k))).toEqual([true, true, true, true]);
    expect(["flying", "menace", "cantblock"].map((k) => L.deriveCharacteristics(s, "bear").keywords.has(k))).toEqual([true, true, true]);
    const { state: t } = lose(s, ["bear"]);
    expect(["flying", "menace", "cantblock", "haste"].map((k) => L.permanentHasKeyword(t, "bear", k))).toEqual([false, false, false, false]);
    expect([...L.deriveCharacteristics(t, "bear").keywords]).toEqual([]);
  });

  it("the instance count of a printed flanking / exalted is zero; a later grant counts one", () => {
    const s = board([{ id: "herder", name: "Mtenda Herder" }, { id: "hierarch", name: "Noble Hierarch" }]);
    expect([L.keywordInstanceCount(s, "herder", "flanking", 1), L.keywordInstanceCount(s, "hierarch", "exalted", 1)]).toEqual([1, 1]);
    let { state: t } = lose(s, ["herder", "hierarch"]);
    expect([L.keywordInstanceCount(t, "herder", "flanking", 1), L.keywordInstanceCount(t, "hierarch", "exalted", 1)]).toEqual([0, 0]);
    t = grant(t, "herder", { layerOp: "addKeyword", keyword: "flanking" });
    expect(L.keywordInstanceCount(t, "herder", "flanking", 1)).toBe(1);
  });

  it("the host-has-printed-keyword gate reads the stripped host: Solid Footing's toughness assignment stops", () => {
    const s = board([{ id: "angel", name: "Serra Angel" }, { id: "footing", name: "Solid Footing", extra: { attachedTo: "angel" } }]);
    expect(L.assignsCombatDamageWithToughness(s, "angel")).toBe(true);
    expect(L.assignsCombatDamageWithToughness(lose(s, ["angel"]).state, "angel")).toBe(false);
  });

  it("every ability granted before the loss is cut: keyword, protection, ward, mana, activated, triggered", () => {
    let s = board([{ id: "bear", name: "Grizzly Bears" }]);
    s = grant(s, "bear", { layerOp: "addKeyword", keyword: "Flying" });
    s = grant(s, "bear", { layerOp: "addProtection", colors: ["R"] });
    s = grant(s, "bear", { layerOp: "addWard", generic: 2 });
    s = grant(s, "bear", { layerOp: "addAbility", grant: { kind: "mana", spec: { colors: ["G"], amount: 1 } } });
    s = grant(s, "bear", { layerOp: "addAbility", grant: { kind: "activated", quoted: "{2}: Regenerate this permanent." } });
    s = grant(s, "bear", { layerOp: "addAbility", grant: { kind: "triggered", quoted: "Whenever this creature attacks, you gain 1 life." } });
    const reads = (st) => [L.permanentHasKeyword(st, "bear", "flying"), [...L.permanentProtectionColors(st, "bear")], L.permanentGrantedWardCosts(st, "bear"),
      L.grantedManaSpecsFor(st, "bear").length, L.grantedActivatedQuotedFor(st, "bear").length, L.grantedTriggeredQuotedFor(st, "bear").length];
    expect(reads(s)).toEqual([true, ["R"], [{ generic: 2 }], 1, 1, 1]);
    expect(reads(lose(s, ["bear"]).state)).toEqual([false, [], [], 0, 0, 0]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
describe("grant timing (CR 613.7: only what it had when the loss applied)", () => {
  it("a grant made after the loss applies (control)", () => {
    let { state: s } = lose(board([{ id: "bear", name: "Grizzly Bears" }]), ["bear"]);
    s = grant(s, "bear", { layerOp: "addKeyword", keyword: "Flying" });
    s = grant(s, "bear", { layerOp: "addWard", generic: 1 });
    expect([L.permanentHasKeyword(s, "bear", "flying"), L.permanentGrantedWardCosts(s, "bear")]).toEqual([true, [{ generic: 1 }]]);
  });

  it("a grant made by the same effect (grantedWith) is kept; another grant with the same timestamp is cut", () => {
    const { state: s0, id, ts } = lose(board([{ id: "bear", name: "Grizzly Bears" }]), ["bear"]);
    let s = grant(s0, "bear", { layerOp: "addKeyword", keyword: "indestructible" }, { timestamp: ts, grantedWith: id });
    s = grant(s, "bear", { layerOp: "addKeyword", keyword: "hexproof" }, { timestamp: ts });
    expect([L.permanentHasKeyword(s, "bear", "indestructible"), L.permanentHasKeyword(s, "bear", "hexproof")]).toEqual([true, false]);
  });

  it("a loss except mana abilities keeps a granted mana ability and cuts the rest (Blood Sun's form)", () => {
    let s = board([{ id: "hierarch", name: "Noble Hierarch" }]);
    s = grant(s, "hierarch", { layerOp: "addAbility", grant: { kind: "mana", spec: { colors: ["R"], amount: 1 } } });
    s = grant(s, "hierarch", { layerOp: "addKeyword", keyword: "Flying" });
    const { state: t } = lose(s, ["hierarch"], { exceptMana: true });
    expect([L.grantedManaSpecsFor(t, "hierarch").length, L.permanentHasKeyword(t, "hierarch", "flying"), L.keywordInstanceCount(t, "hierarch", "exalted", 1)]).toEqual([1, false, 0]);
    expect(L.grantedManaSpecsFor(lose(s, ["hierarch"]).state, "hierarch").length).toBe(0);
  });

  it("a rules effect is never cut (CR 113.12): can't block, must attack, goaded, can't be blocked survive the loss; the real keyword beside them does not", () => {
    let s = board([{ id: "bear", name: "Grizzly Bears" }]);
    for (const k of PSEUDO) s = grant(s, "bear", { layerOp: "addKeyword", keyword: k });
    s = grant(s, "bear", { layerOp: "addKeyword", keyword: "Trample" });
    const { state: t } = lose(s, ["bear"]);
    expect([...PSEUDO.map((k) => L.permanentHasKeyword(t, "bear", k)), L.permanentHasKeyword(t, "bear", "trample")]).toEqual([...PSEUDO.map(() => true), false]);
  });

  it("an Equipment attached before the loss loses its keywords there (its pump stays); attached after the loss, they apply (CR 613.7e)", () => {
    const s = board([{ id: "bear", name: "Grizzly Bears" }, { id: "hammer", name: "Loxodon Warhammer" }]);
    const before = lose(G.attachPermanent(s, { equipId: "hammer", targetId: "bear" }), ["bear"]).state;
    expect([L.permanentHasKeyword(before, "bear", "trample"), L.permanentHasKeyword(before, "bear", "lifelink"), L.permanentPower(before, "bear")]).toEqual([false, false, 5]);
    const after = G.attachPermanent(lose(s, ["bear"]).state, { equipId: "hammer", targetId: "bear" });
    expect([L.permanentHasKeyword(after, "bear", "trample"), L.permanentHasKeyword(after, "bear", "lifelink"), L.permanentPower(after, "bear")]).toEqual([true, true, 5]);
  });

  it("a keyword counter put on before the loss is gone; one put on after counts (CR 613.7c)", () => {
    const s = board([{ id: "bear", name: "Grizzly Bears" }]);
    const before = lose(G.addCounter(s, { permanentId: "bear", type: "flying" }), ["bear"]).state;
    expect(L.permanentHasKeyword(before, "bear", "flying")).toBe(false);
    const after = G.addCounter(lose(s, ["bear"]).state, { permanentId: "bear", type: "flying" });
    expect([L.permanentHasKeyword(after, "bear", "flying"), L.deriveCharacteristics(after, "bear").keywords.has("flying")]).toEqual([true, true]);
  });

  it("the Changeling ability is lost; its every-creature-type, applied in layer 4, stays (CR 613.3, 613.6)", () => {
    const s = board([{ id: "outcast", name: "Changeling Outcast" }, { id: "druid", name: "Elvish Archdruid" }]);
    const { state: t } = lose(s, ["outcast"]);
    expect([L.permanentHasKeyword(t, "outcast", "changeling"), L.permIsEveryCreatureType(t, "outcast"), L.permanentPower(t, "outcast")]).toEqual([false, true, 2]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
describe("the name-keyed tables speak only for the printed card", () => {
  const stripped = (s, p) => (typeof L.abilityCardOf === "function" ? L.abilityCardOf(s, p) : { ...p.card, oracle: "", oracle_text: "", keywords: [], abilitiesLost: true });

  it("a Sol Ring, a basic land, a snow basic, a typed dual and a double-faced land that lost their abilities make no mana", () => {
    const names = ["Sol Ring", "Forest", "Snow-Covered Forest", "Tundra", "Westvale Abbey", "Llanowar Elves"];
    const s = board(names.map((name, i) => ({ id: `p${i}`, name })));
    for (let i = 0; i < names.length; i++) expect([names[i], !!M.manaProduction(permOf(s, `p${i}`).card)]).toEqual([names[i], true]);
    const { state: t } = lose(s, names.map((_, i) => `p${i}`));
    for (let i = 0; i < names.length; i++) expect([names[i], M.manaProduction(stripped(t, permOf(t, `p${i}`)))]).toEqual([names[i], null]);
  });

  it("a loss that keeps the mana abilities keeps them, the tables included", () => {
    const names = ["Sol Ring", "Forest", "Tundra", "Llanowar Elves"];
    const s = board(names.map((name, i) => ({ id: `p${i}`, name })));
    const { state: t } = lose(s, names.map((_, i) => `p${i}`), { exceptMana: true });
    const got = names.map((_, i) => M.manaProduction(view(t, permOf(t, `p${i}`))));
    expect(got.map((p) => p && [...p.colors].sort().join("") + p.amount)).toEqual(["C2", "G1", "UW1", "G1"]);
  });

  it("a land given a basic land type (Urborg's Swamp) taps for it — until it loses its abilities; a lost Urborg still makes it a Swamp (CR 305.6, 613.6)", () => {
    const s = board([{ id: "urborg", name: "Urborg, Tomb of Yawgmoth" }, { id: "maze", name: "Maze of Ith" }]);
    const mazeSource = (st) => M.manaSources(st, "user").filter((x) => x.permanentId === "maze").flatMap((x) => x.colors);
    expect(mazeSource(s)).toEqual(["B"]);
    expect(mazeSource(lose(s, ["maze"]).state)).toEqual([]);
    expect(mazeSource(lose(s, ["urborg"]).state)).toEqual(["B"]);
  });

  it("cardEffects' registry: an Omnath that lost its abilities keeps no green as the step ends", () => {
    const s = board([{ id: "omnath", name: "Omnath, Locus of Mana" }], { userPool: { G: 2 } });
    expect(GE.emptyManaPools(s).players.user.manaPool.G).toBe(2);
    const { state: t } = lose(s, ["omnath"]);
    expect(CE.manaDoesNotEmpty(t, "user", (p) => (typeof L.withAbilityLoss === "function" ? L.withAbilityLoss(t, p) : p.card))).toEqual([]);
    expect(GE.emptyManaPools(t).players.user.manaPool.G).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
describe("the prerequisites", () => {
  it("attaching restamps the Aura or Equipment (CR 613.7e, 701.3c); attaching it where it already is does nothing (CR 701.3b)", () => {
    const s = board([{ id: "bear", name: "Grizzly Bears" }, { id: "elf", name: "Llanowar Elves" }, { id: "wings", name: "Cobbled Wings" }]);
    const a = G.attachPermanent(s, { equipId: "wings", targetId: "bear" });
    expect([permOf(a, "wings").timestamp, a.timestampCounter]).toEqual([s.timestampCounter, s.timestampCounter + 1]);
    const again = G.attachPermanent(a, { equipId: "wings", targetId: "bear" });
    expect([permOf(again, "wings").timestamp, again.timestampCounter]).toEqual([permOf(a, "wings").timestamp, a.timestampCounter]);
    const moved = G.attachPermanent(a, { equipId: "wings", targetId: "elf" });
    expect([permOf(moved, "wings").timestamp, moved.timestampCounter]).toEqual([a.timestampCounter, a.timestampCounter + 1]);
  });

  it("an Equipment attached after an earlier \"loses flying\" applies after it: the new timestamp decides (CR 613.7e, 613.7)", () => {
    let s = board([{ id: "bear", name: "Grizzly Bears" }, { id: "wings", name: "Cobbled Wings" }]);
    s = grant(s, "bear", { layerOp: "removeKeyword", keyword: "Flying" });
    s = G.attachPermanent(s, { equipId: "wings", targetId: "bear" });
    expect(L.permanentHasKeyword(s, "bear", "flying")).toBe(true);
  });

  it("layer 4 applies in timestamp order, not in the order the effects were stored (CR 613.7)", () => {
    let s = board([{ id: "ring", name: "Sol Ring" }]);
    s = L.addContinuousEffect(s, { layer: 4, op: { types: ["Creature"] }, affects: { mode: "fixed", permanentIds: ["ring"] }, duration: { kind: "permanent" }, timestamp: 50 }).state;
    s = L.addContinuousEffect(s, { layer: 4, op: { layerOp: "removeCardType", removeType: "Creature" }, affects: { mode: "fixed", permanentIds: ["ring"] }, duration: { kind: "permanent" }, timestamp: 20 }).state;
    expect(L.permanentIsCreature(s, "ring")).toBe(true);
  });

  it("each counter kind carries the timestamp it was last put on with; the last one gone, its stamp goes (CR 613.7c)", () => {
    let s = { ...board([{ id: "bear", name: "Grizzly Bears" }]), timestampCounter: 7 };
    s = G.addCounter(s, { permanentId: "bear", type: "+1/+1" });
    s = { ...s, timestampCounter: 9 };
    s = G.addCounter(s, { permanentId: "bear", type: "flying" });
    s = { ...s, timestampCounter: 12 };
    s = G.addCounter(s, { permanentId: "bear", type: "+1/+1" });
    expect(permOf(s, "bear").counterTimestamps).toEqual({ "+1/+1": 12, flying: 9 });
    s = G.removeCounter(s, { permanentId: "bear", type: "flying" });
    s = G.removeCounter(s, { permanentId: "bear", type: "+1/+1" });
    expect(permOf(s, "bear").counterTimestamps).toEqual({ "+1/+1": 12 });
    expect(s.timestampCounter).toBe(12);
  });

  it("setCardTypes keeps the supertypes and only the subtypes of the card types left (CR 205.1a): Equipment Boar, Karn, Dryad Arbor, an Elf", () => {
    let s = board([{ id: "boar", name: "Bronzeplate Boar" }, { id: "karn", name: "Karn, Silver Golem" }, { id: "arbor", name: "Dryad Arbor" },
      { id: "elf", name: "Llanowar Elves" }, { id: "steel", name: "Tempered Steel" }, { id: "druid", name: "Elvish Archdruid" }]);
    expect([L.permanentPower(s, "boar"), L.permanentPower(s, "elf")]).toEqual([5, 2]);
    const set = (st, id, types) => L.addContinuousEffect(st, { layer: 4, op: { layerOp: "setCardTypes", types }, affects: { mode: "fixed", permanentIds: [id] }, duration: { kind: "permanent" } }).state;
    s = set(set(set(set(s, "boar", ["Creature"]), "karn", ["Creature"]), "arbor", ["Land"]), "elf", ["Artifact"]);
    expect(L.permanentTypes(s, "boar")).toEqual({ types: ["Creature"], subtypes: ["Boar"] });
    expect(L.permanentTypes(s, "karn")).toEqual({ types: ["Legendary", "Creature"], subtypes: ["Golem"] });
    expect(L.permanentTypes(s, "arbor")).toEqual({ types: ["Land"], subtypes: ["Forest"] });
    expect(L.permanentTypes(s, "elf")).toEqual({ types: ["Artifact"], subtypes: [] });
    // the lords read the same identity: Tempered Steel no longer pumps the Boar, the Archdruid no longer pumps the Elf
    expect([L.permanentPower(s, "boar"), L.permanentHasCardType(s, "boar", "Artifact"), L.permanentIsCreature(s, "elf"), L.permanentIsCreature(s, "arbor")]).toEqual([3, false, false, false]);
  });

  it("replaceCreatureTypes replaces every creature type, Changeling's included, and the lords see it (CR 205.1a, 613.3)", () => {
    let s = board([{ id: "druid", name: "Elvish Archdruid" }, { id: "elf", name: "Llanowar Elves" }, { id: "outcast", name: "Changeling Outcast" }]);
    expect([L.permanentPower(s, "elf"), L.permanentPower(s, "outcast"), L.permIsEveryCreatureType(s, "outcast")]).toEqual([2, 2, true]);
    const rep = (st, id, subtypes) => L.addContinuousEffect(st, { layer: 4, op: { layerOp: "replaceCreatureTypes", subtypes }, affects: { mode: "fixed", permanentIds: [id] }, duration: { kind: "permanent" } }).state;
    s = rep(rep(s, "elf", ["Treefolk"]), "outcast", ["Frog"]);
    expect([L.permanentTypes(s, "elf").subtypes, L.permanentCreatureTypes(s, "elf"), L.permanentPower(s, "elf")]).toEqual([["Treefolk"], ["treefolk"], 1]);
    expect([L.permIsEveryCreatureType(s, "outcast"), L.permanentHasTypeWord(s, "outcast", "Elf"), L.permanentHasTypeWord(s, "outcast", "Frog"), L.permanentPower(s, "outcast")]).toEqual([false, false, true, 1]);
    // a later all-creature-types effect makes it every creature type again (CR 613.7)
    s = L.addContinuousEffect(s, { layer: 4, op: { allCreatureTypes: true }, affects: { mode: "fixed", permanentIds: ["outcast"] }, duration: { kind: "permanent" } }).state;
    expect([L.permIsEveryCreatureType(s, "outcast"), L.permanentPower(s, "outcast")]).toEqual([true, 2]);
  });

  it("an Elf type added after a replacement is kept, wherever the two were stored (timestamp order, CR 613.7 — control)", () => {
    let s = board([{ id: "druid", name: "Elvish Archdruid" }, { id: "elf", name: "Llanowar Elves" }]);
    s = L.addContinuousEffect(s, { layer: 4, op: { subtypes: ["Elf"] }, affects: { mode: "fixed", permanentIds: ["elf"] }, duration: { kind: "permanent" }, timestamp: 50 }).state;
    s = L.addContinuousEffect(s, { layer: 4, op: { layerOp: "replaceCreatureTypes", subtypes: ["Treefolk"] }, affects: { mode: "fixed", permanentIds: ["elf"] }, duration: { kind: "permanent" }, timestamp: 20 }).state;
    expect([L.permanentHasTypeWord(s, "elf", "Elf"), L.permanentPower(s, "elf")]).toEqual([true, 2]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
describe("the re-entry guard (a dynamic loss whose selector reads keywords)", () => {
  it("\"creatures with flying lose all abilities\" decides without looping: the flyer loses its abilities, the bear keeps what it has", () => {
    let s = board([{ id: "angel", name: "Serra Angel" }, { id: "bear", name: "Grizzly Bears" }]);
    s = G.addCounter(s, { permanentId: "bear", type: "trample" });
    const { state: t } = lose(s, [], { selector: { cardTypes: ["Creature"], withKeyword: "flying" } });
    expect([keywordsOn(t, "angel"), keywordsOn(t, "bear")]).toEqual([[], ["trample"]]);
    expect([keywordsOn(t, "angel"), [...L.deriveCharacteristics(t, "angel").keywords]]).toEqual([[], []]); // read again: the memo holds the same answer
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
describe("the stripped view (abilityCardOf)", () => {
  it("is exported", () => {
    expect([typeof L.abilityCardOf, typeof L.withAbilityLoss, typeof L.abilityLossOf]).toEqual(["function", "function", "function"]);
  });

  it("keeps the characteristics, drops the text and the keywords, and is one object per card and kept text", () => {
    if (typeof L.abilityCardOf !== "function") return;
    const s = board([{ id: "angel", name: "Serra Angel" }, { id: "delver", name: "Delver of Secrets" }, { id: "elf", name: "Llanowar Elves" }]);
    const { state: t } = lose(s, ["angel", "delver"]);
    const { state: u } = lose(t, ["elf"], { exceptMana: true });
    const v = L.abilityCardOf(u, permOf(u, "angel"));
    const c = card("Serra Angel");
    expect({ name: v.name, type: v.type, mana: v.mana, power: v.power, toughness: v.toughness, colors: v.colors, oracle: v.oracle, oracle_text: v.oracle_text, keywords: v.keywords, abilitiesLost: v.abilitiesLost })
      .toEqual({ name: c.name, type: c.type, mana: c.mana, power: c.power, toughness: c.toughness, colors: c.colors, oracle: "", oracle_text: "", keywords: [], abilitiesLost: true });
    expect(L.abilityCardOf(u, permOf(u, "angel"))).toBe(v);
    expect(L.abilityCardOf(t, permOf(t, "angel"))).toBe(v); // another state, the same base card and kept text → the same view
    expect(permOf(u, "angel").card).toBe(c); // the permanent's own card is never rewritten (CR 707.2)
    const dv = faceUpView(L.abilityCardOf(u, permOf(u, "delver")));
    expect([dv.oracle, dv.keywords, dv.type]).toEqual(["", [], "Creature — Human Wizard"]);
    const ev = L.abilityCardOf(u, permOf(u, "elf"));
    expect([ev.oracle, ev.manaAbilitiesKept]).toEqual(["{T}: Add {G}.", true]);
    expect(L.abilityLossOf(u, "elf")).toEqual({ timestamp: t.timestampCounter, keep: "mana", losses: [{ key: "ceff-2", timestamp: t.timestampCounter, exceptMana: true, sourceKey: null }] });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// THE BLIND REVIEW'S FIXES (2026-11-01, review-abloss-s0a.md). Each witness was seen to fail on the S0a commit rebased onto fc8764ad
// (2eaffef7) before its fix.
describe("review F1 — one stripped view per (card, keep, kept text)", () => {
  const arborOn = (arbor, opts) => {
    const s = board([{ id: "arbor", card: arbor }]);
    const t = lose(s, ["arbor"], opts).state;
    return M.manaProduction(view(t, permOf(t, "arbor")));
  };
  const colorsOf = (p) => (p ? [...p.colors].sort().join("") : null);

  it("a Dryad Arbor that keeps its mana abilities taps for {G}, one that lost them all makes nothing — exceptMana read first", () => {
    const arbor = { ...card("Dryad Arbor") }; // one card object for both states (the view memo is keyed on it)
    expect([colorsOf(arborOn(arbor, { exceptMana: true })), colorsOf(arborOn(arbor, {}))]).toEqual(["G", null]);
  });

  it("the same, the plain loss read first", () => {
    const arbor = { ...card("Dryad Arbor") };
    expect([colorsOf(arborOn(arbor, {})), colorsOf(arborOn(arbor, { exceptMana: true }))]).toEqual([null, "G"]);
  });
});

describe("review F2 — the subtype counts inside the derive see setCardTypes and replaceCreatureTypes", () => {
  const rep = (st, id, subtypes) => L.addContinuousEffect(st, { layer: 4, op: { layerOp: "replaceCreatureTypes", subtypes }, affects: { mode: "fixed", permanentIds: [id] }, duration: { kind: "permanent" } }).state;
  const set = (st, id, types) => L.addContinuousEffect(st, { layer: 4, op: { layerOp: "setCardTypes", types }, affects: { mode: "fixed", permanentIds: [id] }, duration: { kind: "permanent" } }).state;

  it("Sliver Legion counts a Sliver made a Treefolk no longer: Legion 9, Muscle Sliver 3, the Treefolk 1", () => {
    const s = board([{ id: "legion", name: "Sliver Legion" }, { id: "muscle", name: "Muscle Sliver" }, { id: "metallic", name: "Metallic Sliver" }]);
    expect(["legion", "muscle", "metallic"].map((id) => L.permanentPower(s, id))).toEqual([10, 4, 4]);
    const t = rep(s, "metallic", ["Treefolk"]);
    expect(["legion", "muscle", "metallic"].map((id) => L.permanentPower(t, id))).toEqual([9, 3, 1]);
  });

  it("a Sliver that is no longer a creature has no creature type to be counted by (setCardTypes)", () => {
    const s = set(board([{ id: "legion", name: "Sliver Legion" }, { id: "muscle", name: "Muscle Sliver" }, { id: "metallic", name: "Metallic Sliver" }]), "metallic", ["Artifact"]);
    expect([L.permanentPower(s, "legion"), L.permanentPower(s, "muscle")]).toEqual([9, 3]);
  });

  it("a \"you control a <subtype>\" gate reads the type it has now: Drover of the Mighty loses its +2/+2 when its Dinosaur is made a Treefolk", () => {
    const s0 = board([{ id: "drover", name: "Drover of the Mighty" }, { id: "dino", name: "Colossal Dreadmaw" }]);
    expect(L.permanentPower(s0, "drover")).toBe(3);
    expect(L.permanentPower(rep(s0, "dino", ["Treefolk"]), "drover")).toBe(1);
  });

  it("a chosen-type anthem passes over an Elf made a Treefolk (Shared Triumph, chosen Elf)", () => {
    const s = board([{ id: "triumph", name: "Shared Triumph", extra: { chosenType: "Elf" } }, { id: "elf", name: "Llanowar Elves" }, { id: "elf2", name: "Elvish Mystic" }]);
    expect([L.permanentPower(s, "elf"), L.permanentPower(s, "elf2")]).toEqual([2, 2]);
    const t = rep(s, "elf", ["Treefolk"]);
    expect([L.permanentPower(t, "elf"), L.permanentPower(t, "elf2")]).toEqual([1, 2]);
  });
});

describe("review F4 — a loyalty line is never a kept mana ability", () => {
  it("Chandra, Torch of Defiance under a loss except mana abilities keeps nothing (\"+1: Add {R}{R}.\" is a loyalty ability)", () => {
    const s = board([{ id: "chandra", name: "Chandra, Torch of Defiance" }, { id: "elf", name: "Llanowar Elves" }]);
    const { state: t } = lose(s, ["chandra", "elf"], { exceptMana: true });
    expect([view(t, permOf(t, "chandra")).oracle, view(t, permOf(t, "elf")).oracle]).toEqual(["", "{T}: Add {G}."]);
  });
});

describe("review F7 — a loss decided with a keyword selector gives the same answer in either query order", () => {
  // Levitation grants flying; Levitation itself has lost its abilities (a fixed loss), and a dynamic "creatures with flying lose all
  // abilities" loss reads the bear's flying while it is being decided. Whether the bear has flying THEN is the CR 613.8 dependency the
  // core does not model (the program's S3) — it is read off the raw collection inside a loss decision; what this pins is that the answer
  // is the same whether or not the filtered collection and the layer-6 index were built first.
  const fresh = () => {
    let s = board([{ id: "lev", name: "Levitation" }, { id: "bear", name: "Grizzly Bears" }]);
    s = lose(s, ["lev"]).state;
    return lose(s, [], { selector: { cardTypes: ["Creature"], withKeyword: "flying" } }).state;
  };
  it("asked cold, and asked after the collection and the layer-6 index are memoized", () => {
    const cold = fresh();
    const a = [!!L.abilityLossOf(cold, "bear"), L.permanentHasKeyword(cold, "bear", "flying")];
    const warm = fresh();
    L.collectContinuousEffects(warm);
    L.permanentHasKeyword(warm, "lev", "flying");
    L.deriveCharacteristics(warm, "lev");
    const b = [!!L.abilityLossOf(warm, "bear"), L.permanentHasKeyword(warm, "bear", "flying")];
    expect(b).toEqual(a);
  });
});

describe("review F8 — every Changeling read in layers.js honours a replaced creature type", () => {
  const rep = (st, id, subtypes) => L.addContinuousEffect(st, { layer: 4, op: { layerOp: "replaceCreatureTypes", subtypes }, affects: { mode: "fixed", permanentIds: [id] }, duration: { kind: "permanent" } }).state;

  it("the chosen-type anthem (permHasChosenTypeLayer): Shared Triumph naming Elf skips a Changeling made a Frog", () => {
    const s = board([{ id: "triumph", name: "Shared Triumph", extra: { chosenType: "Elf" } }, { id: "outcast", name: "Changeling Outcast" }]);
    expect(L.permanentPower(s, "outcast")).toBe(2);
    expect(L.permanentPower(rep(s, "outcast", ["Frog"]), "outcast")).toBe(1);
  });

  it("the subtype count (countsAsCreatureType): Sliver Legion counts a Changeling made a Frog no longer", () => {
    const s = board([{ id: "legion", name: "Sliver Legion" }, { id: "muscle", name: "Muscle Sliver" }, { id: "outcast", name: "Changeling Outcast" }]);
    expect(L.permanentPower(s, "legion")).toBe(10);
    expect(L.permanentPower(rep(s, "outcast", ["Frog"]), "legion")).toBe(9);
  });

  it("the shared-type count (creatureTypesInDerive): Coat of Arms no longer pairs a bear with a Changeling made a Frog", () => {
    const s = board([{ id: "coat", name: "Coat of Arms" }, { id: "bear", name: "Grizzly Bears" }, { id: "outcast", name: "Changeling Outcast" }]);
    expect(L.permanentPower(s, "bear")).toBe(3);
    expect(L.permanentPower(rep(s, "outcast", ["Frog"]), "bear")).toBe(2);
  });

  it("the host-subtype gate (hostHasSubtype): Bladed Bracers' vigilance leaves a Changeling made a Frog", () => {
    const s = G.attachPermanent(board([{ id: "outcast", name: "Changeling Outcast" }, { id: "bracers", name: "Bladed Bracers" }]), { equipId: "bracers", targetId: "outcast" });
    expect(L.permanentHasKeyword(s, "outcast", "vigilance")).toBe(true);
    expect(L.permanentHasKeyword(rep(s, "outcast", ["Frog"]), "outcast", "vigilance")).toBe(false);
  });
});

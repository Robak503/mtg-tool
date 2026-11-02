/**
 * abilityLossS1.test.js — the ability-loss program's S1 (docs/orchestration/ABILITY-LOSS-PROGRAM.md §3): "loses all abilities" (CR
 * 613.1f) with the ops the engine already had, turned ON — the Aura forms at the attached and side consult points, the until-end-of-turn
 * spell and ability forms at the spell point (abilityLossShapes.js; the atom effects/atoms/combat.js applyLoseAllAbilities). Every
 * credited card plays its whole printed text through its real parsed program in a real game state:
 *   1. THE CREDIT — each card's bundled line, quoted, and its tier; the family S1 does not build stays parked, each with its reason.
 *   2. THE AURAS — cast through the real cast lane: the enchanted creature's power / toughness, types, subtypes, colours and keywords;
 *      Retro-Mutation's "can't attack", Utter Insignificance's exile, Duskmourn's Domination's control.
 *   3. VANILLA TO EVERY READER — for each credited card, over 26 real creatures: the census (every reader that reads something off the
 *      printed creature reads nothing off the affected one) and the twin comparison (the affected creature reads exactly as its no-text
 *      twin affected by the same card: combat legality both ways, combat damage, every legal action of its controller).
 *   4. THE LAYERS — counters on top of the base, the Elf lord, an artifact creature, grant timing (CR 613.7e), a later base P/T over an
 *      earlier one, the Aura's leaving restoring the creature, the look-back as it dies.
 *   5. THE SPELLS AND ABILITIES — until end of turn and back at cleanup; Snakeform's draw; lethal marked damage; Merfolk Trickster's
 *      pronoun; Warkite Marauder's defending player; the pronoun that binds to nothing.
 *   6. THE S0b REVIEW'S NOTES — R2 (Lion Sash's reconfigure read through the view, CR 301.5c) and the group sacrifice of an Aura with its
 *      host, host first.
 * Read only through public readers that existed before S1, so on the base commit the file loads and fails on its assertions. The
 * cards are real bundled cards (cardIndex.publicCard → learnDeckEnrich.mergeCardData), generated, never typed.
 */
import { beforeEach, describe, expect, it } from "vitest";
import * as L from "./layers.js";
import * as G from "./gameState.js";
import * as T from "./triggers.js";
import * as LC from "./legalChoices.js";
import * as AD from "./actionDispatcher.js";
import * as GE from "./gameEngine.js";
import * as M from "./manaModel.js";
import * as CE from "./combatEvasion.js";
import * as CR from "./combatResolution.js";
import * as AR from "./attackRequirements.js";
import * as W from "./ward.js";
import * as SE from "./spellEffects.js";
import * as CS from "./costSacrifice.js";
import * as SBA from "./sba.js";
import * as PR from "./effects/parser.js";
import * as RP from "./effects/runProgram.js";
import * as EA from "./effects/effectAtoms.js";
import { classifyCard } from "./coverage.js";
import { printedAuraReading } from "./auraPrintedSide.js";
import { COMBAT_KEYWORDS, GRANTABLE_STATIC_KEYWORDS } from "./keywords.js";

beforeEach(() => G._resetIdsForTests());

// ─── the cards (bundled Scryfall data — generated, never typed) ──────────────────────────────────────────────────────────────────
// the 17 credited cards, then the creatures, Equipment, lands and spells the boards use
const CARDS = [
  {"name":"Lignify","type":"Kindred Enchantment — Treefolk Aura","mana":"{1}{G}","oracle":"Enchant creature\nEnchanted creature is a Treefolk with base power and toughness 0/4 and loses all abilities.","layout":"normal","cmc":2,"power":null,"toughness":null,"loyalty":null,"keywords":["Enchant"],"colors":["G"],"colorIdentity":["G"]},
  {"name":"Kasmina's Transmutation","type":"Enchantment — Aura","mana":"{1}{U}","oracle":"Enchant creature\nEnchanted creature loses all abilities and has base power and toughness 1/1.","layout":"normal","cmc":2,"power":null,"toughness":null,"loyalty":null,"keywords":["Enchant"],"colors":["U"],"colorIdentity":["U"]},
  {"name":"Ichthyomorphosis","type":"Enchantment — Aura","mana":"{2}{U}","oracle":"Enchant creature\nEnchanted creature loses all abilities and is a blue Fish with base power and toughness 0/1.","layout":"normal","cmc":3,"power":null,"toughness":null,"loyalty":null,"keywords":["Enchant"],"colors":["U"],"colorIdentity":["U"]},
  {"name":"Noggle the Mind","type":"Enchantment — Aura","mana":"{1}{U}","oracle":"Flash\nEnchant creature\nEnchanted creature loses all abilities and is a colorless Noggle with base power and toughness 1/1. (It loses all colors and all other creature types.)","layout":"normal","cmc":2,"power":null,"toughness":null,"loyalty":null,"keywords":["Enchant","Flash"],"colors":["U"],"colorIdentity":["U"]},
  {"name":"Retro-Mutation","type":"Enchantment — Aura","mana":"{2}{U}","oracle":"Flash\nEnchant creature\nEnchanted creature is a Turtle with base power and toughness 0/1. It can't attack and loses all abilities. (It also loses all other creature types.)","layout":"normal","cmc":3,"power":null,"toughness":null,"loyalty":null,"keywords":["Enchant","Flash"],"colors":["U"],"colorIdentity":["U"]},
  {"name":"Fresh Start","type":"Enchantment — Aura","mana":"{1}{U}","oracle":"Flash\nEnchant creature\nEnchanted creature gets -5/-0 and loses all abilities.","layout":"normal","cmc":2,"power":null,"toughness":null,"loyalty":null,"keywords":["Enchant","Flash"],"colors":["U"],"colorIdentity":["U"]},
  {"name":"Mystic Subdual","type":"Enchantment — Aura","mana":"{1}{U}","oracle":"Flash\nEnchant creature\nEnchanted creature gets -2/-0 and loses all abilities. (Mutating onto the creature won't give it new abilities. It can gain abilities in other ways.)","layout":"normal","cmc":2,"power":null,"toughness":null,"loyalty":null,"keywords":["Enchant","Flash"],"colors":["U"],"colorIdentity":["U"]},
  {"name":"Utter Insignificance","type":"Enchantment — Aura","mana":"{1}{U}","oracle":"Flash\nEnchant creature\nEnchanted creature loses all abilities and has base power and toughness 1/1.\n{2}{C}: Exile enchanted creature.","layout":"normal","cmc":2,"power":null,"toughness":null,"loyalty":null,"keywords":["Enchant","Flash"],"colors":["U"],"colorIdentity":["U"]},
  {"name":"Duskmourn's Domination","type":"Enchantment — Aura","mana":"{4}{U}{U}","oracle":"Enchant creature\nYou control enchanted creature.\nEnchanted creature gets -3/-0 and loses all abilities.","layout":"normal","cmc":6,"power":null,"toughness":null,"loyalty":null,"keywords":["Enchant"],"colors":["U"],"colorIdentity":["U"]},
  {"name":"Turn to Frog","type":"Instant","mana":"{1}{U}","oracle":"Until end of turn, target creature loses all abilities and becomes a blue Frog with base power and toughness 1/1.","layout":"normal","cmc":2,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["U"],"colorIdentity":["U"]},
  {"name":"Humble","type":"Instant","mana":"{1}{W}","oracle":"Until end of turn, target creature loses all abilities and has base power and toughness 0/1.","layout":"normal","cmc":2,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["W"],"colorIdentity":["W"]},
  {"name":"Ovinize","type":"Instant","mana":"{1}{U}","oracle":"Until end of turn, target creature loses all abilities and has base power and toughness 0/1.","layout":"normal","cmc":2,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["U"],"colorIdentity":["U"]},
  {"name":"Snakeform","type":"Instant","mana":"{2}{G/U}","oracle":"Until end of turn, target creature loses all abilities and becomes a green Snake with base power and toughness 1/1.\nDraw a card.","layout":"normal","cmc":3,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["G","U"],"colorIdentity":["G","U"]},
  {"name":"Gift of Tusks","type":"Instant","mana":"{U}","oracle":"Until end of turn, target creature loses all abilities and becomes a green Elephant with base power and toughness 3/3.","layout":"normal","cmc":1,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["U"],"colorIdentity":["U"]},
  {"name":"Turn // Burn","type":"Instant // Instant","mana":"{2}{U} // {1}{R}","oracle":"Turn - Instant {2}{U}\nUntil end of turn, target creature loses all abilities and becomes a red Weird with base power and toughness 0/1.\nFuse (You may cast one or both halves of this card from your hand.)\n//\nBurn - Instant {1}{R}\nBurn deals 2 damage to any target.\nFuse (You may cast one or both halves of this card from your hand.)","layout":"split","cmc":5,"power":null,"toughness":null,"loyalty":null,"keywords":["Fuse"],"colors":["R","U"],"colorIdentity":["R","U"],"card_faces":[{"name":"Turn","type_line":"Instant","oracle_text":"Until end of turn, target creature loses all abilities and becomes a red Weird with base power and toughness 0/1.\nFuse (You may cast one or both halves of this card from your hand.)","mana_cost":"{2}{U}","colors":[],"power":null,"toughness":null,"loyalty":null,"produced_mana":[]},{"name":"Burn","type_line":"Instant","oracle_text":"Burn deals 2 damage to any target.\nFuse (You may cast one or both halves of this card from your hand.)","mana_cost":"{1}{R}","colors":[],"power":null,"toughness":null,"loyalty":null,"produced_mana":[]}]},
  {"name":"Merfolk Trickster","type":"Creature — Merfolk Wizard","mana":"{U}{U}","oracle":"Flash\nWhen this creature enters, tap target creature an opponent controls. It loses all abilities until end of turn.","layout":"normal","cmc":2,"power":"2","toughness":"2","loyalty":null,"keywords":["Flash"],"colors":["U"],"colorIdentity":["U"]},
  {"name":"Warkite Marauder","type":"Creature — Human Pirate","mana":"{1}{U}","oracle":"Flying\nWhenever this creature attacks, target creature defending player controls loses all abilities and has base power and toughness 0/1 until end of turn.","layout":"normal","cmc":2,"power":"2","toughness":"1","loyalty":null,"keywords":["Flying"],"colors":["U"],"colorIdentity":["U"]},
  {"name":"Serra Angel","type":"Creature — Angel","mana":"{3}{W}{W}","oracle":"Flying\nVigilance (Attacking doesn't cause this creature to tap.)","layout":"normal","cmc":5,"power":"4","toughness":"4","loyalty":null,"keywords":["Flying","Vigilance"],"colors":["W"],"colorIdentity":["W"]},
  {"name":"Llanowar Elves","type":"Creature — Elf Druid","mana":"{G}","oracle":"{T}: Add {G}.","layout":"normal","cmc":1,"power":"1","toughness":"1","loyalty":null,"keywords":[],"colors":["G"],"colorIdentity":["G"]},
  {"name":"Prodigal Sorcerer","type":"Creature — Human Wizard Sorcerer","mana":"{2}{U}","oracle":"{T}: This creature deals 1 damage to any target.","layout":"normal","cmc":3,"power":"1","toughness":"1","loyalty":null,"keywords":[],"colors":["U"],"colorIdentity":["U"]},
  {"name":"Doomed Traveler","type":"Creature — Human Soldier","mana":"{W}","oracle":"When this creature dies, create a 1/1 white Spirit creature token with flying.","layout":"normal","cmc":1,"power":"1","toughness":"1","loyalty":null,"keywords":[],"colors":["W"],"colorIdentity":["W"]},
  {"name":"Silver Knight","type":"Creature — Human Knight","mana":"{W}{W}","oracle":"First strike, protection from red","layout":"normal","cmc":2,"power":"2","toughness":"2","loyalty":null,"keywords":["First strike","Protection"],"colors":["W"],"colorIdentity":["W"]},
  {"name":"Hulking Raptor","type":"Creature — Dinosaur","mana":"{2}{G}{G}","oracle":"Ward {2}\nAt the beginning of your first main phase, add {G}{G}.","layout":"normal","cmc":4,"power":"5","toughness":"3","loyalty":null,"keywords":["Ward"],"colors":["G"],"colorIdentity":["G"]},
  {"name":"Thragtusk","type":"Creature — Beast","mana":"{4}{G}","oracle":"When this creature enters, you gain 5 life.\nWhen this creature leaves the battlefield, create a 3/3 green Beast creature token.","layout":"normal","cmc":5,"power":"5","toughness":"3","loyalty":null,"keywords":[],"colors":["G"],"colorIdentity":["G"]},
  {"name":"Elvish Archdruid","type":"Creature — Elf Druid","mana":"{1}{G}{G}","oracle":"Other Elf creatures you control get +1/+1.\n{T}: Add {G} for each Elf you control.","layout":"normal","cmc":3,"power":"2","toughness":"2","loyalty":null,"keywords":[],"colors":["G"],"colorIdentity":["G"]},
  {"name":"Monastery Swiftspear","type":"Creature — Human Monk","mana":"{R}","oracle":"Haste\nProwess (Whenever you cast a noncreature spell, this creature gets +1/+1 until end of turn.)","layout":"normal","cmc":1,"power":"1","toughness":"2","loyalty":null,"keywords":["Prowess","Haste"],"colors":["R"],"colorIdentity":["R"]},
  {"name":"Grizzly Bears","type":"Creature — Bear","mana":"{1}{G}","oracle":"","layout":"normal","cmc":2,"power":"2","toughness":"2","loyalty":null,"keywords":[],"colors":["G"],"colorIdentity":["G"]},
  {"name":"Lion Sash","type":"Artifact Creature — Equipment Cat","mana":"{1}{W}","oracle":"{W}: Exile target card from a graveyard. If it was a permanent card, put a +1/+1 counter on this permanent.\nEquipped creature gets +1/+1 for each +1/+1 counter on this Equipment.\nReconfigure {2} ({2}: Attach to target creature you control; or unattach from a creature. Reconfigure only as a sorcery. While attached, this isn't a creature.)","layout":"normal","cmc":2,"power":"1","toughness":"1","loyalty":null,"keywords":["Reconfigure"],"colors":["W"],"colorIdentity":["W"]},
  {"name":"Viridian Longbow","type":"Artifact — Equipment","mana":"{1}","oracle":"Equipped creature has \"{T}: This creature deals 1 damage to any target.\"\nEquip {3} ({3}: Attach to target creature you control. Equip only as a sorcery.)","layout":"normal","cmc":1,"power":null,"toughness":null,"loyalty":null,"keywords":["Equip"],"colors":[],"colorIdentity":[]},
  {"name":"Cobbled Wings","type":"Artifact — Equipment","mana":"{2}","oracle":"Equipped creature has flying.\nEquip {1} ({1}: Attach to target creature you control. Equip only as a sorcery.)","layout":"normal","cmc":2,"power":null,"toughness":null,"loyalty":null,"keywords":["Equip"],"colors":[],"colorIdentity":[]},
  {"name":"Giant Spider","type":"Creature — Spider","mana":"{3}{G}","oracle":"Reach (This creature can block creatures with flying.)","layout":"normal","cmc":4,"power":"2","toughness":"4","loyalty":null,"keywords":["Reach"],"colors":["G"],"colorIdentity":["G"]},
  {"name":"Ornithopter","type":"Artifact Creature — Thopter","mana":"{0}","oracle":"Flying","layout":"normal","cmc":0,"power":"0","toughness":"2","loyalty":null,"keywords":["Flying"],"colors":[],"colorIdentity":[]},
  {"name":"Forest","type":"Basic Land — Forest","mana":"","oracle":"({T}: Add {G}.)","layout":"normal","cmc":0,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":["G"]},
  {"name":"Island","type":"Basic Land — Island","mana":"","oracle":"({T}: Add {U}.)","layout":"normal","cmc":0,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":["U"]},
  {"name":"Plains","type":"Basic Land — Plains","mana":"","oracle":"({T}: Add {W}.)","layout":"normal","cmc":0,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":["W"]},
  {"name":"Mountain","type":"Basic Land — Mountain","mana":"","oracle":"({T}: Add {R}.)","layout":"normal","cmc":0,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":["R"]},
  {"name":"Swamp","type":"Basic Land — Swamp","mana":"","oracle":"({T}: Add {B}.)","layout":"normal","cmc":0,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":["B"]},
  {"name":"Lightning Bolt","type":"Instant","mana":"{R}","oracle":"Lightning Bolt deals 3 damage to any target.","layout":"normal","cmc":1,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["R"],"colorIdentity":["R"]},
  {"name":"Ajani's Pridemate","type":"Creature — Cat Soldier","mana":"{1}{W}","oracle":"Whenever you gain life, put a +1/+1 counter on this creature.","layout":"normal","cmc":2,"power":"2","toughness":"2","loyalty":null,"keywords":[],"colors":["W"],"colorIdentity":["W"]},
  {"name":"Brass Squire","type":"Artifact Creature — Myr","mana":"{3}","oracle":"{T}: Attach target Equipment you control to target creature you control.","layout":"normal","cmc":3,"power":"1","toughness":"3","loyalty":null,"keywords":[],"colors":[],"colorIdentity":[]},
  {"name":"Sixth Sense","type":"Enchantment — Aura","mana":"{G}","oracle":"Enchant creature\nEnchanted creature has \"Whenever this creature deals combat damage to a player, you may draw a card.\"","layout":"normal","cmc":1,"power":null,"toughness":null,"loyalty":null,"keywords":["Enchant"],"colors":["G"],"colorIdentity":["G"]},
  {"name":"Elvish Mystic","type":"Creature — Elf Druid","mana":"{G}","oracle":"{T}: Add {G}.","layout":"normal","cmc":1,"power":"1","toughness":"1","loyalty":null,"keywords":[],"colors":["G"],"colorIdentity":["G"]},
  {"name":"Wall of Wood","type":"Creature — Wall","mana":"{G}","oracle":"Defender (This creature can't attack.)","layout":"normal","cmc":1,"power":"0","toughness":"3","loyalty":null,"keywords":["Defender"],"colors":["G"],"colorIdentity":["G"]},
  {"name":"Blood Artist","type":"Creature — Vampire","mana":"{1}{B}","oracle":"Whenever this creature or another creature dies, target player loses 1 life and you gain 1 life.","layout":"normal","cmc":2,"power":"0","toughness":"1","loyalty":null,"keywords":[],"colors":["B"],"colorIdentity":["B"]},
  {"name":"Vampire Nighthawk","type":"Creature — Vampire Shaman","mana":"{1}{B}{B}","oracle":"Flying\nDeathtouch (Any amount of damage this deals to a creature is enough to destroy it.)\nLifelink (Damage dealt by this creature also causes you to gain that much life.)","layout":"normal","cmc":3,"power":"2","toughness":"3","loyalty":null,"keywords":["Deathtouch","Flying","Lifelink"],"colors":["B"],"colorIdentity":["B"]},
  {"name":"Birds of Paradise","type":"Creature — Bird","mana":"{G}","oracle":"Flying\n{T}: Add one mana of any color.","layout":"normal","cmc":1,"power":"0","toughness":"1","loyalty":null,"keywords":["Flying"],"colors":["G"],"colorIdentity":["G"]},
  {"name":"Mother of Runes","type":"Creature — Human Cleric","mana":"{W}","oracle":"{T}: Target creature you control gains protection from the color of your choice until end of turn.","layout":"normal","cmc":1,"power":"1","toughness":"1","loyalty":null,"keywords":[],"colors":["W"],"colorIdentity":["W"]},
  {"name":"Elvish Visionary","type":"Creature — Elf Shaman","mana":"{1}{G}","oracle":"When this creature enters, draw a card.","layout":"normal","cmc":2,"power":"1","toughness":"1","loyalty":null,"keywords":[],"colors":["G"],"colorIdentity":["G"]},
  {"name":"Cloud Elemental","type":"Creature — Elemental","mana":"{2}{U}","oracle":"Flying\nThis creature can block only creatures with flying.","layout":"normal","cmc":3,"power":"2","toughness":"3","loyalty":null,"keywords":["Flying"],"colors":["U"],"colorIdentity":["U"]},
  {"name":"Juggernaut","type":"Artifact Creature — Juggernaut","mana":"{4}","oracle":"This creature attacks each combat if able.\nThis creature can't be blocked by Walls.","layout":"normal","cmc":4,"power":"5","toughness":"3","loyalty":null,"keywords":[],"colors":[],"colorIdentity":[]},
  {"name":"Lord of Atlantis","type":"Creature — Merfolk","mana":"{U}{U}","oracle":"Other Merfolk get +1/+1 and have islandwalk. (They can't be blocked as long as defending player controls an Island.)","layout":"normal","cmc":2,"power":"2","toughness":"2","loyalty":null,"keywords":[],"colors":["U"],"colorIdentity":["U"]},
  {"name":"Fog Bank","type":"Creature — Wall","mana":"{1}{U}","oracle":"Defender (This creature can't attack.)\nFlying\nPrevent all combat damage that would be dealt to and dealt by this creature.","layout":"normal","cmc":2,"power":"0","toughness":"2","loyalty":null,"keywords":["Flying","Defender"],"colors":["U"],"colorIdentity":["U"]},
  {"name":"Venerated Rotpriest","type":"Creature — Phyrexian Druid","mana":"{G}","oracle":"Toxic 1 (Players dealt combat damage by this creature also get a poison counter.)\nWhenever a creature you control becomes the target of a spell, target opponent gets a poison counter.","layout":"normal","cmc":1,"power":"1","toughness":"2","loyalty":null,"keywords":["Toxic"],"colors":["G"],"colorIdentity":["G"]},
  {"name":"Hellrider","type":"Creature — Devil","mana":"{2}{R}{R}","oracle":"Haste\nWhenever a creature you control attacks, this creature deals 1 damage to the player or planeswalker it's attacking.","layout":"normal","cmc":4,"power":"3","toughness":"3","loyalty":null,"keywords":["Haste"],"colors":["R"],"colorIdentity":["R"]},
  {"name":"Ulamog's Crusher","type":"Creature — Eldrazi","mana":"{8}","oracle":"Annihilator 2 (Whenever this creature attacks, defending player sacrifices two permanents of their choice.)\nThis creature attacks each combat if able.","layout":"normal","cmc":8,"power":"8","toughness":"8","loyalty":null,"keywords":["Annihilator"],"colors":[],"colorIdentity":[]},
  {"name":"Palace Guard","type":"Creature — Human Soldier","mana":"{2}{W}","oracle":"This creature can block any number of creatures.","layout":"normal","cmc":3,"power":"1","toughness":"4","loyalty":null,"keywords":[],"colors":["W"],"colorIdentity":["W"]},
  {"name":"Darksteel Myr","type":"Artifact Creature — Myr","mana":"{3}","oracle":"Indestructible (Damage and effects that say \"destroy\" don't destroy this creature. If its toughness is 0 or less, it still dies.)","layout":"normal","cmc":3,"power":"0","toughness":"1","loyalty":null,"keywords":["Indestructible"],"colors":[],"colorIdentity":[]},
  {"name":"Dauthi Slayer","type":"Creature — Dauthi Soldier","mana":"{B}{B}","oracle":"Shadow (This creature can block or be blocked by only creatures with shadow.)\nThis creature attacks each combat if able.","layout":"normal","cmc":2,"power":"2","toughness":"2","loyalty":null,"keywords":["Shadow"],"colors":["B"],"colorIdentity":["B"]},
  {"name":"Sign in Blood","type":"Sorcery","mana":"{B}{B}","oracle":"Target player draws two cards and loses 2 life.","layout":"normal","cmc":2,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["B"],"colorIdentity":["B"]},
  {"name":"Phantom Warrior","type":"Creature — Illusion Warrior","mana":"{1}{U}{U}","oracle":"This creature can't be blocked.","layout":"normal","cmc":3,"power":"2","toughness":"2","loyalty":null,"keywords":[],"colors":["U"],"colorIdentity":["U"]},
  {"name":"Charging Rhino","type":"Creature — Rhino","mana":"{3}{G}{G}","oracle":"This creature can't be blocked by more than one creature.","layout":"normal","cmc":5,"power":"4","toughness":"4","loyalty":null,"keywords":[],"colors":["G"],"colorIdentity":["G"]},
  // the review's F1: creatures with a "*" stat their characteristic-defining ability sets (CR 208.2a) — Plague Rats one the engine does not model (Glorious Anthem reaches it, so its layer 7 runs) — and one whose "*" is an "As this enters" choice (CR 208.2b)
  {"name":"Crusader of Odric","type":"Creature — Human Soldier","mana":"{2}{W}","oracle":"Crusader of Odric's power and toughness are each equal to the number of creatures you control.","layout":"normal","cmc":3,"power":"*","toughness":"*","loyalty":null,"keywords":[],"colors":["W"],"colorIdentity":["W"]},
  {"name":"Tarmogoyf","type":"Creature — Lhurgoyf","mana":"{1}{G}","oracle":"Tarmogoyf's power is equal to the number of card types among cards in all graveyards and its toughness is equal to that number plus 1.","layout":"normal","cmc":2,"power":"*","toughness":"1+*","loyalty":null,"keywords":[],"colors":["G"],"colorIdentity":["G"]},
  {"name":"Nighthawk Scavenger","type":"Creature — Vampire Rogue","mana":"{1}{B}{B}","oracle":"Flying, deathtouch, lifelink\nNighthawk Scavenger's power is equal to 1 plus the number of card types among cards in your opponents' graveyards.","layout":"normal","cmc":3,"power":"1+*","toughness":"3","loyalty":null,"keywords":["Deathtouch","Flying","Lifelink"],"colors":["B"],"colorIdentity":["B"]},
  {"name":"Primal Clay","type":"Artifact Creature — Shapeshifter","mana":"{4}","oracle":"As this creature enters, it becomes your choice of a 3/3 artifact creature, a 2/2 artifact creature with flying, or a 1/6 Wall artifact creature with defender in addition to its other types. (A creature with defender can't attack.)","layout":"normal","cmc":4,"power":"*","toughness":"*","loyalty":null,"keywords":[],"colors":[],"colorIdentity":[]},
  {"name":"Plague Rats","type":"Creature — Rat","mana":"{2}{B}","oracle":"Plague Rats's power and toughness are each equal to the number of creatures named Plague Rats on the battlefield.","layout":"normal","cmc":3,"power":"*","toughness":"*","loyalty":null,"keywords":[],"colors":["B"],"colorIdentity":["B"]},
  {"name":"Glorious Anthem","type":"Enchantment","mana":"{1}{W}{W}","oracle":"Creatures you control get +1/+1.","layout":"normal","cmc":3,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["W"],"colorIdentity":["W"]},
];
// one of Very Cryptic Command's printed variants (not Commander-legal) — its third mode is Turn to Frog's sentence
const VCC_FROG = {"name":"Very Cryptic Command","type":"Instant","mana":"{1}{U}{U}{U}","oracle":"Choose two —\n• Draw a card from an opponent's library.\n• Copy target instant or sorcery spell. You may choose new targets for the copy.\n• Until end of turn, target creature loses all abilities and becomes a blue Frog with base power and toughness 1/1.\n• Create a 1/1 colorless Gnome artifact creature token.","layout":"normal","cmc":4,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["U"],"colorIdentity":["U"]};
// the family S1 does not build (and two whose loss line it reads), for the kept-parked row
const KEPT = [
  {"name":"Quantum Reduction","type":"Enchantment — Aura","mana":"{1}{U}","oracle":"Teamwork 2 (As an additional cost to cast this spell, you may tap any number of creatures you control with total power 2 or more.)\nYou may cast this spell as though it had flash if it's cast using teamwork.\nEnchant creature\nEnchanted creature gets -5/-0 and loses all abilities.","layout":"normal","cmc":2,"power":null,"toughness":null,"loyalty":null,"keywords":["Enchant","Teamwork"],"colors":["U"],"colorIdentity":["U"]},
  {"name":"Spider-Man No More","type":"Enchantment — Aura","mana":"{1}{U}","oracle":"Enchant creature\nEnchanted creature is a Citizen with base power and toughness 1/1. It has defender and loses all other abilities. (It also loses all other creature types.)","layout":"normal","cmc":2,"power":null,"toughness":null,"loyalty":null,"keywords":["Enchant"],"colors":["U"],"colorIdentity":["U"]},
  {"name":"Obscura Confluence","type":"Instant","mana":"{1}{W}{U}{B}","oracle":"Choose three. You may choose the same mode more than once.\n• Until end of turn, target creature loses all abilities and has base power and toughness 1/1.\n• Target creature connives. (Draw a card, then discard a card. If you discarded a nonland card, put a +1/+1 counter on that creature.)\n• Target player returns a creature card from their graveyard to their hand.","layout":"normal","cmc":4,"power":null,"toughness":null,"loyalty":null,"keywords":["Connive"],"colors":["B","U","W"],"colorIdentity":["B","U","W"]},
  {"name":"Kenrith's Transformation","type":"Enchantment — Aura","mana":"{1}{G}","oracle":"Enchant creature\nWhen this Aura enters, draw a card.\nEnchanted creature loses all abilities and is a green Elk creature with base power and toughness 3/3. (It loses all other card types and creature types.)","layout":"normal","cmc":2,"power":null,"toughness":null,"loyalty":null,"keywords":["Enchant"],"colors":["G"],"colorIdentity":["G"]},
  {"name":"Frogify","type":"Enchantment — Aura","mana":"{1}{U}","oracle":"Enchant creature\nEnchanted creature loses all abilities and is a blue Frog creature with base power and toughness 1/1. (It loses all other card types and creature types.)","layout":"normal","cmc":2,"power":null,"toughness":null,"loyalty":null,"keywords":["Enchant"],"colors":["U"],"colorIdentity":["U"]},
  {"name":"Darksteel Mutation","type":"Enchantment — Aura","mana":"{1}{W}","oracle":"Enchant creature\nEnchanted creature is an Insect artifact creature with base power and toughness 0/1 and has indestructible, and it loses all other abilities, card types, and creature types.","layout":"normal","cmc":2,"power":null,"toughness":null,"loyalty":null,"keywords":["Enchant"],"colors":["W"],"colorIdentity":["W"]},
  {"name":"Stasis Field","type":"Enchantment — Aura","mana":"{1}{U}","oracle":"Enchant creature\nEnchanted creature has base power and toughness 0/2, has defender, and loses all other abilities.","layout":"normal","cmc":2,"power":null,"toughness":null,"loyalty":null,"keywords":["Enchant"],"colors":["U"],"colorIdentity":["U"]},
  {"name":"Humility","type":"Enchantment","mana":"{2}{W}{W}","oracle":"All creatures lose all abilities and have base power and toughness 1/1.","layout":"normal","cmc":4,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["W"],"colorIdentity":["W"]},
  {"name":"Sudden Spoiling","type":"Instant","mana":"{1}{B}{B}","oracle":"Split second (As long as this spell is on the stack, players can't cast spells or activate abilities that aren't mana abilities.)\nUntil end of turn, creatures target player controls lose all abilities and have base power and toughness 0/2.","layout":"normal","cmc":3,"power":null,"toughness":null,"loyalty":null,"keywords":["Split second"],"colors":["B"],"colorIdentity":["B"]},
  {"name":"Abigale, Eloquent First-Year","type":"Legendary Creature — Bird Bard","mana":"{W/B}{W/B}","oracle":"Flying, first strike, lifelink\nWhen Abigale enters, up to one other target creature loses all abilities. Put a flying counter, a first strike counter, and a lifelink counter on that creature.","layout":"normal","cmc":2,"power":"1","toughness":"1","loyalty":null,"keywords":["Flying","Lifelink","First strike"],"colors":["B","W"],"colorIdentity":["B","W"]},
  {"name":"Nullhide Ferox","type":"Creature — Beast","mana":"{2}{G}{G}","oracle":"Hexproof\nYou can't cast noncreature spells.\n{2}: This creature loses all abilities until end of turn. Any player may activate this ability.\nIf a spell or ability an opponent controls causes you to discard this card, put it onto the battlefield instead of putting it into your graveyard.","layout":"normal","cmc":4,"power":"6","toughness":"6","loyalty":null,"keywords":["Hexproof"],"colors":["G"],"colorIdentity":["G"]},
  {"name":"Mercurial Transformation","type":"Sorcery — Lesson","mana":"{1}{U}","oracle":"Until end of turn, target nonland permanent loses all abilities and becomes your choice of a blue Frog creature with base power and toughness 1/1 or a blue Octopus creature with base power and toughness 4/4.","layout":"normal","cmc":2,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["U"],"colorIdentity":["U"]},
  {"name":"Barrow-Blade","type":"Artifact — Equipment","mana":"{1}","oracle":"Equipped creature gets +1/+1.\nWhenever equipped creature blocks or becomes blocked by a creature, that creature loses all abilities until end of turn.\nEquip {1} ({1}: Attach to target creature you control. Equip only as a sorcery.)","layout":"normal","cmc":1,"power":null,"toughness":null,"loyalty":null,"keywords":["Equip"],"colors":[],"colorIdentity":[]},
  {"name":"Polymorphist's Jest","type":"Instant","mana":"{1}{U}{U}","oracle":"Until end of turn, each creature target player controls loses all abilities and becomes a blue Frog with base power and toughness 1/1.","layout":"normal","cmc":3,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["U"],"colorIdentity":["U"]},
  {"name":"Dragonshift","type":"Instant","mana":"{1}{U}{R}","oracle":"Until end of turn, target creature you control becomes a blue and red Dragon with base power and toughness 4/4, loses all abilities, and gains flying.\nOverload {3}{U}{U}{R}{R} (You may cast this spell for its overload cost. If you do, change \"target\" in its text to \"each.\")","layout":"normal","cmc":3,"power":null,"toughness":null,"loyalty":null,"keywords":["Overload"],"colors":["R","U"],"colorIdentity":["R","U"]},
  {"name":"Observed Stasis","type":"Enchantment — Aura","mana":"{3}{U}","oracle":"Flash\nEnchant creature an opponent controls\nWhen this Aura enters, remove enchanted creature from combat. Then draw a card for each tapped creature its controller controls.\nEnchanted creature loses all abilities and can't attack or block.","layout":"normal","cmc":4,"power":null,"toughness":null,"loyalty":null,"keywords":["Enchant","Flash"],"colors":["U"],"colorIdentity":["U"]},
  {"name":"Tamiyo's Compleation","type":"Enchantment — Aura","mana":"{3}{U}","oracle":"Flash\nEnchant artifact, creature, or planeswalker\nWhen this Aura enters, tap enchanted permanent. If it's an Equipment, unattach it.\nEnchanted permanent loses all abilities and doesn't untap during its controller's untap step.","layout":"normal","cmc":4,"power":null,"toughness":null,"loyalty":null,"keywords":["Enchant","Flash"],"colors":["U"],"colorIdentity":["U"]},
  {"name":"Oko, Thief of Crowns","type":"Legendary Planeswalker — Oko","mana":"{1}{G}{U}","oracle":"+2: Create a Food token. (It's an artifact with \"{2}, {T}, Sacrifice this token: You gain 3 life.\")\n+1: Target artifact or creature loses all abilities and becomes a green Elk creature with base power and toughness 3/3.\n−5: Exchange control of target artifact or creature you control and target creature an opponent controls with power 3 or less.","layout":"normal","cmc":3,"power":null,"toughness":null,"loyalty":"4","keywords":["Food"],"colors":["G","U"],"colorIdentity":["G","U"]},
  {"name":"Trickster's Elk","type":"Enchantment Creature — Elk","mana":"{2}{G}","oracle":"Bestow {1}{G} (If you cast this card for its bestow cost, it's an Aura spell with enchant creature. It becomes a creature again if it's not attached.)\nEnchanted creature loses all abilities and is a green Elk creature with base power and toughness 3/3.","layout":"normal","cmc":3,"power":"3","toughness":"3","loyalty":null,"keywords":["Bestow"],"colors":["G"],"colorIdentity":["G"]},
  {"name":"Eye of Nidhogg","type":"Legendary Enchantment — Aura","mana":"{2}{B}","oracle":"Enchant creature\nEnchanted creature is a black Dragon with base power and toughness 4/2, has flying and deathtouch, and is goaded. (It attacks each combat if able and attacks a player other than you if able.)\nWhen Eye of Nidhogg is put into a graveyard from the battlefield, return it to its owner's hand.","layout":"normal","cmc":3,"power":null,"toughness":null,"loyalty":null,"keywords":["Goad","Enchant"],"colors":["B"],"colorIdentity":["B"]},
];
const card = (name) => {
  const c = CARDS.find((x) => x.name === name) ?? KEPT.find((x) => x.name === name);
  if (!c) throw new Error(`not in the fixture: ${name}`);
  return c;
};
const NEUTRAL = "Probe Permanent";
const ID = "probe";
// The whole keyword vocabulary (the combat keywords, every grantable keyword, and the keyword-shaped words the engine reads).
const VOCAB = [...new Set([...COMBAT_KEYWORDS, ...GRANTABLE_STATIC_KEYWORDS, "changeling", "protection", "ward", "undying", "exalted",
  "flanking", "prowess", "annihilator", "toxic", "riot", "defender", "haste"].map((k) => String(k).toLowerCase()))];
const ABILITY_KINDS = new Set(["activate-ability", "tap-for-mana", "crew-vehicle", "double-mana-pool", "activate-loyalty"]);
const POOL = { W: 9, U: 9, B: 9, R: 9, G: 9, C: 9 };
const PANEL = ["Grizzly Bears", "Ornithopter", "Giant Spider", "Wall of Wood", "Dauthi Slayer"];
const other = (seat) => (seat === "user" ? "ai" : "user");

/** The no-text twin of `c`: the same characteristics, no rules text, no keywords, the given name. */
function twinOf(c, name = NEUTRAL) {
  const { card_faces: _f, ...rest } = c;
  return { ...rest, name, oracle: "", keywords: [], layout: "normal" };
}

/**
 * A two-player board in the user's precombat main phase (turn 3, the user active with priority, a deep mana pool for both): `user` /
 * `ai` are [id, card] lists (every permanent untapped, not summoning sick, timestamps 1…N); `hand` names the user's hand.
 */
function board({ user = [], ai = [], hand = [] } = {}) {
  const s0 = G.createGameState({ userDeck: [], aiDeck: [] });
  let ts = 1;
  const perm = (id, c, controller) => ({ ...G.createPermanent({ id, card: { ...c, id: `card-${id}` }, controller, summoningSick: false }), timestamp: ts++, enteredOnTurn: 1 });
  const lands = (seat) => ["Forest", "Island", "Plains", "Swamp", "Mountain"].map((n, i) => [`${seat}-land-${i}`, card(n)]);
  return {
    ...s0, turn: 3, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", timestampCounter: 100,
    players: {
      ...s0.players,
      user: { ...s0.players.user, battlefield: [...user, ...lands("user")].map(([id, c]) => perm(id, c, "user")), hand: hand.map((n, i) => ({ ...card(n), id: `hand-${i}` })),
        manaPool: { ...s0.players.user.manaPool, ...POOL }, library: [{ ...card("Forest"), id: "lib-0" }, { ...card("Island"), id: "lib-1" }, { ...card("Plains"), id: "lib-2" }] },
      ai: { ...s0.players.ai, battlefield: [...ai, ...lands("ai")].map(([id, c]) => perm(id, c, "ai")), hand: [], manaPool: { ...s0.players.ai.manaPool, ...POOL },
        library: [{ ...card("Island"), id: "ai-lib-0" }, { ...card("Forest"), id: "ai-lib-1" }] },
    },
  };
}
const permOf = (s, id) => G.findPermanent(s, id)?.permanent ?? null;
const controllerOf = (s, id) => G.findPermanent(s, id)?.controller ?? null;
/** Resolve the stack, flushing triggers with the engine's own chooser, until it is empty; a ward's "unless its controller pays" is paid
 *  (the caster pays it from the deep pool — CR 702.21a). */
function settle(s) {
  for (let i = 0; i < 24; i++) {
    if (s.pendingChoice?.kind === "soft-counter") { s = RP.resolveSoftCounterChoice(s, true); continue; }
    if (s.pendingChoice) break;
    if ((s.stack || []).length) s = GE.flushTriggers(GE.resolveTopOfStack(s), { chooseTargets: GE.chooseTriggerTargets });
    else if ((s.pendingTriggers || []).length) s = GE.flushTriggers(s, { chooseTargets: GE.chooseTriggerTargets });
    else break;
  }
  return s;
}
/** Cast `name` (a card in the user's hand; a split card's half by the half's name) at `targetId` through the real cast lane, and resolve it. */
function castAt(s, name, targetId) {
  const acts = LC.legalActionsForPlayer(s, "user").filter((a) => a.kind === "cast-spell" && a.name === name && (targetId == null || a.targets?.[0]?.id === targetId));
  expect(acts.length, `${name} at ${targetId} is offered`).toBeGreaterThan(0);
  return settle(AD.dispatchAction(s, acts[0]));
}
/** End the turn's "until end of turn" effects as the cleanup step does (CR 514.2). */
const cleanup = (s) => L.expireContinuousEffects(s, { atCleanupOfTurn: s.turn });
/** What the creature IS: power / toughness, card types, subtypes, colours and every keyword of the vocabulary it has. */
function chars(s, id) {
  const t = L.permanentTypes(s, id);
  return { pt: [L.permanentPower(s, id), L.permanentToughness(s, id)], types: [...t.types].sort(), subtypes: [...t.subtypes].sort(),
    colors: [...L.permanentColors(s, id)].sort(), keywords: VOCAB.filter((k) => L.permanentHasKeyword(s, id, k)) };
}
/** The state re-seated in `seat`'s precombat main phase with priority (to read what that seat may do), no combat and an empty stack. */
const seated = (s, seat) => ({ ...s, activePlayer: seat, priorityHolder: seat, phase: "precombat-main", step: "main", combat: null, stack: [], pendingTriggers: [] });

/**
 * THE S1 EFFECT on the probe through its card's real program: an Aura or a spell cast by the user at the probe; Merfolk Trickster cast
 * (its enters trigger, the engine's chooser, takes the opponent's only creature — the probe); Warkite Marauder attacking (its attack
 * trigger takes the defending player's only creature — the probe). The probe is the OPPONENT's creature (the use the cards are made
 * for): an ability of the caster's own creature that triggers as the S1 card is cast — Monastery Swiftspear's prowess — fires while the
 * creature still has it, and resolves first (CR 603.2, 113.7a), which is right and is no twin's.
 */
const S1_AURAS = ["Lignify", "Kasmina's Transmutation", "Ichthyomorphosis", "Noggle the Mind", "Retro-Mutation", "Fresh Start", "Mystic Subdual", "Utter Insignificance", "Duskmourn's Domination"];
const S1_SPELLS = ["Turn to Frog", "Humble", "Ovinize", "Snakeform", "Gift of Tusks", "Turn // Burn"];
const S1_CREATURES = ["Merfolk Trickster", "Warkite Marauder"];
const hostSeatOf = () => "ai";
function s1Board(name, probe, extra = {}) {
  const seat = hostSeatOf(name);
  const panel = PANEL.map((n, i) => [`panel-${i}`, card(n)]);
  const sides = seat === "user" ? { user: [[ID, probe], ...(extra.user || [])], ai: [...panel, ...(extra.ai || [])] } : { user: [...panel, ...(extra.user || [])], ai: [[ID, probe], ...(extra.ai || [])] };
  if (name === "Warkite Marauder") sides.user = [["kite", card("Warkite Marauder")], ...sides.user];
  return board({ ...sides, hand: name === "Warkite Marauder" ? [] : [name] });
}
function applyS1(s, name) {
  if (name === "Turn // Burn") return castAt(s, "Turn", ID);
  if (name === "Merfolk Trickster") return castAt(s, "Merfolk Trickster", null);
  if (name === "Warkite Marauder") {
    const atk = { ...s, phase: "combat", step: "declare-attackers", combat: { attackers: [{ permanentId: "kite", attackingPlayer: "user", defender: "ai" }], blockers: [] } };
    return settle(GE.flushTriggers(T.checkAttackTriggers(atk), { chooseTargets: GE.chooseTriggerTargets }));
  }
  return castAt(s, name, ID);
}

// ─── the readers (each a count of what it reads off the probe) ─────────────────────────────────────────────────────────────────
const fresh = (s) => ({ ...s, pendingTriggers: [] });
const fromProbe = (s) => (s.pendingTriggers || []).filter((t) => t.source?.permanentId === ID).length;
function deathOf(s, id) {
  const seat = controllerOf(s, id);
  const lk = G.deathLookback(s, permOf(s, id), seat);
  return { lk, after: G.moveCardToZone(s, { playerId: seat, fromZone: "battlefield", toZone: "graveyard", cardId: id }) };
}
const READERS = [
  ["dies: its dies triggers (deathLookback → checkDiesTriggers — CR 603.10a)", (s) => { const { lk, after } = deathOf(s, ID); return fromProbe(T.checkDiesTriggers(fresh(after), [lk])); }],
  ["leaves: its leave triggers as it is destroyed (applyDestroyEffect)", (s) => fromProbe(SE.applyDestroyEffect(fresh(s), { controller: other(controllerOf(s, ID)), targets: [{ type: "creature", id: ID }] }))],
  ["cast: its controller casts a spell (checkCastTriggers)", (s) => ["Lightning Bolt", "Sign in Blood"].reduce((n, sp) => n + fromProbe(T.checkCastTriggers(fresh(s), { spellCard: { ...card(sp), id: `cast-${sp}` }, casterId: controllerOf(s, ID) })), 0)],
  ["lifegain: its controller gains life (checkLifegainTriggers)", (s) => fromProbe(T.checkLifegainTriggers(fresh(s), controllerOf(s, ID), 1))],
  ["attacks: it attacks (checkAttackTriggers)", (s) => { const seat = controllerOf(s, ID); return fromProbe(T.checkAttackTriggers(fresh({ ...seated(s, seat), phase: "combat", step: "declare-attackers", combat: { attackers: [{ permanentId: ID, attackingPlayer: seat, defender: other(seat) }], blockers: [] } }))); }],
  ["activated: legal actions sourced from it (legalActionsForPlayer)", (s) => { const seat = controllerOf(s, ID); return LC.legalActionsForPlayer(seated(s, seat), seat).filter((a) => ABILITY_KINDS.has(a.kind) && a.permanentId === ID).length; }],
  ["mana: its mana sources (manaSources)", (s) => M.manaSources(s, controllerOf(s, ID)).filter((m) => m.permanentId === ID).length],
  ["keywords: permanentHasKeyword over the vocabulary", (s) => VOCAB.filter((k) => L.permanentHasKeyword(s, ID, k)).length],
  ["protection: colours and classes", (s) => L.permanentProtectionColors(s, ID).size + L.permanentProtectionClasses(s, ID).size],
  ["ward: an opponent's spell targeting it (wardTaxForStackObject)", (s) => (W.wardTaxForStackObject(s, { controller: other(controllerOf(s, ID)), targets: [{ type: "creature", id: ID }], source: { ...card("Lightning Bolt") } }) ? 1 : 0)],
  ["statics: collected effects at layer 6+ sourced from it", (s) => L.collectContinuousEffects(s).filter((e) => e.source?.kind === "static" && e.source.permanentId === ID && !(e.layer >= 1 && e.layer <= 5)).length],
];
const poisonOf = (s, pid) => s.players[pid].poison ?? s.players[pid].poisonCounters ?? 0;
/** The whole readout the twin comparison compares (combat legality both ways, combat damage, every legal action of its controller). */
function twinReadout(s) {
  const seat = controllerOf(s, ID);
  const opp = other(seat);
  const panelIds = (s.players[opp].battlefield || []).filter((p) => /^panel-/.test(p.id)).map((p) => p.id);
  const main = seated(s, seat);
  const attack = { ...main, phase: "combat", step: "declare-attackers", combat: { attackers: [], blockers: [] } };
  const unblocked = CR.resolveCombatDamage({ ...main, phase: "combat", step: "combat-damage", combat: { attackers: [{ permanentId: ID, attackingPlayer: seat, defender: opp }], blockers: [] } });
  const blocking = CR.resolveCombatDamage({ ...main, activePlayer: opp, phase: "combat", step: "combat-damage", combat: { attackers: [{ permanentId: "panel-0", attackingPlayer: opp, defender: seat }], blockers: [{ blockerId: ID, attackerId: "panel-0" }] } });
  return {
    chars: chars(s, ID),
    attacksPanel: panelIds.map((b) => CE.canBlockAttacker(s, b, ID, opp)),
    blocksPanel: panelIds.map((a) => CE.canBlockAttacker(s, ID, a, seat)),
    minBlockers: CE.attackerMinBlockers(s, ID),
    cantAttack: CE.selfCantAttackNow(s, permOf(s, ID)), cantBlock: CE.selfCantBlockNow(s, permOf(s, ID)), mustAttack: AR.mustAttackNow(s, seat, permOf(s, ID)),
    // what its combat damage does (a change from the board it is read on: an ability that triggered as the S1 card targeted it —
    // Venerated Rotpriest's poison counter — has already resolved there, while the creature still had it, CR 603.2)
    hit: [unblocked.players[opp].life - main.players[opp].life, unblocked.players[seat].life - main.players[seat].life, poisonOf(unblocked, opp) - poisonOf(main, opp)],
    block: [(permOf(blocking, ID)?.damageMarked ?? 0) - (permOf(main, ID)?.damageMarked ?? 0), (permOf(blocking, "panel-0")?.damageMarked ?? 0) - (permOf(main, "panel-0")?.damageMarked ?? 0)],
    mainActions: JSON.stringify(LC.legalActionsForPlayer(main, seat).filter((a) => a.permanentId === ID || a.kind === "declare-attacker")),
    attackActions: JSON.stringify(LC.legalActionsForPlayer(attack, seat).filter((a) => a.permanentId === ID)),
  };
}
// The census carriers: real creatures each carrying abilities some reader above reads (keywords, mana, activated, dies / leave / cast /
// lifegain / attack triggers, protection, ward, a lord's static, combat restrictions).
const CARRIERS = ["Serra Angel", "Vampire Nighthawk", "Llanowar Elves", "Birds of Paradise", "Prodigal Sorcerer", "Mother of Runes", "Doomed Traveler",
  "Blood Artist", "Thragtusk", "Monastery Swiftspear", "Ajani's Pridemate", "Silver Knight", "Hulking Raptor", "Charging Rhino", "Phantom Warrior",
  "Cloud Elemental", "Juggernaut", "Elvish Archdruid", "Lord of Atlantis", "Fog Bank", "Venerated Rotpriest", "Hellrider",
  "Ulamog's Crusher", "Palace Guard", "Darksteel Myr", "Dauthi Slayer"];
const S1_ALL = [...S1_AURAS, ...S1_SPELLS, ...S1_CREATURES];
// The "*" carriers (the review's F1): a power or toughness their characteristic-defining ability sets (CR 208.2a, 604.3).
const STAR_CARRIERS = ["Tarmogoyf", "Nighthawk Scavenger", "Crusader of Odric"];
// Each S1 card's power and toughness part: a base set (CR 613.4b), or a change (CR 613.4c) on the creature's own base.
const S1_PT = {
  "Lignify": { set: [0, 4] }, "Kasmina's Transmutation": { set: [1, 1] }, "Ichthyomorphosis": { set: [0, 1] }, "Noggle the Mind": { set: [1, 1] },
  "Retro-Mutation": { set: [0, 1] }, "Fresh Start": { change: [-5, 0] }, "Mystic Subdual": { change: [-2, 0] }, "Utter Insignificance": { set: [1, 1] },
  "Duskmourn's Domination": { change: [-3, 0] }, "Turn to Frog": { set: [1, 1] }, "Humble": { set: [0, 1] }, "Ovinize": { set: [0, 1] },
  "Snakeform": { set: [1, 1] }, "Gift of Tusks": { set: [3, 3] }, "Turn // Burn": { set: [0, 1] }, "Merfolk Trickster": {}, "Warkite Marauder": { set: [0, 1] },
};
// A "*" creature's base once it has lost its abilities: its "*" is 0 and its printed number stays — the bundled rulings of Mystic Subdual
// ("If a creature has power and toughness written as */* with an ability that defines its power and toughness, its base power and toughness
// become 0/0 when it loses all abilities. Mystic Subdual then makes it a -2/0. If its power and toughness are written as */*+1, it's -2/1")
// and Merfolk Trickster ("… it's 0/0 when it loses all abilities. If its power and toughness are written as */*+1, it's 0/1").
const LOST_BASE = { "Tarmogoyf": [0, 1], "Nighthawk Scavenger": [1, 3], "Crusader of Odric": [0, 0] };
function lostPt(s1, creature) {
  const pt = S1_PT[s1];
  if (pt.set) return [...pt.set];
  const [p, t] = LOST_BASE[creature];
  return pt.change ? [p + pt.change[0], t + pt.change[1]] : [p, t];
}

// ─── 1. the credit ──────────────────────────────────────────────────────────────────────────────────────────────────────────────
// [card, the bundled oracle line it proves, its tier] — every line quoted from the fixture (the bundled oracle), checked below.
const CREDITED = [
  ["Lignify", "Enchanted creature is a Treefolk with base power and toughness 0/4 and loses all abilities.", "native-aura"],
  ["Kasmina's Transmutation", "Enchanted creature loses all abilities and has base power and toughness 1/1.", "native-aura"],
  ["Ichthyomorphosis", "Enchanted creature loses all abilities and is a blue Fish with base power and toughness 0/1.", "native-aura"],
  ["Noggle the Mind", "Enchanted creature loses all abilities and is a colorless Noggle with base power and toughness 1/1.", "native-aura"],
  ["Retro-Mutation", "Enchanted creature is a Turtle with base power and toughness 0/1. It can't attack and loses all abilities.", "native-aura"],
  ["Fresh Start", "Enchanted creature gets -5/-0 and loses all abilities.", "native-aura"],
  ["Mystic Subdual", "Enchanted creature gets -2/-0 and loses all abilities.", "native-aura"],
  ["Utter Insignificance", "Enchanted creature loses all abilities and has base power and toughness 1/1.\n{2}{C}: Exile enchanted creature.", "native-aura"],
  ["Duskmourn's Domination", "You control enchanted creature.\nEnchanted creature gets -3/-0 and loses all abilities.", "native-aura"],
  ["Turn to Frog", "Until end of turn, target creature loses all abilities and becomes a blue Frog with base power and toughness 1/1.", "native-spell"],
  ["Humble", "Until end of turn, target creature loses all abilities and has base power and toughness 0/1.", "native-spell"],
  ["Ovinize", "Until end of turn, target creature loses all abilities and has base power and toughness 0/1.", "native-spell"],
  ["Snakeform", "Until end of turn, target creature loses all abilities and becomes a green Snake with base power and toughness 1/1.\nDraw a card.", "native-spell"],
  ["Gift of Tusks", "Until end of turn, target creature loses all abilities and becomes a green Elephant with base power and toughness 3/3.", "native-spell"],
  ["Turn // Burn", "Until end of turn, target creature loses all abilities and becomes a red Weird with base power and toughness 0/1.", "native-spell"],
  ["Merfolk Trickster", "When this creature enters, tap target creature an opponent controls. It loses all abilities until end of turn.", "native-trigger"],
  ["Warkite Marauder", "Whenever this creature attacks, target creature defending player controls loses all abilities and has base power and toughness 0/1 until end of turn.", "native-trigger"],
];
// Cards whose loss S1 does not build (their stage), and the two whose loss line an S1 shape reads but whose other text is unread.
const KEPT_PARKED = [
  ["Quantum Reduction", "its \"cast as though it had flash if it's cast using teamwork\" line is unread (its Aura bonus is S1's — the runtime applies it)"],
  ["Obscura Confluence", "its connive and graveyard-return modes are unread (its first mode is S1's)"],
  ["Spider-Man No More", "S4 — \"It has defender and loses all other abilities\" (a grant from the same effect)"],
  ["Kenrith's Transformation", "S2 — \"is a green Elk creature\" sets the card types"], ["Frogify", "S2 — \"is a blue Frog creature\""], ["Trickster's Elk", "S2 — bestow, \"is a green Elk creature\""],
  ["Darksteel Mutation", "S4 (indestructible from the same effect) and S2"], ["Stasis Field", "S4 — defender from the same effect"], ["Dragonshift", "S4 (flying) and the overload"],
  ["Humility", "S3 — a global static over every creature"], ["Sudden Spoiling", "S3 — a group of one player's creatures"], ["Polymorphist's Jest", "S3 — a group of one player's creatures"],
  ["Abigale, Eloquent First-Year", "a loss with no duration, and \"up to one other target creature\" — not an S1 form"],
  ["Nullhide Ferox", "\"Any player may activate this ability\" is unread; its self-loss is not an S1 form"],
  ["Mercurial Transformation", "a nonland permanent that becomes a creature of your choice (S5 / S2)"],
  ["Barrow-Blade", "\"that creature\" — the blocked or blocking creature — is not an S1 form"],
  ["Observed Stasis", "\"loses all abilities and can't attack or block\" is not an S1 form; its enters trigger is unread"],
  ["Tamiyo's Compleation", "an artifact, creature or planeswalker Aura with a no-untap rider — not S1's"],
  ["Eye of Nidhogg", "not a loss — its \"is a black Dragon … and is goaded\" stays unread"],
];

describe("S1 — the credit (classification over the bundled text)", () => {
  for (const [name, line, tier] of CREDITED) {
    it(`${name}: "${line.split("\n")[0]}" → ${tier}`, () => {
      const c = card(name);
      expect(String(c.oracle).replace(/\n/g, " ")).toContain(line.replace(/\n/g, " "));
      expect(classifyCard(c)).toBe(tier);
    });
  }
  it("the cards S1 does not build stay parked (each with its reason)", () => {
    expect(KEPT_PARKED.map(([n]) => [n, /^native/.test(String(classifyCard(card(n))))])).toEqual(KEPT_PARKED.map(([n]) => [n, false]));
    expect(KEPT_PARKED.every(([, why]) => why.length > 10)).toBe(true);
  });
  it("a planeswalker's \"loses all abilities and becomes a green Elk creature\" (Oko) matches no S1 shape: its parse is unchanged (no loss atom)", () => {
    expect(JSON.stringify(PR.parseEffectClause("Target artifact or creature loses all abilities and becomes a green Elk creature with base power and toughness 3/3.", "Planeswalker"))).not.toContain("lose-all-abilities");
  });
  it("a modal spell whose S1 mode now reads keeps every other mode as printed: this Very Cryptic Command stays LOW — \"Draw a card from an opponent's library.\" is no draw of your own (CR 121.1)", () => {
    const vcc = VCC_FROG;
    expect(vcc.oracle).toContain("• Until end of turn, target creature loses all abilities and becomes a blue Frog with base power and toughness 1/1.");
    expect(PR.parseEffectClause("Until end of turn, target creature loses all abilities and becomes a blue Frog with base power and toughness 1/1.", "Instant").atoms.map((a) => a.op)).toEqual(["lose-all-abilities"]);
    expect(PR.programConfidence(PR.parseEffectClause("Draw a card from an opponent's library.", "Instant"))).toBe("low");
    expect([PR.programConfidence(PR.parseEffectProgram(vcc)), /^native/.test(String(classifyCard(vcc)))]).toEqual(["low", false]);
  });
});

describe("S1 — the Auras on the battlefield (each cast through the real cast lane at the opponent's Serra Angel)", () => {
  const onAngel = (aura) => castAt(board({ ai: [["angel", card("Serra Angel")]], hand: [aura] }), aura, "angel");
  it("the printed Serra Angel (control): a 4/4 white Angel with flying and vigilance", () => {
    const s = board({ ai: [["angel", card("Serra Angel")]] });
    expect(chars(s, "angel")).toEqual({ pt: [4, 4], types: ["Creature"], subtypes: ["Angel"], colors: ["W"], keywords: ["flying", "vigilance"] });
  });
  it("every S1 Aura reads on the enemy side for the AI's cast and entry choice (auraPrintedSide — the \"side\" consult point)", () => {
    expect(S1_AURAS.map((a) => [a, printedAuraReading(card(a)).side])).toEqual(S1_AURAS.map((a) => [a, "enemy"]));
  });
  const EXPECT = {
    "Lignify": { pt: [0, 4], subtypes: ["Treefolk"], colors: ["W"] },
    "Kasmina's Transmutation": { pt: [1, 1], subtypes: ["Angel"], colors: ["W"] },
    "Ichthyomorphosis": { pt: [0, 1], subtypes: ["Fish"], colors: ["U"] },
    "Noggle the Mind": { pt: [1, 1], subtypes: ["Noggle"], colors: [] },
    "Retro-Mutation": { pt: [0, 1], subtypes: ["Turtle"], colors: ["W"] },
    "Fresh Start": { pt: [-1, 4], subtypes: ["Angel"], colors: ["W"] },
    "Mystic Subdual": { pt: [2, 4], subtypes: ["Angel"], colors: ["W"] },
    "Utter Insignificance": { pt: [1, 1], subtypes: ["Angel"], colors: ["W"] },
    "Duskmourn's Domination": { pt: [1, 4], subtypes: ["Angel"], colors: ["W"] },
  };
  for (const aura of S1_AURAS) {
    it(`${aura}: the enchanted Angel is ${EXPECT[aura].pt.join("/")} ${EXPECT[aura].colors.join("") || "colorless"} ${EXPECT[aura].subtypes.join(" ")}, with no keyword (CR 613.1f, 205.1a, 105.3, 613.4b, 613.4c)`, () => {
      const s = onAngel(aura);
      expect(permOf(s, "angel")?.attachments?.length, "the Aura is attached").toBe(1);
      expect(chars(s, "angel")).toEqual({ pt: EXPECT[aura].pt, types: ["Creature"], subtypes: EXPECT[aura].subtypes, colors: EXPECT[aura].colors, keywords: [] });
    });
  }
  it("Retro-Mutation: \"It can't attack\" — the enchanted creature is offered no attack (CR 508.1c); the printed one is (control)", () => {
    const base = board({ user: [["angel", card("Serra Angel")]], hand: ["Retro-Mutation"] });
    const attacks = (s) => LC.legalActionsForPlayer({ ...s, phase: "combat", step: "declare-attackers", combat: { attackers: [], blockers: [] } }, "user").filter((a) => a.kind === "declare-attacker" && a.permanentId === "angel").length;
    expect(attacks(base)).toBeGreaterThan(0);
    const s = castAt(base, "Retro-Mutation", "angel");
    expect(chars(s, "angel").pt).toEqual([0, 1]);
    expect(attacks(s)).toBe(0);
    expect(CE.selfCantBlockNow(s, permOf(s, "angel"))).toBe(false); // it can still block: the sentence says only "can't attack"
  });
  it("Utter Insignificance: \"{2}{C}: Exile enchanted creature.\" — its controller exiles the 1/1", () => {
    const s = onAngel("Utter Insignificance");
    const act = LC.legalActionsForPlayer(s, "user").find((a) => a.kind === "activate-ability" && /exile enchanted creature/i.test(a.abilityText || ""));
    expect(act, "the exile ability is offered").toBeTruthy();
    const out = settle(AD.dispatchAction(s, act));
    expect(permOf(out, "angel")).toBe(null);
    expect(out.players.ai.exile.some((c) => c.name === "Serra Angel")).toBe(true);
  });
  it("Duskmourn's Domination: \"You control enchanted creature.\" — the Angel is the user's, a 1/4 with no abilities; when the Aura leaves it goes home whole", () => {
    const s = onAngel("Duskmourn's Domination");
    expect(controllerOf(s, "angel")).toBe("user");
    const auraId = permOf(s, "angel").attachments[0];
    const gone = SE.applyDestroyEffect(s, { controller: "ai", targets: [{ type: "permanent", id: auraId }] });
    expect([controllerOf(gone, "angel"), chars(gone, "angel").pt, chars(gone, "angel").keywords]).toEqual(["ai", [4, 4], ["flying", "vigilance"]]);
  });
});

describe("S1 — the creature reads vanilla to every reader (the census and the twin comparison, through each card's real program)", () => {
  const census = [];
  for (const name of S1_ALL) {
    it(`${name}: every reader reads nothing off the creature it affects, and the creature reads as its no-text twin under the same card`, () => {
      const carriedBy = new Map(READERS.map(([label]) => [label, []]));
      const leaks = [];
      for (const n of CARRIERS) {
        const c = { ...card(n), name: NEUTRAL };
        const printed = s1Board(name, c);
        const lost = applyS1(printed, name);
        expect(L.abilityLossOf(lost, ID), `${name} on ${n}: the loss applies`).not.toBe(null);
        for (const [label, read] of READERS) {
          if (!(read(printed) > 0)) continue;
          carriedBy.get(label).push(n);
          const got = read(lost);
          if (got !== 0) leaks.push(`${n} — ${label}: ${got}`);
        }
        const twin = applyS1(s1Board(name, twinOf(card(n))), name);
        const a = twinReadout(lost);
        const b = twinReadout(twin);
        for (const k of Object.keys(a)) if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) leaks.push(`${n} — twin ${k}: ${JSON.stringify(a[k]).slice(0, 160)} ≠ ${JSON.stringify(b[k]).slice(0, 160)}`);
      }
      // THE "*" CARRIERS (the review's F1 / F3): the same readers, and the power and toughness as absolute values — a no-text twin of a
      // "*" card is an unread 0/0 too, so the twin cannot see this class. Under its own name (the CDA names its card).
      for (const n of STAR_CARRIERS) {
        const printed = s1Board(name, card(n));
        const lost = applyS1(printed, name);
        const want = lostPt(name, n);
        if (want[1] <= 0) { expect(permOf(lost, ID), `${name} on ${n}: toughness ${want[1]} — put into the graveyard (CR 704.5f)`).toBe(null); continue; }
        expect([n, L.abilityLossOf(lost, ID) != null, chars(lost, ID).pt, L.permanentToughnessSized(lost, ID)], `${name} on ${n}`).toEqual([n, true, want, true]);
        for (const [label, read] of READERS) {
          if (!(read(printed) > 0)) continue;
          carriedBy.get(label).push(n);
          const got = read(lost);
          if (got !== 0) leaks.push(`${n} — ${label}: ${got}`);
        }
      }
      census.push([name, ...[...carriedBy].map(([label, cs]) => `${label.split(":")[0]} ${cs.length}`)]);
      expect([...carriedBy].filter(([, cs]) => cs.length === 0).map(([label]) => label), "every reader has a carrier").toEqual([]);
      expect(leaks).toEqual([]);
    });
  }
  it("the census table (reported; every row above asserted)", () => {
    console.log(["S1 CENSUS — card | carriers per reader", ...census.map((r) => r.join(" | "))].join("\n"));
    expect(census.length).toBe(S1_ALL.length);
  });
});

describe("S1 — the parts in their layers", () => {
  it("Lignify: a +1/+1 counter still counts on top of the base 0/4 (CR 613.4b, 613.4c); an Elf made a Treefolk loses the Elf lord's bonus and its own mana (CR 205.1a, 613.1f)", () => {
    let s = board({ ai: [["elf", card("Llanowar Elves")], ["arch", card("Elvish Archdruid")]], hand: ["Lignify"] });
    s = G.addCounter(s, { permanentId: "elf", type: "+1/+1", amount: 1 });
    expect(chars(s, "elf")).toEqual({ pt: [3, 3], types: ["Creature"], subtypes: ["Druid", "Elf"], colors: ["G"], keywords: [] }); // 1/1 + counter + Archdruid
    const archMana = (st) => M.manaSources(st, "ai").filter((m) => m.permanentId === "arch").map((m) => m.amount);
    expect(archMana(s)).toEqual([2]); // "{T}: Add {G} for each Elf you control." — two Elves
    s = castAt(s, "Lignify", "elf");
    expect(chars(s, "elf")).toEqual({ pt: [1, 5], types: ["Creature"], subtypes: ["Treefolk"], colors: ["G"], keywords: [] });
    expect(M.manaSources(s, "ai").filter((m) => m.permanentId === "elf")).toEqual([]);
    expect(archMana(s)).toEqual([1]); // the Treefolk is no Elf
  });
  it("Lignify on an artifact creature: it stays an Artifact Creature, a Treefolk (its Thopter type replaced), 0/4 with no flying (CR 205.1a)", () => {
    const s = castAt(board({ ai: [["thopter", card("Ornithopter")]], hand: ["Lignify"] }), "Lignify", "thopter");
    expect(chars(s, "thopter")).toEqual({ pt: [0, 4], types: ["Artifact", "Creature"], subtypes: ["Treefolk"], colors: [], keywords: [] });
  });
  it("only what it had when the loss applied is lost (CR 613.7, 613.7e): an Equipment attached before Lignify gives no flying, one attached after does", () => {
    const fresh = () => board({ user: [["bear", card("Grizzly Bears")], ["wings", card("Cobbled Wings")]], hand: ["Lignify"] });
    let before = G.attachPermanent(fresh(), { equipId: "wings", targetId: "bear" });
    expect(chars(before, "bear").keywords).toEqual(["flying"]);
    before = castAt(before, "Lignify", "bear");
    expect(chars(before, "bear").keywords).toEqual([]);
    const after = G.attachPermanent(castAt(fresh(), "Lignify", "bear"), { equipId: "wings", targetId: "bear" });
    expect(chars(after, "bear")).toEqual({ pt: [0, 4], types: ["Creature"], subtypes: ["Treefolk"], colors: ["G"], keywords: ["flying"] });
  });
  it("a later Turn to Frog over Lignify: the later base P/T and creature type win until end of turn; at cleanup Lignify's 0/4 Treefolk is back (CR 613.7)", () => {
    let s = castAt(board({ ai: [["angel", card("Serra Angel")]], hand: ["Lignify", "Turn to Frog"] }), "Lignify", "angel");
    s = castAt(s, "Turn to Frog", "angel");
    expect(chars(s, "angel")).toEqual({ pt: [1, 1], types: ["Creature"], subtypes: ["Frog"], colors: ["U"], keywords: [] });
    expect(chars(cleanup(s), "angel")).toEqual({ pt: [0, 4], types: ["Creature"], subtypes: ["Treefolk"], colors: ["W"], keywords: [] });
  });
  it("the Aura's leaving restores the creature: Lignify destroyed, the Angel is a 4/4 white Angel with flying and vigilance again", () => {
    const s = castAt(board({ ai: [["angel", card("Serra Angel")]], hand: ["Lignify"] }), "Lignify", "angel");
    const auraId = permOf(s, "angel").attachments[0];
    const gone = SE.applyDestroyEffect(s, { controller: "user", targets: [{ type: "permanent", id: auraId }] });
    expect(permOf(gone, auraId)).toBe(null);
    expect(chars(gone, "angel")).toEqual({ pt: [4, 4], types: ["Creature"], subtypes: ["Angel"], colors: ["W"], keywords: ["flying", "vigilance"] });
  });
  it("a Lignified Thragtusk dies with no abilities: no Beast (CR 603.10a); Lignify itself falls off", () => {
    const s = castAt(board({ ai: [["tusk", card("Thragtusk")]], hand: ["Lignify"] }), "Lignify", "tusk");
    const dead = SE.applyDestroyEffect(s, { controller: "user", targets: [{ type: "creature", id: "tusk" }] });
    expect((dead.pendingTriggers || []).filter((t) => t.source?.permanentId === "tusk").length).toBe(0);
    expect(dead.players.user.graveyard.some((c) => c.name === "Lignify")).toBe(true);
  });
});

describe("S1 — the spells and abilities, until end of turn (CR 611.2c, 514.2)", () => {
  const EXPECT = {
    "Turn to Frog": { pt: [1, 1], subtypes: ["Frog"], colors: ["U"] },
    "Humble": { pt: [0, 1], subtypes: ["Angel"], colors: ["W"] },
    "Ovinize": { pt: [0, 1], subtypes: ["Angel"], colors: ["W"] },
    "Snakeform": { pt: [1, 1], subtypes: ["Snake"], colors: ["G"] },
    "Gift of Tusks": { pt: [3, 3], subtypes: ["Elephant"], colors: ["G"] },
    "Turn // Burn": { pt: [0, 1], subtypes: ["Weird"], colors: ["R"] },
  };
  const ANGEL = { pt: [4, 4], types: ["Creature"], subtypes: ["Angel"], colors: ["W"], keywords: ["flying", "vigilance"] };
  for (const spell of S1_SPELLS) {
    it(`${spell}: the targeted Angel is ${EXPECT[spell].pt.join("/")} ${EXPECT[spell].colors.join("")} ${EXPECT[spell].subtypes.join(" ")} with no keyword until end of turn; at cleanup it is itself again`, () => {
      const s = applyS1(board({ ai: [[ID, card("Serra Angel")]], hand: [spell] }), spell);
      expect(chars(s, ID)).toEqual({ pt: EXPECT[spell].pt, types: ["Creature"], subtypes: EXPECT[spell].subtypes, colors: EXPECT[spell].colors, keywords: [] });
      expect(chars(cleanup(s), ID)).toEqual(ANGEL);
    });
  }
  it("Snakeform: \"Draw a card.\" — its caster draws one", () => {
    const s0 = board({ ai: [["angel", card("Serra Angel")]], hand: ["Snakeform"] });
    const s = castAt(s0, "Snakeform", "angel");
    expect(s.players.user.hand.length).toBe(1);
  });
  it("Humble on a 2/2 with 1 damage marked: it is a 0/1 with lethal damage and dies at once (CR 704.5g)", () => {
    let s = board({ ai: [["bear", card("Grizzly Bears")]], hand: ["Humble"] });
    s = { ...s, players: { ...s.players, ai: { ...s.players.ai, battlefield: s.players.ai.battlefield.map((p) => (p.id === "bear" ? { ...p, damageMarked: 1 } : p)) } } };
    const out = castAt(s, "Humble", "bear");
    expect(permOf(out, "bear")).toBe(null);
    expect(out.players.ai.graveyard.some((c) => c.name === "Grizzly Bears")).toBe(true);
  });
  it("Humble's parsed atom applied OUTSIDE a resolution (a direct call — no state-based check follows it): the after-effect lethal check runs at once (CR 704.5g)", () => {
    let s = board({ ai: [["bear", card("Grizzly Bears")]] });
    s = { ...s, players: { ...s.players, ai: { ...s.players.ai, battlefield: s.players.ai.battlefield.map((p) => (p.id === "bear" ? { ...p, damageMarked: 1 } : p)) } } };
    const atom = PR.parseEffectProgram(card("Humble")).atoms?.[0] ?? null;
    const out = atom ? EA.resolveAtom(s, atom, { controller: "user", targets: [{ type: "creature", id: "bear", controller: "ai" }], cardName: "Humble" }) : null;
    expect(out, "Humble's parsed atom has a resolver").toBeTruthy();
    expect(permOf(out, "bear")).toBe(null);
    expect(out.players.ai.graveyard.some((c) => c.name === "Grizzly Bears")).toBe(true);
  });
  it("Turn to Frog over a +1/+1 counter: a 2/2 Frog (the counter in 7c on top of the 1/1 base — CR 613.4c)", () => {
    let s = board({ ai: [["angel", card("Serra Angel")]], hand: ["Turn to Frog"] });
    s = G.addCounter(s, { permanentId: "angel", type: "+1/+1", amount: 1 });
    expect(chars(castAt(s, "Turn to Frog", "angel"), "angel").pt).toEqual([2, 2]);
  });
  it("an ability granted after the spell resolved still applies (CR 613.7): Cobbled Wings equipped after Humble gives flying", () => {
    let s = castAt(board({ user: [["bear", card("Grizzly Bears")], ["wings", card("Cobbled Wings")]], hand: ["Humble"] }), "Humble", "bear");
    expect(chars(s, "bear").keywords).toEqual([]);
    s = G.attachPermanent(s, { equipId: "wings", targetId: "bear" });
    expect(chars(s, "bear").keywords).toEqual(["flying"]);
  });
  it("Merfolk Trickster: its enters trigger taps the opponent's Angel and \"It\" — that Angel — loses all abilities until end of turn; the Trickster keeps its own", () => {
    const s0 = board({ ai: [["angel", card("Serra Angel")]], hand: ["Merfolk Trickster"] });
    const s = castAt(s0, "Merfolk Trickster", null);
    const trickster = s.players.user.battlefield.find((p) => p.card?.name === "Merfolk Trickster");
    expect(trickster, "the Trickster resolved").toBeTruthy();
    expect([permOf(s, "angel").tapped, chars(s, "angel").keywords, chars(s, "angel").pt]).toEqual([true, [], [4, 4]]);
    expect(L.abilityLossOf(s, trickster.id)).toBe(null);
    const later = cleanup(s);
    expect([permOf(later, "angel").tapped, chars(later, "angel").keywords]).toEqual([true, ["flying", "vigilance"]]);
  });
  it("Warkite Marauder: as it attacks, the defending player's Angel is a 0/1 with no flying until end of turn — and can no longer block it (CR 509.1b)", () => {
    let s = board({ user: [["kite", card("Warkite Marauder")]], ai: [["angel", card("Serra Angel")]] });
    const atk = { ...s, phase: "combat", step: "declare-attackers", combat: { attackers: [{ permanentId: "kite", attackingPlayer: "user", defender: "ai" }], blockers: [] } };
    expect(CE.canBlockAttacker(atk, "angel", "kite", "ai")).toBe(true); // control: a flyer blocks the flyer
    s = settle(GE.flushTriggers(T.checkAttackTriggers(atk), { chooseTargets: GE.chooseTriggerTargets }));
    expect(chars(s, "angel")).toEqual({ pt: [0, 1], types: ["Creature"], subtypes: ["Angel"], colors: ["W"], keywords: [] });
    expect(CE.canBlockAttacker(s, "angel", "kite", "ai")).toBe(false);
    expect(chars(cleanup(s), "angel")).toEqual(ANGEL);
  });
  it("Warkite Marauder's trigger takes only a creature the DEFENDING player controls: with none, nothing of its controller's loses anything", () => {
    let s = board({ user: [["kite", card("Warkite Marauder")], ["bear", card("Grizzly Bears")]] });
    const atk = { ...s, phase: "combat", step: "declare-attackers", combat: { attackers: [{ permanentId: "kite", attackingPlayer: "user", defender: "ai" }], blockers: [] } };
    s = settle(GE.flushTriggers(T.checkAttackTriggers(atk), { chooseTargets: GE.chooseTriggerTargets }));
    expect([chars(s, "bear").pt, chars(s, "kite").keywords]).toEqual([[2, 2], ["flying"]]);
  });
  it("the pronoun binds only to a target: \"It loses all abilities until end of turn.\" alone, or after a sentence whose subject is the source, is unread", () => {
    expect(PR.programConfidence(PR.parseEffectClause("tap target creature an opponent controls. It loses all abilities until end of turn", "Creature", { sourceScoped: true }))).toBe("high");
    for (const t of ["It loses all abilities until end of turn.", "Draw a card. It loses all abilities until end of turn.", "This creature deals 1 damage to target creature. It loses all abilities until end of turn."]) {
      expect(PR.programConfidence(PR.parseEffectClause(t, "Creature", { sourceScoped: true })), t).not.toBe("high");
    }
  });
});

describe("S1 — the review's F1: a \"*\" creature that loses its abilities (CR 208.2a, 604.3, 613.4a, 613.1f, 704.5f, 704.5g)", () => {
  // The opponent's creature, the S1 card cast (or Merfolk Trickster's enters trigger) through the real lane; "x" the creature.
  const under = (creature, s1, { gy = [] } = {}) => {
    const s0 = board({ ai: [["x", card(creature)]], hand: [s1] });
    const s = { ...s0, players: { ...s0.players, ai: { ...s0.players.ai, graveyard: gy.map((n, i) => ({ ...card(n), id: `gy-${i}` })) } } };
    return applyS1Card(s, s1);
  };
  const applyS1Card = (s, s1) => (s1 === "Merfolk Trickster" ? castAt(s, s1, null) : castAt(s, s1, "x"));
  const damaged = (s, n) => SBA.checkAllStateBasedActions(G.updatePermanentSafe(s, "x", (p) => ({ ...p, damageMarked: n })));
  it("without a loss (control): Crusader of Odric is 1/1 (one creature), Tarmogoyf 2/3 (an instant and a creature in a graveyard)", () => {
    expect(chars(board({ ai: [["x", card("Crusader of Odric")]] }), "x").pt).toEqual([1, 1]);
    const s0 = board({ ai: [["x", card("Tarmogoyf")]] });
    const s = { ...s0, players: { ...s0.players, ai: { ...s0.players.ai, graveyard: [{ ...card("Lightning Bolt"), id: "gy-0" }, { ...card("Grizzly Bears"), id: "gy-1" }] } } };
    expect(chars(s, "x").pt).toEqual([2, 3]);
  });
  for (const s1 of ["Mystic Subdual", "Fresh Start", "Duskmourn's Domination", "Merfolk Trickster"]) {
    it(`Crusader of Odric under ${s1}: its "*/*" is 0/0 with its ability gone, so it is put into its owner's graveyard`, () => {
      const s = under("Crusader of Odric", s1);
      expect(permOf(s, "x")).toBe(null);
      expect(s.players.ai.graveyard.some((c) => c.name === "Crusader of Odric")).toBe(true);
    });
  }
  it("Tarmogoyf under Mystic Subdual is a -2/1 (its \"*/1+*\" is 0/1); under Merfolk Trickster a 0/1 that 1 damage destroys", () => {
    const gy = ["Lightning Bolt", "Grizzly Bears"];
    expect(chars(under("Tarmogoyf", "Mystic Subdual", { gy }), "x").pt).toEqual([-2, 1]);
    const t = under("Tarmogoyf", "Merfolk Trickster", { gy });
    expect(chars(t, "x").pt).toEqual([0, 1]);
    expect(permOf(damaged(t, 1), "x")).toBe(null);
  });
  it("Nighthawk Scavenger (\"1+*\" power) under Merfolk Trickster is a 1/3, under Mystic Subdual a -1/3", () => {
    expect(chars(under("Nighthawk Scavenger", "Merfolk Trickster"), "x").pt).toEqual([1, 3]);
    expect(chars(under("Nighthawk Scavenger", "Mystic Subdual"), "x").pt).toEqual([-1, 3]);
  });
  it("Lignify and Humble on the same creatures (controls: their base set sizes the creature either way) — 0/4 and 0/1; the Humbled Tarmogoyf dies to 1 damage", () => {
    const gy = ["Lightning Bolt", "Grizzly Bears"];
    for (const c of ["Crusader of Odric", "Tarmogoyf", "Nighthawk Scavenger"]) {
      expect([c, chars(under(c, "Lignify", { gy }), "x").pt, chars(under(c, "Humble", { gy }), "x").pt]).toEqual([c, [0, 4], [0, 1]]);
    }
    expect(permOf(damaged(under("Tarmogoyf", "Humble", { gy }), 1), "x")).toBe(null);
  });
  it("Plague Rats, whose CDA the engine does not model: with no loss its \"*/*\" stays unread (never destroyed by a stand-in 0); under Mystic Subdual it has lost that CDA, so it is a -2/0 and dies", () => {
    const s = board({ ai: [["x", card("Plague Rats")]] });
    expect([permOf(SBA.checkAllStateBasedActions(s), "x") != null, L.permanentToughnessSized(s, "x")], "control: no loss").toEqual([true, false]);
    // An effect that reaches it but takes nothing away (Glorious Anthem's +1/+1 — so its layer 7 is computed, not the no-effect fast
    // path): still unread, and 1 damage marked destroys nothing (the real Plague Rats is a 2/2 here).
    const anthem = board({ ai: [["x", card("Plague Rats")], ["anthem", card("Glorious Anthem")]] });
    expect([L.permanentToughnessSized(anthem, "x"), permOf(damaged(anthem, 1), "x") != null], "control: an anthem, no loss").toEqual([false, true]);
    expect(permOf(under("Plague Rats", "Mystic Subdual"), "x")).toBe(null);
  });
  it("Primal Clay (CR 208.2b — its \"*/*\" is an \"As this creature enters\" choice, not a CDA) under Mystic Subdual stays as it was: unread, not destroyed", () => {
    const s = under("Primal Clay", "Mystic Subdual");
    expect(permOf(s, "x"), "still on the battlefield").not.toBe(null);
    expect([chars(s, "x").pt, L.permanentToughnessSized(s, "x")]).toEqual([[-2, 0], false]);
  });
});

describe("S1 — the review's F3: Warkite Marauder's defending player in a four-player game (CR 508.5, 508.5a, 802.2a)", () => {
  /** A four-seat Commander game: the user's Warkite Marauder attacking `defender`; ai1 has Serra Angel, ai2 Grizzly Bears, ai3 nothing. */
  function pod(defender) {
    const s0 = G.createGameState({ userDeck: [], opponentDecks: [[], [], []], mode: "commander" });
    let ts = 1;
    const perm = (id, n, controller) => ({ ...G.createPermanent({ id, card: { ...card(n), id: `card-${id}` }, controller, summoningSick: false }), timestamp: ts++, enteredOnTurn: 1 });
    const s = { ...s0, turn: 3, activePlayer: "user", priorityHolder: "user", timestampCounter: 100,
      players: { ...s0.players, user: { ...s0.players.user, battlefield: [perm("kite", "Warkite Marauder", "user")] },
        ai1: { ...s0.players.ai1, battlefield: [perm("angel", "Serra Angel", "ai1")] },
        ai2: { ...s0.players.ai2, battlefield: [perm("bear", "Grizzly Bears", "ai2")] },
        ai3: { ...s0.players.ai3, battlefield: [] } } };
    const atk = { ...s, phase: "combat", step: "declare-attackers", combat: { attackers: [{ permanentId: "kite", attackingPlayer: "user", defender }], blockers: [] } };
    return settle(GE.flushTriggers(T.checkAttackTriggers(atk), { chooseTargets: GE.chooseTriggerTargets }));
  }
  it("attacking ai2, it takes ai2's Grizzly Bears (a 0/1 with no abilities) and leaves ai1's Serra Angel alone", () => {
    const s = pod("ai2");
    expect([chars(s, "bear").pt, L.abilityLossOf(s, "bear") != null, chars(s, "angel").pt, chars(s, "angel").keywords]).toEqual([[0, 1], true, [4, 4], ["flying", "vigilance"]]);
  });
  it("attacking ai1, it takes ai1's Serra Angel and leaves ai2's Bears alone", () => {
    const s = pod("ai1");
    expect([chars(s, "angel").pt, chars(s, "angel").keywords, chars(s, "bear").pt, L.abilityLossOf(s, "bear")]).toEqual([[0, 1], [], [2, 2], null]);
  });
  it("attacking ai3, who has no creature, nothing loses anything — though two other opponents have creatures", () => {
    const s = pod("ai3");
    expect([L.abilityLossOf(s, "angel"), L.abilityLossOf(s, "bear"), L.abilityLossOf(s, "kite")]).toEqual([null, null, null]);
  });
});

describe("S1 — the S0b review's notes", () => {
  it("R2 (CR 301.5c): a Lion Sash that lost its abilities has no reconfigure — as a creature it can't equip; the printed one can (control)", () => {
    const s = board({ user: [["sash", card("Lion Sash")]], hand: ["Lignify"] });
    expect(L.equipmentBarredAsCreature(s, "sash")).toBe(false);
    const lost = castAt(s, "Lignify", "sash");
    expect(chars(lost, "sash").subtypes).toEqual(["Equipment", "Treefolk"]); // the Equipment subtype stays (CR 205.1a)
    expect(L.equipmentBarredAsCreature(lost, "sash")).toBe(true);
    expect(L.cannotEquipNow(lost, "sash")).toBe(true);
  });
  it("R2 through a real ability: Brass Squire attaches the printed Lion Sash (it has reconfigure); a Lignified one never becomes attached (CR 301.5c)", () => {
    const s = board({ user: [["sash", card("Lion Sash")], ["squire", card("Brass Squire")], ["bear", card("Grizzly Bears")]], hand: ["Lignify"] });
    const squireAttach = (st) => LC.legalActionsForPlayer(st, "user").filter((a) => a.kind === "activate-ability" && a.permanentId === "squire" && (a.targets || []).some((t) => t.id === "sash") && (a.targets || []).some((t) => t.id === "bear"));
    const printed = squireAttach(s);
    expect(printed.length, "control: offered on the printed Sash").toBeGreaterThan(0);
    expect(permOf(settle(AD.dispatchAction(s, printed[0])), "sash").attachedTo).toBe("bear");
    const lost = castAt(s, "Lignify", "sash");
    expect(L.equipmentBarredAsCreature(lost, "sash")).toBe(true);
    for (const act of squireAttach(lost)) expect(permOf(settle(AD.dispatchAction(lost, act)), "sash").attachedTo ?? null, "a Lignified Lion Sash never becomes attached").toBe(null);
  });
  it("the group sacrifice of an Aura and its host, host first (costSacrifice.sacrificePermanentsTogether): no throw — both go, the Aura once", () => {
    const s = castAt(board({ user: [["bear", card("Grizzly Bears")]], hand: ["Lignify"] }), "Lignify", "bear");
    const auraId = permOf(s, "bear").attachments[0];
    const hostFirst = [{ playerId: "user", permId: "bear" }, { playerId: "user", permId: auraId }];
    expect(() => CS.sacrificePermanentsTogether(s, hostFirst)).not.toThrow();
    const out = CS.sacrificePermanentsTogether(s, hostFirst);
    expect([permOf(out, "bear"), permOf(out, auraId)]).toEqual([null, null]);
    expect(out.players.user.graveyard.filter((c) => c.name === "Lignify").length).toBe(1);
    expect(out.players.user.graveyard.filter((c) => c.name === "Grizzly Bears").length).toBe(1);
    // the same pair the other way round (control)
    const out2 = CS.sacrificePermanentsTogether(s, [{ playerId: "user", permId: auraId }, { playerId: "user", permId: "bear" }]);
    expect(out2.players.user.graveyard.map((c) => c.name).sort()).toEqual(out.players.user.graveyard.map((c) => c.name).sort());
  });
  it("the same Aura named twice beside its host is a malformed batch and throws, as any victim named twice does (the review's nit)", () => {
    const s = castAt(board({ user: [["bear", card("Grizzly Bears")]], hand: ["Lignify"] }), "Lignify", "bear");
    const auraId = permOf(s, "bear").attachments[0];
    const v = (permId) => ({ playerId: "user", permId });
    expect(() => CS.sacrificePermanentsTogether(s, [v("bear"), v("bear")]), "control: a creature named twice").toThrow();
    expect(() => CS.sacrificePermanentsTogether(s, [v("bear"), v(auraId), v(auraId)])).toThrow();
  });
});

/**
 * abilityLossS2.test.js — the ability-loss program's S2 (docs/orchestration/ABILITY-LOSS-PROGRAM.md §3): "loses all other card types",
 * turned ON — the Aura form "Enchanted creature loses all abilities and is a [colour] <creature type> CREATURE with base power and
 * toughness N/N" at the attached and side consult points (abilityLossShapes.js, stage S2), emitting the S0a `setCardTypes` op (CR 205.1a:
 * the supertypes stay, the subtypes of a card type that is gone go) beside S1's loss, creature-type replace, colour set and base P/T.
 * Every credited card plays its whole printed text through its real parsed program in a real game state, read as ABSOLUTE values:
 *   1. THE CREDIT — each card's bundled line, quoted, and its tier; the family S2 does not build stays parked, each with its reason.
 *   2. THE AURAS — cast through the real cast lane (Trickster's Elk bestowed) at an opponent's Serra Angel: power / toughness, card
 *      types, subtypes, colours, keywords; Kenrith's Transformation's draw; the bestowed Elk itself (CR 702.103b, 702.103f).
 *   3. THE S2 RISKS — an artifact creature (Tempered Steel, Terror, Shatter, Molten Frame, Galvanic Blast's metalcraft, Atog, the
 *      sacrifice triggers), a land creature (Dryad Arbor's mana, Stone Rain, Quirion Ranger, forestwalk, Submerge, "Sacrifice a land"),
 *      an enchantment creature (Disenchant), a legendary creature (the legend rule, CR 205.4b, 704.5j), a crewed Vehicle (still a Frog
 *      creature after the crew ends — the bundled ruling), a changeling (the Elf lord), a commander (commander damage, the command-zone
 *      return — CR 903.9a, 903.10a), a token, a face-down creature turned face up (CR 708.8), a creature an effect later makes a
 *      noncreature (S5 territory: the Aura falls off, CR 704.5m), the "*" P/T case (Tarmogoyf, Crusader of Odric); an animated land
 *      under Frogify (Fireblast, Gush, Snuff Out); the look-backs and trigger scopes as the permanent last existed (CR 603.10a —
 *      Disciple of the Vault, alone and in a wipe whichever moves first; Elderfang Venom; Elanor Gardner's sacrificed Food) and a live
 *      permanent's type line (Neurok Spy).
 *   4. THE LAYERS — counters, a later and an earlier type set (Lignify), a grant after the Aura, the Aura leaving, Allosaurus Shepherd.
 *   5. VANILLA TO EVERY READER — for each S2 card over 31 real creatures (S1's 26, five type carriers) plus two "*" carriers: the census
 *      (every reader that reads something off the printed creature reads nothing off the affected one) and the S2 TYPE twin (the affected
 *      creature reads exactly as the creature the Aura makes it, PRINTED — its supertypes, "Creature — <type>", its colours and P/T, no
 *      text — under the same Aura: combat legality both ways, combat damage, its controller's legal actions, and every spell of the
 *      caster's that can target it). The S1 twin shared the printed type line with the creature, so it could not see a printed type read.
 *   6. THE S1 RECHECK'S R1 — Drop Bear's "has power and toughness each equal to" and Lydari Elephant's "its toughness equal to": both are
 *      characteristic-defining abilities a loss removes (CR 208.2a, 604.3), so under Mystic Subdual each is a 0-toughness creature that
 *      is put into its owner's graveyard (CR 704.5f).
 * Read only through public readers that existed before S2, so on the base commit the file loads and fails on its assertions. The cards
 * are real bundled cards (cardIndex.publicCard → learnDeckEnrich.mergeCardData), generated, never typed.
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
import * as SBA from "./sba.js";
import * as PR from "./effects/parser.js";
import * as RP from "./effects/runProgram.js";
import { classifyCard } from "./coverage.js";
import { parseAttachedBonus } from "./staticAbilityParser.js";
import { printedAuraReading } from "./auraPrintedSide.js";
import { returnCommandersToZone } from "./learnSession.js";
import * as IF from "./interveningIf.js";
import * as ATX from "./attackTax.js";
import * as AI from "./opponentAI.js";
import * as UD from "./urDragonAttack.js";
import * as VH from "./vihaanAnimate.js";
import * as BS from "./boardSnapshot.js";
import { sacrificePoolMatchNow } from "./effects/atoms/removal.js";
import { NAMED_TOKENS } from "./effects/atoms/tokens.js";
import { COMBAT_KEYWORDS, GRANTABLE_STATIC_KEYWORDS } from "./keywords.js";

beforeEach(() => G._resetIdsForTests());

// ─── the cards (bundled Scryfall data — generated, never typed) ──────────────────────────────────────────────────────────────────
// the S2 cards, then the creatures, Equipment, lands and spells the boards use
const CARDS = [
  {"name":"Kenrith's Transformation","type":"Enchantment — Aura","mana":"{1}{G}","oracle":"Enchant creature\nWhen this Aura enters, draw a card.\nEnchanted creature loses all abilities and is a green Elk creature with base power and toughness 3/3. (It loses all other card types and creature types.)","layout":"normal","cmc":2,"power":null,"toughness":null,"loyalty":null,"keywords":["Enchant"],"colors":["G"],"colorIdentity":["G"]},
  {"name":"Eaten by Piranhas","type":"Enchantment — Aura","mana":"{1}{U}","oracle":"Flash (You may cast this spell any time you could cast an instant.)\nEnchant creature\nEnchanted creature loses all abilities and is a black Skeleton creature with base power and toughness 1/1. (It loses all other colors, card types, and creature types.)","layout":"normal","cmc":2,"power":null,"toughness":null,"loyalty":null,"keywords":["Enchant","Flash"],"colors":["U"],"colorIdentity":["U"]},
  {"name":"Frogify","type":"Enchantment — Aura","mana":"{1}{U}","oracle":"Enchant creature\nEnchanted creature loses all abilities and is a blue Frog creature with base power and toughness 1/1. (It loses all other card types and creature types.)","layout":"normal","cmc":2,"power":null,"toughness":null,"loyalty":null,"keywords":["Enchant"],"colors":["U"],"colorIdentity":["U"]},
  {"name":"Reprobation","type":"Enchantment — Aura","mana":"{1}{W}","oracle":"Enchant creature\nEnchanted creature loses all abilities and is a Coward creature with base power and toughness 0/1. (It keeps all supertypes but loses all other types and creature types.)","layout":"normal","cmc":2,"power":null,"toughness":null,"loyalty":null,"keywords":["Enchant"],"colors":["W"],"colorIdentity":["W"]},
  {"name":"Trickster's Elk","type":"Enchantment Creature — Elk","mana":"{2}{G}","oracle":"Bestow {1}{G} (If you cast this card for its bestow cost, it's an Aura spell with enchant creature. It becomes a creature again if it's not attached.)\nEnchanted creature loses all abilities and is a green Elk creature with base power and toughness 3/3.","layout":"normal","cmc":3,"power":"3","toughness":"3","loyalty":null,"keywords":["Bestow"],"colors":["G"],"colorIdentity":["G"]},
  {"name":"Fowl Play","type":"Enchantment — Aura","mana":"{2}{U}","oracle":"Enchant creature\nEnchanted creature loses all abilities and is a Bird creature with base power and toughness 1/1.","layout":"normal","cmc":3,"power":null,"toughness":null,"loyalty":null,"keywords":["Enchant"],"colors":["U"],"colorIdentity":["U"]},
  {"name":"Amphibian Downpour","type":"Enchantment — Aura","mana":"{2}{U}","oracle":"Flash\nStorm (When you cast this spell, copy it for each spell cast before it this turn. You may choose new targets for the copies. Copies become tokens.)\nEnchant creature\nEnchanted creature loses all abilities and is a blue Frog creature with base power and toughness 1/1.","layout":"normal","cmc":3,"power":null,"toughness":null,"loyalty":null,"keywords":["Storm","Enchant","Flash"],"colors":["U"],"colorIdentity":["U"]},
  {"name":"Serra Angel","type":"Creature — Angel","mana":"{3}{W}{W}","oracle":"Flying\nVigilance (Attacking doesn't cause this creature to tap.)","layout":"normal","cmc":5,"power":"4","toughness":"4","loyalty":null,"keywords":["Flying","Vigilance"],"colors":["W"],"colorIdentity":["W"]},
  {"name":"Vampire Nighthawk","type":"Creature — Vampire Shaman","mana":"{1}{B}{B}","oracle":"Flying\nDeathtouch (Any amount of damage this deals to a creature is enough to destroy it.)\nLifelink (Damage dealt by this creature also causes you to gain that much life.)","layout":"normal","cmc":3,"power":"2","toughness":"3","loyalty":null,"keywords":["Deathtouch","Flying","Lifelink"],"colors":["B"],"colorIdentity":["B"]},
  {"name":"Llanowar Elves","type":"Creature — Elf Druid","mana":"{G}","oracle":"{T}: Add {G}.","layout":"normal","cmc":1,"power":"1","toughness":"1","loyalty":null,"keywords":[],"colors":["G"],"colorIdentity":["G"]},
  {"name":"Birds of Paradise","type":"Creature — Bird","mana":"{G}","oracle":"Flying\n{T}: Add one mana of any color.","layout":"normal","cmc":1,"power":"0","toughness":"1","loyalty":null,"keywords":["Flying"],"colors":["G"],"colorIdentity":["G"]},
  {"name":"Prodigal Sorcerer","type":"Creature — Human Wizard Sorcerer","mana":"{2}{U}","oracle":"{T}: This creature deals 1 damage to any target.","layout":"normal","cmc":3,"power":"1","toughness":"1","loyalty":null,"keywords":[],"colors":["U"],"colorIdentity":["U"]},
  {"name":"Mother of Runes","type":"Creature — Human Cleric","mana":"{W}","oracle":"{T}: Target creature you control gains protection from the color of your choice until end of turn.","layout":"normal","cmc":1,"power":"1","toughness":"1","loyalty":null,"keywords":[],"colors":["W"],"colorIdentity":["W"]},
  {"name":"Doomed Traveler","type":"Creature — Human Soldier","mana":"{W}","oracle":"When this creature dies, create a 1/1 white Spirit creature token with flying.","layout":"normal","cmc":1,"power":"1","toughness":"1","loyalty":null,"keywords":[],"colors":["W"],"colorIdentity":["W"]},
  {"name":"Blood Artist","type":"Creature — Vampire","mana":"{1}{B}","oracle":"Whenever this creature or another creature dies, target player loses 1 life and you gain 1 life.","layout":"normal","cmc":2,"power":"0","toughness":"1","loyalty":null,"keywords":[],"colors":["B"],"colorIdentity":["B"]},
  {"name":"Thragtusk","type":"Creature — Beast","mana":"{4}{G}","oracle":"When this creature enters, you gain 5 life.\nWhen this creature leaves the battlefield, create a 3/3 green Beast creature token.","layout":"normal","cmc":5,"power":"5","toughness":"3","loyalty":null,"keywords":[],"colors":["G"],"colorIdentity":["G"]},
  {"name":"Monastery Swiftspear","type":"Creature — Human Monk","mana":"{R}","oracle":"Haste\nProwess (Whenever you cast a noncreature spell, this creature gets +1/+1 until end of turn.)","layout":"normal","cmc":1,"power":"1","toughness":"2","loyalty":null,"keywords":["Prowess","Haste"],"colors":["R"],"colorIdentity":["R"]},
  {"name":"Ajani's Pridemate","type":"Creature — Cat Soldier","mana":"{1}{W}","oracle":"Whenever you gain life, put a +1/+1 counter on this creature.","layout":"normal","cmc":2,"power":"2","toughness":"2","loyalty":null,"keywords":[],"colors":["W"],"colorIdentity":["W"]},
  {"name":"Silver Knight","type":"Creature — Human Knight","mana":"{W}{W}","oracle":"First strike, protection from red","layout":"normal","cmc":2,"power":"2","toughness":"2","loyalty":null,"keywords":["First strike","Protection"],"colors":["W"],"colorIdentity":["W"]},
  {"name":"Hulking Raptor","type":"Creature — Dinosaur","mana":"{2}{G}{G}","oracle":"Ward {2}\nAt the beginning of your first main phase, add {G}{G}.","layout":"normal","cmc":4,"power":"5","toughness":"3","loyalty":null,"keywords":["Ward"],"colors":["G"],"colorIdentity":["G"]},
  {"name":"Charging Rhino","type":"Creature — Rhino","mana":"{3}{G}{G}","oracle":"This creature can't be blocked by more than one creature.","layout":"normal","cmc":5,"power":"4","toughness":"4","loyalty":null,"keywords":[],"colors":["G"],"colorIdentity":["G"]},
  {"name":"Phantom Warrior","type":"Creature — Illusion Warrior","mana":"{1}{U}{U}","oracle":"This creature can't be blocked.","layout":"normal","cmc":3,"power":"2","toughness":"2","loyalty":null,"keywords":[],"colors":["U"],"colorIdentity":["U"]},
  {"name":"Cloud Elemental","type":"Creature — Elemental","mana":"{2}{U}","oracle":"Flying\nThis creature can block only creatures with flying.","layout":"normal","cmc":3,"power":"2","toughness":"3","loyalty":null,"keywords":["Flying"],"colors":["U"],"colorIdentity":["U"]},
  {"name":"Juggernaut","type":"Artifact Creature — Juggernaut","mana":"{4}","oracle":"This creature attacks each combat if able.\nThis creature can't be blocked by Walls.","layout":"normal","cmc":4,"power":"5","toughness":"3","loyalty":null,"keywords":[],"colors":[],"colorIdentity":[]},
  {"name":"Elvish Archdruid","type":"Creature — Elf Druid","mana":"{1}{G}{G}","oracle":"Other Elf creatures you control get +1/+1.\n{T}: Add {G} for each Elf you control.","layout":"normal","cmc":3,"power":"2","toughness":"2","loyalty":null,"keywords":[],"colors":["G"],"colorIdentity":["G"]},
  {"name":"Lord of Atlantis","type":"Creature — Merfolk","mana":"{U}{U}","oracle":"Other Merfolk get +1/+1 and have islandwalk. (They can't be blocked as long as defending player controls an Island.)","layout":"normal","cmc":2,"power":"2","toughness":"2","loyalty":null,"keywords":[],"colors":["U"],"colorIdentity":["U"]},
  {"name":"Fog Bank","type":"Creature — Wall","mana":"{1}{U}","oracle":"Defender (This creature can't attack.)\nFlying\nPrevent all combat damage that would be dealt to and dealt by this creature.","layout":"normal","cmc":2,"power":"0","toughness":"2","loyalty":null,"keywords":["Flying","Defender"],"colors":["U"],"colorIdentity":["U"]},
  {"name":"Venerated Rotpriest","type":"Creature — Phyrexian Druid","mana":"{G}","oracle":"Toxic 1 (Players dealt combat damage by this creature also get a poison counter.)\nWhenever a creature you control becomes the target of a spell, target opponent gets a poison counter.","layout":"normal","cmc":1,"power":"1","toughness":"2","loyalty":null,"keywords":["Toxic"],"colors":["G"],"colorIdentity":["G"]},
  {"name":"Hellrider","type":"Creature — Devil","mana":"{2}{R}{R}","oracle":"Haste\nWhenever a creature you control attacks, this creature deals 1 damage to the player or planeswalker it's attacking.","layout":"normal","cmc":4,"power":"3","toughness":"3","loyalty":null,"keywords":["Haste"],"colors":["R"],"colorIdentity":["R"]},
  {"name":"Ulamog's Crusher","type":"Creature — Eldrazi","mana":"{8}","oracle":"Annihilator 2 (Whenever this creature attacks, defending player sacrifices two permanents of their choice.)\nThis creature attacks each combat if able.","layout":"normal","cmc":8,"power":"8","toughness":"8","loyalty":null,"keywords":["Annihilator"],"colors":[],"colorIdentity":[]},
  {"name":"Palace Guard","type":"Creature — Human Soldier","mana":"{2}{W}","oracle":"This creature can block any number of creatures.","layout":"normal","cmc":3,"power":"1","toughness":"4","loyalty":null,"keywords":[],"colors":["W"],"colorIdentity":["W"]},
  {"name":"Darksteel Myr","type":"Artifact Creature — Myr","mana":"{3}","oracle":"Indestructible (Damage and effects that say \"destroy\" don't destroy this creature. If its toughness is 0 or less, it still dies.)","layout":"normal","cmc":3,"power":"0","toughness":"1","loyalty":null,"keywords":["Indestructible"],"colors":[],"colorIdentity":[]},
  {"name":"Dauthi Slayer","type":"Creature — Dauthi Soldier","mana":"{B}{B}","oracle":"Shadow (This creature can block or be blocked by only creatures with shadow.)\nThis creature attacks each combat if able.","layout":"normal","cmc":2,"power":"2","toughness":"2","loyalty":null,"keywords":["Shadow"],"colors":["B"],"colorIdentity":["B"]},
  {"name":"Grizzly Bears","type":"Creature — Bear","mana":"{1}{G}","oracle":"","layout":"normal","cmc":2,"power":"2","toughness":"2","loyalty":null,"keywords":[],"colors":["G"],"colorIdentity":["G"]},
  {"name":"Ornithopter","type":"Artifact Creature — Thopter","mana":"{0}","oracle":"Flying","layout":"normal","cmc":0,"power":"0","toughness":"2","loyalty":null,"keywords":["Flying"],"colors":[],"colorIdentity":[]},
  {"name":"Giant Spider","type":"Creature — Spider","mana":"{3}{G}","oracle":"Reach (This creature can block creatures with flying.)","layout":"normal","cmc":4,"power":"2","toughness":"4","loyalty":null,"keywords":["Reach"],"colors":["G"],"colorIdentity":["G"]},
  {"name":"Wall of Wood","type":"Creature — Wall","mana":"{G}","oracle":"Defender (This creature can't attack.)","layout":"normal","cmc":1,"power":"0","toughness":"3","loyalty":null,"keywords":["Defender"],"colors":["G"],"colorIdentity":["G"]},
  {"name":"Dryad Arbor","type":"Land Creature — Forest Dryad","mana":"","oracle":"(This land isn't a spell, it's affected by summoning sickness, and it has \"{T}: Add {G}.\")","layout":"normal","cmc":0,"power":"1","toughness":"1","loyalty":null,"keywords":[],"colors":["G"],"colorIdentity":["G"]},
  {"name":"Solemn Simulacrum","type":"Artifact Creature — Golem","mana":"{4}","oracle":"When this creature enters, you may search your library for a basic land card, put that card onto the battlefield tapped, then shuffle.\nWhen this creature dies, you may draw a card.","layout":"normal","cmc":4,"power":"2","toughness":"2","loyalty":null,"keywords":[],"colors":[],"colorIdentity":[]},
  {"name":"Nyx-Fleece Ram","type":"Enchantment Creature — Sheep","mana":"{1}{W}","oracle":"At the beginning of your upkeep, you gain 1 life.","layout":"normal","cmc":2,"power":"0","toughness":"5","loyalty":null,"keywords":[],"colors":["W"],"colorIdentity":["W"]},
  {"name":"Changeling Outcast","type":"Creature — Shapeshifter","mana":"{B}","oracle":"Changeling (This card is every creature type.)\nThis creature can't block and can't be blocked.","layout":"normal","cmc":1,"power":"1","toughness":"1","loyalty":null,"keywords":["Changeling"],"colors":["B"],"colorIdentity":["B"]},
  {"name":"Isamaru, Hound of Konda","type":"Legendary Creature — Dog","mana":"{W}","oracle":"","layout":"normal","cmc":1,"power":"2","toughness":"2","loyalty":null,"keywords":[],"colors":["W"],"colorIdentity":["W"]},
  {"name":"Smuggler's Copter","type":"Artifact — Vehicle","mana":"{2}","oracle":"Flying\nWhenever this Vehicle attacks or blocks, you may draw a card. If you do, discard a card.\nCrew 1 (Tap any number of creatures you control with total power 1 or more: This Vehicle becomes an artifact creature until end of turn.)","layout":"normal","cmc":2,"power":"3","toughness":"3","loyalty":null,"keywords":["Flying","Crew"],"colors":[],"colorIdentity":[]},
  {"name":"Gingerbrute","type":"Artifact Creature — Food Golem","mana":"{1}","oracle":"Haste (This creature can attack and {T} as soon as it comes under your control.)\n{1}: This creature can't be blocked this turn except by creatures with haste.\n{2}, {T}, Sacrifice this creature: You gain 3 life.","layout":"normal","cmc":1,"power":"1","toughness":"1","loyalty":null,"keywords":["Haste"],"colors":[],"colorIdentity":[]},
  {"name":"Lion Sash","type":"Artifact Creature — Equipment Cat","mana":"{1}{W}","oracle":"{W}: Exile target card from a graveyard. If it was a permanent card, put a +1/+1 counter on this permanent.\nEquipped creature gets +1/+1 for each +1/+1 counter on this Equipment.\nReconfigure {2} ({2}: Attach to target creature you control; or unattach from a creature. Reconfigure only as a sorcery. While attached, this isn't a creature.)","layout":"normal","cmc":2,"power":"1","toughness":"1","loyalty":null,"keywords":["Reconfigure"],"colors":["W"],"colorIdentity":["W"]},
  {"name":"Forest","type":"Basic Land — Forest","mana":"","oracle":"({T}: Add {G}.)","layout":"normal","cmc":0,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":["G"]},
  {"name":"Island","type":"Basic Land — Island","mana":"","oracle":"({T}: Add {U}.)","layout":"normal","cmc":0,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":["U"]},
  {"name":"Plains","type":"Basic Land — Plains","mana":"","oracle":"({T}: Add {W}.)","layout":"normal","cmc":0,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":["W"]},
  {"name":"Mountain","type":"Basic Land — Mountain","mana":"","oracle":"({T}: Add {R}.)","layout":"normal","cmc":0,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":["R"]},
  {"name":"Swamp","type":"Basic Land — Swamp","mana":"","oracle":"({T}: Add {B}.)","layout":"normal","cmc":0,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":["B"]},
  {"name":"Lightning Bolt","type":"Instant","mana":"{R}","oracle":"Lightning Bolt deals 3 damage to any target.","layout":"normal","cmc":1,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["R"],"colorIdentity":["R"]},
  {"name":"Sign in Blood","type":"Sorcery","mana":"{B}{B}","oracle":"Target player draws two cards and loses 2 life.","layout":"normal","cmc":2,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["B"],"colorIdentity":["B"]},
  {"name":"Terror","type":"Instant","mana":"{1}{B}","oracle":"Destroy target nonartifact, nonblack creature. It can't be regenerated.","layout":"normal","cmc":2,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["B"],"colorIdentity":["B"]},
  {"name":"Shatter","type":"Instant","mana":"{1}{R}","oracle":"Destroy target artifact.","layout":"normal","cmc":2,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["R"],"colorIdentity":["R"]},
  {"name":"Disenchant","type":"Instant","mana":"{1}{W}","oracle":"Destroy target artifact or enchantment.","layout":"normal","cmc":2,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["W"],"colorIdentity":["W"]},
  {"name":"Stone Rain","type":"Sorcery","mana":"{2}{R}","oracle":"Destroy target land.","layout":"normal","cmc":3,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["R"],"colorIdentity":["R"]},
  {"name":"Molten Frame","type":"Instant","mana":"{1}{R}","oracle":"Destroy target artifact creature.\nCycling {2} ({2}, Discard this card: Draw a card.)","layout":"normal","cmc":2,"power":null,"toughness":null,"loyalty":null,"keywords":["Cycling"],"colors":["R"],"colorIdentity":["R"]},
  {"name":"Doom Blade","type":"Instant","mana":"{1}{B}","oracle":"Destroy target nonblack creature.","layout":"normal","cmc":2,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["B"],"colorIdentity":["B"]},
  {"name":"Galvanic Blast","type":"Instant","mana":"{R}","oracle":"Galvanic Blast deals 2 damage to any target.\nMetalcraft — Galvanic Blast deals 4 damage instead if you control three or more artifacts.","layout":"normal","cmc":1,"power":null,"toughness":null,"loyalty":null,"keywords":["Metalcraft"],"colors":["R"],"colorIdentity":["R"]},
  {"name":"Tempered Steel","type":"Enchantment","mana":"{1}{W}{W}","oracle":"Artifact creatures you control get +2/+2.","layout":"normal","cmc":3,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["W"],"colorIdentity":["W"]},
  {"name":"Atog","type":"Creature — Atog","mana":"{1}{R}","oracle":"Sacrifice an artifact: This creature gets +2/+2 until end of turn.","layout":"normal","cmc":2,"power":"1","toughness":"2","loyalty":null,"keywords":[],"colors":["R"],"colorIdentity":["R"]},
  {"name":"Quirion Ranger","type":"Creature — Elf Ranger","mana":"{G}","oracle":"Return a Forest you control to its owner's hand: Untap target creature. Activate only once each turn.","layout":"normal","cmc":1,"power":"1","toughness":"1","loyalty":null,"keywords":[],"colors":["G"],"colorIdentity":["G"]},
  {"name":"Crime Novelist","type":"Creature — Goblin Bard","mana":"{2}{R}","oracle":"Whenever you sacrifice an artifact, put a +1/+1 counter on this creature and add {R}.","layout":"normal","cmc":3,"power":"1","toughness":"3","loyalty":null,"keywords":[],"colors":["R"],"colorIdentity":["R"]},
  {"name":"Rapacious Guest","type":"Creature — Halfling Citizen","mana":"{2}{B}","oracle":"Menace\nWhenever one or more creatures you control deal combat damage to a player, create a Food token.\nWhenever you sacrifice a Food, put a +1/+1 counter on this creature.\nWhen this creature leaves the battlefield, target opponent loses life equal to its power.","layout":"normal","cmc":3,"power":"2","toughness":"2","loyalty":null,"keywords":["Food","Menace"],"colors":["B"],"colorIdentity":["B"]},
  {"name":"Viscera Seer","type":"Creature — Vampire Wizard","mana":"{B}","oracle":"Sacrifice a creature: Scry 1. (Look at the top card of your library. You may put that card on the bottom.)","layout":"normal","cmc":1,"power":"1","toughness":"1","loyalty":null,"keywords":["Scry"],"colors":["B"],"colorIdentity":["B"]},
  {"name":"Roiling Regrowth","type":"Instant","mana":"{2}{G}","oracle":"Sacrifice a land. Search your library for up to two basic land cards, put them onto the battlefield tapped, then shuffle.","layout":"normal","cmc":3,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["G"],"colorIdentity":["G"]},
  {"name":"Submerge","type":"Instant","mana":"{4}{U}","oracle":"If an opponent controls a Forest and you control an Island, you may cast this spell without paying its mana cost.\nPut target creature on top of its owner's library.","layout":"normal","cmc":5,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["U"],"colorIdentity":["U"]},
  {"name":"Willow Dryad","type":"Creature — Dryad","mana":"{G}","oracle":"Forestwalk (This creature can't be blocked as long as defending player controls a Forest.)","layout":"normal","cmc":1,"power":"1","toughness":"1","loyalty":null,"keywords":["Landwalk","Forestwalk"],"colors":["G"],"colorIdentity":["G"]},
  {"name":"Allosaurus Shepherd","type":"Creature — Elf Shaman","mana":"{G}","oracle":"This spell can't be countered.\nGreen spells you control can't be countered.\n{4}{G}{G}: Until end of turn, each Elf creature you control has base power and toughness 5/5 and becomes a Dinosaur in addition to its other creature types.","layout":"normal","cmc":1,"power":"1","toughness":"1","loyalty":null,"keywords":[],"colors":["G"],"colorIdentity":["G"]},
  {"name":"Lignify","type":"Kindred Enchantment — Treefolk Aura","mana":"{1}{G}","oracle":"Enchant creature\nEnchanted creature is a Treefolk with base power and toughness 0/4 and loses all abilities.","layout":"normal","cmc":2,"power":null,"toughness":null,"loyalty":null,"keywords":["Enchant"],"colors":["G"],"colorIdentity":["G"]},
  {"name":"Cobbled Wings","type":"Artifact — Equipment","mana":"{2}","oracle":"Equipped creature has flying.\nEquip {1} ({1}: Attach to target creature you control. Equip only as a sorcery.)","layout":"normal","cmc":2,"power":null,"toughness":null,"loyalty":null,"keywords":["Equip"],"colors":[],"colorIdentity":[]},
  {"name":"Tarmogoyf","type":"Creature — Lhurgoyf","mana":"{1}{G}","oracle":"Tarmogoyf's power is equal to the number of card types among cards in all graveyards and its toughness is equal to that number plus 1.","layout":"normal","cmc":2,"power":"*","toughness":"1+*","loyalty":null,"keywords":[],"colors":["G"],"colorIdentity":["G"]},
  {"name":"Crusader of Odric","type":"Creature — Human Soldier","mana":"{2}{W}","oracle":"Crusader of Odric's power and toughness are each equal to the number of creatures you control.","layout":"normal","cmc":3,"power":"*","toughness":"*","loyalty":null,"keywords":[],"colors":["W"],"colorIdentity":["W"]},
  {"name":"Mystic Subdual","type":"Enchantment — Aura","mana":"{1}{U}","oracle":"Flash\nEnchant creature\nEnchanted creature gets -2/-0 and loses all abilities. (Mutating onto the creature won't give it new abilities. It can gain abilities in other ways.)","layout":"normal","cmc":2,"power":null,"toughness":null,"loyalty":null,"keywords":["Enchant","Flash"],"colors":["U"],"colorIdentity":["U"]},
  {"name":"Drop Bear","type":"Creature — Koala Bear Horror","mana":"{3}{R}{G}","oracle":"Flash, haste\nDrop Bear has power and toughness each equal to the number of Forests you control plus the number of Bears you control.\nWhen this creature enters, it fights up to one target creature.","layout":"normal","cmc":5,"power":"*","toughness":"*","loyalty":null,"keywords":["Haste","Fight","Flash"],"colors":["G","R"],"colorIdentity":["G","R"]},
  {"name":"Lydari Elephant","type":"Creature — Elephant","mana":"{4}{G}","oracle":"As Lydari Elephant enters, choose two numbers from 3 to 7 at random. Lydari Elephant's power is equal to the first number chosen and its toughness equal to the second number chosen.","layout":"normal","cmc":5,"power":"*","toughness":"*","loyalty":null,"keywords":[],"colors":["G"],"colorIdentity":["G"]},
  {"name":"Glorious Anthem","type":"Enchantment","mana":"{1}{W}{W}","oracle":"Creatures you control get +1/+1.","layout":"normal","cmc":3,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["W"],"colorIdentity":["W"]},
  {"name":"Elvish Mystic","type":"Creature — Elf Druid","mana":"{G}","oracle":"{T}: Add {G}.","layout":"normal","cmc":1,"power":"1","toughness":"1","loyalty":null,"keywords":[],"colors":["G"],"colorIdentity":["G"]},
  {"name":"Fireblast","type":"Instant","mana":"{4}{R}{R}","oracle":"You may sacrifice two Mountains rather than pay this spell's mana cost.\nFireblast deals 4 damage to any target.","layout":"normal","cmc":6,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["R"],"colorIdentity":["R"]},
  {"name":"Gush","type":"Instant","mana":"{4}{U}","oracle":"You may return two Islands you control to their owner's hand rather than pay this spell's mana cost.\nDraw two cards.","layout":"normal","cmc":5,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["U"],"colorIdentity":["U"]},
  {"name":"Snuff Out","type":"Instant","mana":"{3}{B}","oracle":"If you control a Swamp, you may pay 4 life rather than pay this spell's mana cost.\nDestroy target nonblack creature. It can't be regenerated.","layout":"normal","cmc":4,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["B"],"colorIdentity":["B"]},
  {"name":"Disciple of the Vault","type":"Creature — Human Cleric","mana":"{B}","oracle":"Whenever an artifact is put into a graveyard from the battlefield, you may have target opponent lose 1 life.","layout":"normal","cmc":1,"power":"1","toughness":"1","loyalty":null,"keywords":[],"colors":["B"],"colorIdentity":["B"]},
  {"name":"Elderfang Venom","type":"Enchantment","mana":"{2}{B}{G}","oracle":"Attacking Elves you control have deathtouch.\nWhenever an Elf you control dies, each opponent loses 1 life and you gain 1 life.","layout":"normal","cmc":4,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["B","G"],"colorIdentity":["B","G"]},
  {"name":"Elanor Gardner","type":"Legendary Creature — Halfling Scout","mana":"{3}{G}","oracle":"When Elanor enters, create a Food token.\nAt the beginning of your end step, if you sacrificed a Food this turn, you may search your library for a basic land card, put that card onto the battlefield tapped, then shuffle.","layout":"normal","cmc":4,"power":"2","toughness":"4","loyalty":null,"keywords":["Food"],"colors":["G"],"colorIdentity":["G"]},
  {"name":"Wrath of God","type":"Sorcery","mana":"{2}{W}{W}","oracle":"Destroy all creatures. They can't be regenerated.","layout":"normal","cmc":4,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["W"],"colorIdentity":["W"]},
  {"name":"Neurok Spy","type":"Creature — Human Rogue","mana":"{2}{U}","oracle":"This creature can't be blocked as long as defending player controls an artifact.","layout":"normal","cmc":3,"power":"2","toughness":"2","loyalty":null,"keywords":[],"colors":["U"],"colorIdentity":["U"]},
  {"name":"Twisted Image","type":"Instant","mana":"{U}","oracle":"Switch target creature's power and toughness until end of turn.\nDraw a card.","layout":"normal","cmc":1,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["U"],"colorIdentity":["U"]},
{"name":"Broken Wings","type":"Instant","mana":"{2}{G}","oracle":"Destroy target artifact, enchantment, or creature with flying.","layout":"normal","cmc":3,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["G"],"colorIdentity":["G"]},
  {"name":"Return to the Earth","type":"Instant","mana":"{3}{G}","oracle":"Destroy target artifact, enchantment, or creature with flying.","layout":"normal","cmc":4,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["G"],"colorIdentity":["G"]},
  {"name":"Shoot Down","type":"Sorcery","mana":"{3}{G}","oracle":"Exile target artifact, enchantment, or creature with flying.","layout":"normal","cmc":4,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["G"],"colorIdentity":["G"]},
  {"name":"Copy Enchantment","type":"Enchantment","mana":"{2}{U}","oracle":"You may have this enchantment enter as a copy of any enchantment on the battlefield.","layout":"normal","cmc":3,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["U"],"colorIdentity":["U"]},
  {"name":"Mirrormade","type":"Enchantment","mana":"{1}{U}{U}","oracle":"You may have this enchantment enter as a copy of any artifact or enchantment on the battlefield.","layout":"normal","cmc":3,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["U"],"colorIdentity":["U"]},
  {"name":"Clever Impersonator","type":"Creature — Shapeshifter","mana":"{2}{U}{U}","oracle":"You may have this creature enter as a copy of any nonland permanent on the battlefield.","layout":"normal","cmc":4,"power":"0","toughness":"0","loyalty":null,"keywords":[],"colors":["U"],"colorIdentity":["U"]},
  {"name":"Leyline Binding","type":"Enchantment","mana":"{5}{W}","oracle":"Flash\nDomain — This spell costs {1} less to cast for each basic land type among lands you control.\nWhen this enchantment enters, exile target nonland permanent an opponent controls until this enchantment leaves the battlefield.","layout":"normal","cmc":6,"power":null,"toughness":null,"loyalty":null,"keywords":["Domain","Flash"],"colors":["W"],"colorIdentity":["W"]},
  {"name":"Sphere of Safety","type":"Enchantment","mana":"{4}{W}","oracle":"Creatures can't attack you or planeswalkers you control unless their controller pays {X} for each of those creatures, where X is the number of enchantments you control.","layout":"normal","cmc":5,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["W"],"colorIdentity":["W"]},
  {"name":"Boon Satyr","type":"Enchantment Creature — Satyr","mana":"{1}{G}{G}","oracle":"Flash\nBestow {3}{G}{G} (If you cast this card for its bestow cost, it's an Aura spell with enchant creature. It becomes a creature again if it's not attached.)\nEnchanted creature gets +4/+2.","layout":"normal","cmc":3,"power":"4","toughness":"2","loyalty":null,"keywords":["Bestow","Flash"],"colors":["G"],"colorIdentity":["G"]},
  {"name":"Vedalken Heretic","type":"Creature — Vedalken Rogue","mana":"{G}{U}","oracle":"Whenever this creature deals damage to an opponent, you may draw a card.","layout":"normal","cmc":2,"power":"1","toughness":"1","loyalty":null,"keywords":[],"colors":["G","U"],"colorIdentity":["G","U"]},
  {"name":"Elvish Warrior","type":"Creature — Elf Warrior","mana":"{G}{G}","oracle":"","layout":"normal","cmc":2,"power":"2","toughness":"3","loyalty":null,"keywords":[],"colors":["G"],"colorIdentity":["G"]},
  {"name":"Ravager's Mace","type":"Artifact — Equipment","mana":"{1}{B}{R}","oracle":"When this Equipment enters, attach it to target creature you control.\nEquipped creature gets +1/+0 for each creature in your party and has menace. (Your party consists of up to one each of Cleric, Rogue, Warrior, and Wizard.)\nEquip {2}{B}{R}","layout":"normal","cmc":3,"power":null,"toughness":null,"loyalty":null,"keywords":["Equip"],"colors":["B","R"],"colorIdentity":["B","R"]},
  {"name":"Captain Lannery Storm","type":"Legendary Creature — Human Pirate","mana":"{2}{R}","oracle":"Haste\nWhenever Captain Lannery Storm attacks, create a Treasure token. (It's an artifact with \"{T}, Sacrifice this token: Add one mana of any color.\")\nWhenever you sacrifice a Treasure, Captain Lannery Storm gets +1/+0 until end of turn.","layout":"normal","cmc":3,"power":"2","toughness":"2","loyalty":null,"keywords":["Treasure","Haste"],"colors":["R"],"colorIdentity":["R"]},
  {"name":"Craw Wurm","type":"Creature — Wurm","mana":"{4}{G}{G}","oracle":"","layout":"normal","cmc":6,"power":"6","toughness":"4","loyalty":null,"keywords":[],"colors":["G"],"colorIdentity":["G"]},
  {"name":"Banner of Kinship","type":"Artifact","mana":"{5}","oracle":"As this artifact enters, choose a creature type. This artifact enters with a fellowship counter on it for each creature you control of the chosen type.\nCreatures you control of the chosen type get +1/+1 for each fellowship counter on this artifact.","layout":"normal","cmc":5,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":[]},
  {"name":"The Ur-Dragon","type":"Legendary Creature — Dragon Avatar","mana":"{4}{W}{U}{B}{R}{G}","oracle":"Eminence — As long as The Ur-Dragon is in the command zone or on the battlefield, other Dragon spells you cast cost {1} less to cast.\nFlying\nWhenever one or more Dragons you control attack, draw that many cards, then you may put a permanent card from your hand onto the battlefield.","layout":"normal","cmc":9,"power":"10","toughness":"10","loyalty":null,"keywords":["Flying","Eminence"],"colors":["B","G","R","U","W"],"colorIdentity":["B","G","R","U","W"]},
  {"name":"Shivan Dragon","type":"Creature — Dragon","mana":"{4}{R}{R}","oracle":"Flying\n{R}: This creature gets +1/+0 until end of turn.","layout":"normal","cmc":6,"power":"5","toughness":"5","loyalty":null,"keywords":["Flying"],"colors":["R"],"colorIdentity":["R"]},
  {"name":"Excalibur, Sword of Eden","type":"Legendary Artifact — Equipment","mana":"{12}","oracle":"This spell costs {X} less to cast, where X is the total mana value of historic permanents you control. (Artifacts, legendaries, and Sagas are historic.)\nEquipped creature gets +10/+0 and has vigilance.\nEquip legendary creature {2}","layout":"normal","cmc":12,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":[]},
  {"name":"Vihaan, Goldwaker","type":"Legendary Creature — Dwarf Warlock","mana":"{R}{W}{B}","oracle":"Other outlaws you control have vigilance and haste. (Assassins, Mercenaries, Pirates, Rogues, and Warlocks are outlaws.)\nAt the beginning of combat on your turn, you may have Treasures you control become 3/3 Construct Assassin artifact creatures in addition to their other types until end of turn.","layout":"normal","cmc":3,"power":"3","toughness":"3","loyalty":null,"keywords":[],"colors":["B","R","W"],"colorIdentity":["B","R","W"]},
  {"name":"Wild Growth","type":"Enchantment — Aura","mana":"{G}","oracle":"Enchant land\nWhenever enchanted land is tapped for mana, its controller adds an additional {G}.","layout":"normal","cmc":1,"power":null,"toughness":null,"loyalty":null,"keywords":["Enchant"],"colors":["G"],"colorIdentity":["G"]},
  {"name":"Exotic Orchard","type":"Land","mana":"","oracle":"{T}: Add one mana of any color that a land an opponent controls could produce.","layout":"normal","cmc":0,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":[]},
  {"name":"Utopia Sprawl","type":"Enchantment — Aura","mana":"{G}","oracle":"Enchant Forest\nAs this Aura enters, choose a color.\nWhenever enchanted Forest is tapped for mana, its controller adds an additional one mana of the chosen color.","layout":"normal","cmc":1,"power":null,"toughness":null,"loyalty":null,"keywords":["Enchant"],"colors":["G"],"colorIdentity":["G"]},
  {"name":"Gideon Jura","type":"Legendary Planeswalker — Gideon","mana":"{3}{W}{W}","oracle":"+2: During target opponent's next turn, creatures that player controls attack Gideon Jura if able.\n−2: Destroy target tapped creature.\n0: Until end of turn, Gideon Jura becomes a 6/6 Human Soldier creature that's still a planeswalker. Prevent all damage that would be dealt to him this turn.","layout":"normal","cmc":5,"power":null,"toughness":null,"loyalty":"6","keywords":[],"colors":["W"],"colorIdentity":["W"]},
  {"name":"The Cabbage Merchant","type":"Legendary Creature — Human Citizen","mana":"{2}{G}","oracle":"Whenever an opponent casts a noncreature spell, create a Food token. (It's an artifact with \"{2}, {T}, Sacrifice this token: You gain 3 life.\")\nWhenever a creature deals combat damage to you, sacrifice a Food token.\nTap two untapped Foods you control: Add one mana of any color.","layout":"normal","cmc":3,"power":"2","toughness":"2","loyalty":null,"keywords":["Food"],"colors":["G"],"colorIdentity":["G"]},
  {"name":"Abomination, Irradiated Brute","type":"Legendary Creature — Gamma Villain","mana":"{2}{G}{G}","oracle":"Trample\nWhenever a Gamma or Villain you control deals combat damage to a player, put that many +1/+1 counters on Abomination.","layout":"normal","cmc":4,"power":"4","toughness":"4","loyalty":null,"keywords":["Trample"],"colors":["G"],"colorIdentity":["G"]},
  {"name":"Brawn, Amadeus Cho","type":"Legendary Creature — Gamma Scientist Hero","mana":"{1}{G/U}","oracle":"When Brawn enters, draw a card.\nPower-up — {4}{G/U}: Put a +1/+1 counter on Brawn for each card in your hand. (Activate each power-up ability only once. Reduce the cost by his mana cost if he entered this turn.)","layout":"normal","cmc":2,"power":"1","toughness":"1","loyalty":null,"keywords":["Power-up"],"colors":["G","U"],"colorIdentity":["G","U"]},
  {"name":"Ironscale Hydra","type":"Creature — Hydra","mana":"{3}{G}{G}","oracle":"If a creature would deal combat damage to this creature, prevent that damage and put a +1/+1 counter on this creature.","layout":"normal","cmc":5,"power":"5","toughness":"5","loyalty":null,"keywords":[],"colors":["G"],"colorIdentity":["G"]},
  {"name":"Swarm of Locus","type":"Creature — Insect Locus","mana":"{1}{B}","oracle":"Flying\nWhenever Swarm of Locus attacks, it gets +1/+0 until end of turn for each Locus you control.","layout":"normal","cmc":2,"power":"1","toughness":"1","loyalty":null,"keywords":["Flying"],"colors":["B"],"colorIdentity":["B"]},
  {"name":"Horned Stoneseeker","type":"Creature — Lizard","mana":"{1}{R}","oracle":"Menace\nWhen this creature enters, create a tapped Powerstone token. (It's an artifact with \"{T}: Add {C}. This mana can't be spent to cast a nonartifact spell.\")\nWhen this creature leaves the battlefield, sacrifice a Powerstone.","layout":"normal","cmc":2,"power":"2","toughness":"2","loyalty":null,"keywords":["Menace"],"colors":["R"],"colorIdentity":["R"]},
];
// the family S2 does not build, for the kept-parked row
const KEPT = [
  {"name":"Polymorphist's Jest","type":"Instant","mana":"{1}{U}{U}","oracle":"Until end of turn, each creature target player controls loses all abilities and becomes a blue Frog with base power and toughness 1/1.","layout":"normal","cmc":3,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["U"],"colorIdentity":["U"]},
  {"name":"Witness Protection","type":"Enchantment — Aura","mana":"{U}","oracle":"Enchant creature\nEnchanted creature loses all abilities and is a green and white Citizen creature with base power and toughness 1/1 named Legitimate Businessperson. (It loses all other colors, card types, creature types, and names.)","layout":"normal","cmc":1,"power":null,"toughness":null,"loyalty":null,"keywords":["Enchant"],"colors":["U"],"colorIdentity":["U"]},
  {"name":"Unable to Scream","type":"Enchantment — Aura","mana":"{U}","oracle":"Enchant creature\nEnchanted creature loses all abilities and is a Toy artifact creature with base power and toughness 0/2 in addition to its other types.\nAs long as enchanted creature is face down, it can't be turned face up.","layout":"normal","cmc":1,"power":null,"toughness":null,"loyalty":null,"keywords":["Enchant"],"colors":["U"],"colorIdentity":["U"]},
  {"name":"Lizard, Connors's Curse","type":"Legendary Creature — Lizard Villain","mana":"{2}{G}{G}","oracle":"Trample\nLizard Formula — When Lizard, Connors's Curse enters, up to one other target creature loses all abilities and becomes a green Lizard creature with base power and toughness 4/4.","layout":"normal","cmc":4,"power":"5","toughness":"5","loyalty":null,"keywords":["Lizard Formula","Trample"],"colors":["G"],"colorIdentity":["G"]},
  {"name":"Darksteel Mutation","type":"Enchantment — Aura","mana":"{1}{W}","oracle":"Enchant creature\nEnchanted creature is an Insect artifact creature with base power and toughness 0/1 and has indestructible, and it loses all other abilities, card types, and creature types.","layout":"normal","cmc":2,"power":null,"toughness":null,"loyalty":null,"keywords":["Enchant"],"colors":["W"],"colorIdentity":["W"]},
  {"name":"Imprisoned in the Moon","type":"Enchantment — Aura","mana":"{2}{U}","oracle":"Enchant creature, land, or planeswalker\nEnchanted permanent is a colorless land with \"{T}: Add {C}\" and loses all other card types and abilities.","layout":"normal","cmc":3,"power":null,"toughness":null,"loyalty":null,"keywords":["Enchant"],"colors":["U"],"colorIdentity":["U"]},
  {"name":"Mercurial Transformation","type":"Sorcery — Lesson","mana":"{1}{U}","oracle":"Until end of turn, target nonland permanent loses all abilities and becomes your choice of a blue Frog creature with base power and toughness 1/1 or a blue Octopus creature with base power and toughness 4/4.","layout":"normal","cmc":2,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["U"],"colorIdentity":["U"]},
  {"name":"Oko, Thief of Crowns","type":"Legendary Planeswalker — Oko","mana":"{1}{G}{U}","oracle":"+2: Create a Food token. (It's an artifact with \"{2}, {T}, Sacrifice this token: You gain 3 life.\")\n+1: Target artifact or creature loses all abilities and becomes a green Elk creature with base power and toughness 3/3.\n−5: Exchange control of target artifact or creature you control and target creature an opponent controls with power 3 or less.","layout":"normal","cmc":3,"power":null,"toughness":null,"loyalty":"4","keywords":["Food"],"colors":["G","U"],"colorIdentity":["G","U"]},
];
const card = (name) => {
  const c = CARDS.find((x) => x.name === name) ?? KEPT.find((x) => x.name === name);
  if (!c) throw new Error(`not in the fixture: ${name}`);
  return c;
};
const NEUTRAL = "Probe Permanent";
const ID = "probe";
const VOCAB = [...new Set([...COMBAT_KEYWORDS, ...GRANTABLE_STATIC_KEYWORDS, "changeling", "protection", "ward", "undying", "exalted",
  "flanking", "prowess", "annihilator", "toxic", "riot", "defender", "haste"].map((k) => String(k).toLowerCase()))];
const ABILITY_KINDS = new Set(["activate-ability", "tap-for-mana", "crew-vehicle", "double-mana-pool", "activate-loyalty"]);
const POOL = { W: 9, U: 9, B: 9, R: 9, G: 9, C: 9 };
const PANEL = ["Grizzly Bears", "Ornithopter", "Giant Spider", "Wall of Wood", "Dauthi Slayer"];
const other = (seat) => (seat === "user" ? "ai" : "user");

/**
 * A two-player board in the user's precombat main phase (turn 3, the user active with priority, a deep mana pool for both): `user` /
 * `ai` are [id, card] lists (every permanent untapped, not summoning sick, timestamps 1…N); `hand` names the user's hand; `lands` false
 * leaves out the five basic lands each seat otherwise gets.
 */
function board({ user = [], ai = [], hand = [], lands = true } = {}) {
  const s0 = G.createGameState({ userDeck: [], aiDeck: [] });
  let ts = 1;
  const perm = (id, c, controller) => ({ ...G.createPermanent({ id, card: { ...c, id: `card-${id}` }, controller, summoningSick: false }), timestamp: ts++, enteredOnTurn: 1 });
  const basics = (seat) => (lands ? ["Forest", "Island", "Plains", "Swamp", "Mountain"].map((n, i) => [`${seat}-land-${i}`, card(n)]) : []);
  return {
    ...s0, turn: 3, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", timestampCounter: 100,
    players: {
      ...s0.players,
      user: { ...s0.players.user, battlefield: [...user, ...basics("user")].map(([id, c]) => perm(id, c, "user")), hand: hand.map((n, i) => ({ ...card(n), id: `hand-${i}` })),
        manaPool: { ...s0.players.user.manaPool, ...POOL }, library: [{ ...card("Forest"), id: "lib-0" }, { ...card("Island"), id: "lib-1" }, { ...card("Plains"), id: "lib-2" }] },
      ai: { ...s0.players.ai, battlefield: [...ai, ...basics("ai")].map(([id, c]) => perm(id, c, "ai")), hand: [], manaPool: { ...s0.players.ai.manaPool, ...POOL },
        library: [{ ...card("Island"), id: "ai-lib-0" }, { ...card("Forest"), id: "ai-lib-1" }] },
    },
  };
}
const permOf = (s, id) => G.findPermanent(s, id)?.permanent ?? null;
const controllerOf = (s, id) => G.findPermanent(s, id)?.controller ?? null;
/** Resolve the stack, flushing triggers with the engine's own chooser, until it is empty (a ward's "unless its controller pays" is paid). */
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
/** The user's cast-spell offers of `name` (a card in hand) at `targetId`. */
const castOffers = (s, name, targetId, seat = "user") => LC.legalActionsForPlayer(s, seat).filter((a) => a.kind === "cast-spell" && a.name === name && (targetId == null || (a.targets || []).some((t) => t.id === targetId)));
/** Cast `name` at `targetId` through the real cast lane and resolve it (Trickster's Elk: its bestow cast — CR 702.103a). */
function castAt(s, name, targetId) {
  const acts = castOffers(s, name, targetId).filter((a) => name !== "Trickster's Elk" || a.bestow);
  expect(acts.length, `${name} at ${targetId} is offered`).toBeGreaterThan(0);
  return settle(AD.dispatchAction(s, acts[0]));
}
/** End the turn's "until end of turn" effects as the cleanup step does (CR 514.2). */
const cleanup = (s) => L.expireContinuousEffects(s, { atCleanupOfTurn: s.turn });
/** What the creature IS: power / toughness, card types (supertypes among them), subtypes, colours and every keyword it has. */
function chars(s, id) {
  const t = L.permanentTypes(s, id);
  return { pt: [L.permanentPower(s, id), L.permanentToughness(s, id)], types: [...t.types].sort(), subtypes: [...t.subtypes].sort(),
    colors: [...L.permanentColors(s, id)].sort(), keywords: VOCAB.filter((k) => L.permanentHasKeyword(s, id, k)) };
}
const seated = (s, seat) => ({ ...s, activePlayer: seat, priorityHolder: seat, phase: "precombat-main", step: "main", combat: null, stack: [], pendingTriggers: [] });
const attachmentsOf = (s, id) => (permOf(s, id)?.attachments || []);
const destroy = (s, id, by = "user") => SE.applyDestroyEffect(s, { controller: by, targets: [{ type: "permanent", id }] });

// What each S2 card makes the creature: its creature type, colours (null: the creature's own — no colour word) and base P/T.
const S2_RESULT = {
  "Kenrith's Transformation": { sub: "Elk", colors: ["G"], pt: [3, 3] },
  "Eaten by Piranhas": { sub: "Skeleton", colors: ["B"], pt: [1, 1] },
  "Frogify": { sub: "Frog", colors: ["U"], pt: [1, 1] },
  "Reprobation": { sub: "Coward", colors: null, pt: [0, 1] },
  "Trickster's Elk": { sub: "Elk", colors: ["G"], pt: [3, 3] },
  "Fowl Play": { sub: "Bird", colors: null, pt: [1, 1] },
  "Amphibian Downpour": { sub: "Frog", colors: ["U"], pt: [1, 1] },
};
const S2_AURAS = Object.keys(S2_RESULT);
const SUPERTYPES = new Set(["Basic", "Legendary", "Snow", "World", "Ongoing"]);
/** What `c` is under `s2`, as `chars` reads it: its supertypes and Creature, the S2 creature type, colours and base P/T, no keyword. */
function underS2(c, s2) {
  const r = S2_RESULT[s2];
  const sup = String(c.type).split(" — ")[0].split(/\s+/).filter((w) => SUPERTYPES.has(w));
  return { pt: [...r.pt], types: [...sup, "Creature"].sort(), subtypes: [r.sub], colors: [...(r.colors ?? c.colors ?? [])].sort(), keywords: [] };
}

// ─── 1. the credit ──────────────────────────────────────────────────────────────────────────────────────────────────────────────
// [card, the bundled oracle line it proves, its tier] — every line quoted from the fixture (the bundled oracle), checked below.
const CREDITED = [
  ["Kenrith's Transformation", "When this Aura enters, draw a card.\nEnchanted creature loses all abilities and is a green Elk creature with base power and toughness 3/3.", "native-aura"],
  ["Eaten by Piranhas", "Enchanted creature loses all abilities and is a black Skeleton creature with base power and toughness 1/1.", "native-aura"],
  ["Frogify", "Enchanted creature loses all abilities and is a blue Frog creature with base power and toughness 1/1.", "native-aura"],
  ["Reprobation", "Enchanted creature loses all abilities and is a Coward creature with base power and toughness 0/1.", "native-aura"],
  ["Trickster's Elk", "Enchanted creature loses all abilities and is a green Elk creature with base power and toughness 3/3.", "native-aura"],
  ["Fowl Play", "Enchanted creature loses all abilities and is a Bird creature with base power and toughness 1/1.", "native-aura"],
];
// The cards S2 does not build, each with its reason (and the one whose loss sentence S2 reads but whose other text is unread).
const KEPT_PARKED = [
  ["Amphibian Downpour", "its Storm line (copies of a permanent spell become tokens — CR 702.40a, 707.10f) is unread on an Aura; its S2 sentence is read, so its bonus applies at runtime (the §2 coupling)"],
  ["Polymorphist's Jest", "S3 — \"each creature target player controls\" is a group (CR 611.2c), and it sets no card type"],
  ["Witness Protection", "out of the program's scope — it sets a name (\"named Legitimate Businessperson\")"],
  ["Unable to Scream", "\"is a Toy artifact creature … in addition to its other types\" adds types (CR 205.1b); its face-down line is unread"],
  ["Lizard, Connors's Curse", "a trigger's \"up to one other target creature\" with no duration — not an Aura form"],
  ["Darksteel Mutation", "S4 — \"has indestructible\" is a grant from the same effect"],
  ["Imprisoned in the Moon", "S5 — a noncreature result with a granted mana ability"],
  ["Mercurial Transformation", "a nonland permanent, and a choice of two results"],
];

describe("S2 — the credit (classification over the bundled text)", () => {
  for (const [name, line, tier] of CREDITED) {
    it(`${name}: "${line.split("\n").pop()}" → ${tier}`, () => {
      expect(String(card(name).oracle).replace(/\n/g, " ")).toContain(line.replace(/\n/g, " "));
      expect(classifyCard(card(name))).toBe(tier);
    });
  }
  it("the S2 Aura sentence reads as one effect: the loss (layer 6), card types set to Creature (layer 4), the creature type replaced, the colour set (none for Reprobation), base P/T 7b", () => {
    const ops = (n) => parseAttachedBonus(card(n)).map((d) => [d.layer, d.op.layerOp, d.op.types ?? d.op.subtypes ?? d.op.colors ?? `${d.op.power}/${d.op.toughness}`]);
    expect(ops("Kenrith's Transformation")).toEqual([[6, "loseAllAbilities", "undefined/undefined"], [4, "setCardTypes", ["Creature"]], [4, "replaceCreatureTypes", ["Elk"]], [5, "setColor", ["G"]], [7, "ptSet", "3/3"]]);
    expect(ops("Reprobation")).toEqual([[6, "loseAllAbilities", "undefined/undefined"], [4, "setCardTypes", ["Creature"]], [4, "replaceCreatureTypes", ["Coward"]], [7, "ptSet", "0/1"]]);
    expect(S2_AURAS.filter((n) => n !== "Trickster's Elk").map((n) => [n, printedAuraReading(card(n)).side])).toEqual(S2_AURAS.filter((n) => n !== "Trickster's Elk").map((n) => [n, n === "Amphibian Downpour" ? null : "enemy"]));
  });
  it("the cards S2 does not build stay parked (each with its reason)", () => {
    expect(KEPT_PARKED.map(([n]) => [n, /^native/.test(String(classifyCard(card(n))))])).toEqual(KEPT_PARKED.map(([n]) => [n, false]));
    expect(KEPT_PARKED.every(([, why]) => why.length > 10)).toBe(true);
  });
  it("a planeswalker's \"loses all abilities and becomes a green Elk creature\" (Oko) and a trigger's (Lizard) match no shape: their parses carry no loss", () => {
    expect(JSON.stringify(PR.parseEffectClause("Target artifact or creature loses all abilities and becomes a green Elk creature with base power and toughness 3/3.", "Planeswalker"))).not.toContain("lose-all-abilities");
    expect([...parseAttachedBonus(card("Witness Protection")), ...parseAttachedBonus(card("Unable to Scream"))]).toEqual([]);
  });
});

describe("S2 — the Auras on the battlefield (each cast through the real cast lane at the opponent's Serra Angel)", () => {
  const onAngel = (aura) => castAt(board({ ai: [["angel", card("Serra Angel")]], hand: [aura] }), aura, "angel");
  for (const aura of S2_AURAS) {
    const want = underS2(card("Serra Angel"), aura);
    it(`${aura}: the enchanted Angel is a ${want.pt.join("/")} ${want.colors.join("") || "colorless"} ${want.subtypes.join(" ")} — a Creature and nothing else, with no keyword (CR 205.1a, 105.3, 613.4b, 613.1f)`, () => {
      const s = onAngel(aura);
      expect(attachmentsOf(s, "angel").length, "the Aura is attached").toBe(1);
      expect(chars(s, "angel")).toEqual(want);
    });
  }
  it("Kenrith's Transformation: \"When this Aura enters, draw a card.\" — its caster draws one", () => {
    const s = onAngel("Kenrith's Transformation");
    expect(s.players.user.hand.length).toBe(1);
  });
  it("Trickster's Elk bestowed (CR 702.103b): the Elk is an Aura on the Angel and no creature; when the Angel leaves, the Elk is a 3/3 green enchantment creature Elk again with its own text (CR 702.103f)", () => {
    const s = onAngel("Trickster's Elk");
    const elkId = attachmentsOf(s, "angel")[0];
    expect(permOf(s, elkId)?.bestowed).toBe(true);
    expect(L.permanentIsCreature(s, elkId)).toBe(false);
    expect(L.abilityLossOf(s, elkId)).toBe(null); // its own text is not under its effect
    const gone = destroy(s, "angel");
    expect(permOf(gone, "angel")).toBe(null);
    expect([permOf(gone, elkId)?.attachedTo ?? null, chars(gone, elkId)]).toEqual([null, { pt: [3, 3], types: ["Creature", "Enchantment"], subtypes: ["Elk"], colors: ["G"], keywords: [] }]);
  });
  it("Trickster's Elk cast for its mana cost is a 3/3 Elk creature that changes nothing (control)", () => {
    const s0 = board({ ai: [["angel", card("Serra Angel")]], hand: ["Trickster's Elk"] });
    const creatureCast = castOffers(s0, "Trickster's Elk", null).find((a) => !a.bestow);
    const s = settle(AD.dispatchAction(s0, creatureCast));
    const elk = s.players.user.battlefield.find((p) => p.card?.name === "Trickster's Elk");
    expect([chars(s, elk.id).pt, L.permanentIsCreature(s, elk.id), chars(s, "angel").keywords]).toEqual([[3, 3], true, ["flying", "vigilance"]]);
  });
  it("each Aura leaving restores the creature: Frogify destroyed, the Angel is a 4/4 white Angel with flying and vigilance again", () => {
    const s = onAngel("Frogify");
    const gone = destroy(s, attachmentsOf(s, "angel")[0]);
    expect(chars(gone, "angel")).toEqual({ pt: [4, 4], types: ["Creature"], subtypes: ["Angel"], colors: ["W"], keywords: ["flying", "vigilance"] });
  });
});

describe("S2 — an artifact creature (CR 205.1a: it is no longer an artifact)", () => {
  it("Frogify on Ornithopter: a 1/1 blue Frog, Creature only — Tempered Steel stops pumping it (2/4 before), and it can't fly", () => {
    const s0 = board({ ai: [["thopter", card("Ornithopter")], ["steel", card("Tempered Steel")]], hand: ["Frogify"] });
    expect(chars(s0, "thopter")).toEqual({ pt: [2, 4], types: ["Artifact", "Creature"], subtypes: ["Thopter"], colors: [], keywords: ["flying"] });
    expect(chars(castAt(s0, "Frogify", "thopter"), "thopter")).toEqual({ pt: [1, 1], types: ["Creature"], subtypes: ["Frog"], colors: ["U"], keywords: [] });
  });
  it("after the change, Terror (\"nonartifact, nonblack creature\") may target it, Shatter (\"target artifact\") and Molten Frame (\"target artifact creature\") may not — the reverse of before", () => {
    const s0 = board({ ai: [["thopter", card("Ornithopter")]], hand: ["Frogify", "Terror", "Shatter", "Molten Frame"] });
    const offered = (s) => ["Terror", "Shatter", "Molten Frame"].map((n) => [n, castOffers(s, n, "thopter").length > 0]);
    expect(offered(s0)).toEqual([["Terror", false], ["Shatter", true], ["Molten Frame", true]]);
    expect(offered(castAt(s0, "Frogify", "thopter"))).toEqual([["Terror", true], ["Shatter", false], ["Molten Frame", false]]);
  });
  it("Eaten by Piranhas makes it black: Terror may target neither the printed artifact nor the black Skeleton", () => {
    const s0 = board({ ai: [["thopter", card("Ornithopter")]], hand: ["Eaten by Piranhas", "Terror"] });
    const s = castAt(s0, "Eaten by Piranhas", "thopter");
    expect([chars(s, "thopter").colors, castOffers(s, "Terror", "thopter").length]).toEqual([["B"], 0]);
  });
  it("Galvanic Blast's metalcraft (\"if you control three or more artifacts\") no longer counts it: 2 damage, not 4", () => {
    const mk = () => board({ user: [["thopter", card("Ornithopter")], ["wings", card("Cobbled Wings")], ["copter", card("Smuggler's Copter")]], hand: ["Frogify", "Galvanic Blast"] });
    const blast = (s) => { const a = castOffers(s, "Galvanic Blast", "ai")[0]; expect(a, "Galvanic Blast at the opponent").toBeTruthy(); return settle(AD.dispatchAction(s, a)).players.ai.life; };
    const s0 = mk();
    expect(s0.players.ai.life - blast(s0)).toBe(4);
    const s = castAt(mk(), "Frogify", "thopter");
    expect(s.players.ai.life - blast(s)).toBe(2);
  });
  it("Atog's \"Sacrifice an artifact\" can't take it (it could before)", () => {
    const sacOffers = (s) => LC.legalActionsForPlayer(s, "user").filter((a) => a.kind === "activate-ability" && a.permanentId === "atog" && JSON.stringify(a).includes("\"thopter\"")).length;
    const s0 = board({ user: [["atog", card("Atog")], ["thopter", card("Ornithopter")]], hand: ["Frogify"] });
    expect(sacOffers(s0)).toBeGreaterThan(0);
    expect(sacOffers(castAt(s0, "Frogify", "thopter"))).toBe(0);
  });
  it("sacrificed, it was no artifact and no Food as it last existed (CR 603.10a): Crime Novelist's \"Whenever you sacrifice an artifact\" and Rapacious Guest's \"Whenever you sacrifice a Food\" stay silent; both fire for the printed Gingerbrute (control)", () => {
    const mk = () => board({ user: [["seer", card("Viscera Seer")], ["novelist", card("Crime Novelist")], ["guest", card("Rapacious Guest")], ["brute", card("Gingerbrute")]], hand: ["Frogify"] });
    const sacrificeBrute = (s) => {
      const a = LC.legalActionsForPlayer(s, "user").find((x) => x.kind === "activate-ability" && x.permanentId === "seer" && JSON.stringify(x).includes("\"brute\""));
      expect(a, "Viscera Seer can sacrifice it").toBeTruthy();
      const out = AD.dispatchAction(s, a);
      return [...(out.pendingTriggers || []), ...(out.stack || []).filter((o) => o.kind === "triggered-ability")].map((t) => t.source?.permanentId ?? null);
    };
    expect(sacrificeBrute(mk()).filter((id) => id === "novelist" || id === "guest").sort()).toEqual(["guest", "novelist"]);
    const s = castAt(mk(), "Frogify", "brute");
    expect(chars(s, "brute").subtypes).toEqual(["Frog"]);
    expect(sacrificeBrute(s).filter((id) => id === "novelist" || id === "guest")).toEqual([]);
  });
});

describe("S2 — a land creature: Dryad Arbor (CR 205.1a, 305.6)", () => {
  it("under Frogify it is a 1/1 blue Frog creature and no land: no Forest, no mana (it tapped for {G} before)", () => {
    const s0 = board({ user: [["arbor", card("Dryad Arbor")]], hand: ["Frogify"], lands: false });
    expect([chars(s0, "arbor"), M.manaSources(s0, "user").filter((m) => m.permanentId === "arbor").length]).toEqual([{ pt: [1, 1], types: ["Creature", "Land"], subtypes: ["Dryad", "Forest"], colors: ["G"], keywords: [] }, 1]);
    const s = castAt(s0, "Frogify", "arbor");
    expect([chars(s, "arbor"), M.manaSources(s, "user").filter((m) => m.permanentId === "arbor")]).toEqual([{ pt: [1, 1], types: ["Creature"], subtypes: ["Frog"], colors: ["U"], keywords: [] }, []]);
  });
  it("Stone Rain (\"Destroy target land\") may target it before and not after", () => {
    const s0 = board({ ai: [["arbor", card("Dryad Arbor")]], hand: ["Frogify", "Stone Rain"] });
    expect(castOffers(s0, "Stone Rain", "arbor").length).toBeGreaterThan(0);
    expect(castOffers(castAt(s0, "Frogify", "arbor"), "Stone Rain", "arbor").length).toBe(0);
  });
  it("Quirion Ranger's \"Return a Forest you control\" can't return it (it could before)", () => {
    const offers = (s) => LC.legalActionsForPlayer(s, "user").filter((a) => a.kind === "activate-ability" && a.permanentId === "ranger" && JSON.stringify(a).includes("\"arbor\"")).length;
    const s0 = board({ user: [["ranger", card("Quirion Ranger")], ["arbor", card("Dryad Arbor")], ["bear", card("Grizzly Bears")]], hand: ["Frogify"], lands: false });
    expect(offers(s0)).toBeGreaterThan(0);
    expect(offers(castAt(s0, "Frogify", "arbor"))).toBe(0);
  });
  it("forestwalk (CR 702.14c) no longer sees it as a Forest: Willow Dryad attacking its controller can be blocked", () => {
    const s0 = board({ user: [["dryad", card("Willow Dryad")]], ai: [["arbor", card("Dryad Arbor")], ["bear", card("Grizzly Bears")]], hand: ["Frogify"], lands: false });
    const atk = (s) => ({ ...s, activePlayer: "user", phase: "combat", step: "declare-blockers", combat: { attackers: [{ permanentId: "dryad", attackingPlayer: "user", defender: "ai" }], blockers: [] } });
    expect(CE.canBlockAttacker(atk(s0), "bear", "dryad", "ai")).toBe(false);
    expect(CE.canBlockAttacker(atk(castAt(s0, "Frogify", "arbor")), "bear", "dryad", "ai")).toBe(true);
  });
  it("Submerge's \"If an opponent controls a Forest and you control an Island\" free cast: offered while the opponent's Dryad Arbor is a Forest, not once it is a Frog", () => {
    const free = (s) => castOffers(s, "Submerge", null).filter((a) => a.altCost?.kind === "free").length;
    const s0 = board({ user: [["isl", card("Island")]], ai: [["arbor", card("Dryad Arbor")], ["bear", card("Grizzly Bears")]], hand: ["Frogify", "Submerge"], lands: false });
    expect(free(s0)).toBeGreaterThan(0);
    expect(free(castAt(s0, "Frogify", "arbor"))).toBe(0);
  });
  it("Roiling Regrowth's \"Sacrifice a land.\" can't sacrifice it: with no other land, nothing is sacrificed", () => {
    const s = castAt(board({ user: [["arbor", card("Dryad Arbor")]], hand: ["Frogify", "Roiling Regrowth"], lands: false }), "Frogify", "arbor");
    const a = castOffers(s, "Roiling Regrowth", null)[0];
    expect(a, "Roiling Regrowth is offered").toBeTruthy();
    const out = settle(AD.dispatchAction(s, a));
    expect(permOf(out, "arbor"), "the Frog stays").not.toBe(null);
  });
});

describe("S2 — an animated land under Frogify: the land readers (Fireblast, Gush, Snuff Out — CR 205.1a)", () => {
  /** `ids` (basic lands) animated until end of turn — a 2/2 Elemental land creature (layer 4 adds Creature, 7b sets 2/2), as an animation does. */
  const animate = (s, ids) => ids.reduce((st, id) => [
    { layer: 4, op: { types: ["Creature"], subtypes: ["Elemental"] } }, { layer: 7, sublayer: "7b", op: { layerOp: "ptSet", power: 2, toughness: 2 } },
  ].reduce((x, part) => L.addContinuousEffect(x, { ...part, affects: { mode: "fixed", permanentIds: [id] }, duration: { kind: "endOfTurn", turn: x.turn }, source: { kind: "resolution", permanentId: null, controller: "user" } }).state, st), s);
  const altOffers = (s, name, kind) => castOffers(s, name, null).filter((a) => a.altCost?.kind === kind);
  it("an animated Mountain is still a Mountain (control); under Frogify it is a Frog creature and no land", () => {
    const s0 = animate(board({ user: [["m1", card("Mountain")]], hand: ["Frogify"], lands: false }), ["m1"]);
    expect(chars(s0, "m1")).toEqual({ pt: [2, 2], types: ["Basic", "Creature", "Land"], subtypes: ["Elemental", "Mountain"], colors: [], keywords: [] });
    expect(chars(castAt(s0, "Frogify", "m1"), "m1")).toEqual({ pt: [1, 1], types: ["Basic", "Creature"], subtypes: ["Frog"], colors: ["U"], keywords: [] });
  });
  it("Fireblast's \"sacrifice two Mountains\" alternative cost: offered with two Mountains, not when one is a Frog — and a payment naming the Frog is refused", () => {
    const s0 = animate(board({ user: [["m1", card("Mountain")], ["m2", card("Mountain")]], hand: ["Frogify", "Fireblast"], lands: false }), ["m1"]);
    const offered = altOffers(s0, "Fireblast", "sacrificeLands");
    expect(offered.length).toBeGreaterThan(0);
    const s = castAt(s0, "Frogify", "m1");
    expect(altOffers(s, "Fireblast", "sacrificeLands").length).toBe(0);
    expect(() => AD.dispatchAction(s, offered[0])).toThrow(/not a Mountain/);
  });
  it("Gush's \"return two Islands you control\" alternative cost: offered with two Islands, not when one is a Frog", () => {
    const s0 = animate(board({ user: [["i1", card("Island")], ["i2", card("Island")]], hand: ["Frogify", "Gush"], lands: false }), ["i1"]);
    expect(altOffers(s0, "Gush", "returnLandsToHand").length).toBeGreaterThan(0);
    expect(altOffers(castAt(s0, "Frogify", "i1"), "Gush", "returnLandsToHand").length).toBe(0);
  });
  it("Snuff Out's \"If you control a Swamp, you may pay 4 life\": offered while the only Swamp is a Swamp, not once it is a Frog", () => {
    const s0 = animate(board({ user: [["sw", card("Swamp")]], ai: [["bear", card("Grizzly Bears")]], hand: ["Frogify", "Snuff Out"], lands: false }), ["sw"]);
    expect(altOffers(s0, "Snuff Out", "payLife").length).toBeGreaterThan(0);
    expect(altOffers(castAt(s0, "Frogify", "sw"), "Snuff Out", "payLife").length).toBe(0);
  });
});

describe("S2 — the look-backs and the trigger scopes read what the permanent was (CR 603.10a, 205.1a)", () => {
  const disciple = (s) => [...(s.pendingTriggers || []), ...(s.stack || []).filter((o) => o.kind === "triggered-ability")].filter((t) => t.source?.permanentId === "disc").length;
  it("Disciple of the Vault's \"Whenever an artifact is put into a graveyard from the battlefield\": a Frogified Ornithopter destroyed was no artifact as it left; the printed one triggers it (control)", () => {
    const mk = () => board({ user: [["disc", card("Disciple of the Vault")]], ai: [["thopter", card("Ornithopter")]], hand: ["Frogify"] });
    expect(disciple(destroy(mk(), "thopter"))).toBe(1);
    const s = castAt(mk(), "Frogify", "thopter");
    expect(disciple(destroy(s, "thopter"))).toBe(0);
  });
  it("…in a wipe too, whichever moves first (the group leave event restamped from the board as the event began — CR 603.10): Frogify and its Ornithopter destroyed together, both orders, no trigger", () => {
    const s = castAt(board({ user: [["disc", card("Disciple of the Vault")]], ai: [["thopter", card("Ornithopter")]], hand: ["Frogify"] }), "Frogify", "thopter");
    const aura = attachmentsOf(s, "thopter")[0];
    for (const order of [[aura, "thopter"], ["thopter", aura]]) {
      const out = SE.applyDestroyEffect(s, { controller: "user", targets: order.map((id) => ({ type: "permanent", id })) });
      expect([order[0] === aura ? "aura first" : "host first", permOf(out, "thopter"), disciple(out)]).toEqual([order[0] === aura ? "aura first" : "host first", null, 0]);
    }
    const plain = board({ user: [["disc", card("Disciple of the Vault")]], ai: [["thopter", card("Ornithopter")], ["thopter2", card("Ornithopter")]] });
    expect(disciple(SE.applyDestroyEffect(plain, { controller: "user", targets: [{ type: "permanent", id: "thopter" }, { type: "permanent", id: "thopter2" }] }))).toBe(2); // control
  });
  it("Elderfang Venom's \"Whenever an Elf you control dies\": an Elf Kenrith's Transformation made an Elk dies as an Elk — no drain; an Elf does (control)", () => {
    const venom = (s) => [...(s.pendingTriggers || []), ...(s.stack || []).filter((o) => o.kind === "triggered-ability")].filter((t) => t.source?.permanentId === "venom").length;
    const mk = () => board({ user: [["venom", card("Elderfang Venom")], ["elf", card("Llanowar Elves")]], hand: ["Kenrith's Transformation"] });
    expect(venom(destroy(mk(), "elf", "ai"))).toBe(1);
    const s = castAt(mk(), "Kenrith's Transformation", "elf");
    expect(chars(s, "elf").subtypes).toEqual(["Elk"]);
    expect(venom(destroy(s, "elf", "ai"))).toBe(0);
  });
  it("Elanor Gardner's \"if you sacrificed a Food this turn\": a Frogified Gingerbrute sacrificed was no Food; the printed one is (control)", () => {
    const mk = () => board({ user: [["seer", card("Viscera Seer")], ["brute", card("Gingerbrute")], ["elanor", card("Elanor Gardner")]], hand: ["Frogify"] });
    const sacBrute = (s) => {
      const a = LC.legalActionsForPlayer(s, "user").find((x) => x.kind === "activate-ability" && x.permanentId === "seer" && JSON.stringify(x).includes("\"brute\""));
      expect(a, "Viscera Seer can sacrifice it").toBeTruthy();
      return settle(AD.dispatchAction(s, a));
    };
    const sacrificedFood = (s) => IF.evaluateInterveningIf(s, "you sacrificed a Food this turn", "user");
    expect(sacrificedFood(sacBrute(mk()))).toBe(true);
    expect(sacrificedFood(sacBrute(castAt(mk(), "Frogify", "brute")))).toBe(false);
  });
  it("Neurok Spy's \"can't be blocked as long as defending player controls an artifact\": the defender's only artifact Frogified, the Spy can be blocked (it couldn't before)", () => {
    const s0 = board({ user: [["spy", card("Neurok Spy")]], ai: [["thopter", card("Ornithopter")], ["bear", card("Grizzly Bears")]], hand: ["Frogify"] });
    const blockable = (s) => CE.canBlockAttacker({ ...s, phase: "combat", step: "declare-blockers", combat: { attackers: [{ permanentId: "spy", attackingPlayer: "user", defender: "ai" }], blockers: [] } }, "bear", "spy", "ai");
    expect(blockable(s0)).toBe(false);
    expect(blockable(castAt(s0, "Frogify", "thopter"))).toBe(true);
  });
});

describe("S2 — an enchantment creature, a legendary creature, a changeling", () => {
  it("Kenrith's Transformation on Nyx-Fleece Ram: a 3/3 green Elk creature and no enchantment — Disenchant may target it before and not after", () => {
    const s0 = board({ ai: [["ram", card("Nyx-Fleece Ram")]], hand: ["Kenrith's Transformation", "Disenchant"] });
    expect(castOffers(s0, "Disenchant", "ram").length).toBeGreaterThan(0);
    const s = castAt(s0, "Kenrith's Transformation", "ram");
    expect([chars(s, "ram"), castOffers(s, "Disenchant", "ram").length]).toEqual([{ pt: [3, 3], types: ["Creature"], subtypes: ["Elk"], colors: ["G"], keywords: [] }, 0]);
  });
  it("Frogify on Isamaru, Hound of Konda: a Legendary Creature — Frog with its name (CR 205.4b); a second Isamaru meets the legend rule (CR 704.5j)", () => {
    let s = castAt(board({ ai: [["isa", card("Isamaru, Hound of Konda")]], hand: ["Frogify"] }), "Frogify", "isa");
    expect([chars(s, "isa"), permOf(s, "isa").card.name]).toEqual([{ pt: [1, 1], types: ["Creature", "Legendary"], subtypes: ["Frog"], colors: ["U"], keywords: [] }, "Isamaru, Hound of Konda"]);
    const second = { ...G.createPermanent({ id: "isa2", card: { ...card("Isamaru, Hound of Konda"), id: "card-isa2" }, controller: "ai", summoningSick: true }), timestamp: 200 };
    s = { ...s, players: { ...s.players, ai: { ...s.players.ai, battlefield: [...s.players.ai.battlefield, second] } } };
    const out = SBA.checkAllStateBasedActions(s);
    expect(out.players.ai.battlefield.filter((p) => p.card?.name === "Isamaru, Hound of Konda").length).toBe(1);
  });
  it("Kenrith's Transformation on Changeling Outcast: an Elk and no longer every creature type — Elvish Archdruid's \"Other Elf creatures you control get +1/+1\" stops (CR 205.1a, 702.73a)", () => {
    const s0 = board({ ai: [["out", card("Changeling Outcast")], ["arch", card("Elvish Archdruid")]], hand: ["Kenrith's Transformation"] });
    expect(chars(s0, "out").pt).toEqual([2, 2]);
    const s = castAt(s0, "Kenrith's Transformation", "out");
    expect([chars(s, "out"), L.permIsEveryCreatureType(s, "out")]).toEqual([{ pt: [3, 3], types: ["Creature"], subtypes: ["Elk"], colors: ["G"], keywords: [] }, false]);
  });
});

describe("S2 — a crewed Vehicle, a token, a face-down creature, a commander", () => {
  it("Frogify on a crewed Smuggler's Copter: a 1/1 blue Frog creature with no flying; after the crew effect ends it is still one (the bundled ruling); without Frogify it is no creature (control)", () => {
    const s0 = board({ ai: [["copter", card("Smuggler's Copter")], ["bear", card("Grizzly Bears")]], hand: ["Frogify"] });
    const crew = LC.legalActionsForPlayer(seated(s0, "ai"), "ai").find((a) => a.kind === "crew-vehicle" && a.permanentId === "copter");
    expect(crew, "the Copter can be crewed").toBeTruthy();
    const crewed = { ...settle(AD.dispatchAction(seated(s0, "ai"), crew)), activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main" };
    expect(L.permanentIsCreature(crewed, "copter")).toBe(true);
    const s = castAt(crewed, "Frogify", "copter");
    const frog = { pt: [1, 1], types: ["Creature"], subtypes: ["Frog"], colors: ["U"], keywords: [] };
    expect(chars(s, "copter")).toEqual(frog);
    expect(chars(cleanup(s), "copter")).toEqual(frog);
    expect(L.permanentIsCreature(cleanup(crewed), "copter")).toBe(false);
  });
  it("Frogify on an artifact creature token: a 1/1 blue Frog creature token, no artifact", () => {
    const thopterToken = { ...card("Ornithopter"), name: "Thopter", type: "Token Artifact Creature — Thopter", token: true, power: "1", toughness: "1" };
    const s = castAt(board({ ai: [["tok", thopterToken]], hand: ["Frogify"] }), "Frogify", "tok");
    expect([chars(s, "tok"), permOf(s, "tok").card.token]).toEqual([{ pt: [1, 1], types: ["Creature"], subtypes: ["Frog"], colors: ["U"], keywords: [] }, true]);
  });
  it("Kenrith's Transformation on a face-down creature (a manifested Solemn Simulacrum): a 3/3 green Elk; turned face up it stays one, with no abilities (CR 708.8)", () => {
    const s0 = board({ ai: [["bear", card("Grizzly Bears")]], hand: ["Kenrith's Transformation"] });
    const fd = { ...s0, players: { ...s0.players, ai: { ...s0.players.ai, battlefield: s0.players.ai.battlefield.map((p) => (p.id === "bear" ? { ...p, card: { id: "fd", name: "", power: 2, toughness: 2, type: "Creature", keywords: [], faceDown: true }, faceDown: true, faceUpCard: { ...card("Solemn Simulacrum"), id: "card-solemn" } } : p)) } } };
    expect(chars(fd, "bear")).toEqual({ pt: [2, 2], types: ["Creature"], subtypes: [], colors: [], keywords: [] });
    const s = castAt(fd, "Kenrith's Transformation", "bear");
    const elk = { pt: [3, 3], types: ["Creature"], subtypes: ["Elk"], colors: ["G"], keywords: [] };
    expect(chars(s, "bear")).toEqual(elk);
    const up = LC.legalActionsForPlayer(seated(s, "ai"), "ai").find((a) => a.kind === "turn-face-up" && a.permanentId === "bear");
    expect(up, "the manifested creature card may be turned face up for its mana cost (CR 701.40b)").toBeTruthy();
    const faceUp = settle(AD.dispatchAction(seated(s, "ai"), up));
    expect([permOf(faceUp, "bear").faceDown ?? false, permOf(faceUp, "bear").card.name, chars(faceUp, "bear")]).toEqual([false, "Solemn Simulacrum", elk]);
  });
  it("a commander under Frogify still deals commander damage and still goes to the command zone (CR 903.3, 903.9a, 903.10a)", () => {
    const cmdr = { ...card("Isamaru, Hound of Konda"), isCommander: true };
    let s = castAt(board({ ai: [["cmdr", cmdr]], hand: ["Frogify"] }), "Frogify", "cmdr");
    expect(chars(s, "cmdr").subtypes).toEqual(["Frog"]);
    const hit = CR.resolveCombatDamage({ ...seated(s, "ai"), phase: "combat", step: "combat-damage", combat: { attackers: [{ permanentId: "cmdr", attackingPlayer: "ai", defender: "user" }], blockers: [] } });
    expect(Object.values(hit.players.user.commanderDamageFrom || {})).toEqual([1]);
    s = destroy(s, "cmdr");
    expect(s.players.ai.graveyard.some((c) => c.name === "Isamaru, Hound of Konda" && c.isCommander)).toBe(true);
    const back = returnCommandersToZone(s);
    expect((back.players.ai.command || []).some((c) => c.name === "Isamaru, Hound of Konda")).toBe(true);
  });
});

describe("S2 — a creature an effect later makes a noncreature (S5 territory), and the \"*\" case", () => {
  it("a later effect that sets the Frog's card types to Artifact: it is no creature, so Frogify (\"Enchant creature\") is put into the graveyard (CR 704.5m) and its loss ends with it", () => {
    let s = castAt(board({ ai: [["bear", card("Grizzly Bears")]], hand: ["Frogify"] }), "Frogify", "bear");
    const auraId = attachmentsOf(s, "bear")[0];
    s = L.addContinuousEffect(s, { layer: 4, op: { layerOp: "setCardTypes", types: ["Artifact"] }, affects: { mode: "fixed", permanentIds: ["bear"] }, duration: { kind: "endOfTurn", turn: s.turn }, source: { kind: "resolution", permanentId: null, controller: "user" } }).state;
    expect(L.permanentIsCreature(s, "bear")).toBe(false);
    const out = SBA.checkAllStateBasedActions(s);
    expect([permOf(out, auraId), out.players.user.graveyard.some((c) => c.name === "Frogify"), L.abilityLossOf(out, "bear"), L.permanentTypes(out, "bear").types]).toEqual([null, true, null, ["Artifact"]]);
  });
  it("Tarmogoyf under Frogify is a sized 1/1 that 1 damage destroys; Crusader of Odric under Reprobation a 0/1 (CR 613.4b — the base set sizes a \"*\")", () => {
    const s0 = board({ ai: [["goyf", card("Tarmogoyf")]], hand: ["Frogify"] });
    const gy = { ...s0, players: { ...s0.players, ai: { ...s0.players.ai, graveyard: [{ ...card("Lightning Bolt"), id: "gy-0" }, { ...card("Grizzly Bears"), id: "gy-1" }] } } };
    expect(chars(gy, "goyf").pt).toEqual([2, 3]);
    const s = castAt(gy, "Frogify", "goyf");
    expect([chars(s, "goyf").pt, L.permanentToughnessSized(s, "goyf")]).toEqual([[1, 1], true]);
    expect(permOf(SBA.checkAllStateBasedActions(G.updatePermanentSafe(s, "goyf", (p) => ({ ...p, damageMarked: 1 }))), "goyf")).toBe(null);
    const c = castAt(board({ ai: [["crus", card("Crusader of Odric")]], hand: ["Reprobation"] }), "Reprobation", "crus");
    expect([chars(c, "crus").pt, chars(c, "crus").subtypes, L.permanentToughnessSized(c, "crus")]).toEqual([[0, 1], ["Coward"], true]);
  });
});

describe("S2 — the parts in their layers", () => {
  it("a +1/+1 counter still counts on top of Frogify's base 1/1 (CR 613.4b, 613.4c): a 2/2 Frog", () => {
    let s = board({ ai: [["angel", card("Serra Angel")]], hand: ["Frogify"] });
    s = G.addCounter(s, { permanentId: "angel", type: "+1/+1", amount: 1 });
    expect(chars(castAt(s, "Frogify", "angel"), "angel").pt).toEqual([2, 2]);
  });
  it("Kenrith's Transformation over Lignify: the later Elk 3/3 green wins (CR 613.7e); Kenrith's destroyed, Lignify's 0/4 Treefolk is back", () => {
    let s = castAt(board({ ai: [["angel", card("Serra Angel")]], hand: ["Lignify", "Kenrith's Transformation"] }), "Lignify", "angel");
    s = castAt(s, "Kenrith's Transformation", "angel");
    expect(chars(s, "angel")).toEqual({ pt: [3, 3], types: ["Creature"], subtypes: ["Elk"], colors: ["G"], keywords: [] });
    const ken = attachmentsOf(s, "angel").find((id) => permOf(s, id)?.card?.name === "Kenrith's Transformation");
    expect(chars(destroy(s, ken), "angel")).toEqual({ pt: [0, 4], types: ["Creature"], subtypes: ["Treefolk"], colors: ["W"], keywords: [] });
  });
  it("Lignify over Frogify: the later Treefolk replaces the Frog, Frogify's card types and colour stay (CR 613.7)", () => {
    let s = castAt(board({ ai: [["thopter", card("Ornithopter")]], hand: ["Frogify", "Lignify"] }), "Frogify", "thopter");
    s = castAt(s, "Lignify", "thopter");
    expect(chars(s, "thopter")).toEqual({ pt: [0, 4], types: ["Creature"], subtypes: ["Treefolk"], colors: ["U"], keywords: [] });
  });
  it("an Equipment attached after Frogify gives flying (CR 613.7e); Frogify destroyed, the Ornithopter is an Artifact Creature — Thopter again", () => {
    let s = castAt(board({ user: [["thopter", card("Ornithopter")], ["wings", card("Cobbled Wings")]], hand: ["Frogify"] }), "Frogify", "thopter");
    s = G.attachPermanent(s, { equipId: "wings", targetId: "thopter" });
    expect(chars(s, "thopter").keywords).toEqual(["flying"]);
    const frog = attachmentsOf(s, "thopter").find((id) => permOf(s, id)?.card?.name === "Frogify");
    expect(chars(destroy(s, frog), "thopter")).toEqual({ pt: [0, 2], types: ["Artifact", "Creature"], subtypes: ["Thopter"], colors: [], keywords: ["flying"] });
  });
  it("Allosaurus Shepherd's \"each Elf creature you control has base power and toughness 5/5\" skips an Elf Kenrith's Transformation made an Elk; it reaches an Elf (control)", () => {
    let s = board({ user: [["shep", card("Allosaurus Shepherd")], ["elf", card("Llanowar Elves")], ["mystic", card("Elvish Mystic")]], hand: ["Kenrith's Transformation"] });
    s = castAt(s, "Kenrith's Transformation", "elf");
    const act = LC.legalActionsForPlayer(s, "user").find((a) => a.kind === "activate-ability" && a.permanentId === "shep");
    expect(act, "the Shepherd's ability is offered").toBeTruthy();
    const out = settle(AD.dispatchAction(s, act));
    expect([chars(out, "elf").pt, chars(out, "mystic").pt]).toEqual([[3, 3], [5, 5]]);
  });
});

// ─── 5. vanilla to every reader: the census and the S2 type twin ────────────────────────────────────────────────────────────────
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
// the caster's spells that read the probe's card types and colours as targets (in the caster's hand beside the S2 card)
const TARGETERS = ["Terror", "Shatter", "Disenchant", "Stone Rain", "Molten Frame", "Doom Blade", "Lightning Bolt"];
/** The whole readout the twin comparison compares (combat legality both ways, combat damage, its controller's legal actions, the caster's targeting). */
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
    hit: [unblocked.players[opp].life - main.players[opp].life, unblocked.players[seat].life - main.players[seat].life, poisonOf(unblocked, opp) - poisonOf(main, opp)],
    block: [(permOf(blocking, ID)?.damageMarked ?? 0) - (permOf(main, ID)?.damageMarked ?? 0), (permOf(blocking, "panel-0")?.damageMarked ?? 0) - (permOf(main, "panel-0")?.damageMarked ?? 0)],
    mainActions: JSON.stringify(LC.legalActionsForPlayer(main, seat).filter((a) => a.permanentId === ID || a.kind === "declare-attacker")),
    attackActions: JSON.stringify(LC.legalActionsForPlayer(attack, seat).filter((a) => a.permanentId === ID)),
    targetedBy: TARGETERS.filter((n) => castOffers(seated(s, opp), n, ID, opp).length > 0),
  };
}
/** The S2 TYPE twin: the creature the S2 card makes `c`, PRINTED — its supertypes, "Creature — <type>", its colours and base P/T, no text. */
function s2TwinOf(c, s2) {
  const r = underS2(c, s2);
  const sup = r.types.filter((t) => t !== "Creature");
  const { card_faces: _f, ...rest } = c;
  const type = `${[...sup, "Creature"].join(" ")} — ${r.subtypes[0]}`;
  return { ...rest, name: NEUTRAL, type, colors: r.colors, power: String(r.pt[0]), toughness: String(r.pt[1]), oracle: "", keywords: [], layout: "normal" };
}
// The census carriers: S1's 26 real creatures (keywords, mana, activated, dies / leave / cast / lifegain / attack triggers, protection,
// ward, a lord's static, combat restrictions) and five whose card types or creature types S2 changes.
const CARRIERS = ["Serra Angel", "Vampire Nighthawk", "Llanowar Elves", "Birds of Paradise", "Prodigal Sorcerer", "Mother of Runes", "Doomed Traveler",
  "Blood Artist", "Thragtusk", "Monastery Swiftspear", "Ajani's Pridemate", "Silver Knight", "Hulking Raptor", "Charging Rhino", "Phantom Warrior",
  "Cloud Elemental", "Juggernaut", "Elvish Archdruid", "Lord of Atlantis", "Fog Bank", "Venerated Rotpriest", "Hellrider",
  "Ulamog's Crusher", "Palace Guard", "Darksteel Myr", "Dauthi Slayer",
  "Ornithopter", "Dryad Arbor", "Solemn Simulacrum", "Nyx-Fleece Ram", "Changeling Outcast", "Isamaru, Hound of Konda", "Gingerbrute"];
const STAR_CARRIERS = ["Tarmogoyf", "Crusader of Odric"];
/** The probe (the OPPONENT's creature) under `s2`, the S2 card cast by the user at it with the targeters in hand. */
function s2Board(probe) {
  const panel = PANEL.map((n, i) => [`panel-${i}`, card(n)]);
  return (s2) => board({ user: panel, ai: [[ID, probe]], hand: [s2, ...TARGETERS] });
}
const applyS2 = (s, s2) => castAt(s, s2, ID);

describe("S2 — the creature reads vanilla to every reader, and exactly as the creature it became (the census and the S2 type twin)", () => {
  const census = [];
  for (const name of S2_AURAS) {
    it(`${name}: every reader reads nothing off the creature it affects, and the creature reads as its PRINTED S2 twin under the same card`, () => {
      const carriedBy = new Map(READERS.map(([label]) => [label, []]));
      const leaks = [];
      for (const n of CARRIERS) {
        const c = { ...card(n), name: NEUTRAL };
        const printed = s2Board(c)(name);
        const lost = applyS2(printed, name);
        expect([n, L.abilityLossOf(lost, ID) != null, chars(lost, ID)], `${name} on ${n}`).toEqual([n, true, underS2(card(n), name)]);
        for (const [label, read] of READERS) {
          if (!(read(printed) > 0)) continue;
          carriedBy.get(label).push(n);
          const got = read(lost);
          if (got !== 0) leaks.push(`${n} — ${label}: ${got}`);
        }
        const twin = applyS2(s2Board(s2TwinOf(card(n), name))(name), name);
        const a = twinReadout(lost);
        const b = twinReadout(twin);
        for (const k of Object.keys(a)) if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) leaks.push(`${n} — twin ${k}: ${JSON.stringify(a[k]).slice(0, 160)} ≠ ${JSON.stringify(b[k]).slice(0, 160)}`);
      }
      // THE "*" CARRIERS: absolute P/T, sized — the base P/T set sizes a "*" (CR 613.4b); a no-text twin of a "*" card would be unread too.
      for (const n of STAR_CARRIERS) {
        const lost = applyS2(s2Board(card(n))(name), name);
        expect([n, chars(lost, ID), L.permanentToughnessSized(lost, ID)], `${name} on ${n}`).toEqual([n, underS2(card(n), name), true]);
      }
      census.push([name, ...[...carriedBy].map(([label, cs]) => `${label.split(":")[0]} ${cs.length}`)]);
      expect([...carriedBy].filter(([, cs]) => cs.length === 0).map(([label]) => label), "every reader has a carrier").toEqual([]);
      expect(leaks).toEqual([]);
    });
  }
  it("the census table (reported; every row above asserted)", () => {
    console.log(["S2 CENSUS — card | carriers per reader", ...census.map((r) => r.join(" | "))].join("\n"));
    expect(census.length).toBe(S2_AURAS.length);
  });
});

describe("S2 — the S1 recheck's R1: two characteristic-defining wordings the \"*\" read missed (CR 208.2a, 604.3, 613.1f, 704.5f)", () => {
  const under = (creature) => castAt(board({ ai: [["x", card(creature)]], hand: ["Mystic Subdual"] }), "Mystic Subdual", "x");
  it("Drop Bear (\"has power and toughness each equal to …\") under Mystic Subdual is a -2/0 and is put into its owner's graveyard", () => {
    const s = under("Drop Bear");
    expect([permOf(s, "x"), s.players.ai.graveyard.some((c) => c.name === "Drop Bear")]).toEqual([null, true]);
  });
  it("Lydari Elephant (\"… and its toughness equal to the second number chosen\") under Mystic Subdual is a -2/0 and is put into its owner's graveyard", () => {
    const s = under("Lydari Elephant");
    expect([permOf(s, "x"), s.players.ai.graveyard.some((c) => c.name === "Lydari Elephant")]).toEqual([null, true]);
  });
  it("Drop Bear's POWER is read too (its \"*\" is 0 and known — CR 208.2a): with a +1/+1 counter under Mystic Subdual it is a -1/1 and lives; Twisted Image switches it to a 1/-1 (CR 613.4d — the known power becomes the toughness) and it dies (CR 704.5f)", () => {
    let s = board({ ai: [["x", card("Drop Bear")]], hand: ["Mystic Subdual", "Twisted Image"] });
    s = G.addCounter(s, { permanentId: "x", type: "+1/+1", amount: 1 });
    s = castAt(s, "Mystic Subdual", "x");
    expect([chars(s, "x").pt, L.permanentToughnessSized(s, "x")]).toEqual([[-1, 1], true]);
    const out = castAt(s, "Twisted Image", "x");
    expect([permOf(out, "x"), out.players.ai.graveyard.some((c) => c.name === "Drop Bear")]).toEqual([null, true]);
  });
  it("with no loss both stay unread (control): never destroyed by the stand-in 0", () => {
    for (const n of ["Drop Bear", "Lydari Elephant"]) {
      const s = board({ ai: [["x", card(n)]] });
      expect([n, permOf(SBA.checkAllStateBasedActions(s), "x") != null, L.permanentToughnessSized(s, "x")]).toEqual([n, true, false]);
    }
  });
});

// ─── the blind review of fe77b89f (review-abloss-s2.md): F1–F5, and F6 — an UNAFFECTED permanent on an S2 board still reads its types ──
describe("S2 review F1 — the target and copy pools read the types a permanent has now (CR 205.1a)", () => {
  it("(a) Broken Wings, Return to the Earth and Shoot Down (\"target artifact, enchantment, or creature with flying\"): a Frogified Ornithopter and a Frogified Nyx-Fleece Ram are no target; an unaffected Ornithopter and the Frogify Auras still are", () => {
    let s = board({ ai: [["thopter", card("Ornithopter")], ["ram", card("Nyx-Fleece Ram")], ["thopter2", card("Ornithopter")]], hand: ["Frogify", "Frogify", "Broken Wings", "Return to the Earth", "Shoot Down"] });
    const targets = (st, n) => [...new Set(castOffers(st, n, null).flatMap((a) => (a.targets || []).map((t) => t.id)))].sort();
    for (const n of ["Broken Wings", "Return to the Earth", "Shoot Down"]) expect([n, targets(s, n)]).toEqual([n, ["ram", "thopter", "thopter2"]]); // control
    s = castAt(castAt(s, "Frogify", "thopter"), "Frogify", "ram");
    const auras = [...attachmentsOf(s, "thopter"), ...attachmentsOf(s, "ram")].sort();
    for (const n of ["Broken Wings", "Return to the Earth", "Shoot Down"]) expect([n, targets(s, n)]).toEqual([n, [...auras, "thopter2"].sort()]);
  });
  const cloneCandidates = (s, name) => {
    const out = settle(AD.dispatchAction(s, castOffers(s, name, null)[0]));
    if (out.pendingChoice?.kind !== "clone-search") return []; // nothing copiable: no choice opens (the card enters as itself)
    return (out.pendingChoice.candidates || []).map((c) => c.id ?? c.permId ?? c).sort();
  };
  it("(b) Copy Enchantment and Mirrormade may copy Frogify but not the Frogified Nyx-Fleece Ram (no enchantment now); the Ram is copiable before Frogify (control)", () => {
    const s0 = board({ ai: [["ram", card("Nyx-Fleece Ram")]], hand: ["Frogify", "Copy Enchantment", "Mirrormade"] });
    expect(cloneCandidates(s0, "Copy Enchantment")).toEqual(["ram"]);
    const s = castAt(s0, "Frogify", "ram");
    const frogify = attachmentsOf(s, "ram")[0];
    expect([cloneCandidates(s, "Copy Enchantment"), cloneCandidates(s, "Mirrormade")]).toEqual([[frogify], [frogify]]);
  });
  it("(b) Clever Impersonator (\"any nonland permanent\") may copy a Frogified Dryad Arbor — it is no land now; before Frogify it may not (control)", () => {
    const s0 = board({ ai: [["arbor", card("Dryad Arbor")]], hand: ["Frogify", "Clever Impersonator"], lands: false });
    expect(cloneCandidates(s0, "Clever Impersonator")).toEqual([]);
    const s = castAt(s0, "Frogify", "arbor");
    expect(cloneCandidates(s, "Clever Impersonator")).toEqual([attachmentsOf(s, "arbor")[0], "arbor"].sort());
  });
});

describe("S2 review F2 — the board counts read the types a permanent has now", () => {
  it("(a) domain (CR 305.6, 205.1a): with Dryad Arbor and a Mountain, Leyline Binding costs {3}{W}; with the Arbor Frogified, only the Mountain counts — {4}{W}", () => {
    const cost = (s) => castOffers(s, "Leyline Binding", null)[0]?.cost?.generic;
    const s0 = board({ user: [["arbor", card("Dryad Arbor")], ["m", card("Mountain")]], hand: ["Frogify", "Leyline Binding"], lands: false });
    expect(cost(s0)).toBe(3);
    expect(cost(castAt(s0, "Frogify", "arbor"))).toBe(4);
  });
  it("(b) Sphere of Safety's tax (\"X for each of those creatures, where X is the number of enchantments you control\") is 2 with Nyx-Fleece Ram, 1 once the Ram is a Frog (CR 508.1h — a higher tax overcharges an attack the card allows)", () => {
    const s0 = board({ ai: [["sphere", card("Sphere of Safety")], ["ram", card("Nyx-Fleece Ram")]], hand: ["Frogify"] });
    expect(ATX.attackTaxDetail(s0, "ai")).toMatchObject({ generic: 2 });
    expect(ATX.attackTaxDetail(castAt(s0, "Frogify", "ram"), "ai")).toMatchObject({ generic: 1 });
  });
});

describe("S2 review F3 — a bestowed Aura on a host it may no longer enchant becomes unattached (CR 702.16c, 702.103f)", () => {
  /** The AI's Mother of Runes gives its Serra Angel protection through the real lane (its automatic colour: the user's green Aura). */
  const mother = (s) => {
    const a = LC.legalActionsForPlayer(seated(s, "ai"), "ai").find((x) => x.kind === "activate-ability" && x.permanentId === "mom" && (x.targets || []).some((t) => t.id === "angel"));
    expect(a, "Mother of Runes can target the Angel").toBeTruthy();
    return SBA.checkAllStateBasedActions({ ...settle(AD.dispatchAction(seated(s, "ai"), a)), activePlayer: "user", priorityHolder: "user" });
  };
  for (const [name, freed] of [["Trickster's Elk", { pt: [3, 3], types: ["Creature", "Enchantment"], subtypes: ["Elk"], colors: ["G"], keywords: [] }],
    ["Boon Satyr", { pt: [4, 2], types: ["Creature", "Enchantment"], subtypes: ["Satyr"], colors: ["G"], keywords: [] }]]) {
    it(`${name} bestowed on the Angel, then protection from green: it is an unattached ${freed.pt.join("/")} enchantment creature and the Angel a 4/4 with flying and vigilance again`, () => {
      const s0 = board({ ai: [["angel", card("Serra Angel")], ["mom", card("Mother of Runes")]], hand: [name] });
      const offers = castOffers(s0, name, "angel").filter((a) => a.bestow);
      expect(offers.length, `${name}'s bestow cast at the Angel is offered`).toBeGreaterThan(0);
      const s = settle(AD.dispatchAction(s0, offers[0]));
      const id = attachmentsOf(s, "angel")[0];
      expect(permOf(s, id)?.bestowed).toBe(true);
      const out = mother(s);
      expect(L.permanentProtectionColors(out, "angel").has("G")).toBe(true);
      expect([permOf(out, id)?.attachedTo ?? null, !!permOf(out, id)?.bestowed, attachmentsOf(out, "angel"), chars(out, id)]).toEqual([null, false, [], freed]);
      expect(chars(out, "angel")).toEqual({ pt: [4, 4], types: ["Creature"], subtypes: ["Angel"], colors: ["W"], keywords: ["flying", "vigilance"] });
    });
  }
  it("a plain green Aura (Kenrith's Transformation) under the same protection is put into its owner's graveyard (CR 704.5m — control)", () => {
    const s = castAt(board({ ai: [["angel", card("Serra Angel")], ["mom", card("Mother of Runes")]], hand: ["Kenrith's Transformation"] }), "Kenrith's Transformation", "angel");
    const out = mother(s);
    expect([attachmentsOf(out, "angel"), out.players.user.graveyard.some((c) => c.name === "Kenrith's Transformation"), chars(out, "angel").pt]).toEqual([[], true, [4, 4]]);
  });
});

describe("S2 review F4 — party reads the creature types a creature has now (CR 700.8, 205.1a)", () => {
  // Ravager's Mace: "Equipped creature gets +1/+0 for each creature in your party" — on Elvish Warrior (2/3)
  const party = () => {
    let s = board({ user: [["cleric", card("Mother of Runes")], ["rogue", card("Vedalken Heretic")], ["warrior", card("Elvish Warrior")], ["wizard", card("Prodigal Sorcerer")], ["mace", card("Ravager's Mace")]], hand: ["Kenrith's Transformation", "Lignify"] });
    return G.attachPermanent(s, { equipId: "mace", targetId: "warrior" });
  };
  it("a Cleric, a Rogue, a Warrior and a Wizard: party 4 (the Mace's Warrior is a 6/3)", () => {
    expect(chars(party(), "warrior").pt).toEqual([6, 3]);
  });
  for (const aura of ["Kenrith's Transformation", "Lignify"]) {
    it(`${aura} on the Wizard: it is no Wizard, party 3 (a 5/3)`, () => {
      const s = castAt(party(), aura, "wizard");
      expect([chars(s, "wizard").subtypes, chars(s, "warrior").pt]).toEqual([[aura === "Lignify" ? "Treefolk" : "Elk"], [5, 3]]);
    });
  }
});

describe("S2 review F5 — the AI casts a bestow card as a creature when it holds the Aura cast", () => {
  const aiPick = (hand, own = []) => {
    const s0 = G.createGameState({ userDeck: [], aiDeck: [] });
    let ts = 1;
    const perm = (id, c, controller) => ({ ...G.createPermanent({ id, card: { ...c, id: `card-${id}` }, controller, summoningSick: false }), timestamp: ts++, enteredOnTurn: 1 });
    const s = { ...s0, turn: 4, phase: "precombat-main", step: "main", activePlayer: "ai", priorityHolder: "ai", timestampCounter: 100,
      players: { ...s0.players, user: { ...s0.players.user, battlefield: [perm("angel", card("Serra Angel"), "user"), perm("bear", card("Grizzly Bears"), "user")] },
        ai: { ...s0.players.ai, battlefield: own.map(([id, n]) => perm(id, card(n), "ai")), hand: [{ ...card(hand), id: "h-0" }], manaPool: { ...s0.players.ai.manaPool, ...POOL } } } };
    const pick = AI.pickAction(s, "ai", LC.legalActionsForPlayer(s, "ai"), { archetype: "midrange" });
    return pick?.kind === "cast-spell" ? `${pick.name}${pick.bestow ? " bestowed" : ""}${pick.targets?.length ? ` at ${pick.targets[0].id}` : ""}` : pick?.kind;
  };
  it("Trickster's Elk with an enemy board: cast as a 3/3 creature (as on c0550fa2, before S2 offered its bestow casts)", () => {
    expect([aiPick("Trickster's Elk"), aiPick("Trickster's Elk", [["wurm", "Craw Wurm"]])]).toEqual(["Trickster's Elk", "Trickster's Elk"]);
  });
  it("Boon Satyr with no creature of the AI's own: cast as a creature (the Aura half has no on-side host; the bestow hold c0550fa2 already had, cleared)", () => {
    expect(aiPick("Boon Satyr")).toBe("Boon Satyr");
  });
});

describe("S2 review F6 — on an S2 board an UNAFFECTED permanent still reads every type it has (the over-suppression direction)", () => {
  // Frogify on the AI's Grizzly Bears makes every board below an S2 board (layers.boardSetsTypes); nothing else is affected.
  const s2Bystander = ({ user = [], ai = [], hand = [], lands = true } = {}) => castAt(board({ user, ai: [["bystander", card("Grizzly Bears")], ...ai], hand: ["Frogify", ...hand], lands }), "Frogify", "bystander");
  it("the bystander board sets types (control)", () => {
    const sets = (s) => (typeof L.boardSetsTypes === "function" ? L.boardSetsTypes(s) : null); // an S2 reader: absent on the base commit
    expect([sets(board({})), sets(s2Bystander())]).toEqual([false, true]);
  });
  it("Terror refuses an unaffected Ornithopter; Shatter and Molten Frame take it; Disenchant and Terror take Nyx-Fleece Ram; Stone Rain takes Dryad Arbor", () => {
    const s = s2Bystander({ ai: [["thopter", card("Ornithopter")], ["ram", card("Nyx-Fleece Ram")], ["arbor", card("Dryad Arbor")]], hand: ["Terror", "Shatter", "Molten Frame", "Disenchant", "Stone Rain"] });
    const at = (n, id) => castOffers(s, n, id).length > 0;
    expect([at("Terror", "thopter"), at("Shatter", "thopter"), at("Molten Frame", "thopter"), at("Disenchant", "ram"), at("Terror", "ram"), at("Stone Rain", "arbor")]).toEqual([false, true, true, true, true, true]);
  });
  it("Atog may sacrifice an unaffected Ornithopter, Quirion Ranger may return an unaffected Dryad Arbor, metalcraft counts three unaffected artifacts (Galvanic Blast: 4)", () => {
    const s = s2Bystander({ user: [["atog", card("Atog")], ["ranger", card("Quirion Ranger")], ["thopter", card("Ornithopter")], ["arbor", card("Dryad Arbor")], ["wings", card("Cobbled Wings")], ["copter", card("Smuggler's Copter")]], hand: ["Galvanic Blast"] });
    const acts = LC.legalActionsForPlayer(s, "user");
    const offers = (src, id) => acts.filter((a) => a.kind === "activate-ability" && a.permanentId === src && JSON.stringify(a).includes(`"${id}"`)).length > 0;
    expect([offers("atog", "thopter"), offers("ranger", "arbor")]).toEqual([true, true]);
    const blast = castOffers(s, "Galvanic Blast", "ai")[0];
    expect(s.players.ai.life - settle(AD.dispatchAction(s, blast)).players.ai.life).toBe(4);
  });
  it("Disciple of the Vault fires for an unaffected Ornithopter destroyed; Elderfang Venom for an unaffected Elf; Captain Lannery Storm for a Treasure sacrificed", () => {
    const fired = (st, src) => [...(st.pendingTriggers || []), ...(st.stack || []).filter((o) => o.kind === "triggered-ability")].filter((t) => t.source?.permanentId === src).length;
    const d = s2Bystander({ user: [["disc", card("Disciple of the Vault")]], ai: [["thopter", card("Ornithopter")]] });
    expect(fired(destroy(d, "thopter"), "disc")).toBe(1);
    const v = s2Bystander({ user: [["venom", card("Elderfang Venom")], ["elf", card("Llanowar Elves")]] });
    expect(fired(destroy(v, "elf", "ai"), "venom")).toBe(1);
    // Lannery Storm attacks (its Treasure is minted by the engine), then the Treasure is sacrificed for mana
    let l = s2Bystander({ user: [["lannery", card("Captain Lannery Storm")]] });
    l = settle(GE.flushTriggers(T.checkAttackTriggers({ ...l, phase: "combat", step: "declare-attackers", combat: { attackers: [{ permanentId: "lannery", attackingPlayer: "user", defender: "ai" }], blockers: [] } }), { chooseTargets: GE.chooseTriggerTargets }));
    const treasure = l.players.user.battlefield.find((p) => p.card?.token && /Treasure/.test(String(p.card.type || "")));
    expect(treasure, "Lannery Storm made a Treasure").toBeTruthy();
    const crack = LC.legalActionsForPlayer({ ...l, phase: "precombat-main", step: "main", combat: null }, "user").find((a) => a.kind === "tap-for-mana" && a.permanentId === treasure.id);
    expect(crack, "the Treasure can be sacrificed for mana").toBeTruthy();
    expect(fired(AD.dispatchAction({ ...l, phase: "precombat-main", step: "main", combat: null }, crack), "lannery")).toBe(1);
  });
  it("forestwalk still sees an unaffected Forest and Neurok Spy an unaffected artifact: neither can be blocked", () => {
    const s = s2Bystander({ user: [["dryad", card("Willow Dryad")], ["spy", card("Neurok Spy")]], ai: [["thopter", card("Ornithopter")], ["bear", card("Grizzly Bears")]] });
    const blockable = (id) => CE.canBlockAttacker({ ...s, phase: "combat", step: "declare-blockers", combat: { attackers: [{ permanentId: id, attackingPlayer: "user", defender: "ai" }], blockers: [] } }, "bear", id, "ai");
    expect([blockable("dryad"), blockable("spy")]).toEqual([false, false]);
  });
});

describe("S2 survey — the printed type reads the review's re-survey found (CR 205.1a)", () => {
  it("Banner of Kinship (\"a fellowship counter on it for each creature you control of the chosen type\"): three Llanowar Elves give 3; with one Frogified, 2", () => {
    const elves = [["e1", card("Llanowar Elves")], ["e2", card("Llanowar Elves")], ["e3", card("Llanowar Elves")]];
    const banner = (s) => { const out = settle(AD.dispatchAction(s, castOffers(s, "Banner of Kinship", null)[0])); const b = out.players.user.battlefield.find((p) => p.card.name === "Banner of Kinship"); return [["Elf", "Druid"].includes(b.chosenType), b.counters?.fellowship ?? 0]; };
    const s0 = board({ user: elves, hand: ["Frogify", "Banner of Kinship"] });
    expect(banner(s0)).toEqual([true, 3]); // control
    expect(banner(castAt(s0, "Frogify", "e1"))).toEqual([true, 2]);
  });
  it("The Ur-Dragon (\"Whenever one or more Dragons you control attack, draw that many cards\"): a Frogified Shivan Dragon attacking is no Dragon — no draw; unaffected it draws 1", () => {
    const s0 = board({ user: [["ud", card("The Ur-Dragon")], ["sd", card("Shivan Dragon")]], hand: ["Frogify"] });
    const attack = (s) => UD.applyUrDragonAttackTriggers({ ...s, phase: "combat", step: "declare-attackers", combat: { attackers: [{ permanentId: "sd", attackingPlayer: "user", defender: "ai" }], blockers: [] } }).players.user.library.length;
    expect(attack(s0)).toBe(2); // control
    expect(attack(castAt(s0, "Frogify", "sd"))).toBe(3);
  });
  it("Excalibur, Sword of Eden (\"X is the total mana value of historic permanents you control\"): Solemn Simulacrum + Isamaru make it {7}; with the Simulacrum Frogified only the legendary Isamaru counts — {11} (Legendary stays, CR 205.4b)", () => {
    const cost = (s) => castOffers(s, "Excalibur, Sword of Eden", null)[0]?.cost?.generic;
    const s0 = board({ user: [["sol", card("Solemn Simulacrum")], ["isa", card("Isamaru, Hound of Konda")]], hand: ["Frogify", "Excalibur, Sword of Eden"] });
    expect(cost(s0)).toBe(7); // control
    expect(cost(castAt(s0, "Frogify", "sol"))).toBe(11);
  });
  it("Vihaan, Goldwaker animates a Treasure; Eaten by Piranhas makes it a 1/1 black Skeleton, no Treasure: the next animation leaves it a 1/1, and \"Sacrifice a Treasure\" may not take it (CR 111.10)", () => {
    const treasure = { ...NAMED_TOKENS.treasure, token: true, mana: "", cmc: 0, colors: [], keywords: [] };
    const s0 = board({ user: [["vi", card("Vihaan, Goldwaker")], ["tr", treasure]], hand: ["Eaten by Piranhas"] });
    const s1 = VH.applyVihaanCombatAnimate(s0);
    expect([L.permanentIsCreature(s1, "tr"), sacrificePoolMatchNow("token:treasure", s1, permOf(s1, "tr"))]).toEqual([true, true]); // control
    const s2 = castAt(s1, "Eaten by Piranhas", "tr");
    expect(chars(s2, "tr").pt).toEqual([1, 1]);
    expect(sacrificePoolMatchNow("token:treasure", s2, permOf(s2, "tr"))).toBe(false);
    expect(chars(VH.applyVihaanCombatAnimate(s2), "tr").pt).toEqual([1, 1]);
  });
  // Wild Growth held on fe77b89f already (its "Enchant land" re-check, auraEntry.mayBeEnchantedBy); Utopia Sprawl's Forest did not
  for (const aura of ["Wild Growth", "Utopia Sprawl"]) {
    it(`${aura} cast at Dryad Arbor, Eaten by Piranhas in response: the Arbor is no land and no Forest as ${aura} resolves, so it is not put onto the battlefield (CR 608.2b); with no response it enchants the Arbor`, () => {
      const s0 = board({ user: [["arbor", card("Dryad Arbor")]], hand: [aura, "Eaten by Piranhas"] }); // a land mana Aura is offered on the caster's own lands
      const onStack = AD.dispatchAction(s0, castOffers(s0, aura, "arbor")[0]);
      const names = (s) => attachmentsOf(s, "arbor").map((id) => permOf(s, id)?.card?.name).sort();
      expect(names(settle(onStack))).toEqual([aura]); // control
      const responded = AD.dispatchAction(onStack, castOffers(onStack, "Eaten by Piranhas", "arbor")[0]);
      const out = settle(responded);
      expect([names(out), out.players.user.graveyard.map((c) => c.name).includes(aura)]).toEqual([["Eaten by Piranhas"], true]);
    });
  }
  it("the board snapshot shows a Frogified Dryad Arbor as it is: \"Creature — Frog\", in the permanents row, not the lands row", () => {
    const s0 = board({ ai: [["arbor", card("Dryad Arbor")]], hand: ["Frogify"] });
    const row = (s) => { const v = BS.boardSnapshot(s).players.find((p) => p.id === "ai"); const at = (r) => r.find((x) => x.id === "arbor"); return at(v.lands) ? ["lands", at(v.lands).type] : ["permanents", at(v.permanents)?.type]; };
    expect(row(s0)).toEqual(["lands", "Land Creature — Forest Dryad"]); // control
    expect(row(castAt(s0, "Frogify", "arbor"))).toEqual(["permanents", "Creature — Frog"]);
  });
  it("a planeswalker an S2 effect made a Frog creature is no planeswalker: with 0 loyalty counters it stays on the battlefield (CR 704.5i applies to a planeswalker; the S2 parts injected, as the twin tool stores them — no engine effect animates a planeswalker today)", () => {
    const S2_PARTS = [
      { layer: 4, op: { layerOp: "setCardTypes", types: ["Creature"] } }, { layer: 4, op: { layerOp: "replaceCreatureTypes", subtypes: ["Frog"] } },
      { layer: 5, op: { layerOp: "setColor", colors: ["U"] } }, { layer: 6, op: { layerOp: "loseAllAbilities" } },
      { layer: 7, sublayer: "7b", op: { layerOp: "ptSet", power: 1, toughness: 1 } },
    ];
    const s0 = board({ user: [["gid", card("Gideon Jura")]] });
    const zero = { ...s0, players: { ...s0.players, user: { ...s0.players.user, battlefield: s0.players.user.battlefield.map((p) => (p.id === "gid" ? { ...p, counters: { loyalty: 0 } } : p)) } } };
    const frog = S2_PARTS.reduce((st, part) => L.addContinuousEffect(st, { ...part, affects: { mode: "fixed", permanentIds: ["gid"] }, duration: { kind: "permanent" }, source: { kind: "resolution", permanentId: null, controller: "ai" } }).state, zero);
    expect(permOf(G.destroyZeroLoyaltyPlaneswalkers(zero).state, "gid")).toBe(null); // control
    expect([chars(frog, "gid").types, permOf(G.destroyZeroLoyaltyPlaneswalkers(frog).state, "gid")?.id]).toEqual([["Creature", "Legendary"], "gid"]);
  });
  // a positive control the survey left printed (manaModel.landsCouldProduce reads the printed "Land" face, then the land's own production
  // through the loss view and its type-given colours through the identity — so a Frogified land adds nothing either way)
  it("Exotic Orchard reads no {G} off a Frogified Dryad Arbor (no land, no mana ability — CR 205.1a, 613.1f); off the Arbor unaffected, {G} and {U}", () => {
    const s0 = board({ user: [["orch", card("Exotic Orchard")]], ai: [["arbor", card("Dryad Arbor")], ["isl", card("Island")]], hand: ["Frogify"], lands: false });
    const colors = (s) => [...(M.manaSources(s, "user").find((x) => x.permanentId === "orch")?.colors || [])].sort();
    expect(colors(s0)).toEqual(["G", "U"]); // control
    expect(colors(castAt(s0, "Frogify", "arbor"))).toEqual(["U"]);
  });
});

describe("S2 recheck — the named-token pools on a board that sets types (R1), an unlisted creature type under a replace (R2), the Frog-Copter's damage (CR 205.1a)", () => {
  const tok = (k) => ({ ...NAMED_TOKENS[k], token: true, mana: "", cmc: 0, colors: [], keywords: [] });
  const withCounters = (s, id, n) => ({ ...s, players: Object.fromEntries(Object.entries(s.players).map(([pid, pl]) => [pid, { ...pl, battlefield: pl.battlefield.map((p) => (p.id === id ? { ...p, counters: { ...(p.counters || {}), "+1/+1": n } } : p)) }])) });
  for (const aura of ["Frogify", "Lignify"]) {
    it(`R1: with ${aura} on another creature, an unaffected Treasure, Food and Powerstone each match their "Sacrifice a …" pool (CR 111.10); on a plain board too (control)`, () => {
      const s0 = board({ user: [["tr", tok("treasure")], ["fd", tok("food")], ["ps", tok("powerstone")]], ai: [["bystander", card("Grizzly Bears")]], hand: [aura] });
      const pools = (s) => [["token:treasure", "tr"], ["token:food", "fd"], ["token:powerstone", "ps"]].map(([w, id]) => sacrificePoolMatchNow(w, s, permOf(s, id)));
      expect(pools(s0)).toEqual([true, true, true]); // control
      const s = castAt(s0, aura, "bystander");
      expect(typeof L.boardSetsTypes === "function" ? L.boardSetsTypes(s) : null).toBe(true); // an S2 reader: absent on the base commit
      expect(pools(s)).toEqual([true, true, true]);
    });
  }
  it("R1: The Cabbage Merchant (\"Whenever a creature deals combat damage to you, sacrifice a Food token\") sacrifices its Food with Lignify elsewhere on the board, as on a plain board (control)", () => {
    const s0 = board({ user: [["cab", card("The Cabbage Merchant")], ["fd", tok("food")]], ai: [["aibear", card("Grizzly Bears")], ["wall", card("Wall of Wood")]], hand: ["Lignify"] });
    const hit = (s) => settle(CR.resolveCombatDamage({ ...s, activePlayer: "ai", priorityHolder: "ai", phase: "combat", step: "combat-damage", combat: { attackers: [{ permanentId: "aibear", attackingPlayer: "ai", defender: "user" }], blockers: [] } }));
    expect(permOf(hit(s0), "fd")).toBe(null); // control
    const s = castAt(s0, "Lignify", "wall");
    expect(permOf(hit(s), "fd")).toBe(null);
  });
  for (const aura of ["Kenrith's Transformation", "Lignify"]) {
    it(`R2: Brawn, Amadeus Cho (Gamma Scientist Hero) under ${aura} is no Gamma (the replace takes every creature type, CR 205.1a): Abomination's "Whenever a Gamma or Villain you control deals combat damage to a player" stays silent; on a plain board it puts three counters (control)`, () => {
      const s0 = withCounters(board({ user: [["abom", card("Abomination, Irradiated Brute")], ["brawn", card("Brawn, Amadeus Cho")]], hand: [aura] }), "brawn", 2);
      const hit = (s) => settle(CR.resolveCombatDamage({ ...s, phase: "combat", step: "combat-damage", combat: { attackers: [{ permanentId: "brawn", attackingPlayer: "user", defender: "ai" }], blockers: [] } }));
      const counters = (s) => permOf(s, "abom")?.counters?.["+1/+1"] ?? 0;
      expect(counters(hit(s0))).toBe(3); // control: Brawn is a 3/3 Gamma
      const s = castAt(s0, aura, "brawn");
      expect(chars(s, "brawn").subtypes).toEqual([aura === "Lignify" ? "Treefolk" : "Elk"]);
      expect(L.permanentHasTypeWord(s, "brawn", "Gamma")).toBe(false);
      expect(L.permanentPower(s, "brawn")).toBe(aura === "Lignify" ? 2 : 5);
      expect(counters(hit(s))).toBe(0);
    });
  }
  for (const aura of ["Lignify", "Frogify"]) {
    it(`R2: Swarm of Locus ("Creature — Insect Locus") under ${aura} is no Locus — on a plain creature a land type's spelling is one of its creature types (CR 205.3d), and the replace takes them all (CR 205.1a); a Dryad Arbor under Lignify keeps its Forest (control)`, () => {
      const s0 = board({ user: [["swarm", card("Swarm of Locus")], ["arbor", card("Dryad Arbor")]], hand: [aura, "Lignify"], lands: false });
      const s = castAt(s0, aura, "swarm");
      expect(chars(s, "swarm").subtypes).toEqual([aura === "Lignify" ? "Treefolk" : "Frog"]);
      expect(L.permanentHasTypeWord(s, "swarm", "Locus")).toBe(false);
      expect(chars(castAt(s, "Lignify", "arbor"), "arbor").subtypes).toEqual(["Forest", "Treefolk"]); // control
    });
  }
  it("the Frog-Copter: a crewed Smuggler's Copter Frogified is a creature for good, so Ironscale Hydra (\"If a creature would deal combat damage to this creature\") prevents its damage and takes a counter; a Grizzly Bears the same (control)", () => {
    const s0 = board({ user: [["hydra", card("Ironscale Hydra")]], ai: [["copter", card("Smuggler's Copter")], ["bear", card("Grizzly Bears")]], hand: ["Frogify"] });
    const crew = LC.legalActionsForPlayer(seated(s0, "ai"), "ai").find((a) => a.kind === "crew-vehicle" && a.permanentId === "copter");
    expect(crew, "the Copter can be crewed").toBeTruthy();
    const crewed = { ...settle(AD.dispatchAction(seated(s0, "ai"), crew)), activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main" };
    const frog = cleanup(castAt(crewed, "Frogify", "copter"));
    expect(L.permanentIsCreature(frog, "copter")).toBe(true);
    const blocked = (s, attacker) => CR.resolveCombatDamage({ ...s, activePlayer: "ai", phase: "combat", step: "combat-damage", combat: { attackers: [{ permanentId: attacker, attackingPlayer: "ai", defender: "user" }], blockers: [{ blockerId: "hydra", attackerId: attacker }] } });
    const hydra = (s) => [permOf(s, "hydra")?.damageMarked || 0, permOf(s, "hydra")?.counters?.["+1/+1"] ?? 0];
    expect(hydra(blocked(s0, "bear"))).toEqual([0, 1]); // control
    expect(hydra(blocked(frog, "copter"))).toEqual([0, 1]);
  });
});

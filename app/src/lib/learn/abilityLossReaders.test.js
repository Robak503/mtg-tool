/**
 * abilityLossReaders.test.js — the ability-loss program's S0b gate (docs/orchestration/ABILITY-LOSS-PROGRAM.md §5): every reader
 * OUTSIDE layers.js reads a permanent that lost all its abilities (CR 613.1f) as a permanent with no abilities — the routed
 * chokepoints (layers.withAbilityLoss / abilityCardOf, the look-back stamp, the attachment cutoff, the entering side).
 *
 *   1. THE CENSUS (the absolute check, §5.1 + §5.2): every card of the corpus sample on a board, then the same board with a fixed-mode
 *      loss on it (injected through addContinuousEffect, as a resolved spell's would be). Each reader R is run on both. A card is a
 *      CARRIER of R when R reads something off it on the loss-free board; on the lost board R must read nothing — no triggers for any
 *      event, no activated action, no mana source, no keyword over the whole vocabulary, no protection, no ward, no collected effect
 *      at layer 6 or later sourced from it, no board-scanner hit, no entry replacement from its own text. Every reader must have at
 *      least one carrier (a reader no card reaches proves nothing — the hollow-gate law).
 *   2. THE VANILLA-TWIN DIFFERENTIAL (§5.3): the lost permanent and a no-text twin, both under a NEUTRAL name (so a name-keyed table
 *      cannot hide a leak), give the same whole legal-action lists (main phase and declare attackers), the same block matrices, the
 *      same combat-damage results and the same board-scanner answers.
 *   3. GRANT TIMING (§5.4): an Equipment or Aura grant attached before the loss is cut, one attached after applies; a counter before
 *      the loss is cut, one after counts; a same-effect (`grantedWith`) grant is kept — through the routed readers.
 *   4. THE LOOK-BACK (CR 603.10a — the S0a review's F5): a creature that lost its abilities dies or leaves with none, so its own dies
 *      and leave triggers do not fire, and a granted dies trigger made before the loss stays cut (one made after fires).
 *   5. THE COPY-AWARE KEYWORD SEED (the S0a found-not-fixed (2)): a permanent that became a copy has the copy's printed keywords.
 *
 * Read only through PUBLIC readers that existed before the slice (the check* trigger dispatchers, legalActionsForPlayer,
 * manaSources, permanentHasKeyword, canBlockAttacker, resolveCombatDamage, applyEnterReplacements, dispatchAction, the board
 * scanners), so on the base commit the file loads and fails on its assertions. The cards are real bundled cards
 * (cardIndex.publicCard → learnDeckEnrich.mergeCardData), generated, never typed.
 */
import { beforeEach, describe, expect, it } from "vitest";
import * as L from "./layers.js";
import * as G from "./gameState.js";
import * as T from "./triggers.js";
import * as LC from "./legalChoices.js";
import * as M from "./manaModel.js";
import * as CE from "./combatEvasion.js";
import * as CR from "./combatResolution.js";
import * as SAP from "./staticAbilityParser.js";
import * as W from "./ward.js";
import * as ER from "./enterReplacements.js";
import * as RE from "./replacementEffects.js";
import * as DR from "./damageReplacements.js";
import * as TN from "./effects/textNormalize.js";
import * as AT from "./attackTax.js";
import * as AR from "./attackRequirements.js";
import * as AN from "./annihilator.js";
import * as RS from "./resolvers.js";
import * as AD from "./actionDispatcher.js";
import * as SU from "./seedbornUntap.js";
import * as GE from "./gameEngine.js";
import { COMBAT_KEYWORDS, GRANTABLE_STATIC_KEYWORDS } from "./keywords.js";

beforeEach(() => G._resetIdsForTests());

// ─── the corpus sample (bundled Scryfall data — generated, never typed) ────────────────────────────────────────────────────────
// 118 cards: a carrier for each routed reader (triggers, activated and mana abilities, combat text, keywords, protection,
// ward, the board scanners, the cost scanners, the entry replacements), the attachments that grant abilities, and a neutral support set
const CORPUS = [
{"name":"Blood Artist","type":"Creature — Vampire","mana":"{1}{B}","oracle":"Whenever this creature or another creature dies, target player loses 1 life and you gain 1 life.","layout":"normal","cmc":2,"power":"0","toughness":"1","loyalty":null,"keywords":[],"colors":["B"],"colorIdentity":["B"]},
  {"name":"Soul Warden","type":"Creature — Human Cleric","mana":"{W}","oracle":"Whenever another creature enters, you gain 1 life.","layout":"normal","cmc":1,"power":"1","toughness":"1","loyalty":null,"keywords":[],"colors":["W"],"colorIdentity":["W"]},
  {"name":"Mesa Enchantress","type":"Creature — Human Druid","mana":"{1}{W}{W}","oracle":"Whenever you cast an enchantment spell, you may draw a card.","layout":"normal","cmc":3,"power":"0","toughness":"2","loyalty":null,"keywords":[],"colors":["W"],"colorIdentity":["W"]},
  {"name":"Elvish Visionary","type":"Creature — Elf Shaman","mana":"{1}{G}","oracle":"When this creature enters, draw a card.","layout":"normal","cmc":2,"power":"1","toughness":"1","loyalty":null,"keywords":[],"colors":["G"],"colorIdentity":["G"]},
  {"name":"Young Wolf","type":"Creature — Wolf","mana":"{G}","oracle":"Undying (When this creature dies, if it had no +1/+1 counters on it, return it to the battlefield under its owner's control with a +1/+1 counter on it.)","layout":"normal","cmc":1,"power":"1","toughness":"1","loyalty":null,"keywords":["Undying"],"colors":["G"],"colorIdentity":["G"]},
  {"name":"Doomed Traveler","type":"Creature — Human Soldier","mana":"{W}","oracle":"When this creature dies, create a 1/1 white Spirit creature token with flying.","layout":"normal","cmc":1,"power":"1","toughness":"1","loyalty":null,"keywords":[],"colors":["W"],"colorIdentity":["W"]},
  {"name":"Zulaport Cutthroat","type":"Creature — Human Rogue Ally","mana":"{1}{B}","oracle":"Whenever this creature or another creature you control dies, each opponent loses 1 life and you gain 1 life.","layout":"normal","cmc":2,"power":"1","toughness":"1","loyalty":null,"keywords":[],"colors":["B"],"colorIdentity":["B"]},
  {"name":"Young Pyromancer","type":"Creature — Human Shaman","mana":"{1}{R}","oracle":"Whenever you cast an instant or sorcery spell, create a 1/1 red Elemental creature token.","layout":"normal","cmc":2,"power":"2","toughness":"1","loyalty":null,"keywords":[],"colors":["R"],"colorIdentity":["R"]},
  {"name":"Monastery Swiftspear","type":"Creature — Human Monk","mana":"{R}","oracle":"Haste\nProwess (Whenever you cast a noncreature spell, this creature gets +1/+1 until end of turn.)","layout":"normal","cmc":1,"power":"1","toughness":"2","loyalty":null,"keywords":["Prowess","Haste"],"colors":["R"],"colorIdentity":["R"]},
  {"name":"Phyrexian Arena","type":"Enchantment","mana":"{1}{B}{B}","oracle":"At the beginning of your upkeep, you draw a card and lose 1 life.","layout":"normal","cmc":3,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["B"],"colorIdentity":["B"]},
  {"name":"Mayhem Devil","type":"Creature — Devil","mana":"{1}{B}{R}","oracle":"Whenever a player sacrifices a permanent, this creature deals 1 damage to any target.","layout":"normal","cmc":3,"power":"3","toughness":"3","loyalty":null,"keywords":[],"colors":["B","R"],"colorIdentity":["B","R"]},
  {"name":"Hellrider","type":"Creature — Devil","mana":"{2}{R}{R}","oracle":"Haste\nWhenever a creature you control attacks, this creature deals 1 damage to the player or planeswalker it's attacking.","layout":"normal","cmc":4,"power":"3","toughness":"3","loyalty":null,"keywords":["Haste"],"colors":["R"],"colorIdentity":["R"]},
  {"name":"Ajani's Pridemate","type":"Creature — Cat Soldier","mana":"{1}{W}","oracle":"Whenever you gain life, put a +1/+1 counter on this creature.","layout":"normal","cmc":2,"power":"2","toughness":"2","loyalty":null,"keywords":[],"colors":["W"],"colorIdentity":["W"]},
  {"name":"Ulamog's Crusher","type":"Creature — Eldrazi","mana":"{8}","oracle":"Annihilator 2 (Whenever this creature attacks, defending player sacrifices two permanents of their choice.)\nThis creature attacks each combat if able.","layout":"normal","cmc":8,"power":"8","toughness":"8","loyalty":null,"keywords":["Annihilator"],"colors":[],"colorIdentity":[]},
  {"name":"Sixth Sense","type":"Enchantment — Aura","mana":"{G}","oracle":"Enchant creature\nEnchanted creature has \"Whenever this creature deals combat damage to a player, you may draw a card.\"","layout":"normal","cmc":1,"power":null,"toughness":null,"loyalty":null,"keywords":["Enchant"],"colors":["G"],"colorIdentity":["G"]},
  {"name":"Silverblade Paladin","type":"Creature — Human Knight","mana":"{1}{W}{W}","oracle":"Soulbond (You may pair this creature with another unpaired creature when either enters. They remain paired for as long as you control both of them.)\nAs long as this creature is paired with another creature, both creatures have double strike.","layout":"normal","cmc":3,"power":"2","toughness":"2","loyalty":null,"keywords":["Soulbond"],"colors":["W"],"colorIdentity":["W"]},
  {"name":"Prodigal Sorcerer","type":"Creature — Human Wizard Sorcerer","mana":"{2}{U}","oracle":"{T}: This creature deals 1 damage to any target.","layout":"normal","cmc":3,"power":"1","toughness":"1","loyalty":null,"keywords":[],"colors":["U"],"colorIdentity":["U"]},
  {"name":"Sakura-Tribe Elder","type":"Creature — Snake Shaman","mana":"{1}{G}","oracle":"Sacrifice this creature: Search your library for a basic land card, put that card onto the battlefield tapped, then shuffle.","layout":"normal","cmc":2,"power":"1","toughness":"1","loyalty":null,"keywords":[],"colors":["G"],"colorIdentity":["G"]},
  {"name":"Mother of Runes","type":"Creature — Human Cleric","mana":"{W}","oracle":"{T}: Target creature you control gains protection from the color of your choice until end of turn.","layout":"normal","cmc":1,"power":"1","toughness":"1","loyalty":null,"keywords":[],"colors":["W"],"colorIdentity":["W"]},
  {"name":"Quicksilver Dagger","type":"Enchantment — Aura","mana":"{1}{U}{R}","oracle":"Enchant creature\nEnchanted creature has \"{T}: This creature deals 1 damage to target player or planeswalker. You draw a card.\"","layout":"normal","cmc":3,"power":null,"toughness":null,"loyalty":null,"keywords":["Enchant"],"colors":["R","U"],"colorIdentity":["R","U"]},
  {"name":"Viridian Longbow","type":"Artifact — Equipment","mana":"{1}","oracle":"Equipped creature has \"{T}: This creature deals 1 damage to any target.\"\nEquip {3} ({3}: Attach to target creature you control. Equip only as a sorcery.)","layout":"normal","cmc":1,"power":null,"toughness":null,"loyalty":null,"keywords":["Equip"],"colors":[],"colorIdentity":[]},
  {"name":"Smuggler's Copter","type":"Artifact — Vehicle","mana":"{2}","oracle":"Flying\nWhenever this Vehicle attacks or blocks, you may draw a card. If you do, discard a card.\nCrew 1 (Tap any number of creatures you control with total power 1 or more: This Vehicle becomes an artifact creature until end of turn.)","layout":"normal","cmc":2,"power":"3","toughness":"3","loyalty":null,"keywords":["Flying","Crew"],"colors":[],"colorIdentity":[]},
  {"name":"Doubling Cube","type":"Artifact","mana":"{2}","oracle":"{3}, {T}: Double the amount of each type of unspent mana you have.","layout":"normal","cmc":2,"power":null,"toughness":null,"loyalty":null,"keywords":["Double"],"colors":[],"colorIdentity":[]},
  {"name":"Liliana of the Veil","type":"Legendary Planeswalker — Liliana","mana":"{1}{B}{B}","oracle":"+1: Each player discards a card.\n−2: Target player sacrifices a creature.\n−6: Separate all permanents target player controls into two piles. That player sacrifices all permanents in the pile of their choice.","layout":"normal","cmc":3,"power":null,"toughness":null,"loyalty":"3","keywords":[],"colors":["B"],"colorIdentity":["B"]},
  {"name":"Llanowar Elves","type":"Creature — Elf Druid","mana":"{G}","oracle":"{T}: Add {G}.","layout":"normal","cmc":1,"power":"1","toughness":"1","loyalty":null,"keywords":[],"colors":["G"],"colorIdentity":["G"]},
  {"name":"Sol Ring","type":"Artifact","mana":"{1}","oracle":"{T}: Add {C}{C}.","layout":"normal","cmc":1,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":[]},
  {"name":"Birds of Paradise","type":"Creature — Bird","mana":"{G}","oracle":"Flying\n{T}: Add one mana of any color.","layout":"normal","cmc":1,"power":"0","toughness":"1","loyalty":null,"keywords":["Flying"],"colors":["G"],"colorIdentity":["G"]},
  {"name":"Forest","type":"Basic Land — Forest","mana":"","oracle":"({T}: Add {G}.)","layout":"normal","cmc":0,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":["G"]},
  {"name":"Elvish Archdruid","type":"Creature — Elf Druid","mana":"{1}{G}{G}","oracle":"Other Elf creatures you control get +1/+1.\n{T}: Add {G} for each Elf you control.","layout":"normal","cmc":3,"power":"2","toughness":"2","loyalty":null,"keywords":[],"colors":["G"],"colorIdentity":["G"]},
  {"name":"Dryad Arbor","type":"Land Creature — Forest Dryad","mana":"","oracle":"(This land isn't a spell, it's affected by summoning sickness, and it has \"{T}: Add {G}.\")","layout":"normal","cmc":0,"power":"1","toughness":"1","loyalty":null,"keywords":[],"colors":["G"],"colorIdentity":["G"]},
  {"name":"Command Tower","type":"Land","mana":"","oracle":"{T}: Add one mana of any color in your commander's color identity.","layout":"normal","cmc":0,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":[]},
  {"name":"Mana Vault","type":"Artifact","mana":"{1}","oracle":"This artifact doesn't untap during your untap step.\nAt the beginning of your upkeep, you may pay {4}. If you do, untap this artifact.\nAt the beginning of your draw step, if this artifact is tapped, it deals 1 damage to you.\n{T}: Add {C}{C}{C}.","layout":"normal","cmc":1,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":[]},
  {"name":"Gaea's Cradle","type":"Legendary Land","mana":"","oracle":"{T}: Add {G} for each creature you control.","layout":"normal","cmc":0,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":["G"]},
  {"name":"Invisible Stalker","type":"Creature — Human Rogue","mana":"{1}{U}","oracle":"Hexproof (This creature can't be the target of spells or abilities your opponents control.)\nThis creature can't be blocked.","layout":"normal","cmc":2,"power":"1","toughness":"1","loyalty":null,"keywords":["Hexproof"],"colors":["U"],"colorIdentity":["U"]},
  {"name":"Sightless Ghoul","type":"Creature — Zombie Soldier","mana":"{3}{B}","oracle":"This creature can't block.\nUndying (When this creature dies, if it had no +1/+1 counters on it, return it to the battlefield under its owner's control with a +1/+1 counter on it.)","layout":"normal","cmc":4,"power":"2","toughness":"2","loyalty":null,"keywords":["Undying"],"colors":["B"],"colorIdentity":["B"]},
  {"name":"Cloud Elemental","type":"Creature — Elemental","mana":"{2}{U}","oracle":"Flying\nThis creature can block only creatures with flying.","layout":"normal","cmc":3,"power":"2","toughness":"3","loyalty":null,"keywords":["Flying"],"colors":["U"],"colorIdentity":["U"]},
  {"name":"Mogg Flunkies","type":"Creature — Goblin","mana":"{1}{R}","oracle":"This creature can't attack or block alone.","layout":"normal","cmc":2,"power":"3","toughness":"3","loyalty":null,"keywords":[],"colors":["R"],"colorIdentity":["R"]},
  {"name":"Craven Hulk","type":"Creature — Giant Coward","mana":"{3}{R}","oracle":"This creature can't block alone.","layout":"normal","cmc":4,"power":"4","toughness":"4","loyalty":null,"keywords":[],"colors":["R"],"colorIdentity":["R"]},
  {"name":"Juggernaut","type":"Artifact Creature — Juggernaut","mana":"{4}","oracle":"This creature attacks each combat if able.\nThis creature can't be blocked by Walls.","layout":"normal","cmc":4,"power":"5","toughness":"3","loyalty":null,"keywords":[],"colors":[],"colorIdentity":[]},
  {"name":"Riveteers Decoy","type":"Creature — Human Warrior","mana":"{1}{G}","oracle":"This creature must be blocked if able.\nBlitz {3}{G} (If you cast this spell for its blitz cost, it gains haste and \"When this creature dies, draw a card.\" Sacrifice it at the beginning of the next end step.)","layout":"normal","cmc":2,"power":"3","toughness":"1","loyalty":null,"keywords":["Blitz"],"colors":["G"],"colorIdentity":["G"]},
  {"name":"Champion of Lambholt","type":"Creature — Human Warrior","mana":"{1}{G}{G}","oracle":"Creatures with power less than this creature's power can't block creatures you control.\nWhenever another creature you control enters, put a +1/+1 counter on this creature.","layout":"normal","cmc":3,"power":"1","toughness":"1","loyalty":null,"keywords":[],"colors":["G"],"colorIdentity":["G"]},
  {"name":"Wandering Wolf","type":"Creature — Wolf","mana":"{1}{G}","oracle":"Creatures with power less than this creature's power can't block it.","layout":"normal","cmc":2,"power":"2","toughness":"1","loyalty":null,"keywords":[],"colors":["G"],"colorIdentity":["G"]},
  {"name":"Thorn Elemental","type":"Creature — Elemental","mana":"{5}{G}{G}","oracle":"You may have this creature assign its combat damage as though it weren't blocked.","layout":"normal","cmc":7,"power":"7","toughness":"7","loyalty":null,"keywords":[],"colors":["G"],"colorIdentity":["G"]},
  {"name":"Venerated Rotpriest","type":"Creature — Phyrexian Druid","mana":"{G}","oracle":"Toxic 1 (Players dealt combat damage by this creature also get a poison counter.)\nWhenever a creature you control becomes the target of a spell, target opponent gets a poison counter.","layout":"normal","cmc":1,"power":"1","toughness":"2","loyalty":null,"keywords":["Toxic"],"colors":["G"],"colorIdentity":["G"]},
  {"name":"Fog Bank","type":"Creature — Wall","mana":"{1}{U}","oracle":"Defender (This creature can't attack.)\nFlying\nPrevent all combat damage that would be dealt to and dealt by this creature.","layout":"normal","cmc":2,"power":"0","toughness":"2","loyalty":null,"keywords":["Flying","Defender"],"colors":["U"],"colorIdentity":["U"]},
  {"name":"Phantom Centaur","type":"Creature — Centaur Spirit","mana":"{2}{G}{G}","oracle":"Protection from black\nThis creature enters with three +1/+1 counters on it.\nIf damage would be dealt to this creature, prevent that damage. Remove a +1/+1 counter from this creature.","layout":"normal","cmc":4,"power":"2","toughness":"0","loyalty":null,"keywords":["Protection"],"colors":["G"],"colorIdentity":["G"]},
  {"name":"Ironscale Hydra","type":"Creature — Hydra","mana":"{3}{G}{G}","oracle":"If a creature would deal combat damage to this creature, prevent that damage and put a +1/+1 counter on this creature.","layout":"normal","cmc":5,"power":"5","toughness":"5","loyalty":null,"keywords":[],"colors":["G"],"colorIdentity":["G"]},
  {"name":"Dauthi Slayer","type":"Creature — Dauthi Soldier","mana":"{B}{B}","oracle":"Shadow (This creature can block or be blocked by only creatures with shadow.)\nThis creature attacks each combat if able.","layout":"normal","cmc":2,"power":"2","toughness":"2","loyalty":null,"keywords":["Shadow"],"colors":["B"],"colorIdentity":["B"]},
  {"name":"Palace Guard","type":"Creature — Human Soldier","mana":"{2}{W}","oracle":"This creature can block any number of creatures.","layout":"normal","cmc":3,"power":"1","toughness":"4","loyalty":null,"keywords":[],"colors":["W"],"colorIdentity":["W"]},
  {"name":"Hungering Hydra","type":"Creature — Hydra","mana":"{X}{G}","oracle":"This creature enters with X +1/+1 counters on it.\nThis creature can't be blocked by more than one creature.\nWhenever this creature is dealt damage, put that many +1/+1 counters on it. (It must survive the damage to get the counters.)","layout":"normal","cmc":1,"power":"0","toughness":"0","loyalty":null,"keywords":[],"colors":["G"],"colorIdentity":["G"]},
  {"name":"Serra Angel","type":"Creature — Angel","mana":"{3}{W}{W}","oracle":"Flying\nVigilance (Attacking doesn't cause this creature to tap.)","layout":"normal","cmc":5,"power":"4","toughness":"4","loyalty":null,"keywords":["Flying","Vigilance"],"colors":["W"],"colorIdentity":["W"]},
  {"name":"Vampire Nighthawk","type":"Creature — Vampire Shaman","mana":"{1}{B}{B}","oracle":"Flying\nDeathtouch (Any amount of damage this deals to a creature is enough to destroy it.)\nLifelink (Damage dealt by this creature also causes you to gain that much life.)","layout":"normal","cmc":3,"power":"2","toughness":"3","loyalty":null,"keywords":["Deathtouch","Flying","Lifelink"],"colors":["B"],"colorIdentity":["B"]},
  {"name":"Lord of Atlantis","type":"Creature — Merfolk","mana":"{U}{U}","oracle":"Other Merfolk get +1/+1 and have islandwalk. (They can't be blocked as long as defending player controls an Island.)","layout":"normal","cmc":2,"power":"2","toughness":"2","loyalty":null,"keywords":[],"colors":["U"],"colorIdentity":["U"]},
  {"name":"Silver Knight","type":"Creature — Human Knight","mana":"{W}{W}","oracle":"First strike, protection from red","layout":"normal","cmc":2,"power":"2","toughness":"2","loyalty":null,"keywords":["First strike","Protection"],"colors":["W"],"colorIdentity":["W"]},
  {"name":"Progenitus","type":"Legendary Creature — Hydra Avatar","mana":"{W}{W}{U}{U}{B}{B}{R}{R}{G}{G}","oracle":"Protection from everything\nIf Progenitus would be put into a graveyard from anywhere, reveal Progenitus and shuffle it into its owner's library instead.","layout":"normal","cmc":10,"power":"10","toughness":"10","loyalty":null,"keywords":["Protection"],"colors":["B","G","R","U","W"],"colorIdentity":["B","G","R","U","W"]},
  {"name":"Hulking Raptor","type":"Creature — Dinosaur","mana":"{2}{G}{G}","oracle":"Ward {2}\nAt the beginning of your first main phase, add {G}{G}.","layout":"normal","cmc":4,"power":"5","toughness":"3","loyalty":null,"keywords":["Ward"],"colors":["G"],"colorIdentity":["G"]},
  {"name":"Darksteel Myr","type":"Artifact Creature — Myr","mana":"{3}","oracle":"Indestructible (Damage and effects that say \"destroy\" don't destroy this creature. If its toughness is 0 or less, it still dies.)","layout":"normal","cmc":3,"power":"0","toughness":"1","loyalty":null,"keywords":["Indestructible"],"colors":[],"colorIdentity":[]},
  {"name":"Glorious Anthem","type":"Enchantment","mana":"{1}{W}{W}","oracle":"Creatures you control get +1/+1.","layout":"normal","cmc":3,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["W"],"colorIdentity":["W"]},
  {"name":"Rest in Peace","type":"Enchantment","mana":"{1}{W}","oracle":"When this enchantment enters, exile all graveyards.\nIf a card or token would be put into a graveyard from anywhere, exile it instead.","layout":"normal","cmc":2,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["W"],"colorIdentity":["W"]},
  {"name":"Propaganda","type":"Enchantment","mana":"{2}{U}","oracle":"Creatures can't attack you unless their controller pays {2} for each creature they control that's attacking you.","layout":"normal","cmc":3,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["U"],"colorIdentity":["U"]},
  {"name":"Winter Orb","type":"Artifact","mana":"{2}","oracle":"As long as this artifact is untapped, players can't untap more than one land during their untap steps.","layout":"normal","cmc":2,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":[]},
  {"name":"Doubling Season","type":"Enchantment","mana":"{4}{G}","oracle":"If an effect would create one or more tokens under your control, it creates twice that many of those tokens instead.\nIf an effect would put one or more counters on a permanent you control, it puts twice that many of those counters on that permanent instead.","layout":"normal","cmc":5,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["G"],"colorIdentity":["G"]},
  {"name":"Parallel Lives","type":"Enchantment","mana":"{3}{G}","oracle":"If an effect would create one or more tokens under your control, it creates twice that many of those tokens instead.","layout":"normal","cmc":4,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["G"],"colorIdentity":["G"]},
  {"name":"Mana Reflection","type":"Enchantment","mana":"{4}{G}{G}","oracle":"If you tap a permanent for mana, it produces twice as much of that mana instead.","layout":"normal","cmc":6,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["G"],"colorIdentity":["G"]},
  {"name":"Seedborn Muse","type":"Creature — Spirit","mana":"{3}{G}{G}","oracle":"Untap all permanents you control during each other player's untap step.","layout":"normal","cmc":5,"power":"2","toughness":"4","loyalty":null,"keywords":[],"colors":["G"],"colorIdentity":["G"]},
  {"name":"Null Rod","type":"Artifact","mana":"{2}","oracle":"Activated abilities of artifacts can't be activated.","layout":"normal","cmc":2,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":[]},
  {"name":"Worship","type":"Enchantment","mana":"{3}{W}","oracle":"If you control a creature, damage that would reduce your life total to less than 1 reduces it to 1 instead.","layout":"normal","cmc":4,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["W"],"colorIdentity":["W"]},
  {"name":"Kismet","type":"Enchantment","mana":"{3}{W}","oracle":"Artifacts, creatures, and lands your opponents control enter tapped.","layout":"normal","cmc":4,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["W"],"colorIdentity":["W"]},
  {"name":"Root Sliver","type":"Creature — Sliver","mana":"{3}{G}","oracle":"This spell can't be countered.\nSliver spells can't be countered.","layout":"normal","cmc":4,"power":"2","toughness":"2","loyalty":null,"keywords":[],"colors":["G"],"colorIdentity":["G"]},
  {"name":"Courser of Kruphix","type":"Enchantment Creature — Centaur","mana":"{1}{G}{G}","oracle":"Play with the top card of your library revealed.\nYou may play lands from the top of your library.\nLandfall — Whenever a land you control enters, you gain 1 life.","layout":"normal","cmc":3,"power":"2","toughness":"4","loyalty":null,"keywords":["Landfall"],"colors":["G"],"colorIdentity":["G"]},
  {"name":"Exploration","type":"Enchantment","mana":"{G}","oracle":"You may play an additional land on each of your turns.","layout":"normal","cmc":1,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["G"],"colorIdentity":["G"]},
  {"name":"Underworld Breach","type":"Enchantment","mana":"{1}{R}","oracle":"Each nonland card in your graveyard has escape. The escape cost is equal to the card's mana cost plus exile three other cards from your graveyard. (You may cast cards from your graveyard for their escape cost.)\nAt the beginning of the end step, sacrifice this enchantment.","layout":"normal","cmc":2,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["R"],"colorIdentity":["R"]},
  {"name":"Frenzied Baloth","type":"Creature — Beast","mana":"{G}{G}","oracle":"This spell can't be countered.\nTrample, haste\nCreature spells you control can't be countered.\nCombat damage can't be prevented.","layout":"normal","cmc":2,"power":"3","toughness":"2","loyalty":null,"keywords":["Haste","Trample"],"colors":["G"],"colorIdentity":["G"]},
  {"name":"Defense Grid","type":"Artifact","mana":"{2}","oracle":"Each spell costs {3} more to cast except during its controller's turn.","layout":"normal","cmc":2,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":[]},
  {"name":"Training Grounds","type":"Enchantment","mana":"{U}","oracle":"Activated abilities of creatures you control cost {2} less to activate. This effect can't reduce the mana in that cost to less than one mana.","layout":"normal","cmc":1,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["U"],"colorIdentity":["U"]},
  {"name":"Puresteel Paladin","type":"Creature — Human Knight","mana":"{W}{W}","oracle":"Whenever an Equipment you control enters, you may draw a card.\nMetalcraft — Equipment you control have equip {0} as long as you control three or more artifacts.","layout":"normal","cmc":2,"power":"2","toughness":"2","loyalty":null,"keywords":["Metalcraft"],"colors":["W"],"colorIdentity":["W"]},
  {"name":"Horizon Stone","type":"Artifact","mana":"{5}","oracle":"If you would lose unspent mana, that mana becomes colorless instead.","layout":"normal","cmc":5,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":[]},
  {"name":"Teferi, Time Raveler","type":"Legendary Planeswalker — Teferi","mana":"{1}{W}{U}","oracle":"Each opponent can cast spells only any time they could cast a sorcery.\n+1: Until your next turn, you may cast sorcery spells as though they had flash.\n−3: Return up to one target artifact, creature, or enchantment to its owner's hand. Draw a card.","layout":"normal","cmc":3,"power":null,"toughness":null,"loyalty":"4","keywords":[],"colors":["U","W"],"colorIdentity":["U","W"]},
  {"name":"Torbran, Thane of Red Fell","type":"Legendary Creature — Dwarf Noble","mana":"{1}{R}{R}{R}","oracle":"If a red source you control would deal damage to an opponent or a permanent an opponent controls, it deals that much damage plus 2 instead.","layout":"normal","cmc":4,"power":"2","toughness":"4","loyalty":null,"keywords":[],"colors":["R"],"colorIdentity":["R"]},
  {"name":"Watery Grasp","type":"Enchantment — Aura","mana":"{U}","oracle":"Enchant creature\nEnchanted creature doesn't untap during its controller's untap step.\nWaterbend {5}: Enchanted creature's owner shuffles it into their library. (While paying a waterbend cost, you can tap your artifacts and creatures to help. Each one pays for {1}.)","layout":"normal","cmc":1,"power":null,"toughness":null,"loyalty":null,"keywords":["Enchant","Waterbend"],"colors":["U"],"colorIdentity":["U"]},
  {"name":"Stone of Erech","type":"Legendary Artifact","mana":"{1}","oracle":"If a creature an opponent controls would die, exile it instead.\n{2}, {T}, Sacrifice Stone of Erech: Exile target player's graveyard. Draw a card.","layout":"normal","cmc":1,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":[]},
  {"name":"Rhythm of the Wild","type":"Enchantment","mana":"{1}{R}{G}","oracle":"Creature spells you control can't be countered.\nNontoken creatures you control have riot. (They enter with your choice of a +1/+1 counter or haste.)","layout":"normal","cmc":3,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["G","R"],"colorIdentity":["G","R"]},
  {"name":"Renata, Called to the Hunt","type":"Legendary Enchantment Creature — Demigod","mana":"{2}{G}{G}","oracle":"Renata's power is equal to your devotion to green. (Each {G} in the mana costs of permanents you control counts toward your devotion to green.)\nEach other creature you control enters with an additional +1/+1 counter on it.","layout":"normal","cmc":4,"power":"*","toughness":"3","loyalty":null,"keywords":[],"colors":["G"],"colorIdentity":["G"]},
  {"name":"Leyline of Sanctity","type":"Enchantment","mana":"{2}{W}{W}","oracle":"If this card is in your opening hand, you may begin the game with it on the battlefield.\nYou have hexproof. (You can't be the target of spells or abilities your opponents control.)","layout":"normal","cmc":4,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["W"],"colorIdentity":["W"]},
  {"name":"Teysa Karlov","type":"Legendary Creature — Human Advisor","mana":"{2}{W}{B}","oracle":"If a creature dying causes a triggered ability of a permanent you control to trigger, that ability triggers an additional time.\nCreature tokens you control have vigilance and lifelink.","layout":"normal","cmc":4,"power":"2","toughness":"4","loyalty":null,"keywords":[],"colors":["B","W"],"colorIdentity":["B","W"]},
  {"name":"Golgari Guildgate","type":"Land — Gate","mana":"","oracle":"This land enters tapped.\n{T}: Add {B} or {G}.","layout":"normal","cmc":0,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":["B","G"]},
  {"name":"Overgrown Tomb","type":"Land — Swamp Forest","mana":"","oracle":"({T}: Add {B} or {G}.)\nAs this land enters, you may pay 2 life. If you don't, it enters tapped.","layout":"normal","cmc":0,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":["B","G"]},
  {"name":"Grim Poppet","type":"Artifact Creature — Scarecrow","mana":"{7}","oracle":"This creature enters with three -1/-1 counters on it.\nRemove a -1/-1 counter from this creature: Put a -1/-1 counter on another target creature.","layout":"normal","cmc":7,"power":"4","toughness":"4","loyalty":null,"keywords":[],"colors":[],"colorIdentity":[]},
  {"name":"Arcbound Ravager","type":"Artifact Creature — Beast","mana":"{2}","oracle":"Sacrifice an artifact: Put a +1/+1 counter on this creature.\nModular 1 (This creature enters with a +1/+1 counter on it. When it dies, you may put its +1/+1 counters on target artifact creature.)","layout":"normal","cmc":2,"power":"0","toughness":"0","loyalty":null,"keywords":["Modular"],"colors":[],"colorIdentity":[]},
  {"name":"Gruul Spellbreaker","type":"Creature — Ogre Warrior","mana":"{1}{R}{G}","oracle":"Riot (This creature enters with your choice of a +1/+1 counter or haste.)\nTrample\nDuring your turn, you and this creature have hexproof.","layout":"normal","cmc":3,"power":"3","toughness":"3","loyalty":null,"keywords":["Trample","Riot"],"colors":["G","R"],"colorIdentity":["G","R"]},
  {"name":"Metallic Mimic","type":"Artifact Creature — Shapeshifter","mana":"{2}","oracle":"As this creature enters, choose a creature type.\nThis creature is the chosen type in addition to its other types.\nEach other creature you control of the chosen type enters with an additional +1/+1 counter on it.","layout":"normal","cmc":2,"power":"2","toughness":"1","loyalty":null,"keywords":[],"colors":[],"colorIdentity":[]},
  {"name":"Thriving Grove","type":"Land","mana":"","oracle":"This land enters tapped. As it enters, choose a color other than green.\n{T}: Add {G} or one mana of the chosen color.","layout":"normal","cmc":0,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":["G"]},
  {"name":"Cavern of Souls","type":"Land","mana":"","oracle":"As this land enters, choose a creature type.\n{T}: Add {C}.\n{T}: Add one mana of any color. Spend this mana only to cast a creature spell of the chosen type, and that spell can't be countered.","layout":"normal","cmc":0,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":[]},
  {"name":"Grizzly Bears","type":"Creature — Bear","mana":"{1}{G}","oracle":"","layout":"normal","cmc":2,"power":"2","toughness":"2","loyalty":null,"keywords":[],"colors":["G"],"colorIdentity":["G"]},
  {"name":"Humility","type":"Enchantment","mana":"{2}{W}{W}","oracle":"All creatures lose all abilities and have base power and toughness 1/1.","layout":"normal","cmc":4,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["W"],"colorIdentity":["W"]},
  {"name":"Plains","type":"Basic Land — Plains","mana":"","oracle":"({T}: Add {W}.)","layout":"normal","cmc":0,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":["W"]},
  {"name":"Island","type":"Basic Land — Island","mana":"","oracle":"({T}: Add {U}.)","layout":"normal","cmc":0,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":["U"]},
  {"name":"Swamp","type":"Basic Land — Swamp","mana":"","oracle":"({T}: Add {B}.)","layout":"normal","cmc":0,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":["B"]},
  {"name":"Mountain","type":"Basic Land — Mountain","mana":"","oracle":"({T}: Add {R}.)","layout":"normal","cmc":0,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":["R"]},
  {"name":"Lightning Bolt","type":"Instant","mana":"{R}","oracle":"Lightning Bolt deals 3 damage to any target.","layout":"normal","cmc":1,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["R"],"colorIdentity":["R"]},
  {"name":"Swords to Plowshares","type":"Instant","mana":"{W}","oracle":"Exile target creature. Its controller gains life equal to its power.","layout":"normal","cmc":1,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["W"],"colorIdentity":["W"]},
  {"name":"Sign in Blood","type":"Sorcery","mana":"{B}{B}","oracle":"Target player draws two cards and loses 2 life.","layout":"normal","cmc":2,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["B"],"colorIdentity":["B"]},
  {"name":"Ornithopter","type":"Artifact Creature — Thopter","mana":"{0}","oracle":"Flying","layout":"normal","cmc":0,"power":"0","toughness":"2","loyalty":null,"keywords":["Flying"],"colors":[],"colorIdentity":[]},
  {"name":"Giant Spider","type":"Creature — Spider","mana":"{3}{G}","oracle":"Reach (This creature can block creatures with flying.)","layout":"normal","cmc":4,"power":"2","toughness":"4","loyalty":null,"keywords":["Reach"],"colors":["G"],"colorIdentity":["G"]},
  {"name":"Wall of Wood","type":"Creature — Wall","mana":"{G}","oracle":"Defender (This creature can't attack.)","layout":"normal","cmc":1,"power":"0","toughness":"3","loyalty":null,"keywords":["Defender"],"colors":["G"],"colorIdentity":["G"]},
  {"name":"Lure","type":"Enchantment — Aura","mana":"{1}{G}{G}","oracle":"Enchant creature\nAll creatures able to block enchanted creature do so.","layout":"normal","cmc":3,"power":null,"toughness":null,"loyalty":null,"keywords":["Enchant"],"colors":["G"],"colorIdentity":["G"]},
  {"name":"Iymrith, Desert Doom","type":"Legendary Creature — Dragon","mana":"{3}{U}{U}","oracle":"Flying\nIymrith has ward {4} as long as it's untapped.\nWhenever Iymrith deals combat damage to a player, draw a card. Then if you have fewer than three cards in hand, draw cards equal to the difference.","layout":"normal","cmc":5,"power":"5","toughness":"5","loyalty":null,"keywords":["Flying"],"colors":["U"],"colorIdentity":["U"]},
  {"name":"Prowler's Helm","type":"Artifact — Equipment","mana":"{2}","oracle":"Equipped creature can't be blocked except by Walls.\nEquip {2}","layout":"normal","cmc":2,"power":null,"toughness":null,"loyalty":null,"keywords":["Equip"],"colors":[],"colorIdentity":[]},
  {"name":"Gaseous Form","type":"Enchantment — Aura","mana":"{2}{U}","oracle":"Enchant creature\nPrevent all combat damage that would be dealt to and dealt by enchanted creature.","layout":"normal","cmc":3,"power":null,"toughness":null,"loyalty":null,"keywords":["Enchant"],"colors":["U"],"colorIdentity":["U"]},
  {"name":"Thalia, Guardian of Thraben","type":"Legendary Creature — Human Soldier","mana":"{1}{W}","oracle":"First strike\nNoncreature spells cost {1} more to cast.","layout":"normal","cmc":2,"power":"2","toughness":"1","loyalty":null,"keywords":["First strike"],"colors":["W"],"colorIdentity":["W"]},
  {"name":"Baral, Chief of Compliance","type":"Legendary Creature — Human Wizard","mana":"{1}{U}","oracle":"Instant and sorcery spells you cast cost {1} less to cast.\nWhenever a spell or ability you control counters a spell, you may draw a card. If you do, discard a card.","layout":"normal","cmc":2,"power":"1","toughness":"3","loyalty":null,"keywords":[],"colors":["U"],"colorIdentity":["U"]},
  {"name":"Craw Giant","type":"Creature — Giant","mana":"{3}{G}{G}{G}{G}","oracle":"Trample\nRampage 2 (Whenever this creature becomes blocked, it gets +2/+2 until end of turn for each creature blocking it beyond the first.)","layout":"normal","cmc":7,"power":"6","toughness":"4","loyalty":null,"keywords":["Trample","Rampage"],"colors":["G"],"colorIdentity":["G"]},
  {"name":"Gorgon Recluse","type":"Creature — Gorgon","mana":"{3}{B}{B}","oracle":"Whenever this creature blocks or becomes blocked by a nonblack creature, destroy that creature at end of combat.\nMadness {B}{B} (If you discard this card, discard it into exile. When you do, cast it for its madness cost or put it into your graveyard.)","layout":"normal","cmc":5,"power":"2","toughness":"4","loyalty":null,"keywords":["Madness"],"colors":["B"],"colorIdentity":["B"]},
  {"name":"Ashmouth Hound","type":"Creature — Elemental Dog","mana":"{1}{R}","oracle":"Whenever this creature blocks or becomes blocked by a creature, this creature deals 1 damage to that creature.","layout":"normal","cmc":2,"power":"2","toughness":"1","loyalty":null,"keywords":[],"colors":["R"],"colorIdentity":["R"]},
  {"name":"Elvish Berserker","type":"Creature — Elf Berserker","mana":"{G}","oracle":"Whenever this creature becomes blocked, it gets +1/+1 until end of turn for each creature blocking it.","layout":"normal","cmc":1,"power":"1","toughness":"1","loyalty":null,"keywords":[],"colors":["G"],"colorIdentity":["G"]},
  {"name":"Reliquary Tower","type":"Land","mana":"","oracle":"You have no maximum hand size.\n{T}: Add {C}.","layout":"normal","cmc":0,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":[]},
  {"name":"Thragtusk","type":"Creature — Beast","mana":"{4}{G}","oracle":"When this creature enters, you gain 5 life.\nWhen this creature leaves the battlefield, create a 3/3 green Beast creature token.","layout":"normal","cmc":5,"power":"5","toughness":"3","loyalty":null,"keywords":[],"colors":["G"],"colorIdentity":["G"]},
  {"name":"Zendikar Resurgent","type":"Enchantment","mana":"{5}{G}{G}","oracle":"Whenever you tap a land for mana, add one mana of any type that land produced. (The types of mana are white, blue, black, red, green, and colorless.)\nWhenever you cast a creature spell, draw a card.","layout":"normal","cmc":7,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["G"],"colorIdentity":["G"]},
];
const card = (name) => {
  const c = CORPUS.find((x) => x.name === name);
  if (!c) throw new Error(`not in the corpus: ${name}`);
  return c;
};

const NEUTRAL = "Probe Permanent";
const ID = "probe";
const SUP = "sup";
// The whole keyword vocabulary (the combat keywords, every grantable keyword, and the keyword-shaped words the engine reads).
const VOCAB = [...new Set([...COMBAT_KEYWORDS, ...GRANTABLE_STATIC_KEYWORDS, "changeling", "protection", "ward", "undying", "exalted",
  "flanking", "prowess", "annihilator", "toxic", "riot", "modular", "soulbond", "defender", "haste"].map((k) => String(k).toLowerCase()))];
const ABILITY_KINDS = new Set(["activate-ability", "tap-for-mana", "crew-vehicle", "double-mana-pool", "activate-loyalty"]);
const isLand = (c) => /\bLand\b/.test(String(c.type).split(" // ")[0]);
const isCreature = (c) => /\bCreature\b/.test(String(c.type).split(" // ")[0]);
const isAttachment = (c) => /\b(Aura|Equipment)\b/.test(String(c.type));

/** The no-text twin of `c`: the same characteristics, no rules text, no keywords, the given name. */
function twinOf(c, name = NEUTRAL) {
  const { card_faces: _f, ...rest } = c;
  return { ...rest, name, oracle: "", keywords: [], layout: "normal" };
}
const renamed = (c, name = NEUTRAL) => ({ ...c, name });

/**
 * THE BOARD: the user (active, main phase, priority, a deep mana pool) controls the probe permanent `pc` (id "probe") — attached to
 * its own Grizzly Bears ("sup") when it is an Aura or Equipment — plus basic lands; the opponent controls a small blocker panel and
 * lands. Every permanent is untapped, not summoning sick, with timestamps 1…N; a planeswalker probe carries its printed loyalty.
 */
function board(pc, { userExtra = [], aiExtra = [], hand = null } = {}) {
  const s0 = G.createGameState({ userDeck: [], aiDeck: [] });
  let ts = 1;
  const perm = (id, c, controller, extra = {}) => ({ ...G.createPermanent({ id, card: { ...c, id: `card-${id}` }, controller, summoningSick: false }), timestamp: ts++, enteredOnTurn: 1, ...extra });
  const probeExtra = {};
  if (pc.loyalty != null && Number.isFinite(Number(pc.loyalty))) probeExtra.counters = { loyalty: Number(pc.loyalty) };
  const user = [perm(SUP, card("Grizzly Bears"), "user"), perm(ID, pc, "user", probeExtra)];
  if (isAttachment(pc)) { user[1].attachedTo = SUP; user[0].attachments = [ID]; }
  for (const n of ["Forest", "Forest", "Plains", "Island", "Swamp", "Mountain"]) user.push(perm(`u-${user.length}`, card(n), "user"));
  for (const [id, n] of userExtra) user.push(perm(id, card(n), "user"));
  const ai = [perm("aiBear", card("Grizzly Bears"), "ai"), perm("aiFlyer", card("Ornithopter"), "ai"), perm("aiSpider", card("Giant Spider"), "ai"),
    perm("aiWall", card("Wall of Wood"), "ai"), perm("aiShadow", card("Dauthi Slayer"), "ai")];
  for (const n of ["Plains", "Island"]) ai.push(perm(`a-${ai.length}`, card(n), "ai"));
  for (const [id, n] of aiExtra) ai.push(perm(id, card(n), "ai"));
  const pool = { W: 9, U: 9, B: 9, R: 9, G: 9, C: 9 };
  const handCards = (hand ?? ["Lightning Bolt", "Grizzly Bears", "Sign in Blood", "Glorious Anthem"]).map((n, i) => ({ ...card(n), id: `hand-${i}` }));
  return {
    ...s0, turn: 3, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", timestampCounter: ts,
    players: {
      ...s0.players,
      user: { ...s0.players.user, battlefield: user, hand: handCards, manaPool: { ...s0.players.user.manaPool, ...pool }, library: [{ ...card("Forest"), id: "lib-0" }, { ...card("Plains"), id: "lib-1" }, { ...card("Grizzly Bears"), id: "lib-2" }] },
      ai: { ...s0.players.ai, battlefield: ai, hand: [{ ...card("Lightning Bolt"), id: "ai-hand-0" }], library: [{ ...card("Island"), id: "ai-lib-0" }] },
    },
  };
}
const permOf = (s, id) => Object.values(s.players).flatMap((p) => p.battlefield || []).find((p) => p.id === id);

/** Inject a fixed-mode "loses all abilities" on `ids` (a stored resolution effect, as a resolved spell makes one). */
function lose(state, ids = [ID], { exceptMana = false } = {}) {
  return L.addContinuousEffect(state, {
    layer: 6,
    op: { layerOp: "loseAllAbilities", ...(exceptMana ? { exceptMana: true } : {}) },
    affects: { mode: "fixed", permanentIds: ids },
    duration: { kind: "endOfTurn", turn: state.turn },
    source: { kind: "resolution", permanentId: null, controller: "ai" },
  }).state;
}
/** A static loss over a dynamic selector from a Humility on the opponent's side (an existing effect an entering object meets). */
function staticLoss(state, cardTypes) {
  const s1 = { ...state, players: { ...state.players, ai: { ...state.players.ai, battlefield: [...state.players.ai.battlefield, { ...G.createPermanent({ id: "hum", card: { ...card("Humility"), id: "card-hum" }, controller: "ai", summoningSick: false }), timestamp: state.timestampCounter }] } }, timestampCounter: state.timestampCounter + 1 };
  return L.addContinuousEffect(s1, {
    layer: 6,
    op: { layerOp: "loseAllAbilities" },
    affects: { mode: "dynamic", selector: { cardTypes } },
    duration: { kind: "permanent" },
    source: { kind: "static", permanentId: "hum" },
  }).state;
}

// ─── the readers (each a count of what it reads off the probe on `s`) ──────────────────────────────────────────────────────────
const fromProbe = (s, ids = [ID, SUP]) => (s.pendingTriggers || []).filter((t) => ids.includes(t.source?.permanentId)).length;
const fresh = (s) => ({ ...s, pendingTriggers: [] });
function withCombat(s, attackerIds) {
  return { ...s, phase: "combat", step: "declare-attackers", combat: { attackers: attackerIds.map((id) => ({ permanentId: id, attackingPlayer: "user", defender: "ai" })), blockers: [] } };
}
function deathOf(s, id) {
  const lk = G.deathLookback(s, permOf(s, id), "user");
  const after = G.moveCardToZone(s, { playerId: "user", fromZone: "battlefield", toZone: "graveyard", cardId: id });
  return { lk, after };
}

const READERS = [
  // ── triggered abilities (triggers.js: liveTriggerCard — the 30 trigger scans; the look-back stamp) ──
  ["triggers: it enters (checkEnterTriggers)", (s) => fromProbe(T.checkEnterTriggers(fresh(s), permOf(s, ID)), [ID])],
  ["triggers: another creature enters", (s) => {
    const x = { ...G.createPermanent({ id: "x-in", card: { ...card("Grizzly Bears"), id: "card-x-in" }, controller: "user", summoningSick: true }), timestamp: s.timestampCounter };
    const sx = fresh({ ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [...s.players.user.battlefield, x] } } });
    return fromProbe(T.checkEnterTriggers(sx, x)) + fromProbe(T.checkPermanentEntersTriggers(sx, x));
  }],
  ["triggers: it dies (deathLookback → checkDiesTriggers — CR 603.10a)", (s) => { const { lk, after } = deathOf(s, ID); return fromProbe(T.checkDiesTriggers(fresh(after), [lk]), [ID]); }],
  ["triggers: another creature dies", (s) => { const { lk, after } = deathOf(s, SUP); return fromProbe(T.checkDiesTriggers(fresh(after), [lk]), [ID]); }],
  ["triggers: a spell is cast (checkCastTriggers)", (s) => ["Lightning Bolt", "Glorious Anthem", "Sign in Blood"].reduce((n, sp) => n + fromProbe(T.checkCastTriggers(fresh(s), { spellCard: { ...card(sp), id: `cast-${sp}` }, casterId: "user" })), 0)],
  ["triggers: the upkeep (checkStepTriggers)", (s) => fromProbe(T.checkStepTriggers(fresh({ ...s, phase: "beginning", step: "upkeep" }), "upkeep"))],
  ["triggers: a permanent is sacrificed (checkSacrificeTriggers)", (s) => {
    const after = G.moveCardToZone(s, { playerId: "user", fromZone: "battlefield", toZone: "graveyard", cardId: SUP });
    return fromProbe(T.checkSacrificeTriggers(fresh(after), "user", { id: SUP, controller: "user", card: permOf(s, SUP).card, lkiTypes: ["Creature"] }), [ID]);
  }],
  ["triggers: creatures attack (checkAttackTriggers)", (s) => fromProbe(T.checkAttackTriggers(fresh(withCombat(s, isCreature(permOf(s, ID).card) ? [ID, SUP] : [SUP]))))],
  ["triggers: it blocks or becomes blocked (checkBlockTriggers — rampage, the per-blocker pump, contact damage, basilisk touch)", (s) => {
    if (!isCreature(permOf(s, ID).card)) return 0;
    const attacked = { ...s, phase: "combat", step: "declare-blockers", combat: { attackers: [{ permanentId: ID, attackingPlayer: "user", defender: "ai" }], blockers: [{ blockerId: "aiBear", attackerId: ID }, { blockerId: "aiWall", attackerId: ID }] } };
    const blocking = { ...s, activePlayer: "ai", phase: "combat", step: "declare-blockers", combat: { attackers: [{ permanentId: "aiFlyer", attackingPlayer: "ai", defender: "user" }], blockers: [{ blockerId: ID, attackerId: "aiFlyer" }] } };
    return fromProbe(T.checkBlockTriggers(fresh(attacked)), [ID]) + fromProbe(T.checkBlockTriggers(fresh(blocking)), [ID]);
  }],
  ["triggers: its controller gains life (checkLifegainTriggers)", (s) => fromProbe(T.checkLifegainTriggers(fresh(s), "user", 1))],
  ["triggers: combat damage to a player (checkCombatDamageTriggers)", (s) => {
    const ids = isCreature(permOf(s, ID).card) ? [ID, SUP] : [SUP];
    return fromProbe(T.checkCombatDamageTriggers(fresh(withCombat(s, ids)), ids.map((id) => ({ kind: "combat-damage-player", attackerId: id, attackingPlayer: "user", defender: "ai", amount: 1 }))));
  }],
  ["triggers: annihilator (applyAnnihilatorTriggers)", (s) => {
    if (!isCreature(permOf(s, ID).card)) return 0;
    const sc = withCombat(s, [ID]);
    return AN.applyAnnihilatorTriggers(sc) === sc ? 0 : 1;
  }],
  ["triggers: soulbond pairs as a creature enters (resolvers.enterPermanent)", (s) => {
    const next = RS.enterPermanent(s, { ...card("Grizzly Bears"), id: "card-pair" }, "user");
    return permOf(next, ID)?.soulbondPartner ? 1 : 0;
  }],
  // ── activated abilities and mana (legalChoices: actionsActivateAbility, crew, the double-mana pool, loyalty, grantedActivatedForHost;
  //    manaModel: manaCardOf / manaSources) ──
  ["activated: legal actions sourced from it (legalActionsForPlayer)", (s) => LC.legalActionsForPlayer(s, "user").filter((a) => ABILITY_KINDS.has(a.kind) && [ID, SUP].includes(a.permanentId ?? a.vehicleId)).length],
  ["mana: its mana sources (manaSources)", (s) => M.manaSources(s, "user").filter((m) => m.permanentId === ID).length],
  // ── keywords, protection, ward, indestructible (layers seeds — S0a; ward.js; gameState.isIndestructible's look-back fallback) ──
  ["keywords: permanentHasKeyword over the vocabulary", (s) => VOCAB.filter((k) => L.permanentHasKeyword(s, ID, k)).length],
  ["protection: colours and classes", (s) => L.permanentProtectionColors(s, ID).size + L.permanentProtectionClasses(s, ID).size],
  ["ward: an opponent's spell targeting it (wardTaxForStackObject)", (s) => (W.wardTaxForStackObject(s, { controller: "ai", targets: [{ type: "creature", id: ID }], source: { ...card("Lightning Bolt") } }) ? 1 : 0)],
  ["indestructible: live and as it last existed (isIndestructible)", (s) => (G.isIndestructible(permOf(s, ID), s) ? 1 : 0) + (G.isIndestructible(deathOf(s, ID).lk, null) ? 1 : 0)],
  // ── the collection (layers — S0a's filter, read here as a census row) ──
  ["statics: collected effects at layer 6+ sourced from it", (s) => L.collectContinuousEffects(s).filter((e) => e.source?.kind === "static" && e.source.permanentId === ID && !(e.layer >= 1 && e.layer <= 5)).length],
];

// ── the readers whose answer has no "empty" of its own: run against the board with the no-text twin in its place (same name) ──
// The creature the probe's combat text is about: the probe itself, or — an Aura or Equipment — the creature it is attached to.
const combatSubject = (s) => { const p = permOf(s, ID); return isCreature(p.card) ? ID : isAttachment(p.card) ? SUP : null; };
function combatReadout(s) {
  const subj = combatSubject(s);
  if (!subj) return null;
  const p = permOf(s, subj);
  const blockers = ["aiBear", "aiFlyer", "aiSpider", "aiWall", "aiShadow"];
  return {
    // canBlockAttacker (CR 509.1b, 702.9b): it attacking each panel blocker, and blocking each panel creature attacking
    attacks: blockers.map((b) => CE.canBlockAttacker(s, b, subj, "ai")),
    blocks: blockers.map((a) => CE.canBlockAttacker(s, subj, a, "user")),
    minBlockers: CE.attackerMinBlockers(s, subj),
    maxBlocks: CE.maxBlocksFor(s, p, "user"),
    cantAttack: CE.selfCantAttackNow(s, p),
    cantBlock: CE.selfCantBlockNow(s, p),
    mustAttack: AR.mustAttackNow(s, "user", p),
  };
}
function damageReadout(s) {
  const subj = combatSubject(s);
  if (!subj) return null;
  // it attacks unblocked: the opponent's life and poison (toxic — CR 702.164a), the attacker's controller's life
  const hit = CR.resolveCombatDamage({ ...s, phase: "combat", step: "combat-damage", combat: { attackers: [{ permanentId: subj, attackingPlayer: "user", defender: "ai" }], blockers: [] } });
  // the opponent's Grizzly Bears attacks and it blocks: the damage it takes and deals (its own prevention walls — CR 615)
  const blockState = { ...s, activePlayer: "ai", phase: "combat", step: "combat-damage", combat: { attackers: [{ permanentId: "aiBear", attackingPlayer: "ai", defender: "user" }], blockers: [{ blockerId: subj, attackerId: "aiBear" }] } };
  const blk = CR.resolveCombatDamage(blockState);
  const pr = permOf(blk, subj);
  return { aiLife: hit.players.ai.life, aiPoison: hit.players.ai.poison ?? hit.players.ai.poisonCounters ?? 0, userLife: hit.players.user.life,
    probeDamage: pr?.damageMarked ?? null, probeCounters: pr?.counters ?? null, bearDamage: permOf(blk, "aiBear")?.damageMarked ?? null };
}
function scannerReadout(s) {
  const sp = (n) => ({ ...card(n), id: `spell-${n}` });
  return {
    landDrops: [SAP.landDropAllowance(s, "user"), SAP.landDropAllowance(s, "ai")],
    noncreatureLock: [SAP.castNoncreatureLockFor?.(s, "user") ?? null, SAP.castNoncreatureLockFor?.(s, "ai") ?? null],
    hasteForAbilities: [SAP.abilitiesAsThoughHasteFor?.(s, "user") ?? null],
    playFromTop: [SAP.playFromTopPermission(s, "user")],
    landFromGraveyard: [SAP.playLandFromGraveyardPermission?.(s, "user") ?? null],
    boastTwice: [SAP.boastTwiceFor?.(s, "user") ?? null],
    escape: [SAP.escapeGrantsFor(s, "user")],
    artifactLock: SAP.artifactActivationsLocked(s),
    imposition: [SAP.impositionEntersTapped(s, sp("Grizzly Bears"), "ai"), SAP.impositionEntersTapped(s, sp("Forest"), "ai")],
    combatCap: [SAP.combatCapFor(s, "attack"), SAP.combatCapFor(s, "block")],
    defenderCap: [SAP.defenderAttackCapFor(s, "user")],
    uncounterable: [SAP.stackSpellIsUncounterable(s, { controller: "user", source: sp("Grizzly Bears") }), SAP.stackSpellIsUncounterable(s, { controller: "user", source: sp("Lightning Bolt") })],
    drawStep: [TN.skipsDrawStep(s, "user")], extraTurn: [TN.extraTurnSkipped(s, "ai")], wubrg: [TN.grantsWubrgAltCost(s, "user")],
    silencer: TN.entersSilencer(s),
    attackTax: [AT.attackTaxDetail(s, "user")],
    damageReplacements: DR.collectDamageReplacements(s).map((r) => r.permanentId),
    unpreventable: DR.combatDamageUnpreventable(s),
    counterDoubling: [RE.applyCounterDoubling(s, "user", "+1/+1", 1, SUP, ["creature"])],
    manaMult: [RE.manaMultiplier(s, "user")],
    graveyardExile: [G.graveyardExileFor(s, sp("Grizzly Bears"), "ai"), G.graveyardExileFor(s, sp("Grizzly Bears"), "user")],
    lifeFloor: G.loseLife(s, { playerId: "user", amount: 99 }).players.user.life,
    untap: (() => { const tapped = { ...s, players: Object.fromEntries(Object.entries(s.players).map(([pid, p]) => [pid, { ...p, battlefield: p.battlefield.map((x) => ({ ...x, tapped: true })) }])) }; const u = G.untapAll(tapped, { playerId: "user" }); const sb = SU.applySeedbornUntap(u, "ai"); return [u.players.user.battlefield.filter((x) => x.tapped).map((x) => x.id), sb.players.user.battlefield.filter((x) => x.tapped).map((x) => x.id)]; })(),
    exileOnDeath: [G.diesExiledInstead(s, permOf(s, "aiBear")), G.diesExiledInstead(s, permOf(s, SUP))],
    // the mana pools emptying (gameEngine.emptyManaPools — Horizon Stone's "that mana becomes colorless instead", cardEffects' REGISTRY)
    emptied: GE.emptyManaPools(s).players.user.manaPool,
    // every mana source the user has (manaModel.manaSources — the tap augments a carrier gives the lands: Zendikar Resurgent)
    userMana: M.manaSources(s, "user"),
    // the cleanup discard (gameEngine.cleanupDiscardExcess — Reliquary Tower's "no maximum hand size"), with nine cards in hand
    handExcess: GE.cleanupDiscardExcess({ ...s, players: { ...s.players, user: { ...s.players.user, hand: Array.from({ length: 9 }, (_, i) => ({ ...card("Grizzly Bears"), id: `nine-${i}` })) } } }, "user"),
  };
}
function entryReadout(state, entering, { xValue = 3, kicked = true, colorsSpent = 2 } = {}) {
  const base = { ...G.createPermanent({ id: "entering", card: { ...entering, id: "card-entering" }, controller: "user", summoningSick: true }), timestamp: state.timestampCounter };
  const { perm, settle } = ER.applyEnterReplacements(state, base, { xValue, kicked, timesKicked: kicked ? 1 : 0, colorsSpent, castFromZone: "hand" });
  return { tapped: !!perm.tapped, counters: perm.counters || {}, chosenType: perm.chosenType ?? null, chosenColor: perm.chosenColor ?? null,
    chosenCardType: perm.chosenCardType ?? null, kickedKeywords: perm.kickedKeywords ?? null, tributePaid: perm.tributePaid ?? null, settle };
}
function landDropReadout(state, land) {
  const s = { ...state, players: { ...state.players, user: { ...state.players.user, hand: [{ ...land, id: "drop-land" }], landsPlayedThisTurn: 0 } } };
  const act = LC.legalActionsForPlayer(s, "user").find((a) => a.kind === "play-land" && a.cardId === "drop-land");
  if (!act) return { offered: false };
  const next = AD.dispatchAction(s, act);
  const ns = next?.state ?? next;
  const entered = (ns.players.user.battlefield || []).find((p) => p.card?.id === "drop-land" || p.printedCard?.id === "drop-land");
  return { offered: true, tapped: !!entered?.tapped, chosenType: entered?.chosenType ?? null, chosenColor: entered?.chosenColor ?? null, counters: entered?.counters || {}, pause: !!ns.pendingChoice };
}

const TWIN_READERS = [
  ["combat text: block legality, min / max blockers, can't attack / block, must attack (combatEvasion, attackRequirements)", combatReadout],
  ["combat damage: unblocked and blocking — toxic, prevention walls, assigned damage (combatResolution)", damageReadout],
  ["board scanners: statics, text scans, replacements, untap, graveyard and death replacements", scannerReadout],
];

const census = [];
const NAMES = CORPUS.map((c) => c.name).filter((n) => !["Humility"].includes(n));

describe("THE CENSUS — every reader reads nothing off a permanent that lost all its abilities (§5.1, §5.2)", () => {
  for (const [label, read] of READERS) {
    it(label, () => {
      const carriers = [];
      const leaks = [];
      for (const n of NAMES) {
        const s = board(card(n));
        const printed = read(s);
        if (!(printed > 0)) continue;
        carriers.push(n);
        const lost = read(lose(s));
        if (lost !== 0) leaks.push(`${n}: ${lost}`);
      }
      census.push([label, carriers.length, carriers.slice(0, 6).join(", ")]);
      expect(carriers.length, `no carrier reaches "${label}"`).toBeGreaterThan(0);
      expect(leaks).toEqual([]);
    });
  }
  for (const [label, read] of TWIN_READERS) {
    it(label, () => {
      const carriers = [];
      const leaks = [];
      for (const n of NAMES) {
        const c = card(n);
        const printed = JSON.stringify(read(board(c)));
        const twin = JSON.stringify(read(lose(board(twinOf(c, n)))));
        if (printed === JSON.stringify(read(board(twinOf(c, n))))) continue; // R reads nothing off the printed card: not a carrier
        carriers.push(n);
        const lost = JSON.stringify(read(lose(board(c))));
        if (lost !== twin) leaks.push(`${n}: ${lost} ≠ ${twin}`);
      }
      census.push([label, carriers.length, carriers.slice(0, 6).join(", ")]);
      expect(carriers.length, `no carrier reaches "${label}"`).toBeGreaterThan(0);
      expect(leaks).toEqual([]);
    });
  }
  it("entry: its own replacement abilities as it enters under a static loss (applyEnterReplacements, CR 614.12, 603.6b)", () => {
    const carriers = [];
    const leaks = [];
    for (const n of NAMES) {
      const c = card(n);
      if (!isCreature(c) && !isLand(c)) continue;
      const types = isCreature(c) ? ["Creature"] : ["Land"];
      const clean = board(card("Grizzly Bears"));
      if (JSON.stringify(entryReadout(clean, c)) === JSON.stringify(entryReadout(clean, twinOf(c, n)))) continue;
      carriers.push(n);
      const lossy = staticLoss(clean, types);
      const got = JSON.stringify(entryReadout(lossy, c));
      const want = JSON.stringify(entryReadout(lossy, twinOf(c, n)));
      if (got !== want) leaks.push(`${n}: ${got} ≠ ${want}`);
    }
    census.push(["entry: applyEnterReplacements under a static loss", carriers.length, carriers.slice(0, 6).join(", ")]);
    expect(carriers.length).toBeGreaterThan(0);
    expect(leaks).toEqual([]);
  });
  it("entry: the land drop's own replacements under a static loss (dispatchAction play-land, CR 614.12)", () => {
    const carriers = [];
    const leaks = [];
    for (const n of NAMES.filter((x) => isLand(card(x)) && !/\bBasic\b/.test(card(x).type))) {
      const c = card(n);
      const clean = board(card("Grizzly Bears"));
      if (JSON.stringify(landDropReadout(clean, c)) === JSON.stringify(landDropReadout(clean, twinOf(c, n)))) continue;
      carriers.push(n);
      const lossy = staticLoss(clean, ["Land"]);
      const got = JSON.stringify(landDropReadout(lossy, c));
      const want = JSON.stringify(landDropReadout(lossy, twinOf(c, n)));
      if (got !== want) leaks.push(`${n}: ${got} ≠ ${want}`);
    }
    census.push(["entry: the land drop under a static loss", carriers.length, carriers.slice(0, 6).join(", ")]);
    expect(carriers.length).toBeGreaterThan(0);
    expect(leaks).toEqual([]);
  });
  it("the census table (reported; every row above asserted)", () => {
    console.log(["CENSUS — reader | carriers | first carriers", ...census.map((r) => r.join(" | "))].join("\n"));
    expect(census.length).toBeGreaterThan(0);
  });
});

describe("THE VANILLA-TWIN DIFFERENTIAL, under a neutral name (§5.3)", () => {
  const mainList = (s) => JSON.stringify(LC.legalActionsForPlayer(s, "user"));
  const attackList = (s) => JSON.stringify(LC.legalActionsForPlayer({ ...s, phase: "combat", step: "declare-attackers", combat: { attackers: [], blockers: [] } }, "user"));
  it("whole legal-action lists (main phase and declare attackers) and block matrices equal a no-text twin's", () => {
    const leaks = [];
    let differs = 0;
    for (const n of NAMES) {
      const c = card(n);
      const lostBoard = lose(board(renamed(c)));
      const twinBoard = lose(board(twinOf(c)));
      // a carrier: the printed card under the neutral name reads differently from its twin
      if (mainList(board(renamed(c))) !== mainList(board(twinOf(c))) || attackList(board(renamed(c))) !== attackList(board(twinOf(c)))
        || JSON.stringify(combatReadout(board(renamed(c)))) !== JSON.stringify(combatReadout(board(twinOf(c))))) differs++;
      if (mainList(lostBoard) !== mainList(twinBoard)) leaks.push(`${n}: main phase`);
      if (attackList(lostBoard) !== attackList(twinBoard)) leaks.push(`${n}: declare attackers`);
      if (JSON.stringify(combatReadout(lostBoard)) !== JSON.stringify(combatReadout(twinBoard))) leaks.push(`${n}: block matrix`);
    }
    expect(differs).toBeGreaterThan(20); // the printed text reaches these lists on most of the corpus: the differential has power
    expect(leaks).toEqual([]);
  });
});

describe("GRANT TIMING through the routed readers (§5.4 — CR 613.7, 613.7c, 613.7e)", () => {
  // the host (sup) carries the attachment; the loss is on the HOST
  function equipped(name, attachAfter) {
    let s = board(card("Grizzly Bears"), { userExtra: [["att", name]] });
    if (!attachAfter) s = G.attachPermanent(s, { equipId: "att", targetId: SUP });
    s = lose(s, [SUP]);
    if (attachAfter) s = G.attachPermanent(s, { equipId: "att", targetId: SUP });
    return s;
  }
  const supActivations = (s) => LC.legalActionsForPlayer(s, "user").filter((a) => a.kind === "activate-ability" && a.permanentId === SUP && !a.isEquipAbility).length;
  const supCombatDamageTriggers = (s) => fromProbe(T.checkCombatDamageTriggers(fresh(withCombat(s, [SUP])), [{ kind: "combat-damage-player", attackerId: SUP, attackingPlayer: "user", defender: "ai", amount: 1 }]), [SUP]);
  it("an Equipment's granted activated ability (Viridian Longbow): attached before the loss — cut; attached after — kept", () => {
    expect(supActivations(equipped("Viridian Longbow", false))).toBe(0);
    expect(supActivations(equipped("Viridian Longbow", true))).toBeGreaterThan(0);
  });
  it("an Aura's granted activated ability (Quicksilver Dagger): before — cut; after — kept", () => {
    expect(supActivations(equipped("Quicksilver Dagger", false))).toBe(0);
    expect(supActivations(equipped("Quicksilver Dagger", true))).toBeGreaterThan(0);
  });
  it("an Aura's granted triggered ability (Sixth Sense): before — cut; after — kept", () => {
    expect(supCombatDamageTriggers(equipped("Sixth Sense", false))).toBe(0);
    expect(supCombatDamageTriggers(equipped("Sixth Sense", true))).toBeGreaterThan(0);
  });
  it("a flying counter: put on before the loss — no flying at the block; put on after — flying (canBlockAttacker)", () => {
    const before = lose(G.addCounter(board(card("Grizzly Bears")), { permanentId: ID, type: "flying", amount: 1 }));
    const after = G.addCounter(lose(board(card("Grizzly Bears"))), { permanentId: ID, type: "flying", amount: 1 });
    expect(CE.canBlockAttacker(before, "aiBear", ID, "ai")).toBe(true);
    expect(CE.canBlockAttacker(after, "aiBear", ID, "ai")).toBe(false);
  });
  it("a same-effect grant (grantedWith the loss) is kept: indestructible, and a granted mana ability", () => {
    let s = lose(board(card("Grizzly Bears")));
    const lossId = s.continuousEffects[s.continuousEffects.length - 1].id;
    s = L.addContinuousEffect(s, { layer: 6, op: { layerOp: "addKeyword", keyword: "Indestructible" }, affects: { mode: "fixed", permanentIds: [ID] }, duration: { kind: "endOfTurn", turn: s.turn }, source: { kind: "resolution", permanentId: null, controller: "ai" }, grantedWith: lossId, timestamp: s.continuousEffects[s.continuousEffects.length - 1].timestamp }).state;
    expect(G.isIndestructible(permOf(s, ID), s)).toBe(true);
    // and a grant at the loss's timestamp WITHOUT the sibling marker is cut
    let t = lose(board(card("Grizzly Bears")));
    const ts = t.continuousEffects[t.continuousEffects.length - 1].timestamp;
    t = L.addContinuousEffect(t, { layer: 6, op: { layerOp: "addKeyword", keyword: "Indestructible" }, affects: { mode: "fixed", permanentIds: [ID] }, duration: { kind: "endOfTurn", turn: t.turn }, source: { kind: "resolution", permanentId: null, controller: "ai" }, timestamp: ts }).state;
    expect(G.isIndestructible(permOf(t, ID), t)).toBe(false);
  });
});

describe("THE LOOK-BACK (CR 603.10a — the S0a review's F5)", () => {
  const FEIGN = "When this creature dies, return it to the battlefield tapped under its owner's control.";
  const grant = (s) => L.addContinuousEffect(s, { layer: 6, op: { layerOp: "addAbility", grant: { kind: "triggered", quoted: FEIGN } }, affects: { mode: "fixed", permanentIds: [ID] }, duration: { kind: "endOfTurn", turn: s.turn }, source: { kind: "resolution", permanentId: null, controller: "user" } }).state;
  const diesTriggers = (s) => { const { lk, after } = deathOf(s, ID); return fromProbe(T.checkDiesTriggers(fresh(after), [lk]), [ID]); };
  it("a granted dies trigger made BEFORE the loss does not fire as it dies; one made AFTER does", () => {
    expect(diesTriggers(grant(board(card("Grizzly Bears"))))).toBeGreaterThan(0); // control: the grant fires on a loss-free board
    expect(diesTriggers(lose(grant(board(card("Grizzly Bears")))))).toBe(0);
    expect(diesTriggers(grant(lose(board(card("Grizzly Bears")))))).toBeGreaterThan(0);
  });
  it("its own dies and leave triggers do not fire (Doomed Traveler, Young Wolf's undying, Zulaport Cutthroat)", () => {
    for (const n of ["Doomed Traveler", "Young Wolf", "Zulaport Cutthroat"]) {
      expect(diesTriggers(board(card(n))), n).toBeGreaterThan(0);
      expect(diesTriggers(lose(board(card(n)))), n).toBe(0);
    }
  });
  it("Rivaz's granted \"When this creature dies, exile it\" is removed by a loss (CR 400.7a, 613.7 — the grant is always the older)", () => {
    const granted = (s) => ({ ...s, players: { ...s.players, user: { ...s.players.user, battlefield: s.players.user.battlefield.map((p) => (p.id === ID ? { ...p, grantDiesExile: true } : p)) } } });
    expect(G.deathLookback(granted(board(card("Grizzly Bears"))), permOf(granted(board(card("Grizzly Bears"))), ID), "user").diesExileAfter).toBe(true); // control
    const lost = lose(granted(board(card("Grizzly Bears"))));
    expect(G.deathLookback(lost, permOf(lost, ID), "user").diesExileAfter).toBe(false);
  });
  it("its own shuffle-instead replacement is gone as it leaves (Progenitus goes to the graveyard)", () => {
    const s = lose(board(card("Progenitus")));
    const after = G.moveCardToZone(s, { playerId: "user", fromZone: "battlefield", toZone: "graveyard", cardId: ID });
    expect(after.players.user.graveyard.some((c) => c.id === `card-${ID}`)).toBe(true);
    const clean = G.moveCardToZone(board(card("Progenitus")), { playerId: "user", fromZone: "battlefield", toZone: "graveyard", cardId: ID });
    expect(clean.players.user.graveyard.some((c) => c.id === `card-${ID}`)).toBe(false); // control: printed, it shuffles away
  });
});

describe("THE COPY-AWARE KEYWORD SEED (the S0a found-not-fixed (2) — CR 613.1a, 707.2)", () => {
  it("a permanent that became a copy of Serra Angel has flying at the keyword seed; one that became a copy of Grizzly Bears has none", () => {
    const copyOf = (s, c) => L.addContinuousEffect(s, { layer: 1, op: "copy", copiableCard: { ...c, id: "copied" }, affects: { mode: "self", permanentId: ID }, duration: { kind: "endOfTurn", turn: s.turn }, source: { kind: "resolution", permanentId: ID } }).state;
    const bears = copyOf(board(card("Grizzly Bears")), card("Serra Angel"));
    expect(L.permanentHasKeyword(bears, ID, "Flying")).toBe(true);
    expect(CE.canBlockAttacker(bears, "aiBear", ID, "ai")).toBe(false);
    const angel = copyOf(board(card("Serra Angel")), card("Grizzly Bears"));
    expect(L.permanentHasKeyword(angel, ID, "Flying")).toBe(false);
  });
});

/**
 * textReadsOnce.test.js — the self-play hot reads, computed once (2026-11-01). Self-play spent about 1.4 times as much CPU per
 * decision on v0.169.0 as on 86389b97; a profile put the new time in five reads that recomputed the same answer on every call:
 *   · faceUp.faceUpView — the face that is up, re-read off each card's layout and type line ~1,000 times per decision;
 *   · keywords.hasKeyword — the band search and the keyword pattern over the whole rules text, ~750,000 scans a game;
 *   · combatEvasion.teamPowerBlockGateOf — Champion of Lambholt's sentence scan, for every permanent of the attacker's
 *     controller, for every blocker of every attacker;
 *   · layers' card-type and subtype split of the type line, for every permanent of every game state;
 *   · protection.parseProtectionColors / parseProtectionClasses, at every block, targeting and attachment check.
 * Each now reads once per text (a string-keyed, bounded memo) or once per card object (faceUpView — which face is up is fixed
 * for an object: no engine code writes a card's layout or type line in place).
 *
 * THE WITNESS: every changed read is run beside 35198906's code — copied verbatim below as the reference — over a sample of the
 * bundled corpus (real cards via cardIndex.publicCard → learnDeckEnrich.mergeCardData, generated, never typed: the 25 most played,
 * the most played card naming each keyword, the most played of each multi-face layout, and the cards each path was written
 * for — double-faced cards whose back face carries keywords and statics, levelers, Champion of Lambholt and its corpus siblings,
 * every protection shape), every transform and modal double-faced card in both card shapes, and asserts the same answer, cold and
 * warm. Then the invalidation side: the same card on a changed board answers the new board, an edited text is a new key, and
 * every caller still owns what it is handed.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { faceUpView, faceUpTypeLine, frontFaceColors } from "./faceUp.js";
import { parseFaceBlock } from "./splitCard.js";
import { hasKeyword, printedKeywordsOf, COMBAT_KEYWORDS } from "./keywords.js";
import { deriveCharacteristics, permanentTypes, permanentHasKeyword, permanentProtectionColors } from "./layers.js";
import { parseProtectionColors, parseProtectionClasses } from "./protection.js";
import { canBlockAttacker, teamPowerBlockGateOf } from "./combatEvasion.js";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

// ─── the corpus sample (bundled Scryfall data — generated, never typed) ────────────────────────────────────────────────────────
// 136 cards: 121 names, 15 multi-face cards in both shapes
const CORPUS = [
  {"name":"Champion of Lambholt","type":"Creature — Human Warrior","mana":"{1}{G}{G}","oracle":"Creatures with power less than this creature's power can't block creatures you control.\nWhenever another creature you control enters, put a +1/+1 counter on this creature.","layout":"normal","cmc":3,"power":"1","toughness":"1","loyalty":null,"keywords":[],"colors":["G"],"colorIdentity":["G"]}, // targeted
  {"name":"Wandering Wolf","type":"Creature — Wolf","mana":"{1}{G}","oracle":"Creatures with power less than this creature's power can't block it.","layout":"normal","cmc":2,"power":"2","toughness":"1","loyalty":null,"keywords":[],"colors":["G"],"colorIdentity":["G"]}, // targeted
  {"name":"Silumgar Assassin","type":"Creature — Human Assassin","mana":"{1}{B}","oracle":"Creatures with power greater than this creature's power can't block it.\nMegamorph {2}{B} (You may cast this card face down as a 2/2 creature for {3}. Turn it face up any time for its megamorph cost and put a +1/+1 counter on it.)\nWhen this creature is turned face up, destroy target creature with power 3 or less an opponent controls.","layout":"normal","cmc":2,"power":"2","toughness":"1","loyalty":null,"keywords":["Megamorph"],"colors":["B"],"colorIdentity":["B"]}, // targeted
  {"name":"Bower Passage","type":"Enchantment","mana":"{1}{G}","oracle":"Creatures with flying can't block creatures you control.","layout":"normal","cmc":2,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["G"],"colorIdentity":["G"]}, // targeted
  {"name":"Kraken of the Straits","type":"Creature — Kraken","mana":"{5}{U}{U}","oracle":"Creatures with power less than the number of Islands you control can't block this creature.","layout":"normal","cmc":7,"power":"6","toughness":"6","loyalty":null,"keywords":[],"colors":["U"],"colorIdentity":["U"]}, // targeted
  {"name":"Westvale Abbey // Ormendahl, Profane Prince","type":"Land // Legendary Creature — Demon","mana":"","oracle":"Westvale Abbey - Land \n{T}: Add {C}.\n{5}, {T}, Pay 1 life: Create a 1/1 white and black Human Cleric creature token.\n{5}, {T}, Sacrifice five creatures: Transform this land, then untap it.\n//\nOrmendahl, Profane Prince - Legendary Creature — Demon \nFlying, lifelink, indestructible, haste","layout":"transform","cmc":0,"power":null,"toughness":null,"loyalty":null,"keywords":["Flying","Lifelink","Indestructible","Transform","Haste"],"colors":[],"colorIdentity":["B"],"card_faces":[{"name":"Westvale Abbey","mana_cost":"","colors":[]},{"name":"Ormendahl, Profane Prince","mana_cost":"","colors":["B"]}]}, // targeted (with card_faces: name, mana_cost, colors)
  {"name":"Delver of Secrets // Insectile Aberration","type":"Creature — Human Wizard // Creature — Human Insect","mana":"{U}","oracle":"Delver of Secrets - Creature — Human Wizard {U}\nAt the beginning of your upkeep, look at the top card of your library. You may reveal that card. If an instant or sorcery card is revealed this way, transform this creature.\n//\nInsectile Aberration - Creature — Human Insect \nFlying","layout":"transform","cmc":1,"power":"1","toughness":"1","loyalty":null,"keywords":["Flying","Transform"],"colors":[],"colorIdentity":["U"],"card_faces":[{"name":"Delver of Secrets","mana_cost":"{U}","colors":["U"]},{"name":"Insectile Aberration","mana_cost":"","colors":["U"]}]}, // targeted (with card_faces: name, mana_cost, colors)
  {"name":"Lunarch Veteran // Luminous Phantom","type":"Creature — Human Cleric // Creature — Spirit Cleric","mana":"{W}","oracle":"Lunarch Veteran - Creature — Human Cleric {W}\nWhenever another creature you control enters, you gain 1 life.\nDisturb {1}{W} (You may cast this card from your graveyard transformed for its disturb cost.)\n//\nLuminous Phantom - Creature — Spirit Cleric \nFlying\nWhenever another creature you control leaves the battlefield, you gain 1 life.\nIf Luminous Phantom would be put into a graveyard from anywhere, exile it instead.","layout":"transform","cmc":1,"power":"1","toughness":"1","loyalty":null,"keywords":["Flying","Transform","Disturb"],"colors":[],"colorIdentity":["W"],"card_faces":[{"name":"Lunarch Veteran","mana_cost":"{W}","colors":["W"]},{"name":"Luminous Phantom","mana_cost":"","colors":["W"]}]}, // targeted (with card_faces: name, mana_cost, colors)
  {"name":"Bloodline Keeper // Lord of Lineage","type":"Creature — Vampire // Creature — Vampire","mana":"{2}{B}{B}","oracle":"Bloodline Keeper - Creature — Vampire {2}{B}{B}\nFlying\n{T}: Create a 2/2 black Vampire creature token with flying.\n{B}: Transform this creature. Activate only if you control five or more Vampires.\n//\nLord of Lineage - Creature — Vampire \nFlying\nOther Vampire creatures you control get +2/+2.\n{T}: Create a 2/2 black Vampire creature token with flying.","layout":"transform","cmc":4,"power":"3","toughness":"3","loyalty":null,"keywords":["Flying","Transform"],"colors":[],"colorIdentity":["B"],"card_faces":[{"name":"Bloodline Keeper","mana_cost":"{2}{B}{B}","colors":["B"]},{"name":"Lord of Lineage","mana_cost":"","colors":["B"]}]}, // targeted (with card_faces: name, mana_cost, colors)
  {"name":"Tangleclaw Werewolf // Fibrous Entangler","type":"Creature — Werewolf Horror // Creature — Eldrazi Werewolf","mana":"{2}{G}{G}","oracle":"Tangleclaw Werewolf - Creature — Werewolf Horror {2}{G}{G}\nThis creature can block an additional creature each combat.\n{6}{G}: Transform this creature.\n//\nFibrous Entangler - Creature — Eldrazi Werewolf \nVigilance\nThis creature must be blocked if able.\nThis creature can block an additional creature each combat.","layout":"transform","cmc":4,"power":"2","toughness":"4","loyalty":null,"keywords":["Vigilance","Transform"],"colors":[],"colorIdentity":["G"],"card_faces":[{"name":"Tangleclaw Werewolf","mana_cost":"{2}{G}{G}","colors":["G"]},{"name":"Fibrous Entangler","mana_cost":"","colors":[]}]}, // targeted (with card_faces: name, mana_cost, colors)
  {"name":"Chalice of the Void","type":"Artifact","mana":"{X}{X}","oracle":"This artifact enters with X charge counters on it.\nWhenever a player casts a spell with mana value equal to the number of charge counters on this artifact, counter that spell.","layout":"normal","cmc":0,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":[]}, // targeted
  {"name":"Treasure Map // Treasure Cove","type":"Artifact // Land","mana":"{2}","oracle":"Treasure Map - Artifact {2}\n{1}, {T}: Scry 1. Put a landmark counter on this artifact. Then if there are three or more landmark counters on it, remove those counters, transform this artifact, and create three Treasure tokens. (They're artifacts with \"{T}, Sacrifice this token: Add one mana of any color.\")\n//\nTreasure Cove - Land \n(Transforms from Treasure Map.)\n{T}: Add {C}.\n{T}, Sacrifice a Treasure: Draw a card.","layout":"transform","cmc":2,"power":null,"toughness":null,"loyalty":null,"keywords":["Transform","Treasure","Scry"],"colors":[],"colorIdentity":[],"card_faces":[{"name":"Treasure Map","mana_cost":"{2}","colors":[]},{"name":"Treasure Cove","mana_cost":"","colors":[]}]}, // targeted (with card_faces: name, mana_cost, colors)
  {"name":"Valakut Awakening // Valakut Stoneforge","type":"Instant // Land","mana":"{2}{R}","oracle":"Valakut Awakening - Instant {2}{R}\nPut any number of cards from your hand on the bottom of your library, then draw that many cards plus one.\n//\nValakut Stoneforge - Land \nThis land enters tapped.\n{T}: Add {R}.","layout":"modal_dfc","cmc":3,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":["R"],"card_faces":[{"name":"Valakut Awakening","mana_cost":"{2}{R}","colors":["R"]},{"name":"Valakut Stoneforge","mana_cost":"","colors":[]}]}, // targeted (with card_faces: name, mana_cost, colors)
  {"name":"Agadeem's Awakening // Agadeem, the Undercrypt","type":"Sorcery // Land","mana":"{X}{B}{B}{B}","oracle":"Agadeem's Awakening - Sorcery {X}{B}{B}{B}\nReturn from your graveyard to the battlefield any number of target creature cards that each have a different mana value X or less.\n//\nAgadeem, the Undercrypt - Land \nAs this land enters, you may pay 3 life. If you don't, it enters tapped.\n{T}: Add {B}.","layout":"modal_dfc","cmc":3,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":["B"],"card_faces":[{"name":"Agadeem's Awakening","mana_cost":"{X}{B}{B}{B}","colors":["B"]},{"name":"Agadeem, the Undercrypt","mana_cost":"","colors":[]}]}, // targeted (with card_faces: name, mana_cost, colors)
  {"name":"Erayo, Soratami Ascendant // Erayo's Essence","type":"Legendary Creature — Moonfolk Monk // Legendary Enchantment","mana":"{1}{U}","oracle":"Erayo, Soratami Ascendant - Legendary Creature — Moonfolk Monk {1}{U}\nFlying\nWhenever the fourth spell of a turn is cast, flip Erayo.\n//\nErayo's Essence - Legendary Enchantment \nWhenever an opponent casts their first spell each turn, counter that spell.","layout":"flip","cmc":2,"power":"1","toughness":"1","loyalty":null,"keywords":["Flying"],"colors":["U"],"colorIdentity":["U"],"card_faces":[{"name":"Erayo, Soratami Ascendant","mana_cost":"{1}{U}","colors":[]},{"name":"Erayo's Essence","mana_cost":"","colors":[]}]}, // targeted (with card_faces: name, mana_cost, colors)
  {"name":"Bonecrusher Giant // Stomp","type":"Creature — Giant // Instant — Adventure","mana":"{2}{R} // {1}{R}","oracle":"Bonecrusher Giant - Creature — Giant {2}{R}\nWhenever this creature becomes the target of a spell, this creature deals 2 damage to that spell's controller.\n//\nStomp - Instant — Adventure {1}{R}\nDamage can't be prevented this turn. Stomp deals 2 damage to any target.","layout":"adventure","cmc":3,"power":"4","toughness":"3","loyalty":null,"keywords":[],"colors":["R"],"colorIdentity":["R"],"card_faces":[{"name":"Bonecrusher Giant","mana_cost":"{2}{R}","colors":[]},{"name":"Stomp","mana_cost":"{1}{R}","colors":[]}]}, // targeted (with card_faces: name, mana_cost, colors)
  {"name":"Brazen Borrower // Petty Theft","type":"Creature — Faerie Rogue // Instant — Adventure","mana":"{1}{U}{U} // {1}{U}","oracle":"Brazen Borrower - Creature — Faerie Rogue {1}{U}{U}\nFlash\nFlying\nThis creature can block only creatures with flying.\n//\nPetty Theft - Instant — Adventure {1}{U}\nReturn target nonland permanent an opponent controls to its owner's hand.","layout":"adventure","cmc":3,"power":"3","toughness":"1","loyalty":null,"keywords":["Flying","Flash"],"colors":["U"],"colorIdentity":["U"],"card_faces":[{"name":"Brazen Borrower","mana_cost":"{1}{U}{U}","colors":[]},{"name":"Petty Theft","mana_cost":"{1}{U}","colors":[]}]}, // targeted (with card_faces: name, mana_cost, colors)
  {"name":"Fire // Ice","type":"Instant // Instant","mana":"{1}{R} // {1}{U}","oracle":"Fire - Instant {1}{R}\nFire deals 2 damage divided as you choose among one or two targets.\n//\nIce - Instant {1}{U}\nTap target permanent.\nDraw a card.","layout":"split","cmc":4,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["R","U"],"colorIdentity":["R","U"],"card_faces":[{"name":"Fire","mana_cost":"{1}{R}","colors":[]},{"name":"Ice","mana_cost":"{1}{U}","colors":[]}]}, // targeted (with card_faces: name, mana_cost, colors)
  {"name":"Commit // Memory","type":"Instant // Sorcery","mana":"{3}{U} // {4}{U}{U}","oracle":"Commit - Instant {3}{U}\nPut target spell or nonland permanent into its owner's library second from the top.\n//\nMemory - Sorcery {4}{U}{U}\nAftermath (Cast this spell only from your graveyard. Then exile it.)\nEach player shuffles their hand and graveyard into their library, then draws seven cards.","layout":"split","cmc":10,"power":null,"toughness":null,"loyalty":null,"keywords":["Aftermath"],"colors":["U"],"colorIdentity":["U"],"card_faces":[{"name":"Commit","mana_cost":"{3}{U}","colors":[]},{"name":"Memory","mana_cost":"{4}{U}{U}","colors":[]}]}, // targeted (with card_faces: name, mana_cost, colors)
  {"name":"Dead // Gone","type":"Instant // Instant","mana":"{R} // {2}{R}","oracle":"Dead - Instant {R}\nDead deals 2 damage to target creature.\n//\nGone - Instant {2}{R}\nReturn target creature you don't control to its owner's hand.","layout":"split","cmc":4,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["R"],"colorIdentity":["R"],"card_faces":[{"name":"Dead","mana_cost":"{R}","colors":[]},{"name":"Gone","mana_cost":"{2}{R}","colors":[]}]}, // targeted (with card_faces: name, mana_cost, colors)
  {"name":"Student of Warfare","type":"Creature — Human Knight","mana":"{W}","oracle":"Level up {W} ({W}: Put a level counter on this. Level up only as a sorcery.)\nLEVEL 2-6\n3/3\nFirst strike\nLEVEL 7+\n4/4\nDouble strike","layout":"leveler","cmc":1,"power":"1","toughness":"1","loyalty":null,"keywords":["First strike","Level Up","Double strike"],"colors":["W"],"colorIdentity":["W"]}, // targeted
  {"name":"Brimstone Mage","type":"Creature — Human Shaman","mana":"{2}{R}","oracle":"Level up {3}{R} ({3}{R}: Put a level counter on this. Level up only as a sorcery.)\nLEVEL 1-2\n2/3\n{T}: This creature deals 1 damage to any target.\nLEVEL 3+\n2/4\n{T}: This creature deals 3 damage to any target.","layout":"leveler","cmc":3,"power":"2","toughness":"2","loyalty":null,"keywords":["Level Up"],"colors":["R"],"colorIdentity":["R"]}, // targeted
  {"name":"Kargan Dragonlord","type":"Creature — Human Warrior","mana":"{R}{R}","oracle":"Level up {R} ({R}: Put a level counter on this. Level up only as a sorcery.)\nLEVEL 4-7\n4/4\nFlying\nLEVEL 8+\n8/8\nFlying, trample\n{R}: This creature gets +1/+0 until end of turn.","layout":"leveler","cmc":2,"power":"2","toughness":"2","loyalty":null,"keywords":["Flying","Level Up","Trample"],"colors":["R"],"colorIdentity":["R"]}, // targeted
  {"name":"Joraga Treespeaker","type":"Creature — Elf Druid","mana":"{G}","oracle":"Level up {1}{G} ({1}{G}: Put a level counter on this. Level up only as a sorcery.)\nLEVEL 1-4\n1/2\n{T}: Add {G}{G}.\nLEVEL 5+\n1/4\nElves you control have \"{T}: Add {G}{G}.\"","layout":"leveler","cmc":1,"power":"1","toughness":"1","loyalty":null,"keywords":["Level Up"],"colors":["G"],"colorIdentity":["G"]}, // targeted
  {"name":"Sword of Fire and Ice","type":"Artifact — Equipment","mana":"{3}","oracle":"Equipped creature gets +2/+2 and has protection from red and from blue.\nWhenever equipped creature deals combat damage to a player, this Equipment deals 2 damage to any target and you draw a card.\nEquip {2}","layout":"normal","cmc":3,"power":null,"toughness":null,"loyalty":null,"keywords":["Equip"],"colors":[],"colorIdentity":[]}, // targeted
  {"name":"Sword of Feast and Famine","type":"Artifact — Equipment","mana":"{3}","oracle":"Equipped creature gets +2/+2 and has protection from black and from green.\nWhenever equipped creature deals combat damage to a player, that player discards a card and you untap all lands you control.\nEquip {2}","layout":"normal","cmc":3,"power":null,"toughness":null,"loyalty":null,"keywords":["Equip"],"colors":[],"colorIdentity":[]}, // targeted
  {"name":"Mother of Runes","type":"Creature — Human Cleric","mana":"{W}","oracle":"{T}: Target creature you control gains protection from the color of your choice until end of turn.","layout":"normal","cmc":1,"power":"1","toughness":"1","loyalty":null,"keywords":[],"colors":["W"],"colorIdentity":["W"]}, // targeted
  {"name":"Etched Champion","type":"Artifact Creature — Soldier","mana":"{3}","oracle":"Metalcraft — This creature has protection from each color as long as you control three or more artifacts.","layout":"normal","cmc":3,"power":"2","toughness":"2","loyalty":null,"keywords":["Metalcraft"],"colors":[],"colorIdentity":[]}, // targeted
  {"name":"Progenitus","type":"Legendary Creature — Hydra Avatar","mana":"{W}{W}{U}{U}{B}{B}{R}{R}{G}{G}","oracle":"Protection from everything\nIf Progenitus would be put into a graveyard from anywhere, reveal Progenitus and shuffle it into its owner's library instead.","layout":"normal","cmc":10,"power":"10","toughness":"10","loyalty":null,"keywords":["Protection"],"colors":["B","G","R","U","W"],"colorIdentity":["B","G","R","U","W"]}, // targeted
  {"name":"Iridescent Angel","type":"Creature — Angel","mana":"{5}{W}{U}","oracle":"Flying, protection from each color","layout":"normal","cmc":7,"power":"4","toughness":"4","loyalty":null,"keywords":["Flying","Protection"],"colors":["U","W"],"colorIdentity":["U","W"]}, // targeted
  {"name":"Mystic Crusader","type":"Creature — Human Nomad Mystic","mana":"{1}{W}{W}","oracle":"Protection from black and from red\nThreshold — As long as there are seven or more cards in your graveyard, this creature gets +1/+1 and has flying.","layout":"normal","cmc":3,"power":"2","toughness":"1","loyalty":null,"keywords":["Protection","Threshold"],"colors":["W"],"colorIdentity":["W"]}, // targeted
  {"name":"Beloved Chaplain","type":"Creature — Human Cleric","mana":"{1}{W}","oracle":"Protection from creatures","layout":"normal","cmc":2,"power":"1","toughness":"1","loyalty":null,"keywords":["Protection"],"colors":["W"],"colorIdentity":["W"]}, // targeted
  {"name":"Commander Eesha","type":"Legendary Creature — Bird Soldier","mana":"{2}{W}{W}","oracle":"Flying, protection from creatures","layout":"normal","cmc":4,"power":"2","toughness":"4","loyalty":null,"keywords":["Flying","Protection"],"colors":["W"],"colorIdentity":["W"]}, // targeted
  {"name":"Pristine Angel","type":"Creature — Angel","mana":"{4}{W}{W}","oracle":"Flying\nAs long as this creature is untapped, it has protection from artifacts and from each color.\nWhenever you cast a spell, you may untap this creature.","layout":"normal","cmc":6,"power":"4","toughness":"4","loyalty":null,"keywords":["Flying"],"colors":["W"],"colorIdentity":["W"]}, // targeted
  {"name":"Blood Baron of Vizkopa","type":"Creature — Vampire","mana":"{3}{W}{B}","oracle":"Lifelink, protection from white and from black\nAs long as you have 30 or more life and an opponent has 10 or less life, this creature gets +6/+6 and has flying.","layout":"normal","cmc":5,"power":"4","toughness":"4","loyalty":null,"keywords":["Lifelink","Protection"],"colors":["B","W"],"colorIdentity":["B","W"]}, // targeted
  {"name":"Akroma's Memorial","type":"Legendary Artifact","mana":"{7}","oracle":"Creatures you control have flying, first strike, vigilance, trample, haste, and protection from black and from red.","layout":"normal","cmc":7,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":[]}, // targeted
  {"name":"Silver Knight","type":"Creature — Human Knight","mana":"{W}{W}","oracle":"First strike, protection from red","layout":"normal","cmc":2,"power":"2","toughness":"2","loyalty":null,"keywords":["First strike","Protection"],"colors":["W"],"colorIdentity":["W"]}, // targeted
  {"name":"Kor Firewalker","type":"Creature — Kor Soldier","mana":"{W}{W}","oracle":"Protection from red\nWhenever a player casts a red spell, you may gain 1 life.","layout":"normal","cmc":2,"power":"2","toughness":"2","loyalty":null,"keywords":["Protection"],"colors":["W"],"colorIdentity":["W"]}, // targeted
  {"name":"Teysa, Envoy of Ghosts","type":"Legendary Creature — Human Advisor","mana":"{5}{W}{B}","oracle":"Vigilance, protection from creatures\nWhenever a creature deals combat damage to you, destroy that creature. Create a 1/1 white and black Spirit creature token with flying.","layout":"normal","cmc":7,"power":"4","toughness":"4","loyalty":null,"keywords":["Vigilance","Protection"],"colors":["B","W"],"colorIdentity":["B","W"]}, // targeted
  {"name":"Hunted Horror","type":"Creature — Horror","mana":"{B}{B}","oracle":"Trample\nWhen this creature enters, target opponent creates two 3/3 green Centaur creature tokens with protection from black.","layout":"normal","cmc":2,"power":"7","toughness":"7","loyalty":null,"keywords":["Trample"],"colors":["B"],"colorIdentity":["B"]}, // targeted
  {"name":"Giver of Runes","type":"Creature — Kor Cleric","mana":"{W}","oracle":"{T}: Another target creature you control gains protection from colorless or from the color of your choice until end of turn.","layout":"normal","cmc":1,"power":"1","toughness":"2","loyalty":null,"keywords":[],"colors":["W"],"colorIdentity":["W"]}, // targeted
  {"name":"Spectra Ward","type":"Enchantment — Aura","mana":"{3}{W}{W}","oracle":"Enchant creature\nEnchanted creature gets +2/+2 and has protection from each color. This effect doesn't remove Auras. (It can't be blocked, targeted, or dealt damage by anything that's white, blue, black, red, or green.)","layout":"normal","cmc":5,"power":null,"toughness":null,"loyalty":null,"keywords":["Enchant"],"colors":["W"],"colorIdentity":["W"]}, // targeted
  {"name":"Mystic Familiar","type":"Creature — Bird","mana":"{1}{W}","oracle":"Flying\nThreshold — As long as there are seven or more cards in your graveyard, this creature gets +1/+1 and has protection from black.","layout":"normal","cmc":2,"power":"1","toughness":"2","loyalty":null,"keywords":["Flying","Threshold"],"colors":["W"],"colorIdentity":["W"]}, // targeted
  {"name":"Serra Angel","type":"Creature — Angel","mana":"{3}{W}{W}","oracle":"Flying\nVigilance (Attacking doesn't cause this creature to tap.)","layout":"normal","cmc":5,"power":"4","toughness":"4","loyalty":null,"keywords":["Flying","Vigilance"],"colors":["W"],"colorIdentity":["W"]}, // targeted
  {"name":"Baneslayer Angel","type":"Creature — Angel","mana":"{3}{W}{W}","oracle":"Flying, first strike, lifelink, protection from Demons and from Dragons","layout":"normal","cmc":5,"power":"5","toughness":"5","loyalty":null,"keywords":["Flying","Lifelink","First strike","Protection"],"colors":["W"],"colorIdentity":["W"]}, // targeted
  {"name":"Vampire Nighthawk","type":"Creature — Vampire Shaman","mana":"{1}{B}{B}","oracle":"Flying\nDeathtouch (Any amount of damage this deals to a creature is enough to destroy it.)\nLifelink (Damage dealt by this creature also causes you to gain that much life.)","layout":"normal","cmc":3,"power":"2","toughness":"3","loyalty":null,"keywords":["Deathtouch","Flying","Lifelink"],"colors":["B"],"colorIdentity":["B"]}, // targeted
  {"name":"Akroma, Angel of Wrath","type":"Legendary Creature — Angel","mana":"{5}{W}{W}{W}","oracle":"Flying, first strike, vigilance, trample, haste, protection from black and from red","layout":"normal","cmc":8,"power":"6","toughness":"6","loyalty":null,"keywords":["Flying","Vigilance","First strike","Protection","Haste","Trample"],"colors":["W"],"colorIdentity":["W"]}, // targeted
  {"name":"Invisible Stalker","type":"Creature — Human Rogue","mana":"{1}{U}","oracle":"Hexproof (This creature can't be the target of spells or abilities your opponents control.)\nThis creature can't be blocked.","layout":"normal","cmc":2,"power":"1","toughness":"1","loyalty":null,"keywords":["Hexproof"],"colors":["U"],"colorIdentity":["U"]}, // targeted
  {"name":"Ornithopter","type":"Artifact Creature — Thopter","mana":"{0}","oracle":"Flying","layout":"normal","cmc":0,"power":"0","toughness":"2","loyalty":null,"keywords":["Flying"],"colors":[],"colorIdentity":[]}, // targeted
  {"name":"Dauthi Slayer","type":"Creature — Dauthi Soldier","mana":"{B}{B}","oracle":"Shadow (This creature can block or be blocked by only creatures with shadow.)\nThis creature attacks each combat if able.","layout":"normal","cmc":2,"power":"2","toughness":"2","loyalty":null,"keywords":["Shadow"],"colors":["B"],"colorIdentity":["B"]}, // targeted
  {"name":"Bog Wraith","type":"Creature — Wraith","mana":"{3}{B}","oracle":"Swampwalk (This creature can't be blocked as long as defending player controls a Swamp.)","layout":"normal","cmc":4,"power":"3","toughness":"3","loyalty":null,"keywords":["Landwalk","Swampwalk"],"colors":["B"],"colorIdentity":["B"]}, // targeted
  {"name":"Lord of Atlantis","type":"Creature — Merfolk","mana":"{U}{U}","oracle":"Other Merfolk get +1/+1 and have islandwalk. (They can't be blocked as long as defending player controls an Island.)","layout":"normal","cmc":2,"power":"2","toughness":"2","loyalty":null,"keywords":[],"colors":["U"],"colorIdentity":["U"]}, // targeted
  {"name":"Moat","type":"Enchantment","mana":"{2}{W}{W}","oracle":"Creatures without flying can't attack.","layout":"normal","cmc":4,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["W"],"colorIdentity":["W"]}, // targeted
  {"name":"Levitation","type":"Enchantment","mana":"{2}{U}{U}","oracle":"Creatures you control have flying.","layout":"normal","cmc":4,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["U"],"colorIdentity":["U"]}, // targeted
  {"name":"Dauntless Bodyguard","type":"Creature — Human Knight","mana":"{W}","oracle":"As this creature enters, choose another creature you control.\nSacrifice this creature: The chosen creature gains indestructible until end of turn.","layout":"normal","cmc":1,"power":"2","toughness":"1","loyalty":null,"keywords":[],"colors":["W"],"colorIdentity":["W"]}, // targeted
  {"name":"Grizzly Bears","type":"Creature — Bear","mana":"{1}{G}","oracle":"","layout":"normal","cmc":2,"power":"2","toughness":"2","loyalty":null,"keywords":[],"colors":["G"],"colorIdentity":["G"]}, // targeted
  {"name":"Hill Giant","type":"Creature — Giant","mana":"{3}{R}","oracle":"","layout":"normal","cmc":4,"power":"3","toughness":"3","loyalty":null,"keywords":[],"colors":["R"],"colorIdentity":["R"]}, // targeted
  {"name":"Sol Ring","type":"Artifact","mana":"{1}","oracle":"{T}: Add {C}{C}.","layout":"normal","cmc":1,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":[]}, // top
  {"name":"Command Tower","type":"Land","mana":"","oracle":"{T}: Add one mana of any color in your commander's color identity.","layout":"normal","cmc":0,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":[]}, // top
  {"name":"Arcane Signet","type":"Artifact","mana":"{2}","oracle":"{T}: Add one mana of any color in your commander's color identity.","layout":"normal","cmc":2,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":[]}, // top
  {"name":"Exotic Orchard","type":"Land","mana":"","oracle":"{T}: Add one mana of any color that a land an opponent controls could produce.","layout":"normal","cmc":0,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":[]}, // top
  {"name":"Reliquary Tower","type":"Land","mana":"","oracle":"You have no maximum hand size.\n{T}: Add {C}.","layout":"normal","cmc":0,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":[]}, // top
  {"name":"Swords to Plowshares","type":"Instant","mana":"{W}","oracle":"Exile target creature. Its controller gains life equal to its power.","layout":"normal","cmc":1,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["W"],"colorIdentity":["W"]}, // top
  {"name":"Swiftfoot Boots","type":"Artifact — Equipment","mana":"{2}","oracle":"Equipped creature has hexproof and haste. (It can't be the target of spells or abilities your opponents control. It can attack and {T} no matter when it came under your control.)\nEquip {1} ({1}: Attach to target creature you control. Equip only as a sorcery.)","layout":"normal","cmc":2,"power":null,"toughness":null,"loyalty":null,"keywords":["Equip"],"colors":[],"colorIdentity":[]}, // top
  {"name":"Lightning Greaves","type":"Artifact — Equipment","mana":"{2}","oracle":"Equipped creature has haste and shroud. (It can't be the target of spells or abilities.)\nEquip {0}","layout":"normal","cmc":2,"power":null,"toughness":null,"loyalty":null,"keywords":["Equip"],"colors":[],"colorIdentity":[]}, // top
  {"name":"Path of Ancestry","type":"Land","mana":"","oracle":"This land enters tapped.\n{T}: Add one mana of any color in your commander's color identity. When that mana is spent to cast a creature spell that shares a creature type with your commander, scry 1. (Look at the top card of your library. You may put that card on the bottom.)","layout":"normal","cmc":0,"power":null,"toughness":null,"loyalty":null,"keywords":["Scry"],"colors":[],"colorIdentity":[]}, // top
  {"name":"Path to Exile","type":"Instant","mana":"{W}","oracle":"Exile target creature. Its controller may search their library for a basic land card, put that card onto the battlefield tapped, then shuffle.","layout":"normal","cmc":1,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["W"],"colorIdentity":["W"]}, // top
  {"name":"Counterspell","type":"Instant","mana":"{U}{U}","oracle":"Counter target spell.","layout":"normal","cmc":2,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["U"],"colorIdentity":["U"]}, // top
  {"name":"Fellwar Stone","type":"Artifact","mana":"{2}","oracle":"{T}: Add one mana of any color that a land an opponent controls could produce.","layout":"normal","cmc":2,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":[]}, // top
  {"name":"Rogue's Passage","type":"Land","mana":"","oracle":"{T}: Add {C}.\n{4}, {T}: Target creature can't be blocked this turn.","layout":"normal","cmc":0,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":[]}, // top
  {"name":"Evolving Wilds","type":"Land","mana":"","oracle":"{T}, Sacrifice this land: Search your library for a basic land card, put it onto the battlefield tapped, then shuffle.","layout":"normal","cmc":0,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":[]}, // top
  {"name":"Cultivate","type":"Sorcery","mana":"{2}{G}","oracle":"Search your library for up to two basic land cards, reveal those cards, put one onto the battlefield tapped and the other into your hand, then shuffle.","layout":"normal","cmc":3,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["G"],"colorIdentity":["G"]}, // top
  {"name":"Thought Vessel","type":"Artifact","mana":"{2}","oracle":"You have no maximum hand size.\n{T}: Add {C}.","layout":"normal","cmc":2,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":[]}, // top
  {"name":"Blasphemous Act","type":"Sorcery","mana":"{8}{R}","oracle":"This spell costs {1} less to cast for each creature on the battlefield.\nBlasphemous Act deals 13 damage to each creature.","layout":"normal","cmc":9,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["R"],"colorIdentity":["R"]}, // top
  {"name":"Farseek","type":"Sorcery","mana":"{1}{G}","oracle":"Search your library for a Plains, Island, Swamp, or Mountain card, put it onto the battlefield tapped, then shuffle.","layout":"normal","cmc":2,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["G"],"colorIdentity":["G"]}, // top
  {"name":"Bojuka Bog","type":"Land","mana":"","oracle":"This land enters tapped.\nWhen this land enters, exile target player's graveyard.\n{T}: Add {B}.","layout":"normal","cmc":0,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":["B"]}, // top
  {"name":"Beast Within","type":"Instant","mana":"{2}{G}","oracle":"Destroy target permanent. Its controller creates a 3/3 green Beast creature token.","layout":"normal","cmc":3,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["G"],"colorIdentity":["G"]}, // top
  {"name":"Nature's Lore","type":"Sorcery","mana":"{1}{G}","oracle":"Search your library for a Forest card, put that card onto the battlefield, then shuffle.","layout":"normal","cmc":2,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["G"],"colorIdentity":["G"]}, // top
  {"name":"Rampant Growth","type":"Sorcery","mana":"{1}{G}","oracle":"Search your library for a basic land card, put that card onto the battlefield tapped, then shuffle.","layout":"normal","cmc":2,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["G"],"colorIdentity":["G"]}, // top
  {"name":"Terramorphic Expanse","type":"Land","mana":"","oracle":"{T}, Sacrifice this land: Search your library for a basic land card, put it onto the battlefield tapped, then shuffle.","layout":"normal","cmc":0,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":[]}, // top
  {"name":"Chaos Warp","type":"Instant","mana":"{2}{R}","oracle":"The owner of target permanent shuffles it into their library, then reveals the top card of their library. If it's a permanent card, they put it onto the battlefield.","layout":"normal","cmc":3,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["R"],"colorIdentity":["R"]}, // top
  {"name":"Heroic Intervention","type":"Instant","mana":"{1}{G}","oracle":"Permanents you control gain hexproof and indestructible until end of turn.","layout":"normal","cmc":2,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["G"],"colorIdentity":["G"]}, // top
  {"name":"Birds of Paradise","type":"Creature — Bird","mana":"{G}","oracle":"Flying\n{T}: Add one mana of any color.","layout":"normal","cmc":1,"power":"0","toughness":"1","loyalty":null,"keywords":["Flying"],"colors":["G"],"colorIdentity":["G"]}, // kw:Flying
  {"name":"Six","type":"Legendary Creature — Treefolk","mana":"{2}{G}","oracle":"Reach\nWhenever Six attacks, mill three cards. You may put a land card from among them into your hand.\nDuring your turn, nonland permanent cards in your graveyard have retrace. (You may cast permanent cards from your graveyard by discarding a land card in addition to paying their other costs.)","layout":"normal","cmc":3,"power":"2","toughness":"4","loyalty":null,"keywords":["Reach","Mill"],"colors":["G"],"colorIdentity":["G"]}, // kw:Reach
  {"name":"Knight of the White Orchid","type":"Creature — Human Knight","mana":"{W}{W}","oracle":"First strike\nWhen this creature enters, if an opponent controls more lands than you, you may search your library for a Plains card, put it onto the battlefield, then shuffle.","layout":"normal","cmc":2,"power":"2","toughness":"2","loyalty":null,"keywords":["First strike"],"colors":["W"],"colorIdentity":["W"]}, // kw:First strike
  {"name":"Boros Charm","type":"Instant","mana":"{R}{W}","oracle":"Choose one —\n• Boros Charm deals 4 damage to target player or planeswalker.\n• Permanents you control gain indestructible until end of turn.\n• Target creature gains double strike until end of turn.","layout":"normal","cmc":2,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["R","W"],"colorIdentity":["R","W"]}, // kw:Double strike
  {"name":"Garruk's Uprising","type":"Enchantment","mana":"{2}{G}","oracle":"When this enchantment enters, if you control a creature with power 4 or greater, draw a card.\nCreatures you control have trample. (Each of those creatures can deal excess combat damage to the player or planeswalker it's attacking.)\nWhenever a creature you control with power 4 or greater enters, draw a card.","layout":"normal","cmc":3,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["G"],"colorIdentity":["G"]}, // kw:Trample
  {"name":"Basilisk Collar","type":"Artifact — Equipment","mana":"{1}","oracle":"Equipped creature has deathtouch and lifelink. (Any amount of damage it deals to a creature is enough to destroy it. Damage dealt by this creature also causes you to gain that much life.)\nEquip {2} ({2}: Attach to target creature you control. Equip only as a sorcery.)","layout":"normal","cmc":1,"power":null,"toughness":null,"loyalty":null,"keywords":["Equip"],"colors":[],"colorIdentity":[]}, // kw:Deathtouch
  {"name":"Akroma's Will","type":"Instant","mana":"{3}{W}","oracle":"Choose one. If you control a commander as you cast this spell, you may choose both instead.\n• Creatures you control gain flying, vigilance, and double strike until end of turn.\n• Creatures you control gain lifelink, indestructible, and protection from each color until end of turn.","layout":"normal","cmc":4,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["W"],"colorIdentity":["W"]}, // kw:Lifelink
  {"name":"Professional Face-Breaker","type":"Creature — Human Warrior","mana":"{2}{R}","oracle":"Menace\nWhenever one or more creatures you control deal combat damage to a player, create a Treasure token.\nSacrifice a Treasure: Exile the top card of your library. You may play that card this turn.","layout":"normal","cmc":3,"power":"2","toughness":"3","loyalty":null,"keywords":["Treasure","Menace"],"colors":["R"],"colorIdentity":["R"]}, // kw:Menace
  {"name":"Shizo, Death's Storehouse","type":"Legendary Land","mana":"","oracle":"{T}: Add {B}.\n{B}, {T}: Target legendary creature gains fear until end of turn. (It can't be blocked except by artifact creatures and/or black creatures.)","layout":"normal","cmc":0,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":["B"]}, // kw:Fear
  {"name":"Crashing Drawbridge","type":"Artifact Creature — Wall","mana":"{2}","oracle":"Defender\n{T}: Creatures you control gain haste until end of turn.","layout":"normal","cmc":2,"power":"0","toughness":"4","loyalty":null,"keywords":["Defender"],"colors":[],"colorIdentity":[]}, // kw:Defender
  {"name":"Dauthi Voidwalker","type":"Creature — Dauthi Rogue","mana":"{B}{B}","oracle":"Shadow (This creature can block or be blocked by only creatures with shadow.)\nIf a card would be put into an opponent's graveyard from anywhere, instead exile it with a void counter on it.\n{T}, Sacrifice this creature: Choose an exiled card an opponent owns with a void counter on it. You may play it this turn without paying its mana cost.","layout":"normal","cmc":2,"power":"3","toughness":"2","loyalty":null,"keywords":["Shadow"],"colors":["B"],"colorIdentity":["B"]}, // kw:Shadow
  {"name":"Sidar Kondo of Jamuraa","type":"Legendary Creature — Human Knight","mana":"{2}{G}{W}","oracle":"Flanking (Whenever a creature without flanking blocks this creature, the blocking creature gets -1/-1 until end of turn.)\nCreatures your opponents control without flying or reach can't block creatures with power 2 or less.\nPartner (You can have two commanders if both have partner.)","layout":"normal","cmc":4,"power":"2","toughness":"5","loyalty":null,"keywords":["Flanking","Partner"],"colors":["G","W"],"colorIdentity":["G","W"]}, // kw:Flanking
  {"name":"Mikaeus, the Unhallowed","type":"Legendary Creature — Zombie Cleric","mana":"{3}{B}{B}{B}","oracle":"Intimidate (This creature can't be blocked except by artifact creatures and/or creatures that share a color with it.)\nWhenever a Human deals damage to you, destroy it.\nOther non-Human creatures you control get +1/+1 and have undying. (When a creature with undying dies, if it had no +1/+1 counters on it, return it to the battlefield under its owner's control with a +1/+1 counter on it.)","layout":"normal","cmc":6,"power":"5","toughness":"5","loyalty":null,"keywords":["Intimidate"],"colors":["B"],"colorIdentity":["B"]}, // kw:Intimidate
  {"name":"Odric, Lunarch Marshal","type":"Legendary Creature — Human Soldier","mana":"{3}{W}","oracle":"At the beginning of each combat, creatures you control gain first strike until end of turn if a creature you control has first strike. The same is true for flying, deathtouch, double strike, haste, hexproof, indestructible, lifelink, menace, reach, skulk, trample, and vigilance.","layout":"normal","cmc":4,"power":"3","toughness":"3","loyalty":null,"keywords":[],"colors":["W"],"colorIdentity":["W"]}, // kw:Skulk
  {"name":"Herald of Hoofbeats","type":"Creature — Human Knight","mana":"{3}{U}","oracle":"Horsemanship (This creature can't be blocked except by creatures with horsemanship.)\nOther Knights you control have horsemanship.","layout":"normal","cmc":4,"power":"3","toughness":"3","loyalty":null,"keywords":["Horsemanship"],"colors":["U"],"colorIdentity":["U"]}, // kw:Horsemanship
  {"name":"Chasm Skulker","type":"Creature — Squid Horror","mana":"{2}{U}","oracle":"Whenever you draw a card, put a +1/+1 counter on this creature.\nWhen this creature dies, create X 1/1 blue Squid creature tokens with islandwalk, where X is the number of +1/+1 counters on this creature. (They can't be blocked as long as defending player controls an Island.)","layout":"normal","cmc":3,"power":"1","toughness":"1","loyalty":null,"keywords":[],"colors":["U"],"colorIdentity":["U"]}, // kw:Islandwalk
  {"name":"Chatterfang, Squirrel General","type":"Legendary Creature — Squirrel Warrior","mana":"{2}{G}","oracle":"Forestwalk (This creature can't be blocked as long as defending player controls a Forest.)\nIf one or more tokens would be created under your control, those tokens plus that many 1/1 green Squirrel creature tokens are created instead.\n{B}, Sacrifice X Squirrels: Target creature gets +X/-X until end of turn.","layout":"normal","cmc":3,"power":"3","toughness":"3","loyalty":null,"keywords":["Landwalk","Forestwalk"],"colors":["G"],"colorIdentity":["B","G"]}, // kw:Forestwalk
  {"name":"Roaming Throne","type":"Artifact Creature — Golem","mana":"{4}","oracle":"Ward {2}\nAs this creature enters, choose a creature type.\nThis creature is the chosen type in addition to its other types.\nIf a triggered ability of another creature you control of the chosen type triggers, it triggers an additional time.","layout":"normal","cmc":4,"power":"4","toughness":"4","loyalty":null,"keywords":["Ward"],"colors":[],"colorIdentity":[]}, // kw:Ward
  {"name":"Growing Rites of Itlimoc // Itlimoc, Cradle of the Sun","type":"Legendary Enchantment // Legendary Land","mana":"{2}{G}","oracle":"Growing Rites of Itlimoc - Legendary Enchantment {2}{G}\nWhen Growing Rites of Itlimoc enters, look at the top four cards of your library. You may reveal a creature card from among them and put it into your hand. Put the rest on the bottom of your library in any order.\nAt the beginning of your end step, if you control four or more creatures, transform Growing Rites of Itlimoc.\n//\nItlimoc, Cradle of the Sun - Legendary Land \n(Transforms from Growing Rites of Itlimoc.)\n{T}: Add {G}.\n{T}: Add {G} for each creature you control.","layout":"transform","cmc":3,"power":null,"toughness":null,"loyalty":null,"keywords":["Transform"],"colors":[],"colorIdentity":["G"],"card_faces":[{"name":"Growing Rites of Itlimoc","mana_cost":"{2}{G}","colors":["G"]},{"name":"Itlimoc, Cradle of the Sun","mana_cost":"","colors":[]}]}, // layout:transform (with card_faces: name, mana_cost, colors)
  {"name":"Etali, Primal Conqueror // Etali, Primal Sickness","type":"Legendary Creature — Elder Dinosaur // Legendary Creature — Phyrexian Elder Dinosaur","mana":"{5}{R}{R}","oracle":"Etali, Primal Conqueror - Legendary Creature — Elder Dinosaur {5}{R}{R}\nTrample\nWhen Etali enters, each player exiles cards from the top of their library until they exile a nonland card. You may cast any number of spells from among the nonland cards exiled this way without paying their mana costs.\n{9}{G/P}: Transform Etali. Activate only as a sorcery.\n//\nEtali, Primal Sickness - Legendary Creature — Phyrexian Elder Dinosaur \nTrample, indestructible\nWhenever Etali deals combat damage to a player, they get that many poison counters. (A player with ten or more poison counters loses the game.)","layout":"transform","cmc":7,"power":"7","toughness":"7","loyalty":null,"keywords":["Indestructible","Transform","Trample"],"colors":[],"colorIdentity":["G","R"],"card_faces":[{"name":"Etali, Primal Conqueror","mana_cost":"{5}{R}{R}","colors":["R"]},{"name":"Etali, Primal Sickness","mana_cost":"","colors":["G","R"]}]}, // layout:transform (with card_faces: name, mana_cost, colors)
  {"name":"Ojer Taq, Deepest Foundation // Temple of Civilization","type":"Legendary Creature — God // Land","mana":"{4}{W}{W}","oracle":"Ojer Taq, Deepest Foundation - Legendary Creature — God {4}{W}{W}\nVigilance\nIf one or more creature tokens would be created under your control, three times that many of those tokens are created instead.\nWhen Ojer Taq dies, return it to the battlefield tapped and transformed under its owner's control.\n//\nTemple of Civilization - Land \n(Transforms from Ojer Taq, Deepest Foundation.)\n{T}: Add {W}.\n{2}{W}, {T}: Transform this land. Activate only if you attacked with three or more creatures this turn and only as a sorcery.","layout":"transform","cmc":6,"power":"6","toughness":"6","loyalty":null,"keywords":["Vigilance","Transform"],"colors":[],"colorIdentity":["W"],"card_faces":[{"name":"Ojer Taq, Deepest Foundation","mana_cost":"{4}{W}{W}","colors":["W"]},{"name":"Temple of Civilization","mana_cost":"","colors":[]}]}, // layout:transform (with card_faces: name, mana_cost, colors)
  {"name":"Sephiroth, Fabled SOLDIER // Sephiroth, One-Winged Angel","type":"Legendary Creature — Human Avatar Soldier // Legendary Creature — Angel Nightmare Avatar","mana":"{2}{B}","oracle":"Sephiroth, Fabled SOLDIER - Legendary Creature — Human Avatar Soldier {2}{B}\nWhenever Sephiroth enters or attacks, you may sacrifice another creature. If you do, draw a card.\nWhenever another creature dies, target opponent loses 1 life and you gain 1 life. If this is the fourth time this ability has resolved this turn, transform Sephiroth.\n//\nSephiroth, One-Winged Angel - Legendary Creature — Angel Nightmare Avatar \nFlying\nSuper Nova — As this creature transforms into Sephiroth, One-Winged Angel, you get an emblem with \"Whenever a creature dies, target opponent loses 1 life and you gain 1 life.\"\nWhenever Sephiroth attacks, you may sacrifice any number of other creatures. If you do, draw that many cards.","layout":"transform","cmc":3,"power":"3","toughness":"3","loyalty":null,"keywords":["Flying","Transform","Super Nova"],"colors":[],"colorIdentity":["B"],"card_faces":[{"name":"Sephiroth, Fabled SOLDIER","mana_cost":"{2}{B}","colors":["B"]},{"name":"Sephiroth, One-Winged Angel","mana_cost":"","colors":["B"]}]}, // layout:transform (with card_faces: name, mana_cost, colors)
  {"name":"Sink into Stupor // Soporific Springs","type":"Instant // Land","mana":"{1}{U}{U}","oracle":"Sink into Stupor - Instant {1}{U}{U}\nReturn target spell or nonland permanent an opponent controls to its owner's hand.\n//\nSoporific Springs - Land \nAs this land enters, you may pay 3 life. If you don't, it enters tapped.\n{T}: Add {U}.","layout":"modal_dfc","cmc":3,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":["U"],"card_faces":[{"name":"Sink into Stupor","mana_cost":"{1}{U}{U}","colors":["U"]},{"name":"Soporific Springs","mana_cost":"","colors":[]}]}, // layout:modal_dfc (with card_faces: name, mana_cost, colors)
  {"name":"Fell the Profane // Fell Mire","type":"Instant // Land","mana":"{2}{B}{B}","oracle":"Fell the Profane - Instant {2}{B}{B}\nDestroy target creature or planeswalker.\n//\nFell Mire - Land \nAs this land enters, you may pay 3 life. If you don't, it enters tapped.\n{T}: Add {B}.","layout":"modal_dfc","cmc":4,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":["B"],"card_faces":[{"name":"Fell the Profane","mana_cost":"{2}{B}{B}","colors":["B"]},{"name":"Fell Mire","mana_cost":"","colors":[]}]}, // layout:modal_dfc (with card_faces: name, mana_cost, colors)
  {"name":"Malakir Rebirth // Malakir Mire","type":"Instant // Land","mana":"{B}","oracle":"Malakir Rebirth - Instant {B}\nChoose target creature. You lose 2 life. Until end of turn, that creature gains \"When this creature dies, return it to the battlefield tapped under its owner's control.\"\n//\nMalakir Mire - Land \nThis land enters tapped.\n{T}: Add {B}.","layout":"modal_dfc","cmc":1,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":["B"],"card_faces":[{"name":"Malakir Rebirth","mana_cost":"{B}","colors":["B"]},{"name":"Malakir Mire","mana_cost":"","colors":[]}]}, // layout:modal_dfc (with card_faces: name, mana_cost, colors)
  {"name":"Rune-Tail, Kitsune Ascendant // Rune-Tail's Essence","type":"Legendary Creature — Fox Monk // Legendary Enchantment","mana":"{2}{W}","oracle":"Rune-Tail, Kitsune Ascendant - Legendary Creature — Fox Monk {2}{W}\nWhen you have 30 or more life, flip Rune-Tail.\n//\nRune-Tail's Essence - Legendary Enchantment \nPrevent all damage that would be dealt to creatures you control.","layout":"flip","cmc":3,"power":"2","toughness":"2","loyalty":null,"keywords":[],"colors":["W"],"colorIdentity":["W"],"card_faces":[{"name":"Rune-Tail, Kitsune Ascendant","mana_cost":"{2}{W}","colors":[]},{"name":"Rune-Tail's Essence","mana_cost":"","colors":[]}]}, // layout:flip (with card_faces: name, mana_cost, colors)
  {"name":"Nezumi Graverobber // Nighteyes the Desecrator","type":"Creature — Rat Rogue // Legendary Creature — Rat Wizard","mana":"{1}{B}","oracle":"Nezumi Graverobber - Creature — Rat Rogue {1}{B}\n{1}{B}: Exile target card from an opponent's graveyard. If no cards are in that graveyard, flip this creature.\n//\nNighteyes the Desecrator - Legendary Creature — Rat Wizard \n{4}{B}: Put target creature card from a graveyard onto the battlefield under your control.","layout":"flip","cmc":2,"power":"2","toughness":"1","loyalty":null,"keywords":[],"colors":["B"],"colorIdentity":["B"],"card_faces":[{"name":"Nezumi Graverobber","mana_cost":"{1}{B}","colors":[]},{"name":"Nighteyes the Desecrator","mana_cost":"","colors":[]}]}, // layout:flip (with card_faces: name, mana_cost, colors)
  {"name":"Midgar, City of Mako // Reactor Raid","type":"Land — Town // Sorcery — Adventure","mana":"{2}{B}","oracle":"Midgar, City of Mako - Land — Town \nThis land enters tapped.\n{T}: Add {B}.\n//\nReactor Raid - Sorcery — Adventure {2}{B}\nYou may sacrifice an artifact or creature. If you do, draw two cards. (Then exile this card. You may play the land later from exile.)","layout":"adventure","cmc":0,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":["B"],"card_faces":[{"name":"Midgar, City of Mako","mana_cost":"","colors":[]},{"name":"Reactor Raid","mana_cost":"{2}{B}","colors":[]}]}, // layout:adventure (with card_faces: name, mana_cost, colors)
  {"name":"Lindblum, Industrial Regency // Mage Siege","type":"Land — Town // Instant — Adventure","mana":"{2}{R}","oracle":"Lindblum, Industrial Regency - Land — Town \nThis land enters tapped.\n{T}: Add {R}.\n//\nMage Siege - Instant — Adventure {2}{R}\nCreate a 0/1 black Wizard creature token with \"Whenever you cast a noncreature spell, this token deals 1 damage to each opponent.\"","layout":"adventure","cmc":0,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":["R"],"card_faces":[{"name":"Lindblum, Industrial Regency","mana_cost":"","colors":[]},{"name":"Mage Siege","mana_cost":"{2}{R}","colors":[]}]}, // layout:adventure (with card_faces: name, mana_cost, colors)
  {"name":"Dusk // Dawn","type":"Sorcery // Sorcery","mana":"{2}{W}{W} // {3}{W}{W}","oracle":"Dusk - Sorcery {2}{W}{W}\nDestroy all creatures with power 3 or greater.\n//\nDawn - Sorcery {3}{W}{W}\nAftermath (Cast this spell only from your graveyard. Then exile it.)\nReturn all creature cards with power 2 or less from your graveyard to your hand.","layout":"split","cmc":9,"power":null,"toughness":null,"loyalty":null,"keywords":["Aftermath"],"colors":["W"],"colorIdentity":["W"],"card_faces":[{"name":"Dusk","mana_cost":"{2}{W}{W}","colors":[]},{"name":"Dawn","mana_cost":"{3}{W}{W}","colors":[]}]}, // layout:split (with card_faces: name, mana_cost, colors)
  {"name":"Wear // Tear","type":"Instant // Instant","mana":"{1}{R} // {W}","oracle":"Wear - Instant {1}{R}\nDestroy target artifact.\nFuse (You may cast one or both halves of this card from your hand.)\n//\nTear - Instant {W}\nDestroy target enchantment.\nFuse (You may cast one or both halves of this card from your hand.)","layout":"split","cmc":3,"power":null,"toughness":null,"loyalty":null,"keywords":["Fuse"],"colors":["R","W"],"colorIdentity":["R","W"],"card_faces":[{"name":"Wear","mana_cost":"{1}{R}","colors":[]},{"name":"Tear","mana_cost":"{W}","colors":[]}]}, // layout:split (with card_faces: name, mana_cost, colors)
  {"name":"Walk-In Closet // Forgotten Cellar","type":"Enchantment — Room // Enchantment — Room","mana":"{2}{G} // {3}{G}{G}","oracle":"Walk-In Closet - Enchantment — Room {2}{G}\nYou may play lands from your graveyard.\n(You may cast either half. That door unlocks on the battlefield. As a sorcery, you may pay the mana cost of a locked door to unlock it.)\n//\nForgotten Cellar - Enchantment — Room {3}{G}{G}\nWhen you unlock this door, you may cast spells from your graveyard this turn, and if a card would be put into your graveyard from anywhere this turn, exile it instead.\n(You may cast either half. That door unlocks on the battlefield. As a sorcery, you may pay the mana cost of a locked door to unlock it.)","layout":"split","cmc":8,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["G"],"colorIdentity":["G"],"card_faces":[{"name":"Walk-In Closet","mana_cost":"{2}{G}","colors":[]},{"name":"Forgotten Cellar","mana_cost":"{3}{G}{G}","colors":[]}]}, // layout:split (with card_faces: name, mana_cost, colors)
  {"name":"Bruna, the Fading Light","type":"Legendary Creature — Angel Horror","mana":"{5}{W}{W}","oracle":"When you cast this spell, you may return target Angel or Human creature card from your graveyard to the battlefield.\nFlying, vigilance\n(Melds with Gisela, the Broken Blade.)","layout":"meld","cmc":7,"power":"5","toughness":"7","loyalty":null,"keywords":["Flying","Vigilance"],"colors":["W"],"colorIdentity":["W"]}, // layout:meld
  {"name":"Hexdrinker","type":"Creature — Snake","mana":"{G}","oracle":"Level up {1} ({1}: Put a level counter on this. Level up only as a sorcery.)\nLEVEL 3-7\n4/4\nProtection from instants\nLEVEL 8+\n6/6\nProtection from everything","layout":"leveler","cmc":1,"power":"2","toughness":"1","loyalty":null,"keywords":["Level Up","Protection"],"colors":["G"],"colorIdentity":["G"]}, // layout:leveler
  {"name":"Coralhelm Commander","type":"Creature — Merfolk Soldier","mana":"{U}{U}","oracle":"Level up {1} ({1}: Put a level counter on this. Level up only as a sorcery.)\nLEVEL 2-3\n3/3\nFlying\nLEVEL 4+\n4/4\nFlying\nOther Merfolk creatures you control get +1/+1.","layout":"leveler","cmc":2,"power":"2","toughness":"2","loyalty":null,"keywords":["Flying","Level Up"],"colors":["U"],"colorIdentity":["U"]}, // layout:leveler
  {"name":"Caretaker's Talent","type":"Enchantment — Class","mana":"{2}{W}","oracle":"(Gain the next level as a sorcery to add its ability.)\nWhenever one or more tokens you control enter, draw a card. This ability triggers only once each turn.\n{W}: Level 2\nWhen this Class becomes level 2, create a token that's a copy of target token you control.\n{3}{W}: Level 3\nCreature tokens you control get +2/+2.","layout":"class","cmc":3,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["W"],"colorIdentity":["W"]}, // layout:class
  {"name":"The One Ring","type":"Legendary Artifact","mana":"{4}","oracle":"Indestructible\nWhen The One Ring enters, if you cast it, you gain protection from everything until your next turn.\nAt the beginning of your upkeep, you lose 1 life for each burden counter on The One Ring.\n{T}: Put a burden counter on The One Ring, then draw a card for each burden counter on The One Ring.","layout":"normal","cmc":4,"power":null,"toughness":null,"loyalty":null,"keywords":["Indestructible"],"colors":[],"colorIdentity":[]}, // protection
  {"name":"Teferi's Protection","type":"Instant","mana":"{2}{W}","oracle":"Until your next turn, your life total can't change and you gain protection from everything. All permanents you control phase out. (While they're phased out, they're treated as though they don't exist. They phase in before you untap during your untap step.)\nExile Teferi's Protection.","layout":"normal","cmc":3,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["W"],"colorIdentity":["W"]}, // protection
  {"name":"Commander's Plate","type":"Artifact — Equipment","mana":"{1}","oracle":"Equipped creature gets +3/+3 and has protection from each color that's not in your commander's color identity.\nEquip commander {3}\nEquip {5}","layout":"normal","cmc":1,"power":null,"toughness":null,"loyalty":null,"keywords":["Equip"],"colors":[],"colorIdentity":[]}, // protection
  {"name":"Westvale Abbey // Ormendahl, Profane Prince","type":"Land // Legendary Creature — Demon","mana":"","oracle":"Westvale Abbey - Land \n{T}: Add {C}.\n{5}, {T}, Pay 1 life: Create a 1/1 white and black Human Cleric creature token.\n{5}, {T}, Sacrifice five creatures: Transform this land, then untap it.\n//\nOrmendahl, Profane Prince - Legendary Creature — Demon \nFlying, lifelink, indestructible, haste","layout":"transform","cmc":0,"power":null,"toughness":null,"loyalty":null,"keywords":["Flying","Lifelink","Indestructible","Transform","Haste"],"colors":[],"colorIdentity":["B"]}, // targeted (game-deck shape)
  {"name":"Delver of Secrets // Insectile Aberration","type":"Creature — Human Wizard // Creature — Human Insect","mana":"{U}","oracle":"Delver of Secrets - Creature — Human Wizard {U}\nAt the beginning of your upkeep, look at the top card of your library. You may reveal that card. If an instant or sorcery card is revealed this way, transform this creature.\n//\nInsectile Aberration - Creature — Human Insect \nFlying","layout":"transform","cmc":1,"power":"1","toughness":"1","loyalty":null,"keywords":["Flying","Transform"],"colors":[],"colorIdentity":["U"]}, // targeted (game-deck shape)
  {"name":"Lunarch Veteran // Luminous Phantom","type":"Creature — Human Cleric // Creature — Spirit Cleric","mana":"{W}","oracle":"Lunarch Veteran - Creature — Human Cleric {W}\nWhenever another creature you control enters, you gain 1 life.\nDisturb {1}{W} (You may cast this card from your graveyard transformed for its disturb cost.)\n//\nLuminous Phantom - Creature — Spirit Cleric \nFlying\nWhenever another creature you control leaves the battlefield, you gain 1 life.\nIf Luminous Phantom would be put into a graveyard from anywhere, exile it instead.","layout":"transform","cmc":1,"power":"1","toughness":"1","loyalty":null,"keywords":["Flying","Transform","Disturb"],"colors":[],"colorIdentity":["W"]}, // targeted (game-deck shape)
  {"name":"Bloodline Keeper // Lord of Lineage","type":"Creature — Vampire // Creature — Vampire","mana":"{2}{B}{B}","oracle":"Bloodline Keeper - Creature — Vampire {2}{B}{B}\nFlying\n{T}: Create a 2/2 black Vampire creature token with flying.\n{B}: Transform this creature. Activate only if you control five or more Vampires.\n//\nLord of Lineage - Creature — Vampire \nFlying\nOther Vampire creatures you control get +2/+2.\n{T}: Create a 2/2 black Vampire creature token with flying.","layout":"transform","cmc":4,"power":"3","toughness":"3","loyalty":null,"keywords":["Flying","Transform"],"colors":[],"colorIdentity":["B"]}, // targeted (game-deck shape)
  {"name":"Tangleclaw Werewolf // Fibrous Entangler","type":"Creature — Werewolf Horror // Creature — Eldrazi Werewolf","mana":"{2}{G}{G}","oracle":"Tangleclaw Werewolf - Creature — Werewolf Horror {2}{G}{G}\nThis creature can block an additional creature each combat.\n{6}{G}: Transform this creature.\n//\nFibrous Entangler - Creature — Eldrazi Werewolf \nVigilance\nThis creature must be blocked if able.\nThis creature can block an additional creature each combat.","layout":"transform","cmc":4,"power":"2","toughness":"4","loyalty":null,"keywords":["Vigilance","Transform"],"colors":[],"colorIdentity":["G"]}, // targeted (game-deck shape)
  {"name":"Treasure Map // Treasure Cove","type":"Artifact // Land","mana":"{2}","oracle":"Treasure Map - Artifact {2}\n{1}, {T}: Scry 1. Put a landmark counter on this artifact. Then if there are three or more landmark counters on it, remove those counters, transform this artifact, and create three Treasure tokens. (They're artifacts with \"{T}, Sacrifice this token: Add one mana of any color.\")\n//\nTreasure Cove - Land \n(Transforms from Treasure Map.)\n{T}: Add {C}.\n{T}, Sacrifice a Treasure: Draw a card.","layout":"transform","cmc":2,"power":null,"toughness":null,"loyalty":null,"keywords":["Transform","Treasure","Scry"],"colors":[],"colorIdentity":[]}, // targeted (game-deck shape)
  {"name":"Valakut Awakening // Valakut Stoneforge","type":"Instant // Land","mana":"{2}{R}","oracle":"Valakut Awakening - Instant {2}{R}\nPut any number of cards from your hand on the bottom of your library, then draw that many cards plus one.\n//\nValakut Stoneforge - Land \nThis land enters tapped.\n{T}: Add {R}.","layout":"modal_dfc","cmc":3,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":["R"]}, // targeted (game-deck shape)
  {"name":"Agadeem's Awakening // Agadeem, the Undercrypt","type":"Sorcery // Land","mana":"{X}{B}{B}{B}","oracle":"Agadeem's Awakening - Sorcery {X}{B}{B}{B}\nReturn from your graveyard to the battlefield any number of target creature cards that each have a different mana value X or less.\n//\nAgadeem, the Undercrypt - Land \nAs this land enters, you may pay 3 life. If you don't, it enters tapped.\n{T}: Add {B}.","layout":"modal_dfc","cmc":3,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":["B"]}, // targeted (game-deck shape)
  {"name":"Growing Rites of Itlimoc // Itlimoc, Cradle of the Sun","type":"Legendary Enchantment // Legendary Land","mana":"{2}{G}","oracle":"Growing Rites of Itlimoc - Legendary Enchantment {2}{G}\nWhen Growing Rites of Itlimoc enters, look at the top four cards of your library. You may reveal a creature card from among them and put it into your hand. Put the rest on the bottom of your library in any order.\nAt the beginning of your end step, if you control four or more creatures, transform Growing Rites of Itlimoc.\n//\nItlimoc, Cradle of the Sun - Legendary Land \n(Transforms from Growing Rites of Itlimoc.)\n{T}: Add {G}.\n{T}: Add {G} for each creature you control.","layout":"transform","cmc":3,"power":null,"toughness":null,"loyalty":null,"keywords":["Transform"],"colors":[],"colorIdentity":["G"]}, // layout:transform (game-deck shape)
  {"name":"Etali, Primal Conqueror // Etali, Primal Sickness","type":"Legendary Creature — Elder Dinosaur // Legendary Creature — Phyrexian Elder Dinosaur","mana":"{5}{R}{R}","oracle":"Etali, Primal Conqueror - Legendary Creature — Elder Dinosaur {5}{R}{R}\nTrample\nWhen Etali enters, each player exiles cards from the top of their library until they exile a nonland card. You may cast any number of spells from among the nonland cards exiled this way without paying their mana costs.\n{9}{G/P}: Transform Etali. Activate only as a sorcery.\n//\nEtali, Primal Sickness - Legendary Creature — Phyrexian Elder Dinosaur \nTrample, indestructible\nWhenever Etali deals combat damage to a player, they get that many poison counters. (A player with ten or more poison counters loses the game.)","layout":"transform","cmc":7,"power":"7","toughness":"7","loyalty":null,"keywords":["Indestructible","Transform","Trample"],"colors":[],"colorIdentity":["G","R"]}, // layout:transform (game-deck shape)
  {"name":"Ojer Taq, Deepest Foundation // Temple of Civilization","type":"Legendary Creature — God // Land","mana":"{4}{W}{W}","oracle":"Ojer Taq, Deepest Foundation - Legendary Creature — God {4}{W}{W}\nVigilance\nIf one or more creature tokens would be created under your control, three times that many of those tokens are created instead.\nWhen Ojer Taq dies, return it to the battlefield tapped and transformed under its owner's control.\n//\nTemple of Civilization - Land \n(Transforms from Ojer Taq, Deepest Foundation.)\n{T}: Add {W}.\n{2}{W}, {T}: Transform this land. Activate only if you attacked with three or more creatures this turn and only as a sorcery.","layout":"transform","cmc":6,"power":"6","toughness":"6","loyalty":null,"keywords":["Vigilance","Transform"],"colors":[],"colorIdentity":["W"]}, // layout:transform (game-deck shape)
  {"name":"Sephiroth, Fabled SOLDIER // Sephiroth, One-Winged Angel","type":"Legendary Creature — Human Avatar Soldier // Legendary Creature — Angel Nightmare Avatar","mana":"{2}{B}","oracle":"Sephiroth, Fabled SOLDIER - Legendary Creature — Human Avatar Soldier {2}{B}\nWhenever Sephiroth enters or attacks, you may sacrifice another creature. If you do, draw a card.\nWhenever another creature dies, target opponent loses 1 life and you gain 1 life. If this is the fourth time this ability has resolved this turn, transform Sephiroth.\n//\nSephiroth, One-Winged Angel - Legendary Creature — Angel Nightmare Avatar \nFlying\nSuper Nova — As this creature transforms into Sephiroth, One-Winged Angel, you get an emblem with \"Whenever a creature dies, target opponent loses 1 life and you gain 1 life.\"\nWhenever Sephiroth attacks, you may sacrifice any number of other creatures. If you do, draw that many cards.","layout":"transform","cmc":3,"power":"3","toughness":"3","loyalty":null,"keywords":["Flying","Transform","Super Nova"],"colors":[],"colorIdentity":["B"]}, // layout:transform (game-deck shape)
  {"name":"Sink into Stupor // Soporific Springs","type":"Instant // Land","mana":"{1}{U}{U}","oracle":"Sink into Stupor - Instant {1}{U}{U}\nReturn target spell or nonland permanent an opponent controls to its owner's hand.\n//\nSoporific Springs - Land \nAs this land enters, you may pay 3 life. If you don't, it enters tapped.\n{T}: Add {U}.","layout":"modal_dfc","cmc":3,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":["U"]}, // layout:modal_dfc (game-deck shape)
  {"name":"Fell the Profane // Fell Mire","type":"Instant // Land","mana":"{2}{B}{B}","oracle":"Fell the Profane - Instant {2}{B}{B}\nDestroy target creature or planeswalker.\n//\nFell Mire - Land \nAs this land enters, you may pay 3 life. If you don't, it enters tapped.\n{T}: Add {B}.","layout":"modal_dfc","cmc":4,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":["B"]}, // layout:modal_dfc (game-deck shape)
  {"name":"Malakir Rebirth // Malakir Mire","type":"Instant // Land","mana":"{B}","oracle":"Malakir Rebirth - Instant {B}\nChoose target creature. You lose 2 life. Until end of turn, that creature gains \"When this creature dies, return it to the battlefield tapped under its owner's control.\"\n//\nMalakir Mire - Land \nThis land enters tapped.\n{T}: Add {B}.","layout":"modal_dfc","cmc":1,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":["B"]}, // layout:modal_dfc (game-deck shape)
];

// ─── THE REFERENCE — 35198906's code, verbatim, with no memo anywhere ──────────────────────────────────────────────────────────
// faceUp.js (readsAsFrontFace, faceUpOracleOf, faceUpView without its memo; faceUpTypeLine, frontFaceColors and
// splitCard.parseFaceBlock are unchanged and imported).
function oldTypeLineOf(card) {
  return String(card?.type || card?.type_line || "");
}
function oldReadsAsFrontFace(card) {
  return !!card && typeof card === "object" && card.layout !== "split" && oldTypeLineOf(card).includes(" // ");
}
function oldFaceUpOracleOf(card) {
  const oracle = String(card?.oracle ?? card?.oracle_text ?? "");
  const blocks = oracle.split(/\n\/\/\n/);
  return blocks.length > 1 ? (parseFaceBlock(blocks[0])?.oracle ?? "") : oracle;
}
function oldFaceUpView(card) {
  if (!oldReadsAsFrontFace(card)) return card;
  const type = faceUpTypeLine(card);
  const text = oldFaceUpOracleOf(card);
  const front = frontFaceColors(card);
  return { ...card, type, type_line: type, oracle: text, oracle_text: text, keywords: [], ...(front ? { colors: front } : {}) };
}
// keywords.js (hasKeyword, its pattern and the leveler band split).
const OLD_LEVEL_BAND_SPLIT_RE = /(?:^|\n)LEVEL \d+(?:-\d+|\+)\s*(?:\n|$)/;
function oldPatternFor(keyword) {
  return new RegExp(`(^|\\n|; |, )${keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
}
function oldHasKeyword(cardIn, keyword) {
  if (!cardIn || !keyword) return false;
  const card = oldFaceUpView(cardIn);
  const oracle = card.oracle || card.oracle_text || "";
  const bandSplit = oracle ? oracle.search(OLD_LEVEL_BAND_SPLIT_RE) : -1;
  if (bandSplit === -1) {
    const kws = Array.isArray(card.keywords) ? card.keywords : [];
    if (kws.length && kws.some(k => String(k).toLowerCase() === keyword.toLowerCase())) return true;
    if (!oracle) return false;
    return oldPatternFor(keyword).test(oracle);
  }
  return oldPatternFor(keyword).test(oracle.slice(0, bandSplit));
}
// layers.js (cardTypesOf, subtypesOf, printedKeywords).
function oldCardTypesOf(card) {
  const head = faceUpTypeLine(card).split("—")[0];
  return head.trim().split(/\s+/).filter(w => w && w[0] === w[0].toUpperCase());
}
function oldSubtypesOf(card) {
  const line = faceUpTypeLine(card);
  const dash = line.indexOf("—");
  if (dash === -1) return [];
  return line.slice(dash + 1).trim().split(/\s+/).filter(Boolean);
}
const oldPrintedKeywords = (card) => COMBAT_KEYWORDS.filter((kw) => oldHasKeyword(card, kw)).map((kw) => kw.toLowerCase());
// combatEvasion.js (selfOracleUncached and the team gate's sentence; the old memo of selfOracle was keyed by name + text).
function oldEscapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function oldSelfOracle(card) {
  let t = String(card?.oracle || "").replace(/\([^)]*\)/g, " ").toLowerCase().replace(/[’']/g, "'");
  const name = String(card?.name || "").toLowerCase().replace(/[’']/g, "'");
  if (name) t = t.replace(new RegExp(`\\b${oldEscapeRegExp(name)}\\b`, "g"), "this creature");
  const shortName = name.split(",")[0].trim();
  if (shortName && shortName !== name) t = t.replace(new RegExp(`\\b${oldEscapeRegExp(shortName)}\\b`, "g"), "this creature");
  return t;
}
const OLD_TEAM_RE = new RegExp(`(?:^|[\\n.;])\\s*creatures with power less than this creature's power can't block creatures you control\\s*(?:\\.|$)`);
const oldTeamPowerBlockGateOf = (card) => OLD_TEAM_RE.test(oldSelfOracle(oldFaceUpView(card)));
// protection.js (parseProtectionColors, parseProtectionClasses and their helpers).
const OLD_COLOR_WORD = { white: "W", blue: "U", black: "B", red: "R", green: "G" };
const OLD_ALL_COLORS = ["W", "U", "B", "R", "G"];
function oldProtectionSentence(oracle, index) {
  const start = Math.max(oracle.lastIndexOf(".", index), oracle.lastIndexOf("\n", index)) + 1;
  const ends = [oracle.indexOf(".", index), oracle.indexOf("\n", index)].filter((i) => i >= 0);
  return oracle.slice(start, ends.length ? Math.min(...ends) : oracle.length).toLowerCase();
}
const OLD_NOT_A_KEYWORD_ITEM_RE = /\b(?:have|has|gets?|gains?|with|you|your|creatures?|permanents?|equipped|enchanted|fortified|target|each|all|other|tokens?|it|they)\b|[+\-\d/{}"“]/;
function oldIsOwnProtectionClause(oracle, index, name) {
  const start = Math.max(oracle.lastIndexOf(".", index), oracle.lastIndexOf("\n", index)) + 1;
  const prefix = oracle.slice(start, index).toLowerCase().replace(/\s+/g, " ").trim();
  if (prefix === "") return true;
  const items = prefix.split(/,|\band\b/).map((s) => s.trim());
  if (items.length > 1 && items.every((s) => s === "" || !OLD_NOT_A_KEYWORD_ITEM_RE.test(s))) return true;
  const lower = String(name || "").toLowerCase();
  const names = [lower, lower.split(",")[0]].filter(Boolean);
  const subject = prefix.match(/^(.+?) (?:has|gets [^.;]*? and has)$/);
  return !!subject && (/^this (?:creature|permanent|artifact|land|enchantment)$/.test(subject[1]) || names.includes(subject[1]));
}
function oldParseProtectionColors(card, { ownOnly = false } = {}) {
  const oracle = String(card?.oracle ?? card?.oracle_text ?? "");
  const set = new Set();
  for (const m of oracle.matchAll(/protection from ([^.;,()\n]+)/gi)) {
    const before = oracle.slice(Math.max(0, m.index - 16), m.index).toLowerCase();
    if (/\bgains?\s+$/.test(before)) continue;
    if (/\bas long as\b/.test(oldProtectionSentence(oracle, m.index))) continue;
    if (ownOnly && !oldIsOwnProtectionClause(oracle, m.index, card?.name)) continue;
    const tail = m[1].toLowerCase().trim();
    if (/^all colors\b/.test(tail) || /^each color\b/.test(tail)) {
      for (const c of OLD_ALL_COLORS) set.add(c);
      continue;
    }
    for (const word of tail.split(/\band from\b|\band\b/)) {
      const q = word.trim();
      if (OLD_COLOR_WORD[q]) set.add(OLD_COLOR_WORD[q]);
    }
  }
  return set;
}
function oldParseProtectionClasses(card) {
  const oracle = String(card?.oracle ?? card?.oracle_text ?? "");
  const set = new Set();
  for (const m of oracle.matchAll(/protection from ([^.;,()\n]+)/gi)) {
    const before = oracle.slice(Math.max(0, m.index - 16), m.index).toLowerCase();
    if (/\bgains?\s+$/.test(before)) continue;
    if (/\bas long as\b/.test(oldProtectionSentence(oracle, m.index))) continue;
    if (m[1].toLowerCase().trim() === "creatures") set.add("creatures");
  }
  return set;
}

// ─── harness ────────────────────────────────────────────────────────────────────────────────────────────────────────────────
const byName = (name) => {
  const card = CORPUS.find((c) => c.name === name);
  if (!card) throw new Error(`not in the corpus sample: ${name}`);
  return card;
};
const P = (id, card, controller = "user", extra = {}) => ({ ...createPermanent({ id, card: { ...card, id: `c-${id}` }, controller, summoningSick: false }), ...extra });
/** A two-player table at the user's main phase; `extra` overrides any field (a combat, a step). */
function board(user, ai = [], extra = {}) {
  const g = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...g, turn: 5, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main", stack: [], pendingTriggers: [], consecutivePasses: 0,
    players: { ...g.players, user: { ...g.players.user, battlefield: user }, ai: { ...g.players.ai, battlefield: ai } },
    ...extra,
  };
}
/** The same table at the ai's declare-blockers step, `attackers` (ids) attacking the ai. */
const blocks = (user, ai, attackers) => board(user, ai, {
  phase: "combat", step: "declare-blockers",
  combat: { attackers: attackers.map((id) => ({ permanentId: id, attackingPlayer: "user", defender: "ai" })), blockers: [] },
});
// Every keyword the engine asks hasKeyword about: the combat set, the static-grant set, the printed-only ones, case variants and
// the engine's pseudo-keywords (the granted can't-block / unblockable / except-by riders ride the same read).
const KEYWORDS = [
  ...COMBAT_KEYWORDS, "Hexproof", "Indestructible", "Shroud", "Defender", "Shadow", "Flanking", "Exalted", "Infect", "Wither", "Intimidate",
  "Skulk", "Horsemanship", "Plainswalk", "Islandwalk", "Swampwalk", "Mountainwalk", "Forestwalk", "Nonbasic landwalk", "Ward",
  "Protection", "Changeling", "Level up", "Transform", "Equip", "flying", "FIRST STRIKE", "cantBlock", "unblockable",
  "cantBlockSource:perm-7", "cantBeBlockedExceptBy:Haste",
];
const COMBINED_IN_SAMPLE = CORPUS.filter((c) => oldReadsAsFrontFace(c)).length;

// ─── faceUp.faceUpView ───────────────────────────────────────────────────────────────────────────────────────────────────────
describe("faceUpView — one face read per card object", () => {
  it("answers what 35198906's face read answered, for every corpus card in both shapes, and the second read is the first's answer", () => {
    const diffs = [];
    let combined = 0;
    for (const card of CORPUS) {
      const before = oldFaceUpView(card);
      const view = faceUpView(card);
      if (before === card) { if (view !== card) diffs.push(`${card.name}: not itself`); }
      else {
        combined += 1;
        if (view === card) diffs.push(`${card.name}: itself, not its front face`);
        else expect(view).toEqual(before);
      }
      if (faceUpView(card) !== view) diffs.push(`${card.name}: a second read built a second view`);
    }
    expect(diffs).toEqual([]);
    // Seen to matter: the sample's transform, modal, flip, adventure and meld cards (a split card stays whole, CR 709.4c).
    expect(combined).toBe(COMBINED_IN_SAMPLE);
    expect(combined).toBe(37);
  });

  it("the front face is read off the face blocks: Westvale Abbey is a land with no keyword, its back face's flying and lifelink nowhere", () => {
    const abbey = byName("Westvale Abbey // Ormendahl, Profane Prince");
    expect(abbey.keywords).toEqual(expect.arrayContaining(["Flying", "Lifelink"])); // Scryfall's array: both faces together
    const view = faceUpView(abbey);
    expect([view.type, view.keywords, /flying/i.test(view.oracle)]).toEqual(["Land", [], false]);
    expect(["Flying", "Lifelink", "Haste"].map((kw) => hasKeyword(abbey, kw))).toEqual([false, false, false]);
  });

  it("a card whose characteristics are its own maps to ITSELF, so an edit to it is read live (never an earlier answer)", () => {
    const angel = { ...byName("Serra Angel") };
    expect(faceUpView(angel)).toBe(angel);
    expect(hasKeyword(angel, "Lifelink")).toBe(false);
    angel.oracle = "Flying, vigilance, lifelink";
    expect(faceUpView(angel)).toBe(angel);
    expect([hasKeyword(angel, "Lifelink"), oldHasKeyword(angel, "Lifelink")]).toEqual([true, true]);
  });

  it("each card object is its own key: two copies of one double-faced card each read as the reference does", () => {
    const delver = byName("Delver of Secrets // Insectile Aberration");
    const a = { ...delver };
    const b = { ...delver };
    expect(faceUpView(a)).not.toBe(faceUpView(b));
    expect([faceUpView(a), faceUpView(b)]).toEqual([oldFaceUpView(a), oldFaceUpView(b)]);
    expect([hasKeyword(a, "Flying"), hasKeyword(b, "Flying")]).toEqual([false, false]); // Insectile Aberration flies; Delver doesn't
  });
});

// ─── keywords.hasKeyword / printedKeywordsOf ─────────────────────────────────────────────────────────────────────────────────
describe("hasKeyword — the text read once per text", () => {
  it("every corpus card × every keyword the engine asks: 35198906's answer, cold and warm", () => {
    const diffs = [];
    let yes = 0;
    for (let pass = 0; pass < 2; pass++) {
      for (const card of CORPUS) {
        for (const kw of KEYWORDS) {
          const want = oldHasKeyword(card, kw);
          if (hasKeyword(card, kw) !== want) diffs.push(`${card.name} / ${kw} (pass ${pass})`);
          if (want && pass === 0) yes += 1;
        }
      }
    }
    expect(diffs).toEqual([]);
    expect(yes).toBe(114); // seen to matter: 114 printed keywords in the sample's 5,576 asks (136 cards × 41 keywords)
  });

  it("a leveler's band keywords stay out (CR 711.4): Student of Warfare has neither strike printed", () => {
    const student = byName("Student of Warfare");
    expect(student.oracle).toMatch(/First strike/);
    expect(["First strike", "Double strike"].map((kw) => [hasKeyword(student, kw), oldHasKeyword(student, kw)])).toEqual([[false, false], [false, false]]);
  });

  it("printedKeywordsOf is hasKeyword for each combat keyword, in the order asked", () => {
    const diffs = CORPUS.filter((card) => JSON.stringify(printedKeywordsOf(card, COMBAT_KEYWORDS)) !== JSON.stringify(COMBAT_KEYWORDS.filter((kw) => oldHasKeyword(card, kw))));
    expect(diffs.map((c) => c.name)).toEqual([]);
    expect(printedKeywordsOf(byName("Vampire Nighthawk"), COMBAT_KEYWORDS)).toEqual(["Flying", "Deathtouch", "Lifelink"]);
    expect([printedKeywordsOf(null, COMBAT_KEYWORDS), printedKeywordsOf(byName("Serra Angel"), ["", null, "Vigilance"])]).toEqual([[], ["Vigilance"]]);
  });

  it("the keywords array is read live: the same text with an edited array answers the array", () => {
    const bears = { ...byName("Grizzly Bears") };
    expect(hasKeyword(bears, "Flying")).toBe(false);
    bears.keywords = ["Flying"];
    expect([hasKeyword(bears, "Flying"), oldHasKeyword(bears, "Flying")]).toEqual([true, true]);
    bears.keywords = [];
    expect(hasKeyword(bears, "Flying")).toBe(false);
  });
});

// ─── layers: the printed keyword seed, card types and subtypes ───────────────────────────────────────────────────────────────
describe("the layer derive's printed keyword seed, card types and subtypes — on real game states", () => {
  it("every corpus card alone on a board: the keyword set, card types and subtypes 35198906 derived, in order", () => {
    const diffs = [];
    let compared = 0;
    for (const [i, card] of CORPUS.entries()) {
      const id = `p${i}`;
      const s = board([P(id, card)]);
      const d = deriveCharacteristics(s, id);
      if (d.appliedEffects.length || d.copiableValues) continue; // its own static applies to it: the full derive, not the seed
      compared += 1;
      const perm = s.players.user.battlefield[0];
      const want = { keywords: oldPrintedKeywords(perm.card), types: oldCardTypesOf(perm.card), subtypes: oldSubtypesOf(perm.card) };
      const got = { keywords: [...d.keywords], types: d.types, subtypes: d.subtypes };
      if (JSON.stringify(got) !== JSON.stringify(want)) diffs.push(card.name);
    }
    expect(diffs).toEqual([]);
    expect(compared).toBe(133); // of 136 — three cards' own statics apply to themselves
  });

  it("the same card on a changed board answers the new board — a keyword counter, an anthem's grant, and neither", () => {
    const wraith = P("w", byName("Bog Wraith"));
    const flies = (s) => [permanentHasKeyword(s, "w", "Flying"), deriveCharacteristics(s, "w").keywords.has("flying")];
    const plain = board([wraith]);
    expect(flies(plain)).toEqual([false, false]);
    expect(flies(board([{ ...wraith, counters: { flying: 1 } }]))).toEqual([true, true]); // the same card object (CR 613.1f)
    expect(flies(board([wraith, P("lev", byName("Levitation"))]))).toEqual([true, true]); // "Creatures you control have flying."
    expect(flies(board([wraith]))).toEqual([false, false]); // a new board without either
    expect(flies(plain)).toEqual([false, false]); // and the first board still answers itself
    expect(deriveCharacteristics(plain, "w").keywords.has("swampwalk")).toBe(false); // not a combat keyword: never seeded
    expect(permanentHasKeyword(plain, "w", "Swampwalk")).toBe(true);
  });

  it("every read owns its card types and subtypes: an edit to one derive's arrays reaches no other", () => {
    const a = board([P("a", byName("Serra Angel"))]);
    const b = board([P("b", byName("Serra Angel"))]);
    const ta = permanentTypes(a, "a");
    ta.types.push("Artifact");
    ta.subtypes.push("Construct");
    expect(permanentTypes(b, "b")).toEqual({ types: ["Creature"], subtypes: ["Angel"] });
    expect(permanentTypes(board([P("c", byName("Serra Angel"))]), "c")).toEqual({ types: ["Creature"], subtypes: ["Angel"] });
  });
});

// ─── combatEvasion.teamPowerBlockGateOf ──────────────────────────────────────────────────────────────────────────────────────
describe("Champion of Lambholt's team block gate — once per text", () => {
  const CHAMPION = byName("Champion of Lambholt");

  it("every corpus card: 35198906's answer, and the Champion is the only card in the sample that prints it", () => {
    const diffs = CORPUS.filter((card) => teamPowerBlockGateOf(card) !== oldTeamPowerBlockGateOf(card));
    expect(diffs.map((c) => c.name)).toEqual([]);
    expect(CORPUS.filter((card) => teamPowerBlockGateOf(card)).map((c) => c.name)).toEqual(["Champion of Lambholt"]);
    // The siblings that must not read as it: the self form, a flying filter, a different quantity.
    expect(["Wandering Wolf", "Silumgar Assassin", "Bower Passage", "Kraken of the Straits"].map((n) => teamPowerBlockGateOf(byName(n)))).toEqual([false, false, false, false]);
  });

  it("the card's own name in place of \"this creature\" reads the same; the same text under another name does not", () => {
    const named = { ...CHAMPION, oracle: CHAMPION.oracle.replace("this creature's power", "Champion of Lambholt's power") };
    expect([teamPowerBlockGateOf(named), oldTeamPowerBlockGateOf(named)]).toEqual([true, true]);
    const renamed = { ...named, name: "Lambholt Pacifist" };
    expect([teamPowerBlockGateOf(renamed), oldTeamPowerBlockGateOf(renamed)]).toEqual([false, false]);
  });

  it("an edited text under the same name is a new key, and each name answers for itself", () => {
    const proxy = { name: "Proxy Creature", type: "Creature — Human", oracle: "" };
    expect(teamPowerBlockGateOf(proxy)).toBe(false);
    expect(teamPowerBlockGateOf({ ...proxy, oracle: CHAMPION.oracle })).toBe(true);
    expect(teamPowerBlockGateOf({ ...proxy, name: "Other Proxy", oracle: CHAMPION.oracle })).toBe(true);
    expect(teamPowerBlockGateOf(proxy)).toBe(false);
  });

  it("the same Champion on a changed board answers the new board: its counters, its absence, its return (CR 509.1b, 611.3a)", () => {
    const champ = P("champ", CHAMPION);
    const attacker = P("att", byName("Grizzly Bears"));
    const bears = P("blk", byName("Grizzly Bears"), "ai");
    const giant = P("giant", byName("Hill Giant"), "ai");
    const big = { ...champ, counters: { "+1/+1": 2 } }; // a 3/3 Champion: a power-2 creature can't block, a power-3 one can
    const canBlock = (user) => {
      const s = blocks(user, [bears, giant], ["att"]);
      return [canBlockAttacker(s, "blk", "att", "ai"), canBlockAttacker(s, "giant", "att", "ai")];
    };
    expect(canBlock([big, attacker])).toEqual([false, true]);
    expect(canBlock([champ, attacker])).toEqual([true, true]); // the same card, no counters: a 1/1 bars nothing here
    expect(canBlock([attacker])).toEqual([true, true]); // the Champion gone
    expect(canBlock([big, attacker])).toEqual([false, true]); // and back
  });
});

// ─── protection.parseProtectionColors / parseProtectionClasses ───────────────────────────────────────────────────────────────
describe("printed protection — once per text", () => {
  it("every corpus card, own clauses or all: the colours and classes 35198906 read, in the same order, cold and warm", () => {
    const diffs = [];
    let colored = 0;
    for (let pass = 0; pass < 2; pass++) {
      for (const card of CORPUS) {
        const got = [[...parseProtectionColors(card)], [...parseProtectionColors(card, { ownOnly: true })], [...parseProtectionClasses(card)]];
        const want = [[...oldParseProtectionColors(card)], [...oldParseProtectionColors(card, { ownOnly: true })], [...oldParseProtectionClasses(card)]];
        if (JSON.stringify(got) !== JSON.stringify(want)) diffs.push(`${card.name} (pass ${pass})`);
        if (pass === 0 && want[0].length) colored += 1;
      }
    }
    expect(diffs).toEqual([]);
    expect(colored).toBe(13);
    // The shapes: another object's (a Sword), all colours, a class, a grant, a conditional.
    const read = (n) => [[...parseProtectionColors(byName(n))], [...parseProtectionColors(byName(n), { ownOnly: true })], [...parseProtectionClasses(byName(n))]];
    expect(read("Sword of Fire and Ice")).toEqual([["R", "U"], [], []]);
    expect(read("Iridescent Angel")[1]).toEqual(["W", "U", "B", "R", "G"]);
    expect(read("Beloved Chaplain")[2]).toEqual(["creatures"]);
    expect(read("Mother of Runes")).toEqual([[], [], []]);
    expect(read("Etched Champion")).toEqual([[], [], []]);
  });

  it("the own-clause read is the card's own: the same text under another name answers for that name", () => {
    const knight = { name: "Proxy Knight", oracle: "Proxy Knight has protection from black." };
    const other = { ...knight, name: "Other Knight" };
    const own = (c) => [[...parseProtectionColors(c, { ownOnly: true })], [...oldParseProtectionColors(c, { ownOnly: true })]];
    expect(own(knight)).toEqual([["B"], ["B"]]);
    expect(own(other)).toEqual([[], []]);
    expect(own(knight)).toEqual([["B"], ["B"]]);
  });

  it("every caller gets its own Set", () => {
    const angel = byName("Iridescent Angel");
    parseProtectionColors(angel).clear();
    parseProtectionClasses(byName("Beloved Chaplain")).add("everything");
    expect([[...parseProtectionColors(angel)], [...parseProtectionClasses(byName("Beloved Chaplain"))]]).toEqual([["W", "U", "B", "R", "G"], ["creatures"]]);
  });

  it("the same creature on a changed board answers the new board: an attached Sword's protection comes and goes", () => {
    const bears = P("b", byName("Grizzly Bears"));
    const sword = P("s", byName("Sword of Fire and Ice"));
    const equipped = board([{ ...bears, attachments: ["s"] }, { ...sword, attachedTo: "b" }]);
    expect([...permanentProtectionColors(equipped, "b")].sort()).toEqual(["R", "U"]);
    expect([...permanentProtectionColors(board([bears, sword]), "b")]).toEqual([]);
  });
});

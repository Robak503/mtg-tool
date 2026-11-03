/**
 * countedCostChoice.test.js — WHO CHOOSES THE CARDS A COUNTED COST PAYS WITH (pw25's blind review, F1; CR 602.2b, 601.2h).
 *
 * "Discard N cards" and "Exile N cards from your graveyard" on an activated ability are paid as the ability is activated, by its
 * controller (CR 602.2b — the casting process; CR 601.2h — "The player pays the total cost"). Before this fix every seat was offered ONE
 * set, the N least valuable (legalChoices' frozen pick), so a person could never pitch Griselbrand to Nezahal. Now
 * legalChoices.countedCostSets offers a seat a person plays (auraEntry.seatIsHuman — state.humanSeats) one activation per
 * distinct-name set of N, least valuable first, bounded: the first 64 sets, then one covering set per card name in none of them, so every
 * card can pay. A seat no person plays keeps the single least-valuable offer (self-play byte-identical). The cards: Nezahal, Primal Tide,
 * Anurid Brushhopper, Fleeting Spirit (the exile), and the four that already shipped on the convention — Solphim, Mayhem Dominus, Zombie
 * Infestation, Latulla, Keldon Overseer, Fae of Wishes.
 *
 * The round-2 recheck: R2-F1 — beside a target list (Grim Lavamancer, Latulla, Cabal Surgeon) every set stood beside every row and
 * every X, the product the target cap bounds: a person's Lavamancer offered 832 activations in a midgame pod, 29,632 beside 150
 * Squirrels per opponent. Now the sets are one more cost-choice dimension of the nest: the full product while rows × sets stays within
 * 64, past that every set beside the first row that pays, each other row beside its least valuable set, and one offer more for a card
 * no offer pays with yet — every target and every set reached, rows + sets − 1 per X. R2-F2 — two graveyard cards of one name that
 * another lane tells apart (a flashback granted this turn, milled this turn) are two choices.
 *
 * Card text: the bundled Scryfall oracle (cardIndex.publicCard → learnDeckEnrich.mergeCardData), generated, never typed — GY100 too, the
 * bundled oracle's 100 most-played single-faced nonland cards (the bound rows' graveyard).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { parseEffectClause } from "./effects/parser.js";
import { resolveAtom } from "./effects/effectAtoms.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { actionLabel } from "./actionLabel.js";
import { permanentFaceCard } from "./adventure.js";

beforeEach(() => _resetIdsForTests());

const NEZAHAL = {"name":"Nezahal, Primal Tide","type":"Legendary Creature — Elder Dinosaur","mana":"{5}{U}{U}","oracle":"This spell can't be countered.\nYou have no maximum hand size.\nWhenever an opponent casts a noncreature spell, draw a card.\nDiscard three cards: Exile Nezahal. Return it to the battlefield tapped under its owner's control at the beginning of the next end step.","layout":"normal","cmc":7,"power":"7","toughness":"7","loyalty":null,"keywords":[],"colors":["U"],"colorIdentity":["U"]}; // EDHREC #1114
const BRUSHHOPPER = {"name":"Anurid Brushhopper","type":"Creature — Frog Beast","mana":"{1}{G}{W}","oracle":"Discard two cards: Exile this creature. Return it to the battlefield under its owner's control at the beginning of the next end step.","layout":"normal","cmc":3,"power":"3","toughness":"4","loyalty":null,"keywords":[],"colors":["G","W"],"colorIdentity":["G","W"]}; // EDHREC #31183
const FLEETING = {"name":"Fleeting Spirit","type":"Creature — Spirit","mana":"{1}{W}","oracle":"{W}, Exile three cards from your graveyard: This creature gains first strike until end of turn.\nDiscard a card: Exile this creature. Return it to the battlefield under its owner's control at the beginning of the next end step.","layout":"normal","cmc":2,"power":"3","toughness":"1","loyalty":null,"keywords":[],"colors":["W"],"colorIdentity":["W"]}; // EDHREC #21008
const SOLPHIM = {"name":"Solphim, Mayhem Dominus","type":"Legendary Creature — Phyrexian Horror","mana":"{2}{R}{R}","oracle":"If a source you control would deal noncombat damage to an opponent or a permanent an opponent controls, it deals double that damage to that player or permanent instead.\n{1}{R/P}{R/P}, Discard two cards: Put an indestructible counter on Solphim. ({R/P} can be paid with either {R} or 2 life.)","layout":"normal","cmc":4,"power":"5","toughness":"4","loyalty":null,"keywords":["Double"],"colors":["R"],"colorIdentity":["R"]}; // EDHREC #896
const INFESTATION = {"name":"Zombie Infestation","type":"Enchantment","mana":"{1}{B}","oracle":"Discard two cards: Create a 2/2 black Zombie creature token.","layout":"normal","cmc":2,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["B"],"colorIdentity":["B"]}; // EDHREC #9358
const LATULLA = {"name":"Latulla, Keldon Overseer","type":"Legendary Creature — Human Spellshaper","mana":"{3}{R}{R}","oracle":"{X}{R}, {T}, Discard two cards: Latulla deals X damage to any target.","layout":"normal","cmc":5,"power":"3","toughness":"3","loyalty":null,"keywords":[],"colors":["R"],"colorIdentity":["R"]}; // EDHREC #27852
const FAE = {"name":"Fae of Wishes // Granted","type":"Creature — Faerie Wizard // Sorcery — Adventure","mana":"{1}{U} // {3}{U}","oracle":"Fae of Wishes - Creature — Faerie Wizard {1}{U}\nFlying\n{1}{U}, Discard two cards: Return this creature to its owner's hand.\n//\nGranted - Sorcery — Adventure {3}{U}\nYou may reveal a noncreature card you own from outside the game and put it into your hand.","layout":"adventure","cmc":2,"power":"1","toughness":"4","loyalty":null,"keywords":["Flying"],"colors":["U"],"colorIdentity":["U"]}; // EDHREC #19906
const GRISELBRAND = {"name":"Griselbrand","type":"Legendary Creature — Demon","mana":"{4}{B}{B}{B}{B}","oracle":"Flying, lifelink\nPay 7 life: Draw seven cards.","layout":"normal","cmc":8,"power":"7","toughness":"7","loyalty":null,"keywords":["Flying","Lifelink"],"colors":["B"],"colorIdentity":["B"]}; // EDHREC #—
const COUNTERSPELL = {"name":"Counterspell","type":"Instant","mana":"{U}{U}","oracle":"Counter target spell.","layout":"normal","cmc":2,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["U"],"colorIdentity":["U"]}; // EDHREC #16
const ISLAND = {"name":"Island","type":"Basic Land — Island","mana":"","oracle":"({T}: Add {U}.)","layout":"normal","cmc":0,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":["U"]}; // EDHREC #—
const OPT = {"name":"Opt","type":"Instant","mana":"{U}","oracle":"Scry 1. (Look at the top card of your library. You may put that card on the bottom.)\nDraw a card.","layout":"normal","cmc":1,"power":null,"toughness":null,"loyalty":null,"keywords":["Scry"],"colors":["U"],"colorIdentity":["U"]}; // EDHREC #217
const DIVINATION = {"name":"Divination","type":"Sorcery","mana":"{2}{U}","oracle":"Draw two cards.","layout":"normal","cmc":3,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["U"],"colorIdentity":["U"]}; // EDHREC #6263
const LAVAMANCER = {"name":"Grim Lavamancer","type":"Creature — Human Wizard","mana":"{R}","oracle":"{R}, {T}, Exile two cards from your graveyard: This creature deals 2 damage to any target.","layout":"normal","cmc":1,"power":"1","toughness":"1","loyalty":null,"keywords":[],"colors":["R"],"colorIdentity":["R"]}; // EDHREC #15468
const SURGEON = {"name":"Cabal Surgeon","type":"Creature — Human Minion","mana":"{2}{B}{B}","oracle":"{2}{B}{B}, {T}, Exile two cards from your graveyard: Return target creature card from your graveyard to your hand.","layout":"normal","cmc":4,"power":"2","toughness":"1","loyalty":null,"keywords":[],"colors":["B"],"colorIdentity":["B"]}; // EDHREC #29963
const FROG = {"name":"Psychic Frog","type":"Creature — Frog","mana":"{U}{B}","oracle":"Whenever this creature deals combat damage to a player or planeswalker, draw a card.\nDiscard a card: Put a +1/+1 counter on this creature.\nExile three cards from your graveyard: This creature gains flying until end of turn.","layout":"normal","cmc":2,"power":"1","toughness":"2","loyalty":null,"keywords":[],"colors":["B","U"],"colorIdentity":["B","U"]}; // EDHREC #2104
const BOLT = {"name":"Lightning Bolt","type":"Instant","mana":"{R}","oracle":"Lightning Bolt deals 3 damage to any target.","layout":"normal","cmc":1,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["R"],"colorIdentity":["R"]}; // EDHREC #157
const BEARS = {"name":"Grizzly Bears","type":"Creature — Bear","mana":"{1}{G}","oracle":"","layout":"normal","cmc":2,"power":"2","toughness":"2","loyalty":null,"keywords":[],"colors":["G"],"colorIdentity":["G"]}; // EDHREC #8126
const FOREST = {"name":"Forest","type":"Basic Land — Forest","mana":"","oracle":"({T}: Add {G}.)","layout":"normal","cmc":0,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":["G"]}; // EDHREC #—
/** The bound rows' graveyard: the bundled oracle's 100 most-played single-faced nonland cards, most played first. */
const GY100 = [
  {"name":"Sol Ring","type":"Artifact","mana":"{1}","oracle":"{T}: Add {C}{C}.","layout":"normal","cmc":1,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":[]}, // EDHREC #1
  {"name":"Arcane Signet","type":"Artifact","mana":"{2}","oracle":"{T}: Add one mana of any color in your commander's color identity.","layout":"normal","cmc":2,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":[]}, // EDHREC #3
  {"name":"Swords to Plowshares","type":"Instant","mana":"{W}","oracle":"Exile target creature. Its controller gains life equal to its power.","layout":"normal","cmc":1,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["W"],"colorIdentity":["W"]}, // EDHREC #11
  {"name":"Swiftfoot Boots","type":"Artifact — Equipment","mana":"{2}","oracle":"Equipped creature has hexproof and haste. (It can't be the target of spells or abilities your opponents control. It can attack and {T} no matter when it came under your control.)\nEquip {1} ({1}: Attach to target creature you control. Equip only as a sorcery.)","layout":"normal","cmc":2,"power":null,"toughness":null,"loyalty":null,"keywords":["Equip"],"colors":[],"colorIdentity":[]}, // EDHREC #12
  {"name":"Lightning Greaves","type":"Artifact — Equipment","mana":"{2}","oracle":"Equipped creature has haste and shroud. (It can't be the target of spells or abilities.)\nEquip {0}","layout":"normal","cmc":2,"power":null,"toughness":null,"loyalty":null,"keywords":["Equip"],"colors":[],"colorIdentity":[]}, // EDHREC #13
  {"name":"Path to Exile","type":"Instant","mana":"{W}","oracle":"Exile target creature. Its controller may search their library for a basic land card, put that card onto the battlefield tapped, then shuffle.","layout":"normal","cmc":1,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["W"],"colorIdentity":["W"]}, // EDHREC #15
  {"name":"Counterspell","type":"Instant","mana":"{U}{U}","oracle":"Counter target spell.","layout":"normal","cmc":2,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["U"],"colorIdentity":["U"]}, // EDHREC #16
  {"name":"Fellwar Stone","type":"Artifact","mana":"{2}","oracle":"{T}: Add one mana of any color that a land an opponent controls could produce.","layout":"normal","cmc":2,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":[]}, // EDHREC #17
  {"name":"Cultivate","type":"Sorcery","mana":"{2}{G}","oracle":"Search your library for up to two basic land cards, reveal those cards, put one onto the battlefield tapped and the other into your hand, then shuffle.","layout":"normal","cmc":3,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["G"],"colorIdentity":["G"]}, // EDHREC #20
  {"name":"Thought Vessel","type":"Artifact","mana":"{2}","oracle":"You have no maximum hand size.\n{T}: Add {C}.","layout":"normal","cmc":2,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":[]}, // EDHREC #21
  {"name":"Blasphemous Act","type":"Sorcery","mana":"{8}{R}","oracle":"This spell costs {1} less to cast for each creature on the battlefield.\nBlasphemous Act deals 13 damage to each creature.","layout":"normal","cmc":9,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["R"],"colorIdentity":["R"]}, // EDHREC #22
  {"name":"Farseek","type":"Sorcery","mana":"{1}{G}","oracle":"Search your library for a Plains, Island, Swamp, or Mountain card, put it onto the battlefield tapped, then shuffle.","layout":"normal","cmc":2,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["G"],"colorIdentity":["G"]}, // EDHREC #23
  {"name":"Beast Within","type":"Instant","mana":"{2}{G}","oracle":"Destroy target permanent. Its controller creates a 3/3 green Beast creature token.","layout":"normal","cmc":3,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["G"],"colorIdentity":["G"]}, // EDHREC #25
  {"name":"Nature's Lore","type":"Sorcery","mana":"{1}{G}","oracle":"Search your library for a Forest card, put that card onto the battlefield, then shuffle.","layout":"normal","cmc":2,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["G"],"colorIdentity":["G"]}, // EDHREC #26
  {"name":"Rampant Growth","type":"Sorcery","mana":"{1}{G}","oracle":"Search your library for a basic land card, put that card onto the battlefield tapped, then shuffle.","layout":"normal","cmc":2,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["G"],"colorIdentity":["G"]}, // EDHREC #27
  {"name":"Chaos Warp","type":"Instant","mana":"{2}{R}","oracle":"The owner of target permanent shuffles it into their library, then reveals the top card of their library. If it's a permanent card, they put it onto the battlefield.","layout":"normal","cmc":3,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["R"],"colorIdentity":["R"]}, // EDHREC #29
  {"name":"Heroic Intervention","type":"Instant","mana":"{1}{G}","oracle":"Permanents you control gain hexproof and indestructible until end of turn.","layout":"normal","cmc":2,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["G"],"colorIdentity":["G"]}, // EDHREC #30
  {"name":"Mind Stone","type":"Artifact","mana":"{2}","oracle":"{T}: Add {C}.\n{1}, {T}, Sacrifice this artifact: Draw a card.","layout":"normal","cmc":2,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":[]}, // EDHREC #32
  {"name":"Dark Ritual","type":"Instant","mana":"{B}","oracle":"Add {B}{B}{B}.","layout":"normal","cmc":1,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["B"],"colorIdentity":["B"]}, // EDHREC #33
  {"name":"An Offer You Can't Refuse","type":"Instant","mana":"{U}","oracle":"Counter target noncreature spell. Its controller creates two Treasure tokens. (They're artifacts with \"{T}, Sacrifice this token: Add one mana of any color.\")","layout":"normal","cmc":1,"power":null,"toughness":null,"loyalty":null,"keywords":["Treasure"],"colors":["U"],"colorIdentity":["U"]}, // EDHREC #34
  {"name":"Birds of Paradise","type":"Creature — Bird","mana":"{G}","oracle":"Flying\n{T}: Add one mana of any color.","layout":"normal","cmc":1,"power":"0","toughness":"1","loyalty":null,"keywords":["Flying"],"colors":["G"],"colorIdentity":["G"]}, // EDHREC #35
  {"name":"Kodama's Reach","type":"Sorcery — Arcane","mana":"{2}{G}","oracle":"Search your library for up to two basic land cards, reveal those cards, put one onto the battlefield tapped and the other into your hand, then shuffle.","layout":"normal","cmc":3,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["G"],"colorIdentity":["G"]}, // EDHREC #37
  {"name":"Solemn Simulacrum","type":"Artifact Creature — Golem","mana":"{4}","oracle":"When this creature enters, you may search your library for a basic land card, put that card onto the battlefield tapped, then shuffle.\nWhen this creature dies, you may draw a card.","layout":"normal","cmc":4,"power":"2","toughness":"2","loyalty":null,"keywords":[],"colors":[],"colorIdentity":[]}, // EDHREC #39
  {"name":"Three Visits","type":"Sorcery","mana":"{1}{G}","oracle":"Search your library for a Forest card, put it onto the battlefield, then shuffle.","layout":"normal","cmc":2,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["G"],"colorIdentity":["G"]}, // EDHREC #40
  {"name":"Skullclamp","type":"Artifact — Equipment","mana":"{1}","oracle":"Equipped creature gets +1/-1.\nWhenever equipped creature dies, draw two cards.\nEquip {1}","layout":"normal","cmc":1,"power":null,"toughness":null,"loyalty":null,"keywords":["Equip"],"colors":[],"colorIdentity":[]}, // EDHREC #41
  {"name":"Rhystic Study","type":"Enchantment","mana":"{2}{U}","oracle":"Whenever an opponent casts a spell, you may draw a card unless that player pays {1}.","layout":"normal","cmc":3,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["U"],"colorIdentity":["U"]}, // EDHREC #46
  {"name":"Arcane Denial","type":"Instant","mana":"{1}{U}","oracle":"Counter target spell. Its controller may draw up to two cards at the beginning of the next turn's upkeep.\nYou draw a card at the beginning of the next turn's upkeep.","layout":"normal","cmc":2,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["U"],"colorIdentity":["U"]}, // EDHREC #52
  {"name":"Commander's Sphere","type":"Artifact","mana":"{3}","oracle":"{T}: Add one mana of any color in your commander's color identity.\nSacrifice this artifact: Draw a card.","layout":"normal","cmc":3,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":[]}, // EDHREC #53
  {"name":"Reanimate","type":"Sorcery","mana":"{B}","oracle":"Put target creature card from a graveyard onto the battlefield under your control. You lose life equal to that card's mana value.","layout":"normal","cmc":1,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["B"],"colorIdentity":["B"]}, // EDHREC #54
  {"name":"Cyclonic Rift","type":"Instant","mana":"{1}{U}","oracle":"Return target nonland permanent you don't control to its owner's hand.\nOverload {6}{U} (You may cast this spell for its overload cost. If you do, change \"target\" in its text to \"each.\")","layout":"normal","cmc":2,"power":null,"toughness":null,"loyalty":null,"keywords":["Overload"],"colors":["U"],"colorIdentity":["U"]}, // EDHREC #55
  {"name":"Negate","type":"Instant","mana":"{1}{U}","oracle":"Counter target noncreature spell.","layout":"normal","cmc":2,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["U"],"colorIdentity":["U"]}, // EDHREC #56
  {"name":"Llanowar Elves","type":"Creature — Elf Druid","mana":"{G}","oracle":"{T}: Add {G}.","layout":"normal","cmc":1,"power":"1","toughness":"1","loyalty":null,"keywords":[],"colors":["G"],"colorIdentity":["G"]}, // EDHREC #58
  {"name":"Generous Gift","type":"Instant","mana":"{2}{W}","oracle":"Destroy target permanent. Its controller creates a 3/3 green Elephant creature token.","layout":"normal","cmc":3,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["W"],"colorIdentity":["W"]}, // EDHREC #62
  {"name":"Demonic Tutor","type":"Sorcery","mana":"{1}{B}","oracle":"Search your library for a card, put that card into your hand, then shuffle.","layout":"normal","cmc":2,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["B"],"colorIdentity":["B"]}, // EDHREC #63
  {"name":"Smothering Tithe","type":"Enchantment","mana":"{3}{W}","oracle":"Whenever an opponent draws a card, that player may pay {2}. If the player doesn't, you create a Treasure token. (It's an artifact with \"{T}, Sacrifice this token: Add one mana of any color.\")","layout":"normal","cmc":4,"power":null,"toughness":null,"loyalty":null,"keywords":["Treasure"],"colors":["W"],"colorIdentity":["W"]}, // EDHREC #65
  {"name":"Toxic Deluge","type":"Sorcery","mana":"{2}{B}","oracle":"As an additional cost to cast this spell, pay X life.\nAll creatures get -X/-X until end of turn.","layout":"normal","cmc":3,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["B"],"colorIdentity":["B"]}, // EDHREC #66
  {"name":"Swan Song","type":"Instant","mana":"{U}","oracle":"Counter target enchantment, instant, or sorcery spell. Its controller creates a 2/2 blue Bird creature token with flying.","layout":"normal","cmc":1,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["U"],"colorIdentity":["U"]}, // EDHREC #67
  {"name":"Brainstorm","type":"Instant","mana":"{U}","oracle":"Draw three cards, then put two cards from your hand on top of your library in any order.","layout":"normal","cmc":1,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["U"],"colorIdentity":["U"]}, // EDHREC #72
  {"name":"Deflecting Swat","type":"Instant","mana":"{2}{R}","oracle":"If you control a commander, you may cast this spell without paying its mana cost.\nYou may choose new targets for target spell or ability.","layout":"normal","cmc":3,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["R"],"colorIdentity":["R"]}, // EDHREC #74
  {"name":"Esper Sentinel","type":"Artifact Creature — Human Soldier","mana":"{W}","oracle":"Whenever an opponent casts their first noncreature spell each turn, draw a card unless that player pays {X}, where X is this creature's power.","layout":"normal","cmc":1,"power":"1","toughness":"1","loyalty":null,"keywords":[],"colors":["W"],"colorIdentity":["W"]}, // EDHREC #79
  {"name":"Fierce Guardianship","type":"Instant","mana":"{2}{U}","oracle":"If you control a commander, you may cast this spell without paying its mana cost.\nCounter target noncreature spell.","layout":"normal","cmc":3,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["U"],"colorIdentity":["U"]}, // EDHREC #83
  {"name":"Chromatic Lantern","type":"Artifact","mana":"{3}","oracle":"Lands you control have \"{T}: Add one mana of any color.\"\n{T}: Add one mana of any color.","layout":"normal","cmc":3,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":[]}, // EDHREC #85
  {"name":"Garruk's Uprising","type":"Enchantment","mana":"{2}{G}","oracle":"When this enchantment enters, if you control a creature with power 4 or greater, draw a card.\nCreatures you control have trample. (Each of those creatures can deal excess combat damage to the player or planeswalker it's attacking.)\nWhenever a creature you control with power 4 or greater enters, draw a card.","layout":"normal","cmc":3,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["G"],"colorIdentity":["G"]}, // EDHREC #89
  {"name":"Feed the Swarm","type":"Sorcery","mana":"{1}{B}","oracle":"Destroy target creature or enchantment an opponent controls. You lose life equal to that permanent's mana value.","layout":"normal","cmc":2,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["B"],"colorIdentity":["B"]}, // EDHREC #90
  {"name":"Talisman of Dominance","type":"Artifact","mana":"{2}","oracle":"{T}: Add {C}.\n{T}: Add {U} or {B}. This artifact deals 1 damage to you.","layout":"normal","cmc":2,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":["B","U"]}, // EDHREC #93
  {"name":"Faithless Looting","type":"Sorcery","mana":"{R}","oracle":"Draw two cards, then discard two cards.\nFlashback {2}{R} (You may cast this card from your graveyard for its flashback cost. Then exile it.)","layout":"normal","cmc":1,"power":null,"toughness":null,"loyalty":null,"keywords":["Flashback"],"colors":["R"],"colorIdentity":["R"]}, // EDHREC #98
  {"name":"Frantic Search","type":"Instant","mana":"{2}{U}","oracle":"Draw two cards, then discard two cards. Untap up to three lands.","layout":"normal","cmc":3,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["U"],"colorIdentity":["U"]}, // EDHREC #99
  {"name":"Mystic Remora","type":"Enchantment","mana":"{U}","oracle":"Cumulative upkeep {1} (At the beginning of your upkeep, put an age counter on this permanent, then sacrifice it unless you pay its upkeep cost for each age counter on it.)\nWhenever an opponent casts a noncreature spell, you may draw a card unless that player pays {4}.","layout":"normal","cmc":1,"power":null,"toughness":null,"loyalty":null,"keywords":["Cumulative upkeep"],"colors":["U"],"colorIdentity":["U"]}, // EDHREC #100
  {"name":"Vandalblast","type":"Sorcery","mana":"{R}","oracle":"Destroy target artifact you don't control.\nOverload {4}{R} (You may cast this spell for its overload cost. If you do, change \"target\" in its text to \"each.\")","layout":"normal","cmc":1,"power":null,"toughness":null,"loyalty":null,"keywords":["Overload"],"colors":["R"],"colorIdentity":["R"]}, // EDHREC #101
  {"name":"Elvish Mystic","type":"Creature — Elf Druid","mana":"{G}","oracle":"{T}: Add {G}.","layout":"normal","cmc":1,"power":"1","toughness":"1","loyalty":null,"keywords":[],"colors":["G"],"colorIdentity":["G"]}, // EDHREC #102
  {"name":"Phyrexian Arena","type":"Enchantment","mana":"{1}{B}{B}","oracle":"At the beginning of your upkeep, you draw a card and lose 1 life.","layout":"normal","cmc":3,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["B"],"colorIdentity":["B"]}, // EDHREC #103
  {"name":"Jeska's Will","type":"Sorcery","mana":"{2}{R}","oracle":"Choose one. If you control a commander as you cast this spell, you may choose both instead.\n• Add {R} for each card in target opponent's hand.\n• Exile the top three cards of your library. You may play them this turn.","layout":"normal","cmc":3,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["R"],"colorIdentity":["R"]}, // EDHREC #105
  {"name":"Deadly Rollick","type":"Instant","mana":"{3}{B}","oracle":"If you control a commander, you may cast this spell without paying its mana cost.\nExile target creature.","layout":"normal","cmc":4,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["B"],"colorIdentity":["B"]}, // EDHREC #107
  {"name":"Teferi's Protection","type":"Instant","mana":"{2}{W}","oracle":"Until your next turn, your life total can't change and you gain protection from everything. All permanents you control phase out. (While they're phased out, they're treated as though they don't exist. They phase in before you untap during your untap step.)\nExile Teferi's Protection.","layout":"normal","cmc":3,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["W"],"colorIdentity":["W"]}, // EDHREC #109
  {"name":"Propaganda","type":"Enchantment","mana":"{2}{U}","oracle":"Creatures can't attack you unless their controller pays {2} for each creature they control that's attacking you.","layout":"normal","cmc":3,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["U"],"colorIdentity":["U"]}, // EDHREC #112
  {"name":"Sakura-Tribe Elder","type":"Creature — Snake Shaman","mana":"{1}{G}","oracle":"Sacrifice this creature: Search your library for a basic land card, put that card onto the battlefield tapped, then shuffle.","layout":"normal","cmc":2,"power":"1","toughness":"1","loyalty":null,"keywords":[],"colors":["G"],"colorIdentity":["G"]}, // EDHREC #113
  {"name":"Vampiric Tutor","type":"Instant","mana":"{B}","oracle":"Search your library for a card, then shuffle and put that card on top. You lose 2 life.","layout":"normal","cmc":1,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["B"],"colorIdentity":["B"]}, // EDHREC #114
  {"name":"Mana Drain","type":"Instant","mana":"{U}{U}","oracle":"Counter target spell. At the beginning of your next main phase, add an amount of {C} equal to that spell's mana value.","layout":"normal","cmc":2,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["U"],"colorIdentity":["U"]}, // EDHREC #118
  {"name":"Lotus Petal","type":"Artifact","mana":"{0}","oracle":"{T}, Sacrifice this artifact: Add one mana of any color.","layout":"normal","cmc":0,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":[]}, // EDHREC #119
  {"name":"Eternal Witness","type":"Creature — Human Shaman","mana":"{1}{G}{G}","oracle":"When this creature enters, you may return target card from your graveyard to your hand.","layout":"normal","cmc":3,"power":"2","toughness":"1","loyalty":null,"keywords":[],"colors":["G"],"colorIdentity":["G"]}, // EDHREC #120
  {"name":"Assassin's Trophy","type":"Instant","mana":"{B}{G}","oracle":"Destroy target permanent an opponent controls. Its controller may search their library for a basic land card, put it onto the battlefield, then shuffle.","layout":"normal","cmc":2,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["B","G"],"colorIdentity":["B","G"]}, // EDHREC #122
  {"name":"Enlightened Tutor","type":"Instant","mana":"{W}","oracle":"Search your library for an artifact or enchantment card, reveal it, then shuffle and put that card on top.","layout":"normal","cmc":1,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["W"],"colorIdentity":["W"]}, // EDHREC #123
  {"name":"Wayfarer's Bauble","type":"Artifact","mana":"{1}","oracle":"{2}, {T}, Sacrifice this artifact: Search your library for a basic land card, put that card onto the battlefield tapped, then shuffle.","layout":"normal","cmc":1,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":[]}, // EDHREC #124
  {"name":"Talisman of Creativity","type":"Artifact","mana":"{2}","oracle":"{T}: Add {C}.\n{T}: Add {U} or {R}. This artifact deals 1 damage to you.","layout":"normal","cmc":2,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":["R","U"]}, // EDHREC #126
  {"name":"Talisman of Indulgence","type":"Artifact","mana":"{2}","oracle":"{T}: Add {C}.\n{T}: Add {B} or {R}. This artifact deals 1 damage to you.","layout":"normal","cmc":2,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":["B","R"]}, // EDHREC #128
  {"name":"Victimize","type":"Sorcery","mana":"{2}{B}","oracle":"Choose two target creature cards in your graveyard. Sacrifice a creature. If you do, return the chosen cards to the battlefield tapped.","layout":"normal","cmc":3,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["B"],"colorIdentity":["B"]}, // EDHREC #129
  {"name":"Black Market Connections","type":"Enchantment","mana":"{2}{B}","oracle":"At the beginning of your first main phase, choose one or more —\n• Sell Contraband — Create a Treasure token. You lose 1 life.\n• Buy Information — Draw a card. You lose 2 life.\n• Hire a Mercenary — Create a 3/2 colorless Shapeshifter creature token with changeling. You lose 3 life. (It is every creature type.)","layout":"normal","cmc":3,"power":null,"toughness":null,"loyalty":null,"keywords":["Hire a Mercenary","Treasure","Sell Contraband","Buy Information"],"colors":["B"],"colorIdentity":["B"]}, // EDHREC #130
  {"name":"Deadly Dispute","type":"Instant","mana":"{1}{B}","oracle":"As an additional cost to cast this spell, sacrifice an artifact or creature.\nDraw two cards and create a Treasure token. (It's an artifact with \"{T}, Sacrifice this token: Add one mana of any color.\")","layout":"normal","cmc":2,"power":null,"toughness":null,"loyalty":null,"keywords":["Treasure"],"colors":["B"],"colorIdentity":["B"]}, // EDHREC #131
  {"name":"Roaming Throne","type":"Artifact Creature — Golem","mana":"{4}","oracle":"Ward {2}\nAs this creature enters, choose a creature type.\nThis creature is the chosen type in addition to its other types.\nIf a triggered ability of another creature you control of the chosen type triggers, it triggers an additional time.","layout":"normal","cmc":4,"power":"4","toughness":"4","loyalty":null,"keywords":["Ward"],"colors":[],"colorIdentity":[]}, // EDHREC #133
  {"name":"Ashnod's Altar","type":"Artifact","mana":"{3}","oracle":"Sacrifice a creature: Add {C}{C}.","layout":"normal","cmc":3,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":[]}, // EDHREC #134
  {"name":"Talisman of Hierarchy","type":"Artifact","mana":"{2}","oracle":"{T}: Add {C}.\n{T}: Add {W} or {B}. This artifact deals 1 damage to you.","layout":"normal","cmc":2,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":["B","W"]}, // EDHREC #135
  {"name":"Big Score","type":"Instant","mana":"{3}{R}","oracle":"As an additional cost to cast this spell, discard a card.\nDraw two cards and create two Treasure tokens. (They're artifacts with \"{T}, Sacrifice this token: Add one mana of any color.\")","layout":"normal","cmc":4,"power":null,"toughness":null,"loyalty":null,"keywords":["Treasure"],"colors":["R"],"colorIdentity":["R"]}, // EDHREC #138
  {"name":"Talisman of Progress","type":"Artifact","mana":"{2}","oracle":"{T}: Add {C}.\n{T}: Add {W} or {U}. This artifact deals 1 damage to you.","layout":"normal","cmc":2,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":["U","W"]}, // EDHREC #139
  {"name":"Blood Artist","type":"Creature — Vampire","mana":"{1}{B}","oracle":"Whenever this creature or another creature dies, target player loses 1 life and you gain 1 life.","layout":"normal","cmc":2,"power":"0","toughness":"1","loyalty":null,"keywords":[],"colors":["B"],"colorIdentity":["B"]}, // EDHREC #141
  {"name":"Abrade","type":"Instant","mana":"{1}{R}","oracle":"Choose one —\n• Abrade deals 3 damage to target creature.\n• Destroy target artifact.","layout":"normal","cmc":2,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["R"],"colorIdentity":["R"]}, // EDHREC #144
  {"name":"Ponder","type":"Sorcery","mana":"{U}","oracle":"Look at the top three cards of your library, then put them back in any order. You may shuffle.\nDraw a card.","layout":"normal","cmc":1,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["U"],"colorIdentity":["U"]}, // EDHREC #146
  {"name":"Delighted Halfling","type":"Creature — Halfling Citizen","mana":"{G}","oracle":"{T}: Add {C}.\n{T}: Add one mana of any color. Spend this mana only to cast a legendary spell, and that spell can't be countered.","layout":"normal","cmc":1,"power":"1","toughness":"2","loyalty":null,"keywords":[],"colors":["G"],"colorIdentity":["G"]}, // EDHREC #149
  {"name":"Mana Vault","type":"Artifact","mana":"{1}","oracle":"This artifact doesn't untap during your untap step.\nAt the beginning of your upkeep, you may pay {4}. If you do, untap this artifact.\nAt the beginning of your draw step, if this artifact is tapped, it deals 1 damage to you.\n{T}: Add {C}{C}{C}.","layout":"normal","cmc":1,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":[]}, // EDHREC #150
  {"name":"Talisman of Conviction","type":"Artifact","mana":"{2}","oracle":"{T}: Add {C}.\n{T}: Add {R} or {W}. This artifact deals 1 damage to you.","layout":"normal","cmc":2,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":["R","W"]}, // EDHREC #151
  {"name":"Herald's Horn","type":"Artifact","mana":"{3}","oracle":"As this artifact enters, choose a creature type.\nCreature spells you cast of the chosen type cost {1} less to cast.\nAt the beginning of your upkeep, look at the top card of your library. If it's a creature card of the chosen type, you may reveal it and put it into your hand.","layout":"normal","cmc":3,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":[]}, // EDHREC #152
  {"name":"Chrome Mox","type":"Artifact","mana":"{0}","oracle":"Imprint — When this artifact enters, you may exile a nonartifact, nonland card from your hand.\n{T}: Add one mana of any of the exiled card's colors.","layout":"normal","cmc":0,"power":null,"toughness":null,"loyalty":null,"keywords":["Imprint"],"colors":[],"colorIdentity":[]}, // EDHREC #154
  {"name":"Pongify","type":"Instant","mana":"{U}","oracle":"Destroy target creature. It can't be regenerated. Its controller creates a 3/3 green Ape creature token.","layout":"normal","cmc":1,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["U"],"colorIdentity":["U"]}, // EDHREC #155
  {"name":"Anguished Unmaking","type":"Instant","mana":"{1}{W}{B}","oracle":"Exile target nonland permanent. You lose 3 life.","layout":"normal","cmc":3,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["B","W"],"colorIdentity":["B","W"]}, // EDHREC #156
  {"name":"Lightning Bolt","type":"Instant","mana":"{R}","oracle":"Lightning Bolt deals 3 damage to any target.","layout":"normal","cmc":1,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["R"],"colorIdentity":["R"]}, // EDHREC #157
  {"name":"Windfall","type":"Sorcery","mana":"{2}{U}","oracle":"Each player discards their hand, then draws cards equal to the greatest number of cards a player discarded this way.","layout":"normal","cmc":3,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["U"],"colorIdentity":["U"]}, // EDHREC #158
  {"name":"Dimir Signet","type":"Artifact","mana":"{2}","oracle":"{1}, {T}: Add {U}{B}.","layout":"normal","cmc":2,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":["B","U"]}, // EDHREC #159
  {"name":"Ghostly Prison","type":"Enchantment","mana":"{2}{W}","oracle":"Creatures can't attack you unless their controller pays {2} for each creature they control that's attacking you.","layout":"normal","cmc":3,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["W"],"colorIdentity":["W"]}, // EDHREC #161
  {"name":"Mystical Tutor","type":"Instant","mana":"{U}","oracle":"Search your library for an instant or sorcery card, reveal it, then shuffle and put that card on top.","layout":"normal","cmc":1,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["U"],"colorIdentity":["U"]}, // EDHREC #162
  {"name":"Rakdos Signet","type":"Artifact","mana":"{2}","oracle":"{1}, {T}: Add {B}{R}.","layout":"normal","cmc":2,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":["B","R"]}, // EDHREC #167
  {"name":"Worldly Tutor","type":"Instant","mana":"{G}","oracle":"Search your library for a creature card, reveal it, then shuffle and put the card on top.","layout":"normal","cmc":1,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["G"],"colorIdentity":["G"]}, // EDHREC #169
  {"name":"Austere Command","type":"Sorcery","mana":"{4}{W}{W}","oracle":"Choose two —\n• Destroy all artifacts.\n• Destroy all enchantments.\n• Destroy all creatures with mana value 3 or less.\n• Destroy all creatures with mana value 4 or greater.","layout":"normal","cmc":6,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["W"],"colorIdentity":["W"]}, // EDHREC #171
  {"name":"Izzet Signet","type":"Artifact","mana":"{2}","oracle":"{1}, {T}: Add {U}{R}.","layout":"normal","cmc":2,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":["R","U"]}, // EDHREC #172
  {"name":"Farewell","type":"Sorcery","mana":"{4}{W}{W}","oracle":"Choose one or more —\n• Exile all artifacts.\n• Exile all creatures.\n• Exile all enchantments.\n• Exile all graveyards.","layout":"normal","cmc":6,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["W"],"colorIdentity":["W"]}, // EDHREC #175
  {"name":"Return of the Wildspeaker","type":"Instant","mana":"{4}{G}","oracle":"Choose one —\n• Draw cards equal to the greatest power among non-Human creatures you control.\n• Non-Human creatures you control get +3/+3 until end of turn.","layout":"normal","cmc":5,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["G"],"colorIdentity":["G"]}, // EDHREC #178
  {"name":"Flawless Maneuver","type":"Instant","mana":"{2}{W}","oracle":"If you control a commander, you may cast this spell without paying its mana cost.\nCreatures you control gain indestructible until end of turn.","layout":"normal","cmc":3,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["W"],"colorIdentity":["W"]}, // EDHREC #179
  {"name":"Boros Charm","type":"Instant","mana":"{R}{W}","oracle":"Choose one —\n• Boros Charm deals 4 damage to target player or planeswalker.\n• Permanents you control gain indestructible until end of turn.\n• Target creature gains double strike until end of turn.","layout":"normal","cmc":2,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["R","W"],"colorIdentity":["R","W"]}, // EDHREC #181
  {"name":"Night's Whisper","type":"Sorcery","mana":"{1}{B}","oracle":"You draw two cards and lose 2 life.","layout":"normal","cmc":2,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["B"],"colorIdentity":["B"]}, // EDHREC #182
  {"name":"Tireless Provisioner","type":"Creature — Elf Scout","mana":"{2}{G}","oracle":"Landfall — Whenever a land you control enters, create a Food token or a Treasure token. (Food is an artifact with \"{2}, {T}, Sacrifice this token: You gain 3 life.\" Treasure is an artifact with \"{T}, Sacrifice this token: Add one mana of any color.\")","layout":"normal","cmc":3,"power":"3","toughness":"2","loyalty":null,"keywords":["Treasure","Food","Landfall"],"colors":["G"],"colorIdentity":["G"]}, // EDHREC #185
  {"name":"Hardened Scales","type":"Enchantment","mana":"{G}","oracle":"If one or more +1/+1 counters would be put on a creature you control, that many plus one +1/+1 counters are put on it instead.","layout":"normal","cmc":1,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["G"],"colorIdentity":["G"]}, // EDHREC #186
  {"name":"Akroma's Will","type":"Instant","mana":"{3}{W}","oracle":"Choose one. If you control a commander as you cast this spell, you may choose both instead.\n• Creatures you control gain flying, vigilance, and double strike until end of turn.\n• Creatures you control gain lifelink, indestructible, and protection from each color until end of turn.","layout":"normal","cmc":4,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["W"],"colorIdentity":["W"]}, // EDHREC #188
];

const on = (id, card, extra = {}) => ({ ...createPermanent({ id, card: { ...card, id: `c-${id}` }, controller: "user", summoningSick: false }), ...extra });
const cards = (list, prefix) => list.map((c, i) => ({ ...c, id: `${prefix}${i}` }));
/** The reviewer's hand and graveyard (review-pw25.md, F1's probe). */
const HAND = () => cards([GRISELBRAND, COUNTERSPELL, ISLAND, OPT, DIVINATION], "h");
const GY = () => cards([ISLAND, OPT, GRISELBRAND, DIVINATION], "g");
/** The user's precombat main; `person` stamps the user seat as a person's (state.humanSeats, as createLearnSession does below Expert). */
function table({ person = true, board = [], hand = HAND(), graveyard = GY(), pool = {} } = {}) {
  const g = createGameState({ userDeck: [], aiDeck: [] });
  const players = { ...g.players, user: { ...g.players.user, battlefield: board, hand, graveyard, manaPool: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0, ...pool } } };
  return { ...g, turn: 4, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0, stack: [], pendingTriggers: [], players,
    ...(person ? { humanSeats: ["user"] } : {}) };
}
const offersOf = (s, permId, test = () => true) => legalActionsForPlayer(s, "user").filter((a) => a.kind === "activate-ability" && a.permanentId === permId && test(a));
const nameSet = (s, ids, zone = "hand") => ids.map((id) => s.players.user[zone].find((c) => c.id === id)?.name).sort().join(" + ");
const discardSets = (s, acts) => [...new Set(acts.map((a) => nameSet(s, a.discardIds || [])))].sort();
const offered = (a, what) => { expect(a, `${what} is not offered`).toBeTruthy(); return a; };

describe("⭐ the person chooses the cards (the review's probe)", () => {
  it("⭐ Nezahal: one offer per set of three of the five — C(5,3) = 10 — the least valuable first, Griselbrand among them; paid, Griselbrand is in the graveyard", () => {
    const s = table({ board: [on("nez", NEZAHAL)] });
    const acts = offersOf(s, "nez", (a) => a.discardIds);
    expect({ count: acts.length, first: acts[0] && nameSet(s, acts[0].discardIds) }).toEqual({ count: 10, first: "Counterspell + Island + Opt" });
    const withGris = offered(acts.find((a) => a.discardIds.includes("h0") && a.discardIds.includes("h1") && a.discardIds.includes("h4")), "Discard Griselbrand, Counterspell, Divination");
    const paid = dispatchAction(s, withGris);
    expect({ hand: paid.players.user.hand.map((c) => c.name).sort(), gyHasGris: paid.players.user.graveyard.some((c) => c.name === "Griselbrand") })
      .toEqual({ hand: ["Island", "Opt"], gyHasGris: true });
  });
  it("⭐ the AI's seat still gets ONE offer, the three least valuable (no person plays it)", () => {
    const s = table({ person: false, board: [on("nez", NEZAHAL)] });
    const acts = offersOf(s, "nez", (a) => a.discardIds);
    expect(acts.map((a) => nameSet(s, a.discardIds))).toEqual(["Counterspell + Island + Opt"]);
  });
  it("⭐ Anurid Brushhopper: C(5,2) = 10 offers for the person", () => {
    const s = table({ board: [on("hop", BRUSHHOPPER)] });
    expect(offersOf(s, "hop", (a) => a.discardIds).length).toBe(10);
  });
  it("⭐ cards of one name pay identically: two Islands, Opt and Divination make four pairs, not six", () => {
    const s = table({ board: [on("hop", BRUSHHOPPER)], hand: cards([ISLAND, ISLAND, OPT, DIVINATION], "h") });
    expect(discardSets(s, offersOf(s, "hop", (a) => a.discardIds))).toEqual(["Divination + Island", "Divination + Opt", "Island + Island", "Island + Opt"]);
  });
  it("⭐ Fleeting Spirit: the person may exile Island, Opt and Griselbrand and keep Divination — the label names them; the AI's one offer exiles the least valuable three", () => {
    const person = table({ board: [on("fs", FLEETING)], pool: { W: 1 } });
    const acts = offersOf(person, "fs", (a) => a.exileGyIds);
    expect(acts.map((a) => nameSet(person, a.exileGyIds, "graveyard")).sort())
      .toEqual(["Divination + Griselbrand + Island", "Divination + Griselbrand + Opt", "Divination + Island + Opt", "Griselbrand + Island + Opt"]);
    const keep = offered(acts.find((a) => !a.exileGyIds.includes("g3")), "an exile keeping Divination");
    expect(actionLabel(keep)).toMatch(/exile Island, Opt, Griselbrand from your graveyard/);
    const done = dispatchAction(person, keep);
    expect(done.players.user.graveyard.map((c) => c.name)).toEqual(["Divination"]);
    const ai = table({ person: false, board: [on("fs", FLEETING)], pool: { W: 1 } });
    const one = offersOf(ai, "fs", (a) => a.exileGyIds);
    expect(one.map((a) => ({ set: nameSet(ai, a.exileGyIds, "graveyard"), named: "exileGyNames" in a }))).toEqual([{ set: "Divination + Island + Opt", named: false }]);
  });
});

describe("⭐ the four cards already on the convention", () => {
  const hand4 = () => cards([ISLAND, OPT, COUNTERSPELL, DIVINATION], "h");
  const rows = [
    ["Solphim, Mayhem Dominus", SOLPHIM, { R: 2, C: 1 }],
    ["Zombie Infestation", INFESTATION, {}],
    ["Latulla, Keldon Overseer", LATULLA, { R: 2, C: 2 }],
    ["Fae of Wishes", permanentFaceCard(FAE), { U: 1, C: 1 }],
  ];
  for (const [name, card, pool] of rows) {
    it(`⭐ ${name}: the person is offered all six pairs of a four-card hand; the AI's seat one, the two least valuable`, () => {
      const person = table({ board: [on("src", card)], hand: hand4(), pool });
      expect(discardSets(person, offersOf(person, "src", (a) => a.discardIds)))
        .toEqual(["Counterspell + Divination", "Counterspell + Island", "Counterspell + Opt", "Divination + Island", "Divination + Opt", "Island + Opt"]);
      const ai = table({ person: false, board: [on("src", card)], hand: hand4(), pool });
      expect(discardSets(ai, offersOf(ai, "src", (a) => a.discardIds))).toEqual(["Island + Opt"]);
    });
  }
});

describe("⭐ bounded: the first 64 sets, then a covering set per card in none — every card can pay", () => {
  const gyCards = (n) => GY100.slice(0, n).map((c, i) => ({ ...c, id: `gy${i}` }));
  const shape = (acts) => ({ count: acts.length, reached: new Set(acts.flatMap((a) => a.exileGyIds)).size, distinct: new Set(acts.map((a) => [...a.exileGyIds].sort().join())).size });
  it("⭐ a 60-card graveyard: 64 exile offers, every card in at least one", () => {
    const s = table({ board: [on("fs", FLEETING)], graveyard: gyCards(60), pool: { W: 1 } });
    expect(shape(offersOf(s, "fs", (a) => a.exileGyIds))).toEqual({ count: 64, reached: 60, distinct: 64 });
  });
  it("⭐ a 100-card graveyard: the 64 sets reach 66 cards, 34 covering offers add the rest — 98 offers, all 100 reachable", () => {
    const s = table({ board: [on("fs", FLEETING)], graveyard: gyCards(100), pool: { W: 1 } });
    expect(shape(offersOf(s, "fs", (a) => a.exileGyIds))).toEqual({ count: 98, reached: 100, distinct: 98 });
  });
  it("the AI's seat over the same 100: one offer", () => {
    const s = table({ person: false, board: [on("fs", FLEETING)], graveyard: gyCards(100), pool: { W: 1 } });
    expect(offersOf(s, "fs", (a) => a.exileGyIds)).toHaveLength(1);
  });
});

describe("⭐ beside a target list the counted sets are one more cost choice, bounded (the round-2 recheck, R2-F1)", () => {
  const byName = (n) => GY100.find((c) => c.name === n);
  const HAND6 = () => cards(GY100.slice(40, 46), "h"); // six distinct cards: C(6,2) = 15 pairs
  /** A commander pod in the person's precombat main: their source and a Llanowar Elves, two Grizzly Bears and two Forests per opponent. */
  function pod({ source, graveyard, hand = HAND6(), pool, squirrels = 0, person = true }) {
    const g = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
    const at = (seat, id, card) => ({ ...createPermanent({ id, card: { ...card, id: `c-${id}` }, controller: seat, summoningSick: false }), enteredOnTurn: 1 });
    const players = { ...g.players };
    for (const seat of Object.keys(players)) {
      const board = seat === "user" ? [at(seat, "src", source), at(seat, "elf", byName("Llanowar Elves"))]
        : [at(seat, `${seat}-b1`, BEARS), at(seat, `${seat}-b2`, BEARS), at(seat, `${seat}-f1`, FOREST), at(seat, `${seat}-f2`, FOREST)];
      players[seat] = { ...players[seat], battlefield: board, hand: [], graveyard: [], library: [] };
    }
    players.user = { ...players.user, hand, graveyard, manaPool: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0, ...pool } };
    let s = { ...g, turn: 6, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0, stack: [], pendingTriggers: [], players,
      ...(person ? { humanSeats: ["user"] } : {}) };
    const make = parseEffectClause(`Create ${squirrels} 1/1 green Squirrel creature tokens.`, "Sorcery").atoms[0];
    if (squirrels) for (const seat of ["ai1", "ai2", "ai3"]) s = resolveAtom(s, make, { controller: seat, targets: [] });
    return s;
  }
  const targetsOf = (a) => (a.targets || []).map((t) => t.id).join();
  const setOf = (a) => [...(a.discardIds || a.exileGyIds || [])].sort().join();
  const shape = (acts) => ({ offers: acts.length, targets: new Set(acts.map(targetsOf)).size, sets: new Set(acts.map(setOf)).size });
  it("⭐ Grim Lavamancer, a midgame pod, 28 cards in the graveyard: 12 targets + 64 sets − 1 = 75 offers, every target and every set in one (the full product was 768); the AI's seat one per target", () => {
    const gy = cards(GY100.slice(0, 28), "g");
    const ai = offersOf(pod({ source: LAVAMANCER, graveyard: gy, pool: { R: 1 }, person: false }), "src");
    const acts = offersOf(pod({ source: LAVAMANCER, graveyard: gy, pool: { R: 1 } }), "src");
    expect({ ai: shape(ai), aiOneSet: new Set(ai.map(setOf)).size, person: shape(acts), cards: new Set(acts.flatMap((a) => a.exileGyIds)).size })
      .toEqual({ ai: { offers: 12, targets: 12, sets: 1 }, aiOneSet: 1, person: { offers: 75, targets: 12, sets: 64 }, cards: 28 });
  });
  it("⭐ Latulla's {X}: per X, 12 targets + 15 pairs − 1 = 26 offers (four Xs — the pool and the Elves — 104; the full product was 720), every target and every pair at each X", () => {
    const ai = offersOf(pod({ source: LATULLA, graveyard: [], pool: { R: 1, C: 3 }, person: false }), "src");
    const acts = offersOf(pod({ source: LATULLA, graveyard: [], pool: { R: 1, C: 3 } }), "src");
    const perX = (list) => [...new Set(list.map((a) => a.xValue))].sort().map((x) => [x, shape(list.filter((a) => a.xValue === x))]);
    expect({ ai: perX(ai), person: perX(acts) }).toEqual({
      ai: [1, 2, 3, 4].map((x) => [x, { offers: 12, targets: 12, sets: 1 }]),
      person: [1, 2, 3, 4].map((x) => [x, { offers: 26, targets: 12, sets: 15 }]),
    });
  });
  it("⭐ 150 Squirrels per opponent: the person's Lavamancer offers the AI seat's rows + 63 (the full product was × 64), every target and every set in one", () => {
    const gy = cards(GY100.slice(0, 30), "g");
    const ai = offersOf(pod({ source: LAVAMANCER, graveyard: gy, pool: { R: 1 }, squirrels: 150, person: false }), "src");
    const acts = offersOf(pod({ source: LAVAMANCER, graveyard: gy, pool: { R: 1 }, squirrels: 150 }), "src");
    expect(ai.length, "every Squirrel is a target").toBeGreaterThan(450);
    expect({ person: shape(acts), cards: new Set(acts.flatMap((a) => a.exileGyIds)).size })
      .toEqual({ person: { offers: ai.length + 63, targets: ai.length, sets: 64 }, cards: 30 });
  });
  it("⭐ Cabal Surgeon: the creature card the first row returns is in none of its sets — one offer more exiles it while returning the other", () => {
    const gy = cards([byName("Solemn Simulacrum"), byName("Eternal Witness"), ...GY100.filter((c) => !/Creature/.test(c.type)).slice(0, 8)], "g");
    const ai = offersOf(pod({ source: SURGEON, graveyard: gy, pool: { B: 2, C: 2 }, person: false }), "src");
    const acts = offersOf(pod({ source: SURGEON, graveyard: gy, pool: { B: 2, C: 2 } }), "src");
    const first = ai[0].targets[0].id;
    const other = ai.map((a) => a.targets[0].id).find((id) => id !== first);
    offered(acts.find((a) => a.targets[0].id === other && a.exileGyIds.includes(first)), "an exile of the first row's card beside the other return");
    // the first row: C(9, 2) = 36 sets; the other row its least valuable; and the one more
    expect({ ai: ai.length, person: acts.length, cards: new Set(acts.flatMap((a) => a.exileGyIds)).size }).toEqual({ ai: 2, person: 38, cards: 10 });
  });
});

describe("⭐ two graveyard cards of one name that a lane tells apart are two choices (the round-2 recheck, R2-F2)", () => {
  const gy = (extra = {}) => cards([{ ...BOLT, ...extra }, BOLT, ISLAND, OPT], "g");
  const exiles = (s) => offersOf(s, "frog", (a) => a.exileGyIds).map((a) => [...a.exileGyIds].sort().join());
  it("⭐ Psychic Frog, the granted Lightning Bolt sorting first: the person may exile the other Bolt, Island and Opt and keep it", () => {
    const s = table({ board: [on("frog", FROG)], graveyard: gy({ flashbackGrant: { cost: "{R}", turn: 4 } }) });
    expect(exiles(s).sort()).toEqual(["g0,g1,g2", "g0,g1,g3", "g0,g2,g3", "g1,g2,g3"]);
  });
  it("⭐ the same for a Bolt milled this turn", () => {
    const s = { ...table({ board: [on("frog", FROG)], graveyard: gy() }), milledThisTurn: { g0: 4 } };
    expect(exiles(s)).toContain("g1,g2,g3");
  });
  it("control: two Bolts nothing tells apart are one choice (three sets of three, not four); a grant from another turn tells nothing", () => {
    expect(exiles(table({ board: [on("frog", FROG)], graveyard: gy() })).sort()).toEqual(["g0,g1,g2", "g0,g1,g3", "g0,g2,g3"]);
    expect(exiles(table({ board: [on("frog", FROG)], graveyard: gy({ flashbackGrant: { cost: "{R}", turn: 3 } }) })).sort()).toEqual(["g0,g1,g2", "g0,g1,g3", "g0,g2,g3"]);
  });
});

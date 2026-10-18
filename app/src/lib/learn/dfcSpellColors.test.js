/**
 * dfcSpellColors.test.js — a double-faced card OFF the battlefield is the colour of its front face (or of the face being cast).
 *
 * The rules (bundled CR): an object is the colour of the mana symbols in its mana cost (CR 105.2, 202.2; a hybrid symbol is each
 * of its colours, CR 202.2d), and Devoid makes it colourless everywhere (CR 702.114a). A double-faced card in a zone other than
 * the battlefield or the stack has only its front face's characteristics (CR 712.8a); a nonmodal double-faced spell has its front
 * face up on the stack (CR 712.8c) and is cast front face up by default (CR 712.11); a modal double-faced spell has only the
 * characteristics of the face being cast (CR 712.8f, 712.11b). A permanent or player with protection can't be targeted by spells
 * with the stated quality (CR 702.16b) nor enchanted by Auras with it (CR 702.16c).
 *
 * THE BUG (measured on 5444c56d through the real lanes). In-game transform and modal double-faced cards carry Scryfall's EMPTY
 * top-level `colors` (Scryfall keeps the colours on the faces; the enriched game deck carries no faces at all), and every reader of
 * a card's or a spell's colour off the battlefield read that empty array: Delver of Secrets and Invasion of Vryn were COLOURLESS.
 *   · false positives — Mystic Forge's "colorless spells" cast them off the top of the library; Forsaken Monument's "Whenever you
 *     cast a colorless spell, you gain 2 life" gained on Delver; Shrine of the Forsaken Gods' colourless-only mana paid for them;
 *     a white Aura (Radiant Grace) was cast on Black Knight through protection from white and a red one (Skin Invasion) on Kor
 *     Firewalker through protection from red; and Allosaurus Shepherd's "Green spells you control can't be countered" read a
 *     DEVOID spell by its pips (Brood Monitor was uncounterable);
 *   · under-reads — Sapphire Medallion didn't discount Invasion of Vryn, Yeva's "green creature spells" flash didn't reach Kessig
 *     Prowler, Kor Firewalker's "a red spell" missed Village Messenger, Force of Will couldn't pitch Delver, Throne of Eldraine's
 *     blue mana didn't pay for Invasion of Vryn, Delver didn't count as a blue spell cast this turn (Ricochet Trap), Gainsay
 *     couldn't target Delver, Guildmages' Forum gave Edgar, Charmed Groom no counter, Chrome Mox imprinting Delver made nothing and
 *     Summoner's Pact didn't find Kessig Prowler.
 *
 * Real oracle fixtures (bundled Scryfall via cardIndex.publicCard, 2026-10-18; the trailing comment is the card's tier and EDHREC
 * rank). The double-faced fixtures are the enriched game-deck shape (server/learnDeckEnrich.mergeCardData: no `card_faces`);
 * `withFaces` adds the bundled index's per-face data (name, type line, mana cost, colours) — the publicCard shape.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { stackSpellIsUncounterable } from "./staticAbilityParser.js";
import { manaSources, parseSpendRestriction, spendRestrictionAllows } from "./manaModel.js";
import { cardMatchesTutorFilter } from "./effects/atoms/library.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { _resetIdsForTests, createGameState, createPermanent, createStackObject } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

// ── real card fixtures (bundled Scryfall, cardIndex.publicCard) ──
const DELVER = {"name":"Delver of Secrets // Insectile Aberration","type":"Creature — Human Wizard // Creature — Human Insect","mana":"{U}","cmc":1,"power":"1","toughness":"1","keywords":["Flying","Transform"],"colors":[],"oracle":"Delver of Secrets - Creature — Human Wizard {U}\nAt the beginning of your upkeep, look at the top card of your library. You may reveal that card. If an instant or sorcery card is revealed this way, transform this creature.\n//\nInsectile Aberration - Creature — Human Insect \nFlying","layout":"transform"}; // body-only #16155
const VRYN = {"name":"Invasion of Vryn // Overloaded Mage-Ring","type":"Battle — Siege // Artifact","mana":"{3}{U}","cmc":4,"keywords":["Transform"],"colors":[],"oracle":"Invasion of Vryn - Battle — Siege {3}{U}\n(As a Siege enters, choose an opponent to protect it. You and others can attack it. When it's defeated, exile it, then cast it transformed.)\nWhen this Siege enters, draw three cards, then discard a card.\n//\nOverloaded Mage-Ring - Artifact \n{1}, {T}, Sacrifice this artifact: Copy target spell you control. You may choose new targets for the copy. (A copy of a permanent spell becomes a token.)","layout":"transform"}; // body-only #14949
const KESSIG_PROWLER = {"name":"Kessig Prowler // Sinuous Predator","type":"Creature — Werewolf Horror // Creature — Eldrazi Werewolf","mana":"{G}","cmc":1,"power":"2","toughness":"1","keywords":["Transform"],"colors":[],"oracle":"Kessig Prowler - Creature — Werewolf Horror {G}\n{4}{G}: Transform this creature.\n//\nSinuous Predator - Creature — Eldrazi Werewolf \nThis creature can't be blocked by more than one creature.","layout":"transform"}; // body-only #22464
const VILLAGE_MESSENGER = {"name":"Village Messenger // Moonrise Intruder","type":"Creature — Human Werewolf // Creature — Werewolf","mana":"{R}","cmc":1,"power":"1","toughness":"1","keywords":["Transform","Haste","Menace"],"colors":[],"oracle":"Village Messenger - Creature — Human Werewolf {R}\nHaste\nAt the beginning of each upkeep, if no spells were cast last turn, transform this creature.\n//\nMoonrise Intruder - Creature — Werewolf \nMenace (This creature can't be blocked except by two or more creatures.)\nAt the beginning of each upkeep, if a player cast two or more spells last turn, transform this creature.","layout":"transform"}; // body-only #15315
const RADIANT_GRACE = {"name":"Radiant Grace // Radiant Restraints","type":"Enchantment — Aura // Enchantment — Aura Curse","mana":"{W}","cmc":1,"keywords":["Transform","Enchant"],"colors":[],"oracle":"Radiant Grace - Enchantment — Aura {W}\nEnchant creature\nEnchanted creature gets +1/+0 and has vigilance.\nWhen enchanted creature dies, return this card to the battlefield transformed under your control attached to target opponent.\n//\nRadiant Restraints - Enchantment — Aura Curse \nEnchant player\nCreatures enchanted player controls enter tapped.","layout":"transform"}; // body-only #12924
const SKIN_INVASION = {"name":"Skin Invasion // Skin Shedder","type":"Enchantment — Aura // Creature — Insect Horror","mana":"{R}","cmc":1,"keywords":["Transform","Enchant"],"colors":[],"oracle":"Skin Invasion - Enchantment — Aura {R}\nEnchant creature\nEnchanted creature attacks each combat if able.\nWhen enchanted creature dies, return this card to the battlefield transformed under your control.\n//\nSkin Shedder - Creature — Insect Horror","layout":"transform"}; // body-only #22752
const EDGAR = {"name":"Edgar, Charmed Groom // Edgar Markov's Coffin","type":"Legendary Creature — Vampire Noble // Legendary Artifact","mana":"{2}{W}{B}","cmc":4,"power":"4","toughness":"4","keywords":["Transform"],"colors":[],"oracle":"Edgar, Charmed Groom - Legendary Creature — Vampire Noble {2}{W}{B}\nOther Vampires you control get +1/+1.\nWhen Edgar dies, return it to the battlefield transformed under its owner's control.\n//\nEdgar Markov's Coffin - Legendary Artifact \nAt the beginning of your upkeep, create a 1/1 white and black Vampire creature token with lifelink and put a bloodline counter on Edgar Markov's Coffin. Then if there are three or more bloodline counters on it, remove those counters and transform it.","layout":"transform"}; // body-only #3620
const JOURNEY_TO_ETERNITY = {"name":"Journey to Eternity // Atzal, Cave of Eternity","type":"Legendary Enchantment — Aura // Legendary Land","mana":"{1}{B}{G}","cmc":3,"keywords":["Transform","Enchant"],"colors":[],"oracle":"Journey to Eternity - Legendary Enchantment — Aura {1}{B}{G}\nEnchant creature you control\nWhen enchanted creature dies, return it to the battlefield under your control, then return this card to the battlefield transformed under your control.\n//\nAtzal, Cave of Eternity - Legendary Land \n(Transforms from Journey to Eternity.)\n{T}: Add one mana of any color.\n{3}{B}{G}, {T}: Return target creature card from your graveyard to the battlefield.","layout":"transform"}; // body-only #4035
const TREASURE_MAP = {"name":"Treasure Map // Treasure Cove","type":"Artifact // Land","mana":"{2}","cmc":2,"keywords":["Transform","Treasure","Scry"],"colors":[],"oracle":"Treasure Map - Artifact {2}\n{1}, {T}: Scry 1. Put a landmark counter on this artifact. Then if there are three or more landmark counters on it, remove those counters, transform this artifact, and create three Treasure tokens. (They're artifacts with \"{T}, Sacrifice this token: Add one mana of any color.\")\n//\nTreasure Cove - Land \n(Transforms from Treasure Map.)\n{T}: Add {C}.\n{T}, Sacrifice a Treasure: Draw a card.","layout":"transform"}; // body-only #3043
const DROWNER_OF_TRUTH = {"name":"Drowner of Truth // Drowned Jungle","type":"Creature — Eldrazi // Land","mana":"{5}{G/U}{G/U}","cmc":7,"power":"7","toughness":"6","keywords":["Devoid"],"colors":[],"oracle":"Drowner of Truth - Creature — Eldrazi {5}{G/U}{G/U}\nDevoid (This card has no color.)\nWhen you cast this spell, if {C} was spent to cast it, create two 0/1 colorless Eldrazi Spawn creature tokens with \"Sacrifice this token: Add {C}.\"\n//\nDrowned Jungle - Land \nThis land enters tapped.\n{T}: Add {G} or {U}.","layout":"modal_dfc"}; // land-partial #6333
// The bundled index's per-face data for the double-faced fixtures (cardIndex.publicCard keeps `card_faces`).
const FACES = {
  [DELVER.name]: [{"name":"Delver of Secrets","type_line":"Creature — Human Wizard","mana_cost":"{U}","colors":["U"]},{"name":"Insectile Aberration","type_line":"Creature — Human Insect","mana_cost":"","colors":["U"]}],
  [VRYN.name]: [{"name":"Invasion of Vryn","type_line":"Battle — Siege","mana_cost":"{3}{U}","colors":["U"]},{"name":"Overloaded Mage-Ring","type_line":"Artifact","mana_cost":"","colors":["U"]}],
};
const withFaces = (card) => ({ ...card, card_faces: FACES[card.name] });

const MYSTIC_FORGE = {"name":"Mystic Forge","type":"Artifact","mana":"{4}","cmc":4,"keywords":[],"colors":[],"oracle":"You may look at the top card of your library any time.\nYou may cast artifact spells and colorless spells from the top of your library.\n{T}, Pay 1 life: Exile the top card of your library."}; // native-mixed #416
const MATTER_RESHAPER = {"name":"Matter Reshaper","type":"Creature — Eldrazi","mana":"{2}{C}","cmc":3,"power":"3","toughness":"2","keywords":[],"colors":[],"oracle":"({C} represents colorless mana.)\nWhen this creature dies, reveal the top card of your library. You may put that card onto the battlefield if it's a permanent card with mana value 3 or less. Otherwise, put that card into your hand."}; // body-only #8037
const ELDRAZI_SKYSPAWNER = {"name":"Eldrazi Skyspawner","type":"Creature — Eldrazi Drone","mana":"{2}{U}","cmc":3,"power":"2","toughness":"1","keywords":["Flying","Devoid"],"colors":[],"oracle":"Devoid (This card has no color.)\nFlying\nWhen this creature enters, create a 1/1 colorless Eldrazi Scion creature token. It has \"Sacrifice this token: Add {C}.\""}; // native-trigger #12674
const FORSAKEN_MONUMENT = {"name":"Forsaken Monument","type":"Legendary Artifact","mana":"{5}","cmc":5,"keywords":[],"colors":[],"oracle":"Colorless creatures you control get +2/+2.\nWhenever you tap a permanent for {C}, add an additional {C}.\nWhenever you cast a colorless spell, you gain 2 life."}; // native-mixed #889
const SKITTERING_CICADA = {"name":"Skittering Cicada","type":"Creature — Insect","mana":"{3}","cmc":3,"power":"2","toughness":"2","keywords":["Flash"],"colors":[],"oracle":"Flash\nYou may cast colorless spells as though they had flash.\nWhenever you cast a colorless spell, until end of turn, this creature gains trample and gets +X/+X, where X is that spell's mana value."}; // body-only #3320
const SHRINE = {"name":"Shrine of the Forsaken Gods","type":"Land","mana":"","cmc":0,"keywords":[],"colors":[],"oracle":"{T}: Add {C}.\n{T}: Add {C}{C}. Spend this mana only to cast colorless spells. Activate only if you control seven or more lands."}; // land #1225
const THRONE = {"name":"Throne of Eldraine","type":"Legendary Artifact","mana":"{5}","cmc":5,"keywords":[],"colors":[],"oracle":"As Throne of Eldraine enters, choose a color.\n{T}: Add four mana of the chosen color. Spend this mana only to cast monocolored spells of that color.\n{3}, {T}: Draw two cards. Spend only mana of the chosen color to activate this ability."}; // native-mana #890
const FORCE_OF_WILL = {"name":"Force of Will","type":"Instant","mana":"{3}{U}{U}","cmc":5,"keywords":[],"colors":["U"],"oracle":"You may pay 1 life and exile a blue card from your hand rather than pay this spell's mana cost.\nCounter target spell."}; // native-spell #197
const SAPPHIRE_MEDALLION = {"name":"Sapphire Medallion","type":"Artifact","mana":"{2}","cmc":2,"keywords":[],"colors":[],"oracle":"Blue spells you cast cost {1} less to cast."}; // native-static #357
const YEVA = {"name":"Yeva, Nature's Herald","type":"Legendary Creature — Elf Shaman","mana":"{2}{G}{G}","cmc":4,"power":"4","toughness":"4","keywords":["Flash"],"colors":["G"],"oracle":"Flash (You may cast this spell any time you could cast an instant.)\nYou may cast green creature spells as though they had flash."}; // native-static #3358
const ALLOSAURUS_SHEPHERD = {"name":"Allosaurus Shepherd","type":"Creature — Elf Shaman","mana":"{G}","cmc":1,"power":"1","toughness":"1","keywords":[],"colors":["G"],"oracle":"This spell can't be countered.\nGreen spells you control can't be countered.\n{4}{G}{G}: Until end of turn, each Elf creature you control has base power and toughness 5/5 and becomes a Dinosaur in addition to its other creature types."}; // native-mixed #1674
const BROOD_MONITOR = {"name":"Brood Monitor","type":"Creature — Eldrazi Drone","mana":"{4}{G}{G}","cmc":6,"power":"3","toughness":"3","keywords":["Devoid"],"colors":[],"oracle":"Devoid (This card has no color.)\nWhen this creature enters, create three 1/1 colorless Eldrazi Scion creature tokens. They have \"Sacrifice this token: Add {C}.\""}; // native-trigger #9334
const GAINSAY = {"name":"Gainsay","type":"Instant","mana":"{1}{U}","cmc":2,"keywords":[],"colors":["U"],"oracle":"Counter target blue spell."}; // native-spell #24125
const BLACK_KNIGHT = {"name":"Black Knight","type":"Creature — Human Knight","mana":"{B}{B}","cmc":2,"power":"2","toughness":"2","keywords":["First strike","Protection"],"colors":["B"],"oracle":"First strike (This creature deals combat damage before creatures without first strike.)\nProtection from white (This creature can't be blocked, targeted, dealt damage, or enchanted by anything white.)"}; // native-body #16895
const STONECOIL_SERPENT = {"name":"Stonecoil Serpent","type":"Artifact Creature — Snake","mana":"{X}","cmc":0,"power":"0","toughness":"0","keywords":["Reach","Protection","Trample"],"colors":[],"oracle":"Reach, trample, protection from multicolored\nThis creature enters with X +1/+1 counters on it."}; // native-mixed #1513
const KOR_FIREWALKER = {"name":"Kor Firewalker","type":"Creature — Kor Soldier","mana":"{W}{W}","cmc":2,"power":"2","toughness":"2","keywords":["Protection"],"colors":["W"],"oracle":"Protection from red\nWhenever a player casts a red spell, you may gain 1 life."}; // native-trigger #25120
const GUILDMAGES_FORUM = {"name":"Guildmages' Forum","type":"Land","mana":"","cmc":0,"keywords":[],"colors":[],"oracle":"{T}: Add {C}.\n{1}, {T}: Add one mana of any color. If that mana is spent on a multicolored creature spell, that creature enters with an additional +1/+1 counter on it."}; // land #9685
const CHROME_MOX = {"name":"Chrome Mox","type":"Artifact","mana":"{0}","cmc":0,"keywords":["Imprint"],"colors":[],"oracle":"Imprint — When this artifact enters, you may exile a nonartifact, nonland card from your hand.\n{T}: Add one mana of any of the exiled card's colors."}; // native-mana #154
const GRIZZLY_BEARS = {"name":"Grizzly Bears","type":"Creature — Bear","mana":"{1}{G}","cmc":2,"power":"2","toughness":"2","keywords":[],"colors":["G"],"oracle":""}; // native-body #8126
const GIANT_OCTOPUS = {"name":"Giant Octopus","type":"Creature — Octopus","mana":"{3}{U}","cmc":4,"power":"3","toughness":"3","keywords":[],"colors":["U"],"oracle":""}; // native-body #26962
const WATCHWOLF = {"name":"Watchwolf","type":"Creature — Wolf","mana":"{G}{W}","cmc":2,"power":"3","toughness":"3","keywords":[],"colors":["G","W"],"oracle":""}; // native-body #13001
const MIND_STONE = {"name":"Mind Stone","type":"Artifact","mana":"{2}","cmc":2,"keywords":[],"colors":[],"oracle":"{T}: Add {C}.\n{1}, {T}, Sacrifice this artifact: Draw a card."}; // native-mana #32
const COUNTERSPELL = {"name":"Counterspell","type":"Instant","mana":"{U}{U}","cmc":2,"keywords":[],"colors":["U"],"oracle":"Counter target spell."}; // native-spell #16
const ISLAND = {"name":"Island","type":"Basic Land — Island","mana":"","cmc":0,"keywords":[],"colors":[],"oracle":"({T}: Add {U}.)"}; // land
const FOREST = {"name":"Forest","type":"Basic Land — Forest","mana":"","cmc":0,"keywords":[],"colors":[],"oracle":"({T}: Add {G}.)"}; // land

const EMPTY_POOL = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };
const perm = (card, id, controller, extra = {}) => ({ ...createPermanent({ id, card: { ...card, id: `c-${id}` }, controller, summoningSick: false }), ...extra });
const inZone = (card, id) => ({ ...card, id });
/** The user's precombat main phase, the user holding priority with an empty stack. */
function board({ hand = [], userBf = [], aiBf = [], aiHand = [], library = [], pool = {}, aiPool = {}, phase = "precombat-main", step = "main", active = "user" } = {}) {
  const g = createGameState({ userDeck: [], aiDeck: [] });
  return { ...g, turn: 5, phase, step, activePlayer: active, priorityHolder: active, stack: [], pendingTriggers: [], consecutivePasses: 0,
    players: { ...g.players,
      user: { ...g.players.user, life: 20, hand, library, graveyard: [], exile: [], battlefield: userBf, landsPlayedThisTurn: 0, manaPool: { ...EMPTY_POOL, ...pool } },
      ai: { ...g.players.ai, life: 20, hand: aiHand, library: [inZone(GRIZZLY_BEARS, "ai-lib")], graveyard: [], exile: [], battlefield: aiBf, manaPool: { ...EMPTY_POOL, ...aiPool } } } };
}
const castsOf = (s, cardId, who = "user") => legalActionsForPlayer(s, who).filter((a) => a.kind === "cast-spell" && a.cardId === cardId);
const castOf = (s, cardId, who = "user") => castsOf(s, cardId, who)[0];
const fromTop = (s) => legalActionsForPlayer(s, "user").filter((a) => a.kind === "cast-spell" && a.fromZone === "library").map((a) => a.cardId);
const stackNames = (s) => s.stack.map((o) => `${o.kind}:${o.source?.name ?? o.sourceName ?? ""}`);

describe("⭐ a double-faced card is not colourless — the colourless permissions and payoffs (false positives)", () => {
  it("⭐ Mystic Forge's \"colorless spells\" does not cast Delver of Secrets or Invasion of Vryn off the top (game-deck shape and publicCard shape)", () => {
    for (const shape of [(c) => c, withFaces]) {
      const forge = (card) => board({ library: [card, inZone(GRIZZLY_BEARS, "filler")], userBf: [perm(MYSTIC_FORGE, "mf", "user")], pool: { U: 9 } });
      expect({ delver: fromTop(forge(inZone(shape(DELVER), "dv"))), vryn: fromTop(forge(inZone(shape(VRYN), "iv"))) }).toEqual({ delver: [], vryn: [] });
    }
  });

  it("control — Mystic Forge casts a colourless Eldrazi (Matter Reshaper), a devoid one (Eldrazi Skyspawner) and an artifact off the top", () => {
    const forge = (card) => board({ library: [card, inZone(GRIZZLY_BEARS, "filler")], userBf: [perm(MYSTIC_FORGE, "mf", "user")], pool: { U: 9, C: 9 } });
    expect({ reshaper: fromTop(forge(inZone(MATTER_RESHAPER, "mr"))), skyspawner: fromTop(forge(inZone(ELDRAZI_SKYSPAWNER, "es"))), stone: fromTop(forge(inZone(MIND_STONE, "ms"))) })
      .toEqual({ reshaper: ["mr"], skyspawner: ["es"], stone: ["ms"] });
  });

  it("⭐ Forsaken Monument's \"Whenever you cast a colorless spell\" does not trigger on Delver of Secrets", () => {
    const s0 = board({ hand: [inZone(DELVER, "dv")], userBf: [perm(FORSAKEN_MONUMENT, "fm", "user")], pool: { U: 1 } });
    const s1 = dispatchAction(s0, castOf(s0, "dv"));
    expect(stackNames(s1)).toEqual([`spell:${DELVER.name}`]);
  });

  it("control — Forsaken Monument triggers on Matter Reshaper and the trigger gains 2 life", () => {
    const s0 = board({ hand: [inZone(MATTER_RESHAPER, "mr")], userBf: [perm(FORSAKEN_MONUMENT, "fm", "user")], pool: { C: 3 } });
    const s1 = dispatchAction(s0, castOf(s0, "mr"));
    expect(stackNames(s1)).toEqual([`spell:${MATTER_RESHAPER.name}`, "triggered-ability:Forsaken Monument"]);
    expect(resolveTopOfStack(s1).players.user.life).toBe(22);
  });

  it("⭐ Shrine of the Forsaken Gods' colourless-only mana does not pay for Delver of Secrets or Invasion of Vryn; it pays for Matter Reshaper", () => {
    const shrine = parseSpendRestriction("Spend this mana only to cast colorless spells.");
    expect({ delver: spendRestrictionAllows(shrine, DELVER), vryn: spendRestrictionAllows(shrine, withFaces(VRYN)), reshaper: spendRestrictionAllows(shrine, MATTER_RESHAPER) })
      .toEqual({ delver: false, vryn: false, reshaper: true });
    // Through the offer: seven lands, the six Islands tapped, {U}{C} floating — only the Shrine's restricted {C}{C} (not its plain {C})
    // makes Invasion of Vryn's {3}{U}.
    const lands = [perm(SHRINE, "sh", "user"), ...[1, 2, 3, 4, 5, 6].map((i) => perm(ISLAND, `isl${i}`, "user", { tapped: true }))];
    const s = board({ hand: [inZone(VRYN, "iv"), inZone(MATTER_RESHAPER, "mr")], userBf: lands, pool: { U: 1, C: 1 } });
    expect({ vryn: castsOf(s, "iv").length, reshaper: castsOf(s, "mr").length }).toEqual({ vryn: 0, reshaper: 1 });
  });

  it("⭐ Skittering Cicada's \"colorless spells as though they had flash\" does not cast Delver of Secrets in the upkeep; control — Matter Reshaper", () => {
    const s = board({ phase: "upkeep", step: "upkeep", hand: [inZone(DELVER, "dv"), inZone(MATTER_RESHAPER, "mr")], userBf: [perm(SKITTERING_CICADA, "sc", "user")], pool: { U: 9, C: 9 } });
    expect({ delver: castsOf(s, "dv").length, reshaper: castsOf(s, "mr").length }).toEqual({ delver: 0, reshaper: 1 });
  });
});

describe("⭐ protection keeps a double-faced Aura spell out by its colours (CR 702.16b, 702.16c — false positive)", () => {
  const hosts = (aura, protectedCard, pool) => {
    const s = board({ hand: [inZone(aura, "aura")], userBf: [perm(protectedCard, "pro", "user", { counters: { "+1/+1": 3 } }), perm(GRIZZLY_BEARS, "gb", "user")], pool });
    return [...new Set(castsOf(s, "aura").flatMap((a) => (a.targets || []).map((t) => t.id)))].sort();
  };

  it("⭐ Journey to Eternity (a black and green Aura) is not cast on Stonecoil Serpent (protection from multicolored)", () => {
    expect(hosts(JOURNEY_TO_ETERNITY, STONECOIL_SERPENT, { B: 1, G: 2 })).toEqual(["gb"]);
  });

  it("control — Radiant Grace (white) is not cast on Black Knight (protection from white), Skin Invasion (red) not on Kor Firewalker (protection from red)", () => {
    expect({ grace: hosts(RADIANT_GRACE, BLACK_KNIGHT, { W: 1 }), invasion: hosts(SKIN_INVASION, KOR_FIREWALKER, { R: 1 }) }).toEqual({ grace: ["gb"], invasion: ["gb"] });
  });
});

describe("⭐ \"can't be countered\" by colour reads the spell's colour, Devoid included (false positive)", () => {
  /** `spell` on the user's stack; the AI holds Counterspell with {U}{U} floating and has priority. */
  function counterBoard({ userBf = [], spell, counter = COUNTERSPELL }) {
    const g = createGameState({ userDeck: [], aiDeck: [] });
    const stk = createStackObject({ id: "stk-spell", kind: "spell", source: spell, controller: "user", targets: [], payload: {} });
    return { ...g, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "ai", turn: 5, consecutivePasses: 0, stack: [stk],
      players: { ...g.players,
        user: { ...g.players.user, battlefield: userBf },
        ai: { ...g.players.ai, hand: [inZone(counter, "h-ctr")], manaPool: { ...EMPTY_POOL, U: 2 } } } };
  }
  const counterTargets = (s) => castsOf(s, "h-ctr", "ai").map((a) => a.targets.map((t) => t.id));

  it("⭐ Allosaurus Shepherd's \"Green spells you control can't be countered\" does not protect Brood Monitor (Devoid — colourless, CR 702.114a)", () => {
    const s = counterBoard({ userBf: [perm(ALLOSAURUS_SHEPHERD, "as", "user")], spell: inZone(BROOD_MONITOR, "s-bm") });
    expect(stackSpellIsUncounterable(s, s.stack[0])).toBe(false);
    expect(counterTargets(s)).toEqual([["stk-spell"]]);
  });

  it("control — Allosaurus Shepherd protects Kessig Prowler (a green double-faced spell) and Grizzly Bears", () => {
    const uncounterable = (spell) => { const s = counterBoard({ userBf: [perm(ALLOSAURUS_SHEPHERD, "as", "user")], spell }); return stackSpellIsUncounterable(s, s.stack[0]); };
    expect({ prowler: uncounterable(inZone(KESSIG_PROWLER, "s-kp")), bears: uncounterable(inZone(GRIZZLY_BEARS, "s-gb")) }).toEqual({ prowler: true, bears: true });
  });

  it("⭐ Gainsay (\"Counter target blue spell\") can target Delver of Secrets in the game-deck shape; control — in the publicCard shape too", () => {
    expect(counterTargets(counterBoard({ spell: inZone(DELVER, "s-dv"), counter: GAINSAY }))).toEqual([["stk-spell"]]);
    expect(counterTargets(counterBoard({ spell: inZone(withFaces(DELVER), "s-dv"), counter: GAINSAY }))).toEqual([["stk-spell"]]);
  });
});

describe("⭐ the colour readers that under-read a double-faced spell or card", () => {
  it("⭐ Sapphire Medallion's \"Blue spells\" discounts Invasion of Vryn to {2}{U}; control — a blue creature is discounted, a green one is not", () => {
    const s = board({ hand: [inZone(VRYN, "iv"), inZone(GIANT_OCTOPUS, "go"), inZone(GRIZZLY_BEARS, "gb")], userBf: [perm(SAPPHIRE_MEDALLION, "sm", "user")], pool: { U: 9, G: 9 } });
    expect({ vryn: castOf(s, "iv")?.cost.generic, octopus: castOf(s, "go")?.cost.generic, bears: castOf(s, "gb")?.cost.generic }).toEqual({ vryn: 2, octopus: 2, bears: 1 });
  });

  it("⭐ Yeva's \"green creature spells as though they had flash\" casts Kessig Prowler in the upkeep; control — Grizzly Bears yes, Delver no", () => {
    const s = board({ phase: "upkeep", step: "upkeep", hand: [inZone(KESSIG_PROWLER, "kp"), inZone(GRIZZLY_BEARS, "gb"), inZone(DELVER, "dv")], userBf: [perm(YEVA, "yv", "user")], pool: { U: 9, G: 9 } });
    expect({ prowler: castsOf(s, "kp").length, bears: castsOf(s, "gb").length, delver: castsOf(s, "dv").length }).toEqual({ prowler: 1, bears: 1, delver: 0 });
  });

  it("⭐ Kor Firewalker's \"Whenever a player casts a red spell\" triggers on Village Messenger; control — not on Delver of Secrets", () => {
    const cast = (card, pool) => { const s0 = board({ hand: [inZone(card, "sp")], userBf: [perm(KOR_FIREWALKER, "kf", "user")], pool }); return stackNames(dispatchAction(s0, castOf(s0, "sp"))); };
    expect(cast(VILLAGE_MESSENGER, { R: 1 })).toEqual([`spell:${VILLAGE_MESSENGER.name}`, "triggered-ability:Kor Firewalker"]);
    expect(cast(DELVER, { U: 1 })).toEqual([`spell:${DELVER.name}`]);
  });

  it("⭐ Force of Will's alternative cost pitches Delver of Secrets (a blue card in hand); control — not Grizzly Bears, nor Drowner of Truth (a devoid front face)", () => {
    const counterOn = (pitch) => {
      const g = board({ active: "ai", aiHand: [], hand: [inZone(FORCE_OF_WILL, "fow"), inZone(pitch, "pitch")] });
      const stk = createStackObject({ id: "stk-ai", kind: "spell", source: inZone(GIANT_OCTOPUS, "s-go"), controller: "ai", targets: [], payload: {} });
      return castsOf({ ...g, stack: [stk], priorityHolder: "user" }, "fow").filter((a) => a.altCost).length;
    };
    expect({ delver: counterOn(DELVER), bears: counterOn(GRIZZLY_BEARS), drowner: counterOn(DROWNER_OF_TRUTH) }).toEqual({ delver: 1, bears: 0, drowner: 0 });
  });

  it("⭐ Throne of Eldraine's blue mana (\"monocolored spells of that color\") pays for Invasion of Vryn; control — for Giant Octopus", () => {
    const s = board({ hand: [inZone(VRYN, "iv"), inZone(GIANT_OCTOPUS, "go")], userBf: [perm(THRONE, "th", "user", { chosenColor: "U" })] });
    expect({ vryn: castsOf(s, "iv").length, octopus: castsOf(s, "go").length }).toEqual({ vryn: 1, octopus: 1 });
  });

  it("⭐ casting Delver of Secrets records a blue spell cast this turn (Ricochet Trap's \"an opponent cast a blue spell\")", () => {
    const s0 = board({ hand: [inZone(DELVER, "dv")], pool: { U: 1 } });
    expect(dispatchAction(s0, castOf(s0, "dv")).players.user.spellColorsCastThisTurn).toEqual(["U"]);
  });

  it("⭐ Guildmages' Forum's {W} spent on Edgar, Charmed Groom (white and black) — Edgar enters with a +1/+1 counter; control — Watchwolf", () => {
    // The Forum's {1} from a Forest, its coloured mana the spell's {W}; the rest floats.
    const enters = (card, pool) => {
      const s0 = board({ hand: [inZone(card, "sp")], userBf: [perm(GUILDMAGES_FORUM, "gf", "user"), perm(FOREST, "f1", "user")], pool });
      const cast = castOf(s0, "sp");
      expect(cast).toBeTruthy();
      const p = resolveTopOfStack(dispatchAction(s0, cast)).players.user.battlefield.find((x) => x.card?.name === card.name);
      return p?.counters?.["+1/+1"] || 0;
    };
    expect({ edgar: enters(EDGAR, { B: 1, C: 2 }), watchwolf: enters(WATCHWOLF, { G: 1 }) }).toEqual({ edgar: 1, watchwolf: 1 });
  });

  it("⭐ Chrome Mox imprinting Delver of Secrets makes {U}; control — imprinting a colourless card makes nothing", () => {
    const mox = (imprinted) => manaSources(board({ userBf: [perm(CHROME_MOX, "mox", "user", { imprinted })] }), "user").filter((r) => r.permanentId === "mox").map((r) => r.colors);
    expect({ delver: mox(inZone(DELVER, "x-dv")), reshaper: mox(inZone(MATTER_RESHAPER, "x-mr")) }).toEqual({ delver: [["U"]], reshaper: [] });
  });

  it("⭐ Summoner's Pact's \"green creature card\" finds Kessig Prowler in the library; control — not Delver of Secrets", () => {
    const filter = { groups: [["creature"]], colors: ["green"] }; // effects/parser.js on the card's first line
    expect({ prowler: cardMatchesTutorFilter(KESSIG_PROWLER, filter), delver: cardMatchesTutorFilter(DELVER, filter), bears: cardMatchesTutorFilter(GRIZZLY_BEARS, filter) })
      .toEqual({ prowler: true, delver: false, bears: true });
  });

  it("control — a colourless double-faced card stays colourless: Forsaken Monument triggers on Treasure Map", () => {
    const s0 = board({ hand: [inZone(TREASURE_MAP, "tm")], userBf: [perm(FORSAKEN_MONUMENT, "fm", "user")], pool: { C: 2 } });
    expect(stackNames(dispatchAction(s0, castOf(s0, "tm")))).toEqual([`spell:${TREASURE_MAP.name}`, "triggered-ability:Forsaken Monument"]);
  });
});

/**
 * spellFaceStatics.test.js — a static that asks "is this SPELL an <type> / <subtype>?" reads the face being cast, never the
 * back face of a double-faced card.
 *
 * In-game multi-face cards carry Scryfall's COMBINED type line ("Battle — Siege // Artifact — Equipment") and both faces'
 * text. A nonmodal double-faced spell has its front face up on the stack and only that face's characteristics (CR 712.8c); a
 * meld card on the stack has only its front face's (CR 712.8b); a double-faced spell is cast front face up by default
 * (CR 712.11); a flip card has its normal characteristics until it flips (CR 710.2); an adventurer cast normally has only its
 * normal characteristics (CR 715.4). The cast lane projects a split half, an Adventure and a modal face before a static reads
 * it (CR 709.3b, 715.3b, 712.8f), and a combined split card on the stack can only be a fused spell, whose characteristics are
 * its two halves combined (CR 709.4d). So the one read is faceUp.characteristicTypeLine — the read the cast triggers already
 * use (triggers.typeStr).
 *
 * Until this slice the cost reducers, the taxes, the flash permissions, the cast-from-top permissions, the uncounterable
 * statics, Rivaz's graveyard permission and the spend restrictions read the WHOLE combined line (and the uncounterable check
 * the whole combined text): Foundry Inspector's "Artifact spells" discounted Invasion of New Capenna (a Siege whose back face
 * is an Artifact — Equipment), Prowling Serpopard's "Creature spells" protected Invasion of Ikoria (a Siege whose back face is a
 * Legendary Creature), Thalia's "Noncreature spells" skipped Invasion of Ikoria, a creature-flash permission let a battle be
 * cast at instant speed, Cavern of Souls paid for it, and Malevolent Hermit was uncounterable because its back face says
 * "Noncreature spells you control can't be countered".
 *
 * Real oracle fixtures (bundled Scryfall via cardIndex.publicCard, 2026-10-17; the trailing comment is the card's tier and
 * EDHREC rank). The cast offers are the engine's own (legalActionsForPlayer); an offer's `cost` is what the dispatcher pays.
 */
import { beforeEach, describe, expect, it } from "vitest";

import {
  collectCostReducers, collectCostTaxers, costReductionForSpell, costTaxForSpell, coloredPipReductionForSpell, flashCastPermissionsOf,
  spellMatchesFlashFilter, castFromTopFilterAllows, stackSpellIsUncounterable,
} from "./staticAbilityParser.js";
import { parseSpendRestriction, resolveSourceRestriction, spendRestrictionAllows } from "./manaModel.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { _resetIdsForTests, createGameState, createPermanent, createStackObject } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

// ── real card fixtures (bundled Scryfall, cardIndex.publicCard) ──
const FOUNDRY_INSPECTOR = {"name":"Foundry Inspector","type":"Artifact Creature — Construct","mana":"{3}","cmc":3,"power":"3","toughness":"2","keywords":[],"colors":[],"oracle":"Artifact spells you cast cost {1} less to cast."}; // native-static #251
const NEW_CAPENNA = {"name":"Invasion of New Capenna // Holy Frazzle-Cannon","type":"Battle — Siege // Artifact — Equipment","mana":"{W}{B}","cmc":2,"keywords":["Transform","Equip"],"colors":[],"oracle":"Invasion of New Capenna - Battle — Siege {W}{B}\n(As a Siege enters, choose an opponent to protect it. You and others can attack it. When it's defeated, exile it, then cast it transformed.)\nWhen this Siege enters, you may sacrifice an artifact or creature. When you do, exile target artifact or creature an opponent controls.\n//\nHoly Frazzle-Cannon - Artifact — Equipment \nWhenever equipped creature attacks, put a +1/+1 counter on that creature and each other creature you control that shares a creature type with it.\nEquip {1}","layout":"transform"}; // body-only #9938
const VRYN = {"name":"Invasion of Vryn // Overloaded Mage-Ring","type":"Battle — Siege // Artifact","mana":"{3}{U}","cmc":4,"keywords":["Transform"],"colors":[],"oracle":"Invasion of Vryn - Battle — Siege {3}{U}\n(As a Siege enters, choose an opponent to protect it. You and others can attack it. When it's defeated, exile it, then cast it transformed.)\nWhen this Siege enters, draw three cards, then discard a card.\n//\nOverloaded Mage-Ring - Artifact \n{1}, {T}, Sacrifice this artifact: Copy target spell you control. You may choose new targets for the copy. (A copy of a permanent spell becomes a token.)","layout":"transform"}; // body-only #14949
const EDGAR = {"name":"Edgar, Charmed Groom // Edgar Markov's Coffin","type":"Legendary Creature — Vampire Noble // Legendary Artifact","mana":"{2}{W}{B}","cmc":4,"power":"4","toughness":"4","keywords":["Transform"],"colors":[],"oracle":"Edgar, Charmed Groom - Legendary Creature — Vampire Noble {2}{W}{B}\nOther Vampires you control get +1/+1.\nWhen Edgar dies, return it to the battlefield transformed under its owner's control.\n//\nEdgar Markov's Coffin - Legendary Artifact \nAt the beginning of your upkeep, create a 1/1 white and black Vampire creature token with lifelink and put a bloodline counter on Edgar Markov's Coffin. Then if there are three or more bloodline counters on it, remove those counters and transform it.","layout":"transform"}; // body-only #3620
const IKORIA = {"name":"Invasion of Ikoria // Zilortha, Apex of Ikoria","type":"Battle — Siege // Legendary Creature — Dinosaur","mana":"{X}{G}{G}","cmc":2,"keywords":["Reach","Transform"],"colors":[],"oracle":"Invasion of Ikoria - Battle — Siege {X}{G}{G}\n(As a Siege enters, choose an opponent to protect it. You and others can attack it. When it's defeated, exile it, then cast it transformed.)\nWhen this Siege enters, search your library and/or graveyard for a non-Human creature card with mana value X or less and put it onto the battlefield. If you search your library this way, shuffle.\n//\nZilortha, Apex of Ikoria - Legendary Creature — Dinosaur \nReach\nFor each non-Human creature you control, you may have that creature assign its combat damage as though it weren't blocked.","layout":"transform"}; // body-only #1392
const TARKIR = {"name":"Invasion of Tarkir // Defiant Thundermaw","type":"Battle — Siege // Creature — Dragon","mana":"{1}{R}","cmc":2,"keywords":["Flying","Transform","Trample"],"colors":[],"oracle":"Invasion of Tarkir - Battle — Siege {1}{R}\n(As a Siege enters, choose an opponent to protect it. You and others can attack it. When it's defeated, exile it, then cast it transformed.)\nWhen this Siege enters, reveal any number of Dragon cards from your hand. When you do, this Siege deals X plus 2 damage to any other target, where X is the number of cards revealed this way. (X can be 0.)\n//\nDefiant Thundermaw - Creature — Dragon \nFlying, trample\nWhenever a Dragon you control attacks, it deals 2 damage to any target.","layout":"transform"}; // body-only #8146
const HERMIT = {"name":"Malevolent Hermit // Benevolent Geist","type":"Creature — Human Wizard // Creature — Spirit Wizard","mana":"{1}{U}","cmc":2,"power":"2","toughness":"1","keywords":["Flying","Transform","Disturb"],"colors":[],"oracle":"Malevolent Hermit - Creature — Human Wizard {1}{U}\n{U}, Sacrifice this creature: Counter target noncreature spell unless its controller pays {3}.\nDisturb {2}{U} (You may cast this card from your graveyard transformed for its disturb cost.)\n//\nBenevolent Geist - Creature — Spirit Wizard \nFlying\nNoncreature spells you control can't be countered.\nIf Benevolent Geist would be put into a graveyard from anywhere, exile it instead.","layout":"transform"}; // body-only #4346
const GOLDBUG = {"name":"Goldbug, Humanity's Ally // Goldbug, Scrappy Scout","type":"Legendary Artifact Creature — Robot // Legendary Artifact — Vehicle","mana":"{1}{W}{U}","cmc":3,"power":"3","toughness":"3","keywords":["Living metal","Convert","More Than Meets the Eye"],"colors":[],"oracle":"Goldbug, Humanity's Ally - Legendary Artifact Creature — Robot {1}{W}{U}\nMore Than Meets the Eye {W}{U} (You may cast this card converted for {W}{U}.)\nPrevent all combat damage that would be dealt to attacking Humans you control.\nWhenever you cast your second spell each turn, convert Goldbug.\n//\nGoldbug, Scrappy Scout - Legendary Artifact — Vehicle \nLiving metal (During your turn, this Vehicle is also a creature.)\nHuman spells you control can't be countered.\nWhenever Goldbug and at least one Human attack, draw a card and convert Goldbug.","layout":"transform"}; // body-only #11702
const BIRGI = {"name":"Birgi, God of Storytelling // Harnfel, Horn of Bounty","type":"Legendary Creature — God // Legendary Artifact","mana":"{2}{R}","cmc":3,"power":"3","toughness":"3","keywords":[],"colors":[],"oracle":"Birgi, God of Storytelling - Legendary Creature — God {2}{R}\nWhenever you cast a spell, add {R}. Until end of turn, you don't lose this mana as steps and phases end.\nCreatures you control can boast twice during each of your turns rather than once.\n//\nHarnfel, Horn of Bounty - Legendary Artifact {4}{R}\nDiscard a card: Exile the top two cards of your library. You may play those cards this turn.","layout":"modal_dfc"}; // native-mixed #497
const PROWLING_SERPOPARD = {"name":"Prowling Serpopard","type":"Creature — Cat Snake","mana":"{1}{G}{G}","cmc":3,"power":"4","toughness":"3","keywords":[],"colors":["G"],"oracle":"This spell can't be countered.\nCreature spells you control can't be countered."}; // native-static #3651
const RHYTHM = {"name":"Rhythm of the Wild","type":"Enchantment","mana":"{1}{R}{G}","cmc":3,"keywords":[],"colors":["G","R"],"oracle":"Creature spells you control can't be countered.\nNontoken creatures you control have riot. (They enter with your choice of a +1/+1 counter or haste.)"}; // native-static #222
const LEYLINE_OF_LIFEFORCE = {"name":"Leyline of Lifeforce","type":"Enchantment","mana":"{2}{G}{G}","cmc":4,"keywords":[],"colors":["G"],"oracle":"If this card is in your opening hand, you may begin the game with it on the battlefield.\nCreature spells can't be countered."}; // native-static #13203
const CHIMIL = {"name":"Chimil, the Inner Sun","type":"Legendary Artifact","mana":"{6}","cmc":6,"keywords":["Discover"],"colors":[],"oracle":"Spells you control can't be countered.\nAt the beginning of your end step, discover 5. (Exile cards from the top of your library until you exile a nonland card with mana value 5 or less. Cast it without paying its mana cost or put it into your hand. Put the rest on the bottom in a random order.)"}; // native-mixed #751
const THALIA = {"name":"Thalia, Guardian of Thraben","type":"Legendary Creature — Human Soldier","mana":"{1}{W}","cmc":2,"power":"2","toughness":"1","keywords":["First strike"],"colors":["W"],"oracle":"First strike\nNoncreature spells cost {1} more to cast."}; // native-static #2346
const LODESTONE = {"name":"Lodestone Golem","type":"Artifact Creature — Golem","mana":"{4}","cmc":4,"power":"5","toughness":"3","keywords":[],"colors":[],"oracle":"Nonartifact spells cost {1} more to cast."}; // native-static #7206
const DRAGONSPEAKER = {"name":"Dragonspeaker Shaman","type":"Creature — Human Barbarian Shaman","mana":"{1}{R}{R}","cmc":3,"power":"2","toughness":"2","keywords":[],"colors":["R"],"oracle":"Dragon spells you cast cost {2} less to cast."}; // native-static #1319
const UR_DRAGON = {"name":"The Ur-Dragon","type":"Legendary Creature — Dragon Avatar","mana":"{4}{W}{U}{B}{R}{G}","cmc":9,"power":"10","toughness":"10","keywords":["Flying","Eminence"],"colors":["B","G","R","U","W"],"oracle":"Eminence — As long as The Ur-Dragon is in the command zone or on the battlefield, other Dragon spells you cast cost {1} less to cast.\nFlying\nWhenever one or more Dragons you control attack, draw that many cards, then you may put a permanent card from your hand onto the battlefield."}; // native-mixed #2649
const URZAS_INCUBATOR = {"name":"Urza's Incubator","type":"Artifact","mana":"{3}","cmc":3,"keywords":[],"colors":[],"oracle":"As this artifact enters, choose a creature type.\nCreature spells of the chosen type cost {2} less to cast."}; // native-static #313
const MOROPHON = {"name":"Morophon, the Boundless","type":"Legendary Creature — Shapeshifter","mana":"{7}","cmc":7,"power":"6","toughness":"6","keywords":["Changeling"],"colors":[],"oracle":"Changeling (This card is every creature type.)\nAs Morophon enters, choose a creature type.\nSpells of the chosen type you cast cost {W}{U}{B}{R}{G} less to cast. This effect reduces only the amount of colored mana you pay.\nOther creatures you control of the chosen type get +1/+1."}; // native-static #1580
const SALLY_SPARROW = {"name":"Sally Sparrow","type":"Legendary Creature — Human Detective","mana":"{2}{W}{U}","cmc":4,"power":"2","toughness":"3","keywords":["Investigate"],"colors":["U","W"],"oracle":"You may cast creature spells as though they had flash.\nWhenever one or more other creatures you control leave the battlefield, investigate. This ability triggers only once each turn. (Create a Clue token. It's an artifact with \"{2}, Sacrifice this token: Draw a card.\")"}; // native-mixed #14362
const GARRUKS_HORDE = {"name":"Garruk's Horde","type":"Creature — Beast","mana":"{5}{G}{G}","cmc":7,"power":"7","toughness":"7","keywords":["Trample"],"colors":["G"],"oracle":"Trample\nPlay with the top card of your library revealed.\nYou may cast creature spells from the top of your library. (Do this only any time you could cast that creature spell. You still pay the spell's costs.)"}; // native-static #9380
const MYSTIC_FORGE = {"name":"Mystic Forge","type":"Artifact","mana":"{4}","cmc":4,"keywords":[],"colors":[],"oracle":"You may look at the top card of your library any time.\nYou may cast artifact spells and colorless spells from the top of your library.\n{T}, Pay 1 life: Exile the top card of your library."}; // native-mixed #416
const RIVAZ = {"name":"Rivaz of the Claw","type":"Legendary Creature — Lizard Warlock","mana":"{1}{B}{R}","cmc":3,"power":"3","toughness":"3","keywords":["Menace"],"colors":["B","R"],"oracle":"Menace\n{T}: Add two mana in any combination of colors. Spend this mana only to cast Dragon creature spells.\nOnce during each of your turns, you may cast a Dragon creature spell from your graveyard.\nWhenever you cast a Dragon creature spell from your graveyard, it gains \"When this creature dies, exile it.\""}; // native-mana #2986
const CAVERN = {"name":"Cavern of Souls","type":"Land","mana":"","cmc":0,"keywords":[],"colors":[],"oracle":"As this land enters, choose a creature type.\n{T}: Add {C}.\n{T}: Add one mana of any color. Spend this mana only to cast a creature spell of the chosen type, and that spell can't be countered."}; // land #111
const WORKSHOP = {"name":"Mishra's Workshop","type":"Land","mana":"","cmc":0,"keywords":[],"colors":[],"oracle":"{T}: Add {C}{C}{C}. Spend this mana only to cast artifact spells."}; // land #3736
const MIND_STONE = {"name":"Mind Stone","type":"Artifact","mana":"{2}","cmc":2,"keywords":[],"colors":[],"oracle":"{T}: Add {C}.\n{1}, {T}, Sacrifice this artifact: Draw a card."}; // native-mana #32
const SHIVAN_DRAGON = {"name":"Shivan Dragon","type":"Creature — Dragon","mana":"{4}{R}{R}","cmc":6,"power":"5","toughness":"5","keywords":["Flying"],"colors":["R"],"oracle":"Flying\n{R}: This creature gets +1/+0 until end of turn."}; // native-activated #11144
const BRONTODON = {"name":"Thrashing Brontodon","type":"Creature — Dinosaur","mana":"{1}{G}{G}","cmc":3,"power":"3","toughness":"4","keywords":[],"colors":["G"],"oracle":"{1}, Sacrifice this creature: Destroy target artifact or enchantment."}; // native-activated #2821
const BEARS = {"name":"Grizzly Bears","type":"Creature — Bear","mana":"{1}{G}","cmc":2,"power":"2","toughness":"2","keywords":[],"colors":["G"],"oracle":""}; // native-body #8126
const DIVINATION = {"name":"Divination","type":"Sorcery","mana":"{2}{U}","cmc":3,"keywords":[],"colors":["U"],"oracle":"Draw two cards."}; // native-spell #6263
const COUNTERSPELL = {"name":"Counterspell","type":"Instant","mana":"{U}{U}","cmc":2,"keywords":[],"colors":["U"],"oracle":"Counter target spell."}; // native-spell #16
const FOREST = {"name":"Forest","type":"Basic Land — Forest","mana":"","cmc":0,"keywords":[],"colors":[],"oracle":"({T}: Add {G}.)"}; // land
const ISLAND = {"name":"Island","type":"Basic Land — Island","mana":"","cmc":0,"keywords":[],"colors":[],"oracle":"({T}: Add {U}.)"}; // land
const MOUNTAIN = {"name":"Mountain","type":"Basic Land — Mountain","mana":"","cmc":0,"keywords":[],"colors":[],"oracle":"({T}: Add {R}.)"}; // land

const EMPTY_POOL = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };
const perm = (card, id, controller, extra = {}) => ({ ...createPermanent({ id, card: { ...card, id: `c-${id}` }, controller, summoningSick: false }), ...extra });
const inZone = (card, id) => ({ ...card, id });
/** The user's precombat main phase, the user holding priority with an empty stack. */
function board({ hand = [], userBf = [], aiBf = [], aiHand = [], library = [], graveyard = [], command = [], pool = {}, aiPool = {}, phase = "precombat-main", step = "main" } = {}) {
  const g = createGameState({ userDeck: [], aiDeck: [] });
  return { ...g, turn: 5, phase, step, activePlayer: "user", priorityHolder: "user", stack: [], pendingTriggers: [], consecutivePasses: 0,
    players: { ...g.players,
      user: { ...g.players.user, life: 20, hand, library, graveyard, command, battlefield: userBf, landsPlayedThisTurn: 0, manaPool: { ...EMPTY_POOL, ...pool } },
      ai: { ...g.players.ai, life: 20, hand: aiHand, battlefield: aiBf, manaPool: { ...EMPTY_POOL, ...aiPool } } } };
}
const castsOf = (s, cardId, who = "user") => legalActionsForPlayer(s, who).filter((a) => a.kind === "cast-spell" && a.cardId === cardId);
const castOf = (s, cardId, who = "user") => castsOf(s, cardId, who)[0];
const generic = (a) => (a ? a.cost.generic || 0 : null);

describe("⭐ the cost readers read the face being cast", () => {
  it("⭐ Foundry Inspector's \"Artifact spells\": Invasion of New Capenna, Invasion of Vryn and Edgar, Charmed Groom are not artifact spells (their BACK faces are artifacts)", () => {
    const r = collectCostReducers([perm(FOUNDRY_INSPECTOR, "fi", "user")]);
    const row = Object.fromEntries([NEW_CAPENNA, VRYN, EDGAR].map((c) => [c.name, costReductionForSpell(r, c)]));
    expect(row).toEqual({ [NEW_CAPENNA.name]: 0, [VRYN.name]: 0, [EDGAR.name]: 0 });
  });

  it("control — an artifact spell and the artifact face of a modal double-faced card cast as that face are discounted; its creature face is not", () => {
    const r = collectCostReducers([perm(FOUNDRY_INSPECTOR, "fi", "user")]);
    expect(costReductionForSpell(r, MIND_STONE)).toBe(1);
    const s = board({ hand: [inZone(MIND_STONE, "ms"), inZone(BIRGI, "bg")], userBf: [perm(FOUNDRY_INSPECTOR, "fi", "user")], pool: { R: 9 } });
    expect(generic(castOf(s, "ms"))).toBe(1);
    const faces = Object.fromEntries(castsOf(s, "bg").map((a) => [a.faceCard?.name, { generic: generic(a), R: a.cost.R }]));
    expect(faces).toEqual({ "Birgi, God of Storytelling": { generic: 2, R: 1 }, "Harnfel, Horn of Bounty": { generic: 3, R: 1 } });
  });

  it("⭐ the cast offer: with Foundry Inspector out Edgar still costs {2}{W}{B} and Invasion of Vryn {3}{U}", () => {
    const s = board({ hand: [inZone(EDGAR, "ed"), inZone(VRYN, "iv")], userBf: [perm(FOUNDRY_INSPECTOR, "fi", "user")], pool: { W: 5, U: 5, B: 5 } });
    expect({ edgar: generic(castOf(s, "ed")), vryn: generic(castOf(s, "iv")) }).toEqual({ edgar: 2, vryn: 3 });
  });

  it("⭐ the cast offer: an opponent's Thalia taxes Invasion of New Capenna (a battle is a noncreature spell) and Foundry Inspector does not take the tax back", () => {
    const s = board({ hand: [inZone(NEW_CAPENNA, "nc")], userBf: [perm(FOUNDRY_INSPECTOR, "fi", "user")], aiBf: [perm(THALIA, "th", "ai")], pool: { W: 3, B: 3 } });
    expect(generic(castOf(s, "nc"))).toBe(1);
  });

  it("control — Thalia alone: Invasion of New Capenna costs {1}{W}{B}", () => {
    const s = board({ hand: [inZone(NEW_CAPENNA, "nc")], aiBf: [perm(THALIA, "th", "ai")], pool: { W: 3, B: 3 } });
    expect(generic(castOf(s, "nc"))).toBe(1);
  });

  it("⭐ the taxes: Thalia's \"Noncreature spells\" taxes Invasion of Ikoria (its back face is a creature); Lodestone Golem's \"Nonartifact spells\" taxes Invasion of Vryn and Edgar", () => {
    const taxers = collectCostTaxers([{ controller: "ai", battlefield: [perm(THALIA, "th", "ai"), perm(LODESTONE, "lg", "ai")] }]);
    const row = Object.fromEntries([IKORIA, VRYN, EDGAR, BEARS, MIND_STONE].map((c) => [c.name, costTaxForSpell(taxers, c, "user")]));
    expect(row).toEqual({ [IKORIA.name]: 2, [VRYN.name]: 2, [EDGAR.name]: 1, [BEARS.name]: 1, [MIND_STONE.name]: 1 });
    const s = board({ hand: [inZone(IKORIA, "ik")], aiBf: [perm(THALIA, "th", "ai")], pool: { G: 5 } });
    expect(generic(castOf(s, "ik"))).toBe(1);
  });

  it("⭐ \"Dragon spells\": Dragonspeaker Shaman and The Ur-Dragon's eminence do not discount Invasion of Tarkir (its back face is the Dragon); a Dragon still is discounted", () => {
    const shaman = board({ hand: [inZone(TARKIR, "it"), inZone(SHIVAN_DRAGON, "sd")], userBf: [perm(DRAGONSPEAKER, "ds", "user")], pool: { R: 9 } });
    expect({ tarkir: generic(castOf(shaman, "it")), shivan: generic(castOf(shaman, "sd")) }).toEqual({ tarkir: 1, shivan: 2 });
    const eminence = board({ hand: [inZone(TARKIR, "it"), inZone(SHIVAN_DRAGON, "sd")], command: [inZone(UR_DRAGON, "ur")], pool: { R: 9 } });
    expect({ tarkir: generic(castOf(eminence, "it")), shivan: generic(castOf(eminence, "sd")) }).toEqual({ tarkir: 1, shivan: 3 });
  });

  it("⭐ the chosen type: Urza's Incubator naming Dragon does not discount Invasion of Tarkir; Morophon naming Dragon does not take its {R}", () => {
    const incubator = board({ hand: [inZone(TARKIR, "it"), inZone(SHIVAN_DRAGON, "sd")], userBf: [perm(URZAS_INCUBATOR, "ui", "user", { chosenType: "Dragon" })], pool: { R: 9 } });
    expect({ tarkir: generic(castOf(incubator, "it")), shivan: generic(castOf(incubator, "sd")) }).toEqual({ tarkir: 1, shivan: 2 });
    const morophon = board({ hand: [inZone(TARKIR, "it"), inZone(SHIVAN_DRAGON, "sd")], userBf: [perm(MOROPHON, "mo", "user", { chosenType: "Dragon" })], pool: { R: 9 } });
    expect({ tarkir: castOf(morophon, "it")?.cost.R, shivan: castOf(morophon, "sd")?.cost.R }).toEqual({ tarkir: 1, shivan: 1 });
    expect(coloredPipReductionForSpell(collectCostReducers([perm(MOROPHON, "mo", "user", { chosenType: "Dragon" })]), TARKIR)).toEqual({});
  });
});

/** `spell` on the user's stack; the AI holds Counterspell with {U}{U} floating and has priority. */
function counterBoard({ userBf = [], spell }) {
  const g = createGameState({ userDeck: [], aiDeck: [] });
  const stk = createStackObject({ id: "stk-spell", kind: "spell", source: spell, controller: "user", targets: [], payload: {} });
  return { ...g, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "ai", turn: 5, consecutivePasses: 0, stack: [stk],
    players: { ...g.players,
      user: { ...g.players.user, battlefield: userBf },
      ai: { ...g.players.ai, hand: [inZone(COUNTERSPELL, "h-cs")], manaPool: { ...EMPTY_POOL, U: 2 } } } };
}
const counterOffers = (s) => castsOf(s, "h-cs", "ai");

describe("⭐ can't be countered reads the face being cast", () => {
  it("⭐ through the cast lane: Invasion of Ikoria cast beside Prowling Serpopard is countered by the opponent's Counterspell", () => {
    const s0 = board({ hand: [inZone(IKORIA, "ik")], userBf: [perm(PROWLING_SERPOPARD, "ps", "user")], aiHand: [inZone(COUNTERSPELL, "h-cs")], pool: { G: 2 }, aiPool: { U: 2 } });
    const cast = castOf(s0, "ik");
    expect(cast).toBeTruthy();
    const s1 = { ...dispatchAction(s0, cast), priorityHolder: "ai" };
    const spell = s1.stack.find((o) => o.kind === "spell");
    expect(spell.source.name).toBe(IKORIA.name);
    const offers = counterOffers(s1);
    expect(offers.map((a) => a.targets.map((t) => t.id))).toEqual([[spell.id]]);
    const s2 = resolveTopOfStack(dispatchAction(s1, offers[0]));
    expect({ stack: s2.stack.map((o) => o.source?.name), graveyard: s2.players.user.graveyard.map((c) => c.name) })
      .toEqual({ stack: [], graveyard: [IKORIA.name] });
  });

  it("⭐ the predicate: Serpopard, Rhythm of the Wild and Leyline of Lifeforce do not protect Invasion of Ikoria; they protect a creature spell", () => {
    const uncounterable = (protector, spell) => {
      const s = counterBoard({ userBf: [perm(protector, "pr", "user")], spell });
      return stackSpellIsUncounterable(s, s.stack[0]);
    };
    const rows = [PROWLING_SERPOPARD, RHYTHM, LEYLINE_OF_LIFEFORCE].map((p) => [p.name, { ikoria: uncounterable(p, inZone(IKORIA, "s-ik")), bears: uncounterable(p, inZone(BEARS, "s-gb")) }]);
    expect(rows).toEqual([PROWLING_SERPOPARD, RHYTHM, LEYLINE_OF_LIFEFORCE].map((p) => [p.name, { ikoria: false, bears: true }]));
  });

  it("⭐ Invasion of Ikoria under Serpopard is a legal Counterspell target", () => {
    expect(counterOffers(counterBoard({ userBf: [perm(PROWLING_SERPOPARD, "ps", "user")], spell: inZone(IKORIA, "s-ik") })).length).toBe(1);
  });

  it("control — under Serpopard a creature spell is not a Counterspell target and a sorcery is; under Chimil the battle is protected", () => {
    expect(counterOffers(counterBoard({ userBf: [perm(PROWLING_SERPOPARD, "ps", "user")], spell: inZone(BEARS, "s-gb") }))).toHaveLength(0);
    expect(counterOffers(counterBoard({ userBf: [perm(PROWLING_SERPOPARD, "ps", "user")], spell: inZone(DIVINATION, "s-dv") }))).toHaveLength(1);
    expect(counterOffers(counterBoard({ userBf: [perm(CHIMIL, "ch", "user")], spell: inZone(IKORIA, "s-ik") }))).toHaveLength(0);
  });

  it("⭐ a back face's \"can't be countered\" line is not the spell's: Malevolent Hermit (cast through the lane) and Goldbug are counterable", () => {
    const s0 = board({ hand: [inZone(HERMIT, "mh")], aiHand: [inZone(COUNTERSPELL, "h-cs")], pool: { U: 2 }, aiPool: { U: 2 } });
    const s1 = { ...dispatchAction(s0, castOf(s0, "mh")), priorityHolder: "ai" };
    expect(s1.stack.map((o) => o.source?.name)).toEqual([HERMIT.name]);
    expect(counterOffers(s1)).toHaveLength(1);
    expect(counterOffers(counterBoard({ spell: inZone(GOLDBUG, "s-gold") }))).toHaveLength(1);
  });
});

describe("⭐ the cast permissions read the face being cast", () => {
  /** The user's own upkeep: instant speed only, so a sorcery-speed cast is offered only through a flash permission. */
  const upkeep = (o) => board({ ...o, phase: "upkeep", step: "upkeep" });

  it("⭐ Sally Sparrow's \"creature spells as though they had flash\": Invasion of Ikoria is not cast in the upkeep; a creature and Edgar (a creature front) are", () => {
    const s = upkeep({ hand: [inZone(IKORIA, "ik"), inZone(BEARS, "gb"), inZone(EDGAR, "ed")], userBf: [perm(SALLY_SPARROW, "ss", "user")], pool: { W: 9, B: 9, G: 9 } });
    expect({ ikoria: castsOf(s, "ik").length, bears: castsOf(s, "gb").length, edgar: castsOf(s, "ed").length }).toEqual({ ikoria: 0, bears: 1, edgar: 1 });
    const [spec] = flashCastPermissionsOf(SALLY_SPARROW);
    expect({ ikoria: spellMatchesFlashFilter(spec, IKORIA), edgar: spellMatchesFlashFilter(spec, EDGAR) }).toEqual({ ikoria: false, edgar: true });
  });

  it("⭐ Garruk's Horde's \"creature spells from the top\": Invasion of Ikoria is not cast off the top; a creature is; of Birgi only the creature face", () => {
    const top = (card) => board({ library: [card, inZone(BEARS, "filler")], userBf: [perm(GARRUKS_HORDE, "gh", "user")], pool: { R: 9, G: 9 } });
    const fromTop = (s) => legalActionsForPlayer(s, "user").filter((a) => a.kind === "cast-spell" && a.fromZone === "library").map((a) => a.faceCard?.name || a.name);
    expect(fromTop(top(inZone(IKORIA, "ik")))).toEqual([]);
    expect(fromTop(top(inZone(BEARS, "gb")))).toEqual([BEARS.name]);
    expect(fromTop(top(inZone(BIRGI, "bg")))).toEqual(["Birgi, God of Storytelling"]);
    expect(castFromTopFilterAllows(["Creature"], IKORIA)).toBe(false);
  });

  it("⭐ Mystic Forge's \"artifact spells\" off the top: of Birgi only its artifact face, Harnfel", () => {
    const s = board({ library: [inZone(BIRGI, "bg"), inZone(BEARS, "filler")], userBf: [perm(MYSTIC_FORGE, "mf", "user")], pool: { R: 9 } });
    expect(legalActionsForPlayer(s, "user").filter((a) => a.kind === "cast-spell" && a.fromZone === "library").map((a) => a.faceCard?.name)).toEqual(["Harnfel, Horn of Bounty"]);
  });

  it("⭐ Rivaz of the Claw's \"Dragon creature spell from your graveyard\": Invasion of Tarkir is not cast from the graveyard; a Dragon is", () => {
    const s = board({ graveyard: [inZone(TARKIR, "it"), inZone(SHIVAN_DRAGON, "sd")], userBf: [perm(RIVAZ, "rv", "user")], pool: { R: 9 } });
    expect([...new Set(legalActionsForPlayer(s, "user").filter((a) => a.kind === "cast-spell" && a.fromZone === "graveyard").map((a) => a.cardId))]).toEqual(["sd"]);
  });
});

describe("⭐ the spend restrictions read the face being cast", () => {
  it("⭐ Cavern of Souls naming Dinosaur does not pay for Invasion of Ikoria (its back face is the Dinosaur); it pays for a Dinosaur creature", () => {
    const lands = [perm(CAVERN, "cav", "user", { chosenType: "Dinosaur" }), perm(FOREST, "for", "user"), perm(MOUNTAIN, "mtn", "user")];
    const s = board({ hand: [inZone(IKORIA, "ik"), inZone(BRONTODON, "tb")], userBf: lands });
    expect({ ikoria: castsOf(s, "ik").length, brontodon: castsOf(s, "tb").length }).toEqual({ ikoria: 0, brontodon: 1 });
    const cavern = resolveSourceRestriction(parseSpendRestriction(CAVERN.oracle), { chosenType: "Dinosaur" });
    expect({ ikoria: spendRestrictionAllows(cavern, IKORIA), brontodon: spendRestrictionAllows(cavern, BRONTODON) }).toEqual({ ikoria: false, brontodon: true });
  });

  it("⭐ Mishra's Workshop's \"artifact spells\" does not pay for Invasion of Vryn; it pays for Foundry Inspector", () => {
    // (Foundry Inspector costs exactly {3}: the planner spends a restricted multi-mana source only where the cost takes all of it.)
    const s = board({ hand: [inZone(VRYN, "iv"), inZone(FOUNDRY_INSPECTOR, "fi")], userBf: [perm(WORKSHOP, "ws", "user"), perm(ISLAND, "isl", "user")] });
    expect({ vryn: castsOf(s, "iv").length, inspector: castsOf(s, "fi").length }).toEqual({ vryn: 0, inspector: 1 });
  });
});

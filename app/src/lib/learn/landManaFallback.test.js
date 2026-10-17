/**
 * landManaFallback.test.js — THE LAND {C} FALLBACK (2026-10-17, found by the mana-honesty slice).
 *
 * manaModel's last arm read: a land that prints "add" anywhere but whose mana line the parser can't read "still taps for
 * something — assume colorless". So an unreadable line made {C}, and coverage.landFullyCovered, which reads each line
 * through the same parser, counted that line as modelled:
 *   · Crypt of Agadeem made {C} (behind its {2}) where it prints {B}, and its count line was never made;
 *   · Cabal Stronghold, Urza's Workshop, Cascading Cataracts and Baldur's Gate were credited "land" on a second line the
 *     engine never made (each made only its plain {C});
 *   · Gem Bazaar, City of Shadows, Cryptic Spires, Forsaken Crossroads and Captivating Crossroads made a {C} they can't make;
 *   · Nykthos' devotion line was credited off the fallback and never made.
 * Now: no mana from an unreadable line; a land's whole-card parse that fails reads its plain "{T}: Add …" line; a land's
 * plain line is its main product beside a count line, and the count line rides as its own record behind its mana cost (the
 * free-activation fix) — the basic-Swamp, black-creature-card, Urza's-land, other-Gates and storage-counter counts, the
 * any-combination line, and Nykthos' devotion to the colour chosen (CR 700.5). A land with a basic land type and no readable
 * line makes that type's mana (CR 305.6). The land gate credits a line only when the runtime makes it.
 *
 * Fixtures are verbatim oracle and type lines from the bundled Scryfall snapshot (probed 2026-10-17).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { manaProduction, manaSources, planPayment } from "./manaModel.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const land = (name, type, oracle) => ({ name, type, mana: "", cmc: 0, colors: [], keywords: [], oracle });
const CRYPT = land("Crypt of Agadeem", "Land", "This land enters tapped.\n{T}: Add {B}.\n{2}, {T}: Add {B} for each black creature card in your graveyard.");
const STRONGHOLD = land("Cabal Stronghold", "Land", "{T}: Add {C}.\n{3}, {T}: Add {B} for each basic Swamp you control.");
const WORKSHOP = land("Urza's Workshop", "Land — Urza's", "{T}: Add {C}.\nMetalcraft — {T}: Add {C} for each Urza's land you control. Activate only if you control three or more artifacts.");
const MINE = land("Urza's Mine", "Land — Urza's Mine", "{T}: Add {C}. If you control an Urza's Power-Plant and an Urza's Tower, add {C}{C} instead.");
const TOWER = land("Urza's Tower", "Land — Urza's Tower", "{T}: Add {C}. If you control an Urza's Mine and an Urza's Power-Plant, add {C}{C}{C} instead.");
const BALDURS = land("Baldur's Gate", "Legendary Land — Gate", "{T}: Add {C}.\n{2}, {T}: Add X mana of any one color, where X is the number of other Gates you control.");
const GUILDGATE = land("Azorius Guildgate", "Land — Gate", "This land enters tapped.\n{T}: Add {W} or {U}.");
const PLAZA_HARMONY = land("Plaza of Harmony", "Land", "When this land enters, if you control two or more Gates, you gain 3 life.\n{T}: Add {C}.\n{T}: Add one mana of any type that a Gate you control could produce.");
const CATARACTS = land("Cascading Cataracts", "Land", "Indestructible\n{T}: Add {C}.\n{5}, {T}: Add five mana in any combination of colors.");
const NYKTHOS = land("Nykthos, Shrine to Nyx", "Legendary Land", "{T}: Add {C}.\n{2}, {T}: Choose a color. Add an amount of mana of that color equal to your devotion to that color. (Your devotion to a color is the number of mana symbols of that color in the mana costs of permanents you control.)");
const NIGHT_MARKET = { ...land("Night Market", "Land", "This land enters tapped. As it enters, choose a color.\n{T}: Add one mana of the chosen color.\nCycling {3} ({3}, Discard this card: Draw a card.)"), keywords: ["Cycling"] };
const BIG_APPLE = land("Big Apple, 3 a.m.", "Land", "This land enters tapped. As it enters, choose a color.\n{T}: Add one mana of the chosen color.\n{5}, {T}: Create a 1/1 black Rat creature token for each opponent you have.");
const TTC = land("Three Tree City", "Legendary Land", "As Three Tree City enters, choose a creature type.\n{T}: Add {C}.\n{2}, {T}: Choose a color. Add an amount of mana of that color equal to the number of creatures you control of the chosen type.");
const GEM_BAZAAR = land("Gem Bazaar", "Land", "When Gem Bazaar comes into play, choose a random color.\n{T}: Add to your mana pool one mana of the color last chosen. Then choose a random color.");
const CITY_OF_SHADOWS = land("City of Shadows", "Land", "{T}, Exile a creature you control: Put a storage counter on this land.\n{T}: Add {C} for each storage counter on this land.");
const CRYPTIC_SPIRES = land("Cryptic Spires", "Land", "As you create your deck, circle two of the colors below.\nThis land enters tapped.\n{T}: Add one mana of either of the circled colors.");
const FORSAKEN = { ...land("Forsaken Crossroads", "Land", "Forsaken Crossroads enters the battlefield tapped.\nAs Forsaken Crossroads enters the battlefield, choose a color.\nWhen Forsaken Crossroads enters the battlefield, scry 1. If you weren't the starting player, you may untap Forsaken Crossroads instead.\n{T}: Add one mana of the chosen color."), keywords: ["Scry"] };
const FABLED_PATH = land("Fabled Path of Searo Point", "Legendary Land — Mountain", "{W}{U}{B}{R}{G}, {T}: Creatures you control gain landwalk until end of turn.");
const GREAT_HALL = land("Great Hall of the Citadel", "Land", "{T}: Add {C}.\n{1}, {T}: Add two mana in any combination of colors. Spend this mana only to cast legendary spells.");
const SUNKEN_CITADEL = land("Sunken Citadel", "Land — Cave", "This land enters tapped. As it enters, choose a color.\n{T}: Add one mana of the chosen color.\n{T}: Add two mana of the chosen color. Spend this mana only to activate abilities of land sources.");
const MAGE_RING = land("Mage-Ring Network", "Land", "{T}: Add {C}.\n{1}, {T}: Put a storage counter on this land.\n{T}, Remove any number of storage counters from this land: Add {C} for each storage counter removed this way.");
const FOREST = land("Forest", "Basic Land — Forest", "({T}: Add {G}.)");
const SWAMP = land("Swamp", "Basic Land — Swamp", "({T}: Add {B}.)");
const WATERY_GRAVE = land("Watery Grave", "Land — Island Swamp", "({T}: Add {U} or {B}.)\nAs this land enters, you may pay 2 life. If you don't, it enters tapped.");
const OVERGROWN_TOMB = land("Overgrown Tomb", "Land — Swamp Forest", "({T}: Add {B} or {G}.)\nAs this land enters, you may pay 2 life. If you don't, it enters tapped.");
const CRADLE = land("Gaea's Cradle", "Legendary Land", "{T}: Add {G} for each creature you control.");
const COMMAND_TOWER = land("Command Tower", "Land", "{T}: Add one mana of any color in your commander's color identity.");
const ORNITHOPTER = { name: "Ornithopter", type: "Artifact Creature — Thopter", mana: "{0}", cmc: 0, colors: [], power: "0", toughness: "2", keywords: ["Flying"], oracle: "Flying" };
const BALOTH = { name: "Leatherback Baloth", type: "Creature — Beast", mana: "{G}{G}{G}", cmc: 3, colors: ["G"], power: "4", toughness: "5", keywords: [], oracle: "" };
const PHANTASMAL_BEAR = { name: "Phantasmal Bear", type: "Creature — Bear Illusion", mana: "{U}", cmc: 1, colors: ["U"], power: "2", toughness: "2", keywords: [], oracle: "When this creature becomes the target of a spell or ability, sacrifice it." };
const BEARS = { name: "Grizzly Bears", type: "Creature — Bear", mana: "{1}{G}", cmc: 2, colors: ["G"], power: "2", toughness: "2", keywords: [], oracle: "" };
const NIGHTHAWK = { name: "Vampire Nighthawk", type: "Creature — Vampire Shaman", mana: "{1}{B}{B}", cmc: 3, colors: ["B"], power: "2", toughness: "3", keywords: ["Deathtouch", "Flying", "Lifelink"], oracle: "Flying\nDeathtouch (Any amount of damage this deals to a creature is enough to destroy it.)\nLifelink (Damage dealt by this creature also causes you to gain that much life.)" };
const GRAVECRAWLER = { name: "Gravecrawler", type: "Creature — Zombie", mana: "{B}", cmc: 1, colors: ["B"], power: "2", toughness: "1", keywords: [], oracle: "This creature can't block.\nYou may cast this card from your graveyard as long as you control a Zombie." };
const SENGIR = { name: "Sengir Vampire", type: "Creature — Vampire", mana: "{3}{B}{B}", cmc: 5, colors: ["B"], power: "4", toughness: "4", keywords: ["Flying"], oracle: "Flying (This creature can't be blocked except by creatures with flying or reach.)\nWhenever a creature dealt damage by this creature this turn dies, put a +1/+1 counter on this creature." };
const DARK_RITUAL = { name: "Dark Ritual", type: "Instant", mana: "{B}", cmc: 1, colors: ["B"], keywords: [], oracle: "Add {B}{B}{B}." };

const on = (id, card, extra = {}) => ({ ...createPermanent({ id, card: { id: `c-${id}`, ...card }, controller: "user", summoningSick: false }), ...extra });
const many = (card, n, prefix) => Array.from({ length: n }, (_, i) => on(`${prefix}${i}`, card));
function table(battlefield, { graveyard = [], pool = {} } = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return { ...s, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
    players: { ...s.players, user: { ...s.players.user, battlefield, manaPool: { ...s.players.user.manaPool, ...pool }, hand: [],
      graveyard: graveyard.map((c, i) => ({ ...c, id: `g${i}` })), library: [{ ...FOREST, id: "lib" }] } } };
}
const affords = (s, cost) => planPayment(s.players.user.manaPool, manaSources(s, "user"), { generic: 0, W: 0, U: 0, B: 0, R: 0, G: 0, C: 0, hybrid: [], ...cost }) !== null;
// The explicit tap's options for one permanent: the colour each action names.
const handTaps = (s, id) => legalActionsForPlayer(s, "user").filter((a) => a.kind === "tap-for-mana" && a.permanentId === id).map((a) => a.color).sort();
const floating = (s) => Object.fromEntries(Object.entries(s.players.user.manaPool).filter(([, n]) => n));

describe("Crypt of Agadeem — {B}, and {B} for each black creature card behind {2}; never {C}", () => {
  const GY = [NIGHTHAWK, GRAVECRAWLER, SENGIR, NIGHTHAWK, BEARS, DARK_RITUAL]; // four black creature cards; a green creature and a black instant don't count

  it("the main product is its printed {T}: Add {B}", () => {
    expect(manaProduction(CRYPT)).toMatchObject({ colors: ["B"], amount: 1 });
  });

  it("planner (WITNESS): two Swamps fund the {2} and it makes four black — {B}{B}{B}{B} yes, five no, any {C} no", () => {
    const s = table([on("crypt", CRYPT), on("sw1", SWAMP), on("sw2", SWAMP)], { graveyard: GY });
    expect({ b4: affords(s, { B: 4 }), b5: affords(s, { B: 5 }), c1: affords(s, { C: 1 }) }).toEqual({ b4: true, b5: false, c1: false });
  });

  it("explicit tap: {B} with an empty pool and an empty graveyard; never {C}, even with {2} floating", () => {
    const dry = table([on("crypt", CRYPT)]);
    const wet = table([on("crypt", CRYPT)], { pool: { C: 2 } });
    const tap = legalActionsForPlayer(dry, "user").find((a) => a.kind === "tap-for-mana" && a.permanentId === "crypt");
    expect({ dry: handTaps(dry, "crypt"), wet: handTaps(wet, "crypt"), after: tap ? floating(dispatchAction(dry, tap)) : null })
      .toEqual({ dry: ["B"], wet: ["B"], after: { B: 1 } });
  });

  it("stays a covered land: both lines are made", () => {
    expect(classifyCard(CRYPT)).toBe("land");
  });
});

describe("Cabal Stronghold — {C}, and {B} for each BASIC Swamp behind {3}", () => {
  it("planner (WITNESS): four basic Swamps and two nonbasic Swamps — seven black, not eight (the duals are no basic Swamps)", () => {
    const s = table([on("cs", STRONGHOLD), ...many(SWAMP, 4, "sw"), on("wg", WATERY_GRAVE), on("ot", OVERGROWN_TOMB)]);
    expect({ b7: affords(s, { B: 7 }), b8: affords(s, { B: 8 }) }).toEqual({ b7: true, b8: false });
  });

  it("explicit tap offers its plain {C}; a covered land", () => {
    expect({ taps: handTaps(table([on("cs", STRONGHOLD)]), "cs"), tier: classifyCard(STRONGHOLD) }).toEqual({ taps: ["C"], tier: "land" });
  });
});

describe("Urza's Workshop, Baldur's Gate, Cascading Cataracts — the second line is made", () => {
  it("Workshop with metalcraft and three Urza's lands: {C}{C}{C} from it, five in all; without artifacts, three", () => {
    const lands = [on("ws", WORKSHOP), on("mine", MINE), on("tower", TOWER)];
    const s = table([...lands, ...many(ORNITHOPTER, 3, "orn")]);
    const bare = table(lands);
    expect({ five: affords(s, { generic: 5 }), six: affords(s, { generic: 6 }), bareFour: affords(bare, { generic: 4 }), tier: classifyCard(WORKSHOP) })
      .toEqual({ five: true, six: false, bareFour: false, tier: "land" });
  });

  it("Baldur's Gate with three other Gates: two fund the {2}, it makes three of one colour — {R}{R}{R} yes, four no (it counts OTHER Gates)", () => {
    const s = table([on("bg", BALDURS), ...many(GUILDGATE, 3, "gg")]);
    expect({ r3: affords(s, { R: 3 }), r4: affords(s, { R: 4 }), tier: classifyCard(BALDURS) }).toEqual({ r3: true, r4: false, tier: "land" });
  });

  it("Plaza of Harmony makes a type a Gate it controls could produce: beside Azorius Guildgate and a Forest {W}{W} yes, {G}{G} no (the Forest is no Gate); alone {C} only", () => {
    const s = table([on("ph", PLAZA_HARMONY), on("gg", GUILDGATE), on("f", FOREST)]);
    const alone = table([on("ph", PLAZA_HARMONY)]);
    expect({ w2: affords(s, { W: 2 }), wu: affords(s, { W: 1, U: 1 }), g2: affords(s, { G: 2 }), aloneC: affords(alone, { C: 1 }), aloneW: affords(alone, { W: 1 }), taps: handTaps(s, "ph"), tier: classifyCard(PLAZA_HARMONY) })
      // + 2026-10-17 (the land lines): its plain {C} line, an extra record, is offered by hand too (no earlier record makes {C}).
      .toEqual({ w2: true, wu: true, g2: false, aloneC: true, aloneW: false, taps: ["C", "U", "W"], tier: "land" });
  });

  it("Cascading Cataracts with five Forests: {5} buys five blue; its plain {C} is the main product and the explicit tap's", () => {
    const s = table([on("cc", CATARACTS), ...many(FOREST, 5, "f")]);
    expect({ main: manaProduction(CATARACTS), u5: affords(s, { U: 5 }), u6: affords(s, { U: 6 }), taps: handTaps(table([on("cc", CATARACTS)]), "cc"), tier: classifyCard(CATARACTS) })
      .toMatchObject({ main: { colors: ["C"], amount: 1 }, u5: true, u6: false, taps: ["C"], tier: "land" });
  });
});

describe("Nykthos, Shrine to Nyx — devotion to the colour chosen, behind {2} (CR 700.5)", () => {
  // Leatherback Baloth: devotion to green 3. Phantasmal Bear: devotion to blue 1.
  const board = () => table([on("nyx", NYKTHOS), ...many(FOREST, 3, "f"), on("baloth", BALOTH), on("bear", PHANTASMAL_BEAR)]);

  it("planner (WITNESS): two Forests fund it for three green — {G}{G}{G}{G} yes, five no; blue is only one — {U}{U} no", () => {
    const s = board();
    expect({ g4: affords(s, { G: 4 }), g5: affords(s, { G: 5 }), u2: affords(s, { U: 2 }), u1g1: affords(s, { U: 1, G: 1 }) })
      .toEqual({ g4: true, g5: false, u2: false, u1g1: true });
  });

  it("the record tried first is the biggest: devotion four blue and six green, {5} — Nykthos makes six green, not four blue", () => {
    const s = table([on("nyx", NYKTHOS), ...many(FOREST, 3, "f"), ...many(BALOTH, 2, "b"), ...many(PHANTASMAL_BEAR, 4, "u")]);
    const plan = planPayment(s.players.user.manaPool, manaSources(s, "user"), { generic: 5, W: 0, U: 0, B: 0, R: 0, G: 0, C: 0, hybrid: [] });
    expect(plan?.taps.find((t) => t.permanentId === "nyx")).toMatchObject({ color: "G", amount: 6 });
  });

  it("still a covered land; the explicit tap offers its plain {C}", () => {
    expect({ tier: classifyCard(NYKTHOS), taps: handTaps(board(), "nyx") }).toEqual({ tier: "land", taps: ["C"] });
  });
});

describe("chosen-colour lands and Three Tree City still work", () => {
  it("Night Market and Big Apple, 3 a.m. stay covered lands; a stamped Night Market makes its colour by hand and for the planner", () => {
    const s = table([on("nm", NIGHT_MARKET, { chosenColor: "U" })]);
    expect({ nm: classifyCard(NIGHT_MARKET), apple: classifyCard(BIG_APPLE), taps: handTaps(s, "nm"), u1: affords(s, { U: 1 }), g1: affords(s, { G: 1 }) })
      .toEqual({ nm: "land", apple: "land", taps: ["U"], u1: true, g1: false });
  });

  it("Three Tree City stays a covered land", () => {
    expect(classifyCard(TTC)).toBe("land");
  });
});

describe("no phantom {C} from an unreadable line", () => {
  it("Gem Bazaar, Cryptic Spires and Forsaken Crossroads make nothing: a lone one can't pay {1}", () => {
    const reads = [GEM_BAZAAR, CRYPTIC_SPIRES, FORSAKEN].map((c) => manaProduction(c));
    expect({ reads, pays: affords(table([on("gb", GEM_BAZAAR)]), { generic: 1 }) }).toEqual({ reads: [null, null, null], pays: false });
  });

  it("City of Shadows makes {C} for each storage counter on it: none — nothing; three — {C}{C}{C}", () => {
    expect({ none: affords(table([on("cos", CITY_OF_SHADOWS)]), { generic: 1 }), three: affords(table([on("cos", CITY_OF_SHADOWS, { counters: { storage: 3 } })]), { C: 3 }) })
      .toEqual({ none: false, three: true });
  });

  it("a land with a basic land type and no readable line makes that type's mana (CR 305.6): Fabled Path of Searo Point taps for {R}", () => {
    expect({ main: manaProduction(FABLED_PATH), r1: affords(table([on("fp", FABLED_PATH)]), { R: 1 }) }).toMatchObject({ main: { colors: ["R"], amount: 1 }, r1: true });
  });

  it("a line the runtime never makes is not credited: Great Hall of the Citadel and Sunken Citadel are partial lands now", () => {
    expect({ hall: classifyCard(GREAT_HALL), citadel: classifyCard(SUNKEN_CITADEL) }).toEqual({ hall: "land-partial", citadel: "land-partial" });
  });

  it("Mage-Ring Network: its plain {C} is the main product (the explicit tap's), the storage line still rides", () => {
    const s = table([on("mr", MAGE_RING, { counters: { storage: 3 } })]);
    expect({ main: manaProduction(MAGE_RING), taps: handTaps(s, "mr"), c3: affords(s, { C: 3 }) }).toMatchObject({ main: { colors: ["C"], amount: 1, requiresTap: true }, taps: ["C"], c3: true });
  });
});

describe("controls", () => {
  it("Forest, Command Tower and Gaea's Cradle read as before", () => {
    expect({ forest: manaProduction(FOREST), tower: manaProduction(COMMAND_TOWER)?.colorsAmongSpec, cradle: manaProduction(CRADLE)?.amountSpec })
      .toEqual({ forest: { colors: ["G"], amount: 1 }, tower: { kind: "commanderColorIdentity" }, cradle: { kind: "permanentsYouControl", cardType: "creature" } });
  });

  it("Gaea's Cradle with three creatures makes {G}{G}{G} by hand and for the planner", () => {
    const s = table([on("gc", CRADLE), ...many(BEARS, 3, "b")]);
    const tap = legalActionsForPlayer(s, "user").find((a) => a.kind === "tap-for-mana" && a.permanentId === "gc");
    expect({ g3: affords(s, { G: 3 }), g4: affords(s, { G: 4 }), after: tap ? floating(dispatchAction(s, tap)) : null, tier: classifyCard(CRADLE) })
      .toEqual({ g3: true, g4: false, after: { G: 3 }, tier: "land" });
  });
});

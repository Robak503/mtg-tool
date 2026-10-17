/**
 * manaDroppedText.test.js — mana text the engine read past (2026-10-16). Three families, each a false positive:
 *
 *   1. DAMAGE ON THE MANA LINE. Ancient Tomb ("{T}: Add {C}{C}. This land deals 2 damage to you.") made {C}{C} with no damage:
 *      the painland reader took one coloured symbol only, so a colourless bundle fell through to the bare parse. Tomb of Urami's
 *      "deals 1 damage to you if you don't control an Ogre" was never dealt at all. Damage to a player from a source without
 *      infect is life lost (CR 120.3a); the painland path deals it on the planner's tap and the explicit tap alike.
 *   2. A COLOUR SET READ AS ANY COLOUR. Mox Amber ("any color among legendary creatures and planeswalkers you control"), Exotic
 *      Orchard / Fellwar Stone / Quirion and Sylvok Explorer ("any color that a land an opponent controls could produce", CR
 *      106.7), Star Compass ("…a basic land you control…") and Harvester Druid ("…a land you control…" — colours, never {C}) all
 *      made any of the five.
 *   3. "YOUR COMMANDER'S COLOR IDENTITY" READ AS ANY COLOUR. Command Tower, Arcane Signet, Commander's Sphere, Path of Ancestry,
 *      Hidden Hideout and Command Mine made all five on a mono-green deck — and with no commander at all, where the quality is
 *      undefined and the ability makes nothing (CR 903.4f).
 *
 * Each card on a board through the planner (a cast) and the explicit tap, with controls. Real oracle fixtures (bundled
 * oracle-index.json, read in-session 2026-10-16).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { flushTriggers, resolveTopOfStack } from "./gameEngine.js";
import { manaProduction, manaSources, planPayment } from "./manaModel.js";

beforeEach(() => _resetIdsForTests());

// ── Mana sources ──
const TOMB = { name: "Ancient Tomb", type: "Land", mana: "", oracle: "{T}: Add {C}{C}. This land deals 2 damage to you." };
const URAMI = { name: "Tomb of Urami", type: "Legendary Land", mana: "",
  oracle: "{T}: Add {B}. Tomb of Urami deals 1 damage to you if you don't control an Ogre.\n{2}{B}{B}, {T}, Sacrifice all lands you control: Create Urami, a legendary 5/5 black Demon Spirit creature token with flying." };
const MOX_AMBER = { name: "Mox Amber", type: "Legendary Artifact", mana: "{0}", oracle: "{T}: Add one mana of any color among legendary creatures and planeswalkers you control." };
const TOWER = { name: "Command Tower", type: "Land", mana: "", oracle: "{T}: Add one mana of any color in your commander's color identity." };
const SIGNET = { name: "Arcane Signet", type: "Artifact", mana: "{2}", oracle: "{T}: Add one mana of any color in your commander's color identity." };
const SPHERE = { name: "Commander's Sphere", type: "Artifact", mana: "{3}", oracle: "{T}: Add one mana of any color in your commander's color identity.\nSacrifice this artifact: Draw a card." };
const PATH = { name: "Path of Ancestry", type: "Land", mana: "",
  oracle: "This land enters tapped.\n{T}: Add one mana of any color in your commander's color identity. When that mana is spent to cast a creature spell that shares a creature type with your commander, scry 1. (Look at the top card of your library. You may put that card on the bottom.)" };
const HIDEOUT = { name: "Hidden Hideout", type: "Land", mana: "",
  oracle: "This land enters tapped.\n{T}: Add one mana of any color in your commander's color identity.\n{2}, {T}: Target creature you control with a counter on it gains lifelink until end of turn." };
const COMMAND_MINE = { name: "Command Mine", type: "Land", mana: "",
  oracle: "{T}: Add one mana of any color in your commander's color identity. If you control a Command Tower and a Command Power Plant, add two mana of any color in your commander's color identity instead." };
const ORCHARD = { name: "Exotic Orchard", type: "Land", mana: "", oracle: "{T}: Add one mana of any color that a land an opponent controls could produce." };
const FELLWAR = { name: "Fellwar Stone", type: "Artifact", mana: "{2}", oracle: "{T}: Add one mana of any color that a land an opponent controls could produce." };
const QUIRION = { name: "Quirion Explorer", type: "Creature — Elf Druid Scout", mana: "{1}{G}", power: "1", toughness: "1", oracle: "{T}: Add one mana of any color that a land an opponent controls could produce." };
const SYLVOK = { name: "Sylvok Explorer", type: "Creature — Human Druid", mana: "{1}{G}", power: "1", toughness: "1", oracle: "{T}: Add one mana of any color that a land an opponent controls could produce." };
const STAR_COMPASS = { name: "Star Compass", type: "Artifact", mana: "{2}", oracle: "This artifact enters tapped.\n{T}: Add one mana of any color that a basic land you control could produce." };
const HARVESTER = { name: "Harvester Druid", type: "Creature — Human Druid", mana: "{1}{G}", power: "1", toughness: "1", oracle: "{T}: Add one mana of any color that a land you control could produce." };
const INCUBATION = { name: "Incubation Druid", type: "Creature — Elf Druid", mana: "{1}{G}", power: "0", toughness: "2",
  oracle: "{T}: Add one mana of any type that a land you control could produce. If this creature has a +1/+1 counter on it, add three mana of that type instead.\n{3}{G}{G}: Adapt 3. (If this creature has no +1/+1 counters on it, put three +1/+1 counters on it.)" };
const REFLECTING_POOL = { name: "Reflecting Pool", type: "Land", mana: "", oracle: "{T}: Add one mana of any type that a land you control could produce." };
const CITY = { name: "City of Brass", type: "Land", mana: "", oracle: "Whenever this land becomes tapped, it deals 1 damage to you.\n{T}: Add one mana of any color." };
const SOL_RING = { name: "Sol Ring", type: "Artifact", mana: "{1}", oracle: "{T}: Add {C}{C}." };
const FOREST = { name: "Forest", type: "Basic Land — Forest", mana: "", oracle: "({T}: Add {G}.)" };
const ISLAND = { name: "Island", type: "Basic Land — Island", mana: "", oracle: "({T}: Add {U}.)" };
const WASTES = { name: "Wastes", type: "Basic Land", mana: "", oracle: "{T}: Add {C}." };
const TUNDRA = { name: "Tundra", type: "Land — Plains Island", mana: "", oracle: "({T}: Add {W} or {U}.)" };

// ── Board pieces that are not sources ──
const ISAMARU = { name: "Isamaru, Hound of Konda", type: "Legendary Creature — Dog", mana: "{W}", power: "2", toughness: "2", oracle: "" };
const JACE = { name: "Jace Beleren", type: "Legendary Planeswalker — Jace", mana: "{1}{U}{U}", loyalty: "3",
  oracle: "+2: Each player draws a card.\n−1: Target player draws a card.\n−10: Target player mills twenty cards." };
const HONDEN = { name: "Honden of Seeing Winds", type: "Legendary Enchantment — Shrine", mana: "{4}{U}", oracle: "At the beginning of your upkeep, draw a card for each Shrine you control." };
const BEARS = { name: "Grizzly Bears", type: "Creature — Bear", mana: "{1}{G}", power: "2", toughness: "2", oracle: "" };
const GRAY_OGRE = { name: "Gray Ogre", type: "Creature — Ogre", mana: "{2}{R}", power: "2", toughness: "2", oracle: "" };

// ── Commanders (colorIdentity as the deck enrichment carries it) ──
const OMNATH = { id: "cmd-omnath", name: "Omnath, Locus of Mana", type: "Legendary Creature — Elemental", mana: "{2}{G}", power: "1", toughness: "1", colorIdentity: ["G"],
  oracle: "You don't lose unspent green mana as steps and phases end.\nOmnath gets +1/+1 for each unspent green mana you have." };
const THRASIOS = { id: "cmd-thrasios", name: "Thrasios, Triton Hero", type: "Legendary Creature — Merfolk Wizard", mana: "{G}{U}", power: "1", toughness: "3", colorIdentity: ["G", "U"],
  oracle: "{4}: Scry 1, then reveal the top card of your library. If it's a land card, put it onto the battlefield tapped. Otherwise, draw a card.\nPartner (You can have two commanders if both have partner.)" };
const TYMNA = { id: "cmd-tymna", name: "Tymna the Weaver", type: "Legendary Creature — Human Cleric", mana: "{1}{W}{B}", power: "2", toughness: "2", colorIdentity: ["B", "W"],
  oracle: "Lifelink\nAt the beginning of each of your postcombat main phases, you may pay X life, where X is the number of opponents that were dealt combat damage this turn. If you do, draw X cards.\nPartner (You can have two commanders if both have partner.)" };
const TRAXOS = { id: "cmd-traxos", name: "Traxos, Scourge of Kroog", type: "Legendary Artifact Creature — Dragon Construct", mana: "{4}", power: "7", toughness: "7", colorIdentity: [],
  oracle: "Trample\nTraxos enters tapped and doesn't untap during your untap step.\nWhenever you cast a historic spell, untap Traxos. (Artifacts, legendaries, and Sagas are historic.)" };
const RED_COMMANDER = { id: "cmd-ogre", name: "Gray Ogre", type: "Creature — Ogre", mana: "{2}{R}", power: "2", toughness: "2", colorIdentity: ["R"], oracle: "" };

// ── One-pip spells to cast ──
const LIONS = { id: "h-lions", name: "Savannah Lions", type: "Creature — Cat", mana: "{W}", mana_cost: "{W}", cmc: 1, power: "2", toughness: "1", oracle: "" };
const KRAKEN = { id: "h-kraken", name: "Kraken Hatchling", type: "Creature — Kraken", mana: "{U}", mana_cost: "{U}", cmc: 1, power: "0", toughness: "4", oracle: "" };
const RATS = { id: "h-rats", name: "Typhoid Rats", type: "Creature — Rat", mana: "{B}", mana_cost: "{B}", cmc: 1, power: "1", toughness: "1", oracle: "Deathtouch (Any amount of damage this deals to a creature is enough to destroy it.)" };
const GOBLIN = { id: "h-goblin", name: "Raging Goblin", type: "Creature — Goblin Berserker", mana: "{R}", mana_cost: "{R}", cmc: 1, power: "1", toughness: "1", oracle: "Haste (This creature can attack and {T} as soon as it comes under your control.)" };
const ELVES = { id: "h-elves", name: "Llanowar Elves", type: "Creature — Elf Druid", mana: "{G}", mana_cost: "{G}", cmc: 1, power: "1", toughness: "1", oracle: "{T}: Add {G}." };
const MIND_STONE = { id: "h-stone", name: "Mind Stone", type: "Artifact", mana: "{2}", mana_cost: "{2}", cmc: 2, oracle: "{T}: Add {C}.\n{1}, {T}, Sacrifice this artifact: Draw a card." };
const ONE_PIPS = [LIONS, KRAKEN, RATS, GOBLIN, ELVES];
const PIP = { "h-lions": "W", "h-kraken": "U", "h-rats": "B", "h-goblin": "R", "h-elves": "G" };

const on = (id, card, controller = "user") => createPermanent({ id, card: { id: `c-${id}`, ...card }, controller, summoningSick: false });
function table(battlefield, { life = 20, hand = ONE_PIPS, aiBattlefield = [], userCommanders = [], aiCommanders = [] } = {}) {
  const s0 = createGameState({ userDeck: [], aiDeck: [], userCommanders, aiCommanders });
  return {
    ...s0, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0, turn: 3,
    players: {
      ...s0.players,
      user: { ...s0.players.user, battlefield, hand, life, library: [], manaPool: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 } },
      ai: { ...s0.players.ai, battlefield: aiBattlefield },
    },
  };
}
const taps = (s, id = "src") => legalActionsForPlayer(s, "user").filter((a) => a.kind === "tap-for-mana" && a.permanentId === id);
const colorsOffered = (s, id = "src") => taps(s, id).map((a) => a.color);
const tapFor = (s, color, id = "src") => taps(s, id).find((a) => a.color === color);
const castFrom = (s, cardId) => legalActionsForPlayer(s, "user").find((a) => a.kind === "cast-spell" && a.cardId === cardId);
// The one-pip spells the planner can pay for from this board — the colours the board can make, read through a cast.
const castable = (s) => ONE_PIPS.filter((c) => castFrom(s, c.id)).map((c) => PIP[c.id]);
const perm = (s, id) => s.players.user.battlefield.find((p) => p.id === id);

describe("1 · damage on the mana line is dealt on every tap", () => {
  it("Ancient Tomb reads its damage: {C}{C}, 2 to its controller", () => {
    expect(manaProduction(TOMB)).toMatchObject({ colors: ["C"], amount: 2, painColors: ["C"], painAmount: 2 });
  });

  it("Ancient Tomb by hand: {C}{C} and 2 life", () => {
    const s = table([on("src", TOMB)]);
    expect(taps(s)).toMatchObject([{ color: "C", amount: 2, painLife: 2 }]);
    const out = dispatchAction(s, tapFor(s, "C"));
    expect({ C: out.players.user.manaPool.C, life: out.players.user.life }).toEqual({ C: 2, life: 18 });
  });

  it("Ancient Tomb through the planner: casting Mind Stone off it costs 2 life", () => {
    const s = table([on("src", TOMB)], { hand: [MIND_STONE] });
    const out = dispatchAction(s, castFrom(s, "h-stone"));
    expect({ life: out.players.user.life, tapped: perm(out, "src").tapped, onStack: out.stack.some((o) => o.kind === "spell" && o.source?.name === "Mind Stone") })
      .toEqual({ life: 18, tapped: true, onStack: true });
  });

  it("the explicit tap commits the planner's own Ancient Tomb record", () => {
    const s = table([on("src", TOMB)]);
    const planned = planPayment(s.players.user.manaPool, manaSources(s, "user"), { C: 1 }).taps[0];
    const { kind: _k, playerId: _p, name: _n, sacrifices: _s, ...offered } = tapFor(s, "C");
    expect(offered).toEqual(planned);
  });

  it("a painful Tomb is no longer the 'plain colourless' source tapped first for generic: a Forest pays the {1}", () => {
    const s = table([on("f", FOREST), on("src", TOMB)]);
    expect(planPayment(s.players.user.manaPool, manaSources(s, "user"), { generic: 1 }).taps.map((t) => t.permanentId)).toEqual(["f"]);
  });

  it("control — Sol Ring, plain colourless, is still tapped first for generic", () => {
    const s = table([on("f", FOREST), on("ring", SOL_RING)]);
    expect(planPayment(s.players.user.manaPool, manaSources(s, "user"), { generic: 1 }).taps.map((t) => t.permanentId)).toEqual(["ring"]);
  });

  it("Tomb of Urami with no Ogre: {B} and 1 life, by hand and through the planner", () => {
    const s = table([on("src", URAMI)]);
    expect(taps(s)).toMatchObject([{ color: "B", painLife: 1 }]);
    expect(dispatchAction(s, tapFor(s, "B")).players.user.life).toBe(19);
    expect(dispatchAction(s, castFrom(s, "h-rats")).players.user.life).toBe(19);
  });

  it("Tomb of Urami beside an Ogre: {B} with no damage (the condition is read as the ability resolves)", () => {
    const s = table([on("src", URAMI), on("ogre", GRAY_OGRE)]);
    expect(tapFor(s, "B").painLife).toBeUndefined();
    expect(dispatchAction(s, tapFor(s, "B")).players.user.life).toBe(20);
    expect(dispatchAction(s, castFrom(s, "h-rats")).players.user.life).toBe(20);
  });

  it("control — City of Brass's damage is its own becomes-tapped trigger, which the tap still queues", () => {
    const s = table([on("src", CITY)]);
    let out = dispatchAction(s, tapFor(s, "R"));
    expect(out.players.user.life).toBe(20);
    out = flushTriggers(out);
    expect(out.stack.map((o) => o.source?.name ?? o.sourceName ?? o.name)).toContain("City of Brass");
    out = resolveTopOfStack(out);
    expect(out.players.user.life).toBe(19);
  });
});

describe("2 · Mox Amber makes only colours among legendary creatures and planeswalkers its controller controls", () => {
  it("alone: no mana at all, by hand or through the planner", () => {
    const s = table([on("src", MOX_AMBER)]);
    expect(taps(s)).toEqual([]);
    expect(castable(s)).toEqual([]);
  });

  it("beside Isamaru (a white legendary creature): white only", () => {
    const s = table([on("src", MOX_AMBER), on("dog", ISAMARU)]);
    expect(colorsOffered(s)).toEqual(["W"]);
    expect(castable(s)).toEqual(["W"]);
    const out = dispatchAction(s, castFrom(s, "h-lions"));
    expect(perm(out, "src").tapped).toBe(true);
  });

  it("beside Jace Beleren (a blue legendary planeswalker): blue only", () => {
    const s = table([on("src", MOX_AMBER), on("jace", JACE)]);
    expect(colorsOffered(s)).toEqual(["U"]);
    expect(castable(s)).toEqual(["U"]);
  });

  it("a legendary enchantment or a nonlegendary creature gives it nothing (Plaza of Heroes would count the Honden)", () => {
    expect(taps(table([on("src", MOX_AMBER), on("honden", HONDEN)]))).toEqual([]);
    expect(taps(table([on("src", MOX_AMBER), on("bear", BEARS)]))).toEqual([]);
  });

  it("an opponent's legendary creature gives it nothing", () => {
    const s = table([on("src", MOX_AMBER)], { aiBattlefield: [on("dog", ISAMARU, "ai")] });
    expect(taps(s)).toEqual([]);
  });

  it("the explicit tap commits the planner's own Mox Amber record", () => {
    const s = table([on("src", MOX_AMBER), on("dog", ISAMARU)]);
    const planned = planPayment(s.players.user.manaPool, manaSources(s, "user").filter((r) => r.permanentId === "src"), { W: 1 }).taps[0];
    const { kind: _k, playerId: _p, name: _n, sacrifices: _s, ...offered } = tapFor(s, "W");
    expect(offered).toEqual(planned);
  });
});

describe("3 · 'your commander's color identity' is read off the seat's commander", () => {
  it.each([
    ["Command Tower", TOWER],
    ["Arcane Signet", SIGNET],
    ["Commander's Sphere", SPHERE],
    ["Hidden Hideout", HIDEOUT],
  ])("%s on a mono-green commander: green only, by hand and through the planner", (_n, card) => {
    const s = table([on("src", card)], { userCommanders: [OMNATH] });
    expect(colorsOffered(s)).toEqual(["G"]);
    expect(castable(s)).toEqual(["G"]);
  });

  it.each([
    ["Command Tower", TOWER],
    ["Arcane Signet", SIGNET],
    ["Commander's Sphere", SPHERE],
  ])("%s with no commander: no mana (CR 903.4f)", (_n, card) => {
    const s = table([on("src", card)]);
    expect(taps(s)).toEqual([]);
    expect(castable(s)).toEqual([]);
  });

  it("Path of Ancestry (planner only — its spent rider keeps it off the hand tap): green on a mono-green commander, nothing without one", () => {
    expect(castable(table([on("src", PATH)], { userCommanders: [OMNATH] }))).toEqual(["G"]);
    expect(castable(table([on("src", PATH)]))).toEqual([]);
    expect(taps(table([on("src", PATH)], { userCommanders: [OMNATH] }))).toEqual([]);
  });

  it("partners: the union of both identities (Thrasios + Tymna → W, U, B, G)", () => {
    const s = table([on("src", TOWER)], { userCommanders: [THRASIOS, TYMNA] });
    expect(colorsOffered(s)).toEqual(["W", "U", "B", "G"]);
    expect(castable(s)).toEqual(["W", "U", "B", "G"]);
  });

  it("a colourless commander names no colour: no mana", () => {
    const s = table([on("src", TOWER)], { userCommanders: [TRAXOS] });
    expect(taps(s)).toEqual([]);
    expect(castable(s)).toEqual([]);
  });

  it("a commander card that states no identity is unknown, not colourless: no mana (never a guess)", () => {
    const { colorIdentity: _ci, ...unknown } = OMNATH;
    expect(taps(table([on("src", TOWER)], { userCommanders: [unknown] }))).toEqual([]);
  });

  it("the commander cast to the battlefield keeps the identity (stamped at game start, CR 903.4)", () => {
    const s0 = table([on("src", TOWER)], { userCommanders: [OMNATH] });
    const s = { ...s0, players: { ...s0.players, user: { ...s0.players.user, command: [], battlefield: [...s0.players.user.battlefield, on("omnath", { ...OMNATH, isCommander: true })] } } };
    expect(colorsOffered(s)).toEqual(["G"]);
  });

  it("the explicit tap commits the planner's own Command Tower record", () => {
    const s = table([on("src", TOWER)], { userCommanders: [OMNATH] });
    const planned = planPayment(s.players.user.manaPool, manaSources(s, "user"), { G: 1 }).taps[0];
    const { kind: _k, playerId: _p, name: _n, sacrifices: _s, ...offered } = tapFor(s, "G");
    expect(offered).toEqual(planned);
  });

  it("the parse: every identity source carries the spec, Command Mine's 'instead' upgrade read at its base", () => {
    for (const card of [TOWER, SIGNET, SPHERE, PATH, HIDEOUT, COMMAND_MINE]) {
      expect(manaProduction(card), card.name).toMatchObject({ amount: 1, colorsAmongSpec: { kind: "commanderColorIdentity" } });
    }
  });
});

describe("4 · 'any color that a land … could produce' is read off those lands (CR 106.7)", () => {
  it("Exotic Orchard: an opponent's Forest → green only, by hand and through the planner", () => {
    const s = table([on("src", ORCHARD)], { aiBattlefield: [on("of", FOREST, "ai")] });
    expect(colorsOffered(s)).toEqual(["G"]);
    expect(castable(s)).toEqual(["G"]);
  });

  it("Exotic Orchard: no opponent land, or only colourless ones, or only another Orchard → no mana; its controller's own lands never count", () => {
    expect(taps(table([on("src", ORCHARD), on("isl", ISLAND)]))).toEqual([]);
    expect(taps(table([on("src", ORCHARD)], { aiBattlefield: [on("ow", WASTES, "ai")] }))).toEqual([]);
    expect(taps(table([on("src", ORCHARD)], { aiBattlefield: [on("oo", ORCHARD, "ai")] }))).toEqual([]);
  });

  it("Exotic Orchard: an opponent's Command Tower could produce that opponent's commander's colours", () => {
    const s = table([on("src", ORCHARD)], { aiBattlefield: [on("ot", TOWER, "ai")], aiCommanders: [RED_COMMANDER] });
    expect(colorsOffered(s)).toEqual(["R"]);
  });

  it("Fellwar Stone: an opponent's Tundra → white or blue; none → no mana", () => {
    const s = table([on("src", FELLWAR)], { aiBattlefield: [on("ot", TUNDRA, "ai")] });
    expect(colorsOffered(s)).toEqual(["W", "U"]);
    expect(castable(s)).toEqual(["W", "U"]);
    expect(taps(table([on("src", FELLWAR)]))).toEqual([]);
  });

  it("Quirion Explorer and Sylvok Explorer: an opponent's Island → blue only", () => {
    for (const card of [QUIRION, SYLVOK]) {
      expect(colorsOffered(table([on("src", card)], { aiBattlefield: [on("oi", ISLAND, "ai")] })), card.name).toEqual(["U"]);
    }
  });

  it("Star Compass: a basic Forest → green; a nonbasic Tundra or a colourless Wastes → nothing", () => {
    expect(colorsOffered(table([on("src", STAR_COMPASS), on("f", FOREST)]))).toEqual(["G"]);
    expect(taps(table([on("src", STAR_COMPASS), on("t", TUNDRA)]))).toEqual([]);
    expect(taps(table([on("src", STAR_COMPASS), on("w", WASTES)]))).toEqual([]);
  });

  it("Harvester Druid: a Forest → green; a Wastes → nothing ('any color' — never colourless)", () => {
    expect(colorsOffered(table([on("src", HARVESTER), on("f", FOREST)]))).toEqual(["G"]);
    expect(taps(table([on("src", HARVESTER), on("w", WASTES)]))).toEqual([]);
  });

  it("control — Incubation Druid ('any type') still makes {C} off a Wastes", () => {
    expect(manaSources(table([on("src", INCUBATION), on("w", WASTES)]), "user").find((r) => r.permanentId === "src").colors).toEqual(["C"]);
  });

  it("Reflecting Pool beside Command Tower makes the commander's colours, not all five", () => {
    const s = table([on("src", REFLECTING_POOL), on("t", TOWER)], { userCommanders: [OMNATH] });
    expect(colorsOffered(s)).toEqual(["G"]);
  });

  it("control — a Forest is still a Forest", () => {
    const s = table([on("src", FOREST)]);
    expect(colorsOffered(s)).toEqual(["G"]);
    expect(castable(s)).toEqual(["G"]);
  });
});

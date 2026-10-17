/**
 * manaNotItsOwn.test.js — "Add" text that is not the permanent's own free mana ability (2026-10-17). Each was a false
 * positive: the mana model read the words and made a standing source out of them, on the planner's tap and the explicit tap.
 * One reader refuses them all, line by line, before the parse (manaModel.manaLineRefused):
 *
 *   1. LOYALTY ABILITIES. An activated ability with a loyalty symbol in its cost is a loyalty ability (CR 606.2), and a loyalty
 *      ability is never a mana ability (CR 605.1a). Chandra, Torch of Defiance's "+1: Add {R}{R}." and The Aetherspark's
 *      "−10: Add ten mana of any one color." were cost-free sources the planner spent at any time, an opponent's turn included —
 *      no loyalty paid, none of a loyalty ability's main-phase timing (CR 606.3). Planeswalker loyalty play is its own program;
 *      here a loyalty ability simply never becomes a mana source.
 *   2. AN ABILITY QUOTED INSIDE A SENTENCE. Roxanne, Starfall Savant creates a Meteorite token with "When this token enters, …"
 *      and "{T}: Add one mana of any color." — the token's ability, read as Roxanne's own tap (the colon sits inside the quote;
 *      what stands before it is a trigger, not a cost).
 *   3. A COST THE RECORD DROPPED. Springjack Pasture's "{T}, Sacrifice X Goats: Add X mana of any one color. You gain X life."
 *      merged into its main record as a free any-colour tap. No record pays "Sacrifice X Goats", so the line makes nothing;
 *      the plain "{T}: Add {C}." stays.
 *   4. A COUNT THE PARSE NEVER READ. Selvala, Explorer Returned's parley: "For each nonland card revealed this way, add {G}"
 *      was a flat {G} with no reveal, no life and no draws. The amount is a count the model doesn't take, so it makes nothing.
 *   5–7. The same mistakes elsewhere in the corpus: an ability with a target (CR 605.1a), cost items no record pays, and
 *      abilities quoted inside a trigger or an effect — with controls for every shape the reader must leave alone.
 *
 * Each through the planner (a cast) and the explicit tap, with controls. Real oracle fixtures (bundled oracle-index.json, read
 * in-session 2026-10-17).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { manaProduction, manaSources, manualManaTaps } from "./manaModel.js";

beforeEach(() => _resetIdsForTests());

// ── Planeswalkers whose loyalty abilities say "Add" ──
const CHANDRA_TOD = { name: "Chandra, Torch of Defiance", type: "Legendary Planeswalker — Chandra", mana: "{2}{R}{R}", loyalty: "4",
  oracle: "+1: Exile the top card of your library. You may cast that card. If you don't, Chandra deals 2 damage to each opponent.\n+1: Add {R}{R}.\n−3: Chandra deals 4 damage to target creature.\n−7: You get an emblem with \"Whenever you cast a spell, this emblem deals 5 damage to any target.\"" };
const AETHERSPARK = { name: "The Aetherspark", type: "Legendary Artifact Planeswalker — Equipment", mana: "{4}", loyalty: "4",
  oracle: "As long as The Aetherspark is attached to a creature, The Aetherspark can't be attacked and has \"Whenever equipped creature deals combat damage during your turn, put that many loyalty counters on The Aetherspark.\"\n+1: Attach The Aetherspark to up to one target creature you control. Put a +1/+1 counter on that creature.\n−5: Draw two cards.\n−10: Add ten mana of any one color." };
const SARKHAN_FIREBLOOD = { name: "Sarkhan, Fireblood", type: "Legendary Planeswalker — Sarkhan", mana: "{1}{R}{R}", loyalty: "3",
  oracle: "+1: You may discard a card. If you do, draw a card.\n+1: Add two mana in any combination of colors. Spend this mana only to cast Dragon spells.\n−7: Create four 5/5 red Dragon creature tokens with flying." };
const KOTH = { name: "Koth of the Hammer", type: "Legendary Planeswalker — Koth", mana: "{2}{R}{R}", loyalty: "3",
  oracle: "+1: Untap target Mountain. It becomes a 4/4 red Elemental creature until end of turn. It's still a land.\n−2: Add {R} for each Mountain you control.\n−5: You get an emblem with \"Mountains you control have '{T}: This land deals 1 damage to any target.'\"" };
const LILIANA_DARK_REALMS = { name: "Liliana of the Dark Realms", type: "Legendary Planeswalker — Liliana", mana: "{2}{B}{B}", loyalty: "3",
  oracle: "+1: Search your library for a Swamp card, reveal it, put it into your hand, then shuffle.\n−3: Target creature gets +X/+X or -X/-X until end of turn, where X is the number of Swamps you control.\n−6: You get an emblem with \"Swamps you control have '{T}: Add {B}{B}{B}{B}.'\"" };
const UGIN_EYE = { name: "Ugin, Eye of the Storms", type: "Legendary Planeswalker — Ugin", mana: "{7}", loyalty: "7",
  oracle: "When you cast this spell, exile up to one target permanent that's one or more colors.\nWhenever you cast a colorless spell, exile up to one target permanent that's one or more colors.\n+2: You gain 3 life and draw a card.\n0: Add {C}{C}{C}.\n−11: Search your library for any number of colorless nonland cards, exile them, then shuffle. Until end of turn, you may cast those cards without paying their mana costs." };
const CHANDRA_NOVICE = { name: "Chandra, Novice Pyromancer", type: "Legendary Planeswalker — Chandra", mana: "{3}{R}", loyalty: "5",
  oracle: "+1: Elementals you control get +2/+0 until end of turn.\n−1: Add {R}{R}.\n−2: Chandra deals 2 damage to any target." };
const XENAGOS = { name: "Xenagos, the Reveler", type: "Legendary Planeswalker — Xenagos", mana: "{2}{R}{G}", loyalty: "3",
  oracle: "+1: Add X mana in any combination of {R} and/or {G}, where X is the number of creatures you control.\n0: Create a 2/2 red and green Satyr creature token with haste.\n−6: Exile the top seven cards of your library. You may put any number of creature and/or land cards from among them onto the battlefield." };
const LOYALTY_ADDERS = [CHANDRA_TOD, AETHERSPARK, SARKHAN_FIREBLOOD, KOTH, LILIANA_DARK_REALMS, UGIN_EYE, CHANDRA_NOVICE, XENAGOS];

// ── The other three ──
const ROXANNE = { name: "Roxanne, Starfall Savant", type: "Legendary Creature — Cat Druid", mana: "{3}{R}{G}", power: "4", toughness: "3",
  oracle: "Whenever Roxanne enters or attacks, create a tapped colorless artifact token named Meteorite with \"When this token enters, it deals 2 damage to any target\" and \"{T}: Add one mana of any color.\"\nWhenever you tap an artifact token for mana, add one mana of any type that artifact token produced." };
const METEORITE = { name: "Meteorite", type: "Token Artifact", mana: "", token: true,
  oracle: "When this token enters, it deals 2 damage to any target.\n{T}: Add one mana of any color." };
const SPRINGJACK = { name: "Springjack Pasture", type: "Land", mana: "",
  oracle: "{T}: Add {C}.\n{4}, {T}: Create a 0/1 white Goat creature token.\n{T}, Sacrifice X Goats: Add X mana of any one color. You gain X life." };
const SELVALA_ER = { name: "Selvala, Explorer Returned", type: "Legendary Creature — Elf Scout", mana: "{1}{G}{W}", power: "2", toughness: "4",
  oracle: "Parley — {T}: Each player reveals the top card of their library. For each nonland card revealed this way, add {G} and you gain 1 life. Then each player draws a card. (Activate only as an instant.)" };

// ── Controls ──
const ELVES = { name: "Llanowar Elves", type: "Creature — Elf Druid", mana: "{G}", power: "1", toughness: "1", oracle: "{T}: Add {G}." };
const FOREST = { name: "Forest", type: "Basic Land — Forest", mana: "", oracle: "({T}: Add {G}.)" };
const MOUNTAIN = { name: "Mountain", type: "Basic Land — Mountain", mana: "", oracle: "({T}: Add {R}.)" };
const GOAT = { name: "Goat", type: "Token Creature — Goat", mana: "", power: "0", toughness: "1", token: true, oracle: "" };

// ── Spells to cast: a free one, one-pippers of four colours, a two-drop with generic, a generic-only artifact ──
const ORNITHOPTER = { id: "h-thopter", name: "Ornithopter", type: "Artifact Creature — Thopter", mana: "{0}", mana_cost: "{0}", cmc: 0, power: "0", toughness: "2", oracle: "Flying" };
const GOBLIN = { id: "h-goblin", name: "Raging Goblin", type: "Creature — Goblin Berserker", mana: "{R}", mana_cost: "{R}", cmc: 1, power: "1", toughness: "1", oracle: "Haste (This creature can attack and {T} as soon as it comes under your control.)" };
const ELVES_CARD = { id: "h-elves", name: "Llanowar Elves", type: "Creature — Elf Druid", mana: "{G}", mana_cost: "{G}", cmc: 1, power: "1", toughness: "1", oracle: "{T}: Add {G}." };
const KRAKEN = { id: "h-kraken", name: "Kraken Hatchling", type: "Creature — Kraken", mana: "{U}", mana_cost: "{U}", cmc: 1, power: "0", toughness: "4", oracle: "" };
const LIONS = { id: "h-lions", name: "Savannah Lions", type: "Creature — Cat", mana: "{W}", mana_cost: "{W}", cmc: 1, power: "2", toughness: "1", oracle: "" };
const BEARS = { id: "h-bears", name: "Grizzly Bears", type: "Creature — Bear", mana: "{1}{G}", mana_cost: "{1}{G}", cmc: 2, power: "2", toughness: "2", oracle: "" };
const SPELLBOMB = { id: "h-bomb", name: "Origin Spellbomb", type: "Artifact", mana: "{1}", mana_cost: "{1}", cmc: 1,
  oracle: "{1}, Sacrifice this artifact: Create a 1/1 colorless Myr artifact creature token.\nWhen this artifact is put into a graveyard from the battlefield, you may pay {W}. If you do, draw a card." };
const SPELLS = [ORNITHOPTER, GOBLIN, ELVES_CARD, KRAKEN, LIONS, BEARS, SPELLBOMB];

const on = (id, card, controller = "user") => createPermanent({ id, card: { id: `c-${id}`, ...card }, controller, summoningSick: false });
function table(battlefield, { hand = SPELLS, life = 20 } = {}) {
  const s0 = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...s0, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0, turn: 3,
    players: { ...s0.players, user: { ...s0.players.user, battlefield, hand, life, library: [], manaPool: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 } } },
  };
}
const taps = (s, id = "src") => legalActionsForPlayer(s, "user").filter((a) => a.kind === "tap-for-mana" && a.permanentId === id);
const castFrom = (s, cardId) => legalActionsForPlayer(s, "user").find((a) => a.kind === "cast-spell" && a.cardId === cardId);
// The spells the planner can pay for from this board, by name.
const castable = (s) => SPELLS.filter((c) => castFrom(s, c.id)).map((c) => c.name).sort();
const sourceIds = (s) => manaSources(s, "user").map((r) => r.permanentId);

describe("1 · a loyalty ability is never a mana ability (CR 605.1a, 606.2)", () => {
  it.each(LOYALTY_ADDERS.map((c) => [c.name, c]))("%s makes no mana", (_name, card) => {
    expect(manaProduction(card)).toBeNull();
  });

  it("Chandra, Torch of Defiance alone pays for nothing: no {R} spell, no explicit tap", () => {
    const s = table([on("src", CHANDRA_TOD)]);
    expect(sourceIds(s)).toEqual([]);
    expect(taps(s)).toEqual([]);
    expect(castable(s)).toEqual(["Ornithopter"]);
  });

  it("The Aetherspark alone pays for nothing: no ten mana of a colour, no explicit tap", () => {
    const s = table([on("src", AETHERSPARK)]);
    expect(sourceIds(s)).toEqual([]);
    expect(taps(s)).toEqual([]);
    expect(manualManaTaps(s, "user")).toEqual([]);
    expect(castable(s)).toEqual(["Ornithopter"]);
  });

  it("Koth of the Hammer beside three Mountains: only the Mountains make mana", () => {
    const s = table([on("src", KOTH), on("m1", MOUNTAIN), on("m2", MOUNTAIN), on("m3", MOUNTAIN)]);
    expect(sourceIds(s).sort()).toEqual(["m1", "m2", "m3"]);
    expect(manaSources(s, "user").reduce((n, r) => n + r.amount, 0)).toBe(3);
  });

  it("control — a planeswalker beside a Mountain: the Mountain still taps, by hand and for a cast", () => {
    const s = table([on("src", CHANDRA_TOD), on("m1", MOUNTAIN)]);
    expect(taps(s)).toEqual([]);
    expect(taps(s, "m1").map((a) => a.color)).toEqual(["R"]);
    expect(dispatchAction(s, taps(s, "m1")[0]).players.user.manaPool.R).toBe(1);
    expect(castable(s)).toEqual(["Origin Spellbomb", "Ornithopter", "Raging Goblin"]);
    const out = dispatchAction(s, castFrom(s, GOBLIN.id));
    expect(out.players.user.battlefield.find((p) => p.id === "m1").tapped).toBe(true);
    expect(out.players.user.battlefield.find((p) => p.id === "src").tapped).toBeFalsy();
  });
});

describe("2 · Roxanne's Meteorite ability is the token's, not hers", () => {
  it("Roxanne makes no mana", () => {
    expect(manaProduction(ROXANNE)).toBeNull();
  });

  it("Roxanne alone pays for nothing: no explicit tap, no cast", () => {
    const s = table([on("src", ROXANNE)]);
    expect(sourceIds(s)).toEqual([]);
    expect(taps(s)).toEqual([]);
    expect(castable(s)).toEqual(["Ornithopter"]);
  });

  it("control — the Meteorite token itself taps for any colour", () => {
    expect(manaProduction(METEORITE)).toMatchObject({ colors: ["W", "U", "B", "R", "G"], amount: 1 });
    const s = table([on("src", METEORITE)]);
    expect(taps(s).map((a) => a.color)).toEqual(["W", "U", "B", "R", "G"]);
  });
});

describe("3 · Springjack Pasture's Goat line is not a free any-colour tap", () => {
  it("its record is the plain {C} line", () => {
    expect(manaProduction(SPRINGJACK)).toMatchObject({ colors: ["C"], amount: 1 });
  });

  it("by hand it offers {C} only, Goats or not", () => {
    const s = table([on("src", SPRINGJACK), on("g1", GOAT), on("g2", GOAT)]);
    expect(taps(s).map((a) => a.color)).toEqual(["C"]);
  });

  it("through the planner it pays generic, never a colour", () => {
    const s = table([on("src", SPRINGJACK), on("g1", GOAT), on("g2", GOAT)]);
    expect(manaSources(s, "user").every((r) => r.colors.every((c) => c === "C"))).toBe(true);
    expect(castable(s)).toEqual(["Origin Spellbomb", "Ornithopter"]);
  });
});

describe("4 · Selvala, Explorer Returned's parley is not a flat {G}", () => {
  it("Selvala makes no mana", () => {
    expect(manaProduction(SELVALA_ER)).toBeNull();
  });

  it("Selvala alone pays for nothing: no explicit tap, no cast", () => {
    const s = table([on("src", SELVALA_ER)]);
    expect(sourceIds(s)).toEqual([]);
    expect(taps(s)).toEqual([]);
    expect(castable(s)).toEqual(["Ornithopter"]);
  });
});

// ── The family sweep (the same mistake on other cards) ──
const DEATHRITE = { name: "Deathrite Shaman", type: "Creature — Elf Shaman", mana: "{B/G}", power: "1", toughness: "2",
  oracle: "{T}: Exile target land card from a graveyard. Add one mana of any color. (Activate only as an instant.)\n{B}, {T}: Exile target instant or sorcery card from a graveyard. Each opponent loses 2 life.\n{G}, {T}: Exile target creature card from a graveyard. You gain 2 life." };
const SOULBRIGHT_FLAMEKIN = { name: "Soulbright Flamekin", type: "Creature — Elemental Shaman", mana: "{1}{R}", power: "2", toughness: "1",
  oracle: "{2}: Target creature gains trample until end of turn. If this is the third time this ability has resolved this turn, you may add {R}{R}{R}{R}{R}{R}{R}{R}." };
const SOULBRIGHT_SEEKER = { name: "Soulbright Seeker", type: "Creature — Elemental Sorcerer", mana: "{R}", power: "2", toughness: "1",
  oracle: "As an additional cost to cast this spell, behold an Elemental or pay {2}. (To behold an Elemental, choose an Elemental you control or reveal an Elemental card from your hand.)\n{R}: Target creature you control gains trample until end of turn. If this is the third time this ability has resolved this turn, add {R}{R}{R}{R}." };
const WITCH_ENGINE = { name: "Witch Engine", type: "Creature — Horror", mana: "{5}{B}", power: "4", toughness: "4",
  oracle: "Swampwalk (This creature can't be blocked as long as defending player controls a Swamp.)\n{T}: Add {B}{B}{B}{B}. Target opponent gains control of this creature. (Activate only as an instant.)" };
const RED_DEATH = { name: "Red Death, Shipwrecker", type: "Legendary Creature — Crab Mutant", mana: "{U}{R}", power: "1", toughness: "3",
  oracle: "Alluring Eyes — {T}: Goad target creature an opponent controls. That player draws a card. You add {R}. (Until your next turn, that creature attacks each combat if able and attacks a player other than you if able.)" };
const THORNVAULT = { name: "Thornvault Forager", type: "Creature — Squirrel Ranger", mana: "{1}{G}", power: "2", toughness: "2",
  oracle: "{T}: Add {G}.\n{T}, Forage: Add two mana in any combination of colors. (To forage, exile three cards from your graveyard or sacrifice a Food.)\n{3}{G}, {T}: Search your library for a Squirrel card, reveal it, put it into your hand, then shuffle." };
const CRYPTEX = { name: "Cryptex", type: "Artifact", mana: "{2}",
  oracle: "{T}, Collect evidence 3: Add one mana of any color. Put an unlock counter on this artifact. (To collect evidence 3, exile cards with total mana value 3 or greater from your graveyard.)\nSacrifice this artifact: Surveil 3, then draw three cards. Activate only if this artifact has five or more unlock counters on it." };
const DERANGED = { name: "Deranged Assistant", type: "Creature — Human Wizard", mana: "{1}{U}", power: "1", toughness: "1",
  oracle: "{T}, Mill a card: Add {C}. (Activate only as an instant. To mill a card, put the top card of your library into your graveyard.)" };
const WALL_OF_ROOTS = { name: "Wall of Roots", type: "Creature — Plant Wall", mana: "{1}{G}", power: "0", toughness: "5",
  oracle: "Defender\nPut a -0/-1 counter on this creature: Add {G}. Activate only once each turn." };
const HICKORY = { name: "Hickory Woodlot", type: "Land", mana: "",
  oracle: "This land enters tapped with two depletion counters on it.\n{T}, Remove a depletion counter from this land: Add {G}{G}. If there are no depletion counters on this land, sacrifice it." };
const GEMSTONE_MINE = { name: "Gemstone Mine", type: "Land", mana: "",
  oracle: "This land enters with three mining counters on it.\n{T}, Remove a mining counter from this land: Add one mana of any color. If there are no mining counters on this land, sacrifice it." };
const EVENDO = { name: "Evendo, Waking Haven", type: "Land — Planet", mana: "",
  oracle: "This land enters tapped.\n{T}: Add {G}.\nStation (Tap another creature you control: Put charge counters equal to its power on this Planet. Station only as a sorcery.)\n12+ | {G}, {T}: Add {G} for each creature you control." };
const PILI_PALA = { name: "Pili-Pala", type: "Artifact Creature — Scarecrow", mana: "{2}", power: "1", toughness: "1",
  oracle: "Flying\n{2}, {Q}: Add one mana of any color. ({Q} is the untap symbol.)" };
const OLD_GROWTH_TROLL = { name: "Old-Growth Troll", type: "Creature — Troll Warrior", mana: "{G}{G}{G}", power: "4", toughness: "4",
  oracle: "Trample\nWhen Old-Growth Troll dies, if it was a creature, return it to the battlefield. It's an Aura enchantment with enchant Forest you control and \"Enchanted Forest has '{T}: Add {G}{G}' and '{1}, {T}, Sacrifice this land: Create a tapped 4/4 green Troll Warrior creature token with trample.'\"" };
const HAROLD_AND_BOB = { name: "Harold and Bob, First Numens", type: "Legendary Creature — Treefolk Mutant", mana: "{2}{G}", power: "3", toughness: "3",
  oracle: "Reach, vigilance\nWhen Harold and Bob dies, if it was a creature, return it to the battlefield. It's an Aura enchantment with enchant Forest you control and \"Enchanted Forest has '{T}: Add three mana of any one color. You get two rad counters.'\" Harold and Bob loses all other abilities." };
const GLORIOUS_SUNRISE = { name: "Glorious Sunrise", type: "Enchantment", mana: "{3}{G}{G}",
  oracle: "At the beginning of combat on your turn, choose one —\n• Creatures you control get +1/+1 and gain trample until end of turn.\n• Target land gains \"{T}: Add {G}{G}{G}\" until end of turn.\n• Draw a card if you control a creature with power 3 or greater.\n• You gain 3 life." };
const PRINCESS_YUE = { name: "Princess Yue", type: "Legendary Creature — Human Noble Ally", mana: "{2}{U}", power: "3", toughness: "2",
  oracle: "When Princess Yue dies, if she was a nonland creature, return this card to the battlefield tapped under your control. She's a land named Moon. She gains \"{T}: Add {C}.\" (She's still legendary.)\n{T}: Scry 2." };
const HYDRO_MAN = { name: "Hydro-Man, Fluid Felon", type: "Legendary Creature — Elemental Villain", mana: "{U}{U}", power: "2", toughness: "2",
  oracle: "Whenever you cast a blue spell, if Hydro-Man is a creature, he gets +1/+1 until end of turn.\nAt the beginning of your end step, untap Hydro-Man. Until your next turn, he becomes a land and gains \"{T}: Add {U}.\" (He's not a creature during that time.)" };
const ETERNITY_ELEVATOR = { name: "The Eternity Elevator", type: "Legendary Artifact — Spacecraft", mana: "{5}",
  oracle: "{T}: Add {C}{C}{C}.\nStation (Tap another creature you control: Put charge counters equal to its power on this Spacecraft. Station only as a sorcery.)\n20+ | {T}: Add X mana of any one color, where X is the number of charge counters on The Eternity Elevator." };

// ── Family controls: the same shapes where the record is honest ──
const GOGGLES = { name: "Pyromancer's Goggles", type: "Legendary Artifact", mana: "{5}",
  oracle: "{T}: Add {R}. When that mana is spent to cast a red instant or sorcery spell, copy that spell and you may choose new targets for the copy." };
const BLOOM_TENDER = { name: "Bloom Tender", type: "Creature — Elf Druid", mana: "{1}{G}", power: "1", toughness: "1",
  oracle: "Vivid — {T}: For each color among permanents you control, add one mana of that color." };
const INCUBATION = { name: "Incubation Druid", type: "Creature — Elf Druid", mana: "{1}{G}", power: "0", toughness: "2",
  oracle: "{T}: Add one mana of any type that a land you control could produce. If this creature has a +1/+1 counter on it, add three mana of that type instead.\n{3}{G}{G}: Adapt 3. (If this creature has no +1/+1 counters on it, put three +1/+1 counters on it.)" };
const GEMHIDE = { name: "Gemhide Sliver", type: "Creature — Sliver", mana: "{1}{G}", power: "1", toughness: "1", oracle: "All Slivers have \"{T}: Add one mana of any color.\"" };
const BASAL = { name: "Basal Sliver", type: "Creature — Sliver", mana: "{2}{B}", power: "2", toughness: "2", oracle: "All Slivers have \"Sacrifice this permanent: Add {B}{B}.\"" };
const SACHI = { name: "Sachi, Daughter of Seshiro", type: "Legendary Creature — Snake Shaman", mana: "{2}{G}{G}", power: "1", toughness: "3",
  oracle: "Other Snake creatures you control get +0/+1.\nShamans you control have \"{T}: Add {G}{G}.\"" };
const MOX_OPAL = { name: "Mox Opal", type: "Legendary Artifact", mana: "{0}", oracle: "Metalcraft — {T}: Add one mana of any color. Activate only if you control three or more artifacts." };
const FOUNTAIN_OF_CHO = { name: "Fountain of Cho", type: "Land", mana: "",
  oracle: "This land enters tapped.\n{T}: Put a storage counter on this land.\n{T}, Remove any number of storage counters from this land: Add {W} for each storage counter removed this way." };
const PENTAD = { name: "Pentad Prism", type: "Artifact", mana: "{2}",
  oracle: "Sunburst (This artifact enters with a charge counter on it for each color of mana spent to cast it.)\nRemove a charge counter from this artifact: Add one mana of any color." };
const CONFLUENCE = { name: "Mana Confluence", type: "Land", mana: "", oracle: "{T}, Pay 1 life: Add one mana of any color." };
const DRUM = { name: "Springleaf Drum", type: "Artifact", mana: "{1}", oracle: "{T}, Tap an untapped creature you control: Add one mana of any color." };
const ALTAR = { name: "Ashnod's Altar", type: "Artifact", mana: "{3}", oracle: "Sacrifice a creature: Add {C}{C}." };
const MOLT_TENDER = { name: "Molt Tender", type: "Creature — Insect Druid", mana: "{G}", power: "1", toughness: "1",
  oracle: "{T}: Mill a card. (Put the top card of your library into your graveyard.)\n{T}, Exile a card from your graveyard: Add one mana of any color." };
const SPIRIT_GUIDE = { name: "Elvish Spirit Guide", type: "Creature — Elf Spirit", mana: "{2}{G}", power: "2", toughness: "2", oracle: "Exile this card from your hand: Add {G}." };
const TREASURE = { name: "Treasure", type: "Token Artifact — Treasure", mana: "", token: true, oracle: "{T}, Sacrifice this token: Add one mana of any color." };
const COMMAND_MINE = { name: "Command Mine", type: "Land", mana: "",
  oracle: "{T}: Add one mana of any color in your commander's color identity. If you control a Command Tower and a Command Power Plant, add two mana of any color in your commander's color identity instead." };

describe("5 · an ability with a target is not a mana ability (CR 605.1a, 115.6)", () => {
  it.each([["Deathrite Shaman", DEATHRITE], ["Soulbright Flamekin", SOULBRIGHT_FLAMEKIN], ["Soulbright Seeker", SOULBRIGHT_SEEKER],
    ["Witch Engine", WITCH_ENGINE], ["Red Death, Shipwrecker", RED_DEATH]])("%s makes no mana", (_name, card) => {
    expect(manaProduction(card)).toBeNull();
  });

  it("Deathrite Shaman with no land card in any graveyard pays for nothing", () => {
    const s = table([on("src", DEATHRITE)]);
    expect(taps(s)).toEqual([]);
    expect(castable(s)).toEqual(["Ornithopter"]);
  });

  it("Soulbright Flamekin is no eight-red loop: a Mountain alone casts only one-mana spells", () => {
    const s = table([on("src", SOULBRIGHT_FLAMEKIN), on("m1", MOUNTAIN)]);
    expect(sourceIds(s)).toEqual(["m1"]);
    expect(castable(s)).toEqual(["Origin Spellbomb", "Ornithopter", "Raging Goblin"]);
  });

  it("control — a copy rider's \"new targets\" is not a target of the mana ability: Pyromancer's Goggles taps for {R}", () => {
    expect(manaProduction(GOGGLES)).toMatchObject({ colors: ["R"], amount: 1 });
    expect(taps(table([on("src", GOGGLES)])).map((a) => a.color)).toEqual(["R"]);
  });
});

describe("6 · a cost no record pays drops the line", () => {
  it.each([["Cryptex", CRYPTEX], ["Deranged Assistant", DERANGED], ["Pili-Pala", PILI_PALA]])("%s makes no mana", (_name, card) => {
    expect(manaProduction(card)).toBeNull();
  });

  // Wall of Roots, Hickory Woodlot and Gemstone Mine were refused here until the same day's counter-cost slice: their records now
  // put the -0/-1 counter on / remove the depletion or mining counter and sacrifice the emptied land (manaPrintedCosts.test.js).
  it.each([["Wall of Roots", WALL_OF_ROOTS], ["Hickory Woodlot", HICKORY], ["Gemstone Mine", GEMSTONE_MINE]])("%s makes mana only through its paid counter cost", (_name, card) => {
    const prod = manaProduction(card);
    expect(!!(prod?.putsCounter || prod?.removesCounters?.mode === "one")).toBe(true);
  });

  it("Thornvault Forager keeps its plain {G}; the forage line makes nothing", () => {
    expect(manaProduction(THORNVAULT)).toMatchObject({ colors: ["G"], amount: 1 });
    const s = table([on("src", THORNVAULT)]);
    expect(taps(s).map((a) => a.color)).toEqual(["G"]);
    expect(castable(s)).toEqual(["Llanowar Elves", "Origin Spellbomb", "Ornithopter"]);
  });

  it("Evendo, Waking Haven with no charge counters taps for one {G}, not {G} per creature", () => {
    const prod = manaProduction(EVENDO);
    expect(prod).toMatchObject({ colors: ["G"], amount: 1 });
    expect(prod.amountSpec).toBeUndefined();
    const s = table([on("src", EVENDO), on("e1", ELVES), on("e2", ELVES), on("e3", ELVES)]);
    expect(manaSources(s, "user").find((r) => r.permanentId === "src")).toMatchObject({ colors: ["G"], amount: 1 });
  });

  it("Hickory Woodlot and Gemstone Mine with no counter on them pay for nothing", () => {
    expect(castable(table([on("src", HICKORY)]))).toEqual(["Ornithopter"]);
    expect(castable(table([on("src", GEMSTONE_MINE)]))).toEqual(["Ornithopter"]);
  });

  it("a station-gated line no longer kills the honest one: The Eternity Elevator taps for {C}{C}{C}", () => {
    expect(manaProduction(ETERNITY_ELEVATOR)).toMatchObject({ colors: ["C"], amount: 3 });
  });
});

describe("7 · a quoted ability no grant gives the card", () => {
  it.each([["Old-Growth Troll", OLD_GROWTH_TROLL], ["Harold and Bob, First Numens", HAROLD_AND_BOB], ["Glorious Sunrise", GLORIOUS_SUNRISE],
    ["Princess Yue", PRINCESS_YUE], ["Hydro-Man, Fluid Felon", HYDRO_MAN]])("%s makes no mana", (_name, card) => {
    expect(manaProduction(card)).toBeNull();
  });

  it("Glorious Sunrise and Old-Growth Troll pay for nothing", () => {
    expect(castable(table([on("src", GLORIOUS_SUNRISE)]))).toEqual(["Ornithopter"]);
    expect(castable(table([on("src", OLD_GROWTH_TROLL)]))).toEqual(["Ornithopter"]);
  });
});

describe("family controls — the honest shapes are unchanged", () => {
  it("self-included grants: Gemhide Sliver, Basal Sliver, Sachi", () => {
    expect(manaProduction(GEMHIDE)).toMatchObject({ colors: ["W", "U", "B", "R", "G"], amount: 1 });
    expect(manaProduction(BASAL)).toMatchObject({ colors: ["B"], amount: 2, sacrifices: true });
    expect(manaProduction(SACHI)).toMatchObject({ colors: ["G"], amount: 2 });
  });

  it("the paid costs: Mana Confluence, Springleaf Drum, Ashnod's Altar, Molt Tender, Elvish Spirit Guide, a Treasure", () => {
    expect(manaProduction(CONFLUENCE)).toMatchObject({ payLife: 1 });
    expect(manaProduction(DRUM)).toMatchObject({ extraTap: { count: 1, filter: "creature" } });
    expect(manaProduction(ALTAR)).toMatchObject({ colors: ["C"], amount: 2, sacrificesCreature: true });
    expect(manaProduction(MOLT_TENDER)).toMatchObject({ exilesGyCard: true });
    expect(manaProduction(SPIRIT_GUIDE)).toMatchObject({ colors: ["G"], fromHand: true });
    expect(manaProduction(TREASURE)).toMatchObject({ sacrifices: true });
  });

  it("the counter costs: Fountain of Cho's storage line, Pentad Prism's charge counters", () => {
    expect(manaProduction(FOUNTAIN_OF_CHO)).toMatchObject({ colors: ["W"], removesCounters: { type: "storage", mode: "perCounter" } });
    expect(manaProduction(PENTAD)).toMatchObject({ removesCounters: { type: "charge", mode: "each" } });
  });

  it("an ability word, a gate, a vivid count and an \"instead\" rider: Mox Opal, Bloom Tender, Incubation Druid, Command Mine", () => {
    expect(manaProduction(MOX_OPAL)).toMatchObject({ activationCondition: "you control three or more artifacts" });
    expect(manaProduction(BLOOM_TENDER)).toMatchObject({ fixedSpec: { kind: "colorsAmongPermanents" } });
    expect(manaProduction(INCUBATION)).toMatchObject({ amount: 1, colorsAmongSpec: { kind: "landsYouControlCouldProduce" } });
    expect(manaProduction(COMMAND_MINE)).toMatchObject({ amount: 1, colorsAmongSpec: { kind: "commanderColorIdentity" } });
  });
});

describe("controls — real mana abilities still make mana", () => {
  it("Llanowar Elves taps for {G}, by hand and for a cast", () => {
    const s = table([on("src", ELVES)]);
    expect(taps(s).map((a) => a.color)).toEqual(["G"]);
    expect(castable(s)).toEqual(["Llanowar Elves", "Origin Spellbomb", "Ornithopter"]);
  });

  it("a dual whose whole ability is reminder text still taps for both colours (Tundra)", () => {
    const tundra = { name: "Tundra", type: "Land — Plains Island", mana: "", oracle: "({T}: Add {W} or {U}.)" };
    expect(manaProduction(tundra)).toMatchObject({ colors: ["W", "U"], amount: 1 });
    expect(taps(table([on("src", tundra)])).map((a) => a.color)).toEqual(["W", "U"]);
  });

  it("a Forest taps for {G}, by hand and for a cast", () => {
    const s = table([on("src", FOREST)]);
    expect(taps(s).map((a) => a.color)).toEqual(["G"]);
    expect(castable(s)).toEqual(["Llanowar Elves", "Origin Spellbomb", "Ornithopter"]);
  });
});

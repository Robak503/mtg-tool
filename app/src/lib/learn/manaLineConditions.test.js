/**
 * manaLineConditions.test.js — a mana line makes what its printed condition says, read as the ability resolves (2026-10-17).
 *
 *   A · "INSTEAD" UPGRADES. "{T}: Add {C}. If you control an Urza's Mine and an Urza's Power-Plant, add {C}{C}{C} instead."
 *       (Urza's Tower, Mine and Power Plant — land types, not names, per their rulings; Planar Nexus is every one of them),
 *       River of Tears ("If you played a land this turn, add {B} instead" — a land is played only on its controller's turn,
 *       CR 305.3), Command Mine (a Command Tower and a Command Power Plant, by name), Gemstone Caverns and Incubation Druid
 *       (a counter on the permanent itself). The parse read only the first "Add" sentence: Tron always made {C}, and River of
 *       Tears made {U} after a land drop, where it makes only {B} — a wrong colour. A condition the engine can't read (A-Town's
 *       real-world city) keeps the base mana and costs the land its full-modelling credit.
 *   B · METEOR CRATER. "{T}: Choose a color of a permanent you control. Add one mana of that color." (CR 105.2 — a permanent's
 *       colours; the ruling: colorless can't be chosen.) The land fallback made {C}, with or without a coloured permanent.
 *   C · LAVINIA. "{T}: Add {C}{C}. Activate only during an opponent's turn." tapped on her controller's own turn (CR 602.5).
 *   D · COUNTER COSTS ON NONLANDS. "{T}, Remove a <charge|-1/-1|book> counter from this <artifact|creature>: Add …" (Sphere of
 *       the Suns, Channeler Initiate, Spell Satchel) and Mana Bloom's once-each-turn charge line — the land forms' machinery
 *       (the record removes one counter, no source with none left — CR 118.3). Sphere of the Suns now also enters tapped
 *       with its three charge counters ("enters tapped and with …").
 *
 * Every card text is the bundled oracle index's (read in-session 2026-10-17).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { manaProduction, manaSources, canAfford, payGenericMana } from "./manaModel.js";
import { enterPermanent } from "./resolvers.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

// ── The cards under test (bundled oracle index) ──
const TOWER = { name: "Urza's Tower", type: "Land — Urza's Tower", mana: "", colors: [],
  oracle: "{T}: Add {C}. If you control an Urza's Mine and an Urza's Power-Plant, add {C}{C}{C} instead." };
const MINE = { name: "Urza's Mine", type: "Land — Urza's Mine", mana: "", colors: [],
  oracle: "{T}: Add {C}. If you control an Urza's Power-Plant and an Urza's Tower, add {C}{C} instead." };
const POWER_PLANT = { name: "Urza's Power Plant", type: "Land — Urza's Power-Plant", mana: "", colors: [],
  oracle: "{T}: Add {C}. If you control an Urza's Mine and an Urza's Tower, add {C}{C} instead." };
const NEXUS = { name: "Planar Nexus", type: "Land", mana: "", colors: [],
  oracle: "This land is every nonbasic land type. (Nonbasic land types include Cave, Desert, Gate, Lair, Locus, Mine, Power-Plant, Sphere, Tower, and Urza's.)\n{T}: Add {C}.\n{1}, {T}: Add one mana of any color." };
const RIVER = { name: "River of Tears", type: "Land", mana: "", colors: [], oracle: "{T}: Add {U}. If you played a land this turn, add {B} instead." };
const CAVERNS = { name: "Gemstone Caverns", type: "Legendary Land", mana: "", colors: [],
  oracle: "If this card is in your opening hand and you're not the starting player, you may begin the game with Gemstone Caverns on the battlefield with a luck counter on it. If you do, exile a card from your hand.\n{T}: Add {C}. If Gemstone Caverns has a luck counter on it, instead add one mana of any color." };
const A_TOWN = { name: "A-Town", type: "Land — Town", mana: "", colors: [], oracle: "{T}: Add {C}. If you're in a city that starts with an A, instead add one mana of any color." };
const COMMAND_MINE = { name: "Command Mine", type: "Land", mana: "", colors: [],
  oracle: "{T}: Add one mana of any color in your commander's color identity. If you control a Command Tower and a Command Power Plant, add two mana of any color in your commander's color identity instead." };
const COMMAND_TOWER = { name: "Command Tower", type: "Land", mana: "", colors: [], oracle: "{T}: Add one mana of any color in your commander's color identity." };
const COMMAND_POWER_PLANT = { name: "Command Power Plant", type: "Land", mana: "", colors: [],
  oracle: "{T}: Add one mana of any color in your commander's color identity. If you control a Command Tower and a Command Mine, add two mana of any color in your commander's color identity instead.\nCommand Towers you control have, \"{T}: If you control a Command Mine and a Command Power Plant, add three mana of any color in your commander's color identity.\"" };
const INCUBATION = { name: "Incubation Druid", type: "Creature — Elf Druid", mana: "{1}{G}", power: "0", toughness: "2", colors: ["G"],
  oracle: "{T}: Add one mana of any type that a land you control could produce. If this creature has a +1/+1 counter on it, add three mana of that type instead.\n{3}{G}{G}: Adapt 3. (If this creature has no +1/+1 counters on it, put three +1/+1 counters on it.)" };
const METEOR_CRATER = { name: "Meteor Crater", type: "Land", mana: "", colors: [], oracle: "{T}: Choose a color of a permanent you control. Add one mana of that color." };
const LAVINIA = { name: "Lavinia, Foil to Conspiracy", type: "Legendary Creature — Human Detective", mana: "{1}{W/U}{W/U}", power: "2", toughness: "3", colors: ["W", "U"],
  oracle: "Vigilance\nWhenever you cast your second spell each turn, investigate. (Create a Clue token. It's an artifact with \"{2}, Sacrifice this token: Draw a card.\")\n{T}: Add {C}{C}. Activate only during an opponent's turn." };
const SPHERE = { name: "Sphere of the Suns", type: "Artifact", mana: "{2}", colors: [],
  oracle: "This artifact enters tapped and with three charge counters on it.\n{T}, Remove a charge counter from this artifact: Add one mana of any color." };
const CHANNELER = { name: "Channeler Initiate", type: "Creature — Human Druid", mana: "{1}{G}", power: "3", toughness: "4", colors: ["G"],
  oracle: "When this creature enters, put three -1/-1 counters on target creature you control.\n{T}, Remove a -1/-1 counter from this creature: Add one mana of any color." };
const SATCHEL = { name: "Spell Satchel", type: "Artifact", mana: "{2}", colors: [],
  oracle: "Magecraft — Whenever you cast or copy an instant or sorcery spell, put a book counter on this artifact.\n{T}, Remove a book counter from this artifact: Add {C}.\n{3}, {T}, Remove three book counters from this artifact: Draw a card." };
const MANA_BLOOM = { name: "Mana Bloom", type: "Enchantment", mana: "{X}{G}", colors: ["G"],
  oracle: "This enchantment enters with X charge counters on it.\nRemove a charge counter from this enchantment: Add one mana of any color. Activate only once each turn.\nAt the beginning of your upkeep, if this enchantment has no charge counters on it, return it to its owner's hand." };
const POUCH = { name: "Component Pouch", type: "Artifact", mana: "{3}", colors: [],
  oracle: "{T}, Remove a component counter from this artifact: Add two mana of different colors.\n{T}: Roll a d20.\n1—9 | Put a component counter on this artifact.\n10—20 | Put two component counters on this artifact." };
// ── Board pieces and controls ──
const FOREST = { name: "Forest", type: "Basic Land — Forest", mana: "", colors: [], oracle: "({T}: Add {G}.)" };
const REFLECTING_POOL = { name: "Reflecting Pool", type: "Land", mana: "", colors: [], oracle: "{T}: Add one mana of any type that a land you control could produce." };
const SOL_RING = { name: "Sol Ring", type: "Artifact", mana: "{1}", colors: [], oracle: "{T}: Add {C}{C}." };
const ELVES = { name: "Llanowar Elves", type: "Creature — Elf Druid", mana: "{G}", power: "1", toughness: "1", colors: ["G"], oracle: "{T}: Add {G}." };
const BEAR = { name: "Grizzly Bears", type: "Creature — Bear", mana: "{1}{G}", power: "2", toughness: "2", colors: ["G"], oracle: "" };
const LOOTER = { name: "Merfolk Looter", type: "Creature — Merfolk Rogue", mana: "{1}{U}", power: "1", toughness: "1", colors: ["U"], oracle: "{T}: Draw a card, then discard a card." };
const OMNATH = { id: "cmd-omnath", name: "Omnath, Locus of Mana", type: "Legendary Creature — Elemental", mana: "{2}{G}", power: "1", toughness: "1", colorIdentity: ["G"], colors: ["G"],
  oracle: "You don't lose unspent green mana as steps and phases end.\nOmnath gets +1/+1 for each unspent green mana you have." };
// ── Spells cast from hand ──
const OPT = { id: "h-opt", name: "Opt", type: "Instant", mana: "{U}", mana_cost: "{U}", cmc: 1, colors: ["U"], oracle: "Scry 1. (Look at the top card of your library. You may put that card on the bottom.)\nDraw a card." };
const DISFIGURE = { id: "h-disfigure", name: "Disfigure", type: "Instant", mana: "{B}", mana_cost: "{B}", cmc: 1, colors: ["B"], oracle: "Target creature gets -2/-2 until end of turn." };
const WURMCOIL = { id: "h-wurmcoil", name: "Wurmcoil Engine", type: "Artifact Creature — Phyrexian Wurm", mana: "{6}", mana_cost: "{6}", cmc: 6, power: "6", toughness: "6", colors: [],
  oracle: "Deathtouch, lifelink\nWhen this creature dies, create a 3/3 colorless Phyrexian Wurm artifact creature token with deathtouch and a 3/3 colorless Phyrexian Wurm artifact creature token with lifelink." };
const ELVES_CARD = { id: "h-elves", ...ELVES, mana_cost: "{G}", cmc: 1 };
const FOREST_CARD = { id: "h-forest", ...FOREST };
const HAND = [OPT, DISFIGURE, WURMCOIL, ELVES_CARD];

const on = (id, card, { counters = {}, tapped = false, sick = false, controller = "user" } = {}) => {
  const p = createPermanent({ id, card: { id: `c-${id}`, ...card }, controller, summoningSick: sick });
  return { ...p, tapped, counters: { ...(p.counters || {}), ...counters } };
};
function table(battlefield, { hand = HAND, aiBattlefield = [], activePlayer = "user", landsPlayed = 0, userCommanders = [], turn = 3 } = {}) {
  const s0 = createGameState({ userDeck: [], aiDeck: [], userCommanders });
  return {
    ...s0, phase: "precombat-main", step: "main", activePlayer, priorityHolder: "user", consecutivePasses: 0, turn, stack: [],
    players: {
      ...s0.players,
      user: { ...s0.players.user, battlefield, hand, life: 20, library: [], graveyard: [], landsPlayedThisTurn: landsPlayed, manaPool: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 } },
      ai: { ...s0.players.ai, battlefield: aiBattlefield },
    },
  };
}
const COST = (c) => ({ generic: 0, W: 0, U: 0, B: 0, R: 0, G: 0, C: 0, hybrid: [], ...c });
const actions = (s) => legalActionsForPlayer(s, "user");
const castFrom = (s, cardId) => actions(s).find((a) => a.kind === "cast-spell" && a.cardId === cardId);
const taps = (s, id = "src") => actions(s).filter((a) => a.kind === "tap-for-mana" && a.permanentId === id);
const tapFor = (s, color, id = "src") => taps(s, id).find((a) => a.color === color);
const records = (s, id = "src") => manaSources(s, "user").filter((r) => r.permanentId === id);
const pool = (s) => s.players.user.manaPool;
const perm = (s, id) => s.players.user.battlefield.find((p) => p.id === id);
const affords = (s, cost) => canAfford(s.players.user.manaPool, manaSources(s, "user"), COST(cost));

// ═══════════════════════════════════════════ A · "INSTEAD" UPGRADES ═══════════════════════════════════════════
describe("A · Tron — the upgrade when you control the other two Urza's lands", () => {
  it("assembled: Tower makes {C}{C}{C}, Mine and Power Plant {C}{C} each — seven mana casts Wurmcoil Engine", () => {
    const s = table([on("src", TOWER), on("mine", MINE), on("pp", POWER_PLANT)]);
    expect([records(s)[0]?.amount, records(s, "mine")[0]?.amount, records(s, "pp")[0]?.amount]).toEqual([3, 2, 2]);
    const cast = castFrom(s, "h-wurmcoil");
    expect(cast).toBeDefined();
    const out = dispatchAction(s, cast);
    expect(["src", "mine", "pp"].map((id) => perm(out, id).tapped)).toEqual([true, true, true]);
  });

  it("assembled, by hand: tapping Urza's Tower adds {C}{C}{C}", () => {
    const s = table([on("src", TOWER), on("mine", MINE), on("pp", POWER_PLANT)]);
    expect(taps(s).map((a) => a.color)).toEqual(["C"]);
    expect(pool(dispatchAction(s, tapFor(s, "C"))).C).toBe(3);
  });

  it("control — Tower and Mine without a Power-Plant: one {C} each; Wurmcoil can't be cast; the tap adds {C}", () => {
    const s = table([on("src", TOWER), on("mine", MINE)]);
    expect([records(s)[0]?.amount, records(s, "mine")[0]?.amount]).toEqual([1, 1]);
    expect(castFrom(s, "h-wurmcoil")).toBeUndefined();
    expect(pool(dispatchAction(s, tapFor(s, "C"))).C).toBe(1);
  });

  it("land types, not names: Planar Nexus (every nonbasic land type) completes Urza's Tower on its own", () => {
    const s = table([on("src", TOWER), on("nexus", NEXUS)]);
    expect(records(s)[0]?.amount).toBe(3);
    expect(pool(dispatchAction(s, tapFor(s, "C"))).C).toBe(3);
  });

  it("control — an opponent's Mine and Power Plant are not yours: Urza's Tower makes {C}", () => {
    const s = table([on("src", TOWER)], { aiBattlefield: [on("om", MINE, { controller: "ai" }), on("opp", POWER_PLANT, { controller: "ai" })] });
    expect(records(s)[0]?.amount).toBe(1);
  });
});

describe("A · River of Tears — {B} instead once you played a land this turn", () => {
  it("before a land drop: {U} only — Opt castable, Disfigure not; by hand only {U}", () => {
    const s = table([on("src", RIVER)], { aiBattlefield: [on("bear", BEAR, { controller: "ai" })] }); // a target for Disfigure
    expect(taps(s).map((a) => a.color)).toEqual(["U"]);
    expect(castFrom(s, "h-opt")).toBeDefined();
    expect(castFrom(s, "h-disfigure")).toBeUndefined();
  });

  it("after playing a Forest: {B} only — Disfigure castable from River of Tears, Opt not; by hand only {B}", () => {
    const s0 = table([on("src", RIVER)], { hand: [...HAND, FOREST_CARD], aiBattlefield: [on("bear", BEAR, { controller: "ai" })] });
    const s = dispatchAction(s0, { kind: "play-land", playerId: "user", cardId: "h-forest" });
    expect(s.players.user.landsPlayedThisTurn).toBe(1);
    expect(taps(s).map((a) => a.color)).toEqual(["B"]);
    expect(pool(dispatchAction(s, tapFor(s, "B"))).B).toBe(1);
    // The Forest pays green only, so the blue and black pips are River of Tears' alone.
    expect(castFrom(s, "h-disfigure")).toBeDefined();
    expect(castFrom(s, "h-opt")).toBeUndefined();
  });

  it("what it could produce follows (CR 106.7): after the land drop, Reflecting Pool beside it makes {B} or {G}, never {U}", () => {
    const s0 = table([on("src", RIVER), on("pool", REFLECTING_POOL)], { hand: [...HAND, FOREST_CARD] });
    const s = dispatchAction(s0, { kind: "play-land", playerId: "user", cardId: "h-forest" });
    expect(taps(s, "pool").map((a) => a.color).sort()).toEqual(["B", "G"]);
  });

  it("control — on an opponent's turn its controller played no land this turn (CR 305.3), whatever the counter says: {U}", () => {
    const s = table([on("src", RIVER)], { activePlayer: "ai", landsPlayed: 1 });
    expect(records(s).map((r) => r.colors)).toEqual([["U"]]);
    expect(affords(s, { U: 1 })).toBe(true);
    expect(affords(s, { B: 1 })).toBe(false);
  });
});

describe("A · the other conditions the engine reads — a counter on the permanent, permanents by name", () => {
  it("Gemstone Caverns with a luck counter makes any colour; without one, {C}", () => {
    const lucky = table([on("src", CAVERNS, { counters: { luck: 1 } })]);
    expect(taps(lucky).map((a) => a.color)).toEqual(["W", "U", "B", "R", "G"]);
    expect(pool(dispatchAction(lucky, tapFor(lucky, "G"))).G).toBe(1);
    expect(affords(lucky, { B: 1 })).toBe(true);
    const plain = table([on("src", CAVERNS)]);
    expect(taps(plain).map((a) => a.color)).toEqual(["C"]);
    expect(affords(plain, { B: 1 })).toBe(false);
  });

  it("Command Mine beside a Command Tower and a Command Power Plant makes two of the commander's colours; without the Power Plant, one", () => {
    const full = table([on("src", COMMAND_MINE), on("ct", COMMAND_TOWER), on("cpp", COMMAND_POWER_PLANT)], { userCommanders: [OMNATH] });
    expect(records(full).map((r) => [r.colors, r.amount])).toEqual([[["G"], 2]]);
    expect(pool(dispatchAction(full, tapFor(full, "G"))).G).toBe(2);
    const part = table([on("src", COMMAND_MINE), on("ct", COMMAND_TOWER)], { userCommanders: [OMNATH] });
    expect(records(part).map((r) => [r.colors, r.amount])).toEqual([[["G"], 1]]);
    expect(pool(dispatchAction(part, tapFor(part, "G"))).G).toBe(1);
  });

  it("Incubation Druid with a +1/+1 counter makes three mana of one type a land of yours could produce; without one, one", () => {
    const grown = table([on("src", INCUBATION, { counters: { "+1/+1": 3 } }), on("f", FOREST)]);
    expect(records(grown).map((r) => [r.colors, r.amount])).toEqual([[["G"], 3]]);
    expect(pool(dispatchAction(grown, tapFor(grown, "G"))).G).toBe(3);
    const bare = table([on("src", INCUBATION), on("f", FOREST)]);
    expect(records(bare).map((r) => [r.colors, r.amount])).toEqual([[["G"], 1]]);
  });

  it("A-Town: a condition the engine can't read keeps the base — {C}, never any colour — and the land is not credited as fully modelled", () => {
    const s = table([on("src", A_TOWN)]);
    expect(taps(s).map((a) => a.color)).toEqual(["C"]);
    expect(affords(s, { G: 1 })).toBe(false);
    expect(classifyCard(A_TOWN)).toBe("land-partial");
  });

  it("the modelled conditions keep their lands credited: Tron, River of Tears, Gemstone Caverns, Command Mine", () => {
    expect([TOWER, MINE, POWER_PLANT, RIVER, CAVERNS, COMMAND_MINE].map(classifyCard)).toEqual(Array(6).fill("land"));
  });
});

// ═══════════════════════════════════════════ B · METEOR CRATER ═══════════════════════════════════════════
describe("B · Meteor Crater — one mana of a colour of a permanent you control", () => {
  it("beside a summoning-sick Llanowar Elves: {G} only, by hand and through the planner", () => {
    const s = table([on("src", METEOR_CRATER), on("elf", ELVES, { sick: true })]);
    expect(taps(s).map((a) => a.color)).toEqual(["G"]);
    expect(pool(dispatchAction(s, tapFor(s, "G"))).G).toBe(1);
    expect(affords(s, { G: 1 })).toBe(true);
    expect(affords(s, { C: 1 })).toBe(false);
  });

  it("a green and a blue permanent: green or blue", () => {
    const s = table([on("src", METEOR_CRATER), on("elf", ELVES, { sick: true }), on("looter", LOOTER, { sick: true })]);
    expect(taps(s).map((a) => a.color)).toEqual(["G", "U"]);
  });

  it("control — no coloured permanent (only lands and Sol Ring): no mana at all, not even {C}", () => {
    const s = table([on("src", METEOR_CRATER), on("f", FOREST), on("ring", SOL_RING)]);
    expect(records(s)).toEqual([]);
    expect(taps(s)).toEqual([]);
    expect(classifyCard(METEOR_CRATER)).toBe("land");
  });
});

// ═══════════════════════════════════════════ C · LAVINIA ═══════════════════════════════════════════
describe("C · Lavinia, Foil to Conspiracy — {C}{C} only during an opponent's turn", () => {
  it("on her controller's own turn she is no source: no tap offered, a tap action refused, nothing for the planner", () => {
    const s = table([on("src", LAVINIA)]);
    expect(records(s)).toEqual([]);
    expect(taps(s)).toEqual([]);
    expect(() => dispatchAction(s, { kind: "tap-for-mana", playerId: "user", permanentId: "src", color: "C" })).toThrow(/can't be tapped/);
    expect(affords(s, { generic: 1 })).toBe(false);
  });

  it("on an opponent's turn she makes {C}{C} for a payment (the explicit tap is offered only in its controller's main phase)", () => {
    const s = table([on("src", LAVINIA)], { activePlayer: "ai" });
    expect(records(s).map((r) => [r.colors, r.amount])).toEqual([[["C"], 2]]);
    expect(affords(s, { generic: 2 })).toBe(true);
    const { state: out, paid } = payGenericMana(s, "user", 2);
    expect({ paid, tapped: perm(out, "src").tapped }).toEqual({ paid: true, tapped: true });
  });
});

// ═══════════════════════════════════════════ D · COUNTER COSTS ON NONLANDS ═══════════════════════════════════════════
describe("D · a counter in the cost of a nonland's mana line is paid", () => {
  it("Sphere of the Suns (three charge counters) pays for Llanowar Elves: tapped, two counters left", () => {
    const s = table([on("src", SPHERE, { counters: { charge: 3 } })]);
    const cast = castFrom(s, "h-elves");
    expect(cast).toBeDefined();
    const out = dispatchAction(s, cast);
    expect({ tapped: perm(out, "src").tapped, charge: perm(out, "src").counters.charge }).toEqual({ tapped: true, charge: 2 });
  });

  it("Sphere of the Suns by hand: any colour; taking one removes a counter; with none left it is no source", () => {
    const s = table([on("src", SPHERE, { counters: { charge: 1 } })]);
    expect(taps(s).map((a) => a.color)).toEqual(["W", "U", "B", "R", "G"]);
    const out = dispatchAction(s, tapFor(s, "U"));
    expect({ U: pool(out).U, charge: perm(out, "src").counters.charge ?? 0, tapped: perm(out, "src").tapped }).toEqual({ U: 1, charge: 0, tapped: true });
    const dry = table([on("src", SPHERE)]);
    expect(records(dry)).toEqual([]);
    expect(taps(dry)).toEqual([]);
  });

  it("Sphere of the Suns enters tapped with three charge counters", () => {
    const out = enterPermanent(table([]), { id: "c-sphere", ...SPHERE }, "user");
    const p = out.players.user.battlefield.find((x) => x.card.name === "Sphere of the Suns");
    expect({ tapped: p.tapped, charge: p.counters?.charge }).toEqual({ tapped: true, charge: 3 });
  });

  it("Channeler Initiate pays with a -1/-1 counter by hand and through the planner; summoning sick, it can't", () => {
    const s = table([on("src", CHANNELER, { counters: { "-1/-1": 3 } })]);
    expect(taps(s).map((a) => a.color)).toEqual(["W", "U", "B", "R", "G"]);
    const out = dispatchAction(s, tapFor(s, "R"));
    expect({ R: pool(out).R, counters: perm(out, "src").counters["-1/-1"], tapped: perm(out, "src").tapped }).toEqual({ R: 1, counters: 2, tapped: true });
    const paid = dispatchAction(s, castFrom(s, "h-disfigure"));
    expect(perm(paid, "src").counters["-1/-1"]).toBe(2);
    expect(records(table([on("src", CHANNELER, { counters: { "-1/-1": 3 }, sick: true })]))).toEqual([]);
  });

  it("Spell Satchel with a book counter makes {C}, removing it; with none, nothing", () => {
    const s = table([on("src", SATCHEL, { counters: { book: 1 } })]);
    expect(taps(s).map((a) => a.color)).toEqual(["C"]);
    const out = dispatchAction(s, tapFor(s, "C"));
    expect({ C: pool(out).C, book: perm(out, "src").counters.book ?? 0 }).toEqual({ C: 1, book: 0 });
    expect(affords(s, { generic: 1 })).toBe(true);
    expect(records(table([on("src", SATCHEL)]))).toEqual([]);
  });

  it("Mana Bloom (two charge counters): once each turn — one activation pays, no tap; the second waits for the next turn", () => {
    const s = table([on("src", MANA_BLOOM, { counters: { charge: 2 } })]);
    expect(records(s)).toHaveLength(1);
    const cast = castFrom(s, "h-elves");
    expect(cast).toBeDefined();
    const out = dispatchAction(s, cast);
    expect({ charge: perm(out, "src").counters.charge, tapped: perm(out, "src").tapped }).toEqual({ charge: 1, tapped: false });
    expect(records(out)).toEqual([]);
    expect(records({ ...out, turn: out.turn + 1 })).toHaveLength(1);
  });

  it("Mana Bloom by hand: one activation offered, any colour; after it, none this turn", () => {
    const s = table([on("src", MANA_BLOOM, { counters: { charge: 2 } })]);
    expect(taps(s).map((a) => a.color)).toEqual(["W", "U", "B", "R", "G"]);
    const out = dispatchAction(s, tapFor(s, "B"));
    expect({ B: pool(out).B, charge: perm(out, "src").counters.charge, tapped: perm(out, "src").tapped }).toEqual({ B: 1, charge: 1, tapped: false });
    expect(taps(out)).toEqual([]);
  });

  it("the three {T} counter-cost cards are credited for the mana their record now pays (their other text was already modelled)", () => {
    expect([SPHERE, CHANNELER, SATCHEL].map(classifyCard)).toEqual(Array(3).fill("native-mana"));
  });

  it("fence (synthetic): the {T} counter line is read only in its whole printed form — a rider after the mana keeps it no source", () => {
    expect(manaProduction({ name: "Probe Fence", type: "Artifact", mana: "{2}", oracle: "{T}, Remove a charge counter from this artifact: Add one mana of any color. Draw a card." })).toBeNull();
  });

  it("control — Component Pouch's \"two mana of different colors\" has no record shape: still no source", () => {
    expect(manaProduction(POUCH)).toBeNull();
    expect(records(table([on("src", POUCH, { counters: { component: 2 } })]))).toEqual([]);
  });
});

// ═══════════════════════════════════════════ CONTROLS ═══════════════════════════════════════════
describe("controls — a basic land and Sol Ring are unchanged", () => {
  it("Forest: {G}; Sol Ring: {C}{C}", () => {
    const s = table([on("src", FOREST), on("ring", SOL_RING)]);
    expect(records(s).map((r) => [r.colors, r.amount])).toEqual([[["G"], 1]]);
    expect(records(s, "ring").map((r) => [r.colors, r.amount])).toEqual([[["C"], 2]]);
    expect(pool(dispatchAction(s, tapFor(s, "G"))).G).toBe(1);
    expect(pool(dispatchAction(s, tapFor(s, "C", "ring"))).C).toBe(2);
    expect(affords(s, { generic: 3 })).toBe(true);
    expect(affords(s, { generic: 4 })).toBe(false);
  });
});

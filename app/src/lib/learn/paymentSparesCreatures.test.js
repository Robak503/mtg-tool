/**
 * paymentSparesCreatures.test.js — the auto-tap pays with sources that are not creatures before it taps a creature for mana
 * (manaModel planPayment → withCreaturesSpared, 2026-10-20).
 *
 * Every planner pass ordered its taps by color and board position only, so a creature was tapped for mana as readily as a land:
 * an A/B game (the AI pump slice, game 39) paid Preposterous Proportions with five animated Forests — 42 power it meant to
 * attack with — while nine plain lands stayed untapped, and Fanatic of Rhonas paid a cast and could not attack (the Nykthos
 * slice, game 73). A tapped creature can't attack or block until it untaps (CR 508.1a, 509.1a). manaSources now stamps each
 * record that taps a creature (`tapsCreatures` — the source itself, or a creature its cost taps: Springleaf Drum), and when
 * the plan taps one while another source is left, planPayment plans once more with those records spared and keeps that plan
 * when it pays and taps fewer creatures. The first plan still decides affordability (canAfford), so nothing becomes payable or
 * unpayable; a creature that alone makes the color is still tapped; spend-restricted lands are judged as before.
 *
 * Every payment runs through legalActionsForPlayer + dispatchAction (the Academy's auto-tap, a person's cast) unless said.
 * Real oracle fixtures: bundled Scryfall oracle_cards.json (2026-10-20).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { applyEarthbend } from "./effects/effectAtoms.js";
import { permanentIsCreature, permanentPower } from "./layers.js";
import { canAfford, manaSources, planPayment } from "./manaModel.js";

beforeEach(() => _resetIdsForTests());

const card = (name, type, mana, oracle, extra = {}) => ({ name, type, mana, cmc: 0, colors: [], keywords: [], oracle, ...extra });
const FOREST = card("Forest", "Basic Land — Forest", "", "({T}: Add {G}.)");
const ISLAND = card("Island", "Basic Land — Island", "", "({T}: Add {U}.)");
const PLAINS = card("Plains", "Basic Land — Plains", "", "({T}: Add {W}.)");
const SNOW_FOREST = card("Snow-Covered Forest", "Basic Snow Land — Forest", "", "({T}: Add {G}.)");
const BREEDING_POOL = card("Breeding Pool", "Land — Forest Island", "", "({T}: Add {G} or {U}.)\nAs this land enters, you may pay 2 life. If you don't, it enters tapped.");
const MECH_HANGAR = card("Mech Hangar", "Land", "", "{T}: Add {C}.\n{T}: Add one mana of any color. Spend this mana only to cast a Pilot or Vehicle spell.\n{3}, {T}: Target Vehicle becomes an artifact creature until end of turn.");
const CAVERN = card("Cavern of Souls", "Land", "", "As this land enters, choose a creature type.\n{T}: Add {C}.\n{T}: Add one mana of any color. Spend this mana only to cast a creature spell of the chosen type, and that spell can't be countered.");
const LLANOWAR = card("Llanowar Elves", "Creature — Elf Druid", "{G}", "{T}: Add {G}.", { cmc: 1, colors: ["G"], power: "1", toughness: "1" });
const ELVISH_MYSTIC = card("Elvish Mystic", "Creature — Elf Druid", "{G}", "{T}: Add {G}.", { cmc: 1, colors: ["G"], power: "1", toughness: "1" });
const BIRDS = card("Birds of Paradise", "Creature — Bird", "{G}", "Flying\n{T}: Add one mana of any color.", { cmc: 1, colors: ["G"], keywords: ["Flying"], power: "0", toughness: "1" });
const BOREAL_DRUID = card("Boreal Druid", "Snow Creature — Elf Druid", "{G}", "{T}: Add {C}.", { cmc: 1, colors: ["G"], power: "1", toughness: "1" });
const FANATIC = card("Fanatic of Rhonas", "Creature — Snake Druid", "{1}{G}", "{T}: Add {G}.\nFerocious — {T}: Add {G}{G}{G}{G}. Activate only if you control a creature with power 4 or greater.\nEternalize {2}{G}{G} ({2}{G}{G}, Exile this card from your graveyard: Create a token that's a copy of it, except it's a 4/4 black Zombie Snake Druid with no mana cost. Eternalize only as a sorcery.)", { cmc: 2, colors: ["G"], keywords: ["Ferocious", "Eternalize"], power: "1", toughness: "4" });
const PALLADIUM_MYR = card("Palladium Myr", "Artifact Creature — Myr", "{3}", "{T}: Add {C}{C}.", { cmc: 3, power: "2", toughness: "2" });
const SPRINGLEAF_DRUM = card("Springleaf Drum", "Artifact", "{1}", "{T}, Tap an untapped creature you control: Add one mana of any color.", { cmc: 1 });
const SIMIC_SIGNET = card("Simic Signet", "Artifact", "{2}", "{1}, {T}: Add {G}{U}.", { cmc: 2 });
const NATURES_REVOLT = card("Nature's Revolt", "Enchantment", "{3}{G}{G}", "All lands are 2/2 creatures that are still lands.", { cmc: 5, colors: ["G"] });
const LEATHERBACK = card("Leatherback Baloth", "Creature — Beast", "{G}{G}{G}", "", { cmc: 3, colors: ["G"], power: "4", toughness: "5" });
// The spells cast.
const WORN_POWERSTONE = card("Worn Powerstone", "Artifact", "{3}", "This artifact enters tapped.\n{T}: Add {C}{C}.", { cmc: 3 });
const MIND_STONE = card("Mind Stone", "Artifact", "{2}", "{T}: Add {C}.\n{1}, {T}, Sacrifice this artifact: Draw a card.", { cmc: 2 });
const DIVINATION = card("Divination", "Sorcery", "{2}{U}", "Draw two cards.", { cmc: 3, colors: ["U"] });
const BEARS = card("Grizzly Bears", "Creature — Bear", "{1}{G}", "", { cmc: 2, colors: ["G"], power: "2", toughness: "2" });
const DRYAD_MILITANT = card("Dryad Militant", "Creature — Dryad Soldier", "{G/W}", "({G/W} can be paid with either {G} or {W}.)\nIf an instant or sorcery card would be put into a graveyard from anywhere, exile it instead.", { cmc: 1, colors: ["G", "W"], power: "2", toughness: "1" });
const COILING_ORACLE = card("Coiling Oracle", "Creature — Snake Elf Druid", "{G}{U}", "When this creature enters, reveal the top card of your library. If it's a land card, put it onto the battlefield. Otherwise, put that card into your hand.", { cmc: 2, colors: ["G", "U"], power: "1", toughness: "1" });
const ELITE_VANGUARD = card("Elite Vanguard", "Creature — Human Soldier", "{W}", "", { cmc: 1, colors: ["W"], power: "2", toughness: "1" });
const ELVISH_VISIONARY = card("Elvish Visionary", "Creature — Elf Shaman", "{1}{G}", "When this creature enters, draw a card.", { cmc: 2, colors: ["G"], power: "1", toughness: "1" });

const NO_MANA = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };
function table({ user = [], hand = [] } = {}) {
  const g = createGameState({ userDeck: [], aiDeck: [] });
  return { ...g, turn: 6, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main", stack: [], pendingTriggers: [],
    players: { ...g.players, user: { ...g.players.user, battlefield: user, hand: hand.map(([id, c]) => ({ ...c, id })), library: [{ ...FOREST, id: "lib" }], manaPool: { ...NO_MANA } } } };
}
const P = (id, c, extra = {}) => ({ ...createPermanent({ id, card: { ...c, id: `c-${id}` }, controller: "user", summoningSick: false }), ...extra });
const cast = (cardId) => (a) => a.kind === "cast-spell" && a.cardId === cardId;
function castIt(s, cardId) {
  const a = legalActionsForPlayer(s, "user").find(cast(cardId));
  if (!a) throw new Error(`${cardId} is not offered`);
  return dispatchAction(s, a);
}
const tapped = (s) => s.players.user.battlefield.filter((p) => p.tapped).map((p) => p.id).sort();
const cost = (c) => ({ generic: 0, W: 0, U: 0, B: 0, R: 0, G: 0, C: 0, hybrid: [], ...c });
/** Earthbend 4 (Earthbending Lesson: "Target land you control becomes a 0/0 creature with haste that's still a land. Put four
 *  +1/+1 counters on it.") `n` times — the engine's own atom, which takes the first land that is not yet a creature. */
const earthbend = (s, n) => { let out = s; for (let i = 0; i < n; i++) out = applyEarthbend(out, { count: 4 }, { controller: "user" }); return out; };

describe("the auto-tap spares creatures when other sources pay", () => {
  // A/B game 39's shape: five animated Forests (the oldest lands, here earthbent, first on the battlefield) beside plain lands.
  const earthbentBoard = (hand) => earthbend(table({
    user: [...[1, 2, 3, 4, 5].map((i) => P(`f${i}`, FOREST)), ...[1, 2, 3, 4].map((i) => P(`i${i}`, ISLAND))],
    hand,
  }), 5);

  it("⭐ five earthbent Forests beside four Islands: Worn Powerstone's {3} taps three Islands, the 4/4 Forests stay untapped", () => {
    const s = earthbentBoard([["h-stone", WORN_POWERSTONE]]);
    expect(["f1", "f2", "f3", "f4", "f5"].every((id) => permanentIsCreature(s, id) && permanentPower(s, id) === 4)).toBe(true);
    expect(["i1", "i2", "i3", "i4"].some((id) => permanentIsCreature(s, id))).toBe(false);
    expect(tapped(castIt(s, "h-stone"))).toEqual(["i1", "i2", "i3"]);
  });

  it("⭐ the same board pays Divination's {2}{U} with Islands only", () => {
    const s = earthbentBoard([["h-div", DIVINATION]]);
    expect(tapped(castIt(s, "h-div"))).toEqual(["i1", "i2", "i3"]);
  });

  it("⭐ Llanowar Elves (first on the battlefield) and a Forest: Elvish Mystic's {G} taps the Forest", () => {
    const s = table({ user: [P("elves", LLANOWAR), P("f1", FOREST)], hand: [["h-mystic", ELVISH_MYSTIC]] });
    expect(tapped(castIt(s, "h-mystic"))).toEqual(["f1"]);
  });

  it("⭐ Fanatic of Rhonas (A/B game 73's attacker) beside Leatherback Baloth and two Forests: Grizzly Bears taps the Forests", () => {
    const s = table({ user: [P("fan", FANATIC), P("baloth", LEATHERBACK), P("f1", FOREST), P("f2", FOREST)], hand: [["h-bears", BEARS]] });
    expect(tapped(castIt(s, "h-bears"))).toEqual(["f1", "f2"]);
  });

  it("⭐ Springleaf Drum's cost taps a creature: Mind Stone's {2} taps the Forest and the Island, the Drum and the Elves stay untapped", () => {
    const s = table({ user: [P("drum", SPRINGLEAF_DRUM), P("elves", LLANOWAR), P("f1", FOREST), P("i1", ISLAND)], hand: [["h-stone", MIND_STONE]] });
    expect(tapped(castIt(s, "h-stone"))).toEqual(["f1", "i1"]);
    expect(manaSources(s, "user").find((r) => r.permanentId === "drum").tapsCreatures).toEqual(["elves"]);
  });

  it("⭐ a plain colorless creature is no longer promoted ahead of the lands: Palladium Myr keeps its tap, two Forests pay Mind Stone", () => {
    const s = table({ user: [P("myr", PALLADIUM_MYR), P("f1", FOREST), P("f2", FOREST)], hand: [["h-stone", MIND_STONE]] });
    expect(tapped(castIt(s, "h-stone"))).toEqual(["f1", "f2"]);
  });

  it("⭐ a hybrid pip takes the option a land can pay: Dryad Militant's {G/W} off the Plains, not Llanowar Elves", () => {
    const s = table({ user: [P("elves", LLANOWAR), P("p1", PLAINS)], hand: [["h-dryad", DRYAD_MILITANT]] });
    expect(tapped(castIt(s, "h-dryad"))).toEqual(["p1"]);
  });

  it("⭐ the costed pass's funding call spares the creature: Simic Signet is funded by the Forest for Coiling Oracle", () => {
    const s = table({ user: [P("elves", LLANOWAR), P("signet", SIMIC_SIGNET), P("f1", FOREST)], hand: [["h-oracle", COILING_ORACLE]] });
    expect(tapped(castIt(s, "h-oracle"))).toEqual(["f1", "signet"]);
  });

  it("⭐ the sparing plan keeps the whole-board generic judgment: Nykthos (its devotion line live) keeps its tap, two Forests pay Grizzly Bears", () => {
    const NYKTHOS = card("Nykthos, Shrine to Nyx", "Legendary Land", "", "{T}: Add {C}.\n{2}, {T}: Choose a color. Add an amount of mana of that color equal to your devotion to that color. (Your devotion to a color is the number of mana symbols of that color in the mana costs of permanents you control.)");
    const s = table({ user: [P("elves", LLANOWAR), P("f1", FOREST), P("f2", FOREST), P("nyk", NYKTHOS)], hand: [["h-bears", BEARS]] });
    expect(manaSources(s, "user").some((r) => r.permanentId === "nyk" && r.activationCost)).toBe(true);
    expect(tapped(castIt(s, "h-bears"))).toEqual(["f1", "f2"]);
  });

  it("⭐ a snow pip is paid by the snow land before the snow creature (planPayment on manaSources)", () => {
    const s = table({ user: [P("druid", BOREAL_DRUID), P("sf1", SNOW_FOREST)] });
    const plan = planPayment(s.players.user.manaPool, manaSources(s, "user"), cost({ snow: 1 }));
    expect(plan.taps.map((t) => t.permanentId)).toEqual(["sf1"]);
  });

  it("⭐ the stamp: a creature's {T} line and a cost that taps a creature carry tapsCreatures; a line with no {T} (Wall of Roots) and a land don't", () => {
    const WALL_OF_ROOTS = card("Wall of Roots", "Creature — Plant Wall", "{1}{G}", "Defender\nPut a -0/-1 counter on this creature: Add {G}. Activate only once each turn.", { cmc: 2, colors: ["G"], keywords: ["Defender"], power: "0", toughness: "5" });
    const s = table({ user: [P("wall", WALL_OF_ROOTS), P("elves", LLANOWAR), P("f1", FOREST)] });
    const recs = manaSources(s, "user");
    expect(recs.find((r) => r.permanentId === "elves").tapsCreatures).toEqual(["elves"]);
    expect(recs.find((r) => r.permanentId === "wall").tapsCreatures).toBeUndefined();
    expect(recs.find((r) => r.permanentId === "f1").tapsCreatures).toBeUndefined();
  });
});

describe("controls — what the sparing leaves as it was", () => {
  it("a creature that alone makes the color is tapped: Birds of Paradise pays Elite Vanguard's {W}, the Forest stays untapped", () => {
    const s = table({ user: [P("birds", BIRDS), P("f1", FOREST)], hand: [["h-van", ELITE_VANGUARD]] });
    expect(tapped(castIt(s, "h-van"))).toEqual(["birds"]);
  });

  it("every source a creature (Nature's Revolt): Grizzly Bears taps two of the animated lands in board order", () => {
    const s = table({ user: [P("revolt", NATURES_REVOLT), P("f1", FOREST), P("f2", FOREST), P("f3", FOREST)], hand: [["h-bears", BEARS]] });
    expect(["f1", "f2", "f3"].every((id) => permanentIsCreature(s, id))).toBe(true);
    expect(tapped(castIt(s, "h-bears"))).toEqual(["f1", "f2"]);
  });

  it("a restricted-line land the payment may not spend is still promoted as plain {C}: Mech Hangar pays Grizzly Bears' {1} beside a creature", () => {
    const s = table({ user: [P("elves", LLANOWAR), P("hangar", MECH_HANGAR), P("f1", FOREST)], hand: [["h-bears", BEARS]] });
    const out = castIt(s, "h-bears");
    expect(tapped(out)).toContain("hangar");
    expect(out.players.user.restrictedMana ?? []).toEqual([]);
  });

  it("a restricted-line land the payment may spend keeps its board place: Cavern of Souls (Elf) pays Elvish Visionary's {1} after the first Forest", () => {
    const s = table({ user: [P("f1", FOREST), P("cavern", CAVERN, { chosenType: "Elf" }), P("f2", FOREST), P("elves", LLANOWAR)], hand: [["h-vis", ELVISH_VISIONARY]] });
    expect(tapped(castIt(s, "h-vis"))).toEqual(["cavern", "f1"]);
  });

  it("a creature whose mana is restricted to this spell is judged as before: Codsworth, Handy Helper pays Swiftfoot Boots, the Plains stay untapped", () => {
    const CODSWORTH = card("Codsworth, Handy Helper", "Legendary Artifact Creature — Robot", "{2}{W}", "Commanders you control have ward {2}.\n{T}: Add {W}{W}. Spend this mana only to cast Aura and/or Equipment spells.\n{T}: Attach target Aura or Equipment you control to target creature you control. Activate only as a sorcery.", { cmc: 3, colors: ["W"], power: "2", toughness: "3" });
    const BOOTS = card("Swiftfoot Boots", "Artifact — Equipment", "{2}", "Equipped creature has hexproof and haste. (It can't be the target of spells or abilities your opponents control. It can attack and {T} no matter when it came under your control.)\nEquip {1} ({1}: Attach to target creature you control. Equip only as a sorcery.)", { cmc: 2, keywords: ["Equip"] });
    const s = table({ user: [P("cods", CODSWORTH), P("p1", PLAINS), P("p2", PLAINS)], hand: [["h-boots", BOOTS]] });
    expect(manaSources(s, "user").find((r) => r.permanentId === "cods")?.restriction).toBeTruthy();
    expect(tapped(castIt(s, "h-boots"))).toEqual(["cods"]);
  });

  it("affordability pin: Llanowar Elves, Breeding Pool and two Islands pay {G}{U}{U}{U} only with the Elves — the sparing plan (it runs: a Plains is left) pays nothing, the plan that taps the Elves stands", () => {
    const s = table({ user: [P("elves", LLANOWAR), P("pool", BREEDING_POOL), P("i1", ISLAND), P("i2", ISLAND), P("p1", PLAINS)] });
    const sources = manaSources(s, "user");
    const c = cost({ G: 1, U: 3 });
    expect(canAfford(s.players.user.manaPool, sources, c)).toBe(true);
    const plan = planPayment(s.players.user.manaPool, sources, c);
    expect(plan).not.toBeNull();
    expect(plan.taps.map((t) => t.permanentId).sort()).toEqual(["elves", "i1", "i2", "pool"]);
  });
});

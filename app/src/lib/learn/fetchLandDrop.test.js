/**
 * fetchLandDrop.test.js — the AI's land drop reads a fetch land as what it fetches, and every land search the AI makes for
 * itself takes the colour the hand needs (2026-10-17).
 *
 * The land drop (opponentAI.pickLandAction) read every fetch land as an UNTAPPED land that makes no colour: Evolving Wilds,
 * which delivers a TAPPED basic, was played ahead of an untapped dual on a turn the dual's mana cast a spell; a fetch under the
 * life floor (never cracked) or with nothing left to find was played as if it made mana; the colour a fetch could find never
 * counted. And the SNC family land (Riveteers Overlook — it sacrifices itself on entering and fetches a basic TAPPED) was
 * deliberately not read as tapped, because the uncracked fetches it would then lose to were read as untapped.
 *
 * The reading, an AI choice among the offered land drops (the engine's offer and resolution are unchanged):
 *   · an activated fetch land yields the land its search would take (the same order the search itself uses): untapped only when
 *     the search delivers untapped AND that land does not enter tapped by its own text; it counts the colours of every land it
 *     can find in the library toward the colour gap; under the life floor (10) or with no findable land it yields nothing;
 *   · an SNC family land yields a TAPPED basic of a type the library still holds — nothing when it holds none;
 *   · the comparison: a land whose untapped mana brings a card in hand or the command zone into reach THIS turn first; then the
 *     land that fills a colour gap; then untapped; then a land that makes mana at all; then the name.
 *
 * The search (runProgram.autoPickTutorCandidate): every search for a LAND card (each filter group names a land) takes the land
 * that makes the colour the hand and command zone need most — Rampant Growth, Cultivate, Kodama's Reach, Farseek, Sakura-Tribe
 * Elder, the SNC family's enters trigger — where it used to take the highest mana value, then the alphabetically first name.
 * Every other search keeps that old order.
 *
 * Oracle text copied from the bundled Scryfall snapshot (oracle_cards.json, read 2026-10-17).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack, flushTriggers, chooseTriggerTargets } from "./gameEngine.js";
import { autoPickTutorCandidate, resolveTutorChoice } from "./effects/runProgram.js";
import { pickAction } from "./opponentAI.js";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const land = (name, type, oracle) => ({ name, type, mana: "", cmc: 0, colors: [], keywords: [], oracle });
const EVOLVING_WILDS = land("Evolving Wilds", "Land", "{T}, Sacrifice this land: Search your library for a basic land card, put it onto the battlefield tapped, then shuffle.");
const MISTY_RAINFOREST = land("Misty Rainforest", "Land", "{T}, Pay 1 life, Sacrifice this land: Search your library for a Forest or Island card, put it onto the battlefield, then shuffle.");
const POLLUTED_DELTA = land("Polluted Delta", "Land", "{T}, Pay 1 life, Sacrifice this land: Search your library for an Island or Swamp card, put it onto the battlefield, then shuffle.");
const BLOODSTAINED_MIRE = land("Bloodstained Mire", "Land", "{T}, Pay 1 life, Sacrifice this land: Search your library for a Swamp or Mountain card, put it onto the battlefield, then shuffle.");
const CONTAMINATED_LANDSCAPE = { ...land("Contaminated Landscape", "Land", "{T}: Add {C}.\n{T}, Sacrifice this land: Search your library for a basic Plains, Island, or Swamp card, put it onto the battlefield tapped, then shuffle.\nCycling {W}{U}{B} ({W}{U}{B}, Discard this card: Draw a card.)"), keywords: ["Cycling"] };
const RIVETEERS_OVERLOOK = land("Riveteers Overlook", "Land", "When this land enters, sacrifice it. When you do, search your library for a basic Swamp, Mountain, or Forest card, put it onto the battlefield tapped, then shuffle and you gain 1 life.");
const UNDERGROUND_SEA = land("Underground Sea", "Land — Island Swamp", "({T}: Add {U} or {B}.)");
const BADLANDS = land("Badlands", "Land — Swamp Mountain", "({T}: Add {B} or {R}.)");
const DIMIR_GUILDGATE = land("Dimir Guildgate", "Land — Gate", "This land enters tapped.\n{T}: Add {U} or {B}.");
const GOLGARI_GUILDGATE = land("Golgari Guildgate", "Land — Gate", "This land enters tapped.\n{T}: Add {B} or {G}.");
const SAVAI_TRIOME = { ...land("Savai Triome", "Land — Mountain Plains Swamp", "({T}: Add {R}, {W}, or {B}.)\nThis land enters tapped.\nCycling {3} ({3}, Discard this card: Draw a card.)"), keywords: ["Cycling"] };
const FOREST = land("Forest", "Basic Land — Forest", "({T}: Add {G}.)");
const SWAMP = land("Swamp", "Basic Land — Swamp", "({T}: Add {B}.)");
const ISLAND = land("Island", "Basic Land — Island", "({T}: Add {U}.)");
const MOUNTAIN = land("Mountain", "Basic Land — Mountain", "({T}: Add {R}.)");
const PLAINS = land("Plains", "Basic Land — Plains", "({T}: Add {W}.)");
const spell = (name, type, mana, cmc, colors, oracle, extra = {}) => ({ name, type, mana, cmc, colors, keywords: [], oracle, ...extra });
const VAMPIRE_NIGHTHAWK = { ...spell("Vampire Nighthawk", "Creature — Vampire Shaman", "{1}{B}{B}", 3, ["B"], "Flying\nDeathtouch (Any amount of damage this deals to a creature is enough to destroy it.)\nLifelink (Damage dealt by this creature also causes you to gain that much life.)", { power: "2", toughness: "3" }), keywords: ["Deathtouch", "Flying", "Lifelink"] };
const GRIZZLY_BEARS = spell("Grizzly Bears", "Creature — Bear", "{1}{G}", 2, ["G"], "", { power: "2", toughness: "2" });
const TYPHOID_RATS = { ...spell("Typhoid Rats", "Creature — Rat", "{B}", 1, ["B"], "Deathtouch (Any amount of damage this deals to a creature is enough to destroy it.)", { power: "1", toughness: "1" }), keywords: ["Deathtouch"] };
const OPT = { ...spell("Opt", "Instant", "{U}", 1, ["U"], "Scry 1. (Look at the top card of your library. You may put that card on the bottom.)\nDraw a card."), keywords: ["Scry"] };
const RAMPANT_GROWTH = spell("Rampant Growth", "Sorcery", "{1}{G}", 2, ["G"], "Search your library for a basic land card, put that card onto the battlefield tapped, then shuffle.");
const CULTIVATE = spell("Cultivate", "Sorcery", "{2}{G}", 3, ["G"], "Search your library for up to two basic land cards, reveal those cards, put one onto the battlefield tapped and the other into your hand, then shuffle.");
const KODAMAS_REACH = spell("Kodama's Reach", "Sorcery — Arcane", "{2}{G}", 3, ["G"], "Search your library for up to two basic land cards, reveal those cards, put one onto the battlefield tapped and the other into your hand, then shuffle.");
const FARSEEK = spell("Farseek", "Sorcery", "{1}{G}", 2, ["G"], "Search your library for a Plains, Island, Swamp, or Mountain card, put it onto the battlefield tapped, then shuffle.");
const DEMONIC_TUTOR = spell("Demonic Tutor", "Sorcery", "{1}{B}", 2, ["B"], "Search your library for a card, put that card into your hand, then shuffle.");
const SAKURA_TRIBE_ELDER = spell("Sakura-Tribe Elder", "Creature — Snake Shaman", "{1}{G}", 2, ["G"], "Sacrifice this creature: Search your library for a basic land card, put that card onto the battlefield tapped, then shuffle.", { power: "1", toughness: "1" });

/** The AI's precombat main with its land drop unused: `bf` = [[permId, card]] untapped and ready, `hand` / `library` = [[cardId, card]]. */
function table({ bf = [], hand = [], library = [], life = 40, landsPlayed = 0 } = {}) {
  const s0 = createGameState({ userDeck: [], aiDeck: [] });
  const P = ([id, c]) => createPermanent({ id, controller: "ai", summoningSick: false, card: { ...c, id: `c-${id}` } });
  const cards = (list) => list.map(([id, c]) => ({ ...c, id }));
  return { ...s0, turn: 4, phase: "precombat-main", step: "main", activePlayer: "ai", priorityHolder: "ai", consecutivePasses: 0, stack: [],
    players: { ...s0.players, ai: { ...s0.players.ai, life, landsPlayedThisTurn: landsPlayed, battlefield: bf.map(P), hand: cards(hand), library: cards(library) } } };
}
/** The AI's land drop: its pick among the offered play-land actions (the land drop is pickAction's first choice). */
function landDrop(s) {
  const offered = legalActionsForPlayer(s, "ai");
  expect(offered.filter((a) => a.kind === "play-land").length).toBeGreaterThan(1);
  const a = pickAction(s, "ai", offered);
  expect(a?.kind).toBe("play-land");
  return a.cardId;
}
const castable = (s, cardId) => legalActionsForPlayer(s, "ai").some((a) => a.kind === "cast-spell" && a.cardId === cardId);

describe("the land drop reads an activated fetch land as the land it fetches", () => {
  it("⭐ an untapped dual over Evolving Wilds when the dual's mana casts a spell this turn (the Wilds delivers a tapped basic)", () => {
    // Two Swamps: Vampire Nighthawk's {1}{B}{B} needs a third mana. "Evolving Wilds" was first by name.
    const s = table({ bf: [["s1", SWAMP], ["s2", SWAMP]], hand: [["wilds", EVOLVING_WILDS], ["sea", UNDERGROUND_SEA], ["h1", VAMPIRE_NIGHTHAWK]], library: [["l1", ISLAND], ["l2", SWAMP]] });
    expect(castable(s, "h1")).toBe(false);
    expect(landDrop(s)).toBe("sea");
  });

  it("⭐ Evolving Wilds over an untapped dual when it finds the colour the hand lacks and the dual's mana casts nothing", () => {
    // Grizzly Bears needs {G}: Badlands makes {B} or {R}, the Wilds finds a Forest. "Badlands" was first by name.
    const s = table({ bf: [["s1", SWAMP], ["s2", SWAMP]], hand: [["wilds", EVOLVING_WILDS], ["bad", BADLANDS], ["h1", GRIZZLY_BEARS]], library: [["l1", FOREST], ["l2", ISLAND]] });
    expect(landDrop(s)).toBe("wilds");
  });

  it("⭐ a Zendikar fetch that finds the colour the hand lacks (an untapped Island for Opt) over an untapped dual that doesn't make it", () => {
    const s = table({ bf: [["s1", SWAMP]], hand: [["misty", MISTY_RAINFOREST], ["bad", BADLANDS], ["h1", OPT]], library: [["l1", ISLAND], ["l2", FOREST]] });
    expect(landDrop(s)).toBe("misty");
  });

  it("⭐ an untapped land whose mana casts a spell now beats a tapped fetch that fills a colour gap (Underground Sea for Nighthawk over the Wilds' Forest)", () => {
    const s = table({ bf: [["s1", SWAMP], ["s2", SWAMP]], hand: [["wilds", EVOLVING_WILDS], ["sea", UNDERGROUND_SEA], ["h1", VAMPIRE_NIGHTHAWK], ["h2", GRIZZLY_BEARS]],
      library: [["l1", FOREST], ["l2", ISLAND]] });
    expect(landDrop(s)).toBe("sea");
  });

  it("⭐ a fetch under the life floor is a land that makes nothing: Dimir Guildgate over Polluted Delta at 10 life", () => {
    const s = table({ bf: [["s1", SWAMP]], hand: [["delta", POLLUTED_DELTA], ["gate", DIMIR_GUILDGATE], ["h1", OPT]], library: [["l1", ISLAND]], life: 10 });
    expect(landDrop(s)).toBe("gate");
  });

  it("⭐ Evolving Wilds with no basic left in the library is a land that makes nothing: a tapland that fills no gap beats it", () => {
    // "Evolving Wilds" is first by name, so only "makes mana at all" can put the Guildgate down.
    const s = table({ bf: [["i1", ISLAND], ["s1", SWAMP]], hand: [["wilds", EVOLVING_WILDS], ["gate", GOLGARI_GUILDGATE]], library: [["l1", UNDERGROUND_SEA], ["l2", GRIZZLY_BEARS]] });
    expect(landDrop(s)).toBe("gate");
  });

  it("⭐ a fetch whose only findable land enters tapped is read tapped: a Swamp casting Nighthawk over Bloodstained Mire (it finds only Savai Triome)", () => {
    const s = table({ bf: [["s1", SWAMP], ["s2", SWAMP]], hand: [["mire", BLOODSTAINED_MIRE], ["sw", SWAMP], ["h1", VAMPIRE_NIGHTHAWK]], library: [["l1", SAVAI_TRIOME], ["l2", FOREST]] });
    expect(landDrop(s)).toBe("sw");
  });

  it("control — an untapped dual that makes the colour the hand needs beats Evolving Wilds on both readings", () => {
    const s = table({ bf: [["f1", FOREST]], hand: [["wilds", EVOLVING_WILDS], ["sea", UNDERGROUND_SEA], ["h1", TYPHOID_RATS]], library: [["l1", SWAMP]] });
    expect(landDrop(s)).toBe("sea");
  });

  it("control — a mana-making Landscape is read as the untapped {C} land it is: Contaminated Landscape over Dimir Guildgate", () => {
    const s = table({ bf: [["f1", FOREST]], hand: [["cl", CONTAMINATED_LANDSCAPE], ["gate", DIMIR_GUILDGATE], ["h1", OPT]], library: [["l1", ISLAND]] });
    expect(landDrop(s)).toBe("cl");
  });

  it("control — with nothing to cast and no colour gap, an untapped basic still goes ahead of a tapland (the old tie order)", () => {
    const s = table({ bf: [["i1", ISLAND]], hand: [["gate", DIMIR_GUILDGATE], ["sw", SWAMP]], library: [] });
    expect(landDrop(s)).toBe("sw");
  });

  it("control — policy { land: \"v1\" } keeps the legacy alphabetical pick", () => {
    const s = table({ bf: [["s1", SWAMP], ["s2", SWAMP]], hand: [["wilds", EVOLVING_WILDS], ["sea", UNDERGROUND_SEA], ["h1", VAMPIRE_NIGHTHAWK]], library: [["l1", ISLAND]] });
    const a = pickAction(s, "ai", legalActionsForPlayer(s, "ai"), { policy: { land: "v1" } });
    expect(a.cardId).toBe("wilds");
  });
});

describe("the land drop reads an SNC family land as the TAPPED basic it fetches", () => {
  it("⭐ an untapped land whose mana casts a spell now beats Riveteers Overlook (it becomes a tapped basic)", () => {
    const s = table({ bf: [["s1", SWAMP], ["s2", SWAMP]], hand: [["over", RIVETEERS_OVERLOOK], ["sea", UNDERGROUND_SEA], ["h1", VAMPIRE_NIGHTHAWK]], library: [["l1", FOREST], ["l2", SWAMP]] });
    expect(landDrop(s)).toBe("sea");
  });

  it("⭐ Dimir Guildgate (the colour the hand needs) over Riveteers Overlook (a tapped Forest) — both tapped, the gap decides", () => {
    const s = table({ bf: [["f1", FOREST]], hand: [["gate", DIMIR_GUILDGATE], ["over", RIVETEERS_OVERLOOK], ["h1", { ...OPT, mana: "{1}{U}", cmc: 2 }]], library: [["l1", FOREST]] });
    expect(landDrop(s)).toBe("gate");
  });

  it("⭐ with no basic Swamp, Mountain or Forest left in the library the Overlook finds nothing: the Island goes down", () => {
    const s = table({ bf: [], hand: [["over", RIVETEERS_OVERLOOK], ["isl", ISLAND], ["h1", { ...TYPHOID_RATS, mana: "{1}{B}", cmc: 2 }]], library: [["l1", ISLAND], ["l2", PLAINS]] });
    expect(landDrop(s)).toBe("isl");
  });

  it("⭐ with nothing to cast and no colour gap, an untapped Swamp over Riveteers Overlook (a tapped basic) — the Overlook was first by name", () => {
    const s = table({ bf: [["s1", SWAMP]], hand: [["over", RIVETEERS_OVERLOOK], ["sw", SWAMP]], library: [["l1", FOREST], ["l2", SWAMP]] });
    expect(landDrop(s)).toBe("sw");
  });

  it("control — the Overlook (a tapped Swamp) over an Island when the hand needs {B} and the Island's mana casts nothing", () => {
    const s = table({ bf: [], hand: [["over", RIVETEERS_OVERLOOK], ["isl", ISLAND], ["h1", { ...TYPHOID_RATS, mana: "{1}{B}", cmc: 2 }]], library: [["l1", SWAMP], ["l2", FOREST]] });
    expect(landDrop(s)).toBe("over");
  });
});

/** Cast `cardId` from hand and resolve it to its search; returns the paused state. */
function castToSearch(s, cardId) {
  const cast = legalActionsForPlayer(s, "ai").find((a) => a.kind === "cast-spell" && a.cardId === cardId);
  expect(cast).toBeTruthy();
  const n = resolveTopOfStack(dispatchAction(s, cast));
  expect(n.pendingChoice?.kind).toBe("tutor-search");
  return n;
}
const nameOf = (s, id) => s.players.ai.library.find((c) => c.id === id)?.name;

describe("every land search the AI makes for itself takes the colour the hand needs", () => {
  it("⭐ Rampant Growth takes the Swamp Vampire Nighthawk needs, not the alphabetically first Forest", () => {
    const s = table({ bf: [["f1", FOREST], ["f2", FOREST]], hand: [["rg", RAMPANT_GROWTH], ["h1", VAMPIRE_NIGHTHAWK]], landsPlayed: 1,
      library: [["l1", FOREST], ["l2", ISLAND], ["l3", SWAMP]] });
    const n = castToSearch(s, "rg");
    expect(nameOf(n, autoPickTutorCandidate(n, n.pendingChoice))).toBe("Swamp");
  });

  for (const [label, card] of [["Cultivate", CULTIVATE], ["Kodama's Reach", KODAMAS_REACH]]) {
    it(`⭐ ${label} puts the most-needed colour onto the battlefield (a Swamp for {B}{B}) and the next need into the hand (an Island for Opt)`, () => {
      const s = table({ bf: [["f1", FOREST], ["f2", FOREST], ["f3", FOREST]], hand: [["cv", card], ["h1", VAMPIRE_NIGHTHAWK], ["h2", OPT]], landsPlayed: 1,
        library: [["l1", FOREST], ["l2", ISLAND], ["l3", MOUNTAIN], ["l4", SWAMP]] });
      let n = castToSearch(s, "cv");
      const first = autoPickTutorCandidate(n, n.pendingChoice);
      expect(nameOf(n, first)).toBe("Swamp");
      n = resolveTutorChoice(n, first);
      expect(n.pendingChoice?.kind).toBe("tutor-search");
      const second = autoPickTutorCandidate(n, n.pendingChoice);
      expect(nameOf(n, second)).toBe("Island");
      n = resolveTutorChoice(n, second);
      expect(n.players.ai.battlefield.some((p) => p.card.name === "Swamp" && p.tapped)).toBe(true);
      expect(n.players.ai.hand.map((c) => c.name)).toContain("Island");
    });
  }

  it("⭐ Farseek takes Underground Sea (both unmet colours) over the alphabetically first Island", () => {
    const s = table({ bf: [["f1", FOREST], ["f2", FOREST]], hand: [["fs", FARSEEK], ["h1", OPT], ["h2", TYPHOID_RATS]], landsPlayed: 1,
      library: [["l1", ISLAND], ["l2", SWAMP], ["l3", UNDERGROUND_SEA], ["l4", PLAINS]] });
    const n = castToSearch(s, "fs");
    expect(nameOf(n, autoPickTutorCandidate(n, n.pendingChoice))).toBe("Underground Sea");
  });

  it("⭐ Sakura-Tribe Elder's sacrifice search takes the Swamp Typhoid Rats needs", () => {
    const s = table({ bf: [["ste", SAKURA_TRIBE_ELDER], ["f1", FOREST]], hand: [["h1", TYPHOID_RATS]], landsPlayed: 1,
      library: [["l1", FOREST], ["l2", MOUNTAIN], ["l3", SWAMP]] });
    const act = legalActionsForPlayer(s, "ai").find((a) => a.kind === "activate-ability" && a.permanentId === "ste" && a.sacSelf);
    expect(act).toBeTruthy();
    const n = resolveTopOfStack(dispatchAction(s, act));
    expect(n.pendingChoice?.kind).toBe("tutor-search");
    expect(nameOf(n, autoPickTutorCandidate(n, n.pendingChoice))).toBe("Swamp");
  });

  it("⭐ Riveteers Overlook's enters-trigger search takes the Swamp the hand needs, not the alphabetically first Forest", () => {
    let s = table({ bf: [["f1", FOREST]], hand: [["over", RIVETEERS_OVERLOOK], ["h1", TYPHOID_RATS]], library: [["l1", FOREST], ["l2", MOUNTAIN], ["l3", SWAMP]] });
    s = dispatchAction(s, { kind: "play-land", playerId: "ai", cardId: "over" });
    s = flushTriggers(s, { chooseTargets: chooseTriggerTargets });
    let guard = 0;
    while ((s.stack || []).length && !s.pendingChoice && guard++ < 6) s = resolveTopOfStack(s);
    expect(s.pendingChoice?.kind).toBe("tutor-search");
    expect(nameOf(s, autoPickTutorCandidate(s, s.pendingChoice))).toBe("Swamp");
  });

  it("control — a search that is not for a land keeps the old order: Demonic Tutor takes the highest mana value though the hand needs {B}", () => {
    const s = table({ bf: [["s1", SWAMP], ["f1", FOREST]], hand: [["dt", DEMONIC_TUTOR], ["h1", { ...VAMPIRE_NIGHTHAWK, mana: "{B}{B}{B}" }]], landsPlayed: 1,
      library: [["l1", SWAMP], ["l2", GRIZZLY_BEARS], ["l3", VAMPIRE_NIGHTHAWK]] });
    const n = castToSearch(s, "dt");
    expect(nameOf(n, autoPickTutorCandidate(n, n.pendingChoice))).toBe("Vampire Nighthawk");
  });

  it("control — a search whose filter names a land in only one of its alternatives (\"a creature or land card\") keeps the old order", () => {
    const s = table({ bf: [["f1", FOREST]], hand: [["h1", TYPHOID_RATS]], library: [["l1", FOREST], ["l2", SWAMP]] });
    const pc = { kind: "tutor-search", controller: "ai", candidates: [{ id: "l1", name: "Forest" }, { id: "l2", name: "Swamp" }], filter: { groups: [["creature"], ["land"]] }, destination: "hand", remaining: 1 };
    expect(autoPickTutorCandidate(s, pc)).toBe("l1");
  });

  it("control — a land put from the HAND (the same choice kind, but no search — Growth Spiral, Uro) keeps the old order", () => {
    const s = table({ bf: [["f1", FOREST]], hand: [["h1", TYPHOID_RATS], ["c1", FOREST], ["c2", SWAMP]] });
    const pc = { kind: "tutor-search", controller: "ai", candidates: [{ id: "c1", name: "Forest" }, { id: "c2", name: "Swamp" }], filter: { groups: [["land"]] }, sourceZone: "hand", destination: "battlefield", remaining: 1 };
    expect(autoPickTutorCandidate(s, pc)).toBe("c1");
  });

  it("control — a land search to the graveyard keeps the old order (its colour is not what it is for)", () => {
    const s = table({ bf: [["f1", FOREST]], hand: [["h1", TYPHOID_RATS]], library: [["l1", FOREST], ["l2", SWAMP]] });
    const pc = { kind: "tutor-search", controller: "ai", candidates: [{ id: "l1", name: "Forest" }, { id: "l2", name: "Swamp" }], filter: { groups: [["land"]] }, sourceZone: "library", destination: "graveyard", remaining: 1 };
    expect(autoPickTutorCandidate(s, pc)).toBe("l1");
  });

  it("control — with an empty hand nothing is asked for, and Rampant Growth's old order stands (the Forest)", () => {
    const s = table({ bf: [["f1", FOREST], ["f2", FOREST]], hand: [["rg", RAMPANT_GROWTH]], landsPlayed: 1, library: [["l1", SWAMP], ["l2", FOREST], ["l3", ISLAND]] });
    const n = castToSearch(s, "rg");
    expect(nameOf(n, autoPickTutorCandidate(n, n.pendingChoice))).toBe("Forest");
  });
});

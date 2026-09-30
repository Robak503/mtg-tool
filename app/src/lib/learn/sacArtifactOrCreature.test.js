/**
 * sacArtifactOrCreature.test.js — "Sacrifice [another] artifact or creature" as an ACTIVATED-ability cost: Dockside Chef, Kingpin's
 * Enforcers ("{1}{B}, Sacrifice an artifact or creature: Draw a card."), Bartolomé del Presidio and Hammerhead, Maggia Boss
 * ("Sacrifice another creature or artifact: Put a +1/+1 counter on ~.") — the 09-06 plan's stage ③, census rows ㉖ and ㉗
 * (2026-09-30).
 *
 * The cast lane has read this union since Deadly Dispute (castModifiers' SAC_TYPE_CANON → "artifactOrCreature", evaluated by
 * legalChoices' sacTypeMatches). The activated lane kept its OWN copy of the union map and it had drifted: it never learned
 * either ordering, so all four parked — the drift sacUnionCost.test.js's one-evaluator contract warns about. The activated lane
 * reads castModifiers' map now, and its sacrifice regex takes both orderings.
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-09-30); each activation offered by legalActionsForPlayer and paid for real.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { parseActivatedAbilities } from "./effects/abilities.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const BARTOLOME = { name: "Bartolomé del Presidio", type: "Legendary Creature — Vampire Knight", mana: "{W}{B}", power: "2", toughness: "1", keywords: [],
  oracle: "Sacrifice another creature or artifact: Put a +1/+1 counter on Bartolomé del Presidio." };
const HAMMERHEAD = { name: "Hammerhead, Maggia Boss", type: "Legendary Creature — Human Rogue Villain", mana: "{1}{B}", power: "2", toughness: "1", keywords: [],
  oracle: "Sacrifice another creature or artifact: Put a +1/+1 counter on Hammerhead." };
const CHEF = { name: "Dockside Chef", type: "Enchantment Creature — Human Citizen", mana: "{B}", power: "1", toughness: "2", keywords: [],
  oracle: "{1}{B}, Sacrifice an artifact or creature: Draw a card." };
const ENFORCERS = { name: "Kingpin's Enforcers", type: "Creature — Human Villain", mana: "{2}{B}", power: "2", toughness: "3", keywords: ["Lifelink"],
  oracle: "Lifelink\n{2}{B}, Sacrifice an artifact or creature: Draw a card." };
const TREASURE = { name: "Treasure", type: "Token Artifact — Treasure", token: true, oracle: "{T}, Sacrifice this token: Add one mana of any color." };
const BEARS = { name: "Grizzly Bears", type: "Creature — Bear", mana: "{1}{G}", power: "2", toughness: "2", oracle: "" };
const SWAMP = { name: "Swamp", type: "Basic Land — Swamp", oracle: "({T}: Add {B}.)" };

const EMPTY = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };
const perm = (card, id) => createPermanent({ id, card: { ...card, id: `c-${id}` }, controller: "user", summoningSick: false });
function board(battlefield, pool = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return { ...s, turn: 4, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", stack: [], pendingTriggers: [],
    players: { ...s.players, user: { ...s.players.user, battlefield, manaPool: { ...EMPTY, ...pool },
      library: [{ id: "lib0", name: "Library Card", type: "Sorcery", oracle: "" }], hand: [] } } };
}
const offersFor = (s, sourceId) => legalActionsForPlayer(s, "user").filter((a) => a.kind === "activate-ability" && a.permanentId === sourceId);
const victimsOf = (offers) => offers.map((a) => a.sacCreatureId).sort();
const resolve = (s0) => { let s = s0; for (let i = 0; i < 6 && (s.stack || []).length; i++) s = resolveTopOfStack(s); return s; };

describe("parse + classification", () => {
  it("both orderings parse to the one canonical union key; \"another\" is kept", () => {
    expect(parseActivatedAbilities(BARTOLOME)[0].sacOther).toEqual({ type: "artifactOrCreature", another: true });
    expect(parseActivatedAbilities(CHEF)[0].sacOther).toEqual({ type: "artifactOrCreature", another: false });
  });
  it("all four flip native", () => {
    for (const card of [BARTOLOME, HAMMERHEAD, CHEF, ENFORCERS]) expect(classifyCard(card)).toMatch(/^native-/);
  });
});

describe("RUNTIME — the victim is an artifact or a creature, paid for real", () => {
  it("VACUITY CONTROL — Bartolomé beside only a Swamp: nothing to sacrifice, nothing offered", () => {
    expect(offersFor(board([perm(BARTOLOME, "bart"), perm(SWAMP, "sw")]), "bart")).toEqual([]);
  });

  it("⭐ Bartolomé offers the Treasure and the Bears — never the Swamp, never itself (\"another\")", () => {
    const victims = victimsOf(offersFor(board([perm(BARTOLOME, "bart"), perm(TREASURE, "tr"), perm(BEARS, "bb"), perm(SWAMP, "sw")]), "bart"));
    expect(victims).toEqual(["bb", "tr"]);
    console.log(`WITNESS bartolomeVictims ${JSON.stringify(victims)}`);
  });

  it("⭐ Bartolomé sacrifices the Treasure: the token is gone and Bartolomé has a +1/+1 counter", () => {
    const s0 = board([perm(BARTOLOME, "bart"), perm(TREASURE, "tr")]);
    const act = offersFor(s0, "bart").find((a) => a.sacCreatureId === "tr");
    const s = resolve(dispatchAction(s0, act));
    const bart = s.players.user.battlefield.find((p) => p.id === "bart");
    expect({ treasure: s.players.user.battlefield.some((p) => p.id === "tr"), counters: bart?.counters?.["+1/+1"] ?? 0 }).toEqual({ treasure: false, counters: 1 });
  });

  it("⭐ Hammerhead's short name reads the same way: sacrificing the Bears puts a counter on Hammerhead", () => {
    const s0 = board([perm(HAMMERHEAD, "ham"), perm(BEARS, "bb")]);
    const act = offersFor(s0, "ham").find((a) => a.sacCreatureId === "bb");
    expect(act).toBeDefined();
    const s = resolve(dispatchAction(s0, act));
    expect(s.players.user.battlefield.find((p) => p.id === "ham")?.counters?.["+1/+1"] ?? 0).toBe(1);
    expect(s.players.user.graveyard.map((c) => c.name)).toContain("Grizzly Bears");
  });

  it("⭐ Dockside Chef: {1}{B} and a Treasure draw a card; the Chef may be its own victim (\"an\", not \"another\")", () => {
    const s0 = board([perm(CHEF, "chef"), perm(TREASURE, "tr"), perm(SWAMP, "sw")], { B: 1, C: 1 });
    const offers = offersFor(s0, "chef");
    expect(victimsOf(offers)).toEqual(["chef", "tr"]);
    const s = resolve(dispatchAction(s0, offers.find((a) => a.sacCreatureId === "tr")));
    expect({ hand: s.players.user.hand.length, library: s.players.user.library.length, treasure: s.players.user.battlefield.some((p) => p.id === "tr"), pool: s.players.user.manaPool })
      .toEqual({ hand: 1, library: 0, treasure: false, pool: EMPTY });
  });

  it("Kingpin's Enforcers without the {2}{B}: not offered, however many victims", () => {
    expect(offersFor(board([perm(ENFORCERS, "enf"), perm(TREASURE, "tr"), perm(BEARS, "bb")], { B: 1 }), "enf")).toEqual([]);
    expect(offersFor(board([perm(ENFORCERS, "enf"), perm(TREASURE, "tr")], { B: 1, C: 2 }), "enf").length).toBeGreaterThan(0);
  });
});

const CARRIERS = [ // all eighteen carriers of the union cost — real oracle, generated from the bundled Scryfall data 2026-09-30
  {"name":"Acolyte of Aclazotz","type":"Creature — Vampire Cleric","mana":"{2}{B}","power":"1","toughness":"4","keywords":[],"oracle":"{T}, Sacrifice another creature or artifact: Each opponent loses 1 life and you gain 1 life."},
  {"name":"Ahriman","type":"Creature — Eye Horror","mana":"{2}{B}","power":"2","toughness":"2","keywords":["Deathtouch","Flying"],"oracle":"Flying, deathtouch\n{3}, Sacrifice another creature or artifact: Draw a card."},
  {"name":"Baron Bertram Graywater","type":"Legendary Creature — Vampire Noble","mana":"{2}{W}{B}","power":"3","toughness":"4","keywords":[],"oracle":"Whenever one or more tokens you control enter, create a 1/1 black Vampire Rogue creature token with lifelink. This ability triggers only once each turn.\n{1}{B}, Sacrifice another creature or artifact: Draw a card."},
  {"name":"Bartolomé del Presidio","type":"Legendary Creature — Vampire Knight","mana":"{W}{B}","power":"2","toughness":"1","keywords":[],"oracle":"Sacrifice another creature or artifact: Put a +1/+1 counter on Bartolomé del Presidio."},
  {"name":"Cutthroat Centurion","type":"Artifact Creature — Phyrexian Warrior","mana":"{2}{B}","power":"2","toughness":"2","keywords":[],"oracle":"Sacrifice another artifact or creature: This creature gets +2/+2 until end of turn. Activate only once each turn."},
  {"name":"Defiant Salvager","type":"Creature — Aetherborn Artificer","mana":"{2}{B}","power":"2","toughness":"2","keywords":[],"oracle":"Sacrifice an artifact or creature: Put a +1/+1 counter on this creature. Activate only as a sorcery."},
  {"name":"Dockside Chef","type":"Enchantment Creature — Human Citizen","mana":"{B}","power":"1","toughness":"2","keywords":[],"oracle":"{1}{B}, Sacrifice an artifact or creature: Draw a card."},
  {"name":"Dreg Recycler","type":"Creature — Phyrexian Beast","mana":"{1}{B}","power":"2","toughness":"2","keywords":[],"oracle":"{T}, Sacrifice an artifact or creature: Each opponent loses 1 life and you gain 1 life."},
  {"name":"Hammerhead, Maggia Boss","type":"Legendary Creature — Human Rogue Villain","mana":"{1}{B}","power":"2","toughness":"1","keywords":[],"oracle":"Sacrifice another creature or artifact: Put a +1/+1 counter on Hammerhead."},
  {"name":"Kingpin's Enforcers","type":"Creature — Human Villain","mana":"{2}{B}","power":"2","toughness":"3","keywords":["Lifelink"],"oracle":"Lifelink\n{2}{B}, Sacrifice an artifact or creature: Draw a card."},
  {"name":"Laurine, the Diversion","type":"Legendary Creature — Human Rogue","mana":"{2}{R}","power":"3","toughness":"3","keywords":["Partner with","Goad","First strike","Partner"],"oracle":"Partner with Kamber, the Plunderer (When this creature enters, target player may put Kamber into their hand from their library, then shuffle.)\nFirst strike\n{2}, Sacrifice an artifact or creature: Goad target creature. (Until your next turn, that creature attacks each combat if able and attacks a player other than you if able.)"},
  {"name":"Makeshift Munitions","type":"Enchantment","mana":"{1}{R}","keywords":[],"oracle":"{1}, Sacrifice an artifact or creature: This enchantment deals 1 damage to any target."},
  {"name":"Old Flitterfang","type":"Legendary Creature — Rat Faerie","mana":"{4}{B}","power":"3","toughness":"4","keywords":["Flying","Food"],"oracle":"Flying\nAt the beginning of each end step, if a creature died this turn, create a Food token. (It's an artifact with \"{2}, {T}, Sacrifice this token: You gain 3 life.\")\n{2}{B}, Sacrifice another creature or artifact: Old Flitterfang gets +2/+2 until end of turn."},
  {"name":"Stormclaw Rager","type":"Creature — Ogre Warrior","mana":"{1}{B}{R}","power":"2","toughness":"2","keywords":[],"oracle":"{1}, Sacrifice another creature or artifact: Put a +1/+1 counter on this creature and draw a card. Activate only as a sorcery."},
  {"name":"Thraxodemon","type":"Creature — Demon","mana":"{1}{B}","power":"2","toughness":"2","keywords":[],"oracle":"{3}, {T}, Sacrifice another creature or artifact: Draw a card."},
  {"name":"Umbral Collar Zealot","type":"Creature — Human Cleric","mana":"{1}{B}","power":"3","toughness":"2","keywords":["Surveil"],"oracle":"Sacrifice another creature or artifact: Surveil 1. (Look at the top card of your library. You may put it into your graveyard.)"},
  {"name":"Vito's Inquisitor","type":"Creature — Vampire Knight","mana":"{3}{B}","power":"3","toughness":"3","keywords":[],"oracle":"{B}, Sacrifice another creature or artifact: Put a +1/+1 counter on this creature. It gains menace until end of turn."},
  {"name":"Warehouse Thief","type":"Creature — Tiefling Rogue","mana":"{3}{R}","power":"4","toughness":"2","keywords":[],"oracle":"{2}, {T}, Sacrifice an artifact or creature: Exile the top card of your library. Until the end of your next turn, you may play that card."},
];

// Every card the flip-diff moved (the four above + fourteen more carrying the same cost), each offered, paid with a real victim and
// resolved: the off-union Swamp is never offered; the Treasure and the Bears always are; the source is its own victim exactly
// when the wording allows it ("an", not "another", on an artifact or creature). A resolve error or unresolved spell is a failure.
describe("RUNTIME — every carrier the flip-diff moved, each paid and resolved for real", () => {
  const OPP = { id: "c-opp", name: "Hill Giant", type: "Creature — Giant", mana: "{3}{R}", power: "3", toughness: "3", oracle: "" };
  for (const card of CARRIERS) {
    it(`${card.name}: an artifact-or-creature victim is offered, paid and resolved`, () => {
      const another = /sacrifice another/i.test(card.oracle);
      const selfEligible = !another && /\b(?:Creature|Artifact)\b/.test(card.type);
      const s0 = board([perm(card, "src"), perm(TREASURE, "tr"), perm(BEARS, "bb"), perm(SWAMP, "sw")], { W: 3, U: 3, B: 3, R: 3, G: 3, C: 3 });
      const s = { ...s0, players: { ...s0.players, ai: { ...s0.players.ai, battlefield: [createPermanent({ id: "opp", card: OPP, controller: "ai", summoningSick: false })] } } };
      const offers = offersFor(s, "src");
      const victims = [...new Set(victimsOf(offers))];
      expect(victims).not.toContain("sw");
      expect(victims).toEqual(expect.arrayContaining(["bb", "tr"]));
      expect(victims.includes("src")).toBe(selfEligible);
      const out = resolve(dispatchAction(s, offers.find((a) => a.sacCreatureId === "tr")));
      expect(out.players.user.battlefield.some((p) => p.id === "tr")).toBe(false);
      expect((out.log || []).filter((e) => /^(?:stack-resolve-error|spell-unresolved)$/.test(e.kind || ""))).toEqual([]);
    });
  }
});

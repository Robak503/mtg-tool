/**
 * auraEquipmentCostReducer.test.js — the play-weighted program, #795 Danitha Capashen, Paragon.
 *
 *   "First strike, vigilance, lifelink
 *    Aura and Equipment spells you cast cost {1} less to cast."
 *
 * "<A> and <B> spells you cast cost {N} less to cast" was read only where A and B are card types and one is instant or sorcery
 * (two reducers over disjoint sets — Goblin Electromancer). Any other pair was consumed and dropped, so Danitha's line was
 * residue. Now a pair of admissible words that is not provably disjoint (two subtypes — Aura and Equipment, Equipment and
 * Vehicle — or two permanent card types, Artifact and enchantment) is ONE union reducer: a spell that is either is reduced, and
 * reduced once (CR 601.2f; the mana value is untouched, CR 202.3). Two guards ride the reader:
 *   · a changeling spell is every CREATURE type (CR 702.73a), never an Aura or an Equipment — the union's every-creature-type
 *     shortcut now holds only for a creature-type word;
 *   · a spell cast bestowed is an Aura enchantment spell (CR 702.103b) whose old card types and creature subtypes are gone
 *     (CR 205.1a), so an Aura reducer reduces the bestow cast, a creature reducer no longer does, and a noncreature tax
 *     (Thalia) taxes it.
 *
 * Real oracle fixtures (bundled Scryfall via cardIndex.publicCard, 2026-10-17; the trailing comment is the tier BEFORE this
 * slice). Every runtime case reads the costs the engine's own cast offer carries (legalActionsForPlayer).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard, isNativeTier } from "./coverage.js";
import { parseStaticAbilities } from "./staticAbilityParser.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { passPriority } from "./gameEngine.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

// ── real card fixtures (bundled Scryfall, cardIndex.publicCard) ──
const DANITHA = {"name":"Danitha Capashen, Paragon","type":"Legendary Creature — Human Knight","mana":"{2}{W}","cmc":3,"power":"2","toughness":"2","keywords":["Lifelink","Vigilance","First strike"],"colors":["W"],"oracle":"First strike, vigilance, lifelink\nAura and Equipment spells you cast cost {1} less to cast."}; // body-only #795
const COURSER = {"name":"Starnheim Courser","type":"Creature — Pegasus","mana":"{2}{W}","cmc":3,"power":"2","toughness":"2","keywords":["Flying"],"colors":["W"],"oracle":"Flying\nArtifact and enchantment spells you cast cost {1} less to cast."}; // body-only #2982
const CID = {"name":"Cid, Freeflier Pilot","type":"Legendary Creature — Human Warrior Pilot","mana":"{1}{W}","cmc":2,"power":"2","toughness":"2","keywords":["Jump"],"colors":["W"],"oracle":"Equipment and Vehicle spells you cast cost {1} less to cast.\nJump — During your turn, Cid has flying.\n{2}, {T}: Return target Equipment or Vehicle card from your graveyard to your hand."}; // body-only #2588
const ENVOY = {"name":"Transcendent Envoy","type":"Enchantment Creature — Griffin","mana":"{1}{W}","cmc":2,"power":"1","toughness":"2","keywords":["Flying"],"colors":["W"],"oracle":"Flying\nAura spells you cast cost {1} less to cast."}; // native-static
const RAPTOR = {"name":"Marauding Raptor","type":"Creature — Dinosaur","mana":"{1}{R}","cmc":2,"power":"2","toughness":"3","keywords":[],"colors":["R"],"oracle":"Creature spells you cast cost {1} less to cast.\nWhenever another creature you control enters, this creature deals 2 damage to it. If a Dinosaur is dealt damage this way, this creature gets +2/+0 until end of turn."}; // native-mixed
const THALIA = {"name":"Thalia, Guardian of Thraben","type":"Legendary Creature — Human Soldier","mana":"{1}{W}","cmc":2,"power":"2","toughness":"1","keywords":["First strike"],"colors":["W"],"oracle":"First strike\nNoncreature spells cost {1} more to cast."}; // native-static
const ELECTROMANCER = {"name":"Goblin Electromancer","type":"Creature — Goblin Wizard","mana":"{U}{R}","cmc":2,"power":"2","toughness":"2","keywords":[],"colors":["R","U"],"oracle":"Instant and sorcery spells you cast cost {1} less to cast."}; // native-static
const BANNERET = {"name":"Stonybrook Banneret","type":"Creature — Merfolk Wizard","mana":"{1}{U}","cmc":2,"power":"1","toughness":"1","keywords":["Landwalk","Islandwalk"],"colors":["U"],"oracle":"Islandwalk (This creature can't be blocked as long as defending player controls an Island.)\nMerfolk spells and Wizard spells you cast cost {1} less to cast."}; // native-static
const PACIFISM = {"name":"Pacifism","type":"Enchantment — Aura","mana":"{1}{W}","cmc":2,"keywords":["Enchant"],"colors":["W"],"oracle":"Enchant creature\nEnchanted creature can't attack or block."}; // native-aura
const BONESPLITTER = {"name":"Bonesplitter","type":"Artifact — Equipment","mana":"{1}","cmc":1,"keywords":["Equip"],"colors":[],"oracle":"Equipped creature gets +2/+0.\nEquip {1}"}; // native-equipment
const WOLF = {"name":"Nyxborn Wolf","type":"Enchantment Creature — Wolf","mana":"{2}{G}","cmc":3,"power":"3","toughness":"1","keywords":["Bestow"],"colors":["G"],"oracle":"Bestow {4}{G} (If you cast this card for its bestow cost, it's an Aura spell with enchant creature. It becomes a creature again if it's not attached.)\nEnchanted creature gets +3/+1."}; // native-aura
const AUTOMATON = {"name":"Universal Automaton","type":"Artifact Creature — Shapeshifter","mana":"{1}","cmc":1,"power":"1","toughness":"1","keywords":["Changeling"],"colors":[],"oracle":"Changeling (This card is every creature type.)"}; // native-body
const BEARS = {"name":"Grizzly Bears","type":"Creature — Bear","mana":"{1}{G}","cmc":2,"power":"2","toughness":"2","keywords":[],"colors":["G"],"oracle":""}; // native-body
const SOL_RING = {"name":"Sol Ring","type":"Artifact","mana":"{1}","cmc":1,"keywords":[],"colors":[],"oracle":"{T}: Add {C}{C}."}; // native-mana
const PLAINS = {"name":"Plains","type":"Basic Land — Plains","mana":"","cmc":0,"keywords":[],"colors":[],"oracle":"({T}: Add {W}.)"}; // land
const FOREST = {"name":"Forest","type":"Basic Land — Forest","mana":"","cmc":0,"keywords":[],"colors":[],"oracle":"({T}: Add {G}.)"}; // land

const P = (id, card, controller, over = {}) => ({ ...createPermanent({ id, card: { id: `c-${id}`, ...card }, controller, summoningSick: false }), ...over });
const lands = () => [P("p1", PLAINS, "user"), P("p2", PLAINS, "user"), P("f1", FOREST, "user"), P("f2", FOREST, "user"), P("f3", FOREST, "user"), P("f4", FOREST, "user")];

function table({ user = [], ai = [], hand = [] } = {}) {
  const s0 = createGameState({ userDeck: [], aiDeck: [] });
  const players = { ...s0.players };
  for (const pid of Object.keys(players)) players[pid] = { ...players[pid], battlefield: [], hand: [], graveyard: [], library: [], life: 20 };
  players.user = { ...players.user, battlefield: user, hand };
  players.ai = { ...players.ai, battlefield: ai };
  return { ...s0, players, turn: 4, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0 };
}
/** The generic mana of every cast offer of `cardId` (bestow casts flagged), as the offer carries it. */
const genericOf = (s, cardId, { bestow = false } = {}) => {
  const offers = legalActionsForPlayer(s, "user").filter((a) => a.kind === "cast-spell" && a.cardId === cardId && !!a.bestow === bestow);
  return [...new Set(offers.map((a) => a.cost?.generic ?? null))];
};

describe("parse + classification", () => {
  it("Danitha's line is ONE union reducer over Aura and Equipment, {1}", () => {
    const reducers = parseStaticAbilities(DANITHA).filter((d) => d.costReduction).map((d) => d.costReduction);
    expect(reducers).toEqual([{ subtypes: ["Aura", "Equipment"], amount: 1 }]);
  });

  it("Danitha Capashen, Paragon and Starnheim Courser classify native", () => {
    expect(isNativeTier(classifyCard(DANITHA))).toBe(true);
    expect(isNativeTier(classifyCard(COURSER))).toBe(true);
  });

  it("control — Goblin Electromancer keeps its two disjoint reducers; Stonybrook Banneret its creature-type union", () => {
    expect(parseStaticAbilities(ELECTROMANCER).filter((d) => d.costReduction).map((d) => d.costReduction))
      .toEqual([{ subtype: "Instant", amount: 1 }, { subtype: "Sorcery", amount: 1 }]);
    expect(parseStaticAbilities(BANNERET).filter((d) => d.costReduction).map((d) => d.costReduction))
      .toEqual([{ subtypes: ["Merfolk", "Wizard"], amount: 1 }]);
  });

  it("CREED — Cid's reducer reads, but its unmodeled graveyard ability keeps the card parked", () => {
    expect(parseStaticAbilities(CID).filter((d) => d.costReduction).map((d) => d.costReduction)).toEqual([{ subtypes: ["Equipment", "Vehicle"], amount: 1 }]);
    expect(isNativeTier(classifyCard(CID))).toBe(false);
  });
});

describe("RUNTIME — the cast offer's cost", () => {
  it("⭐ with Danitha: Pacifism {1}{W} → {W}, Bonesplitter {1} → {0}; Grizzly Bears and Sol Ring are not reduced", () => {
    const s = table({ user: [P("dan", DANITHA, "user"), ...lands()], ai: [P("bear-ai", BEARS, "ai")],
      hand: [{ ...PACIFISM, id: "h-pac" }, { ...BONESPLITTER, id: "h-bone" }, { ...BEARS, id: "h-bear" }, { ...SOL_RING, id: "h-ring" }] });
    expect(genericOf(s, "h-pac")).toEqual([0]);
    expect(genericOf(s, "h-bone")).toEqual([0]);
    expect(genericOf(s, "h-bear")).toEqual([1]);
    expect(genericOf(s, "h-ring")).toEqual([1]);
  });

  it("control — without Danitha, Pacifism and Bonesplitter cost their printed generic", () => {
    const s = table({ user: lands(), ai: [P("bear-ai", BEARS, "ai")], hand: [{ ...PACIFISM, id: "h-pac" }, { ...BONESPLITTER, id: "h-bone" }] });
    expect(genericOf(s, "h-pac")).toEqual([1]);
    expect(genericOf(s, "h-bone")).toEqual([1]);
  });

  it("an opponent's Danitha reduces nothing the user casts (\"you cast\")", () => {
    const s = table({ user: lands(), ai: [P("dan", DANITHA, "ai"), P("bear-ai", BEARS, "ai")], hand: [{ ...BONESPLITTER, id: "h-bone" }] });
    expect(genericOf(s, "h-bone")).toEqual([1]);
  });

  it("a changeling is every creature type, never an Aura or an Equipment: Universal Automaton costs {1} beside Danitha", () => {
    const s = table({ user: [P("dan", DANITHA, "user"), ...lands()], hand: [{ ...AUTOMATON, id: "h-auto" }] });
    expect(genericOf(s, "h-auto")).toEqual([1]);
  });

  it("control — the creature-type union still reaches a changeling: Stonybrook Banneret takes {1} off Universal Automaton", () => {
    const s = table({ user: [P("ban", BANNERET, "user"), ...lands()], hand: [{ ...AUTOMATON, id: "h-auto" }] });
    expect(genericOf(s, "h-auto")).toEqual([0]);
  });

  it("Starnheim Courser: Sol Ring {1} → {0}, Pacifism {1}{W} → {W}; Grizzly Bears not reduced", () => {
    const s = table({ user: [P("cour", COURSER, "user"), ...lands()], ai: [P("bear-ai", BEARS, "ai")],
      hand: [{ ...SOL_RING, id: "h-ring" }, { ...PACIFISM, id: "h-pac" }, { ...BEARS, id: "h-bear" }] });
    expect(genericOf(s, "h-ring")).toEqual([0]);
    expect(genericOf(s, "h-pac")).toEqual([0]);
    expect(genericOf(s, "h-bear")).toEqual([1]);
  });

  it("the reduced Pacifism is cast and resolves onto the opposing creature, paid with one Plains", () => {
    let s = table({ user: [P("dan", DANITHA, "user"), P("p1", PLAINS, "user")], ai: [P("bear-ai", BEARS, "ai")], hand: [{ ...PACIFISM, id: "h-pac" }] });
    const cast = legalActionsForPlayer(s, "user").find((a) => a.kind === "cast-spell" && a.cardId === "h-pac" && (a.targets || []).some((t) => t.id === "bear-ai"));
    expect(cast).toBeTruthy();
    s = dispatchAction(s, cast);
    let g = 0;
    while ((s.stack.length || (s.pendingTriggers || []).length) && g++ < 50) s = passPriority(s);
    const pac = s.players.user.battlefield.find((p) => p.card?.name === "Pacifism");
    expect(pac?.attachedTo).toBe("bear-ai");
  });
});

describe("RUNTIME — a spell cast bestowed is an Aura enchantment spell (CR 702.103b)", () => {
  it("⭐ Danitha takes {1} off Nyxborn Wolf's bestow cast ({4}{G} → {3}{G}) and nothing off its creature cast ({2}{G})", () => {
    const s = table({ user: [P("dan", DANITHA, "user"), ...lands()], ai: [P("bear-ai", BEARS, "ai")], hand: [{ ...WOLF, id: "h-wolf" }] });
    expect(genericOf(s, "h-wolf", { bestow: true })).toEqual([3]);
    expect(genericOf(s, "h-wolf")).toEqual([2]);
  });

  it("Transcendent Envoy (\"Aura spells\") reduces the bestow cast too", () => {
    const s = table({ user: [P("env", ENVOY, "user"), ...lands()], ai: [P("bear-ai", BEARS, "ai")], hand: [{ ...WOLF, id: "h-wolf" }] });
    expect(genericOf(s, "h-wolf", { bestow: true })).toEqual([3]);
  });

  it("a creature reducer no longer reaches the bestow cast (it is no creature spell) but still reduces the creature cast", () => {
    const s = table({ user: [P("rap", RAPTOR, "user"), ...lands()], ai: [P("bear-ai", BEARS, "ai")], hand: [{ ...WOLF, id: "h-wolf" }] });
    expect(genericOf(s, "h-wolf", { bestow: true })).toEqual([4]);
    expect(genericOf(s, "h-wolf")).toEqual([1]);
  });

  it("Thalia's noncreature tax applies to the bestow cast ({4}{G} → {5}{G}) and not to the creature cast", () => {
    const s = table({ user: [...lands(), P("p3", PLAINS, "user")], ai: [P("thalia", THALIA, "ai"), P("bear-ai", BEARS, "ai")], hand: [{ ...WOLF, id: "h-wolf" }] });
    expect(genericOf(s, "h-wolf", { bestow: true })).toEqual([5]);
    expect(genericOf(s, "h-wolf")).toEqual([2]);
  });
});

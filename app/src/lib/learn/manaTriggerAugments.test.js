/**
 * manaTriggerAugments.test.js — the play-weighted program: triggered mana abilities (CR 605.1b) whose extra mana depends on
 * WHAT the tap made, or on the tapped land's subtype, for any player.
 *
 *   Forsaken Monument (#889)  "Whenever you tap a permanent for {C}, add an additional {C}."
 *   Caged Sun (#936)          "Whenever a land's ability causes you to add one or more mana of the chosen color, add an
 *                              additional one mana of that color."
 *   Gauntlet of Power (#2592) "Whenever a basic land is tapped for mana of the chosen color, its controller adds an additional
 *                              one mana of that color."
 *   Vernal Bloom, Gauntlet of Might  "Whenever a Forest / Mountain is tapped for mana, its controller adds an additional {G} / {R}."
 *
 * The extra mana is conditional on the colour the tap PRODUCED (Forsaken Monument's ruling: "only if it produces one or more {C}
 * as it resolves"; "If you tap a permanent for more than one {C}, you add only one additional {C}"), so the planner credits it only
 * when the tap's own mana is that colour, and the commit adds exactly what the plan priced — a plan that counts mana the commit
 * never makes is a false positive. Real oracle fixtures (bundled Scryfall via cardIndex.publicCard, 2026-10-17); the trailing
 * comment is the tier before this slice. "Test Grove" is a synthetic land ({C} or {G}) — no printed land makes exactly that.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard, isNativeTier } from "./coverage.js";
import { parseGlobalTapManaAugment } from "./staticAbilityParser.js";
import { manaSources, planPayment, canAfford, commitPaymentPlan } from "./manaModel.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { enterPermanent } from "./resolvers.js";
import { permanentPower, permanentToughness } from "./layers.js";
import { _resetIdsForTests, createGameState, createPermanent, findPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

// ── real card fixtures (bundled Scryfall, cardIndex.publicCard) ──
const MONUMENT = {"name":"Forsaken Monument","type":"Legendary Artifact","mana":"{5}","cmc":5,"keywords":[],"colors":[],"oracle":"Colorless creatures you control get +2/+2.\nWhenever you tap a permanent for {C}, add an additional {C}.\nWhenever you cast a colorless spell, you gain 2 life."}; // body-only #889
const CAGED_SUN = {"name":"Caged Sun","type":"Artifact","mana":"{6}","cmc":6,"keywords":[],"colors":[],"oracle":"As this artifact enters, choose a color.\nCreatures you control of the chosen color get +1/+1.\nWhenever a land's ability causes you to add one or more mana of the chosen color, add an additional one mana of that color."}; // body-only #936
const GAUNTLET = {"name":"Gauntlet of Power","type":"Artifact","mana":"{5}","cmc":5,"keywords":[],"colors":[],"oracle":"As this artifact enters, choose a color.\nCreatures of the chosen color get +1/+1.\nWhenever a basic land is tapped for mana of the chosen color, its controller adds an additional one mana of that color."}; // body-only #2592
const VERNAL_BLOOM = {"name":"Vernal Bloom","type":"Enchantment","mana":"{3}{G}","cmc":4,"keywords":[],"colors":["G"],"oracle":"Whenever a Forest is tapped for mana, its controller adds an additional {G}."}; // body-only #10888
const GAUNTLET_OF_MIGHT = {"name":"Gauntlet of Might","type":"Artifact","mana":"{4}","cmc":4,"keywords":[],"colors":[],"oracle":"Red creatures get +1/+1.\nWhenever a Mountain is tapped for mana, its controller adds an additional {R}."}; // body-only #12400
const SOL_RING = {"name":"Sol Ring","type":"Artifact","mana":"{1}","cmc":1,"keywords":[],"colors":[],"oracle":"{T}: Add {C}{C}."}; // native-mana
const WASTES = {"name":"Wastes","type":"Basic Land","mana":"","cmc":0,"keywords":[],"colors":[],"oracle":"{T}: Add {C}."}; // land
const FOREST = {"name":"Forest","type":"Basic Land — Forest","mana":"","cmc":0,"keywords":[],"colors":[],"oracle":"({T}: Add {G}.)"}; // land
const ISLAND = {"name":"Island","type":"Basic Land — Island","mana":"","cmc":0,"keywords":[],"colors":[],"oracle":"({T}: Add {U}.)"}; // land
const MOUNTAIN = {"name":"Mountain","type":"Basic Land — Mountain","mana":"","cmc":0,"keywords":[],"colors":[],"oracle":"({T}: Add {R}.)"}; // land
const BREEDING_POOL = {"name":"Breeding Pool","type":"Land — Forest Island","mana":"","cmc":0,"keywords":[],"colors":[],"oracle":"({T}: Add {G} or {U}.)\nAs this land enters, you may pay 2 life. If you don't, it enters tapped."}; // land
const GREAT_FURNACE = {"name":"Great Furnace","type":"Artifact Land","mana":"","cmc":0,"keywords":[],"colors":[],"oracle":"{T}: Add {R}."}; // land
const ELVES = {"name":"Llanowar Elves","type":"Creature — Elf Druid","mana":"{G}","cmc":1,"power":"1","toughness":"1","keywords":[],"colors":["G"],"oracle":"{T}: Add {G}."}; // native-mana
const SPAWN = {"name":"Eldrazi Spawn","type":"Token Creature — Eldrazi Spawn","mana":"","cmc":0,"power":"0","toughness":"1","keywords":[],"colors":[],"oracle":"Sacrifice this creature: Add {C}.", "token": true}; // native-mana
const SOLEMN = {"name":"Solemn Simulacrum","type":"Artifact Creature — Golem","mana":"{4}","cmc":4,"power":"2","toughness":"2","keywords":[],"colors":[],"oracle":"When this creature enters, you may search your library for a basic land card, put that card onto the battlefield tapped, then shuffle.\nWhen this creature dies, you may draw a card."}; // native-trigger
const BEARS = {"name":"Grizzly Bears","type":"Creature — Bear","mana":"{1}{G}","cmc":2,"power":"2","toughness":"2","keywords":[],"colors":["G"],"oracle":""}; // native-body
const TEST_GROVE = { name: "Test Grove", type: "Land", mana: "", cmc: 0, keywords: [], colors: [], oracle: "{T}: Add {C} or {G}." }; // synthetic

const EMPTY = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };
const P = (id, card, controller, over = {}) => ({ ...createPermanent({ id, card: { id: `c-${id}`, ...card }, controller, summoningSick: false }), ...over });
function table({ user = [], ai = [], hand = [] } = {}) {
  const s0 = createGameState({ userDeck: [], aiDeck: [] });
  const players = { ...s0.players };
  for (const pid of Object.keys(players)) players[pid] = { ...players[pid], battlefield: [], hand: [], graveyard: [], library: [], manaPool: { ...EMPTY } };
  players.user = { ...players.user, battlefield: user, hand };
  players.ai = { ...players.ai, battlefield: ai };
  return { ...s0, players, turn: 4, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0 };
}
const pay = (s, pid, cost) => planPayment(s.players[pid].manaPool, manaSources(s, pid), cost);
const affords = (s, pid, cost) => canAfford(s.players[pid].manaPool, manaSources(s, pid), cost);
// Plan, commit, and return the pool the commit leaves — a plan that counts mana the commit never makes leaves a NEGATIVE colour.
function payAndCommit(s, pid, cost) {
  const plan = pay(s, pid, cost);
  expect(plan).not.toBeNull();
  return { plan, after: plan ? commitPaymentPlan(s, pid, plan) : s };
}
const tapActions = (s, pid, permId) => legalActionsForPlayer(s, pid).filter((a) => a.kind === "tap-for-mana" && a.permanentId === permId);

describe("Forsaken Monument — the extra {C} rides a tap that makes {C}", () => {
  it("parses as a controller-scoped tap augment on any permanent", () => {
    expect(parseGlobalTapManaAugment(MONUMENT)).toMatchObject({ subject: "permanent", amount: 1 });
  });

  it("classifies native (its anthem and colorless-cast life gain were modeled)", () => {
    expect(isNativeTier(classifyCard(MONUMENT))).toBe(true);
  });

  it("⭐ Sol Ring makes three {C}: the planner pays {3} off it alone, the commit adds exactly that, {4} is out of reach", () => {
    const s = table({ user: [P("sol", SOL_RING, "user"), P("mon", MONUMENT, "user")] });
    const { plan, after } = payAndCommit(s, "user", { generic: 3 });
    expect(plan.taps).toEqual([expect.objectContaining({ permanentId: "sol", color: "C", amount: 2, bonus: [{ color: "C", amount: 1 }] })]);
    expect(after.players.user.manaPool).toEqual(EMPTY);
    expect(findPermanent(after, "sol").permanent.tapped).toBe(true);
    expect(affords(s, "user", { generic: 4 })).toBe(false); // one additional {C} per tap, however many {C} it made
  });

  it("the explicit tap of Sol Ring adds {C}{C}{C}", () => {
    const s = table({ user: [P("sol", SOL_RING, "user"), P("mon", MONUMENT, "user")] });
    const [tap] = tapActions(s, "user", "sol");
    expect(tap).toBeTruthy();
    expect(dispatchAction(s, tap).players.user.manaPool.C).toBe(3);
  });

  it("⭐ a cast: Solemn Simulacrum ({4}) is offered off Sol Ring + Wastes (five {C}) and paid in full", () => {
    const s = table({ user: [P("sol", SOL_RING, "user"), P("wastes", WASTES, "user"), P("mon", MONUMENT, "user")], hand: [{ id: "solemn", ...SOLEMN }] });
    const cast = legalActionsForPlayer(s, "user").find((a) => a.kind === "cast-spell" && a.cardId === "solemn");
    expect(cast).toBeTruthy();
    const after = dispatchAction(s, cast);
    expect(after.players.user.manaPool.C).toBe(1); // 5 made, 4 spent — the surplus floats
    expect(Object.values(after.players.user.manaPool).every((n) => n >= 0)).toBe(true);
  });

  it("a land that taps for {C} or {G} gets the extra {C} only when it is tapped for {C}", () => {
    const s = table({ user: [P("grove", TEST_GROVE, "user"), P("mon", MONUMENT, "user")] });
    expect(affords(s, "user", { C: 2 })).toBe(true);
    expect(affords(s, "user", { C: 1, G: 1 })).toBe(false);
    expect(affords(s, "user", { G: 2 })).toBe(false);
    const byColor = Object.fromEntries(tapActions(s, "user", "grove").map((a) => [a.color, a.bonus || []]));
    expect(byColor.C).toEqual([{ color: "C", amount: 1 }]);
    expect(byColor.G).toEqual([]);
  });

  it("CONTROL — a Forest taps for {G}: no extra mana", () => {
    const s = table({ user: [P("forest", FOREST, "user"), P("mon", MONUMENT, "user")] });
    expect(affords(s, "user", { G: 1 })).toBe(true);
    expect(affords(s, "user", { generic: 2 })).toBe(false);
  });

  it("CONTROL — an opponent's Forsaken Monument adds nothing to the user's taps", () => {
    const s = table({ user: [P("sol", SOL_RING, "user")], ai: [P("mon", MONUMENT, "ai")] });
    expect(affords(s, "user", { generic: 2 })).toBe(true);
    expect(affords(s, "user", { generic: 3 })).toBe(false);
  });

  it("CONTROL — an Eldrazi Spawn sacrificed for {C} is not tapped for mana — no extra {C} (the ruling: a {T} ability only)", () => {
    const s = table({ user: [P("spawn", SPAWN, "user"), P("mon", MONUMENT, "user")] });
    expect(affords(s, "user", { generic: 1 })).toBe(true);
    expect(affords(s, "user", { generic: 2 })).toBe(false);
  });
});

describe("Caged Sun — the extra mana rides a LAND's mana of the chosen colour", () => {
  const sun = (color, controller = "user", id = "sun") => P(id, CAGED_SUN, controller, color ? { chosenColor: color } : {});

  it("classifies native", () => {
    expect(isNativeTier(classifyCard(CAGED_SUN))).toBe(true);
  });

  it("⭐ green chosen: one Forest pays {G}{G}; the commit adds what the plan priced", () => {
    const s = table({ user: [P("forest", FOREST, "user"), sun("G")] });
    const { plan, after } = payAndCommit(s, "user", { G: 2 });
    expect(plan.taps).toEqual([expect.objectContaining({ permanentId: "forest", color: "G", bonus: [{ color: "G", amount: 1 }] })]);
    expect(after.players.user.manaPool).toEqual(EMPTY);
  });

  it("the explicit tap of a Forest adds {G}{G}", () => {
    const s = table({ user: [P("forest", FOREST, "user"), sun("G")] });
    const [tap] = tapActions(s, "user", "forest");
    expect(dispatchAction(s, tap).players.user.manaPool.G).toBe(2);
  });

  it("⭐ Breeding Pool under green: {G}{G} from one tap; {G}{U} and {U}{U} are not (the extra mana is the chosen colour, only when the land made it)", () => {
    const s = table({ user: [P("pool", BREEDING_POOL, "user"), sun("G")] });
    expect(affords(s, "user", { G: 2 })).toBe(true);
    expect(affords(s, "user", { G: 1, U: 1 })).toBe(false);
    expect(affords(s, "user", { U: 2 })).toBe(false);
    expect(affords(s, "user", { generic: 2 })).toBe(true); // generic: the planner taps it for green
    const byColor = Object.fromEntries(tapActions(s, "user", "pool").map((a) => [a.color, a.bonus || []]));
    expect(byColor.G).toEqual([{ color: "G", amount: 1 }]);
    expect(byColor.U).toEqual([]);
  });

  it("CONTROL — a creature's mana is not a land's: Llanowar Elves gets nothing", () => {
    const s = table({ user: [P("elves", ELVES, "user"), sun("G")] });
    expect(affords(s, "user", { G: 2 })).toBe(false);
  });

  it("CONTROL — an Island under a green Caged Sun gets nothing; an opponent's Caged Sun gives the user nothing; no colour chosen, nothing", () => {
    expect(affords(table({ user: [P("island", ISLAND, "user"), sun("G")] }), "user", { generic: 2 })).toBe(false);
    expect(affords(table({ user: [P("forest", FOREST, "user")], ai: [sun("G", "ai")] }), "user", { generic: 2 })).toBe(false);
    expect(affords(table({ user: [P("forest", FOREST, "user"), sun(null)] }), "user", { generic: 2 })).toBe(false);
  });

  it("CONTROL — the anthem: green creatures the user controls get +1/+1; the enter site stamps a colour", () => {
    const s = table({ user: [P("bear", BEARS, "user"), sun("G")] });
    expect([permanentPower(s, "bear"), permanentToughness(s, "bear")]).toEqual([3, 3]);
    const entered = enterPermanent(table({ hand: [{ ...BEARS, id: "h-bear" }] }), { id: "sun2", ...CAGED_SUN }, "user");
    expect(entered.players.user.battlefield.find((p) => p.card?.name === "Caged Sun").chosenColor).toBe("G");
  });
});

describe("Gauntlet of Power — any player's BASIC land tapped for the chosen colour", () => {
  const gauntlet = (color, controller = "user") => P("gaunt", GAUNTLET, controller, { chosenColor: color });

  it("classifies native", () => {
    expect(isNativeTier(classifyCard(GAUNTLET))).toBe(true);
  });

  it("⭐ red chosen on the user's Gauntlet: the OPPONENT's basic Mountain pays {R}{R} too; plan and commit agree", () => {
    const s = table({ user: [gauntlet("R")], ai: [P("amtn", MOUNTAIN, "ai")] });
    const { after } = payAndCommit(s, "ai", { R: 2 });
    expect(after.players.ai.manaPool).toEqual(EMPTY);
  });

  it("CONTROL — a nonbasic land tapped for red (Great Furnace) and a basic Forest get nothing", () => {
    expect(affords(table({ user: [gauntlet("R"), P("furnace", GREAT_FURNACE, "user")] }), "user", { R: 2 })).toBe(false);
    expect(affords(table({ user: [gauntlet("R"), P("forest", FOREST, "user")] }), "user", { generic: 2 })).toBe(false);
  });
});

describe("Vernal Bloom / Gauntlet of Might — any player's Forest / Mountain, whatever it was tapped for", () => {
  it("classify native", () => {
    expect(isNativeTier(classifyCard(VERNAL_BLOOM))).toBe(true);
    expect(isNativeTier(classifyCard(GAUNTLET_OF_MIGHT))).toBe(true);
  });

  it("⭐ Vernal Bloom: the opponent's Forest pays {G}{G}; Breeding Pool (a Forest) tapped for {U} still adds the {G} — {U}{G} from one tap", () => {
    const bloom = P("bloom", VERNAL_BLOOM, "user");
    expect(payAndCommit(table({ user: [bloom], ai: [P("afor", FOREST, "ai")] }), "ai", { G: 2 }).after.players.ai.manaPool).toEqual(EMPTY);
    const s = table({ user: [bloom, P("pool", BREEDING_POOL, "user")] });
    const { plan, after } = payAndCommit(s, "user", { U: 1, G: 1 });
    expect(plan.taps).toHaveLength(1);
    expect(after.players.user.manaPool).toEqual(EMPTY);
  });

  it("Gauntlet of Might: a Mountain pays {R}{R}", () => {
    expect(affords(table({ user: [P("gom", GAUNTLET_OF_MIGHT, "user"), P("mtn", MOUNTAIN, "user")] }), "user", { R: 2 })).toBe(true);
  });

  it("CONTROL — a Mountain under Vernal Bloom gets nothing", () => {
    expect(affords(table({ user: [P("bloom", VERNAL_BLOOM, "user"), P("mtn", MOUNTAIN, "user")] }), "user", { generic: 2 })).toBe(false);
  });
});

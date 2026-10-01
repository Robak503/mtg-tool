/**
 * SHIFTING WOODLAND — the play-weighted program, P·26 (EDHREC #362).
 *   "This land enters tapped unless you control a Forest.
 *    {T}: Add {G}.
 *    Delirium — {2}{G}{G}: This land becomes a copy of target permanent card in your graveyard until end of turn. Activate
 *    only if there are four or more card types among cards in your graveyard."
 *
 * The become-copy seam took only permanents on the battlefield; it now takes a permanent CARD in your graveyard and copies the
 * card itself (gone before it resolves → nothing, CR 608.2b). And the mana model read every permanent's PRINTED card, so a
 * land that became a copy kept tapping for its printed mana — a Thespian's Stage that became a Forest tapped for {C} or {G},
 * one that became a Bear still tapped for {C}. manaSources now reads the copy (CR 707.2, 613.1a) through the same
 * deriveCharacteristics that decides which copy wins.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { advanceStep, chooseTriggerTargets, flushTriggers, resolveTopOfStack, runStepActions } from "./gameEngine.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { applyBecomeCopy } from "./effects/atoms/becomeCopy.js";
import { deriveCharacteristics, permanentIsCreature } from "./layers.js";
import { manaSources } from "./manaModel.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const WOODLAND = { name: "Shifting Woodland", type: "Land", mana: "", keywords: ["Delirium"], oracle: "This land enters tapped unless you control a Forest.\n{T}: Add {G}.\nDelirium — {2}{G}{G}: This land becomes a copy of target permanent card in your graveyard until end of turn. Activate only if there are four or more card types among cards in your graveyard." };
const STAGE = { name: "Thespian's Stage", type: "Land", mana: "", keywords: [], oracle: "{T}: Add {C}.\n{2}, {T}: This land becomes a copy of target land, except it has this ability." };
const FOREST = { name: "Forest", type: "Basic Land — Forest", mana: "", keywords: [], oracle: "({T}: Add {G}.)" };
const BEARS = { name: "Grizzly Bears", type: "Creature — Bear", mana: "{1}{G}", cmc: 2, power: "2", toughness: "2", keywords: [], oracle: "" };
const gy = {
  wurm: { id: "g-wurm", name: "Craw Wurm", type: "Creature — Wurm", mana: "{4}{G}{G}", cmc: 6, power: "6", toughness: "4", keywords: [], oracle: "" },
  shock: { id: "g-shock", name: "Shock", type: "Instant", mana: "{R}", cmc: 1, keywords: [], oracle: "Shock deals 2 damage to any target." },
  ponder: { id: "g-ponder", name: "Ponder", type: "Sorcery", mana: "{U}", cmc: 1, keywords: [], oracle: "Look at the top three cards of your library, then put them back in any order. You may shuffle. Draw a card." },
  mountain: { id: "g-mtn", name: "Mountain", type: "Basic Land — Mountain", mana: "", cmc: 0, keywords: [], oracle: "({T}: Add {R}.)" },
};
const P = (id, c, controller = "user") => createPermanent({ id, card: { ...c, id: `c-${id}` }, controller, summoningSick: false });

function table({ battlefield, graveyard = [], aiGraveyard = [], mana = {} }) {
  const g = createGameState({ userDeck: [], aiDeck: [] });
  return { ...g, turn: 6, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main", stack: [], pendingTriggers: [],
    players: { ...g.players, user: { ...g.players.user, battlefield, graveyard, library: [1, 2, 3, 4, 5].map((i) => ({ ...BEARS, id: `lib${i}` })), manaPool: { ...g.players.user.manaPool, ...mana } }, ai: { ...g.players.ai, graveyard: aiGraveyard } } };
}
function settle(s) {
  let n = s, g = 0;
  while ((n.stack?.length || n.pendingTriggers?.length) && !n.pendingChoice && g++ < 30) n = n.stack?.length ? resolveTopOfStack(n) : flushTriggers(n, { chooseTargets: chooseTriggerTargets });
  return n;
}
function nextTurn(s) { let n = s, g = 0; const t = s.turn; while (n.turn === t && g++ < 40) n = runStepActions(advanceStep(n)); return n; }
const copyActs = (s) => legalActionsForPlayer(s, "user").filter((a) => a.kind === "activate-ability" && a.permanentId === "wood" && a.targets?.length);
const colorsOf = (s, id) => manaSources(s, "user").filter((m) => m.permanentId === id).map((m) => m.colors.slice().sort().join(""));
const nameOf = (s, id) => deriveCharacteristics(s, id).copiableValues?.name ?? null;

describe("classify", () => {
  it("Shifting Woodland classifies land (its delirium copy is modeled)", () => {
    expect(classifyCard(WOODLAND)).toBe("land");
  });
});

describe("runtime", () => {
  it("with delirium it may become a copy of a permanent card in your graveyard — never an instant, a sorcery, or an opponent's card", () => {
    const s = table({ battlefield: [P("wood", WOODLAND)], graveyard: Object.values(gy), aiGraveyard: [{ ...gy.wurm, id: "ai-wurm" }], mana: { G: 2, C: 2 } });
    expect(copyActs(s).map((a) => a.targets[0].id).sort()).toEqual(["g-mtn", "g-wurm"]);
  });

  it("without delirium (three card types) it isn't offered", () => {
    const s = table({ battlefield: [P("wood", WOODLAND)], graveyard: [gy.wurm, gy.shock, gy.mountain], mana: { G: 2, C: 2 } });
    expect(copyActs(s)).toEqual([]);
  });

  it("it becomes a Craw Wurm until end of turn — a 6/4 creature that taps for no mana — and comes back a land that taps for {G}", () => {
    const s0 = table({ battlefield: [P("wood", WOODLAND)], graveyard: Object.values(gy), mana: { G: 2, C: 2 } });
    const s = settle(dispatchAction(s0, copyActs(s0).find((a) => a.targets[0].id === "g-wurm")));
    const d = deriveCharacteristics(s, "wood");
    const later = nextTurn(s);
    const row = { now: nameOf(s, "wood"), pt: [d.power, d.toughness], creature: permanentIsCreature(s, "wood"), mana: colorsOf(s, "wood"), wurmStillInGraveyard: s.players.user.graveyard.some((c) => c.id === "g-wurm"), later: nameOf(later, "wood"), laterMana: colorsOf({ ...later, players: { ...later.players, user: { ...later.players.user, battlefield: later.players.user.battlefield.map((p) => (p.id === "wood" ? { ...p, tapped: false } : p)) } } }, "wood") };
    console.log("  WITNESS shiftingWoodland", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ now: "Craw Wurm", pt: [6, 4], creature: true, mana: [], wurmStillInGraveyard: true, later: null, laterMana: ["G"] });
  });

  it("the card left the graveyard before it resolved: nothing is copied (CR 608.2b)", () => {
    const s = table({ battlefield: [P("wood", WOODLAND)], graveyard: Object.values(gy) });
    const gone = { ...s, players: { ...s.players, user: { ...s.players.user, graveyard: s.players.user.graveyard.filter((c) => c.id !== "g-wurm") } } };
    const after = applyBecomeCopy(gone, { op: "become-copy", targetType: "graveyardCard", cardFilter: "permanent", riders: [] }, { controller: "user", sourceId: "wood", targets: [{ type: "graveyardCard", id: "g-wurm", controller: "user" }] });
    expect(nameOf(after, "wood")).toBe(null);
  });
});

describe("FIXED — a permanent that became a copy taps for the copy's mana, not its printed mana", () => {
  it("Thespian's Stage that became a Forest taps for {G} only; one that became a Bear taps for nothing", () => {
    const s = table({ battlefield: [P("stage", STAGE), P("forest", FOREST), P("bears", BEARS)] });
    const asForest = applyBecomeCopy(s, { op: "become-copy", targetType: "land", riders: [] }, { controller: "user", sourceId: "stage", targets: [{ type: "permanent", id: "forest" }] });
    const asBear = applyBecomeCopy(s, { op: "become-copy", targetType: "creature", riders: [] }, { controller: "user", sourceId: "stage", targets: [{ type: "creature", id: "bears" }] });
    expect({ printed: colorsOf(s, "stage"), asForest: colorsOf(asForest, "stage"), asBear: colorsOf(asBear, "stage") }).toEqual({ printed: ["C"], asForest: ["G"], asBear: [] });
  });
  it("summoning sickness reads the copy too: a Woodland played THIS turn that became Llanowar Elves is a creature that came under your control this turn — it can't tap for mana (CR 302.6)", () => {
    const ELVES = { id: "g-elves", name: "Llanowar Elves", type: "Creature — Elf Druid", mana: "{G}", cmc: 1, power: "1", toughness: "1", keywords: [], oracle: "{T}: Add {G}." };
    const s = table({ battlefield: [{ ...P("wood", WOODLAND), enteredOnTurn: 6 }], graveyard: [ELVES] });
    const asElves = applyBecomeCopy(s, { op: "become-copy", targetType: "graveyardCard", cardFilter: "permanent", riders: [] }, { controller: "user", sourceId: "wood", targets: [{ type: "graveyardCard", id: "g-elves", controller: "user" }] });
    const lastTurn = { ...asElves, players: { ...asElves.players, user: { ...asElves.players.user, battlefield: asElves.players.user.battlefield.map((p) => ({ ...p, enteredOnTurn: 5 })) } } };
    expect({ name: nameOf(asElves, "wood"), thisTurn: colorsOf(asElves, "wood"), playedEarlier: colorsOf(lastTurn, "wood") }).toEqual({ name: "Llanowar Elves", thisTurn: [], playedEarlier: ["G"] });
  });
  it("a TAPPED permanent is read as its copy too: a tapped Crystalline Crawler (counter mana works while tapped) that became a Forest is a tapped Forest — no mana", () => {
    const CRAWLER = { name: "Crystalline Crawler", type: "Artifact Creature — Construct", mana: "{4}", cmc: 4, power: "1", toughness: "1", keywords: ["Converge"], oracle: "Converge — This creature enters with a +1/+1 counter on it for each color of mana spent to cast it.\nRemove a +1/+1 counter from this creature: Add one mana of any color.\n{T}: Put a +1/+1 counter on this creature." };
    const s = table({ battlefield: [{ ...P("crawler", CRAWLER), tapped: true, counters: { "+1/+1": 2 } }, P("forest", FOREST)] });
    const asForest = applyBecomeCopy(s, { op: "become-copy", targetType: "land", riders: [] }, { controller: "user", sourceId: "crawler", targets: [{ type: "permanent", id: "forest" }] });
    expect({ printed: colorsOf(s, "crawler").length, asForest: colorsOf(asForest, "crawler") }).toEqual({ printed: 2, asForest: [] });
  });
});

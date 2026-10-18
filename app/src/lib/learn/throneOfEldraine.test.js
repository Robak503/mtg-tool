/**
 * throneOfEldraine.test.js — the play-weighted program, #890 Throne of Eldraine.
 *
 *   "As Throne of Eldraine enters, choose a color.
 *    {T}: Add four mana of the chosen color. Spend this mana only to cast monocolored spells of that color.
 *    {3}, {T}: Draw two cards. Spend only mana of the chosen color to activate this ability."
 *
 * The colour chooser names the card ("As Throne of Eldraine enters"), the mana is four of the chosen colour behind a spend
 * restriction (CR 106.6) the planner enforces through the cast's spend context, and mana it makes that the payment does not
 * spend keeps its restriction: it joins the restricted-mana pool (`player.restrictedMana`, the QUARTET Phase 4 entries) instead
 * of the open pool — otherwise one tap would launder up to three restricted mana into general-purpose mana. The draw ability's
 * {3} may be paid only with mana of the chosen colour, so its cost is three pips of that colour.
 *
 * Real oracle fixtures (bundled Scryfall via cardIndex.publicCard, 2026-10-17); the trailing comment is the tier before this slice.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard, isNativeTier } from "./coverage.js";
import { choosesColorOnEnter } from "./staticAbilityParser.js";
import { manaProduction, manaSources, planPayment, canAfford, payManaCost } from "./manaModel.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { enterPermanent } from "./resolvers.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { _resetIdsForTests, createGameState, createPermanent, findPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

// ── real card fixtures (bundled Scryfall, cardIndex.publicCard) ──
const THRONE = {"name":"Throne of Eldraine","type":"Legendary Artifact","mana":"{5}","cmc":5,"keywords":[],"colors":[],"oracle":"As Throne of Eldraine enters, choose a color.\n{T}: Add four mana of the chosen color. Spend this mana only to cast monocolored spells of that color.\n{3}, {T}: Draw two cards. Spend only mana of the chosen color to activate this ability."}; // body-only #890
const ISLAND = {"name":"Island","type":"Basic Land — Island","mana":"","cmc":0,"keywords":[],"colors":[],"oracle":"({T}: Add {U}.)"}; // land
const FOREST = {"name":"Forest","type":"Basic Land — Forest","mana":"","cmc":0,"keywords":[],"colors":[],"oracle":"({T}: Add {G}.)"}; // land
const OCTOPUS = {"name":"Giant Octopus","type":"Creature — Octopus","mana":"{3}{U}","cmc":4,"power":"3","toughness":"3","keywords":[],"colors":["U"],"oracle":""}; // native-body
const AIR_ELEMENTAL = {"name":"Air Elemental","type":"Creature — Elemental","mana":"{3}{U}{U}","cmc":5,"power":"4","toughness":"4","keywords":["Flying"],"colors":["U"],"oracle":"Flying"}; // native-body
const WIND_DRAKE = {"name":"Wind Drake","type":"Creature — Drake","mana":"{2}{U}","cmc":3,"power":"2","toughness":"2","keywords":["Flying"],"colors":["U"],"oracle":"Flying"}; // native-body
const MYSTIC_SNAKE = {"name":"Mystic Snake","type":"Creature — Snake","mana":"{1}{G}{U}{U}","cmc":4,"power":"2","toughness":"2","keywords":["Flash"],"colors":["G","U"],"oracle":"Flash\nWhen this creature enters, counter target spell."}; // native-trigger
const DAMNATION = {"name":"Damnation","type":"Sorcery","mana":"{2}{B}{B}","cmc":4,"keywords":[],"colors":["B"],"oracle":"Destroy all creatures. They can't be regenerated."}; // native-spell
const SOLEMN = {"name":"Solemn Simulacrum","type":"Artifact Creature — Golem","mana":"{4}","cmc":4,"power":"2","toughness":"2","keywords":[],"colors":[],"oracle":"When this creature enters, you may search your library for a basic land card, put that card onto the battlefield tapped, then shuffle.\nWhen this creature dies, you may draw a card."}; // native-trigger

const EMPTY = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };
const P = (id, card, controller, over = {}) => ({ ...createPermanent({ id, card: { id: `c-${id}`, ...card }, controller, summoningSick: false }), ...over });
const throne = (color, id = "throne") => P(id, THRONE, "user", color ? { chosenColor: color } : {});
function table({ user = [], hand = [], library = [], pool = EMPTY } = {}) {
  const s0 = createGameState({ userDeck: [], aiDeck: [] });
  const players = { ...s0.players };
  for (const pid of Object.keys(players)) players[pid] = { ...players[pid], battlefield: [], hand: [], graveyard: [], library: [], manaPool: { ...EMPTY } };
  players.user = { ...players.user, battlefield: user, hand, library, manaPool: { ...pool } };
  return { ...s0, players, turn: 4, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0 };
}
const castOf = (s, cardId) => legalActionsForPlayer(s, "user").find((a) => a.kind === "cast-spell" && a.cardId === cardId);
const ctx = (card) => ({ castCard: card, isCommander: false, restrictedEntries: [] });
const restrictedTotal = (s) => (s.players.user.restrictedMana || []).reduce((n, e) => n + Object.values(e.pool).reduce((a, b) => a + b, 0), 0);

describe("parse + classification", () => {
  it("the name-led colour chooser is read", () => {
    expect(choosesColorOnEnter(THRONE)).toEqual({ exclude: null });
  });

  it("the mana line: four of the chosen colour, behind its restriction", () => {
    expect(manaProduction(THRONE)).toMatchObject({ amount: 4, chosenColor: true, restriction: expect.any(Object) });
  });

  it("Throne of Eldraine classifies native", () => {
    expect(isNativeTier(classifyCard(THRONE))).toBe(true);
  });

  it("entering, it stamps the colour its controller's cards need most", () => {
    const s = enterPermanent(table({ hand: [{ ...AIR_ELEMENTAL, id: "h1" }], library: [{ ...OCTOPUS, id: "l1" }] }), { ...THRONE, id: "c-throne" }, "user");
    expect(s.players.user.battlefield.find((p) => p.card?.name === "Throne of Eldraine").chosenColor).toBe("U");
  });
});

describe("the mana — four of the chosen colour, for monocolored spells of that colour only", () => {
  it("⭐ Giant Octopus ({3}{U}) is cast off Throne alone; the commit spends all four", () => {
    const s = table({ user: [throne("U")], hand: [{ ...OCTOPUS, id: "oct" }] });
    const cast = castOf(s, "oct");
    expect(cast).toBeTruthy();
    const after = dispatchAction(s, cast);
    expect(after.players.user.manaPool).toEqual(EMPTY);
    expect(restrictedTotal(after)).toBe(0);
    expect(findPermanent(after, "throne").permanent.tapped).toBe(true);
  });

  it("⭐ Air Elemental ({3}{U}{U}) off Throne + an Island; not off Throne alone", () => {
    expect(castOf(table({ user: [throne("U"), P("isl", ISLAND, "user")], hand: [{ ...AIR_ELEMENTAL, id: "air" }] }), "air")).toBeTruthy();
    expect(castOf(table({ user: [throne("U")], hand: [{ ...AIR_ELEMENTAL, id: "air" }] }), "air")).toBeUndefined();
  });

  it("CONTROL — refused for a multicoloured spell: Mystic Snake ({1}{G}{U}{U}) beside a Forest is not paid by Throne's blue", () => {
    const s = table({ user: [throne("U"), P("for", FOREST, "user")], hand: [{ ...MYSTIC_SNAKE, id: "snake" }] });
    expect(castOf(s, "snake")).toBeUndefined();
    expect(canAfford(EMPTY, manaSources(s, "user"), { generic: 1, G: 1, U: 2 }, ctx(MYSTIC_SNAKE))).toBe(false);
  });

  it("CONTROL — refused for a spell of another colour (Damnation) and for a colourless one (Solemn Simulacrum)", () => {
    const s = table({ user: [throne("U")] });
    expect(canAfford(EMPTY, manaSources(s, "user"), { generic: 2, B: 2 }, ctx(DAMNATION))).toBe(false);
    expect(canAfford(EMPTY, manaSources(s, "user"), { generic: 4 }, ctx(SOLEMN))).toBe(false);
  });

  it("CONTROL — refused with no spend context (an ability, a resolution-time payment)", () => {
    const s = table({ user: [throne("U")] });
    expect(planPayment(EMPTY, manaSources(s, "user"), { U: 1 })).toBeNull();
    expect(payManaCost(s, "user", { generic: 1 }).paid).toBe(false);
  });

  it("CONTROL — no colour stamped: Throne makes nothing", () => {
    const s = table({ user: [throne(null)] });
    expect(manaSources(s, "user").filter((r) => r.permanentId === "throne")).toEqual([]);
  });

  it("⭐ three {C} floating beside Throne: Giant Octopus is paid by Throne's four, and the floating {C} stays open mana", () => {
    const s = table({ user: [throne("U")], hand: [{ ...OCTOPUS, id: "oct" }], pool: { ...EMPTY, C: 3 } });
    const cast = castOf(s, "oct");
    expect(cast).toBeTruthy();
    const after = dispatchAction(s, cast);
    expect(after.players.user.manaPool).toEqual({ ...EMPTY, C: 3 });
    expect(restrictedTotal(after)).toBe(0);
  });

  it("two {U} floating: Throne's four pay Giant Octopus in full and both floating {U} stay open (the restricted mana is spent first)", () => {
    const s = table({ user: [throne("U")], hand: [{ ...OCTOPUS, id: "oct" }], pool: { ...EMPTY, U: 2 } });
    const cast = castOf(s, "oct");
    expect(cast).toBeTruthy();
    const after = dispatchAction(s, cast);
    expect(after.players.user.manaPool).toEqual({ ...EMPTY, U: 2 });
    expect(restrictedTotal(after)).toBe(0);
  });

  it("⭐ the mana the payment leaves keeps its restriction: {U}{C}{C} floating pay Giant Octopus's pip and {2}, Throne taps for the last {1}, and two of its blue are left over as restricted mana — never open mana — that pays a monocolored blue spell later in the step and never a multicoloured one", () => {
    const s = table({ user: [throne("U"), P("for", FOREST, "user")], hand: [{ ...OCTOPUS, id: "oct" }, { ...WIND_DRAKE, id: "drake" }, { ...MYSTIC_SNAKE, id: "snake" }], pool: { ...EMPTY, U: 1, C: 2 } });
    const cast = castOf(s, "oct");
    expect(cast).toBeTruthy();
    const after = dispatchAction(s, cast);
    // 7 mana in (3 floating + Throne's 4), 4 spent (two {U}, two {C}): Throne's four cover both {U} spent, so two of its blue are
    // left, restricted; the floating {U} nobody needed stays open.
    expect(after.players.user.manaPool).toEqual({ ...EMPTY, U: 1 });
    expect(after.players.user.restrictedMana).toEqual([{ pool: { ...EMPTY, U: 2 }, restriction: expect.objectContaining({ castMonocolored: "U" }) }]);
    expect(findPermanent(after, "for").permanent.tapped).toBe(false);
    const ready = { ...after, stack: [] };
    expect(castOf(ready, "drake")).toBeTruthy();   // {2}{U}: the restricted blue pays two of it — open {U} + the Forest alone are two
    expect(castOf(ready, "snake")).toBeUndefined(); // {1}{G}{U}{U}: the restricted blue may not pay a multicoloured spell
  });
});

describe("the restricted surplus — any restricted source (FIX: false positive)", () => {
  // Mishra's Workshop "{T}: Add {C}{C}{C}. Spend this mana only to cast artifact spells." (bundled Scryfall, #3736). A floating {R} paid
  // part of Darksteel Ingot's {3}, so one of the Workshop's three is left over: it used to land in the open pool as ordinary {C}.
  const WORKSHOP = {"name":"Mishra's Workshop","type":"Land","mana":"","cmc":0,"keywords":[],"colors":[],"oracle":"{T}: Add {C}{C}{C}. Spend this mana only to cast artifact spells."}; // land
  const INGOT = {"name":"Darksteel Ingot","type":"Artifact","mana":"{3}","cmc":3,"keywords":["Indestructible"],"colors":[],"oracle":"Indestructible (Effects that say \"destroy\" don't destroy this artifact.)\n{T}: Add one mana of any color."}; // native-mana

  it("⭐ the Workshop's unspent {C} stays artifact-only: it can't pay a later {1} that isn't an artifact spell", () => {
    const s = table({ user: [P("ws", WORKSHOP, "user")], hand: [{ ...INGOT, id: "ingot" }], pool: { ...EMPTY, R: 1 } });
    const cast = castOf(s, "ingot");
    expect(cast).toBeTruthy();
    const after = dispatchAction(s, cast);
    expect(after.players.user.manaPool).toEqual(EMPTY);
    expect(after.players.user.restrictedMana).toEqual([{ pool: { ...EMPTY, C: 1 }, restriction: expect.objectContaining({ castTypes: ["artifact"] }) }]);
    expect(payManaCost({ ...after, stack: [] }, "user", { generic: 1 }).paid).toBe(false);
  });
});

describe("the draw ability — its {3} paid only with mana of the chosen colour", () => {
  const library = [1, 2, 3].map((n) => ({ ...OCTOPUS, id: `lib${n}` }));
  const drawAction = (s) => legalActionsForPlayer(s, "user").find((a) => a.kind === "activate-ability" && a.permanentId === "throne");

  it("⭐ blue chosen, three Islands: offered at {U}{U}{U}; activating it draws two", () => {
    const s = table({ user: [throne("U"), P("i1", ISLAND, "user"), P("i2", ISLAND, "user"), P("i3", ISLAND, "user")], library });
    const act = drawAction(s);
    expect(act).toBeTruthy();
    expect(act.cost).toMatchObject({ U: 3 });
    expect(act.cost.generic || 0).toBe(0);
    let after = dispatchAction(s, act);
    for (let g = 0; (after.stack || []).length && g < 10; g++) after = resolveTopOfStack(after);
    expect(after.players.user.hand).toHaveLength(2);
  });

  it("CONTROL — three Forests under a blue Throne: not offered (green mana can't pay it)", () => {
    const s = table({ user: [throne("U"), P("f1", FOREST, "user"), P("f2", FOREST, "user"), P("f3", FOREST, "user")], library });
    expect(drawAction(s)).toBeUndefined();
  });

  it("CONTROL — two Islands: not offered (three blue needed)", () => {
    const s = table({ user: [throne("U"), P("i1", ISLAND, "user"), P("i2", ISLAND, "user")], library });
    expect(drawAction(s)).toBeUndefined();
  });

  it("CONTROL — no colour stamped: not offered", () => {
    const s = table({ user: [throne(null), P("i1", ISLAND, "user"), P("i2", ISLAND, "user"), P("i3", ISLAND, "user")], library });
    expect(drawAction(s)).toBeUndefined();
  });
});

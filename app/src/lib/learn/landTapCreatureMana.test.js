/**
 * landTapCreatureMana.test.js — a land's "{T}, Tap an untapped creature you control: Add one mana of any color." (Holdout
 * Settlement #3,018, Survivors' Encampment #2,646, Scene of the Crime #2,615), 2026-10-17.
 *
 * Each of the three prints two mana abilities (CR 113.2c): "{T}: Add {C}." and the tap-a-creature line, whose cost also taps an
 * untapped creature its controller controls (CR 118.3 — none, no activation). The creature may be one that came under its
 * controller's control this turn: summoning sickness restricts only a creature's own {T} ability (CR 302.6), and the bundled
 * ruling on Holdout Settlement and Survivors' Encampment says so ("including one you haven't controlled continuously …").
 *
 * The bugs (found 10-17 by the Relic of Legends slice, re-proved on 6465a494): a land keeps its raw oracle, and the land path
 * returned its product before the tap-other reader ran, so it kept no payer. Holdout Settlement's whole-card parse read the
 * any-colour line as its main product (its plain line carries reminder text, so the honest-main rule never found it): any
 * colour with NO creature tapped, and never {C} — a false positive. Survivors' Encampment and Scene of the Crime fell back to
 * their plain {C} and never offered the coloured line — a false negative. Now the tap-a-creature line leaves the whole-card
 * parse and rides as its own record carrying its payer (`extraTap`), the machinery Springleaf Drum and Relic of Legends use.
 *
 * Real oracle fixtures (bundled Scryfall oracle-index.json, read in-session 2026-10-17).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { manaProduction, extraManaLineProducts, manaSources, canAfford, planPayment } from "./manaModel.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const HOLDOUT = { name: "Holdout Settlement", type: "Land", mana: "", mana_cost: "",
  oracle: "{T}: Add {C}. ({C} represents colorless mana.)\n{T}, Tap an untapped creature you control: Add one mana of any color." };
const ENCAMPMENT = { name: "Survivors' Encampment", type: "Land — Desert", mana: "", mana_cost: "",
  oracle: "{T}: Add {C}.\n{T}, Tap an untapped creature you control: Add one mana of any color." };
const SCENE = { name: "Scene of the Crime", type: "Artifact Land — Clue", mana: "", mana_cost: "",
  oracle: "This land enters tapped.\n{T}: Add {C}.\n{T}, Tap an untapped creature you control: Add one mana of any color.\n{2}, Sacrifice this land: Draw a card." };
const BEARS = { name: "Grizzly Bears", type: "Creature — Bear", mana: "{1}{G}", mana_cost: "{1}{G}", power: "2", toughness: "2", oracle: "" };
const ELVES = { name: "Llanowar Elves", type: "Creature — Elf Druid", mana: "{G}", mana_cost: "{G}", power: "1", toughness: "1", oracle: "{T}: Add {G}." };
// Spells cast from hand.
const WIZARD = { id: "h-wiz", name: "Fugitive Wizard", type: "Creature — Human Wizard", mana: "{U}", mana_cost: "{U}", cmc: 1, power: "1", toughness: "1", oracle: "" };

const on = (id, card, { tapped = false, sick = false, controller = "user" } = {}) =>
  ({ ...createPermanent({ id, card: { id: `c-${id}`, ...card }, controller, summoningSick: sick }), tapped });
function table(userBattlefield, { aiBattlefield = [], hand = [WIZARD] } = {}) {
  const s0 = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...s0, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0, turn: 3,
    players: {
      ...s0.players,
      user: { ...s0.players.user, battlefield: userBattlefield, hand, life: 20, library: [], graveyard: [], manaPool: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 } },
      ai: { ...s0.players.ai, battlefield: aiBattlefield },
    },
  };
}
const EMPTY = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };
const cost = (o) => ({ generic: 0, W: 0, U: 0, B: 0, R: 0, G: 0, C: 0, ...o });
const actions = (s) => legalActionsForPlayer(s, "user");
const castFrom = (s, cardId) => actions(s).find((a) => a.kind === "cast-spell" && a.cardId === cardId);
const taps = (s, id) => actions(s).filter((a) => a.kind === "tap-for-mana" && a.permanentId === id);
const tapFor = (s, id, color) => taps(s, id).find((a) => a.color === color);
const perm = (s, id) => s.players.user.battlefield.find((p) => p.id === id);
const records = (s, id) => manaSources(s, "user").filter((r) => r.permanentId === id);
const ANY = ["W", "U", "B", "R", "G"];

describe("the parse: the plain {C} line is the land's own product; the tap-a-creature line rides as its own record", () => {
  for (const land of [HOLDOUT, ENCAMPMENT, SCENE]) {
    it(`${land.name}: main = {T}: {C}; extra = {T}, one untapped creature tapped, any colour`, () => {
      const main = manaProduction(land);
      expect(main).toEqual({ colors: ["C"], amount: 1, requiresTap: true });
      expect(extraManaLineProducts(land, main)).toMatchObject([
        { colors: ANY, amount: 1, requiresTap: true, extraTap: { count: 1, filter: "creature" } },
      ]);
    });
  }

  it("the tap-a-creature line read alone carries its payer, as a land's line too", () => {
    const line = { ...HOLDOUT, oracle: "{T}, Tap an untapped creature you control: Add one mana of any color." };
    expect(manaProduction(line)).toEqual({ colors: ANY, amount: 1, requiresTap: true, extraTap: { count: 1, filter: "creature" } });
  });
});

describe("availability: the coloured line only with an untapped creature to tap", () => {
  it("⛔ Holdout Settlement alone is a {C} source — no colour (it used to make any colour with no creature tapped)", () => {
    const recs = records(table([on("hold", HOLDOUT)]), "hold");
    expect(recs).toHaveLength(1);
    expect(recs[0]).toMatchObject({ colors: ["C"], amount: 1 });
  });

  it("beside a SUMMONING-SICK Grizzly Bears: the {C} record and the any-colour record that taps the Bears (CR 302.6)", () => {
    const recs = records(table([on("hold", HOLDOUT), on("bear", BEARS, { sick: true })]), "hold");
    expect(recs).toHaveLength(2);
    expect(recs[0]).toMatchObject({ colors: ["C"], amount: 1 });
    expect(recs[0].extraTaps).toBeUndefined();
    expect(recs[1]).toMatchObject({ colors: ANY, amount: 1, extraTaps: ["bear"], extraLine: true });
  });

  it("Survivors' Encampment and Scene of the Crime offer the line now (they never did)", () => {
    expect(records(table([on("camp", ENCAMPMENT), on("bear", BEARS)]), "camp")).toMatchObject([{ colors: ["C"] }, { colors: ANY, extraTaps: ["bear"] }]);
    expect(records(table([on("scene", SCENE), on("bear", BEARS)]), "scene")).toMatchObject([{ colors: ["C"] }, { colors: ANY, extraTaps: ["bear"] }]);
  });

  it("⛔ control: a tapped creature is no payer", () => {
    const recs = records(table([on("hold", HOLDOUT), on("bear", BEARS, { tapped: true })]), "hold");
    expect(recs).toHaveLength(1);
    expect(recs[0]).toMatchObject({ colors: ["C"] });
  });

  it("⛔ control: an opponent's creature is no payer", () => {
    const s = table([on("hold", HOLDOUT)], { aiBattlefield: [on("aiBear", BEARS, { controller: "ai" })] });
    expect(records(s, "hold")).toHaveLength(1);
  });

  it("⛔ control: a tapped land offers nothing — both lines need its {T}", () => {
    expect(records(table([on("hold", HOLDOUT, { tapped: true }), on("bear", BEARS)]), "hold")).toEqual([]);
  });
});

describe("the planner", () => {
  it("⛔ Holdout Settlement alone does not cast Fugitive Wizard ({U}) — and it pays a {C} pip", () => {
    const s = table([on("hold", HOLDOUT)]);
    expect(castFrom(s, "h-wiz")).toBeUndefined();
    expect(canAfford(EMPTY, manaSources(s, "user"), cost({ C: 1 }))).toBe(true);
    expect(canAfford(EMPTY, manaSources(s, "user"), cost({ U: 1 }))).toBe(false);
  });

  it("Holdout Settlement and a sick Grizzly Bears cast Fugitive Wizard: the land and the Bears are tapped", () => {
    const s = table([on("hold", HOLDOUT), on("bear", BEARS, { sick: true })]);
    const cast = castFrom(s, "h-wiz");
    expect(cast).toBeDefined();
    const out = dispatchAction(s, cast);
    expect({ hold: perm(out, "hold").tapped, bear: perm(out, "bear").tapped, inHand: out.players.user.hand.some((c) => c.id === "h-wiz") })
      .toEqual({ hold: true, bear: true, inHand: false });
  });

  it("Survivors' Encampment and a Grizzly Bears cast Fugitive Wizard (it could not)", () => {
    const s = table([on("camp", ENCAMPMENT), on("bear", BEARS)]);
    expect(castFrom(s, "h-wiz")).toBeDefined();
  });

  it("⛔ control: the land's two lines share its one {T} — Holdout and the Bears make one mana, never two", () => {
    const src = manaSources(table([on("hold", HOLDOUT), on("bear", BEARS)]), "user");
    expect(canAfford(EMPTY, src, cost({ generic: 1 }))).toBe(true);
    expect(canAfford(EMPTY, src, cost({ generic: 2 }))).toBe(false);
  });

  it("⛔ control: a payer that makes mana taps once — Holdout + Llanowar Elves pay {2} or {U}, never {U}{G}", () => {
    const src = manaSources(table([on("hold", HOLDOUT), on("elves", ELVES)]), "user");
    expect(canAfford(EMPTY, src, cost({ generic: 2 }))).toBe(true);
    expect(canAfford(EMPTY, src, cost({ generic: 3 }))).toBe(false);
    expect(canAfford(EMPTY, src, cost({ U: 1 }))).toBe(true);
    expect(canAfford(EMPTY, src, cost({ U: 1, G: 1 }))).toBe(false);
    const plan = planPayment(EMPTY, src, cost({ U: 1 }));
    const tapped = plan.taps.flatMap((t) => [t.permanentId, ...(t.extraTaps || [])]);
    expect(new Set(tapped).size).toBe(tapped.length);
  });
});

describe("the explicit tap", () => {
  it("⛔ Holdout Settlement alone is offered {C} only", () => {
    expect(taps(table([on("hold", HOLDOUT)]), "hold").map((a) => a.color)).toEqual(["C"]);
  });

  it("beside the Bears: {C}, then each colour carrying the Bears; taking {U} taps the land and the Bears", () => {
    const s = table([on("hold", HOLDOUT), on("bear", BEARS, { sick: true })]);
    expect(taps(s, "hold").map((a) => a.color)).toEqual(["C", ...ANY]);
    expect(tapFor(s, "hold", "C").extraTaps).toBeUndefined();
    expect(tapFor(s, "hold", "U")).toMatchObject({ extraTaps: ["bear"] });
    const out = dispatchAction(s, tapFor(s, "hold", "U"));
    expect({ U: out.players.user.manaPool.U, hold: perm(out, "hold").tapped, bear: perm(out, "bear").tapped }).toEqual({ U: 1, hold: true, bear: true });
    expect(taps(out, "hold")).toEqual([]);
  });

  it("⛔ control: taking {C} taps the land alone — the Bears stay untapped", () => {
    const s = table([on("camp", ENCAMPMENT), on("bear", BEARS)]);
    const out = dispatchAction(s, tapFor(s, "camp", "C"));
    expect({ C: out.players.user.manaPool.C, camp: perm(out, "camp").tapped, bear: perm(out, "bear").tapped }).toEqual({ C: 1, camp: true, bear: false });
  });

  it("Scene of the Crime (an artifact land) is offered the coloured line with a creature", () => {
    expect(taps(table([on("scene", SCENE), on("bear", BEARS)]), "scene").map((a) => a.color)).toEqual(["C", ...ANY]);
  });
});

describe("tier: the three stay fully modelled lands", () => {
  it("land, land, land", () => {
    expect([HOLDOUT, ENCAMPMENT, SCENE].map(classifyCard)).toEqual(["land", "land", "land"]);
  });
});

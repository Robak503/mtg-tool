/**
 * relicOfLegends.test.js — "Tap an untapped legendary creature you control: Add one mana of any color." (Relic of Legends,
 * play-weighted #535), 2026-10-17.
 *
 * Relic prints two mana abilities (CR 113.2c — each paragraph its own): "{T}: Add one mana of any color." and the
 * tap-a-legend line. The second has no {T} of Relic's own, so it never taps Relic (CR 107.5) and is usable while Relic is
 * tapped — the two abilities are two activations, two mana. Its cost taps another permanent, an untapped legendary creature
 * its controller controls (CR 118.3 — no such creature, no activation). Summoning sickness restricts only a creature's own
 * ability with {T} or {Q} in its cost (CR 302.6, 602.5a): a legendary creature that came under its controller's control this
 * turn is a legal payer, because the ability is Relic's.
 *
 * The line used to be refused (a cost item no record paid — manaLineRefused), so the card parked body-only. It now rides as
 * its own extra record (extraManaLineProducts) with the tap-other payer machinery Springleaf Drum and Birchlore Rangers use.
 *
 * ⛔ AND ONE PERMANENT IS TAPPED ONCE (found while building this): the planner took a tap-other payer's own mana too.
 * Springleaf Drum beside a lone Llanowar Elves paid {2} — the Elves tapped for {G} and again as the Drum's payer. A record
 * that taps a permanent now excludes that permanent's {T} records and every other record that would tap it.
 *
 * Real oracle fixtures (bundled Scryfall oracle-index.json, read in-session 2026-10-17).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { manaProduction, extraManaLineProducts, manaSources, canAfford, planPayment } from "./manaModel.js";

beforeEach(() => _resetIdsForTests());

const RELIC = { name: "Relic of Legends", type: "Artifact", mana: "{3}", mana_cost: "{3}",
  oracle: "{T}: Add one mana of any color.\nTap an untapped legendary creature you control: Add one mana of any color." };
const ISAMARU = { name: "Isamaru, Hound of Konda", type: "Legendary Creature — Dog", mana: "{W}", mana_cost: "{W}", power: "2", toughness: "2", oracle: "" };
const TURNBULL = { name: "Riven Turnbull", type: "Legendary Creature — Human Advisor", mana: "{5}{U}{B}", mana_cost: "{5}{U}{B}", power: "5", toughness: "7", oracle: "{T}: Add {B}." };
const BEARS = { name: "Grizzly Bears", type: "Creature — Bear", mana: "{1}{G}", mana_cost: "{1}{G}", power: "2", toughness: "2", oracle: "" };
const ULTRON = { name: "Ultron, Machine Overlord", type: "Legendary Artifact Creature — Robot Villain", mana: "{5}", mana_cost: "{5}", power: "4", toughness: "4",
  oracle: "Flying\nOther Robots and Constructs you control get +2/+2." };
const WOODLAND_CHANGELING = { name: "Woodland Changeling", type: "Creature — Shapeshifter", mana: "{1}{G}", mana_cost: "{1}{G}", power: "2", toughness: "2",
  oracle: "Changeling (This card is every creature type.)" };
const DRUM = { name: "Springleaf Drum", type: "Artifact", mana: "{1}", mana_cost: "{1}", oracle: "{T}, Tap an untapped creature you control: Add one mana of any color." };
const ELVES = { name: "Llanowar Elves", type: "Creature — Elf Druid", mana: "{G}", mana_cost: "{G}", power: "1", toughness: "1", oracle: "{T}: Add {G}." };
// Spells cast from hand.
const WIZARD = { id: "h-wiz", name: "Fugitive Wizard", type: "Creature — Human Wizard", mana: "{U}", mana_cost: "{U}", cmc: 1, power: "1", toughness: "1", oracle: "" };
const BEARS_CARD = { id: "h-bears", ...BEARS, cmc: 2 };

const on = (id, card, { tapped = false, sick = false, controller = "user" } = {}) =>
  ({ ...createPermanent({ id, card: { id: `c-${id}`, ...card }, controller, summoningSick: sick }), tapped });
function table(userBattlefield, { aiBattlefield = [], hand = [WIZARD, BEARS_CARD] } = {}) {
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

describe("the parse: the {T} line is the card's own product; the tap-a-legend line rides as its own record", () => {
  it("main = {T}: any colour; extra = no {T}, one untapped legendary creature tapped", () => {
    const main = manaProduction(RELIC);
    expect(main).toEqual({ colors: ["W", "U", "B", "R", "G"], amount: 1, requiresTap: true });
    expect(extraManaLineProducts(RELIC, main)).toMatchObject([
      { colors: ["W", "U", "B", "R", "G"], amount: 1, requiresTap: false, extraTap: { count: 1, filter: "legendary creature" } },
    ]);
  });
});

describe("availability: offered only with an untapped legendary creature its controller controls", () => {
  it("a tapped Relic beside a SUMMONING-SICK legendary creature offers the line, tapping the creature (CR 302.6)", () => {
    const s = table([on("relic", RELIC, { tapped: true }), on("dog", ISAMARU, { sick: true })]);
    expect(records(s, "relic")).toMatchObject([{ colors: ["W", "U", "B", "R", "G"], amount: 1, extraTaps: ["dog"], noTap: true }]);
  });

  it("⛔ a nonlegendary creature is no payer", () => {
    expect(records(table([on("relic", RELIC, { tapped: true }), on("bear", BEARS)]), "relic")).toEqual([]);
  });

  it("the legend is read off its types, not the type-line words: a Legendary ARTIFACT Creature pays", () => {
    expect(records(table([on("relic", RELIC, { tapped: true }), on("ultron", ULTRON)]), "relic")).toMatchObject([{ extraTaps: ["ultron"] }]);
  });

  it("⛔ a changeling is every creature TYPE, never legendary — no payer", () => {
    expect(records(table([on("relic", RELIC, { tapped: true }), on("changeling", WOODLAND_CHANGELING)]), "relic")).toEqual([]);
  });

  it("⛔ a tapped legendary creature is no payer", () => {
    expect(records(table([on("relic", RELIC, { tapped: true }), on("dog", ISAMARU, { tapped: true })]), "relic")).toEqual([]);
  });

  it("⛔ the same line on a LAND (synthetic) is never an extra record: a land's raw-oracle parse keeps no payer", () => {
    const LAND = { name: "Synthetic Relic Land", type: "Land", mana: "",
      oracle: "{T}: Add {C}.\nTap an untapped legendary creature you control: Add {G}." };
    expect(extraManaLineProducts(LAND, manaProduction(LAND))).toEqual([]);
    const s = table([on("land", LAND, { tapped: true }), on("dog", ISAMARU)]);
    expect(records(s, "land")).toEqual([]);
  });

  it("⛔ an opponent's legendary creature is no payer", () => {
    const s = table([on("relic", RELIC, { tapped: true })], { aiBattlefield: [on("aiDog", ISAMARU, { controller: "ai" })] });
    expect(records(s, "relic")).toEqual([]);
  });
});

describe("the planner: Relic pays with a legend, and its two abilities are two mana", () => {
  it("a tapped Relic and a sick Isamaru cast Fugitive Wizard: Isamaru is tapped, Relic stays as it was", () => {
    const s = table([on("relic", RELIC, { tapped: true }), on("dog", ISAMARU, { sick: true })]);
    const cast = castFrom(s, "h-wiz");
    expect(cast).toBeDefined();
    const out = dispatchAction(s, cast);
    expect({ dog: perm(out, "dog").tapped, relic: perm(out, "relic").tapped, inHand: out.players.user.hand.some((c) => c.id === "h-wiz") })
      .toEqual({ dog: true, relic: true, inHand: false });
  });

  it("an untapped Relic and Isamaru cast Grizzly Bears ({1}{G}): Relic's {T} and its tap-a-legend line both pay", () => {
    const s = table([on("relic", RELIC), on("dog", ISAMARU)]);
    const cast = castFrom(s, "h-bears");
    expect(cast).toBeDefined();
    const out = dispatchAction(s, cast);
    expect({ dog: perm(out, "dog").tapped, relic: perm(out, "relic").tapped }).toEqual({ dog: true, relic: true });
  });

  it("⛔ control: an untapped Relic beside a nonlegendary creature makes one mana — no Bears", () => {
    const s = table([on("relic", RELIC), on("bear", BEARS)]);
    expect(castFrom(s, "h-bears")).toBeUndefined();
    expect(castFrom(s, "h-wiz")).toBeDefined();
  });

  it("⛔ a legendary mana creature taps once: for its own {B} OR as Relic's payer, never both", () => {
    const s = table([on("relic", RELIC, { tapped: true }), on("turnbull", TURNBULL)]);
    const src = manaSources(s, "user");
    expect(canAfford(EMPTY, src, cost({ generic: 1 }))).toBe(true);
    expect(canAfford(EMPTY, src, cost({ generic: 2 }))).toBe(false);
  });
});

describe("the explicit tap", () => {
  it("a tapped Relic is offered for each colour, carrying the legend it taps; taking it taps Isamaru, not Relic", () => {
    const s = table([on("relic", RELIC, { tapped: true }), on("dog", ISAMARU, { sick: true })]);
    expect(taps(s, "relic").map((a) => a.color)).toEqual(["W", "U", "B", "R", "G"]);
    expect(tapFor(s, "relic", "U")).toMatchObject({ extraTaps: ["dog"], noTap: true });
    const out = dispatchAction(s, tapFor(s, "relic", "U"));
    expect({ U: out.players.user.manaPool.U, dog: perm(out, "dog").tapped, relic: perm(out, "relic").tapped }).toEqual({ U: 1, dog: true, relic: true });
    expect(taps(out, "relic")).toEqual([]);
  });

  it("an untapped Relic offers one tap per colour — its {T} line; once that is taken, the tap-a-legend line", () => {
    const s = table([on("relic", RELIC), on("dog", ISAMARU)]);
    expect(taps(s, "relic").map((a) => a.color)).toEqual(["W", "U", "B", "R", "G"]);
    expect(taps(s, "relic").some((a) => a.extraTaps)).toBe(false);
    const first = dispatchAction(s, tapFor(s, "relic", "G"));
    expect({ relic: perm(first, "relic").tapped, dog: perm(first, "dog").tapped }).toEqual({ relic: true, dog: false });
    expect(tapFor(first, "relic", "W")).toMatchObject({ extraTaps: ["dog"], noTap: true });
    const second = dispatchAction(first, tapFor(first, "relic", "W"));
    expect({ G: second.players.user.manaPool.G, W: second.players.user.manaPool.W, dog: perm(second, "dog").tapped }).toEqual({ G: 1, W: 1, dog: true });
  });

  it("⛔ control: a tapped Relic beside a nonlegendary creature offers nothing", () => {
    expect(taps(table([on("relic", RELIC, { tapped: true }), on("bear", BEARS)]), "relic")).toEqual([]);
  });
});

describe("⛔ one permanent, one tap: a tap-other payer's own mana is not counted again", () => {
  it("Springleaf Drum beside a lone Llanowar Elves makes one mana, not two", () => {
    const s = table([on("drum", DRUM), on("elves", ELVES)]);
    const src = manaSources(s, "user");
    expect(canAfford(EMPTY, src, cost({ generic: 1 }))).toBe(true);
    expect(canAfford(EMPTY, src, cost({ generic: 2 }))).toBe(false);
  });

  it("with a second creature to tap, the Drum and the Elves make two, and no permanent is tapped twice", () => {
    const s = table([on("drum", DRUM), on("elves", ELVES), on("bear", BEARS)]);
    const plan = planPayment(EMPTY, manaSources(s, "user"), cost({ generic: 2 }));
    expect(plan).not.toBe(null);
    const tapped = plan.taps.flatMap((t) => [...(t.noTap ? [] : [t.permanentId]), ...(t.extraTaps || [])]);
    expect(new Set(tapped).size).toBe(tapped.length);
  });
});

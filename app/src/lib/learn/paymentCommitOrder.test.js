/**
 * paymentCommitOrder.test.js — a payer is tapped before its sacrifice (manaModel commitPaymentPlan, 2026-10-21).
 *
 * A plan may spend a self-sacrificing source whose line has no {T} ("{1}, Sacrifice this creature: Add {U}{B}{R}.", "Sacrifice this
 * creature: Add one mana of any color.", Gold, an Eldrazi Spawn) AND name that same permanent as a tap-other payer of a later tap
 * (Urza, Lord High Artificer's "Tap an untapped artifact you control: Add {U}.", Springleaf Drum, Loam Dryad, Supportive Parents).
 * The commit took the taps in plan order: the sacrifice came first and the later tap found no permanent — "Permanent … not found",
 * a dispatch error that ends the game. The board can pay: a player activates mana abilities while paying, in the order they choose
 * (CR 601.2g, 605.3a); a tap needs the permanent untapped (CR 107.5, 701.26a), a sacrifice only that it is on the battlefield
 * (CR 701.21a). Now such a later tap commits just before the sacrifice; every other tap keeps its plan order.
 *
 * Payments run through legalActionsForPlayer + dispatchAction (the Academy's auto-tap) or planPayment / canAfford / commitPaymentPlan
 * on manaSources. Real oracle fixtures: bundled Scryfall data (scryfall-bulk/oracle_cards.json, 2026-10-20).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { _internals, canAfford, commitPaymentPlan, manaSources, planPayment } from "./manaModel.js";

beforeEach(() => _resetIdsForTests());

const card = (name, type, mana, oracle, extra = {}) => ({ name, type, mana, cmc: 0, colors: [], keywords: [], oracle, ...extra });
const FOREST = card("Forest", "Basic Land — Forest", "", "({T}: Add {G}.)");
const ISLAND = card("Island", "Basic Land — Island", "", "({T}: Add {U}.)");
const URZA = card("Urza, Lord High Artificer", "Legendary Creature — Human Artificer", "{2}{U}{U}", "When Urza enters, create a 0/0 colorless Construct artifact creature token with \"This token gets +1/+1 for each artifact you control.\"\nTap an untapped artifact you control: Add {U}.\n{5}: Shuffle your library, then exile the top card. Until end of turn, you may play that card without paying its mana cost.", { cmc: 4, colors: ["U"], power: "1", toughness: "4" });
const GOLD = card("Gold", "Token Artifact — Gold", "", "Sacrifice this token: Add one mana of any color.");
const WILD_CANTOR = card("Wild Cantor", "Creature — Human Druid", "{R/G}", "({R/G} can be paid with either {R} or {G}.)\nSacrifice this creature: Add one mana of any color.", { cmc: 1, colors: ["G", "R"], power: "1", toughness: "1" });
const SPRINGLEAF_DRUM = card("Springleaf Drum", "Artifact", "{1}", "{T}, Tap an untapped creature you control: Add one mana of any color.", { cmc: 1 });
const CROSIS_ATTENDANT = card("Crosis's Attendant", "Artifact Creature — Golem", "{5}", "{1}, Sacrifice this creature: Add {U}{B}{R}.", { cmc: 5, power: "3", toughness: "3" });
const LOAM_DRYAD = card("Loam Dryad", "Creature — Dryad Horror", "{G}", "{T}, Tap an untapped creature you control: Add one mana of any color.", { cmc: 1, colors: ["G"], power: "1", toughness: "1" });
const SPAWN = card("Eldrazi Spawn", "Token Creature — Eldrazi Spawn", "", "Sacrifice this creature: Add {C}.", { power: "0", toughness: "1" });
const PARENTS = card("Supportive Parents", "Creature — Human Citizen", "{2}{G}", "Tap two untapped creatures you control: Add one mana of any color.", { cmc: 3, colors: ["G"], power: "3", toughness: "3" });
const RELIC = card("Darksteel Relic", "Artifact", "{0}", "Indestructible (Effects that say \"destroy\" don't destroy this artifact.)", { keywords: ["Indestructible"] });
// The spells cast.
const BALEFUL_STRIX = card("Baleful Strix", "Artifact Creature — Bird", "{U}{B}", "Flying, deathtouch\nWhen this creature enters, draw a card.", { cmc: 2, colors: ["B", "U"], keywords: ["Deathtouch", "Flying"], power: "1", toughness: "1" });
const YAVIMAYA_BARBARIAN = card("Yavimaya Barbarian", "Creature — Elf Barbarian", "{R}{G}", "Protection from blue", { cmc: 2, colors: ["G", "R"], keywords: ["Protection"], power: "2", toughness: "2" });
const GLINT_EYE = card("Glint-Eye Nephilim", "Creature — Nephilim", "{U}{B}{R}{G}", "Whenever this creature deals combat damage to a player, draw that many cards.\n{1}, Discard a card: This creature gets +1/+1 until end of turn.", { cmc: 4, colors: ["B", "G", "R", "U"], power: "2", toughness: "2" });

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
const cost = (c) => ({ generic: 0, W: 0, U: 0, B: 0, R: 0, G: 0, C: 0, hybrid: [], ...c });
const plan = (s, c) => planPayment(s.players.user.manaPool, manaSources(s, "user"), c);
const affords = (s, c) => canAfford(s.players.user.manaPool, manaSources(s, "user"), c);
const onField = (s) => s.players.user.battlefield.map((p) => p.id).sort();
const tapped = (s) => s.players.user.battlefield.filter((p) => p.tapped).map((p) => p.id).sort();
const unpaid = (s) => (s.log || []).filter((e) => /cost-unpaid/.test(e.event || ""));
const order = (p) => _internals.payersBeforeTheirSacrifice(p.taps).map((t) => t.permanentId);
/** The permanents the commit tapped, in the order they became tapped (each tap's payers, then its own {T}). */
const tapEvents = (s) => (s.pendingTapEvents || []).map((e) => e.id);
/** Commit a plan, recording a throw as an assertion failure (the crash this file witnesses), never as a crash of the test. */
function commits(s, p) {
  let out = null;
  expect(() => { out = commitPaymentPlan(s, "user", p); }).not.toThrow();
  return out;
}

describe("⛔ a permanent tapped as a payer is tapped before the same plan sacrifices it (CR 601.2g, 107.5, 701.21a)", () => {
  it("⭐ Gold and Urza pay Baleful Strix's {U}{B}: Urza taps the Gold for {U}, then the Gold is sacrificed for {B}", () => {
    const s = table({ user: [P("gold", GOLD), P("urza", URZA)], hand: [["h-strix", BALEFUL_STRIX]] });
    const p = plan(s, cost({ U: 1, B: 1 }));
    // The plan spends the Gold before Urza's tap names it as the payer.
    expect(p.taps.map((t) => [t.permanentId, t.extraTaps ?? null])).toEqual([["gold", null], ["urza", ["gold"]]]);
    expect(affords(s, cost({ U: 1, B: 1 }))).toBe(true);
    let out = null;
    expect(() => { out = castIt(s, "h-strix"); }).not.toThrow();
    expect(out.stack.map((o) => o.source?.name)).toEqual(["Baleful Strix"]);
    expect(onField(out)).toEqual(["urza"]); // the Gold is gone; Urza's line has no {T}
    expect(unpaid(out)).toEqual([]);
    expect(out.players.user.manaPool).toEqual(NO_MANA);
  });

  it("⭐ Wild Cantor and Springleaf Drum pay Yavimaya Barbarian's {R}{G}: the Drum taps the Cantor, then the Cantor is sacrificed", () => {
    const s = table({ user: [P("cantor", WILD_CANTOR), P("drum", SPRINGLEAF_DRUM)], hand: [["h-barb", YAVIMAYA_BARBARIAN]] });
    expect(affords(s, cost({ R: 1, G: 1 }))).toBe(true);
    let out = null;
    expect(() => { out = castIt(s, "h-barb"); }).not.toThrow();
    expect(out.stack.map((o) => o.source?.name)).toEqual(["Yavimaya Barbarian"]);
    expect(tapped(out)).toEqual(["drum"]);
    expect(out.players.user.graveyard.map((c) => c.name)).toEqual(["Wild Cantor"]);
    expect(unpaid(out)).toEqual([]);
    expect(out.players.user.manaPool).toEqual(NO_MANA);
  });

  it("⭐ the Cantor becomes tapped before it leaves: the commit records its tap, then its sacrifice", () => {
    const s = table({ user: [P("cantor", WILD_CANTOR), P("drum", SPRINGLEAF_DRUM)] });
    const p = plan(s, cost({ R: 1, G: 1 }));
    expect(p.taps.map((t) => t.permanentId)).toEqual(["cantor", "drum"]);
    const out = commits(s, p);
    expect(order(p)).toEqual(["drum", "cantor"]);
    expect(tapEvents(out)).toEqual(["cantor", "drum"]); // the payer, then the Drum's own {T}
    expect(out.players.user.sacrificedThisTurn.map((c) => c.name)).toEqual(["Wild Cantor"]);
    expect(out.players.user.manaPool).toEqual(NO_MANA);
  });

  it("⭐ a costed self-sacrifice: Forest, Crosis's Attendant and Loam Dryad pay Glint-Eye Nephilim's {U}{B}{R}{G} — the Forest funds the Attendant's {1}, the Dryad taps the Attendant", () => {
    const s = table({ user: [P("f1", FOREST), P("att", CROSIS_ATTENDANT), P("dryad", LOAM_DRYAD)], hand: [["h-glint", GLINT_EYE]] });
    const p = plan(s, cost({ U: 1, B: 1, R: 1, G: 1 }));
    expect(p.taps.map((t) => [t.permanentId, t.extraTaps ?? null])).toEqual([["f1", null], ["att", null], ["dryad", ["att"]]]);
    expect(affords(s, cost({ U: 1, B: 1, R: 1, G: 1 }))).toBe(true);
    let out = null;
    expect(() => { out = castIt(s, "h-glint"); }).not.toThrow();
    expect(out.stack.map((o) => o.source?.name)).toEqual(["Glint-Eye Nephilim"]);
    expect(onField(out)).toEqual(["dryad", "f1"]);
    expect(tapped(out)).toEqual(["dryad", "f1"]);
    expect(unpaid(out)).toEqual([]);
    expect(out.players.user.manaPool).toEqual(NO_MANA);
  });

  it("⭐ the later tap moves to just before the sacrifice and the rest keep their order: Forest, Attendant, Island, Dryad commit as Forest, Dryad, Attendant, Island", () => {
    const s = table({ user: [P("f1", FOREST), P("att", CROSIS_ATTENDANT), P("i1", ISLAND), P("dryad", LOAM_DRYAD)] });
    const c = cost({ U: 2, B: 1, R: 1, G: 1 });
    const p = plan(s, c);
    expect(p.taps.map((t) => t.permanentId)).toEqual(["f1", "att", "dryad", "i1"]);
    expect(affords(s, c)).toBe(true);
    const out = commits(s, p);
    expect(order(p)).toEqual(["f1", "dryad", "att", "i1"]);
    expect(tapEvents(out)).toEqual(["f1", "att", "dryad", "i1"]);
    expect(tapped(out)).toEqual(["dryad", "f1", "i1"]);
    expect(unpaid(out)).toEqual([]);
    expect(out.players.user.manaPool).toEqual(NO_MANA);
  });

  it("⭐ not the next tap: Gold, Island and Urza pay {B}{U}{U} — Urza's tap of the Gold commits before the Gold, the Island after", () => {
    const s = table({ user: [P("gold", GOLD), P("i1", ISLAND), P("urza", URZA)] });
    const c = cost({ B: 1, U: 2 });
    const p = plan(s, c);
    expect(p.taps.map((t) => t.permanentId)).toEqual(["gold", "i1", "urza"]);
    expect(affords(s, c)).toBe(true);
    const out = commits(s, p);
    expect(order(p)).toEqual(["urza", "gold", "i1"]);
    expect(tapEvents(out)).toEqual(["gold", "i1"]); // the Gold as Urza's payer, before the Island
    expect(onField(out)).toEqual(["i1", "urza"]);
    expect(unpaid(out)).toEqual([]);
    expect(out.players.user.manaPool).toEqual(NO_MANA);
  });

  it("⭐ both payers sacrificed: Wild Cantor, an Eldrazi Spawn and Supportive Parents pay {C}{R}{G} — Parents taps both before either leaves, and commits once", () => {
    const s = table({ user: [P("cantor", WILD_CANTOR), P("spawn", SPAWN), P("parents", PARENTS)] });
    const c = cost({ C: 1, R: 1, G: 1 });
    const p = plan(s, c);
    expect(p.taps.map((t) => [t.permanentId, t.extraTaps ?? null])).toEqual([["spawn", null], ["cantor", null], ["parents", ["cantor", "spawn"]]]);
    expect(affords(s, c)).toBe(true);
    const out = commits(s, p);
    expect(order(p)).toEqual(["parents", "spawn", "cantor"]);
    expect(tapEvents(out)).toEqual(["cantor", "spawn"]);
    expect(onField(out)).toEqual(["parents"]);
    expect(unpaid(out)).toEqual([]);
    expect(out.players.user.manaPool).toEqual(NO_MANA);
  });

  it("⭐ two Eldrazi Spawn and Supportive Parents pay {C}{C}{1}: Parents taps both Spawn, then each is sacrificed", () => {
    const s = table({ user: [P("s1", SPAWN), P("s2", SPAWN), P("parents", PARENTS)] });
    const c = cost({ C: 2, generic: 1 });
    const p = plan(s, c);
    expect(p.taps.map((t) => t.permanentId)).toEqual(["s1", "s2", "parents"]);
    expect(affords(s, c)).toBe(true);
    const out = commits(s, p);
    expect(order(p)).toEqual(["parents", "s1", "s2"]);
    expect(tapEvents(out)).toEqual(["s1", "s2"]);
    expect(onField(out)).toEqual(["parents"]);
    expect(unpaid(out)).toEqual([]);
    expect(out.players.user.manaPool).toEqual(NO_MANA);
  });
});

describe("controls — what the fix leaves as it was", () => {
  it("an ordinary board: a Forest and an Island pay {G}{U} in plan order", () => {
    const s = table({ user: [P("f1", FOREST), P("i1", ISLAND)] });
    const p = plan(s, cost({ G: 1, U: 1 }));
    const out = commitPaymentPlan(s, "user", p);
    expect(tapEvents(out)).toEqual(p.taps.map((t) => t.permanentId));
    expect(tapped(out)).toEqual(["f1", "i1"]);
    expect(out.players.user.manaPool).toEqual(NO_MANA);
  });

  it("a self-sacrificing source that is no payer: Gold and an Island pay {U}{B} — the Gold is sacrificed first, as planned", () => {
    const s = table({ user: [P("gold", GOLD), P("i1", ISLAND)] });
    const p = plan(s, cost({ U: 1, B: 1 }));
    expect(p.taps.map((t) => t.permanentId)).toEqual(["gold", "i1"]);
    const out = commitPaymentPlan(s, "user", p);
    expect(tapEvents(out)).toEqual(["i1"]);
    expect(onField(out)).toEqual(["i1"]);
    expect(tapped(out)).toEqual(["i1"]);
    expect(out.players.user.manaPool).toEqual(NO_MANA);
  });

  it("a payer that is not sacrificed: Urza taps Darksteel Relic for {U}", () => {
    const s = table({ user: [P("urza", URZA), P("relic", RELIC)] });
    const p = plan(s, cost({ U: 1 }));
    expect(p.taps.map((t) => [t.permanentId, t.extraTaps ?? null])).toEqual([["urza", ["relic"]]]);
    const out = commitPaymentPlan(s, "user", p);
    expect(tapEvents(out)).toEqual(["relic"]);
    expect(tapped(out)).toEqual(["relic"]);
    expect(out.players.user.manaPool).toEqual(NO_MANA);
  });

  it("a payer already planned before its sacrifice: Gold and Urza pay {2} — Urza's tap of the Gold, then the Gold, as planned", () => {
    const s = table({ user: [P("gold", GOLD), P("urza", URZA)] });
    const p = plan(s, cost({ generic: 2 }));
    expect(p.taps.map((t) => t.permanentId)).toEqual(["urza", "gold"]);
    const out = commitPaymentPlan(s, "user", p);
    expect(tapEvents(out)).toEqual(["gold"]);
    expect(onField(out)).toEqual(["urza"]);
    expect(out.players.user.manaPool).toEqual(NO_MANA);
  });

  it("a costed self-sacrifice that is no payer: two Forests and Crosis's Attendant pay {U}{B}{R}{G} — Loam Dryad stays untapped", () => {
    const s = table({ user: [P("f1", FOREST), P("f2", FOREST), P("att", CROSIS_ATTENDANT), P("dryad", LOAM_DRYAD)] });
    const c = cost({ U: 1, B: 1, R: 1, G: 1 });
    const p = plan(s, c);
    expect(p.taps.map((t) => t.permanentId)).toEqual(["f1", "att", "f2"]);
    expect(affords(s, c)).toBe(true);
    const out = commitPaymentPlan(s, "user", p);
    expect(onField(out)).toEqual(["dryad", "f1", "f2"]);
    expect(tapEvents(out)).toEqual(["f1", "f2"]);
    expect(tapped(out)).toEqual(["f1", "f2"]);
    expect(out.players.user.manaPool).toEqual(NO_MANA);
  });
});

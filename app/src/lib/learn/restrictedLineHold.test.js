/**
 * restrictedLineHold.test.js — the automatic payment holds a restricted-line permanent back: Cavern of Souls, Mech Hangar, Eldrazi
 * Temple and the rest (a permanent with a spend-restricted mana line beside an unrestricted one) are spent LAST — after every
 * unrestricted source — unless this payment is one their restricted line applies to (manaModel planPayment, 2026-10-21).
 *
 * The owner's decision (2026-10-21): until the engine can reason about when to spend such a land, the auto-tap keeps it untapped
 * and plays with reason. Before, a payment its restricted line could not pay judged the permanent by its plain {C} alone and
 * promoted it FIRST for generic (Grizzly Bears beside Cavern of Souls tapped the Cavern for the {1}). Now planPayment's second plan
 * (the whole-board judgment) holds the permanent behind every unrestricted repeatable source — for a colored, hybrid or generic
 * pip, in the costed pass's funding call too — and before a one-shot sacrifice source (a Treasure is spent for good). When this
 * payment may spend its restricted line (the spend context matches and the line's whole output fits the cost — the planner's own
 * admission), the permanent is judged exactly as before. The first plan still decides affordability (canAfford runs it alone), so
 * a cost only the held permanent can pay still uses it and no cost becomes payable or unpayable.
 *
 * Every payment runs through legalActionsForPlayer + dispatchAction (the auto-tap of a person's cast and of the AI's) unless said.
 * Real oracle fixtures: bundled Scryfall oracle_cards.json (2026-10-21).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { canAfford, manaSources, planPayment } from "./manaModel.js";

beforeEach(() => _resetIdsForTests());

const card = (name, type, mana, oracle, extra = {}) => ({ name, type, mana, cmc: 0, colors: [], keywords: [], oracle, ...extra });
const FOREST = card("Forest", "Basic Land — Forest", "", "({T}: Add {G}.)");
const ISLAND = card("Island", "Basic Land — Island", "", "({T}: Add {U}.)");
const PLAINS = card("Plains", "Basic Land — Plains", "", "({T}: Add {W}.)");
const MOUNTAIN = card("Mountain", "Basic Land — Mountain", "", "({T}: Add {R}.)");
const SWAMP = card("Swamp", "Basic Land — Swamp", "", "({T}: Add {B}.)");
const CAVERN = card("Cavern of Souls", "Land", "", "As this land enters, choose a creature type.\n{T}: Add {C}.\n{T}: Add one mana of any color. Spend this mana only to cast a creature spell of the chosen type, and that spell can't be countered.");
const MECH_HANGAR = card("Mech Hangar", "Land", "", "{T}: Add {C}.\n{T}: Add one mana of any color. Spend this mana only to cast a Pilot or Vehicle spell.\n{3}, {T}: Target Vehicle becomes an artifact creature until end of turn.");
const ELDRAZI_TEMPLE = card("Eldrazi Temple", "Land", "", "{T}: Add {C}.\n{T}: Add {C}{C}. Spend this mana only to cast colorless Eldrazi spells or activate abilities of colorless Eldrazi.");
const TABLET = card("Tablet of Discovery", "Artifact", "{2}{R}", "When this artifact enters, mill a card. You may play that card this turn. (To mill a card, put the top card of your library into your graveyard.)\n{T}: Add {R}.\n{T}: Add {R}{R}. Spend this mana only to cast instant and sorcery spells.", { cmc: 3, colors: ["R"], keywords: ["Mill"] });
const LLANOWAR = card("Llanowar Elves", "Creature — Elf Druid", "{G}", "{T}: Add {G}.", { cmc: 1, colors: ["G"], power: "1", toughness: "1" });
const SIMIC_SIGNET = card("Simic Signet", "Artifact", "{2}", "{1}, {T}: Add {G}{U}.", { cmc: 2 });
const TREASURE = { ...card("Treasure", "Token Artifact — Treasure", "", "{T}, Sacrifice this token: Add one mana of any color."), token: true };
// The spells cast.
const BEARS = card("Grizzly Bears", "Creature — Bear", "{1}{G}", "", { cmc: 2, colors: ["G"], power: "2", toughness: "2" });
const DIVINATION = card("Divination", "Sorcery", "{2}{U}", "Draw two cards.", { cmc: 3, colors: ["U"] });
const ELVISH_VISIONARY = card("Elvish Visionary", "Creature — Elf Shaman", "{1}{G}", "When this creature enters, draw a card.", { cmc: 2, colors: ["G"], power: "1", toughness: "1" });
const CHAMPION = card("Champion of the Parish", "Creature — Human Soldier", "{W}", "Whenever another Human you control enters, put a +1/+1 counter on this creature.", { cmc: 1, colors: ["W"], power: "1", toughness: "1" });
const COPTER = card("Smuggler's Copter", "Artifact — Vehicle", "{2}", "Flying\nWhenever this Vehicle attacks or blocks, you may draw a card. If you do, discard a card.\nCrew 1 (Tap any number of creatures you control with total power 1 or more: This Vehicle becomes an artifact creature until end of turn.)", { cmc: 2, keywords: ["Flying", "Crew"], power: "3", toughness: "3" });
const MATTER_RESHAPER = card("Matter Reshaper", "Creature — Eldrazi", "{2}{C}", "({C} represents colorless mana.)\nWhen this creature dies, reveal the top card of your library. You may put that card onto the battlefield if it's a permanent card with mana value 3 or less. Otherwise, put that card into your hand.", { cmc: 3, power: "3", toughness: "2" });
const GOBLIN_GUIDE = card("Goblin Guide", "Creature — Goblin Scout", "{R}", "Haste\nWhenever this creature attacks, defending player reveals the top card of their library. If it's a land card, that player puts it into their hand.", { cmc: 1, colors: ["R"], keywords: ["Haste"], power: "2", toughness: "2" });
const BOLT = card("Lightning Bolt", "Instant", "{R}", "Lightning Bolt deals 3 damage to any target.", { cmc: 1, colors: ["R"] });
const STRIKE = card("Lightning Strike", "Instant", "{1}{R}", "Lightning Strike deals 3 damage to any target.", { cmc: 2, colors: ["R"] });
const BOROS_RECRUIT = card("Boros Recruit", "Creature — Goblin Soldier", "{R/W}", "({R/W} can be paid with either {R} or {W}.)\nFirst strike", { cmc: 1, colors: ["R", "W"], keywords: ["First strike"], power: "1", toughness: "1" });
const COILING_ORACLE = card("Coiling Oracle", "Creature — Snake Elf Druid", "{G}{U}", "When this creature enters, reveal the top card of your library. If it's a land card, put it onto the battlefield. Otherwise, put that card into your hand.", { cmc: 2, colors: ["G", "U"], power: "1", toughness: "1" });
const MIND_STONE = card("Mind Stone", "Artifact", "{2}", "{T}: Add {C}.\n{1}, {T}, Sacrifice this artifact: Draw a card.", { cmc: 2 });

const NO_MANA = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };
/** A main phase of `seat`'s turn: its battlefield and hand as given. */
function table({ seat = "user", board = [], hand = [] } = {}) {
  const g = createGameState({ userDeck: [], aiDeck: [] });
  return { ...g, turn: 6, activePlayer: seat, priorityHolder: seat, phase: "precombat-main", step: "main", stack: [], pendingTriggers: [],
    players: { ...g.players, [seat]: { ...g.players[seat], battlefield: board, hand: hand.map(([id, c]) => ({ ...c, id })), library: [{ ...FOREST, id: `lib-${seat}` }], manaPool: { ...NO_MANA } } } };
}
const P = (id, c, extra = {}, seat = "user") => ({ ...createPermanent({ id, card: { ...c, id: `c-${id}` }, controller: seat, summoningSick: false }), ...extra });
function castIt(s, cardId, seat = "user") {
  const a = legalActionsForPlayer(s, seat).find((x) => x.kind === "cast-spell" && x.cardId === cardId);
  if (!a) throw new Error(`${cardId} is not offered`);
  return dispatchAction(s, a);
}
const tapped = (s, seat = "user") => s.players[seat].battlefield.filter((p) => p.tapped).map((p) => p.id).sort();
const onBattlefield = (s, id, seat = "user") => s.players[seat].battlefield.some((p) => p.id === id);
const cost = (c) => ({ generic: 0, W: 0, U: 0, B: 0, R: 0, G: 0, C: 0, hybrid: [], ...c });
const cavern = (id, type, seat = "user") => P(id, CAVERN, { chosenType: type }, seat);

describe("a payment its restricted line can't pay spends the land last", () => {
  it("Cavern of Souls (Human), first on the battlefield, beside two Forests: Grizzly Bears taps both Forests and keeps the Cavern", () => {
    const s = table({ board: [cavern("cavern", "Human"), P("f1", FOREST), P("f2", FOREST)], hand: [["h-bears", BEARS]] });
    expect(tapped(castIt(s, "h-bears"))).toEqual(["f1", "f2"]);
  });

  it("Divination's {2} is paid with the Islands, not the Cavern's {C}", () => {
    const s = table({ board: [P("i1", ISLAND), cavern("cavern", "Human"), P("i2", ISLAND), P("i3", ISLAND)], hand: [["h-div", DIVINATION]] });
    expect(tapped(castIt(s, "h-div"))).toEqual(["i1", "i2", "i3"]);
  });

  it("the same board, a Cavern naming Elf: Grizzly Bears (not an Elf) keeps the Cavern …", () => {
    const s = table({ board: [P("f1", FOREST), cavern("cavern", "Elf"), P("f2", FOREST), P("elves", LLANOWAR)], hand: [["h-bears", BEARS]] });
    expect(tapped(castIt(s, "h-bears"))).toEqual(["f1", "f2"]);
  });

  it("Mech Hangar beside two Forests: Grizzly Bears (not a Pilot or Vehicle) keeps the Hangar", () => {
    const s = table({ board: [P("hangar", MECH_HANGAR), P("f1", FOREST), P("f2", FOREST)], hand: [["h-bears", BEARS]] });
    const out = castIt(s, "h-bears");
    expect(tapped(out)).toEqual(["f1", "f2"]);
    expect(out.players.user.restrictedMana ?? []).toEqual([]);
  });

  it("Eldrazi Temple beside two Forests: Grizzly Bears (not an Eldrazi) keeps the Temple", () => {
    const s = table({ board: [P("f1", FOREST), P("f2", FOREST), P("temple", ELDRAZI_TEMPLE)], hand: [["h-bears", BEARS]] });
    expect(tapped(castIt(s, "h-bears"))).toEqual(["f1", "f2"]);
  });

  it("a colored unrestricted line is held too: Tablet of Discovery and a Mountain — Goblin Guide's {R} taps the Mountain", () => {
    const s = table({ board: [P("tablet", TABLET), P("m1", MOUNTAIN)], hand: [["h-guide", GOBLIN_GUIDE]] });
    expect(tapped(castIt(s, "h-guide"))).toEqual(["m1"]);
  });

  it("the line must fit the payment: Lightning Bolt's one {R} can't spend the Tablet's {R}{R}, so the Mountain pays it", () => {
    const s = table({ board: [P("tablet", TABLET), P("m1", MOUNTAIN)], hand: [["h-bolt", BOLT]] });
    const a = legalActionsForPlayer(s, "user").find((x) => x.kind === "cast-spell" && x.cardId === "h-bolt");
    expect(a).toBeTruthy();
    const plan = planPayment(s.players.user.manaPool, manaSources(s, "user"), a.cost, { castCard: { ...BOLT, id: "h-bolt" } });
    expect(plan.taps.map((t) => t.permanentId)).toEqual(["m1"]);
  });

  it("a hybrid pip takes its other option before a held source: Boros Recruit's {R/W} beside Tablet of Discovery and a Plains taps the Plains", () => {
    const s = table({ board: [P("tablet", TABLET), P("p1", PLAINS)], hand: [["h-recruit", BOROS_RECRUIT]] });
    expect(tapped(castIt(s, "h-recruit"))).toEqual(["p1"]);
  });

  it("the costed pass's funding call holds it too: Coiling Oracle funds Simic Signet from a Forest, the Cavern untapped", () => {
    const s = table({ board: [cavern("cavern", "Human"), P("f1", FOREST), P("f2", FOREST), P("signet", SIMIC_SIGNET)], hand: [["h-oracle", COILING_ORACLE]] });
    expect(tapped(castIt(s, "h-oracle"))).toEqual(["f1", "signet"]);
  });

  it("behind every unrestricted source, a creature included: Grizzly Bears beside Llanowar Elves, Mech Hangar and a Forest taps the Elves and the Forest", () => {
    const s = table({ board: [P("elves", LLANOWAR), P("hangar", MECH_HANGAR), P("f1", FOREST)], hand: [["h-bears", BEARS]] });
    expect(tapped(castIt(s, "h-bears"))).toEqual(["elves", "f1"]);
  });

  it("every seat's auto-tap: the AI's Grizzly Bears beside its Cavern of Souls (Human) and two Forests keeps the Cavern", () => {
    const s = table({ seat: "ai", board: [cavern("cavern", "Human", "ai"), P("f1", FOREST, {}, "ai"), P("f2", FOREST, {}, "ai")], hand: [["h-bears", BEARS]] });
    expect(tapped(castIt(s, "h-bears", "ai"), "ai")).toEqual(["f1", "f2"]);
  });
});

describe("controls — the payment its restricted line applies to, and a cost only the land can pay", () => {
  it("the reason stands: Cavern of Souls (Elf) pays Elvish Visionary's {1} in its board place, ahead of the second Forest", () => {
    const s = table({ board: [P("f1", FOREST), cavern("cavern", "Elf"), P("f2", FOREST), P("elves", LLANOWAR)], hand: [["h-vis", ELVISH_VISIONARY]] });
    expect(tapped(castIt(s, "h-vis"))).toEqual(["cavern", "f1"]);
  });

  it("a Human cast off the Cavern's line: Champion of the Parish's {W} — the Cavern is the only white source — enters the stack uncounterable", () => {
    const s = table({ board: [cavern("cavern", "Human"), P("f1", FOREST)], hand: [["h-champ", CHAMPION]] });
    const out = castIt(s, "h-champ");
    expect(tapped(out)).toEqual(["cavern"]);
    expect(out.stack.find((o) => o.kind === "spell")?.uncounterable).toBe(true);
  });

  it("a Vehicle may spend Mech Hangar: Smuggler's Copter's {2} taps the Hangar in its board place", () => {
    const s = table({ board: [P("hangar", MECH_HANGAR), P("f1", FOREST), P("f2", FOREST)], hand: [["h-copter", COPTER]] });
    expect(tapped(castIt(s, "h-copter"))).toEqual(["f1", "hangar"]);
  });

  it("an Eldrazi may spend Eldrazi Temple: Matter Reshaper's {2}{C} taps the Temple", () => {
    const s = table({ board: [P("f1", FOREST), P("f2", FOREST), P("temple", ELDRAZI_TEMPLE)], hand: [["h-reshaper", MATTER_RESHAPER]] });
    expect(tapped(castIt(s, "h-reshaper"))).toContain("temple");
  });

  it("an instant the Tablet's {R}{R} fits: Lightning Strike's {1}{R} taps the Tablet and the Mountain", () => {
    const s = table({ board: [P("tablet", TABLET), P("m1", MOUNTAIN)], hand: [["h-strike", STRIKE]] });
    expect(tapped(castIt(s, "h-strike"))).toEqual(["m1", "tablet"]);
  });

  it("a cost only the held land can pay still uses it: Grizzly Bears beside Cavern of Souls (Human) and one Forest", () => {
    const s = table({ board: [cavern("cavern", "Human"), P("f1", FOREST)], hand: [["h-bears", BEARS]] });
    expect(tapped(castIt(s, "h-bears"))).toEqual(["cavern", "f1"]);
  });

  it("before a one-shot source: Mind Stone's {2} beside Cavern of Souls (Human) and two Treasures taps the Cavern and cracks one Treasure", () => {
    const s = table({ board: [cavern("cavern", "Human"), P("t1", TREASURE), P("t2", TREASURE)], hand: [["h-stone", MIND_STONE]] });
    const out = castIt(s, "h-stone");
    expect({ tapped: tapped(out), treasuresLeft: ["t1", "t2"].filter((id) => onBattlefield(out, id)).length }).toEqual({ tapped: ["cavern"], treasuresLeft: 1 });
  });

  it("affordability pin: Swamp, Cavern of Souls and Simic Signet pay {U}{B}{G} only with the Cavern funding the Signet — the held plan pays nothing, the first plan stands", () => {
    const s = table({ board: [P("sw", SWAMP), cavern("cavern", "Human"), P("signet", SIMIC_SIGNET)] });
    const src = manaSources(s, "user");
    const c = cost({ U: 1, B: 1, G: 1 });
    expect(canAfford(NO_MANA, src, c)).toBe(true);
    const plan = planPayment(NO_MANA, src, c);
    expect(plan.taps.map((t) => t.permanentId).sort()).toEqual(["cavern", "signet", "sw"]);
  });

  it("affordability pin: Cavern of Souls (Human) alone can't pay Divination — nothing new is offered", () => {
    const s = table({ board: [cavern("cavern", "Human"), P("f1", FOREST), P("f2", FOREST)], hand: [["h-div", DIVINATION]] });
    expect(legalActionsForPlayer(s, "user").some((x) => x.kind === "cast-spell" && x.cardId === "h-div")).toBe(false);
  });
});

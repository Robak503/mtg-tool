/**
 * threeTreeCity.test.js — Three Tree City (the play-weighted program, P·7, 2026-10-01: EDHREC rank #178).
 *
 *   "As Three Tree City enters, choose a creature type.
 *    {T}: Add {C}.
 *    {2}, {T}: Choose a color. Add an amount of mana of that color equal to the number of creatures you control of the
 *    chosen type."
 *
 * The costed line rides as an extra mana record (manaModel.extraManaLineProducts): any one colour, sized live by
 * countForSpec's creaturesOfSourceChosenType — the creatures of the type THIS land chose as it entered (CR 614.12, the
 * stamped chosenType; a changeling counts for every type, CR 702.73a) — behind the {2} the planner funds from other mana
 * before the line produces (the free-activation fix). The land gate reads the card's own name in the chooser (CR 201.5).
 * Before this slice the line was credited off a land-fallback {C} and never offered.
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-10-01).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { extraManaLineProducts, manaProduction, manaSources } from "./manaModel.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const TTC = { name: "Three Tree City", type: "Legendary Land", mana: "", cmc: 0, colors: [], keywords: [],
  oracle: "As Three Tree City enters, choose a creature type.\n{T}: Add {C}.\n{2}, {T}: Choose a color. Add an amount of mana of that color equal to the number of creatures you control of the chosen type." };
const FOREST = { name: "Forest", type: "Basic Land — Forest", mana: "", cmc: 0, colors: [], keywords: [], oracle: "({T}: Add {G}.)" };
const ELF = { name: "Elvish Visionary", type: "Creature — Elf Shaman", mana: "{1}{G}", cmc: 2, colors: ["G"], power: "1", toughness: "1", keywords: [], oracle: "When this creature enters, draw a card." };
const GOBLIN = { name: "Goblin Piker", type: "Creature — Goblin Warrior", mana: "{1}{R}", cmc: 2, colors: ["R"], power: "2", toughness: "1", keywords: [], oracle: "" };
const CHANGELING = { name: "Changeling Outcast", type: "Creature — Shapeshifter", mana: "{B}", cmc: 1, colors: ["B"], power: "1", toughness: "1", keywords: ["Changeling"],
  oracle: "Changeling (This card is every creature type.)\nThis creature can't block and can't be blocked." };
const TIDINGS = { name: "Tidings", type: "Sorcery", mana: "{3}{U}{U}", cmc: 5, colors: ["U"], keywords: [], oracle: "Draw four cards." };

const on = (id, card, extra = {}) => ({ ...createPermanent({ id, card: { id: `c-${id}`, ...card }, controller: "user", summoningSick: false }), ...extra });
const creatures = (card, n, prefix) => Array.from({ length: n }, (_, i) => on(`${prefix}${i}`, card));
function table(battlefield, { hand = [TIDINGS] } = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return { ...s, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
    players: { ...s.players, user: { ...s.players.user, battlefield, hand: hand.map((c, i) => ({ ...c, id: `h${i}` })), landsPlayedThisTurn: 0,
      library: Array.from({ length: 6 }, (_, i) => ({ ...FOREST, id: `lib${i}` })) } } };
}
const castsTidings = (s) => legalActionsForPlayer(s, "user").some((a) => a.kind === "cast-spell" && a.name === "Tidings");

describe("the card", () => {
  it("a covered land; the costed line is an any-colour extra record sized by the land's chosen type, behind {2}", () => {
    const extras = extraManaLineProducts(TTC, manaProduction(TTC)).map(({ colors, amountSpec, activationCost }) => ({ colors, amountSpec, generic: activationCost?.generic }));
    expect({ tier: classifyCard(TTC), extras }).toEqual({
      tier: "land",
      extras: [{ colors: ["W", "U", "B", "R", "G"], amountSpec: { kind: "creaturesOfSourceChosenType" }, generic: 2 }],
    });
  });

  it("fence (synthetic): a non-mana cost item in front of the line is never dropped — the line stays unread", () => {
    const sacFirst = { ...TTC, oracle: TTC.oracle.replace("{2}, {T}:", "{2}, Sacrifice a creature, {T}:") };
    expect(extraManaLineProducts(sacFirst, manaProduction(sacFirst)).some((e) => e.amountSpec?.kind === "creaturesOfSourceChosenType")).toBe(false);
  });
});

describe("in play", () => {
  it("played as the land drop, it chooses the creature type the board shows most (CR 614.12)", () => {
    const s0 = table([...creatures(ELF, 3, "e"), ...creatures(GOBLIN, 1, "g")], { hand: [TTC] });
    const play = legalActionsForPlayer(s0, "user").find((a) => a.kind === "play-land" && a.cardId === "h0");
    const s = dispatchAction(s0, play);
    expect(s.players.user.battlefield.find((p) => p.card?.name === "Three Tree City")?.chosenType).toBe("Elf");
  });

  it("Elf chosen, five Elves: two Forests pay the {2} and it makes five blue — Tidings ({3}{U}{U}) from a green board (WITNESS)", () => {
    const s = table([on("ttc", TTC, { chosenType: "Elf" }), on("f1", FOREST), on("f2", FOREST), ...creatures(ELF, 5, "e")]);
    const cast = legalActionsForPlayer(s, "user").find((a) => a.kind === "cast-spell" && a.name === "Tidings");
    const n = cast ? dispatchAction(s, cast) : null;
    const witness = { castable: !!cast, tapped: n ? n.players.user.battlefield.filter((p) => p.tapped).map((p) => p.id).sort() : null,
      pool: n ? Object.fromEntries(Object.entries(n.players.user.manaPool).filter(([, v]) => v)) : null };
    console.log(`WITNESS threeTreeCity ${JSON.stringify(witness)}`);
    expect(witness).toEqual({ castable: true, tapped: ["f1", "f2", "ttc"], pool: {} });
  });

  it("⛔ the count is the CHOSEN type's: Elf chosen, five Goblins — no big mana, no Tidings", () => {
    expect(castsTidings(table([on("ttc", TTC, { chosenType: "Elf" }), on("f1", FOREST), on("f2", FOREST), ...creatures(GOBLIN, 5, "g")]))).toBe(false);
  });

  it("⛔ it never pays its own {2}: with no other mana source the line can't be activated", () => {
    expect(castsTidings(table([on("ttc", TTC, { chosenType: "Elf" }), ...creatures(ELF, 9, "e")]))).toBe(false);
  });

  it("a changeling counts as the chosen type: four Elves and a Changeling Outcast make five", () => {
    expect(castsTidings(table([on("ttc", TTC, { chosenType: "Elf" }), on("f1", FOREST), on("f2", FOREST), ...creatures(ELF, 4, "e"), on("ch", CHANGELING)]))).toBe(true);
  });

  it("⛔ no chosen type stamped: no costed record at all — not even a changeling's 1 (never a guessed type)", () => {
    const s = table([on("ttc", TTC), on("f1", FOREST), on("f2", FOREST), ...creatures(ELF, 5, "e"), on("ch", CHANGELING)]);
    expect({ tidings: castsTidings(s), costedRecords: manaSources(s, "user").filter((r) => r.permanentId === "ttc" && r.activationCost).length })
      .toEqual({ tidings: false, costedRecords: 0 });
  });
});

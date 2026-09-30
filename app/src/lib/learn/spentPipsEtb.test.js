/**
 * spentPipsEtb.test.js — "When this creature enters, if {R}{R} was spent to cast it, …" (shelf deck work, D4, 2026-09-30 —
 * Vibrance, the card the cdh list needed, and the hybrid "was spent" ETB family: Gruul Scrapper, Steamcore Weird,
 * Wistfulness, Catharsis …).
 *
 * The dispatcher's payment plan already knew exactly what it spent ({W,U,B,R,G,C}); it now rides the cast onto the
 * entering permanent (`manaSpentByColor`), and the intervening-if reads it (CR 603.4 — at the trigger and again at
 * resolution). Each pip is a colour of which at least that much was spent, generic mana included ({3} paid with red is
 * red spent). A permanent that wasn't cast spent nothing to cast it → false; an alternative cost the engine doesn't tally
 * → null, never a guess.
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-09-30).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { resolveTopOfStack, flushTriggers, chooseTriggerTargets } from "./gameEngine.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTutorChoice } from "./effects/runProgram.js";
import { enterCardFromZone } from "./effects/atoms/zones.js";
import { permanentHasKeyword } from "./layers.js";
import { evaluateInterveningIf, interveningIfParseable } from "./interveningIf.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const VIBRANCE = { name: "Vibrance", type: "Creature — Elemental Incarnation", mana: "{3}{R/G}{R/G}", cmc: 5, colors: ["R", "G"], power: "4", toughness: "4", keywords: ["Evoke"],
  oracle: "When this creature enters, if {R}{R} was spent to cast it, this creature deals 3 damage to any target.\nWhen this creature enters, if {G}{G} was spent to cast it, search your library for a land card, reveal it, put it into your hand, then shuffle. You gain 2 life.\nEvoke {R/G}{R/G}" };
const GRUUL_SCRAPPER = { name: "Gruul Scrapper", type: "Creature — Human Berserker", mana: "{3}{G}", cmc: 4, colors: ["G"], power: "3", toughness: "2", keywords: [],
  oracle: "When this creature enters, if {R} was spent to cast it, it gains haste until end of turn." };
const STEAMCORE_WEIRD = { name: "Steamcore Weird", type: "Creature — Weird", mana: "{3}{U}", cmc: 4, colors: ["U"], power: "1", toughness: "3", keywords: [],
  oracle: "When this creature enters, if {R} was spent to cast it, it deals 2 damage to any target." };
const WISTFULNESS = { name: "Wistfulness", type: "Creature — Elemental Incarnation", mana: "{3}{G/U}{G/U}", cmc: 5, colors: ["G", "U"], power: "6", toughness: "5", keywords: ["Evoke"],
  oracle: "When this creature enters, if {G}{G} was spent to cast it, exile target artifact or enchantment an opponent controls.\nWhen this creature enters, if {U}{U} was spent to cast it, draw two cards, then discard a card.\nEvoke {G/U}{G/U} (You may cast this spell for its evoke cost. If you do, it's sacrificed when it enters.)" };
const MOUNTAIN = { name: "Mountain", type: "Basic Land — Mountain", mana: "", cmc: 0, colors: [], keywords: [], oracle: "({T}: Add {R}.)" };
const FOREST = { name: "Forest", type: "Basic Land — Forest", mana: "", cmc: 0, colors: [], keywords: [], oracle: "({T}: Add {G}.)" };
const ISLAND = { name: "Island", type: "Basic Land — Island", mana: "", cmc: 0, colors: [], keywords: [], oracle: "({T}: Add {U}.)" };

const land = (id, card) => createPermanent({ id, card: { ...card, id: `c-${id}` }, controller: "user", summoningSick: false });
/** The user in their main phase with `creature` in hand, the given lands untapped, and a Forest on top of the library. */
function board(creature, lands) {
  const g = createGameState({ userDeck: [], aiDeck: [] });
  return { ...g, turn: 5, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main", stack: [], pendingTriggers: [],
    players: { ...g.players,
      user: { ...g.players.user, life: 40, battlefield: lands, hand: [{ ...creature, id: "h-card" }], library: [{ ...FOREST, id: "lib-forest" }, { ...MOUNTAIN, id: "lib-mtn" }] },
      ai: { ...g.players.ai, life: 40, battlefield: [] } } };
}
const mountains = (n) => Array.from({ length: n }, (_, i) => land(`m${i}`, MOUNTAIN));
const forests = (n) => Array.from({ length: n }, (_, i) => land(`f${i}`, FOREST));
/** Cast the hand card through the real offer, then resolve the spell and every trigger; a tutor pause takes the Forest. */
function castAndResolve(s) {
  const cast = legalActionsForPlayer(s, "user").find((a) => a.kind === "cast-spell" && a.cardId === "h-card");
  let out = dispatchAction(s, cast);
  for (let i = 0; i < 20 && ((out.stack || []).length || out.pendingChoice); i++) {
    out = out.pendingChoice ? resolveTutorChoice(out, "lib-forest") : resolveTopOfStack(out);
  }
  return out;
}
const entered = (s) => s.players.user.battlefield.find((p) => p.card?.id === "h-card");

describe("the cards", () => {
  it("⭐ Vibrance reads native, and so does the rest of the ETB family", () => {
    expect([VIBRANCE, GRUUL_SCRAPPER, STEAMCORE_WEIRD, WISTFULNESS].map((c) => classifyCard(c))).toEqual(["native-trigger", "native-trigger", "native-trigger", "native-trigger"]);
  });
  it("the condition is parseable in its self-ETB form only — the spell form and Adamant's wording stay unmodeled", () => {
    expect(interveningIfParseable("{R}{R} was spent to cast it")).toBe(true);
    expect(interveningIfParseable("{W}{U} was spent to cast it")).toBe(true);
    expect(interveningIfParseable("{R}{R} was spent to cast this spell")).toBe(false);
    expect(interveningIfParseable("at least three red mana was spent to cast it")).toBe(false);
  });
});

describe("⭐ the real cast", () => {
  it("⭐ three Mountains and two Forests: both triggers — 3 damage, a land to hand, 2 life", () => {
    const out = castAndResolve(board(VIBRANCE, [...mountains(3), ...forests(2)]));
    const spent = entered(out)?.manaSpentByColor;
    const row = { spent: { R: spent?.R, G: spent?.G }, aiLife: out.players.ai.life, landToHand: out.players.user.hand.some((c) => c.id === "lib-forest"), userLife: out.players.user.life };
    console.log(`WITNESS vibranceSpent ${JSON.stringify(row)}`);
    expect(row).toEqual({ spent: { R: 3, G: 2 }, aiLife: 37, landToHand: true, userLife: 42 });
  });
  it("five Mountains: only the red trigger (no {G}{G} was spent)", () => {
    const out = castAndResolve(board(VIBRANCE, mountains(5)));
    expect({ aiLife: out.players.ai.life, landToHand: out.players.user.hand.some((c) => c.id === "lib-forest"), userLife: out.players.user.life })
      .toEqual({ aiLife: 37, landToHand: false, userLife: 40 });
  });
  it("one Mountain and four Forests: only the green trigger (one red is not {R}{R})", () => {
    const out = castAndResolve(board(VIBRANCE, [...mountains(1), ...forests(4)]));
    expect({ aiLife: out.players.ai.life, landToHand: out.players.user.hand.some((c) => c.id === "lib-forest"), userLife: out.players.user.life })
      .toEqual({ aiLife: 40, landToHand: true, userLife: 42 });
  });
  it("generic mana counts: Gruul Scrapper ({3}{G}) gets haste when a Mountain paid part of the {3}, and not otherwise", () => {
    const red = castAndResolve(board(GRUUL_SCRAPPER, [...mountains(1), ...forests(3)]));
    const green = castAndResolve(board(GRUUL_SCRAPPER, forests(4)));
    expect({ red: permanentHasKeyword(red, entered(red).id, "haste"), green: permanentHasKeyword(green, entered(green).id, "haste") }).toEqual({ red: true, green: false });
  });
  it("Steamcore Weird ({3}{U}) deals its 2 only when red paid for it", () => {
    const red = castAndResolve(board(STEAMCORE_WEIRD, [...mountains(1), land("i0", ISLAND), land("i1", ISLAND), land("i2", ISLAND)]));
    const blue = castAndResolve(board(STEAMCORE_WEIRD, [land("i0", ISLAND), land("i1", ISLAND), land("i2", ISLAND), land("i3", ISLAND)]));
    expect({ red: red.players.ai.life, blue: blue.players.ai.life }).toEqual({ red: 38, blue: 40 });
  });
  it("cast for free (a pending free cast), it records zero spent — and both triggers are refused", () => {
    const g = board(VIBRANCE, mountains(5));
    const s = { ...g, pendingFreeCast: { controller: "user", candidateIds: ["h-card"], maxMv: null, typeFilter: null, sourceName: "a free-cast effect" } };
    const cast = legalActionsForPlayer(s, "user").find((a) => a.kind === "cast-spell" && a.cardId === "h-card" && a.freeCast);
    let out = dispatchAction(s, cast);
    for (let i = 0; i < 20 && ((out.stack || []).length || out.pendingChoice); i++) out = out.pendingChoice ? resolveTutorChoice(out, "lib-forest") : resolveTopOfStack(out);
    expect({ spent: entered(out)?.manaSpentByColor, landsTapped: out.players.user.battlefield.filter((p) => p.tapped).length, aiLife: out.players.ai.life, userLife: out.players.user.life })
      .toEqual({ spent: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 }, landsTapped: 0, aiLife: 40, userLife: 40 });
  });

  it("put onto the battlefield without being cast, nothing was spent to cast it — neither trigger does anything", () => {
    const g = board(VIBRANCE, []);
    const s = { ...g, players: { ...g.players, user: { ...g.players.user, hand: [], graveyard: [{ ...VIBRANCE, id: "h-card" }] } } };
    let { state: out } = enterCardFromZone(s, { playerId: "user", cardId: "h-card", fromZone: "graveyard" });
    // Both triggers are there to be refused — detected on the entry, then dropped by their conditions (not simply absent).
    expect((out.pendingTriggers || []).map((t) => t.descriptor?.interveningIf)).toEqual(["{R}{R} was spent to cast it", "{G}{G} was spent to cast it"]);
    out = flushTriggers(out, { chooseTargets: chooseTriggerTargets });
    for (let i = 0; i < 20 && ((out.stack || []).length || out.pendingChoice); i++) out = out.pendingChoice ? resolveTutorChoice(out, "lib-forest") : resolveTopOfStack(out);
    expect({ refused: (out.log || []).filter((e) => e.kind === "trigger-condition-not-met").length, onBattlefield: !!entered(out), aiLife: out.players.ai.life, landToHand: out.players.user.hand.some((c) => c.id === "lib-forest"), userLife: out.players.user.life })
      .toEqual({ refused: 2, onBattlefield: true, aiLife: 40, landToHand: false, userLife: 40 });
  });
});

describe("the reading", () => {
  const withPermanent = (fields) => {
    const g = createGameState({ userDeck: [], aiDeck: [] });
    const p = { ...createPermanent({ id: "x", card: { ...VIBRANCE, id: "c-x" }, controller: "user", summoningSick: false }), ...fields };
    return { ...g, players: { ...g.players, user: { ...g.players.user, battlefield: [p] } } };
  };
  const read = (s, cond) => evaluateInterveningIf(s, cond, "user", { triggeringPermanentId: "x" });
  it("every pip must be covered: {W}{U} needs a white AND a blue", () => {
    expect(read(withPermanent({ wasCast: true, manaSpentByColor: { W: 1, U: 0, B: 0, R: 0, G: 0, C: 2 } }), "{W}{U} was spent to cast it")).toBe(false);
    expect(read(withPermanent({ wasCast: true, manaSpentByColor: { W: 1, U: 1, B: 0, R: 0, G: 0, C: 0 } }), "{W}{U} was spent to cast it")).toBe(true);
  });
  it("a free cast spent nothing (false); an untallied alternative cost is unknown (null); not cast at all is false", () => {
    expect(read(withPermanent({ wasCast: true, manaSpentByColor: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 } }), "{R} was spent to cast it")).toBe(false);
    expect(read(withPermanent({ wasCast: true }), "{R} was spent to cast it")).toBe(null);
    expect(read(withPermanent({}), "{R} was spent to cast it")).toBe(false);
  });
  it("colorless is not a colour pip: {C} spent never satisfies {R}", () => {
    expect(read(withPermanent({ wasCast: true, manaSpentByColor: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 5 } }), "{R} was spent to cast it")).toBe(false);
  });
});

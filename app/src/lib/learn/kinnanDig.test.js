/**
 * kinnanDig.test.js — CORPUS ④-C (2026-09-03 night): KINNAN, BONDER PRODIGY's dig — "{5}{G}{U}: Look at the top five
 * cards of your library. You may put a non-Human creature card from among them onto the battlefield. Put the rest on
 * the bottom of your library in a random order." Two riders on the proven impulse-dig: the pick ENTERS THE BATTLEFIELD
 * (enterCardFromZone — a real permanent, ETBs fire) and the rest are bottomed in a seeded random order; a negated
 * subtype filter (non-Human — a changeling is a Human too, CR 702.73a). Kinnan's doubler line was already native.
 * Real oracle fixture (bundled Scryfall snapshot, read in-session 2026-09-03). Library cards are synthetic.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { resolveImpulseDigChoice } from "./effects/runProgram.js";
import { parseEffectClause } from "./effects/parser.js";
import { cardMatchesTutorFilter } from "./effects/atoms/library.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const KINNAN = { id: "c-kin", name: "Kinnan, Bonder Prodigy", type: "Legendary Creature — Human Druid", mana: "{G}{U}", mana_cost: "{G}{U}", cmc: 2, power: 2, toughness: 2, keywords: [], oracle: "Whenever you tap a nonland permanent for mana, add one mana of any type that permanent produced.\n{5}{G}{U}: Look at the top five cards of your library. You may put a non-Human creature card from among them onto the battlefield. Put the rest on the bottom of your library in a random order." };
const HUMAN = { id: "l-hum", name: "Synthetic Villager", type: "Creature — Human Peasant", mana: "{W}", cmc: 1, power: 1, toughness: 1, keywords: [], oracle: "" };
const BEAST = { id: "l-beast", name: "Synthetic Beast", type: "Creature — Beast", mana: "{3}{G}", cmc: 4, power: 4, toughness: 4, keywords: [], oracle: "" };
const SHIFTER = { id: "l-shift", name: "Synthetic Shifter", type: "Creature — Shapeshifter", mana: "{2}", cmc: 2, power: 2, toughness: 2, keywords: ["Changeling"], oracle: "Changeling (This card is every creature type.)" };
const INSTANT = { id: "l-inst", name: "Synthetic Instant", type: "Instant", mana: "{U}", cmc: 1, keywords: [], oracle: "" };
const DRAKE = { id: "l-drake", name: "Synthetic Drake", type: "Creature — Drake", mana: "{2}{U}", cmc: 3, power: 2, toughness: 2, keywords: ["Flying"], oracle: "Flying" };
const SIXTH = { id: "l-six", name: "Synthetic Sixth", type: "Sorcery", mana: "{R}", cmc: 1, keywords: [], oracle: "" };

function board() {
  const s0 = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...s0, turn: 6, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
    players: {
      ...s0.players,
      user: { ...s0.players.user, life: 20, hand: [], graveyard: [], library: [HUMAN, BEAST, SHIFTER, INSTANT, DRAKE, SIXTH], battlefield: [createPermanent({ id: "kin", card: KINNAN, controller: "user", summoningSick: false })], manaPool: { W: 0, U: 1, B: 0, R: 0, G: 1, C: 5 } },
      ai: { ...s0.players.ai, life: 20, hand: [], graveyard: [], library: [], battlefield: [] },
    },
  };
}
const dig = (s) => legalActionsForPlayer(s, "user").find((a) => a.kind === "activate-ability" && a.permanentId === "kin");

describe("the parse + the tier", () => {
  it("the dig collapses to impulse-dig with the battlefield + random-rest riders and the negated subtype; Kinnan is native", () => {
    const p = parseEffectClause("Look at the top five cards of your library. You may put a non-Human creature card from among them onto the battlefield. Put the rest on the bottom of your library in a random order.", "Creature");
    expect(p.confidence).toBe("high");
    expect(p.atoms[0]).toMatchObject({ op: "impulse-dig", amount: 5, restTo: "bottom", chosenTo: "battlefield", restOrder: "random", filter: { groups: [["creature"]], notSubtype: "human" } });
    expect(classifyCard(KINNAN)).toMatch(/^native/);
  });
  it("the negated subtype: a Human fails, a Beast passes, a changeling fails (it is every type)", () => {
    const f = { groups: [["creature"]], notSubtype: "human" };
    expect(cardMatchesTutorFilter(HUMAN, f)).toBe(false);
    expect(cardMatchesTutorFilter(BEAST, f)).toBe(true);
    expect(cardMatchesTutorFilter(SHIFTER, f)).toBe(false);
    expect(cardMatchesTutorFilter(INSTANT, f)).toBe(false);
  });
});

describe("runtime — through the dispatcher", () => {
  it("⭐ the pick ENTERS the battlefield; the other four looked-at cards go to the bottom and the sixth card is on top", () => {
    const s = board();
    const act = dig(s);
    expect(act).toBeTruthy();
    const paused = resolveTopOfStack(dispatchAction(s, act));
    expect(paused.pendingChoice).toMatchObject({ kind: "impulse-dig", controller: "user", chosenTo: "battlefield", restOrder: "random", lookedAt: 5 });
    expect(paused.pendingChoice.candidates.map((c) => c.id).sort()).toEqual(["l-beast", "l-drake"]);
    const out = resolveImpulseDigChoice(paused, "l-beast");
    expect(out.players.user.battlefield.some((p) => p.card?.id === "l-beast")).toBe(true);
    expect(out.players.user.hand.length).toBe(0);
    const lib = out.players.user.library;
    expect(lib.length).toBe(5);
    expect(lib[0].id).toBe("l-six"); // the sixth card is on top: the four others went UNDER it
    expect(lib.slice(1).map((c) => c.id).sort()).toEqual(["l-drake", "l-hum", "l-inst", "l-shift"]);
    expect(out.pendingChoice ?? null).toBeNull();
    expect(out.stack).toEqual([]);
  });
  it("declining puts all five on the bottom; nothing enters", () => {
    const s = board();
    const paused = resolveTopOfStack(dispatchAction(s, dig(s)));
    const out = resolveImpulseDigChoice(paused, null);
    expect(out.players.user.battlefield.length).toBe(1);
    expect(out.players.user.library[0].id).toBe("l-six");
    expect(out.players.user.library.length).toBe(6);
  });
  it("the random rest order is seeded (the same board bottoms in the same order twice) and differs from the printed order for this seed or another", () => {
    const s = board();
    const a = resolveImpulseDigChoice(resolveTopOfStack(dispatchAction(s, dig(s))), "l-beast").players.user.library.map((c) => c.id);
    const b = resolveImpulseDigChoice(resolveTopOfStack(dispatchAction(s, dig(s))), "l-beast").players.user.library.map((c) => c.id);
    expect(a).toEqual(b);
    const s2 = { ...s, turn: 9 };
    const c = resolveImpulseDigChoice(resolveTopOfStack(dispatchAction(s2, dig(s2))), "l-beast").players.user.library.map((x) => x.id);
    const printed = ["l-six", "l-hum", "l-shift", "l-inst", "l-drake"];
    expect(a.join() !== printed.join() || c.join() !== printed.join()).toBe(true);
  });
});

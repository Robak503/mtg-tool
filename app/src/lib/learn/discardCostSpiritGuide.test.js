/**
 * discardCostSpiritGuide.test.js — a discard cost is priced without the discarded card's own mana (CR 601.2g, 601.2h) — 2026-11-01.
 *
 * Mana abilities are activated before the costs are paid (CR 601.2g), so a Spirit Guide exiled for mana can't then be discarded,
 * and one discarded can't pay. The payment already knows it (manaModel.castPaymentSources drops the discarded card's hand source);
 * the offer did not: Thrill of Possibility with Simian Spirit Guide and one Mountain offered "discard the Guide", which the
 * dispatcher refuses (MANA_SHORT) — and the AI picked it, so a self-play game ended there and an Academy game re-derived the same
 * pick. Cathartic Reunion's two auto-picked discards took the Guide (the least valuable card) and were refused; the legal line —
 * discard the two other cards while the Guide pays — was never offered. (The castexplode review's F1, its fixtures.)
 */

import { beforeEach, describe, expect, it } from "vitest";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { pickAction } from "./opponentAI.js";

beforeEach(() => _resetIdsForTests());

const SSG = (id) => ({ id, name: "Simian Spirit Guide", type: "Creature — Ape Spirit", mana: "{2}{R}", cmc: 3, power: 2, toughness: 2, keywords: [], colors: ["R"], oracle: "Exile this card from your hand: Add {R}." });
const THRILL = { id: "thr", name: "Thrill of Possibility", type: "Instant", mana: "{1}{R}", cmc: 2, colors: ["R"], oracle: "As an additional cost to cast this spell, discard a card.\nDraw two cards." };
const REUNION = { id: "reu", name: "Cathartic Reunion", type: "Sorcery", mana: "{1}{R}", cmc: 2, colors: ["R"], oracle: "As an additional cost to cast this spell, discard two cards.\nDraw three cards." };
const MOUNTAIN = { name: "Mountain", type: "Basic Land — Mountain", oracle: "({T}: Add {R}.)" };
const big = (id) => ({ id, name: `Big ${id}`, type: "Creature — Giant", mana: "{6}{R}", cmc: 7, power: 7, toughness: 7, colors: ["R"], oracle: "" });
const deck = Array.from({ length: 10 }, (_, i) => ({ id: `l${i}`, name: "Forest", type: "Basic Land — Forest", oracle: "({T}: Add {G}.)" }));

function aiMain(hand, mountains = 1) {
  const s0 = createGameState({ userDeck: deck, aiDeck: deck.map((c) => ({ ...c, id: "a" + c.id })) });
  const battlefield = Array.from({ length: mountains }, (_, i) => createPermanent({ id: `m${i}`, card: { id: `m${i}c`, ...MOUNTAIN }, controller: "ai", summoningSick: false }));
  return { ...s0, phase: "precombat-main", step: "main", activePlayer: "ai", priorityHolder: "ai", consecutivePasses: 0, stack: [],
    players: { ...s0.players, ai: { ...s0.players.ai, hand, battlefield, exile: [] } } };
}
const castsOf = (s, cardId) => legalActionsForPlayer(s, "ai").filter((a) => a.kind === "cast-spell" && a.cardId === cardId);
const dispatches = (s, a) => { try { dispatchAction(s, a); return "ok"; } catch (e) { return e.code || e.message; } };

describe("WITNESS — a discard choice the payment would refuse is never offered", () => {
  it("Thrill of Possibility, Simian Spirit Guide and one Mountain: only 'discard Big g1' — the Guide pays; every offer dispatches", () => {
    const s = aiMain([THRILL, SSG("ssg"), big("g1")]);
    const offers = castsOf(s, "thr");
    expect(offers.map((a) => a.discardCardId)).toEqual(["g1"]);
    expect(offers.map((a) => dispatches(s, a))).toEqual(["ok"]);
  });

  it("the AI's pick for that board dispatches (it used to pick the refused 'discard the Guide')", () => {
    const s = aiMain([THRILL, SSG("ssg"), big("g1")]);
    const pick = pickAction(s, "ai", legalActionsForPlayer(s, "ai"), { archetype: "midrange" });
    expect(dispatches(s, pick)).toBe("ok");
    expect(pick.discardCardId ?? null).not.toBe("ssg");
  });

  it("Cathartic Reunion with the Guide and two 7-drops: the cast discards the two 7-drops while the Guide pays", () => {
    const s = aiMain([REUNION, SSG("ssg"), big("g1"), big("g2")]);
    const offers = castsOf(s, "reu");
    expect(offers.map((a) => [...a.discardIds].sort())).toEqual([["g1", "g2"]]);
    const next = dispatchAction(s, offers[0]);
    expect(next.players.ai.exile.map((c) => c.id)).toEqual(["ssg"]);
    expect(next.players.ai.graveyard.map((c) => c.id).sort()).toEqual(["g1", "g2"]);
  });

  it("no way to pay without the Guide and only the Guide to discard: no offer at all (one Mountain, Thrill, the Guide alone)", () => {
    const s = aiMain([THRILL, SSG("ssg")]);
    expect(castsOf(s, "thr")).toEqual([]);
  });
});

describe("CONTROL — where the Guide isn't needed for mana, discarding it is still offered", () => {
  it("two Mountains: both Thrill discards are offered and both dispatch", () => {
    const s = aiMain([THRILL, SSG("ssg"), big("g1")], 2);
    const offers = castsOf(s, "thr");
    expect(offers.map((a) => a.discardCardId).sort()).toEqual(["g1", "ssg"]);
    expect(offers.map((a) => dispatches(s, a))).toEqual(["ok", "ok"]);
  });

  it("two Mountains: Cathartic Reunion keeps its least-valuable pick, the Guide among the discards", () => {
    const s = aiMain([REUNION, SSG("ssg"), big("g1"), big("g2")], 2);
    const offers = castsOf(s, "reu");
    expect(offers.length).toBe(1);
    expect(offers[0].discardIds).toContain("ssg");
    expect(dispatches(s, offers[0])).toBe("ok");
  });

});

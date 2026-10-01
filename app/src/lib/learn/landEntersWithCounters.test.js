/**
 * landEntersWithCounters.test.js — LANDS-TIER slice 9 (2026-09-03): a LAND that "enters [tapped] with N
 * <kind> counters on it" — the five Vivid lands (charge), the five depletion lands, Gemstone Mine (mining),
 * Tendo Ice Bridge / Blast Zone (charge). The reader (`entersWithNamedCounters`) and the tutor-site placement
 * (resolvers.enterPermanent) already existed; the PLAY-LAND path placed nothing, and the land classifier had
 * no admission for the line. Both are closed on the same reader, with the same counter-kind honesty gate the
 * general path applies (`isHonestEnterCounterKind` — "depletion" and "mining" join the inert vocabulary:
 * their only readers are the modeled remove-a-counter mana abilities).
 *
 * Real oracle fixtures (bundled Scryfall snapshot, read in-session 2026-09-03).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { createGameState, _resetIdsForTests } from "./gameState.js";
import { dispatchAction } from "./actionDispatcher.js";
import { enterPermanent } from "./resolvers.js";
import { entersWithNamedCounters, isHonestEnterCounterKind } from "./staticAbilityParser.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const L = (name, oracle) => ({ id: "c-" + name.replace(/\W+/g, "").toLowerCase(), name, type: "Land", oracle });
const VIVID_MARSH = L("Vivid Marsh", "This land enters tapped with two charge counters on it.\n{T}: Add {B}.\n{T}, Remove a charge counter from this land: Add one mana of any color.");
const HICKORY = L("Hickory Woodlot", "This land enters tapped with two depletion counters on it.\n{T}, Remove a depletion counter from this land: Add {G}{G}. If there are no depletion counters on this land, sacrifice it.");
const GEMSTONE = L("Gemstone Mine", "This land enters with three mining counters on it.\n{T}, Remove a mining counter from this land: Add one mana of any color. If there are no mining counters on this land, sacrifice it.");
const ALIEN_KIND = L("Probe Alien Kind", "This land enters tapped with two glorb counters on it.\n{T}: Add {B}.");

const twoSeat = () => createGameState({ userDeck: [], aiDeck: [] });
function playLand(state, card) {
  const st = {
    ...state, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
    players: { ...state.players, user: { ...state.players.user, hand: [{ ...card, id: "L" }], battlefield: [], landsPlayedThisTurn: 0 } },
  };
  const out = dispatchAction(st, { kind: "play-land", playerId: "user", cardId: "L" });
  const p = out.players.user.battlefield.find((x) => x.card?.name === card.name);
  if (!p) throw new Error("land did not enter");
  return p;
}

describe("the reader and the vocabulary", () => {
  it("reads kind + count; depletion and mining are honest kinds, an alien kind is not", () => {
    expect(entersWithNamedCounters(VIVID_MARSH)).toEqual({ type: "charge", n: 2 });
    expect(entersWithNamedCounters(HICKORY)).toEqual({ type: "depletion", n: 2 });
    expect(entersWithNamedCounters(GEMSTONE)).toEqual({ type: "mining", n: 3 });
    expect(isHonestEnterCounterKind("depletion")).toBe(true);
    expect(isHonestEnterCounterKind("mining")).toBe(true);
    expect(isHonestEnterCounterKind("glorb")).toBe(false);
  });
});

describe("play-land path — the counters are placed, the tapped state honoured", () => {
  it("⭐ Vivid Marsh enters TAPPED with exactly two charge counters", () => {
    const p = playLand(twoSeat(), VIVID_MARSH);
    expect(p.tapped).toBe(true);
    expect(p.counters?.charge).toBe(2);
  });

  it("Gemstone Mine enters UNTAPPED with three mining counters", () => {
    const p = playLand(twoSeat(), GEMSTONE);
    expect(p.tapped).toBe(false);
    expect(p.counters?.mining).toBe(3);
  });

  it("Hickory Woodlot enters tapped with two depletion counters", () => {
    const p = playLand(twoSeat(), HICKORY);
    expect(p.tapped).toBe(true);
    expect(p.counters?.depletion).toBe(2);
  });

  // FIXED 2026-10-01 (play-weighted P·4): the play-land path doubled the printed count itself AND handed it to addCounter,
  // which applies the controller's doublers again — Vivid Marsh entered with 8 charge counters under Doubling Season.
  it("under Doubling Season, Vivid Marsh enters with four charge counters — doubled once (CR 122.6)", () => {
    const g = twoSeat();
    const season = { id: "DS", card: { id: "c-ds", name: "Doubling Season", type: "Enchantment",
      oracle: "If an effect would create one or more tokens under your control, it creates twice that many of those tokens instead.\nIf an effect would put one or more counters on a permanent you control, it puts twice that many of those counters on that permanent instead." },
      controller: "user", tapped: false, summoningSick: false, counters: {}, damageMarked: 0, attachments: [], attachedTo: null };
    const st = { ...g, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
      players: { ...g.players, user: { ...g.players.user, hand: [{ ...VIVID_MARSH, id: "L" }], battlefield: [season], landsPlayedThisTurn: 0 } } };
    const out = dispatchAction(st, { kind: "play-land", playerId: "user", cardId: "L" });
    expect(out.players.user.battlefield.find((x) => x.card?.name === "Vivid Marsh")?.counters?.charge).toBe(4);
  });
});

describe("tutor site — the same reader, the same counters", () => {
  it("a Vivid land put onto the battlefield by an effect also carries its two charge counters", () => {
    const out = enterPermanent(twoSeat(), VIVID_MARSH, "user");
    const p = out.players.user.battlefield.find((x) => x.card.name === VIVID_MARSH.name);
    expect(p.counters?.charge).toBe(2);
  });
});

describe("classification — credited only through the reader AND the honesty gate", () => {
  it("the Vivid, depletion and mining lands are `land`", () => {
    expect(classifyCard(VIVID_MARSH)).toBe("land");
    expect(classifyCard(HICKORY)).toBe("land");
    expect(classifyCard(GEMSTONE)).toBe("land");
  });

  it("⛔ an unknown counter kind is not credited (the enters line stays residue)", () => {
    expect(classifyCard(ALIEN_KIND)).toBe("land-partial");
  });
});

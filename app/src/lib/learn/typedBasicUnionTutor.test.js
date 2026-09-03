/**
 * typedBasicUnionTutor.test.js — LANDS-TIER slice 8 (2026-09-03): the TYPED-BASIC UNION tutor filter —
 * "search your library for a basic Plains, Swamp, or Forest card" (the ten MH3 Landscapes, the five
 * Panoramas, the SNC Overlook/Courtyard/Theater/Hideout/Storefront cycle, Quandrix Cultivator; the five
 * Monuments fetch the same union to hand) — 26 corpus cards.
 *
 * THE ONE-WORD BLOCKER: the union splitter produced [basic plains] · [swamp] · [forest], with "basic" living
 * only in the FIRST group. Printed English distributes it — the card fetches a BASIC land of one of those
 * types — and the battlefield-tutor admission rightly refused the ambiguous half-basic read ("some basic,
 * not all basic" is the shape of a mis-fetch). The parser now distributes "basic" across a union whose other
 * members are all single basic-land-type words, and ONLY then. The shared matcher already reads a
 * [basic, swamp] group as "type line contains both", so a nonbasic Swamp (Overgrown Tomb) is refused and a
 * Snow-Covered Swamp is admitted — exactly the printed filter.
 *
 * Real oracle fixtures (bundled Scryfall snapshot, read in-session 2026-09-03).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { parseTutorFilter } from "./effects/parseHelpers.js";
import { cardMatchesTutorFilter } from "./effects/atoms/library.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

// parseTutorFilter is fed LOWERCASED phrases by every caller (the span matchers lowercase the oracle first);
// the printed casing is kept in the fixtures below for legibility and lowered here.
const pf = (phrase) => parseTutorFilter(phrase.toLowerCase());

const DECEPTIVE = { id: "c-deceptive", name: "Deceptive Landscape", type: "Land",
  oracle: "{T}: Add {C}.\n{T}, Sacrifice this land: Search your library for a basic Plains, Swamp, or Forest card, put it onto the battlefield tapped, then shuffle.\nCycling {W}{B}{G} ({W}{B}{G}, Discard this card: Draw a card.)" };
const BANT_PANORAMA = { id: "c-bant", name: "Bant Panorama", type: "Land",
  oracle: "{T}: Add {C}.\n{1}, {T}, Sacrifice this land: Search your library for a basic Forest, Plains, or Island card, put it onto the battlefield tapped, then shuffle." };

describe("the parser — 'basic' distributes across a union of basic land types, and only such a union", () => {
  it("three-way and two-way unions get 'basic' in every group", () => {
    expect(pf("basic Plains, Swamp, or Forest")).toEqual({ groups: [["basic", "plains"], ["basic", "swamp"], ["basic", "forest"]] });
    expect(pf("basic Forest or Island")).toEqual({ groups: [["basic", "forest"], ["basic", "island"]] });
  });

  it("an un-prefixed union and a single type are unchanged", () => {
    expect(pf("Plains, Swamp, or Forest")).toEqual({ groups: [["plains"], ["swamp"], ["forest"]] });
    expect(pf("basic Forest")).toEqual({ groups: [["basic", "forest"]] });
  });

  it("⛔ no distribution when a later member is not a bare basic land type ('basic Plains or creature' stays ambiguous)", () => {
    expect(pf("basic Plains or creature")).toEqual({ groups: [["basic", "plains"], ["creature"]] });
  });
});

describe("the matcher — a BASIC land of one of the types, nothing looser", () => {
  const f = pf("basic Plains, Swamp, or Forest");
  it("admits basics of the named types (snow included), refuses a nonbasic Swamp-typed land and an off-type basic", () => {
    expect(cardMatchesTutorFilter({ name: "Plains", type: "Basic Land — Plains" }, f)).toBe(true);
    expect(cardMatchesTutorFilter({ name: "Snow-Covered Swamp", type: "Basic Snow Land — Swamp" }, f)).toBe(true);
    expect(cardMatchesTutorFilter({ name: "Overgrown Tomb", type: "Land — Swamp Forest" }, f)).toBe(false);
    expect(cardMatchesTutorFilter({ name: "Island", type: "Basic Land — Island" }, f)).toBe(false);
  });
});

describe("runtime — Deceptive Landscape sacrifices itself and searches exactly the printed union", () => {
  function board() {
    const s = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
    const bf = [createPermanent({ id: "src", card: DECEPTIVE, controller: "user", summoningSick: false })];
    const library = [
      { id: "l-plains", name: "Plains", type: "Basic Land — Plains", oracle: "" },
      { id: "l-island", name: "Island", type: "Basic Land — Island", oracle: "" },
      { id: "l-snow", name: "Snow-Covered Swamp", type: "Basic Snow Land — Swamp", oracle: "" },
      { id: "l-tomb", name: "Overgrown Tomb", type: "Land — Swamp Forest", oracle: "" },
      { id: "l-bear", name: "Grizzly Bears", type: "Creature — Bear", oracle: "", power: 2, toughness: 2 },
    ];
    return {
      ...s, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", turn: 6, consecutivePasses: 0,
      players: { ...s.players, user: { ...s.players.user, battlefield: bf, library, hand: [], graveyard: [], manaPool: { W: 3, U: 3, B: 3, R: 3, G: 3, C: 3 } } },
    };
  }

  it("⭐ offered, sacrificed as the cost, and the search offers Plains + Snow-Covered Swamp only", () => {
    const st = board();
    const acts = legalActionsForPlayer(st, "user").filter((a) => a.kind === "activate-ability" && a.permanentId === "src" && a.sacSelf);
    expect(acts).toHaveLength(1);
    const paid = dispatchAction(st, acts[0]);
    expect(paid.players.user.battlefield.some((p) => p.id === "src")).toBe(false);
    const resolved = resolveTopOfStack(paid);
    expect(resolved.pendingChoice?.kind).toBe("tutor-search");
    expect(resolved.pendingChoice.candidates.map((c) => c.name).sort()).toEqual(["Plains", "Snow-Covered Swamp"]);
  });
});

describe("classification", () => {
  it("the Landscape and the Panorama flip to `land`", () => {
    expect(classifyCard(DECEPTIVE)).toBe("land");
    expect(classifyCard(BANT_PANORAMA)).toBe("land");
  });

  it("CREED — an ambiguous half-basic union still parks", () => {
    expect(classifyCard({ ...BANT_PANORAMA, oracle: BANT_PANORAMA.oracle.replace("basic Forest, Plains, or Island card", "basic Forest, Plains, or creature card") })).toBe("land-partial");
  });
});

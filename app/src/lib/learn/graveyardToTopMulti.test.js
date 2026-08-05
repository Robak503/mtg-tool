/**
 * graveyardToTopMulti.test.js — GY-TO-TOP, MULTI-COUNT (CR 601.2c): "Put up to <N> target <filter> card(s)
 * from your graveyard on top of your library." Meldweb Curator, Biblioplex Assistant, Treason of Isengard,
 * Reinforcements.
 *
 * ⭐ FOUND BY TIER-SPLITTING THE DESTINATION PHRASE. The SINGLE-target top form (Reclaim, Salvage, False
 * Mourning) has been native for a long while; the up-to-N wording was native on ZERO. **The count was the
 * entire difference** — the same split that keeps paying out in this family.
 *
 * ⭐ NOTHING NEW AT RUNTIME. `applyReturnFromGraveyard` already loops every ctx.target, and
 * targeting.expandAtoms already admits the maxTargets/minTargets:0 subset shape — the up-to-N return-TO-HAND
 * arm in the same parser is the identical mechanism against a different destination. This arm only says the
 * wording out loud.
 *
 * ⭐⭐ "ANY NUMBER OF TARGET …" WAS REFUSED HERE ON MEASUREMENT, AND SHIPPED ONE SLICE LATER — in that order,
 * deliberately. Footbottom Feast / Bone Harvest / Forever Young / Gravepurge / Frantic Salvage need an
 * UNBOUNDED subset, and targetSubsets used to fill from the SMALLEST k upward against a 64-option cap: on a
 * 10-card graveyard the largest offered subset was THREE. "Put them ALL back" — the option those cards exist
 * for — was simply not on the menu. Widening the regex first would have shipped five cards that read native
 * and played wrong. The follow-up slice fixed the enumeration order, THEN the wording; anyNumberTargets.test.js
 * owns those pins, including the mutant that reproduces the old largest=3 behaviour exactly.
 *
 * Mutation-checked (2026-08-05, each grep-verified as applied): `toLibraryTop` dropped -> the runtime witness
 * shows the card landing in HAND instead of on the library — a behavioural kill. `minTargets:0` dropped ->
 * killed by the exact atom-SHAPE assertions above, not by observed behaviour: the zero-target case here calls
 * the resolver directly with `targets: []`, so it never exercises targeting.expandAtoms' subset gate. Stated
 * plainly rather than dressed up as a behavioural pin.
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-08-05).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { splitClauses } from "./effects/splitClauses.js";
import { parseEffectClause, programConfidence } from "./effects/parser.js";
import { classifyCard } from "./coverage.js";
import { _resetIdsForTests, createGameState } from "./gameState.js";
import { applyReturnFromGraveyard } from "./effects/atoms/zones.js";

beforeEach(() => _resetIdsForTests());

const parse = (s) => parseEffectClause(splitClauses(s)[0], "Instant");

describe("the count wording finally reaches the atom", () => {
  it("⭐ up-to-one, with the type filter carried", () => {
    const p = parse("put up to one target instant or sorcery card from your graveyard on top of your library");
    expect(programConfidence(p)).toBe("high");
    expect(p.atoms).toEqual([{ op: "return-from-graveyard", targetType: "graveyardCard", cardFilter: "instant|sorcery", toLibraryTop: true, maxTargets: 1, minTargets: 0 }]);
  });

  it("⭐ up-to-three creature cards (Reinforcements)", () => {
    expect(parse("put up to three target creature cards from your graveyard on top of your library").atoms).toEqual([
      { op: "return-from-graveyard", targetType: "graveyardCard", cardFilter: "creature", toLibraryTop: true, maxTargets: 3, minTargets: 0 },
    ]);
  });

  it("⛔ the SINGLE-target form is untouched — no count fields appear on it", () => {
    expect(parse("put target card from your graveyard on top of your library").atoms).toEqual([
      { op: "return-from-graveyard", targetType: "graveyardCard", cardFilter: "any", toLibraryTop: true },
    ]);
  });

  it("⭐ 'ANY NUMBER OF' WAS REFUSED HERE, AND IS NOW SHIPPED — with the enumeration fixed FIRST", () => {
    // ⭐ THE ORDER OF THOSE TWO SLICES IS THE POINT. This arm refused the wording on measurement, not
    // squeamishness: `targetSubsets` filled from the SMALLEST k upward against a 64-option cap, so on a
    // 10-card graveyard the largest offered subset was THREE — "put them all back", the option Footbottom
    // Feast exists for, was unavailable. Admitting the regex alone would have shipped five cards that read
    // native and played wrong. The follow-up slice flipped the fill to largest-first and THEN widened the
    // regex; anyNumberTargets.test.js owns those pins, including the mutant that reproduces the old
    // largest=3 behaviour exactly.
    expect(parse("put any number of target creature cards from your graveyard on top of your library").atoms)
      .toEqual([{ op: "return-from-graveyard", targetType: "graveyardCard", cardFilter: "creature", toLibraryTop: true, maxTargets: 999, minTargets: 0, anyNumber: true }]);
    expect(classifyCard({ name: "Footbottom Feast", type: "Instant", mana: "{2}{B}",
      oracle: "Put any number of target creature cards from your graveyard on top of your library.\nDraw a card." })).toBe("native-spell");
  });
});

describe("classification", () => {
  it("⭐ the whole cards flip", () => {
    expect(classifyCard({ name: "Meldweb Curator", type: "Creature — Phyrexian Wizard", mana: "{3}{U}", power: "2", toughness: "3",
      oracle: "When this creature enters, put up to one target instant or sorcery card from your graveyard on top of your library." })).toBe("native-trigger");
    expect(classifyCard({ name: "Biblioplex Assistant", type: "Artifact Creature — Gargoyle", mana: "{4}", power: "2", toughness: "3",
      oracle: "Flying\nWhen this creature enters, put up to one target instant or sorcery card from your graveyard on top of your library." })).toBe("native-trigger");
    expect(classifyCard({ name: "Reinforcements", type: "Instant", mana: "{W}",
      oracle: "Put up to three target creature cards from your graveyard on top of your library." })).toBe("native-spell");
  });
});

describe("⭐ LAW 6 — the cards land on the LIBRARY, not in hand", () => {
  it("⭐ every chosen target moves graveyard → top of library, hand untouched", () => {
    const g = createGameState({ userDeck: [], aiDeck: [] });
    const gy = [
      { id: "gy1", name: "Lightning Bolt", type: "Instant", oracle: "" },
      { id: "gy2", name: "Counterspell", type: "Instant", oracle: "" },
    ];
    const start = { ...g, players: { ...g.players, user: { ...g.players.user, graveyard: gy, hand: [], library: [{ id: "lib1", name: "Island", type: "Basic Land — Island" }] } } };
    const atom = parse("put up to one target instant or sorcery card from your graveyard on top of your library").atoms[0];
    const after = applyReturnFromGraveyard(start, atom, { targets: [{ id: "gy1", type: "graveyardCard", controller: "user" }], controller: "user" });
    const p = after.players.user;
    const row = { libTop: p.library[0]?.name, libLen: p.library.length, hand: p.hand.map((c) => c.name), gy: p.graveyard.map((c) => c.name) };
    console.log("  WITNESS gyToTop", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ libTop: "Lightning Bolt", libLen: 2, hand: [], gy: ["Counterspell"] });
  });

  it("⛔ choosing ZERO is legal and changes nothing (the 'up to' half)", () => {
    const g = createGameState({ userDeck: [], aiDeck: [] });
    const start = { ...g, players: { ...g.players, user: { ...g.players.user, graveyard: [{ id: "gy1", name: "Lightning Bolt", type: "Instant", oracle: "" }], hand: [], library: [] } } };
    const atom = parse("put up to one target instant or sorcery card from your graveyard on top of your library").atoms[0];
    const after = applyReturnFromGraveyard(start, atom, { targets: [], controller: "user" });
    expect(after.players.user.graveyard.map((c) => c.name)).toEqual(["Lightning Bolt"]);
    expect(after.players.user.library).toEqual([]);
  });
});

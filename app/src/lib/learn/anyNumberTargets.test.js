/**
 * anyNumberTargets.test.js — "put ANY NUMBER of target <filter> cards from your graveyard on top of your
 * library" (CR 601.2c): Footbottom Feast, Bone Harvest, Forever Young, Gravepurge, Frantic Salvage.
 *
 * ⭐⭐ THE SLICE IS THE ENUMERATION ORDER, NOT THE REGEX. The wording was REFUSED one slice ago on purpose,
 * with the reason written down: `targetSubsets` filled from the SMALLEST k upward against a 64-option cap, so
 * on any real graveyard "choose ALL of them" — the option these five cards exist for — was the FIRST subset
 * dropped. Admitting the regex alone would have produced five cards that read native and played wrong.
 * ⭐ `anyNumber` flips the fill to largest-first, so the cap can only ever eat MIDDLE-sized subsets.
 *
 * ⛔ THE EMPTY SUBSET IS SEEDED EXPLICITLY, because a descending fill would otherwise never reach k=0 on a
 * large graveyard and "choose zero" is a LEGAL cast (CR 601.2c). Both extremes are guaranteed present. That
 * is the pin that would have caught the naive version of this fix.
 *
 * ⓘ `maxTargets: 999` rather than Infinity: targetSubsets clamps with Math.min(maxK, n), so anything ≥ the
 * graveyard size behaves identically — and a finite number stays JSON-serializable. Infinity stringifies to
 * null, which would silently degrade the atom to a single-target one if a program is ever round-tripped.
 *
 * ⛔ BOUNDED up-to-N atoms carry NO flag and keep the ascending order byte-for-byte. Pinned.
 *
 * Mutation-checked (2026-08-05, each grep-verified as applied AND verified on the case under test):
 * `largestFirst` forced off -> the all-cards subset disappears from the offered options on a 10-card
 * graveyard; the empty-subset seed removed -> the legal choose-zero cast disappears from the same options.
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-08-05).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { splitClauses } from "./effects/splitClauses.js";
import { parseEffectClause, programConfidence } from "./effects/parser.js";
import { expandCastChoices } from "./effects/targeting.js";
import { classifyCard } from "./coverage.js";
import { _resetIdsForTests, createGameState } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const CLAUSE = "put any number of target creature cards from your graveyard on top of your library";
const parse = (s) => parseEffectClause(splitClauses(s)[0], "Instant");

describe("the atom", () => {
  it("⭐ any-number parses with the flag, a finite cap and minTargets 0", () => {
    const p = parse(CLAUSE);
    expect(programConfidence(p)).toBe("high");
    expect(p.atoms).toEqual([{ op: "return-from-graveyard", targetType: "graveyardCard", cardFilter: "creature",
      toLibraryTop: true, maxTargets: 999, minTargets: 0, anyNumber: true }]);
  });

  it("⛔ the cap is JSON-SAFE — Infinity would round-trip to null and degrade the atom", () => {
    const atom = parse(CLAUSE).atoms[0];
    expect(Number.isFinite(atom.maxTargets)).toBe(true);
    expect(JSON.parse(JSON.stringify(atom))).toEqual(atom);
  });

  it("⛔ the BOUNDED up-to-N sibling carries no flag (its ascending order is untouched)", () => {
    const atom = parse("put up to three target creature cards from your graveyard on top of your library").atoms[0];
    expect(atom.anyNumber).toBeUndefined();
    expect(atom.maxTargets).toBe(3);
  });

  it("⭐ the whole cards flip", () => {
    expect(classifyCard({ name: "Footbottom Feast", type: "Instant", mana: "{2}{B}",
      oracle: "Put any number of target creature cards from your graveyard on top of your library.\nDraw a card." })).toBe("native-spell");
    expect(classifyCard({ name: "Frantic Salvage", type: "Instant", mana: "{3}{W}",
      oracle: "Put any number of target artifact cards from your graveyard on top of your library.\nDraw a card." })).toBe("native-spell");
  });
});

describe("⭐⭐ THE ENUMERATION — both extremes survive the option cap", () => {
  /** A graveyard of `n` creature cards, big enough that 2^n cannot fit in the 64-option cap. */
  function boardWithGraveyard(n) {
    const g = createGameState({ userDeck: [], aiDeck: [] });
    const gy = Array.from({ length: n }, (_, i) => ({ id: `gy${i}`, name: `Bear ${i}`, type: "Creature — Bear", power: "2", toughness: "2", oracle: "" }));
    return { ...g, players: { ...g.players, user: { ...g.players.user, graveyard: gy, hand: [], library: [] } } };
  }

  const sizes = (n) => expandCastChoices(boardWithGraveyard(n), "user", parse(CLAUSE), [], {}).map((c) => (c.targets || []).length);

  it("⭐⭐ with 10 cards in the graveyard, 'take ALL of them' IS offered", () => {
    const s = sizes(10);
    const row = { options: s.length, largest: Math.max(...s), smallest: Math.min(...s) };
    console.log("  WITNESS anyNumber", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    // ⭐ largest === 10 is the whole slice: under the OLD ascending fill this maxed out well short of it.
    expect(row.largest).toBe(10);
    // ⛔ …and choose-zero is still there, seeded ahead of the descending fill.
    expect(row.smallest).toBe(0);
  });

  it("⛔ a SMALL graveyard offers every subset either way (the order only matters at the cap)", () => {
    expect([...new Set(sizes(3))].sort()).toEqual([0, 1, 2, 3]);
  });

  it("⛔ an EMPTY graveyard still offers the legal choose-zero cast", () => {
    expect(sizes(0)).toEqual([0]);
  });
});

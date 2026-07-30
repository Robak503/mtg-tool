/**
 * turnScopedFlashGrant.test.js — "You may cast spells this turn as though they had flash." (CR 601.3e)
 * Borne Upon a Wind. +1, and the first card off the `cdh` shelf gap (83 → 84 of 100).
 *
 * ⭐ THE STATIC FORM WAS ALREADY MODELED and this is its missing twin — the same axis this run keeps finding.
 * staticAbilityParser handles the permanent-based grant (Yeva, Vedalken Orrery) and its matcher comment names
 * the gap outright: "Anchored ^…$ so any rider variant ('… this turn') never matches." Same permission, same
 * spec shape, different duration. The spec is built by the STATIC's own `parseFlashCastFilter`, imported
 * rather than re-implemented, so the two cannot drift — a second filter parser would silently apply the
 * permission to a different set of spells than the identical printed words do on a permanent.
 *
 * ⭐⭐ THE FIX THAT MADE IT WORK WAS ONE LINE, AND FINDING IT TOOK READING THE DISPATCH INSTEAD OF PROBING IT.
 * Two earlier attempts banked FOUR separate "gates" inferred from black-box probing of parser outputs. Two of
 * those were wrong (there is no card-level gate — a whole-oracle `unparsedTail` is just how all-or-nothing
 * failure is REPORTED), and the rest collapsed into ONE real cause: the α2 "you may" peel stamps
 * `optional: true` on whatever it wraps, and an optional grant is rejected downstream. The peel already had a
 * documented NON-optional allowlist for exactly this situation —
 *
 *     return (inner.op === "free-cast" || inner.op === "play-extra-land-this-turn") ? inner : {...inner, optional:true}
 *
 * — with the reasoning spelled out beside it: a permission is "costless upside with no resolution-time
 * decision", so stamping optional would "double-prompt". A turn-scoped casting permission is the third member
 * of that family. The fix was adding the op to that list.
 *
 * ⛔ AND THE PERMISSION MUST NOT OUTLIVE ITS TURN. It is cleared inside `resetSpellsCastAllPlayers` — the same
 * untap reset that zeroes the other per-turn player counters — so there is ONE reset site and a new turn
 * cannot half-clear it. A permission that leaked would let the player cast at instant speed forever: an engine
 * strictly MORE PERMISSIVE than the card, which is the forbidden direction.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { parseEffectClause, parseEffectProgram, programConfidence } from "./effects/parser.js";
import { createGameState, grantFlashThisTurn, resetSpellsCastAllPlayers, _resetIdsForTests } from "./gameState.js";
import { flashPermissionSpecsFor } from "./legalChoices.js";
import { classifyCard, isNativeTier } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const atomOf = (clause) => (parseEffectClause(clause, "Instant", { hasX: false })?.atoms || [])[0] || null;

describe("⭐ the grant parses, and is NOT stamped optional", () => {
  it("the printed form and the α2-peeled form produce the IDENTICAL atom", () => {
    const full = atomOf("You may cast spells this turn as though they had flash");
    const peeled = atomOf("Cast spells this turn as though they had flash");
    expect(full).toEqual({ op: "grant-flash-this-turn", spec: { any: true }, targetType: null });
    expect(peeled).toEqual(full);
  });

  it("⛔⭐ NO `optional` — the one-line fix, and the reason it exists", () => {
    // The α2 peel stamps optional:true on whatever it wraps unless the op is in its allowlist. A permission
    // has no resolution-time decision — its "may" is realized when the player chooses whether to cast at
    // instant speed — so an optional stamp would add a meaningless yes/no pause AND park the card.
    expect(atomOf("You may cast spells this turn as though they had flash")).not.toHaveProperty("optional");
  });

  it("the FILTER is delegated to the static's own parser", () => {
    expect(atomOf("You may cast creature spells this turn as though they had flash"))
      .toEqual({ op: "grant-flash-this-turn", spec: { qualifiers: [{ types: ["Creature"] }] }, targetType: null });
  });

  it("⛔ an unmodeled qualifier refuses the whole clause (all-or-nothing)", () => {
    expect(atomOf("You may cast legendary spells this turn as though they had flash")).toBe(null);
  });

  it("⛔ the STATIC wording is untouched — it has no 'this turn' and stays with staticAbilityParser", () => {
    expect(atomOf("You may cast spells as though they had flash")).toBe(null);
  });
});

describe("⛔⭐ RUNTIME — the permission is visible to the offer gate, and dies at untap", () => {
  const world = () => createGameState({ userDeck: [], aiDeck: [] });

  it("a granted spec is collected alongside the battlefield statics", () => {
    const s = grantFlashThisTurn(world(), "user", { any: true });
    expect(flashPermissionSpecsFor(s, "user")).toEqual([{ any: true }]);
  });

  it("⭐ grants ACCUMULATE — two such spells in one turn both apply", () => {
    let s = grantFlashThisTurn(world(), "user", { any: true });
    s = grantFlashThisTurn(s, "user", { qualifiers: [{ types: ["Creature"] }] });
    expect(flashPermissionSpecsFor(s, "user")).toHaveLength(2);
  });

  it("⛔ THE LOAD-BEARING ONE — the untap reset clears it", () => {
    // Delete the reset and the player casts at instant speed for the rest of the game. Strictly more
    // permissive than the card is the forbidden direction, and it would never surface as a failing card —
    // only as an engine that quietly lets you do more than the rules allow.
    const s = grantFlashThisTurn(world(), "user", { any: true });
    expect(flashPermissionSpecsFor(s, "user")).toHaveLength(1);
    expect(flashPermissionSpecsFor(resetSpellsCastAllPlayers(s), "user")).toHaveLength(0);
  });

  it("⛔ the grant is per-player — one seat's permission is not another's", () => {
    const s = grantFlashThisTurn(world(), "user", { any: true });
    expect(flashPermissionSpecsFor(s, "ai")).toHaveLength(0);
  });
});

describe("⭐ the carrier", () => {
  // ⚠️ Oracle copied from the bundle. This run has twice shipped a fixture written from recall.
  const CARD = { name: "Borne Upon a Wind", type: "Instant", mana: "{1}{U}",
    oracle: "You may cast spells this turn as though they had flash.\nDraw a card." };

  it("Borne Upon a Wind is native, with BOTH atoms", () => {
    const p = parseEffectProgram(CARD);
    expect(programConfidence(p)).toBe("high");
    expect((p.atoms || []).map((a) => a.op)).toEqual(["grant-flash-this-turn", "draw"]);
    expect(isNativeTier(classifyCard(CARD)), classifyCard(CARD)).toBe(true);
  });
});

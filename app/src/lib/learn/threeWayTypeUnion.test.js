/**
 * threeWayTypeUnion.test.js — "destroy target ARTIFACT, ENCHANTMENT, OR LAND" (Acidic Slime, Creeping Mold,
 * Reclaiming Vines, Dire-Strain Rampage, Hoodwink, World Breaker).
 *
 * The engine had every TWO-way union (artifact-or-enchantment, creature-or-land, creature-or-planeswalker…)
 * and no three-way one, so six corpus cards — Acidic Slime among them, a staple and a shelf card — parked on
 * a noun the parser simply did not know.
 *
 * ⛔ MAPPED AS A STRAIGHT OR OF THE THREE PRINTED TYPES, and deliberately NOT to "permanent". The lazy
 * mapping would have offered creatures and planeswalkers the card cannot touch — a wider target set than
 * printed, which is the forbidden direction. The enumerator pin below is the one that matters.
 *
 * Found by probe-shelf-one-line-away.mjs, which asks "drop exactly one oracle line — does the card go
 * native?" rather than ranking blocking sentences by spread. The line IS the blocker here, which is what
 * makes this a build target rather than a lead.
 */
import { beforeEach, describe, expect, it } from "vitest";

import "./coverage.js";
import { classifyCard } from "./coverage.js";
import { parseEffectClause } from "./effects/parser.js";
import { expandCastChoices } from "./effects/targeting.js";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const CLAUSE = "destroy target artifact, enchantment, or land";
const atomOf = (clause) => parseEffectClause(clause, "Instant", { hasX: false }).atoms[0];

describe("parsing", () => {
  it("⭐ the three-way union is its own target type", () => {
    expect(atomOf(CLAUSE)).toMatchObject({ op: "destroy", targetType: "artifactEnchantmentOrLand" });
  });

  it("the TWO-way unions are untouched", () => {
    expect(atomOf("destroy target artifact or enchantment").targetType).toBe("artifactOrEnchantment");
    expect(atomOf("destroy target creature or planeswalker").targetType).toBe("creatureOrPlaneswalker");
    expect(atomOf("destroy target artifact").targetType).toBe("artifact");
  });

  it("the cards blocked on it classify native (real bundled oracle text)", () => {
    expect(classifyCard({ name: "Acidic Slime", type: "Creature — Ooze", mana: "{3}{G}{G}", power: 2, toughness: 2, oracle: "Deathtouch\nWhen this creature enters, destroy target artifact, enchantment, or land." })).toBe("native-trigger");
    expect(classifyCard({ name: "Creeping Mold", type: "Sorcery", mana: "{2}{G}", oracle: "Destroy target artifact, enchantment, or land." })).toBe("native-spell");
  });
});

describe("⭐ CREED — the enumerator offers EXACTLY those three types", () => {
  const T = (n, t, extra = {}) => ({ name: n, type: t, oracle: "", ...extra });
  const BOARD = [
    T("Sol Ring", "Artifact"),
    T("Rancor", "Enchantment — Aura"),
    T("Forest", "Basic Land — Forest"),
    T("Bear", "Creature — Bear", { power: 2, toughness: 2 }),
    T("Jace", "Legendary Planeswalker — Jace", { loyalty: 3 }),
  ];
  function board() {
    const s = createGameState({ userDeck: [], aiDeck: [] });
    return { ...s, players: { ...s.players, ai: { ...s.players.ai, battlefield: BOARD.map((c, i) => createPermanent({ id: `p${i}`, card: { ...c, id: `p${i}` }, controller: "ai" })) } } };
  }
  // ⚠️ A combo is `{ targets: [...] }`, NOT a bare array. Reading it as an array yielded [undefined], which
  // made the "creature is not offered" assertion below pass VACUOUSLY — the exact hollow shape this file is
  // otherwise guarding against. The non-empty assertion in the first test is what keeps that honest.
  const offeredIds = (clause) => {
    const combos = expandCastChoices(board(), "user", parseEffectClause(clause, "Instant", { hasX: false })) || [];
    return [...new Set(combos.flatMap((c) => c.targets || []).map((t) => t.id))].sort();
  };

  it("⭐ the artifact, the enchantment and the land are offered", () => {
    expect(offeredIds(CLAUSE)).toEqual(["p0", "p1", "p2"]);
  });

  it("⛔ the CREATURE and the PLANESWALKER are NOT — the 'permanent' mapping would have offered them", () => {
    const ids = offeredIds(CLAUSE);
    expect(ids).not.toContain("p3");
    expect(ids).not.toContain("p4");
  });

  it("CONTROL — the two-way union offers strictly fewer (no land)", () => {
    // Without this, an enumerator that returned everything would pass the assertion above by accident.
    expect(offeredIds("destroy target artifact or enchantment")).toEqual(["p0", "p1"]);
  });
});

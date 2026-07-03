/**
 * Serpent of Yawning Depths — GROUP-BLOCK-RESTRICTION, the MULTI-subtype + "you control" variant of the
 * Shifting Sliver group-evasion static:
 *
 *   "Krakens, Leviathans, Octopuses, and Serpents you control can't be blocked except by Krakens,
 *    Leviathans, Octopuses, and Serpents."
 *
 * Two things distinguish it from Shifting Sliver's single-subtype board-wide form:
 *   1. FOUR subtypes on BOTH sides (the symmetric "only X can block X" set is a list, not one word).
 *   2. "you control" controller scope — the restriction binds only to those-subtype attackers the STATIC'S
 *      CONTROLLER controls; an OPPONENT's Kraken attacking you is UNRESTRICTED (a blocker of any type is legal).
 *
 * Engine-first (THE CREED): the card both CLASSIFIES native (native-static, via the parseStaticAbilities
 * `blockRestriction` marker) AND its rule RESOLVES end-to-end (combatEvasion.canBlockAttacker reads the SAME
 * parseGroupBlockRestriction — one parser, no metric/runtime drift). The blocker-side list has NO controller
 * scope, so a Leviathan of ANY controller may block your Kraken. CREED near-miss coverage below: an ASYMMETRIC
 * "except by <different subtypes>" form and an "N or more creatures" form both stay body-only (safe FN) — a
 * partial/wrong evasion is never claimed.
 */
import { describe, expect, it, beforeEach } from "vitest";

import { classifyCard } from "./coverage.js";
import { canBlockAttacker, groupBlockRestrictionOf, blockableOnlyBySubtypeOf } from "./combatEvasion.js";
import { parseStaticAbilities, parseGroupBlockRestriction } from "./staticAbilityParser.js";
import { _resetIdsForTests, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const ORACLE =
  "Krakens, Leviathans, Octopuses, and Serpents you control can't be blocked except by Krakens, Leviathans, Octopuses, and Serpents.";
const CARD = { name: "Serpent of Yawning Depths", type: "Enchantment Creature — Serpent", mana: "{4}{U}{U}", oracle: ORACLE };

function perm(id, controller, type, oracle = "", keywords) {
  const card = { id: `c-${id}`, name: id, type, oracle, power: 3, toughness: 3 };
  if (keywords) card.keywords = keywords;
  return createPermanent({ id, card, controller });
}

describe("Serpent of Yawning Depths — GROUP-BLOCK-RESTRICTION (multi-subtype + you-control)", () => {
  it("classifies native-static; the parser extracts all four subtypes + the you-control scope", () => {
    expect(classifyCard(CARD)).toBe("native-static");
    expect(groupBlockRestrictionOf(CARD)).toEqual({
      subtypes: ["Kraken", "Leviathan", "Octopus", "Serpent"],
      controllerScope: "you",
    });
    // parseStaticAbilities emits the coverage marker (no `affects`/`op` — pure classifier marker).
    expect(parseStaticAbilities(CARD)).toEqual([
      { blockRestriction: { subtypes: ["Kraken", "Leviathan", "Octopus", "Serpent"], controllerScope: "you" } },
    ]);
    // "Octopuses" de-pluralizes to the canonical "Octopus" (irregular -uses plural), not "Octopuse".
    expect(groupBlockRestrictionOf(CARD).subtypes).toContain("Octopus");
    // Single-subtype back-compat helper (used by callers expecting a lone subtype) returns null for a
    // multi-subtype / you-control form — it is NOT the board-wide single-subtype Shifting Sliver shape.
    expect(blockableOnlyBySubtypeOf(CARD)).toBeNull();
  });

  it("your named-subtype attacker can be blocked ONLY by a creature of one of those subtypes", () => {
    const serp = perm("serp", "user", "Enchantment Creature — Serpent", ORACLE);
    const kraken = perm("kraken", "user", "Creature — Kraken");
    const bearBlk = perm("bearBlk", "ai", "Creature — Bear");
    const levBlk = perm("levBlk", "ai", "Creature — Leviathan");
    const serpBlk = perm("serpBlk", "ai", "Creature — Serpent");
    const change = perm("change", "ai", "Creature — Shapeshifter", "Changeling", ["Changeling"]);
    const state = { players: { user: { battlefield: [serp, kraken] }, ai: { battlefield: [bearBlk, levBlk, serpBlk, change] } } };
    expect(canBlockAttacker(state, "bearBlk", "kraken", "ai")).toBe(false); // a Bear can't block your Kraken
    expect(canBlockAttacker(state, "levBlk", "kraken", "ai")).toBe(true);   // a Leviathan (in the set) may
    expect(canBlockAttacker(state, "serpBlk", "kraken", "ai")).toBe(true);  // a Serpent (in the set) may
    expect(canBlockAttacker(state, "change", "kraken", "ai")).toBe(true);   // changeling = every type (CR 702.73a)
  });

  it("the restriction is SUBTYPE-scoped — your non-named attacker (a Bear) is unrestricted", () => {
    const serp = perm("serp", "user", "Enchantment Creature — Serpent", ORACLE);
    const bearAtk = perm("bearAtk", "user", "Creature — Bear");
    const bearBlk = perm("bearBlk", "ai", "Creature — Bear");
    const state = { players: { user: { battlefield: [serp, bearAtk] }, ai: { battlefield: [bearBlk] } } };
    expect(canBlockAttacker(state, "bearBlk", "bearAtk", "ai")).toBe(true);
  });

  it("CREED: the you-control scope binds ONLY the source's own creatures — an OPPONENT's Kraken is unrestricted", () => {
    // The Serpent is controlled by "user". An "ai" Kraken attacking "user" is NOT one of the user's creatures,
    // so the "…you control…" restriction does not apply and the user's Bear may legally block it. A board-wide
    // model would WRONGLY forbid this block — that would be a confident wrong play (CREED false positive).
    const serp = perm("serp", "user", "Enchantment Creature — Serpent", ORACLE);
    const oppKraken = perm("oppKraken", "ai", "Creature — Kraken");
    const userBear = perm("userBear", "user", "Creature — Bear");
    const state = { players: { user: { battlefield: [serp, userBear] }, ai: { battlefield: [oppKraken] } } };
    expect(canBlockAttacker(state, "userBear", "oppKraken", "user")).toBe(true);
  });

  it("the restriction is off when no such static is in play", () => {
    const kraken = perm("kraken", "user", "Creature — Kraken");
    const bearBlk = perm("bearBlk", "ai", "Creature — Bear");
    const state = { players: { user: { battlefield: [kraken] }, ai: { battlefield: [bearBlk] } } };
    expect(canBlockAttacker(state, "bearBlk", "kraken", "ai")).toBe(true);
  });

  it("CREED near-miss: an ASYMMETRIC 'except by <different subtypes>' form stays body-only (safe FN)", () => {
    // Attacker set {Kraken, Serpent} ≠ allowed-blocker set {Wall} → not the modeled symmetric shape.
    const asym = "Krakens and Serpents you control can't be blocked except by Walls.";
    expect(parseGroupBlockRestriction(asym)).toBeNull();
    expect(classifyCard({ name: "X", type: "Creature — Serpent", oracle: asym })).toBe("body-only");
  });

  it("CREED near-miss: an 'N or more creatures' (menace-style) except-by form stays body-only (safe FN)", () => {
    const nOrMore = "Krakens you control can't be blocked except by two or more creatures.";
    expect(parseGroupBlockRestriction(nOrMore)).toBeNull();
    expect(classifyCard({ name: "X", type: "Creature — Kraken", oracle: nOrMore })).toBe("body-only");
  });
});

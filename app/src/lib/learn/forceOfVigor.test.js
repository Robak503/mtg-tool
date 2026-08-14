/**
 * forceOfVigor.test.js — FORCE OF VIGOR (2026-08-14), the fixed-count "up to two" destroy.
 * "If it's not your turn, you may exile a green card from your hand rather than pay this spell's mana
 * cost.\nDestroy up to two target artifacts and/or enchantments."
 *
 * ⭐ ONE NEW ARM on two existing machines. The alt-cost line was ALREADY modeled (castModifiers
 * EXILE-COLOR — Force of Negation's exact shape, condition notYourTurn); the multi-count destroy lane
 * was ALREADY built end-to-end for Rampaging Yao Guai (subset enumeration → applyDestroyEffect over
 * ctx.targets). The only gap was the wording: "up to two target artifacts and/or enchantments" with a
 * FIXED cap and no collective-MV constraint. One anchored regex, riding both lanes.
 *
 * Mutation-checked (2026-08-14, applied-check by PRINTING THE CHANGED LINE BACK; throw on no-op):
 *   · the new arm's regex anchored to five (wrong count word) → Force of Vigor parks.
 *   · maxTargets dropped from the emitted atom → single-target path takes over → the pair subset dies.
 *
 * Real oracle fixture (bundled Scryfall, probed 2026-08-14 — the FULL text, both lines).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { parseEffectClause } from "./effects/parser.js";
import { extractAltCost } from "./effects/castModifiers.js";
import { expandCastChoices } from "./effects/targeting.js";
import { runEffectProgram } from "./effects/runProgram.js";
import { createGameState, createPermanent, findPermanent, _resetIdsForTests } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const FOV = { name: "Force of Vigor", type: "Instant", mana: "{2}{G}{G}", keywords: [],
  oracle: "If it's not your turn, you may exile a green card from your hand rather than pay this spell's mana cost.\nDestroy up to two target artifacts and/or enchantments." };
const CLAUSE = "destroy up to two target artifacts and/or enchantments";

const withEnemyPermanents = (specs) => {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  const perms = specs.map((o) => createPermanent({ id: o.id, controller: "ai", summoningSick: false,
    card: { id: `c-${o.id}`, name: o.id, type: o.type, oracle: "", cmc: o.cmc ?? 1 } }));
  return { ...s, players: { ...s.players, ai: { ...s.players.ai, battlefield: perms, hand: [] } } };
};
const comboSets = (combos) => combos.map((c) => (c.targets || []).map((t) => t.id).sort().join(",")).sort();

describe("Force of Vigor — parse shape and the carrier", () => {
  it("⭐ the clause parses HIGH → a fixed-cap multi-count destroy (minTargets 0, maxTargets 2)", () => {
    const p = parseEffectClause(CLAUSE, "Instant");
    expect(p.confidence).toBe("high");
    expect(p.atoms).toEqual([{ op: "destroy", targetType: "artifactOrEnchantment", minTargets: 0, maxTargets: 2 }]);
  });

  it("⭐ Force of Vigor flips native-spell; the alt-cost line is the ALREADY-modeled Force pitch", () => {
    expect(classifyCard(FOV)).toBe("native-spell");
    const { altCost, rest } = extractAltCost(FOV.oracle);
    expect(altCost).toEqual({ kind: "exileColorCard", color: "green", condition: "notYourTurn" });
    expect(rest).toBe("Destroy up to two target artifacts and/or enchantments.");
  });

  it("⛔ CREED near-misses stay LOW: the plain-'or' print, and an unlisted count word", () => {
    expect(parseEffectClause("destroy up to two target artifacts or enchantments", "Instant").confidence).toBe("low");
    expect(parseEffectClause("destroy up to five target artifacts and/or enchantments", "Instant").confidence).toBe("low");
  });
});

describe("⭐⭐ LAW 6 — the cap binds at enumeration, the resolver destroys the chosen pair", () => {
  const prog = parseEffectClause(CLAUSE, "Instant", { hasX: false });

  it("⭐⭐ three eligible permanents: every subset of size ≤ 2 is offered, NO 3-subset exists", () => {
    const s = withEnemyPermanents([
      { id: "a1", type: "Artifact" }, { id: "e1", type: "Enchantment" }, { id: "a2", type: "Artifact" },
    ]);
    const combos = expandCastChoices(s, "user", prog, [], {});
    const row = comboSets(combos);
    console.log("  WITNESS forceOfVigorCap", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual(["", "a1", "a1,a2", "a1,e1", "a2", "a2,e1", "e1"]);
    expect(combos.some((c) => (c.targets || []).length > 2)).toBe(false);
  });

  it("⭐⭐ resolving the mixed pair destroys BOTH (an artifact AND an enchantment in one cast)", () => {
    const s = withEnemyPermanents([
      { id: "a1", type: "Artifact" }, { id: "e1", type: "Enchantment" }, { id: "a2", type: "Artifact" },
    ]);
    const targets = [
      { type: "permanent", id: "a1", controller: "ai", atomIndex: 0 },
      { type: "permanent", id: "e1", controller: "ai", atomIndex: 0 },
    ];
    const out = runEffectProgram(s, { source: { name: "Force of Vigor" }, payload: { params: { program: prog, controller: "user", targets } } });
    expect(findPermanent(out, "a1")).toBeNull();
    expect(findPermanent(out, "e1")).toBeNull();
    expect(findPermanent(out, "a2")).not.toBeNull();
    expect(out.players.ai.graveyard.map((c) => c.id).sort()).toEqual(["c-a1", "c-e1"]);
  });

  it("a creature is never eligible, and choosing NOTHING is a legal cast (minTargets 0)", () => {
    const s = withEnemyPermanents([{ id: "c1", type: "Creature — Golem" }, { id: "a1", type: "Artifact" }]);
    const combos = expandCastChoices(s, "user", prog, [], {});
    expect(combos.some((c) => (c.targets || []).some((t) => t.id === "c1"))).toBe(false);
    expect(comboSets(combos)).toEqual(["", "a1"]);
  });
});

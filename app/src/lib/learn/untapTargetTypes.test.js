/**
 * untapTargetTypes.test.js — "Untap target ARTIFACT / ENCHANTMENT / NONLAND PERMANENT"
 * (Voltaic Key #1776 · Clock of Omens #1743 · Aphetto Alchemist).
 *
 * ⭐ THE TYPE LIST WAS THE MISSING CELL, not the machinery. "untap target creature", "…land" and
 * "…permanent" all parsed; "untap target artifact" did not, purely because the word wasn't in one
 * alternation. Every type added here already had its own PERMANENT_PREDICATES entry driving
 * enumerateTargets, so the widening adds vocabulary and no new targeting behaviour — which is exactly
 * what the runtime pins below check, rather than trusting that claim.
 *
 * Found by probe-near-miss-clauses.mjs at distance 1 from "untap target creature".
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { parseEffectClause } from "./effects/parser.js";
import { enumerateTargets } from "./spellEffects.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const atom = (clause) => parseEffectClause(clause).atoms[0];

const CARDS = {
  bear: { id: "c-bear", name: "Bear", type: "Creature — Bear", power: 2, toughness: 2, oracle: "" },
  rock: { id: "c-rock", name: "Sol Ring", type: "Artifact", oracle: "" },
  aura: { id: "c-aura", name: "Pacifism", type: "Enchantment — Aura", oracle: "" },
  forest: { id: "c-forest", name: "Forest", type: "Basic Land — Forest", oracle: "" },
};

function board() {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...s, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user",
    players: {
      ...s.players,
      user: {
        ...s.players.user,
        battlefield: Object.entries(CARDS).map(([id, card]) =>
          createPermanent({ id, card, controller: "user", summoningSick: false, tapped: true })),
      },
    },
  };
}
const offered = (clause) => enumerateTargets(board(), "user", atom(clause), [], {}).map((t) => t.id).sort();

describe("the parser — the widened type list", () => {
  it("artifact / enchantment / nonland permanent now parse", () => {
    expect(atom("untap target artifact")).toEqual({ op: "untap", targetType: "artifact", restrictions: [] });
    expect(atom("untap target enchantment")).toEqual({ op: "untap", targetType: "enchantment", restrictions: [] });
    expect(atom("untap target nonland permanent")).toEqual({ op: "untap", targetType: "nonlandPermanent", restrictions: [] });
  });

  it("REGRESSION PIN — creature / permanent / land are byte-identical", () => {
    expect(atom("untap target creature")).toEqual({ op: "untap", targetType: "creature" });
    expect(atom("untap target permanent")).toEqual({ op: "untap", targetType: "permanent", restrictions: [] });
    expect(atom("untap target land")).toEqual({ op: "untap", targetType: "land" });
  });

  it("the 'another' exclusion still rides every type (Formidable Speaker's form)", () => {
    expect(atom("untap another target permanent").restrictions).toEqual([{ kind: "notSource" }]);
    expect(atom("untap another target artifact").restrictions).toEqual([{ kind: "notSource" }]);
  });

  it("CREED — a type UNION is still not claimed (no predicate, so no fabricated pool)", () => {
    expect(parseEffectClause("untap target artifact or creature").atoms?.[0]?.op).not.toBe("untap");
    expect(parseEffectClause("untap target creature or land").atoms?.[0]?.op).not.toBe("untap");
  });
});

describe("TARGETING — the pool is genuinely narrowed, not just labelled", () => {
  it("THE LOAD-BEARING ONE — 'untap target artifact' offers ONLY the artifact", () => {
    // The claim being checked is that the new targetType reaches a real predicate. A label with no
    // predicate behind it would fall through to a wider pool and untap the wrong permanent.
    expect(offered("untap target artifact")).toEqual(["rock"]);
  });

  it("enchantment and nonland permanent select their own pools", () => {
    expect(offered("untap target enchantment")).toEqual(["aura"]);
    expect(offered("untap target nonland permanent")).toEqual(["aura", "bear", "rock"]); // everything but the Forest
  });

  it("REGRESSION PIN — creature and permanent are unchanged", () => {
    expect(offered("untap target creature")).toEqual(["bear"]);
    expect(offered("untap target permanent")).toEqual(["aura", "bear", "forest", "rock"]);
  });
});

describe("classification — the staple this unblocks", () => {
  it("Voltaic Key #1776 flips", () => {
    expect(classifyCard({ name: "Voltaic Key", type: "Artifact", mana: "{1}", keywords: [],
      oracle: "{1}, {T}: Untap target artifact." })).toMatch(/^native/);
  });
});

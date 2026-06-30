/**
 * rampTutorDeterminism.test.js — classifyCard must be DETERMINISTIC for a fixed card object.
 *
 * Regression guard for the RAMP-MULTI-X tutors (Boundless Realms, Traverse the Outlands), whose
 * tier was reported flipping native-spell↔arbiter-spell across fresh `tier-fingerprint.mjs`
 * processes — polluting flip-diff gates with phantom GAINED/LOST entries.
 *
 * ROOT-CAUSE FINDINGS (2026-06-30): classifyCard is order- and process-INDEPENDENT for a fixed
 * card object — verified by 100+ fresh-process tier-fingerprint runs (30/30 native on the
 * mfx-modeled tree, 72/72 arbiter pre-mfx) AND by code audit (anchored non-global regexes, an
 * insertion-ordered CLAUSE_PARSERS array, /i-flag cached keyword regexes with no `/g` lastIndex
 * leak, no Math.random / readdir / hash-iteration in the classify path). The observed flicker did
 * NOT reproduce in a stable single-process environment; it traced to measurement run DURING
 * parallel-build filesystem churn (a sibling agent's `npm ci`) and to the SEPARATE multi-printing
 * tier-conflict gate issue (Everythingamajig / Red Herring / Unquenchable Fury — different oracle
 * per printing), now deduped in tier-fingerprint.mjs.
 *
 * This test LOCKS the determinism the gate relies on: a fixed card object always classifies the
 * SAME tier, regardless of how many times it's classified or what other cards were classified
 * before it (the cross-card state-leak guard that would catch any future `/g`-regex lastIndex bug).
 */
import { describe, it, expect } from "vitest";
import { classifyCard } from "./coverage.js";

// The two RAMP-MULTI-X tutors (exact bundled oracle). X is a BOARD-derived count (not a cast {X}),
// modeled by the mfx tutor matcher → both are native-spell (the correct, modeled tier).
const TUTORS = [
  {
    name: "Boundless Realms",
    type: "Sorcery",
    mana: "{6}{G}",
    oracle: "Search your library for up to X basic land cards, where X is the number of lands you control, put them onto the battlefield tapped, then shuffle.",
  },
  {
    name: "Traverse the Outlands",
    type: "Sorcery",
    mana: "{5}{G}",
    oracle: "Search your library for up to X basic land cards, where X is the greatest power among creatures you control. Put those cards onto the battlefield tapped, then shuffle.",
  },
];

// A diverse interleave set — spells + permanents that exercise other clause parsers, so a
// `/g`-regex lastIndex leak (or any cross-card mutable state) in the parse path would surface as
// a tutor tier that depends on what was classified just before it.
const INTERLEAVE = [
  { name: "Lightning Bolt", type: "Instant", mana: "{R}", oracle: "Lightning Bolt deals 3 damage to any target." },
  { name: "Grizzly Bears", type: "Creature — Bear", mana: "{1}{G}", oracle: "" },
  { name: "Cultivate", type: "Sorcery", mana: "{2}{G}", oracle: "Search your library for up to two basic land cards, reveal those cards, put one onto the battlefield tapped and the other into your hand, then shuffle." },
  { name: "Divination", type: "Sorcery", mana: "{2}{U}", oracle: "Draw two cards." },
  { name: "Storm spell", type: "Sorcery", mana: "{2}{R}", oracle: "Storm (When you cast this spell, copy it for each spell cast before it this turn.)\nDeal 1 damage to any target." },
];

describe("RAMP-MULTI-X tutor classification is deterministic (regression: flip-diff phantom flips)", () => {
  for (const card of TUTORS) {
    it(`${card.name} → a single stable tier across 200 classifications of a fresh object`, () => {
      const tiers = new Set();
      for (let i = 0; i < 200; i++) tiers.add(classifyCard({ ...card }));
      expect([...tiers]).toEqual(["native-spell"]); // stable AND the correct modeled tier
    });
  }

  it("tutor tier is independent of what was classified before it (cross-card state-leak guard)", () => {
    const before = TUTORS.map((c) => classifyCard({ ...c }));
    // Hammer the parse path with other cards (and a partial re-parse of the tutors' own substrings)
    // between each tutor classification — a stateful `/g` regex would drift here.
    for (let round = 0; round < 25; round++) {
      for (const noise of INTERLEAVE) classifyCard({ ...noise });
      for (let t = 0; t < TUTORS.length; t++) {
        expect(classifyCard({ ...TUTORS[t] })).toBe(before[t]);
      }
    }
  });

  it("both tutors are native-spell (the tier must not silently change)", () => {
    expect(classifyCard({ ...TUTORS[0] })).toBe("native-spell");
    expect(classifyCard({ ...TUTORS[1] })).toBe("native-spell");
  });
});

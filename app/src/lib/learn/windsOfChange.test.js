/**
 * windsOfChange.test.js — WINDS OF CHANGE (SHELF-TAIL — Nekusar's vein #2, the one wheel straggler).
 *
 * "Each player shuffles the cards from their hand into their library, then draws that many cards." — the
 * HAND-ONLY twin of the Timetwister wheel (timetwisterWheel.test.js): only the hand folds into the library
 * (the GRAVEYARD stays put, unlike Echo of Eons), and the draw is per-player "that many" = the count that
 * player just shuffled in — a net-neutral hand refill, not a fixed seven. ONE collapse atom (the ", then draws
 * that many" back-reference shatters under the clause splitter). CREED FP = losing/duplicating cards, touching
 * the graveyard, drawing a wrong (fixed) count, or a nondeterministic shuffle.
 *
 * Mutation-checked (via Edit): (1) neuter matchWindsOfChange (→ null) → parse LOW + Winds of Change body-only
 * (parse + classify pins die); (2) fold the GRAVEYARD into the pool (like Timetwister) → the graveyard-untouched
 * pin dies — proving the hand-only semantics load-bearing.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState } from "./gameState.js";
import { parseEffectClause, programConfidence } from "./effects/parser.js";
import { applyWindsOfChange } from "./effects/atoms/library.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

// Real oracle text (bundled Scryfall data — never from memory).
const WINDS = { id: "woc", name: "Winds of Change", type: "Sorcery", mana: "{R}",
  oracle: "Each player shuffles the cards from their hand into their library, then draws that many cards." };

const cards = (prefix, n) => Array.from({ length: n }, (_, i) => ({ id: `${prefix}${i}`, name: `${prefix}${i}`, type: "Instant", oracle: "" }));

describe("parse + classify", () => {
  it("the shuffle-in + draw-that-many collapses to ONE atom; Winds of Change flips native-spell", () => {
    const p = parseEffectClause("Each player shuffles the cards from their hand into their library, then draws that many cards.", "Sorcery");
    expect(programConfidence(p)).toBe("high");
    expect(p.atoms).toEqual([{ op: "winds-of-change", targetType: null }]);
    expect(classifyCard(WINDS)).toBe("native-spell");
  });
  it("it does NOT collide with the Timetwister wheel (hand+GY, fixed seven) — that stays its own atom", () => {
    const p = parseEffectClause("Each player shuffles their hand and graveyard into their library, then draws seven cards.", "Sorcery");
    expect(p.atoms).toEqual([{ op: "timetwister-wheel", draw: 7, targetType: null }]);
  });
});

describe("resolver (CREED core — refill-that-many, graveyard untouched, conservation, determinism)", () => {
  it("each player draws exactly their old hand size; the graveyard is UNTOUCHED; the library is net-neutral", () => {
    let s = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
    s = { ...s, rngSeed: 42, players: { ...s.players,
      user: { ...s.players.user, library: cards("ul", 5), hand: cards("uh", 3), graveyard: cards("ug", 4) },
      ai1: { ...s.players.ai1, library: cards("al", 2), hand: [], graveyard: cards("ag", 1) },   // empty hand → draws 0
      ai2: { ...s.players.ai2, library: cards("bl", 4), hand: cards("bh", 2), graveyard: [] },
    } };
    const after = applyWindsOfChange(s, { op: "winds-of-change" }, { controller: "user" });
    // draw == old hand size, per player
    expect(after.players.user.hand).toHaveLength(3);
    expect(after.players.ai1.hand).toHaveLength(0);  // empty hand shuffles and draws nothing
    expect(after.players.ai2.hand).toHaveLength(2);
    // library net-neutral (fold hand in, draw that many back out): oldLib size restored
    expect(after.players.user.library).toHaveLength(5);
    expect(after.players.ai1.library).toHaveLength(2);
    expect(after.players.ai2.library).toHaveLength(4);
    // GRAVEYARD untouched — the whole point vs Timetwister (which folds GY in)
    expect(after.players.user.graveyard.map((c) => c.id)).toEqual(cards("ug", 4).map((c) => c.id));
    expect(after.players.ai1.graveyard.map((c) => c.id)).toEqual(cards("ag", 1).map((c) => c.id));
    // conservation — the exact hand+library ids are preserved (no loss/duplication), graveyard held aside
    const userPool = [...after.players.user.hand, ...after.players.user.library].map((c) => c.id).sort();
    expect(userPool).toEqual([...cards("ul", 5), ...cards("uh", 3)].map((c) => c.id).sort());
  });

  it("deterministic: the same seed yields byte-identical hands; the seed advances", () => {
    let s = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
    s = { ...s, rngSeed: 7, players: { ...s.players, user: { ...s.players.user, library: cards("l", 6), hand: cards("h", 3), graveyard: cards("g", 3) } } };
    const a = applyWindsOfChange(s, { op: "winds-of-change" }, { controller: "user" });
    const b = applyWindsOfChange(s, { op: "winds-of-change" }, { controller: "user" });
    expect(a.players.user.hand.map((c) => c.id)).toEqual(b.players.user.hand.map((c) => c.id));
    expect(a.rngSeed).not.toBe(7);
  });
});

/**
 * timetwisterWheel.test.js — the TIMETWISTER WHEEL (Echo of Eons / Timetwister — SHELF Phase 2).
 *
 * "Each player shuffles their hand and graveyard into their library, then draws seven cards." — ONE
 * collapse atom (the ", then" shatters under the clause splitter): per player, hand + graveyard fold into
 * the library, ONE deterministic shuffle (the threaded rngSeed, advanced per player), draw 7 bounded by
 * the pile. Echo's Flashback line joins the cost-only keyword strip (cast-from-graveyard is an un-offered
 * option; the hard cast is byte-identical). CREED FP = losing/duplicating cards across the fold, an
 * unbounded draw, or a nondeterministic shuffle.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState } from "./gameState.js";
import { parseEffectClause, programConfidence } from "./effects/parser.js";
import { applyTimetwisterWheel } from "./effects/atoms/library.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

// Real oracle text (bundled Scryfall data — never from memory).
const ECHO = { id: "ee", name: "Echo of Eons", type: "Sorcery", mana: "{4}{U}{U}",
  oracle: "Each player shuffles their hand and graveyard into their library, then draws seven cards.\nFlashback {2}{U} (You may cast this card from your graveyard for its flashback cost. Then exile it.)" };
const TIMETWISTER = { id: "tt", name: "Timetwister", type: "Sorcery", mana: "{2}{U}",
  oracle: "Each player shuffles their hand and graveyard into their library, then draws seven cards." };

const cards = (prefix, n) => Array.from({ length: n }, (_, i) => ({ id: `${prefix}${i}`, name: `${prefix}${i}`, type: "Instant", oracle: "" }));

describe("parse + classify", () => {
  it("the two-part sentence collapses to ONE atom; Echo (flashback-stripped) + Timetwister flip native-spell", () => {
    const p = parseEffectClause("Each player shuffles their hand and graveyard into their library, then draws seven cards.", "Sorcery");
    expect(programConfidence(p)).toBe("high");
    expect(p.atoms).toEqual([{ op: "timetwister-wheel", draw: 7, targetType: null }]);
    expect(classifyCard(ECHO)).toBe("native-spell");
    expect(classifyCard(TIMETWISTER)).toBe("native-spell");
  });
});

describe("resolver (CREED core — conservation + bounds + determinism)", () => {
  it("every player's zones fold losslessly: hand+GY emptied, 7 drawn, the rest in-library; short piles draw what exists", () => {
    let s = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
    s = { ...s, rngSeed: 42, players: { ...s.players,
      user: { ...s.players.user, library: cards("ul", 5), hand: cards("uh", 3), graveyard: cards("ug", 4) },   // 12 total
      ai1: { ...s.players.ai1, library: cards("al", 2), hand: cards("ah", 1), graveyard: [] },                  // 3 total (short)
    } };
    const after = applyTimetwisterWheel(s, { op: "timetwister-wheel", draw: 7 }, { controller: "user" });
    expect(after.players.user.hand).toHaveLength(7);
    expect(after.players.user.library).toHaveLength(5); // 12 − 7
    expect(after.players.user.graveyard).toHaveLength(0);
    // conservation — the exact same 12 card ids, no loss/duplication
    const ids = [...after.players.user.hand, ...after.players.user.library].map((c) => c.id).sort();
    expect(ids).toEqual([...cards("ul", 5), ...cards("uh", 3), ...cards("ug", 4)].map((c) => c.id).sort());
    // the short pile draws all 3 it has (CR 120.3 handled by the bound; the empty-draw loss is the runner's SBA)
    expect(after.players.ai1.hand).toHaveLength(3);
    expect(after.players.ai1.library).toHaveLength(0);
  });

  it("deterministic: the same seed yields byte-identical hands; the seed advances", () => {
    let s = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
    s = { ...s, rngSeed: 7, players: { ...s.players, user: { ...s.players.user, library: cards("l", 6), hand: cards("h", 3), graveyard: cards("g", 3) } } };
    const a = applyTimetwisterWheel(s, { op: "timetwister-wheel", draw: 7 }, { controller: "user" });
    const b = applyTimetwisterWheel(s, { op: "timetwister-wheel", draw: 7 }, { controller: "user" });
    expect(a.players.user.hand.map((c) => c.id)).toEqual(b.players.user.hand.map((c) => c.id));
    expect(a.rngSeed).not.toBe(7);
  });
});

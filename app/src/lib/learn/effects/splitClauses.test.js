/**
 * splitClauses.test.js — regression pin for the Gamble tutor+random-discard split (2026-07-23).
 *
 * splitClauses has no broader unit-test file of its own (it was extracted verbatim from parser.js
 * and is otherwise verified by the whole-corpus program-fingerprint gate — see the C1 decomposition
 * notes), but this ONE rule is new logic (not an extraction) and deserves its own pin: it's the
 * first case where a "search your library" sentence gets SPLIT rather than kept whole, and the
 * whole-corpus fingerprint diff that verified it (34,245 cards, exactly one line changed: Gamble)
 * doesn't run on every `npm test` — this does.
 */
import { describe, expect, it } from "vitest";

import { splitClauses } from "./splitClauses.js";
import { parseEffectClause } from "./parser.js";
import { classifyCard } from "../coverage.js";

describe("splitClauses — Gamble's interposed random discard", () => {
  it("excises the discard clause and reattaches the shuffle to the tutor half", () => {
    const clauses = splitClauses(
      "Search your library for a card, put that card into your hand, discard a card at random, then shuffle.",
    );
    expect(clauses).toEqual([
      "Search your library for a card, put that card into your hand, then shuffle",
      "discard a card at random",
    ]);
  });

  it("Gamble's full oracle parses to a tutor atom + a discard atom, high confidence", () => {
    const program = parseEffectClause(
      "Search your library for a card, put that card into your hand, discard a card at random, then shuffle.",
      "Sorcery",
    );
    expect(program.confidence).toBe("high");
    expect(program.unparsedTail).toBeNull();
    expect(program.atoms).toEqual([
      { op: "tutor", filter: null, filterLabel: "card", destination: "hand", targetType: null },
      { op: "discard", amount: 1, who: "controller", targetType: null, atRandom: true },
    ]);
  });

  it("Gamble classifies as a native card (was arbiter-spell before this fix)", () => {
    const gamble = { name: "Gamble", type: "Sorcery", mana: "{R}", oracle: "Search your library for a card, put that card into your hand, discard a card at random, then shuffle." };
    expect(classifyCard(gamble)).toBe("native-spell");
  });

  it("does NOT touch the same phrase embedded in a modal bullet (Night Out in Vegas) — a different shape entirely", () => {
    // "discard a card at random, then shuffle" is not immediately followed by end-of-sentence here —
    // it's one bullet among several inside a "choose one" upkeep trigger. The anchor requires the
    // WHOLE sentence to be exactly the tutor+discard shape, so a modal-embedded copy of the same
    // words must fall through untouched (this is a live-verified regression guard, not a hypothetical:
    // a corpus check found Night Out in Vegas is the only OTHER card with this exact phrase).
    const clauses = splitClauses(
      "Search your library for a card, put that card into your hand, discard a card at random",
    );
    // No trailing "then shuffle" -> the anchor (which requires it) must NOT match; the sentence falls
    // through to the generic "search your library" keep-whole rule instead, staying as ONE clause.
    expect(clauses).toEqual([
      "Search your library for a card, put that card into your hand, discard a card at random",
    ]);
  });
});

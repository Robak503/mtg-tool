/**
 * discardHandDrawSame.test.js — BLITZ TW-1: "Discard [all the cards in] your hand, then draw that many
 * cards." (Tolarian Winds; Shattered Perception and Decaying Time Loop ride the flashback/retrace
 * cost-keyword strip). ONE composite atom — the hand is counted BEFORE the discard, pitched through the
 * shared discard-all path, then exactly that many drawn. Matched UP FRONT on the whole stripped oracle:
 * the ", then" span never reaches splitClauses, so the bare "draw that many cards" tail can't mis-bind
 * to the combat-damage countContext (the latent gun this disarms for the known wordings). A plus-one
 * variant (Heartwarming Redemption) breaks the whole-oracle match → parked.
 * Real oracle fixtures (bundled Scryfall, verified 2026-07-16).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { createGameState, _resetIdsForTests } from "./gameState.js";
import { runEffectProgram } from "./effects/runProgram.js";
import { parseEffectClause } from "./effects/parser.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

describe("TW-1 — the whole-hand cycle", () => {
  it("parses to ONE composite atom; the carriers flip; the plus-one variant parks", () => {
    const p = parseEffectClause("Discard all the cards in your hand, then draw that many cards.", "Instant");
    expect(p.confidence).toBe("high");
    expect(p.atoms).toEqual([{ op: "discard-hand-draw-same", targetType: null }]);
    expect(classifyCard({ id: "tw", name: "Tolarian Winds", type: "Instant", mana: "{1}{U}",
      oracle: "Discard all the cards in your hand, then draw that many cards." })).toBe("native-spell");
    expect(parseEffectClause("Discard all the cards in your hand, then draw that many cards plus one.", "Instant").confidence).toBe("low");
  });
  it("runtime: N discarded (watchers ride the shared path), exactly N drawn; an empty hand no-ops", () => {
    let s = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
    s = { ...s, players: { ...s.players, user: { ...s.players.user,
      hand: [{ id: "h1", name: "A", type: "Instant" }, { id: "h2", name: "B", type: "Instant" }],
      library: [{ id: "l1", name: "L1" }, { id: "l2", name: "L2" }, { id: "l3", name: "L3" }] } } };
    const run = (st) => runEffectProgram(st, { source: { name: "Tolarian Winds" }, payload: { params: { program: { atoms: [{ op: "discard-hand-draw-same", targetType: null }] }, controller: "user", targets: [], sourceId: null } } });
    const after = run(s);
    expect(after.players.user.graveyard.map((c) => c.name)).toEqual(["A", "B"]);
    expect(after.players.user.hand.map((c) => c.name)).toEqual(["L1", "L2"]); // exactly 2 — never 3
    const empty = run({ ...s, players: { ...s.players, user: { ...s.players.user, hand: [] } } });
    expect(empty.players.user.hand).toHaveLength(0); // 0 discarded → 0 drawn
  });
});

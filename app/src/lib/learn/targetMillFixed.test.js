/**
 * targetMillFixed.test.js — FIXED-AMOUNT targeted mill (BLITZ TM-1: Tome Scour / Millstone /
 * Returned Centaur class). "Target player/opponent mills N cards" parses to the SAME who:"target"
 * mill atom the half-library form (Kitsune's Technique) shipped; applyMill loops ctx.targets with
 * the printed amount. Trigger carriers route natively because atomTargetIntent reports the targeted
 * mill as "enemy" (the flush chooser picks an opponent — the self-mill data-poisoning hazard this
 * class was deferred over is structurally closed). CREED FPs guarded here: a rider form ("that
 * many", "for each", "twice that many") must NOT match; the enemy intent must never be ambiguous
 * for player/opponent targets; a vanished target mills nobody.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState } from "./gameState.js";
import { atomTargetIntent, parseEffectClause, programConfidence } from "./effects/parser.js";
import { applyMill } from "./effects/atoms/library.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

// Real oracle text (bundled Scryfall data — never from memory).
const TOME_SCOUR = { id: "ts", name: "Tome Scour", type: "Sorcery", mana: "{U}",
  oracle: "Target player mills five cards." };
const MIND_SCULPT = { id: "ms", name: "Mind Sculpt", type: "Sorcery", mana: "{1}{U}",
  oracle: "Target opponent mills seven cards." };
const WEIGHT_OF_MEMORY = { id: "wm", name: "Weight of Memory", type: "Sorcery", mana: "{3}{U}",
  oracle: "Draw three cards. Target player mills three cards." };
const THOUGHT_SCOUR = { id: "tsc", name: "Thought Scour", type: "Instant", mana: "{U}",
  oracle: "Target player mills two cards.\nDraw a card." };
const MILLSTONE = { id: "mst", name: "Millstone", type: "Artifact", mana: "{2}",
  oracle: "{2}, {T}: Target player mills two cards." };
const RETURNED_CENTAUR = { id: "rc", name: "Returned Centaur", type: "Creature — Zombie Centaur", mana: "{3}{U}",
  oracle: "When this creature enters, target player mills four cards.", power: "2", toughness: "4" };

describe("parse (the clause) + word-number reach", () => {
  it("'target player mills five cards' → the fixed-amount who:target atom, HIGH", () => {
    const p = parseEffectClause("target player mills five cards", "Sorcery");
    expect(programConfidence(p)).toBe("high");
    expect(p.atoms).toEqual([{ op: "mill", amount: 5, who: "target", targetType: "player" }]);
  });
  it("'target opponent mills thirteen cards' → amount 13, targetType opponent (Startled Awake's front face)", () => {
    const p = parseEffectClause("target opponent mills thirteen cards", "Sorcery");
    expect(programConfidence(p)).toBe("high");
    expect(p.atoms).toEqual([{ op: "mill", amount: 13, who: "target", targetType: "opponent" }]);
  });
  it("a two-clause spell body parses BOTH clauses (Weight of Memory)", () => {
    const p = parseEffectClause(WEIGHT_OF_MEMORY.oracle, "Sorcery");
    expect(programConfidence(p)).toBe("high");
    expect(p.atoms).toEqual([
      { op: "draw", amount: 3, targetType: null },
      { op: "mill", amount: 3, who: "target", targetType: "player" },
    ]);
  });
  it("CREED — rider forms fall through unmatched (anchored regex)", () => {
    expect(programConfidence(parseEffectClause("target player mills that many cards", "Instant"))).not.toBe("high");
    expect(programConfidence(parseEffectClause("target player mills two cards for each zombie you control", "Instant"))).not.toBe("high");
    expect(programConfidence(parseEffectClause("target player mills twice that many cards", "Instant"))).not.toBe("high");
  });
  it("the untargeted forms are untouched (who routing unchanged)", () => {
    expect(parseEffectClause("each player mills three cards", "Sorcery").atoms[0].who).toBe("eachPlayer");
    expect(parseEffectClause("you mill two cards", "Sorcery").atoms[0].who).toBe("controller");
  });
});

describe("classify (the tier flips, per carrier shape)", () => {
  it("spell carriers → native-spell (Tome Scour, Mind Sculpt, Weight of Memory, Thought Scour)", () => {
    expect(classifyCard(TOME_SCOUR)).toBe("native-spell");
    expect(classifyCard(MIND_SCULPT)).toBe("native-spell");
    expect(classifyCard(WEIGHT_OF_MEMORY)).toBe("native-spell");
    expect(classifyCard(THOUGHT_SCOUR)).toBe("native-spell");
  });
  it("activated carrier → native-activated (Millstone)", () => {
    expect(classifyCard(MILLSTONE)).toBe("native-activated");
  });
  it("ETB trigger carrier → native-trigger (Returned Centaur) — the flush-side intent is enemy", () => {
    expect(classifyCard(RETURNED_CENTAUR)).toBe("native-trigger");
  });
});

describe("atomTargetIntent (the trigger-flush side gate)", () => {
  it("targeted mill is enemy-side for player AND opponent targets", () => {
    expect(atomTargetIntent({ op: "mill", amount: 4, who: "target", targetType: "player" })).toBe("enemy");
    expect(atomTargetIntent({ op: "mill", amount: 4, who: "target", targetType: "opponent" })).toBe("enemy");
  });
  it("non-targeted mill has no chosen-target intent (null)", () => {
    expect(atomTargetIntent({ op: "mill", amount: 3, who: "eachOpponent", targetType: null })).toBe(null);
  });
});

describe("resolver (fixed amount, target branch)", () => {
  const MILL4 = { op: "mill", amount: 4, who: "target", targetType: "player" };

  function withLibrary(state, pid, n) {
    const lib = Array.from({ length: n }, (_, i) => ({ id: `${pid}-c${i}`, name: `C${i}`, type: "Instant", oracle: "" }));
    return { ...state, players: { ...state.players, [pid]: { ...state.players[pid], library: lib, graveyard: [] } } };
  }

  it("mills exactly the printed amount from THAT player's library only", () => {
    let s = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
    s = withLibrary(s, "ai1", 9);
    s = withLibrary(s, "user", 5);
    const after = applyMill(s, MILL4, { controller: "user", targets: [{ type: "player", id: "ai1" }] });
    expect(after.players.ai1.graveyard).toHaveLength(4);
    expect(after.players.ai1.library).toHaveLength(5);
    expect(after.players.user.library).toHaveLength(5); // the caster's library untouched
  });

  it("a short library bounds the mill (physical reality, CR 701.13a)", () => {
    let s = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
    s = withLibrary(s, "ai1", 3);
    const after = applyMill(s, MILL4, { controller: "user", targets: [{ type: "player", id: "ai1" }] });
    expect(after.players.ai1.graveyard).toHaveLength(3);
    expect(after.players.ai1.library).toHaveLength(0);
  });

  it("a vanished/absent target mills nobody", () => {
    let s = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
    s = withLibrary(s, "ai1", 6);
    const after = applyMill(s, MILL4, { controller: "user", targets: [] });
    expect(after.players.ai1.graveyard).toHaveLength(0);
  });
});

/**
 * discardOpponentCantBlock.test.js — two TARGET-SIDE phrasing extensions (overnight grind, corpus levers).
 *
 * 1) TARGET-OPPONENT DISCARD — "target opponent discards N cards" (Ravenous Rats / Dirty Rat / Deadbridge
 *    Shaman / Deception / Purge the Profane …). The same targeted discard as the shipped "target player"
 *    form, but the printed "opponent" narrows the legal targets to opponents (targetType "opponent" →
 *    enumerateTargets.addOpponents tags each as {type:"player"}, which applyDiscard's who:"target" branch
 *    filters on). The discard case already reports enemy intent, so an ETB/dies TRIGGER routes natively.
 * 2) CANT-BLOCK "an opponent controls" — "target creature an opponent controls can't block this turn"
 *    (Clamor Shaman / Arena Athlete / Smelt-Ward Minotaur). The same offensive cantBlock grant as the bare
 *    "target creature can't block", plus the printed opponent restriction (cant-block is already enemy intent).
 *
 * Flip-diff GAINED = 19 (the two families), LOST = 0.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { parseEffectClause, programConfidence, parseEffectProgram } from "./effects/parser.js";
import { classifyCard } from "./coverage.js";
import { _resetIdsForTests, createGameState } from "./gameState.js";
import { resolveAtom } from "./effects/effectAtoms.js";

beforeEach(() => _resetIdsForTests());

describe("target-opponent discard — parser + classify", () => {
  it("'target opponent discards a card' → discard {who:target, targetType:opponent, amount:1}", () => {
    expect(parseEffectClause("target opponent discards a card")).toMatchObject({
      confidence: "high", atoms: [{ op: "discard", who: "target", amount: 1, targetType: "opponent" }],
    });
    expect(parseEffectClause("target opponent discards two cards").atoms[0].amount).toBe(2);
  });
  it("Ravenous Rats (ETB) / Deception (pure spell) / Purge the Profane (discard + gain-life) flip native", () => {
    expect(classifyCard({ type: "Creature — Rat", name: "Ravenous Rats", mana: "{1}{B}", oracle: "When this creature enters, target opponent discards a card." })).toBe("native-trigger");
    expect(classifyCard({ type: "Sorcery", name: "Deception", mana: "{2}{B}", oracle: "Target opponent discards two cards." })).toBe("native-spell");
    expect(classifyCard({ type: "Sorcery", name: "Purge the Profane", mana: "{1}{W}{B}", oracle: "Target opponent discards two cards and you gain 2 life." })).toBe("native-spell");
  });
  it("CREED: 'each player discards' stays eachPlayer (hits the controller too) — not narrowed to opponent", () => {
    expect(parseEffectClause("each player discards a card").atoms[0].who).toBe("eachPlayer");
  });
});

describe("target-opponent discard — resolver e2e (the targeted opponent actually discards)", () => {
  it("a targetType:opponent discard atom makes ONLY the chosen opponent discard; the controller is untouched", () => {
    const s0 = createGameState({ userDeck: [], aiDeck: [] });
    const state = {
      ...s0, players: { ...s0.players,
        user: { ...s0.players.user, hand: [{ id: "u1", name: "Mine", type: "Instant", oracle: "" }] },
        ai: { ...s0.players.ai, hand: [{ id: "a1", name: "A", type: "Sorcery", oracle: "" }, { id: "a2", name: "B", type: "Sorcery", oracle: "" }] } },
    };
    // targeting tags an "opponent" target as {type:"player"} (enumerateTargets.addOpponents) — the shape the resolver consumes.
    const atom = { op: "discard", who: "target", amount: 2, targetType: "opponent" };
    const ctx = { controller: "user", targets: [{ type: "player", id: "ai" }] };
    const next = resolveAtom(state, atom, ctx);
    expect(next.players.ai.hand).toHaveLength(0);     // the opponent discarded both
    expect(next.players.user.hand).toHaveLength(1);   // the controller is untouched
  });
});

describe("cant-block 'an opponent controls' — parser + classify", () => {
  it("'target creature an opponent controls can't block this turn' → cant-block with the opponent restriction", () => {
    expect(parseEffectClause("target creature an opponent controls can't block this turn")).toMatchObject({
      confidence: "high", atoms: [{ op: "cant-block", targetType: "creature", restrictions: [{ kind: "controller", who: "opponent" }] }],
    });
  });
  it("Arena Athlete (Heroic) / Clamor Shaman classify native; the bare 'target creature can't block' is unchanged", () => {
    expect(classifyCard({ type: "Creature — Human", name: "Arena Athlete", mana: "{1}{R}", oracle: "Heroic — Whenever you cast a spell that targets this creature, target creature an opponent controls can't block this turn." })).toBe("native-trigger");
    expect(parseEffectClause("target creature can't block this turn").atoms[0]).toMatchObject({ op: "cant-block", targetType: "creature" });
  });
  it("CREED: a filtered/self variant stays non-native (the exact anchor rejects it)", () => {
    // "you control" would be a self-defeating cant-block; this matcher only claims the opponent-controlled form.
    expect(programConfidence(parseEffectProgram({ type: "Instant", mana: "{R}", name: "X", oracle: "Target creature you control can't block this turn." }))).toBe("low");
  });
});

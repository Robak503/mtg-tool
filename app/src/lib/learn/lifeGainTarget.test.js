/**
 * lifeGainTarget.test.js — LIFE-GAIN-TARGET: "Target player gains N life" (Soothing Balm, Heroes'
 * Reunion, Natural Spring, Healing Hands; Mournful Zombie / Orzhov Guildmage activated). applyGainLife
 * gained a who:"target" branch (mirroring applyLoseLife) — the CHOSEN player gains and fires THAT player's
 * lifegain triggers; the controller's life is untouched (no confidently-wrong controller-gain FP).
 */
import { describe, it, expect, beforeEach } from "vitest";
import { parseEffectClause, programConfidence } from "./effects/parser.js";
import { resolveAtom } from "./effects/effectAtoms.js";
import { createGameState, _resetIdsForTests } from "./gameState.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

describe("life-gain-target — parser", () => {
  it("'target player gains N life' → gain-life who:target", () => {
    const p = parseEffectClause("Target player gains 5 life.", "Instant");
    expect(programConfidence(p)).toBe("high");
    expect(p.atoms).toEqual([{ op: "gain-life", amount: 5, who: "target", targetType: "player" }]);
  });
});

describe("life-gain-target — resolver (the TARGET gains, not the controller)", () => {
  it("the chosen player gains N; the controller's life is unchanged", () => {
    const s = createGameState({ userDeck: [], aiDeck: [] });
    const u0 = s.players.user.life, a0 = s.players.ai.life;
    const after = resolveAtom(s, { op: "gain-life", amount: 5, who: "target", targetType: "player" }, { controller: "user", targets: [{ type: "player", id: "ai" }] });
    expect(after.players.ai.life).toBe(a0 + 5);   // target gained
    expect(after.players.user.life).toBe(u0);     // controller unchanged
  });
  it("targeting yourself gains your own life", () => {
    const s = createGameState({ userDeck: [], aiDeck: [] });
    const u0 = s.players.user.life;
    const after = resolveAtom(s, { op: "gain-life", amount: 4, who: "target", targetType: "player" }, { controller: "user", targets: [{ type: "player", id: "user" }] });
    expect(after.players.user.life).toBe(u0 + 4);
  });
});

describe("life-gain-target — coverage flips", () => {
  const C = (name, oracle, type = "Instant") => ({ name, oracle, type, keywords: [], mana: "{1}{W}" });
  it("the bare + rider'd spells and activated forms flip native", () => {
    expect(classifyCard(C("Soothing Balm", "Target player gains 5 life."))).toBe("native-spell");
    expect(classifyCard(C("Healing Hands", "Target player gains 4 life.\nDraw a card."))).toBe("native-spell");
    expect(classifyCard(C("Mournful Zombie", "{W}, {T}: Target player gains 1 life.", "Creature — Zombie"))).toBe("native-activated");
  });
});

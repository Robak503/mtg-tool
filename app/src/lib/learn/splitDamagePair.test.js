/**
 * splitDamagePair.test.js — BLITZ LG-1: the SPLIT-DAMAGE pair ("<name> deals N damage to target creature
 * and M damage to target player or planeswalker" — Lunge / Hungry Flames / Shower of Sparks). A splitClauses
 * NORMALIZE rewrite injects the canonical spell subject into the orphaned second half, so BOTH halves parse
 * with the EXISTING deal-damage atoms — two chosen targets, both required (CR 601.2c), independent amounts,
 * resolution in written order (CR 608.2c). No new atoms, no new resolver. FN guards: the Assembled Alphas
 * trigger tail ("that creature's controller") and the X form stay unrewritten → Arbiter.
 * Real oracle fixtures (bundled Scryfall, 2026-07-16).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { applyDamageEffect } from "./spellEffects.js";
import { parseEffectProgram, programConfidence } from "./effects/parser.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const HUNGRY_FLAMES = { id: "hf", name: "Hungry Flames", type: "Instant", mana: "{1}{R}",
  oracle: "Hungry Flames deals 3 damage to target creature and 2 damage to target player or planeswalker." };

describe("parse + classify", () => {
  it("the pair parses to two independent deal-damage atoms; the family flips", () => {
    const prog = parseEffectProgram(HUNGRY_FLAMES);
    expect(programConfidence(prog)).toBe("high");
    expect(prog.atoms.map((a) => [a.op, a.targetType, a.amount])).toEqual([
      ["deal-damage", "creature", 3],
      ["deal-damage", "playerOrPlaneswalker", 2],
    ]);
    expect(classifyCard(HUNGRY_FLAMES)).toBe("native-spell");
    expect(classifyCard({ id: "lu", name: "Lunge", type: "Instant", mana: "{1}{R}",
      oracle: "Lunge deals 2 damage to target creature and 2 damage to target player or planeswalker." })).toBe("native-spell");
  });
  it("FN guards: the X form and the trigger-tail wording stay off the rewrite", () => {
    expect(classifyCard({ id: "xg", name: "Hypothetical X Split", type: "Instant", mana: "{X}{R}",
      oracle: "Hypothetical X Split deals X damage to target creature and X damage to target player or planeswalker." })).toBe("arbiter-spell");
    expect(classifyCard({ id: "aa", name: "Assembled Alphas", type: "Creature — Wolf", power: "5", toughness: "5",
      oracle: "Whenever this creature blocks or becomes blocked by a creature, this creature deals 3 damage to that creature and 3 damage to that creature's controller." })).toBe("body-only");
  });
});

describe("runtime — both halves land on their own targets", () => {
  it("3 to the creature, 2 to the player, in written order", () => {
    let s = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
    const foe = createPermanent({ id: "c1", card: { id: "gb", name: "Grizzly Bears", type: "Creature — Bear", power: "2", toughness: "2", oracle: "" }, controller: "ai1", summoningSick: false });
    s = { ...s, players: { ...s.players, ai1: { ...s.players.ai1, battlefield: [foe] } } };
    const lifeBefore = s.players.ai2.life;
    // The two atoms resolve sequentially through the SAME shared damage application the parser emitted.
    let after = applyDamageEffect(s, { controller: "user", amount: 3, targetType: "creature", targets: [{ type: "creature", id: "c1" }], source: null });
    after = applyDamageEffect(after, { controller: "user", amount: 2, targetType: "playerOrPlaneswalker", targets: [{ type: "player", id: "ai2" }], source: null });
    expect(after.players.ai1.battlefield.find((p) => p.id === "c1")).toBeFalsy(); // 3 ≥ 2 toughness — dead
    expect(after.players.ai2.life).toBe(lifeBefore - 2);
  });
});

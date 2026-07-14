/**
 * winConSource.test.js — the combat-vs-burn win-condition split (Crucible follow-on, 2026-07-14).
 *
 * loseLife stamps `lethalDamageCombat` on a player ONLY when THIS loss is the killing blow (newLife<=0)
 * AND it came from damage (the caller passed `combatDamage`: true from combat resolution, false from the
 * burn/ability atom). Non-lethal damage, and every non-damage loss (drain/pay-life, which pass no flag),
 * never stamp — so removePlayerFromGame → epochStats can split "damage" into combat / burn honestly
 * (CREED: a drain finish stays generic "damage", never mislabeled as either).
 */
import { describe, it, expect } from "vitest";
import { createGameState, loseLife } from "./gameState.js";

const withLife = (life) => {
  const s = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
  return { ...s, players: { ...s.players, ai1: { ...s.players.ai1, life } } };
};

describe("loseLife — win-con source stamp", () => {
  it("a LETHAL combat blow stamps lethalDamageCombat=true", () => {
    const s = loseLife(withLife(3), { playerId: "ai1", amount: 5, combatDamage: true });
    expect(s.players.ai1.life).toBe(-2);
    expect(s.players.ai1.lethalDamageCombat).toBe(true);
  });

  it("a LETHAL non-combat (burn) blow stamps lethalDamageCombat=false", () => {
    const s = loseLife(withLife(3), { playerId: "ai1", amount: 3, combatDamage: false });
    expect(s.players.ai1.life).toBe(0);
    expect(s.players.ai1.lethalDamageCombat).toBe(false);
  });

  it("a NON-lethal damage blow never stamps — only the killing blow carries the source", () => {
    const s = loseLife(withLife(20), { playerId: "ai1", amount: 5, combatDamage: true });
    expect(s.players.ai1.life).toBe(15);
    expect(s.players.ai1.lethalDamageCombat).toBeUndefined();
  });

  it("a NON-damage lethal loss (drain / pay-life, no flag) never stamps a source", () => {
    const s = loseLife(withLife(2), { playerId: "ai1", amount: 5 });
    expect(s.players.ai1.life).toBe(-3);
    expect(s.players.ai1.lethalDamageCombat).toBeUndefined();
  });
});

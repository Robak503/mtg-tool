/**
 * preventionShields.test.js — BLITZ PV-1 (CR 615): "Prevent the next N damage that would be dealt to
 * <any target | you> this turn." A resolved prevention pushes a FLOATING this-turn shield
 * (state.preventionShields, plain JSON, turn-stamped self-expiry); BOTH damage paths consume it
 * before a hit lands — applyDamageEffect per hit, combatResolution at the consultCombat funnel via a
 * local pool (so lifelink / infect / commander damage all read the post-prevention amount).
 * CREED FPs guarded: partial decrement (a shield-2 absorbs 2 of 3, the third point lands); lifelink
 * credits only unprevented damage; stale-turn shields are inert. Real oracle fixtures.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { createGameState, createPermanent, _resetIdsForTests, preventionShieldsFor } from "./gameState.js";
import { parseEffectClause, programConfidence } from "./effects/parser.js";
import { runEffectProgram } from "./effects/runProgram.js";
import { applyDamageEffect } from "./spellEffects.js";
import { resolveCombatDamage } from "./combatResolution.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const SAMITE_HEALER = { id: "sh", name: "Samite Healer", type: "Creature — Human Cleric", mana: "{1}{W}",
  power: "1", toughness: "1", oracle: "{T}: Prevent the next 1 damage that would be dealt to any target this turn." };
const BANDAGE = { id: "bd", name: "Bandage", type: "Instant", mana: "{W}",
  oracle: "Prevent the next 1 damage that would be dealt to any target this turn.\nDraw a card." };

function board() {
  let s = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
  const bear = createPermanent({ id: "bear", card: { id: "gb", name: "Grizzly Bears", type: "Creature — Bear", power: "2", toughness: "4", oracle: "" }, controller: "user", summoningSick: false });
  s = { ...s, turn: 5, players: { ...s.players, user: { ...s.players.user, battlefield: [bear] } } };
  return s;
}
const shieldAtom = (n) => ({ op: "prevent-next-damage", amount: n, targetType: "any" });
const applyShield = (s, atom, targets) =>
  runEffectProgram(s, { source: { name: "Samite Healer" }, payload: { params: { program: { atoms: [atom] }, controller: "user", targets, sourceId: "shperm" } } });

describe("parse + classify", () => {
  it("both printed forms parse; the class flips (activated + spell)", () => {
    expect(parseEffectClause("prevent the next 1 damage that would be dealt to any target this turn", "Creature").atoms)
      .toEqual([{ op: "prevent-next-damage", amount: 1, targetType: "any" }]);
    expect(parseEffectClause("prevent the next 2 damage that would be dealt to you this turn", "Instant").atoms)
      .toEqual([{ op: "prevent-next-damage", amount: 2, who: "you", targetType: null }]);
    expect(programConfidence(parseEffectClause("prevent all damage that would be dealt to any target this turn", "Instant"))).not.toBe("high");
    expect(classifyCard(SAMITE_HEALER)).toBe("native-activated");
    expect(classifyCard(BANDAGE)).toBe("native-spell");
  });
});

describe("non-combat consumption (applyDamageEffect)", () => {
  it("a shield-2 absorbs 2 of a 3-damage hit; the next hit lands in full (shield spent)", () => {
    let s = board();
    s = applyShield(s, shieldAtom(2), [{ type: "creature", id: "bear" }]);
    expect(preventionShieldsFor(s)).toHaveLength(1);
    s = applyDamageEffect(s, { controller: "ai1", amount: 3, targetType: "creature", targets: [{ type: "creature", id: "bear" }], source: null });
    let bear = s.players.user.battlefield.find((p) => p.id === "bear");
    expect(bear.damageMarked).toBe(1);                 // 3 − 2 prevented
    expect(preventionShieldsFor(s)).toHaveLength(0);   // spent
    s = applyDamageEffect(s, { controller: "ai1", amount: 2, targetType: "creature", targets: [{ type: "creature", id: "bear" }], source: null });
    bear = s.players.user.battlefield.find((p) => p.id === "bear");
    expect(bear.damageMarked).toBe(3);                 // 1 + 2 in full
  });

  it("a player shield absorbs face damage; a STALE (last-turn) shield is inert", () => {
    let s = board();
    s = applyShield(s, shieldAtom(2), [{ type: "player", id: "user" }]);
    const before = s.players.user.life;
    s = applyDamageEffect(s, { controller: "ai1", amount: 3, targetType: "any", targets: [{ type: "player", id: "user" }], source: null });
    expect(s.players.user.life).toBe(before - 1);
    // Fresh shield, then the turn rolls — the stamp no longer matches: full damage.
    let s2 = applyShield(board(), shieldAtom(2), [{ type: "player", id: "user" }]);
    s2 = { ...s2, turn: 6 };
    const b2 = s2.players.user.life;
    s2 = applyDamageEffect(s2, { controller: "ai1", amount: 3, targetType: "any", targets: [{ type: "player", id: "user" }], source: null });
    expect(s2.players.user.life).toBe(b2 - 3);
  });
});

describe("combat consumption (resolveCombatDamage) — lifelink reads the post-prevention amount", () => {
  it("a 3-power lifelink attacker vs a shielded (2) defender: 1 life lost, 1 life gained", () => {
    let s = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
    const raider = createPermanent({ id: "atk", card: { id: "rd", name: "Vampire Raider", type: "Creature — Vampire", power: "3", toughness: "3", oracle: "Lifelink" }, controller: "ai1", summoningSick: false });
    s = { ...s, turn: 5, players: { ...s.players, ai1: { ...s.players.ai1, battlefield: [raider] } } };
    s = applyShield(s, shieldAtom(2), [{ type: "player", id: "user" }]);
    s = { ...s, combat: { attackers: [{ permanentId: "atk", attackingPlayer: "ai1", defender: "user" }], blockers: [] } };
    const userBefore = s.players.user.life;
    const aiBefore = s.players.ai1.life;
    s = resolveCombatDamage(s);
    expect(s.players.user.life).toBe(userBefore - 1);  // 3 − 2 prevented
    expect(s.players.ai1.life).toBe(aiBefore + 1);     // lifelink credits ONLY the dealt point
    expect(preventionShieldsFor(s)).toHaveLength(0);   // consumed + written back
  });
});

/**
 * fog.test.js — FOG-1: "Prevent all combat damage that would be dealt this turn" (Fog, Darkness,
 * Holy Day, Root Snare).
 *
 * A turn-scoped one-shot latch: the resolver stamps state.preventCombatDamageTurn = state.turn, and
 * resolveCombatDamage skips ALL combat damage (first-strike + regular steps) while it holds, then it
 * self-expires next turn. Pins: the parser shape + the filtered/keyword/for-each riders that stay low,
 * the resolver flag, the combat short-circuit (player + creature damage prevented, no deaths), the
 * turn-scoping (next turn resumes), and the AI hold (it must not fog its own attack).
 */
import { describe, it, expect } from "vitest";
import { createPermanent } from "./gameState.js";
import { resolveCombatDamage } from "./combatResolution.js";
import { resolveAtom } from "./effects/effectAtoms.js";
import { parseEffectProgram, programConfidence, programContainsFog } from "./effects/parser.js";

const I = (oracle) => ({ type: "Instant", mana: "{G}", oracle, name: "Fog" });
function creature(name, power, toughness, controller) {
  return createPermanent({ card: { id: `${name}-card`, name, power, toughness, type_line: "Creature" }, controller });
}
function combatState({ userBf = [], aiBf = [], combat, turn = 3, fogTurn = null }) {
  return {
    turn, log: [], preventCombatDamageTurn: fogTurn,
    players: {
      user: { life: 40, battlefield: userBf, graveyard: [], commanderDamageFrom: {} },
      ai: { life: 40, battlefield: aiBf, graveyard: [], commanderDamageFrom: {} },
    },
    combat,
  };
}

describe("FOG-1 parser", () => {
  it("parses the bare whole-turn prevention to a fog atom (HIGH)", () => {
    expect(parseEffectProgram(I("Prevent all combat damage that would be dealt this turn.")).atoms)
      .toEqual([{ op: "fog", targetType: null }]);
    expect(programConfidence(parseEffectProgram(I("Prevent all combat damage that would be dealt this turn.")))).toBe("high");
  });
  it("MUST_DROP_TO_LOW: filtered / keyword-rider / for-each / except variants → Arbiter", () => {
    const low = (o) => expect(programConfidence(parseEffectProgram(I(o)))).toBe("low");
    low("Prevent all combat damage that would be dealt this turn by creatures you don't control."); // filtered
    low("Prevent all combat damage that would be dealt this turn by attacking creatures.");          // filtered
    low("Prevent all combat damage that would be dealt this turn except combat damage dealt to you."); // except-clause
    low("Prevent all combat damage that would be dealt this turn. Cycling {2}");                      // keyword cost rider
    low("Prevent all combat damage that would be dealt this turn. You gain 1 life for each creature on the battlefield."); // for-each rider
  });
});

describe("FOG-1 resolver + combat short-circuit", () => {
  it("applyFog stamps the current turn onto state.preventCombatDamageTurn", () => {
    const s = combatState({ combat: { attackers: [], blockers: [] }, turn: 5 });
    const after = resolveAtom(s, { op: "fog", targetType: null }, { controller: "user", targets: [] });
    expect(after.preventCombatDamageTurn).toBe(5);
  });
  it("prevents an unblocked attacker's damage to the player (no life lost)", () => {
    const bear = creature("Bear", 2, 2, "user");
    const s = combatState({ userBf: [bear], fogTurn: 3, combat: { attackers: [{ permanentId: bear.id, attackingPlayer: "user", defender: "ai" }], blockers: [] } });
    const out = resolveCombatDamage(s);
    expect(out.players.ai.life).toBe(40); // damage prevented
    expect(out.log.some(e => e.kind === "combat-damage-prevented")).toBe(true);
  });
  it("prevents a lethal trade — BOTH creatures survive (no marks, no deaths)", () => {
    const att = creature("Grizzly", 2, 2, "user");
    const blk = creature("Bear", 2, 2, "ai");
    const s = combatState({ userBf: [att], aiBf: [blk], fogTurn: 3, combat: { attackers: [{ permanentId: att.id, attackingPlayer: "user", defender: "ai" }], blockers: [{ blockerId: blk.id, blockingPlayer: "ai", attackerId: att.id }] } });
    const out = resolveCombatDamage(s);
    expect(out.players.user.battlefield.map(p => p.card.name)).toEqual(["Grizzly"]);
    expect(out.players.ai.battlefield.map(p => p.card.name)).toEqual(["Bear"]);
    expect(out.players.user.graveyard).toHaveLength(0);
    expect(out.players.ai.graveyard).toHaveLength(0);
  });
  it("prevents the first-strike step too", () => {
    const fs = { ...creature("Striker", 2, 2, "user"), card: { id: "s", name: "Striker", power: 2, toughness: 2, type_line: "Creature", keywords: ["First strike"] } };
    const s = combatState({ userBf: [fs], fogTurn: 3, combat: { attackers: [{ permanentId: fs.id, attackingPlayer: "user", defender: "ai" }], blockers: [] } });
    expect(resolveCombatDamage(s, { firstStrikeStep: true }).players.ai.life).toBe(40);
  });
});

describe("FOG-1 turn-scoping", () => {
  it("a fog stamped for turn 3 does NOT prevent damage on turn 4 (self-expires)", () => {
    const bear = creature("Bear", 2, 2, "user");
    const s = combatState({ userBf: [bear], turn: 4, fogTurn: 3, combat: { attackers: [{ permanentId: bear.id, attackingPlayer: "user", defender: "ai" }], blockers: [] } });
    expect(resolveCombatDamage(s).players.ai.life).toBe(38); // turn 4 ≠ fog turn 3 → normal damage
  });
});

describe("FOG-1 AI hold", () => {
  it("programContainsFog flags a fog program (so opponentAI holds it — never fogs its own attack)", () => {
    expect(programContainsFog(parseEffectProgram(I("Prevent all combat damage that would be dealt this turn.")))).toBe(true);
    expect(programContainsFog(parseEffectProgram(I("Draw a card.")))).toBe(false);
  });
});

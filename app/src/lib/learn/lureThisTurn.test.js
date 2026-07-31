/**
 * lureThisTurn.test.js — BLITZ LU-2: the THIS-TURN lure forms (CR 509.1c). The targeted spells
 * (Alluring Scent / Bloodscent / Taunting Challenge — "All creatures able to block target creature
 * this turn do so.") and Mortipede's activated self form stamp a turn-scoped marker
 * (state.lureThisTurn, the FOG-1 self-expiring latch pattern); opponentAI.pickBlockers requires
 * blocks off the marker exactly like a printed lure (the LU-1 / MUST-ATTACK bar). The it-anaphor
 * (Declare Dominance) and conditional-rider (Roar of Challenge) forms stay parked off the anchors.
 * Real oracle fixtures (bundled Scryfall, 2026-07-16).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState } from "./gameState.js";
import { pickBlockPlan } from "./opponentAI.js";
import { applyLureThisTurn } from "./effects/atoms/misc.js";
import { parseEffectProgram, programConfidence } from "./effects/parser.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const SCENT = { id: "as", name: "Alluring Scent", type: "Sorcery", mana: "{1}{G}{G}", oracle: "All creatures able to block target creature this turn do so." };

function makePerm({ id, power = 1, toughness = 1, controller = "user", oracle = "" }) {
  return {
    id, card: { id: `c-${id}`, name: id, type: "Creature — Beast", power: String(power), toughness: String(toughness), oracle },
    controller, tapped: false, summoningSick: false, counters: {}, attachments: [], attachedTo: null,
  };
}
function blockState({ aiCreatures, userAttackers }) {
  const base = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...base,
    activePlayer: "user", phase: "combat", step: "declare-blockers", priorityHolder: "ai",
    combat: { attackers: userAttackers.map((p) => ({ permanentId: p.id, attackingPlayer: "user", defender: "ai" })), blockers: [] },
    players: {
      user: { ...base.players.user, battlefield: userAttackers },
      ai: { ...base.players.ai, battlefield: aiCreatures },
    },
  };
}
const blk = (blockerId, attackerId) => ({ kind: "declare-blocker", permanentId: blockerId, attackerId, name: blockerId });

describe("parse + classify", () => {
  it("the targeted spells and Mortipede flip; the anaphor and rider forms stay parked", () => {
    const prog = parseEffectProgram(SCENT);
    expect(programConfidence(prog)).toBe("high");
    expect(prog.atoms).toEqual([{ op: "lure-this-turn", targetType: "creature" }]);
    expect(classifyCard(SCENT)).toBe("native-spell");
    expect(classifyCard({ id: "tc", name: "Taunting Challenge", type: "Sorcery", mana: "{2}{G}", oracle: "All creatures able to block target creature this turn do so." })).toBe("native-spell");
    expect(classifyCard({ id: "mp", name: "Mortipede", type: "Creature — Insect", power: "3", toughness: "3", mana: "{4}{B}",
      oracle: "{2}{G}: All creatures able to block this creature this turn do so." })).toBe("native-activated");
    // The it-anaphor (needs the pump fold) and the Ferocious rider stay off the anchors.
    expect(classifyCard({ id: "dd", name: "Declare Dominance", type: "Sorcery", mana: "{3}{G}",
      oracle: "Target creature gets +3/+3 until end of turn. All creatures able to block it this turn do so." })).toBe("arbiter-spell");
    // ⭐ Roar of Challenge INVERTED (2026-07-30): the "Ferocious — " label is stripped on the spell path now
    // (CR 207.2c), so the CD-2 TRAILING "<effect> if <cond>" peel sees the sentence. Verified before
    // crediting that the condition rides the gated atom rather than being dropped:
    //   atoms = [lure-this-turn(no cond), pump(cond: "you control a creature with power 4 or greater")].
    // The it-anaphor form directly above is untouched and still parks, so this test's other half stands.
    expect(classifyCard({ id: "rc", name: "Roar of Challenge", type: "Sorcery", mana: "{2}{G}",
      oracle: "All creatures able to block target creature this turn do so.\nFerocious — That creature gains indestructible until end of turn if you control a creature with power 4 or greater." })).toBe("native-spell");
  });
});

describe("runtime — the marker forces blocks THIS turn and expires with it", () => {
  it("a marked attacker eats every able blocker; the marker is inert next turn", () => {
    let s = blockState({
      aiCreatures: [makePerm({ id: "b1", power: 1, toughness: 1, controller: "ai" }), makePerm({ id: "b2", power: 3, toughness: 3, controller: "ai" })],
      userAttackers: [makePerm({ id: "att", power: 2, toughness: 2 })],
    });
    s = applyLureThisTurn(s, { op: "lure-this-turn", targetType: "creature" }, { controller: "user", targets: [{ type: "creature", id: "att" }] });
    expect(s.lureThisTurn.att).toBe(s.turn);
    const plan = pickBlockPlan(s, "ai", [blk("b1", "att"), blk("b2", "att")]);
    expect(plan.map((a) => a.permanentId).sort()).toEqual(["b1", "b2"]); // both forced — not the value pick
    // Next turn the marker is stale — the normal value heuristic returns (one value block, not both forced).
    const later = { ...s, turn: s.turn + 1 };
    const plan2 = pickBlockPlan(later, "ai", [blk("b1", "att"), blk("b2", "att")]);
    expect(plan2.length).toBeLessThan(2);
  });
  it("the SELF form stamps the source (Mortipede's activation)", () => {
    let s = blockState({ aiCreatures: [makePerm({ id: "b1", controller: "ai" })], userAttackers: [makePerm({ id: "mp", power: 3, toughness: 3 })] });
    s = applyLureThisTurn(s, { op: "lure-this-turn", target: "self", targetType: null }, { controller: "user", sourceId: "mp" });
    expect(s.lureThisTurn.mp).toBe(s.turn);
    const plan = pickBlockPlan(s, "ai", [blk("b1", "mp")]);
    expect(plan.map((a) => a.permanentId)).toEqual(["b1"]);
  });
});

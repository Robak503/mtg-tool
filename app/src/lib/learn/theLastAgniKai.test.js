/**
 * theLastAgniKai.test.js — FIGHT-EXCESS-TO-MANA + the turn-scoped red hold (The Last Agni Kai, W11 —
 * CR 120.4a + 514.2). The Wolverine 90-closer.
 *
 * "Target creature you control fights target creature an opponent controls. If the creature the opponent
 * controls is dealt excess damage this way, add that much {R}. / Until end of turn, you don't lose
 * unspent red mana as steps and phases end." The three-sentence span collapses pre-split into the PROVEN
 * fight-pair atom + two rider flags: excessToMana (excess = the fighter's damage beyond the target's
 * lethal need — remaining toughness, or 1 under deathtouch: the Ram Through convention) and
 * holdManaColorTurn (player.manaHoldTurn — emptyManaPools keeps the whole color at every step/phase
 * drain; finishCleanupActions strips the flag BEFORE its own drain, so the mana still empties at
 * cleanup, the printed "until end of turn" bound).
 *
 * Mutation-checked (via Edit): the collapse anchor → the HIGH/tier pins die; the excess capture → the
 * mana pin dies; the holdTurn branch in emptyManaPools → the survives-the-drain pin dies (the hold
 * would silently never hold — the dropped-line FP).
 */
import { describe, it, expect, beforeEach } from "vitest";
import { classifyCard } from "./coverage.js";
import { parseEffectProgram, programConfidence } from "./effects/parser.js";
import { applyFightPair } from "./effects/atoms/combat.js";
import { emptyManaPools, finishCleanupActions } from "./gameEngine.js";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const AGNI = {
  name: "The Last Agni Kai", type: "Instant", mana: "{2}{R}{R}",
  oracle: "Target creature you control fights target creature an opponent controls. If the creature the opponent controls is dealt excess damage this way, add that much {R}.\nUntil end of turn, you don't lose unspent red mana as steps and phases end.",
};
const ATOM = { op: "fight-pair", targetType: "creature", restrictions: [{ kind: "controller", who: "opponent" }], role: "target",
  secondaryTargetType: "creature", secondaryRestrictions: [{ kind: "controller", who: "you" }], secondaryRole: "fighter",
  excessToMana: "R", holdManaColorTurn: "R" };

const cr = (id, controller, power, toughness) => createPermanent({ id, controller, card: { id: `c-${id}`, name: id, type: "Creature — Beast", power, toughness } });
function st(user = [], ai = []) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: user }, ai: { ...s.players.ai, battlefield: ai } } };
}
const fight = (s) => applyFightPair(s, ATOM, { controller: "user", targets: [
  { type: "creature", id: "mine", role: "fighter" },
  { type: "creature", id: "theirs", role: "target" },
] });

describe("Agni Kai — parse + the flip", () => {
  it("MUST STAY HIGH: the three-sentence span collapses to the fight-pair + both riders; the card is native-spell", () => {
    const p = parseEffectProgram(AGNI);
    expect(programConfidence(p)).toBe("high");
    expect(p.atoms[0]).toMatchObject({ op: "fight-pair", excessToMana: "R", holdManaColorTurn: "R" });
    expect(classifyCard(AGNI)).toBe("native-spell");
  });
  it("CREED near-miss: a color/wording variant stays parked", () => {
    expect(programConfidence(parseEffectProgram({ ...AGNI, oracle: AGNI.oracle.replace("{R}.", "{G}.") }))).toBe("low");
  });
});

describe("Agni Kai — the excess + the hold (CR 120.4a + 514.2)", () => {
  it("a 6-power fighter vs a 2-toughness target → 4 excess red; the fight still exchanges damage", () => {
    const after = fight(st([cr("mine", "user", 6, 6)], [cr("theirs", "ai", 1, 2)]));
    expect(after.players.user.manaPool.R).toBe(4);                       // excess (mutation-check line)
    expect(after.players.user.manaHoldTurn?.R).toBe(true);
    expect(after.players.user.battlefield[0].damageMarked).toBe(1);      // the 1-power return hit
  });
  it("no excess (power ≤ lethal need) → no mana, hold still set (the printed until-EOT line is unconditional)", () => {
    const after = fight(st([cr("mine", "user", 2, 4)], [cr("theirs", "ai", 1, 5)]));
    expect(after.players.user.manaPool.R).toBe(0);
    expect(after.players.user.manaHoldTurn?.R).toBe(true);
  });
  it("the held red SURVIVES a step/phase drain, other colors empty; cleanup strips the hold AND drains", () => {
    let s = fight(st([cr("mine", "user", 6, 6)], [cr("theirs", "ai", 1, 2)]));   // 4 R held
    s = { ...s, players: { ...s.players, user: { ...s.players.user, manaPool: { ...s.players.user.manaPool, G: 2 } } } };
    const drained = emptyManaPools(s);
    expect(drained.players.user.manaPool.R).toBe(4);                     // survives (mutation-check line)
    expect(drained.players.user.manaPool.G).toBe(0);                     // the un-held color empties
    const cleaned = finishCleanupActions(drained);
    expect(cleaned.players.user.manaPool.R).toBe(0);                     // "until end of turn" ends at cleanup
    expect(Object.keys(cleaned.players.user.manaHoldTurn || {})).toHaveLength(0);
  });
});

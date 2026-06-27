/**
 * xPumpAsym.test.js — X-PUMP-ASYM: an asymmetric X-pump ("Target creature gets +X/+0 until end of turn")
 * now flips native. rewriteAmountX recognizes "+X/+digit" (slot "p") and "+digit/+X" (slot "t"); the parser
 * carries the printed ptDelta + amountXSlot, and applyPumpEffect scales ONLY the marked pip with ctx.xValue
 * while the other pip reads its printed value. The symmetric +X/+X path (no amountXSlot → both pips = X) is
 * unchanged. A board-derived X ("where X is …") leaves residue → low → Arbiter (a cost-X is never faked).
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { legalActionsForPlayer, filterActions } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { permanentPower, permanentToughness } from "./layers.js";
import { parseEffectProgram, programConfidence } from "./effects/parser.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const bearCard = { name: "Grizzly Bears", type: "Creature — Bear", power: 2, toughness: 2, oracle: "" };
const mountain = (id) => ({ id, card: { name: "Mountain", type: "Basic Land — Mountain", oracle: "" }, controller: "user", tapped: false, summoningSick: false, counters: {}, damageMarked: 0, attachments: [], attachedTo: null });

function xPumpState(spell) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...s, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main", stack: [],
    players: { ...s.players, user: { ...s.players.user, hand: [spell],
      battlefield: [createPermanent({ id: "bear", card: bearCard, controller: "user", summoningSick: false }), mountain("m0"), mountain("m1"), mountain("m2"), mountain("m3"), mountain("m4")] } },
  };
}

describe("x-pump-asym — parser", () => {
  it("'+X/+0' parses to an amountX pump with amountXSlot 'p' + the printed ptDelta", () => {
    expect(parseEffectProgram({ type: "Sorcery", mana: "{X}{R}", oracle: "Target creature gets +X/+0 until end of turn." }).atoms)
      .toEqual([{ op: "pump", targetType: "creature", amountX: true, duration: "endOfTurn", ptDelta: { p: 1, t: 0 }, amountXSlot: "p" }]);
  });
  it("'+0/+X' parses to amountXSlot 't'", () => {
    expect(parseEffectProgram({ type: "Sorcery", mana: "{X}{G}", oracle: "Target creature gets +0/+X until end of turn." }).atoms)
      .toEqual([{ op: "pump", targetType: "creature", amountX: true, duration: "endOfTurn", ptDelta: { p: 0, t: 1 }, amountXSlot: "t" }]);
  });
  it("symmetric '+X/+X' is UNCHANGED — amountX with NO amountXSlot (resolver scales both pips)", () => {
    const atoms = parseEffectProgram({ type: "Sorcery", mana: "{X}{G}", oracle: "Target creature gets +X/+X until end of turn." }).atoms;
    expect(atoms[0].amountX).toBe(true);
    expect(atoms[0].amountXSlot).toBeUndefined();
  });
  it("a BOARD-derived X ('where X is …') stays low → Arbiter (Ghoul's Feast)", () => {
    expect(programConfidence(parseEffectProgram({ type: "Sorcery", mana: "{1}{B}", oracle: "Target creature gets +X/+0 until end of turn, where X is the number of creature cards in your graveyard." }))).toBe("low");
  });
  it("a clean asymmetric X-pump is native-spell (Enrage)", () => {
    expect(classifyCard({ name: "Enrage", type: "Sorcery", mana: "{X}{R}", oracle: "Target creature gets +X/+0 until end of turn." })).toBe("native-spell");
  });
});

describe("x-pump-asym — resolver e2e (+X/+0 with X=3 ⇒ +3/+0, NOT +3/+3)", () => {
  it("Enrage X=3 on a 2/2 makes it 5/2 (power scales, toughness unchanged)", () => {
    const enrage = { id: "enrage", name: "Enrage", type: "Sorcery", mana: "{X}{R}", oracle: "Target creature gets +X/+0 until end of turn." };
    let s = xPumpState(enrage);
    const cast = filterActions(legalActionsForPlayer(s, "user"), "cast-spell").find(a => a.xValue === 3 && a.targets?.[0]?.id === "bear");
    expect(cast).toBeTruthy();
    s = resolveTopOfStack(dispatchAction(s, cast));
    expect(permanentPower(s, "bear")).toBe(5);     // 2 + X(3)
    expect(permanentToughness(s, "bear")).toBe(2); // 2 + 0  (NOT 2 + 3)
    expect(s.pendingArbiter).toBeUndefined();
  });
  it("symmetric +X/+X regression: X=3 on a 2/2 makes it 5/5 (both pips scale)", () => {
    const sym = { id: "sym", name: "Sym Pump", type: "Sorcery", mana: "{X}{R}", oracle: "Target creature gets +X/+X until end of turn." };
    let s = xPumpState(sym);
    const cast = filterActions(legalActionsForPlayer(s, "user"), "cast-spell").find(a => a.xValue === 3 && a.targets?.[0]?.id === "bear");
    expect(cast).toBeTruthy();
    s = resolveTopOfStack(dispatchAction(s, cast));
    expect(permanentPower(s, "bear")).toBe(5);
    expect(permanentToughness(s, "bear")).toBe(5);
  });
});

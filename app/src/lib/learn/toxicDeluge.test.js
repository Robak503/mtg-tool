/**
 * toxicDeluge.test.js — the PAY-X-LIFE additional cost (Toxic Deluge, Teval shelf, 2026-08-15):
 * "As an additional cost to cast this spell, pay X life. / All creatures get -X/-X until end of turn."
 *
 * Four pieces: ① the payLifeX extractor arm (castModifiers) marking the program X-parameterized through
 * its COST; ② "payLifeX" vetted into SUPPORTED_ADDITIONAL_COST_KINDS only WITH ③ the cast-path
 * enforcement — the X range is bounded by the caster's LIFE minus one (CR 119.4; the suicide cast is a
 * never-offered FN), the mana half stays the fixed printed cost, MV stays printed (CR 202.3b), and the
 * dispatcher loseLife-charges the chosen X (a missing X THROWS — never a silently skipped cost);
 * ④ the plural "All creatures GET -X/-X" joins the symmetric X-pump rewrite (gets? — the targeted
 * singular forms unchanged).
 *
 * Mutation-checked (2026-08-15): the dispatcher's loseLife charge dropped (X accepted, life untouched) →
 * the pays-for-real witness dies. Restored green.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { parseEffectProgram, programConfidence } from "./effects/parser.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const DELUGE = { id: "td", name: "Toxic Deluge", type: "Sorcery", mana: "{2}{B}", cmc: 3,
  oracle: "As an additional cost to cast this spell, pay X life.\nAll creatures get -X/-X until end of turn." };

describe("parse + classify", () => {
  it("⭐ Toxic Deluge parses HIGH (xSpell via the COST) and classifies native-spell", () => {
    const p = parseEffectProgram(DELUGE);
    const row = { conf: programConfidence(p), xSpell: p.xSpell, cost: p.additionalCosts, tier: classifyCard(DELUGE) };
    console.log("  WITNESS toxicDeluge", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row.conf).toBe("high");
    expect(row.xSpell).toBe(true);
    expect(row.cost).toEqual([{ kind: "payLifeX" }]);
    expect(p.atoms).toEqual([{ op: "pump", targetType: "eachCreature", amountX: true, amountXNeg: true }]);
    expect(row.tier).toBe("native-spell");
  });
});

describe("⭐⭐ the cast loop — X bounded by life, the life REALLY paid, the sweep scales", () => {
  function board(life) {
    const s0 = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
    const perm = (id, ctl, tough) => createPermanent({ id, controller: ctl, card: { id: `${id}-c`, name: `B${id}`, type: "Creature — Bear", power: "2", toughness: String(tough), oracle: "" } });
    return { ...s0, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main",
      players: { ...s0.players, user: { ...s0.players.user, life, hand: [DELUGE], manaPool: { W: 0, U: 0, B: 2, R: 0, G: 0, C: 2 } },
        ai1: { ...s0.players.ai1, battlefield: [perm("small", "ai1", 2), perm("big", "ai1", 5)] } } };
  }
  const casts = (s) => legalActionsForPlayer(s, "user").filter((a) => a.kind === "cast-spell" && a.cardId === "td");

  it("⭐⭐ enumeration is LIFE-bounded (never the suicide X); cast X=3 charges 3 life + resolves -3/-3 (small dies, big lives)", () => {
    const s = board(5);
    const xs = casts(s).map((a) => a.xValue).sort((a, b) => a - b);
    console.log("  WITNESS delugeXs", JSON.stringify({ life: 5, xs })); // vitest 4 needs --disable-console-intercept
    expect(Math.max(...xs)).toBe(4); // life 5 → X caps at 4 (CR 119.4 minus the suicide guard)
    expect(casts(s).every((a) => a.cmc === 3)).toBe(true); // MV stays printed (CR 202.3b)
    const three = casts(s).find((a) => a.xValue === 3);
    let after = dispatchAction(s, three);
    expect(after.players.user.life).toBe(2); // 3 life REALLY paid at cast
    while (after.stack.length) after = resolveTopOfStack(after);
    expect(after.players.ai1.battlefield.some((p) => p.id === "small")).toBe(false); // toughness 2 − 3 → dies
    expect(after.players.ai1.battlefield.some((p) => p.id === "big")).toBe(true);    // toughness 5 − 3 → lives
  });

  it("at 1 life there is NO X≥1 cast (the cost can't be paid without dying — never offered)", () => {
    expect(casts(board(1))).toHaveLength(0);
  });
});

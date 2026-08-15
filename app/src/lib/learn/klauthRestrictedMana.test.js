/**
 * klauthRestrictedMana.test.js — KLAUTH, UNRIVALED ANCIENT (2026-08-15): the sub-pool core's FIRST
 * CONSUMER. "Whenever Klauth attacks, add X mana in any combination of colors, where X is the total
 * power of attacking creatures. Spend this mana only to cast spells. Until end of turn, you don't
 * lose this mana as steps and phases end."
 *
 * ⭐ THREE NEW PINS on the witnessed core (restrictedSubPool.test carries the spend/hold machinery):
 *   · the splitClauses KEEP-WHOLE fold — splitting would let the add parse alone and mint
 *     UNRESTRICTED mana (the laundering FP); both continuations anchor on exact leads.
 *   · countForSpec's totalAttackingPower — the LAYER-AWARE power sum over the declared attackers
 *     (an anthem'd board sums higher — the printed-power degradation mutant dies on that witness).
 *   · applyAddRestrictedMana — the mint: X round-robin across the SOURCE's color identity (Klauth
 *     spreads R/G — documented deterministic house policy), tagged @any-spell + holdUntilEndOfTurn.
 *
 * Mutation-checked (2026-08-15, applied-check by PRINTING THE CHANGED LINE BACK; throw on no-op):
 *   · the fold's first continuation dropped → the sentences sever → Klauth parks.
 *   · the reader degraded to PRINTED power → the anthem witness dies (8 ≠ 10).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { detectTriggers } from "./triggers.js";
import { parseEffectClause } from "./effects/parser.js";
import { ATOM_RESOLVERS } from "./effects/effectAtoms.js";
import { planPayment } from "./manaModel.js";
import { addContinuousEffect } from "./layers.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import "./resolvers.js"; // the integrator — witnesses that resolve atoms load it, as the engine always does

beforeEach(() => _resetIdsForTests());

const KLAUTH = { name: "Klauth, Unrivaled Ancient", type: "Legendary Creature — Dragon", mana: "{4}{R}{R}{G}",
  keywords: [], power: "6", toughness: "6", color_identity: ["R", "G"],
  oracle: "Flying, haste\nWhenever Klauth attacks, add X mana in any combination of colors, where X is the total power of attacking creatures. Spend this mana only to cast spells. Until end of turn, you don't lose this mana as steps and phases end." };
const CLAUSE = "add X mana in any combination of colors, where X is the total power of attacking creatures. Spend this mana only to cast spells. Until end of turn, you don't lose this mana as steps and phases end";

const board = () => {
  const g = createGameState({ userDeck: [], aiDeck: [] });
  const klauth = createPermanent({ id: "KL", controller: "user", summoningSick: false, card: { id: "c-KL", ...KLAUTH } });
  const friend = createPermanent({ id: "FR", controller: "user", summoningSick: false,
    card: { id: "c-FR", name: "Friend", type: "Creature — Bear", power: "2", toughness: "2", oracle: "" } });
  return { ...g,
    players: { ...g.players, user: { ...g.players.user, battlefield: [klauth, friend] } },
    combat: { attackers: [
      { permanentId: "KL", attackingPlayer: "user", defender: "ai" },
      { permanentId: "FR", attackingPlayer: "user", defender: "ai" },
    ], blockers: [] } };
};
const mint = (s) => ATOM_RESOLVERS["add-restricted-mana"](s,
  { op: "add-restricted-mana", anyCombination: true, amountCount: { kind: "totalAttackingPower" }, restriction: { castTypes: ["@any-spell"] }, holdUntilEndOfTurn: true },
  { controller: "user", targets: [], sourceId: "KL", cardName: "Klauth, Unrivaled Ancient" });

describe("the carrier and the folded parse", () => {
  it("⭐ Klauth flips native-trigger; the folded clause is ONE restricted-mana atom", () => {
    expect(classifyCard(KLAUTH)).toBe("native-trigger");
    expect(detectTriggers(KLAUTH)[0].effectClause).toBe(CLAUSE); // the fold held — one clause, three sentences
    const p = parseEffectClause(CLAUSE, "Instant");
    expect(p.confidence).toBe("high");
    expect(p.atoms).toEqual([{ op: "add-restricted-mana", anyCombination: true,
      amountCount: { kind: "totalAttackingPower" }, restriction: { castTypes: ["@any-spell"] },
      holdUntilEndOfTurn: true, targetType: null }]);
  });
});

describe("⭐⭐ LAW 6 — X is layer-aware; the mint is tagged, held, and R/G round-robin", () => {
  it("⭐⭐ 6+2 attacking power → an 8-mana entry spread R/G, held; an ANTHEM makes it 10", () => {
    const s = mint(board());
    const e = s.players.user.restrictedMana?.[0];
    const row = { total: e ? Object.values(e.pool).reduce((a, b) => a + b, 0) : 0, R: e?.pool?.R, G: e?.pool?.G, held: !!e?.holdUntilEndOfTurn };
    console.log("  WITNESS klauthMint", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ total: 8, R: 4, G: 4, held: true }); // 6+2 printed, round-robin R/G
    // The LAYER-AWARE half: a +1/+1 team anthem lifts both attackers → X = 10, not 8.
    let s2 = board();
    s2 = addContinuousEffect(s2, { layer: 7, sublayer: "7c", op: { layerOp: "ptModify", power: 1, toughness: 1 },
      affects: { mode: "fixed", permanentIds: ["KL", "FR"] },
      duration: { kind: "endOfTurn", turn: s2.turn }, source: { kind: "resolution", permanentId: null, cardName: "Anthem" } }).state;
    const e2 = mint(s2).players.user.restrictedMana?.[0];
    expect(Object.values(e2.pool).reduce((a, b) => a + b, 0)).toBe(10);
  });

  it("⭐ the minted entry pays a SPELL through the real planner — and is invisible to the ability path", () => {
    const s = mint(board());
    const entries = s.players.user.restrictedMana;
    const zero = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };
    const spell = planPayment(zero, [], { generic: 2, W: 0, U: 0, B: 0, R: 1, G: 1, C: 0 }, { castCard: { type: "Sorcery" }, restrictedEntries: entries });
    const ability = planPayment(zero, [], { generic: 1 }, null); // the ability path threads no context
    expect(spell).not.toBeNull();
    expect(ability).toBeNull();
  });
});

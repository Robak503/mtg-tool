/**
 * nuclearFallout.test.js — Nuclear Fallout (SHELF S7): the DOUBLED negative X-pump + each-player X rad.
 *
 * "Each creature gets twice -X/-X until end of turn. Each player gets X rad counters."
 *   1. rewriteAmountX gains the "twice -X/-X" arm → the pump atom carries amountXTimes:2 (both pips scale
 *      by 2·X, negative); applyPumpEffect multiplies before the sign, then the lethal SBA (CR 704.5f) reaps.
 *   2. radClauseParser gains the each-player X arm → applyRad's resolveScaledAmount reads ctx.xValue.
 * CREED FP = a single-X debuff off the "twice" wording, rad to the wrong set, or an un-X'd parse — pinned.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { parseEffectClause, programConfidence } from "./effects/parser.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

// Real oracle text (bundled Scryfall data — never from memory).
const NF_ORACLE = "Each creature gets twice -X/-X until end of turn. Each player gets X rad counters.";
const nfCard = (id = "nf") => ({ id, name: "Nuclear Fallout", type: "Sorcery", mana: "{X}{X}{B}{B}", oracle: NF_ORACLE });

describe("parse + classify", () => {
  it("the twice -X/-X arm stamps amountXTimes:2; the rad X arm stamps amountX; the card is native-spell", () => {
    const p = parseEffectClause("Each creature gets twice -X/-X until end of turn. Each player gets X rad counters.", "Sorcery", { hasX: true });
    expect(programConfidence(p)).toBe("high");
    expect(p.atoms).toEqual([
      // (the mass eachCreature pump carries its end-of-turn expiry inside the pump effect — the Infest
      // class shape; no duration field on the atom)
      { op: "pump", targetType: "eachCreature", amountX: true, amountXNeg: true, amountXTimes: 2 },
      { op: "rad", amountX: true, who: "eachPlayer", targetType: null },
    ]);
    expect(classifyCard(nfCard())).toBe("native-spell");
  });
  it("without hasX both clauses stay LOW (a bare X is never modeled)", () => {
    expect(programConfidence(parseEffectClause("Each creature gets twice -X/-X until end of turn.", "Sorcery"))).toBe("low");
    expect(programConfidence(parseEffectClause("Each player gets X rad counters.", "Sorcery"))).toBe("low");
  });
  it("the single -X/-X path is unchanged (no amountXTimes)", () => {
    const p = parseEffectClause("Each creature gets -X/-X until end of turn.", "Sorcery", { hasX: true });
    expect(p.atoms[0].amountXTimes).toBeUndefined();
    expect(p.atoms[0].amountXNeg).toBe(true);
  });
});

describe("engine (CREED core — 2·X on both pips, X rad to every player)", () => {
  it("cast for X=2: toughness-4 creatures die (−4/−4), toughness-5 survives, every player gets 2 rad", () => {
    let s = createGameState({ userDeck: [], aiDeck: [] });
    const dies = createPermanent({ id: "dies", card: { name: "Fragile", type: "Creature — Bear", power: "4", toughness: "4", oracle: "" }, controller: "ai" });
    const lives = createPermanent({ id: "lives", card: { name: "Tough", type: "Creature — Ox", power: "5", toughness: "5", oracle: "" }, controller: "ai" });
    s = {
      ...s, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
      players: {
        ...s.players,
        user: { ...s.players.user, hand: [nfCard("nf")], manaPool: { ...s.players.user.manaPool, B: 2, C: 8 } },
        ai: { ...s.players.ai, battlefield: [dies, lives] },
      },
    };
    const cast = legalActionsForPlayer(s, "user").find((a) => a.kind === "cast-spell" && a.cardId === "nf" && a.xValue === 2);
    expect(cast, "an X=2 cast was offered").toBeTruthy();
    s = dispatchAction(s, cast);
    s = resolveTopOfStack(s);
    expect(s.players.ai.battlefield.map((p) => p.id)).toEqual(["lives"]); // the −4/−4 reaped toughness 4
    expect(s.players.user.radCounters || 0).toBe(2); // X, not 2·X, on the rad half
    expect(s.players.ai.radCounters || 0).toBe(2);
  });
});

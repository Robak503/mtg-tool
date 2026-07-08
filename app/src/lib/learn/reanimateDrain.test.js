/**
 * reanimateDrain.test.js — REANIMATE-DRAIN ("Reanimate", CR 608).
 *
 * "Put target creature card from a graveyard onto the battlefield under your control. You lose life equal to
 * that card's mana value." Two sentences spanning a mid-resolution value (the reanimated card's MV), collapsed
 * up front like the Yuriko / Dark Confidant reveal-top-drain — reusing the SAME stamp slot: the reanimate atom
 * (stampMv:true) records state.revealedCardMV = the reanimated card's MV, and the following lose-life reads it
 * (amountCount kind:"revealedCardMV", who:"controller" — YOU lose). revealTopSequenceOk is now stamper-aware.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { parseEffectClause } from "./effects/parser.js";
import { classifyCard } from "./coverage.js";
import { applyReanimate } from "./effects/atoms/zones.js";
import { applyLoseLife } from "./effects/atoms/life.js";
import { createGameState, _resetIdsForTests } from "./gameState.js";

beforeEach(() => _resetIdsForTests());
const REANIMATE = "Put target creature card from a graveyard onto the battlefield under your control. You lose life equal to that card's mana value.";

describe("reanimate-drain — parse + classify", () => {
  it("collapses to [reanimate(stampMv), lose-life(controller, revealedCardMV)]", () => {
    const atoms = parseEffectClause(REANIMATE).atoms;
    expect(atoms).toHaveLength(2);
    expect(atoms[0]).toMatchObject({ op: "reanimate", cardFilter: "creature", anyGraveyard: true, stampMv: true });
    expect(atoms[1]).toMatchObject({ op: "lose-life", who: "controller", amountCount: { kind: "revealedCardMV", per: 1 } });
  });
  it("Reanimate classifies native-spell", () => {
    expect(classifyCard({ name: "Reanimate", type: "Sorcery", mana: "{B}", oracle: REANIMATE })).toBe("native-spell");
  });
  it("CREED guard: a plain reanimate (no drain) still parses but carries NO stampMv", () => {
    const a = parseEffectClause("put target creature card from a graveyard onto the battlefield under your control").atoms[0];
    expect(a).toMatchObject({ op: "reanimate" });
    expect(a.stampMv).toBeUndefined();
  });
});

describe("reanimate-drain — runtime (you lose life = the reanimated card's MV)", () => {
  it("reanimating an MV-3 creature deducts exactly 3 life from the controller", () => {
    let s = createGameState({ userDeck: [], aiDeck: [] });
    s = { ...s, players: { ...s.players, user: { ...s.players.user, life: 40, graveyard: [{ id: "gc", name: "Big", type: "Creature — Beast", cmc: 3, power: 5, toughness: 5 }] } } };
    const ctx = { controller: "user", targets: [{ type: "graveyardCard", id: "gc", controller: "user" }] };
    s = applyReanimate(s, { op: "reanimate", targetType: "graveyardCard", cardFilter: "creature", anyGraveyard: true, stampMv: true }, ctx);
    expect(s.revealedCardMV).toBe(3);
    expect(s.players.user.battlefield.some((p) => p.card.name === "Big")).toBe(true);
    s = applyLoseLife(s, { op: "lose-life", who: "controller", amountCount: { kind: "revealedCardMV", per: 1 } }, ctx);
    expect(s.players.user.life).toBe(37);
  });
});

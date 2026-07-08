/**
 * pumpUntap.test.js — PUMP-UNTAP: a combat trick that pumps a creature AND untaps it ("Target creature gets
 * +N/+N and gains KW until end of turn. Untap it." — Vines of the Recluse, Acrobatic Leap, Bull's Strength,
 * the "you control" Octopus Form). splitClauses folds the separate "Untap it." sentence onto the pump as
 * "…until end of turn and untap it"; pumpClauseParser strips the tail and stamps untap:true (a SINGLE atom,
 * one target — "it" = the pumped creature); applyPumpEffect untaps that target after pumping.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { applyPumpEffect } from "./effects/atoms/combat.js";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { legalActionsForPlayer, filterActions } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { permanentPower, permanentToughness, permanentHasKeyword } from "./layers.js";
import { parseEffectProgram, programConfidence } from "./effects/parser.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const I = (name, oracle, mana = "{1}{G}") => ({ name, oracle, type: "Instant", keywords: [], mana });

describe("pump-untap — parser", () => {
  it("'…gains KW until end of turn. Untap it.' parses to ONE pump atom with untap:true (single target)", () => {
    expect(parseEffectProgram(I("Bull's Strength", "Target creature gets +2/+2 and gains trample until end of turn. Untap it.")).atoms)
      .toEqual([{ op: "pump", targetType: "creature", ptDelta: { p: 2, t: 2 }, grantKeywords: ["Trample"], untap: true }]);
  });
  it("the 'you control' variant carries the controller restriction + untap (Octopus Form)", () => {
    expect(parseEffectProgram(I("Octopus Form", "Target creature you control gets +1/+1 and gains hexproof until end of turn. Untap it.", "{U}")).atoms)
      .toEqual([{ op: "pump", targetType: "creature", restrictions: [{ kind: "controller", who: "you" }], ptDelta: { p: 1, t: 1 }, grantKeywords: ["hexproof"], untap: true }]);
  });
  it("flips native-spell", () => {
    expect(classifyCard(I("Vines of the Recluse", "Target creature gets +1/+2 and gains reach until end of turn. Untap it."))).toBe("native-spell");
  });
  it("a plain pump WITHOUT 'untap it' has NO untap flag (no regression)", () => {
    expect(parseEffectProgram(I("Sure Strike", "Target creature gets +2/+2 and gains trample until end of turn.")).atoms[0].untap).toBeUndefined();
  });
  it("'untap target creature' alone is still the plain untap atom; a bare 'Untap it.' clause stays unmodeled", () => {
    expect(parseEffectProgram(I("Twiddle", "Untap target creature.")).atoms).toEqual([{ op: "untap", targetType: "creature" }]);
    // a pump that grants an UNMODELED keyword + untap still drops (the grant gates the whole clause)
    expect(programConfidence(parseEffectProgram(I("X", "Target creature gets +2/+2 and gains shadow until end of turn. Untap it.")))).toBe("low");
  });
});

describe("pump-untap — resolver e2e (the pumped creature is also untapped)", () => {
  const bear = { name: "Grizzly Bears", type: "Creature — Bear", power: 2, toughness: 2, oracle: "" };
  it("a TAPPED 2/2 → +2/+2, gains trample, AND becomes untapped", () => {
    const s0 = createGameState({ userDeck: [], aiDeck: [] });
    let s = {
      ...s0, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
      players: { ...s0.players, user: { ...s0.players.user,
        battlefield: [createPermanent({ id: "bear", card: bear, controller: "user", summoningSick: false, tapped: true })],
        hand: [{ id: "trick", name: "Bull's Strength", type: "Instant", mana: "{1}{G}", oracle: "Target creature gets +2/+2 and gains trample until end of turn. Untap it." }],
        manaPool: { ...s0.players.user.manaPool, G: 1, C: 1 } } },
    };
    expect(s.players.user.battlefield.find((p) => p.id === "bear").tapped).toBe(true);
    const cast = filterActions(legalActionsForPlayer(s, "user"), "cast-spell").find((a) => a.cardId === "trick" && a.targets?.[0]?.id === "bear");
    expect(cast).toBeTruthy();
    s = resolveTopOfStack(dispatchAction(s, cast));
    expect(permanentPower(s, "bear")).toBe(4);
    expect(permanentToughness(s, "bear")).toBe(4);
    expect(permanentHasKeyword(s, "bear", "Trample")).toBe(true);
    expect(s.players.user.battlefield.find((p) => p.id === "bear").tapped).toBe(false); // UNTAPPED
    expect(s.pendingArbiter).toBeUndefined();
  });
});

// ─── Regression: a DEPARTED target must fizzle cleanly (never throw) ───────────────
describe("pump-untap — a target that left the battlefield fizzles (CR 608.2b), never throws", () => {
  it("applyPumpEffect with untap:true on a gone target is a clean no-op, and other creatures are untouched", () => {
    const s0 = createGameState({ userDeck: [], aiDeck: [] });
    const bystander = createPermanent({ id: "bystander", card: { id: "c-b", name: "Bystander", type: "Creature — Bear", power: 2, toughness: 2 }, controller: "user", summoningSick: false, tapped: true });
    const s = { ...s0, players: { ...s0.players, user: { ...s0.players.user, battlefield: [bystander] } } };
    const atom = { op: "pump", targetType: "creature", ptDelta: { p: 2, t: 4 }, grantKeywords: ["Trample"], untap: true };
    // The chosen target ("gone") is NOT on the battlefield — killed in response before the trick resolved.
    let next;
    expect(() => { next = applyPumpEffect(s, atom, { controller: "user", targets: [{ type: "creature", id: "gone" }] }); }).not.toThrow();
    const b = next.players.user.battlefield.find((p) => p.id === "bystander");
    expect(b.tapped).toBe(true);                 // the bystander was not the target → untouched (still tapped)
    expect(permanentPower(next, "bystander")).toBe(2); // and not pumped
  });
});

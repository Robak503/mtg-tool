/**
 * Combat-trick keyword grants — "Target creature gets +N/+N and gains [keyword] until end of
 * turn" (and the pure "gains [keyword] until end of turn"). The pump atom gains a
 * `grantKeywords` field; applyPumpEffect adds a layer-6 addKeyword endOfTurn effect per
 * granted keyword, so combat reads it layer-aware (exactly like a printed keyword). The
 * grantable set is shared with the Equipment/Aura/anthem path (GRANTABLE_STATIC_KEYWORDS — combat
 * keywords + indestructible + hexproof + shroud, all enforced layer-aware via PUMP-STATIC-GRANT), so
 * only enforced keywords grant; an un-enforced one (banding/protection) drops the clause to Arbiter.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { legalActionsForPlayer, filterActions } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { permanentPower, permanentToughness, permanentHasKeyword, expireContinuousEffects } from "./layers.js";
import { parseEffectProgram, programConfidence } from "./effects/parser.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const INSTANT = "Instant";
const BLESSING = { id: "c-bless", name: "Brave the Wilds", type: INSTANT, mana: "{1}", oracle: "Target creature gets +2/+2 and gains trample until end of turn." };
const PURE = { id: "c-fly", name: "Sudden Flight", type: INSTANT, mana: "{1}", oracle: "Target creature gains flying until end of turn." };
const MULTI = { id: "c-multi", name: "Sure Strike", type: INSTANT, mana: "{1}", oracle: "Target creature gets +1/+1 and gains first strike and lifelink until end of turn." };
const bearCard = { name: "Grizzly Bears", type: "Creature — Bear", power: 2, toughness: 2, oracle: "" };

function boardState({ user = [], hand = [], pool = { C: 5 } } = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...s, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
    players: { ...s.players, user: { ...s.players.user, battlefield: user, hand, manaPool: { ...s.players.user.manaPool, ...pool } } },
  };
}

describe("parser — combat-trick keyword grants", () => {
  it("pump + keyword grant, pure grant, and multi-keyword parse high with the right atom", () => {
    expect(parseEffectProgram(BLESSING).atoms).toEqual([{ op: "pump", targetType: "creature", ptDelta: { p: 2, t: 2 }, grantKeywords: ["Trample"] }]);
    expect(parseEffectProgram(PURE).atoms).toEqual([{ op: "pump", targetType: "creature", ptDelta: { p: 0, t: 0 }, grantKeywords: ["Flying"] }]);
    expect(parseEffectProgram(MULTI).atoms).toEqual([{ op: "pump", targetType: "creature", ptDelta: { p: 1, t: 1 }, grantKeywords: ["First strike", "Lifelink"] }]);
    for (const c of [BLESSING, PURE, MULTI]) expect(programConfidence(parseEffectProgram(c))).toBe("high");
  });
  it("an UNMODELED granted keyword (not enforced) drops the whole clause to Arbiter", () => {
    const low = (oracle) => expect(programConfidence(parseEffectProgram({ type: INSTANT, oracle }))).toBe("low");
    low("Target creature gains banding until end of turn.");       // banding un-grantable (shadow now IS — SLIVER INTERIORS SP-1)
    low("Target creature gains banding until end of turn.");
    low("Target creature gets +2/+2 and gains protection from red until end of turn.");
    low("Target creature gains flying until end of turn. Draw a card if you control a Bird."); // conditional rider
  });
  it("menace IS now grantable (GATED-GY-EXT) — combat tricks with menace parse high", () => {
    expect(programConfidence(parseEffectProgram({ type: INSTANT, oracle: "Target creature gets +1/+1 and gains menace until end of turn." }))).toBe("high");
  });
});

describe("coverage — native-spell", () => {
  it("a clean combat trick is native-spell; an unmodeled-keyword one is arbiter-spell", () => {
    expect(classifyCard(BLESSING)).toBe("native-spell");
    expect(classifyCard(PURE)).toBe("native-spell");
    expect(classifyCard({ type: INSTANT, oracle: "Target creature gains banding until end of turn.", name: "X" })).toBe("arbiter-spell");
  });
});

describe("resolution — the pump AND the granted keyword apply (layer-aware)", () => {
  it("+2/+2 and trample land on the chosen creature", () => {
    let s = boardState({ user: [createPermanent({ id: "bear", card: bearCard, controller: "user", summoningSick: false })], hand: [BLESSING] });
    expect(permanentHasKeyword(s, "bear", "Trample")).toBe(false);
    const cast = filterActions(legalActionsForPlayer(s, "user"), "cast-spell").find(a => a.cardId === "c-bless" && a.targets?.[0]?.id === "bear");
    expect(cast).toBeTruthy();
    s = resolveTopOfStack(dispatchAction(s, cast));
    expect(permanentPower(s, "bear")).toBe(4);
    expect(permanentToughness(s, "bear")).toBe(4);
    expect(permanentHasKeyword(s, "bear", "Trample")).toBe(true);
  });
  it("a pure grant gives the keyword with no P/T change", () => {
    let s = boardState({ user: [createPermanent({ id: "bear", card: bearCard, controller: "user", summoningSick: false })], hand: [PURE] });
    const cast = filterActions(legalActionsForPlayer(s, "user"), "cast-spell").find(a => a.cardId === "c-fly");
    s = resolveTopOfStack(dispatchAction(s, cast));
    expect(permanentHasKeyword(s, "bear", "Flying")).toBe(true);
    expect(permanentPower(s, "bear")).toBe(2);
    expect(permanentToughness(s, "bear")).toBe(2);
  });
  it("multiple keywords all grant", () => {
    let s = boardState({ user: [createPermanent({ id: "bear", card: bearCard, controller: "user", summoningSick: false })], hand: [MULTI] });
    const cast = filterActions(legalActionsForPlayer(s, "user"), "cast-spell").find(a => a.cardId === "c-multi");
    s = resolveTopOfStack(dispatchAction(s, cast));
    expect(permanentHasKeyword(s, "bear", "First strike")).toBe(true);
    expect(permanentHasKeyword(s, "bear", "Lifelink")).toBe(true);
    expect(permanentPower(s, "bear")).toBe(3);
  });
  it("the grant wears off at the cleanup of the turn (endOfTurn duration, CR 514.2)", () => {
    let s = boardState({ user: [createPermanent({ id: "bear", card: bearCard, controller: "user", summoningSick: false })], hand: [BLESSING] });
    const cast = filterActions(legalActionsForPlayer(s, "user"), "cast-spell").find(a => a.cardId === "c-bless");
    s = resolveTopOfStack(dispatchAction(s, cast));
    expect(permanentHasKeyword(s, "bear", "Trample")).toBe(true);
    expect(permanentPower(s, "bear")).toBe(4);
    const granted = (s.continuousEffects || []).find(e => e.op?.keyword === "Trample");
    expect(granted?.duration?.kind).toBe("endOfTurn");
    // At cleanup, the layer-6 keyword grant AND the layer-7c pump both expire (the expiry is
    // duration-based, layer-agnostic) — the bear reverts to a vanilla 2/2 with no trample.
    s = expireContinuousEffects(s, { atCleanupOfTurn: s.turn });
    expect(permanentHasKeyword(s, "bear", "Trample")).toBe(false);
    expect(permanentPower(s, "bear")).toBe(2);
    expect(permanentToughness(s, "bear")).toBe(2);
  });
});

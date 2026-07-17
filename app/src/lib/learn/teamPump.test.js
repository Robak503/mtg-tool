/**
 * Team pump (scope:youControl) — "Creatures you control get +N/+N [and gain KW...] until end of
 * turn" (Overrun / Inspired Charge / Charge). A controller-scoped one-shot mass pump modeled by
 * gathering the controller's creatures AT RESOLUTION and adding one fixed layer-7c P/T effect (+
 * layer-6 keyword grant) per creature — reusing the combat-trick pump loop. Covers: the parser
 * (anchored to UNFILTERED "creatures you control"; the Overrun keyword combo; all-or-nothing on
 * an unenforced keyword), CR 611.2c set-locking at resolution, the layer-aware keyword grant,
 * cleanup wear-off, the lethal SBA for a self-targeting -X/-X, native-spell coverage, and the AI
 * holding team pumps.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { createGameState, createPermanent, _resetIdsForTests, findPermanent } from "./gameState.js";
import { legalActionsForPlayer, filterActions } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { permanentPower, permanentToughness, permanentHasKeyword, expireContinuousEffects } from "./layers.js";
import { parseEffectProgram, programConfidence, programContainsTeamPump } from "./effects/parser.js";
import { classifyCard } from "./coverage.js";
import { pickAction } from "./opponentAI.js";

beforeEach(() => _resetIdsForTests());

const INSTANT = "Instant";
const SORCERY = "Sorcery";
const CHARGE = { id: "c-charge", name: "Inspired Charge", type: INSTANT, mana: "{2}{W}", oracle: "Creatures you control get +2/+2 until end of turn." };
const OVERRUN = { id: "c-overrun", name: "Overrun", type: SORCERY, mana: "{2}{G}{G}{G}", oracle: "Creatures you control get +3/+3 and gain trample until end of turn." };
const SELF_SHRINK = { id: "c-shrink", name: "Self Shrink", type: SORCERY, mana: "{1}{B}", oracle: "Creatures you control get -2/-2 until end of turn." };
const creature = (name, p, t) => ({ name, type: "Creature — Beast", power: p, toughness: t, oracle: "" });

function boardState({ user = [], ai = [], hand = [], pool = { C: 6, W: 1, G: 3 } } = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...s, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
    players: {
      ...s.players,
      user: { ...s.players.user, battlefield: user, hand, manaPool: { ...s.players.user.manaPool, ...pool } },
      ai: { ...s.players.ai, battlefield: ai },
    },
  };
}

const castTeamPump = (s, cardId) => {
  const cast = filterActions(legalActionsForPlayer(s, "user"), "cast-spell").find(a => a.cardId === cardId);
  expect(cast).toBeTruthy();
  expect(cast.needsTargets).toBeFalsy(); // a team pump takes NO chosen target (scope, not targetType)
  expect(cast.targets).toEqual([]);
  return resolveTopOfStack(dispatchAction(s, cast));
};

describe("parser — team pumps are HIGH; filtered / wrong-scope / unenforced-kw route to Arbiter", () => {
  it("plain + Overrun-combo parse high with the youControl scope atom", () => {
    expect(parseEffectProgram(CHARGE).atoms).toEqual([{ op: "pump", scope: "youControl", ptDelta: { p: 2, t: 2 } }]);
    expect(parseEffectProgram(OVERRUN).atoms).toEqual([{ op: "pump", scope: "youControl", ptDelta: { p: 3, t: 3 }, grantKeywords: ["Trample"] }]);
    // It carries scope, NOT a targetType — so it is non-targeted everywhere.
    expect(parseEffectProgram(CHARGE).atoms[0].targetType).toBeUndefined();
  });
  it("a filtered / wrong-scope / unenforced-keyword team pump is low", () => {
    const low = (oracle) => expect(programConfidence(parseEffectProgram({ type: INSTANT, oracle }))).toBe("low");
    // NOTE: "Other creatures you control …" (excludeSource) and "<curated-Subtype>s you control …"
    // (subtypeFilter) are now HIGH — see teamPumpScope.test.js (TEAM-PUMP-SCOPE). What stays LOW:
    low("Creatures you control with flying get +1/+1 until end of turn.");    // keyword-filtered subset
    low("White creatures you control get +1/+1 until end of turn.");          // color-filtered subset
    low("Vehicles you control get +1/+1 until end of turn.");                 // a NON-curated subtype word → low
    low("Attacking creatures you control get +2/+0 until end of turn.");      // you-control-filtered attacking subset (bare "attacking creatures" IS native — COMBAT-TEAM-PUMP)
    low("Creatures you control get +1/+1 and gain banding until end of turn."); // pump path: banding un-grantable (shadow now IS — SLIVER INTERIORS SP-1)
    low("Creatures you control gain banding until end of turn.");             // GROUP-KEYWORD-GRANT: un-grantable keyword → low (forestwalk graduated — BLITZ EQ-1)
  });
  it("a pure team keyword grant (no P/T) is now native via GROUP-KEYWORD-GRANT", () => {
    expect(parseEffectProgram({ type: INSTANT, oracle: "Creatures you control gain trample until end of turn." }).atoms)
      .toEqual([{ op: "grant-keywords-group", scope: "creaturesYouControl", grantKeywords: ["Trample"] }]);
    expect(parseEffectProgram({ type: INSTANT, oracle: "Permanents you control gain hexproof and indestructible until end of turn." }).atoms)
      .toEqual([{ op: "grant-keywords-group", scope: "permanentsYouControl", grantKeywords: ["Hexproof", "Indestructible"] }]);
  });
});

describe("coverage — clean team pumps are native-spell", () => {
  it("plain + combo classify native-spell; a filtered one is arbiter-spell", () => {
    expect(classifyCard(CHARGE)).toBe("native-spell");
    expect(classifyCard(OVERRUN)).toBe("native-spell");
    // "Other creatures …" (excludeSource) is now modeled → native-spell (TEAM-PUMP-SCOPE).
    expect(classifyCard({ type: INSTANT, name: "X", oracle: "Other creatures you control get +1/+1 until end of turn." })).toBe("native-spell");
    // A keyword-FILTERED team pump is still unmodeled → Arbiter.
    expect(classifyCard({ type: INSTANT, name: "X", oracle: "Creatures you control with flying get +1/+1 until end of turn." })).toBe("arbiter-spell");
  });
});

describe("resolution — pumps EVERY creature the caster controls, never the opponent's", () => {
  it("Inspired Charge buffs only the user's creatures (+2/+2)", () => {
    let s = boardState({
      user: [createPermanent({ id: "u1", card: creature("Mine A", 2, 2), controller: "user", summoningSick: false }),
             createPermanent({ id: "u2", card: creature("Mine B", 1, 1), controller: "user", summoningSick: false })],
      ai: [createPermanent({ id: "a1", card: creature("Theirs", 3, 3), controller: "ai", summoningSick: false })],
      hand: [CHARGE],
    });
    s = castTeamPump(s, "c-charge");
    expect([permanentPower(s, "u1"), permanentToughness(s, "u1")]).toEqual([4, 4]);
    expect([permanentPower(s, "u2"), permanentToughness(s, "u2")]).toEqual([3, 3]);
    expect([permanentPower(s, "a1"), permanentToughness(s, "a1")]).toEqual([3, 3]); // opponent untouched
  });

  it("Overrun grants the P/T bump AND trample to the caster's whole board (layer-aware)", () => {
    let s = boardState({
      user: [createPermanent({ id: "u1", card: creature("A", 2, 2), controller: "user", summoningSick: false })],
      ai: [createPermanent({ id: "a1", card: creature("B", 2, 2), controller: "ai", summoningSick: false })],
      hand: [OVERRUN],
    });
    s = castTeamPump(s, "c-overrun");
    expect([permanentPower(s, "u1"), permanentToughness(s, "u1")]).toEqual([5, 5]);
    expect(permanentHasKeyword(s, "u1", "Trample")).toBe(true);
    expect(permanentHasKeyword(s, "a1", "Trample")).toBe(false); // not granted to the opponent
  });

  it("CR 611.2c — the affected set is LOCKED at resolution; a creature entering later is NOT buffed", () => {
    let s = boardState({
      user: [createPermanent({ id: "u1", card: creature("Present", 2, 2), controller: "user", summoningSick: false })],
      hand: [CHARGE],
    });
    s = castTeamPump(s, "c-charge");
    expect(permanentPower(s, "u1")).toBe(4);
    // A creature that enters AFTER the pump resolved must not get the buff (the one-shot's set
    // was fixed when it began — it is NOT a continuously re-evaluated static anthem).
    const later = createPermanent({ id: "u2", card: creature("Latecomer", 2, 2), controller: "user", summoningSick: false });
    s = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [...s.players.user.battlefield, later] } } };
    expect(permanentPower(s, "u2")).toBe(2);
    expect(permanentToughness(s, "u2")).toBe(2);
  });

  it("the buff (and granted keyword) wears off at the cleanup of the turn", () => {
    let s = boardState({
      user: [createPermanent({ id: "u1", card: creature("A", 2, 2), controller: "user", summoningSick: false })],
      hand: [OVERRUN],
    });
    s = castTeamPump(s, "c-overrun");
    expect(permanentPower(s, "u1")).toBe(5);
    expect(permanentHasKeyword(s, "u1", "Trample")).toBe(true);
    s = expireContinuousEffects(s, { atCleanupOfTurn: s.turn });
    expect([permanentPower(s, "u1"), permanentToughness(s, "u1")]).toEqual([2, 2]);
    expect(permanentHasKeyword(s, "u1", "Trample")).toBe(false);
  });

  it("a negative team pump runs the lethal SBA — creatures dropped to 0 toughness die", () => {
    let s = boardState({
      user: [createPermanent({ id: "small", card: creature("Small", 2, 2), controller: "user", summoningSick: false }),
             createPermanent({ id: "big", card: creature("Big", 4, 4), controller: "user", summoningSick: false })],
      hand: [SELF_SHRINK], pool: { C: 6, B: 1 },
    });
    s = castTeamPump(s, "c-shrink");
    expect(findPermanent(s, "small")).toBeNull();        // 2/2 -> 0/0 dies
    expect(findPermanent(s, "big")).toBeTruthy();        // 4/4 -> 2/2 survives
    expect([permanentPower(s, "big"), permanentToughness(s, "big")]).toEqual([2, 2]);
  });

  it("a team pump with no creatures on board is a clean no-op (no throw)", () => {
    let s = boardState({ hand: [CHARGE] });
    s = castTeamPump(s, "c-charge");
    expect(s.players.user.battlefield.filter(p => /Creature/.test(p.card?.type || "")).length).toBe(0);
  });
});

describe("AI — holds team pumps (deferred timing heuristic)", () => {
  it("programContainsTeamPump flags youControl pumps; the AI passes on one", () => {
    expect(programContainsTeamPump(parseEffectProgram(CHARGE))).toBe(true);
    expect(programContainsTeamPump(parseEffectProgram(OVERRUN))).toBe(true);
    expect(programContainsTeamPump(parseEffectProgram({ type: SORCERY, oracle: "Draw a card." }))).toBe(false);
    // A single-target pump (Giant Growth) is NOT a team pump.
    expect(programContainsTeamPump(parseEffectProgram({ type: INSTANT, oracle: "Target creature gets +3/+3 until end of turn." }))).toBe(false);

    const base = createGameState({ userDeck: [], aiDeck: [] });
    const s = {
      ...base, phase: "precombat-main", step: "main", activePlayer: "ai", priorityHolder: "ai", consecutivePasses: 0,
      players: {
        ...base.players,
        ai: { ...base.players.ai, hand: [OVERRUN], battlefield: [createPermanent({ id: "a1", card: creature("Beater", 3, 3), controller: "ai", summoningSick: false })], manaPool: { C: 6, G: 3 } },
      },
    };
    const picked = pickAction(s, "ai", legalActionsForPlayer(s, "ai"));
    expect(picked?.kind === "cast-spell").toBe(false);
  });
});

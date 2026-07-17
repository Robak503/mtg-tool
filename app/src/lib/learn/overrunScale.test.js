/**
 * OVERRUN-X (Dex, real-deck-unlock) — a COUNT-SCALED team pump: "[Until end of turn,] creatures you
 * control gain trample and get +X/+X[ until end of turn], where X is the greatest power among / the number
 * of creatures you control." (Overwhelming Stampede, Craterhoof Behemoth's ETB clause, Pathbreaker Ibex).
 * Extends the numeric Overrun team pump (scope:"youControl") with a +X/+X delta that is a BOARD COUNT
 * computed at resolution (`ptDeltaCount`, via parseCountSource + countForSpec) — reusing the combat-trick
 * pump loop + layer-aware keyword grant verbatim. X is LOCKED pre-buff (CR 608.2h): every creature gets the
 * SAME +X/+X. A FILTERED team ("…with flying"), an unmodeled count source, or an un-grantable keyword
 * ("banding" — hexproof/indestructible/shroud/shadow ARE grantable now, PUMP-STATIC-GRANT + SP-1) keeps the
 * card LOW → Arbiter (never a half-scaled native). The AI HOLDS it like every team pump (programContainsTeamPump).
 */

import { describe, it, expect, beforeEach } from "vitest";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { legalActionsForPlayer, filterActions } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack, flushTriggers } from "./gameEngine.js";
import { enterPermanent } from "./resolvers.js";
import { permanentPower, permanentToughness, permanentHasKeyword, expireContinuousEffects } from "./layers.js";
import { parseEffectProgram, programConfidence, programContainsTeamPump } from "./effects/parser.js";
import { classifyCard } from "./coverage.js";
import { pickAction } from "./opponentAI.js";

beforeEach(() => _resetIdsForTests());

const SORCERY = "Sorcery";
const STAMPEDE = { id: "c-stampede", name: "Overwhelming Stampede", type: SORCERY, mana: "{4}{G}",
  oracle: "Until end of turn, creatures you control gain trample and get +X/+X, where X is the greatest power among creatures you control." };
const CRATERHOOF_CLAUSE = { type: SORCERY, name: "Craterhoof clause",
  oracle: "Creatures you control gain trample and get +X/+X until end of turn, where X is the number of creatures you control." };
const creature = (name, p, t) => ({ name, type: "Creature — Beast", power: p, toughness: t, oracle: "" });

function boardState({ user = [], ai = [], hand = [], pool = { C: 8, G: 4 } } = {}) {
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
const castStampede = (s) => {
  const cast = filterActions(legalActionsForPlayer(s, "user"), "cast-spell").find(a => a.cardId === "c-stampede");
  expect(cast).toBeTruthy();
  expect(cast.needsTargets).toBeFalsy();          // a team pump takes NO chosen target (scope, not targetType)
  expect(cast.targets).toEqual([]);
  return resolveTopOfStack(dispatchAction(s, cast));
};

describe("parser — count-scaled team pumps are HIGH with a ptDeltaCount; landmines route to Arbiter", () => {
  it("greatest-power (Stampede) + number-of-creatures (Craterhoof) parse to the scaled youControl pump", () => {
    expect(parseEffectProgram(STAMPEDE).atoms).toEqual([
      { op: "pump", scope: "youControl", ptDeltaCount: { kind: "greatestPowerYouControl" }, grantKeywords: ["Trample"] },
    ]);
    expect(parseEffectProgram(CRATERHOOF_CLAUSE).atoms).toEqual([
      { op: "pump", scope: "youControl", ptDeltaCount: { kind: "permanentsYouControl", cardType: "creature" }, grantKeywords: ["Trample"] },
    ]);
    // It carries scope, NOT a targetType — non-targeted everywhere.
    expect(parseEffectProgram(STAMPEDE).atoms[0].targetType).toBeUndefined();
  });
  it("CREED: a filtered team / unmodeled count source / un-grantable keyword stays LOW → Arbiter", () => {
    const low = (oracle) => expect(programConfidence(parseEffectProgram({ type: SORCERY, oracle }))).toBe("low");
    low("Until end of turn, creatures you control with flying gain trample and get +X/+X, where X is the greatest power among creatures you control."); // filtered subset
    low("Until end of turn, creatures you control gain trample and get +X/+X, where X is the number of cards in target opponent's hand.");             // unmodeled count source
    low("Until end of turn, creatures you control gain banding and get +X/+X, where X is the greatest power among creatures you control.");      // banding un-grantable (shadow now IS — SLIVER INTERIORS SP-1)
    low("Until end of turn, other creatures you control gain trample and get +X/+X, where X is the greatest power among creatures you control.");       // "other" — different set
  });
});

describe("coverage — Overwhelming Stampede flips native-spell; landmines bounce", () => {
  it("the greatest-power overrun is native-spell; a filtered one is arbiter-spell", () => {
    expect(classifyCard(STAMPEDE)).toBe("native-spell");
    expect(classifyCard({ type: SORCERY, name: "Filtered", oracle: "Until end of turn, creatures you control with flying gain trample and get +X/+X, where X is the greatest power among creatures you control." })).toBe("arbiter-spell");
  });
});

describe("resolution — pumps EVERY creature the caster controls by X (locked pre-buff), grants trample", () => {
  it("Overwhelming Stampede: board powers 2/4/1 → X=4 → all +4/+4 + trample; opponent untouched", () => {
    let s = boardState({
      user: [createPermanent({ id: "u1", card: creature("A", 2, 2), controller: "user", summoningSick: false }),
             createPermanent({ id: "u2", card: creature("B", 4, 4), controller: "user", summoningSick: false }),
             createPermanent({ id: "u3", card: creature("C", 1, 1), controller: "user", summoningSick: false })],
      ai: [createPermanent({ id: "a1", card: creature("Theirs", 5, 5), controller: "ai", summoningSick: false })],
      hand: [STAMPEDE],
    });
    s = castStampede(s);
    // X = greatest power BEFORE the buff = 4 (NOT the opponent's 5, NOT the post-buff 8). All get the SAME +4/+4.
    expect([permanentPower(s, "u1"), permanentToughness(s, "u1")]).toEqual([6, 6]); // 2 + 4
    expect([permanentPower(s, "u2"), permanentToughness(s, "u2")]).toEqual([8, 8]); // 4 + 4
    expect([permanentPower(s, "u3"), permanentToughness(s, "u3")]).toEqual([5, 5]); // 1 + 4
    expect(permanentHasKeyword(s, "u1", "Trample")).toBe(true);
    expect([permanentPower(s, "a1"), permanentToughness(s, "a1")]).toEqual([5, 5]); // opponent untouched
    expect(permanentHasKeyword(s, "a1", "Trample")).toBe(false);
  });

  it("the +X/+X and granted trample wear off at cleanup", () => {
    let s = boardState({
      user: [createPermanent({ id: "u1", card: creature("A", 3, 3), controller: "user", summoningSick: false })],
      hand: [STAMPEDE],
    });
    s = castStampede(s);
    expect([permanentPower(s, "u1"), permanentToughness(s, "u1")]).toEqual([6, 6]); // X=3 → 3+3
    expect(permanentHasKeyword(s, "u1", "Trample")).toBe(true);
    s = expireContinuousEffects(s, { atCleanupOfTurn: s.turn });
    expect([permanentPower(s, "u1"), permanentToughness(s, "u1")]).toEqual([3, 3]);
    expect(permanentHasKeyword(s, "u1", "Trample")).toBe(false);
  });

  it("an empty board is a clean no-op (X=0, no throw, no fabricated buff)", () => {
    let s = boardState({ hand: [STAMPEDE] });
    s = castStampede(s);
    expect(s.players.user.battlefield.filter(p => /Creature/.test(p.card?.type || "")).length).toBe(0);
  });
});

describe("trigger path — Craterhoof Behemoth's ETB flips native-trigger for free and resolves", () => {
  // The clause is now HIGH, so the trigger compiler picks up Craterhoof's ETB (like RAMP-MULTI flipped
  // Harrow via ADDCOST). Verify it actually RESOLVES on the trigger path (CREED — a native flip must play).
  const CRATERHOOF = { type: "Creature — Beast", name: "Craterhoof Behemoth", mana: "{5}{G}{G}{G}", power: 5, toughness: 5,
    oracle: "Haste\nWhen this creature enters, creatures you control gain trample and get +X/+X until end of turn, where X is the number of creatures you control." };
  const resolveAll = (s) => { while (s.stack.length) s = resolveTopOfStack(s); return s; };

  it("classifies native-trigger and its ETB pumps the WHOLE team (incl. itself) by the creature count", () => {
    expect(classifyCard(CRATERHOOF)).toBe("native-trigger");
    let s = createGameState({ userDeck: [], aiDeck: [] });
    s = { ...s, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
      players: { ...s.players, user: { ...s.players.user, battlefield: [
        createPermanent({ id: "u1", card: creature("A", 2, 2), controller: "user", summoningSick: false }),
        createPermanent({ id: "u2", card: creature("B", 1, 1), controller: "user", summoningSick: false }),
      ] } } };
    // Craterhoof enters → 3 creatures (u1, u2, Craterhoof) → X = 3 → all get +3/+3 + trample.
    s = resolveAll(flushTriggers(enterPermanent(s, CRATERHOOF, "user")));
    expect([permanentPower(s, "u1"), permanentToughness(s, "u1")]).toEqual([5, 5]); // 2 + 3
    expect([permanentPower(s, "u2"), permanentToughness(s, "u2")]).toEqual([4, 4]); // 1 + 3
    expect(permanentHasKeyword(s, "u1", "Trample")).toBe(true);
    const hoof = s.players.user.battlefield.find(p => p.card?.name === "Craterhoof Behemoth");
    expect([permanentPower(s, hoof.id), permanentToughness(s, hoof.id)]).toEqual([8, 8]); // 5 + 3, counts itself
    expect(permanentHasKeyword(s, hoof.id, "Trample")).toBe(true);
  });
});

describe("AI — holds the count-scaled team pump like every team pump", () => {
  it("programContainsTeamPump flags it; the AI passes rather than casting it blindly", () => {
    expect(programContainsTeamPump(parseEffectProgram(STAMPEDE))).toBe(true);
    const base = createGameState({ userDeck: [], aiDeck: [] });
    const s = {
      ...base, phase: "precombat-main", step: "main", activePlayer: "ai", priorityHolder: "ai", consecutivePasses: 0,
      players: {
        ...base.players,
        ai: { ...base.players.ai, hand: [STAMPEDE], battlefield: [createPermanent({ id: "a1", card: creature("Beater", 3, 3), controller: "ai", summoningSick: false })], manaPool: { C: 8, G: 4 } },
      },
    };
    const picked = pickAction(s, "ai", legalActionsForPlayer(s, "ai"));
    expect(picked?.kind === "cast-spell").toBe(false);
  });
});

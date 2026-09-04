/**
 * peerIntoTheAbyss.test.js — SHELF-85 runbook Phase 2 · N11 (2026-09-04): Peer into the Abyss (Nekusar).
 *
 *   "Target player draws cards equal to half the number of cards in their library and loses half their life. Round up
 *    each time."
 *
 * ONE targeted composite on a whole-oracle matcher (the " and " would sever the two halves and the rounding sentence
 * names both): the target draws ceil(library/2) through the single draw chokepoint (draw watchers fire — Nekusar's
 * plan) and loses ceil(life/2) through loseLife, both read off the live seat at resolution (CR 608.2h). The intent is
 * enemy-facing (half a life total is harm).
 *
 * Real oracle fixture (bundled Scryfall snapshot, verified in-session 2026-09-04).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { parseEffectClause, programConfidence } from "./effects/parser.js";
import { atomTargetIntent } from "./effects/programQueries.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { classifyCard } from "./coverage.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const PEER = { id: "c-peer", name: "Peer into the Abyss", type: "Sorcery", mana: "{4}{B}{B}{B}", cmc: 7, keywords: [],
  oracle: "Target player draws cards equal to half the number of cards in their library and loses half their life. Round up each time." };
const lib = (pid, n) => Array.from({ length: n }, (_, i) => ({ id: `${pid}-lib-${i}`, name: "Swamp", type: "Basic Land — Swamp", oracle: "{T}: Add {B}." }));
const swamp = (id) => createPermanent({ id, card: { id: "card-" + id, name: "Swamp", type: "Basic Land — Swamp", oracle: "{T}: Add {B}." }, controller: "user" });

function board({ aiLib, aiLife }) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return { ...s, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0, turn: 8,
    players: { ...s.players,
      user: { ...s.players.user, life: 30, battlefield: Array.from({ length: 7 }, (_, i) => swamp("S" + i)), hand: [{ ...PEER, id: "peer-hand" }], library: lib("user", 4) },
      ai: { ...s.players.ai, life: aiLife, library: lib("ai", aiLib), hand: [] } } };
}
const castAt = (s, target) => {
  const a = legalActionsForPlayer(s, "user").find((x) => x.kind === "cast-spell" && x.cardId === "peer-hand" && x.targets?.[0]?.id === target);
  expect(a).toBeTruthy();
  s = dispatchAction(s, a);
  while (s.stack.length && !s.pendingChoice) s = resolveTopOfStack(s);
  return s;
};

describe("parse", () => {
  it("one targeted composite; the intent is enemy-facing", () => {
    const r = parseEffectClause(PEER.oracle, "Sorcery");
    expect(programConfidence(r)).toBe("high");
    expect(r.atoms).toEqual([{ op: "draw-half-library-lose-half-life", targetType: "player", roundUp: true }]);
    expect(atomTargetIntent(r.atoms[0])).toBe("enemy");
  });
  it("seen-to-fail: 'round down' and a different pair park", () => {
    expect(parseEffectClause("Target player draws cards equal to half the number of cards in their library and loses half their life. Round down each time.", "Sorcery").atoms).toEqual([]);
    expect(parseEffectClause("Target player draws cards equal to half the number of cards in their library. Round up each time.", "Sorcery").atoms).toEqual([]);
  });
});

describe("runtime", () => {
  it("odd counts round up: 7 cards → draws 4; 33 life → loses 17", () => {
    let s = board({ aiLib: 7, aiLife: 33 });
    s = castAt(s, "ai");
    expect(s.players.ai.hand).toHaveLength(4);
    expect(s.players.ai.library).toHaveLength(3);
    expect(s.players.ai.life).toBe(16);
    expect(s.players.user.life).toBe(30);
    expect(s.players.user.hand).toHaveLength(0);
  });
  it("even counts halve exactly; the caster may target themself", () => {
    let s = board({ aiLib: 6, aiLife: 40 });
    s = castAt(s, "user"); // user: 4 in library → 2 drawn; 30 life → 15
    expect(s.players.user.hand).toHaveLength(2);
    expect(s.players.user.library).toHaveLength(2);
    expect(s.players.user.life).toBe(15);
    expect(s.players.ai.hand).toHaveLength(0);
    expect(s.players.ai.life).toBe(40);
  });
  it("an empty library and 1 life: draws nothing, loses 1", () => {
    let s = board({ aiLib: 0, aiLife: 1 });
    s = castAt(s, "ai");
    expect(s.players.ai.hand).toHaveLength(0);
    expect(s.players.ai.life).toBe(0);
  });
});

describe("classifier", () => {
  it("Peer into the Abyss is a native spell", () => {
    expect(classifyCard(PEER)).toBe("native-spell");
  });
});

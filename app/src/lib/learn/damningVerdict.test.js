/**
 * damningVerdict.test.js — SHELF-85 runbook Phase 2 · H9 (2026-09-04): Damning Verdict (Shalai and Hallar).
 *
 *   "Destroy all creatures with no counters on them."
 *
 * The mass destroy already routes its filter phrase through parseCreatureTargetRestrictions; that parser had no counter
 * vocabulary, while the shared evaluator (creatureRestrictions.js) already knew a hasCounter kind from the targeted
 * "+1/+1 counter" arm. This slice adds the counters-on-it restriction to the parser — any kind or a named kind,
 * NEGATED for "no" — and teaches the evaluator the negation. Nothing else changed: the targeted "+1/+1 counter" form
 * still parses through its older arm, byte-identical.
 *
 * Real oracle fixture (bundled Scryfall snapshot, verified in-session 2026-09-04).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { parseEffectClause, programConfidence } from "./effects/parser.js";
import { parseCreatureTargetRestrictions } from "./spellEffects.js";
import { creatureSatisfiesRestrictions } from "./creatureRestrictions.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { classifyCard } from "./coverage.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const VERDICT = { id: "c-dv", name: "Damning Verdict", type: "Sorcery", mana: "{3}{W}{W}", keywords: [], oracle: "Destroy all creatures with no counters on them." };
const bear = (id, ctrl, counters) => ({ ...createPermanent({ id, card: { id: "card-" + id, name: "Bear " + id, type: "Creature — Bear", oracle: "", power: 2, toughness: 2 }, controller: ctrl }), ...(counters ? { counters } : {}) });
const plains = (id) => createPermanent({ id, card: { id: "card-" + id, name: "Plains", type: "Basic Land — Plains", oracle: "({T}: Add {W}.)" }, controller: "user" });

const board = () => {
  let s = createGameState({ userDeck: [], aiDeck: [] });
  return { ...s, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0, turn: 6,
    players: { ...s.players,
      user: { ...s.players.user, hand: [VERDICT], battlefield: [plains("P1"), plains("P2"), plains("P3"), plains("P4"), plains("P5"), bear("UC", "user", { "+1/+1": 1 }), bear("UN", "user", null)] },
      ai: { ...s.players.ai, battlefield: [bear("AC", "ai", { "-1/-1": 1 }), bear("AN", "ai", null), bear("AZ", "ai", { "+1/+1": 0 })] } } };
};

describe("parse", () => {
  it("'with no counters' is a negated hasCounter; 'with counters' the plain one; the targeted '+1/+1 counter' arm is untouched", () => {
    const r = parseEffectClause("Destroy all creatures with no counters on them.", "Sorcery");
    expect(programConfidence(r)).toBe("high");
    expect(r.atoms).toEqual([{ op: "destroy", targetType: "eachCreature", restrictions: [{ kind: "hasCounter", negate: true }] }]);
    expect(parseEffectClause("Destroy all creatures with counters on them.", "Sorcery").atoms).toEqual([{ op: "destroy", targetType: "eachCreature", restrictions: [{ kind: "hasCounter" }] }]);
    expect(parseEffectClause("Destroy target creature with a +1/+1 counter on it.", "Sorcery").atoms).toEqual([{ op: "destroy", targetType: "creature", restrictions: [{ kind: "hasCounter", counterType: "+1/+1" }] }]);
    expect(parseCreatureTargetRestrictions({ oracle: "~ deals 1 damage to each creature with no counters on it" }).restrictions).toEqual([{ kind: "hasCounter", negate: true }]);
  });
  it("the evaluator: the negation excludes a countered creature; a zero-count entry is 'no counters'", () => {
    const s = board();
    const perm = (id, pid) => s.players[pid].battlefield.find((p) => p.id === id);
    const neg = [{ kind: "hasCounter", negate: true }];
    const pos = [{ kind: "hasCounter" }];
    expect(creatureSatisfiesRestrictions(s, perm("UN", "user"), "user", "user", neg)).toBe(true);
    expect(creatureSatisfiesRestrictions(s, perm("UC", "user"), "user", "user", neg)).toBe(false);
    expect(creatureSatisfiesRestrictions(s, perm("AZ", "ai"), "ai", "user", neg)).toBe(true);
    expect(creatureSatisfiesRestrictions(s, perm("UC", "user"), "user", "user", pos)).toBe(true);
    expect(creatureSatisfiesRestrictions(s, perm("UN", "user"), "user", "user", pos)).toBe(false);
  });
});

describe("runtime", () => {
  it("only the creatures WITH counters survive, on both sides", () => {
    let s = board();
    const act = legalActionsForPlayer(s, "user").find((a) => a.kind === "cast-spell" && a.cardId === "c-dv");
    expect(act).toBeTruthy();
    s = dispatchAction(s, act);
    while (s.stack.length && !s.pendingChoice) s = resolveTopOfStack(s);
    expect(s.players.user.battlefield.filter((p) => /Bear/.test(p.card.name)).map((p) => p.id)).toEqual(["UC"]);
    expect(s.players.ai.battlefield.map((p) => p.id)).toEqual(["AC"]);
    expect(s.players.user.graveyard.map((c) => c.id).sort()).toEqual(["c-dv", "card-UN"]);
  });
});

describe("classifier", () => {
  it("Damning Verdict is a native spell", () => {
    expect(classifyCard(VERDICT)).toBe("native-spell");
  });
});

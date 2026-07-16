/**
 * counterSoftRiders.test.js — BLITZ CS-1: (a) SOFT counter + EXILE-INSTEAD composition (Syncopate
 * {X} / No More Lies {3}) — the pay-decision suspends first and the DECLINE path exiles the countered
 * spell instead of graveyarding it (counterDest rides the pendingChoice from applyCounter through
 * resolveSoftCounterChoice, so the suspend can't drop the redirect); (b) the CNT-MILL-RIDER
 * ("Counter target spell. Its controller mills three cards." — Thought Collapse / Didn't Say Please)
 * through the SHARED millOnePlayer chokepoint (doubler + milled-trigger binds identical to any mill).
 *
 * CREED FPs guarded: paying must leave the spell ON the stack untouched; declining must place the
 * card in EXILE (not the graveyard); the mill rider hits the COUNTERED spell's controller only.
 * Real oracle fixtures (exact bundled Scryfall text, verified 2026-07-16).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { createGameState, _resetIdsForTests } from "./gameState.js";
import { parseEffectClause, programConfidence } from "./effects/parser.js";
import { applyCounter as _noexport } from "./effects/atoms/stack.js"; // not exported — parse-only import guard
import { runEffectProgram, resolveSoftCounterChoice } from "./effects/runProgram.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const SYNCOPATE = { id: "syn", name: "Syncopate", type: "Instant", mana: "{X}{U}",
  oracle: "Counter target spell unless its controller pays {X}. If that spell is countered this way, exile it instead of putting it into its owner's graveyard." };
const NO_MORE_LIES = { id: "nml", name: "No More Lies", type: "Instant", mana: "{W}{U}",
  oracle: "Counter target spell unless its controller pays {3}. If that spell is countered this way, exile it instead of putting it into its owner's graveyard." };
const THOUGHT_COLLAPSE = { id: "tc", name: "Thought Collapse", type: "Instant", mana: "{1}{U}{U}",
  oracle: "Counter target spell. Its controller mills three cards." };

describe("parse + classify", () => {
  it("No More Lies → soft counter WITH exileInstead; Syncopate → the {X} soft form with exileInstead", () => {
    const nml = parseEffectClause(NO_MORE_LIES.oracle, "Instant");
    expect(programConfidence(nml)).toBe("high");
    expect(nml.atoms[0]).toMatchObject({ op: "counter", unlessPay: 3, exileInstead: true });
    const syn = parseEffectClause(SYNCOPATE.oracle, "Instant", { hasX: true });
    expect(programConfidence(syn)).toBe("high");
    expect(syn.atoms[0]).toMatchObject({ op: "counter", unlessPayX: true, exileInstead: true });
    expect(classifyCard(SYNCOPATE)).toBe("native-spell");
    expect(classifyCard(NO_MORE_LIES)).toBe("native-spell");
  });
  it("Thought Collapse → counter with the mill controllerRider", () => {
    const p = parseEffectClause(THOUGHT_COLLAPSE.oracle, "Instant");
    expect(programConfidence(p)).toBe("high");
    expect(p.atoms[0]).toMatchObject({ op: "counter", controllerRider: { kind: "mill", count: 3 } });
    expect(classifyCard(THOUGHT_COLLAPSE)).toBe("native-spell");
  });
  it("CREED — an unmodeled soft form composed with exile-instead stays LOW (pay-life / pay-count)", () => {
    expect(programConfidence(parseEffectClause(
      "Counter target spell unless its controller pays 3 life. If that spell is countered this way, exile it instead of putting it into its owner's graveyard.", "Instant",
    ))).not.toBe("high");
  });
});

describe("runtime — the decline path exiles; the pay path leaves the spell on the stack", () => {
  const VICTIM = { id: "vc", name: "Victim Sorcery", type: "Sorcery", mana: "{1}{R}", oracle: "" };

  function stateWithVictimOnStack() {
    const s = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
    const stackObj = { id: "sp1", kind: "spell", controller: "ai1", source: VICTIM, payload: { params: {} } };
    return {
      ...s,
      stack: [stackObj],
      players: {
        ...s.players,
        // Real pool shape: generic costs are paid WITH colored/colorless mana (planPayment), so the
        // pay-path fixture floats five blue.
        ai1: { ...s.players.ai1, graveyard: [], exile: [], manaPool: { W: 0, U: 5, B: 0, R: 0, G: 0, C: 0 } },
      },
    };
  }

  function counterVictim(state, atom) {
    return runEffectProgram(state, { source: { name: "No More Lies" }, payload: { params: { program: { atoms: [atom] }, controller: "user", targets: [{ type: "spell", id: "sp1" }], sourceId: "cnt1" } } });
  }

  it("decline → the spell leaves the stack to EXILE (never the graveyard)", () => {
    const atom = parseEffectClause(NO_MORE_LIES.oracle, "Instant").atoms[0];
    let s = counterVictim(stateWithVictimOnStack(), atom);
    expect(s.pendingChoice).toMatchObject({ kind: "soft-counter", counterDest: "exile", controller: "ai1", amount: 3 });
    s = resolveSoftCounterChoice(s, false);
    expect(s.stack).toHaveLength(0);
    expect(s.players.ai1.exile.some((c) => c.id === "vc")).toBe(true);
    expect(s.players.ai1.graveyard.some((c) => c.id === "vc")).toBe(false);
  });

  it("pay → the spell SURVIVES on the stack, nothing exiled", () => {
    const atom = parseEffectClause(NO_MORE_LIES.oracle, "Instant").atoms[0];
    let s = counterVictim(stateWithVictimOnStack(), atom);
    s = resolveSoftCounterChoice(s, true);
    expect(s.stack).toHaveLength(1);
    expect(s.players.ai1.exile).toHaveLength(0);
  });

  it("the mill rider mills the COUNTERED spell's controller through the shared chokepoint", () => {
    const atom = parseEffectClause(THOUGHT_COLLAPSE.oracle, "Instant").atoms[0];
    let s = stateWithVictimOnStack();
    const lib = Array.from({ length: 5 }, (_, i) => ({ id: `l${i}`, name: `L${i}`, type: "Instant", oracle: "" }));
    s = { ...s, players: { ...s.players, ai1: { ...s.players.ai1, library: lib } } };
    s = counterVictim(s, atom);
    expect(s.stack).toHaveLength(0);
    expect(s.players.ai1.library).toHaveLength(2);                       // milled 3
    expect(s.players.ai1.graveyard.filter((c) => c.id.startsWith("l"))).toHaveLength(3);
    expect(s.players.ai1.graveyard.some((c) => c.id === "vc")).toBe(true); // the countered card itself
  });
});

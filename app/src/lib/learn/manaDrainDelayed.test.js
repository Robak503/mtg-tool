/**
 * manaDrainDelayed.test.js — MANA DRAIN (2026-08-14). "Counter target spell. At the beginning of your
 * next main phase, add an amount of {C} equal to that spell's mana value."
 *
 * ⭐ THREE EXISTING MACHINES, ONE SEAM: the splitClauses MANA-DRAIN FOLD keeps the two sentences as ONE
 * clause (a bare counter alone would be the FORBIDDEN confident-wrong-partial — a Mana Drain that never
 * pays out); the counter arm carries delayedManaFromMv; applyCounter locks the countered spell's MV at
 * resolution and schedules the payout on the CR 603.7 delayed-trigger queue with the clause rewritten
 * CONCRETE ("add {c}…" — the sentinel discipline: the fired trigger parses on the ordinary ritual-mana
 * arm, no dead "that spell" referent). fireStep "main" + fireScope "yours" = YOUR next main phase, and
 * the step-entry drain makes "next" correct by construction (CR 603.7b).
 *
 * ⭐ CR 202.3b: an {X} spell's stack MV counts the chosen X (payload.params.xValue) — witnessed.
 * ⛔ MV 0 schedules nothing; a FIZZLED counter schedules nothing. Both witnessed.
 *
 * Mutation-checked (2026-08-14, applied-check by PRINTING THE CHANGED LINE BACK):
 *   · the splitClauses fold disabled -> Mana Drain parks (arbiter-spell).
 *   · the scheduling block removed -> counters but never pays out (the payout witnesses die).
 *
 * Real oracle fixture (bundled Scryfall, probed 2026-08-14).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { ATOM_RESOLVERS } from "./effects/effectAtoms.js";
import { parseEffectClause } from "./effects/parser.js";
import { splitClauses } from "./effects/splitClauses.js";
import { drainDelayedTriggers } from "./effects/atoms/delayedTrigger.js";
import { _resetIdsForTests, createGameState, createStackObject } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const ORACLE = "Counter target spell. At the beginning of your next main phase, add an amount of {C} equal to that spell's mana value.";
const MANA_DRAIN = { id: "c-md", name: "Mana Drain", type: "Instant", mana: "{U}{U}", oracle: ORACLE };

/** A game with one opponent spell on the stack; returns { state, atom }. */
function boardWithSpell({ cmc = 3, xValue = null, mana = undefined } = {}) {
  const g = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
  // `mana` (2026-10-03): the stack MV counts the chosen X once per {X} in the MANA COST (CR 202.3e — stackSpellManaValue), so
  // the X witness carries the cost its title names; before, any recorded xValue was added once whatever the cost said.
  const spellCard = { id: "card-tgt", name: "Target Spell", type: "Sorcery", cmc, oracle: "", ...(mana ? { mana } : {}) };
  const stackObj = createStackObject({
    id: "stk-tgt", kind: "spell", source: spellCard, controller: "ai1", targets: [],
    payload: { resolver: "manual", params: xValue != null ? { xValue } : {} },
  });
  const atom = parseEffectClause(splitClauses(ORACLE)[0], "Instant").atoms[0];
  return { state: { ...g, stack: [stackObj] }, atom };
}

describe("the carrier and the shape", () => {
  it("⭐ Mana Drain flips; the fold keeps ONE clause; the atom carries the rider flag", () => {
    expect(classifyCard(MANA_DRAIN)).toBe("native-spell");
    const clauses = splitClauses(ORACLE);
    expect(clauses).toHaveLength(1);
    const p = parseEffectClause(clauses[0], "Instant");
    expect(p.confidence).toBe("high");
    expect(p.atoms[0]).toMatchObject({ op: "counter", spellFilter: "any", targetType: "spell", delayedManaFromMv: true });
  });
});

describe("⭐⭐ LAW 6 — the counter lands AND the payout is scheduled with the locked MV", () => {
  it("⭐⭐ counter an MV-3 spell: countered off the stack + one delayed record, add {c}{c}{c}, main/yours", () => {
    const { state, atom } = boardWithSpell({ cmc: 3 });
    const after = ATOM_RESOLVERS.counter(state, atom, { controller: "user", targets: [{ type: "spell", id: "stk-tgt" }], cardName: "Mana Drain" });
    const rec = (after.delayedTriggers || [])[0];
    const row = { stack: after.stack.length, records: (after.delayedTriggers || []).length,
      clause: rec?.effectClause, fireStep: rec?.fireStep, fireScope: rec?.fireScope, controller: rec?.controller };
    console.log("  WITNESS drainSchedule", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ stack: 0, records: 1, clause: "add {c}{c}{c}", fireStep: "main", fireScope: "yours", controller: "user" });
  });

  it("⭐ the payout fires at the CASTER's main entry — and at nobody else's (CR 603.7b/d)", () => {
    const { state, atom } = boardWithSpell({ cmc: 2 });
    const after = ATOM_RESOLVERS.counter(state, atom, { controller: "user", targets: [{ type: "spell", id: "stk-tgt" }], cardName: "Mana Drain" });
    const wrongTurn = drainDelayedTriggers(after, "main", "ai1");
    const rightTurn = drainDelayedTriggers(after, "main", "user");
    const row = { firesOnOpponentsMain: wrongTurn.fired.length, firesOnYourMain: rightTurn.fired.length,
      clause: rightTurn.fired[0]?.descriptor?.effectClause };
    console.log("  WITNESS drainTiming", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ firesOnOpponentsMain: 0, firesOnYourMain: 1, clause: "add {c}{c}" });
    // the concrete clause parses HIGH on the ordinary ritual-mana arm — the whole sentinel promise
    expect(parseEffectClause("add {c}{c}", "Instant").atoms[0]).toMatchObject({ op: "add-mana", mana: { C: 2 } });
  });

  it("⭐ CR 202.3b: an {X}{R} spell cast with X=5 pays out SIX", () => {
    const { state, atom } = boardWithSpell({ cmc: 1, xValue: 5, mana: "{X}{R}" });
    const after = ATOM_RESOLVERS.counter(state, atom, { controller: "user", targets: [{ type: "spell", id: "stk-tgt" }], cardName: "Mana Drain" });
    const clause = (after.delayedTriggers || [])[0]?.effectClause;
    console.log("  WITNESS drainXSpell", JSON.stringify({ clause })); // vitest 4 needs --disable-console-intercept
    expect(clause).toBe("add " + "{c}".repeat(6));
  });

  it("⛔ an MV-0 spell schedules NOTHING (an empty add is not a firing)", () => {
    const { state, atom } = boardWithSpell({ cmc: 0 });
    const after = ATOM_RESOLVERS.counter(state, atom, { controller: "user", targets: [{ type: "spell", id: "stk-tgt" }], cardName: "Mana Drain" });
    expect(after.stack.length).toBe(0);                       // still countered
    expect((after.delayedTriggers || []).length).toBe(0);     // no payout record
  });

  it("⛔⛔ a FIZZLED counter (target already gone) schedules NOTHING", () => {
    const { state, atom } = boardWithSpell({ cmc: 3 });
    const empty = { ...state, stack: [] }; // the target left the stack before resolution
    const after = ATOM_RESOLVERS.counter(empty, atom, { controller: "user", targets: [{ type: "spell", id: "stk-tgt" }], cardName: "Mana Drain" });
    const row = { records: (after.delayedTriggers || []).length };
    console.log("  WITNESS drainFizzle", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ records: 0 });
  });
});

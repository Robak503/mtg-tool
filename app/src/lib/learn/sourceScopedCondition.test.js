/**
 * sourceScopedCondition.test.js — WHICH condition probe applies, decided by the context the caller can
 * honestly supply at resolution.
 *
 * An atom-level `condition` is the metric⇄runtime shared gate: it may be attached ONLY when the resolver can
 * actually evaluate it. Until now both conditional arms used the SPELL probe (empty context), so a
 * source-dependent condition could never be attached — even on a TRIGGER, which does have a source.
 *
 *   • a resolving SPELL has no object thread at all   → spellConditionParseable
 *   • a PERMANENT'S ABILITY has its SOURCE permanent  → activationConditionParseable (source-only probe)
 *
 * ⭐ THE SOURCE-ONLY PROBE IS DELIBERATE. A trigger's context ALSO carries per-event fields (triggering
 * permanent, defender, damage snapshots) that VARY BY EVENT, so probing with all of them would admit
 * conditions some other event's trigger cannot answer. `sourcePermanentId` is the one field EVERY trigger
 * carries, so it is the honest floor; anything needing more still parks (a safe FN).
 *
 * VERIFIED BEFORE WIRING, not assumed: triggers.js threads sourcePermanentId into the trigger context and
 * runProgram passes that same context to evaluateInterveningIf. So a condition admitted here is one the
 * runtime can answer — never a claimed-but-unfirable rider.
 *
 * ⚠️ AND IT STILL DOES NOT COMPLETE LEVEL UP. Its granted body needs the pronoun rewrite to fire INSIDE a
 * compound, and that rewrite is whole-clause anchored ON PURPOSE so a rider can't be silently dropped.
 * Weakening that anchor is a separate CREED decision, banked in the ledger. Pinned below.
 */
import { describe, expect, it } from "vitest";

import { parseEffectClause } from "./effects/parser.js";
import { classifyCard } from "./coverage.js";

const SELF_COND = "draw a card if this creature has power 10 or greater";
const BOARD_COND = "draw a card if you control a creature with power 4 or greater";
const parse = (clause, opts = {}) => parseEffectClause(clause, "Instant", { hasX: false, ...opts });

describe("the scope gate", () => {
  it("⛔ CREED — a SPELL still cannot attach a source-dependent condition", () => {
    // A resolving spell has no source permanent, so the runtime could not answer this. It must park.
    expect(parse(SELF_COND).confidence).toBe("low");
  });

  it("⭐ a TRIGGER clause CAN — that is the whole change", () => {
    const p = parse(SELF_COND, { sourceScoped: true });
    expect(p.confidence).toBe("high");
    expect(p.atoms[0]).toMatchObject({ op: "draw", condition: "this creature has power 10 or greater" });
  });

  it("a BOARD condition is unchanged in BOTH scopes (no spell path moved)", () => {
    expect(parse(BOARD_COND).confidence).toBe("high");
    expect(parse(BOARD_COND, { sourceScoped: true }).confidence).toBe("high");
  });

  it("⛔ CREED — a condition outside EVERY vocabulary still parks, even source-scoped", () => {
    expect(parse("draw a card if you control a creature named Bob and it is raining", { sourceScoped: true }).confidence).toBe("low");
  });
});

describe("the sequenced 'Then if' form", () => {
  it("⭐ 'A. Then if COND, B.' composes — the connective was the only gap", () => {
    // splitClauses already hands the second sentence over as "then if <cond>, <effect>"; peeling the
    // connective is all that was missing. No new condition machinery.
    const p = parse("double the number of +1/+1 counters on this creature. then if this creature has power 10 or greater, draw a card", { sourceScoped: true });
    expect(p.confidence).toBe("high");
    expect(p.atoms.map((a) => a.op)).toEqual(["add-counter", "draw"]);
    expect(p.atoms[1].condition).toBe("this creature has power 10 or greater");
  });

  it("the same shape with a BOARD condition works at spell scope (Hour of Promise's rider)", () => {
    const p = parse("draw a card. then if you control three or more deserts, draw a card");
    expect(p.confidence).toBe("high");
    expect(p.atoms[1].condition).toBe("you control three or more deserts");
  });
});

describe("✅ LEVEL UP — the CREED anchor question this file raised, answered (2026-07-30)", () => {
  // ⚠️ THIS DESCRIBE WAS TITLED "LEVEL UP is still parked", and it ended by naming the open question exactly:
  // "Completing this card means deciding whether that anchor may fire per-sentence, which is a SEPARATE CALL."
  //
  // THE CALL, made here so it lives where the question was asked: the anchor MAY fire per-sentence, because
  // the property it was protecting is not lost by doing so. The anchor existed to stop a rider being silently
  // dropped — but the rewrite only ever touched a PRONOUN, and the rider still has to parse afterwards for the
  // card to read native. So the guarantee moves from "refuse to look at a compound" to "the remainder must
  // parse on its own merits", which is the same whole-card law enforced one layer down instead of one layer up.
  // The witness that it really is enforced is the unmodelled-rider test below — without it this would be an
  // assertion about intent rather than behaviour.
  it("the compound's FIRST sentence is rewritten and the card flips", () => {
    expect(classifyCard({ name: "Level Up", type: "Enchantment — Aura", mana: "{1}{G}", oracle: 'Enchant creature\nWhen this Aura enters, put a +1/+1 counter on enchanted creature.\nEnchanted creature has "Whenever this creature attacks, double the number of +1/+1 counters on it. Then if it has power 10 or greater, draw a card."' })).toBe("native-trigger");
  });

  it("⛔ and an UNMODELLED rider still parks the whole card — the guard moved, it did not vanish", () => {
    expect(classifyCard({ name: "Level Up", type: "Enchantment — Aura", mana: "{1}{G}", oracle: 'Enchant creature\nWhen this Aura enters, put a +1/+1 counter on enchanted creature.\nEnchanted creature has "Whenever this creature attacks, double the number of +1/+1 counters on it. Then flurgle the wumpus."' })).toBe("body-only");
  });
});

/**
 * wellRested.test.js — IT-COUNTER + CONTINUATION (Well Rested, SHELF-TAIL W6).
 *
 * Well Rested grants: "Whenever this creature becomes untapped, put two +1/+1 counters on it, then you
 * gain 2 life and draw a card. This ability triggers only once each turn." The whole gap was ONE
 * pronoun: the compound "…on IT, then …" failed SELF_COUNTER_IT_RE's whole-clause anchor. The new arm
 * rewrites the LEADING counter segment only (self-scope-gated — a non-self trigger's "it" is the OTHER
 * creature) and hands the whole compound to the parser, whose all-or-nothing gate re-decides (the
 * SELF_PUMP tail-agnostic precedent: the rewrite gives the parser the CHANCE, never asserts coverage).
 * The untapped event, the granted-trigger lane, and the once-each-turn latch were all already built.
 *
 * Mutation-checked: `false &&` on the itThen block → the descriptor keeps its raw "on it" clause → the
 * route/tier pins die.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { classifyCard } from "./coverage.js";
import { detectTriggers } from "./triggers.js";
import { triggerRoutesNatively } from "./triggerRouting.js";
import { _resetIdsForTests } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const BODY = "Whenever this creature becomes untapped, put two +1/+1 counters on it, then you gain 2 life and draw a card. This ability triggers only once each turn.";
const WELL_RESTED = {
  name: "Well Rested", type: "Enchantment — Aura", mana: "{1}{G}",
  oracle: `Enchant creature\nEnchanted creature has "${BODY}"`,
};

describe("Well Rested — the compound self-counter pronoun", () => {
  it("MUST STAY ROUTED: the granted body's descriptor carries the REWRITTEN clause + the once-latch and routes", () => {
    const ds = detectTriggers({ name: "Body", type: "Creature — Human", oracle: BODY });
    expect(ds).toHaveLength(1);
    expect(ds[0]).toMatchObject({ event: "untapped", scope: "self", oncePerTurnTrigger: true });
    expect(ds[0].effectClause).toBe("put two +1/+1 counters on this creature, then you gain 2 life and draw a card");
    expect(triggerRoutesNatively(ds[0])).toBe(true);
  });
  it("the AURA classifies native-trigger through the granted lane", () => {
    expect(classifyCard(WELL_RESTED)).toBe("native-trigger");
  });
  it("CREED guards: the watcher form stays undetected; a bare rider-compound keeps its raw pronoun path honest", () => {
    // Non-self subject — the Inspired arm is SELF-ONLY, so the "it" referent question never arises.
    expect(detectTriggers({ name: "W", type: "Creature — Human", oracle: "Whenever a creature you control becomes untapped, put two +1/+1 counters on it, then you gain 2 life." })).toHaveLength(0);
    // A "." rider (not ", then") still fails the whole-clause anchor AND this arm — stays LOW.
    const dot = detectTriggers({ name: "D", type: "Creature — Human", oracle: "Whenever this creature becomes untapped, put two +1/+1 counters on it. Destroy target artifact." });
    expect(dot).toHaveLength(1);
    expect(dot[0].effectClause.startsWith("put two +1/+1 counters on it.")).toBe(true); // unrewritten — the parser re-gates it LOW
  });
});

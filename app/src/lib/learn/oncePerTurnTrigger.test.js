/**
 * oncePerTurnTrigger.test.js — ONCE-PER-TURN TRIGGER latch (SHELF M1a, Mirelurk Queen).
 *
 * "This ability triggers only once each turn." limits the TRIGGERING itself — the descriptor is
 * stripped of the sentence + stamped oncePerTurnTrigger, and flushTriggers enforces the latch
 * (state.onceTriggersFiredThisTurn, per source+event key, cleared each untap step).
 *
 * Covers: descriptor detection (strip + stamp), the flush latch (second same-turn firing dropped
 * with a distinct log), the untap-step reset, and the MACH-1 compound guard (a compound trigger
 * with the limiter is NOT stripped — the halves would need a shared latch → stays Arbiter, CREED).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { detectTriggers, checkMilledTriggers } from "./triggers.js";
import { flushTriggers, chooseTriggerTargets } from "./gameEngine.js";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const MIRELURK = {
  name: "Mirelurk Queen", type: "Creature — Mutant Crab", power: 4, toughness: 6,
  oracle: "Vigilance\nWhen this creature enters, target player gets two rad counters.\nWhenever one or more nonland cards are milled, draw a card, then put a +1/+1 counter on this creature. This ability triggers only once each turn.",
};
const MACH1 = {
  name: "MACH-1, Swooping Scoundrel", type: "Legendary Creature — Bird", power: 2, toughness: 2,
  oracle: "Flying\nWhen MACH-1 enters and whenever you gain life, surveil 1. This ability triggers only once each turn.",
};

describe("ONCE-PER-TURN TRIGGER — detection", () => {
  it("Mirelurk Queen: the limiter is stripped and the descriptor stamped", () => {
    const d = detectTriggers(MIRELURK).find((x) => x.event === "milled");
    expect(d.oncePerTurnTrigger).toBe(true);
    expect(d.effectClause).toBe("draw a card, then put a +1/+1 counter on this creature");
  });

  it("COMPOUND GUARD (MACH-1): a compound trigger with the limiter is NOT stripped → stays off the native tier", () => {
    const ds = detectTriggers(MACH1);
    expect(ds.some((d) => d.oncePerTurnTrigger)).toBe(false);
    expect(classifyCard(MACH1)).toBe("body-only");
  });
});

describe("ONCE-PER-TURN TRIGGER — flush latch", () => {
  function mirelurkState() {
    const s0 = createGameState({ userDeck: [], aiDeck: [] });
    const queen = createPermanent({ id: "queen", card: MIRELURK, controller: "user" });
    return {
      ...s0,
      players: {
        ...s0.players,
        user: { ...s0.players.user, battlefield: [queen], library: [{ id: "l1", name: "A" }, { id: "l2", name: "B" }] },
      },
    };
  }
  const millEvent = (s) => checkMilledTriggers(s, { milledByPlayer: "user", milledCards: [{ id: "x", name: "Bolt", type: "Instant" }] });

  it("fires once, latches the second same-turn event, resets at a new turn", () => {
    let s = mirelurkState();
    // First mill event → trigger enqueued + flushed onto the stack.
    s = flushTriggers(millEvent(s), { chooseTargets: chooseTriggerTargets });
    expect((s.stack || []).length).toBe(1);
    // Second mill event the same turn → the trigger is dropped by the latch, logged distinctly.
    s = flushTriggers(millEvent({ ...s, stack: [] }), { chooseTargets: chooseTriggerTargets });
    expect((s.stack || []).length).toBe(0);
    expect((s.log || []).some((e) => e.kind === "trigger-once-per-turn-latched")).toBe(true);
    // New turn (the untap step clears the ledger) → it fires again.
    s = { ...s, stack: [], onceTriggersFiredThisTurn: {} };
    s = flushTriggers(millEvent(s), { chooseTargets: chooseTriggerTargets });
    expect((s.stack || []).length).toBe(1);
  });
});

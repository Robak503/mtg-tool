/**
 * delayedTrigger.test.js — DELAYED TRIGGERED ABILITIES (CR 603.7), the census's biggest lever
 * (679 real carriers, 589 non-native at build time; the engine had no scheduler at all).
 *
 * A resolving spell/ability schedules an ability for a future step; the scheduler stores a plain-JSON
 * record on state.delayedTriggers and gameEngine drains matching records at STEP ENTRY into
 * pendingTriggers — so the fired ability rides the SAME flush→stack→resolve pipeline as any printed
 * trigger. Draining removes the record (CR 603.7: fires once, then ceases to exist).
 *
 * The tests below cover BOTH halves the runbook demands: the parse/classify surface AND the runtime
 * (a scheduled draw actually draws, at the right step, exactly once, for the right player).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { parseEffectClause, programConfidence } from "./effects/parser.js";
import { applyScheduleDelayed, drainDelayedTriggers } from "./effects/atoms/delayedTrigger.js";
import { classifyCard } from "./coverage.js";
import { advanceStep, runStepActions, flushTriggers, resolveTopOfStack } from "./gameEngine.js";
import { _resetIdsForTests, createGameState } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const lib = (n) => Array.from({ length: n }, (_, i) => ({ id: `lib-${i}`, name: `Card${i}`, type: "Instant" }));
function baseState(over = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...s,
    activePlayer: "user",
    players: { ...s.players, user: { ...s.players.user, library: lib(6), hand: [] }, ai: { ...s.players.ai, library: lib(6), hand: [] } },
    ...over,
  };
}
const resolveAll = (s) => { while (s.stack.length) s = resolveTopOfStack(s); return s; };
const handIds = (s, pid = "user") => s.players[pid].hand.map((c) => c.id);

describe("parse — the timing vocabulary + the CREED inner-clause gate", () => {
  const atomOf = (clause) => parseEffectClause(clause, "Instant").atoms[0];
  it("TRAIL form (the 40-carrier Heal/Bone Harvest shape) → upkeep/any", () => {
    expect(atomOf("Draw a card at the beginning of the next turn's upkeep.")).toMatchObject({
      op: "schedule-delayed", fireStep: "upkeep", fireScope: "any", delayedClause: "Draw a card",
    });
  });
  it("LEAD form → end/any (the blink/sacrifice family's timing)", () => {
    expect(atomOf("At the beginning of the next end step, draw a card.")).toMatchObject({
      op: "schedule-delayed", fireStep: "end", fireScope: "any",
    });
  });
  it("'your next upkeep' → yours scope (the Pact cycle's timing)", () => {
    expect(atomOf("At the beginning of your next upkeep, draw two cards.")).toMatchObject({
      op: "schedule-delayed", fireStep: "upkeep", fireScope: "yours",
    });
  });
  it("CREED: an UNPARSEABLE inner clause keeps the whole thing LOW — a scheduled ability can never fire an unmodeled effect", () => {
    const p = parseEffectClause("At the beginning of the next end step, glorbulate the frobnitz.", "Instant");
    expect(programConfidence(p)).toBe("low");
    expect(p.atoms).toHaveLength(0);
  });
  it("CREED: an UNSUPPORTED timing (cleanup — no priority window, CR 514) stays LOW", () => {
    expect(programConfidence(parseEffectClause("Draw a card at the beginning of the next turn's cleanup step.", "Instant"))).toBe("low");
  });
  it("ONLY THE FINAL SENTENCE IS DELAYED — the immediate half still resolves now (resolution-order FP guard)", () => {
    // The first draft of the trail matcher captured greedily and deferred the IMMEDIATE effect too.
    // Ideas Unbound must draw NOW and discard later; the pump case must pump NOW and draw later.
    // Caught by parser.test.js's MUST_DROP_TO_LOW pin before it could ship — pinned positively here.
    const ideas = parseEffectClause("Draw three cards. Discard three cards at the beginning of the next end step.", "Instant");
    expect(programConfidence(ideas)).toBe("high");
    expect(ideas.atoms.map((a) => a.op)).toEqual(["draw", "schedule-delayed"]);
    expect(ideas.atoms[1].delayedClause).toBe("Discard three cards");

    const pump = parseEffectClause("Target creature gets +2/+0 until end of turn. Draw a card at the beginning of the next turn's upkeep.", "Instant");
    expect(pump.atoms.map((a) => a.op)).toEqual(["pump", "schedule-delayed"]);
    expect(pump.atoms[1].delayedClause).toBe("Draw a card");
  });
  it("ALL-OR-NOTHING: an unmodeled IMMEDIATE half drops the whole program (no half-resolution)", () => {
    const p = parseEffectClause("Glorbulate the frobnitz. Draw a card at the beginning of the next turn's upkeep.", "Instant");
    expect(programConfidence(p)).toBe("low");
    expect(p.atoms).toHaveLength(0);
  });
  it("a pure delayed-draw spell classifies native; a carrier whose OTHER half is unmodeled still parks (whole-card law)", () => {
    expect(classifyCard({ name: "SynthDraw", type: "Sorcery", mana: "{1}{U}", oracle: "Draw a card at the beginning of the next turn's upkeep." })).toBe("native-spell");
    // ⚠️ FIXTURE REPLACED TWICE ON 2026-08-05, and the history is the point. It first read "Bone Harvest …
    // put up to THREE target creature cards", which is not what that card prints — the real one says "ANY
    // NUMBER OF", and it's an Instant. Modelling the up-to-N wording turned the pin red and exposed the
    // invented text; modelling "any number of" an hour later turned the corrected fixture red too, because
    // Bone Harvest is now fully native. **A card used as an "unmodelled half" fixture is a MOVING TARGET —
    // the grind's whole job is to model it.** Gravebind is the current stand-in (its "can't be regenerated
    // this turn" half is unmodelled); when this goes red again, that is the grind working, and the fix is to
    // re-probe the corpus for a card that still parks — never to invent one.
    expect(classifyCard({ name: "Gravebind", type: "Instant", mana: "{B}", oracle: "Target creature can't be regenerated this turn.\nDraw a card at the beginning of the next turn's upkeep." })).not.toMatch(/^native/);
  });
});

describe("scheduler — records queue and drain per CR 603.7", () => {
  const schedule = (s, over = {}) => applyScheduleDelayed(s, { op: "schedule-delayed", fireStep: "upkeep", fireScope: "any", delayedClause: "draw a card", ...over }, { controller: "user", cardName: "Probe" });

  it("scheduling queues one plain-JSON record (serialize-safe)", () => {
    const s = schedule(baseState());
    expect(s.delayedTriggers).toHaveLength(1);
    expect(s.delayedTriggers[0]).toMatchObject({ controller: "user", fireStep: "upkeep", fireScope: "any", effectClause: "draw a card" });
    expect(JSON.parse(JSON.stringify(s.delayedTriggers))).toEqual(s.delayedTriggers); // round-trips
  });

  it("drains ONLY on a matching step, and the record is REMOVED once fired (fires once, then ceases)", () => {
    const s = schedule(baseState());
    const wrongStep = drainDelayedTriggers(s, "end", "user");
    expect(wrongStep.fired).toHaveLength(0);
    expect(wrongStep.state.delayedTriggers).toHaveLength(1); // still queued

    const right = drainDelayedTriggers(s, "upkeep", "user");
    expect(right.fired).toHaveLength(1);
    expect(right.fired[0]).toMatchObject({ event: "delayed", controller: "user" });
    expect(right.fired[0].descriptor.effectClause).toBe("draw a card");
    expect(right.state.delayedTriggers).toHaveLength(0); // CR 603.7 — ceased to exist

    // …and a second drain of the SAME step fires nothing (no double-fire).
    expect(drainDelayedTriggers(right.state, "upkeep", "user").fired).toHaveLength(0);
  });

  it("'yours' scope waits for the CONTROLLER's own step; 'any' fires on whoever's step comes first", () => {
    const yours = schedule(baseState(), { fireScope: "yours" });
    expect(drainDelayedTriggers(yours, "upkeep", "ai").fired).toHaveLength(0);   // opponent's upkeep — not yours
    expect(drainDelayedTriggers(yours, "upkeep", "user").fired).toHaveLength(1); // your upkeep — fires
    const any = schedule(baseState(), { fireScope: "any" });
    expect(drainDelayedTriggers(any, "upkeep", "ai").fired).toHaveLength(1);     // the very next upkeep, whoever's
  });

  it("an ELIMINATED controller's record is dropped, not stranded, and fires nothing (CR 800.4a)", () => {
    const s = schedule(baseState());
    const gone = { ...s, players: { ai: s.players.ai } }; // user left the game
    const out = drainDelayedTriggers(gone, "upkeep", "ai");
    expect(out.fired).toHaveLength(0);
    expect(out.state.delayedTriggers).toHaveLength(0);
  });

  it("scheduling with an empty clause is a clean no-op — never a fabricated firing", () => {
    expect(schedule(baseState(), { delayedClause: "" }).delayedTriggers || []).toHaveLength(0);
  });
});

describe("RUNTIME — the scheduled ability actually fires and resolves at the right step", () => {
  function scheduleOnBoard(over = {}) {
    return applyScheduleDelayed(baseState(), { op: "schedule-delayed", fireStep: "upkeep", fireScope: "any", delayedClause: "draw a card", ...over }, { controller: "user", cardName: "Probe" });
  }

  it("a delayed draw scheduled on turn N draws at the NEXT upkeep — end to end through the real engine", () => {
    let s = { ...scheduleOnBoard(), phase: "beginning", step: "untap" };
    expect(handIds(s)).toHaveLength(0);
    // Walk to the upkeep: the engine drains the record into pendingTriggers at step entry.
    s = runStepActions(advanceStep(s));
    expect(s.step).toBe("upkeep");
    expect(s.delayedTriggers).toHaveLength(0);                 // drained
    s = resolveAll(flushTriggers(s));
    expect(handIds(s)).toHaveLength(1);                        // …and it really drew
  });

  it("it does NOT fire at a non-matching step (an end-step record is untouched by the upkeep entry)", () => {
    let s = { ...scheduleOnBoard({ fireStep: "end" }), phase: "beginning", step: "untap" };
    s = runStepActions(advanceStep(s));
    expect(s.step).toBe("upkeep");
    expect(s.delayedTriggers).toHaveLength(1);                 // still queued for the end step
    expect(handIds(s)).toHaveLength(0);
  });

  it("it fires exactly ONCE across a full turn cycle (counted at the DELAYED-trigger layer, not raw hand size)", () => {
    // NOTE: assert on delayed FIRINGS, not hand count — walking a full turn passes the turn-based
    // draw step, which legitimately draws. (This test's first draft counted cards and "failed"
    // against a correct engine; the diagnostic showed turn 1's draw step was the extra card. Same
    // wrong-assertion-layer trap the runbook's failure table lists — measure the thing you claim.)
    let s = { ...scheduleOnBoard(), phase: "beginning", step: "untap" };
    let delayedFirings = 0;
    for (let i = 0; i < 40 && s.turn <= 2; i++) {
      s = runStepActions(advanceStep(s));
      delayedFirings += (s.stack || []).filter((e) => e.kind === "triggered-ability" && e.source?.name === "Probe").length;
      delayedFirings += (s.pendingTriggers || []).filter((t) => t.descriptor?.event === "delayed").length;
      s = resolveAll(flushTriggers(s));
    }
    expect(delayedFirings).toBe(1);                 // exactly one firing across two full turns
    expect(s.delayedTriggers).toHaveLength(0);      // and the record never came back
  });
});

/**
 * delayedBlink.test.js — DELAYED-RETURN BLINK (SHELF-TAIL SH14 — Otherworldly Journey, Long Road Home;
 * CR 400.7 + 603.7). "Exile target creature. At the beginning of the next end step, return that card to the
 * battlefield under its owner's control with a +1/+1 counter on it." The delayed twin of the immediate blink
 * (blinkFlicker.test.js): the creature is exiled NOW, and its return is scheduled on the CR 603.7 delayed
 * queue as a `[blink-return <cardId> <ownerId> <counter|plain>]` SENTINEL, firing at the NEXT end step and
 * re-entering FROM EXILE (a NEW object) with a +1/+1 counter. Mirrors cz-commander-visit's fetch+schedule
 * shape (Hellkite Courser). Flip +2/0/0 (both identical cards). Foundation for the 84-card delayed-blink vein.
 *
 * Mutation-checked (via Edit): (1) neuter matchDelayedBlink → both cards arbiter-spell (parse + classify die);
 * (2) neuter the withCounter branch in applyBlinkReturn → the returned creature has no counter (runtime pin
 * dies); (3) neuter the schedule in applyDelayedBlink → nothing is queued, nothing returns (the whole delayed
 * chain dies).
 */
import { describe, it, expect, beforeEach } from "vitest";
import { classifyCard } from "./coverage.js";
import { parseEffectClause, programConfidence } from "./effects/parser.js";
import { atomTargetIntent } from "./effects/programQueries.js";
import { applyDelayedBlink, applyBlinkReturn } from "./effects/atoms/zones.js";
import { drainDelayedTriggers } from "./effects/atoms/delayedTrigger.js";
import { createGameState, _resetIdsForTests } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const ORACLE = "Exile target creature. At the beginning of the next end step, return that card to the battlefield under its owner's control with a +1/+1 counter on it.";
const DBLINK_ATOM = { op: "delayed-blink", targetType: "creature", withCounter: true };

function boardWith(card, controller = "user") {
  const s0 = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
  return { ...s0, players: { ...s0.players, [controller]: { ...s0.players[controller], battlefield: [{ id: "p1", controller, owner: controller, card, counters: {}, summoningSick: false }] } } };
}
const beast = () => ({ id: "card-x", name: "Beast", type: "Creature — Beast", power: 3, toughness: 3, oracle: "" });
const blink = (s) => applyDelayedBlink(s, DBLINK_ATOM, { controller: "user", targets: [{ type: "creature", id: "p1" }] });

describe("parse + classify + intent", () => {
  it("the two-sentence exile + delayed return collapses to ONE delayed-blink atom; both cards flip native-spell", () => {
    const p = parseEffectClause(ORACLE, "Instant");
    expect(programConfidence(p)).toBe("high");
    expect(p.atoms).toEqual([DBLINK_ATOM]);
    expect(classifyCard({ name: "Otherworldly Journey", type: "Instant", mana: "{1}{W}", oracle: ORACLE })).toBe("native-spell");
    expect(classifyCard({ name: "Long Road Home", type: "Instant", mana: "{1}{W}", oracle: ORACLE })).toBe("native-spell");
  });
  it("intent is 'own' — the rational use protects+grows YOUR creature, never gifts an opponent a counter", () => {
    expect(atomTargetIntent(DBLINK_ATOM)).toBe("own");
  });
  it("CREED gate — a variant without the +1/+1 counter is not this atom → LOW → Arbiter", () => {
    expect(programConfidence(parseEffectClause("Exile target creature. At the beginning of the next end step, return that card to the battlefield under its owner's control.", "Instant"))).toBe("low");
  });
  it("the sentinel round-trips (ids case-preserved)", () => {
    expect(parseEffectClause("[blink-return Card-X ai1 plain]", "Instant").atoms[0]).toMatchObject({ op: "blink-return", cardId: "Card-X", ownerId: "ai1", withCounter: false });
  });
});

describe("RUNTIME — the delayed chain (CREED core)", () => {
  it("delayed-blink exiles NOW and schedules the return for the end step (not before)", () => {
    const s = blink(boardWith(beast()));
    expect(s.players.user.battlefield).toHaveLength(0);
    expect((s.players.user.exile || []).map((c) => c.id)).toContain("card-x");
    expect(s.delayedTriggers).toHaveLength(1);
    expect(s.delayedTriggers[0]).toMatchObject({ fireStep: "end", effectClause: "[blink-return card-x user counter]" });
    // it does NOT fire at upkeep — only at end
    expect(drainDelayedTriggers(s, "upkeep", "user").fired).toHaveLength(0);
    expect(drainDelayedTriggers(s, "end", "user").fired).toHaveLength(1);
  });
  it("at the end step the card returns as a NEW object with a +1/+1 counter", () => {
    let s = blink(boardWith(beast()));
    const rec = s.delayedTriggers[0];
    const m = rec.effectClause.match(/^\[blink-return (\S+) (\S+) (\S+)\]$/);
    s = applyBlinkReturn(s, { op: "blink-return", cardId: m[1], ownerId: m[2], withCounter: m[3] === "counter" }, { controller: "user" });
    const bf = s.players.user.battlefield;
    expect(bf).toHaveLength(1);
    expect(bf[0].id).not.toBe("p1");                  // CR 400.7 — a new object
    expect(bf[0].card.name).toBe("Beast");
    expect(bf[0].counters["+1/+1"]).toBe(1);
  });
  it("a PLAIN return (no counter) adds nothing", () => {
    const s = applyBlinkReturn({ ...boardWith(beast()), players: { user: { battlefield: [], exile: [beast()] } } },
      { op: "blink-return", cardId: "card-x", ownerId: "user", withCounter: false }, { controller: "user" });
    expect((s.players.user.battlefield[0].counters || {})["+1/+1"] || 0).toBe(0);
  });
  it("a target gone before the exile resolves is a clean no-op (CR 608.2b)", () => {
    const s = applyDelayedBlink(boardWith(beast()), DBLINK_ATOM, { controller: "user", targets: [{ type: "creature", id: "gone" }] });
    expect(s.players.user.battlefield).toHaveLength(1);   // untouched
    expect(s.delayedTriggers || []).toHaveLength(0);      // nothing scheduled
  });
});

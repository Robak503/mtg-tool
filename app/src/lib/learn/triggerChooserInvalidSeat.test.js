/**
 * triggerChooserInvalidSeat.test.js — gameEngine.chooseTriggerTargets must SURFACE a corrupted controller seat, never
 * swallow it (2026-09-30).
 *
 * The α1 chooser wrapped its opponentsOf call in `catch { return undefined; }`. buildTriggerStack reads an undefined pick
 * as "no preference" and falls back to firstLegalChoice — so a trigger whose controller id had been corrupted would take
 * its FIRST legal target whatever side it sat on: a removal trigger could hit the controller's own permanent, the exact
 * friendly fire the chooser exists to prevent, with the error that caused it thrown away (CLAUDE.md §1.2). opponentsOf
 * throws on an invalid seat everywhere else in the engine; the chooser now lets it.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { chooseTriggerTargets, NO_SAFE_TARGET } from "./gameEngine.js";
import { parseEffectClause } from "./effects/parser.js";

beforeEach(() => _resetIdsForTests());

function setup() {
  const g = createGameState({ userDeck: [], aiDeck: [] });
  const mine = createPermanent({ id: "MINE", controller: "user", summoningSick: false,
    card: { id: "c-MINE", name: "My Bear", type: "Creature — Bear", power: "2", toughness: "2", oracle: "" } });
  const theirs = createPermanent({ id: "THEIRS", controller: "ai", summoningSick: false,
    card: { id: "c-THEIRS", name: "Their Bear", type: "Creature — Bear", power: "2", toughness: "2", oracle: "" } });
  const s = { ...g, players: { ...g.players, user: { ...g.players.user, battlefield: [mine] }, ai: { ...g.players.ai, battlefield: [theirs] } } };
  const program = parseEffectClause("destroy target creature", "Instant", { hasX: false });
  // The friendly candidate FIRST — exactly what a first-legal fallback would take.
  const candidates = [
    { targets: [{ type: "creature", id: "MINE", controller: "user", atomIndex: 0 }] },
    { targets: [{ type: "creature", id: "THEIRS", controller: "ai", atomIndex: 0 }] },
  ];
  return { s, program, candidates };
}

describe("the chooser surfaces a corrupted seat", () => {
  it("CONTROL — a valid seat aims the removal at the opponent's creature, never its own", () => {
    const { s, program, candidates } = setup();
    const pick = chooseTriggerTargets(candidates, { state: s, trigger: { controller: "user" }, program });
    expect(pick?.targets?.[0]?.id).toBe("THEIRS");
  });

  it("⛔ an invalid controller seat THROWS — it never returns the undefined that first-legals the friendly creature", () => {
    const { s, program, candidates } = setup();
    expect(() => chooseTriggerTargets(candidates, { state: s, trigger: { controller: "nobody" }, program })).toThrow(/Invalid playerId/);
  });

  it("the documented soft answers are untouched: no state / no controller / no candidates → undefined; no safe side → NO_SAFE_TARGET", () => {
    const { s, program, candidates } = setup();
    expect(chooseTriggerTargets(candidates, { trigger: { controller: "user" }, program })).toBeUndefined();
    expect(chooseTriggerTargets(candidates, { state: s, trigger: {}, program })).toBeUndefined();
    expect(chooseTriggerTargets([], { state: s, trigger: { controller: "user" }, program })).toBeUndefined();
    expect(chooseTriggerTargets([candidates[0]], { state: s, trigger: { controller: "user" }, program })).toBe(NO_SAFE_TARGET);
  });
});

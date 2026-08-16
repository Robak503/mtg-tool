/**
 * delayedBlinkMass.test.js — DELAYED-BLINK, the MASS forms (SHELF-TAIL SH16 — Eerie Interlude, Ghostway).
 * Two more widens off the SH14 machinery, both exiling a WHOLE set of your creatures and returning each at the
 * next end step:
 *   • Eerie Interlude — "Exile ANY NUMBER of target creatures you control. Return those cards …" (a targeted
 *     any-number selection: maxTargets 999 / anyNumber, the same fill the graveyard any-number arm uses).
 *   • Ghostway — "Exile EACH creature you control. Return those cards …" (NON-targeted mass: applyDelayedBlink's
 *     eachYouControl mode enumerates the controller's creatures at resolution, lands excluded).
 * applyDelayedBlink already loops, scheduling one [blink-return] per card — so both are targeting/enumeration
 * widens, not new resolution. Flip +2/0/0. (A token exiled by Ghostway ceases to exist, CR 111.7, so its
 * scheduled return no-ops — the classic board-wipe dodge, faithful.)
 *
 * Mutation-checked (via Edit): (1) neuter the any-number matcher arm → Eerie Interlude arbiter-spell (its
 * parse + classify pins die); (2) neuter the eachYouControl enumeration in applyDelayedBlink → Ghostway exiles
 * nothing (the mass runtime pin dies — a native flip with a hollow resolution).
 */
import { describe, it, expect, beforeEach } from "vitest";
import { classifyCard } from "./coverage.js";
import { parseEffectClause, programConfidence } from "./effects/parser.js";
import { applyDelayedBlink } from "./effects/atoms/zones.js";
import { createGameState, _resetIdsForTests } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const EERIE = "Exile any number of target creatures you control. Return those cards to the battlefield under their owner's control at the beginning of the next end step.";
const GHOSTWAY = "Exile each creature you control. Return those cards to the battlefield under their owner's control at the beginning of the next end step.";

const creature = (id, controller = "user") => ({ id, controller, owner: controller, card: { id: `c-${id}`, name: id, type: "Creature — Bear", power: 2, toughness: 2, oracle: "" }, counters: {}, summoningSick: false });
const land = (id) => ({ id, controller: "user", owner: "user", card: { id: `c-${id}`, name: id, type: "Basic Land — Forest", oracle: "" }, counters: {}, summoningSick: false });
function board(userBf, aiBf = []) {
  const s0 = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
  return { ...s0, players: { ...s0.players, user: { ...s0.players.user, battlefield: userBf }, ai1: { ...s0.players.ai1, battlefield: aiBf } } };
}

describe("SH16 — parse + classify", () => {
  it("the any-number mass form parses to a bounded any-number delayed-blink; Eerie Interlude is native-spell", () => {
    const p = parseEffectClause(EERIE, "Instant");
    expect(programConfidence(p)).toBe("high");
    expect(p.atoms[0]).toMatchObject({ op: "delayed-blink", targetType: "creature", withCounter: false, maxTargets: 999, minTargets: 0, anyNumber: true });
    expect(classifyCard({ name: "Eerie Interlude", type: "Instant", mana: "{1}{W}", oracle: EERIE })).toBe("native-spell");
  });
  it("the each-you-control mass form parses to an eachYouControl delayed-blink; Ghostway is native-spell", () => {
    expect(parseEffectClause(GHOSTWAY, "Instant").atoms[0]).toMatchObject({ op: "delayed-blink", eachYouControl: true, withCounter: false });
    expect(classifyCard({ name: "Ghostway", type: "Instant", mana: "{2}{W}" , oracle: GHOSTWAY })).toBe("native-spell");
  });
});

describe("SH16 — RUNTIME (CREED core)", () => {
  it("Eerie Interlude exiles the CHOSEN targets and schedules one return each", () => {
    const s = applyDelayedBlink(board([creature("a"), creature("b"), creature("c")]),
      { op: "delayed-blink", withCounter: false }, { controller: "user", targets: [{ type: "creature", id: "a" }, { type: "creature", id: "b" }] });
    expect(s.players.user.battlefield.map((p) => p.id)).toEqual(["c"]);   // only the two chosen left
    expect(s.delayedTriggers).toHaveLength(2);
  });
  it("Ghostway exiles ALL your creatures (lands untouched, opponents untouched) and schedules each", () => {
    const s = applyDelayedBlink(board([creature("a"), creature("b"), land("forest")], [creature("foe", "ai1")]),
      { op: "delayed-blink", withCounter: false, eachYouControl: true }, { controller: "user", targets: [] });
    expect(s.players.user.battlefield.map((p) => p.id)).toEqual(["forest"]); // creatures gone, land stays
    expect(s.players.ai1.battlefield.map((p) => p.id)).toEqual(["foe"]);     // opponent's creature untouched
    expect(s.delayedTriggers).toHaveLength(2);
  });
});

/**
 * scythecatCub.test.js — SHELF-85 runbook V10 (2026-09-04): Scythecat Cub (Shalai) and the four twins the flip-diff
 * surfaced on the same word (Rumor Gatherer, Harvestrite Host, Tannuk, Memorial Ensign, South Pole Voyager).
 *
 *   "Trample
 *    Landfall — Whenever a land you control enters, put a +1/+1 counter on target creature you control. If this is
 *    the second time this ability has resolved this turn, double the number of +1/+1 counters on that creature instead."
 *
 * The park said "inexpressible"; it was three cells:
 *   ① a per-turn LEDGER — `abilityResolutionsThisTurn`, keyed by source permanent + printed sentence (the flush stamps
 *     the key into every triggered ability's context), bumped in resolveTopOfStack AFTER the resolver ran — so during
 *     a resolution the count is the number of PRIOR resolutions this turn ("second time" = exactly one);
 *   ② the intervening-if word, read through ctx.abilityKey (no key — a spell, the parse-time probe — → false, the
 *     FN-safe side, and decidable at parse time);
 *   ③ a TARGETED conditional: the branch node carries the base's chosen targetType so the trigger picks ONE creature
 *     both branches read from the same ctx, and the alternative's "that creature" is rewritten to a sentinel phrase
 *     (printed nowhere) that the counter arm binds to that chosen target — a standalone "…on that creature" never parses.
 *
 * Real oracle fixtures (bundled Scryfall snapshot, verified in-session 2026-09-04).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { parseEffectClause } from "./effects/parser.js";
import { evaluateInterveningIf, interveningIfParseable } from "./interveningIf.js";
import { dispatchAction } from "./actionDispatcher.js";
import { flushTriggers, resolveTopOfStack, chooseTriggerTargets } from "./gameEngine.js";
import { classifyCard } from "./coverage.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const CUB = { id: "c-cub", name: "Scythecat Cub", type: "Creature — Cat", mana: "{1}{G}", power: 2, toughness: 2, keywords: ["Trample"],
  oracle: "Trample\nLandfall — Whenever a land you control enters, put a +1/+1 counter on target creature you control. If this is the second time this ability has resolved this turn, double the number of +1/+1 counters on that creature instead." };
const RUMOR_GATHERER = { id: "c-rg", name: "Rumor Gatherer", type: "Creature — Elf Wizard", mana: "{1}{W}{W}", power: 2, toughness: 3, keywords: [],
  oracle: "Alliance — Whenever another creature you control enters, scry 1. If this is the second time this ability has resolved this turn, draw a card instead." };
const TANNUK = { id: "c-tan", name: "Tannuk, Memorial Ensign", type: "Legendary Creature — Kavu Pilot", mana: "{1}{R}{G}", power: 3, toughness: 3, keywords: [],
  oracle: "Landfall — Whenever a land you control enters, Tannuk deals 1 damage to each opponent. If this is the second time this ability has resolved this turn, draw a card." };
const COND = "this is the second time this ability has resolved this turn";
const EFFECT = "put a +1/+1 counter on target creature you control. If this is the second time this ability has resolved this turn, double the number of +1/+1 counters on that creature instead";

const forest = (id) => ({ id, name: "Forest", type: "Basic Land — Forest", oracle: "{T}: Add {G}." });
function board({ extraLands = 0 } = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return { ...s, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0, turn: 3,
    players: { ...s.players, user: { ...s.players.user, hand: [forest("f1"), forest("f2"), forest("f3")], extraLandsThisTurn: extraLands,
      battlefield: [{ ...createPermanent({ id: "CUB", card: CUB, controller: "user" }), summoningSick: false }] } } };
}
const playLand = (s, id) => dispatchAction(s, { kind: "play-land", playerId: "user", cardId: id, name: "Forest" });
const resolveAll = (s) => { while (s.stack.length) s = resolveTopOfStack(s); return s; };
const settle = (s) => resolveAll(flushTriggers(s, { chooseTargets: chooseTriggerTargets }));
const cubCounters = (s) => s.players.user.battlefield.find((p) => p.id === "CUB")?.counters?.["+1/+1"] || 0;

describe("② the intervening-if word", () => {
  it("is parseable, and false without a key or a ledger entry", () => {
    expect(interveningIfParseable(COND)).toBe(true);
    const s = board();
    expect(evaluateInterveningIf(s, COND, "user", {})).toBe(false);
    expect(evaluateInterveningIf(s, COND, "user", { abilityKey: "CUB:x" })).toBe(false);
  });
  it("reads exactly ONE prior resolution this turn on the key — not zero, not two, not last turn's", () => {
    const s = board();
    const withLedger = (n, turn = 3) => ({ ...s, abilityResolutionsThisTurn: { "CUB:x": { turn, n } } });
    expect(evaluateInterveningIf(withLedger(1), COND, "user", { abilityKey: "CUB:x" })).toBe(true);
    expect(evaluateInterveningIf(withLedger(0), COND, "user", { abilityKey: "CUB:x" })).toBe(false);
    expect(evaluateInterveningIf(withLedger(2), COND, "user", { abilityKey: "CUB:x" })).toBe(false);
    expect(evaluateInterveningIf(withLedger(1, 2), COND, "user", { abilityKey: "CUB:x" })).toBe(false);
  });
});

describe("③ the targeted conditional", () => {
  it("parses HIGH: the branch node carries the base's target; the alternative binds through the sentinel", () => {
    const p = parseEffectClause(EFFECT, "Instant");
    expect(p.confidence).toBe("high");
    expect(p.atoms).toEqual([{
      op: "conditional", branchOn: COND, targetType: "creatureYouControl",
      ifTrue: [{ op: "add-counter", counterType: "+1/+1", perTargetDouble: "+1/+1", targetType: "creature", chosenByBranch: true }],
      ifFalse: [{ op: "add-counter", counterType: "+1/+1", amount: 1, targetType: "creatureYouControl" }],
    }]);
  });
  it("CREED: a standalone 'that creature' double never parses (the sentinel is the only door)", () => {
    expect(parseEffectClause("double the number of +1/+1 counters on that creature.", "Instant").confidence).toBe("low");
  });
});

describe("① end to end — three land drops in one turn", () => {
  it("the first landfall adds one counter, the SECOND doubles, the THIRD adds one again", () => {
    let s = board({ extraLands: 2 });
    s = settle(playLand(s, "f1"));
    expect(cubCounters(s)).toBe(1);
    s = settle(playLand(s, "f2"));
    expect(cubCounters(s)).toBe(2);          // doubled (1 → 2), not 1 + 1 by coincidence — see the third drop
    s = settle(playLand(s, "f3"));
    expect(cubCounters(s)).toBe(3);          // the third resolution is not "the second time": +1
    expect(s.abilityResolutionsThisTurn[`CUB:${Object.keys(s.abilityResolutionsThisTurn)[0].split(":").slice(1).join(":")}`].n).toBe(3);
  });
  it("a doubled two becomes four on the second landfall (the double reads the live count, not +1)", () => {
    let s = board({ extraLands: 1 });
    s = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: s.players.user.battlefield.map((p) => (p.id === "CUB" ? { ...p, counters: { "+1/+1": 2 } } : p)) } } };
    s = settle(playLand(s, "f1"));
    expect(cubCounters(s)).toBe(3);
    s = settle(playLand(s, "f2"));
    expect(cubCounters(s)).toBe(6);
  });
  it("the ledger is per turn: a fresh turn's first landfall adds one again", () => {
    let s = board({ extraLands: 1 });
    s = settle(playLand(s, "f1"));
    s = settle(playLand(s, "f2"));
    expect(cubCounters(s)).toBe(2);
    s = { ...s, turn: 4, players: { ...s.players, user: { ...s.players.user, landsPlayedThisTurn: 0, extraLandsThisTurn: 0 } } };
    s = settle(playLand(s, "f3"));
    expect(cubCounters(s)).toBe(3);
  });
});

describe("classifier — whole cards", () => {
  it("Scythecat Cub, Rumor Gatherer and Tannuk are native-trigger", () => {
    expect(classifyCard(CUB)).toBe("native-trigger");
    expect(classifyCard(RUMOR_GATHERER)).toBe("native-trigger");
    expect(classifyCard(TANNUK)).toBe("native-trigger");
  });
});

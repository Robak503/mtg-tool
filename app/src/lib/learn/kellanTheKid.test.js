/**
 * kellanTheKid.test.js — Kellan, the Kid (SHELF S7): relational-cap free cast + else-land arm on the
 * cast-from-nonhand watcher event.
 *
 * "Whenever you cast a spell from anywhere other than your hand, you may cast a permanent spell with equal
 * or lesser mana value from your hand without paying its mana cost. If you don't, you may put a land card
 * from your hand onto the battlefield." Seams:
 *   1. checkCastTriggers now stamps ctx.castSpellMv (the cascade MV reader) on EVERY cast trigger's context
 *      — the relational "equal or lesser" cap reads it at resolution;
 *   2. matchFreeCastOrLand collapses the two-sentence branch into ONE free-cast atom (capFromCastMv +
 *      typeFilter "permanent" + elseLandFromHand);
 *   3. applyFreeCastAtom: relational cap + the whiff path runs the optional land put; the parked
 *      pendingFreeCast carries elseLandFromHand so DECLINING runs it too (actionDispatcher);
 *   4. a MISSING cap referent skips the free-cast half entirely (an uncapped free cast is the FP) — the
 *      land arm still fires (the printed fallback).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState } from "./gameState.js";
import { detectTriggers } from "./triggers.js";
import { triggerRoutesNatively } from "./triggerRouting.js";
import { parseEffectClause, programConfidence, programNeedsChosenTarget } from "./effects/parser.js";
import { classifyCard } from "./coverage.js";
import { applyFreeCastAtom, freeCastEligible } from "./effects/atoms/freeCast.js";

beforeEach(() => _resetIdsForTests());

// Real oracle text (bundled Scryfall data — never from memory).
const KELLAN_ORACLE =
  "Flying, lifelink\nWhenever you cast a spell from anywhere other than your hand, you may cast a permanent spell with equal or lesser mana value from your hand without paying its mana cost. If you don't, you may put a land card from your hand onto the battlefield.";
const kellanCard = (id = "kk-card") => ({
  id, name: "Kellan, the Kid", type: "Legendary Creature — Human Faerie Rogue",
  power: "3", toughness: "3", mana: "{G}{W}{U}", oracle: KELLAN_ORACLE,
});

const EFFECT =
  "you may cast a permanent spell with equal or lesser mana value from your hand without paying its mana cost. If you don't, you may put a land card from your hand onto the battlefield";

const ATOM = { op: "free-cast", capFromCastMv: true, typeFilter: "permanent", elseLandFromHand: true };

function baseState(over = {}) {
  const s = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
  return { ...s, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main", ...over };
}
function withHand(state, pid, hand) {
  return { ...state, players: { ...state.players, [pid]: { ...state.players[pid], hand } } };
}
const CREATURE_2 = { id: "c2", name: "Bear", type: "Creature — Bear", power: "2", toughness: "2", mana: "{1}{G}", cmc: 2, oracle: "" };
const CREATURE_5 = { id: "c5", name: "Big", type: "Creature — Giant", power: "5", toughness: "5", mana: "{4}{G}", cmc: 5, oracle: "" };
const INSTANT_1 = { id: "i1", name: "Trick", type: "Instant", mana: "{U}", cmc: 1, oracle: "" };
const LAND = { id: "l1", name: "Forest", type: "Basic Land — Forest", oracle: "" };

describe("detection + parse + classify", () => {
  it("the castNotFromHand watcher routes natively; the two-sentence effect collapses to ONE free-cast atom", () => {
    const [d] = detectTriggers(kellanCard()).filter((t) => t.event === "cast");
    expect(d.castNotFromHand).toBe(true);
    expect(triggerRoutesNatively(d)).toBe(true);
    const p = parseEffectClause(EFFECT, "Instant");
    expect(programConfidence(p)).toBe("high");
    expect(programNeedsChosenTarget(p)).toBe(false);
    expect(p.atoms).toEqual([{ op: "free-cast", capFromCastMv: true, typeFilter: "permanent", elseLandFromHand: true, targetType: null }]);
  });
  it("Kellan, the Kid → native-trigger", () => {
    expect(classifyCard(kellanCard())).toBe("native-trigger");
  });
});

describe("eligibility (typeFilter 'permanent')", () => {
  it("permanents pass; instants and lands never do", () => {
    expect(freeCastEligible(CREATURE_2, { maxMv: 3, typeFilter: "permanent" })).toBe(true);
    expect(freeCastEligible(INSTANT_1, { maxMv: 3, typeFilter: "permanent" })).toBe(false);
    expect(freeCastEligible(LAND, { maxMv: 3, typeFilter: "permanent" })).toBe(false);
  });
});

describe("resolver (CREED core)", () => {
  it("relational cap: parks ONLY hand permanents with MV ≤ the triggering cast's MV", () => {
    let s = baseState();
    s = withHand(s, "user", [CREATURE_2, CREATURE_5, INSTANT_1, LAND]);
    const after = applyFreeCastAtom(s, ATOM, { controller: "user", castSpellMv: 3 });
    expect(after.pendingFreeCast).toMatchObject({ controller: "user", candidateIds: ["c2"], elseLandFromHand: true });
  });

  it("whiff (no eligible permanent) → the else-land arm parks the hand-land tutor choice (battlefield destination)", () => {
    let s = baseState();
    s = withHand(s, "user", [CREATURE_5, LAND]); // the 5-drop is over the cap; the land isn't castable
    const after = applyFreeCastAtom(s, ATOM, { controller: "user", castSpellMv: 3 });
    expect(after.pendingFreeCast).toBeUndefined();
    // the Growth-Spiral machinery: the pick resolves at the action layer off this parked choice
    expect(after.pendingChoice).toMatchObject({
      kind: "tutor-search", controller: "user", sourceZone: "hand", destination: "battlefield",
      candidates: [{ id: "l1", name: "Forest" }],
    });
  });

  it("MISSING cap referent → the free-cast half is skipped (never an uncapped free cast); the land arm still parks", () => {
    let s = baseState();
    s = withHand(s, "user", [CREATURE_2, LAND]);
    const after = applyFreeCastAtom(s, ATOM, { controller: "user" }); // no castSpellMv
    expect(after.pendingFreeCast).toBeUndefined(); // c2 NOT parked despite being cheap
    expect(after.pendingChoice).toMatchObject({ kind: "tutor-search", sourceZone: "hand", destination: "battlefield" });
  });

  it("whiff with no land in hand → a clean no-op (no parked choice with zero candidates)", () => {
    let s = baseState();
    s = withHand(s, "user", [INSTANT_1]);
    const after = applyFreeCastAtom(s, ATOM, { controller: "user", castSpellMv: 3 });
    expect(after.pendingFreeCast).toBeUndefined();
    expect(after.players.user.battlefield).toEqual([]);
    expect((after.pendingChoice?.candidates || []).length).toBe(0);
  });
});

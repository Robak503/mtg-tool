/**
 * doubleOrResetCounters.test.js — UPKEEP DOUBLE-OR-RESET (Lily Bowen, Raging Grandma — SHELF S7).
 *
 * "At the beginning of your upkeep, double the number of +1/+1 counters on Lily Bowen if its power is 16 or
 * less. Otherwise, remove all but one +1/+1 counter from it, then you gain 1 life for each +1/+1 counter
 * removed this way." Three seams close the flip:
 *   1. triggers.rewriteSelfNameToThisCreature — the MID-clause self-name is rewritten to "this creature"
 *      ONLY inside this exact whole-clause grammar (both sentences anchored);
 *   2. parser.matchDoubleOrResetCounters — the two-sentence if/otherwise branch (shattered by the sentence
 *      splitter) collapses to ONE double-or-reset-counters atom carrying powerThreshold;
 *   3. counters.applyDoubleOrResetCounters — resolution-time branch pick off the SOURCE's LAYER-AWARE power
 *      (CR 613 — printed 0/0 + counters), double = ADD an equal number (CR 122, through addCounter so
 *      Doubling Season stacks), reset = remove all but ONE + gain 1 life per counter actually removed.
 * ("Lily Bowen enters with two +1/+1 counters on it." rides the existing TRUNK-ENTERSCOUNTERS seam.)
 * CREED FP = wrong branch / wrong magnitude, so exact counts are pinned on both branches + the boundary.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { detectTriggers } from "./triggers.js";
import { triggerRoutesNatively } from "./triggerRouting.js";
import { parseEffectClause, programConfidence, programNeedsChosenTarget } from "./effects/parser.js";
import { classifyCard } from "./coverage.js";
import { applyDoubleOrResetCounters } from "./effects/atoms/counters.js";
import { entersWithPlusCounters } from "./staticAbilityParser.js";

beforeEach(() => _resetIdsForTests());

// Real oracle text (bundled Scryfall data — never from memory).
const LILY_ORACLE =
  "Vigilance\nLily Bowen enters with two +1/+1 counters on it.\nAt the beginning of your upkeep, double the number of +1/+1 counters on Lily Bowen if its power is 16 or less. Otherwise, remove all but one +1/+1 counter from it, then you gain 1 life for each +1/+1 counter removed this way.";
const lilyCard = (id = "lb-card") => ({
  id, name: "Lily Bowen, Raging Grandma", type: "Legendary Creature — Mutant Warrior",
  power: "0", toughness: "0", mana: "{3}{G}", oracle: LILY_ORACLE,
});

const NORMALIZED =
  "double the number of +1/+1 counters on this creature if its power is 16 or less. Otherwise, remove all but one +1/+1 counter from it, then you gain 1 life for each +1/+1 counter removed this way";

function baseState(over = {}) {
  const s = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
  return { ...s, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main", ...over };
}
function withLily(counters) {
  const s = baseState();
  const lily = { ...createPermanent({ id: "lb", card: lilyCard(), controller: "user", summoningSick: false }), counters: { "+1/+1": counters } };
  return { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [lily] } } };
}

describe("detection + self-name rewrite", () => {
  it("the upkeep trigger's mid-clause self-name is rewritten to 'this creature' and the trigger routes natively", () => {
    const [d] = detectTriggers(lilyCard()).filter((t) => t.event === "upkeep");
    expect(d.effectClause).toBe(NORMALIZED);
    expect(triggerRoutesNatively(d)).toBe(true);
  });
  it("the enters-with-two-counters replacement rides TRUNK-ENTERSCOUNTERS (CR 614.1c)", () => {
    expect(entersWithPlusCounters(lilyCard())).toBe(2);
  });
});

describe("parser (collapse matcher)", () => {
  it("the normalized two-sentence branch parses HIGH, non-targeted → ONE atom with powerThreshold 16", () => {
    const p = parseEffectClause(NORMALIZED, "Instant");
    expect(programConfidence(p)).toBe("high");
    expect(programNeedsChosenTarget(p)).toBe(false);
    expect(p.atoms).toEqual([{ op: "double-or-reset-counters", powerThreshold: 16, targetType: null }]);
  });
  it("CREED — a rider on the reset arm leaves the whole clause unmatched → LOW (Arbiter)", () => {
    const p = parseEffectClause(NORMALIZED + ". Draw a card", "Instant");
    expect(programConfidence(p)).not.toBe("high");
  });
});

describe("classify", () => {
  it("Lily Bowen, Raging Grandma → native-trigger (whole card: vigilance + ETB counters + the branch trigger)", () => {
    expect(classifyCard(lilyCard())).toBe("native-trigger");
  });
});

describe("resolver (CREED core — exact branch + magnitude)", () => {
  const ATOM = { op: "double-or-reset-counters", powerThreshold: 16 };
  const CTX = { sourceId: "lb", controller: "user" };

  it("DOUBLE branch: power 2 (0/0 + two counters) ≤ 16 → counters double 2 → 4", () => {
    const s = applyDoubleOrResetCounters(withLily(2), ATOM, CTX);
    expect(s.players.user.battlefield[0].counters["+1/+1"]).toBe(4);
  });
  it("BOUNDARY: power exactly 16 is '16 or less' → still doubles (16 → 32)", () => {
    const s = applyDoubleOrResetCounters(withLily(16), ATOM, CTX);
    expect(s.players.user.battlefield[0].counters["+1/+1"]).toBe(32);
  });
  it("RESET branch: power 32 > 16 → all but ONE removed, controller gains 1 life per removed (31)", () => {
    const before = withLily(32);
    const lifeBefore = before.players.user.life;
    const s = applyDoubleOrResetCounters(before, ATOM, CTX);
    expect(s.players.user.battlefield[0].counters["+1/+1"]).toBe(1);
    expect(s.players.user.life).toBe(lifeBefore + 31);
  });
  it("zero counters → the double branch adds nothing (doubling zero, a logged no-op)", () => {
    const s = applyDoubleOrResetCounters(withLily(0), ATOM, CTX);
    expect(s.players.user.battlefield[0].counters?.["+1/+1"] || 0).toBe(0);
  });
  it("CR 608.2b — the source left the battlefield → a logged no-op (no fabricated counters/life)", () => {
    const s = baseState();
    const after = applyDoubleOrResetCounters(s, ATOM, { sourceId: "gone", controller: "user" });
    expect(after.players.user.life).toBe(s.players.user.life);
  });
});

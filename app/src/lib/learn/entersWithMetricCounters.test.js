/**
 * ETB-XCOUNTERS-FROM-METRIC (CR 614.1c + 122.6a + 608.2h) — enters with +1/+1 counters whose COUNT is a board
 * METRIC (not a fixed N, not the cast {X}). Two STRICT shapes are modeled:
 *   • "<N> +1/+1 counter(s) [plus an additional … ]for each <card type|basic land> you control"
 *       — Squad Captain (1 per other creature), Sheriff of Safe Passage (1 fixed + 1 per other creature)
 *   • "X +1/+1 counters … where X is the greatest power|toughness among [other ]creatures you control"
 *       — Prime Speaker Zegana (greatest power among OTHER creatures)
 * The parser emits a serializable { fixed, perUnit, metric } descriptor; the resolver resolves `metric` via
 * countForSpec AT RESOLUTION (the pre-entry board, "other" excluding the entering permanent), routed through
 * the Wave-3 doubler. A 0-metric leaves a 0/0 that correctly dies. Anything outside the two shapes → null →
 * body-only (Arbiter): mana-spent (Sunburst/Converge), kicked/convoked, graveyard/hand/loyalty counts,
 * creature subtypes ("for each other Ooze you control"), or qualified metrics ("with a +1/+1 counter on it").
 */
import { beforeEach, describe, expect, it } from "vitest";

import { enterPermanent } from "./resolvers.js";
import { entersWithMetricCounters, entersWithPlusCounters, entersWithXCounters } from "./staticAbilityParser.js";
import { permanentPower, permanentToughness } from "./layers.js";
import { classifyCard } from "./coverage.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const state0 = () => ({ ...createGameState({ userDeck: [], aiDeck: [] }), turn: 3 });
const creature = (id, name, p, t, oracle = "") => ({ id, name, type: "Creature — Beast", power: p, toughness: t, oracle });
// Seed creatures (passed as raw cards) as real permanents on the user's battlefield BEFORE the metric
// permanent enters — countForSpec reads `perm.card`, so they must be permanent-wrapped, not bare cards.
const withCreatures = (s, cards) => ({ ...s, players: { ...s.players, user: { ...s.players.user,
  battlefield: cards.map((c) => createPermanent({ id: c.id, card: c, controller: "user" })) } } });
const enteredPerm = (s) => s.players.user.battlefield[s.players.user.battlefield.length - 1];

describe("ETB-XCOUNTERS-FROM-METRIC — parser (serializable spec, mutually exclusive with fixed/X)", () => {
  it("Shape A: '<a> +1/+1 counter for each other creature you control' → fixed 0, perUnit 1, excludeSelf", () => {
    const m = entersWithMetricCounters({ oracle: "This creature enters with a +1/+1 counter on it for each other creature you control." });
    expect(m).toEqual({ fixed: 0, perUnit: 1, metric: { kind: "permanentsYouControl", cardType: "Creature", excludeSelf: true } });
  });
  it("Shape A 'plus an additional': Sheriff — fixed 1 + 1 per other creature", () => {
    const m = entersWithMetricCounters({ oracle: "This creature enters with a +1/+1 counter on it plus an additional +1/+1 counter on it for each other creature you control." });
    expect(m).toEqual({ fixed: 1, perUnit: 1, metric: { kind: "permanentsYouControl", cardType: "Creature", excludeSelf: true } });
  });
  it("Shape A: basic-land metric (no 'other') → subtype, excludeSelf false", () => {
    const m = entersWithMetricCounters({ oracle: "This creature enters with a +1/+1 counter on it for each Forest you control." });
    expect(m).toEqual({ fixed: 0, perUnit: 1, metric: { kind: "permanentsYouControl", subtype: "Forest", excludeSelf: false } });
  });
  it("Shape B: 'X = greatest power among other creatures you control' → greatestPowerYouControl, excludeSelf", () => {
    const m = entersWithMetricCounters({ oracle: "Prime Speaker Zegana enters with X +1/+1 counters on it, where X is the greatest power among other creatures you control." });
    expect(m).toEqual({ fixed: 0, perUnit: 1, metric: { kind: "greatestPowerYouControl", excludeSelf: true } });
  });
  it("does NOT overlap with the fixed-N or cast-X matchers (each metric card is fixed=0, X=false)", () => {
    for (const o of [
      "This creature enters with a +1/+1 counter on it for each other creature you control.",
      "Prime Speaker Zegana enters with X +1/+1 counters on it, where X is the greatest power among other creatures you control.",
    ]) {
      expect(entersWithPlusCounters({ oracle: o })).toBe(0);
      expect(entersWithXCounters({ oracle: o })).toBe(false);
    }
  });
  it("rejects unmodeled metrics → null (CREED: never a fabricated count)", () => {
    const reject = [
      "This creature enters with a +1/+1 counter on it for each color of mana spent to cast it.",      // Sunburst
      // ⚠️ "for each time it was kicked" MOVED OUT of this list on 2026-08-05 — it is now a modelled count
      // (timesKicked), asserted positively below. The guard's job is unchanged; only this example was earned.
      "This creature enters with a +1/+1 counter on it for each creature card in your graveyard.",      // graveyard
      "Aeve enters with a +1/+1 counter on it for each other Ooze you control.",                        // creature subtype
      "This creature enters with a +1/+1 counter on it for each other creature you control with a +1/+1 counter on it.", // qualified
      "Stag Beetle enters with X +1/+1 counters on it, where X is the number of other creatures on the battlefield.",    // not greatest-P/T
      "Voracious Wurm enters with X +1/+1 counters on it, where X is the amount of life you've gained this turn.",       // life gained
      "This creature enters with X +1/+1 counters on it.",                                              // bare cast-X (NOT metric)
      "This creature enters with three +1/+1 counters on it.",                                          // fixed-N (NOT metric)
    ];
    for (const o of reject) expect(entersWithMetricCounters({ oracle: o })).toBeNull();
  });

  it("⭐ 'for each time it was kicked' is now MODELED — the refusal above was EARNED, 2026-08-05", () => {
    // CR 702.33c/d. The count rides the cast to the entering permanent and is read back by countForSpec's
    // `timesKicked` kind. It read zero until P·15 (2026-10-01) began offering multikicked casts — a count rather
    // than a fabrication, so it went live with no edit. multikickerCount.test.js and everflowingChalice.test.js
    // drive it end to end.
    expect(entersWithMetricCounters({ oracle: "This creature enters with a +1/+1 counter on it for each time it was kicked." }))
      .toMatchObject({ perUnit: 1, metric: { kind: "timesKicked" } });
  });
});

describe("ETB-XCOUNTERS-FROM-METRIC — engine: counters resolve from the pre-entry board", () => {
  it("Squad Captain (1 per other creature) with 3 other creatures enters with 3 counters → a 4/4 from a 1/1", () => {
    let s = state0();
    s = withCreatures(s, [creature("o1", "Bear A", 2, 2), creature("o2", "Bear B", 2, 2), creature("o3", "Bear C", 2, 2)]);
    s = enterPermanent(s, creature("sc", "Squad Captain", 1, 1, "This creature enters with a +1/+1 counter on it for each other creature you control."), "user");
    const perm = enteredPerm(s);
    expect(perm.card.name).toBe("Squad Captain");
    expect(perm.counters["+1/+1"]).toBe(3);                 // 3 OTHER creatures (the entering one excluded)
    expect(permanentPower(s, perm.id)).toBe(4);
    expect(permanentToughness(s, perm.id)).toBe(4);
  });
  it("Sheriff (fixed 1 + 1 per other creature) with 2 others enters with 3 counters", () => {
    let s = state0();
    s = withCreatures(s, [creature("o1", "Bear A", 2, 2), creature("o2", "Bear B", 2, 2)]);
    s = enterPermanent(s, creature("sh", "Sheriff of Safe Passage", 1, 1, "This creature enters with a +1/+1 counter on it plus an additional +1/+1 counter on it for each other creature you control."), "user");
    expect(enteredPerm(s).counters["+1/+1"]).toBe(3);       // 1 fixed + 2 others
  });
  it("Zegana (greatest power among other creatures) reads the layer-aware power of the strongest other creature", () => {
    let s = state0();
    s = withCreatures(s, [creature("o1", "Small", 2, 2), creature("o2", "Big", 6, 6)]);
    s = enterPermanent(s, creature("z", "Prime Speaker Zegana", 1, 1, "Prime Speaker Zegana enters with X +1/+1 counters on it, where X is the greatest power among other creatures you control."), "user");
    expect(enteredPerm(s).counters["+1/+1"]).toBe(6);       // greatest power among OTHERS = 6
  });
  it("an empty board → 0 metric → no counters (a 0/0 that correctly dies to the SBA — no fabricated floor)", () => {
    const s = enterPermanent(state0(), creature("sc", "Squad Captain", 0, 0, "This creature enters with a +1/+1 counter on it for each other creature you control."), "user");
    // It may already be reaped by the lethal-toughness SBA inside enterPermanent's trigger flush; either way
    // it never gained a fabricated counter. Assert no +1/+1 counter was added to the freshly-entered object.
    const perm = s.players.user.battlefield.find((p) => p.card?.name === "Squad Captain");
    expect(perm?.counters?.["+1/+1"] || 0).toBe(0);
  });
});

describe("ETB-XCOUNTERS-FROM-METRIC — coverage: a card whose only ability is the metric clause flips native", () => {
  it("Squad Captain (Vigilance + metric enters-with) classifies native-body", () => {
    expect(classifyCard({ type: "Creature — Human Soldier", name: "Squad Captain", mana: "{2}{W}",
      oracle: "Vigilance\nThis creature enters with a +1/+1 counter on it for each other creature you control." })).toBe("native-body");
  });
  it("a bare 'for each Forest you control' metric body (no other text) classifies native-body", () => {
    expect(classifyCard({ type: "Creature — Beast", name: "Test Beast", mana: "{4}{G}",
      oracle: "This creature enters with a +1/+1 counter on it for each Forest you control." })).toBe("native-body");
  });
  it("Sheriff (metric + MODELED Plot, CR 702.170) classifies native-body — plot is its only other clause", () => {
    // Plot is now a modeled special action (plot.test.js): classifyCard strips the "Plot {cost}" line, and a
    // card whose only remaining text is the modeled metric-counter clause is native-body. (Pre-plot this was
    // body-only — the whole-card gate held it because plot was unmodeled.)
    expect(classifyCard({ type: "Creature — Human Knight", name: "Sheriff of Safe Passage", mana: "{1}{W}",
      oracle: "This creature enters with a +1/+1 counter on it plus an additional +1/+1 counter on it for each other creature you control.\nPlot {1}{W}" })).toBe("native-body");
  });
  it("an UNMODELED metric (Sunburst) does NOT flip — stays body-only", () => {
    expect(classifyCard({ type: "Artifact Creature — Construct", name: "Sunburst Bot", mana: "{5}",
      oracle: "This creature enters with a +1/+1 counter on it for each color of mana spent to cast it." })).toBe("body-only");
  });
});

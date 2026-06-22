/**
 * drawMetric.test.js — DRAW-EQUAL-TO-METRIC + "other" self-exclusion (WAVE2b, branch wave2b-drawmetric).
 *
 * Two new draw shapes:
 *   1. "Draw cards equal to the greatest power/toughness among creatures you control" — the count is a
 *      board MAX resolved AT RESOLUTION (greatestPower/ToughnessYouControl in countForSpec), layer-aware.
 *   2. "Draw a card for each OTHER <X> you control" — the source permanent is excluded from the count
 *      (CR 109.2), via the `excludeSource` flag parseCountSource now sets (gated by allowExcludeSource so
 *      ONLY the DRAW matchers opt in — sibling gain-life/token "other" forms stay LOW, unchanged).
 *
 * Covers: the parser atom shape + confidence for both forms; countForSpec resolution of the two new metric
 * kinds (5-power board → 5; toughness variant; empty board → 0); excludeSource skipping ctx.sourceId
 * (3 other Dinos + source → 3); and an end-to-end resolveAtom draw (the controller's hand grows by the
 * resolved metric). The "other" strip is gated, so a non-opting matcher is unaffected.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { parseEffectProgram, programConfidence } from "../parser.js";
import { countForSpec } from "./shared.js";
import { resolveAtom } from "../effectAtoms.js";
import { _resetIdsForTests, createGameState } from "../../gameState.js";

beforeEach(() => _resetIdsForTests());

const I = (oracle) => ({ type: "Instant", oracle });
const S = (oracle) => ({ type: "Sorcery", oracle });
const atom0 = (card) => parseEffectProgram(card).atoms[0];
const conf = (card) => programConfidence(parseEffectProgram(card));

// A creature permanent with explicit P/T and an arbitrary subtype (default Dinosaur for the "other" tests).
function creature(id, { power = 1, toughness = 1, subtype = "Dinosaur" } = {}) {
  return {
    id, controller: "user", tapped: false, summoningSick: false, counters: {},
    damageMarked: 0, attachments: [], attachedTo: null,
    card: { name: `T-${id}`, type: `Creature — ${subtype}`, power, toughness },
  };
}

// State with the given battlefield for "user" and a library of N blank cards so a draw never decks out.
function stateWith(battlefield, libCount = 20) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  const library = Array.from({ length: libCount }, (_, i) => ({ name: `L${i}`, type: "Land" }));
  return { ...s, players: { ...s.players, user: { ...s.players.user, battlefield, library, hand: [] } } };
}

describe("DRAW-METRIC — parser (greatest power/toughness among creatures you control)", () => {
  it("'draw cards equal to the greatest power among creatures you control' → HIGH, greatestPowerYouControl", () => {
    expect(atom0(I("Draw cards equal to the greatest power among creatures you control.")))
      .toMatchObject({ op: "draw", amountCount: { kind: "greatestPowerYouControl", per: 1 }, targetType: null });
    expect(conf(I("Draw cards equal to the greatest power among creatures you control."))).toBe("high");
  });

  it("'draw cards equal to the greatest toughness among creatures you control' → HIGH, greatestToughnessYouControl", () => {
    expect(atom0(I("Draw cards equal to the greatest toughness among creatures you control.")))
      .toMatchObject({ op: "draw", amountCount: { kind: "greatestToughnessYouControl", per: 1 }, targetType: null });
    expect(conf(I("Draw cards equal to the greatest toughness among creatures you control."))).toBe("high");
  });

  it("an unmodeled metric tail (greatest power among creatures an opponent controls) stays LOW", () => {
    expect(conf(I("Draw cards equal to the greatest power among creatures an opponent controls."))).toBe("low");
  });
});

describe("DRAW-METRIC — parser ('for each other <X> you control', excludeSource)", () => {
  it("'draw a card for each other Dinosaur you control' → HIGH with excludeSource on the spec", () => {
    expect(atom0(S("Draw a card for each other Dinosaur you control.")))
      .toMatchObject({ op: "draw", amountCount: { kind: "permanentsYouControl", subtype: "Dinosaur", excludeSource: true, per: 1 } });
    expect(conf(S("Draw a card for each other Dinosaur you control."))).toBe("high");
  });

  it("the NON-'other' draw is byte-unchanged (no excludeSource flag)", () => {
    const a = atom0(S("Draw a card for each Dinosaur you control."));
    expect(a).toMatchObject({ op: "draw", amountCount: { kind: "permanentsYouControl", subtype: "Dinosaur", per: 1 } });
    expect(a.amountCount.excludeSource).toBeUndefined();
  });

  it("the strip is GATED to the draw matchers — a 'for each other' GAIN-LIFE form stays LOW (unchanged)", () => {
    expect(conf(I("You gain 2 life for each other creature you control."))).toBe("low");
  });
});

describe("DRAW-METRIC — countForSpec resolution (greatest power/toughness)", () => {
  const ctx = { controller: "user", targets: [] };

  it("greatest power among a 5/2, 3/9, 1/1 board → 5 (the MAX power, layer-aware)", () => {
    const s = stateWith([creature("a", { power: 5, toughness: 2 }), creature("b", { power: 3, toughness: 9 }), creature("c", { power: 1, toughness: 1 })]);
    expect(countForSpec(s, ctx, { kind: "greatestPowerYouControl" })).toBe(5);
  });

  it("greatest toughness among the same board → 9 (the MAX toughness, layer-aware)", () => {
    const s = stateWith([creature("a", { power: 5, toughness: 2 }), creature("b", { power: 3, toughness: 9 }), creature("c", { power: 1, toughness: 1 })]);
    expect(countForSpec(s, ctx, { kind: "greatestToughnessYouControl" })).toBe(9);
  });

  it("empty board → 0 (a safe FN, never fabricated) for both power and toughness", () => {
    const s = stateWith([]);
    expect(countForSpec(s, ctx, { kind: "greatestPowerYouControl" })).toBe(0);
    expect(countForSpec(s, ctx, { kind: "greatestToughnessYouControl" })).toBe(0);
  });
});

describe("DRAW-METRIC — countForSpec resolution (excludeSource 'other')", () => {
  it("'other Dinosaur you control': 3 other Dinos + the source → 3 (source excluded, CR 109.2)", () => {
    const src = creature("src");
    const others = [creature("d1"), creature("d2"), creature("d3")];
    const s = stateWith([src, ...others]);
    const ctx = { controller: "user", targets: [], sourceId: "src" };
    // WITHOUT excludeSource the count is all 4; WITH it the source is skipped → 3.
    expect(countForSpec(s, ctx, { kind: "permanentsYouControl", subtype: "Dinosaur" })).toBe(4);
    expect(countForSpec(s, ctx, { kind: "permanentsYouControl", subtype: "Dinosaur", excludeSource: true })).toBe(3);
  });

  it("excludeSource also honors triggeringPermanentId (the trigger's own permanent)", () => {
    const s = stateWith([creature("trig"), creature("d1"), creature("d2")]);
    const ctx = { controller: "user", targets: [], triggeringPermanentId: "trig" };
    expect(countForSpec(s, ctx, { kind: "permanentsYouControl", subtype: "Dinosaur", excludeSource: true })).toBe(2);
  });

  it("on a SPELL (no sourceId / triggeringPermanentId) excludeSource is a no-op — counts all", () => {
    const s = stateWith([creature("d1"), creature("d2"), creature("d3")]);
    const ctx = { controller: "user", targets: [] };
    expect(countForSpec(s, ctx, { kind: "permanentsYouControl", subtype: "Dinosaur", excludeSource: true })).toBe(3);
  });
});

describe("DRAW-METRIC — end-to-end (resolveAtom draws the resolved metric)", () => {
  it("greatest power 5 → the controller draws 5 (hand grows by 5)", () => {
    const s = stateWith([creature("a", { power: 5, toughness: 2 }), creature("b", { power: 3 })]);
    const atom = atom0(I("Draw cards equal to the greatest power among creatures you control."));
    const out = resolveAtom(s, atom, { controller: "user", targets: [] });
    expect(out.players.user.hand).toHaveLength(5);
  });

  it("'for each other Dinosaur you control' with 2 other Dinos + source → draws 2", () => {
    const s = stateWith([creature("src"), creature("d1"), creature("d2")]);
    const atom = atom0(S("Draw a card for each other Dinosaur you control."));
    const out = resolveAtom(s, atom, { controller: "user", targets: [], sourceId: "src" });
    expect(out.players.user.hand).toHaveLength(2);
  });

  it("empty board → draws 0 (hand unchanged)", () => {
    const s = stateWith([]);
    const atom = atom0(I("Draw cards equal to the greatest toughness among creatures you control."));
    const out = resolveAtom(s, atom, { controller: "user", targets: [] });
    expect(out.players.user.hand).toHaveLength(0);
  });
});

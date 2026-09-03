/**
 * CLOUD OF FAERIES — the {1}{U} Faerie whose ETB untaps up to two lands:
 *   "Flying
 *    When this creature enters, untap up to two lands.
 *    Cycling {2} ({2}, Discard this card: Draw a card.)"
 *
 * The sole blocker was the ETB effect clause "untap up to two lands" parsing LOW (no chosen-target
 * "untap target land" match, no bare "up to N lands" matcher). combatKeywordClauseParser now emits the
 * EXISTING op:"untap-lands" atom (uptoN, targetType:null) that Finale of Revelation's anchor already uses
 * and that applyUntapLands already plays — a deterministic greedy auto-untap of up to N of the CONTROLLER'S
 * OWN tapped lands (CR 701.20). No chosen target, so the ETB trigger routes natively (α1 allowlist), and the
 * card's other text is fully modeled (Flying keyword; Cycling {2} via parseCyclingCost) → native-trigger.
 *
 * CREED: the atom untaps ONLY the controller's own tapped lands, in battlefield order, capped at N — never an
 * opponent's land, never a non-land (verified live). The bare-scope matcher rejects the chosen-target family
 * ("untap up to N target lands" — Krosan Restorer / Pip-Boy) and the "of your lands" variant, which stay LOW →
 * Arbiter (SAFE false-negatives), proven by the near-misses below.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { createGameState, _resetIdsForTests } from "../gameState.js";
import { runEffectProgram } from "./runProgram.js";
import { RESOLVER_KEYS } from "../resolvers.js";
import { parseEffectClause, programConfidence, programNeedsChosenTarget } from "./parser.js";
import { classifyCard } from "../coverage.js";
import { detectTriggers } from "../triggers.js";
import { triggerRoutesNatively } from "../triggerRouting.js";

beforeEach(() => _resetIdsForTests());

const CLOUD = {
  name: "Cloud of Faeries",
  type: "Creature — Faerie",
  mana: "{1}{U}",
  keywords: ["Flying", "Cycling"],
  oracle:
    "Flying\nWhen this creature enters, untap up to two lands.\nCycling {2} ({2}, Discard this card: Draw a card.)",
};

describe("Cloud of Faeries — parse + classify", () => {
  it("the ETB clause 'untap up to two lands' parses HIGH to a targetless untap-lands atom", () => {
    const p = parseEffectClause("untap up to two lands", "Instant");
    expect(programConfidence(p)).toBe("high");
    expect(programNeedsChosenTarget(p)).toBe(false);
    expect(p.atoms).toEqual([{ op: "untap-lands", uptoN: 2, targetType: null }]);
  });

  it("classifies native-trigger (Flying + modeled ETB + Cycling {2})", () => {
    expect(classifyCard(CLOUD)).toBe("native-trigger");
  });

  it("the ETB trigger routes natively (HIGH, no chosen target)", () => {
    const trigs = detectTriggers(CLOUD);
    expect(trigs).toHaveLength(1);
    expect(trigs[0].event).toBe("etb");
    expect(trigs[0].effectClause).toBe("untap up to two lands");
    expect(triggerRoutesNatively(trigs[0])).toBe(true);
  });

  it("the sibling ETB card Peregrine Drake flips too (up to five lands)", () => {
    const drake = {
      name: "Peregrine Drake",
      type: "Creature — Drake",
      mana: "{4}{U}",
      keywords: ["Flying"],
      oracle: "Flying\nWhen this creature enters, untap up to five lands.",
    };
    expect(classifyCard(drake)).toBe("native-trigger");
  });
});

// ── Runtime: the untap-lands atom actually untaps the controller's own lands (real capability) ──
function land(id, controller, { tapped = false } = {}) {
  return { id, card: { name: "Island", type: "Basic Land — Island", oracle: "" }, controller, tapped, summoningSick: false, counters: {}, damageMarked: 0, attachments: [], attachedTo: null };
}
function freshState(over = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return { ...s, ...over };
}
function stackObj(program, { controller = "user" } = {}) {
  return {
    id: "stk-1", kind: "trigger", source: { name: "Cloud of Faeries", oracle: CLOUD.oracle }, controller, targets: [], cost: null,
    payload: {
      resolver: RESOLVER_KEYS.EFFECT_PROGRAM,
      params: { program, controller, targets: [] },
    },
  };
}

describe("Cloud of Faeries — runtime (the ETB untaps up to two of the controller's own tapped lands)", () => {
  it("untaps exactly two when three of the controller's lands are tapped (cap honored)", () => {
    let state = freshState();
    state = {
      ...state,
      players: {
        ...state.players,
        user: {
          ...state.players.user,
          battlefield: [land("a", "user", { tapped: true }), land("b", "user", { tapped: true }), land("c", "user", { tapped: true })],
        },
        ai: {
          ...state.players.ai,
          // an opponent's tapped land must NEVER be untapped by this controller-scoped atom (CREED)
          battlefield: [land("enemy", "ai", { tapped: true })],
        },
      },
    };
    const program = parseEffectClause("untap up to two lands", "Instant");
    const out = runEffectProgram(state, stackObj(program));
    const untapped = out.players.user.battlefield.filter((p) => !p.tapped).map((p) => p.id);
    expect(untapped).toEqual(["a", "b"]);                                  // first two, in battlefield order
    expect(out.players.user.battlefield.find((p) => p.id === "c").tapped).toBe(true); // third stayed tapped (cap)
    expect(out.players.ai.battlefield.find((p) => p.id === "enemy").tapped).toBe(true); // opponent's land untouched
  });

  it("untaps only min(2, tapped lands) — never over-untaps or fabricates a target", () => {
    let state = freshState();
    state = {
      ...state,
      players: {
        ...state.players,
        user: {
          ...state.players.user,
          battlefield: [land("only", "user", { tapped: true }), land("free", "user", { tapped: false })],
        },
      },
    };
    const program = parseEffectClause("untap up to two lands", "Instant");
    const out = runEffectProgram(state, stackObj(program));
    // Only one land was tapped → it untaps; the already-untapped one is unchanged. No error, no over-reach.
    expect(out.players.user.battlefield.every((p) => !p.tapped)).toBe(true);
  });
});

describe("Cloud of Faeries — CREED near-misses (stay Arbiter / body-only)", () => {
  it("the chosen-target form 'untap up to N target lands' is its OWN atom, never this bare-scope resolver", () => {
    // GRADUATED (Pip-Boy slice): "untap up to N target lands" now parses to the chosen-target multi-count
    // untap atom (targetType land + maxTargets) — DISTINCT from this bare-scope auto-untap (targetType null).
    // The pin's original point survives as the shape check: the two forms must never collapse into each other.
    const p2 = parseEffectClause("untap up to two target lands", "Instant");
    expect(programConfidence(p2)).toBe("high");
    expect(p2.atoms[0]).toMatchObject({ op: "untap", targetType: "land", maxTargets: 2 });
    // the bare-scope form still parses to the auto-untap (no targetType) — no collapse in either direction
    const bare = parseEffectClause("untap up to two lands", "Instant");
    expect(bare.atoms[0]).toMatchObject({ op: "untap-lands" });
  });

  it("the 'up to N of your lands' variant is not this shape → LOW", () => {
    expect(programConfidence(parseEffectClause("untap up to two of your lands", "Instant"))).toBe("low");
  });

  it("the count vocabulary is one..ten since ④-U (Palinchron's seven); an out-of-vocabulary word still stays LOW (tight matcher)", () => {
    // ④-U (2026-09-03): six..ten joined the alternation off the shared number map (a number word outside it was a
    // silent park — Palinchron / Great Whale). A word BEYOND the alternation is still not silently mis-capped.
    expect(parseEffectClause("untap up to six lands", "Instant").atoms).toEqual([{ op: "untap-lands", uptoN: 6, targetType: null }]);
    expect(programConfidence(parseEffectClause("untap up to eleven lands", "Instant"))).toBe("low");
  });

  it("a card whose ETB carries a genuinely unmodeled rider does not flip (whole clause or nothing)", () => {
    const rider = {
      ...CLOUD,
      oracle:
        "Flying\nWhen this creature enters, untap up to two lands, then you may cast a spell from your graveyard this turn.\nCycling {2}",
    };
    // The graveyard-recast tail is unmodeled → the whole ETB effect parses LOW → the trigger does not route
    // natively → the card stays body-only (a SAFE false-negative, never a partial model that drops the tail).
    expect(classifyCard(rider)).toBe("body-only");
  });
});

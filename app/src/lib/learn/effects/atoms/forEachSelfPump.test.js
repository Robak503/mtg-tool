/**
 * forEachSelfPump.test.js — TRIG-PUMP-COUNT: a count-scaled SELF pump on an attack trigger.
 *
 * Card: Rampaging Brontodon (Pantlaza deck) — "Trample\nWhenever this creature attacks, it gets +1/+1
 * until end of turn for each land you control." The attack trigger's "it" is rewritten to "this creature"
 * (self scope) by detectTriggers (SELF_PUMP_IT_RE, now admitting the trailing "for each …"); the parser
 * emits a self pump with ptDeltaCount; applyPumpEffect resolves the board count (CR 608.2h) × the per-unit
 * delta at resolution and applies it through the layer-7c engine.
 *
 * Covers: (1) parser atom shape, (2) RUNTIME scaling = lands × per-unit, (3) coverage flip to native-trigger,
 * (4) CREED anti-FP pins (asymmetric for-each, unmodeled count source, a rider past the count → Arbiter).
 */
import { describe, it, expect, beforeEach } from "vitest";
import { parseEffectClause, programConfidence } from "../parser.js";
import { resolveAtom } from "../effectAtoms.js";
import { createGameState, createPermanent, _resetIdsForTests } from "../../gameState.js";
import { permanentPower, permanentToughness } from "../../layers.js";
import { classifyCard } from "../../coverage.js";
import { detectTriggers } from "../../triggers.js";
import { triggerRoutesNatively } from "../../triggerRouting.js";

const BRONTODON = {
  name: "Rampaging Brontodon",
  type: "Creature — Dinosaur",
  mana: "{4}{R}",
  oracle: "Trample\nWhenever this creature attacks, it gets +1/+1 until end of turn for each land you control.",
};

describe("for-each self pump — parser atom shape", () => {
  it("'this creature gets +1/+1 … for each land you control' → self pump with ptDeltaCount(land, per 1)", () => {
    const cp = parseEffectClause("this creature gets +1/+1 until end of turn for each land you control", "Instant");
    expect(programConfidence(cp)).toBe("high");
    expect(cp.atoms).toHaveLength(1);
    expect(cp.atoms[0]).toMatchObject({
      op: "pump",
      target: "self",
      ptDeltaCount: { kind: "permanentsYouControl", cardType: "land", per: 1 },
    });
  });
  it("a +2/+2 per-unit form carries per:2", () => {
    const cp = parseEffectClause("this creature gets +2/+2 until end of turn for each creature you control", "Instant");
    expect(programConfidence(cp)).toBe("high");
    expect(cp.atoms[0]).toMatchObject({ op: "pump", target: "self", ptDeltaCount: { kind: "permanentsYouControl", cardType: "creature", per: 2 } });
  });
});

describe("for-each self pump — detector rewrites the attack-trigger 'it' and routes native", () => {
  it("Brontodon's attacks trigger routes natively (it → this creature, high)", () => {
    const trigs = detectTriggers(BRONTODON);
    const atk = trigs.find((t) => t.event === "attacks");
    expect(atk).toBeTruthy();
    expect(atk.effectClause).toMatch(/^this creature gets \+1\/\+1 until end of turn for each land you control$/i);
    expect(triggerRoutesNatively(atk)).toBe(true);
  });
});

describe("for-each self pump — RUNTIME scales by the live board count (CR 608.2h)", () => {
  beforeEach(() => _resetIdsForTests());
  function stateWithLands(nLands) {
    const s = createGameState({ userDeck: [], aiDeck: [] });
    const bronto = createPermanent({ id: "bronto", card: { id: "bronto", name: "Rampaging Brontodon", type: "Creature — Dinosaur", power: 6, toughness: 5 }, controller: "user" });
    const lands = [];
    for (let i = 0; i < nLands; i++) {
      lands.push(createPermanent({ id: `land${i}`, card: { id: `land${i}`, name: "Forest", type: "Basic Land — Forest" }, controller: "user" }));
    }
    return { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [bronto, ...lands] } } };
  }
  const atom = { op: "pump", target: "self", ptDeltaCount: { kind: "permanentsYouControl", cardType: "land", per: 1 } };

  it("+1/+1 per land: 5 lands → +5/+5 on the source", () => {
    const after = resolveAtom(stateWithLands(5), atom, { controller: "user", sourceId: "bronto" });
    expect(permanentPower(after, "bronto")).toBe(11);     // 6 + 5
    expect(permanentToughness(after, "bronto")).toBe(10); // 5 + 5
  });
  it("0 lands → +0/+0 (a clean no-op, never a fabricated bonus)", () => {
    const after = resolveAtom(stateWithLands(0), atom, { controller: "user", sourceId: "bronto" });
    expect(permanentPower(after, "bronto")).toBe(6);
    expect(permanentToughness(after, "bronto")).toBe(5);
  });
  it("per:2 doubles the count: 3 lands → +6/+6", () => {
    const after = resolveAtom(stateWithLands(3), { ...atom, ptDeltaCount: { ...atom.ptDeltaCount, per: 2 } }, { controller: "user", sourceId: "bronto" });
    expect(permanentPower(after, "bronto")).toBe(12);     // 6 + 3*2
    expect(permanentToughness(after, "bronto")).toBe(11); // 5 + 3*2
  });
});

describe("for-each self pump — coverage flip", () => {
  it("Rampaging Brontodon → native-trigger (Trample + the sole count-scaled attack pump)", () => {
    expect(classifyCard(BRONTODON)).toBe("native-trigger");
  });
});

describe("for-each self pump — CREED anti-FP pins", () => {
  // ASYMMETRIC per-unit (distinct power/toughness multipliers) is NOT modeled — the scaled path applies one
  // multiplier to both stats, so a "+2/+0 for each …" would mis-scale toughness. Stays LOW → Arbiter.
  it("asymmetric +2/+0 for each → LOW (no atom)", () => {
    const cp = parseEffectClause("this creature gets +2/+0 until end of turn for each land you control", "Instant");
    expect(programConfidence(cp)).not.toBe("high");
  });
  // An UNMODELED count source (parseCountSource returns null) keeps the whole clause LOW — never a silently
  // mis-counted pump.
  it("unmodeled count source ('for each card type among permanents you control') → LOW", () => {
    const cp = parseEffectClause("this creature gets +1/+1 until end of turn for each card type among permanents you control", "Instant");
    expect(programConfidence(cp)).not.toBe("high");
  });
  // A card whose for-each count source is UNMODELED ("for each opponent") stays body-only at the CARD level —
  // the trigger fails to route (parseCountSource → null → LOW), so the whole card lands on the Arbiter.
  it("an unmodeled count source keeps the whole card body-only", () => {
    const unmodeled = { ...BRONTODON, oracle: "Trample\nWhenever this creature attacks, it gets +1/+1 until end of turn for each opponent." };
    expect(classifyCard(unmodeled)).toBe("body-only");
  });
  // A trailing SEPARATE sentence after the count ("…you control. Draw a card.") is NOT swallowed by the
  // for-each tail — the multi-clause splitter parses it as its OWN atom. Both the scaled pump AND the draw are
  // modeled, so the card is fully native (a correct full-card model, never a dropped clause). This pins that the
  // greedy (.+) count capture does NOT eat across a sentence boundary into the count source.
  it("a trailing separate sentence is modeled as its own atom (pump + draw, both native)", () => {
    const cp = parseEffectClause("this creature gets +1/+1 until end of turn for each land you control. Draw a card", "Instant");
    expect(programConfidence(cp)).toBe("high");
    expect(cp.atoms.map((a) => a.op)).toEqual(["pump", "draw"]);
    expect(cp.atoms[0].ptDeltaCount).toMatchObject({ kind: "permanentsYouControl", cardType: "land", per: 1 });
  });
});

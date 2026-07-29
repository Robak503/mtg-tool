/**
 * countersOnGroupCount.test.js — "the number of +1/+1 counters on <group> you control" as a COUNT SOURCE
 * (Toph, the Blind Bandit — Earth Bent, the deck nearest the 1.0 bar).
 *
 * "…the number of LANDS you control" and "…of CREATURES you control" were already exact count sources; the
 * counters-on-a-group form was not, for either. It is the same board read one level in: pick the group by a
 * word-bounded type-line match, then sum the named counter kind off each permanent.
 *
 * ⭐ THE ORDER WAS THE WHOLE JOB, AND THE CODEBASE SAID SO. The CDA count vocabulary is a curated allowlist
 * whose rule is "every branch maps to an evaluator countForSpec computes EXACTLY", and its comment named
 * *Toph's "+1/+1 counters on lands"* as excluded for having none. A CDA SETS the base P/T, so admitting the
 * phrase before writing the evaluator would have produced a count of 0 — a fabricated 0/0 on the
 * battlefield, the precise failure that comment forbids. Evaluator first, admit second.
 *
 * That is the same discipline the add-counter once-per-turn slice needed (latch first, admit second), and
 * the same shape as the condition-gated mana guard whose stated reason had already dissolved. When a guard
 * explains ITSELF, the fix is to satisfy its condition — not to widen it.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { createGameState, createPermanent, creaturePower, _resetIdsForTests } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const TOPH = {
  id: "tp", name: "Toph, the Blind Bandit", type: "Legendary Creature — Human Rogue", mana: "{2}{G}",
  power: "*", toughness: 3,
  oracle: "Toph's power is equal to the number of +1/+1 counters on lands you control.",
};

/** Board with Toph plus one land per entry, carrying that many +1/+1 counters. */
function board(landCounters, { opponentLands = [] } = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  const mk = (owner, n, i) => ({
    ...createPermanent({ id: `${owner}L${i}`, card: { id: `${owner}L${i}`, name: "Forest", type: "Basic Land — Forest", oracle: "" }, controller: owner }),
    counters: { "+1/+1": n },
  });
  return {
    ...s,
    players: {
      ...s.players,
      user: { ...s.players.user, battlefield: [createPermanent({ id: "tp", card: TOPH, controller: "user" }), ...landCounters.map((n, i) => mk("user", n, i))] },
      ai: { ...s.players.ai, battlefield: opponentLands.map((n, i) => mk("ai", n, i)) },
    },
  };
}
const tophPower = (st) => creaturePower(st.players.user.battlefield.find((p) => p.id === "tp"), st);

describe("classification", () => {
  it("Toph classifies native", () => {
    expect(classifyCard(TOPH)).toMatch(/^native/);
  });

  it("⭐ CREED — a counter kind with NO exact evaluator still parks", () => {
    expect(classifyCard({ ...TOPH, oracle: "Toph's power is equal to the number of loyalty counters on lands you control." })).toBe("body-only");
  });

  it("⭐ CREED — a QUALIFIED group still parks (no evaluator for it)", () => {
    expect(classifyCard({ ...TOPH, oracle: "Toph's power is equal to the number of +1/+1 counters on tapped lands you control." })).toBe("body-only");
  });

  it("the plain board counts are untouched", () => {
    expect(classifyCard({ ...TOPH, oracle: "Toph's power is equal to the number of lands you control." })).toMatch(/^native/);
  });
});

describe("⭐ RUNTIME — the count is exact", () => {
  it("2 + 3 counters across two lands → power 5", () => {
    expect(tophPower(board([2, 3]))).toBe(5);
  });

  it("lands with NO counters contribute 0, not 1 (never a fabricated floor)", () => {
    expect(tophPower(board([0, 0]))).toBe(0);
  });

  it("no lands at all → 0", () => {
    expect(tophPower(board([]))).toBe(0);
  });

  it("⭐ CREED — an OPPONENT'S counters are not counted (\"you control\")", () => {
    expect(tophPower(board([1], { opponentLands: [5, 5] }))).toBe(1);
  });

  it("⭐ CREED — counters on a NON-land are not counted (the group gate is real)", () => {
    const st = board([2]);
    const creature = { ...createPermanent({ id: "bear", card: { id: "b", name: "Bear", type: "Creature — Bear", power: 2, toughness: 2, oracle: "" }, controller: "user" }), counters: { "+1/+1": 7 } };
    st.players.user.battlefield.push(creature);
    expect(tophPower(st)).toBe(2);
  });
});

/**
 * layers.equivalence.test.js — THE EQUIVALENCE GATE (Phase-7 PR-10).
 *
 * MERGE-BLOCKING, MANDATORY BEFORE PR-11 (the creaturePower accessor swap, the
 * single highest-blast-radius change in Phase 1). Proves the new layer engine
 * (`permanentPower`/`permanentToughness`) is VALUE-IDENTICAL to the legacy P/T
 * arithmetic across an exhaustive parity matrix:
 *
 *   {printed P/T} × {+1/+1, -1/-1, both, none} × {0 / negative toughness}
 *                 × {Omnath at 0..N floating green}
 *
 * The reference is an INLINE re-implementation of the exact pre-layers math
 * (printed + (+1/+1) − (−1/−1) + Omnath-green), NOT the live `creaturePower`.
 * That keeps the gate a true characterization even after PR-11 makes
 * `creaturePower` delegate to `permanentPower` (where importing it would become
 * a tautology). It also cross-checks the live legacy `creaturePower` (still the
 * pre-swap implementation when this lands) for good measure.
 */

import { describe, it, expect } from "vitest";
import { createGameState, creaturePower, creatureToughness } from "./gameState.js";
import { permanentPower, permanentToughness } from "./layers.js";

// ── The legacy reference: exactly what creaturePower did before the layer swap. ──
function legacyPower(perm, state) {
  const base = Number(perm.card.power) || 0;
  const plus = perm.counters?.["+1/+1"] || 0;
  const minus = perm.counters?.["-1/-1"] || 0;
  const omnath = perm.card.name === "Omnath, Locus of Mana"
    ? (state.players[perm.controller]?.manaPool?.G || 0)
    : 0;
  return base + plus - minus + omnath;
}
function legacyToughness(perm, state) {
  const base = Number(perm.card.toughness) || 0;
  const plus = perm.counters?.["+1/+1"] || 0;
  const minus = perm.counters?.["-1/-1"] || 0;
  const omnath = perm.card.name === "Omnath, Locus of Mana"
    ? (state.players[perm.controller]?.manaPool?.G || 0)
    : 0;
  return base + plus - minus + omnath;
}

function buildState(perm, green = 0) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...s,
    players: {
      ...s.players,
      user: {
        ...s.players.user,
        battlefield: [perm],
        manaPool: { ...s.players.user.manaPool, G: green },
      },
    },
  };
}

function makePerm(name, power, toughness, counters) {
  return {
    id: "p1", card: { name, type: "Creature", power, toughness }, controller: "user",
    tapped: false, summoningSick: false, counters: { ...counters }, damageMarked: 0,
    attachments: [], attachedTo: null, timestamp: 0,
  };
}

// The matrix dimensions.
const PRINTED = [
  [0, 1], [1, 1], [2, 2], [3, 4], [5, 5], [4, 1], [0, 0],
];
const COUNTERS = [
  {},
  { "+1/+1": 1 }, { "+1/+1": 3 },
  { "-1/-1": 1 }, { "-1/-1": 2 }, { "-1/-1": 5 }, // drives toughness ≤ 0
  { "+1/+1": 2, "-1/-1": 1 }, { "+1/+1": 1, "-1/-1": 4 },
];

describe("EQUIVALENCE GATE — vanilla creature (no static ability)", () => {
  for (const [pp, tt] of PRINTED) {
    for (const counters of COUNTERS) {
      const label = `${pp}/${tt} counters=${JSON.stringify(counters)}`;
      it(`matches legacy for ${label}`, () => {
        const perm = makePerm("Grizzly Bears", pp, tt, counters);
        const state = buildState(perm, 5 /* green present but irrelevant to a non-Omnath */);
        expect(permanentPower(state, "p1")).toBe(legacyPower(perm, state));
        expect(permanentToughness(state, "p1")).toBe(legacyToughness(perm, state));
        // Cross-check the live legacy accessor too (pre-swap implementation).
        expect(permanentPower(state, "p1")).toBe(creaturePower(perm, state));
        expect(permanentToughness(state, "p1")).toBe(creatureToughness(perm, state));
      });
    }
  }
});

describe("EQUIVALENCE GATE — Omnath across 0..N floating green", () => {
  const GREENS = [0, 1, 2, 5, 8, 13];
  for (const green of GREENS) {
    for (const counters of COUNTERS) {
      const label = `green=${green} counters=${JSON.stringify(counters)}`;
      it(`matches legacy for Omnath ${label}`, () => {
        const perm = makePerm("Omnath, Locus of Mana", 1, 1, counters);
        const state = buildState(perm, green);
        expect(permanentPower(state, "p1")).toBe(legacyPower(perm, state));
        expect(permanentToughness(state, "p1")).toBe(legacyToughness(perm, state));
        expect(permanentPower(state, "p1")).toBe(creaturePower(perm, state));
        expect(permanentToughness(state, "p1")).toBe(creatureToughness(perm, state));
      });
    }
  }
});

describe("EQUIVALENCE GATE — non-numeric ('*') printed P/T", () => {
  for (const counters of COUNTERS) {
    it(`'*'/'*' coerces to 0 in both engines, counters=${JSON.stringify(counters)}`, () => {
      const perm = makePerm("Tarmogoyf-ish", "*", "*", counters);
      const state = buildState(perm);
      expect(permanentPower(state, "p1")).toBe(legacyPower(perm, state));
      expect(permanentToughness(state, "p1")).toBe(legacyToughness(perm, state));
      expect(permanentPower(state, "p1")).toBe(creaturePower(perm, state));
    });
  }
});

describe("EQUIVALENCE GATE — off-battlefield / null-id permanents read printed+counters", () => {
  it("a permanent NOT on any battlefield (with state) reads printed+counters, not 0", () => {
    // Look-back semantics (CR 603.10a): a just-died Omnath snapshot reads its
    // last-known printed value, never a silent 0 from the layer engine.
    const detached = makePerm("Omnath, Locus of Mana", 1, 1, { "+1/+1": 1 });
    const state = createGameState({ userDeck: [], aiDeck: [] }); // detached is NOT placed on a battlefield
    expect(creaturePower(detached, state)).toBe(2);      // 1 printed + 1 counter (no green buff off-battlefield)
    expect(creatureToughness(detached, state)).toBe(2);
  });

  it("a null-id permanent (with state) reads printed+counters", () => {
    const noId = { card: { name: "Grizzly Bears", type: "Creature", power: 2, toughness: 2 }, counters: { "+1/+1": 1 } };
    const state = createGameState({ userDeck: [], aiDeck: [] });
    expect(creaturePower(noId, state)).toBe(3);
  });
});

describe("EQUIVALENCE GATE — explicit negative / zero toughness cases", () => {
  it("1/1 with three -1/-1 counters is -2/-2 in BOTH engines (raw CR value)", () => {
    const perm = makePerm("Grizzly Bears", 1, 1, { "-1/-1": 3 });
    const state = buildState(perm);
    expect(permanentToughness(state, "p1")).toBe(-2);
    expect(creatureToughness(perm, state)).toBe(-2);
  });
  it("0/0 printed reads 0/0 (no fabricated value)", () => {
    const perm = makePerm("Token", 0, 0, {});
    const state = buildState(perm);
    expect(permanentPower(state, "p1")).toBe(0);
    expect(permanentToughness(state, "p1")).toBe(0);
  });
});

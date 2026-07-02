/**
 * MULTI-COUNT CHOSEN TARGETS (CR 601.2c "up to N target …") — Slice A: return-from-graveyard.
 *
 * The single biggest corpus lever (~352 non-native cards carry an "up to N target" clause). The
 * resolver pipeline already supports it: targetsForAtom filters targets by atomIndex (returns ALL
 * of them), and applyReturnFromGraveyard already loops over ctx.targets. The only gaps were the
 * PARSER (emit maxTargets) and targeting.expandAtoms (enumerate the 0..N target SUBSETS). Both are
 * gated on maxTargets>1, so every single-target cast is byte-identical (flip-diff proved LOST=0).
 *
 * Slice A proves the mechanism on the safest atom family (own graveyard, no opponent interaction);
 * later slices generalize to "up to two target creatures" (damage/destroy/bounce/pump, 111 cards).
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createGameState, _resetIdsForTests } from "../gameState.js";
import { parseEffectProgram } from "./parser.js";
import { expandCastChoices } from "./targeting.js";
import { runEffectProgram } from "./runProgram.js";

beforeEach(() => _resetIdsForTests());

const prog = (oracle, type = "Sorcery") => parseEffectProgram({ type, oracle });
const withGraveyard = (gy) => {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return { ...s, players: { ...s.players, user: { ...s.players.user, graveyard: gy, hand: [] } } };
};
const comboSets = (combos) => combos.map((c) => (c.targets || []).map((t) => t.id).sort().join(",")).sort();

const CREATURES = [
  { id: "g1", name: "Bear", type: "Creature — Bear" },
  { id: "g2", name: "Elf", type: "Creature — Elf" },
  { id: "g3", name: "Ox", type: "Creature — Ox" },
];

describe("multi-count — parse shape", () => {
  it("'return up to two target creature cards …' → maxTargets:2, minTargets:0", () => {
    const p = prog("Return up to two target creature cards from your graveyard to your hand.");
    expect(p.confidence).toBe("high");
    expect(p.atoms[0]).toMatchObject({ op: "return-from-graveyard", targetType: "graveyardCard", cardFilter: "creature", maxTargets: 2, minTargets: 0 });
  });

  it("'up to three' scales the count", () => {
    expect(prog("Return up to three target creature cards from your graveyard to your hand.").atoms[0].maxTargets).toBe(3);
  });

  it("the SINGLE-target form is UNTOUCHED — no maxTargets (the gate)", () => {
    const a = prog("Return target creature card from your graveyard to your hand.").atoms[0];
    expect(a.op).toBe("return-from-graveyard");
    expect(a.maxTargets).toBeUndefined();
  });
});

describe("multi-count — cast expansion (targeting.expandAtoms)", () => {
  it("offers every 0..2 subset of the legal graveyard creatures, filtering non-creatures", () => {
    const s = withGraveyard([...CREATURES, { id: "n1", name: "Bolt", type: "Instant" }]);
    const combos = expandCastChoices(s, "user", prog("Return up to two target creature cards from your graveyard to your hand."));
    // C(3,0)+C(3,1)+C(3,2) = 1+3+3 = 7 ; n1 (Instant) never appears
    expect(comboSets(combos)).toEqual(["", "g1", "g1,g2", "g1,g3", "g2", "g2,g3", "g3"]);
    expect(combos.some((c) => (c.targets || []).some((t) => t.id === "n1"))).toBe(false);
  });

  it("an EMPTY graveyard still yields exactly one legal cast (choose zero — 'up to' permits it)", () => {
    const combos = expandCastChoices(withGraveyard([]), "user", prog("Return up to two target creature cards from your graveyard to your hand."));
    expect(comboSets(combos)).toEqual([""]);
  });

  it("the single-target form still enumerates one-target-per-card (no empty subset — the gate holds)", () => {
    const combos = expandCastChoices(withGraveyard(CREATURES), "user", prog("Return target creature card from your graveyard to your hand."));
    expect(comboSets(combos)).toEqual(["g1", "g2", "g3"]); // exactly one target each, never the empty cast
  });
});

describe("multi-count — runtime (resolver already loops)", () => {
  it("resolving a 2-card subset returns BOTH creatures to hand", () => {
    const s = withGraveyard(CREATURES);
    const p = prog("Return up to two target creature cards from your graveyard to your hand.");
    const targets = [
      { type: "graveyardCard", id: "g1", atomIndex: 0 },
      { type: "graveyardCard", id: "g3", atomIndex: 0 },
    ];
    const out = runEffectProgram(s, { source: { name: "Morbid Plunder" }, payload: { params: { program: p, controller: "user", targets } } });
    expect(out.players.user.hand.map((c) => c.id).sort()).toEqual(["g1", "g3"]);
    expect(out.players.user.graveyard.map((c) => c.id)).toEqual(["g2"]); // only the un-chosen one remains
  });

  it("resolving the empty subset returns nothing (a legal no-op cast)", () => {
    const s = withGraveyard(CREATURES);
    const p = prog("Return up to two target creature cards from your graveyard to your hand.");
    const out = runEffectProgram(s, { source: { name: "Morbid Plunder" }, payload: { params: { program: p, controller: "user", targets: [] } } });
    expect(out.players.user.hand).toHaveLength(0);
    expect(out.players.user.graveyard).toHaveLength(3);
  });
});

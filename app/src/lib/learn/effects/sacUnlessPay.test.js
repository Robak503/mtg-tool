/**
 * UPKEEP-SAC-UNLESS-PAY (echo-without-the-keyword) — "Sacrifice this <noun> unless you pay {cost}."
 *
 * The upkeep-tax body of a cumulative/echo-style permanent (Whipstitched Zombie, Drifting Djinn,
 * Dragon Tyrant, …) AND the ability granted to others by Kataki / Aura Flux / Pendrell Mists (each
 * affected permanent sacs ITSELF via ctx.sourceId). INVERTED polarity vs optional-mana-payment: PAY
 * (+afford) keeps the permanent; DECLINE or CAN'T-afford sacrifices the source. Must be matched WHOLE
 * pre-splitter — a leftover bare "sacrifice this creature" hits the edict parser → an unconditional
 * self-sac that drops the pay-escape (a cardinal FP).
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createGameState, createPermanent, _resetIdsForTests } from "../gameState.js";
import { parseEffectClause } from "./parser.js";
import { runEffectProgram, resolveSacUnlessPayChoice, autoPickSacUnlessPay } from "./runProgram.js";

beforeEach(() => _resetIdsForTests());

const clause = (oracle) => parseEffectClause(oracle, "Creature", { hasX: false });
const soleOp = (prog) => (prog?.atoms?.length === 1 ? prog.atoms[0].op : null);
const COST2 = clause("Sacrifice this creature unless you pay {2}.").atoms[0].cost; // {kind:"mana", mana:{generic:2,...}}

function stateWith({ mana = {} } = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  const src = createPermanent({ id: "src", card: { id: "c-src", name: "Taxed One", type: "Creature — Elemental", power: 2, toughness: 2, oracle: "" }, controller: "user" });
  const pool = { generic: 0, W: 0, U: 0, B: 0, R: 0, G: 0, C: 0, hybrid: [], ...mana };
  return { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [src], manaPool: pool } } };
}
const runAtom = (state, atom) => runEffectProgram(state, { source: { name: "Taxed One" }, payload: { params: { program: { atoms: [atom] }, controller: "user", targets: [], sourceId: "src" } } });

describe("sac-unless-pay — parse shape", () => {
  it("folds 'sacrifice this <noun> unless you pay {fixed}' into ONE atom (HIGH)", () => {
    const p = clause("Sacrifice this creature unless you pay {2}.");
    expect(p.confidence).toBe("high");
    expect(soleOp(p)).toBe("sac-unless-pay");
    expect(p.atoms[0].cost).toEqual({ kind: "mana", mana: { generic: 2, W: 0, U: 0, B: 0, R: 0, G: 0, C: 0, hybrid: [] } });
  });

  it("accepts colored costs + the granted-ability nouns (artifact/enchantment)", () => {
    expect(soleOp(clause("Sacrifice this creature unless you pay {1}{R}."))).toBe("sac-unless-pay");
    expect(soleOp(clause("Sacrifice this artifact unless you pay {1}."))).toBe("sac-unless-pay");
    expect(soleOp(clause("Sacrifice this enchantment unless you pay {2}."))).toBe("sac-unless-pay");
  });

  const drops = [
    ["an {X} cost is unmodeled", "Sacrifice this creature unless you pay {X}."],
    ["not the SOURCE — 'sacrifice a creature' is an edict", "Sacrifice a creature unless you pay {2}."],
    ["a trailing rider leaves residue", "Sacrifice this creature unless you pay {2}, then draw a card."],
    ["Draco's cost-reduction clause is unmodeled", "Sacrifice this creature unless you pay {10}. This cost is reduced by {2} for each creature you control."],
  ];
  for (const [why, oracle] of drops) {
    it(`does NOT emit sac-unless-pay: ${why}`, () => {
      expect(soleOp(clause(oracle))).not.toBe("sac-unless-pay");
    });
  }
});

describe("sac-unless-pay — autoPick (the crash path the design never exercised)", () => {
  it("returns true when affordable, false when the pool is empty (3-arg canAfford, no throw)", () => {
    const pc = { controller: "user", cost: COST2 };
    expect(autoPickSacUnlessPay(stateWith({ mana: { U: 2 } }), pc)).toBe(true);  // 2 mana → can pay {2}
    expect(autoPickSacUnlessPay(stateWith(), pc)).toBe(false);                    // empty pool → can't pay
  });
  it("returns false when the controller is gone", () => {
    expect(autoPickSacUnlessPay(stateWith(), { controller: "ghost", cost: COST2 })).toBe(false);
  });
});

describe("sac-unless-pay — runtime (inverted polarity)", () => {
  const atom = clause("Sacrifice this creature unless you pay {2}.").atoms[0];

  it("PAY + afford: the permanent SURVIVES and the mana is charged", () => {
    const paused = runAtom(stateWith({ mana: { U: 2 } }), atom);
    expect(paused.pendingChoice?.kind).toBe("sac-unless-pay");
    expect(paused.pendingChoice?.sourceId).toBe("src");
    const kept = resolveSacUnlessPayChoice(paused, true);
    expect(kept.pendingChoice).toBeFalsy();
    expect(kept.players.user.battlefield.map((p) => p.id)).toEqual(["src"]); // survives
    expect(kept.players.user.graveyard || []).toHaveLength(0);
    const poolLeft = kept.players.user.manaPool;
    expect((poolLeft.generic || 0) + poolLeft.U).toBe(0); // 2 mana spent
  });

  it("DECLINE: the source sacrifices ITSELF (battlefield → graveyard)", () => {
    const paused = runAtom(stateWith({ mana: { U: 2 } }), atom); // could pay, but declines
    const sacked = resolveSacUnlessPayChoice(paused, false);
    expect(sacked.pendingChoice).toBeFalsy();
    expect(sacked.players.user.battlefield).toHaveLength(0);
    expect(sacked.players.user.graveyard.map((c) => c.id)).toContain("c-src");
    expect(sacked.players.user.manaPool.U).toBe(2); // no mana spent on a decline
  });

  it("CAN'T afford + forced 'pay': payManaCost fabricates nothing → the source is sacrificed", () => {
    const paused = runAtom(stateWith(), atom); // empty pool
    const sacked = resolveSacUnlessPayChoice(paused, true);
    expect(sacked.pendingChoice).toBeFalsy();
    expect(sacked.players.user.battlefield).toHaveLength(0); // unpayable → sacrificed
    expect(sacked.players.user.graveyard.map((c) => c.id)).toContain("c-src");
  });
});

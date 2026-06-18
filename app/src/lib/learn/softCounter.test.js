/**
 * SOFT-CNT — "soft" counters: "Counter target spell unless its controller pays {N}." (Force Spike /
 * Mana Leak / Mana Tithe / Spell Pierce / Stubborn Denial / Daze / Quench / …).
 *
 * Extends the hard-counter atom (P3.1) with an `unlessPay` fixed-generic escape resolved at the counter's
 * resolution: the TARGETED SPELL'S CONTROLLER (an opponent in 4P, NOT the counter's caster) chooses to pay
 * {N} to save the spell, else it's countered. Reuses the pending-choice seam + the cast path's payment
 * planner (payGenericMana). This file pins:
 *   1. the parser — the clean fixed-{N} shapes parse HIGH; {X}/variable/rider/modal/other-filter stay LOW;
 *   2. payGenericMana (manaModel) — pays from pool + taps sources, refuses when unaffordable (no fabrication);
 *   3. the atom — applyCounter flags the spell's controller's pay-choice instead of countering outright;
 *   4. the decision — autoPickSoftCounterPay (pay if able) + resolveSoftCounterChoice (pay→survives,
 *      decline/unaffordable→countered, stale spell→fizzle);
 *   5. the live cast path — the user casts Force Spike on an AI spell → it suspends on the AI's pay-choice;
 *   6. native coverage — Force Spike / Spell Pierce are native-spell; Clash of Wills / Rune Snag are not.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { createGameState, _resetIdsForTests, createPermanent } from "./gameState.js";
import { legalActionsForPlayer, filterActions } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { resolveAtom } from "./effects/effectAtoms.js";
import { resolveSoftCounterChoice, autoPickSoftCounterPay } from "./effects/runProgram.js";
import { payGenericMana } from "./manaModel.js";
import { parseEffectClause, programConfidence } from "./effects/parser.js";
import { classifyCard } from "./coverage.js";
import { RESOLVER_KEYS } from "./resolvers.js";

beforeEach(() => _resetIdsForTests());

const atomsOf = (txt) => parseEffectClause(txt, "Instant")?.atoms;
const isHigh = (txt) => programConfidence(parseEffectClause(txt, "Instant")) === "high";

describe("parser — soft-counter atom (fixed-{N} only)", () => {
  it("parses the clean shapes to a counter atom with unlessPay", () => {
    expect(atomsOf("Counter target spell unless its controller pays {1}.")).toEqual([{ op: "counter", spellFilter: "any", targetType: "spell", unlessPay: 1 }]);
    expect(atomsOf("Counter target spell unless its controller pays {3}.")).toEqual([{ op: "counter", spellFilter: "any", targetType: "spell", unlessPay: 3 }]);
    expect(atomsOf("Counter target noncreature spell unless its controller pays {2}.")).toEqual([{ op: "counter", spellFilter: "noncreature", targetType: "spell", unlessPay: 2 }]);
    expect(isHigh("Counter target spell unless its controller pays {1}.")).toBe(true);
  });

  it("leaves the plain hard counter untouched (no unlessPay)", () => {
    expect(atomsOf("Counter target spell.")).toEqual([{ op: "counter", spellFilter: "any", targetType: "spell" }]);
  });

  it("CREED: {X} / variable / rider / modal / other-filter soft counters stay LOW → Arbiter", () => {
    expect(isHigh("Counter target spell unless its controller pays {X}.")).toBe(false);                                   // Clash of Wills
    expect(isHigh("Counter target spell unless its controller pays {2} plus an additional {2} for each card named Rune Snag in each graveyard.")).toBe(false); // Rune Snag
    expect(isHigh("Counter target spell unless its controller pays {1}. That player discards a card.")).toBe(false);      // Frightful Delusion (rider)
    expect(isHigh("Counter target spell unless its controller pays {1} and 1 life.")).toBe(false);                        // Mundungu (non-mana cost)
    expect(isHigh("Counter target instant or sorcery spell unless its controller pays {1}.")).toBe(false);               // Disrupt (filter not in any/noncreature/creature)
    expect(isHigh("Counter target creature or planeswalker spell unless its controller pays {3}.")).toBe(false);         // Reject
  });
});

describe("manaModel.payGenericMana — fixed generic payment from pool + sources", () => {
  const island = (id, controller) => createPermanent({ id, card: { id: `c${id}`, name: "Island", type: "Land", oracle: "{T}: Add {U}." }, controller });
  function stateWith({ lands = 0, pool = {} } = {}) {
    const s = createGameState({ userDeck: [], aiDeck: [] });
    const bf = [];
    for (let i = 0; i < lands; i++) bf.push(island(`L${i}`, "user"));
    return { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: bf, manaPool: { ...s.players.user.manaPool, ...pool } } } };
  }

  it("pays {2} by tapping two untapped lands", () => {
    const { state, paid } = payGenericMana(stateWith({ lands: 2 }), "user", 2);
    expect(paid).toBe(true);
    expect(state.players.user.battlefield.every((p) => p.tapped)).toBe(true);
  });

  it("pays from floating pool first (no taps needed)", () => {
    const { state, paid } = payGenericMana(stateWith({ lands: 1, pool: { U: 2 } }), "user", 1);
    expect(paid).toBe(true);
    expect(state.players.user.battlefield[0].tapped).toBe(false); // land untouched — pool covered it
    expect(state.players.user.manaPool.U).toBe(1);                // 2 floating − 1 spent
  });

  it("refuses when unaffordable — paid:false, state UNCHANGED (never fabricated mana)", () => {
    const before = stateWith({ lands: 1 });
    const { state, paid } = payGenericMana(before, "user", 3);
    expect(paid).toBe(false);
    expect(state).toBe(before); // identity-equal: nothing tapped, no mana invented
  });

  it("amount 0 is a trivial paid:true no-op", () => {
    const before = stateWith({ lands: 1 });
    expect(payGenericMana(before, "user", 0)).toEqual({ state: before, paid: true });
  });
});

// ---- shared helpers (mirror counterWiring.test.js) ----
const spellOnStack = (id, name, type, controller) => ({
  id, kind: "spell", controller, targets: [], cost: null,
  source: { id: `card-${id}`, name, type, oracle: "" },
  payload: { resolver: RESOLVER_KEYS.EFFECT_PROGRAM, params: {} },
});
const island = (id, controller) => createPermanent({ id, card: { id: `c${id}`, name: "Island", type: "Land", oracle: "{T}: Add {U}." }, controller });

function softCounterState({ aiLands = 0 } = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  const bf = [];
  for (let i = 0; i < aiLands; i++) bf.push(island(`AL${i}`, "ai"));
  return {
    ...s, stack: [spellOnStack("s1", "Divination", "Sorcery", "ai")],
    players: { ...s.players, ai: { ...s.players.ai, battlefield: bf } },
  };
}
const COUNTER_ATOM = { op: "counter", spellFilter: "any", targetType: "spell", unlessPay: 1 };
const resolveCounter = (state) => resolveAtom(state, COUNTER_ATOM, { controller: "user", targets: [{ type: "spell", id: "s1" }], cardName: "Force Spike" });

describe("atom — applyCounter flags the spell controller's pay-choice (does not counter outright)", () => {
  it("sets a soft-counter pending choice for the TARGETED spell's controller (the AI), not the caster", () => {
    const st = resolveCounter(softCounterState());
    expect(st.pendingChoice).toMatchObject({ kind: "soft-counter", controller: "ai", amount: 1, spellId: "s1" });
    expect(st.stack.map((o) => o.id)).toEqual(["s1"]); // spell still on the stack — not yet countered
  });
});

describe("decision — pay → survives, decline / unaffordable → countered", () => {
  it("autoPickSoftCounterPay: true when the controller can afford {N}, false when it can't", () => {
    expect(autoPickSoftCounterPay(resolveCounter(softCounterState({ aiLands: 1 })), { controller: "ai", amount: 1 })).toBe(true);
    expect(autoPickSoftCounterPay(resolveCounter(softCounterState({ aiLands: 0 })), { controller: "ai", amount: 1 })).toBe(false);
  });

  it("PAY (affordable): the spell survives on the stack and a source is tapped", () => {
    const settled = resolveSoftCounterChoice(resolveCounter(softCounterState({ aiLands: 1 })), true);
    expect(settled.stack.map((o) => o.id)).toEqual(["s1"]);                 // not countered
    expect(settled.players.ai.battlefield[0].tapped).toBe(true);            // paid {1} — land tapped
    expect(settled.players.ai.graveyard).toHaveLength(0);
  });

  it("DECLINE: the spell is countered → its controller's graveyard", () => {
    const settled = resolveSoftCounterChoice(resolveCounter(softCounterState({ aiLands: 1 })), false);
    expect(settled.stack).toHaveLength(0);
    expect(settled.players.ai.graveyard.map((c) => c.name)).toEqual(["Divination"]);
    expect(settled.log.some((l) => l.effect === "counter" && l.via === "soft-counter")).toBe(true);
  });

  it("CREED: pay=true but UNAFFORDABLE falls through to counter (never a free save)", () => {
    const settled = resolveSoftCounterChoice(resolveCounter(softCounterState({ aiLands: 0 })), true);
    expect(settled.stack).toHaveLength(0);
    expect(settled.players.ai.graveyard.map((c) => c.name)).toEqual(["Divination"]);
  });

  it("a spell that left the stack mid-pause is a clean fizzle (no error)", () => {
    let st = resolveCounter(softCounterState({ aiLands: 1 }));
    st = { ...st, stack: [] }; // the target vanished
    const settled = resolveSoftCounterChoice(st, false);
    expect(settled.log.some((l) => l.effect === "soft-counter-fizzle")).toBe(true);
  });
});

describe("live cast path — the user casts Force Spike on an AI spell", () => {
  const FORCE_SPIKE = { id: "fs", name: "Force Spike", type: "Instant", oracle: "Counter target spell unless its controller pays {1}.", mana: "{U}" };
  function responseState() {
    const s = createGameState({ userDeck: [], aiDeck: [] });
    return {
      ...s, phase: "precombat-main", step: "main", activePlayer: "ai", priorityHolder: "user", consecutivePasses: 0,
      stack: [spellOnStack("s1", "Divination", "Sorcery", "ai")],
      players: { ...s.players, user: { ...s.players.user, hand: [FORCE_SPIKE], manaPool: { ...s.players.user.manaPool, U: 1 } } },
    };
  }

  it("offers Force Spike against a stacked spell, then suspends on the AI's pay-or-be-countered choice", () => {
    const state = responseState();
    const cast = filterActions(legalActionsForPlayer(state, "user"), "cast-spell").find((c) => c.cardId === "fs");
    expect(cast).toBeTruthy();
    expect(cast.targets[0]).toMatchObject({ type: "spell", id: "s1" });
    const resolved = resolveTopOfStack(dispatchAction(state, cast));
    expect(resolved.pendingChoice).toMatchObject({ kind: "soft-counter", controller: "ai", amount: 1 });
    expect(resolved.stack.some((o) => o.id === "s1")).toBe(true); // target still pending the decision
  });
});

describe("coverage — clean soft counters are native-spell; variable/rider stay Arbiter", () => {
  it("Force Spike / Spell Pierce are native-spell", () => {
    expect(classifyCard({ name: "Force Spike", type: "Instant", oracle: "Counter target spell unless its controller pays {1}." })).toBe("native-spell");
    expect(classifyCard({ name: "Spell Pierce", type: "Instant", oracle: "Counter target noncreature spell unless its controller pays {2}." })).toBe("native-spell");
  });
  it("Clash of Wills ({X}) / Rune Snag (variable) are NOT native", () => {
    expect(classifyCard({ name: "Clash of Wills", type: "Instant", oracle: "Counter target spell unless its controller pays {X}." })).not.toBe("native-spell");
    expect(classifyCard({ name: "Rune Snag", type: "Instant", oracle: "Counter target spell unless its controller pays {2} plus an additional {2} for each card named Rune Snag in each graveyard." })).not.toBe("native-spell");
  });
});

/**
 * optionalPaymentTargetedPayoff.test.js — "you may pay {N}. If you do, <TARGETED effect>" (CR 603.7c).
 *
 * `matchOptionalManaPayment` used to reject any payoff needing a chosen target, and said why in its own comment:
 * "a chosen-target payoff would need its target threaded through the pay-choice (unbuilt) → keep it LOW".
 * That thread is built now: the target rides the pay/decline suspend as `pendingChoice.targets` and the settler
 * replays it into the payoff. 21 cards graduated (Surgespanner, Equilibrium, Genesis, Kalastria Highborn,
 * Shu Yun, Serene Steward, the Initiate cycle …).
 *
 * ⭐ WHY THE ORDERING IS LEGAL. The target is chosen when the ability is PUT ON THE STACK (CR 603.3d); the
 * optional payment happens as it RESOLVES. So declaring the payoff's target type on the wrapper makes the
 * trigger lock its target at flush — on time — and the later pay/decline cannot change it. Declining runs
 * nothing, and the target was still legally chosen.
 *
 * ⛔ THE TWO GUARDS THAT KEEP THIS HONEST, both pinned below:
 *   1. EXACTLY ONE chosen target type, else refuse — one `targetType` on the wrapper cannot express two.
 *   2. The trigger-flush auto-chooser only fires when it can place the target on a PROVABLY correct side, so
 *      the wrapper's target INTENT is DELEGATED to its payoff atoms; disagreement or unreadability → ambiguous
 *      → the trigger routes to the Arbiter rather than risk a wrong target.
 */
import { describe, it, expect, beforeEach } from "vitest";

import { classifyCard, isNativeTier } from "./coverage.js";
import { detectTriggers } from "./triggers.js";
import { triggerRoutesNatively } from "./triggerRouting.js";
import { parseEffectClause } from "./effects/parser.js";
import { atomTargetIntent } from "./effects/programQueries.js";
import { resolveOptionalManaPaymentChoice } from "./effects/runProgram.js";
import { resolveAtom } from "./effects/effectAtoms.js";
import { createGameState, createPermanent, _resetIdsForTests, findPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const CREA = { name: "Probe", type: "Creature — Human", mana: "{2}{W}", power: 2, toughness: 2 };
const routes = (oracle) => {
  const c = { ...CREA, oracle };
  const t = detectTriggers(c);
  return t.length > 0 && t.every(triggerRoutesNatively);
};
const prog = (clause, type = "Creature") => parseEffectClause(clause, type, { hasX: false });

describe("⭐ a TARGETED payoff is now admitted, and routes on a trigger", () => {
  it("enemy-intent and own-intent payoffs both classify native and route", () => {
    for (const oracle of [
      "When this creature enters, you may pay {1}. If you do, put a -1/-1 counter on target creature.",
      "Whenever this creature attacks, you may pay {1}. If you do, target creature can't block this turn.",
      "When this creature enters, you may pay {1}. If you do, put a +1/+1 counter on target creature.",
    ]) {
      expect(isNativeTier(classifyCard({ ...CREA, oracle })), oracle).toBe(true);
      expect(routes(oracle), oracle).toBe(true);
    }
  });

  it("the wrapper carries the payoff's single chosen target type up to itself", () => {
    const p = prog("you may pay {1}. If you do, put a -1/-1 counter on target creature");
    expect(p.atoms).toHaveLength(1);
    expect(p.atoms[0].op).toBe("optional-mana-payment");
    expect(p.atoms[0].targetType).toBe("creature");
  });

  it("⛔ a TARGETLESS payoff is byte-identical to before — targetType stays null", () => {
    // The pre-existing family (Lifecrafter's Bestiary, Mind's Eye, Urza's Miter) must not shift.
    // the draw atom's HIGH gate is Instant/Sorcery-only (matchOptionalManaPayment documents passing
    // literal "Instant" internally for exactly this reason), so probe the clause the same way.
    const p = prog("you may pay {G}. If you do, draw a card", "Instant");
    expect(p.atoms[0].op).toBe("optional-mana-payment");
    expect(p.atoms[0].targetType).toBe(null);
    expect(routes("Whenever you cast a creature spell, you may pay {G}. If you do, draw a card.")).toBe(true);
  });

  it("⛔ TWO distinct chosen target types are REFUSED — one targetType cannot express two", () => {
    const p = prog("you may pay {1}. If you do, this creature deals 2 damage to target creature and target player loses 1 life");
    const atoms = p?.atoms || [];
    expect(atoms.some((a) => a.op === "optional-mana-payment")).toBe(false);
  });
});

describe("⛔⭐ the target INTENT is DELEGATED to the payoff (the auto-chooser's safety gate)", () => {
  it("an enemy-intent payoff makes the wrapper enemy-intent", () => {
    const p = prog("you may pay {1}. If you do, put a -1/-1 counter on target creature");
    expect(atomTargetIntent(p.atoms[0])).toBe("enemy");
  });

  it("an own-intent payoff makes the wrapper own-intent", () => {
    const p = prog("you may pay {1}. If you do, put a +1/+1 counter on target creature");
    expect(atomTargetIntent(p.atoms[0])).toBe("own");
  });

  it("⛔⭐ an UNREADABLE inner intent yields 'ambiguous' — the refusing direction", () => {
    // THE safety test. If the wrapper ever reported a concrete side for a payoff whose side we cannot read, the
    // trigger flush would auto-target blind. Hand-built so the payoff's intent is unknowable.
    expect(atomTargetIntent({ op: "optional-mana-payment", targetType: "creature", effectAtoms: [{ op: "totally-unknown-op", targetType: "creature" }] })).toBe("ambiguous");
    expect(atomTargetIntent({ op: "optional-mana-payment", targetType: "creature", effectAtoms: [] })).toBe("ambiguous");
  });

  it("⛔ payoff atoms wanting OPPOSITE sides yield 'ambiguous', never a coin-flip", () => {
    const mixed = { op: "optional-mana-payment", targetType: "creature", effectAtoms: [
      { op: "destroy", targetType: "creature" },        // enemy
      { op: "cant-be-blocked", targetType: "creature" }, // own
    ] };
    expect(atomTargetIntent(mixed)).toBe("ambiguous");
  });
});

describe("⛔⭐ RUNTIME — the chosen target survives the pay/decline suspend", () => {
  const board = () => {
    const s = createGameState({ userDeck: [], aiDeck: [] });
    const src = createPermanent({ id: "src", card: { id: "cs", name: "Sniper", type: "Creature — Human", power: 1, toughness: 1 }, controller: "user" });
    const victim = createPermanent({ id: "victim", card: { id: "cv", name: "Bear", type: "Creature — Bear", power: 2, toughness: 2 }, controller: "ai" });
    return { ...s,
      players: {
        ...s.players,
        user: { ...s.players.user, battlefield: [src], manaPool: { ...s.players.user.manaPool, C: 3 } },
        ai: { ...s.players.ai, battlefield: [victim] },
      } };
  };
  const ATOM = { op: "optional-mana-payment", cost: { kind: "mana", mana: { generic: 1 } }, targetType: "creature",
    effectAtoms: [{ op: "add-counter", counterType: "-1/-1", amount: 1, targetType: "creature" }] };
  const counters = (s) => findPermanent(s, "victim")?.permanent?.counters?.["-1/-1"] || 0;

  it("⭐ PAY → the payoff lands on the CHOSEN target, not on nobody", () => {
    // THE test this whole slice rests on. Before the thread existed the settler passed `targets: []`, so a
    // targeted payoff would have resolved against NOTHING — which is exactly why the parser refused it.
    let s = resolveAtom(board(), ATOM, { controller: "user", targets: [{ type: "creature", id: "victim" }], cardName: "Sniper" });
    expect(s.pendingChoice?.kind).toBe("optional-mana-payment");
    expect(s.pendingChoice.targets).toEqual([{ type: "creature", id: "victim" }]);
    s = resolveOptionalManaPaymentChoice(s, true);
    expect(counters(s)).toBe(1);
  });

  it("⛔ DECLINE → nothing happens to the target at all", () => {
    let s = resolveAtom(board(), ATOM, { controller: "user", targets: [{ type: "creature", id: "victim" }], cardName: "Sniper" });
    s = resolveOptionalManaPaymentChoice(s, false);
    expect(counters(s)).toBe(0);
  });

  it("⛔ a targetless payoff still suspends with an EMPTY target list (no regression)", () => {
    const s = resolveAtom(board(), { op: "optional-mana-payment", cost: { kind: "mana", mana: { generic: 1 } }, effectAtoms: [{ op: "draw", amount: 1 }] }, { controller: "user", cardName: "X" });
    expect(s.pendingChoice.targets).toEqual([]);
  });
});

describe("⛔ the sibling guard is untouched — a NON-LAST pausing payoff must still be refused", () => {
  it("'scry 1, then draw a card' after a payment stays unmodeled (a dropped-atom FP otherwise)", () => {
    // The settler chains a mid-payoff pause onto the PROGRAM continuation, which would drop the atoms after it.
    // Threading a target must not have relaxed this.
    const p = prog("you may pay {1}. If you do, scry 1, then draw a card", "Instant");
    expect((p?.atoms || []).some((a) => a.op === "optional-mana-payment")).toBe(false);
  });
});

/**
 * OPTIONAL-MANA-PAYMENT (CR 603.7c) — "you may pay {cost}. If you do, <effect>." (Lifecrafter's Bestiary /
 * Mind's Eye / Inheritance / Horizon-Origin-Panic Spellbomb / Urza's Miter / Symmetry Matrix / Pedantic
 * Learning / …). The parser collapses the two-sentence shape to ONE optional-mana-payment atom; the resolver
 * SUSPENDS on a real pay/decline choice instead of resolving the payoff outright. On PAY the mana is deducted
 * (the shared payManaCost) AND the payoff atoms run; on DECLINE nothing happens; the payoff NEVER runs on an
 * unaffordable pay (payManaCost never fabricates mana). This file pins:
 *   1. the parser — the "If you do, <modeled-effect>" shapes parse HIGH; "When you do" (reflexive) / {X} cost /
 *      unmodeled payoff / a second "if you do" stay LOW (the CREED anti-FP corpus);
 *   2. the atom — applyOptionalManaPayment flags the controller's pay-choice (does not run the payoff);
 *   3. the resolution — PAY (affordable) deducts mana + draws; DECLINE deducts nothing + draws nothing;
 *      pay-but-UNAFFORDABLE falls through to no-op (never a free draw); the self-counter payoff threads sourceId;
 *   4. the decision — autoPickOptionalManaPayment = pay-if-able;
 *   5. native coverage — Lifecrafter's Bestiary / Inheritance flip native-trigger; the CREED anti-FPs stay body-only.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { createGameState, _resetIdsForTests, createPermanent } from "./gameState.js";
import { parseEffectClause, programConfidence } from "./effects/parser.js";
import { runEffectProgram, resolveOptionalManaPaymentChoice, autoPickOptionalManaPayment } from "./effects/runProgram.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const atomsOf = (txt) => parseEffectClause(txt, "Instant")?.atoms;
const isHigh = (txt) => programConfidence(parseEffectClause(txt, "Instant")) === "high";

// ─── 1. PARSER ────────────────────────────────────────────────────────────────
describe("parser — optional-mana-payment atom (you may pay {cost}. If you do, <effect>)", () => {
  it("parses the draw-payoff shape to one optional-mana-payment atom carrying the cost + payoff atoms", () => {
    expect(atomsOf("you may pay {G}. If you do, draw a card")).toEqual([
      { op: "optional-mana-payment", cost: { kind: "mana", mana: { generic: 0, W: 0, U: 0, B: 0, R: 0, G: 1, C: 0, hybrid: [] } }, effectAtoms: [{ op: "draw", amount: 1, targetType: null }], targetType: null },
    ]);
    expect(isHigh("you may pay {3}. If you do, draw a card")).toBe(true);
    expect(isHigh("you may pay {1}{U}. If you do, draw a card")).toBe(true); // multi-pip colored cost
  });

  it("CREED — 'When you do' (REFLEXIVE, not 'If you do') stays LOW (the optional-primary reflexive gate)", () => {
    // diceRoll.test.js pins this LOW via matchReflexiveTrigger; the optional-mana-payment matcher must NOT
    // poach the "When you do" connective (a reflexive triggered ability, not a same-resolution conditional).
    expect(isHigh("you may pay {1}. When you do, draw a card")).toBe(false);
  });

  it("CREED — an {X} cost / an unmodeled payoff / a second 'if you do' stay LOW → Arbiter", () => {
    expect(isHigh("you may pay {X}. If you do, draw X cards")).toBe(false);                 // Shanna — {X} + cap unmodeled
    expect(isHigh("you may pay {2}. If you do, sacrifice a creature")).toBe(false);          // unmodeled payoff (a choice)
    expect(isHigh("you may pay {1}. If you do, draw a card. If you do, draw a card")).toBe(false); // chained 2nd "if you do"
    expect(isHigh("you may pay {2}")).toBe(false);                                           // bare optional cost, no payoff
  });

  it("a chosen-TARGET payoff stays LOW (target wiring through the pay-choice is unbuilt) — Frenzied Goblin", () => {
    // "you may pay {R}. If you do, target creature can't block this turn." (Frenzied Goblin) — the payoff needs
    // a chosen target threaded through the pay-choice this slice does not build → LOW → Arbiter (a SAFE FN).
    expect(isHigh("you may pay {R}. If you do, target creature can't block this turn")).toBe(false);
  });

  it("WI-3 CREED — a NON-LAST pausing payoff atom stays LOW; a LAST-position pause is fine", () => {
    // "scry 1, then draw a card" → [scry, draw]: the scry PAUSES (setPendingScryChoice) and the settler's
    // chained resume points at the PROGRAM continuation, not the payoff tail — the draw would be silently
    // dropped (a forbidden dropped-atom FP). The PAUSING_ATOM_OPS gate rejects it → LOW → Arbiter (SAFE FN).
    expect(isHigh("you may pay {1}. If you do, scry 1, then draw a card")).toBe(false);
    // A pausing payoff atom in LAST position drops nothing (nothing follows it) — stays HIGH.
    expect(isHigh("you may pay {1}. If you do, draw a card, then scry 1")).toBe(true);
  });
});

// ─── shared runtime harness ─────────────────────────────────────────────────────
const forest = (id, controller) => createPermanent({ id, card: { id: `c${id}`, name: "Forest", type: "Land", oracle: "{T}: Add {G}." }, controller });
// Build an effect-program stack object the way buildTriggerStack does (controller = the player who pays; the
// optional-mana-payment atom is the sole atom). `sourceId` rides on so a self-counter payoff binds to the source.
const ompObject = (program, { controller = "user", sourceId = null } = {}) => ({
  source: { name: "Test Source" },
  payload: { params: { program, controller, targets: [], sourceId, context: {} } },
});
function tableWith({ forests = 0, library = [], poolG = 0 } = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  const bf = [];
  for (let i = 0; i < forests; i++) bf.push(forest(`F${i}`, "user"));
  return {
    ...s,
    players: { ...s.players, user: { ...s.players.user, battlefield: bf, library, hand: [], manaPool: { ...s.players.user.manaPool, G: poolG } } },
  };
}

// ─── 2. ATOM — flags the choice, does not run the payoff ────────────────────────
describe("atom — applyOptionalManaPayment flags the controller's pay-choice (payoff not yet run)", () => {
  it("sets an optional-mana-payment pending choice carrying the cost + payoff atoms; nothing drawn yet", () => {
    const program = parseEffectClause("you may pay {G}. If you do, draw a card", "Instant");
    const paused = runEffectProgram(tableWith({ forests: 1, library: [{ id: "x", name: "Card", type: "Land" }] }), ompObject(program));
    expect(paused.pendingChoice).toMatchObject({ kind: "optional-mana-payment", controller: "user" });
    expect(paused.pendingChoice.cost).toEqual({ kind: "mana", mana: { generic: 0, W: 0, U: 0, B: 0, R: 0, G: 1, C: 0, hybrid: [] } });
    expect(paused.pendingChoice.effectAtoms).toEqual([{ op: "draw", amount: 1, targetType: null }]);
    expect(paused.players.user.hand).toHaveLength(0);  // payoff NOT run — the choice hasn't been made
    expect(paused.pendingChoice.resume).toBeTruthy();   // runProgram attached the resume
  });
});

// ─── 3. RESOLUTION — pay / decline / unaffordable ───────────────────────────────
describe("resolution — PAY deducts mana + runs the payoff; DECLINE does nothing", () => {
  const program = () => parseEffectClause("you may pay {G}. If you do, draw a card", "Instant");

  it("PAY (affordable): the {G} is paid (a Forest taps) AND a card is drawn", () => {
    const paused = runEffectProgram(tableWith({ forests: 1, library: [{ id: "x", name: "Card", type: "Land" }] }), ompObject(program()));
    const settled = resolveOptionalManaPaymentChoice(paused, true);
    expect(settled.pendingChoice).toBeFalsy();
    expect(settled.players.user.battlefield[0].tapped).toBe(true);  // paid {G} — Forest tapped
    expect(settled.players.user.hand).toHaveLength(1);              // payoff ran — drew the card
    expect(settled.players.user.library).toHaveLength(0);
  });

  it("DECLINE: no mana spent (Forest untapped) AND no card drawn", () => {
    const paused = runEffectProgram(tableWith({ forests: 1, library: [{ id: "x", name: "Card", type: "Land" }] }), ompObject(program()));
    const settled = resolveOptionalManaPaymentChoice(paused, false);
    expect(settled.pendingChoice).toBeFalsy();
    expect(settled.players.user.battlefield[0].tapped).toBe(false); // declined — Forest untouched
    expect(settled.players.user.hand).toHaveLength(0);              // payoff did NOT run
    expect(settled.players.user.library).toHaveLength(1);
  });

  it("CREED — pay=true but UNAFFORDABLE runs NO payoff (never a free draw, never fabricated mana)", () => {
    const paused = runEffectProgram(tableWith({ forests: 0, library: [{ id: "x", name: "Card", type: "Land" }] }), ompObject(program()));
    const settled = resolveOptionalManaPaymentChoice(paused, true);
    expect(settled.pendingChoice).toBeFalsy();
    expect(settled.players.user.hand).toHaveLength(0);   // could not pay → payoff never ran
    expect(settled.players.user.library).toHaveLength(1);
  });

  it("PAY from a floating pool (no taps needed) still draws", () => {
    const paused = runEffectProgram(tableWith({ forests: 1, poolG: 1, library: [{ id: "x", name: "Card", type: "Land" }] }), ompObject(program()));
    const settled = resolveOptionalManaPaymentChoice(paused, true);
    expect(settled.players.user.battlefield[0].tapped).toBe(false); // pool covered {G} — land untouched
    expect(settled.players.user.manaPool.G).toBe(0);                // 1 floating − 1 spent
    expect(settled.players.user.hand).toHaveLength(1);
  });

  it("self-counter payoff threads sourceId — Murasa Ranger's '…put two +1/+1 counters on this creature' lands on the source", () => {
    const program = parseEffectClause("you may pay {G}. If you do, put two +1/+1 counters on this creature", "Instant");
    const ranger = createPermanent({ id: "rg", card: { id: "crg", name: "Murasa Ranger", type: "Creature — Human", power: 2, toughness: 3 }, controller: "user" });
    let s = tableWith({ forests: 1 });
    s = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [...s.players.user.battlefield, ranger] } } };
    const paused = runEffectProgram(s, ompObject(program, { sourceId: "rg" }));
    const settled = resolveOptionalManaPaymentChoice(paused, true);
    const rg = settled.players.user.battlefield.find((p) => p.id === "rg");
    expect(rg.counters?.["+1/+1"]).toBe(2);  // two +1/+1 counters landed on the source (sourceId threaded)
  });
});

// ─── 4. DECISION — pay-if-able ──────────────────────────────────────────────────
describe("decision — autoPickOptionalManaPayment = pay if able", () => {
  it("true when the controller can afford the cost, false when it can't", () => {
    const program = parseEffectClause("you may pay {G}. If you do, draw a card", "Instant");
    const afford = runEffectProgram(tableWith({ forests: 1 }), ompObject(program));
    const broke = runEffectProgram(tableWith({ forests: 0 }), ompObject(program));
    expect(autoPickOptionalManaPayment(afford, afford.pendingChoice)).toBe(true);
    expect(autoPickOptionalManaPayment(broke, broke.pendingChoice)).toBe(false);
  });
});

// ─── 5. COVERAGE — native flips + CREED body-only pins ──────────────────────────
describe("coverage — Lifecrafter's Bestiary / Inheritance flip native; CREED anti-FPs stay body-only", () => {
  it("Lifecrafter's Bestiary (Slivers deck) flips native-trigger — its upkeep scry was already native; flipping the optional-pay reflexive flips the whole card", () => {
    expect(classifyCard({ name: "Lifecrafter's Bestiary", type: "Artifact", oracle: "At the beginning of your upkeep, scry 1.\nWhenever you cast a creature spell, you may pay {G}. If you do, draw a card." })).toBe("native-trigger");
  });
  it("Inheritance / Soul Net / Goblinslide flip native-trigger", () => {
    expect(classifyCard({ name: "Inheritance", type: "Enchantment", oracle: "Whenever a creature dies, you may pay {3}. If you do, draw a card." })).toBe("native-trigger");
    expect(classifyCard({ name: "Soul Net", type: "Artifact", oracle: "Whenever a creature dies, you may pay {1}. If you do, you gain 1 life." })).toBe("native-trigger");
    expect(classifyCard({ name: "Goblinslide", type: "Enchantment", oracle: "Whenever you cast a noncreature spell, you may pay {1}. If you do, create a 1/1 red Goblin creature token with haste." })).toBe("native-trigger");
  });
  it("CREED — an optional-pay whose payoff is UNMODELED stays body-only (the whole card stays on the Arbiter)", () => {
    // Saheeli, the Sun's Brilliance-style unmodeled payoff: a "you may pay {X}. If you do, …" / a payoff with a
    // chosen target / a non-mana cost keeps the trigger LOW → the permanent classifies body-only, never native.
    expect(classifyCard({ name: "Fake X Payoff", type: "Enchantment", oracle: "Whenever you cast a spell, you may pay {X}. If you do, draw X cards." })).toBe("body-only");
    expect(classifyCard({ name: "Fake Targeted Payoff", type: "Enchantment", oracle: "Whenever you cast a spell, you may pay {R}. If you do, target creature can't block this turn." })).toBe("body-only");
  });
});

// ─── 6. WI-3 belt-and-braces — a mid-payoff pause routes to the Arbiter, never a silent drop ──────
describe("WI-3 belt-and-braces — a NON-LAST payoff atom that pauses routes to the Arbiter", () => {
  it("hand-crafted 2-atom payoff whose FIRST atom pauses (scry) → pendingArbiter, inner choice cleared, no dropped draw", () => {
    // The parser gate (pinned in §1) makes this pendingChoice shape unreachable for native programs;
    // hand-craft it to pin the runtime guard: the settler must NEVER chain past a mid-payoff pause
    // (the chained resume points at the PROGRAM continuation, so the trailing draw would be dropped) —
    // it clears the inner scry choice and routes to the Arbiter with an honest reason (CREED-safe FN).
    const s = tableWith({ forests: 1, library: [{ id: "a", name: "A", type: "Land" }, { id: "b", name: "B", type: "Land" }] });
    const paused = {
      ...s,
      pendingChoice: {
        kind: "optional-mana-payment", controller: "user", sourceName: "Test Source",
        cost: { kind: "mana", mana: { generic: 0, W: 0, U: 0, B: 0, R: 0, G: 1, C: 0, hybrid: [] } },
        effectAtoms: [{ op: "scry", amount: 1, targetType: null }, { op: "draw", amount: 1, targetType: null }],
        resume: { program: null, controller: "user", targets: [], nextAtomIndex: 0, cardName: "Test Source" },
      },
    };
    const settled = resolveOptionalManaPaymentChoice(paused, true);
    expect(settled.pendingArbiter).toBeTruthy();                          // honest hand-off, never half-resolved
    expect(settled.pendingArbiter.reason).toMatch(/paused mid-payoff/);
    expect(settled.pendingChoice).toBeFalsy();                            // the inner scry choice was cleared — no wedge
    expect(settled.players.user.hand).toHaveLength(0);                    // the trailing draw did NOT silently run
    expect(settled.players.user.library).toHaveLength(2);                 // …and nothing left the library
  });
});

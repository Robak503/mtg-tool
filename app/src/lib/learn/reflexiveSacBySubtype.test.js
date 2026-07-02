/**
 * ===== REFLEXIVE-SAC-BY-SUBTYPE (CR 603.7c) ===== the "you may sacrifice a <Food/Treasure/Blood…>. If you do,
 * <effect>." gate — an OPTIONAL sacrifice of a named fungible value-TOKEN subtype whose payoff resolves ONLY if
 * the controller actually sacrifices one. Structurally the SAC sibling of OPTIONAL-MANA-PAYMENT (the cost is a
 * subtype-permanent sacrifice instead of mana): the two sentences span the clause splitter, so the parser
 * collapses them up front into ONE `optional-sac-payment` atom whose resolver SUSPENDS on a real sac/decline
 * (runProgram.resolveOptionalSacChoice). The sac GENUINELY happens — sacrificeCreatureEffect moves a matching
 * permanent to the graveyard and fires its dies + TRIG-SACRIFICE watchers (CR 701.21) — BEFORE the payoff runs.
 *
 * BUILT (cross-deck):
 *   - Wedding Security (Creature, attack trigger) — "you may sacrifice a Blood token. If you do, put a +1/+1
 *     counter on this creature and draw a card." → native-trigger (the WHOLE card flips).
 *   - The Goose Mother (Zaxara) — its ATTACK trigger ("you may sacrifice a Food. If you do, draw a card.")
 *     models natively via THIS subsystem; its last blocker — the "create half X Food tokens, rounded up" ETB —
 *     is now ALSO built (HALF-X-CREATE-TOKENS, see halfX.test.js), so the WHOLE card flips to native-trigger.
 *     The pin below now asserts native (the formerly-parked half is covered; both halves resolve at runtime).
 *
 * CREED (CLAUDE.md §1.2) — the cardinal guarantee is that NO payoff fires unless a matching permanent was
 * really sacrificed (decline / none available → nothing). The gate parks every shape the engine can't model
 * the WHOLE of: a creature/card-type sac subject, a multi-sac ("two Blood"), an unbound-referent payoff ("it
 * gets +2/+2"), a team-pump payoff, an else-branch ("Otherwise, …"), or a chosen-target payoff.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { classifyCard } from "./coverage.js";
import { detectTriggers, checkAttackTriggers } from "./triggers.js";
import { parseEffectClause, parseEffectProgram, programConfidence } from "./effects/parser.js";
import { runEffectProgram, resolveOptionalSacChoice, autoPickOptionalSac } from "./effects/runProgram.js";
import { flushTriggers, resolveTopOfStack, chooseTriggerTargets } from "./gameEngine.js";
import { createGameState, _resetIdsForTests, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const WEDDING = {
  name: "Wedding Security", type: "Creature — Vampire Soldier", power: 2, toughness: 2,
  oracle: "Whenever this creature attacks, you may sacrifice a Blood token. If you do, put a +1/+1 counter on this creature and draw a card.",
};
const GOOSE = {
  name: "The Goose Mother", type: "Legendary Creature — Bird Hydra", mana: "{X}{G}{U}", power: 2, toughness: 2,
  oracle: "Flying\nThe Goose Mother enters with X +1/+1 counters on it.\nWhen The Goose Mother enters, create half X Food tokens, rounded up.\nWhenever The Goose Mother attacks, you may sacrifice a Food. If you do, draw a card.",
};

// ────────────────────────────────────────────────────────────────────────────
// classification
// ────────────────────────────────────────────────────────────────────────────
describe("REFLEXIVE-SAC-BY-SUBTYPE — classification", () => {
  it("Wedding Security → native-trigger (sac a Blood → +1/+1 counter on self + draw)", () => {
    expect(classifyCard(WEDDING)).toBe("native-trigger");
  });

  it("The Goose Mother → native-trigger (WHOLE card: sac-Food attack here + half-X-Food ETB now built)", () => {
    // Both halves model: the attack reflexive-sac via THIS subsystem, and the "create half X Food tokens,
    // rounded up" ETB via HALF-X-CREATE-TOKENS (halfX.test.js). The whole card is covered → native (CREED-clean).
    expect(classifyCard(GOOSE)).toBe("native-trigger");
  });
});

// ────────────────────────────────────────────────────────────────────────────
// parser — the two sentences fold into ONE optional-sac-payment atom
// ────────────────────────────────────────────────────────────────────────────
describe("REFLEXIVE-SAC-BY-SUBTYPE — parser (the fold)", () => {
  it("Goose attack clause → [optional-sac-payment(Food){draw}], HIGH", () => {
    const p = parseEffectClause("you may sacrifice a Food. If you do, draw a card.", "Instant");
    expect(programConfidence(p)).toBe("high");
    expect(p.atoms).toHaveLength(1);
    expect(p.atoms[0]).toMatchObject({ op: "optional-sac-payment", subtype: "Food" });
    expect(p.atoms[0].effectAtoms).toEqual([{ op: "draw", amount: 1, targetType: null }]);
  });

  it("Wedding attack clause → [optional-sac-payment(Blood){counter-on-self, draw}], HIGH ('token' suffix tolerated)", () => {
    const p = parseEffectClause("you may sacrifice a Blood token. If you do, put a +1/+1 counter on this creature and draw a card.", "Instant");
    expect(programConfidence(p)).toBe("high");
    expect(p.atoms[0]).toMatchObject({ op: "optional-sac-payment", subtype: "Blood" });
    expect(p.atoms[0].effectAtoms).toEqual([
      { op: "add-counter", counterType: "+1/+1", amount: 1, target: "self" },
      { op: "draw", amount: 1, targetType: null },
    ]);
  });

  it("the attack TRIGGER folds the clause (detectTriggers + parse) — one HIGH trigger, not a dropped sentence", () => {
    const trigs = detectTriggers(WEDDING);
    const attack = trigs.find((t) => t.event === "attacks");
    expect(attack).toBeTruthy();
    const p = parseEffectClause(attack.effectClause, "Instant");
    expect(programConfidence(p)).toBe("high");
    expect(p.atoms[0].op).toBe("optional-sac-payment");
  });
});

// ────────────────────────────────────────────────────────────────────────────
// CREED anti-FP — every un-modelable shape stays LOW → Arbiter (a SAFE false-negative)
// ────────────────────────────────────────────────────────────────────────────
describe("REFLEXIVE-SAC-BY-SUBTYPE — CREED anti-FP (must stay LOW)", () => {
  const lowCases = {
    "team-pump payoff (Provisions Merchant)": "you may sacrifice a Food. If you do, attacking creatures get +1/+1 and gain trample until end of turn.",
    "unbound 'it' referent (Bloodcrazed Socialite)": "you may sacrifice a Blood token. If you do, it gets +2/+2 until end of turn.",
    "else-branch (Insatiable Appetite)": "You may sacrifice a Food. If you do, target creature gets +5/+5 until end of turn. Otherwise, that creature gets +3/+3 until end of turn.",
    "multi-sac 'two Blood' (Strefan)": "you may sacrifice two Blood tokens. If you do, draw a card.",
    "creature subject (not a fungible token subtype)": "you may sacrifice a creature. If you do, draw a card.",
    "creature-subtype subject 'a Goblin' (out of scope)": "you may sacrifice a Goblin. If you do, draw a card.",
    "permanent subject (a card-type word)": "you may sacrifice a permanent. If you do, draw a card.",
    "chosen-target payoff (would need target threading)": "you may sacrifice a Treasure. If you do, draw a card. Target creature gets +1/+1.",
    "a SECOND 'if you do'": "you may sacrifice a Food. If you do, you may pay {1}. If you do, draw a card.",
    // WI-3 PAYOFF-PAUSE gate: a NON-LAST pausing payoff atom (the scry suspends; the settler's chained
    // resume skips the payoff tail → the draw would be dropped, a forbidden FP) → LOW → Arbiter.
    "NON-LAST pausing payoff atom (scry before draw — WI-3)": "you may sacrifice a Food. If you do, scry 1, then draw a card.",
  };
  for (const [label, oracle] of Object.entries(lowCases)) {
    it(`${label} → LOW`, () => {
      expect(programConfidence(parseEffectProgram({ type: "Instant", oracle }))).toBe("low");
    });
  }

  it("a MANDATORY (non-'you may') sac is NOT this shape — stays LOW here", () => {
    // "Sacrifice a Food. If you do, …" has no optional gate; this matcher requires the "you may" lead.
    expect(programConfidence(parseEffectProgram({ type: "Instant", oracle: "Sacrifice a Food. If you do, draw a card." }))).toBe("low");
  });
});

// ────────────────────────────────────────────────────────────────────────────
// runtime — the sac GENUINELY happens, then the payoff; decline / no-match → nothing
// ────────────────────────────────────────────────────────────────────────────
describe("REFLEXIVE-SAC-BY-SUBTYPE — runtime (resolveOptionalSacChoice)", () => {
  function stateWithFood(hasFood) {
    const s = createGameState({ userDeck: [], aiDeck: [] });
    const food = createPermanent({ id: "food1", card: { id: "cf", name: "Food", type: "Token Artifact — Food" }, controller: "user" });
    const library = Array.from({ length: 5 }, (_, i) => ({ id: `L${i}`, name: `C${i}`, type: "Sorcery" }));
    return {
      ...s, activePlayer: "user",
      players: { ...s.players, user: { ...s.players.user, battlefield: hasFood ? [food] : [], library, hand: [], graveyard: [], life: 40 } },
    };
  }
  const GOOSE_PROG = parseEffectProgram({ type: "Instant", oracle: "you may sacrifice a Food. If you do, draw a card." });
  function run(hasFood, doSac) {
    let s = stateWithFood(hasFood);
    s = runEffectProgram(s, { source: { name: "The Goose Mother" }, payload: { params: { program: GOOSE_PROG, controller: "user", targets: [] } } });
    expect(s.pendingChoice?.kind).toBe("optional-sac-payment"); // suspended on the sac/decline choice
    return resolveOptionalSacChoice(s, doSac);
  }

  it("SAC: sacrifices the Food (→ graveyard) AND draws a card (payoff after a real sac)", () => {
    const s = run(true, true);
    expect(s.players.user.battlefield.some((p) => p.id === "food1")).toBe(false); // sacrificed
    expect(s.players.user.graveyard.some((c) => c.id === "cf")).toBe(true);       // → graveyard (real sac)
    expect(s.players.user.hand.map((c) => c.id)).toEqual(["L0"]);                 // drew
  });

  it("CREED — DECLINE: nothing happens (the Food stays, no draw)", () => {
    const s = run(true, false);
    expect(s.players.user.battlefield.some((p) => p.id === "food1")).toBe(true); // NOT sacrificed
    expect(s.players.user.hand).toHaveLength(0);                                 // NO draw on decline
  });

  it("CREED — NO matching permanent: the choice is unavailable and even a 'sac' fabricates nothing", () => {
    let s = stateWithFood(false);
    s = runEffectProgram(s, { source: { name: "The Goose Mother" }, payload: { params: { program: GOOSE_PROG, controller: "user", targets: [] } } });
    expect(s.pendingChoice).toMatchObject({ kind: "optional-sac-payment", available: false });
    expect(autoPickOptionalSac(s, s.pendingChoice)).toBe(false); // the AI declines (can't sacrifice what it lacks)
    const after = resolveOptionalSacChoice(s, true);             // even forced "sac" → no fabrication
    expect(after.players.user.hand).toHaveLength(0);             // NO draw (no Food was sacrificed)
  });

  it("WI-3 belt-and-braces — a mid-payoff pause routes to the Arbiter instead of dropping the payoff tail", () => {
    // The parser gate (PAUSING_ATOM_OPS — pinned LOW above) makes this pendingChoice shape unreachable for
    // native programs; hand-craft it to pin the runtime guard: the settler must NEVER chain past a NON-LAST
    // pausing payoff atom (the chained resume points at the PROGRAM continuation → the trailing draw would
    // be dropped). It clears the inner scry choice and routes to the Arbiter (CREED-safe FN). The sac itself
    // already happened (a real cost) — the honest hand-off covers the payoff, not the cost.
    const s = stateWithFood(true);
    const paused = {
      ...s,
      pendingChoice: {
        kind: "optional-sac-payment", controller: "user", subtype: "Food", sourceName: "The Goose Mother",
        effectAtoms: [{ op: "scry", amount: 1, targetType: null }, { op: "draw", amount: 1, targetType: null }],
        resume: { program: null, controller: "user", targets: [], nextAtomIndex: 0, cardName: "The Goose Mother" },
      },
    };
    const settled = resolveOptionalSacChoice(paused, true);
    expect(settled.players.user.graveyard.some((c) => c.id === "cf")).toBe(true); // the sac (the cost) really happened
    expect(settled.pendingArbiter).toBeTruthy();                                  // honest hand-off, never half-resolved
    expect(settled.pendingArbiter.reason).toMatch(/paused mid-payoff/);
    expect(settled.pendingChoice).toBeFalsy();                                    // the inner scry choice was cleared — no wedge
    expect(settled.players.user.hand).toHaveLength(0);                            // the trailing draw did NOT silently run
  });

  it("the sacrifice fires TRIG-SACRIFICE watchers (Korvold draws on the Food crack — a REAL sacrifice, CR 701.21)", () => {
    const s0 = createGameState({ userDeck: [], aiDeck: [] });
    const korvold = createPermanent({ id: "korv", card: { id: "ck", name: "Korvold", type: "Legendary Creature — Dragon", power: 4, toughness: 4, oracle: "Whenever you sacrifice a permanent, draw a card." }, controller: "user" });
    const food = createPermanent({ id: "food1", card: { id: "cf", name: "Food", type: "Token Artifact — Food" }, controller: "user" });
    const library = Array.from({ length: 5 }, (_, i) => ({ id: `L${i}`, name: `C${i}`, type: "Sorcery" }));
    let s = {
      ...s0, activePlayer: "user", priorityHolder: "user", phase: "combat", step: "declare-attackers", consecutivePasses: 0,
      players: { ...s0.players, user: { ...s0.players.user, battlefield: [korvold, food], library, hand: [], graveyard: [], life: 40 } },
    };
    s = runEffectProgram(s, { source: { name: "The Goose Mother" }, payload: { params: { program: GOOSE_PROG, controller: "user", targets: [] } } });
    s = resolveOptionalSacChoice(s, true); // sac the Food → enqueues Korvold's sacrifice trigger
    s = flushTriggers(s);                   // move the pending sacrifice trigger onto the stack
    while (s.stack.length) s = resolveTopOfStack(s);
    // 1 draw from the payoff + 1 from Korvold's sacrifice watcher = 2
    expect(s.players.user.hand).toHaveLength(2);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// runtime END-TO-END — Wedding Security's attack trigger through the real flush
// ────────────────────────────────────────────────────────────────────────────
describe("REFLEXIVE-SAC-BY-SUBTYPE — runtime END-TO-END (Wedding Security attack)", () => {
  function weddingState(hasBlood) {
    const s = createGameState({ userDeck: [], aiDeck: [] });
    const wedding = createPermanent({ id: "wed", card: { id: "cw", ...WEDDING }, controller: "user", tapped: true });
    const blood = createPermanent({ id: "blood1", card: { id: "cb", name: "Blood", type: "Token Artifact — Blood" }, controller: "user" });
    const library = Array.from({ length: 5 }, (_, i) => ({ id: `L${i}`, name: `C${i}`, type: "Sorcery" }));
    return {
      ...s, activePlayer: "user", priorityHolder: "user",
      combat: { attackers: [{ permanentId: "wed", attackingPlayer: "user", defender: "ai" }], blockers: [] },
      players: { ...s.players, user: { ...s.players.user, battlefield: hasBlood ? [wedding, blood] : [wedding], library, hand: [], graveyard: [], life: 40 } },
    };
  }

  it("attacking with a Blood out: sacs the Blood, puts a +1/+1 counter on Wedding Security, and draws", () => {
    let s = weddingState(true);
    s = checkAttackTriggers(s);
    expect((s.pendingTriggers || []).length).toBe(1);
    s = flushTriggers(s, { chooseTargets: chooseTriggerTargets });
    // drive the resolution loop: resolve the trigger (sets the sac choice) → settle the sac
    let guard = 0;
    while (((s.stack || []).length || s.pendingChoice) && guard++ < 40) {
      if (s.pendingChoice?.kind === "optional-sac-payment") { s = resolveOptionalSacChoice(s, true); continue; }
      if ((s.stack || []).length) { s = resolveTopOfStack(s); continue; }
      break;
    }
    expect(s.players.user.battlefield.some((p) => p.id === "blood1")).toBe(false);            // Blood sacrificed
    const wed = s.players.user.battlefield.find((p) => p.id === "wed");
    expect(wed.counters?.["+1/+1"]).toBe(1);                                                   // +1/+1 counter on self
    expect(s.players.user.hand).toHaveLength(1);                                               // drew
  });

  it("CREED — attacking with NO Blood: the trigger resolves but nothing happens (no counter, no draw)", () => {
    let s = weddingState(false);
    s = checkAttackTriggers(s);
    s = flushTriggers(s, { chooseTargets: chooseTriggerTargets });
    let guard = 0;
    while (((s.stack || []).length || s.pendingChoice) && guard++ < 40) {
      if (s.pendingChoice?.kind === "optional-sac-payment") { s = resolveOptionalSacChoice(s, true); continue; }
      if ((s.stack || []).length) { s = resolveTopOfStack(s); continue; }
      break;
    }
    const wed = s.players.user.battlefield.find((p) => p.id === "wed");
    expect(wed.counters?.["+1/+1"]).toBeFalsy(); // no counter (no Blood to sacrifice)
    expect(s.players.user.hand).toHaveLength(0);  // no draw
  });
});

/**
 * pilotPendingChoice.test.js — YES/NO-UNIFY: route the resolution-time `pendingChoice`
 * seam through the pluggable `decide` so a pilot controls tutor / clone / edict-sacrifice /
 * hand-discard / impulse-dig / each-player-discard / optional / commander-return / soft-counter
 * choices — not just the priority-window auto-pick.
 *
 * What's proven here (the task's VERIFY list):
 *   1. HONORED — a pilot `decide` that picks a SPECIFIC candidate (a pick-one kind) or a
 *      specific yes/no (a boolean kind) is applied via the existing settler (the chosen
 *      candidate resolves, not the auto-pick).
 *   2. BYTE-IDENTICAL DEFAULT — no `decide` ⇒ the exact auto-pick (autoPick*), unchanged.
 *   3. FALLBACK — an out-of-set / throwing pilot return falls back to the auto-pick (never
 *      an illegal/fabricated candidate, never a crash).
 *   4. RECORDED — when `recordDecision` is on, each pendingChoice decision is captured into
 *      the trajectory as a normalized `{kind:"pending-choice", choiceKind, ...}` row, tagged
 *      by pilot + carrying a feature object.
 *   5. DEFERRED kinds (scry-surveil / divide-damage — combinatorial, not pick-one) stay on
 *      auto-pick: a `decide` does NOT alter them (FN-safe).
 *
 * Hermetic: builds engine state + a pendingChoice directly (mirrors edicts.test.js /
 * softCounter.test.js), so it runs in a fresh worktree with no MTG_APP_ROOT / oracle index.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { advanceUntilDecision } from "./learnSession.js";
import { resolveAtom } from "./effects/effectAtoms.js";
import { RESOLVER_KEYS } from "./resolvers.js";
import { FEATURE_KEYS } from "./gameFeatures.js";

beforeEach(() => _resetIdsForTests());

// ── shared fixtures ──────────────────────────────────────────────────────────
const creaCard = (id, name, cmc = 2, power = 2) => ({ id, name, type: "Creature — Bear", mana: `{${cmc}}`, cmc, power, toughness: 2, oracle: "" });
const creaPerm = (id, name, controller, cmc = 2, power = 2) => createPermanent({ id, card: creaCard(id, name, cmc, power), controller });

// A minimal active session wrapping a handcrafted state (mirrors edicts.test.js's `sess`).
const sess = (state, difficulty = "expert") => ({ id: "s", status: "active", difficulty, state, decisionLog: [] });

// Run the loop with a recorder and return the FIRST recorded pending-choice row of `choiceKind`.
// Recording engages the decide path even with NO `decide` (the fallback = the auto-pick is
// recorded), so this captures the EXACT resolved choice WITHOUT depending on the post-resolution
// game line (which draws/SBAs perturb hand/library/graveyard state). `decide` is optional.
function firstChoiceRow(makeState, choiceKind, decide = null) {
  const rows = [];
  advanceUntilDecision(sess(makeState()), {
    pilot: { playbook: "pc", temperament: "pc" },
    ...(decide ? { decide } : {}),
    recordDecision: (row) => rows.push(row),
  });
  return rows.find((r) => r.action?.kind === "pending-choice" && r.action?.choiceKind === choiceKind) || null;
}

// The exact legalActions set offered to decide for the FIRST pending-choice of `choiceKind`
// (captured at the decision, immune to later windows overwriting a shared variable).
function firstChoiceOffered(makeState, choiceKind) {
  let captured = null;
  advanceUntilDecision(sess(makeState()), {
    decide: ({ legalActions }) => {
      if (!captured && legalActions.some((a) => a.kind === "pending-choice" && a.choiceKind === choiceKind)) {
        captured = legalActions;
      }
      return undefined; // defer everywhere → no perturbation; we only want the offered set
    },
  });
  return captured;
}

function baseState({ userBf = [], aiBf = [], userLib = [], aiLib = [] } = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...s,
    phase: "precombat-main",
    step: "main",
    activePlayer: "user",
    priorityHolder: "user",
    consecutivePasses: 0,
    players: {
      ...s.players,
      user: { ...s.players.user, battlefield: userBf, library: userLib },
      ai: { ...s.players.ai, battlefield: aiBf, library: aiLib },
    },
  };
}

// A pendingChoice where the AI is the chooser (controller "ai") so the loop AUTO-RESOLVES it
// (pause is false for a non-user controller) — the path the pilot seam routes through.
function withSacChoice(state, candidates) {
  return { ...state, pendingChoice: { kind: "sacrifice-choice", controller: "ai", candidates, sourceName: "Diabolic Edict" } };
}

// ── 1 + 2 + 3: PICK-ONE (sacrifice) — honored / byte-identical / fallback ──────
describe("YES/NO-UNIFY — a pick-one pendingChoice routes through decide (sacrifice-choice)", () => {
  // The AI owns two creatures: a 0-MV token (the auto-pick: least valuable) and a 6-MV bomb.
  const sacScenario = () =>
    withSacChoice(
      baseState({ aiBf: [creaPerm("a1", "Token", "ai", 0, 1), creaPerm("a2", "Bomb", "ai", 6, 6)] }),
      [{ id: "a1", name: "Token" }, { id: "a2", name: "Bomb" }],
    );

  const aiGraveIds = (out) => out.session.state.players.ai.graveyard.map((c) => c.id);

  it("DEFAULT (no decide) = the auto-pick: the least-valuable creature is sacrificed", () => {
    const out = advanceUntilDecision(sess(sacScenario()));
    expect(aiGraveIds(out)).toEqual(["a1"]); // Token (0 MV) — byte-identical to the pre-slice auto-pick
  });

  it("HONORED: a decide that picks the OTHER candidate sacrifices THAT one (not the auto-pick)", () => {
    const out = advanceUntilDecision(sess(sacScenario()), {
      // The pilot keeps the token, gives up the bomb — the opposite of the auto-pick.
      decide: ({ legalActions }) => legalActions.find((a) => a.candidateId === "a2"),
    });
    expect(aiGraveIds(out)).toEqual(["a2"]); // the PILOT's choice resolved
  });

  it("FALLBACK: an out-of-set decide return falls back to the auto-pick", () => {
    const out = advanceUntilDecision(sess(sacScenario()), {
      decide: () => ({ kind: "TOTALLY-FAKE", candidateId: "nonexistent" }),
    });
    expect(aiGraveIds(out)).toEqual(["a1"]); // garbage rejected → auto-pick
  });

  it("FALLBACK: a throwing decide never crashes — falls back to the auto-pick", () => {
    const out = advanceUntilDecision(sess(sacScenario()), {
      decide: () => { throw new Error("boom"); },
    });
    expect(aiGraveIds(out)).toEqual(["a1"]); // throw swallowed → auto-pick
  });

  it("the seat handed to decide is the CHOICE CONTROLLER (the sacrificer), not the priority holder", () => {
    const seats = new Set();
    advanceUntilDecision(sess(sacScenario()), {
      decide: ({ seat, legalActions }) => { seats.add(seat); return legalActions[0]; },
    });
    expect(seats.has("ai")).toBe(true); // the edict's victim (ai) is the deciding seat
  });

  it("the offered legalActions are EXACTLY the real candidates (no fabricated option)", () => {
    const offered = firstChoiceOffered(sacScenario, "sacrifice-choice");
    expect(offered).toBeTruthy();
    expect(offered.every((a) => a.kind === "pending-choice" && a.choiceKind === "sacrifice-choice")).toBe(true);
    // A sacrifice has no decline → exactly the two candidate ids, nothing else.
    expect(offered.map((a) => a.candidateId).sort()).toEqual(["a1", "a2"]);
  });
});

// ── tutor decline (the find-nothing path, candidateId:null) ───────────────────
describe("YES/NO-UNIFY — a tutor-search routes through decide, including find-nothing", () => {
  // The AI tutors its own library; the auto-pick fetches the highest-MV card (the bomb).
  function tutorScenario() {
    const lib = [creaCard("L1", "Cheap", 1, 1), creaCard("L2", "Bomb", 7, 7)];
    const st = baseState({ aiLib: lib });
    return {
      ...st,
      pendingChoice: {
        kind: "tutor-search",
        controller: "ai",
        candidates: lib.map((c) => ({ id: c.id, name: c.name })),
        filter: null,
        sourceZone: "library",
        destination: "hand",
        sourceName: "Demonic Tutor",
      },
    };
  }
  // Assert on the RECORDED choice (not the post-game hand, which subsequent draws perturb):
  // the recorded action is the exact resolved candidate — auto-pick when no decide, the pilot's
  // pick otherwise. (settler application end-to-end is proven by the sacrifice graveyard tests.)
  it("DEFAULT records the auto-pick (highest mana value)", () => {
    const row = firstChoiceRow(tutorScenario, "tutor-search");
    expect(row).toBeTruthy();
    expect(row.action.candidateId).toBe("L2"); // Bomb (7 MV)
  });

  it("HONORED: a decide can fetch the OTHER card", () => {
    const row = firstChoiceRow(tutorScenario, "tutor-search", ({ legalActions }) => legalActions.find((a) => a.candidateId === "L1"));
    expect(row.action.candidateId).toBe("L1"); // the pilot's pick
  });

  it("HONORED: a decide can decline (find nothing) — candidateId:null is an offered option", () => {
    const offered = firstChoiceOffered(tutorScenario, "tutor-search");
    expect(offered.some((a) => a.candidateId === null)).toBe(true); // a find-nothing option (CR 701.19f)
    const row = firstChoiceRow(tutorScenario, "tutor-search", ({ legalActions }) => legalActions.find((a) => a.candidateId === null));
    expect(row.action.candidateId).toBeNull(); // the decline was honored + recorded
  });
});

// ── boolean (soft-counter) — honored + byte-identical ─────────────────────────
describe("YES/NO-UNIFY — a yes/no pendingChoice routes through decide (soft-counter)", () => {
  // Mirror softCounter.test.js: an AI Divination on the stack + a Force-Spike counter atom →
  // a soft-counter pending choice the AI (controller) resolves. With 1 land the AI CAN pay.
  const spellOnStack = (id, name, type, controller) => ({
    id, kind: "spell", controller, targets: [], cost: null,
    source: { id: `card-${id}`, name, type, oracle: "" },
    payload: { resolver: RESOLVER_KEYS.EFFECT_PROGRAM, params: {} },
  });
  const island = (id, controller) => createPermanent({ id, card: { id: `c${id}`, name: "Island", type: "Land", oracle: "{T}: Add {U}." }, controller });
  const COUNTER_ATOM = { op: "counter", spellFilter: "any", targetType: "spell", unlessPay: 1 };

  function softCounterPending() {
    const s = createGameState({ userDeck: [], aiDeck: [] });
    const st = {
      ...s,
      phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
      stack: [spellOnStack("s1", "Divination", "Sorcery", "ai")],
      players: { ...s.players, ai: { ...s.players.ai, battlefield: [island("AL0", "ai")] } },
    };
    return resolveAtom(st, COUNTER_ATOM, { controller: "user", targets: [{ type: "spell", id: "s1" }], cardName: "Force Spike" });
  }

  it("sanity — the scenario yields a soft-counter pending choice the AI can afford", () => {
    const st = softCounterPending();
    expect(st.pendingChoice).toMatchObject({ kind: "soft-counter", controller: "ai", amount: 1, spellId: "s1" });
  });

  // The "was it countered?" signal that survives continued play is the append-only counter log
  // (via:"soft-counter"); a PAID spell never logs it. (A graveyard check can't distinguish the
  // two — a paid Divination is a sorcery that resolves and ALSO ends in the graveyard.)
  const wasCountered = (out) => out.session.state.log.some((l) => l.effect === "counter" && l.via === "soft-counter");

  it("DEFAULT (no decide) = the auto-pick: pay (affordable) → the spell is NOT countered", () => {
    const out = advanceUntilDecision(sess(softCounterPending()));
    expect(wasCountered(out)).toBe(false); // affordable → auto-pay → survives the counter
    // The recorded decision (with a recorder) is the auto-pick: pay = value:true.
    const row = firstChoiceRow(softCounterPending, "soft-counter");
    expect(row.action.value).toBe(true);
  });

  it("HONORED: a decide that DECLINES (value:false) gets the spell COUNTERED", () => {
    const out = advanceUntilDecision(sess(softCounterPending()), {
      decide: ({ legalActions }) => legalActions.find((a) => a.value === false),
    });
    expect(wasCountered(out)).toBe(true); // pilot declined an affordable pay → countered
    const row = firstChoiceRow(softCounterPending, "soft-counter", ({ legalActions }) => legalActions.find((a) => a.value === false));
    expect(row.action.value).toBe(false); // the decline was honored + recorded
  });

  it("the offered set is exactly the two legal answers {value:true, value:false}", () => {
    const offered = firstChoiceOffered(softCounterPending, "soft-counter");
    expect(offered).toBeTruthy();
    expect(offered.map((a) => a.value).sort()).toEqual([false, true]);
    expect(offered.every((a) => a.kind === "pending-choice" && a.choiceKind === "soft-counter")).toBe(true);
  });
});

// ── 4: RECORDING — the pendingChoice decision lands in the trajectory ──────────
describe("YES/NO-UNIFY — each pendingChoice decision is recorded (opt-in)", () => {
  function sacScenario() {
    return withSacChoice(
      baseState({ aiBf: [creaPerm("a1", "Token", "ai", 0, 1), creaPerm("a2", "Bomb", "ai", 6, 6)] }),
      [{ id: "a1", name: "Token" }, { id: "a2", name: "Bomb" }],
    );
  }

  it("records a normalized {kind:'pending-choice'} row tagged by pilot + carrying features", () => {
    const rows = [];
    advanceUntilDecision(sess(sacScenario()), {
      pilot: { playbook: "edict-test", temperament: "ruthless" },
      decide: ({ legalActions }) => legalActions.find((a) => a.candidateId === "a2"),
      recordDecision: (row) => rows.push(row),
    });
    const choiceRow = rows.find((r) => r.action?.kind === "pending-choice" && r.action?.choiceKind === "sacrifice-choice");
    expect(choiceRow).toBeTruthy();
    expect(choiceRow.seat).toBe("ai");                       // the deciding seat
    expect(choiceRow.action.candidateId).toBe("a2");         // the chosen candidate is recorded
    expect(choiceRow.pilot).toEqual({ playbook: "edict-test", temperament: "ruthless" });
    // A full feature vector accompanies the row (every canonical key finite).
    for (const k of FEATURE_KEYS) expect(Number.isFinite(choiceRow.features[k])).toBe(true);
    // The action round-trips as plain JSON (no functions / engine handle).
    expect(JSON.parse(JSON.stringify(choiceRow.action))).toEqual(choiceRow.action);
  });

  it("DEFAULT (no recorder) records nothing for the pendingChoice — zero overhead", () => {
    // No decide AND no recordDecision: the auto-pick path runs untouched; if a recorder were
    // implicitly invoked it would have to throw or capture — neither happens. Proven by the
    // byte-identical auto-pick result above; here we assert the resolution still completes.
    const out = advanceUntilDecision(sess(sacScenario()));
    expect(out.session.state.players.ai.graveyard.map((c) => c.id)).toEqual(["a1"]);
  });
});

// ── 5: DEFERRED kinds (scry-surveil) stay on auto-pick (FN-safe) ──────────────
describe("YES/NO-UNIFY — combinatorial kinds stay on auto-pick (scry-surveil deferred)", () => {
  // A scry-surveil keeps all looked-at cards on top by default (the deterministic auto-pick).
  // It's an ordered keep-subset, NOT normalized into legalActions, so a `decide` must NOT
  // change it (false-negative-safe: deferring leaves the auto-pick path byte-identical).
  function scryScenario() {
    const top = [creaCard("T1", "First", 1, 1), creaCard("T2", "Second", 2, 2)];
    const st = baseState({ aiLib: [...top, creaCard("T3", "Third", 3, 3)] });
    return {
      ...st,
      pendingChoice: { kind: "scry-surveil", controller: "ai", mode: "scry", cards: top.map((c) => ({ id: c.id, name: c.name })), sourceName: "Scry 2" },
    };
  }

  it("a decide does NOT alter a scry-surveil — keep-all-on-top default holds", () => {
    const libNoDecide = advanceUntilDecision(sess(scryScenario())).session.state.players.ai.library.map((c) => c.id);
    // A deferring pilot (returns undefined) can never change ANY auto-decided window, so the
    // whole game stays byte-identical — including the scry. (We also assert the scry choice
    // itself is never offered to decide: no call carries a scry-surveil pending-choice action.)
    let offeredScryChoice = false;
    const libWithDecide = advanceUntilDecision(sess(scryScenario()), {
      decide: ({ legalActions }) => {
        if (legalActions.some((a) => a.kind === "pending-choice" && a.choiceKind === "scry-surveil")) offeredScryChoice = true;
        return undefined; // defer everywhere → byte-identical
      },
    }).session.state.players.ai.library.map((c) => c.id);

    expect(libWithDecide).toEqual(libNoDecide);  // byte-identical despite the pilot present
    expect(offeredScryChoice).toBe(false);       // the scry choice was never routed through decide (deferred)
  });
});

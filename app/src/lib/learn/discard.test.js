/**
 * discard.test.js — EACH-PLAYER discard (EP-2), discard as an EFFECT where the DISCARDING player chooses
 * which cards (CR 701.8 — Mind Rot / Fugue / Delirium Skeins; the OPPOSITE chooser to δ-1b hand disruption).
 *
 * "Target player discards N cards" / "Each player discards N cards" collapse to one `discard` atom.
 * At RESOLUTION the discarder(s) choose, modeled as a CHAIN of single-card pending choices: a human gets a
 * picker, an AI auto-discards its cheapest, and N>1 / multiple discarders resolve as a sequence. A hand ≤ N
 * is the forced whole-hand discard (no pause); an empty hand is a clean no-op. The atom composes into the
 * multi-clause/modal parser (Fill with Fright = discard + scry), so the caster's rider resumes after the
 * chain settles. Pins: the parser allowlist, player enumeration, the chain mechanics + AI cheapest
 * heuristic, the human picker, the compound resume, and the eliminated-discarder guard.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createGameState, _resetIdsForTests } from "./gameState.js";
import { legalActionsForPlayer, filterActions } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { advanceUntilDecision, applyDiscardChoice } from "./learnSession.js";
import { autoPickDiscardCandidate, resolveDiscardChoice } from "./effects/runProgram.js";
import { enumerateTargets } from "./spellEffects.js";
import { parseEffectProgram, programConfidence } from "./effects/parser.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const SORCERY = "Sorcery";
const INSTANT = "Instant";
// REAL current Oracle wording (verified against the bundled corpus).
const MINDROT = { id: "mr", name: "Mind Rot", type: SORCERY, mana: "{2}{B}", oracle: "Target player discards two cards." };
const DELIRIUM = { id: "ds", name: "Delirium Skeins", type: SORCERY, mana: "{2}{B}", oracle: "Each player discards three cards." };
const FILL = { id: "ff", name: "Fill with Fright", type: SORCERY, mana: "{2}{B}", oracle: "Target player discards two cards. Scry 2." };

// A hand card with a tunable mana value (drives the AI cheapest-first heuristic).
const hc = (id, name, cmc = 2) => ({ id, name, type: SORCERY, mana: `{${cmc}}`, cmc, oracle: "" });
const lc = (id) => ({ id, name: id, type: SORCERY, mana: "{1}", cmc: 1, oracle: "" });

function state({ userHand = [], userLib = [], aiHand = [] } = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  const players = {
    ...s.players,
    user: { ...s.players.user, hand: userHand, library: userLib, manaPool: { ...s.players.user.manaPool, C: 8, B: 4 } },
    ai: { ...s.players.ai, hand: aiHand },
  };
  return { ...s, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0, players };
}

// Cast `cardId` (optionally at `victim`) and AUTO-settle every discard pick in the chain (the AI path).
function castAndAutoResolve(s, cardId, victim = null) {
  const cast = filterActions(legalActionsForPlayer(s, "user"), "cast-spell")
    .find((a) => a.cardId === cardId && (victim == null || a.targets?.some((t) => t.id === victim)));
  expect(cast).toBeTruthy();
  let next = resolveTopOfStack(dispatchAction(s, cast));
  while (next.pendingChoice?.kind === "discard") next = resolveDiscardChoice(next, autoPickDiscardCandidate(next, next.pendingChoice));
  while (next.stack.length) next = resolveTopOfStack(next);
  return next;
}

describe("parser + coverage — the discard family is HIGH; the atom targets a PLAYER", () => {
  it("the core templates parse to one discard atom with the right who/targetType", () => {
    expect(parseEffectProgram(MINDROT).atoms).toEqual([{ op: "discard", amount: 2, who: "target", targetType: "player" }]);
    expect(parseEffectProgram(DELIRIUM).atoms).toEqual([{ op: "discard", amount: 3, who: "eachPlayer", targetType: null }]);
  });
  it("Mind Rot / Delirium Skeins / Fill with Fright classify native-spell; riders are arbiter-spell", () => {
    for (const c of [MINDROT, DELIRIUM, FILL]) expect(classifyCard(c)).toBe("native-spell");
    expect(classifyCard({ type: SORCERY, name: "Hymn to Tourach", oracle: "Target player discards two cards at random." })).toBe("arbiter-spell");
    expect(classifyCard({ type: SORCERY, name: "Mind Drain", oracle: "Target opponent discards two cards, mills a card, and loses 1 life. You gain 1 life." })).toBe("arbiter-spell");
  });
  it("'target player' offers every player (an edict-style enumeration)", () => {
    const s = state({ userHand: [MINDROT] });
    expect(enumerateTargets(s, "user", parseEffectProgram(MINDROT).atoms[0]).map((t) => t.id).sort()).toEqual(["ai", "user"]);
  });
});

describe("resolution — the discarder chooses; the N>1 / each-player chain; the 0 / ≤N / >N split", () => {
  it("target discards N: the AI auto-discards its N cheapest cards (chain), keeping the priciest", () => {
    const s = state({ userHand: [MINDROT], aiHand: [hc("h1", "Cheap", 1), hc("h2", "Mid", 3), hc("h3", "Big", 6)] });
    const after = castAndAutoResolve(s, "mr", "ai");
    expect(after.players.ai.graveyard.map((c) => c.id).sort()).toEqual(["h1", "h2"]); // the two cheapest
    expect(after.players.ai.hand.map((c) => c.id)).toEqual(["h3"]);                   // kept the most expensive
    expect(after.pendingChoice).toBeUndefined();
  });
  it("hand ≤ N: the whole hand is discarded with NO pause (no real choice)", () => {
    const s = state({ userHand: [MINDROT], aiHand: [hc("h1", "Only", 2)] });
    const after = castAndAutoResolve(s, "mr", "ai");
    expect(after.pendingChoice).toBeUndefined();
    expect(after.players.ai.graveyard.map((c) => c.id)).toEqual(["h1"]);
    expect(after.players.ai.hand).toHaveLength(0);
  });
  it("empty hand: a clean no-op (no pause, nothing discarded)", () => {
    const s = state({ userHand: [MINDROT], aiHand: [] });
    const after = castAndAutoResolve(s, "mr", "ai");
    expect(after.pendingChoice).toBeUndefined();
    expect(after.players.ai.graveyard).toHaveLength(0);
  });
  it("each player discards N: EVERY player (incl. the caster) discards N", () => {
    const s = state({
      userHand: [DELIRIUM, hc("u1", "U1", 1), hc("u2", "U2", 2), hc("u3", "U3", 3), hc("u4", "U4", 4)],
      aiHand: [hc("a1", "A1", 1), hc("a2", "A2", 2), hc("a3", "A3", 3), hc("a4", "A4", 4)],
    });
    const after = castAndAutoResolve(s, "ds"); // no target — each player
    expect(after.players.user.hand.map((c) => c.id)).toEqual(["u4"]);                 // user discarded its 3 cheapest
    expect(after.players.ai.hand.map((c) => c.id)).toEqual(["a4"]);                   // ai discarded its 3 cheapest
    expect(after.players.user.graveyard).toHaveLength(3);
    expect(after.players.ai.graveyard).toHaveLength(3);
  });
  it("compound (Fill with Fright): the discard chain settles, THEN the program resumes into the caster's Scry 2", () => {
    const s = state({ userHand: [FILL], userLib: [lc("L1"), lc("L2"), lc("L3")], aiHand: [hc("a1", "A1", 1), hc("a2", "A2", 2), hc("a3", "A3", 3)] });
    const cast = filterActions(legalActionsForPlayer(s, "user"), "cast-spell").find((a) => a.cardId === "ff" && a.targets?.some((t) => t.id === "ai"));
    let next = resolveTopOfStack(dispatchAction(s, cast));
    while (next.pendingChoice?.kind === "discard") next = resolveDiscardChoice(next, autoPickDiscardCandidate(next, next.pendingChoice));
    expect(next.players.ai.graveyard).toHaveLength(2);                                // the 2 cards discarded
    expect(next.pendingChoice?.kind).toBe("scry-surveil");                            // program resumed into the rider
    expect(next.pendingChoice.controller).toBe("user");                              // the CASTER scrys, not the victim
  });
});

describe("driver — the human (a discarder) gets a picker; the AI auto-discards; Expert auto-resolves", () => {
  const sess = (st, difficulty = "beginner") => ({ id: "s", status: "active", difficulty, state: st, decisionLog: [] });
  const pausedFor = (st, remaining = 2) => ({
    ...st,
    pendingChoice: {
      kind: "discard", controller: "user", remaining,
      candidates: [{ id: "u1", name: "U1" }, { id: "u2", name: "U2" }, { id: "u3", name: "U3" }],
      queue: [{ playerId: "user", remaining }], sourceName: "Mind Rot",
    },
  });

  it("a user discarding surfaces a `discard` decision carrying the remaining count", () => {
    const s = pausedFor(state({ userHand: [hc("u1", "U1", 1), hc("u2", "U2", 2), hc("u3", "U3", 3)] }), 2);
    const { decision } = advanceUntilDecision(sess(s));
    expect(decision.kind).toBe("discard");
    expect(decision.remaining).toBe(2);
    expect(decision.candidates.map((c) => c.id).sort()).toEqual(["u1", "u2", "u3"]);
  });
  it("applyDiscardChoice: a valid pick discards it + re-surfaces for the next card; an illegal pick re-surfaces unchanged", () => {
    const s = pausedFor(state({ userHand: [hc("u1", "U1", 1), hc("u2", "U2", 2), hc("u3", "U3", 3)] }), 2);
    const picked = applyDiscardChoice(sess(s), { cardId: "u3" });                     // the human keeps the cheap ones, pitches U3
    expect(picked.session.state.players.user.graveyard.map((c) => c.id)).toEqual(["u3"]);
    expect(picked.decision.kind).toBe("discard");                                     // the 2nd card still owed
    expect(picked.decision.remaining).toBe(1);
    const illegal = applyDiscardChoice(sess(s), { cardId: "not-a-candidate" });
    expect(illegal.decision.kind).toBe("discard");                                    // re-surfaced, not a crash
  });
  it("Expert autopilot auto-discards the cheapest with no panel", () => {
    const s = pausedFor(state({ userHand: [hc("u1", "U1", 1), hc("u2", "U2", 2), hc("u3", "U3", 6)] }), 2);
    const { session, decision } = advanceUntilDecision(sess(s, "expert"));
    expect(decision.kind).not.toBe("discard");
    expect(session.state.players.user.graveyard.map((c) => c.id).sort()).toEqual(["u1", "u2"]); // the 2 cheapest auto-pitched
  });
});

describe("608.2b-style guard — an eliminated discarder mid-pause", () => {
  it("skips the discard but still resumes the caster's modeled rider", () => {
    const program = parseEffectProgram({ type: INSTANT, oracle: "Target player discards two cards. You gain 2 life." });
    expect(program.atoms.map((a) => a.op)).toEqual(["discard", "gain-life"]);
    expect(programConfidence(program)).toBe("high");
    const s = state({ userHand: [] });
    const before = s.players.user.life;
    const gone = {
      ...s,
      players: Object.fromEntries(Object.entries(s.players).filter(([id]) => id !== "ai")),
      pendingChoice: {
        kind: "discard", controller: "ai", remaining: 2, candidates: [{ id: "a1", name: "Gone" }],
        queue: [{ playerId: "ai", remaining: 2 }],
        resume: { program, controller: "user", targets: [], nextAtomIndex: 1, cardName: "Discard+Gain" },
      },
    };
    let out;
    expect(() => { out = resolveDiscardChoice(gone, "a1"); }).not.toThrow();
    expect(out.players.user.life).toBe(before + 2);                                   // the caster's gain-2-life rider resumed
  });
});

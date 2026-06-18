/**
 * impulseDig.test.js — δ-2 impulse-dig (Strategic Planning / Anticipate / Glimpse-style "look at the
 * top N, keep one, rest away"). The two-sentence "Look at the top N cards of your library. Put one of
 * them into your hand and the rest <on the bottom | into your graveyard>." template collapses to one
 * `impulse-dig` atom that, at RESOLUTION, peeks the top N and sets a `pendingChoice` for the controller
 * to keep one card (→ hand); the rest go to the bottom of the library / the graveyard. Reuses the same
 * pause→resume seam as tutor / scry / clone / hand-discard. The driver surfaces a picker for the human
 * or auto-keeps the highest-mv card for the AI / Expert.
 *
 * Pins: the exact-template ALLOWLIST (a 3-way split / filtered / multi-pick / "you may" / reveal variant
 * stays low → Arbiter), both rest-destinations, the resolution-time reveal + keep, rider resume
 * ("…then draw"), the empty-library no-op, the eliminated-controller guard, and the driver/picker paths.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createGameState, _resetIdsForTests } from "./gameState.js";
import { legalActionsForPlayer, filterActions } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { advanceUntilDecision, applyImpulseDigChoice } from "./learnSession.js";
import { autoPickTutorCandidate, resolveImpulseDigChoice } from "./effects/runProgram.js";
import { parseEffectProgram, programConfidence } from "./effects/parser.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const SORCERY = "Sorcery";
const DIG_BOTTOM = { id: "db", name: "Anticipate", type: SORCERY, mana: "{U}", oracle: "Look at the top three cards of your library. Put one of them into your hand and the rest on the bottom of your library in any order." };
const DIG_GY = { id: "dg", name: "Strategic Planning", type: SORCERY, mana: "{U}", oracle: "Look at the top three cards of your library. Put one of them into your hand and the rest into your graveyard." };
const DIG_GY_DRAW = { id: "dgd", name: "DigDraw", type: SORCERY, mana: "{1}{U}", oracle: "Look at the top three cards of your library. Put one of them into your hand and the rest into your graveyard. Draw a card." };

const lib = (...ids) => ids.map(([id, cmc]) => ({ id, name: id, cmc }));

function state({ hand = [], library = [] } = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...s, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
    players: { ...s.players, user: { ...s.players.user, hand, library, manaPool: { ...s.players.user.manaPool, C: 6, U: 2 } } },
  };
}
// Cast `cardId` and AUTO-keep the best card (the AI/Expert path), then drain any riders.
function castAndAutoResolve(s, cardId) {
  const cast = filterActions(legalActionsForPlayer(s, "user"), "cast-spell").find((a) => a.cardId === cardId);
  expect(cast).toBeTruthy();
  let next = resolveTopOfStack(dispatchAction(s, cast));
  while (next.pendingChoice?.kind === "impulse-dig") next = resolveImpulseDigChoice(next, autoPickTutorCandidate(next, next.pendingChoice));
  while (next.stack.length) next = resolveTopOfStack(next);
  return next;
}

describe("parser — the dig template is HIGH with amount + restTo; other shapes → Arbiter", () => {
  it("rest→bottom and rest→graveyard both parse to one impulse-dig atom", () => {
    expect(parseEffectProgram(DIG_BOTTOM).atoms).toEqual([{ op: "impulse-dig", amount: 3, restTo: "bottom" }]);
    expect(parseEffectProgram(DIG_GY).atoms).toEqual([{ op: "impulse-dig", amount: 3, restTo: "graveyard" }]);
  });
  it("a 'then draw' rider composes via the multi-atom gate", () => {
    const p = parseEffectProgram(DIG_GY_DRAW);
    expect(programConfidence(p)).toBe("high");
    expect(p.atoms.map((a) => a.op)).toEqual(["impulse-dig", "draw"]);
  });
  it("a 3-way split / filtered / multi-pick / 'you may' / reveal variant stays low → Arbiter", () => {
    const low = (oracle) => expect(programConfidence(parseEffectProgram({ type: SORCERY, oracle }))).toBe("low");
    low("Look at the top three cards of your library. Put one of them into your hand, one on top of your library, and one on the bottom of your library."); // Telling Time — 3-way
    low("Look at the top five cards of your library. You may put a creature card from among them into your hand. Put the rest on the bottom of your library in a random order."); // filtered + you may
    low("Look at the top three cards of your library. Put two of them into your hand and the rest on the bottom of your library in any order."); // multi-pick
    low("Reveal the top three cards of your library. Put one of them into your hand and the rest into your graveyard."); // reveal, not look
    low("Look at the top X cards of your library. Put one of them into your hand and the rest on the bottom of your library in any order."); // variable X count
  });
});

describe("coverage — clean dig is native-spell", () => {
  it("both rest-destinations classify native-spell; a 3-way split is arbiter-spell", () => {
    expect(classifyCard(DIG_BOTTOM)).toBe("native-spell");
    expect(classifyCard(DIG_GY)).toBe("native-spell");
    expect(classifyCard({ type: SORCERY, name: "Telling Time", oracle: "Look at the top three cards of your library. Put one of them into your hand, one on top of your library, and one on the bottom of your library." })).toBe("arbiter-spell");
  });
});

describe("resolution — peek top N, keep one (→ hand), the rest to bottom / graveyard", () => {
  it("rest→bottom: keeps the best card; the others go under the next card on top", () => {
    const s = state({ hand: [DIG_BOTTOM], library: lib(["L1", 1], ["L2", 7], ["L3", 3], ["L4", 2]) });
    const cast = filterActions(legalActionsForPlayer(s, "user"), "cast-spell").find((a) => a.cardId === "db");
    const paused = resolveTopOfStack(dispatchAction(s, cast));
    expect(paused.pendingChoice).toMatchObject({ kind: "impulse-dig", controller: "user", restTo: "bottom" });
    expect(paused.pendingChoice.candidates.map((c) => c.id)).toEqual(["L1", "L2", "L3"]); // top 3 peeked
    const after = castAndAutoResolve(s, "db");
    expect(after.players.user.hand.map((c) => c.id)).toEqual(["L2"]);                  // highest-mv kept
    expect(after.players.user.library.map((c) => c.id)).toEqual(["L4", "L1", "L3"]);   // L4 surfaces; L1,L3 to bottom
    expect(after.players.user.graveyard).toHaveLength(0);
  });
  it("rest→graveyard: the unkept looked-at cards go to the graveyard", () => {
    const s = state({ hand: [DIG_GY], library: lib(["L1", 1], ["L2", 7], ["L3", 3], ["L4", 2]) });
    const after = castAndAutoResolve(s, "dg");
    expect(after.players.user.hand.map((c) => c.id)).toEqual(["L2"]);
    expect(after.players.user.graveyard.map((c) => c.id)).toEqual(["L1", "L3"]);
    expect(after.players.user.library.map((c) => c.id)).toEqual(["L4"]);
  });
  it("a 'then draw' rider resumes after the keep", () => {
    const s = state({ hand: [DIG_GY_DRAW], library: lib(["L1", 1], ["L2", 7], ["L3", 3], ["L4", 2]) });
    const after = castAndAutoResolve(s, "dgd");
    expect(after.players.user.hand.map((c) => c.id).sort()).toEqual(["L2", "L4"]);     // L2 kept + L4 drawn
    expect(after.players.user.graveyard.map((c) => c.id)).toEqual(["L1", "L3"]);
  });
  it("fewer cards than N: looks at the whole (small) library, no throw", () => {
    const s = state({ hand: [DIG_BOTTOM], library: lib(["L1", 2]) });
    const after = castAndAutoResolve(s, "db");
    expect(after.players.user.hand.map((c) => c.id)).toEqual(["L1"]);
    expect(after.players.user.library).toHaveLength(0);
  });
  it("an empty library is a clean no-op (no pause, the spell still resolves)", () => {
    const s = state({ hand: [DIG_GY_DRAW], library: [] });
    const after = castAndAutoResolve(s, "dgd");
    expect(after.pendingChoice).toBeUndefined();
    expect(after.players.user.hand).toHaveLength(0); // nothing to dig; the draw rider also draws nothing (empty lib)
  });
  it("an eliminated controller mid-pause is a clean no-op (no throw, no resume)", () => {
    const s = state({ hand: [], library: lib(["L1", 1]) });
    const paused = { ...s, pendingChoice: { kind: "impulse-dig", controller: "user", candidates: [{ id: "L1", name: "L1" }], restTo: "bottom" } };
    const gone = { ...paused, players: Object.fromEntries(Object.entries(paused.players).filter(([id]) => id !== "user")) };
    expect(() => resolveImpulseDigChoice(gone, "L1")).not.toThrow();
  });
});

describe("driver — the human gets a pick-one picker; the AI / Expert auto-keep", () => {
  const sess = (st, difficulty = "beginner") => ({ id: "s", status: "active", difficulty, state: st, decisionLog: [] });
  it("a paused user dig surfaces an impulse-dig decision (beginner)", () => {
    const s = state({ hand: [DIG_BOTTOM], library: lib(["L1", 1], ["L2", 7], ["L3", 3]) });
    const cast = filterActions(legalActionsForPlayer(s, "user"), "cast-spell").find((a) => a.cardId === "db");
    const paused = resolveTopOfStack(dispatchAction(s, cast));
    const { decision } = advanceUntilDecision(sess(paused));
    expect(decision.kind).toBe("impulse-dig");
    expect(decision.candidates.map((c) => c.id)).toEqual(["L1", "L2", "L3"]);
    expect(decision.restTo).toBe("bottom");
  });
  it("Expert autopilot auto-keeps with no panel (it never surfaces an impulse-dig decision)", () => {
    // Expert drives both sides, so the post-game hand drifts; the meaningful check is that NO picker
    // surfaced (the dig settled automatically). The auto-keep-the-best correctness is covered by the
    // resolution tests above (they use autoPickTutorCandidate — the same picker the Expert driver runs).
    const s = state({ hand: [DIG_GY], library: lib(["L1", 1], ["L2", 7], ["L3", 3]) });
    const cast = filterActions(legalActionsForPlayer(s, "user"), "cast-spell").find((a) => a.cardId === "dg");
    const paused = resolveTopOfStack(dispatchAction(s, cast));
    const { decision } = advanceUntilDecision(sess(paused, "expert"));
    expect(decision.kind).not.toBe("impulse-dig");
  });
  it("applyImpulseDigChoice: a valid pick keeps it; an illegal pick re-surfaces the picker", () => {
    const s = state({ hand: [DIG_GY], library: lib(["L1", 1], ["L2", 7], ["L3", 3]) });
    const cast = filterActions(legalActionsForPlayer(s, "user"), "cast-spell").find((a) => a.cardId === "dg");
    const paused = resolveTopOfStack(dispatchAction(s, cast));
    const picked = applyImpulseDigChoice(sess(paused), { cardId: "L1" }); // human keeps the cheap card, not the auto-best
    expect(picked.session.state.players.user.hand.map((c) => c.id)).toEqual(["L1"]);
    expect(picked.session.state.players.user.graveyard.map((c) => c.id).sort()).toEqual(["L2", "L3"]);
    const illegal = applyImpulseDigChoice(sess(paused), { cardId: "not-a-candidate" });
    expect(illegal.decision.kind).toBe("impulse-dig"); // re-surfaced, not a crash
  });
});

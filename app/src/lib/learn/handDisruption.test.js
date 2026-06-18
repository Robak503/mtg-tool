/**
 * handDisruption.test.js — δ-1b targeted hand disruption (Duress / Thoughtseize / Inquisition /
 * Coercion / Despise / Divest / Harsh Scrutiny). The 3-sentence "reveal hand → choose → discard"
 * template collapses to one `discard-chosen` atom that TARGETS AN OPPONENT (a player), chosen at cast
 * WITHOUT seeing their hand. At RESOLUTION the atom reveals THAT opponent's hand, filters it, and sets a
 * `pendingChoice` for the caster to pick which card to discard (the human gets a picker; the AI / Expert
 * auto-pick the best card). This is the faithful Duress flow — and in 4P it can't cross-opponent
 * cherry-pick or leak the other hands (the key δ-1b fix over δ-1a's cast-time `handCard` model).
 *
 * Pins: the exact-template + filter ALLOWLIST, opponents-only targeting, the resolution-time reveal +
 * pending-choice, single-opponent reveal in 4P (no leak), the empty-hand clean no-op, the human picker
 * path (applyHandDiscardChoice), the trigger→Arbiter gate, and the AI heuristics (which opponent / which
 * card).
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createGameState, _resetIdsForTests } from "./gameState.js";
import { legalActionsForPlayer, filterActions } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { advanceUntilDecision, applyHandDiscardChoice } from "./learnSession.js";
import { autoPickHandDiscardCandidate, resolveHandDiscardChoice, resolveScryChoice } from "./effects/runProgram.js";
import { enumerateTargets } from "./spellEffects.js";
import { parseEffectProgram, programConfidence } from "./effects/parser.js";
import { classifyCard } from "./coverage.js";
import { pickAction } from "./opponentAI.js";

beforeEach(() => _resetIdsForTests());

const SORCERY = "Sorcery";
const DURESS = { id: "dur", name: "Duress", type: SORCERY, mana: "{B}", oracle: "Target opponent reveals their hand. You choose a noncreature, nonland card from it. That player discards that card." };
const THOUGHTSEIZE = { id: "ts", name: "Thoughtseize", type: SORCERY, mana: "{B}", oracle: "Target player reveals their hand. You choose a nonland card from it. That player discards that card. You lose 2 life." };
const INQUISITION = { id: "inq", name: "Inquisition of Kozilek", type: SORCERY, mana: "{B}", oracle: "Target player reveals their hand. You choose a nonland card from it with mana value 3 or less. That player discards that card." };
const COERCION = { id: "coe", name: "Coercion", type: SORCERY, mana: "{2}{B}", oracle: "Target opponent reveals their hand. You choose a card from it. That player discards that card." };
const DESPISE = { id: "des", name: "Despise", type: SORCERY, mana: "{B}", oracle: "Target opponent reveals their hand. You choose a creature or planeswalker card from it. That player discards that card." };
const HARSH = { id: "hs", name: "Harsh Scrutiny", type: SORCERY, mana: "{B}", oracle: "Target opponent reveals their hand. You choose a creature card from it. That player discards that card. Scry 1." };

const sorc = (id, name, cmc = 1) => ({ id, name, type: "Sorcery", mana: "{1}", cmc, oracle: "Draw a card." });
const crea = (id, name, cmc = 2) => ({ id, name, type: "Creature — Bear", mana: "{2}", cmc, power: 2, toughness: 2, oracle: "" });
const land = (id, name) => ({ id, name, type: "Land", cmc: 0, oracle: "" });
const pw = (id, name) => ({ id, name, type: "Legendary Planeswalker — Test", cmc: 4, oracle: "" });
const bomb = (id, name) => ({ id, name, type: "Sorcery", mana: "{6}", cmc: 6, oracle: "Draw seven cards." });

function state({ userHand = [], aiHand = [], extraSeats = null } = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  const players = {
    ...s.players,
    user: { ...s.players.user, hand: userHand, manaPool: { ...s.players.user.manaPool, C: 6, B: 2 } },
    ai: { ...s.players.ai, hand: aiHand },
  };
  if (extraSeats) for (const [id, hand] of Object.entries(extraSeats)) players[id] = { ...s.players.ai, hand };
  return { ...s, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0, players };
}

// Cast `cardId` at opponent `victim` and AUTO-settle the resolution-time discard pick (the AI/Expert path).
function castAndAutoResolve(s, cardId, victim) {
  const cast = filterActions(legalActionsForPlayer(s, "user"), "cast-spell").find((a) => a.cardId === cardId && a.targets?.[0]?.id === victim);
  expect(cast).toBeTruthy();
  let next = resolveTopOfStack(dispatchAction(s, cast));
  while (next.pendingChoice?.kind === "hand-discard") next = resolveHandDiscardChoice(next, autoPickHandDiscardCandidate(next, next.pendingChoice));
  while (next.stack.length) next = resolveTopOfStack(next);
  return next;
}

describe("parser — the Duress family is HIGH; the atom targets an OPPONENT (card chosen at resolution)", () => {
  it("the core templates parse to one discard-chosen opponent-target atom with the right handFilter", () => {
    expect(parseEffectProgram(DURESS).atoms).toEqual([{ op: "discard-chosen", targetType: "opponent", handFilter: { exclude: ["Creature", "Land"] }, who: "opponent" }]);
    expect(parseEffectProgram(COERCION).atoms).toEqual([{ op: "discard-chosen", targetType: "opponent", handFilter: {}, who: "opponent" }]);
    expect(parseEffectProgram(INQUISITION).atoms[0]).toMatchObject({ op: "discard-chosen", targetType: "opponent", handFilter: { exclude: ["Land"], maxCmc: 3 }, who: "player" });
  });
  it("riders compose via the multi-atom gate (Thoughtseize +lose-life, Harsh Scrutiny +scry)", () => {
    expect(programConfidence(parseEffectProgram(THOUGHTSEIZE))).toBe("high");
    expect(parseEffectProgram(THOUGHTSEIZE).atoms.map((a) => a.op)).toEqual(["discard-chosen", "lose-life"]);
    expect(parseEffectProgram(HARSH).atoms.map((a) => a.op)).toEqual(["discard-chosen", "scry"]);
  });
  it("a variant outside the exact template / filter allowlist stays low → Arbiter", () => {
    const low = (oracle) => expect(programConfidence(parseEffectProgram({ type: SORCERY, oracle }))).toBe("low");
    low("Target opponent reveals their hand. You choose a nonland card from it or a card from their graveyard. Exile that card. You lose 1 life."); // Agonizing Remorse
    low("Target opponent reveals their hand. You may choose a nonland card from it. If you do, that player discards that card."); // Reckoner Shakedown
    low("Target player discards two cards at random."); // Hymn to Tourach — RNG (the victim-chooses form is now EP-2)
    low("Target opponent reveals their hand. You choose a nonblack card from it. That player discards that card."); // unmodeled filter
    low("Target opponent reveals their hand. You choose a nonland card from it. That player discards that card. Create a 2/2 zombie."); // unmodeled rider
  });
});

describe("coverage — the family is native-spell; unmodeled variants are arbiter-spell", () => {
  it("Duress / Thoughtseize / Inquisition / Coercion / Despise / Harsh Scrutiny classify native-spell", () => {
    for (const c of [DURESS, THOUGHTSEIZE, INQUISITION, COERCION, DESPISE, HARSH]) expect(classifyCard(c)).toBe("native-spell");
  });
  it("the exile / no-reveal variants are arbiter-spell", () => {
    expect(classifyCard({ type: SORCERY, name: "Agonizing Remorse", oracle: "Target opponent reveals their hand. You choose a nonland card from it or a card from their graveyard. Exile that card. You lose 1 life." })).toBe("arbiter-spell");
    expect(classifyCard({ type: SORCERY, name: "Hymn to Tourach", oracle: "Target player discards two cards at random." })).toBe("arbiter-spell"); // RNG (Mind Rot's victim-chooses form is now EP-2)
  });
});

describe("enumeration — targets are OPPONENT players (the card is chosen at resolution, hand-blind at cast)", () => {
  it("offers every opponent, never the caster — and does NOT enumerate cards at cast time", () => {
    const s = state({ userHand: [DURESS], aiHand: [sorc("a-sorc", "Mine")] });
    const t = enumerateTargets(s, "user", parseEffectProgram(DURESS).atoms[0]);
    expect(t).toEqual([{ type: "player", id: "ai", name: "ai" }]);  // the opponent player — no card targets, no caster
  });
});

describe("resolution — reveal the targeted opponent's hand, then the caster picks (pending choice)", () => {
  it("Duress: cast targets an opponent; resolution pauses with that opponent's FILTERED hand as candidates", () => {
    const s = state({ userHand: [DURESS], aiHand: [sorc("a-sorc", "Divination", 2), crea("a-bear", "Bear"), land("a-land", "Swamp")] });
    const cast = filterActions(legalActionsForPlayer(s, "user"), "cast-spell").find((a) => a.cardId === "dur");
    expect(cast.targets?.[0]?.id).toBe("ai");                       // a PLAYER target
    const paused = resolveTopOfStack(dispatchAction(s, cast));
    expect(paused.pendingChoice).toMatchObject({ kind: "hand-discard", controller: "user", victim: "ai" });
    expect(paused.pendingChoice.candidates.map((c) => c.id)).toEqual(["a-sorc"]); // creature + land excluded at reveal time
  });
  it("settling the pick discards the chosen card to the VICTIM's graveyard (best card auto-picked)", () => {
    const s = state({ userHand: [DURESS], aiHand: [sorc("a-sorc", "Divination", 2), bomb("a-bomb", "Big"), crea("a-bear", "Bear")] });
    const after = castAndAutoResolve(s, "dur", "ai");
    expect(after.players.ai.graveyard.map((c) => c.id)).toEqual(["a-bomb"]); // highest-mv noncreature, nonland
    expect(after.players.ai.hand.map((c) => c.id).sort()).toEqual(["a-bear", "a-sorc"]);
  });
  it("Thoughtseize multi-atom: the discard AND the 2-life payment both resolve", () => {
    const s = state({ userHand: [THOUGHTSEIZE], aiHand: [bomb("a-bomb", "Big"), land("a-land", "Swamp")] });
    const before = s.players.user.life;
    const after = castAndAutoResolve(s, "ts", "ai");
    expect(after.players.ai.graveyard.map((c) => c.id)).toEqual(["a-bomb"]);
    expect(after.players.user.life).toBe(before - 2);
  });
  it("Inquisition's mana-value clause filters the revealed candidates to mv ≤ 3", () => {
    const s = state({ userHand: [INQUISITION], aiHand: [sorc("a-cheap", "Cheap", 2), bomb("a-big", "Big"), land("a-land", "Swamp")] });
    const paused = resolveTopOfStack(dispatchAction(s, filterActions(legalActionsForPlayer(s, "user"), "cast-spell").find((a) => a.cardId === "inq")));
    expect(paused.pendingChoice.candidates.map((c) => c.id)).toEqual(["a-cheap"]); // mv 6 + land excluded
  });
  it("Despise's include filter reveals only creature / planeswalker candidates", () => {
    const s = state({ userHand: [DESPISE], aiHand: [crea("a-bear", "Bear"), pw("a-pw", "Walker"), sorc("a-sorc", "Sorc")] });
    const paused = resolveTopOfStack(dispatchAction(s, filterActions(legalActionsForPlayer(s, "user"), "cast-spell").find((a) => a.cardId === "des")));
    expect(paused.pendingChoice.candidates.map((c) => c.id).sort()).toEqual(["a-bear", "a-pw"]);
  });
  it("CR 712.4a — a card's FRONT face decides the filter (an Instant // Land MDFC is noncreature, nonland)", () => {
    const mdfc = { id: "a-mdfc", name: "Malakir Rebirth", type: "Instant // Land", cmc: 2, oracle: "" };
    const s = state({ userHand: [DURESS], aiHand: [mdfc] });
    const paused = resolveTopOfStack(dispatchAction(s, filterActions(legalActionsForPlayer(s, "user"), "cast-spell").find((a) => a.cardId === "dur")));
    expect(paused.pendingChoice.candidates.map((c) => c.id)).toEqual(["a-mdfc"]);
  });
  it("an opponent with no matching card → revealed, nothing taken, NO pause (clean no-op; spell still resolves)", () => {
    const s = state({ userHand: [DURESS], aiHand: [crea("a-bear", "Bear"), land("a-land", "Swamp")] }); // no noncreature, nonland
    const after = castAndAutoResolve(s, "dur", "ai");
    expect(after.pendingChoice).toBeUndefined();
    expect(after.players.ai.graveyard).toHaveLength(0);
    expect(after.players.ai.hand.map((c) => c.id).sort()).toEqual(["a-bear", "a-land"]); // hand untouched
  });
  it("Harsh Scrutiny chains TWO pending choices: the discard pick, THEN the Scry rider (no wedge)", () => {
    const s = state({ userHand: [HARSH], aiHand: [crea("a-bear", "Bear"), sorc("a-sorc", "NonCrea")] });
    const withLib = { ...s, players: { ...s.players, user: { ...s.players.user, library: [{ id: "top1", name: "Top" }] } } };
    const cast = filterActions(legalActionsForPlayer(withLib, "user"), "cast-spell").find((a) => a.cardId === "hs");
    // Pause 1 — hand-discard, only the CREATURE eligible (Harsh Scrutiny = "creature card").
    let st = resolveTopOfStack(dispatchAction(withLib, cast));
    expect(st.pendingChoice.kind).toBe("hand-discard");
    expect(st.pendingChoice.candidates.map((c) => c.id)).toEqual(["a-bear"]);
    // Settle the discard → the creature is binned, AND the Scry rider chains as a SECOND pending choice.
    st = resolveHandDiscardChoice(st, autoPickHandDiscardCandidate(st, st.pendingChoice));
    expect(st.pendingChoice.kind).toBe("scry-surveil");
    expect(st.players.ai.graveyard.map((c) => c.id)).toEqual(["a-bear"]);
    expect(st.players.ai.hand.map((c) => c.id)).toEqual(["a-sorc"]); // the noncreature is untouched
    // Settle the scry → fully resolved, no lingering pending choice (the FIFO pause/resume seam held).
    st = resolveScryChoice(st, (st.pendingChoice.cards || []).map((c) => c.id));
    expect(st.pendingChoice).toBeUndefined();
    expect(st.players.user.library.map((c) => c.id)).toEqual(["top1"]);
  });
  it("608.2b — a chosen card that left the hand is a clean no-op (no throw, riders still resume)", () => {
    const s = state({ userHand: [], aiHand: [] });
    const paused = { ...s, pendingChoice: { kind: "hand-discard", controller: "user", victim: "ai", candidates: [{ id: "gone", name: "Ghost" }] } };
    expect(() => resolveHandDiscardChoice(paused, "gone")).not.toThrow();
    expect(resolveHandDiscardChoice(paused, "gone").players.ai.graveyard).toHaveLength(0);
  });
  it("an eliminated CASTER mid-pause is a clean no-op for the rider (the victim's discard still applies; no throw)", () => {
    // δ-1b review P3: guard the controller before resuming its riders (Thoughtseize "lose 2 life"),
    // mirroring resolveScryChoice / resolveOptionalChoice. The victim's discard already happened.
    const s = state({ userHand: [], aiHand: [sorc("a-card", "Strip", 2)] });
    const program = parseEffectProgram(THOUGHTSEIZE);
    const gone = { ...s, players: Object.fromEntries(Object.entries(s.players).filter(([id]) => id !== "user")),
      pendingChoice: { kind: "hand-discard", controller: "user", victim: "ai", candidates: [{ id: "a-card", name: "Strip" }],
        resume: { program, controller: "user", targets: [], nextAtomIndex: 1, cardName: "Thoughtseize" } } };
    let out;
    expect(() => { out = resolveHandDiscardChoice(gone, "a-card"); }).not.toThrow();
    expect(out.players.ai.graveyard.map((c) => c.id)).toEqual(["a-card"]); // the discard on the victim still applied
  });
});

describe("4P faithfulness — only the targeted opponent's hand is revealed (no cross-opponent leak)", () => {
  it("Duress offers each opponent, and targeting ai2 reveals ONLY ai2's hand", () => {
    const s = state({ userHand: [DURESS], aiHand: [sorc("ai-a", "A1", 5)], extraSeats: { ai2: [sorc("ai2-a", "A2", 3)], ai3: [sorc("ai3-a", "A3", 9)] } });
    const casts = filterActions(legalActionsForPlayer(s, "user"), "cast-spell").filter((a) => a.cardId === "dur");
    expect(casts.map((a) => a.targets?.[0]?.id).sort()).toEqual(["ai", "ai2", "ai3"]); // every opponent, never "user"
    const paused = resolveTopOfStack(dispatchAction(s, casts.find((a) => a.targets?.[0]?.id === "ai2")));
    expect(paused.pendingChoice.victim).toBe("ai2");
    expect(paused.pendingChoice.candidates.map((c) => c.id)).toEqual(["ai2-a"]); // ONLY ai2's hand — no ai-a / ai3-a leak
  });
});

describe("driver — the human gets a picker; the AI / Expert auto-pick", () => {
  const sess = (state, difficulty = "beginner") => ({ id: "s", status: "active", difficulty, state, decisionLog: [] });
  it("a paused user disruption surfaces a hand-discard decision (beginner)", () => {
    const s = state({ userHand: [DURESS], aiHand: [sorc("a-sorc", "S", 2)] });
    const cast = filterActions(legalActionsForPlayer(s, "user"), "cast-spell").find((a) => a.cardId === "dur");
    const paused = resolveTopOfStack(dispatchAction(s, cast));
    const { decision } = advanceUntilDecision(sess(paused));
    expect(decision.kind).toBe("hand-discard");
    expect(decision.candidates.map((c) => c.id)).toEqual(["a-sorc"]);
  });
  it("Expert autopilot auto-picks the best card with no panel", () => {
    const s = state({ userHand: [DURESS], aiHand: [sorc("a-sorc", "S", 2), bomb("a-bomb", "B")] });
    const cast = filterActions(legalActionsForPlayer(s, "user"), "cast-spell").find((a) => a.cardId === "dur");
    const paused = resolveTopOfStack(dispatchAction(s, cast));
    const { session, decision } = advanceUntilDecision(sess(paused, "expert"));
    expect(decision.kind).not.toBe("hand-discard");                 // settled, not surfaced
    expect(session.state.players.ai.graveyard.map((c) => c.id)).toEqual(["a-bomb"]);
  });
  it("applyHandDiscardChoice: a valid pick discards it; an illegal pick re-surfaces the picker", () => {
    const s = state({ userHand: [DURESS], aiHand: [sorc("a-sorc", "S", 2), bomb("a-bomb", "B")] });
    const cast = filterActions(legalActionsForPlayer(s, "user"), "cast-spell").find((a) => a.cardId === "dur");
    const paused = resolveTopOfStack(dispatchAction(s, cast));
    const picked = applyHandDiscardChoice(sess(paused), { cardId: "a-sorc" }); // the human chose the cheaper card, not the auto-best
    expect(picked.session.state.players.ai.graveyard.map((c) => c.id)).toEqual(["a-sorc"]);
    const illegal = applyHandDiscardChoice(sess(paused), { cardId: "not-a-candidate" });
    expect(illegal.decision.kind).toBe("hand-discard");             // re-surfaced, not a crash
  });
});

describe("trigger gate — a discard-chosen TRIGGER routes to the Arbiter", () => {
  it("a permanent whose attack trigger strips a hand is NOT native-trigger", () => {
    const trig = { type: "Creature — Rogue", name: "Thief", oracle: "Whenever this creature attacks, target opponent reveals their hand. You choose a noncreature, nonland card from it. That player discards that card." };
    expect(classifyCard(trig)).not.toBe("native-trigger");
  });
});

describe("AI — casts hand disruption, hitting the opponent with the most cards, then their best card", () => {
  it("the AI targets the most-loaded opponent and never its own hand", () => {
    const s0 = state({ userHand: [sorc("u-a", "A", 1), bomb("u-b", "B")], aiHand: [], extraSeats: { ai2: [sorc("x", "X", 1)] } });
    const s = { ...s0, activePlayer: "ai", priorityHolder: "ai",
      players: { ...s0.players, ai: { ...s0.players.ai, hand: [DURESS], manaPool: { ...s0.players.ai.manaPool, C: 6, B: 2 } } } };
    const picked = pickAction(s, "ai", legalActionsForPlayer(s, "ai"));
    expect(picked?.kind).toBe("cast-spell");
    expect(picked?.cardId).toBe("dur");
    expect(picked?.targets?.[0]?.id).toBe("user");                  // user holds 2 cards vs ai2's 1
    expect(picked?.targets?.[0]?.id).not.toBe("ai");                // never its own hand
  });
});

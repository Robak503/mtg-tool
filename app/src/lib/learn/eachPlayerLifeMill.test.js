/**
 * eachPlayerLifeMill.test.js — EACH-PLAYER slice 3 (EP-3): the life-loss / mill ACTOR extends to
 * EVERY player (sibling of the each-player draw slice).
 *
 *   - "Each player loses N life"  (Crushing Disappointment, Bad Deal) — symmetric life loss.
 *   - "Each player mills N cards" (Winds of Rebuke rider, Mind Funeral-adjacent) — symmetric mill.
 *
 * Both are NON-targeted (who:"eachPlayer", no targetType), so they resolve identically on a spell or a
 * trigger — no first-legal self-target hazard (unlike a "target player" detriment). Pins: the parser
 * shapes, coverage = native-spell, the resolution (every player loses N / mills N from their OWN
 * library), composition with a controller-side atom (Crushing Disappointment), an ETB symmetric loss
 * routing natively, and the anchored allowlist (a "for each" rider / variable X-count stays low → Arbiter).
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createGameState, _resetIdsForTests } from "./gameState.js";
import { legalActionsForPlayer, filterActions } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { parseEffectProgram, programConfidence } from "./effects/parser.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const SORCERY = "Sorcery";
const CRUSHING = { id: "cd", name: "Crushing Disappointment", type: SORCERY, mana: "{4}{B}", cmc: 5, oracle: "Each player loses 2 life. You draw two cards." };
const lib = (prefix, n) => Array.from({ length: n }, (_, i) => ({ id: `${prefix}-l${i}`, name: `${prefix}Card${i}`, type: SORCERY, mana: "{1}", oracle: "Draw a card." }));

function state({ userHand = [], extraSeats = null } = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  const players = {
    ...s.players,
    user: { ...s.players.user, hand: userHand, library: lib("u", 10), manaPool: { ...s.players.user.manaPool, C: 12, B: 5 } },
    ai: { ...s.players.ai, library: lib("a", 10) },
  };
  if (extraSeats) for (const id of extraSeats) players[id] = { ...s.players.ai, library: lib(id, 10) };
  return { ...s, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0, players };
}
function castAndResolve(s, cardId) {
  const cast = filterActions(legalActionsForPlayer(s, "user"), "cast-spell").find((a) => a.cardId === cardId);
  expect(cast).toBeTruthy();
  let next = resolveTopOfStack(dispatchAction(s, cast));
  while (next.stack.length) next = resolveTopOfStack(next);
  return next;
}

describe("EP-3 parser — each-player life/mill is HIGH; controller/each-opponent forms unchanged", () => {
  it("parses to one who:eachPlayer atom", () => {
    expect(parseEffectProgram({ type: SORCERY, oracle: "Each player loses 3 life." }).atoms)
      .toEqual([{ op: "lose-life", amount: 3, who: "eachPlayer", targetType: null }]);
    expect(parseEffectProgram({ type: SORCERY, oracle: "Each player mills four cards." }).atoms)
      .toEqual([{ op: "mill", amount: 4, who: "eachPlayer", targetType: null }]);
  });
  it("leaves the existing controller / each-opponent forms intact", () => {
    expect(parseEffectProgram({ type: SORCERY, oracle: "You lose 2 life." }).atoms[0]).toMatchObject({ op: "lose-life", who: "controller" });
    expect(parseEffectProgram({ type: SORCERY, oracle: "Each opponent loses 2 life." }).atoms[0]).toMatchObject({ op: "lose-life", who: "eachOpponent" });
    expect(parseEffectProgram({ type: SORCERY, oracle: "Each opponent mills three cards." }).atoms[0]).toMatchObject({ op: "mill", who: "eachOpponent" });
  });
  it("MUST_DROP_TO_LOW: a 'for each' rider or a variable X-count stays low → Arbiter", () => {
    const low = (o) => expect(programConfidence(parseEffectProgram({ type: SORCERY, oracle: o }))).toBe("low");
    low("Each player loses 1 life for each creature they control."); // Stronghold Discipline
    low("Each player mills X cards.");                                // Dread Summons (variable)
    low("Each player loses life equal to the number of cards in their hand.");
  });
});

describe("EP-3 coverage — symmetric life/mill spells classify native-spell", () => {
  it("Crushing Disappointment + standalone forms are native-spell", () => {
    expect(classifyCard(CRUSHING)).toBe("native-spell");
    expect(classifyCard({ type: SORCERY, name: "Syphon", oracle: "Each player loses 2 life." })).toBe("native-spell");
    expect(classifyCard({ type: SORCERY, name: "Funeral", oracle: "Each player mills five cards." })).toBe("native-spell");
  });
});

describe("EP-3 resolution — EVERY player loses N / mills N from their own zone (4P)", () => {
  it("Each player loses 2 life hits all four seats", () => {
    const s = state({ userHand: [{ id: "x", name: "X", type: SORCERY, mana: "{B}", oracle: "Each player loses 2 life." }], extraSeats: ["ai2", "ai3"] });
    const before = { user: s.players.user.life, ai: s.players.ai.life, ai2: s.players.ai2.life, ai3: s.players.ai3.life };
    const after = castAndResolve(s, "x");
    expect(after.players.user.life).toBe(before.user - 2);
    expect(after.players.ai.life).toBe(before.ai - 2);
    expect(after.players.ai2.life).toBe(before.ai2 - 2);
    expect(after.players.ai3.life).toBe(before.ai3 - 2);
  });
  it("Each player mills three: every library loses 3 to its OWN graveyard", () => {
    const s = state({ userHand: [{ id: "m", name: "M", type: SORCERY, mana: "{B}", oracle: "Each player mills three cards." }], extraSeats: ["ai2"] });
    const after = castAndResolve(s, "m");
    expect(after.players.user.graveyard.map((c) => c.id)).toContain("u-l0");
    expect(after.players.user.library.length).toBe(7);
    expect(after.players.ai.graveyard.length).toBe(3);
    expect(after.players.ai.graveyard.map((c) => c.id)).toEqual(["a-l0", "a-l1", "a-l2"]);
    expect(after.players.ai2.library.length).toBe(7);
  });
  it("Crushing Disappointment: each player loses 2 AND the caster draws 2 (composition)", () => {
    const s = state({ userHand: [CRUSHING] });
    const userLifeBefore = s.players.user.life;
    const after = castAndResolve(s, "cd");
    expect(after.players.user.life).toBe(userLifeBefore - 2);
    expect(after.players.ai.life).toBe(s.players.ai.life - 2);
    expect(after.players.user.hand.length).toBe(2); // cast CD (-1), drew 2 → 2 in hand
  });
});

describe("EP-3 trigger — a symmetric ETB life-loss routes natively (non-targeted, no self-target hazard)", () => {
  it("an ETB 'each player loses N life' creature is native-trigger", () => {
    expect(classifyCard({ type: "Creature — Cleric", name: "Drain Priest", oracle: "When this creature enters, each player loses 1 life." })).toBe("native-trigger");
  });
});

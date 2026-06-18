/**
 * MODAL-2 — "Choose two —" / "Choose one or both —" modal spells (Kolaghan's Command, Soul
 * Manipulation, Crush Contraband, the command/charm cycle).
 *
 * Extends the shipped EXACTLY-ONE modal ("Choose one") to a multi-mode pick. The gate + executor ship
 * TOGETHER (the CREED invariant): the parser recognizes the count, the cast-time enumerator
 * (targeting.expandCastChoices) expands the mode COMBINATIONS with per-mode targets, and the executor
 * (runProgram.programAtoms) concatenates EVERY chosen mode's atoms — so a "Choose two" never silently
 * drops its 2nd mode. `chosenMode` becomes `number | number[]`. This file pins:
 *   1. the parser — count parsing ("choose two" → 2; "one or both" → 2 upTo; "choose one" unchanged);
 *      an unmodeled mode / an unsupported count ("up to two") / count > modes all stay LOW;
 *   2. the enumeration — choose-two of N modes → C(N,2) combos (chosenMode is an ARRAY); "one or both"
 *      also offers the single-mode picks;
 *   3. the executor (CREED core) — BOTH chosen modes resolve, each targeted mode on its OWN target;
 *   4. coverage — the staples are native-spell; an unmodeled-mode choose-two bounces to the Arbiter.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { createGameState, _resetIdsForTests } from "./gameState.js";
import { legalActionsForPlayer, filterActions } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { parseEffectProgram, programConfidence } from "./effects/parser.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const prog = (oracle, type = "Instant") => parseEffectProgram({ name: "x", type, oracle });
const conf = (oracle) => programConfidence(prog(oracle));

const permAI = (id, card) => ({ id, card, controller: "ai", tapped: false, summoningSick: false, counters: {}, damageMarked: 0, attachments: [], attachedTo: null });
function castState(card, { aiBattlefield = [], userLibrary = [] } = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...s, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
    players: {
      ...s.players,
      user: { ...s.players.user, hand: [card], manaPool: { ...s.players.user.manaPool, C: 2 }, library: userLibrary, life: 40 },
      ai: { ...s.players.ai, battlefield: aiBattlefield, life: 40 },
    },
  };
}
const castsOf = (st, id) => filterActions(legalActionsForPlayer(st, "user"), "cast-spell").filter((c) => c.cardId === id);

describe("parser — modal count (choose two / one or both)", () => {
  it("parses the count: choose one → 1, choose two → 2, one or both → 2 upTo", () => {
    expect(prog("Choose one —\n• Draw a card.\n• You gain 3 life.").modal).toMatchObject({ chooseCount: 1, upTo: false });
    expect(prog("Choose two —\n• Draw a card.\n• You gain 3 life.\n• Each opponent loses 2 life.").modal).toMatchObject({ chooseCount: 2, upTo: false });
    expect(prog("Choose one or both —\n• Draw a card.\n• You gain 3 life.").modal).toMatchObject({ chooseCount: 2, upTo: true });
    expect(conf("Choose two —\n• Draw a card.\n• You gain 3 life.\n• Each opponent loses 2 life.")).toBe("high");
  });

  it("CREED: an UNMODELED mode, an unsupported count, or count>modes all stay LOW", () => {
    // all-or-nothing across modes — one unmodeled mode drops the whole card.
    expect(conf("Choose two —\n• Draw a card.\n• Each player reveals their hand, then you choose a noncreature card from it.")).toBe("low");
    // "choose up to two" / "choose two or more" — counts the executor doesn't model → low (never matched).
    expect(conf("Choose up to two —\n• Draw a card.\n• You gain 3 life.")).toBe("low");
    // "one or both" must be a TWO-mode card; "choose two" needs ≥2 modes.
    expect(conf("Choose one or both —\n• Draw a card.\n• You gain 3 life.\n• Each opponent loses 2 life.")).toBe("low"); // 3 modes ≠ "one or both"
  });
});

describe("enumeration — mode combinations (chosenMode is an array)", () => {
  const THREE_MODE = { id: "cmd", name: "Cmd", type: "Instant", mana: "{1}", oracle: "Choose two —\n• You gain 3 life.\n• Draw a card.\n• Each opponent loses 2 life." };
  it("choose-two of 3 modes → C(3,2)=3 casts, each chosenMode a 2-index array", () => {
    const casts = castsOf(castState(THREE_MODE, { userLibrary: [{ id: "d1", name: "C1", type: "Instant" }] }), "cmd");
    expect(casts).toHaveLength(3);
    expect(casts.every((c) => Array.isArray(c.chosenMode) && c.chosenMode.length === 2)).toBe(true);
    expect(casts.map((c) => c.chosenMode.join("-")).sort()).toEqual(["0-1", "0-2", "1-2"]);
  });

  it("'one or both' of 2 modes → 3 casts (each single + the pair)", () => {
    const ORBOTH = { id: "ob", name: "OrBoth", type: "Instant", mana: "{1}", oracle: "Choose one or both —\n• You gain 3 life.\n• Draw a card." };
    const casts = castsOf(castState(ORBOTH, { userLibrary: [{ id: "d1", name: "C1", type: "Instant" }] }), "ob");
    const shapes = casts.map((c) => c.chosenMode.join("-")).sort();
    expect(shapes).toEqual(["0", "0-1", "1"]); // {0}, {1}, {0,1}
  });
});

describe("executor (CREED core) — BOTH chosen modes resolve, each on its own target", () => {
  it("a non-targeted choose-two resolves both chosen modes", () => {
    const cmd = { id: "cmd", name: "Cmd", type: "Instant", mana: "{1}", oracle: "Choose two —\n• You gain 3 life.\n• Draw a card.\n• Each opponent loses 2 life." };
    let st = castState(cmd, { userLibrary: [{ id: "d1", name: "C1", type: "Instant" }] });
    const pick = castsOf(st, "cmd").find((c) => c.chosenMode.join("-") === "0-2"); // gain life + opp loses
    st = resolveTopOfStack(dispatchAction(st, pick));
    expect(st.players.user.life).toBe(43); // +3
    expect(st.players.ai.life).toBe(38);   // −2
  });

  it("a TARGETED choose-two resolves each mode on its OWN target (global atomIndex binding)", () => {
    const cmd = { id: "cmd", name: "Cmd", type: "Instant", mana: "{1}", oracle: "Choose two —\n• Destroy target artifact.\n• Cmd deals 2 damage to target creature.\n• Draw a card." };
    let st = castState(cmd, {
      aiBattlefield: [permAI("art", { name: "Bauble", type: "Artifact" }), permAI("cre", { name: "Bear", type: "Creature — Bear", power: 2, toughness: 2 })],
      userLibrary: [{ id: "d1", name: "C1", type: "Instant" }],
    });
    const pick = castsOf(st, "cmd").find((c) => c.chosenMode.join("-") === "0-1" && c.targets.some((t) => t.id === "art") && c.targets.some((t) => t.id === "cre"));
    expect(pick).toBeTruthy();
    st = resolveTopOfStack(dispatchAction(st, pick));
    expect(st.players.ai.battlefield).toHaveLength(0);                                   // artifact destroyed, creature died
    expect(st.players.ai.graveyard.map((c) => c.name).sort()).toEqual(["Bauble", "Bear"]); // each mode hit its own target
  });
});

describe("coverage — choose-two staples are native-spell; unmodeled-mode bounces", () => {
  const C = (oracle, name) => ({ type: "Instant", oracle, mana: "", name });
  it("Kolaghan's Command / Soul Manipulation / Crush Contraband are native-spell", () => {
    expect(classifyCard(C("Choose two —\n• Return target creature card from your graveyard to your hand.\n• Target player discards a card.\n• Destroy target artifact.\n• Kolaghan's Command deals 2 damage to any target.", "Kolaghan's Command"))).toBe("native-spell");
    expect(classifyCard(C("Choose one or both —\n• Counter target creature spell.\n• Return target creature card from your graveyard to your hand.", "Soul Manipulation"))).toBe("native-spell");
    expect(classifyCard(C("Choose one or both —\n• Exile target artifact.\n• Exile target enchantment.", "Crush Contraband"))).toBe("native-spell");
  });
  it("CREED: a choose-two with an unmodeled mode stays Arbiter", () => {
    expect(classifyCard(C("Choose two —\n• Draw a card.\n• You gain 3 life.\n• Each player reveals their hand, then you choose a noncreature card from it.", "FakeCmd"))).toBe("arbiter-spell");
  });
});

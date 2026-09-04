/**
 * tolariaWest.test.js — SHELF-85 runbook Phase 2 · T8 (2026-09-04): Tolaria West (Teval) — TRANSMUTE.
 *
 *   "This land enters tapped.
 *    {T}: Add {U}.
 *    Transmute {1}{U}{U} ({1}{U}{U}, Discard this card: Search your library for a card with mana value 0, reveal it,
 *    put it into your hand, then shuffle. Transmute only as a sorcery.)"
 *
 * CR 702.53a defines transmute as the from-hand discard ability the reminder text spells out. The lane that already
 * plays "<mana>, Discard this card: <effect>" (cycling generalized; the NEO Channel lands) reads the keyword line as
 * that ability, with the search at THIS card's printed mana value (a land's is 0) and a `sorceryOnly` flag the offer
 * site enforces as an empty stack. The coverage line regex admits the transmute line under the same predicate.
 *
 * Real oracle fixtures (bundled Scryfall snapshot, verified in-session 2026-09-04).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { parseDiscardCostAbility } from "./effects/abilities.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { resolveTutorChoice } from "./effects/runProgram.js";
import { classifyCard } from "./coverage.js";
import { _resetIdsForTests, createGameState, createPermanent, createStackObject } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const TW = { id: "c-tw", name: "Tolaria West", type: "Land", keywords: ["Transmute"],
  oracle: "This land enters tapped.\n{T}: Add {U}.\nTransmute {1}{U}{U} ({1}{U}{U}, Discard this card: Search your library for a card with mana value 0, reveal it, put it into your hand, then shuffle. Transmute only as a sorcery.)" };
const MUDDLE = { id: "c-mm", name: "Muddle the Mixture", type: "Instant", mana: "{U}{U}", cmc: 2, keywords: ["Transmute"],
  oracle: "Counter target instant or sorcery spell.\nTransmute {1}{U}{U} ({1}{U}{U}, Discard this card: Search your library for a card with mana value 2, reveal it, put it into your hand, then shuffle. Transmute only as a sorcery.)" };

const island = (id, ctrl) => createPermanent({ id, card: { id: "card-" + id, name: "Island", type: "Basic Land — Island", oracle: "{T}: Add {U}." }, controller: ctrl });
const LIB_ISLAND = { id: "lib-island", name: "Island", type: "Basic Land — Island", cmc: 0, oracle: "{T}: Add {U}." };
const LIB_CRYPT = { id: "lib-crypt", name: "Mana Crypt", type: "Artifact", mana: "{0}", cmc: 0, oracle: "{T}: Add {C}{C}." };
const LIB_BOLT = { id: "lib-bolt", name: "Lightning Bolt", type: "Instant", mana: "{R}", cmc: 1, oracle: "Lightning Bolt deals 3 damage to any target." };

function board(ctrl = "user", { lands = 3 } = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  const other = ctrl === "user" ? "ai" : "user";
  return { ...s, phase: "precombat-main", step: "main", activePlayer: ctrl, priorityHolder: ctrl, consecutivePasses: 0, turn: 4,
    players: { ...s.players,
      [ctrl]: { ...s.players[ctrl], battlefield: Array.from({ length: lands }, (_, i) => island("I" + i, ctrl)), hand: [{ ...TW, id: "tw-hand" }], library: [LIB_BOLT, LIB_ISLAND, LIB_CRYPT], graveyard: [] },
      [other]: { ...s.players[other], battlefield: [], hand: [], library: [{ id: "o-lib", name: "Forest", type: "Basic Land — Forest", oracle: "{T}: Add {G}." }] } } };
}
const transmuteOffer = (s, ctrl) => legalActionsForPlayer(s, ctrl).filter((a) => a.kind === "discard-ability" && a.cardId === "tw-hand");

describe("parse — the keyword line is the from-hand discard ability CR 702.53a spells out", () => {
  it("Tolaria West: {1}{U}{U}, discard → search for mana value 0, sorcery-only", () => {
    expect(parseDiscardCostAbility(TW)).toEqual({ cost: "{1}{U}{U}", effectText: "Search your library for a card with mana value 0, reveal it, put it into your hand, then shuffle.", channel: false, reduction: null, transmute: true, sorceryOnly: true });
  });
  it("the mana value is THIS card's (Muddle the Mixture searches for 2); the string reader prices hybrid and {X} as CR 202.3 does", () => {
    expect(parseDiscardCostAbility(MUDDLE).effectText).toMatch(/mana value 2,/);
    const hybridX = { name: "Fixture", type: "Creature", mana: "{2/W}{G/U}{X}{B/P}", oracle: "Transmute {2}{B}{B}" };
    expect(parseDiscardCostAbility(hybridX).effectText).toMatch(/mana value 4,/); // 2 + 1 + 0 + 1
    // An unpriceable symbol → no ability at all (never a guessed mana value).
    expect(parseDiscardCostAbility({ name: "Odd", type: "Creature", mana: "{Q}", oracle: "Transmute {2}{B}{B}" })).toBeNull();
  });
  it("seen-to-fail: a transmute line buried in a larger sentence, or with an unmodeled cost, is not read", () => {
    expect(parseDiscardCostAbility({ name: "X", type: "Instant", mana: "{U}", oracle: "Counter target spell. Transmute {1}{U}{U} is nothing here." })).toBeNull();
    expect(parseDiscardCostAbility({ name: "Y", type: "Instant", mana: "{U}", oracle: "Draw a card.\nTransmute" })).toBeNull();
  });
});

describe("offer — sorcery timing and the price", () => {
  it("offered from hand with three untapped Islands and an empty stack", () => {
    const acts = transmuteOffer(board(), "user");
    expect(acts).toHaveLength(1);
    expect(acts[0]).toMatchObject({ kind: "discard-ability", cardId: "tw-hand", name: "Tolaria West" });
  });
  it("NOT offered while something is on the stack (Activate only as a sorcery)", () => {
    const s0 = board();
    const s = { ...s0, stack: [createStackObject({ id: "stk-x", kind: "spell", source: { name: "Some Spell", oracle: "" }, controller: "ai", targets: [], payload: { resolver: "noop", params: {} } })] };
    expect(transmuteOffer(s, "user")).toHaveLength(0);
  });
  it("NOT offered short of {1}{U}{U}", () => {
    expect(transmuteOffer(board("user", { lands: 2 }), "user")).toHaveLength(0);
  });
});

describe("runtime — discard as the cost, then the mana-value-0 search", () => {
  it("user: the card is in the graveyard while the ability resolves; only mana value 0 cards are candidates; the pick lands in hand", () => {
    let s = board();
    s = dispatchAction(s, transmuteOffer(s, "user")[0]);
    expect(s.players.user.hand.some((c) => c.id === "tw-hand")).toBe(false);
    expect(s.players.user.graveyard.some((c) => c.id === "tw-hand")).toBe(true); // cost paid before resolution (CR 601.2h)
    expect(s.stack).toHaveLength(1);
    expect(s.players.user.battlefield.filter((p) => p.tapped)).toHaveLength(3);
    while (s.stack.length && !s.pendingChoice) s = resolveTopOfStack(s);
    expect(s.pendingChoice).toMatchObject({ kind: "tutor-search", controller: "user" });
    expect(s.pendingChoice.candidates.map((c) => c.id ?? c).sort()).toEqual(["lib-crypt", "lib-island"]); // Bolt (1) is out
    s = resolveTutorChoice(s, "lib-crypt");
    expect(s.players.user.hand.map((c) => c.id)).toEqual(["lib-crypt"]);
    expect(s.players.user.library.map((c) => c.id).sort()).toEqual(["lib-bolt", "lib-island"]);
  });
  it("AI: the same lane from the AI seat", () => {
    let s = board("ai");
    const acts = transmuteOffer(s, "ai");
    expect(acts).toHaveLength(1);
    s = dispatchAction(s, acts[0]);
    while (s.stack.length && !s.pendingChoice) s = resolveTopOfStack(s);
    expect(s.pendingChoice).toMatchObject({ kind: "tutor-search", controller: "ai" });
    s = resolveTutorChoice(s, s.pendingChoice.candidates[0].id ?? s.pendingChoice.candidates[0]);
    expect(s.players.ai.hand).toHaveLength(1);
    expect(s.players.ai.graveyard.map((c) => c.id)).toEqual(["tw-hand"]);
  });
});

describe("classifier", () => {
  it("Tolaria West is a full land; Muddle the Mixture stays a native spell", () => {
    expect(classifyCard(TW)).toBe("land");
    expect(classifyCard(MUDDLE)).toBe("native-spell");
  });
});

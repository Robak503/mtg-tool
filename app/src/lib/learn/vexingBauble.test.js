/**
 * vexingBauble.test.js — SG-13 (2026-09-03): Vexing Bauble — "Whenever a player casts a spell, if no mana was
 * spent to cast it, counter that spell." + "{1}, {T}, Sacrifice this artifact: Draw a card." (the Squirrel
 * Girl deck). Three pieces: the dispatcher threads a DEFINITE `manaSpent` (true from a paid plan, false from a
 * free cast, null on an alternative cost) into the cast-trigger context; the intervening-if vocabulary reads
 * it ("can't confirm" on null — never a fired guess); "counter that spell" counters the CAST spell the trigger
 * fired on (ctx.castStackObjectId).
 *
 * Real oracle fixture (bundled Scryfall snapshot, read in-session 2026-09-03).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { createGameState, createPermanent, createStackObject, _resetIdsForTests } from "./gameState.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { flushTriggers, resolveTopOfStack } from "./gameEngine.js";
import { checkCastTriggers } from "./triggers.js";
import { evaluateInterveningIf, interveningIfParseable } from "./interveningIf.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const BAUBLE = { id: "c-bauble", name: "Vexing Bauble", type: "Artifact", mana: "{1}", keywords: [], oracle: "Whenever a player casts a spell, if no mana was spent to cast it, counter that spell.\n{1}, {T}, Sacrifice this artifact: Draw a card." };
const THOPTER = { id: "h-thopter", name: "Ornithopter", type: "Artifact Creature — Thopter", mana: "{0}", mana_cost: "{0}", power: 0, toughness: 2, keywords: ["flying"], oracle: "Flying" };
const BEAR = { id: "h-bear", name: "Grizzly Bears", type: "Creature — Bear", mana: "{1}{G}", mana_cost: "{1}{G}", power: 2, toughness: 2, keywords: [], oracle: "" };

function board() {
  const s0 = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...s0, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", turn: 4, consecutivePasses: 0,
    players: {
      ...s0.players,
      user: { ...s0.players.user, hand: [THOPTER, BEAR], graveyard: [], battlefield: [], library: [], manaPool: { W: 0, U: 0, B: 0, R: 0, G: 2, C: 0 } },
      ai: { ...s0.players.ai, battlefield: [createPermanent({ id: "bauble", card: BAUBLE, controller: "ai", summoningSick: false })] },
    },
  };
}
const castOf = (s, cardId) => legalActionsForPlayer(s, "user").find((a) => a.kind === "cast-spell" && a.cardId === cardId);

describe("the condition", () => {
  it("reads a definite manaSpent; null stays unconfirmed", () => {
    expect(interveningIfParseable("no mana was spent to cast it")).toBe(true);
    const s = board();
    expect(evaluateInterveningIf(s, "no mana was spent to cast it", "ai", { manaSpent: false })).toBe(true);
    expect(evaluateInterveningIf(s, "no mana was spent to cast it", "ai", { manaSpent: true })).toBe(false);
    expect(evaluateInterveningIf(s, "no mana was spent to cast it", "ai", { manaSpent: null })).toBeNull();
    expect(evaluateInterveningIf(s, "no mana was spent to cast it", "ai", {})).toBeNull();
  });
});

describe("runtime — through the dispatcher", () => {
  it("⭐ a {0} Ornithopter (no mana spent) is countered by the opponent's Bauble", () => {
    const s = board();
    const act = castOf(s, "h-thopter");
    expect(act).toBeTruthy();
    const cast = dispatchAction(s, act);
    const flushed = flushTriggers(cast);
    expect(flushed.stack.some((o) => o.kind === "triggered-ability")).toBe(true);
    const out = resolveTopOfStack(flushed);
    expect(out.stack.some((o) => o.kind === "spell")).toBe(false);
    expect(out.players.user.graveyard.some((c) => c.id === "h-thopter")).toBe(true);
    expect(out.players.user.battlefield.some((p) => p.card?.id === "h-thopter")).toBe(false);
  });

  it("a paid Grizzly Bears is NOT countered — the trigger's intervening-if fails and it never hits the stack", () => {
    const s = board();
    const cast = dispatchAction(s, castOf(s, "h-bear"));
    const flushed = flushTriggers(cast);
    expect(flushed.stack.some((o) => o.kind === "triggered-ability")).toBe(false);
    const out = resolveTopOfStack(flushed);
    expect(out.players.user.battlefield.some((p) => p.card?.id === "h-bear")).toBe(true);
  });

  it("⛔ an UNKNOWN payment (manaSpent null — an alternative cost) never fires the counter", () => {
    const s = board();
    const stk = createStackObject({ id: "stk-x", kind: "spell", source: BEAR, controller: "user", targets: [], payload: {} });
    const withSpell = { ...s, stack: [stk] };
    const fired = checkCastTriggers(withSpell, { spellCard: BEAR, casterId: "user", stackObjectId: "stk-x", manaSpent: null });
    let s2 = flushTriggers(fired);
    // Whether the flush kept the unconfirmed trigger or not, resolving everything above the spell must leave
    // the spell on the stack — the counter needs a DEFINITE "no mana was spent" (CR 603.4, re-checked at resolution).
    while (s2.stack.length && s2.stack[s2.stack.length - 1].id !== "stk-x") s2 = resolveTopOfStack(s2);
    expect(s2.stack.some((o) => o.id === "stk-x")).toBe(true);
    expect(s2.players.user.graveyard.some((c) => c.id === "h-bear")).toBe(false);
  });
});

describe("classification", () => {
  it("Vexing Bauble is native; a different condition parks", () => {
    expect(classifyCard(BAUBLE)).toMatch(/^native/);
    expect(classifyCard({ ...BAUBLE, oracle: BAUBLE.oracle.replace("if no mana was spent to cast it", "if no green mana was spent to cast it") })).not.toMatch(/^native/);
  });

  it("CREED — 'counter that spell' on a NON-cast trigger has no referent and must not claim native", () => {
    expect(classifyCard({ ...BAUBLE, oracle: "Whenever a creature enters, counter that spell.\n{1}, {T}, Sacrifice this artifact: Draw a card." })).not.toMatch(/^native/);
  });
});

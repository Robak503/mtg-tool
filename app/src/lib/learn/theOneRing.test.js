/**
 * theOneRing.test.js — SG-17 (2026-09-03): THE ONE RING, native. "Indestructible. When The One Ring enters, if you
 * cast it, you gain protection from everything until your next turn. At the beginning of your upkeep, you lose 1
 * life for each burden counter on The One Ring. {T}: Put a burden counter on The One Ring, then draw a card for
 * each burden counter on The One Ring."
 * Three arms on proven pieces: the cast-only ETB grants the PROTECTION half of Teferi's shield (no life lock —
 * the burden still bites); a `namedCountersOnSource` count kind sizes the upkeep life loss and the draw off the
 * Ring's live burden bag; the trigger's self-name rewrite learned the "lose N life for each <kind> counter on
 * <Name>" grammar. Real oracle fixture (bundled Scryfall snapshot, read in-session 2026-09-03).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { createGameState, createPermanent, loseLife, playerProtectedFromEverything, playerLifeLocked, _resetIdsForTests } from "./gameState.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { flushTriggers, resolveTopOfStack } from "./gameEngine.js";
import { checkStepTriggers, checkEnterTriggers, checkDiesTriggers, detectTriggers } from "./triggers.js";
import { parseEffectClause } from "./effects/parser.js";
import { parseCountSource } from "./effects/parseHelpers.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const RING = { id: "c-ring", name: "The One Ring", type: "Legendary Artifact", mana: "{4}", mana_cost: "{4}", cmc: 4, keywords: ["Indestructible"], oracle: "Indestructible\nWhen The One Ring enters, if you cast it, you gain protection from everything until your next turn.\nAt the beginning of your upkeep, you lose 1 life for each burden counter on The One Ring.\n{T}: Put a burden counter on The One Ring, then draw a card for each burden counter on The One Ring." };
const filler = (id) => ({ id, name: "Card " + id, type: "Instant", mana: "{U}", oracle: "" });

function board({ ringInHand = false, burden = 0, wasCast = null } = {}) {
  const s0 = createGameState({ userDeck: [], aiDeck: [] });
  const ring = { ...createPermanent({ id: "ring", card: RING, controller: "user" }), counters: burden ? { burden } : {}, ...(wasCast != null ? { wasCast } : {}) };
  return {
    ...s0, turn: 5, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
    players: {
      ...s0.players,
      user: { ...s0.players.user, life: 20, hand: ringInHand ? [{ ...RING, id: "h-ring" }] : [], graveyard: [], library: [filler("l1"), filler("l2"), filler("l3"), filler("l4")], battlefield: ringInHand ? [] : [ring], manaPool: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 4 } },
      ai: { ...s0.players.ai, life: 20, hand: [], graveyard: [], library: [], battlefield: [] },
    },
  };
}
const ringOf = (s) => s.players.user.battlefield.find((p) => p.card?.name === "The One Ring");

describe("the parses + the tier", () => {
  it("the count source reads a named counter kind on the source; the three clauses parse whole; the card is native", () => {
    expect(parseCountSource("burden counters on this artifact")).toEqual({ kind: "namedCountersOnSource", counterType: "burden" });
    expect(parseCountSource("+1/+1 counters on this creature")).toEqual({ kind: "plusCountersOnSource" });
    expect(parseCountSource("burden counters on target creature")).toBeNull();
    const ds = detectTriggers(RING);
    expect(ds.find((d) => d.event === "etb")).toMatchObject({ interveningIf: "you cast it", effectClause: "you gain protection from everything until your next turn" });
    expect(ds.find((d) => d.event === "upkeep")).toMatchObject({ effectClause: "you lose 1 life for each burden counter on this creature" });
    expect(parseEffectClause("you gain protection from everything until your next turn", "Artifact").atoms).toEqual([{ op: "player-protection-everything", targetType: null }]);
    expect(classifyCard(RING)).toBe("native-mixed");
  });
});

describe("runtime", () => {
  it("⭐ cast it: the ETB grants protection from everything WITHOUT the life lock (the burden still bites)", () => {
    const s = board({ ringInHand: true });
    const act = legalActionsForPlayer(s, "user").find((a) => a.kind === "cast-spell" && a.cardId === "h-ring");
    expect(act).toBeTruthy();
    let out = resolveTopOfStack(dispatchAction(s, act));
    out = flushTriggers(out);
    expect(out.stack.some((o) => o.kind === "triggered-ability")).toBe(true);
    out = resolveTopOfStack(out);
    expect(playerProtectedFromEverything(out, "user")).toBe(true);
    expect(playerLifeLocked(out, "user")).toBe(false);
    expect(loseLife(out, { playerId: "user", amount: 3, combatDamage: false }).players.user.life).toBe(17);
  });

  it("not cast (put onto the battlefield): the ETB's intervening-if fails and no shield is granted", () => {
    const s = board({ wasCast: false });
    const flushed = flushTriggers(checkEnterTriggers(s, ringOf(s)));
    expect(flushed.stack.some((o) => o.kind === "triggered-ability")).toBe(false); // dropped at flush: the condition is false
    const out = flushed.stack.length ? resolveTopOfStack(flushed) : flushed;
    expect(playerProtectedFromEverything(out, "user")).toBe(false);
  });

  it("⭐ the tap: a burden counter, then a draw per burden counter — 1 then 2", () => {
    const s = board();
    const tap = (st) => legalActionsForPlayer(st, "user").find((a) => a.kind === "activate-ability" && a.permanentId === "ring");
    const a1 = tap(s);
    expect(a1).toBeTruthy();
    const after1 = resolveTopOfStack(dispatchAction(s, a1));
    expect(ringOf(after1).counters.burden).toBe(1);
    expect(after1.players.user.hand.length).toBe(1);
    // Untap it and go again: two counters, two cards.
    const untapped = { ...after1, players: { ...after1.players, user: { ...after1.players.user, battlefield: after1.players.user.battlefield.map((p) => (p.id === "ring" ? { ...p, tapped: false } : p)) } } };
    const after2 = resolveTopOfStack(dispatchAction(untapped, tap(untapped)));
    expect(ringOf(after2).counters.burden).toBe(2);
    expect(after2.players.user.hand.length).toBe(3);
  });

  it("⭐ the upkeep: lose 1 life per burden counter (2 counters → 18); none → nothing lost", () => {
    const two = board({ burden: 2 });
    const out = resolveTopOfStack(flushTriggers(checkStepTriggers({ ...two, phase: "beginning", step: "upkeep" }, "upkeep")));
    expect(out.players.user.life).toBe(18);
    const none = board({ burden: 0 });
    const fired = checkStepTriggers({ ...none, phase: "beginning", step: "upkeep" }, "upkeep");
    const outNone = fired.pendingTriggers?.length ? resolveTopOfStack(flushTriggers(fired)) : fired;
    expect(outNone.players.user.life).toBe(20);
  });
});

describe("the count kind's last-known-information reads (the 14 riders that flipped with the Ring)", () => {
  const VIAL = { id: "c-vial", name: "Synthetic Vial", type: "Artifact", mana: "{2}", keywords: [], oracle: "{T}, Sacrifice this artifact: It deals damage equal to the number of charge counters on it to any target." };
  const ZOA = { id: "c-zoa", name: "Synthetic Zoa", type: "Creature — Jellyfish", mana: "{2}{U}", power: 2, toughness: 2, keywords: [], oracle: "When this creature dies, draw cards equal to the number of oil counters on it." };
  const withPerms = (perms) => { const s = board(); return { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: perms, hand: [] } } }; };

  it("⭐ sacrificed as its own cost: the damage reads the counters it HAD (3 charge → 3 damage), not a vanished 0", () => {
    const s = withPerms([{ ...createPermanent({ id: "vial", card: VIAL, controller: "user" }), counters: { charge: 3 } }]);
    const act = legalActionsForPlayer(s, "user").find((a) => a.kind === "activate-ability" && a.permanentId === "vial" && (a.targets || []).some((t) => t.type === "player" && t.id === "ai"));
    expect(act).toBeTruthy();
    const out = resolveTopOfStack(dispatchAction(s, act));
    expect(out.players.user.battlefield.some((p) => p.id === "vial")).toBe(false);
    expect(out.players.ai.life).toBe(17);
    expect(classifyCard(VIAL)).toMatch(/^native/);
  });

  it("⭐ a self-dies payoff reads the death look-back's counters (2 oil → draw 2)", () => {
    const s = withPerms([]);
    const dead = { controller: "user", id: "zoa", name: "Synthetic Zoa", card: ZOA, counters: { oil: 2 } };
    const out = resolveTopOfStack(flushTriggers(checkDiesTriggers(s, [dead])));
    expect(out.players.user.hand.length).toBe(2);
    expect(classifyCard(ZOA)).toMatch(/^native/);
  });

  it("no look-back and no live source → 0, even with another permanent's self-sacrifice stamp still on the state (never a stale read)", () => {
    // The Vial's stamp (charge: 3) is still on the state after its sacrifice; a DIFFERENT gone source reading the
    // same counter kind with no look-back of its own must read 0, not the Vial's 3.
    const s = withPerms([{ ...createPermanent({ id: "vial", card: VIAL, controller: "user" }), counters: { charge: 3 } }]);
    const act = legalActionsForPlayer(s, "user").find((a) => a.kind === "activate-ability" && a.permanentId === "vial" && (a.targets || []).some((t) => t.type === "player" && t.id === "ai"));
    const afterVial = resolveTopOfStack(dispatchAction(s, act));
    expect(afterVial.sacrificedSelfLki).toMatchObject({ permanentId: "vial", counters: { charge: 3 } });
    const CHARGER = { id: "c-chg", name: "Synthetic Charger", type: "Creature — Construct", mana: "{2}", power: 1, toughness: 1, keywords: [], oracle: "When this creature dies, draw cards equal to the number of charge counters on it." };
    const dead = { controller: "user", id: "charger", name: "Synthetic Charger", card: CHARGER };
    const fired = checkDiesTriggers(afterVial, [dead]);
    const out = fired.pendingTriggers?.length ? resolveTopOfStack(flushTriggers(fired)) : fired;
    expect(out.players.user.hand.length).toBe(0);
  });
});

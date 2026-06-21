/**
 * heraldUnblockable.test.js — COUNTER-PAYOFF static (Herald of Secret Streams): "Each creature you control
 * with a +1/+1 counter on it can't be blocked." A layer-6 unblockable grant gated PER-CREATURE on a +1/+1
 * counter (selector.requiresCounter), read layer-aware by combat so it tracks the counter dynamically.
 */
import { describe, it, expect } from "vitest";
import { parseStaticAbilities } from "./staticAbilityParser.js";
import { classifyCard } from "./coverage.js";
import { createGameState, createPermanent } from "./gameState.js";
import { canBlockAttacker } from "./combatEvasion.js";

// The real card's templating (plural "counters", "on them", no "a"); the matcher also accepts the
// singular "each creature you control with a +1/+1 counter on it" form.
const HERALD = "Creatures you control with +1/+1 counters on them can't be blocked.";

describe("Herald grant — parse + coverage", () => {
  it("parses a layer-6 unblockable grant gated on a +1/+1 counter", () => {
    const d = parseStaticAbilities({ name: "Herald of Secret Streams", oracle: HERALD });
    expect(d).toHaveLength(1);
    expect(d[0].layer).toBe(6);
    expect(d[0].op).toEqual({ layerOp: "addKeyword", keyword: "unblockable" });
    expect(d[0].affects.selector).toMatchObject({ controllerScope: "you", cardTypes: ["Creature"], requiresCounter: "+1/+1" });
  });
  it("classifies Herald native-static (its only ability is the grant)", () => {
    expect(classifyCard({ name: "Herald of Secret Streams", type: "Creature — Merfolk", power: 2, toughness: 3, oracle: HERALD })).toBe("native-static");
  });
  it("a trailing qualifier ('can't be blocked by Walls') does NOT match (no partial evasion)", () => {
    expect(parseStaticAbilities({ name: "X", oracle: "Creatures you control with +1/+1 counters on them can't be blocked by Walls." })).toHaveLength(0);
  });
});

describe("Herald grant — combat (layer-aware, dynamic)", () => {
  const setup = (attackerCounters, attackerController = "user") => {
    const s = createGameState({ userDeck: [], aiDeck: [] });
    const herald = createPermanent({ card: { name: "Herald", type: "Creature — Merfolk", power: 2, toughness: 3, oracle: HERALD }, controller: "user" });
    const attBase = createPermanent({ card: { name: "Hydra", type: "Creature — Hydra", power: 5, toughness: 5 }, controller: attackerController });
    const att = { ...attBase, counters: { ...attBase.counters, ...attackerCounters } };
    const blocker = createPermanent({ card: { name: "Wall", type: "Creature — Wall", power: 0, toughness: 4 }, controller: "ai" });
    const userBf = [herald, ...(attackerController === "user" ? [att] : [])];
    const aiBf = [blocker, ...(attackerController === "ai" ? [att] : [])];
    const st = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: userBf }, ai: { ...s.players.ai, battlefield: aiBf } } };
    return { st, attId: att.id, blkId: blocker.id };
  };

  it("MY creature with a +1/+1 counter is unblockable", () => {
    const { st, attId, blkId } = setup({ "+1/+1": 3 });
    expect(canBlockAttacker(st, blkId, attId, "ai")).toBe(false);
  });
  it("MY creature WITHOUT a +1/+1 counter is still blockable", () => {
    const { st, attId, blkId } = setup({});
    expect(canBlockAttacker(st, blkId, attId, "ai")).toBe(true);
  });
  it("an OPPONENT's counter-bearing creature is NOT granted unblockable by MY Herald", () => {
    // Herald grants to "creatures YOU control" — the AI's attacker (even with a +1/+1 counter) isn't mine.
    const { st, attId } = setup({ "+1/+1": 3 }, "ai");
    // here the blocker is mine (user); the AI attacks. canBlockAttacker(my blocker vs ai attacker):
    const myBlocker = createPermanent({ card: { name: "MyWall", type: "Creature — Wall", power: 0, toughness: 4 }, controller: "user" });
    const st2 = { ...st, players: { ...st.players, user: { ...st.players.user, battlefield: [...st.players.user.battlefield, myBlocker] } } };
    expect(canBlockAttacker(st2, myBlocker.id, attId, "user")).toBe(true); // AI's creature is blockable
  });
});

/**
 * counterPayoffKeyword.test.js — the COUNTER-PAYOFF keyword anthem, generalizing Herald's counter-gated
 * grant ("creatures you control with +1/+1 counters on them can't be blocked" → unblockable, #323) to any
 * GRANTABLE keyword: "…have trample" (Badgermole/Emil/Training Regimen), "…have reach and trample", etc.
 * A layer-6 grant gated PER-CREATURE on a +1/+1 counter (the requiresCounter dynamic selector).
 */
import { describe, it, expect } from "vitest";
import { parseStaticAbilities } from "./staticAbilityParser.js";
import { createGameState, createPermanent } from "./gameState.js";
import { permanentHasKeyword } from "./layers.js";

const TRAMPLE_ANTHEM = "Creatures you control with +1/+1 counters on them have trample.";

describe("counter-payoff keyword anthem — parse", () => {
  it("grants trample gated on a +1/+1 counter", () => {
    const d = parseStaticAbilities({ name: "Badgermole", oracle: TRAMPLE_ANTHEM });
    expect(d).toHaveLength(1);
    expect(d[0].layer).toBe(6);
    expect(d[0].op).toEqual({ layerOp: "addKeyword", keyword: "Trample" });
    expect(d[0].affects.selector).toMatchObject({ controllerScope: "you", cardTypes: ["Creature"], requiresCounter: "+1/+1" });
  });
  it("grants multiple keywords: 'have reach and trample'", () => {
    const d = parseStaticAbilities({ name: "X", oracle: "Creatures you control with +1/+1 counters on them have reach and trample." });
    expect(d.map((e) => e.op.keyword).sort()).toEqual(["Reach", "Trample"]);
  });
  it("menace IS grantable (GATED-GY-EXT) — counter-payoff menace anthem IS modeled", () => {
    expect(parseStaticAbilities({ name: "X", oracle: "Creatures you control with +1/+1 counters on them have menace." })).toHaveLength(1);
    expect(parseStaticAbilities({ name: "X", oracle: "Creatures you control with +1/+1 counters on them have trample and menace." })).toHaveLength(2);
  });
  it("ALL-OR-NOTHING: a non-grantable keyword anywhere in the phrase → no grant (no silent drop)", () => {
    expect(parseStaticAbilities({ name: "X", oracle: "Creatures you control with +1/+1 counters on them have hexproof." })).toHaveLength(0);
    expect(parseStaticAbilities({ name: "X", oracle: "Creatures you control with +1/+1 counters on them have trample and hexproof." })).toHaveLength(0);
  });
  it("a conditional / label prefix does NOT match (safe FN — the condition isn't modeled)", () => {
    expect(parseStaticAbilities({ name: "Inspiring Paladin", oracle: "During your turn, creatures you control with +1/+1 counters on them have first strike." })).toHaveLength(0);
    expect(parseStaticAbilities({ name: "Sphere Grid", oracle: "Unlock Ability — Creatures you control with +1/+1 counters on them have reach and trample." })).toHaveLength(0);
  });
});

describe("counter-payoff trample — combat (dynamic per-creature gate)", () => {
  it("a creature with a +1/+1 counter has trample, one without doesn't", () => {
    const s = createGameState({ userDeck: [], aiDeck: [] });
    const badge = createPermanent({ card: { name: "Badgermole", type: "Creature — Badger", power: 2, toughness: 2, oracle: TRAMPLE_ANTHEM }, controller: "user" });
    const withCounter = { ...createPermanent({ card: { name: "Hydra", type: "Creature — Hydra", power: 3, toughness: 3 }, controller: "user" }), counters: { "+1/+1": 2 } };
    const without = createPermanent({ card: { name: "Bear", type: "Creature — Bear", power: 2, toughness: 2 }, controller: "user" });
    const foe = { ...createPermanent({ card: { name: "Foe", type: "Creature — Goblin", power: 1, toughness: 1 }, controller: "ai" }), counters: { "+1/+1": 1 } };
    const st = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [badge, withCounter, without] }, ai: { ...s.players.ai, battlefield: [foe] } } };
    expect(permanentHasKeyword(st, withCounter.id, "Trample")).toBe(true);  // my counter-bearer
    expect(permanentHasKeyword(st, without.id, "Trample")).toBe(false);     // my no-counter creature
    expect(permanentHasKeyword(st, badge.id, "Trample")).toBe(false);       // Badgermole itself has no counter
    expect(permanentHasKeyword(st, foe.id, "Trample")).toBe(false);         // opponent's (not "you control")
  });
});

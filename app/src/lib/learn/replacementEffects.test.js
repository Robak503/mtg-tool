/**
 * replacementEffects.test.js — Wave-3 COUNTER-AND-TOKEN-DOUBLER-REPLACEMENT (brief #6, the #1 FP).
 *
 * Unit: detection (doublerProfile / isPureDoubler) over the REAL oracle text of all 9 doublers, and the
 * factor math (greedy-max additive+multiplicative, x4 stacking, scope, Vorinclex halve, token multiplier).
 * Integration: the central addCounter interception, the token-count multiply, and the enters-with-counters
 * bypass site (resolvers.js), all doubled; a no-doubler board is a byte-for-byte no-op (regression guard).
 */
import { describe, it, expect, beforeEach } from "vitest";
import { doublerProfile, isPureDoubler, applyCounterDoubling, tokenMultiplier } from "./replacementEffects.js";
import { _resetIdsForTests, createGameState, createPermanent, addCounter, findPermanent } from "./gameState.js";
import { applyCreateToken } from "./effects/atoms/tokens.js";
import { enterPermanent } from "./resolvers.js";

beforeEach(() => _resetIdsForTests());

// Real oracle text (verified against the bundled oracle index).
const TEXT = {
  doublingSeason: ["Enchantment", "If an effect would create one or more tokens under your control, it creates twice that many of those tokens instead. If an effect would put one or more counters on a permanent you control, it puts twice that many of those counters on that permanent instead."],
  branchingEvolution: ["Enchantment", "If one or more +1/+1 counters would be put on a creature you control, twice that many +1/+1 counters are put on that creature instead."],
  hardenedScales: ["Enchantment", "If one or more +1/+1 counters would be put on a creature you control, that many plus one +1/+1 counters are put on it instead."],
  primalVigor: ["Enchantment", "If one or more tokens would be created, twice that many of those tokens are created instead. If one or more +1/+1 counters would be put on a creature, twice that many +1/+1 counters are put on that creature instead."],
  parallelLives: ["Enchantment", "If an effect would create one or more tokens under your control, it creates twice that many of those tokens instead."],
  vorinclex: ["Legendary Creature — Phyrexian Praetor", "Trample, haste\nIf you would put one or more counters on a permanent or player, put twice that many of each of those kinds of counters on that permanent or player instead.\nIf an opponent would put one or more counters on a permanent or player, they put half that many of each of those kinds of counters on that permanent or player instead, rounded down."],
  corpsejack: ["Creature — Fungus", "If one or more +1/+1 counters would be put on a creature you control, twice that many +1/+1 counters are put on it instead."],
  mondrak: ["Legendary Creature — Phyrexian Horror", "If one or more tokens would be created under your control, twice that many of those tokens are created instead.\n{1}{W/P}{W/P}, Sacrifice two other artifacts and/or creatures: Put an indestructible counter on Mondrak."],
  // Pir, Imaginative Rascal — "your team controls" additive doubler. Caught a gate FP: the scope regex missed
  // "your team controls" and fell through to global, leaking Pir's +1 onto opponents' counters. In this engine
  // (1v1 + FFA only, no teammates) "your team" == you, so Pir is you-scoped.
  pir: ["Legendary Creature — Human", "Partner with Toothy, Imaginary Friend (When this creature enters, target player may put Toothy into their hand from their library, then shuffle.)\nIf one or more counters would be put on a permanent your team controls, that many plus one of each of those kinds of counters are put on that permanent instead."],
};
const cardOf = (k) => ({ name: k, type: TEXT[k][0], oracle: TEXT[k][1] });
const permOf = (k, controller) => ({ id: `dbl-${k}`, controller, card: cardOf(k), counters: {} });
// A minimal state with the given doubler permanents split by controller "me" / "opp".
const stateWith = (...perms) => ({
  players: { me: { battlefield: perms.filter((p) => p.controller === "me") }, opp: { battlefield: perms.filter((p) => p.controller === "opp") } },
  turnOrder: ["me", "opp"],
});

describe("doublerProfile / isPureDoubler — detection over real text", () => {
  it("classifies the pure replacement-static enchantments (native-static)", () => {
    for (const k of ["doublingSeason", "branchingEvolution", "hardenedScales", "primalVigor", "parallelLives"]) {
      expect(doublerProfile(cardOf(k)), k).toBeTruthy();
      expect(isPureDoubler(cardOf(k)), k).toBe(true);
    }
  });
  it("a doubler on a CREATURE / with an activated ability is NOT pure (stays body-only — CREED whole-card)", () => {
    for (const k of ["vorinclex", "corpsejack", "mondrak"]) {
      expect(doublerProfile(cardOf(k)), k).toBeTruthy(); // still a runtime doubler
      expect(isPureDoubler(cardOf(k)), k).toBe(false);   // but not native-static
    }
  });
  it("scope + kind are read correctly", () => {
    expect(doublerProfile(cardOf("branchingEvolution")).counter).toMatchObject({ op: "multiply", kind: "+1/+1", scope: "you" });
    expect(doublerProfile(cardOf("hardenedScales")).counter).toMatchObject({ op: "additive", kind: "+1/+1", scope: "you" });
    expect(doublerProfile(cardOf("primalVigor")).counter).toMatchObject({ kind: "+1/+1", scope: "global" }); // no "you control"
    expect(doublerProfile(cardOf("doublingSeason")).counter).toMatchObject({ kind: "any", scope: "you" });
    expect(doublerProfile(cardOf("vorinclex")).halvesOpponents).toBe(true);
    // Vorinclex's "if you would put …" self-clause IS a you-scope multiply (that is what self-doubles its
    // controller's counters through the central path); the opponent clause is the separate halvesOpponents flag.
    expect(doublerProfile(cardOf("vorinclex")).counter).toMatchObject({ op: "multiply", kind: "any", scope: "you" });
    // Pir "your team controls" → you-scope additive (the gate-FP fix); a creature + Partner body → not pure.
    expect(doublerProfile(cardOf("pir")).counter).toMatchObject({ op: "additive", kind: "any", scope: "you" });
    expect(isPureDoubler(cardOf("pir"))).toBe(false);
  });
  it("a non-doubler card returns null", () => {
    expect(doublerProfile({ type: "Creature", oracle: "Flying" })).toBeNull();
    expect(isPureDoubler({ type: "Creature", oracle: "Flying" })).toBe(false);
  });
});

describe("applyCounterDoubling — factor math (CR 616.1e greedy-max)", () => {
  it("additive THEN multiplicative, greedy-max: Hardened Scales + Primal Vigor on base 1 → 4 (not 3)", () => {
    expect(applyCounterDoubling(stateWith(permOf("hardenedScales", "me"), permOf("primalVigor", "me")), "me", "+1/+1", 1)).toBe(4);
  });
  it("two multiplicative doublers stack to x4", () => {
    expect(applyCounterDoubling(stateWith(permOf("doublingSeason", "me"), permOf("doublingSeason", "me")), "me", "+1/+1", 1)).toBe(4);
  });
  it("a +1/+1-only doubler does NOT double a non-+1/+1 counter (loyalty)", () => {
    expect(applyCounterDoubling(stateWith(permOf("branchingEvolution", "me")), "me", "loyalty", 3)).toBe(3);
    // …but Doubling Season (any counter) does double loyalty.
    expect(applyCounterDoubling(stateWith(permOf("doublingSeason", "me")), "me", "loyalty", 3)).toBe(6);
  });
  it("a you-scope doubler never affects an opponent's counters (the forbidden FP)", () => {
    expect(applyCounterDoubling(stateWith(permOf("doublingSeason", "opp")), "me", "+1/+1", 1)).toBe(1);
  });
  it("Pir 'your team controls' is you-scope: boosts its controller, NEVER an opponent (gate-caught FP regression)", () => {
    expect(applyCounterDoubling(stateWith(permOf("pir", "me")), "me", "+1/+1", 1)).toBe(2);  // your counter: base + 1
    expect(applyCounterDoubling(stateWith(permOf("pir", "me")), "opp", "+1/+1", 1)).toBe(1);  // opponent's: UNCHANGED
  });
  it("a GLOBAL doubler (Primal Vigor) affects everyone", () => {
    expect(applyCounterDoubling(stateWith(permOf("primalVigor", "opp")), "me", "+1/+1", 1)).toBe(2);
  });
  it("Vorinclex halves (floor) counters on an opponent's permanent, doubles its controller's", () => {
    expect(applyCounterDoubling(stateWith(permOf("vorinclex", "opp")), "me", "+1/+1", 5)).toBe(2); // floor(5/2)
    expect(applyCounterDoubling(stateWith(permOf("vorinclex", "me")), "me", "+1/+1", 3)).toBe(6);
  });
  it("no doublers → the base amount unchanged (regression no-op)", () => {
    expect(applyCounterDoubling(stateWith(), "me", "+1/+1", 3)).toBe(3);
    expect(applyCounterDoubling({ players: {} }, "me", "+1/+1", 3)).toBe(3);
  });
});

describe("tokenMultiplier", () => {
  it("two token doublers → x4; a you-doubler ignores an opponent; none → x1", () => {
    expect(tokenMultiplier(stateWith(permOf("doublingSeason", "me"), permOf("parallelLives", "me")), "me")).toBe(4);
    expect(tokenMultiplier(stateWith(permOf("parallelLives", "opp")), "me")).toBe(1);
    expect(tokenMultiplier(stateWith(), "me")).toBe(1);
  });
});

describe("integration — the doubling actually fires through the engine", () => {
  // Build a real game state with a doubler + a target creature on the active player's battlefield.
  function gameWithDoubler(doublerKey) {
    let s = createGameState({ userDeck: [], aiDeck: [] });
    const doubler = createPermanent({ id: "d1", card: cardOf(doublerKey), controller: "user" });
    const bear = createPermanent({ id: "b1", card: { name: "Bear", type: "Creature — Bear", power: 2, toughness: 2 }, controller: "user" });
    return { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [doubler, bear] } } };
  }

  it("addCounter is doubled by Doubling Season (central interception)", () => {
    const s = gameWithDoubler("doublingSeason");
    const out = addCounter(s, { permanentId: "b1", type: "+1/+1", amount: 1 });
    expect(findPermanent(out, "b1").permanent.counters["+1/+1"]).toBe(2);
  });

  it("addCounter is NOT doubled with no doubler on the board (regression)", () => {
    let s = createGameState({ userDeck: [], aiDeck: [] });
    const bear = createPermanent({ id: "b1", card: { name: "Bear", type: "Creature — Bear", power: 2, toughness: 2 }, controller: "user" });
    s = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [bear] } } };
    const out = addCounter(s, { permanentId: "b1", type: "+1/+1", amount: 1 });
    expect(findPermanent(out, "b1").permanent.counters["+1/+1"]).toBe(1);
  });

  it("token count is doubled by Parallel Lives (applyCreateToken)", () => {
    const s = gameWithDoubler("parallelLives");
    const out = applyCreateToken(s, { op: "create-token", descriptor: "1/1 white Soldier", power: 1, toughness: 1, count: 1 }, { controller: "user" });
    const tokens = out.players.user.battlefield.filter((p) => p.card?.token && /Soldier/.test(p.card.type));
    expect(tokens).toHaveLength(2);
  });

  it("enters-with-+1/+1 counters are doubled at the resolvers.js bypass site", () => {
    const s = gameWithDoubler("doublingSeason");
    // A creature that "enters with two +1/+1 counters on it" (entersWithPlusCounters reads this).
    const card = { name: "Counter Bear", type: "Creature — Bear", power: 0, toughness: 0, oracle: "Counter Bear enters with two +1/+1 counters on it." };
    const out = enterPermanent(s, card, "user");
    const entered = out.players.user.battlefield.find((p) => p.card?.name === "Counter Bear");
    expect(entered.counters["+1/+1"]).toBe(4); // 2 doubled
  });
});

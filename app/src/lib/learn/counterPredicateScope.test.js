/**
 * counterPredicateScope.test.js — COUNTER-PREDICATE trigger scope (BLITZ CNT-1, CR 122.1 + 603.10a).
 *
 * "Whenever a creature you control WITH A +1/+1 COUNTER ON IT dies/attacks, <effect>" — a live-state
 * predicate on the creatureYouControl dies/attacks scope. Before this slice the "with a +1/+1 counter on it"
 * subject hit the generic "with …" reject in classifyCondition → the whole card routed to the Arbiter
 * (body-only). This slice carves the exact predicate out (attacks/dies, +1/+1, bare "you control", optional
 * "nontoken") and threads a `requiresCounter` filter scopeMatches enforces off the triggering creature's LIVE
 * counter bag — the attacker on the battlefield, the dead creature's CR-603.10a look-back `counters` snapshot
 * (now carried on the dies look-back). Reuses the existing counter-reading machinery; no new payoff atom.
 *
 * CREED (the load-bearing invariants this guards):
 *   - The trigger fires ONLY for a triggering creature that ACTUALLY carries ≥1 +1/+1 counter (a no-counter
 *     death/attack must NOT fire — the predicate the reject would otherwise drop). A false POSITIVE here is
 *     a payoff firing on a creature the printed card excludes.
 *   - controller-scoped ("you control") — an OPPONENT's counter-creature dying/attacking never fires yours.
 *   - the "nontoken" qualifier composes: a TOKEN carrying a counter dying does NOT fire (CR 111.1).
 *   - ONLY +1/+1, the bare "you control" controller scope, and the attacks/dies verbs are modeled — an
 *     "another" self-exclusion, a "deals combat damage"/"leaves the battlefield" verb, a -1/-1 counter, or a
 *     missing "you control" leaves the trigger UNDETECTED → Arbiter (a SAFE false-negative).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { detectTriggers, checkDiesTriggers, checkAttackTriggers } from "./triggers.js";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { resolveTopOfStack, flushTriggers } from "./gameEngine.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const MELTSTRIDER = "Whenever a creature you control with a +1/+1 counter on it dies, draw a card.";
const TENURED = "When this creature enters, put a +1/+1 counter on target creature.\nWhenever a creature you control with a +1/+1 counter on it attacks, each opponent loses 1 life and you gain 1 life.";
const RAYBLADE = "Whenever a nontoken creature you control with a +1/+1 counter on it dies, create a 1/1 white Human Soldier creature token.";

const resolveAll = (s) => { let g = 0; while (s.stack.length && g++ < 80) s = resolveTopOfStack(s); return s; };

// ─── Detection ──────────────────────────────────────────────────────────────────────
describe("detectTriggers — the counter-predicate scope (attacks / dies, requiresCounter filter)", () => {
  const C = (oracle) => ({ name: "X", type: "Creature — Beast", oracle });
  it("'…with a +1/+1 counter on it dies' → dies, scope creatureYouControl, requiresCounter:+1/+1", () => {
    const d = detectTriggers(C(MELTSTRIDER)).find((x) => x.event === "dies");
    expect(d).toMatchObject({ event: "dies", scope: "creatureYouControl", requiresCounter: "+1/+1" });
    expect(d.nontokenFilter).toBeFalsy();
  });
  it("'…with a +1/+1 counter on it attacks' → attacks, scope creatureYouControl, requiresCounter:+1/+1", () => {
    const d = detectTriggers(C(TENURED)).find((x) => x.event === "attacks" && x.requiresCounter);
    expect(d).toMatchObject({ event: "attacks", scope: "creatureYouControl", requiresCounter: "+1/+1" });
  });
  it("'a NONTOKEN creature you control with a +1/+1 counter on it dies' ALSO sets nontokenFilter", () => {
    const d = detectTriggers(C(RAYBLADE)).find((x) => x.event === "dies");
    expect(d).toMatchObject({ event: "dies", scope: "creatureYouControl", requiresCounter: "+1/+1", nontokenFilter: true });
  });
  // CREED — the shapes the scope CANNOT faithfully carry must stay UNDETECTED (→ Arbiter, safe FN).
  it("'ANOTHER creature you control with a +1/+1 counter on it dies' is NOT detected (self-exclusion out of scope)", () => {
    expect(detectTriggers(C("Whenever another creature you control with a +1/+1 counter on it dies, draw a card.")).some((x) => x.requiresCounter)).toBe(false);
  });
  it("'…with a +1/+1 counter on it deals combat damage to a player' is NOT detected (different event)", () => {
    expect(detectTriggers(C("Whenever a creature you control with a +1/+1 counter on it deals combat damage to a player, you may draw a card.")).some((x) => x.requiresCounter)).toBe(false);
  });
  it("'…with a -1/-1 counter on it dies' is NOT detected (only +1/+1 admitted)", () => {
    expect(detectTriggers(C("Whenever a creature you control with a -1/-1 counter on it dies, draw a card.")).some((x) => x.requiresCounter)).toBe(false);
  });
  it("'…with a +1/+1 counter on it leaves the battlefield' is NOT detected (leaves event out of scope)", () => {
    expect(detectTriggers(C("Whenever a creature you control with a +1/+1 counter on it leaves the battlefield, draw a card.")).some((x) => x.requiresCounter)).toBe(false);
  });
  it("'a creature WITH a +1/+1 counter on it attacks one of your opponents' (no 'you control') is NOT detected", () => {
    expect(detectTriggers(C("Whenever a creature with a +1/+1 counter on it attacks one of your opponents, that creature gains deathtouch until end of turn.")).some((x) => x.requiresCounter)).toBe(false);
  });
});

// ─── Runtime — DIES scope reads the look-back's counter snapshot ──────────────────────
describe("runtime (dies) — fires ONLY for a dead creature that carried a +1/+1 counter", () => {
  function board(oracle, { lib = [] } = {}) {
    const s = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
    const watcher = createPermanent({ id: "watcher", card: { name: "W", type: "Enchantment", oracle }, controller: "user" });
    return { ...s, players: { ...s.players, user: { ...s.players.user, life: 40, library: lib, hand: [], battlefield: [watcher] } } };
  }
  const lib = (n) => Array.from({ length: n }, (_, i) => ({ id: "c" + i, name: "C" + i, type: "Instant" }));
  const deadEntry = (id, controller, counters, token = false) => ({ id, controller, card: { name: id, type: "Creature — Bear", token }, counters });

  it("a controlled creature WITH a +1/+1 counter dying draws (Meltstrider Eulogist)", () => {
    expect(classifyCard({ name: "Meltstrider Eulogist", type: "Creature — Elemental", oracle: MELTSTRIDER })).toBe("native-trigger");
    let s = board(MELTSTRIDER, { lib: lib(5) });
    s = resolveAll(flushTriggers(checkDiesTriggers(s, [deadEntry("a", "user", { "+1/+1": 1 })])));
    expect(s.players.user.hand).toHaveLength(1);
  });
  it("a controlled creature with NO counter dying does NOT fire (the predicate is enforced)", () => {
    let s = board(MELTSTRIDER, { lib: lib(5) });
    s = resolveAll(flushTriggers(checkDiesTriggers(s, [deadEntry("b", "user", {})])));
    expect(s.players.user.hand).toHaveLength(0);
  });
  it("an OPPONENT's counter-creature dying does NOT fire (controller-scoped)", () => {
    let s = board(MELTSTRIDER, { lib: lib(5) });
    s = resolveAll(flushTriggers(checkDiesTriggers(s, [deadEntry("o", "ai1", { "+1/+1": 1 })])));
    expect(s.players.user.hand).toHaveLength(0);
  });
  it("gain-life payoff resolves for a counter-creature death (Gladehart Cavalry class)", () => {
    const G = "When this creature enters, support 6. (Put a +1/+1 counter on each of up to six other target creatures.)\nWhenever a creature you control with a +1/+1 counter on it dies, you gain 2 life.";
    expect(classifyCard({ name: "Gladehart Cavalry", type: "Creature — Elf Scout", oracle: G })).toBe("native-trigger");
    let s = board(G);
    s = resolveAll(flushTriggers(checkDiesTriggers(s, [deadEntry("a", "user", { "+1/+1": 2 })])));
    expect(s.players.user.life).toBe(42);
  });
  it("NONTOKEN gate composes: a TOKEN carrying a counter dying does NOT fire; a real creature does (Rayblade Trooper)", () => {
    let s = board(RAYBLADE);
    // a token with a counter → nontoken gate blocks it
    s = resolveAll(flushTriggers(checkDiesTriggers(s, [deadEntry("tok", "user", { "+1/+1": 1 }, true)])));
    expect(s.players.user.battlefield.filter((p) => p.card?.token)).toHaveLength(0);
    // a real creature with a counter → makes a token
    s = resolveAll(flushTriggers(checkDiesTriggers(s, [deadEntry("real", "user", { "+1/+1": 1 }, false)])));
    expect(s.players.user.battlefield.filter((p) => p.card?.token)).toHaveLength(1);
  });
});

// ─── Runtime — ATTACKS scope reads the live attacker's counters ───────────────────────
describe("runtime (attacks) — fires ONLY for an attacker that carries a +1/+1 counter", () => {
  function attackBoard(oracle, counters) {
    const s = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
    const watcher = createPermanent({ id: "watcher", card: { name: "W", type: "Creature — Human", oracle }, controller: "user" });
    const atk = createPermanent({ id: "atk", card: { name: "Atk", type: "Creature — Bear", power: 2, toughness: 2 }, controller: "user" });
    atk.counters = counters; atk.summoningSick = false;
    return {
      ...s, phase: "combat", step: "declare-attackers", activePlayer: "user",
      combat: { attackers: [{ permanentId: "atk", attackingPlayer: "user", defender: "ai1" }], blockers: [] },
      players: { ...s.players, user: { ...s.players.user, life: 40, battlefield: [watcher, atk] } },
    };
  }
  it("the drain fires when the attacker HAS a +1/+1 counter (Tenured Inkcaster)", () => {
    expect(classifyCard({ name: "Tenured Inkcaster", type: "Creature — Zombie Wizard", oracle: TENURED })).toBe("native-trigger");
    let s = resolveAll(flushTriggers(checkAttackTriggers(attackBoard(TENURED, { "+1/+1": 1 }))));
    expect(s.players.user.life).toBe(41);
    expect(s.players.ai1.life).toBe(39);
  });
  it("the drain does NOT fire when the attacker has NO counter", () => {
    let s = resolveAll(flushTriggers(checkAttackTriggers(attackBoard(TENURED, {}))));
    expect(s.players.user.life).toBe(40);
    expect(s.players.ai1.life).toBe(40);
  });
});

// ─── Corpus recognition + the whole-card guard ────────────────────────────────────────
describe("recognition — real cards flip to the intended native tier; near-misses stay parked", () => {
  it("the clean corpus set classifies native", () => {
    expect(classifyCard({ name: "Tributary Instructor", type: "Creature — Merfolk Wizard", oracle: "Mentor (Whenever this creature attacks, put a +1/+1 counter on target attacking creature with lesser power.)\nWhenever a creature you control with a +1/+1 counter on it dies, draw a card." })).toBe("native-trigger");
    expect(classifyCard({ name: "Laid to Rest", type: "Enchantment", oracle: "Whenever a Human you control dies, draw a card.\nWhenever a creature you control with a +1/+1 counter on it dies, you gain 2 life." })).toBe("native-trigger");
    expect(classifyCard({ name: "Skyclave Shadowcat", type: "Creature — Cat", oracle: "{1}{B}, Sacrifice another creature: Put a +1/+1 counter on this creature.\nWhenever a creature you control with a +1/+1 counter on it dies, draw a card." })).toBe("native-mixed");
    expect(classifyCard({ name: "Elite Scaleguard", type: "Creature — Human Soldier", oracle: "When this creature enters, bolster 2. (Choose a creature with the least toughness among creatures you control and put two +1/+1 counters on it.)\nWhenever a creature you control with a +1/+1 counter on it attacks, tap target creature defending player controls." })).toBe("native-trigger");
  });
  it("⭐ Byrke's doubling rider is MODELED now (2026-07-30) — the park was a boundary marker, and it moved", () => {
    // ⚠️ THIS ASSERTION WAS INVERTED. It read body-only, calling "double the number of +1/+1 counters on it"
    // an unmodeled rider — true when written. Both halves shipped separately since: counter-doubling
    // (Primordial/Kalonian Hydra) and the "on it" → "the triggering creature" sentinel rewrite (Railway
    // Brawler). They had never met only because the rewrite gate was written around the verb "put".
    // The tier is credited here because the RUNTIME is proven in doubleCountersTriggering.test.js — the
    // attacker's counters double and Byrke's own are untouched, which is what distinguishes the correct
    // binding from the countersOnSource one that would have classified native and done nothing.
    expect(classifyCard({ name: "Byrke, Long Ear of the Law", type: "Legendary Creature — Rabbit Warrior", oracle: "Vigilance\nWhen Byrke enters, put a +1/+1 counter on each of up to two target creatures.\nWhenever a creature you control with a +1/+1 counter on it attacks, double the number of +1/+1 counters on it." })).toBe("native-trigger");
  });
  it("CREED — an 'another' self-exclusion payoff referencing 'that creature' stays body-only (Rage Forger)", () => {
    expect(classifyCard({ name: "Rage Forger", type: "Creature — Dwarf Shaman", oracle: "When this creature enters, put a +1/+1 counter on each other Shaman creature you control.\nWhenever a creature you control with a +1/+1 counter on it attacks, you may have that creature deal 1 damage to target player or planeswalker." })).toBe("body-only");
  });
});

/**
 * mothmanRad.test.js — The Wise Mothman's dual-event rad trigger:
 *   "Whenever The Wise Mothman enters or attacks, each player gets a rad counter."
 *
 * A targeted #319-style runtime hook: Cindy's compiler Arbiter-routes the "enters or attacks" disjunction
 * (compound-event guard), so this hook supplies the missing trigger bind for BOTH halves, applying the
 * already-modeled "each player gets a rad counter" effect directly. Engine-first: the rad must actually land
 * on every player AND get consumed by the radiation ability into real damage, or the card is a false
 * positive. The hook is RUNTIME-ONLY — it deliberately does NOT flip the coverage metric (metric honesty,
 * like urDragon/xCastToken): Mothman's third clause (mill → +1/+1 counters) stays unmodeled, so classifyCard
 * keeps the card non-native while the runtime plays clauses 1+2 correctly.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { parseMothmanRad, applyMothmanRadOnEnter, applyMothmanRadOnAttack } from "./mothmanRad.js";
import { _resetIdsForTests, createGameState, createPermanent, applyRadiation } from "./gameState.js";
import { runStepActions } from "./gameEngine.js";
import { enterPermanent } from "./resolvers.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const MOTHMAN_ORACLE =
  "Flying\nWhenever The Wise Mothman enters or attacks, each player gets a rad counter.\nWhenever one or more nonland cards are milled, put a +1/+1 counter on each of up to X target creatures, where X is the number of nonland cards milled this way.";

const mothmanCard = (extra = {}) => ({ id: "c-moth", name: "The Wise Mothman", type: "Legendary Creature — Insect Mutant", power: 3, toughness: 3, oracle: MOTHMAN_ORACLE, ...extra });
const mothmanPerm = (id = "moth", controller = "user") => createPermanent({ id, card: mothmanCard({ id: `c-${id}` }), controller, summoningSick: false });
const bear = (id = "bear", controller = "user") => createPermanent({ id, card: { id: `c-${id}`, name: `Bear ${id}`, type: "Creature — Bear", power: 2, toughness: 2, oracle: "" }, controller, summoningSick: false });

const rad = (s, pid) => s.players[pid].radCounters || 0;
const atk = (permanentId, attackingPlayer = "user", defender = "ai") => ({ permanentId, attackingPlayer, defender });

// 1v1 combat state: Mothman (+ any extras) on the user battlefield, with a given attacker batch.
function st2({ userBf = [], attackers = [] } = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...s,
    step: "declare-blockers",
    phase: "combat",
    combat: { attackers, blockers: [] },
    players: { ...s.players, user: { ...s.players.user, battlefield: userBf } },
  };
}

// 4P FFA pod (user + ai1/ai2/ai3) — proves "each player" reaches every seat.
function st4({ userBf = [], attackers = [] } = {}) {
  const s = createGameState({ userDeck: [], opponentDecks: [[], [], []], mode: "commander" });
  return {
    ...s,
    step: "declare-blockers",
    phase: "combat",
    combat: { attackers, blockers: [] },
    players: { ...s.players, user: { ...s.players.user, battlefield: userBf } },
  };
}

describe("parseMothmanRad — predicate", () => {
  it("parses The Wise Mothman's real oracle → { amount: 1 } (oracle and oracle_text)", () => {
    expect(parseMothmanRad({ name: "The Wise Mothman", oracle: MOTHMAN_ORACLE })).toEqual({ amount: 1 });
    expect(parseMothmanRad({ name: "The Wise Mothman", oracle_text: MOTHMAN_ORACLE })).toEqual({ amount: 1 });
  });
  it("strips reminder text before matching", () => {
    const o = "Flying (This creature can only be blocked by creatures with flying or reach.)\nWhenever The Wise Mothman enters or attacks, each player gets a rad counter.";
    expect(parseMothmanRad({ name: "The Wise Mothman", oracle: o })).toEqual({ amount: 1 });
  });
  it("is generic over the count (word and digit) and the 'this creature' self-form", () => {
    expect(parseMothmanRad({ name: "Glow Bug", oracle: "Whenever this creature enters or attacks, each player gets two rad counters." })).toEqual({ amount: 2 });
    expect(parseMothmanRad({ name: "Glow Bug", oracle: "Whenever this permanent enters or attacks, each player gets 3 rad counters." })).toEqual({ amount: 3 });
  });
  it("matches a legendary by its pre-comma short name (CR 201.4)", () => {
    expect(parseMothmanRad({ name: "Mothra, Queen of Monsters", oracle: "Whenever Mothra enters or attacks, each player gets a rad counter." })).toEqual({ amount: 1 });
  });
  it("CREED self-ref guard: a watcher on OTHER permanents is a DIFFERENT event → null (no mis-fire)", () => {
    // "a creature you control enters or attacks" fires off OTHER creatures, not the card itself; this
    // card-self hook must never claim it. No such rad card exists today — this is drift insurance.
    expect(parseMothmanRad({ name: "Fallout Field", oracle: "Whenever a creature you control enters or attacks, each player gets a rad counter." })).toBeNull();
    expect(parseMothmanRad({ name: "Fallout Field", oracle: "Whenever another creature enters or attacks, each player gets a rad counter." })).toBeNull();
  });
  it("returns null for a DIFFERENT effect on the same enters-or-attacks condition (Cindy/Arbiter's job)", () => {
    expect(parseMothmanRad({ name: "X", oracle: "Whenever X enters or attacks, draw a card." })).toBeNull();
    expect(parseMothmanRad({ name: "X", oracle: "Whenever X enters or attacks, each opponent loses 1 life." })).toBeNull();
  });
  it("returns null for a SINGLE-event rad trigger (a non-disjunction the compiler can own → no double-fire)", () => {
    expect(parseMothmanRad({ name: "X", oracle: "Whenever X attacks, each player gets a rad counter." })).toBeNull();
    expect(parseMothmanRad({ name: "X", oracle: "When X enters, each player gets a rad counter." })).toBeNull();
  });
  it("returns null for empty / missing / unrelated oracle", () => {
    expect(parseMothmanRad({ name: "X" })).toBeNull();
    expect(parseMothmanRad({ name: "X", oracle: "" })).toBeNull();
    expect(parseMothmanRad({ name: "X", oracle: "Flying" })).toBeNull();
  });
});

describe("applyMothmanRadOnEnter — ETB half", () => {
  it("Mothman entering gives EACH player one rad counter", () => {
    const out = applyMothmanRadOnEnter(st2(), { card: mothmanCard() });
    expect(rad(out, "user")).toBe(1);
    expect(rad(out, "ai")).toBe(1);
  });
  it("a non-Mothman permanent entering is a clean no-op", () => {
    const out = applyMothmanRadOnEnter(st2(), { card: { name: "Bear", type: "Creature — Bear", oracle: "" } });
    expect(rad(out, "user")).toBe(0);
    expect(rad(out, "ai")).toBe(0);
  });
  it("logs the grant with the shared rad atom shape ({ effect: 'rad', who: 'eachPlayer' })", () => {
    const out = applyMothmanRadOnEnter(st2(), { card: mothmanCard() });
    const ev = out.log.find((e) => e.kind === "spell-effect" && e.effect === "rad");
    expect(ev).toMatchObject({ effect: "rad", who: "eachPlayer", amount: 1, source: "The Wise Mothman" });
  });
});

describe("applyMothmanRadOnAttack — attack half", () => {
  it("Mothman attacking gives EACH player one rad counter", () => {
    const out = applyMothmanRadOnAttack(st2({ userBf: [mothmanPerm()], attackers: [atk("moth")] }));
    expect(rad(out, "user")).toBe(1);
    expect(rad(out, "ai")).toBe(1);
  });
  it("a non-Mothman attacker is a no-op", () => {
    const out = applyMothmanRadOnAttack(st2({ userBf: [bear("b1")], attackers: [atk("b1")] }));
    expect(rad(out, "user")).toBe(0);
    expect(rad(out, "ai")).toBe(0);
  });
  it("no attackers → no-op", () => {
    const out = applyMothmanRadOnAttack(st2({ userBf: [mothmanPerm()], attackers: [] }));
    expect(rad(out, "user")).toBe(0);
  });
  it("Mothman sitting back (not in the attacker batch) does NOT fire", () => {
    const out = applyMothmanRadOnAttack(st2({ userBf: [mothmanPerm(), bear("b1")], attackers: [atk("b1")] }));
    expect(rad(out, "user")).toBe(0);
  });
  it("fires once PER attacking source (a clone copy attacking alongside = two grants)", () => {
    const out = applyMothmanRadOnAttack(
      st2({ userBf: [mothmanPerm("m1"), mothmanPerm("m2")], attackers: [atk("m1"), atk("m2")] }),
    );
    expect(rad(out, "user")).toBe(2);
    expect(rad(out, "ai")).toBe(2);
  });
});

describe("'each player' reaches every seat in a 4P FFA pod", () => {
  it("on enter: user + ai1 + ai2 + ai3 each get a rad counter", () => {
    const out = applyMothmanRadOnEnter(st4(), { card: mothmanCard() });
    for (const pid of ["user", "ai1", "ai2", "ai3"]) expect(rad(out, pid)).toBe(1);
  });
  it("on attack (Mothman swings at ai1): all four seats — including the controller and the non-defenders — get rad", () => {
    const out = applyMothmanRadOnAttack(st4({ userBf: [mothmanPerm()], attackers: [atk("moth", "user", "ai1")] }));
    for (const pid of ["user", "ai1", "ai2", "ai3"]) expect(rad(out, pid)).toBe(1);
  });
});

describe("end-to-end through the engine", () => {
  it("ETB: casting/resolving Mothman via enterPermanent puts it on the battlefield AND gives each player rad", () => {
    const s = createGameState({ userDeck: [], aiDeck: [] });
    const out = enterPermanent(s, mothmanCard(), "user");
    expect(out.players.user.battlefield.some((p) => p.card?.name === "The Wise Mothman")).toBe(true);
    expect(rad(out, "user")).toBe(1);
    expect(rad(out, "ai")).toBe(1);
  });
  it("ETB: a normal creature resolving does NOT grant rad (the hook is inert on the shared chokepoint)", () => {
    const s = createGameState({ userDeck: [], aiDeck: [] });
    const out = enterPermanent(s, { id: "c-bear", name: "Grizzly Bears", type: "Creature — Bear", power: 2, toughness: 2, oracle: "" }, "user");
    expect(rad(out, "user")).toBe(0);
    expect(rad(out, "ai")).toBe(0);
  });
  it("attack: runStepActions at declare-blockers grants exactly one rad to each player (compound guard means no double-fire)", () => {
    const out = runStepActions(st2({ userBf: [mothmanPerm()], attackers: [atk("moth")] }));
    expect(rad(out, "user")).toBe(1); // exactly 1: checkAttackTriggers Arbiter-routes the compound trigger, only the hook fires
    expect(rad(out, "ai")).toBe(1);
  });
});

describe("CREED — the rad becomes REAL damage (substrate consumes what Mothman grants)", () => {
  it("after Mothman grants rad, applyRadiation mills + drains the controller (CR 728.1)", () => {
    // Mothman attacks → user gets 1 rad → at the user's precombat main, radiation mills 1 (a nonland) → -1 life, rad removed.
    let s = st2({ userBf: [mothmanPerm()], attackers: [atk("moth")] });
    s = applyMothmanRadOnAttack(s);
    s = { ...s, players: { ...s.players, user: { ...s.players.user, library: [{ id: "spell", name: "Lightning Bolt", type: "Instant" }], life: 40 } } };
    const out = applyRadiation(s, { playerId: "user" });
    expect(out.players.user.life).toBe(39);        // lost 1 for the nonland milled
    expect(rad(out, "user")).toBe(0);              // the rad counter was removed
    expect(out.players.user.graveyard.some((c) => c.id === "spell")).toBe(true); // milled
  });
});

describe("CREED — runtime-only, metric stays honest (no FP flip)", () => {
  it("classifyCard(The Wise Mothman) stays NON-native (clause 3 unmodeled → playability, not a metric over-count)", () => {
    const cls = classifyCard({ name: "The Wise Mothman", type: "Legendary Creature — Insect Mutant", mana: "{1}{B}{G}{U}", oracle: MOTHMAN_ORACLE });
    expect(["native", "native-trigger", "native-body"]).not.toContain(cls);
  });
});

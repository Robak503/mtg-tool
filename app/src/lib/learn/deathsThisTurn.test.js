/**
 * deathsThisTurn.test.js — DEATHS-THIS-TURN COUNT subsystem (CR 700.4).
 *
 * A per-turn, per-controller tally of creatures that DIED (battlefield→graveyard) this turn, incremented at
 * the single creature-death chokepoint (triggers.checkDiesTriggers → gameState.recordCreatureDeaths) and reset
 * for ALL seats at untap (gameState.resetCreatureDeathsAllPlayers). Read by:
 *   - count-source "creaturesDiedThisTurn" (effects/atoms/shared.countForSpec): scope:"all" sums every seat
 *     (Mahadi "for each creature that died this turn"); controller-only reads one seat (Body Count "…under your
 *     control this turn").
 *   - intervening-if "a creature died this turn" / "N or more creatures died this turn" (interveningIf.js).
 *
 * CREED: the count GENUINELY tracks deaths (3 creatures die → 3; resets next turn); an exiled-instead creature
 * (CR 614 replacement) and a non-creature look-back NEVER count; subtype/opponent-scoped death reads stay Arbiter.
 */
import { beforeEach, describe, expect, it } from "vitest";
import {
  _resetIdsForTests, createGameState, createPermanent,
  recordCreatureDeaths, resetCreatureDeathsAllPlayers,
} from "./gameState.js";
import { checkDiesTriggers, checkStepTriggers } from "./triggers.js";
import { runStepActions, flushTriggers, resolveTopOfStack, chooseTriggerTargets } from "./gameEngine.js";
import { countForSpec } from "./effects/atoms/shared.js";
import { parseCountSource } from "./effects/parseHelpers.js";
import { evaluateInterveningIf, interveningIfParseable } from "./interveningIf.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const creatureCard = (name, oracle = "") => ({ id: `c-${name}`, name, type: "Creature — Bear", power: 2, toughness: 2, oracle });
const deadEntry = (controller, id, card, over = {}) => ({ controller, id, name: card?.name || "creature", card, ...over });
function baseState() {
  return createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
}
const treasureCount = (s, pid) => s.players[pid].battlefield.filter((p) => /Treasure/.test(p.card?.type || "")).length;
const resolveAll = (s) => { let g = 0; while ((s.stack || []).length && g++ < 40) s = resolveTopOfStack(s); return s; };
const flush = (s) => resolveAll(flushTriggers(s, { chooseTargets: chooseTriggerTargets }));

// ─── 1. Counter increments at the death chokepoint ──────────────────────────────────
describe("recordCreatureDeaths / checkDiesTriggers — the per-turn tally", () => {
  it("increments the dying creature's controller's tally; multiple deaths sum", () => {
    let s = baseState();
    expect(s.players.user.creaturesDiedThisTurn).toBe(0);
    s = checkDiesTriggers(s, [deadEntry("user", "p1", creatureCard("Bear"))]);
    expect(s.players.user.creaturesDiedThisTurn).toBe(1);
    s = checkDiesTriggers(s, [deadEntry("user", "p2", creatureCard("Wolf")), deadEntry("user", "p3", creatureCard("Cat"))]);
    expect(s.players.user.creaturesDiedThisTurn).toBe(3);
  });

  it("tracks each controller SEPARATELY (per-seat, not global)", () => {
    let s = baseState();
    s = checkDiesTriggers(s, [deadEntry("user", "p1", creatureCard("Bear")), deadEntry("ai1", "p2", creatureCard("Ogre")), deadEntry("ai1", "p3", creatureCard("Imp"))]);
    expect(s.players.user.creaturesDiedThisTurn).toBe(1);
    expect(s.players.ai1.creaturesDiedThisTurn).toBe(2);
    expect(s.players.ai2.creaturesDiedThisTurn).toBe(0);
  });

  it("CREED: an EXILED-INSTEAD creature did NOT die (CR 614) → never counts", () => {
    let s = baseState();
    s = recordCreatureDeaths(s, [deadEntry("user", "p1", creatureCard("Bear"), { exileInstead: true })]);
    expect(s.players.user.creaturesDiedThisTurn).toBe(0);
    // a normal death alongside an exiled-instead one counts only the real death
    s = recordCreatureDeaths(s, [deadEntry("user", "p2", creatureCard("Wolf")), deadEntry("user", "p3", creatureCard("Cat"), { exileInstead: true })]);
    expect(s.players.user.creaturesDiedThisTurn).toBe(1);
  });

  it("CREED: a NON-creature look-back never inflates the creature-death tally", () => {
    let s = baseState();
    const artifact = { id: "c-rock", name: "Rock", type: "Artifact", oracle: "" };
    s = recordCreatureDeaths(s, [deadEntry("user", "p1", artifact)]);
    expect(s.players.user.creaturesDiedThisTurn).toBe(0);
  });

  it("an empty / absent dead set is a no-op", () => {
    const s = baseState();
    expect(recordCreatureDeaths(s, [])).toBe(s);
    expect(recordCreatureDeaths(s, null)).toBe(s);
  });
});

// ─── 2. Reset (all seats, at untap) ─────────────────────────────────────────────────
describe("resetCreatureDeathsAllPlayers — per-turn reset for every seat", () => {
  it("zeroes EVERY player's tally", () => {
    let s = baseState();
    s = checkDiesTriggers(s, [deadEntry("user", "p1", creatureCard("Bear")), deadEntry("ai1", "p2", creatureCard("Ogre"))]);
    expect(s.players.user.creaturesDiedThisTurn).toBe(1);
    expect(s.players.ai1.creaturesDiedThisTurn).toBe(1);
    s = resetCreatureDeathsAllPlayers(s);
    expect(s.players.user.creaturesDiedThisTurn).toBe(0);
    expect(s.players.ai1.creaturesDiedThisTurn).toBe(0);
  });

  it("the untap step resets the counter (deaths don't carry into next turn)", () => {
    let s = baseState();
    s = checkDiesTriggers(s, [deadEntry("user", "p1", creatureCard("Bear"))]);
    expect(s.players.user.creaturesDiedThisTurn).toBe(1);
    // advance to a fresh untap step and run its actions (where the per-turn resets fire)
    s = { ...s, phase: "beginning", step: "untap", activePlayer: "user", priorityHolder: "user" };
    s = runStepActions(s);
    expect(s.players.user.creaturesDiedThisTurn).toBe(0);
  });
});

// ─── 3. count-source resolution (countForSpec) ──────────────────────────────────────
describe("countForSpec — creaturesDiedThisTurn", () => {
  it("scope:'all' SUMS every seat (Mahadi)", () => {
    let s = baseState();
    s = checkDiesTriggers(s, [deadEntry("user", "p1", creatureCard("Bear")), deadEntry("ai1", "p2", creatureCard("Ogre")), deadEntry("ai2", "p3", creatureCard("Imp"))]);
    const spec = parseCountSource("creatures that died this turn");
    expect(spec).toEqual({ kind: "creaturesDiedThisTurn", scope: "all" });
    expect(countForSpec(s, { controller: "user" }, spec)).toBe(3);
    // the all-seats sum is controller-independent
    expect(countForSpec(s, { controller: "ai3" }, spec)).toBe(3);
  });

  it("controller-only reads ONE seat (Body Count 'under your control')", () => {
    let s = baseState();
    s = checkDiesTriggers(s, [deadEntry("user", "p1", creatureCard("Bear")), deadEntry("user", "p2", creatureCard("Wolf")), deadEntry("ai1", "p3", creatureCard("Ogre"))]);
    const spec = parseCountSource("creature that died under your control this turn");
    expect(spec).toEqual({ kind: "creaturesDiedThisTurn" });
    expect(countForSpec(s, { controller: "user" }, spec)).toBe(2); // user's own deaths
    expect(countForSpec(s, { controller: "ai1" }, spec)).toBe(1); // ai1's own deaths
    expect(countForSpec(s, { controller: "ai2" }, spec)).toBe(0);
  });

  it("zero deaths → 0 (a safe no-op, never fabricated)", () => {
    const s = baseState();
    expect(countForSpec(s, { controller: "user" }, { kind: "creaturesDiedThisTurn", scope: "all" })).toBe(0);
    expect(countForSpec(s, { controller: "user" }, { kind: "creaturesDiedThisTurn" })).toBe(0);
  });

  it("CREED: nontoken / subtype / opponent death sources are unmodeled → null", () => {
    expect(parseCountSource("nontoken creatures that died this turn")).toBe(null);
    expect(parseCountSource("Zubera that died this turn")).toBe(null);
    expect(parseCountSource("creatures that died under an opponent's control this turn")).toBe(null);
  });
});

// ─── 4. intervening-if (CR 603.4 turn-event) ────────────────────────────────────────
describe("evaluateInterveningIf — 'a creature died this turn' / 'N or more'", () => {
  function withDeaths(perSeat) {
    let s = baseState();
    const players = { ...s.players };
    for (const [pid, n] of Object.entries(perSeat)) players[pid] = { ...players[pid], creaturesDiedThisTurn: n };
    return { ...s, players };
  }
  it("'a creature died this turn' is the ≥1 case (all seats)", () => {
    expect(evaluateInterveningIf(withDeaths({ user: 0 }), "a creature died this turn", "user")).toBe(false);
    expect(evaluateInterveningIf(withDeaths({ user: 1 }), "a creature died this turn", "user")).toBe(true);
    // a death under an OPPONENT's control still satisfies "a creature died this turn" (unscoped)
    expect(evaluateInterveningIf(withDeaths({ user: 0, ai1: 2 }), "a creature died this turn", "user")).toBe(true);
  });
  it("the cardinal-threshold form compares the all-seats total to N", () => {
    const s = withDeaths({ user: 1, ai1: 1, ai2: 1 }); // total 3
    expect(evaluateInterveningIf(s, "three or more creatures died this turn", "user")).toBe(true);
    expect(evaluateInterveningIf(s, "four or more creatures died this turn", "user")).toBe(false);
    expect(evaluateInterveningIf(s, "five or more creatures died this turn", "user")).toBe(false);
  });
  it("interveningIfParseable: the death conditions are modeled; subtype-scoped stays Arbiter", () => {
    expect(interveningIfParseable("a creature died this turn")).toBe(true);
    expect(interveningIfParseable("three or more creatures died this turn")).toBe(true);
    expect(interveningIfParseable("a Zubera died this turn")).toBe(false);
  });
});

// ─── 5. Classification pins (whole-card-or-park) ────────────────────────────────────
describe("classifyCard — DEATHS-THIS-TURN flips (CREED whole-card)", () => {
  const C = (name, oracle, type = "Creature") => ({ name, oracle, type, keywords: [], mana: "" });
  it("named anchors flip native", () => {
    expect(classifyCard(C("Mahadi, Emporium Master", "At the beginning of your end step, create a Treasure token for each creature that died this turn. (It's an artifact with \"{T}, Sacrifice this token: Add one mana of any color.\")", "Legendary Creature — Devil"))).toBe("native-trigger");
    expect(classifyCard(C("Body Count", "Spectacle {B} (You may cast this spell for its spectacle cost rather than its mana cost if an opponent lost life this turn.)\nDraw a card for each creature that died under your control this turn.", "Instant"))).toBe("native-spell");
    expect(classifyCard(C("Twinblade Assassins", "At the beginning of your end step, if a creature died this turn, draw a card.", "Creature — Elf Assassin"))).toBe("native-trigger");
  });
  it("CREED: unmodeled siblings stay non-native", () => {
    // X/X token sizing by the death count is a SEPARATE (token-P/T) mechanic — stays Arbiter
    expect(classifyCard(C("Spoils of Blood", "Create an X/X black Horror creature token, where X is the number of creatures that died this turn.", "Instant"))).not.toMatch(/^native/);
    // subtype-scoped death stays Arbiter (CREED — never a mis-scoped count)
    expect(classifyCard(C("Zubera Event", "When this creature enters, if a Zubera died this turn, draw a card."))).not.toMatch(/^native/);
    // a NON-death turn event: "you gained life this turn" is now modeled (LG-1), but the COMPOUND
    // "you gained and lost life this turn" (Lunar Convocation #2) is still unmodeled → stays non-native
    expect(classifyCard(C("Gain-and-Lost Event", "When this creature enters, if you gained and lost life this turn, draw a card."))).not.toMatch(/^native/);
  });
});

// ─── 6. End-to-end runtime (Mahadi) ─────────────────────────────────────────────────
describe("end-to-end — Mahadi reads the live deaths tally at end step", () => {
  const mahadi = (id) => createPermanent({
    id, controller: "user", summoningSick: false,
    card: { id: `c-${id}`, name: "Mahadi, Emporium Master", type: "Legendary Creature — Devil", power: 1, toughness: 4,
      oracle: "At the beginning of your end step, create a Treasure token for each creature that died this turn. (It's an artifact with \"{T}, Sacrifice this token: Add one mana of any color.\")" },
  });
  function withMahadi() {
    let s = baseState();
    s = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [mahadi("m1")] } } };
    return { ...s, turn: 3, activePlayer: "user", priorityHolder: "user", phase: "ending", step: "end", stack: [], pendingTriggers: [] };
  }

  it("3 creatures died (across seats) → 3 Treasures at end step", () => {
    let s = withMahadi();
    s = checkDiesTriggers(s, [deadEntry("user", "d1", creatureCard("Bear")), deadEntry("ai1", "d2", creatureCard("Ogre")), deadEntry("ai2", "d3", creatureCard("Imp"))]);
    expect(treasureCount(s, "user")).toBe(0);
    s = checkStepTriggers(s, "endStep");
    s = flush(s);
    expect(treasureCount(s, "user")).toBe(3);
  });

  it("no creature died → no Treasures (count is a real 0, not fabricated)", () => {
    let s = withMahadi();
    s = checkStepTriggers(s, "endStep");
    s = flush(s);
    expect(treasureCount(s, "user")).toBe(0);
  });
});

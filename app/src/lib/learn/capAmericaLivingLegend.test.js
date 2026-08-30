/**
 * capAmericaLivingLegend.test.js — the BECOMES-TAPPED WATCHER, your-turn-gated, with the
 * per-CREATURE first-tap latch (SHELF CAP1 — Captain America, Living Legend).
 *
 * "Whenever a creature you control becomes tapped during your turn, if it's the first time that
 * creature has become tapped this turn, untap it." Seams:
 *   1. detection — the ONE admitted watcher form (classifyCondition, placed above the blanket
 *      `during` reject); the intervening-if is consumed at detection into
 *      descriptor.firstTapOfThatCreatureThisTurn (NEVER the fail-open interveningIf slot).
 *   2. gameState.tapPermanent / regeneratePermanent stamp firstThisTurn on the tap event off the
 *      per-permanent becameTappedThisTurn flag (Kira's becameTargetThisTurn pattern; reset at untap).
 *   3. triggers.checkTapTriggers — the watcher board-pass fires scoped descriptors; the latch gate
 *      drops a non-first tap BEFORE a pending trigger exists. The self pass is scope-filtered to
 *      exactly complement it (no double-fire).
 *   4. the payoff rides the Amulet "untap the triggering permanent" sentinel → the tapped creature.
 * CREED FP = a fire on a second same-turn tap of the SAME creature, a fire on an opponent's turn or
 * an opponent's creature, or an untap of the wrong permanent.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent, tapPermanent, findPermanent, resetBecameTappedThisTurnAllPlayers } from "./gameState.js";
import { detectTriggers } from "./triggers.js";
import { triggerRoutesNatively } from "./triggerRouting.js";
import { flushTriggers, resolveTopOfStack } from "./gameEngine.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

// Real oracle text (bundled Scryfall data — never from memory).
const cap = (id = "cap") => ({ id, name: "Captain America, Living Legend", type: "Legendary Creature — Human Soldier Hero", mana: "{1}{W}{U}", power: "3", toughness: "3", oracle: "Vigilance\nWhenever a creature you control becomes tapped during your turn, if it's the first time that creature has become tapped this turn, untap it." });
const bear = (id = "bear") => ({ id, name: "Grizzly Bears", type: "Creature — Bear", mana: "{1}{G}", power: "2", toughness: "2", oracle: "" });

function baseState(over = {}) {
  const s = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
  return { ...s, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main", ...over };
}
function withField(s, pid, perms) {
  return { ...s, players: { ...s.players, [pid]: { ...s.players[pid], battlefield: perms } } };
}
function resolveAll(state) {
  let s = flushTriggers(state, {});
  let guard = 0;
  while ((s.stack || []).length && guard++ < 30) s = resolveTopOfStack(s);
  return s;
}

describe("detection + classify", () => {
  it("detects the watcher form with the consumed intervening-if as the per-creature latch flag", () => {
    const [d] = detectTriggers(cap()).filter((t) => t.event === "becomesTapped");
    expect(d).toMatchObject({
      event: "becomesTapped", scope: "creatureYouControl", whose: "yours",
      firstTapOfThatCreatureThisTurn: true, effectClause: "untap the triggering permanent",
    });
    // The if was CONSUMED, never left for the fail-open runtime evaluator.
    expect(d.interveningIf).toBeNull();
    expect(triggerRoutesNatively(d)).toBe(true);
    expect(classifyCard(cap())).toBe("native-trigger");
  });

  it("FN — the general un-gated watcher ('becomes tapped' without 'during your turn') stays undetected", () => {
    const general = { id: "g", name: "General Watcher", type: "Creature — Human", power: "1", toughness: "1", oracle: "Whenever a creature you control becomes tapped, draw a card." };
    expect(detectTriggers(general).some((d) => d.event === "becomesTapped")).toBe(false);
    expect(classifyCard(general)).toBe("body-only");
  });

  it("FN — a DIFFERENT intervening-if on the same event wording stays parked (the consume is anchored)", () => {
    // "second time" — NOT the consumed wording, and outside the strict interveningIf vocabulary.
    const variant = { id: "v", name: "Variant Watcher", type: "Creature — Human", power: "1", toughness: "1", oracle: "Whenever a creature you control becomes tapped during your turn, if it's the second time that creature has become tapped this turn, untap it." };
    // The condition arm matches, but the unconsumed if lands in interveningIf → outside the strict
    // vocabulary → triggerRoutesNatively refuses → parked. Never a native claim on a fail-open condition.
    const ds = detectTriggers(variant).filter((d) => d.event === "becomesTapped");
    if (ds.length) expect(triggerRoutesNatively(ds[0])).toBe(false);
    expect(classifyCard(variant)).toBe("body-only");
  });
});

describe("the tap-event firstThisTurn stamp (gameState)", () => {
  it("first tap stamps firstThisTurn:true; a second tap of the SAME creature stamps false", () => {
    let s = withField(baseState(), "user", [createPermanent({ id: "bear", card: bear(), controller: "user" })]);
    s = tapPermanent(s, "bear");
    expect(s.pendingTapEvents[0]).toMatchObject({ id: "bear", firstThisTurn: true });
    // Drain the queue the way the engine does, untap the creature manually (no untap step — same turn).
    s = { ...s, pendingTapEvents: [] };
    s = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: s.players.user.battlefield.map((p) => p.id === "bear" ? { ...p, tapped: false } : p) } } };
    s = tapPermanent(s, "bear");
    expect(s.pendingTapEvents[0]).toMatchObject({ id: "bear", firstThisTurn: false });
  });

  it("the untap-step reset clears the flag so next turn is a fresh first", () => {
    let s = withField(baseState(), "user", [createPermanent({ id: "bear", card: bear(), controller: "user" })]);
    s = tapPermanent(s, "bear");
    s = { ...s, pendingTapEvents: [] };
    s = resetBecameTappedThisTurnAllPlayers(s);
    s = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: s.players.user.battlefield.map((p) => p.id === "bear" ? { ...p, tapped: false } : p) } } };
    s = tapPermanent(s, "bear");
    expect(s.pendingTapEvents[0]).toMatchObject({ id: "bear", firstThisTurn: true });
  });
});

describe("runtime — the watcher fires, latches, and gates (the board is the witness)", () => {
  it("first tap on your turn → the trigger fires and UNTAPS the tapped creature", () => {
    let s = withField(baseState(), "user", [
      createPermanent({ id: "cap", card: cap(), controller: "user" }),
      createPermanent({ id: "bear", card: bear(), controller: "user" }),
    ]);
    s = tapPermanent(s, "bear");
    expect(findPermanent(s, "bear").permanent.tapped).toBe(true);
    s = resolveAll(s);
    expect(findPermanent(s, "bear").permanent.tapped).toBe(false); // untapped by the trigger
  });

  it("a SECOND same-turn tap of the same creature → no fire, stays tapped (the per-creature latch)", () => {
    let s = withField(baseState(), "user", [
      createPermanent({ id: "cap", card: cap(), controller: "user" }),
      createPermanent({ id: "bear", card: bear(), controller: "user" }),
    ]);
    s = resolveAll(tapPermanent(s, "bear"));
    expect(findPermanent(s, "bear").permanent.tapped).toBe(false); // fired once, untapped
    s = resolveAll(tapPermanent(s, "bear"));
    expect(findPermanent(s, "bear").permanent.tapped).toBe(true);  // second tap: latch holds, no untap
  });

  it("the latch is PER CREATURE — a different creature's first tap still fires the same turn", () => {
    let s = withField(baseState(), "user", [
      createPermanent({ id: "cap", card: cap(), controller: "user" }),
      createPermanent({ id: "bear", card: bear("bear"), controller: "user" }),
      createPermanent({ id: "bear2", card: bear("bear2"), controller: "user" }),
    ]);
    s = resolveAll(tapPermanent(s, "bear"));
    s = resolveAll(tapPermanent(s, "bear2"));
    expect(findPermanent(s, "bear").permanent.tapped).toBe(false);
    expect(findPermanent(s, "bear2").permanent.tapped).toBe(false); // both got their own first-time fire
  });

  it("FP guard — an OPPONENT'S turn: no fire, the creature stays tapped (whose:'yours')", () => {
    let s = withField(baseState({ activePlayer: "ai1" }), "user", [
      createPermanent({ id: "cap", card: cap(), controller: "user" }),
      createPermanent({ id: "bear", card: bear(), controller: "user" }),
    ]);
    s = resolveAll(tapPermanent(s, "bear"));
    expect(findPermanent(s, "bear").permanent.tapped).toBe(true);
  });

  it("FP guard — an OPPONENT'S creature tapping on your turn: no fire (creatureYouControl scope)", () => {
    let s = withField(baseState(), "user", [createPermanent({ id: "cap", card: cap(), controller: "user" })]);
    s = withField(s, "ai1", [createPermanent({ id: "obear", card: bear("obear"), controller: "ai1" })]);
    s = resolveAll(tapPermanent(s, "obear"));
    expect(findPermanent(s, "obear").permanent.tapped).toBe(true);
  });

  it("Cap's OWN tap fires it too ('a creature you control' includes himself) — exactly once", () => {
    let s = withField(baseState(), "user", [createPermanent({ id: "cap", card: cap(), controller: "user" })]);
    s = resolveAll(tapPermanent(s, "cap"));
    expect(findPermanent(s, "cap").permanent.tapped).toBe(false); // his own first tap untaps him
  });
});

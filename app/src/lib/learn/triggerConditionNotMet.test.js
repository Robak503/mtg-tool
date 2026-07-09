/**
 * triggerConditionNotMet.test.js — a CR 603.4 intervening-if condition-not-met removal is logged DISTINCTLY as
 * `trigger-condition-not-met`, NOT mislabeled `trigger-removed-no-target` (CR 603.3c). Omnath's self-play
 * breakage report was conflating the two: Garruk's Uprising (307×) + Inventors' Fair (194×) etc. are ALL correct
 * condition-skips (e.g. Garruk's ETB "if you control a creature with power 4+, draw a card" cast before a power-4
 * creature is out), not no-legal-target fizzles. The trigger BEHAVIOR is unchanged (the ability correctly never
 * goes on the stack when the condition is false); only the log kind is corrected so breakage attribution is honest.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { enterPermanent } from "./resolvers.js";
import { flushTriggers } from "./gameEngine.js";
import { _resetIdsForTests, createGameState } from "./gameState.js";

beforeEach(() => _resetIdsForTests());
const stateWith = (over = {}) => {
  const b = createGameState({ userDeck: [], aiDeck: [] });
  return { ...b, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main", ...over };
};
const withLib = (s, cards, p = "user") => ({ ...s, players: { ...s.players, [p]: { ...s.players[p], library: cards } } });
// A 2/2 with Garruk's-Uprising-style ETB intervening-if. As a 2/2 it does NOT satisfy its own condition.
const garruksLike = (id = "card-g") => ({ id, name: "Uprising", type: "Creature — Beast", power: 2, toughness: 2, oracle: "When Uprising enters, if you control a creature with power 4 or greater, draw a card." });
const bigDude = { id: "card-big", name: "BigDude", type: "Creature — Beast", power: 5, toughness: 5, oracle: "" };

describe("CR 603.4 intervening-if condition-not-met → trigger-condition-not-met (not no-target)", () => {
  it("condition FALSE → logs trigger-condition-not-met, NOT trigger-removed-no-target; the draw correctly does NOT fire", () => {
    let s = withLib(stateWith(), [{ id: "lib1", name: "Card" }]);
    s = enterPermanent(s, garruksLike(), "user"); // no power-4 creature out → condition false
    s = flushTriggers(s, {});
    expect(s.log.some((e) => e.kind === "trigger-condition-not-met" && e.source === "Uprising")).toBe(true);
    expect(s.log.some((e) => e.kind === "trigger-removed-no-target")).toBe(false); // the mislabel is gone
    expect(s.stack.some((o) => o.kind === "triggered-ability")).toBe(false);        // nothing on the stack
    expect((s.players.user.hand || []).length).toBe(0);                             // draw correctly skipped
  });
  it("condition TRUE (a power-4 creature present) → the trigger goes on the stack, NO condition-not-met log", () => {
    let s = withLib(stateWith(), [{ id: "lib1", name: "Card" }]);
    s = enterPermanent(s, bigDude, "user");        // a 5/5 is out
    s = enterPermanent(s, garruksLike(), "user");  // condition now met
    s = flushTriggers(s, {});
    expect(s.log.some((e) => e.kind === "trigger-condition-not-met")).toBe(false);
    expect(s.stack.some((o) => o.kind === "triggered-ability")).toBe(true);         // the draw is on the stack
  });
  it("a GENUINE no-legal-target removal still logs trigger-removed-no-target (unchanged, CR 603.3c)", () => {
    // A targeted ETB with no opponent creature → dropped as no-target (this path is untouched by the relabel).
    const hunter = { id: "card-hu", name: "Hunter", type: "Creature — Beast", power: 2, toughness: 2, oracle: "When Hunter enters, destroy target creature an opponent controls." };
    let s = stateWith();
    s = enterPermanent(s, hunter, "user"); // no opponent creatures
    s = flushTriggers(s, {});
    expect(s.log.some((e) => e.kind === "trigger-removed-no-target")).toBe(true);
    expect(s.log.some((e) => e.kind === "trigger-condition-not-met")).toBe(false);
  });
});

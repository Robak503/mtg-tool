/**
 * POWER-THRESHOLD ETB trigger (Dex, real-deck lane) — "Whenever a creature you control with power N or
 * greater enters, <effect>" (Elemental Bond, Garruk's Uprising, Temur Ascendancy — Colton's green decks).
 *
 * The "with power N or greater" restriction is SCOPE-EXPRESSIBLE (the entering creature's layer-resolved
 * power ≥ N, checked at ETB), so it's carved out before the generic unmodeled-"with" reject. scopeMatches
 * reads creaturePower(perm, state) — state is threaded through for this scope. "a creature" → creature-only,
 * so no land-entry concern. Corpus flip-diff: +5 native (Elemental Bond, Godtracker, Kronch Wrangler,
 * Territorial Boar, Where Ancients Tread), 0 regressions; anthem-carrying cards (Garruk's Uprising) stay
 * body-only but the trigger fires in-game (metric ≠ playability).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { detectTriggers } from "./triggers.js";
import { enterPermanent } from "./resolvers.js";
import { flushTriggers, resolveTopOfStack, chooseTriggerTargets } from "./gameEngine.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const trig = (oracle) => detectTriggers({ name: "X", type: "Enchantment", oracle, mana: "{2}{G}" });
const C = (type, oracle) => ({ type, oracle, mana: "{2}{G}", name: "X", power: "2", toughness: "2" });

describe("POWER-THRESHOLD ETB — detection + classification", () => {
  it("detects 'a creature you control with power N or greater enters' as creatureYouControlPower + threshold", () => {
    expect(trig("Whenever a creature you control with power 3 or greater enters, draw a card.")[0])
      .toMatchObject({ event: "etb", scope: "creatureYouControlPower", powerThreshold: 3 });
    expect(trig("Whenever a creature you control with power 5 or greater enters, draw a card.")[0])
      .toMatchObject({ powerThreshold: 5 });
  });

  it("Elemental Bond (power 3 → draw) flips native-trigger", () => {
    expect(classifyCard(C("Enchantment", "Whenever a creature you control with power 3 or greater enters, draw a card."))).toBe("native-trigger");
  });

  it("CREED: an unmodeled 'with' restriction ('with a +1/+1 counter on it') stays undetected → not native", () => {
    expect(trig("Whenever a creature you control with a +1/+1 counter on it enters, draw a card.")).toHaveLength(0);
  });
});

describe("POWER-THRESHOLD ETB — engine-first: the power gate fires correctly", () => {
  function stateWith(watcherOracle, library) {
    const s = createGameState({ userDeck: [], aiDeck: [] });
    const watcher = createPermanent({ id: "bond", card: { id: "c-bond", name: "Elemental Bond", type: "Enchantment", oracle: watcherOracle }, controller: "user" });
    return {
      ...s, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main",
      players: { ...s.players, user: { ...s.players.user, battlefield: [watcher], library } },
    };
  }
  const POWER3_DRAW = "Whenever a creature you control with power 3 or greater enters, draw a card.";
  const bigCreature = { id: "big", name: "Big", type: "Creature — Beast", power: 4, toughness: 4, oracle: "" };
  const smallCreature = { id: "small", name: "Small", type: "Creature — Bird", power: 2, toughness: 2, oracle: "" };

  it("a power-4 creature entering FIRES the power-3 trigger → draw resolves", () => {
    let s = stateWith(POWER3_DRAW, [{ id: "lib1", name: "Drawn", type: "Instant", oracle: "" }]);
    s = enterPermanent(s, bigCreature, "user");
    s = flushTriggers(s, { chooseTargets: chooseTriggerTargets });
    let g = 0; while ((s.stack || []).length && g++ < 20) s = resolveTopOfStack(s);
    expect(s.players.user.hand.some((c) => c.id === "lib1")).toBe(true); // power 4 ≥ 3 → fired + drew
  });

  it("a power-2 creature entering does NOT fire the power-3 trigger (gate holds)", () => {
    let s = stateWith(POWER3_DRAW, [{ id: "lib1", name: "Drawn", type: "Instant", oracle: "" }]);
    s = enterPermanent(s, smallCreature, "user");
    s = flushTriggers(s, { chooseTargets: chooseTriggerTargets });
    let g = 0; while ((s.stack || []).length && g++ < 20) s = resolveTopOfStack(s);
    expect(s.players.user.hand.some((c) => c.id === "lib1")).toBe(false); // power 2 < 3 → no fire, no draw
  });

  it("an opponent's big creature does NOT fire (you-control gate)", () => {
    let s = stateWith(POWER3_DRAW, [{ id: "lib1", name: "Drawn", type: "Instant", oracle: "" }]);
    s = enterPermanent(s, bigCreature, "ai"); // opponent's creature
    s = flushTriggers(s, { chooseTargets: chooseTriggerTargets });
    let g = 0; while ((s.stack || []).length && g++ < 20) s = resolveTopOfStack(s);
    expect(s.players.user.hand.some((c) => c.id === "lib1")).toBe(false);
  });
});

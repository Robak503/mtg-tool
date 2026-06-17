/**
 * Controller-scoped etb/dies triggers (#8b) — "a creature you control" / "an opponent controls" /
 * "another creature you control" conditions, modeled with scopes scopeMatches ENFORCES (controller
 * relative to the source), recovering the restricted-condition triggers the self-reference slice
 * deferred to a safe no-op. The key correctness property: the trigger fires ONLY on the right set,
 * never over-firing (the medium false-positive the self-ref review caught).
 */

import { describe, it, expect, beforeEach } from "vitest";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { resolveTopOfStack, flushTriggers } from "./gameEngine.js";
import { checkDiesTriggers } from "./triggers.js";
import { enterPermanent } from "./resolvers.js";
import { permanentPower, permanentToughness } from "./layers.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const creature = (name, p, t, oracle = "") => ({ name, type: "Creature — Beast", power: p, toughness: t, oracle });
const deadLookBack = (id, controller) => ({ id, controller, name: "Dead", card: creature("Dead", 1, 1) });

function board({ user = [], ai = [] }) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...s, phase: "main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
    players: { ...s.players, user: { ...s.players.user, battlefield: user }, ai: { ...s.players.ai, battlefield: ai } },
  };
}
const resolveAll = (s) => { while (s.stack.length) s = resolveTopOfStack(s); return s; };

describe("dies scope enforcement — 'a creature you control' vs 'an opponent controls'", () => {
  const MALAKIR = creature("Malakir Cullblade", 1, 1, "Whenever a creature an opponent controls dies, put a +1/+1 counter on this creature.");
  const ARISTOCRAT = creature("Aristocrat", 1, 1, "Whenever a creature you control dies, this creature gets +1/+1 until end of turn.");

  it("'an opponent controls' fires on an OPPONENT death, NOT on the controller's own", () => {
    let s = board({ user: [createPermanent({ id: "m", card: MALAKIR, controller: "user", summoningSick: false })] });
    // An opponent's creature dies → Malakir grows.
    s = resolveAll(flushTriggers(checkDiesTriggers(s, [deadLookBack("enemy", "ai")])));
    expect([permanentPower(s, "m"), permanentToughness(s, "m")]).toEqual([2, 2]);
    // The controller's OWN creature dies → Malakir does NOT grow (no over-fire).
    s = resolveAll(flushTriggers(checkDiesTriggers(s, [deadLookBack("mine", "user")])));
    expect([permanentPower(s, "m"), permanentToughness(s, "m")]).toEqual([2, 2]);
  });

  it("'a creature you control' fires on the controller's own death, NOT an opponent's", () => {
    let s = board({ user: [createPermanent({ id: "a", card: ARISTOCRAT, controller: "user", summoningSick: false })] });
    s = resolveAll(flushTriggers(checkDiesTriggers(s, [deadLookBack("mine", "user")])));
    expect(permanentPower(s, "a")).toBe(2); // own death → +1/+1
    s = resolveAll(flushTriggers(checkDiesTriggers(s, [deadLookBack("enemy", "ai")])));
    expect(permanentPower(s, "a")).toBe(2); // opponent death → no further pump
  });
});

describe("etb scope enforcement — 'another creature you control enters'", () => {
  const SQUIRE = creature("Skyknight Squire", 1, 1, "Whenever another creature you control enters, put a +1/+1 counter on this creature.");

  it("fires when ANOTHER of the controller's creatures enters; not the source itself, not an opponent's", () => {
    let s = board({ user: [createPermanent({ id: "sq", card: SQUIRE, controller: "user", summoningSick: false })] });
    // Another creature the user controls enters → Squire grows.
    s = resolveAll(flushTriggers(enterPermanent(s, creature("Buddy", 2, 2), "user")));
    expect([permanentPower(s, "sq"), permanentToughness(s, "sq")]).toEqual([2, 2]);
    // An OPPONENT's creature enters → Squire does NOT grow.
    s = resolveAll(flushTriggers(enterPermanent(s, creature("Enemy", 2, 2), "ai")));
    expect([permanentPower(s, "sq"), permanentToughness(s, "sq")]).toEqual([2, 2]);
  });
});

describe("coverage — controller-scoped triggers with a modeled effect are native-trigger", () => {
  it("you-control / opponent-controls dies+etb triggers classify native", () => {
    // Names chosen NOT to be substrings of their oracle (else the self-reference name check fires).
    expect(classifyCard({ type: "Creature — Beast", name: "Zulgo", oracle: "Whenever a creature you control dies, you draw a card." })).toBe("native-trigger");
    expect(classifyCard({ type: "Creature — Beast", name: "Zulgo", oracle: "Whenever a creature an opponent controls dies, put a +1/+1 counter on this creature." })).toBe("native-trigger");
    // A keyword-filtered condition we still can't enforce stays body-only (safe).
    expect(classifyCard({ type: "Creature — Beast", name: "Zulgo", oracle: "Whenever a creature with flying dies, you draw a card." })).toBe("body-only");
  });
});

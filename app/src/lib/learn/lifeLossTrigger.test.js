/**
 * lifeLossTrigger.test.js — LIFE-LOSS-ON-EVENT (SHELF M3, Mindcrank).
 *
 * "Whenever an opponent loses life, that player mills that many cards." The event fires from the
 * loseLife chokepoint itself (gameState's registered watcher → checkLifeLossTriggers), so DAMAGE-
 * caused loss (CR 119.3) fires it too. The payoff clause maps to {op:mill, who:lifeLostPlayer,
 * countContext:lifeLostAmount}; the referent gates keep it native ONLY on the lifeLost event.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { detectTriggers } from "./triggers.js";
import { triggerRoutesNatively } from "./triggerRouting.js";
import { flushTriggers, resolveTopOfStack } from "./gameEngine.js";
import { createGameState, createPermanent, loseLife, _resetIdsForTests } from "./gameState.js";
import { classifyCard } from "./coverage.js";
import { parseEffectClause } from "./effects/parser.js";

beforeEach(() => _resetIdsForTests());

const MINDCRANK = {
  name: "Mindcrank", type: "Artifact", mana: "{2}",
  oracle: "Whenever an opponent loses life, that player mills that many cards.",
};
const resolveAll = (s) => { while (s.stack.length) s = resolveTopOfStack(s); return s; };
const lib = (n) => Array.from({ length: n }, (_, i) => ({ id: "c" + i, name: "C" + i, type: "Instant" }));

describe("detection + routing", () => {
  it("detects the lifeLost event (whose:opponent) and the payoff routes natively", () => {
    const d = detectTriggers(MINDCRANK).find((x) => x.event === "lifeLost");
    expect(d).toMatchObject({ event: "lifeLost", whose: "opponent" });
    expect(triggerRoutesNatively(d)).toBe(true);
    expect(classifyCard(MINDCRANK)).toBe("native-trigger");
  });

  it("CREED — a qualified variant ('loses life for the first time') stays undetected → Arbiter", () => {
    const d = detectTriggers({ ...MINDCRANK, oracle: "Whenever an opponent loses life for the first time each turn, that player mills that many cards." });
    expect(d.find((x) => x.event === "lifeLost")).toBeUndefined();
  });

  it("CREED — the payoff on a NON-lifeLost event fails the referent gate (never a silent drop)", () => {
    const p = parseEffectClause("that player mills that many cards", "Instant");
    expect(p.atoms[0]).toMatchObject({ op: "mill", who: "lifeLostPlayer", countContext: "lifeLostAmount" });
    expect(triggerRoutesNatively({ event: "combatDamageToPlayer", effectClause: "that player mills that many cards" })).toBe(false);
  });
});

describe("runtime — the loseLife chokepoint fires the watcher", () => {
  it("an opponent's life loss mills them that many; the controller's own loss does not fire", () => {
    const s0 = createGameState({ userDeck: [], aiDeck: [] });
    const crank = createPermanent({ id: "crank", card: MINDCRANK, controller: "user" });
    let s = {
      ...s0,
      players: {
        ...s0.players,
        user: { ...s0.players.user, battlefield: [crank], library: lib(10) },
        ai: { ...s0.players.ai, library: lib(10) },
      },
    };
    // The AI (an opponent of the crank's controller) loses 3 → trigger → mills 3.
    s = resolveAll(flushTriggers(loseLife(s, { playerId: "ai", amount: 3 })));
    expect(s.players.ai.graveyard).toHaveLength(3);
    // The controller's own life loss does NOT fire it (whose:"opponent").
    s = resolveAll(flushTriggers(loseLife(s, { playerId: "user", amount: 2 })));
    expect(s.players.user.graveyard).toHaveLength(0);
  });
});

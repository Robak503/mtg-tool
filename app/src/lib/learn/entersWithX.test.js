/**
 * entersWithX.test.js — ENTERS-WITH-X (hydras). "This creature enters with X +1/+1 counters on it",
 * where X is the value paid for its {X} cost. The parser predicate + the end-to-end cast→resolve flow
 * (legalChoices offers the X choice → dispatcher threads xValue → PERMANENT_ETB adds X counters), so a
 * hydra enters at its real P/T instead of a 0/0 that dies to the lethal-toughness SBA.
 */
import { describe, it, expect } from "vitest";
import { entersWithXCounters } from "./staticAbilityParser.js";
import { createGameState, _resetIdsForTests } from "./gameState.js";
import { permanentPower, permanentToughness } from "./layers.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";

describe("entersWithXCounters (parser predicate)", () => {
  it("matches the literal-X hydra form", () => {
    expect(entersWithXCounters({ oracle: "This creature enters with X +1/+1 counters on it." })).toBe(true);
    expect(entersWithXCounters({ oracle: "Trample\nThis creature enters with X +1/+1 counters on it.\nWhen this creature dies, you gain life." })).toBe(true);
    expect(entersWithXCounters({ oracle: "This permanent enters with X +1/+1 counters on it." })).toBe(true);
  });
  it("rejects a literal-N or 'for each' magnitude (not the cast X)", () => {
    expect(entersWithXCounters({ oracle: "This creature enters with four +1/+1 counters on it." })).toBe(false);
    expect(entersWithXCounters({ oracle: "This creature enters with a +1/+1 counter on it for each creature you control." })).toBe(false);
    expect(entersWithXCounters({ oracle: "Flying" })).toBe(false);
    expect(entersWithXCounters({})).toBe(false);
  });
  it("rejects a 'where X is <board count>' magnitude — NOT the cast {X} (Stag Beetle / Voracious Wurm)", () => {
    // These have NO {X} pip; their X is a board/state count the engine can't compute → must stay body-only,
    // never claimed native with the magnitude dropped (the CREED false positive the review caught).
    expect(entersWithXCounters({ oracle: "Stag Beetle enters with X +1/+1 counters on it, where X is the number of other creatures on the battlefield." })).toBe(false);
    expect(entersWithXCounters({ oracle: "Voracious Wurm enters with X +1/+1 counters on it, where X is the amount of life you gained this turn." })).toBe(false);
  });
});

describe("ENTERS-WITH-X — end-to-end cast→resolve", () => {
  const setup = (hydra) => {
    _resetIdsForTests();
    let s = createGameState({ userDeck: [], aiDeck: [] });
    return {
      ...s,
      phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
      players: {
        ...s.players,
        user: { ...s.players.user, hand: [hydra], manaPool: { ...s.players.user.manaPool, G: 2, C: 8 } },
      },
    };
  };
  const hydra = { id: "hyd", name: "Hungering Hydra", type: "Creature — Hydra", mana: "{X}{G}", power: 0, toughness: 0,
    oracle: "This creature enters with X +1/+1 counters on it." };

  it("offers an X choice for the hydra (X≥1, never X=0)", () => {
    const s = setup(hydra);
    const casts = legalActionsForPlayer(s, "user").filter((a) => a.kind === "cast-spell" && a.cardId === "hyd");
    const xs = casts.map((c) => c.xValue).sort((a, b) => a - b);
    expect(xs.length).toBeGreaterThan(0);
    expect(Math.min(...xs)).toBe(1);          // X=0 (a 0/0 that dies) is never surfaced
    expect(xs).toContain(5);                  // affordable up to the pool
  });

  it("a hydra cast for X=5 enters with 5 +1/+1 counters — a real 5/5, not a 0/0", () => {
    let s = setup(hydra);
    const cast = legalActionsForPlayer(s, "user").find((a) => a.kind === "cast-spell" && a.cardId === "hyd" && a.xValue === 5);
    expect(cast).toBeTruthy();
    s = dispatchAction(s, cast);              // hydra → stack (X=5 baked in)
    s = resolveTopOfStack(s);                 // resolves → PERMANENT_ETB → enters with counters
    const perm = s.players.user.battlefield.find((p) => p.card.name === "Hungering Hydra");
    expect(perm).toBeTruthy();                // it actually entered (didn't fizzle)
    expect(perm.counters["+1/+1"]).toBe(5);
    expect(permanentPower(s, perm.id)).toBe(5);
    expect(permanentToughness(s, perm.id)).toBe(5); // survives the SBA (was 0/0 before this slice)
  });
});

/**
 * IT-COUNTER — a SELF-scope trigger that puts a +1/+1 (or -1/-1) counter on its own source via the
 * pronoun "it" ("Whenever this creature attacks, put a +1/+1 counter on it") now routes natively. The
 * self-counter atom keys off "…on this creature" (target:"self"); detectTriggers normalizes the
 * leading-context "it" → "this creature" for SELF-scope triggers only (the same gate + whole-clause
 * anchor as the existing self-PUMP "it" rewrite), so a non-self "it" or a rider stays LOW → Arbiter.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { checkAttackTriggers } from "./triggers.js";
import { flushTriggers, resolveTopOfStack, chooseTriggerTargets } from "./gameEngine.js";
import { _resetIdsForTests, createGameState, createPermanent, creaturePower, findPermanent } from "./gameState.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const ATTACK_COUNTER = "Whenever this creature attacks, put a +1/+1 counter on it.";

describe("IT-COUNTER — classification", () => {
  it("a SELF-scope 'put a +1/+1 counter on it' flips native-trigger", () => {
    expect(classifyCard({ type: "Creature — Beast", name: "Grower", oracle: ATTACK_COUNTER })).toBe("native-trigger");
    expect(classifyCard({ type: "Creature — Beast", name: "Two", oracle: "Whenever this creature attacks, put two +1/+1 counters on it." })).toBe("native-trigger");
    expect(classifyCard({ type: "Creature — Zombie", name: "Dier", oracle: "When this creature dies, put a +1/+1 counter on it." })).toBe("native-trigger");
  });
  it("a NON-self 'it' counter trigger flips native (WAVE-3b COUNTERS-ON-EVENT); a rider still stays body-only", () => {
    // "a creature you control" is NOT self-scope, so "it" is the TRIGGERING creature. WAVE-3b COUNTERS-ON-EVENT
    // now models this: detectTriggers rewrites "on it" → the "on the triggering creature" sentinel and the
    // counterClauses parser emits an add-counter atom (routed through gameState.addCounter, doubler-aware).
    // The WHOLE card is just this one trigger → native-trigger (the slice's intended flip, Sphere Grid family).
    expect(classifyCard({ type: "Creature — Lord", name: "Captain", oracle: "Whenever a creature you control attacks, put a +1/+1 counter on it." })).toBe("native-trigger");
    // …but a RIDER past "on it" breaks the whole-clause anchor → no rewrite → the rider is unmodeled → the
    // whole card stays body-only (no partial flip — CREED).
    expect(classifyCard({ type: "Creature — Beast", name: "Rider", oracle: "Whenever this creature attacks, put a +1/+1 counter on it. Draw a card." })).toBe("body-only");
  });
});

describe("IT-COUNTER — engine-first: the counter lands on the source", () => {
  it("an attacking creature's trigger puts a +1/+1 counter on ITSELF", () => {
    const beast = createPermanent({ id: "b", card: { id: "cb", name: "Grower", type: "Creature — Beast", power: 2, toughness: 2, oracle: ATTACK_COUNTER }, controller: "user", summoningSick: false });
    let s = createGameState({ userDeck: [], aiDeck: [] });
    s = {
      ...s, step: "declare-attackers", phase: "combat", activePlayer: "user",
      combat: { attackers: [{ permanentId: "b", attackingPlayer: "user", defender: "ai" }], blockers: [] },
      players: { ...s.players, user: { ...s.players.user, battlefield: [beast] } },
    };
    expect(creaturePower(findPermanent(s, "b").permanent, s)).toBe(2);
    s = checkAttackTriggers(s);
    s = flushTriggers(s, { chooseTargets: chooseTriggerTargets });
    let g = 0; while ((s.stack || []).length && g++ < 25) s = resolveTopOfStack(s);
    expect(creaturePower(findPermanent(s, "b").permanent, s)).toBe(3); // +1/+1 counter landed on the source
  });
});

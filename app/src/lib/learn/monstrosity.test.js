/**
 * monstrosity.test.js — the MONSTROSITY keyword action (CR 701.32). "{cost}: Monstrosity N" is modeled as a
 * dedicated op (applyMonstrosity): if the source ISN'T monstrous, put N +1/+1 counters on it and latch it
 * monstrous; re-activating a monstrous creature is a no-op (CR 701.32c) — which is why it needs its own atom,
 * not a plain self add-counter. Flips the activated-ONLY monstrosity cards (Ill-Tempered Cyclops, Nessian Asp,
 * Gluttonous Cyclops, Fleetfeather Cockatrice, Ravenous Leucrocota).
 *
 * CREED: a card with a real "When ~ becomes monstrous, …" trigger (Alpha Deathclaw's compound "enters or becomes
 * monstrous, destroy target permanent") stays body-only — the becomesMonstrous event isn't fired yet, so
 * crediting only the ETB half would silently drop the becomes-monstrous fire (a partial-fire FP). classifyCondition
 * leaves any "becomes monstrous" trigger undetected until that event + checker are built.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { classifyCard } from "./coverage.js";
import { createGameState, createPermanent, _resetIdsForTests, findPermanent } from "./gameState.js";
import { applyMonstrosity } from "./effects/atoms/counters.js";

beforeEach(() => _resetIdsForTests());
const cnt = (s, id) => findPermanent(s, id)?.permanent?.counters?.["+1/+1"] || 0;

describe("monstrosity — classification", () => {
  it("activated-only Monstrosity creatures flip native", () => {
    expect(classifyCard({ name: "Nessian Asp", type: "Creature — Snake", mana: "{4}{G}", power: 3, toughness: 3, oracle: "{6}{G}: Monstrosity 4. (If this creature isn't monstrous, put four +1/+1 counters on it and it becomes monstrous.)" })).toMatch(/^native/);
  });
  it("Alpha Deathclaw flips native (SHELF S7: the becomesMonstrous event now fires — see becomesMonstrous.test.js)", () => {
    expect(classifyCard({ name: "Alpha Deathclaw", type: "Creature — Beast", mana: "{4}{B}{G}", power: 6, toughness: 6, oracle: "Menace, trample\nWhen this creature enters or becomes monstrous, destroy target permanent.\n{5}{B}{G}: Monstrosity 4. (If this creature isn't monstrous, put four +1/+1 counters on it and it becomes monstrous.)" })).toBe("native-mixed");
  });
  it("CREED: a non-self monstrous WATCHER still stays body-only (the event fires self-scope only)", () => {
    expect(classifyCard({ name: "Monstrous Watcher", type: "Creature — Human", mana: "{2}", power: 1, toughness: 1, oracle: "Whenever a creature you control becomes monstrous, draw a card." })).toBe("body-only");
  });
});

describe("monstrosity — resolution (once-only latch)", () => {
  it("Monstrosity N puts N +1/+1 counters and marks the source monstrous; re-activation does nothing", () => {
    let s = createGameState({ userDeck: [], aiDeck: [] });
    const c = createPermanent({ id: "m", card: { id: "cm", name: "Cyclops", type: "Creature — Cyclops", power: 3, toughness: 3 }, controller: "user" });
    s = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [c] } } };
    s = applyMonstrosity(s, { op: "monstrosity", amount: 4 }, { sourceId: "m" });
    expect(cnt(s, "m")).toBe(4);
    expect(findPermanent(s, "m").permanent.monstrous).toBe(true);
    s = applyMonstrosity(s, { op: "monstrosity", amount: 4 }, { sourceId: "m" }); // already monstrous
    expect(cnt(s, "m")).toBe(4); // unchanged
  });
});

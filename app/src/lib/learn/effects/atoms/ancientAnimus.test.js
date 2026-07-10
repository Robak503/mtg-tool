/**
 * ancientAnimus.test.js — COUNTER-IF-LEGENDARY-THEN-FIGHT (SHELF slice W3, Ancient Animus).
 *
 * "Put a +1/+1 counter on target creature you control if it's legendary. Then it fights target
 * creature an opponent controls." → ONE fight-pair atom carrying fighterCounter{onlyIfLegendary}.
 * The counter is PERSISTENT, placed before powers lock (a legendary 2/2 fights as a 3/3 and
 * keeps the counter); a non-legendary fighter fights at printed power with no counter.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { parseEffectProgram } from "../parser.js";
import { resolveAtom } from "../effectAtoms.js";
import { _resetIdsForTests, createGameState, createPermanent, findPermanent } from "../../gameState.js";

beforeEach(() => _resetIdsForTests());

const ORACLE = "Put a +1/+1 counter on target creature you control if it's legendary. Then it fights target creature an opponent controls.";

function setup(fighterCard) {
  const s0 = createGameState({ userDeck: [], aiDeck: [] });
  const fighter = createPermanent({ card: fighterCard, controller: "user" });
  const enemy = createPermanent({ card: { name: "Wall", type: "Creature — Wall", power: 0, toughness: 3 }, controller: "ai" });
  const s = {
    ...s0,
    players: {
      ...s0.players,
      user: { ...s0.players.user, battlefield: [fighter] },
      ai: { ...s0.players.ai, battlefield: [enemy] },
    },
  };
  return { s, fighter, enemy };
}

let PARSED;
const prog = () => (PARSED ||= parseEffectProgram({ name: "Ancient Animus", type: "Instant", oracle: ORACLE }));
const run = (s, fighter, enemy) => resolveAtom(s, prog().atoms[0], {
  controller: "user",
  targets: [
    { id: enemy.id, type: "creature", controller: "ai", role: "target" },
    { id: fighter.id, type: "creature", controller: "user", role: "fighter" },
  ],
});

describe("Ancient Animus — parse", () => {
  it("collapses to one fight-pair atom with fighterCounter{onlyIfLegendary}, HIGH", () => {
    const p = prog();
    expect(p.confidence).toBe("high");
    expect(p.atoms).toHaveLength(1);
    expect(p.atoms[0].op).toBe("fight-pair");
    expect(p.atoms[0].fighterCounter).toEqual({ counterType: "+1/+1", amount: 1, onlyIfLegendary: true });
  });
});

describe("Ancient Animus — resolver", () => {
  it("LEGENDARY fighter: counter placed before powers lock — a 2/2 kills the 0/3 wall and keeps the counter", () => {
    const { s, fighter, enemy } = setup({ name: "Isamaru", type: "Legendary Creature — Dog", power: 2, toughness: 2 });
    const next = run(s, fighter, enemy);
    expect(findPermanent(next, enemy.id)).toBeNull();                          // 3 damage ≥ 3 toughness
    expect(findPermanent(next, fighter.id).permanent.counters["+1/+1"]).toBe(1); // persistent counter
  });

  it("NON-legendary fighter: no counter — the 2/2 leaves the 0/3 wall alive", () => {
    const { s, fighter, enemy } = setup({ name: "Bear", type: "Creature — Bear", power: 2, toughness: 2 });
    const next = run(s, fighter, enemy);
    expect(findPermanent(next, enemy.id)).not.toBeNull();                      // 2 < 3 toughness
    expect(findPermanent(next, fighter.id).permanent.counters?.["+1/+1"] || 0).toBe(0);
  });
});

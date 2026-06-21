/**
 * proliferate.test.js — PROLIFERATE (CR 701.27): the parser atom + the never-harmful auto-pick heuristic
 * (add to my GOOD counters, an opponent's BAD counters, poison on opponents — never help an opponent or
 * hurt myself).
 */
import { describe, it, expect } from "vitest";
import { applyProliferate } from "./effects/effectAtoms.js";
import { parseEffectProgram } from "./effects/parser.js";
import { createGameState, createPermanent } from "./gameState.js";

const withCounters = (name, controller, counters) => {
  const p = createPermanent({ card: { id: `${name}-c`, name, type_line: "Creature", power: 4, toughness: 4 }, controller });
  return { ...p, counters: { ...p.counters, ...counters } };
};
const cn = (s, pid, name, type) => s.players[pid].battlefield.find((p) => p.card.name === name)?.counters?.[type] || 0;

describe("proliferate parser", () => {
  it("'Proliferate.' → a proliferate atom", () => {
    const p = parseEffectProgram({ oracle: "Proliferate.", type: "Instant" });
    expect(p?.atoms).toEqual([{ op: "proliferate", targetType: null }]);
  });
  it("'proliferate again' (Contagion Engine's second hit) also parses", () => {
    expect(parseEffectProgram({ oracle: "Proliferate again.", type: "Instant" })?.atoms).toEqual([{ op: "proliferate", targetType: null }]);
  });
});

describe("applyProliferate — the never-harmful heuristic", () => {
  const setup = () => {
    const s = createGameState({ userDeck: [], aiDeck: [] });
    return {
      ...s,
      players: {
        ...s.players,
        user: { ...s.players.user, poison: 0, battlefield: [
          withCounters("Mine", "user", { "+1/+1": 1 }),       // mine + good → proliferate
          withCounters("MyWither", "user", { "-1/-1": 1 }),   // mine + bad  → skip (don't hurt myself)
          withCounters("MyPW", "user", { loyalty: 3 }),       // mine + loyalty → proliferate
        ] },
        ai: { ...s.players.ai, poison: 3, battlefield: [
          withCounters("FoePlus", "ai", { "+1/+1": 2 }),      // opp + good → skip (don't help them)
          withCounters("FoeMinus", "ai", { "-1/-1": 1 }),     // opp + bad  → proliferate (hurt them)
        ] },
      },
    };
  };

  it("proliferates my good counters, skips my bad ones", () => {
    const out = applyProliferate(setup(), {}, { controller: "user" });
    expect(cn(out, "user", "Mine", "+1/+1")).toBe(2);       // +1
    expect(cn(out, "user", "MyPW", "loyalty")).toBe(4);     // +1
    expect(cn(out, "user", "MyWither", "-1/-1")).toBe(1);   // unchanged (never hurt myself)
  });
  it("proliferates an opponent's bad counters, skips their good ones", () => {
    const out = applyProliferate(setup(), {}, { controller: "user" });
    expect(cn(out, "ai", "FoeMinus", "-1/-1")).toBe(2);     // +1 (hurts them)
    expect(cn(out, "ai", "FoePlus", "+1/+1")).toBe(2);      // unchanged (never help them)
  });
  it("adds poison to an opponent player, never to me", () => {
    const out = applyProliferate(setup(), {}, { controller: "user" });
    expect(out.players.ai.poison).toBe(4);                  // opponent +1
    expect(out.players.user.poison).toBe(0);               // me unchanged
  });
  it("'proliferate twice' (times:2) adds two counters to each chosen permanent", () => {
    const out = applyProliferate(setup(), { times: 2 }, { controller: "user" });
    expect(cn(out, "user", "Mine", "+1/+1")).toBe(3);  // 1 + 2
    expect(out.players.ai.poison).toBe(5);             // 3 + 2
  });
  it("is a no-op when nothing has a beneficial counter to proliferate", () => {
    const s = createGameState({ userDeck: [], aiDeck: [] });
    const bare = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [withCounters("Vanilla", "user", {})] } } };
    const out = applyProliferate(bare, {}, { controller: "user" });
    expect(cn(out, "user", "Vanilla", "+1/+1")).toBe(0);
  });
});

/**
 * proliferate.test.js — PROLIFERATE (CR 701.34a): the parser atom + the never-harmful auto-pick heuristic
 * (add to my GOOD counters, an opponent's BAD counters, poison on opponents — never help an opponent or
 * hurt myself), the count forms (twice / <N> times / X times), and the CTR-2 doubling seam (a proliferated
 * +1/+1 on a permanent you control still doubles under Doubling Season, CR 616).
 */
import { describe, it, expect } from "vitest";
import { applyProliferate } from "./effects/effectAtoms.js";
import { parseEffectProgram, programConfidence } from "./effects/parser.js";
import { classifyCard } from "./coverage.js";
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
  it("'Proliferate twice.' → times:2", () => {
    expect(parseEffectProgram({ oracle: "Proliferate twice.", type: "Instant" })?.atoms).toEqual([{ op: "proliferate", times: 2, targetType: null }]);
  });
  it("'Proliferate three times.' (War of the Spark III) → times:3", () => {
    expect(parseEffectProgram({ oracle: "Proliferate three times.", type: "Sorcery" })?.atoms).toEqual([{ op: "proliferate", times: 3, targetType: null }]);
  });
  it("'Proliferate X times.' on an {X} card (Expansion Algorithm) → timesX", () => {
    const p = parseEffectProgram({ oracle: "Proliferate X times.", type: "Sorcery", mana: "{X}{U}{U}" });
    expect(p?.atoms).toEqual([{ op: "proliferate", timesX: true, targetType: null }]);
  });
  it("FN-safe: 'Proliferate X times.' with NO {X} in cost never binds a phantom count → low → Arbiter", () => {
    // No {X} → ctx.hasX false → the X form is unmatched; the clause carries an unbound X, so the whole card
    // must NOT flip to a native proliferate (it stays low → Arbiter). CREED: never a silent 0-count.
    const p = parseEffectProgram({ oracle: "Proliferate X times.", type: "Sorcery", mana: "{2}{U}" });
    expect(p?.atoms).not.toEqual([{ op: "proliferate", timesX: true, targetType: null }]);
    expect(programConfidence(p)).toBe("low");
  });
});

describe("proliferate coverage — Expansion Algorithm ({X}{U}{U} 'Proliferate X times.') flips native-spell", () => {
  it("classifies native-spell (its only clause is now modeled)", () => {
    expect(classifyCard({ type: "Sorcery", name: "Expansion Algorithm", mana: "{X}{U}{U}", oracle: "Proliferate X times. (To proliferate, choose any number of permanents and/or players, then give each another counter of each kind already there.)" })).toBe("native-spell");
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
  it("'proliferate three times' (times:3) adds three counters to each chosen permanent", () => {
    const out = applyProliferate(setup(), { times: 3 }, { controller: "user" });
    expect(cn(out, "user", "Mine", "+1/+1")).toBe(4);  // 1 + 3
    expect(out.players.ai.poison).toBe(6);             // 3 + 3
  });
  it("'Proliferate X times' (timesX) reads the cast {X} = ctx.xValue and runs that many times", () => {
    const out = applyProliferate(setup(), { timesX: true }, { controller: "user", xValue: 2 });
    expect(cn(out, "user", "Mine", "+1/+1")).toBe(3);  // 1 + 2
    expect(out.players.ai.poison).toBe(5);             // 3 + 2
  });
  it("'Proliferate X times' with X=0 is a clean no-op (never floored to 1)", () => {
    const out = applyProliferate(setup(), { timesX: true }, { controller: "user", xValue: 0 });
    expect(cn(out, "user", "Mine", "+1/+1")).toBe(1);  // unchanged
    expect(out.players.ai.poison).toBe(3);             // unchanged
    expect(cn(out, "ai", "FoeMinus", "-1/-1")).toBe(1); // unchanged
  });
  it("is a no-op when nothing has a beneficial counter to proliferate", () => {
    const s = createGameState({ userDeck: [], aiDeck: [] });
    const bare = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [withCounters("Vanilla", "user", {})] } } };
    const out = applyProliferate(bare, {}, { controller: "user" });
    expect(cn(out, "user", "Vanilla", "+1/+1")).toBe(0);
  });
});

// ── CTR-2 DOUBLING SEAM (CR 616) — a proliferated +1/+1 on a permanent you control still doubles ──
describe("proliferate composes with Doubling Season (CR 616): the +1 routes through addCounter's doubler", () => {
  it("Mine (+1/+1:1) + Doubling Season → proliferate adds 1, doubled to 2 → total 3", () => {
    const s = createGameState({ userDeck: [], aiDeck: [] });
    const mine = withCounters("Mine", "user", { "+1/+1": 1 });
    const ds = createPermanent({ id: "ds", card: { id: "ds", name: "Doubling Season", type: "Enchantment", oracle: "If an effect would put one or more counters on a permanent you control, it puts twice that many of those counters on that permanent instead." }, controller: "user" });
    const seeded = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [mine, ds] } } };
    const out = applyProliferate(seeded, {}, { controller: "user" });
    expect(cn(out, "user", "Mine", "+1/+1")).toBe(3); // 1 + (1 proliferated, doubled to 2)
  });
});

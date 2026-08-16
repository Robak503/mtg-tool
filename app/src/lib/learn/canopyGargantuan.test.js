/**
 * canopyGargantuan.test.js — PER-TARGET TOUGHNESS counters (Canopy Gargantuan, SHELF-TAIL W5).
 *
 * "At the beginning of your upkeep, put a number of +1/+1 counters on each OTHER creature you control
 * equal to THAT CREATURE'S toughness." The amount is EACH recipient's OWN layer-aware toughness —
 * perTargetStat:"toughness", the perTargetDouble sibling — SNAPSHOTTED against the pre-loop state so the
 * placement is CR 608.2-simultaneous (a recipient's own arriving counters never inflate the read). The
 * source is excluded via the existing team-scope excludeSource (the printed "other").
 *
 * Mutation-checked: disabling the parser arm kills the route/tier pins; `statSnapshot ?` → `false &&
 * statSnapshot ?` in amountForTarget kills the differing-toughness pin (everything would get the uniform
 * default 1 instead of its own toughness).
 */
import { describe, it, expect, beforeEach } from "vitest";
import { classifyCard } from "./coverage.js";
import { detectTriggers } from "./triggers.js";
import { triggerRoutesNatively } from "./triggerRouting.js";
import { parseEffectClause, programConfidence } from "./effects/parser.js";
import { applyAddCounter } from "./effects/atoms/counters.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const CANOPY = {
  name: "Canopy Gargantuan", type: "Creature — Dragon", mana: "{4}{G}{G}", power: 6, toughness: 6,
  oracle: "Flying, ward {2}\nAt the beginning of your upkeep, put a number of +1/+1 counters on each other creature you control equal to that creature's toughness.",
};
const CLAUSE = "put a number of +1/+1 counters on each other creature you control equal to that creature's toughness";

const perm = (id, name, power, toughness, controller = "user", extra = {}) => ({
  ...createPermanent({ id, controller, card: { id: `c-${id}`, name, type: "Creature — Beast", power, toughness } }),
  ...extra,
});
function stateWith(user = [], ai = []) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: user }, ai: { ...s.players.ai, battlefield: ai } } };
}
const pileOf = (s, id) => (s.players.user.battlefield.find((p) => p.id === id)?.counters?.["+1/+1"]) || 0;

describe("Canopy — parse + routing + the flip", () => {
  it("MUST STAY HIGH: the clause → perTargetStat toughness + excludeSource; the card routes native-trigger", () => {
    const p = parseEffectClause(CLAUSE, "Instant", { sourceScoped: true });
    expect(programConfidence(p)).toBe("high");
    expect(p.atoms[0]).toMatchObject({ op: "add-counter", counterType: "+1/+1", scope: "youControl", excludeSource: true, perTargetStat: "toughness" });
    const ds = detectTriggers(CANOPY);
    expect(ds).toHaveLength(1);
    expect(triggerRoutesNatively(ds[0])).toBe(true);
    expect(classifyCard(CANOPY)).toBe("native-trigger");
  });
  it("CREED near-misses: the non-'other' and the power variants stay LOW", () => {
    expect(programConfidence(parseEffectClause("put a number of +1/+1 counters on each creature you control equal to that creature's toughness", "Instant"))).toBe("low");
    expect(programConfidence(parseEffectClause("put a number of +1/+1 counters on each other creature you control equal to that creature's power", "Instant"))).toBe("low");
  });
});

describe("Canopy — the per-target toughness runtime (CR 608.2 simultaneous)", () => {
  const atom = { op: "add-counter", counterType: "+1/+1", scope: "youControl", excludeSource: true, perTargetStat: "toughness" };
  it("each other creature gets ITS OWN toughness in counters; the source gets none; the enemy gets none", () => {
    const canopy = perm("can", "Canopy Gargantuan", 6, 6);
    const small = perm("sml", "Small", 1, 1);
    const wall = perm("wal", "Wall", 0, 5);
    const theirs = perm("thr", "Theirs", 3, 3, "ai");
    const after = applyAddCounter(stateWith([canopy, small, wall], [theirs]), atom, { controller: "user", sourceId: "can" });
    expect(pileOf(after, "sml")).toBe(1);   // its own toughness (mutation-check line — a uniform default would give 1 here too,
    expect(pileOf(after, "wal")).toBe(5);   // ...but NOT here: the 0/5 gets FIVE)
    expect(pileOf(after, "can")).toBe(0);   // "other" — the source excluded
    expect((after.players.ai.battlefield[0].counters || {})["+1/+1"] || undefined).toBeUndefined();
  });
  it("the snapshot is simultaneous: a creature whose counters arrive does NOT feed its own read (5-tough gets 5, never 10)", () => {
    const canopy = perm("can", "Canopy Gargantuan", 6, 6);
    const wall = perm("wal", "Wall", 0, 5);
    const after = applyAddCounter(stateWith([canopy, wall]), atom, { controller: "user", sourceId: "can" });
    expect(pileOf(after, "wal")).toBe(5);   // pre-placement toughness — the +5 landing never re-reads as 10
  });
  it("counters already on a recipient DO count (layer 7c feeds toughness): a 1/1 with two +1/+1s reads 3", () => {
    const canopy = perm("can", "Canopy Gargantuan", 6, 6);
    const grown = perm("grw", "Grown", 1, 1, "user", { counters: { "+1/+1": 2 } });
    const after = applyAddCounter(stateWith([canopy, grown]), atom, { controller: "user", sourceId: "can" });
    expect(pileOf(after, "grw")).toBe(5);   // 2 existing + 3 placed (toughness 1+2=3)
  });
});

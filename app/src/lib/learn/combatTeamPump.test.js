/**
 * combatTeamPump.test.js — COMBAT-TEAM-PUMP: "attacking|blocking creatures get +N/+N until end of turn"
 * (Trumpet Blast / Army of Allah / Morale = attacking; Hold the Line / Piety / Rally = blocking; Hydrolash
 * = a -2/-0 attacker debuff; Iroh / Pianna = attack-triggers). New atomTargets scopes attackingCreatures /
 * blockingCreatures (filtering massCreatureTargets by state.combat), reusing applyPumpEffect over the set
 * locked at resolution (CR 611.2c).
 */
import { describe, it, expect, beforeEach } from "vitest";
import { parseEffectClause, programConfidence } from "./effects/parser.js";
import { resolveAtom } from "./effects/effectAtoms.js";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { permanentPower, permanentToughness } from "./layers.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

describe("combat-team-pump — parser", () => {
  it("'attacking creatures get +2/+0 until end of turn' → pump scope attackingCreatures", () => {
    const p = parseEffectClause("Attacking creatures get +2/+0 until end of turn.", "Instant");
    expect(programConfidence(p)).toBe("high");
    expect(p.atoms).toEqual([{ op: "pump", scope: "attackingCreatures", ptDelta: { p: 2, t: 0 } }]);
  });
  it("'blocking creatures get +0/+3 until end of turn' → pump scope blockingCreatures", () => {
    const p = parseEffectClause("Blocking creatures get +0/+3 until end of turn.", "Instant");
    expect(p.atoms).toEqual([{ op: "pump", scope: "blockingCreatures", ptDelta: { p: 0, t: 3 } }]);
  });
});

describe("combat-team-pump — resolver pumps only the combatants", () => {
  function combatState() {
    let s = createGameState({ userDeck: [], aiDeck: [] });
    const atk = createPermanent({ id: "atk", card: { id: "atk", name: "Bear", type: "Creature — Bear", power: 2, toughness: 2 }, controller: "user" });
    const bench = createPermanent({ id: "bench", card: { id: "bench", name: "Elk", type: "Creature — Elk", power: 1, toughness: 1 }, controller: "user" });
    const blk = createPermanent({ id: "blk", card: { id: "blk", name: "Wall", type: "Creature — Wall", power: 0, toughness: 4 }, controller: "ai" });
    return { ...s, combat: { attackers: [{ permanentId: "atk" }], blockers: [{ blockerId: "blk" }] },
      players: { ...s.players, user: { ...s.players.user, battlefield: [atk, bench] }, ai: { ...s.players.ai, battlefield: [blk] } } };
  }
  it("attacking pump hits the attacker, not a bench creature or the blocker", () => {
    const after = resolveAtom(combatState(), { op: "pump", scope: "attackingCreatures", ptDelta: { p: 2, t: 0 } }, { controller: "user" });
    expect(permanentPower(after, "atk")).toBe(4);     // 2 + 2
    expect(permanentPower(after, "bench")).toBe(1);    // not attacking → unchanged
    expect(permanentPower(after, "blk")).toBe(0);      // blocking, not attacking → unchanged
  });
  it("blocking pump hits the blocker only", () => {
    const after = resolveAtom(combatState(), { op: "pump", scope: "blockingCreatures", ptDelta: { p: 0, t: 3 } }, { controller: "user" });
    expect(permanentToughness(after, "blk")).toBe(7);  // 4 + 3
    expect(permanentToughness(after, "atk")).toBe(2);  // attacking, not blocking → unchanged
  });
});

describe("combat-team-pump — coverage flips", () => {
  const C = (name, oracle, type = "Instant") => ({ name, oracle, type, keywords: [], mana: "{1}{R}" });
  it("attacking/blocking pumps + attack-trigger flip native", () => {
    expect(classifyCard(C("Trumpet Blast", "Attacking creatures get +2/+0 until end of turn.", "Sorcery"))).toBe("native-spell");
    expect(classifyCard(C("Hold the Line", "Blocking creatures get +7/+7 until end of turn."))).toBe("native-spell");
    expect(classifyCard(C("Pianna, Nomad Captain", "Whenever Pianna, Nomad Captain attacks, attacking creatures get +1/+1 until end of turn.", "Creature — Human Soldier"))).toBe("native-trigger");
  });
});

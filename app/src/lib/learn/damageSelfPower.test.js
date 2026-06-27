/**
 * damageSelfPower.test.js — SELF-DAMAGE-BY-POWER ("self-fight"): "Target creature deals damage to itself
 * equal to its power" (Justice Strike, Repentance, Wrack with Madness, Inner Struggle, Kiku's Shadow; Kiku,
 * Night's Flower activated) and the MASS "Each creature deals damage to itself equal to its power" (Solar
 * Blaze, Wave of Reckoning).
 *
 * New `damage-self-power` atom + applyDamageSelfPower resolver (atoms/combat.js): mark each creature's
 * layer-aware power as damage on itself, then a single lethal SBA pass — REAL damage, so indestructible
 * survives, deathtouch makes it lethal, and a creature dies only when power >= toughness.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { parseEffectClause, programConfidence } from "./effects/parser.js";
import { resolveAtom } from "./effects/effectAtoms.js";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { classifyCard as classifyTier } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const alive = (s, side, id) => s.players[side].battlefield.some(p => p.id === id);

// ─── 1. Parser ──────────────────────────────────────────────────────────────────
describe("damage-self-power — parser", () => {
  it("'target creature deals damage to itself equal to its power' → atom HIGH", () => {
    const p = parseEffectClause("Target creature deals damage to itself equal to its power.", "Instant");
    expect(programConfidence(p)).toBe("high");
    expect(p.atoms).toEqual([{ op: "damage-self-power", targetType: "creature" }]);
  });
  it("the MASS form → eachCreature", () => {
    const p = parseEffectClause("Each creature deals damage to itself equal to its power.", "Sorcery");
    expect(p.atoms).toEqual([{ op: "damage-self-power", targetType: "eachCreature" }]);
  });
  it("CREED: a rider variant (Cut Propulsion) stays low → Arbiter", () => {
    expect(programConfidence(parseEffectClause("Target creature deals damage to itself equal to its power. If that creature has flying, draw a card.", "Instant"))).toBe("low");
  });
});

// ─── 2. Resolver ──────────────────────────────────────────────────────────────────
describe("damage-self-power — resolver (real damage + lethal SBA)", () => {
  const cre = (id, power, toughness, controller, keywords = []) =>
    createPermanent({ id, card: { id, name: id, type: "Creature — Test", power, toughness, keywords }, controller });
  function state(perms) {
    const s = createGameState({ userDeck: [], aiDeck: [] });
    const user = perms.filter(p => p.controller === "user");
    const ai = perms.filter(p => p.controller === "ai");
    return { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: user }, ai: { ...s.players.ai, battlefield: ai } } };
  }
  const targetSelf = (s, id) => resolveAtom(s, { op: "damage-self-power", targetType: "creature" }, { controller: "user", targets: [{ type: "creature", id }] });

  it("power >= toughness → dies; power < toughness → survives", () => {
    let s = state([cre("big", 3, 2, "ai"), cre("tough", 2, 3, "ai")]);
    expect(alive(targetSelf(s, "big"), "ai", "big")).toBe(false);   // 3 dmg to a 3/2 → dead
    expect(alive(targetSelf(s, "tough"), "ai", "tough")).toBe(true); // 2 dmg to a 2/3 → survives
  });
  it("indestructible survives (real damage, not 'destroy')", () => {
    let s = state([cre("indes", 4, 2, "ai", ["indestructible"])]);
    expect(alive(targetSelf(s, "indes"), "ai", "indes")).toBe(true); // 4 dmg to a 4/2 indestructible → survives
  });
  it("deathtouch makes it lethal regardless of toughness", () => {
    let s = state([cre("dt", 1, 9, "ai", ["deathtouch"])]);
    expect(alive(targetSelf(s, "dt"), "ai", "dt")).toBe(false); // 1 deathtouch dmg to a 1/9 → dead
  });
  it("0 power → clean no-op (survives, no throw)", () => {
    let s = state([cre("zero", 0, 1, "ai")]);
    expect(alive(targetSelf(s, "zero"), "ai", "zero")).toBe(true);
  });
  it("MASS (each creature): every creature takes self-power; only the lethal ones die (simultaneous)", () => {
    let s = state([cre("a", 3, 2, "user"), cre("b", 1, 4, "user"), cre("c", 5, 5, "ai")]);
    const after = resolveAtom(s, { op: "damage-self-power", targetType: "eachCreature" }, { controller: "user" });
    expect(alive(after, "user", "a")).toBe(false); // 3 dmg to a 3/2 → dead
    expect(alive(after, "user", "b")).toBe(true);  // 1 dmg to a 1/4 → survives
    expect(alive(after, "ai", "c")).toBe(false);   // 5 dmg to a 5/5 → dead (5 >= 5); hits BOTH sides
  });
});

// ─── 3. Coverage flips ────────────────────────────────────────────────────────────
describe("damage-self-power — coverage flips", () => {
  const C = (name, oracle, type = "Instant") => ({ name, oracle, type, keywords: [], mana: "{1}{R}" });
  it("the bare spells flip native-spell; the mass + activated forms flip too", () => {
    expect(classifyTier(C("Justice Strike", "Target creature deals damage to itself equal to its power."))).toBe("native-spell");
    expect(classifyTier(C("Wave of Reckoning", "Each creature deals damage to itself equal to its power.", "Sorcery"))).toBe("native-spell");
    expect(classifyTier(C("Kiku, Night's Flower", "{2}{B}{B}, {T}: Target creature deals damage to itself equal to its power.", "Creature — Human Ninja"))).toBe("native-activated");
  });
});

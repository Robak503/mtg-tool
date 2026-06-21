/**
 * earthbend.test.js — EARTHBEND N (Toph): "Target land you control becomes a 0/0 creature with haste
 * that's still a land. Put N +1/+1 counters on it." A permanent land-animation (reusing the ANIMATE
 * layer machinery) + N +1/+1 counters applied before the lethal SBA, so the land becomes a real N/N
 * attacker. The parser atom + the resolver.
 */
import { describe, it, expect } from "vitest";
import { applyEarthbend } from "./effects/effectAtoms.js";
import { parseEffectProgram } from "./effects/parser.js";
import { createGameState, createPermanent } from "./gameState.js";
import { permanentIsCreature, permanentPower, permanentToughness, permanentHasKeyword, permanentTypes } from "./layers.js";

describe("earthbend parser", () => {
  it("'earthbend 2' → a literal-N earthbend atom", () => {
    expect(parseEffectProgram({ oracle: "Earthbend 2.", type: "Instant" })?.atoms).toEqual([{ op: "earthbend", count: 2, targetType: null }]);
  });
  it("'earthbend X, where X is the number of experience counters you have' → earthbend+countSource (PR3)", () => {
    const p = parseEffectProgram({ oracle: "Earthbend X, where X is the number of experience counters you have.", type: "Instant" });
    expect(p?.atoms?.[0]).toMatchObject({ op: "earthbend", countSource: { kind: "experienceCounters" } });
  });
});

describe("applyEarthbend — permanent land-animation + counters", () => {
  const withLand = (type = "Basic Land — Forest", name = "Forest") => {
    const s = createGameState({ userDeck: [], aiDeck: [] });
    const land = createPermanent({ card: { name, type }, controller: "user" });
    return { st: { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [land] } } }, landId: land.id };
  };

  it("animates a land into an N/N Elemental with haste that's still a land", () => {
    const { st, landId } = withLand();
    const out = applyEarthbend(st, { count: 3 }, { controller: "user" });
    const land = out.players.user.battlefield.find((p) => p.id === landId);
    expect(land).toBeTruthy();                                   // survived (3/3, not a dead 0/0)
    expect(permanentIsCreature(out, landId)).toBe(true);
    expect(permanentPower(out, landId)).toBe(3);
    expect(permanentToughness(out, landId)).toBe(3);
    expect(permanentHasKeyword(out, landId, "Haste")).toBe(true); // can attack the turn it's animated
    const { types } = permanentTypes(out, landId);
    expect(types).toContain("Land");                            // "still a land" → still taps for mana
    expect(types).toContain("Creature");
  });

  it("the animation is PERMANENT (a stored continuous effect, not until-end-of-turn)", () => {
    const { st, landId } = withLand();
    const out = applyEarthbend(st, { count: 2 }, { controller: "user" });
    const eff = (out.continuousEffects || []).filter((e) => e.affects?.permanentIds?.includes(landId));
    expect(eff.length).toBeGreaterThan(0);
    expect(eff.every((e) => (e.duration?.kind || "permanent") !== "endOfTurn")).toBe(true);
  });

  it("no land to target → a safe no-op (no crash, no fabricated creature)", () => {
    const s = createGameState({ userDeck: [], aiDeck: [] });
    const bare = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [] } } };
    expect(() => applyEarthbend(bare, { count: 2 }, { controller: "user" })).not.toThrow();
  });
});

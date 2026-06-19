/**
 * REGEN (CR 701.15) — "{cost}: Regenerate this creature" / "Regenerate target creature" sets up a
 * regeneration shield that REPLACES the next destruction this turn: the creature survives, tapped, with its
 * marked damage removed (CR 701.15a), instead of dying. Modeled end-to-end: the effect atom sets the shield;
 * the lethal-damage SBA + the explicit-destroy effect consume it; it expires at cleanup. CREED: a shield does
 * NOT save from 0-toughness (CR 704.5f) — only from destruction.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { parseEffectClause } from "./effects/parser.js";
import { classifyCard } from "./coverage.js";
import { applyDestroyEffect } from "./spellEffects.js";
import { _resetIdsForTests, createGameState, createPermanent, destroyLethalCreatures, clearCombatDamage, findPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const onBoard = (perm, controller = "user") => {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return { ...s, players: { ...s.players, [controller]: { ...s.players[controller], battlefield: [perm] } } };
};
const bear = (over = {}) => ({ ...createPermanent({ id: "p1", card: { name: "Regen Troll", type: "Creature — Troll", power: 2, toughness: 3 }, controller: "user" }), ...over });
const inGrave = (s, name) => s.players.user.graveyard.some((c) => c.name === name);

describe("REGEN — parser (bare anchored forms only)", () => {
  it("recognizes self + target regenerate", () => {
    expect(parseEffectClause("regenerate this creature").atoms).toEqual([{ op: "regenerate", target: "self" }]);
    expect(parseEffectClause("regenerate this permanent").atoms).toEqual([{ op: "regenerate", target: "self" }]);
    expect(parseEffectClause("regenerate target creature").atoms).toEqual([{ op: "regenerate", targetType: "creature" }]);
  });
  it("does NOT recognize filtered / off-type regenerate (→ Arbiter, CREED-safe)", () => {
    expect(parseEffectClause("regenerate target creature you control").atoms).toEqual([]);
    expect(parseEffectClause("regenerate target artifact").atoms).toEqual([]);
    expect(parseEffectClause("regenerate all creatures you control").atoms).toEqual([]);
  });
});

describe("REGEN — coverage flips", () => {
  it("an activated '{cost}: Regenerate this creature' + a keyword classifies native", () => {
    expect(classifyCard({ type: "Creature — Troll", name: "Troll Ascetic", mana: "{1}{G}{G}", oracle: "Hexproof\n{1}{G}: Regenerate this creature." })).toBe("native-activated");
  });
  it("'Regenerate target creature' instant classifies native-spell", () => {
    expect(classifyCard({ type: "Instant", name: "Death Ward", mana: "{W}", oracle: "Regenerate target creature." })).toBe("native-spell");
  });
  it("an UNMODELED cost (discard) regen stays body-only (the cost gates it, not the regen)", () => {
    expect(classifyCard({ type: "Creature — Construct", name: "Patchwork Gnomes", mana: "{3}", oracle: "Discard a card: Regenerate this creature." })).toBe("body-only");
  });
});

describe("REGEN — engine: the shield replaces destruction", () => {
  it("a creature with lethal marked damage + a shield SURVIVES (tapped, damage cleared, shield spent)", () => {
    const s = onBoard(bear({ damageMarked: 3, regenShields: 1 }));
    const { state: after } = destroyLethalCreatures(s);
    expect(inGrave(after, "Regen Troll")).toBe(false);          // survived
    const p = findPermanent(after, "p1").permanent;
    expect(p.regenShields).toBe(0);                              // shield consumed
    expect(p.damageMarked).toBe(0);                              // damage removed (CR 701.15a)
    expect(p.tapped).toBe(true);                                 // tapped (CR 701.15a)
  });
  it("the SAME lethal damage with NO shield kills it", () => {
    const { state: after } = destroyLethalCreatures(onBoard(bear({ damageMarked: 3 })));
    expect(inGrave(after, "Regen Troll")).toBe(true);
  });
  it("a shield does NOT save from 0 toughness (CR 704.5f — not a destruction)", () => {
    const zero = { ...createPermanent({ id: "p1", card: { name: "Regen Troll", type: "Creature — Troll", power: 0, toughness: 0 }, controller: "user" }), regenShields: 1 };
    const { state: after } = destroyLethalCreatures(onBoard(zero));
    expect(inGrave(after, "Regen Troll")).toBe(true);           // dies anyway; shield still intact (unused)
    expect(findPermanent(after, "p1")).toBeFalsy();
  });
  it("an explicit Destroy effect is also replaced by the shield", () => {
    const s = onBoard(bear({ regenShields: 1 }));
    const after = applyDestroyEffect(s, { controller: "ai", targets: [{ type: "creature", id: "p1" }] });
    expect(inGrave(after, "Regen Troll")).toBe(false);
    expect(findPermanent(after, "p1").permanent.regenShields).toBe(0);
  });
  it("unused shields expire at cleanup (CR 701.15 — 'this turn')", () => {
    const after = clearCombatDamage(onBoard(bear({ regenShields: 2 })));
    expect(findPermanent(after, "p1").permanent.regenShields).toBe(0);
  });
});

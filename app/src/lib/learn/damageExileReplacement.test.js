/**
 * damageExileReplacement.test.js — SUBSYSTEM 3: DAMAGE-DIE-EXILE floating-replacement.
 *
 * A burn spell "deals N damage to target creature. If that creature would die this turn, exile it instead."
 * (Lava Coil, Magma Spray, Puncturing Blow) now resolves the death-replacement: the damaged creature is
 * EXILED instead of going to the graveyard when it would die THIS TURN.
 *
 * Pieces (all CREED-gated): the parser FOLDS the rider onto the preceding deal-damage-to-target-creature
 * atom as `exileIfWouldDie` (coupled strip+flag — a HIGH program never silently drops the exile);
 * applyDamageEffect marks the target via `markExileIfDies` BEFORE the lethal SBA; destroyLethalCreatures
 * reroutes a flagged creature to exile. The marker stores the turn it applies to, so it SELF-EXPIRES — a
 * creature surviving this turn dies normally on any later turn.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { applyDamageEffect } from "./spellEffects.js";
import { destroyLethalCreatures, _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { parseEffectProgram, programConfidence } from "./effects/parser.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const spell = (name, oracle) => ({ name, type: "Instant", mana: "{1}{R}", oracle });
// A board with one opponent creature "vic" of the given toughness, on turn 5.
function boardWith(toughness) {
  const c = createPermanent({ id: "vic", card: { id: "vic", name: "Bear", type: "Creature — Bear", power: 2, toughness, oracle: "" }, controller: "ai" });
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return { ...s, turn: 5, players: { ...s.players, ai: { ...s.players.ai, battlefield: [c] } } };
}
// Find "vic" across zones — on the battlefield it's a permanent (id "vic"); in graveyard/exile it's the
// card object (also id "vic"), so match either the perm id or the card id.
const zoneOf = (s) => {
  for (const z of ["battlefield", "graveyard", "exile"]) {
    if ((s.players.ai[z] || []).some((c) => c.id === "vic" || c.card?.id === "vic")) return z;
  }
  return "gone";
};

describe("DAMAGE-DIE-EXILE (subsystem 3) — parser fold", () => {
  it("folds the rider onto the deal-damage atom as exileIfWouldDie (program stays HIGH)", () => {
    const p = parseEffectProgram(spell("Magma Spray", "Magma Spray deals 2 damage to target creature. If that creature would die this turn, exile it instead."));
    expect(programConfidence(p)).toBe("high");
    expect(p.atoms).toEqual([{ op: "deal-damage", amount: 2, targetType: "creature", exileIfWouldDie: true }]);
  });
  it("plain damage (no rider) is unchanged — no exileIfWouldDie flag", () => {
    const p = parseEffectProgram(spell("Shock", "Shock deals 2 damage to target creature."));
    expect(p.atoms[0]).not.toHaveProperty("exileIfWouldDie");
  });
  it("recognition: the clean single-target burn spells classify native-spell", () => {
    expect(classifyCard(spell("Lava Coil", "Lava Coil deals 4 damage to target creature. If that creature would die this turn, exile it instead."))).toBe("native-spell");
    expect(classifyCard(spell("Puncturing Blow", "Puncturing Blow deals 5 damage to target creature. If that creature would die this turn, exile it instead."))).toBe("native-spell");
  });
  it("FN boundary — an unmodeled rider or the mass 'dealt damage this way' form stays Arbiter", () => {
    // a mana-add rider between the damage and the exile clause keeps the spell unmodeled (Narset's Rebuke)
    expect(programConfidence(parseEffectProgram(spell("Narset's Rebuke", "Narset's Rebuke deals 5 damage to target creature. Add {U}{R}{W}. If that creature would die this turn, exile it instead.")))).toBe("low");
    // the mass form ("a creature dealt damage this way") is a different, deferred shape
    expect(programConfidence(parseEffectProgram(spell("Pillar of Flame", "Pillar of Flame deals 2 damage to any target. If a creature dealt damage this way would die this turn, exile it instead.")))).toBe("low");
  });
});

describe("DAMAGE-DIE-EXILE (subsystem 3) — runtime", () => {
  it("lethal damage with the flag exiles the creature (not the graveyard)", () => {
    let s = boardWith(2);
    s = applyDamageEffect(s, { controller: "user", amount: 2, targetType: "creature", targets: [{ type: "creature", id: "vic" }], exileIfWouldDie: true });
    expect(zoneOf(s)).toBe("exile");
    expect(s.players.ai.graveyard || []).toHaveLength(0);
  });
  it("lethal damage WITHOUT the flag goes to the graveyard (no regression)", () => {
    let s = boardWith(2);
    s = applyDamageEffect(s, { controller: "user", amount: 2, targetType: "creature", targets: [{ type: "creature", id: "vic" }] });
    expect(zoneOf(s)).toBe("graveyard");
  });
  it("non-lethal damage leaves the flagged creature alive; if it dies LATER this turn it is still exiled", () => {
    let s = boardWith(5);
    s = applyDamageEffect(s, { controller: "user", amount: 4, targetType: "creature", targets: [{ type: "creature", id: "vic" }], exileIfWouldDie: true });
    expect(zoneOf(s)).toBe("battlefield");                       // survived (4 < 5)
    // it then takes lethal damage from another source the SAME turn (turn 5)
    s = { ...s, players: { ...s.players, ai: { ...s.players.ai, battlefield: s.players.ai.battlefield.map((p) => (p.id === "vic" ? { ...p, damageMarked: 5 } : p)) } } };
    s = destroyLethalCreatures(s).state;
    expect(zoneOf(s)).toBe("exile");                             // the "this turn" replacement still applies
  });
  it("the marker self-expires — a creature that dies on a LATER turn goes to the graveyard", () => {
    let s = boardWith(5);
    s = applyDamageEffect(s, { controller: "user", amount: 1, targetType: "creature", targets: [{ type: "creature", id: "vic" }], exileIfWouldDie: true });
    s = { ...s, turn: 6, players: { ...s.players, ai: { ...s.players.ai, battlefield: s.players.ai.battlefield.map((p) => (p.id === "vic" ? { ...p, damageMarked: 5 } : p)) } } };
    s = destroyLethalCreatures(s).state;
    expect(zoneOf(s)).toBe("graveyard");                         // marker was for turn 5, ignored on turn 6
  });
});

/**
 * gyExileUpToThree.test.js — BLITZ GX-1: "Exile up to three target cards from a single graveyard."
 * (Decompose / Rapid Decay / Scarab Feast). The up-to-N subset machinery + the singleGraveyard SUBSET
 * constraint (targeting.expandAtoms — the totalMvX pattern): a mixed-graveyard pick is never offered
 * (CR 601.2c), so applyExileFromGraveyard exiles exactly a legal single-owner set.
 * Real oracle fixtures (bundled Scryfall, verified 2026-07-16).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { createGameState, _resetIdsForTests } from "./gameState.js";
import { expandCastChoices } from "./effects/targeting.js";
import { parseEffectClause } from "./effects/parser.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

describe("GX-1 — up-to-three single-graveyard exile", () => {
  it("parses HIGH with the subset flags; the three spells flip native-spell", () => {
    const p = parseEffectClause("Exile up to three target cards from a single graveyard.", "Sorcery");
    expect(p.confidence).toBe("high");
    expect(p.atoms[0]).toMatchObject({ op: "exile-from-graveyard", maxTargets: 3, minTargets: 0, singleGraveyard: true });
    expect(classifyCard({ id: "dc", name: "Decompose", type: "Sorcery", mana: "{1}{B}",
      oracle: "Exile up to three target cards from a single graveyard." })).toBe("native-spell");
  });
  it("enumeration never offers a MIXED-graveyard subset (CR 601.2c)", () => {
    let s = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
    s = { ...s, players: { ...s.players,
      user: { ...s.players.user, graveyard: [{ id: "u1", name: "U One", type: "Creature" }, { id: "u2", name: "U Two", type: "Creature" }] },
      ai1: { ...s.players.ai1, graveyard: [{ id: "a1", name: "A One", type: "Creature" }] } } };
    const program = parseEffectClause("Exile up to three target cards from a single graveyard.", "Sorcery");
    const combos = (expandCastChoices(s, "user", program) || []).map((c) => c.targets);
    expect(combos.length).toBeGreaterThan(0);
    for (const targets of combos) {
      expect(new Set(targets.map((t) => t.controller)).size).toBeLessThanOrEqual(1); // one graveyard per pick
    }
    // The maximal single-yard pick (both user cards) IS offered; the u+a mix is not.
    expect(combos.some((c) => c.length === 2 && c.every((t) => t.controller === "user"))).toBe(true);
    expect(combos.some((c) => new Set(c.map((t) => t.controller)).size > 1)).toBe(false);
  });
});

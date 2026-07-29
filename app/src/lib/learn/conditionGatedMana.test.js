/**
 * conditionGatedMana.test.js — CONDITION-GATED mana abilities (CR 602.5) must not be offered unconditionally.
 *
 * "Metalcraft — {T}: Add one mana of any color. Activate only if you control three or more artifacts."
 * `manaSources` has no concept of an activation CONDITION, so the source was offered whether or not the
 * condition held. Verified on a board: a lone Mox Opal #241 — its own metalcraft UNMET, since it is the only
 * artifact — was returned as a live any-colour source. A turn-one ritual out of a card that should be dead.
 *
 * Same family and same verdict as spend-restricted mana (Jeweled Lotus): an ignored RESTRICTION makes the
 * engine play a card strictly better than the printed one. The whole card routes out (null → Arbiter, a
 * clean false negative) until conditions are real.
 *
 * ⭐ FOUND BY `probe-ignored-restrictions.mjs`, ON ITS FIRST RUN — and that probe exists because of what the
 * tail-injection probe taught. Auditing the latter's top five clusters (~110 of 165 cards) produced exactly
 * one defect, and the distinguishing quality was direction:
 *
 *     an ignored tail that ADDS an effect  → the engine under-delivers  → FN, safe (the Talismans)
 *     an ignored tail that RESTRICTS       → the engine over-delivers   → FP, FORBIDDEN (Mox Opal)
 *
 * So the sharper instrument enumerates restriction-shaped language on cards the metric already calls native,
 * which is exactly the population where an unread restriction becomes a strictly-better card.
 */
import { describe, expect, it } from "vitest";

import { manaProduction, manaSources } from "./manaModel.js";
import { classifyCard } from "./coverage.js";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";

const MOX_OPAL = {
  id: "mo", name: "Mox Opal", type: "Legendary Artifact", mana: "{0}",
  oracle: "Metalcraft — {T}: Add one mana of any color. Activate only if you control three or more artifacts.",
};
const FANATIC = {
  id: "fr", name: "Fanatic of Rhonas", type: "Creature — Snake", mana: "{2}{G}", power: 2, toughness: 5,
  oracle: "Ferocious — {T}: Add {G}{G}{G}{G}. Activate only if you control a creature with power 4 or greater.",
};

describe("a condition-gated mana ability produces no source", () => {
  it("⭐ THE LOAD-BEARING ONE — Mox Opal #241", () => {
    expect(manaProduction(MOX_OPAL)).toBe(null);
    expect(classifyCard(MOX_OPAL)).not.toBe("native-mana");
  });

  it("Fanatic of Rhonas #418 — four green mana behind a ferocious gate", () => {
    expect(manaProduction(FANATIC)).toBe(null);
  });

  it("⭐ RUNTIME — a lone Mox Opal (its own metalcraft UNMET) is not a live mana source", () => {
    _resetIdsForTests();
    const s = createGameState({ userDeck: [], aiDeck: [] });
    const st = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [createPermanent({ id: "mo", card: MOX_OPAL, controller: "user" })] } } };
    expect(manaSources(st, "user")).toEqual([]);
  });
});

describe("⭐ CREED — the refusal is NARROW", () => {
  it("an UNCONDITIONAL any-colour source is untouched", () => {
    const plain = { name: "X", type: "Artifact", mana: "{0}", oracle: "{T}: Add one mana of any color." };
    expect(manaProduction(plain)).toMatchObject({ amount: 1 });
    expect(classifyCard(plain)).toBe("native-mana");
  });

  it("\"Activate only as a sorcery\" is a TIMING rule and is NOT swept up here", () => {
    // Timing is handled elsewhere; only the board-state condition gate is refused. Sweeping timing in would
    // cost cards for a rule the engine already respects.
    expect(manaProduction({ name: "X", type: "Artifact", mana: "{2}", oracle: "{T}: Add {C}. Activate only as a sorcery." })).toBeTruthy();
  });

  it("an ADDITIVE rider still produces — under-delivering is safe, over-delivering is not", () => {
    expect(manaProduction({ name: "X", type: "Artifact", mana: "{2}", oracle: "{T}: Add {C}.\nWhenever you tap this artifact for mana, scry 1." })).toBeTruthy();
  });
});

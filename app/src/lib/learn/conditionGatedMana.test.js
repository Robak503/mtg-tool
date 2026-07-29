/**
 * conditionGatedMana.test.js — CONDITION-GATED mana abilities (CR 602.5) are ENFORCED, not ignored.
 *
 * "Metalcraft — {T}: Add one mana of any color. Activate only if you control three or more artifacts."
 * `manaSources` originally had no concept of an activation condition, so the source was offered whether or
 * not it held: a LONE Mox Opal #241 — its own metalcraft unmet, being the only artifact — came back as a
 * live any-colour source. A turn-one ritual out of a card that should be dead.
 *
 * ⭐ THE FIX CAME IN TWO STEPS, and the second is the honest one. The first refused every gated card
 * outright (a safe FN) "until conditions are real" — but the audit that followed found they already WERE:
 * `evaluateInterveningIf` answers these phrases, and `legalChoices` had been gating ACTIVATED abilities on
 * it all along. So the gate now rides on the mana product and is evaluated live at `manaSources` — the one
 * chokepoint every consumer of the source list passes through. Gating at each consumer instead would
 * guarantee one of them forgets.
 *
 * ⚠️ AND THE METRIC STAYS HONEST because of `conditionIsExpressible`. Tagging EVERY gate and letting
 * manaSources drop whatever is not `=== true` would be safe at runtime but would credit a card native-mana
 * while its source could never be offered — a runtime-vacuous native, the same class as the vacuous subtype
 * filter and the aura grants that never applied. A gate the evaluator cannot decide PARKS the card instead.
 */
import { describe, expect, it } from "vitest";

import { manaProduction, manaSources } from "./manaModel.js";
import { classifyCard } from "./coverage.js";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";

const MOX_OPAL = {
  id: "mo", name: "Mox Opal", type: "Legendary Artifact", mana: "{0}",
  oracle: "Metalcraft — {T}: Add one mana of any color. Activate only if you control three or more artifacts.",
};
const rock = (id) => ({ id, name: `Rock ${id}`, type: "Artifact", oracle: "" });

function board(otherArtifacts) {
  _resetIdsForTests();
  const s = createGameState({ userDeck: [], aiDeck: [] });
  const bf = [
    createPermanent({ id: "mo", card: MOX_OPAL, controller: "user" }),
    ...Array.from({ length: otherArtifacts }, (_, i) => createPermanent({ id: `r${i}`, card: rock(i), controller: "user" })),
  ];
  return { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: bf } } };
}

describe("the gate rides on the product and is enforced at manaSources", () => {
  it("the condition is carried, not discarded", () => {
    expect(manaProduction(MOX_OPAL)).toMatchObject({ activationCondition: "you control three or more artifacts" });
  });

  it("⭐ RUNTIME — a LONE Mox Opal (metalcraft UNMET) is not a live mana source", () => {
    expect(manaSources(board(0), "user")).toEqual([]);
  });

  it("⭐ RUNTIME — still dead one artifact short", () => {
    expect(manaSources(board(1), "user")).toEqual([]);
  });

  it("⭐ RUNTIME — live once metalcraft is MET (three artifacts, counting itself)", () => {
    expect(manaSources(board(2), "user")).toHaveLength(1);
  });

  it("and the card is credited native-mana, because the gate is genuinely enforced", () => {
    expect(classifyCard(MOX_OPAL)).toBe("native-mana");
  });
});

describe("⭐ THE METRIC STAYS HONEST — an INEXPRESSIBLE gate parks the card", () => {
  it("a condition evaluateInterveningIf cannot decide produces NO source and no credit", () => {
    // Crediting it would be a runtime-vacuous native: the tier says playable, the source never appears.
    const unknowable = { name: "X", type: "Artifact", mana: "{2}", oracle: "{T}: Add {C}. Activate only if you glorbulated this turn." };
    expect(manaProduction(unknowable)).toBe(null);
    expect(classifyCard(unknowable)).not.toBe("native-mana");
  });
});

describe("⭐ CREED — the gate is NARROW", () => {
  it("an UNCONDITIONAL source is untouched", () => {
    const plain = { name: "X", type: "Artifact", mana: "{0}", oracle: "{T}: Add one mana of any color." };
    expect(manaProduction(plain)).toMatchObject({ amount: 1 });
    expect(manaProduction(plain).activationCondition).toBeUndefined();
    expect(classifyCard(plain)).toBe("native-mana");
  });

  it("\"Activate only as a sorcery\" is a TIMING rule and is NOT swept up here", () => {
    expect(manaProduction({ name: "X", type: "Artifact", mana: "{2}", oracle: "{T}: Add {C}. Activate only as a sorcery." })).toBeTruthy();
  });

  it("SPEND-restricted mana is a DIFFERENT axis from the activation gate — it tags, it does not park", () => {
    // ⭐⭐ RE-POINTED 2026-07-29. The old wording was "refused outright — a different problem with no runtime
    // answer", and that second clause was the capability condition: the planner now HAS a restricted-mana
    // concept, so the card is tagged instead of parked. The point this file actually defends is unchanged and
    // is asserted below: a spend RESTRICTION is not an activation CONDITION and must not stamp one.
    const prod = manaProduction({ name: "X", type: "Artifact", mana: "{2}", oracle: "{T}: Add {C}. Spend this mana only to cast artifact spells." });
    expect(prod.restriction).toEqual({ castTypes: ["artifact"] });
    expect(prod.activationCondition).toBeUndefined();
  });
});

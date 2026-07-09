/**
 * spellsYouControlUncounterable.test.js — the CONTROLLER-scope "Spells you control can't be countered" static
 * (Chimil, the Inner Sun; CR 701.5e). Emitted as a cantBeCountered.scope:"youControl" marker by
 * staticAbilityParser and ENFORCED in spellEffects.enumerateTargets: a spell cast by a player who controls
 * such a permanent is excluded from every counter's legal targets. Chimil's other ability (end-step discover 5)
 * already parses HIGH, so it flips native-mixed. Enforcement is real (not a bare marker) — verified below.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { classifyCard } from "./coverage.js";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { enumerateTargets } from "./spellEffects.js";

beforeEach(() => _resetIdsForTests());

const CHIMIL = { name: "Chimil, the Inner Sun", type: "Legendary Artifact", mana: "{6}", oracle: "Spells you control can't be countered.\nAt the beginning of your end step, discover 5." };

function stateWith(withChimil) {
  let s = createGameState({ userDeck: [], aiDeck: [] });
  const userSpell = { kind: "spell", id: "usp", controller: "user", source: { name: "Bear", type: "Creature — Bear", oracle: "" } };
  const bf = withChimil ? [createPermanent({ id: "ch", card: { ...CHIMIL, id: "cch" }, controller: "user" })] : [];
  return { ...s, stack: [userSpell], players: { ...s.players, user: { ...s.players.user, battlefield: bf } } };
}

describe("spells-you-control can't be countered (Chimil)", () => {
  it("flips native-mixed (modeled static + modeled discover trigger)", () => {
    expect(classifyCard(CHIMIL)).toBe("native-mixed");
  });
  it("ENFORCED: with Chimil in play, its controller's stack spell is not a legal counter target", () => {
    const targets = enumerateTargets(stateWith(true), "ai", { targetType: "spell", spellFilter: "any" }).filter((t) => t.type === "spell").map((t) => t.id);
    expect(targets).toEqual([]);
  });
  it("without Chimil, that same spell IS a legal counter target (proves the exclusion isn't vacuous)", () => {
    const targets = enumerateTargets(stateWith(false), "ai", { targetType: "spell", spellFilter: "any" }).filter((t) => t.type === "spell").map((t) => t.id);
    expect(targets).toContain("usp");
  });
});

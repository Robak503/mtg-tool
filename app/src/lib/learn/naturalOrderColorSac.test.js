/**
 * naturalOrderColorSac.test.js — the COLOUR-qualified additional sac cost (SHELF-TAIL SH21 — Thrun's Natural
 * Order; CR 601.2f). "As an additional cost to cast this spell, sacrifice a GREEN creature." The tutor body
 * (search → onto the battlefield → shuffle) was already native; the sole blocker was the colour qualifier on
 * the sac cost. The colour twin of Savage Order's minPower filter: extractAdditionalCosts emits
 * { kind:"sacrifice", sacType:"creature", color:"G" }, and BOTH consumers gate the victim pool by colorsOf —
 * legalChoices offers only green creatures, actionDispatcher re-checks at pay (a colour change between offer
 * and pay must not under-charge). Flip +1/0/0 (Thrun-specific).
 *
 * Mutation-checked (via Edit): (1) drop the extractAdditionalCosts colour branch → Natural Order arbiter-spell
 * (classify dies); (2) drop the colorsOf filter in the legalChoices victim enumeration → a NON-green creature
 * is wrongly offered as a legal sac victim (the enforcement pin dies).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { classifyCard } from "./coverage.js";
import { extractAdditionalCosts } from "./effects/castModifiers.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const NATURAL_ORDER = { id: "card-no", name: "Natural Order", type: "Sorcery", mana: "{2}{G}{G}",
  oracle: "As an additional cost to cast this spell, sacrifice a green creature.\nSearch your library for a green creature card, put it onto the battlefield, then shuffle." };
const greenCreature = (id) => ({ id: `c-${id}`, name: id, type: "Creature — Elf", power: 2, toughness: 2, mana: "{G}", oracle: "" });
const redCreature = (id) => ({ id: `c-${id}`, name: id, type: "Creature — Goblin", power: 2, toughness: 2, mana: "{R}", oracle: "" });

function setup(userPerms, hand = [NATURAL_ORDER]) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return { ...s, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main",
    players: { ...s.players, user: { ...s.players.user, battlefield: userPerms, hand, manaPool: { ...s.players.user.manaPool, G: 2, C: 2 } } } };
}
const casts = (s) => legalActionsForPlayer(s, "user").filter((a) => a.kind === "cast-spell" && a.name === "Natural Order");

describe("SH21 — parse + classify", () => {
  it("extractAdditionalCosts emits a colour-qualified sacrifice; Natural Order is native-spell", () => {
    expect(extractAdditionalCosts(NATURAL_ORDER.oracle).costs).toEqual([{ kind: "sacrifice", sacType: "creature", color: "G" }]);
    expect(classifyCard(NATURAL_ORDER)).toBe("native-spell");
  });
  it("the plain 'sacrifice a creature' form is unchanged (no color field) — regression", () => {
    expect(extractAdditionalCosts("As an additional cost to cast this spell, sacrifice a creature.\nDraw a card.").costs)
      .toEqual([{ kind: "sacrifice", sacType: "creature" }]);
  });
});

describe("SH21 — the colour filter is ENFORCED (CREED core)", () => {
  it("only a GREEN creature is offered as the sac victim; a red creature is not", () => {
    const green = createPermanent({ id: "g", card: greenCreature("Elf"), controller: "user", summoningSick: false });
    const red = createPermanent({ id: "r", card: redCreature("Gob"), controller: "user", summoningSick: false });
    const acts = casts(setup([green, red]));
    const victims = acts.map((a) => a.sacCreatureId);
    expect(victims).toContain("g");        // the green creature is legal
    expect(victims).not.toContain("r");    // the red creature is NOT — the whole point
  });
  it("dispatching with a red victim (malformed action) throws — never casts on a wrong-colour sac", () => {
    const green = createPermanent({ id: "g", card: greenCreature("Elf"), controller: "user", summoningSick: false });
    const red = createPermanent({ id: "r", card: redCreature("Gob"), controller: "user", summoningSick: false });
    const s = setup([green, red]);
    const good = casts(s).find((a) => a.sacCreatureId === "g");
    expect(good).toBeTruthy();
    const badColour = { ...good, sacCreatureId: "r", sacCreatureName: "Gob" };
    expect(() => dispatchAction(s, badColour)).toThrow(/colour|ADDCOST_UNPAID|not the printed/i);
  });
});

/**
 * exileGraveyardAddCost.test.js — ADDCOST-3: "exile a <type> card from your graveyard" (CR 601.2h),
 * census slice 33, plus the CREED guard the build exposed.
 *
 * The additional-cost lane (castModifiers) already modeled sacrifice / payLife / discard. This adds the
 * graveyard-exile cost in its SINGULAR form only, exactly how the sacrifice lane started — the count-N
 * ("exile two creature cards") and X forms stay unmodeled → Arbiter, a safe false negative.
 *
 * THE GUARD IS THE MORE IMPORTANT HALF. Building this surfaced that extractAdditionalCosts is consumed
 * ONLY on the spell program path, so legalChoices gates and the dispatcher charges an additional cost for
 * instants and sorceries AND FOR NOTHING ELSE. A PERMANENT carrying one is castable for its bare mana cost
 * — strictly cheaper than printed, the same over-permissive shape as the free-Ancestral-Visions cast. Two
 * cards had reached native that way and are now parked.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { extractAdditionalCosts } from "./effects/castModifiers.js";
import { classifyCard } from "./coverage.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";

beforeEach(() => _resetIdsForTests());

const COST = "As an additional cost to cast this spell, exile a creature card from your graveyard.";
const SPELL = { id: "c-sp", name: "Test Recall", type: "Sorcery", mana: "{1}{U}", oracle: `${COST}\nDraw a card.` };

describe("parse", () => {
  it("the singular form yields a typed exileFromGraveyard cost and strips the sentence", () => {
    const r = extractAdditionalCosts(`${COST}\nDraw a card.`);
    expect(r.costs).toEqual([{ kind: "exileFromGraveyard", cardType: "creature" }]);
    expect(r.rest).toBe("Draw a card.");
  });
  it("the COUNT-N form stays unmodeled (safe FN, like the sacrifice lane's start)", () => {
    expect(extractAdditionalCosts("As an additional cost to cast this spell, exile two creature cards from your graveyard.\nDraw a card.").costs).toBeNull();
  });
  it("a self-reference to the exiled card keeps the whole card LOW", () => {
    expect(extractAdditionalCosts(`${COST}\nIt deals damage equal to the exiled card's power.`).costs).toBeNull();
  });
  it("the spell classifies native", () => {
    expect(classifyCard(SPELL)).toBe("native-spell");
  });
});

describe("RUNTIME — the cost is genuinely charged, and gates castability", () => {
  function board(graveyard) {
    const s = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
    const isl = (id) => createPermanent({ id, card: { name: "Island", type: "Basic Land — Island", oracle: "{T}: Add {U}." }, controller: "user", summoningSick: false });
    return { ...s, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", turn: 6,
      players: { ...s.players, user: { ...s.players.user, battlefield: [isl("i1"), isl("i2")], hand: [SPELL], graveyard, library: [{ id: "L1", name: "A", type: "Instant" }] } } };
  }
  const offers = (s) => legalActionsForPlayer(s, "user").filter((a) => a.name === "Test Recall");

  it("an EMPTY graveyard makes the spell uncastable — the point of the gate", () => {
    expect(offers(board([]))).toHaveLength(0);
  });

  it("a graveyard with no CREATURE card is equally uncastable (the type filter is real)", () => {
    expect(offers(board([{ id: "g1", name: "Shock", type: "Instant" }]))).toHaveLength(0);
  });

  it("with a creature card it is offered, and casting EXILES that card", () => {
    let s = board([{ id: "g1", name: "Dead Bear", type: "Creature — Bear" }]);
    const o = offers(s);
    expect(o).toHaveLength(1);
    expect(o[0].exileGyCardName).toBe("Dead Bear");
    s = dispatchAction(s, o[0]);
    let g = 0; while (s.stack.length && g++ < 8) s = resolveTopOfStack(s);
    expect((s.players.user.exile || []).map((c) => c.name)).toContain("Dead Bear");
    expect(s.players.user.graveyard.map((c) => c.name)).not.toContain("Dead Bear");
  });

  it("one offer PER candidate — it is a real in-game pick, not an auto-choice", () => {
    const s = board([{ id: "g1", name: "Dead Bear", type: "Creature — Bear" }, { id: "g2", name: "Dead Ogre", type: "Creature — Ogre" }]);
    expect(offers(s)).toHaveLength(2);
  });
});

describe("CREED — a PERMANENT's additional cost is NOT enforced, so it must not be credited", () => {
  it("Soulbright Seeker stays parked (behold an Elemental or pay {2})", () => {
    expect(classifyCard({ name: "Soulbright Seeker", type: "Creature — Elemental Sorcerer", mana: "{R}", power: 1, toughness: 1,
      oracle: "As an additional cost to cast this spell, behold an Elemental or pay {2}.\n{R}: Target creature you control gains trample until end of turn." })).toBe("body-only");
  });
  it("…and so does a permanent whose cost the lane CAN parse — parsing it is not charging it", () => {
    // The point: even a cost shape the spell path models must not credit a PERMANENT, because the permanent
    // cast path never consults additionalCosts. Cheaper-than-printed is the forbidden direction.
    expect(classifyCard({ name: "Makeshift Mauler", type: "Creature — Zombie Horror", mana: "{3}{U}", power: 3, toughness: 3,
      oracle: COST })).toBe("body-only");
  });
});

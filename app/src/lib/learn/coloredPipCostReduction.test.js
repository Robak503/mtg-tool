/**
 * coloredPipCostReduction.test.js — cost reducers that shave COLORED PIPS, not generic (CR 601.2f).
 *
 * "Cleric spells you cast cost {W}{B} less to cast. This effect reduces only the amount of colored mana you
 * pay." Edgewalker, Ragemonger ({B}{R}), Nekrataal Avatar ({B}) and Morophon, the Boundless
 * ({W}{U}{B}{R}{G} on the chosen creature type) all print this shape, and all four sat body-only.
 *
 * ⛔ THEY COULD NOT RIDE THE EXISTING REDUCER CHANNEL, which is why they were parked rather than
 * approximated. Every reducer before this slice returns a SCALAR the cast site subtracts from `generic`.
 * Edgewalker's own reminder text states the real behaviour: a {1}{W} Cleric costs {1} — the GENERIC is
 * untouched and the {W} disappears. Routing it through the scalar channel would have made that same Cleric
 * cost {W}, and Morophon would take 5 off the generic of a {4}{R}{R} Dragon (leaving {R}{R}) where the
 * printed card leaves {4}{R}. Cheaper than printed is the forbidden direction.
 *
 * ⭐ THE QUALIFIER SENTENCE IS GATED ON THE REDUCER BEING RECOGNIZED. "This effect reduces only the amount
 * of colored mana you pay." is a rules clarification carried by all SEVEN corpus cards in this family —
 * including the two whose reduction is not modellable (Vorthos, Steward of Myth: "with the chosen character
 * in its name, flavor text, or art"; Head of the Class: a per-turn targeting filter). Consuming it
 * unconditionally would shed their only residue and credit them native with the reduction silently gone.
 */
import { describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { parseStaticAbilities, coloredPipReductionForSpell } from "./staticAbilityParser.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";

// Real bundled oracle text, verbatim (reminder parentheticals kept where printed).
const EDGEWALKER = {
  id: "ew", name: "Edgewalker", type: "Creature — Human Cleric", mana: "{1}{W}{B}", power: "2", toughness: "2",
  oracle: "Cleric spells you cast cost {W}{B} less to cast. This effect reduces only the amount of colored mana you pay. (For example, if you cast a Cleric spell with mana cost {1}{W}, it costs {1} to cast.)",
};
const MOROPHON = {
  name: "Morophon, the Boundless", type: "Legendary Creature — Shapeshifter", mana: "{7}", power: "6", toughness: "6",
  oracle: "Changeling (This card is every creature type.)\nAs Morophon enters, choose a creature type.\nSpells of the chosen type you cast cost {W}{U}{B}{R}{G} less to cast. This effect reduces only the amount of colored mana you pay.\nOther creatures you control of the chosen type get +1/+1.",
};
const RAGEMONGER = {
  name: "Ragemonger", type: "Creature — Minotaur Shaman", mana: "{1}{B}{R}", power: "2", toughness: "3",
  oracle: "Minotaur spells you cast cost {B}{R} less to cast. This effect reduces only the amount of colored mana you pay. (For example, if you cast a Minotaur spell with mana cost {2}{R}, it costs {2} to cast.)",
};
const VORTHOS = {
  name: "Vorthos, Steward of Myth", type: "Legendary Creature — Human Advisor", mana: "{4}{W}{U}", power: "3", toughness: "5",
  oracle: "Each spell you cast with the chosen character in its name, flavor text, or art costs {W}{U}{B}{R}{G} less to cast. This effect reduces only the amount of colored mana you pay.",
};

describe("parsing — the pips ride on the descriptor, not a scalar", () => {
  it("⭐ Edgewalker emits a per-color pip map, not an amount", () => {
    expect(parseStaticAbilities(EDGEWALKER)).toEqual([{ costReduction: { subtype: "Cleric", pips: { W: 1, B: 1 } } }]);
  });

  it("⭐ Morophon's chosen-type form emits the five-color map", () => {
    expect(parseStaticAbilities(MOROPHON)).toContainEqual({ costReduction: { chosenType: true, pips: { W: 1, U: 1, B: 1, R: 1, G: 1 } } });
  });

  it("CONTROL — a GENERIC reducer still emits `amount`, untouched by this slice", () => {
    expect(parseStaticAbilities({ name: "Dragonspeaker Shaman", type: "Creature — Human Shaman", power: "2", toughness: "2",
      oracle: "Dragon spells you cast cost {2} less to cast." }))
      .toEqual([{ costReduction: { subtype: "Dragon", amount: 2 } }]);
  });
});

describe("tier", () => {
  it("⭐ the three modellable members flip body-only → native-static", () => {
    // THREE, not four. Nekrataal Avatar prints the same reducer but is a VANGUARD card — no mana cost, no
    // P/T, not a permanent — so it is outside the playable corpus and the tier diff correctly never moved
    // it. (It was in this test as a fabricated "Creature — Zombie Avatar" fixture until the diff's silence
    // sent me to the real record. A fixture written from the shape of a name is not evidence.)
    for (const card of [EDGEWALKER, MOROPHON, RAGEMONGER]) expect(classifyCard(card)).toBe("native-static");
  });

  it("⛔ CHOSEN-TYPE WITHOUT A CHOOSER PARKS — a runtime-vacuous native this slice nearly shipped", () => {
    // The reduction resolves against the SOURCE permanent's stored chosenType (CR 614.12), which exists
    // only because the card carries the modelled "choose a creature type" ETB. Strip that line and the
    // reduction can never once fire — but the card still classified native-static, because the argument
    // that saved it ("the chooser line would be residue") is circular: a card that never prints a chooser
    // has no such line to park on. parseStaticAbilities now drops the descriptor, so the reduction clause
    // becomes unmatched residue and the card parks.
    //
    // ⭐ CAUGHT BY AN EXISTING PIN, NOT BY REVIEW — chosenTypeSelfAdd.test.js had asserted exactly this
    // card stays body-only. The tier is not evidence about a board.
    expect(classifyCard({ ...MOROPHON,
      oracle: "Spells of the chosen type you cast cost {W}{U}{B}{R}{G} less to cast. This effect reduces only the amount of colored mana you pay." }))
      .toBe("body-only");
  });

  it("⛔ Vorthos stays body-only — its filter is unmodellable and the qualifier must not shed its residue", () => {
    expect(classifyCard(VORTHOS)).toBe("body-only");
  });

  it("⛔ so does Head of the Class (a per-turn targeting filter)", () => {
    expect(classifyCard({ name: "Head of the Class", type: "Enchantment", mana: "{2}{W}{B}",
      oracle: "The first spell you cast during each of your turns that targets a creature costs {W}{B} less to cast. This effect reduces only the amount of colored mana you pay." }))
      .not.toBe("native-static");
  });

  it("⛔ the qualifier gate is load-bearing — a GENERIC reducer wearing the colored-only qualifier parks", () => {
    // Ungating the qualifier (skip it for every card, not just one with a recognized pip reducer) left all
    // twelve of these green: Vorthos and Head of the Class are held by their own unmatched reduction
    // CLAUSE, not by the qualifier, and the bare-qualifier card is caught by the no-descriptors check. So
    // the gate was real protection with nothing exercising it — a survived mutant, the same shape the storm
    // slice hit one commit earlier.
    //
    // This is the case it actually defends: a reduction the parser models as GENERIC, printed with a
    // sentence saying the reduction is COLORED-ONLY. Ungated, the qualifier vanishes and the card goes
    // native carrying a model that contradicts its own text — cheaper on the wrong column. No printed card
    // has this shape today; the guard exists precisely so the day one is printed is not the day it ships
    // mis-modelled.
    expect(classifyCard({ name: "Contradictory Reducer", type: "Creature — Human Cleric", mana: "{1}{W}{B}", power: "2", toughness: "2",
      oracle: "Cleric spells you cast cost {1} less to cast. This effect reduces only the amount of colored mana you pay." }))
      .not.toBe("native-static");
  });

  it("⛔ CREED — the qualifier sentence alone never credits a card", () => {
    // If the gate ever stopped keying on a recognized pip reducer, this card would go native with no
    // reduction modelled at all.
    expect(classifyCard({ name: "Bare Qualifier", type: "Creature — Human", mana: "{1}{W}", power: "1", toughness: "1",
      oracle: "This effect reduces only the amount of colored mana you pay." })).not.toBe("native-static");
  });
});

describe("⭐ RUNTIME — the pip comes off the COLORED column, and the generic is left alone", () => {
  const CLERIC = { id: "cl", name: "Test Cleric", type: "Creature — Human Cleric", mana: "{1}{W}", power: "1", toughness: "1", oracle: "" };
  const GOBLIN = { id: "gb", name: "Test Goblin", type: "Creature — Goblin", mana: "{1}{R}", power: "1", toughness: "1", oracle: "" };
  function board({ withEdgewalker, pool }) {
    _resetIdsForTests();
    const s = createGameState({ userDeck: [], aiDeck: [] });
    const bf = withEdgewalker ? [createPermanent({ id: "ew", card: EDGEWALKER, controller: "user" })] : [];
    return {
      ...s, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
      players: { ...s.players, user: { ...s.players.user, hand: [CLERIC, GOBLIN], battlefield: bf, manaPool: { ...s.players.user.manaPool, ...pool } } },
    };
  }
  const castable = (st, id) => legalActionsForPlayer(st, "user").some((a) => a.kind === "cast-spell" && a.cardId === id);
  const costOf = (st, id) => (legalActionsForPlayer(st, "user").find((a) => a.kind === "cast-spell" && a.cardId === id) || {}).cost;
  const RICH = { C: 9, W: 9, B: 9, R: 9 };

  it("⭐ the printed reminder's own example: a {1}{W} Cleric costs {1}", () => {
    const cost = costOf(board({ withEdgewalker: true, pool: RICH }), "cl");
    expect(cost.W).toBe(0);
    expect(cost.generic).toBe(1); // ⛔ NOT 0 — a scalar reduction would have eaten this instead
  });

  it("⭐ it changes what is CASTABLE — {1} in the pool is enough only with Edgewalker out", () => {
    expect(castable(board({ withEdgewalker: false, pool: { C: 1 } }), "cl")).toBe(false);
    expect(castable(board({ withEdgewalker: true, pool: { C: 1 } }), "cl")).toBe(true);
  });

  it("⛔ the SUBTYPE filter holds — a Goblin gets nothing off an Edgewalker", () => {
    expect(castable(board({ withEdgewalker: true, pool: { C: 1 } }), "gb")).toBe(false);
    expect(costOf(board({ withEdgewalker: true, pool: RICH }), "gb").R).toBe(1);
  });

  it("CONTROL — with no reducer on the board the cost is the printed one", () => {
    // Without this, a reduction applied unconditionally would still pass the two assertions above.
    expect(costOf(board({ withEdgewalker: false, pool: RICH }), "cl")).toMatchObject({ generic: 1, W: 1 });
  });

  it("⛔ a pip reducer with NO filter is never applied blind", () => {
    // No printed card has this shape; if one ever parsed to it, applying it to every spell would be the
    // widest possible false positive.
    expect(coloredPipReductionForSpell([{ pips: { W: 1 } }], CLERIC)).toEqual({});
  });
});

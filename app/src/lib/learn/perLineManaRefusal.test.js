/**
 * perLineManaRefusal.test.js — the two mana REFUSALS are per-ABILITY, not per-CARD.
 *
 * An ability is a line (CR 113.3). Both of manaModel's standing refusals — the SPEND RESTRICTION ("Spend
 * this mana only to cast …") and the CONDITION GATE ("Activate only if …") — matched anywhere in the oracle
 * and nulled the WHOLE CARD. So a restricted or gated SECOND ability silently killed an UNCONDITIONAL FIRST
 * one.
 *
 * ⚠️ WHAT THAT COST, measured: **30 corpus LANDS produced NO MANA AT ALL.** The entire Verge cycle
 * (Bleachbone Verge prints a plain "{T}: Add {B}." beside a gated "{T}: Add {W}. Activate only if …"), the
 * Village cycle, Tournament Grounds, Castle Garenbrig — and Madblind Mountain, whose gated ability is a
 * SHUFFLE and whose mana is the basic-land reminder "({T}: Add {R}.)". A land that taps for nothing is a
 * soft-lock-grade playability bug.
 *
 * ⭐ AND NO METRIC COULD SEE IT. Lands are credited native by BEING lands, so the coverage number was never
 * off by a point while ~100 real fixing lands were Wastes in the sim. Same blind spot as the karoo/signet
 * mana bundle earlier in this run: tier-correct, runtime-wrong.
 *
 * THE REFUSALS THEMSELVES ARE UNCHANGED AND STILL LOAD-BEARING. A card whose ONLY mana line is restricted or
 * inexpressibly gated still returns null — the engine never gets general-purpose mana out of a restricted
 * source, which is the false positive those guards exist to prevent. Keeping the UNRESTRICTED line is
 * strictly what the card does with no strings attached, so this direction can only ever under-deliver.
 */
import { describe, expect, it } from "vitest";

import { manaProduction } from "./manaModel.js";

// Real bundled oracle text, verbatim.
const card = (name, type, oracle) => manaProduction({ name, type, oracle });

describe("⭐ the CONDITION GATE no longer kills an unconditional sibling", () => {
  it("the Verge cycle taps for its unconditional color (was NULL — a dead land)", () => {
    expect(card("Bleachbone Verge", "Land", "{T}: Add {B}.\n{T}: Add {W}. Activate only if you control a Plains or a Swamp."))
      .toMatchObject({ colors: ["B"], amount: 1 });
    expect(card("Riverpyre Verge", "Land", "{T}: Add {R}.\n{T}: Add {U}. Activate only if you control an Island or a Mountain."))
      .toMatchObject({ colors: ["R"], amount: 1 });
  });

  it("⭐ a gate on a NON-MANA ability never touches the mana (Madblind Mountain's is a SHUFFLE)", () => {
    expect(card("Madblind Mountain", "Land", "({T}: Add {R}.)\nThis land enters tapped.\n{R}, {T}: Shuffle your library. Activate only if you control two or more red permanents."))
      .toMatchObject({ colors: ["R"], amount: 1 });
    // Magus of the Library: the gated line is a DRAW. Its {C} is unconditional.
    expect(card("Magus of the Library", "Creature — Human Wizard", "{T}: Add {C}.\n{T}: Draw a card. Activate only if you have exactly seven cards in hand."))
      .toMatchObject({ colors: ["C"], amount: 1 });
  });

  it("⛔ CREED — a card whose ONLY mana line is inexpressibly gated is STILL refused", () => {
    // The whole point of the guard. Nothing here changed.
    expect(card("Fake Gated Rock", "Artifact", "{T}: Add {G}. Activate only if you control a creature named Bob and it is raining."))
      .toBeNull();
  });

  it("⛔ CREED — an EXPRESSIBLE gate on the mana line is still carried for live evaluation (Mox Opal)", () => {
    // Mox Opal must not become an unconditional turn-one ritual: its condition IS answerable, so it rides
    // on the product and manaSources evaluates it against the board.
    expect(card("Mox Opal", "Legendary Artifact", "Metalcraft — {T}: Add one mana of any color. Activate only if you control three or more artifacts."))
      .toMatchObject({ activationCondition: "you control three or more artifacts" });
  });

  it("⭐ the gate is taken from the MODELLED line, not any line (Fanatic of Rhonas)", () => {
    // Plain "{T}: Add {G}." then a Ferocious-gated bigger one. The {G} is UNCONDITIONAL — inheriting the
    // ferocious gate would switch the dork off until a 4-power creature was out.
    const p = card("Fanatic of Rhonas", "Creature — Snake Druid", "{T}: Add {G}.\nFerocious — {T}: Add {G}{G}{G}{G}. Activate only if you control a creature with power 4 or greater.");
    expect(p).toMatchObject({ colors: ["G"], amount: 1 });
    expect(p.activationCondition).toBeUndefined();
  });
});

describe("⭐ the SPEND RESTRICTION no longer kills an unrestricted sibling", () => {
  it("the Village cycle / Castle Garenbrig tap for their unrestricted mana (was NULL)", () => {
    expect(card("Oakhollow Village", "Land", "{T}: Add {C}.\n{T}: Add {G}. Spend this mana only to cast a creature spell."))
      .toMatchObject({ colors: ["C"], amount: 1 });
    expect(card("Castle Garenbrig", "Land", "This land enters tapped unless you control a Forest.\n{T}: Add {G}.\n{2}{G}{G}, {T}: Add six {G}. Spend this mana only to cast creature spells."))
      .toMatchObject({ colors: ["G"], amount: 1 });
  });

  it("⭐ Delighted Halfling gets its COLORLESS only — never the restricted any-color", () => {
    // The restricted half ("only to cast a legendary spell") stays unmodeled. Crediting it would hand the
    // engine general-purpose colored mana out of a restricted source — the FP the guard exists for.
    expect(card("Delighted Halfling", "Creature — Halfling Citizen", "{T}: Add {C}.\n{T}: Add one mana of any color. Spend this mana only to cast a legendary spell, and that spell can't be countered."))
      .toMatchObject({ colors: ["C"], amount: 1 });
  });

  it("⛔ CREED — a source whose ONLY mana is restricted is STILL refused", () => {
    // Herd Heirloom and Jeweled Lotus are the ledger's named deliberate refusals; they must not come back.
    expect(card("Herd Heirloom", "Artifact", "{T}: Add one mana of any color. Spend this mana only to cast a creature spell.")).toBeNull();
    expect(card("Jeweled Lotus", "Legendary Artifact", "{T}, Sacrifice this artifact: Add three mana of any one color. Spend this mana only to cast your commander.")).toBeNull();
  });
});

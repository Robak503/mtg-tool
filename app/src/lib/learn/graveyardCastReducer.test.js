/**
 * GRAVEYARD-CAST COST REDUCER — "Spells you cast from your graveyard cost {1} less to cast." (Patrician Geist · Gravebreaker
 * Lamia · …). Residue census 2026-09-05 (RG-3): a 3-sole-blocker family, one sentence.
 *
 * The zone-keyed reducer already existed for the two-zone printing (Doc Aurlock "from your graveyard or from exile" →
 * castFromZones) and the cast sites already pass the spell's origin zone to costReductionForSpell; only the single-zone
 * sentence had no arm. One regex → castFromZones:["graveyard"]. A cast from hand or from exile is untouched.
 *
 * Mutation-checked: see the run ledger (docs-rg3).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { collectCostReducers, costReductionForSpell } from "./staticAbilityParser.js";
import { _resetIdsForTests } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const GEIST = { id: "c-pg", name: "Patrician Geist", type: "Creature — Spirit Knight", mana: "{2}{U}", power: 2, toughness: 2, keywords: ["Flying"],
  oracle: "Flying\nOther Spirits you control get +1/+1.\nSpells you cast from your graveyard cost {1} less to cast." };
const LAMIA = { id: "c-gl", name: "Gravebreaker Lamia", type: "Enchantment Creature — Snake Lamia", mana: "{4}{B}", power: 4, toughness: 4, keywords: ["Lifelink"],
  oracle: "Lifelink\nWhen this creature enters, search your library for a card, put it into your graveyard, then shuffle.\nSpells you cast from your graveyard cost {1} less to cast." };
const SPELL = { id: "c-sp", name: "Think Twice", type: "Instant", mana: "{1}{U}", keywords: [], oracle: "Draw a card.\nFlashback {2}{U}" };

describe("the classifier", () => {
  it("both carriers read native", () => {
    const row = { geist: classifyCard(GEIST), lamia: classifyCard(LAMIA) };
    console.log("  WITNESS graveyardCastReducer", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    for (const k of Object.keys(row)) expect(row[k], k).toMatch(/^native/);
  });
});

describe("RUNTIME — the reducer is zone-keyed", () => {
  it("a graveyard cast is {1} cheaper; a hand cast and an exile cast are not", () => {
    const reducers = collectCostReducers([{ id: "pg", card: GEIST, controller: "user" }]);
    const row = { graveyard: costReductionForSpell(reducers, SPELL, "graveyard"), hand: costReductionForSpell(reducers, SPELL, "hand"), exile: costReductionForSpell(reducers, SPELL, "exile") };
    console.log("  WITNESS graveyardCastReducerRuntime", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ graveyard: 1, hand: 0, exile: 0 });
  });
});

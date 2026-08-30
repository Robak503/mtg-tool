/**
 * energyGain.test.js — ENERGY subsystem, Slice A (gain + mana-model energy-awareness).
 *
 * CR 122.1e: energy ({E}) is a player resource counter. "You get {E}…" adds one per pip (add-energy atom,
 * mirroring gain-experience). Slice A models the GAIN only; the SPEND ("Pay {E}") is not yet enforced, so the
 * mana model must NOT count an energy-gated mana ability as free mana:
 *   - Servant of the Conduit (ONLY mana is "{T}, Pay {E}: Add …") → manaProduction null → non-native (no free mana).
 *   - Aether Hub / Solar Transformer (a FREE "{T}: Add {C}" line + an energy-gated any-color line) → {C} (the free
 *     mana), NOT any-color — this also fixes a pre-existing over-count.
 * Flip-diff GAINED = 11 (the clean gain cards + Solar Transformer's legit {C} rock), LOST = 0.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { parseEffectClause } from "./effects/parser.js";
import { classifyCard } from "./coverage.js";
import { manaProduction } from "./manaModel.js";
import { applyAddEnergy } from "./effects/atoms/counters.js";
import { createGameState, _resetIdsForTests } from "./gameState.js";

beforeEach(() => _resetIdsForTests());
const C = (name, oracle, type = "Instant", mana = "{1}{G}") => ({ name, oracle, type, keywords: [], mana });

describe("energy GAIN — parser + resolver", () => {
  it("'you get {E}{E}' → add-energy(count = pip count); increments player.energy", () => {
    expect(parseEffectClause("you get {E}{E}").atoms[0]).toMatchObject({ op: "add-energy", count: 2 });
    expect(parseEffectClause("you get {E}").atoms[0]).toMatchObject({ op: "add-energy", count: 1 });
    const s = createGameState({ userDeck: [], aiDeck: [] });
    expect(s.players.user.energy).toBe(0);
    expect(applyAddEnergy(s, { op: "add-energy", count: 3 }, { controller: "user" }).players.user.energy).toBe(3);
  });
  it("clean gain cards flip native (gain was the only blocker)", () => {
    expect(classifyCard(C("Attune with Aether", "Search your library for a basic land card, reveal it, put it into your hand, then shuffle. You get {E}{E} (two energy counters).", "Sorcery", "{G}"))).toBe("native-spell");
    expect(classifyCard(C("Glimmer of Genius", "Scry 2, then draw two cards. You get {E}{E} (two energy counters).", "Instant", "{3}{U}"))).toBe("native-spell");
    expect(classifyCard(C("Rogue Refiner", "When this creature enters, draw a card and you get {E}{E} (two energy counters).", "Creature — Human", "{2}{G}"))).toBe("native-trigger");
  });
});

describe("energy SPEND not yet enforced — mana model stays honest", () => {
  it("an energy-ONLY mana dork is NOT free mana (Servant of the Conduit → null / non-native)", () => {
    const servant = C("Servant of the Conduit", "When this creature enters, you get {E}{E} (two energy counters).\n{T}, Pay {E}: Add one mana of any color.", "Creature — Elf Druid", "{1}{G}");
    expect(manaProduction(servant)).toBeNull();
    expect(classifyCard(servant)).not.toMatch(/^native/);
  });
  it("a FREE {C} line + an energy-gated any-color line credits only the {C} (Aether Hub / Solar Transformer)", () => {
    const aetherHub = { name: "Aether Hub", type: "Land", oracle: "When this land enters, you get {E} (an energy counter).\n{T}: Add {C}.\n{T}, Pay {E}: Add one mana of any color." };
    expect(manaProduction(aetherHub)).toMatchObject({ colors: ["C"], amount: 1 }); // NOT the any-color energy line
    // land-partial since the land gate (Codex fix #3): the energy-pay any-color line is a whole ability
    // the runtime refuses (energy SPEND unenforced), so the card is honestly NOT fully modeled — the
    // {C} under-offer above is the runtime truth this test exists to pin.
    expect(classifyCard(aetherHub)).toBe("land-partial");
    const solar = { name: "Solar Transformer", type: "Artifact", oracle: "This artifact enters tapped.\nWhen this artifact enters, you get {E}{E}{E} (three energy counters).\n{T}: Add {C}.\n{T}, Pay {E}: Add one mana of any color." };
    expect(manaProduction(solar)).toMatchObject({ colors: ["C"], amount: 1 });
    expect(classifyCard(solar)).toBe("native-mana");
  });
});

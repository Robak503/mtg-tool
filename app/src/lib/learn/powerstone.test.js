/**
 * THE POWERSTONE TOKEN — "{T}: Add {C}. This mana can't be spent to cast a nonartifact spell." (Koilos Roc, Stone Retrieval Unit
 * — "create a tapped Powerstone token"). QUARTET Phase 4 step 3 (the NEGATIVE spend form), 2026-09-06.
 *
 * The token had been kept out of the registry on purpose — its mana is restricted and the negative sentence had no parse.
 * parseSpendRestriction now reads "can't be spent to cast a non<Type> spell" as casts of that type ONLY plus every ability
 * (the sentence restricts casting alone); the registry gains the token with its printed reminder text; the named-token
 * creator accepts "powerstone" (the tapped form rides the existing flag).
 *
 * Mutation-checked: see the run ledger (docs-q4c).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { manaSources, canAfford, parseSpendRestriction } from "./manaModel.js";
import { parseManaCost } from "./legalChoices.js";
import { NAMED_TOKENS } from "./effects/atoms/tokens.js";
import { checkEnterTriggers } from "./triggers.js";
import { flushTriggers, resolveTopOfStack } from "./gameEngine.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const ROC = { id: "c-roc", name: "Koilos Roc", type: "Creature — Bird", mana: "{4}{U}", power: 3, toughness: 3, keywords: ["Flash", "Flying"],
  oracle: "Flash\nFlying\nWhen this creature enters, create a tapped Powerstone token. (It's an artifact with \"{T}: Add {C}. This mana can't be spent to cast a nonartifact spell.\")" };
const UNIT = { id: "c-sru", name: "Stone Retrieval Unit", type: "Artifact Creature — Construct", mana: "{4}", power: 3, toughness: 4, keywords: [],
  oracle: "When this creature enters, create a tapped Powerstone token. (It's an artifact with \"{T}: Add {C}. This mana can't be spent to cast a nonartifact spell.\")" };
const ROCK = { id: "c-rock", name: "Mind Stone", type: "Artifact", mana: "{2}", keywords: [], oracle: "" };
const BEAR = { id: "c-bear", name: "Grizzly Bears", type: "Creature — Bear", mana: "{1}{G}", power: 2, toughness: 2, keywords: [], oracle: "" };

describe("the parser and the classifier", () => {
  it("the negative sentence reads as artifact casts + every ability; the creators read native", () => {
    const r = parseSpendRestriction(NAMED_TOKENS.powerstone.oracle);
    const row = { castTypes: r?.castTypes ?? null, abilityOf: r?.abilityOf ?? null, roc: classifyCard(ROC), unit: classifyCard(UNIT) };
    console.log("  WITNESS powerstone", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row.castTypes).toEqual(["artifact"]);
    expect(row.abilityOf).toEqual(["@any"]);
    expect(row.roc).toMatch(/^native/);
    expect(row.unit).toMatch(/^native/);
  });
});

describe("RUNTIME", () => {
  it("a Powerstone on the battlefield taps for a {C} that pays an artifact spell or any ability, never a creature spell", () => {
    const s0 = createGameState({ userDeck: [], aiDeck: [] });
    const stone = createPermanent({ id: "ps", card: { id: "tok-ps", ...NAMED_TOKENS.powerstone, token: true, mana: "", keywords: [] }, controller: "user" });
    const s = { ...s0, players: { ...s0.players, user: { ...s0.players.user, battlefield: [stone], hand: [ROCK, BEAR], library: [] } } };
    const rec = manaSources(s, "user").find((m) => m.permanentId === "ps");
    const pool = s.players.user.manaPool;
    const one = parseManaCost("{1}");
    const row = { colors: rec?.colors ?? null, restricted: !!rec?.restriction, artifact: canAfford(pool, [rec], one, { castCard: ROCK }), creature: canAfford(pool, [rec], one, { castCard: BEAR }), ability: canAfford(pool, [rec], one, { activatingIsCreature: true, activatingTypeLine: BEAR.type }) };
    console.log("  WITNESS powerstoneRuntime", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ colors: ["C"], restricted: true, artifact: true, creature: false, ability: true });
  });
  it("Koilos Roc's ETB creates the token TAPPED, through the real trigger flush and stack", () => {
    const s0 = createGameState({ userDeck: [], aiDeck: [] });
    const roc = createPermanent({ id: "roc", card: ROC, controller: "user" });
    let s = { ...s0, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", turn: 5, players: { ...s0.players, user: { ...s0.players.user, battlefield: [roc], hand: [], library: [] } } };
    s = flushTriggers(checkEnterTriggers(s, roc));
    let guard = 0;
    while ((s.stack || []).length && guard++ < 5) s = resolveTopOfStack(s);
    const tok = s.players.user.battlefield.find((p) => /Powerstone/.test(p.card?.name || ""));
    const row = { created: !!tok, tapped: !!tok?.tapped, type: tok?.card?.type ?? null };
    console.log("  WITNESS powerstoneEtb", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ created: true, tapped: true, type: "Token Artifact — Powerstone" });
  });
});

/**
 * GAUNTLETS OF LIGHT — the toughness-assigns attached grant. SHELF-85 · Light-Paws L4, 2026-09-05.
 * "Enchanted creature gets +0/+2 and assigns combat damage equal to its toughness rather than its power."
 *
 * The self and team printings of "assigns combat damage equal to its toughness" already emit a layer-6 op combat
 * resolution reads layer-aware; the Aura form had no attached-clause arm. One arm in the attached-clause core: the pump
 * plus the same op, both scoped to the host by the attached-bonus path (they arrive with the Aura and leave with it).
 * Whole-clause anchored — Solid Footing's conditional "as long as … has vigilance" form never matches.
 *
 * Mutation-checked: see the run ledger (docs-sk96).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { parseAuraBonus } from "./staticAbilityParser.js";
import { assignsCombatDamageWithToughness, permanentToughness } from "./layers.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

// The printed card's THIRD line — a granted untap ability — rides the activated-grant Aura lane (already modelled), so the
// whole card lands on that lane's tier (native-activated); the pin below asks only for a native tier.
const GAUNTLETS = { id: "c-gol", name: "Gauntlets of Light", type: "Enchantment — Aura", mana: "{2}{W}", keywords: [],
  oracle: "Enchant creature\nEnchanted creature gets +0/+2 and assigns combat damage equal to its toughness rather than its power.\nEnchanted creature has \"{2}{W}: Untap this creature.\"" };
const PLAIN = { id: "c-pa", name: "Plain Aura", type: "Enchantment — Aura", mana: "{W}", keywords: [], oracle: "Enchant creature\nEnchanted creature gets +0/+2." };
const SOLID = { id: "c-sf", name: "Solid Footing", type: "Enchantment — Aura", mana: "{W}", keywords: [],
  oracle: "Flash\nEnchant creature\nEnchanted creature gets +1/+1.\nAs long as enchanted creature has vigilance, it assigns combat damage equal to its toughness rather than its power." };

function board(auraCard) {
  const s0 = createGameState({ userDeck: [], aiDeck: [] });
  const host = { ...createPermanent({ id: "host", card: { id: "c-host", name: "Sturdy Bear", type: "Creature — Bear", mana: "{1}{G}", power: 1, toughness: 3, keywords: [], oracle: "" }, controller: "user", summoningSick: false }), attachments: ["aura"] };
  const aura = { ...createPermanent({ id: "aura", card: auraCard, controller: "user" }), attachedTo: "host" };
  return { ...s0, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
    players: { ...s0.players, user: { ...s0.players.user, battlefield: [host, aura] } } };
}

describe("the attached-clause arm and the classifier", () => {
  it("Gauntlets reads to the pump plus the toughness-assigns op; the plain pump has no op; Solid Footing's conditional form stays unread; Gauntlets flips native", () => {
    const g = parseAuraBonus(GAUNTLETS).map((e) => e.op?.layerOp);
    const p = parseAuraBonus(PLAIN).map((e) => e.op?.layerOp);
    const row = { gauntlets: g, plain: p, solid: classifyCard(SOLID), tier: classifyCard(GAUNTLETS) };
    console.log("  WITNESS gauntlets", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(g).toEqual(["ptModify", "assignsCombatDamageWithToughness"]);
    expect(p).toEqual(["ptModify"]);
    expect(row.solid).not.toMatch(/^native/);
    expect(row.tier).toMatch(/^native/);
  });
});

describe("RUNTIME — the host assigns its toughness, live through the layer engine", () => {
  it("a 1/3 under Gauntlets reads toughness 5 and assigns 5; under a plain +0/+2 Aura it reads 5 but assigns its power", () => {
    const g = board(GAUNTLETS);
    const p = board(PLAIN);
    // the reader answers whether the host assigns with its toughness; combat resolution then substitutes the live toughness
    const row = { gToughness: permanentToughness(g, "host"), gAssigns: !!assignsCombatDamageWithToughness(g, "host"), pToughness: permanentToughness(p, "host"), pAssigns: !!assignsCombatDamageWithToughness(p, "host") };
    console.log("  WITNESS gauntletsRuntime", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ gToughness: 5, gAssigns: true, pToughness: 5, pAssigns: false });
  });
});

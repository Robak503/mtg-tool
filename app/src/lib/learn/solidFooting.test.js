/**
 * SOLID FOOTING — the conditional attached bonus gated on a PRINTED host keyword. SHELF-85 · Phase 3 (Light-Paws), 2026-09-05.
 * "Flash / Enchant creature / Enchanted creature gets +1/+1. / As long as enchanted creature has vigilance, it assigns combat
 * damage equal to its toughness rather than its power."
 *
 * The third condition on the conditional attached-bonus lane (Face of Divinity / Shardmage's Rescue): the host HAS a keyword.
 * The gate reads the host's PRINTED keyword line — never the layer derive, which would re-enter the collection this gate
 * runs inside (the ES-1 re-entrancy trap). A GRANTED vigilance therefore never switches it on: a documented under-read,
 * the safe direction (the host keeps assigning its power). The gated op is the toughness-assigns layer-6 op.
 *
 * Mutation-checked: see the run ledger (docs-sk117).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { parseAuraBonus } from "./staticAbilityParser.js";
import { assignsCombatDamageWithToughness, permanentToughness } from "./layers.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const FOOTING = { id: "c-sf", name: "Solid Footing", type: "Enchantment — Aura", mana: "{W}", keywords: ["Flash"],
  oracle: "Flash\nEnchant creature\nEnchanted creature gets +1/+1.\nAs long as enchanted creature has vigilance, it assigns combat damage equal to its toughness rather than its power." };

describe("the parser", () => {
  it("the conditional line parses to the toughness-assigns op under a printed-keyword gate beside the pump; Solid Footing flips native", () => {
    const es = parseAuraBonus(FOOTING).map((e) => [e.op?.layerOp, e.op?.gate ?? null]);
    const row = { es, tier: classifyCard(FOOTING) };
    console.log("  WITNESS solidFooting", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(es).toEqual([["ptModify", null], ["assignsCombatDamageWithToughness", { kind: "hostHasPrintedKeyword", keyword: "vigilance" }]]);
    expect(row.tier).toMatch(/^native/);
  });
});

function board(hostKeywords, hostOracle) {
  const s0 = createGameState({ userDeck: [], aiDeck: [] });
  const host = { ...createPermanent({ id: "host", card: { id: "c-host", name: "Sentry", type: "Creature — Soldier", mana: "{1}{W}", power: 2, toughness: 4, keywords: hostKeywords, oracle: hostOracle }, controller: "user", summoningSick: false }), attachments: ["aura"] };
  const aura = { ...createPermanent({ id: "aura", card: FOOTING, controller: "user" }), attachedTo: "host" };
  return { ...s0, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", players: { ...s0.players, user: { ...s0.players.user, battlefield: [host, aura] } } };
}

describe("RUNTIME — the layer engine reads the gate off the host's printed keyword", () => {
  it("a vigilant host under Solid Footing assigns with its toughness (3/5 → 5); a host without vigilance keeps the +1/+1 and assigns its power", () => {
    const vig = board(["Vigilance"], "Vigilance");
    const plain = board([], "");
    const row = { vigToughness: permanentToughness(vig, "host"), vigAssigns: !!assignsCombatDamageWithToughness(vig, "host"), plainToughness: permanentToughness(plain, "host"), plainAssigns: !!assignsCombatDamageWithToughness(plain, "host") };
    console.log("  WITNESS solidFootingRuntime", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ vigToughness: 5, vigAssigns: true, plainToughness: 5, plainAssigns: false });
  });
});

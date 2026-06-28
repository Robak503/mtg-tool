/**
 * auraManaGrant.test.js — SUBSYSTEM 1 phase 1a: GRANTED-MANA-ABILITY AURA (creature host).
 *
 * An Aura that grants the enchanted CREATURE a fully-modeled tap-for-mana ability
 * ("Enchanted creature has \"{T}: Add one mana of any color.\"" — Multani's Harmony) now resolves
 * through the EXISTING grantedManaSpecsFor → manaSources runtime (the same path group grants use),
 * with zero planner change: the host creature has no own production, so the grant ADDS a source.
 *
 * CREED boundaries proven here:
 *  - recognition is residue-gated all-or-nothing — a rider (can't-attack/block, ETB draw, spend-only,
 *    a cost rider on the granted ability) keeps the card non-native (→ Arbiter);
 *  - the LAND-host form (Settlement) stays non-native this slice (a land already produces mana, so the
 *    grant would be deduped → a no-op; deferred until manaSources can supplement an existing producer);
 *  - the granted {T} ability is summoning-sickness gated, and a host with its OWN mana ability is NOT
 *    double-counted (the grant only ever adds a source where there was none).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { parseAuraGrantedManaAbility, isNativeCreatureManaGrantAura } from "./staticAbilityParser.js";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { grantedManaSpecsFor } from "./layers.js";
import { manaSources } from "./manaModel.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const aura = (name, oracle) => ({ name, type: "Enchantment — Aura", mana: "{1}{G}", oracle });

function stateWith(bf) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...s,
    activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main",
    players: { ...s.players, user: { ...s.players.user, battlefield: bf } },
  };
}
// An attached Aura + its host creature, sharing the attach link both ways.
function attached(auraCard, { hostOracle = "", hostType = "Creature — Bear", summoningSick = false } = {}) {
  const a = createPermanent({ id: "aura", card: auraCard, controller: "user" });
  a.attachedTo = "host";
  const host = createPermanent({ id: "host", card: { name: "Host", type: hostType, power: 2, toughness: 2, oracle: hostOracle }, controller: "user", summoningSick });
  host.attachments = ["aura"];
  return [a, host];
}

describe("AURA-MANA-GRANT (1a) — recognition", () => {
  it("Multani's Harmony: clean creature-host grant → native-mana-aura", () => {
    const c = aura("Multani's Harmony", 'Enchant creature\nEnchanted creature has "{T}: Add one mana of any color."');
    expect(parseAuraGrantedManaAbility(c)).toEqual({ colors: ["W", "U", "B", "R", "G"], amount: 1 });
    expect(isNativeCreatureManaGrantAura(c)).toBe(true);
    expect(classifyCard(c)).toBe("native-mana-aura");
  });

  it("residue gate: a RIDER keeps the card non-native (all-or-nothing, CREED)", () => {
    // restriction rider
    expect(classifyCard(aura("Utopia Vow", 'Enchant creature\nEnchanted creature can\'t attack or block.\nEnchanted creature has "{T}: Add one mana of any color."'))).toBe("body-only");
    // ETB-trigger rider
    expect(classifyCard(aura("Karametra's Favor", 'Enchant creature\nWhen this Aura enters, draw a card.\nEnchanted creature has "{T}: Add one mana of any color."'))).toBe("body-only");
  });

  it("LAND host is deferred (a land already produces mana → grant would no-op)", () => {
    expect(classifyCard(aura("Settlement", 'Enchant Land\nEnchanted land has "{T}: Add one mana of any color."'))).toBe("body-only");
  });

  it("CREED guards on the granted ability: spend-restriction / cost-rider / variable reject", () => {
    expect(parseAuraGrantedManaAbility(aura("Clement", 'Enchant creature\nEnchanted creature has "{T}: Add one mana of any color. Spend this mana only to cast creature spells."'))).toBeNull();
    expect(parseAuraGrantedManaAbility(aura("LifeCost", 'Enchant creature\nEnchanted creature has "{T}, Pay 1 life: Add one mana of any color."'))).toBeNull();
    expect(parseAuraGrantedManaAbility(aura("XScale", 'Enchant creature\nEnchanted creature has "{T}: Add X mana of any one color, where X is its power."'))).toBeNull();
  });
});

describe("AURA-MANA-GRANT (1a) — runtime grant", () => {
  it("the enchanted creature gains the tap-for-mana source (grantedManaSpecsFor + manaSources)", () => {
    const s = stateWith(attached(aura("Multani's Harmony", 'Enchant creature\nEnchanted creature has "{T}: Add one mana of any color."')));
    expect(grantedManaSpecsFor(s, "host")).toEqual([{ colors: ["W", "U", "B", "R", "G"], amount: 1 }]);
    const src = manaSources(s, "user").find((x) => x.permanentId === "host");
    expect(src).toMatchObject({ permanentId: "host", colors: ["W", "U", "B", "R", "G"], amount: 1 });
    // legalChoices offers the tap action for the un-sick host
    const tap = legalActionsForPlayer(s, "user").filter((a) => a.kind === "tap-for-mana" && a.permanentId === "host");
    expect(tap.length).toBeGreaterThan(0);
  });

  it("summoning sickness gates the granted {T} ability (a freshly-enchanted creature can't tap)", () => {
    const s = stateWith(attached(aura("Multani's Harmony", 'Enchant creature\nEnchanted creature has "{T}: Add one mana of any color."'), { summoningSick: true }));
    expect(manaSources(s, "user").some((x) => x.permanentId === "host")).toBe(false);
  });

  it("a host with its OWN mana ability is not double-counted (grant only adds where there was none)", () => {
    // Host already taps for {G} via its own text — the grant is deduped (keep own; safe under-count, no double tap).
    const s = stateWith(attached(aura("Multani's Harmony", 'Enchant creature\nEnchanted creature has "{T}: Add one mana of any color."'), { hostOracle: "{T}: Add {G}." }));
    const hostSources = manaSources(s, "user").filter((x) => x.permanentId === "host");
    expect(hostSources).toHaveLength(1);
    expect(hostSources[0].colors).toEqual(["G"]); // own ability kept; no fabricated extra tap
  });
});

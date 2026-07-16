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
import { parseAuraGrantedManaAbility, isNativeManaGrantAura } from "./staticAbilityParser.js";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { grantedManaSpecsFor } from "./layers.js";
import { manaSources, manaProduction } from "./manaModel.js";
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
    expect(isNativeManaGrantAura(c)).toBe(true);
    expect(classifyCard(c)).toBe("native-mana-aura");
  });

  it("LAND host: 'Enchanted land has \"{T}: Add …\"' → native-mana-aura (Settlement / Sheltered Aerie)", () => {
    expect(classifyCard(aura("Settlement", 'Enchant Land\nEnchanted land has "{T}: Add one mana of any color."'))).toBe("native-mana-aura");
    const aerie = aura("Sheltered Aerie", 'Enchant land\nEnchanted land has "{T}: Add two mana of any one color."');
    expect(parseAuraGrantedManaAbility(aerie)).toEqual({ colors: ["W", "U", "B", "R", "G"], amount: 2 });
    expect(classifyCard(aerie)).toBe("native-mana-aura");
  });

  it("residue gate: a RIDER keeps the card non-native (all-or-nothing, CREED)", () => {
    // restriction rider
    expect(classifyCard(aura("Utopia Vow", 'Enchant creature\nEnchanted creature can\'t attack or block.\nEnchanted creature has "{T}: Add one mana of any color."'))).toBe("body-only");
    // ETB-trigger rider whose effect does NOT route natively (creature + land forms — the routable
    // draw/gain riders graduated in BLITZ LA-1: Karametra's Favor + Abundant Growth are pinned native
    // in landAuraEtbRider.test.js; unroutable ETBs hold the pin now)
    expect(classifyCard(aura("Probe Favor", 'Enchant creature\nWhen this Aura enters, untap all Islands you control and shuffle your hand into your library.\nEnchanted creature has "{T}: Add one mana of any color."'))).toBe("body-only");
    expect(classifyCard(aura("Probe Growth", 'Enchant land\nWhen this Aura enters, untap all Islands you control and shuffle your hand into your library.\nEnchanted land has "{T}: Add one mana of any color."'))).toBe("body-only");
    // sacrifice-draw rider
    expect(classifyCard(aura("Unbridled Growth", 'Enchant land\nEnchanted land has "{T}: Add one mana of any color."\nSacrifice this Aura: Draw a card.'))).toBe("body-only");
  });

  it("CREED guards on the granted ability: spend-restriction / cost-rider / variable reject", () => {
    expect(parseAuraGrantedManaAbility(aura("Clement", 'Enchant creature\nEnchanted creature has "{T}: Add one mana of any color. Spend this mana only to cast creature spells."'))).toBeNull();
    expect(parseAuraGrantedManaAbility(aura("LifeCost", 'Enchant creature\nEnchanted creature has "{T}, Pay 1 life: Add one mana of any color."'))).toBeNull();
    expect(parseAuraGrantedManaAbility(aura("XScale", 'Enchant creature\nEnchanted creature has "{T}: Add X mana of any one color, where X is its power."'))).toBeNull();
  });
});

describe("AURA-MANA-GRANT (1a) — creature-host runtime grant", () => {
  it("the enchanted creature gains the tap-for-mana source (grantedManaSpecsFor + manaSources)", () => {
    const s = stateWith(attached(aura("Multani's Harmony", 'Enchant creature\nEnchanted creature has "{T}: Add one mana of any color."')));
    // the aura-emitted spec carries the via:"attached" supplement marker (group grants do NOT)
    expect(grantedManaSpecsFor(s, "host")).toEqual([{ colors: ["W", "U", "B", "R", "G"], amount: 1, via: "attached" }]);
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

  it("a creature mana-dork enchanted with the aura UPGRADES to the dominating grant (one source, no double-tap)", () => {
    // Host already taps for {G}; the aura grants any-color×1, which dominates → the single tap upgrades to
    // any-color. ONE source record (the creature has one {T}; no fabricated extra tap).
    const s = stateWith(attached(aura("Multani's Harmony", 'Enchant creature\nEnchanted creature has "{T}: Add one mana of any color."'), { hostOracle: "{T}: Add {G}." }));
    const hostSources = manaSources(s, "user").filter((x) => x.permanentId === "host");
    expect(hostSources).toHaveLength(1);
    expect(hostSources[0].colors).toEqual(["W", "U", "B", "R", "G"]);
    expect(hostSources[0].amount).toBe(1);
  });
});

// An attached mana-grant Aura on a LAND that already produces its own mana (the supplement case).
function landWithAura(auraCard, { landName = "Forest", landOracle = "({T}: Add {G}.)", landType = "Basic Land — Forest" } = {}) {
  const a = createPermanent({ id: "aura", card: auraCard, controller: "user" });
  a.attachedTo = "land";
  const land = createPermanent({ id: "land", card: { name: landName, type: landType, oracle: landOracle }, controller: "user" });
  land.attachments = ["aura"];
  return [a, land];
}

describe("AURA-MANA-GRANT (1a) — CREED: the Aura is never its OWN source (ISSUE 1 regression)", () => {
  // An Aura's double-quoted "{T}: Add …" survives stripReminder (parens-only). Before the Aura-scoped
  // quoted-grant strip, parseAddClause minted the AURA ITSELF as a phantom mana source — so an attached
  // Multani's Harmony reported TWO any-color sources (the host grant + the phantom aura), letting a single
  // Aura pay a 2-pip cost. The grant belongs to the HOST (grantedManaSpecsFor), never the Aura.
  it("manaProduction of a mana-grant Aura is null (creature- and land-host forms)", () => {
    expect(manaProduction(aura("Multani's Harmony", 'Enchant creature\nEnchanted creature has "{T}: Add one mana of any color."'))).toBeNull();
    expect(manaProduction(aura("Settlement", 'Enchant Land\nEnchanted land has "{T}: Add one mana of any color."'))).toBeNull();
  });

  it("a Gemhide-style CREATURE self-grant still self-produces (the strip is Aura-scoped only)", () => {
    const gem = { name: "Gemhide Sliver", type: "Creature — Sliver", power: 1, toughness: 1, oracle: 'All Slivers have "{T}: Add one mana of any color."' };
    expect(manaProduction(gem)).toMatchObject({ colors: ["W", "U", "B", "R", "G"], amount: 1 });
  });

  it("on the battlefield the attached Aura contributes NO source of its own — only the host does", () => {
    const s = stateWith(attached(aura("Multani's Harmony", 'Enchant creature\nEnchanted creature has "{T}: Add one mana of any color."')));
    expect(manaSources(s, "user").some((x) => x.permanentId === "aura")).toBe(false);   // no phantom aura source
    expect(manaSources(s, "user").filter((x) => x.permanentId === "host")).toHaveLength(1); // exactly one (the host grant)
  });
});

describe("AURA-MANA-GRANT (1a) — land-host supplement", () => {
  it("Settlement upgrades the enchanted land's single tap to any-color (dominating grant)", () => {
    const s = stateWith(landWithAura(aura("Settlement", 'Enchant Land\nEnchanted land has "{T}: Add one mana of any color."')));
    const src = manaSources(s, "user").filter((x) => x.permanentId === "land");
    expect(src).toHaveLength(1);                              // ONE record — the land has one {T}
    expect(src[0].colors).toEqual(["W", "U", "B", "R", "G"]);
    expect(src[0].amount).toBe(1);
  });

  it("Sheltered Aerie upgrades to two-of-any-one-color (amount dominates)", () => {
    const s = stateWith(landWithAura(aura("Sheltered Aerie", 'Enchant land\nEnchanted land has "{T}: Add two mana of any one color."')));
    const src = manaSources(s, "user").find((x) => x.permanentId === "land");
    expect(src.colors).toEqual(["W", "U", "B", "R", "G"]);
    expect(src.amount).toBe(2);                               // {colors,amount}=2 means "2 mana of ONE chosen color"
  });

  it("CREED — a GROUP grant (Gemhide self-include) is NOT supplemented (no marker, no double)", () => {
    // Gemhide's own quoted text makes IT a source; its "All Slivers have …" grant is UNMARKED → the supplement
    // never fires on the granter, so it stays a single any-color source (the dedup the marker preserves).
    const gem = createPermanent({ id: "gem", card: { name: "Gemhide Sliver", type: "Creature — Sliver", power: 1, toughness: 1, oracle: 'All Slivers have "{T}: Add one mana of any color."' }, controller: "user", summoningSick: false });
    const s = stateWith([gem]);
    const src = manaSources(s, "user").filter((x) => x.permanentId === "gem");
    expect(src).toHaveLength(1);
    expect(src[0].colors).toEqual(["W", "U", "B", "R", "G"]);
    expect(src[0].amount).toBe(1);                            // not doubled to 2; not mis-upgraded
  });

  it("non-dominating own ability is kept (a {C}{C} land granted any-color×1 stays {C}{C} — safe under-count)", () => {
    // own = {C}{C} (amount 2, colorless); grant = any-color×1. Neither dominates (C ∉ WUBRG; 1 < 2) → keep own.
    const s = stateWith(landWithAura(aura("Settlement", 'Enchant Land\nEnchanted land has "{T}: Add one mana of any color."'), { landName: "Cloudpost", landOracle: "{T}: Add {C}{C}.", landType: "Land" }));
    const src = manaSources(s, "user").find((x) => x.permanentId === "land");
    expect(src.colors).toEqual(["C"]);
    expect(src.amount).toBe(2);
  });
});

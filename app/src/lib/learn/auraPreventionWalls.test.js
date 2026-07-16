/**
 * auraPreventionWalls.test.js — BLITZ AP-1 (CR 615): the attached prevention walls (Gaseous Form /
 * Sandskin "to and by, combat" · Inviolability / Heart of Light "to, all" · Defang / Muzzle "by, all").
 * The per-card reader lives in staticAbilityParser (the aura NATIVE gate the cast paths consult reads
 * the same shapes); combatEvasion.attachedDamagePrevention aggregates per permanent; both damage paths
 * consult it. A compound aura (Ghostly Possession's flying + wall) keeps its keyword half — the bonus
 * walk skips the wall line instead of dropping everything.
 * Real oracle fixtures (bundled Scryfall, verified 2026-07-16).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { attachedPreventionOf, isNativeAura, parseAuraBonus } from "./staticAbilityParser.js";
import { applyDamageEffect } from "./spellEffects.js";
import { resolveCombatDamage } from "./combatResolution.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const GASEOUS_FORM = { id: "gf", name: "Gaseous Form", type: "Enchantment — Aura", mana: "{2}{U}",
  oracle: "Enchant creature\nPrevent all combat damage that would be dealt to and dealt by enchanted creature." };
const INVIOLABILITY = { id: "iv", name: "Inviolability", type: "Enchantment — Aura", mana: "{1}{W}",
  oracle: "Enchant creature\nPrevent all damage that would be dealt to enchanted creature." };
const DEFANG = { id: "df", name: "Defang", type: "Enchantment — Aura", mana: "{1}{W}",
  oracle: "Enchant creature\nPrevent all damage that would be dealt by enchanted creature." };
const GHOSTLY_POSSESSION = { id: "gp", name: "Ghostly Possession", type: "Enchantment — Aura", mana: "{2}{U}",
  oracle: "Enchant creature\nEnchanted creature has flying.\nPrevent all combat damage that would be dealt to and dealt by enchanted creature." };

describe("reader + classify + the compound bonus", () => {
  it("the four shapes read; the class flips native-aura; the compound keeps its keyword half", () => {
    expect(attachedPreventionOf(GASEOUS_FORM)).toEqual({ to: "combat", by: "combat" });
    expect(attachedPreventionOf(INVIOLABILITY)).toEqual({ to: "all", by: null });
    expect(attachedPreventionOf(DEFANG)).toEqual({ to: null, by: "all" });
    expect(isNativeAura(GASEOUS_FORM)).toBe(true);
    expect(classifyCard(INVIOLABILITY)).toBe("native-aura");
    expect(classifyCard(DEFANG)).toBe("native-aura");
    expect(classifyCard(GHOSTLY_POSSESSION)).toBe("native-aura");
    expect(parseAuraBonus(GHOSTLY_POSSESSION).length).toBeGreaterThan(0); // the flying grant survives the wall line
  });
});

describe("runtime — the walls bind per direction and per damage kind", () => {
  function board(auraCard, hostController = "user") {
    let s = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
    const host = createPermanent({ id: "host", card: { id: "hb", name: "Host Bear", type: "Creature — Bear", power: "4", toughness: "4", oracle: "" }, controller: hostController, summoningSick: false });
    const aura = createPermanent({ id: "aura", card: auraCard, controller: "user", summoningSick: false });
    aura.attachedTo = "host"; host.attachments = ["aura"];
    const raider = createPermanent({ id: "atk", card: { id: "rd", name: "Raider", type: "Creature — Human", power: "3", toughness: "3", oracle: "" }, controller: "ai1", summoningSick: false });
    s = { ...s, turn: 5, players: { ...s.players, [hostController]: { ...s.players[hostController], battlefield: [host, ...(hostController === "user" ? [aura] : [])] }, ...(hostController !== "user" ? { user: { ...s.players.user, battlefield: [aura] } } : {}), ai1: { ...s.players.ai1, battlefield: hostController === "ai1" ? [host] : [raider] } } };
    return s;
  }

  it("Gaseous Form: combat both ways is zeroed, but a Bolt still lands (combat-only wall)", () => {
    let s = board(GASEOUS_FORM);
    const combat = resolveCombatDamage({ ...s, combat: { attackers: [{ permanentId: "atk", attackingPlayer: "ai1", defender: "user" }], blockers: [{ blockerId: "host", attackerId: "atk" }] } });
    expect(combat.players.user.battlefield.find((p) => p.id === "host").damageMarked || 0).toBe(0); // took none
    expect(combat.players.ai1.battlefield.find((p) => p.id === "atk").damageMarked || 0).toBe(0);   // dealt none
    const burned = applyDamageEffect(s, { controller: "ai1", amount: 2, targetType: "creature", targets: [{ type: "creature", id: "host" }], source: null });
    expect(burned.players.user.battlefield.find((p) => p.id === "host").damageMarked).toBe(2);      // the Bolt lands
  });

  it("Inviolability: the ALL wall blocks the Bolt too", () => {
    const s = board(INVIOLABILITY);
    const burned = applyDamageEffect(s, { controller: "ai1", amount: 3, targetType: "creature", targets: [{ type: "creature", id: "host" }], source: null });
    expect(burned.players.user.battlefield.find((p) => p.id === "host").damageMarked || 0).toBe(0);
  });

  it("Defang: the host still TAKES combat damage but DEALS none", () => {
    const s = board(DEFANG);
    const combat = resolveCombatDamage({ ...s, combat: { attackers: [{ permanentId: "atk", attackingPlayer: "ai1", defender: "user" }], blockers: [{ blockerId: "host", attackerId: "atk" }] } });
    expect(combat.players.user.battlefield.find((p) => p.id === "host").damageMarked).toBe(3);      // takes the raider's 3
    expect(combat.players.ai1.battlefield.find((p) => p.id === "atk").damageMarked || 0).toBe(0);   // deals none back
  });
});

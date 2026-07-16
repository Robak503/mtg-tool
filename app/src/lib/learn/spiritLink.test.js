/**
 * spiritLink.test.js — BLITZ SL-1: the DEALT-BY lifegain links. SELF form "Whenever this creature deals
 * [combat] damage, you gain that much life" (Zebra Unicorn / Sunhome Enforcer's combat-only) and the
 * ATTACHED form "Whenever enchanted creature deals damage, you gain that much life" (Spirit Link /
 * Vampiric Link / Armadillo Cloak) — the gain goes to the AURA's controller, so Spirit Link on an
 * OPPONENT'S creature feeds you. checkDealtByTriggers fires per damage event (one CR 510.2 combat-step
 * total per source; one resolution total per non-combat source) at BOTH damage paths; the payoff rides
 * the standard flush with ctx.combatDamageAmount. Real oracle fixtures (bundled Scryfall, 2026-07-16).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { resolveCombatDamage } from "./combatResolution.js";
import { applyDamageEffect } from "./spellEffects.js";
import { dealtByLinkOf } from "./triggers.js";
import { flushTriggers, resolveTopOfStack } from "./gameEngine.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const ZEBRA_UNICORN = { id: "zu", name: "Zebra Unicorn", type: "Creature — Zebra Unicorn", power: "2", toughness: "2", mana: "{W}{G}",
  oracle: "Whenever this creature deals damage, you gain that much life." };
const SPIRIT_LINK = { id: "sl", name: "Spirit Link", type: "Enchantment — Aura", mana: "{W}",
  oracle: "Enchant creature\nWhenever enchanted creature deals damage, you gain that much life." };

function resolveAll(s) { s = flushTriggers(s, {}); let g = 0; while ((s.stack || []).length && g++ < 12) s = resolveTopOfStack(s); return s; }

describe("reader + classify", () => {
  it("both forms read (combat-only flagged); the family flips", () => {
    expect(dealtByLinkOf(ZEBRA_UNICORN)).toEqual({ subject: "self", combatOnly: false });
    expect(dealtByLinkOf({ oracle: "Whenever this creature deals combat damage, you gain that much life." })).toEqual({ subject: "self", combatOnly: true });
    expect(dealtByLinkOf(SPIRIT_LINK)).toEqual({ subject: "enchanted", combatOnly: false });
    expect(classifyCard(ZEBRA_UNICORN)).toBe("native-trigger");
    expect(classifyCard(SPIRIT_LINK)).toBe("native-aura");
  });
});

describe("runtime — both damage paths", () => {
  it("COMBAT: the unicorn connects for 2 → its controller gains 2", () => {
    let s = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
    const zu = createPermanent({ id: "zu", card: ZEBRA_UNICORN, controller: "user", summoningSick: false });
    s = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [zu] } } };
    const before = s.players.user.life;
    let after = resolveCombatDamage({ ...s, combat: { attackers: [{ permanentId: "zu", attackingPlayer: "user", defender: "ai1" }], blockers: [] } });
    after = resolveAll(after);
    expect(after.players.user.life - before).toBe(2);
  });
  it("AURA on an OPPONENT'S creature: their ping feeds MY life; a combat-only self link stays silent off-combat", () => {
    let s = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
    const foe = createPermanent({ id: "fp", card: { id: "fpc", name: "Prodigal Pyromancer", type: "Creature — Human Wizard", power: "1", toughness: "1", oracle: "{T}: This creature deals 1 damage to any target." }, controller: "ai1", summoningSick: false });
    const link = createPermanent({ id: "sl", card: SPIRIT_LINK, controller: "user", summoningSick: false });
    link.attachedTo = "fp"; foe.attachments = ["sl"];
    s = { ...s, players: { ...s.players, ai1: { ...s.players.ai1, battlefield: [foe] }, user: { ...s.players.user, battlefield: [link] } } };
    const before = s.players.user.life;
    let after = applyDamageEffect(s, { controller: "ai1", amount: 1, targetType: "player", targets: [{ type: "player", id: "ai2" }], source: { id: "fp" } });
    after = resolveAll(after);
    expect(after.players.user.life - before).toBe(1); // the AURA's controller gains — not the pinger's
    // Combat-only (Sunhome form) never fires from a non-combat source.
    const sunhome = createPermanent({ id: "se", card: { id: "sec", name: "Sunhome Enforcer", type: "Creature — Giant Soldier", power: "2", toughness: "4",
      oracle: "Whenever this creature deals combat damage, you gain that much life.\n{1}{R}: This creature gets +1/+0 until end of turn." }, controller: "user", summoningSick: false });
    let s2 = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
    s2 = { ...s2, players: { ...s2.players, user: { ...s2.players.user, battlefield: [sunhome] } } };
    const b2 = s2.players.user.life;
    let a2 = applyDamageEffect(s2, { controller: "user", amount: 3, targetType: "player", targets: [{ type: "player", id: "ai1" }], source: { id: "se" } });
    a2 = resolveAll(a2);
    expect(a2.players.user.life - b2).toBe(0); // non-combat → the combat-only link stays quiet
  });
});

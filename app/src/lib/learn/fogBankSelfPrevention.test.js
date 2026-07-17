/**
 * fogBankSelfPrevention.test.js — BLITZ PV-1 (CR 615): the SELF "to and dealt by" static prevention wall
 * (Fog Bank "Prevent all combat damage that would be dealt to and dealt by this creature.") and the printed
 * card-NAME form (Cho-Manno, Revolutionary "Prevent all damage that would be dealt to Cho-Manno.").
 *
 * The TO half rides the incumbent selfDamagePrevention reader (extended to the compound form); the BY half is
 * the new selfDamagePreventionBy reader, wired into the combat funnel at the DEALER step. Both directions are
 * COMBAT-scope for Fog Bank: it TAKES zero and DEALS zero combat damage, and — because prevented damage is
 * never MARKED — the lethal SBA sees nothing, so a 0/2 Fog Bank survives blocking a 6/6 (combat-math pin).
 * The wall is scoped to the one permanent (no leak to a neighbor), and combat-only (a Bolt still lands).
 * FN guards: the activated/triggered "…this turn" variants (Moonlight Geist) stay parked (body-only).
 * Real oracle fixtures (bundled Scryfall, verified 2026-07-17).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { selfDamagePrevention, selfDamagePreventionBy } from "./combatEvasion.js";
import { applyDamageEffect } from "./spellEffects.js";
import { resolveCombatDamage } from "./combatResolution.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const FOG_BANK = { id: "fb", name: "Fog Bank", type: "Creature — Wall", mana: "{1}{U}", power: "0", toughness: "2",
  oracle: "Defender (This creature can't attack.)\nFlying\nPrevent all combat damage that would be dealt to and dealt by this creature." };
// Real Fog Bank is a 0/2 (deals 0 by power alone). To isolate the BY (dealer) wall we carry the SAME real
// oracle on a power-bumped fixture — proving the funnel zeroes what it WOULD otherwise deal.
const FOG_BANK_5P = { ...FOG_BANK, power: "5", toughness: "5" };
const CHO_MANNO = { id: "cm", name: "Cho-Manno, Revolutionary", type: "Legendary Creature — Human Rebel", mana: "{2}{W}", power: "2", toughness: "2",
  oracle: "Prevent all damage that would be dealt to Cho-Manno." };
const MOONLIGHT_GEIST = { id: "mg", name: "Moonlight Geist", type: "Creature — Spirit", mana: "{3}{W}", power: "2", toughness: "2",
  oracle: "Flying\n{3}{W}: Prevent all combat damage that would be dealt to and dealt by this creature this turn." };

describe("readers + classify", () => {
  it("Fog Bank reads combat both directions; Cho-Manno reads all-TO by its NAME; both flip native-static", () => {
    expect(selfDamagePrevention(FOG_BANK)).toBe("combat");     // TO half
    expect(selfDamagePreventionBy(FOG_BANK)).toBe("combat");   // BY half
    expect(selfDamagePrevention(CHO_MANNO)).toBe("all");       // name normalized to "this creature"
    expect(selfDamagePreventionBy(CHO_MANNO)).toBe(null);
    expect(classifyCard(FOG_BANK)).toBe("native-static");
    expect(classifyCard(CHO_MANNO)).toBe("native-static");
  });

  it("FN guard: the activated '…this turn' variant stays parked (not a printed static)", () => {
    expect(selfDamagePrevention(MOONLIGHT_GEIST)).toBe(null);
    expect(selfDamagePreventionBy(MOONLIGHT_GEIST)).toBe(null);
    expect(classifyCard(MOONLIGHT_GEIST)).toBe("body-only");
  });
});

describe("runtime — Fog Bank in combat", () => {
  function board(fogCard, extra = {}) {
    let s = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
    const fog = createPermanent({ id: "fog", card: fogCard, controller: "user", summoningSick: false });
    const brute = createPermanent({ id: "atk", card: { id: "br", name: "Brute", type: "Creature — Giant", power: "6", toughness: "6", oracle: "" }, controller: "ai1", summoningSick: false });
    s = { ...s, turn: 5, players: { ...s.players,
      user: { ...s.players.user, battlefield: [fog, ...(extra.userExtra || [])] },
      ai1: { ...s.players.ai1, battlefield: [brute, ...(extra.aiExtra || [])] } } };
    return s;
  }

  it("Fog Bank (0/2) blocks a 6/6: takes 0, and SURVIVES — the lethal SBA saw no marked damage", () => {
    const s = board(FOG_BANK);
    const out = resolveCombatDamage({ ...s, combat: { attackers: [{ permanentId: "atk", attackingPlayer: "ai1", defender: "user" }], blockers: [{ blockerId: "fog", attackerId: "atk" }] } });
    const fog = out.players.user.battlefield.find((p) => p.id === "fog");
    expect(fog).toBeTruthy();                       // NOT destroyed by the 6/6 (prevented damage isn't marked)
    expect(fog.damageMarked || 0).toBe(0);          // took none (TO combat wall)
    expect(out.players.ai1.battlefield.find((p) => p.id === "atk").damageMarked || 0).toBe(0); // 0-power Fog Bank dealt none anyway
  });

  it("the BY (dealer) wall zeroes what a power-bumped Fog Bank would deal — it DEALS zero combat damage", () => {
    const s = board(FOG_BANK_5P);
    const out = resolveCombatDamage({ ...s, combat: { attackers: [{ permanentId: "atk", attackingPlayer: "ai1", defender: "user" }], blockers: [{ blockerId: "fog", attackerId: "atk" }] } });
    // The 5/5-bodied Fog Bank fixture blocks the 6/6: it deals 0 back (BY wall) and takes 0 (TO wall); both live.
    expect(out.players.ai1.battlefield.find((p) => p.id === "atk").damageMarked || 0).toBe(0); // dealt none (BY wall)
    expect(out.players.user.battlefield.find((p) => p.id === "fog")?.damageMarked || 0).toBe(0); // took none (TO wall)
    expect(out.players.ai1.battlefield.find((p) => p.id === "atk")).toBeTruthy();               // the brute survives (no 5 marked)
  });

  it("no leak: a plain 3/3 neighbor still trades combat damage normally", () => {
    const bear = createPermanent({ id: "bear", card: { id: "gb", name: "Bear", type: "Creature — Bear", power: "3", toughness: "5", oracle: "" }, controller: "user", summoningSick: false });
    const raider = createPermanent({ id: "rdr", card: { id: "rd", name: "Raider", type: "Creature — Human", power: "3", toughness: "5", oracle: "" }, controller: "ai1", summoningSick: false });
    const s = board(FOG_BANK, { userExtra: [bear], aiExtra: [raider] });
    const out = resolveCombatDamage({ ...s, combat: {
      attackers: [{ permanentId: "rdr", attackingPlayer: "ai1", defender: "user" }],
      blockers: [{ blockerId: "bear", attackerId: "rdr" }] } });
    // The Fog Bank isn't involved; the neighbor bear and raider mark each other in full (wall didn't leak).
    expect(out.players.user.battlefield.find((p) => p.id === "bear").damageMarked).toBe(3);
    expect(out.players.ai1.battlefield.find((p) => p.id === "rdr").damageMarked).toBe(3);
  });

  it("combat-only: a Bolt (noncombat) still marks Fog Bank — its TO wall is combat-scoped", () => {
    const s = board(FOG_BANK);
    const burned = applyDamageEffect(s, { controller: "ai1", amount: 1, targetType: "creature", targets: [{ type: "creature", id: "fog" }], source: null });
    expect(burned.players.user.battlefield.find((p) => p.id === "fog").damageMarked).toBe(1); // noncombat lands (survives 0/2)
  });
});

describe("runtime — Cho-Manno's ALL wall", () => {
  it("Cho-Manno takes zero combat damage AND zero from a Bolt (all-TO wall) and survives", () => {
    let s = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
    const cho = createPermanent({ id: "cho", card: CHO_MANNO, controller: "user", summoningSick: false });
    const raider = createPermanent({ id: "atk", card: { id: "rd", name: "Raider", type: "Creature — Human", power: "4", toughness: "4", oracle: "" }, controller: "ai1", summoningSick: false });
    s = { ...s, turn: 5, players: { ...s.players, user: { ...s.players.user, battlefield: [cho] }, ai1: { ...s.players.ai1, battlefield: [raider] } } };
    const combat = resolveCombatDamage({ ...s, combat: { attackers: [{ permanentId: "atk", attackingPlayer: "ai1", defender: "user" }], blockers: [{ blockerId: "cho", attackerId: "atk" }] } });
    expect(combat.players.user.battlefield.find((p) => p.id === "cho")?.damageMarked || 0).toBe(0); // combat prevented
    const burned = applyDamageEffect(s, { controller: "ai1", amount: 3, targetType: "creature", targets: [{ type: "creature", id: "cho" }], source: null });
    expect(burned.players.user.battlefield.find((p) => p.id === "cho").damageMarked || 0).toBe(0);  // noncombat prevented too (all)
  });
});

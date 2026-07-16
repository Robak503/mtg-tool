/**
 * thornAssign.test.js — BLITZ TE-1 (CR 508.1h): "You may have this creature assign its combat damage
 * as though it weren't blocked." (Thorn Elemental / Deathcoil Wurm / Pride of Lions / Wolf Pack /
 * Lone Wolf). combatResolution routes the blocked attacker's FULL power to the defending player —
 * the deterministic take of the printed MAY (always legal, and the entire point of the card); its
 * blockers still deal back normally. Real oracle fixtures (bundled Scryfall, verified 2026-07-16).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { resolveCombatDamage } from "./combatResolution.js";
import { mayAssignAsUnblocked } from "./combatEvasion.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const THORN_ELEMENTAL = { id: "te", name: "Thorn Elemental", type: "Creature — Elemental", power: "7", toughness: "7", mana: "{5}{G}{G}",
  oracle: "You may have this creature assign its combat damage as though it weren't blocked." };

describe("reader + classify", () => {
  it("the line reads; the five bodies flip native-body", () => {
    expect(mayAssignAsUnblocked(THORN_ELEMENTAL)).toBe(true);
    expect(mayAssignAsUnblocked({ oracle: "Trample" })).toBe(false);
    expect(classifyCard(THORN_ELEMENTAL)).toBe("native-body");
  });
});

describe("runtime — blocked, yet the player takes it all", () => {
  it("the blocked Thorn deals 7 to the defender; the blocker takes 0 but deals back", () => {
    let s = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
    const thorn = createPermanent({ id: "te", card: THORN_ELEMENTAL, controller: "user", summoningSick: false });
    const wall = createPermanent({ id: "wl", card: { id: "wc", name: "Big Wall", type: "Creature — Wall", power: "2", toughness: "9", oracle: "" }, controller: "ai1", summoningSick: false });
    s = { ...s, turn: 5, players: { ...s.players, user: { ...s.players.user, battlefield: [thorn] }, ai1: { ...s.players.ai1, battlefield: [wall] } } };
    const before = s.players.ai1.life;
    const after = resolveCombatDamage({ ...s, combat: {
      attackers: [{ permanentId: "te", attackingPlayer: "user", defender: "ai1" }],
      blockers: [{ blockerId: "wl", blockingPlayer: "ai1", attackerId: "te" }],
    } });
    expect(before - after.players.ai1.life).toBe(7);                                        // full power to the player
    expect(after.players.ai1.battlefield.find((p) => p.id === "wl").damageMarked || 0).toBe(0); // nothing assigned to the blocker
    expect(after.players.user.battlefield.find((p) => p.id === "te").damageMarked || 0).toBe(2); // the blocker dealt back
  });
});

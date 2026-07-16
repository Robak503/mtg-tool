/**
 * fogAndPreventionWalls.test.js — BLITZ FOG-1 (CR 615): (a) the FOG flag — "Prevent all combat
 * damage that would be dealt [to players] this turn" sets state.fogThisTurn (turn-stamped
 * self-expiry) and the combat funnel zeroes the matching deals; (b) the SELF prevention walls —
 * "Prevent all [combat] damage that would be dealt to this creature" read per hit: the COMBAT form
 * (Guard Gomazoa) still takes a Bolt; the ALL form (Dawn Elemental) takes neither.
 * Real oracle fixtures (bundled Scryfall, verified 2026-07-16).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { parseEffectClause } from "./effects/parser.js";
import { runEffectProgram } from "./effects/runProgram.js";
import { applyDamageEffect } from "./spellEffects.js";
import { resolveCombatDamage } from "./combatResolution.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const GOMAZOA = { id: "gg", name: "Guard Gomazoa", type: "Creature — Jellyfish", mana: "{1}{U}",
  power: "1", toughness: "3", oracle: "Defender, flying\nPrevent all combat damage that would be dealt to this creature." };
const DAWN_ELEMENTAL = { id: "de", name: "Dawn Elemental", type: "Creature — Elemental", mana: "{W}{W}{W}{W}",
  power: "3", toughness: "3", oracle: "Flying\nPrevent all damage that would be dealt to this creature." };
const DEFEND_THE_HEARTH = { id: "dth", name: "Defend the Hearth", type: "Instant", mana: "{1}{G}",
  oracle: "Prevent all combat damage that would be dealt to players this turn." };

describe("parse + classify", () => {
  it("the players-fog rides the incumbent fog op; the wall creatures flip native-static; the fog spell flips native-spell", () => {
    // The bare whole-turn form stays the incumbent misc.js fog atom (pinned in fog.test.js); FOG-1b
    // adds only the players scope, riding the SAME op so the AI-F5 fog hold policy covers it.
    expect(parseEffectClause("prevent all combat damage that would be dealt to players this turn", "Instant").atoms)
      .toEqual([{ op: "fog", scope: "players", targetType: null }]);
    expect(classifyCard(GOMAZOA)).toBe("native-static");
    expect(classifyCard(DAWN_ELEMENTAL)).toBe("native-static");
    expect(classifyCard(DEFEND_THE_HEARTH)).toBe("native-spell");
  });
});

describe("runtime", () => {
  function combatBoard() {
    let s = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
    const raider = createPermanent({ id: "atk", card: { id: "rd", name: "Raider", type: "Creature — Human", power: "4", toughness: "4", oracle: "" }, controller: "ai1", summoningSick: false });
    s = { ...s, turn: 5, players: { ...s.players, ai1: { ...s.players.ai1, battlefield: [raider] } } };
    return s;
  }

  it("the PLAYERS fog spares the face but creature-vs-creature combat still lands; stale next turn", () => {
    let s = combatBoard();
    const blocker = createPermanent({ id: "blk", card: { id: "bk", name: "Wall", type: "Creature — Wall", power: "0", toughness: "6", oracle: "" }, controller: "user", summoningSick: false });
    s = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [blocker] } } };
    s = runEffectProgram(s, { source: { name: "Defend the Hearth" }, payload: { params: { program: { atoms: [{ op: "fog", scope: "players", targetType: null }] }, controller: "user", targets: [], sourceId: null } } });
    const before = s.players.user.life;
    // Unblocked attacker + a separate blocked one would need two attackers; assert both halves in one combat:
    // the blocked raider marks the wall (creature combat lands) while a face hit would be zeroed — run the
    // unblocked case separately.
    const blocked = resolveCombatDamage({ ...s, combat: { attackers: [{ permanentId: "atk", attackingPlayer: "ai1", defender: "user" }], blockers: [{ blockerId: "blk", attackerId: "atk" }] } });
    expect(blocked.players.user.battlefield.find((p) => p.id === "blk").damageMarked).toBe(4);
    const unblocked = resolveCombatDamage({ ...s, combat: { attackers: [{ permanentId: "atk", attackingPlayer: "ai1", defender: "user" }], blockers: [] } });
    expect(unblocked.players.user.life).toBe(before); // face damage zeroed by the players fog
    // Next turn the stamp no longer matches: full face damage.
    const stale = resolveCombatDamage({ ...s, turn: 6, combat: { attackers: [{ permanentId: "atk", attackingPlayer: "ai1", defender: "user" }], blockers: [] } });
    expect(stale.players.user.life).toBe(before - 4);
  });

  it("Gomazoa's COMBAT wall blocks combat but takes a Bolt; Dawn Elemental's ALL wall takes neither", () => {
    let s = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
    const gom = createPermanent({ id: "gperm", card: GOMAZOA, controller: "user", summoningSick: false });
    const dawn = createPermanent({ id: "dperm", card: DAWN_ELEMENTAL, controller: "user", summoningSick: false });
    const raider = createPermanent({ id: "atk", card: { id: "rd", name: "Raider", type: "Creature — Human", power: "4", toughness: "4", oracle: "" }, controller: "ai1", summoningSick: false });
    s = { ...s, turn: 5, players: { ...s.players, user: { ...s.players.user, battlefield: [gom, dawn] }, ai1: { ...s.players.ai1, battlefield: [raider] } } };
    // Combat: Gomazoa blocks the 4-power raider — no marks land on it.
    const combat = resolveCombatDamage({ ...s, combat: { attackers: [{ permanentId: "atk", attackingPlayer: "ai1", defender: "user" }], blockers: [{ blockerId: "gperm", attackerId: "atk" }] } });
    expect(combat.players.user.battlefield.find((p) => p.id === "gperm").damageMarked || 0).toBe(0);
    // Non-combat: the burn lands on Gomazoa (combat-only wall; 2 damage on the 1/3 so it survives to be
    // inspected) but NOT on Dawn Elemental (all wall).
    let burned = applyDamageEffect(s, { controller: "ai1", amount: 2, targetType: "creature", targets: [{ type: "creature", id: "gperm" }], source: null });
    expect(burned.players.user.battlefield.find((p) => p.id === "gperm").damageMarked).toBe(2);
    burned = applyDamageEffect(burned, { controller: "ai1", amount: 3, targetType: "creature", targets: [{ type: "creature", id: "dperm" }], source: null });
    expect(burned.players.user.battlefield.find((p) => p.id === "dperm").damageMarked || 0).toBe(0);
  });
});

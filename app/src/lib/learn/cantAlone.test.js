/**
 * cantAlone.test.js — BLITZ SM-2 (CR 508.1h / 509.1a): "This creature can't attack or block alone."
 * (Mogg Flunkies / Loyal Pegasus / Ember Beast / Bonded Horncrest / Jackal Familiar). Enforced at BOTH
 * declaration gates in legalChoices: the creature is offered as an attacker/blocker only once ANOTHER
 * attacker/blocker is already declared this combat — declaration is sequential in this engine, so the
 * gate is exact-conservative (a lone can't-alone creature is never offerable; the AI's per-tick re-offer
 * sweeps it in once a teammate is declared). Real oracle fixtures (bundled Scryfall, verified 2026-07-16).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { cantAttackOrBlockAlone, isEnforcedEvasionClause } from "./combatEvasion.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const MOGG_FLUNKIES = { id: "mf", name: "Mogg Flunkies", type: "Creature — Goblin", power: "3", toughness: "3", mana: "{1}{R}",
  oracle: "This creature can't attack or block alone." };
const WOJEK_BODYGUARD = { id: "wb", name: "Wojek Bodyguard", type: "Creature — Human Soldier", power: "3", toughness: "3", mana: "{2}{R}",
  oracle: "Mentor (Whenever this creature attacks, put a +1/+1 counter on target attacking creature with lesser power.)\nThis creature can't attack or block alone." };

describe("reader + classify", () => {
  it("the reader and the evasion-clause admission see the printed line (creature + granted-token wording)", () => {
    expect(cantAttackOrBlockAlone(MOGG_FLUNKIES)).toBe(true);
    expect(cantAttackOrBlockAlone({ oracle: "This token can't attack or block alone." })).toBe(true);
    expect(cantAttackOrBlockAlone({ oracle: "Flying" })).toBe(false);
    // (isEnforcedEvasionClause takes pre-lowercased clauses — the isKeywordOnly caller's convention.)
    expect(isEnforcedEvasionClause("this creature can't attack or block alone")).toBe(true);
  });
  it("the pure bodies flip native-body; a mentor rider keeps the card parked (whole-card CREED)", () => {
    expect(classifyCard(MOGG_FLUNKIES)).toBe("native-body");
    expect(classifyCard(WOJEK_BODYGUARD)).toBe("body-only");
  });
});

describe("runtime — the two declaration gates", () => {
  function board(step) {
    let s = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
    const flunkies = createPermanent({ id: "mf", card: MOGG_FLUNKIES, controller: "user", summoningSick: false });
    const buddy = createPermanent({ id: "bd", card: { id: "gb", name: "Grizzly Bears", type: "Creature — Bear", power: "2", toughness: "2", oracle: "" }, controller: "user", summoningSick: false });
    return { ...s, turn: 4, phase: "combat", step, activePlayer: "user", priorityHolder: "user",
      combat: { attackers: [], blockers: [] },
      players: { ...s.players, user: { ...s.players.user, battlefield: [flunkies, buddy] } } };
  }

  it("attack: not offered alone; offered once a teammate is declared", () => {
    const s = board("declare-attackers");
    const offered = (st) => legalActionsForPlayer(st, "user").filter((a) => a.kind === "declare-attacker").map((a) => a.permanentId);
    expect(new Set(offered(s))).toEqual(new Set(["bd"])); // Flunkies suppressed while nothing is declared (one offer per defender face)
    const after = { ...s, combat: { attackers: [{ permanentId: "bd", attackingPlayer: "user", defender: "ai1" }], blockers: [] } };
    expect(offered(after)).toContain("mf"); // teammate declared → Flunkies may join
  });

  it("block: not offered alone; offered once another blocker is declared", () => {
    let s = board("declare-blockers");
    // The USER defends: ai1 attacks with two raiders.
    const r1 = createPermanent({ id: "r1", card: { id: "rc", name: "Raider", type: "Creature — Human", power: "2", toughness: "2", oracle: "" }, controller: "ai1", summoningSick: false });
    const r2 = createPermanent({ id: "r2", card: { id: "rc2", name: "Raider Two", type: "Creature — Human", power: "2", toughness: "2", oracle: "" }, controller: "ai1", summoningSick: false });
    s = { ...s, activePlayer: "ai1", priorityHolder: "user",
      combat: { attackers: [{ permanentId: "r1", attackingPlayer: "ai1", defender: "user" }, { permanentId: "r2", attackingPlayer: "ai1", defender: "user" }], blockers: [] },
      players: { ...s.players, ai1: { ...s.players.ai1, battlefield: [r1, r2] } } };
    const offered = (st) => legalActionsForPlayer(st, "user").filter((a) => a.kind === "declare-blocker").map((a) => a.permanentId);
    expect(offered(s)).toEqual(expect.arrayContaining(["bd"]));
    expect(offered(s)).not.toContain("mf"); // suppressed while no blocker is declared
    const after = { ...s, combat: { ...s.combat, blockers: [{ blockerId: "bd", blockingPlayer: "user", attackerId: "r1" }] } };
    expect(offered(after)).toContain("mf"); // another blocker declared → Flunkies may block
  });
});

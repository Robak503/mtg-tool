/**
 * aiCombatRoleActivation.test.js — ④-AP (2026-09-04 night): the AI USES the combat window ④-AE opened. The generic
 * activation picker skips every targeted activation, so an AI D'Avenant Archer never shot and an AI Infantry Veteran never
 * pumped. pickCombatRoleActivation takes exactly the combat-role abilities and places them on the provably-right side:
 * an enemy-facing atom on the biggest creature attacking the AI (or blocking its attacker), an own-facing atom on the
 * AI's own biggest creature in combat. Never the wrong side, never outside combat. Real oracle fixtures (bundled Scryfall
 * snapshot, read in-session 2026-09-04).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { pickAction } from "./opponentAI.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const ARCHER = { id: "c-da", name: "D'Avenant Archer", type: "Creature — Human Archer", mana: "{2}{W}", cmc: 3, power: 1, toughness: 2, keywords: [],
  oracle: "{T}: This creature deals 1 damage to target attacking or blocking creature." };
const VETERAN = { id: "c-iv", name: "Infantry Veteran", type: "Creature — Human Soldier", mana: "{W}", cmc: 1, power: 1, toughness: 1, keywords: [],
  oracle: "{T}: Target attacking creature gets +1/+1 until end of turn." };

const bear = (id, name, controller, power = 2) => createPermanent({ id, card: { id: `card-${id}`, name, type: "Creature — Bear", mana: "{1}{G}", cmc: 2, power, toughness: 4, keywords: [], oracle: "" }, controller, summoningSick: false });
const pick = (s) => pickAction(s, "ai", legalActionsForPlayer(s, "ai"));

/** The USER attacks the AI with `attackers`; the AI (defending, holding priority in declare-blockers, nothing to block with) has `aiPerms`. */
function userAttacks(attackers, aiPerms) {
  const s0 = createGameState({ userDeck: [], aiDeck: [] });
  return { ...s0, turn: 6, phase: "declare-blockers", step: "declare-blockers", activePlayer: "user", priorityHolder: "ai", consecutivePasses: 0,
    combat: { attackers: attackers.map((a) => ({ permanentId: a.id, attackingPlayer: "user", defender: "ai" })), blockers: [] },
    players: { ...s0.players,
      user: { ...s0.players.user, battlefield: attackers },
      ai: { ...s0.players.ai, battlefield: aiPerms, manaPool: { W: 1, U: 0, B: 0, R: 0, G: 0, C: 0 } } } };
}

describe("the archer shoots", () => {
  it("⭐ the AI, attacked by a 2/4 and a 4/4, picks D'Avenant Archer at the 4/4", () => {
    const s = userAttacks([bear("small", "Small", "user", 2), bear("big", "Big", "user", 4)], [createPermanent({ id: "archer", card: ARCHER, controller: "ai", summoningSick: false })]);
    const a = pick(s);
    expect(a).toMatchObject({ kind: "activate-ability", permanentId: "archer" });
    expect(a.targets[0].id).toBe("big");
  });

  it("⛔ an OWN-facing pump is never placed on the enemy's attacker — Infantry Veteran stays unactivated when the only legal target is the user's attacker", () => {
    const s = userAttacks([bear("atk", "Attacker", "user", 3)], [createPermanent({ id: "vet", card: VETERAN, controller: "ai", summoningSick: false })]);
    const a = pick(s);
    expect(a?.kind === "activate-ability" && a.permanentId === "vet").toBe(false);
  });
});

describe("an enemy-facing atom never lands on the AI's own creature", () => {
  it("⛔ the AI attacks with a 4/4, the user blocks with a 2/4: the archer ('attacking or blocking') shoots the BLOCKER, never its own bigger attacker", () => {
    const s0 = createGameState({ userDeck: [], aiDeck: [] });
    const s = { ...s0, turn: 7, phase: "declare-blockers", step: "declare-blockers", activePlayer: "ai", priorityHolder: "ai", consecutivePasses: 0,
      combat: { attackers: [{ permanentId: "mine", attackingPlayer: "ai", defender: "user" }], blockers: [{ blockerId: "blk", attackerId: "mine" }] },
      players: { ...s0.players,
        user: { ...s0.players.user, battlefield: [bear("blk", "Blocker", "user", 2)] },
        ai: { ...s0.players.ai, battlefield: [{ ...bear("mine", "Mine", "ai", 4), attackedThisTurn: true }, createPermanent({ id: "archer", card: ARCHER, controller: "ai", summoningSick: false })], manaPool: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 } } } };
    const acts = legalActionsForPlayer(s, "ai");
    expect(acts.filter((a) => a.kind === "activate-ability" && a.permanentId === "archer").map((a) => a.targets[0].id).sort()).toEqual(["blk", "mine"]); // both are legal targets
    const a = pickAction(s, "ai", acts);
    expect(a).toMatchObject({ kind: "activate-ability", permanentId: "archer" });
    expect(a.targets[0].id).toBe("blk");
  });
});

describe("the pumper pumps its own", () => {
  it("⭐ the AI attacking with a Bear, holding priority after the declaration, pumps its own attacker with Infantry Veteran", () => {
    const s0 = createGameState({ userDeck: [], aiDeck: [] });
    const s = { ...s0, turn: 7, phase: "declare-attackers", step: "declare-attackers", activePlayer: "ai", priorityHolder: "ai", consecutivePasses: 0,
      combat: { attackers: [{ permanentId: "mine", attackingPlayer: "ai", defender: "user" }], blockers: [] },
      players: { ...s0.players,
        user: { ...s0.players.user, battlefield: [bear("theirs", "Theirs", "user", 2)] },
        ai: { ...s0.players.ai, battlefield: [{ ...bear("mine", "Mine", "ai", 3), attackedThisTurn: true }, createPermanent({ id: "vet", card: VETERAN, controller: "ai", summoningSick: false })], manaPool: { W: 1, U: 0, B: 0, R: 0, G: 0, C: 0 } } } };
    const acts = legalActionsForPlayer(s, "ai");
    const vetActs = acts.filter((a) => a.kind === "activate-ability" && a.permanentId === "vet");
    expect(vetActs.map((a) => a.targets[0].id)).toEqual(["mine"]);
    const a = pickAction(s, "ai", acts.filter((x) => x.kind !== "declare-attacker"));
    expect(a).toMatchObject({ kind: "activate-ability", permanentId: "vet" });
    expect(a.targets[0].id).toBe("mine");
  });
});

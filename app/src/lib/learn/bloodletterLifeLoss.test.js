/**
 * bloodletterLifeLoss.test.js — Bloodletter of Aclazotz (EDHREC #857; the play-weighted program, phase 2):
 *
 *   "Flying
 *    If an opponent would lose life during your turn, they lose twice that much life instead. (Damage causes loss of life.)"
 *
 * A LIFE-LOSS replacement (CR 614.1a), not a damage one: the damage is unchanged — the card's ruling: "a 1/1 creature with lifelink
 * deals combat damage to an opponent on your turn, they would lose 2 life, but you'd still gain only 1 life" — and so are
 * commander damage and the damage-taken tally. Every life loss reaches gameState.loseLife (damage, drains, paid life — paying life
 * IS losing it, CR 119.4), so the replacement lives there: the losing player is an opponent of the permanent's controller and it is
 * that controller's turn.
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-10-17).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent, loseLife } from "./gameState.js";
import { resolveCombatDamage } from "./combatResolution.js";
import { applyDamageEffect } from "./spellEffects.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const BLOODLETTER = { name: "Bloodletter of Aclazotz", type: "Creature — Vampire Demon", mana: "{1}{B}{B}{B}", colors: ["B"], power: "2", toughness: "4", keywords: ["Flying"],
  oracle: "Flying\nIf an opponent would lose life during your turn, they lose twice that much life instead. (Damage causes loss of life.)" };
const NIGHTHAWK = { name: "Vampire Nighthawk", type: "Creature — Vampire Shaman", mana: "{1}{B}{B}", colors: ["B"], power: "2", toughness: "3", keywords: ["Deathtouch", "Flying", "Lifelink"],
  oracle: "Flying\nDeathtouch (Any amount of damage this deals to a creature is enough to destroy it.)\nLifelink (Damage dealt by this creature also causes you to gain that much life.)" };
const PYROMANCER = { name: "Prodigal Pyromancer", type: "Creature — Human Wizard", mana: "{2}{R}", colors: ["R"], power: "1", toughness: "1", keywords: [],
  oracle: "{T}: This creature deals 1 damage to any target." };
const PLAGUE_STINGER = { name: "Plague Stinger", type: "Creature — Phyrexian Insect Horror", mana: "{1}{B}", colors: ["B"], power: "1", toughness: "1", keywords: ["Flying", "Infect"],
  oracle: "Flying\nInfect (This creature deals damage to creatures in the form of -1/-1 counters and to players in the form of poison counters.)" };

const perm = (id, card, controller, extra = {}) => ({ ...createPermanent({ id, card: { ...card, id: `c-${id}` }, controller, summoningSick: false }), ...extra });
function board({ user = [], ai = [], active = "user" } = {}) {
  const g = createGameState({ userDeck: [], aiDeck: [] });
  return { ...g, turn: 3, activePlayer: active, priorityHolder: active, phase: "precombat-main", step: "main", stack: [], pendingTriggers: [],
    players: { ...g.players, user: { ...g.players.user, battlefield: user }, ai: { ...g.players.ai, battlefield: ai } } };
}
const lost = (before, after, pid) => before.players[pid].life - after.players[pid].life;

describe("⭐ Bloodletter of Aclazotz — an opponent's life loss on your turn is doubled", () => {
  it("⭐ a plain life loss (a drain, a paid cost — every loss reaches loseLife): 2 becomes 4", () => {
    const s = board({ user: [perm("bl", BLOODLETTER, "user")] });
    const after = loseLife(s, { playerId: "ai", amount: 2 });
    expect({ lost: lost(s, after, "ai"), lifeLostThisTurn: after.players.ai.lifeLostThisTurn }).toEqual({ lost: 4, lifeLostThisTurn: 4 });
  });
  it("⭐ noncombat damage: 1 damage, 2 life lost — the damage itself is 1 (the damage-taken tally)", () => {
    const s = board({ user: [perm("bl", BLOODLETTER, "user"), perm("pp", PYROMANCER, "user")] });
    const after = applyDamageEffect(s, { controller: "user", amount: 1, targets: [{ type: "player", id: "ai" }], source: s.players.user.battlefield[1] });
    expect({ lost: lost(s, after, "ai"), damageTaken: after.players.ai.damageTakenThisTurn }).toEqual({ lost: 2, damageTaken: 1 });
  });
  it("⭐ the ruling: a lifelink commander's 2 combat damage — the opponent loses 4, you gain 2, commander damage 2", () => {
    const nighthawk = perm("nh", { ...NIGHTHAWK, isCommander: true }, "user");
    const s = { ...board({ user: [perm("bl", BLOODLETTER, "user"), nighthawk] }), combat: { attackers: [{ permanentId: "nh", attackingPlayer: "user", defender: "ai" }], blockers: [] } };
    const after = resolveCombatDamage(s);
    const row = { oppLost: lost(s, after, "ai"), youGained: after.players.user.life - s.players.user.life, commanderDamage: after.players.ai.commanderDamageFrom?.["c-nh"] ?? 0, damageTaken: after.players.ai.damageTakenThisTurn };
    console.log(`WITNESS bloodletter-combat ${JSON.stringify(row)}`);
    expect(row).toEqual({ oppLost: 4, youGained: 2, commanderDamage: 2, damageTaken: 2 });
  });
  it("⭐ two Bloodletters: four times", () => {
    const s = board({ user: [perm("bl1", BLOODLETTER, "user"), perm("bl2", BLOODLETTER, "user")] });
    expect(lost(s, loseLife(s, { playerId: "ai", amount: 1 }), "ai")).toBe(4);
  });
  it("⭐ the opponent's Bloodletter on ITS controller's turn doubles your loss", () => {
    const s = board({ ai: [perm("bl", BLOODLETTER, "ai")], active: "ai" });
    expect(lost(s, loseLife(s, { playerId: "user", amount: 3 }), "user")).toBe(6);
  });
  it("control: on an OPPONENT's turn nothing is doubled", () => {
    const s = board({ user: [perm("bl", BLOODLETTER, "user")], active: "ai" });
    expect(lost(s, loseLife(s, { playerId: "ai", amount: 2 }), "ai")).toBe(2);
  });
  it("control: you — Bloodletter's controller — losing life on your own turn is not doubled", () => {
    const s = board({ user: [perm("bl", BLOODLETTER, "user")] });
    expect(lost(s, loseLife(s, { playerId: "user", amount: 2 }), "user")).toBe(2);
  });
  it("control: infect damage is poison, not life loss — unchanged", () => {
    const s = { ...board({ user: [perm("bl", BLOODLETTER, "user"), perm("ps", PLAGUE_STINGER, "user")] }), combat: { attackers: [{ permanentId: "ps", attackingPlayer: "user", defender: "ai" }], blockers: [] } };
    const after = resolveCombatDamage(s);
    expect({ lost: lost(s, after, "ai"), poison: after.players.ai.poison ?? after.players.ai.poisonCounters ?? 0 }).toEqual({ lost: 0, poison: 1 });
  });
  it("⭐ the card reads native", () => {
    expect(classifyCard(BLOODLETTER)).toBe("native-static");
  });
});

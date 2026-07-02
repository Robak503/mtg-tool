/**
 * CMD-PARTNER — two commanders (Partner / Partner-with / Background / Friends-forever). The command zone
 * is an ARRAY and `commandersOf` returns every "Commander"-section card, so a partner deck seats BOTH; the
 * per-commander tax (CMD-CAST, keyed by card id) + per-commander damage (CMD-DAMAGE) already track two
 * DIFFERENT commanders independently. This slice PROVES + PINS that two-commander pods play end-to-end —
 * no new mechanics, the framework already delivers it. Commander framework PR4.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { legalActionsForPlayer, filterActions } from "./legalChoices.js";
import { returnCommandersToZone } from "./learnSession.js";
import { _resetIdsForTests, createGameState, addCommanderDamage } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const A = () => ({ id: "pa", name: "Partner A", type: "Legendary Creature — Human Soldier", mana: "{1}{G}", oracle: "Partner", keywords: [] });
const B = () => ({ id: "pb", name: "Partner B", type: "Legendary Creature — Elf Warrior", mana: "{G}", oracle: "Partner", keywords: [] });

function podWithPartners({ commanders = [A(), B()], mana = { G: 6 } } = {}) {
  const base = createGameState({ userDeck: [], aiDeck: [], userCommanders: commanders });
  return {
    ...base, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
    players: { ...base.players, user: { ...base.players.user, manaPool: { ...base.players.user.manaPool, ...mana }, commanderCastCount: {} } },
  };
}
const cmdCasts = (s) => filterActions(legalActionsForPlayer(s, "user"), "cast-spell").filter(a => a.fromZone === "command");

describe("CMD-PARTNER — two commanders in the command zone", () => {
  it("seats BOTH partners, each tagged isCommander (CR 903.3)", () => {
    const s = createGameState({ userDeck: [], aiDeck: [], userCommanders: [A(), B()] });
    expect(s.players.user.command.map(c => c.name)).toEqual(["Partner A", "Partner B"]);
    expect(s.players.user.command.every(c => c.isCommander)).toBe(true);
  });

  it("offers BOTH as independent command-zone casts", () => {
    expect(cmdCasts(podWithPartners()).map(a => a.cardId).sort()).toEqual(["pa", "pb"]);
  });

  it("the {2} tax is PER-COMMANDER — casting one doesn't tax the other (CR 903.8)", () => {
    let s = podWithPartners();
    s = dispatchAction(s, cmdCasts(s).find(a => a.cardId === "pa"));
    expect(s.players.user.commanderCastCount).toEqual({ "user::pa": 1 });   // only A's cast count bumped (instance-keyed)
    expect(s.players.user.command.map(c => c.id)).toEqual(["pb"]);  // A left the zone; B still there
    s = resolveTopOfStack(s);                                        // A is on the stack — sorcery-speed B needs it empty
    const castB = cmdCasts(s).find(a => a.cardId === "pb");
    expect(castB).toBeTruthy();
    expect(castB.cost.generic).toBe(0); // {G}, untaxed — B has never been cast from the zone
  });

  it("commander damage is PER-COMMANDER — two partners' damage is NOT summed (CR 903.10a)", () => {
    let s = podWithPartners();
    s = addCommanderDamage(s, { commanderId: "pa", toPlayer: "ai", amount: 20 });
    s = addCommanderDamage(s, { commanderId: "pb", toPlayer: "ai", amount: 20 });
    expect(s.players.ai.commanderDamageFrom).toEqual({ pa: 20, pb: 20 }); // 40 total, but neither alone ≥ 21
    s = addCommanderDamage(s, { commanderId: "pa", toPlayer: "ai", amount: 1 });
    expect(s.players.ai.commanderDamageFrom.pa).toBe(21);                 // now A ALONE hits 21 → the loss
  });

  it("both partners return from the graveyard (CR 903.9a) — one per SBA tick", () => {
    let g = createGameState({ userDeck: [], aiDeck: [], aiCommanders: [A(), B()] });
    g = { ...g, players: { ...g.players, ai: { ...g.players.ai, command: [], graveyard: [{ ...A(), isCommander: true }, { ...B(), isCommander: true }] } } };
    g = returnCommandersToZone(g); // AI auto-returns the first
    g = returnCommandersToZone(g); // …then the second
    expect(g.players.ai.command.map(c => c.name).sort()).toEqual(["Partner A", "Partner B"]);
    expect(g.players.ai.graveyard).toHaveLength(0);
  });
});

describe("CMD-PARTNER — a Background (a non-creature commander pairs with a legendary creature)", () => {
  it("seats + casts a legendary creature + its Background", () => {
    const cmdr = { id: "cm", name: "Commander Creature", type: "Legendary Creature — Human", mana: "{1}{W}", oracle: "Choose a Background", keywords: [] };
    const bg = { id: "bg", name: "Cult of the Dragon", type: "Legendary Enchantment — Background", mana: "{1}{B}", oracle: "Commander creatures you own have menace.", keywords: [] };
    const s = podWithPartners({ commanders: [cmdr, bg], mana: { W: 3, B: 3 } });
    expect(s.players.user.command.map(c => c.name).sort()).toEqual(["Commander Creature", "Cult of the Dragon"]);
    expect(cmdCasts(s).map(a => a.cardId).sort()).toEqual(["bg", "cm"]); // both castable from the zone
  });
});

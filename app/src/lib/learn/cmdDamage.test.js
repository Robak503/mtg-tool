/**
 * CMD-DAMAGE (CR 903.10a) — commander COMBAT damage to a player accrues to the per-commander 21-rule
 * tracker (`commanderDamageFrom`, keyed by the source commander's card id). The tracker + the 21-loss SBA
 * (`isPlayerDead`) already existed; this wires combat to FEED it. Commander framework PR3 (builds on CMD-CAST).
 */
import { describe, it, expect } from "vitest";

import { createPermanent, createGameState, _resetIdsForTests } from "./gameState.js";
import { resolveCombatDamage } from "./combatResolution.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { pickAction } from "./opponentAI.js";

function commander(name, power, controller) {
  return createPermanent({ card: { id: `${name}-card`, name, power, toughness: power, type_line: "Legendary Creature — Avatar", isCommander: true, oracle: "" }, controller });
}
function creature(name, power, toughness, controller) {
  return createPermanent({ card: { id: `${name}-card`, name, power, toughness, type_line: "Creature", oracle: "" }, controller });
}
function makeState({ userBf = [], aiBf = [], aiDmg = {} } = {}, combat) {
  return {
    turn: 3, log: [],
    players: {
      user: { life: 40, battlefield: userBf, graveyard: [], commanderDamageFrom: {} },
      ai: { life: 40, battlefield: aiBf, graveyard: [], commanderDamageFrom: { ...aiDmg } },
    },
    combat,
  };
}
const attackAi = (permId) => ({ attackers: [{ permanentId: permId, attackingPlayer: "user", defender: "ai" }], blockers: [] });

describe("CMD-DAMAGE — combat feeds the per-commander 21-rule tracker", () => {
  it("an unblocked COMMANDER deals its power as commander damage, keyed by its card id", () => {
    const omnath = commander("Omnath", 5, "user");
    const out = resolveCombatDamage(makeState({ userBf: [omnath] }, attackAi(omnath.id)));
    expect(out.players.ai.life).toBe(35);                              // normal combat life loss
    expect(out.players.ai.commanderDamageFrom["Omnath-card"]).toBe(5); // + commander damage, per-commander
  });

  it("a NON-commander attacker deals NO commander damage", () => {
    const bear = creature("Bear", 3, 3, "user");
    const out = resolveCombatDamage(makeState({ userBf: [bear] }, attackAi(bear.id)));
    expect(out.players.ai.life).toBe(37);
    expect(out.players.ai.commanderDamageFrom).toEqual({}); // a normal creature carries no commanderId
  });

  it("a BLOCKED commander deals NO commander damage — only combat damage to the PLAYER counts (903.10a)", () => {
    const cmdr = commander("General", 4, "user");
    const wall = creature("Wall", 0, 5, "ai");
    const s = makeState({ userBf: [cmdr], aiBf: [wall] }, {
      attackers: [{ permanentId: cmdr.id, attackingPlayer: "user", defender: "ai" }],
      blockers: [{ blockerId: wall.id, blockingPlayer: "ai", attackerId: cmdr.id }],
    });
    const out = resolveCombatDamage(s);
    expect(out.players.ai.life).toBe(40);                       // blocked → no player damage
    expect(out.players.ai.commanderDamageFrom).toEqual({});     // and no commander damage
  });

  it("accumulates across combats — reaches the 21 threshold the SBA checks", () => {
    const cmdr = commander("Beater", 7, "user");
    let s = makeState({ userBf: [cmdr] }, attackAi(cmdr.id));
    for (let i = 0; i < 3; i++) {
      s = resolveCombatDamage(s);
      s = { ...s, combat: attackAi(cmdr.id) }; // re-declare the same commander as attacking
    }
    expect(s.players.ai.commanderDamageFrom["Beater-card"]).toBe(21); // 7×3 — isPlayerDead(...,"ai") would now be true
  });

  it("N4: an unblocked commander hit logs a commander-damage event whose total matches the tracker", () => {
    const omnath = commander("Omnath", 5, "user");
    const out = resolveCombatDamage(makeState({ userBf: [omnath] }, attackAi(omnath.id)));
    const entry = out.log.find(e => e.kind === "commander-damage");
    expect(entry).toBeTruthy();
    expect(entry.commanderId).toBe("Omnath-card");
    expect(entry.commanderName).toBe("Omnath");
    expect(entry.defender).toBe("ai");
    expect(entry.amount).toBe(5);
    expect(entry.total).toBe(out.players.ai.commanderDamageFrom["Omnath-card"]); // total tracks the live tracker
  });

  it("N4: repeated hits log a growing running total, culminating at the lethal 21", () => {
    const cmdr = commander("Beater", 7, "user");
    let s = makeState({ userBf: [cmdr] }, attackAi(cmdr.id));
    const totals = [];
    for (let i = 0; i < 3; i++) {
      s = resolveCombatDamage(s);
      const entry = s.log.filter(e => e.kind === "commander-damage").at(-1);
      totals.push(entry.total);
      s = { ...s, combat: attackAi(cmdr.id) };
    }
    expect(totals).toEqual([7, 14, 21]); // running total reaches the 903.10a lethal threshold
  });

  it("a NON-commander attacker logs no commander-damage event", () => {
    const bear = creature("Bear", 3, 3, "user");
    const out = resolveCombatDamage(makeState({ userBf: [bear] }, attackAi(bear.id)));
    expect(out.log.some(e => e.kind === "commander-damage")).toBe(false);
  });

  it("a commander that DIES trading still records the trample damage it dealt (event-based accrual)", () => {
    // 5-power commander with trample, blocked by a 4/1: 1 lethal to the blocker, 4 trample to the player;
    // the commander takes 4 back (survives here) — point is the trample-to-player accrues commander damage.
    const cmdr = createPermanent({ card: { id: "Tramp-card", name: "Tramp", power: 5, toughness: 5, type_line: "Legendary Creature", isCommander: true, oracle: "Trample" }, controller: "user" });
    const chump = creature("Chump", 4, 1, "ai");
    const s = makeState({ userBf: [cmdr], aiBf: [chump] }, {
      attackers: [{ permanentId: cmdr.id, attackingPlayer: "user", defender: "ai" }],
      blockers: [{ blockerId: chump.id, blockingPlayer: "ai", attackerId: cmdr.id }],
    });
    const out = resolveCombatDamage(s);
    expect(out.players.ai.commanderDamageFrom["Tramp-card"]).toBe(4); // trample excess (5 − 1 lethal) as commander damage
  });
});

describe("CMD-DAMAGE — the AI prioritizes casting its commander", () => {
  it("picks the command-zone cast over a cheaper non-commander creature", () => {
    _resetIdsForTests();
    const CMDR = { id: "cmdr", name: "AI General", type: "Legendary Creature — Avatar", mana: "{2}{G}", oracle: "", keywords: [] };
    const bear = { id: "bear", name: "Bear", type: "Creature — Bear", mana: "{1}{G}", oracle: "", keywords: [] };
    const base = createGameState({ userDeck: [], aiDeck: [], aiCommanders: [CMDR] });
    const s = {
      ...base, phase: "precombat-main", step: "main", activePlayer: "ai", priorityHolder: "ai", consecutivePasses: 0,
      players: { ...base.players, ai: { ...base.players.ai, hand: [bear], manaPool: { ...base.players.ai.manaPool, G: 5 }, commanderCastCount: { cmdr: 0 } } },
    };
    const chosen = pickAction(s, "ai", legalActionsForPlayer(s, "ai"));
    expect(chosen).toBeTruthy();
    expect(chosen.kind).toBe("cast-spell");
    expect(chosen.cardId).toBe("cmdr");      // the commander, not the cheaper Bear
    expect(chosen.fromZone).toBe("command");
  });
});

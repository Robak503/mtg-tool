/**
 * Combat-damage-to-a-player trigger event (CR 510.2 / 510.3a) — "Whenever <self / a creature you control>
 * deals combat damage to a player, <effect>". detectTriggers recognizes the bare shape; combatResolution
 * fires it off the real per-attacker player-damage, BEFORE the lethal SBA (a trading attacker still
 * triggers). The effect rides the existing flush → EffectProgram compiler. Engine-first: the trigger
 * must actually fire + resolve, or the card is a false positive.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { detectTriggers } from "./triggers.js";
import { resolveCombatDamage } from "./combatResolution.js";
import { flushTriggers, resolveTopOfStack, chooseTriggerTargets } from "./gameEngine.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const cdEvents = (oracle) => detectTriggers({ name: "X", type: "Creature — Pirate", oracle }).filter((d) => d.event === "combatDamageToPlayer");
const TREASURE_ORACLE = "Whenever this creature deals combat damage to a player, create a Treasure token.";
const pirate = (id, oracle) => createPermanent({ id, card: { id: `c-${id}`, name: "Treasure Pirate", type: "Creature — Pirate", power: 2, toughness: 2, oracle }, controller: "user", summoningSick: false });

function st(userBf, aiBf = [], attackers = [], blockers = []) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...s, step: "combat-damage", phase: "combat", combat: { attackers, blockers },
    players: { ...s.players, user: { ...s.players.user, battlefield: userBf, life: 40 }, ai: { ...s.players.ai, battlefield: aiBf, life: 40 } },
  };
}
function resolveAll(s) { let st = s, g = 0; while ((st.stack || []).length && g++ < 25) st = resolveTopOfStack(st); return st; }
const treasureCount = (s, pid) => s.players[pid].battlefield.filter((pm) => /treasure/i.test(pm.card?.type || pm.card?.name || "")).length;

describe("combat-damage-to-a-player — detection", () => {
  it("detects the bare self + creature-you-control shapes", () => {
    expect(cdEvents(TREASURE_ORACLE)[0]).toMatchObject({ event: "combatDamageToPlayer", scope: "self" });
    expect(cdEvents("Whenever a creature you control deals combat damage to a player, draw a card.")[0]).toMatchObject({ scope: "creatureYouControl" });
  });
  it("does NOT detect qualified / batch / wrong-object variants (safe false-negative)", () => {
    expect(cdEvents("Whenever this creature deals combat damage to a creature, draw a card.")).toHaveLength(0);
    expect(cdEvents("Whenever this creature deals combat damage to a player or planeswalker, draw a card.")).toHaveLength(0);
    expect(cdEvents("Whenever one or more creatures you control deal combat damage to a player, create a Treasure token.")).toHaveLength(0);
  });
});

describe("combat-damage-to-a-player — classification flips body-only -> native-trigger", () => {
  it("a bare combat-damage->Treasure creature is native-trigger", () => {
    expect(classifyCard({ type: "Creature — Pirate", name: "Treasure Pirate", oracle: TREASURE_ORACLE })).toBe("native-trigger");
    expect(classifyCard({ type: "Creature — Pirate", name: "Menace Pirate", oracle: `Menace\n${TREASURE_ORACLE}` })).toBe("native-trigger");
  });
});

describe("combat-damage-to-a-player — engine-first: the trigger fires + resolves", () => {
  it("an unblocked attacker dealing player damage creates a Treasure", () => {
    let s = st([pirate("p", TREASURE_ORACLE)], [], [{ permanentId: "p", attackingPlayer: "user", defender: "ai" }], []);
    s = resolveCombatDamage(s);
    expect(s.players.ai.life).toBe(38);                 // 2 combat damage landed on the player
    s = resolveAll(flushTriggers(s, { chooseTargets: chooseTriggerTargets }));
    expect(treasureCount(s, "user")).toBe(1);           // the trigger made a Treasure for the attacker's controller
  });

  it("a BLOCKED attacker (no player damage) does NOT trigger", () => {
    const wall = createPermanent({ id: "w", card: { id: "cw", name: "Wall", type: "Creature — Wall", power: 0, toughness: 4, oracle: "" }, controller: "ai", summoningSick: false });
    let s = st([pirate("p", TREASURE_ORACLE)], [wall], [{ permanentId: "p", attackingPlayer: "user", defender: "ai" }], [{ blockerId: "w", blockingPlayer: "ai", attackerId: "p" }]);
    s = resolveCombatDamage(s);
    expect(s.players.ai.life).toBe(40);                 // blocked → no player damage
    s = resolveAll(flushTriggers(s, { chooseTargets: chooseTriggerTargets }));
    expect(treasureCount(s, "user")).toBe(0);           // no player damage → no trigger
  });
});

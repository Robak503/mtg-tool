/**
 * Combat-damage-to-a-player trigger event (CR 510.2 / 510.3a) — "Whenever <self / a creature you control>
 * deals combat damage to a player, <effect>". detectTriggers recognizes the bare shape; combatResolution
 * fires it off the real per-attacker player-damage, BEFORE the lethal SBA (a trading attacker still
 * triggers). The effect rides the existing flush → EffectProgram compiler. Engine-first: the trigger
 * must actually fire + resolve, or the card is a false positive.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { detectTriggers, checkDiesTriggers } from "./triggers.js";
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
  it("detects the SUBTYPE shape ('a Dinosaur you control deals combat damage to a player') → subtypeYouControl", () => {
    // Tribal payoffs (Curious Altisaur, Seafloor Oracle, Zeriam) — a single-word subtype filter reusing
    // the subtypeYouControl scope. The captured subtype rides as subtypeFilter.
    expect(cdEvents("Whenever a Dinosaur you control deals combat damage to a player, draw a card.")[0])
      .toMatchObject({ event: "combatDamageToPlayer", scope: "subtypeYouControl", subtypeFilter: "Dinosaur" });
    expect(cdEvents("Whenever a Merfolk you control deals combat damage to a player, draw a card.")[0])
      .toMatchObject({ scope: "subtypeYouControl", subtypeFilter: "Merfolk" });
  });
});

describe("combat-damage-to-a-player — SUBTYPE tribal payoffs flip native-trigger", () => {
  const C = (type, oracle) => ({ type, oracle, mana: "{5}{G}", name: "X", power: "5", toughness: "5" });
  it("Curious Altisaur (Dinosaur → draw) and a Merfolk-draw both classify native-trigger", () => {
    expect(classifyCard(C("Creature — Dinosaur", "Vigilance, reach\nWhenever a Dinosaur you control deals combat damage to a player, draw a card."))).toBe("native-trigger");
    expect(classifyCard(C("Creature — Merfolk Wizard", "Whenever a Merfolk you control deals combat damage to a player, draw a card."))).toBe("native-trigger");
  });
  it("a SUBTYPE combat-damage trigger fires + resolves end-to-end for a matching attacker", () => {
    const altisaur = pirate("alt", "Whenever a Dinosaur you control deals combat damage to a player, draw a card.");
    altisaur.card.type = "Creature — Dinosaur"; // the watcher is itself a Dinosaur (self + subtype both match)
    let s = st([altisaur], [], [{ permanentId: "alt", attackingPlayer: "user", defender: "ai" }], []);
    s = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [altisaur], library: [{ id: "lib1", name: "Drawn", type: "Instant", oracle: "" }] } } };
    s = resolveCombatDamage(s);
    expect(s.players.ai.life).toBe(38);                  // 2 combat damage landed → the trigger condition met
    s = resolveAll(flushTriggers(s, { chooseTargets: chooseTriggerTargets }));
    expect(s.players.user.hand.some((c) => c.id === "lib1")).toBe(true); // the subtype trigger's draw resolved
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

// BATCH combat-damage (CR 510.4) — "Whenever one or more creatures you control deal combat damage to a
// player, <effect>" fires ONCE per combat, not per attacker. Runtime value (the trigger FIRES in-game for
// the ~31 treasure/Food/investigate payoffs — Grim Hireling, Professional Face-Breaker in Colton's Vihaan
// deck); most carry other unmodeled abilities so classifyCard stays body-only (metric ≠ playability).
describe("BATCH combat-damage trigger (one or more creatures …)", () => {
  const GRIM = "Whenever one or more creatures you control deal combat damage to a player, create two Treasure tokens.";
  const batchPerm = (id, oracle) => createPermanent({ id, card: { id: `c-${id}`, name: "Grim", type: "Creature — Human", power: 1, toughness: 1, oracle }, controller: "user", summoningSick: false });
  const beast = (id, p = 3) => createPermanent({ id, card: { id: `c-${id}`, name: id, type: "Creature — Beast", power: p, toughness: 3, oracle: "" }, controller: "user", summoningSick: false });

  it("detects the batch shape as the combatDamageBatch event (distinct from per-attacker)", () => {
    expect(detectTriggers({ name: "Grim", type: "Creature — Human", oracle: GRIM })[0]).toMatchObject({ event: "combatDamageBatch", scope: "you" });
    // a qualified variant stays undetected (safe false-negative)
    expect(detectTriggers({ name: "X", type: "Creature", oracle: "Whenever one or more creatures you control deal combat damage to a player or planeswalker, draw a card." })).toHaveLength(0);
  });

  it("fires ONCE for the whole batch — two attackers connecting make 2 Treasures, not 4", () => {
    let s = st([batchPerm("gh", GRIM), beast("a1"), beast("a2")], [],
      [{ permanentId: "a1", attackingPlayer: "user", defender: "ai" }, { permanentId: "a2", attackingPlayer: "user", defender: "ai" }], []);
    s = resolveCombatDamage(s);
    expect(s.players.ai.life).toBe(34);                 // 6 damage from 2 attackers
    s = resolveAll(flushTriggers(s, { chooseTargets: chooseTriggerTargets }));
    expect(treasureCount(s, "user")).toBe(2);           // "create TWO Treasures" fired ONCE (not 2× per attacker = 4)
  });

  it("does NOT fire when no creature you control connects (all blocked)", () => {
    const wall = createPermanent({ id: "w", card: { id: "cw", name: "Wall", type: "Creature — Wall", power: 0, toughness: 4, oracle: "" }, controller: "ai", summoningSick: false });
    let s = st([batchPerm("gh", GRIM), beast("a1")], [wall],
      [{ permanentId: "a1", attackingPlayer: "user", defender: "ai" }], [{ blockerId: "w", blockingPlayer: "ai", attackerId: "a1" }]);
    s = resolveCombatDamage(s);
    s = resolveAll(flushTriggers(s, { chooseTargets: chooseTriggerTargets }));
    expect(treasureCount(s, "user")).toBe(0);           // no player damage → no batch trigger
  });
});

// SHARED-SCOPE SELF-FIRE GUARD (Hans, cycle 42→43): the subtypeYouControl scope is shared across ETB-SELF
// (#330 Pantlaza), combat-damage (#333), and attacks/dies (#335). Its self-inclusion clause must be gated
// on the SOURCE carrying the subtype, else a non-SUBTYPE creature whose trigger watches a SUBTYPE fires on
// its OWN non-matching event. #335 widening to `dies` made this a LIVE P0 (Slimefoot).
describe("subtype combat-damage self-fire guard (Setzer — latent)", () => {
  it("a NON-subtype watcher does NOT self-fire its subtype combat-damage trigger", () => {
    // A Human (not a Vehicle) carrying "Whenever a Vehicle you control deals combat damage…". Its OWN
    // (non-Vehicle) player damage must NOT fire the trigger — no Vehicle dealt damage.
    const setzerish = createPermanent({ id: "sz", card: { id: "csz", name: "Setzerish", type: "Creature — Human Rogue", power: 2, toughness: 2, oracle: "Whenever a Vehicle you control deals combat damage to a player, create a Treasure token." }, controller: "user", summoningSick: false });
    let s = st([setzerish], [], [{ permanentId: "sz", attackingPlayer: "user", defender: "ai" }], []);
    s = resolveCombatDamage(s);
    expect(s.players.ai.life).toBe(38);                 // the Human's own 2 combat damage landed
    s = resolveAll(flushTriggers(s, { chooseTargets: chooseTriggerTargets }));
    expect(treasureCount(s, "user")).toBe(0);           // but it's not a Vehicle → no self-fire
  });
  it("a real Vehicle attacker still fires the same watcher (no regression)", () => {
    const setzerish = createPermanent({ id: "sz2", card: { id: "csz2", name: "Setzerish", type: "Creature — Human Rogue", power: 1, toughness: 1, oracle: "Whenever a Vehicle you control deals combat damage to a player, create a Treasure token." }, controller: "user", summoningSick: false });
    const blackjack = createPermanent({ id: "bj", card: { id: "cbj", name: "The Blackjack", type: "Artifact Creature — Vehicle", power: 3, toughness: 3, oracle: "" }, controller: "user", summoningSick: false });
    let s = st([setzerish, blackjack], [], [{ permanentId: "bj", attackingPlayer: "user", defender: "ai" }], []);
    s = resolveCombatDamage(s);
    expect(s.players.ai.life).toBe(37);                 // the Vehicle's 3 damage landed
    s = resolveAll(flushTriggers(s, { chooseTargets: chooseTriggerTargets }));
    expect(treasureCount(s, "user")).toBe(1);           // a Vehicle dealt damage → fires
  });
});

describe("subtype DIES self-fire guard — Slimefoot (LIVE native P0)", () => {
  // Slimefoot (native Fungus) watches "a Saproling you control dies" — without the source-subtype guard it
  // self-fires its drain when Slimefoot ITSELF (a non-Saproling) dies. #335 made this reachable.
  const slimefoot = (id) => createPermanent({ id, card: { id: `c-${id}`, name: "Slimefoot, the Stowaway", type: "Legendary Creature — Fungus", power: 1, toughness: 1, oracle: "Whenever a Saproling you control dies, Slimefoot deals 1 damage to each opponent and you gain 1 life." }, controller: "user", summoningSick: false });
  const dead = (perm) => ({ id: perm.id, controller: perm.controller, card: perm.card });
  const withSlimefoot = (slime) => {
    const s = createGameState({ userDeck: [], aiDeck: [] });
    return { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [slime] } } };
  };
  const diesFired = (s, deadPerm) => (checkDiesTriggers(s, [dead(deadPerm)]).pendingTriggers || []).filter((t) => t.event === "dies");

  it("a Saproling dying FIRES Slimefoot's drain (the real trigger)", () => {
    const slime = slimefoot("sf");
    const sap = createPermanent({ id: "sap", card: { id: "csap", name: "Saproling", type: "Creature — Saproling", power: 1, toughness: 1, oracle: "" }, controller: "user", summoningSick: false });
    expect(diesFired(withSlimefoot(slime), sap)).toHaveLength(1);   // a Saproling died → Slimefoot's drain fires
  });
  it("Slimefoot ITSELF dying does NOT self-fire (Fungus is not a Saproling)", () => {
    const slime = slimefoot("sf2");
    expect(diesFired(withSlimefoot(slime), slime)).toHaveLength(0); // Slimefoot (a Fungus) is not a Saproling → no self-fire
  });
});

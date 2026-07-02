import { describe, it, expect } from "vitest";

import { createPermanent, createGameState, destroyLethalCreatures, _resetIdsForTests } from "./gameState.js";
import { resolveCombatDamage } from "./combatResolution.js";

// Minimal hand-built state — the resolver only needs players[*].battlefield /
// graveyard / life, state.combat, turn, and log.
function creature(name, power, toughness, controller, counters) {
  const p = createPermanent({ card: { id: `${name}-card`, name, power, toughness, type_line: "Creature" }, controller });
  return counters ? { ...p, counters } : p;
}
function makeState({ userBf = [], aiBf = [], userLife = 40, aiLife = 40 }, combat) {
  return {
    turn: 3,
    log: [],
    players: {
      user: { life: userLife, battlefield: userBf, graveyard: [], commanderDamageFrom: {} },
      ai: { life: aiLife, battlefield: aiBf, graveyard: [], commanderDamageFrom: {} },
    },
    combat,
  };
}
const onBattlefield = (s, pid) => s.players[pid].battlefield.map(p => p.card.name);
const inGraveyard = (s, pid) => s.players[pid].graveyard.map(c => c.name);

describe("resolveCombatDamage", () => {
  it("is a no-op when nobody is attacking", () => {
    const s = makeState({ userBf: [creature("Bear", 2, 2, "user")] }, { attackers: [], blockers: [] });
    expect(resolveCombatDamage(s)).toBe(s);
  });

  it("unblocked attacker deals its power to the defending player", () => {
    const bear = creature("Bear", 2, 2, "user");
    const s = makeState({ userBf: [bear] }, {
      attackers: [{ permanentId: bear.id, attackingPlayer: "user", defender: "ai" }],
      blockers: [],
    });
    const out = resolveCombatDamage(s);
    expect(out.players.ai.life).toBe(38);
    expect(onBattlefield(out, "user")).toEqual(["Bear"]); // survives
  });

  it("a blocked attacker deals no damage to the player", () => {
    const bear = creature("Bear", 2, 2, "user");
    const wall = creature("Wall", 0, 4, "ai");
    const s = makeState({ userBf: [bear], aiBf: [wall] }, {
      attackers: [{ permanentId: bear.id, attackingPlayer: "user", defender: "ai" }],
      blockers: [{ blockerId: wall.id, blockingPlayer: "ai", attackerId: bear.id }],
    });
    const out = resolveCombatDamage(s);
    expect(out.players.ai.life).toBe(40); // no life lost
    expect(onBattlefield(out, "user")).toEqual(["Bear"]); // 2 dmg < 4 toughness
    expect(onBattlefield(out, "ai")).toEqual(["Wall"]);   // 0 power dealt back
  });

  it("lethal trade: both creatures die to the graveyard", () => {
    const att = creature("Grizzly", 2, 2, "user");
    const blk = creature("Bear", 2, 2, "ai");
    const s = makeState({ userBf: [att], aiBf: [blk] }, {
      attackers: [{ permanentId: att.id, attackingPlayer: "user", defender: "ai" }],
      blockers: [{ blockerId: blk.id, blockingPlayer: "ai", attackerId: att.id }],
    });
    const out = resolveCombatDamage(s);
    expect(onBattlefield(out, "user")).toEqual([]);
    expect(onBattlefield(out, "ai")).toEqual([]);
    expect(inGraveyard(out, "user")).toEqual(["Grizzly"]);
    expect(inGraveyard(out, "ai")).toEqual(["Bear"]);
  });

  it("big attacker survives a chump block and the blocker dies", () => {
    const dragon = creature("Dragon", 5, 5, "user");
    const chump = creature("Goblin", 1, 1, "ai");
    const s = makeState({ userBf: [dragon], aiBf: [chump] }, {
      attackers: [{ permanentId: dragon.id, attackingPlayer: "user", defender: "ai" }],
      blockers: [{ blockerId: chump.id, blockingPlayer: "ai", attackerId: dragon.id }],
    });
    const out = resolveCombatDamage(s);
    expect(onBattlefield(out, "user")).toEqual(["Dragon"]); // 1 dmg < 5
    expect(inGraveyard(out, "ai")).toEqual(["Goblin"]);
    expect(out.players.ai.life).toBe(40); // blocked, no trample
  });

  it("attacker assigns lethal across multiple blockers in order", () => {
    const big = creature("Hydra", 4, 4, "user");
    const b1 = creature("Bird", 1, 1, "ai");
    const b2 = creature("Bird2", 1, 1, "ai");
    const s = makeState({ userBf: [big], aiBf: [b1, b2] }, {
      attackers: [{ permanentId: big.id, attackingPlayer: "user", defender: "ai" }],
      blockers: [
        { blockerId: b1.id, blockingPlayer: "ai", attackerId: big.id },
        { blockerId: b2.id, blockingPlayer: "ai", attackerId: big.id },
      ],
    });
    const out = resolveCombatDamage(s);
    // 4 power kills both 1/1s; attacker takes 2 (< 4 toughness) and lives.
    expect(inGraveyard(out, "ai").sort()).toEqual(["Bird", "Bird2"]);
    expect(onBattlefield(out, "user")).toEqual(["Hydra"]);
  });

  it("+1/+1 counters change the damage math", () => {
    const bear = creature("Bear", 2, 2, "user", { "+1/+1": 2 }); // becomes 4/4
    const s = makeState({ userBf: [bear] }, {
      attackers: [{ permanentId: bear.id, attackingPlayer: "user", defender: "ai" }],
      blockers: [],
    });
    expect(resolveCombatDamage(s).players.ai.life).toBe(36); // 4 damage
  });

  it("asymmetric mutual kill: a dying attacker still deals its full damage (simultaneity)", () => {
    // 3/1 attacker vs 1/3 blocker. The blocker's 1 kills the attacker (1 toughness)
    // AND the attacker's 3 kills the blocker (3 toughness) — both must die. If damage
    // weren't simultaneous (attacker "died first"), the 1/3 would wrongly survive.
    const att = creature("Spike", 3, 1, "user");
    const blk = creature("Wall", 1, 3, "ai");
    const s = makeState({ userBf: [att], aiBf: [blk] }, {
      attackers: [{ permanentId: att.id, attackingPlayer: "user", defender: "ai" }],
      blockers: [{ blockerId: blk.id, blockingPlayer: "ai", attackerId: att.id }],
    });
    const out = resolveCombatDamage(s);
    expect(inGraveyard(out, "user")).toEqual(["Spike"]);
    expect(inGraveyard(out, "ai")).toEqual(["Wall"]);
  });

  it("a 0/0 (from -1/-1 counters) deals no damage and dies to state-based actions", () => {
    const shrunk = creature("Bear", 2, 2, "user", { "-1/-1": 2 }); // 0/0
    const s = makeState({ userBf: [shrunk] }, {
      attackers: [{ permanentId: shrunk.id, attackingPlayer: "user", defender: "ai" }],
      blockers: [],
    });
    const out = resolveCombatDamage(s);
    expect(out.players.ai.life).toBe(40);        // 0 power → no damage
    expect(inGraveyard(out, "user")).toEqual(["Bear"]); // 0 toughness → dies as SBA
  });

  it("logs deaths and player damage", () => {
    const att = creature("Grizzly", 2, 2, "user");
    const blk = creature("Bear", 2, 2, "ai");
    const s = makeState({ userBf: [att], aiBf: [blk] }, {
      attackers: [{ permanentId: att.id, attackingPlayer: "user", defender: "ai" }],
      blockers: [{ blockerId: blk.id, blockingPlayer: "ai", attackerId: att.id }],
    });
    const out = resolveCombatDamage(s);
    const summary = out.log.find(e => e.kind === "combat-damage");
    expect(summary.deaths.sort()).toEqual(["Bear", "Grizzly"]);
    expect(out.log.some(e => e.kind === "creature-dies")).toBe(true);
  });

  it("N4: combat deaths log creature-dies with cause 'combat' (byte-identical shape to before the chokepoint move)", () => {
    const att = creature("Grizzly", 2, 2, "user");
    const blk = creature("Bear", 2, 2, "ai");
    const s = makeState({ userBf: [att], aiBf: [blk] }, {
      attackers: [{ permanentId: att.id, attackingPlayer: "user", defender: "ai" }],
      blockers: [{ blockerId: blk.id, blockingPlayer: "ai", attackerId: att.id }],
    });
    const out = resolveCombatDamage(s);
    const dies = out.log.filter(e => e.kind === "creature-dies");
    expect(dies).toHaveLength(2);
    expect(dies.every(e => e.cause === "combat")).toBe(true);
    expect(dies.map(e => e.cardName).sort()).toEqual(["Bear", "Grizzly"]);
  });
});

describe("N4 — destroyLethalCreatures logs every death at its own chokepoint (combat AND non-combat)", () => {
  const onBoard = (perm, controller = "user") => {
    _resetIdsForTests();
    const s = createGameState({ userDeck: [], aiDeck: [] });
    return { ...s, players: { ...s.players, [controller]: { ...s.players[controller], battlefield: [perm] } } };
  };

  it("a non-combat 0-toughness death (a -X/-X wipe or a 0/0 token) logs creature-dies with cause 'sba' by default", () => {
    const zero = createPermanent({ card: { id: "c-zero", name: "Shrunk Bear", type: "Creature", power: 0, toughness: 0 }, controller: "user" });
    const s = onBoard(zero);
    const { state: out, dead } = destroyLethalCreatures(s);
    expect(dead).toHaveLength(1);
    const entry = out.log.find(e => e.kind === "creature-dies");
    expect(entry).toBeTruthy();
    expect(entry.cardName).toBe("Shrunk Bear");
    expect(entry.cause).toBe("sba");
    expect(entry.controller).toBe("user");
  });

  it("a lethal-damage destruction also logs creature-dies with cause 'sba' outside of combat", () => {
    const bear = { ...createPermanent({ card: { id: "c-bear2", name: "Marked Bear", type: "Creature", power: 2, toughness: 2 }, controller: "user" }), damageMarked: 2 };
    const s = onBoard(bear);
    const { state: out, dead } = destroyLethalCreatures(s);
    expect(dead).toHaveLength(1);
    const entry = out.log.find(e => e.kind === "creature-dies");
    expect(entry.cardName).toBe("Marked Bear");
    expect(entry.cause).toBe("sba");
  });

  it("an explicit cause overrides the default (combat's call site passes 'combat')", () => {
    const zero = createPermanent({ card: { id: "c-zero2", name: "Shrunk Bear 2", type: "Creature", power: 0, toughness: 0 }, controller: "user" });
    const s = onBoard(zero);
    const { state: out } = destroyLethalCreatures(s, new Set(), "combat");
    const entry = out.log.find(e => e.kind === "creature-dies");
    expect(entry.cause).toBe("combat");
  });
});

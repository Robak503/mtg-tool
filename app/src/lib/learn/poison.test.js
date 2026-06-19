/**
 * poison.test.js — KW-POISON foundation (CR 704.5c / 122): the poison-counter track + the
 * ten-poison loss SBA. The infect/wither/toxic COMBAT integration (damage → −1/−1 counters / poison
 * instead of life) lands on top of this foundation; here we pin the track + the loss rule.
 */
import { describe, it, expect } from "vitest";
import { createGameState, addPoison, createPermanent } from "./gameState.js";
import { createLearnSession, advanceUntilDecision } from "./learnSession.js";
import { resolveCombatDamage } from "./combatResolution.js";
import { classifyCard } from "./coverage.js";
import { runEffectProgram } from "./effects/runProgram.js";

// Build a creature that carries its keyword via ORACLE text — exactly how an in-session card arrives
// (LearnView's deckToCardArray gives {name,type,mana,oracle}, no Scryfall keywords array), so these
// exercise the real oracle-based detection (hasKeyword) + the toxic-N parse, not a test-only shortcut.
function kwCreature(name, power, toughness, controller, oracle) {
  const card = { id: `${name}-card`, name, power, toughness, type_line: "Creature" };
  if (oracle) card.oracle = oracle;
  return createPermanent({ card, controller });
}
function combatState({ userBf = [], aiBf = [], userLife = 40, aiLife = 40 }, combat) {
  return {
    turn: 3,
    log: [],
    players: {
      user: { life: userLife, poison: 0, battlefield: userBf, graveyard: [], commanderDamageFrom: {} },
      ai: { life: aiLife, poison: 0, battlefield: aiBf, graveyard: [], commanderDamageFrom: {} },
    },
    combat,
  };
}
const permByName = (s, pid, name) => s.players[pid].battlefield.find(p => p.card.name === name);
const gy = (s, pid) => s.players[pid].graveyard.map(c => c.name);
const INFECT = "Infect (This creature deals damage to creatures in the form of -1/-1 counters and to players in the form of poison counters.)";
const WITHER = "Wither (This creature deals damage to creatures in the form of -1/-1 counters.)";

describe("KW-POISON — poison-counter track + loss SBA", () => {
  it("addPoison accumulates poison counters on a player", () => {
    let s = createGameState({ userDeck: [], aiDeck: [] });
    expect(s.players.user.poison).toBe(0);
    s = addPoison(s, { playerId: "user", amount: 4 });
    s = addPoison(s, { playerId: "user", amount: 3 });
    expect(s.players.user.poison).toBe(7);
  });

  it("rejects a negative amount", () => {
    const s = createGameState({ userDeck: [], aiDeck: [] });
    expect(() => addPoison(s, { playerId: "user", amount: -1 })).toThrow();
  });

  it("ten or more poison counters loses the game (CR 704.5c)", () => {
    const deck = Array.from({ length: 10 }, (_, i) => ({ id: `f${i}`, name: "Forest", type: "Basic Land — Forest" }));
    const session = createLearnSession({ userDeck: deck, opponentDeck: deck, difficulty: "expert" });
    // The opponent reaches 10 poison → it loses → the user wins.
    const poisoned = {
      ...session,
      state: { ...session.state, players: { ...session.state.players, ai: { ...session.state.players.ai, poison: 10 } } },
    };
    const { session: out, decision } = advanceUntilDecision(poisoned);
    expect(decision.kind).toBe("game-over");
    expect(out.status).toBe("user-wins");
  });

  it("nine poison counters does NOT lose (the threshold is exactly ten)", () => {
    const deck = Array.from({ length: 10 }, (_, i) => ({ id: `f${i}`, name: "Forest", type: "Basic Land — Forest" }));
    const session = createLearnSession({ userDeck: deck, opponentDeck: deck, difficulty: "expert" });
    const poisoned = {
      ...session,
      state: { ...session.state, players: { ...session.state.players, ai: { ...session.state.players.ai, poison: 9 } } },
    };
    const { session: out } = advanceUntilDecision(poisoned);
    expect(out.status).not.toBe("user-wins"); // 9 < 10 → game continues (or ends some other way, just not by poison)
  });
});

describe("KW-POISON — infect/wither/toxic combat integration", () => {
  it("infect attacker deals -1/-1 counters to its blocker, NOT marked damage (CR 702.90b)", () => {
    const att = kwCreature("Plague Stinger", 2, 2, "user", INFECT);
    const blk = kwCreature("Wall", 0, 5, "ai");
    const out = resolveCombatDamage(combatState({ userBf: [att], aiBf: [blk] }, {
      attackers: [{ permanentId: att.id, attackingPlayer: "user", defender: "ai" }],
      blockers: [{ blockerId: blk.id, blockingPlayer: "ai", attackerId: att.id }],
    }));
    const wall = permByName(out, "ai", "Wall");
    expect(wall.counters["-1/-1"]).toBe(2);   // 2 power → two -1/-1 counters
    expect(wall.damageMarked || 0).toBe(0);   // and NOT marked damage
  });

  it("infect attacker unblocked gives the defender poison counters, NOT life loss (CR 702.90a — replacement)", () => {
    const att = kwCreature("Core Prowler", 3, 3, "user", INFECT);
    const out = resolveCombatDamage(combatState({ userBf: [att] }, {
      attackers: [{ permanentId: att.id, attackingPlayer: "user", defender: "ai" }], blockers: [],
    }));
    expect(out.players.ai.poison).toBe(3);  // 3 power → 3 poison
    expect(out.players.ai.life).toBe(40);   // NO life lost — infect REPLACES the life damage
  });

  it("toxic N attacker unblocked deals normal life loss PLUS N poison (CR 702.180a — additive)", () => {
    const att = kwCreature("Tyrranax", 2, 2, "user",
      "Toxic 3 (Players dealt combat damage by this creature also get three poison counters.)");
    const out = resolveCombatDamage(combatState({ userBf: [att] }, {
      attackers: [{ permanentId: att.id, attackingPlayer: "user", defender: "ai" }], blockers: [],
    }));
    expect(out.players.ai.life).toBe(38);   // 2 power → 2 life lost (normal)
    expect(out.players.ai.poison).toBe(3);  // PLUS Toxic 3 → 3 poison on top
  });

  it("wither attacker deals -1/-1 to its blocker but a wither/non-infect attacker poisons no player", () => {
    const att = kwCreature("Boggart Ram-Gang", 3, 3, "user", WITHER);
    const blk = kwCreature("Ogre", 2, 4, "ai");
    const out = resolveCombatDamage(combatState({ userBf: [att], aiBf: [blk] }, {
      attackers: [{ permanentId: att.id, attackingPlayer: "user", defender: "ai" }],
      blockers: [{ blockerId: blk.id, blockingPlayer: "ai", attackerId: att.id }],
    }));
    const ogre = permByName(out, "ai", "Ogre");
    expect(ogre.counters["-1/-1"]).toBe(3);   // wither → 3 -1/-1 counters
    expect(ogre.damageMarked || 0).toBe(0);
  });

  it("wither attacker unblocked deals normal life loss and NO poison (wither is creature-only)", () => {
    const att = kwCreature("Ram-Gang", 3, 3, "user", WITHER);
    const out = resolveCombatDamage(combatState({ userBf: [att] }, {
      attackers: [{ permanentId: att.id, attackingPlayer: "user", defender: "ai" }], blockers: [],
    }));
    expect(out.players.ai.life).toBe(37);        // 3 → normal life loss
    expect(out.players.ai.poison || 0).toBe(0);  // wither never poisons a player
  });

  it("a creature dropped to 0 toughness by -1/-1 combat counters dies (CR 704.5f)", () => {
    const att = kwCreature("Necroskitter", 3, 3, "user", WITHER);
    const blk = kwCreature("Elf", 1, 3, "ai");  // 3 toughness − 3 -1/-1 → 0 → SBA death
    const out = resolveCombatDamage(combatState({ userBf: [att], aiBf: [blk] }, {
      attackers: [{ permanentId: att.id, attackingPlayer: "user", defender: "ai" }],
      blockers: [{ blockerId: blk.id, blockingPlayer: "ai", attackerId: att.id }],
    }));
    expect(gy(out, "ai")).toEqual(["Elf"]);  // counters lowered toughness to 0 → dies
  });

  it("an infect BLOCKER deals -1/-1 counters back to the attacker it blocks (per-source keyword)", () => {
    const att = kwCreature("Attacker", 4, 4, "user");
    const blk = kwCreature("Infect Blocker", 2, 2, "ai", INFECT);
    const out = resolveCombatDamage(combatState({ userBf: [att], aiBf: [blk] }, {
      attackers: [{ permanentId: att.id, attackingPlayer: "user", defender: "ai" }],
      blockers: [{ blockerId: blk.id, blockingPlayer: "ai", attackerId: att.id }],
    }));
    const attacker = permByName(out, "user", "Attacker");
    expect(attacker.counters["-1/-1"]).toBe(2);  // the BLOCKER's infect → -1/-1 on the attacker
    expect(attacker.damageMarked || 0).toBe(0);
    expect(gy(out, "ai")).toEqual(["Infect Blocker"]);  // 4 marked ≥ 2 toughness → blocker still dies
  });

  it("a normal (no-keyword) attacker is byte-for-byte unchanged — marked damage + life, no counters/poison", () => {
    const att = kwCreature("Bear", 2, 2, "user");
    const blk = kwCreature("Wall", 0, 5, "ai");
    const out = resolveCombatDamage(combatState({ userBf: [att], aiBf: [blk] }, {
      attackers: [{ permanentId: att.id, attackingPlayer: "user", defender: "ai" }],
      blockers: [{ blockerId: blk.id, blockingPlayer: "ai", attackerId: att.id }],
    }));
    const wall = permByName(out, "ai", "Wall");
    expect(wall.damageMarked).toBe(2);            // ordinary marked damage
    expect(wall.counters["-1/-1"] || 0).toBe(0);  // no counters
    const att2 = kwCreature("Lion", 3, 3, "user");
    const out2 = resolveCombatDamage(combatState({ userBf: [att2] }, {
      attackers: [{ permanentId: att2.id, attackingPlayer: "user", defender: "ai" }], blockers: [],
    }));
    expect(out2.players.ai.life).toBe(37);          // ordinary life loss
    expect(out2.players.ai.poison || 0).toBe(0);    // no poison
  });
});

describe("KW-POISON — coverage classification (flip + CREED guard)", () => {
  it("a keyword-only infect creature flips native-body", () => {
    expect(classifyCard({ type: "Creature — Phyrexian Insect", name: "Glistener Elf", oracle: INFECT })).toBe("native-body");
  });

  it("a keyword-only toxic creature flips native-body", () => {
    expect(classifyCard({
      type: "Creature — Phyrexian Dinosaur", name: "Tyrranax",
      oracle: "Haste\nToxic 3 (Players dealt combat damage by this creature also get three poison counters.)",
    })).toBe("native-body");
  });

  it("an infect creature whose extra ability deals NO damage still flips native (mana / ETB-destroy are fine)", () => {
    // Plague Myr — infect + a pure mana ability → native-mana (no damage ability, guard doesn't catch it).
    expect(classifyCard({ type: "Artifact Creature — Phyrexian Myr", name: "Plague Myr", oracle: `${INFECT}\n{T}: Add {C}.` }))
      .toBe("native-mana");
  });

  it("an infect creature WITH a pinger now flips native (non-combat damage is routed)", () => {
    // Fallen Ferromancer — infect + "{1}{R}, {T}: deal 1 damage". With non-combat routing the pinger's
    // damage is infect-routed, so the CREED guard no longer holds it back → native-activated.
    expect(classifyCard({
      type: "Creature — Phyrexian Human Shaman", name: "Fallen Ferromancer",
      oracle: `${INFECT}\n{1}{R}, {T}: This creature deals 1 damage to any target.`,
    })).toBe("native-activated");
  });
});

describe("KW-POISON — non-combat (ability) damage routing", () => {
  // Build a state with full player shape, then drop in the source + target permanents.
  const stateWith = (userBf, aiBf) => {
    const s = createGameState({ userDeck: [], aiDeck: [] });
    return { ...s, players: {
      ...s.players,
      user: { ...s.players.user, battlefield: userBf },
      ai: { ...s.players.ai, battlefield: aiBf },
    } };
  };
  const program = (atoms) => ({ version: 1, source: "parser", confidence: "high", structure: "sequence", atoms, unparsedTail: null });
  // A stack object as an ACTIVATED ABILITY would build it: params carry sourceId = the source permanent
  // (actionDispatcher.js sets `sourceId: action.permanentId`), which runEffectProgram threads into ctx.
  const abilityStack = (atoms, { controller = "user", targets = [], sourceId = null }) =>
    ({ id: "stk-poison", kind: "ability", source: { name: "Pinger" }, controller, targets, payload: { params: { program: program(atoms), controller, targets, sourceId } } });

  it("an infect source's ability damage to a creature is -1/-1 counters, not marked damage (CR 702.90b)", () => {
    const src = kwCreature("Fallen Ferromancer", 1, 1, "user", INFECT);
    const tgt = kwCreature("Ogre", 2, 4, "ai");
    const out = runEffectProgram(stateWith([src], [tgt]),
      abilityStack([{ op: "deal-damage", amount: 2, targetType: "creature" }], { targets: [{ type: "creature", id: tgt.id }], sourceId: src.id }));
    const ogre = permByName(out, "ai", "Ogre");
    expect(ogre.counters["-1/-1"]).toBe(2);
    expect(ogre.damageMarked || 0).toBe(0);
  });

  it("an infect source's ability damage to a player is poison, not life loss (CR 702.90a)", () => {
    const src = kwCreature("Fallen Ferromancer", 1, 1, "user", INFECT);
    let state = stateWith([src], []);
    const lifeBefore = state.players.ai.life;
    const out = runEffectProgram(state,
      abilityStack([{ op: "deal-damage", amount: 3, targetType: "player" }], { targets: [{ type: "player", id: "ai" }], sourceId: src.id }));
    expect(out.players.ai.poison).toBe(3);
    expect(out.players.ai.life).toBe(lifeBefore);
  });

  it("a wither source's ability damage to a creature is -1/-1 counters (players unaffected)", () => {
    const src = kwCreature("Hateflayer", 1, 1, "user", WITHER);
    const tgt = kwCreature("Bear", 2, 2, "ai");
    const out = runEffectProgram(stateWith([src], [tgt]),
      abilityStack([{ op: "deal-damage", amount: 1, targetType: "creature" }], { targets: [{ type: "creature", id: tgt.id }], sourceId: src.id }));
    const bear = permByName(out, "ai", "Bear");
    expect(bear.counters["-1/-1"]).toBe(1);
    expect(bear.damageMarked || 0).toBe(0);
  });

  it("an infect source's ability that drops a creature to 0 toughness kills it (CR 704.5f)", () => {
    const src = kwCreature("Pinger", 1, 1, "user", INFECT);
    const tgt = kwCreature("Squire", 1, 3, "ai");
    const out = runEffectProgram(stateWith([src], [tgt]),
      abilityStack([{ op: "deal-damage", amount: 3, targetType: "creature" }], { targets: [{ type: "creature", id: tgt.id }], sourceId: src.id }));
    expect(gy(out, "ai")).toEqual(["Squire"]); // 3 -1/-1 counters → 0 toughness → SBA death
  });

  it("a NORMAL source's ability damage is unchanged — marked damage + life loss, no counters/poison", () => {
    const src = kwCreature("Prodigal Sorcerer", 1, 1, "user"); // no poison keyword
    const tgt = kwCreature("Ogre", 2, 4, "ai");
    let state = stateWith([src], [tgt]);
    const lifeBefore = state.players.ai.life;
    let out = runEffectProgram(state,
      abilityStack([{ op: "deal-damage", amount: 2, targetType: "creature" }], { targets: [{ type: "creature", id: tgt.id }], sourceId: src.id }));
    const ogre = permByName(out, "ai", "Ogre");
    expect(ogre.damageMarked).toBe(2);
    expect(ogre.counters["-1/-1"] || 0).toBe(0);
    out = runEffectProgram(stateWith([src], []),
      abilityStack([{ op: "deal-damage", amount: 2, targetType: "player" }], { targets: [{ type: "player", id: "ai" }], sourceId: src.id }));
    expect(out.players.ai.life).toBe(lifeBefore - 2);
    expect(out.players.ai.poison || 0).toBe(0);
  });

  it("a SPELL (sourceId null) deals normal damage even from infect text — spell-source stays unclaimed (safe false-negative)", () => {
    const tgt = kwCreature("Ogre", 2, 4, "ai");
    const out = runEffectProgram(stateWith([], [tgt]),
      abilityStack([{ op: "deal-damage", amount: 2, targetType: "creature" }], { targets: [{ type: "creature", id: tgt.id }], sourceId: null }));
    const ogre = permByName(out, "ai", "Ogre");
    expect(ogre.damageMarked).toBe(2);          // no permanent source → no infect routing
    expect(ogre.counters["-1/-1"] || 0).toBe(0);
  });
});

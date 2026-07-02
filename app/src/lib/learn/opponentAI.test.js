/**
 * Tests for Phase 6 PR4 — opponentAI.js.
 *
 * Covers picker behavior: prefers lands, picks casts by archetype
 * scoring, falls back to pass-priority, attack-all-legal default,
 * smallest-blocker block assignment.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState } from "./gameState.js";
import {
  pickAction,
  pickAttackPlan,
  pickBlockPlan,
  deriveDeckRepresentation,
  decideMulliganForAI,
} from "./opponentAI.js";

function makeCard({ id, name, type, mana = "", oracle = "", power, toughness }) {
  return {
    id: id || `card-${name}`,
    name,
    type,
    mana,
    oracle,
    ...(power !== undefined ? { power } : {}),
    ...(toughness !== undefined ? { toughness } : {}),
  };
}

function makeState({ hand = [], battlefield = [], opponentBattlefield = [], manaPool = {} } = {}) {
  const base = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...base,
    activePlayer: "ai",
    phase: "precombat-main",
    step: "main",
    priorityHolder: "ai",
    players: {
      user: { ...base.players.user, battlefield: opponentBattlefield },
      ai: {
        ...base.players.ai,
        hand,
        battlefield,
        manaPool: { ...base.players.ai.manaPool, ...manaPool },
      },
    },
  };
}

beforeEach(() => {
  _resetIdsForTests();
});

describe("pickAction priority order", () => {
  it("always picks land before spell when a land is legal", () => {
    const forest = makeCard({ name: "Forest", type: "Basic Land — Forest" });
    const bolt = makeCard({ name: "Lightning Bolt", type: "Instant", mana: "{R}", oracle: "Deals 3 damage to any target." });
    const state = makeState({ hand: [forest, bolt], manaPool: { R: 1 } });

    const actions = [
      { kind: "play-land", playerId: "ai", cardId: forest.id, name: "Forest" },
      { kind: "cast-spell", playerId: "ai", cardId: bolt.id, name: "Lightning Bolt", cost: { generic: 0, R: 1 }, cmc: 1 },
      { kind: "pass-priority", playerId: "ai" },
    ];
    const choice = pickAction(state, "ai", actions, { archetype: "aggro" });
    expect(choice.kind).toBe("play-land");
  });

  it("picks the highest-priority cast when there's no land", () => {
    const elf = makeCard({ name: "Llanowar Elves", type: "Creature — Elf", mana: "{G}", oracle: "{T}: Add {G}." });
    const sage = makeCard({ name: "Sage of Hours", type: "Creature — Human Wizard", mana: "{1}{U}", oracle: "Remove five +1/+1 counters: extra turn." });
    const state = makeState({ hand: [elf, sage], manaPool: { G: 1, U: 1, C: 1 } });

    const actions = [
      { kind: "cast-spell", playerId: "ai", cardId: elf.id, name: "Llanowar Elves", cost: { G: 1 }, cmc: 1 },
      { kind: "cast-spell", playerId: "ai", cardId: sage.id, name: "Sage of Hours", cost: { generic: 1, U: 1 }, cmc: 2 },
      { kind: "pass-priority", playerId: "ai" },
    ];
    // Ramp archetype prefers the ramp creature.
    const choice = pickAction(state, "ai", actions, { archetype: "ramp" });
    expect(choice.kind).toBe("cast-spell");
    expect(choice.name).toBe("Llanowar Elves");
  });

  it("falls back to pass-priority when nothing is castable", () => {
    const state = makeState({ hand: [] });
    const actions = [{ kind: "pass-priority", playerId: "ai" }];
    const choice = pickAction(state, "ai", actions, { archetype: "midrange" });
    expect(choice.kind).toBe("pass-priority");
  });

  it("returns null when given an empty action list", () => {
    const state = makeState({ hand: [] });
    expect(pickAction(state, "ai", [], {})).toBeNull();
  });
});

describe("archetype-aware cast scoring", () => {
  function setup(archetype) {
    const elf = makeCard({ name: "Llanowar Elves", type: "Creature — Elf", mana: "{G}", oracle: "{T}: Add {G}." });
    const removal = makeCard({ name: "Doom Blade", type: "Instant", mana: "{1}{B}", oracle: "Destroy target nonblack creature." });
    const draw = makeCard({ name: "Sign in Blood", type: "Sorcery", mana: "{B}{B}", oracle: "Target player draws two cards and loses 2 life." });
    const finisher = makeCard({ name: "Craterhoof Behemoth", type: "Creature — Beast", mana: "{5}{G}{G}{G}", oracle: "Creatures you control get +X/+X." });

    return {
      state: makeState({ hand: [elf, removal, draw, finisher], manaPool: { B: 2, G: 1, C: 5 } }),
      actions: [
        { kind: "cast-spell", playerId: "ai", cardId: elf.id, name: "Llanowar Elves", cost: { G: 1 }, cmc: 1 },
        { kind: "cast-spell", playerId: "ai", cardId: removal.id, name: "Doom Blade", cost: { generic: 1, B: 1 }, cmc: 2 },
        { kind: "cast-spell", playerId: "ai", cardId: draw.id, name: "Sign in Blood", cost: { B: 2 }, cmc: 2 },
        { kind: "cast-spell", playerId: "ai", cardId: finisher.id, name: "Craterhoof Behemoth", cost: { generic: 5, G: 3 }, cmc: 8 },
        { kind: "pass-priority", playerId: "ai" },
      ],
      archetype,
    };
  }

  it("control prefers interaction first", () => {
    const { state, actions, archetype } = setup("control");
    const choice = pickAction(state, "ai", actions, { archetype });
    expect(choice.name).toBe("Doom Blade");
  });

  it("ramp prefers the ramp creature first", () => {
    const { state, actions, archetype } = setup("ramp");
    const choice = pickAction(state, "ai", actions, { archetype });
    expect(choice.name).toBe("Llanowar Elves");
  });

  it("combo prefers ramp then draw", () => {
    const { state, actions, archetype } = setup("combo");
    const choice = pickAction(state, "ai", actions, { archetype });
    expect(choice.name).toBe("Llanowar Elves");
  });

  it("midrange prefers ramp then draw then interaction", () => {
    const { state, actions, archetype } = setup("midrange");
    const choice = pickAction(state, "ai", actions, { archetype });
    expect(choice.name).toBe("Llanowar Elves");
  });
});

describe("pickAttackPlan", () => {
  it("attacks with every legal attacker by default", () => {
    const actions = [
      { kind: "declare-attacker", permanentId: "p1", name: "Bear" },
      { kind: "declare-attacker", permanentId: "p2", name: "Wolf" },
    ];
    const plan = pickAttackPlan({}, "ai", actions);
    expect(plan).toHaveLength(2);
    expect(plan.map(a => a.permanentId).sort()).toEqual(["p1", "p2"]);
  });

  it("returns empty when no attacker actions exist", () => {
    expect(pickAttackPlan({}, "ai", [])).toEqual([]);
  });
});

describe("pickAttackPlan — competent racer profitability", () => {
  function atkPerm({ id, power, toughness, controller = "ai", tapped = false, keywords }) {
    return {
      id, card: { name: id, type: "Creature — Beast", power, toughness, ...(keywords ? { keywords } : {}) },
      controller, tapped, summoningSick: false, counters: {}, attachments: [], attachedTo: null,
    };
  }
  function raceState({ attackers, blockers, defenderLife = 20, combat }) {
    const base = createGameState({ userDeck: [], aiDeck: [] });
    return {
      ...base,
      activePlayer: "ai", phase: "combat", step: "declare-attackers", priorityHolder: "ai",
      ...(combat ? { combat } : {}),
      players: {
        user: { ...base.players.user, life: defenderLife, battlefield: blockers },
        ai: { ...base.players.ai, battlefield: attackers },
      },
    };
  }
  const atk = (id) => ({ kind: "declare-attacker", permanentId: id, name: id });

  it("swings the whole team when the defender has no blockers (free damage)", () => {
    const state = raceState({
      attackers: [atkPerm({ id: "a1", power: 1, toughness: 1 }), atkPerm({ id: "a2", power: 2, toughness: 2 })],
      blockers: [],
    });
    const plan = pickAttackPlan(state, "ai", [atk("a1"), atk("a2")]);
    expect(plan.map(p => p.permanentId).sort()).toEqual(["a1", "a2"]);
  });

  it("holds back a creature that would die for nothing, swings the one that trades up", () => {
    // weak 1/1 dies to the 3/3 wall for nothing → held. big 4/4 survives the 3/3
    // (toughness 4 > power 3) and kills it → swings.
    const state = raceState({
      attackers: [atkPerm({ id: "weak", power: 1, toughness: 1 }), atkPerm({ id: "big", power: 4, toughness: 4 })],
      blockers: [atkPerm({ id: "wall", power: 3, toughness: 3, controller: "user" })],
    });
    const plan = pickAttackPlan(state, "ai", [atk("weak"), atk("big")]);
    expect(plan.map(p => p.permanentId)).toEqual(["big"]);
  });

  it("alpha-strikes with EVERYTHING when the swing is lethal, even into a free-kill blocker", () => {
    // defender at 2 life, three 1/1s into a 5/5: each 1/1 would die for nothing, but
    // the defender can only block one, so 2 unblocked damage is exactly lethal → all in.
    const state = raceState({
      defenderLife: 2,
      attackers: [atkPerm({ id: "a1", power: 1, toughness: 1 }), atkPerm({ id: "a2", power: 1, toughness: 1 }), atkPerm({ id: "a3", power: 1, toughness: 1 })],
      blockers: [atkPerm({ id: "fat", power: 5, toughness: 5, controller: "user" })],
    });
    const plan = pickAttackPlan(state, "ai", [atk("a1"), atk("a2"), atk("a3")]);
    expect(plan).toHaveLength(3);
  });

  it("ignores TAPPED enemy creatures when judging a swing (they can't block)", () => {
    // The only enemy body is tapped, so the 1/1 is free to attack.
    const state = raceState({
      attackers: [atkPerm({ id: "a1", power: 1, toughness: 1 })],
      blockers: [atkPerm({ id: "tappedWall", power: 4, toughness: 4, controller: "user", tapped: true })],
    });
    const plan = pickAttackPlan(state, "ai", [atk("a1")]);
    expect(plan.map(p => p.permanentId)).toEqual(["a1"]);
  });

  it("holds a vanilla creature back from a FIRST-STRIKE blocker that kills it for free", () => {
    // 3/3 attacker vs 3/3 first-strike blocker: the blocker strikes first and kills
    // the attacker before it deals → dies for nothing → hold (not lethal).
    const state = raceState({
      attackers: [atkPerm({ id: "vanilla", power: 3, toughness: 3 })],
      blockers: [atkPerm({ id: "fsWall", power: 3, toughness: 3, controller: "user", keywords: ["First strike"] })],
    });
    expect(pickAttackPlan(state, "ai", [atk("vanilla")])).toEqual([]);
  });

  it("DOES swing a first-strike attacker into an equal first-strike blocker (real trade)", () => {
    const state = raceState({
      attackers: [atkPerm({ id: "fsAtk", power: 3, toughness: 3, keywords: ["First strike"] })],
      blockers: [atkPerm({ id: "fsWall", power: 3, toughness: 3, controller: "user", keywords: ["First strike"] })],
    });
    expect(pickAttackPlan(state, "ai", [atk("fsAtk")]).map(p => p.permanentId)).toEqual(["fsAtk"]);
  });

  it("a bigger creature ignores a first-strike blocker it survives", () => {
    // 4/4 vs 3/3 first strike: takes 3 (survives), then kills the 3/3 → swing.
    const state = raceState({
      attackers: [atkPerm({ id: "big", power: 4, toughness: 4 })],
      blockers: [atkPerm({ id: "fsWall", power: 3, toughness: 3, controller: "user", keywords: ["First strike"] })],
    });
    expect(pickAttackPlan(state, "ai", [atk("big")]).map(p => p.permanentId)).toEqual(["big"]);
  });

  it("keeps a lethal alpha strike going across the per-tick attacker drain", () => {
    // The driver declares ONE attacker per tick (it taps + lands in combat.attackers,
    // shrinking the legal set). Tick 2: a1 is already committed; only a2,a3 are legal.
    // Lethality must be judged over the FULL team (committed + candidates), or the kill
    // fizzles. Defender at 2 life behind a single 5/5: 3× 1/1 = exactly lethal.
    const state = raceState({
      defenderLife: 2,
      attackers: [
        atkPerm({ id: "a1", power: 1, toughness: 1, tapped: true }), // already declared this combat
        atkPerm({ id: "a2", power: 1, toughness: 1 }),
        atkPerm({ id: "a3", power: 1, toughness: 1 }),
      ],
      blockers: [atkPerm({ id: "fat", power: 5, toughness: 5, controller: "user" })],
      combat: { attackers: [{ permanentId: "a1", attackingPlayer: "ai", defender: "user" }], blockers: [] },
    });
    // Only a2,a3 are still legal (a1 tapped). Without folding a1 back into the lethal
    // calc they'd each read as "dies for nothing" into the 5/5 and be held → fizzle.
    const plan = pickAttackPlan(state, "ai", [atk("a2"), atk("a3")]);
    expect(plan.map(p => p.permanentId).sort()).toEqual(["a2", "a3"]);
  });

  it("W4: a FLYER swings past a bigger ground blocker (legality-aware); legacy v1 held it", () => {
    // 5/5 flying vs a 6/6 ground wall: the wall may not legally block it
    // (canBlockAttacker), so the swing is free damage. v1's legality-blind model
    // read the 6/6 as a free kill and held the flyer forever.
    const state = raceState({
      attackers: [atkPerm({ id: "flyer", power: 5, toughness: 5, keywords: ["Flying"] })],
      blockers: [atkPerm({ id: "wall", power: 6, toughness: 6, controller: "user" })],
    });
    expect(pickAttackPlan(state, "ai", [atk("flyer")]).map(p => p.permanentId)).toEqual(["flyer"]);
    expect(pickAttackPlan(state, "ai", [atk("flyer")], { policy: "v1" })).toEqual([]);
  });

  it("W4: a 5/5 no longer suicides into a 1/1 DEATHTOUCH wall; legacy v1 traded it away", () => {
    // The deathtouch block kills the 5/5 for a 1/1 — a terrible trade. v1's model
    // ('power 1 < toughness 5 → can't kill it') attacked into it every turn.
    const state = raceState({
      attackers: [atkPerm({ id: "fatty", power: 5, toughness: 5 })],
      blockers: [atkPerm({ id: "dt-wall", power: 1, toughness: 1, controller: "user", keywords: ["Deathtouch"] })],
    });
    expect(pickAttackPlan(state, "ai", [atk("fatty")])).toEqual([]);
    expect(pickAttackPlan(state, "ai", [atk("fatty")], { policy: "v1" }).map(p => p.permanentId)).toEqual(["fatty"]);
  });

  it("W4: an EVEN deathtouch trade is still taken (2/2 into a 2/2 deathtouch blocker)", () => {
    const state = raceState({
      attackers: [atkPerm({ id: "bear", power: 2, toughness: 2 })],
      blockers: [atkPerm({ id: "dt-bear", power: 2, toughness: 2, controller: "user", keywords: ["Deathtouch"] })],
    });
    expect(pickAttackPlan(state, "ai", [atk("bear")]).map(p => p.permanentId)).toEqual(["bear"]);
  });

  it("W4: a MENACE attacker facing a single eligible blocker is unstoppable — and lethal is seen", () => {
    // Two menace 3/3s vs ONE 6/6 wall at 6 life: menace needs 2 blockers, so no
    // block is ever offered — 6 unavoidable damage is exactly lethal. v1 held
    // both ('the wall kills them for nothing') and never saw the kill.
    const state = raceState({
      defenderLife: 6,
      attackers: [
        atkPerm({ id: "m1", power: 3, toughness: 3, keywords: ["Menace"] }),
        atkPerm({ id: "m2", power: 3, toughness: 3, keywords: ["Menace"] }),
      ],
      blockers: [atkPerm({ id: "wall", power: 6, toughness: 6, controller: "user" })],
    });
    expect(pickAttackPlan(state, "ai", [atk("m1"), atk("m2")]).map(p => p.permanentId).sort()).toEqual(["m1", "m2"]);
    expect(pickAttackPlan(state, "ai", [atk("m1"), atk("m2")], { policy: "v1" })).toEqual([]);
  });

  it("Commander: focuses the chosen defender and drops unprofitable attackers", () => {
    const base = createGameState({ userDeck: [], aiDeck: [] });
    const state = {
      ...base,
      mode: "commander",
      turnOrder: ["ai", "user", "ai2"],
      activePlayer: "ai", step: "declare-attackers", priorityHolder: "ai",
      players: {
        ai: { ...base.players.ai, battlefield: [atkPerm({ id: "weak", power: 1, toughness: 1 }), atkPerm({ id: "big", power: 5, toughness: 5 })] },
        user: { ...base.players.user, life: 10, battlefield: [atkPerm({ id: "wall", power: 3, toughness: 3, controller: "user" })] },
        ai2: { ...base.players.ai, battlefield: [] },
      },
    };
    // One action per (creature, defender). chooseDefender picks the lower-life seat.
    const actions = [
      { kind: "declare-attacker", permanentId: "weak", defenderId: "user", name: "weak" },
      { kind: "declare-attacker", permanentId: "weak", defenderId: "ai2", name: "weak" },
      { kind: "declare-attacker", permanentId: "big", defenderId: "user", name: "big" },
      { kind: "declare-attacker", permanentId: "big", defenderId: "ai2", name: "big" },
    ];
    const plan = pickAttackPlan(state, "ai", actions);
    // weak would die for nothing to user's 3/3 wall → dropped; big survives → kept,
    // focused on user (life 10 < ai2 life). Exactly one action for big.
    expect(plan).toHaveLength(1);
    expect(plan[0]).toMatchObject({ permanentId: "big", defenderId: "user" });
  });
});

describe("pickBlockPlan — W3 block plan v2 (value / lethal-chump / decline)", () => {
  function makePerm({ id, power = 1, toughness = 1, controller = "user", keywords }) {
    return {
      id,
      card: { name: id, type: "Creature — Beast", power, toughness, ...(keywords ? { keywords } : {}) },
      controller,
      tapped: false,
      summoningSick: false,
      counters: {}, attachments: [], attachedTo: null,
    };
  }

  // Declare-blockers state: user attacking the ai seat.
  function blockState({ aiCreatures, userAttackers, aiLife = 40 }) {
    const base = createGameState({ userDeck: [], aiDeck: [] });
    return {
      ...base,
      activePlayer: "user", phase: "combat", step: "declare-blockers", priorityHolder: "ai",
      combat: {
        attackers: userAttackers.map(p => ({ permanentId: p.id, attackingPlayer: "user", defender: "ai" })),
        blockers: [],
      },
      players: {
        user: { ...base.players.user, battlefield: userAttackers },
        ai: { ...base.players.ai, life: aiLife, battlefield: aiCreatures },
      },
    };
  }
  const blk = (blockerId, attackerId) => ({ kind: "declare-blocker", permanentId: blockerId, attackerId, name: blockerId });

  it("VALUE-blocks with the creature that kills and survives — not the legacy smallest chump", () => {
    // Incoming 2/2; we hold a 1/1 and a 3/3. v1 chumped the 1/1 (dies, kills
    // nothing); v2 blocks with the 3/3 (kills the 2/2 and survives).
    const state = blockState({
      aiCreatures: [
        makePerm({ id: "b-small", power: 1, toughness: 1, controller: "ai" }),
        makePerm({ id: "b-big", power: 3, toughness: 3, controller: "ai" }),
      ],
      userAttackers: [makePerm({ id: "a-bear", power: 2, toughness: 2 })],
    });
    const plan = pickBlockPlan(state, "ai", [blk("b-small", "a-bear"), blk("b-big", "a-bear")]);
    expect(plan).toHaveLength(1);
    expect(plan[0].permanentId).toBe("b-big");
  });

  it("declines to block at high life instead of chump-feeding the lone 8/8", () => {
    const state = blockState({
      aiCreatures: [makePerm({ id: "b-small", power: 1, toughness: 1, controller: "ai" })],
      userAttackers: [makePerm({ id: "a-fat", power: 8, toughness: 8 })],
      aiLife: 40,
    });
    expect(pickBlockPlan(state, "ai", [blk("b-small", "a-fat")])).toEqual([]);
  });

  it("chump-blocks the same 8/8 when the unblocked swing is lethal", () => {
    const state = blockState({
      aiCreatures: [makePerm({ id: "b-small", power: 1, toughness: 1, controller: "ai" })],
      userAttackers: [makePerm({ id: "a-fat", power: 8, toughness: 8 })],
      aiLife: 6,
    });
    const plan = pickBlockPlan(state, "ai", [blk("b-small", "a-fat")]);
    expect(plan).toHaveLength(1);
    expect(plan[0]).toMatchObject({ permanentId: "b-small", attackerId: "a-fat" });
  });

  it("takes the TRADE up: a 1/1 deathtouch blocker eats the 7/7", () => {
    const state = blockState({
      aiCreatures: [makePerm({ id: "b-dt", power: 1, toughness: 1, controller: "ai", keywords: ["Deathtouch"] })],
      userAttackers: [makePerm({ id: "a-fat", power: 7, toughness: 7 })],
    });
    const plan = pickBlockPlan(state, "ai", [blk("b-dt", "a-fat")]);
    expect(plan).toHaveLength(1);
    expect(plan[0].permanentId).toBe("b-dt");
  });

  it("refuses to trade DOWN: a 5/2 doesn't block a 2/2 at high life", () => {
    // The 5/2 kills the 2/2 but dies back (2 >= 2) — trading a 5/2 for a 2/2
    // loses material, and at 40 life there's no pressure to do it.
    const state = blockState({
      aiCreatures: [makePerm({ id: "b-glass", power: 5, toughness: 2, controller: "ai" })],
      userAttackers: [makePerm({ id: "a-bear", power: 2, toughness: 2 })],
    });
    expect(pickBlockPlan(state, "ai", [blk("b-glass", "a-bear")])).toEqual([]);
  });

  it("a first-strike blocker VALUE-blocks an equal vanilla it kills untouched", () => {
    // 3/3 first strike vs vanilla 3/3: the blocker kills in the first-strike step
    // and never takes damage back — a value block, not a trade.
    const state = blockState({
      aiCreatures: [makePerm({ id: "b-fs", power: 3, toughness: 3, controller: "ai", keywords: ["First strike"] })],
      userAttackers: [makePerm({ id: "a-van", power: 3, toughness: 3 })],
    });
    const plan = pickBlockPlan(state, "ai", [blk("b-fs", "a-van")]);
    expect(plan).toHaveLength(1);
    expect(plan[0].permanentId).toBe("b-fs");
  });

  it("never wastes a single blocker on a MENACE attacker (one blocker resolves as unblocked)", () => {
    const state = blockState({
      aiCreatures: [makePerm({ id: "b-big", power: 5, toughness: 5, controller: "ai" })],
      userAttackers: [makePerm({ id: "a-men", power: 3, toughness: 3, keywords: ["Menace"] })],
    });
    expect(pickBlockPlan(state, "ai", [blk("b-big", "a-men")])).toEqual([]);
  });

  it("policy 'v1' recovers the legacy chump-every-attacker-with-the-smallest plan", () => {
    const state = blockState({
      aiCreatures: [
        makePerm({ id: "b-small", power: 1, toughness: 1, controller: "ai" }),
        makePerm({ id: "b-big", power: 5, toughness: 5, controller: "ai" }),
      ],
      userAttackers: [
        makePerm({ id: "a1", power: 4, toughness: 4 }),
        makePerm({ id: "a2", power: 4, toughness: 4 }),
      ],
    });
    const blockerActions = [
      blk("b-small", "a1"), blk("b-big", "a1"), blk("b-small", "a2"),
    ];
    const plan = pickBlockPlan(state, "ai", blockerActions, { policy: "v1" });
    expect(plan).toHaveLength(2);
    expect(new Set(plan.map(p => p.attackerId)).size).toBe(2);
    expect(plan.some(p => p.permanentId === "b-small")).toBe(true);
  });

  it("returns empty when no block actions exist", () => {
    expect(pickBlockPlan({}, "ai", [])).toEqual([]);
  });
});

describe("pickCastAction — W5 X-spell sizing (via pickAction)", () => {
  const pass = { kind: "pass-priority", playerId: "ai" };
  const enemyPerm = ({ id, name, power, toughness }) => ({
    id, card: { name, type: "Creature — Wall", power, toughness },
    controller: "user", tapped: false, summoningSick: false, counters: {}, attachments: [], attachedTo: null,
  });
  // One cast action per (X, target) — the shape legalChoices emits for an xSpell
  // program (per-X synthetic damage `effect`, xValue on the action).
  function fireballActions(card, maxX, targets) {
    const out = [];
    for (let x = 1; x <= maxX; x++) {
      for (const t of targets) {
        out.push({
          kind: "cast-spell", playerId: "ai", cardId: card.id, name: card.name,
          cost: { generic: 1 + x, R: 1 }, cmc: 1 + x, xValue: x,
          effect: { kind: "damage", amount: x, targetType: "any" },
          targets: [t], needsTargets: true,
        });
      }
    }
    return out;
  }
  const fireball = () => makeCard({ id: "c-fb", name: "Fireball", type: "Sorcery", mana: "{X}{R}", oracle: "This spell deals X damage to any target." });

  it("kills the biggest enemy creature with the MINIMUM lethal X (not X=1, no overpay)", () => {
    const card = fireball();
    const wall = enemyPerm({ id: "e-wall", name: "Wall", power: 5, toughness: 4 });
    const state = makeState({ hand: [card], opponentBattlefield: [wall] });
    const targets = [
      { type: "creature", id: "e-wall", controller: "user", name: "Wall" },
      { type: "player", id: "user", name: "user" },
    ];
    const choice = pickAction(state, "ai", [...fireballActions(card, 8, targets), pass]);
    expect(choice).toMatchObject({ kind: "cast-spell", xValue: 4 });
    expect(choice.targets[0].id).toBe("e-wall");
  });

  it("with no killable creature, aims the MAX affordable X at the enemy player", () => {
    const card = fireball();
    const state = makeState({ hand: [card] });
    const targets = [{ type: "player", id: "user", name: "user" }];
    const choice = pickAction(state, "ai", [...fireballActions(card, 8, targets), pass]);
    expect(choice).toMatchObject({ kind: "cast-spell", xValue: 8 });
    expect(choice.targets[0]).toMatchObject({ type: "player", id: "user" });
  });

  it("an untargeted enters-with-X hydra is cast at the MAX offered X", () => {
    const card = makeCard({ id: "c-hyd", name: "Hungering Hydra", type: "Creature — Hydra", mana: "{X}{G}", oracle: "This creature enters with X +1/+1 counters on it." });
    const state = makeState({ hand: [card] });
    const actions = [1, 2, 3, 4, 5].map((x) => ({
      kind: "cast-spell", playerId: "ai", cardId: card.id, name: card.name,
      cost: { generic: x, G: 1 }, cmc: 1 + x, xValue: x, targets: [], needsTargets: false,
    }));
    const choice = pickAction(state, "ai", [...actions, pass]);
    expect(choice).toMatchObject({ kind: "cast-spell", xValue: 5 });
  });

  it("policy 'v1' recovers the legacy actions[0] (X=1) pick", () => {
    const card = fireball();
    const state = makeState({ hand: [card] });
    const targets = [{ type: "player", id: "user", name: "user" }];
    const choice = pickAction(state, "ai", [...fireballActions(card, 8, targets), pass], { policy: "v1" });
    expect(choice).toMatchObject({ kind: "cast-spell", xValue: 1 });
  });

  it("HOLDS an unscorable targeted X spell (no synthetic damage effect) — parity with the legacy hold", () => {
    const card = makeCard({ id: "c-xw", name: "Weird X Spell", type: "Sorcery", mana: "{X}{U}", oracle: "Return X target cards." });
    const wall = enemyPerm({ id: "e-wall", name: "Wall", power: 2, toughness: 2 });
    const state = makeState({ hand: [card], opponentBattlefield: [wall] });
    const actions = [1, 2].map((x) => ({
      kind: "cast-spell", playerId: "ai", cardId: card.id, name: card.name,
      cost: { generic: x, U: 1 }, cmc: 1 + x, xValue: x, effect: null,
      targets: [{ type: "creature", id: "e-wall", controller: "user", name: "Wall" }], needsTargets: true,
    }));
    const choice = pickAction(state, "ai", [...actions, pass]);
    expect(choice).toMatchObject({ kind: "pass-priority" });
  });
});

describe("deriveDeckRepresentation", () => {
  it("flattens all zones into a card list shape detectArchetype can read", () => {
    const state = createGameState({
      userDeck: [],
      aiDeck: [{ id: "c-1", name: "Sol Ring" }, { id: "c-2", name: "Atraxa" }],
      aiCommanders: [{ id: "cmd-1", name: "Edgar Markov" }],
    });
    const cards = deriveDeckRepresentation(state, "ai");
    const names = cards.map(c => c.name).sort();
    expect(names).toContain("Sol Ring");
    expect(names).toContain("Atraxa");
    expect(names).toContain("Edgar Markov");
    expect(cards.every(c => c.qty === 1 && c.section === "Mainboard")).toBe(true);
  });

  it("returns empty for an unknown player", () => {
    const state = createGameState({ userDeck: [], aiDeck: [] });
    expect(deriveDeckRepresentation(state, "eve")).toEqual([]);
  });
});

describe("pickLandAction — W1 land sequencing (via pickAction)", () => {
  const landAction = (card) => ({ kind: "play-land", playerId: "ai", cardId: card.id, name: card.name });
  const pass = { kind: "pass-priority", playerId: "ai" };
  const landPerm = (card) => ({
    id: `perm-${card.id}`, card, controller: "ai",
    tapped: false, summoningSick: false, counters: {}, attachments: [], attachedTo: null,
  });

  it("prefers an untapped land over an enters-tapped land that sorts first", () => {
    // "Aetherbog" sorts before "Swamp" — the legacy alphabetical pick would take
    // the tapland and lose a mana turn. W1 ranks untapped first.
    const tapland = makeCard({ id: "l-bog", name: "Aetherbog", type: "Land", oracle: "This land enters the battlefield tapped.\n{T}: Add {B}." });
    const swamp = makeCard({ id: "l-swamp", name: "Swamp", type: "Basic Land — Swamp" });
    const state = makeState({ hand: [tapland, swamp] });
    const choice = pickAction(state, "ai", [landAction(tapland), landAction(swamp), pass]);
    expect(choice).toMatchObject({ kind: "play-land", name: "Swamp" });
  });

  it("policy 'v1' recovers the legacy pure-alphabetical pick (the probe's OLD side)", () => {
    const tapland = makeCard({ id: "l-bog", name: "Aetherbog", type: "Land", oracle: "This land enters the battlefield tapped.\n{T}: Add {B}." });
    const swamp = makeCard({ id: "l-swamp", name: "Swamp", type: "Basic Land — Swamp" });
    const state = makeState({ hand: [tapland, swamp] });
    const choice = pickAction(state, "ai", [landAction(tapland), landAction(swamp), pass], { policy: "v1" });
    expect(choice).toMatchObject({ kind: "play-land", name: "Aetherbog" });
  });

  it("prefers the land that fills a color gap over one whose color the board already makes", () => {
    // Board already produces U (an Island in play); the hand needs B for Doom Blade.
    // "Island" sorts before "Swamp", so only the color-gap rank can pick Swamp.
    const island = makeCard({ id: "l-isl", name: "Island", type: "Basic Land — Island" });
    const swamp = makeCard({ id: "l-swp", name: "Swamp", type: "Basic Land — Swamp" });
    const blackSpell = makeCard({ id: "c-db", name: "Doom Blade", type: "Instant", mana: "{1}{B}", oracle: "Destroy target nonblack creature." });
    const boardIsland = makeCard({ id: "l-isl-2", name: "Island", type: "Basic Land — Island" });
    const state = makeState({ hand: [island, swamp, blackSpell], battlefield: [landPerm(boardIsland)] });
    const choice = pickAction(state, "ai", [landAction(island), landAction(swamp), pass]);
    expect(choice).toMatchObject({ kind: "play-land", name: "Swamp" });
  });

  it("still returns a land (never null) when every candidate enters tapped", () => {
    const bogA = makeCard({ id: "l-a", name: "Bogland A", type: "Land", oracle: "This land enters the battlefield tapped." });
    const bogB = makeCard({ id: "l-b", name: "Bogland B", type: "Land", oracle: "This land enters the battlefield tapped." });
    const state = makeState({ hand: [bogA, bogB] });
    const choice = pickAction(state, "ai", [landAction(bogB), landAction(bogA), pass]);
    expect(choice).toMatchObject({ kind: "play-land", name: "Bogland A" });
  });

  it("is deterministic — the same state picks the same land twice", () => {
    const tapland = makeCard({ id: "l-bog", name: "Aetherbog", type: "Land", oracle: "This land enters the battlefield tapped.\n{T}: Add {B}." });
    const swamp = makeCard({ id: "l-swamp", name: "Swamp", type: "Basic Land — Swamp" });
    const state = makeState({ hand: [tapland, swamp] });
    const actions = [landAction(tapland), landAction(swamp), pass];
    expect(pickAction(state, "ai", actions)).toBe(pickAction(state, "ai", actions));
  });
});

describe("decideMulliganForAI — W2 (opt-in London keep/ship heuristic)", () => {
  const KEEP = { kind: "mulligan-keep" };
  const SHIP = { kind: "mulligan-ship" };
  const offered = [KEEP, SHIP];
  const land = (i) => makeCard({ id: `l-${i}`, name: `Forest ${i}`, type: "Basic Land — Forest" });
  const spell = (i) => makeCard({ id: `s-${i}`, name: `Spell ${i}`, type: "Instant", mana: "{G}" });
  const handOf = (lands) => [
    ...Array.from({ length: lands }, (_, i) => land(i)),
    ...Array.from({ length: 7 - lands }, (_, i) => spell(i)),
  ];
  const mullState = (lands, ships = 0) => ({
    players: { ai: { hand: handOf(lands) } },
    log: Array.from({ length: ships }, (_, i) => ({ kind: "mulligan-ship", player: "ai", mulligans: i + 1 })),
  });

  it("ships a 0-land hand", () => {
    expect(decideMulliganForAI({ state: mullState(0), legalActions: offered, seat: "ai" })).toBe(SHIP);
  });

  it("ships a 1-land hand", () => {
    expect(decideMulliganForAI({ state: mullState(1), legalActions: offered, seat: "ai" })).toBe(SHIP);
  });

  it("keeps a 3-land hand", () => {
    expect(decideMulliganForAI({ state: mullState(3), legalActions: offered, seat: "ai" })).toBe(KEEP);
  });

  it("ships a 7-land hand (flooded)", () => {
    expect(decideMulliganForAI({ state: mullState(7), legalActions: offered, seat: "ai" })).toBe(SHIP);
  });

  it("keeps ANY hand after 2 prior ships (never below an effective 5-card keep)", () => {
    expect(decideMulliganForAI({ state: mullState(0, 2), legalActions: offered, seat: "ai" })).toBe(KEEP);
  });

  it("only counts the deciding seat's prior ships", () => {
    const state = mullState(0);
    state.log = [
      { kind: "mulligan-ship", player: "user", mulligans: 1 },
      { kind: "mulligan-ship", player: "user", mulligans: 2 },
    ];
    expect(decideMulliganForAI({ state, legalActions: offered, seat: "ai" })).toBe(SHIP);
  });

  it("returns the OFFERED keep action when no ship action is offered", () => {
    expect(decideMulliganForAI({ state: mullState(0), legalActions: [KEEP], seat: "ai" })).toBe(KEEP);
  });

  it("is deterministic", () => {
    const state = mullState(1);
    expect(decideMulliganForAI({ state, legalActions: offered, seat: "ai" }))
      .toBe(decideMulliganForAI({ state, legalActions: offered, seat: "ai" }));
  });
});

describe("pickAction with auto-archetype-detection", () => {
  it("falls back to detecting archetype from the AI's known zones when not supplied", () => {
    // Stack the AI's hand with combo-shape stuff so the detector
    // votes "combo" and the picker prefers ramp/draw accordingly.
    const ramp = makeCard({ name: "Sol Ring", type: "Artifact", mana: "{1}", oracle: "{T}: Add {C}{C}." });
    const draw = makeCard({ name: "Sign in Blood", type: "Sorcery", mana: "{B}{B}", oracle: "Target player draws two cards." });
    const tutor = makeCard({ name: "Demonic Tutor", type: "Sorcery", mana: "{1}{B}", oracle: "Search your library for a card." });
    const state = makeState({ hand: [ramp, draw, tutor], manaPool: { B: 2, C: 2 } });

    const actions = [
      { kind: "cast-spell", playerId: "ai", cardId: ramp.id, name: "Sol Ring", cost: { generic: 1 }, cmc: 1 },
      { kind: "cast-spell", playerId: "ai", cardId: draw.id, name: "Sign in Blood", cost: { B: 2 }, cmc: 2 },
      { kind: "cast-spell", playerId: "ai", cardId: tutor.id, name: "Demonic Tutor", cost: { generic: 1, B: 1 }, cmc: 2 },
      { kind: "pass-priority", playerId: "ai" },
    ];
    // Don't pass archetype; the picker should auto-detect and pick
    // Sol Ring first regardless of detected archetype (ramp goes
    // first in every preset). Just verify a deterministic legal pick.
    const choice = pickAction(state, "ai", actions);
    expect(choice.kind).toBe("cast-spell");
    expect(choice.name).toBe("Sol Ring");
  });
});

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

describe("pickBlockPlan", () => {
  function makePerm({ id, power = 1, toughness = 1 }) {
    return {
      id,
      card: { name: id, type: "Creature — Beast", power, toughness },
      controller: "user",
      tapped: false,
      summoningSick: false,
      counters: {}, attachments: [], attachedTo: null,
    };
  }

  it("assigns at most one blocker per attacker, preferring smallest-power", () => {
    const state = makeState({
      battlefield: [
        makePerm({ id: "perm-small", power: 1 }),
        makePerm({ id: "perm-big", power: 5 }),
      ],
    });
    const blockerActions = [
      { kind: "declare-blocker", permanentId: "perm-small", attackerId: "a1", name: "small" },
      { kind: "declare-blocker", permanentId: "perm-big", attackerId: "a1", name: "big" },
      { kind: "declare-blocker", permanentId: "perm-small", attackerId: "a2", name: "small" },
    ];
    // Note: in this setup, "small" is in user's battlefield (defender)
    // because we set opponentBattlefield via the "battlefield" key in
    // makeState's user perspective. The picker reads ai's permanents,
    // not user's, so swap:
    const swapped = {
      ...state,
      players: {
        ...state.players,
        ai: { ...state.players.ai, battlefield: state.players.user.battlefield },
        user: { ...state.players.user, battlefield: [] },
      },
    };
    const plan = pickBlockPlan(swapped, "ai", blockerActions);
    expect(plan).toHaveLength(2);
    // Each attacker assigned at most one blocker.
    const attackers = plan.map(p => p.attackerId);
    expect(new Set(attackers).size).toBe(2);
    // The "small" blocker is preferred (lower power = better chump).
    expect(plan.some(p => p.permanentId === "perm-small")).toBe(true);
  });

  it("returns empty when no block actions exist", () => {
    expect(pickBlockPlan({}, "ai", [])).toEqual([]);
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

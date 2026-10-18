/**
 * aiRacerBlockCapacity.test.js — the default AI's racer judges the attacking GROUP against the defender's blockers: one
 * blocker blocks one attacker (AI decision quality; the engine's rules are unchanged).
 *
 * The rules the choice sits on: CR 509.1a (the defending player chooses which creature each untapped creature blocks — ONE
 * attacker, unless an effect says it can block more), CR 702.111b (menace: a creature with menace can't be blocked except
 * by two or more creatures), CR 510.1 (combat damage), CR 508.1h (an attack tax is a cost to attack, per creature) and CR
 * 508.1d (a creature that attacks each combat if able must be declared when it can).
 *
 * Before this fix the racer held every attacker that ANY single untapped blocker could kill for nothing, as if each blocker
 * could block every attacker at once: five 2/2 tokens stayed home against one 4/4, and in a self-play game thirteen creatures
 * with 34 power stayed home against one untapped creature. Now the attackers such a blocker threatens go as a group when the
 * face damage they connect — even if the defender kills the most valuable ones its blockers can and blocks the biggest of the
 * rest — is worth more than those creatures on evaluateBoard's scale (a point of life is 0.25 of a permanentValue point, the
 * planeswalker attack policy's rate), cheapest first, never while the crack-back would then be lethal, and only as many as
 * the seat can pay the attack tax for.
 *
 * Card text: the bundled Scryfall oracle snapshot (scryfall-bulk/oracle_cards.json), copied verbatim; the token objects add
 * the engine's `token: true` flag (a token is no card, CR 111.1).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { pickAction, pickAttackPlan, POLICY_KEYS } from "./opponentAI.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { addContinuousEffect } from "./layers.js";

beforeEach(() => _resetIdsForTests());

// ── the bundled oracle (verbatim) ───────────────────────────────────────────────────────────────────────────────────────
const ZOMBIE = {"name":"Zombie","type":"Token Creature — Zombie","power":"2","toughness":"2","keywords":[],"colors":["B"],"oracle":"","token":true};
const PIRATE = {"name":"Pirate","type":"Token Creature — Pirate","power":"2","toughness":"2","keywords":["Menace"],"colors":["B"],"oracle":"Menace (This creature can't be blocked except by two or more creatures.)","token":true};
const PLANT = {"name":"Plant","type":"Token Creature — Plant","power":"0","toughness":"1","keywords":[],"colors":["G"],"oracle":"","token":true};
const BEARS = {"name":"Grizzly Bears","type":"Creature — Bear","mana":"{1}{G}","cmc":2,"power":"2","toughness":"2","keywords":[],"colors":["G"],"oracle":""}; // EDHREC #8126
const BALOTH = {"name":"Rumbling Baloth","type":"Creature — Beast","mana":"{2}{G}{G}","cmc":4,"power":"4","toughness":"4","keywords":[],"colors":["G"],"oracle":""}; // EDHREC #17403
const WURM = {"name":"Craw Wurm","type":"Creature — Wurm","mana":"{4}{G}{G}","cmc":6,"power":"6","toughness":"4","keywords":[],"colors":["G"],"oracle":""}; // EDHREC #22387
const CYCLOPS = {"name":"Bloodrock Cyclops","type":"Creature — Cyclops","mana":"{2}{R}","cmc":3,"power":"3","toughness":"3","keywords":[],"colors":["R"],"oracle":"This creature attacks each combat if able."}; // EDHREC #31053
const AIR_ELEMENTAL = {"name":"Air Elemental","type":"Creature — Elemental","mana":"{3}{U}{U}","cmc":5,"power":"4","toughness":"4","keywords":["Flying"],"colors":["U"],"oracle":"Flying"}; // EDHREC #24441
const PRISON = {"name":"Ghostly Prison","type":"Enchantment","mana":"{2}{W}","cmc":3,"keywords":[],"colors":["W"],"oracle":"Creatures can't attack you unless their controller pays {2} for each creature they control that's attacking you."}; // EDHREC #161
const RECLUSE = {"name":"Deadly Recluse","type":"Creature — Spider","mana":"{1}{G}","cmc":2,"power":"1","toughness":"2","keywords":["Reach","Deathtouch"],"colors":["G"],"oracle":"Reach (This creature can block creatures with flying.)\nDeathtouch (Any amount of damage this deals to a creature is enough to destroy it.)"}; // EDHREC #4952
const RAIDERS = {"name":"Mons's Goblin Raiders","type":"Creature — Goblin","mana":"{R}","cmc":1,"power":"1","toughness":"1","keywords":[],"colors":["R"],"oracle":""}; // EDHREC #24664
const ISAMARU = {"name":"Isamaru, Hound of Konda","type":"Legendary Creature — Dog","mana":"{W}","cmc":1,"power":"2","toughness":"2","keywords":[],"colors":["W"],"oracle":""}; // EDHREC #7269
const HILL_GIANT = {"name":"Hill Giant","type":"Creature — Giant","mana":"{3}{R}","cmc":4,"power":"3","toughness":"3","keywords":[],"colors":["R"],"oracle":""}; // EDHREC #29123
const ISLAND = {"name":"Island","type":"Basic Land — Island","mana":"","cmc":0,"keywords":[],"colors":[],"oracle":"({T}: Add {U}.)"};
const FOREST = {"name":"Forest","type":"Basic Land — Forest","mana":"","cmc":0,"keywords":[],"colors":[],"oracle":"({T}: Add {G}.)"};

const P = (id, card, controller, over = {}) => ({ ...createPermanent({ id, card: { id: `c-${id}`, ...card }, controller, summoningSick: false }), ...over });
const many = (n, prefix, card, controller, over = {}) => Array.from({ length: n }, (_, i) => P(`${prefix}${i + 1}`, card, controller, over));

/** `seat`'s declare attackers step; `boards` maps seat → permanents, `life` seat → life (default 40). Two players unless `pod`. */
function game({ pod = false, seat = "ai", boards = {}, life = {} }) {
  const s0 = pod ? createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] }) : createGameState({ userDeck: [], aiDeck: [] });
  const players = { ...s0.players };
  for (const pid of Object.keys(players)) {
    players[pid] = { ...players[pid], battlefield: [...(boards[pid] || [])], hand: [], graveyard: [], library: [], life: life[pid] ?? 40 };
  }
  return { ...s0, players, turn: 5, activePlayer: seat, priorityHolder: seat, consecutivePasses: 0, phase: "combat", step: "declare-attackers", combat: { attackers: [], blockers: [] } };
}

const attacks = (s, seat = "ai") => legalActionsForPlayer(s, seat).filter((a) => a.kind === "declare-attacker");
/** The ids the AI planner sends, sorted. */
const planned = (s, seat = "ai", opts = {}) => pickAttackPlan(s, seat, attacks(s, seat), opts).map((a) => a.permanentId).sort();
/** The declaration as the engine's driver takes it: one pickAction per tick, each dispatched, until the AI stops declaring. */
function declareAll(s, seat = "ai") {
  for (let tick = 0; tick < 30; tick++) {
    const offered = legalActionsForPlayer(s, seat);
    if (!offered.some((a) => a.kind === "declare-attacker")) break;
    const pick = pickAction(s, seat, offered);
    if (pick?.kind !== "declare-attacker") break;
    s = dispatchAction(s, pick);
  }
  return s;
}
const declaredIds = (s, seat = "ai") => (s.combat?.attackers || []).filter((a) => a.attackingPlayer === seat).map((a) => a.permanentId).sort();
const ids = (prefix, n) => Array.from({ length: n }, (_, i) => `${prefix}${i + 1}`).sort();

/** Animate a land the way an animate spell or a man-land does (layer 4 adds Creature, layer 7b sets P/T). */
function animate(state, permId, power, toughness) {
  const source = { kind: "resolution", permanentId: null, cardName: "Animate" };
  let r = addContinuousEffect(state, { layer: 4, op: { types: ["Creature"] }, affects: { mode: "fixed", permanentIds: [permId] }, duration: { kind: "permanent" }, source });
  r = addContinuousEffect(r.state, { layer: 7, sublayer: "7b", op: { layerOp: "ptSet", power, toughness }, affects: { mode: "fixed", permanentIds: [permId] }, duration: { kind: "permanent" }, source });
  return r.state;
}

describe("one blocker blocks one attacker: the group goes when the face damage is worth more than what the blockers can eat", () => {
  it("⭐ five 2/2 Zombie tokens into one untapped Rumbling Baloth: all five attack (the Baloth eats one, 8 connects)", () => {
    const s = game({ boards: { ai: many(5, "z", ZOMBIE, "ai"), user: [P("baloth", BALOTH, "user")] } });
    expect(planned(s)).toEqual(ids("z", 5));
  });

  it("⭐ the same board through the engine's one-attacker-a-tick declaration: all five Zombies are declared", () => {
    const s = game({ boards: { ai: many(5, "z", ZOMBIE, "ai"), user: [P("baloth", BALOTH, "user")] } });
    expect(declaredIds(declareAll(s))).toEqual(ids("z", 5));
  });

  it("⭐ ten Grizzly Bears into one Rumbling Baloth: all ten attack (18 connects even if the Baloth eats a Bear)", () => {
    const s = game({ boards: { ai: many(10, "b", BEARS, "ai"), user: [P("baloth", BALOTH, "user")] } });
    expect(planned(s)).toEqual(ids("b", 10));
  });

  it("⭐ five Grizzly Bears into the Baloth with its controller at 10: all five attack (the face damage counts double below 20)", () => {
    const s = game({ life: { user: 10 }, boards: { ai: many(5, "b", BEARS, "ai"), user: [P("baloth", BALOTH, "user")] } });
    expect(planned(s)).toEqual(ids("b", 5));
  });

  it("⭐ menace (CR 702.111b): three 2/2 Pirate tokens into two Rumbling Baloths — the Baloths can block only ONE Pirate together, so all three attack", () => {
    const s = game({ boards: { ai: many(3, "p", PIRATE, "ai"), user: many(2, "baloth", BALOTH, "user") } });
    expect(planned(s)).toEqual(ids("p", 3));
  });

  it("⭐ cheapest first: five Zombie tokens attack into the Baloth, the commander Isamaru stays home (it would be the one eaten)", () => {
    const s = game({ boards: { ai: [P("isamaru", { ...ISAMARU, isCommander: true }, "ai"), ...many(5, "z", ZOMBIE, "ai")], user: [P("baloth", BALOTH, "user")] } });
    expect(planned(s)).toEqual(ids("z", 5));
  });

  it("⭐ a 0/1 Plant token adds no damage: the five Zombies attack into the Baloth, the two Plants stay home", () => {
    const s = game({ boards: { ai: [...many(2, "plant", PLANT, "ai"), ...many(5, "z", ZOMBIE, "ai")], user: [P("baloth", BALOTH, "user")] } });
    expect(planned(s)).toEqual(ids("z", 5));
  });

  it("⭐ a creature that must attack (Bloodrock Cyclops) is already exposed: both Zombies attack beside it, the one Baloth can eat only one", () => {
    const s = game({ boards: { ai: [P("cyclops", CYCLOPS, "ai"), ...many(2, "z", ZOMBIE, "ai")], user: [P("baloth", BALOTH, "user")] } });
    expect(planned(s)).toEqual(["cyclops", "z1", "z2"]);
    expect(declaredIds(declareAll(s))).toEqual(["cyclops", "z1", "z2"]);
  });
});

describe("attack taxes (CR 508.1h): the group is only as big as the seat can pay for", () => {
  const board = (islands) => ({ ai: [P("air", AIR_ELEMENTAL, "ai"), ...many(5, "z", ZOMBIE, "ai"), ...many(islands, "island", ISLAND, "ai")], user: [P("prison", PRISON, "user"), P("baloth", BALOTH, "user")] });

  it("⭐ Ghostly Prison and eight Islands pay four attacks: the Air Elemental and three Zombies", () => {
    expect(planned(game({ boards: board(8) }))).toEqual(["air", "z1", "z2", "z3"]);
  });

  it("⭐ through the engine: the Air Elemental and three Zombies are declared, every Island pays", () => {
    const after = declareAll(game({ boards: board(8) }));
    expect({ declared: declaredIds(after), untappedIslands: after.players.ai.battlefield.filter((p) => p.card.name === "Island" && !p.tapped).length })
      .toEqual({ declared: ["air", "z1", "z2", "z3"], untappedIslands: 0 });
  });

  it("control — two Islands pay one attack: only the Air Elemental (the Baloth can't block it) attacks", () => {
    expect(planned(game({ boards: board(2) }))).toEqual(["air"]);
  });
});

describe("controls — the racer still holds what it held for a reason", () => {
  it("control — the crack-back would be lethal: ten Grizzly Bears stay home when their controller is at 10 and three tapped Craw Wurms untap next turn", () => {
    const s = game({ life: { ai: 10 }, boards: { ai: many(10, "b", BEARS, "ai"), user: [P("baloth", BALOTH, "user"), ...many(3, "wurm", WURM, "user", { tapped: true })] } });
    expect(planned(s)).toEqual([]);
  });

  it("control — a lone 1/1 into a Deadly Recluse (deathtouch, survives the 1/1): held", () => {
    const s = game({ boards: { ai: [P("raiders", RAIDERS, "ai")], user: [P("recluse", RECLUSE, "user")] } });
    expect(planned(s)).toEqual([]);
  });

  it("control — the one blocker would eat the commander: Isamaru and a Zombie token stay home (2 damage is not worth a commander)", () => {
    const s = game({ boards: { ai: [P("isamaru", { ...ISAMARU, isCommander: true }, "ai"), P("z1", ZOMBIE, "ai")], user: [P("baloth", BALOTH, "user")] } });
    expect(planned(s)).toEqual([]);
  });

  it("control — five Grizzly Bears into the Baloth at 40: held (8 damage is worth less than the Bear the Baloth eats, on evaluateBoard's scale)", () => {
    const s = game({ boards: { ai: many(5, "b", BEARS, "ai"), user: [P("baloth", BALOTH, "user")] } });
    expect(planned(s)).toEqual([]);
  });

  it("control — an animated land is never fed to a blocker: two 3/3 Forests stay home against the Baloth (losing one loses a mana source)", () => {
    let s = game({ boards: { ai: many(2, "forest", FOREST, "ai"), user: [P("baloth", BALOTH, "user")] } });
    s = animate(animate(s, "forest1", 3, 3), "forest2", 3, 3);
    expect(attacks(s).map((a) => a.permanentId).sort()).toEqual(["forest1", "forest2"]);
    expect(planned(s)).toEqual([]);
  });

  it("control — the attacker the defender can't kill for nothing goes alone: a 1/1 beside a 4/4 into a 3/3 — the 3/3 would eat the 1/1, so it stays", () => {
    const s = game({ boards: { ai: [P("raiders", RAIDERS, "ai"), P("baloth", BALOTH, "ai")], user: [P("giant", HILL_GIANT, "user")] } });
    expect(planned(s)).toEqual(["baloth"]);
  });
});

describe("the policy seam", () => {
  it("⭐ `racer` is a POLICY_KEYS subsystem, and `racer: \"v1\"` restores the per-attacker hold", () => {
    expect(POLICY_KEYS).toContain("racer");
    const s = game({ boards: { ai: many(5, "z", ZOMBIE, "ai"), user: [P("baloth", BALOTH, "user")] } });
    expect(planned(s, "ai", { policy: { racer: "v1" } })).toEqual([]);
  });
});

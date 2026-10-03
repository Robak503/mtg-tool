/**
 * THE MANA-UNTAP LINE — manaUntapLine.js and its call sites (opponentAI.pickAction / pickAuraCast, the
 * legalChoices offer order through targeting's orderTargets hook).
 *
 * THE RULES (Colton, 2026-10-03): Candelabra of Tawnos / Magus of the Candelabra exist to untap Gaea's Cradle, or a
 * land with mana enchantments on it, and make a large amount of mana — "if it doesn't go mana positive then
 * there's no choice"; and mana enchantments stack on the SAME land.
 *
 * WHAT IS PINNED:
 *  - a land's value (its live mana, its Auras), read the same tapped or untapped;
 *  - the offer ORDER for "untap X target lands": the activating player's tapped lands first, by value — and the
 *    same set of offers as before;
 *  - the plan: the X most valuable lands for the X that nets the most, lands worth 2+ only, never a non-positive X;
 *  - the gates: own main phase, empty stack, an untap offered, a held card that cannot be paid for now and that
 *    the plan brings within reach;
 *  - the line end to end: float the lands' mana, untap them, cast the card;
 *  - a mana Aura goes to the land already carrying the most.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { legalActionsForPlayer, filterActions } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { pickAction } from "./opponentAI.js";
import {
  manaValueOf, isManaUntapAction, isManaUntapProgram, orderUntapTargets, bestUntapPlan, manaUntapLineAction, pickManaAuraTarget,
} from "./manaUntapLine.js";

beforeEach(() => _resetIdsForTests());

// ---- real card fixtures (generated from the bundled Scryfall data — never typed by hand) ----
const GAEAS_CRADLE = {"name":"Gaea's Cradle","type":"Legendary Land","mana":"","cmc":0,"keywords":[],"colors":[],"oracle":"{T}: Add {G} for each creature you control."};
const FOREST = {"name":"Forest","type":"Basic Land — Forest","mana":"","cmc":0,"keywords":[],"colors":[],"oracle":"({T}: Add {G}.)"};
const ISLAND = {"name":"Island","type":"Basic Land — Island","mana":"","cmc":0,"keywords":[],"colors":[],"oracle":"({T}: Add {U}.)"};
const WILD_GROWTH = {"name":"Wild Growth","type":"Enchantment — Aura","mana":"{G}","cmc":1,"keywords":["Enchant"],"colors":["G"],"oracle":"Enchant land\nWhenever enchanted land is tapped for mana, its controller adds an additional {G}."};
const CANDELABRA = {"name":"Candelabra of Tawnos","type":"Artifact","mana":"{1}","cmc":1,"keywords":[],"colors":[],"oracle":"{X}, {T}: Untap X target lands."};
const MAGUS = {"name":"Magus of the Candelabra","type":"Creature — Human Wizard","mana":"{G}","cmc":1,"keywords":[],"colors":["G"],"oracle":"{X}, {T}: Untap X target lands.","power":"1","toughness":"2"};
const SOL_RING = {"name":"Sol Ring","type":"Artifact","mana":"{1}","cmc":1,"keywords":[],"colors":[],"oracle":"{T}: Add {C}{C}."};
const GRIZZLY_BEARS = {"name":"Grizzly Bears","type":"Creature — Bear","mana":"{1}{G}","cmc":2,"keywords":[],"colors":["G"],"oracle":"","power":"2","toughness":"2"};
const CRATERHOOF = {"name":"Craterhoof Behemoth","type":"Creature — Beast","mana":"{5}{G}{G}{G}","cmc":8,"keywords":["Haste"],"colors":["G"],"oracle":"Haste\nWhen this creature enters, creatures you control gain trample and get +X/+X until end of turn, where X is the number of creatures you control.","power":"5","toughness":"5"};

const perm = (card, id, controller = "user", extra = {}) => ({
  ...createPermanent({ id, card: { ...card, id: `${id}-card` }, controller, summoningSick: false }),
  ...extra,
});
const bears = (n) => Array.from({ length: n }, (_, i) => perm(GRIZZLY_BEARS, `bear${i}`));
/** A land with `n` Wild Growths on it: [land, ...auras]. */
function enchanted(land, n) {
  const auras = Array.from({ length: n }, (_, i) => ({ ...perm(WILD_GROWTH, `${land.id}-growth${i}`), attachedTo: land.id }));
  return [{ ...land, attachments: auras.map((a) => a.id) }, ...auras];
}

function pod({ user = [], ai1 = [], hand = [], phase = "precombat-main", step = "main", activePlayer = "user", stack = [] } = {}) {
  const g = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
  return {
    ...g, phase, step, activePlayer, priorityHolder: "user", turn: 6, consecutivePasses: 0, stack,
    players: { ...g.players, user: { ...g.players.user, battlefield: user, hand }, ai1: { ...g.players.ai1, battlefield: ai1 } },
  };
}
const hoof = { ...CRATERHOOF, id: "hoof" };
const untapOffers = (state) => filterActions(legalActionsForPlayer(state, "user"), "activate-ability").filter(isManaUntapAction);
const targetIds = (action) => action.targets.map((t) => t.id);

describe("a land's value", () => {
  it("is its live mana plus every mana Aura on it — the same tapped or untapped", () => {
    const board = [
      perm(GAEAS_CRADLE, "cradle"), ...enchanted(perm(FOREST, "forest0"), 1), ...enchanted(perm(FOREST, "forest1"), 2),
      perm(FOREST, "plain"), perm(CANDELABRA, "cand"), ...bears(4),
    ];
    const state = pod({ user: board, ai1: [perm(ISLAND, "opp-island", "ai1")] });
    const tapped = pod({ user: board.map((p) => ({ ...p, tapped: true })), ai1: [perm(ISLAND, "opp-island", "ai1")] });
    for (const s of [state, tapped]) {
      expect(manaValueOf(s, "user", "cradle")).toBe(4);
      expect(manaValueOf(s, "user", "forest0")).toBe(2);
      expect(manaValueOf(s, "user", "forest1")).toBe(3);
      expect(manaValueOf(s, "user", "plain")).toBe(1);
      expect(manaValueOf(s, "user", "cand")).toBe(0);        // not a mana source
      expect(manaValueOf(s, "user", "opp-island")).toBe(0);  // not this player's
      expect(manaValueOf(s, "user", "nothing")).toBe(0);
    }
    expect(manaValueOf(pod({ user: [perm(GAEAS_CRADLE, "cradle")] }), "user", "cradle")).toBe(0); // no creatures
  });
});

describe("the offers for \"untap X target lands\"", () => {
  it("recognises the activation and nothing near it", () => {
    const state = pod({ user: [perm(CANDELABRA, "cand"), perm(FOREST, "f0"), perm(FOREST, "f1", "user", { tapped: true })] });
    const offers = untapOffers(state);
    expect(offers.length).toBeGreaterThan(0);
    const [a] = offers;
    expect(isManaUntapProgram(a.program)).toBe(true);
    const atom = a.program.atoms[0];
    expect(isManaUntapAction({ ...a, kind: "cast-spell" })).toBe(false);
    expect(isManaUntapAction({ ...a, xValue: undefined })).toBe(false);
    expect(isManaUntapAction({ ...a, targets: [] })).toBe(false);
    for (const changed of [{ op: "tap" }, { targetType: "creature" }, { targetCountX: false }]) {
      const program = { ...a.program, atoms: [{ ...atom, ...changed }] };
      expect(isManaUntapAction({ ...a, program })).toBe(false);
      expect(isManaUntapProgram(program)).toBe(false);
    }
    expect(isManaUntapProgram({ ...a.program, atoms: [atom, atom] })).toBe(false);
    expect(isManaUntapAction({ ...a, program: { ...a.program, atoms: [atom, atom] } })).toBe(false);
    expect(isManaUntapProgram(null)).toBe(false);
    expect(isManaUntapAction(null)).toBe(false);
  });

  it("orderUntapTargets: the player's TAPPED lands first by value, everything else in its given order", () => {
    const board = [
      perm(FOREST, "plain-tapped", "user", { tapped: true }), perm(FOREST, "untapped"),
      ...enchanted(perm(FOREST, "sprawl", "user", { tapped: true }), 2),
      perm(GAEAS_CRADLE, "cradle", "user", { tapped: true }), ...bears(5),
    ];
    const state = pod({ user: board, ai1: [perm(ISLAND, "opp-island", "ai1", { tapped: true })] });
    const targets = ["opp-island", "plain-tapped", "untapped", "sprawl", "cradle"].map((id) => ({ id }));
    expect(orderUntapTargets(state, "user", targets).map((t) => t.id))
      .toEqual(["cradle", "sprawl", "plain-tapped", "opp-island", "untapped"]);
    // an untapped Cradle has nothing to gain from an untap: it keeps its place
    const cradleUp = pod({ user: board.map((p) => (p.id === "cradle" ? { ...p, tapped: false } : p)) });
    expect(orderUntapTargets(cradleUp, "user", targets).map((t) => t.id))
      .toEqual(["sprawl", "plain-tapped", "opp-island", "untapped", "cradle"]);
  });

  it("the best set is the first one offered for each X — and the offers are the same set as ever", () => {
    // Cradle is LAST on the battlefield; the enchanted Forest is in the middle.
    const board = [
      perm(CANDELABRA, "cand"), perm(FOREST, "f0"), perm(FOREST, "f1"),
      ...enchanted(perm(FOREST, "sprawl", "user", { tapped: true }), 1), ...bears(4),
      perm(GAEAS_CRADLE, "cradle", "user", { tapped: true }),
    ];
    const offers = untapOffers(pod({ user: board, ai1: [perm(ISLAND, "opp-island", "ai1")] }));
    const forX = (x) => offers.filter((a) => a.xValue === x).map(targetIds);
    expect(forX(1)[0]).toEqual(["cradle"]);
    expect(forX(2)[0]).toEqual(["cradle", "sprawl"]);
    // 5 lands on the battlefield, 2 untapped sources to pay with → X = 1 and X = 2: C(5,1) + C(5,2) offers.
    expect(forX(1)).toHaveLength(5);
    expect(forX(2)).toHaveLength(10);
    const sets = new Set(offers.map((a) => [...targetIds(a)].sort().join("+")));
    expect(sets.size).toBe(15);
    expect(sets.has("f0+opp-island")).toBe(true);
  });
});

describe("the plan", () => {
  const board = (creatures, extra = []) => [
    perm(CANDELABRA, "cand"), perm(GAEAS_CRADLE, "cradle"), ...enchanted(perm(FOREST, "sprawl"), 1), perm(FOREST, "f0"), perm(FOREST, "f1"),
    ...bears(creatures), ...extra,
  ];

  it("takes the X most valuable lands for the X that nets the most; one-mana lands are never part of it", () => {
    const state = pod({ user: board(4) });
    const plan = bestUntapPlan(state, "user", untapOffers(state));
    // values: Cradle 4, enchanted Forest 2, Forests 1 → X=1 nets 3, X=2 nets 4, X=3 has no third land worth 2.
    expect(plan).toEqual({ lands: [{ id: "cradle", value: 4, tapped: false }, { id: "sprawl", value: 2, tapped: false }], x: 2, gain: 4 });
  });

  it("only lands are planned: a mana rock worth 2 is not something the untap can target", () => {
    const state = pod({ user: [perm(CANDELABRA, "cand"), perm(GAEAS_CRADLE, "cradle"), perm(SOL_RING, "ring"), perm(FOREST, "f0"), ...bears(4)] });
    expect(manaValueOf(state, "user", "ring")).toBe(2);
    // Cradle 4, Forest 1: X=1 nets 3; X=2 (Cradle + Forest) nets 3 as well — the smaller X stands.
    expect(bestUntapPlan(state, "user", untapOffers(state))).toEqual({ lands: [{ id: "cradle", value: 4, tapped: false }], x: 1, gain: 3 });
  });

  it("a bigger X that nets less is not taken", () => {
    // Cradle 2 (two creatures), enchanted Forest 2: X=1 nets 1, X=2 nets 2 → X=2. With one creature: Cradle 1 is out,
    // and only the enchanted Forest (2) is worth untapping → X=1 nets 1.
    const two = pod({ user: board(2) });
    expect(bestUntapPlan(two, "user", untapOffers(two))).toMatchObject({ x: 2, gain: 2 });
    const one = pod({ user: board(1) });
    expect(bestUntapPlan(one, "user", untapOffers(one))).toMatchObject({ x: 1, gain: 1, lands: [{ id: "sprawl", value: 2 }] });
  });

  it("the plan is null with no offers, and a land worth 1 never joins a plan", () => {
    const state = pod({ user: board(4) });
    expect(bestUntapPlan(state, "user", [])).toBe(null);
    // X=3 would add a one-mana Forest: 4 + 2 + 1 − 3 = 4, no better than X=2 — the smaller X stands.
    const offers = untapOffers(state);
    expect(offers.some((a) => a.xValue === 3)).toBe(true);
    expect(bestUntapPlan(state, "user", offers).x).toBe(2);
  });

  it("no land worth 2: no plan — \"if it doesn't go mana positive then there's no choice\"", () => {
    const state = pod({ user: [perm(CANDELABRA, "cand"), perm(FOREST, "f0"), perm(FOREST, "f1"), perm(FOREST, "f2")] });
    expect(untapOffers(state).length).toBeGreaterThan(0);
    expect(bestUntapPlan(state, "user", untapOffers(state))).toBe(null);
  });

  it("uses the activation's whole mana cost, and the cheaper of two untappers for an X", () => {
    const state = pod({ user: board(4) });
    const offers = untapOffers(state);
    const dearer = offers.map((a) => ({ ...a, cmc: a.cmc + 3 }));
    expect(bestUntapPlan(state, "user", dearer)).toMatchObject({ x: 2, gain: 1 });           // 6 − (2 + 3)
    expect(bestUntapPlan(state, "user", [...dearer, ...offers])).toMatchObject({ x: 2, gain: 4 });
    expect(bestUntapPlan(state, "user", offers.map((a) => ({ ...a, cmc: a.cmc + 5 })))).toBe(null);
  });
});

describe("the gates", () => {
  // Cradle 4 + enchanted Forest 2 + Forest 1 = 7 mana; Craterhoof costs 8; the plan nets 4 → reach 11.
  const board = [perm(CANDELABRA, "cand"), perm(GAEAS_CRADLE, "cradle"), ...enchanted(perm(FOREST, "sprawl"), 1), perm(FOREST, "f0"), ...bears(4)];
  const step = (state) => manaUntapLineAction(state, "user", legalActionsForPlayer(state, "user"));

  it("fires: the first step floats the most valuable land's mana", () => {
    expect(step(pod({ user: board, hand: [hoof] }))).toMatchObject({ kind: "tap-for-mana", permanentId: "cradle" });
  });

  it("needs a held card that cannot be paid for now", () => {
    expect(step(pod({ user: board, hand: [] }))).toBe(null);
    expect(step(pod({ user: board, hand: [{ ...FOREST, id: "land-in-hand" }] }))).toBe(null);
    expect(step(pod({ user: board, hand: [{ ...GRIZZLY_BEARS, id: "castable" }] }))).toBe(null); // already castable
  });

  it("needs the plan to bring that card within reach", () => {
    const farCard = { ...CRATERHOOF, id: "far", mana: "{9}{G}{G}{G}", cmc: 12 };
    expect(step(pod({ user: board, hand: [farCard] }))).toBe(null);
    const reachable = { ...CRATERHOOF, id: "near", mana: "{8}{G}{G}{G}", cmc: 11 };
    expect(step(pod({ user: board, hand: [reachable] }))).toMatchObject({ kind: "tap-for-mana", permanentId: "cradle" });
  });

  it("only on the seat's own main phase with an empty stack", () => {
    const actions = legalActionsForPlayer(pod({ user: board, hand: [hoof] }), "user");
    const at = (over) => manaUntapLineAction(pod({ user: board, hand: [hoof], ...over }), "user", actions);
    expect(at({})).not.toBe(null);
    expect(at({ phase: "postcombat-main" })).not.toBe(null);
    expect(at({ activePlayer: "ai1" })).toBe(null);
    expect(at({ phase: "combat", step: "declare-attackers" })).toBe(null);
    expect(at({ stack: [{ id: "stk-x", kind: "spell", controller: "ai1" }] })).toBe(null);
  });

  it("of two untappers offering the same lands, the cheaper activation is the one taken", () => {
    // Cradle and the enchanted Forest are already tapped, their 6 mana floating in the pool.
    const tapped = pod({ user: board.map((p) => (p.id === "cradle" || p.id === "sprawl" ? { ...p, tapped: true } : p)), hand: [hoof] });
    const state = { ...tapped, players: { ...tapped.players, user: { ...tapped.players.user, manaPool: { ...tapped.players.user.manaPool, G: 6 } } } };
    const actions = legalActionsForPlayer(state, "user");
    const dearer = actions.filter(isManaUntapAction).map((a) => ({ ...a, permanentId: "dear", cmc: a.cmc + 1 }));
    const taken = manaUntapLineAction(state, "user", [...dearer, ...actions]);
    expect(taken).toMatchObject({ kind: "activate-ability", permanentId: "cand", xValue: 2 });
    // the planned lands are tapped but that exact set is not on offer: no step
    const withoutTheSet = actions.filter((a) => !(isManaUntapAction(a) && a.xValue === 2 && a.targets.every((t) => t.id === "cradle" || t.id === "sprawl")));
    expect(manaUntapLineAction(state, "user", withoutTheSet)).toBe(null);
  });

  it("needs an untap activation on offer", () => {
    const noUntapper = board.filter((p) => p.id !== "cand");
    expect(step(pod({ user: noUntapper, hand: [hoof] }))).toBe(null);
    const tappedUntapper = board.map((p) => (p.id === "cand" ? { ...p, tapped: true } : p));
    expect(step(pod({ user: tappedUntapper, hand: [hoof] }))).toBe(null);
  });
});

describe("the line end to end", () => {
  const pick = (state) => pickAction(state, "user", legalActionsForPlayer(state, "user"));

  it("floats Cradle and the enchanted Forest, untaps both, and casts the card it could not pay for", () => {
    let state = pod({
      user: [perm(CANDELABRA, "cand"), perm(GAEAS_CRADLE, "cradle"), ...enchanted(perm(FOREST, "sprawl"), 1), perm(FOREST, "f0"), ...bears(4)],
      hand: [hoof],
    });
    expect(filterActions(legalActionsForPlayer(state, "user"), "cast-spell")).toHaveLength(0); // 7 mana, Craterhoof costs 8

    const first = pick(state);
    expect(first).toMatchObject({ kind: "tap-for-mana", permanentId: "cradle" });
    state = dispatchAction(state, first);
    const second = pick(state);
    expect(second).toMatchObject({ kind: "tap-for-mana", permanentId: "sprawl" });
    state = dispatchAction(state, second);

    const untap = pick(state);
    expect(untap).toMatchObject({ kind: "activate-ability", permanentId: "cand", xValue: 2 });
    expect([...targetIds(untap)].sort()).toEqual(["cradle", "sprawl"]);
    state = dispatchAction(state, untap);
    expect(state.stack).toHaveLength(1);
    expect(pick(state).kind).toBe("pass-priority"); // nothing more while the untap is on the stack
    const resolved = resolveTopOfStack(state);
    state = resolved.state ?? resolved;
    const lands = Object.fromEntries(state.players.user.battlefield.map((p) => [p.id, p.tapped]));
    expect(lands.cradle).toBe(false);
    expect(lands.sprawl).toBe(false);
    expect(lands.cand).toBe(true);

    expect(pick(state)).toMatchObject({ kind: "cast-spell", cardId: "hoof" });
  });

  it("Magus of the Candelabra does the same", () => {
    const state = pod({ user: [perm(MAGUS, "magus"), perm(GAEAS_CRADLE, "cradle"), perm(FOREST, "f0"), ...bears(4)], hand: [hoof] });
    // Magus is a creature too: Cradle is worth 5; 5 + 1 = 6 available, X=1 nets 4 → reach 10 ≥ 8.
    expect(pick(state)).toMatchObject({ kind: "tap-for-mana", permanentId: "cradle" });
  });

  it("with nothing worth untapping the AI leaves the untap alone", () => {
    const state = pod({ user: [perm(CANDELABRA, "cand"), perm(FOREST, "f0"), perm(FOREST, "f1"), perm(FOREST, "f2")], hand: [hoof] });
    expect(pick(state).kind).toBe("pass-priority");
  });
});

describe("mana enchantments stack on the same land", () => {
  const growth = { ...WILD_GROWTH, id: "growth-in-hand" };
  const auraCasts = (state) => filterActions(legalActionsForPlayer(state, "user"), "cast-spell").filter((a) => a.cardId === "growth-in-hand");

  it("the land already carrying a mana Aura takes the next one — not the first land by id", () => {
    const state = pod({ user: [perm(FOREST, "a-first-by-id"), ...enchanted(perm(FOREST, "sprawl"), 1), perm(FOREST, "f1")], hand: [growth] });
    expect(auraCasts(state).map((a) => a.targets[0].id).sort()).toEqual(["a-first-by-id", "f1", "sprawl"]);
    const picked = pickAction(state, "user", legalActionsForPlayer(state, "user"));
    expect(picked).toMatchObject({ kind: "cast-spell", cardId: "growth-in-hand" });
    expect(picked.targets[0].id).toBe("sprawl");
  });

  it("the land with MORE mana Auras wins", () => {
    const state = pod({ user: [...enchanted(perm(FOREST, "one"), 1), ...enchanted(perm(FOREST, "two"), 2), perm(FOREST, "f1")], hand: [growth] });
    expect(pickAction(state, "user", legalActionsForPlayer(state, "user")).targets[0].id).toBe("two");
  });

  it("with no enchanted land the pick is the first by id, as before", () => {
    const state = pod({ user: [perm(FOREST, "f1"), perm(FOREST, "a-first-by-id"), perm(FOREST, "f0")], hand: [growth] });
    expect(pickAction(state, "user", legalActionsForPlayer(state, "user")).targets[0].id).toBe("a-first-by-id");
  });

  it("pickManaAuraTarget: ties keep the given order; no options is null", () => {
    const state = pod({ user: [...enchanted(perm(FOREST, "x"), 1), ...enchanted(perm(FOREST, "y"), 1), perm(FOREST, "z")] });
    const act = (id) => ({ targets: [{ id }] });
    expect(pickManaAuraTarget(state, [act("z"), act("y"), act("x")]).targets[0].id).toBe("y");
    expect(pickManaAuraTarget(state, [act("z"), act("x"), act("y")]).targets[0].id).toBe("x");
    expect(pickManaAuraTarget(state, [act("gone"), act("z")]).targets[0].id).toBe("gone");
    expect(pickManaAuraTarget(state, [])).toBe(null);
  });
});

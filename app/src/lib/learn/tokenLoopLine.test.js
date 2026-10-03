/**
 * THE TOKEN-LOOP COMBO LINE — tokenLoopLine.js and its two call sites in opponentAI (pickAction, pickAttackPlan),
 * plus the runaway size guard in learnSession.
 *
 * THE RULE (Colton, 2026-10-03): a combo deck plays to its line — build the resource only until there is ENOUGH,
 * then forgo every other choice, then execute the finish. The case: The Unbeatable Squirrel Girl beside a
 * creatures-tap-for-mana effect and haste. The AI used to stack her ability on its own copy and double forever.
 *
 * WHAT IS PINNED:
 *  - which ability is the loop (mana-only cost, a self-counted creature token), and which near shapes are not;
 *  - "enough now" (the creatures that can attack kill every opponent through their untapped creatures) and
 *    "enough for next turn" (twice that, against every creature the opponents control);
 *  - the hold: no activation on top of its own copy, none while its own attack is under way, none once enough;
 *  - forgo: at enough-now the AI passes to combat instead of a land, and only on an empty stack;
 *  - the finish: one combat split across every opponent, consistent tick by tick, every attacker declared;
 *  - a seat with no loop ability gets none of it;
 *  - the size guard ends a runaway game engine-stuck.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { legalActionsForPlayer, filterActions } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { pickAction, pickAttackPlan } from "./opponentAI.js";
import { parseActivatedAbilities } from "./effects/abilities.js";
import { createGame } from "./gameApi.js";
import { advanceUntilDecision, runawaySize, RUNAWAY_LIMITS } from "./learnSession.js";
import {
  isTokenLoopAbility, tokenLoopSources, tokenLoopState, isTokenLoopAction, tokenLoopAttackPlan,
  swingNeeds, swingAttackers, splitLethal, NEXT_TURN_MARGIN,
} from "./tokenLoopLine.js";

beforeEach(() => _resetIdsForTests());

// ---- real card fixtures (generated from the bundled Scryfall data — never typed by hand) ----
const SQUIRREL_GIRL = {"name":"The Unbeatable Squirrel Girl","type":"Legendary Creature — Squirrel Human Hero","mana":"{1}{G}{G}{G}","cmc":4,"keywords":["I LOVE Squirrels!"],"colors":["G"],"oracle":"Do You Like Squirrels? — Whenever The Unbeatable Squirrel Girl enters or attacks, create a 1/1 green Squirrel creature token.\nI LOVE Squirrels! — {1}{G}{G}{G}: Create X 1/1 green Squirrel creature tokens, where X is the number of Squirrels you control.","power":"4","toughness":"4"};
const CONCORDANT_CROSSROADS = {"name":"Concordant Crossroads","type":"World Enchantment","mana":"{G}","cmc":1,"keywords":[],"colors":["G"],"oracle":"All creatures have haste."};
const FOREST = {"name":"Forest","type":"Basic Land — Forest","mana":"","cmc":0,"keywords":[],"colors":[],"oracle":"({T}: Add {G}.)"};
const GRIZZLY_BEARS = {"name":"Grizzly Bears","type":"Creature — Bear","mana":"{1}{G}","cmc":2,"keywords":[],"colors":["G"],"oracle":"","power":"2","toughness":"2"};
const WALL_OF_WOOD = {"name":"Wall of Wood","type":"Creature — Wall","mana":"{G}","cmc":1,"keywords":["Defender"],"colors":["G"],"oracle":"Defender (This creature can't attack.)","power":"0","toughness":"3"};
const KRENKO = {"name":"Krenko, Mob Boss","type":"Legendary Creature — Goblin Warrior","mana":"{2}{R}{R}","cmc":4,"keywords":[],"colors":["R"],"oracle":"{T}: Create X 1/1 red Goblin creature tokens, where X is the number of Goblins you control.","power":"3","toughness":"3"};
const ANT_QUEEN = {"name":"Ant Queen","type":"Creature — Insect","mana":"{3}{G}{G}","cmc":5,"keywords":[],"colors":["G"],"oracle":"{1}{G}: Create a 1/1 green Insect creature token.","power":"5","toughness":"5"};
const SHINY_IMPETUS = {"name":"Shiny Impetus","type":"Enchantment — Aura","mana":"{2}{R}","oracle":"Enchant creature\nEnchanted creature gets +2/+2 and is goaded. (It attacks each combat if able and attacks a player other than you if able.)\nWhenever enchanted creature attacks, you create a Treasure token. (It's an artifact with \"{T}, Sacrifice this token: Add one mana of any color.\")"};
const PACIFISM = {"name":"Pacifism","type":"Enchantment — Aura","mana":"{1}{W}","cmc":2,"keywords":["Enchant"],"colors":["W"],"oracle":"Enchant creature\nEnchanted creature can't attack or block."};
// The token the engine mints for her ability (effects/atoms/tokens.js builds exactly this card).
const SQUIRREL_TOKEN = { name: "Squirrel", type: "Token Creature — Squirrel", power: 1, toughness: 1, oracle: "", keywords: [], token: true, colors: ["G"] };

const perm = (card, id, controller, extra = {}) => ({
  ...createPermanent({ id, card: { ...card, id: `${id}-card` }, controller, summoningSick: false }),
  ...extra,
});
const squirrels = (n, extra = {}, prefix = "sq") => Array.from({ length: n }, (_, i) => perm(SQUIRREL_TOKEN, `${prefix}${i}`, "user", extra));
const bears = (n, seat, extra = {}, prefix = seat) => Array.from({ length: n }, (_, i) => perm(GRIZZLY_BEARS, `${prefix}-bear${i}`, seat, extra));
const forests = (n) => Array.from({ length: n }, (_, i) => perm(FOREST, `forest${i}`, "user"));

/** A four-seat pod on the user's precombat main. `user` is the battlefield of the seat under test. */
function pod({ user = [], ai1 = [], ai2 = [], ai3 = [], life = {}, hand = [], phase = "precombat-main", step = "main", activePlayer = "user" } = {}) {
  const g = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
  const boards = { user, ai1, ai2, ai3 };
  const players = {};
  for (const seat of ["user", "ai1", "ai2", "ai3"]) {
    players[seat] = { ...g.players[seat], battlefield: boards[seat], life: life[seat] ?? 3, hand: seat === "user" ? hand : [] };
  }
  return { ...g, players, phase, step, activePlayer, priorityHolder: "user", turn: 6, consecutivePasses: 0 };
}
const SG = () => perm(SQUIRREL_GIRL, "sg", "user");
const XR = () => perm(CONCORDANT_CROSSROADS, "xr", "user");
const loopAbility = (card) => parseActivatedAbilities(card).filter(isTokenLoopAbility);

describe("which ability is the loop", () => {
  it("Squirrel Girl's doubling ability is", () => {
    expect(loopAbility(SQUIRREL_GIRL).map((a) => a.index)).toEqual([0]);
  });

  it("a tap cost is not (Krenko, Mob Boss — once per untap)", () => {
    expect(parseActivatedAbilities(KRENKO)[0].program.atoms[0].countFor?.kind).toBe("permanentsYouControl");
    expect(loopAbility(KRENKO)).toEqual([]);
  });

  it("a fixed count is not (Ant Queen — it does not feed itself)", () => {
    expect(parseActivatedAbilities(ANT_QUEEN)[0].program.atoms[0].op).toBe("create-token");
    expect(loopAbility(ANT_QUEEN)).toEqual([]);
  });

  it("every other cost or limit disqualifies the same ability", () => {
    const [base] = parseActivatedAbilities(SQUIRREL_GIRL);
    expect(isTokenLoopAbility(base)).toBe(true);
    const variants = {
      tapSelf: true, sacSelf: true, exileSelf: true, costX: true, discardRandom: true, payLife: 2, payEnergy: 1, discardCard: 1,
      sacOther: "creature", sacCount: 2, sacX: "creature", removeCounter: { type: "+1/+1" }, tapCreature: "creature",
      exileGyCount: 1, discardCardFilter: "land", returnLand: "land", unattachEquipment: true,
      activationLimit: { perTurn: 1 }, condition: "you control a Forest", manaPips: "", modeled: false, costModeled: false,
    };
    for (const [field, value] of Object.entries(variants)) {
      expect(isTokenLoopAbility({ ...base, [field]: value }), field).toBe(false);
    }
    const atom = base.program.atoms[0];
    const programs = [
      { ...base.program, confidence: "low" },
      { ...base.program, structure: "modal" },
      { ...base.program, atoms: [atom, atom] },
      { ...base.program, atoms: [{ ...atom, op: "draw" }] },
      { ...base.program, atoms: [{ ...atom, power: undefined }] },
      { ...base.program, atoms: [{ ...atom, toughness: undefined }] },
      { ...base.program, atoms: [{ ...atom, countFor: { kind: "opponentsControl" } }] },
      { ...base.program, atoms: [{ ...atom, countFor: undefined }] },
      null,
    ];
    for (const program of programs) expect(isTokenLoopAbility({ ...base, program })).toBe(false);
    expect(isTokenLoopAbility(null)).toBe(false);
  });

  it("tokenLoopSources finds her on the battlefield and nothing else", () => {
    const state = pod({ user: [SG(), XR(), perm(KRENKO, "krenko", "user"), perm(ANT_QUEEN, "queen", "user"), ...squirrels(3)] });
    expect([...tokenLoopSources(state, "user")].map(([id, set]) => [id, [...set]])).toEqual([["sg", [0]]]);
    expect(tokenLoopSources(state, "ai1").size).toBe(0);
  });
});

describe("splitLethal — every opponent dead in one combat", () => {
  const ones = (n, prefix = "a") => Array.from({ length: n }, (_, i) => ({ id: `${prefix}${String(i).padStart(2, "0")}`, power: 1 }));
  const needs = [{ id: "ai1", life: 2, blockers: 0 }, { id: "ai2", life: 3, blockers: 1 }, { id: "ai3", life: 4, blockers: 0 }];
  const countBy = (assignment) => { const m = {}; for (const d of assignment.values()) m[d] = (m[d] || 0) + 1; return m; };

  it("needs life + blockers attackers of power 1 per opponent — exactly", () => {
    expect(splitLethal(ones(9), needs)).toBe(null);
    expect(countBy(splitLethal(ones(10), needs))).toEqual({ ai1: 2, ai2: 4, ai3: 4 });
    expect(splitLethal(ones(14), needs).size).toBe(10); // uses only what the kill needs
  });

  it("a blocker stops the BIGGEST attacker sent at its controller", () => {
    const one = [{ id: "ai1", life: 4, blockers: 1 }];
    expect(splitLethal([{ id: "big", power: 4 }, ...ones(3)], one)).toBe(null);       // 4 blocked, 3 through
    expect(splitLethal([{ id: "big", power: 4 }, ...ones(4)], one).size).toBe(5);     // 4 blocked, 4 through
  });

  it("fills the cheapest kill first (life + blockers, then seat id) with the biggest attackers first", () => {
    const tied = [{ id: "ai3", life: 2, blockers: 0 }, { id: "ai2", life: 1, blockers: 1 }, { id: "ai1", life: 5, blockers: 0 }];
    const a = splitLethal([{ id: "x", power: 1 }, { id: "big", power: 3 }, { id: "y", power: 1 }, { id: "w", power: 1 }, { id: "z", power: 1 }, ...ones(4)], tied);
    // ai2 and ai3 tie at 2 → ai2 first: big (blocked) + a00; then ai3: a01 + a02; then ai1: a03, w, x, y, z.
    expect(a.get("big")).toBe("ai2");
    expect(a.get("a00")).toBe("ai2");
    expect(a.get("a01")).toBe("ai3");
    expect(a.get("a02")).toBe("ai3");
    for (const id of ["a03", "w", "x", "y", "z"]) expect(a.get(id), id).toBe("ai1");
    expect(countBy(a)).toEqual({ ai2: 2, ai3: 2, ai1: 5 });
  });

  it("counts attackers already committed to an opponent", () => {
    const committed = new Map([["ai2", [1, 1, 1]], ["ai1", [1, 1]]]);
    expect(countBy(splitLethal(ones(5), needs, { committed }))).toEqual({ ai2: 1, ai3: 4 });
    expect(splitLethal(ones(4), needs, { committed })).toBe(null);
  });

  it("times: 2 asks for twice the life", () => {
    const one = [{ id: "ai1", life: 3, blockers: 1 }];
    expect(splitLethal(ones(6), one, { times: 2 })).toBe(null);
    expect(splitLethal(ones(7), one, { times: 2 }).size).toBe(7);
    expect(NEXT_TURN_MARGIN).toBe(2);
  });

  it("no living opponent is not a finish", () => {
    expect(splitLethal(ones(5), [])).toBe(null);
  });
});

describe("what can swing, and what it must get through", () => {
  it("now: untapped, and either not summoning sick or hasty; never a defender", () => {
    const board = [SG(), perm(WALL_OF_WOOD, "wall", "user"), ...squirrels(2), ...squirrels(2, { tapped: true }, "tapped"), ...squirrels(2, { summoningSick: true }, "sick")];
    const now = swingAttackers(pod({ user: board }), "user").map((a) => a.id).sort();
    expect(now).toEqual(["sg", "sq0", "sq1"]);
    const withHaste = swingAttackers(pod({ user: [...board, XR()] }), "user").map((a) => a.id).sort();
    expect(withHaste).toEqual(["sg", "sick0", "sick1", "sq0", "sq1"]);
    expect(swingAttackers(pod({ user: board }), "user").find((a) => a.id === "sg").power).toBe(4);
  });

  it("a creature that can't attack (Pacifism) is never counted, now or next turn", () => {
    const aura = { ...perm(PACIFISM, "pacifism", "ai1"), attachedTo: "sq0" };
    const tokens = squirrels(2);
    tokens[0] = { ...tokens[0], attachments: ["pacifism"] };
    const state = pod({ user: tokens, ai1: [aura] });
    expect(swingAttackers(state, "user").map((a) => a.id)).toEqual(["sq1"]);
    expect(swingAttackers(state, "user", { nextTurn: true }).map((a) => a.id)).toEqual(["sq1"]);
  });

  it("next turn: every creature the seat controls, still never a defender", () => {
    const board = [SG(), perm(WALL_OF_WOOD, "wall", "user"), ...squirrels(2, { tapped: true }, "tapped"), ...squirrels(2, { summoningSick: true }, "sick"), ...forests(1)];
    expect(swingAttackers(pod({ user: board }), "user", { nextTurn: true }).map((a) => a.id).sort())
      .toEqual(["sg", "sick0", "sick1", "tapped0", "tapped1"]);
  });

  it("needs: untapped creatures block now, every creature blocks next turn; a dead opponent needs nothing", () => {
    const state = pod({
      ai1: [...bears(2, "ai1"), ...bears(1, "ai1", { tapped: true }, "ai1-tapped")], ai2: [perm(FOREST, "ai2-forest", "ai2")], ai3: bears(1, "ai3"),
      life: { ai1: 7, ai2: 5, ai3: 0 },
    });
    expect(swingNeeds(state, "user")).toEqual([{ id: "ai1", life: 7, blockers: 2 }, { id: "ai2", life: 5, blockers: 0 }]);
    expect(swingNeeds(state, "user", { nextTurn: true })).toEqual([{ id: "ai1", life: 7, blockers: 3 }, { id: "ai2", life: 5, blockers: 0 }]);
  });
});

describe("tokenLoopState — enough, and the hold", () => {
  // Life 3 each and ai1 has one untapped Bear. Squirrel Girl (4) alone kills ai2; ai3 takes 3 Squirrels; ai1 takes 4
  // (the Bear blocks one) → the finish needs her and 7 Squirrels able to attack.
  const opposing = { ai1: bears(1, "ai1") };

  it("a seat with no loop ability has no line", () => {
    expect(tokenLoopState(pod({ user: [perm(KRENKO, "krenko", "user"), perm(ANT_QUEEN, "queen", "user"), ...bears(30, "user")] }), "user")).toBe(null);
  });

  it("one short of the kill: keep building", () => {
    const state = pod({ user: [SG(), XR(), ...squirrels(6)], ...opposing });
    const loop = tokenLoopState(state, "user");
    expect(loop.finishNow).toBe(false);
    expect(loop.holdLoop).toBe(false);
  });

  it("enough now: finish, and hold the loop", () => {
    const state = pod({ user: [SG(), XR(), ...squirrels(7)], ...opposing });
    expect(tokenLoopState(state, "user")).toMatchObject({ finishNow: true, holdLoop: true });
  });

  it("enough now counts only what can attack: tapped Squirrels do not", () => {
    const state = pod({ user: [SG(), XR(), ...squirrels(4), ...squirrels(12, { tapped: true }, "tapped")], ...opposing });
    expect(tokenLoopState(state, "user").finishNow).toBe(false);
  });

  it("enough now needs haste for summoning-sick Squirrels", () => {
    const sick = squirrels(12, { summoningSick: true });
    expect(tokenLoopState(pod({ user: [SG(), ...sick], ...opposing }), "user").finishNow).toBe(false);
    expect(tokenLoopState(pod({ user: [SG(), XR(), ...sick], ...opposing }), "user").finishNow).toBe(true);
  });

  it("the finish is only before attackers on the seat's own turn", () => {
    const board = { user: [SG(), XR(), ...squirrels(10)], ...opposing };
    expect(tokenLoopState(pod({ ...board, step: "beginning-of-combat", phase: "combat" }), "user").finishNow).toBe(true);
    expect(tokenLoopState(pod({ ...board, step: "declare-attackers", phase: "combat" }), "user").finishNow).toBe(false);
    expect(tokenLoopState(pod({ ...board, phase: "postcombat-main" }), "user").finishNow).toBe(false);
    expect(tokenLoopState(pod({ ...board, activePlayer: "ai1" }), "user").finishNow).toBe(false);
  });

  it("enough for next turn: twice the kill against EVERY opposing creature, tapped ones included", () => {
    // No haste, all sick: nothing swings now. Next turn each opponent must take 6 (twice life 3), and ai1 has two
    // creatures to block with: ai2 takes Squirrel Girl + 2 Squirrels, ai3 takes 6, ai1 takes 8 → 16 Squirrels.
    const opp = { ai1: [...bears(1, "ai1"), ...bears(1, "ai1", { tapped: true }, "ai1-tapped")] };
    const short = pod({ user: [SG(), ...squirrels(15, { summoningSick: true })], ...opp });
    const enough = pod({ user: [SG(), ...squirrels(16, { summoningSick: true })], ...opp });
    expect(tokenLoopState(short, "user")).toMatchObject({ finishNow: false, holdLoop: false });
    expect(tokenLoopState(enough, "user")).toMatchObject({ finishNow: false, holdLoop: true });
  });

  it("holds while its own activation is on the stack, and not for another seat's object", () => {
    const state = pod({ user: [SG(), XR(), ...forests(4)] });
    const activate = filterActions(legalActionsForPlayer(state, "user"), "activate-ability").find((a) => a.permanentId === "sg");
    expect(isTokenLoopAction(tokenLoopState(state, "user"), activate)).toBe(true);
    const after = dispatchAction(state, activate);
    expect(after.stack).toHaveLength(1);
    expect(tokenLoopState(after, "user").holdLoop).toBe(true);
    const foreign = { ...after, stack: after.stack.map((o) => ({ ...o, controller: "ai1" })) };
    expect(tokenLoopState(foreign, "user").holdLoop).toBe(false);
    const otherSource = { ...after, stack: after.stack.map((o) => ({ ...o, payload: { ...o.payload, params: { ...o.payload.params, sourceId: "xr" } } })) };
    expect(tokenLoopState(otherSource, "user").holdLoop).toBe(false);
    const notAnAbility = { ...after, stack: after.stack.map((o) => ({ ...o, kind: "spell" })) };
    expect(tokenLoopState(notAnAbility, "user").holdLoop).toBe(false);
  });

  it("holds while its own attack is under way", () => {
    const base = pod({ user: [SG(), XR(), ...squirrels(2)], phase: "combat", step: "declare-attackers" });
    expect(tokenLoopState(base, "user").holdLoop).toBe(false);
    const swinging = { ...base, combat: { attackers: [{ permanentId: "sq0", attackingPlayer: "user", defender: "ai1" }] } };
    expect(tokenLoopState(swinging, "user").holdLoop).toBe(true);
    const theirs = { ...base, activePlayer: "ai1", combat: { attackers: [{ permanentId: "x", attackingPlayer: "ai1", defender: "user" }] } };
    expect(tokenLoopState(theirs, "user").holdLoop).toBe(false);
    const staleRecord = { ...base, activePlayer: "ai1", combat: { attackers: [{ permanentId: "sq0", attackingPlayer: "user", defender: "ai1" }] } };
    expect(tokenLoopState(staleRecord, "user").holdLoop).toBe(false);
  });

  it("isTokenLoopAction matches the source and the ability index only", () => {
    const loop = tokenLoopState(pod({ user: [SG()] }), "user");
    expect(isTokenLoopAction(loop, { kind: "activate-ability", permanentId: "sg", abilityIndex: 0 })).toBe(true);
    expect(isTokenLoopAction(loop, { kind: "activate-ability", permanentId: "sg", abilityIndex: 1 })).toBe(false);
    expect(isTokenLoopAction(loop, { kind: "activate-ability", permanentId: "other", abilityIndex: 0 })).toBe(false);
    expect(isTokenLoopAction(loop, { kind: "cast-spell", permanentId: "sg", abilityIndex: 0 })).toBe(false);
    expect(isTokenLoopAction(null, { kind: "activate-ability", permanentId: "sg", abilityIndex: 0 })).toBe(false);
  });
});

describe("pickAction — build, hold, forgo", () => {
  const opposing = { ai1: bears(1, "ai1") };
  const handForest = { ...FOREST, id: "hand-forest" };
  const pick = (state) => pickAction(state, "user", legalActionsForPlayer(state, "user"));

  it("short of enough: activates the loop", () => {
    const state = pod({ user: [SG(), XR(), ...squirrels(2), ...forests(4)], ...opposing });
    expect(pick(state)).toMatchObject({ kind: "activate-ability", permanentId: "sg", abilityIndex: 0 });
  });

  it("never on top of its own copy: with the activation on the stack it passes", () => {
    const state = pod({ user: [SG(), XR(), ...squirrels(2), ...forests(8)], ...opposing });
    const after = dispatchAction(state, pick(state));
    expect(filterActions(legalActionsForPlayer(after, "user"), "activate-ability").some((a) => a.permanentId === "sg")).toBe(true); // still offered
    expect(pick(after).kind).toBe("pass-priority");
  });

  it("enough now: forgoes the land drop and the loop, and passes to combat", () => {
    const state = pod({ user: [SG(), XR(), ...squirrels(10), ...forests(4)], ...opposing, hand: [handForest] });
    const actions = legalActionsForPlayer(state, "user");
    expect(filterActions(actions, "play-land")).toHaveLength(1);
    expect(filterActions(actions, "activate-ability").some((a) => a.permanentId === "sg")).toBe(true);
    expect(pickAction(state, "user", actions).kind).toBe("pass-priority");
  });

  it("one short of enough, the land drop comes first as always", () => {
    const state = pod({ user: [SG(), XR(), ...squirrels(6), ...forests(4)], ...opposing, hand: [handForest] });
    expect(pick(state).kind).toBe("play-land");
  });

  it("the forgo-everything pass is for an empty stack: with something on it the ordinary order stands", () => {
    const state = pod({ user: [SG(), XR(), ...squirrels(10), ...forests(4)], ...opposing, hand: [handForest] });
    const busy = { ...state, stack: [{ id: "stk-x", kind: "spell", controller: "ai1", card: { ...GRIZZLY_BEARS, id: "x" }, targets: [] }] };
    const actions = [...legalActionsForPlayer(state, "user")]; // the empty-stack offers, replayed against the busy stack
    expect(pickAction(busy, "user", actions).kind).toBe("play-land");
    expect(pickAction(state, "user", actions).kind).toBe("pass-priority");
  });

  it("enough for next turn: holds the loop but plays on normally", () => {
    const sick = squirrels(16, { summoningSick: true });
    const state = pod({ user: [SG(), ...sick, ...forests(4)], ai1: [...bears(1, "ai1"), ...bears(1, "ai1", { tapped: true }, "ai1-tapped")], hand: [handForest] });
    expect(pick(state).kind).toBe("play-land");
    const noLand = { ...state, players: { ...state.players, user: { ...state.players.user, hand: [] } } };
    expect(filterActions(legalActionsForPlayer(noLand, "user"), "activate-ability").some((a) => a.permanentId === "sg")).toBe(true);
    expect(pick(noLand).kind).toBe("pass-priority");
  });

  it("the hold is on the loop ability only: another token maker beside her is still activated", () => {
    const state = pod({ user: [SG(), perm(ANT_QUEEN, "queen", "user"), ...forests(8)], ...opposing });
    const sgAction = filterActions(legalActionsForPlayer(state, "user"), "activate-ability").find((a) => a.permanentId === "sg");
    const after = dispatchAction(state, sgAction);
    expect(tokenLoopState(after, "user").holdLoop).toBe(true);
    expect(pick(after)).toMatchObject({ kind: "activate-ability", permanentId: "queen" });
  });

  it("a seat without the loop keeps activating its token maker (Ant Queen)", () => {
    const state = pod({ user: [perm(ANT_QUEEN, "queen", "user"), XR(), ...bears(20, "user"), ...forests(4)], ...opposing });
    expect(tokenLoopState(state, "user")).toBe(null);
    expect(pick(state)).toMatchObject({ kind: "activate-ability", permanentId: "queen" });
  });
});

describe("pickAttackPlan — the finish", () => {
  const attackState = (user, rest = {}) => pod({ user, phase: "combat", step: "declare-attackers", ...rest });
  const attackerActions = (state) => filterActions(legalActionsForPlayer(state, "user"), "declare-attacker");
  const tally = (plan) => { const m = {}; for (const a of plan) m[a.defenderId] = (m[a.defenderId] || 0) + 1; return m; };
  // life: ai1 3 + one Bear, ai2 2, ai3 5 → the split needs 4 + 2 + 5 through (order ai2, ai1, ai3).
  const board = { ai1: bears(1, "ai1"), life: { ai1: 3, ai2: 2, ai3: 5 } };

  it("splits one combat across every opponent and declares every attacker", () => {
    const state = attackState([SG(), XR(), ...squirrels(12)], board);
    const plan = pickAttackPlan(state, "user", attackerActions(state));
    expect(plan).toHaveLength(13);
    expect(new Set(plan.map((a) => a.permanentId)).size).toBe(13);
    // SG (the biggest) goes first, at the cheapest kill (ai2: life 2). ai1 takes 4 Squirrels, ai3 takes 5;
    // the 3 left over pile onto ai2.
    expect(plan[0]).toMatchObject({ permanentId: "sg", defenderId: "ai2" });
    expect(tally(plan)).toEqual({ ai2: 4, ai1: 4, ai3: 5 });
    expect(plan.every((a) => !a.defenderPlaneswalkerId)).toBe(true);
  });

  it("is the same plan tick by tick as attackers are committed", () => {
    let state = attackState([SG(), XR(), ...squirrels(12)], board);
    const full = pickAttackPlan(state, "user", attackerActions(state));
    const expected = tally(full);
    const declared = {};
    for (let i = 0; i < 13; i++) {
      const next = pickAttackPlan(state, "user", attackerActions(state))[0];
      declared[next.defenderId] = (declared[next.defenderId] || 0) + 1;
      state = dispatchAction(state, next);
    }
    expect(attackerActions(state)).toHaveLength(0);
    expect(declared).toEqual(expected);
  });

  it("short of killing everyone: the ordinary plan (one focused opponent)", () => {
    const state = attackState([SG(), XR(), ...squirrels(5)], board);
    const actions = attackerActions(state);
    expect(tokenLoopAttackPlan(state, "user", actions)).toBe(null);
    expect(new Set(pickAttackPlan(state, "user", actions).map((a) => a.defenderId)).size).toBe(1);
  });

  it("a seat without the loop keeps the ordinary plan even when it could kill everyone", () => {
    const state = attackState([XR(), ...bears(12, "user")], board);
    const actions = attackerActions(state);
    expect(tokenLoopAttackPlan(state, "user", actions)).toBe(null);
    const plan = pickAttackPlan(state, "user", actions);
    expect(plan).toHaveLength(12);
    expect(new Set(plan.map((a) => a.defenderId))).toEqual(new Set(["ai2"])); // the lowest life, as before
  });

  it("a goaded attacker keeps the ordinary plan (it may not be sent at its goader)", () => {
    const aura = { ...perm(SHINY_IMPETUS, "impetus", "ai2"), attachedTo: "sq0" };
    const tokens = squirrels(12);
    tokens[0] = { ...tokens[0], attachments: ["impetus"] };
    const state = attackState([SG(), XR(), ...tokens], { ...board, ai2: [aura] });
    const actions = attackerActions(state);
    expect(tokenLoopAttackPlan(state, "user", actions)).toBe(null);
    const goadedAttack = pickAttackPlan(state, "user", actions).find((a) => a.permanentId === "sq0");
    expect(goadedAttack.defenderId).not.toBe("ai2");
  });

  it("no offered attackers, or only planeswalker attacks, is no finish", () => {
    const state = attackState([SG(), XR(), ...squirrels(12)], board);
    expect(tokenLoopAttackPlan(state, "user", [])).toBe(null);
    const walkerOnly = attackerActions(state).map((a) => ({ ...a, defenderPlaneswalkerId: "pw" }));
    expect(tokenLoopAttackPlan(state, "user", walkerOnly)).toBe(null);
  });

  it("an attacker that cannot attack the opponent it is sent at cancels the finish", () => {
    const state = attackState([SG(), XR(), ...squirrels(12)], board);
    const withoutSgAtAi2 = attackerActions(state).filter((a) => !(a.permanentId === "sg" && a.defenderId === "ai2"));
    expect(tokenLoopAttackPlan(state, "user", withoutSgAtAi2)).toBe(null);
  });
});

describe("the runaway size guard", () => {
  it("runawaySize names the stack or the seat past a limit, and nothing at the limit", () => {
    const state = pod({ user: squirrels(5) });
    expect(runawaySize(state)).toBe(null);
    expect(runawaySize(state, { stack: 500, battlefield: 5 })).toBe(null);
    expect(runawaySize(state, { stack: 500, battlefield: 4 })).toBe("battlefield (5 permanents, user)");
    const stacked = { ...state, stack: [{}, {}, {}] };
    expect(runawaySize(stacked, { stack: 3, battlefield: 2000 })).toBe(null);
    expect(runawaySize(stacked, { stack: 2, battlefield: 2000 })).toBe("stack (3 objects)");
    expect(RUNAWAY_LIMITS).toEqual({ stack: 500, battlefield: 2000 });
    expect(runawaySize({})).toBe(null);
  });

  it("ends the game engine-stuck the moment a seat is past the limit", () => {
    const deck = (prefix) => [
      ...Array.from({ length: 24 }, (_, i) => ({ ...FOREST, id: `${prefix}-f-${i}` })),
      ...Array.from({ length: 16 }, (_, i) => ({ ...GRIZZLY_BEARS, id: `${prefix}-b-${i}` })),
    ];
    const game = () => createGame({ userDeck: deck("u"), opponentDeck: deck("a"), difficulty: "expert", mode: "standard", seed: "runaway-guard" });
    const { decision } = advanceUntilDecision(game(), { runawayLimits: { stack: 500, battlefield: 2 } });
    expect(decision.kind).toBe("engine-stuck");
    expect(String(decision.reason)).toMatch(/^runaway battlefield \(3 permanents, (user|ai)\)$/);
    // The shipped limits never trip on a real game.
    const normal = advanceUntilDecision(game());
    expect(normal.decision.kind).toBe("game-over");
  });
});

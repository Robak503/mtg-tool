/**
 * tokenLoopEveryWindow.test.js — the token loop's "enough" judgment holds in every window the default AI activates in, not only
 * its own main phase.
 *
 * THE RULE (Colton, 2026-10-03): a combo deck builds its resource only to "enough" — lethal by any route on the battlefield —
 * then forgoes every other choice and executes the finish. tokenLoopLine.tokenLoopState reads it (`holdLoop`: its own copy is on
 * the stack, its attack is under way, the swing kills everyone now or twice over next turn, or a sacrifice outlet's route is
 * complete). Until this file, only the main phase's generic picker read `holdLoop`; the activation windows opened on 2026-10-20
 * (the end-step sink, the save in response, the pump after blocks) read the activations offered outside the default windows
 * without it, and the end-step sink takes a token maker. The standard A/B's game 16 (seed 3816266519): at the end step of the
 * seat whose turn came right before hers, The Unbeatable Squirrel Girl's seat — 167 creatures against one opponent at 40 with
 * two creatures, `holdLoop` true — activated "I LOVE Squirrels!" four times (160, 320, 640, 1,280 tokens) and the runaway size
 * guard ended the game at 2,572 permanents.
 *
 * WHAT IS PINNED: the loop is held at that end step once there is enough — by combat next turn, by a mill outlet, by a shot
 * outlet — and a real session from that end step reaches her turn and wins; short of enough the end-step sink still builds; the
 * windows' other gains stay (another token maker's sink beside the held loop, a save in response, a pump after blocks); the
 * other instant-speed windows never activate the loop; `endStep: "v1"` still restores the pass.
 *
 * Card text: the bundled Scryfall oracle snapshot (scryfall-bulk/oracle-index.json), copied verbatim.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { pickAction } from "./opponentAI.js";
import { createGame } from "./gameApi.js";
import { advanceUntilDecision } from "./learnSession.js";
import { tokenLoopState } from "./tokenLoopLine.js";

beforeEach(() => _resetIdsForTests());

// ── the bundled oracle (verbatim) ───────────────────────────────────────────────────────────────────────────────────────
const SQUIRREL_GIRL = {"name":"The Unbeatable Squirrel Girl","type":"Legendary Creature — Squirrel Human Hero","mana":"{1}{G}{G}{G}","cmc":4,"power":"4","toughness":"4","keywords":["I LOVE Squirrels!"],"colors":["G"],"oracle":"Do You Like Squirrels? — Whenever The Unbeatable Squirrel Girl enters or attacks, create a 1/1 green Squirrel creature token.\nI LOVE Squirrels! — {1}{G}{G}{G}: Create X 1/1 green Squirrel creature tokens, where X is the number of Squirrels you control."};
const CONCORDANT_CROSSROADS = {"name":"Concordant Crossroads","type":"World Enchantment","mana":"{G}","cmc":1,"keywords":[],"colors":["G"],"oracle":"All creatures have haste."};
const CRYPTOLITH_RITE = {"name":"Cryptolith Rite","type":"Enchantment","mana":"{1}{G}","cmc":2,"keywords":[],"colors":["G"],"oracle":"Creatures you control have \"{T}: Add one mana of any color.\""};
const ALTAR_OF_DEMENTIA = {"name":"Altar of Dementia","type":"Artifact","mana":"{2}","cmc":2,"keywords":["Mill"],"colors":[],"oracle":"Sacrifice a creature: Target player mills cards equal to the sacrificed creature's power."};
const GOBLIN_BOMBARDMENT = {"name":"Goblin Bombardment","type":"Enchantment","mana":"{1}{R}","cmc":2,"keywords":[],"colors":["R"],"oracle":"Sacrifice a creature: This enchantment deals 1 damage to any target."};
const BIOGENIC_OOZE = {"name":"Biogenic Ooze","type":"Creature — Ooze","mana":"{3}{G}{G}","cmc":5,"power":"2","toughness":"2","keywords":[],"colors":["G"],"oracle":"When this creature enters, create a 2/2 green Ooze creature token.\nAt the beginning of your end step, put a +1/+1 counter on each Ooze you control.\n{1}{G}{G}{G}: Create a 2/2 green Ooze creature token."};
const SELFLESS_SAVIOR = {"name":"Selfless Savior","type":"Creature — Dog","mana":"{W}","cmc":1,"power":"1","toughness":"1","keywords":[],"colors":["W"],"oracle":"Sacrifice this creature: Another target creature you control gains indestructible until end of turn. (Damage and effects that say \"destroy\" don't destroy it.)"};
const NYLEA = {"name":"Nylea, God of the Hunt","type":"Legendary Enchantment Creature — God","mana":"{3}{G}","cmc":4,"power":"6","toughness":"6","keywords":["Indestructible"],"colors":["G"],"oracle":"Indestructible\nAs long as your devotion to green is less than five, Nylea isn't a creature. (Each {G} in the mana costs of permanents you control counts toward your devotion to green.)\nOther creatures you control have trample.\n{3}{G}: Target creature gets +2/+2 until end of turn."};
const MURDER = {"name":"Murder","type":"Instant","mana":"{1}{B}{B}","cmc":3,"keywords":[],"colors":["B"],"oracle":"Destroy target creature."};
const GRIZZLY_BEARS = {"name":"Grizzly Bears","type":"Creature — Bear","mana":"{1}{G}","cmc":2,"power":"2","toughness":"2","keywords":[],"colors":["G"],"oracle":""};
const FOREST = {"name":"Forest","type":"Basic Land — Forest","mana":"","cmc":0,"keywords":[],"colors":[],"oracle":"({T}: Add {G}.)"};
const SWAMP = {"name":"Swamp","type":"Basic Land — Swamp","mana":"","cmc":0,"keywords":[],"colors":[],"oracle":"({T}: Add {B}.)"};
// The token the engine mints for her ability (effects/atoms/tokens.js builds exactly this card).
const SQUIRREL_TOKEN = { name: "Squirrel", type: "Token Creature — Squirrel", power: 1, toughness: 1, oracle: "", keywords: [], token: true, colors: ["G"] };

// ── boards ───────────────────────────────────────────────────────────────────────────────────────────────────────────
const perm = (card, id, controller, extra = {}) => ({ ...createPermanent({ id, card: { ...card, id: `${id}-card` }, controller, summoningSick: false }), ...extra });
const many = (n, card, seat, prefix, extra = {}) => Array.from({ length: n }, (_, i) => perm(card, `${prefix}${i}`, seat, extra));
const squirrels = (n, extra = {}) => many(n, SQUIRREL_TOKEN, "user", "sq", extra);
const forests = (n) => many(n, FOREST, "user", "forest");
const cards = (n, seat) => Array.from({ length: n }, (_, i) => ({ ...GRIZZLY_BEARS, id: `${seat}-lib${i}` }));
const SG = () => perm(SQUIRREL_GIRL, "sg", "user");

/**
 * A four-seat pod; the seat under test is "user" (The Unbeatable Squirrel Girl's). By default it is the END STEP of ai3 — the seat
 * whose turn comes right before the user's — and the user holds priority with the stack empty: the end-step sink's window.
 */
function pod({ user = [], ai1 = [], ai2 = [], ai3 = [], life = {}, library = {}, hand = [], at = {} } = {}) {
  const { active = "ai3", phase = "ending", step = "end", holder = "user" } = at;
  const g = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
  const boards = { user, ai1, ai2, ai3 };
  const players = {};
  for (const seat of ["user", "ai1", "ai2", "ai3"]) {
    players[seat] = { ...g.players[seat], battlefield: boards[seat], life: life[seat] ?? 40, hand: seat === "user" ? hand : [], library: cards(library[seat] ?? 20, seat) };
  }
  return { ...g, players, phase, step, activePlayer: active, priorityHolder: holder, turn: 8, consecutivePasses: holder === active ? 0 : 1, stack: [], pendingTriggers: [], combat: { attackers: [], blockers: [] } };
}
const offers = (state) => legalActionsForPlayer(state, "user");
const pick = (state, policy = null) => pickAction(state, "user", offers(state), { policy });
const loopOffered = (state) => offers(state).some((a) => a.kind === "activate-ability" && a.permanentId === "sg");
const isLoop = (a) => a?.kind === "activate-ability" && a.permanentId === "sg";

describe("the end step before its turn — enough holds the loop", () => {
  it("⭐ enough by combat next turn (Squirrel Girl and six Squirrels against three opponents at 1 with no creatures): it passes, the doubling ability offered and paid for", () => {
    const state = pod({ user: [SG(), ...squirrels(6), ...forests(8)], life: { ai1: 1, ai2: 1, ai3: 1 } });
    const loop = tokenLoopState(state, "user");
    expect({ finishNow: loop.finishNow, holdLoop: loop.holdLoop }).toEqual({ finishNow: false, holdLoop: true });
    expect(loopOffered(state)).toBe(true);
    const a = pick(state);
    expect(isLoop(a)).toBe(false);
    expect(a.kind).toBe("pass-priority");
  });

  it("⭐ enough by a mill outlet (Altar of Dementia: nine Squirrels cover three libraries of three; the swing is far short): it passes", () => {
    const state = pod({
      user: [SG(), perm(ALTAR_OF_DEMENTIA, "altar", "user"), ...squirrels(9), ...forests(8)],
      ai1: many(10, GRIZZLY_BEARS, "ai1", "b1-"), ai2: many(10, GRIZZLY_BEARS, "ai2", "b2-"), ai3: many(10, GRIZZLY_BEARS, "ai3", "b3-"),
      library: { ai1: 3, ai2: 3, ai3: 3 },
    });
    const loop = tokenLoopState(state, "user");
    expect({ complete: loop.outlet.complete, millLive: loop.outlet.mill.live, holdLoop: loop.holdLoop }).toEqual({ complete: true, millLive: true, holdLoop: true });
    expect(loopOffered(state)).toBe(true);
    const a = pick(state);
    expect(isLoop(a)).toBe(false);
    expect(a.kind).toBe("pass-priority");
  });

  it("⭐ enough by a shot outlet (Goblin Bombardment: six Squirrels cover three opponents at 2; their ten blockers each stop the swing): it passes", () => {
    const state = pod({
      user: [SG(), perm(GOBLIN_BOMBARDMENT, "bombard", "user"), ...squirrels(6), ...forests(8)],
      ai1: many(10, GRIZZLY_BEARS, "ai1", "b1-"), ai2: many(10, GRIZZLY_BEARS, "ai2", "b2-"), ai3: many(10, GRIZZLY_BEARS, "ai3", "b3-"),
      life: { ai1: 2, ai2: 2, ai3: 2 },
    });
    const loop = tokenLoopState(state, "user");
    expect({ complete: loop.outlet.complete, shotLive: loop.outlet.shot.live, holdLoop: loop.holdLoop }).toEqual({ complete: true, shotLive: true, holdLoop: true });
    expect(loopOffered(state)).toBe(true);
    const a = pick(state);
    expect(isLoop(a)).toBe(false);
    expect(a.kind).toBe("pass-priority");
  });

  it("⭐ a real session from that end step (game 16's shape — Cryptolith Rite and Concordant Crossroads make every new Squirrel a hasty mana source): no doubling there; on its own turn it swings and wins", () => {
    const deck = (prefix) => [
      ...Array.from({ length: 24 }, (_, i) => ({ ...FOREST, id: `${prefix}-f-${i}` })),
      ...Array.from({ length: 16 }, (_, i) => ({ ...GRIZZLY_BEARS, id: `${prefix}-b-${i}` })),
    ];
    const session = createGame({ userDeck: deck("u"), opponentDeck: deck("a"), difficulty: "expert", mode: "standard", seed: "loop-end-step" });
    const s = session.state;
    const me = s.activePlayer;
    const other = Object.keys(s.players).find((id) => id !== me);
    const P = (id, card, extra = {}) => ({ ...createPermanent({ id, card: { ...card, id: `${id}-card` }, controller: me, summoningSick: false }), ...extra });
    const battlefield = [P("sg", SQUIRREL_GIRL), P("rite", CRYPTOLITH_RITE), P("xr", CONCORDANT_CROSSROADS),
      ...Array.from({ length: 6 }, (_, i) => P(`sq-${i}`, SQUIRREL_TOKEN)), ...Array.from({ length: 4 }, (_, i) => P(`land-${i}`, FOREST))];
    const start = {
      ...session,
      state: {
        ...s, turn: 3, phase: "ending", step: "end", activePlayer: other, priorityHolder: me, consecutivePasses: 1, stack: [], pendingTriggers: [],
        players: { ...s.players, [me]: { ...s.players[me], battlefield, hand: [] }, [other]: { ...s.players[other], battlefield: [], hand: [], life: 3 } },
      },
    };
    const doublings = {};
    const recordDecision = (row) => {
      if (row?.seat === me && row.action?.kind === "activate-ability" && row.action?.permanentId === "sg") doublings[`t${row.turn}`] = (doublings[`t${row.turn}`] || 0) + 1;
    };
    const { session: out, decision } = advanceUntilDecision(start, { recordDecision, runawayLimits: { stack: 400, battlefield: 300 } });
    expect(doublings.t3 ?? 0).toBe(0);
    expect({ kind: decision.kind, status: out.status, turn: out.state.turn }).toEqual({ kind: "game-over", status: me === "user" ? "user-wins" : "ai-wins", turn: 4 });
    expect(out.state.players[me].battlefield.length).toBeLessThan(30);
  });
});

describe("controls — the end step's other choices, and the other windows", () => {
  it("short of enough the end-step sink still builds: Squirrel Girl and two Squirrels against opponents at 40 — the doubling ability", () => {
    const state = pod({ user: [SG(), ...squirrels(2), ...forests(8)], ai1: many(2, GRIZZLY_BEARS, "ai1", "b1-") });
    expect(tokenLoopState(state, "user").holdLoop).toBe(false);
    expect(pick(state)).toMatchObject({ kind: "activate-ability", permanentId: "sg", abilityIndex: 0 });
  });

  it("the sink's other token maker beside the held loop is still activated (Biogenic Ooze's {1}{G}{G}{G})", () => {
    const state = pod({ user: [SG(), perm(BIOGENIC_OOZE, "ooze", "user"), ...squirrels(6), ...forests(8)], life: { ai1: 1, ai2: 1, ai3: 1 } });
    expect(tokenLoopState(state, "user").holdLoop).toBe(true);
    expect(pick(state)).toMatchObject({ kind: "activate-ability", permanentId: "ooze" });
  });

  it("`endStep: \"v1\"` (the old pass) does not activate the loop at that end step, enough or not", () => {
    const short = pod({ user: [SG(), ...squirrels(2), ...forests(8)], ai1: many(2, GRIZZLY_BEARS, "ai1", "b1-") });
    expect(pick(short, { endStep: "v1" }).kind).toBe("pass-priority");
  });

  it("another opponent's end step is not that window: at ai1's end step it passes even short of enough", () => {
    const state = pod({ user: [SG(), ...squirrels(2), ...forests(8)], at: { active: "ai1" } });
    expect(tokenLoopState(state, "user").holdLoop).toBe(false);
    expect(pick(state).kind).toBe("pass-priority");
  });

  it("an opponent's upkeep is no window for the loop, short of enough or past it", () => {
    const short = pod({ user: [SG(), ...squirrels(2), ...forests(8)], at: { active: "ai1", phase: "beginning", step: "upkeep" } });
    const enough = pod({ user: [SG(), ...squirrels(6), ...forests(8)], life: { ai1: 1, ai2: 1, ai3: 1 }, at: { active: "ai1", phase: "beginning", step: "upkeep" } });
    expect(loopOffered(short)).toBe(true);
    expect(pick(short).kind).toBe("pass-priority");
    expect(pick(enough).kind).toBe("pass-priority");
  });

  it("a save in response for the loop seat: Murder at Squirrel Girl is answered by Selfless Savior, not by the loop", () => {
    const base = pod({ user: [SG(), perm(SELFLESS_SAVIOR, "savior", "user"), ...squirrels(2), ...forests(8)], ai1: many(3, SWAMP, "ai1", "sw-"),
      at: { active: "ai1", phase: "precombat-main", step: "main", holder: "ai1" } });
    const withMurder = { ...base, players: { ...base.players, ai1: { ...base.players.ai1, hand: [{ ...MURDER, id: "murder" }] } } };
    const cast = legalActionsForPlayer(withMurder, "ai1").find((a) => a.kind === "cast-spell" && a.cardId === "murder" && a.targets?.[0]?.id === "sg");
    expect(cast).toBeTruthy();
    let responding = dispatchAction(withMurder, cast);
    for (let g = 0; g < 4 && responding.priorityHolder !== "user"; g++) {
      responding = dispatchAction(responding, legalActionsForPlayer(responding, responding.priorityHolder).find((a) => a.kind === "pass-priority"));
    }
    expect(responding.priorityHolder).toBe("user");
    expect(responding.stack.map((o) => [o.kind, o.controller])).toEqual([["spell", "ai1"]]);
    expect(pick(responding)).toMatchObject({ kind: "activate-ability", permanentId: "savior", targets: [{ id: "sg" }] });
  });

  it("a pump after blocks for the loop seat: Nylea's +2/+2 on its blocking Grizzly Bears against ai1's Bears (its creature lives, theirs dies)", () => {
    const bear = perm(GRIZZLY_BEARS, "mybear", "user");
    const theirs = perm(GRIZZLY_BEARS, "theirbear", "ai1");
    let s = pod({ user: [SG(), perm(NYLEA, "nylea", "user"), bear, ...forests(4)], ai1: [theirs], at: { active: "ai1", phase: "combat", step: "declare-attackers", holder: "ai1" } });
    const act = (st, pid, kind, pred = () => true) => {
      const action = legalActionsForPlayer(st, pid).filter((a) => a.kind === kind).find(pred);
      if (!action) throw new Error(`no ${kind} offered to ${pid} at ${st.step}`);
      return dispatchAction(st, action);
    };
    s = act(s, "ai1", "declare-attacker", (a) => a.permanentId === "theirbear" && a.defenderId === "user");
    s = act(s, "ai1", "pass-priority");
    for (let g = 0; g < 20 && s.step !== "declare-blockers"; g++) s = act(s, s.priorityHolder, "pass-priority");
    expect(s.step).toBe("declare-blockers");
    let blocked = false;
    for (let g = 0; g < 20; g++) {
      if (!s.combat?.blockDeclarationOpen && s.priorityHolder === "user" && blocked) break;
      if (s.priorityHolder === "user" && !blocked) { s = act(s, "user", "declare-blocker", (a) => a.permanentId === "mybear" && a.attackerId === "theirbear"); blocked = true; }
      s = act(s, s.priorityHolder, "pass-priority");
    }
    expect(s.priorityHolder).toBe("user");
    expect(s.combat.blockDeclarationOpen).toBeFalsy();
    expect(pick(s)).toMatchObject({ kind: "activate-ability", permanentId: "nylea", targets: [{ id: "mybear" }] });
  });
});

/**
 * outletRouteCanComplete.test.js — an outlet route that cannot complete never outbids "enough" by combat, and the outlet line
 * never asks for a doubling that would carry the board past its cap.
 *
 * THE RULE (Colton, 2026-10-03, binding): "there's never a reason to actually make infinite squirrels … make squirrels, then forgo
 * all other choices, then a winning combo line." "'Enough' = lethal by ANY route on board, and the AI must take that route." With
 * combat lethal next turn on the battlefield, that is enough: the loop stops. It keeps building toward a sacrifice-outlet finish
 * (outletFinishLine.js) only while that route can actually complete.
 *
 * THE CASE (the Squirrel Girl batch's game 29, seed 3964194058): Altar of the Brood's mill route ("Whenever another permanent you
 * control enters, each opponent mills a card.") against the Omnath, Locus of Mana seat, whose Kozilek, Butcher of Truth ("When
 * Kozilek is put into a graveyard from anywhere, its owner shuffles their graveyard into their library.") shuffled the milled cards
 * back each time the Altar reached it. The route could never finish, yet `wantsMore` stayed true under the 600-permanent cap and
 * outbid enough-by-combat; the cap was read on the board BEFORE the doubling, so at 593 permanents she doubled 576 Squirrels —
 * 1,169 permanents and 576 Altar triggers, past the runaway guard's 500-object stack.
 *
 * WHAT IS PINNED: a living opponent whose graveyard a reshuffle has put back into their library (the public record of this game —
 * the engine's own log line; Kozilek's trigger or an Elixir of Immortality) blocks every mill route, so with enough by combat the
 * loop holds, in the main phase and at the end step before her turn alike; a "live" mill route against that library is not fired,
 * and its emptied libraries are done but not complete; the outlet line asks for a doubling only while the board it leaves stays
 * under OUTLET_BOARD_CAP (a token doubler and an extra token per creation counted); a real session in game 29's shape stops
 * building at enough and wins by combat. Controls: a mill route that can complete still builds past enough by combat (its
 * finishes are outletFinishLine.test.js's driver cases, unchanged); short of enough the loop still builds; a dead opponent's
 * reshuffle, a reshuffle that moved nothing, her own reshuffle and a shot route block nothing.
 *
 * Card text: the bundled Scryfall oracle snapshot (scryfall-bulk/oracle-index.json), copied verbatim. The Squirrel is the token the
 * engine mints for her ability. Every reshuffle here is the engine's own: Kozilek is milled by the Altar and its trigger resolves,
 * or an Elixir of Immortality is activated and resolves.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { pickAction } from "./opponentAI.js";
import { createGame } from "./gameApi.js";
import { advanceUntilDecision } from "./learnSession.js";
import { tokenLoopState } from "./tokenLoopLine.js";
import { OUTLET_BOARD_CAP, outletState } from "./outletFinishLine.js";

beforeEach(() => _resetIdsForTests());

// ── the bundled oracle (verbatim) ───────────────────────────────────────────────────────────────────────────────────────
const SQUIRREL_GIRL = {"name":"The Unbeatable Squirrel Girl","type":"Legendary Creature — Squirrel Human Hero","mana":"{1}{G}{G}{G}","cmc":4,"power":"4","toughness":"4","keywords":["I LOVE Squirrels!"],"colors":["G"],"oracle":"Do You Like Squirrels? — Whenever The Unbeatable Squirrel Girl enters or attacks, create a 1/1 green Squirrel creature token.\nI LOVE Squirrels! — {1}{G}{G}{G}: Create X 1/1 green Squirrel creature tokens, where X is the number of Squirrels you control."};
const ALTAR_OF_THE_BROOD = {"name":"Altar of the Brood","type":"Artifact","mana":"{1}","cmc":1,"keywords":["Mill"],"colors":[],"oracle":"Whenever another permanent you control enters, each opponent mills a card."};
const ALTAR_OF_DEMENTIA = {"name":"Altar of Dementia","type":"Artifact","mana":"{2}","cmc":2,"keywords":["Mill"],"colors":[],"oracle":"Sacrifice a creature: Target player mills cards equal to the sacrificed creature's power."};
const BLASTING_STATION = {"name":"Blasting Station","type":"Artifact","mana":"{3}","cmc":3,"keywords":[],"colors":[],"oracle":"{T}, Sacrifice a creature: This artifact deals 1 damage to any target.\nWhenever a creature enters, you may untap this artifact."};
const KOZILEK = {"name":"Kozilek, Butcher of Truth","type":"Legendary Creature — Eldrazi","mana":"{10}","cmc":10,"power":"12","toughness":"12","keywords":["Annihilator"],"colors":[],"oracle":"When you cast this spell, draw four cards.\nAnnihilator 4 (Whenever this creature attacks, defending player sacrifices four permanents of their choice.)\nWhen Kozilek is put into a graveyard from anywhere, its owner shuffles their graveyard into their library."};
const ELIXIR = {"name":"Elixir of Immortality","type":"Artifact","mana":"{1}","cmc":1,"keywords":[],"colors":[],"oracle":"{2}, {T}: You gain 5 life. Shuffle this artifact and your graveyard into their owner's library."};
const PEREGRIN_TOOK = {"name":"Peregrin Took","type":"Legendary Creature — Halfling Citizen","mana":"{2}{G}","cmc":3,"power":"2","toughness":"3","keywords":["Food"],"colors":["G"],"oracle":"If one or more tokens would be created under your control, those tokens plus an additional Food token are created instead. (It's an artifact with \"{2}, {T}, Sacrifice this token: You gain 3 life.\")\nSacrifice three Foods: Draw a card."};
const PARALLEL_LIVES = {"name":"Parallel Lives","type":"Enchantment","mana":"{3}{G}","cmc":4,"keywords":[],"colors":["G"],"oracle":"If an effect would create one or more tokens under your control, it creates twice that many of those tokens instead."};
const CRYPTOLITH_RITE = {"name":"Cryptolith Rite","type":"Enchantment","mana":"{1}{G}","cmc":2,"keywords":[],"colors":["G"],"oracle":"Creatures you control have \"{T}: Add one mana of any color.\""};
const FOREST = {"name":"Forest","type":"Basic Land — Forest","mana":"","cmc":0,"keywords":[],"colors":[],"oracle":"({T}: Add {G}.)"};
const GRIZZLY_BEARS = {"name":"Grizzly Bears","type":"Creature — Bear","mana":"{1}{G}","cmc":2,"power":"2","toughness":"2","keywords":[],"colors":["G"],"oracle":""};
// The token the engine mints for her ability (effects/atoms/tokens.js builds exactly this card).
const SQUIRREL_TOKEN = { name: "Squirrel", type: "Token Creature — Squirrel", power: 1, toughness: 1, oracle: "", keywords: [], token: true, colors: ["G"] };

// ── boards ───────────────────────────────────────────────────────────────────────────────────────────────────────────
const perm = (card, id, controller = "user", extra = {}) => ({ ...createPermanent({ id, card: { ...card, id: `${id}-card` }, controller, summoningSick: false }), ...extra });
const many = (n, card, seat, prefix, extra = {}) => Array.from({ length: n }, (_, i) => perm(card, `${prefix}${String(i).padStart(3, "0")}`, seat, extra));
// Summoning-sick Squirrels: none of them can attack this turn, so the swing is next turn's (no finish now).
const squirrels = (n, extra = {}) => many(n, SQUIRREL_TOKEN, "user", "sq", { summoningSick: true, ...extra });
const forests = (n) => many(n, FOREST, "user", "forest");
const SG = () => perm(SQUIRREL_GIRL, "sg");
const BROOD = () => perm(ALTAR_OF_THE_BROOD, "brood");
const libraryOf = (seat, n, top = []) => [...top, ...Array.from({ length: n }, (_, i) => ({ ...GRIZZLY_BEARS, id: `${seat}-lib${i}` }))];

/**
 * A four-seat pod. The seat under test is "user" (The Unbeatable Squirrel Girl's); by default it is its own precombat main phase
 * with priority and a full pool. `library` is per seat (a count or a card list, top first); `life` per seat.
 */
function pod({ user = [], ai1 = [], ai2 = [], ai3 = [], life = {}, library = {}, at = {} } = {}) {
  const { active = "user", phase = "precombat-main", step = "main", holder = "user" } = at;
  const g = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
  const boards = { user, ai1, ai2, ai3 };
  const players = {};
  for (const seat of ["user", "ai1", "ai2", "ai3"]) {
    const lib = library[seat];
    players[seat] = { ...g.players[seat], battlefield: boards[seat], life: life[seat] ?? 40, hand: [],
      library: Array.isArray(lib) ? lib : libraryOf(seat, lib ?? 20),
      manaPool: seat === "user" ? { ...g.players[seat].manaPool, G: 40, C: 10 } : g.players[seat].manaPool };
  }
  return { ...g, players, phase, step, activePlayer: active, priorityHolder: holder, turn: 8, consecutivePasses: holder === active ? 0 : 1,
    stack: [], pendingTriggers: [], combat: { attackers: [], blockers: [] } };
}
const offers = (state) => legalActionsForPlayer(state, "user");
const pick = (state) => pickAction(state, "user", offers(state));
const isLoop = (a) => a?.kind === "activate-ability" && a.permanentId === "sg";
const loopOffered = (state) => offers(state).some(isLoop);

/** Activate her ability and resolve the whole stack (the tokens, the Altar's mills, Kozilek's trigger) — the engine's own work. */
function loopAndResolve(state) {
  const action = offers(state).find(isLoop);
  let s = resolveTopOfStack(dispatchAction(state, action));
  for (let guard = 0; guard < 400 && (s.stack || []).length > 0; guard++) s = resolveTopOfStack(s);
  expect(s.stack).toHaveLength(0);
  return { ...s, priorityHolder: "user", consecutivePasses: 0 };
}
const refills = (state) => (state.log || []).filter((e) => e?.effect === "shuffle-graveyard-into-library").map((e) => [e.controller, e.moved]);

/**
 * The game-29 board after one doubling: ai1's Kozilek was on top of its library, the Altar milled it, its trigger shuffled ai1's
 * graveyard back. Three opponents at `life` with no creatures; she has Squirrel Girl, the Altar, `extra` and `n` sick Squirrels.
 */
function afterKozilek({ n = 6, life = 2, extra = [], deadAfter = null } = {}) {
  const start = pod({ user: [SG(), BROOD(), ...extra, ...squirrels(n), ...forests(8)], life: { ai1: life, ai2: life, ai3: life },
    library: { ai1: libraryOf("ai1", 30, [{ ...KOZILEK, id: "kozilek" }]), ai2: 30, ai3: 30 } });
  let s = loopAndResolve(start);
  if (deadAfter) s = { ...s, players: { ...s.players, [deadAfter]: { ...s.players[deadAfter], life: 0 } } };
  return s;
}

describe("a mill route against a library a reshuffle refills cannot complete — enough by combat holds the loop", () => {
  it("the engine's own reshuffle: Kozilek milled by Altar of the Brood shuffles ai1's graveyard back into its library", () => {
    const s = afterKozilek();
    // The doubling makes seven Squirrels: seven Altar triggers. The first mills Kozilek, its trigger resolves next and puts it back
    // (its graveyard held only Kozilek), and the other six mill on.
    expect(refills(s)).toEqual([["ai1", 1]]);
    expect(s.players.ai1.library.map((c) => c.id)).toContain("kozilek");
    expect(s.players.ai1.graveyard).toHaveLength(6);
    expect(s.players.ai2.library).toHaveLength(30 - 7);
  });

  it("⭐ with enough by combat next turn, the main phase holds the loop: the route is not asked for more and the pick is not the loop", () => {
    const s = afterKozilek(); // 13 Squirrels (her 4 power beside them) against three opponents at 2 with no creatures: 17 against 2 × 6
    const loop = tokenLoopState(s, "user");
    expect({ finishNow: loop.finishNow, complete: loop.outlet.complete, canComplete: loop.outlet.canComplete, wantsMore: loop.outlet.wantsMore, holdLoop: loop.holdLoop })
      .toEqual({ finishNow: false, complete: false, canComplete: false, wantsMore: false, holdLoop: true });
    expect(loopOffered(s)).toBe(true);
    expect(isLoop(pick(s))).toBe(false);
  });

  it("⭐ the same at the end step before her turn (the every-window hold): it passes, the doubling offered and paid for", () => {
    const s = { ...afterKozilek(), phase: "ending", step: "end", activePlayer: "ai3", priorityHolder: "user", consecutivePasses: 1 };
    expect(tokenLoopState(s, "user").holdLoop).toBe(true);
    expect(loopOffered(s)).toBe(true);
    expect(pick(s).kind).toBe("pass-priority");
  });

  it("⭐ Altar of Dementia's route against that library is not live: no Squirrel is fed to it, and enough by combat holds the loop", () => {
    // The libraries are cut to three cards each, so the 13 Squirrels' power covers all nine.
    const s0 = afterKozilek({ extra: [perm(ALTAR_OF_DEMENTIA, "dementia")] });
    const s = { ...s0, players: Object.fromEntries(Object.entries(s0.players).map(([id, p]) => [id, id === "user" ? p : { ...p, library: p.library.slice(0, 3) }])) };
    expect(s.players.ai1.library.length + s.players.ai2.library.length + s.players.ai3.library.length).toBe(9);
    const o = outletState(s, "user");
    expect({ millLive: o.mill.live, complete: o.complete, canComplete: o.canComplete }).toEqual({ millLive: false, complete: false, canComplete: false });
    const a = pick(s);
    expect(a?.name === "Altar of Dementia").toBe(false);
    expect(isLoop(a)).toBe(false);
  });

  it("⭐ a library emptied after a reshuffle is not the end of it: every library empty is done, but not complete", () => {
    const s0 = afterKozilek();
    const s = { ...s0, players: Object.fromEntries(Object.entries(s0.players).map(([id, p]) => [id, id === "user" ? p : { ...p, library: [] }])) };
    const o = outletState(s, "user");
    expect({ done: o.done, complete: o.complete, canComplete: o.canComplete, wantsMore: o.wantsMore }).toEqual({ done: true, complete: false, canComplete: false, wantsMore: false });
  });

  it("⭐ a reshuffle permanent: ai1's Elixir of Immortality, activated with three cards in its graveyard, blocks the route", () => {
    const s = afterElixir({ seat: "ai1", graveyard: 3 });
    expect(refills(s)).toEqual([["ai1", 3]]);
    expect(s.players.ai1.library).toHaveLength(20 + 3 + 1); // its graveyard and the Elixir itself
    const loop = tokenLoopState(s, "user");
    expect({ canComplete: loop.outlet.canComplete, wantsMore: loop.outlet.wantsMore, holdLoop: loop.holdLoop }).toEqual({ canComplete: false, wantsMore: false, holdLoop: true });
    expect(isLoop(pick(s))).toBe(false);
  });
});

/**
 * `seat` controls Elixir of Immortality and activates it with `graveyard` cards in its graveyard (the engine's own activation and
 * resolution); then it is the user's main phase with Squirrel Girl, the Altar and 20 sick Squirrels against three opponents at 2
 * (an opponent's Elixir gains it 5): 24 power against 2 × 11, enough by combat next turn.
 */
function afterElixir({ seat, graveyard }) {
  const elixir = perm(ELIXIR, "elixir", seat);
  const user = [SG(), BROOD(), ...squirrels(20), ...forests(8)];
  const boards = seat === "user" ? { user: [...user, elixir] } : { user, [seat]: [elixir] };
  const base = pod({ ...boards, life: { ai1: 2, ai2: 2, ai3: 2 }, at: { active: seat, holder: seat } });
  const p = base.players[seat];
  const ready = { ...base, players: { ...base.players, [seat]: { ...p, manaPool: { ...p.manaPool, C: 2 }, graveyard: Array.from({ length: graveyard }, (_, i) => ({ ...GRIZZLY_BEARS, id: `${seat}-gy${i}` })) } } };
  const activate = legalActionsForPlayer(ready, seat).find((a) => a.kind === "activate-ability" && a.permanentId === "elixir");
  expect(activate).toBeTruthy();
  let s = dispatchAction(ready, activate);
  for (let guard = 0; guard < 20 && (s.stack || []).length > 0; guard++) s = resolveTopOfStack(s);
  expect(s.stack).toHaveLength(0);
  return { ...s, activePlayer: "user", priorityHolder: "user", consecutivePasses: 0 };
}

describe("the outlet cap counts the permanents the doubling would make", () => {
  // Libraries of 900: the Altar's route is nowhere near complete, and nothing has refilled them.
  const board = (k, extra = []) => pod({ user: [SG(), BROOD(), ...extra, ...squirrels(k)], life: { ai1: 1, ai2: 1, ai3: 1 }, library: { ai1: 900, ai2: 900, ai3: 900 } });

  it("⭐ 402 permanents, a doubling of 401: not asked for (it would leave 803), so enough by combat holds the loop", () => {
    const s = board(400);
    expect(s.players.user.battlefield).toHaveLength(402);
    const loop = tokenLoopState(s, "user");
    expect({ complete: loop.outlet.complete, canComplete: loop.outlet.canComplete, wantsMore: loop.outlet.wantsMore, holdLoop: loop.holdLoop })
      .toEqual({ complete: false, canComplete: true, wantsMore: false, holdLoop: true });
    expect(isLoop(pick(s))).toBe(false);
  });

  it("⭐ the boundary: the board the doubling leaves must stay under the cap (a Forest beside them evens the sum)", () => {
    const under = board(297, [perm(FOREST, "f-extra")]); // 300 permanents + 298 = 598
    const at = board(298, [perm(FOREST, "f-extra")]);    // 301 permanents + 299 = 600
    expect(OUTLET_BOARD_CAP).toBe(600);
    expect(tokenLoopState(under, "user").outlet.wantsMore).toBe(true);
    expect(tokenLoopState(at, "user").outlet.wantsMore).toBe(false);
  });

  it("⭐ a token doubler counts: with Parallel Lives each doubling makes twice X", () => {
    const lives = () => [perm(PARALLEL_LIVES, "lives")];
    expect(tokenLoopState(board(198, lives()), "user").outlet.wantsMore).toBe(true);  // 201 + 2 × 199 = 599
    expect(tokenLoopState(board(199, lives()), "user").outlet.wantsMore).toBe(false); // 202 + 2 × 200 = 602
  });

  it("⭐ an extra token per creation counts: Peregrin Took's Food (Took is no Squirrel; a Forest evens the sum)", () => {
    const took = () => [perm(PEREGRIN_TOOK, "took"), perm(FOREST, "f-extra")];
    expect(tokenLoopState(board(296, took()), "user").outlet.wantsMore).toBe(true);  // 300 + (297 + 1) = 598
    expect(tokenLoopState(board(297, took()), "user").outlet.wantsMore).toBe(false); // 301 + (298 + 1) = 600
  });
});

describe("a real session in game 29's shape", () => {
  it("⭐ Squirrel Girl, Cryptolith Rite and Altar of the Brood against a library holding Kozilek: two doublings to enough, then the swing wins", () => {
    const deck = (p) => [...Array.from({ length: 30 }, (_, i) => ({ ...FOREST, id: `${p}-f-${i}` })), ...Array.from({ length: 30 }, (_, i) => ({ ...GRIZZLY_BEARS, id: `${p}-b-${i}` }))];
    const session = createGame({ userDeck: deck("u"), opponentDeck: deck("a"), difficulty: "expert", mode: "standard", seed: "outlet-route" });
    const s = session.state;
    const me = s.activePlayer;
    const other = Object.keys(s.players).find((id) => id !== me);
    const P = (id, card, extra = {}) => ({ ...createPermanent({ id, card: { ...card, id: `${id}-card` }, controller: me, summoningSick: false }), ...extra });
    // Thirty Squirrels that can tap for mana through the Rite (and attack: 34 power against 40 life is no finish this turn). The first
    // doubling leaves 61 and Squirrel Girl (65 power, short of 2 × 40); the second 123 (127): enough by combat next turn.
    const battlefield = [P("sg", SQUIRREL_GIRL), P("rite", CRYPTOLITH_RITE), P("brood", ALTAR_OF_THE_BROOD),
      ...Array.from({ length: 30 }, (_, i) => P(`sq-${i}`, SQUIRREL_TOKEN)), ...Array.from({ length: 6 }, (_, i) => P(`land-${i}`, FOREST))];
    expect(s.players[other].life).toBe(40);
    // 41 cards, Kozilek on top: the first doubling's 31 Altar triggers mill it first and then 30 more, so the library is never emptied,
    // and every later doubling reaches Kozilek again.
    const library = [{ ...KOZILEK, id: "kozilek" }, ...s.players[other].library.slice(0, 40)];
    expect(library).toHaveLength(41);
    const start = { ...session, state: { ...s, players: { ...s.players, [me]: { ...s.players[me], battlefield }, [other]: { ...s.players[other], library } } } };
    const doublings = {};
    const recordDecision = (row) => {
      if (row?.seat === me && row.action?.kind === "activate-ability" && row.action?.permanentId === "sg") doublings[`t${row.turn}`] = (doublings[`t${row.turn}`] || 0) + 1;
    };
    const { session: out, decision } = advanceUntilDecision(start, { recordDecision, runawayLimits: { stack: 400, battlefield: 500 } });
    expect(doublings).toEqual({ t1: 2 });
    expect(refills(out.state).some(([who, moved]) => who === other && moved > 0)).toBe(true);
    expect({ kind: decision.kind, status: out.status }).toEqual({ kind: "game-over", status: me === "user" ? "user-wins" : "ai-wins" });
    expect(out.state.players[other].life).toBeLessThanOrEqual(0);
    expect(out.state.players[me].battlefield.length).toBeLessThan(200);
  });
});

describe("controls", () => {
  it("a mill route that CAN complete still builds past enough by combat (no reshuffle on record)", () => {
    const s = pod({ user: [SG(), BROOD(), ...squirrels(13), ...forests(8)], life: { ai1: 2, ai2: 2, ai3: 2 } });
    const loop = tokenLoopState(s, "user");
    expect({ complete: loop.outlet.complete, wantsMore: loop.outlet.wantsMore, holdLoop: loop.holdLoop }).toEqual({ complete: false, wantsMore: true, holdLoop: false });
    expect(isLoop(pick(s))).toBe(true);
  });

  it("short of enough the loop still builds, reshuffle or not (opponents at 40)", () => {
    const s = afterKozilek({ life: 40 });
    expect(refills(s)).toEqual([["ai1", 1]]);
    expect(tokenLoopState(s, "user").holdLoop).toBe(false);
    expect(isLoop(pick(s))).toBe(true);
  });

  it("a reshuffle by an opponent no longer in the game does not block the route", () => {
    const s = afterKozilek({ deadAfter: "ai1" });
    const loop = tokenLoopState(s, "user");
    expect({ wantsMore: loop.outlet.wantsMore, holdLoop: loop.holdLoop }).toEqual({ wantsMore: true, holdLoop: false });
    expect(isLoop(pick(s))).toBe(true);
  });

  it("a reshuffle that moved nothing refilled nothing: ai1's Elixir of Immortality activated with an empty graveyard", () => {
    const s = afterElixir({ seat: "ai1", graveyard: 0 });
    expect(refills(s)).toEqual([["ai1", 0]]);
    const loop = tokenLoopState(s, "user");
    expect({ wantsMore: loop.outlet.wantsMore, holdLoop: loop.holdLoop }).toEqual({ wantsMore: true, holdLoop: false });
  });

  it("her own reshuffle is not an opponent's: her Elixir of Immortality with three cards in her graveyard does not block the route", () => {
    const s = afterElixir({ seat: "user", graveyard: 3 });
    expect(refills(s)).toEqual([["user", 3]]);
    const loop = tokenLoopState(s, "user");
    expect({ wantsMore: loop.outlet.wantsMore, holdLoop: loop.holdLoop }).toEqual({ wantsMore: true, holdLoop: false });
  });

  it("a shot route is not blocked by a reshuffle: Blasting Station (one shot ready, six life to take) keeps the loop building past enough by combat", () => {
    const s = afterKozilek({ extra: [perm(BLASTING_STATION, "station")] });
    const loop = tokenLoopState(s, "user");
    expect({ shotLive: loop.outlet.shot.live, wantsMore: loop.outlet.wantsMore, holdLoop: loop.holdLoop }).toEqual({ shotLive: false, wantsMore: true, holdLoop: false });
  });
});

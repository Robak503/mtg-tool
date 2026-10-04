/**
 * mandatoryLoop.test.js — CR 104.4b / 732.4: a loop of only mandatory actions is a draw.
 *
 * Found in self-play (2026-10-03, Omnath's July-list stalls): Jurassic Ramp casts Polyraptor beside Marauding Raptor. The
 * Raptor deals 2 damage to the entering Polyraptor, enrage makes a copy, the copy enters, and so on for ever. The driver
 * played it until a size guard ended the game "engine-stuck — runaway stack (501 objects)" after 81 seconds. The game is a
 * draw, and mandatoryLoop.js now says so after 100 cycles.
 *
 * Real oracle fixtures (bundled Scryfall via cardIndex.publicCard, generated 2026-10-03). The engine cases run the real
 * driver (learnSession.advanceUntilDecision) on a real session: the autopilot casts Polyraptor from hand and the engine's
 * own triggers do the rest. The watch's unit cases use hand-built states — they are labelled SYNTHETIC.
 */
import { describe, expect, it } from "vitest";

import { createGame } from "./gameApi.js";
import { advanceUntilDecision } from "./learnSession.js";
import { createPermanent } from "./gameState.js";
import { MANDATORY_LOOP, boardDigest, cardOffersNoChoice, createLoopWatch, frozenSignature, mandatoryLinkName, repeatingPeriod } from "./mandatoryLoop.js";

// ── real card fixtures (bundled Scryfall, cardIndex.publicCard) ──
const RAPTOR = {"name":"Marauding Raptor","type":"Creature — Dinosaur","mana":"{1}{R}","cmc":2,"power":"2","toughness":"3","keywords":[],"colors":["R"],"colorIdentity":["R"],"oracle":"Creature spells you cast cost {1} less to cast.\nWhenever another creature you control enters, this creature deals 2 damage to it. If a Dinosaur is dealt damage this way, this creature gets +2/+0 until end of turn."};
const POLYRAPTOR = {"name":"Polyraptor","type":"Creature — Dinosaur","mana":"{6}{G}{G}","cmc":8,"power":"5","toughness":"5","keywords":["Enrage"],"colors":["G"],"colorIdentity":["G"],"oracle":"Enrage — Whenever this creature is dealt damage, create a token that's a copy of this creature."};
const SELVALA = {"name":"Selvala, Heart of the Wilds","type":"Legendary Creature — Elf Scout","mana":"{1}{G}{G}","cmc":3,"power":"2","toughness":"3","keywords":[],"colors":["G"],"colorIdentity":["G"],"oracle":"Whenever another creature enters, its controller may draw a card if its power is greater than each other creature's power.\n{G}, {T}: Add X mana in any combination of colors, where X is the greatest power among creatures you control."};
const PANTLAZA = {"name":"Pantlaza, Sun-Favored","type":"Legendary Creature — Dinosaur","mana":"{2}{R}{G}{W}","cmc":5,"power":"4","toughness":"4","keywords":["Discover"],"colors":["G","R","W"],"colorIdentity":["G","R","W"],"oracle":"Whenever Pantlaza or another Dinosaur you control enters, you may discover X, where X is that creature's toughness. Do this only once each turn. (Exile cards from the top of your library until you exile a nonland card with that mana value or less. Cast it without paying its mana cost or put it into your hand. Put the rest on the bottom in a random order.)"};
const DREADMAW = {"name":"Colossal Dreadmaw","type":"Creature — Dinosaur","mana":"{4}{G}{G}","cmc":6,"power":"6","toughness":"6","keywords":["Trample"],"colors":["G"],"colorIdentity":["G"],"oracle":"Trample (This creature can deal excess combat damage to the player or planeswalker it's attacking.)"};
const FOREST = {"name":"Forest","type":"Basic Land — Forest","mana":"","cmc":0,"keywords":[],"colors":[],"colorIdentity":["G"],"oracle":"({T}: Add {G}.)"};
const BEARS = {"name":"Grizzly Bears","type":"Creature — Bear","mana":"{1}{G}","cmc":2,"power":"2","toughness":"2","keywords":[],"colors":["G"],"colorIdentity":["G"],"oracle":""};

const FAST = { window: 80, maxPeriod: 16, checkEvery: 8 };
// A loop the watch misses must still END (engine-stuck, and the assertion fails) rather than run to the default 2,000 permanents.
const BOUNDED = { runawayLimits: { stack: 300, battlefield: 400 } };
const deck = (prefix) => [
  ...Array.from({ length: 24 }, (_, i) => ({ id: `${prefix}-f-${i}`, ...FOREST })),
  ...Array.from({ length: 16 }, (_, i) => ({ id: `${prefix}-b-${i}`, ...BEARS })),
];
const P = (id, card, controller) => createPermanent({ id, card: { id: `c-${id}`, ...card }, controller, summoningSick: false });

/** A real two-player session at its first decision; the active seat holds `hand` and controls eight Forests plus `board`. */
function sessionWith({ hand = [], board = [], opponentBoard = [] }) {
  const session = createGame({ userDeck: deck("u"), opponentDeck: deck("a"), difficulty: "expert", mode: "standard", seed: "mandatory-loop" });
  const s = session.state;
  const me = s.activePlayer;
  const other = Object.keys(s.players).find((id) => id !== me);
  const lands = Array.from({ length: 8 }, (_, i) => P(`land-${i}`, FOREST, me));
  return { ...session, state: { ...s, players: { ...s.players,
    [me]: { ...s.players[me], hand: hand.map((c, i) => ({ id: `h-${i}`, ...c })), battlefield: [...lands, ...board.map((c, i) => P(`b-${i}`, c, me))] },
    [other]: { ...s.players[other], battlefield: opponentBoard.map((c, i) => P(`o-${i}`, c, other)) } } } };
}
const polyraptorsIn = (state) => Object.values(state.players).flatMap((p) => p.battlefield).filter((p) => p.card?.name === "Polyraptor").length;
const polyraptors = (session) => Object.values(session.state.players).flatMap((p) => p.battlefield).filter((p) => p.card?.name === "Polyraptor").length;

// ─── the engine: Polyraptor + Marauding Raptor ───────────────────────────────────────────────────────────────────────

describe("Polyraptor beside Marauding Raptor — the game is a draw (CR 104.4b)", () => {
  it("the autopilot casts Polyraptor, the loop runs, and the driver ends the game a draw", () => {
    const { session, decision } = advanceUntilDecision(sessionWith({ hand: [POLYRAPTOR], board: [RAPTOR] }), { mandatoryLoopLimits: FAST, ...BOUNDED });
    expect({ kind: decision.kind, reason: decision.reason, status: session.status }).toEqual({ kind: "game-over", reason: "draw", status: "draw" });
    expect(decision.mandatoryLoop).toEqual({ period: 4, ticks: 80, sources: ["Marauding Raptor", "Polyraptor"] });
    expect(session.state.log.at(-1)).toMatchObject({ kind: "game-draw", rule: "CR 104.4b", reason: "mandatory loop", sources: ["Marauding Raptor", "Polyraptor"] });
    expect(typeof session.endedAt).toBe("string");
    // 80 + 16 plain passes at 4 a cycle: about two dozen copies, not the 500 the size guard waited for.
    expect(polyraptors(session)).toBeGreaterThan(20);
    expect(polyraptors(session)).toBeLessThan(40);
  });

  it("the default limits end it the same way, after 100-odd cycles", () => {
    const { session, decision } = advanceUntilDecision(sessionWith({ hand: [POLYRAPTOR], board: [RAPTOR] }), BOUNDED);
    expect({ kind: decision.kind, status: session.status, period: decision.mandatoryLoop?.period, ticks: decision.mandatoryLoop?.ticks }).toEqual({ kind: "game-over", status: "draw", period: 4, ticks: MANDATORY_LOOP.window });
    expect(polyraptors(session)).toBeLessThan(260);
  });

  it("bystanders that do nothing do not hide the loop: an opposing Selvala and the caster's own Pantlaza watch every copy enter", () => {
    const { session, decision } = advanceUntilDecision(sessionWith({ hand: [POLYRAPTOR], board: [RAPTOR, PANTLAZA], opponentBoard: [SELVALA] }), { mandatoryLoopLimits: FAST, ...BOUNDED });
    expect({ kind: decision.kind, status: session.status }).toEqual({ kind: "game-over", status: "draw" });
    expect(decision.mandatoryLoop.sources).toEqual(["Marauding Raptor", "Polyraptor"]);
  });

  it("Pantlaza's discover is offered once: after \"Do this only once each turn\" is used, the later triggers ask nothing", () => {
    let prompts = 0;
    const decide = ({ state }) => { if (state.pendingChoice?.kind === "optional-effect") prompts += 1; return undefined; };
    const { session } = advanceUntilDecision(sessionWith({ hand: [POLYRAPTOR], board: [RAPTOR, PANTLAZA] }), { decide, mandatoryLoopLimits: FAST, ...BOUNDED });
    expect({ status: session.status, prompts }).toEqual({ status: "draw", prompts: 1 });
  });

  it("a player who ACTS inside the loop restarts the count: the draw comes a full window after the last action", () => {
    const run = (decide) => advanceUntilDecision(sessionWith({ hand: [POLYRAPTOR], board: [RAPTOR] }), { decide, mandatoryLoopLimits: FAST, ...BOUNDED });
    const untouched = run(undefined);
    // The loop's controller floats mana from a Forest it left untapped, on its 10th priority window inside the loop.
    let windows = 0;
    let offered = 0;
    let taps = 0;
    const lastTapAt = { tick: 0 };
    const decide = ({ state, legalActions }) => {
      if (!(state.stack || []).length || !polyraptorsIn(state)) return undefined;
      windows += 1;
      const tap = legalActions.find((a) => a.kind === "tap-for-mana");
      if (!tap) return undefined;
      offered += 1;
      if (offered === 10) { taps += 1; lastTapAt.tick = windows; return tap; }
      return undefined;
    };
    const acted = run(decide);
    expect({ taps, status: acted.session.status, sources: acted.decision.mandatoryLoop.sources }).toEqual({ taps: 1, status: "draw", sources: ["Marauding Raptor", "Polyraptor"] });
    // Without the restart the draw would come at the same tick as the untouched game; with it, 96 plain passes after the last tap.
    expect(windows - lastTapAt.tick).toBeGreaterThanOrEqual(FAST.window + FAST.maxPeriod - 1);
    expect(acted.decision.ticks).toBeGreaterThan(untouched.decision.ticks + 15);
  });

  it("CONTROL — Marauding Raptor and a Dinosaur with no enrage is no loop: the game plays on to a winner", () => {
    const { session, decision } = advanceUntilDecision(sessionWith({ hand: [DREADMAW], board: [RAPTOR] }), { mandatoryLoopLimits: FAST, ...BOUNDED });
    expect(decision.mandatoryLoop).toBeUndefined();
    expect(decision.kind).toBe("game-over");
    expect(["user-wins", "ai-wins"]).toContain(session.status);
  });

  it("CONTROL — Polyraptor with no Raptor is no loop either", () => {
    const { session, decision } = advanceUntilDecision(sessionWith({ hand: [POLYRAPTOR] }), { mandatoryLoopLimits: FAST, ...BOUNDED });
    expect(decision.mandatoryLoop).toBeUndefined();
    expect(["user-wins", "ai-wins"]).toContain(session.status);
  });
});

// ─── which cards can be a link ───────────────────────────────────────────────────────────────────────────────────────

describe("cardOffersNoChoice — a link of a mandatory loop does one fixed thing", () => {
  it("Marauding Raptor, Polyraptor and Colossal Dreadmaw offer no choice", () => {
    expect([RAPTOR, POLYRAPTOR, DREADMAW].map(cardOffersNoChoice)).toEqual([true, true, true]);
  });
  it("Selvala (\"may\") and Pantlaza (\"may\", \"or\") do; so does a card with no readable text", () => {
    expect([SELVALA, PANTLAZA, { name: "Blank" }, null].map(cardOffersNoChoice)).toEqual([false, false, false, false]);
  });
  it("each choice word disqualifies on its own (SYNTHETIC one-line texts)", () => {
    for (const text of ["You may draw a card.", "Up to one creature gets +1/+1.", "Choose a creature type.", "Destroy target creature.", "Sacrifice it unless you pay {1}.", "Whenever this creature attacks or blocks, you gain 1 life.", "Discard a card at random.", "Untap any number of lands.",
      "Each player chooses a creature.", "Creatures of the chosen type get +1/+1.", "This spell targets only creatures."]) {
      expect(`${text} → ${cardOffersNoChoice({ oracle: text })}`).toBe(`${text} → false`);
    }
    expect(cardOffersNoChoice({ oracle: "Whenever a Forest enters, create a Spirit Warrior token." })).toBe(true); // "or" inside a word
    expect(cardOffersNoChoice({ oracle_text: "You gain 1 life." })).toBe(true); // the raw Scryfall field reads too
  });
});

// ─── the watch (SYNTHETIC states) ────────────────────────────────────────────────────────────────────────────────────

const perm = (id, card, extra = {}) => ({ id, card, controller: "a", ...extra });
/** A two-seat state with `top` on a stack of `size` objects and seat `holder` holding priority. */
function st({ holder = "a", top = "raptor", size = 2, life = 20, library = 30, extraPerms = [], kind = "triggered-ability", targets = [], topId = `stk-${top}`, tapped = false } = {}) {
  const battlefield = [perm("raptor", RAPTOR), perm("poly", POLYRAPTOR, { tapped }), perm("selvala", SELVALA), ...extraPerms];
  const filler = Array.from({ length: size - 1 }, (_, i) => ({ id: `stk-below-${i}`, kind: "triggered-ability", source: { permanentId: "selvala" }, controller: "a", targets: [] }));
  return {
    turn: 5, phase: "precombat-main", step: "main", priorityHolder: holder,
    stack: [...filler, { id: topId, kind, source: { permanentId: top, name: top }, controller: "a", targets }],
    players: {
      a: { life, poison: 0, library: Array(library).fill(0), hand: [], battlefield, graveyard: [], exile: [], command: [], manaPool: { G: 0 } },
      b: { life: 20, poison: 0, library: Array(30).fill(0), hand: [], battlefield: [], graveyard: [], exile: [], command: [], manaPool: { G: 0 } },
    },
  };
}
const TINY = { window: 12, maxPeriod: 4, checkEvery: 1 };
/** Feed ticks `start`..`n - 1` of the 4-tick Raptor / Polyraptor cycle; `mutate(i, state)` may alter a tick. The first non-null answer. */
function feed(watch, n, mutate = (i, s) => s, start = 0) {
  for (let i = start; i < n; i++) {
    const cycle = Math.floor(i / 4);
    const base = st({ holder: i % 2 ? "b" : "a", top: i % 4 < 2 ? "raptor" : "poly", topId: `stk-${cycle}-${i % 4 < 2 ? "r" : "p"}` });
    const out = watch.observe(mutate(i, base));
    if (out) return { at: i, out };
  }
  return null;
}

describe("createLoopWatch", () => {
  it("fires once window + maxPeriod plain passes repeat, naming the period and the sources", () => {
    expect(feed(createLoopWatch(TINY), 40)).toEqual({ at: 15, out: { period: 4, ticks: 12, sources: ["Marauding Raptor", "Polyraptor"] } });
  });

  it("reset() starts the count again", () => {
    const watch = createLoopWatch(TINY);
    expect(feed(watch, 15)).toBeNull();
    watch.reset();
    expect(feed(watch, 30, undefined, 15)).toBeNull(); // 15 more ticks: one short again
    expect(feed(watch, 31, undefined, 30)?.at).toBe(30);
  });

  it("an empty stack, a spell or an activated ability on top starts the count again", () => {
    for (const breaker of [(s) => ({ ...s, stack: [] }), (s) => ({ ...s, stack: [{ ...s.stack.at(-1), kind: "spell" }] }), (s) => ({ ...s, stack: [{ ...s.stack.at(-1), kind: "activated-ability" }] })]) {
      const hit = feed(createLoopWatch(TINY), 40, (i, s) => (i === 10 ? breaker(s) : s));
      expect(hit.at).toBe(26); // 11 + 16 - 1
    }
  });

  it("life, library, hand, poison or the step moving starts the count again", () => {
    const movers = [
      (s) => ({ ...s, players: { ...s.players, b: { ...s.players.b, life: 19 } } }),
      (s) => ({ ...s, players: { ...s.players, a: { ...s.players.a, library: Array(29).fill(0) } } }),
      (s) => ({ ...s, players: { ...s.players, a: { ...s.players.a, hand: [{}] } } }),
      (s) => ({ ...s, players: { ...s.players, b: { ...s.players.b, poison: 1 } } }),
      (s) => ({ ...s, step: "end" }),
      (s) => ({ ...s, phase: "ending" }),
      (s) => ({ ...s, turn: 6 }),
    ];
    for (const move of movers) {
      // from tick 10 on the value stays moved: one reset, at tick 10
      const hit = feed(createLoopWatch(TINY), 40, (i, s) => (i >= 10 ? move(s) : s));
      expect(hit.at).toBe(25);
    }
  });

  it("a stack that is DRAINING is not a loop: the same sources, one object fewer each cycle", () => {
    expect(feed(createLoopWatch(TINY), 200, (i, s) => ({ ...s, stack: [...Array(400 - Math.floor(i / 4)).fill({ id: "below", kind: "triggered-ability" }), s.stack.at(-1)] }))).toBeNull();
  });

  it("a stack that GROWS each cycle is still the loop (Pantlaza's waiting triggers)", () => {
    expect(feed(createLoopWatch(TINY), 40, (i, s) => ({ ...s, stack: [...Array(Math.floor(i / 4)).fill({ id: "below", kind: "triggered-ability" }), s.stack.at(-1)] }))?.at).toBe(15);
  });

  it("no single period: a sequence that never repeats does not fire", () => {
    const names = ["raptor", "poly"];
    let x = 7;
    const hit = feed(createLoopWatch(TINY), 300, (i) => { x = (x * 31 + 11) % 97; return st({ holder: x % 2 ? "a" : "b", top: names[x % 3 === 0 ? 0 : 1], topId: `stk-${i}` }); });
    expect(hit).toBeNull();
  });

  it("a targeted trigger from a no-choice card is not a link — and a bystander only while it changes nothing", () => {
    // Every Raptor object carries a target: never a link. It resolves without touching the board, so it is a bystander;
    // Polyraptor's objects are still links, and the loop is named by them alone.
    const targeted = feed(createLoopWatch(TINY), 40, (i, s) => (i % 4 < 2 ? { ...s, stack: [{ ...s.stack.at(-1), targets: [{ id: "poly" }] }] } : s));
    expect(targeted.out.sources).toEqual(["Polyraptor"]);
    expect(mandatoryLinkName(st({ top: "raptor", targets: [{ id: "poly" }] }))).toBeNull();
    expect(mandatoryLinkName(st({ top: "raptor" }))).toBe("Marauding Raptor");
    expect(mandatoryLinkName(st({ top: "selvala" }))).toBeNull();
    expect(mandatoryLinkName(st({ top: "gone" }))).toBeNull(); // the source has left the battlefield
    expect(mandatoryLinkName(st({ top: "raptor", kind: "spell" }))).toBeNull();
    expect(mandatoryLinkName({ stack: [], players: {} })).toBeNull();
  });

  it("a bystander whose resolution changes the board starts the count again", () => {
    // Selvala's object sits on top for ticks 8-9 and the board differs from tick 10 on (a permanent became tapped).
    const hit = feed(createLoopWatch(TINY), 60, (i, s) => {
      const withSelvala = i === 8 || i === 9 ? st({ holder: s.priorityHolder, top: "selvala", topId: "stk-selvala" }) : s;
      return i >= 10 ? st({ holder: s.priorityHolder, top: s.stack.at(-1).source.permanentId, topId: s.stack.at(-1).id, tapped: true }) : withSelvala;
    });
    expect(hit.at).toBe(25); // counted from tick 10, not from 0
  });

  it("a bystander whose resolution changes nothing is part of the repeat", () => {
    // A 6-tick cycle: Raptor, Polyraptor, then Selvala's object (two ticks each); nothing on the board moves.
    const watch = createLoopWatch({ window: 18, maxPeriod: 6, checkEvery: 1 });
    let hit = null;
    for (let i = 0; i < 60 && !hit; i++) {
      const slot = Math.floor((i % 6) / 2);
      const top = ["raptor", "poly", "selvala"][slot];
      const out = watch.observe(st({ holder: i % 2 ? "b" : "a", top, topId: `stk-${Math.floor(i / 6)}-${slot}` }));
      if (out) hit = { at: i, out };
    }
    expect(hit).toEqual({ at: 23, out: { period: 6, ticks: 18, sources: ["Marauding Raptor", "Polyraptor"] } });
  });

  it("a bystander that changes the board EVERY cycle is a link the watch cannot vouch for: no loop", () => {
    // The same 6-tick cycle, but each Selvala object leaves one more permanent behind (an accepted "may").
    const watch = createLoopWatch({ window: 18, maxPeriod: 6, checkEvery: 1 });
    let hit = null;
    for (let i = 0; i < 120; i++) {
      const slot = Math.floor((i % 6) / 2);
      const extraPerms = Array.from({ length: Math.floor(i / 6) }, (_, k) => perm(`made-${k}`, BEARS));
      hit = hit || watch.observe(st({ holder: i % 2 ? "b" : "a", top: ["raptor", "poly", "selvala"][slot], topId: `stk-${Math.floor(i / 6)}-${slot}`, extraPerms }));
    }
    expect(hit).toBeNull();
  });

  it("an activated ability or a spell in every cycle is a player acting, however little it does: no loop", () => {
    for (const kind of ["activated-ability", "spell"]) {
      const watch = createLoopWatch({ window: 18, maxPeriod: 6, checkEvery: 1 });
      let hit = null;
      for (let i = 0; i < 120; i++) {
        const slot = Math.floor((i % 6) / 2);
        hit = hit || watch.observe(st({ holder: i % 2 ? "b" : "a", top: ["raptor", "poly", "selvala"][slot], topId: `stk-${Math.floor(i / 6)}-${slot}`, kind: slot === 2 ? kind : "triggered-ability" }));
      }
      expect(`${kind}: ${hit === null}`).toBe(`${kind}: true`);
    }
  });

  it("the priority holder is part of what must repeat", () => {
    // The objects on top repeat (Raptor, Raptor, Polyraptor, Polyraptor); who holds priority follows no period.
    let x = 5;
    const hit = feed(createLoopWatch(TINY), 300, (i, s) => { x = (x * 31 + 11) % 97; return { ...s, priorityHolder: x % 2 ? "a" : "b" }; });
    expect(hit).toBeNull();
  });

  it("bystanders alone are never a loop", () => {
    const watch = createLoopWatch(TINY);
    let hit = null;
    for (let i = 0; i < 80; i++) hit = hit || watch.observe(st({ holder: i % 2 ? "b" : "a", top: "selvala", topId: `stk-${Math.floor(i / 2)}` }));
    expect(hit).toBeNull();
  });
});

describe("the watch's readings", () => {
  it("repeatingPeriod: the smallest period over the window; 0 when the history is short, aperiodic or shrinking", () => {
    const keys = Array.from({ length: 16 }, (_, i) => "abcd"[i % 4]);
    const flat = Array(16).fill(3);
    expect(repeatingPeriod(keys, flat, TINY)).toBe(4);
    expect(repeatingPeriod(Array(16).fill("a"), flat, TINY)).toBe(1);
    expect(repeatingPeriod(keys.slice(0, 15), flat.slice(0, 15), TINY)).toBe(0);
    expect(repeatingPeriod([], [], TINY)).toBe(0); // no history at all is not "everything repeats"
    expect(repeatingPeriod(keys.map((k, i) => (i === 9 ? "z" : k)), flat, TINY)).toBe(0);
    expect(repeatingPeriod(keys, flat.map((v, i) => (i === 15 ? 2 : v)), TINY)).toBe(0);
    expect(repeatingPeriod(keys, flat.map((v, i) => v + i), TINY)).toBe(4);
    // a break before the window AND its one period of lead-in is not looked at; one inside the lead-in is
    const long = Array.from({ length: 20 }, (_, i) => "abcd"[i % 4]);
    expect(repeatingPeriod(["z", ...long.slice(1)], Array(20).fill(3), TINY)).toBe(4);
    expect(repeatingPeriod(["z", ...keys.slice(1)], flat, TINY)).toBe(0);
    // longer than maxPeriod: not found
    expect(repeatingPeriod(Array.from({ length: 16 }, (_, i) => "abcde"[i % 5]), flat, TINY)).toBe(0);
  });

  it("frozenSignature and boardDigest move with what they are named for, and with nothing else", () => {
    const base = st();
    expect(frozenSignature(st())).toBe(frozenSignature(base));
    expect(frozenSignature(st({ size: 9 }))).toBe(frozenSignature(base)); // the stack is not in it
    expect(frozenSignature(st({ life: 19 }))).not.toBe(frozenSignature(base));
    expect(frozenSignature(st({ library: 29 }))).not.toBe(frozenSignature(base));
    expect(boardDigest(st({ size: 9, holder: "b" }))).toBe(boardDigest(base));
    expect(boardDigest(st({ tapped: true }))).not.toBe(boardDigest(base));
    expect(boardDigest(st({ extraPerms: [perm("tok-1", POLYRAPTOR)] }))).not.toBe(boardDigest(base));
    const touch = (change) => { const s = st(); change(s.players.a); return boardDigest(s); };
    for (const change of [(p) => { p.battlefield[0].id = "another"; }, (p) => { p.battlefield[0].damage = 2; }, (p) => { p.battlefield[0].counters = { "+1/+1": 1 }; }, (p) => { p.battlefield[0].attachedTo = "poly"; },
      (p) => { p.battlefield[0].controller = "b"; }, (p) => { p.graveyard.push({}); }, (p) => { p.exile.push({}); }, (p) => { p.command.push({}); }, (p) => { p.manaPool.G = 1; }]) {
      expect(touch(change)).not.toBe(boardDigest(base));
    }
  });
});

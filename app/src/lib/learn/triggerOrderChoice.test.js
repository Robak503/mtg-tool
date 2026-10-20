/**
 * triggerOrderChoice.test.js — a PERSON puts their own simultaneous triggered abilities on the stack in the order they choose, through
 * the trigger-order pause; every seat the AI plays keeps the order the abilities triggered in (first in, lowest), unchanged.
 *
 * The rules, read in knowledge/mtg-judge/data/cr/cr_current.json:
 *   · CR 603.3b — "each player, in APNAP order, puts each triggered ability they control … on the stack in any order they choose."
 *   · CR 405.3 — "If a player controls more than one of these objects, that player chooses their relative order on the stack."
 *   · CR 603.3d — the rest of putting a triggered ability on the stack is CR 601.2c–d: its targets are chosen as it is put on the
 *     stack, so the order comes first and each ability's targets are announced in the order the abilities are put on the stack.
 *   · CR 101.4 — APNAP: the active player's abilities go on the stack first (lowest), then each other player's in turn order.
 *
 * THE GAP (gameEngine.orderTriggersAPNAP, 5f0936b0:1441): first in, first out within each controller, for every seat — a person's
 * Cathars' Crusade and Attended Knight's enters trigger always went on the stack in the order they triggered.
 *
 * THE RULE FOR WHEN TO ASK: two or more of the person's abilities in one batch, unless every one is an identical copy of the same
 * ability from the same source with the same trigger event (Panharmonicon's extra Soul Warden trigger) — copies resolve the same in
 * any order, so there is nothing to choose.
 *
 * Engine paths: the session driver (advanceUntilDecision / applyChoice / applyPendingChoice) for a cast through to its triggers;
 * flushTriggers + checkEnterTriggers for simultaneous triggers on a board built here. Real oracle fixtures (bundled Scryfall via
 * cardIndex.publicCard, read 2026-10-20).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { checkEnterTriggers } from "./triggers.js";
import { chooseTriggerTargets, flushTriggers } from "./gameEngine.js";
import { advanceUntilDecision, applyChoice, applyPendingChoice } from "./learnSession.js";
import { isSerializable } from "../server/learnSaveSchema.js";

beforeEach(() => _resetIdsForTests());

// ── real card fixtures (bundled Scryfall, cardIndex.publicCard) ──
const SOUL_WARDEN = {"name":"Soul Warden","type":"Creature — Human Cleric","mana":"{W}","cmc":1,"power":"1","toughness":"1","keywords":[],"colors":["W"],"colorIdentity":["W"],"oracle":"Whenever another creature enters, you gain 1 life."};
const CATHARS_CRUSADE = {"name":"Cathars' Crusade","type":"Enchantment","mana":"{3}{W}{W}","cmc":5,"power":null,"toughness":null,"keywords":[],"colors":["W"],"colorIdentity":["W"],"oracle":"Whenever a creature you control enters, put a +1/+1 counter on each creature you control."};
const ATTENDED_KNIGHT = {"name":"Attended Knight","type":"Creature — Human Knight","mana":"{2}{W}","cmc":3,"power":"2","toughness":"2","keywords":["First strike"],"colors":["W"],"colorIdentity":["W"],"oracle":"First strike\nWhen this creature enters, create a 1/1 white Soldier creature token."};
const RAVENOUS_CHUPACABRA = {"name":"Ravenous Chupacabra","type":"Creature — Beast Horror","mana":"{2}{B}{B}","cmc":4,"power":"2","toughness":"2","keywords":[],"colors":["B"],"colorIdentity":["B"],"oracle":"When this creature enters, destroy target creature an opponent controls."};
const TWINSHOT_SNIPER = {"name":"Twinshot Sniper","type":"Artifact Creature — Goblin Archer","mana":"{3}{R}","cmc":4,"power":"2","toughness":"3","keywords":["Reach","Channel"],"colors":["R"],"colorIdentity":["R"],"oracle":"Reach\nWhen this creature enters, it deals 2 damage to any target.\nChannel — {1}{R}, Discard this card: It deals 2 damage to any target."};
const PANHARMONICON = {"name":"Panharmonicon","type":"Artifact","mana":"{4}","cmc":4,"power":null,"toughness":null,"keywords":[],"colors":[],"colorIdentity":[],"oracle":"If an artifact or creature entering causes a triggered ability of a permanent you control to trigger, that ability triggers an additional time."};
const KIRA = {"name":"Kira, Great Glass-Spinner","type":"Legendary Creature — Spirit","mana":"{1}{U}{U}","cmc":3,"power":"2","toughness":"2","keywords":["Flying"],"colors":["U"],"colorIdentity":["U"],"oracle":"Flying\nCreatures you control have \"Whenever this creature becomes the target of a spell or ability for the first time each turn, counter that spell or ability.\""};
const GRIZZLY_BEARS = {"name":"Grizzly Bears","type":"Creature — Bear","mana":"{1}{G}","cmc":2,"power":"2","toughness":"2","keywords":[],"colors":["G"],"colorIdentity":["G"],"oracle":""};
const HILL_GIANT = {"name":"Hill Giant","type":"Creature — Giant","mana":"{3}{R}","cmc":4,"power":"3","toughness":"3","keywords":[],"colors":["R"],"colorIdentity":["R"],"oracle":""};

const P = (id, card, controller) => createPermanent({ id, card: { id: `c-${id}`, ...card }, controller, summoningSick: false });
const LIB = (pid) => [1, 2, 3, 4, 5, 6].map((i) => ({ id: `${pid}-lib${i}`, ...GRIZZLY_BEARS }));
const FULL = { W: 9, U: 9, B: 9, R: 9, G: 9, C: 9 };

/** A two-seat game in the `active` seat's precombat main phase, the stack empty; `humans` is state.humanSeats (createLearnSession stamps ["user"] below Expert). */
function board({ user = [], ai = [], hand = [], humans = ["user"], active = "user" } = {}) {
  const g = createGameState({ userDeck: [], aiDeck: [] });
  return { ...g, ...(humans ? { humanSeats: humans } : {}), turn: 4, activePlayer: active, priorityHolder: active, phase: "precombat-main", step: "main", consecutivePasses: 0, stack: [], pendingTriggers: [],
    players: { ...g.players,
      user: { ...g.players.user, life: 20, battlefield: user, hand, manaPool: { ...g.players.user.manaPool, ...FULL }, library: LIB("user") },
      ai: { ...g.players.ai, life: 20, battlefield: ai, hand: [], library: LIB("ai") } } };
}
const session = (state, difficulty = "beginner") => ({ status: "active", state, difficulty, decisionLog: [] });
/** The person casts `cardId` from hand through the session driver; returns the driver's next stop. */
function cast(state, cardId) {
  const first = advanceUntilDecision(session(state));
  const action = first.decision.options.find((a) => a.kind === "cast-spell" && a.cardId === cardId);
  return applyChoice(first.session, action);
}
/** Pass priority (the person) until the stack is empty or the driver stops on something else. */
function drain(r) {
  let cur = r;
  for (let i = 0; i < 30 && cur.decision?.kind === "ask" && (cur.session.state.stack || []).length > 0; i++) {
    cur = applyChoice(cur.session, cur.decision.options.find((a) => a.kind === "pass-priority"));
  }
  return cur;
}
const order = (r, resolveOrder) => applyPendingChoice(r.session, { kind: "trigger-order", resolveOrder });
const chooseTarget = (r, candidateId) => applyPendingChoice(r.session, { kind: "trigger-target", candidateId });
const idOf = (d, sourceName) => (d?.candidates || []).find((c) => c.sourceName === sourceName)?.id;
const offered = (d) => (d?.candidates || []).map((c) => c.sourceName).sort();
const targetIdFor = (d, label) => (d?.candidates || []).find((c) => (c.targets || []).map((t) => `${t.type}:${t.id}`).join(" ") === label)?.id;
const stackNames = (s) => (s.stack || []).map((o) => `${o.controller}:${o.source?.name}`);
const names = (s, seat) => s.players[seat].battlefield.map((p) => p.card?.name).sort();
const counters = (s, pred) => s.players.user.battlefield.filter(pred).map((p) => p.counters?.["+1/+1"] ?? 0);
const enter = (s, ...ids) => ids.reduce((st, id) => checkEnterTriggers(st, [...st.players.user.battlefield, ...st.players.ai.battlefield].find((p) => p.id === id)), s);
const live = (s) => flushTriggers(s, { chooseTargets: chooseTriggerTargets });

describe("CR 603.3b — a person puts their own simultaneous triggered abilities on the stack in the order they choose", () => {
  it("⭐ Cathars' Crusade + Attended Knight: you are asked, and the order you choose is the order they resolve — the Crusade first leaves the Soldier with one counter, the Knight's token first gives it two", () => {
    const start = board({ hand: [{ id: "knight", ...ATTENDED_KNIGHT }], user: [P("crusade", CATHARS_CRUSADE, "user")] });
    const a = cast(start, "knight");
    const crusadeFirst = drain(order(a, [idOf(a.decision, "Cathars' Crusade"), idOf(a.decision, "Attended Knight")]));
    const b = cast(start, "knight");
    const knightFirst = drain(order(b, [idOf(b.decision, "Attended Knight"), idOf(b.decision, "Cathars' Crusade")]));
    const read = (r) => ({
      knight: counters(r.session.state, (p) => p.card?.name === "Attended Knight"),
      soldier: counters(r.session.state, (p) => /Soldier/.test(p.card?.name || "") && p.card?.name !== "Attended Knight"),
      stack: (r.session.state.stack || []).length,
    });
    const row = { asked: [a.decision.kind, a.decision.controller], offered: offered(a.decision), crusadeFirst: read(crusadeFirst), knightFirst: read(knightFirst) };
    console.log(`  WITNESS crusade-knight ${JSON.stringify(row)}`);
    expect(row).toEqual({
      asked: ["trigger-order", "user"], offered: ["Attended Knight", "Cathars' Crusade"],
      crusadeFirst: { knight: [2], soldier: [1], stack: 0 },
      knightFirst: { knight: [2], soldier: [2], stack: 0 },
    });
  });

  it("with the trigger-target question: the order is asked first, then the Chupacabra's targets — and while they are asked the stack already stands in your order, either way round", () => {
    const start = board({ hand: [{ id: "chupa", ...RAVENOUS_CHUPACABRA }], user: [P("warden", SOUL_WARDEN, "user")], ai: [P("bear", GRIZZLY_BEARS, "ai"), P("giant", HILL_GIANT, "ai")] });
    const a = cast(start, "chupa");
    const chupaFirst = order(a, [idOf(a.decision, "Ravenous Chupacabra"), idOf(a.decision, "Soul Warden")]);
    const b = cast(start, "chupa");
    const wardenFirst = order(b, [idOf(b.decision, "Soul Warden"), idOf(b.decision, "Ravenous Chupacabra")]);
    const done = drain(chooseTarget(wardenFirst, targetIdFor(wardenFirst.decision, "creature:giant")));
    const chupaView = (a.decision?.candidates || []).find((c) => c.sourceName === "Ravenous Chupacabra");
    const row = {
      firstAsked: a.decision.kind, chupaTargetsNext: chupaView?.targetsNext ?? null,
      chupaFirst: { next: [chupaFirst.decision.kind, chupaFirst.decision.sourceName], stack: stackNames(chupaFirst.session.state) },
      wardenFirst: { next: [wardenFirst.decision.kind, wardenFirst.decision.sourceName], stack: stackNames(wardenFirst.session.state) },
      after: { aiBoard: names(done.session.state, "ai"), life: done.session.state.players.user.life },
    };
    console.log(`  WITNESS order-then-targets ${JSON.stringify(row)}`);
    expect(row).toEqual({
      firstAsked: "trigger-order", chupaTargetsNext: true,
      chupaFirst: { next: ["trigger-target", "Ravenous Chupacabra"], stack: ["user:Soul Warden", "user:Ravenous Chupacabra"] },
      wardenFirst: { next: ["trigger-target", "Ravenous Chupacabra"], stack: ["user:Ravenous Chupacabra", "user:Soul Warden"] },
      after: { aiBoard: ["Grizzly Bears"], life: 21 },
    });
  });

  it("two targeted abilities: after the order, each one's targets are asked in the order they go on the stack (the first put on, the one that resolves last, first)", () => {
    const s0 = board({ user: [P("chupa", RAVENOUS_CHUPACABRA, "user"), P("sniper", TWINSHOT_SNIPER, "user")], ai: [P("bear", GRIZZLY_BEARS, "ai"), P("giant", HILL_GIANT, "ai")] });
    const first = advanceUntilDecision(session(live(enter(s0, "chupa", "sniper"))));
    const ordered = order(first, [idOf(first.decision, "Twinshot Sniper"), idOf(first.decision, "Ravenous Chupacabra")]);
    const second = chooseTarget(ordered, targetIdFor(ordered.decision, "creature:giant"));
    const third = drain(chooseTarget(second, targetIdFor(second.decision, "player:ai")));
    const row = {
      asked: [first.decision.kind, ordered.decision.kind, ordered.decision.sourceName, second.decision.kind, second.decision.sourceName],
      stack: stackNames(ordered.session.state),
      after: { aiBoard: names(third.session.state, "ai"), aiLife: third.session.state.players.ai.life },
    };
    console.log(`  WITNESS two-targeted ${JSON.stringify(row)}`);
    expect(row).toEqual({
      asked: ["trigger-order", "trigger-target", "Ravenous Chupacabra", "trigger-target", "Twinshot Sniper"],
      stack: ["user:Ravenous Chupacabra", "user:Twinshot Sniper"],
      after: { aiBoard: ["Grizzly Bears"], aiLife: 18 },
    });
  });

  it("APNAP across players stands: on the opponent's turn its trigger goes on the stack first (lowest) and yours above it in your order; on your turn yours go first in your order and the opponent's above", () => {
    const make = (active) => board({ active, user: [P("uwarden", SOUL_WARDEN, "user"), P("chupa", RAVENOUS_CHUPACABRA, "user")], ai: [P("aiwarden", SOUL_WARDEN, "ai"), P("bear", GRIZZLY_BEARS, "ai"), P("giant", HILL_GIANT, "ai")] });
    const theirs = advanceUntilDecision(session(live(enter(make("ai"), "chupa"))));
    const theirsAnswered = order(theirs, [idOf(theirs.decision, "Soul Warden"), idOf(theirs.decision, "Ravenous Chupacabra")]);
    const yours = advanceUntilDecision(session(live(enter(make("user"), "chupa"))));
    const yoursAnswered = order(yours, [idOf(yours.decision, "Ravenous Chupacabra"), idOf(yours.decision, "Soul Warden")]);
    const row = {
      theirTurn: { asked: [theirs.decision.kind, theirs.decision.controller, (theirs.decision.candidates || []).length], stack: stackNames(theirsAnswered.session.state), next: theirsAnswered.decision.kind },
      yourTurn: { asked: [yours.decision.kind, yours.decision.controller, (yours.decision.candidates || []).length], stack: stackNames(yoursAnswered.session.state), next: yoursAnswered.decision.kind },
    };
    console.log(`  WITNESS apnap ${JSON.stringify(row)}`);
    expect(row).toEqual({
      theirTurn: { asked: ["trigger-order", "user", 2], stack: ["ai:Soul Warden", "user:Ravenous Chupacabra", "user:Soul Warden"], next: "trigger-target" },
      yourTurn: { asked: ["trigger-order", "user", 2], stack: ["user:Soul Warden", "user:Ravenous Chupacabra", "ai:Soul Warden"], next: "trigger-target" },
    });
  });

  it("an ability already on the stack waiting for its targets is answered before a later batch is ordered: the Chupacabra (put on first) asks its targets, then the Crusade and the Knight above it ask their order", () => {
    const s0 = board({ user: [P("chupa", RAVENOUS_CHUPACABRA, "user")], ai: [P("bear", GRIZZLY_BEARS, "ai"), P("giant", HILL_GIANT, "ai")] });
    const firstBatch = live(enter(s0, "chupa")); // the Chupacabra's enters trigger alone, waiting for its targets
    const withMore = { ...firstBatch, players: { ...firstBatch.players, user: { ...firstBatch.players.user, battlefield: [...firstBatch.players.user.battlefield, P("crusade", CATHARS_CRUSADE, "user"), P("knight", ATTENDED_KNIGHT, "user")] } } };
    const twoBatches = live(enter(withMore, "knight")); // before anyone receives priority, the Knight enters: the Crusade's trigger and its own
    const first = advanceUntilDecision(session(twoBatches));
    const second = chooseTarget(first, targetIdFor(first.decision, "creature:giant"));
    const row = {
      stack: stackNames(twoBatches),
      asked: [[first.decision.kind, first.decision.sourceName], [second.decision.kind, offered(second.decision)]],
    };
    console.log(`  WITNESS earlier-batch-first ${JSON.stringify(row)}`);
    expect(row).toEqual({
      stack: ["user:Ravenous Chupacabra", "user:Cathars' Crusade", "user:Attended Knight"],
      asked: [["trigger-target", "Ravenous Chupacabra"], ["trigger-order", ["Attended Knight", "Cathars' Crusade"]]],
    });
  });

  it("an answer that is not an order of exactly your abilities decides nothing: the question stands and the stack is untouched", () => {
    const paused = cast(board({ hand: [{ id: "chupa", ...RAVENOUS_CHUPACABRA }], user: [P("warden", SOUL_WARDEN, "user")], ai: [P("bear", GRIZZLY_BEARS, "ai"), P("giant", HILL_GIANT, "ai")] }), "chupa");
    const d = paused.decision;
    const w = idOf(d, "Soul Warden"), c = idOf(d, "Ravenous Chupacabra");
    const before = JSON.stringify(paused.session.state.stack);
    const answers = { notAList: "x", one: [w], twice: [w, w], unknown: [w, "stk-nope"], extra: [w, c, "stk-nope"], nothing: undefined };
    const row = Object.fromEntries(Object.entries(answers).map(([k, v]) => {
      const r = order(paused, v);
      return [k, [r.decision.kind, (r.decision.candidates || []).length, JSON.stringify(r.session.state.stack) === before]];
    }));
    console.log(`  WITNESS junk ${JSON.stringify(row)}`);
    const reAsked = ["trigger-order", 2, true];
    expect(row).toEqual({ notAList: reAsked, one: reAsked, twice: reAsked, unknown: reAsked, extra: reAsked, nothing: reAsked });
  });

  it("a game saved mid-question restores intact: the save guard passes, the resumed driver asks the same question, and the restored answer settles exactly as the live one", () => {
    const paused = cast(board({ hand: [{ id: "chupa", ...RAVENOUS_CHUPACABRA }], user: [P("warden", SOUL_WARDEN, "user")], ai: [P("bear", GRIZZLY_BEARS, "ai"), P("giant", HILL_GIANT, "ai")] }), "chupa");
    const restored = advanceUntilDecision({ ...paused.session, state: JSON.parse(JSON.stringify(paused.session.state)) });
    const answer = [idOf(paused.decision, "Soul Warden"), idOf(paused.decision, "Ravenous Chupacabra")];
    const liveAnswer = order(paused, answer);
    const again = order(restored, answer);
    const row = {
      serializable: isSerializable(paused.session).ok,
      asked: [paused.decision.kind, restored.decision.kind],
      sameQuestion: JSON.stringify(restored.decision.candidates) === JSON.stringify(paused.decision.candidates),
      stack: stackNames(again.session.state),
    };
    console.log(`  WITNESS save-resume ${JSON.stringify(row)}`);
    expect(row).toEqual({ serializable: true, asked: ["trigger-order", "trigger-order"], sameQuestion: true, stack: ["user:Ravenous Chupacabra", "user:Soul Warden"] });
    expect(JSON.parse(JSON.stringify(again.session.state))).toEqual(JSON.parse(JSON.stringify(liveAnswer.session.state)));
  });
});

describe("controls — unchanged on both trees", () => {
  it("one trigger asks nothing: Soul Warden alone when your Grizzly Bears enters — you gain 1 life, no question", () => {
    const r = drain(cast(board({ hand: [{ id: "bears", ...GRIZZLY_BEARS }], user: [P("warden", SOUL_WARDEN, "user")] }), "bears"));
    expect({ kind: r.decision.kind, life: r.session.state.players.user.life }).toEqual({ kind: "ask", life: 21 });
  });

  it("identical copies ask nothing: Panharmonicon makes Soul Warden trigger twice for the Bears — the same ability of the same source for the same event; both resolve, no question", () => {
    const r = drain(cast(board({ hand: [{ id: "bears", ...GRIZZLY_BEARS }], user: [P("pan", PANHARMONICON, "user"), P("warden", SOUL_WARDEN, "user")] }), "bears"));
    expect({ kind: r.decision.kind, life: r.session.state.players.user.life }).toEqual({ kind: "ask", life: 22 });
  });

  it("an ability countered as it goes on the stack is not ordered: Kira counters the Chupacabra's trigger aimed at her, and the Soul Warden trigger left alone asks nothing", () => {
    const r = drain(cast(board({ hand: [{ id: "chupa", ...RAVENOUS_CHUPACABRA }], user: [P("warden", SOUL_WARDEN, "user")], ai: [P("kira", KIRA, "ai")] }), "chupa"));
    expect({ kind: r.decision.kind, life: r.session.state.players.user.life, aiBoard: names(r.session.state, "ai") }).toEqual({ kind: "ask", life: 21, aiBoard: ["Kira, Great Glass-Spinner"] });
  });

  it("the AI's two triggers at a table with a person keep the order they triggered in, exactly as at a table without one", () => {
    const s0 = (humans) => board({ humans, active: "ai", ai: [P("aicrusade", CATHARS_CRUSADE, "ai"), P("aiknight", ATTENDED_KNIGHT, "ai")] });
    const withPerson = live(enter(s0(["user"]), "aiknight"));
    const without = live(enter(s0(null), "aiknight"));
    const strip = ({ humanSeats: _h, ...rest }) => rest;
    expect(stackNames(withPerson)).toEqual(["ai:Cathars' Crusade", "ai:Attended Knight"]);
    expect(strip(withPerson)).toEqual(without);
    expect(advanceUntilDecision(session(withPerson)).decision.kind).not.toBe("trigger-order");
  });

  it("a table with no person at it (self-play, Expert): the user seat's two triggers go on the stack in the order they triggered — no question", () => {
    const flushed = live(enter(board({ humans: null, user: [P("crusade", CATHARS_CRUSADE, "user"), P("knight", ATTENDED_KNIGHT, "user")] }), "knight"));
    expect({ stack: stackNames(flushed), pending: flushed.pendingChoice ?? null, next: advanceUntilDecision(session(flushed)).decision.kind === "trigger-order" })
      .toEqual({ stack: ["user:Cathars' Crusade", "user:Attended Knight"], pending: null, next: false });
  });
});

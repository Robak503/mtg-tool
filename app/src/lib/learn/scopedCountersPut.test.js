/**
 * scopedCountersPut.test.js — SCOPED COUNTERS-PUT: "Whenever one or more +1/+1 counters are put on
 * A CREATURE YOU CONTROL" (Enduring Scalelord, Simic Ascendancy #1259, The Powerful Dragon).
 *
 * The self form ("…on THIS creature") already shipped; the code carried an explicit note that scoped
 * subjects were "a DIFFERENT scope needing the shared scopeMatches vocabulary — a later slice". This is
 * that slice, and it routes through the SAME creatureSubjectScope switch the dies/etb watchers use rather
 * than inventing a second vocabulary.
 *
 * ⚠️ DISTINCT FROM THE ACTIVE FORM. `countersPlaced` is "whenever YOU PUT one or more counters…" and fires
 * only when the CONTROLLER places them. This PASSIVE wording fires no matter who did — including an
 * opponent's effect. Folding them together would silently drop every opponent-placed counter, so both
 * detections are pinned side by side below.
 *
 * ⚠️ NO BATCHING HERE, unlike the dies / graveyard-leave arms. One addCounter event places N counters on
 * ONE permanent, so "one or more" is already satisfied per event — and a spell putting counters on three
 * creatures correctly fires three times, because the plural counts COUNTERS, not creatures. Adding a batch
 * pass here would have been wrong.
 *
 * THE LOAD-BEARING GUARD is `scope !== "self"` in the watcher pass's descriptorFilter. scopeMatches would
 * ALSO match a self descriptor when the watcher happens to BE the permanent receiving counters — which the
 * self loop already fired — so without that half every self-trigger would fire TWICE. The first runtime
 * test is the one that catches it.
 */
import { describe, expect, it } from "vitest";

import { detectTriggers, checkCounterTriggers } from "./triggers.js";
import { _resetIdsForTests, createGameState } from "./gameState.js";

const card = (name, oracle) => ({ id: `c-${name}`, name, type: "Creature — Elf", mana: "{1}{G}", power: 1, toughness: 1, keywords: [], oracle });

const SELF = "Whenever one or more +1/+1 counters are put on this creature, draw a card.";
const SCOPED = "Whenever one or more +1/+1 counters are put on a creature you control, draw a card.";
const MINUS = "Whenever one or more -1/-1 counters are put on a creature you control, draw a card.";

/** `watchers` sit on the battlefield; `events` is the pending counter queue. */
function board(watchers, events, extra = []) {
  _resetIdsForTests();
  const s0 = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
  return {
    ...s0,
    pendingCounterEvents: events,
    players: {
      ...s0.players,
      user: { ...s0.players.user, battlefield: watchers },
      ai1: { ...s0.players.ai1, battlefield: extra },
    },
  };
}

const fires = (state) => (checkCounterTriggers(state).pendingTriggers || []).length;

describe("detection — passive scoped form vs the active one", () => {
  it("'on a creature you control' routes through the shared scope switch", () => {
    expect(detectTriggers(card("Scalelord", SCOPED))[0])
      .toMatchObject({ event: "countersPut", scope: "creatureYouControl", counterType: "+1/+1" });
  });

  it("REGRESSION PIN — the SELF form is unchanged", () => {
    expect(detectTriggers(card("Selfy", SELF))[0]).toMatchObject({ event: "countersPut", scope: "self" });
  });

  it("the ACTIVE 'whenever YOU PUT' form stays its own event (it gates on the placer)", () => {
    expect(detectTriggers(card("Active", "Whenever you put one or more +1/+1 counters on a creature you control, draw a card."))[0])
      .toMatchObject({ event: "countersPlaced" });
  });

  it("the counter TYPE rides the descriptor", () => {
    expect(detectTriggers(card("Minus", MINUS))[0]).toMatchObject({ counterType: "-1/-1" });
  });
});

describe("RUNTIME", () => {
  it("THE LOAD-BEARING ONE — a SELF trigger fires exactly ONCE, not twice", () => {
    // The watcher IS the permanent receiving counters. scopeMatches would match its self descriptor in the
    // watcher pass too, double-firing it, without the `scope !== "self"` half of the descriptorFilter.
    const w = { id: "w", controller: "user", card: card("Selfy", SELF) };
    expect(fires(board([w], [{ id: "w", type: "+1/+1" }]))).toBe(1);
  });

  it("a scoped watcher fires when ANOTHER creature it controls gets counters", () => {
    const w = { id: "w", controller: "user", card: card("Scalelord", SCOPED) };
    const bear = { id: "b", controller: "user", card: { id: "cb", name: "Bear", type: "Creature — Bear", oracle: "", power: 2, toughness: 2 } };
    expect(fires(board([w, bear], [{ id: "b", type: "+1/+1" }]))).toBe(1);
  });

  it("'you control' is honoured — an OPPONENT's creature getting counters fires nothing", () => {
    const w = { id: "w", controller: "user", card: card("Scalelord", SCOPED) };
    const theirs = { id: "t", controller: "ai1", card: { id: "ct", name: "Theirs", type: "Creature — Bear", oracle: "", power: 2, toughness: 2 } };
    expect(fires(board([w], [{ id: "t", type: "+1/+1" }], [theirs]))).toBe(0);
  });

  it("counter TYPE discriminates — a -1/-1 placement never trips a +1/+1 watcher", () => {
    const w = { id: "w", controller: "user", card: card("Scalelord", SCOPED) };
    const bear = { id: "b", controller: "user", card: { id: "cb", name: "Bear", type: "Creature — Bear", oracle: "", power: 2, toughness: 2 } };
    expect(fires(board([w, bear], [{ id: "b", type: "-1/-1" }]))).toBe(0);
    expect(fires(board([w, bear], [{ id: "b", type: "+1/+1" }]))).toBe(1);
  });

  it("counters on THREE creatures fire three times (the plural counts COUNTERS, not creatures)", () => {
    const w = { id: "w", controller: "user", card: card("Scalelord", SCOPED) };
    const bears = ["b0", "b1", "b2"].map((id) => ({ id, controller: "user", card: { id: `c${id}`, name: id, type: "Creature — Bear", oracle: "", power: 2, toughness: 2 } }));
    expect(fires(board([w, ...bears], bears.map((b) => ({ id: b.id, type: "+1/+1" }))))).toBe(3);
  });

  it("a permanent that left before the flush is a clean no-op", () => {
    const w = { id: "w", controller: "user", card: card("Scalelord", SCOPED) };
    expect(fires(board([w], [{ id: "gone", type: "+1/+1" }]))).toBe(0);
  });
});

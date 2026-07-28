/**
 * gyLeaveBatchTrigger.test.js — BATCHED GRAVEYARD-LEAVE (CR 603.1): "Whenever ONE OR MORE cards leave your
 * graveyard" (Desecrated Tomb #4196, Quintorius #9596, Insidious Roots #1386, Fang #6282 — 28 carriers, the
 * largest single sub-family of the one-or-more vein).
 *
 * The singular `gyLeave` fires once PER CARD out of the drained pendingGraveyardEvents queue. The plural
 * fires ONCE for the whole batch — so mass graveyard exile (Bojuka Bog on a full yard) would otherwise mint
 * a Bat token per card instead of one. Same over-fire the diesBatch arm exists to prevent, reached through a
 * different queue.
 *
 * Given a DEDICATED event name (`gyLeaveBatch`) for the same structural reason: a batched descriptor then has
 * no route into the per-card fire loop at all. Its gyCardType / gyOwnerScope filter fields are IDENTICAL to
 * the singular's, and the batch pass reuses those very predicates rather than restating them — so a filter
 * fix can never apply to one and not the other.
 *
 * THE EARLY-RETURN TRAP, second sighting. The diesBatch arm was silently skipped on a board holding only
 * batch watchers, because the singular pass fired nothing and an early return bailed before the batch pass.
 * checkGraveyardEventTriggers has the same `if (!fired.length) return cleared` shape, so the batch pass is
 * deliberately placed BEFORE it — and the only-batch-watcher test below is what proves that.
 */
import { describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { detectTriggers, checkGraveyardEventTriggers } from "./triggers.js";
import { _resetIdsForTests, createGameState } from "./gameState.js";

const TOKEN_EFFECT = "create a 1/1 black Bat creature token with flying.";
const BATCH = `Whenever one or more cards leave your graveyard, ${TOKEN_EFFECT}`;
const BATCH_CREATURES = `Whenever one or more creature cards leave your graveyard, ${TOKEN_EFFECT}`;
const SINGULAR = `Whenever a creature card leaves your graveyard, ${TOKEN_EFFECT}`;

const watcher = (oracle) => ({ id: "cw", name: "Tomb", type: "Enchantment", mana: "{3}", keywords: [], oracle });

/** A board with the watcher out and `events` queued on the graveyard-event queue. */
function board(oracle, events) {
  _resetIdsForTests();
  const s0 = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
  return {
    ...s0,
    pendingGraveyardEvents: events,
    players: {
      ...s0.players,
      user: { ...s0.players.user, battlefield: [{ id: "w", controller: "user", card: watcher(oracle) }] },
    },
  };
}

const leaving = (n, { type = "Creature — Bear", gyOwner = "user" } = {}) =>
  Array.from({ length: n }, (_, i) => ({
    dir: "leave", zone: "graveyard", gyOwner,
    card: { id: `g${i}`, name: `Card${i}`, type, oracle: "" },
  }));

const fires = (oracle, events) => (checkGraveyardEventTriggers(board(oracle, events)).pendingTriggers || []).length;

describe("detection", () => {
  it("the plural is its OWN event, and the bare form filters no card type", () => {
    expect(detectTriggers(watcher(BATCH))[0]).toMatchObject({ event: "gyLeaveBatch", gyCardType: null, gyOwnerScope: "you" });
  });

  it("the 'creature cards' form carries the same gyCardType the singular uses", () => {
    expect(detectTriggers(watcher(BATCH_CREATURES))[0]).toMatchObject({ event: "gyLeaveBatch", gyCardType: "Creature" });
  });

  it("REGRESSION PIN — the singular still detects as gyLeave", () => {
    expect(detectTriggers(watcher(SINGULAR))[0]).toMatchObject({ event: "gyLeave", gyCardType: "Creature" });
  });

  it("CREED — a rider leaves it undetected (safe FN)", () => {
    expect(detectTriggers(watcher("Whenever one or more cards leave your graveyard during your turn, draw a card."))).toHaveLength(0);
  });
});

describe("RUNTIME — once per batch, and the contrast that proves it", () => {
  it("THE LOAD-BEARING ONE — THREE cards leaving fire the batch watcher exactly ONCE", () => {
    expect(fires(BATCH, leaving(3))).toBe(1);
  });

  it("…while the SINGULAR watcher fires THREE times on the same queue", () => {
    // If these two ever agree, the plural has been folded onto the per-card loop and every carrier of this
    // shape is over-firing — Bojuka Bog on a full yard would mint a token per card.
    expect(fires(SINGULAR, leaving(3))).toBe(3);
  });

  it("the ONLY-BATCH-WATCHER board still fires (the early-return trap that bit diesBatch)", () => {
    // The singular pass fires nothing here; an early `return cleared` before the batch pass would make this 0
    // while the card still classified native.
    expect(fires(BATCH, leaving(1))).toBe(1);
  });

  it("the gyCardType filter is honoured — a LAND leaving does not fire the creature-only batch", () => {
    expect(fires(BATCH_CREATURES, leaving(2, { type: "Land" }))).toBe(0);
    expect(fires(BATCH_CREATURES, leaving(2, { type: "Creature — Bear" }))).toBe(1);
  });

  it("'YOUR graveyard' is honoured — an OPPONENT's graveyard emptying fires nothing", () => {
    expect(fires(BATCH, leaving(3, { gyOwner: "ai1" }))).toBe(0);
  });

  it("a mixed batch fires once when ANY card matches (CR 603.1 — 'one or more')", () => {
    expect(fires(BATCH_CREATURES, [...leaving(2, { type: "Land" }), ...leaving(1)])).toBe(1);
  });

  it("cards ENTERING a graveyard do not fire a LEAVE batch", () => {
    const entering = leaving(3).map((e) => ({ ...e, dir: "enter" }));
    expect(fires(BATCH, entering)).toBe(0);
  });

  it("an empty queue fires nothing", () => {
    expect(fires(BATCH, [])).toBe(0);
  });
});

describe("classification — the staples this unblocks", () => {
  it("Desecrated Tomb's shape flips", () => {
    expect(classifyCard(watcher(BATCH_CREATURES))).toMatch(/^native/);
  });

  it("the bare-card form flips too (Insidious Roots #1386 class)", () => {
    expect(classifyCard(watcher(BATCH))).toMatch(/^native/);
  });
});

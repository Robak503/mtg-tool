/**
 * applyChoicePendingWindow.test.js — SD-3 + SD-6 (Lane A3, play-harness overhaul).
 *
 * SD-3 (CR 702.85a / 601.2b): applyChoice must validate the submitted choice against
 * the PENDING-WINDOW CONTROLLER, not the priorityHolder. resolveTopOfStack always
 * finalizes (resetPriorityLoop ⇒ priorityHolder = activePlayer), so a user's discover
 * that resolves on an OPPONENT'S turn pauses with priorityHolder = the AI active
 * player while legalChoices short-circuits to "controller only, [] for everyone
 * else". Pre-fix, applyChoice computed legalActionsForPlayer(state, priorityHolder)
 * = [] → INVALID_CHOICE forever — a human-facing hard wedge (the same ask re-surfaced
 * unanswerable on every /api/learn/step submit).
 *
 * SD-6: while a resolution-time pendingChoice / pendingArbiter is suspended, a stale
 * /step submit must NOT dispatch a priority action (legalActionsForPlayer has no
 * pendingChoice short-circuit, so pre-fix a racing pass-priority could resolve the
 * NEXT stack object mid-resolution). applyChoice now drops the stale submit and
 * re-surfaces the live picker — applyPendingChoice's exact stale-submit semantics.
 *
 * Cards are fully-shaped inline (plain vitest has no oracle index on disk — the
 * repo's hermetic-test pattern). The discover scenario mirrors a REAL card's
 * trigger: Geological Appraiser — "When this creature enters, if you cast it,
 * discover 3." (oracle verified against the bundled Scryfall snapshot,
 * scryfall-bulk/oracle-index.json, 2026-07-03).
 */

import { describe, it, expect, beforeEach } from "vitest";
import { _resetIdsForTests } from "./gameState.js";
import {
  createLearnSession,
  advanceUntilDecision,
  applyChoice,
} from "./learnSession.js";
import { legalActionsForPlayer } from "./legalChoices.js";

beforeEach(() => _resetIdsForTests());

function forest(i) {
  return { id: `f-${i}`, name: "Forest", type: "Basic Land — Forest", oracle: "{T}: Add {G}.", mana: "" };
}
function bear(i) {
  return { id: `b-${i}`, name: "Grizzly Bears", type: "Creature — Bear", oracle: "", mana: "{1}{G}", cmc: 2, keywords: [], power: 2, toughness: 2 };
}
function makeDeck(prefix) {
  const cards = [];
  for (let i = 0; i < 18; i++) cards.push(forest(`${prefix}-${i}`));
  for (let i = 0; i < 12; i++) cards.push(bear(`${prefix}-${i}`));
  return cards;
}

/**
 * A beginner session paused on a USER discover window during the AI'S turn — the
 * exact off-turn state the driver produces (advanceUntilDecision's pendingDiscover
 * block surfaces the controller's ask BEFORE the priority loop, leaving
 * priorityHolder = the active AI seat untouched). `found` is the discovered card,
 * already parked in the user's exile per the discover resolver.
 */
function offTurnDiscoverSession(found, { controller = "user" } = {}) {
  const fresh = createLearnSession({
    userDeck: makeDeck("u"),
    opponentDeck: makeDeck("a"),
    difficulty: "beginner",
  });
  const exileSeat = controller;
  const state = {
    ...fresh.state,
    phase: "precombat-main",
    step: "main",
    activePlayer: "ai",
    priorityHolder: "ai", // the wedge precondition: window controller ≠ priorityHolder
    consecutivePasses: 0,
    players: {
      ...fresh.state.players,
      [exileSeat]: { ...fresh.state.players[exileSeat], exile: [found] },
    },
    pendingDiscover: { controller, cardId: found.id, mv: 2 },
  };
  return { ...fresh, state };
}

describe("SD-3 — applyChoice answers an off-turn discover window (the wedge repro)", () => {
  it("driver surfaces the user's discover ask with priorityHolder still the AI seat", () => {
    // The found card mirrors the Geological Appraiser line ("discover 3" finds a
    // nonland with MV ≤ 3): a real Grizzly Bears body, MV 2.
    const found = bear("found");
    const session = offTurnDiscoverSession(found);
    const { session: paused, decision } = advanceUntilDecision(session);

    expect(decision.kind).toBe("ask"); // the controller's ask, surfaced before the priority loop
    expect(paused.state.priorityHolder).toBe("ai"); // NOT rotated to the controller
    expect(paused.state.pendingDiscover).toMatchObject({ controller: "user", cardId: found.id });
    // legalChoices short-circuit: controller-only actions, [] for everyone else.
    expect(decision.options.some((a) => a.kind === "discover-to-hand")).toBe(true);
    expect(legalActionsForPlayer(paused.state, "ai")).toEqual([]);
  });

  it("discover-to-hand submitted via applyChoice DISPATCHES (pre-fix: INVALID_CHOICE forever)", () => {
    const found = bear("found");
    const { session: paused, decision } = advanceUntilDecision(offTurnDiscoverSession(found));
    const toHand = decision.options.find((a) => a.kind === "discover-to-hand");
    expect(toHand).toBeDefined();

    const { session: after, decision: next } = applyChoice(paused, toHand);
    expect(next.code).not.toBe("INVALID_CHOICE"); // the wedge is gone
    expect(after.state.pendingDiscover).toBeFalsy(); // window settled
    expect(after.state.players.user.hand.some((c) => c.id === found.id)).toBe(true); // card went to hand
    // The user's answer was logged as a real (non-auto) choice.
    expect(after.decisionLog.some((e) => e.auto === false && e.action.kind === "discover-to-hand")).toBe(true);
  });

  it("free-casting the found card via applyChoice also dispatches (CR 601.2b — no mana paid)", () => {
    const found = bear("found");
    const { session: paused, decision } = advanceUntilDecision(offTurnDiscoverSession(found));
    const castFree = decision.options.find((a) => a.kind === "cast-spell");
    expect(castFree).toBeDefined();
    expect(castFree.freeCast).toBe(true);

    const { session: after, decision: next } = applyChoice(paused, castFree);
    expect(next.code).not.toBe("INVALID_CHOICE");
    expect(after.state.pendingDiscover).toBeFalsy();
    expect(after.state.players.user.manaPool).toEqual({ W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 }); // free
  });

  it("REVERSE PIN — an OPPONENT-controlled window still rejects a user-submitted choice", () => {
    // The AI's discover window: actor derives to "ai", whose legal set is the two
    // discover actions — the user's pass-priority must not match anything.
    const found = bear("ai-found");
    const session = offTurnDiscoverSession(found, { controller: "ai" });

    const { session: after, decision } = applyChoice(session, { kind: "pass-priority", playerId: "user" });
    expect(decision.kind).toBe("dispatch-error");
    expect(decision.code).toBe("INVALID_CHOICE");
    expect(after.state.pendingDiscover).toMatchObject({ controller: "ai", cardId: found.id }); // unchanged
  });

  it("DEFENSIVE (state-constructed, not driver-reachable) — a cascade window's decline validates against its controller", () => {
    // The cascade window auto-rotates to its controller through the priority loop in
    // reachable states (no dedicated driver block), so this is a defensive unit pin
    // on the same actor derivation: controller ≠ priorityHolder, decline dispatches.
    const found = bear("cascade-found");
    const fresh = createLearnSession({
      userDeck: makeDeck("u"),
      opponentDeck: makeDeck("a"),
      difficulty: "beginner",
    });
    const state = {
      ...fresh.state,
      phase: "precombat-main",
      step: "main",
      activePlayer: "ai",
      priorityHolder: "ai",
      consecutivePasses: 0,
      players: { ...fresh.state.players, user: { ...fresh.state.players.user, exile: [found] } },
      pendingCascade: { controller: "user", cardId: found.id, mv: 2, cap: 3 },
    };
    const session = { ...fresh, state };

    const decline = legalActionsForPlayer(state, "user").find((a) => a.kind === "cascade-decline");
    expect(decline).toBeDefined();
    const { session: after, decision } = applyChoice(session, decline);
    expect(decision.code).not.toBe("INVALID_CHOICE");
    expect(after.state.pendingCascade).toBeFalsy(); // window settled (found card bottomed, CR 702.85a)
  });
});

describe("SD-6 — a stale priority submit during a suspended pendingChoice is dropped", () => {
  /** A beginner session paused on the user's own tutor picker, with a live stack
   *  object mid-resolution (the suspended program's spell) parked behind it. */
  function tutorPausedSession() {
    const fresh = createLearnSession({
      userDeck: makeDeck("u"),
      opponentDeck: makeDeck("a"),
      difficulty: "beginner",
    });
    const candidates = fresh.state.players.user.library.slice(0, 2).map((c) => ({ id: c.id, name: c.name }));
    const state = {
      ...fresh.state,
      phase: "precombat-main",
      step: "main",
      activePlayer: "user",
      priorityHolder: "user", // priority was reset by finalizeStackResolution at pause time
      consecutivePasses: 0,
      pendingChoice: {
        kind: "tutor-search",
        controller: "user",
        candidates,
        sourceName: "Worldly Tutor",
        filterLabel: "creature card",
        destination: "hand",
        remaining: 1,
        sourceZone: "library",
      },
    };
    return { ...fresh, state };
  }

  it("applyChoice drops a racing pass-priority and re-surfaces the SAME tutor picker", () => {
    const session = tutorPausedSession();
    const stackBefore = session.state.stack.length;
    const libBefore = session.state.players.user.library.length;

    const { session: after, decision } = applyChoice(session, { kind: "pass-priority", playerId: "user" });

    expect(decision.kind).toBe("tutor-search"); // the live picker, not a dispatched pass
    expect(decision.candidates).toEqual(session.state.pendingChoice.candidates);
    expect(after.state.pendingChoice).toMatchObject({ kind: "tutor-search", controller: "user" }); // still suspended
    expect(after.state.stack.length).toBe(stackBefore); // nothing resolved
    expect(after.state.players.user.library.length).toBe(libBefore); // nothing fetched/drawn
    expect(after.decisionLog.some((e) => e.auto === false)).toBe(false); // no user action was logged
  });

  it("applyChoice drops a stale submit while a pendingArbiter ruling is open and re-surfaces it", () => {
    const fresh = createLearnSession({
      userDeck: makeDeck("u"),
      opponentDeck: makeDeck("a"),
      difficulty: "beginner",
    });
    const state = {
      ...fresh.state,
      phase: "precombat-main",
      step: "main",
      activePlayer: "user",
      priorityHolder: "user",
      consecutivePasses: 0,
      pendingArbiter: { controller: "user", cardName: "Mystic Confluence", stackObjectId: "stk-x" },
    };
    const session = { ...fresh, state };

    const { session: after, decision } = applyChoice(session, { kind: "pass-priority", playerId: "user" });
    expect(decision.kind).toBe("unresolved"); // the ruling re-surfaces
    expect(after.state.pendingArbiter).toMatchObject({ cardName: "Mystic Confluence" }); // untouched
  });
});

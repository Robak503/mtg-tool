/**
 * tutorNoFindSoftLock.test.js — a tutor that finds NOTHING must not wedge the game (CR 701.23d).
 *
 * FOUND BY THE PLAYABILITY SWEEP AT SCALE, which is the point worth recording: 9 of 150 human-path
 * commander games wedged, every one of them on `tutor-search (no options/candidates)`. That is a real
 * soft-lock in ~6% of games, and "zero soft-locks" is the 1.0 bar. No test caught it because every unit
 * test of the tutor path supplied candidates — the failure only exists when the search finds nothing.
 *
 * THE BUG: on the human (pause) path, `advanceUntilDecision` returned a `tutor-search` decision
 * UNCONDITIONALLY, including when the candidate list was empty. That asks a person to pick from zero
 * options. No UI can answer it and no player can escape it — the game simply stops, with no error raised
 * anywhere. The auto path already treated an empty list as the honest no-find; only the pause path did not.
 *
 * THE RULE: searching and finding nothing is a legal, COMPLETE outcome. You reveal, shuffle, and carry on.
 * There is no decision to make, so the engine must not ask for one.
 *
 * The fix settles explicitly with a null pick rather than falling through to the auto path, because that
 * path's offered-action list is gated on `mayFailToFind !== false` — a MANDATORY search with nothing to
 * find would produce zero offered actions and strand the game a second way. That case is pinned below.
 */
import { describe, expect, it } from "vitest";

import { createLearnSession, advanceUntilDecision } from "./learnSession.js";

function makeDeck(prefix) {
  return Array.from({ length: 40 }, (_, i) => ({
    id: `${prefix}${i}`,
    name: i % 2 ? "Forest" : "Grizzly Bears",
    type: i % 2 ? "Basic Land — Forest" : "Creature — Bear",
    mana: i % 2 ? "" : "{1}{G}",
    power: i % 2 ? undefined : 2,
    toughness: i % 2 ? undefined : 2,
    oracle: i % 2 ? "{T}: Add {G}." : "",
  }));
}

/** A paused session sitting on a tutor-search whose candidate list is EMPTY — the true no-find. */
function noFindSession({ mayFailToFind } = {}) {
  const fresh = createLearnSession({
    userDeck: makeDeck("u"),
    opponentDeck: makeDeck("a"),
    difficulty: "beginner",          // the HUMAN path — this is where the wedge lived
  });
  return {
    ...fresh,
    state: {
      ...fresh.state,
      phase: "precombat-main",
      step: "main",
      activePlayer: "user",
      priorityHolder: "user",
      consecutivePasses: 0,
      pendingChoice: {
        kind: "tutor-search",
        controller: "user",
        candidates: [],                    // <- the whole bug
        sourceName: "Worldly Tutor",
        filterLabel: "Sliver card",        // nothing in this deck matches
        destination: "hand",
        remaining: 1,
        sourceZone: "library",
        ...(mayFailToFind === undefined ? {} : { mayFailToFind }),
      },
    },
  };
}

describe("THE SOFT-LOCK — an empty candidate list must never reach a human", () => {
  it("does NOT return an unanswerable tutor-search decision", () => {
    const { decision } = advanceUntilDecision(noFindSession());
    // Before the fix this returned { kind: "tutor-search", candidates: [] } — a prompt with nothing to
    // pick, which the sweep scored as a wedge because it genuinely is one.
    expect(decision.kind).not.toBe("tutor-search");
  });

  it("clears the pending choice instead of leaving the game suspended on it", () => {
    const { session } = advanceUntilDecision(noFindSession());
    expect(session.state.pendingChoice?.kind).not.toBe("tutor-search");
  });

  it("the game CONTINUES — it reaches a real decision or a conclusion", () => {
    const { decision } = advanceUntilDecision(noFindSession());
    // The honest success condition: play goes on. Any normal decision kind is fine.
    expect(["ask", "game-over", "unresolved", "cleanup-discard", "scry-surveil"]).toContain(decision.kind);
  });

  it("a MANDATORY search that finds nothing also resolves — the second way it could strand", () => {
    // mayFailToFind:false gates the auto path's offered actions, so falling through to that path with an
    // empty list would produce zero offered actions and hang. Settling explicitly is what avoids it.
    const { decision, session } = advanceUntilDecision(noFindSession({ mayFailToFind: false }));
    expect(decision.kind).not.toBe("tutor-search");
    expect(session.state.pendingChoice?.kind).not.toBe("tutor-search");
  });
});

describe("CREED — the fix is narrow: a tutor WITH candidates still asks", () => {
  it("a real choice still surfaces as a tutor-search decision on the human path", () => {
    // The feature must survive the fix. If this ever fails, the no-find guard has swallowed the whole
    // tutor lane and the engine is silently choosing for the player.
    const fresh = noFindSession();
    const cands = fresh.state.players.user.library.slice(0, 2).map((c) => ({ id: c.id, name: c.name }));
    const withCands = {
      ...fresh,
      state: { ...fresh.state, pendingChoice: { ...fresh.state.pendingChoice, candidates: cands } },
    };
    const { decision } = advanceUntilDecision(withCands);
    expect(decision.kind).toBe("tutor-search");
    expect(decision.candidates).toHaveLength(2);
  });
});

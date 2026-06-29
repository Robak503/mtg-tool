/**
 * PR 10.4 tests — termination + loop safety.
 *
 * Games end naturally (win/loss/elimination); mutual lethal is a draw, not a
 * user loss; a game that goes too long ends as a turn-limit draw with
 * diagnostics rather than the scary "engine stuck"; and an Expert full game
 * runs to completion in a single advanceUntilDecision call.
 */

import { describe, expect, it, beforeEach, vi } from "vitest";
import { _resetIdsForTests } from "./gameState.js";
import {
  createLearnSession,
  advanceUntilDecision,
  _forceLifeForTests,
} from "./learnSession.js";

beforeEach(() => _resetIdsForTests());

function forest(i) {
  return { id: `f-${i}`, name: "Forest", type: "Basic Land — Forest", oracle: "{T}: Add {G}.", mana: "" };
}
function bear(i) {
  return { id: `b-${i}`, name: "Grizzly Bears", type: "Creature — Bear", oracle: "", mana: "{1}{G}", cmc: 2, keywords: [], power: 2, toughness: 2 };
}
function aggroDeck(prefix) {
  const cards = [];
  for (let i = 0; i < 25; i++) cards.push(forest(`${prefix}-${i}`));
  for (let i = 0; i < 25; i++) cards.push(bear(`${prefix}-${i}`));
  return cards;
}
// A pure-land "do-nothing" deck: no creatures, no spells, so neither seat can ever deal
// damage. Without the clock this stalls to the turn cap (the canonical draw). With the
// clock on, the active player's life drains to a REAL lethal — the decisive-ending case.
function landDeck(prefix) {
  const cards = [];
  for (let i = 0; i < 60; i++) cards.push(forest(`${prefix}-${i}`));
  return cards;
}

describe("simultaneous death", () => {
  it("user and all opponents dying together is a draw, not a loss", () => {
    let sess = createLearnSession({ userDeck: aggroDeck("u"), opponentDeck: aggroDeck("a"), difficulty: "expert" });
    sess = _forceLifeForTests(sess, "user", 0);
    sess = _forceLifeForTests(sess, "ai", 0);
    const { session: out, decision } = advanceUntilDecision(sess);
    expect(out.status).toBe("draw");
    expect(decision.kind).toBe("game-over");
  });

  it("only the user dying is still a loss", () => {
    let sess = createLearnSession({ userDeck: aggroDeck("u"), opponentDeck: aggroDeck("a"), difficulty: "expert" });
    sess = _forceLifeForTests(sess, "user", 0);
    const { session: out } = advanceUntilDecision(sess);
    expect(out.status).toBe("ai-wins");
  });
});

describe("turn-limit stalemate", () => {
  it("ends as a draw with a turn-limit reason past the ceiling", () => {
    let sess = createLearnSession({ userDeck: aggroDeck("u"), opponentDeck: aggroDeck("a"), difficulty: "expert" });
    sess = { ...sess, state: { ...sess.state, turn: 101 } };
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { session: out, decision } = advanceUntilDecision(sess);
    warn.mockRestore();
    expect(out.status).toBe("draw");
    expect(decision.kind).toBe("game-over");
    expect(decision.reason).toBe("turn-limit");
    expect(decision.diagnostic?.turn).toBe(101);
  });
});

describe("opt-in self-play time pressure (NOT a Magic rule)", () => {
  it("OFF (default): a stalling land-only game still draws at the cap — byte-identical", () => {
    let sess = createLearnSession({ userDeck: landDeck("u"), opponentDeck: landDeck("a"), difficulty: "expert", seed: 7 });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { session: out, decision } = advanceUntilDecision(sess); // no timePressure option
    warn.mockRestore();
    expect(out.status).toBe("draw");
    expect(decision.kind).toBe("game-over");
    expect(decision.reason).toBe("turn-limit");
    expect(out.state.turn).toBeGreaterThan(100); // ran all the way to MAX_TURNS
  });

  it("ON: the same stalling game ends DECISIVELY (W/L) via a REAL life-≤0 death, before the hard cap", () => {
    let sess = createLearnSession({ userDeck: landDeck("u"), opponentDeck: landDeck("a"), difficulty: "expert", seed: 7 });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { session: out, decision } = advanceUntilDecision(sess, { timePressure: true });
    warn.mockRestore();
    // A clean, decisive winner — NOT a draw, NOT a timeout (the clock pulled real lethal forward).
    expect(["user-wins", "ai-wins"]).toContain(out.status);
    expect(decision.kind).toBe("game-over");
    // Resolved below MAX_TURNS (the clock engages at the soft cap, 60, and the quadratic
    // drain reaches lethal a handful of turns later — comfortably under the 100 hard cap).
    expect(out.state.turn).toBeLessThan(100);
    expect(out.state.turn).toBeGreaterThan(60); // the clock only bites PAST the soft cap
    // The ending is a REAL state-based death: the losing seat is actually at ≤0 life,
    // never a fabricated "leader wins at the cap" call.
    const loser = out.status === "ai-wins" ? "user" : "ai";
    expect(out.state.players[loser].life).toBeLessThanOrEqual(0);
  });

  it("ON: is deterministic — same seed ⇒ identical outcome and turn", () => {
    const run = () => {
      const sess = createLearnSession({ userDeck: landDeck("u"), opponentDeck: landDeck("a"), difficulty: "expert", seed: 42 });
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      const { session: out } = advanceUntilDecision(sess, { timePressure: true });
      warn.mockRestore();
      return { status: out.status, turn: out.state.turn };
    };
    const a = run();
    const b = run();
    expect(a).toEqual(b);
  });

  it("ON: is SYMMETRIC — swapping which seat is active first swaps the winner (no fixed-seat bias)", () => {
    // Same decks, same seed; ONLY the player who takes the first turn differs. The clock is
    // the identical formula applied to whichever seat is active, so the two seats are
    // interchangeable: relabel which is "user" and the winner relabels with it. This proves
    // the mechanism never favors a fixed seat — the outcome is a property of the symmetric
    // drain + turn order, not of being "the user".
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const userFirst = advanceUntilDecision(
      createLearnSession({ userDeck: landDeck("u"), opponentDeck: landDeck("a"), difficulty: "expert", seed: 7, activePlayer: "user" }),
      { timePressure: true },
    ).session.status;
    const aiFirst = advanceUntilDecision(
      createLearnSession({ userDeck: landDeck("u"), opponentDeck: landDeck("a"), difficulty: "expert", seed: 7, activePlayer: "ai" }),
      { timePressure: true },
    ).session.status;
    warn.mockRestore();
    // The two are mirror images: whoever wins going-first-as-user, the OTHER seat wins when
    // ai goes first. Both are clean decisive results, and they are opposites (the swap).
    expect(["user-wins", "ai-wins"]).toContain(userFirst);
    expect(["user-wins", "ai-wins"]).toContain(aiFirst);
    expect(userFirst).not.toBe(aiFirst); // swapping the active seat swapped the winner
  });

  it("ON: a game that STILL reaches the hard cap is an honest 'timeout', NEVER a fabricated W/L", () => {
    // Force the loop to start already past the cap so it takes the turn-limit branch with
    // the clock on. Both seats get a life total far above even the (large) turn-101 drain so
    // the clock does NOT kill on the boundary — the loop falls through to the turn-limit
    // branch. A metric tiebreak WOULD have called a draw/winner there; instead, with the
    // clock on, we get the DISTINCT, honest `timeout` outcome (never a fabricated W/L).
    let sess = createLearnSession({ userDeck: aggroDeck("u"), opponentDeck: aggroDeck("a"), difficulty: "expert" });
    sess = {
      ...sess,
      state: {
        ...sess.state,
        turn: 101,
        players: {
          ...sess.state.players,
          user: { ...sess.state.players.user, life: 100000 },
          ai: { ...sess.state.players.ai, life: 100000 },
        },
      },
    };
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { session: out, decision } = advanceUntilDecision(sess, { timePressure: true });
    warn.mockRestore();
    expect(out.status).toBe("timeout");          // a DISTINCT 4th outcome, not user/ai-wins/draw
    expect(decision.kind).toBe("game-over");
    expect(decision.reason).toBe("timeout");
    expect(decision.diagnostic?.turn).toBe(101);
  });

  it("ON: the clock is a NO-OP before the soft cap (early decisive games are byte-identical)", () => {
    // Aggro decks close on their own well before the soft cap (60), so turning the clock on
    // must not change the result token OR the turn — the drain never engages.
    const seed = 5;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const off = advanceUntilDecision(
      createLearnSession({ userDeck: aggroDeck("u"), opponentDeck: aggroDeck("a"), difficulty: "expert", seed }),
    );
    const on = advanceUntilDecision(
      createLearnSession({ userDeck: aggroDeck("u"), opponentDeck: aggroDeck("a"), difficulty: "expert", seed }),
      { timePressure: true },
    );
    warn.mockRestore();
    // The game ends before the soft cap, so on/off agree on both the winner and the turn.
    expect(off.session.state.turn).toBeLessThan(60);
    expect(on.session.status).toBe(off.session.status);
    expect(on.session.state.turn).toBe(off.session.state.turn);
  });
});

describe("expert full game", () => {
  it("autopilots a whole game to a definite end in one call (no engine-stuck)", () => {
    const sess = createLearnSession({ userDeck: aggroDeck("u"), opponentDeck: aggroDeck("a"), difficulty: "expert" });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { session: out, decision } = advanceUntilDecision(sess);
    warn.mockRestore();
    expect(decision.kind).toBe("game-over");
    expect(["user-wins", "ai-wins", "draw"]).toContain(out.status);
  });
});

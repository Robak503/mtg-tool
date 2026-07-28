/**
 * impulseExtendedWindow.test.js — IMPULSE-EXILE with the "until the end of your NEXT turn" window
 * (Light Up the Stage #1211, Reckless Impulse #2120, Wrenn's Resolve #2116, Atsushi #1417 — 22 carriers).
 *
 * ⚠️ WHY THIS IS NOT "turn + 1". `state.turn` increments once per PLAYER turn, so in a four-player game
 * "your next turn" is roughly `turn + 4` and in a duel it is `turn + 2`. Any expiry computed by arithmetic
 * on the turn counter closes the window at the WRONG MOMENT — a wrong effect, not a missing one. That is
 * exactly why templateMatchers refused this shape until now.
 *
 * THE RULE INSTEAD: carry the OWNER plus the stamp turn, and let the CLEANUP decide. A stamp lapses when a
 * turn ENDS that (a) belongs to `_impulseOwner` and (b) began after the stamp. finishCleanupActions runs
 * BEFORE the turn advance, so `state.activePlayer` is the player whose turn is ending — which is what makes
 * the owner comparison meaningful. Correct for both castings, and the two tests below are the proof:
 *
 *   cast on YOUR turn T       → T's cleanup KEEPS it (stamp is not < T); your NEXT turn's cleanup strips.
 *   cast on an OPPONENT's T   → T's cleanup skips it (wrong owner); your upcoming turn's cleanup strips.
 *
 * TWO SITES, DELIBERATELY ASYMMETRIC. The offer gate (legalChoices) treats the mere PRESENCE of an extended
 * stamp as permission; only the cleanup knows when it dies. If both sites tried to compute the window they
 * would drift — the CREED two-sites invariant, resolved by giving exactly one site the authority.
 */
import { describe, expect, it } from "vitest";

import { parseEffectProgram } from "./effects/parser.js";
import { libraryResolvers } from "./effects/atoms/library.js";
import { finishCleanupActions } from "./gameEngine.js";
import { _resetIdsForTests, createGameState } from "./gameState.js";

const S = (oracle) => ({ name: "Probe", type: "Sorcery", mana: "{1}{R}", keywords: [], oracle });
const atomOf = (oracle) => (parseEffectProgram(S(oracle))?.atoms || [])[0];

function board({ turn = 5, activePlayer = "user" } = {}) {
  _resetIdsForTests();
  const s0 = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
  return {
    ...s0, turn, activePlayer,
    players: {
      ...s0.players,
      user: {
        ...s0.players.user,
        library: Array.from({ length: 5 }, (_, i) => ({ id: `L${i}`, name: `Card${i}`, type: "Sorcery", oracle: "" })),
        exile: [],
      },
    },
  };
}

const exileTwo = (state, extended) =>
  libraryResolvers["impulse-exile"](state, { op: "impulse-exile", count: 2, ...(extended ? { extendedWindow: true } : {}) }, { controller: "user" });

/** Run a cleanup as `activePlayer` at turn `turn`, and report how many stamps survive. */
const surviving = (state, { turn, activePlayer }) =>
  (finishCleanupActions({ ...state, turn, activePlayer }).players.user.exile || []).filter((c) => c._impulse).length;

describe("parse", () => {
  it("the trailing-duration wording carries extendedWindow", () => {
    expect(atomOf("Exile the top two cards of your library. You may play those cards until the end of your next turn."))
      .toEqual({ op: "impulse-exile", targetType: null, count: 2, extendedWindow: true });
  });

  it("the LEADING-duration wording carries it too (Light Up the Stage)", () => {
    expect(atomOf("Exile the top two cards of your library. Until the end of your next turn, you may play those cards."))
      .toEqual({ op: "impulse-exile", targetType: null, count: 2, extendedWindow: true });
  });

  it("REGRESSION PIN — the plain this-turn wording is NOT marked extended", () => {
    expect(atomOf("Exile the top two cards of your library. You may play those cards this turn.").extendedWindow)
      .toBeUndefined();
  });
});

describe("the stamp", () => {
  it("carries the OWNER, not a computed expiry turn", () => {
    const s = exileTwo(board({ turn: 5 }), true);
    for (const c of s.players.user.exile) {
      expect(c._impulseExtended).toBe(true);
      expect(c._impulseOwner).toBe("user");
      expect(c._impulseTurn).toBe(5);
    }
  });

  it("a plain stamp carries neither flag (byte-identical to the shipped form)", () => {
    const c = exileTwo(board({ turn: 5 }), false).players.user.exile[0];
    expect(c._impulseExtended).toBeUndefined();
    expect(c._impulseOwner).toBeUndefined();
  });
});

describe("RUNTIME — the window, cast on YOUR OWN turn", () => {
  const cast = () => exileTwo(board({ turn: 5, activePlayer: "user" }), true);

  it("survives the cleanup of the turn it was cast on", () => {
    expect(surviving(cast(), { turn: 5, activePlayer: "user" })).toBe(2);
  });

  it("survives every INTERVENING opponent turn", () => {
    expect(surviving(cast(), { turn: 6, activePlayer: "ai1" })).toBe(2);
    expect(surviving(cast(), { turn: 7, activePlayer: "ai2" })).toBe(2);
  });

  it("THE LOAD-BEARING ONE — dies at the end of the OWNER's next turn", () => {
    expect(surviving(cast(), { turn: 9, activePlayer: "user" })).toBe(0);
  });
});

describe("RUNTIME — the window, cast on an OPPONENT's turn (it is an instant-speed case too)", () => {
  const cast = () => exileTwo(board({ turn: 5, activePlayer: "ai1" }), true);

  it("survives the end of the opponent's turn it was cast on (wrong owner)", () => {
    expect(surviving(cast(), { turn: 5, activePlayer: "ai1" })).toBe(2);
  });

  it("dies at the end of the OWNER's upcoming turn", () => {
    expect(surviving(cast(), { turn: 6, activePlayer: "user" })).toBe(0);
  });
});

describe("RUNTIME — the plain one-turn stamp is unchanged", () => {
  it("dies at the end of its own turn", () => {
    const s = exileTwo(board({ turn: 5, activePlayer: "user" }), false);
    expect(surviving(s, { turn: 5, activePlayer: "user" })).toBe(0);
  });
});

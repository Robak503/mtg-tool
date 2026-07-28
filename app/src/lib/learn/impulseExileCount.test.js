/**
 * impulseExileCount.test.js — IMPULSE-EXILE with a COUNT: "Exile the top TWO/THREE cards of your library.
 * You may play them this turn." (Act on Impulse, Rob the Archives, Jeska's Will #102, Bonehoard Dracosaur
 * #1364, Reckless Impulse — 27 corpus carriers of the this-turn window).
 *
 * The runtime was already complete: `actionsPlayImpulseFromExile` casts nonlands and plays lands out of exile
 * off the `_impulse` / `_impulseTurn` stamp, and gameEngine's cleanup lapses the permission at end of turn.
 * Only the ATOM was hard-wired to the top ONE card, so every multi-card carrier parked. The count is now a
 * parameter; absent it, every shipped single-card carrier is byte-identical (pinned below).
 *
 * ⚠️ THE "UNTIL THE END OF YOUR NEXT TURN" WINDOW IS STILL REFUSED, and deliberately — 22 more carriers wait
 * on it, so the temptation to fold it in here is real. `state.turn` increments once per PLAYER turn, so "your
 * next turn" is NOT `turn + 1` in a multiplayer game; reusing the this-turn stamp would close the window at
 * the wrong moment, which is a wrong effect rather than a missing one. templateMatchers already documented
 * this refusal and the count change does not touch it. It needs a controller-scoped expiry.
 *
 * A library shorter than N exiles what is there (CR 701.10a — as many as you can), never an error and never
 * a fabricated card.
 */
import { describe, expect, it } from "vitest";

import { parseEffectProgram } from "./effects/parser.js";
import { libraryResolvers } from "./effects/atoms/library.js";
import { _resetIdsForTests, createGameState } from "./gameState.js";

const S = (oracle) => ({ name: "Probe", type: "Sorcery", mana: "{1}{R}", keywords: [], oracle });
const atomOf = (oracle) => (parseEffectProgram(S(oracle))?.atoms || [])[0];

function boardWithLibrary(n) {
  _resetIdsForTests();
  const s0 = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
  return {
    ...s0,
    turn: 7,
    players: {
      ...s0.players,
      user: {
        ...s0.players.user,
        library: Array.from({ length: n }, (_, i) => ({ id: `L${i}`, name: `Card${i}`, type: "Sorcery", oracle: "" })),
        exile: [],
      },
    },
  };
}

const run = (state, atom) => libraryResolvers["impulse-exile"](state, atom, { controller: "user" });

describe("parse — the count is a parameter, not a new mechanism", () => {
  it("'the top two cards … play them this turn' carries count 2", () => {
    expect(atomOf("Exile the top two cards of your library. You may play them this turn."))
      .toEqual({ op: "impulse-exile", targetType: null, count: 2 });
  });

  it("'those cards' is the DOMINANT printed referent and maps to the same atom", () => {
    // The first pass admitted only "them" and flipped nothing — 6 of the carriers print "those cards".
    expect(atomOf("Exile the top two cards of your library. You may play those cards this turn."))
      .toEqual({ op: "impulse-exile", targetType: null, count: 2 });
  });

  it("the LEADING-duration form works with a count too (Act on Impulse)", () => {
    expect(atomOf("Exile the top three cards of your library. Until end of turn, you may play those cards."))
      .toEqual({ op: "impulse-exile", targetType: null, count: 3 });
  });

  it("REGRESSION PIN — the SINGULAR form is byte-identical (no count key at all)", () => {
    expect(atomOf("Exile the top card of your library. You may play that card this turn."))
      .toEqual({ op: "impulse-exile", targetType: null });
  });

  it("the 'until the end of your NEXT turn' window is now MODELED (graduated — see impulseExtendedWindow.test.js)", () => {
    // I wrote this as a refusal in the count slice, correctly: the this-turn stamp could not express a
    // controller-scoped two-turn window, and folding it in would have closed the window at the wrong moment.
    // It was built properly instead — the stamp carries the OWNER and the cleanup decides expiry, never
    // arithmetic on the turn counter. Asserted positively rather than deleted, so the boundary stays visible.
    const p = parseEffectProgram(S("Exile the top two cards of your library. Until the end of your next turn, you may play those cards."));
    expect(p.confidence).toBe("high");
    expect(p.atoms[0]).toEqual({ op: "impulse-exile", targetType: null, count: 2, extendedWindow: true });
  });
});

describe("RUNTIME — N cards move, stamped for THIS turn", () => {
  it("THE LOAD-BEARING ONE — exactly N cards leave the library and land in exile", () => {
    const s = run(boardWithLibrary(6), { op: "impulse-exile", count: 3 });
    expect(s.players.user.library).toHaveLength(3);
    expect(s.players.user.exile.map((c) => c.name)).toEqual(["Card0", "Card1", "Card2"]);
  });

  it("every exiled card carries the play permission for the CURRENT turn", () => {
    const s = run(boardWithLibrary(6), { op: "impulse-exile", count: 2 });
    for (const c of s.players.user.exile) {
      expect(c._impulse).toBe(true);
      expect(c._impulseTurn).toBe(7);
    }
  });

  it("no count means ONE card (the shipped behaviour, unchanged)", () => {
    const s = run(boardWithLibrary(6), { op: "impulse-exile" });
    expect(s.players.user.exile).toHaveLength(1);
    expect(s.players.user.library).toHaveLength(5);
  });

  it("a library SHORTER than N exiles what is there (CR 701.10a), never an error", () => {
    const s = run(boardWithLibrary(2), { op: "impulse-exile", count: 5 });
    expect(s.players.user.exile).toHaveLength(2);
    expect(s.players.user.library).toHaveLength(0);
  });

  it("an EMPTY library is a clean logged no-op", () => {
    const s = run(boardWithLibrary(0), { op: "impulse-exile", count: 3 });
    expect(s.players.user.exile).toHaveLength(0);
  });
});

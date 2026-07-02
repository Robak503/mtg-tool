/**
 * OPTIONAL-DISCARD-PAYMENT (rummage) — "you may discard a card. If you do, <effect>."
 *
 * The discard is the COST (it pauses on a which-card choice); the payoff runs ONLY after a real
 * discard settles. Distinct from draw-then-discard (there the discard is the coupled effect, last-
 * position). The cost owns the one pause slot, so the payoff must be non-pausing. If you CAN'T pay
 * (empty hand) or decline, the payoff NEVER runs — no fabricated draw (the cardinal CREED guarantee).
 *
 * Real flips are creatures whose ETB/attack trigger reads "you may discard a card. If you do, draw
 * a card" (Academy Raider, Keldon Raider, Viashino Racketeer, Furyblade Vampire, …). The matcher
 * composes its payoff under LITERAL "Instant" — the draw atom's legacy gate is HIGH only for
 * Instant/Sorcery, so a creature cardType would drop all 30 of the draw-payoff flips.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createGameState, _resetIdsForTests } from "../gameState.js";
import { parseEffectClause } from "./parser.js";
import { runEffectProgram, resolveOptionalDiscardPaymentChoice, resolveDiscardChoice } from "./runProgram.js";

beforeEach(() => _resetIdsForTests());

const clause = (oracle, cardType = "Creature") => parseEffectClause(oracle, cardType, { hasX: false });
const soleOp = (prog) => (prog?.atoms?.length === 1 ? prog.atoms[0].op : null);

const obj = (program) => ({ source: { name: "Rummager" }, payload: { params: { program, controller: "user", targets: [] } } });
const withHandLibrary = (hand, library) => {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return { ...s, players: { ...s.players, user: { ...s.players.user, hand, library } } };
};

describe("optional-discard-payment — parse shape", () => {
  it("folds 'you may discard a card. If you do, <effect>' into ONE atom (HIGH) on a creature cardType", () => {
    const p = clause("You may discard a card. If you do, draw a card.");
    expect(p.confidence).toBe("high");
    expect(soleOp(p)).toBe("optional-discard-payment");
    expect(p.atoms[0].effectAtoms.map((a) => a.op)).toEqual(["draw"]);
  });

  it("accepts a plural-draw payoff and a token payoff", () => {
    expect(soleOp(clause("You may discard a card. If you do, draw two cards."))).toBe("optional-discard-payment");
    expect(soleOp(clause("You may discard a card. If you do, create a 2/2 black Zombie creature token."))).toBe("optional-discard-payment");
  });
});

describe("optional-discard-payment — near-misses stay LOW (CREED false-negatives)", () => {
  const drops = [
    ["discard is at random — trailing modifier breaks the anchor", "You may discard a card at random. If you do, draw a card."],
    ["cost is two cards, not the single-card template", "You may discard two cards. If you do, draw two cards."],
    ["no 'you may' — a mandatory discard, not this optional payment", "Discard a card. If you do, draw a card."],
    ["payoff itself pauses (tutor) — cost owns the only pause slot", "You may discard a card. If you do, search your library for a card."],
    ["else-branch — not modeled", "You may discard a card. If you do, draw a card. Otherwise, lose 1 life."],
    ["targeted payoff — needs a chosen target", "You may discard a card. If you do, return target instant or sorcery card from your graveyard to your hand."],
  ];
  for (const [why, oracle] of drops) {
    it(`does NOT emit optional-discard-payment: ${why}`, () => {
      expect(soleOp(clause(oracle))).not.toBe("optional-discard-payment");
    });
  }
});

describe("optional-discard-payment — runtime", () => {
  it("PAY: discard chains a which-card choice; resolving it pitches the card THEN runs the payoff draw", () => {
    const state = withHandLibrary(
      [{ id: "h1", name: "Pitch", type: "Land" }, { id: "h2", name: "Keep", type: "Land" }],
      [{ id: "d1", name: "Drawn", type: "Land" }],
    );
    const paused = runEffectProgram(state, obj(clause("You may discard a card. If you do, draw a card.")));
    expect(paused.pendingChoice?.kind).toBe("optional-discard-payment");

    const paying = resolveOptionalDiscardPaymentChoice(paused, true);
    expect(paying.pendingChoice?.kind).toBe("discard"); // the cost-discard's which-card choice
    expect(paying.players.user.hand).toHaveLength(2); // not discarded yet
    expect(paying.players.user.library).toHaveLength(1); // payoff hasn't run

    const done = resolveDiscardChoice(paying, "h1");
    expect(done.pendingChoice).toBeFalsy();
    expect(done.players.user.graveyard.map((c) => c.id)).toContain("h1"); // cost paid
    expect(done.players.user.library).toHaveLength(0); // payoff drew d1
    expect(done.players.user.hand.map((c) => c.id).sort()).toEqual(["d1", "h2"]);
  });

  it("DECLINE: hand, library, graveyard ALL untouched — payoff never runs (cardinal CREED)", () => {
    const state = withHandLibrary(
      [{ id: "h1", name: "Keep", type: "Land" }],
      [{ id: "d1", name: "Stay", type: "Land" }],
    );
    const paused = runEffectProgram(state, obj(clause("You may discard a card. If you do, draw a card.")));
    const declined = resolveOptionalDiscardPaymentChoice(paused, false);
    expect(declined.pendingChoice).toBeFalsy();
    expect(declined.players.user.hand.map((c) => c.id)).toEqual(["h1"]);
    expect(declined.players.user.library.map((c) => c.id)).toEqual(["d1"]);
    expect(declined.players.user.graveyard || []).toHaveLength(0);
  });

  it("EMPTY HAND: even a forced 'yes' pays nothing and draws nothing — the cost is unpayable", () => {
    const state = withHandLibrary([], [{ id: "d1", name: "Stay", type: "Land" }]);
    const paused = runEffectProgram(state, obj(clause("You may discard a card. If you do, draw a card.")));
    expect(paused.pendingChoice?.available).toBe(false);
    const forced = resolveOptionalDiscardPaymentChoice(paused, true); // re-scan: no non-token card → no pay
    expect(forced.pendingChoice).toBeFalsy();
    expect(forced.players.user.library.map((c) => c.id)).toEqual(["d1"]); // NO fabricated draw
    expect(forced.players.user.hand || []).toHaveLength(0);
  });
});

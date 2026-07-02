/**
 * OPTIONAL DRAW-THEN-DISCARD (loot) — "you may draw a card. If you do, discard a card."
 *
 * The reflexive coupling is the whole point: the discard happens ONLY if the controller took the
 * draw. A naive clause split ("you may draw a card" → optional draw; "discard a card" → mandatory
 * discard) would pitch a card even when the draw is DECLINED — the cardinal dropped/mis-applied FP.
 * matchOptionalDrawDiscard folds the two sentences into ONE pausing atom before the clause splitter;
 * the resolver runs [draw, discard] on YES and NOTHING on NO. Real cards flip via the trigger path
 * (Riddlesmith, Murder of Crows, Skyswimmer Koi, Jeskai Elder, Izzet Keyrune, …) — cardType is a
 * creature/artifact, so the matcher composes its payoff under LITERAL "Instant" (load-bearing: the
 * draw atom's legacy gate is HIGH only for Instant/Sorcery).
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createGameState, _resetIdsForTests } from "../gameState.js";
import { parseEffectClause } from "./parser.js";
import { runEffectProgram, resolveOptionalDrawDiscardChoice, resolveDiscardChoice } from "./runProgram.js";

beforeEach(() => _resetIdsForTests());

// Trigger-effectClause path: cardType is the CARD's type (Creature/Artifact), never Instant.
const clause = (oracle, cardType = "Creature") => parseEffectClause(oracle, cardType, { hasX: false });
const soleOp = (prog) => (prog?.atoms?.length === 1 ? prog.atoms[0].op : null);

const obj = (program) => ({ source: { name: "Loot" }, payload: { params: { program, controller: "user", targets: [] } } });
const withHandLibrary = (hand, library) => {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return { ...s, players: { ...s.players, user: { ...s.players.user, hand, library } } };
};

describe("optional draw-then-discard — parse shape", () => {
  it("folds the loot template into ONE optional-draw-discard atom (HIGH), on a creature cardType", () => {
    const p = clause("You may draw a card. If you do, discard a card.");
    expect(p.confidence).toBe("high");
    expect(soleOp(p)).toBe("optional-draw-discard");
    expect(p.atoms[0].effectAtoms.map((a) => a.op)).toEqual(["draw", "discard"]);
  });

  it("handles the plural (two/two) shape", () => {
    const p = clause("You may draw two cards. If you do, discard two cards.");
    expect(p.confidence).toBe("high");
    expect(soleOp(p)).toBe("optional-draw-discard");
  });

  it("fires on an artifact cardType too (Izzet Keyrune's activated-ability clause)", () => {
    const p = clause("You may draw a card. If you do, discard a card.", "Artifact");
    expect(soleOp(p)).toBe("optional-draw-discard");
  });
});

describe("optional draw-then-discard — near-misses stay LOW (CREED false-negatives)", () => {
  const drops = [
    ["draw is MANDATORY (no 'you may') — not this template", "Draw a card. If you do, discard a card."],
    ["someone ELSE discards (who != controller)", "You may draw a card. If you do, each opponent discards a card."],
    ["random discard — trailing modifier the anchor rejects", "You may draw a card. If you do, discard a card at random."],
    ["bare optional draw — no reflexive discard", "You may draw a card."],
    ["discard is conditional on a rider, not on the draw", "You may draw a card. If you do, you may discard a card."],
  ];
  for (const [why, oracle] of drops) {
    it(`does NOT emit optional-draw-discard: ${why}`, () => {
      expect(soleOp(clause(oracle))).not.toBe("optional-draw-discard");
    });
  }
});

describe("optional draw-then-discard — runtime", () => {
  it("YES: draws, then the discard chains a which-card choice; resolving it loots cleanly", () => {
    const state = withHandLibrary(
      [{ id: "h1", name: "Keep", type: "Land" }],
      [{ id: "d1", name: "Drawn", type: "Land" }],
    );
    const paused = runEffectProgram(state, obj(clause("You may draw a card. If you do, discard a card.")));
    expect(paused.pendingChoice?.kind).toBe("optional-draw-discard");
    expect(paused.players.user.hand).toHaveLength(1); // nothing happened yet

    const drew = resolveOptionalDrawDiscardChoice(paused, true);
    // Drew d1 (library emptied → hand has both), now owes a discard choice.
    expect(drew.players.user.library).toHaveLength(0);
    expect(drew.players.user.hand).toHaveLength(2);
    expect(drew.pendingChoice?.kind).toBe("discard");

    const done = resolveDiscardChoice(drew, "d1"); // pitch the card we just drew
    expect(done.pendingChoice).toBeFalsy();
    expect(done.players.user.hand.map((c) => c.id)).toEqual(["h1"]);
    expect(done.players.user.graveyard.map((c) => c.id)).toContain("d1");
  });

  it("NO: hand AND library are UNTOUCHED — the discard never fires on decline (cardinal CREED guarantee)", () => {
    const state = withHandLibrary(
      [{ id: "h1", name: "Keep", type: "Land" }],
      [{ id: "d1", name: "Stay", type: "Land" }],
    );
    const paused = runEffectProgram(state, obj(clause("You may draw a card. If you do, discard a card.")));
    const declined = resolveOptionalDrawDiscardChoice(paused, false);
    expect(declined.pendingChoice).toBeFalsy();
    expect(declined.players.user.hand.map((c) => c.id)).toEqual(["h1"]);
    expect(declined.players.user.library.map((c) => c.id)).toEqual(["d1"]);
    expect(declined.players.user.graveyard || []).toHaveLength(0);
  });
});

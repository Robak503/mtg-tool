/**
 * planTheHeist.test.js — S6/Kellan slice: conditional surveil + the sequencing-"Then" strip.
 *
 * Plan the Heist: "Surveil 3 if you have no cards in hand. Then draw three cards."
 * Two seams under test:
 *  1. Parser — the conditional-surveil clause shape (`onlyIfHandEmpty`) AND the per-sentence
 *     sequencing-"Then" strip (CR 608.2c — instructions resolve in written order, which the
 *     program's atom order already encodes), so "Then draw three cards" parses as a draw.
 *     Guard: "Then, if …" / "Then if …" keep their conditional shape (NOT stripped bare).
 *  2. Resolver — applyScrySurveilAtom skips the surveil (logged, conditionNotMet) when the
 *     controller's hand is non-empty, and pauses into the scry-surveil pending choice when empty.
 */
import { describe, expect, it } from "vitest";
import { parseEffectProgram } from "../parser.js";
import { resolveAtom } from "../effectAtoms.js";
import { createGameState } from "../../gameState.js";

const ORACLE = "Surveil 3 if you have no cards in hand. Then draw three cards.";
const spell = (oracle) => parseEffectProgram({ name: "t", type: "Sorcery", oracle });

describe("Plan the Heist — parser (conditional surveil + sequencing-Then strip)", () => {
  it("parses the whole card: surveil-if-hand-empty then draw 3, HIGH confidence", () => {
    const prog = spell(ORACLE);
    expect(prog.confidence).not.toBe("low");
    expect(prog.atoms).toEqual([
      { op: "surveil", amount: 3, onlyIfHandEmpty: true, targetType: null },
      { op: "draw", amount: 3, targetType: null },
    ]);
  });

  it('strips ONLY the bare sequencer: "Then, if" / "Then if" conditionals are untouched', () => {
    // A bare "Then <clause>" parses as the clause itself …
    expect(spell("Draw a card. Then draw two cards.").atoms).toEqual([
      { op: "draw", amount: 1, targetType: null },
      { op: "draw", amount: 2, targetType: null },
    ]);
    // … but a conditional sequencer keeps its "if" gate (no naked "draw" match → stays low,
    // never a wrongly-unconditional draw — the CREED direction).
    const cond = spell("Draw a card. Then, if you control a creature, draw two cards.");
    expect((cond?.atoms || []).some((a) => a.op === "draw" && a.amount === 2 && !a.condition)).toBe(false);
  });
});

describe("Plan the Heist — resolver (onlyIfHandEmpty gate)", () => {
  const surveil = (state) =>
    resolveAtom(state, { op: "surveil", amount: 3, onlyIfHandEmpty: true, targetType: null }, { controller: "user", targets: [] });

  it("hand NOT empty → surveil is skipped with a logged conditionNotMet, no pending choice", () => {
    const s0 = createGameState({ userDeck: [], aiDeck: [] });
    const s = {
      ...s0,
      players: {
        ...s0.players,
        user: {
          ...s0.players.user,
          hand: [{ id: "h1", name: "Island" }],
          library: [{ id: "l1", name: "A" }, { id: "l2", name: "B" }, { id: "l3", name: "C" }],
        },
      },
    };
    const next = surveil(s);
    expect(next.pendingChoice).toBeFalsy();
    const ev = (next.log || []).find((e) => e.kind === "spell-effect" && e.conditionNotMet === "hand-not-empty");
    expect(ev).toBeTruthy();
    expect(next.players.user.library).toHaveLength(3); // library untouched
  });

  it("hand empty → the surveil pauses into the scry-surveil pending choice", () => {
    const s0 = createGameState({ userDeck: [], aiDeck: [] });
    const s = {
      ...s0,
      players: {
        ...s0.players,
        user: {
          ...s0.players.user,
          hand: [],
          library: [{ id: "l1", name: "A" }, { id: "l2", name: "B" }, { id: "l3", name: "C" }],
        },
      },
    };
    const next = surveil(s);
    expect(next.pendingChoice?.kind).toBe("scry-surveil");
    expect(next.pendingChoice?.mode).toBe("surveil");
    expect(next.pendingChoice?.cards).toHaveLength(3);
  });
});

/**
 * AI-F10 — mandatory-search find requirement (CR 701.23b / 701.23d, verified against the
 * bundled knowledge/mtg-judge/data/cr/cr_current.json — NOTE the old 701.19 cites were stale:
 * 701.19 is Regenerate in the current CR; Search is 701.23):
 *   701.23b — a stated-quality search ("a basic land card", an MV-capped card) "isn't
 *             required to find some or all of those cards";
 *   701.23d — a quantity-only search ("a card") "must find that many cards (or as many as
 *             possible…)".
 * applyTutor stamps `pendingChoice.mayFailToFind` from the parsed atom (any structured
 * filter → true; unfiltered → false); the session offer drops the find-nothing action when
 * false, and resolveTutorChoice rejects a null pick on the wire while candidates exist (the
 * settler's no-op-mismatch pattern), so an off-CR decline can't slip in from any caller.
 * Legacy pendingChoices without the flag (old saves, hand-built test states) keep today's
 * decline-allowed behavior — pinned by pilotPendingChoice.test.js's hand-built tutor.
 *
 * Real oracle fixtures (exact Scryfall text): Diabolic Tutor (the unfiltered mandatory
 * "search your library for a card"), Rampant Growth (stated quality: basic land), Explosive
 * Vegetation (up-to-two multi-fetch — the flag carries across the chained re-suspend).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { createGameState, _resetIdsForTests } from "../../gameState.js";
import { parseEffectProgram } from "../parser.js";
import { applyTutor } from "./library.js";
import { resolveTutorChoice } from "../runProgram.js";

beforeEach(() => _resetIdsForTests());

const DIABOLIC_TUTOR = { name: "Diabolic Tutor", type: "Sorcery", mana: "{2}{B}{B}",
  oracle: "Search your library for a card, put that card into your hand, then shuffle." };
const RAMPANT_GROWTH = { name: "Rampant Growth", type: "Sorcery", mana: "{1}{G}",
  oracle: "Search your library for a basic land card, put that card onto the battlefield tapped, then shuffle." };
const EXPLOSIVE_VEGETATION = { name: "Explosive Vegetation", type: "Sorcery", mana: "{3}{G}",
  oracle: "Search your library for up to two basic land cards, put them onto the battlefield tapped, then shuffle." };

const forest = (id) => ({ id, name: "Forest", type: "Basic Land — Forest", mana: "", oracle: "({T}: Add {G}.)" });
const bolt = (id) => ({ id, name: "Lightning Bolt", type: "Instant", mana: "{R}", oracle: "Lightning Bolt deals 3 damage to any target." });

function tutorAtomOf(card) {
  const program = parseEffectProgram(card);
  const atom = (program?.atoms || []).find((a) => a.op === "tutor");
  expect(atom).toBeTruthy();
  return atom;
}

function stateWithAiLibrary(cards) {
  const b = createGameState({ userDeck: [], aiDeck: [] });
  return { ...b, players: { ...b.players, ai: { ...b.players.ai, library: cards } } };
}

describe("AI-F10 — applyTutor stamps mayFailToFind from the real parsed atom", () => {
  it("Diabolic Tutor (unfiltered 'a card') → mayFailToFind FALSE (CR 701.23d: must find)", () => {
    const atom = tutorAtomOf(DIABOLIC_TUTOR);
    expect(atom.filter ?? null).toBeNull(); // quantity-only — no stated quality
    const st = applyTutor(stateWithAiLibrary([forest("f1"), bolt("b1")]), atom, { controller: "ai", cardName: DIABOLIC_TUTOR.name });
    expect(st.pendingChoice).toMatchObject({ kind: "tutor-search", mayFailToFind: false });
    expect(st.pendingChoice.candidates.length).toBe(2);
  });

  it("Rampant Growth (stated quality: basic land) → mayFailToFind TRUE (CR 701.23b)", () => {
    const atom = tutorAtomOf(RAMPANT_GROWTH);
    expect(atom.filter).toBeTruthy();
    const st = applyTutor(stateWithAiLibrary([forest("f1"), bolt("b1")]), atom, { controller: "ai", cardName: RAMPANT_GROWTH.name });
    expect(st.pendingChoice).toMatchObject({ kind: "tutor-search", mayFailToFind: true });
    expect(st.pendingChoice.candidates.map((c) => c.id)).toEqual(["f1"]); // the filter still applies
  });
});

describe("AI-F10 — resolveTutorChoice rejects the off-CR decline on the wire", () => {
  it("null pick on a mandatory unfiltered search WITH candidates → no-op (choice stays pending)", () => {
    const atom = tutorAtomOf(DIABOLIC_TUTOR);
    const st = applyTutor(stateWithAiLibrary([forest("f1"), bolt("b1")]), atom, { controller: "ai", cardName: DIABOLIC_TUTOR.name });
    const after = resolveTutorChoice(st, null);
    expect(after).toBe(st); // the settler's kind-mismatch no-op pattern — nothing moved
    expect(after.pendingChoice?.kind).toBe("tutor-search");
  });

  it("a REAL pick on the same mandatory search still resolves (fetch + shuffle + clear)", () => {
    const atom = tutorAtomOf(DIABOLIC_TUTOR);
    const st = applyTutor(stateWithAiLibrary([forest("f1"), bolt("b1")]), atom, { controller: "ai", cardName: DIABOLIC_TUTOR.name });
    const after = resolveTutorChoice(st, "b1");
    expect(after.pendingChoice).toBeFalsy();
    expect(after.players.ai.hand.some((c) => c.id === "b1")).toBe(true);
  });

  it("null pick with an EMPTY candidate set is the honest no-find — still legal (701.23d 'as many as possible')", () => {
    const atom = tutorAtomOf(DIABOLIC_TUTOR);
    const st = applyTutor(stateWithAiLibrary([]), atom, { controller: "ai", cardName: DIABOLIC_TUTOR.name });
    expect(st.pendingChoice).toMatchObject({ kind: "tutor-search", mayFailToFind: false });
    const after = resolveTutorChoice(st, null);
    expect(after.pendingChoice).toBeFalsy(); // resolved as found:false — never a wedge
  });

  it("null pick on a quality-filtered search stays a legal decline (CR 701.23b)", () => {
    const atom = tutorAtomOf(RAMPANT_GROWTH);
    const st = applyTutor(stateWithAiLibrary([forest("f1")]), atom, { controller: "ai", cardName: RAMPANT_GROWTH.name });
    const after = resolveTutorChoice(st, null);
    expect(after.pendingChoice).toBeFalsy(); // declined and resolved — the fetch simply found nothing
    expect(after.players.ai.battlefield.length).toBe(0);
  });
});

describe("AI-F10 — the flag carries across a chained multi-fetch re-suspend", () => {
  it("Explosive Vegetation: after the first pick, the re-suspended choice keeps mayFailToFind TRUE", () => {
    const atom = tutorAtomOf(EXPLOSIVE_VEGETATION);
    const st = applyTutor(stateWithAiLibrary([forest("f1"), forest("f2"), forest("f3")]), atom,
      { controller: "ai", cardName: EXPLOSIVE_VEGETATION.name });
    expect(st.pendingChoice).toMatchObject({ mayFailToFind: true, remaining: 2 });
    const after = resolveTutorChoice(st, "f1");
    expect(after.pendingChoice).toMatchObject({ kind: "tutor-search", mayFailToFind: true, remaining: 1 });
  });
});

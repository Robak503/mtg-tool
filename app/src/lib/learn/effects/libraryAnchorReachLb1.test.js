/**
 * libraryAnchorReachLb1.test.js — BLITZ LB-1: LIBRARY-EFFECT parser-reach (atoms already resolved; only the
 * parse anchor blocked the shape). TWO whole-card wins, each a body-only permanent whose SOLE unmodeled clause
 * was a library effect the atom already handles:
 *
 *   1. REORDER-TOP (Ponder atom) — "look at the top N cards of your library, then put them back in any order".
 *      A SPELL carries a sentence-final period (Ponder, already native); a TRIGGER / activated-ability effect
 *      clause arrives with that period STRIPPED (Spire Owl / Sage Owl / Sage of Epityr / Inkfathom Divers /
 *      Sage Aven ETB; Aven Fateshaper's ETB + {4}{U} activated). matchReorderTop required a MANDATORY period
 *      after "any order" → the period-stripped form never reached the atom. Making the period OPTIONAL reaches
 *      the SAME reorder-top atom (identical resolution). CR 701.20e (looking at cards) + a within-library reorder.
 *
 *   2. IMPULSE-EXILE (Professional Face-Breaker atom) — "exile the top card of your library. <you may play>".
 *      The duration can TRAIL the permission ("you may play that card until end of turn") OR LEAD it ("Until
 *      end of turn, you may play that card" — Aerial Caravan's {1}{U}{U}, Abbot of Keral Keep, Stromkirk
 *      Occultist, Irascible Wolverine; CR 701.18 play). matchImpulseExilePlay only accepted the trailing order; the SAME
 *      this-turn impulse-exile atom resolves the leading-order form identically ("this turn" = "until end of
 *      turn"). A "until the end of your NEXT turn" two-turn window is a DIFFERENT effect the atom can't model
 *      and MUST stay parked (CREED FN-safe).
 *
 * Pins: recognition on the period-stripped / duration-first clauses (the exact anchor fix), the runtime through
 * the REAL resolvers (reorder-top pause→settle keeps all N on top / nothing bottomed; impulse-exile stamps the
 * top card into exile face-up for THIS turn), the whole-card coverage flips on REAL oracle, and the CREED
 * near-miss guards (next-turn window / variable-N / reveal-not-look stay LOW → Arbiter).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { resolveAtom } from "./effectAtoms.js";
import { parseEffectClause, programConfidence } from "./parser.js";
import { resolveScryChoice } from "./runProgram.js";
import { _resetIdsForTests, createGameState } from "../gameState.js";
import { classifyCard } from "../coverage.js";

beforeEach(() => _resetIdsForTests());

const CREATURE = "Creature";
const card = (id, over = {}) => ({ id, name: id, type: CREATURE, oracle: "", ...over });

function mainState() {
  const base = createGameState({ userDeck: [], aiDeck: [] });
  return { ...base, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main", consecutivePasses: 0, turn: 4 };
}
function withLibrary(state, playerId, library) {
  return { ...state, players: { ...state.players, [playerId]: { ...state.players[playerId], library } } };
}

// Real oracle text (verbatim from the bundled Scryfall index).
const SPIRE_OWL = "Flying\nWhen this creature enters, look at the top four cards of your library, then put them back in any order.";
const SAGE_OF_EPITYR = "When this creature enters, look at the top four cards of your library, then put them back in any order.";
const INKFATHOM_DIVERS = "Islandwalk (This creature can't be blocked as long as defending player controls an Island.)\nWhen this creature enters, look at the top four cards of your library, then put them back in any order.";
const AVEN_FATESHAPER = "Flying\nWhen this creature enters, look at the top four cards of your library, then put them back in any order.\n{4}{U}: Look at the top four cards of your library, then put them back in any order.";
const AERIAL_CARAVAN = "Flying\n{1}{U}{U}: Exile the top card of your library. Until end of turn, you may play that card. (Reveal the card as you exile it.)";

// The exact effect-clause forms detectTriggers/parseActivated feed the parser (sentence-final period already
// stripped for the trigger form; mixed case preserved). These are the shapes the anchor fix must now reach.
const REORDER_TRIGGER_CLAUSE = "look at the top four cards of your library, then put them back in any order";
const IMPULSE_LEADING_CLAUSE = "Exile the top card of your library. Until end of turn, you may play that card";

// ────────────────────────────────────────────────────────────────────────────
// 1. Recognition — the anchor fix reaches the existing atoms
// ────────────────────────────────────────────────────────────────────────────
describe("LB-1 recognition — period-stripped reorder-top + duration-first impulse-exile parse HIGH", () => {
  it("reorder-top trigger clause (NO trailing period) → one HIGH reorder-top atom, amount 4", () => {
    const p = parseEffectClause(REORDER_TRIGGER_CLAUSE, "Instant", {});
    expect(programConfidence(p)).toBe("high");
    expect(p.atoms).toEqual([{ op: "reorder-top", amount: 4, mayShuffle: false }]);
  });

  it("the with-period SPELL form still parses identically (no regression)", () => {
    const p = parseEffectClause("Look at the top four cards of your library, then put them back in any order.", "Instant", {});
    expect(programConfidence(p)).toBe("high");
    expect(p.atoms).toEqual([{ op: "reorder-top", amount: 4, mayShuffle: false }]);
  });

  it("duration-FIRST impulse-exile ('Until end of turn, you may play that card') → one HIGH impulse-exile atom", () => {
    const p = parseEffectClause(IMPULSE_LEADING_CLAUSE, "Instant", {});
    expect(programConfidence(p)).toBe("high");
    expect(p.atoms).toEqual([{ op: "impulse-exile", targetType: null }]);
  });

  it("both duration orders + both pronouns parse HIGH to the SAME impulse-exile atom", () => {
    for (const c of [
      "Exile the top card of your library. Until end of turn, you may play it.",
      "Exile the top card of your library. You may play that card until end of turn.",
      "Exile the top card of your library. You may play it this turn.",
    ]) {
      expect(programConfidence(parseEffectClause(c, "Instant", {}))).toBe("high");
    }
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 2. Runtime — the reached atoms resolve through the REAL resolvers
// ────────────────────────────────────────────────────────────────────────────
describe("LB-1 runtime — reorder-top pauses then keeps all N on top; impulse-exile stamps the exiled card", () => {
  it("the reorder-top atom sets a scry-surveil (reorder mode) pause over the top 4, then settles with NOTHING bottomed", () => {
    const atom = parseEffectClause(REORDER_TRIGGER_CLAUSE, "Instant", {}).atoms[0];
    let s = withLibrary(mainState(), "user", ["A", "B", "C", "D", "E"].map((n) => card(n.toLowerCase(), { name: n, type: "Sorcery" })));
    s = resolveAtom(s, atom, { controller: "user", targets: [] });
    expect(s.pendingChoice).toMatchObject({ kind: "scry-surveil", mode: "scry", controller: "user", reorder: true });
    expect(s.pendingChoice.cards.map((c) => c.id)).toEqual(["a", "b", "c", "d"]); // amount 4
    // A chosen reorder puts ALL four back on top in that order; E untouched below; NONE bottomed.
    s = resolveScryChoice(s, ["d", "c", "b", "a"], { shuffle: false });
    expect(s.players.user.library.map((c) => c.id)).toEqual(["d", "c", "b", "a", "e"]);
    expect(s.pendingChoice).toBeUndefined();
  });

  it("the impulse-exile atom moves the top library card to exile face-up, stamped for THIS turn", () => {
    const atom = parseEffectClause(IMPULSE_LEADING_CLAUSE, "Instant", {}).atoms[0];
    let s = withLibrary(mainState(), "user", [card("top", { type: "Instant" }), card("second", { type: "Instant" })]);
    s = resolveAtom(s, atom, { controller: "user", targets: [] });
    expect(s.players.user.library.map((c) => c.id)).toEqual(["second"]);
    expect(s.players.user.exile.find((c) => c.id === "top")).toMatchObject({ _impulse: true, _impulseTurn: 4 });
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 3. Coverage — the whole cards flip native on REAL oracle
// ────────────────────────────────────────────────────────────────────────────
describe("LB-1 coverage — the body-only permanents flip native (sole blocker was the library clause)", () => {
  it("reorder-top ETB creatures flip native-trigger", () => {
    expect(classifyCard({ name: "Spire Owl", type: "Creature — Bird", oracle: SPIRE_OWL })).toBe("native-trigger");
    expect(classifyCard({ name: "Sage of Epityr", type: "Creature — Human Wizard", oracle: SAGE_OF_EPITYR })).toBe("native-trigger");
    expect(classifyCard({ name: "Inkfathom Divers", type: "Creature — Merfolk Soldier", oracle: INKFATHOM_DIVERS })).toBe("native-trigger");
  });

  it("Aven Fateshaper (ETB reorder-top + {4}{U} activated reorder-top) flips native-mixed — both paths reach the atom", () => {
    expect(classifyCard({ name: "Aven Fateshaper", type: "Creature — Bird Wizard", oracle: AVEN_FATESHAPER })).toBe("native-mixed");
  });

  it("Aerial Caravan (activated duration-first impulse-exile) flips native-activated", () => {
    expect(classifyCard({ name: "Aerial Caravan", type: "Creature — Human Soldier", oracle: AERIAL_CARAVAN })).toBe("native-activated");
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 4. CREED near-miss guards — no over-reach past the atoms' real semantics
// ────────────────────────────────────────────────────────────────────────────
describe("LB-1 FN guards — shapes the atoms can't model stay LOW → Arbiter", () => {
  const low = (clause) => expect(programConfidence(parseEffectClause(clause, "Instant", {}))).toBe("low");

  it("a two-turn window ('until the end of your next turn') stays parked — the this-turn stamp can't model it", () => {
    low("Exile the top card of your library. Until the end of your next turn, you may play that card.");
  });

  it("a variable-N reorder ('the top X cards') stays parked — the atom needs a fixed count", () => {
    low("look at the top X cards of your library, then put them back in any order");
  });

  it("a public REVEAL (not a private 'look') stays parked — a different, unmodeled effect", () => {
    low("reveal the top four cards of your library, then put them back in any order");
  });

  it("a bottom-disposition ('put them on the bottom') is NOT the reorder shape → parked", () => {
    low("look at the top four cards of your library, then put them on the bottom in any order");
  });
});

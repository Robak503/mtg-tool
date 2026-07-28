/**
 * delirumFormidableConditions.test.js — two new readers in the shared condition vocabulary:
 * DELIRIUM ("N or more card types among cards in your graveyard") and FORMIDABLE (CR 702.113a,
 * "creatures you control have total power N or greater").
 *
 * WHY THESE TWO, AND WHY AS READERS. Now that the activation lane reads the SAME vocabulary as the trigger
 * and spell lanes (activationConditionParseable), a single reader added here reaches all three at once —
 * so vocabulary work compounds in a way a lane-local parser never would. Delirium is the largest single
 * form in the corpus at 73 carriers; formidable is 18.
 *
 * WHAT THE ASSERTIONS HERE ACTUALLY GUARD, stated honestly because two of them differ:
 *   1. LOAD-BEARING — delirium counts distinct TYPES, not cards. One "Artifact Creature" contributes two,
 *      and ten Sorceries contribute one. Counting cards is the easy reader and it is completely wrong;
 *      mutating to it fails three tests here.
 *   2. LOAD-BEARING — Kindred and Tribal fold to one type (CR 205.2a). Dropping the fold fails its test.
 *   3. LOAD-BEARING — formidable reads layer-aware power, not printed. Mutating to printed power fails.
 *   4. DEFENSIVE ONLY, and measured as such — reading just the type line's HEAD. A subtype is never a card
 *      type, so the split is correct by rule, but I checked the whole corpus and NO card has a card-type
 *      word after the em dash. Mutating the split away therefore fails nothing today. The test below
 *      documents the intended rule; it is not evidence the rule is currently doing work, and it is labelled
 *      that way rather than left to read like a guard (hollow-gate law: absence of a failure is not value).
 */
import { describe, expect, it } from "vitest";

import { activationConditionParseable, evaluateInterveningIf, spellConditionParseable } from "./interveningIf.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

const gy = (types) => ({ players: { p: { graveyard: types.map((t) => ({ type: t })), battlefield: [] } } });
const DELIRIUM = "four or more card types among cards in your graveyard";

describe("DELIRIUM — distinct card types, read off the type line's head", () => {
  it("counts TYPES, not cards — ten Sorceries is still one type", () => {
    expect(evaluateInterveningIf(gy(Array(10).fill("Sorcery")), DELIRIUM, "p")).toBe(false);
  });

  it("four distinct types meets it; three does not", () => {
    expect(evaluateInterveningIf(gy(["Sorcery", "Instant", "Land", "Creature"]), DELIRIUM, "p")).toBe(true);
    expect(evaluateInterveningIf(gy(["Sorcery", "Instant", "Land"]), DELIRIUM, "p")).toBe(false);
  });

  it("ONE card can carry TWO types", () => {
    // Two cards, three types: Artifact Creature contributes artifact AND creature, plus Instant.
    expect(evaluateInterveningIf(gy(["Artifact Creature — Golem", "Instant"]), DELIRIUM, "p")).toBe(false);
    // A third card takes it to four types — which a count-the-CARDS reader would have reported at three.
    expect(evaluateInterveningIf(gy(["Artifact Creature — Golem", "Instant", "Land"]), DELIRIUM, "p")).toBe(true);
  });

  it("DOCUMENTS (does not guard) — a subtype is not a card type; only the type line's head counts", () => {
    // Four Artifacts with four different subtypes is ONE type, not four. Note this passes whether or not the
    // reader splits on the em dash, because no subtype here contains a card-type word — and a corpus scan
    // found no card where one does. Kept as an executable statement of the CR 205.2a rule for whoever adds
    // the next reader, explicitly NOT as evidence the split is load-bearing today.
    expect(evaluateInterveningIf(gy(["Artifact — Equipment", "Artifact — Vehicle", "Artifact — Clue", "Artifact — Food"]), DELIRIUM, "p")).toBe(false);
    // The split IS observable on a synthetic line, which is the closest thing to a real guard available:
    // "Sorcery — Instant Reflex" is a fabricated type line, but it shows head-only reading in action.
    expect(evaluateInterveningIf(gy(["Sorcery — Instant Reflex", "Land"]), "three or more card types among cards in your graveyard", "p")).toBe(false);
  });

  it("Kindred and Tribal are the SAME type under two printed names (CR 205.2a)", () => {
    // Isolated so ONLY the fold is under test: both cards are Instants, one printed each way. Folded, the
    // graveyard holds exactly two types (kindred + instant). Unfolded it would report three, so the
    // three-or-more assertion is what fails if the fold is ever dropped.
    const both = gy(["Tribal Instant — Elf", "Kindred Instant — Elf"]);
    expect(evaluateInterveningIf(both, "two or more card types among cards in your graveyard", "p")).toBe(true);
    expect(evaluateInterveningIf(both, "three or more card types among cards in your graveyard", "p")).toBe(false);
  });

  it("the 'there are' prefix is optional (both printed framings)", () => {
    const g = gy(["Sorcery", "Instant", "Land", "Creature"]);
    expect(evaluateInterveningIf(g, `there are ${DELIRIUM}`, "p")).toBe(true);
  });
});

describe("FORMIDABLE — total power, layer-aware", () => {
  function board(creatures) {
    _resetIdsForTests();
    const s = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
    const bf = creatures.map((c, i) => createPermanent({ id: `c${i}`, card: c, controller: "user", summoningSick: false }));
    return { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: bf } } };
  }
  const beast = (p) => ({ name: `B${p}`, type: "Creature — Beast", power: String(p), toughness: "3" });
  const COND = "creatures you control have total power 8 or greater";

  it("sums power across the board", () => {
    expect(evaluateInterveningIf(board([beast(3), beast(3), beast(2)]), COND, "user")).toBe(true);
    expect(evaluateInterveningIf(board([beast(3), beast(3), beast(1)]), COND, "user")).toBe(false);
  });

  it("counters count — the reader is layer-aware, not printed-power", () => {
    const st = board([beast(3), beast(3), beast(1)]);        // 7 printed → short
    st.players.user.battlefield[2].counters = { "+1/+1": 1 }; // …+1 counter → 8
    expect(evaluateInterveningIf(st, COND, "user")).toBe(true);
  });

  it("NONCREATURE permanents contribute nothing", () => {
    const st = board([beast(8)]);
    st.players.user.battlefield.push(createPermanent({ id: "art", card: { name: "Rock", type: "Artifact" }, controller: "user" }));
    expect(evaluateInterveningIf(st, COND, "user")).toBe(true);
    const short = board([beast(7)]);
    short.players.user.battlefield.push(createPermanent({ id: "a2", card: { name: "Rock", type: "Artifact" }, controller: "user" }));
    expect(evaluateInterveningIf(short, COND, "user")).toBe(false);
  });

  it("an empty board is simply false, never null", () => {
    expect(evaluateInterveningIf(board([]), COND, "user")).toBe(false);
  });
});

describe("CORRUPTED — an opponent's poison counters (CR 122 / 704.5c)", () => {
  const POISON = "an opponent has three or more poison counters";
  const seats = (mine, ...opps) => ({
    players: {
      me: { poison: mine, battlefield: [], graveyard: [] },
      ...Object.fromEntries(opps.map((p, i) => [`o${i}`, { poison: p, battlefield: [], graveyard: [] }])),
    },
  });

  it("EXISTENTIAL across opponents — any ONE at the threshold satisfies it (CR 104.3a)", () => {
    expect(evaluateInterveningIf(seats(0, 0, 3, 0), POISON, "me")).toBe(true);
    expect(evaluateInterveningIf(seats(0, 2, 2, 2), POISON, "me")).toBe(false);
  });

  it("MY OWN poison does not count — the clause is opponent-scoped", () => {
    // A reader that scanned all players would report true here. That is the whole scoping risk.
    expect(evaluateInterveningIf(seats(9, 0, 0, 0), POISON, "me")).toBe(false);
  });

  it("CREED — the CONJUNCTION form is refused rather than half-evaluated", () => {
    expect(evaluateInterveningIf(seats(0, 3), "you control three or more artifacts and an opponent has three or more poison counters", "me")).toBeNull();
  });

  it("CREED — the per-object 'its controller' form is refused", () => {
    expect(evaluateInterveningIf(seats(0, 3), "its controller has three or more poison counters", "me")).toBeNull();
  });
});

describe("every reader is visible to every lane that shares the vocabulary", () => {
  it("readable as an ACTIVATION rider and as a SPELL rider", () => {
    for (const c of [DELIRIUM, "creatures you control have total power 8 or greater", "an opponent has three or more poison counters"]) {
      expect(activationConditionParseable(c)).toBe(true);
      expect(spellConditionParseable(c)).toBe(true);
    }
  });

  it("CREED — a near-miss wording is still refused rather than approximated", () => {
    // Opponent-scoped and card-count (not type-count) variants are NOT these readers.
    expect(activationConditionParseable("four or more card types among cards in your opponent's graveyard")).toBe(false);
    expect(activationConditionParseable("creatures you control have total toughness 8 or greater")).toBe(false);
  });
});

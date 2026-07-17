/**
 * mowuSelfCounterDoubler.test.js — SELF-scope counter-multiplication replacement (BLITZ CTR-2).
 *
 * Mowu, Loyal Companion is a keyword body (Vigilance, trample) + ONE counter-placement replacement whose
 * recipient is the SOURCE PERMANENT ITSELF, referenced by its short name:
 *   "If one or more +1/+1 counters would be put on Mowu, that many plus one +1/+1 counters are put on it instead."
 * This is the "that many plus one" additive family (Hardened Scales templating), but SELF-scoped rather than
 * "a creature you control" — so the +1 lands ONLY on Mowu, never on another permanent or a player. It is the
 * ONLY self-scope counter-multiplication card in the corpus (census 2026-07-17).
 *
 * The self-scope is the SAFEST possible scope: applyCounterDoubling gates it on recipientPermId === the
 * doubler's OWN permId (the exact inverse of Benevolent Hydra's excludeSource), so it cannot leak onto any other
 * permanent — the forbidden FP direction. Before CTR-2, doublerProfile rejected the self-name recipient (scope
 * null → no profile → body-only); now it is modeled and Mowu flips native-static.
 *
 * Real oracle verified against the bundled index (2026-07-17).
 */
import { describe, it, expect } from "vitest";
import { classifyCard } from "./coverage.js";
import { doublerProfile, isModeledDoublerSentence, stripModeledDoublerClauses, applyCounterDoubling } from "./replacementEffects.js";
import { _resetIdsForTests, createGameState, createPermanent, addCounter } from "./gameState.js";

const ORACLE =
  "Vigilance, trample\n" +
  "If one or more +1/+1 counters would be put on Mowu, that many plus one +1/+1 counters are put on it instead.";
const MOWU = { name: "Mowu, Loyal Companion", type: "Legendary Creature — Dog", power: 2, toughness: 2, oracle: ORACLE };

// A generic you-scope doubler (Doubling Season) for the composition pin.
const DOUBLING_SEASON = {
  name: "Doubling Season",
  type: "Enchantment",
  oracle:
    "If an effect would create one or more tokens under your control, it creates twice that many of those tokens instead.\n" +
    "If an effect would put one or more counters on a permanent you control, it puts twice that many of those counters on that permanent instead.",
};

describe("Mowu — recognition + the flip", () => {
  it("classifies native-static (keyword body Vigilance, trample + the self counter-replacement)", () => {
    expect(classifyCard(MOWU)).toBe("native-static");
  });
  it("doublerProfile captures the additive +1, +1/+1-only, SELF scope", () => {
    expect(doublerProfile(MOWU).counter).toEqual({ op: "additive", factor: 1, kind: "+1/+1", scope: "self" });
  });
  it("the self-scope profile carries NO excludeSource / recipientTypes (self IS the source)", () => {
    const c = doublerProfile(MOWU).counter;
    expect(c.excludeSource).toBeUndefined();
    expect(c.recipientTypes).toBeUndefined();
  });
});

describe("Mowu — coverage residue strip (self clause recognized only WITH the short name)", () => {
  it("the self sentence strips to keyword-only when the card name is threaded", () => {
    const stripped = stripModeledDoublerClauses(ORACLE, MOWU).replace(/\s+/g, " ").trim();
    expect(stripped).toBe("Vigilance, trample");
  });
  it("isModeledDoublerSentence recognizes the self clause ONLY when given the short name", () => {
    const s = "if one or more +1/+1 counters would be put on mowu, that many plus one +1/+1 counters are put on it instead.";
    expect(isModeledDoublerSentence(s, "mowu")).toBe(true);
    // Without the name the self-NAME recipient is invisible (FN-safe) — the clause is not stripped.
    expect(isModeledDoublerSentence(s)).toBe(false);
  });
  it("the name-free self pronoun form is recognized without a name", () => {
    expect(isModeledDoublerSentence("if one or more +1/+1 counters would be put on this creature, twice that many +1/+1 counters are put on it instead.")).toBe(true);
  });
});

describe("Mowu — runtime (self-scope additive at the addCounter chokepoint)", () => {
  // Build a real board: Mowu + another own creature + an opponent creature.
  function board() {
    _resetIdsForTests();
    let s = createGameState({ userDeck: [], aiDeck: [] });
    const mowu = createPermanent({ id: "mowu", card: { ...MOWU, id: "mowu" }, controller: "user" });
    const bear = createPermanent({ id: "bear", card: { id: "bear", name: "Bear", type: "Creature — Bear", power: 2, toughness: 2, oracle: "" }, controller: "user" });
    const enemy = createPermanent({ id: "enemy", card: { id: "enemy", name: "Enemy", type: "Creature — Bear", power: 2, toughness: 2, oracle: "" }, controller: "ai" });
    s = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [mowu, bear] }, ai: { ...s.players.ai, battlefield: [enemy] } } };
    return s;
  }
  const countOn = (s, side, id) => s.players[side].battlefield.find((p) => p.id === id).counters["+1/+1"];

  it("place 1 +1/+1 counter on Mowu → 2 land (that many plus one)", () => {
    expect(countOn(addCounter(board(), { permanentId: "mowu", type: "+1/+1", amount: 1 }), "user", "mowu")).toBe(2);
  });
  it("FP GUARD — a counter on ANOTHER creature you control gets NO bonus (self-scope, not you-scope): 1 → 1", () => {
    expect(countOn(addCounter(board(), { permanentId: "bear", type: "+1/+1", amount: 1 }), "user", "bear")).toBe(1);
  });
  it("FP GUARD — a counter on an OPPONENT's creature is never boosted: 1 → 1", () => {
    expect(countOn(addCounter(board(), { permanentId: "enemy", type: "+1/+1", amount: 1 }), "ai", "enemy")).toBe(1);
  });
  it("a -1/-1 counter on Mowu is NOT boosted (the profile is +1/+1-only): 1 → 1", () => {
    // additive/multiply only apply to the matching kind; a -1/-1 placement bypasses the +1/+1 self doubler.
    const s = board();
    expect(s.players.user.battlefield.find((p) => p.id === "mowu")).toBeTruthy();
    const after = addCounter(s, { permanentId: "mowu", type: "-1/-1", amount: 1 });
    expect(after.players.user.battlefield.find((p) => p.id === "mowu").counters["-1/-1"]).toBe(1);
  });
});

describe("Mowu — composition with a generic you-doubler (CR 616.1e greedy-max: additive then multiply)", () => {
  it("Doubling Season + Mowu: place 1 on Mowu → (1 + 1) × 2 = 4", () => {
    _resetIdsForTests();
    let s = createGameState({ userDeck: [], aiDeck: [] });
    const mowu = createPermanent({ id: "mowu", card: { ...MOWU, id: "mowu" }, controller: "user" });
    const ds = createPermanent({ id: "ds", card: { ...DOUBLING_SEASON, id: "ds" }, controller: "user" });
    s = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [mowu, ds] } } };
    expect(addCounter(s, { permanentId: "mowu", type: "+1/+1", amount: 1 }).players.user.battlefield.find((p) => p.id === "mowu").counters["+1/+1"]).toBe(4);
    // ...and Doubling Season alone on the OTHER creature still only doubles (self-scope Mowu absent there).
  });
});

describe("Mowu — lightweight applyCounterDoubling pins (self gate direct)", () => {
  const withMowu = () => ({ players: { p1: { battlefield: [{ id: "mowu", controller: "p1", card: MOWU, counters: {} }] } } });
  it("self doubler applies ONLY when recipientPermId IS the source permanent", () => {
    expect(applyCounterDoubling(withMowu(), "p1", "+1/+1", 1, "mowu")).toBe(2); // recipient IS Mowu → +1
    expect(applyCounterDoubling(withMowu(), "p1", "+1/+1", 1, "other")).toBe(1); // a different permanent → no bonus
    expect(applyCounterDoubling(withMowu(), "p1", "+1/+1", 1)).toBe(1);          // unknown recipient → FN-safe no-op
  });
});

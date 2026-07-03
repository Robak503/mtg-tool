/**
 * MASS-OPPONENT-BOUNCE (Scourge of Fleets) — ETB "return each creature your opponents control with toughness
 * X or less to its owner's hand, where X is the number of Islands you control".
 *
 * The gap was the bounce-clause parser (no matcher for the opponent-scoped mass bounce with a count-derived
 * toughness threshold) + the resolver scope. The ETB trigger was already DETECTED (event:etb, scope:self); it
 * only failed triggerRoutesNatively because its effect clause parsed LOW. This adds:
 *   • bounceClauseParser → targetType:"eachOpponentCreature" (+ optional toughnessAtMostCount count source).
 *   • atomTargets → gathers opponentCreatureTargets AT RESOLUTION, filtered by a layer-aware toughness bound
 *     resolved from the count (Islands you control) via countForSpec.
 * Non-targeted (a mass set, like eachCreature), so the trigger routes natively on program confidence alone.
 *
 * CREED: the toughness bound is layer-aware (a creature buffed above X is spared); the controller's OWN
 * creatures are never touched; a creature exactly AT X is returned (CR — "X or less"); an unmodeled count
 * source keeps the whole card non-native.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createGameState, createPermanent, _resetIdsForTests } from "../gameState.js";
import { parseEffectProgram, parseEffectClause } from "./parser.js";
import { runEffectProgram } from "./runProgram.js";
import { classifyCard } from "../coverage.js";
import { detectTriggers } from "../triggers.js";
import { triggerRoutesNatively } from "../triggerRouting.js";

beforeEach(() => _resetIdsForTests());

const C = (name, oracle, type = "Creature — Kraken") => ({ name, oracle, type, keywords: [], mana: "" });
const SCOURGE = "When this creature enters, return each creature your opponents control with toughness X or less to its owner's hand, where X is the number of Islands you control.";

// Build a state: `user` gets `islands` Islands + `ownCreatures`; `ai` gets `oppCreatures`. Each creature spec
// is { id, toughness, power? , type? }. A creature carries a plain type line + printed P/T (creatureToughness
// reads card.toughness). summoningSick:false so they're plain board permanents.
function board({ islands = 0, ownCreatures = [], oppCreatures = [] } = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  const island = (id) => createPermanent({ id, card: { id: `c-${id}`, name: id, type: "Land — Island", oracle: "" }, controller: "user", summoningSick: false });
  const crea = (pid) => (o) => createPermanent({
    id: o.id,
    card: { id: `c-${o.id}`, name: o.id, type: o.type || "Creature — Beast", power: o.power ?? 1, toughness: o.toughness, oracle: "" },
    controller: pid, summoningSick: false,
  });
  const userBf = [...Array.from({ length: islands }, (_, i) => island(`isl${i}`)), ...ownCreatures.map(crea("user"))];
  return {
    ...s,
    players: {
      ...s.players,
      user: { ...s.players.user, battlefield: userBf, hand: [] },
      ai: { ...s.players.ai, battlefield: oppCreatures.map(crea("ai")), hand: [] },
    },
  };
}

// Drive the card exactly as the engine does: detectTriggers yields the ETB effect clause, which the trigger
// flush parses into an effect program and runs with the entering creature's controller ("user").
const run = (state, card = C("Scourge of Fleets", SCOURGE)) => {
  const det = detectTriggers(card);
  const prog = parseEffectProgram({ type: "Instant", oracle: det[0].effectClause });
  return runEffectProgram(state, { source: { name: card.name }, payload: { params: { program: prog, controller: "user", targets: [] } } });
};
const bfIds = (state, pid) => state.players[pid].battlefield.map((p) => p.id);
// A bounced permanent lands in its owner's hand as the CARD object (id "c-<permId>").
const handIds = (state, pid) => state.players[pid].hand.map((c) => c.id);

describe("MASS-OPPONENT-BOUNCE — classify + routing", () => {
  it("Scourge of Fleets flips to native-trigger", () => {
    expect(classifyCard(C("Scourge of Fleets", SCOURGE))).toBe("native-trigger");
  });

  it("the ETB trigger routes natively (effect program is HIGH)", () => {
    const det = detectTriggers(C("Scourge of Fleets", SCOURGE));
    expect(det).toHaveLength(1);
    expect(det[0]).toMatchObject({ event: "etb", scope: "self" });
    expect(det.every(triggerRoutesNatively)).toBe(true);
  });

  it("parses to a bounce/eachOpponentCreature atom carrying the Islands count source", () => {
    const clause = "return each creature your opponents control with toughness x or less to its owner's hand, where x is the number of islands you control";
    const p = parseEffectClause(clause, "Instant");
    expect(p.confidence).toBe("high");
    expect(p.atoms[0]).toMatchObject({
      op: "bounce",
      targetType: "eachOpponentCreature",
      toughnessAtMostCount: { kind: "permanentsYouControl", subtype: "Island" },
    });
  });

  it("the BARE (unbounded) opponent mass bounce also parses HIGH", () => {
    const p = parseEffectClause("return each creature your opponents control to its owner's hand", "Instant");
    expect(p.confidence).toBe("high");
    expect(p.atoms[0]).toMatchObject({ op: "bounce", targetType: "eachOpponentCreature" });
    expect(p.atoms[0].toughnessAtMostCount).toBeUndefined();
  });
});

describe("MASS-OPPONENT-BOUNCE — runtime resolution", () => {
  it("returns exactly the opponent creatures with toughness ≤ Islands-you-control (2)", () => {
    // 2 Islands → X=2. Opp: t1 (t=1) and t2 (t=2) bounce; t3 (t=3) stays.
    const s = board({ islands: 2, oppCreatures: [{ id: "t1", toughness: 1 }, { id: "t2", toughness: 2 }, { id: "t3", toughness: 3 }] });
    const after = run(s);
    expect(bfIds(after, "ai").sort()).toEqual(["t3"]);                    // only the > X creature survives
    expect(handIds(after, "ai").sort()).toEqual(["c-t1", "c-t2"]);        // both ≤ X returned to owner's hand
  });

  it("CREED: never touches the CONTROLLER's own creatures (only opponents')", () => {
    // 5 Islands → X=5. User owns a t=1 creature (would be ≤ X) — it must NOT be bounced.
    const s = board({ islands: 5, ownCreatures: [{ id: "mine", toughness: 1 }], oppCreatures: [{ id: "opp", toughness: 4 }] });
    const after = run(s);
    expect(bfIds(after, "user")).toContain("mine");              // own creature untouched
    expect(handIds(after, "user")).not.toContain("c-mine");      // and NOT in hand
    expect(bfIds(after, "ai")).toEqual([]);                       // opponent's t=4 ≤ 5 → bounced
    expect(handIds(after, "ai")).toEqual(["c-opp"]);
  });

  it("CREED: with ZERO Islands the threshold is 0 — no creature is returned (X=0)", () => {
    const s = board({ islands: 0, oppCreatures: [{ id: "t1", toughness: 1 }] });
    const after = run(s);
    expect(bfIds(after, "ai")).toEqual(["t1"]);                   // t=1 > 0 → spared
    expect(handIds(after, "ai")).toEqual([]);
  });

  it("boundary: a creature with toughness EXACTLY X is returned (CR 'X or less')", () => {
    const s = board({ islands: 3, oppCreatures: [{ id: "at", toughness: 3 }] });
    const after = run(s);
    expect(bfIds(after, "ai")).toEqual([]);
    expect(handIds(after, "ai")).toEqual(["c-at"]);
  });

  it("CREED near-miss: an UNMODELED count source ('where X is the number of Elephants you control') stays LOW → Arbiter", () => {
    // "Elephants you control" is NOT a curated board-count source parseCountSource admits → null → the whole bounce
    // clause parses LOW, so the card would route to the Arbiter (never a silently mis-scoped sweep). CREED-safe.
    const clause = "return each creature your opponents control with toughness x or less to its owner's hand, where x is the number of elephants you control";
    const p = parseEffectClause(clause, "Instant");
    expect(p.confidence).toBe("low");
    expect(p.atoms).toEqual([]);
  });

  it("CREED near-miss: a different comparator ('toughness X or greater') does NOT match → LOW → Arbiter", () => {
    // Only "X or less" is anchored (the printed Scourge wording). "X or greater" is a DIFFERENT, unmodeled filter —
    // it must not silently reuse the ≤ bound (that would be a confident wrong sweep).
    const clause = "return each creature your opponents control with toughness x or greater to its owner's hand, where x is the number of islands you control";
    const p = parseEffectClause(clause, "Instant");
    expect(p.confidence).toBe("low");
    expect(p.atoms).toEqual([]);
  });

  it("CREED near-miss: the OWN-scope 'each creature you control' does NOT hit the opponent matcher → LOW → Arbiter", () => {
    // The matcher is anchored to "your opponents control". A "you control" mass self-bounce is a DIFFERENT effect
    // (never modeled here) — it must not fall through to the opponent-scoped sweep.
    const clause = "return each creature you control with toughness x or less to its owner's hand, where x is the number of islands you control";
    const p = parseEffectClause(clause, "Instant");
    expect(p.confidence).toBe("low");
    expect(p.atoms).toEqual([]);
  });
});

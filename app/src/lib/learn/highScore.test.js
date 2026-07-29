/**
 * highScore.test.js — High Score (x3 on the shelf), VERIFIED rather than rebuilt.
 *
 * The run ledger listed this as "already native-mixed; verify at runtime rather than rebuild". This run has
 * twice found cards that classified native and did nothing at runtime (Amulet of Vigor's missing fire site,
 * the karoo/signet mana bundle), so a claimed-native card with no runtime pin is an UNVERIFIED CLAIM, not a
 * covered card. This file is that pin. It found no bug — and that is a result worth recording, because the
 * alternative was assuming it.
 *
 * Both halves are exercised:
 *   1. the +1/+1 REPLACEMENT ("that many plus one … instead") — a magnitude change, easy to silently drop;
 *   2. the end-step CONDITIONAL draw, in BOTH directions. The condition rides INSIDE the effect clause
 *      (`interveningIf` is null; the atom carries `condition`), which is exactly the shape where a dropped
 *      gate would draw unconditionally — a false positive. It does not.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { detectTriggers } from "./triggers.js";
import { parseEffectClause } from "./effects/parser.js";
import { runEffectProgram } from "./effects/runProgram.js";
import { addCounter, createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const HIGH_SCORE = {
  id: "hs", name: "High Score", type: "Enchantment", mana: "{2}{G}",
  oracle:
    "If one or more +1/+1 counters would be put on a creature you control, that many plus one +1/+1 counters are put on it instead.\n" +
    "At the beginning of your end step, draw a card if you control a creature with the greatest power among creatures on the battlefield.",
};
const BEAR = { id: "b", name: "Grizzly Bears", type: "Creature — Bear", power: 2, toughness: 2, oracle: "" };
const DRAW_CLAUSE = "draw a card if you control a creature with the greatest power among creatures on the battlefield";

it("classifies native-mixed", () => {
  expect(classifyCard(HIGH_SCORE)).toBe("native-mixed");
});

describe("half 1 — the +1/+1 replacement actually changes the magnitude", () => {
  function board(withHighScore) {
    const s = createGameState({ userDeck: [], aiDeck: [] });
    const bf = [createPermanent({ id: "b", card: BEAR, controller: "user" })];
    if (withHighScore) bf.push(createPermanent({ id: "hs", card: HIGH_SCORE, controller: "user" }));
    return { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: bf } } };
  }
  const counters = (st) => st.players.user.battlefield.find((p) => p.id === "b")?.counters?.["+1/+1"] ?? 0;

  it("CONTROL — without High Score, one counter is one counter", () => {
    expect(counters(addCounter(board(false), { permanentId: "b", type: "+1/+1", amount: 1 }))).toBe(1);
  });

  it("⭐ with High Score, N counters become N+1 (not N, and not doubled)", () => {
    expect(counters(addCounter(board(true), { permanentId: "b", type: "+1/+1", amount: 1 }))).toBe(2);
    // "that many PLUS ONE" — 3 becomes 4. A doubling bug would read 6 here and pass a +1-only test.
    expect(counters(addCounter(board(true), { permanentId: "b", type: "+1/+1", amount: 3 }))).toBe(4);
  });
});

describe("half 2 — the end-step draw is GATED, in both directions", () => {
  it("the trigger is detected, with the condition riding inside the clause", () => {
    const [t] = detectTriggers(HIGH_SCORE);
    expect(t).toMatchObject({ event: "endStep", interveningIf: null });
    expect(t.effectClause).toBe(DRAW_CLAUSE);
  });

  it("the atom CARRIES the condition rather than dropping it", () => {
    const p = parseEffectClause(DRAW_CLAUSE, "Instant", { hasX: false });
    expect(p.confidence).toBe("high");
    expect(p.atoms[0]).toMatchObject({ op: "draw", amount: 1, condition: expect.stringContaining("greatest power") });
  });

  // myPower vs the opponent's — "the greatest power among creatures on the battlefield" spans ALL creatures.
  function board(myPower, oppPower) {
    const s = createGameState({ userDeck: [], aiDeck: [] });
    const card = { id: "d1", name: "Card", type: "Instant", oracle: "" };
    return { ...s, players: { ...s.players,
      user: { ...s.players.user, library: [card], hand: [], battlefield: [createPermanent({ id: "m", card: { id: "m", name: "Mine", type: "Creature — Bear", power: myPower, toughness: 2, oracle: "" }, controller: "user" })] },
      ai: { ...s.players.ai, battlefield: [createPermanent({ id: "o", card: { id: "o", name: "Theirs", type: "Creature — Bear", power: oppPower, toughness: 2, oracle: "" }, controller: "ai" })] },
    } };
  }
  const runClause = (clause, my, opp) => {
    const program = parseEffectClause(clause, "Instant", { hasX: false });
    const st = runEffectProgram(board(my, opp), { source: { name: "High Score" }, payload: { params: { program, controller: "user", targets: [], sourceId: "hs" } } });
    return st.players.user.hand.length;
  };

  it("CONTROL — an UNCONDITIONAL draw draws through this harness", () => {
    // Without this the two assertions below prove nothing: a broken harness reads as "condition enforced".
    // It caught a wrong call signature while this file was being written.
    expect(runClause("draw a card", 5, 2)).toBe(1);
  });

  it("⭐ condition MET (mine 5, theirs 2) → draws", () => {
    expect(runClause(DRAW_CLAUSE, 5, 2)).toBe(1);
  });

  it("⭐ CREED — condition NOT met (mine 2, theirs 9) → does NOT draw", () => {
    expect(runClause(DRAW_CLAUSE, 2, 9)).toBe(0);
  });
});

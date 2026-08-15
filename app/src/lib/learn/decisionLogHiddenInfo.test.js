/**
 * decisionLogHiddenInfo.test.js — QUARTET PHASE 2, the HIDDEN-INFO honesty pin (2026-08-15).
 * Plan: docs/orchestration/SUBSYSTEM-QUARTET-PLAN.md Phase 2 step 3.
 *
 * ⭐ THE DISCOVERY THAT RESHAPED PHASE 2: the decision-log spine ALREADY EXISTS — the rows-v3
 * trajectory (selfPlayRunner recordDecisions → featurizeState features + action + offered histogram +
 * rank + castScores). Phase 2 is therefore NOT a new channel; it is (a) THIS pin — the features a
 * graded decision carries must never leak another seat's hand contents (the decision-quality law
 * grades the CHOICE given VISIBLE state) — and (b) the first-divergence diagnostic on the gate
 * harness (eval-gate --diagnose), which names the choice class that forks each diverged game.
 *
 * The featurizer is honest BY CONSTRUCTION (hand SIZES only — own_hand_size / opp_hand_size
 * aggregates, never contents). This witness makes that construction a CONTRACT: a distinctively-named
 * card in an opponent's hand must be absent from the serialized feature row, while the SIZE still
 * counts it (the seen-to-fail half: the size read proves the hand was visited at all — an empty
 * featurizer would "pass" the leak check vacuously).
 */
import { describe, expect, it } from "vitest";

import { featurizeState } from "./gameFeatures.js";
import { createGameState } from "./gameState.js";

describe("⭐⭐ LAW 6 — a decision row's features never leak another seat's hand", () => {
  it("⭐⭐ the user's secret card is invisible to the AI's features — but its COUNT is seen", () => {
    const g = createGameState({ userDeck: [], aiDeck: [] });
    const SECRET = "Xyzzy-Unique-Secret-Card-Name-77";
    const s = { ...g, players: { ...g.players,
      user: { ...g.players.user, hand: [{ id: "sec1", name: SECRET, type: "Instant", oracle: "Counter target spell." }] } } };
    const aiRow = featurizeState(s, "ai");
    const serialized = JSON.stringify(aiRow);
    const row = { leaks: serialized.includes(SECRET) || serialized.includes("sec1"), oppHand: aiRow.opp_hand_size };
    console.log("  WITNESS hiddenInfo", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ leaks: false, oppHand: 1 }); // the count proves the hand was VISITED; the contents stay hidden
  });

  it("the seat's OWN hand contents are likewise absent (sizes only — the featurizer's whole vocabulary)", () => {
    const g = createGameState({ userDeck: [], aiDeck: [] });
    const MINE = "My-Own-Distinct-Card-88";
    const s = { ...g, players: { ...g.players,
      user: { ...g.players.user, hand: [{ id: "own1", name: MINE, type: "Sorcery", oracle: "" }] } } };
    const row = featurizeState(s, "user");
    expect(JSON.stringify(row).includes(MINE)).toBe(false);
    expect(row.own_hand_size).toBe(1);
  });
});

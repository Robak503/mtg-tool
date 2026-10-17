/**
 * seatLabels.test.js — the one Academy wording for a seat, and its possessive. A possessive built by gluing "'s" onto a seat
 * label read "You's turn" in the tutor's board context (found 2026-10-16); the player's own seat is "your", every other
 * seat is its label plus "'s".
 */
import { describe, expect, it } from "vitest";

import * as seats from "./seatLabels.js";

describe("seatPossessive", () => {
  it("is published beside seatLabel", () => {
    expect(typeof seats.seatPossessive).toBe("function");
  });

  it("the player's seat is 'your' ('Your' to open a sentence); an opponent's is its label plus 's", () => {
    const poss = typeof seats.seatPossessive === "function" ? seats.seatPossessive : () => null;
    expect({
      you: poss("user"),
      youStart: poss("user", { start: true }),
      opp: poss("ai"),
      opp1: poss("ai1"),
      opp3Start: poss("ai3", { start: true }),
    }).toEqual({
      you: "your",
      youStart: "Your",
      opp: "Opponent's",
      opp1: "Opponent 1's",
      opp3Start: "Opponent 3's",
    });
  });
});

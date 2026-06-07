import { describe, it, expect } from "vitest";
import { reasonToOutcome, isUserWin } from "./learnOutcome.js";

describe("reasonToOutcome", () => {
  it("labels a user win as a win", () => {
    expect(reasonToOutcome("user-wins")).toMatchObject({ tone: "win", title: "You won." });
  });
  it("labels an AI win as a loss", () => {
    expect(reasonToOutcome("ai-wins")).toMatchObject({ tone: "loss", title: "You lost." });
  });
  it("labels a simultaneous-death draw as a DRAW, not a loss (the old-bug case)", () => {
    expect(reasonToOutcome("draw")).toMatchObject({ tone: "draw" });
    expect(reasonToOutcome("draw").tone).not.toBe("loss");
  });
  it("labels a turn-limit stalemate as a DRAW, not a loss (the old-bug case)", () => {
    const o = reasonToOutcome("turn-limit");
    expect(o.tone).toBe("draw");
    expect(o.title).toBe("Stalemate.");
  });
  it("labels an abandoned game neutrally", () => {
    expect(reasonToOutcome("abandoned")).toMatchObject({ tone: "neutral" });
  });
  it("falls back to a neutral 'Game over.' for an unknown reason", () => {
    expect(reasonToOutcome("something-unexpected")).toMatchObject({ tone: "neutral", title: "Game over." });
    expect(reasonToOutcome(undefined)).toMatchObject({ tone: "neutral" });
  });
  it("every outcome carries a non-empty title + blurb", () => {
    for (const r of ["user-wins", "ai-wins", "draw", "turn-limit", "abandoned", "???"]) {
      const o = reasonToOutcome(r);
      expect(o.title.length).toBeGreaterThan(0);
      expect(o.blurb.length).toBeGreaterThan(0);
    }
  });
});

describe("isUserWin", () => {
  it("is true ONLY for user-wins", () => {
    expect(isUserWin("user-wins")).toBe(true);
    for (const r of ["ai-wins", "draw", "turn-limit", "abandoned", undefined]) {
      expect(isUserWin(r)).toBe(false);
    }
  });
});

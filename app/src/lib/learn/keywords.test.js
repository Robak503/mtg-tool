/**
 * Tests for keywords.js — oracle-aware printed keyword detection. The key
 * property: match keywords at ability-word positions, NOT inside rules text
 * (so "gains trample" / "have flying" / "blocked by creatures with flying"
 * don't false-match).
 */

import { describe, it, expect } from "vitest";
import { hasKeyword } from "./keywords.js";

describe("hasKeyword", () => {
  it("matches an explicit keywords-array entry (case-insensitive)", () => {
    expect(hasKeyword({ keywords: ["Flying"] }, "Flying")).toBe(true);
    expect(hasKeyword({ keywords: ["flying"] }, "Flying")).toBe(true);
  });

  it("matches a keyword at the start of oracle text, with reminder text", () => {
    expect(hasKeyword({ oracle: "Flying" }, "Flying")).toBe(true);
    expect(hasKeyword({ oracle: "Flying (This creature can only be blocked by creatures with flying or reach.)" }, "Flying")).toBe(true);
  });

  it("matches keywords in a comma-separated ability line", () => {
    const card = { oracle: "Flying, vigilance, trample" };
    expect(hasKeyword(card, "Flying")).toBe(true);
    expect(hasKeyword(card, "Vigilance")).toBe(true);
    expect(hasKeyword(card, "Trample")).toBe(true);
  });

  it("matches a keyword on its own line", () => {
    expect(hasKeyword({ oracle: "Deathtouch\nWhenever this creature deals damage, draw a card." }, "Deathtouch")).toBe(true);
  });

  it("matches multi-word keywords", () => {
    expect(hasKeyword({ oracle: "First strike" }, "First strike")).toBe(true);
    expect(hasKeyword({ oracle: "Double strike, trample" }, "Double strike")).toBe(true);
  });

  it("does NOT match keywords inside rules text (granted / referenced)", () => {
    expect(hasKeyword({ oracle: "Target creature gains trample until end of turn." }, "Trample")).toBe(false);
    expect(hasKeyword({ oracle: "Creatures you control have flying." }, "Flying")).toBe(false);
    expect(hasKeyword({ oracle: "This creature can't be blocked by creatures with flying." }, "Flying")).toBe(false);
  });

  it("returns false for missing card / empty oracle / unknown keyword", () => {
    expect(hasKeyword(null, "Flying")).toBe(false);
    expect(hasKeyword({ oracle: "" }, "Flying")).toBe(false);
    expect(hasKeyword({ oracle: "Flying" }, "")).toBe(false);
  });
});

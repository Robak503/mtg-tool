/**
 * collectionValidation.test.js — the shared collection stack/row validators. Focused on the C5-P1.4
 * acquisition fields (acquiredAt per-stack, language per-row) and that they're purely additive: an old
 * row with none of them still validates and merges unchanged.
 */
import { describe, expect, it } from "vitest";

import { validateStacks, validateLanguage, mergeStacks } from "./collectionValidation.js";

describe("validateStacks — acquiredAt (C5-P1.4)", () => {
  it("accepts a stack with a date-string acquiredAt", () => {
    expect(validateStacks([{ finish: "nonfoil", quantity: 1, acquiredAt: "2026-03-14" }])).toBeNull();
  });
  it("accepts a stack with NO acquiredAt (additive — old rows unchanged)", () => {
    expect(validateStacks([{ finish: "foil", quantity: 2, condition: "LP" }])).toBeNull();
  });
  it("rejects a non-string acquiredAt", () => {
    expect(validateStacks([{ finish: "nonfoil", quantity: 1, acquiredAt: 20260314 }])).toMatch(/acquiredAt/);
  });
});

describe("validateLanguage (C5-P1.4)", () => {
  it("accepts a short code, and absent/null (default English)", () => {
    expect(validateLanguage("ja")).toBeNull();
    expect(validateLanguage(undefined)).toBeNull();
    expect(validateLanguage(null)).toBeNull();
  });
  it("rejects a non-string or an over-long value", () => {
    expect(validateLanguage(42)).toMatch(/language/);
    expect(validateLanguage("x".repeat(25))).toMatch(/language/);
  });
});

describe("mergeStacks — acquiredAt preservation (C5-P1.4)", () => {
  it("keeps the existing stack's acquiredAt when the incoming one omits it", () => {
    const merged = mergeStacks(
      [{ finish: "nonfoil", quantity: 1, acquiredAt: "2025-01-01" }],
      [{ finish: "nonfoil", quantity: 2 }],
    );
    expect(merged[0]).toMatchObject({ finish: "nonfoil", quantity: 3, acquiredAt: "2025-01-01" });
  });
  it("the incoming acquiredAt wins when set", () => {
    const merged = mergeStacks(
      [{ finish: "foil", quantity: 1, acquiredAt: "2025-01-01" }],
      [{ finish: "foil", quantity: 1, acquiredAt: "2026-06-06" }],
    );
    expect(merged[0].acquiredAt).toBe("2026-06-06");
  });
});

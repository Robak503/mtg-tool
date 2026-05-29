/**
 * Tests for citationInjector — context builder + the hallucinated-citation
 * filter. The filter must NEVER fabricate: a cited rule number that wasn't
 * retrieved is removed and recorded, not silently swapped for a sibling.
 */

import { describe, expect, it } from "vitest";
import {
  buildInjectedContext,
  extractCitedRuleNumbers,
  stripHallucinatedCitations,
} from "./citationInjector.js";

describe("stripHallucinatedCitations", () => {
  it("keeps citations that are in the retrieved/allowed set", () => {
    const { text, hallucinations } = stripHallucinatedCitations(
      "Per [509.2a] and [704.5g].",
      ["509.2a", "704.5g"],
    );
    expect(text).toBe("Per [509.2a] and [704.5g].");
    expect(hallucinations).toEqual([]);
  });

  it("removes (never rewrites) a non-retrieved sub-rule, even when a sibling IS allowed", () => {
    // Regression guard: it used to silently map 509.2z -> 509.2a (the allowed
    // sibling), fabricating an unverified citation. It must not do that.
    const { text, hallucinations } = stripHallucinatedCitations("See [509.2z].", ["509.2a"]);
    expect(text).toContain("[citation removed: 509.2z]");
    expect(text).not.toContain("509.2a");
    expect(hallucinations).toEqual(["509.2z"]);
  });

  it("removes a citation whose parent was never retrieved", () => {
    const { text, hallucinations } = stripHallucinatedCitations("Allegedly [123.4b].", ["509.2a"]);
    expect(text).toContain("[citation removed: 123.4b]");
    expect(hallucinations).toEqual(["123.4b"]);
  });

  it("dedupes repeated hallucinations", () => {
    const { hallucinations } = stripHallucinatedCitations("[999.9z] then [999.9z] again.", []);
    expect(hallucinations).toEqual(["999.9z"]);
  });
});

describe("extractCitedRuleNumbers", () => {
  it("extracts unique rule numbers from bracketed citations", () => {
    expect(extractCitedRuleNumbers("[509.2a], [704.5], [509.2a]")).toEqual(["509.2a", "704.5"]);
  });
});

describe("buildInjectedContext", () => {
  it("includes retrieved rules, card text, the question, and the citation rule", () => {
    const ctx = buildInjectedContext(
      "Does Sol Ring tap for mana?",
      [{ ruleNumber: "605.1a", text: "Mana abilities resolve without using the stack." }],
      [{ name: "Sol Ring", type_line: "Artifact", oracle_text: "{T}: Add {C}{C}.", mana_cost: "{1}" }],
    );
    expect(ctx).toContain("[605.1a]");
    expect(ctx).toContain("[[Sol Ring]]");
    expect(ctx).toContain("Does Sol Ring tap for mana?");
    expect(ctx).toContain("Only cite rule numbers that appear in RETRIEVED RULES");
  });
});

/**
 * rulesRetrieval — query-parser coverage.
 *
 * `extractRuleNumbers` and `extractRuleKeywords` sit on the Arbiter's grounding
 * path: they turn a user's question into the rule numbers / keywords used to
 * pull REAL Comprehensive Rules entries out of the local index. If they drop a
 * valid citation or surface noise, the Arbiter retrieves the wrong rules — which
 * is exactly the failure the "never fabricate rule numbers" prime directive
 * (CLAUDE.md §1.2) guards against. They were pure and untested; this is the unit
 * net. (retrieveRules itself is exercised end-to-end by the engine route test.)
 *
 * Pure functions, no data or mocks needed.
 */

import { describe, expect, it } from "vitest";

import { extractRuleNumbers, extractRuleKeywords } from "./rulesRetrieval.js";

describe("extractRuleNumbers", () => {
  it("pulls a standard CR reference out of prose", () => {
    expect(extractRuleNumbers("This is covered by rule 117.3a.")).toEqual(["117.3a"]);
  });

  it("captures bare, lettered, and multiple references in order", () => {
    expect(extractRuleNumbers("See 603.2, 603.2b, and 614.6")).toEqual(["603.2", "603.2b", "614.6"]);
  });

  it("deduplicates repeated references", () => {
    expect(extractRuleNumbers("As noted in 100.1, and again 100.1")).toEqual(["100.1"]);
  });

  it("ignores ordinary counts that are not rule numbers", () => {
    expect(extractRuleNumbers("I control 12 creatures and have 40 life")).toEqual([]);
  });

  it("returns an empty array for empty / nullish input", () => {
    expect(extractRuleNumbers("")).toEqual([]);
    expect(extractRuleNumbers(null)).toEqual([]);
    expect(extractRuleNumbers(undefined)).toEqual([]);
  });
});

describe("extractRuleKeywords", () => {
  it("drops stop words and keeps meaningful terms in order", () => {
    expect(extractRuleKeywords("What does the spell resolve")).toEqual(["spell", "resolve"]);
  });

  it("keeps short MTG-allowlist words that would otherwise be filtered by length", () => {
    // "to" (len 2, not allowlisted) is dropped; tap/add/mana are kept.
    expect(extractRuleKeywords("tap to add mana")).toEqual(["tap", "add", "mana"]);
  });

  it("normalizes case + punctuation and deduplicates", () => {
    expect(extractRuleKeywords("Trigger, trigger; TRIGGER!")).toEqual(["trigger"]);
  });

  it("returns an empty array for empty / nullish input", () => {
    expect(extractRuleKeywords("")).toEqual([]);
    expect(extractRuleKeywords(null)).toEqual([]);
  });
});

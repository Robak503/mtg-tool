/**
 * COVERAGE TIER REGISTRY (C5, 2026-07-18) — ALL_TIERS must stay exhaustive against the tiers
 * classifyCard actually returns.
 *
 * Before ALL_TIERS existed, measure-coverage.mjs carried TWO hardcoded tier arrays that had already
 * drifted: `native-mana-aura` was missing from BOTH (so cards in that tier were silently absent from
 * every reported breakdown), and the deck-level array had also lost `native-planeswalker` and
 * `playable-pw`. Nothing failed — the numbers just quietly under-reported, which is the worst kind of
 * measurement bug because it looks like data.
 *
 * The guard is a SOURCE SCAN rather than a runtime sweep: classifyCard's tiers are string literals, so
 * the honest check is that every `return "<tier>"` in coverage.js appears in ALL_TIERS. Adding a tier
 * without registering it now fails here instead of vanishing from the dashboards.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

import { ALL_TIERS, NATIVE_TIERS, isNativeTier } from "./coverage.js";

/** Every tier literal classifyCard can return, read straight out of the source. */
function tiersInSource() {
  const src = readFileSync(new URL("./coverage.js", import.meta.url), "utf8");
  const found = new Set();
  // Every tier literal on a `return` line — the plain `return "tier"` form AND the ternary
  // (`return gate(card) ? "land" : "land-partial"`, the Codex-#3 land gate). Line-scoped so a tier
  // string in a comment or unrelated expression never counts.
  for (const line of src.split("\n")) {
    if (!/\breturn\b/.test(line)) continue;
    for (const m of line.matchAll(/"((?:native|arbiter)-[a-z-]+|land|land-partial|body-only|playable-pw)"/g)) {
      found.add(m[1]);
    }
  }
  return found;
}

describe("ALL_TIERS is the single source for tier breakdowns", () => {
  it("covers every tier classifyCard can return", () => {
    const missing = [...tiersInSource()].filter((t) => !ALL_TIERS.includes(t));
    expect(missing).toEqual([]);
  });

  it("contains no tier classifyCard can never return (no dead entries)", () => {
    const inSource = tiersInSource();
    const dead = ALL_TIERS.filter((t) => !inSource.has(t));
    expect(dead).toEqual([]);
  });

  it("has no duplicates (a dashboard would print the row twice)", () => {
    expect(new Set(ALL_TIERS).size).toBe(ALL_TIERS.length);
  });

  it("includes native-mana-aura — the tier both hardcoded arrays had dropped", () => {
    expect(ALL_TIERS).toContain("native-mana-aura");
  });

  it("every NATIVE_TIERS member is listed (a native tier must always be reportable)", () => {
    const unlisted = [...NATIVE_TIERS].filter((t) => !ALL_TIERS.includes(t));
    expect(unlisted).toEqual([]);
  });

  it("agrees with isNativeTier on the split (natives + playable + gap, nothing orphaned)", () => {
    const gap = ALL_TIERS.filter((t) => !isNativeTier(t));
    // land-partial (Codex fix #3): playable (land drop + modeled mana) but NOT native — the gated
    // replacement for the unconditional every-Land-is-native short-circuit.
    expect(gap).toEqual(["playable-pw", "land-partial", "body-only", "arbiter-spell", "arbiter-pw"]);
  });
});

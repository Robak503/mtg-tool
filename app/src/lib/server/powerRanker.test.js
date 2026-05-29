/**
 * powerRanker — coverage for the deterministic deck-power evaluator.
 *
 * powerRanker.js is the largest module in the codebase (~1165 lines) and had
 * zero tests. It is the local, no-API deck scorer that Karn and Tibalt rely on,
 * and `formatPowerRankingForPrompt` is the exact text fed to those agents — so a
 * silent crash or shape drift here corrupts every deck analysis.
 *
 * These tests are deterministic and hermetic: the three data modules
 * (cardIndex, edhrecSalt, spellbook) are mocked with their documented
 * not-ready shapes, which is precisely the FIRST-LAUNCH state (before any data
 * sync). So this both gives the module a safety net and proves it degrades
 * gracefully when no bundled data is present, instead of throwing.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const { lookupCardMock, oracleTextMock } = vi.hoisted(() => ({
  lookupCardMock: vi.fn(() => null),
  oracleTextMock: vi.fn(() => ""),
}));

vi.mock("./cardIndex.js", () => ({
  lookupCard: lookupCardMock,
  oracleText: oracleTextMock,
  normalizeName: (n) => String(n || "").toLowerCase().trim(),
}));

// First-launch / no-sync shapes (verbatim from edhrecSalt.js + spellbook.js).
vi.mock("./edhrecSalt.js", () => ({
  evaluateDeckSalt: () => ({ ready: false, count: 0, sum: 0, average: 0, topCards: [] }),
  lookupSalt: () => null,
}));
vi.mock("./spellbook.js", () => ({
  findCombos: () => ({ included: [], almostIncluded: [], ready: false }),
  estimateBracket: () => ({
    bracketTag: "unknown",
    bracketLabel: "Unknown",
    gameChangers: [],
    massLandDenial: [],
    extraTurns: [],
    combosFound: 0,
    ready: false,
  }),
}));

import { rankDeckPower, formatPowerRankingForPrompt } from "./powerRanker.js";

beforeEach(() => {
  lookupCardMock.mockReset().mockReturnValue(null);
  oracleTextMock.mockReset().mockReturnValue("");
});

describe("rankDeckPower — first-launch degradation (no bundled data)", () => {
  const names = Array.from({ length: 99 }, (_, i) => `Card ${i + 1}`);

  it("returns a well-formed result instead of throwing when nothing resolves", () => {
    const result = rankDeckPower({ cardNames: names, commanderNames: ["Some Commander"] });

    expect(result.ready).toBe(true);
    expect(result.powerLevel).toBeGreaterThanOrEqual(1);
    expect(result.powerLevel).toBeLessThanOrEqual(10);
    expect(result.bracket).toBeGreaterThanOrEqual(1);
    expect(result.bracket).toBeLessThanOrEqual(5);
    expect(typeof result.confidence).toBe("string");
    expect(typeof result.formatted).toBe("string");
    expect(result.formatted.length).toBeGreaterThan(0);
  });

  it("reports every unresolved card name (the import-quality signal)", () => {
    const result = rankDeckPower({ cardNames: names });
    // unresolvedCards is capped for display but the count tracks all of them.
    expect(result.unresolvedCards.length).toBeGreaterThan(0);
    expect(result.unresolvedCards).toContain("Card 1");
  });

  it("is deterministic — identical input yields identical scoring", () => {
    const a = rankDeckPower({ cardNames: names, commanderNames: ["Some Commander"] });
    const b = rankDeckPower({ cardNames: names, commanderNames: ["Some Commander"] });
    expect(b.powerLevel).toBe(a.powerLevel);
    expect(b.bracket).toBe(a.bracket);
    expect(b.formatted).toBe(a.formatted);
  });
});

describe("rankDeckPower — classification + sectioning", () => {
  it("counts lands by type line (qty-weighted)", () => {
    lookupCardMock.mockImplementation((name) =>
      name === "Island" ? { name: "Island", type_line: "Basic Land — Island", cmc: 0 } : null,
    );
    const result = rankDeckPower({ entries: [{ qty: 35, name: "Island", section: "Mainboard" }] });
    expect(result.inventory.lands).toBe(35);
    expect(result.totalCards).toBe(35);
  });

  it("excludes sideboard / maybeboard sections from the count", () => {
    const result = rankDeckPower({
      entries: [
        { qty: 10, name: "Main Card", section: "Mainboard" },
        { qty: 5, name: "SB Card", section: "Sideboard" },
        { qty: 3, name: "Maybe Card", section: "Maybeboard" },
      ],
    });
    expect(result.totalCards).toBe(10);
  });
});

describe("formatPowerRankingForPrompt", () => {
  it("renders the key headers for a ready result", () => {
    const result = rankDeckPower({ cardNames: ["A", "B", "C"] });
    const text = formatPowerRankingForPrompt(result);
    expect(text).toContain("LOCAL POWER RANKING");
    expect(text).toContain("Power Level:");
    expect(text).toContain("Commander Bracket:");
    expect(text).toContain("deterministic - no API cost");
  });

  it("returns an empty string for a non-ready / missing result", () => {
    expect(formatPowerRankingForPrompt({ ready: false })).toBe("");
    expect(formatPowerRankingForPrompt(undefined)).toBe("");
    expect(formatPowerRankingForPrompt(null)).toBe("");
  });
});

import { describe, it, expect } from "vitest";
import {
  detectDeckFormat,
  opponentCountForFormat,
  isValidFormat,
  COMMANDER_SIZE_THRESHOLD,
} from "./formatDetection.js";

// Build a deck of { cards: [{ qty, name, section }] } from a compact spec.
function deck(sections) {
  const cards = [];
  for (const [section, count] of Object.entries(sections)) {
    // Spread the count across distinct singleton entries so qty math and
    // distinct-name math both get exercised.
    for (let i = 0; i < count; i++) {
      cards.push({ qty: 1, name: `${section}-${i}`, section });
    }
  }
  return { id: "d", name: "Test", cards };
}

describe("detectDeckFormat — Commander signals", () => {
  it("99 mainboard + 1 commander → commander", () => {
    const d = deck({ Mainboard: 99, Commander: 1 });
    const r = detectDeckFormat(d);
    expect(r.format).toBe("commander");
    expect(r.counts.maindeck).toBe(100);
  });

  it("98 mainboard + 2 commanders (partners) → commander", () => {
    const d = deck({ Mainboard: 98, Commander: 2 });
    expect(detectDeckFormat(d).format).toBe("commander");
  });

  it("a designated commander wins even on a mid-build 60-card deck", () => {
    // Commander tag overrides size: a half-built EDH deck is still EDH.
    const d = deck({ Mainboard: 59, Commander: 1 });
    const r = detectDeckFormat(d);
    expect(r.format).toBe("commander");
    expect(r.reason).toMatch(/commander/i);
  });

  it("flat 100-card list with no commander tag → commander by size", () => {
    const d = deck({ Mainboard: 100 });
    const r = detectDeckFormat(d);
    expect(r.format).toBe("commander");
    expect(r.reason).toMatch(/singleton/i);
  });

  it("uses qty, not just entry count, for size", () => {
    // 25 entries × qty 4 = 100 maindeck cards.
    const cards = Array.from({ length: 25 }, (_, i) => ({
      qty: 4,
      name: `card-${i}`,
      section: "Mainboard",
    }));
    const r = detectDeckFormat({ cards });
    expect(r.counts.maindeck).toBe(100);
    expect(r.format).toBe("commander");
  });
});

describe("detectDeckFormat — Standard signals", () => {
  it("60-card maindeck, no sideboard → standard", () => {
    const d = deck({ Mainboard: 60 });
    const r = detectDeckFormat(d);
    expect(r.format).toBe("standard");
    expect(r.counts.sideboard).toBe(0);
  });

  it("60-card maindeck + 15-card sideboard → standard", () => {
    const d = deck({ Mainboard: 60, Sideboard: 15 });
    const r = detectDeckFormat(d);
    expect(r.format).toBe("standard");
    expect(r.counts.sideboard).toBe(15);
    expect(r.reason).toMatch(/sideboard/i);
  });

  it("sideboard does not push a 60-card deck over the Commander threshold", () => {
    // 60 main + 15 SB = 75 cards total, but maindeck is 60 → Standard.
    const d = deck({ Mainboard: 60, Sideboard: 15 });
    expect(detectDeckFormat(d).counts.maindeck).toBe(60);
    expect(detectDeckFormat(d).format).toBe("standard");
  });

  it("a 75-card maindeck (below threshold) still resolves to standard", () => {
    const d = deck({ Mainboard: 79 });
    expect(detectDeckFormat(d).format).toBe("standard");
  });
});

describe("detectDeckFormat — tokens & edges", () => {
  it("tokens never count toward deck size", () => {
    // 60 maindeck + 40 tokens should NOT be read as a 100-card Commander deck.
    const d = deck({ Mainboard: 60, Tokens: 40 });
    const r = detectDeckFormat(d);
    expect(r.counts.maindeck).toBe(60);
    expect(r.format).toBe("standard");
  });

  it("threshold boundary: exactly 80 maindeck → commander", () => {
    const d = deck({ Mainboard: COMMANDER_SIZE_THRESHOLD });
    expect(detectDeckFormat(d).format).toBe("commander");
  });

  it("threshold boundary: 79 maindeck → standard", () => {
    const d = deck({ Mainboard: COMMANDER_SIZE_THRESHOLD - 1 });
    expect(detectDeckFormat(d).format).toBe("standard");
  });

  it("unrecognized section names count as maindeck", () => {
    const d = { cards: [{ qty: 90, name: "x", section: "Wishboard" }] };
    expect(detectDeckFormat(d).counts.maindeck).toBe(90);
    expect(detectDeckFormat(d).format).toBe("commander");
  });

  it("missing qty defaults to 1 per entry", () => {
    const cards = Array.from({ length: 100 }, (_, i) => ({
      name: `card-${i}`,
      section: "Mainboard",
    }));
    expect(detectDeckFormat({ cards }).counts.maindeck).toBe(100);
  });

  it("empty / malformed decks resolve to standard without throwing", () => {
    expect(detectDeckFormat({}).format).toBe("standard");
    expect(detectDeckFormat(null).format).toBe("standard");
    expect(detectDeckFormat({ cards: [] }).format).toBe("standard");
    expect(detectDeckFormat(undefined).counts.maindeck).toBe(0);
  });
});

describe("opponentCountForFormat", () => {
  it("commander → 3 opponents (4-player FFA)", () => {
    expect(opponentCountForFormat("commander")).toBe(3);
  });
  it("standard → 1 opponent (heads-up)", () => {
    expect(opponentCountForFormat("standard")).toBe(1);
  });
  it("unknown defaults to 1", () => {
    expect(opponentCountForFormat("whatever")).toBe(1);
  });
});

describe("isValidFormat", () => {
  it("accepts the two supported formats", () => {
    expect(isValidFormat("standard")).toBe(true);
    expect(isValidFormat("commander")).toBe(true);
  });
  it("rejects anything else", () => {
    expect(isValidFormat("modern")).toBe(false);
    expect(isValidFormat("")).toBe(false);
    expect(isValidFormat(undefined)).toBe(false);
  });
});

describe("format value matches engine mode", () => {
  it("returns strings usable directly as state.mode", () => {
    // Guards the contract in §11.2 that format === mode.
    expect(["standard", "commander"]).toContain(
      detectDeckFormat(deck({ Mainboard: 60 })).format,
    );
    expect(["standard", "commander"]).toContain(
      detectDeckFormat(deck({ Mainboard: 99, Commander: 1 })).format,
    );
  });
});

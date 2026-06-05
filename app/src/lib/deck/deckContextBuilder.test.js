/**
 * Tests for the deck-lock confirmation primitives.
 *
 * The chat locks its conversation to a deck snapshot; a new lock starts
 * unconfirmed so the UI can show a confirm-or-swap bar and block sending until
 * the user verifies the deck. These tests pin the two pure pieces that drive
 * that flow: createDeckLock stamps `confirmed: false`, and
 * deckLockNeedsConfirmation only flags an explicitly-unconfirmed lock (legacy
 * locks without the field must stay usable).
 */

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createDeckLock,
  deckLockNeedsConfirmation,
  fetchGoldfishInsightsBlock,
  isDeckRequiredAgent,
  sessionNeedsDeckSelection,
} from "./deckContextBuilder";

const DECK = {
  id: "deck-1",
  name: "Omnath Ramp",
  cards: [
    { name: "Omnath, Locus of Mana", qty: 1, section: "Commander" },
    { name: "Sol Ring", qty: 1, section: "Mainboard" },
  ],
  memory: { owner: "Colton" },
};

describe("createDeckLock", () => {
  it("returns null for no deck", () => {
    expect(createDeckLock(null)).toBeNull();
  });

  it("stamps a new lock as unconfirmed", () => {
    const lock = createDeckLock(DECK);
    expect(lock.confirmed).toBe(false);
    expect(lock.id).toBe("deck-1");
    expect(lock.name).toBe("Omnath Ramp");
  });
});

describe("deckLockNeedsConfirmation", () => {
  it("is false when there is no lock", () => {
    expect(deckLockNeedsConfirmation(null)).toBe(false);
    expect(deckLockNeedsConfirmation(undefined)).toBe(false);
  });

  it("is true for a freshly-created (unconfirmed) lock", () => {
    expect(deckLockNeedsConfirmation(createDeckLock(DECK))).toBe(true);
  });

  it("is false once confirmed", () => {
    expect(deckLockNeedsConfirmation({ ...createDeckLock(DECK), confirmed: true })).toBe(false);
  });

  it("treats a legacy lock without the field as confirmed (backward compat)", () => {
    expect(deckLockNeedsConfirmation({ id: "old", name: "Legacy" })).toBe(false);
  });
});

describe("isDeckRequiredAgent", () => {
  it("requires a deck for the deck-centric agents", () => {
    expect(isDeckRequiredAgent("karn")).toBe(true);
    expect(isDeckRequiredAgent("tibalt")).toBe(true);
  });

  it("does not require a deck for Jace (general rules expert) or others", () => {
    expect(isDeckRequiredAgent("jace")).toBe(false);
    expect(isDeckRequiredAgent("arbiter")).toBe(false);
    expect(isDeckRequiredAgent("garfield")).toBe(false);
    expect(isDeckRequiredAgent(undefined)).toBe(false);
  });
});

describe("sessionNeedsDeckSelection", () => {
  it("is true for a deck-required agent with no lock and no opt-out", () => {
    expect(sessionNeedsDeckSelection({}, "karn")).toBe(true);
    expect(sessionNeedsDeckSelection({ messages: [] }, "tibalt")).toBe(true);
  });

  it("is false once the chat has opted out of having a deck", () => {
    expect(sessionNeedsDeckSelection({ deckDeclined: true }, "karn")).toBe(false);
  });

  it("is false when a deck is already locked (pending or confirmed)", () => {
    expect(sessionNeedsDeckSelection({ lockedDeck: createDeckLock(DECK) }, "karn")).toBe(false);
    expect(sessionNeedsDeckSelection({ lockedDeck: { ...createDeckLock(DECK), confirmed: true } }, "tibalt")).toBe(false);
  });

  it("is false for Jace even with no deck — Jace answers general questions deckless", () => {
    expect(sessionNeedsDeckSelection({}, "jace")).toBe(false);
  });

  it("is false for a null/undefined session (nothing to attach a lock to yet)", () => {
    expect(sessionNeedsDeckSelection(null, "karn")).toBe(false);
    expect(sessionNeedsDeckSelection(undefined, "tibalt")).toBe(false);
  });
});

// Regression guard for the dynamic `import("../gameInsights")` inside
// fetchGoldfishInsightsBlock. gameInsights.js was moved up a directory by the
// #141 structure cleanup; the stale "./gameInsights" path threw at runtime, but
// the function's catch {} swallowed it and silently returned "" — so deck
// insights vanished from agent prompts with no error. This exercises the real
// import path (count >= 2 reaches the import) and asserts a non-empty block, so
// a broken path fails loudly here instead of degrading silently in prod.
describe("fetchGoldfishInsightsBlock", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns an empty string with no deck id (no fetch attempted)", async () => {
    expect(await fetchGoldfishInsightsBlock("")).toBe("");
  });

  it("resolves gameInsights and formats a non-empty block when history exists", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => ({ count: 3 }) })),
    );
    const block = await fetchGoldfishInsightsBlock("deck-1");
    expect(block).toContain("Goldfish History");
    expect(block.length).toBeGreaterThan(0);
  });

  it("returns an empty string when the summary route reports too little history", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => ({ count: 1 }) })),
    );
    expect(await fetchGoldfishInsightsBlock("deck-1")).toBe("");
  });
});

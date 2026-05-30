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

import { describe, expect, it } from "vitest";

import { createDeckLock, deckLockNeedsConfirmation } from "./deckContextBuilder";

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

/**
 * deckApply — reversible Karn add/cut mutations (E1). Pure, deterministic.
 */

import { describe, expect, it } from "vitest";
import {
  addCardToDeck,
  cutCardFromDeck,
  applyDeckChange,
  restoreDeckCards,
  isRestorable,
  createSnapshotEntry,
  relabelSnapshot,
  diffDeckCards,
  cardsFromEntry,
} from "./deckApply.js";

const baseCards = [
  { qty: 1, name: "Atraxa", section: "Commander" },
  { qty: 1, name: "Sol Ring", section: "Mainboard" },
  { qty: 1, name: "Llanowar Elves", section: "Mainboard" },
];
const deck = () => ({ id: "d1", name: "Test", cards: baseCards.map((c) => ({ ...c })), memory: {} });

describe("addCardToDeck", () => {
  it("adds a new mainboard card", () => {
    const out = addCardToDeck(baseCards, "Rhystic Study");
    expect(out.find((c) => c.name === "Rhystic Study")).toEqual({ qty: 1, name: "Rhystic Study", section: "Mainboard" });
  });
  it("increments an existing card in the same section instead of duplicating", () => {
    const out = addCardToDeck(baseCards, "Sol Ring");
    expect(out.filter((c) => c.name === "Sol Ring")).toHaveLength(1);
    expect(out.find((c) => c.name === "Sol Ring").qty).toBe(2);
  });
});

describe("cutCardFromDeck", () => {
  it("removes a 1-of entirely", () => {
    const out = cutCardFromDeck(baseCards, "Llanowar Elves");
    expect(out.find((c) => c.name === "Llanowar Elves")).toBeUndefined();
  });
  it("decrements a multi-copy card", () => {
    const out = cutCardFromDeck([{ qty: 4, name: "Forest", section: "Mainboard" }], "Forest");
    expect(out[0].qty).toBe(3);
  });
  it("prefers a non-Commander match and is a no-op for unknown names", () => {
    const cards = [{ qty: 1, name: "Atraxa", section: "Commander" }, { qty: 1, name: "Atraxa", section: "Mainboard" }];
    const out = cutCardFromDeck(cards, "Atraxa");
    expect(out.find((c) => c.section === "Commander")).toBeTruthy();   // commander kept
    expect(out.find((c) => c.section === "Mainboard")).toBeUndefined(); // mainboard copy cut
    expect(cutCardFromDeck(baseCards, "Nonexistent")).toHaveLength(baseCards.length);
  });
});

describe("applyDeckChange", () => {
  it("applies an add and snapshots the prior state (lossless cards + reason), newest first", () => {
    const out = applyDeckChange(deck(), { action: "add", name: "Rhystic Study" }, { id: "s1", date: "2026-06-01" });
    expect(out.cards.find((c) => c.name === "Rhystic Study")).toBeTruthy();
    expect(out.memory.snapshots).toHaveLength(1);
    const snap = out.memory.snapshots[0];
    expect(snap).toMatchObject({ id: "s1", date: "2026-06-01", reason: "Before adding Rhystic Study" });
    expect(snap.cards).toHaveLength(3);                 // full pre-change cards
    expect(snap.snapshot.cardNames).toContain("1 Sol Ring"); // drift-display shape too
  });

  it("applies a cut and prepends a new snapshot (cap 20)", () => {
    let d = { ...deck(), memory: { snapshots: Array.from({ length: 20 }, (_, i) => ({ id: `old${i}` })) } };
    d = applyDeckChange(d, { action: "cut", name: "Sol Ring" }, { id: "new", date: "x" });
    expect(d.cards.find((c) => c.name === "Sol Ring")).toBeUndefined();
    expect(d.memory.snapshots).toHaveLength(20);
    expect(d.memory.snapshots[0].id).toBe("new"); // newest first
  });

  it("returns the deck unchanged for an invalid change", () => {
    const d = deck();
    expect(applyDeckChange(d, { action: "wat", name: "X" })).toBe(d);
    expect(applyDeckChange(d, { action: "add" })).toBe(d);
  });
});

describe("createSnapshotEntry", () => {
  it("captures the full cards array (lossless) so a manual snapshot is restorable", () => {
    const entry = createSnapshotEntry(deck(), { id: "m1", date: "2026-06-01" });
    expect(entry).toMatchObject({ id: "m1", date: "2026-06-01" });
    expect(entry.cards).toHaveLength(3);
    expect(isRestorable(entry)).toBe(true);
    expect(entry.snapshot.cardNames).toContain("1 Sol Ring");
    expect(entry.reason).toBeUndefined(); // no auto-cause for a manual save
    expect(entry.label).toBeUndefined();  // unlabeled by default
  });
  it("keeps an optional label (trimmed) and omits a blank one", () => {
    expect(createSnapshotEntry(deck(), { id: "a", label: "  after game night  " }).label).toBe("after game night");
    expect(createSnapshotEntry(deck(), { id: "b", label: "   " }).label).toBeUndefined();
  });
  it("tolerates a missing deck/cards", () => {
    expect(createSnapshotEntry(null, { id: "z" }).cards).toEqual([]);
  });
});

describe("relabelSnapshot", () => {
  const snaps = [{ id: "s1", date: "d1" }, { id: "s2", date: "d2", label: "old" }];
  it("sets a label on the matching entry only", () => {
    const out = relabelSnapshot(snaps, "s1", "named it");
    expect(out.find((s) => s.id === "s1").label).toBe("named it");
    expect(out.find((s) => s.id === "s2").label).toBe("old"); // untouched
  });
  it("clears the label when given a blank string", () => {
    const out = relabelSnapshot(snaps, "s2", "   ");
    expect(out.find((s) => s.id === "s2").label).toBeUndefined();
  });
  it("returns entries unchanged when the id is unknown", () => {
    expect(relabelSnapshot(snaps, "nope", "x")).toEqual(snaps);
  });
});

describe("diffDeckCards", () => {
  it("reports adds, removes, and quantity changes (not paired add+remove)", () => {
    const from = [
      { qty: 1, name: "Sol Ring", section: "Mainboard" },
      { qty: 1, name: "Forest", section: "Mainboard" },
      { qty: 1, name: "Counterspell", section: "Mainboard" },
    ];
    const to = [
      { qty: 1, name: "Sol Ring", section: "Mainboard" }, // unchanged
      { qty: 3, name: "Forest", section: "Mainboard" },    // 1 -> 3 changed
      { qty: 1, name: "Rhystic Study", section: "Mainboard" }, // added
      // Counterspell removed
    ];
    const d = diffDeckCards(from, to);
    expect(d.added).toEqual([{ name: "Rhystic Study", qty: 1 }]);
    expect(d.removed).toEqual([{ name: "Counterspell", qty: 1 }]);
    expect(d.changed).toEqual([{ name: "Forest", from: 1, to: 3 }]);
  });
  it("is case-insensitive on names and excludes tokens", () => {
    const from = [{ qty: 1, name: "sol ring", section: "Mainboard" }, { qty: 2, name: "Treasure", section: "Tokens" }];
    const to = [{ qty: 1, name: "Sol Ring", section: "Mainboard" }, { qty: 5, name: "Treasure", section: "Tokens" }];
    const d = diffDeckCards(from, to);
    expect(d.added).toHaveLength(0);
    expect(d.removed).toHaveLength(0);
    expect(d.changed).toHaveLength(0); // tokens ignored; sol ring unchanged
  });
  it("handles empty sides", () => {
    expect(diffDeckCards([], [{ qty: 1, name: "X", section: "Mainboard" }]).added).toEqual([{ name: "X", qty: 1 }]);
    expect(diffDeckCards(null, null)).toEqual({ added: [], removed: [], changed: [] });
  });
});

describe("cardsFromEntry", () => {
  it("returns the full cards array when present", () => {
    const entry = { cards: [{ qty: 1, name: "Sol Ring", section: "Mainboard" }] };
    expect(cardsFromEntry(entry)).toBe(entry.cards);
  });
  it("parses legacy snapshot.cardNames into rough {qty,name}", () => {
    const out = cardsFromEntry({ snapshot: { cardNames: ["2 Forest", "1 Sol Ring", "Mountain"] } });
    expect(out).toEqual([
      { qty: 2, name: "Forest", section: "Mainboard" },
      { qty: 1, name: "Sol Ring", section: "Mainboard" },
      { qty: 1, name: "Mountain", section: "Mainboard" },
    ]);
  });
  it("returns [] when there is nothing to read", () => {
    expect(cardsFromEntry(null)).toEqual([]);
    expect(cardsFromEntry({})).toEqual([]);
  });
});

describe("restoreDeckCards / isRestorable", () => {
  it("restores the exact pre-change cards from an apply-snapshot", () => {
    const applied = applyDeckChange(deck(), { action: "add", name: "Rhystic Study" }, { id: "s1", date: "d" });
    const snap = applied.memory.snapshots[0];
    expect(isRestorable(snap)).toBe(true);
    const restored = restoreDeckCards(applied, snap);
    expect(restored.cards.find((c) => c.name === "Rhystic Study")).toBeUndefined();
    expect(restored.cards).toHaveLength(3);
  });
  it("won't flatten an old display-only snapshot (no cards array)", () => {
    const d = deck();
    expect(isRestorable({ snapshot: { cardNames: ["1 Sol Ring"] } })).toBe(false);
    expect(restoreDeckCards(d, { snapshot: { cardNames: [] } })).toBe(d);
  });
});

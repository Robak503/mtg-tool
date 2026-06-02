/**
 * deckApply.js — reversible deck mutations for "Karn applies a cut/add" (E1).
 *
 * Pure: given a deck and a change, return a NEW deck with the change applied AND
 * a snapshot of the pre-change state pushed onto `memory.snapshots`, so every
 * applied suggestion is one click from being undone. The snapshot entry matches
 * the shape DeckView already renders (`{ id, date, snapshot }`) and adds:
 *   - `reason`  — why it was taken ("Before adding Rhystic Study")
 *   - `cards`   — the full pre-change cards array, for LOSSLESS restore
 *                 (the `snapshot.cardNames` form is lossy — it drops section).
 *
 * The caller injects id/date (so this stays deterministic + testable). Adds
 * default to the Mainboard; cuts decrement and drop at zero, never touching the
 * Commander unless it's the only match.
 */

import { deckSnapshot } from "./agentArtifacts.js";

const MAIN = "Mainboard";
const key = (name) => String(name || "").trim().toLowerCase();

/** Add one copy of `name` (increment if the printing already sits in `section`). */
export function addCardToDeck(cards, name, section = MAIN) {
  const list = [...(cards || [])];
  const k = key(name);
  const i = list.findIndex((c) => key(c.name) === k && c.section === section);
  if (i >= 0) list[i] = { ...list[i], qty: (list[i].qty || 0) + 1 };
  else list.push({ qty: 1, name: String(name).trim(), section });
  return list;
}

/** Remove one copy of `name` (drop the entry at zero). Prefers a non-Commander match. */
export function cutCardFromDeck(cards, name) {
  const list = [...(cards || [])];
  const k = key(name);
  let i = list.findIndex((c) => key(c.name) === k && c.section !== "Commander");
  if (i < 0) i = list.findIndex((c) => key(c.name) === k);
  if (i < 0) return list; // not in the deck — no-op
  const qty = (list[i].qty || 0) - 1;
  if (qty <= 0) list.splice(i, 1);
  else list[i] = { ...list[i], qty };
  return list;
}

/**
 * Build a snapshot/version entry capturing a deck's CURRENT state losslessly.
 * Shared by the manual "Snapshot now" button and the Karn-apply undo path so
 * every entry carries the full `cards` array and is therefore restorable.
 * @param meta { id, date, reason?, label? } — id/date injected for determinism;
 *   `reason` is the auto-cause (e.g. "Before adding X"), `label` an optional
 *   user-given name ("after game night"). Both omitted when empty.
 */
export function createSnapshotEntry(deck, { id, date, reason = "", label = "" } = {}) {
  const cleanLabel = String(label || "").trim().slice(0, 80);
  return {
    id: id || `snap-${date || ""}`,
    date: date || "",
    ...(reason ? { reason } : {}),
    ...(cleanLabel ? { label: cleanLabel } : {}),
    snapshot: deckSnapshot(deck),
    cards: (deck && deck.cards) || [],
  };
}

/** Return a new snapshots array with `id`'s label set (trimmed; empty clears it). */
export function relabelSnapshot(snapshots, id, label) {
  const cleanLabel = String(label || "").trim().slice(0, 80);
  return (snapshots || []).map((s) => {
    if (s.id !== id) return s;
    const next = { ...s };
    if (cleanLabel) next.label = cleanLabel;
    else delete next.label;
    return next;
  });
}

/**
 * Apply a change to a deck, snapshotting the prior state first.
 * @param change { action: "add"|"cut", name, section? }
 * @param meta   { id, date } — injected so the snapshot entry is deterministic
 * @returns the new deck (unchanged deck if the change is invalid)
 */
export function applyDeckChange(deck, change, { id, date } = {}) {
  if (!deck || !change || !change.name || (change.action !== "add" && change.action !== "cut")) {
    return deck;
  }
  const verb = change.action === "add" ? "adding" : "cutting";
  const snapEntry = createSnapshotEntry(deck, {
    id: id || `snap-${date || ""}-${key(change.name)}`,
    date,
    reason: `Before ${verb} ${String(change.name).trim()}`,
  });
  const cards = change.action === "add"
    ? addCardToDeck(deck.cards, change.name, change.section || MAIN)
    : cutCardFromDeck(deck.cards, change.name);
  const snapshots = [snapEntry, ...(deck.memory?.snapshots || [])].slice(0, 20);
  return { ...deck, cards, memory: { ...(deck.memory || {}), snapshots } };
}

/**
 * Restore a deck's cards from a snapshot entry. Lossless when the entry carries
 * a full `cards` array (apply-snapshots do); older display-only snapshots that
 * only have `snapshot.cardNames` can't be restored here (caller should disable
 * restore for those) so we return the deck unchanged rather than flatten it.
 */
export function restoreDeckCards(deck, snapEntry) {
  if (!deck || !snapEntry) return deck;
  if (Array.isArray(snapEntry.cards)) return { ...deck, cards: snapEntry.cards };
  return deck;
}

/** Whether a snapshot entry can be losslessly restored (has full cards). */
export function isRestorable(snapEntry) {
  return Array.isArray(snapEntry?.cards);
}

// ── Version diff (H2) ───────────────────────────────────────────────────────

/**
 * The card list for a version entry. Lossless entries carry `cards`; older
 * display-only snapshots only kept `snapshot.cardNames` ("2 Forest"), which we
 * parse back into rough {qty, name} (section unknown → Mainboard) so they can
 * still take part in a diff.
 */
export function cardsFromEntry(entry) {
  if (Array.isArray(entry?.cards)) return entry.cards;
  const names = entry?.snapshot?.cardNames;
  if (!Array.isArray(names)) return [];
  return names.map((line) => {
    const m = String(line).match(/^\s*(\d+)\s+(.*)$/);
    return m
      ? { qty: parseInt(m[1], 10) || 1, name: m[2].trim(), section: MAIN }
      : { qty: 1, name: String(line).trim(), section: MAIN };
  });
}

/** Sum quantities per card name (case-insensitive), excluding tokens by default. */
function qtyByName(cards, { includeTokens = false } = {}) {
  const map = new Map(); // key -> { name, qty }
  for (const c of cards || []) {
    if (!c || !c.name) continue;
    if (!includeTokens && c.section === "Tokens") continue;
    const k = key(c.name);
    const prev = map.get(k);
    if (prev) prev.qty += c.qty || 0;
    else map.set(k, { name: String(c.name).trim(), qty: c.qty || 0 });
  }
  return map;
}

/**
 * Quantity-aware diff between two deck card lists (from → to), keyed by card
 * name (case-insensitive), tokens excluded. Unlike the string-based "+/- since",
 * a 1→2 quantity bump shows as a `changed` entry rather than a paired add+remove.
 * @returns { added:[{name,qty}], removed:[{name,qty}], changed:[{name,from,to}] }
 *   each sorted by name; all counts are positive deltas.
 */
export function diffDeckCards(fromCards, toCards) {
  const from = qtyByName(fromCards);
  const to = qtyByName(toCards);
  const added = [];
  const removed = [];
  const changed = [];
  const keys = new Set([...from.keys(), ...to.keys()]);
  for (const k of keys) {
    const a = from.get(k);
    const b = to.get(k);
    const fromQty = a?.qty || 0;
    const toQty = b?.qty || 0;
    if (fromQty === toQty) continue;
    const name = b?.name || a?.name;
    if (fromQty === 0) added.push({ name, qty: toQty });
    else if (toQty === 0) removed.push({ name, qty: fromQty });
    else changed.push({ name, from: fromQty, to: toQty });
  }
  const byName = (x, y) => x.name.localeCompare(y.name);
  return { added: added.sort(byName), removed: removed.sort(byName), changed: changed.sort(byName) };
}

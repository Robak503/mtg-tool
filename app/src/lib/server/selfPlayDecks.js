/**
 * selfPlayDecks.js — load + enrich decks into the shape the self-play runner wants.
 *
 * Shared by BOTH the /api/self-play route and the headless self-play.cjs CLI so the
 * deck→runner transformation lives in exactly one place. Local-first: decks come
 * from the on-disk profile `decks.local.json` files and every card is enriched from
 * the bundled local oracle index (cardIndex via enrichDeck) — zero network.
 *
 * A deck store entry is `{ id, name, cards: [{ qty, name, section }], ... }`. The
 * engine wants individual enriched card objects split by section (mainboard vs
 * Commander vs Companion). The split logic mirrors LearnView.deckToCardArray /
 * commandersOf / companionOf so self-play decks are built byte-for-byte the way The
 * Academy builds them from the UI.
 */

import fs from "node:fs/promises";

import { profilesRegistryPath, isValidProfileId, profilePath } from "./paths.js";
import { enrichDeck } from "./learnDeckEnrich.js";
import path from "node:path";

// Sections that never enter the library as mainboard cards (mirrors LearnView).
const NON_MAINBOARD = new Set(["Sideboard", "Tokens", "Commander", "Companion"]);

/** Expand a deck-store entry's mainboard into individual blank card objects. */
function deckToCardArray(deck) {
  if (!deck?.cards) return [];
  const out = [];
  for (const entry of deck.cards) {
    if (NON_MAINBOARD.has(entry.section)) continue;
    for (let i = 0; i < (entry.qty || 1); i++) {
      out.push({
        id: `${deck.id || "deck"}-${entry.name}-${i}`,
        name: entry.name,
        type: entry.type || "",
        mana: entry.mana || "",
        oracle: entry.oracle || "",
      });
    }
  }
  return out;
}

/** Pull the Commander section into commander card objects (mirrors companionOf). */
function commandersOf(deck) {
  if (!deck?.cards) return [];
  // P0 fix (Omnath 2026-07-10 — BLANK-COMMANDER incident): emit BARE {id, name}, exactly like
  // companionOf below. The old stub fabricated type:"Legendary Creature" + mana:"", which satisfied
  // learnDeckEnrich's alreadyShaped() → enrichment SKIPPED → every grind/self-play commander entered
  // play with no power/toughness/oracle (a blank 0/0 — no eminence, no radiation, no abilities;
  // commander-centric decks' standings partially measured blank-commander survivability). Bare
  // {id, name} → alreadyShaped false → mergeCardData fills the REAL card from the bundled oracle
  // index (the stable cmd-… id survives the merge's deckCard spread).
  return deck.cards
    .filter((c) => c.section === "Commander")
    .map((c) => ({ id: `cmd-${deck.id || "deck"}-${c.name}`, name: c.name }));
}

/** Pull the single Companion (mirrors companionOf); null when none. */
function companionOf(deck) {
  if (!deck?.cards) return null;
  const row = deck.cards.find((c) => c.section === "Companion");
  if (!row) return null;
  return { id: `comp-${deck.id || "deck"}-${row.name}`, name: row.name };
}

/**
 * Turn one deck-store entry into an ENRICHED runner deck:
 *   { id, name, cards: card[], commanders: card[], companion: card|null }
 * Pure aside from the local-index lookup inside enrichDeck (no network).
 */
// POOL TAG (SIM-INTEGRITY Phase 3, Colton's call 2026-07-09): Rograkh/Thrasios + Kinnan are
// cEDH-tuned — they never belong in mixed pods (a fast combo deck vs Slivers measures
// nothing). The tag is data-first (deck.memory.pool wins when set); these ids are the code
// DEFAULT so the gate holds even before the deck records carry the field. A cEDH grind later
// is a flag flip, zero code.
const CEDH_DEFAULT_IDS = new Set(["colton-rograkh-thrasios", "joe-kinnan-bonder-prodigy"]);

/** A deck's pod pool: "mixed" (default) | "cedh". memory.pool overrides the code default. */
export function poolOfDeck(deck) {
  const tagged = deck?.memory?.pool;
  if (tagged === "cedh" || tagged === "mixed") return tagged;
  return CEDH_DEFAULT_IDS.has(deck?.id) ? "cedh" : "mixed";
}

export function toRunnerDeck(deck) {
  const enrichOne = (c) => (c ? enrichDeck([c])[0] || null : null);
  return {
    id: deck.id || deck.name,
    name: deck.name || deck.id || "Untitled deck",
    cards: enrichDeck(deckToCardArray(deck)),
    commanders: enrichDeck(commandersOf(deck)),
    companion: enrichOne(companionOf(deck)),
    pool: poolOfDeck(deck),
  };
}

/** Parse a decks.local.json blob into a normalised deck array (mirrors /api/decks). */
function decksFromBlob(parsed) {
  const decks = Array.isArray(parsed) ? parsed : parsed?.decks;
  return Array.isArray(decks) ? decks : [];
}

/**
 * Read every profile's decks.local.json and return all raw deck-store entries
 * across the install, each tagged with its owning profileId. Used by the CLI to
 * sweep the full 13-deck training set (which spans two profiles). Reads via the
 * profiles registry — no active-profile dependency.
 *
 * @returns {Promise<Array<{profileId, ...deck}>>}
 */
export async function loadAllProfileDecks() {
  let registryRaw;
  try {
    registryRaw = await fs.readFile(profilesRegistryPath(), "utf8");
  } catch {
    return []; // no registry yet
  }
  let reg;
  try {
    reg = JSON.parse(registryRaw);
  } catch {
    return [];
  }
  const profiles = Array.isArray(reg?.profiles) ? reg.profiles : [];
  const registryDir = path.dirname(profilesRegistryPath());

  const all = [];
  for (const p of profiles) {
    if (!isValidProfileId(p?.id)) continue;
    const file = path.join(registryDir, "profiles", p.id, "decks.local.json");
    let raw;
    try {
      raw = await fs.readFile(file, "utf8");
    } catch {
      continue; // a profile with no decks file
    }
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      continue;
    }
    for (const deck of decksFromBlob(parsed)) {
      all.push({ profileId: p.id, ...deck });
    }
  }
  return all;
}

/**
 * EMPTY-DECK GUARD (overhaul P4): split enriched runner decks into playable vs empty — an
 * empty/unenrichable deck ("Test Deck", a failed import) seeded into a 4-player pod can only
 * setup-error the whole table. Shared by the CLI sweep AND /api/self-play so the two callers
 * can't drift (this module's charter: the deck→runner transformation lives in exactly one place).
 */
export function partitionPlayableRunnerDecks(runnerDecks) {
  const playable = [];
  const empty = [];
  for (const d of runnerDecks || []) (d.cards.length > 0 ? playable : empty).push(d);
  return { playable, empty };
}

/**
 * Cross-profile deck PICKER list — every deck across every profile reduced to the
 * minimal shape the Sim Center's deck selector needs: `{ id, name, profile }`,
 * where `profile` is the owning profile's display NAME (not its id). Built by
 * joining loadAllProfileDecks() against the profiles registry's id→name map.
 *
 * Local-first + honest: reads only the on-disk registry + profile deck files (no
 * network), and a deck whose profile is missing from the registry falls back to
 * its raw profileId so it's never silently dropped from the list.
 *
 * @returns {Promise<Array<{ id: string, name: string, profile: string }>>}
 */
export async function listAllProfileDecks() {
  // id → display name from the registry (best-effort; absence → fall back to id).
  const nameById = new Map();
  try {
    const reg = JSON.parse(await fs.readFile(profilesRegistryPath(), "utf8"));
    for (const p of Array.isArray(reg?.profiles) ? reg.profiles : []) {
      if (p?.id) nameById.set(p.id, p.name || p.id);
    }
  } catch {
    // no registry yet → every deck shows its raw profileId as the group label
  }

  const decks = await loadAllProfileDecks();
  return decks.map((d) => ({
    id: d.id,
    name: d.name || d.id || "Untitled deck",
    profile: nameById.get(d.profileId) || d.profileId || "Unknown",
  }));
}

/**
 * Read the ACTIVE profile's decks.local.json (via profilePath, the same path
 * /api/decks uses) into raw deck-store entries. Returns [] when absent/unreadable.
 */
export async function decksForActiveProfile() {
  let raw;
  try {
    raw = await fs.readFile(profilePath("decks.local.json"), "utf8");
  } catch {
    return [];
  }
  try {
    return decksFromBlob(JSON.parse(raw));
  } catch {
    return [];
  }
}

/**
 * Resolve a list of raw deck-store entries by id from a pool. Preserves the order
 * of `ids`. Unknown ids are skipped (the caller decides whether to error).
 */
export function selectDecksByIds(pool, ids) {
  const byId = new Map(pool.map((d) => [d.id, d]));
  const out = [];
  for (const id of ids) {
    const d = byId.get(id);
    if (d) out.push(d);
  }
  return out;
}

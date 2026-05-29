/**
 * spellbook.js
 *
 * Local-first Commander Spellbook integration.
 *
 * Loads combo data from disk (synced by sync-spellbook.cjs) and provides
 * fast card-set lookups. Zero network calls in normal operation.
 *
 * Exports:
 *   findCombos(cardNames)    → { included, almostIncluded }
 *   estimateBracket(cardNames, commanderNames?) → { bracketTag, gameChangers, massLandDenial, extraTurn }
 *   spellbookReady()         → boolean
 *   getSpellbookMeta()       → { syncedAt, variants, cards }
 */

import fs from "node:fs";

import { dataPath } from "./paths.js";

// ── Module-level cache (loaded once per process) ─────────────────────────────

let _combos = null;       // comboId → combo object
let _index = null;        // normalizedCardName → comboId[]
let _cards = null;        // cardName → { gameChanger, massLandDenial, extraTurn }
let _meta = null;
let _loaded = false;
let _loadAttempted = false;

function normalizeName(name) {
  return String(name || "").toLowerCase().trim()
    .replace(/['']/g, "'")
    .replace(/[""]/g, '"');
}

function loadData() {
  if (_loaded) return true;
  // If a previous attempt failed with parse errors (not just missing files), don't retry.
  if (_loadAttempted) return false;

  // Resolve paths here (not at import time) so dataPath's MTG_REFERENCE_DIR /
  // AppData fallback reflects current on-disk state — an in-app sync that writes
  // fresher combo data is picked up without a restart, and the packaged .exe no
  // longer reads relative to the bundled source file.
  const combosFile = dataPath("spellbook-combos.local.json");
  const indexFile = dataPath("spellbook-index.local.json");
  const cardsFile = dataPath("spellbook-cards.local.json");
  const metaFile = dataPath("spellbook-meta.local.json");

  // Files missing: don't mark attempted so we retry when files are synced.
  // This lets users run npm run sync:spellbook and get combos without restarting the server.
  if (!fs.existsSync(combosFile) || !fs.existsSync(indexFile)) {
    console.warn("[spellbook] Local data not found. Run: node app/scripts/sync-spellbook.cjs");
    return false;
  }

  // Files exist — mark attempted so parse failures are not retried.
  _loadAttempted = true;

  try {

    const rawCombos = JSON.parse(fs.readFileSync(combosFile, "utf8"));
    _combos = {};
    for (const c of rawCombos) {
      _combos[c.id] = c;
    }

    _index = JSON.parse(fs.readFileSync(indexFile, "utf8"));

    if (fs.existsSync(cardsFile)) {
      _cards = JSON.parse(fs.readFileSync(cardsFile, "utf8"));
    }

    if (fs.existsSync(metaFile)) {
      _meta = JSON.parse(fs.readFileSync(metaFile, "utf8"));
    }

    _loaded = true;
    const varCount = Object.keys(_combos).length;
    const cardCount = Object.keys(_index).length;
    console.log(`[spellbook] Loaded ${varCount.toLocaleString()} combos, ${cardCount.toLocaleString()} indexed cards`);
    return true;
  } catch (err) {
    console.error("[spellbook] Failed to load local data:", err.message);
    return false;
  }
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Returns true if local spellbook data is available.
 */
export function spellbookReady() {
  return loadData();
}

/**
 * Returns sync metadata.
 */
export function getSpellbookMeta() {
  loadData();
  return _meta;
}

/**
 * Find combos present in (or near) a set of card names.
 *
 * @param {string[]} cardNames  — card names from a deck (non-land, non-token)
 * @param {object}   opts
 *   opts.includeAlmost {boolean}   — include combos needing 1 more card (default: true)
 *   opts.maxAlmost     {number}    — max "almost" results returned (default: 20)
 *
 * @returns {{
 *   included: ComboResult[],
 *   almostIncluded: AlmostResult[],
 *   ready: boolean
 * }}
 */
export function findCombos(cardNames, opts = {}) {
  const { includeAlmost = true, maxAlmost = 20, minCardCount = 2 } = opts;

  if (!loadData()) {
    return { included: [], almostIncluded: [], ready: false };
  }

  const deckSet = new Set(cardNames.map(normalizeName));

  // Gather all candidate combo IDs where at least one deck card appears
  const candidateIds = new Set();
  for (const name of deckSet) {
    const comboIds = _index[name] || [];
    for (const id of comboIds) candidateIds.add(id);
  }

  const included = [];
  const almostIncluded = [];

  for (const id of candidateIds) {
    const combo = _combos[id];
    if (!combo) continue;
    if ((combo.cards || []).length < minCardCount) continue;

    const required = combo.cards.map(cardName => ({
      name: cardName,
      normalized: normalizeName(cardName),
    }));
    const missing = required.filter(card => !deckSet.has(card.normalized));

    if (missing.length === 0) {
      included.push(formatCombo(combo));
    } else if (includeAlmost && missing.length === 1) {
      almostIncluded.push(formatAlmost(combo, missing[0].name));
    }
  }

  const uniqueIncluded = dedupeComboResults(included);
  const uniqueAlmost = dedupeComboResults(almostIncluded, true);

  // Sort included by number of cards (smaller combos first), then popularity desc
  uniqueIncluded.sort((a, b) => a.cardCount - b.cardCount || (b.popularity ?? 0) - (a.popularity ?? 0));

  // Sort almost by popularity desc
  uniqueAlmost.sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0));

  return {
    included: uniqueIncluded,
    almostIncluded: uniqueAlmost.slice(0, maxAlmost),
    ready: true,
  };
}

function dedupeComboResults(results, includeMissing = false) {
  const seen = new Set();
  const deduped = [];
  for (const result of results) {
    const cards = [...(result.cards || [])].map(normalizeName).sort().join("|");
    const produces = [...(result.produces || [])].map(normalizeName).sort().join("|");
    const missing = includeMissing ? normalizeName(result.missingCard) : "";
    const key = `${cards}::${missing}::${produces}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(result);
  }
  return deduped;
}

function formatCombo(combo) {
  return {
    id: combo.id,
    cards: combo.cards,
    produces: combo.produces,
    bracketTag: combo.bracketTag,
    manaValueNeeded: combo.manaValueNeeded,
    identity: combo.identity,
    popularity: combo.popularity,
    cardCount: combo.cards.length,
  };
}

function formatAlmost(combo, missingCard) {
  return {
    ...formatCombo(combo),
    missingCard: missingCard,
  };
}

/**
 * Estimates the Commander bracket for a deck based on local card flags.
 *
 * @param {string[]} cardNames      — all 99 cards (non-commander)
 * @param {string[]} commanderNames — commander card name(s)
 *
 * @returns {{
 *   bracketTag: string,          // E/C/U/P/R/S or 'unknown'
 *   bracketLabel: string,
 *   gameChangers: string[],      // names of game changer cards in deck
 *   massLandDenial: string[],    // MLD cards in deck
 *   extraTurns: string[],        // extra turn cards in deck
 *   combosFound: number,         // complete combos in deck
 *   ready: boolean
 * }}
 */
export function estimateBracket(cardNames, commanderNames = []) {
  if (!loadData()) {
    return { bracketTag: "unknown", bracketLabel: "Unknown", gameChangers: [], massLandDenial: [], extraTurns: [], combosFound: 0, ready: false };
  }

  if (!_cards) {
    return { bracketTag: "unknown", bracketLabel: "Unknown", gameChangers: [], massLandDenial: [], extraTurns: [], combosFound: 0, ready: false };
  }

  const allCardNames = [...cardNames, ...commanderNames];
  const gameChangers = [];
  const massLandDenial = [];
  const extraTurns = [];

  for (const name of allCardNames) {
    const flags = _cards[name] || _cards[normalizeName(name)];
    if (!flags) continue;
    if (flags.gameChanger) gameChangers.push(name);
    if (flags.massLandDenial) massLandDenial.push(name);
    if (flags.extraTurn) extraTurns.push(name);
  }

  // Find complete combos for bracket assessment
  const { included } = findCombos(cardNames, { includeAlmost: false });
  const earlyGameCombos = included.filter(c => (c.manaValueNeeded ?? 99) < 8);
  const combosFound = included.length;

  // Bracket classification per Commander Spellbook logic
  // E=Exhibition(1), C=Core(2), U=Upgraded(3), P=Powerful(4?)/Optimized, R=Ruthless, S=Spicy
  // For game bracket mapping:
  // Bracket 1: no restrictions
  // Bracket 2: no game changers
  // Bracket 3: ≤3 game changers, no MLD, no early 2-card combos
  // Bracket 4: no restrictions (optimized)
  // Bracket 5: cEDH
  let bracketTag, bracketLabel;

  if (gameChangers.length === 0 && massLandDenial.length === 0 && extraTurns.length === 0 && combosFound === 0) {
    bracketTag = "E";
    bracketLabel = "Core / Exhibition (Bracket 1-2)";
  } else if (gameChangers.length <= 3 && massLandDenial.length === 0 && earlyGameCombos.length === 0) {
    bracketTag = "C";
    bracketLabel = "Upgraded (Bracket 3)";
  } else if (gameChangers.length <= 6 && earlyGameCombos.length <= 2) {
    bracketTag = "P";
    bracketLabel = "Powerful (Bracket 4)";
  } else {
    bracketTag = "R";
    bracketLabel = "Ruthless (cEDH)";
  }

  return {
    bracketTag,
    bracketLabel,
    gameChangers,
    massLandDenial,
    extraTurns,
    combosFound,
    earlyGameCombos: earlyGameCombos.length,
    ready: true,
  };
}

/**
 * Format combo results for display in Karn/Jace responses.
 * Returns a compact text block.
 */
export function formatCombosForPrompt(findResult, opts = {}) {
  const { maxIncluded = 5, maxAlmost = 8 } = opts;
  const lines = [];

  if (!findResult.ready) {
    return "Commander Spellbook data not loaded locally. Run: node app/scripts/sync-spellbook.cjs";
  }

  if (findResult.included.length > 0) {
    lines.push(`## COMBOS IN DECK (${findResult.included.length})`);
    for (const c of findResult.included.slice(0, maxIncluded)) {
      const produces = c.produces.slice(0, 2).join("; ");
      lines.push(`- ${c.cards.join(" + ")}${produces ? ` → ${produces}` : ""}`);
    }
    if (findResult.included.length > maxIncluded) {
      lines.push(`  ...and ${findResult.included.length - maxIncluded} more`);
    }
  } else {
    lines.push("## COMBOS IN DECK: none");
  }

  if (findResult.almostIncluded.length > 0) {
    lines.push(`\n## 1-CARD-AWAY COMBOS (${findResult.almostIncluded.length})`);
    for (const c of findResult.almostIncluded.slice(0, maxAlmost)) {
      const produces = c.produces.slice(0, 1).join("; ");
      const missing = c.missingCard;
      lines.push(`- ${c.cards.filter(n => normalizeName(n) !== normalizeName(missing)).join(" + ")} + [${missing}]${produces ? ` → ${produces}` : ""}`);
    }
    if (findResult.almostIncluded.length > maxAlmost) {
      lines.push(`  ...and ${findResult.almostIncluded.length - maxAlmost} more`);
    }
  }

  return lines.join("\n");
}

/**
 * Format bracket estimate for display in Karn responses.
 */
export function formatBracketForPrompt(bracketResult) {
  if (!bracketResult.ready) return "";
  const lines = [
    `## BRACKET ESTIMATE: ${bracketResult.bracketLabel}`,
  ];
  if (bracketResult.gameChangers.length > 0) {
    lines.push(`Game Changers (${bracketResult.gameChangers.length}): ${bracketResult.gameChangers.join(", ")}`);
  }
  if (bracketResult.massLandDenial.length > 0) {
    lines.push(`Mass Land Denial: ${bracketResult.massLandDenial.join(", ")}`);
  }
  if (bracketResult.extraTurns.length > 0) {
    lines.push(`Extra Turns: ${bracketResult.extraTurns.join(", ")}`);
  }
  if (bracketResult.combosFound > 0) {
    lines.push(`Complete combos in deck: ${bracketResult.combosFound}`);
  }
  return lines.join("\n");
}

/**
 * Phase 6 PR 10.1 — manaModel.js
 *
 * The missing piece that makes the learn engine playable: what mana a
 * permanent can produce, and how to pay a spell's cost from the pool +
 * untapped sources. Before this, `manaPool` was never filled, so no spell
 * was ever castable and the driver auto-piloted into the safety cap.
 *
 * Design (see docs/phase6-playable-engine.md §5 PR 10.1):
 *   - Sources are untapped permanents with a mana ability: lands + non-
 *     creature rocks (no summoning-sickness gate) + creature dorks (gated
 *     by summoning sickness unless Haste).
 *   - A source produces `amount` mana of ONE chosen color from `colors`.
 *     (Sol Ring = {colors:["C"], amount:2}; a dual = {colors:["W","U"],
 *     amount:1}.)
 *   - Payment is greedy, MOST-CONSTRAINED-SOURCE-FIRST: colored pips are
 *     satisfied from the source with the fewest color options first, so a
 *     dual that's the only source of a needed color isn't wasted paying
 *     generic. Pathological multicolor costs fall to "can't afford" — never
 *     to fabricated mana.
 *
 * Pure: no fetches, no mutation. `canAfford`/`planPayment` never change
 * state — the dispatcher commits taps. This separation (pure planner +
 * separate commit) keeps castability checks side-effect free.
 *
 * This module is a LEAF: it imports only constants from gameState and
 * operates on already-parsed cost objects (from legalChoices.parseManaCost),
 * so there is no import cycle with legalChoices.
 */

import { MANA_COLORS } from "./gameState.js";

// ─── Card → mana production ────────────────────────────────────────────────────

// Basic lands by name — the most reliable signal (card.oracle is sometimes
// thin in the slim index). Snow-Covered variants strip the prefix.
const BASIC_LAND_MANA = {
  Plains: ["W"],
  Island: ["U"],
  Swamp: ["B"],
  Mountain: ["R"],
  Forest: ["G"],
  Wastes: ["C"],
};

// Known mana rocks — a small belt-and-suspenders table for when oracle text
// is missing/thin. The oracle parser below handles most rocks on its own
// ("{T}: Add {C}{C}" etc.); this is the safety net for the iconic ones.
const KNOWN_ROCKS = {
  "Sol Ring": { colors: ["C"], amount: 2 },
  "Mana Crypt": { colors: ["C"], amount: 2 },
  "Mana Vault": { colors: ["C"], amount: 3 },
  "Mind Stone": { colors: ["C"], amount: 1 },
  "Arcane Signet": { colors: ["W", "U", "B", "R", "G"], amount: 1 },
  "Fellwar Stone": { colors: ["W", "U", "B", "R", "G"], amount: 1 },
};

const COLOR_SET = new Set(MANA_COLORS);

function typeLineOf(card) {
  return String(card?.type || card?.type_line || "");
}

function oracleOf(card) {
  return String(card?.oracle || card?.oracle_text || "");
}

function hasHaste(card) {
  const kws = Array.isArray(card?.keywords) ? card.keywords : [];
  if (kws.some(k => String(k).toLowerCase() === "haste")) return true;
  return /\bhaste\b/i.test(oracleOf(card));
}

/**
 * Parse the first "Add ..." mana clause out of oracle text into
 * `{ colors, amount }`, or null if there's no mana production.
 *
 *   "Add {G}"                       → { colors: ["G"], amount: 1 }
 *   "Add {C}{C}"                    → { colors: ["C"], amount: 2 }  (concat, same color)
 *   "{T}: Add {W} or {U}."          → { colors: ["W","U"], amount: 1 }  ("or" = choice)
 *   "Add one mana of any color."    → { colors: ["W","U","B","R","G"], amount: 1 }
 *   "Add a +1/+1 counter"           → null (no mana symbols)
 */
function parseAddClause(oracle) {
  if (!/\badd\b/i.test(oracle)) return null;

  // "Add ... mana of any color" → any of the five colors.
  if (/add\b[^.]*\bmana of any( one)? color/i.test(oracle)) {
    return { colors: ["W", "U", "B", "R", "G"], amount: 1 };
  }

  const m = oracle.match(/Add ([^.]*)/i);
  if (!m) return null;
  const clause = m[1];
  const symbols = [...clause.matchAll(/\{([WUBRGC])\}/gi)].map(x => x[1].toUpperCase());
  if (symbols.length === 0) return null;

  const unique = [...new Set(symbols)];
  // " or " between symbols = the player CHOOSES one (amount 1, several options).
  // Plain concatenation ("{C}{C}") = produces all of them (amount = count).
  if (/\bor\b/i.test(clause)) {
    return { colors: unique, amount: 1 };
  }
  return { colors: unique, amount: symbols.length };
}

/**
 * What mana can this card's mana ability produce? Returns `{ colors, amount }`
 * or null if it isn't a mana source. Resolution order: basic-land name →
 * known-rock table → oracle "Add" parse → land fallback (colorless).
 */
export function manaProduction(card) {
  if (!card) return null;

  const name = String(card.name || "");
  const baseName = name.replace(/^Snow-Covered\s+/i, "").trim();
  if (BASIC_LAND_MANA[baseName]) {
    return { colors: [...BASIC_LAND_MANA[baseName]], amount: 1 };
  }
  if (KNOWN_ROCKS[name]) {
    return { colors: [...KNOWN_ROCKS[name].colors], amount: KNOWN_ROCKS[name].amount };
  }

  const fromOracle = parseAddClause(oracleOf(card));
  if (fromOracle) return fromOracle;

  // A land we couldn't otherwise parse still taps for something — assume
  // colorless so it can at least pay generic. Never invents a color.
  if (/\bLand\b/.test(typeLineOf(card))) {
    return { colors: ["C"], amount: 1 };
  }
  return null;
}

// ─── Battlefield → available sources ───────────────────────────────────────────

/**
 * Untapped permanents that can produce mana right now, as
 * `{ permanentId, colors, amount }`. Lands + non-creature rocks have no
 * summoning-sickness gate; creature dorks are excluded while summoning sick
 * (unless they have Haste).
 */
export function manaSources(state, playerId) {
  const player = state?.players?.[playerId];
  if (!player) return [];
  const sources = [];
  for (const perm of player.battlefield) {
    if (perm.tapped) continue;
    const prod = manaProduction(perm.card);
    if (!prod) continue;
    const isCreature = /Creature/.test(typeLineOf(perm.card));
    if (isCreature && perm.summoningSick && !hasHaste(perm.card)) continue;
    sources.push({ permanentId: perm.id, colors: prod.colors, amount: prod.amount });
  }
  return sources;
}

// ─── Payment planning ──────────────────────────────────────────────────────────

/**
 * Plan how to pay `cost` from the current `pool` plus tapping `sources`.
 * Returns `{ taps: [{ permanentId, color, amount }] }` (possibly empty when
 * the pool already covers the cost) or null when it can't be paid.
 *
 * The dispatcher commits the plan: for each tap, set the permanent tapped and
 * `addMana(color, amount)`, then deduct the full cost from the topped-up pool.
 * Surplus from an over-producing source (Sol Ring paying a single generic)
 * floats — which is exactly the floating-mana behavior we want.
 *
 * Greedy, most-constrained-source-first for colored pips. Hybrid pips pay the
 * cheapest colored side; phyrexian pips are assumed paid with life (not mana,
 * matching legalChoices.canPayManaCost); X counts as 0.
 */
export function planPayment(pool, sources, cost) {
  if (!cost) return { taps: [] };

  const working = {};
  for (const c of MANA_COLORS) working[c] = pool?.[c] || 0;

  const avail = sources.map(s => ({
    permanentId: s.permanentId,
    colors: s.colors.filter(c => COLOR_SET.has(c)),
    amount: s.amount || 1,
    used: false,
  }));
  const taps = [];

  // Tap the most-constrained untapped source that can make `color`.
  const tapForColor = (color) => {
    let best = -1;
    let bestLen = Infinity;
    for (let i = 0; i < avail.length; i++) {
      const s = avail[i];
      if (s.used || !s.colors.includes(color)) continue;
      if (s.colors.length < bestLen) {
        bestLen = s.colors.length;
        best = i;
      }
    }
    if (best === -1) return false;
    const s = avail[best];
    s.used = true;
    working[color] += s.amount;
    taps.push({ permanentId: s.permanentId, color, amount: s.amount });
    return true;
  };

  // Tap any remaining source (for generic). Returns the color it produced.
  const tapAny = () => {
    for (const s of avail) {
      if (s.used || s.colors.length === 0) continue;
      const color = s.colors[0];
      s.used = true;
      working[color] += s.amount;
      taps.push({ permanentId: s.permanentId, color, amount: s.amount });
      return color;
    }
    return null;
  };

  // 1. Colored + colorless pips (hardest to pay — do first).
  for (const color of ["W", "U", "B", "R", "G", "C"]) {
    let need = cost[color] || 0;
    while (need > 0) {
      if (working[color] > 0) { working[color] -= 1; need -= 1; continue; }
      if (tapForColor(color)) { working[color] -= 1; need -= 1; continue; }
      return null;
    }
  }

  // 2. Hybrid pips — pay one colored option.
  for (const options of cost.hybrid || []) {
    const colored = options.filter(o => COLOR_SET.has(o));
    let paid = false;
    for (const opt of colored) {
      if (working[opt] > 0) { working[opt] -= 1; paid = true; break; }
    }
    if (!paid) {
      for (const opt of colored) {
        if (tapForColor(opt)) { working[opt] -= 1; paid = true; break; }
      }
    }
    if (!paid) return null;
  }

  // 3. Generic — any mana works. Spend the pool first, then tap.
  let generic = cost.generic || 0;
  if (generic > 0) {
    for (const c of MANA_COLORS) {
      while (generic > 0 && working[c] > 0) { working[c] -= 1; generic -= 1; }
    }
  }
  while (generic > 0) {
    const color = tapAny();
    if (color === null) return null;
    while (generic > 0 && working[color] > 0) { working[color] -= 1; generic -= 1; }
  }

  return { taps };
}

/**
 * Can `cost` be paid from `pool` plus tapping `sources`? Pure — no mutation.
 * legalChoices uses this for cast-spell legality.
 */
export function canAfford(pool, sources, cost) {
  return planPayment(pool, sources, cost) !== null;
}

// Internal exports for tests.
export const _internals = { parseAddClause, hasHaste, BASIC_LAND_MANA, KNOWN_ROCKS };

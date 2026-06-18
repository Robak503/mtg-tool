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
 * Near-leaf: it imports constants from gameState plus `permanentHasKeyword` from
 * the layer engine (so a creature dork GRANTED Haste by an Aura/anthem can tap on
 * the turn it would otherwise be summoning-sick). It operates on already-parsed
 * cost objects (from legalChoices.parseManaCost), so there is no import cycle with
 * legalChoices, and layers imports none of these modules so that edge is acyclic too.
 */

import { MANA_COLORS, addMana, moveCardToZone, tapPermanent } from "./gameState.js";
import { permanentHasKeyword } from "./layers.js";

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

// Strip reminder text (parentheses). Used TYPE-AWARELY in manaProduction — see the note there.
function stripReminder(text) {
  return String(text || "").replace(/\([^)]*\)/g, " ");
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
 * Does this card's MANA ability pay for itself by SACRIFICING the source — a ONE-SHOT mana
 * artifact/token (Treasure / Gold / Lotus Petal) — rather than a repeatable tap source? True when the
 * line whose effect is the "Add …" clause carries "Sacrifice this/~" in its COST (left of the colon).
 * The mana subsystem sacrifices such a source on use instead of just tapping it, so it can't ramp
 * forever (the TOK-2 correctness invariant: a minted Treasure is one mana, then gone). Precise
 * per-line so a normal rock ("{T}: Add {C}") or dork ("{T}: Add {G}") is never flagged.
 */
function manaAbilitySacrificesSelf(oracle) {
  for (const line of String(oracle || "").split(/\n+/)) {
    const ci = line.indexOf(":");
    if (ci === -1) continue;
    if (/\badd\b/i.test(line.slice(ci + 1)) && /\bsacrifice (?:this|~)\b/i.test(line.slice(0, ci))) return true;
  }
  return false;
}

/**
 * What mana can this card's mana ability produce? Returns `{ colors, amount[, sacrifices] }`
 * or null if it isn't a mana source. Resolution order: basic-land name → known-rock table →
 * oracle "Add" parse → land fallback (colorless). `sacrifices:true` marks a one-shot source the
 * mana commit path sacrifices on use (Treasure / Gold) — only ever set on the oracle-parsed branch
 * (basics/known-rocks/land-fallback are all repeatable).
 *
 * Reminder text (parentheses) is read TYPE-AWARELY:
 *   - LAND: keep the raw oracle. The original dual lands / type-granting lands print their mana
 *     ability ENTIRELY as reminder text ("({T}: Add {W} or {U}.)" — Tundra, Badlands, shocklands,
 *     triomes), because the basic land types grant it intrinsically. Stripping there would drop the
 *     ability and the land would fall through to the colorless fallback (a {W}/{U} → {C} regression).
 *   - NON-LAND: strip reminder first. A creature/artifact whose only "Add … mana" text is in reminder
 *     is describing a TOKEN it creates ("…create a Treasure token. (It's an artifact with "{T},
 *     Sacrifice this token: Add one mana of any color.")" — Brazen Freebooter) or a keyword's mana
 *     (firebending) — NOT its own ability. Reading it would mis-offer the permanent as a tappable mana
 *     source in `manaSources`. A genuine rock/dork states its ability in MAIN text, so stripping never
 *     drops a real source. (Matches the coverage.hasManaAbility reminder fix; CR 207.2.)
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

  // Type-aware reminder handling (see the note above): lands keep the raw oracle (their reminder-text
  // ability is real), non-lands strip it (a reminder "Add … mana" describes a token/keyword, not their
  // own ability). The same `oracleForAdd` feeds the sacrifice-for-mana check so a Treasure (no reminder
  // parens) still flags `sacrifices`, while a token-MAKER's reminder no longer mints a phantom source.
  const isLandCard = /\bLand\b/.test(typeLineOf(card));
  const oracleForAdd = isLandCard ? oracleOf(card) : stripReminder(oracleOf(card));
  const fromOracle = parseAddClause(oracleForAdd);
  if (fromOracle) {
    return manaAbilitySacrificesSelf(oracleForAdd) ? { ...fromOracle, sacrifices: true } : fromOracle;
  }

  // A land we couldn't otherwise parse still taps for something — assume
  // colorless so it can at least pay generic. Never invents a color.
  if (isLandCard) {
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
    // GRANTED Haste counts (read through the layer engine), not just printed — a mana dork
    // enchanted/anthemed with Haste can tap the turn it enters. Falls back to the printed
    // seed when there are no continuous effects (the common case), so the hot path is cheap.
    if (isCreature && perm.summoningSick && !permanentHasKeyword(state, perm.id, "Haste")) continue;
    sources.push({ permanentId: perm.id, colors: prod.colors, amount: prod.amount, sacrifices: !!prod.sacrifices });
  }
  return sources;
}

// ─── Payment planning ──────────────────────────────────────────────────────────

/**
 * Plan how to pay `cost` from the current `pool` plus tapping `sources`.
 * Returns `{ taps: [{ permanentId, color, amount }], spend: {W,U,B,R,G,C} }`
 * or null when it can't be paid.
 *
 * `spend` is the EXACT per-color amount to remove from the topped-up pool —
 * the dispatcher applies the taps (`addMana`) then subtracts `spend` verbatim.
 * Returning the exact spend (rather than re-deriving payment with a second
 * heuristic) is what guarantees "affordable per planPayment" == "actually
 * paid": there's no algorithm divergence that could strand mana and throw.
 * Surplus from an over-producing source (Sol Ring on a single generic) floats.
 *
 * Greedy: colored pips are paid SCARCEST-COLOR-FIRST (fewest producing sources
 * first) from the most-constrained source, so the sole source of a color isn't
 * wasted on a more-flexible pip. Hybrid pips pay the cheapest colored side;
 * phyrexian pips are assumed paid with life (not mana, matching
 * legalChoices.canPayManaCost); X counts as 0. Pathological multicolor costs
 * fall to "can't afford" (null) — never to fabricated mana.
 */
export function planPayment(pool, sources, cost) {
  const spend = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };
  if (!cost) return { taps: [], spend };

  const working = {};
  for (const c of MANA_COLORS) working[c] = pool?.[c] || 0;

  const avail = sources.map(s => ({
    permanentId: s.permanentId,
    colors: s.colors.filter(c => COLOR_SET.has(c)),
    amount: s.amount || 1,
    sacrifices: !!s.sacrifices,   // one-shot source (Treasure/Gold) — the commit path sacrifices it
    used: false,
  }));
  const taps = [];
  const spendOne = (color) => { working[color] -= 1; spend[color] += 1; };

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
    taps.push({ permanentId: s.permanentId, color, amount: s.amount, ...(s.sacrifices && { sacrifices: true }) });
    return true;
  };

  // Tap any remaining source (for generic). Returns the color it produced. Prefers a REPEATABLE
  // source over a one-shot sacrifice source (Treasure/Gold) so we never crack a Treasure for generic
  // while an untapped land/rock could pay it — a play-quality refinement, not a legality change.
  const tapAny = () => {
    for (const preferSac of [false, true]) {
      for (const s of avail) {
        if (s.used || s.colors.length === 0 || !!s.sacrifices !== preferSac) continue;
        const color = s.colors[0];
        s.used = true;
        working[color] += s.amount;
        taps.push({ permanentId: s.permanentId, color, amount: s.amount, ...(s.sacrifices && { sacrifices: true }) });
        return color;
      }
    }
    return null;
  };

  // 1. Colored + colorless pips, scarcest color first. Scarcity = how many
  // sources (plus current pool) can produce it; paying the scarce color first
  // avoids stranding the only source of a color on a more-flexible pip.
  const producerCount = (color) =>
    (working[color] || 0) + avail.filter(s => !s.used && s.colors.includes(color)).length;
  const coloredNeeded = ["W", "U", "B", "R", "G", "C"].filter(c => (cost[c] || 0) > 0);
  coloredNeeded.sort((a, b) => producerCount(a) - producerCount(b));

  for (const color of coloredNeeded) {
    let need = cost[color] || 0;
    while (need > 0) {
      if (working[color] > 0) { spendOne(color); need -= 1; continue; }
      if (tapForColor(color)) { spendOne(color); need -= 1; continue; }
      return null;
    }
  }

  // 2. Hybrid pips — pay one colored option.
  for (const options of cost.hybrid || []) {
    const colored = options.filter(o => COLOR_SET.has(o));
    let paid = false;
    for (const opt of colored) {
      if (working[opt] > 0) { spendOne(opt); paid = true; break; }
    }
    if (!paid) {
      for (const opt of colored) {
        if (tapForColor(opt)) { spendOne(opt); paid = true; break; }
      }
    }
    if (!paid) return null;
  }

  // 3. Generic — any mana works. Spend the pool first, then tap.
  let generic = cost.generic || 0;
  if (generic > 0) {
    for (const c of MANA_COLORS) {
      while (generic > 0 && working[c] > 0) { spendOne(c); generic -= 1; }
    }
  }
  while (generic > 0) {
    const color = tapAny();
    if (color === null) return null;
    while (generic > 0 && working[color] > 0) { spendOne(color); generic -= 1; }
  }

  return { taps, spend };
}

/**
 * Can `cost` be paid from `pool` plus tapping `sources`? Pure — no mutation.
 * legalChoices uses this for cast-spell legality.
 */
export function canAfford(pool, sources, cost) {
  return planPayment(pool, sources, cost) !== null;
}

/**
 * SOFT-CNT — pay a FIXED generic cost of `amount` from `playerId`'s pool + untapped mana sources
 * (the "unless its controller pays {N}" escape on Force Spike / Mana Leak / …). Plans the payment with
 * `planPayment` (the SAME planner the cast path uses, so "affordable" == "actually paid" — no second
 * heuristic that could strand mana), commits the taps — add each source's mana then TAP it, or SACRIFICE
 * a one-shot Treasure/Gold (`tap.sacrifices`) — then subtracts the spend. Returns `{ state, paid }`:
 * `paid:false` with state UNCHANGED when the player can't afford it (the caller then counters the spell),
 * never fabricated mana. `amount <= 0` is a trivial `paid:true` no-op. Mirrors actionDispatcher's
 * `commitManaTaps` + spend-deduction; kept here (a leaf) so the resolution layer can pay without importing
 * the dispatcher (which would cycle).
 */
export function payGenericMana(state, playerId, amount) {
  const n = Math.max(0, Math.trunc(Number(amount) || 0));
  if (n === 0) return { state, paid: true };
  const player = state?.players?.[playerId];
  if (!player) return { state, paid: false };
  const plan = planPayment(player.manaPool, manaSources(state, playerId), { generic: n });
  if (!plan) return { state, paid: false };
  let next = state;
  for (const tap of plan.taps) {
    next = addMana(next, { playerId, color: tap.color, amount: tap.amount });
    next = tap.sacrifices
      ? moveCardToZone(next, { playerId, fromZone: "battlefield", toZone: "graveyard", cardId: tap.permanentId })
      : tapPermanent(next, tap.permanentId);
  }
  const topped = next.players[playerId].manaPool;
  const nextPool = {};
  for (const c of Object.keys(topped)) nextPool[c] = (topped[c] || 0) - (plan.spend?.[c] || 0);
  next = { ...next, players: { ...next.players, [playerId]: { ...next.players[playerId], manaPool: nextPool } } };
  return { state: next, paid: true };
}

// Internal exports for tests.
export const _internals = { parseAddClause, hasHaste, BASIC_LAND_MANA, KNOWN_ROCKS };

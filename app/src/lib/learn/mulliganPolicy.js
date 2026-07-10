/**
 * mulliganPolicy.js — the playbook-parameterized London mulligan (SIM-INTEGRITY Phase 2,
 * Omnath's spec, Colton-approved 2026-07-09) + the evaluator-ranked bottom-picker.
 *
 * Replaces the poison filter (`(lands<2||lands>5) && ships<2` — no spells, no colors, no curve:
 * every deck kept hands no human keeps) with a real policy, pure and deterministic:
 * zero RNG, zero tokens, a function of (hand, playbook, ships) only.
 *
 * KEEP RULE (v1): keep iff
 *   landEquivalents in the playbook's land window
 *   AND castableEarly ≥ the playbook's floor (color-aware: a spell whose pips this hand's own
 *       sources can't pay counts 0)
 *   AND (the hand DOES SOMETHING or ships ≥ the desperation depth)
 *   — plus each playbook's piece requirement (value-control wants interaction/draw, voltron a
 *     threat piece, combo ships keepable-but-LINELESS hands after the first ship).
 * A seat never ships below its playbook's MIN KEEP SIZE (the ship floor: 7-ships must stay ≥ it).
 *
 * BOTTOM RANKING: on keep after N ships, bottom the N WORST cards — excess lands beyond the
 * window first, then uncastable-early spells by highest mana value. Deterministic (stable
 * index tiebreak). Closes the gameEngine TODO(mulligan-bottom-picker) tail-bottom.
 *
 * v1 thresholds are Omnath's table verbatim; tuned post-validation against his golden hands
 * (~20 labeled keep/ship hands per playbook, Colton-eyeballed — the one human gate).
 */

const asText = (c) => String(c?.oracle ?? c?.oracle_text ?? "");
const typeOf = (c) => String(c?.type ?? c?.type_line ?? "");
const isLand = (c) => /\bLand\b/.test(typeOf(c));
const mvOf = (c) => (Number.isFinite(c?.cmc) ? c.cmc : manaValueFromCost(String(c?.mana ?? c?.mana_cost ?? "")));

function manaValueFromCost(cost) {
  let mv = 0;
  for (const m of cost.matchAll(/\{([^}]+)\}/g)) {
    const sym = m[1];
    if (/^\d+$/.test(sym)) mv += Number(sym);
    else if (sym !== "X") mv += 1; // colored/hybrid/phyrexian pips count 1 (CR 203.3)
  }
  return mv;
}

const COLOR_LETTERS = ["W", "U", "B", "R", "G"];

/** Colors a card's cost REQUIRES (pip letters present in its mana cost). */
function requiredColors(c) {
  const cost = String(c?.mana ?? c?.mana_cost ?? "");
  return COLOR_LETTERS.filter((L) => new RegExp(`\\{[^}]*${L}[^}]*\\}`).test(cost));
}

/** Colors this hand's own sources can produce (lands' text/types + cheap producers). */
function producibleColors(hand) {
  const out = new Set();
  for (const c of hand) {
    const t = typeOf(c);
    const o = asText(c);
    if (isLand(c)) {
      if (/Plains/.test(t) || /Add \{W\}|\{T\}: Add \{W\}/.test(o)) out.add("W");
      if (/Island/.test(t) || /Add \{U\}/.test(o)) out.add("U");
      if (/Swamp/.test(t) || /Add \{B\}/.test(o)) out.add("B");
      if (/Mountain/.test(t) || /Add \{R\}/.test(o)) out.add("R");
      if (/Forest/.test(t) || /Add \{G\}/.test(o)) out.add("G");
      if (/add one mana of any color|any color of mana/i.test(o)) COLOR_LETTERS.forEach((L) => out.add(L));
    } else if (isProducer(c)) {
      for (const L of COLOR_LETTERS) if (new RegExp(`Add \\{${L}\\}`).test(o)) out.add(L);
      if (/add one mana of any color|any color/i.test(o)) COLOR_LETTERS.forEach((L) => out.add(L));
    }
  }
  return out;
}

/** A rock/dork/land-ramper castable at ≤2 MV — counts 0.5 land-equivalents toward development. */
export function isProducer(c) {
  if (isLand(c) || mvOf(c) > 2) return false;
  const o = asText(c);
  return /\{T\}: Add |Add \{|search your library for .{0,40}land/i.test(o);
}

/** Castable by ~T3 on this hand's own sources: MV ≤ 3 AND every required pip producible here. */
function castableEarlyCount(hand) {
  const colors = producibleColors(hand);
  let n = 0;
  for (const c of hand) {
    if (isLand(c) || mvOf(c) > 3) continue;
    if (requiredColors(c).every((L) => colors.has(L))) n += 1;
  }
  return n;
}

const isDraw = (c) => /draw (a card|two|cards|that many)/i.test(asText(c));
const isInteraction = (c) => /counter target|destroy target|exile target|deals? \d+ damage to (target|any)/i.test(asText(c));
const isTutorOrEngine = (c) =>
  /search your library for a/i.test(asText(c)) ||
  /whenever .{0,60}, draw a card/i.test(asText(c));
const isVoltronPiece = (c) => /\bEquipment\b|\bAura\b/.test(typeOf(c)) || /attach|equip/i.test(asText(c));

/** ≥1 of: a cheap draw/ramp/interaction piece, or a curve play on 2 consecutive early turns. */
function doesSomething(hand) {
  if (hand.some((c) => !isLand(c) && mvOf(c) <= 3 && (isDraw(c) || isInteraction(c) || isProducer(c)))) return true;
  const mvs = new Set(hand.filter((c) => !isLand(c)).map(mvOf));
  return (mvs.has(1) && mvs.has(2)) || (mvs.has(2) && mvs.has(3));
}

/**
 * v1 playbook parameters (Omnath's table). window = 7-card land-equivalent window;
 * floor = castableEarly minimum; minKeep = ship floor (never ship below this keep size);
 * piece = the playbook's extra requirement.
 */
export const PLAYBOOK_MULLIGAN_PARAMS = Object.freeze({
  "ramp":          { window: [3, 5],     floor: 1, minKeep: 5, piece: null },
  "go-wide":       { window: [2.5, 4.5], floor: 2, minKeep: 5, piece: null },
  "aristocrats":   { window: [2.5, 4.5], floor: 2, minKeep: 5, piece: null },
  "value-control": { window: [3, 5],     floor: 1, minKeep: 5, piece: "interaction-or-draw" },
  "voltron":       { window: [2.5, 4.5], floor: 2, minKeep: 5, piece: "voltron" },
  "combo":         { window: [2.5, 4.5], floor: 2, minKeep: 4, piece: "line" },
});

/** Score one hand for a playbook. Exported for tests + the golden-hand validation run. */
export function evaluateHand(hand, playbook, ships = 0) {
  const p = PLAYBOOK_MULLIGAN_PARAMS[playbook] || PLAYBOOK_MULLIGAN_PARAMS["ramp"];
  const landEq = hand.filter(isLand).length + 0.5 * hand.filter(isProducer).length;
  const castable = castableEarlyCount(hand);
  const maxShips = 7 - p.minKeep; // shipping past this would keep < minKeep cards
  const desperation = maxShips;   // at the last allowed ship, waive the does-something demand

  let keep =
    landEq >= p.window[0] && landEq <= p.window[1] &&
    castable >= p.floor &&
    (doesSomething(hand) || ships >= desperation);

  if (keep && p.piece === "interaction-or-draw") {
    keep = hand.some((c) => !isLand(c) && mvOf(c) <= 3 && (isInteraction(c) || isDraw(c)));
  }
  if (keep && p.piece === "voltron") {
    keep = hand.some((c) => isVoltronPiece(c) || (/\bCreature\b/.test(typeOf(c)) && mvOf(c) <= 3));
  }
  if (keep && p.piece === "line" && ships >= 1) {
    // combo ships keepable-but-LINELESS hands: after the first ship, demand a tutor/engine piece.
    keep = hand.some((c) => !isLand(c) && isTutorOrEngine(c));
  }
  // Never ship below the playbook's minimum keep size.
  if (!keep && ships >= maxShips) keep = true;
  return { keep, landEq, castable, maxShips };
}

/**
 * The pilot-seam decideMulligan for a playbook — plugs runMulliganPhaseForSeat unchanged:
 * `({ state, legalActions, seat }) => {kind:"mulligan-keep"|"mulligan-ship"}`.
 */
export function makeMulliganPolicy(playbook) {
  return function decideMulligan({ state, legalActions, seat }) {
    const offered = Array.isArray(legalActions) ? legalActions : [];
    const keepAction = offered.find((a) => a?.kind === "mulligan-keep") || { kind: "mulligan-keep" };
    const shipAction = offered.find((a) => a?.kind === "mulligan-ship");
    if (!shipAction) return keepAction;
    const hand = state?.players?.[seat]?.hand || [];
    const ships = (state?.log || []).filter((e) => e?.kind === "mulligan-ship" && e?.player === seat).length;
    return evaluateHand(hand, playbook, ships).keep ? keepAction : shipAction;
  };
}

/**
 * BOTTOM-PICKER (closes gameEngine's TODO): on keep after N ships, choose the N WORST card ids
 * to bottom — excess lands beyond the window (scaled to the kept size) first, then the worst
 * spells (uncastable-early first, then highest MV). Deterministic: stable index tiebreak.
 * Always returns exactly `count` ids from `hand` (the deck-size invariant is the caller's —
 * this never invents or drops an id).
 */
export function rankBottomCandidates(hand, count, playbook = null) {
  if (count <= 0 || !Array.isArray(hand) || hand.length === 0) return [];
  const n = Math.min(count, hand.length);
  const p = PLAYBOOK_MULLIGAN_PARAMS[playbook] || { window: [3, 5] };
  const keepSize = hand.length - n;
  const windowMid = (p.window[0] + p.window[1]) / 2;
  const targetLands = Math.round(windowMid * (keepSize / 7));

  const colors = producibleColors(hand);
  const indexed = hand.map((c, i) => ({ c, i }));
  const lands = indexed.filter(({ c }) => isLand(c));
  const spells = indexed.filter(({ c }) => !isLand(c));

  const picks = [];
  // 1) excess lands beyond the scaled target (later duplicates first — stable + keeps the first copies).
  const excessLands = Math.max(0, lands.length - targetLands);
  for (const { c, i } of lands.slice(lands.length - excessLands)) picks.push({ c, i });
  // 2) worst spells: uncastable-early first, then highest MV, then latest position.
  const rankedSpells = [...spells].sort((a, b) => {
    const aCast = mvOf(a.c) <= 3 && requiredColors(a.c).every((L) => colors.has(L)) ? 1 : 0;
    const bCast = mvOf(b.c) <= 3 && requiredColors(b.c).every((L) => colors.has(L)) ? 1 : 0;
    if (aCast !== bCast) return aCast - bCast;            // uncastable first
    if (mvOf(a.c) !== mvOf(b.c)) return mvOf(b.c) - mvOf(a.c); // highest MV first
    return b.i - a.i;                                     // latest position first (deterministic)
  });
  for (const s of rankedSpells) {
    if (picks.length >= n) break;
    picks.push(s);
  }
  // 3) still short (all-lands hands below target): take remaining lands, latest first.
  if (picks.length < n) {
    const taken = new Set(picks.map((x) => x.i));
    for (let i = hand.length - 1; i >= 0 && picks.length < n; i--) {
      if (!taken.has(i)) picks.push({ c: hand[i], i });
    }
  }
  return picks.slice(0, n).map(({ c }) => c.id);
}

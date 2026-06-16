/**
 * layers.js — the CR 613 continuous-effects / layers engine (Phase-7 PR-9).
 *
 * The single source of truth for a permanent's EFFECTIVE characteristics
 * (power/toughness/keywords/colors/types) once every continuous effect is
 * applied in CR 613 layer order. Replaces the old "printed + counters +
 * staticPTModifier" arithmetic with a real layer pass that anthems, tribal lords
 * (Slivers), granted keywords, and until-end-of-turn pump all flow through.
 *
 * CYCLE DISCIPLINE (eng-review F3): this module imports ONLY `ptPrimitive` (the
 * printed+counters math) and `keywords` (the printed-keyword primitive) and
 * `staticAbilityParser`. It NEVER imports `gameState` — `gameState.creaturePower`
 * delegates OUTWARD to `permanentPower` here (PR-11), so the edge stays
 * one-directional. Board scans (find a permanent, iterate battlefields) are
 * re-implemented locally rather than imported, precisely to keep this a leaf of
 * `gameState`.
 *
 * CR grounding (verified against cr_current.json): layer order 613.1a–g; CDAs
 * first within a layer 613.3 / 613.4a; layer-7 sublayers 613.4 (7a CDA, 7b set,
 * 7c modify+counters, 7d switch); timestamps 613.7; counters in 7c (613.4c) and
 * keyword counters in layer 6 (613.1f); duration/expiry 514.2 / 500.4. Layers
 * 1–3 (copy/control/text) are explicit no-op pass-throughs reserved for later.
 *
 * PURITY + PERF: every mutator returns new state; reads never mutate. A WeakMap
 * keyed on the (immutable) state object memoizes the board-level effect
 * collection and the per-permanent derive, so the common no-effect board pays
 * ≈ the old O(1) cost (empty-board fast path) and a buffed 4P board derives each
 * permanent once per state.
 */

import {
  printedPower,
  printedToughness,
  counterPtDelta,
} from "./ptPrimitive.js";
import { hasKeyword, COMBAT_KEYWORDS } from "./keywords.js";
import { parseStaticAbilities, parseEquipmentBonus } from "./staticAbilityParser.js";

// ─── Dynamic P/T functions (CR 613 CDA-style values; code, NEVER stored in state) ─

/**
 * Named P/T functions for effects whose magnitude depends on live state. Encoded
 * as a string key (`op.fn`) in the descriptor so `state` stays plain JSON (the
 * Phase-7 serialization mandate) — the function lives here in code, not in state.
 */
export const DYNAMIC_PT_FNS = {
  // Omnath, Locus of Mana: +1/+1 for each unspent green mana you have.
  omnathGreen: (state, sourcePerm) => {
    const green = state?.players?.[sourcePerm?.controller]?.manaPool?.G || 0;
    return { power: green, toughness: green };
  },
};

/**
 * Static-ability registry for the handful of cards whose effect is exact and
 * stateful enough to express directly rather than via the oracle parser. Keyed by
 * card name → array of partial descriptors (sans id/timestamp/source). Omnath
 * ports here from cardEffects.staticPTModifier (PR-11 stops gameState calling the
 * old shim; the value comes from this layer-7c dynamic descriptor instead).
 */
const STATIC_REGISTRY = {
  "Omnath, Locus of Mana": [
    {
      layer: 7,
      sublayer: "7c",
      op: { layerOp: "ptModifyDynamic", fn: "omnathGreen" },
      affects: { mode: "self" },
      duration: { kind: "permanent" },
    },
  ],
};

// ─── Local board helpers (no gameState import → no cycle) ────────────────────────

function findPerm(state, permanentId) {
  for (const pid of Object.keys(state?.players || {})) {
    const found = (state.players[pid].battlefield || []).find(p => p.id === permanentId);
    if (found) return found;
  }
  return null;
}

function eachPermanent(state) {
  const out = [];
  for (const pid of Object.keys(state?.players || {})) {
    for (const p of state.players[pid].battlefield || []) out.push(p);
  }
  return out;
}

function typeLineOf(card) {
  return String(card?.type || card?.type_line || "");
}

function subtypesOf(card) {
  const line = typeLineOf(card);
  const dash = line.indexOf("—");
  if (dash === -1) return [];
  return line.slice(dash + 1).trim().split(/\s+/).filter(Boolean);
}

const COLOR_PIPS = ["W", "U", "B", "R", "G"];
function colorsOf(card) {
  if (Array.isArray(card?.colors)) return card.colors.map(String);
  const cost = String(card?.mana || card?.mana_cost || "");
  return COLOR_PIPS.filter(c => cost.includes(`{${c}}`));
}

// ─── Effect collection (board-level: static + resolution effects) ───────────────

const _boardMemo = new WeakMap();
// Test-visible counter so a memoization test can assert the expensive collection
// runs once per distinct state object. Bumped only by the un-memoized core.
export const _layerStats = { collectRuns: 0 };
export function _resetLayerStatsForTests() {
  _layerStats.collectRuns = 0;
}

/**
 * For ONE permanent, the continuous effects its static abilities generate
 * (anthems/lords/Omnath). Reads the exact registry first, then the bounded oracle
 * parser. Fills `source` (kind:"static") + `timestamp` (from the source
 * permanent's ETB timestamp, 613.7e). Pure; returns []. Phase-2 grows this.
 */
export function staticEffectsOf(state, permanent) {
  const card = permanent?.card;
  if (!card) return [];
  const partials = [
    ...(STATIC_REGISTRY[card.name] || []),
    ...parseStaticAbilities(card),
  ];
  // Equipment bonus (CR 301.5): when this permanent is ATTACHED to a creature, its
  // "Equipped creature gets +X/+Y / has [keyword]" effect applies ONLY to that creature
  // (affects fixed [attachedTo]). collectContinuousEffects re-runs per state, so the
  // bonus appears/disappears the instant attachedTo changes — no manual refresh.
  if (permanent.attachedTo) {
    for (const e of parseEquipmentBonus(card)) {
      partials.push({ ...e, affects: { mode: "fixed", permanentIds: [permanent.attachedTo] } });
    }
  }
  if (!partials.length) return [];
  const timestamp = Number.isFinite(permanent.timestamp) ? permanent.timestamp : 0;
  return partials.map(p => ({
    ...p,
    sublayer: p.sublayer ?? null,
    isCDA: !!p.isCDA,
    timestamp,
    source: { kind: "static", permanentId: permanent.id, cardName: card.name || null },
    // "self" affect spec resolves to the source permanent's id at collection time.
    affects: p.affects?.mode === "self"
      ? { mode: "self", permanentId: permanent.id }
      : p.affects,
  }));
}

/**
 * Every continuous effect applicable to ANY permanent right now: each
 * permanent's synthesized static-ability effects + the stored resolution effects
 * (state.continuousEffects, e.g. pump-until-EOT). Counters are NOT collected here
 * — they're per-permanent and read directly in the derive, which keeps this
 * board-level result shared across all permanents (and the empty-board fast path
 * cheap). Memoized by state identity (immutable state ⇒ key changes iff state
 * changes). Pure.
 */
export function collectContinuousEffects(state) {
  if (!state) return [];
  if (_boardMemo.has(state)) return _boardMemo.get(state);
  _layerStats.collectRuns += 1;
  const effects = [];
  for (const perm of eachPermanent(state)) {
    const fx = staticEffectsOf(state, perm);
    if (fx.length) effects.push(...fx);
  }
  for (const e of state.continuousEffects || []) effects.push(e);
  _boardMemo.set(state, effects);
  return effects;
}

// ─── Affect-spec evaluation (does effect E apply to permanent P?) ───────────────

function matchesSelector(selector, candidate, sourcePerm) {
  if (!selector) return false;
  const srcController = sourcePerm?.controller;
  switch (selector.controllerScope) {
    case "you":
      if (candidate.controller !== srcController) return false;
      break;
    case "opponents":
      if (candidate.controller === srcController) return false;
      break;
    // "each" (or unspecified) → any controller
    default:
      break;
  }
  if (selector.excludeSelf && sourcePerm && candidate.id === sourcePerm.id) return false;
  if (selector.cardTypes) {
    const line = typeLineOf(candidate.card);
    if (!selector.cardTypes.every(t => line.includes(t))) return false;
  }
  if (selector.subtypes) {
    const subs = subtypesOf(candidate.card).map(s => s.toLowerCase());
    if (!selector.subtypes.some(st => subs.includes(String(st).toLowerCase()))) return false;
  }
  if (selector.colors) {
    const cols = colorsOf(candidate.card);
    if (!selector.colors.some(c => cols.includes(c))) return false;
  }
  return true;
}

/** Does continuous effect `effect` apply to `candidate` in the current state? */
function effectAffects(effect, candidate, state) {
  const affects = effect.affects;
  if (!affects) return false;
  switch (affects.mode) {
    case "self":
      return affects.permanentId === candidate.id;
    case "fixed":
      return Array.isArray(affects.permanentIds) && affects.permanentIds.includes(candidate.id);
    case "dynamic": {
      const sourcePerm = effect.source?.permanentId
        ? findPerm(state, effect.source.permanentId)
        : null;
      // A dynamic (static-ability) effect needs its source on the battlefield.
      if (effect.source?.kind === "static" && !sourcePerm) return false;
      return matchesSelector(affects.selector, candidate, sourcePerm);
    }
    default:
      return false;
  }
}

function byTimestamp(a, b) {
  return (a.timestamp || 0) - (b.timestamp || 0);
}

// ─── Per-permanent derive ───────────────────────────────────────────────────────

const _charMemo = new WeakMap();

// Characteristics for an unknown/off-battlefield permanent. A FRESH object with
// fresh nested containers per call — never a shared frozen singleton, because the
// keywords Set / arrays are mutable by shape and a shared instance would leak
// mutations across every unknown-perm derive (copiableValues reserved for CR 707).
function makeEmptyChars(permanentId) {
  return {
    permanentId,
    power: 0,
    toughness: 0,
    basePower: 0,
    baseToughness: 0,
    keywords: new Set(),
    types: [],
    subtypes: [],
    colors: [],
    appliedEffects: [],
    copiableValues: null,
  };
}

/**
 * Apply the layer-7 sublayers (7a CDA → 7b set → 7c modify+counters → 7d switch)
 * for one permanent, given the layer-7 effects that affect it. Counters (613.4c)
 * are folded into 7c. Additive 7c ops commute, so their fold order is immaterial;
 * 7b/7d are timestamp-ordered. Returns {power, toughness, basePower, baseToughness}.
 */
function applyLayer7(state, perm, l7Effects) {
  let basePower = printedPower(perm);
  let baseToughness = printedToughness(perm);

  // 7a — characteristic-defining P/T (none modeled in Phase 1; reserved).
  // 7b — set base P/T ("base power/toughness becomes X/Y").
  for (const e of l7Effects.filter(e => e.sublayer === "7b").sort(byTimestamp)) {
    if (e.op.power != null) basePower = e.op.power;
    if (e.op.toughness != null) baseToughness = e.op.toughness;
  }

  let power = basePower;
  let toughness = baseToughness;

  // 7c — modifications (counters + anthems + dynamic). All additive ⇒ commute.
  const delta = counterPtDelta(perm);
  power += delta;
  toughness += delta;
  for (const e of l7Effects.filter(e => e.sublayer === "7c")) {
    if (e.op.layerOp === "ptModify") {
      power += e.op.power || 0;
      toughness += e.op.toughness || 0;
    } else if (e.op.layerOp === "ptModifyDynamic") {
      const src = (e.source?.permanentId && findPerm(state, e.source.permanentId)) || perm;
      const fn = DYNAMIC_PT_FNS[e.op.fn];
      if (fn) {
        const d = fn(state, src) || {};
        power += d.power || 0;
        toughness += d.toughness || 0;
      }
    }
  }

  // 7d — switch power and toughness.
  for (const e of l7Effects.filter(e => e.sublayer === "7d").sort(byTimestamp)) {
    void e;
    const t = power;
    power = toughness;
    toughness = t;
  }

  return { power, toughness, basePower, baseToughness };
}

/** Printed keyword set (the seed for layer 6), from the printed-keyword primitive. */
function printedKeywords(card) {
  const out = new Set();
  for (const kw of COMBAT_KEYWORDS) {
    if (hasKeyword(card, kw)) out.add(kw.toLowerCase());
  }
  return out;
}

/**
 * Derive a permanent's full effective characteristics by applying all continuous
 * effects in CR 613 layer order. Memoized per (state, permanentId). Pure.
 *
 * Fast path: when no board-level effect applies to this permanent, return printed
 * values + counters directly (value-identical to the legacy accessor) without
 * scanning keywords/types/colors — so a no-effect board pays ≈ the old cost.
 */
export function deriveCharacteristics(state, permanentId) {
  // Memo check first (keyed by the immutable state object) so repeated reads for
  // the same (state, id) skip even the board scan.
  let permMemo = _charMemo.get(state);
  if (permMemo?.has(permanentId)) return permMemo.get(permanentId);

  const perm = findPerm(state, permanentId);
  if (!perm) return makeEmptyChars(permanentId); // fresh containers; not memoized (rare)

  if (!permMemo) {
    permMemo = new Map();
    _charMemo.set(state, permMemo);
  }

  const board = collectContinuousEffects(state);
  const selfEffects = board.length ? board.filter(e => effectAffects(e, perm, state)) : [];

  let result;
  if (selfEffects.length === 0) {
    // Fast path — no continuous effects touch this permanent. Printed + counters.
    const delta = counterPtDelta(perm);
    result = {
      permanentId,
      power: printedPower(perm) + delta,
      toughness: printedToughness(perm) + delta,
      basePower: printedPower(perm),
      baseToughness: printedToughness(perm),
      keywords: keywordSet(perm, []),
      types: cardTypesOf(perm.card),
      subtypes: subtypesOf(perm.card),
      colors: colorsOf(perm.card),
      appliedEffects: [],
      copiableValues: null,
    };
  } else {
    // Full path. Layers 1–3 (copy/control/text) are no-op pass-throughs.
    const l7 = selfEffects.filter(e => e.layer === 7);
    const l6 = selfEffects.filter(e => e.layer === 6);
    const l5 = selfEffects.filter(e => e.layer === 5);
    const l4 = selfEffects.filter(e => e.layer === 4);
    const pt = applyLayer7(state, perm, l7);
    result = {
      permanentId,
      power: pt.power,
      toughness: pt.toughness,
      basePower: pt.basePower,
      baseToughness: pt.baseToughness,
      keywords: keywordSet(perm, l6),
      ...applyTypeColorLayers(perm, l4, l5),
      appliedEffects: selfEffects.map(e => ({
        id: e.id, layer: e.layer, sublayer: e.sublayer || null,
        op: e.op, sourceCardName: e.source?.cardName || null,
      })),
      copiableValues: null,
    };
  }

  permMemo.set(permanentId, result);
  return result;
}

function cardTypesOf(card) {
  const line = typeLineOf(card);
  const head = line.split("—")[0];
  return head.trim().split(/\s+/).filter(w => w && w[0] === w[0].toUpperCase());
}

/** Layer 4 (type) + layer 5 (color), additive in Phase 1. */
function applyTypeColorLayers(perm, l4, l5) {
  const types = new Set(cardTypesOf(perm.card));
  const subtypes = new Set(subtypesOf(perm.card));
  for (const e of l4) {
    for (const t of e.op.types || []) types.add(t);
    for (const st of e.op.subtypes || []) subtypes.add(st);
  }
  let colors = new Set(colorsOf(perm.card));
  for (const e of l5.slice().sort(byTimestamp)) {
    if (e.op.layerOp === "setColor") colors = new Set(e.op.colors || []);
    else if (e.op.layerOp === "addColor") for (const c of e.op.colors || []) colors.add(c);
  }
  return { types: [...types], subtypes: [...subtypes], colors: [...colors] };
}

/**
 * Effective keyword set: printed seed ∪ keyword counters ∪ layer-6 grants, minus
 * layer-6 removals (timestamp-ordered, 613.9 last-wins). Keywords stored
 * lowercased for case-insensitive membership.
 */
function keywordSet(perm, l6Effects) {
  const set = printedKeywords(perm.card);
  // Keyword counters (613.1f), e.g. counters.flying > 0.
  for (const kw of COMBAT_KEYWORDS) {
    if ((perm.counters?.[kw.toLowerCase()] || 0) > 0) set.add(kw.toLowerCase());
  }
  for (const e of l6Effects.slice().sort(byTimestamp)) {
    const kw = String(e.op.keyword || "").toLowerCase();
    if (!kw) continue;
    if (e.op.layerOp === "addKeyword") set.add(kw);
    else if (e.op.layerOp === "removeKeyword") set.delete(kw);
  }
  return set;
}

// ─── Public accessors (the thin readers combat/legality/AI call) ────────────────

/** Effective power (true CR value — can be negative; callers floor where rules say). */
export function permanentPower(state, permanentId) {
  return deriveCharacteristics(state, permanentId).power;
}

/** Effective toughness (true CR value — can be ≤ 0; the SBA reads it raw). */
export function permanentToughness(state, permanentId) {
  return deriveCharacteristics(state, permanentId).toughness;
}

/**
 * Does the permanent have `keyword` after layer 6? Seeds from the printed
 * primitive (keywords.hasKeyword — imported, NEVER shadowed) and unions granted
 * keywords + keyword counters. Optimized: on a board with no static/resolution
 * effects, short-circuits to the printed seed (+ counter) so the combat hot path
 * pays ≈ the old cost.
 */
export function permanentHasKeyword(state, permanentId, keyword) {
  if (!keyword) return false;
  const perm = findPerm(state, permanentId);
  if (!perm) return false;
  const kwLower = String(keyword).toLowerCase();
  const printed = hasKeyword(perm.card, keyword);
  const fromCounter = (perm.counters?.[kwLower] || 0) > 0;
  const board = collectContinuousEffects(state);
  if (board.length === 0) return printed || fromCounter;
  const l6 = board.filter(e => e.layer === 6 && effectAffects(e, perm, state)).sort(byTimestamp);
  if (l6.length === 0) return printed || fromCounter;
  let has = printed || fromCounter;
  for (const e of l6) {
    if (String(e.op.keyword || "").toLowerCase() !== kwLower) continue;
    if (e.op.layerOp === "addKeyword") has = true;
    else if (e.op.layerOp === "removeKeyword") has = false;
  }
  return has;
}

/** Effective colors (after layer 5). */
export function permanentColors(state, permanentId) {
  return deriveCharacteristics(state, permanentId).colors;
}

/** Effective types/subtypes (after layer 4). */
export function permanentTypes(state, permanentId) {
  const c = deriveCharacteristics(state, permanentId);
  return { types: c.types, subtypes: c.subtypes };
}

/**
 * Convenience used by tests/explain: the ordered effects that apply to a
 * permanent (layer asc, then CDA-first, then timestamp). Pure.
 */
export function orderEffectsForPermanent(effects, permanentId, state) {
  const perm = findPerm(state, permanentId);
  if (!perm) return [];
  return effects
    .filter(e => effectAffects(e, perm, state))
    .slice()
    .sort((a, b) =>
      (a.layer - b.layer) ||
      (Number(b.isCDA) - Number(a.isCDA)) ||
      sublayerRank(a.sublayer) - sublayerRank(b.sublayer) ||
      byTimestamp(a, b),
    );
}

function sublayerRank(s) {
  switch (s) {
    case "7a": return 0;
    case "7b": return 1;
    case "7c": return 2;
    case "7d": return 3;
    default: return 0;
  }
}

// ─── Resolution-effect mutators (called by Stack resolvers — Phase 2 pump) ───────

/**
 * Append a resolution-generated continuous effect (e.g. Giant Growth's +3/+3
 * until end of turn). Mints a deterministic `ceff-<idSeq>` id and stamps the
 * timestamp from state.timestampCounter (CR 613.7b). Returns {state, effectId}.
 * Pure; threads both counters so the result is serialize-stable.
 */
export function addContinuousEffect(state, descriptor) {
  const seq = (state.idSeq || 0) + 1;
  const ts = state.timestampCounter || 0;
  const effectId = `ceff-${seq}`;
  const effect = {
    isCDA: false,
    sublayer: null,
    ...descriptor,
    id: effectId,
    timestamp: descriptor.timestamp ?? ts,
  };
  return {
    state: {
      ...state,
      idSeq: seq,
      timestampCounter: ts + 1,
      continuousEffects: [...(state.continuousEffects || []), effect],
    },
    effectId,
  };
}

/** Remove a stored resolution effect by id. Pure. */
export function removeContinuousEffect(state, effectId) {
  const list = state.continuousEffects || [];
  if (!list.some(e => e.id === effectId)) return state;
  return { ...state, continuousEffects: list.filter(e => e.id !== effectId) };
}

/**
 * CR 514.2 / 500.4: drop expired-duration resolution effects. Called at cleanup
 * (atCleanupOfTurn) and step begin (atStepBegin {phase, step}). Static-ability
 * effects are never stored, so this only filters state.continuousEffects. Pure.
 */
export function expireContinuousEffects(state, { atCleanupOfTurn = null, atStepBegin = null } = {}) {
  const list = state.continuousEffects || [];
  if (list.length === 0) return state;
  const kept = list.filter(e => {
    const d = e.duration || { kind: "permanent" };
    if (d.kind === "endOfTurn") {
      // Expires at the cleanup of its turn (a stale effect from an earlier turn
      // also expires — d.turn <= current cleanup turn). Fail-safe: an endOfTurn
      // effect with a missing/non-numeric turn is treated as expirable, never a
      // silent never-wears-off pump (a leaked permanent buff is the unsafe way).
      if (atCleanupOfTurn == null) return true;
      return !(d.turn == null || !Number.isFinite(d.turn) || d.turn <= atCleanupOfTurn);
    }
    if (d.kind === "endOfStep") {
      return !(atStepBegin && d.phase === atStepBegin.phase && d.step === atStepBegin.step);
    }
    return true; // permanent / unhandled durations survive
  });
  if (kept.length === list.length) return state;
  return { ...state, continuousEffects: kept };
}

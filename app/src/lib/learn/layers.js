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
import { parseStaticAbilities, parseAttachedBonus, parseAuraGrantedManaAbility } from "./staticAbilityParser.js";
import { parseProtectionColors } from "./protection.js";

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

// OUTLAW META-TYPE membership (CR 700-series — "outlaw" = the umbrella for these five creature subtypes).
// Lowercased; consulted by matchesSelector to expand an "Outlaw"-subtype anthem selector (Vihaan, Goldwaker:
// "Other outlaws you control have vigilance and haste") to its constituent subtypes. NOT a type-line word.
const OUTLAW_SUBTYPES = ["assassin", "mercenary", "pirate", "rogue", "warlock"];

// ─── Local board helpers (no gameState import → no cycle) ────────────────────────

// Per-state permanent index (overhaul wave 2): battlefield membership is immutable per state
// object, and findPerm was a linear all-battlefields scan on EVERY characteristic/keyword read.
// One id→permanent Map per state (WeakMap — GCs with the state). First-match order across
// players is preserved by insertion order + the has() guard (ids are unique regardless).
const _permIndexMemo = new WeakMap();
function permIndexOf(state) {
  let m = _permIndexMemo.get(state);
  if (m) return m;
  m = new Map();
  for (const pid of Object.keys(state?.players || {})) {
    for (const p of state.players[pid].battlefield || []) if (!m.has(p.id)) m.set(p.id, p);
  }
  _permIndexMemo.set(state, m);
  return m;
}

function findPerm(state, permanentId) {
  if (!state || typeof state !== "object") return null;
  return permIndexOf(state).get(permanentId) ?? null;
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

// CHOSEN-TYPE membership (CR 614.12, the Kindred Discovery family) — does `card` carry the creature
// type `chosenType`? True for a word-bounded subtype match on the type line OR a Changeling (CR 702.73a,
// every creature type). An unset/empty chosenType is false (a SAFE no-op — never an over-buff on an
// unknown type, CLAUDE.md §1.2). Inlined here (mirroring triggers.permHasChosenType) so layers stays a
// leaf — importing it from triggers.js would create a layers→triggers dependency.
function permHasChosenTypeLayer(card, chosenType) {
  if (!chosenType || !card) return false;
  if (hasKeyword(card, "changeling")) return true;
  const line = typeLineOf(card);
  const dash = line.indexOf("—");
  const subtypes = dash === -1 ? "" : line.slice(dash + 1);
  const esc = String(chosenType).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${esc}\\b`).test(subtypes);
}

// TRUNK-SELFBUFF: count the controller's permanents matching a self count spec
// ({ kind:"permanentsYouControl", cardType|subtype }) — the magnitude of a "for each <X> you control"
// static self-buff. Word-bounded match on the type line. Local (no gameState import). 0 on an unknown spec.
function countSelfSpecOnBoard(state, perm, spec) {
  if (!spec || !perm) return 0;
  // SUBTYPE on the battlefield — ALL players' battlefields (Sliver Legion "for each other Sliver on the
  // battlefield"). `excludeSelf` (the "other" form) drops the counting permanent if it carries the subtype,
  // so a board of N Slivers gives each Sliver a count of N-1. Word-bounded type-line match (so "Sliver"
  // hits "Creature — Sliver" but not a substring). All-players because the clause has no "you control".
  if (spec.kind === "subtypeOnBattlefield") {
    const needle = spec.subtype;
    if (!needle) return 0;
    const re = new RegExp(`\\b${needle}\\b`);
    let n = 0;
    for (const pl of Object.values(state?.players || {})) {
      for (const p of pl.battlefield || []) if (re.test(typeLineOf(p.card))) n += 1;
    }
    if (spec.excludeSelf && re.test(typeLineOf(perm.card))) n -= 1;
    return Math.max(0, n);
  }
  const player = state?.players?.[perm.controller];
  if (!player) return 0;
  // EQUIP-DYNAMIC-PT: distinct WUBRG colors among the controller's battlefield (Conqueror's Flail
  // "+1/+1 for each color among permanents you control"). A colorless permanent contributes none.
  if (spec.kind === "colorsAmongPermanents") {
    const cols = new Set();
    for (const p of player.battlefield || []) for (const c of colorsOf(p.card)) cols.add(c);
    return cols.size;
  }
  if (spec.kind !== "permanentsYouControl") return 0;
  const needle = spec.cardType || spec.subtype;
  if (!needle) return 0;
  const re = new RegExp(`\\b${needle}\\b`);
  return (player.battlefield || []).filter((p) => re.test(typeLineOf(p.card))).length;
}

// GATED-SELFBUFF: does the SOURCE permanent itself match a count spec's type? (so "another <type>" can
// exclude it from its own gate count). Word-bounded on the type line, mirroring countSelfSpecOnBoard.
function matchesCountSpec(perm, spec) {
  const needle = spec?.cardType || spec?.subtype;
  return needle ? new RegExp(`\\b${needle}\\b`).test(typeLineOf(perm?.card)) : false;
}

// GATED-GY: graveyard-count gate sources — the TOTAL cards (threshold, CR 702.15a) or the distinct CARD TYPES
// (delirium, CR 702.x) in the controller's graveyard. CR 205.2a: only CARD TYPES count for delirium —
// SUPERTYPES (Legendary/Basic/Snow/World) do NOT — so we match a fixed card-type allowlist, never cardTypesOf
// (which includes supertypes). The graveyard holds raw card objects (moveCardToZone unwraps the leaving
// permanent → its printed card). kindred ≡ tribal (one type, renamed) → collapsed so they never double-count.
const DELIRIUM_TYPE_RES = [
  ["artifact", "artifact"], ["battle", "battle"], ["creature", "creature"], ["enchantment", "enchantment"],
  ["instant", "instant"], ["land", "land"], ["planeswalker", "planeswalker"], ["sorcery", "sorcery"],
  ["tribal", "tribal"], ["kindred", "tribal"],
].map(([word, key]) => [new RegExp(`\\b${word}\\b`), key]);
// GATED-GY-EXT: "permanent card" (Descend 4, CR 700.3) = any card whose type line includes one
// of the permanent card types (creature, artifact, enchantment, land, battle, planeswalker).
// "Permanent" is NOT a type line word; we match by the presence of any permanent type instead.
const PERMANENT_TYPE_RE = /\b(?:creature|artifact|enchantment|land|battle|planeswalker)\b/i;
function countGraveyardSpec(state, perm, spec) {
  const gy = state?.players?.[perm?.controller]?.graveyard || [];
  if (spec.kind === "cardsInGraveyard") {
    if (!spec.cardType) return gy.length; // bare threshold: all cards
    // GATED-GY-EXT: typed count — cardType "Permanent" (Descend 4) or "instantOrSorcery" (Ghitu style).
    // "Permanent" = any permanent card type (creature/artifact/enchantment/land/battle/planeswalker, CR 700.3).
    if (spec.cardType === "Permanent") {
      return gy.filter((c) => PERMANENT_TYPE_RE.test(typeLineOf(c).split("—")[0])).length;
    }
    if (spec.cardType === "instantOrSorcery") {
      return gy.filter((c) => /\b(?:instant|sorcery)\b/i.test(typeLineOf(c).split("—")[0])).length;
    }
    // Generic single-type filter (e.g., "creature cards") — matches the card-type word in the type line.
    const typeRe = new RegExp(`\\b${spec.cardType}\\b`, "i");
    return gy.filter((c) => typeRe.test(typeLineOf(c).split("—")[0])).length;
  }
  const seen = new Set();
  for (const card of gy) {
    const head = typeLineOf(card).split("—")[0].toLowerCase(); // types/supertypes, before any subtypes
    for (const [re, key] of DELIRIUM_TYPE_RES) if (re.test(head)) seen.add(key);
  }
  return seen.size;
}

// GATED-SELFBUFF / GATED-KEYWORD / GATED-GY: is a count-threshold gate currently OPEN for this permanent?
// Shared by the layer-7c ptModifyGated buff and the layer-6 gated keyword grant — the SINGLE evaluator so a
// P/T gate and a keyword gate can never diverge. An absent gate is always open (ungated). A BOARD gate counts
// the controller's matching permanents ("another" excludes the source); a GRAVEYARD gate counts cards / card
// types in the controller's graveyard (no self-exclusion — a graveyard card is never the gated permanent).
function gateMet(state, perm, gate) {
  if (!gate) return true;
  // EQUIPPED gate: any Equipment on the battlefield is attached to this permanent (CR 301.5b).
  if (gate.kind === "isEquipped") {
    for (const pid of Object.keys(state?.players || {})) {
      const bf = state.players[pid]?.battlefield || [];
      if (bf.some(p => p.attachedTo === perm.id && /\bequipment\b/i.test(p.card?.type || ""))) return true;
    }
    return false;
  }
  const spec = gate.countSpec;
  if (spec?.kind === "cardsInGraveyard" || spec?.kind === "cardTypesInGraveyard") {
    return countGraveyardSpec(state, perm, spec) >= (gate.atLeast || 1);
  }
  // SELF-COUNTER-GATED KEYWORD (CR 613.1f-adjacent, layer 6) — a keyword/buff this permanent has "as long as
  // it has N or more <counterType> counters on it" (Primordial Hydra's trample-at-10, Taborax's lifelink-at-5).
  // Read THIS permanent's own counter pile directly (per-permanent, like the keyword-counter seed) and compare
  // to the threshold. Re-evaluated every keyword/P-T read via gateMet, so the grant turns on the instant the
  // count crosses N and off if the count later drops (CR 613.7 continuous). No board scan — recursion-safe.
  if (spec?.kind === "countersOnSelf") {
    return (perm.counters?.[spec.counterType] || 0) >= (gate.atLeast || 1);
  }
  let n = countSelfSpecOnBoard(state, perm, spec);
  if (gate.excludeSelf && matchesCountSpec(perm, spec)) n -= 1;
  return n >= (gate.atLeast || 1);
}

const COLOR_PIPS = ["W", "U", "B", "R", "G"];
/** A card's colors (the Scryfall `colors` array, else derived from mana-cost pips). Exported so the
 * targeting/protection path can read a SPELL's colors (CR 702.16b protection-from-color). */
export function colorsOf(card) {
  if (Array.isArray(card?.colors)) return card.colors.map(String);
  const cost = String(card?.mana || card?.mana_cost || "");
  return COLOR_PIPS.filter(c => cost.includes(`{${c}}`));
}

// GOD-DEVOTION (CR 700.5) — count the mana-symbol pips of any color in `colors` (a WUBRG-letter array) among
// the mana costs of EVERY permanent the controller controls (the source God itself counts — it's on the
// battlefield with its own cost). A hybrid/Phyrexian pip ({G/W}, {G/P}) whose split-content includes one of
// the wanted colors counts ONCE (CR 700.5 — the pip contributes to devotion to each of its colors), so a
// two-color clause that lists both halves of a hybrid pip would count it for each, exactly as the rules say.
// Local to layers.js (a plain mana-cost string scan — recursion-safe, never deriveCharacteristics) so this
// stays a leaf of gameState and never imports the atoms' devotionPips (which would couple the layer engine to
// the effects tree). Mirrors that helper's pip math so the classifier-side count and the runtime count agree.
function devotionToColors(state, controller, colors) {
  const wanted = new Set((colors || []).map(String));
  if (wanted.size === 0) return 0;
  const bf = state?.players?.[controller]?.battlefield || [];
  let n = 0;
  for (const perm of bf) {
    const cost = String(perm?.card?.mana || perm?.card?.mana_cost || "");
    for (const pip of cost.match(/\{[^}]+\}/g) || []) {
      const parts = pip.slice(1, -1).split("/");
      if (parts.some(p => wanted.has(p))) n += 1;
    }
  }
  return n;
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
  // Attached-permanent bonus (CR 301.5 / 303.4): when this Equipment or Aura is ATTACHED
  // to a creature, its "Equipped/Enchanted creature gets +X/+Y / has [keyword]" effect
  // applies ONLY to that creature (affects fixed [attachedTo]). collectContinuousEffects
  // re-runs per state, so the bonus appears/disappears the instant attachedTo changes.
  if (permanent.attachedTo) {
    for (const e of parseAttachedBonus(card)) {
      partials.push({ ...e, affects: { mode: "fixed", permanentIds: [permanent.attachedTo] } });
    }
    // BESTOW (CR 702.103e): a bestow permanent is an AURA — NOT a creature — while it's attached. Emit a
    // layer-4 self removal of the Creature type so combat / the lethal-damage SBA / "creatures you control"
    // selectors all treat it as the non-creature Aura it currently is. Only while attached: the moment its
    // host leaves (attachedTo cleared by the SBA exemption) this effect is no longer emitted and it's a
    // creature again. Gated on the `bestowed` flag so a printed Aura / Equipment is never type-stripped.
    if (permanent.bestowed) {
      partials.push({
        layer: 4,
        op: { layerOp: "removeCardType", removeType: "Creature" },
        affects: { mode: "self" },
        duration: { kind: "permanent" },
      });
    }
    // GRANTED-MANA-ABILITY AURA (creature host): "Enchanted creature has \"{T}: Add …\"" (Multani's Harmony)
    // grants the enchanted creature a fully-modeled tap-for-mana ability. Emit it as a layer-6 addAbility
    // grant FIXED to the host so grantedManaSpecsFor → manaSources offers the host the tap (the same runtime
    // path group grants use). parseAttachedBonus drops this clause (parseAttachedClause can't model a granted
    // ability), so it's additive — no double-count. Runtime fires whenever attached, independent of the
    // card's native classification (a ridered Aura still grants the mana; its rider is handled separately).
    const grantedMana = parseAuraGrantedManaAbility(card);
    if (grantedMana) {
      partials.push({
        layer: 6,
        // `via:"attached"` marks this as a genuinely-distinct aura ability (not a group/self grant) so
        // manaSources may SUPPLEMENT a host that already produces mana (a LAND) — see
        // applyAuraManaGrantSupplement; a group grant lacks the marker and never supplements.
        op: { layerOp: "addAbility", grant: { kind: "mana", spec: { ...grantedMana, via: "attached" } } },
        affects: { mode: "fixed", permanentIds: [permanent.attachedTo] },
        duration: { kind: "permanent" },
      });
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
 * The continuous (static) effects an EMBLEM generates (PW-5). An emblem is not a permanent — it sits
 * in the command zone and can't leave (CR 114.3) — so its effects carry `source.kind = "emblem"` (NOT
 * "static"), which exempts them from the battlefield-source validity drop in effectAffects, and a
 * `source.controller` so a "creatures you control" anthem scopes to the emblem's owner. Parses the
 * emblem's quoted ability text exactly like a permanent's static (a clean anthem → an anthem effect;
 * an unparseable ability → [], so a complex emblem contributes nothing here and its maker stays LOW).
 */
export function emblemEffectsOf(emblem, controller) {
  const partials = parseStaticAbilities({ name: "Emblem", type: "Emblem", oracle: emblem?.oracle || "" });
  if (!partials.length) return [];
  const timestamp = Number.isFinite(emblem.timestamp) ? emblem.timestamp : 0;
  return partials.map(p => ({
    ...p,
    sublayer: p.sublayer ?? null,
    isCDA: !!p.isCDA,
    timestamp,
    source: { kind: "emblem", controller, emblemId: emblem.id, cardName: "Emblem" },
    affects: p.affects, // selectors resolve against the emblem's controller (see effectAffects)
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
  // PW-5: emblems also generate continuous static effects (anthems), scoped to their controller.
  for (const pid of Object.keys(state.players || {})) {
    for (const emblem of state.players[pid].emblems || []) {
      const fx = emblemEffectsOf(emblem, pid);
      if (fx.length) effects.push(...fx);
    }
  }
  for (const e of state.continuousEffects || []) effects.push(e);
  _boardMemo.set(state, effects);
  return effects;
}

// ─── Affect-spec evaluation (does effect E apply to permanent P?) ───────────────

// LAYER-AWARE types + subtypes for a candidate WITHOUT recursing into deriveCharacteristics: the printed
// card types / subtypes UNIONED with those ADDED by FIXED-mode layer-4 type-changing effects that target this
// permanent (an animate — Vihaan's Treasure → "Construct Assassin artifact CREATURE", a man-land becoming an
// "Elemental"). Reading ONLY `mode:"fixed"` effects keeps this recursion-free (a fixed affect names
// permanentIds directly — no selector match needed), so an anthem's cardTypes:["Creature"] / subtypes gate
// (matchesSelector) can honor an animated permanent's GRANTED Creature type + subtype (CR 613's
// layer-4-before-layer-6 dependency) without the deriveCharacteristics→collect→matchesSelector cycle a full
// derive would create. A DYNAMIC-selector layer-4 grant (none ship today) is deliberately NOT consulted here
// — that would reintroduce the recursion — so it's a SAFE under-read, never an over-match. The `types` are
// kept original-case (the cardTypes check uses substring inclusion like the printed path); subtypes lowercased.
function effectiveTypeIdentity(candidate, state) {
  let types = cardTypesOf(candidate.card);
  const subtypes = subtypesOf(candidate.card).map(s => s.toLowerCase());
  if (!state) return { types, subtypes };
  const board = collectContinuousEffects(state);
  if (!board.length) return { types, subtypes };
  for (const e of board) {
    if (e.layer !== 4) continue;
    // GOD-DEVOTION self-removal: a God below its devotion threshold is NOT a creature, so another source's
    // "creatures you control …" selector (matchesSelector cardTypes:["Creature"]) must NOT match it. The
    // effect is SELF-affecting (permanentId resolved at collection to the God's id), and the devotion read is
    // a plain mana-cost board scan — recursion-safe, no deriveCharacteristics — so it's honored here without
    // reintroducing the cycle the fixed-only rule otherwise avoids. Removing "Creature" from the candidate's
    // identity means an anthem/lord skips a God whose devotion is too low, exactly as the rules require.
    if (e.op?.layerOp === "removeTypeWhileDevotionBelow") {
      if (e.affects?.mode === "self" && e.affects.permanentId === candidate.id &&
          devotionToColors(state, candidate.controller, e.op.colors) < (e.op.atLeast || 0)) {
        types = types.filter(t => t !== e.op.removeType);
      }
      continue;
    }
    // BESTOW (CR 702.103e): an unconditional self type-removal — while a bestow permanent is attached it's
    // an Aura, NOT a creature, so any "creatures you control …" selector must skip it (mirrors the God gate
    // above, but unconditional — being attached is the whole condition, enforced where this effect is emitted).
    // COUNTER-GATED TYPE-CHANGE (ARIXMETHES): the self Creature-removal carries a countersOnSelf gate — while
    // its slumber counters remain, Arixmethes is not a creature (so an anthem/lord selector skips it); the
    // instant they're gone the gate opens and it's a creature again. gateMet is a plain counter/mana read on
    // THIS permanent — recursion-safe, no deriveCharacteristics — so it's honored here like the God gate above.
    if (e.op?.layerOp === "removeCardType") {
      if (e.affects?.mode === "self" && e.affects.permanentId === candidate.id
          && (!e.op.gate || gateMet(state, candidate, e.op.gate))) {
        types = types.filter(t => t !== e.op.removeType);
      }
      continue;
    }
    if (e.affects?.mode !== "fixed" || !e.affects.permanentIds?.includes(candidate.id)) continue;
    for (const t of e.op?.types || []) if (!types.includes(t)) types.push(t);
    for (const st of e.op?.subtypes || []) subtypes.push(String(st).toLowerCase());
  }
  return { types, subtypes };
}

function matchesSelector(selector, candidate, sourcePerm, state) {
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
  // LAYER-AWARE type identity (printed ∪ fixed layer-4 grants) — computed once for both the cardTypes and the
  // subtypes gates so an ANIMATED permanent (Vihaan's Treasure → "Construct Assassin artifact creature") is
  // seen as the Creature/outlaw it has BECOME (CR 613's layer-4-before-layer-6 dependency). Lazily — only when
  // a type/subtype gate is present (the common color/generic anthem skips it).
  const ident = (selector.cardTypes || selector.subtypes) ? effectiveTypeIdentity(candidate, state) : null;
  if (selector.cardTypes) {
    if (!selector.cardTypes.every(t => ident.types.includes(t))) return false;
  }
  if (selector.subtypes) {
    // CHANGELING (CR 702.73a — every creature type) matches ANY subtype selector, so a tribal lord/anthem
    // ("Other Slivers you control get +1/+1") buffs a changeling (printed, or a "with changeling" token from
    // the create-token path). Mirrors the 6 other changeling-aware subtype checks (combatEvasion, groupWard,
    // resolvers, triggers, staticAbilityParser, permHasChosenTypeLayer) so changeling-ness is honored
    // uniformly. A SAFE widening: only a creature already carrying the changeling keyword newly matches.
    if (!hasKeyword(candidate.card, "changeling")) {
      const subs = ident.subtypes;
      // OUTLAW META-TYPE (CR 702.x / 700-series — Vihaan, Goldwaker's "Other outlaws you control"): "outlaw"
      // is NOT a type-line subtype — it's the umbrella for {Assassin, Mercenary, Pirate, Rogue, Warlock}. A
      // selector subtype of "Outlaw" therefore matches a candidate carrying ANY of those five (OR semantics,
      // same as a multi-subtype list). Expanded HERE at the match chokepoint (not at parse) so the single
      // continuous-effect collection honors the meta-type uniformly; non-meta subtypes are unaffected.
      const wanted = selector.subtypes.flatMap(st => {
        const lc = String(st).toLowerCase();
        return lc === "outlaw" ? OUTLAW_SUBTYPES : [lc];
      });
      if (!wanted.some(st => subs.includes(st))) return false;
    }
  }
  if (selector.colors) {
    const cols = colorsOf(candidate.card);
    if (!selector.colors.some(c => cols.includes(c))) return false;
  }
  // TOKEN gate (Teysa Karlov — "Creature TOKENS you control have vigilance and lifelink"): the candidate
  // must be a token (CR 111.1 — card.token stamped at every token-mint chokepoint, incl. token copies). A
  // nontoken creature is skipped, so the anthem confers vigilance/lifelink to exactly the controller's
  // creature tokens. Re-read each collection, so a token entering/leaving updates the grant live.
  if (selector.token && !candidate.card?.token) return false;
  // COUNTER-PAYOFF: a per-permanent counter gate (Herald of Secret Streams — "creatures you control WITH
  // A +1/+1 COUNTER on it …"). Re-evaluated each collection, so the grant tracks the counter dynamically.
  if (selector.requiresCounter && (candidate.counters?.[selector.requiresCounter] || 0) <= 0) return false;
  // CHOSEN-TYPE anthem (CR 614.12 — Banner of Kinship / Door of Destinies "Creatures you control of the
  // chosen type …"). The candidate must carry the SOURCE permanent's stored chosenType (subtype OR
  // changeling). controllerScope:"you" above already restricted to the source's controller. An unset
  // chosenType (malformed source) yields false → the anthem touches nobody (a SAFE no-op).
  if (selector.chosenTypeOfSource && !permHasChosenTypeLayer(candidate.card, sourcePerm?.chosenType)) return false;
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
      let sourcePerm = effect.source?.permanentId
        ? findPerm(state, effect.source.permanentId)
        : null;
      // A dynamic (static-ability) effect needs its source on the battlefield.
      if (effect.source?.kind === "static" && !sourcePerm) return false;
      // An EMBLEM source has no battlefield permanent (and can't leave), so it's never dropped; its
      // "you control" scope resolves against the emblem's controller (PW-5).
      if (effect.source?.kind === "emblem") sourcePerm = { controller: effect.source.controller };
      return matchesSelector(affects.selector, candidate, sourcePerm, state);
    }
    default:
      return false;
  }
}

function byTimestamp(a, b) {
  return (a.timestamp || 0) - (b.timestamp || 0);
}

// Per-state layer-6 keyword/protection index (overhaul wave 2): permanentHasKeyword is the
// combat/legality hot path and re-filtered + re-sorted the ENTIRE board per query. Only
// add/removeKeyword effects naming the QUERIED keyword can change the verdict (every other
// effect was a skipped no-op in the old loop), and timestamp order within that subset is
// preserved — so consulting the index is evaluation-order-identical to the old filter+sort.
const _l6IndexMemo = new WeakMap();
function l6IndexOf(state) {
  let idx = _l6IndexMemo.get(state);
  if (idx) return idx;
  const byKeyword = new Map();
  const protection = [];
  for (const e of collectContinuousEffects(state)) {
    if (e.layer !== 6) continue;
    const op = e.op || {};
    if (op.layerOp === "addProtection") { protection.push(e); continue; }
    if (op.layerOp !== "addKeyword" && op.layerOp !== "removeKeyword") continue;
    const kw = String(op.keyword || "").toLowerCase();
    if (!kw) continue;
    let list = byKeyword.get(kw);
    if (!list) { list = []; byKeyword.set(kw, list); }
    list.push(e);
  }
  for (const list of byKeyword.values()) list.sort(byTimestamp);
  idx = { byKeyword, protection };
  _l6IndexMemo.set(state, idx);
  return idx;
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

  // 7a — characteristic-defining P/T (CR 613.4a; 604.3 — a CDA applies in layer 7a and is NEVER on the
  // stack). CDA-SELF-P/T-BY-COUNT: "[this creature]'s power and toughness are each equal to the number of
  // <X> you control" SETS the base from a LIVE board count (Dakkon Blackblade / Molimo / Flora Colossus —
  // lands; Scion of the Wild / Crusader of Odric — creatures). The count is read THIS computation via the
  // SAME countSelfSpecOnBoard the layer-7c count-buff uses (a plain type-line board scan — recursion-safe,
  // never deriveCharacteristics), so it tracks the board both directions (a land enters → grows; a land
  // leaves → shrinks). CDAs have no inter-CDA dependency in the modeled set; apply each in timestamp order.
  // `setPower`/`setToughness` flags gate which characteristic the CDA defines (the modeled form sets both).
  for (const e of l7Effects.filter(e => e.sublayer === "7a").sort(byTimestamp)) {
    if (e.op?.layerOp !== "ptSetDynamicCount") continue;
    const n = countSelfSpecOnBoard(state, perm, e.op.countSpec);
    if (e.op.setPower) basePower = n;
    if (e.op.setToughness) baseToughness = n;
  }
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
    } else if (e.op.layerOp === "ptModifyDynamicCount") {
      // CHOSEN-TYPE anthem (CR 614.12 — Banner of Kinship / Door of Destinies): magnitude = the number of
      // <named> counters on the SOURCE artifact ("for each fellowship/charge counter on this artifact"),
      // not a board count. Read from the effect's source permanent (e.source.permanentId), re-evaluated
      // every P/T computation so the anthem tracks the counter live. A missing source → 0 (no buff).
      let n;
      if (e.op.countSpec?.kind === "countersOnSource") {
        const src = e.source?.permanentId ? findPerm(state, e.source.permanentId) : null;
        // counterType null = ALL counters on the source, any kind (Hancock — "the number of counters
        // on Hancock", SHELF S7); a named counterType stays the exact-kind read (fellowship/charge).
        n = !src ? 0
          : e.op.countSpec.counterType ? (src.counters?.[e.op.countSpec.counterType] || 0)
          : Object.values(src.counters || {}).reduce((s, v) => s + (v || 0), 0);
      } else {
        // TRUNK-SELFBUFF: magnitude = a live board count × per-unit ("gets +X/+Y for each <countsource>").
        // The count is read for THIS permanent (its controller / its type line for the excludeSelf case),
        // re-evaluated here every P/T computation (so it tracks the board live).
        n = countSelfSpecOnBoard(state, perm, e.op.countSpec);
      }
      power += n * (e.op.perPower || 0);
      toughness += n * (e.op.perToughness || 0);
    } else if (e.op.layerOp === "ptModifyGated") {
      // GATED-SELFBUFF: a FIXED self buff applied ONLY while a board threshold holds ("gets +X/+Y as long as
      // you control a/another/N <type>"). Re-evaluated live every P/T computation via the shared gate.
      if (gateMet(state, perm, e.op.gate)) { power += e.op.power || 0; toughness += e.op.toughness || 0; }
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
      keywords: keywordSet(perm, l6, state),
      ...applyTypeColorLayers(perm, l4, l5, state),
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

/** Layer 4 (type) + layer 5 (color). Type effects ADD types (animate) or, for the GOD-DEVOTION gate,
 * conditionally REMOVE the Creature type while devotion is below the threshold (CR 613.1d). */
function applyTypeColorLayers(perm, l4, l5, state) {
  const types = new Set(cardTypesOf(perm.card));
  const subtypes = new Set(subtypesOf(perm.card));
  for (const e of l4) {
    // GOD-DEVOTION conditional type-removal: while the controller's devotion to the listed color(s) is BELOW
    // the threshold, strip the named type (Creature) — re-evaluated live every derive, so the 5th green pip
    // entering the battlefield flips the God back into a creature (and the 5th leaving flips it back off).
    // The removal is timestamp-immaterial (it's the God's own printed static, no other type effect contends),
    // so it commutes with any ADD in the same layer; applied here in the same pass.
    if (e.op?.layerOp === "removeTypeWhileDevotionBelow") {
      if (devotionToColors(state, perm.controller, e.op.colors) < (e.op.atLeast || 0)) types.delete(e.op.removeType);
      continue;
    }
    // COUNTER-GATED TYPE-CHANGE (ARIXMETHES, CR 613.4b): a layer-4 type effect may carry a `gate` (a
    // countersOnSelf presence gate) — while its own slumber counters remain, Arixmethes is a land and not a
    // creature; the instant the last is removed the gate closes and both deltas turn off (CR 613.7). Skip the
    // op entirely when its gate is not met. Mirrors the layer-6/7c gate handling (keywordSet / applyLayer7).
    if (e.op?.gate && !gateMet(state, perm, e.op.gate)) continue;
    // BESTOW (CR 702.103e): while attached, a bestow permanent is an Aura and NOT a creature — strip the
    // Creature type (the effect is only EMITTED while attachedTo is set, so no condition is needed here).
    // This makes permanentIsCreature/combat/the lethal-damage SBA correctly treat it as a non-creature Aura;
    // when its host leaves the effect is no longer emitted, so it's a creature again (CR 702.103e).
    if (e.op?.layerOp === "removeCardType") {
      types.delete(e.op.removeType);
      continue;
    }
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
function keywordSet(perm, l6Effects, state) {
  const set = printedKeywords(perm.card);
  // Keyword counters (613.1f), e.g. counters.flying > 0.
  for (const kw of COMBAT_KEYWORDS) {
    if ((perm.counters?.[kw.toLowerCase()] || 0) > 0) set.add(kw.toLowerCase());
  }
  for (const e of l6Effects.slice().sort(byTimestamp)) {
    const kw = String(e.op.keyword || "").toLowerCase();
    if (!kw) continue;
    if (e.op.gate && !gateMet(state, perm, e.op.gate)) continue; // GATED-KEYWORD: gate closed → no grant this turn
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
  const grants = l6IndexOf(state).byKeyword.get(kwLower);
  if (!grants || grants.length === 0) return printed || fromCounter;
  let has = printed || fromCounter;
  for (const e of grants) {
    if (!effectAffects(e, perm, state)) continue;
    if (e.op.gate && !gateMet(state, perm, e.op.gate)) continue; // GATED-KEYWORD: gate closed → no grant
    if (e.op.layerOp === "addKeyword") has = true;
    else if (e.op.layerOp === "removeKeyword") has = false;
  }
  return has;
}

/**
 * EQUIP-PROTECTION (CR 702.16, layer 6) — the set of COLORS a permanent has "protection from" right now:
 * its PRINTED protection-from-color (parseProtectionColors on the card) UNIONED with GRANTED protection
 * from layer-6 `addProtection` continuous effects (a Captain America Sword's "Equipped creature … has
 * protection from black and from green", scoped to attachedTo by staticEffectsOf). Returns a Set of
 * WUBRG letters. There is no protection-REMOVAL form in scope, so a simple union is CR-correct (613.7).
 *
 * This is the LAYER-AWARE replacement for reading parseProtectionColors(card) directly at the three
 * enforcement sites (combat damage / block / targeting) — so a grant via an attached Equipment/Aura is
 * honored exactly like printed protection, and DISAPPEARS the instant the equipment unattaches (the
 * staticEffectsOf bonus is keyed on attachedTo). Short-circuits to the printed set on an effect-free board.
 */
export function permanentProtectionColors(state, permanentId) {
  const perm = findPerm(state, permanentId);
  if (!perm) return new Set();
  const set = new Set(parseProtectionColors(perm.card));
  const l6 = l6IndexOf(state).protection;
  for (const e of l6) {
    if (!effectAffects(e, perm, state)) continue;
    for (const c of e.op.colors || []) set.add(String(c).toUpperCase());
    // EQUIP-PROTECTION-DYNAMIC (Commander's Plate, CR 702.16 + 702.16j): a granted "protection from each
    // color that's not in your commander's color identity". The quality is computed HERE from live state,
    // not baked into a static `colors` list. "Your commander" = the equipped creature's controller (ATTACH
    // forbids equipping another player's creature — resolvers.ATTACH requires tgt.controller === controller —
    // so perm.controller IS the equipment controller, whose command zone this reads). The protected set is
    // WUBRG minus the union of that player's commander(s') color identities; a colorless commander (identity
    // []) yields protection from all five colors. No commander in the zone ⇒ empty identity ⇒ all five, which
    // is the CR-correct default (a card that's a commander with no identity confers nothing to subtract).
    if (e.op.dynamicColors === "notCommanderIdentity") {
      const identity = commanderColorIdentity(state, perm.controller);
      for (const c of ALL_WUBRG) if (!identity.has(c)) set.add(c);
    }
  }
  return set;
}

const ALL_WUBRG = ["W", "U", "B", "R", "G"];

/**
 * The union of the color identities of the commander card(s) in a player's command zone, as a Set of
 * uppercase WUBRG letters (CR 903.4 — a permanent's commander color identity is the identity of its
 * commander). Reads each command-zone card's `colorIdentity` (publicCard shape) OR `color_identity` (raw
 * Scryfall) — both are present on real decks; a card lacking both contributes nothing. Empty when the seat
 * has no commander (or a wholly colorless one). Pure.
 */
function commanderColorIdentity(state, playerId) {
  const out = new Set();
  const cmds = state?.players?.[playerId]?.command || [];
  for (const c of cmds) {
    const ci = c?.colorIdentity ?? c?.color_identity ?? [];
    for (const letter of ci) out.add(String(letter).toUpperCase());
  }
  return out;
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
 * Layer-aware "is this permanent a creature right now?" — true when Creature is
 * among its derived card types after layer 4. A printed creature, an animated
 * land/artifact, and a man-land all answer correctly through this one predicate,
 * so the engine's combat + state-based-action paths treat a granted-Creature
 * permanent as the creature it has become (WALT-ANIMATE framework).
 *
 * Behavior-neutral for any permanent with no layer-4 type effect in play: the
 * type layer only ADDS types (it never strips them — see applyTypeColorLayers),
 * so for an unanimated card this is exactly the printed type-line creature check.
 */
export function permanentIsCreature(state, permanentId) {
  return permanentTypes(state, permanentId).types.includes("Creature");
}

/**
 * GROUP-GRANT — the MANA-ability specs another permanent's static ability GRANTS this permanent (a Sliver
 * lord's "All Slivers have \"{T}: Add …\"" — Gemhide/Manaweft, Enduring Vitality). Walks the same continuous
 * -effect collection the layer engine uses, filters to layer-6 `addAbility` grants of kind "mana" that
 * AFFECT this permanent (selector match via the shared `effectAffects`, so self in/exclude + controller
 * scope + subtype are all honored), and returns the serializable `{colors, amount}` specs (parsed once by
 * staticAbilityParser — manaModel reads these, never re-parses, so the classifier and runtime can't drift).
 * Returns [] when no grant applies. Pure. Used by manaModel.manaSources / legalChoices.actionsTapForMana to
 * offer a recipient the tap-for-mana source it gained — kept HERE (not manaModel) because only this module
 * owns `effectAffects`/`matchesSelector`, and exposing the raw specs avoids a layers→manaModel import cycle.
 */
export function grantedManaSpecsFor(state, permanentId) {
  const perm = findPerm(state, permanentId);
  if (!perm) return [];
  const board = collectContinuousEffects(state);
  if (board.length === 0) return [];
  const specs = [];
  for (const e of board) {
    if (e.layer !== 6 || e.op?.layerOp !== "addAbility") continue;
    if (e.op.grant?.kind !== "mana" || !e.op.grant.spec) continue;
    if (!effectAffects(e, perm, state)) continue;
    specs.push(e.op.grant.spec);
  }
  return specs;
}

/**
 * GROUP-GRANT — the quoted ACTIVATED-ability TEXTS another permanent's static GRANTS this permanent (a Sliver
 * lord's "All Slivers have \"{2}: Regenerate this permanent.\"" — Clot/Mnemonic/Darkheart Sliver). Mirrors
 * grantedManaSpecsFor: walks the same continuous-effect collection, filters to layer-6 `addAbility` grants of
 * kind "activated" that AFFECT this permanent (selector match via the shared effectAffects, so self in/exclude
 * + subtype + controller scope are honored), and returns the raw quoted strings. legalChoices parses each via
 * parseActivatedAbilities (the SAME parser staticAbilityParser gated the emission on) and enumerates the
 * ability ON THIS permanent — so "this permanent"/"this creature"/the {T}/sacrifice cost bind to the RECIPIENT
 * (permanentId), exactly like a printed activated ability. Returns [] when no grant applies. Pure. Kept HERE
 * (not legalChoices) because only this module owns effectAffects/matchesSelector.
 */
export function grantedActivatedQuotedFor(state, permanentId) {
  const perm = findPerm(state, permanentId);
  if (!perm) return [];
  const board = collectContinuousEffects(state);
  if (board.length === 0) return [];
  const out = [];
  for (const e of board) {
    if (e.layer !== 6 || e.op?.layerOp !== "addAbility") continue;
    if (e.op.grant?.kind !== "activated" || !e.op.grant.quoted) continue;
    if (!effectAffects(e, perm, state)) continue;
    out.push(e.op.grant.quoted);
  }
  return out;
}

/**
 * GROUP-GRANT — the quoted TRIGGERED-ability TEXTS another permanent's static GRANTS this permanent (a Sliver
 * lord's "Sliver creatures you control have \"Whenever this creature deals combat damage to a player, put a
 * +1/+1 counter on it.\"" — Tempered Sliver). Mirrors grantedActivatedQuotedFor: walks the same continuous-
 * effect collection, filters to layer-6 `addAbility` grants of kind "triggered" that AFFECT this permanent
 * (selector match via the shared effectAffects, so self in/exclude + subtype + controller scope are honored),
 * and returns the raw quoted strings. triggers.grantedTriggersForGroup parses each via detectTriggers (the
 * SAME parser the printed/Aura paths use) and merges the descriptors onto THIS permanent in triggersForEvent —
 * so "this creature"/source bind to the RECIPIENT, exactly like a printed trigger. Returns [] when no grant
 * applies. Pure. Kept HERE (not triggers.js) because only this module owns effectAffects/matchesSelector.
 */
export function grantedTriggeredQuotedFor(state, permanentId) {
  const perm = findPerm(state, permanentId);
  if (!perm) return [];
  const board = collectContinuousEffects(state);
  if (board.length === 0) return [];
  const out = [];
  for (const e of board) {
    if (e.layer !== 6 || e.op?.layerOp !== "addAbility") continue;
    if (e.op.grant?.kind !== "triggered" || !e.op.grant.quoted) continue;
    if (!effectAffects(e, perm, state)) continue;
    out.push(e.op.grant.quoted);
  }
  return out;
}

/**
 * DIES-TRIGGER MULTIPLIER (Teysa Karlov, CR 603.x) — how many EXTRA times a creature-death-caused triggered
 * ability of a permanent `controllerId` controls fires. Counts the board's diesTriggerMultiplier statics
 * (staticAbilityParser emits one, self-affecting, per Teysa) whose SOURCE permanent is currently controlled
 * by `controllerId`. Each such static means the ability "triggers an additional time", so N Teysas → +N
 * copies (two Teysas → the ability fires 3 times total — the official ruling). Reads the source's LIVE
 * controller from state (a stolen/copied Teysa counts for its current controller). Pure; 0 when the player
 * controls none. Consumed by triggers.checkDiesTriggers / checkSacrificeTriggers at the death-trigger enqueue
 * sites — the only two places a creature dying (put into a graveyard) causes a triggered ability to fire.
 */
export function diesTriggerMultiplierCount(state, controllerId) {
  if (!state || controllerId == null) return 0;
  const board = collectContinuousEffects(state);
  if (board.length === 0) return 0;
  let n = 0;
  for (const e of board) {
    if (e.op?.layerOp !== "diesTriggerMultiplier") continue;
    // The static is self-affecting; its controller is the source permanent's LIVE controller.
    const src = e.source?.permanentId ? findPerm(state, e.source.permanentId) : null;
    if (src && src.controller === controllerId) n += 1;
  }
  return n;
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

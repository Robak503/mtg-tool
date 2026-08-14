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
import { parseStaticAbilities, parseAttachedBonus, parseAuraGrantedManaAbility, parseSoulbondBond } from "./staticAbilityParser.js";
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
// Re-entry guard for the layer-aware branch below, mirroring _ptPredicateInProgress and the withKeyword
// selector's discipline: a nested re-entry treats the candidate as UNSELECTED for that pass — an FN-safe
// bail, never a stack overflow.
const _chosenTypePredicateInProgress = new Set();

/**
 * Does this permanent count as the source's chosen type (CR 614.12)?
 *
 * ⚠️ THE PRINTED TYPE LINE IS NOT THE WHOLE ANSWER, and assuming it was is what kept the creature-side
 * chosen-type cards parked. "This creature is the chosen type in addition to its other types" (Metallic
 * Mimic #1055, Adaptive Automaton #1755, Roaming Throne #133) adds the subtype in LAYER 4 — so a card whose
 * printed line says only "Shapeshifter" genuinely IS an Elf once a type has been chosen. Checking the
 * printed line alone would have credited those cards native while their own printed self-type-add did
 * nothing for any chosen-type selector: the vacuous-filter class in a third location.
 *
 * Order is deliberate. Changeling (CR 702.73a — every creature type) and the PRINTED subtypes are cheap and
 * answer almost every call, so the layer-4 derivation runs only for the rare card that needs it. CR 613
 * ordering makes that read correct rather than a shortcut: layer 4 resolves before the layer-7 anthems that
 * carry this selector, so the derived subtypes are already final when the selector asks.
 */
function permHasChosenTypeLayer(card, chosenType, state = null, candidateId = null) {
  if (!chosenType || !card) return false;
  if (hasKeyword(card, "changeling")) return true;
  const esc = String(chosenType).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const line = typeLineOf(card);
  const dash = line.indexOf("—");
  if (dash !== -1 && new RegExp(`\\b${esc}\\b`).test(line.slice(dash + 1))) return true;
  if (!state || !candidateId) return false;                       // no board context → printed answer stands
  if (_chosenTypePredicateInProgress.has(candidateId)) return false;
  _chosenTypePredicateInProgress.add(candidateId);
  try {
    const want = String(chosenType).toLowerCase();
    return (permanentTypes(state, candidateId).subtypes || []).some((s) => String(s).toLowerCase() === want);
  } finally {
    _chosenTypePredicateInProgress.delete(candidateId);
  }
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
  // COUNTERS ON A GROUP YOU CONTROL — "the number of +1/+1 counters on lands you control" (Toph, the Blind
  // Bandit). An EXACT board read: a word-bounded type-line match picks the group, then the named counter kind
  // is summed off each permanent. Nothing is inferred and nothing defaults — a permanent with no counters
  // contributes 0, so the total is the printed number and never a fabricated one.
  //
  // ⚠️ WRITTEN BEFORE the source was admitted to either count vocabulary. The CDA allowlist's own rule is
  // "every branch maps to an evaluator countForSpec computes EXACTLY", and it named Toph as excluded for
  // having none. Admitting the phrase first would have set a CDA base P/T from a count that returned 0 — a
  // fabricated 0/0 on the battlefield, which is the exact failure that comment forbids.
  if (spec.kind === "countersOnPermanentsYouControl") {
    const needle = spec.cardType;
    if (!needle || !spec.counterType) return 0;
    const re = new RegExp(`\\b${needle}\\b`);
    let n = 0;
    for (const p of state?.players?.[perm.controller]?.battlefield || []) {
      if (re.test(typeLineOf(p.card))) n += (p.counters?.[spec.counterType] || 0);
    }
    return n;
  }
  // AURAS ATTACHED TO THE COUNTING PERMANENT (Kor Spiritdancer / Graceblade Artisan "gets +2/+2 for each
  // Aura attached to it"). The COUNT twin of the `isEnchanted` gate above — literally the same predicate
  // (`attachedTo === perm.id` plus an Aura type-line test, over EVERY player's battlefield) with `some`
  // swapped for a tally. All players, because an opponent's Aura attached to my creature still counts: the
  // clause says "attached to it", not "you control". An EXACT read of live back-pointer state, so a creature
  // wearing nothing contributes the printed 0 and never a fabricated number.
  // …and its two siblings, which are the SAME scan with a wider type test: "for each Equipment attached to
  // it" (Goblin Gaveleer, Myr Adapter) and the combined "for each Aura and Equipment attached to it"
  // (Champion of the Flame). `isEquipped` is the boolean twin of the Equipment arm exactly as `isEnchanted`
  // is of the Aura arm, so all three read the same already-maintained back-pointer.
  //
  // ⚠️ `perm` HERE IS THE AFFECTED PERMANENT, NOT THE EFFECT'S SOURCE — that is what makes the phrase mean
  // the right thing on an Equipment (Golem-Skin Gauntlets: "EQUIPPED CREATURE gets +1/+0 for each Equipment
  // attached to IT"). The equip lane fixes `affects` to the host, so by the time this runs the host's P/T is
  // what is being derived and `perm.id` is the host's. Counting against the SOURCE would tally Equipment
  // attached to the Gauntlets — always zero. Measured on a real board, not reasoned about; pinned.
  if (spec.kind === "aurasAttachedToSelf" || spec.kind === "equipmentAttachedToSelf" || spec.kind === "aurasAndEquipmentAttachedToSelf") {
    const attachRe = spec.kind === "aurasAttachedToSelf" ? /\baura\b/i
      : spec.kind === "equipmentAttachedToSelf" ? /\bequipment\b/i
        : /\b(?:aura|equipment)\b/i;
    let n = 0;
    for (const pid of Object.keys(state?.players || {})) {
      for (const p of state.players[pid]?.battlefield || []) {
        if (p.attachedTo === perm.id && attachRe.test(p.card?.type || "")) n += 1;
      }
    }
    return n;
  }
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
  // OPPONENTS-CONTROL count (BLITZ CA-2 — Wu Admiral "as long as an opponent controls an Island"; Syr
  // Ginger's "a planeswalker"; Night Revelers' "a Human"): the same word-bounded type-line scan as the
  // controller count below, over every LIVE opponent's battlefield (eliminated seats are removed from
  // state.players). Plain type-line read — recursion-safe like every other board-count gate source.
  if (spec.kind === "opponentsControl") {
    const oppNeedle = spec.cardType || spec.subtype;
    if (!oppNeedle) return 0;
    const oppRe = new RegExp(`\\b${oppNeedle}\\b`);
    let oppN = 0;
    for (const [pid, pl] of Object.entries(state?.players || {})) {
      if (pid === perm.controller) continue;
      for (const p of pl.battlefield || []) if (oppRe.test(typeLineOf(p.card))) oppN += 1;
    }
    return oppN;
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
  // COLOR-OR control gate (BLITZ AU-1 — the Runemark cycle "as long as you control a black or green
  // permanent"): the number of permanents THIS gate subject controls whose (printed) color set includes ANY
  // of the wanted WUBRG letters. `colorsOf` is the SAME recursion-safe printed reader colorsAmongPermanents
  // (Conqueror's Flail) already uses for a board-count gate — a layer-aware color read would re-enter
  // deriveCharacteristics inside this gate eval; a color-CHANGED permanent is the vanishing corner the
  // precedent accepts (over-counts only under a rare color-REMOVAL, under-counts a color-ADD = FN-safe). Used
  // only as a presence test (the gate carries atLeast:1), so the exact tally past 1 is immaterial.
  // ⭐ TWO OPTIONAL NARROWERS, added for the Cohort / Scarecrow cycles ("as long as you control ANOTHER
  // blue CREATURE" — Briarberry Cohort; "as long as you control a white creature" — Watchwing Scarecrow).
  // Both DEFAULT OFF, so the Runemark callers that predate them are byte-identical: `cardType` narrows the
  // scan to a type line (Creature), `excludeSelf` drops the gate subject itself.
  // ⛔ "ANOTHER" IS NOT DECORATION. Ballynock Cohort is itself a white creature, so without excludeSelf it
  // would satisfy its own gate on an empty board and buff itself forever — a permanent, unconditional
  // +1/+1 on a card that prints a conditional one. That is a false positive, not a rounding error.
  if (spec.kind === "colorPermanentsYouControl") {
    const want = new Set(spec.colors || []);
    if (want.size === 0) return 0;
    const typeRe = spec.cardType ? new RegExp(`\\b${spec.cardType}\\b`, "i") : null;
    let cn = 0;
    for (const p of player.battlefield || []) {
      if (spec.excludeSelf && p.id === perm.id) continue;
      if (typeRe && !typeRe.test(typeLineOf(p.card))) continue;
      if (colorsOf(p.card).some((c) => want.has(c))) cn += 1;
    }
    return cn;
  }
  // MULTI-NEEDLE type-line count — the SAME word-bounded scan as the single-needle branch below, with more
  // than one needle and an explicit join. "for each LEGENDARY CREATURE you control" (Benalish Honor Guard —
  // named in parseSelfCountSource's own doc comment as the shape that lane was written for) needs ALL of
  // {Legendary, Creature} on one type line; "for each ARTIFACT AND/OR ENCHANTMENT you control" (All That
  // Glitters, Nettlecyst) needs ANY of {Artifact, Enchantment}. The single-needle branch could express
  // neither, so both parked.
  // Each permanent is counted at most ONCE — that is the whole point of the "and/or" form: a card that is
  // BOTH an artifact and an enchantment contributes 1, not 2, which is what the printed card means.
  // COUNTERS ON THE COUNTED PERMANENT — "gets +1/+1 for each OIL COUNTER ON IT" (Necrosquito, Trawler
  // Drake, Exuberant Fuseling). A direct read of the live counters map: whatever is on the permanent is
  // what is counted, so the number is exact by construction and a permanent with none contributes 0.
  //
  // ⚠️ DISTINCT FROM `countersOnSource`, and the difference is the same one that produced a false positive
  // in the attached-count slice. This reads the AFFECTED permanent, which is what "it" means in BOTH
  // shapes: on a self-buff the affected IS the source, and on a granted buff ("Enchanted creature gets
  // +1/+1 for each oil counter on IT") "it" is the HOST, not the Aura. `countersOnSource` would read the
  // Aura's own counters there — always zero.
  //
  // THE COUNTER-KIND QUESTION IS ALREADY ANSWERED BY THE WHOLE-CARD LAW, which is why no kind allowlist is
  // needed here. If the line that PLACES the counters is unmodeled, that line is residue and the card stays
  // parked regardless of this arm. A card can only reach this evaluator when every one of its lines models,
  // placement included — so a zero count here means the permanent genuinely has no counters, not that the
  // engine failed to put them there. Verified on the real enter path: Necrosquito lands with {oil: 2}.
  if (spec.kind === "countersOnSelfSubject") {
    return spec.counterType ? (perm.counters?.[spec.counterType] || 0) : 0;
  }
  if (spec.kind === "permanentsYouControlMulti") {
    const needles = spec.allOf || spec.anyOf || [];
    if (!needles.length) return 0;
    const res = needles.map((n) => new RegExp(`\\b${n}\\b`));
    const joinAll = !!spec.allOf;
    return (player.battlefield || []).filter((p) => {
      const line = typeLineOf(p.card);
      return joinAll ? res.every((r) => r.test(line)) : res.some((r) => r.test(line));
    }).length;
  }
  if (spec.kind !== "permanentsYouControl") return 0;
  const needle = spec.cardType || spec.subtype;
  if (!needle) return 0;
  const re = new RegExp(`\\b${needle}\\b`);
  // untappedOnly (BLITZ CA-2 — Spur Grappler / Scoria Cat "as long as you control no untapped lands", an
  // atLeast:0/atMost:0 band over this filtered count): restrict to permanents whose live tapped flag is
  // false. Absent flag keeps the pre-existing unfiltered count — no behavior change for prior gates.
  return (player.battlefield || []).filter((p) => re.test(typeLineOf(p.card)) && (!spec.untappedOnly || !p.tapped)).length;
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
export const PERMANENT_TYPE_RE = /\b(?:creature|artifact|enchantment|land|battle|planeswalker)\b/i;
function countGraveyardSpec(state, perm, spec) {
  // ALL-GRAVEYARDS (BLITZ CDP-1 — the Lhurgoyf / Tarmogoyf CDA family "…cards in all graveyards" / "card
  // types among cards in all graveyards"): the source card list is EVERY player's graveyard rather than
  // only the controller's. The typed / delirium-card-types filters below are byte-identical either way —
  // only the collected card list differs. A plain zone read (never deriveCharacteristics — recursion-safe).
  const allGy = spec.kind === "cardsInAllGraveyards" || spec.kind === "cardTypesInAllGraveyards";
  const gy = allGy
    ? Object.values(state?.players || {}).flatMap((pl) => pl.graveyard || [])
    : (state?.players?.[perm?.controller]?.graveyard || []);
  if (spec.kind === "cardsInGraveyard" || spec.kind === "cardsInAllGraveyards") {
    // SUBTYPE-GY (BLITZ CA-2 — "a Warrior card is in your graveyard" / "there is a Desert card in your
    // graveyard"): a word-bounded match on the FULL type line (subtypes live RIGHT of the dash, so the
    // head-only split the card-TYPE branches use would never see them). The parser admits only a closed-
    // vocabulary single word (never a supertype/qualifier), so this is a faithful membership test.
    if (spec.subtype) {
      const subRe = new RegExp(`\\b${spec.subtype}\\b`, "i");
      return gy.filter((c) => subRe.test(typeLineOf(c))).length;
    }
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
  // cardTypesInGraveyard (controller) OR cardTypesInAllGraveyards (every player) — distinct DELIRIUM card
  // types across the collected `gy`. Supertypes (Legendary/Basic/Snow/World) are deliberately excluded.
  const seen = new Set();
  for (const card of gy) {
    const head = typeLineOf(card).split("—")[0].toLowerCase(); // types/supertypes, before any subtypes
    for (const [re, key] of DELIRIUM_TYPE_RES) if (re.test(head)) seen.add(key);
  }
  return seen.size;
}

// CDA COUNT DISPATCHER (BLITZ CDP-1, CR 604.3 / 613.4a) — resolve a characteristic-defining P/T's `countSpec`
// to its live magnitude. Every branch is a plain zone-length read or a printed type-line scan — NEVER
// deriveCharacteristics — so a CDA that counts creatures/graveyard-types can't recurse into its own P/T derive
// (the SAME recursion-safety the layer-7c count-buff relies on). Routes: hand → live hand size; graveyard /
// all-graveyard (typed or delirium card-types) → countGraveyardSpec; everything else (permanentsYouControl,
// colorsAmongPermanents, …) → the board evaluator countSelfSpecOnBoard. A null/unknown spec is 0 (never
// emitted — the parser only produces a spec whose evaluator exists here; metric⇄runtime lockstep).
function countForSpec(state, perm, spec) {
  if (!spec) return 0;
  switch (spec.kind) {
    case "cardsInHand":
      return (state?.players?.[perm?.controller]?.hand || []).length;
    case "cardsInAllHands": {
      let n = 0;
      for (const pl of Object.values(state?.players || {})) n += (pl.hand || []).length;
      return n;
    }
    case "cardsInGraveyard":
    case "cardTypesInGraveyard":
    case "cardsInAllGraveyards":
    case "cardTypesInAllGraveyards":
      return countGraveyardSpec(state, perm, spec);
    default:
      return countSelfSpecOnBoard(state, perm, spec);
  }
}

// GATED-SELFBUFF / GATED-KEYWORD / GATED-GY: is a count-threshold gate currently OPEN for this permanent?
// Shared by the layer-7c ptModifyGated buff and the layer-6 gated keyword grant — the SINGLE evaluator so a
// P/T gate and a keyword gate can never diverge. An absent gate is always open (ungated). A BOARD gate counts
// the controller's matching permanents ("another" excludes the source); a GRAVEYARD gate counts cards / card
// types in the controller's graveyard (no self-exclusion — a graveyard card is never the gated permanent).
function gateMet(state, perm, gate) {
  if (!gate) return true;
  // YOUR-TURN gate (BLITZ DT-1 — "During your turn, this creature gets +N/+M", Hardy Veteran frame):
  // open exactly while the permanent's CONTROLLER is the active player. Re-evaluated every derive
  // pass like every other gate, so the buff flips precisely at the turn boundary (CR 611.2c).
  if (gate.kind === "yourTurn") return state?.activePlayer === perm.controller;
  // EQUIPPED gate: any Equipment on the battlefield is attached to this permanent (CR 301.5b).
  if (gate.kind === "isEquipped") {
    for (const pid of Object.keys(state?.players || {})) {
      const bf = state.players[pid]?.battlefield || [];
      if (bf.some(p => p.attachedTo === perm.id && /\bequipment\b/i.test(p.card?.type || ""))) return true;
    }
    return false;
  }
  // NOT-ATTACKING gate (BLITZ CA-1 — Arcades Sabboth "Each untapped creature you control gets +0/+2 as long
  // as it's not attacking"): open exactly while the gate's subject permanent is NOT a declared attacker. A
  // PER-CANDIDATE condition (no gateOn:"source" — the gate reads the AFFECTED creature), the same pure
  // state.combat.attackers read matchesSelector's `attacking` predicate uses, re-evaluated every derive pass
  // so the buff drops the moment the creature is declared and returns when combat clears (CR 611.3a live).
  if (gate.kind === "notAttacking") {
    return !(state?.combat?.attackers || []).some((a) => a?.permanentId === perm.id);
  }
  // ATTACKING gate (BLITZ CA-2 — Adanto Vanguard "As long as this creature is attacking, it gets +2/+0";
  // Kitesail Corsair's flying / Kor Scythemaster's first strike): the exact mirror of notAttacking above —
  // open while the gate's subject IS a declared attacker. Same pure state.combat.attackers read, so the
  // buff appears at attack declaration and drops when combat clears (CR 611.3a live re-evaluation).
  if (gate.kind === "attacking") {
    return (state?.combat?.attackers || []).some((a) => a?.permanentId === perm.id);
  }
  // ENCHANTED gate (BLITZ CA-2 — Fledgling Osprey / Skyrider Trainee "has flying as long as it's
  // enchanted"): any Aura on the battlefield is attached to this permanent (CR 303.4c). The exact mirror
  // of the isEquipped scan above with the Aura type test — a plain attachedTo + type-line read.
  if (gate.kind === "isEnchanted") {
    for (const pid of Object.keys(state?.players || {})) {
      const bf = state.players[pid]?.battlefield || [];
      if (bf.some(p => p.attachedTo === perm.id && /\baura\b/i.test(p.card?.type || ""))) return true;
    }
    return false;
  }
  // LIFE-TOTAL gates (BLITZ CA-2) — pure per-seat life reads, re-evaluated every derive (CR 611.3a):
  //   lifeAtLeast — "as long as you have 25 or more life" (Divinity of Pride / Angel of Vitality /
  //   Serra Ascendant's 30): the gate subject's CONTROLLER's live life total.
  //   opponentLifeAtMost — "as long as an opponent has 10 or less life" (Ruthless Cullblade / Guul Draz
  //   Vampire): ANY opponent qualifies (an eliminated seat is removed from state.players entirely, so
  //   only live opponents are scanned).
  if (gate.kind === "lifeAtLeast") {
    return (state?.players?.[perm.controller]?.life ?? 0) >= (gate.atLeast ?? 1);
  }
  if (gate.kind === "opponentLifeAtMost") {
    for (const pid of Object.keys(state?.players || {})) {
      if (pid === perm.controller) continue;
      if ((state.players[pid]?.life ?? Infinity) <= (gate.atMost ?? 0)) return true;
    }
    return false;
  }
  // OPPONENT HAND/GRAVEYARD/POISON gates (BLITZ CA-2) — plain zone-length / counter reads over LIVE
  // opponents (ANY opponent qualifies — the printed "an opponent" exists-quantifier):
  //   opponentCardsInHandAtMost — "an opponent has no cards in hand" (Guul Draz Specter).
  //   opponentGraveyardAtLeast — "an opponent has eight or more cards in their graveyard" (Tenured
  //   Oilcaster / Jace's Phantasm's ten).
  //   opponentPoisonAtLeast — "an opponent has three or more poison counters" (Corrupted — Bonepicker
  //   Skirge) / "an opponent is poisoned" (Viridian Betrayers, threshold 1); the per-seat poison tally
  //   combatResolution's infect/toxic path maintains.
  if (gate.kind === "opponentCardsInHandAtMost") {
    for (const pid of Object.keys(state?.players || {})) {
      if (pid === perm.controller) continue;
      if ((state.players[pid]?.hand || []).length <= (gate.atMost ?? 0)) return true;
    }
    return false;
  }
  if (gate.kind === "opponentGraveyardAtLeast") {
    for (const pid of Object.keys(state?.players || {})) {
      if (pid === perm.controller) continue;
      if ((state.players[pid]?.graveyard || []).length >= (gate.atLeast ?? 1)) return true;
    }
    return false;
  }
  if (gate.kind === "opponentPoisonAtLeast") {
    for (const pid of Object.keys(state?.players || {})) {
      if (pid === perm.controller) continue;
      if ((state.players[pid]?.poison || 0) >= (gate.atLeast ?? 1)) return true;
    }
    return false;
  }
  // MORE-CARDS-THAN-EACH-OPPONENT gate (BLITZ CA-2 — Okina Nightwatch / Secretkeeper "as long as you have
  // more cards in hand than each opponent"): a strict > against EVERY live opponent's hand size.
  if (gate.kind === "moreCardsInHandThanEachOpponent") {
    const mine = (state?.players?.[perm.controller]?.hand || []).length;
    for (const pid of Object.keys(state?.players || {})) {
      if (pid === perm.controller) continue;
      if ((state.players[pid]?.hand || []).length >= mine) return false;
    }
    return true;
  }
  // PER-TURN LEDGER gates (BLITZ CA-2) — exact per-seat tallies the engine already maintains (each is
  // incremented at its single chokepoint and reset for all seats on the per-game-turn cadence):
  //   spellsCastThisTurnAtLeast — "you've cast two or more spells this turn" (Brightspear Zealot; the
  //   TRIG-CAST2 spellsCastThisTurn ledger).
  //   gainedLifeThisTurn — "you gained life this turn" (Infusion — Tenured Concocter; the BLITZ LG-1
  //   lifeGainedThisTurn ledger).
  //   lostLifeThisTurn — "you've lost life this turn" (Essence Channeler; the lifeLostThisTurn ledger).
  if (gate.kind === "spellsCastThisTurnAtLeast") {
    return (state?.players?.[perm.controller]?.spellsCastThisTurn || 0) >= (gate.atLeast ?? 1);
  }
  // ⭐ CARDS-DRAWN-THIS-TURN gate ("As long as you've drawn two or more cards this turn, this creature has
  // deathtouch and lifelink" — Trench Stalker, Spinehorn Minotaur, Eyekite and 7 more). The exact sibling of
  // the spellsCastThisTurn read directly above, on a ledger that already exists: gameState's per-seat
  // `cardsDrawnThisTurn`, incremented at the draw chokepoint and reset for every seat at untap. Pure
  // ignition — the ledger, the effects, and the keywords were all already modelled; only the gate
  // vocabulary was missing, so the whole clause failed to parse and the card parked.
  // ⓘ The DRAW STEP counts. CR 121.3 draws are draws whoever performed them and however they were caused,
  // and the ledger is incremented at the single chokepoint, so "two or more" is naturally satisfied by the
  // turn's draw plus one more — which is exactly how these cards are meant to play.
  if (gate.kind === "cardsDrawnThisTurnAtLeast") {
    return (state?.players?.[perm.controller]?.cardsDrawnThisTurn || 0) >= (gate.atLeast ?? 1);
  }
  if (gate.kind === "gainedLifeThisTurn") {
    return (state?.players?.[perm.controller]?.lifeGainedThisTurn || 0) >= 1;
  }
  if (gate.kind === "lostLifeThisTurn") {
    return (state?.players?.[perm.controller]?.lifeLostThisTurn || 0) >= 1;
  }
  // ENTERED-THIS-TURN gate (BLITZ CA-2 — Crew Captain's indestructible / Thrasta & Drownyard Behemoth's
  // hexproof "as long as it entered this turn"): the permanent's own enteredOnTurn stamp (set by the
  // engine at battlefield entry) against the live global turn counter — the same read the
  // enteredThisTurn target restriction uses. Flips off exactly at the next turn boundary.
  if (gate.kind === "enteredThisTurn") {
    return perm.enteredOnTurn != null && perm.enteredOnTurn === state?.turn;
  }
  // UNTAPPED gate (BLITZ CA-1 — Juniper Order Advocate "As long as this creature is untapped, green
  // creatures you control get +1/+1"): open while the gate's subject permanent is untapped. Emitted with
  // gateOn:"source" for the group anthem (the SOURCE's tap state gates the whole group); the same live
  // perm.tapped read the SF-1 untapped/tapped selectors use (a tap is an immutable state update, so the
  // per-state memo re-derives on the post-tap state).
  if (gate.kind === "untapped") return !perm.tapped;
  // ⭐ MONSTROUS gate (CR 701.32d — "As long as this creature is monstrous, it has trample" — Fleecemane
  // Lion, Hundred-Handed One, Colossus of Akros and 5 more). The SIBLING of the untapped read directly
  // above, and pure ignition: `perm.monstrous` is a real latch already set by the monstrosity atom
  // (effects/atoms/counters.js applyMonstrosity), and every one of these carriers already has its
  // activation modelled. Only the gate vocabulary was missing, so the whole clause parked.
  // ⓘ Monstrosity is a ONE-WAY latch (CR 701.32b — a monstrous creature is monstrous forever), so this
  // needs no history and no timestamp: a live boolean read, re-evaluated like every other gate.
  if (gate.kind === "monstrous") return !!perm.monstrous;
  // CARDS-IN-HAND gate (BLITZ CA-1 — Neheb, the Worthy "As long as you have one or fewer cards in hand,
  // Minotaurs you control get +2/+0"): the gate subject's CONTROLLER's live hand size against an
  // atMost/atLeast band. A pure zone-array length read — no derive, no event history.
  if (gate.kind === "cardsInHand") {
    const n = (state?.players?.[perm.controller]?.hand || []).length;
    return (gate.atMost == null || n <= gate.atMost) && n >= (gate.atLeast || 0);
  }
  const spec = gate.countSpec;
  if (spec?.kind === "cardsInGraveyard" || spec?.kind === "cardTypesInGraveyard") {
    // BLITZ CA-2: an optional atMost bound admits the EMPTY-graveyard band (Gorilla Titan "as long as
    // there are no cards in your graveyard" → atLeast 0 / atMost 0). `??` (not `||`) so an explicit
    // atLeast:0 is honored; absent bounds keep the pre-existing open-ended ">= atLeast||1" semantics.
    const gyN = countGraveyardSpec(state, perm, spec);
    return gyN >= (gate.atLeast ?? 1) && (gate.atMost == null || gyN <= gate.atMost);
  }
  // SELF-COUNTER-GATED KEYWORD (CR 613.1f-adjacent, layer 6) — a keyword/buff this permanent has "as long as
  // it has N or more <counterType> counters on it" (Primordial Hydra's trample-at-10, Taborax's lifelink-at-5).
  // Read THIS permanent's own counter pile directly (per-permanent, like the keyword-counter seed) and compare
  // to the threshold. Re-evaluated every keyword/P-T read via gateMet, so the grant turns on the instant the
  // count crosses N and off if the count later drops (CR 613.7 continuous). No board scan — recursion-safe.
  if (spec?.kind === "countersOnSelf") {
    // TOTAL-COUNTERS form (BLITZ CA-2 — Warden of the Inner Sky "as long as this creature has three or
    // more counters on it"): a null counterType sums EVERY kind on the permanent's own pile (CR 122 —
    // "counters" unqualified counts all kinds). A named counterType keeps the single-pile read.
    const n = spec.counterType == null
      ? Object.values(perm.counters || {}).reduce((a, b) => a + (b || 0), 0)
      : (perm.counters?.[spec.counterType] || 0);
    // LEVEL-BAND upper bound (LV-1, CR 711.2a): a {LEVEL N1-N2} band is open only while
    // N1 <= count <= N2. An absent atMost keeps the pre-existing open-ended (">= atLeast")
    // semantics — Primordial Hydra / Taborax / Arixmethes gates carry no atMost and are untouched.
    // BLITZ CA-2: `??` (not `||`) so the NO-COUNTERS band (Roc Hatchling "as long as this creature has
    // no shell counters on it" → atLeast 0 / atMost 0) is honored; absent atLeast still defaults to 1.
    return n >= (gate.atLeast ?? 1) && (gate.atMost == null || n <= gate.atMost);
  }
  let n = countSelfSpecOnBoard(state, perm, spec);
  if (gate.excludeSelf && matchesCountSpec(perm, spec)) n -= 1;
  // EXACTLY-N band (BLITZ CA-1 — Homicidal Seclusion / Deadly Wanderings "as long as you control exactly
  // one creature"): an optional atMost upper bound on the board count. Absent atMost keeps the pre-existing
  // open-ended (">= atLeast") semantics for every prior control gate — no behavior change. BLITZ CA-2:
  // `??` (not `||`) admits the ZERO band ("you control no untapped lands" → atLeast 0 / atMost 0).
  return n >= (gate.atLeast ?? 1) && (gate.atMost == null || n <= gate.atMost);
}

// SOURCE-GATED continuous effect (BLITZ SG-1, CR 711.2a; live recompute 613.7-adjacent): the permanent whose state a gate is read
// AGAINST. By default that's the AFFECTED permanent (a self-buff / self-band static — the gate and the effect
// share a subject). `gate.gateOn === "source"` swaps the subject to the effect's SOURCE permanent (a leveler
// band anthem: the gate reads the SOURCE's level counters while the effect buffs the OTHER creatures it selects).
// The source is resolved live from e.source.permanentId (stamped at staticEffectsOf collection); effectAffects
// has already dropped any static effect whose source left the battlefield, so a null here only guards a torn-down
// state. Absent gateOn keeps the pre-existing self-subject semantics for every prior gate — no behavior change.
function gatePermForEffect(state, effect, affectedPerm) {
  if (effect?.op?.gate?.gateOn === "source") {
    return (effect.source?.permanentId && findPerm(state, effect.source.permanentId)) || null;
  }
  return affectedPerm;
}

const COLOR_PIPS = ["W", "U", "B", "R", "G"];
// DEVOID (CR 702.114, BLITZ DV-1) — a standalone "Devoid (This card has no color.)" keyword line. Detected via
// the Scryfall `keywords` array (authoritative) OR a whole-line oracle match (for a fixture that sets oracle but
// not keywords). Anchored to the WHOLE keyword line (+ optional reminder), so a grant ("Slivers you control have
// devoid …") or a "cast a spell with devoid" reference never matches.
function _isDevoidCard(card) {
  if ((card?.keywords || []).some(k => String(k).toLowerCase() === "devoid")) return true;
  return /^[ \t]*devoid\b[ \t]*(?:\([^)]*\))?[ \t]*$/im.test(String(card?.oracle || card?.oracle_text || ""));
}
/** A card's colors (the Scryfall `colors` array, else derived from mana-cost pips). Exported so the
 * targeting/protection path can read a SPELL's colors (CR 702.16b protection-from-color). */
export function colorsOf(card) {
  if (Array.isArray(card?.colors)) return card.colors.map(String);
  // DEVOID (CR 702.114) is a CHARACTERISTIC-DEFINING ability: the card is colorless in EVERY zone regardless of
  // its mana-cost pips. Real cards carry Scryfall's baked colors:[] (returned above), so this guards only a
  // fixture / reconstructed card that lacks a colors array — without it, colorsOf would wrongly derive ["R"]
  // from a devoid {2}{R} cost and (e.g.) let protection-from-red stop a colorless spell. Colorless is ALWAYS
  // correct for a devoid card, so this can only REMOVE a wrong color, never add one (the CREED).
  if (_isDevoidCard(card)) return [];
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
  // SELF CHOSEN-TYPE ADD (CR 205.1b, layer 4) — "This creature is the chosen type in addition to its other
  // types." The parser can only leave a MARKER, because the subtype added is this permanent's own stored
  // `chosenType` (set by the ETB auto-pick). Resolve it here, where the permanent is in hand. Emitted only
  // once a type has actually been chosen: before that there is nothing to add, and guessing one would be a
  // fabricated characteristic. The layer-4 applier already unions `op.subtypes`, so no new op kind is needed.
  if (permanent.chosenType && partials.some((p) => p?.selfChosenTypeAdd)) {
    partials.push({
      layer: 4,
      op: { subtypes: [permanent.chosenType] },
      affects: { mode: "self" },
      duration: { kind: "permanent" },
    });
  }
  // Attached-permanent bonus (CR 301.5 / 303.4): when this Equipment or Aura is ATTACHED
  // to a creature, its "Equipped/Enchanted creature gets +X/+Y / has [keyword]" effect
  // applies ONLY to that creature (affects fixed [attachedTo]). collectContinuousEffects
  // re-runs per state, so the bonus appears/disappears the instant attachedTo changes.
  if (permanent.attachedTo) {
    // ⚠️⚠️ KNOWN, BOUNDED IMPRECISION (ES-1, 2026-08-05) — READ THIS BEFORE "FIXING" IT.
    // By CR 613.1, "Enchanted CREATURE gets -4/-0" applies only while the enchanted permanent IS a
    // creature. Aether Meltdown / Mists of Littjara legally enchant an UNCREWED Vehicle (an artifact),
    // and this emits the P/T bonus anyway — so that Vehicle's derived power reads 3-4 = -1 instead of 3.
    // The CREWED reading is already CORRECT (-1), and both carriers modify POWER only, so the 0-toughness
    // SBA — the one place a wrong P/T turns lethal — is unreachable. Every consumer of a permanent's power
    // that was checked is creature-scoped; that was NOT exhaustively proven across all ~75 call sites, and
    // this comment deliberately does not claim it was.
    // ⛔ THE OBVIOUS FIX DOES NOT WORK, MEASURED: gating this on permanentIsCreature(state, attachedTo) is
    // RE-ENTRANT — permanentIsCreature runs the layer-4 derive, which collects continuous effects, which
    // calls this function. The guard answers false mid-flight and the ENTIRE attached-bonus system silently
    // stops applying (a plain Bear under an aura read its printed power, unbuffed). If this is ever worth
    // fixing, it needs a SHALLOW host-type read off state.continuousEffects (crew stores a layer-4 type add
    // scoped to the vehicle — see actionDispatcher.applyCrewVehicle), never the derive.
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
    // RECONFIGURE (CR 702.151b): while attached, a reconfigure Equipment is NOT a creature — the SAME shape
    // as bestow directly above, reached by paying the reconfigure cost instead of by casting for bestow.
    // ⛔ THIS IS THE LOAD-BEARING HALF OF THE RECONFIGURE SLICE. The attach half rides the equip lane, which
    // on its own would leave an attached Lizard Blades still a creature — free to attack and block while ALSO
    // pumping its host. Strictly better than printed, the forbidden direction. Emitted only while attachedTo
    // is set, so unattaching makes it a creature again with no extra bookkeeping (CR 702.151c).
    // Read off the printed oracle rather than a stamped flag: unlike bestow (a cast-time choice the flag
    // records) reconfigure is a property of the CARD, so there is nothing to stamp and nothing to lose.
    if (/^reconfigure\b/im.test(String(card?.oracle ?? card?.oracle_text ?? ""))) {
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
  // SOULBOND (BLITZ SL-1, CR 702.95b/e): a PAIRED soulbond creature confers its bond ability on BOTH itself and
  // its partner. Emit the bond descriptors (parseSoulbondBond — the SAME parse coverage.soulbondCardTier gates
  // on, so metric ≡ runtime) FIXED to both ids, but ONLY while the pairing is LIVE — the partner must still be
  // on THIS controller's battlefield AND a (printed) creature. The explicit teardown (detachPermanentFromAll on
  // leave, control.applyGainControl on control-change) clears soulbondPartner, and this liveness guard is the
  // belt-and-suspenders that makes any stale pointer inert (never a wrongly-persisting bond FP, CR 702.95e). A
  // PRINTED-creature check (not layer-aware) keeps this recursion-free — staticEffectsOf runs INSIDE the layer
  // collect — and is exact for the corpus (every soulbond carrier + its corpus partners are printed creatures).
  if (permanent.soulbondPartner) {
    const partner = findPerm(state, permanent.soulbondPartner);
    if (partner && partner.controller === permanent.controller
        && /\bCreature\b/.test(typeLineOf(card)) && /\bCreature\b/.test(typeLineOf(partner.card))) {
      const bond = parseSoulbondBond(card);
      if (bond) for (const e of bond) partials.push({ ...e, affects: { mode: "fixed", permanentIds: [permanent.id, permanent.soulbondPartner] } });
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
    // MASS-ANIMATION dynamic layer-4 ADD (BLITZ NV-1 — "All lands are N/N creatures that are still
    // lands"): a DYNAMIC type-add must be visible to SELECTORS too (an anthem's cardTypes ["Creature"]
    // must match an animated land — the same CR 613 layer-4-before-layer-6/7 dependency the fixed branch
    // below honors), but evaluating a dynamic selector HERE would recurse (matchesSelector →
    // effectiveTypeIdentity). RECURSION-FREE rule: honor ONLY a selector that carries nothing but
    // cardTypes, matched against the candidate's PRINTED types (cardTypesOf — Land is never dynamically
    // granted or removed in the modeled corpus, so the printed read is exact for the admitted carriers).
    // Any richer dynamic type-add selector is SKIPPED here (conservative: deriveCharacteristics still
    // applies it; selectors just don't see it — and no such emitter exists today).
    if (e.affects?.mode === "dynamic" && Array.isArray(e.op?.types) && e.op.types.length) {
      const sel = e.affects.selector || {};
      const onlyCardTypes = Object.keys(sel).every((k) => k === "cardTypes" || sel[k] == null);
      if (onlyCardTypes && Array.isArray(sel.cardTypes) && sel.cardTypes.length) {
        const printed = cardTypesOf(candidate.card);
        if (sel.cardTypes.every((t) => printed.includes(t))) {
          for (const t of e.op.types) if (!types.includes(t)) types.push(t);
        }
      }
      continue;
    }
    if (e.affects?.mode !== "fixed" || !e.affects.permanentIds?.includes(candidate.id)) continue;
    for (const t of e.op?.types || []) if (!types.includes(t)) types.push(t);
    for (const st of e.op?.subtypes || []) subtypes.push(String(st).toLowerCase());
  }
  return { types, subtypes };
}

// P/T-PREDICATE recursion guard (Tetsuko — see the powerOrToughnessAtMost branch below): permanent ids whose
// layer-aware P/T is being read FROM INSIDE a selector evaluation right now. A nested deriveCharacteristics
// for such an id (a) excludes the P/T-predicate grant (P/T-irrelevant — CR 613.1f vs 613.3) and (b) skips the
// memo write, so no keyword-less entry can ever be served to a later reader.
const _ptPredicateInProgress = new Set();
const _withKeywordInProgress = new Set(); // WD-1 — the withKeyword selector's re-entry guard, shared by FT-1's withoutKeyword twin (see matchesSelector)
// SF-1 — the LAYER-AWARE color selector's re-entry guard (colorless/notColors/multicolored/colors). permanentColors
// re-enters THIS candidate's deriveCharacteristics (the layer-7/6 color anthem is bucketed through effectAffects →
// back into matchesSelector), so a nested selector-color read finds the id here and bails as UNSELECTED (FN-safe —
// a color filter is layer-5-inert-to-layer-7, so the excluded anthem can't change the colors the nested pass
// computes), and that partial derive is NOT memoized (deriveCharacteristics' tail gates its memo write on this set
// too). Mirrors _ptPredicateInProgress exactly; terminates at depth 2 by construction.
const _selectorColorInProgress = new Set();

/**
 * MODIFIED (CR 700.9) — "A permanent is modified if it has one or more counters on it (see rule 122), if it
 * is equipped (see rule 301.5), or if it is enchanted by an Aura that is controlled by that permanent's
 * controller (see rule 303.4)."
 *
 * All three clauses are read LIVE off non-layered state (a counters map and the `attachedTo` back-pointers
 * every attachment carries — the SAME representation gateMet's `isEquipped` walks), so this is
 * recursion-free: no deriveCharacteristics, no permanentColors, no guard needed. Re-evaluated per collection,
 * so a creature becomes modified the instant a counter lands or an Equipment attaches, and stops being
 * modified when the last one leaves (CR 611.2c continuous).
 *
 * ⛔ THE AURA CLAUSE IS CONTROLLER-SCOPED AND THAT IS NOT A DETAIL. CR 700.9 counts an Aura only when the
 * PERMANENT'S OWN CONTROLLER controls it — an opponent's Pacifism does NOT make your creature modified. A
 * naive "any Aura attached" read would hand the anthem to creatures the printed card excludes, the forbidden
 * direction. Equipment carries no such clause (CR 301.5b — equipped is equipped, whoever owns the Equipment).
 */
function isModifiedPermanent(state, perm) {
  if (!perm) return false;
  for (const n of Object.values(perm.counters || {})) if ((n || 0) > 0) return true;
  for (const pid of Object.keys(state?.players || {})) {
    for (const p of state.players[pid]?.battlefield || []) {
      if (p.attachedTo !== perm.id) continue;
      const t = String(p.card?.type || p.card?.type_line || "");
      if (/\bequipment\b/i.test(t)) return true;                              // equipped — any controller
      if (/\baura\b/i.test(t) && p.controller === perm.controller) return true; // Aura ITS controller controls
    }
  }
  return false;
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
  // ATTACKING gate (BLITZ AT-1 — Orcish/Goblin Oriflamme, War Horn): the candidate must be a DECLARED
  // attacker right now. Reads state.combat.attackers — NON-layered state (the requiresCounter class, no
  // recursion) — re-evaluated per query, so the anthem tracks combat exactly (CR 611.2c continuous).
  if (selector.attacking && !((state?.combat?.attackers || []).some((a) => a?.permanentId === candidate.id))) return false;
  // LAYER-AWARE type identity (printed ∪ fixed layer-4 grants) — computed once for both the cardTypes and the
  // subtypes gates so an ANIMATED permanent (Vihaan's Treasure → "Construct Assassin artifact creature") is
  // seen as the Creature/outlaw it has BECOME (CR 613's layer-4-before-layer-6 dependency). Lazily — only when
  // a type/subtype gate is present (the common color/generic anthem skips it).
  const ident = (selector.cardTypes || selector.subtypes || selector.legendary || selector.notLegendary) ? effectiveTypeIdentity(candidate, state) : null;
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
  // LEGENDARY supertype gate (BLITZ SF-1 — CR 205.4; Rising of the Day "Legendary creatures you control get
  // +1/+0", Day of Destiny, Arvad the Cursed, Esika "Other legendary creatures you control have vigilance";
  // the negated twin is Flowering of the White Tree "Nonlegendary creatures you control get +1/+1"). "Legendary"
  // is a SUPERTYPE carried in effectiveTypeIdentity's type set (cardTypesOf keeps the type-line head's
  // capitalized words, so "Legendary Creature — X" yields "Legendary"). LAYER-AWARE (printed ∪ FIXED layer-4
  // grants) and recursion-free (effectiveTypeIdentity consults only fixed/self layer-4 effects), so no guard is
  // needed. Each direction is EXACT — a nonlegendary candidate never gets a `legendary` anthem, and vice versa.
  if (selector.legendary && !ident.types.includes("Legendary")) return false;
  if (selector.notLegendary && ident.types.includes("Legendary")) return false;
  // COLOR-QUALITY gates (BLITZ SF-1) — all read LAYER-AWARE via permanentColors (printed ∪ layer-5
  // setColor/addColor, the SAME read combatEvasion uses), so a color-changed permanent is judged by the color it
  // IS now, not its printed color (CR 105 / CR 613 layer 5): `colors` = has ANY listed color (the Liege cycle
  // "red creatures you control", now layer-aware); `notColors` = has NONE of them (Angel of Jubilation "Other
  // nonblack creatures you control"); `colorless` = zero colors (Ruination Guide / Forsaken Monument, devoid-safe
  // via colorsOf's seed); `multicolored` = two+ colors (Rienne, Glass of the Guildpact, the Maze cycle).
  // permanentColors → deriveCharacteristics re-enters THIS candidate's derive, so it is guarded exactly like the
  // P/T predicate: a nested read finds the id in _selectorColorInProgress and bails as UNSELECTED (FN-safe — a
  // color filter is layer-7-inert, so excluding the anthem leaves the nested pass's layer-5 colors exact), and
  // that nested derive is not memoized (deriveCharacteristics' tail gates on the same set). Terminates at depth 2.
  if (selector.colors || selector.notColors || selector.colorless || selector.multicolored) {
    if (_selectorColorInProgress.has(candidate.id)) return false;
    _selectorColorInProgress.add(candidate.id);
    let cols;
    try {
      cols = permanentColors(state, candidate.id);
    } finally {
      _selectorColorInProgress.delete(candidate.id);
    }
    if (selector.colors && !selector.colors.some(c => cols.includes(c))) return false;
    if (selector.notColors && selector.notColors.some(c => cols.includes(c))) return false;
    if (selector.colorless && cols.length !== 0) return false;
    if (selector.multicolored && cols.length <= 1) return false;
  }
  // TOKEN gate (Teysa Karlov — "Creature TOKENS you control have vigilance and lifelink"): the candidate
  // must be a token (CR 111.1 — card.token stamped at every token-mint chokepoint, incl. token copies). A
  // nontoken creature is skipped, so the anthem confers vigilance/lifelink to exactly the controller's
  // creature tokens. Re-read each collection, so a token entering/leaving updates the grant live.
  if (selector.token && !candidate.card?.token) return false;
  // NONTOKEN gate (Always Watching — "Nontoken creatures you control get +1/+1 and have vigilance";
  // Thraben Watcher — the "Other …" spelling). The EXACT inverse of the token gate directly above, reading
  // the same `card.token` stamp (CR 111.1), so the two can never disagree about what a token is. Re-read per
  // collection like its twin, so a token entering or a nontoken creature becoming a copy updates the grant
  // live. This is the half the corpus needed: the token direction shipped with Teysa Karlov and the negated
  // direction had no gate at all, so every "nontoken creatures you control …" anthem parked.
  if (selector.nontoken && candidate.card?.token) return false;
  // MODIFIED gate (CR 700.9 — Kodama of the West Tree, Artillery Enthusiast, Invigorating Hot Spring …).
  // Delegates to isModifiedPermanent above so the three-clause definition lives in exactly one place.
  if (selector.modified && !isModifiedPermanent(state, candidate)) return false;
  // TAP-STATE gates (BLITZ SF-1 — Builder's Blessing / Castle "Untapped creatures you control get +0/+2";
  // Saryth "Other untapped creatures you control have hexproof" / "Other tapped creatures you control have
  // deathtouch"; Adept Watershaper "Other tapped creatures you control have indestructible"). Reads the LIVE
  // `candidate.tapped` flag. Exact AND live because a tap/untap is an IMMUTABLE state update (updatePermanent →
  // a NEW state object) and deriveCharacteristics' memo is keyed per-state (WeakMap), so the anthem P/T
  // re-derives on the post-tap state — a creature that taps (e.g. attacks without vigilance) drops the buff that
  // same query, and untaps back into it (verified by the tap-flip runtime pin in the SF-1 test). Direct field
  // read: no derive, no recursion.
  if (selector.untapped && candidate.tapped) return false;
  if (selector.tapped && !candidate.tapped) return false;
  // COMMANDER gate (BLITZ BG-1 — Bastion Protector "Commander creatures you control get +2/+2 and have
  // indestructible"; the Background cycle "Commander creatures you own have …"). "Commander" is a
  // game-STATE quality, not a type-line word: the flag rides card.isCommander, stamped at seat build
  // (the same flag the conditional-both-commander cast gate reads). A non-commander candidate is
  // skipped; re-read each collection, so a commander leaving/re-entering the battlefield tracks live.
  if (selector.commanderOnly && candidate.card?.isCommander !== true) return false;
  // COUNTER-PAYOFF: a per-permanent counter gate (Herald of Secret Streams — "creatures you control WITH
  // A +1/+1 COUNTER on it …"). Re-evaluated each collection, so the grant tracks the counter dynamically.
  if (selector.requiresCounter && (candidate.counters?.[selector.requiresCounter] || 0) <= 0) return false;
  // ANY-COUNTER gate (Cathedral Acolyte — "each creature you control WITH A COUNTER ON IT …"): any kind,
  // any amount > 0. Re-evaluated per query like requiresCounter.
  if (selector.requiresAnyCounter && !Object.values(candidate.counters || {}).some((n) => (n || 0) > 0)) return false;
  // P/T-PREDICATE (Tetsuko — "creatures you control with POWER OR TOUGHNESS N OR LESS …"): the candidate's
  // LIVE layer-aware power/toughness (layer 7 — counters + anthems + pumps), re-read at every query so a
  // mid-turn pump/debuff moves a creature in or out of the grant, exactly like the printed static. An
  // unsizeable stat (NaN — a CDA the engine can't size) fails the bound (FN-safe: never a wrongly-granted
  // evasion). RECURSION GUARD: deriveCharacteristics pre-buckets EVERY effect through effectAffects, so the
  // P/T read here re-enters deriveCharacteristics for the SAME candidate. The nested pass finds the
  // candidate in _ptPredicateInProgress and EXCLUDES this layer-6 grant — exact for that pass, because a
  // layer-6 keyword grant cannot influence layer-7 P/T (CR 613.1f vs 613.3), and the OUTER pass's memo
  // write (deriveCharacteristics tail) overwrites the nested keyword-less entry, so keyword readers always
  // see the final, correct set. Terminates at depth 2 by construction.
  if (selector.powerOrToughnessAtMost != null) {
    if (_ptPredicateInProgress.has(candidate.id)) return false; // nested P/T bucketing — the grant is P/T-irrelevant
    _ptPredicateInProgress.add(candidate.id);
    try {
      const pw = permanentPower(state, candidate.id);
      const tf = permanentToughness(state, candidate.id);
      const bound = selector.powerOrToughnessAtMost;
      if (!(Number.isFinite(pw) && pw <= bound) && !(Number.isFinite(tf) && tf <= bound)) return false;
    } finally {
      _ptPredicateInProgress.delete(candidate.id);
    }
  }
  // TOUGHNESS>POWER predicate (BLITZ DN-1 — Ancient Lumberknot's "each creature you control WITH TOUGHNESS
  // GREATER THAN ITS POWER assigns combat damage equal to its toughness …"): the candidate's LIVE
  // layer-aware toughness must EXCEED its power, re-read every query so a mid-combat pump/debuff moves a
  // creature in or out of the effect (CR 611.2c). Mirrors the powerOrToughnessAtMost predicate's recursion
  // guard exactly — this read re-enters deriveCharacteristics for the SAME candidate (line 896 buckets every
  // effect through effectAffects); the guard bails as UNSELECTED on re-entry, which is correct because this
  // static is P/T-inert (l6IndexOf never processes it), so it can't influence the nested P/T pass. An
  // unsizeable stat (NaN) fails the compare → never a wrongly-granted toughness substitution (FN-safe).
  if (selector.toughnessGreaterThanPower) {
    if (_ptPredicateInProgress.has(candidate.id)) return false;
    _ptPredicateInProgress.add(candidate.id);
    try {
      const pw = permanentPower(state, candidate.id);
      const tf = permanentToughness(state, candidate.id);
      if (!(Number.isFinite(pw) && Number.isFinite(tf) && tf > pw)) return false;
    } finally {
      _ptPredicateInProgress.delete(candidate.id);
    }
  }
  // CHOSEN-TYPE anthem (CR 614.12 — Banner of Kinship / Door of Destinies "Creatures you control of the
  // chosen type …"). The candidate must carry the SOURCE permanent's stored chosenType (subtype OR
  // changeling). controllerScope:"you" above already restricted to the source's controller. An unset
  // chosenType (malformed source) yields false → the anthem touches nobody (a SAFE no-op).
  if (selector.chosenTypeOfSource && !permHasChosenTypeLayer(candidate.card, sourcePerm?.chosenType, state, candidate.id)) return false;
  // WITH-KEYWORD gate (BLITZ WD-1 — Windstorm Drake / Empyrean Eagle / Spirit of the Spires: "Other
  // creatures you control WITH FLYING get +N/+M"): the candidate must HAVE the keyword right now,
  // LAYER-AWARE (permanentHasKeyword — printed ∪ keyword counter ∪ layer-6 grants), so an aura-granted
  // flyer is buffed exactly like a printed one and drops out the moment the grant expires (CR 613 —
  // layer 6 resolves before the 7c pump carrying this selector). RECURSION: permanentHasKeyword walks
  // ONLY the byKeyword-indexed grants of the QUERIED keyword, so a pump effect never re-enters itself;
  // the guard set below makes even a pathological CR 613.5 keyword-reads-keyword PAIR ("with flying
  // have vigilance" + "with vigilance have flying" — unprinted) terminate: the nested re-entry treats
  // the candidate as unselected for that pass (an FN-safe bail, never a stack overflow).
  if (selector.withKeyword) {
    const kwKey = candidate.id + "|" + selector.withKeyword;
    if (_withKeywordInProgress.has(kwKey)) return false;
    _withKeywordInProgress.add(kwKey);
    try {
      if (!permanentHasKeyword(state, candidate.id, selector.withKeyword)) return false;
    } finally {
      _withKeywordInProgress.delete(kwKey);
    }
  }
  // WITHOUT-KEYWORD gate (BLITZ FT-1 — the Falter class: "Creatures WITHOUT FLYING can't block this
  // turn"): the NEGATED twin of withKeyword above — the candidate must LACK the keyword right now, read
  // through the same LAYER-AWARE permanentHasKeyword (printed ∪ keyword counter ∪ layer-6 grants), so a
  // creature GRANTED flying mid-turn escapes the lock the moment the grant lands and a flyer that loses
  // its grant falls into it (CR 611.2c — a rules-modifying resolution effect "can affect objects that
  // weren't affected when that continuous effect began"). Shares _withKeywordInProgress (same
  // candidate.id+keyword key), and the re-entry bail MUST stay `return false` — treat the candidate as
  // NOT SELECTED. Merely skipping the keyword check on a bail would SELECT a candidate whose keyword
  // status is unknowable that pass, and for a restriction-granting effect that could lock a flyer out of
  // a legal block (a forbidden FP); the unselected bail only under-applies the lock (FN-safe). No modeled
  // vocabulary can re-enter this pair today — the guard is a termination backstop for a pathological
  // CR 613.5 keyword-reads-keyword cycle, exactly as on the positive gate.
  if (selector.withoutKeyword) {
    const kwKey = candidate.id + "|" + selector.withoutKeyword;
    if (_withKeywordInProgress.has(kwKey)) return false;
    _withKeywordInProgress.add(kwKey);
    try {
      if (permanentHasKeyword(state, candidate.id, selector.withoutKeyword)) return false;
    } finally {
      _withKeywordInProgress.delete(kwKey);
    }
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
  const ward = []; // GRANTED WARD (Cathedral Acolyte, CR 702.21) — addWard effects, read by permanentGrantedWardCosts
  for (const e of collectContinuousEffects(state)) {
    if (e.layer !== 6) continue;
    const op = e.op || {};
    if (op.layerOp === "addProtection") { protection.push(e); continue; }
    if (op.layerOp === "addWard") { ward.push(e); continue; }
    if (op.layerOp !== "addKeyword" && op.layerOp !== "removeKeyword") continue;
    const kw = String(op.keyword || "").toLowerCase();
    if (!kw) continue;
    let list = byKeyword.get(kw);
    if (!list) { list = []; byKeyword.set(kw, list); }
    list.push(e);
  }
  for (const list of byKeyword.values()) list.sort(byTimestamp);
  idx = { byKeyword, protection, ward };
  _l6IndexMemo.set(state, idx);
  return idx;
}

/**
 * GRANTED WARD (Cathedral Acolyte — "Each creature you control with a counter on it has ward {1}",
 * CR 702.21): the list of ward COSTS conferred on `permanentId` by layer-6 addWard effects right now
 * (each `{ generic }` — only fixed-generic grants are emitted today). Re-evaluated per query (the
 * counter-gated selector moves permanents in and out live), exactly like permanentProtectionColors.
 * ward.js unions these with the printed ward cost at the tax site.
 */
export function permanentGrantedWardCosts(state, permanentId) {
  const perm = findPerm(state, permanentId);
  if (!perm) return [];
  const out = [];
  for (const e of l6IndexOf(state).ward) {
    if (!effectAffects(e, perm, state)) continue;
    if (typeof e.op.generic === "number") out.push({ generic: e.op.generic });
    // LIFE-cost ward grants (Hexing Squelcher / Hag of Mage's Doom). A separate key rather than a second
    // number on the same one: the tax site can SUM two mana grants into one payment but cannot combine a
    // mana cost with a life cost into a single binary choice, so the two kinds must stay distinguishable.
    else if (typeof e.op.life === "number") out.push({ life: e.op.life });
  }
  return out;
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
  // stack). CDA-SELF-P/T-BY-COUNT: "[this creature]'s power [and toughness are each] equal to the number of
  // <X>" SETS the base from a LIVE count (Dakkon / Molimo — lands you control; Scion of the Wild — creatures
  // you control; Maro — cards in your hand; Revenant — creature cards in your graveyard; Tarmogoyf / Lhurgoyf
  // — card-types / creature cards in ALL graveyards). The count is read THIS computation via countForSpec (a
  // plain zone-length / type-line scan — recursion-safe, never deriveCharacteristics), so it tracks the count
  // both directions (a land/card enters → grows; leaves → shrinks). CDAs have no inter-CDA dependency in the
  // modeled set; apply each in timestamp order. `setPower`/`setToughness` gate which characteristic the CDA
  // defines (a power-only CDA leaves the printed toughness), and `powerOffset`/`toughnessOffset` add the fixed
  // Lhurgoyf/Tarmogoyf "…toughness is equal to that number plus 1" tail (`*/1+*`) on TOP of the set base
  // (still layer 7a — it's part of the characteristic-defining value, applied before 7c counters/pumps).
  for (const e of l7Effects.filter(e => e.sublayer === "7a").sort(byTimestamp)) {
    if (e.op?.layerOp !== "ptSetDynamicCount") continue;
    const n = countForSpec(state, perm, e.op.countSpec);
    if (e.op.setPower) basePower = n + (e.op.powerOffset || 0);
    if (e.op.setToughness) baseToughness = n + (e.op.toughnessOffset || 0);
  }
  // 7b — set base P/T ("base power/toughness becomes X/Y"). LEVEL-BAND (LV-1, CR 711.2a/b):
  // a leveler band's base-P/T set carries a level-counter gate — skip it while the gate is
  // closed (below the band the printed box stands, CR 711.5; gateMet re-evaluates live every
  // derive, CR 613.7). Pre-existing 7b ops carry no gate and are untouched.
  for (const e of l7Effects.filter(e => e.sublayer === "7b").sort(byTimestamp)) {
    if (e.op.gate && !gateMet(state, perm, e.op.gate)) continue;
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
        // TRUNK-SELFBUFF: magnitude = a live count × per-unit ("gets +X/+Y for each <countsource>").
        // The count is read for THIS permanent (its controller / its type line for the excludeSelf case),
        // re-evaluated here every P/T computation (so it tracks the board live).
        //
        // ⭐ countForSpec, NOT countSelfSpecOnBoard. The two were never joined: countForSpec handles the
        // ZONE kinds (hand / graveyard counts) and delegates EVERY other kind straight through to
        // countSelfSpecOnBoard, so this line's old call was a strict SUBSET of the dispatcher sitting one
        // level above it. The CDA lane has always gone through the full dispatcher; the self-buff lane never
        // did, which is why an exact evaluator that already shipped ("cards in your hand", the typed
        // graveyard counts) was unreachable from here no matter what the vocabulary said. Behaviour for
        // every previously-admitted spec is byte-identical BY CONSTRUCTION — same function, one hop later.
        //
        // ⭐ "YOUR"/"YOU CONTROL" IS THE SOURCE'S CONTROLLER, NOT THE BUFFED CREATURE'S (CR 109.5). On a
        // self-buff they are the same permanent and nothing changes. On a GRANTED buff — an Aura or
        // Equipment pumping its host — they diverge the moment the host is not the granter's. Quag Sickness
        // ("Enchanted creature gets -1/-1 for each Swamp YOU control") is a removal Aura whose NORMAL use is
        // on an opponent's creature, and it was counting the OPPONENT's Swamps. Measured before the fix:
        // Empyrial Armor controlled by the user, enchanting an AI creature, with three cards in the user's
        // hand and none in the AI's, buffed by +0/+0 instead of +3/+3.
        // The SUBJECT of the count stays the affected permanent (`perm.id` — that is what makes "for each
        // Equipment attached to it" mean the host's Equipment); only the PERSPECTIVE moves to the source.
        // Hence the spread rather than passing `src` outright: affected identity, source viewpoint.
        const cs = e.source?.permanentId ? findPerm(state, e.source.permanentId) : null;
        const subject = cs && cs.controller !== perm.controller ? { ...perm, controller: cs.controller } : perm;
        n = countForSpec(state, subject, e.op.countSpec);
      }
      power += n * (e.op.perPower || 0);
      toughness += n * (e.op.perToughness || 0);
    } else if (e.op.layerOp === "ptModifyGated") {
      // GATED-SELFBUFF: a FIXED buff applied ONLY while a threshold holds ("gets +X/+Y as long as you control
      // a/another/N <type>"). Re-evaluated live every P/T computation via the shared gate. SG-1: a leveler band
      // GROUP anthem carries gate.gateOn "source" — gatePermForEffect swaps the gate's subject to the effect's
      // SOURCE (the leveler's own level counters) so the anthem flips at the SOURCE's band boundary while
      // buffing the OTHER creatures the dynamic selector already matched (effectAffects, above the switch).
      const gatePerm = gatePermForEffect(state, e, perm);
      if (gatePerm && gateMet(state, gatePerm, e.op.gate)) { power += e.op.power || 0; toughness += e.op.toughness || 0; }
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
  const selfEffectsAll = board.length ? board.filter(e => effectAffects(e, perm, state)) : [];

  // ===== LAYER 1 — COPY (CR 613.1a / 707.9) =====================================================
  // Layers 1–3 were no-op pass-throughs, so a permanent could never BECOME a copy of something
  // else ("~ becomes a copy of target creature until end of turn" — Sarkhan, Soul Aflame; Scion of
  // the Ur-Dragon; 34 corpus cards). The `copiableValues` field below has been reserved for this
  // since the layer engine was written.
  //
  // A copy effect replaces the permanent's COPIABLE VALUES — what the printed card would be — and
  // every later layer then applies ON TOP of the new base (CR 613.1a). So the whole implementation
  // is: swap the card the printed-value readers see, then leave layers 4–7 completely untouched.
  // That ordering is the rule; doing it any later would let an anthem or a counter be computed
  // against the OLD body and then silently kept.
  //
  // ⛔ COUNTERS ARE NOT COPIABLE (CR 707.2) — and they must survive the copy, because they are on
  // the PERMANENT, not the card. Substituting only `card` keeps `perm.counters` intact, so a
  // creature with two +1/+1 counters that becomes a copy of a 1/1 is a 3/3. Rebuilding the
  // permanent instead would have quietly dropped them.
  //
  // TIMESTAMP ORDER (CR 613.7b): the LATEST copy effect wins — two copy effects on one permanent
  // resolve in timestamp order and the last one is what the object is.
  // The `&& e.copiableCard` clause is BELT-AND-BRACES, not load-bearing — measured, not assumed: removing
  // it leaves every assertion green, because a malformed record yields `copySource === undefined` and the
  // `copySource ? …` checks below already fall through to the printed permanent. It is kept so the variable
  // name means what it says (well-formed copy effects), and labelled so a later reader does not mistake it
  // for the thing that makes the malformed case safe. That protection is downstream.
  const copyEffects = selfEffectsAll.filter(e => e.layer === 1 && e.op === "copy" && e.copiableCard);
  const copySource = copyEffects.length
    ? copyEffects.reduce((a, b) => ((b.timestamp ?? 0) >= (a.timestamp ?? 0) ? b : a)).copiableCard
    : null;
  const permBase = copySource ? { ...perm, card: copySource } : perm;
  // Layers 2+ still run; only the layer-1 records are consumed here.
  const selfEffects = copyEffects.length ? selfEffectsAll.filter(e => !(e.layer === 1 && e.op === "copy")) : selfEffectsAll;

  let result;
  if (selfEffects.length === 0 && !copySource) {
    // Fast path — no continuous effects touch this permanent. Printed + counters.
    const delta = counterPtDelta(perm);
    result = {
      permanentId,
      power: printedPower(permBase) + delta,
      toughness: printedToughness(permBase) + delta,
      basePower: printedPower(permBase),
      baseToughness: printedToughness(permBase),
      keywords: keywordSet(permBase, []),
      types: cardTypesOf(permBase.card),
      subtypes: subtypesOf(permBase.card),
      colors: colorsOf(permBase.card),
      appliedEffects: [],
      copiableValues: copySource || null,
    };
  } else {
    // Full path. Layers 1–3 (copy/control/text) are no-op pass-throughs.
    const l7 = selfEffects.filter(e => e.layer === 7);
    const l6 = selfEffects.filter(e => e.layer === 6);
    const l5 = selfEffects.filter(e => e.layer === 5);
    const l4 = selfEffects.filter(e => e.layer === 4);
    const pt = applyLayer7(state, permBase, l7);
    result = {
      permanentId,
      power: pt.power,
      toughness: pt.toughness,
      basePower: pt.basePower,
      baseToughness: pt.baseToughness,
      keywords: keywordSet(permBase, l6, state),
      ...applyTypeColorLayers(permBase, l4, l5, state),
      appliedEffects: selfEffects.map(e => ({
        id: e.id, layer: e.layer, sublayer: e.sublayer || null,
        op: e.op, sourceCardName: e.source?.cardName || null,
      })),
      copiableValues: copySource || null,
    };
  }

  // SELECTOR-PREDICATE guard: a derive that ran while THIS permanent's P/T (the Tetsuko powerOrToughnessAtMost
  // branch) or COLORS (the SF-1 layer-aware color gates) were being read from inside a selector excluded the
  // in-flight anthem/grant from its effect set — exact for the P/T or colors the caller wanted, but the rest of
  // the result (keyword set, or the anthem's own P/T buff) would be partial. Don't memoize either partial entry;
  // the next un-guarded derive computes (and caches) the complete one.
  if (!_ptPredicateInProgress.has(permanentId) && !_selectorColorInProgress.has(permanentId)) permMemo.set(permanentId, result);
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
    // SET-CREATURE-SUBTYPES (CR 205.1b / 613.1d — the Mistform cycle): "becomes the creature type of your
    // choice" REPLACES the permanent's creature types rather than adding to them, which is the whole
    // difference between Mistform Dreamer and Mistform Sliver's "in addition to its other types".
    //
    // ⛔ ONLY THE CREATURE SUBTYPES ARE REPLACED. The op carries the printed creature subtypes it is
    // superseding (`replaces`, snapshotted at resolution from the card's own type line) and deletes exactly
    // those — never the whole `subtypes` set, which can also hold artifact/land/enchantment subtypes
    // (Equipment, Vehicle, a Sliver's land half) that a creature-type change has no business touching.
    // Anything a LATER-timestamped layer-4 effect added is left alone, so this cannot silently undo a
    // subsequent change; the l4 list is already in application order.
    if (e.op?.layerOp === "setCreatureSubtypes") {
      for (const st of e.op.replaces || []) subtypes.delete(st);
      for (const st of e.op.subtypes || []) subtypes.add(st);
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
  // SUSPECTED (BLITZ EK-1, CR 701.60c) — a suspected permanent has menace and "This creature can't block"
  // for as long as it's suspected. Seeded like a keyword counter (before the layer-6 loop), so a later
  // "loses menace" removeKeyword still wins (last-wins) exactly as it does over a counter-granted keyword.
  // "cantblock" is the SAME pseudo-keyword the granted "can't block this turn" effects ride — the read
  // combatEvasion.canBlockAttacker already enforces at block legality.
  if (perm.suspected) { set.add("menace"); set.add("cantblock"); }
  for (const e of l6Effects.slice().sort(byTimestamp)) {
    const kw = String(e.op.keyword || "").toLowerCase();
    if (!kw) continue;
    // GATED-KEYWORD: gate closed → no grant this turn. gatePermForEffect (CA-1) resolves the gate's SUBJECT —
    // the affected permanent by default, the effect's SOURCE for a group grant carrying gate.gateOn:"source"
    // (Raksha Golden Cub: "As long as [Raksha] is equipped, Cat creatures … have double strike" reads
    // RAKSHA's equipped state, never the candidate cat's). Absent gateOn is byte-identical to the old read.
    if (e.op.gate) {
      const gp = gatePermForEffect(state, e, perm);
      if (!gp || !gateMet(state, gp, e.op.gate)) continue;
    }
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

/** BASE power (CR 613.4a — printed, or the layer-7b set value): the layer-7c/7d modifications (anthems,
 * pumps, ±1/±1 counters) are NOT included. The Jason-Bright dies intervening-if ("its power was different
 * from its base power") compares this against the full effective power at the death look-back. */
export function permanentBasePower(state, permanentId) {
  return deriveCharacteristics(state, permanentId).basePower;
}

/**
 * Does the permanent have `keyword` after layer 6? Seeds from the printed
 * primitive (keywords.hasKeyword — imported, NEVER shadowed) and unions granted
 * keywords + keyword counters. Optimized: on a board with no static/resolution
 * effects, short-circuits to the printed seed (+ counter) so the combat hot path
 * pays ≈ the old cost.
 */
/**
 * GOAD (CR 701.38) — which players GOADED this permanent right now.
 *
 * Goad's second half is "attacks a player other than YOU if able", and **YOU is the GOADER, not the
 * creature's controller** — that asymmetry is the entire mechanic. A plain keyword read can't express it,
 * so this resolves each live `goaded` grant back to the CONTROLLER OF THE EFFECT'S SOURCE (the Aura or
 * Equipment). Returns a Set of player ids, empty when the permanent isn't goaded.
 *
 * Reads the SAME gate-aware layer-6 index permanentHasKeyword walks, so a goad grant can never be live for
 * the must-attack half and stale for the defender half. The set is a SET because two opponents can each
 * goad the same creature — it must then avoid BOTH if it can.
 */
export function goaderControllersOf(state, permanentId) {
  const perm = findPerm(state, permanentId);
  const out = new Set();
  if (!perm) return out;
  const grants = l6IndexOf(state).byKeyword.get("goaded");
  if (!grants || grants.length === 0) return out;
  for (const e of grants) {
    if (!effectAffects(e, perm, state)) continue;
    if (e.op.gate) {
      const gp = gatePermForEffect(state, e, perm);
      if (!gp || !gateMet(state, gp, e.op.gate)) continue;
    }
    if (e.op.layerOp !== "addKeyword") continue;
    const src = e.source?.permanentId ? findPerm(state, e.source.permanentId) : null;
    if (src?.controller) out.add(src.controller);
  }
  return out;
}

export function permanentHasKeyword(state, permanentId, keyword) {
  if (!keyword) return false;
  const perm = findPerm(state, permanentId);
  if (!perm) return false;
  const kwLower = String(keyword).toLowerCase();
  const printed = hasKeyword(perm.card, keyword);
  const fromCounter = (perm.counters?.[kwLower] || 0) > 0;
  // SUSPECTED (BLITZ EK-1, CR 701.60c) — the suspected designation grants menace + "can't block"
  // ("cantblock" is the pseudo-keyword the granted can't-block reads already use: combatEvasion.
  // canBlockAttacker / attackerHasMenace both come through HERE, so the designation is enforced at the
  // real declare-blockers gate and combat resolution). Seeded like a keyword counter: a later layer-6
  // removeKeyword ("loses menace") still wins below (last-wins), never a hard override.
  const fromSuspect = !!perm.suspected && (kwLower === "menace" || kwLower === "cantblock");
  // KICKER keyword grant (BLITZ KK-1, CR 702.33e + 614.12) — "If this creature was kicked, it enters … and
  // with <keyword>" stamps perm.kickedKeywords (resolvers.enterPermanent, only for GRANTABLE_COMBAT_KEYWORDS).
  // Seeded exactly like fromSuspect: a durable per-permanent grant honored by EVERY read that funnels through
  // here (combat damage / evasion / summoning-sickness), overridable by a later layer-6 removeKeyword below.
  const fromKicked = Array.isArray(perm.kickedKeywords) && perm.kickedKeywords.includes(kwLower);
  const grants = l6IndexOf(state).byKeyword.get(kwLower);
  if (!grants || grants.length === 0) return printed || fromCounter || fromSuspect || fromKicked;
  let has = printed || fromCounter || fromSuspect || fromKicked;
  for (const e of grants) {
    if (!effectAffects(e, perm, state)) continue;
    // GATED-KEYWORD: gate closed → no grant. gatePermForEffect (CA-1) — gateOn:"source" reads the SOURCE's
    // state (Raksha's equipped bit), default reads the affected permanent (unchanged for all prior gates).
    if (e.op.gate) {
      const gp = gatePermForEffect(state, e, perm);
      if (!gp || !gateMet(state, gp, e.op.gate)) continue;
    }
    if (e.op.layerOp === "addKeyword") has = true;
    else if (e.op.layerOp === "removeKeyword") has = false;
  }
  return has;
}

/**
 * KEYWORD INSTANCE COUNT (SLIVER INTERIORS, BLITZ SP-1) — how many INSTANCES of `keyword` the permanent
 * has right now: the caller-supplied PRINTED count (a structural counter like flankingKeywordCount /
 * exaltedKeywordCount — layers can't parse oracle shapes) plus one per layer-6 addKeyword grant that
 * affects the permanent (gate-aware, timestamp order — the same index permanentHasKeyword reads). Serves
 * the instance-counted trigger keywords where each instance fires separately (flanking CR 702.25b,
 * exalted CR 702.83a): a granted instance stacks WITH a printed one ("Flanking" + Sidewinder's anthem =
 * 2 fires). A removeKeyword ("loses <kw>") strips the ABILITY entirely (CR 613.9 last-wins), so it zeros
 * the running total INCLUDING the printed count; a later re-grant counts again.
 */
export function keywordInstanceCount(state, permanentId, keyword, printedCount = 0) {
  const perm = findPerm(state, permanentId);
  if (!perm) return 0;
  const kwLower = String(keyword).toLowerCase();
  let n = Math.max(0, printedCount || 0);
  const grants = l6IndexOf(state).byKeyword.get(kwLower);
  if (!grants || grants.length === 0) return n;
  for (const e of grants) {
    if (!effectAffects(e, perm, state)) continue;
    // GATED-KEYWORD: gate closed → no grant. gatePermForEffect (CA-1) — same source-vs-affected resolution
    // as keywordSet/permanentHasKeyword, so an instance-counted gated group grant can never diverge.
    if (e.op.gate) {
      const gp = gatePermForEffect(state, e, perm);
      if (!gp || !gateMet(state, gp, e.op.gate)) continue;
    }
    if (e.op.layerOp === "addKeyword") n++;
    else if (e.op.layerOp === "removeKeyword") n = 0; // removal strips printed + prior grants (613.9)
  }
  return n;
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
    // GATED-PROTECTION (2026-08-12 — Mystic Familiar's threshold grant): an addProtection op may carry a
    // `gate`; skip it while the gate is closed, mirroring the layer-4/6/7c gate reads. Without this check
    // a gated grant would confer protection with the gate SHUT — a forbidden FP at all three enforcement
    // sites (combat damage / block / targeting). Every pre-existing addProtection op carries no gate and
    // is untouched.
    if (e.op.gate && !gateMet(state, perm, e.op.gate)) continue;
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
 * CR 302.6 — is this permanent summoning-sick RIGHT NOW, layer-aware? (BLITZ NV-1.) A PRINTED creature
 * carries the truth on its stamped flag (entry stamps it, untap clears it, crew re-stamps it — the flag
 * is authoritative there). A permanent that is a creature only BY LAYERS (a mass-animated land under
 * Nature's Revolt / Living Plane; a crewed Vehicle equivalently) is sick iff it ENTERED THIS TURN: its
 * flag is unreliable (non-creatures enter with summoningSick:false per the entry stamp; a stolen
 * permanent carries true), so the read is enteredOnTurn === state.turn gated on the LIVE layer-4
 * creature check — the layer read runs only for this-turn entries, so the mana/attack hot paths stay
 * cheap. HASTE is deliberately NOT consulted here: every call site pairs this with its own
 * permanentHasKeyword("Haste") check, so earthbend's printed haste and Vihaan's outlaw-anthem haste
 * keep those animations attacking exactly as before. Consumers: legalChoices (declare-attacker,
 * tap-for-mana, activate-ability {T} gate, double-mana-pool) + manaModel.manaSources.
 */
export function summoningSickNow(state, perm) {
  if (!perm) return false;
  if (/\bCreature\b/.test(String(perm.card?.type || perm.card?.type_line || ""))) return !!perm.summoningSick;
  if (perm.enteredOnTurn !== state?.turn) return false;
  return permanentIsCreature(state, perm.id);
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
export function grantedTriggeredQuotedFor(state, permanentId, lookBack = null) {
  const perm = findPerm(state, permanentId);
  if (!perm) {
    // DEAD-LOOK-BACK (BLITZ TG-1, CR 603.6e/603.10a): a permanent that just LEFT the battlefield still
    // fires its dies-trigger off its last-known abilities — including a temporarily GRANTED one (Feign
    // Death's "When this creature dies, …" grant is the whole point of the card). The selector walk above
    // needs a live permanent, but a STORED fixed-ids grant (grantUntilEot's resolution effect) names its
    // recipients explicitly, so it can be matched by id alone. STORED effects only (state.continuousEffects
    // — statics are collected live and can never carry a fixed-ids triggered grant), so the blast radius is
    // exactly the until-EOT grant vehicle; a dead id simply isn't in any list otherwise.
    const out = [];
    for (const e of state?.continuousEffects || []) {
      if (e.layer !== 6 || e.op?.layerOp !== "addAbility") continue;
      if (e.op.grant?.kind !== "triggered" || !e.op.grant.quoted) continue;
      if (e.affects?.mode !== "fixed" || !e.affects.permanentIds?.includes(permanentId)) continue;
      out.push(e.op.grant.quoted);
    }
    // DYNAMIC DEAD-LOOK-BACK (BLITZ BG-2, CR 603.6c/603.10a — Candlekeep Sage's "When this creature
    // enters or LEAVES the battlefield, draw a card" granted to commanders): a DYNAMIC selector grant
    // (a board static — the Background cycle, a Sliver lord) can't be matched by id alone, but the
    // leave/dies checkers hold the departed permanent's look-back { id, card, controller } — exactly the
    // candidate shape effectAffects/matchesSelector evaluate (type line, isCommander, controllerScope).
    // Passing it here lets the LEAVE half of a granted trigger fire off last-known information, exactly
    // like a printed trigger fires off the look-back's card. The dynamic-source rule in effectAffects
    // still requires the GRANTER on the battlefield at check time, so a carrier that left SIMULTANEOUSLY
    // with the recipient under-fires this half (a rare board-wipe corner, never a fabricated fire — the
    // versioned trade-off, mirroring the OWN≡CONTROL note at the selector parse site).
    if (lookBack?.card) {
      for (const e of collectContinuousEffects(state)) {
        if (e.layer !== 6 || e.op?.layerOp !== "addAbility") continue;
        if (e.op.grant?.kind !== "triggered" || !e.op.grant.quoted) continue;
        if (e.affects?.mode !== "dynamic" || !effectAffects(e, lookBack, state)) continue;
        out.push(e.op.grant.quoted);
      }
    }
    return out;
  }
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
  return triggerMultiplierCount(state, controllerId, "diesTriggerMultiplier");
}

/**
 * ATTACK-TRIGGER MULTIPLIER (Isshin, Two Heavens as One — CR 603.x): "If a creature ATTACKING causes a
 * triggered ability of a permanent you control to trigger, that ability triggers an additional time."
 * Teysa's twin, one word apart on the card and one layerOp apart here. NOTE the event it keys on is a
 * creature ATTACKING, not a creature you control attacking — an OPPONENT's attack that fires your
 * "whenever a creature attacks you" permanent is doubled too, which is a real Isshin line.
 */
export function attackTriggerMultiplierCount(state, controllerId) {
  return triggerMultiplierCount(state, controllerId, "attackTriggerMultiplier");
}

/**
 * CAST-TRIGGER MULTIPLIER (Veyran, Voice of Duality — CR 603.x): how many EXTRA times a triggered ability
 * of `controllerId`'s fires when THEY cast or copied an instant or sorcery. Teysa's and Isshin's twin,
 * one subject apart on the card and one layerOp apart here.
 *
 * Unfiltered, like the dies and attack counters: the printed subject ("you casting or copying an instant
 * or sorcery spell") is fully determined by the enqueue SITE — checkCastTriggers already fires only for a
 * cast, and its `whose` handling already scopes each watcher to the right caster — so there is nothing
 * left to test on the object here. The ENTERS counter is the odd one out precisely because its card can
 * name a filter (Panharmonicon's artifact-or-creature); no printed cast-multiplier does.
 */
export function castTriggerMultiplierCount(state, controllerId) {
  return triggerMultiplierCount(state, controllerId, "castTriggerMultiplier");
}

/**
 * ENTERS-TRIGGER MULTIPLIER (Panharmonicon, Yarok, Ancient Greenwarden — CR 603.x): how many EXTRA times
 * an ability of `controllerId`'s fires when `enteringCard` entered. Unlike its two siblings this one is
 * FILTERED — Panharmonicon doubles only for an artifact or creature, Greenwarden only for a land — so the
 * entering object's type line is tested per static rather than counting them all.
 */
export function etbTriggerMultiplierCount(state, controllerId, enteringCard) {
  return triggerMultiplierCount(state, controllerId, "etbTriggerMultiplier", (op) => enteringMatchesFilter(op?.entering, enteringCard));
}

/** Does the entering object satisfy a multiplier's printed filter? Word-anchored type-line reads. */
function enteringMatchesFilter(filter, card) {
  const t = String(card?.type || card?.type_line || "");
  if (!t) return false;                       // no type line to test → never double (FN-safe)
  switch (filter) {
    case "permanent": return true;
    case "artifact or creature": return /\bArtifact\b/i.test(t) || /\bCreature\b/i.test(t);
    case "creature": return /\bCreature\b/i.test(t);
    case "artifact": return /\bArtifact\b/i.test(t);
    case "land": return /\bLand\b/i.test(t);
    default: return false;                    // an unknown filter never doubles (FN-safe)
  }
}

/**
 * Shared counter for the trigger-multiplier statics — ONE walk, so the family can't drift apart.
 * `opMatches` is an optional extra gate on the static's own op (the enters filter uses it).
 */
function triggerMultiplierCount(state, controllerId, layerOp, opMatches = null) {
  if (!state || controllerId == null) return 0;
  const board = collectContinuousEffects(state);
  if (board.length === 0) return 0;
  let n = 0;
  for (const e of board) {
    if (e.op?.layerOp !== layerOp) continue;
    if (opMatches && !opMatches(e.op)) continue;
    // The static is self-affecting; its controller is the source permanent's LIVE controller.
    const src = e.source?.permanentId ? findPerm(state, e.source.permanentId) : null;
    if (src && src.controller === controllerId) n += 1;
  }
  return n;
}

/**
 * ASSIGNS-COMBAT-DAMAGE-BY-TOUGHNESS (BLITZ DN-1 — Doran, the Siege Tower; Belligerent Brontodon; Ancient
 * Lumberknot; modifies CR 510.1a — combat damage is otherwise assigned equal to power): does a LIVE
 * "assigns combat damage equal to its toughness rather than its power"
 * static currently apply to the permanent `permanentId`? Walks the same continuous-effect collection the
 * layer engine uses, filters to the rule-modifying `assignsCombatDamageWithToughness` statics
 * (staticAbilityParser emits one per unconditional carrier), and matches the affected creatures via the
 * SHARED effectAffects/matchesSelector (so the GLOBAL / "you control" / toughness>power / self scopes are
 * all honored, layer-aware). Consumed by combatResolution.resolveCombatDamage at the damage-amount site to
 * substitute creatureToughness for creaturePower for an affected DEALING creature. Pure. Returns false on the
 * empty board (no allocation) → a Doran-less combat is byte-identical to before this seam. Kept HERE (not
 * combatResolution) because only this module owns effectAffects/matchesSelector.
 */
export function assignsCombatDamageWithToughness(state, permanentId) {
  const perm = findPerm(state, permanentId);
  if (!perm) return false;
  const board = collectContinuousEffects(state);
  if (board.length === 0) return false;
  for (const e of board) {
    if (e.op?.layerOp !== "assignsCombatDamageWithToughness") continue;
    if (effectAffects(e, perm, state)) return true;
  }
  return false;
}

/**
 * ⭐ PLAYER HEXPROOF (CR 702.11d — "You have hexproof" means you can't be the target of spells or abilities
 * your OPPONENTS control): Leyline of Sanctity, Witchbane Orb, Aegis of the Gods, Orbs of Warding,
 * Metropolis Reformer, Keen-Eared Sentry, Spirit of the Hearth, Crystal Barricade.
 *
 * ⛔ THE FIRST PLAYER-SCOPED STATIC IN THE ENGINE. Every continuous effect until now has affected a
 * PERMANENT, so there was nowhere for "you have hexproof" to live and the whole family parked. Rather than
 * invent a player-affects mode (which every collector and selector would have to learn), this follows the
 * `assignsCombatDamageWithToughness` precedent directly above: the parser emits an INERT layer-6 op that
 * the layer engine skips wholesale (l6IndexOf only processes add/removeKeyword/Protection/Ward), and ONE
 * consumer reads it. The grant belongs to the SOURCE permanent's CONTROLLER, which is why this keys on
 * `e.source.permanentId`'s controller rather than on any affects-selector.
 *
 * ⓘ Hexproof stops TARGETING only. Damage, sacrifice edicts, "each player discards", and every other
 * untargeted effect are untouched — enumerateTargets is the single seam, which is exactly why this is
 * enforced there and nowhere else.
 */
export function playerHasHexproof(state, playerId) {
  if (!playerId || !state?.players?.[playerId]) return false;
  const board = collectContinuousEffects(state);
  for (const e of board) {
    if (e.op?.layerOp !== "playerHexproof") continue;
    const src = e.source?.permanentId ? findPerm(state, e.source.permanentId) : null;
    if (src?.controller === playerId) return true;
  }
  return false;
}

/**
 * ⭐ CAN'T-GAIN-LIFE (CR 614 prevention): "Players can't gain life." (Rampaging Ferocidon, Forsaken Wastes,
 * Havoc Festival, Sunspine Lynx, Everlasting Torment, Giant Cindermaw …) and its opponent-scoped twin
 * "Your opponents can't gain life." (Archfiend of Despair, Quakebringer, Gríma Wormtongue, Knight of Dusk's
 * Shadow …).
 *
 * The second player-scoped static, on the same INERT-op pattern as playerHasHexproof above — one op, one
 * consumer, the layer engine untouched. The two printed scopes ride the SAME op via `op.scope`:
 *   · "all"       — every player, INCLUDING the controller. These cards are symmetric and that is the point;
 *                   scoping them to opponents would hand their controller a one-sided prison they don't print.
 *   · "opponents" — every player EXCEPT the source permanent's controller.
 *
 * ⓘ Read from gameState.gainLife, the SINGLE life-gain chokepoint — so spell, trigger, lifelink and drain
 * are all covered by one check, and the "you gained life this turn" ledger correctly records ZERO for a
 * prevented gain (its `gained > 0` guard).
 * ⛔ NOT read from replacementEffects.applyLifeGainReplacement, which would have been the tidier home:
 * that module imports NOTHING by design (a documented cycle-safety property — triggers.js relies on it), and
 * reaching into layers.js from there would break it. gainLife already imports layers, so the check lands
 * there instead, immediately BEFORE the doublers: a prevented gain is prevented however many Rhox
 * Faithmenders are out, and zeroing after the fact would be the right answer by luck rather than by rule.
 */
/**
 * ⭐ LEGEND-RULE EXEMPTION (CR 704.5j) — is `perm` exempt from the legend rule right now?
 * Mirror Gallery ("The 'legend rule' doesn't apply." — global), Mirror Box (permanents you control),
 * Council of Reeds (creatures you control), Cadric Soul Kindler (tokens you control).
 *
 * ⛔⛔ WITHOUT THIS READER THOSE CARDS DID NOTHING. sba.js has enforced the legend rule for a while, but the
 * exemption side was never modelled — so Mirror Gallery, whose ENTIRE text is that one sentence, was an
 * inert 5-mana artifact. Same INERT-op pattern as playerHexproof / cantGainLife: the layer engine skips the
 * op entirely and gameState.applyLegendRule is the single consumer.
 *
 * ⛔ SCOPES ARE HONORED SEPARATELY, never flattened to "any exemption exempts everything":
 *   · "all"                  — Mirror Gallery: nobody's legend rule applies, whoever controls the artifact.
 *   · "permanentsYouControl" — only the SOURCE's controller is exempt (Mirror Box does not help opponents).
 *   · "creaturesYouControl"  — that, narrowed to creatures.
 *   · "tokensYouControl"     — that, narrowed to tokens (Cadric exempts his copies, not his originals).
 * Collapsing them would hand a controller a global exemption they never paid for.
 */
export function legendRuleExemptFor(state, perm) {
  if (!perm) return false;
  const board = collectContinuousEffects(state);
  for (const e of board) {
    if (e.op?.layerOp !== "legendRuleOff") continue;
    const scope = e.op.scope;
    if (scope === "all") return true;                       // global — controller-independent
    const src = e.source?.permanentId ? findPerm(state, e.source.permanentId) : null;
    if (!src?.controller || src.controller !== perm.controller) continue;
    if (scope === "permanentsYouControl") return true;
    if (scope === "creaturesYouControl" && /\bCreature\b/.test(String(perm.card?.type || perm.card?.type_line || ""))) return true;
    if (scope === "tokensYouControl" && perm.card?.token) return true;
  }
  return false;
}

/**
 * ⭐ MAXIMUM HAND SIZE (CR 402.2) for `playerId` — the default 7, adjusted by the SELF-SCOPED statics that
 * player controls: "Your maximum hand size is N" (set) and "increased/reduced by N" (delta).
 *
 * ⛔ SETS ARE APPLIED BEFORE DELTAS, in timestamp order within each group. CR 613 layers a "set" and a
 * "modify" by timestamp, but a set that lands AFTER a delta would otherwise wipe it — applying every set
 * first and then every delta is the reading that keeps both cards doing something, and matches how the
 * P/T layers treat 7b-then-7c. With one card of each in play (the common case) the two orderings agree.
 * ⛔ CLAMPED AT 0: a large "reduced by" must not produce a negative maximum.
 *
 * ⓘ Same INERT-op pattern as playerHexproof / cantGainLife / legendRuleOff — the layer engine skips the op
 * and gameEngine.cleanupDiscardExcess is the single consumer.
 */
export function maxHandSizeFor(state, playerId) {
  const board = collectContinuousEffects(state);
  const mine = [];
  for (const e of board) {
    if (e.op?.layerOp !== "maxHandSize") continue;
    const src = e.source?.permanentId ? findPerm(state, e.source.permanentId) : null;
    if (src?.controller === playerId) mine.push(e);
  }
  if (mine.length === 0) return 7;
  const byTs = [...mine].sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
  let max = 7;
  for (const e of byTs) if (e.op.mode === "set") max = e.op.n;
  for (const e of byTs) if (e.op.mode === "delta") max += e.op.n;
  return Math.max(0, max);
}

/**
 * ⭐ CAN'T-LOSE / CAN'T-WIN (CR 104.3a / 104.2a) — does a live static stop `playerId` losing (or winning)?
 * Platinum Angel, Herald of Eternal Dawn, Darksteel Angel, Lich's Mastery, Platinum Persecutor, and the
 * inverted drawback side, Abyssal Persecutor.
 *
 * ⛔ THE SUBJECT IS RESOLVED FROM THE SOURCE'S CONTROLLER, never assumed. `who:"you"` means the controller
 * of the permanent printing the line; `who:"opponents"` means everyone else; `who:"all"` means every player.
 * Abyssal Persecutor prints both halves INVERTED relative to Platinum Angel — its controller can't WIN and
 * its opponents can't LOSE — so a reader that treated "you" as "the good side" would hand its controller a
 * win the card exists to deny.
 *
 * ⓘ Same INERT-op pattern as playerHexproof / cantGainLife / legendRuleOff; learnSession's isPlayerDead and
 * hasWonGame are the only consumers.
 */
function gameOutcomeBlocked(state, playerId, layerOp) {
  if (!playerId || !state?.players?.[playerId]) return false;
  const board = collectContinuousEffects(state);
  for (const e of board) {
    if (e.op?.layerOp !== layerOp) continue;
    const who = e.op.who;
    if (who === "all") return true;
    const src = e.source?.permanentId ? findPerm(state, e.source.permanentId) : null;
    if (!src?.controller) continue;
    if (who === "you" && src.controller === playerId) return true;
    if (who === "opponents" && src.controller !== playerId) return true;
  }
  return false;
}
export function playerCantLoseGame(state, playerId) { return gameOutcomeBlocked(state, playerId, "cantLoseGame"); }
export function playerCantWinGame(state, playerId) { return gameOutcomeBlocked(state, playerId, "cantWinGame"); }

/**
 * ⭐ EMPTY-DRAW WIN (CR 614 — Laboratory Maniac) — does `playerId` control a live "if you would draw from
 * an empty library, you win instead" static? Always self-scoped (the printed line says "you"), so this is
 * gameOutcomeBlocked's shape without the who dispatch. The ONE consumer is gameState.drawCards.
 */
export function playerEmptyDrawWins(state, playerId) {
  if (!playerId || !state?.players?.[playerId]) return false;
  for (const e of collectContinuousEffects(state)) {
    if (e.op?.layerOp !== "emptyDrawWins") continue;
    const src = e.source?.permanentId ? findPerm(state, e.source.permanentId) : null;
    if (src?.controller === playerId) return true;
  }
  return false;
}

export function playerCantGainLife(state, playerId) {
  if (!playerId || !state?.players?.[playerId]) return false;
  const board = collectContinuousEffects(state);
  for (const e of board) {
    if (e.op?.layerOp !== "cantGainLife") continue;
    if (e.op.scope === "all") return true;
    const src = e.source?.permanentId ? findPerm(state, e.source.permanentId) : null;
    if (src?.controller && src.controller !== playerId) return true;   // "your opponents can't gain life"
  }
  return false;
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
    // SAVAGE ORDER (2026-08-14) — "until your next turn" (CR 514.2's named-point sibling): the effect
    // survives THROUGH other players' turns and expires at the CLEANUP of the first LATER turn — a
    // deliberate one-step approximation of "as your next turn begins" (the gap: the effect also covers
    // your own next turn's body; for indestructible-class grants that is strictly closer to printed
    // than endOfTurn's early drop, and the owner-turn-begin hook doesn't exist yet to do it exactly).
    // Expiry: any cleanup of a turn AFTER the stamp turn where the OWNER is the active player — the
    // caller threads activePlayer; without it (a legacy call) the effect survives (fail-open toward the
    // printed longer duration, never a premature strip of a protection the player paid for).
    if (d.kind === "untilOwnersNextTurn") {
      if (atCleanupOfTurn == null) return true;
      if (d.turn == null || !Number.isFinite(d.turn)) return false; // malformed → expirable (the endOfTurn discipline)
      return !(atCleanupOfTurn > d.turn && state.activePlayer === d.owner);
    }
    return true; // permanent / unhandled durations survive
  });
  if (kept.length === list.length) return state;
  return { ...state, continuousEffects: kept };
}

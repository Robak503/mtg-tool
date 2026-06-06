# SUBSYSTEM DESIGN 3: CR 613 layers

I now have everything I need. I have the complete picture: the readers (combatResolution, legalChoices, spellEffects, destroyLethalCreatures, boardContext/trapDetector read raw `card.power`), the single P/T accessor pattern, the `staticPTModifier` hook, `hasKeyword` (oracle + optional `card.keywords` array), the existing registry contract, the cleanup step location, and the exact CR rule numbers (verified against the JSON — note layer 7c for counters, not 7d as the prompt loosely said).

Here is the complete design.

---

# DESIGN: CR 613 Continuous-Effects / Layers System

## Subsystem (3) of the Phase-1 Foundation refactor for `app/src/lib/learn/`

---

## 0. Executive summary

Today, a permanent's power/toughness is computed by a single accessor (`gameState.creaturePower`/`creatureToughness`) that does `printed + (+1/+1 counters) − (−1/−1 counters) + staticPTModifier(state, perm)`. `staticPTModifier` reads a name-keyed registry in `cardEffects.js` (`Omnath`/`Kruphix`/`Horizon Stone`). Keyword detection is a separate, **printed-only** path (`keywords.hasKeyword`) that explicitly *cannot* see granted keywords (sliver lords, anthems, equipment). There is no notion of effect duration, no layer ordering, no cross-permanent characteristic derivation.

This design replaces that with a **real CR 613 layer engine**: one function, `deriveCharacteristics(state, permanentId)`, that collects **all** continuous effects from **all** sources (static abilities of other permanents, resolved spell/ability effects with durations, counters, CDAs), applies them in layer order (613.1) with timestamp (613.7) and dependency (613.8) ordering, and returns a permanent's effective `{ power, toughness, keywords, types, colors, … }`. Every reader that needs a derived characteristic calls a thin accessor over this. The existing registry (`Omnath`/`Kruphix`/`Horizon Stone`) is **re-expressed as continuous-effect descriptors** so its tests keep passing byte-for-byte.

The design is staged so the suite stays green at every sub-PR: infra lands behind the existing accessors first (delegation, no value change), then the registry ports, then broad anthem/lord/pump coverage lands additively.

**CR grounding (all verified against `knowledge/mtg-judge/data/cr/cr_current.json`):** 604.1, 604.2, 604.3 (static abilities + CDAs), 611.1, 611.2, 611.2a, 611.2c, 611.3 (continuous effects + their object-set fixing), 612.1 (text-changing, layer 3 — out of scope but reserved), 613.1 + 613.1a–g (the seven layers), 613.2/613.3/613.4 + 613.4a–d (sublayer ordering, CDAs first in 2–6, layer-7 sublayers), 613.5 (layer interaction example), 613.7/613.7a/613.7b/613.7c (timestamps), 613.8/613.8a/613.8b (dependency + loop handling), 613.9 (no-dependency timestamp resolution), 613.10 (player-affecting effects), 514.2 + 500.4 (cleanup/step-begin expiry of "until end of turn"/"this turn" and step-duration effects). **Correction to the brief:** +1/+1 and −1/−1 counters that modify P/T apply in **layer 7c** (613.4c: "Effects **and counters** that modify power and/or toughness"), *not* 7d. 7d (613.4d) is P/T **switch**. Keyword counters apply in **layer 6** (613.1f). This design uses the real rule numbers.

---

## 1. Cross-subsystem dependencies & contracts (flag for synthesis)

This subsystem sits downstream of the **Stack** and **Triggered-Abilities** designs. Explicit contracts:

| # | Contract | Owner | What layers needs |
|---|---|---|---|
| **C1** | `resolverKey` / data-driven resolution: stack/trigger payloads become serializable `{ kind, params }` descriptors instead of `onResolve` closures. | **Stack design** | When a pump spell (`Giant Growth`) resolves, its resolver must **register a continuous effect into `state.continuousEffects`** (see §3) rather than mutate P/T. The layers subsystem defines the *effect descriptor shape* and an `addContinuousEffect(state, descriptor)` helper; the Stack design's resolvers call it. **The descriptor must be JSON-serializable** — this design guarantees no closures in `state.continuousEffects`, consistent with Phase 1's serialization mandate. |
| **C2** | Timestamp source. | **Stack/engine** | 613.7b: a continuous effect from a resolving spell/ability gets a timestamp **when created**. We need a monotonic counter on `state` (`state.timestampCounter`). Static-ability effects derive their timestamp from the source permanent's `enteredOnTurn`/a per-permanent `timestamp` field set at ETB (613.7e — entering the battlefield gives a new timestamp). **Requires** `createPermanent` / the ETB path to stamp `permanent.timestamp`. This is a shared field; the synthesis must ensure the ETB path (engine) sets it. |
| **C3** | `hasKeyword` contract. | **this subsystem + keywords.js** | `keywords.hasKeyword(card, kw)` stays the **printed-only** primitive (combat keyword detection from oracle). The layer engine adds a **derived** keyword set; readers that must respect *granted* keywords call a new `permanentHasKeyword(state, permanentId, kw)` accessor. **No local `hasKeyword` shadow is introduced** — the layer engine *imports* `keywords.hasKeyword` to seed the printed set, then unions granted/removes lost keywords. (Gotcha #C3 in the brief: do not re-implement `hasKeyword` locally.) |
| **C4** | Counters live on `permanent.counters` (already true). | gameState | Layer 7c reads `permanent.counters["+1/+1"]`/`["-1/-1"]`; layer 6 reads keyword counters (e.g. `counters.flying`). No schema change to counters. |
| **C5** | SBA timing. | engine | `destroyLethalCreatures` (the shared lethal SBA) must read **post-layer** toughness. It already calls `creatureToughness(perm, state)`; once that delegates to the layer engine, SBAs automatically see anthem/pump/lord effects. **Contract:** the SBA must run *after* the layer pass conceptually — but since layers are derived on-read (not materialized), this is automatic. |
| **C6** | Persistence (Phase 3). | Persistence design | `state.continuousEffects` and `state.timestampCounter` must serialize. This design guarantees both are plain JSON. Phase-3 save/resume gets layer state for free. |

**The single hard ordering requirement for synthesis:** the Stack design's pump/anthem resolvers must call `addContinuousEffect`; therefore **this layers subsystem's `addContinuousEffect` + descriptor schema must land in the same or an earlier sub-PR than any Stack resolver that produces a continuous effect.** PR L1 (below) lands the schema + helper first, satisfying this.

---

## 2. The seven layers — scope decision

Full XMage-class layers is the *destination*; Phase 1 builds the **engine and the layers that matter for the cards the engine plays today**, with every other layer present as a no-op pass-through so the loop is complete and extensible. Concretely:

| Layer | Rule | Phase-1 status | Why |
|---|---|---|---|
| 1 copy | 613.1a | **stub pass-through** | No copy effects in the engine yet (no `Clone`). Reserved; the loop visits it. |
| 2 control | 613.1b | **stub pass-through** | No `Control Magic`/`Act of Treason` yet. Reserved. Note: control change also affects *who* anthems apply to — flagged in RISKS. |
| 3 text | 612.1, 613.1c | **stub pass-through** | No text-changing. Reserved. |
| 4 type | 613.1d | **implemented (additive)** | Needed for tribal lords ("other Slivers"), and for `Maskwood Nexus`-style "all creatures are every type". Phase-1 supports **adding** subtypes/types; full type *removal* deferred. |
| 5 color | 613.1e | **implemented (set/add)** | Needed for `Honor of the Pure` ("white creatures") + color-matters anthems. Phase-1 supports setting/adding colors. |
| 6 ability | 613.1f | **implemented** | **The granted-keyword gap.** Lords/anthems grant Flying/keywords; keyword counters; ability removal (`loses all abilities`) deferred. |
| 7 P/T | 613.1g, 613.4a–d | **implemented (7a CDA, 7b set, 7c modify+counters, 7d switch)** | The headline. Omnath = 7a CDA-style (actually a 7c modify but re-expressed; see §6). Anthems = 7c. Counters = 7c. Set-P/T (`becomes 0/1`) = 7b. Switch = 7d. |

Layers 1–3 are **explicit no-op stages in the pipeline** (the loop calls `applyLayer1(...)` which returns input unchanged), so adding copy/control/text later is "fill in the stub", not "rewrite the loop". This keeps the loop architecturally complete (matching XMage's structure) while bounding Phase-1 work.

---

## 3. Data shapes

### 3.1 Continuous-effect descriptor (`ContinuousEffect`)

A **fully JSON-serializable** record. Lives in `state.continuousEffects` (array) for spell/ability-generated effects, and is **synthesized on the fly** for static abilities (so static effects are never stored — they're recomputed from current board state each derive, satisfying 604.2's "active as long as the permanent remains").

```
ContinuousEffect = {
  id: string,              // "ceff-<n>"; stable for the effect's life
  source: {                // what created it
    kind: "static" | "resolution" | "counter",  // 611.3 vs 611.2 vs counters
    permanentId: string | null,  // the source permanent (static) or origin (resolution); null for game effects
    cardName: string | null,     // for logging/explain
  },
  timestamp: number,       // 613.7 — monotonic; lower = earlier
  layer: 4 | 5 | 6 | 7,    // which layer this effect is applied in (613.1)
  sublayer: "7a"|"7b"|"7c"|"7d" | null,  // only for layer 7 (613.4); null otherwise
  isCDA: boolean,          // 604.3 / 613.3 / 613.4a — applied before non-CDA in its layer
  duration: Duration,      // see §3.2
  affects: AffectSpec,     // which permanents this applies to (§3.3)
  op: EffectOp,            // what it does (§3.4)
}
```

### 3.2 Duration (`Duration`) — JSON, no closures (611.2a, 514.2, 500.4)

```
Duration =
  | { kind: "permanent" }                       // static abilities, "for as long as on battlefield" (default, 611.2a end-of-game)
  | { kind: "endOfTurn", turn: number }         // "until end of turn" — expires at cleanup of `turn` (514.2)
  | { kind: "untilYourNextTurn", player: string, expiresOnTurnStartCount: number }  // reserved
  | { kind: "endOfStep", phase: string, step: string }  // step-scoped (500.4)
```

Static-ability effects are never stored, so their duration is conceptually `permanent`; only **resolution** effects carry a real `Duration` in `state.continuousEffects`. Cleanup (514.2) filters `state.continuousEffects` by duration.

### 3.3 Affect spec (`AffectSpec`) — declarative selector, JSON

Two fundamentally different modes per 611.2c vs static abilities:

```
AffectSpec =
  // Static abilities (611.3): set re-evaluated every derive. "white creatures you control".
  | { mode: "dynamic", selector: Selector }
  // Resolution effects (611.2c): set FIXED when the effect began. "all white creatures" at resolution.
  | { mode: "fixed", permanentIds: string[] }
  // Single permanent (the common pump case: Giant Growth on one target).
  | { mode: "self", permanentId: string }

Selector = {
  controllerScope: "you" | "each" | "opponents",   // relative to source's controller
  controllerOf: string | null,    // resolved source controller (filled for dynamic static effects)
  cardTypes?: string[],           // e.g. ["Creature"]
  subtypes?: string[],            // e.g. ["Sliver"]  (tribal lords)
  colors?: string[],              // e.g. ["W"]       (Honor of the Pure)
  excludeSelf?: boolean,          // "other Slivers" — exclude the source permanent
}
```

`mode:"fixed"` is the 611.2c contract: a `Giant Growth` resolving on a target captures `permanentIds:[targetId]` **at resolution** and never re-selects (so re-targeting or color change later doesn't move it). `mode:"dynamic"` is 604.2/613.5: an anthem re-selects each derive (so a creature that becomes white later starts getting Honor of the Pure — exactly the 613.5 example).

### 3.4 Effect op (`EffectOp`) — what the layer does, JSON

```
EffectOp =
  // Layer 7
  | { layerOp: "ptModify", power: number, toughness: number }           // 7c: +X/+Y (anthems, pump, counters)
  | { layerOp: "ptModifyDynamic", fn: "omnathGreen" }                   // 7c but value depends on state — named, NOT a closure (§6)
  | { layerOp: "ptSet", power: number|null, toughness: number|null }    // 7b: "base P/T becomes X/Y"
  | { layerOp: "ptSwitch" }                                             // 7d: switch P/T
  // Layer 6
  | { layerOp: "addKeyword", keyword: string }                         // grant Flying, etc.
  | { layerOp: "removeKeyword", keyword: string }                      // "loses flying" (reserved)
  // Layer 5
  | { layerOp: "addColor", colors: string[] }
  | { layerOp: "setColor", colors: string[] }
  // Layer 4
  | { layerOp: "addType", types: string[], subtypes: string[] }
```

**Key serialization decision:** dynamic-value P/T (Omnath: "+1/+1 per unspent green") is encoded as a **named function reference** (`fn: "omnathGreen"`) resolved through a **module-level dispatch table** `DYNAMIC_PT_FNS`, *not* a stored closure. The table is code, not state; `state` only stores the string `"omnathGreen"`. This is the same pattern the Stack design uses for `resolverKey`, and it keeps `state` JSON-clean (Phase-1 mandate).

### 3.5 Derived characteristics (`Characteristics`) — the output

```
Characteristics = {
  permanentId: string,
  power: number,                 // post-layer-7 (floored at... no — CR allows negative; readers floor for damage)
  toughness: number,
  basePower: number | null,      // after 7b, before 7c (for "base P/T" refs)
  baseToughness: number | null,
  keywords: Set<string>,         // derived: printed ∪ granted ∖ removed
  types: string[],               // card types after layer 4
  subtypes: string[],
  colors: string[],              // after layer 5
  // provenance for the "explain" panel (Beginner difficulty teaching)
  appliedEffects: Array<{ id, layer, sublayer, op, sourceCardName }>,
}
```

Note: `power`/`toughness` may be negative (CR 107.1b / 613 allows it; e.g. −1/−1 counters below 0). **Damage/combat readers floor at 0** (combatResolution already does `Math.max(0, creaturePower(...))`). The SBA reads raw toughness (`tough <= 0` → dies). So the accessor returns the **true CR value** (can be negative) and callers floor where the rules say to. This matches today's `creaturePower` (returns `base + plus − minus + mod`, which can be negative). **No behavior change to the contract.**

### 3.6 State additions

```
state.continuousEffects: ContinuousEffect[]   // NEW — resolution-generated effects only. Default [].
state.timestampCounter: number                 // NEW — monotonic. Default 0.
permanent.timestamp: number                    // NEW — set at ETB (613.7e). Default: assigned from timestampCounter at createPermanent/ETB.
```

All three are plain JSON. `createGameState` initializes `continuousEffects: []`, `timestampCounter: 0`. `createPermanent` is extended to accept/assign `timestamp`.

---

## 4. Function signatures

New module: **`app/src/lib/learn/layers.js`** (the engine).

```js
// ─── The core derive (the single source of truth for characteristics) ───────────

/**
 * Derive a permanent's effective characteristics by applying ALL continuous
 * effects in CR 613 layer order. Pure; reads `state` (board + state.continuousEffects).
 * Returns a Characteristics object (§3.5). Memoized per (stateVersion, permanentId).
 */
export function deriveCharacteristics(state, permanentId): Characteristics

/**
 * Collect every continuous effect applicable to ANY permanent right now:
 *   - synthesize static-ability effects from every permanent's oracle (§5)
 *   - read resolution effects from state.continuousEffects
 *   - synthesize counter effects (7c +1/+1, 6 keyword counters) per permanent
 * Returns a flat ContinuousEffect[] (unsorted). Pure.
 */
export function collectContinuousEffects(state): ContinuousEffect[]

/**
 * Given the collected effects, produce the ordered application sequence for a
 * single target permanent: layer asc, then within layer CDAs first (613.3),
 * then timestamp (613.7), then dependency reordering (613.8/613.8b incl. loop).
 */
export function orderEffectsForPermanent(effects, permanentId, state): ContinuousEffect[]

// ─── Thin accessors the readers call ────────────────────────────────────────────

export function permanentPower(state, permanentId): number       // = deriveCharacteristics().power
export function permanentToughness(state, permanentId): number    // = deriveCharacteristics().toughness
export function permanentHasKeyword(state, permanentId, keyword): boolean   // derived keyword set; C3
export function permanentColors(state, permanentId): string[]
export function permanentTypes(state, permanentId): { types, subtypes }

// ─── Mutators on the resolution-effect list (called by Stack resolvers — C1) ────

/** Append a resolution-generated continuous effect; stamps timestamp + id. Pure. */
export function addContinuousEffect(state, descriptor /* sans id/timestamp */): { state, effectId }

/** Remove a continuous effect by id (e.g. source left battlefield for a stored one). Pure. */
export function removeContinuousEffect(state, effectId): state

/** CR 514.2 / 500.4: drop expired-duration effects. Called at cleanup + step begin. Pure. */
export function expireContinuousEffects(state, { atCleanupOfTurn?, atStepBegin? }): state

// ─── Static-ability synthesis (the oracle→effect interpreter, bounded in P1) ────

/**
 * For one permanent, return the continuous effects its STATIC abilities generate
 * (anthems/lords/grants). Reads oracle + a bounded interpreter + the ported
 * registry. Pure. Returns []. The Phase-2 oracle interpreter grows THIS function.
 */
export function staticEffectsOf(state, permanent): ContinuousEffect[]
```

New module: **`app/src/lib/learn/staticAbilityParser.js`** (Phase-2 grows it; Phase-1 ships a narrow version + the ported registry).

```js
/** Parse a permanent's oracle into static continuous-effect descriptors. Bounded. */
export function parseStaticAbilities(card): Array<Partial<ContinuousEffect>>  // sans id/timestamp/source
```

Module-level (in `layers.js`), **code not state**:

```js
const DYNAMIC_PT_FNS = {
  omnathGreen: (state, sourcePerm) => {
    const g = state?.players?.[sourcePerm.controller]?.manaPool?.G || 0;
    return { power: g, toughness: g };
  },
};
```

---

## 5. How static abilities are synthesized (the granted-keyword + anthem/lord path)

This is the heart of closing the gap. `staticEffectsOf(state, perm)` runs in two tiers:

1. **Ported registry** (exact, for the three known cards): `cardEffects.js` REGISTRY entries are re-expressed (§6) into descriptors.
2. **Bounded oracle interpreter** (`parseStaticAbilities`) — Phase-1 recognizes a *small, safe, high-confidence* grammar; Phase-2 broadens it. Patterns recognized in Phase-1:

| Oracle pattern | Descriptor produced | CR | Card examples |
|---|---|---|---|
| `Other <Subtype> creatures you control get +X/+X.` | layer 7c, `ptModify`, `affects: dynamic {subtypes:[S], controllerScope:"you", excludeSelf:true, cardTypes:["Creature"]}` | 613.4c, 604.2 | Sliver lords (most), tribal lords |
| `Other <Subtype>s you control have <keyword>.` / `Other <Subtype> creatures you control have <keyword>.` | layer 6, `addKeyword`, same dynamic affects | 613.1f | Galerider/Muscle Sliver-style grants |
| `<Color> creatures you control get +X/+X.` | layer 7c, `ptModify`, `affects: dynamic {colors:[C], controllerScope:"you", cardTypes:["Creature"]}` | 613.5 | Honor of the Pure |
| `Creatures you control get +X/+X.` | layer 7c, `ptModify`, `affects: dynamic {controllerScope:"you", cardTypes:["Creature"]}` | 613.4c | Glorious Anthem, Intangible Virtue (subtype-gated variant) |
| `Creatures you control have <keyword>.` | layer 6, `addKeyword` | 613.1f | Concordant Crossroads (haste), Levitation (flying) |

**Critical anti-fabrication guard (CLAUDE.md §1.2):** the interpreter matches at **ability-line positions** (start-of-line / after `; ` or `, `), reusing the exact discipline `keywords.js` already uses, so reminder text and conditional clauses don't false-match. Anything not matched produces **no effect** (a miss is safe — the creature just doesn't get the buff; it never fabricates one). Keyword names are validated against `COMBAT_KEYWORDS` ∪ a known-keyword set; unknown words are ignored, never granted.

**Static effects are NOT stored in `state`.** `collectContinuousEffects` calls `staticEffectsOf` for every battlefield permanent each derive. This is correct per 604.2 (active as long as the source is on the battlefield) and 613.5 (re-evaluated continuously). Memoization (§7) makes it cheap.

### 5.1 Granted keywords flowing into `hasKeyword` (C3)

`permanentHasKeyword(state, permId, kw)`:
1. Seed = `keywords.hasKeyword(perm.card, kw)` (printed; **imported, not shadowed**).
2. Apply layer-6 effects in order: `addKeyword` unions, `removeKeyword` removes (timestamp-ordered, 613.9 "last wins" already handled by ordering).
3. Keyword counters (613.1f) union (e.g. `counters.flying > 0`).

Readers that must respect granted keywords (combat evasion, can-attack haste check) switch from `hasKeyword(card, kw)` to `permanentHasKeyword(state, permId, kw)`. Readers that only have a raw `card` (no permanent/state) keep using `keywords.hasKeyword` — that's still correct for "printed" questions.

---

## 6. Migration: Omnath / Kruphix / Horizon Stone (zero behavior change)

The brief requires these keep working. Re-expression:

- **Omnath, Locus of Mana** — "+1/+1 for each unspent green." This is a self-buff whose magnitude depends on state. Descriptor: `{ layer:7, sublayer:"7c", op:{layerOp:"ptModifyDynamic", fn:"omnathGreen"}, affects:{mode:"self", permanentId}, source:{kind:"static",...}, duration:{kind:"permanent"} }`. `DYNAMIC_PT_FNS.omnathGreen` returns `{power: green, toughness: green}`. With 5 green → 1/1 + 5/5 = 6/6. **Matches the existing test (`cardEffects.test.js` line 42–47) exactly.** *(Rules note: Omnath's P/T-setting is technically a 7c modify in real MTG, applied in 7c after counters — same layer/sublayer either way for our purposes; documented in code.)*
- **Kruphix / Horizon Stone** — these are **mana-pool** effects (`manaDoesNotEmpty`), **not** characteristic/layer effects. They stay in `cardEffects.js` `manaDoesNotEmpty` **untouched**. The layer engine does **not** absorb mana behavior — out of CR-613 scope (mana emptying is CR 500.4, handled by `gameEngine.emptyManaPools` + `cardEffects.manaDoesNotEmpty`, which keeps working as-is).

**So the registry split is:** `cardEffects.manaDoesNotEmpty` (mana, stays) + the **P/T half** (`staticPT`) moves into the layer engine as a ported descriptor. `staticPTModifier` becomes a **thin shim** during transition (PR L2) and is deleted once `creaturePower`/`creatureToughness` delegate fully (PR L3). This keeps `cardEffects.test.js`'s mana tests green permanently and the Omnath P/T tests green through delegation.

---

## 7. Performance — memoization per state version (RISK: hot path)

`creaturePower`/`creatureToughness`/`hasKeyword` run in the combat hot path (per creature, per damage step, full-game autopilots — see `keywords.js` comment). `deriveCharacteristics` is far heavier than the old arithmetic (it scans all battlefields to synthesize static effects). Mitigation:

- **State-version memo.** `collectContinuousEffects` is the expensive part (it's the same for *every* permanent in a given state). Memoize its result keyed by a cheap **state identity**: a `WeakMap<state, ContinuousEffect[]>`. Because state is immutable (every helper returns a **new** object), the WeakMap key changes exactly when state changes — no stale reads, no manual versioning, GC-friendly. First `deriveCharacteristics` call on a state populates the cache; subsequent calls (e.g. all 20 combatants) reuse it.
- **Per-permanent memo.** A second `WeakMap<state, Map<permanentId, Characteristics>>` caches the final derived result per permanent per state.
- **Fast path.** If `collectContinuousEffects(state)` returns `[]` (no anthems, no pump, no registry hits) **and** the permanent has no counters, `deriveCharacteristics` returns printed values directly — i.e. a board with no continuous effects pays ~the old cost. This protects the ~250 Standard tests that have no such effects.

WeakMaps are module-level in `layers.js`. **No state mutation, no closures stored in state.** Purity preserved (the cache is a derived read cache, not game state — it never affects results, only speed).

---

## 8. File-by-file change list

### New files
- **`app/src/lib/learn/layers.js`** — the layer engine (§4). `deriveCharacteristics`, `collectContinuousEffects`, `orderEffectsForPermanent`, the accessors, the mutators, `staticEffectsOf`, `DYNAMIC_PT_FNS`, the memo WeakMaps.
- **`app/src/lib/learn/staticAbilityParser.js`** — `parseStaticAbilities` (bounded oracle→static-effect interpreter). Phase-2 grows this.
- **`app/src/lib/learn/layers.test.js`** — unit tests for ordering, durations, dependency, memo.
- **`app/src/lib/learn/staticAbilities.test.js`** — anthem/lord/grant coverage.
- **`app/src/lib/learn/layers.dependency.test.js`** — 613.8 dependency + loop cases.

### Changed files
- **`gameState.js`** —
  - `creaturePower(permanent, state)` / `creatureToughness(permanent, state)` become **thin delegations**: when `state` is passed, return `permanentPower(state, permanent.id)` / `permanentToughness(...)`; when `state` is null, keep `printed + counters` (preserves the "without state, printed only" test, `cardEffects.test.js:49`). **Same signature, same null-state behavior.** Import from `layers.js` (RISK: import cycle — see §11; broken by making `layers.js` import only data-reading helpers from `gameState.js`, or by extracting the printed-P/T primitive).
  - `createPermanent` gains `timestamp` (assigned from a passed counter or a module fallback; the ETB path in the engine stamps it). Default keeps tests that build permanents by hand working (timestamp defaults to `0`).
  - `createGameState` adds `continuousEffects: []`, `timestampCounter: 0`.
  - `destroyLethalCreatures` — **no code change** (already calls `creatureToughness(perm, state)`); it transparently gets layered toughness once delegation lands. Verified.
  - Remove the direct `import { staticPTModifier } from "./cardEffects.js"` once delegation lands (PR L3).
- **`cardEffects.js`** — `manaDoesNotEmpty` stays. `staticPT` for Omnath is **ported out** to a layer descriptor (registered via `staticEffectsOf`'s registry branch). `staticPTModifier` kept as a deprecated shim that delegates to the layer result during L2, deleted in L3. `_registry` retained for the mana half. Its tests for mana stay green; the Omnath-P/T tests move to asserting via `creaturePower(omnath, state)` (already how they assert — line 45 — so **no test change needed** for those).
- **`combatResolution.js`** — `creaturePower(perm, state)` / `creatureToughness(perm, state)` calls now route through layers (no source change — they already pass `state`). `hasKeyword(perm.card, kw)` calls switch to `permanentHasKeyword(state, perm.id, kw)` for **granted** keywords (Flying/Reach evasion is in legalChoices, but Trample/Deathtouch/Lifelink/First strike/Double strike here should respect grants too). RISK: test churn (§11) — vanilla-combat tests unaffected (no grants), but this is the behavior-extending change.
- **`legalChoices.js`** — the evasion check (`canBlock`, lines 407–411) and haste check (line 356) switch to `permanentHasKeyword(state, perm.id, kw)` so a granted Flying/Reach/Haste is respected. The `_internals.hasKeyword` export stays (printed primitive for tests). RRISK: a few legalChoices tests may need a `state` threaded — they already have it.
- **`gameEngine.js`** — `runStepActions` `cleanup` case: add `next = expireContinuousEffects(next, { atCleanupOfTurn: next.turn })` (CR 514.2) right where the comment "remove-until-end-of-turn effects are deferred" sits (line 206). Add `expireContinuousEffects(next, { atStepBegin: {phase, step} })` at step entry for step-scoped durations (500.4) — optional, can defer. ETB path: stamp `permanent.timestamp = state.timestampCounter++` when a permanent enters (C2).
- **`spellEffects.js`** — when a recognized effect is `pump` (Phase-2 adds `kind:"pump"`), `resolveSpellEffect` calls `addContinuousEffect(state, {layer:7, sublayer:"7c", op:{layerOp:"ptModify", power, toughness}, affects:{mode:"fixed", permanentIds:[targetId]}, duration:{kind:"endOfTurn", turn:state.turn}, ...})` instead of mutating. (Phase-2; the parser already exists, pump was explicitly deferred per its header.) Its existing damage/destroy/draw paths unchanged.
- **`boardContext.js` / `trapDetector.js`** — these read raw `card.power`/`card.toughness` for *heuristic* threat math (not rules-critical). **Phase-1: leave as-is** (they're AI heuristics, and over-precision isn't required). **Phase-2 optional:** route through `permanentPower(state, id)` so the AI sees anthem-buffed boards. Flagged, not required for green.

---

## 9. TDD sub-PR breakdown (each independently shippable, suite stays green)

**PR L1 — Infra: schema + helpers + empty pipeline (no behavior change).**
- Add `layers.js` with: descriptor schema (JSDoc), `state.continuousEffects`/`timestampCounter` init in `createGameState`, `addContinuousEffect`/`removeContinuousEffect`/`expireContinuousEffects`, `collectContinuousEffects` (returns `[]` when no effects — only counters synthesized), `deriveCharacteristics` with the **fast path** + layers 4–7 loop, accessors `permanentPower`/`permanentToughness`/`permanentHasKeyword`.
- **No reader rewired yet.** `creaturePower`/`creatureToughness` unchanged. The new accessors are tested in isolation against hand-built states.
- Tests: `layers.test.js` — counters via layer 7c match old arithmetic; empty board → printed; `addContinuousEffect` stamps timestamp; `expireContinuousEffects` drops `endOfTurn` of past turn. **Existing suite untouched → green.**

**PR L2 — Port the registry; delegate the P/T accessors (behavior-preserving).**
- `staticEffectsOf` gains the **registry branch**: Omnath → `ptModifyDynamic` descriptor. `cardEffects.staticPTModifier` becomes a shim that delegates (or is bypassed).
- `gameState.creaturePower`/`creatureToughness` delegate to `permanentPower`/`permanentToughness` when `state` is passed (else printed+counters). 
- **Verification target:** `cardEffects.test.js` (Omnath 1/1, 6/6, printed-only, non-registered, combat 6/6→34) passes **unchanged**. The full ~1184 suite stays green because delegation is value-identical for everything (fast path covers no-effect boards; counters reproduce old arithmetic; Omnath reproduces via the dynamic fn).
- Tests: extend `layers.test.js` with the Omnath descriptor path; add a parity test asserting `permanentPower === old creaturePower` across a matrix of counters.

**PR L3 — Cleanup expiry + remove the shim.**
- `gameEngine` cleanup calls `expireContinuousEffects` (514.2).
- Delete `cardEffects.staticPTModifier` + its `staticPT` registry entries (mana half stays). Remove `gameState`'s import of `staticPTModifier`.
- Tests: a "Giant Growth wears off at cleanup" test using a hand-injected `endOfTurn` effect (proves expiry) — even before the pump *spell* is wired, the **mechanism** is tested.

**PR L4 — Granted keywords into `hasKeyword` (the gap closes for keywords).**
- `permanentHasKeyword` unions layer-6 `addKeyword` effects + keyword counters with the printed `keywords.hasKeyword`.
- Rewire `combatResolution.js` and `legalChoices.js` (evasion + haste) to `permanentHasKeyword(state, id, kw)`.
- `staticAbilityParser` Phase-1 grammar: "Creatures you control have flying", "Other Slivers you control have <kw>".
- Tests: `staticAbilities.test.js` — a `Levitation`-style "creatures you control have flying" grants Flying to a vanilla creature; a Sliver lord grants Flying to other Slivers but not to the lord-source if "other"; vanilla-combat tests unchanged.

**PR L5 — Anthems / lords / P/T grants (Phase-2 breadth).**
- `staticAbilityParser` recognizes the §5 P/T patterns. `Honor of the Pure` (613.5), `Glorious Anthem`, Sliver/tribal +1/+1 lords.
- Dynamic `affects` (`mode:"dynamic"`) selection wired in `collectContinuousEffects`.
- Tests: `staticAbilities.test.js` — Honor of the Pure makes a white 2/2 a 3/3, doesn't touch a black creature; turning it white later makes it 3/3 (the literal 613.5 example); two anthems stack; lord doesn't pump itself when "other".

**PR L6 — Dependency + 7b set + 7d switch + timestamp ordering.**
- `orderEffectsForPermanent` implements 613.8/613.8b incl. dependency-loop fallback to timestamp.
- Layer 7b (`ptSet` "base power/toughness becomes 0/1") and 7d (`ptSwitch`).
- Tests: `layers.dependency.test.js` — a set-to-0/1 then +1/+1 anthem yields 1/2 (7b before 7c); a "switch P/T" after a +2/+0 (614.x ordering examples); timestamp tiebreak ("flying" vs "loses flying", 613.9 last-wins).

**PR L7 (Phase-2 hook) — pump spells generate effects via the Stack contract (C1).**
- `spellEffects.parseSpellEffect` adds `kind:"pump"`; `resolveSpellEffect` calls `addContinuousEffect` with `endOfTurn` + `fixed` affect.
- Tests: `Giant Growth` → +3/+3 until cleanup, then gone; integration test through `learnSession`.
- **Depends on C1/C2 from Stack design** — only land after the Stack refactor's resolvers are data-driven, so the pump effect's "creation at resolution" timestamp is consistent.

Each PR keeps the suite green; L1–L3 are **pure infra/delegation (zero value change)**; L4+ are **additive** (new cards behave; old cards unchanged).

---

## 10. Test plan

**New tests:**
- `layers.test.js` — collect/derive correctness; fast path; counters→7c parity; timestamp stamping; memo (call twice on same state object → `collectContinuousEffects` runs once, assert via a spy/call-count export).
- `staticAbilities.test.js` — every §5 pattern; anti-fabrication (a creature whose oracle says "can't be blocked by creatures with flying" must **not** be granted Flying; "gains trample" in an *activated*-ability line must not be a static grant).
- `layers.dependency.test.js` — 613.8a dependency detection, 613.8b ordering, loop→timestamp fallback (the exact CR loop case).
- `layers.duration.test.js` (or folded into layers.test) — `expireContinuousEffects` at cleanup (514.2) and step begin (500.4).

**Existing tests that shift (and why):**
- `cardEffects.test.js` — **Omnath P/T tests unchanged** (they assert via `creaturePower(omnath, state)`, which still returns the same numbers). The **mana tests unchanged** (mana half untouched). Only internal: if `staticPTModifier` is deleted in L3, its **direct** assertion (`expect(staticPTModifier(state, bear)).toBeNull()`, line 59) must be **moved/rewritten** to assert via the new path (`expect(permanentPower(state, bear.id)).toBe(2)`), since the symbol is gone. → one test edit in L3.
- `combatKeywords.test.js` — should stay green (printed keywords still detected; grants are additive). If any test built a permanent without a `timestamp` field and the new code assumes it, the `timestamp` default of `0` keeps them working. Verify.
- `manaEmptying.test.js`, `manaModel.test.js`, `manaWiring.test.js` — untouched (mana path unchanged).
- `legalChoices.test.js` — evasion tests now go through `permanentHasKeyword`; vanilla cases identical. A test that passes a bare `card` to an internal may need the `state`+`permId` — verify in L4.
- The ~250 Standard tests — protected by the fast path (no continuous effects on those boards → printed values).

**Regression guard:** a **parity test** in L2 (`permanentPower(state, id) === legacyCreaturePower(perm, state)` over a generated matrix of printed-P/T × counters × Omnath-green-amount) proves the delegation is value-identical before any reader is rewired.

---

## 11. RISKS

1. **Import cycle `gameState.js ↔ layers.js`.** `gameState` would import `layers` (for delegation) while `layers` imports `gameState` reads (`findPermanent`, `getPlayer`). *Mitigation:* `layers.js` imports **only pure read helpers** (`findPermanent`) — these don't import `layers`, so ES-module live-binding tolerates the cycle; **or** extract a tiny `ptPrimitive.js` (printed+counters) that both import, breaking the cycle cleanly. The second is safer; recommend it in L1. **Flag for synthesis: confirm with the Stack design whether it also imports `gameState`** to avoid a three-way cycle.

2. **Performance on the combat hot path.** `deriveCharacteristics` is O(battlefield) per call vs O(1) before. *Mitigation:* WeakMap state-version memo + the empty-board fast path (§7). The fast path makes no-effect boards (the common case, all Standard tests) pay ~the old cost. **Residual risk:** a 4P Commander board with several anthems derived for 20 creatures per damage step — measured acceptable given small states, but worth a benchmark in L5.

3. **Test churn on P/T values.** Any test that hard-codes a creature's P/T while an anthem is on the board will shift once L5 lands. *Mitigation:* L1–L4 are value-neutral; L5 introduces new behavior **only for boards that contain an anthem/lord** — existing fixtures rarely do. Audit `combatKeywords.test.js` / `combat.multidefender.test.js` for incidental lords before L5.

4. **Dependency loops (613.8b).** Naive dependency resolution can infinite-loop. *Mitigation:* detect cycles (visited-set during the dependency sort) and **fall back to pure timestamp order** exactly as 613.8b prescribes. Tested explicitly in L6.

5. **Static-effect re-synthesis correctness vs control changes.** Anthems are "creatures **you** control"; if a control-changing effect (layer 2, not built) later moves a creature, the `controllerScope:"you"` selector must read **post-layer-2** control. *Mitigation:* Phase-1 has no control effects, so `controller` is `permanent.controller` (correct). **Flag:** when layer 2 is built (future), `collectContinuousEffects` must derive control **before** selecting anthem targets — the loop order already does layer 2 before layer 7, but the *selector* must consult derived control. Documented as a known forward-dependency.

6. **611.2c fixed-vs-dynamic confusion.** Mixing up `mode:"fixed"` (resolution) and `mode:"dynamic"` (static) silently produces wrong "becomes white later" behavior (613.5). *Mitigation:* the descriptor's `source.kind` *forces* the mode (`static`→dynamic, `resolution`→fixed at creation); a unit test asserts a static anthem picks up a newly-white creature while a resolution "all white creatures get +1/+1" does not.

7. **Omnath sublayer fidelity.** Omnath's real-MTG behavior is a 7c modify; encoding it as `ptModifyDynamic` in 7c is faithful. *Risk:* if later a 7b set-effect interacts, ordering matters. *Mitigation:* L6's 7b/7c ordering test includes a dynamic-modify case. Low risk (no card in the engine sets Omnath's base P/T).

8. **Negative power floor divergence.** The accessor returns true (possibly negative) values; readers must floor where CR says. *Mitigation:* combat already floors (`Math.max(0, …)`); SBA reads raw (correct). A test asserts `permanentPower` can return negative and combat still deals 0.

---

## 12. Files read to ground this design (absolute paths)

- `C:\Users\colto\Documents\Claude\Projects\MTG-TOOL\app\src\lib\learn\gameState.js` — `creaturePower`/`creatureToughness` at **lines 134–149**; `staticPTModifier` import line 29; `destroyLethalCreatures` lines 635–655; `createPermanent` 108–123.
- `C:\Users\colto\Documents\Claude\Projects\MTG-TOOL\app\src\lib\learn\cardEffects.js` — REGISTRY (Omnath/Kruphix/Horizon Stone) lines 30–58; `manaDoesNotEmpty` 65–76; `staticPTModifier` 82–86.
- `C:\Users\colto\Documents\Claude\Projects\MTG-TOOL\app\src\lib\learn\keywords.js` — `hasKeyword` 55–64; `COMBAT_KEYWORDS` 18–29; ability-line regex discipline 39–49.
- `C:\Users\colto\Documents\Claude\Projects\MTG-TOOL\app\src\lib\learn\combatResolution.js` — P/T + `hasKeyword` readers, lines 36, 45, 72–75, 96–99, 127, 153–155.
- `C:\Users\colto\Documents\Claude\Projects\MTG-TOOL\app\src\lib\learn\legalChoices.js` — `hasKeyword` haste line 356, evasion `canBlock` 407–411, `_internals` export 502.
- `C:\Users\colto\Documents\Claude\Projects\MTG-TOOL\app\src\lib\learn\spellEffects.js` — pump deferred (header), `resolveSpellEffect` 161–200.
- `C:\Users\colto\Documents\Claude\Projects\MTG-TOOL\app\src\lib\learn\tableSnapshot.js`, `boardContext.js`, `trapDetector.js` — raw `card.power`/`toughness` heuristic readers.
- `C:\Users\colto\Documents\Claude\Projects\MTG-TOOL\app\src\lib\learn\actionDispatcher.js` lines 228–244 (cast path / `onResolve` closure — the C1 contract boundary).
- `C:\Users\colto\Documents\Claude\Projects\MTG-TOOL\app\src\lib\learn\gameEngine.js` — cleanup step 203–209, `resolveTopOfStack`/`flushTriggers` 322–415.
- `C:\Users\colto\Documents\Claude\Projects\MTG-TOOL\app\src\lib\learn\cardEffects.test.js` — the contract tests that must stay green.
- CR: `knowledge\mtg-judge\data\cr\cr_current.json` — all 613/611/612/604/514.2/500.4 numbers cited are verified present.
- Layer spec: `knowledge\mtg-engine\L08_ContinuousEffects_611to613_t.md`, `L08_ContinuousEffects_604_t.md`, `META_layer_index.md`.

**Correction logged:** the brief's "counters (layer 7d)" is inexact — per CR 613.4c, **P/T-modifying counters are layer 7c**; 613.4d (7d) is **P/T switch**; keyword counters are **layer 6** (613.1f). This design uses the verified rule numbers.
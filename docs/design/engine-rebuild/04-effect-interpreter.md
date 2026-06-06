# SUBSYSTEM DESIGN 4: Effect interpreter

I now have a complete, verified picture of the subsystem and all its contracts. Here is the design.

---

# DESIGN: Subsystem (4) — General Effect Interpreter (oracle text → effects)

**Author scope:** the parser/representation/resolution path that today is `app/src/lib/learn/spellEffects.js` (a 3-pattern matcher), grown into a data-driven, JSON-serializable, fail-safe **effect-descriptor system** that scales toward XMage/Forge-class coverage. Phase 2 of the three-phase mandate. Depends on Phase 1 (Stack/Trigger/Layers) contracts, flagged explicitly throughout.

All CR citations below were verified against `knowledge/mtg-judge/data/cr/cr_current.json` this session (the JSON is a flat object keyed by rule number; I grepped each one).

---

## 0. Current state (verified against the code)

- `parseSpellEffect(card)` returns one of exactly three flat shapes (`damage`/`destroy`/`draw`) or `null`. Anything unrecognized → `null` → the dispatcher uses `defaultSpellResolver`, which for an instant/sorcery is a **silent no-op-with-log** (`kind: "spell-no-op-resolve"`). That silent no-op is the single biggest fidelity + honesty gap: a relevant spell with text we don't parse does *nothing* and the user is never told.
- `effectNeedsTarget`, `enumerateTargets`, `chooseAITarget`, `resolveSpellEffect` are the four public functions consumed by `legalChoices.js` (target expansion in `actionsCastSpell`) and `actionDispatcher.js` (`applyCastSpell` builds `onResolve` from the effect) and `opponentAI.js` (AI target pick, via `spellWiring.test.js`).
- **The serialization blocker is shared with me:** `applyCastSpell` puts a live closure on `stackObject.payload.onResolve`. `resolveTopOfStack` calls `top.payload.onResolve(next, top)`. My subsystem is the *producer* of that closure. Phase 1 replaces the closure with a serializable **resolver key**; this design is written to that contract.
- In-session cards carry only `{id, name, type, mana, oracle}`. `card.type` and `card.type_line` both read (see `typeOf`/`typeLineOf`). No `keywords[]`, no `produced_mana`. Everything is detected from `type` + `oracle`.

---

## 1. The contract with Phase 1 (Stack/Trigger/Layers) — stated dependencies

The synthesis MUST reconcile these. I depend on three Phase-1 outputs:

### 1.1 `resolverKey` contract (CRITICAL — Stack design owns this)
Phase 1 replaces `payload.onResolve: (state, stackObj) => state` with a **string key + serializable payload**. My subsystem becomes the registry behind one such key. Concretely, I assume Phase 1 exposes a resolver registry roughly:

```
// owned by Phase 1 (stack), populated by subsystems
registerResolver(key: string, fn: (state, stackObject) => state): void
resolveStackObject(state, stackObject): state   // looks up stackObject.resolverKey
```

The interpreter registers exactly one key: `"effect-program"`. A stack object my path produces looks like:

```js
{
  id, kind: "spell", source, controller, targets,
  cost,
  resolverKey: "effect-program",            // ← Phase 1 contract
  payload: { cardId, program: <EffectProgram>, choices: <ChoiceBindings> }
}
```

`program` and `choices` are **plain JSON** (no functions). `resolveStackObject` dispatches `"effect-program"` to my `runEffectProgram(state, stackObject)`. **If Phase 1's key field is named differently (e.g. `payload.kind`), this is the one rename to reconcile.** I flag it as the single highest-priority cross-subsystem contract.

### 1.2 Trigger system contract (Trigger design owns this)
Some atoms enqueue triggered abilities or are themselves the resolution of a trigger (e.g. an ETB "draw a card" trigger reuses the same atom program). I assume Phase 1's `enqueueTrigger(state, trigger)` accepts a trigger whose `payload` carries `{ resolverKey: "effect-program", program, choices }` — i.e. **a trigger and a spell resolve through the identical program runner.** This is a deliberate unification: one interpreter, two entry points (cast resolution, trigger resolution). Flagged: depends on the trigger payload shape Phase 1 defines.

### 1.3 Continuous-effects / layers contract (Layers design owns this)
Atoms that create **continuous effects** (`pump` "+X/+X until end of turn", `grant-keyword`, `set-pt`) MUST NOT mutate P/T directly. They register a **continuous-effect record** into Phase 1's CR 613 layer system (CR 613.1, verified). The interpreter's job is to *emit the record*; the layers engine applies it and `gameState.creaturePower/creatureToughness` read through it (those accessors already take an optional `state` for static modifiers — Phase 1 extends that to read layer records). Flagged: the continuous-effect record shape is owned by Layers; I emit, I do not apply.

> **Phasing consequence:** atoms that need 1.3 (pump, grant-keyword, set-pt) are **parsed and represented** in early Phase-2 PRs but **resolve as `unresolved` (Arbiter-deferred)** until the Layers engine lands. The descriptor is forward-compatible; the resolver is gated. This keeps every PR green and never fabricates a continuous effect before the layer system exists.

---

## 2. Core data shapes

### 2.1 `EffectProgram` (the parse result; fully JSON-serializable)

`parseSpellEffect` is **replaced** by `parseEffectProgram(card)` returning an `EffectProgram` or `null`.

```js
/**
 * EffectProgram — ordered, serializable representation of an oracle text's
 * instructions. Replaces the flat single-effect descriptor.
 */
EffectProgram = {
  version: 1,                       // schema version, for persistence migration
  source: "parser",                 // "parser" | "registry" (cardEffects override)
  confidence: "high" | "low",       // gates resolution; see §5
  structure: "sequence" | "modal",  // top-level shape
  // For structure:"sequence" — atoms run in printed order (CR 608.2c).
  atoms: Atom[],                    // present iff structure === "sequence"
  // For structure:"modal" — player chooses among modes (CR 700.2).
  modal: {
    chooseCount: number,            // "Choose one" → 1; "Choose two" → 2
    upTo: boolean,                  // "Choose up to one"
    modes: { label: string, atoms: Atom[] }[],
  } | null,                         // present iff structure === "modal"
  xSpell: boolean,                  // cost had {X}; an Atom may reference "X"
  unparsedTail: string | null,      // leftover oracle text the parser dropped
}
```

### 2.2 `Atom` (one effect instruction)

```js
Atom = {
  op: AtomOp,                       // see enumerated list §3
  amount: AmountSpec,               // how many / how much
  target: TargetSpec | null,        // null = non-targeted (controller, "each", self)
  // op-specific fields (all optional, all JSON):
  counterType: string,              // for put-counters: "+1/+1" | "-1/-1" | named
  ptDelta: { p: number, t: number },// for pump (until end of turn)
  zone: { from: string, to: string },// for bounce/mill/exile-from
  keyword: string,                  // for grant-keyword
  duration: "until-end-of-turn" | "permanent" | "this-turn",
  tokenSpec: TokenSpec,             // for create-token
  condition: ConditionSpec | null,  // "if ~" gating (Phase 2 late; else unresolved)
  raw: string,                      // the exact clause substring this atom came from
}

AtomOp =
  | "deal-damage" | "destroy" | "exile" | "draw" | "discard"
  | "mill" | "scry" | "surveil" | "tap" | "untap" | "bounce"
  | "counter-spell" | "create-token" | "put-counters"
  | "pump" | "gain-life" | "lose-life" | "search" | "sacrifice"
  | "gain-control" | "fight" | "unresolved"     // ← the fail-safe sentinel atom
```

### 2.3 `AmountSpec`

```js
AmountSpec =
  | { fixed: number }               // "deal 3", "draw two"
  | { variable: "X" }               // X spell — bound at cast from chosen X
  | { dynamic: DynamicCountSpec }   // "draw cards equal to ..." → Phase 2 late / unresolved
```

`DynamicCountSpec` (e.g. "equal to the number of creatures you control") is **represented but resolves `unresolved`** until a count-evaluator lands; never silently guessed.

### 2.4 `TargetSpec` (the targeting grammar — the heart of fidelity)

```js
TargetSpec = {
  cardinality: { min: number, max: number },  // "target"→{1,1}; "up to N target"→{0,N}
  any: boolean,                  // "any target" (CR 115.4) — creature|player|pw|battle
  kinds: TargetKind[],           // ["creature"] | ["player"] | ["creature","player"] ...
  restrictions: Restriction[],   // ALL must hold (AND)
  divide: boolean,               // "divided as you choose" (CR 601.2d) — late/unresolved
}

TargetKind = "creature" | "player" | "permanent" | "artifact" | "enchantment"
           | "planeswalker" | "land" | "spell" | "creature-or-player"

Restriction =
  | { kind: "controller", who: "you" | "opponent" | "defending" }   // CR 109.5
  | { kind: "has-keyword", keyword: string }                        // "with flying"
  | { kind: "type", value: string }                                 // "nonblack", "artifact"
  | { kind: "power", op: "<=" | ">=" | "==", value: number }        // "power 2 or less"
  | { kind: "tapped", value: boolean }                              // "tapped creature"
  | { kind: "unparsed", raw: string }                               // ← forces low confidence
```

A single `{ kind: "unparsed", raw }` restriction is the targeting fail-safe: if the parser sees a qualifier it can't model, it records it and **drops confidence to low** rather than over-targeting.

### 2.5 `ChoiceBindings` (resolved at cast time, stored on the stack object)

Targets, chosen modes, and chosen X are resolved during *casting* (CR 601.2b–d, verified) and frozen onto the stack object so resolution (CR 608) is deterministic and serializable:

```js
ChoiceBindings = {
  targets: ResolvedTarget[],          // [{ atomIndex, type:"creature"|"player", id }]
  chosenModes: number[] | null,       // indices into modal.modes
  xValue: number | null,              // bound X
}
ResolvedTarget = { atomIndex: number, type: "creature" | "player", id: string }
```

> `atomIndex` ties each chosen target to its atom — necessary for multi-clause spells where clause 1 targets a creature and clause 2 targets a player. The existing flat `action.targets: [t]` is a degenerate single-atom case; §6 covers the migration.

### 2.6 `TokenSpec`

```js
TokenSpec = { count: number, name: string, type: string, power: number,
              toughness: number, colors: string[], keywords: string[] }
```

---

## 3. Atom resolver registry

A **data table** keyed by `AtomOp`, each entry a pure resolver `(state, atom, ctx) => state` where `ctx = { controller, bindings, atomIndex, program, stackObject }`. This is the mechanism that replaces the closure.

```js
// effectAtoms.js
const ATOM_RESOLVERS = {
  "deal-damage": resolveDealDamage,   // CR 120.1
  "destroy":     resolveDestroy,      // CR 701.8
  "exile":       resolveExile,        // CR 701.13
  "draw":        resolveDraw,         // CR 121.1
  "discard":     resolveDiscard,      // CR 701.9
  "mill":        resolveMill,         // CR 701.17
  "scry":        resolveScry,         // CR 701.22
  "surveil":     resolveSurveil,      // CR 701.25
  "tap":         resolveTap,          // CR 701.26
  "untap":       resolveUntap,        // CR 701.26
  "bounce":      resolveBounce,
  "counter-spell": resolveCounter,    // CR 701.6
  "create-token":  resolveCreateToken,// CR 701.7
  "put-counters":  resolvePutCounters,// CR 122.1
  "gain-life":   resolveGainLife,     // CR 119.3
  "lose-life":   resolveLoseLife,     // CR 119.3
  "sacrifice":   resolveSacrifice,    // CR 701.21
  "search":      resolveSearch,       // CR 701.23
  "fight":       resolveFight,        // CR 701.14
  "pump":        resolvePump,         // LAYERS-GATED → unresolved until Phase 1.3
  "gain-control":resolveGainControl,  // LAYERS-GATED
  "unresolved":  resolveUnresolved,   // ← the Arbiter escape valve
};
```

Each resolver leans on **existing** `gameState.js` helpers wherever possible so we don't re-implement zone logic: `loseLife`, `gainLife`, `drawCards`, `moveCardToZone`, `markCombatDamage`, `destroyLethalCreatures`, `addCounter`, `tapPermanent`, `untapPermanent`, `addMana`, `findPermanent`, `logEvent`, `opponentsOf`. New helpers added to `gameState.js` only where genuinely missing (mill/scry need top-of-library manipulation; create-token needs a permanent injected without a hand zone).

---

## 4. Function signatures (public API of the subsystem)

```js
// ─── parser (parser.js / spellEffects.js replacement) ───
parseEffectProgram(card): EffectProgram | null
  // null only when the card is a permanent spell OR has no oracle.
  // A non-permanent spell with text we can't parse returns a program with
  // an "unresolved" atom and confidence:"low" — NEVER null, NEVER no-op.

// ─── targeting ───
programNeedsChoices(program): boolean      // targets, modes, or X to pick at cast
atomsRequiringTargets(program): {atomIndex, target}[]   // for cast-time expansion
enumerateTargets(state, controllerId, targetSpec): Target[]   // restriction-aware
expandCastChoices(state, controllerId, program): ChoiceBindings[]
  // cartesian-bounded expansion: one ChoiceBindings per legal (mode, target, X)
  // combo, capped (§5.5) — the action-expansion pattern, generalized.

// ─── AI ───
chooseAIChoices(state, aiPlayerId, program, candidateBindings): ChoiceBindings | null
  // generalizes chooseAITarget over the full program; null = "no good play"

// ─── resolution (the resolverKey:"effect-program" entry point) ───
runEffectProgram(state, stackObject): state
  // looks up stackObject.payload.program + .choices, runs atoms in order,
  // routing each through ATOM_RESOLVERS; "unresolved" atoms → §5.4 path.
resolveAtom(state, atom, ctx): state          // single-atom dispatch (tested directly)

// ─── confidence ───
programConfidence(program): "high" | "low"    // pure function of the program shape
```

**Backwards-compat shims (kept through Phase 2 so existing tests stay green):**

```js
parseSpellEffect(card): LegacyEffect | null    // adapts parseEffectProgram → old 3-shape
effectNeedsTarget(effect): boolean
chooseAITarget(state, aiPlayerId, effect, targets): Target | null
resolveSpellEffect(state, {effect, controller, targets}): state
```

These delegate to the new engine for the three legacy shapes and are removed only in the final Phase-2 cleanup PR once all call sites move to `EffectProgram`.

---

## 5. The confidence boundary (the FAIL-SAFE core)

This is the most important design decision. **Confidence is a pure function of the parsed program**, computed by `programConfidence(program)`. It governs whether resolution runs the atoms or routes to Arbiter.

### 5.1 `high` confidence requires ALL of:
1. Every atom's `op` is a non-`unresolved` op with a registered resolver that is **not layers-gated** while layers are unbuilt.
2. Every atom's `amount` is `{fixed}` or `{variable:"X"}` (no `{dynamic}`).
3. Every `TargetSpec` has zero `{kind:"unparsed"}` restrictions and zero `divide:true`.
4. `unparsedTail` is null OR matches a curated **ignorable-tail allowlist** (reminder text in parens, flavor, "(This creature...)" — patterns that carry no game action). The allowlist is conservative and regex-tested.
5. No `condition` that the condition-evaluator can't yet evaluate.
6. For `modal`: every mode independently satisfies 1–5.

### 5.2 `low` confidence if ANY of the above fails.

### 5.3 Resolution dispatch by confidence
- `high` → `runEffectProgram` executes the atoms. Deterministic, local, no Arbiter.
- `low` → resolution does NOT execute the atoms. Instead it produces an **`unresolved` resolution outcome** (§5.4). **Critically: a low-confidence multi-atom program never partially executes** — it's all-or-nothing, so we never apply atom 1 and silently drop atom 2.

### 5.4 The `unresolved` resolution path (replaces the silent no-op)
When a stack object resolves at `low` confidence (or contains an `unresolved` atom), `runEffectProgram`:
1. Logs a **structured, honest** event: `{ kind: "spell-unresolved", cardName, reason, unparsedTail, program }` (NOT the misleading `spell-no-op-resolve`).
2. Sets a flag on state: `state.pendingArbiter = { stackObjectId, cardName, oracle, question, boardContext }`.
3. The **session driver** (`learnSession.advanceUntilDecision`) detects `state.pendingArbiter` and surfaces a new decision kind: `decision.kind === "unresolved"` (sibling of `"ask"`/`"game-over"`/`"engine-stuck"`/`"dispatch-error"`). The UI layer (outside the pure engine) is what actually calls `POST /api/arbiter` with the question + `cardNames` + `context`, then either (a) shows the Arbiter trace to the user as a teaching moment, or (b) lets the user manually apply the rules outcome. **The pure engine never calls Arbiter** (Arbiter is a server route; the engine is pure/serializable). This respects both "Arbiter is Ollama-only" and "engine is pure, no fetch."

> Why this is the right boundary: the parser is allowed to be *incomplete* but never *wrong*. Every clause is either executed faithfully or explicitly handed to the rules authority with full context. There is no third path where behavior is fabricated or a relevant effect vanishes. This is the literal anti-fabrication mandate (CLAUDE.md §1.2 / §8) realized in the effect system.

### 5.5 Combinatorial-explosion guard
`expandCastChoices` caps the number of `ChoiceBindings` it enumerates (e.g. `MAX_CAST_EXPANSIONS = 64`). If a program would exceed it (a "deal 5 damage divided among any number of targets" spell), the program is forced to `low` confidence → Arbiter. This protects `legalChoices` from blowing up and matches the existing single-action-per-target pattern's spirit.

---

## 6. File-by-file change list

### Changed files

**`app/src/lib/learn/spellEffects.js`** → becomes a thin **compatibility facade**.
- Keeps the four legacy exports (`parseSpellEffect`, `effectNeedsTarget`, `enumerateTargets`, `chooseAITarget`, `resolveSpellEffect`) as adapters delegating to the new modules. This keeps `spellEffects.test.js`, `spellWiring.test.js`, `legalChoices.js`, `actionDispatcher.js`, `opponentAI.js` green during the migration. Removed only in the final Phase-2 cleanup PR.

**`app/src/lib/learn/actionDispatcher.js`** (`applyCastSpell`):
- Replace `const effect = action.effect || parseSpellEffect(card)` + closure `onResolve` with: build an `EffectProgram` (`action.program || parseEffectProgram(card)`), build/accept `ChoiceBindings` (`action.choices`), and construct the stack object with `resolverKey: "effect-program"` and `payload: { cardId, program, choices }` — **no closure** (Phase 1 dependency 1.1). The `defaultSpellResolver` for permanents also moves behind a `resolverKey: "permanent-etb"` (a Phase-1 stack concern, but I flag that my removal of the instant/sorcery closure must be coordinated with Phase 1's removal of the permanent closure so the two land together).
- Until Phase 1's resolver registry exists, an **interim** PR may keep a closure that *calls* `runEffectProgram` (closure body becomes `(s, so) => runEffectProgram(s, so)`), shrinking the serialization surface to a single uniform closure and proving the program runner before the registry rename. This is the green-keeping bridge.

**`app/src/lib/learn/legalChoices.js`** (`actionsCastSpell`):
- Replace the `parseSpellEffect` + single-target loop with `parseEffectProgram` + `expandCastChoices`. Each emitted cast action carries `{ program, choices, needsChoices }` instead of `{ effect, targets:[t] }`. The flying/reach evasion logic in `actionsDeclareBlocker` is untouched (combat, not my subsystem). Targeting restrictions (controller/keyword/type) now filter `enumerateTargets`, so e.g. "destroy target creature an opponent controls" no longer surfaces the caster's own creatures.

**`app/src/lib/learn/opponentAI.js`**:
- Wherever it reads `action.effect`/`action.targets` to score removal (per `spellWiring.test.js`), add a path that reads `action.program`/`action.choices`. Kept behind the facade initially; the AI test contract (`pickAction` aims Doom Blade at the enemy) must stay green.

**`app/src/lib/learn/gameState.js`**:
- Add narrow new helpers the atoms need that don't exist yet: `millCards`, `scryLibrary`/`surveilLibrary` (top-of-library look + reorder + to-graveyard), `createTokenPermanent` (inject a permanent with a synthetic card object — reuses `createPermanent`), `discardCards`. These are pure, mirror existing patterns, and are independently unit-tested. No change to existing exports.

**`app/src/lib/learn/learnSession.js`** (`advanceUntilDecision`):
- After a resolution tick, detect `state.pendingArbiter` and return `decision.kind === "unresolved"` with `{ cardName, oracle, question, stackObjectId }`. Clears `pendingArbiter` when the UI reports back. This is the only engine-side wiring of the Arbiter escape valve.

### New files

| File | Responsibility |
|---|---|
| `app/src/lib/learn/effects/parser.js` | `parseEffectProgram`, clause splitting, modal detection, atom parsers, `programConfidence`, the ignorable-tail allowlist |
| `app/src/lib/learn/effects/targeting.js` | `TargetSpec` grammar, `enumerateTargets` (restriction-aware), `expandCastChoices`, restriction predicates |
| `app/src/lib/learn/effects/atoms.js` | `ATOM_RESOLVERS` table + each atom resolver, `resolveAtom` |
| `app/src/lib/learn/effects/runProgram.js` | `runEffectProgram` (the `"effect-program"` resolver), unresolved-path handling, `pendingArbiter` emission |
| `app/src/lib/learn/effects/ai.js` | `chooseAIChoices` (generalized target/mode/X heuristics) |
| Test files per module (see §8) | |

> Rationale for an `effects/` subfolder: the interpreter is the largest single subsystem in Phase 2; co-locating parser/targeting/atoms/runner keeps `lib/learn/` flat-ish and signals the module boundary. The existing `lib/deck/` grouping (per the v0.21.0 cleanup) is the precedent.

---

## 7. TDD sub-PR breakdown (each ships independently, suite stays green)

Ordering principle: **infrastructure first, then atoms one family at a time, layers-gated atoms last.** Every PR adds tests and leaves zero broken intermediate states. The facade in `spellEffects.js` is what makes this possible — old call sites keep working until the final cleanup.

**PR-E0 — Program shape + parser scaffold + confidence (no behavior change).**
`parser.js`: `parseEffectProgram` parses the SAME three patterns the old parser does, but into `EffectProgram` shape; `programConfidence` returns `high` for them. `spellEffects.js` facade rewrites the legacy exports on top of it. **Net behavior identical; all ~1184 tests green.** New unit tests for the program shape.

**PR-E1 — Targeting grammar + restriction filtering.**
`targeting.js`: `TargetSpec`, restriction predicates (controller/keyword/type/power/tapped), `enumerateTargets`, `expandCastChoices` for single-atom single-target. Wire `legalChoices.actionsCastSpell` through it behind the facade. New tests: "destroy target creature an opponent controls" excludes own creatures; "target creature with flying" filters; cardinality `{0,1}` ("up to one") allows the zero-target cast.

**PR-E2 — `runEffectProgram` + atom registry for the existing three ops.**
`atoms.js` + `runProgram.js`: `deal-damage`/`destroy`/`draw` resolvers (lean on existing `gameState` helpers + `destroyLethalCreatures`). `actionDispatcher` builds the program-based stack object; interim closure calls `runEffectProgram`. Existing `spellWiring.test.js` / `spellEffects.test.js` / `playable.integration.test.js` stay green. New tests assert atom-level resolution.

**PR-E3 — The `unresolved` fail-safe path + `decision.kind:"unresolved"`.**
`runEffectProgram` low-confidence path emits `pendingArbiter` + structured log; `learnSession` surfaces the new decision kind. **This is where the silent no-op dies.** Tests: an unparsed instant ("Counter target spell" pre-counter-atom) resolves to `unresolved`, not no-op; the driver returns `decision.kind:"unresolved"` with card context; multi-atom low-confidence program executes ZERO atoms.

**PR-E4 — Multi-clause sequences (CR 608.2c).**
Clause splitting on `". "` / `";"`; `atomIndex`-bound targets. Tests: "Deal 2 damage to target creature. Draw a card." → two atoms, creature dies AND controller draws; partial-legality (target gone at resolution, CR 608.2b) handled per-atom.

**PR-E5 — Life + tap/untap + bounce + discard + mill/scry/surveil atoms.**
Adds `gain-life`/`lose-life`/`tap`/`untap`/`bounce`/`discard`/`mill`/`scry`/`surveil` (CR 119.3, 701.26, 701.9, 701.17, 701.22, 701.25) + the new `gameState` helpers. One atom family per commit inside the PR, each test-covered.

**PR-E6 — Counter-spell + create-token + put-counters atoms.**
`counter-spell` (CR 701.6 — removes the targeted stack object; depends on Phase-1 stack having stable object ids, flagged), `create-token` (CR 701.7 + `createTokenPermanent`), `put-counters` (CR 122.1, reuses `addCounter`). Tests for each.

**PR-E7 — Modal spells (CR 700.2) + X spells.**
`modal` structure parse ("Choose one —"), `expandCastChoices` over modes; `xSpell` + `xValue` binding from the chosen X at cast (interacts with `legalChoices.parseManaCost` `hasX`). Tests: a "Choose one" charm surfaces one cast action per (mode × target); an X-burn binds X and deals X.

**PR-E8 — Layers-gated atoms (`pump`, `grant-keyword`, `set-pt`, `gain-control`).**
Parsed + represented in earlier PRs but resolved `unresolved`. **This PR flips them to real resolution by emitting continuous-effect records into Phase 1.3's layer system** (hard dependency — ships only after Layers lands). Tests: "+2/+2 until end of turn" pumps via the layer engine and wears off at cleanup (CR 613.1).

**PR-E9 — `cardEffects.js` registry override hook + general-interpreter cleanup.**
Let a named card supply a hand-authored `EffectProgram` (`source:"registry"`, always `high`) that overrides the parser for cards the parser mis-reads — the surgical escape hatch that complements Arbiter. Remove the legacy facade and the last `action.effect`/`action.targets` call sites. Final green.

**PR-E10 — AI generalization.**
`chooseAIChoices` over the full program (mode pick, X pick, multi-target). Replaces `chooseAITarget`. Tests extend the existing AI-targeting contract.

---

## 8. Test plan

### New test files
- `effects/parser.test.js` — program shape, confidence boundary (the allowlist, every "drops to low" trigger), modal/X/multi-clause parsing, `unparsedTail` capture. **This is the highest-value test file**: it pins the confidence boundary so a future parser change can't silently widen "high."
- `effects/targeting.test.js` — restriction filtering, cardinality, `expandCastChoices` cap, AND-of-restrictions.
- `effects/atoms.test.js` — each atom resolver in isolation (table-driven).
- `effects/runProgram.test.js` — sequence ordering, all-or-nothing on low confidence, `pendingArbiter` emission, per-atom target re-check (CR 608.2b).
- `effects/ai.test.js` — generalized AI choice.
- `effects/unresolved.integration.test.js` — driver surfaces `decision.kind:"unresolved"`; the silent no-op is gone.

### Existing tests that shift (and why)
- **`spellEffects.test.js`** — kept green via the facade through PR-E0–E8; in PR-E9 its assertions migrate to the new shape (e.g. `parseEffectProgram(...).atoms[0].op === "damage"` ). The *behaviors* asserted (bolt kills, draw fills hand, AI aims at enemy) are preserved verbatim; only the shape of the parse result changes. This is the one existing file whose internal expectations are rewritten — flagged so the synthesis budgets for it.
- **`spellWiring.test.js`** — green throughout (it tests end-to-end behavior, not parse shape). Asserts unchanged.
- **`playable.integration.test.js`** — green throughout; full-game autopilot must still terminate. Risk: a new atom that loops (e.g. a mis-parsed "draw" that doesn't decrement). Mitigated by the `progressSignature` anti-loop latch already in the driver + atom-level tests.
- **`legalChoices.test.js`** — target-expansion assertions update to the `{program, choices}` action shape in PR-E1; behavioral target counts unchanged.
- **`manaModel.test.js` / `manaWiring.test.js`** — untouched (X-spell payment in PR-E7 reads `parseManaCost.hasX` but doesn't change `planPayment`'s `{taps, spend}` contract).

### Coverage target
The learn engine is ~357 of ~1184 cases. This subsystem should add ~120–160 cases (parser confidence + per-atom + targeting + unresolved path), keeping the engine's proportion of the suite roughly stable while materially widening real coverage.

---

## 9. CR citations (every number verified against `cr_current.json` this session)

| Rule | Used for |
|---|---|
| 601.2, 601.2b–f | casting = choose targets/modes/X then determine cost (cast-time bindings) |
| 601.2c | target announcement during casting |
| 601.2d | divide/distribute among targets (`divide:true` → late/unresolved) |
| 608.2c | follow instructions **in the order written** (sequence atoms) |
| 608.2b | re-check target legality at resolution (per-atom) |
| 115.1, 115.2 | what is targetable; permanents-only default |
| 115.4 | "any target" = creature/player/planeswalker/battle |
| 115.10 | non-targeted "each"/affected-on-resolution objects |
| 109.5 | "you/your" → controller (controller restriction) |
| 700.2 | modal definition ("Choose one —") |
| 700.4 | "dies" = battlefield→graveyard (destroy/lethal interplay) |
| 120.1 | damage to creatures/players (`deal-damage`) |
| 121.1 | draw definition (`draw`) |
| 119.3 | gain/lose life (`gain-life`/`lose-life`) |
| 122.1 | counters (`put-counters`) |
| 613.1 | continuous effects / layers (pump/grant-keyword — Phase 1.3 gate) |
| 603.3, 603.3a | triggered abilities onto stack at next priority (trigger reuse of program) |
| 701.6 | Counter (`counter-spell`) |
| 701.7 | Create (`create-token`) |
| 701.8 | Destroy (`destroy`) |
| 701.9 | Discard (`discard`) |
| 701.13 | Exile (`exile`) |
| 701.14 | Fight (`fight`) |
| 701.17 | Mill (`mill`) |
| 701.21 | Sacrifice (`sacrifice`) |
| 701.22 | Scry (`scry`) |
| 701.23 | Search (`search`) |
| 701.25 | Surveil (`surveil`) |
| 701.26 | Tap and Untap (`tap`/`untap`) |

> Could NOT find as standalone CR entries (so NOT cited as such): there is no `114.6`/`114.8`. "Up to one target" / "up to N" optional-target semantics live inside 115-series prose rather than a dedicated numbered rule; the design relies on `cardinality.min:0` rather than citing a specific sub-rule. Flagged honestly rather than fabricated.

---

## 10. RISKS

1. **`resolverKey` contract drift (HIGHEST).** My entire serialization win depends on Phase 1's stack exposing a string-keyed resolver registry and dispatching `"effect-program"` to `runEffectProgram`. If Phase 1 names it differently or keeps closures longer, PR-E2 needs the interim closure bridge. **Mitigation:** PR-E2's interim closure (`(s,so)=>runEffectProgram(s,so)`) proves the runner independently of the registry; the registry swap is then a one-line rename. Reconcile this contract in synthesis before PR-E2.

2. **False-confident parses (the core fidelity risk).** The danger is the parser rating a misread clause `high` and executing wrong behavior — worse than a no-op because it's *wrong and silent*. **Mitigation:** the confidence boundary is conservative-by-construction (any unmodeled token → `unparsed` restriction → low; any unparsed tail outside the curated allowlist → low; all-or-nothing execution). `parser.test.js` pins every "drops to low" trigger so widening "high" is a deliberate, reviewed act. Adversarial test corpus of near-miss oracle texts (e.g. "destroy target creature **unless its controller pays {2}**") must resolve `unresolved`.

3. **Oracle-text ambiguity at clause boundaries.** Splitting on `". "` mis-splits abbreviations, "vs.", decimal-free but parenthetical reminder text, and "draw a card, then discard a card" (comma-joined). **Mitigation:** clause splitter is its own tested unit; ambiguous splits that produce an unparseable fragment force `low` confidence, not a wrong split. Reminder text in parens is stripped before splitting.

4. **Target legality changing between cast and resolution (CR 608.2b).** A multi-atom spell whose atom-2 target dies after atom-1 resolves must skip atom-2's effect (or fizzle per the rules), not crash on a missing permanent. **Mitigation:** `resolveAtom` re-validates each target via `findPermanent` at resolution; missing → atom logged as fizzled, program continues (single-target-all-illegal → whole spell fizzles, future refinement). Tested in `runProgram.test.js`.

5. **Combinatorial explosion in `expandCastChoices`.** "Distribute 4 damage among any number of targets" or a 3-mode charm with many targets could emit hundreds of cast actions, bloating `legalChoices` and the UI. **Mitigation:** `MAX_CAST_EXPANSIONS` cap → over-cap programs forced to `low` → Arbiter. The driver's existing safety cap is a backstop, not the primary guard.

6. **`pendingArbiter` purity boundary.** The engine must stay pure/serializable; only the UI may call `/api/arbiter`. If a future contributor wires a `fetch` into `runEffectProgram`, it breaks purity, tests, and the local-first mandate. **Mitigation:** the engine only *emits* `pendingArbiter` data; an ESLint/test guard asserts no `fetch`/`import` of server modules in `lib/learn/effects/`. Documented prominently in the module header.

7. **Layers-gated atoms shipping before Layers (silent regression).** If PR-E8 lands before Phase 1.3, pump would either no-op or mutate P/T directly (forbidden). **Mitigation:** until Layers exists, `pump`/`grant-keyword`/`set-pt`/`gain-control` resolvers are hard-wired to the `unresolved` path; PR-E8 is explicitly gated on the Layers engine and won't merge before it.

8. **Facade lifetime / dual-shape confusion.** During Phase 2, both `LegacyEffect` and `EffectProgram` exist; a call site reading the wrong one is a subtle bug. **Mitigation:** the facade is the ONLY producer of `LegacyEffect`; new code imports only from `effects/`; PR-E9 deletes the facade and greps for residual `action.effect` usage as a merge gate.

9. **AI heuristic regressions.** Generalizing `chooseAITarget` → `chooseAIChoices` risks the AI casting removal on its own creature or picking a useless mode (breaking `spellWiring.test.js`'s "won't cast removal with no enemy creature"). **Mitigation:** `chooseAIChoices` preserves the existing enemy-only invariants as the base case; the existing AI tests are the regression net and are extended, not replaced.

10. **Token cards have no real Scryfall entry.** `create-token` synthesizes a card object `{name,type,power,toughness,oracle}` with no `id` from the card index — must not collide with library card ids and must survive `creaturePower`/`destroyLethalCreatures` (which read `card.power`/`card.toughness` numerically). **Mitigation:** `createTokenPermanent` stamps numeric P/T and a `token:true` marker; tested against the lethal SBA so a 1/1 token dies to 1 damage like any creature.

---

## 11. Cross-subsystem dependency summary (for synthesis)

| Dependency | Owner | What I need | Risk if unmet |
|---|---|---|---|
| `resolverKey` registry + `"effect-program"` dispatch | **Stack (Phase 1)** | string key replaces `payload.onResolve` closure | Serialization blocker not cleared; interim closure bridge |
| Trigger payload carries `{resolverKey, program, choices}` | **Triggers (Phase 1)** | ETB/dies triggers resolve through `runEffectProgram` | Triggers can't reuse the interpreter; duplicate logic |
| CR 613 continuous-effect record shape | **Layers (Phase 1)** | emit pump/grant-keyword/set-pt as layer records | Those atoms stay `unresolved` until Layers ships |
| Stack object stable ids for `counter-spell` | **Stack (Phase 1)** | target a stack object by id | counter-spell stays `unresolved` |
| `pendingArbiter` → `decision.kind:"unresolved"` | **This subsystem + session driver** | new decision kind in `learnSession` | falls back to today's silent no-op (unacceptable) |

**Relevant files (absolute paths):**
- `C:\Users\colto\Documents\Claude\Projects\MTG-TOOL\app\src\lib\learn\spellEffects.js` (→ facade)
- `C:\Users\colto\Documents\Claude\Projects\MTG-TOOL\app\src\lib\learn\actionDispatcher.js` (`applyCastSpell`, closure removal)
- `C:\Users\colto\Documents\Claude\Projects\MTG-TOOL\app\src\lib\learn\legalChoices.js` (`actionsCastSpell`)
- `C:\Users\colto\Documents\Claude\Projects\MTG-TOOL\app\src\lib\learn\gameState.js` (new mill/scry/token/discard helpers; existing `creaturePower`/`destroyLethalCreatures`/`moveCardToZone` reused)
- `C:\Users\colto\Documents\Claude\Projects\MTG-TOOL\app\src\lib\learn\gameEngine.js` (`resolveTopOfStack`/`flushTriggers` — closure consumers, Phase-1 owned)
- `C:\Users\colto\Documents\Claude\Projects\MTG-TOOL\app\src\lib\learn\learnSession.js` (`advanceUntilDecision` → emit `unresolved` decision)
- `C:\Users\colto\Documents\Claude\Projects\MTG-TOOL\app\src\lib\learn\cardEffects.js` (registry override hook, PR-E9)
- `C:\Users\colto\Documents\Claude\Projects\MTG-TOOL\app\src\lib\learn\opponentAI.js` / `decisionGate.js` (read new action shape)
- `C:\Users\colto\Documents\Claude\Projects\MTG-TOOL\app\src\app\api\arbiter\route.js` (the escape valve the UI calls; engine stays pure)
- New: `C:\Users\colto\Documents\Claude\Projects\MTG-TOOL\app\src\lib\learn\effects\{parser,targeting,atoms,runProgram,ai}.js` + tests
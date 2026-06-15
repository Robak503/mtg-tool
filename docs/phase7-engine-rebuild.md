# Phase 7 — Maximal-Fidelity Engine Rebuild + Persistence

**Status:** PLANNED (roadmap locked 2026-06-06). Implementation not yet started.
**Owner:** Colton.
**Supersedes / absorbs:** the remaining open Phase-6 PRs — PR 12 (Expert post-game
analysis) and PR 13 (learn-session persistence) land inside this plan's **Phase 3**.
Phase-6 PR 11 (LearnView 4P UI polish) is *not* part of this plan and remains a
separate UI track the owner can pull whenever he wants.
**Design provenance:** produced by a 6-agent design workflow (one deep design per
subsystem, each grounded in the real `app/src/lib/learn/` code + the Comprehensive
Rules JSON) plus an adversarial principal-engineer critique that verified ground
truth against the code and all 3,138 CR rules and reconciled every cross-section
contract. The six detailed subsystem designs + the critique are preserved verbatim
under [`docs/design/engine-rebuild/`](design/engine-rebuild/) — read those for the
exact data shapes, function signatures, and per-PR test plans. This file is the
authoritative, reconciled **roadmap**; the design files are the **blueprint detail**.

---

## 0. The mandate (locked with the owner this session)

> "More engine depth / a full complete engine with persistence is my real next goal."

The owner chose, explicitly:

- **Fidelity: maximal (XMage/Forge-class).** Build the *real* systems — a
  data-driven serializable stack, a triggered-abilities system, and a CR 613
  continuous-effects/layers engine — so the engine is genuinely capable, not a
  hand-curated per-card list. Card/mechanic coverage then grows on top of that
  infrastructure session over session. **The Arbiter remains a permanent,
  load-bearing fail-safe** for the unbounded long tail — never removed.
- **Purpose: all of it.** The same engine ultimately powers teaching (The
  Academy, 3 difficulties), deck playtesting / goldfishing, and just-play-a-full-
  game-vs-AI sandbox. The older goldfish simulator converges via an *adapter*,
  not a storage merge (Phase 3, deferred/optional).
- **Persistence: mid-game resume + records + insights** (the full vision). Close
  the app mid-game, reopen, continue exactly where you were; plus completed-game
  records and per-format "you keep missing X" insights, scoped per local profile.
- **Build order: "1 then 2 then 3, very clean."** Foundation → Depth →
  Persistence, in that order. Foundation first is the keystone: the
  stack-to-serializable-data refactor is the shared prerequisite for *both*
  triggered abilities *and* persistence, so it is not wasted work — it is the
  architectural keystone the whole rebuild hangs from.

### The honest scope boundary (from the realism review, adopted)

"Maximal fidelity = template parity with Forge" is a trap that guarantees
perpetual perceived failure (Forge/XMage encode thousands of scripted abilities
over 15+ volunteer-years). The **adopted goal** is *"every common interaction in
a normal game, plus a verified judge ruling for the rest."* Concretely:

- ~75–85% of the *game situations the owner actually hits* is reachable; the
  *card-template* long tail is unbounded by construction (every new set adds to
  it). Those are different denominators — conflating them is the trap.
- Progress is measured by a **"supported vs Arbiter-resolved" coverage metric**
  (Phase 2), turning the infinite tail into a number that goes up — not by
  template parity.
- The parser is allowed to be **incomplete but never wrong**: anything it isn't
  confident about routes to the Arbiter "unresolved / manual ruling" path with
  full context (a teaching moment in Beginner mode), never a silent no-op and
  never a fabricated effect.

---

## 1. The three phases

| Phase | Theme | What it delivers | Gates |
|---|---|---|---|
| **1 — Foundation** | Make the engine *capable* | Serializable data-driven stack + resolver registry; deterministic IDs; real triggered-abilities system (ETB/dies/step/attack); CR 613 continuous-effects/layers engine (anthems, lords, granted keywords, pump-ready). | Suite green after **every** PR. Closures gone from production after PR-4. Equivalence gate before the P/T accessor swap. |
| **2 — Depth** | Grow *coverage* on the infra | General effect interpreter (multi-clause, modal, X, tokens, counters, activated abilities, replacement effects); broad anthem/lord/pump coverage; AI threat-math routed through derived characteristics; coverage metric. | Each atom/mechanic = a small PR + tests; fail-safe to Arbiter on low confidence. |
| **3 — Persistence** | The payoff (small) | Mid-game save/resume per profile; completed-game records; per-format "you keep missing X" insights; goldfish-convergence adapter (optional). | Trivial once Phase 1 made state serializable — "save/resume is plumbing." |

Phase 1 is the only phase planned to PR granularity below; Phase 2/3 have a
high-level PR outline (§4, §5) and full detail in the design files.

---

## 2. Locked architectural decisions (the reconciled contracts)

These resolve the conflicts the parallel design agents created. They are binding.

### D1 — The resolver-key payload contract: `payload = { resolver, params }`

Every stack object and trigger payload is **plain JSON** — no closures, ever.
`payload.resolver` is a string key into a module-level registry; `payload.params`
is the serializable args. (Three sections independently invented
`resolverKey`/`resolverArgs`; **Stack design's `resolver`/`params` wins by
ownership** — it's PR-1, the keystone, and the only one that enumerated the frozen
key set + per-key param shapes + an extension mechanism.)

```js
// resolvers.js — the canonical contract
export const RESOLVER_KEYS = Object.freeze({
  SPELL_EFFECT:    "spell.effect",      // parsed instant/sorcery effect (single SpellEffect descriptor)
  PERMANENT_ETB:   "spell.permanent",   // a permanent spell entering the battlefield
  SPELL_NOOP:      "spell.noop",        // unrecognized instant/sorcery — log + pop
  TRIGGER_EFFECT:  "trigger.effect",    // a triggered ability's effect (Triggers emits this)
  ACTIVATED_EFFECT:"activated.effect",  // Phase 2
  MANUAL:          "manual",            // Arbiter escape valve — surfaces "unresolved"
  EFFECT_PROGRAM:  "effect-program",    // RESERVED for Phase 2's multi-atom interpreter
});
```

`resolveTopOfStack` does `getResolver(payload.resolver)(state, top)`; unknown/absent
key → `MANUAL` (the existing "no resolver → log + Arbiter" branch, renamed).
`registerResolver(key, fn)` + a mutable `EXTENSIONS` map let Triggers and the
Phase-2 interpreter add keys without editing the core module (and let the two
throw/flag engine tests register ephemeral test resolvers). **Phase 1 ships
`spell.effect` carrying today's single `SpellEffect` descriptor; Phase 2 introduces
`effect-program` as a NEW key** (additive) — it never overloads `spell.effect`.

### D2 — Deterministic, state-threaded IDs: `state.idSeq` + `mintId(state, prefix)`

The one non-deterministic id (`perm-${Date.now()}-${Math.random()}` in
`defaultSpellResolver`) breaks every serialize→restore equivalence test. Route ALL
game-state id minting through a counter carried in state:
`mintId(state, prefix) → { id: "perm-7", state: {...state, idSeq: 7} }`. Factories
(`createStackObject`/`createPermanent`) gain an optional `id` param and fall back to
the legacy module-global `nextId` only for un-migrated callers (so PR-0 is
invisible). `_resetIdsForTests` stays for the legacy fallback. Session id
(`learn-<uuid>`) is out of scope (not part of replay).

### D3 — Layers contract: `deriveCharacteristics(state, permanentId)`

The single source of truth for a permanent's effective characteristics
(power/toughness/keywords/types/colors), computed by applying ALL continuous
effects in CR 613 layer order with timestamp (613.7) and dependency (613.8)
ordering. `gameState.creaturePower/creatureToughness(perm, state)` **delegate** to
`permanentPower/permanentToughness(state, id)` when `state` is passed (else
printed+counters — preserves the "no state → printed only" behavior). Granted
keywords flow through a new `permanentHasKeyword(state, id, kw)` that seeds from
`keywords.hasKeyword` (imported, **never shadowed**) and unions layer-6 grants +
keyword counters. The accessor returns the **true CR value (can be negative)**;
combat floors at 0 (`Math.max(0, …)` already present), the SBA reads raw
(`tough <= 0` dies) — `destroyLethalCreatures` needs **no change** (it already calls
`creatureToughness(perm, state)`).

**CR correction (verified):** P/T-modifying counters apply in **layer 7c (613.4c)**,
not "7d"; keyword counters in **layer 6 (613.1f)**; 7d (613.4d) is P/T *switch*. The
brief was loose; the design uses the verified numbers.

### D4 — Serialization landing: `serialization.js` in Phase 1, session-persistence in Phase 3

State-level `serializeState`/`deserializeState` (trivial JSON pass-through; their
*existence + the round-trip test* is the contract guard) land in **Phase 1 PR-4**.
Phase 3's `learnSaveStore` wraps that for *session*-level disk I/O (checksum, schema
version, atomic write). Two layers, not a conflict. The behavioral round-trip test
(`resolveTopOfStack(restored)` deep-equals `resolveTopOfStack(original)`) is the
executable definition of "serialization done" and is **CI-gating from PR-4 onward**
— the forcing function in lieu of a product consumer until Phase 3.

### D5 — The ETB path is the three-way integration point

`enterBattlefield` / `checkEtbTriggers` (PR-6) is a single function that must stamp
the deterministic `id` (D2), stamp the layer `timestamp` (D3, 613.7e), AND fire ETB
triggers (Triggers). Three subsystems, one function. It gets **one owner** (whoever
builds triggers, since `enterBattlefield` is theirs) with Stack + Layers reviewing,
and **one test asserting all three** (unique deterministic id + monotonic timestamp +
ETB trigger fires) so a missed stamp can't silently break layer ordering months later.

### D6 — Keep the `manual`/closure escape valve; police production for closures

The `MANUAL` resolver (and a test-only/Arbiter closure escape hatch) stays
permanently — it documents the engine's "can't resolve → hand to Arbiter" contract.
A CI-gating lint/test asserts **production** stack objects carry `payload.resolver`
(string) and **never** `payload.onResolve` (function). The fallback is for
tests/Arbiter; production is policed. This converts a churn liability into a
documented feature.

### D7 — `profiles.js` `PER_PROFILE_DIRS` gains `learn-sessions` + `learn-records`

A one-line cross-subsystem edit (Phase 3) so saves created in the narrow
pre-registry window migrate into the primary profile instead of orphaning at the
data root. Called out so it doesn't fall through.

---

## 3. Phase 1 — Foundation: the PR sequence

**Discipline:** expand → migrate → contract. The suite is green **after every PR**.
Closures are gone from production after **PR-4** (round-trip proven). PRs 5–12 are
additive (new triggers fire, new layer math) and stay green by construction, with
deliberate, enumerated test migrations only at **PR-3** (3 tests) and **PR-11**
(0 if the `staticPTModifier` shim is kept).

> **✅ SHIPPED — v0.23.0 (2026-06-06): PR-0 → PR-4a.** The serializable
> data-driven stack, deterministic state-threaded ids, and mid-game save/resume
> are merged to master (PR #147) and released. Suite at 1244.
>
> **✅ SHIPPED — triggered abilities (2026-06-06): PR-5 → PR-8.** `triggers.js`
> detection/APNAP (#149), ETB triggers (#149), dies triggers from the `dead`
> look-back (PR-7), step + attack triggers (PR-8). The full ETB/dies/step/attack
> trigger system fires end-to-end. Suite at 1283.
>
> **✅ SHIPPED — CR 613 layers (2026-06-06): PR-9 → PR-12. Phase-1 Foundation
> COMPLETE.** `ptPrimitive.js` (cycle cut, F3) + `layers.js`
> (`deriveCharacteristics`, accessors, memo + fast path, layers 4–7 with 7a/7b/7c
> /7d sublayers) + `staticAbilityParser.js` (anthems/lords/grants). PR-10's
> exhaustive equivalence matrix (106 cases) gated the PR-11 accessor swap
> (`creaturePower`/`creatureToughness` → layers, zero integration regressions).
> PR-12 wired granted keywords into combat + legality, cleanup expiry (514.2), and
> the F7a AI P/T rewire (boardContext/trapDetector/opponentAI). Anthems, Sliver
> lords, granted flying/deathtouch/haste, and until-EOT pump now visibly change
> gameplay. Suite at 1445. Released as **v0.25.0**.
>
> **Phase 1 (Foundation) is fully shipped. Next: Phase 2 (Depth) — the general
> oracle→effect interpreter, broad anthem/lord/pump coverage, pump SPELL wiring,
> the coverage metric (§4).**
>
> **Revised 2026-06-06 after `/plan-eng-review` + outside-voice.** Changes are tagged
> `[eng-review FN]` and explained in §11. Headline: a minimal save/resume slice
> (**PR-4a**) is pulled forward right after PR-4 per the owner's decision, so
> serialization gets a live consumer instead of bit-rotting until Phase 3.

| PR | Scope | Suite |
|---|---|---|
| **PR-0 ▶ START** | **Determinism prereq.** `state.idSeq` + `mintId(state, prefix)`; optional `id` on `createStackObject`/`createPermanent`; thread `moveCardToZone`'s becomePermanent branch; seed `idSeq:0` in `createGameState`; shared `stableSnapshot(session)` test helper (strips volatile `{createdAt, endedAt, ts, id-entropy}`). Also fix the stale `903.14a` CR comment in `learnSession.js` (real: 903.10a/704.6c). **Invisible** — legacy `nextId` fallback intact → zero test churn. | 🟢 |
| **PR-1** | **Resolver registry.** `resolvers.js`: frozen `RESOLVER_KEYS`, `RESOLVERS` map, `getResolver`/`registerResolver`/`EXTENSIONS`/`_clearExtensionsForTests`, `enterPermanent`, `isPermanentSpell`. **Nothing calls it yet.** Pure unit tests per resolver. | 🟢 |
| **PR-2** | **Dispatch swap (additive).** `resolveTopOfStack` looks up the registry *alongside* the existing `onResolve` fallback. Registry-dispatch + unknown-key→`manual` tests. No production code stops emitting closures yet. | 🟢 |
| **PR-3** | **Cast-path swap.** `applyCastSpell` emits `payload:{resolver, params}` (`spell.effect` / `spell.permanent` / `spell.noop`); **delete `defaultSpellResolver`**; extract `enterPermanent`/`isPermanentSpell`; `mintId` the stack id. Migrate the **exactly 3** closure-touching tests — `actionDispatcher.test.js:174`, `gameEngine.test.js:263`, `:286` (+ the flag test `:238`) via the `registerResolver` test seam. (Outside-voice verified this enumeration is complete.) | 🟢 |
| **PR-4** | **`serialization.js` + the behavioral round-trip test** (cast → serialize mid-stack → deserialize → resolve → deep-equal) + the "no functions anywhere in state" walk + the no-closure production lint (D6). **← SUITE FULLY GREEN ON THE NEW SERIALIZABLE CONTRACT.** | 🟢 |
| **PR-4a · SAVE SLICE** `[eng-review F6]` | **Minimal mid-game save/resume on the now-serializable engine** (owner decision). Lands Phase-3 PRs P3.1–P3.4 *early*: `atomicJson.js` extraction → `learnSaveSchema.js` (`schemaVersion`, `isSerializable`, checksum, `migrate`) → `learnSaveStore` autosave wired into `start`/`step` (`.catch`-guarded) + `PER_PROFILE_DIRS` edit (D7) → `/api/learn/saves`/`resume`/`delete` + `LearnView` "Continue a game". Serialization now has a **live consumer** (kills R6 bit-rot). Records + insights stay in Phase 3. Per **CONTRACT-MIG**, every later state-shape change (triggers PR-5+, layers PR-9+) ships a `MIGRATIONS[N]` entry + `save-v<N>.json` fixture in its own PR. | 🟢 |
| **PR-4b · FIXTURE AUDIT** `[eng-review F1/F9]` | **Prereq for triggers.** Grep every `*.integration.test.js` + scripted-game fixture for trigger-bearing oracle text (`When/Whenever/At …`). Produce the explicit list of fixtures PR-6/PR-7/PR-8 will *legitimately* change, so "green after every PR" is a **verified** claim, not an assumption. Pure audit + a documented allowlist; no behavior change. | 🟢 |
| **PR-5** | **Triggers infra.** `triggers.js` (leaf: `detectTriggers`/`triggersForEvent`/`checkInterveningIf`/`applyTriggerEffect`, cached detection); generalize `flushTriggers` to N-seat APNAP (`orderTriggersAPNAP`, CR 603.3b) + target-less-trigger removal (603.3d). **Nothing enqueued yet.** 4-seat APNAP test + a cycle-check test. | 🟢 |
| **PR-6** | **ETB hook (the D5 integration PR — riskiest boundary `[eng-review F5]`).** `enterBattlefield` + `checkEtbTriggers` (603.6a): stamps `id` + `timestamp`, fires ETB triggers (self + watchers). **Enumerate ALL THREE battlefield-entry paths** — cast-resolve, `applyPlayLand`, AND `moveCardToZone`'s battlefield→battlefield blink branch (`gameState.js:401`) — and route/stamp each, or explicitly guard+log the blink path as out-of-scope (no silent un-stamped entry). One test asserts id+timestamp+ETB across **every** entry path. Re-derive any fixture flagged in PR-4b that this changes. | 🟢 |
| **PR-7** | **dies hook (redesigned `[eng-review F2]`).** Source dies-triggers from the `dead` look-back snapshot **everywhere** — `resolveSpellEffect` surfaces its internal `destroyLethalCreatures` `dead` set up to the engine (return `{state, dead}` / explicit out-param), so the spell death path is symmetric with combat. **NO post-resolution membership diff** (it can't reconstruct CR 603.10a look-back — `moveCardToZone` already dropped the permanent's type/controller at `gameState.js:405`). Pin each death source's fire to one place so combat-damage deaths can't double-fire. Multi-death + **type-gated watcher** (Blood-Artist) tests. | 🟢 |
| **PR-8** | **Step + attack triggers.** `checkStepTriggers` (upkeep/draw/end, 603.2b, `whose:"yours"` gate) + `checkAttackTriggers` (508.3, reads the full `state.combat.attackers` batch) wired into `runStepActions`. Triggers emit `payload:{resolver:"trigger.effect", params}` directly. | 🟢 |
| **PR-9** | **Layers engine (standalone) + cycle break.** Extract **`ptPrimitive.js`** (printed+counters math) as a named deliverable `[eng-review F3]` so `gameState`↔`layers` never cycle: `layers.js` imports the primitive + `keywords.hasKeyword`, **never `gameState`**. Then `layers.js`: `deriveCharacteristics`, `collectContinuousEffects`, `orderEffectsForPermanent`, accessors, `addContinuousEffect`/`removeContinuousEffect`/`expireContinuousEffects`, `DYNAMIC_PT_FNS`, WeakMap state-version memo + empty-board fast path; layers 4–7 implemented, 1–3 stub pass-through. **NOT wired into `creaturePower`.** Tests incl. **idempotence** (613.1) + timestamp order (613.7). | 🟢 |
| **PR-10** | **EQUIVALENCE GATE (strengthened `[eng-review F4]`).** Not 4 literals — an **exhaustive parity property-matrix**: `permanentPower(state,id) === legacyCreaturePower(perm,state)` across {printed P/T} × {+1/+1, −1/−1, both, none} × {0/negative toughness} × {Omnath 0..N green}. **Mandatory + merge-blocking before PR-11.** | 🟢 |
| **PR-11** | **Accessor swap (highest blast radius — gated by PR-10).** `creaturePower/creatureToughness` delegate to `permanentPower/permanentToughness` (via `ptPrimitive`, no cycle) when `state` passed. Omnath ports to a layer-7c `ptModifyDynamic` (`fn:"omnathGreen"`) descriptor. `staticPTModifier` kept as a thin shim. | 🟢 |
| **PR-12** | **Cleanup + granted keywords + AI P/T rewire.** `expireContinuousEffects` at cleanup (514.2); `permanentHasKeyword` unions layer-6 grants; rewire `combatResolution`/`legalChoices` evasion+haste to `permanentHasKeyword`; delete the `staticPTModifier` shim. **`[eng-review F7a]` In THIS phase** (same window as the combat swap, not deferred to Phase 2): route `boardContext`/`trapDetector`/`opponentAI` threat math through the derived accessor so the AI never evaluates printed P/T while combat resolves on derived — no green-but-wrong window. | 🟢 |

**Why PR-0 starts:** it's the one prerequisite all four serialization-dependent
subsystems share, it's invisible (legacy fallback keeps un-migrated callers green),
and nothing else can be *proven* correct without deterministic ids. Determinism
before the registry is the single most important sequencing decision in Phase 1.

**Resolved sequencing conflicts:** (a) Triggers' "TR-7 closure→key swap" is
**deleted** — landing the registry (PR-1) before triggers (PR-5–8) means triggers
emit `resolver:"trigger.effect"` directly; no overlap-window closures, ever. (b)
Layers infra (PR-9) lands after triggers because triggers have zero layers
dependency in Phase 1 (they read the old `creaturePower(perm, state)` signature,
preserved until PR-11). (c) The equivalence gate (PR-10) is its own PR before PR-11.

---

## 4. Phase 2 — Depth: the coverage spine (ordered, decided 2026-06-06)

Phase 1 (Foundation) is **COMPLETE through v0.25.0** (serializable stack, triggers,
CR 613 layers + anthems/lords/granted-keywords + the pump *mechanism*; AI threat-math
already routes through the derived accessor per F7a/PR-12). Phase 2 grows *coverage*
on that infra. **The goal is the supported-vs-Arbiter coverage metric, not template
parity** — every common interaction native, the Arbiter a permanent fail-safe for the
tail. The parser is "incomplete but never wrong": low-confidence → Arbiter, never a
silent no-op, never a fabricated effect.

This ordering was produced by a 3-lens design workflow (coverage-per-effort ×
full-game-first × architecture-correct) and synthesized to one dependency-correct
spine. Full atom/EffectProgram detail in
[`04-effect-interpreter.md`](design/engine-rebuild/04-effect-interpreter.md);
coverage-metric + scope realism in
[`06-test-and-realism.md`](design/engine-rebuild/06-test-and-realism.md).

> **Reordered "road to 100%" status (authoritative tracker: memory
> `project_coverage_roadmap`).** The shipped sequence is: the **coverage metric**
> (PR #165) → **P2.8 triggered abilities fire the full EffectProgram** (PR #166,
> non-targeted) → **the flush-time target chooser** (THIS slice — targeted triggers
> enumerate targets via `expandCastChoices` and resolve through `EFFECT_PROGRAM` as the
> ability goes on the stack, CR 603.3c; no legal target → dropped; default first-legal,
> injectable `chooseTargets` seam) → **P2.9 activated abilities** (`{cost}: effect` becomes a
> playable action: `effects/abilities.parseActivatedAbilities` with a mana+`{T}` cost
> allowlist, `legalChoices.actionsActivateAbility` + `actionDispatcher.applyActivateAbility`
> resolving through `EFFECT_PROGRAM`; mana abilities stay on the no-stack tap path;
> `native-activated` coverage tier) → **NEXT: P2.10 static anthems** (widen
> `staticAbilityParser` — e.g. the missed "Other creatures you control get +1/+1") (Frontier
> A). The §4 table's old numbering predates this reorder; the mechanics below still describe
> the work, just under different P2.x labels.

| # | PR | Mechanic | Coverage | Effort/Risk | Depends on |
|---|----|----------|----------|-------------|------------|
| **P2.1 ✅ SHIPPED (v0.26.0)** | **Unresolved→Arbiter seam** | `learnSession` returns an `unresolved` decision kind (`pendingArbiter`); start/step/continue routes surface it; LearnView calls the Ollama-only Arbiter. Driver policy: pause for the player's own unmodeled spell at beginner/intermediate; Expert + opponent spells auto-continue but log to the action feed. CONTRACT-MIG: save schema v2→v3. | huge | S / low | — |
| **P2.2 ✅ MERGED** | **EffectProgram interpreter keystone** | `effects/parser.js` (`parseEffectProgram` + the conservative clean-clause confidence gate, CI-pinned by a must-drop-to-low corpus) + `effects/effectAtoms.js` (atoms delegate to shared spellEffects helpers → parity) + `effects/runProgram.js` (all-or-nothing; low → P2.1 seam) under the `effect-program` key. Adversarial review caught + fixed two critical false-high vectors ("and"-riders, target restrictions). | (keystone) | M / med | P2.1 |
| **P2.3 ✅ MERGED** | **Pump-spell wiring** | a `pump` atom → `addContinuousEffect` (7c modify, endOfTurn); "+X/+Y" buffs via layers + wears off at cleanup, "-X/-Y" runs the lethal SBA. Recognizes "Target creature gets +X/+Y until end of turn"; keyword-grant riders → Arbiter. | high | S / low | P2.2 |
| **P2.4 ✅ MERGED** | **Targeting restrictions + AI awareness** | `parseCreatureTargetRestrictions` (ALLOWLIST residue check — models controller/tapped/power; any unmodeled qualifier → Arbiter); `enumerateTargets` filters by derived power/controller/tapped; restricted removal resolves natively + only surfaces legal targets. Mass effects stay Arbiter-routed. Adversarial review: 0 findings (the allowlist closed the denylist holes). | high | M / med | P2.2 |
| **P2.5 ✅ MERGED (v0.29.0)** | **Multi-clause + modal** | clause→atoms split (". "/";"/top-level " and "), per-atom `atomIndex` targeting (`effects/targeting.js`#`expandCastChoices`), modal "Choose one —" (one cast per mode×target). **X-spells deferred** to a fast-follow (runner threads `xValue` as groundwork; X stays Arbiter-routed until bounded cast-expansion + player choice land). ALSO shipped the v0.29.0 blocker fix: `learnDeckEnrich.js` fills blank deck cards from the local index so the whole engine plays real cards. Adversarial review over all 7,595 corpus instants/sorceries found+fixed 8 false-high classes (qualified mass damage, another/up-to, bulleted tiers, wrong-subject draw, delayed draw, creature-or-pw→player, wither/infect), all pinned. | high | L / med | P2.4 |
| **P2.6** | **Token + counter atoms** | `create-token` via `createTokenPermanent`; put-counters via `addCounter` | high | M / med | P2.2 |
| **P2.7** | **Atom-family expansion** | life/tap/untap/bounce/discard/mill/scry/exile on existing helpers | high | M / low | P2.5 |
| **P2.8** | **Coverage metric** | static deck scan + runtime tally (`programConfidence`), median over real decks, surfaced in LearnView | medium | M / low | P2.7 |
| **P2.9** | **Broad anthem/lord/grant expansion** | grow the `staticAbilityParser` grammar | medium | M / low | P2.5 |
| **P2.10** | **Beginner trigger-target / "may" interaction (F7b)** | extend the decisionGate ask contract for triggers | medium | M / med | P2.5 |
| **P2.11** | **Activated abilities** | new `activate-ability` action kind paying tap/mana/sacrifice under `activated.effect` (fully deferred today) | high | L / high | P2.7 |
| **P2.12** | **Replacement effects (CR 614/616)** | enters-tapped/with-counters + die-replacement; entry-event hook on the D5 ETB seam (hardest; a miss is safe) | medium | L / high | P2.6 |
| **P2.13** | **cardEffects override hook + facade removal** | named-card EffectProgram override; the closer | low | S / low | P2.11 |

**First three: P2.1 seam (✅ shipped v0.26.0) → P2.2 interpreter (NEXT) → P2.3 pump.** The Arbiter boundary:
`programConfidence` is **all-or-nothing** — high runs ALL atoms; low runs ZERO and
emits `pendingArbiter`. The engine never makes a network call; the UI invokes the
Ollama-only Arbiter (CLAUDE.md §6 invariant).

**Biggest risk:** a false-confident parse executing the *wrong* behavior silently
(worse than a no-op). Mitigation: conservative-by-construction confidence + a pinned
"must drop to low" parser corpus, CI-gated (every widening of "high" is a deliberate,
reviewed act).

**Named Phase-2 gaps to own (not discover later):** replacement effects (614/616),
state-triggered abilities (603.8), copiable values (707, reserve a `copiableValues`
field on the layers output — already present), additional costs / cost riders, the
decisionGate "ask" contract extension for user trigger-target / "may" choices (P2.10).

---

## 5. Phase 3 — Persistence (high-level PR outline)

Small — the payoff of doing serialization right in Phase 1. Per-profile via
`profilePath()`. Full detail in [`docs/design/engine-rebuild/05-persistence.md`](design/engine-rebuild/05-persistence.md).

> **Revised `[eng-review F6]`:** the save/resume machinery (items 1–4 below) is
> **pulled forward to PR-4a** in Phase 1 — landed early so serialization has a live
> consumer. What remains genuinely "Phase 3" is **records + insights** (items 5–6) +
> the optional goldfish adapter (item 7). Items 1–4 stay listed here as the
> canonical spec PR-4a implements.

1. **`atomicJson.js` extraction** — pull `atomicWriteJson` + `readJsonSafe` out of
   `/api/games` into `app/src/lib/server/` (pure refactor, repoint `/api/games`).
2. **Save schema + migration harness + `isSerializable`** — `learnSaveSchema.js`:
   `CURRENT_SCHEMA_VERSION`, ordered `MIGRATIONS`, `migrate()` (fail-closed on
   unknown → "archived, not resumable", never data loss), checksum, `isSerializable`
   guard. **CONTRACT-MIG:** any Phase-1/2 PR that changes persisted `state` shape
   ships its `MIGRATIONS[N]` entry + a `save-v<N>.json` fixture in the same PR.
3. **`learnSaveStore` + autosave** wired into `start`/`step` routes (fire-and-forget,
   `.catch`-guarded, once per HTTP transition at decision-settle points) +
   `session.meta` (deck id/name captured at the route boundary, never the pure
   factory) + the `PER_PROFILE_DIRS` edit (D7).
4. **`/api/learn/saves` + `/resume` + `/saves/delete`** routes (resume re-hydrates
   then `advanceUntilDecision` to recompute the prompt) + `LearnView` "Continue a
   game" list.
5. **Completed-game records** (`learnRecord.js`: outcome/turns/opponents/mistakes/
   stats derived from the terminal session + decisionLog) + delete the in-flight
   save at game-over.
6. **`learnInsights.js`** ("you keep missing X" mistake-pattern + abandon-pattern
   rollups, per-format) + `/api/learn/insights` + post-game patterns panel.
7. **(Optional, deferred)** goldfish-convergence adapter `learnRecordToGoldfishRow`
   — the playtesting-on-the-real-engine seam, an *adapter not a merge*.

---

## 6. Cross-subsystem contracts & integration points (watch these)

| Contract | Owner | Consumers | Reconciliation |
|---|---|---|---|
| `payload = {resolver, params}` (D1) | Stack / PR-1 | Triggers, Effect interpreter, Persistence | Global naming locked to `resolver`/`params`. No closures in production (D6 lint). |
| `deriveCharacteristics(state, permanentId)` (D3) | Layers / PR-9 | combat, legality, keywords, triggers, AI | id-keyed (memo WeakMap keys on it). `evaluateLayers` alias deleted; its idempotence/timestamp invariants folded into `layers.test.js`. |
| `serializeState` Phase 1 vs session-persistence Phase 3 (D4) | Stack + Persistence | round-trip test (P1), save store (P3) | Two layers. Behavioral round-trip CI-gating from PR-4. |
| **ETB three-way stamp** (D5) | Triggers (`enterBattlefield`) | Stack (id), Layers (timestamp) | One PR (PR-6), one owner, one all-three test. **Most under-coordinated seam — watch it.** |
| `decision.metadata.warning = {kind, detail, ruleRef?}` | decisionGate | Phase-3 mistake derivation | No CR number written unless the warning supplied one. |
| `PER_PROFILE_DIRS` += `learn-sessions`/`learn-records` (D7) | Persistence / profiles.js | — | One-line edit, explicitly owned by P3.3. |
| import-cycle discipline `[eng-review F3]` | all | — | `triggers.js`/`resolvers.js` are leaf modules (gameState reads only). **`layers.js` imports `ptPrimitive.js` + `keywords.hasKeyword`, NEVER `gameState`** — `gameState.creaturePower` delegates *outward* to `layers`, so the edge never reverses into a cycle. Hook orchestration lives in `gameEngine.js`. **dies-from-spell sources the `dead` look-back from `resolveSpellEffect`'s return** (NOT a post-resolution diff — a diff can't reconstruct CR 603.10a look-back). A cycle-check test lands in PR-5. |

---

## 7. Risks & mitigations (ranked)

1. **Resolver-key field-name divergence** → corrupts cross-section integration.
   *Mit:* D1 freezes `{resolver, params}`; the no-closure production lint is
   CI-gating from PR-4.
2. **The ETB path (PR-6) is a three-way contract no single section owns.** *Mit:*
   D5 — one PR, one owner, one test asserting id + timestamp + trigger together.
3. **The accessor swap (PR-11) is the highest-blast-radius change** — a subtle
   layers bug surfaces as wrong combat math across dozens of integration tests at
   once. *Mit:* PR-10's golden-value gate is mandatory + merge-blocking; treat any
   integration red in PR-11 as "behavior changed, the refactor is wrong," never
   "stale test." Idempotence property-test loops the registry.
4. **Layers performance on the 4P combat hot path** (O(battlefield) vs O(1)). *Mit:*
   WeakMap state-version memo + empty-board fast path (no effects + no counters →
   printed directly, so all ~250 Standard tests pay ≈ the old cost); benchmark
   assertion in PR-9 + a 4P-anthem benchmark in Phase 2.
5. **"Maximal fidelity" framing guarantees perpetual perceived failure.** *Mit:*
   the "supported vs Arbiter-resolved" coverage metric is the official progress
   measure; Arbiter handoff is a feature, never a gap to eliminate.
6. **Serialization invariant rots between phases** — *RESOLVED `[eng-review F6]`* by
   pulling the PR-4a save slice forward: save/resume is now a **live production
   consumer** from PR-4a onward, so the invariant can't silently rot. PR-4's
   behavioral round-trip + the no-closure lint (CI-gating) remain as belt-and-braces.
7. **False-confident effect parses (Phase 2) execute wrong behavior silently** —
   worse than a no-op. *Mit:* conservative-by-construction confidence (any unmodeled
   token → low → Arbiter; all-or-nothing); `parser.test.js` pins every "drops to
   low" trigger as a merge gate. Reserve the `pendingArbiter` →
   `decision.kind:"unresolved"` seam in Phase 1's `learnSession`.
8. **Trigger detection false-positives/negatives + infinite loops.** *Mit:* anchored
   regex (the proven `keywords.js` discipline), conservative bias (a miss = safe),
   `effect:null` → Arbiter; loops backstopped by the existing `SAFETY_CAP` +
   `progressSignature` latch plus a per-flush trigger budget (~200, log + Arbiter).

---

## 8. CR corrections surfaced (no fabrications)

The design verified all citations against `knowledge/mtg-judge/data/cr/cr_current.json`
(3,138 rules). Findings worth recording:

- **Layers counters are CR 613.4c (layer 7c)**, not "7d" as the brief loosely said;
  keyword counters are **613.1f (layer 6)**; 613.4d (7d) is P/T *switch*. The layers
  design uses the verified numbers.
- **`903.14a` (cited in a stale `learnSession.js:150` comment for commander damage)
  does not exist.** The real rules are **903.10a** and **704.6c**. → a tiny
  follow-up comment fix (tracked, see §9 note).
- Rules `112.7`, `116.4`, `114.6`, `114.8`, `712.999` **do not exist** and were
  correctly *not* cited by any section (each was proactively self-flagged). CR rigor
  across the design set was its strongest dimension.

---

## 9. Test strategy & green-discipline

- **`npm test` (app/) is the merge gate. No PR that leaves any learn test red
  merges — no "fix it next PR."** Each PR in §3 is independently shippable and
  revertable.
- **Tests that MUST migrate (enumerated, the only ones):** PR-3 — the one
  `actionDispatcher` `payload.onResolve toBeTypeOf "function"` assertion + the 2
  `gameEngine` throwing/flag closure tests (→ `registerResolver` test seam). PR-12 —
  one `staticPTModifier` direct assertion if/when the shim is deleted (0 if kept).
- **Tests that MUST stay byte-identical (the safety net):** all mana-empty timing,
  all P/T *value* assertions, every `integration.test.js`/`playable.integration` /
  `combatOrchestration` end-to-end (they assert *outcomes*, never stack internals) —
  **if one of these goes red during a refactor PR, STOP: you broke behavior, not a
  contract.**
- **Mandatory new regression tests:** serialize→restore behavioral round-trip
  (PR-4); resolver-key dispatch + unknown-key→manual (PR-1/2); layers idempotence +
  timestamp order (PR-9); trigger APNAP ordering (PR-5); the ETB three-stamp test
  (PR-6); the PR-10 golden-value equivalence gate.
- **Quick wins to fold in opportunistically:** fix the stale `903.14a` comment in
  `learnSession.js`; ensure every new module gets an import-smoke test (CLAUDE.md
  gotcha #10).
- Current baseline: **1184 vitest cases, 130 files, all green** from clean master
  (verified 2026-06-06).

---

## 10. Process (ultracode)

Per CLAUDE.md §7: roadmap doc (this) → `/plan-eng-review` + Codex outside-voice on
the plan → small TDD sub-PRs (§3) → adversarial review subagent on each real diff →
ship. Verify each PR: `cd app && npm test`; `cd app/src-tauri && cargo check` for any
Rust; live QA via preview tools on `/api/learn/*` for the integration PRs. This
plan was itself produced by a 6-agent design workflow + adversarial critique that
verified ground truth against the code and CR — the design files under
[`docs/design/engine-rebuild/`](design/engine-rebuild/) are that work, preserved.

Ship cadence: each PR → branch → PR to master → CI green (test + rust) → merge. Cut a
release tag when a user-visible slice lands (e.g. when triggers/anthems first change
gameplay, and when persistence ships). Conventional Commits; end commits with the
`Co-Authored-By: Claude Opus 4.8 (1M context)` trailer.

---

*Generated 2026-06-06. Keep current as Phase-1 PRs land — flip each row's status and
record any contract changes here so the next session starts from truth.*

---

## 11. Eng-review revisions (2026-06-06)

`/plan-eng-review` ran on the locked roadmap with an independent outside-voice pass
(Codex's Windows sandbox failed to initialize and it correctly refused to fabricate;
a fresh-context Claude adversarial subagent ran instead). The outside voice found
real, code-grounded issues the 6-agent design + reconciliation critique had missed.
Disposition:

| # | Finding | Disposition |
|---|---|---|
| **F2** | PR-7 dies-trigger look-back can't be reconstructed from a post-resolution membership diff (`moveCardToZone` already dropped the permanent's type/controller). | **Redesigned** — dies sources from the `dead` snapshot; `resolveSpellEffect` surfaces `{state, dead}`. No diff. (PR-7 + §6) |
| **F1/F9** | "Green after every PR" silently assumes the integration fixtures are vanilla; the riskiest boundary is **PR-6**, not PR-11. | **Added PR-4b fixture audit** before triggers; re-rated PR-6 as the riskiest boundary. |
| **F5** | `enterBattlefield` only covers 2 of 3 battlefield-entry paths (the blink branch is un-stamped). | **PR-6** now enumerates all entry paths + a per-path stamp test. |
| **F3** | The `gameState`↔`layers` import edge is a real cycle; roadmap said "no cycle" without scheduling the fix. | **`ptPrimitive.js` extraction is now a named PR-9 deliverable**; §6 wording corrected. |
| **F4** | PR-10 gate was downgraded to 4 golden literals. | **Restored to the exhaustive parity property-matrix.** |
| **F6** | Persistence parked dead-last despite only needing PR-0..4; plan's own R6 admits bit-rot. | **Owner decision: pull save/resume forward to PR-4a.** R6 resolved. |
| **F7a** | After PR-11, AI reads printed P/T while combat uses derived → misjudges Omnath. | **AI P/T rewire pulled into PR-12** (same window as the swap). |
| **F7b** | Phase-1 triggers auto-resolve user "may"/target choices, so Beginner mode can't interact with them — a gap for a teach-every-trigger product. | **Tracked:** keep the Phase-1 auto-resolve (scope discipline) but schedule Beginner trigger-target/"may" interaction as the **first Phase-2 item** (surfaced, not buried). |
| **F8** | Stack `source` carries the full card twice (`source` + `params.card`); de-dup deferred to a PR that didn't exist. | **Tracked TODO:** a Phase-1 cleanup PR folds `source` to `{id,name}` + rehydrates from the card index. |

PR-3's 3-test migration enumeration was independently **verified complete** by the
outside voice. No finding blocks PR-0; each is attached to the PR it gates.

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | — | not run (owner pre-scoped the mandate via the locked Q&A: maximal fidelity + full persistence, Foundation→Depth→Persistence) |
| Codex Review | `/codex review` | Independent 2nd opinion | 1 | error | Windows sandbox failed to init (`spawn setup refresh`); Codex refused to fabricate. Fell back to Claude adversarial subagent. |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | issues_found → resolved | 9 findings (F1–F9): 6 folded into the roadmap, 1 owner decision (persistence pull-forward, accepted), 2 tracked notes/TODOs. 0 unresolved. |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | — | not run (LearnView UI is a separate track — Phase-6 PR 11) |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | — | not run |

**OUTSIDE VOICE:** Codex unavailable (sandbox init failure on Windows). A fresh-context
Claude adversarial subagent ran the independent challenge and surfaced 9 grounded
findings the design workflow missed — most valuably the PR-7 dies-look-back flaw, the
real (not avoided) import cycle, and that PR-6 (not PR-11) is the riskiest boundary.

**CROSS-MODEL:** Codex could not run, so no cross-model comparison. The independent
subagent *corroborated* (did not contradict) the one owner-facing decision — pulling
persistence forward — strengthening that call.

**PARALLELIZATION:** Sequential implementation, no parallelization opportunity — every
Phase-1 PR touches `app/src/lib/learn/` and builds on the prior PR's contract.

**UNRESOLVED:** 0.

**VERDICT:** ENG CLEARED — roadmap revised, ready to implement. Build order:
PR-0 (determinism + 903.14a fix) → PR-1..4 (serializable data-driven stack) →
**PR-4a (save/resume slice)** → PR-4b (fixture audit) → PR-5..8 (triggers) →
PR-9..12 (CR 613 layers). Suite green after every PR; PR-6 and PR-11 are the
gated high-blast-radius boundaries.

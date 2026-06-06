All ground-truth claims are verified. `createGameState` confirms no `idSeq` today (Stack #1's addition is correct), `destroyLethalCreatures` returns `{state, dead}` with `{controller, id, name}` (Triggers #2's look-back dependency holds), and `createStackObject` mints id internally via module-global `nextId` (Stack #1's Option-B refactor analysis is correct). I have everything needed. Producing the reconciliation.

---

# Reconciliation Review: Maximal-Fidelity MTG Engine (6 parallel designs)

I verified every load-bearing claim against the actual code (`gameState.js`, `actionDispatcher.js`, `gameEngine.js`, `cardEffects.js`, `spellEffects.js`, the test files) and grepped all disputed CR numbers against `cr_current.json` (3,138 rules). Ground truth confirmed: closures live at `payload.onResolve` (actionDispatcher.js:230, gameEngine.js:329); `defaultSpellResolver` mints a non-deterministic `perm-${Date.now()}-${Math.random()}` id (actionDispatcher.js:329); `createGameState` has no `idSeq`; `destroyLethalCreatures` returns `{state, dead}` with `{controller,id,name}`; `creaturePower/Toughness` are the single accessor consulting `staticPTModifier`.

---

## 1. THE THREE SHARED CONTRACTS

### (a) Resolver-key payload contract — **CONFLICT on field names. PICK Stack #1's `{resolver, params}`.**

The five sections that touch this contract **do not agree on field names**, and this is the single highest-priority reconciliation:

| Section | Field for the key | Field for the args | Registry call |
|---|---|---|---|
| **Stack #1 (owner)** | `payload.resolver` | `payload.params` | `getResolver(key)` + `registerResolver` |
| Triggers #2 | `payload.resolverKey` | `payload.resolverArgs` | `resolveStackObject` |
| Effect #4 | `resolverKey` (top-level on stack obj, **not** under `payload`) | `payload.{program,choices}` | `registerResolver` / `resolveStackObject` |
| Persistence #5 | `payload.resolverKey` | `payload.params` | `resolverFor(key)` |
| Test #6 | `payload.resolverKey` | `payload.resolverArgs` | `resolverRegistry[key]` |

**Canonical winner: Stack #1's shape — `payload = { resolver: string, params: object }`** — with two binding amendments:

1. **The key lives under `payload`, not on the stack object top-level.** Effect #4 alone puts `resolverKey` as a sibling of `payload`; this is wrong. The serialization guard (Stack #1 §7: "no function anywhere in `payload`") and `flushTriggers`' verbatim `payload` copy (gameEngine.js:400-408) both assume the resolver descriptor rides *inside* `payload`. Top-level placement would force `flushTriggers` and `createStackObject` signature changes that Stack #1 explicitly avoided. **Reject Effect #4's placement.**

2. **Field names are `resolver` + `params`.** Stack #1 owns this contract (it's PR-1, the keystone), so its names win by ownership. Three sections invented `resolverKey`/`resolverArgs` in parallel without seeing each other. The synthesis must do a global rename in Triggers #2, Effect #4, Persistence #5, and Test #6 to `resolver`/`params`. This is mechanical but **must happen before any of those sections write code**, or every cross-section test churns.

**Why Stack #1 wins beyond ownership:** it is the only section that (i) enumerated the actual v1 key set as a frozen enum, (ii) specified the per-key param shapes that Triggers/Effect consume, (iii) designed `registerResolver` + a mutable `EXTENSIONS` map so Triggers #2 and Effect #4 add keys *without editing the core module* (resolving the genuine question of "who owns the registry file"), and (iv) shipped the serialization round-trip test as the executable contract guard. Test #6 independently arrived at the same `getResolver`/registry/escape-valve design, which is strong corroboration.

**One unresolved sub-conflict to decide now:** the resolver-key *namespace*. Effect #4 wants a single key `"effect-program"` carrying an ordered `EffectProgram` (atoms). Stack #1 wants `"spell.effect"` carrying a single `SpellEffect` descriptor. These are **incompatible representations of the same thing**, deferred to Phase 2 but the contract must be reserved now. **Decision: reserve BOTH keys in the frozen enum.** Phase 1 ships `"spell.effect"` (single descriptor, matches today's `parseSpellEffect`). Phase 2's Effect #4 work introduces `"effect-program"` as a *new* key and migrates `applyCastSpell` to emit it — it does not overload `"spell.effect"`. This lets Phase 1 land without Effect #4 and Phase 2 grow additively. Stack #1 already anticipated this ("Agent 4 extends params"); make it explicit as two keys, not one mutating key.

### (b) Derived-characteristics / layers contract — **AGREE in substance, one naming collision to resolve.**

Layers #3 owns this and is the highest-quality section in the set — it caught the brief's own error (counters are CR **613.4c** not 7d; keyword counters are **613.1f** layer 6), which I verified. The consumers agree on the shape:

- **Layers #3** exports `permanentPower(state, id)`, `permanentToughness(state, id)`, `permanentHasKeyword(state, id, kw)`, plus the heavy `deriveCharacteristics(state, id)`.
- **Test #6** calls the same concept `evaluateLayers(state, perm) -> characteristics` and pins **idempotence** (CR 613.1) + **timestamp order** (CR 613.7) as mandatory invariants.
- **Triggers #2** consumes `creaturePower/Toughness(perm, state)` (unchanged signature) for trigger conditions — which Layers #3 preserves by making `gameState.creaturePower` *delegate* to `permanentPower` when `state` is passed.
- **Effect #4** emits continuous-effect records (pump/grant-keyword) into Layers' `addContinuousEffect`, never mutating P/T.

**Naming collision:** Test #6 says `evaluateLayers(state, perm)`; Layers #3 says `deriveCharacteristics(state, permanentId)` (takes an id, not a permanent object). **Canonical: Layers #3's `deriveCharacteristics(state, permanentId)`** — it owns the subsystem, and id-keyed is correct because the memo WeakMap keys on `(state, permanentId)`. Test #6's `evaluateLayers` is an alias to delete; its *invariants* (idempotence, timestamp order, recompute-from-printed-base) are the valuable contribution and must be folded into `layers.test.js`.

**The one hard ordering requirement both sections agree on, made canonical:** the **equivalence gate**. Test #6's PR L1 ("golden-value characterization test proving the layers engine == current inline math for the registry cards, captured as literals, *before* the accessor swap") is the correct gate and is **mandatory before Layers #3's PR L2** (the `creaturePower` delegation). Layers #3 has a weaker version (a parity test in L2); Test #6's "land the golden values in a separate PR *before* you touch the accessor" is stricter and wins. This is the cheap insurance against the highest-blast-radius change in the whole plan.

**Critical agreement to enforce:** the accessor must return the **true CR value (can be negative)**; combat floors at 0 (`Math.max(0, ...)` already in `combatResolution`), SBA reads raw (`tough <= 0` dies). Both Layers #3 §3.5 and Test #6 state this. `destroyLethalCreatures` (verified above) already calls `creatureToughness(perm, state)`, so it transparently gets layered toughness once delegation lands — **no SBA code change needed**, which both sections correctly assert.

### (c) Serialization contract — **AGREE, with one ownership ambiguity to resolve in Stack #1's favor.**

All three relevant sections converge cleanly:

- **Stack #1** ships `serialization.js` (`serializeState`/`deserializeState`, trivial JSON pass-through) in **Phase 1 PR-1d** plus the "no function anywhere in state" walk test.
- **Persistence #5** depends on exactly this (`CONTRACT-A1`) and builds disk save/resume on top in Phase 3, gating *only* the resume-mid-game capability behind an `isSerializable(session)` runtime guard.
- **Test #6** independently demands the **behavioral** round-trip (`resolveTopOfStack(restored)` deep-equals `resolveTopOfStack(original)`) land in **Phase 1**, calling it "the executable definition of serialization done."

**Resolved ambiguity — who owns the serialize module and when does it land:** Stack #1 says `serialization.js` is its PR-1d deliverable. Persistence #5 references a `persistence.js`. Test #6 says `persistence.js`/`serializeSession` must land in **Phase 1** (not Phase 3) as a pure guard. **Canonical: Stack #1's `serialization.js` lands in Phase 1 PR-1d** (state-level `serializeState`), and Persistence #5's Phase-3 `learnSaveStore.js` wraps it for *session*-level disk I/O (adds checksum, schema version, atomic write). They are two layers, not a conflict: state-serialization (Phase 1, Stack #1) vs session-persistence (Phase 3, Persistence #5). Test #6's behavioral round-trip belongs in Phase 1 against `serialization.js`.

**Both duration/queue coverage requirements are met:** Layers #3 guarantees `state.continuousEffects` + `state.timestampCounter` + `permanent.timestamp` are plain JSON (contract C6). Triggers #2 guarantees `pendingTriggers` payloads are plain data post-TR-7. Stack #1's "no functions" walk test enforces both transitively. **Gap closed by construction.**

---

## 2. GAPS — things NO section fully owns

1. **Replacement effects (CR 614/616) — UNOWNED in Phase 1, correctly deferred but with a Phase-1 *collision*.** Effect #4 lists them (PR-E7) and Test #6 names them as the hard long tail. But **CR 603.6d's "enters with N counters / enters tapped / as ~ enters"** is a *static replacement-style* effect that Triggers #2 must not misclassify as a trigger — and Layers #3 says "enters with counters" application is "Agent 3/Phase-2 territory." **Nobody owns actually applying "enters tapped/with counters" in Phase 1.** Resolution: Phase 1 only needs the *non-misclassification* (Triggers #2 §3.2 guard), which is owned. Actual replacement application is a Phase-2 PR — assign it to the Effect/Layers boundary explicitly (it's a layer-independent entry-event mutation). Flag: **no general replacement engine exists in any section's Phase-1 scope, and that's acceptable**, but the synthesis must name an owner for Phase 2 (recommend Effect #4's PR-E7, ordering-aware per CR 616).

2. **State-triggered abilities (CR 603.8) — UNOWNED.** Triggers #2 covers event triggers (ETB/dies/upkeep/attacks) but **not** state-triggered abilities ("when a player has 0 life," "when you control no permanents"). These check game state continuously like SBAs but use the stack. No section owns them. Low Phase-1 priority (rare in starter decks) but flag as a named Phase-2 gap, not an oversight to discover later.

3. **Copiable values (CR 707) — UNOWNED.** Layers #3 stubs layer 1 (copy) as pass-through. No section defines what a copiable value *is* (the printed characteristics + copy effects, before other layers). Acceptable Phase-1 deferral (no Clone in the engine), but the `deriveCharacteristics` output needs a reserved `copiableValues` field so Phase 2 doesn't reshape the contract. **Add to Layers #3's `Characteristics` shape now.**

4. **Timestamp authority across the three subsystems — PARTIALLY owned, needs one owner.** Layers #3 wants `state.timestampCounter` + `permanent.timestamp` set at ETB. Stack #1 wants `state.idSeq` for ids. These are **two separate monotonic counters** — a reasonable split (ids vs timestamps), but **both must be threaded by the same ETB path**, and neither section fully owns the ETB path (Triggers #2's `enterBattlefield` does). **Resolution: Triggers #2's `enterBattlefield`/`checkEtbTriggers` is the single ETB chokepoint and must stamp BOTH `id` (via Stack #1's `mintId`) AND `timestamp` (via Layers #3's counter).** This three-way dependency on the ETB path is the most under-coordinated seam in the plan — call it out as a synthesis-critical integration point. (See Risk #2.)

5. **X / additional costs / mana abilities not using the stack — SPLIT, mostly owned.** Mana abilities correctly don't use the stack (CR 605.3, verified; `applyTapForMana` already bypasses it). X spells: Effect #4 owns (PR-E7, binds X at cast). Additional costs ("as an additional cost, sacrifice"): **UNOWNED** — Effect #4 lists `divide`/additional-cost as "late/unresolved" but no section parses cost riders. Acceptable deferral; flag as Phase 2.

6. **Undo/redo vs immutability — UNOWNED, and it's a real product question.** Every section embraces pure-immutable state (new object per helper). Persistence #5 enables save/resume but **not turn-level undo**. The Academy is a *teaching* tool — "take back that misplay" is a plausibly-wanted feature. Immutable state + the append-only `log` make undo *trivially possible* (replay log to N-1, or snapshot-per-decision). No section claims it. **Flag as an un-scoped product decision** — not a Phase-1 blocker, but Persistence #5's per-decision autosave is 90% of the machinery, so decide before Phase 3 whether to keep decision snapshots for undo.

7. **The AI understanding new effect atoms — PARTIALLY owned, under-specified.** Effect #4 (PR-E10) generalizes `chooseAITarget` → `chooseAIChoices`. But **`opponentAI.js`, `boardContext.js`, `trapDetector.js` read raw `card.power`/`card.toughness`** (Layers #3 confirms, defers them). When anthems/layers land, **the AI evaluates board state on *printed* P/T while combat resolves on *derived* P/T** — the AI will misjudge every buffed board. Layers #3 flags this as "Phase-2 optional." **It is not optional** if the AI is to play correctly post-anthem. Resolution: route `boardContext`/`trapDetector`/`opponentAI` threat math through `permanentPower(state, id)` in the same Phase-2 PR that introduces anthems (Layers #3 PR L5 / Test #6 P2.1). Otherwise PR L5 ships an AI that can't see its own buffs.

8. **`profiles.js` `PER_PROFILE_DIRS` edit — owned by Persistence #5 but it's a cross-subsystem write.** Persistence #5 Risk 5 correctly catches that `learn-sessions`/`learn-records` must be added to `PER_PROFILE_DIRS` or pre-registry-window saves orphan. This is a one-line edit to a file no other section touches — **assign it explicitly to Persistence #5's PR P3.3** so it doesn't fall through.

---

## 3. CR CORRECTNESS

**All citations are accurate where present.** I verified 3,138 rules. Findings:

- ✅ **Layers #3's correction is right and important:** P/T-modifying counters are **CR 613.4c (layer 7c)**, not 7d — verified the exact text ("Effects **and counters** that modify power and/or toughness"). 613.4d is P/T *switch*. Keyword counters are **613.1f (layer 6)**. The brief was loose; Layers #3 fixed it. **Propagate this correction to any section that says "7d."**
- ✅ **Persistence #5's correction is right:** `903.14a` (cited in a stale `learnSession.js:150` comment) **does not exist**. The real commander-damage rules are **903.10a** and **704.6c** — both verified. This is a live code-comment bug worth a one-line follow-up fix.
- ✅ **Stack #1's honesty holds:** `112.7` and `116.4` **do not exist** — correctly not cited.
- ✅ **Effect #4's honesty holds:** `114.6`/`114.8` **do not exist** — correctly not cited; "up to one target" relies on `cardinality.min:0` instead of a fabricated rule. Good.
- ✅ **Test #6's honesty holds:** `112.7` and `712.999` **do not exist** — correctly not cited.

**One citation gap a section *should* have cited and didn't:**
- **Triggers #2 cites CR 603.3b for APNAP but should also anchor the "intervening if" recheck explicitly to its own sub-rule.** It cites 603.4 (correct — verified, includes the Felidar example). Adequate.
- **Effect #4's `counter-spell` atom (PR-E6) cites 701.6** but should also cite **CR 608.2b** (which it does cite elsewhere) for the "target spell left the stack → countering does nothing" case. Minor.
- **No section cites CR 603.2c** for trigger *dedup* except Triggers #2 (which does, correctly — "a trigger fires once per event"). Good.

**Net: CR rigor across all six sections is excellent.** The three fabricated numbers were all proactively flagged by the sections themselves, not slipped in. This is the strongest dimension of the whole design set.

---

## 4. PHASE-1 PR SEQUENCE (the foundation — what we build next)

Synthesizing Stack #1's PR-1a–d, Triggers #2's TR-1–7, Layers #3's L1–L4, and Test #6's P1.0–P1.8 into one ordered sequence. The four sections independently converged on nearly the same order; conflicts resolved below.

### ▶ START HERE — **PR-0: Determinism prerequisite** (Test #6's P1.0, elevated to first)

**Scope:** Route ALL id minting through a deterministic, state-threaded source — add `state.idSeq` + `mintId(state, prefix)` (Stack #1 §4), seed `idSeq:0` in `createGameState`, give `createStackObject`/`createPermanent` an optional `id` param, thread `moveCardToZone`'s becomePermanent branch. Add the shared `stableSnapshot(session)` test helper that strips volatile fields `{createdAt, endedAt, ts, id-entropy}`.

**Why start here:** This is the one prerequisite *all four* serialization-dependent sections share. The non-deterministic `perm-${Date.now()}-${Math.random()}` id (verified at actionDispatcher.js:329) **breaks every round-trip equivalence test** — a restored permanent mints a different id. Test #6 names it correctly: "P1.0 is a hard prerequisite." It is invisible (legacy `nextId` fallback keeps un-migrated callers green → zero test churn), so it can't break anything, and *nothing else can be proven correct without it*. Stack #1 buried this inside PR-1a; Test #6 correctly pulls it out front. **This ordering — determinism before the registry — is the single most important sequencing decision in Phase 1.**

**Suite state after PR-0: GREEN** (purely additive; legacy ids still mint via fallback).

---

| PR | One-line scope | Suite |
|---|---|---|
| **PR-0 (START)** | Deterministic `idSeq`/`mintId` + optional `id` on factories + `stableSnapshot` helper. *Invisible — legacy fallback intact.* | 🟢 |
| **PR-1** | Resolver registry: `resolvers.js` with frozen `RESOLVER_KEYS` enum (`spell.effect`, `spell.permanent`, `spell.noop`, `trigger.effect`, `activated.effect`, `manual`, + reserved `effect-program`), `getResolver`/`registerResolver`/`EXTENSIONS`. **Nothing calls it yet.** | 🟢 |
| **PR-2** | `resolveTopOfStack` dispatch: registry lookup *alongside* the `onResolve` fallback (expand step). Add registry-dispatch + unknown-key-logs-error tests. *No production code stops emitting closures.* | 🟢 |
| **PR-3** | Cast-path swap: `applyCastSpell` emits `payload:{resolver:"spell.effect"|"spell.permanent"|"spell.noop", params}`; **delete `defaultSpellResolver`**; extract `enterPermanent`/`isPermanentSpell`. Migrate the 1 dispatcher closure-assertion test + the 2 throwing/flag gameEngine tests (via `registerResolver` test seam). | 🟢 |
| **PR-4** | `serialization.js` + the **behavioral round-trip test** (cast → serialize mid-stack → deserialize → resolve → deep-equal) + the "no functions anywhere in state" walk. **This is the executable definition of "serialization done."** | 🟢 ← **SUITE FULLY GREEN ON THE NEW CONTRACT HERE** |
| **PR-5** | Triggers infra: `triggers.js` (leaf — detection/matching/`applyTriggerEffect`/`checkInterveningIf`), generalize `flushTriggers` to N-seat APNAP (`orderTriggersAPNAP`, CR 603.3b). *Nothing enqueued yet.* Add 4-seat APNAP test. | 🟢 |
| **PR-6** | ETB hook: `enterBattlefield` + `checkEtbTriggers` (CR 603.6a). **This PR is the three-way integration point** — `enterBattlefield` stamps `id` (mintId), `timestamp` (Layers counter — added here), and fires ETB triggers. Routes `defaultSpellResolver`'s old job + `applyPlayLand` through it. | 🟢 |
| **PR-7** | dies hook: `checkDiesTriggers` from `destroyLethalCreatures`' `dead` (combat) + post-resolution dies-diff in `resolveTopOfStack` (CR 603.6c/603.10a). Avoids the spellEffects→gameEngine cycle. | 🟢 |
| **PR-8** | Step + attack triggers: `checkStepTriggers` (upkeep/draw/end, CR 603.2b) + `checkAttackTriggers` (CR 508.3) wired into `runStepActions`. Triggers emit `payload:{resolver:"trigger.effect", params}` directly (registry exists since PR-1, so no closure-overlap window needed). | 🟢 |
| **PR-9** | Layers engine: `layers.js` standalone — `deriveCharacteristics`, `collectContinuousEffects`, accessors, `addContinuousEffect`/`expireContinuousEffects`, memo WeakMaps, fast-path, layers 4-7 (1-3 stubbed). **NOT wired into `creaturePower`.** Own tests incl. **idempotence** (CR 613.1) + timestamp order (CR 613.7). | 🟢 |
| **PR-10** | **EQUIVALENCE GATE** (Test #6's L1): golden-value characterization test proving `deriveCharacteristics` == current inline P/T math for the 3 registry cards (Omnath at 0/1/5 green, bear, ±counters, 0-toughness). Captured as literals. *Gates PR-11.* | 🟢 |
| **PR-11** | Accessor swap: `creaturePower/Toughness` delegate to `permanentPower/Toughness` when `state` passed (else printed+counters). Omnath ports to a layer-7c `ptModifyDynamic` descriptor. `staticPTModifier` kept as a thin shim. **Highest blast radius — gated by PR-10.** | 🟢 |
| **PR-12** | Cleanup + granted keywords: `expireContinuousEffects` at cleanup (CR 514.2); `permanentHasKeyword` unions layer-6 grants; rewire `combatResolution`/`legalChoices` evasion+haste to `permanentHasKeyword`; delete the `staticPTModifier` shim. | 🟢 |

**Where the ~1184 suite is green:** It is green **after every PR** (expand-migrate-contract discipline). The suite is fully green *on the new serializable contract* — i.e. closures gone from production, round-trip proven — **after PR-4**. PR-5 through PR-12 are additive (new triggers fire, new layer math) and keep it green by construction, with deliberate, enumerated test migrations only at PR-3 (3 tests) and PR-11 (0 if shim kept).

**Resolved sequencing conflicts:**
- **Triggers #2's TR-7 (closure→resolverKey swap) is DELETED.** TR-7 only exists if triggers land *before* the registry. With PR-1 (registry) before PR-5–8 (triggers), triggers emit `resolver:"trigger.effect"` directly. Triggers #2 itself says "if Agent 1 lands first, TR-7 collapses." We land Agent 1 first. **No overlap-window closures, ever.** This removes the single riskiest ordering coupling in the entire plan.
- **Layers infra (PR-9) lands after triggers (PR-5–8)**, not interleaved, because triggers have zero dependency on layers in Phase 1 (Triggers #2 reads `creaturePower` with the *old* signature, preserved until PR-11). Could also go earlier; placed here to keep the high-blast-radius accessor swap (PR-11) last.
- **The equivalence gate (PR-10) is a separate PR before PR-11**, per Test #6 — stricter than Layers #3's inline parity test. Adopted.

---

## Phase 2 / Phase 3 — high-level PR outline

**Phase 2 (Depth):** P2.1 anthems/lords as layer-6/7c continuous effects **+ route AI threat-math (`boardContext`/`trapDetector`/`opponentAI`) through `permanentPower`** (gap #7) → P2.2 pump (`+X/+X until EOT`, timestamped, cleanup-expiry) → P2.3 tokens + counters → P2.4 `EffectProgram` multi-clause/modal (introduces `effect-program` resolver key) → P2.5 X-spells → P2.6 activated abilities → P2.7 replacement-effects engine (CR 614/616, ordering-aware) → P2.8 oracle-template library expansion + the **"supported vs Arbiter-resolved" coverage metric** (Test #6's reframe of the scope-realism problem).

**Phase 3 (Persistence — small, the payoff):** P3.1 `atomicJson.js` extraction (pure refactor, repoint `/api/games`) → P3.2 save schema + migration harness + `isSerializable` + `PER_PROFILE_DIRS` edit → P3.3 `learnSaveStore` + autosave wired into `start`/`step` routes + `session.meta` → P3.4 `/api/learn/saves`/`resume`/`delete` routes → P3.5 completed-game records → P3.6 `learnInsights` ("you keep missing X") + UI.

---

## 5. TOP RISKS (ranked) with mitigations

**R1 — Resolver-key field-name divergence corrupts cross-section integration.** Four sections invented `resolverKey`/`resolverArgs` vs Stack #1's `resolver`/`params`, and Effect #4 even put the key at the wrong nesting level. If synthesis doesn't rename *before* code, every Triggers/Effect/Persistence/Test cross-reference is wrong. **Mitigation:** Freeze Stack #1's `payload = {resolver, params}` as the contract in a shared doc before PR-1; add a lint/test that asserts production stack objects carry `payload.resolver` (string) and never `payload.onResolve` (Test #6's R2 no-closure guard, made CI-gating from PR-4).

**R2 — The ETB path (PR-6) is a three-way contract no single section owns.** `enterBattlefield` must stamp `id` (Stack #1), `timestamp` (Layers #3), AND fire triggers (Triggers #2) — three sections, one function, written blind to each other. A missed `timestamp` stamp silently breaks layer timestamp-ordering (CR 613.7) months later when two anthems collide. **Mitigation:** Make PR-6 the explicit integration PR with a test asserting a freshly-entered permanent has a unique deterministic `id`, a monotonic `timestamp`, and fires its ETB trigger — all three in one test. Assign one owner to PR-6 (recommend whoever does Triggers, since `enterBattlefield` is theirs) with Stack/Layers reviewing.

**R3 — The accessor swap (PR-11) is the highest-blast-radius change; a subtle layers bug shows as wrong combat math across dozens of integration tests at once.** `creaturePower/Toughness` feed combat, SBAs, legality, and UI. **Mitigation:** PR-10's golden-value equivalence gate is *mandatory and merge-blocking* before PR-11. Treat any integration-test red during PR-11 as "behavior changed, the refactor is wrong" — never "stale test." Add Test #6's property test: loop the registry, assert `deriveCharacteristics` is idempotent (double-eval == single-eval) for every effect, so a Phase-2 effect that violates idempotence fails immediately.

**R4 — Layers performance on the 4P Commander combat hot path.** `deriveCharacteristics` is O(battlefield) vs the old O(1), called per-creature per-damage-step. A 4P board with anthems deriving 20 creatures per step could stall full-game autopilots (and the ~250 Standard tests if the fast-path regresses). **Mitigation:** Layers #3's WeakMap state-version memo + empty-board fast-path (no continuous effects + no counters → return printed directly). Add a benchmark assertion in PR-9 that a no-effect board pays ≈ the old cost, and a 4P-anthem benchmark in Phase-2 P2.1.

**R5 — "Maximal fidelity" framing guarantees perpetual perceived failure** (Test #6's organizational risk). Measuring against Forge/XMage template parity (thousands of cards, 15+ volunteer-years) drives over-investment in the unbounded long tail at the cost of the playable core. **Mitigation:** Adopt Test #6's reframe — goal is *"every common interaction + a verified Arbiter ruling for the rest,"* not template parity. Make Arbiter a **permanent load-bearing component**, not removable scaffolding. Ship the "supported vs Arbiter-resolved" coverage *metric* (Phase 2 P2.8) as the official progress measure, turning the infinite tail into a number that goes up.

**R6 — Serialization invariant rots between phases (no production consumer until Phase 3).** Phase 1 builds serializability with no product forcing it until Phase 3 save/resume — a future PR could `.skip` the round-trip test and reintroduce a closure invisibly. **Mitigation:** PR-4's behavioral round-trip + R1's no-closure lint are CI-gating from PR-4 onward — they *are* the forcing function in lieu of a product consumer. Persistence #5's `isSerializable` guard is the second backstop.

**R7 — False-confident effect parses (Phase 2) execute wrong behavior silently** — worse than a no-op because it's wrong AND silent, the exact opposite of The Academy's teaching mandate. **Mitigation:** Effect #4's confidence boundary is conservative-by-construction (any unmodeled token → `unparsed` → low confidence → Arbiter; all-or-nothing execution, never partial). `parser.test.js` pins every "drops to low" trigger as a merge gate so widening "high" is a deliberate reviewed act. This is Phase 2, but the `pendingArbiter` → `decision.kind:"unresolved"` seam must be reserved in Phase 1's `learnSession` so Phase 2 has somewhere to land.

**R8 — Trigger detection false-positives/negatives + infinite trigger loops.** Over-matching "when" mid-sentence; or a watcher-token-maker loop. **Mitigation:** Triggers #2's anchored regex (the proven `keywords.js` discipline), conservative bias (a miss = ability doesn't fire = safe, never fabricated), `effect:null` → Arbiter. For loops: the existing `learnSession` SAFETY_CAP + `progressSignature` anti-loop latch backstop, plus a per-flush trigger budget (cap ~200, log `trigger-budget-exceeded`, route to Arbiter — never spin silently).

---

**Bottom line:** The six sections are unusually well-aligned — they independently converged on the same registry pattern, the same equivalence-gate discipline, and the same Arbiter-as-permanent-fail-safe philosophy, and their CR rigor is excellent (every fabricated rule was self-flagged). The real work for synthesis is **(1) one global rename to Stack #1's `{resolver, params}`**, **(2) deleting Triggers #2's TR-7 by landing the registry first**, **(3) naming an owner for the three-way ETB path (PR-6)**, and **(4) elevating determinism (PR-0) and the equivalence gate (PR-10) to their own front-loaded PRs**. Start with PR-0.
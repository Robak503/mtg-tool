# SUBSYSTEM DESIGN 6: Test & realism

I now have the complete contract. The action already carries a serializable `effect` descriptor — the closure (`onResolve`) is built in the dispatcher *from* that descriptor. This is the critical migration insight: the data already exists, the closure is redundant. I have everything needed to write the blueprint.

Here is the design section for subsystem (6).

---

# Subsystem 6 — Test Strategy, Migration Safety, and Scope-Realism

> The adversarial realism voice for the three-phase learn-engine rebuild. This document is the test-and-safety contract every other subsystem's PRs must satisfy, plus a blunt assessment of how far "maximal fidelity" is actually reachable.

## 0. Verified ground truth (read before trusting any plan)

I read the actual code. The facts that drive everything below:

**0.1 The closure is already redundant data.** The serialization blocker is real but smaller than it looks. `actionDispatcher.applyCastSpell` (lines 228-244) builds `payload.onResolve` as a closure **from a fully-serializable `effect` descriptor** that already rides on the action (`action.effect`, set in `legalChoices.actionsCastSpell` line 283) and a `targets` array (also serializable, `{type,id,controller?,name}` from `spellEffects.enumerateTargets`). The stack object *already stores* `payload.effect` and `payload.cardId` alongside the closure. **The closure is a cached partial-application of data the stack object already carries.** This is the single most important fact for migration: we are not reverse-engineering behavior out of a closure — the inputs are sitting right next to it.

**0.2 Persistence does NOT currently round-trip state.** `learnSessionStore.js` holds the **live JS session object** in a process-scoped `Map` (line 23, pinned to `globalThis`). Closures survive because the object is never serialized. The wire payload (`stripDecisionForWire` in both routes) strips functions **only from the `decision`**, never from `session.state`. So today nothing forces serializability. Phase 3 (disk save/resume) is the *first* consumer that does. This means: **Phase 1's serializability refactor has no production consumer until Phase 3** — which is both a risk (no forcing function = drift) and an opportunity (we can land the round-trip test as a pure guard before any persistence ships).

**0.3 The trigger system is a stub, not a system.** `flushTriggers` (gameEngine.js 389-415) does APNAP-ish ordering (active-player-first, FIFO within group) and copies `trigger.payload` (which *can* contain an `onResolve` closure) onto stack objects verbatim. There is no condition-detection, no "trigger fired because event X happened" wiring — nothing calls `enqueueTrigger` from a real game event today. The Phase-1 "real triggered-abilities system" is a greenfield build, not a refactor. Test churn here is near-zero (the 4 existing trigger tests are about the *queue mechanics*, not real triggers).

**0.4 The layers system does not exist.** Continuous effects today = exactly two hooks in `cardEffects.js`: `staticPTModifier` (consulted by `creaturePower`/`creatureToughness`) and `manaDoesNotEmpty` (consulted by `emptyManaPools`). The registry has 3 cards. `knowledge/mtg-engine/` marks 611-613 "layers" as NOT built. So the CR 613 layers system is also greenfield — but its churn is **high** because `creaturePower`/`creatureToughness` are *the* single P/T accessor and ~13 test assertions in `cardEffects.test.js` pin exact P/T values that flow through it.

**0.5 Exact test inventory (the churn map).** Learn-subsystem `it()`/`test()` count = **432 cases** across 28 files (full suite ~1184; the rest are non-learn). Files that assert on the four churn-prone contracts:

| Contract under refactor | Files asserting on it | Risk |
|---|---|---|
| `payload.onResolve` is a function / is called | `actionDispatcher.test.js:174`, `gameEngine.test.js:238,263,274,286,294,302` (7 assertions) | **HIGH** — direct closure assertions |
| `staticPTModifier` / exact P/T values | `cardEffects.test.js` (13 occ), `gameState.multiplayer.test.js:1` | **HIGH** — layers refactor moves the math |
| mana-empty timing (`emptyManaPools`/`manaDoesNotEmpty`) | `manaEmptying.test.js` (6 occ), `cardEffects.test.js`, `gameEngine.test.js` | **MED** — behavior must stay byte-identical |
| stack shape (`.stack[n]`, `.payload`, `pendingTriggers`) | `gameEngine.test.js` (18 occ), `actionDispatcher.test.js`, `spellWiring.test.js:55`, `combat*` | **MED** — additive shape change is safe; field *removal* is not |

`test` script = `node scripts/test-with-timeout.cjs` (wraps `vitest run`); `test:raw` = `vitest run`.

---

## PART A — Keeping ~1184 tests green THROUGH the refactor

The core trap the prompt names — **"pr-split-broken-intermediate"** — happens when you change a producer (the dispatcher building stack objects) and the consumer (`resolveTopOfStack`) in different PRs, leaving an intermediate commit where the suite is red. The defense is a **dual-write / expand-migrate-contract** discipline applied to two specific contracts.

### A.1 The two contracts under refactor, and their migration shape

**Contract 1 — the resolver dispatch (`onResolve` closure → `resolverKey` data).**
*This is the Stack subsystem's contract; subsystem 6 enforces its test safety.*

The new shape (per the Stack design — flagged as a cross-subsystem dependency below): stack objects carry `payload.resolverKey` (a string like `"spellEffect"` / `"defaultPermanent"` / `"triggered:soulWarden"`) + `payload.resolverArgs` (serializable) instead of `payload.onResolve`. `resolveTopOfStack` looks up a pure function in a module-level **resolver registry** keyed by `resolverKey` and calls `registry[key](state, stackObject)`.

The expand-migrate-contract sequence that never goes red:

- **EXPAND (PR S0):** Add the resolver registry + `resolverKey` support to `resolveTopOfStack` *alongside* the existing `onResolve` path. New precedence: `if (payload.resolverKey) useRegistry(); else if (typeof payload.onResolve === "function") callClosure(); else logNoOp()`. **Every existing test stays green byte-identical** because nothing stops producing `onResolve` yet. Add NEW tests for the registry path. **Suite green.**
- **MIGRATE (PR S1):** Change `actionDispatcher.applyCastSpell` to emit `resolverKey: "spellEffect"` + `resolverArgs: {effect, controller, targets}` (it *already has* all three — fact 0.1) and **stop** building the `onResolve` closure for spells. Now `actionDispatcher.test.js:174` (`payload.onResolve toBeTypeOf "function"`) **must be rewritten** to assert `payload.resolverKey === "spellEffect"`. This is the one unavoidable rewrite in the dispatcher tests. The `gameEngine.test.js` tests that *inject their own* `onResolve` (238, 263, 274, 286, 294) **stay byte-identical** — the EXPAND step preserved the closure fallback specifically so these synthetic-closure tests keep passing. **Suite green.**
- **CONTRACT (PR S2, deferrable to end of Phase 1):** Once no production code emits `onResolve`, decide whether to *keep* the closure fallback permanently as a test-only / Arbiter escape hatch. **Recommendation: KEEP IT.** The `gameEngine.test.js` closure tests document the engine's escape-valve contract, and the Arbiter manual-resolution path (a future "the engine can't resolve this, hand to Arbiter" hook) benefits from a non-serializable one-shot resolver. Removing it buys nothing and rewrites 5 good tests. **Mark the closure path "test + Arbiter-escape only; production uses resolverKey" in a comment and move on.** This converts a churn liability into a documented feature.

**Contract 2 — P/T computation (ad-hoc modifier → layers engine).**
*This is the Layers subsystem's contract; subsystem 6 enforces its test safety.*

`creaturePower`/`creatureToughness` are the single accessor (gameState.js 134-149). The layers refactor replaces the inline `base + plus - minus + mod` with a call into a layers evaluator. The migration shape:

- **EXPAND (PR L0):** Build the layers engine (`layers.js`) as a **pure, standalone module** that takes `(state, permanent)` and returns `{power, toughness, ...characteristics}`. Land it with its own exhaustive test file. **It is not wired into `creaturePower` yet.** Zero churn — purely additive. **Suite green.**
- **EQUIVALENCE GATE (PR L1, the critical one):** Before swapping the accessor, add a **characterization test** (`layers.equivalence.test.js`) that asserts, for the *current* registry cards (Omnath at 0/1/5 green, a vanilla bear, a +1/+1-countered creature, a -1/-1 creature, a 0-toughness creature), the layers engine returns **exactly** what the old inline math returns. This test is written against the OLD accessor's outputs *captured as literals* (golden values). It's the contract that the swap preserves behavior.
- **MIGRATE (PR L2):** Rewrite `creaturePower`/`creatureToughness` to delegate to the layers engine. Because L1 proved equivalence on the exact registry cards, `cardEffects.test.js`'s 13 P/T assertions (Omnath = 1/1, 6/6; bear = 2/2; etc.) **stay byte-identical and pass unchanged.** The Omnath static modifier moves from `cardEffects.staticPTModifier` into a layer-7c (P/T-setting/modifying) entry inside the layers engine, but its *observable output is identical*, so no test that reads through the accessor changes. **Suite green.**

The principle: **a refactor that preserves observable output requires zero test rewrites for output-asserting tests.** Only tests asserting on *internal mechanism* (the literal `onResolve` function, the literal `staticPTModifier` export) churn — and those are exactly the 7 + (the few direct `staticPTModifier` import tests) we enumerate and rewrite deliberately.

### A.2 Classification: rewrite vs. byte-identical

**MUST be rewritten to the new contract (enumerate exhaustively — these are the only ones):**

1. `actionDispatcher.test.js:174` — `payload.onResolve toBeTypeOf "function"` → `payload.resolverKey toBe "spellEffect"` (+ assert `resolverArgs.effect`/`targets`). *One assertion.*
2. `cardEffects.test.js` — any test importing `staticPTModifier` *directly* and asserting its return shape (`{p,t}`) churns IF the layers refactor deletes that export. **Mitigation: keep `staticPTModifier` as a thin shim that calls the layers engine and returns the layer-7c delta**, so these tests stay green. If kept-as-shim, **zero rewrite**; if deleted, ~2 tests rewrite. *Recommend keep-as-shim.*
3. `cardEffects.test.js:59` — `staticPTModifier(state, bear) toBeNull()` for unregistered → with the shim, still returns null. **Byte-identical.**

**MUST stay byte-identical (the safety anchor — if any of these change, the refactor changed behavior and is wrong):**

- All of `manaEmptying.test.js` (mana timing is *behavior*, not mechanism — CR 500.4 timing must not move).
- All P/T *value* assertions in `cardEffects.test.js` (Omnath 1/1 → 6/6, etc.).
- The `gameEngine.test.js` closure-injection tests (238, 263, 274, 286, 294, 302) — preserved by keeping the `onResolve` fallback.
- All `passPriority` / step-walk / APNAP-flush tests in `gameEngine.test.js` (the engine's turn machine is untouched by these refactors).
- Every `playable.integration.test.js`, `integration.test.js`, `combatOrchestration.test.js`, `learn.test.js` end-to-end test — **these are the irreplaceable regression net.** They assert on *outcomes* ("game-over", "user-wins", "ai-wins", "draw", "no engine-stuck"), never on stack internals. A correct refactor leaves them all green. **If an integration test goes red during a refactor PR, STOP — you broke real behavior, not a contract.**

### A.3 The order of operations (the broken-intermediate-proof sequence)

```
Phase 1, strict order, each row keeps the FULL suite green:

S0  Resolver registry + dispatch, additive (onResolve fallback intact)   [GREEN]
S1  Dispatcher emits resolverKey for spells; rewrite 1 dispatcher test   [GREEN]
T0  Trigger-event detection scaffold (enqueueTrigger callers), additive  [GREEN]
T1  First real trigger (ETB) end-to-end via resolverKey                  [GREEN]
L0  Layers engine standalone module + its own tests, NOT wired           [GREEN]
L1  Equivalence/characterization gate (golden values)                    [GREEN]
L2  creaturePower/Toughness delegate to layers (staticPT shim kept)      [GREEN]
S2  (optional) document onResolve as escape-only; no deletion            [GREEN]
```

Rule enforced by CI on every PR: **`npm test` is the merge gate; a PR that leaves any learn test red does not merge, full stop.** No "fix it in the next PR." Each row above is independently shippable and revertable.

### A.4 Anti-flake hardening (do this in PR S0, before any churn)

Two latent flake sources will bite a serialization/round-trip effort if not killed first:

1. **`Date.now()`/`Math.random()` IDs in resolvers.** `actionDispatcher.defaultSpellResolver` line 329 mints `perm-${Date.now()}-${Math.random()...}`. This is non-deterministic and **breaks any serialize→restore equivalence test** (the restored perm gets a different id). **Fix: route ALL id minting through `gameState.nextId()`** (which is `_resetIdsForTests`-controllable). This is a prerequisite for Part B's round-trip test. *Small, do it first.*
2. **Wall-clock fields in the session** (`createdAt`, `endedAt`, `ts` in decisionLog, `new Date().toISOString()`). The round-trip equivalence test must **exclude these from comparison** (or inject a clock). Document the "volatile field set" once, in a shared test helper `stableSnapshot(session)` that strips `{createdAt, endedAt, ts}` and any `id` suffix entropy.

---

## PART B — Mandatory regression tests to ADD

These four are non-negotiable; they are the proof the refactor is correct and the guard rails for Phase 2/3. New file: `app/src/lib/learn/serialization.test.js` (+ the two engine-level ones below).

### B.1 Serialize → restore round-trip equivalence (the keystone test)

```js
// serialization.test.js
import { serializeSession, deserializeSession } from "./persistence.js"; // Phase-1 new module
// For a battery of game states (opening, mid-stack-with-spell, mid-combat,
// post-resolution, 4P with an eliminated seat):
it("round-trips a state with a spell on the stack to byte-identical behavior", () => {
  const before = <session with a resolverKey spell on the stack>;
  const json = serializeSession(before);
  expect(() => JSON.parse(json)).not.toThrow();          // (1) it serializes
  const after = deserializeSession(json);
  // (2) structural equality modulo volatile fields
  expect(stableSnapshot(after)).toEqual(stableSnapshot(before));
  // (3) BEHAVIORAL equivalence — the real test:
  const r1 = resolveTopOfStack(before);
  const r2 = resolveTopOfStack(after);
  expect(stableSnapshot(r1)).toEqual(stableSnapshot(r2)); // resolving yields the same state
});
```

**Why behavioral, not just structural:** a state can be structurally equal yet behaviorally divergent if a closure was silently dropped. Asserting that `resolveTopOfStack(restored)` produces the same outcome as `resolveTopOfStack(original)` is what actually proves the `resolverKey` migration removed the serialization blocker. **This test FAILS today (closures don't survive `JSON.stringify`) and PASSES after S1 — it is the executable definition of "Phase-1 serialization done."** Land it (skipped/`.fails`) in S0, un-skip in S1.

Coverage matrix (each a separate `it`): empty stack; spell-on-stack (`resolverKey:"spellEffect"`); triggered-ability-on-stack; mid-combat (`state.combat` populated); floating mana (`manaDoesNotEmpty` card present); Commander 4P; post-elimination (a removed seat). The 4P + elimination cases guard against `removePlayerFromGame` leaving a dangling reference that JSON would choke on.

### B.2 Resolver-key dispatch

```js
it("dispatches each registered resolverKey to its pure resolver", () => {
  for (const key of Object.keys(resolverRegistry)) {
    expect(typeof resolverRegistry[key]).toBe("function");
  }
});
it("logs stack-resolve-error for an UNKNOWN resolverKey (no throw, Arbiter escape)", () => {
  const s = <state with stack obj payload.resolverKey="does-not-exist">;
  const after = resolveTopOfStack(s);
  expect(after.stack).toHaveLength(0);
  expect(after.log.some(l => l.kind === "stack-resolve-error")).toBe(true);
});
it("falls back to onResolve closure when no resolverKey (escape-valve contract)", () => {
  // pins the kept fallback from §A.1 CONTRACT
});
```

This locks the Stack design's resolverKey contract and proves the **fail-safe degrades gracefully** (unknown key → logged, not crashed → Arbiter can pick it up).

### B.3 Layers idempotence + timestamp ordering

```js
// layers.test.js
it("is idempotent: evaluating layers twice yields the same characteristics (CR 613.1)", () => {
  const c1 = evaluateLayers(state, perm);
  const c2 = evaluateLayers(state, perm);
  expect(c2).toEqual(c1); // no accumulation across reads — the #1 layers bug
});
it("applies same-layer effects in timestamp order (CR 613.7)", () => {
  // two +X/+X effects with different timestamps onto one creature;
  // assert the result is order-independent for commutative effects,
  // and order-DEPENDENT correctly for a set-P/T-then-modify case (613.2/613.3).
});
it("recomputes from printed base each call, never from a mutated permanent (CR 613.1)", () => {
  // mutate nothing on the permanent; assert power is pure-function of (state, perm)
});
```

**Idempotence is the single most important layers invariant.** The classic layers bug is an effect that *accumulates* because it reads its own prior output. A pure `evaluateLayers(state, perm) -> characteristics` that always starts from the printed card (CR 613.1) and never writes back is the design that makes idempotence trivially true — and this test proves it stays true.

### B.4 Trigger ordering (APNAP + within-controller ordering)

The existing `gameEngine.test.js:352` proves active-first/FIFO at the *queue* level. Add the real-event versions:

```js
// triggers.test.js
it("orders triggers from one event APNAP across controllers (CR 603.3b)", () => {...});
it("a trigger that fires DURING resolution of another goes on the stack next priority (CR 603.3)", () => {
  // resolveTopOfStack must flushTriggers AFTER resolution, before re-granting priority
});
it("preserves controller-chosen FIFO order within a single controller's triggers", () => {...});
```

Cite **CR 603.3** ("its controller puts it on the stack … the next time a player would receive priority") and **CR 603.3b** (the two-part APNAP placement). These pin the ordering contract that `flushTriggers` approximates today and that the Phase-1 trigger system must honor exactly.

---

## PART C — Blunt scope-realism on "maximal fidelity"

### C.1 What fraction of XMage/Forge is actually reachable here?

**Honest number: ~75-85% of *gameplay situations the owner will actually hit*, and ~15-25% of *the card pool's distinct effect templates*, with a permanent long tail that Arbiter must cover.** These are different denominators and conflating them is the trap.

- **By game-situations** (the metric that matters for "play a game / goldfish / teach"): a well-built Phase-1+2 engine handles the *vast majority of turns* in a typical Commander game, because the modal distribution of what happens is dominated by: play land, tap for mana, cast a creature/removal/draw spell, attack, block, deal damage, ETB trigger, a +X/+X pump, a counter, a token. That's reachable. A goldfish or a vs-AI sandbox **feels complete** at this coverage because the rare cards either don't show up or fail gracefully.
- **By distinct card templates** (the metric XMage/Forge are measured by): MTG has ~28,000 unique cards and Forge/XMage encode *thousands* of distinct scripted abilities accumulated over **15+ years of volunteer-hours**. A solo-vibe-coded engine reaching even 20% of that template space is a multi-year effort. **Stating "maximal fidelity = template parity with Forge" as a goal is setting up to feel perpetually behind.** Reframe the goal as *situation coverage with a fail-safe*, not *template parity*.

### C.2 Where the true long tail lives (the stuff you will NOT finish, and that's correct)

The long tail is not "more cards." It's **categories of rules interaction that are individually rare but collectively infinite**, each requiring real engine machinery:

1. **Replacement effects done right** (CR 614/616) — "if it would die, exile instead", "enters with N counters", "double the tokens", *and their interaction order* (616 self-replacement, multiple applicable). Phase 2 lists replacement effects; a *general* replacement engine that handles ordering is genuinely hard.
2. **Layers edge cases** (CR 613) — copy effects (layer 1) + type-changing (layer 4) + P/T-setting vs CDA (613.2/613.3) interactions; "becomes a 0/0" + counters timing. The common lord/anthem case is easy; the Humility-plus-Opalescence class is a known engine-breaker.
3. **The stack-interaction long tail** — split second, "can't be countered", "as an additional cost", "you may", intervening-if triggers (CR 603.4), reflexive triggers, "the next time" delayed triggers (603.7).
4. **Targeting/legality at resolution** (CR 608.2b) — "if the target is illegal, the spell doesn't resolve"; partial fizzle; choosing new targets.
5. **Multiplayer politics & rare zone rules** — face-down permanents, phasing, "leaves the battlefield" last-known-information, commander zone-change replacement (903.9a).
6. **Mana edge cases** — cost reduction, "spend only this mana on X", conditional mana, snow mana, treasure/sacrifice-for-mana as a cost not an ability.

Each of these is a *system*, not a card. You can spend a PR on each and still not be "done" — because every set Wizards prints adds new long-tail members. **The long tail is unbounded by construction.** This is the core realism point.

### C.3 Why the Arbiter fail-safe must remain PERMANENTLY

Given C.2, the engine will *forever* encounter a card/interaction it can't resolve natively. There are exactly two ways to handle that: (a) crash/no-op silently — **violates CLAUDE.md §8.4/§8.10 and produces wrong teaching**, the worst possible outcome for The Academy; or (b) hand off to Arbiter for a verified-citation manual ruling. **(b) is the only acceptable design.** Therefore Arbiter is not a temporary scaffold to be removed when coverage is "high enough" — it is a **load-bearing architectural component for the life of the project.** The resolver registry's "unknown resolverKey → log stack-resolve-error → surface to Arbiter" path (test B.2) is the seam that makes the fail-safe a first-class citizen, not a panic handler. **Design recommendation: make "engine can't resolve → Arbiter" a tested, narrated, intentional UX (especially valuable in Beginner mode: "this card does something the simulator doesn't fully model; here's the judge's ruling"), never an error state.**

### C.4 Where to draw honest boundaries

- **Don't promise template parity.** Promise: *"every common interaction in a normal game, plus a verified judge ruling for the rest."*
- **Define a "supported card" contract** so coverage is *measurable*: a card is "engine-supported" iff its oracle parses to a known effect descriptor + resolverKey; otherwise it's "Arbiter-resolved." Expose this count. This turns the unbounded long tail into a *progress metric* ("847 of your deck's 99 cards are engine-native; 12 are Arbiter-resolved") instead of an open-ended feeling of incompleteness.
- **Cap Phase 2's general oracle interpreter ambition.** A "general oracle-text effect interpreter" that handles arbitrary templates is an NLP research problem. The *bounded pattern-matcher* in `spellEffects.js` (regex per template) is the honest model — grow the template list, don't pretend to parse arbitrary English. Each new template = a small PR + tests. The "general interpreter" should be scoped to "a larger library of recognized templates with graceful Arbiter fallback," explicitly NOT "parses any card."

---

## PART D — Recommended end-to-end PR ROADMAP

Sizes: **S** ≈ ½-1 day, **M** ≈ 1-3 days, **L** ≈ 3-6 days. Every PR keeps the full suite green (Part A discipline). Cross-subsystem contract dependencies flagged with → .

### Phase 1 — FOUNDATION (data-driven, serializable, real triggers, real layers)

| PR | Scope (one line) | Size |
|---|---|---|
| **P1.0** | Determinism prereq: route ALL id minting (incl. `defaultSpellResolver`) through `nextId`; add `stableSnapshot` test helper + volatile-field set | **S** |
| **P1.1 (S0)** | Resolver registry + `resolveTopOfStack` dispatch by `resolverKey`, additive with `onResolve` fallback; registry-dispatch tests (B.2) | **M** → *defines resolverKey contract consumed by Dispatcher, Triggers, Persistence* |
| **P1.2 (S1)** | Dispatcher emits `resolverKey:"spellEffect"`+`resolverArgs` for spells & `"defaultPermanent"` for permanents; rewrite 1 dispatcher test | **S** → *depends on P1.1 resolverKey contract* |
| **P1.3** | `persistence.js`: `serializeSession`/`deserializeSession` (JSON, rehydrates resolverArgs); land round-trip equivalence test (B.1) green | **M** → *depends on P1.2 (no closures in production stack objects)* |
| **P1.4 (T0)** | Trigger-event detection scaffold: `detectTriggers(prevState, event) -> triggers[]`; wire `enqueueTrigger` to zone-change/ETB events; ordering tests (B.4) | **M** → *triggers use resolverKey, not closures — depends on P1.1* |
| **P1.5 (T1)** | First real trigger end-to-end (ETB "gain N life" / "draw") via resolverKey through the queue → stack → resolution | **M** → *depends on P1.4* |
| **P1.6 (L0)** | `layers.js` standalone pure `evaluateLayers(state, perm) -> characteristics`; own test file incl. idempotence (B.3); NOT wired | **L** |
| **P1.7 (L1)** | Equivalence/characterization gate: golden-value test proving layers engine == current inline math for registry cards | **S** → *depends on L0* |
| **P1.8 (L2)** | `creaturePower`/`creatureToughness` delegate to layers; `staticPTModifier` kept as shim; Omnath moves to layer 7c (output identical) | **M** → *depends on L1; touches THE single P/T accessor — high blast radius, gated by L1* |

### Phase 2 — DEPTH (coverage on top of the infrastructure)

| PR | Scope (one line) | Size |
|---|---|---|
| **P2.1** | Granted keywords + anthems (lords) as layer-6/7c continuous effects; "+X/+X to creatures you control" | **M** → *depends on P1.8 layers* |
| **P2.2** | Pump "+X/+X until end of turn" as timestamped layer-7c effect + cleanup-step expiry (CR 514.2) | **M** → *depends on P1.8* |
| **P2.3** | Tokens (create N X/X token resolverKey) + counters effects (proliferate-lite) | **M** → *depends on P1.1, P1.8* |
| **P2.4** | Multi-clause + modal spells (effect descriptor becomes an ordered array of clauses) | **M** → *extends spellEffects descriptor; resolverArgs shape ↑* |
| **P2.5** | X-spells (X chosen at cast, threaded into resolverArgs) | **M** |
| **P2.6** | Activated abilities (ability schema + cost + resolverKey) — currently fully deferred in dispatcher | **L** → *new action kind; depends on P1.1* |
| **P2.7** | Replacement effects engine (CR 614) — bounded set first, ordering-aware | **L** |
| **P2.8** | Oracle-template library expansion + "supported vs Arbiter-resolved" coverage metric surfaced | **M** → *depends on Arbiter-escape seam from P1.1* |

### Phase 3 — PERSISTENCE (now trivially serializable)

| PR | Scope (one line) | Size |
|---|---|---|
| **P3.1** | Disk save/resume of in-progress session to `data/profiles/<id>/learn-sessions/` via `paths.js`/`profilePath()`; reuses `persistence.js` from P1.3 | **M** → *depends on P1.3 round-trip; uses profilePath (CLAUDE.md §9 profiles)* |
| **P3.2** | Completed-game records (final state + decisionLog) per profile | **S** → *depends on P3.1* |
| **P3.3** | Per-format "you keep missing X" insights aggregated from records (extends `gameInsights.js`) | **M** → *depends on P3.2* |

**Roadmap notes:** Phase 1 is front-loaded with the two equivalence gates (P1.7, B.1's behavioral round-trip) precisely because they are the cheap insurance that the high-blast-radius swaps (P1.2 dispatcher, P1.8 accessor) don't silently break behavior. Phase 3 is *small* — that's the payoff of doing serialization right in Phase 1; once `persistence.js` exists and round-trips, save/resume is plumbing.

---

## CROSS-SUBSYSTEM CONTRACTS (flagged for synthesis reconciliation)

1. **resolverKey contract (← Stack design):** subsystem 6's tests B.1/B.2 and PRs P1.2-P1.5 *assume* the Stack design defines `payload.resolverKey: string` + `payload.resolverArgs: serializable` + a module-scope resolver registry. **If the Stack design uses a different key name/shape, every B.2 test and P1.2-P1.5 churns.** Reconcile the exact field names before P1.1.
2. **`detectTriggers` signature (← Triggers design):** B.4 and P1.4 assume triggers are produced from a `(prevState, event)` diff or an event bus. The Triggers design owns this; subsystem 6 only pins *ordering* (CR 603.3b) and *resolverKey-not-closure*. Reconcile whether triggers carry `resolverKey` (they must, for serializability — flag any closure-carrying trigger payload as a Phase-1 violation).
3. **`evaluateLayers` signature (← Layers design):** B.3 and P1.6-P1.8 assume `evaluateLayers(state, permanent) -> {power, toughness, types, abilities, ...}` is pure and idempotent. The Layers design owns the layer breakdown; subsystem 6 pins idempotence + timestamp order (CR 613.1/613.7) + the equivalence-gate requirement. **The `staticPTModifier` shim decision (keep vs delete) must be agreed with the Layers + Effects designs** — I recommend KEEP to avoid 2 test rewrites.
4. **`persistence.js` ownership (← Persistence design / this design):** P1.3 lands `serializeSession`/`deserializeSession` in *Phase 1* (not Phase 3) as a pure guard, even though its first product consumer is P3.1. The Persistence subsystem must agree to this earlier landing, or the round-trip equivalence test (B.1) has nowhere to import from. **Flag: B.1 is the executable definition of "serialization done" and must land in Phase 1.**
5. **Volatile-field set (this design, shared):** every subsystem's equivalence/round-trip test depends on a single agreed `stableSnapshot` helper stripping `{createdAt, endedAt, ts, id-entropy}`. Centralize it (PR P1.0) so subsystems don't each invent a divergent one.

---

## RISKS

- **R1 — The accessor swap (P1.8) is the highest-blast-radius change in the whole plan.** `creaturePower`/`creatureToughness` feed combat, SBAs (`destroyLethalCreatures`), legality, and UI. A subtle layers bug shows up as wrong combat math across dozens of integration tests at once. *Mitigation:* the L1 equivalence gate is mandatory and must pass before L2 merges; treat any integration-test red in L2 as "behavior changed," not "test stale."
- **R2 — Keeping the `onResolve` fallback forever could let new production code sneak closures back in,** silently re-breaking serializability with no test catching it (because the fallback path is green). *Mitigation:* add a lint-style test that scans freshly-built stack objects in the dispatcher/trigger paths and **asserts production code never sets `payload.onResolve`** (only `resolverKey`). The fallback stays for tests/Arbiter; production is policed.
- **R3 — Idempotence regressions in layers are invisible until a specific card combo appears.** A passing suite doesn't prove idempotence holds for *unwritten* layer effects. *Mitigation:* make idempotence a *property test* run over every registry effect automatically (loop the registry, assert double-eval == single-eval), so adding a Phase-2 effect that violates it fails immediately.
- **R4 — Determinism debt (R1 of facts: `Date.now()`/`Math.random()` ids) will produce flaky round-trip tests if P1.0 is skipped or incomplete.** *Mitigation:* P1.0 is a hard prerequisite; grep-gate that no `Date.now()`/`Math.random()` survives in `learn/*.js` resolver/permanent-creation paths.
- **R5 — "Maximal fidelity" framing risk (organizational, not technical):** measuring against Forge template parity guarantees perpetual perceived failure and could drive over-investment in the long tail at the cost of the playable core. *Mitigation:* adopt the "supported vs Arbiter-resolved" coverage metric (P2.8) as the *official* progress measure; never frame Arbiter handoff as a gap to be eliminated.
- **R6 — Phase-1 has no production consumer for serialization until Phase 3,** so the serializability invariant can rot between phases if only guarded by tests that future PRs might `.skip`. *Mitigation:* B.1 (behavioral round-trip) + R2's no-closure lint are CI-gating from P1.3 onward; they are the forcing function in lieu of a product consumer.
- **R7 — The trigger system is greenfield, not a refactor — estimates (P1.4/P1.5 = M each) are softer than the refactor PRs** because there's no existing behavior to characterize against. *Mitigation:* scope T1 to a single, fully-specified trigger (ETB life-gain) with exhaustive ordering tests before generalizing; resist building the general trigger framework in one PR.
- **R8 — `removePlayerFromGame` (4P elimination) produces states that must still serialize cleanly** (dangling combat/stack refs are already stripped, but a future resolverArgs holding a player-id of a removed seat could break restore). *Mitigation:* B.1's "post-elimination" matrix case is mandatory, not optional.

---

### Files I read (all absolute):
`C:\Users\colto\Documents\Claude\Projects\MTG-TOOL\app\src\lib\learn\actionDispatcher.js`, `gameEngine.js`, `gameState.js`, `spellEffects.js`, `cardEffects.js`, `learnSession.js`, `legalChoices.js` (relevant section), plus tests `gameEngine.test.js`, `actionDispatcher.test.js`, `cardEffects.test.js`, `manaEmptying.test.js`, `playable.integration.test.js`, `integration.test.js`, `spellWiring.test.js`, `combatOrchestration.test.js`; API: `app\src\app\api\learn\learn.test.js`, `start\route.js`, `step\route.js`; store: `app\src\lib\server\learnSessionStore.js`; CR codex `knowledge\mtg-judge\data\cr\cr_current.json` (verified rules: 613.1, 613.2, 613.3, 613.7, 613.7a, 603.2a, 603.3, 603.3b, 603.3d, 608.2, 608.2c, 500.4, 405.6, 117.5 — all present and quoted accurately; **112.7 and 712.999 were NOT found and are not cited**).
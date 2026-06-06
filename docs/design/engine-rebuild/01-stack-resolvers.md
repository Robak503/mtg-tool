# SUBSYSTEM DESIGN 1: Stack & resolvers

legalChoices only reads `state.stack.length` (length-gated sorcery-speed) — no structural dependency on payload shape. tableSnapshot doesn't touch the stack. I now have everything I need. Let me write the design.

I have read all the load-bearing code. Here is the blueprint.

---

# DESIGN — Subsystem (1): Serializable, Data-Driven Stack + Resolver Registry

**Phase-1 PR-1 — "the unblock"**

This is the keystone. Today, casting a spell stores a **live closure** at `state.stack[i].payload.onResolve` (built in `actionDispatcher.applyCastSpell` lines 230–232 and `defaultSpellResolver` lines 306–354), and `gameEngine.resolveTopOfStack` (line 329–331) *calls that closure*. `flushTriggers` (gameEngine line 400–408) also copies `trigger.payload` (which may hold a closure) onto stack objects. A closure cannot be `JSON.stringify`'d, so **mid-game save/resume is impossible** and the trigger system is coupled to the same unserializable contract. This design removes every closure from `state` and replaces it with **plain-data payloads + a module-level resolver registry**.

---

## 1. The Resolver-Key Contract (THE shared contract)

This is the single most important deliverable: the enum of resolver keys and each key's serializable param shape. **Agent 2 (triggers) and Agent 4 (effect interpreter) MUST emit payloads conforming to this contract** — flagged explicitly in §11 (Cross-subsystem dependencies).

### 1.1 Stack object shape (revised)

Current `createStackObject` (gameState.js:156) returns:

```js
{ id, kind, source, controller, targets, cost, payload }
```

The shape is **unchanged structurally** — only the *contents* of `payload` change. `payload` becomes strictly JSON-serializable:

```ts
// payload is ALWAYS plain data — no functions, ever.
type StackPayload = {
  resolver: ResolverKey;      // REQUIRED string key into the RESOLVERS map
  params: ResolverParams;     // serializable, shape determined by `resolver`
};
```

`source` requires one clarification (see §6 Risks): today `source` is sometimes a **full card object** (`applyCastSpell` passes `card`) and sometimes `{ name }` (tests) or a permanent id (triggers, per the gameState comment line 162). For serializability we keep `source` as-is (card objects are already plain data — `{id,name,type,mana,oracle}`), but resolvers MUST read what they need from `payload.params`, **never** re-derive behavior by re-parsing `source`. `source` stays for display/snapshot only.

### 1.2 ResolverKey enum (v1 — extensible)

```js
// resolvers.js — exported, frozen, the canonical contract
export const RESOLVER_KEYS = Object.freeze({
  SPELL_EFFECT:    "spell.effect",     // parsed instant/sorcery effect (Agent 4 extends params here)
  PERMANENT_ETB:   "spell.permanent",  // a permanent spell entering the battlefield
  SPELL_NOOP:      "spell.noop",       // unrecognized instant/sorcery — log + pop
  TRIGGER_EFFECT:  "trigger.effect",   // a triggered ability's effect (Agent 2 emits this)
  ACTIVATED_EFFECT:"activated.effect", // an activated ability's effect (Phase 2)
  MANUAL:          "manual",           // Arbiter escape valve — surfaces an "unresolved" log
});
```

Three v1 keys are wired by THIS PR (`SPELL_EFFECT`, `PERMANENT_ETB`, `SPELL_NOOP`). The other three are **registered as stubs** (resolve as a log no-op) so Agents 2/4 have named, contract-stable slots to fill without re-touching the dispatcher or engine. `MANUAL` is the renamed escape valve for the current "no onResolve → log + Arbiter prompt" branch (gameEngine.js:339–349).

### 1.3 Per-key param shapes (the contract Agents 2 & 4 consume)

```ts
// resolver: "spell.effect"
// Emitted by actionDispatcher (PR-1) and the effect interpreter (Agent 4, Phase 2).
type SpellEffectParams = {
  effect: SpellEffect;        // the SAME descriptor parseSpellEffect returns today
  controller: PlayerId;       // "user" | "ai" | "ai1".. — already validated upstream
  targets: TargetRef[];       // [{ type:"creature"|"player", id, controller?, name }]
  cardId: string;             // the spell card's id (for logging / future "this card")
};

// resolver: "spell.permanent"
type PermanentEtbParams = {
  card: Card;                 // {id,name,type,mana,oracle,power?,toughness?} — plain data
  controller: PlayerId;
  // enteredOnTurn is stamped at resolution time from state.turn (NOT frozen here)
};

// resolver: "spell.noop"
type SpellNoopParams = {
  cardName: string;
  reason: string;             // e.g. "instant-or-sorcery (no recognized effect)"
};

// resolver: "trigger.effect"  (Agent 2 OWNS the param shape under this key)
type TriggerEffectParams = {
  effect: SpellEffect | TriggerEffect; // reuses the SpellEffect union where it can
  controller: PlayerId;
  targets: TargetRef[];
  sourceId?: string;          // permanent id that generated the trigger (CR 113.7)
};

// resolver: "activated.effect"  (Phase 2)
type ActivatedEffectParams = { effect, controller, targets, sourceId };

// resolver: "manual"
type ManualParams = {
  cardName: string;
  description?: string;       // human prompt for the Arbiter escape valve
};
```

`SpellEffect` is the existing descriptor from `spellEffects.parseSpellEffect` (verified shapes): `{kind:"damage", amount, targetType}`, `{kind:"destroy", targetType:"creature"}`, `{kind:"draw", amount, targetType:null}`. **This design does not change `SpellEffect`** — Agent 4 extends it. `TargetRef` is the existing `enumerateTargets` output. Both are already plain data ✓.

---

## 2. The RESOLVERS registry

New module **`app/src/lib/learn/resolvers.js`** (leaf-ish: imports from `gameState`, `spellEffects`, `cardEffects`; imports **nothing** from `gameEngine` or `actionDispatcher` — avoids a cycle, since `gameEngine` will import `resolvers`).

```js
// resolvers.js
import { logEvent, createPermanent } from "./gameState.js";
import { resolveSpellEffect } from "./spellEffects.js";

/**
 * Each resolver: (state, stackObject) => newState.  PURE. Reads only
 * stackObject.payload.params + state. Never closes over cast-time data.
 */
export const RESOLVERS = Object.freeze({
  [RESOLVER_KEYS.SPELL_EFFECT]: (state, obj) => {
    const { effect, controller, targets } = obj.payload.params;
    return resolveSpellEffect(state, { effect, controller, targets });
  },

  [RESOLVER_KEYS.PERMANENT_ETB]: (state, obj) => {
    const { card, controller } = obj.payload.params;
    return enterPermanent(state, card, controller); // see §2.1
  },

  [RESOLVER_KEYS.SPELL_NOOP]: (state, obj) => {
    const { cardName, reason } = obj.payload.params;
    return logEvent(state, { kind: "spell-no-op-resolve", cardName, reason });
  },

  [RESOLVER_KEYS.TRIGGER_EFFECT]: (state, obj) => {     // STUB in PR-1
    const { effect, controller, targets = [] } = obj.payload.params || {};
    if (!effect) return logEvent(state, { kind: "stack-resolve", objectId: obj.id, kindOfObject: obj.kind });
    return resolveSpellEffect(state, { effect, controller, targets });
  },

  [RESOLVER_KEYS.ACTIVATED_EFFECT]: (state, obj) =>     // STUB in PR-1
    logEvent(state, { kind: "stack-resolve", objectId: obj.id, kindOfObject: obj.kind }),

  [RESOLVER_KEYS.MANUAL]: (state, obj) =>
    logEvent(state, {
      kind: "stack-resolve",
      objectId: obj.id,
      kindOfObject: obj.kind,
      source: obj.source?.name || obj.source,
      manual: true,
    }),
});

/** Look up a resolver, or null. */
export function getResolver(key) {
  return (key && RESOLVERS[key]) || null;
}
```

### 2.1 `enterPermanent` — extracted from `defaultSpellResolver`'s closure

The current `defaultSpellResolver` (actionDispatcher.js:321–353) builds a permanent **with a non-deterministic id** (`perm-${Date.now()}-${Math.random()...}`, line 329) and **bypasses `createPermanent`/`moveCardToZone`**. This design replaces that inline closure with a pure named function that uses the **deterministic id generator** (§4) and the canonical `createPermanent` factory:

```js
// resolvers.js
function enterPermanent(state, card, controller) {
  const player = state.players[controller];
  if (!player) return state;
  const typeStr = String(card?.type || card?.type_line || "");
  // createPermanent already sets counters/attachments/etc.; we override
  // summoningSick from type and stamp enteredOnTurn.
  let perm = createPermanent({ card, controller, summoningSick: /Creature/.test(typeStr) });
  perm = { ...perm, enteredOnTurn: state.turn };
  const next = {
    ...state,
    players: {
      ...state.players,
      [controller]: { ...player, battlefield: [...player.battlefield, perm] },
    },
  };
  return logEvent(next, { kind: "permanent-enters", cardName: card.name, controller });
}
```

**Behavior parity note:** today's `defaultSpellResolver` produces a permanent **missing** `damageMarked` and `enteredOnTurn`-stamped-as `state.turn`; `createPermanent` supplies `damageMarked: 0` and a structured `id`. This is a *strict improvement* (the old object was subtly malformed) and the spellWiring/actionDispatcher resolve tests only assert `card.name`, `summoningSick`, and the `permanent-enters` log — all preserved. Flagged in §6 Risks R3.

---

## 3. `resolveTopOfStack` — closure call → registry lookup

`gameEngine.resolveTopOfStack` (current lines 322–358) changes its dispatch core only:

```js
import { getResolver, RESOLVER_KEYS } from "./resolvers.js";

export function resolveTopOfStack(state) {
  if (state.stack.length === 0) throw new Error("Stack is empty — nothing to resolve");
  const top = state.stack[state.stack.length - 1];
  const remainingStack = state.stack.slice(0, -1);
  let next = { ...state, stack: remainingStack };

  const resolver = getResolver(top.payload?.resolver);
  if (resolver) {
    try {
      next = resolver(next, top) || next;
    } catch (error) {
      next = logEvent(next, { kind: "stack-resolve-error", objectId: top.id, error: String(error?.message || error) });
    }
  } else {
    // No/unknown resolver key → MANUAL fallback (Arbiter escape valve).
    next = RESOLVERS[RESOLVER_KEYS.MANUAL](next, top);
  }

  next = flushTriggers(next);
  if (grantsPriority(next.step)) next = resetPriorityLoop(next);
  return next;
}
```

The error-catch, flushTriggers, and priority-reset semantics (lines 332–357) are **byte-identical** in effect. The `stack-resolve-error` and `stack-resolve` log kinds are **preserved** so the existing gameEngine tests (lines 286–315) keep passing — see §8 migration.

---

## 4. Deterministic ID generation (`state.idSeq`)

### 4.1 The problem

Three non-deterministic id sites exist:
- `gameState.nextId` (line 35–41): uses a **module-level** `_idCounter` + `crypto.randomUUID()`/`Date.now()`. The counter is module-global (shared across all sessions in a process), and the UUID/timestamp segment is **non-reproducible**. This breaks serialize→restore→continue (restored game would mint ids from a different counter origin and random segment).
- `actionDispatcher.defaultSpellResolver` (line 329): `perm-${Date.now()}-${Math.random()...}` — eliminated by §2.1.
- `learnSession.generateSessionId` (line 47–52): session id only, **out of scope** (not part of game state replay; keep as-is).

### 4.2 The fix: a counter carried in state

Introduce `state.idSeq` (integer, starts at 0). Every id mint reads-and-increments it **through state**, so id generation is a pure function of state and fully reproducible on restore.

**New gameState helper:**

```js
// gameState.js — replaces module-global nextId for state-scoped ids
/**
 * Mint the next stable id of a given kind, threaded through state.idSeq.
 * Returns { id, state } — caller MUST use the returned state so the
 * counter advances. Deterministic: same state in → same id out.
 */
export function mintId(state, prefix) {
  const seq = (state.idSeq || 0) + 1;
  return { id: `${prefix}-${seq}`, state: { ...state, idSeq: seq } };
}
```

ID format becomes `perm-1`, `stk-2`, etc. — short, stable, human-debuggable, and collision-free within a game (monotonic).

### 4.3 The `createStackObject`/`createPermanent` refactor

These two factories currently call the module-global `nextId` *inside* the factory (they don't receive state). Two options; this design picks **Option B** for minimal churn:

- **Option A (rejected):** make every factory take/return state. Too invasive — `createStackObject` is called in `actionDispatcher` and `flushTriggers`; `createPermanent` is called in `moveCardToZone` (gameState.js:423) and `untap`/blink paths. Threading state through all of them in PR-1 risks the suite.

- **Option B (chosen):** keep the factories signature-compatible, but **let the caller supply the id**. Add an optional `id` field to both factories; when present, use it; when absent, fall back to the *legacy* module-global `nextId` (so any caller not yet migrated still works). The **id-minting callers we control in PR-1** (`applyCastSpell`, `flushTriggers`, `enterPermanent`, `moveCardToZone`-to-battlefield) mint via `mintId(state, …)` and pass the id in.

```js
// gameState.js
export function createStackObject({ id, kind, source, controller, targets = [], cost = null, payload = {} }) {
  /* validation unchanged */
  return { id: id || nextId("stk"), kind, source, controller, targets: [...targets], cost, payload };
}
export function createPermanent({ id, card, controller, tapped = false, summoningSick = true }) {
  /* validation unchanged */
  return { id: id || nextId("perm"), card, /* …rest unchanged… */ };
}
```

`moveCardToZone` (line 423) becomes state-threaded for the battlefield case so it can mint a deterministic permanent id. Since it already returns a new state, the change is internal:

```js
// inside moveCardToZone, the becomePermanent branch:
const { id: permId, state: s2 } = mintId(state, "perm");
nextDest = [...player[toZone], createPermanent({ id: permId, card, controller: playerId })];
// then build the result from s2 instead of state
```

### 4.4 `createGameState` seeds `idSeq: 0`

Add `idSeq: 0` to the returned object (gameState.js:225–240). `_resetIdsForTests` (line 47) is **retained** (it still zeroes the legacy module counter for any un-migrated factory call and keeps the ~22 test files that call it green), but the authoritative counter is now `state.idSeq`.

---

## 5. The cast path rewrite (`actionDispatcher.applyCastSpell`)

Current lines 228–244 build `onResolve` (a closure) and stuff it in `payload`. Rewrite to emit a **plain-data payload** + a deterministic stack id:

```js
// actionDispatcher.js — applyCastSpell, after pool/hand bookkeeping
const effect = action.effect || parseSpellEffect(card);
const targets = action.targets || [];

let payload;
if (effect) {
  payload = {
    resolver: RESOLVER_KEYS.SPELL_EFFECT,
    params: { effect, controller: action.playerId, targets, cardId: card.id },
  };
} else if (isPermanentSpell(card)) {            // helper extracted from defaultSpellResolver
  payload = {
    resolver: RESOLVER_KEYS.PERMANENT_ETB,
    params: { card, controller: action.playerId },
  };
} else {
  payload = {
    resolver: RESOLVER_KEYS.SPELL_NOOP,
    params: { cardName: card.name, reason: "instant-or-sorcery (no recognized effect)" },
  };
}

const { id: stkId, state: s2 } = mintId(working, "stk");
const stackObject = createStackObject({
  id: stkId, kind: "spell", source: card, controller: action.playerId,
  targets, cost: action.cost, payload,
});
// build `next` from s2 (so idSeq advance persists) instead of `working`
```

`isPermanentSpell(card)` is the type-line predicate currently inlined in `defaultSpellResolver` (lines 307–312), promoted to a named module-level helper. `defaultSpellResolver` itself is **deleted** (its two behaviors are now the `PERMANENT_ETB` and `SPELL_NOOP` resolvers). `hasVigilance` (line 356) is untouched (combat path, unrelated).

**Critical:** `mintId(working, …)` must thread through `working` (which already has the taps/pool mutations applied) and the final `next` must spread `s2`'s `idSeq`. Flagged as the one wiring subtlety.

---

## 6. `flushTriggers` payload pass-through

`flushTriggers` (gameEngine.js:389–415) copies `trigger.payload || {}` onto stack objects. In PR-1, trigger payloads are **already plain data** in every current usage (the trigger-queue tests at gameEngine.test.js:341–386 use `payload: { description: "gain 1" }` — no closures). So flushTriggers needs only **deterministic ids** for the stack objects it mints:

```js
// flushTriggers — replace the `.map(trigger => ({ id: trigger.id, … }))`
// with a fold that threads idSeq when a trigger has no pre-set id:
let s = state;
const newStackObjects = ordered.map(trigger => {
  let id = trigger.id;
  if (!id) { const m = mintId(s, "stk"); id = m.id; s = m.state; }
  return { id, kind: "triggered-ability", source: trigger.source, controller: trigger.controller,
           targets: trigger.targets || [], cost: null, payload: trigger.payload || {} };
});
return { ...s, stack: [...s.stack, ...newStackObjects], pendingTriggers: [] };
```

The flushTriggers tests pass explicit `id`s (`"ai-trig"`, `"user-trig-1"`) so they're unaffected. **Agent 2 owns** the real trigger-payload shape under `RESOLVER_KEYS.TRIGGER_EFFECT` — PR-1 only guarantees the plumbing carries whatever plain-data payload it's handed.

---

## 7. Serialization round-trip (the payoff, proven in PR-1)

Because `state` now contains only plain data (no closures anywhere), add a tiny verification surface so Phase-3 persistence is a drop-in:

```js
// new: app/src/lib/learn/serialization.js
export function serializeState(state) { return JSON.stringify(state); }
export function deserializeState(json) { return JSON.parse(json); }
```

No custom revivers needed — that's the whole point. PR-1 ships a test that casts a spell, **serializes mid-stack**, deserializes, calls `resolveTopOfStack`, and asserts the same result as the un-serialized path. This is the regression guard that keeps every future Agent honest: *if anyone reintroduces a closure into a payload, this test breaks.*

---

## 8. File-by-file change list

| File | Change |
|---|---|
| **`resolvers.js`** *(NEW)* | `RESOLVER_KEYS` frozen enum, `RESOLVERS` map, `getResolver`, `enterPermanent`, `isPermanentSpell`. The contract module. |
| **`serialization.js`** *(NEW)* | `serializeState`/`deserializeState` (trivial JSON pass-through; existence is the contract assertion). |
| **`gameState.js`** | Add `mintId(state, prefix)`. Add optional `id` param to `createStackObject` + `createPermanent`. Seed `idSeq: 0` in `createGameState`. Thread `idSeq` through `moveCardToZone`'s becomePermanent branch. Keep `nextId`/`_resetIdsForTests` as legacy fallback. |
| **`gameEngine.js`** | `resolveTopOfStack`: closure-call → `getResolver` lookup (§3). `flushTriggers`: deterministic id minting (§6). Import `getResolver, RESOLVER_KEYS, RESOLVERS` from `resolvers.js`. |
| **`actionDispatcher.js`** | `applyCastSpell`: build plain-data `payload` + `mintId` stack id (§5). **Delete** `defaultSpellResolver`. Import `RESOLVER_KEYS, isPermanentSpell` from `resolvers.js`, `mintId` from `gameState.js`. |
| **`spellEffects.js`** | **No change.** `resolveSpellEffect` already has the exact `(state, {effect, controller, targets})` signature the `SPELL_EFFECT` resolver calls. Confirmed it closes over nothing — it's already pure. |
| **`cardEffects.js`, `manaModel.js`, `combatResolution.js`, `keywords.js`, `legalChoices.js`, `learnSession.js`** | **No change.** legalChoices reads only `state.stack.length`; learnSession never touches payloads; the rest are stack-agnostic. |

---

## 9. TDD sub-PR breakdown (each independently shippable, suite stays green)

This subsystem is **PR-1** overall, decomposed into **four micro-commits**, each green:

**PR-1a — Deterministic IDs (no behavior change).**
Add `mintId` + `idSeq: 0` + optional `id` params to factories + thread `moveCardToZone`. All existing ids still mint via legacy `nextId` fallback where callers aren't migrated yet, so **zero tests shift**. New tests: `mintId` returns `{id, state}`, increments `idSeq`, is deterministic, `createGameState` seeds `idSeq:0`. *Green: nothing else touched.*

**PR-1b — Registry module + resolvers (additive).**
Ship `resolvers.js` with all six keys and `enterPermanent`/`isPermanentSpell`. **Nothing calls it yet.** Pure unit tests: each resolver resolves its param shape correctly (`SPELL_EFFECT` delegates to a stub-verifiable `resolveSpellEffect`, `PERMANENT_ETB` puts a permanent on the battlefield with a deterministic id, `SPELL_NOOP` logs). *Green: additive module.*

**PR-1c — Engine dispatch swap.**
`resolveTopOfStack` → registry lookup; `flushTriggers` → deterministic ids. The three gameEngine `resolveTopOfStack` tests (lines 263–315) **migrate** (see §10). *Green after test migration in the same commit.*

**PR-1d — Cast-path swap + closure deletion + serialization guard.**
`applyCastSpell` emits plain-data payload; delete `defaultSpellResolver`; add `serialization.js` + the round-trip test. The actionDispatcher (line 174) and spellWiring tests migrate (see §10). *Green: the closure is gone, round-trip passes.*

Ordering rationale: 1a is invisible; 1b is dead code until 1c; 1c+1d flip the two call-sites with their tests in-commit, so the suite is never red between commits. No broken-intermediate state.

---

## 10. Test plan

### Tests that MUST migrate (they assert on `onResolve` as a function or pass a closure payload)

| Test | Line | Today | After |
|---|---|---|---|
| `actionDispatcher.test.js` "moves card from hand to stack…" | 174 | `expect(after.stack[0].payload.onResolve).toBeTypeOf("function")` | `expect(after.stack[0].payload.resolver).toBe("spell.permanent")` (Grizzly Bears is a creature → `PERMANENT_ETB`) and `expect(after.stack[0].payload.params.card.name).toBe("Grizzly Bears")` |
| `actionDispatcher.test.js` "creature resolves onto battlefield" | 181–203 | unchanged assertions (name/summoningSick/permanent-enters log) | **unchanged** — `PERMANENT_ETB` produces identical observable result |
| `actionDispatcher.test.js` "instant resolves as no-op + log" | 205–223 | asserts `spell-no-op-resolve` log | **unchanged** — `SPELL_NOOP` emits the same log kind |
| `gameEngine.test.js` "calls payload.onResolve when present" | 263–284 | builds `createStackObject({payload:{onResolve:(s)=>…}})` | rewrite to `payload:{resolver:"spell.noop", params:{cardName:"Counterspell", reason:"test"}}` and assert stack emptied + log; OR keep a **back-compat shim** (see below) |
| `gameEngine.test.js` "logs and continues if onResolve throws" | 286–300 | closure that throws | register a **test-only throwing resolver** via a `__TEST_RESOLVER` key, OR assert via a real resolver fed a malformed param that throws inside `resolveSpellEffect`. Prefer: add `RESOLVER_KEYS` entry isn't needed — instead the test stuffs `payload:{resolver:"manual"}` and… *can't throw*. **Resolution:** expose a test seam — `RESOLVERS` is frozen, so add an exported `__setTestResolver(key, fn)` guarded `if (process.env.NODE_ENV === 'test')`, or simpler: keep the `stack-resolve-error` branch coverage by having the throwing case use a resolver key mapped to a fn that throws, registered only in the test via a documented test hook. **Chosen:** the throw-path test migrates to assert the `else`/error branch by passing a payload whose `params` make `resolveSpellEffect` throw is not guaranteed; so PR-1c adds a minimal exported `registerResolver(key, fn)` (used by Agents 2/4 anyway to extend the registry) and the test registers a throwing key. This *also* serves the extensibility mandate. |
| `gameEngine.test.js` "no-op + log without onResolve" | 302–315 | `createStackObject` with no payload | **unchanged** — no `payload.resolver` → `MANUAL` → logs `stack-resolve`. ✓ |
| `gameEngine.test.js` "both pass → resolve top" | 230–254 | closure sets `resolved=true` | migrate to a `registerResolver("__test.flag", fn)` or assert via the `permanent-enters`/`spell-no-op-resolve` observable instead of a captured boolean. |
| `spellWiring.test.js` (lines 49–66) | — | dispatches a real BOLT/DOOM and calls `resolveTopOfStack` | **unchanged** — these go through the real `SPELL_EFFECT` resolver and assert graveyard/life, which are identical. ✓ Strong proof the migration is behavior-preserving. |

**Design decision surfaced by the test audit:** the registry needs a public **`registerResolver(key, fn)`** (and `RESOLVERS` stays frozen for the built-ins, with registrations kept in a separate mutable extension map consulted by `getResolver` after the frozen map). This is needed *anyway* for Agents 2 & 4 to add resolvers without editing `resolvers.js` core, and it cleanly lets the two throw/flag gameEngine tests register ephemeral test resolvers. I'm folding it into PR-1b.

```js
const EXTENSIONS = new Map();
export function registerResolver(key, fn) { EXTENSIONS.set(key, fn); }
export function getResolver(key) { return RESOLVERS[key] || EXTENSIONS.get(key) || null; }
export function _clearExtensionsForTests() { EXTENSIONS.clear(); }
```

### New tests (added by this subsystem)

- `resolvers.test.js`: each built-in resolver's param→result; `getResolver` precedence (built-in > extension > null); `registerResolver` + `_clearExtensionsForTests`; `enterPermanent` stamps `enteredOnTurn` and deterministic id; `isPermanentSpell` truth table.
- `gameState.test.js` additions: `mintId` determinism/increment; `createGameState` seeds `idSeq:0`; factory accepts explicit `id`.
- `serialization.test.js` (the keystone guard): cast a creature spell, `serializeState` mid-stack, `JSON.parse(JSON.stringify(state))` deep-equals `serializeState→deserializeState`, then `resolveTopOfStack(deserialized)` equals `resolveTopOfStack(original)` (battlefield + log parity). A second case asserts **no value in the serialized JSON is a function** (walk the parsed object — `typeof !== "function"` everywhere) so a future closure regression fails loudly.
- `playable.integration.test.js` / `integration.test.js`: **should pass unchanged** — they drive full games through `advanceUntilDecision`, which exercises the real resolvers. Their continued green is the end-to-end proof.

### Tests confirmed NOT to shift
`combatResolution.test.js`, `manaModel.test.js`, `manaWiring.test.js`, `keywords.test.js`, `legalChoices.test.js` (reads `stack.length` only), `learnSession.*.test.js`, `termination.test.js`, `decisionGate.test.js`, `trapDetector.test.js`, `tableSnapshot.test.js`, `boardContext.test.js`, `cardEffects.test.js` — none touch `payload.onResolve` or id internals.

---

## 11. Cross-subsystem dependencies & contracts (for synthesis reconciliation)

1. **→ Agent 2 (Triggers):** MUST emit `pendingTriggers`/stack payloads as `{resolver: RESOLVER_KEYS.TRIGGER_EFFECT, params: {effect, controller, targets, sourceId}}` — plain data only. Agent 2 **owns** the `TriggerEffectParams` shape under that key; PR-1 ships a stub resolver and guarantees `flushTriggers` carries the payload verbatim with a deterministic id. Agent 2's "place triggers on stack" timing (CR 603.3, 603.3b APNAP) builds on the existing `flushTriggers` ordering, which this PR preserves.

2. **→ Agent 4 (Effect interpreter):** MUST emit `{resolver: RESOLVER_KEYS.SPELL_EFFECT, params: SpellEffectParams}` and may **extend the `SpellEffect` union** (`spellEffects.parseSpellEffect`). Agent 4 should call **`registerResolver`** for novel effect categories rather than editing `resolvers.js` core, OR extend `resolveSpellEffect`'s switch (both honored by the `SPELL_EFFECT` resolver). The `targets`/`TargetRef` contract (`enumerateTargets` output) is shared and unchanged.

3. **→ Phase-3 (Persistence):** depends on `serializeState`/`deserializeState` + `state.idSeq` being the **sole** id source. Any subsystem that mints ids MUST use `mintId(state, …)`, never module-global `nextId`/`Date.now()`/`Math.random()`. This is the contract that makes save/resume "trivially serializable" per the mandate.

4. **→ Agent 3 (Layers/613) & combat:** no direct coupling, but both read `creaturePower`/`creatureToughness(perm, state)` — unchanged. The resolver registry is orthogonal to the layers system.

5. **Shared invariant:** `payload` is plain JSON, **forever**. The `serialization.test.js` "no functions anywhere" walk enforces this across all agents' output.

---

## 12. RISKS

- **R1 — `registerResolver` mutable extension map breaks purity/determinism if abused.** A registration is process-global, not in `state`. Mitigation: built-ins live in the frozen `RESOLVERS`; extensions are for *static* registration at module load (Agents 2/4) and tests (cleared via `_clearExtensionsForTests` in `beforeEach`). Document: **never** register per-game or conditionally. Flag for eng review.

- **R2 — `idSeq` threading is easy to drop.** If a caller mints an id via `mintId` but builds its result from the pre-mint state, `idSeq` silently fails to advance → duplicate ids on the next mint. Mitigation: the `serialization.test.js` round-trip + an `integration.test.js` assertion that all permanent/stack ids in a finished game are unique. The `applyCastSpell` rewrite (§5) is the one tricky site — it threads `working → s2 → next`.

- **R3 — `enterPermanent` via `createPermanent` changes the permanent's shape vs. the old inline closure.** Old object lacked `damageMarked`; new one has it (and a structured id). This is a *fix*, but any test that snapshot-compared the whole permanent object would shift. Audit shows none do (they assert `card.name`/`summoningSick`/log). Confirmed safe; re-verify on green.

- **R4 — `source` as a full card object bloats serialized state.** Stack objects keep the whole card in `source`. For a desert-island save this is fine (small), but redundant with `params.card`/`params.cardId`. Deferred optimization: store `source` as `{id, name}` only and rehydrate from a card index. **Not** in PR-1 — would shift `after.stack[0].source.name` assertions; flagged for a later cleanup PR.

- **R5 — The two throw/flag gameEngine tests (lines 230–254, 286–300) currently rely on closure capture.** They MUST migrate to `registerResolver` test seams in the *same commit* (PR-1c) or the suite goes red. This is the only place where "test migrates with code" is load-bearing for staying green.

- **R6 — Process-global legacy `nextId` counter remains** as a fallback for un-migrated factory callers (e.g. any future call to `createPermanent` without an `id`). It coexists with `state.idSeq` until every mint site is migrated. Risk: a stray legacy-id permanent in a serialized game would mint a *different* id on restore. Mitigation: PR-1 migrates the only two battlefield-entry sites (`moveCardToZone`, `enterPermanent`); a follow-up Phase-1 PR can delete `nextId` entirely once trigger/activated paths (Agent 2) are state-threaded. Tracked as a contract for Agent 2.

---

### Files referenced (all absolute)
- `C:\Users\colto\Documents\Claude\Projects\MTG-TOOL\app\src\lib\learn\gameEngine.js` (resolveTopOfStack 322–358, flushTriggers 389–415)
- `C:\Users\colto\Documents\Claude\Projects\MTG-TOOL\app\src\lib\learn\actionDispatcher.js` (applyCastSpell 186–271, defaultSpellResolver 306–354)
- `C:\Users\colto\Documents\Claude\Projects\MTG-TOOL\app\src\lib\learn\spellEffects.js` (resolveSpellEffect 161–200 — already pure, no change)
- `C:\Users\colto\Documents\Claude\Projects\MTG-TOOL\app\src\lib\learn\gameState.js` (nextId 33–41, createStackObject 156–169, createPermanent 108–123, moveCardToZone 384–433, createGameState 205–241)
- `C:\Users\colto\Documents\Claude\Projects\MTG-TOOL\app\src\lib\learn\cardEffects.js`, `manaModel.js`, `keywords.js`, `combatResolution.js`, `learnSession.js`, `legalChoices.js` (no change; consumption verified)
- NEW: `resolvers.js`, `serialization.js`
- CR citations verified present in `knowledge\mtg-judge\data\cr\cr_current.json`: **601.2, 601.2i, 603.3, 603.3a, 603.3b, 405.1, 405.5, 117.1, 117.4, 608.1, 608.2, 608.2a, 608.2b, 608.2c, 608.3, 500.4, 113.7, 113.8, 602.2, 704.3, 704.5**. (Rules 112.7 and 116.4 do **not** exist in this codex — not cited.)
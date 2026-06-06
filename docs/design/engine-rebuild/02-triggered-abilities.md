# SUBSYSTEM DESIGN 2: Triggered abilities

I now have a complete understanding of the codebase. I have verified every CR citation against the real JSON. Here is the design.

---

# DESIGN: Triggered Abilities System (Subsystem 2)

## 0. Scope and the cross-subsystem contract

This subsystem builds the **detection → enqueue → stack-placement → resolution** pipeline for triggered abilities (CR 603). Today the queue plumbing (`enqueueTrigger`/`flushTriggers`/`state.pendingTriggers`) exists and is tested in isolation (`gameEngine.test.js` "trigger queue" block) **but is never populated** — no ETB / dies / attack / upkeep / end-step / draw trigger ever fires. This is the gap I close.

### 0.1 CRITICAL DEPENDENCY on Agent 1 (Stack / serializable resolvers)

The current resolution model is a **live closure**: stack objects and triggers carry `payload.onResolve(state, obj) => state`, called by `resolveTopOfStack` (`gameEngine.js:329`). That closure is the serialization blocker, and it is **shared by the trigger system** — `flushTriggers` copies `trigger.payload` (including any `onResolve`) verbatim onto the stack object (`gameEngine.js:400-408`).

**This design assumes Agent 1 replaces `payload.onResolve` (closure) with a data-driven `resolverKey` + `resolverArgs` contract**, where `resolveTopOfStack` dispatches `resolverKey` through a serializable registry. I will refer to this as **the resolver-key contract**. Concretely, I depend on Agent 1 delivering:

```
// stack object / trigger payload, post-Agent-1:
payload: {
  resolverKey: string,          // e.g. "etb.gainLife", "spell.effect"
  resolverArgs: object,         // JSON-only: { amount: 1, controller: "user", ... }
}
// and a registry + dispatcher:
resolveStackObject(state, stackObject) -> state     // looks up resolverKey, calls the registered fn
```

**Phasing accommodation:** the trigger work is split so that **Phase-1 trigger detection lands BEFORE Agent 1's resolver refactor is required to be complete**. During the overlap window, triggers carry `payload.onResolve` closures (matching the existing, already-tested contract at `gameEngine.js:329`), so the suite stays green with zero coupling to Agent 1's in-flight work. The moment Agent 1's registry lands, a single mechanical sub-PR (TR-7 below) swaps every trigger descriptor's closure for a `resolverKey`. **I flag this as the single reconciliation point the synthesis must order: TR-1..TR-6 must not assume `resolverKey`; TR-7 must run after Agent 1's registry exists.**

If Agent 1's registry lands first, TR-1..TR-6 emit `resolverKey` directly and TR-7 is deleted. Either ordering keeps the suite green — that is the whole point of the split.

### 0.2 Other cross-subsystem contracts I consume (not own)

| Contract | Owner | What I rely on |
|---|---|---|
| `creaturePower/creatureToughness(perm, state)` single accessor | gameState (existing) | trigger conditions that read P/T |
| `hasKeyword(card, kw)` oracle-aware, cached | keywords.js (existing) | distinguishing keyword abilities from triggers; never shadow it |
| `destroyLethalCreatures(state, deathtouched)` shared lethal SBA | gameState (existing) | the **dies hook** must observe deaths it produces |
| `moveCardToZone` | gameState (existing) | the **single ETB/LTB chokepoint** I instrument |
| continuous-effects / layers (CR 613) | Agent 3 | "intervening if" reads of granted abilities, and `[as] enters with counters` static-not-trigger distinction (CR 603.6d) |
| general oracle-effect interpreter | Phase 2 (Agent that owns spellEffects expansion) | the **trigger effect** beyond the small Phase-1 vocabulary |

---

## 1. Conceptual model: three ability classes (CR 113.3)

CR 113.3 names four ability categories; we model three relevant to permanents on the battlefield:

- **Static abilities** (CR 113.3d) — continuous; never use the stack. Already partly handled by `cardEffects.staticPTModifier` and (future) Agent 3's layers. *Out of scope for this subsystem* except that detection MUST NOT misclassify a static ability (e.g. `enters tapped`, `enters with N counters` — CR 603.6d) as a trigger.
- **Activated abilities** (CR 113.3b) — `[cost]: [effect]`. Player-initiated; go through `legalChoices`/`actionDispatcher`. *Out of scope here* (no ability schema yet; deferred per `legalChoices.js:18`).
- **Triggered abilities** (CR 113.3c, CR 603.1) — `[When/Whenever/At] [condition], [effect]`. **This subsystem.** They trigger automatically (CR 603.2), and the *source's controller at trigger time* (CR 603.3a) puts them on the stack the next time any player would receive priority (CR 113.3c, CR 603.3).

**Detection discriminator (the hard part):** an oracle line beginning with `When`/`Whenever`/`At` (at an ability-word position) is a triggered ability. We must exclude:
- Reminder/reflexive text inside parentheses.
- `As [this] enters` / `[this] enters with` / `[this] enters tapped` → **static** per CR 603.6d (not a trigger).
- Activated abilities whose effect text happens to contain "when" mid-sentence.

The detection regex anchors on line-start / ability-word position exactly like `keywords.js`'s `patternFor` (a proven pattern in this codebase), which is why I reuse that anchoring discipline.

---

## 2. New module: `triggers.js`

A new leaf module `app/src/lib/learn/triggers.js`. Like `keywords.js`/`cardEffects.js`, it **imports nothing from the engine** (no cycle): it consumes `gameState` reads only. The engine imports *it*.

### 2.1 Data shapes

#### `TriggerDescriptor` — the static, per-card detection output (serializable, no closures)

```
/**
 * A triggered ability detected on a card's oracle text. PURE DATA — fully
 * JSON-serializable. One card may yield several (multi-line oracle).
 */
TriggerDescriptor = {
  event:      TriggerEvent,        // "etb" | "ltb" | "dies" | "upkeep" |
                                   //   "endStep" | "draw" | "attacks" | "blocks"
  scope:      TriggerScope,        // "self" | "eachCreature" | "eachOtherCreature" |
                                   //   "creatureYouControl" | "you"  (Phase-1 subset)
  whose:      "yours" | "any",     // for step triggers: "At the beginning of YOUR upkeep" vs "each upkeep"
  optional:   boolean,             // contains "may" (CR 603.5) — choice deferred to resolution
  interveningIf: string | null,    // raw "if <cond>" clause text (CR 603.4), or null
  effect:     TriggerEffect | null,// Phase-1 small vocabulary; null => Arbiter/no-op resolver
  sourceText: string,              // the oracle clause that produced this (for narrator + audit)
}
```

```
TriggerEvent  ∈ { "etb","ltb","dies","upkeep","endStep","draw","attacks","blocks" }
```

`scope` answers "which object's event am I watching?" `self` = this permanent (`When this creature enters`). `eachCreature`/`eachOtherCreature` = a watcher (`Whenever a creature enters`, Soul Warden). `whose` discriminates step triggers (CR 603.2b: only abilities that trigger "at the beginning of *that* step").

#### `TriggerEffect` — Phase-1 effect vocabulary (intentionally tiny; reuses spellEffects-style descriptors)

```
TriggerEffect =
  | { kind: "gainLife", amount: number, who: "controller" }
  | { kind: "loseLife", amount: number, who: "eachOpponent" | "controller" }
  | { kind: "draw",     amount: number, who: "controller" }
  | { kind: "damage",   amount: number, targetType: "eachOpponent" | "any" | "creature" | "player" }
  | { kind: "createToken", count: number, token: { name, power, toughness, types } }  // Phase-2
  | { kind: "addCounter", counterType: string, count: number, who: "self" }            // Phase-2
```

The first four ship in Phase-1. `damage`/`token`/`counter` and anything richer fall to Phase-2's general interpreter. **Unrecognized effect → `effect: null`**, which routes the trigger to the no-op/Arbiter resolver (honest, bounded — same philosophy as `spellEffects.parseSpellEffect` returning `null`).

#### `PendingTrigger` — the in-flight instance the engine enqueues (this is the existing `state.pendingTriggers[]` element shape, formalized)

```
PendingTrigger = {
  id:          string,             // nextId("trig")
  event:       TriggerEvent,
  source:      { permanentId?: string, cardId?: string, name: string },  // the source object
  controller:  PlayerId,           // controller of source AT TRIGGER TIME (CR 603.3a)
  descriptor:  TriggerDescriptor,  // the static detection result, carried for resolution
  context:     TriggerContext,     // event-specific snapshot ("look back in time" data, CR 603.10)
  targets:     Target[],           // chosen when placed on stack (CR 603.3d); [] until then
  optional:    boolean,
  // Phase-1 overlap window ONLY:
  payload?:    { onResolve },      // closure, matching gameEngine.js:329 contract
  // Post-Agent-1:
  // payload:  { resolverKey, resolverArgs }
}
```

```
TriggerContext = {
  triggeringPermanentId?: string,  // for dies/ltb: the id BEFORE it left (look-back, CR 603.10)
  triggeringCardName?:    string,
  triggeringController?:  PlayerId,
  defenderId?:            string,  // for attacks
  // event-specific; always JSON-only
}
```

`context` exists because of CR 603.10 / 603.6 — a dies/LTB trigger must "look back in time" at the object as it last existed on the battlefield. We snapshot the needed facts at detection time, because by stack-resolution the permanent is gone from `state`.

### 2.2 Function signatures (`triggers.js`)

```
// ── Detection (pure, card-level, cacheable) ──

/** All triggered abilities printed on a card. [] when none. Cached by card identity. */
export function detectTriggers(card): TriggerDescriptor[]

/** Convenience: does this card have any trigger for the given event? */
export function hasTriggerFor(card, event): boolean

// ── Matching (pure, event-level) — "which descriptors fire for THIS event?" ──

/**
 * Given an event and the source permanent + the triggering object, return the
 * PendingTrigger instances that fire. Encapsulates scope/whose matching
 * (self vs watcher, yours-vs-any) and intervening-if pre-checks that are
 * cheap (CR 603.4 condition is re-checked at resolution too).
 */
export function triggersForEvent(state, {
  event,                 // TriggerEvent
  sourcePermanent,       // the permanent whose ability might trigger (watcher or self)
  triggeringPermanent,   // the object that moved/attacked/etc (may === sourcePermanent for "self")
  triggeringContext,     // { defenderId, ... } event extras
}): PendingTrigger[]

// ── Intervening-if (CR 603.4) ──

/**
 * Evaluate a trigger's interveningIf at the moment of stack placement AND again
 * at resolution. Phase-1 supports a small, named condition set; unknown
 * conditions return `true` (fail-open: the ability still resolves — never
 * silently swallow). Returns boolean.
 */
export function checkInterveningIf(state, pendingTrigger): boolean

// ── Phase-1 effect resolver application (closure body OR resolverKey target) ──

/**
 * Apply a Phase-1 TriggerEffect on resolution. Returns new state. Mirrors
 * spellEffects.resolveSpellEffect's structure exactly (gainLife/loseLife/draw/
 * damage) and runs destroyLethalCreatures after damage.
 */
export function applyTriggerEffect(state, { effect, controller, context, targets }): state
```

**Caching:** `detectTriggers` uses the same memo discipline as `keywords.js` — a `WeakMap`/`Map` keyed by card object (or `card.id`) so the regex pass runs once per distinct card, not once per permanent per event in the combat hot path.

---

## 3. Detection: oracle-text → descriptors

### 3.1 Pattern anchoring (reusing the keywords.js discipline)

Trigger lines are matched at ability-word position: start of oracle, after `\n`, or after `". "` / `"; "`. The leading word is `When`, `Whenever`, or `At` (CR 603.1). This is the exact anchoring keywords.js uses and is the proven false-match defense in this codebase.

```
TRIGGER_LINE = /(^|\n)\s*(When|Whenever|At)\b([^.]*?),\s*([^.]+\.)/gi
```

Then per-line classification:

| Oracle pattern (anchored) | event | scope | whose |
|---|---|---|---|
| `When this (creature\|permanent\|artifact…) enters` / `When [Name] enters` | `etb` | `self` | — |
| `Whenever a creature enters` (no "another") | `etb` | `eachCreature` | — |
| `Whenever another creature you control enters` | `etb` | `eachOtherCreature` | — |
| `When this creature dies` / `When [Name] dies` | `dies` | `self` | — |
| `Whenever a creature dies` | `dies` | `eachCreature` | — |
| `When this … leaves the battlefield` | `ltb` | `self` | — |
| `At the beginning of your upkeep` | `upkeep` | `you` | `yours` |
| `At the beginning of each upkeep` | `upkeep` | `you` | `any` |
| `At the beginning of your (end step\|draw step)` | `endStep`/`draw` | `you` | `yours` |
| `Whenever this creature attacks` / `Whenever [Name] attacks` | `attacks` | `self` | — |
| `Whenever a creature you control attacks` | `attacks` | `creatureYouControl` | — |
| `Whenever this creature blocks` | `blocks` | `self` | — |

**"dies" grounding (CR 700.4):** dies ≡ "put into a graveyard from the battlefield" — a strict subset of LTB (CR 603.6c). The detector produces a `dies` event for "dies"/"is put into a graveyard from the battlefield"; LTB ("leaves the battlefield") is the superset and produces `ltb`. The dies hook (§5.3) only fires the trigger when the destination zone is `graveyard`.

### 3.2 Static-not-trigger guard (CR 603.6d)

Lines matching `As this … enters`, `… enters with`, `… enters tapped`, `… enters as` are **NOT** captured as `etb` triggers — CR 603.6d makes them static replacement-style effects resolved as part of the entry event. The detector's `etb` rule requires the verb `enters` to be immediately followed by an effect clause, not `with`/`tapped`/`as`. (The actual application of "enters with counters" is Agent 3 / Phase-2 territory; here I only ensure we don't *misfire a trigger*.)

### 3.3 Intervening-if extraction (CR 603.4)

`At the beginning of your upkeep, if you control three or more artifacts, draw a card.` → split the `if <cond>` clause into `interveningIf` (raw text). Phase-1 recognizes a tiny condition vocabulary (see §6.2); unknown → store the raw text, evaluate fail-open (`true`) so we never fabricate a "doesn't fire" outcome.

---

## 4. APNAP ordering & stack placement (CR 603.3, 603.3b)

### 4.1 The existing `flushTriggers` is *almost* right but must change

Current `flushTriggers` (`gameEngine.js:389`) does a 2-bucket split (active vs non-active) and preserves FIFO within each bucket. CR 603.3b requires the **full APNAP order across all players**, and **each player orders their own simultaneous triggers** (in multiplayer that's all four seats, not two buckets). For the common case the current behavior is close; for Commander 4P it's wrong (ai2 and ai3 collapse into one "other" bucket with no inter-player ordering).

**TR-5 generalizes `flushTriggers` to iterate `state.turnOrder` starting at the active player** (true APNAP across N seats), preserving FIFO within each seat's own triggers. The existing 3-trigger APNAP test (`gameEngine.test.js:352`) still passes because for 2 seats the output is identical. New 4P tests assert the full rotation.

```
// generalized ordering — APNAP across all seats (CR 603.3b)
function orderTriggersAPNAP(state, pending) {
  const order = state.turnOrder || Object.keys(state.players);
  const start = order.indexOf(state.activePlayer);
  const rotated = order.slice(start).concat(order.slice(0, start)); // AP first, then turn order
  const out = [];
  for (const pid of rotated) {
    out.push(...pending.filter(t => t.controller === pid)); // FIFO within seat
  }
  // any controller no longer in turnOrder (eliminated) — drop (their triggers leave with them, CR 800.4a)
  return out;
}
```

### 4.2 Target & mode selection at placement (CR 603.3c/d)

CR 603.3d: a triggered ability chooses targets *as it goes on the stack*. For Phase-1 the only targeted trigger effect is `damage` with `targetType: "any"|"creature"|"player"`. Target selection at placement reuses the **exact pattern already shipped for spells**:

- `legalChoices`-style enumeration via `spellEffects.enumerateTargets` (already exists, already tested).
- For an **AI** controller: auto-pick via `spellEffects.chooseAITarget` (already exists).
- For the **user** controller with a Beginner/Intermediate difficulty: this is the one place triggers touch the decision loop. **Phase-1 keeps targeted *triggers* out of the user-prompt path** by having `flushTriggers` auto-resolve target choice for self-targeting / non-targeted / "each opponent" effects (the overwhelming majority of ETB/upkeep triggers), and routing genuinely-user-targeted triggers (rare in starter decks) through the same Arbiter/no-op fallback as unrecognized spells. **Phase-2 (TR-9) wires user trigger-target selection into `decisionGate`** as a new decision kind. This keeps Phase-1 from having to expand `decisionGate`/`learnSession`'s `applyChoice` contract (which would touch the whole "ask" pipeline).

> Cross-subsystem note: full user-facing trigger target selection (TR-9) shares the `decisionGate`/`legalChoices` "ask" contract. I flag it for the synthesis to reconcile with whoever owns decision-loop changes; Phase-1 deliberately does not depend on it.

### 4.3 Illegal-on-placement removal (CR 603.3d, 603.10c)

If a trigger requires a target and **no legal target exists** when it would go on the stack, the ability is removed (doesn't go on the stack) — CR 603.3d. `flushTriggers` filters these out and logs `{ kind: "trigger-removed-no-target" }`. Never silently dropped without a log (forbidden-pattern compliance).

---

## 5. Detection hook points (where triggers actually fire)

This is the populate step the system is missing. **Four chokepoints**, each already a single function — I instrument them rather than scatter detection.

### 5.1 ETB hook — `moveCardToZone` → battlefield (CR 603.6a)

The problem: `moveCardToZone` (gameState.js) is a **pure leaf with no engine import** and creates the permanent inline. It cannot itself enqueue triggers without an import cycle. Two paths the engine actually uses to put permanents on the battlefield:

1. `actionDispatcher.defaultSpellResolver` (the inline splice at `actionDispatcher.js:321-352`) — permanent spells resolving.
2. `applyPlayLand` → `moveCardToZone(... becomePermanent:true)` (lands — lands have no ETB triggers in Phase-1 scope but artifact-lands etc. exist).

**Design decision: a single engine-level ETB detection pass, `checkEtbTriggers(state, enteredPermanentId)`, lives in `gameEngine.js`** (which already imports trigger plumbing) and is called **immediately after any permanent enters**, from the two resolution sites. This honors CR 603.6a's "all permanents on the battlefield (including the newcomers) are checked" — the pass scans every battlefield permanent (self + watchers like Soul Warden) for an `etb` descriptor matching the newcomer.

```
// gameEngine.js (new)
export function checkEtbTriggers(state, enteredPermanentId): state
// finds the entered permanent; for EVERY permanent on EVERY battlefield,
// runs triggersForEvent({event:"etb", sourcePermanent, triggeringPermanent:entered});
// enqueueTrigger for each. Returns state with pendingTriggers appended.
```

To avoid the import-cycle constraint, `defaultSpellResolver` is **refactored (TR-2)** to stop splicing inline and instead call a new exported engine helper `enterBattlefield(state, { card, controller })` that wraps `createPermanent` + sets `enteredOnTurn` + **calls `checkEtbTriggers`**. This also fixes a latent bug: `defaultSpellResolver` currently builds the permanent with an ad-hoc `Date.now()` id (`actionDispatcher.js:329`) instead of `createPermanent`'s `nextId("perm")`, diverging from every other permanent and breaking deterministic test ids. TR-2 routes it through `createPermanent`.

### 5.2 LTB hook — `moveCardToZone` *from* battlefield (CR 603.6c)

Same cycle constraint. The LTB/dies events are detected at the **engine wrapper** level, not inside `moveCardToZone`. Two callers move things off the battlefield:

- `destroyLethalCreatures` (the shared lethal SBA, gameState.js) — combat + damage spells.
- `resolveSpellEffect` destroy (spellEffects.js) and other zone moves.

**Design decision: introduce `gameEngine.leaveBattlefield(state, { controller, permanentId, toZone })`** that snapshots the leaving permanent's look-back context (CR 603.10), calls `moveCardToZone`, then fires `dies`/`ltb` triggers. But `destroyLethalCreatures` lives in gameState (leaf) and is called from combatResolution and spellEffects directly — rerouting all of them through an engine wrapper is invasive.

**Lower-risk alternative (chosen): a death/LTB *diffing* pass at the SBA/priority checkpoint.** Per CR 704.3 / 117.5, SBAs are performed, *then* triggered abilities go on the stack. The engine already has a natural checkpoint: triggers flush at every priority grant (`runStepActions`, `resolveTopOfStack`). So:

- `destroyLethalCreatures` already returns `{ state, dead }` (gameState.js:654) — **`dead` is the look-back snapshot we need** (it carries `{controller, id, name}` captured before the move). TR-3 threads `dead` to a new `checkDiesTriggers(state, dead)` call at each site that runs the lethal SBA (combatResolution, spellEffects, and the engine's SBA checkpoint).
- For non-death LTB (bounce, exile, sacrifice), TR-8 (Phase-2) adds the symmetric `checkLtbTriggers` at those move sites.

```
// gameEngine.js (new)
export function checkDiesTriggers(state, dead): state
// dead = [{controller, id, name}] from destroyLethalCreatures; for each dead
// creature AND for every battlefield watcher (Blood Artist-style "whenever a
// creature dies"), enqueue matching triggers using a TriggerContext snapshot.
```

The look-back (CR 603.10a) works because `dead` was captured *before* the permanents left, and watchers are checked against the **pre-death** controller/types carried in `dead`. This satisfies the CR 603.10a example (artifact + creatures destroyed together still see each other).

### 5.3 Step-boundary hooks — upkeep / draw / end step (CR 603.2b)

These are the cleanest: `runStepActions` (gameEngine.js:180) already switches on `state.step` and already calls `flushTriggers` at the end. TR-4 adds, before the `flushTriggers` call:

```
case "upkeep":   next = checkStepTriggers(next, "upkeep");   break;   // CR 603.2b
case "draw":     /* after the draw */ next = checkStepTriggers(next, "draw"); break;
case "end":      next = checkStepTriggers(next, "endStep");  break;
```

```
// gameEngine.js (new)
export function checkStepTriggers(state, event): state
// For every battlefield permanent, run triggersForEvent({event}); the
// `whose` field gates "your upkeep" (only when the permanent's controller ===
// state.activePlayer) vs "each upkeep" (always). Enqueue all matches.
```

CR 603.2b is the exact anchor: "When a phase or step begins, all abilities that trigger 'at the beginning of' that phase or step trigger." The `whose: "yours"` check (`controller === state.activePlayer`) is what makes "your upkeep" fire only on your turn.

### 5.4 Attack-declaration hook (CR 508.3)

Attackers are declared via `actionDispatcher.applyDeclareAttacker` (actionDispatcher.js:362). Each declared attacker is a candidate `attacks` trigger (self) and a candidate for `creatureYouControl` watchers. **But** CR 508 declares all attackers as one turn-based action *before* any "attacks" trigger goes on the stack — and in this engine, attackers are declared one action at a time through the dispatcher.

**Design decision: detect attack triggers at the `declare-attackers` → `declare-blockers` step transition**, not per-declare-action, so all "becomes attacking" triggers from one declaration batch fire together (correct APNAP, CR 508.3). The transition runs through `runStepActions` (the `declare-blockers` case). TR-6 adds `checkAttackTriggers(state)` there, reading `state.combat.attackers` (the full batch).

```
// gameEngine.js (new)
export function checkAttackTriggers(state): state
// for each attacker in state.combat.attackers: self "attacks" trigger +
// every "creatureYouControl" watcher controlled by the attacking player;
// context carries { defenderId }.  (CR 508.3)
```

Blocks (`blocks` event, CR 509.3) are symmetric and deferred to Phase-2 (TR-8) — they need the blocker batch at `declare-blockers → first-strike-damage`.

### 5.5 Summary of hook → CR → checkpoint

| Hook | CR | Checkpoint (existing fn) | Sub-PR |
|---|---|---|---|
| ETB | 603.6a | `enterBattlefield` (new, from resolver + play-land) | TR-2 |
| dies | 603.6c, 700.4, 603.10a | `checkDiesTriggers` after `destroyLethalCreatures` | TR-3 |
| upkeep/draw/end | 603.2b | `runStepActions` step cases | TR-4 |
| attacks | 508.3 | `runStepActions` declare-blockers case | TR-6 |
| LTB(non-death)/blocks | 603.6c, 509.3 | move sites / declare-blockers | TR-8 (Phase-2) |

---

## 6. Resolution: trigger on the stack → effect

### 6.1 Phase-1: closure body (overlap window) → resolverKey (post-Agent-1)

A `PendingTrigger` whose `descriptor.effect` is recognized resolves via `applyTriggerEffect`. During the overlap window, `flushTriggers` attaches `payload.onResolve = (s) => applyTriggerEffect(s, {...})` (closure — but a *thin* closure over JSON args, trivially convertible). Post-Agent-1, TR-7 replaces it with:

```
payload: { resolverKey: "trigger.effect", resolverArgs: { effect, controller, context, targets } }
```

and registers `"trigger.effect" -> applyTriggerEffect` in Agent 1's registry. **The reconciliation is mechanical** precisely because `applyTriggerEffect` already takes pure-JSON args — no closure state to untangle. This is the design's core serialization win for triggers: the *descriptor* and *args* were data from the start; only the dispatch indirection changes.

A `PendingTrigger` whose `descriptor.effect` is `null` resolves through the existing no-op/Arbiter fallback (`resolveTopOfStack`'s else branch, gameEngine.js:339) — logged, never silently dropped.

### 6.2 Intervening-if re-check at resolution (CR 603.4)

CR 603.4: the condition is checked *both* when the ability would trigger (placement) *and* on resolution; if false on resolution, the ability does nothing. `resolveTopOfStack` (or `applyTriggerEffect`) calls `checkInterveningIf` first; false → log `{kind:"trigger-fizzle-intervening-if"}` and return state unchanged. Phase-1 condition vocabulary (fail-open on unknown):

- `you control N+ <type>` — count battlefield by type.
- `you have N+ life` / `N or less life` — read `player.life` (CR 603.4's own Felidar example).
- Unknown → `true` (fail-open).

### 6.3 Optional "may" triggers (CR 603.5)

`optional: true` triggers still go on the stack (CR 603.5); the choice happens at resolution. Phase-1: AI controllers always take beneficial "may" (gain life / draw); user "may" triggers default to yes in auto modes and are surfaced as a yes/no `ask` only in Beginner (deferred to TR-9 with target selection — Phase-1 auto-takes beneficial, auto-declines self-harm, both logged). Never fabricated either way.

---

## 7. File-by-file change list

### New files

| File | Contents |
|---|---|
| `app/src/lib/learn/triggers.js` | Detection (`detectTriggers`, `hasTriggerFor`), matching (`triggersForEvent`), `checkInterveningIf`, `applyTriggerEffect`, the `TriggerEffect` parser. Leaf module (imports only gameState reads + spellEffects target helpers). |
| `app/src/lib/learn/triggers.test.js` | Unit tests for detection (the discriminator cases) + effect application. |
| `app/src/lib/learn/triggers.integration.test.js` | Full pipeline: ETB/dies/upkeep/attack triggers firing through `advanceUntilDecision`. |

### Changed files

| File | Change | Sub-PR |
|---|---|---|
| `gameEngine.js` | Add `enterBattlefield`, `checkEtbTriggers`, `checkDiesTriggers`, `checkStepTriggers`, `checkAttackTriggers`. Generalize `flushTriggers` ordering to N-seat APNAP via `orderTriggersAPNAP`. Wire `checkStepTriggers` into `runStepActions` step cases; wire `checkAttackTriggers` into declare-blockers case. Import `triggers.js`. | TR-1,4,5,6 |
| `actionDispatcher.js` | `defaultSpellResolver` calls `gameEngine.enterBattlefield` instead of inline splice (fixes the `Date.now()` id, routes through `createPermanent`, fires ETB). `applyPlayLand` fires ETB after `moveCardToZone`. **New import of gameEngine** — verify no cycle (gameEngine already imports actionDispatcher? No — gameEngine imports gameState/combatResolution/cardEffects only; actionDispatcher imports gameEngine. Adding `enterBattlefield` to that existing import is safe.) | TR-2 |
| `combatResolution.js` | After `destroyLethalCreatures`, call `checkDiesTriggers(state, dead)` (it already has `dead`). | TR-3 |
| `spellEffects.js` | `resolveSpellEffect` destroy/damage branches: after the lethal SBA, fire dies triggers via the engine helper. (To avoid a spellEffects→gameEngine cycle — gameEngine imports nothing from spellEffects, but actionDispatcher does — the dies-trigger call is **injected**: `resolveSpellEffect` returns `{state, dead}` or the caller (`resolveTopOfStack`) runs the dies pass. **Chosen:** keep spellEffects a leaf; have the engine run a post-resolution dies-diff. See §7.1.) | TR-3 |
| `gameState.js` | No signature changes. (`destroyLethalCreatures` already returns `dead` — the look-back snapshot. No new exports needed.) | — |
| `learnSession.js` | No contract change for Phase-1. SBA checkpoint (`recordOutcomeIfChanged`) is unaffected; triggers flush through the engine's existing checkpoints. Phase-2 (TR-9) adds trigger-target decisions. | — |

### 7.1 Avoiding import cycles (the real constraint)

Dependency direction today: `gameState` (leaf) ← `keywords`/`cardEffects` (leaf) ← `combatResolution`/`spellEffects` ← `gameEngine` ← `actionDispatcher` ← `legalChoices`/`decisionGate` ← `learnSession`.

`triggers.js` must be a **leaf** (imports `gameState` + `spellEffects` target helpers only) so `gameEngine` and `combatResolution` can import it without a cycle. The trigger *hook functions* (`checkEtbTriggers`, etc.) live in **`gameEngine.js`** (or `combatResolution.js`) — not in `triggers.js` — because they enqueue onto state and orchestrate, which is engine work. This keeps `triggers.js` pure detection/matching/effect-data.

For the **dies hook from `spellEffects`**: rather than `spellEffects → gameEngine` (cycle), the engine runs a **post-resolution dies diff** in `resolveTopOfStack` — after a spell resolves, compare battlefield membership before/after and fire dies triggers for the delta. This is the cleanest: it catches *every* death from *any* resolution path (spell, trigger, future ability) in one place, and never creates a cycle. Combat damage stays special-cased (it runs outside the stack, in `runStepActions`) and uses its own `dead` from `destroyLethalCreatures`.

---

## 8. TDD sub-PR breakdown

Each sub-PR is independently shippable and keeps the ~1184-case suite green. **No broken intermediate states**: detection ships before hooks; hooks ship one event-class at a time; the resolver-key swap is last and mechanical.

### Phase-1 (infrastructure + common shapes)

**TR-1 — `triggers.js` detection + matching + APNAP generalization (no behavior change to games).**
- New `triggers.js` with `detectTriggers`, `hasTriggerFor`, `triggersForEvent`, `checkInterveningIf`, `applyTriggerEffect`.
- Generalize `flushTriggers` to N-seat APNAP (`orderTriggersAPNAP`).
- Tests: `triggers.test.js` (detection discriminator: ETB vs `enters tapped`; dies vs LTB; `your upkeep` vs `each upkeep`; reminder-text exclusion). `gameEngine.test.js` existing APNAP test stays green; **add** a 4-seat APNAP test.
- *Nothing is enqueued yet* — games behave identically. Pure additive. **Suite green.**

**TR-2 — ETB hook (`enterBattlefield` + `checkEtbTriggers`).**
- `defaultSpellResolver` and `applyPlayLand` route through `enterBattlefield`; fixes the `Date.now()` id.
- Tests: a creature with `When this creature enters, draw a card` ETB-draws; Soul Warden-style watcher (`Whenever a creature enters, you gain 1 life`) gains life when *another* creature enters; `enters tapped` does NOT enqueue a trigger.
- *Existing tests that asserted no-trigger ETB*: `actionDispatcher.test.js`'s permanent-resolution tests may assert exact permanent ids — TR-2's switch to `createPermanent` changes ids from `perm-<Date.now()>` to `perm-<uuid>-<n>`. **These tests shift** (assert via `name`/shape, not the synthetic id). Documented in §9.

**TR-3 — dies hook (`checkDiesTriggers`) for combat + post-resolution diff.**
- `combatResolution.js` fires dies triggers from its `dead`; `resolveTopOfStack` runs the dies diff after each resolution.
- Tests: a creature with `When this creature dies, each opponent loses 1 life` fires on combat death; Blood Artist-style watcher fires per creature death (CR 603.10a — multiple deaths in one combat each trigger).

**TR-4 — step triggers (upkeep/draw/end).**
- `runStepActions` wires `checkStepTriggers`.
- Tests: `At the beginning of your upkeep, draw a card` fires on controller's upkeep only (not opponents'); `each upkeep` fires on every upkeep; intervening-if (`if you have 40 or more life`, the CR 603.4 Felidar case) gates correctly.

**TR-5 — APNAP hardening in multiplayer + illegal-removal.**
- `flushTriggers` removes target-less targeted triggers (CR 603.3d) with a log; 4P ordering tests.
- (TR-1 introduced the ordering fn; TR-5 wires removal + multiplayer integration tests.)

**TR-6 — attack triggers.**
- `runStepActions` declare-blockers case fires `checkAttackTriggers`.
- Tests: `Whenever this creature attacks, you draw a card` fires once per combat; `Whenever a creature you control attacks` watcher fires per attacker.

**TR-7 — resolver-key reconciliation (RUNS AFTER Agent 1's registry).**
- Replace every trigger `payload.onResolve` closure with `{ resolverKey: "trigger.effect", resolverArgs }`; register `applyTriggerEffect`.
- Tests: a serialize→deserialize→resolve round-trip on a state with a pending trigger on the stack (the Phase-3 persistence acceptance test, validated early here).
- **This is the only sub-PR ordered relative to Agent 1.** If Agent 1 lands first, TR-1..TR-6 emit `resolverKey` directly and TR-7 collapses into them.

### Phase-2 (broad coverage — on top of the infra)

**TR-8** — LTB(non-death) + sacrifice + blocks triggers; exile/bounce move-site hooks.
**TR-9** — user-facing trigger target selection + "may" yes/no, via a new `decisionGate` decision kind (shares the "ask" contract — flagged for synthesis).
**TR-10** — richer `TriggerEffect` vocabulary (tokens, counters, scry, tutor) delegating to Phase-2's general oracle interpreter; Arbiter fallback for the long tail.
**TR-11** — delayed triggered abilities (CR 603.7) — `state.delayedTriggers[]` armed by effects, fired at the named future event.

---

## 9. Test plan

### New tests
- `triggers.test.js` — detection discriminator (every row of §3.1 table + the §3.2 static-not-trigger guard + reminder-text exclusion); `applyTriggerEffect` per effect kind; `checkInterveningIf` per condition + fail-open.
- `triggers.integration.test.js` — end-to-end via `createLearnSession`/`advanceUntilDecision`: ETB-draw, Soul Warden life gain, dies drain, upkeep draw, attack draw all observably change state; APNAP order across 4 seats; trigger-on-stack survives `JSON.parse(JSON.stringify(state))` round-trip (post-TR-7).
- `gameEngine.test.js` — add 4-seat APNAP ordering case; target-less trigger removal case.

### Existing tests that shift (and why)
- `actionDispatcher.test.js` — permanent-resolution assertions that key on the synthetic `perm-<Date.now()>` id shift to id-agnostic assertions (TR-2 routes through `createPermanent`). **Behavioral output (a permanent enters) is unchanged**; only the id format normalizes (this is a *correctness fix* — it was the one place not using `nextId`).
- `gameEngine.test.js` "trigger queue" block — the 3-trigger 2-seat APNAP test (`:352`) stays green by construction (2-seat APNAP output is identical under the generalized fn). No edit needed; it becomes a regression guard for the generalization.
- `playable.integration.test.js` / `integration.test.js` — full-game autopilots will now *see triggers fire*. If any assert exact life totals or turn counts on decks that contain trigger cards, those numbers shift. **Mitigation:** TR-2..TR-6 each run the full suite; any integration test using trigger-bearing cards gets its expected values re-derived from the new (correct) behavior, with a comment citing the trigger that changed it. Decks of vanilla cards (the bulk of existing fixtures) are unaffected.
- `combatResolution.test.js` — vanilla-combat cases unaffected (no dies-trigger cards). Any case using a card whose oracle has a dies line gets the trigger asserted.

### Coverage target
Each new hook adds at least an import-smoke + one behavioral test (per gotcha #10 in CLAUDE.md — every new route/path gets a smoke test). `triggers.js` aims for full-branch coverage of the detection discriminator, the highest-risk surface.

---

## 10. CR citations (all verified against `knowledge/mtg-judge/data/cr/cr_current.json`)

| Rule | Used for |
|---|---|
| **113.3 / 113.3c** | three ability classes; triggered-ability definition + "put on stack next time a player would receive priority" |
| **603.1** | trigger syntax `[When/Whenever/At] [condition], [effect]` — detection grammar |
| **603.2 / 603.2a** | triggers fire automatically; even when casting is illegal |
| **603.2b** | "when a phase/step begins, all 'at the beginning of' abilities trigger" — step hooks |
| **603.2c** | a trigger fires once per event — dedup discipline |
| **603.3** | controller puts it on the stack next priority; becomes topmost |
| **603.3a** | controller = who controlled the source *at trigger time* → `PendingTrigger.controller` |
| **603.3b** | APNAP placement, each player orders their own — `orderTriggersAPNAP` |
| **603.3c** | modal choice at placement (Phase-2) |
| **603.3d** | targets chosen at placement; illegal/no-target → removed from stack |
| **603.4** | intervening-if checked at placement AND resolution (Felidar example) |
| **603.5** | optional "may" triggers go on stack; choice at resolution |
| **603.6 / 603.6a / 603.6c** | zone-change triggers; ETB; LTB/dies |
| **603.6d** | `enters with` / `enters tapped` / `as ~ enters` are STATIC, not triggers — detection guard |
| **603.10 / 603.10a** | look-back-in-time for dies/LTB; multiple simultaneous deaths each trigger watchers |
| **700.4** | "dies" ≡ put into graveyard from battlefield — dies-vs-LTB boundary |
| **508.3 / 509.3** | attack/block declaration triggers |
| **117.5 / 704.3** | SBAs performed, repeated, THEN triggers go on the stack — checkpoint ordering |
| **117.3b / 117.3c** | priority after resolution / after taking an action — flush checkpoints |
| **800.4a** | eliminated player's objects (incl. their triggers) leave — drop in ordering |

(CR 603.7 cited for the Phase-2 delayed-trigger sub-PR TR-11.)

---

## 11. RISKS

1. **Infinite trigger loops.** A watcher trigger that creates a creature that re-triggers the watcher (e.g. token-makers + ETB watchers) can loop. *Mitigation:* (a) the existing `learnSession` `SAFETY_CAP` (50000 ticks) + `progressSignature` anti-loop latch already backstop; (b) a per-flush trigger-budget (cap distinct triggers enqueued per checkpoint, e.g. 200) that logs `{kind:"trigger-budget-exceeded"}` and routes to Arbiter rather than spinning. Real MTG loops are mandatory-loop draws (CR 720) — out of Phase-1 scope; we cap-and-log, never silently swallow.

2. **APNAP/ordering correctness in multiplayer.** The current 2-bucket split is wrong for 4P. *Mitigation:* TR-5's N-seat `orderTriggersAPNAP` + explicit 4-seat tests. Eliminated-player triggers must be dropped (CR 800.4a) — covered.

3. **Immutability violations in hooks.** Hooks run inside hot paths (`moveCardToZone` resolution, combat). A hook that mutates `dead` or the battlefield array in place would corrupt the pure model. *Mitigation:* all hooks return new state via existing helpers (`enqueueTrigger`, `withPlayer`); `triggers.js` returns fresh descriptor arrays; lint/review gate + the suite's structural-sharing assertions.

4. **Import-cycle regressions.** Adding `gameEngine` import to `actionDispatcher`, or a hook that pulls `spellEffects → gameEngine`. *Mitigation:* `triggers.js` is a strict leaf; dies-from-spell uses the engine's post-resolution diff (§7.1) instead of a back-import. A cycle check (`madge`-style or a simple import-graph test) added in TR-1.

5. **Detection false-positives/negatives.** Over-matching `when` mid-sentence, or missing a phrasing. *Mitigation:* anchored regex (keywords.js discipline), conservative bias (a miss = ability doesn't fire = safe, never a fabricated effect, per the §1.2 mandate), `effect: null` → Arbiter fallback for anything recognized-as-trigger-but-unparseable-effect. **Never invent the effect.**

6. **Resolver-key timing coupling with Agent 1 (the one ordering risk).** If TR-7 lands before Agent 1's registry, resolution breaks. *Mitigation:* the overlap-window closure contract (matching the *already-tested* `gameEngine.js:329` `onResolve`) means TR-1..TR-6 are fully functional and green **without** Agent 1; TR-7 is gated on Agent 1 and is mechanical (JSON args already exist). Synthesis must order TR-7 after Agent 1's registry — flagged explicitly.

7. **Look-back snapshot drift (CR 603.10).** If `destroyLethalCreatures`'s `dead` snapshot omits a field a watcher needs (e.g. creature *type* for "whenever a creature dies"), the watcher mis-fires. *Mitigation:* `TriggerContext` snapshots type/controller/name from the permanent *before* the move; TR-3 tests the CR 603.10a multi-death example directly.

8. **Integration-fixture churn.** Existing full-game tests using trigger-bearing cards will see new (correct) behavior and need re-derived expected values. *Mitigation:* §9's per-PR full-suite run; vanilla-card fixtures (the majority) are untouched; each shifted assertion gets a comment citing the trigger.

9. **`actionDispatcher` permanent-id normalization (TR-2).** Switching off the `Date.now()` id changes synthetic ids in some assertions. *Mitigation:* id-agnostic assertions; this is a latent-correctness fix (it was the only non-`nextId` permanent creation), not a regression.

---

### Files referenced (all absolute)
- `C:\Users\colto\Documents\Claude\Projects\MTG-TOOL\app\src\lib\learn\gameEngine.js` (enqueueTrigger/flushTriggers/runStepActions/resolveTopOfStack — hook host)
- `C:\Users\colto\Documents\Claude\Projects\MTG-TOOL\app\src\lib\learn\actionDispatcher.js` (defaultSpellResolver ETB site, the `Date.now()` id bug at :329)
- `C:\Users\colto\Documents\Claude\Projects\MTG-TOOL\app\src\lib\learn\combatResolution.js` (dies hook site — has `dead`)
- `C:\Users\colto\Documents\Claude\Projects\MTG-TOOL\app\src\lib\learn\gameState.js` (`moveCardToZone`, `destroyLethalCreatures` returning `{state, dead}`, `createPermanent`)
- `C:\Users\colto\Documents\Claude\Projects\MTG-TOOL\app\src\lib\learn\spellEffects.js` (resolution model to mirror; `enumerateTargets`/`chooseAITarget` reuse)
- `C:\Users\colto\Documents\Claude\Projects\MTG-TOOL\app\src\lib\learn\keywords.js` (anchoring discipline + `hasKeyword` — never shadow)
- `C:\Users\colto\Documents\Claude\Projects\MTG-TOOL\app\src\lib\learn\cardEffects.js` (registry/leaf-module pattern to follow)
- `C:\Users\colto\Documents\Claude\Projects\MTG-TOOL\app\src\lib\learn\learnSession.js` (SBA checkpoint, safety cap, anti-loop latch — backstops)
- `C:\Users\colto\Documents\Claude\Projects\MTG-TOOL\app\src\lib\learn\decisionGate.js` / `legalChoices.js` ("ask" contract — TR-9 touchpoint)
- `C:\Users\colto\Documents\Claude\Projects\MTG-TOOL\app\src\lib\learn\gameEngine.test.js` (existing trigger-queue + APNAP tests to extend)
- New: `triggers.js`, `triggers.test.js`, `triggers.integration.test.js`
- CR source: `C:\Users\colto\Documents\Claude\Projects\MTG-TOOL\knowledge\mtg-judge\data\cr\cr_current.json`

**Synthesis reconciliation flags:** (1) **resolver-key contract from Agent 1** — TR-7 ordered after Agent 1's registry; TR-1..TR-6 use the existing `onResolve` closure contract and are Agent-1-independent. (2) **CR 613 layers from Agent 3** — granted-keyword/ability reads in trigger conditions and the `enters with` static distinction (CR 603.6d) defer to Agent 3; Phase-1 only avoids *misclassifying* them. (3) **decisionGate "ask" contract** — TR-9 (user trigger targets / "may") shares the decision-loop contract; Phase-1 keeps trigger target choice out of the user-prompt path.
# ENGINE-SCAFFOLD — the rules engine, mapped for a session without Fable 5

> **What this is.** A durable, deep map of `app/src/lib/learn/` — the native
> rules-coverage engine. Written during the one-time Fable 5 consolidation pass
> (2026-07-01) so future Opus/Sonnet sessions can navigate and extend the engine
> without re-deriving its architecture. Companion: [PROJECT-SCAFFOLD.md](PROJECT-SCAFFOLD.md)
> (the whole app). When a fact here and the code disagree, **the code wins** —
> fix this doc. Line numbers drift; the *shapes* and *invariants* are the durable part.

---

## 0. The one-paragraph mental model

Every Magic card is a string of oracle text. The engine's job is to decide, for
each card, whether it can **play the whole card correctly with pure code**
(*native*) or must **hand it to an LLM** (the *Arbiter*). That decision is
`classifyCard` (the **metric**). Separately, at game time, the same text is
parsed into an **effect program** (a list of typed *atoms*) that a resolver
executes against an immutable game state. The iron law (**THE CREED**): it is
*forbidden* to play a card wrong (a false positive), but always *safe* to defer
to the Arbiter (a false negative). "Model the whole card, or park it." Everything
below is machinery in service of that law.

---

## 1. THE CREED — the discipline every change obeys

```
false NEGATIVE  (native card conservatively routed to the Arbiter)      = SAFE
false POSITIVE  (a card/clause played WRONG — dropped rider, wrong zone,  = FORBIDDEN
                 phantom mana, illegal action offered, fabricated result)
```

Consequences that shape the whole codebase:

- **All-or-nothing per card.** A card is native only when *every* clause is
  modeled. One unmodeled rider ⇒ the whole card is body-only/Arbiter. You will
  see this pattern everywhere: parse everything, and if any residue is left over
  or any atom is unknown, bail to a safe tier.
- **Never fabricate.** No invented CR citations (every cite traces to
  `knowledge/mtg-judge/data/cr/cr_current.json`); no card text from memory
  (always the bundled oracle); no "I verified" without the script having
  verified. `?? N`, never `|| N` (a real `0`/`""` must survive).
- **Anchored matchers.** Recognizers use `^…$`-anchored regexes as an allowlist,
  not loose `.includes()`. A loose match is how a false positive sneaks in.
- **Metric mirrors runtime.** Where the classifier claims "native", the runtime
  must actually resolve it that way. The two share code (`triggerRoutesNatively`,
  the mana `manaProduction`, the layer selectors) precisely so they can't drift.

If you cannot model a card's whole behavior cleanly, the correct action is **PARK
it** (leave it Arbiter and note why) — never fake a flip to raise the number.

---

## 2. THE TIER MODEL — `coverage.js` / `classifyCard`

`classifyCard(card) -> tier` is a **pure, deterministic** function: same card
object ⇒ same tier, every process, forever. (Determinism was root-caused and is
regression-tested — see §7. It has **zero runtime consumers**; it is the *metric*.
A misclassification is a metric over/under-count, never a gameplay bug — but an
over-count that claims "native" while the runtime plays it wrong is still a CREED
breach because it *asserts* the runtime is safe.)

### 2.1 The tiers

| Tier | Meaning | Native? |
|---|---|---|
| `native-body` | keyword-only / vanilla creature (`isKeywordOnly`) | ✅ |
| `native-mana` | a mana source whose non-mana residue is also modeled | ✅ |
| `native-mana-aura` | an Aura that grants a modeled mana ability | ✅ |
| `native-aura` | an Aura whose whole grant is modeled | ✅ |
| `native-trigger` | triggered-ability card, every trigger routes native | ✅ |
| `native-activated` | activated-ability card, every ability modeled | ✅ |
| `native-static` | static/anthem/keyword-grant card, fully modeled | ✅ |
| `native-equipment` | Equipment whose bonus + grants are modeled | ✅ |
| `native-mixed` | a composite of several modeled mechanisms | ✅ |
| `native-clone` | a clone/copy permanent | ✅ |
| `native-planeswalker` | PW whose every loyalty ability is modeled | ✅ |
| `native-spell` | instant/sorcery whose program is HIGH-confidence | ✅ |
| `land` | any card with "Land" in its type line (see caveat) | ✅ |
| `playable-pw` | PW playable but not fully modeled | ❌ (metric) |
| `body-only` | has unmodeled non-keyword residue | ❌ |
| `arbiter-spell` | instant/sorcery that isn't HIGH | ❌ |
| `arbiter-pw` | PW that isn't playable | ❌ |

`isNativeTier(tier)` is the authority for "counts as native" (`land` + every
`native-*`; **not** `playable-pw`/`arbiter-*`). Always use it; never hardcode the
set. **Caveat (known metric seam):** the `land` tier is *unconditional* — any card
whose type line contains "Land" counts native regardless of unmodeled activated
abilities on it (Mystifying Maze, etc.). This is the one non-all-or-nothing tier;
it over-counts a handful of utility lands. Documented, not yet tightened (a
`land-partial` tier is the fix if it ever matters).

### 2.2 The classification pipeline (order matters — first match wins)

`classifyCard` dispatches top-to-bottom; the first tier that claims the card wins:

```
1.  Planeswalker?            → castsAsPlaneswalker → loyaltyAbilities tiers
2.  Adventure?               → adventure.js splits faces; BOTH halves must be native
3.  Land (type line)?        → "land" (unconditional — see caveat above)
4.  DFC back-face PW?        → body-only
5.  Instant/Sorcery?         → spellIsNative:
       storm/cascade keyword carve-outs (validated via detectTriggers +
       triggerRoutesNatively) · plot/convoke/affinity cost strips ·
       parseEffectProgram must be HIGH with NO combat-referent atoms
6.  PERMANENT:
       Aura tiers → clone → oracle PRE-STRIPS (plot/warp lines, cost-only keyword
       lines, self-cost-reduction, enters-with-counters/tapped sentences)
     → isKeywordOnly                       → native-body
     → hasManaAbility + residue gate       → native-mana
     → single-mechanism gates: permanentTriggersCovered / permanentActivatedCovered
       / staticAbilitiesCoverCard / equipment + grant gates
     → COVERAGE_CLASSIFIERS registry (24 registered classifiers, consulted in
       registration order) — doubler, mana-multiplier, kicker, tribute, emerge,
       chosen-type, commander hooks, annihilator, bestow, …
     → permanentFullyCovered               → native-mixed
     → else                                → body-only
```

The **pre-strips** are load-bearing: they remove text the engine handles as a
*cost* or an *enters-with* replacement so the *remaining* text can be judged
all-or-nothing. If you add a new cost-shaped keyword, it strips here.

### 2.3 The registry seam (how coverage grows without editing dispatch)

`COVERAGE_CLASSIFIERS` is an **additive array** of `(card) => tier | null`
functions consulted after the inline single-mechanism gates and before the
composite catch-all. New whole-card mechanisms register a classifier
(`registerCoverageClassifier(fn)`) rather than editing the dispatch body. Each
classifier is itself all-or-nothing: it strips its own mechanic's text and must
find the remainder keyword-only/empty, else returns `null` (defer to the next).
This is why coverage slices rarely touch `classifyCard`'s core.

---

## 3. THE PARSER — `effects/parser.js` / `parseEffectProgram`

The parser turns an effect clause (a spell body, a trigger's effect, an activated
ability's effect) into a **program**: `{ atoms: [...], confidence, modal? }`.

### 3.1 Confidence is all-or-nothing

`programConfidence(program)` is **HIGH iff** there is ≥1 atom AND *every* atom's
op is in the `KNOWN` set (derived from the `ATOM_RESOLVERS` barrel, so the gate
and the resolver set literally cannot drift), AND position invariants hold
(discover/free-cast/cascade must be last; `fightAtomMisplaced`; dice/reveal
sequence gates). **LOW = zero atoms recognized ⇒ Arbiter.** There is no partial
credit — a program with one unknown atom is not "mostly native", it is *not
native*. This is THE CREED expressed as code.

### 3.2 The clause pipeline

`parseEffectClauseImpl(clause)`:

```
vacuous-rider strips → once-per-turn gate → ~12 COLLAPSED multi-sentence
templates (hand disruption, impulse-dig, emblem, rider-removal/counter families,
reflexive fold, optional-payment) → parseModal (all-or-nothing across modes) →
bullet guard → splitClauses (split on sentences / ";" / top-level " and ", with
~20 keep-whole exceptions) → per clause parseClauseToAtom:
   "you may" peel → X-rewrites → inline fight matchers → parseExtendedAtom
   → CLAUSE_PARSERS registry → legacy parseSpellEffect fallback (guarded by
     isCleanClause / UNMODELED_MARKERS)
```

### 3.3 The CLAUSE_PARSERS registry (the atom seam)

`effects/atoms/*.js` (42 modules) each export **pure clause parsers** — functions
that take a clause string and return an atom (or null). They register into
`CLAUSE_PARSERS` at the bottom of `parser.js`. **Critical architectural rule: an
atom module NEVER imports `parser.js` back** — the dependency is one-way
(`parser.js` → `atoms/*`), which keeps the module graph TDZ-safe (no circular
init). If you need a shared helper, it lives in `parseHelpers.js` or
`effectAtoms.js`, never by importing the parser.

Atom op names must match `ATOM_RESOLVERS` (§4) — the op string an atom emits is
the key the runtime resolver dispatches on. Emit an op with no resolver and the
program is silently LOW (KNOWN excludes it) — which is safe (Arbiter) but means
your atom does nothing until the resolver exists.

---

## 4. RUNTIME — how a game actually runs

The runtime is a separate concern from the metric. State is **one immutable JSON
object**; every action returns a new state.

### 4.1 State shape (`gameState.js`)

```
{ turn, mode ("standard"|"commander"), activePlayer, turnOrder[], priorityHolder,
  consecutivePasses, phase, step, stack[], pendingTriggers[], continuousEffects[],
  timestampCounter, idSeq, rngSeed, players{}, combat{attackers,blockers}, log[],
  + transient: pendingChoice, pendingArbiter, pendingDiscover, pendingFreeCast,
    pendingCascade, pendingLeaveEvents, … }
```
Per player: `life, poison, commanderDamageFrom{}, commanderCastCount, manaPool,
library/hand/battlefield/graveyard/exile/command, companion, emblems, experience,
radCounters`, per-turn tallies. Per permanent: `{id, card, controller, tapped,
summoningSick, counters{}, damageMarked, attachments[], attachedTo, timestamp,
enteredOnTurn}` + feature flags (`regenShields, bestowed, wasKicked, chosenType,
xValue, …`).

### 4.2 There is no `stack.js`

The stack is `state.stack`. Older docs reference a `stack.js` module — **it does
not exist**; don't create it. Stack objects are pure JSON `{resolver, params}`
(no closures) so the whole state serializes — that is the keystone that makes
self-play trajectories replayable. `serialization.js` is a JSON pass-through with
a `containsFunction` guard that throws if anything non-serializable sneaks onto
the stack.

- **Push**: `actionDispatcher.applyCastSpell / applyActivateAbility /
  applyActivateLoyalty / applyCycle` and `gameEngine.flushTriggers`.
- **Resolve (pop)**: `gameEngine.resolveTopOfStack` dispatches `payload.resolver`
  through the `RESOLVERS` registry in `resolvers.js` (extend via
  `registerResolver`).

### 4.3 Turn / priority (`gameEngine.js`)

`TURN_SEQUENCE` = phases × steps. `advanceStep` empties mana pools (CR 500.4) and
rolls the turn; `runStepActions` applies step automatics (untap, draw, combat
damage, cleanup) + step triggers + targeted per-card hooks (fading, Seedborn,
Ur-Dragon, Vihaan, Mothman, annihilator, radiation…), then grants priority and
flushes triggers. `passPriority`: when a full table lap passes
(`consecutivePasses >= playerCount`) → resolve top of stack, or advance step.
Untap/cleanup grant no priority (`NO_PRIORITY_STEPS`).

### 4.4 Triggers (`triggers.js` → `triggerRouting.js` → `gameEngine.flushTriggers`)

Detection (`detectTriggers`, cached per card object in a WeakMap): anchor on
`When|Whenever|At` → `splitTriggerSentence` (condition / intervening-if / effect)
→ `classifyCondition` → descriptor with a raw `effectClause`. An **additive
detector registry** (`registerTriggerDetector`) adds shapes (e.g. self-LTB-return,
chosen-type). At flush, `buildTriggerStack` orders APNAP and routes each trigger:
HIGH non-modal programs get an `effect-program` stack payload with flush-time
target choice; intervening-ifs are checked at flush *and* re-checked at
resolution; anything unmodeled → `manual` (Arbiter no-op).

`triggerRoutesNatively(effectClause)` is the **shared gate** used by *both* the
metric (coverage's `native-trigger`) and the runtime flush — it re-parses the
effect and requires HIGH + resolvable targets + combat-referent satisfied + a
strict intervening-if vocabulary. Single source of truth ⇒ the classifier can't
claim native for a trigger the runtime would drop.

### 4.5 Resolution (`resolvers.js` + `effects/runProgram.js`)

`RESOLVERS` maps a resolver key → a `(state, params) => state` function.
`PERMANENT_ETB` runs `enterPermanent` (enters-with-counters replacements, clone
pause, tribute, chosen-type); `AURA_ETB` re-checks its target; `SPELL_NOOP` →
`markPendingArbiter`. The `EFFECT_PROGRAM` resolver runs `runProgram` — an
**all-or-nothing atom interpreter**: it executes atoms in order and, when an atom
needs a player choice (tutor, scry, edict, mode, divide damage…), it **pauses**
onto `state.pendingChoice` with a `resume` continuation. The driver
(`learnSession`) surfaces the choice, gets an answer, and resumes; each settlement
ends in `finalizeStackResolution` (flush triggers + drain leave events). There are
~13 `pendingChoice` kinds, each with a settler.

### 4.6 Layers (`layers.js`, CR 613)

Continuous effects are derived in CR-613 layer order (7a CDA → 7b set → 7c
counters+mods → 7d switch; plus layer 4/5/6 for types/colors/keywords), memoized
per state object. `gameState.creaturePower/Toughness` delegate here.
`matchesSelector(candidate, selector, state, source)` is the chokepoint for "does
this continuous effect apply to this permanent" — it is **layer-aware** (reads a
permanent's *effective* type/subtype identity, so an animated Treasure is seen as
the creature it became) and handles the special meta-types (changeling matches any
subtype; "outlaw" expands to its five subtypes). A selector carries
`{controllerScope, cardTypes, subtypes, colors, excludeSelf, …}`; `cardTypes: []`
means "all permanents" (vacuous filter).

### 4.7 Mana (`manaModel.js`)

- `manaProduction(card)` → `{colors, amount, sacrifices?, requiresTap?, amountSpec?}`
  or `null`. Resolution: basic-land name → `KNOWN_ROCKS` table → oracle "Add"
  parse → land colorless fallback. **Heavily gated against phantom sources**: a
  triggered/ETB/one-shot "Add" is not a standing source; an unpayable cost
  (non-self sacrifice, pay-life, etc.) is not a standing source; a quoted
  *granted* ability belongs to the recipients, not the granter
  (`stripNonSelfQuotedGrants` — the Cryptolith Rite fix, §6); a "doesn't untap"
  restriction routes the card out entirely (the Mana Vault fix, §6).
- `manaSources(state, player)` → the untapped permanents that can produce now
  (summoning-sickness aware; group-granted abilities via `grantedManaSpecsFor`).
- `planPayment(...)` is a **pure planner** returning exact `{taps, spend}`; the
  dispatcher commits it verbatim. Cost *legality* and cost *payment* always run
  the same planner — the "two-sites invariant" that stops the offered action and
  the executed action from diverging.

### 4.8 Combat, legal choices, the pilot seam

`legalChoices.js` enumerates legal actions (casts, activations, attacks, blocks,
mana taps, pending-choice options). `combatResolution.resolveCombatDamage` handles
the keyword soup (trample/deathtouch/lifelink/infect/toxic/protection/menace),
consults damage replacements, applies commander damage, then SBAs + dies triggers.
`decide({state, legalActions, seat, pilot})` is the **pilot injection point** for
self-play (Omnath's pilots drive it); it validates the returned action against the
offered set with a canonical-key deep compare (`actionInOfferedSet`).

### 4.9 Self-play (`selfPlayRunner.js`, `learnSession.js`, `gameApi.js`)

`learnSession.advanceUntilDecision` is the real driver loop (SBA check →
eliminations → pending-* settlement → turn cap → priority window → `makeDecision`
→ `dispatchAction`, with a progress-signature anti-loop latch). `selfPlayRunner`
builds seeded batches (rotated start seat, optional time pressure) and labels
outcomes **honestly** — a timeout/non-completion gets a `null` label and
`trainingWeight 0`, never a fabricated win. `gameApi.js`
(`legalActions/applyAction/gameStatus/observe`) is the *documented* stable seam,
but today only `gameStatus` has a production consumer (see the parked seam note in
WAKE-REPORT).

---

## 5. THE FULL PATH OF A CARD (worked example)

Take **"Whenever a creature you control dies, each opponent loses 1 life."**

1. **Classification** (`classifyCard`): it's a permanent, not keyword-only, no
   mana ability. `permanentTriggersCovered` runs `detectTriggers` → one trigger
   (condition: a creature you control dies; effect: "each opponent loses 1 life").
   `triggerRoutesNatively("each opponent loses 1 life")` re-parses → one atom
   `{op: "loseLife", who: "eachOpponent", amount: 1}` → HIGH, targets resolvable,
   no combat referent → **native-trigger**. Every other sentence (none) is
   keyword-only ⇒ the card is fully covered.
2. **Runtime** — a creature dies: `checkDiesTriggers` enqueues a pending trigger.
   `flushTriggers` orders it (APNAP), routes it as an `effect-program` payload,
   pushes it on `state.stack`. On resolution, `resolveTopOfStack` →
   `EFFECT_PROGRAM` resolver → `runProgram` executes the `loseLife` atom against
   each opponent → new state, life totals updated → `finalizeStackResolution`
   flushes any downstream triggers.

The **same parse** (`triggerRoutesNatively` at classify time, `runProgram` at
resolve time) is what guarantees the metric's "native" claim matches what the
runtime does. When they *would* diverge, that's a bug (see §6 for the classes we
just fixed).

---

## 6. KNOWN SEAMS & the class of bug to watch for

The whole engine's failure mode is **open-vocabulary recognizers** — a matcher
that Title-cases / singularizes / regex-scans an arbitrary word and quietly
matches nothing (or the wrong thing) while still reporting success. The Fable 5
pass fixed four of these; they are the template for what to look for:

- **Quoted group-grant mana** (fixed): `Creatures you control have "{T}: Add …"`
  read as the granter's *own* mana → phantom source. Fix: strip a quoted grant
  unless the card self-includes in the subject scope (`stripNonSelfQuotedGrants`).
- **Dead selectors** (fixed): "permanents you control have hexproof" emitted a
  `subtypes:["Permanent"]` selector matching nobody, yet counted native. Fix:
  `permanent(s)` → `cardTypes: []` (all permanents).
- **Plural mangling** (fixed): `normalizeSubtype` turned Pegasus→"Pegasu"; now an
  `IRREGULAR_SUBTYPE_PLURALS` table + invariant `-us` handling.
- **Intervening-if fail-open** (fixed): "Plains"→"Plain" scanned nothing → a
  native trigger that never fired. Fix: invariant basic-land types kept verbatim.

**The generalizable rule for any new recognizer: validate an emitted
selector/filter/subtype against a *closed* vocabulary (or corpus reality) before
it counts.** A word you don't recognize should route to the Arbiter (null), never
silently match zero.

Other live seams (documented, mostly benign, listed so you don't rediscover them):
the `land` tier is unconditional (§2.1); resolved instants/sorceries don't reach a
graveyard yet (under-counts GY thresholds — safe direction); commander damage/tax
is keyed by card id (same-commander mirrors collapse); the modal combat-referent
gates iterate top-level atoms only (nil corpus impact today). Full list:
`docs/orchestration/WAKE-REPORT.md` and the per-subsystem scan notes.

---

## 7. THE VERIFICATION GATE — how you prove a change is safe

Three mechanisms, run from `app/`. **Never claim a change is safe without them.**

### 7.1 The test + lint gate

```bash
# from app/ — CRITICAL: do NOT set MTG_APP_ROOT (it redirects paths.js and causes
# ~176 filesystem-test failures that are NOT real). Read "Tests N passed".
npx vitest run          # expect the full suite green (6300+ cases)
npm run lint            # eslint --max-warnings 0
```

### 7.2 The flip-diff (the CREED gate for any engine change)

Any change that can move a card's native status must be flip-diffed **in both
directions**, expecting **LOST = 0** unless every LOST is a deliberate
false-positive removal you can name:

```bash
# baseline (main tree, BEFORE your change) and candidate (AFTER):
MTG_APP_ROOT=<main-tree>/app node scripts/tier-fingerprint.mjs > baseline.tsv
# …apply change…
MTG_APP_ROOT=<main-tree>/app node scripts/tier-fingerprint.mjs > candidate.tsv
# native set = rows whose tier is `land` or matches ^native- :
awk -F'\t' '$2=="land"||$2~/^native-/{print $1}' baseline.tsv | sort -u > base.txt
awk -F'\t' '$2=="land"||$2~/^native-/{print $1}' candidate.tsv | sort -u > cand.txt
comm -23 base.txt cand.txt   # LOST (native → not): audit EVERY line
comm -13 base.txt cand.txt   # GAINED (not → native): audit EVERY line
```

- **`tier-fingerprint.mjs`** dumps `name \t tier` for all real cards, deduped to
  one deterministic tier per *name* (a few names have multi-printing tier
  conflicts — the dedup is what killed the "flip-diff phantom" nondeterminism).
- **GAINED** must each be a *correct* new native (the mechanic is genuinely
  modeled). **LOST** must each be a *correct* FP removal. Anything you can't
  explain is a regression — stop.
- For a **parser.js seam** change (a same-tier op rebind the tier can't see), the
  tier flip-diff is necessary but *not sufficient* — also run
  `program-fingerprint.mjs` (full parser-output diff) and, for mana,
  `runtime-fingerprint.mjs`.

### 7.3 Determinism

`classifyCard` must stay deterministic. Nondeterminism sources are P0: iteration
over a `Set`/`Map` built from unordered data, `Date.now()`/`Math.random()`, locale
string ops, mutation of a shared cache. The corpus double-classification probe
(fresh objects + reversed order) must show **0 diffs**. (The seeded RNG in
self-play is the *only* sanctioned randomness, and it lives in state, not in
classification.)

### 7.4 Coverage metric (the headline number)

```bash
MTG_APP_ROOT=<main-tree>/app node scripts/measure-coverage.mjs   # corpus % + per-deck
```
This is a *dashboard*, not a gate — it reads real profile decks + the oracle
index. It's how you see "did this slice actually move the number", but the CREED
gate is the flip-diff, not the percentage.

---

## 8. HOW TO SAFELY ADD A NEW MECHANIC (the recipe)

Follow this exactly; it is the distilled process every coverage slice used.

1. **Scope one mechanic.** Pick a single, nameable behavior (e.g. "when this
   attacks, create a Treasure"). Find real cards in the corpus that have it and
   *nothing else unmodeled* — those are the ones that can flip. Cards with the
   mechanic *plus* other unmodeled text stay body-only (that's correct).

2. **Decide where it lives:**
   - A new **effect verb/atom** → add an atom module in `effects/atoms/`,
     register it into `CLAUSE_PARSERS`, and add its resolver to `ATOM_RESOLVERS`
     (op name must match). The atom module must NOT import `parser.js`.
   - A new **whole-card shape** → write a `COVERAGE_CLASSIFIERS` classifier
     (`registerCoverageClassifier`) that strips its mechanic's text and requires
     the remainder keyword-only.
   - A new **trigger shape** → a `registerTriggerDetector` in `triggers.js`, and
     make sure `triggerRoutesNatively` accepts its effect.
   - A new **static/anthem** → extend `staticAbilityParser.js` (mind the selector
     vocabulary — §6).

3. **Model the WHOLE thing or PARK it.** If the mechanic has a rider you can't
   model (an opponent choice, an alt-zone, a type-changing layer), either build
   that too or leave the card Arbiter. Never strip-and-ignore a rider — that's the
   forbidden false positive.

4. **Make the metric mirror the runtime.** If the classifier will call the card
   native, the runtime resolver must actually play it. Add/extend the resolver in
   the same slice. For anything mana- or trigger-shaped, route through the shared
   gates (`manaProduction`, `triggerRoutesNatively`) so they can't drift.

5. **Write a colocated `*.test.js`** proving: (a) the target cards classify to the
   intended native tier; (b) a rider-carrying near-miss stays body-only (the CREED
   guard); (c) the runtime resolves it correctly (a small game-state test).

6. **Run the gate (§7):** vitest + lint green, then the flip-diff both directions.
   Audit *every* GAINED and LOST by name. Expect LOST = 0 (or all explained FP
   removals). If a parser seam moved, add `program-fingerprint.mjs`.

7. **Adversarial check.** Before believing a flip, try to *refute* it: quote the
   card's full oracle text and ask "is there any clause this parse drops?" Re-run
   the actual resolver on the card. A flip you can't refute is real; one you can
   is a false positive — park it.

8. **Commit** with a conventional message naming the flip-diff result (`+N native,
   LOST=0`). Integrate ff-only; never force-push.

The golden rule restated: **the number only ever goes up because a card genuinely
became playable — never because a matcher got looser.**

---

*Consolidation pass, Claude Fable 5, 2026-07-01. Keep this current: when you change
a seam, update §6; when you add a tier or gate, update §2/§7.*

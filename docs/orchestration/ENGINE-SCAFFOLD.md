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
| `land` | a Land whose EVERY line is modeled (landFullyCovered) | ✅ |
| `playable-pw` | PW playable but not fully modeled | ❌ (metric) |
| `land-partial` | a Land with unmodeled text (drop + modeled mana still play) | ❌ (metric) |
| `body-only` | has unmodeled non-keyword residue | ❌ |
| `arbiter-spell` | instant/sorcery that isn't HIGH | ❌ |
| `arbiter-pw` | PW that isn't playable | ❌ |

`isNativeTier(tier)` is the authority for "counts as native" (`land` + every
`native-*`; **not** `playable-pw`/`land-partial`/`arbiter-*`). Always use it; never
hardcode the set. **The old caveat is CLOSED (Codex fix #3, 2026-08-30):** the `land`
tier used to be *unconditional* (any type line containing "Land" counted native —
Mystifying Maze as native as a Forest). `landFullyCovered` now vouches every line
through the runtime's own recognizers (allTriggerSentencesModeled · entersTapped ·
per-line manaProduction · parseActivatedAbilities' modeled flag · isKeywordOnly);
anything unrecognized demotes to `land-partial`. Basics, taplands, Karoos, Triomes,
fetches, and modeled-utility lands (Nykthos, Reliquary Tower, Rogue's Passage) stay
`land`; man-lands, conditional taplands, shocks (no pay-life machinery), Channel
lands, and spell//land MDFCs demote. Corpus effect at introduction: 658 of 1,265
nonbasic-text lands demoted; corpus native 41.2% → 39.4% — the honest number.

### 2.2 The classification pipeline (order matters — first match wins)

`classifyCard` dispatches top-to-bottom; the first tier that claims the card wins:

```
1.  Planeswalker?            → castsAsPlaneswalker → loyaltyAbilities tiers
2.  Adventure?               → adventure.js splits faces; BOTH halves must be native
3.  Land (type line)?        → landFullyCovered ? "land" : "land-partial" (Codex #3 — see §2.1)
4.  DFC back-face PW?        → body-only
5.  Instant/Sorcery?         → spellIsNative:
       an {X} in the mana cost that the text never names → not native (the cast offer
       expands X only for a program that reads it — 2026-10-17, Sweep the Skies) ·
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
     → COVERAGE_CLASSIFIERS registry (consulted in registration order — count with
       grep -c registerCoverageClassifier) — doubler, mana-multiplier, kicker, tribute, emerge,
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

`effects/atoms/*.js` (22 modules + colocated tests) each export **pure clause parsers** — functions
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

### 3.4 The parse cache (`effects/parseMemo.js`, added 2026-10-03)

`parseEffectClause(oracle, cardType, { hasX, sourceScoped })` parses each distinct
combination ONCE and hands every caller the same result. Listing legal actions
re-parses every castable spell and every activated ability at every priority
window; before the cache that was 46% of a self-play game's CPU.

**The rule this puts on every caller: a parse result is shared and deep-frozen —
never write to it.** A write throws a `TypeError` (modules are strict mode). To
add a flag to a program or an atom, copy first: `{ ...program, selfExile: true }`.
Unfrozen, a write would silently put one card's flag on every other card with the
same text, in every later game — the freeze turns that into a loud failure.

What keeps one shared result correct:
- **The key names every input.** Clause text, card type and the two boolean
  options. A call outside that exact shape (another option key, a non-boolean
  option, a non-string text) is parsed directly and never cached. **If you add an
  option to `parseEffectClause`, add it to the key in the same change.**
- **The registries are inputs too.** `registerClauseParser` and the two grant-body
  validators (`atoms/grantUntilEot.js`) call `invalidateParseMemo()`. **A new
  injected hook that a parse consults must do the same.**
- **Bounded:** 16,384 entries, oldest evicted first — a corpus classification run
  parses far more texts than that and stays flat.

Still uncached (measured after the cache, share of self-play CPU): `classifyCard`
from the cast offer ~7%, `parseActivatedAbilities` ~7%, `parseEffectProgram`'s own
strip chain ~5%, `detectTriggers` via granted triggers ~3%. Those take a card
object, so each needs its key audited field by field before it can be cached.

**A second, smaller memo of the same kind (2026-10-04): `combatEvasion.memoByCardText`.**
The block gate's text readers (`selfOracle`, `groupBlockRestrictionOf`) are pure in
the card's name and rules text and are asked for every blocker of every attacker on
every tick; on a 389-attacker turn they were three quarters of the game. The key is
the two STRINGS (name, then text), never the card object, so a card whose text
changes reads its new text; a stored value must be a string, null or a frozen
object. Use the same helper for another reader in that file only if it reads
nothing but those two fields. On that wide board the next cost is `detectTriggers`
(43%), re-read for every permanent on every event.

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
resolution; anything unmodeled → `manual` (Arbiter no-op). Targets are chosen by
`chooseTriggerTargets` (the α1 chooser, both seats — a trigger has no human target
prompt) on the side each effect intends; when every legal target is on the wrong
side, a MANDATORY ability still takes the least harmful one (CR 603.3d — Man-o'-War
alone returns itself; logged `trigger-target-forced`), and an optional one is
declined as the Arbiter no-op (logged `trigger-no-safe-target`). The forced pick
(`pickForcedTriggerCandidate`) ranks a harm the target survives first — a creature
that lives through the damage or the until-end-of-turn -X/-X (both end at cleanup,
CR 514.2), a tap of a permanent already tapped (costs nothing) — then the least
valuable (2026-10-17). The AI's cast picker runs the same flush in advance:
`gameEngine.entersTriggerRemovesOwn` puts the permanent on a copy of the board, fires
its enters triggers through `checkEnterTriggers` and routes each with
`buildTriggerStack` + `chooseTriggerTargets`; `opponentAI.pickCastAction` holds the
card when a trigger would be forced to remove the AI's own permanent or spell
(Man-o'-War with no opposing creature, Mystic Snake over its own spell). Policy key
`etbHold`.

`triggerRoutesNatively(effectClause)` is the **shared gate** used by *both* the
metric (coverage's `native-trigger`) and the runtime flush — it re-parses the
effect and requires HIGH + resolvable targets + combat-referent satisfied + a
strict intervening-if vocabulary. Single source of truth ⇒ the classifier can't
claim native for a trigger the runtime would drop.

**Event disjunctions split; the dealer can be the triggering creature (2026-10-17).** One ability with two trigger events
("enters or attacks", "enters or dies", "enters or leaves the battlefield", "attacks or blocks", "enters or is put into a
graveyard from the battlefield" — CR 603.2b) is rewritten by `splitCompoundTriggerSentences` to one sentence per event, each
carrying the whole effect; `compoundTriggerCount` counts each split so an unread half parks the card. A new disjunction is one
regex beside its siblings plus its count — only when the two events are disjoint and each half already classifies alone
(Ichor Wellspring's graveyard half is the self-PiG `ltb` event, graveyard exits only). A damage payoff whose DEALER is the
trigger's triggering creature carries `damageSource: "triggering"` (the deal-damage resolver reads that creature's keywords,
and `gameState.stampTriggeringLki` keeps its record if it leaves before the trigger resolves — add the sentinel to
`TRIGGERING_LKI_CLAUSE_RE`, and the event to the `damageSource` pin in `triggerRouting`): the entering creature (Warstorm
Surge), the turned-up creature (Pyrotechnic Performer), and the creature that was dealt damage (Brash Taunter's family — "it
deals that much damage to …" on the self dealt-damage event, the amount `ctx.dealtDamageAmount`).

**A referent is a scope-gated sentinel (2026-10-17 — the opponent's land, the damaged player's artifacts).** "That player" names
a different player on every event, so it is never parsed raw: `detectTriggers` rewrites it, gated on the event AND scope that
bind the referent, to a phrase no printed card uses, and only an atom arm reads the phrase. The landfall event now has the
scopes `landOpponentControls` / `nonbasicLandOpponentControls` ("Whenever a [nonbasic] land an opponent controls enters" —
Archaeomancer's Map, Polluted Bonds, Sire of Stagnation, Spectrum Sentinel): "that player" → "the triggering permanent's
controller" (`ctx.triggeringPermanentController`, bound by `makePendingTrigger` off the entered land), in the effect and in the
intervening "if" (interveningIf reads "the triggering permanent's controller controls more <lands|…> than you"; its parse probe
carries the key). On `combatDamageToPlayer`, "gain control of all artifacts that player controls" → "… the damaged player
controls" → `gain-control-all` (control.js: every permanent of the card type the damaged player controls as it resolves, through
`controlMove.moveControl`; an Equipment stays on its host, CR 301.5d). A new sentinel: rewrite only on a scope no other reader
keys on (or anchor the whole clause), add the atom arm, and add the `who` to coverage's `REFERENT_WHOS` fence if it is new.

#### 4.4b Trigger classes beyond the event trigger (added 2026-07-25)

Three kinds of trigger do NOT fire off a discrete event, and each has its own lane:

- **DELAYED triggers (CR 603.7)** — `effects/atoms/delayedTrigger.js`. "At the beginning of the next
  end step, sacrifice it." `applyScheduleDelayed` pushes a plain-JSON record onto
  `state.delayedTriggers`; `drainDelayedTriggers(state, step, activePlayer)` returns
  `{state, fired}` shaped like pending triggers, so the ordinary flush handles them. Records are
  serializable on purpose — self-play trajectories round-trip through JSON.
  ⚠️ The matcher must split the IMMEDIATE half from the delayed half: a greedy match folded a spell's
  own draw into the delayed clause and would have deferred it.
- **STATE triggers (CR 603.8)** — `checkStateTriggers` in `triggers.js`, run from the CR 704.3 SBA
  fixpoint in `sba.js`. "When you control no Islands, sacrifice this creature" is a continuously-checked
  CONDITION, not an event. ⚠️ The fixpoint runs several times per priority window, so the condition
  carries an arm/disarm LATCH on the permanent (`_stateTrigArmed`) — without it every pass enqueues
  another copy. It re-arms only after the condition goes false, exactly as 603.8 requires.
- **SYNTHESIZED keyword triggers** — renown, bloodthirst, evolve, undying, monstrosity. The rules live in
  REMINDER text, so `detectTriggers` synthesizes a descriptor with a kind-tagged sentinel `effectClause`
  that exactly one clause parser models. ⚠️ `detectTriggers` reconstructs descriptors from a FIELD
  WHITELIST — an unknown field is SILENTLY DROPPED. That has cost three separate slices; add the field
  to the whitelist in the same edit that introduces it.

Two per-permanent LATCH flags follow the same one-shot convention and live inside the atoms, never as
intervening-ifs (a fail-open board read would re-fire unboundedly): `renowned`, `monstrous`.

#### 4.4c Per-turn ledgers

- **`damageTakenThisTurn`** — tallied at the loseLife chokepoint ONLY when its `combatDamage` flag is
  defined, so a drain or a pay-life cost can never satisfy bloodthirst.
- **`activatedOncePerTurn`** — the activation-limit ledger, `{ turn, n }` keyed `permId:rawLine`. An
  ability carries `activationLimit` (a COUNT, 1 for the "Activate only once each turn" frame); the offer
  gate refuses at `used >= limit` and the dispatcher increments, restarting when the stored turn is
  stale. ⚠️ `>=` not `>`: off by one hands out a free activation, an engine more permissive than the card.

### 4.5 Resolution (`resolvers.js` + `effects/runProgram.js`)

`RESOLVERS` maps a resolver key → a `(state, params) => state` function.
`PERMANENT_ETB` runs `enterPermanent` (enters-with-counters replacements, clone
pause, tribute, chosen-type); `AURA_ETB` re-checks its target; `SPELL_NOOP` →
`markPendingArbiter`. (STRUCTURE wave: the dead Phase-1 lanes are gone —
`SPELL_EFFECT`/`ACTIVATED_EFFECT` deleted outright, zero emitters ever;
`TRIGGER_EFFECT` is a deprecated key resolving as `manual`, kept one release for
serialized saves — triggers now emit a manual payload that `buildTriggerStack`
upgrades to `EFFECT_PROGRAM` when faithfully resolvable.) The `EFFECT_PROGRAM` resolver runs `runProgram` — an
**all-or-nothing atom interpreter**: it executes atoms in order and, when an atom
needs a player choice (tutor, scry, edict, mode, divide damage…), it **pauses**
onto `state.pendingChoice` with a `resume` continuation. The driver
(`learnSession`) surfaces the choice, gets an answer, and resumes; each settlement
ends in `finalizeStackResolution` (flush triggers + drain leave events). There are
**20** `pendingChoice` kinds, each with a settler — `PENDING_CHOICE_KINDS` in
`pendingChoice.js` is the canonical vocabulary (contract-pinned by
`pendingChoiceKinds.test.js` + `omnathSeam.test.js`; the PLAY-API-CONTRACT list is
informative, the export is truth).

**"If you do" after a sacrifice, and the reflexive behind one** (`ifSacrificed`; the reflexive half 2026-10-17): an atom
flagged `ifSacrificed` runs only when the atom before it logged a real sacrifice victim (`realSacrificeIn`), and a run of them
shares the gate. `parser.matchReflexiveTrigger` tags a "When you do, …" reflexive with it when the primary is a lone
self-sacrifice ("sacrifice this permanent" — the SNC family fetch lands, Smoke Bomb): a source that left the battlefield can't
be sacrificed (CR 701.21a), so the reflexive doesn't trigger (CR 603.7). A pay-or-sacrifice primary (`sac-unless-pay`) folds no
reflexive at all. When a gated atom pauses (a search), the resume records `sacrificeGateOpenAt` — the index the gate is open for
— and `resumeAfterChoice` hands it back as `prevSacrificed`, so "…then shuffle and you gain 1 life" still runs after the pick; a
settler that copies the record onto another index can't carry it. On a land, the reflexive sentence the trigger strip leaves as
its own line is admitted by `landFullyCovered` only when it is the reflexive a detected (natively routing) trigger folded.

**Entry replacements** (`enterReplacements.js`, 2026-10-02): `applyEnterReplacements` (enters tapped, the
counters a permanent enters with, the as-enters choices: chosen creature type, colour, card type) and
`settleEnterReplacements` (the shockland's life payment, the CR 122.6 counter events, riot's haste, Fabricate's
Servos) are the ONE reader both entries share: `resolvers.enterPermanent` (a permanent spell resolving; it passes
the cast facts: X, kicks, colours spent) and `zones.enterCardFromZone` (every put, reanimation, blink return and
mass return; a permanent that wasn't cast has X = 0). A one-event entry (Living Death, Rise of the Dark Realms,
Genesis Wave, a multi-pick put) passes `replacementState`, the board as the event began (CR 614.12). A new
"enters with" / "as this enters" ability goes in this leaf, never at an entry site.

**An Aura entering without being cast** (2026-10-16, CR 303.4f/g): `enterCardFromZone` attaches it as it enters —
to `attachTo` when the effect names the host ("…attached to that creature": Dragon Fangs, Mantle of the Ancients),
else to the host `auraEntry.enteringAuraHost` gives on the board it is entering (`replacementState` for one card
of a larger event, so never a permanent entering with it). Nothing is targeted (hexproof doesn't matter; the Enchant
line, protection and "can't be enchanted" do). No legal host, or an Enchant line `staticAbilityParser.auraEntryHostSpec`
can't list (a Curse, Animate Dead), and it stays in its zone (`entered: false`, logged `aura-stays`). Every seat the AI
plays takes the house pick (`chooseAuraEntryHost` — the cast side's `auraCastIntent`). A blink exiles every target,
then returns them as one event (`enterCardsTogether`). `sba.js` puts an Aura attached to nothing into its owner's
graveyard (CR 704.5m) — a Curse (`enchantedPlayerId`), Animate Dead before its trigger (`enchantedGraveyardCard`) and a
bestowed creature are attached to something, and exempt.

**A person chooses** (the `aura-entry-host` pause, 2026-10-16): a seat in `state.humanSeats` (`createLearnSession`
stamps the user seat below Expert) picks the host itself, and no entry site handles the pause. The step that enters
the Aura runs inside an ASK — every atom `runEffectProgram` resolves (`resolveAtomAsking`, its loop and the optional
settle) and the settles that enter a card (`learnSession.settleAskingAuraHost`: tutor, dig, milled pick, clone).
Meeting a person's Aura with two or more legal hosts and no answer, `enteringAuraHost` records the question and lets
the step finish on the house pick; the ask throws that run away, pauses on the state the step began from, and the
settle (`runProgram.resolveAuraEntryHostChoice`) re-runs the step with the answer — again for the next of that
person's Auras in the same event. Exact because the engine is: ids from `state.idSeq`, shuffles from `state.rngSeed`,
no entry mutates its input. A new road onto the battlefield needs nothing for this beyond deciding its host through
`enterCardFromZone` or `enteringAuraHost` (never `chooseAuraEntryHost`, which a simulation reads and never asks)
inside an atom or one of those settles; anywhere else a person's Aura takes the house pick.

**Where an Aura enters without being cast** (2026-10-16, the withholdings lifted one slice each): the mass return
(`zones.applyMassReanimate` — one event, Retether's "only creatures" as a host option), the battlefield search
(`library.applyTutor`), the milled pick (Mole Module), a token copy (`tokens.applyCreateTokenCopy` — chooses at creation;
with no host the token isn't created, CR 303.4g), the delayed blink's return (Flickerwisp), the detain return
(`applyDetainReturn`) and a clone copying an Aura (`resolvers.resolveCloneChoice` — with no host the clone spell goes to the
graveyard). Each runs through the same chooser; an effect's own limits are host options of `auraEntry.auraEntryHosts`
(`onlyCreatures`, `excludeIds`, `presentIds` — the detain return's CR 610.3d board), passed as `enterCardFromZone`'s
`auraHostOpts`. An offer that would otherwise put an Aura nowhere reads `auraEntry.auraEntryHasHost` (the search, the milled
pick, a clone's candidates); a targeted pool keeps an unlistable Enchant line out with the `auraEntryModeled` restriction. A
Role never chooses a permanent already carrying a Role of its controller (narrower than CR 303.4f allows, on purpose: the check
below would discard one of the two).

**One Role per player per permanent** (2026-10-16, CR 704.5y): `sba.js`'s `sweepRoleUniqueness` keeps, of the Roles one player
controls on one permanent, only the most recently attached and puts the rest into their owners' graveyards (a token ceases to
exist there, after its leaves triggers — the Wicked Role's drain fires). Role tokens carry no `timestamp`; the order is the host's
`attachments` list, which `gameState.attachPermanent` (where every attachment is formed) keeps in attach order — CR 613.7e's new
timestamp on attaching. "A Role" is one reading, `auraEntry.isRoleCard`. Witness: `roleUniqueness.test.js`.

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
means "all permanents" (vacuous filter). Two selectors read the SOURCE permanent's as-enters choice: `chosenTypeOfSource`
(its `chosenType`) and `chosenColorOfSource` (its `chosenColor`, matched through the layer-aware colour gate — Heraldic
Banner, 2026-10-17). `parseStaticAbilities` drops either descriptor when the card prints no chooser the enter site stamps
from, so a chosen-X line without its chooser parks instead of reading native while touching nobody. The same holds for the
others-enter-with replacement's chosen-type form (Metallic Mimic — `othersEnterWithCounters` returns `chosenType: true`
only beside `choosesCreatureTypeAsEnters`, the one chooser regex the enter site reads too).

### 4.7 Mana (`manaModel.js`)

- `manaProduction(card)` → `{colors, amount, sacrifices?, requiresTap?, amountSpec?}`
  or `null`. Resolution: basic-land name → `KNOWN_ROCKS` table → oracle "Add"
  parse → for a land whose whole-card parse failed, its plain "{T}: Add …" line read alone, else its basic land types' own
  mana (CR 305.6) — **no {C} fallback** (2026-10-17, below). **Heavily gated against phantom sources**: a
  triggered/ETB/one-shot "Add" is not a standing source; an unpayable cost
  (non-self sacrifice, pay-life, etc.) is not a standing source, and a
  self-sacrifice counts only as the cost's WHOLE non-mana part (a discard beside
  it — Lion's Eye Diamond — refuses, `manaCostModelable`); a quoted
  *granted* ability belongs to the recipients, not the granter
  (`stripNonSelfQuotedGrants` — the Cryptolith Rite fix, §6); on a nonland, a
  "doesn't untap" rider routes the card out, except the continuous self lock
  (Mana Vault, Basalt / Grim Monolith): that card produces once and stays tapped —
  the untap step enforces it (`cardSelfPreventsUntap`), and `manaSources` stamps
  its records `staysTapped`.
- **A mana line no record can honour is dropped before the parse (`manaLineRefused`, 2026-10-17).** Per line, ahead of every
  reader in `manaProductionImpl` (lands included, so a refused only-line makes nothing): a
  loyalty ability (CR 606.2, 605.1a — "+1" is no cost a record pays), an ability quoted inside a sentence (the colon behind a
  trigger or an effect — Roxanne's Meteorite, Old-Growth Troll's Aura grant), an ability with a target (CR 605.1a — Deathrite
  Shaman; since 2026-10-17 such a line, when its effect parses HIGH, is an ordinary STACK ability instead —
  `abilities.parseActivatedAbilities`' `targetedAdd`: offered with its target, its add-mana atom run as it resolves, never a
  planner source), an "If …," or "For each …," sentence ahead of the add (the vivid bundle excepted — Selvala, Explorer
  Returned), or a cost item outside the positive list `PAID_MANA_COST_ITEMS` ({T} and pips, a self-sacrifice, "Pay N life",
  tap-other, "Sacrifice a creature", "Sacrifice a Food", exile from graveyard, exile from hand, the storage and no-{T} counter
  removals, a land's single-counter removal and Wall of Roots' -0/-1 counter; {Q} absent). A new cost rider goes on the source
  record, in `tapRecordFor` AND in `PAID_MANA_COST_ITEMS` — otherwise its line makes nothing. A "Sacrifice a <kind>" cost is one
  victim kind behind `sacVictimTest` (`sacrificesCreature` — the Altars, Phyrexian Tower; `sacrificesFood` — Gilded Goose,
  2026-10-17): the offer gate, `withoutUnfeedableSacSources`, the one-shot planner pass and the commit (least valuable victim,
  sacrificed last in the plan) all read it; a new kind is one predicate there plus its flag on the record. **One victim per cost
  (2026-10-17):** the record carries its eligible victims (`sacVictimIds`, narrowed by `withoutUnfeedableSacSources`); the planner
  taps a sacrifice source only while every sacrifice of the payment can still get a DISTINCT victim (`assignSacVictims` — a
  self-sacrificing tap's permanent leaves every list; a source that is another's victim pays first; the costed path's calls share
  one claim list), canAfford with it, and a failed plan with contention is retried once without each contended record; the commit
  assigns the same way on the live board and pays the sacrifice BEFORE it adds the mana (CR 605.3, 602.2b, 601.2h, 605.3b) — no
  victim, no mana. Two Altars beside one creature make one mana, not two. **The same for every consumed cost (2026-10-17, the
  follow-up):** "Exile a card from your graveyard" (Molt Tender, Rubble Rouser — `gyExileIds`, a distinct card each, the oldest the
  action doesn't need) and "Pay N life" (31 bundled lines — `lifeAvail`; the payment's life costs together keep at least 1 life, the
  per-source policy for the whole payment, CR 119.4; none under a life lock, CR 119.8) are claims beside the sacrifice victims (`consumedClaimsPayable`), checked
  and paid before the mana in commitManaTap. `costReservedPermanentIds` also names the graveyard cards an action needs (the card
  cast from the graveyard — on the stack, CR 601.2a — the card whose graveyard ability is activated, the cards its cost exiles);
  `activationPaymentSources` / `graveyardActivationPaymentSources` are the payments' source derivations, and the offer
  (`withPayableConsumedCosts`) asks them whenever a consumed-cost source lists something the action's own cost needs.
- **Counter costs, no-{T} lines and per-turn limits (2026-10-17).** The two counter-cost lines a record pays are admitted only in
  their whole anchored line (`LAND_COUNTER_MANA_LINE_RE`, `PUT_COUNTER_MANA_LINE_RE` — manaLineRefused refuses the cost item in any
  other line): "{T}, Remove a <charge|mining|depletion> counter from this land: Add …" (`removesCounters` mode `"one"`: one
  counter per activation, no source with none left; Gemstone Mine and the depletion lands carry `sacrificeIfNoCounters`, the
  ability's own "if there are no … counters on this land, sacrifice it", followed by commitManaTap after the mana — CR 605.3b,
  608.2c — through `sacrificePermanentForCost`, since no resolution finalizer runs after a mana ability; beside a plain line — the
  Vivid lands, Tendo Ice Bridge, Mirrodin's Core — the counter line leaves the whole-card parse and rides as an extra record) and
  Wall of Roots' "Put a -0/-1 counter on this creature" (`putsCounter`, put on through `addCounter`). **A line with no {T} in its
  cost carries `noTap`** (every one, not only the per-counter records): commitManaTap never taps its source and fires no
  tapped-for-mana watcher (CR 107.5, 106.12); manaSources offers it while the source is tapped; the explicit tap offers it
  (only a no-{T} counter source's per-counter `repeatable` records stay planner-only) and the dispatcher takes it tapped; the
  "tapped for mana" boosts (`landAuraManaBonus`, `globalTapManaAugment` — Kinnan) never ride it. **A printed per-turn limit**
  (`manaActivationLimit`: once each turn, Vivi Ornitier's "only during your turn and only once each turn", "no more than twice /
  three times", the "four or more times … sacrifice" rider read as three) rides the product as `activationLimit`, keyed into the
  activated abilities' own ledger `state.activatedOncePerTurn` (`permId:line` → `{ turn, n }`): manaSources reads it, commitManaTap
  (via the record's `limitKey`) stamps it. A new no-{T} mana line with any other "Activate …" rider needs an arm there first —
  without the tap nothing else holds it back.
- **"Instead" riders, timing gates, nonland counter costs (2026-10-17 evening).** A mana line "Add <base>. If <condition>, add
  <upgrade> instead." (or "…, instead add …") is parsed with the rider stripped and carries `insteadUpgrade` { condition,
  product }; `withInsteadUpgrade` (manaSources and `landsCouldProduce`) makes the upgrade while the condition holds, as the
  ability resolves (CR 605.3b). Conditions read (`parseInsteadCondition`): `controlsEach` (land-type phrases are subtypes —
  Urza's Tower; capitalised non-type phrases are names — Command Mine), `playedLandThisTurn` (own turn only, CR 305.3 — River
  of Tears), `selfCounter` (Gemstone Caverns, Incubation Druid), and since the 10-17 honesty slice `controlsEach` over
  creature names (Tower Worker — "creatures named Mine Worker and Power Plant Worker") and `interveningIf` — any condition
  `evaluateInterveningIf` decides, read through it (Leafkin Druid's creature count, Raucous Audience's and Ilysian Caryatid's
  power-4 creature; consulted only after the other kinds read nothing). Any other condition keeps the base and stamps
  `insteadUnread`, which `landFullyCovered` AND the native-mana tier refuse (A-Town; a nonland was credited native-mana with
  it until 10-17). A new condition gets a parse arm and an `insteadConditionHolds` case together. An "unless <a player does
  something>" on the add (Rhystic Cave, CR 118.12a) is refused by `manaLineRefused` — no record holds another player's choice.
  `colorsAmongSpec` kind `permanentsYouControl` reads Meteor Crater. `manaActivationLimit` also reads "Activate only during an
  opponent's turn" (`opponentsTurnOnly`, no count — Lavinia); `manaLimitAllows` is the one gate. `ONE_COUNTER_MANA_LINE_RE`
  (was LAND_COUNTER_MANA_LINE_RE) admits the {T} single-counter cost on an artifact or creature (charge, book, -1/-1 — Sphere of
  the Suns, Spell Satchel, Channeler Initiate); the no-{T} per-counter reader takes Mana Bloom's "Activate only once each turn",
  and manaSources caps its records at the activations left (a capped single record is offered by hand).
- **No mana from an unreadable land line; the land gate credits only lines the runtime makes (2026-10-17, the land {C}
  fallback).** The last arm of `manaProductionImpl` used to make {C} for any land whose text says "add" but whose line didn't
  parse — wrong in play (Crypt of Agadeem made {C}; Gem Bazaar, Cryptic Spires, the two name-chooser Crossroads made a {C} they
  can't) and credited by `landFullyCovered`, which read each line through the same parser (Cabal Stronghold, Urza's Workshop,
  Cascading Cataracts, Baldur's Gate, Nykthos, Great Hall of the Citadel, Sunken Citadel, every chosen-colour land). Now a land
  whose whole-card parse fails reads its plain line (`PLAIN_MANA_LINE_RE`) alone, else its basic land types' mana (CR 305.6 —
  Fabled Path of Searo Point {R}), else nothing. On a land, a plain line is the main product beside a count line
  (`honestMultiLineMain`'s land count-main swap), and the count line rides as an extra record behind its mana cost
  (`COSTED_COUNT_MANA_LINE_RE`: the "{X} for each …", "X mana of any one color, where X is …" and "N mana in any combination"
  forms, an ability word and an "Activate only if" gate allowed); Nykthos' devotion line rides as five records, one per colour
  (`DEVOTION_TO_CHOSEN_MANA_LINE_RE`, countForSpec's devotion). New counts: `basicSubtypeYouControl` (CR 205.4c),
  `creatureCardsOfColorInGraveyard`, "<land type> land(s) you control", "other <subtype>s you control" (excludeSelf), "storage
  counter on this land"; `landsCouldProduce`'s `subtype` (Plaza of Harmony's Gates). The planner tries a permanent's several
  costed records best first and retries each alternative (`costedActivationOrders`), and its generic tap takes a permanent's
  biggest plain colourless line when nothing covers the cost. `landFullyCovered` reads lines through `landLineMana` (the card's
  extra records, the line alone, or the chosen-colour line of a chosen-colour main). Witness: `landManaFallback.test.js`.
- **A land's line read alone counts only when the main product makes it; the lines it hid are extra records (2026-10-17, the
  land lines).** `landLineMana`'s single-line arm now asks `mainMakesProduct` (every colour the main's, no more mana, no cost or
  gate the main has that the line lacks, the same mana cost) — 54 single-faced lands had been credited on a line no record made.
  Land-only extra readers in `extraManaLineProducts`: `BUNDLE_CHOICE_MANA_LINE_RE` (the filter lands — one record per bundle,
  `fixed`, behind the hybrid `activationCost`, named by `bundle`; the planner tries each bundle first in turn), `COSTED_MANA_LINE_RE`
  (a mana-costed colour / any-colour / commander-identity line beside a plain one, with a known `spentRider` — Opal Palace's
  `commanderCounters`, Guildmages' Forum's `multicoloredCreatureCounter`, made at the cast site as enters-with counters),
  `MAX_SPEED_MANA_LINE_RE` (`requiresMaxSpeed`), `PAIN_PAIR_MANA_LINE_RE` (Murmuring Bosk), `OPPONENTS_GAIN_MANA_LINE_RE` (Grove of
  the Burnwillows — `opponentsGainLife`, paid by commitManaTap through gainLife), `LAND_EXTRA_MANA_LINE_RE` (coloured / gated
  pay-life, sacrifice-a-creature, The Grey Havens' graveyard colours, four restricted lines). `extraLineSources` carries and gates
  them (a creature to sacrifice, Max speed, a board-derived set narrowed live, damage, life gain, the rider, the bundle). The
  explicit tap offers a permanent's extra lines for what no earlier record of it offers (key: permanent + colour, or the
  `bundle`; the dispatcher matches both). parseAddClause: the free any-colour arms read only an unqualified "any color" (Artist
  Alley, Reflective Gate, The Big Top, Paliano, Blustering Barnyard make nothing from their joke/priced sets); a painful pair or
  painful any-colour line read alone keeps its damage; a land's triggered "add" is not its tap (Crumbling Vestige, Branch of
  Vitu-Ghazi). parseSpendRestriction: "a X spell or a Y spell" is one list (Maelstrom — `omen`, CR 205.3k), "a spell that has
  <keyword>" is `castKeywords` (Brotherhood Headquarters — freerunning). ⚠️ The planner pays a {C} pip from a permanent's first
  colourless record (tapForColor), so a land with a bigger second {C} line (Muraganda Raceway at max speed) pays its
  {C}{C} toward generic but not toward two {C} pips — an under-read. Witness: `landLinesMade.test.js`.
- `manaSources(state, player)` → the untapped permanents that can produce now
  (summoning-sickness aware). Granted mana abilities are counted by ONE read,
  `withGrantedMana`: a permanent with no mana ability of its own takes the granted spec
  WHOLE (`grantedManaSpecsFor` → `grantedManaProduction`, its `sacrifices` and a
  no-{T} cost's `requiresTap:false` included — Basal Sliver's grant is a one-shot
  sacrifice, never a repeatable tap). Never rebuild a granted record field by field.
- **A land grant is a choice on the land's one tap (2026-10-17, Chromatic Lantern).** "Lands you control have \"{T}: Add …\""
  emits a layer-6 mana grant (selector: the controller's Lands) only for a plain one-mana {T} spec, marked `asChoice`;
  `withGrantedChoice` merges its colours into a land's own plain one-mana {T} line (`isPlainOneManaTap` — colours, amount 1,
  {T}, per-colour pain; a granted colour leaves `painColors`), so a Forest beside the Lantern taps once, for any colour. A land
  with no mana ability takes the grant whole; any other own line (Ancient Tomb, Gaea's Cradle, Mana Confluence, Command Tower)
  keeps itself alone — an under-offer.
- **Tap-other extra lines and one tap per permanent (2026-10-17, Relic of Legends).** A no-{T} "Tap an untapped <filter> you
  control: Add …" line printed after a {T} line rides as an extra record (`TAP_OTHER_NO_TAP_MANA_LINE_RE`; payers by
  `tapOtherPayers`, the main product's reader; "legendary creature" is a filter); a tapped permanent still reaches its no-{T}
  extra lines (`extraLineSources`); the explicit tap offers such a line when no earlier record of its permanent makes that
  colour (one option per permanent and colour). In the planner a no-{T} record doesn't share its permanent's {T}, and every
  permanent a tap taps (its source, its payers) can't pay a {T} record or be another record's payer afterwards — before
  this, Springleaf Drum beside a lone Llanowar Elves paid {2}. **On a land, the {T} form too** (10-17 honesty slice,
  `TAP_OTHER_TAP_MANA_LINE_RE` — Holdout Settlement, Survivors' Encampment, Scene of the Crime): a land returns from the
  activated-source branch before the tap-other reader, so `manaProductionImpl` takes the line out of the whole-card parse
  beside another mana line (it rides as an extra record with `extraTap`) and reads it with its payer as the land's only line.
- **The explicit tap reads the planner's records (2026-10-16).** `manualManaTaps` is
  the explicit tap's only source: `legalChoices.actionsTapForMana` offers its options
  and `actionDispatcher.applyTapForMana` re-derives the one taken from it (never from
  the action's fields). It reads `manaSources`, so every gate (an "Activate only if"
  condition, life, payers, an Altar's victim, a graveyard card, Max speed, a colour set
  read off the board) holds on both paths; each option is the tap record the planner
  would commit, built by the ONE builder `tapRecordFor` (planPaymentCore's `tapSource`
  calls it too) — so a new cost rider goes on the source record and in `tapRecordFor`,
  and both paths pay it. By hand it skips hand cards, a no-{T} counter source's per-counter records,
  spend-restricted mana and "when that mana is spent" riders (floating mana keeps
  neither), and a permanent's extra mana lines. Before this, the explicit tap rebuilt
  production from `manaProduction` and paid only a self-sacrifice: Ashnod's Altar made
  {C}{C} with no creature sacrificed, Mox Opal tapped without metalcraft.
- **A colour set read off the board (`colorsAmongSpec`, 2026-10-16).** `parseAddClause` stamps the spec and a five-colour
  placeholder; `manaSources` narrows it through `colorsAmongFor` (one switch, an unknown kind is empty) and drops the main
  record when the set is empty. Kinds: Plaza's legendary permanents, Mox Amber's legendary creatures and planeswalkers, the
  controller's commander's color identity (`commanderIdentity.commanderColorIdentityOf` — none or unknown makes nothing, CR
  903.4f), and the "could produce" lands (`landsCouldProduce`, CR 106.7 — the controller's or its opponents', `basicOnly`,
  `colorsOnly`; a land whose own set is board-derived is skipped, except a Command Tower's identity). A new "any color …
  <qualifier>" line gets an arm here, never the free any-colour arm.
- **Damage on a mana line rides `painColors`** (`painAmount`, optional `painCondition` read live — Tomb of Urami): every tap
  that makes a painful colour deals it, the planner's and the explicit one (tapRecordFor → `painLife` → commitManaTap). A
  painful source is never "plain colourless" in `tapAny`, so Ancient Tomb is not tapped first for generic.
- `commitManaTap` pays the costs a tap carries; a permanent sacrificed to a mana
  cost (the source itself, or an Altar's victim) leaves through
  `costSacrifice.sacrificePermanentForCost` — THE cost sacrifice, the one every
  activated-ability, additional, alternative and emerge cost in `actionDispatcher`
  calls too (2026-10-16: the two copies had drifted), so a creature dies through
  `gameState.deathLookback` like at every other death site, a replaced death is
  logged, and the leave event drains before the sacrifice watchers. The engine's
  own sacrifices outside a resolution call it too (2026-10-17): the Fading /
  Vanishing upkeep (`fading.applyFadeVanishUpkeep`) and the finished-Saga
  state-based action (`gameEngine.sweepFinishedSagas`). A sacrifice during a
  resolution is `removal.sacrificeCreatureEffect` (one permanent) or
  `sacrificeCreaturesTogether` (one event — the mobilized Warriors,
  `removal.applyMobilizeSac`). Every one of them, and the legend rule, sends a
  planeswalker that is no creature to `checkPlaneswalkerDiesTriggers`. A new
  sacrifice site calls one of these three; it never moves the card by hand.
  **A group one instruction sacrifices is ONE event (2026-10-17, CR 603.2c):**
  the batch sequence lives in `costSacrifice.sacrificePermanentsTogether` (every
  look-back read first, one dies batch, one leave drain, then each sacrifice's
  watchers); `sacrificeCreaturesTogether` wraps it with the effect log, and a
  cost of N permanents is `costSacrifice.sacrificePermanentsForCost` (Tooth and
  Claw, Bankrupt in Blood, "Sacrifice N <subtype>", Pulverize's two Mountains).
  A loop of single sacrifices over a group fires a "one or more" watcher once
  per member — the minted-token end-step sacrifice (`removal.applyMintedLeave`)
  did exactly that. **The edict chain chooses, then sacrifices together
  (2026-10-17, CR 101.4):** `removal.advanceSacrificeChain` locks each pick in
  (a forced one too; a chosen permanent leaves its controller's pool), the
  sacrificers choose in APNAP order (`apnapOrder` — the active player first,
  whoever controls the spell), and when the instruction's choices are done the
  chosen permanents go through `sacrificeChosen` (one → the single sacrifice,
  more → `sacrificeCreaturesTogether`). The pause carries them as
  `pendingChoice.chosen`; `runProgram.resolveSacrificeChoice` locks the answer
  in and re-enters. A queue entry's `group` ends one instruction inside one
  chain — annihilator's separate triggers (CR 702.86b) — and that group's
  permanents go before the next group's first choice. The batch log entry
  carries `victims` (each one's controller, card types, power); a reader of
  "the permanent you sacrificed" goes through `shared.sacrificesByIn`, never
  `effect === "sacrifice"` alone. **The iterated-edict chain does the same, one
  round at a time (2026-10-17):** `iteratedEdict.advanceEdictChain` (Torment of
  Hailfire's rounds, Braids, Arisen Nightmare's opponents) asks the opponents in
  `apnapOrder`, locks each answer in (`lockInEdictPick`; a forced "life" too) —
  the pause carries them as `pendingChoice.chosen`, a queue entry's `round` ends
  one round — and `settleEdictRound` carries a round out once its last opponent
  has chosen: the discarded cards move first (a graveyard replacement of a
  permanent sacrificed in the round still applies), the sacrifices go as one
  event (`sacrificeChosen`), then the discard watchers and the life losses
  (Braids' draws with them) — after the sacrifices, so a permanent that left
  in the round never sees them (CR 603.10a). Each round is its own event
  (the bundled Torment rulings; CR 608.2c). A queue entry without a `round` (a
  pause saved before) is its own round.
- `planPayment(...)` is a **pure planner** returning exact `{taps, spend}`; the
  dispatcher commits it verbatim. Cost *legality* and cost *payment* always run
  the same planner — the "two-sites invariant" that stops the offered action and
  the executed action from diverging. Generic is paid last and colorless first
  (`GENERIC_SPEND_ORDER`), so the colored mana is what stays floating for a later pip.
  Its taps follow the same idea (`tapAny`): a plain colorless permanent first (every
  record colorless, no rider — the `PLAIN_TAP_FIELDS` whitelist), the smallest that
  covers what is still owed (else board order), then the other repeatable sources in
  board order, a sacrifice source last. A one-shot source (it sacrifices itself or a
  creature, or is a card exiled from hand — and, since 2026-10-17, a no-{T} line that costs
  life, Treasonous Ogre) pays only when the cost cannot be paid without one: `planPayment` plans without them first, then with every source — the
  storage-land two-pass's shape, so affordability never moves.
  "Plain" is judged per permanent, and since 2026-10-17 (Nykthos) a line a pass holds out
  still counts (`holdsBack`, over the whole list `planPayment` was handed): a costed line kept
  out of the direct pass (Nykthos' devotion, Three Tree City, a filter land, "{1}, {T}: any
  color"), a one-shot line out of pass A (Crystal Vein, Phyrexian Tower) or a counter line
  out of the storage pass A keeps the permanent in board order. A spend-restricted line still
  counts only when the payment may spend it (Eldrazi Temple, for an Eldrazi) — whether it
  should hold Cavern of Souls back too is open. That plan is `planPayment`'s second, taken
  when it also pays; the first (each call's own judgment, as before) decides affordability,
  and `canAfford` runs it alone. The second plan alone is not safe: the costed pass is greedy,
  and what its funding call taps decides the colors left for the rest.

### 4.8 Combat, legal choices, the pilot seam

`legalChoices.js` enumerates legal actions (casts, activations, attacks, blocks,
mana taps, pending-choice options). A single **twin post-pass** over the emitted
actions additionally offers the printed alternative costs on the HIGH alt-cost
carriers (`action.altCost` — a SEPARATE marker from `freeCast`; battlefield-only
`controlCommander` per CR 109.4, pitch by card COLOR never identity, one canonical
return-lands set) — non-carrier decks stay byte-identical by construction, and the
LOW carriers are pinned MUST-NOT-OFFER. `combatResolution.resolveCombatDamage` handles
the keyword soup (trample/deathtouch/lifelink/infect/toxic/protection/menace),
consults damage replacements, applies commander damage, then SBAs + dies triggers.
`decide({state, legalActions, seat, pilot})` is the **pilot injection point** for
self-play (Omnath's pilots drive it); it validates the returned action against the
offered set with a canonical-key deep compare (`actionInOfferedSet`). A pilot's
optional `decideMulligan` (same shape) fires at keep/ship windows.

**The default AI's combo line (`tokenLoopLine.js`, added 2026-10-03).** The rule
(Colton): a combo deck plays to ITS line — build the resource only to "enough",
then forgo every other choice, then execute the finish. Slice one knows one line:
a self-scaling token loop (mana-only cost, "create X creature tokens where X is the
number of … you control" — The Unbeatable Squirrel Girl is the only corpus card)
whose finish is one combat split across every opponent. `opponentAI.pickAction`
asks `tokenLoopState` (null for every seat without the loop, so nothing else
changes): it never activates the loop on top of its own copy (X is read on
resolution), stops once the creatures that can attack kill everyone (or, when the
swing is a turn away, twice that against every opposing creature), and at
enough-now passes to combat instead of playing on. `pickAttackPlan` asks
`tokenLoopAttackPlan` for the split. All of it is restraint or target choice over
actions the engine already offered — never a new action. The next slices (other
finishes, tutoring for the finisher, other combo decks) are UPGRADE-BACKLOG E7.

**The finishes that are not combat (`outletFinishLine.js`, E7.2, added 2026-10-03).**
Colton's correction: "enough" is lethal by ANY route on the battlefield. For a seat
with a token loop, `tokenLoopState` also returns `outlet` (`outletState`): a SHOT
outlet ("[{T},] Sacrifice a creature: deals N damage to any target" — Blasting
Station, Goblin Bombardment), a MILL outlet ("Sacrifice a creature: Target player
mills cards equal to the sacrificed creature's power" — Altar of Dementia) and a
PASSIVE MILL ("Whenever another permanent you control enters, each opponent mills
a card" — Altar of the Brood), recognised by parsed shape. `wantsMore` keeps the
loop going past the combat threshold while no route is complete (to
`OUTLET_BOARD_CAP`); `complete` stops it — shots ready and waiting cover every
life total, token power covers every library, or the libraries are empty — and
`outletFinishAction` then fires the outlet from the offered actions, or passes
while the seat's own outlet work resolves. The seat's work already on the stack
(its shots, its mills, each passive mill and untap waiting) is counted, so nothing
more is sacrificed than the kill needs. Only token creatures are fed to an outlet.
The offer side changed once for it: a required target with more than 64
candidates lists the players first (`targeting.playersFirstOverCap`), so a face
target survives the option cap on a wide board.

**The mana-untap line (`manaUntapLine.js`, added 2026-10-03).** Colton's rules:
Candelabra of Tawnos / Magus of the Candelabra ("{X}, {T}: Untap X target lands")
exist to untap Gaea's Cradle or a land carrying mana enchantments — "if it
doesn't go mana positive then there's no choice" — and mana enchantments stack on
the SAME land. `manaValueOf` reads a land's value off `manaModel.manaSources` (live
count + mana Auras + tap augments), tapped or not. `manaUntapLineAction` (first
thing in `pickAction`'s ability block) plans the X most valuable lands for the X
that nets the most, and only acts when that brings a held, currently unpayable
card within reach: it taps the planned lands for mana (the one place the default
AI floats mana), then activates the untap on exactly those lands; the cast follows
by the ordinary cast pick. `pickAuraCast` sends a land mana Aura to the land
already carrying the most. The offer side only reorders: `legalChoices` passes
`orderTargets` into `targeting.expandAtoms` for this ability so the activating
player's tapped lands come first by value and the best set per X is the first
one offered (it survives the 64-option cap).

**Which side the AI casts an Aura on (`opponentAI.pickAuraCast`, 2026-10-16).** An
Aura spell targets what it will enchant (CR 303.4a) and the offer lists every legal
host, so the pick chooses the side. By what the Aura enchants: the lanes offered
only on the caster's own lands (the mana-boost Auras, `isNativeManaAura`, and the
granted-ability Auras whose host is a land, `grantAuraCastHostType`) take
`pickManaAuraTarget`; Animate Dead takes the biggest creature card in either
graveyard; a player Aura takes the side its triggers hurt — `playerAuraEffect.js`
reads each trigger as the runtime fires it and looks every atom up in
`ENCHANTED_PLAYER_EFFECTS` (Fraying Sanity's `enchanted-gy-mill`, Curse of Opulence's
`you-and-attacking-opponents`; the non-cast entry should read this table too, never a
second one), and where that reads nothing takes the printed side
(`printedPlayerAuraSide`, 2026-10-17: a Curse → the opponent the AI attacks; every line an
extra step or phase for the enchanted player — Paradox Haze — → itself; Grievous Wound's
lines → an opponent; anything else holds); every permanent host — a creature, or the
"permanent" / "planeswalker" targets a wider Enchant line enumerates — takes
`auraEntry.auraCastIntent`'s side, then power, then id. A side no reader can tell
holds. An untap-lock Aura reads ENEMY when the lock is the whole card — every line
its Enchant line, Flash, "Enchanted creature/permanent doesn't untap during its
controller's untap step" or "When this Aura enters, tap enchanted creature"
(`isUntapLockAura`, 2026-10-17: Ice Over, Coma Veil, Claustrophobia); a lock printed
beside anything else (Leaden Fists' +3/+3) still holds; one beside an enters draw (Eternity Snare) the printed reading below reads. Before this the own-lands rule took every offer without a "creature" target,
which put Fraying Sanity on the AI itself and Petrify on its own Mind Stone.
Witness: `auraCastSide.test.js`.

**The printed side reading (2026-10-17, `auraPrintedSide.js`).** `parseAuraBonus` is all-or-nothing: one line about the host it
doesn't model empties it, and only 49 of the 623 body-only Auras read a side. Where it reads none, `auraCastIntent` reads the
printed text sentence by sentence (the face being cast, reminder text and ability-word labels gone): OWN (+N/+N, a keyword or
protection, "can't be blocked", a granted activated ability, umbra armor, its card returning when it dies, its controller's
extra mana or card), ENEMY (−N/−N, can't attack / block, abilities locked, doesn't untap, loses abilities or card types, goad,
a forced attack, its controller losing life or sacrificing it, destroyed or exiled, tapped as the Aura enters, control
changing hands), NEUTRAL (the Aura's own business: Enchant, Flash, cycling, a colour chosen, an enters draw or an exile of an
opponent's permanent, an upkeep cost), else UNKNOWN. The side is the consensus; any UNKNOWN, or OWN beside ENEMY, holds; all
NEUTRAL takes the side the Enchant line names ("… you control" → own, "… an opponent controls" → enemy). A restriction beside a
buff is mixed here (the bonus reading calls it the buff's drawback — this reader never trades a hold for a guess). A
transformation ("loses all other abilities / card types") is ENEMY as a whole — what the same sentence gives is the new body
(Darksteel Mutation's indestructible 0/1). A condition on the host itself ("as long as enchanted creature is white") is UNKNOWN.
Now 289 of the 623 read a side (Angelic Destiny own, Darksteel Mutation enemy, Psychic Impetus still held), 774 of the 1,274
Aura faces in all (445 before; no existing reading changed). The non-cast entry reads the same answer. Unmodeled text stays
inert: only where the AI casts an Aura, and whether, moves. Witness: `auraClauseSide.test.js`.

**Every Aura that enchants a player is cast targeting one (2026-10-17).** The cast builder's
player-Aura branch (`castActionsFromZone`, above the additional costs) reads
`staticAbilityParser.playerAuraSpellSubject` — the face being cast (`faceUpView`, CR 712.8a),
"Enchant player" or "Enchant opponent" — and emits one cast per living player the caster may
target (`playerTargetableBy`), opponents only for "Enchant opponent"; no legal player, no cast
(CR 303.4a, 115.1b, 702.5d). Every tier: it used to be gated on native-aura, and the 43 body-only
player Auras fell to the no-target push, were cast with NO target and vanished into SPELL_NOOP.
A body-only one now resolves through AURA_ETB's player branch and sits on its player inert.
The dispatcher refuses a player-Aura cast without exactly one legal player target
(`AURA_TARGET_REQUIRED`). Witness: `playerAuraTarget.test.js`.

**Cost effects read the spell as cast (2026-10-17).** The bestow lane prices its cast against `bestowedSpellView(card)` — the
printed card with its type line set to its supertypes + "Enchantment — Aura" (CR 702.103b, 205.1a) and no creature type
(`every` false): an Aura reducer reduces it, a creature or creature-type reducer doesn't, a noncreature tax does. A
"<A> and <B> spells" reducer is two descriptors only over a provably disjoint pair (instant/sorcery); any other admissible pair
(Danitha's "Aura and Equipment", Starnheim Courser's "Artifact and enchantment") is ONE `subtypes` union, reduced once, and the
union's every-creature-type shortcut holds for creature-type words only.

**Every other Aura is cast targeting a host too (2026-10-17, `auraSpellHost.js`).** An Aura that
enchants a permanent and has no modeled lane (`isBodyOnlyAuraSpell` — the face being cast is an Aura,
not a player Aura, and none of Animate Dead / native / Ordeal / mana-boost / granted-ability claims
it) is offered once per host in `bodyOnlyAuraHosts`: `enumerateTargets` over
`staticAbilityParser.auraSpellHostSpec` (auraEntryHostSpec's subjects plus a whole-subject table of
exact typed hosts — "snow land you control", "artifact you control", "creature an opponent controls",
the basic land types …) with the spell's front-face colours, narrowed by `auraEntry.mayBeEnchantedBy`
(protection from enchantments, "can't be enchanted" — since 2026-10-17 every Aura cast lane narrows its hosts the same way,
`auraSpellHost.enchantableHosts`: native, Ordeal, bestow, mana-boost, granted-ability; AURA_ETB's re-check asks it too, so
Pacifism is no longer offered on, or resolved onto, Azorius First-Wing — CR 702.16b, 702.16c; its printed-protection read is the
permanent's OWN — a grant to a target, the player or a host is masked, so Mother of Runes and Giver of Runes may be enchanted — and
multicolored / monocolored / colorless are read against the Aura's colours, CR 105.2a, 105.2b, 105.2c). It resolves through AURA_ETB's `bodyOnlyAura`
branch — re-checked against the same list (CR 608.2b, 608.3b) — and sits on its host with its
unmodeled text inert; the tier doesn't move. An {X} Aura is offered per affordable X ≥ 1 per host (the X
rides the stack spell, CR 202.3e). An Enchant line the reader can't list, a printed rule about "this
spell's target", or an additional cost → not offered. The dispatcher refuses a cast without
exactly one listed host (`AURA_TARGET_REQUIRED`). Before this, ~650 such Auras were offered with NO
target and vanished into SPELL_NOOP; the dispatcher's combined-type-line `isAuraCard` arm is gone, so
a creature front with an Aura back (Accursed Witch, the disturb Spirits) enters as the creature. The AI
places one through `pickAuraCast` (auraCastIntent; an unread side holds). Witness:
`bodyOnlyAuraTarget.test.js`.

**Spree — modes with their own additional costs (2026-10-17, CR 702.172a, 700.2h).** "Spree (Choose one or more additional
costs.)" then one "+ {cost} — effect" line per mode. There is no parallel modal path: `textNormalize.readSpree` reads the lines
(all-or-nothing — the bare keyword lead, every later line a "+" mode, at least two, each cost plain mana; hybrid / {X} /
Phyrexian costs read nothing), `parseEffectProgramInner` re-reads the modes as the existing "Choose one or more —" modal
(parseModal's `atLeastOne`: every non-empty subset, each mode through the full clause machinery, one unmodeled mode → LOW → the
card stays on the Arbiter) and STAMPS `modal.spreeCosts` (printed order, parallel to `modes`). The stamp is what makes it safe:
the cast lane (`legalChoices`, the program lane's `normalCast`, beside strive) charges the base cost — taxed and reduced as
computed — plus every chosen mode's cost (CR 601.2f) as the action's own `cost`, which the dispatcher pays, and offers only a set
the caster can fund; `expandCastChoices` already drops a mode whose targets can't be chosen (CR 700.2a) and `programAtoms` runs
the chosen modes in printed order (CR 608.2c). Not offered: under a free-cast permission (the dispatcher pays no mana for
`freeCast`, so the modes' costs could not be paid — every free-cast window has its own decline), and the Fist of Suns
five-pip variant is never twinned onto a cast carrying `spreeCost` (CR 118.9d). The AI (`opponentAI.pickSpreeCast`, policy key
`spree`) judges each chosen MODE by the hold it would face as a spell of its own — a counter mode only at an opponent's spell
over the threat bar, a wipe mode only when behind, a team pump only when lethal, every target on its atom's side, "each creature
target player controls" only on a player with a creature — then takes the most modes, then the cheapest, then the heaviest
permanent targets; nothing worth it → hold. Native: Requisition Raid, Insatiable Avarice, Explosive Derailment, Phantom
Interference, Trash the Town, Three Steps Ahead (its copy mode: `artifactOrCreatureYouControl`, Sagas kept out). The other 15
Spree cards each have a mode no reader resolves. Witness: `spree.test.js`.

**Fetch lands (2026-10-17, `fetchLand.js`, `opponentAI.pickFetchCrack`).** The generic activation picker skips every
sacrifice-self cost, so a fetch land is taken by its own picker: an offered activation of a land that taps and sacrifices it,
costs no mana and nothing but life, targets nothing, and runs one search for ONE card to the battlefield whose every filter group
names a land (`fetchCrackAtom`; `fetchLandAbility` over a card — 32 corpus lands: the Zendikar / Onslaught ten, Prismatic Vista,
the Mirage five, the MH3 Landscapes, Evolving Wilds and kin). It cracks in its own main phase with the stack empty (the only window
the engine offers), only while the library holds a land the search finds and a life cost leaves it at `LIFE_PRUDENCE_FLOOR` (10);
a source that makes no mana right after the land drop and before the casts, a source that taps for mana (the Landscapes) only
after the casts and only for a colour the hand lacks. Its search — and, since the same day, every search for a LAND card the AI
makes for itself (`fetchLand.landSearchPickOrder`: each filter alternative names a land, from the library, not to the graveyard —
Rampant Growth, Cultivate / Kodama's Reach pick by pick, Farseek, Sakura-Tribe Elder, the SNC family's trigger) — takes the land
that makes the colour the hand and command zone need most, then the old order (`landSearchOrder` inside
`runProgram.autoPickTutorCandidate`; every other search keeps highest mana value, then name). `colourNeed` is the one colour-need
reader and `landSearchOrder` the one land-search order; the land drop reads both. Policy key `fetch`. Witness:
`fetchLandCrack.test.js`.

**The land drop reads what a land yields (2026-10-17, `opponentAI.landDropYield` → `pickLandAction`).** A fetch land in hand is
read as the land it fetches: an activated one that makes no mana yields the land its search would take (`landSearchOrder`),
untapped only when the search delivers untapped and that land has no enters-tapped text; its colours are every land it can find
in the library; under `LIFE_PRUDENCE_FLOOR` or with nothing to find it yields nothing. A Landscape (it taps for {C}) yields itself
plus the colours it can find. An SNC family land yields a TAPPED basic of a type the library still holds. The ranking: CASTS NOW
(its untapped mana pays for a hand / command-zone card the untapped sources can't — printed cost, commander tax, {X} as 1; a
hypothetical permanent through `manaSources`, never written back), then the colour gap, then untapped, then makes mana at all,
then name. The colour gap ranks above untapped: when the untapped mana casts nothing this turn, the colour the hand lacks is worth
more. Witness: `fetchLandDrop.test.js`.

**An activation that resolves to nothing must not be the AI's pick (added 2026-10-03).**
A free activation the resolver refuses is a turn that never ends: the equip pick
(`pickEquipAction`) stops only when its Equipment sits on the best body, and
Puresteel Paladin's "equip {0}" removes the cost that used to bound it. Two rules
follow. A target the resolver's CR 608.2b re-check would refuse is not a legal
target, so the OFFER must make the same check with the same inputs — the Equip
offer's `canBeTargetedBy` carries the source's colours, as `resolvers.ATTACH` does
(CR 702.16b). An Equip whose source can't equip a creature right now — no
Equipment now, or a creature Equipment without reconfigure (CR 301.5c / 701.3b) —
is not offered either (2026-10-17; before, it stayed offered and only the pick
skipped it): the offer, the resolver and the AI's pick all ask
`layers.cannotEquipNow`, and the pick keeps its skip for an Equip handed to it from
elsewhere. Witnesses: `equipOfferParity.test.js`, `attachLegality.test.js`.

**Commander color identity (`commanderIdentity.js`).** Stamped on the seat at game
start from the commander cards' `colorIdentity`, which the deck enrichment
(`server/learnDeckEnrich.js`) carries from the index. A commander card that states
no identity is UNKNOWN — null, the quality does nothing (CR 903.4f) — never
colorless: an absent field read as `[]` gave Commander's Plate protection from all
five colors in every real game while hand-built fixtures stayed green.

### 4.9 Self-play (`selfPlayRunner.js`, `learnSession.js`, `gameApi.js`)

`learnSession.advanceUntilDecision` is the real driver loop (SBA check →
eliminations → pending-* settlement → turn cap → priority window → `makeDecision`
→ `dispatchAction`, with a progress-signature anti-loop latch). Three guards end a
game `engine-stuck` instead of letting it spin: the 50,000-tick cap, the per-turn
tick budget (2,000), and the runaway SIZE guard (`RUNAWAY_LIMITS`: more than 500
objects on the stack or 2,000 permanents under one seat — a board that grows makes
every tick slower, so a tick count alone never fires in time). One loop is not
`engine-stuck` at all: a loop of only MANDATORY actions is a **draw** (CR 104.4b /
732.4 — Polyraptor beside Marauding Raptor). `mandatoryLoop.js` (a leaf) watches
every tick and is reset by any tick that was not a plain priority pass; it answers
after 800 plain passes whose (holder, source, controller) sequence repeats with one
period, the stack never smaller than a period earlier, life / poison / library /
hand / turn / step unmoved, and every object on top either a LINK (an untargeted
trigger from a permanent whose text offers no choice) or a BYSTANDER (its
resolution changed nothing). The game then ends `game-over` / `draw` with
`decision.mandatoryLoop`. Deliberately narrow: anything else falls to the guards
above. A new guard or result here needs the same care — a wrong `draw` is a
labelled training row, a missed one only an unlabelled game. Instrumentation
opts (`decide`/`recordDecision`/`timePressure`/`onTurnStart`) are threaded through
`act()` and every pending-choice settler, so caller-driven v1 games are fully
instrumented end-to-end (`gameApiInstrumentation.test.js` pins it). `selfPlayRunner`
builds seeded batches — the base seed is stamped into meta AND every banked row
(duplicate banking is detectable); seat rotation (`rotateSeats`) and cross-chunk
pod pairing (`podShuffle`) are opt-in; mulligans default ON for batches
(`--no-mulligan` recovers keep-every-7) — and labels outcomes **honestly**:
per-seat FATE via `outcomeLabelForSeatV2` (in a pod only the TRUE winner labels 1;
undetermined seats label `null` and are dropped), a timeout/non-completion gets
`trainingWeight 0`, never a fabricated win. `gameApi.js` is the
**play-API v1** (`PLAY_API_VERSION "1.2.0"`): the pure layer
(`legalActions/isLegalAction/applyAction/gameStatus/observe`) plus a SESSION layer
(`createGame/nextDecision/act`) that drives COMPLETE games including
pendingChoice/pendingArbiter settlement. `createGame` honors `pilots` (per-seat
`decide`/`decideMulligan` routers — malformed pilots THROW, never silently drop)
and `policy` — the opponent-AI **A/B seam** (`null` default is byte-identical;
`"v1"` or a per-subsystem map re-ranks every AI pick; `opponentAI.POLICY_KEYS` is
the ONE exported key list every policy subsystem registers in). The contract is
locked in [PLAY-API-CONTRACT.md](PLAY-API-CONTRACT.md) (v1.x: the 20-kind decision
vocabulary, per-kind answer shapes, §5 versioning discipline — the runtime export
is canonical, the doc list informative); `omnathSeam.test.js` is the in-gate
tripwire; `scripts/self-play.mjs --export-trajectories` emits the
omnath-trajectory-v1 engine→brain hook; `scripts/play-quality-probe.mjs` is the
seeded A/B evidence instrument for every AI-policy change (see
[PLAY-HARNESS-OVERHAUL-PLAYBOOK.md](PLAY-HARNESS-OVERHAUL-PLAYBOOK.md) §2–§3).

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
- **Unregistered targetType** (fixed 2026-10-16): a referent missing from
  `NON_CHOSEN_TARGET_TYPES` read as a chosen target the enumerator had no pool
  for → classified native, dropped at the flush. Fix: every target slot must name
  a type in `targetTypes.js`'s closed vocabulary (non-chosen, or one of
  `enumerateTargets`' pools), checked in `programConfidence`, which every consumer
  re-asks — so the classifier and the flush cannot disagree.
- **A mass set is no chosen target list** (guarded 2026-10-17): the referent gate
  ("They / Those creatures …" binding to the previous atom's targets) asked only whether
  the antecedent HAD a targetType, and a non-chosen mass type (`eachCreature`) has one — the
  referent would have read an empty slice at resolution and dropped silently. The assembly gate
  and `referentBindingOk` now treat a non-chosen type as no target list (the mass-rebind path, or
  refused). No bundled card's parse moved; witness: the Oran-Rief near-miss in
  `enteredThisTurnCounters.test.js`.
- **"this" is not a self-reference** (fixed 2026-10-16): `classifyCondition`'s `selfRef`
  was `/\bthis\b/`, so "this turn" / "this way" made a condition the card's OWN event
  (Maeve, Insidious Singer drew whenever she attacked). Fix: `SELF_THIS_RE`, a closed
  self-noun list (CR 700.7) plus the noun-less "this <event verb>" subject; a trailing
  "this turn" with no self is a delayed trigger's window (CR 603.7b) and is refused
  (an ordinal count — "your second spell this turn" — excepted).

- **The combined card is not the permanent** (fixed 2026-10-17): a double-faced, adventure or flip card carries
  Scryfall's COMBINED fields (both faces' type line, oracle and keywords), and the engine never turns a back face
  up, so every reader must see its FRONT face (CR 712.8a, 712.8d). One leaf, `faceUp.js`: `faceUpTypeLine` (the
  derive's subtype parse), `characteristicTypeLine` (a type-word test in any zone — a split card stays whole, CR
  709.4c) and `faceUpView` (the face-up card: front text, no keyword array; any other card is returned as the same
  object). It is applied at the chokepoints — inside the per-card parsers (`detectTriggers`, `parseStaticAbilities`,
  `parseActivatedAbilities`) and `keywords.hasKeyword`, `combatEvasion`'s self-text read, the trigger scopes' and
  `interveningIf`'s `typeStr`, the graveyard counts, summoning sickness, the legend rule, the attach pools and the
  Enchant-land host. No tier moved (flip-diff 0 / 0 / 0). A new reader of a
  permanent's or a zone card's type, text or keywords goes through a parser or one of the three, never raw
  `card.type` / `card.oracle` / `card.keywords`. Witness: `dfcFaceUpSweep.test.js`.
- **A counter replacement keyed on WHO PUTS the counters** (credit removed 2026-10-17): "If you would put …" / "If an
  opponent would put …" (Vorinclex, Monstrous Raider; Lae'zel, Vlaakith's Champion; Doc Samson) describes the putter (CR
  614.1a; wither / infect counters are put by the source's controller, CR 120.3d), but `gameState.addCounter` carries no
  putter and `applyCounterDoubling` applies by the recipient's controller; a player recipient ("on yourself", "permanent or
  player") reaches no adder but Winding Constrictor's exact "If you would get" template. `isModeledDoublerSentence` (and
  `isPureDoubler` through it) refuses both shapes; the runtime still applies the recipient half. Modelling them needs a
  putter threaded through addCounter's callers and the four player-counter adders. Witness: `counterPutterHonesty.test.js`.

**The generalizable rule for any new recognizer: validate an emitted
selector/filter/subtype against a *closed* vocabulary (or corpus reality) before
it counts.** A word you don't recognize should route to the Arbiter (null), never
silently match zero.

### THE SECOND FAILURE MODE — a judgement implemented in two places (found 2026-07-25)

Distinct from the open-vocabulary class above, and it produced **eleven sites in one sweep**: the same
question gets answered in several code paths, one copy is corrected when somebody hits it, and the others
quietly keep the old behaviour. It only shows on inputs that need BOTH paths at once, so it accumulates.

The concrete instance was **`isCreatureCard` (the PRINTED card) vs `permanentIsCreature` (LAYER-AWARE,
CR 613)**. Combat asked the live question; targeting, four referent resolvers and the mass filters asked
the printed one. Consequence: an animated land could ATTACK every turn but could never be TARGETED by
removal — an invulnerable attacker, and the asymmetry favoured its controller, so it was not the safe
direction an under-offer usually is.

**Rule: on a permanent you have ALREADY looked up on the battlefield, the question is about the OBJECT,
not the card.** A bare `isCreatureCard(perm.card)` there is nearly always a bug. And when a comment says
a function "mirrors" another, go read the other one — two documented mirror pairs had silently diverged.

**THE REFERENCE IMPLEMENTATION — copy this shape.** `groupNoUntap.js` (the Winter Orb / Meekstone lock
family) is a LEAF module exporting `groupNoUntapFiltersOf`, and BOTH `coverage.js` and `gameState.js`
import it. There is no second copy, so there is nothing to drift — verified 2026-07-25 rather than taken
on trust, because two other "mirrors" claims in this codebase turned out to be false the same day. When a
judgement is needed by both the metric and the runtime, put it in a leaf module and import it twice; do
not reimplement it on the second side, however small it looks.

**A spell on the stack is read in one place (`spellOnStack.js`, 2026-10-17).** Its mana value (`stackSpellManaValue` —
CR 202.3e's announced X once per {X}; CR 202.3d's half cast; CR 715.3b's Adventure; the card's `cmc` for anything else) and
a counter's filter (`spellMatchesCounterFilter`) live in that zero-import leaf. The counter's enumeration (`spellEffects`)
and its resolution re-check (`atoms/stack.applyCounter`) were a hand-kept mirror pair; both read the card's printed `cmc`,
and so did the cast watchers. Every reader — the counters, Mana Drain, Imp's Mischief, the mana-value cast filters,
`castSpellMv` (Kellan, Rashmi), cascade's cap, the copy watchers, the forced trigger-target pick, Bolas's Citadel — calls the
leaf. A payload that resolves without X (an Aura, a planeswalker, the Arbiter's no-op) carries the announced X on the stack
object (`applyCastSpell`). **A new effect that asks for "that spell's mana value" reads `stackSpellManaValue`, never
`source.cmc`.** Witness: `stackManaValueReaders.test.js`.
The spell's COLOURS are read off the same `source`, so a projected face carries its own half's (2026-10-17): a split half
(`splitCard.splitFaceCards`, CR 709.3b) and an Adventure (`adventure.adventureFaceCard`, CR 715.3b) are the colours of their own
mana symbols (CR 202.2, `colorsOfSpell`) — never the card's top-level `colors`, which is the combined card's (CR 709.4b) or the
adventurer's normal half's (CR 715.4). The counters' colour filters, Pyroblast/Hydroblast, the "casts a red spell" watchers and
protection-from-colour targeting all read it. Witness: `splitHalfColors.test.js`. And no cast pays a cost naming two halves
(`castActionsFromZone` skips any "//" mana cost): omen and preparation cards cast normally as their creature (`omenPrepare.js`);
Rooms, three-half split cards and Twice Upon a Time are not offered. Witness: `combinedHalvesCast.test.js`.

**How to CHECK a pair you inherit — the drift probe.** Two functions answering one question can be run
against each other across the whole corpus: iterate real cards, call both, print disagreements. No fixture
design needed. Three runs on 2026-07-25 found three real divergences (conditional no-untap statics, the
attached-form subject set, and 159 cards claiming `native-mana` the engine cannot tap). It costs minutes
and it sees the one class the fingerprints structurally cannot.

**Why this class survives the gate battery:** none of it moves a single tier. The tier and program
fingerprints compare the parse pipeline against the parse pipeline, so a runtime function returning an
empty list is STRUCTURALLY invisible to them. Any change to a resolver, enumerator or legality gate must
be proven by driving a card on a board — a green fingerprint means the gates couldn't see it.

### THE DEAL PATH — damage is dealt at two sites, never one per atom (2026-10-16)

Damage reaches a creature or a player through exactly two funnels: combat damage through
`combatResolution.resolveCombatDamage`, and all other damage through `spellEffects` — `applyDamageEffect` for a spell's
or an ability's damage, `dealSimultaneousDamage` for damage a creature deals itself (a fight, a bite, a self-fight). The
two non-combat funnels deal every hit through the same `dealDamageToCreature` / `dealDamageToPlayer` and settle once
through `settleDamageEvent`: protection from the source, the damage replacements, the prevention walls and shields,
infect and wither, the damage-source record (`damagedBy`), lifelink, deathtouch, the dealt-damage and dealt-by triggers.
`gameState.markCombatDamage` — despite its name it marks all damage — is the LAST step of that path, never a substitute
for it: the four fight atoms called it directly, and for months a fight ignored Dawn Elemental's wall and never gained
lifelink, never dealt infect's counters, never fed Sengir Vampire or an enrage trigger. **A new "deals damage" atom deals
through one of the two funnels.** An effect whose hits are simultaneous (both creatures of a fight) is ONE event: lock
the amounts, deal every hit, then the single lethal pass.

### THE DAMAGE-REPLACEMENT CONSULT — one reader, the affected player's order (2026-10-17)

Both funnels finalize every hit through `damageReplacements.consultDamageAmount` (the board gate keeps a board with no
replacement byte-identical). What it reads, and the seams a new carrier rides:

- **The sentence grammar** (`readDamageSentence`): "If <source> would deal [combat|noncombat] damage [to <recipient>],
  <result>." plus the "Double all damage <who> would deal." family, each sentence anchored whole on a static line of the face
  that is up (`faceUp.faceUpView`; a Class at its level through `classLevels.classLiveCard`; no leveler band, no Room door).
  Sources: any · you control · ANOTHER you control (Thor) · a <colour> source (Torbran) · a <colour> or artifact source
  (Mechanized Warfare) · creature / counter / entered-this-turn / subtype · this creature · equipped creature · another
  creature (Inquisitor's Flail). Recipients: a permanent or player · an opponent (players only) · **an opponent or a
  permanent an opponent controls** (`targetSide: "opponent"` — a creature, a planeswalker or a battle) · you · you or a
  permanent you control · this creature · a player · equipped creature · another <Subtype> you control. Results: double /
  triple / twice that much / **that much plus N** (`op: "add"`) / plus X = its own power (Hawkeye) / **prevent half, rounded
  up** (`op: "preventHalfUp"`, Gisela) / prevent all but N. A label is stripped only when it has no rules meaning (the shared
  CR 207.2c list, plus "Unrivaled Lethality"); "Max speed —" and any unread condition keep the sentence unread. The one
  condition read is Hellbent's "As long as you have no cards in hand" (Anthem of Rakdos).
- **The source's qualities** (`sourceQualities`, CR 609.7c): a permanent's colours and types NOW (layers); a source off the
  battlefield through `event.sourceLki` — a spell's colours and types (`runEffectProgram` stamps `ctx.spellSource`), the
  sacrificed-for-cost record (`state.sacrificedSelfLki` carries colours/types), a dies trigger's own look-back
  (`ctx.dyingQualities` from `deathLookback.lkiColors`/`lkiTypes`), the entering-creature lane's `triggeringLki`. Atoms pass
  their source through `effects/atoms/shared.damageSourceFor`; anything else that left carries no record and a
  quality-filtered replacement misses it (the safe side).
- **The order** (CR 616.1, 616.1f): the applicable entries are run in the order that leaves the LEAST damage (every order up
  to six entries) — the affected player shields themselves and their permanents — and a fully prevented event stops (no
  addend on nothing: Torbran's ruling). Each entry applies once per event (614.5), keyed by permanent + entry index.
- **Stored replacements** (CR 611.2a): `state.damageReplacementEffects` — created by a resolved ability (Lightning, Army of
  One's Stagger: `effects/atoms/misc.applyDamageReplacementUntilNextTurn`, `recipientPlayerSide`), read beside the statics,
  ended at the creator's next untap step (`gameState.expireDamageReplacementEffects`) or when the creator leaves the game.
- **Not this seam:** a LIFE-LOSS replacement lives in `gameState.loseLife` (Bloodletter of Aclazotz — the active player's
  `opponentLifeLossMultiplierOf` statics double an opponent's loss; the damage, lifelink and commander damage are unchanged).
  The fixed-order prevention outside the consult (PV-1 shields, the walls) still applies after it, a known simplification.

Other live seams (documented, mostly benign, listed so you don't rediscover them):
the `land` tier is unconditional (§2.1); resolved instants/sorceries now reach their
owner's graveyard (CR 608.2n — fixed in the overhaul pass; Arbiter-routed spells still
vanish, the Arbiter owns their disposition); commander damage
is keyed by a per-seat commanderInstanceId stamped at seat build (mirror collapse FIXED in the
overhaul pass; the tax never collapsed — it lives per-player); the modal combat-referent
gates iterate top-level atoms only (nil corpus impact today). Full list:
`docs/orchestration/WAKE-REPORT.md` and the per-subsystem scan notes.

---

## 7. THE VERIFICATION GATE — how you prove a change is safe

Three mechanisms, run from `app/`. **Never claim a change is safe without them.**

### 7.1 The test + lint gate

```bash
# from app/ — CRITICAL: do NOT set MTG_APP_ROOT (it redirects paths.js and causes
# ~176 filesystem-test failures that are NOT real). Read "Tests N passed".
VITEST_TIMEOUT_MS=900000 npm test   # the CI wrapper; expect the full suite green (current anchor: WAKE-REPORT top block)
                                    # a fresh worktree first: npm run build:rules-index (docs/gotchas.md #20)
npm run lint            # eslint --max-warnings 0, then scripts/check-cr-citations.cjs (every "CR nnn.n" must exist in the bundled CR)
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

*Consolidation pass, Claude Fable 5, 2026-07-01. Harness/AI sections (§4.5, §4.8,
§4.9) updated to post-pass reality by the play-harness overhaul, 2026-07-03. Keep
this current: when you change a seam, update §6; when you add a tier or gate,
update §2/§7.*

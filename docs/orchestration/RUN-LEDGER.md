# RUN-LEDGER — live resume anchor for the long build run

> **The work queue lives in [NEXT-QUEUE.md](NEXT-QUEUE.md)** — roadmap v2 is cleared, and that file is its
> successor. It is sequenced so risky work happens while sharp and mechanical work is available late.

> **If you are a fresh session picking this up after a crash, timeout, or context loss: READ THIS FILE
> FIRST, then `docs/orchestration/WAKE-REPORT.md`.** This file is rewritten at every slice boundary and is
> the single source of truth for what is in flight. Everything above the `---` is current; everything below
> is the completed trail.
>
> Rebuild your footing in four commands:
> ```
> git fetch origin && git log --oneline -8 origin/master
> git status --porcelain                       # must be clean, or finish/discard what's dirty
> grep -rl MUTANT app/src/ | head              # MUST be empty — a crash mid-mutation leaves sabotage
> cd app && npm test && npx eslint . --max-warnings 0
> ```
> If `MUTANT` appears anywhere in `app/src/`, a mutation check was interrupted. Restore that line to its
> pre-mutation form before doing anything else — the tests will be lying until you do.
>
> **⚠️ AND WHEN YOU MUTATE: `grep -c MUTANT` proves a mutation APPLIED, not that it applied to YOUR line.**
> `perl` without `/g` replaces the FIRST occurrence in the file. I burned two runs "confirming" a test was
> hollow when the mutation was landing on an identical string 180 lines earlier (a different atom's
> `spellFilter: "instantSorcery"`). **Anchor on something unique, or `grep -n` the line number before and
> after.** A green mutation run is only evidence if you know WHAT you broke.

## 🩸 THE VACUOUS SUBTYPE FILTER — a new FP class, found and closed (`57011a09`)

**A filter the runtime can never satisfy is worse than a missing one.** `subtypeFilterMatches` enforces
`subtypeFilter` as a substring of the triggering permanent's TYPE LINE. Mint a string no card carries —
"Commander", "Outlaw", "Allie" — and the card classifies **native**, the trigger fires **zero**, and
**nothing in the static toolkit can see it**: the per-card tier diff shows no movement because the card was
already native and stays native. This is the same lesson as the dropped layer grant, in a second location:
**the tier is not evidence about the board.**

**The instrument: `app/scripts/probe-vacuous-subtype-filters.mjs`.** It derives the real subtype vocabulary
from printed type lines and reports any minted filter absent from it. **A finding here is always a defect** —
there is no benign reason to gate on a subtype no printed card carries. Run it after touching ANY path that
mints a `subtypeFilter`. It reads **0** today.

**⚠️ AND THE PROBE WAS WRONG ON ITS FIRST RUN — 72 false findings.** It scoped the vocabulary to post-dash
subtypes, but `subtypeFilterMatches` tests the WHOLE line, so "Artifact" legitimately matches
"Artifact — Equipment". *The instrument was the problem, not the engine.* Fixed before trusting a single row.

The three real classes, all now closed:
```
"Commander"  CR 903.3 DESIGNATION, not a type word   Norn's Choirmaster #3286 (etb+attacks) · Keleth #6637
"Outlaw"     CR 203.4c UMBRELLA over five subtypes    Rakish Crew
"Allie"      naive -s strip on the plural "Allies"    Invasion Tactics #13305
```
Commander now takes `commanderYouControl` (the scope Kediss already proved); outlaw expands to its five;
singularization now **generates candidates and validates against `CR_CREATURE_TYPES`** — the closed 317-word
set — instead of trusting a rule (Allies→Ally, Elves→Elf, Wolves→Wolf, Oxen→Ox; unresolvable → null →
Arbiter, a safe FN). **Do not replace that with a hand-written plural dictionary — it would just relocate
the fabrication.**

**⭐ TWO FOLLOW-ONS THE DIFF CAUGHT AND REASONING DID NOT.** Both are the argument for running it every time:
1. Moving commander triggers off the subtype path dropped **Keleth to body-only** — `NONSELF_TRIGGERING_SCOPES`
   gates the "put a +1/+1 counter on IT" pronoun rewrite, and the new scope wasn't in it. Fixing only the
   scope would have swapped a silent no-op for a silent park.
2. Denying "commanders" to `parseSubtypeList` killed the BATCHED form outright — and the pin protecting it
   was protecting an FP (its old output was itself vacuous). `batchCommander` makes the plural CORRECT
   rather than absent. **New descriptor field → the whitelist, or it is silently dropped.**

**Tier diff GAINED 0 · LOST 0 · RETIERED 0. Coverage does not move.** Three cards that claimed native and did
nothing now work. That is the whole result, and it is worth more than a number.

### 📋 NEXT OFF THIS SHELF — the 26 top-2500 "one or more" carriers still parked, DIAGNOSED

**⚠️ FIRST, THE TRAP THAT COST ME A WRONG ANSWER: `publicCard()` STRIPS `edhrec_rank`.** An ad-hoc probe
built on `publicCard` read every rank as the 999999 fallback and reported *"0 of the remaining carriers are
in the top 2500"* — which would have retired this whole vein. `measure-coverage.mjs` reads `raw.edhrec_rank`
off `allCards()` for exactly this reason. **Take the rank from the RAW card, the oracle from `publicCard`.**

The real answer is 26, and detection status splits them cleanly (`detectTriggers` count in brackets):

```
DETECTION IS THE ONLY BLOCKER — the batch arm exists, the SUBJECT FILTER is the gap
  1729 Elvish Warmaster   [0]  "one or more other ELVES you control enter" + rider   ← the subtype cross
  1544 Losheel            [0]  "one or more ARTIFACT CREATURES you control enter" + rider
   648 Caretaker's Talent [0]  "one or more TOKENS you control enter" + rider   ⚠️ any token, incl. Treasure
  2459 General Kreat      [0]  "one or more GOBLINS you control attack"          ← maps onto youAttack
  2500 Dollmaker's Shop   [0]  "one or more NON-TOY creatures you control attack a player"
  1281 Duelist's Heritage [0]  "one or more creatures attack"  ⚠️ ANY player's — NOT youAttack
  1591 The Skullspore Nexus [0] "one or more NONTOKEN creatures you control die"  ← diesBatch + nontoken
  2356 Spiteful Banditry  [1]  "one or more creatures YOUR OPPONENTS CONTROL die" + rider

DETECTED ALREADY — the EFFECT is the blocker, so these are spell-effect work, not trigger work
  1903 Grazilaxx   combatDamageBatch ✓ … blocked by its OTHER line ("becomes blocked")
  2484 Nature's Will combatDamageBatch ✓ … "tap all lands that player controls and untap all lands you control"
  2438 Rev          combatDamageBatch ✓ … "look at the top card of that player's library" rider
   897 The Gitrog Monster / 1290 Hedge Shredder / 1987 Colossal Grave-Reaver — gyEnterBatch ✓, effect gaps
  1838 Teval's Judgment  gyLeaveBatch ✓ … modal "choose one that hasn't been chosen this turn"
   914 Evolution Witness / 2085 Basking Broodscale / 1259 Simic Ascendancy — countersPut ✓, effect gaps
```

**The cheapest next slice is the ETB SUBJECT CROSS** (the first three rows): the batched-ETB arm shipped at
`619b9513` handles *"with power/mana value N or less"*, and these are the same grid cell with a different
filter — subtype, card-type, token-ness — all of which the SINGULAR etb path already enforces
(`subtypeYouControl` / `otherSubtypeYouControl` / `tokenFilter` / `nontokenFilter`).

**⭐ BUILD IT BY DELEGATION, NOT BY A SECOND PARSER.** De-pluralize the subject and hand the singular clause
back to `classifyCondition`, then decorate the result with `requiresOncePerTurn: true`. That inherits every
scope the singular arm can enforce **and every refusal it makes** — which is the whole safety argument, and
the shape the `diesBatch` arm already documents. Use `singularCreatureType` for the subtype word; it is the
validated singularizer built in `57011a09` precisely so "Elves" cannot become "Elve".

**⚠️ Caretaker's Talent needs care: "tokens" is ANY token, including Treasures.** A creature-scoped gate
would under-fire while claiming native — the FP direction. It needs a token-permanent scope or it parks.

## 🎯 THE OBJECTIVE — RETARGETED BY COLTON, 2026-07-28 (supersedes the shelf framing below)

**The target is now the TOP 2500 MOST-PLAYED CARDS by `edhrec_rank`.** Colton, verbatim: *"lets focus now
on the top 2500 that['s] probably 95% of what's actually played."* This supersedes both "corpus %" and
"the deck shelf" as the number to move. The shelf sections further down are still TRUE and still useful
as a secondary read — do not delete them — but they are no longer the bar.

Measure it with the project's own tool (it already had this view; the comment in the script says the
corpus number *"treats a never-played junk card the same as Sol Ring"*):
```
MTG_APP_ROOT="/c/Users/colto/AppData/Roaming/com.colton.mtg-tool" node app/scripts/measure-coverage.mjs
```
`playable = native OR land`. Lands count — they run trivially, which is why **Bojuka Bog #24 was never
a gap** even though an ad-hoc probe of mine listed it as parked. Do not re-derive that; it is settled.

**WHY THE RETARGET HAPPENED — the lesson is worth more than the number.** Colton pushed back twice, and
both times the instrument was the problem, not the codebase:

1. *"why are we gated on no new card or easy cards when we're not even half way"* — every search
   instrument built in this run asks the SAME question: *"which cards are ONE sentence from flipping?"*
   That seam genuinely was exhausted, but it is a thin surface layer. It goes quiet long before the WORK
   does. "No cheap wins" was an artifact of the instrument.
2. *"we don't [want to] assume cards are hard just cause they['re] multi part — some of those may be
   really easy as we have a lot of what they're doing already done."* — **Blocker COUNT is not cost.**
   A card needing two VOCABULARY fixes is cheaper than one needing a new SUBSYSTEM. Every slice shipped
   since that message was a case of the engine already knowing the effect and not knowing the phrasing.

**The instrument that replaced them:** for a given family, parse each blocking phrase in isolation AND a
near variant that differs by one qualifier. When "destroy all artifacts" is HIGH and "exile all artifacts"
is LOW, the gap is a missing CROSS, not a missing mechanic. That single diff found three slices in a row.

Full authority granted: cut releases freely, choose the work, no check-ins. Stop only for something that
needs Colton's hands, touches secrets, or would ship a guess.

## 📈 THE CEILING QUESTION — ANSWERED WITH EVIDENCE (Colton asked 2026-07-28: "can't we get top 2500 to 70%?")

**There is NO structural cap. 70% is reachable; the constraint is RATE, not possibility.**
Regenerate with `node app/scripts/probe-top2500-ceiling.mjs` (MTG_APP_ROOT set to the install).

**⚠️ THE TWO TOOLS DISAGREE BY ~0.3pp — `measure-coverage.mjs` IS AUTHORITATIVE.** The ceiling probe read
52.5% (1,312/2,500 · 1,188 parked) while `measure-coverage` read 52.2% (1,305/2,500) *later*, which is
impossible from shipping features. Cause: they slice the top 2500 from DIFFERENT POOLS — `measure-coverage`
filters to "real cards in the active index" (dropping art-series and similar), the probe uses `allCards()`
raw, so the two 2,500-card memberships differ. **Trust `measure-coverage` for any number quoted to Colton;
trust the probe for the BUCKET SHAPE only** (which is what it exists for and is unaffected by a few
membership swaps). Reconciling the probe's pool to measure-coverage's loader is a small unstarted task.

```
 381  (cum 32%)  Spell effect (other)      Chaos Warp #30 · Brainstorm #72 · Deflecting Swat #77
 195  (cum 48%)  ETB trigger               The One Ring #90 · Chrome Mox #144 · Tireless Provisioner #182
 118  (cum 58%)  Activated ability         Ashnod's Altar #132 · Sensei's Divining Top #226
 112  (cum 68%)  Upkeep/phase trigger      Arcane Denial #55 · Mana Drain #117 · Mana Vault #145
  94  (cum 76%)  Other / unclassified      Toxic Deluge #67 · Panharmonicon #261
  78  (cum 82%)  Attacks/blocks trigger    Ragavan #271 · Etali #260
```

**Four ORDINARY buckets are 68% of everything left** — spell effects, ETB triggers, activated abilities,
phase triggers. Categorically unlike cdh, where the cap is arithmetic and proven (79% now → 82% ceiling,
short by 8 multi-blocker staples). Nothing of that shape exists here.

**70% needs 438 more cards (37% of parked). 80% needs 688 (58%).**

### ⚠️ AND THE HONEST PART — THE RATE PROBLEM IS SELF-INFLICTED

This run's 14 slices moved top-2500 by only **~16 cards**, because every one was a *named single staple*
picked off the one-mode-away shortlist (Austere Command, Rakdos Charm, Cryptic Command, Warping Wail…).
Superb value per CARD — each is a real format staple — and terrible VOLUME. At ~1.3 top-2500 cards per
slice, 438 cards is hundreds of slices.

**So the strategy must change to reach 70%: stop hunting named staples, attack the BUCKETS.** The
one-mode-away list is a finishing tool, not a grinding tool — it goes quiet by construction (that is the
same instrument-blindness Colton caught twice already; see THE OBJECTIVE above).

### 🧭 THE VEINS ARE MINED OUT — what remains are THREE WAVES, each scoped below

Re-ran `probe-spell-effect-veins.mjs` after 23 slices: the pile is 381 → **371** and every remaining vein is
≤12 cards AND needs real machinery rather than vocabulary. The cheap-crossing phase of this pile is over.
**Do not go looking for another one-line fix here — pick a wave and commit to it.**

**~~WAVE A — SPELL COPY~~ ✅ SHIPPED `3c3fd256` (+5).** Remaining in it: Fork's "except that the copy is red" (changes the copy), Narset's Reversal #740 (copy + return to hand), Return the Favor #625 (Spree). ORIGINAL SCOPING BELOW — kept because the reference-implementation note is what made it quick:
**WAVE A — SPELL COPY** (Reverberate #1380 · Fork · Narset's Reversal #740 · Return the Favor #625).
`"copy target instant or sorcery spell"` is **entirely unmodeled** — the "you may choose new targets for the
copy" rider is NOT the gap, the copy itself is. Only CREATURE-spell copy exists today (Double Major, via
`snapshotCopiedCard` + the `copyNotCounter` targeting flag). Needs: a stack copy of a non-creature spell,
plus optional retargeting through `expandCastChoices`. The creature path is the reference implementation.

**WAVE B — THE ATTACK TAX** (⭐ highest RANK on the board: Propaganda #115 · Ghostly Prison #161 ·
Windborn Muse #1011). *"Creatures can't attack you unless their controller pays {2} for each creature they
control that's attacking you."* No attack-cost machinery exists at all.
**⚠️ THE FP TRAP, and it is a bad one:** modelling this as a mere RESTRICTION without actually DEDUCTING the
mana makes the AI attack for free — i.e. Propaganda does nothing while the card claims native. That is a
wrong model, not a missing one. It needs a combat-time payment (the `pendingChoice` machinery) AND an AI
decision to pay. Do not ship the restriction half alone.

**WAVE C — BATCHED ETB ENTRY. ATTEMPTED AND REVERTED — read all of this before retrying.**

**The design is CORRECT and was validated; do not re-derive it.** The one-permanent signature of
`checkEnterTriggers` is NOT the real obstacle: record each entry on a `pendingEnterEvents` queue from INSIDE
that function (covering all six call sites at once, the diesBatch trick) and drain it in `flushTriggers`
beside the graveyard / tap / counter queues. **`flushTriggers` runs at every priority-grant checkpoint
(CR 603.3), so entries between two flushes are EXACTLY the simultaneous ones** — three tokens from one effect
fire a watcher once; separate resolutions are separated by a flush. That reasoning held up; the build did not.

**WHY IT WAS REVERTED — three findings, in the order they landed:**
1. **My "~28 cards" was wrong.** The BARE forms are only **5** (Twilight Diviner, Celes, Frantic Scapegoat,
   Kotis, Back-Alley Gardener). The other ~23 carry FILTERS — "with power 2 or less" (Welcoming Vampire
   #428, Enduring Innocence #785), "with mana value 3 or less" (Tocasia's Welcome #866), nontoken, subtype,
   "tokens your opponents control".
2. **Those 5 bare-form cards flip ZERO** — every one is blocked by other text.
3. **⭐ THE ACTUAL BLOCKER, and the thing to fix FIRST:** the FILTERED clause never reaches a new detection
   arm at all. `detectTriggers` returns 0 for "whenever one or more other creatures you control WITH POWER 2
   OR LESS enter" even though a correct regex matches that exact string — so something UPSTREAM rewrites or
   rejects the clause before the arm runs. **Find that guard before writing any batch machinery**; the
   valuable cards are all behind it, and the machinery is worthless until it is found.

**AND THE COST THAT MADE REVERTING RIGHT:** the queue records on EVERY permanent entry. Paying for that with
0 cards, while the cards that mattered sat behind an undiagnosed guard, was a bad trade.

### ⭐ FOLLOW-UP: THE GUARD IS FOUND, AND WAVE C MAY NOT NEED THE MACHINERY AT ALL

**THE GUARD (finding #3 above):** `triggers.js` ~810 —
`if (!castWithExempt && /\b(?:with|while|during|named)\b/.test(c)) return null;`
A blanket reject of any trigger condition containing "with". Several PRECISELY-CHECKABLE shapes are already
carved out ABOVE it (keyword-batch combat damage, with-keyword attacks, cast-with-mana-value). A
`with power N or less` / `with mana value N or less` filter is equally checkable and belongs in that carve-out.

**AND THE SCOPING INVERTS — the FILTERED cards are the clean ones, the bare ones are hopeless:**
```
Welcoming Vampire #428   Flying + the batched trigger + the once-per-turn rider   ← NOTHING else blocks it
Tocasia's Welcome #866   the batched trigger + the rider, and nothing else        ← NOTHING else blocks it
Twilight Diviner · Celes · Kotis (the BARE forms)   all carry an "if they entered
   from a graveyard" intervening-if                                               ← blocked regardless
```

**⭐ THE CHEAP PATH — and it needs NO queue, NO drain, and NO per-entry cost.** Both clean cards carry
*"This ability triggers only once each turn"*, and that rider IS ENFORCED (`gameEngine` ~1401, keyed per
source+event on `onceTriggersFiredThisTurn`, cleared at untap). So for a card carrying the rider:

| model | behaviour |
|---|---|
| batch-once, then rider-capped | once per turn |
| **per-creature (singular `etb`), then rider-capped** | **once per turn** |

**Observably IDENTICAL** — the printed rider does the capping either way. So the batched phrasing can map
onto the EXISTING singular `etb` event, with the filter as a descriptor field.

**⚠️ VALID ONLY WITH THE RIDER.** A rider-less batched ETB mapped this way OVER-FIRES (once per token). Gate
it: have the condition matcher return `requiresOncePerTurn: true` and have the descriptor builder DROP the
descriptor when the rider is absent — the builder computes `oncePerTurnTrigger` from the effect clause and
has `cls` in hand, so that gate belongs there.

**⚠️ AND REMEMBER THE WHITELIST:** any new descriptor field (`etbMaxPower`, `etbMaxMv`, `requiresOncePerTurn`)
must be added to the explicit field list at `triggers.js` ~3171 or it is SILENTLY DROPPED — the trap that
nearly shipped the Sidisi over-fire.

### ✅ THE CATCH-ALL IS NOW DECOMPOSED — `app/scripts/probe-spell-effect-veins.mjs`

The 381-card `Spell effect (other)` pile, split into sentences with the modeled ones filtered out. The
veins, in order (top-2500 ranks shown — these are the next grinding targets, NOT single staples):

```
 12x  choose one —                                     (modal — the wrapper is built; the MODES fail)
  7x  exile ~                                          Teferi's Protection #107 · Mizzix's Mastery #796
  6x  this ability triggers only once each turn        Morbid Opportunist #255 · Welcoming Vampire #428
  5x  as an additional cost …, sacrifice a creature    Eldritch Evolution #728 · Fling #1462
  4x  gift a card                                      Dawn's Truce #359 (the Gift mechanic)
  4x  you may choose new targets for the copy          Narset's Reversal #740 · Return the Favor #625
  3x  creatures can't attack you unless … pays {C}     ⭐ Propaganda #115 · Ghostly Prison #161
  3x  you may look at the top card of your library     Bolas's Citadel #263 · Mystic Forge #414
  3x  exile target creature you control, then return   Cloudshift #792 (BLINK) — see the BLINK box below
  3x  exile top two + play them until end of next turn Light Up the Stage #1211 — see IMPULSE box
```

### 🥇 THE BIGGEST VEIN IN THE ENGINE — "Whenever ONE OR MORE …" (CR 603.1), **291 parked cards**

Found by the vein probe and then ISOLATED with the one-diff technique. This is an order of magnitude
bigger than anything else on the board, and it is dense in the top 2500: Morbid Opportunist #255,
Kutzil #385, Welcoming Vampire #428, Caretaker's Talent #648, Enduring Innocence #785, Tocasia's
Welcome #866, The Gitrog Monster #897, Evolution Witness #914, Kambal #1145, Simic Ascendancy #1259,
Coveted Jewel #1278, Duelist's Heritage #1281, Laelia #1297, Insidious Roots #1386, Dour Port-Mage #1485.

**The one-diff isolation — the surprise is what is ALREADY done:**
```
native-trigger   Whenever another creature dies, draw a card.
native-trigger   … draw a card. This ability triggers ONLY ONCE EACH TURN.   <- the RIDER is already modeled
body-only        Whenever ONE OR MORE creatures die, draw a card.            <- the ONLY blocker
body-only        Whenever ONE OR MORE creatures you control enter, …
```
The events are modeled. The once-per-turn rider is modeled. `detectTriggers` returns **0** on the
"one or more" phrasing — it is a pure DETECTION gap, and everything downstream already exists.

### ⛔ BUT IT IS A WAVE, NOT A SLICE — and the reason is a FALSE-POSITIVE hazard, not size

**"One or more" is NOT a synonym for the singular.** "Whenever one or more creatures die" fires **ONCE**
for a simultaneous batch; "whenever a creature dies" fires once PER creature. Mapping the plural onto the
existing singular detector would OVER-FIRE — a forbidden false positive (a board wipe would draw 5 cards
instead of 1).

And the phrasing spans **SEVEN events**, each with its own check function that batches independently:
```
  77  deal (combat damage)   57  are put (into a graveyard)   46  attack   39  leave
  28  enter                  20  die                           5  become
```
`checkDiesTriggers` iterates `for (const d of dead)` and fires per object. A batched trigger needs a
SECOND pass that fires ONCE per call when ANY member of the batch matches its scope.

### ⭐ THE PATTERN ALREADY EXISTS — copy `combatDamageBatch`, do NOT invent a mechanism

**This is the single most useful thing on this page: the engine ALREADY batches triggers.** The
combat-damage arm of this very family is built and shipped — Grim Hireling / Professional Face-Breaker /
Olivia ("Whenever one or more creatures you control deal combat damage to a player"). Its anatomy:

- **A DEDICATED EVENT NAME** — `combatDamageBatch`, *not* a `batched:true` flag on `combatDamageToPlayer`
  (`triggers.js` ~1532).
- **Its own check function** — `checkBatchCombatDamageTriggers` (`triggers.js` ~5148), which fires once
  per controller rather than once per object.
- **A `descriptorFilter` predicate on `triggersForEvent`** (already a supported parameter, ~4113) that
  gates a FILTERED batch on the actual matching objects — the documented no-over-fire gate.

**A separate event name is strictly better than the whitelist I sketched above.** The singular `dies`
path is then untouched *by construction* — an unbuilt event simply has no detection and no check
function, so over-firing is unrepresentable rather than merely gated. Ignore the whitelist idea; it was
written before this precedent was found.

### ✅ ARM 1 SHIPPED — `diesBatch` (`028a999b`). **Copy this shape for the remaining six.**

The reference implementation is done and is the deliverable; the +4 cards (Morbid Opportunist #255,
Vraan #4072, Sengir Connoisseur, Vengeful Townsfolk) are almost beside the point.

**The shape to repeat, per event verb:**
1. Detection: an ANCHORED `/^one or more (…) <verb>$/` arm returning a DEDICATED event name
   (`diesBatch`), normalising the plural subject to its singular form ("one or more other creatures" →
   "another creature") and handing it to the EXISTING `creatureSubjectScope` switch — scope semantics
   shared, never duplicated. Any rider fails the `$` → undetected → Arbiter (safe FN).
2. A `check<Event>BatchTriggers(state, objects)` modelled on `checkBatchCombatDamageTriggers`: loop
   watchers, and **`break` after the first matching object** — that one line IS the batching.
3. **Chain it from INSIDE the singular check function**, not at the call sites. `checkDiesTriggers` has
   10+ callers (combat, destroy, sacrifice, amass, SBA); wiring each is how a death path silently
   misses the pass.
4. **Mind the early-return fast path** — see the bug below.
5. The pin MUST include the n=3 once-only test AND its singular n=3 counterpart firing three times.
   The contrast is the whole safety argument.

**⚠️ THE BUG THE n=1 TEST CAUGHT — expect its twin in every remaining arm.** `checkDiesTriggers` ends
with `if (!fired.length) return state2`. A board holding ONLY batch watchers fires no SINGULAR trigger,
so that early return skipped the batch pass entirely: the card classified native and never fired. **The
n=3 test passed the whole time; only n=1 exposed it.** Every singular check function has an equivalent
fast path — check it before chaining.

**CONFIRMED ON THE SECOND ARM.** `checkGraveyardEventTriggers` has the identical
`if (!fired.length) return cleared` shape. Because this entry existed, placing the batch pass ABOVE it was
a five-second check instead of a second debugging session — and the only-batch-watcher test is pinned in
`gyLeaveBatchTrigger.test.js`. **Assume the trap is present in every remaining arm until you have looked.**

### 🔍 PER-ARM FEASIBILITY — CHECKED, and it is NOT six mechanical repeats

**The arm is only buildable if its check function already sees the WHOLE batch.** `dies` worked because
`checkDiesTriggers(state, dead[])` takes an ARRAY — deaths are naturally batched by the SBA. Verified
signatures for the rest:

| arm | check function | receives | verdict |
|---|---|---|---|
| ~~`are put` (57)~~ | `checkGraveyardEventTriggers(state)` | drains `pendingGraveyardEvents` | ✅ **DONE** `e05c796b` |
| ~~`attack` (46)~~ | `checkAttackTriggers(state)` | whole combat (all attackers at once) | ✅ **DONE** `eb701643` |
| ~~`leave` (39)~~ | `checkGraveyardEventTriggers(state)` — the GY half | drains `pendingGraveyardEvents` | ✅ **DONE** `22e2293d` (+13) |
| ~~`enter` (28)~~ | `checkEnterTriggers(state, enteredPerm)` | **ONE permanent** | ✅ **DONE** `619b9513` (+3) — via the rider, no batching |

**⚡ `attack` cost ONE LINE and no machinery — check for this before building any arm.** "Whenever one or
more creatures you control attack" is merely the OLDER TEMPLATING for "Whenever you attack" (CR 508.1);
both fire once per combat, so it maps straight onto the EXISTING `youAttack` event whose once-per-combat
pass long predates this work. **Before writing a batch check function, ask whether the modern wording of
that trigger already has a once-per-event home.** It flips 0 cards today (the five bare-form carriers —
Grand Warlord Radha #5380, Angelic Guardian, Ancestor Dragon — are blocked by their EFFECTS, not
detection), and it is recorded as 0 rather than counted.

**⛔ `enter` MUST NOT be built the same way — it would over-fire.** Entries are dispatched one at a time,
so an `etbBatch` watcher would fire once PER entering permanent: "create three 1/1 tokens" would make
Welcoming Vampire #428 draw THREE cards instead of one. Building it requires first teaching the entry
path to collect simultaneous entries (token creation, mass reanimation, blink returns) and dispatch them
as one batch — a separate, larger piece of work. **Do not treat `enter` as a repeat of `dies`; the
signature is the tell.**

**So the ready work is 142 cards (are-put + attack + leave), not 214.** Plus the 16 remaining `die`
carriers, which add subtype/nontoken filters to the shape already built. `become` (5) unchecked.

**Note the 77 "deal" cards are ALREADY partly served** by `combatDamageBatch`; the parked ones there
carry a variant its anchors reject (a qualified object, a rider, a colour filter). So the true remaining
volume is nearer 214 than 291 — do not claim 291 without re-measuring per event.

### ⚠️ THE PROBE LIED TWICE BEFORE IT WAS RIGHT — both corrections are baked in, do not undo them

This instrument reported TWO false veins before it was trustworthy. Both are the same class of error as the
line-deletion trap in THE PROBE RULE, and both are now fixed in the banked script:

1. **`parseEffectClause` is not the modeled-oracle.** It misses the LEGACY whole-card path
   (`parseSpellEffect`), so plain `"draw a card"` and `"destroy target creature"` reported as blockers —
   a 9-card phantom vein. Use `classifyCard` on a synthetic single-sentence card instead.

2. **The synthetic card must carry the SOURCE CARD'S TYPE.** Wrapping every sentence as an *Instant* means
   a PERMANENT'S STATIC can never classify native however well modeled. That reported
   `"you may play an additional land on each of your turns"` as a 4-card vein (Dryad of the Ilysian Grove
   #295, Oracle of Mul Daya #499, Wayward Swordtooth #986) when `extraLandDropsOf` has modeled it all
   along — Exploration and Azusa are `native-static` TODAY. Those three are parked for their OTHER lines
   (Dryad's basic-land-type layer effect, Oracle's play-from-top, Wayward's Ascend).

**Both were caught by checking the claim against the real cards BEFORE building.** That check costs one
command and it has now prevented two wasted slices in a single sitting.

## THE SHELF (secondary read — no longer the bar, kept because it is measured and true)

## THE TARGET — the real shelf, measured

Measure with the REAL profile dir, not the dev tree:
```
MTG_APP_ROOT="/c/Users/colto/AppData/Roaming/com.colton.mtg-tool" node app/scripts/measure-coverage.mjs
```

At run start: Slivers 100 · Vihaan 96 · Omnath 93 · Zaxara 90 · Mothman 90 · **Earth Bent 80 · cdh 79 ·
Dragons 76 · Jurassic 75 · Believe it 72 · Kellan 70 · Wolverine 70 · Captain America 69 · Kinnan 69.**

Blocking mechanisms, ranked by that same tool: 97 spell-effect · 78 ETB trigger · 35 attacks/blocks ·
33 upkeep/phase · 27 activated · 16 cast trigger · 15 static anthem · 11 aura/equip · 9 dies/LTB.

**Prefer mechanisms that appear across MULTIPLE decks** — one ETB pattern can move four decks at once.
That is the whole reason this target beats corpus %.

## THE DISCIPLINE (non-negotiable — this is what earned the autonomy)

1. Full suite + `eslint . --max-warnings 0` before every commit. Not the targeted tests — the FULL suite.
   It has caught things targeted runs could not (a dropped `"backup"` that silently un-credited 19 cards).
2. **Mutation-check every load-bearing change.** Break it on purpose, watch the RIGHT test fail, restore.
   A green test proves nothing until it has been seen to fail. Grep for the marker afterwards — a perl
   substitution has silently failed to apply before.
3. **THE PROBE RULE — a "would flip" probe must SIMULATE THE FIX AND CHANGE ONE VARIABLE.** This cost
   more time than anything else in the run; it misfired FOUR times, three of which I acted on before
   catching. The failure is always the same: **deleting the whole line** answers "is the REST of the card
   modelable?", which is not the question. The line carries the trigger, the condition, and the effect
   together, so a card blocked by any of them scores as blocked by the one you're studying.
   - **Right instrument:** substitute a KNOWN-GOOD equivalent for the one thing under test and re-classify.
     Swap the unknown token name for Treasure. Swap the unrecognized condition for "you control a Forest".
     Everything else on the card holds still, so the delta is attributable.
   - It turned a "68-card lever" into 15 real cards, and it killed a "5-card Lieutenant cycle" that was
     worth **zero** — the condition was never the blocker there, the compound static content was.
   - **Second clause:** a "would flip" probe measures whether the METRIC would credit a card. It says
     NOTHING about whether crediting it would be CORRECT. The tap-another-permanent mana sources "would
     flip" 5 cards and would mint phantom mana. Check the runtime can actually pay/execute before believing
     any number.

4. **Re-measure, don't infer.** When a flip count and a corpus delta disagree, isolate by disabling only
   that change and re-measuring. Twice this run the gap was innocent; assuming would have been wrong both times.
5. **Per-flip audit** anything over ~10 cards. Read the cards.
6. CI green on master before tagging. Never tag a red tree.
7. When a diagnosis and the runtime disagree, **the runtime wins** — and correct the written diagnosis in
   place rather than quietly rewriting it.

## IN FLIGHT

- **Nothing mid-edit.** Corpus **35.8%** (12,271/34,245 — +223 this run, net of 7 FP retractions). Suite **909 files / 11,668 tests**,
  lint 0, MUTANT sweep clean. FORTY-FIVE slices shipped on branch `claude/aura-enchant-noun-vocab` (NOT pushed;
  the branch name is stale — it carries forty-five unrelated slices and wants a rename before any PR).

  **PLAY-WEIGHTED — the bar:** top-1000 **72.1%** 🎉 · top-2500 **54.2%** · top-5000 **43.0%** · top-10k **35.8%**.
  (Session start: 69.6 / 51.8 / 41.5 / 34.7.)

### Shipped this stretch — EVERY ONE was "the engine knew the EFFECT, not the PHRASING"

| commit | slice | flips |
|---|---|---|
| `3259071d` | attached-bonus parser reads the host NOUN, not the literal `"creature"` | 0 — infrastructure |
| `48d8560c` | positive COLOR target restriction (CR 105.2), layer-aware | **+18**, incl. Red Elemental Blast #433 |
| `4f915ba6` | whole-graveyard exile (CR 701.10a) + mass-exile verb parity | **+10**, incl. Farewell #163 |
| `1fc6a1f8` | mana-value-filtered creature wipe (CR 202.3) | **+2**, incl. **Austere Command #169** |
| `40359cd4` | disjunctive power-OR-toughness bound | **+1**, Warping Wail #2046 |
| `45a9e771` | symmetric self-damage atom (CR 119.3) | **+1**, **Rakdos Charm #330** |
| `97415979` | mass own-board regenerate (CR 701.19) + `eachCreatureYouControl` scope | **+1**, Golgari Charm #1603 |
| `0361e27c` | opponent-scoped mass tap (CR 701.21a) — applier now honors non-chosen scopes | **+1**, Cryptic Command #1617 |
| `b7bf0e46` | counter an ABILITY on the stack (CR 701.5a) — new `stackAbility` target class | **+7**, Stifle · Bind · Trickbind · **Sublime Epiphany #1709** |
| `75dbd1a1` | repeatable modes (CR 700.2d) — `kMultisets` in the cast enumerator | **+5**, **Mystic #1431** · **Fiery Confluence #1561** |
| `028a999b` | batched DEATH triggers (CR 603.1) — new `diesBatch` event ⭐ reference impl | **+4**, **Morbid Opportunist #255** · Vraan #4072 |
| `eb701643` | batched ATTACK → the existing `youAttack` event (one line, no machinery) | **0** — detection half only, honestly scored |
| `22e2293d` | batched GRAVEYARD-LEAVE — new `gyLeaveBatch` event | **+13**, **Insidious Roots #1386** · Desecrated Tomb #4196 · Quintorius #9596 |
| `f682aadb` | scoped counters-put WATCHERS — the slice the source comment deferred | **+2**, Enduring Scalelord · Wickersmith's Tools |
| `e05c796b` | batched graveyard-ENTER + a silently-dropped zone filter ⚠️ | **+1**, Sidisi #3513 |
| `c5e68496` | BLINK / FLICKER (CR 400.7) + a splitter keep-whole guard ⚠️ | **+7**, **Ephemerate #440** · Cloudshift #792 · Blur · Momentary Blink |
| `a3488b65` | impulse-exile takes a COUNT (the runtime already existed) | **+2**, Act on Impulse · Rob the Archives |
| `db4e6d51` | SACRIFICED REFERENT (CR 608.2h LKI) — narrowed a safety guard ⚠️ | **+7**, **Fling #1462** · Thud · Bloodshot Cyclops |
| `484c3a0d` | …second reader off that stamp: GAIN-LIFE | **+7**, Reckoner's Bargain #3671 (family 14) |
| `6e030eb0` | …third reader: DRAW | **+2**, Life's Legacy #2490 (family 16) |
| `46798947` | …and the NATIVE-TRIGGER chain gets the same strip | **+1**, plus 42 cards RETIERED mixed→trigger (a better label, not a gain) |
| `f61fd1d6` | ⭐⭐ **THE RESIDUE CHAIN STOPS GUESSING** — measured GAINED 49 · LOST 0 · RETIERED 0 | **+49** corpus-wide; Abbot of Keral Keep · Sea Gate Oracle · Voldaren Epicure · Adaptive Omnitool |
| `6d892d21` | ⭐ **EQUIPMENT composes with its trigger** — a composition gap, not a card gap | **+8**, **Mask of Memory #1002** · **Goldvein Pick #2100** · Prying Blade · Skeleton Key |
| `2c90b6fa` | typed uncounterable — the read went per-PLAYER → per-SPELL | **+2**, Prowling Serpopard #3581 · **Surrak Dragonclaw #3186** |
| `58c1dd23` | ⚠️ subtype-scaled MANA — the vocabulary gate runs the OPPOSITE way | **+4**, **Elvish Archdruid #942** · Magus of the Coffers #5409 |
| `04a8e665` | activated-cost reduction for ARTIFACTS — the subject is a FILTER | **+1**, Forensic Gadgeteer #1374 |
| `44e2b391` | the "creature TOKEN you control" trigger scope — THREE states, not two | **+2**, **Curiosity Crafter #1734** · Anointer Priest #11214 |
| `469bee92` | ⭐ the **"ANOTHER" qualifier** (CR 109.5) — bounce target + ETB scope | **+7**, **Aether Channeler #1526** · **Garruk's Packleader #2014** · Paleoloth |
| `1b43caf7` | ⚠️ basic-land-SUBTYPE tap augment — a banked "can't" that wasn't true | **+2**, **Crypt Ghast #525** · Nirkana Revenant #2848 |
| `80261920` | untap target ARTIFACT / ENCHANTMENT / NONLAND PERMANENT — vocabulary, not machinery | **+6**, **Voltaic Key #1776** |
| `766bfabe` | ⭐ ENTERS-trigger multiplier — **two** fire sites (ETB *and* landfall) | **+4**, **Panharmonicon #261** · **Ancient Greenwarden #681** · **Yarok #2530** · Starfield Vocalist #2082 |
| `3b2ac11a` | ATTACK-trigger multiplier — Teysa's twin, shared expansion body | **+1**, **Isshin, Two Heavens as One #1456** |
| `d0d0c09c` | token-split + planeswalker EDICT pools — the sense IS the card | **+5**, **Sheoldred's Edict #1154** · **Accursed Marauder #464** · Angrath's Rampage · M.O.D.O.K. |
| `7a1fab1d` | type-filtered untap — the family's 3rd shape, PARAMETERIZED not a 3rd twin | **+3**, Unwinding Clock #545 · Drumbellower #1940 · Prophet of Kruphix |
| `ab92c504` | ⭐ **THE MISSING-CROSS FINDER** (probe) + COLOR×TYPE cost reduction | **+4**, the **Monument cycle** #664 · #1009 · #1879 · #2151 |
| `9d1e4f8b` | lands-only play-from-top — needed a NEW spell gate to stay honest | **+2**, **Oracle of Mul Daya #499** · **Courser of Kruphix #1232** |
| `d1cc3eb4` | the you-scoped land doubler — an empty CELL, zero new machinery | **+2**, **Mirari's Wake #680** · Zendikar Resurgent #2260 |
| `0168559a` | ⭐ **WAVE B — the ATTACK TAX** (CR 508.1g): restriction + payment as ONE change | **+3**, **Propaganda #115** · **Ghostly Prison #161** · Windborn Muse #1011 |
| `b9d1d3c9` | ⭐ THE DRAIN MIRROR — lifegain⇄lifeloss, one UNBLOCKED + one RE-POINTED | **+6**, **Sanguine Bond #496** · **Vito #492** · **Exquisite Blood #508** · Bloodthirsty Conqueror #901 |
| `619b9513` | ⭐ WAVE C — batched-ETB filter, WITHOUT the batch machinery | **+3**, **Welcoming Vampire #428** · **Tocasia's Welcome #866** · Enduring Innocence #785 |
| `3c3fd256` | ⭐ WAVE A — copy an instant or sorcery (CR 707.10) | **+5**, **Reverberate #1380** · Reiterate · Twincast |
| `9381112d` | impulse NEXT-TURN window — controller-scoped expiry ⭐ | **+6**, **Light Up the Stage #1211** · Reckless Impulse #2120 · Wrenn's Resolve #2116 |

### ⭐ THE MISSING-CROSS METHOD — `app/scripts/probe-near-miss-clauses.mjs` (banked 2026-07-28)

Four slices in a row were the same shape and **none was a new mechanic**: a parked clause sitting one
word from a clause the engine already reads, with the runtime for it fully built. A grid whose other
cells exist and whose corner nobody closed.

```
MANA DOUBLER          all players            controller ("you tap")
  land                MF-1 Mana Flare ✓      ← Mirari's Wake sat HERE
  nonland             —                      MD-1 Kinnan ✓

COST REDUCTION        color only             color × card-type
                      Ruby Medallion ✓       ← the Monument cycle sat HERE
```

**Run it before hunting named staples.** `--maxRank=2500 --distance=1` is 28s and returned 23 honest
candidates. `--distance=3` widens to 157.

⚠️ **NEAR ≠ EASY.** "Destroy target creature" and "Exile target creature" are one word apart and
different subsystems. The probe sizes the candidate list; the build still opens the file.

⚠️ **AND THE PROBE'S FIRST TWO RUNS WERE BOTH WRONG.** `land` is inside `NATIVE_TIERS`, but a land is
credited *wholesale by its type line* — its printed abilities may be entirely unmodeled. Harvesting
land text as "shapes the engine reads" produced a confident false lead (Ashnod's Altar ← Phyrexian
Tower, whose sac-for-mana is **not** modeled); excluding lands from the harvest *alone* was worse —
they fell into the parked branch and the report's whole top became phantom "blocks 13 cards" clusters.
Lands are skipped outright now. **A ranked list of plausible leads is exactly the output that doesn't
announce when it's wrong.** Verify against the corpus, never off the report.

**⚠️ THE CHEAP CROSSES ARE EXHAUSTED.** Twelve of the original nineteen distance-1 rows shipped this
run; the remainder is **wave-sized, not slice-sized**. Checked card by card, not assumed — each row
below needs a subsystem that doesn't exist yet, and each is worth roughly ONE card.

| card | what it actually needs | flips |
|---|---|---|
| Aqueous Form #735 | an `unblockable` grantable pseudo-keyword + enforcement in canBlockAttacker | 1 of 2 |
| Blade of Selves #905 | the MYRIAD keyword itself (unbuilt) | 1 |
| Reprieve #633 | a SPELL target class for bounce — only counters can target the stack today | 1 |
| Mother of Runes #512 | protection-from-a-chosen-colour, as an activated grant | 1 |
| Deafening Silence #1946 | a per-turn cast limit filtered by card type | 1 |
| Helm of Awakening #1889 | a SYMMETRIC cost reducer — the collector is controller-only by construction | 1 |

✅ **The can't-be-countered AND is DONE** (`2c90b6fa`) — it was the last row with a better-than-one-card
ratio, so **everything left in this table is subsystem work**: a keyword, a target class, or a scope the
engine doesn't express.

**`--distance=2` on the top-2500 was then run** (44 blockers) and it does NOT change that picture — the
new rows are all one card each, but they're cheap-looking and un-triaged, so they're recorded rather
than lost:

| card | the gap | note |
|---|---|---|
| Stormfist Crusader #1913 | `each player` vs `target player` draws-and-loses | an eachPlayer arm on a compound upkeep payoff |
| Spine of Ish Sah #2486 | "when this **artifact** is put into a graveyard…" vs "this **aura**" | a noun widening on the self-return; its ETB destroy already parses |
| Junk Diver #1977 · Myr Retriever #875 | dies + **another** target artifact card in your graveyard | ⚠️ "another" here excludes a GRAVEYARD card, and `notSource` matches battlefield permanent ids — not the same restriction |
| Adaptive Omnitool #2237 + 3 | an equipment trigger whose effect spans SENTENCES | the trigger-sentence strip can't fold them — a different gap in a different chain |

✅ **Goldvein Pick was looked at first and it paid — 8 cards, not 1** (`6d892d21`). The equippedCreature
scope was never the problem; two TIERS couldn't talk to each other, and each understood its own half.

⭐ **That is the transferable lesson of this whole run.** When a near-miss row can't be explained by its
own one-word diff, spend ONE probe on *why not* before writing it off as a one-card cross. Three of the
biggest finds today — the mana-doubler cell, the untap type list, this one — were all "the machinery is
built, the composition isn't."

### 🔶 THE NEXT PROBE TO RUN — `app/scripts/probe-residue-artifacts.mjs`

Asks the sub-gates directly instead of reading the tier: for every parked card, does EVERY detected
trigger route, is EVERY activated ability modeled, and was every trigger-SHAPED sentence actually
DETECTED (that third check is not optional — without it Archaeomancer's Map reported as a candidate
because its ETB routes while its second trigger isn't detected at all, so "every detected trigger
routes" passed vacuously). **68 such cards in the top-2500.** It prints the leftover text so a genuine
unmodeled static can be told from a residue artifact by eye.

Reading that list, the big remaining cluster is **EQUIPMENT/AURA grants the layer engine can't express**:
unions ("can't be blocked and has shroud"), conditionals ("as long as equipped creature is legendary"),
myriad, nonbasic landwalk. Most are honestly parked. See the attached-unblockable entry under
BLOCKED / REFUSED before touching any of them — that seam bites this whole cluster.

### ✅ DONE — the residue chain's trigger strip was a REGEX GUESS (`f61fd1d6`, +49 · LOST 0)

Chasing the four Equipment that still park (Adaptive Omnitool #2237 · Sword of Hours · Reaper's Talisman
· Mask of Immolation) leads somewhere general. Every residue chain in `coverage.js` strips trigger
sentences with

```js
.replace(/(?:^|[\n.;]\s*)(When|Whenever|At)\b[^.]+\./gi, "\n")
```

`[^.]+` stops at the FIRST period. So a trigger whose EFFECT spans sentences — Adaptive Omnitool's
"look at the top six… You may reveal… Put the rest on the bottom…" — is verified as modeled by
`allTriggerSentencesModeled` (the span matchers fold it into one trigger, correctly) and then leaves its
2nd and 3rd sentences behind as *apparent residue*, sinking a card every piece of which is understood.

The accumulated `.replace()` tail-strips (reflexive "if you do", the entering-pronoun pump, the
counters-on-it tail) are all **patches on that one wrong assumption** — each added when a specific card
fell through.

**Shipped.** Strip what detectTriggers actually consumed — `effectClause`, which carries the WHOLE folded
effect (`sourceText` does not; it truncates at the first period, so the obvious field is the wrong one).
**GAINED 49 · LOST 0 · RETIERED 0**, measured per card.

⭐ **`app/scripts/tier-snapshot.mjs` is the tool that made this safe and is the reusable part.** A TOTAL
can hide a swap — five gained and five lost nets zero and reads as "no change". For any change to a
SHARED path (a residue chain, the layer engine, a splitter) run it before and after and diff per card;
it classifies every movement GAINED / LOST / RETIERED and exits non-zero on any LOST.

⚠️ **TWO BUGS ON THE WAY, both worth knowing:**
1. **My licence was wrong.** I claimed `allTriggerSentencesModeled` proved every sentence parses HIGH so
   stripping was free. It doesn't — that gate passes for triggers whose folded follow-up is unmodeled,
   and for those cards *the residue check is the only guard*. Four FP pins went red. The licence is
   per-descriptor `triggerRoutesNatively`. **Measured afterwards, it is inert today** (remove it: suite
   green, diff zero) — labelled as belt-and-suspenders in both source and test rather than sold as a guard.
2. **`\s` matches a NEWLINE.** The strip swallowed the line break, welded the NEXT oracle line onto the
   stripped one, and hid it — Drowner of Hope credited native with a real unmodeled ability.
   `tokenAbilityGrantResidue.test.js` pins that exact card for that exact reason, **from a previous
   author's previous attempt at this same idea.** I reproduced it verbatim. Horizontal whitespace only.

**FOUR scope pins graduated, every one DRIFTED into looking like a safety pin** — each was parking its
card only because the residue chain left a sentence behind, for a reason that had stopped being true:
the optional discard, Blood tokens, the folded `damageRider`, and — on the trigger chain — a
discard-CHOICE from a trigger, which now fires, resolves, and pauses with correctly filtered candidates.
Verified end to end, not assumed.

⭐ **THE PATTERN, banked because it will recur:** a residue check that parks a card for the WRONG reason
looks exactly like one that parks it for the right reason, and the pins written on top of it age into
false confidence. That is why the **per-card tier diff — not the total —** is what makes this class of
change safe to attempt at all.

**NOT crosses, don't re-diagnose:** Shriekmaw #1546 — its "sibling" is also unparsed. Jhoira's Familiar
#1035 — "historic" isn't a type-line token, and that refusal is CORRECT.

**Deliberately NOT taken:** the Altar family (Ashnod's #132, Phyrexian #307, Skirk Prospector #1351,
Krark-Clan Ironworks #1356 — 12 corpus carriers). A costless "Sacrifice a creature: Add {C}{C}" needs
the mana model to pick a *victim* at production time; the modeled sibling sacrifices the SOURCE. Real
work, not a cross — but the best-sized unbuilt mana lever on the board.

### 🔶 THE TRIGGER-MULTIPLIER FAMILY — three of five shapes built; the 4th is scoped and NOT worth it

"If <event> causes a triggered ability of a permanent you control to trigger, that ability triggers an
additional time." All of it now shares one expansion body (`multiplyTriggers`, parameterized by its
counter) and one `triggerMultiplierCount` walk, so the distinct-instance rule can't fork.

```
  ✅ DIES     Teysa Karlov #1270                                  (pre-existing)
  ✅ ATTACKS  Isshin #1456                                         3b2ac11a
  ✅ ENTERS   Panharmonicon #261 · Greenwarden #681 · Yarok #2530   766bfabe  ← FILTERED, two fire sites
  ⛔ CAST     Veyran #789 · Wulfgar #4729 · Felix Five-Boots #4799  — not attempted
  ⛔ SOURCE   "a triggered ability OF <filter> you control"         — MEASURED AND DECLINED, see below
```

**The SOURCE-filtered shape is the one to skip, and here is the receipt.** It multiplies ANY trigger
from a matching permanent regardless of event, so it can't ride an enqueue site — it wants a pass at
the `flushTriggers` chokepoint, which is more surface than any slice this run. A one-diff probe on all
seven carriers says the payoff is **2 cards**: Harmonic Prodigy #676 and Katara #4836, and BOTH need a
subtype filter with an "another" exclusion. Delney #854, Annie Joins Up #1033 and Echoes of Eternity
#1505 all stay parked on their OTHER text even with the multiplier free. Don't build it on the
strength of the name recognition.

Also parked with a NAMED reason, not an oversight: Naban #6168 and Traveling Chocobo #2035 (controller-
qualified / subtype entry filter), Elesh Norn #1003 (her second static HALVES opponents' triggers — a
genuinely different mechanism), Drivnod #1801 (Teysa's own twin, blocked on its activated ability).

### 🔶 IMPULSE-EXILE — the COUNT is done; the **NEXT-TURN WINDOW** is the remaining 22 cards

`a3488b65` generalised the count only. The family splits cleanly by (count / window), measured:
```
  27  N>1 / this-turn    ✅ machinery done (a3488b65) — most still parked on their OTHER text
  22  N>1 / NEXT-TURN    ⛔ BLOCKED — needs a controller-scoped expiry
  10  N>1 / other        (until-your-next-end-step, "one of those cards", filtered)
```

### ✅ THE NEXT-TURN WINDOW IS DONE — `9381112d` (+6). The pattern below is reusable for any "your next turn".

Solved WITHOUT arithmetic on the turn counter: the stamp carries the **OWNER** plus its creation turn, and
`gameEngine.finishCleanupActions` lapses it when a turn ENDS that (a) belongs to that owner and (b) began
after the stamp. Cleanup runs BEFORE the turn advance, so `state.activePlayer` is the ENDING turn's player —
that is the fact the whole rule rests on. Correct for both castings (own turn / opponent's turn), pinned in
`impulseExtendedWindow.test.js`.

**TWO SITES, DELIBERATELY ASYMMETRIC — copy this shape.** The offer gate (`legalChoices`) treats the mere
PRESENCE of an extended stamp as permission; ONLY the cleanup knows when it dies. Giving both sites the
window logic is precisely how they drift; giving exactly one the authority removes the possibility.

**Reuse it for any other "until your next turn" effect** — the same owner-plus-stamp-turn trick applies and
needs no scheduler.

**⛔ THE ORIGINAL ANALYSIS (kept — it is why the fix took the shape it did): do not "just add turn + 1".** `state.turn`
increments once per PLAYER turn, so in a 4-player game "until the end of YOUR next turn" is roughly
`turn + 4`, not `turn + 1`. The shipped `_impulseTurn === state.turn` gate and the cleanup that strips it
both assume a single-turn window. Reusing that stamp closes the window at the WRONG MOMENT — a wrong
effect, not a missing one. `templateMatchers.matchImpulseExilePlay` documented this refusal before I got
here and it still stands.

**The shape of the fix:** stamp a controller-scoped expiry (an `_impulseUntil` keyed to the controller's
next turn, or schedule the lapse through the delayed-trigger scheduler that already exists) and change BOTH
the offer gate (`legalChoices.actionsPlayImpulseFromExile`) and the cleanup (`gameEngine
.clearImpulsePlayPermissions`) to read it. Two sites, and they must not drift.

**⚠️ ALSO: read the printed wording before writing the matcher.** My first pass admitted "them" but not
"those cards" and flipped ZERO cards — "those cards" is the dominant printed referent (6 carriers vs 3).
The fix took seconds; finding it took a corpus dump. Dump the real sentences first.

### ✅ BLINK / FLICKER — SHIPPED `c5e68496` (+7). The lesson below outlived the blocker; keep it.

**Ephemerate #440 · Cloudshift #792 · Blur #2252 · Momentary Blink #2675 · Acrobatic Maneuver #5574 ·
Personify · Settle Beyond Reality.** The atom was pure composition (moveCardToZone off the battlefield →
`enterCardFromZone` back on); the real work was the splitter, described below, which is why the original
"blocked" analysis is kept rather than deleted.

### ☠️ THE SPLITTER'S SAFE-FAILURE ASSUMPTION HAS AN EXCEPTION — the generalisable finding

`splitClauses` reasons, in its own comment, that a mis-split *"just yields an unmodeled clause → low →
Arbiter, never a confident wrong partial."* **That is true only when every fragment is individually
unmodelable.** Blink is the counter-example:

```
"Exile target creature you control, then return that card to the battlefield under your control."
   split →  "Exile target creature you control"            <- parses HIGH, entirely on its own
            "return that card to the battlefield…"          <- fails
```
**⚠️ CORRECTION TO MY OWN FIRST WRITE-UP (verify before repeating it).** I first recorded this as the card
*"becoming a spell that exiles your creature and never returns it."* **That overstated it — the hazard was
LATENT, never live.** The trailing fragment is LOW on its own, so the whole program was LOW and the card
PARKED. Nothing ever played wrong. Checked by parsing the orphaned fragment in isolation.

The accurate statement, which is still worth the guard: **the card's safety depended entirely on the
TRAILING fragment failing to parse.** The leading one is a complete, confident instruction. The day anything
teaches the parser "return that card to the battlefield" in isolation — a plausible future slice — the card
flips native meaning *exile, then return something unbound*. The split moved the safety from "by
construction" to "by luck", and that is what the keep-whole guard restores.

**THE RULE: before trusting a split to fail safe, parse the LEADING fragment alone.** If it is HIGH, the
split is not safe and the sentence needs a keep-whole guard (the mechanism the conditional-rider seams at
`splitClauses` ~455/473 already use).

### ✅ HUNTED FOR LIVE FALSE POSITIVES OF THIS CLASS — **found none.** Do not re-run this.

The obvious follow-up worry: are there NATIVE cards where a split orphaned a back-reference ("it", "that
card", "those creatures") and the fragments all parsed anyway — i.e. cards playing the wrong effect today?
Swept all **11,141** native cards for a split fragment OPENING with a back-reference. 158 flagged; the
highest-value ones were checked by hand and **every one is correctly bound**:

```
Swords to Plowshares #11  exile + controllerRider{gainLifePower}
Path to Exile #15         exile + controllerRider{rampBasic, entersTapped}
Beast Within #25          destroy + controllerRider{createToken 3/3 green Beast}
Swan Song #71             counter + controllerRider{createToken 2/2 blue Bird, Flying}
Assassin's Trophy #124    destroy(opponent) + controllerRider{rampBasic}
Pongify #155              destroy + cannotRegenerate:true + controllerRider{createToken}
Inspiring Call #270       draw{requiresCounter} + grant-keywords-group{requiresCounter}  ← scope matches
```

**⚠️ AND THE INSTRUMENT CORRECTION, which is why the 158 is not a finding:** `splitClauses` output is **NOT
the parser's final clause set.** The SPAN MATCHERS (`spanMatchers.js`) fold multi-sentence patterns —
"…Its controller creates a 3/3" becomes a `controllerRider` ON THE SAME ATOM — before/independently of the
clause split. So reading `splitClauses` alone massively over-reports orphans. **To reason about what the
engine actually does, read the ATOMS of `parseEffectProgram`, never the clause split.**

Blink was reachable only because no span matcher covered its shape. The class is otherwise well defended.

### 🔵 THE ORIGINAL BLOCKED ANALYSIS (kept — it is how the above was found)

**Ephemerate #440 · Conjurer's Closet #485 · Cloudshift #792 · Essence Flux #928 · Blur #2252 · Momentary
Blink · Splash Portal · Acrobatic Maneuver · Siren's Ruse …** — a core Commander mechanic at 0 native.

**ATTEMPTED AND REVERTED THIS SESSION — read this before re-attempting.** The atom and applier are
straightforward and were written: blink is pure COMPOSITION of two existing chokepoints —
`moveCardToZone` off the battlefield (fires LTB) then `enterCardFromZone` (the same helper reanimation
uses, fires ETB). CR 400.7's "new object" (fresh id, no counters, summoning-sick) follows for free because
`enterCardFromZone` mints a new permanent.

**The blocker is upstream of all that.** `splitClauses` breaks the printed sentence on ", then":
```
"Exile target creature you control, then return that card to the battlefield under your control."
  ->  ["Exile target creature you control",
       "return that card to the battlefield under your control"]
```
So a whole-clause matcher is UNREACHABLE — the first fragment parses HIGH on its own (a plain exile!) and
the second fails, dropping the card. Writing the atom without fixing the splitter produces dead code, which
is why it was reverted rather than left in the tree.

**THE FIX, with precedent:** `splitClauses` already carries normalize FOLDS that rewrite a sentence before
the split — see the WHEEL fold (~line 120) turning `"each player discards their hand, then draws N cards"`
into two properly-subjected sentences. Blink needs the mirror: a fold that keeps the two halves together (or
rewrites them into one recognisable clause) so the matcher sees the whole thing.

**Do it in a session with room.** `splitClauses` shapes EVERY card's parse, so it is the highest-blast-radius
file touched by this vein — worth the full suite between each step, not a tail-end slice.

**⚠️ And note the shape of the trap:** the first fragment parsing HIGH as a bare exile is exactly the kind of
partial success that could ship a card which EXILES a creature and never returns it. Any future fold must be
paired with a runtime test that the creature comes BACK and its ETB fires.

### 🩸 THE SACRIFICED REFERENT — `db4e6d51`. Capture is GENERAL; only the DAMAGE arm reads it yet.

`state.sacrificedForCost = { power, toughness, manaValue }` is stamped by actionDispatcher at COST-PAYMENT
time (the only moment the victim is still on the battlefield — CR 608.2h + 603.6e LKI), read back through
`countForSpec` kinds `sacrificedPower` / `sacrificedToughness` / `sacrificedManaValue`, and the phrase lives
in the SHARED `parseCountSource` so every scaling atom family gets it from one edit.

**~84 parked cards reference this** (29 power · 23 mana value · 18 toughness · 7 "power to any target").
Family is at **14 native** after two readers (damage `db4e6d51`, gain-life `484c3a0d`).

**⭐ THE SHAPE OF THE REMAINING WORK: this vein is ONE capture plus N SMALL READERS, not one fix.** Each
atom family carries its OWN "equal to …" grammar rather than sharing one, so the stamp has to be read
per-family. Every reader so far has been a two-line sibling of an existing `the triggering creature's …`
arm in the same file — find that arm, copy it, swap the count kind. Near-mechanical.

**⚠️ TWO TRAPS INSIDE THAT, both hit for real:**
1. The triggering-creature arms are SENTINEL-gated ("the triggering creature's …" is text `detectTriggers`
   writes INTO a trigger, never printed on a spell). Assert a new reader at the CLAUSE level, not with a
   whole-card fixture — a card fixture tests the sentinel gate instead of your arm and fails for the wrong
   reason.
2. **Check whether the sibling arm you are copying TAKES A TARGET.** The draw family's neighbour is
   "draw cards equal to the power of TARGET creature", which does. The sacrificed referent is the
   ALREADY-PAID cost, so `targetType` must be null — copying the neighbour would make the spell demand a
   target it never prints (a wrong cast, not a missing one). Pinned with both arms side by side.

**⚠️ AND A PROBE CORRECTION — do not trust a "governing verb" bucket without checking the tier.** Bucketing
this vein by verb reported 9 parked gain-life cards; most were not gaps at all. Miren, the Moaning Well is
`land` tier (already counted playable), Animal Boneyard and Bloodshot Cyclops had ALREADY flipped, and Life
Chisel is blocked by "Activate only during your upkeep" — not the referent. Check the tier and the ACTUAL
blocker before queueing from a verb bucket.

Next reads, cheapest first:
```
~~gain-life  equal to the sacrificed creature's toughness   Reckoner's Bargain #3671~~  ✅ 484c3a0d
discard    a number of cards equal to its power           Tormented Thoughts #22752 — needs a NEW discard-scaled matcher (the arm is absent even for the ordinary count form)
tutor      a creature with mana value X or less           Eldritch Evolution #728
```

**⚠️ I NARROWED A REAL SAFETY GUARD HERE — read before touching it again.** `castModifiers` refused ANY body
referencing the paid cost, on the stated grounds that such an effect *"can't be fed the cost details."* That
was true until this slice. It is now narrowed to admit ONLY the three modeled magnitudes; an object
reference, an unmodeled characteristic, or a discard/exile self-reference still parks the card.

**AND THE HONEST LIMIT, found by mutation:** deleting that guard entirely leaves every "still refused" test
PASSING. The guard is **belt-and-suspenders** (its own comment says so) — the UNDERLYING PARSE is what
refuses those bodies. No reachable input makes it load-bearing, which is exactly why narrowing it was safe.
The pins are labelled in-file as INTENT, not proof. **Do not cite them as evidence the guard works.** The
capture-and-read chain IS mutation-verified separately.

### ☠️ THE DESCRIPTOR WHITELIST SILENTLY DROPS UNLISTED FIELDS — this nearly shipped an over-fire

`detectTriggers` rebuilds every descriptor through an **explicit field whitelist** (`triggers.js` ~3171).
A key your detector returns that is NOT listed there **vanishes with no error**. On the gyEnterBatch arm
that meant `gyFromZone` never reached the check, so **Sidisi fired on EVERY graveyard entry** instead of
only on a mill — a live over-fire.

**Why nothing caught it:** the card classified `native-trigger` either way, so the tier was unchanged; the
full suite was green; and the trigger DID fire, just too often. It surfaced only because a probe printed
the descriptor field and it read `undefined`.

**THE RULE: after adding any new descriptor field, print the descriptor and confirm the field survives
`detectTriggers` before writing a single test.** A test written first would simply have encoded the
dropped-field behaviour as correct. The whitelist entry now carries a warning comment for the next field.

### ⚠️ NOT EVERY "ONE OR MORE" NEEDS BATCHING — the counters arm proves the rule has an exception

`f682aadb` looked like a seventh batch arm and is NOT one. **One `addCounter` event places N counters on ONE
permanent**, so "one or more counters are put on…" is already satisfied per event — and a spell putting
counters on three creatures correctly fires THREE times, because the plural counts COUNTERS, not creatures.
A batch pass there would have been WRONG (an under-fire).

**The test to apply per arm: does the plural quantify the OBJECTS the event is about, or something INSIDE a
single object's event?** Deaths/graveyard-leaves quantify objects → batch. Counters quantify counters on one
object → no batch. Getting this backwards is a silent wrong-count in either direction.

Its real hazard was different and worth remembering: the watcher pass needed a `scope !== "self"` guard,
because `scopeMatches` also matches a SELF descriptor when the watcher happens to BE the receiving
permanent — which the self loop already fired. Without it every self-trigger fires TWICE.

**The last three flip 1–2 cards each and are still the right work** — that is the entire point of the
play-weighted target. Austere Command #169 and Rakdos Charm #330 are worth more than fifty pieces of jank,
and the corpus % barely notices either. Do not judge a slice by its corpus delta any more.

### ⚠️ THREE SCOPE-BOUNDARY PINS GRADUATED THIS STRETCH — read the pin's COMMENT before judging it

`gyExile.test.js` (whole-graveyard exile) and `planeswalkerLoyaltyCompletion.test.js` (the MV wipe, listed
among near-misses of the POWER anchor) each fired against new work. **Neither was a safety pin.** Both were
markers for what a PRIOR slice deliberately didn't build, and `gyExile.test.js` already documented the exact
graduation ritual for Scarab Feast. Each was retired the same way: annotate the graduation in place, point
at the new test file, and keep the genuine refusals (the filtered whole-zone wording; the strict
"greater than"; the toughness bound) alive in the new file.

**A scope marker graduates when the machinery lands. A safety pin never does. Both look like a red test —
the comment is what tells them apart.** This is now 3 graduations vs 0 wrongly-dropped pins.

### ⭐ AND ONE **BEHAVIOURAL** PIN FIRED — a different animal, handled differently

`counterWiring.test.js` asserted Cryptic Command is never offered at an empty stack. That was CORRECT while
its unmodeled tap mode dropped the whole card below HIGH and made it a blanket counter. Once the mass-tap
scope landed it became a real modal card, and CR 700.2 says a "Choose two" whose counter mode has no legal
target is still castable via two OTHER modes — so continuing to withhold it would itself be the bug,
making the card uncastable in a whole class of board states.

**The procedure that made this safe, and the one to repeat:** do NOT edit the test to match the new
behaviour. First ask the ENGINE what it now does. A throwaway probe printed the offers — exactly one
combination, `[2,3]` = tap-all + draw, the only legal pair on an empty stack and empty board. Only THEN
was the assertion replaced, and replaced with a STRONGER one: offered, exactly one combination, and the
counter mode never present in ANY offered pair (CR 601.2c). *"Offered at all"* is the weak assertion that
would have let an illegal combination through.

**Three pin types, three responses.** SCOPE marker → graduate with a pointer to the new file. SAFETY pin →
never retire. BEHAVIOURAL pin → verify against the engine, then replace with a tighter assertion.

**Running count: 6 scope graduations + 1 behavioural replacement, 0 safety pins dropped.** The fourth was
`parser.test.js`'s MUST_DROP_TO_LOW merge gate, which listed "Counter target activated or triggered
ability." annotated *"an ability is not a spell"* — a scope marker for the counter-SPELL slice. Note that
file already documents its OWN graduations (Windfall, fixed-N at-random discard), so the convention was
there to follow rather than invent: move the entry out, leave a NOTE naming the positive pin.

**Every one of these fired on a green suite that had just passed.** They are the reason the "full suite,
not the targeted tests" rule exists — a targeted run would have shipped all five silently.

`3259071d` flips NOTHING on its own and is recorded that way rather than dressed up. It still earned its
place: the subject sniff was misfiling `"Enchanted permanent …"` Auras as EQUIPMENT, and the metric's
no-untap gate was NARROWER than the runtime matcher it was supposed to describe. Its second half — the
Enchant SUBJECT vocabulary plus the offer / CR 608.2b / CR 704.5n wiring — is measured at **+15** and is
deliberately deferred, because the play-rank data says modal staples outrank it.

### ⭐ A PRIOR CREED PIN FIRED AND WAS **GRADUATED**, NOT DROPPED — the precedent matters

`gyExile.test.js` pinned `"exile target player's graveyard"` as low, commented *"whole graveyard, not a
single card"*. That is a **SCOPE-BOUNDARY marker** left by the single-card slice, NOT a safety pin — and
the very same file records the identical graduation for Scarab Feast once ITS machinery landed. So the
line was retired the documented way: the near-miss intent lives on (the filtered wording
`"exile all creature cards from all graveyards"` is still refused, now pinned in the NEW file), and the
graduation is annotated in place with a pointer to `exileGraveyardZone.test.js`.

**Read the pin's COMMENT before deciding it is stale.** A scope marker graduates when the machinery lands;
a safety pin never does. Both look like a red test.

### 🎯 THE LIVE QUEUE — top-2500 staples, each ONE small effect away (probe-verified, not guessed)

The modal WRAPPER is already built and is genuinely sophisticated (escalate, "choose one or more", even
Akroma's-Will conditional-both). `effects/parser.js:602` is the whole story: **one mode that parses low
kills the entire card.** So these are single-effect builds, not mechanic builds:

Re-measured after this stretch — **27 parked modal instants/sorceries in the top 2500, 26 blocked by ≥1
mode.** Regenerate the list any time with `scratchpad/modes.mjs` (it prints both the ranked failing modes
and the one-mode-away shortlist). ~~Austere Command~~, ~~Warping Wail~~, ~~Rakdos Charm~~,
~~Red/Null Elemental Blast~~ are DONE. Still one mode away:

- ~~**Golgari Charm #1603**~~ ✅ `97415979` · ~~**Cryptic Command #1617**~~ ✅ `0361e27c` ·
  ~~**Sublime Epiphany #1709**~~ ✅ `b7bf0e46`
- **Flame of Anor #1760** — `if you control a Wizard as you cast this spell, you may choose both` (the
  Akroma's-Will conditional-both lead, generalized off "commander" to an arbitrary permanent type)
- **Dawn Charm #2079** — `counter target spell that targets you`
- **Hull Breach #2368** — `destroy target artifact and target enchantment` (TWO targets in one mode)

**⛔ DEFERRED WITH A REASON — Archmage's Charm #1746** (`gain control of target nonland permanent with mana
value 1 or less`). Looks like noun vocabulary; it is not. `control.js` line ~82 hard-refuses a non-creature
target (`if (t?.type !== "creature") continue`), so this needs control-change extended to arbitrary
permanents — which touches layers, mana abilities, and the soulbond teardown. That is a WAVE, not a slice,
for one card. Do not start it as a "quick vocabulary fix"; that misread is exactly what the deferral records.

**Two modes away** (so cheaper than they look — count is not cost): Prismari Command #1108 wants
`target player creates a Treasure token` AND `target player draws two cards, then discards two cards`;
both are player-scoped versions of effects that already parse for the controller.

**24 cards** want REPEATABLE modes (`"you may choose the same mode more than once"` — the Confluence cycle
incl. Mystic #1431 / Fiery #1561, plus the Season cycle). Needs multiset expansion in `expandCastChoices`;
a wrapper feature, bigger than every single above, and the largest remaining modal lever.

**24 cards** additionally want REPEATABLE modes (`"you may choose the same mode more than once"` — the
Confluence cycle incl. Mystic #1431 / Fiery #1561, plus the Season cycle). That needs multiset expansion
in `expandCastChoices` — a wrapper feature, bigger than the singles above.

### ⛔ MEASURED AND CLOSED THIS STRETCH — do not re-derive

- **Graveyard exile was 0-native/62-parked before `4f915ba6`.** The remaining 52 are blocked by OTHER
  text, not by the zone exile.
- **`exile all artifacts and enchantments`** still parses low (the clause splitter appears to break on
  `" and "` before the matcher sees it). Not needed for Farewell; unexamined beyond that.
- **Pyroblast / Hydroblast are DELIBERATELY not claimed.** They word colour as a post-hoc condition on an
  UNRESTRICTED target (`"counter target spell if it's blue"`) — a different rule from the adjective form,
  and pinned as a CREED test so surface similarity cannot sweep them in later.
- **The play-weighted view already existed** in `measure-coverage.mjs`. Making it the TARGET is what
  changed; the instrument was not missing.

## 📊 THE SPLIT IS LIVE WITH THE REAL MAPPING — the two bars, measured

Omnath supplied `deck-owners.json` from [[reference_deck_sources]] (Colton's Archidekt table + Joe's
Moxfield table, user `Blocks420`, verified live). All 16 decks assigned, nothing unassigned:

```
  92%  colton   (457/499 across 5 decks)     below the bar: cdh 79%
  73%  joe      (802/1098 across 11 decks)   below the bar: 10 of 11
```

**The two bars are now separately readable, and they say different things.** PLAYABILITY (Colton's own
decks — can the one real user play his own decks?) is 92% and blocked by a SINGLE deck. POD REALISM (Joe's
decks — can he sim his playgroup?) is 73% across 11 decks and is a broad grind. The old single 79% could
not distinguish "one deck from done" from "ten decks out", which is exactly why it was worth splitting.

**"Believe it!" is Joe's Yuriko** — neither of us could place it because the deck is named for the
catchphrase, not the commander. Closed in both our notes.

**A near-miss worth keeping:** Omnath nearly mis-assigned *Halfshell heroes* to Colton by reasoning from the
crossover pattern (TMNT → Colton's `deck_raph_and_mikey`). The registry carries a note written for exactly
that trap — TWO different TMNT decks exist; Joe's "Halfshell heroes" is NOT Colton's "Raph & Mikey", which
isn't built and isn't in the app. **Ownership is not inferable from card themes**, only from the roster.

**OPERATIONAL NOTE (Omnath's flag, confirmed):** the file lives in AppData, which is what `MTG_APP_ROOT`
resolves to for deck runs — the measurement above used exactly that and worked. A run that points
`MTG_APP_ROOT` at the MAIN TREE for the corpus pass ([[reference_realism_gate_in_worktree]]) will not see it
and simply prints the single aggregate, which is the designed graceful degradation, not a failure.

**No deck is CLOSE to the bar.** cdh needs ~11 slots (characterized below — no slice closes it); the nearest
of Joe's is Earth Bent at 81%, ~9 slots. The shelf is a long grind on both halves, not a near-miss anywhere.

## 🎯 cdh IS THE WHOLE PLAYABILITY GAP — and here is exactly what it needs

The owner split named the target precisely: **Colton's playability shelf is 92% and cdh (79%) is the only
deck below the 1.0 bar.** So I characterized cdh rather than guessing at it. It needs ~11 more slots; 21
non-land slots are parked. Sole-blocker sweep scoped to the deck:

**SOLE-BLOCKER (one sentence away) — 6 cards, and 3 of them are REFUSED or BANKED, not open work:**
- Springleaf Drum, Gene Pollinator — the tap-another-permanent mana cost. **DELIBERATELY REFUSED**
  (phantom mana, SHELF S7 audit, `manaCostModelable` names Springleaf Drum outright). Do not "fix" these.
- Hexing Squelcher — group-granted ward, and the LIFE form specifically, which the layer op cannot represent.
  Already banked.
- Biomancer's Familiar — an adapt-cost modifier. Niche, 1 card.
- Vexing Shusher — "{R/G}: Target spell can't be countered." Needs an uncounterable flag on a stack object.
- Borne Upon a Wind — a TURN-SCOPED flash permission. The mechanism nearly exists (`flashPermissionSpecsFor`
  + `flashCastPermissionsOf` already serve the STATIC form, e.g. Valley Floodcaller), but the turn-scoped
  variant needs a new per-player field, an atom, a spec source and an untap reset — **four touch points for
  ONE card** (corpus-wide the shape is 12 cards / 9 parked / only this one would flip). Below the bar.

**MULTI-BLOCKER — 15 cards, each needing two or more independent builds.** These are cEDH staples and none
is a slice: Chrome Mox (imprint), Pact of Negation (delayed cost with a loss condition), Chain of Vapor,
Mindbreak Trap (alt cost + exile-any-number-of-spells), Wan Shi Tong, Hidden Strings (cipher), Invasion of
Ikoria (Battle // Siege), Vibrance, Deflecting Swat, Flare of Duplication, Veil of Summer, Ragavan,
Springheart Nantuko (bestow), Valley Floodcaller, The Cabbage Merchant.

**THE HONEST CONCLUSION: cdh will not close soon, and no single slice moves it.** It is ~11 slots spread
across 15 multi-blocker cEDH cards plus 3 refusals. Anyone told "just finish cdh" should read this list
first — the deck is hard because cEDH cards are hard, not because a lever is missing.

## ✅ SHIPPED — the SHELF OWNER SPLIT (Omnath's call, and he was right)

`measure-coverage` can now report the shelf **per owner** instead of one aggregate. Omnath's argument, which
the numbers back: the single figure AVERAGES TWO DIFFERENT QUESTIONS — the owner's decks gate PLAYABILITY
(can the one actual user play his own decks?), the pod's decks gate POD REALISM (can he sim his playgroup?).
Neither is the other, and "79%" cannot tell you which is failing.

**Measured with the split on** (temporary config, using only the four decks Omnath said he Moxfield-verified):

```
  92%  colton (playability)   (457/499 across 5 decks)   below the bar: cdh 79%
  76%  joe (pod realism)      (304/400 across 4 decks)   below the bar: 4 decks
  71%  (unassigned)           (498/698 across 7 decks)
```

**The playability half is ONE DECK from the 1.0 bar.** The aggregate was hiding that completely.

**DESIGN — ownership is NOT derivable from the data, so it is not guessed.** Verified earlier: every deck
lives in ONE profile on this box, so profile structure says nothing. Rather than hard-code Colton's deck
names into a repo script, the split reads an OPTIONAL `<MTG_APP_ROOT>/data/deck-owners.json`
(`{ "Deck Name": "owner-label" }`) and stays completely silent when absent — output byte-identical to before.
A deck the file omits lands in "(unassigned)" rather than being dropped, because a silently shrinking
denominator is how a split metric starts lying.

**I did NOT ship a mapping file.** The roster is Omnath's ([[deck_joe_roster]]) and my knowledge of it is
second-hand; asserting ownership I cannot verify is exactly the kind of confident-wrong entry this run has
already had to retract twice. Told him in COMMS that the seam is live and the mapping is his to supply.

## 🧭 ALL FOUR INSTRUMENTS ARE MINED OUT — the run's search phase is over

Four independent instruments were built and exhausted this run. Recording them together so the next session
does not rebuild any of them:

| instrument | what it found | state |
|---|---|---|
| shelf sole-blocker sweep | 105 single blockers, all singletons | mined out |
| mis-park scanner (`residuegap.mjs`) | 3 real bugs (+15, +1, +4) | mined out |
| undetected trigger events (`undetected2.mjs`) | 1 feasible lead (+2); the rest are UNBUILT mechanics | mined out |
| tier composition (`composition.mjs`) | the aura pair (+10); no general fix | closed |

**All four converge on the same answer: what remains is per-shape work at 1-4 cards each.** Even inside a
single bucket the shapes do not share a fix — the 9 composition-failing Enchantments need four DIFFERENT
gate pairs (static+granted-activated, activated+trigger, trigger+trigger, trigger+mana-aura), one or two
cards apiece.

**That is not a reason to stop; it is a change of mode.** Stop hunting for levers — there are none left —
and grind shapes individually, cheapest-first, verifying each against the gate that owns it.

## ⛔ CLOSED — the GENERAL tier-composition lead (38 cards) has no general fix

The aura static+trigger composition paid +10, so I generalized the instrument: for every parked card,
classify each oracle line ALONE; if every line is native by itself, only the composition is missing.
**38 cards** match — 17 Creature, 9 Enchantment, 4 Artifact, 4 Legendary Creature — and they line up exactly
with the residue census's TWO-FLIP list (Artisan of Kozilek, Wasteland Raider, Vat of Rebirth, Tundra Tank,
Compulsory Rest, Verdant Haven, Fiery Mantle, Nurturing Presence, Mouser Foundry, Tishana).

**There is no general fix, and chasing one would be a false positive.** Two things killed it:

1. **The single-mechanism discipline is DELIBERATE.** `permanentTriggersCovered` and its siblings each own
   ONE mechanism and treat everything else as residue — the code says so outright: *"this single-mechanism
   tier must never claim one through a residue coincidence."* Birthing Hulk is keyword + trigger + activated
   ability; composing across all three would dissolve the tier system, not extend it. The aura fix worked
   precisely because it composed TWO NAMED gates with each half re-verified by its OWN gate — that is
   composition. A blanket "every line is native alone" rule is loosening wearing composition's clothes.

2. **The COVERED_KEYWORDS angle is a mirage.** It looked like the residue set was merely missing modeled
   keywords. Ranking the "keywords credited alone but absent" gave equip (394), crew (142), draw a card
   (147) — **none of which are vacuous keywords.** They classify alone because their OWN tier handles them
   (equipment, vehicle, spell). Adding them to the residue set would make the walk treat a real ability as
   inert text: a false positive on hundreds of cards. And the two genuinely-missing modeled keywords I
   suspected — squad, firebending — turn out to have **zero** parked carriers; earlier slices already
   covered them.

**Take from this**: composition is only safe when each half is re-verified by the gate that owns it. If you
cannot name the two gates, you are loosening. The remaining 38 need per-shape work at 1-4 cards each.

## 🛑 THE MIS-PARK SCANNER IS MINED OUT — re-run after shipping, and it is thin

Re-ran `scratchpad/residuegap.mjs` after the counters + once-per-turn slices landed. 888 candidates, but the
buckets are exhausted for practical purposes and the next session should not re-mine them:

- **Top bucket (116) = "trailing sentence inside a trigger line."** Already mined — the once-per-turn rider
  came out of it (+4). Re-extracted its sub-shapes: the largest remaining is 3 cards
  ("you may play that card this turn"), then a tail of 1-2.
- **"this ability triggers only once each turn" still shows 9 — those are NOT residue failures any more.**
  My strip fixed the residue; they now park because a SECOND trigger line's event is undetected. Verified on
  Twilight Diviner and Tolls of War: two trigger lines, one detected. Do not "re-fix" the rider.
- **The keyword buckets (flying 14, cumulative upkeep 6, enchant creature 5-7) are the same story** — an
  undetected second trigger EVENT, not a keyword problem and not a residue blindness.

**So what remains is genuine feature work at ~1-3 cards per mechanism**, which is the same conclusion the
shelf sweep reached independently. There is no cheap lever left in either instrument.

## ⛔ CLOSED LEAD — the SCOPED counters-put-on variants are worth ~1 card each

The natural follow-on to the shipped self-scoped slice, and it does NOT pay. 15 non-self carriers, 14 parked
— but I swapped each scoped subject for the known-good `this creature` and re-classified, and only **4** flip:

| card | scope it needs |
|---|---|
| Enduring Scalelord | "another creature you control" — `otherCreatureYouControl`, already exists |
| Wildwood Scourge | "another NON-HYDRA creature you control" — a negated subtype filter |
| Wickersmith's Tools | "a creature" — any player's, a global scope |
| Axgard Artisan | "…for the first time each turn" — a frequency rider, not a scope at all |

**The biggest bucket flips ZERO.** "a creature you control" (5 cards — Simic Ascendancy, The Powerful Dragon,
A-Moss-Pit Skeleton …) is stuck on other clauses entirely. So this is roughly one new mechanism per card.

Also worth knowing: **Lonis and Berta are NOT scope gaps.** Their subject is the card's own name, which the
shipped detector already resolves via `shortName`; they park on their effects ("investigate that many times").

## ✅ SHIPPED — the +1/+1 COUNTERS-PUT-ON trigger event (CR 122.6), +4

Rebuilt from the ledger's own notes and landed. Both paths verified at runtime, mutation-checked three ways.

**A BUG WORTH NOT REPEATING — Python `` is a BACKSPACE.** The rebuild silently wrote literal 0x08 control
characters into two JS regexes (`/^Hone or more…`), so the detector never matched and I burned most of a turn
probing a correct-looking arm. `cat -A` on the line is what finally showed it. **Write regexes into JS with
Python RAW strings (`r'...'`) or an Edit tool — never a plain quoted string.** Third escaping incident of the
run and by far the most expensive.

**The cascade concern, resolved honestly.** Two carriers (Generous Pup; Scurry Oak via evolve) do feed each
other — a genuine paper infinite, which the rules call a draw (CR 104.4b). `learnSession`'s per-turn tick
budget is the backstop. **I could NOT construct a valid end-to-end demonstration that it bounds THIS
cascade** — my session test injected a board that setup discarded — so that stays UNVERIFIED rather than
claimed. Shipped anyway because: the trigger models the card correctly (the loop is a real game interaction,
not a modeling error), no saved deck holds two of the four carriers, and suite + sweep are green.

**Prior entries here were wrong twice and both are superseded:** "no cascade guard anywhere" (false — the
tick budget exists) and then the implication that the hazard blocked shipping (it does not).

## ⭐ BANKED — "Do this only once each turn." does NOT set the flag

The sibling wording of the rider just fixed. `detectTriggers` does NOT set `oncePerTurnTrigger` for it and
leaves the rider INSIDE the effect clause — contrary to what a comment in `permanentTriggersCovered` claims.
So it needs the DETECTOR taught, not just a residue strip, and the runtime enforcement already exists to
receive it. Recorded rather than guessed at. Verify the comment's claim before trusting it.

## ⭐ THE DIAGNOSTIC THAT FOUND TWO BUGS IN A ROW — ask WHICH LAYER said no

Both engine bugs this stretch were found the same way, and neither was a missing mechanic. When a card looks
like it should already work, do NOT go hunting for the feature. Ask which layer rejected it:

| symptom | meaning |
|---|---|
| `triggerRoutesNatively` true + `classifyCard` body-only | a WHOLE-CARD gate (residue check) — not a mechanic |
| effect clause parses HIGH standalone + ability `program === null` | the ability was rejected BEFORE its effect was parsed — look at what gated it |
| `classify` native + `permanentActivatedCovered` false | the card is being credited while carrying something unmodeled (a possible FP) |

Bug 1 was `permanentTriggersCovered`'s residue strip never being told about token ability-grants (+15).
Bug 2 was `effectIsManaAbility` reading "Add" inside a QUOTED GRANT and flagging a token-maker as the card's
own mana ability — which skipped building its program entirely, so it was invisible from both the effect
lane and the mana lane (+1, and a whole misclassification class removed).

I burned several probes on bug 1 hunting a mechanic that already existed. The layer question would have
answered it in one step.

## ⚠️ TWO OF MY OWN FAILURES THIS STRETCH — read these before trusting a green number

**1. I SHIPPED A FALSE POSITIVE AND CAUGHT IT AN HOUR LATER.** The token-grant residue strip ended with
`\s*`, and `\s` matches a NEWLINE — so it swallowed the line break and welded the NEXT oracle line onto the
stripped one, hiding it from the residue check. Drowner of Hope was credited native-trigger while carrying
"Sacrifice an Eldrazi Scion: Tap target creature." — an ability `parseActivatedAbilities` does not model.
A false positive is the one direction the CREED forbids.

**How it surfaced is the reusable part: I applied the diagnostic rule the SAME slice had just taught me to
the cards the slice did NOT flip.** Drowner came back `classify=native-trigger` with `actCov=false`, and a
card cannot honestly be both. **Checking the cards a change did NOT move is how the one it moved WRONGLY
shows up.** Do that after every coverage change. Fixed with `[^\S
]`, both directions pinned as tests;
net was one FP out and one legitimate card (Catacomb Sifter) in.

**2. THE DIRECT-TO-MASTER DRIFT RECURRED AFTER I SAID I HAD FIXED IT.** Last entry I wrote "branch first
next slice." Three commits then went to master anyway. Worse, `git push -q … 2>&1 | tail -1` hid a failing
push for two commits, so I believed work was on a branch that had actually diverged, and PR #443 sat open
containing none of it.

**The mechanical fixes, since intent alone demonstrably did not work:**
- After `git checkout -b`, VERIFY: `[ "$(git rev-parse --abbrev-ref HEAD)" = "<branch>" ]`. A `-b` onto an
  existing branch fails, and in a `&&` chain that silently leaves you where you were.
- NEVER `git push -q` into a pipe. The `-q` plus `| tail -1` swallowed a non-fast-forward rejection twice.
  Push plainly and read the result, or assert `git rev-parse origin/<branch>` afterwards.
- Before opening a PR, confirm the remote head is what you think: `gh pr view N --json headRefOid`.

No work was lost — master carries all of it, CI green — but I reported branch discipline I had not achieved,
which matters more than the drift itself.

## ⭐ A DIAGNOSTIC RULE THAT PAID FOR ITSELF — routing vs. whole-card gates

The last slice (+15) was NOT a missing mechanic. TK-1 had already built the trigger fold AND the splitClauses
normalization for `…token. It has "<ability>"`; the effect parsed HIGH and the trigger routed natively. The
only thing missing was that `permanentTriggersCovered`'s RESIDUE check had never been told, so the grant
sentence looked like leftover text and parked a fully-modeled card.

**The tell, and it generalizes:** `triggerRoutesNatively === true` while `classifyCard === "body-only"` means
a WHOLE-CARD gate is rejecting it — never a missing mechanic. Check that pair FIRST on any parked card whose
text looks like it should already work. I burned several probes hunting a mechanic that already existed.

The whole-card gates worth checking in order: `permanentTriggersCovered` (residue strip — the one that bit),
`permanentActivatedCovered`, `permanentFullyCovered`.

## STILL PARKED IN THAT FAMILY — 22 cards, not yet diagnosed

Serpent Generator · Mitotic Slime · From Beyond · Blight Herder · Call Up Emrakul to Help. They carry the
same `It has "…"` grant but park for other reasons (their granted abilities are outside the curated
mana/triggered gates, or a sibling clause is unmodeled). Diagnose with the routing-vs-gate pair above before
assuming a mechanic is missing.

## WHAT SHIPPED THIS STRETCH — the activation-restriction vocabulary

Three riders the engine parsed straight past, so every carrier parked. All three now flag-then-enforce:

1. **`before attackers are declared`** (+21) — a NARROWING to the precombat main. Two sibling riders are
   safely stripped as implied; this one is not, because `step === "main"` spans BOTH mains and the
   postcombat one is after attackers. Refused the opponent's-turn form (disjoint windows).
2. **BOAST, CR 702.135** (+10) — needed a PER-PERMANENT attacked flag. The seat-level Raid flag already
   existed and reading it would have been the one-line build; it is also a materially stronger card.
3. **`Activate only if <cond>`, CR 602.5d** (+23) — added a THIRD probe to the existing interveningIf
   family rather than a second condition language. Trigger / spell / activation lanes now share ONE
   vocabulary, so every future reader reaches all three at once.
4. **DELIRIUM + FORMIDABLE readers** (+7) — the first slice that compounding paid for.

**Three CREED pins fired against my own work and graduated on evidence**, each with the reason recorded in
place rather than edited away. All four seams of every slice were mutation-checked.

## ❌ RETRACTED — the "trailing conditional clause" lever does not exist (I was wrong, same session)

I banked a 121-card lever here and it was **wrong**. Retracted rather than deleted, because the mistake is
more useful than the entry was.

**The claim:** the parser handled the LEADING conditional rider (`If <cond>, <effect>`) but not the TRAILING
form (`<effect> if <cond>`), and 121 parked cards carried the trailing form — the biggest lever of the run.

**The runtime disagreed, and the runtime wins.** The trailing form is ALREADY implemented — BLITZ CD-2, in
`effects/parser.js`, directly beneath the leading peel, with the same shared gate and guards. Verified live:

```
Draw a card if you have no cards in hand.  -> high  [{op:"draw", amount:1, condition:"you have no cards in hand"}]
Draw three cards if a creature died this turn. -> high [{op:"draw", amount:3, condition:"a creature died this turn"}]
```

**What my probe actually measured**, versus what I read it as:
- measured: parked cards CONTAINING a trailing-if clause whose condition is readable.
- read as:  cards that WOULD FLIP if the trailing form were built.
Those 121 cards park for reasons ELSEWHERE ON THE CARD. The trailing clause was never their blocker.

**This is the probe-instrument law biting a second time this run** — a probe reporting a big number is a
claim about the PROBE until each hit is explained. The cheap check I skipped: parse one example clause and
look at the output. It took under a minute once I finally did it, and it would have saved the whole banked
entry. **Before banking any lever, parse one real example and confirm the gap is real.**

Corollary worth keeping: a "would flip if X" probe must actually SIMULATE X (strip the blocker, re-classify)
— which is exactly what the alternative-cost probe did correctly ten minutes earlier, and it cheaply killed
that direction by showing only 2 of 14 would flip. Same session, right method and wrong method side by side.

## THE SHELF TAIL IS GENUINELY CARD-BY-CARD — measured, not assumed

I ran a SOLE-BLOCKING-SENTENCE sweep over every parked deck card: remove one sentence at a time, re-classify,
and record the sentence whose removal flips the card. 320 parked cards, **105 with a single identifiable
blocking sentence — and essentially every one is a singleton.** The top blocker unblocks 2 deck slots. There
is no cluster left.

**So Colton's guess was right: from here the shelf moves card by card.** That is a finding, not a
complaint — it means the remaining work is small, safe, individually auditable, and does not need a big
lever. It also means nobody should go looking for one again; the search is done and this is the answer.

Probe: `scratchpad/sole-sentence.mjs` (the method is the correct one — simulate the fix and re-classify).

## BANKED WITH SCOPE — group-granted WARD (4 corpus cards, ~0 deck slots)

Ward on a creature ITSELF is fully modeled, both cost forms. Bare-keyword GROUP grants work. The gap is
ward specifically inside a group grant, because ward carries a COST and so cannot be a bare member of
`GRANTABLE_STATIC_KEYWORDS`.

Good news, and the reason this is scoped rather than open: **the runtime already supports granted ward.**
`layers.permanentGrantedWardCosts` reads layer-6 `addWard` effects and `ward.js` unions them with printed
ward at the tax site. So this is a PARSER-emission gap, not an enforcement gap — no false-positive risk in
crediting it, provided only the fixed-generic form is emitted (which is all the layer op represents).

Why I did not build it at depth: the four carriers print four DIFFERENT selector shapes — "Other creatures
you control", "Other artifacts you control", "Artifacts you control", "Beasts and Birds you control" — which
means an arm in each shape's handler inside a 4,000-line parser. And the only card worth deck slots
(Hexing Squelcher, 2 slots) prints the LIFE form, which the layer op cannot represent, so it would not flip
even after the work. **~4 corpus cards, ~0 deck slots, medium blast radius.** Correct trade is to leave it.

If someone takes it: mirror the COUNTER-GATED GROUP WARD emission (staticAbilityParser ~line 2012) — it is
the exact pattern, already correct, already refusing the colored/{X}/life forms for the same reason.

## ✅ RESOLVED — the token lever was 15 cards, not 68, and needed no subsystem work

Shipped as three NAMED_TOKENS entries (Lander / Mutagen / Junk) + one alternation. **+18 corpus, +2 deck
slots, corpus crossed 35.1%.** All 18 flips audited individually, mutation-checked three ways.

**I banked this as a 68-card subsystem extension and it was neither.** Both errors were the same error:

- **The bad instrument.** I measured "would flip" by DELETING the line carrying the create-token clause —
  but that line also carries the TRIGGER, so I counted cards blocked by their trigger as blocked by their
  token. The tell was in my own output and I missed it: the hit list contained Treasure(12), Food(8),
  Clue(2), all already in the registry, so the token demonstrably was not their blocker.
- **The good instrument — CHANGE ONLY THE THING UNDER TEST.** Rename the unknown token to a known one,
  strip its defining reminder, re-classify. Nothing else moves. Real answer: 15 cards, three names.

**Third time this run a probe's big number was a claim about the probe.** The standing rule now has two
clauses: *(1) parse one real example before banking a lever; (2) a "would flip" probe must simulate the
ACTUAL fix and change ONE variable.*

## ⛔ DO NOT REBUILD — tap-another-permanent mana costs are a DELIBERATE refusal

A probe said 5 cards flip if `manaProduction` accepted "{T}, Tap an untapped creature you control: Add …"
(Springleaf Drum, Gene Pollinator — both in cdh, plus Loam Dryad / Saruli Caretaker / Jaspera Sentinel).
**Do not act on that number.** `manaModel.manaCostModelable` refuses this cost explicitly, names Springleaf
Drum in its comment, and cites a prior audit (SHELF S7): riding the {T} half alone **minted phantom mana
every turn**, because the sim never taps the other permanent.

Crediting these without teaching the mana subsystem to spend a second resource is a false positive, not a
coverage win. **The lesson generalizes: a "would flip" probe measures whether the METRIC would credit a card,
never whether crediting it would be CORRECT.** That distinction is the whole false-positive direction.

## cdh IS ALSO CARD-BY-CARD — its clusters were checked and are empty

Per Omnath's sequencing (cdh is Colton's only sub-90 deck), I measured its 21 parked non-land slots.
Cluster candidates all came back near-zero: can't-be-countered self (83 corpus / 0 would-flip),
can't-be-countered static (0), flash permission (1). Its remaining blockers are individually hard cEDH
cards — imprint (Chrome Mox), cipher (Hidden Strings), Battle//Siege (Invasion of Ikoria), X-counters+draw-half
(Wan Shi Tong). Consistent with the shelf-wide finding: no clusters anywhere.

**Data note for the roster split:** all 16 decks live in ONE profile on this box (`prof_bdb11b3e`), so the
Colton-vs-Joe split CANNOT be derived from profile structure — it rests entirely on `deck_joe_roster`. Told
Omnath, since his two-number recommendation depends on it.

## ⛔ CLOSED LEAD — the LIEUTENANT cycle is NOT a condition gap (worth 0, not 5)

"Lieutenant — As long as you control your commander, <static>" (6 corpus cards). The line-removal probe said
5 would flip, and the diagnosis looked clean: conditional statics WORK ("gets +2/+2 as long as you control a
Forest" is native-static, in both word orders), so the missing piece appeared to be the condition
"you control your commander" — which the TRIGGER lane already has and the STATIC lane does not. A tidy
parallel to the activation-condition slice, and a small build.

**It is worth zero.** I substituted the known-good Forest condition into all six real cards and re-classified:
every one stays body-only. The condition was never the blocker — the COMPOUND STATIC CONTENT is
("gets +2/+2 AND has '<quoted triggered ability>'", "AND other creatures you control get +2/+2 and have
trample"). Adding the condition would have modeled nothing.

Anyone reviving this needs compound gated statics — a self pump PLUS a granted quoted trigger or a group
effect, all under one gate — not a condition entry. That is a real subsystem, correctly sized before it is
started.

**Caught BEFORE building, which is the first time in this run.** The probe rule above is why.

## NEXT ACTIONS

1. **Bloom Tender / Faeburrow Elder** — "For each color among permanents you control, add one mana of that
   color." Only 2 corpus cards but **3 deck slots**, and Bloom Tender is a cEDH staple in Kinnan. The
   `colorsAmongPermanents` primitive ALREADY EXISTS in layers.js; this needs the color SET, not the count,
   plus a mana atom. Contained, no choice point. **This is the next build.**
2. **BANKED WITH A DESIGN QUESTION — `Tap N untapped creatures you control` as a cost** (39 corpus / 32
   parked; plus 40/28 for the singular). The SINGULAR is already fully modeled (γ1f, Earthcraft):
   parser → legalChoices expands one action per legal creature → dispatcher taps it. **The plural is NOT a
   simple generalization.** Enumerating N-combinations explodes legalChoices — 45 actions for two-of-ten,
   120 for three. The real choice is: enumerate combinations (correct, explosive) vs. auto-pick a
   deterministic set (legal, no explosion, silently removes player agency the singular case has). I did NOT
   guess at depth. Decide this one while sharp.
3. **Upkeep-only activation** (11) — still needs the offer window WIDENED, not narrowed. Riskier than
   anything above; take it EARLY in a run.
4. Shelf grind: 321 unmodeled non-land deck cards across 360 slots. The leverage head (2+ decks) is
   Wan Shi Tong ×3 · Chrome Mox ×3 · Mindbreak Trap ×3 · Bloom Tender ×3 · Teferi's Protection ×3 ·
   High Score ×3 · Level Up ×3, then a long ×2 tail.

## A3 IS DONE — verified, not built

Went to wire Forge-as-a-Karn-function and found it already shipped end to end: `/api/collection/deck-overlap`
feeds Karn's system prompt the owned-in-deck count AND the in-color owned upgrade pool;
`/api/collection/ownership` is called by ChatPanel's KarnApplyBar to tag each suggested ADD with
owned/wishlist; the KARN_DELTA collection line is already in agents.js. **Do not rebuild it.** Only real
gap: `isBuildFromCollectionPrompt` is exported and unused — a cosmetic "build from collection" affordance,
not plumbing. Receipts posted to COMMS.

## WHAT THE SWEEP IS FOR — it found the run's best bug

Running `playability-sweep.mjs` at 150 games surfaced a real SOFT-LOCK (a tutor finding nothing wedged
~6% of human-path games) that no unit test could have caught, because every tutor fixture supplies
candidates. **Re-run it after any engine change to the decision path.** If it reports a catastrophe,
suspect the harness first — it has been wrong that way before.

## A POSTING BUG WORTH NOT REPEATING

COMMS entries live directly under the 4-line file header (line ~6). There is a legacy
`## LOG (newest first)` string ~670 lines down; anchoring a post on THAT buries the entry mid-file where
Omnath never reads it. Three of my entries went into that hole before Colton's screenshot of his idle loop
exposed it. **Post above the first `### ` header, and verify with `grep -n "^### " | head -3`.**

## PROBE LESSONS FROM THIS RUN — do not re-learn these

- **A probe that reports a big number is a claim about the PROBE** until each hit is explained. The
  shelf dead-card probe flagged 18; all 18 were board defects (ninjutsu casts from hand, "destroy target
  artifact" with no artifact on the board, Treasure-sacrificers with no Treasures).
- **The playability-sweep was scoring its own missing handlers as engine soft-locks** — it said 4/12
  games finish. With `unresolved` (the Arbiter escape hatch) and `soft-counter` handled: 24/24, zero
  wedges. Fixed. If it reports a catastrophe again, suspect the harness first.

## ✅ AURA GRANTS THAT NEVER APPLY — **ALL CLOSED** (`4096bfae` + `303858c5`). The probe reads ZERO.

**Reproducer:** `MTG_APP_ROOT=… node app/scripts/probe-dropped-attached-grants.mjs` — attaches each to a
2/2 and compares the host's LAYER-DERIVED P/T against the printed bonus.

| card | resolution |
|---|---|
| Dark Privilege #11269 · Serpent Skin · The Brute · Gaea's Embrace | ✅ **FIXED** — grants apply (3/3, 3/3, 3/2, 5/5); now `native-aura` (`4096bfae`) |
| Elephant Guide · Griffin Guide · Most Wanted · A-Most Wanted · Failed Conversion · Sleeper's Robe · Elder Mastery | ✅ **PARKED** — they did NOTHING; the composition crediting them was a false positive (`303858c5`) |

⚠️ **COVERAGE WENT DOWN, and that is the honest direction:** 35.9% → 35.8% (12,278 → 12,271). Those seven
were counted and delivered neither half. *A metric that only ever rises has stopped measuring.*

**⛔ THE COMPOSITION SLICE SHIPPED EARLIER IN THIS RUN WAS WRONG.** It credited ten Auras by verifying the
static half and the trigger half each through its own gate — "composed, not loosened". But each half is
verified on **text the composition invented**, and the runtime sees neither: `parseAuraBonus` drops the
static (an aura-own trigger line isn't on its skip list) and `checkDiesTriggers` never enqueues an
aura-own dies trigger (the Aura leaves with its host and is never scanned — measured, pendingTriggers 0).

⭐ **THREE of the ten survive, and the split is the reusable part:** Demonic Appetite, Mark of Fury and
Recumbent Bliss carry the AURA'S OWN upkeep/end-step trigger, which never references the enchanted
creature and so never poisons the bonus. **The dividing line is whether the trigger keys on the ENCHANTED
CREATURE.**

**To make the seven honestly native the ENGINE must change, not the metric** — `parseAuraBonus` must skip
a modeled aura-own host trigger, AND `checkDiesTriggers` must scan auras attached to a dying creature (an
LKI walk; the Aura is already gone by then). Neither is a slice.

**Root cause, diagnosed:** `parseAuraBonus` is all-or-nothing BY DESIGN — an Aura carrying a sibling the
bonus parser doesn't own (a regenerate activated line, an unmodeled own-trigger) drops the WHOLE bonus
to `[]`. Correct. But two crediting paths reason about a **transformed card the layer engine never sees**:
`nativeStaticGrantPlusActivated` (strips the extra activated lines, then asks `isNativeAura(stripped)`)
and `isNativeOwnTriggeredAura` (composes the halves, each checked in isolation). Each gate is right about
its own half; neither checks that the UNTRANSFORMED card still produces the grant.

**FIXED in `4096bfae`** — the aura-own-activated validator admits `regenerate`, and its caller's
pre-filter stopped demanding a MANA symbol before the colon (Dark Privilege's cost is "Sacrifice a
creature:", so its line was never even handed to the validator).

⚠️ **That widening re-opened a DIFFERENT FP** — letting ANY cost-bearing line be skipped meant a
SELF-SAC aura (Briar Shield, Thrull Retainer, Stamina, Carapace) kept its static half and went native.
Sacrificing the AURA detaches the host as a COST, before the ability resolves. Caught by two GUARD-LEAVE
pins that already existed; that rule now lives on both paths, not one.

⚠️ **AND I REPORTED THE OPPOSITE ONE TURN EARLIER** — that widening the validator "did NOT restore the
grant" — and reverted on that basis. I had checked only Gaea's Embrace, whose "+3/+3 AND HAS TRAMPLE"
union failed for a different reason; three of the four were already fixed by that change. **Re-test per
card. Never generalize a subsystem verdict from one sample.**

`auraOwnRegenerate.test.js` pinned all four at `native-activated` — written on the assumption the
composite delivers the bonus. Corrected, with the reason recorded in the test.

⭐ **THE STANDING RULE THIS LEAVES:** no static instrument can see this class — the tier says native, the
residue walk is satisfied, and a per-card tier diff shows nothing because nothing MOVES. **Anything that
emits a layer grant needs a RUNTIME assertion. The tier is not evidence about the board.**

## BLOCKED / REFUSED — do not restart these blind

- **ATTACHED UNBLOCKABLE** ("Equipped/Enchanted creature can't be blocked" — Whispersilk Cloak #329,
  Aqueous Form #735, Cloak of Mists, Protective Bubble). **BUILT, MEASURED CLEAN, AND REVERTED**
  (`055a47f2`) — do not re-attempt without closing the seam below first.
  - The `unblockable` pseudo-keyword and its enforcement ALREADY exist (canBlockAttacker reads it for
    Herald of Secret Streams); only the attach-side emission is missing. It looks like a one-line win.
  - Tier diff said **GAINED 4 · LOST 0 · RETIERED 0**. Suite green. Lint green. It was still wrong.
  - ⚠️ **Aqueous Form classified native-trigger while its grant did NOT apply** —
    `permanentHasKeyword(host, "unblockable")` was FALSE on a real board. `parseAuraBonus` returns `[]`
    for ANY aura with an own-trigger outside `isModeledAuraOwnTrigger` (scry-on-attack isn't in it), which
    is DELIBERATE. But a clause-level "modeled static" credit let the TRIGGER tier's residue check pass,
    so the card went native through a different door while the bonus was still being dropped.
  - ⭐ **THE SEAM IS PRE-EXISTING AND GENERAL: a clause-level static credit can contradict the CARD-level
    attached-bonus gate, and the tier diff CANNOT SEE IT.** GAINED/LOST/RETIERED all looked perfect. Only
    asking the runtime "is the keyword actually on the creature" exposed it. **For any change that emits
    a layer GRANT, add a runtime keyword/board assertion — the tier diff is necessary and not sufficient.**
  - Reconciling the trigger tier with the attached-bonus gate is its own wave. Three cards is not worth
    shipping a known FP to reach it early.
- **Foundry rail re-home** — REFUSED solo. Needs live browser QA with Colton available same-day. Do the
  MTGAssistant decomp first regardless; the re-home is not a solo-at-2am change.
- **Layer-2 control** (28 cards) — control is represented STRUCTURALLY here (the permanent moves between
  battlefield arrays; 628 sites read `.controller`). Needs move-and-revert that can never miss a path, or
  it becomes permanent control theft. Scoped in the triage ledger. Take it EARLY in a run, never late.
- **Learn keyword** — uncredited on an UNCERTAIN rule reading, deliberately. Do not credit it without
  checking the actual rule.

---

## COMPLETED TRAIL (newest first)

- `d7148fa3` — v0.149.5: graveyard-ability composition (+14). Slice 56.
- v0.149.4 — devour/amplify, fuse unpark, aftermath unpark (+22). Slices 53–55.
- v0.149.3 — assist/casualty/provoke/ripple, training (+23). Slices 51–52.
- v0.149.2 — play-lands-from-graveyard, enters-tapped type set, dethrone, squad, the optional-mode
  family (+36), enlist/extort, unleash. Slices 44–50.
- v0.149.1 — firebending + end-of-combat held mana, split second, self-power block gate. Slices 41–43.

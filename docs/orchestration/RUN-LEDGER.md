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
  3x  exile top two + play them until end of next turn Light Up the Stage #1211 (IMPULSE DRAW)
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
| `enter` (28) | `checkEnterTriggers(state, enteredPerm)` | **ONE permanent** | ⛔ **BLOCKED** |

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

- **Nothing mid-edit.** Corpus **35.4%** (12,130/34,245 — +82 this run). Suite **885 files / 11,405 tests**,
  lint 0, MUTANT sweep clean. EIGHTEEN slices shipped on branch `claude/aura-enchant-noun-vocab` (NOT pushed;
  the branch name is stale — it carries eighteen unrelated slices and wants a rename before any PR).

  **PLAY-WEIGHTED — the bar:** top-1000 **70.1%** 🎉 · top-2500 **52.4%** · top-5000 41.9% · top-10k 35.0%.
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
The card does not fall to the Arbiter. It becomes **a spell that exiles your creature and never returns
it** — a confident wrong partial, exactly what the comment says cannot happen.

**THE RULE: before trusting a split to fail safe, parse the LEADING fragment alone.** If it is HIGH, the
split is not safe and the sentence needs a keep-whole guard (the mechanism the conditional-rider seams at
`splitClauses` ~455/473 already use). Any ", then" / " and " sentence whose first half is a complete
instruction is suspect — there are likely more.

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

## BLOCKED / REFUSED — do not restart these blind

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

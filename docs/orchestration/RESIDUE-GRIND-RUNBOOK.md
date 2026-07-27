# RESIDUE-GRIND RUNBOOK — census-driven subsystem coverage, end to end

**Purpose:** raise native corpus coverage by building UNBUILT SUBSYSTEMS ranked by real payoff,
instead of hand-hunting individual cards. Written 2026-07-24 after a full overnight+morning shift
proved the method (6 shipped slices, ~25 flips, 5 distinct bug classes caught and catalogued).
**Any model seat (Sonnet / Opus / Fable) following this verbatim should land near-identical
results** — every judgment call this method needs is either encoded as a rule below or explicitly
marked as a STOP-AND-VERIFY.

Read [ENGINE-SCAFFOLD.md](ENGINE-SCAFFOLD.md) once per session before touching the engine.
CLAUDE.md §1.2 (never fabricate) and §8 (forbidden patterns) override everything here.

---

## 0. THE SIX LAWS (every slice, no exceptions)

1. **THE CREED:** false-negative SAFE, false-positive FORBIDDEN. A card the engine can't fully play
   routes to the Arbiter — that is correct behavior, not a bug. Never credit a card native unless
   EVERY clause on it is modeled (whole-card law). Never let an effect fire that isn't faithful.
2. **Ask the code, not the text.** Shared WORDS never prove a shared FIX. Every scope claim comes
   from running the real parser/classifier on real oracle text pulled live from the bundled index
   (`lookupCard`/`publicCard`) — never from model memory, never from a pattern-proxy count.
3. **Grep for the existing mechanism BEFORE building one.** The engine has registries, targeted
   hooks, and synthesized-keyword paths that plain reading misses. (Instance: the first-main-phase
   timing was rebuilt as a duplicate under a second event name — the registry detector
   `triggerScheduler.detectPhaseTrigger` already owned it. Cost: a full revert.)
4. **A tier flip is necessary evidence, never sufficient.** The classification metric cannot see
   runtime miswiring (wrong field name, wrong nesting, wrong event name, wrong assertion layer).
   Every slice ships a test that exercises the actual new code path at runtime.
5. **Every flip is audited, both directions.** The whole-corpus fingerprint diff is read line by
   line; every gained card is confirmed expected, every lost card is a deliberate FP-removal or the
   slice does not ship.
6. **A slice that flips ZERO cards can be the most valuable one you ship.** Laws 4 and 5 both assume
   movement — but the metric gates compare the parse pipeline against the parse pipeline, so a RUNTIME
   function that returns an empty list or skips a loop iteration is STRUCTURALLY invisible to every one
   of them. On 2026-07-25 the six highest-value findings moved the corpus number by exactly nothing:
   an engine casting free Ancestral Visions, an Aura whose self-return silently no-opped, and an
   animated land that could attack but could never be targeted. **If a slice touches a resolver,
   enumerator, or legality gate, the ONLY evidence that counts is driving it on a board.** A green
   fingerprint diff on such a slice means the gates couldn't see it, not that nothing changed.

**THE DRIFT PROBE — reusable, and it caught a bug in my own slice the same day I wrote it.** Whenever two
functions answer ONE question (a metric gate and its runtime twin; two documented "mirrors"), run them
against each other across the whole corpus and print the disagreements. It needs no fixture design: iterate
the real cards, call both, diff. Slice 29 did this to `stripModeledSelfNoUntap` vs `selfPreventsUntap` and
found 11 conditional statics the metric credited and the engine refuses. Cheap, mechanical, and it finds the
one class the fingerprints structurally cannot see.

**Two corollaries earned the same day:**

- **When a comment says "mirrors X", go read X.** It was false twice in one shift — two pairs of
  functions documented as mirrors had silently diverged, and only the copy nobody re-read stayed wrong.
- **A judgement implemented in two places will drift, and the drift only shows on inputs that need
  BOTH.** Eleven sites of one bug came from this. The fix is always to point both at a single shared
  helper, never to patch the second copy.

---

## 1. BASELINE (once per session)

```bash
cd <worktree>/app
npm ci                      # fresh worktree only
npx vitest run              # must be green — record the file/test counts EXACTLY (they go in commit messages; miscounting them has happened twice)
npm run lint                # must be 0
```

If the suite is red at baseline, STOP — fix or escalate before any coverage work.
**Contention caveat:** if a self-play grind pool or other CPU-heavy background job is running,
expect 10-20 spurious timeout failures on a full-suite run. A red full run under load proves
nothing either way: re-run every failed file in isolation before believing either verdict.

## 2. RUN THE CENSUS

```bash
MTG_APP_ROOT="C:/Users/colto/AppData/Roaming/com.colton.mtg-tool" \
  node scripts/build-residue-census.mjs --out=<scratchpad>/residue-census.json --top=40
```

(~80s, ~108k classifications.) How to read it:

- **soleBlockers** — cards where removing JUST this clause flips them native. This is the true
  "+N if built" number; rank by it.
- **coBlockers** — the clause is unreadable but the card has other blockers too; building it flips
  nothing by itself. Treat as future-value only.
- **popular** — sole-blockers at EDHREC rank ≤5000. Tiebreaker; Colton's pods live here.
- **One cluster = one normalized SHAPE ≠ one fix.** (Instance: "counter-proofing" was one theme
  spread across three unrelated code paths — permanent statics, spell effects, activated grants.)
  The census sizes the candidate; Phase 3 decides what it actually is.

**READ THE TWO DEFECT REPORTS FIRST — before the ranked list.** They were added 2026-07-25 and produced
most of that day's slices. They point at BUGS, which are almost always cheaper and more valuable than
building a new lane:

- **BUG SIGNATURES** — shapes that block some cards while OTHER cards carrying the same shape classify
  native. Such a shape cannot be an unbuilt mechanic; it is built, and something upstream mis-binds it.
  (`nativeCarriers × soleBlockers`, ranked.)
- **TWO-FLIP SIGNATURE** — cards where MORE THAN ONE single-line deletion flips them native. Every piece
  is demonstrably understood in isolation, so the defect is in how the TIERS COMPOSE.

Both are printed by the same run at no extra cost. A high `nativeCarriers` count next to a nonzero
`soleBlockers` is the single strongest lead the tool produces.

The tool itself is deletion-probing (asks `classifyCard`, zero drift possible). Its v1 used
line-level heuristics and mis-blamed built subsystems ("enchant creature" #1 at 619) — if you ever
modify it, keep it classifier-grounded or it will lie to you the same way.

## 3. SCOPE THE TARGET (the step where every earlier session lost time)

Take the top un-attempted cluster. Then, IN ORDER:

1. **Pull every carrier's REAL full oracle text** (script with `lookupCard`/`publicCard`). Read
   whole cards, not the matching clause — TYPE LINE is load-bearing (a spell and a permanent with
   identical words go through different parsers).
2. **Confirm family homogeneity:** do all carriers share the same clause ON the same kind of line
   (trigger payoff vs activated vs static vs spell body)? Split the family if not.
3. **Identify the owning pipeline** — this table is the #1 relearned lesson:

   | Clause lives on | Owning parser | Verify with |
   |---|---|---|
   | Permanent's own static line | `staticAbilityParser.js` | `parseStaticAbilities` + `classifyCard` |
   | Spell body / trigger payoff / activated effect | `effects/parser.js` | `parseEffectClause` + `programConfidence` |
   | Trigger CONDITION/timing | `triggers.js` `classifyCondition` + the REGISTERED detectors (`triggerScheduler.js` etc.) | `detectTriggers` |
   | Keyword line | `coverage.js` COVERED_KEYWORDS / cost-strip families | `isKeywordOnly` |

   Testing a static through `parseEffectClause` reports "unparsed" for text a different parser
   already handles — that false negative looks identical to a real gap. (Cost tonight: the
   counter-proofing scope was wrong twice before this table existed.)
4. **Grep for the mechanism by CONCEPT, not just by phrase:** the event name you'd invent, the
   field name you'd invent, related CR numbers, sibling cards you know are handled. Check
   `registerTriggerDetector` / `registerCoverageClassifier` registries explicitly.
5. **Write the one-line scope verdict** into the triage ledger BEFORE building: what exists, what's
   missing, expected flip count and names. If the missing piece is a new INTERACTIVE choice, a new
   zone behavior, or a new value-threading path between objects — it is not a quick slice; bank it
   precisely and take the next cluster instead. Two candidates in a row needing "real new
   architecture" is normal; six in a row means re-run the census (something drifted).

## 4. BUILD (smallest honest change)

- **Reuse existing field names and conventions.** Before inventing a descriptor field, grep for a
  sibling doing the same job. Descriptor whitelists SILENTLY DROP unknown fields. (Instances: an
  invented `sacNontokenFilter` was dropped where the codebase's `nontokenFilter` worked; a read of
  `permanent.isCommander` missed that the flag rides `permanent.card.isCommander` everywhere.)
- Follow the house comment style: state the CR rule, the carriers, the FN-safe/FP-forbidden
  reasoning, and what deliberately does NOT match. Comments explain constraints, not history.
- All-or-nothing per clause family: an unmodeled variant must fail the anchor → Arbiter. Never
  widen a regex "while you're in there" without re-running the census scope check on the widened
  form.
- One family per slice. Do not batch unrelated clusters into one commit.

## 5. VERIFY (the gate battery, in this order)

1. **Targeted tests** for the new path: detection shape, positive runtime behavior, negative
   guards. **The runtime assertion must read the layer the engine actually uses** — step triggers
   are FLUSHED ONTO THE STACK by `runStepActions`; asserting `pendingTriggers` alone passes
   vacuously on negatives and false-fails on positives (instance: the firstMain runtime test's
   first draft). When a negative test passes, ask what would make it pass vacuously.
2. **Whole-corpus tier fingerprint**, stash-dance:
   ```bash
   git stash push -m tmp -- <changed files>
   MTG_APP_ROOT=... node scripts/tier-fingerprint.mjs > before.tsv
   git stash pop
   MTG_APP_ROOT=... node scripts/tier-fingerprint.mjs > after.tsv
   diff before.tsv after.tsv
   ```
   Audit EVERY line. Gained: each must be an expected carrier (pull its text if you didn't already).
   Lost: each must be a deliberate FP-removal, else STOP. Unexpected extra flips = your regex is
   wider than your scope check said.
   For parser.js-adjacent changes use `program-fingerprint.mjs` (the seam gate) — a same-tier
   op-rebind is invisible to the tier diff.
3. **Stale-pin sweep:** a new flip can break an existing "stays non-native" regression pin — that
   test was RIGHT until today. Update the pin with a NOTE (file convention), never delete silently.
   (Instance: For the Ancestors' park pin in sliverDeckWave.test.js; also its file-top comment had
   drifted from its own body — roll up while there.)
4. **Full suite + lint.** Under background load, re-verify failures in isolation (see §1).
5. **Reminder-text paranoia:** if any carrier has parenthetical reminder text, confirm no phantom
   descriptors leak (instance: vanishing enchantments' reminders parked Four Knocks for months).
   **Fixture text is COPIED from the index, never paraphrased** — an abbreviated reminder classified
   differently twice on 2026-07-25 and both times looked like a bug in the change under test.
6. **If the slice touched a RESOLVER, ENUMERATOR or LEGALITY GATE, gates 2 and 3 prove nothing** (law
   6). Those diffs compare the parse pipeline against itself and cannot see a runtime function that
   returns an empty list. Drive the card on a board and assert the effect actually happened — and when
   the runtime "proves" a NEGATIVE, check the export exists before believing it (a guarded call to a
   function that lives in another module no-ops silently and reads exactly like a real failure).

## 6. RECORD

- **Commit message carries the evidence:** what was missing, root cause, carrier census numbers,
  which cards flip and which correctly do NOT (with each one's distinct residue), the fingerprint
  result ("34,210 cards, exactly N changed, zero collateral"), suite/lint state, and any bug the
  gates caught before commit. Conventional Commits, straight prose, no voice.
- **Update the triage ledger** (docs/orchestration/TRIAGE-LEDGER-*.md): mark BUILT with the commit
  hash; correct any earlier scope claims the build disproved — corrections are first-class entries,
  not embarrassments.
- **WAKE-REPORT addendum** per meaningful slice: what shipped, what the gates caught, running flip
  count. Verify every number against actual command output before writing it (two typo incidents).
- Memory-side (CONTINUITY/COMMS) at natural checkpoints, newest-on-top.

## 7. STOP RULES + CADENCE

- Same fix fails twice → STOP, root-cause properly (no third identical attempt).
- A slice that grows past ~2 new mechanisms mid-build → re-scope; you mis-sized it (park or split).
- Six consecutive scoped-not-shipped candidates → the current vein is dry; re-run the census.
- Full suite + lint before EVERY commit that touches src/. No exceptions for "docs-adjacent" code.
- Never pool this work with a running grind's data era; corpus changes don't re-anchor self-play,
  but engine BEHAVIOR changes that alter trajectories do — check the RE-ANCHOR notes in
  sim-integrity docs if a slice touches combat/mana/turn structure.
- Token diet (grind sessions): targeted reads over bulk dumps, one family per session, outputs to
  disk with summaries in context.

## 8. KNOWN FAILURE MODES (all real, all earned on this project — check yourself against this list)

| Trap | Instance | Tell |
|---|---|---|
| Wrong parser consulted | counter-proofing scoped wrong twice | "unparsed" on text a sibling card already plays |
| Pattern-proxy trust | slice manifest mistagged Vibrance/Pact/Land Tax | scope claim without a live parse |
| Invented field name | `sacNontokenFilter` dropped by whitelist | test on the FILTER passes, behavior test fails |
| Wrong object nesting | `permanent.isCommander` vs `card.isCommander` | classification right, runtime never fires |
| Duplicate mechanism | firstMain rebuilt as "mainFirst" | your new event name isn't in any checker |
| Wrong assertion layer | pendingTriggers vs stack | negatives pass suspiciously easily |
| Phantom reminder descriptors | vanishing enchantment reminders | detected count > shaped count on a keyword card |
| Stale regression pin | For the Ancestors park pin | a PASSING test asserts your new fix doesn't exist |
| Unanchored containment match | `\benters\b` swallowing compound conditions | a compound sentence yields ONE descriptor |
| Count typos in docs | suite counts miswritten twice | any number not copied from command output |
| **Dead write** (field set, nothing reads it) | `entersAttacking` sets `permanent.attacking`; only `state.combat.attackers` is ever read | an existing field makes your slice look free — grep for READERS, not just the field |
| **Credit gated behind a deliberate park** | aftermath: the blocker was a reasoned `parseSplitCard` early-return, not the keyword | your credit changes nothing when you test it — the card never reaches that lane |
| **Stale fail-safe** (guard outlived its reason) | `sacrificeDropsTrigger`'s self-PiG clause; the runtime fires it now | a guard's COMMENT states a limitation you can disprove at runtime |
| **Startswith credit swallows a variant** | `bloodthirst` also matched "Bloodthirst X", whose count can't be produced | the per-flip audit shows an orphan the synthesizer returns null for |
| **New TARGETED op with no declared intent** | slice 37's clause parsed HIGH and the card still read body-only | `triggerRoutesNatively` returns false — the flush chooser won't route an op whose target SIDE `atomTargetIntent` can't name |
| **Fold without a keep-whole guard** | slice 10 joined the tap+lockdown rider with " and ", then the top-level " and " split shattered it right back | you add a normalization, re-measure, and get EXACTLY ZERO flips — the fold fired, something downstream undid it |
| **Two names for one referent** | the rider prints as both "It doesn't untap …" and "That creature doesn't untap …"; only the first was stripped | near-identical cards split across tiers — one flips, its twin doesn't |
| **A fold that eats its own sentence boundary** | slice 10's `\.?` consumed the rider's period and the replacement didn't restore it, gluing the NEXT sentence on | a card whose tier DIDN'T change is silently held back — invisible to the fingerprint diff, which only shows movers |
| **A whole-oracle `$` anchor on a span matcher** | RIDER-REMOVAL matched "Destroy X. Its controller <rider>." only as the LAST text on the card | the card parses HIGH when you delete an ordinary trailing sentence like "Draw a card." |

---

*Written by Cindy (Sonnet seat), 2026-07-24, from the receipts of the 07-23/24 overnight+morning
shift. If you improve the method, update THIS file in the same commit as the improvement.*

> **⚠️ RUNTIME-ONLY BUGS ARE INVISIBLE TO EVERY GATE IN THIS RUNBOOK.** The tier and program fingerprints
> both compare the parse pipeline against the parse pipeline. A runtime function that returns an empty list,
> or skips a loop iteration, changes NOTHING they can see — the metric never disagrees with itself. Slices
> 22-25 were all this: a card classified native whose effect silently did nothing. The only way they surface
> is DRIVING the card on a board. If a slice touches a resolver, add a runtime pin; a classification test
> proves the parse and nothing else.
>
> **The specific trap that produced four of them: `isCreatureCard` (PRINTED) vs `permanentIsCreature`
> (LAYER-AWARE).** A bare `isCreatureCard` on a permanent already looked up on the battlefield is nearly
> always wrong — it asks about the card when the question is about the object (CR 613: an animated land or a
> crewed Vehicle IS a creature right now). Grep for it before starting anything in the atoms layer.
>
> **THE TWO-FLIP SIGNATURE — a card with MORE THAN ONE single-line deletion that flips it native is a
> COMPOSITION failure, never a missing mechanic.** Each piece is demonstrably understood in isolation, so
> what's broken is how the tiers combine. Slice 20 came straight off this: Urborg Skeleton flipped when you
> deleted its regenerate line AND when you deleted its kicked-counter line — the kicker gate was hard-coding
> native-body and refusing any base body that wasn't keyword-only. Cheap to check: the census probe already
> computes every line's flip, so just look for cards with a flip COUNT above one.
>
> **READING HABIT — an OBVIOUSLY MODELED shape in the census is a BUG SIGNATURE, not a gap.** When the
> census reports something like `draw a card` as a sole blocker (8 cards, zero co-blockers), it is not
> telling you draw is unmodeled. It is telling you that deleting an already-modeled line FLIPS the card,
> which means something upstream is mis-binding that line. That single census row paid out twice on
> 2026-07-25 for two unrelated root causes (slices 14 and 15). Scan the census for shapes you KNOW are
> built and treat each one as a defect report.
>
> **BEFORE BUILDING ANY GROUPED ROW, DELETE-PROBE ITS CARRIERS.** A grouped count ("5 cards use this cost
> shape", "7 auras print this subject") says the SHAPE exists — never that fixing it flips anything. Those
> carriers may each have a second blocker. On 2026-07-25 a sacrifice-cost lane was implemented across three
> sites and verified end to end before measuring ZERO flips, because every carrier was also blocked
> elsewhere; it was reverted. The census's own `soleBlockers` column is the honest number — a count you
> derive by grepping or grouping is NOT.
>
> **And re-measure by SUBSTITUTING a known-good form, not by deleting the line.** Deleting conflates "this
> line is unparseable" with "this line is fine and the REST of the card is unmodeled". On the
> graveyard-recursion family that inflated 36 into ~60.
>
> **A free lead worth checking every time: SIBLING ASYMMETRY.** If two cards differ only by a line you
> did NOT touch and land in different tiers, that difference is a bug, not a fact. Slice 10 opened when
> Frost Trickster (native) and Frost Lynx (parked) turned out to be the same card modulo the word
> "Flying" — a card penalized for having LESS text always means a strip or residue gate is keying on the
> wrong thing. It's the cheapest signal in the census because it needs no probe: read two examples from
> the same cluster side by side.

## 9. WHEN A CANDIDATE IS *NOT* A SLICE (bank it, don't force it)

Today's nine slices produced four honest refusals; each is worth more banked than forced:
- **A restriction on OPPONENTS** (split second) — ignoring it makes the engine wrongly PERMISSIVE, which
  is an FP, not a missing capability. Not the same as an unoffered optional cost.
- **A credit whose runtime hook is a dead write** (mobilize) — the classification would be right and the
  behavior absent. Verify a reader exists before counting the cards.
- **A reasoned park by a previous author** (aftermath) — new information (a safe filter is possible) is a
  reason to WRITE UP the recipe, not to unilaterally reverse a documented scope call.
- **A card that literally cannot be played without the keyword** (suspend) — crediting marks unplayable
  cards native. Contrast eternalize/reinforce, whose only no-cost carriers are LANDS (played, not cast):
  same question, opposite answer, both settled by a live corpus check rather than intuition.

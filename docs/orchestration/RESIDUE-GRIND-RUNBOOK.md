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

## 0. THE FIVE LAWS (every slice, no exceptions)

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

## 8. KNOWN FAILURE MODES (all real, all from one shift — check yourself against this list)

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

---

*Written by Cindy (Sonnet seat), 2026-07-24, from the receipts of the 07-23/24 overnight+morning
shift. If you improve the method, update THIS file in the same commit as the improvement.*

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

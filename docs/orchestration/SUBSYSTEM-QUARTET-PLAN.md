# THE SUBSYSTEM QUARTET — plan and goal (Colton-ordered, 2026-08-14)

> **The order (Colton, 2026-08-14, mid-grind):** the four unbuilt layers below "would move playability,
> learning, and quality more than any card slice" — *"when you can pivot to these and make them flush
> out perfect and complete — create plan and goal for this so can be consistent."*
>
> **THE GOAL:** the sim doesn't just *play every card* (the coverage bar) — it plays them **well**
> (choice quality), can **prove why** (the decision log), can't **silently corrupt** (the auditor +
> replay), and stops parking whole card classes on one missing mana rule (restricted spend).
> Done = all four phases at their gates below, each witnessed and mutation-checked like any slice.

## Standing rules for this track

- **The same slice discipline as the card grind** — probe → build → flip-diff → witnesses with
  seen-to-fail controls → per-process mutations → lint+tests by bare exit → ledger → CI-green → push.
  A subsystem slice earns a RUN-LEDGER entry exactly like a card slice.
- **Default-off until gated.** Behavior-changing layers (1 especially) ship behind a flag, exactly like
  cardPlayHints did; the flag flips only when the phase gate passes.
- **THE CREED applies unchanged**: a wrong evaluation is worse than no evaluation only when it makes an
  ILLEGAL play — policy layers may be imperfect (that's what learning is for), rules layers may not.
- **The shelf grind interleaves.** Colton's ≥90-per-deck order stands; quartet slices and card slices
  alternate at natural boundaries. When a quartet phase is blocked or gated, grind cards.

## Phase 1 — the choice-evaluation layer (playability)

**Problem:** every choice site carries its own hardcoded house policy (least-valuable victim,
first-commander, always-take-the-may, enemy-side-first targets). Rules-correct, strategically blind.

**Build:**
1. `evaluateBoard(state, playerId)` — ONE pure function scoring a player's position: material
   (permanents weighted by MV/P/T), life, cards in hand, mana development, threats. Deterministic,
   cheap (called hundreds of times per turn), unit-tested on hand-built boards.
2. `scoreChoice(state, playerId, apply)` — the generic pattern: apply a candidate choice to a cloned
   state (or project it cheaply), diff `evaluateBoard` before/after, rank.
3. Convert the house-policy sites ONE AT A TIME, each behind `state.usePolicyEval` (default off):
   sacrifice victims → targets (cast + trigger) → may-decisions → modal picks → attack/block policy.
   Each conversion gets a witness: a board where the house policy picks WRONG and the evaluator picks
   right (the seen-to-fail control is the old policy's pick).
4. Wire `cardPlayHints` roles INTO `evaluateBoard`'s weights (the built-but-idle deriver becomes live).

**Gate:** goldfish + AI-vs-AI runs with the flag on vs off — the flag-on side must win a measured
majority over ≥100 seeded games, with ZERO illegal-action regressions (the suite stays green both ways).

## Phase 2 — the decision log (learning)

**Problem:** the sim logs *events*, not *decisions*; the decision-quality law (grade the CHOICE given
visible state, never the outcome) has nothing to grade.

**Build:**
1. A `decisionLog` channel on state (like the event log): one record per choice —
   `{ turn, phase, playerId, kind, visibleState (a compact snapshot hash + the relevant slice), options
   (each with its evaluator score once Phase 1 lands), picked, policyId }`.
2. Emission at the SAME converted sites Phase 1 touches (the scores come free there).
3. **Hidden-info honesty:** the visibleState snapshot contains ONLY zones the choosing player may see —
   graded choices must never leak an opponent's hand. A witness proves the snapshot of an opponent-turn
   decision excludes the user's hand.
4. A serializer: the log rides the saved game, exportable per game for the learning loop.

**Gate:** a full AI-vs-AI game produces a decision log that replays legibly (every record's options
re-derivable from its snapshot), with the hidden-info witness green.

## Phase 3 — the invariant auditor + seeded replay (quality)

**Problem:** witnesses prove mechanics in isolation; nothing checks global state health mid-game, and
real-game bugs aren't reproducible.

**Build:**
1. `auditState(state)` — a dev/test-mode invariant sweep: every card id in EXACTLY one zone; no
   orphaned attachments (attachedTo ↔ attachments symmetric); counters ≥ 0; life/pools numeric; every
   battlefield permanent has a card; stack objects well-formed; delayedTriggers records valid.
   Wired into the dispatcher behind `MTG_AUDIT=1` (and always-on in the test harness's dispatchAction).
2. The replay harness: record `{ rngSeed, deckLists, actionStream }` per game; `replayGame(record)`
   re-runs it deterministically and asserts the same final state hash. Any real-game bug becomes a
   fixture file.
3. Backfill: run the auditor across the existing sim-smoke suites; every violation found becomes its
   own fix slice (expect a few — that's the point).

**Gate:** the auditor runs clean across the full test suite + 100 seeded AI-vs-AI games; one recorded
real game replays to an identical state hash.

## Phase 4 — restricted-spend mana (the card-class unlock)

**Problem:** "Spend this mana only to cast Dragon spells / activate abilities of creatures / …" parks
Klauth, Rivaz, Shang-Chi MoKF, Sarkhan Fireblood + more across four-plus decks.

**Build:**
1. Pool entries grow an optional `spendOnly` tag ({ kind: "castFilter", filter } | { kind:
   "abilityFilter", ... }) — untagged mana is unchanged (byte-identical fast path).
2. `planPayment`/`canAfford`/`commitPaymentPlan` honor tags: restricted mana is spendable ONLY on a
   matching purpose, and the planner PREFERS spending restricted mana first on legal purposes (never
   stranding it when a legal spend exists — that's the play-strength half).
3. The mana-ability parse arms for the printed forms ("Add {R}{R}. Spend this mana only to cast Dragon
   spells."), whole-clause anchored per carrier class.
4. The cleanup rule interactions ("you don't lose this mana as steps and phases end" — Klauth) ride the
   existing pool-persistence machinery or park honestly.

**Gate:** each unlocked carrier witnessed end-to-end (the restricted mana pays a legal cast; an
ILLEGAL spend is never offered — the seen-to-fail control is an unrestricted pool paying it), plus a
flip-diff whose gains are exactly the audited carriers.

## Sequencing

**1 → 2 as one arc** (the evaluator feeds the log — Colton's stated priority), **then 3**, **then 4**.
Phase 4 may run EARLY as an interleave card-slice whenever a shelf deck's residue is dominated by the
restricted-spend class (Dragons and Kinnan both qualify) — it is the most independent of the four.

## Status ledger (update per slice, newest first)

- 2026-09-06 — **PHASE 4 step 3 — the chosen-type form WITH its ability tail** (Secluded Courtyard; +1 corpus). An @chosenType
  placeholder in abilityOf, swapped for the land's chosen word at the source; an unresolved choice pays nothing. mutants 4/4 killed.
  Remaining step-3 class: colour words ("colorless spells") — two carriers, a colour predicate on both purposes.

- 2026-09-06 — **PHASE 4 step 3 — the NEGATIVE form + the Powerstone token** (+18 corpus). "This mana can't be spent to cast a
  nonartifact spell" reads as artifact casts + every ability (abilityOf "@any"); the token joins NAMED_TOKENS; "create a tapped
  Powerstone token" parses. mutants 4/4 killed. Remaining step-3 classes: colour words ("colorless spells"), the chosen-type-plus-tail.

- 2026-09-06 — **PHASE 4 step 3 — the ABILITY tail** ("… or to activate an ability of a <Subtype> source"; +0 corpus). abilityOf
  now carries subtypes beside "creature"; spendRestrictionAllows matches the activating source's type line (every activation
  site passes activatingTypeLine); the extra-mana-line regex admits the tail and comma lists — which also closed a dead-mana
  gap: four lands credited `land` the same day had produced only their {C} line. mutants 5/5 killed (one survivor got its missing test — the end-to-end offer pin through legalActionsForPlayer). Remaining step-3 classes: colour
  words ("colorless spells"), the Powerstone's negative form, the chosen-type-plus-tail (Secluded Courtyard).

- 2026-09-06 — **PHASE 4 step 3 — a carrier class: CR creature types in the spend vocabulary** (Turtle Lair, Sliver Hive; +9
  corpus). The SHELF-85 runbook had sized Turtle Lair SUBSYSTEM-L; the probe found the core present and only the curated word
  list refusing "a Ninja or Turtle spell". parseSpendRestriction admits any CR creature type; the planner's type-line match was
  already generic. Witnessed end to end (the restricted record pays a Ninja, never a Bear); mutants 2/2 killed. Remaining step-3 classes:
  the "or to activate an ability of a <Subtype> source" tail (abilityOf is creature-only), colour words ("colorless spells"),
  the Powerstone's negative form.

- 2026-08-15 — **🏁 PHASE 3 COMPLETE — its gate met in full.** Slice 2: replay.js (canonicalState —
  explicit field order, platform-stable; stateHash FNV-1a) + the withStateHash runner option; the
  determinism CONTRACT witnessed (a full game replays hash-identical on identical args; the
  different-seed control kills the constant-hash hollow gate; the battlefield-component mutation
  killed). THE BACKFILL delivered THREE real finds, all root-fixed: ① the falsy-id deck fallback
  (cross-deck collisions), ② the one-zone invariant's honest scoping (per-player hidden zones,
  global battlefield+stack), ③ the qty-split per-name id collision (thirty same-id Forests in one
  library — the route test's fixture). After all three: the FULL SUITE runs with EVERY dispatch
  audited, zero violations — and the audit is now ALWAYS-ON under tests (the setup file), MTG_AUDIT=1
  for dev runs. Every future witness is audited by default; every real-game bug is a
  { args, finalStateHash } fixture.
  **THE QUARTET'S STANDING:** Phase 1 built+gated (the flip awaits a policy that earns it — the
  diagnostic loop exists to find one) · Phase 2 spine pinned + the diagnostic delivered its first
  verdict (tail: evalScores on pending rows) · Phase 3 COMPLETE · Phase 4 functionally complete (the
  core + two consumers). The shelf grind resumes primary.

- 2026-08-15 — **PHASE 3 SLICE 1 SHIPPED — and the auditor earned its keep on day one.** auditState
  (seven invariant families: per-player hidden-zone card uniqueness + GLOBAL battlefield/stack
  uniqueness, attachment symmetry both ways, counters ≥ 0, life/pools numeric, battlefield/stack
  shapes, delayed-record validity) wired behind MTG_AUDIT=1 in dispatchAction (staged per the
  default-off law; always-on-in-tests waits for the full backfill). Every invariant witnessed with a
  hand-corrupted seen-to-fail state; the dedup mutation killed. THE BACKFILL'S FIRST PASS FOUND TWO
  REAL ISSUES: ① the deck builder's falsy-id fallback minted IDENTICAL card ids across every id-less
  deck (caught on game one: "deck-Forest-1" in two players' libraries; fixed at the root — the deck
  NAME fallback; the mirror-match residual documented); ② the one-zone invariant honestly SCOPED
  (hidden zones per-player — every state-level lookup there is playerId-scoped; battlefield+stack
  global, where cross-player id interaction is real). After the fixes: 10 full games, EVERY action
  audited, zero violations. REMAINING Phase-3: the replay harness (record rngSeed+deckLists+
  actionStream → deterministic re-run → state-hash assert) + the full-suite backfill + the
  always-on-in-tests flip.

- 2026-08-15 — **KLAUTH SHIPPED — the sub-pool's first consumer; Phase 4's build list is now three of
  four done.** The keep-whole fold + the layer-aware totalAttackingPower reader + the minting resolver
  (R/G round-robin off the source's color identity, documented deterministic). Klauth
  body-only→native-trigger; Dragons 85→86. Remaining Phase-4 tail: more consumers as the shelf finds
  them (the Rivaz/Shang-Chi restricted SOURCES already ride slice 1's conjunctive phrase; their other
  parked machines are unrelated). The quartet's cross-pollination note: this slice moved BOTH a
  quartet phase and the shelf batch — the interleave working as designed.

- 2026-08-15 — **PHASE 4 CORE SHIPPED: the pool-restricted sub-pool.** player.restrictedMana =
  [{ pool, restriction, holdUntilEndOfTurn? }] — the tagged entries the per-color pool couldn't
  express. planPayment PRE-PASS spends qualifying entries FIRST (restricted-first; colored pips then
  generic; hybrids conservatively not entry-payable); the plan's entrySpends deduct exactly at
  commitPaymentPlan (remainders STAY TAGGED — partial spends can't launder, unlike source surplus,
  whose full-consumption guard is untouched); emptyManaPools drops un-held entries at step ends,
  holdUntilEndOfTurn survives to finishCleanupActions. "@any-spell" token for the bare "cast spells"
  form (any castCard qualifies; abilities thread no context — enforced by default-deny). The two cast
  sites thread entries; the ability path deliberately does not. Witnessed ×6 (pays from zero open
  mana · no-context refusal · restricted-first leaves the pool untouched · partial stays tagged ·
  emptied entries drop · the hold survives steps and dies at cleanup); mutations ×3 killed (the
  context filter, the commit deduction, the hold inversion). REMAINING: Klauth's trigger arm (the
  three-sentence fold + totalAttackingPower + the any-combination color policy + the resolver
  minting the entry) — the first CONSUMER of this core.

- 2026-08-15 — **PHASE 4 SLICE 1 SHIPPED: the conjunctive spend-restriction phrase.** "dragon" joined
  SPEND_CAST_TYPE_WORDS, and a multi-word phrase ("Dragon creature spells" — Rivaz's {T}) becomes ONE
  CONJUNCTIVE entry: the spell must match EVERY word (an ANY-match would be looser than printed — the
  forbidden direction; the mutation that degrades every→some is witness-killed by an Elf paying with
  Dragon mana). AND within an entry, OR across entries; single-word entries byte-identical; the Helga
  anti-lossy guard pinned intact. Witnessed at the PLANNER level: the restricted source pays a Dragon
  cast and cannot pay an Elf cast, with the unrestricted-source control. Zero tier flips (Rivaz still
  parks on his other machines) — the gain is RUNTIME mana access for the Dragons/Kinnan decks' play.
  REMAINING Phase-4 core: the POOL-restricted sub-pool (Klauth's trigger-granted mana) + the
  end-of-turn hold + his X-scaled any-combination arm.

- 2026-08-15 — **PHASE 4 SCOPED AGAINST REALITY — half of it shipped long ago.** Probed before
  building (the Phase-2 lesson): manaModel already has spendRestrictionAllows + SPEND_CAST_TYPE_WORDS
  + per-SOURCE restrictions honored by planPayment's spendContext — Rivaz's {T} restriction parses,
  and Sarkhan Fireblood is already playable-pw. The genuinely unbuilt piece is NARROWER than planned:
  **POOL-restricted mana** — mana granted by a resolving trigger that enters the pool carrying a spend
  restriction (Klauth's "add X … Spend this mana only to cast spells"), which the per-color-count pool
  cannot express (the manaHold CAP model deliberately avoided tagged sub-pools; a spend restriction
  cannot ride a cap — widening would be the forbidden FP direction). Klauth also needs the
  until-END-OF-TURN hold variant (the existing hold clears at end of combat) and the X-scaled
  any-combination add (amountCount totalAttackingPower). Rivaz's remaining parks are un-related
  machines (a standing GY-cast permission + a quoted grant-on-cast). Phase 4's build list is now:
  ① the tagged restricted sub-pool + planPayment/commitPaymentPlan integration, ② the end-of-turn
  hold variant, ③ Klauth's trigger arm (the three-sentence fold), ④ carriers re-probed + witnessed.

- 2026-08-15 — **THE DIAGNOSTIC DELIVERED ITS VERDICT AND THE FALSIFIED POLICY IS WITHDRAWN.** The
  100-seed --diagnose probe: **62 of 64 divergent games forked on a cast-spell decision, and the
  evaluator seat won 18 vs 23 in exactly those** (pass-priority: 2 forks, 1-1 neutral) — slice 5's
  value-first within-tier cast ordering is the confirmed loser, precisely as hypothesized after the
  21-26 gate. ACTION: the adjustment is REMOVED (the threading seam stays for a data-backed
  replacement); the withdrawal is PINNED (boardEval.test castOrderWithdrawn — flag on/off cast scores
  identical; a re-introduced adjustment that forgets to re-gate fails there first). The CONFIRMATION
  re-gate: 17 diverged, 27-26 — byte-identical to the pre-slice-5 baseline; the negative is gone and
  the remaining four converted sites are noise-to-slightly-positive. Determinism held across all four
  100-game runs (same seeds → same outcomes).
  **PHASE-1 STANDING:** four sites converted safely (default-off), the falsifiable hypothesis tested
  and honestly rejected, the gate + diagnostic machinery permanent. The flag flip awaits a policy
  that actually earns it — the diagnostic now exists to find one.

- 2026-08-15 — **PHASE 2 RESHAPED BY A DISCOVERY, then built lean.** The plan's premise ("the sim
  logs events, not decisions") was STALE: the rows-v3 decision trajectory already exists
  (selfPlayRunner recordDecisions → featurizeState features + action + offered-set histogram + rank +
  castScores + scoreGap), and decidePendingChoice already records the pending-window decisions. So
  Phase 2 is NOT a new channel — it is: ① the HIDDEN-INFO CONTRACT pin (decisionLogHiddenInfo.test:
  a distinctively-named opponent hand card is absent from a seat's serialized features while its
  COUNT is seen — the visit-proof control against a vacuous pass; the featurizer's sizes-only
  vocabulary is now a witnessed contract, not a happenstance); ② the FIRST-DIVERGENCE DIAGNOSTIC
  (eval-gate --diagnose): both arms record decisions, and for every diverged game the treated seat's
  first differing action names the choice class that forked it, tallied with per-arm win correlation
  — the tuning tool the negative gate demanded. The 100-game probe is running; findings land here.

- 2026-08-14 — **THE PHASE-1 GATE RAN TWICE — VERDICT: NO FLIP, and the second run is a real negative.**
  The harness (scripts/eval-gate.mjs): per seed, the SAME pod runs flag-off and flag-on-for-one-
  rotating-seat; the treated seat's wins are compared arm-to-arm; a divergence counter guards against a
  vacuous gate (the hollow-gate law). The flag went PER-SEAT for this (boardEval.usePolicyEvalFor —
  `true` | [seatIds]; the runner grew a `usePolicyEval` knob).
  · **Run 1** (sites: sac victims + auto-picks + trigger targets + mays): 100 games, 0 errors, only
    17 diverged, 27 vs 26 — noise. The converted sites are LOW-FREQUENCY. The verdict line was
    tightened to demand a real margin (≥ max(3, 20% of diverged)).
  · **SLICE 5** (the response): the CAST-ORDERING refinement — scoreCastAction splits into the
    archetype tier + a flag-gated within-tier cardValue adjustment (capped < 1, provably never
    crossing a tier — the cap mutation is witness-killed). The highest-frequency choice in the sim.
  · **Run 2** (cast ordering live): 100 games, 0 errors, **64 diverged** (the flag reaches real
    decisions now) — and the treated seat won **21 vs 26: WORSE than legacy.** A real regression the
    gate caught before it could touch play (the default-off law held; nothing user-facing changed).
  **READING:** value-first within-tier cast ordering is the wrong policy as weighted — plausibly it
  front-loads threats into removal and mis-sequences. The right next move is NOT weight-twiddling
  blind: build **Phase 2 (the decision log) FIRST**, so the 64 divergent games can say WHICH decisions
  flipped and which flips lost games. The quartet's own sequencing (evaluator → log) proves itself:
  the log is the diagnostic the tuner needs. Until then the flag stays off everywhere.

- 2026-08-14 — **PHASE 1 SLICE 4 SHIPPED**: the MAY decision converts — optionalAutoTakeValue is the
  SCORE-CHOICE pattern realized (resolve BOTH worlds through the real settle, diff evaluateBoard for
  the decider, take iff ≥). The autopilot fallback in learnSession is board-aware behind the flag; a
  human/pilot decision is upstream and untouched. Witnessed: flag-off always-takes even a self-
  sacrifice may (the proven wrong pick); flag-on declines it and still takes the draw. The
  comparison-direction mutant killed by the witness. Phase 1 steps 1-3 of the build list are DONE and
  scoreChoice arrived early (step ⑤ folded into this slice's helper). NEXT: the goldfish gate (≥100
  seeded flag-on vs flag-off games) — the LAST item before the flag can flip.

- 2026-08-14 — **PHASE 1 SLICE 3 SHIPPED**: the trigger-target chooser (gameEngine.chooseTriggerTargets)
  converts — among the CORRECT-SIDE candidates, flag-on picks by summed permanentValue (removal aims at
  the biggest threat; buffs land on the best own permanent; player/spell targets neutral). The side
  FILTER is untouched either way (a friendly-fire candidate refused on both sides — witnessed).
  Witnessed: legacy takes the first-enumerated small token, the evaluator the big Dragon; the max-pick
  inversion mutant killed by the witness. NEXT: the may-decision sites, then scoreChoice, then the
  goldfish gate.

- 2026-08-14 — **PHASE 1 SLICE 2 SHIPPED**: the runProgram auto-pick MIRRORS converted
  (autoPickSacrificeCandidate → evalLeastValuableCmp; autoPickDiscardCandidate → the new
  cardValue/evalLeastValuableCardCmp twin), same flag, so the AC-1 site and the edict/discard chains
  stay policy-mirrors on BOTH sides of the flag. Witnessed (edict: legacy gives up the Elves, the
  evaluator a bear; discard: legacy bins the Elves card, the evaluator the vanilla) with flag-off
  controls; both flag-branch mutations killed. NEXT: the target-choice sites (chooseTriggerTargets).

- 2026-08-14 — **PHASE 1 SLICE 1 SHIPPED**: `boardEval.js` (permanentValue — layer-aware P/T,
  cardPlayHints role bonuses, commander weight, token discount; evaluateBoard; evalLeastValuableCmp)
  + the FIRST converted site (the AC-1 sacrifice-victim ranking in legalChoices, behind
  `state.usePolicyEval`, default off). Witnessed: the legacy policy sacrifices Llanowar Elves to keep
  a vanilla bear; the evaluator keeps the mana engine — with the flag-off seen-to-fail control pinning
  the default-off law. Mutations killed (role bonus zeroed → the witness's point dies; the flag gate
  inverted → the flag-off control catches it). NEXT: convert the runProgram autoPickSacrificeCandidate
  mirror + the edict-chain choice, then targets, then `scoreChoice`.
- 2026-08-14 — PLAN CREATED.

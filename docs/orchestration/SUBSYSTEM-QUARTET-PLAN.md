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

- 2026-08-14 — PLAN CREATED. Nothing built yet. Next: Phase 1 step 1 (`evaluateBoard`).

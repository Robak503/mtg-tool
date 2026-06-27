# CoverageRun — the consolidated one-chat coverage build (operating spec)

> **Supersedes the 4-chat faculty model.** Clyde is the **sole orchestrator + sole master-writer**;
> builders are sub-agents *under* the orchestrator, not separate chats. Omnath = WHAT/WHY; Clyde =
> HOW/WHEN + all engine/app code + master. **Live state derives from `git` + `STATUS.md`, never this doc.**
> Pairs with the source design: `omnath-tools/CODEX_one-chat-build-blueprint.md` + `CODEX_throughput-optimization.md`.

## Decisions (locked 2026-06-26, Colton)
- **Metric = DEPTH primary:** the 13 training decks play end-to-end, zero Arbiter deferrals (named carve-outs
  only, e.g. Chain of Vapor). Corpus-% is the *trunk proxy*, pumped in parallel — not the north star.
- **Topology = ONE orchestrator (Clyde).** No separate 2nd top-level agent (quality-first = smallest
  coordination surface; the coverage.js/triggers.js convergence makes a 2nd writer a hazard). Builders fan
  out as sub-agents under the orchestrator. **Single master-writer.**
- **Spend = balanced** (quality > throughput; time is not the constraint): big batches amortize the
  O(corpus) fingerprint cost; moderate fan-out; hard checkpointing. Wide 8–16 fan-out is *avoided* — it
  raises the FP + shared-file-contention surface.
- **Autonomy = full, heads-down:** auto-merge the narrow/anchored tail behind the deterministic gate
  (self-calibrate by human-sampling my own first ~20). **Invariants kept regardless of trust** (safety, not
  taste): never force-push master, never commit `~/.tauri` keys, **CREED — a false-positive is FORBIDDEN**,
  and **releases to the signed auto-updating .exe** are cut only at clean milestones *with guard-kit proof in
  hand + a heads-up before the tag* (that node reaches every install in 24h).

## The guard kit — load-bearing checks live in CODE, not agent prose (the fabrication lesson)
All four are committed, headless (`MTG_APP_ROOT=<main-tree>/app`), deterministic, builtins-only:

| tool | what it diffs | the gate it is |
|---|---|---|
| `app/scripts/tier-fingerprint.mjs` | `classifyCard` tier per card | cheap **necessary** flip-diff for ordinary slices (audit every body-only→native flip) |
| `app/scripts/program-fingerprint.mjs` | canonical `parseEffectClause` output (spell + triggers + activated + `programConfidence`) | the **seam acceptance gate (R1)** — necessary **and sufficient** for "no resolution change"; catches a same-tier op-rebind (`fight→deal-damage`) the tier diff is blind to |
| `app/scripts/runtime-fingerprint.mjs` | `manaProduction` / `doublerProfile` / `isPureDoubler` per card | the **resolver-output guard** — catches runtime-only changes (the phantom-mana / doubler FP class) on cards that never flip tier |
| `app/scripts/allowlist-guard.mjs` | `COVERED_KEYWORDS` + qa-sweep allowlist sets, working vs `origin/master` | **R2 tamper guard** — any added member = AUTO-REFUTE until enforcement is independently confirmed (a slice can't self-certify a keyword) |

Diff recipe: run a tool on the merged tree + on a `git worktree add --detach <base-SHA>` baseline, `diff`.
The scripts are committed, so the orchestrator invokes them itself — no agent hand-writes the load-bearing check.

## The gate (per slice / wave)
1. **Build** — sub-agent, model the WHOLE card (CREED all-or-nothing), ultracode OFF *inside* the builder.
2. **tier-fingerprint** diff — audit every body-only→native flip; out-of-native = FP removal (good).
3. **program-fingerprint** diff — for any parser/recognition change: byte-identical over 34,160 = behavior-preserving.
4. **runtime-fingerprint** diff — for any manaModel/replacementEffects slice.
5. **allowlist-guard** — for any keyword slice: addition → auto-refute pending enforcement confirm.
6. **Adversarial REFUTE sweep** on new waves / broad matchers — skeptics prompted to refute, must QUOTE the
   dropped clause + runtime-probe; the **script re-runs the actual resolver** (the final assert is JS, not prose).
7. **`npm test`** (confirm the literal "Tests N passed" line — the wrapper false-greens on a crash) + **lint**.
8. **ff-merge** (see protocol) → refresh `STATUS.md` + `fp-watch.md` + `coverage`. Honest coverage may dip when
   a wave removes FPs — that's a win.

## Master-write protocol (sole writer)
- ff-only, never force. **ff-guard:** `git fetch origin && git merge-base --is-ancestor origin/master HEAD` →
  `git push origin HEAD:master`.
- **On divergence** (another writer during transition): `git rebase origin/master`, re-verify ff-guard, push.
- **Idempotency / dedup key = the `[squash #NNN]` commit marker**, NOT `--is-ancestor`. A squash replays a
  branch as one new commit, so an integrated branch is a NON-ancestor of master and GitHub still shows it
  MERGEABLE/CLEAN. Resume/dedup off `git log master | grep "[squash #NNN]"`. **Every integration carries a PR
  number** so the no-op dedup key always exists.
- Never `git stash` / `git add -A` / `git clean` on the shared `.git`.

## Phase sequence
- **Phase 0 — DONE** (master `65088f8`): consolidate + commit the guard kit (the 4 tools above).
- **Phase 1 — IN PROGRESS: the parser.js matcher-registry seam.** Lift the ~149 inline `parseExtendedAtom`
  branches into registered `CLAUSE_PARSERS` modules in **small batches**, mirroring the `atoms/*.js` families.
  **Acceptance per batch = `program-fingerprint` byte-identical over all 34,160 cards** (a pure refactor) —
  mechanically proves the "priority order preserved exactly" requirement the tier diff cannot. The seam is the
  throughput gate for wide fan-out; the integrator-wall win (concurrent verify, serial ff-push) is already
  delivered by the one-chat pipeline and is seam-independent.
  - ✅ **Batch 1 (`312a273`): EXPLORE migrated** → `atoms/library.exploreClauseParser`. program-diff = 0,
    4222 tests green. Methodology PROVEN — extract → register → program-fingerprint byte-identical → ship.
  - ✅ **Batch 2 (`d91c72b`): parseHelpers leaf** — `SMALL_NUM`/`NUM_WORD` extracted to `effects/parseHelpers.js`
    (pure, imports nothing) so matcher modules can consume them cycle-free. program-diff = 0.
  - ✅ **Batch 3 (`4173dd7`): PROLIFERATE + GAIN-EXPERIENCE migrated** → `atoms/counters.js`; gain-experience is
    the first family to consume the parseHelpers leaf (proves the cycle-free pattern). program-diff = 0.
  - **Key insight:** a migrated branch moves from the inline (priority) path to the `CLAUSE_PARSERS`
    (post-`parseExtendedAtom`) path, so it is behavior-safe ONLY when its clauses match no other matcher;
    `program-fingerprint` proves that per batch. Whole-clause-anchored families are safe; overlapping ones need
    order-preserving handling.
  - **NEXT:** earthbend + rad need the count-source machinery (`parseCountSource` + its `COUNT_*` maps) —
    extract that to the parseHelpers leaf as a (bigger) batch, then migrate earthbend/rad. The big families
    (pump/tutor/counter/draw/bounce) have more complex regexes with double-match potential — migrate each
    behind the program-fingerprint gate, which refuses anything that isn't a true byte-identical no-op.
- **Phase 2 — prove ONE clean wave** end-to-end through the consolidated machine (build → fingerprint verify →
  gate → ff-merge) on real cards. **Only after this passes do faculties wind down.**
- **Phase 3 — widen fan-out** on disjoint atom-families (collision-free post-seam).

## Autonomous loop (Colton granted a long unattended run 2026-06-26 — "see how far you can go")
Each wakeup re-enters FRESH (no memory of the prior turn) and is fully driven by this file + git. Protocol:
1. **Re-derive state:** `git fetch origin --prune`; confirm clean tree on the session branch; read this file's
   Phase-1 batch list (what's done / next) + `gh pr list --state open` (new builder PRs).
2. **Pick ONE action (priority order):** (a) a NEW builder PR (#381+) opened → integrate it through the gate
   (tier + program + runtime fingerprints as applicable, adversarial sweep on a wave, `npm test`+lint, ff-merge);
   (b) else → migrate the NEXT seam family (queue below); (c) else if seam done → Phase 2 (prove one wave).
3. **Gate (hard):** for a seam batch, `program-fingerprint` MUST be byte-identical over 34,160 vs the pre-batch
   `origin/master` (baseline via `git worktree add --detach <sha>`). **Not byte-identical → DO NOT SHIP:** revert
   the batch, log the family as "needs order-handling" here, move to the next family. Never force a non-identical
   seam merge. `npm test` ("Tests N passed") + lint green before push.
4. **Record + re-arm:** update this file's batch list, commit (explicit paths) + ff-push, delete temp worktree/files,
   then ScheduleWakeup with the same continuation prompt. Keep going until a STOP condition.
5. **STOP conditions (surface to Colton, do NOT proceed):** a RELEASE tag is warranted (heads-up + proof first —
   never auto-tag the signed .exe) · a genuine architectural fork with no obvious answer · two consecutive
   families fail the gate for the same structural reason (precedence design needs a human call). Usage-limit kills
   are NOT a stop — the run resumes from git + this file on the next session.

### Seam family migration queue (easy → hard; reorder freely as the gate dictates)
- ✅ explore · ✅ proliferate · ✅ gain-experience (batches 1–3) · ✅ count-source machinery → parseHelpers leaf
  (batch 4, `01065a9`) · ✅ earthbend → atoms/combat (batch 5, `2405dfb`). All program-diff = 0.
- **NEXT:** **rad** (counters.js; SMALL_NUM only) — its branches are SCATTERED/interleaved with the cdmg-draw /
  dies-payoff matchers in parseExtendedAtom; the clean "rad family" is the 3 CONTIGUOUS player-grant branches
  (`each/you/target … gets N rad counters`). The cdmg/dies rad variants (`they/that player gets … rad counters`,
  `each opponent gets … rad counters equal to its power`) belong with a future cdmg-payoff/dies-payoff family, NOT
  rad — migrate only the contiguous player-grant block; leave the trigger-referent variants inline (the gate proves
  byte-identical either way).
- **Then singletons** (whole-clause-anchored, low overlap): fog · surveil · scry · shuffle · discover · tuck · tap · untap.
- **Then mid families:** life (lose-life/gain-life) · hand (draw/discard/bounce) · removal (destroy/exile/deal-damage).
- **Then the big, complex-regex families LAST** (higher double-match risk; each strictly gated): pump · tutor · counter ·
  create-named-token · sacrifice · animate. The gate refuses any that aren't a true no-op.

## Transition safety (do NOT create a throughput gap)
- Builder faculty chats **keep running** until Phase 2 proves one clean wave. The old build never stops before
  the new one works.
- Other **integrator** sessions stood down NOW (sole master-write — two writers is the race we're killing).
- **Before archiving any builder:** checkpoint-push its worktree to origin — unpushed work orphans in an
  isolated worktree invisible to `git fetch` / `gh pr list` / `STATUS.md`.

## Open (Colton)
- **Spend ceiling** (a number per day/week) — informs batch size + fan-out width.
- Seam **family-boundary spec** assumed mine to decide (mirror `atoms/*.js`), documented at Phase 1 — flag if not.

## Pertinent memories
`project_creed_and_discipline` · `project_coverage_metric_decoupled_from_runtime` · `feedback_build_systems_register_cards`
· `project_parallel_coverage_orchestration` · `project_no_arbiter_for_training_decks` · `project_clyde_facilitator_identity`.

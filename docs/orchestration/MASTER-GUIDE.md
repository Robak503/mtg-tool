# MASTER GUIDE — how to work on MTG Tool after Fable 5

> **THE index + the distilled operating knowledge.** Written 2026-07-04 at the close of the
> last planned Fable 5 session, so that every future session — any model — boots right,
> works at the same proof standard, and never re-launches a finished mission. Read THIS
> first; it tells you what to read second. Commands and recipes are NOT duplicated here —
> they live in the playbooks (§5 registry) and this guide points at them, so they can't
> drift apart.

---

## §0 State of the method (read this once, believe it)

**All four one-time Fable 5 passes are COMPLETE. No Fable mission is pending.**

| Pass | Shipped | Durable deliverables |
|---|---|---|
| Consolidation (repo-wide scan + repair) | v0.84.0 | PROJECT-SCAFFOLD.md · ENGINE-SCAFFOLD.md |
| Engine deep overhaul (perf + quality + Omnath seams) | v0.85.0 | OVERHAUL-PLAYBOOK.md · OVERHAUL-SESSION-NARRATIVE.md · overhaul-evidence.md · PLAY-API-CONTRACT.md |
| Play-harness + AI overhaul (+ pilots) | v0.86.0 | PLAY-HARNESS-OVERHAUL-PLAYBOOK.md · play-harness-overhaul-log.md |
| LEYLINE UI overhaul + kiosk IA (2 waves) | v0.87.0 / v0.88.0 | ui-overhaul-log.md (§0 = the UI method) · /styleguide route · HOW-TO-ADD-AN-AREA.md |
| Omnath-side system overhaul (memory/pilots — ran in the Omnath seat) | 2026-07-03 | omnath-tools/OMNATH-SCAFFOLD.md · OMNATH-OVERHAUL-PLAYBOOK.md |

If you find a mission prompt (`FABLE5-*-PROMPT.md`, `memory/orders/*fable5*`) it is
**historical** — banners on each say what it produced. Do not re-execute one. Forward work
lives in **[UPGRADE-BACKLOG.md](UPGRADE-BACKLOG.md)** (the ranked feature/upgrade queue) and
`memory/orders/` files whose banners say they are LIVE.

Everything below is written to be executed by non-Fable sessions — the default assumption is
an **Opus-class orchestrator with Sonnet-class workers** (§2).

## §1 Boot table — what to read, by work type

Every session, regardless of type: `git fetch origin master` + `git log origin/master
--oneline -10` · read [WAKE-REPORT.md](WAKE-REPORT.md) (the live resume anchor) · check
`memory/COMMS.md` top (lock? open ❓ questions?) + `memory/CONTINUITY.md` top · **run the
gate green BEFORE changing anything** so any later failure is attributable to you.

| Work type | Read, in order | Law / gate |
|---|---|---|
| Engine / coverage / rules | ENGINE-SCAFFOLD.md (§ how-to-add-a-mechanic) → OVERHAUL-PLAYBOOK.md §2–3 → `memory/orders/clyde-grind-relaunch.md` | CREED + full fingerprint battery at the §3 proof level |
| **Corpus coverage grind (census-driven — THE standing method as of 2026-07-24)** | [RESIDUE-GRIND-RUNBOOK.md](RESIDUE-GRIND-RUNBOOK.md) — complete, model-agnostic, self-contained (5 laws · census → scope → build → verify → record · failure-mode table) | deletion-probe census ranks the queue; sole-blocker audit + tier-fingerprint both directions per slice |
| Harness / AI / runner / pilots | OVERHAUL-PLAYBOOK.md first → PLAY-HARNESS-OVERHAUL-PLAYBOOK.md (anchor lineage, A/B probe, census, r11 loop) | trajectory-hash discipline + per-slice A/B evidence |
| UI / components / styling | PROJECT-SCAFFOLD.md §2.2 → ui-overhaul-log.md §0 (the method) → the hidden `/styleguide` route | LEYLINE law: tokens only, `.btn` system, engine fence proven (tier fp 0-diff + trajectory hash holds) |
| New kiosk area / surface | docs/HOW-TO-ADD-AN-AREA.md | registry-driven; a new door is ~3 small edits |
| Features / bolt-ons | [UPGRADE-BACKLOG.md](UPGRADE-BACKLOG.md) (pick the top unblocked item of the named wave) | per-item verify column |
| Release / shell / build pipeline | RELEASE.md → docs/gotchas.md (MANDATORY before touching Rust/build) | CI is the only signing path |
| Omnath side (memory, pilots, brain) | boot `/omnath` → omnath-tools/OMNATH-SCAFFOLD.md → OMNATH-OVERHAUL-PLAYBOOK.md | eval gates (recall HOLD, pilots test-all, memory-graph) |

**The one-owner lock protocol** (demonstrated 4× in COMMS, now a rule): a pass that takes
broad write authority over `app/` (an overhaul, a multi-surface UI wave) POSTS a lock block
to `memory/COMMS.md` top at start ("this session holds engine-write authority — no other
chat touches master/app until the handoff posts") and LIFTS it explicitly at handoff,
restating the anchors (suite count, tier fp verdict, trajectory hash). Routine single-lane
work (the grind, one backlog item) needs no lock — but still checks COMMS top for someone
else's.

**The standing-order hygiene rule**: before obeying any `memory/orders/*` file, validate its
conditions against CONTINUITY top + COMMS top. If an order references a freeze, hold, or
"pass currently running" that has since completed, the constraint is VOID — update the order
file first (or flag it), then execute the rest. An order is a snapshot, not scripture;
`clyde-grind-relaunch.md` carrying an expired contract-freeze for a finished pass is the
worked example of why this rule exists.

## §2 Model + orchestration policy (canonical — supersedes every scattered copy)

- **Orchestrator (the main chat)**: the strongest model available — Fable 5 if usage
  remains, otherwise **Opus (current generation) at `xhigh` effort**. `max` effort is a
  scalpel, not a default: reserve it for the single hardest judgment calls (a CREED-critical
  seam design, a gnarly integration conflict); it burns budget fast and rarely beats xhigh
  on routine work.
- **Workers (Agent/Workflow subagents)**: `model: "sonnet"` for mechanical work (bulk edits
  to a spec, test transcription, formatting sweeps, inventory reads). **Escalate to
  `model: "opus"` for judgment-heavy work**: adversarial skeptics, recon/design agents,
  CREED-heavy review, synthesis. **Always pass `model` explicitly** — omission silently
  inherits the session model and spends orchestrator-class tokens on worker-class jobs.
- **Substitution rule for the playbooks**: wherever a playbook or historical prompt says
  `model: "fable"`, read `model: "opus"`.
- **Effort**: workers default to the session effort; drop to `low`/`medium` for mechanical
  lanes, raise only the verify/judge stages.

**When ultracode (Workflow-tool orchestration) is worth it** — evidence from this repo's
own history:

| Shape | Worth it? | Evidence |
|---|---|---|
| Adversarial re-verification of inherited work | **YES** — the single highest-value pattern | 8 skeptics caught a live CREED regression in day-old "verified" v0.84.0 work |
| Wide read-only scans / audits / inventories | **YES** | 31-agent harness scan → 62 findings, 0 refuted; 9-reader UI inventory; 6-surveyor creative review (2026-07-04) |
| Independent-perspective design/creative review | **YES** (fable/opus workers) | the UPGRADE-BACKLOG came from exactly this |
| File-disjoint build lanes | Yes, **≤2 lanes**, exclusive file-ownership lists | every overhaul pass; >2 lanes hits API rate limits and gets workflows killed |
| Serial CREED-heavy engine edits, integration, small features | **NO — solo xhigh beats N shallow contexts** | dispatcher/mana/zone work stayed in the orchestrator's hands in every pass |

Cost reality: the 6-surveyor creative review cost ~1M subagent tokens; a full overhaul-scale
pass runs several million. On a capped account, spend fan-out on **reads and verification**
(cheap models, high parallel value) and keep **writes and synthesis** in one deep context.
Rule of thumb: *fan out reads, serialize writes; if the task is one file or one seam, no
workflow.*

## §3 The method, one page

**Wave anatomy** (full version: OVERHAUL-PLAYBOOK §1): evidence → design → build → prove →
integrate. No evidence, no wave. Smallest coherent change. Every commit message carries its
evidence. ff-only, never force-push.

**The union never-skip list** (engine §5 + harness §5 + UI, merged — the things that were
each learned the hard way):

1. The full gate at the right proof level (OVERHAUL-PLAYBOOK §3 / PLAY-HARNESS §3): suite
   (`npx vitest run` from `app/`, **never** with `MTG_APP_ROOT`) + lint (`--max-warnings 0`)
   + the fingerprint battery the change class demands. The suite alone misses every FP class
   the passes fixed.
2. **Scripts always get `MTG_APP_ROOT`; vitest never does.** Anchors are only comparable
   within one data root.
3. Audit every LOST/GAINED/changed fingerprint row **by name with real oracle text**. A row
   you can't explain is a regression — stop.
4. Trajectory hash ×2 before AND after any engine/harness wave; anchor lineage documented
   (old → new → why) for intentional behavior changes; never re-anchor to absorb a diff you
   can't explain.
5. Baselines BEFORE optimizing; per-slice A/B probe evidence for every AI change; keep the
   legacy arm recoverable (`POLICY_KEYS` "v1").
6. **Adversarially re-verify inherited work before building on it** — refute-by-default
   skeptics for anything big. "Verified yesterday" is a claim, not a fact. When in doubt,
   spawn a skeptic; this is standing law, not pass history.
7. The junction rule (§4) + the main-tree-clean check after every edit.
8. Read-only agents write NOTHING into the repo — instruments live in memory or the
   scratchpad.
9. Real oracle text from the bundled index for every fixture; every CR cite verified against
   `knowledge/mtg-judge/data/cr/cr_current.json`.
10. Contract/seam changes post to `memory/COMMS.md` BEFORE they ship (the Omnath session
    builds against them). Honest labels only — undetermined outcomes are null-and-dropped,
    never fabricated; docs describe only what exists.
11. Park with written analysis, never half-fix. Two identical failures = stop and
    root-cause (`/investigate`), never a third identical retry.
12. UI waves prove the engine fence: tier fp 0-diff + trajectory hash byte-identical, even
    when "it's only CSS".
13. **THE HOLLOW-GATE LAW** (2026-07-18 — seven documented instances, three authors; see the
    block below). A gate that passes while measuring nothing is worse than no gate.

**§3b The hollow-gate law (#13 expanded).** The most dangerous failure mode this repo has
produced is a green check that never touched the thing it claims to check: the fabricated-winner
era (70.7% of ai-win labels fiction while standings printed clean) · the RulesChunk verify
(`pass = n > 0` → ✓ at 1 of 3,138 rules) · self-play (40k green games/night for a week while a
human couldn't finish turn 1 — the Expert driver auto-answers every human prompt, so the human
path is never in the sample) · a string-match wiring guard that passed a structurally-perfect
BLANK panel · a sweep reporting 8/8 complete while 5 of 7 target prompts never fired · a snapshot
baseline that froze `undefined` as "correct" for nine unexported helpers. Three rules, all cheap:

- **SEEN-TO-FAIL** — no new/changed gate is done until you broke the guarded thing on purpose,
  watched the gate go red, and restored it. Record it in the commit message as a
  `Mutation-checked:` line naming what was broken and which test caught it. Absent line = the
  work isn't done (same class as lint 0). *A gate you have never seen fail is a hypothesis.*
- **COVERAGE WITNESS** — any harness that samples (sweeps, sims, ingest verifies) must print
  WHAT it exercised (kinds fired, rows counted against source) and assert a floor on it. The
  pass rate is never the load-bearing number; the witness is.
- **ABSENCE ≠ VALUE** — in a harness, a missing subject THROWS, never defaults: no `?.` on the
  thing under measurement, no `|| 0`, no `pass = n > 0`. Absence is the most important thing a
  harness can detect; don't let syntax swallow it.

The dual failure — a gate that fails HEALTHY runs (the 300s CI test wall, fixed 31201b8d) — is
the same disease mirrored: both teach people to ignore the color. A gate's output must mean
exactly one thing. Read-time corollary of #6: before trusting any green, ask *"show me the
witness — what did this touch?"*

**Where live numbers come from** (trust no stale number — derive):

| Number | Source of truth |
|---|---|
| Suite count | `cd app && npx vitest run` (no MTG_APP_ROOT); current anchor lives in WAKE-REPORT (7,681 @ v0.88.0) |
| Corpus native % | `MTG_APP_ROOT=<main>/app node scripts/measure-coverage.mjs` (recipe + caveats in the grind order); last 8,645 @ v0.85.0 |
| Shipped version / state | CHANGELOG.md + `git tag` — never a doc's prose |
| Behavior anchors | WAKE-REPORT's current trajectory hash (**`ab524e20…`** as of 2026-07-04; the v0.88.0 `a2a03ba8` no longer reproduces — benign DECK-DATA drift, engine byte-identical v0.88→master per `git diff`) + tier-fp baseline |
| Deck lists / census | AppData `profiles/<prof>/decks.local.json` (Colton `prof_a981996c…`, Joe `prof_b1412fcc…`) — never the memory `deck_*.md` files |
| Parked work | WAKE-REPORT ⚠️ section (current pass) + the ledger pointers in §6 |

## §4 Orchestration safety card (Windows + worktrees — each line cost real time)

- **≤2 builder lanes live at once**, each with an exclusive FILE-OWNERSHIP list (disjoint
  from every other lane AND the orchestrator). 4+ concurrent agent batches hit server-side
  rate limits and get workflows killed mid-run.
- **The junction hazard**: agent worktrees junction `node_modules` from the main tree.
  Before `git worktree remove`, delete the junction itself (`cmd //c rmdir <wt>\app\node_modules`)
  — a recursive delete FOLLOWS the junction and wipes the main tree's node_modules
  (recovery: `npm ci` from main `app/`).
- **`git rev-parse --show-toplevel` before any branch op.** An empty/swept worktree
  silently falls through to the MAIN repo — a checkout there moves the main tree's branch
  pointer. Never trust a worktree directory you didn't just list.
- **The Edit/Write misroute env bug (active)**: an absolute-path edit can silently land in
  the MAIN tree instead of your worktree. After any edit: verify it landed in YOUR tree AND
  `git -C <main> status` is clean.
- **Backslash/backtick content never goes through Bash heredocs** (the shell eats one
  escape level; anchors silently miss). Write patch scripts with the Write tool, run
  `node script.cjs`. Verify anchors with `text.split(from).length === 2` before replacing.
- **Verify-then-complete after kills**: when a session/agent dies mid-lane, resume =
  verify the claimed state against recorded SHAs + finding-ids, complete what's missing
  (including tests), THEN integrate. Never trust "the agent said it finished".
- Full patterns + incident log: OVERHAUL-PLAYBOOK §4, PLAY-HARNESS-OVERHAUL-PLAYBOOK §4/§6.

## §5 Doc registry (the master-guide section — every method/handoff doc, tagged)

**CANONICAL** (current law; update in the same PR that changes what they describe):

| Doc | What it is |
|---|---|
| this file | index + distilled operating knowledge |
| [OVERHAUL-PLAYBOOK.md](OVERHAUL-PLAYBOOK.md) | THE generic deep-change method: wave anatomy, gate recipes, proof-level table, never-skip |
| [PLAY-HARNESS-OVERHAUL-PLAYBOOK.md](PLAY-HARNESS-OVERHAUL-PLAYBOOK.md) | harness/AI layer: anchor lineage, A/B probe, pod census, pilot loop, incident log |
| [OVERHAUL-SESSION-NARRATIVE.md](OVERHAUL-SESSION-NARRATIVE.md) | the judgment/mimicry layer — copy the *shape* of the work; prompt shapes that worked |
| [PROJECT-SCAFFOLD.md](PROJECT-SCAFFOLD.md) / [ENGINE-SCAFFOLD.md](ENGINE-SCAFFOLD.md) | the two maps (whole system / rules engine + add-a-mechanic recipe) |
| [PLAY-API-CONTRACT.md](PLAY-API-CONTRACT.md) | the locked, versioned, canaried engine↔Omnath seam (v1.2.0) |
| [UPGRADE-BACKLOG.md](UPGRADE-BACKLOG.md) | LIVING ranked feature/upgrade queue (2026-07-04 creative review) |
| [ui-overhaul-log.md](ui-overhaul-log.md) §0 | the UI method (LEYLINE law); §1+ = frozen wave records |
| [seam-migration-map.md](seam-migration-map.md) | live plan for the bounded parser→atoms migration (re-grep line numbers per batch) |
| ../gotchas.md · ../agents.md · ../HOW-TO-ADD-AN-AREA.md · ../../RELEASE.md · CLAUDE.md | hazards · in-app personas · kiosk extension · release flow · the law |
| memory-side: OMNATH-SCAFFOLD.md · OMNATH-OVERHAUL-PLAYBOOK.md · orders/clyde-grind-relaunch.md | Omnath system map · memory-side method · the standing grind order |

**ROTATING**: [WAKE-REPORT.md](WAKE-REPORT.md) — overwritten per pass. **The rotation
rule (now written down):** before overwriting, carry still-open parked items forward into
the new report OR move them to the pass log's §parked; prior versions live in git history.
MORNING-BRIEF.md is a one-shot artifact of the v0.85.0 overnight loop (bannered historical).

**RECORDS** (frozen evidence — never edit, always link): overhaul-evidence.md ·
play-harness-overhaul-log.md · ui-overhaul-log.md wave entries · session logs in
omnath-tools/session-logs/.

**HISTORICAL** (bannered; read for context, never as instruction): FABLE5-OVERHAUL-PROMPT ·
FABLE5-CONSOLIDATION-PROMPT · SESSION-HANDOFF · STATUS.md · task-board · worker-prompts ·
coverage-run · agents/{clyde,omnath,cindy,hans,walt,iris}.md · ../HANDOFF.md ·
../project-status.md · ../master-plan.md · ../HANDOFF-NEW-ACCOUNT.md · the ../coverage-*
family · ../../TODOS.md · ../../ROADMAP.md · memory/orders/*fable5* + orders/archive/.

## §6 Parked ledger (everything waiting, with owners)

- **Current pass parks**: WAKE-REPORT ⚠️ section — always the freshest list.
- **Engine/harness parks with analysis**: play-harness-overhaul-log §parked (decision.seat
  MINOR · SD-8 façade split · HB-9/HB-11 · ENG-FLAG-2 · fail-closed Spellbook guard ·
  detectArchetype memo) + WAKE-REPORT v0.86.0 section in git history.
- **Colton-judgment calls** (ask, don't guess): cross-profile rating persistence (current
  no-write is BY DESIGN — confirm before building) · mobile IA pass (does he ever run
  <660px?) · land-partial tier call · Q8 records/insights direction is now DESIGNED in
  UPGRADE-BACKLOG wave P — needs his taste check before the L-effort build.
- **Strategy questions**: memory/project_academy_open_strategy_questions.md (Q8 the big
  open one).
- **Promoted parks**: now live as items in [UPGRADE-BACKLOG.md](UPGRADE-BACKLOG.md) wave Q/E
  (Escape-to-close, powerRank serialization, alias sweep, offered-X-subset, AI alt-cost
  completion, U-F4 color tags, earthbend-return).

## §7 What's next (as of 2026-07-04)

1. **The Vault overhaul** — the flagship order, ready to fire:
   `memory/orders/vault-overhaul.md` (kiosk IA + collector features; UI-battery gated).
2. **UPGRADE-BACKLOG.md** — waves Q (quick wins) → V (vault) → P (proving grounds) → K
   (knowledge/data) → E (engine promotions), each item self-contained.
3. **The grind** — resumes per `memory/orders/clyde-grind-relaunch.md` (v2, refreshed
   2026-07-04) whenever no feature wave holds the lock.

*Written by the final Fable 5 session. The engine will keep moving — the shapes in these
docs are the durable part. When a fact here and the code disagree, the code wins; fix the
doc in the same PR.*

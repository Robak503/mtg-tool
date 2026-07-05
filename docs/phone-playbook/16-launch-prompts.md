# 16 — LAUNCH PROMPTS

> **OMNATH IN POCKET · execution playbook · doc 16 of 17**
> The exact boot prompt to hand Opus/Cindy per phase. Copy the block,
> paste it into a fresh session, go. Each prompt assumes the repo +
> tools are in front of the executor and the playbook lives at
> `docs/phone-playbook/`.

---

## How these prompts work

- Each names: what to read (bounded — not the whole set), what to
  verify before building, the lane, the exit gate, and the standing
  discipline. They give the map and the gates — the executor writes
  real code against the real tree and adapts freely INSIDE the gates.
- **Standing discipline block (implied in every prompt below):**
  conventional commits · PR per slice · `npm run lint` before push ·
  suite green before merge · never-skip law (red gate stops the line) ·
  two failed fixes → `/investigate`, not a third try · CREED absolute ·
  update `13-risk-and-verify.md` with every V# outcome · log new
  decisions in `14-decision-log.md` Part B · questions for Colton →
  `QUESTIONS-FOR-COLTON.md`, don't stall on them.
- If reality contradicts the playbook: **reality wins, and the doc gets
  amended in the same PR** (the set must never drift into fiction).

---

## M0 — field-core extraction

```
Boot /cindy. OMNATH IN POCKET — M0 opens.

Read, in order: docs/phone-playbook/00-INDEX.md · 01-architecture.md
(§4 adapter, §5 services) · 12-phases.md §M0 · 14-decision-log.md
(skim: D1, D-P9, D-P10).

Preconditions to confirm before any code: master is clean and current;
no open PRs touch lib/server storage or API routes (memory:
feedback_check_open_prs_before_building); the test baseline number in
docs/orchestration/WAKE-REPORT.md is your green anchor.

The lane, in task order (12-phases.md §M0 has outcomes + acceptance per
task): M0.1 route-census refresh against the CURRENT tree (amend
01-architecture.md §5.2 in-place — it is a living checklist) → M0.2/M0.3
StorageAdapter + Node/Memory impls + contract suite → M0.4 refactor all
raw-fs call-sites through it (small mechanical PRs; add the lint rule) →
M0.5 extract keep-list services (thin-wrapper routes, byte-identical) →
M0.6 browser-context proof harness → M0.7 tiered data-bundle builder
(check V14 plane-card inclusion HERE) → M0.8 capability-profile flag.

EXIT GATE: full suite green (no count regression) + desktop .exe smoke
byte-identical + browser-proof suite green with Node builtins fenced +
CI emits the tiers. A red gate stops the line.

This phase is box-independent — do not touch Android, sync, or agents.
Do not start M1 with this gate red.
```

---

## M1 — Android shell on the Pixel

```
Boot /cindy. OMNATH IN POCKET — M1 opens. M0's gate must be green
(verify it: run the suite + the browser-proof harness before anything).

Read: 12-phases.md §M1 · 01-architecture.md (§7 offline, §8 first-run)
· 10-ui-ia.md in full · the feature docs for what lands this phase:
03 (decks), 05 (pod), 06 (life tracker — NET-NEW, read fully), 07
(vault §1.1–1.3), 08 (rules) · 13-risk-and-verify.md rows V1, V2, V10,
V13, V14, V15, V16, V17, V19.

FIRST ACTION — verify-before-build: V1 spike day. Read the CURRENT
Tauri 2 Android docs end-to-end (do not trust training memory —
reference_knowledge_staleness_boundary), build a hello-APK, sideload it
to the Pixel 10 (V10). Only when that boots do you commit to the M1
task order. If Tauri-Android is unshippable, STOP and escalate per V1's
fallback — do not improvise a shell swap alone.

Then the lane per 12-phases.md §M1: static export (V17) → TauriFsAdapter
(V16 — contract suite ON DEVICE) → first-run downloads (D-P10) →
six-tab LEYLINE shell (V19 blur check) → feature tabs: Decks, Rules,
Pod, Life v1, Vault-standalone → art serving (V13) → update path (V2).
Life tracker is net-new — build it from 06's spec, not from any
desktop analogue (none exists).

EXIT GATE (live, on the Pixel, airplane mode from cold boot): deck
view+edit · rules search with citations that grep-match cr_current.json
· pod balance matching desktop values · life-track a game + kill-resume
· vault grail lookup. Log every V# outcome in 13.

Box-independent phase: no hub, no sync, no LLM tiers. The chip reads
`local` and that is correct.
```

---

## M2 — sync to the Mac hub

```
Boot /cindy. OMNATH IN POCKET — M2 opens. Precondition: the Mac Studio
exists and is on the tailnet; M1's gate is green on the current build.

Read: 02-data-and-sync.md IN FULL (this phase's spec) ·
01-architecture.md §3/§6 · 12-phases.md §M2 · 13 rows V7, V11, V16, V20
· 14-decision-log.md D3–D6, D-P3–D-P6.

FIRST ACTION: M2.1 hub setup — and write the runbook AS you do it
(every step reproducible; it lands in the repo as
docs/phone-playbook/runbooks/mac-hub-setup.md). Confirm from OFF-mesh
that nothing answers publicly (the closed-system check), then V11
battery/reach reality on the phone.

Then the lane per 12-phases.md §M2: canonical store + journal + backup
→ recordId/rev migration (BACK UP desktop data first, run on a copy,
then live) → shared sync client, desktop mount seeds canonical → phone
mount + the chip goes live (02 §9 states all inducible) → conflict
detection + ConflictSheet + the deck merge helper → tombstones +
compaction → Weaviate ingestion + the weaviate-reindex command (V7,
V20) → poison-op quarantine.

Build the sync simulation suite (15 §2) BEFORE wiring real devices —
forks, resume-mid-cycle, idempotent replay, tombstone resurrection all
proven in fast tests first.

EXIT GATE (live): phone deck edit in airplane mode → home → SILENT
auto-sync → on desktop. Reverse likewise. Deliberate fork → exactly one
prompt → merge clean. Delete survives a round-trip without
resurrection. Chip truthful throughout.

The prompts-only-on-genuine-divergence rule (D4) is the UX soul of this
phase — if dogfood shows a prompt on a non-fork, that is a gate-failing
bug, not a polish item.
```

---

## M3 — agent tiers

```
Boot /cindy. OMNATH IN POCKET — M3 opens. Precondition: M2 green; the
hub syncs in daily use.

Read: 11-agent-tiers.md IN FULL · 04-feat-agents.md IN FULL ·
12-phases.md §M3 · 13 rows V4, V5, V6, V12, V18 · 02 §7.2 (retrieval
endpoint + schema).

FIRST ACTIONS (spikes, in parallel where sane): V12 — stand up the
serving stack on the real Mac, bench 70B-class quants for
conversational streaming; V6 — webview streaming proof on the Pixel
from both the hub and Anthropic API (chunked-poll fallback if needed);
V4/V5 — on-device runtime bake-off, with T0-only as a fully acceptable
outcome (do NOT force a bad small model to exist).

Then the lane per 12-phases.md §M3: tier router + health/model-role
integration (no silent fallback; never auto-T3) → Agents tab full
(deck-lock context, badges, degrade cards, history continuity) → Jace
offline mode (retrieval-first; template-constrain any T2) → RAG plans +
THE CITATION AUDIT HOOK (11 §4.3 — build it, then run the
planted-fake-citation drill) → cost gate + synced ledger → Omnath on
the personal flavor only (MemoryDoc RAG; persona text loaded from
memory/persona_omnath.md, not paraphrased).

EXIT GATE (live, same day, on the Pixel): a full Karn deck-build
against the Mac (buckets, baselines, grounded suggestions) AND an
airplane-mode Jace rules answer with citations grep-matching
cr_current.json. Plus: the money drill — forcing T3 once logs exactly
one metered call; nothing else costs a cent.

Arbiter is Mac-only, never API — that hardcode is desktop-parity law
(D7).
```

---

## M4 — vault alive + table polish

```
Boot /cindy. OMNATH IN POCKET — M4 opens. Precondition: M3 green.

Read: 07-feat-vault.md IN FULL · 06-feat-life-tracker.md §1.3–1.4/§7 ·
12-phases.md §M4 · 13 rows V3, V8, V9, V14, V15 · 09 (for the M4.7
spec-refresh only — no scanner build).

The lane per 12-phases.md §M4: hub job runner + the three jobs (port
the omnath-tools patterns — meta-weather.cjs, daily-codex.cjs, the
grail tracker; satire TAGGED at ingestion, H14) → notification delivery
(V9 — prototype candidates on-device; the in-app badge inbox ships
regardless) → the brief surface → life-tracker polish (full Planechase
+ planar die + table mode; V14 planes render, V15 wake-lock) → the
offline hard-mode audit (every screen, airplane mode, honest states) →
battery/perf pass → M4.7 scanner go/no-go probe (spike only; update 09
and V8 with findings).

EXIT GATE (live): a seeded grail match fires a real notification (or
the badge path if V9 landed there — say which in the log) · the daily
brief lands and reads offline later · Planechase works through a real
game at a real table. Plus the M4 rehearsal subset of the con-day
script (15 §4).

Stale-honesty is the design language of this phase: every price, match,
and brief shows its date; the Mac being asleep must never produce a
spinner (07 §6.5).
```

---

## M5 — split, polish, prove

```
Boot /cindy. OMNATH IN POCKET — M5 opens. Precondition: M4 green;
dogfood list (15 §3) triaged.

Read: 12-phases.md §M5 · 14-decision-log.md D12 + Part C (C1) ·
04 §1.6/§6.6 · 15-test-strategy.md §4 (the con-day script — this
phase's whole point).

The lane: build flavors (profile × flavor matrix, D-P9/D12) — personal
vs giftable as BUILD-TIME exclusion, not runtime flags → giftable
"grow your own companion" onboarding (fresh persona, empty memory) →
the H15 purity sweep (string-scan the giftable APK + full UI walk: zero
Omnath, zero owner data — this sweep repeats on every giftable release,
automate what's automatable) → dogfood burn-down (top-10 field
annoyances closed) → the distribution decision (C1: sideload vs Play
internal track — decide with Colton, log it in 14) → M5.4 THE CON-DAY
DRY RUN, run exactly per 15 §4's checklist, logged live.

EXIT GATE: the con-day dry run passes end-to-end — full offline day,
all field drills, battery margin, evening reconnect with zero lost
edits and zero false conflicts. Any H1-class data event fails the gate
regardless of everything else.

Pass = OMNATH IN POCKET ships. Update CHANGELOG.md, cut the release
per RELEASE.md discipline, write the wake-report, and tell Colton his
pocket is ready.
```

---

## Amendment prompt (any time the playbook meets reality)

```
Boot /cindy (or continue in-lane). A playbook↔reality divergence was
found: <describe: doc + section vs what the tree/device actually does>.

Rule: reality wins. In ONE PR: fix/adapt the build to reality · amend
the affected playbook doc(s) in-place · if a locked decision was
touched, append (never rewrite) to 14-decision-log.md with the date and
reason · if new uncertainty appeared, add a V#/H# row to
13-risk-and-verify.md · if it needs Colton, add to
QUESTIONS-FOR-COLTON.md and continue on the unaffected lane.
```

---

## Mac-hub setup day (M2.1 companion — the hardware boot prompt)

```
Boot /cindy. The Mac Studio just landed. Today is hub-setup day —
M2.1 only, runbook'd as you go.

Read: 01-architecture.md §3/§6 · 12-phases.md §M2.1 · 13 rows V11, V20
· project_server_box_decision (memory) for what was bought and why.

Do, capturing EVERY step into
docs/phone-playbook/runbooks/mac-hub-setup.md: OS baseline (always-on
power settings, auto-restart, login-less services) → Tailscale join +
key-expiry policy for a closed mesh (H11) → Docker + Weaviate arm64 up,
pinned version (V20) → hub service skeleton + /health + bearer token →
the off-mesh port-scan proving zero public surface → phone + desktop
reach /health over the tailnet → V11 battery observation begins.

EXIT: /health from both clients, publicly invisible, runbook committed
— the box is a hub. M2.2+ proceeds on its own boot prompt.
```

---

*Cross-refs: task detail `12-phases.md` · gate scripts
`15-test-strategy.md` · V/H registers `13-risk-and-verify.md`.*

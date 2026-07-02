# MASTER PROMPT — Clyde / Fable 5 ENGINE OVERHAUL pass (one-time, ultracode)

> **Session setup:** model **Fable 5** (`/model claude-fable-5`) · **ultracode ON** · launched via the
> **`/goal`** command, usually **in plan mode** — in plan mode, GROUND first (read the anchors below), then
> present the wave plan for approval via ExitPlanMode **before** executing. Outside plan mode, ground and go.
>
> This is the second and final planned Fable 5 session. The consolidation pass (v0.84.0) scanned and
> repaired; THIS pass **overhauls**. Its outputs must outlive Fable 5.

You are **CLYDE** — sole build-and-integrate owner of MTG Tool. One chat, one owner; ephemeral
`Agent()`/`Workflow` sub-agents are how you fan out (this command explicitly authorizes the Workflow tool —
ultracode-scale orchestration is the point). You own `master`.

## THE GOAL (Colton, 2026-07-01)

Overhaul the **core game engine + rules engine** to be as good as they can be — **quality, runtime
performance, and play quality/usability** — NOT coverage growth (adding cards is explicitly out of scope;
the number may only move as documented false-positive removals). Then a whole-system quality pass over the
rest of the app. Verify the v0.84.0 consolidation changes hold. Build the engine↔Omnath integration from
the Clyde side. Document the METHOD so future non-Fable agents can repeat it. Decisions locked with Colton:

- **Risk bar: DEEP OVERHAUL.** Structural rewrites allowed — file splits, API reshaping, perf
  rearchitecture — when every wave proves behavior-safety through the full gate + all three fingerprints
  (tier / program / runtime). Intentional classification movement ONLY as documented FP removals.
- **Scope: WHOLE SYSTEM.** The engine gets the deep overhaul; the rest of the app (UI, server, shell,
  pipeline) gets a second full quality pass after the engine work.
- **Speed focus: runtime performance + play quality.** Games/sec for self-play batches (the Omnath
  flywheel), Academy step latency, hot paths (layers, manaSources, legalChoices, trigger detection) — AND
  how well the engine plays: smarter legal-action offers, better AI decisions, fewer dead-end states.
  Dev velocity is a BOUNDED third priority (Colton, 2026-07-01): continue the parser.js →
  CLAUSE_PARSERS/atoms seam migration (docs/orchestration/seam-migration-map.md) as an explicit P2
  workstream — it is the single highest-leverage post-Fable SAFETY investment (Sonnet-era sessions edit
  small seam files, not the 200KB monolith), and Fable 5 is the right model to do it. Constraints:
  program-fingerprint 0-diff per batch; priority BELOW perf + play quality; the FIRST thing cut if the
  pass runs long; never at the expense of the Omnath seams or the playbook.
- **Omnath integration (engine side — Omnath owns the brain/pilots side): ALL of:**
  1. **Make the play-API real** — `gameApi.js` today cannot settle pendingChoice/pendingArbiter (parked in
     WAKE-REPORT). Make it a stable, versioned seam a pilot can drive end-to-end; lock the contract and
     post it to `memory/COMMS.md`.
  2. **Harden the consultation seams** — the `engine.mjs` gate/rules/combo seams Omnath consults:
     stability guarantees + canaries + a documented adapter contract so engine churn can't silently break
     Omnath's tools.
  3. **Engine→brain data hooks** — engine-side export shaped for Omnath's memory: tagged, trust-gated
     trajectory/case data so self-play feeds the case store without Omnath scraping internals.
  4. **…plus any other Clyde-side integration improvements you find.**

## GROUND FIRST (live off origin/master — trust no stale number)
1. **docs/orchestration/ENGINE-SCAFFOLD.md** + **PROJECT-SCAFFOLD.md** — the maps (write updates back here).
2. docs/orchestration/WAKE-REPORT.md — parked judgment calls (several are THIS pass's work items).
3. CLAUDE.md + docs/gotchas.md · `git log origin/master` + CHANGELOG.md (v0.84.0 = the consolidation pass).
4. memory/MEMORY.md + memory/CONTINUITY.md + memory/COMMS.md top (Omnath channel — check every task).
5. The six scan reports' unfixed P2/P3 items are candidate work — re-derive from WAKE-REPORT, don't trust stale line numbers.

## DISCIPLINE (non-negotiable — outranks speed)
- **THE CREED:** never break a working feature; model/fix the WHOLE thing or PARK it (to WAKE-REPORT);
  false-positive FORBIDDEN, false-negative safe; never fabricate (no invented CR cites, no claimed-but-
  unrun verification). `?? N`, never `|| N`. classifyCard stays deterministic.
- **The per-wave gate** (from `app/`, NO `MTG_APP_ROOT` for vitest):
  `npx vitest run` ("Tests N passed", N≥6371) + `npm run lint` (--max-warnings 0)
  + **tier flip-diff** vs the main-tree baseline (`scripts/tier-fingerprint.mjs`; expect LOST=0 unless each
  LOST is a named, justified FP removal; GAINED must be 0 — this pass adds no coverage)
  + **`scripts/program-fingerprint.mjs`** for ANY parser/atoms change (same-tier op rebinds are invisible
    to the tier diff) + **`scripts/runtime-fingerprint.mjs`** for ANY mana-model change.
- **Perf work is evidence-first:** capture baselines BEFORE optimizing (self-play batch games/sec via
  `scripts/self-play.mjs`, Academy step latency, corpus classify time, suite duration). Every perf claim
  ships with before/after numbers from the same machine. No blind optimization.
- **Behavior-preserving refactors** must show: gate green + all applicable fingerprints byte-identical
  (0-diff). That is what "deep overhaul allowed" is conditioned on.
- **ENV BUG (active):** Edit/Write can silently misroute an absolute path to the MAIN tree. Prefer Bash /
  node-fs script files for edits; after ANY edit verify it landed in your tree AND `git -C <main> status`
  is clean.
- **Worktree/junction hazard:** before `git worktree remove` of an agent worktree, delete its
  `node_modules` junction first (`cmd //c rmdir node_modules`) — removal follows junctions and WIPES the
  main tree's node_modules (recover: `npm ci` from main `app/`). See
  memory/feedback_worktree_junction_deletion_hazard.md.
- **Model split for workers:** judgment-heavy scan/design/verify workers may run `model: "fable"` (this
  pass only); mechanical bulk edits use `model: "sonnet"`. Always pass `model` explicitly.
- Work on a branch; integrate ff-only; never force-push; releases via `git tag vX.Y.Z && git push origin vX.Y.Z`.
- **Stay resumable:** state lives in git + files (WAKE-REPORT + this doc), never in chat memory. Park
  Colton-judgment calls; never idle, never fake.

## THE PASS — phases (plan these, then execute)

**P0 — VERIFY v0.84.0.** Adversarially re-verify the consolidation pass before building on it: fan out
skeptic agents over the 34 fixes (quote-the-code refutation + re-run the relevant tests/probes); confirm
the v0.84.0 CI release shipped WITH Spellbook combos in the bundle (the strict guard + bounded sync — read
the actual run log); spot-check the packaged-.exe fix class (per-call path resolution, middleware origin
guard) as far as dev-mode allows. Fix or park anything that doesn't survive.

**P1 — BASELINE + PROFILE.** Capture the evidence base: perf baselines (above), play-quality baselines
(self-play breakage report over a standard batch; dead-end/livelock census; legal-action offer quality on
known boards), and a fresh determinism probe. Commit the numbers to the scratch/WAKE-REPORT so every later
wave diffs against them.

**P2 — ENGINE DEEP OVERHAUL (the core).** Waves, each gate+fingerprint-verified, ordered by measured
leverage — candidates (validate against P1 evidence, don't assume):
- **Perf:** layers derivation/memoization on hot reads; legalChoices enumeration cost; manaSources/
  planPayment; trigger detection caching; state-copy costs in the immutable update paths; suite/fingerprint
  tooling speed as a side effect.
- **Seam continuation (bounded, 3rd priority):** migrate more parser.js matcher families into
  effects/atoms/* per seam-migration-map.md — program-fingerprint 0-diff per batch, cut first if long.
- **Quality/structure:** the duplicated mana-commit implementations; runProgram/resolvers seam
  consistency; the parser.js chokepoint IF it serves perf/quality; kill the remaining known seams from
  ENGINE-SCAFFOLD §6 that are fixable without coverage growth (GY zone accounting for resolved spells,
  commander damage keyed per player+card, leave-event drain timing, modal combat-referent flatten,
  collapsed() gates, land-partial tier IF Colton's parked call is taken — ask via WAKE-REPORT, don't guess).
- **Play quality:** opponentAI decision quality (held-candidate logic, land sequencing, combat plans),
  dead-end elimination, pendingChoice UX correctness end-to-end, narrator/log legibility.

**P3 — OMNATH INTEGRATION (engine side).** The four items from THE GOAL. Lock contracts in writing
(versioned doc + COMMS post). Coordinate — don't build Omnath's side (pilots/brain are Omnath's; you build
the engine-side seams + data).

**P4 — WHOLE-SYSTEM QUALITY PASS.** Second sweep over app/UI/server/shell/pipeline at post-overhaul depth:
fix real finds (bugs, dead code, inconsistency, perf), park judgment calls. Include the UI-side surfaces of
engine work (Academy/SimCenter reflect new play quality).

**P5 — THE METHOD DELIVERABLE (why Fable 5 is here).** Write **docs/orchestration/OVERHAUL-PLAYBOOK.md**:
the full breakdown of WHAT was done and HOW — wave anatomy (evidence → design → build → fingerprint-proof →
integrate), the verification recipes as copy-paste commands, how perf work was measured, how refactors were
proven behavior-safe, what a non-Fable session must never skip. Update ENGINE-SCAFFOLD.md +
PROJECT-SCAFFOLD.md to post-overhaul reality (they must never go stale in the same release that changes the
architecture). **Then write the companion prompt: `memory/orders/omnath-fable5-overhaul.md`** — a Fable 5
ultracode master prompt doing THIS SAME KIND of pass from the **Omnath side and point of view** (the brain:
memory architecture, recall quality, pilots, engine-consultation seams from the consumer end, self-play
data quality, omnath-tools/) — written for Colton to paste into an Omnath Fable 5 session; post a pointer
in COMMS.

**P6 — RELEASE + HANDOFF.** Bump versions, dated CHANGELOG section, tag → CI. Refresh WAKE-REPORT (point
at the PLAYBOOK; carry forward parked items), MORNING-BRIEF, memory/CONTINUITY.md + MEMORY.md. Leave the
tree clean, worktrees swept (junction-safe), grind-resume instructions intact.

**Begin: ground, plan (present for approval in plan mode), then P0.**

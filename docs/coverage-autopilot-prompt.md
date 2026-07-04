> ⚠️ **HISTORICAL — coverage-chat era (bannered 2026-07-04).** Pre-dates the one-owner model and the playbooks; standing directives here (e.g. release holds) are VOID. Live: `memory/orders/clyde-grind-relaunch.md` + docs/orchestration/MASTER-GUIDE.md.

# Coverage Autopilot — the self-paced loop instruction

The canonical instruction the Academy coverage autopilot loops on. One **cycle** = advance the
work-in-flight (or pick + ship a new slice) through the full gate discipline, update the
scoreboard, then schedule the next cycle. It encodes the plan in `docs/coverage-roadmap-to-100.md`
and the per-slice discipline in `docs/coverage-handoff.md`.

**The metric is corpus-primary (owner decision, 2026-06-17):** the north star is **corpus-wide
native %** (`cd app && npm run coverage`) — the goal is to play almost *all* of Magic natively, not
just the sample decks. The honest ceiling is **~90% corpus native**; the Arbiter is the permanent,
correct home for the irreducible tail. The 16 decks are the **realism gate** ("does a real game
play?"), not the target.

---

## The cardinal rule (hold it above everything)

A **false-negative** — the engine routes a card to the Arbiter when it *could* have played it
natively — is **SAFE**. It costs a little coverage; nobody is harmed.

A **false-positive** — the engine claims a card is native, then mis-resolves it (wrong target,
dropped clause, partial effect, illegal play) — is **FORBIDDEN**. It silently corrupts a game.

When unsure whether a slice is safe: **route to the Arbiter and move on.** Coverage is a grind you
win over many slices; correctness is a thing you can lose in a single bad merge. Every gate below is
a HARD STOP that BLOCKS the merge.

---

## Model + resource split (ULTRACODE)

- **Opus (primary, max effort) owns and never delegates:** every edit to parser / atom resolver /
  `coverage.js` / `gameEngine` / tests; the parser-gate + CR-layer semantics; and the **go/no-go
  judgment** on every sweep and review. A wrong judgment ships a false-positive.
- **Fable-tier agents** (`Agent(..., model: "fable")`, parallel) own throughput and produce **data
  you verify, never unreviewed edits:** corpus sweeps over ~33k cards, the per-slice gap re-scan,
  mechanism inventories, doc summaries.
- **`/code-review ultra`** owns the independent adversarial pass on each branch — the proven catcher
  of pre-existing partials (#191, #192). If ultra is unavailable, fall back to an independent
  in-process adversarial agent, **but then the merge is human-gated, never auto-landed.**

---

## The per-cycle loop (every cycle — HARD GATES, not steps to rush)

Always run npm / test / lint / coverage from **`app/`** (`cd app` first — never repo root; it grabs
the wrong vitest + config and reports spurious failures).

**0. Orient.** Read `docs/coverage-autopilot-status.md` for the in-flight slice and the live
trajectory. **If a slice is mid-build, finish it before picking a new one.** `cd app && npm run
coverage` for the live corpus native % + the corpus gap buckets. Confirm the tree is clean / on the
right branch.

**1. Pick (data-driven, corpus-weighted).** If nothing is in flight: spawn a Fable agent to re-run
the REAL `classifyCard` / `mechanismBucket` over the corpus (via `publicCard`) and re-rank the
next-atom backlog by **corpus-card-count × cleanliness**, respecting the roadmap's α→β→γ→δ phase
order + dependencies (α before any targeted-on-trigger atom; foundations before the atoms they
unblock). **The highest-value slice shifts as the modeled set grows — never blindly take
next-in-list.** State the pick + one-line why.

**2. Branch + build in lockstep (Opus owns every edit).** `git checkout master && git pull && git
checkout -b feat/<slice>`. Build the **anchored allowlist** parser matcher + the atom resolver + the
`coverage.js` classifier update **together** — the metric must call the runtime parser, never a
parallel heuristic. **All-or-nothing confidence:** any unmodeled clause → the whole program drops to
LOW → Arbiter; a confident partial IS a false-positive, never emit one. If a chosen-target atom
could first-legal a friendly on the trigger flush and the enemy/own chooser doesn't cover its op,
**gate it out of the flush and mirror the gate in `coverage.js`.** Add unit tests: the new shape +
`MUST_STAY_HIGH` / `MUST_DROP` parser pins + regressions. Any persisted-shape change → schema bump +
migration + fixture **in the same PR**.

**3. Corpus sweep (HARD GATE — Fable verifier).** Run the REAL parser/classifier over all ~33k cards
via `publicCard`. Require **0 dangerous false-positives** AND **0 HIGH→LOW regressions vs HEAD**.
Hand-verify the newly-native set is legitimately playable. **Know the blind spot: the sweep is
parse-level — it CANNOT catch runtime mis-targeting.** If the slice adds a chosen-target atom, also
assert no newly-native form is reachable on a TRIGGER without the enemy/own chooser or a flush gate.
Delete any temp `*.mjs` before finishing (a stray script in `app/` breaks `eslint .`); commit nothing
from the sweep.

**4. Live real-enrichment QA (HARD GATE — catches what the sweep can't).** Drive the REAL `lookupCard
→ publicCard → deckToCardArray → engine` path — NOT hand-built fixtures (they mask slim-index gaps,
the #1 silent-gap risk; they've produced 0/0-creature + id-collision false-passes before). **For any
targeted atom, exercise its TRIGGER form (ETB/dies), not only the cast form** — the cast path is
player/AI-picked and safe; the trigger flush is where a first-legal friendly-target bug hides. A
player-facing CHOICE needs real interactive `pendingChoice` UI verified live with the preview tools,
not an engine auto-pick (owner directive).

**5. Test + lint from `app/` (HARD GATE).** `npx vitest run` (full suite green) AND `npm run lint`
(`--max-warnings 0`).

**6. Adversarial review (HARD GATE).** `/code-review ultra` on the branch. Verify each finding
against code + corpus + suite; fix every confirmed one; note + defer the rest with a reason. **Never
merge on an unverified or session-limit-failed review** — re-run it after reset. A fallback
(in-process) review makes the merge human-gated.

**7. Ship.** Conventional commit; push; `gh pr create` with the corpus-sweep numbers + live-QA
result + review outcome in the body. Verify `gh pr checks` says **pass** (read the actual status —
the exit code has lied). On green AND a verified `/code-review ultra` AND no guardrail trip, you may
`/land-and-deploy`. Otherwise leave the PR open and report. **One slice = one PR.**

**8. Record + scoreboard.** `cd app && npm run coverage` for the new corpus %. Append the trajectory
row to `docs/coverage-autopilot-status.md` (slice · corpus native % · Δ · % of the way to the ~90%
goal · deck % · PR), update the `project_coverage_roadmap` memory with what shipped + any new lesson,
and **re-render the progress scoreboard for the owner** (the metric cards + the bar + the trajectory
chips). Then schedule the next cycle.

---

## Guardrails — do NOT auto-land (leave the PR open, report)

- The slice adds a chosen-target atom the enemy/own trigger chooser doesn't yet cover.
- The adversarial review ran on the in-process fallback instead of `/code-review ultra`.
- The slice changed a persisted schema.
- The slice needed an architecture-level decision (full priority/timing windows, a real
  replacement/event layer beyond the cheap cases) or any decision with no obvious right answer.

## Stop condition

Stop and report to the owner when **corpus native ≈ 85-90%** AND the remaining gap is dominated by
hard-subsystem (bucket b) / irreducible (bucket c) cards. **Do NOT chase 100% — the Arbiter is the
permanent, correct home for the irreducible tail.** Also stop and surface if a slice needs an
architecture change, a decision has no obvious right answer, or the same fix fails twice (use
`/investigate` to root-cause before a third attempt — CLAUDE.md §1.5). The owner can say **"pause"**
or **"status"** at any time.

---

## Running it on the loop

Fire once with `/loop` (self-paced — the model does a cycle, then schedules the next):

```
/loop  Run the Academy coverage autopilot per docs/coverage-autopilot-prompt.md — corpus-primary, full gate discipline, finish any in-flight slice first, update the status doc + scoreboard each slice, then continue.
```

Each cycle advances the work and re-arms the next; between cycles the model is idle, but the owner
doesn't have to nudge. Keep each slice a **separate PR** — never batch unrelated mechanics.

# Coverage Autopilot — the no-stop execution prompt

This is the prompt a fresh session pastes (or a `/loop` fires) to drive the **next coverage
slice** end-to-end without stopping for hand-holding. It encodes the plan in
`docs/coverage-roadmap-to-100.md` and the discipline in `docs/coverage-handoff.md`.

**Model + resources (the owner's standing directive):**
- Run the **primary session on Opus at max effort** ("ultra code opus") — the architecture,
  the correctness-critical edits, and the final judgment are Opus's job.
- Use **`/code-review ultra`** for the heavy adversarial review (multi-agent cloud review of
  the branch). Fall back to an independent in-process adversarial agent if ultra is
  unavailable on the run.
- Push parallelizable, well-scoped grunt work onto **Fable-tier agents** for speed and cost:
  corpus sweeps, the per-slice gap re-scan, mechanism inventories, doc summarization. Spawn
  them with `Agent(..., model: "fable")` and run them in parallel. Keep the Opus session for
  the edits, the synthesis, and the go/no-go calls.
- Lean on every skill that helps: `/code-review ultra`, the Explore/Plan/general-purpose
  agents, `/investigate` when a fix fails twice, `/ship` / `/land-and-deploy` for the PR flow.

---

## THE PROMPT (paste this)

> **You are running the Academy coverage autopilot. Drive ONE coverage slice from pick to
> merged PR without stopping to ask permission — you have full authority (CLAUDE.md §1.3).
> Run on Opus at max effort. Use Fable-tier agents for the parallel grunt work and
> `/code-review ultra` for the adversarial review.**
>
> **Read first (do not skip):**
> 1. `docs/coverage-roadmap-to-100.md` — the phased plan + the honest ~94% target.
> 2. `docs/coverage-handoff.md` — the per-slice discipline (the load-bearing rules).
> 3. The project memory `project_coverage_roadmap` — what shipped last + the latest lessons.
>
> **Step 0 — Preflight.** Confirm PR #194 (indestructible enforcement) is merged to master
> before trusting any keyword-only tier — on master, indestructible is in `COVERED_KEYWORDS`
> but unenforced, a live false-positive (roadmap §1 / R10). If it's still open, land it (or
> rebuild it) first. Then `git checkout master && git pull`.
>
> **Step 1 — Pick the next slice (data-driven, not blindly next-in-list).**
> Run `npm run coverage` from `app/` for the current headline + gap buckets. Then spawn a
> **Fable agent** to run a fresh corpus gap-scan (the REAL `classifyCard`/`mechanismBucket`
> over `oracle_cards.json` via `publicCard`) and re-rank the next-atom backlog by
> `sample-deck-count × cleanliness`, respecting the roadmap's phase order and dependencies.
> **The highest-value slice shifts as the modeled set grows — re-scan every time (#192
> lesson).** Pick the top clean, in-phase, dependency-satisfied slice. State your pick + why
> in one line, then proceed.
>
> **Step 2 — Branch + build.** `git checkout master && git checkout -b feat/<slice>`. Build
> the parser matcher + atom resolver + the `coverage.js` classifier update **in lockstep**
> (the metric must call the runtime parser, never a parallel heuristic). Anchored allowlist,
> all-or-nothing confidence: any unmodeled clause → whole program LOW → Arbiter. If the slice
> can self-harm on the trigger-flush path (targeted removal/counter), GATE it out of the
> flush until the enemy-aware chooser exists — mirror the gate in `coverage.js`.
> Add unit tests (the new shape + MUST_STAY_HIGH / MUST_DROP parser pins + regressions).
>
> **Step 3 — Corpus sweep (Fable agent).** Run the REAL parser/classifier over all ~37k
> cards via `publicCard`. Require **0 dangerous false-positives** (claims native but
> mis-resolves). Hand-verify the newly-native set is legit. Confirm 0 HIGH→LOW regressions vs
> HEAD. **The sweep is parse-level — it does NOT catch runtime mis-targeting.** If the slice
> adds a chosen-target atom, also assert no newly-native form is reachable on a TRIGGER without
> a flush gate or the (α1) enemy-aware chooser (R11). Delete any temp script before finishing
> (a stray `*.mjs` in `app/` breaks `eslint .`); commit nothing from the sweep.
>
> **Step 4 — Live real-enrichment QA.** Drive the REAL `lookupCard → publicCard →
> deckToCardArray → engine` path (NOT hand-built fixtures — fixtures mask slim-index gaps,
> the #1 silent-gap risk). Confirm the mechanic plays end-to-end with real card data. **For a
> targeted atom, exercise its TRIGGER form (ETB/dies), not only the cast form** — the cast path
> is player/AI-picked and safe; the trigger flush is where a first-legal friendly-target bug
> hides (R11). If the slice has a player-facing CHOICE, it needs real interactive UI via
> `pendingChoice`, not an engine auto-pick (owner directive) — verify live with the preview
> tools.
>
> **Step 5 — Test + lint** from `app/`: `npx vitest run` (full suite green) and
> `npm run lint` (`--max-warnings 0`). Run from `app/`, never repo root (root grabs the wrong
> vitest + config and lies). Bump the save schema + add a migration + a fixture in the SAME
> PR if any persisted shape changed (CONTRACT-MIG).
>
> **Step 6 — Adversarial review.** Run `/code-review ultra` on the branch. If ultra is
> unavailable, fall back to an independent in-process adversarial agent — **but a fallback
> review means the merge is human-gated, never an unattended `/land-and-deploy`** (the weaker
> review must not auto-ship). VERIFY against code + corpus + suite; do not merge on an
> unverified/session-limit-failed review (#191 lesson). Fix every confirmed finding
> (Fix-First); note + defer the rest with a reason.
>
> **Step 7 — Ship.** Commit (Conventional Commits), push, open the PR with `gh` (corpus-sweep
> numbers + live-QA result + review outcome in the body). Verify `gh pr checks` says **pass**
> (watch the exit code — it has lied; read the actual status). If CI is green and the review
> is clean, you may `/land-and-deploy` (the owner has standing merge authority for shippable
> coverage slices) — otherwise leave it open and report.
>
> **Step 8 — Record + loop.** Update the `project_coverage_roadmap` memory with what shipped,
> the measured counts, and any new lesson. Update `docs/coverage-handoff.md` if the discipline
> changed. Then **go back to Step 1 for the next slice** — keep going until the stop
> condition.
>
> **Stop condition:** stop and report when the 16-deck headline reaches **~90-94%** AND the
> remaining per-deck gap is dominated by bucket (b)/(c) cards (hard subsystems / irreducible).
> Do NOT chase "100% native" — the Arbiter is the permanent, correct home for the irreducible
> tail. Also stop and surface to the owner if: a slice needs an architecture change (full
> priority windows, a real replacement/event layer beyond the cheap cases), a decision has no
> obvious right answer, or the same fix fails twice (use `/investigate` to root-cause before a
> third try).
>
> **The cardinal rule, above all:** a false-negative (route to Arbiter) is safe; a
> false-positive (claim native, then mis-resolve) is forbidden. When unsure, route to the
> Arbiter and move on.

---

## Running it on a loop

To chew through slices back-to-back without re-pasting, fire it via `/loop` (self-paced):

```
/loop  Run the Academy coverage autopilot for ONE slice per docs/coverage-autopilot-prompt.md, then stop and report; I'll review before the next.
```

Or for true hands-off batching (only when the owner has OK'd unattended merges), let each
iteration `/land-and-deploy` on green and continue to the next slice until the stop condition.
Keep each slice a **separate PR** — never batch unrelated mechanics into one diff.

**Unattended-merge guardrails (do NOT auto-`/land-and-deploy` when):** the slice adds a
chosen-target atom and α1's enemy-aware chooser hasn't shipped yet (S4/R11); the review ran on
the in-process fallback instead of `/code-review ultra` (N4); the schema changed; or the slice
needed an architecture decision. Those land human-gated.

## Why the model/resource split

- **Opus (primary)** owns correctness: the parser gates, the layer/CR semantics, the
  go/no-go on a sweep result, the architecture calls. These are where a wrong judgment ships
  a false-positive — the one unforgivable failure.
- **Fable (parallel sub-agents)** owns throughput: re-scanning 37k cards, inventorying
  mechanisms, summarizing docs. Fast, cheap, parallel, and low-stakes (their output is data
  the Opus session verifies, never an unreviewed edit).
- **`/code-review ultra`** owns the independent adversarial pass: fresh-context, multi-agent,
  cross-checked against the corpus — the proven catcher of pre-existing partials.

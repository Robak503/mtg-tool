# Academy Coverage — Ultra-Code-Opus Launch Prompt

*Paste the block below verbatim into a fresh Claude Code chat (Opus, ultracode on) to start the
autonomous coverage grind. Synthesized 2026-06-18 via a judge-panel workflow (4 drafts → 3
judges → synthesis); companion to `docs/coverage-roadmap-to-100.md` (the plan) +
`docs/coverage-autopilot-prompt.md` (the per-slice loop).*

---

You are Claude Code running the **Academy coverage autopilot** for the MTG Tool project under **ULTRACODE — Opus at maximum effort**. This is an autonomous, no-stop, "kick the shit out of it" run that STILL honors every safety gate. You have full architectural authority (CLAUDE.md §1.3): do not ask permission for routine work. Drive native-coverage slices from pick → merged PR, back-to-back, one separate PR per slice, looping until the stop condition. Go hard. But there is exactly ONE failure you may never commit, and the entire run is organized around preventing it. Read this whole prompt before doing anything.

═══════════════════════════════════════════
THE CARDINAL RULE (read first; hold it above everything)
═══════════════════════════════════════════
A FALSE-NEGATIVE (the engine routes a card to the Arbiter when it could have played it natively) is SAFE. It costs a little coverage. Nobody is harmed.
A FALSE-POSITIVE (the engine claims a card is native, then mis-resolves it — wrong target, dropped clause, partial effect, illegal play) is FORBIDDEN. It silently corrupts a game. It is the one unforgivable failure.
When you are unsure whether a slice is safe: route to the Arbiter and move on. "Route to Arbiter" is always the correct tiebreaker. Coverage is a grind you win over many slices; correctness is a thing you can lose in a single bad merge. Every gate below is a HARD STOP that BLOCKS the merge — none are optional, none are checklist theater.

═══════════════════════════════════════════
WHAT THIS IS
═══════════════════════════════════════════
Repo root: `C:\Users\colto\Documents\Claude\Projects\MTG-TOOL`. OS: Windows 11. Shell: PowerShell primary; Bash tool also available (each takes its own syntax). Branch: `master`. You are growing the Academy MTG rules engine's NATIVE card coverage on real Commander decks.
**CRITICAL: run ALL npm/test/lint/coverage commands from `app/` — `cd app` first, NEVER repo root.** The root grabs the wrong vitest + config and reports spurious failures (it has lied before). The live metric is `npm run coverage` from `app/`.

═══════════════════════════════════════════
READ FIRST, IN THIS EXACT ORDER (do not skip; do not start coding before this)
═══════════════════════════════════════════
1. `CLAUDE.md` (repo root) — operating manual. Internalize §1.2 NEVER FABRICATE (no invented rule numbers, no card text from memory — card behavior comes only from bundled Scryfall data; every CR citation traces to a real entry), §1.3 (full authority), §1.4 (verification cadence), §1.5 (two failures of the same fix = stop, use /investigate).
2. `docs/coverage-roadmap-to-100.md` — THE PLAN: current state, the honest ceiling, the phased α→β→γ→δ roadmap, the risk register (internalize §6 discipline and §7: R1, R3, R8, R9, R10, R11).
3. `docs/coverage-autopilot-prompt.md` — THE PER-SLICE LOOP: the no-stop execution steps, the model/resource split, the stop condition, the guardrails.
4. `docs/coverage-handoff.md` — the load-bearing per-slice discipline detail.
5. The project memory file `project_coverage_roadmap` — what shipped last + the hard-won lessons (especially #191 same-line multi-sentence partial, #192 DFC mis-target, #187 silently-dropped restriction). These are scar tissue from real false-positives adversarial review caught; do not re-learn them the hard way.

═══════════════════════════════════════════
GROUND TRUTH (true as of this launch — do not contradict)
═══════════════════════════════════════════
- Current coverage: ~47% native on the 16 sample decks (15.3% corpus). Re-measure — confirm the LIVE number yourself: `cd app` then `npm run coverage`.
- **Honest ceiling (MEASURED): ~94% native on real decks via the Phase-2 vocabulary; ~99% with the hard subsystems; the last ~1% of decks / ~2-4% of corpus is IRREDUCIBLE → stays on the Arbiter forever by design. "100% native" is NOT a goal.** The Arbiter is a permanent, load-bearing fail-safe, not a gap to close.
- Preconditions already satisfied: PR #194 (indestructible enforcement — keyword-only Indestructible is now correctly enforced, not a live false-positive) and PR #195 (these roadmap + autopilot docs) are MERGED to master. The old "land #194 first" gate is done.

═══════════════════════════════════════════
ULTRACODE RESOURCE SPLIT (mandatory)
═══════════════════════════════════════════
Drive every substantive slice through the **Workflow tool** as a multi-agent pass. The division of labor is non-negotiable:
- **OPUS (you, primary, max effort) OWNS and NEVER delegates:** every EDIT to parser / atom resolver / `coverage.js` / `gameEngine` / tests; the parser-gate + CR-layer semantics; and the **go/no-go judgment** on every sweep and review. A wrong judgment ships a false-positive — the one unforgivable failure.
- **FABLE-TIER AGENTS (`Agent(..., model: "fable")`, parallel) OWN throughput, produce DATA you verify, NEVER unreviewed edits:** corpus sweeps over ~37k cards, the per-slice gap re-scan, mechanism inventories, doc summaries.
- **`/code-review ultra` OWNS the independent adversarial pass** on each branch. It has repeatedly caught pre-existing partials the sweep + units missed (#191, #192). If ultra is unavailable, fall back to an independent in-process adversarial agent — but then the merge is HUMAN-GATED, never auto-landed (a weaker review must never auto-ship).
- Concrete per-slice topology: FINDERS (Fable, parallel) = gap re-scan + next-atom re-rank, corpus sweep of the new parser, mechanism inventory of the target atom's oracle phrasings. BUILDER (Opus, you) = the lockstep parser + resolver + coverage.js edits, gates, tests. VERIFIERS (Fable, parallel, after the build) = re-run the sweep on the branch, diff HIGH→LOW regressions vs HEAD, hand-list the newly-native cards for your inspection. JUDGE (Opus, you) = read every finder/verifier result, run the live real-enrichment QA yourself, make the go/no-go call. ADVERSARY = `/code-review ultra`.

═══════════════════════════════════════════
STEP 0 — PREFLIGHT
═══════════════════════════════════════════
CONFIRM #194 and #195 are on master via `git log`/`gh` (do not assume). If for any reason #194 is not actually on master, land/rebuild it before trusting any keyword-only tier (roadmap §1 / R10). Then `git checkout master && git pull`, confirm a clean tree. `cd app` → `npm run coverage` to confirm the live headline + gap buckets.

═══════════════════════════════════════════
STEP 1 — YOUR FIRST ACTION: BUILD α1, THE ENEMY-AWARE TRIGGER-TARGET CHOOSER
═══════════════════════════════════════════
The first slice is FIXED — do NOT re-scan to pick it. α1 is the dependency gate that makes every targeted-on-trigger atom in β safe, and it is simultaneously the highest-leverage slice AND the one most able to INTRODUCE a false-positive (R1/R11) — so test it hardest. State your understanding of α1 in one line, then build it.

What α1 is, precisely:
- Build a **NEW program-atom-aware enemy chooser**, keyed by atom `.op`. It is **NOT a reuse of `spellEffects.chooseAITarget`** — that function is `.kind`-keyed (damage/destroy only), returns `null` for `pump`, and has no `counter`/`add-counter` case. Candidates arrive from the flush seam shaped `{ targets: [{type,id,controller,atomIndex}], chosenMode? }` keyed by atom `.op`. PER atom op, map each candidate's `targets[].controller` against `opponentsOf(...)` and PROVE an **enemy-only** pick before any gate lifts. It must be a **pure function of state** — the choice is frozen onto the payload at flush time (serialize-stable; no closures, no Math.random). Inject it into `gameEngine.buildTriggerStack`'s flush.
- **ONLY after it provably picks enemy-only: flip the trigger-flush gate from a 2-item DENYLIST to an ALLOWLIST.** Today only `programContainsCounter` + `programContainsChosenPermanentRemoval` are gated out of the flush; EVERY other chosen-target atom (pump, add-counter, bounce, tap, …) currently routes through `firstLegalChoice` (which returns `candidates[0]`) with NO gate, so on a trigger it can first-legal-target a FRIENDLY. Change `buildTriggerStack` so EVERY chosen-target atom is gated out of the flush by default, lifted per-op only once your chooser proves an enemy-only pick. **Mirror this gate change in `coverage.js`'s `triggerRoutesNatively` IN LOCKSTEP** — the metric must never claim a routing the engine doesn't actually do.
- **Then, and only then, lift the `parser.js` `programContainsCounter` / `programContainsChosenPermanentRemoval` gates AND the `coverage.js` mirror together** — this un-gates counter + targeted-removal + targeted-pump on every trigger with NO new atom resolver.

═══════════════════════════════════════════
THE PER-SLICE LOOP (every slice, α1 included — HARD GATES, not steps to rush)
═══════════════════════════════════════════
1. **PICK (data-driven).** For α1 the pick is fixed. For every slice after, re-run the gap scan FRESH (spawn a Fable finder to run the REAL `classifyCard`/`mechanismBucket` over `oracle_cards.json` via `publicCard` and re-rank the next-atom backlog by `sample-deck-count × cleanliness`), respecting roadmap phase order + dependencies. **The highest-value atom SHIFTS as the modeled set grows (#192 lesson) — never blindly take next-in-list.** After α1: the β atom clusters (tokens, library-search family, counter cluster, anthem cluster, cost-reduction, bounce/untap/discard/loot, counterspell, modal widening, hexproof/protection enforcement), then γ (costs + X), then δ (heavy subsystems; pull the cheap δ1 enters-tapped / enters-with-counters forward opportunistically). State your pick + one-line why, then go.
2. **BRANCH + BUILD IN LOCKSTEP.** `git checkout master && git checkout -b feat/<slice>`. Build the parser matcher + atom resolver + the `coverage.js` classifier update TOGETHER — the metric must call the runtime parser, never a parallel heuristic (R8). Anchored allowlist, **all-or-nothing confidence**: any unmodeled clause drops the WHOLE program to LOW → Arbiter; a confident partial IS a false-positive, never emit one. If a slice can self-harm on the trigger-flush path (any chosen-target atom) and α1's chooser hasn't lifted its op, GATE it out of the flush and mirror in `coverage.js`. Add unit tests: the new shape + MUST_STAY_HIGH / MUST_DROP parser pins + regressions. Any persisted-shape change → schema bump + migration + fixture in the SAME PR.
3. **CORPUS SWEEP (HARD STOP — Fable verifier).** Run the REAL parser/classifier over all ~37k cards via `publicCard`. REQUIRE 0 dangerous false-positives AND 0 HIGH→LOW regressions vs HEAD. Hand-verify the newly-native set is legitimately playable. **KNOW THE BLIND SPOT: the sweep is parse-level only — it CANNOT catch runtime mis-targeting (R11).** If the slice adds a chosen-target atom, additionally assert no newly-native form is reachable on a TRIGGER without α1's chooser or a flush gate. Delete any temp `*.mjs` before finishing (a stray script in `app/` breaks `eslint .`); commit nothing from the sweep.
4. **LIVE REAL-ENRICHMENT QA (HARD STOP — the gate that catches what the sweep cannot).** Drive the REAL `lookupCard → publicCard → deckToCardArray → engine` path — NOT hand-built fixtures (fixtures mask slim-index gaps, the #1 silent-gap risk / R9; they have produced 0/0-creature and id-collision false-passes before). **For any TARGETED atom, exercise its TRIGGER form (ETB/dies), not just the cast form** — the cast path is player/AI-picked and inherently safe; the trigger flush is exactly where a first-legal friendly-target false-positive hides (R11). A player-facing CHOICE needs real interactive `pendingChoice` UI verified live with the preview tools, not an engine auto-pick (owner directive).
5. **TEST + LINT from `app/` (HARD STOP).** `npx vitest run` (full suite green) AND `npm run lint` (`--max-warnings 0`). From `app/`, NEVER repo root.
6. **ADVERSARIAL REVIEW (HARD STOP).** `/code-review ultra` on the branch. VERIFY each finding against code + corpus + suite; fix every confirmed one; note + defer the rest with a reason. **NEVER merge on an unverified or session-limit-failed review (#191 lesson)** — if it dies on a session limit, re-run after reset. If you fell back to the in-process agent, the merge becomes human-gated.
7. **SHIP.** Conventional commit, push, `gh pr create` with the corpus-sweep numbers + live-QA result + review outcome in the body. Verify `gh pr checks` says **pass** — read the ACTUAL status, the exit code has lied. If CI is green AND the review was a verified `/code-review ultra` AND no unattended-merge guardrail trips, you may `/land-and-deploy`. Otherwise leave the PR open and report. One slice = one PR; never batch unrelated mechanics into one diff.
8. **RECORD + LOOP.** Update the `project_coverage_roadmap` memory with what shipped, the measured counts, and any new lesson; update `docs/coverage-handoff.md` if the discipline changed. Then go back to step 1.

═══════════════════════════════════════════
GUARDRAILS — when you must NOT auto-land (leave the PR open, report)
═══════════════════════════════════════════
- The slice adds a chosen-target atom and α1's enemy-aware chooser hasn't shipped / hasn't lifted that op yet (its trigger form could first-legal a friendly).
- The adversarial review ran on the in-process fallback instead of `/code-review ultra`.
- The slice changed a persisted schema.
- The slice needed an architecture-level decision (full priority/timing windows, a real replacement/event layer beyond the cheap δ cases) or any decision with no obvious right answer.

═══════════════════════════════════════════
STOP CONDITION
═══════════════════════════════════════════
STOP and report to the owner when the 16-deck headline reaches ~90-94% AND the remaining per-deck gap is dominated by hard-subsystem (bucket b) / irreducible (bucket c) cards. **Do NOT chase 100% — the Arbiter is the permanent, correct home for the irreducible tail.** Also stop and surface to the owner if a slice needs an architecture change, a decision has no obvious right answer, or the same fix fails twice (use `/investigate` to root-cause before any third attempt — §1.5).

═══════════════════════════════════════════
THE CARDINAL RULE (restated, because it is the whole point)
═══════════════════════════════════════════
False-negative = safe. False-positive = forbidden. When unsure, route to the Arbiter and move on. Now go — autonomously, hard, and without skipping a single gate. Do the reads in order, run Step 0 (preflight + confirm #194/#195 + `npm run coverage` from `app/`), then build α1.

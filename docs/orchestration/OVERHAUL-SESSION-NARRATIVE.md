# OVERHAUL SESSION NARRATIVE — the full path of the Fable 5 engine-overhaul pass

> **Why this exists (Colton's order, 2026-07-01):** "write a full detail of your work, how it
> was done, and your path, so I can give it to future agents that are non-Fable — I want them
> to be able to mimic you as close as possible." This is that document: the chronological
> path, the WHY behind every call, the failures and course-corrections, and the exact agent
> prompt shapes that worked. The mechanics (commands, gates, proof levels) live in
> [OVERHAUL-PLAYBOOK.md](OVERHAUL-PLAYBOOK.md); the raw numbers in
> [overhaul-evidence.md](overhaul-evidence.md). Read all three together.
>
> **How to use it:** don't copy the work — copy the *shape* of the work. Every section ends
> with the transferable rule.

---

## 0. The setup (what I did before touching anything)

Launched via `/goal` with the mission doc (`FABLE5-OVERHAUL-PROMPT.md`) as authority. First
~15 minutes, in order:

1. Read the mission doc, WAKE-REPORT (the resume anchor), COMMS top, CONTINUITY top —
   *in one parallel batch*, not serially.
2. `git fetch && git log origin/master` — grounded on the live head, trusted no stale number.
3. Read both scaffolds (ENGINE/PROJECT) + the seam-migration map + gotchas — the maps, sized
   first (`wc -l`) so I knew they were readable in full.
4. Verified my worktree matched origin/master, junctioned `node_modules` from the main tree.
5. Ran the FULL gate before changing anything — 6,371 green — so any later failure was
   attributable to me.

**Rule:** ground on live state in parallel, verify green-before-change, and only then plan.
The mission said "present a plan in plan mode; outside plan mode, ground and go" — I stated
the plan on the record and went.

## 1. P0 — never build on unverified work

The previous pass (v0.84.0, one day old, "all verified") got **8 adversarial skeptic agents**
(one per fix domain) + 1 CI-log reader before I built anything on it. Each skeptic got the
commit SHAs, was told to *refute* — trace the mechanism, quote the code, re-run targeted
probes — and to default to NOT-holds when uncertain.

Result: 37/41 held, **1 was BROKEN** (the day-old mana fix had introduced 5 new phantom-mana
Auras — invisible to the tier flip-diff because all 5 classify body-only), 3 incomplete.
I repaired all four inline the same hour, each with real-oracle test pins and the full gate.

**Rule:** "verified yesterday" is a claim, not a fact. Spend the first hours of any deep pass
adversarially re-verifying what you inherit — the skeptic-per-domain workflow is cheap and it
caught a live CREED violation on day-old work. Skeptic prompt shape (abbreviated):

```
You are an adversarial verification SKEPTIC… READ-ONLY (no edits, no full suite; targeted
vitest + node -e probes allowed). For EACH fix: (1) git show the diff, (2) read the CURRENT
code, (3) trace the mechanism end-to-end, (4) hunt regressions the fix itself introduced,
(5) flag unfixed same-class neighbors ONLY with quoted evidence. Verdicts HOLDS/BROKEN/
INCOMPLETE/UNVERIFIED; uncertain ≠ HOLDS; every verdict cites code you actually read.
```

## 2. P1 — measure before touching

Before any optimization: committed baselines (suite time, classify sweep, fingerprint dumps
with checksums, determinism double-run) and **a CPU profile of a real 3-game pod batch**
(`node --cpu-prof` + a ~30-line self-time aggregator). The profile — not intuition — ranked
the P2 waves: ~30% of CPU was runtime re-parsing of static abilities; 8.6% a battlefield
rescan per mana lookup.

Two instruments were *built* here because the pass needed them:
- **The trajectory hash** — 3 seeded pod games, every decision hashed. Byte-identical across
  a refactor = the engine made the same decisions on real games. This became the proof for
  every behavior-preserving wave (and it caught nothing precisely because the discipline
  held). Run it twice before trusting it — it must reproduce.
- **The play-quality A/B probe** (built later by the AI agent as its W0) — because AI-policy
  changes *intentionally* change decisions, so the trajectory hash is the wrong gate there;
  win-rate/dead-turn deltas over seeded mirrors are the right one.

Along the way the baselines exposed real data rot: Colton's 6 personal decks were invisible
to the entire profile system (a hand-named profile id failing the path-traversal guard), and
an empty "Test Deck" poisoned 2 of 3 self-play pods. Fixed the data, guarded the code later.

**Rule:** every optimization claim needs a before/after from the same machine; build the
measurement instrument FIRST if it doesn't exist; expect baselining itself to surface bugs.

## 3. P2 — waves, smallest-correct-change, escalating proof

Eleven waves, always in this order of concern: **perf (measured) → correctness (probe-confirmed)
→ structure → play quality → bounded seam work**. The pattern per wave:

1. **Perf waves 1–2** (inline): per-card WeakMap caches for the static-parse family, then
   per-state indexes + a manaProduction memo. Each proven by suite + 3 fingerprints 0-diff +
   byte-identical trajectory hash, with before/after timings (7.0s → 1.1s for the pod batch,
   6.4×). *Why inline:* small blast radius, highest leverage, and the proof battery is fast.
   I stopped perf work when the profile showed no engine function above ~2% — chasing the
   tail would have been vanity optimization.
2. **An 8-agent read-only recon workflow** designed everything else (GY accounting, commander
   keying, mana-commit dedup, opponentAI defects, pendingChoice dead-ends, narrator issues,
   a fresh parser census). Read-only agents can share your worktree safely; their designs
   came back implementation-ready with file:line quotes. One design assumption was wrong
   (test fixtures WERE stamped) — recon informs, the builder re-verifies.
3. **Correctness waves** (inline, because they're CREED-heavy and touch the dispatcher):
   commander-mirror instance keying (a probe-confirmed false-death that was poisoning
   self-play labels), the one-shot sac-victim payment guard, cost-time leave drains,
   GY zone accounting (CR 608.2m — with a storm-copy anti-duplicate guard as the single
   load-bearing subtlety). The GY wave flipped 13 existing tests: each was AUDITED (the
   tests encoded the old vanish behavior; one — the ETB-mill *trigger* — was correctly NOT
   updated because a trigger has no spell card to bin). **Rule:** when a fix breaks tests,
   the tests are suspects too, but every single one gets an explicit verdict.
4. **Three parallel build agents in isolated worktrees** for file-disjoint domains
   (opponentAI / narrator+combat-labels / pending-choice client), later two more
   (structure / parser-seam). Their contract (the part to copy verbatim):

```
- FIRST: rebase onto the live overhaul branch head (git fetch <orchestrator-worktree>
  <branch> && git reset --hard FETCH_HEAD), THEN junction node_modules from the MAIN tree.
- FILE-OWNERSHIP list: files you own / files you must NOT touch (disjoint from every other
  live agent and the orchestrator).
- One conventional commit per work item, FULL gate per commit (vitest, NO MTG_APP_ROOT;
  lint --max-warnings 0), plus the proof the change class demands (program-fingerprint for
  parser lifts; a WORKTREE-LOCAL copy of the trajectory probe for dispatcher changes;
  the A/B play-quality probe with before/after numbers for AI-policy changes).
- ENV BUG: node-fs script edits; verify your tree AND that the main tree stays clean.
- FINISH: remove your node_modules junction yourself (cmd //c rmdir — a recursive delete
  would follow the junction and wipe the main tree), report SHAs + gate results + parked
  items, leave the worktree for the orchestrator.
```

5. **Integration** (orchestrator, serial): cherry-pick each agent branch, resolve conflicts
   *preserving both sides' semantics* (e.g. my instance-keying + their commanderName log
   field), re-run the FULL battery after each branch, junction-safe remove the worktree.
   The narrator branch conflicted exactly where expected (we'd both fixed the same stale CR
   cite); the resolution kept their richer grammar rework AND my 2-player draw-skip gate.

**Wave ordering rule:** measured leverage first; delegate only what is file-disjoint and
spec-complete; keep anything CREED-heavy (dispatcher, mana, zone moves) in the orchestrator's
hands; integrate serially with the full battery between branches.

## 4. P3 — contracts before code, canaries in the gate

The Omnath seams were shipped as **written contract first** (PLAY-API-CONTRACT.md: the drive
loop, the decision vocabulary, the supported-import table, the trajectory schema, semver
rules), then code (gameApi session layer), then **a canary test that runs in MY gate**
(omnathSeam.test.js pins the consumer's own golden cards) — so engine churn breaks my build
before it breaks the consumer. Contracts were posted to memory/COMMS.md the moment they
locked, because a parallel session consumes them. The data hook (trajectory export) reuses
the runner's honest trainingWeight rather than re-deriving trust — never let an exporter
invent labels the engine didn't.

**Rule:** a seam isn't "hardened" by care — it's hardened by a written surface table + a
canary in the producer's own gate + a versioning rule with an announcement channel.

## 5. P4 — the second whole-system pass

Four verified-finder agents (server/pipeline, UI surfaces of the new engine work, shell/build,
docs-config) with the explicit brief: *don't rediscover the previous pass's parked items;
find what the overhaul itself made stale or missed*. Every finding required quoted evidence.
23 survived. The headline: the finder didn't just flag the Spellbook paged-crawl problem —
it **found the official bulk export, downloaded it, stream-parsed all 95,001 records, and
identified the load-bearing constraint** (the decompressed doc exceeds Node's max string
length). That made the fix a 30-minute build instead of a research project.

The build still hit a live surprise: CloudFront serves the `.gz` with `Content-Encoding:
gzip`, so Node's fetch auto-decompresses and an explicit gunzip dies with "incorrect header
check" — fixed with gzip-magic detection on the first chunk. **Rule:** even a fully-verified
design gets a LIVE end-to-end test before commit (the 8.5-second 95k-variant run in the
commit message is that test).

## 6. The failures worth copying the recovery from

| Failure | Recovery | Transferable rule |
|---|---|---|
| Bash heredocs ate backslashes / evaluated backticks — patch anchors silently MISSed, one scrambled a committed doc | Write every patch script with the **Write tool**, run `node script.cjs`; anchor on exact bytes read from the file (escaped-unicode `“` vs literal `“` bit twice) | Never push backslash/backtick content through the shell; verify anchors with `t.split(from).length === 2` before replacing |
| Recon said "fixtures carry no instance id" — they did (built via the real builder) | 5 test failures at build time; updated the fixtures to the real key-space, documented why the mixed state is production-impossible | Recon designs are hypotheses; the builder re-verifies every assumption that reaches code |
| My own bulk-sync patch had a dead header-capture (string contents skipped) | Caught by re-reading my patch BEFORE running it | Re-read generated patches like hostile code review — your own included |
| Tax test failed because the fixture couldn't afford the taxed cast | The engine was right; the fixture had 2 lands for a 3-mana cast | When a new test fails, suspect the fixture before the engine — but prove which |
| 5-min-old "verified" work (v0.84.0) carried a live FP regression | The P0 skeptic pass | Adversarial re-verification is not optional overhead |

## 7. What made this pass different (mimic these habits, not the model)

1. **Escalating proof, never vibes.** Suite → lint → three fingerprints → trajectory hash →
   A/B probes, selected by change class (PLAYBOOK §3). Every commit message carries its
   evidence. A row you can't explain by name is a stop.
2. **Reads fan out, writes serialize.** Recon/finders/skeptics in parallel always; builders
   only when file-disjoint with an explicit ownership list; integration always serial with
   the full battery between.
3. **Park with analysis, never force.** W6 entry-unification, the narrated log feed, the
   spend-restricted-LANDS class, S3–S5 registries — all parked with written designs, not
   half-built. The parked list IS a deliverable.
4. **Fix the data AND the code AND the doc in the same wave** (profile-id repair + route
   guard + gotcha entry), so the same trap can't fire three ways later.
5. **Honest failure surfaces everywhere:** timeout buckets, engine-stuck failsafes,
   skippedDecks in API responses, `trainingWeight 0` — the system says "I didn't finish"
   rather than pretending.
6. **State lives in git + files, never in chat.** The pause anchor let this pass stop cold
   and resume hours later losslessly — write yours before you need it.

---

*Written at the end of the pass (2026-07-02, the 01:15 completion loop). If you are a future
agent: read PLAYBOOK §2 for the commands, §3 for the proof table, this doc for the judgment.
The engine will have moved — the shapes above are the durable part.*

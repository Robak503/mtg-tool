# PLAY-HARNESS OVERHAUL PLAYBOOK — how to change the harness + AI deeply and prove you broke nothing

> The METHOD deliverable of the play-harness overhaul pass (2026-07-03) — written so a
> future non-Fable session can run this style of pass on any subsystem. This doc
> **complements** [OVERHAUL-PLAYBOOK.md](OVERHAUL-PLAYBOOK.md) (Clyde's engine pass):
> read that first for the generic wave anatomy (§1), the engine gate recipes (§2), and
> the base proof-level table (§3) — none of it is repeated here. This doc adds what the
> HARNESS/AI domain needs on top: the trajectory-hash anchor discipline, the play-quality
> A/B instrument, the runner-data sanity gates, the pilot-side diagnose loop, and the
> orchestration patterns that only showed up when the subject was *behavior over time*
> rather than *classification of text*. Raw evidence for every number:
> [play-harness-overhaul-log.md](play-harness-overhaul-log.md). Pilot-side evidence:
> `omnath-tools/pilots/R11-DIAGNOSIS.md` + `pilots/README.md`.
>
> **Post-Fable model note (2026-07-04):** seats + orchestration policy = [MASTER-GUIDE.md](MASTER-GUIDE.md) §2 — wherever this doc says `model:"fable"`, read `opus`.

---

## 1. The one-paragraph method

Evidence-first, always: **baseline before touching anything** (P0: suite anchor, pod
wall-time, trajectory hash ×2, breakage census, play-quality A/B, and the pilot-side
diagnosis you inherit), then **scan wide with read-only agents** (P1 here: 31 agents →
62 findings kept, 0 refuted — every finding quoted-code grounded and independently
verified before any build), then **lock a wave plan where every wave has a named gate
and every lane has exclusive file ownership**, then build → prove → integrate one wave
at a time. The one hard domain difference from an engine pass: harness/AI changes are
*supposed* to change behavior, so the byte-identical trajectory hash stops being a
universal gate and becomes a **lineage discipline** — every intentional behavior change
re-anchors the hash exactly once, documented old→new with a reason, and everything
that claims "no behavior change" must still reproduce the current anchor byte-for-byte.
Fan out reads; serialize writes per file-owner; every number in a commit message comes
from a §2 command anyone can re-run.

---

## 2. The harness verification recipes (copy-paste)

Setup for all of them. `MAIN=C:\Users\colto\Documents\Claude\Projects\MTG-TOOL`.
Same two iron env rules as the engine playbook: **vitest NEVER sees `MTG_APP_ROOT`**
(it redirects `paths.js` and fabricates ~176 filesystem failures); **every script below
ALWAYS gets one**, pointed at a data root with `profiles/` +
`scryfall-bulk/oracle-index.json`. This pass anchored against the installed AppData
root (`%APPDATA%/com.colton.mtg-tool`, read-only) because the dev tree's profile store
was polluted at P0; A1 repaired the dev tree and added the tripwire that stops tests
from ever polluting a real data root again. **An anchor is only comparable within one
data root + deck snapshot** — record which root you anchored on.

### 2.1 The trajectory-hash probe (the harness behavior fingerprint)

Three seeded real pod games, every enumerated decision hashed. Byte-identical across a
change == the engine made the SAME decisions on real games. The probe lives OUTSIDE the
repo (scratchpad — zero repo writes); recreate it from this script:

```js
// trajectory-hash-probe.mjs — run: MTG_APP_ROOT=<data-root> node trajectory-hash-probe.mjs <worktree>/app
import crypto from "node:crypto";
import { pathToFileURL } from "node:url";
const APP = process.argv[2];
const u = (rel) => pathToFileURL(`${APP}/${rel}`).href;
const { loadAllProfileDecks, toRunnerDeck } = await import(u("src/lib/server/selfPlayDecks.js"));
const { runSelfPlayBatch } = await import(u("src/lib/learn/selfPlayRunner.js"));

const POD = ["colton-sliver-hivelord", "colton-koma-cosmos-serpent",
             "colton-zaxara-the-exemplary", "joe-the-ur-dragon"]; // the Tier-1 pod
const all = await loadAllProfileDecks();
const decks = POD.map((id) => {
  const d = all.find((x) => x.id === id);
  if (!d) throw new Error(`missing deck ${id} — wrong MTG_APP_ROOT?`);
  return toRunnerDeck(d);
});
const { games } = runSelfPlayBatch(decks, {
  mode: "commander", gamesPer: 3, timePressure: true, recordDecisions: true,
});
const h = crypto.createHash("sha256");
let rows = 0;
for (const g of games) {
  h.update(JSON.stringify({ result: g.result, turns: g.turns, winnerSeat: g.winnerSeat ?? null }));
  for (const row of g.decisionTrajectory?.rows ?? []) { h.update(JSON.stringify(row)); rows += 1; }
}
console.log(`games=${games.length} rows=${rows} hash=${h.digest("hex")}`);
```

The canonical spec (if the code shape ever drifts, THIS is what the probe means): the 4
Tier-1 pod decks → `runSelfPlayBatch` `{mode:"commander", gamesPer:3, timePressure:true,
recordDecisions:true}` (default seed) → sha256 over per-game
`JSON({result,turns,winnerSeat})` + every `decisionTrajectory` row, in order.
**Run it TWICE every time** (must be reproducible), both BEFORE and AFTER the change.

**Anchor lineage rules** (the discipline that replaces "always byte-identical"):

- **Must be byte-identical** for: pure perf/refactor (D1: OOM/~300s → 2.9s on the SAME
  hash); instrumentation threading whose default path is untouched (A2); session-layer
  additions with null defaults (A3's `policy` knob — the null arm was proven
  byte-identical, the "v1" arm proven divergent); and offer layers the anchor pod
  doesn't exercise (B3: the Tier-1 pod carries no alt-cost cards, so the anchor holding
  byte-identical IS the proof that non-carrier decks are undisturbed).
- **Re-anchors, exactly once per integrated behavior change,** for intentional AI-policy
  or runner-semantics changes. Document in the work log: old hash → new hash, games/rows
  before→after, ×2 reproducibility, and WHY the behavior changed. Never re-anchor twice
  inside one wave, and never "re-anchor" to absorb a diff you can't explain — an
  unexplained hash move is a regression, full stop.
- **When two behavior-changing lanes integrate together**, each lane's solo hash is an
  *intermediate* recorded in its lane report; the tree's anchor is re-derived ONCE on
  the combined result (see §6.4).
- This pass's lineage, as the worked example:
  `0c75d0de…` (P0 baseline, 3 games / 8,014 rows) → `1c7e3a9d…` (B1 AI fixes, rows
  8,204) → `a2a03ba8…` (A4+B2 combined, rows 8,281; per-lane intermediates `847e2c57`
  A4-only / `7fe774c5` B2-only) → B3 held `a2a03ba8…` byte-identical ×2.

### 2.2 The play-quality A/B probe (the evidence instrument for every AI change)

For AI-policy changes the trajectory hash is the WRONG gate (decisions change by
design); what must improve is measured play quality. The OLD arm runs through the
runner's documented pilot seam, so every legacy pick is still validated against the
offered legal set — a policy arm can never inject an illegal action.

```bash
# Default grid: 60 mirror standard 1v1 games, NEW (shipping default) vs OLD (all-legacy):
MTG_APP_ROOT="$MAIN/app" node app/scripts/play-quality-probe.mjs

# Isolate ONE work item (per-slice evidence — do this for every slice you ship):
MTG_APP_ROOT="$MAIN/app" node app/scripts/play-quality-probe.mjs --legacy=wipe
# --legacy accepts any opponentAI.POLICY_KEYS entry or "all" (the default). The key list
# is DERIVED from the one exported POLICY_KEYS array (AI-F11) — a new subsystem is
# covered by --legacy=all automatically; a hand-copied list is the bug that fix removed.

# Other knobs: --mode=commander --pairing=cross --games=N --seed=N --mull
#              --no-time-pressure --json=<path> --self-test (plumbing check)
```

Read: win rate (NEW must be ≥ OLD on the default grid; an isolated new slice may be
neutral — B2's wipe slice gated at 50.0/50.0 "no regression" — but never negative),
dead turns (this pass held 0.02–0.03 throughout; a rise is a regression), all-decisive
check, and the per-behavior counters the probe reports (blocks/game, X-sizing, counter
usage). P0's grid is the template: it caught "NEW blocks ≈ never (0.12 vs 4.35/game)"
and the Rograkh-mirror perf pathology before any wave was planned.

### 2.3 The pod census (behavior evidence on real decks)

The standard Tier-1 pod batch doubles as a behavior census: the report's breakage
section (mined from the honest `state.log` signals) plus greppable behavior counts.

```bash
MTG_APP_ROOT="$MAIN/app" node app/scripts/self-play.mjs \
  --ids=colton-sliver-hivelord,colton-koma-cosmos-serpent,colton-zaxara-the-exemplary,joe-the-ur-dragon \
  --games-per=3 --out=<scratch>/pod.txt
```

Use it three ways, all from this pass:
- **Breakage-class deltas** — P0 counted 15 entries (9× `trigger-removed-no-target`,
  4× `spell-unresolved`, 2× Garruk's Uprising); B1's unresolvable-spell hold took
  `spell-unresolved` 4 → 0 (15 → 12). A NEW breakage class after your change = stop.
- **Feature-usage counts on a targeted pod** — pick decks that carry the mechanic:
  B2's equipment pod (Cap/Wolverine/Yuriko/Mothman) showed equip activations 0 → 16 and
  avg turns 68 → 53; B3's carrier pod (Rograkh-Thrasios/Kinnan/Yuriko/Cap) showed 7
  live alt-cost casts. "The slice ships" means the behavior OCCURS in real games, not
  just in unit pins.
- **Population censuses** — e.g. B3's carrier census (16 HIGH / 15 LOW alt-cost
  carriers, stable across the wave) pins the offer population itself.

### 2.4 The r11-diagnose loop (pilot-side changes, `omnath-tools/pilots/`)

The pilot repo has its own regression instrument: a shadow comparator that replays
seeded games feeding every priority window to BOTH the pilot and the engine's default
pick, classifies divergences by mechanism, and costs them with the engine's own duel
math (`duel.mjs` — the SAME module the pilots score with, so instrument == pilot math
and neither can drift). The full ladder is `pilots/README.md` "Verification loop (H8)";
the short form:

```bash
cd omnath-tools/pilots
node test-all.mjs            # selftest + memory-selftest + dryrun + lab smoke — green first
node r11-diagnose.mjs 6      # same seeds every run — paste the MECHANISM CLASSES table
node lab.mjs vs-default interaction   # per-temperament records
node lab.mjs vs-default ramp          # linear-deck non-regression (6±1/12)
node lab.mjs pod 12                   # real-profile pod: 12/12 complete + ingest > 0 cases
```

The loop's law: **diagnose → fix → re-gate on the same seeds**. The wave's NAMED
mechanism class must shrink to its target (R11's: taps 2,271→0, own-spell counters
43→0, free chumps 27→≤1, suicide swings 23→0, junk-target removal →0, land picks
71→0), and **no other class may grow >10%** (cross-contamination — the check that
caught the tiebreak revert, §4). Diagnosis is a separate, analysis-only deliverable
BEFORE any tuning (R11-DIAGNOSIS.md is the template: ranked mechanisms, root-cause
chains, honest nulls, a fix list with classes — nothing implemented in the diagnosis
pass itself).

### 2.5 Seed / label sanity (the A4 gates — run these on any runner-data change)

```bash
# Seed discipline (HB-4): default --seed=1 is deterministic; the base seed is stamped
# into meta AND every banked row, so duplicate banking is detectable after the fact:
node app/scripts/self-play.mjs --ids=... --games-per=3 --seed=7

# De-confounding (HB-5/HB-6): without --rotate-seats, seat and deck are CONFOUNDED
# (the win tables differ only by label); --pod-shuffle re-deals pod composition per cycle:
node app/scripts/self-play.mjs --ids=... --games-per=3 --rotate-seats --pod-shuffle

# Legacy pin for the mulligan default (AI-F9): --no-mulligan recovers keep-every-7.
```

What to check, from A4's evidence: **per-seat FATE labels** — in a pod only the TRUE
winner labels 1; losing seats label 0; a survivor of an aborted pod labels null and the
row is DROPPED, never a fabricated W/L (the HB-3 bug had losing pod seats labeled
winners: winner-seat labels 30 → 4 over the evidence batch). **Wilson-CI win tables**
by seat, by deck, and by on-the-play — the confound question ("is ai1 strong or is
Zaxara strong?") must be answerable from separated tables (A4: ai1 7/12 [32.0%, 80.7%]
vs by-deck Zaxara 8/12). If your change touches labels, seeds, or rotation, add a
correctness test per behavior, and prove the old behavior is recoverable (§3, row
"runner-semantics").

---

## 3. Proof levels for HARNESS/AI change classes

Extends OVERHAUL-PLAYBOOK §3 (which stays authoritative for engine/parser/mana/
classifier classes). "fp battery" = tier + program + runtime fingerprints; in a
harness pass the tier flip-diff must be **LOST=0 GAINED=0** — offering, policy, and
instrumentation are runtime-only, so ANY tier movement is a bug.

| Change class | Suite+lint | fp battery | trajectory hash | extra evidence |
|---|---|---|---|---|
| Pure harness perf / refactor | ✓ | 0-diff | **byte-identical ×2** | before/after wall+peak-RSS numbers (D1: 2.9s / ~357MB) |
| Instrumentation threading / session-layer additive (null default) | ✓ | 0-diff | **byte-identical on the default path** | new threaded-path tests; the non-null arm proven DIVERGENT (a knob that changes nothing is untested plumbing) |
| AI-slice change (intentional policy) | ✓ | 0-diff | re-anchors ONCE, documented | **A/B per slice** (`--legacy=<key>`) + default grid + census (no new breakage classes, feature-usage counts) + a `"v1"` POLICY_KEYS arm so the legacy behavior stays recoverable |
| Runner-semantics change (labels, seeds, mulligans, rotation) | ✓ | 0-diff | re-anchors ONCE, documented | **legacy-pin proof** (the A4 pattern): reproduce the OLD anchor with the new default flagged OFF — proving the new default is the ONLY delta — + label/seed correctness tests |
| Offer-layer insertion (new action kinds) | ✓ | **LOST=0 GAINED=0 (hard)** | anchor HOLDS byte-identical on non-carrier decks | MUST-NOT-OFFER canaries pinned (B3's 15 LOW carriers) + live-usage evidence on a carrier pod + condition canaries both ways (the CREED pins) |
| Contract change (PLAY-API) | ✓ | n/a (doc) | n/a | **runtime-truth rule**: the code export is canonical, the doc list informative; **canaries on both sides** (test pins for every documented shape — presence-pinned lists so removal fires and addition passes); semver discipline (additive=MINOR); COMMS post BEFORE shipping; never document a field that doesn't exist (§4, "parking") |
| Pilot-side change (`omnath-tools/pilots`) | pilots gates (`test-all.mjs`) | n/a (different repo, engine read-only) | n/a | the full §2.4 ladder: named class → target, no other class grows >10%, vs-default + pod re-measure |

---

## 4. Orchestration patterns that worked THIS pass

- **2-lane cap with file ownership.** Never more than 2 builder lanes live at once
  (the standing rate-limit hazard). Every lane owns files EXCLUSIVELY: lane A owned
  `learnSession.js`/`gameApi.js`, lane B owned `opponentAI.js`, lane C was a different
  repo entirely (free parallelism), lane D gated before/after everything, lane E was
  doc+tests. A finding that touches another lane's file moves to that lane, not to a
  shared edit.
- **Chained waves on shared files.** Waves inside a lane serialize (A1→A2→A3→A4 all
  touch the session driver); each wave builds in its own isolated worktree, commits,
  and the orchestrator cherry-picks onto the rolling branch and re-runs the FULL
  battery there. The lane's waves see each other only through the rolling branch.
- **Verify-then-complete recovery after kills.** When a session dies or pauses
  mid-lane, the log records: each build worktree's exact commit SHA, what SHOULD exist
  in it (including "tests must exist — if the agent died before adding them, ADD them
  before integrating"), and the finding-ids to verify against (`p1-confirmed.json`,
  with a durable copy outside the session dir). Resume = verify the claimed state
  against those ids, complete what's missing, THEN integrate. Lane C was recovered
  exactly this way (pause with "unknown which H-fixes landed" → verified against
  PILOT-W0/H1–H4 → completed H5–H8). Never trust "the agent said it finished".
- **The pathology-hunter pattern.** For a perf mystery (the Rograkh ~315s flag from
  P0's A/B): a time-boxed, read-only investigation agent whose ONLY instrument is
  in-memory instrumentation — counters and wrappers installed in a driver script at
  runtime, **zero repo writes**. Deliverable: the mechanism (one sentence:
  `kCombinations` materializes C(32,10)=64.5M arrays before the 64-cap sees a row),
  the degenerate seed that reproduces it, REFUTED alternate hypotheses (named), and a
  **pre-proven in-memory A/B of the fix** (patch the function in memory, show
  OOM/300s → 3.4s + action-set sha256 identical). The build wave then just transcribes
  a proven fix. Diagnosis and fix are separate deliverables — same rule as R11.
- **The twin post-pass pattern** (B3 — how to insert new offers without disturbing
  existing enumeration). Do NOT add a dual-offer branch at every cast site — that is
  the duplicated-exclusion-list drift trap (the standing mass-targetType lesson). Run
  the normal enumeration untouched, then ONE post-pass over the emitted actions that
  twins each qualifying cast with its alt-cost variant and splices out casts that were
  only emitted because an affordability gate was widened. Non-carrier decks stay
  byte-identical BY CONSTRUCTION, and the anchor holding (§2.1) proves it.
- **Parking with evidence.** Two shapes this pass:
  - *The measured-wrong-way revert*: lane C's global exact-tie name tiebreak fixed the
    land class (56→0) but the re-gate's cross-contamination check showed tied ATTACK
    declarations reordering (5→42, record 18/36→13/36) — reverted to a land-scoped
    tiebreak and the whole experiment RECORDED in R11-DIAGNOSIS.md. A fix that helps
    its class and hurts another is a finding, not a ship.
  - *The non-fabrication park*: lane E found consumers wanting a `decision.seat` field
    that does not exist in v1.x. The contract documents the seat DERIVATION consumers
    actually use and reserves the field as a future MINOR — it does not document a
    fabricated field to make the doc look complete.
- **Scan-first, refute-before-build.** P1's 31 read-only scan agents produced 62
  findings, each independently verified (0 refuted) with file:line quotes BEFORE the
  wave plan was locked. The wave plan then maps finding-ids → waves → gates, so every
  build has a pre-verified design and every gate was named before the build started.

---

## 5. What a non-Fable session must never skip (harness edition)

OVERHAUL-PLAYBOOK §5 still applies in full (fp battery, junction rule, real oracle,
CR cites, COMMS-before-contract). On top, for harness/AI work:

1. **The trajectory hash, ×2, before AND after, every wave.** The suite alone cannot
   see decision drift. If the hash moved and your wave claimed "no behavior change",
   you have a regression — do not re-anchor your way out.
2. **Anchor lineage documentation.** Every re-anchor: old → new, rows before → after,
   reason, reproducibility. An anchor with no lineage is a number, not evidence.
3. **A/B probe evidence for every AI slice** — per-slice isolation (`--legacy=<key>`),
   not just the default grid. Win rate + dead turns + census. "It passes tests" is not
   play-quality evidence.
4. **The legacy arm.** Every new policy subsystem registers in `POLICY_KEYS` with a
   `"v1"` recovery; every runner-semantics default gets an opt-out flag and a
   legacy-pin proof (§3). If old behavior isn't recoverable, the A/B instrument dies
   with the change.
5. **The env split**: vitest NEVER with `MTG_APP_ROOT`; scripts ALWAYS with it, and
   anchors compared only within one data root.
6. **`git rev-parse --show-toplevel` before any branch op**, and never trust a
   worktree directory you haven't just listed (§6.1).
7. **Read-only means read-only**: investigation agents (hunter, scanners, diagnosis)
   write NOTHING into the repo — instruments live in memory or the scratchpad.
8. **Tier fp LOST=0 GAINED=0** on every harness wave. Coverage does not move in a
   harness pass; any movement is a wiring bug.
9. **Pilot changes re-gate on the same seeds** with the named-class target AND the
   no-other-class-grows check. A single-metric improvement is not a pass.
10. **Honest labels only**: undetermined outcomes are null-and-dropped, never
    fabricated; contract docs describe only what exists.

---

## 6. Incident log (what actually bit, so you don't rediscover it)

1. **The empty-worktree git fall-through (P0).** The session's recorded worktree had
   been swept to an EMPTY directory; running a branch checkout from inside it fell
   through to the MAIN repo and moved the main tree's branch pointer (same commit —
   zero file damage; restored immediately). Rule: `git rev-parse --show-toplevel`
   before any branch op; list the directory first; assume nothing about a worktree you
   didn't just create.
2. **The tail-clipped OOM header (D lane).** A dead batch was first misread as a hang:
   V8 prints its `FATAL ERROR: Reached heap limit` header at the TOP of the crash
   output, and a tail-style read of the log showed only GC-trace rows. Rule: on any
   dead process, read BOTH ends of its output and capture the exit code + peak memory
   before theorizing.
3. **Profiling-induced OOM vs the real pathology (D lane).** Attaching the profiler to
   the degenerate run changed the failure mode — instrumentation overhead pushed runs
   over the heap limit, so the profile described the instrument, not the bug. The
   hunter got the truth by profiling the SUB-critical regime (the ~300s games, where
   GC 30% + pick 24% pointed at the allocator) and confirming the mechanism with
   in-memory counters on the exact call path. Rule: reproduce a pathology bare before
   attributing it; never trust a profile taken from a dying process.
4. **Both-lanes-re-anchor integration ordering (A4+B2).** Two behavior-changing lanes
   built in parallel worktrees, each re-anchoring the trajectory hash in isolation —
   producing two hashes, NEITHER of which the integrated tree can match. Resolution:
   per-lane hashes are recorded as intermediates in the lane reports (`847e2c57`
   A4-only / `7fe774c5` B2-only), the lanes integrate together, and the tree's anchor
   is re-derived ONCE on the combined result (`a2a03ba8…`), with the full lineage
   written down. Rule: parallel behavior-changing lanes = one combined re-anchor at
   integration, never sequential re-anchors that orphan each other.

---

## 7. FINAL NUMBERS

> Every value re-runnable from §2 / OVERHAUL-PLAYBOOK §2.

| Metric | P0 baseline | Final | Instrument |
|---|---|---|---|
| Suite | 7,503 passed / 512 files | 7,661 passed / 522 files (from 7,503 at P0 — +158 new pins across 10 waves) | `npx vitest run` (app/, no MTG_APP_ROOT) + `npm run lint` |
| Play-quality A/B (NEW vs all-legacy, default grid) | 58.3% / 41.7%, dead turns 0.02 | NEW 60.0% / OLD 40.0% (60 mirror games, all decisive; dead turns 0.03 vs 0.33; X-sizing 4.89 vs 1.00; baseline was 58.3/41.7 with the old counter-key drift) | §2.2 default grid |
| Pod breakage census (Tier-1) | 15 entries | 12 entries, ZERO spell-unresolved (was 15 with 4 spell-unresolved; remaining = Aberrant ×10 + Garruk's Uprising ×2 trigger-removed-no-target — genuine coverage tail, not AI waste) | §2.3 standard pod |
| Tier-1 pod batch (games-per=3) | 1.56s wall, 3/3 complete | Tier-1 pod 3 games: 5.2s batch / 6.7s wall (pre-pass 1.56s on SHORTER, poorer games — mulligans + equipment + richer combat lengthen games by design; not a like-for-like perf row) | §2.3 command, timed |
| Rograkh/Thrasios mirror batch | OOM / ~300s per game | Rograkh mirror 4 games: 13.4s wall (was OOM at 12GB / ~315s unprofiled; the pure-perf fix alone measured 2.9s on pre-wave game shapes) | §2.3 with the Rograkh pod ids |
| Trajectory-hash anchor | `0c75d0de…` (3 games / 8,014 rows) | a2a03ba8d94a9982b3eaf52f18d43b1e10630edc2704a29b6833982e9bd34e20 (games=3 rows=8281; lineage 0c75d0de → 1c7e3a9d (B1) → a2a03ba8 (A4+B2); B3/E hold it — proven non-carrier/doc-only) | §2.1 probe, ×2 |
| Pilot vs-default (interaction / ramp) | 17–33% / 50% (R11) | 18/36 parity ±10 / 27/36 = 75% | §2.4 ladder |
| Pilot r11 divergence | 2,559 / 13,571 windows (19%) | 188 / 12,250 (1.5%) | `r11-diagnose.mjs 6` |
| Contract | v1.0.0, "13 kinds" (stale) | v1.2.0, 20-kind truth + 13 canaries | PLAY-API-CONTRACT.md + `omnathSeam.test.js` |

---

*Play-harness overhaul pass, Claude Fable 5, 2026-07-03. Lanes: D perf (kCombinations
cap-bounding), A1–A4 harness (test isolation, instrumentation threading, session
correctness, runner data quality), B1–B3 AI (correctness, six unlocked slices, the
alt-cost OFFER subsystem), C pilots (W0 + H1–H8, all R11 mechanisms eliminated), E
contract v1.x truth. Method spine: OVERHAUL-PLAYBOOK.md. Evidence:
play-harness-overhaul-log.md.*

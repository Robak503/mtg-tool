# HARNESS-DATA PLAN — better games, faster games, logs we can LEARN from

> **STATUS (2026-07-09 late):** Waves **1, 1b, 2 SHIPPED** in v0.126.0 — wave 1's rotation item
> was replaced by evidence (deck→seat already uniform) and the pathology hunt found the REAL
> bug: fabricated 4P winners (user-pivot + turn-order crown) → fixed as **wave 1b: FFA
> sole-survivor** (anchor lineage `ab524e20…` → `53614053…`; legacy pin holds the old anchor).
> Pool measured **6.4×** (218.7 games/min); gz measured **43.7×**. Overnight FFA pool running
> for the Stage-A dataset. **Next: wave 3** (rows v2 + per-card evidence table + Omnath's
> sim-integrity order item 0/1), then wave 4. Live status: WAKE-REPORT top.

> **LIVE mission plan** (Colton-approved 2026-07-09 via /goal Q&A). Owner: the engine/builder
> seat (Cindy/Clyde), one wave at a time under the one-owner lock. Method authority:
> [PLAY-HARNESS-OVERHAUL-PLAYBOOK.md](PLAY-HARNESS-OVERHAUL-PLAYBOOK.md) (gates, anchor
> lineage, A/B instrument) on top of [OVERHAUL-PLAYBOOK.md](OVERHAUL-PLAYBOOK.md) (wave
> anatomy). This doc is the WHAT/WHY/ORDER; it does not restate the HOW.
>
> **Colton's four locked calls (2026-07-09):**
> 1. **Learning ladder, staged with verification between stages**: tune the autopilot from
>    data FIRST → prove the data pipeline end-to-end → only then the value net — each stage
>    ends by double-checking the next stage has everything it needs; a clean handoff pass to
>    Omnath's distill work is part of the ladder, not an afterthought.
> 2. **Speed budget: half the cores, anytime** (~8 workers target).
> 3. **Log depth: richer rows + compression** — caveat honored: gzip is LOSSLESS (bit-identical
>    content; recall/learning unaffected); we still gate it with round-trip + replay proofs.
> 4. **Proof bar (acceptance gates)**: A/B winrate gain ≥55/45 over ≥500 seeded games ·
>    standings reproduce across independent runs · readable per-deck reality reports that
>    match his table intuition. (Replay determinism wasn't picked as a Colton-facing proof but
>    is REQUIRED internally by stage B — it's what makes pruning safe and "regenerable" true.)

---

## 0. Ground truth at plan time (2026-07-09; re-derive at execution, trust nothing stale)

- **Store**: file-per-game shards + per-shard `headers.jsonl` + manifest (`gameLogStore.js`);
  ~6,600 games banked + grind #2 running to a 40 GB cap. ~3.2 MB/game raw JSON.
- **Throughput**: single-process grind ≈ **34 games/min** (idle machine), 1 core of 24 busy.
- **Rows today**: `{turn, seat, pilot{playbook,temperament,pilotType}, features(28 board-count
  dims from FEATURE_KEYS), action}`; header `{seed, pilots, decks[{seat,id,name}] (v0.124.0),
  engineVersion, result, winnerSeat, turns, mode}`. No schema version stamp yet.
- **Honest labels** exist and hold: timeout/engine-stuck/dispatch-error/setup-error → null →
  dropped (breakageReport.js); grind #1 trusted rate 96%.
- **Known data taints**: (a) **seat-order confound** — winner-seat split over 6,618 games:
  ai1 52%, user 24%, ai2 15%, ai3 6%, i.e. seat and deck are confounded exactly as HB-5/HB-6
  warned (grind pods don't rotate seats); (b) ~4% engine-stuck/timeout games; (c) pre-v0.124
  games lack the `decks` field (totals-only in standings).
- **Consumers waiting on this lane**: Omnath's parse→distill (reads sealed shards via
  manifest; `markShardParsed` → prune); the corpus roadmap's **blend ranking explicitly wants
  per-card grind-breakage frequency** (`memory/orders/cindy-corpus-roadmap.md`); wave-P
  backlog items P5/P7/P9 want the same analyzer/report layer this plan builds.
- **Anchor caveat**: the deck shelf changed since the last recorded trajectory anchor
  (corruption → 15-deck restore). P0 below re-derives the anchor on the CURRENT root before
  any wave; lineage documented from there.

## The stage ladder (Colton call #1) — with readiness checklists between stages

```
Wave 1  DATA TRUST   → Wave 2  SPEED        → Wave 3  ROWS v2      → Wave 4  INTERPRET
(fix what taints)      (half-core pool+gz)     (richer, versioned)     (reports humans read)
        ↓ readiness check                                        ↓ Colton eyeball gate
Wave 5  STAGE A: tune the autopilot FROM the data (A/B-proven)
        ↓ readiness check (stage B prerequisites verified)
Wave 6  STAGE B: pipeline e2e proof + clean Omnath distill handoff
        ↓ readiness check (stage C prerequisites verified)
Wave 7  STAGE C: value net (planned here, built under its own mission when B is green)
```

Waves 1–2 can ship in one session; 3–4 in one; 5 and 6 each get their own. Every wave =
evidence → design → build → prove → integrate; every wave posts its gate evidence in the
commit message; broad-scope waves take the COMMS lock.

---

## Wave 1 — DATA TRUST (fix what taints every downstream number)

**Why first**: standings, tuning targets, and training labels are all polluted while seat and
deck are confounded and stuck-games are unexplained. Cheap fixes, huge trust dividend.

1. **Seat rotation in the grind** — rotate each pod's seat assignment per game (the runner's
   `--rotate-seats` pattern, applied inside `grindLoop`) so every deck's games spread across
   seats ~evenly. Additive knob, default ON for the grind; header records the rotation so old
   games are distinguishable.
2. **Seat-advantage pathology hunt** (read-only, playbook §4 hunter pattern) — WHY does seat
   ai1 win 52% and ai3 6%? Deliverable: mechanism in one sentence + refuted alternates +
   a reproducing seed, BEFORE any fix is designed. (Plausible suspects: threat-assessment
   asymmetry, priority/attack ordering, kill-the-leader focus fire — no guessing; measure.)
   A fix, if one emerges, is its own AI-slice with full §3 gates in a later wave.
3. **engine-stuck triage pipeline** — every stuck/timeout game already carries seed+pilots+
   engineVersion+decks: emit a `stuck-triage.jsonl` (one line per bad game) + surface stuck
   rate in grind status/results; a `--repro <line>` helper re-runs one. Feeds the engine lane.
4. **Schema stamps** — `header.schemaVersion` (start at 2), `header.featuresV` (FEATURE_KEYS
   version), cheap row-shape validation at `appendGame` (reject-and-log malformed, never
   silently store junk). **COMMS post to Omnath BEFORE shipping** (additive fields).

**Gates**: suite+lint · tier fp 0-diff · trajectory anchor byte-identical ×2 (nothing here
changes decisions — rotation is pod ASSEMBLY, proven by decision-equality on a fixed seed) ·
a 1k-game seeded grind shows per-seat win spread collapsing toward turn-order-only variance ·
stuck-triage list populated and one entry successfully repro'd.

## Wave 2 — SPEED (Colton call #2: half the cores) + LOSSLESS COMPRESSION

1. **Worker-pool grind** — N = `max(1, floor(cores/2))` worker processes each playing whole
   games (disjoint seed lanes: worker k plays seeds ≡ k mod N), streaming finished game
   records to the parent; **the parent remains the ONLY writer** (store integrity: appendGame
   stays single-threaded; no write races by construction). Cancel = drain in-flight games.
   Status gains `workers`, `gamesPerMin`.
2. **gzip the store** — `game-NNNNNN.json.gz` via zlib (level 6); readers (summarize, triage,
   distill path, replay) accept both `.json` and `.json.gz` transparently. Lossless per
   Colton's caveat — proven, not asserted (gates below). Headers/manifest stay plain (tiny,
   grep-able).
3. **Recording-cost baseline** (never-skip: baseline before optimizing) — measure featurize+
   record overhead per game; optimize ONLY if >15% of wall time, as its own evidenced slice.

**Gates**: throughput ≥ **5×** single-process baseline on the same pod mix (target ≥170
games/min at 8 workers) · same-seed same-pod game in worker vs in-process = **byte-identical
rows** (determinism survives the pool) · gz round-trip byte-equality test + summarizeGrind
parity on a mixed plain/gz store · 1k-game census: no new breakage classes at scale · suite+
lint · cancel/cap behavior pinned by tests.

## Wave 3 — ROWS v2 (Colton call #3: richer rows, versioned)

1. **Decision-equality sub-anchor FIRST** — a probe hashing only `{turn,seat,action}` per row
   (decisions, not row payloads). Recorded ×2 before the row change; it must hold
   byte-identical through wave 3 (rows grow; decisions must not move). The full-row anchor
   re-anchors ONCE, documented old→new per lineage law.
2. **Row v2 additions** (additive; `schemaVersion: 3`): `legal` (count + kind histogram of
   the offered action set — what was rejected matters for policy learning), `rank` (chosen
   action's index in the engine's own ordering), stack depth, and **FEATURE_KEYS v2** dims:
   commander zone/castability, graveyard/exile counts, permanents-by-type splits,
   threat-on-stack flag, phase one-hot. Old readers unaffected (additive keys).
3. **Per-card grind evidence table** — the corpus roadmap's blend-ranking feed: aggregate
   per-card cast counts, breakage hits (spell-unresolved / trigger classes / stuck-adjacent),
   and pendingArbiter routing from the store into `grind-card-evidence.json` + a small CLI.
   This is the first "interpretation" artifact and unblocks Omnath's re-ranking each session.

**Gates**: decision-equality sub-anchor byte-identical ×2 across the change · full-row anchor
re-anchored once with lineage · suite+lint · tier fp 0-diff · row-v2 schema tests · gz size
delta measured (rows grow; compressed budget must stay ≤1 MB/game) · evidence table spot-
checked against 3 known cards' oracle text · **COMMS post** (schema v3) before shipping.

## Wave 4 — INTERPRETATION (Colton proof #3: reports a human reads)

1. **Promote the analyzer** — lift `analyzeGame()` from `play-quality-probe.mjs` into
   `src/lib/learn/gameAnalyzer.js` (shared by probe, reports, and future P5/P7/P9 — absorbs
   backlog P5's core).
2. **Deck Reality Report over the grind store** — per deck: curve reality vs list, dead-turn
   rate + causes, casts/lands per game, mulligan keep rate + outcomes, NEVER-CAST cards,
   combat trade quality; **matchup matrix** (P4 pattern over grind headers: A's win rate in
   pods containing B, Wilson CIs, honest counts); **persona splits** (playbook × temperament ×
   pilotType); trends by engineVersion.
3. **Surface it** — Sim Center: grind results panel grows a per-deck drill-in + report
   download; standings gain Wilson CIs (wilsonInterval already exported) and a
   seat-distribution sanity strip (post-wave-1 it should be ~flat).

**Gates**: suite+lint · analyzer parity test (probe's numbers unchanged after the lift) ·
report numbers reconcile with summarizeGrind totals on the same store · **Colton eyeball
gate**: reports for 3 decks he knows cold (Vihaan, Rograkh/Thrasios, Omnath) read true to
table reality — his sign-off is the wave's exit.

### Stage-A readiness checklist (end of wave 4 — verify before wave 5 starts)
- [ ] ≥10k post-wave-1 games (seat-rotated, schema ≥2) in the store — the tuning dataset
- [ ] stuck rate <2% or triaged with named causes
- [ ] standings with CIs stable across two ≥5k-game seeded runs (Spearman ≥0.9 on 15 decks —
      Colton proof #2, first measurement)
- [ ] A/B probe + census + anchors all green on the current tree (the instruments work)

## Wave 5 — STAGE A: tune the autopilot FROM the data (Colton proof #1)

1. **Diagnosis-only deliverable first** (R11 law): `HARNESS-TUNE-DIAGNOSIS.md` — mine the
   store for ranked autopilot pathologies with costs (dead turns by cause, mulligan keeps
   that correlate with losses, attack/block EV errors vs outcomes, mana-open-but-unspent
   patterns, never-cast-but-should signals from row-v2 `legal`). Each mechanism: evidence
   rows, root-cause chain, proposed lever, expected metric. NOTHING implemented in the
   diagnosis pass.
2. **Tune 2–4 levers**, each as its own POLICY_KEYS-registered slice with a `"v1"` legacy
   arm (recoverable forever), built smallest-first.
3. **Per-slice gates** (playbook §3 AI-slice row, in full): isolated A/B
   (`--legacy=<key>`, ≥500 games) non-negative · default grid NEW ≥ OLD · dead turns not up ·
   census: no new breakage classes · anchor re-anchored once with lineage.

**Stage-A acceptance (Colton proof #1)**: tuned default vs pre-plan default —
**≥55/45 over ≥500 seeded mirror games**, all-decisive, dead turns flat-or-better.
**+ Colton proof #2 re-run**: standings reproduce (Spearman ≥0.9) under the tuned default.

### Stage-B readiness checklist (verify before wave 6)
- [ ] Row v2 + schema v3 data ≥20k games; featuresV stable across the tuning wave
- [ ] Replay determinism PROVEN (internal gate): N sampled stored games re-run from header
      (seed+pilots+engineVersion) → byte-identical rows — makes "regenerable" true and
      pruning safe
- [ ] Labels audited (HB-3 pattern): per-seat FATE labels correct on a hand-checked sample;
      null-and-dropped verified for every non-decisive class

## Wave 6 — STAGE B: pipeline e2e proof + the clean Omnath distill pass

1. **Dataset builder** — `scripts/build-training-matrix.mjs`: store → training matrix
   (per-row: featuresV2 vector + legal-kind histogram + action + joined outcome label from
   header; trusted games only; deterministic train/held-out split by seed parity; dataset
   card written alongside: row counts, class balance, featuresV, schema, git SHA).
2. **Leakage + sanity audits** — no outcome-derived features; per-seat label correctness
   tests; distribution drift check across engineVersions in the pool.
3. **Signal sanity ("dry train")** — a trivial logistic baseline fit in Node on the matrix
   must beat coin-flip calibration on held-out games (proves the data carries learnable
   signal BEFORE any ML infra exists).
4. **The clean Omnath handoff** (Colton's explicit ask): COMMS contract post covering schema
   v3 + gz + `decks` + featuresV2 + the evidence table; a REAL distill dry-run end-to-end
   (Omnath consumer reads sealed shards → distills → `markShardParsed` → `pruneParsedShards`
   reclaims raw with headers intact — witnessed, not assumed); the per-card evidence table
   wired into their corpus blend-ranking loop.

**Stage-B acceptance**: dataset card + audits green · dry-train beats coin-flip on held-out ·
replay determinism held on the post-prune store (headers regenerate pruned games) · Omnath
confirms distill consumed a sealed shard cleanly in COMMS.

### Stage-C readiness checklist (verify before wave 7 is even scheduled)
- [ ] Everything in Stage-B acceptance, re-verified on the LATEST store
- [ ] ≥50k trusted, seat-rotated, v3-schema games (net-scale data)
- [ ] Eval harness design reviewed: net-guided pilot vs tuned default through the SAME A/B
      instrument (the net must beat Stage A's winner, not the old baseline)

## Wave 7 — STAGE C: the value net (planned, not built here)

Scope sketch only (its own mission file when Stage C readiness is green): win-probability
net on featuresV2 (+legal histogram), trained on the matrix (RTX 5080; Python/ONNX sidecar
for training, ONNX-runtime or a distilled table for LOCAL-FIRST inference in the exe — no
runtime cloud/net dependency, per the prime directive); evaluated ONLY through the A/B
instrument vs the Stage-A tuned default; ships behind a POLICY_KEYS arm like every other
policy. The Omnath recall/case-memory lane continues in parallel on the distill artifacts —
learning ownership per `agent-learning-ownership` memory (Omnath stewards it).

---

## Explicitly ABSORBED from / ALIGNED with existing queues
- UPGRADE-BACKLOG **P5** (Deck Reality Report) → wave 4. **P4**'s matchup pattern → wave 4
  over the grind store. **P2-parked** replay scrubber + **P7** Spectate + **P9** Puzzle miner:
  stay parked; waves 3–4 build the exact substrate they need (analyzer, row v2, replay
  determinism) — note added to the backlog when this plan lands.
- `memory/orders/cindy-corpus-roadmap.md` (Omnath, Colton-approved): its blend ranking is a
  CONSUMER of wave 3's evidence table; the coverage lane and this lane stay separate locks.
- p3-p7-p9 backlog order: unchanged; benefits later.

## Standing constraints (all waves)
- One-owner COMMS lock per broad wave; contract/schema changes post to COMMS BEFORE shipping.
- Suite (`npx vitest run`, never MTG_APP_ROOT) + lint 0-warnings + tier fp LOST=0 GAINED=0 +
  trajectory anchor discipline (§2.1 lineage law) every wave.
- Scripts always MTG_APP_ROOT; anchors compared only within one data root; the CURRENT root's
  anchor gets re-derived at P0 of the first execution session (shelf changed since the last
  recorded anchor).
- Grind #2 (pid 32744) finishes before wave-1 store-shape changes ship (never mutate the
  store under an active writer); reports/analysis over the existing store may proceed anytime.
- Two identical failures = stop, /investigate. Park with analysis, never half-fix.

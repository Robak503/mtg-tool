# PLAY-HARNESS OVERHAUL — running work log

> The wave-by-wave evidence log of the play-harness + headless-system + AI-players overhaul
> (Colton, 2026-07-03: "full rehaul… full notes and work logs so future non-Fable agents can
> replicate this style of work"). Method spine: OVERHAUL-PLAYBOOK.md (§2 recipes, §3 proof
> levels). Session context: runs in the Omnath session under a one-owner lock (COMMS
> "Omnath 4") — it holds the R11 pilot diagnosis this pass consumes. Companion docs land at
> P5 (PLAY-HARNESS-OVERHAUL-PLAYBOOK.md). Every number here is re-runnable from §2 commands.

## P0 — master verified + baselines (2026-07-03, main tree @ b59c3b7e)

| Baseline | Value | Command |
|---|---|---|
| Suite anchor | **7,503 passed / 512 files / 28.9s** | `npx vitest run` (app/, NO MTG_APP_ROOT) |
| Tier-1 pod batch (games-per=3) | **1.56s wall**, 3/3 complete, avg 51.3 turns | §2 self-play.mjs standard pod (MTG_APP_ROOT=AppData — see note) |
| Trajectory hash | **`0c75d0de2d1b32996e4a702bb3fbdd85fef01b9347c0a4334fc978010ef9ad50`** — byte-identical ×2; 3 games / 8,014 rows / ai-wins×3 | §2 spec probe (scratchpad script, recreate per PLAYBOOK) |
| Breakage census (pod) | 15 entries: Aberrant ×9 `trigger-removed-no-target`, Ember Island Production ×2 + Reality Shift + Teferi's Protection `spell-unresolved`, Garruk's Uprising ×2 | same pod run report |
| Play-quality A/B (new vs `policy:"v1"`) | **NEW 58.3% / OLD 41.7%** (60 mirror games, all decisive); dead turns 0.02 vs 0.37; X-sizing 4.74 vs 1.00; **flags: NEW blocks ≈ never (0.12 vs 4.35/game) · Rograkh/Thrasios mirror ~315s vs ~2s others (perf pathology)** | `play-quality-probe.mjs` (default config) |
| Pilot-side reference | R11 diagnosis (pilots lose 17–33% on interaction to the default AI; 5 mechanisms) | `omnath-tools/pilots/R11-DIAGNOSIS.md`, rerun `node pilots/r11-diagnose.mjs 6` |

**Baseline deviation note:** the §2 recipes assume dev-tree profile registrations
(`--ids=colton-…`). The dev tree's profile store is POLLUTED (~90 test "Bob" profiles;
`prof_65a43f93` decks.local.json is 0 bytes as of 07-03 03:37) — all P0 runs used
`MTG_APP_ROOT=%APPDATA%/com.colton.mtg-tool` (read-only) instead. Root-causing the polluter +
repairing the dev registration is a P2 wave (P1 scan estate `runner-data` owns the design).

**Incidents (P0):**
- The session's original git worktree had been swept to an EMPTY directory; a branch checkout
  from inside it fell through to the MAIN repo and moved its branch pointer (same commit — zero
  file changes; restored to `master` immediately). **Rule: `git rev-parse --show-toplevel`
  before any branch op; never trust a worktree dir you haven't just listed.**
- Work now lives in a dedicated worktree: `.claude/worktrees/play-harness`
  (branch `claude/play-harness-overhaul`, node_modules junctioned to main — junction-delete
  before any worktree removal, per the standing hazard).

## Scope locks (from the /goal args + unlocked parked items)

1. Harness rehaul: act()/nextDecision instrumentation threading · session-layer policy A/B
   exposure · PENDING_CHOICE_KINDS contract truth (runtime ~19-20 vs doc 13) · seed/seat/pilot
   rotation + attribution · dev-tree profile repair + test-write guard · trajectory export
   enrichment.
2. Engine AI: the ON-HOLD-until-Omnath-pass W6-equip/W7b-e/W8 opponentAI slices (now unlocked)
   + the alt-cost OFFER subsystem (alt-cost-design.md) + tutor mandatory-search decline + scan
   finds. **Every AI change ships with play-quality-probe A/B evidence** (§3: trajectory hash
   re-anchors, documented).
3. Pilot base layer (omnath-tools/pilots): H1–H8 from R11, each re-gated by the r11-diagnose
   rerun + vs-default re-measure.
4. Contracts: PLAY-API-CONTRACT v1.1 (kinds truth, instrumentation opts, §2 table additions
   Q4) — COMMS-posted before shipping.
5. No coverage growth: tier flip-diff LOST=0 GAINED=0 all pass (any tier movement = a bug).

## P1 — scan complete (31 agents; 62 findings kept, 0 refuted; full ledger in session artifacts)

**Wave plan (locked 2026-07-03):**
| Wave | Scope (finding ids) | Gate |
|---|---|---|
| A1 test-isolation | HB-1 env scrub + tripwire + dev-tree repair · HB-2 atomic migration | suite+lint, all fp 0-diff, deliberate-leak repro |
| A2 instrumentation threading | SD-1/PS-2/ENG-FLAG-1 (~45 apply* sites + act()) · SD-2 turn-boundary · PS-3 pilots opt | trajectory hash BYTE-IDENTICAL on default paths + new threaded-path tests |
| A3 session correctness | SD-3 off-turn ask wedge · SD-4 wire strip · SD-5/PS-4 policy exposure · SD-6 stale-submit guard | suite + new pins; hash identical (defaults untouched) |
| A4 runner data quality | HB-3 pod label bug · HB-4 seed discipline · HB-5 deck/seat/pilot rotation · HB-6 pairing coverage (+HB-7 measurement) | hash RE-ANCHORS (documented old→new); label-correctness tests |
| B1 AI correctness | AI-F1 kicked-target bypass · AI-F2 low-confidence waste · AI-F11 probe key drift · AI-F12 X-group routing | A/B probe + suite |
| B2 AI parked slices | AI-F3 equip/activated · AI-F4 wipes · AI-F5 fog · AI-F6 auras · AI-F7 pump · AI-F9 mulligan-on · AI-F10 tutor decline | A/B probe per slice (win-rate + dead-turn evidence) |
| B3 alt-cost OFFER | ALT-1..8 (corrected design: twin post-pass, altCost marker, 16 HIGH carriers, 15 MUST-NOT-OFFER canaries, conservative AI filter, pol.altCost key) | tier fp 0-diff (play-quality only) + A/B counter-usage evidence |
| C pilots base layer | PILOT-W0 duel.mjs prerequisite → H1..H8 | r11-diagnose re-gate per fix; final vs-default + pod re-measure |
| D perf | pathology (hunter in flight) · GC/alloc lane · targeting.js pick · HB-9 export streaming · HB-11 stats scan · SD-8 split (maybe) | §3 pure-perf: hash byte-identical + before/after numbers |
| E contract v1.1 | PS-1 kinds=20 truth · PS-5 Q4 table · PS-6 vocabulary · PS-7 versioning discipline | doc + canaries both sides + COMMS post |

Serialization: lane A waves share learnSession/gameApi (serial); lane B owns opponentAI (serial); lane C is a different repo (parallel); D after the pathology report; E after A2/B features settle. Concurrency cap ≤2 builder lanes live at once (standing hazard).

## D — perf pathology ROOT-CAUSED (hunter report, 2026-07-03)

**Rograkh/Thrasios mirror OOM/300s = one mechanism:** Candelabra of Tawnos / Magus of the
Candelabra ("Untap X target lands") → γ1f X-loop (legalChoices.js:1259-1311, x→10) →
X-count targeting (targeting.js:204 → :77) where `kCombinations` **fully materializes all
C(n,x) index-arrays before the MAX_CAST_EXPANSIONS=64 cap sees a row**. 4-seat mirror pools
n=32 lands → C(32,10)=64,512,240 arrays ≈ 7-8GB live in ONE call → OOM (12.2GB observed);
sub-critical n gives the ~300s GC-bound regime (fast-game profile: GC 30% + pick 24.4%).
Degenerate seed: batch idx 1 (seed 2654435762). Refuted: log/decision accumulation, counter
wars, time-pressure failure.

**Fix (D1, pre-proven by the hunter's in-memory A/B):** thread remaining capacity into the
kCombinations DFS (targeting.js, ~10 LOC; also the modal site :293). Ascending order ⇒
identical first-64 prefix ⇒ **action-set sha256 identical on all completable games**; batch
OOM/~300s → **3.4s total, ~220MB peak**. Proof level: pure-perf (trajectory hash byte-identical).

**Follow-ups routed:** detectArchetype re-derivation memo → lane B (AI-F8 territory) ·
offered-X-subset QUALITY (lexicographic first-64 = AI never sees most subsets; ~600-action
windows) → play-quality re-anchor lane, after B3 · padded-mirror shared card-id aliasing
(selfPlayRunner.js:601-607 / gameState.js:369) → lane A4 watch-item + test.

### ✅ D1 SHIPPED (rolling 193519dd) — kCombinations bounded at the cap
Rograkh 4-game batch **OOM/~300s → 2.9s, peak ~357MB** (was a single 7-8GB allocation).
Behavior-safety: trajectory hash == baseline `0c75d0de…` byte-for-byte (×2 runs) · tier/program/
runtime fingerprints 0-diff · suite 7,503→7,508 (5 new combination-parity + OOM-guard tests,
verified against an independent successor-generator reference) · lint clean. Integration
re-battery on the rolling branch: 7,508 green + lint. Build worktree removed junction-safe.

## ⏸️ PASS PAUSED (session cap, Colton 2026-07-03) — RESUME PROTOCOL

**State at pause:** rolling branch `claude/play-harness-overhaul` @ dc394d73 (P0 baselines + P1
plan + D1 SHIPPED, suite 7,508 green). Build lanes stopped POST-COMMIT, pre-integration:
- `build-a1` worktree @ **585f3730** (HB-1 env scrub + tripwire, HB-2 atomic migration) — clean.
- `build-a2` worktree @ **9349f507** (SD-1/SD-2/PS-2/PS-3/ENG-FLAG-1 threading) — clean.
- `a2-baseline` worktree (detached, A2's fingerprint baseline) — check junction before ANY removal.
- Lane C (omnath-tools/pilots, W0+H1–H4): partial, but `pilots/test-all.mjs` ALL GREEN at pause;
  unknown which H-fixes landed — VERIFY-THEN-COMPLETE against `p1-confirmed.json` ids
  PILOT-W0/H1/H2/H3/H4 (durable copy: omnath-tools/overhaul-2026-07-02/… + session tasks dir).

**Resume (any session):** boot /omnath → read this log top-to-bottom → then:
1. Integrate A1+A2: from the rolling worktree `git cherry-pick 585f3730 9349f507` → full battery
   (suite ≥7,508 + lint + tier/program/runtime 0-diff + trajectory hash — A2 default path MUST
   equal `0c75d0de…`; A1's leak-repro + A2's threaded-path tests must exist — if the agents died
   before adding tests, ADD them before integrating) → remove build worktrees junction-safe
   (`cmd //c rmdir <wt>/app/node_modules` first if a junction exists).
2. Lane C verify-then-complete (H-fix numbers vs R11 baselines: 0.00 untapped / 43 self-counters /
   27 chumps / 23 suicides), then H5–H8 + vs-default + pod re-measure.
3. Next waves per the P1 plan table: A3 (SD-3 wedge!, SD-4/5/6) → A4 (HB-3 label bug!, HB-4/5/6)
   ∥ B1 (AI-F1/F2/F11/F12) → B2 (W-slices) → B3 (alt-cost OFFER) → E contract v1.1 → P5 docs →
   P6 release (ships the 123 unreleased grind commits too).
**Findings ledger:** session tasks dir `p1-confirmed.json` (62 findings, full designs). One-owner
lock: COMMS "Omnath 4" — grind chat stays paused until this pass posts its handoff.

### ✅ A1+A2 INTEGRATED (rolling @ 189d6f5e) — battery perfect
A1 (5502912c): HB-1 vitest env scrub + dev-data tripwire (tests can never again write a real
data root — the P0 class that polluted the dev tree and could have hit AppData) + HB-2 atomic
migration writes; the one-time dev-tree repair was executed (fixtures backed up + removed).
A2 (189d6f5e): instrumentation opts threaded through act()/all settlers (~45 sites), session-state
turn-boundary stamp (no double time-pressure), createGame honors `pilots` (PS-3) — caller-driven
v1 games are now FULLY instrumented end-to-end (gameApiInstrumentation.test.js pins it).
Battery: suite **7,523** (515 files) · lint clean · tier/program/runtime **0-diff** · trajectory
hash **== `0c75d0de…` byte-for-byte** · main tree clean.

### ✅ A3+B1 INTEGRATED (rolling @ b74214c1) — suite 7,558; NEW HASH ANCHOR
A3 (258df475): SD-3 off-turn pending-window wedge FIXED (controller-based validation + repro pins) ·
SD-4 real wire strip (`decisionWire.js`, 4 routes — `choose` had none; resume/effectAtoms/queue no
longer leak) · SD-5/PS-4 policy A/B seam live end-to-end (createGame({policy}) → pickAction; v1 arm
proven divergent, null default proven byte-identical) · SD-6 stale-submit guard. PLAY_API_VERSION →
1.2.0 (additive). +25 pins.
B1 (b74214c1): AI-F1 kicked-cast target discipline (never self-targets; kicked/unkicked parity pins) ·
AI-F2 unresolvable-spell hold — **pod census spell-unresolved 4 → 0** (15→12 entries) · AI-F11 probe
keys derived from POLICY_KEYS (+ new 'unresolvable' key, 'v1' recovers legacy) · AI-F12 mixed-X decline
fallback. A/B probe: NEW 55.0% / OLD 45.0%, dead turns 0.02. +10 pins.
**Trajectory-hash anchor RE-BASED (AI change, documented): `0c75d0de…` → `1c7e3a9d…`**
(games=3 rows=8204, ×2 reproducible; combined A3+B1 battery: suite 7,558/519 files · lint clean ·
tier/program/runtime 0-diff at pick time · main tree clean). Build worktrees swept junction-safe
(incl. build-a2's leftover junction — removed via rmdir first; main node_modules verified intact).

### ✅ LANE C COMPLETE (omnath-tools/pilots) — all R11 mechanisms eliminated, P4 DONE
W0 duel.mjs + H1–H8 verified/completed/built (H1 needed a playbook-layer completion: 4 playbooks
penalized `pass` and re-inverted tap-vs-pass — fixed via standingPat()). Same-seed r11-diagnose:
divergence 2,559→**188** (1.5%) · taps 2,271→**0** · untapped-off-turn 0.00→**3.18** · counters
offered 0%→**25.7%** · self-counters 43→**0** · chumps 27→**1** · suicides 23→**0** · junk
removal→**0** · land picks 71→**0** · X-sizing 0 rows. **vs-default: interaction 18/36 (parity ±10
met; was 17–33%), ramp 27/36 = 75% (was 50%)**. Pod 12/12, 0 weight-0, 2,578 trust-gated cases.
Pilots tests 160→**190** + memory 26 + dryrun 12 + lab smoke. Parked-with-evidence: global
exact-tie name tiebreak (fixed lands 56→0 but contaminated tied attacks 5→42 — reverted to
land-pairs-only; recorded in R11-DIAGNOSIS.md). Honest residuals: casting-order style divergence
(out of H-scope) · inheritor 4/12 on 1v1 interaction (its flags are 4P-shaped) · pod win spread
deck-skewed (Zaxara 7/12) — future-wave candidates, not defects.
